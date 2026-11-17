import { createHash } from 'node:crypto'
import { Queue, Worker } from 'bullmq'
import { createClient } from '@supabase/supabase-js'

for (const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','REDIS_URL','SEARXNG_BASE_URL']) {
  if (!process.env[key]) throw new Error('Missing required environment variable: ' + key)
}
const dailyTargetRaw = Math.max(1000, Number(process.env.OMNISIGHT_TARGET_DAILY_RAW || 100000))
const dailyTargetCandidates = Math.max(1000, Number(process.env.OMNISIGHT_TARGET_DAILY_CANDIDATES || 100000))
const searchPageCount = Math.max(1, Math.min(5, Number(process.env.SEARCH_PAGES_PER_QUERY || 3)))
const searchConcurrency = Math.max(1, Math.min(5, Number(process.env.SEARCH_CONCURRENCY || 3)))
const candidateConcurrency = Math.max(1, Math.min(30, Number(process.env.WORKER_CONCURRENCY || 10)))
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const redisUrl = new URL(process.env.REDIS_URL)
const connection = { host: redisUrl.hostname, port: Number(redisUrl.port || 6379), username: decodeURIComponent(redisUrl.username || ''), password: decodeURIComponent(redisUrl.password || ''), maxRetriesPerRequest: null, enableReadyCheck: false, ...(redisUrl.protocol === 'rediss:' ? { tls: {} } : {}) }
const searchQueue = new Queue('valorax-omnisight-search', { connection })
const candidateQueue = new Queue('valorax-omnisight-candidates', { connection })
const sourceCache = new Map()
const endpoint = new URL('/search', process.env.SEARXNG_BASE_URL)
const passes = [
 ['hypercar','hypercar auction lot live upcoming estimate rare'],
 ['classic_car','classic car auction lot live upcoming estimate rare'],
 ['racing_car','historic racing car auction lot auction estimate'],
 ['watch','rare luxury watch auction lot upcoming estimate'],
 ['fine_art','fine art painting auction lot upcoming estimate'],
 ['sculpture','rare sculpture decorative art auction lot estimate'],
 ['jewellery','exceptional jewellery gemstone auction lot estimate'],
 ['coin','rare coin banknote auction lot estimate'],
 ['historical_artifact','historical artifact antiquities auction lot estimate'],
 ['collectible','rare collectible memorabilia auction lot estimate'],
 ['yacht','superyacht yacht auction listing asking price'],
 ['aircraft','private aircraft helicopter auction listing price'],
 ['real_estate','luxury estate trophy real estate auction listing price'],
 ['business','business equity company stake auction listing price'],
]
function safeUrl(value) {
 try {
  const u=new URL(value)
  if(u.protocol!=='https:'||!u.hostname.includes('.')||u.username||u.password||u.pathname==='/') return null
  const host=u.hostname.toLowerCase().replace(/^www\./,'')
  if(['google.com','bing.com','duckduckgo.com','searxng.org'].includes(host)) return null
  for(const k of [...u.searchParams.keys()]) if(/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i.test(k)) u.searchParams.delete(k)
  u.hash=''
  return {url:u.href,host}
 } catch { return null }
}
const robotsCache = new Map()
const MAX_PAGE_BYTES = 1_500_000
const PAGE_USER_AGENT = 'VALORAX-OmniSightBot/1.0 (+https://valorax.netlify.app)'

async function getSource(host) {
 if(sourceCache.has(host)) return sourceCache.get(host)
 let {data,error}=await db.from('omnisight_lot_sources')
  .select('id,domain,access_status,terms_status,automated_access_allowed,robots_url,crawl_delay_ms,max_requests_per_hour')
  .eq('domain',host).maybeSingle()
 if(error) throw new Error('SOURCE_LOOKUP_FAILED')
 if(!data) {
  const inserted=await db.from('omnisight_lot_sources').insert({
   domain:host,display_name:host,source_type:'other',access_method:'public_search_discovery',
   access_status:'pending_review',terms_status:'unknown',automated_access_allowed:false,
   enabled:false,crawl_delay_ms:1000,max_requests_per_hour:1
  }).select('id,domain,access_status,terms_status,automated_access_allowed,robots_url,crawl_delay_ms,max_requests_per_hour').single()
  if(inserted.error||!inserted.data) {
   const retry=await db.from('omnisight_lot_sources')
    .select('id,domain,access_status,terms_status,automated_access_allowed,robots_url,crawl_delay_ms,max_requests_per_hour')
    .eq('domain',host).maybeSingle()
   if(retry.error||!retry.data) throw new Error('SOURCE_REGISTER_FAILED')
   data=retry.data
  } else data=inserted.data
 }
 sourceCache.set(host,data)
 return data
}
function decodeHtml(value) {
 return String(value || '').replace(/&amp;/g,'&').replace(/&quot;/g,'"')
  .replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>')
  .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
  .replace(/&#x([\da-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)))
}
function tagAttributes(tag) {
 const attrs={}
 for(const m of tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attrs[m[1].toLowerCase()]=decodeHtml(m[2]??m[3]??m[4]??'')
 return attrs
}
function metaValue(html, keys) {
 for(const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
  const a=tagAttributes(tag[0]), key=(a.property||a.name||a.itemprop||'').toLowerCase()
  if(keys.includes(key) && a.content) return a.content.slice(0,3000)
 }
 return ''
}
function parseJsonLd(html) {
 const found=[]
 for(const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
  try {
   const parsed=JSON.parse(m[1].trim())
   const walk=(v)=>{if(!v||typeof v!=='object')return;if(Array.isArray(v)){v.forEach(walk);return}found.push(v);for(const x of Object.values(v))if(x&&typeof x==='object')walk(x)}
   walk(parsed)
  } catch {}
 }
 return found
}
function asText(v) {
 if(typeof v==='string')return decodeHtml(v).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim()
 if(v&&typeof v==='object'&&typeof v.name==='string')return asText(v.name)
 return ''
}
function isoDate(v) {
 if(typeof v!=='string')return null
 const d=new Date(v)
 return Number.isFinite(d.getTime())?d.toISOString():null
}
function extractLotPage(html, pageUrl, fallbackTitle) {
 const nodes=parseJsonLd(html)
 const node=nodes.find(n=>/Event|Product|Vehicle|IndividualProduct/i.test(String(n['@type']||'')))||nodes[0]||{}
 const title=metaValue(html,['og:title','twitter:title'])||asText(node.name)||
  decodeHtml((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'')||fallbackTitle
 const description=metaValue(html,['og:description','description','twitter:description'])||asText(node.description)
 const rawImages=[]
 const addImage=(v)=>{if(typeof v==='string')rawImages.push(v);else if(Array.isArray(v))v.forEach(addImage);else if(v&&typeof v==='object'){if(v.url) addImage(v.url);else if(v.contentUrl)addImage(v.contentUrl)}}
 addImage(metaValue(html,['og:image','twitter:image']))
 addImage(node.image)
 for(const n of nodes) if(n.image)addImage(n.image)
 const images=[...new Set(rawImages.map(v=>{try{const u=new URL(v,pageUrl);return u.protocol==='https:'?u.href:null}catch{return null}}).filter(Boolean))].slice(0,12)
 const event=nodes.find(n=>/Event/i.test(String(n['@type']||'')))||node
 const start=isoDate(event.startDate)||isoDate(metaValue(html,['event:start_time','startDate']))
 const end=isoDate(event.endDate)||isoDate(metaValue(html,['event:end_time','endDate']))
 const location=asText(event.location)||asText(event.location?.name)||asText(event.location?.address)
 const lotNumber=asText(node.sku)||asText(node.productID)||metaValue(html,['product:retailer_item_id','lotnumber','lot-number'])
 const date=start?start.slice(0,10):null
 const patch={}
 if(title&&title.length<500)patch.title=title.slice(0,500)
 if(description)patch.short_factual_summary=description.slice(0,1200)
 if(lotNumber)patch.lot_number=lotNumber.slice(0,100)
 if(date)patch.sale_date=date
 if(start)patch.auction_starts_at=start
 if(end)patch.auction_ends_at=end
 if(location)patch.location=location.slice(0,300)
 if(images.length){patch.hero_image_url=images[0];patch.image_urls=images;patch.image_usage_status='unknown'}
 return patch
}
async function robotsAllows(url) {
 const host=url.hostname.toLowerCase()
 const cached=robotsCache.get(host)
 if(cached&&Date.now()-cached.at<60*60*1000)return cached.allowed
 let allowed=true
 try {
  const robotsUrl='https://'+host+'/robots.txt'
  const response=await fetch(robotsUrl,{headers:{'User-Agent':PAGE_USER_AGENT},signal:AbortSignal.timeout(5000),redirect:'error'})
  if(response.status===401||response.status===403)allowed=false
  else if(response.ok){
   const text=await response.text()
   let applies=false, best=0, denied=[]
   for(const raw of text.split(/\r?\n/)){
    const line=raw.split('#')[0].trim();if(!line)continue
    const ix=line.indexOf(':');if(ix<0)continue
    const field=line.slice(0,ix).trim().toLowerCase(),value=line.slice(ix+1).trim()
    if(field==='user-agent'){
     if(applies&&best>0)continue
     applies=value==='*'||PAGE_USER_AGENT.toLowerCase().includes(value.toLowerCase())
     if(applies)best=value.length
    } else if(applies&&field==='disallow'&&value)denied.push(value)
   }
   if(denied.some(path=>url.pathname.startsWith(path)))allowed=false
  }
 } catch { allowed=false }
 robotsCache.set(host,{allowed,at:Date.now()})
 return allowed
}
async function fetchPageHtml(url) {
 const response=await fetch(url,{headers:{'User-Agent':PAGE_USER_AGENT,Accept:'text/html,application/xhtml+xml;q=0.9'},signal:AbortSignal.timeout(12000),redirect:'follow'})
 if(!response.ok)throw new Error('LOT_PAGE_HTTP_'+response.status)
 const finalUrl=new URL(response.url||url),original=new URL(url)
 if(finalUrl.protocol!=='https:'||finalUrl.hostname.toLowerCase().replace(/^www\./,'')!==original.hostname.toLowerCase().replace(/^www\./,''))throw new Error('LOT_PAGE_REDIRECT_HOST_CHANGED')
 if(!(response.headers.get('content-type')||'').toLowerCase().includes('text/html'))throw new Error('LOT_PAGE_NOT_HTML')
 const length=Number(response.headers.get('content-length')||0)
 if(length>MAX_PAGE_BYTES)throw new Error('LOT_PAGE_TOO_LARGE')
 const reader=response.body?.getReader()
 if(!reader)throw new Error('LOT_PAGE_EMPTY')
 const chunks=[];let total=0
 while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX_PAGE_BYTES){await reader.cancel();throw new Error('LOT_PAGE_TOO_LARGE')}chunks.push(value)}
 const bytes=new Uint8Array(total);let offset=0
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
 return new TextDecoder().decode(bytes)
}
async function enrichLotPage(item, source, lotId) {
 if(!source.automated_access_allowed||source.access_status!=='approved'||
  !['permitted','licensed','permission_granted'].includes(source.terms_status))return {enriched:false,reason:'SOURCE_NOT_APPROVED'}
 const url=new URL(item.url)
 if(url.hostname.toLowerCase().replace(/^www\./,'')!==source.domain.toLowerCase().replace(/^www\./,''))return {enriched:false,reason:'SOURCE_HOST_MISMATCH'}
 const delay=Math.max(1000,Number(source.crawl_delay_ms||1000))
 const lastKey='valorax:omnisight:last-page-fetch:'+source.domain
 const last=await candidateQueue.client.then(c=>c.get(lastKey))
 if(last&&Date.now()-Number(last)<delay)return {enriched:false,reason:'SOURCE_CRAWL_DELAY'}
 const hourKey='valorax:omnisight:page-fetch-hour:'+source.domain+':'+new Date().toISOString().slice(0,13)
 const count=await candidateQueue.client.then(c=>c.incr(hourKey))
 if(count===1)await candidateQueue.client.then(c=>c.expire(hourKey,7200))
 if(count>Math.max(1,Number(source.max_requests_per_hour||1)))return {enriched:false,reason:'SOURCE_HOURLY_LIMIT'}
 if(!await robotsAllows(url))return {enriched:false,reason:'ROBOTS_DISALLOW'}
 await candidateQueue.client.then(c=>c.set(lastKey,String(Date.now()),'EX',3600))
 const html=await fetchPageHtml(item.url)
 const patch=extractLotPage(html,item.url,item.title)
 if(!Object.keys(patch).length)return {enriched:false,reason:'NO_STRUCTURED_DETAILS'}
 patch.last_checked_at=new Date().toISOString()
 patch.updated_at=new Date().toISOString()
 const {error}=await db.from('omnisight_discovered_lots').update(patch).eq('id',lotId)
 if(error)throw new Error('LOT_ENRICHMENT_FAILED: '+error.message)
 return {enriched:true,fields:Object.keys(patch)}
}
async function discover(pass) {
 const [assetClass,q]=pass
 let rawResults=0,enqueued=0
 for(let page=1;page<=searchPageCount;page++) {
  const today=new Date().toISOString().slice(0,10),rawKey='valorax:omnisight:raw-search-results:'+today
  const already=Number(await searchQueue.client.then(c=>c.get(rawKey))||0)
  if(already>=dailyTargetRaw) break
  const url=new URL(endpoint)
  url.searchParams.set('q',q);url.searchParams.set('format','json');url.searchParams.set('language','en');url.searchParams.set('safesearch','1');url.searchParams.set('pageno',String(page))
  const res=await fetch(url,{headers:{'User-Agent':'VALORAX-OmniSight/1.0 (+https://valorax.netlify.app)',Accept:'application/json'},signal:AbortSignal.timeout(20000)})
  if(!res.ok) throw new Error('SEARXNG_HTTP_'+res.status)
  const payload=await res.json(), items=Array.isArray(payload.results)?payload.results.slice(0,30):[]
  if(!items.length) break
  const total=await searchQueue.client.then(c=>c.incrby(rawKey,items.length))
  if(total===items.length) await searchQueue.client.then(c=>c.expire(rawKey,172800))
  rawResults+=items.length
  const permitted=Math.max(0,Math.min(items.length,dailyTargetRaw-(total-items.length)))
  for(const hit of items.slice(0,permitted)) {
  const safe=safeUrl(hit?.url),title=typeof hit?.title==='string'?hit.title.replace(/\s+/g,' ').trim().slice(0,500):''
  if(!safe||!title) continue
  const hash=createHash('sha256').update(safe.url).digest('hex')
  const summary=typeof hit?.content==='string'?hit.content.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,1200):null
  await candidateQueue.add('store-candidate',{url:safe.url,host:safe.host,title,summary,assetClass,hash},{jobId:'lot_'+hash,removeOnComplete:true,removeOnFail:1000,attempts:3,backoff:{type:'exponential',delay:3000}})
   enqueued++
  }
  if(items.length<10) break
 }
 return {assetClass,rawResults,enqueued}
}
async function storeCandidate(job) {
 const today=new Date().toISOString().slice(0,10),key='valorax:omnisight:candidates:'+today
 const count=await candidateQueue.client.then(c=>c.incr(key))
 if(count===1) await candidateQueue.client.then(c=>c.expire(key,172800))
 if(count>dailyTargetCandidates) return {capped:true}
 const item=job.data,source=await getSource(item.host),sourceId=source.id,now=new Date().toISOString()
 const {error}=await db.from('omnisight_discovered_lots').upsert({source_id:sourceId,source_lot_key:item.hash,canonical_url:item.url,title:item.title,asset_class:item.assetClass,listing_status:'unknown',short_factual_summary:item.summary,source_title:item.host,source_record_hash:item.hash,verification_status:'candidate',data_use_status:'review_required',first_seen_at:now,last_seen_at:now,image_urls:[],image_usage_status:'unknown'},{onConflict:'source_id,source_lot_key',ignoreDuplicates:true})
 if(error) throw new Error('CANDIDATE_UPSERT_FAILED: '+error.message)
 const {data:lot,error:lotReadError}=await db.from('omnisight_discovered_lots').select('id').eq('source_id',sourceId).eq('source_lot_key',item.hash).single()
 if(lotReadError||!lot)throw new Error('CANDIDATE_READBACK_FAILED')
 const enrichment=await enrichLotPage(item,source,lot.id)
 return {stored:true,...enrichment}
}
const searchWorker=new Worker('valorax-omnisight-search',job=>discover(job.data.pass),{connection,concurrency:searchConcurrency})
const candidateWorker=new Worker('valorax-omnisight-candidates',storeCandidate,{connection,concurrency:candidateConcurrency,limiter:{max:1000,duration:60000}})
let scheduling=false
async function scheduleBatch() {
 if(scheduling)return
 scheduling=true
 try {
  const batch=Math.floor(Date.now()/300000)
  for(const pass of passes) await searchQueue.add('search-pass',{pass},{jobId:'search_'+batch+'_'+pass[0],removeOnComplete:true,removeOnFail:500,attempts:2,backoff:{type:'exponential',delay:5000}})
  const today=new Date().toISOString().slice(0,10)
  const [rawCount,candidateCount]=await Promise.all([searchQueue.client.then(c=>c.get('valorax:omnisight:raw-search-results:'+today)),candidateQueue.client.then(c=>c.get('valorax:omnisight:candidates:'+today))])
  console.log(JSON.stringify({event:'search_batch_queued',passes:passes.length,pagesPerQuery:searchPageCount,dailyRawSearchResults:Number(rawCount||0),dailyCandidateJobs:Number(candidateCount||0),dailyTargetRaw, dailyTargetCandidates,searchConcurrency,candidateConcurrency}))
 } catch(e) { console.error('SEARCH_SCHEDULER_ERROR',e instanceof Error?e.message:'UNKNOWN') }
 finally { scheduling=false }
}
searchWorker.on('failed',(j,e)=>console.error('SEARCH_JOB_FAILED',j?.id,e.message))
candidateWorker.on('failed',(j,e)=>console.error('CANDIDATE_JOB_FAILED',j?.id,e.message))
searchWorker.on('error',e=>console.error('SEARCH_WORKER_ERROR',e.message))
candidateWorker.on('error',e=>console.error('CANDIDATE_WORKER_ERROR',e.message))
console.log(JSON.stringify({event:'omnisight_worker_started',targetDailyRawResults:dailyTargetRaw,targetDailyCandidates:dailyTargetCandidates,searchPassesPerBatch:passes.length,searchPagesPerQuery:searchPageCount,searchConcurrency,candidateConcurrency,mode:'discovery_candidates_only_no_unapproved_source_scraping'}))
await scheduleBatch()
const timer=setInterval(scheduleBatch,300000)
async function shutdown(signal) {
 console.log('OMNISIGHT_SHUTDOWN',signal);clearInterval(timer)
 await Promise.all([searchWorker.close(),candidateWorker.close(),searchQueue.close(),candidateQueue.close()])
 process.exit(0)
}
process.once('SIGTERM',()=>shutdown('SIGTERM'));process.once('SIGINT',()=>shutdown('SIGINT'))
