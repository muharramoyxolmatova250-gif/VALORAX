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
const apifyQueue = new Queue('valorax-omnisight-apify', { connection })
const sourceCache = new Map()
const APIFY_ACTOR_ID = 'crawlergang~sothebys-lot-scraper'
const APIFY_MAX_ITEMS = 50
const APIFY_MAX_CHARGE_USD = 1

async function apifyJson(path, options = {}) {
 const token=process.env.APIFY_API_TOKEN
 if(!token) throw new Error('APIFY_API_TOKEN_NOT_CONFIGURED')
 const response=await fetch('https://api.apify.com/v2'+path,{
  ...options,
  headers:{Authorization:'Bearer '+token,Accept:'application/json',...(options.headers||{})},
  signal:options.signal||AbortSignal.timeout(30000),
 })
 const body=await response.json().catch(()=>null)
 if(!response.ok) throw new Error('APIFY_HTTP_'+response.status)
 return body
}
function parseApifyNumber(value) {
 if(typeof value==='number'&&Number.isFinite(value))return value
 if(typeof value==='string') {
  const parsed=Number(value.replace(/[$,\s]/g,''))
  if(Number.isFinite(parsed))return parsed
 }
 return null
}
function apifyAssetClass(item) {
 const text=[item.title,item.department,item.brand,item.description].filter(Boolean).join(' ').toLowerCase()
 if(/\b(watch|watches|rolex|patek|cartier|timepiece)\b/.test(text))return 'watch'
 if(/\b(jewelry|jewellery|diamond|gemstone)\b/.test(text))return 'jewellery'
 if(/\b(automobilia|car|automobile|ferrari|porsche|bugatti|mclaren)\b/.test(text))return 'classic_car'
 if(/\b(furniture|design)\b/.test(text))return 'collectible'
 if(/\b(coin|numismatic)\b/.test(text))return 'coin'
 return 'fine_art'
}
function safeSothebysLotUrl(raw) {
 try {
  const url=new URL(String(raw||''))
  const host=url.hostname.toLowerCase().replace(/^www\./,'')
  if(url.protocol!=='https:'||!(host==='sothebys.com'||host.endsWith('.sothebys.com'))||url.username||url.password)return null
  if(url.pathname==='/'||/\/(?:search|results|calendar|departments?)(?:\/|$)/i.test(url.pathname))return null
  url.hash=''
  for(const key of [...url.searchParams.keys()])if(/^(utm_|fbclid$|gclid$)/i.test(key))url.searchParams.delete(key)
  return url
 } catch { return null }
}
async function importSothebysFromApify() {
 const token=process.env.APIFY_API_TOKEN
 if(!token)return {skipped:true,reason:'APIFY_API_TOKEN_NOT_CONFIGURED'}
 const input={
  mode:'search',
  query:process.env.APIFY_SOTHEBYS_QUERY || 'rare art jewelry watches',
  saleType:'upcoming',
  maxItems:APIFY_MAX_ITEMS,
  ...(process.env.APIFY_SOTHEBYS_DEPARTMENT ? {department:process.env.APIFY_SOTHEBYS_DEPARTMENT} : {}),
 }
 const started=await apifyJson('/acts/'+encodeURIComponent(APIFY_ACTOR_ID)+'/runs?waitForFinish=120&maxItems='+APIFY_MAX_ITEMS+'&maxTotalChargeUsd='+APIFY_MAX_CHARGE_USD,{
  method:'POST',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify(input),
  signal:AbortSignal.timeout(150000),
 })
 let run=started?.data||started
 if(!run?.id)throw new Error('APIFY_RUN_ID_MISSING')
 const terminal=new Set(['SUCCEEDED','FAILED','ABORTED','TIMED-OUT'])
 const deadline=Date.now()+180000
 while(!terminal.has(String(run.status||'').toUpperCase())&&Date.now()<deadline) {
  await new Promise(resolve=>setTimeout(resolve,5000))
  const status=await apifyJson('/actor-runs/'+encodeURIComponent(run.id))
  run=status?.data||status
 }
 if(String(run.status||'').toUpperCase()!=='SUCCEEDED')throw new Error('APIFY_RUN_'+String(run.status||'UNKNOWN'))
 const datasetId=run.defaultDatasetId
 if(!datasetId)throw new Error('APIFY_DATASET_ID_MISSING')
 const payload=await apifyJson('/datasets/'+encodeURIComponent(datasetId)+'/items?format=json&clean=true&limit='+APIFY_MAX_ITEMS)
 const items=Array.isArray(payload)?payload:[]
 const source=await getSource('sothebys.com','apify_actor')
 const now=new Date().toISOString()
 let stored=0,duplicates=0,filtered=0
 for(const item of items) {
  // The Actor's upcoming search also returns buy-now products. Keep auction lots only.
  if(String(item?.saleType||'').toLowerCase()!=='auction'){filtered++;continue}
  const lotUrl=safeSothebysLotUrl(item?.lotUrl)
  const title=typeof item?.title==='string'?item.title.replace(/\s+/g,' ').trim().slice(0,500):''
  const currency=String(item?.currency||'').trim().toUpperCase()
  const estimateLow=parseApifyNumber(item?.estimateLow)
  const estimateHigh=parseApifyNumber(item?.estimateHigh)
  // The public threshold is based on the LOW estimate, not the high estimate.
  // Unknown/non-USD currencies are not converted without a verified FX rate.
  if(!lotUrl||!title||currency!=='USD'||estimateLow===null||estimateLow<500000){filtered++;continue}
  const hash=createHash('sha256').update(lotUrl.href).digest('hex')
  const start=item?.auctionStartDate?new Date(item.auctionStartDate):null
  const end=item?.auctionEndDate?new Date(item.auctionEndDate):null
  const startsAt=start&&Number.isFinite(start.getTime())?start.toISOString():null
  const endsAt=end&&Number.isFinite(end.getTime())?end.toISOString():null
  if(endsAt&&new Date(endsAt).getTime()<=Date.now()){filtered++;continue}
  const listingStatus=startsAt&&new Date(startsAt).getTime()<=Date.now()?'active':'upcoming'
  const scrapedAt=item?.scrapedAt&&Number.isFinite(new Date(item.scrapedAt).getTime())?new Date(item.scrapedAt).toISOString():now
  const row={
   source_id:source.id,source_lot_key:hash,canonical_url:lotUrl.href,
   title,asset_class:apifyAssetClass(item),listing_status:listingStatus,
   make:typeof item?.brand==='string'?item.brand.slice(0,120):null,
   auction_house:"Sotheby's",lot_number:typeof item?.lotNumber==='string'?item.lotNumber.slice(0,100):null,
   sale_date:startsAt?startsAt.slice(0,10):null,auction_starts_at:startsAt,auction_ends_at:endsAt,
   estimate_low:estimateLow,estimate_high:estimateHigh,currency:'USD',
   published_value_usd:estimateLow,value_basis:'estimate_low',
   value_source_url:lotUrl.href,value_checked_at:scrapedAt,
   location:typeof item?.location==='string'?item.location.slice(0,250):null,
   short_factual_summary:typeof item?.description==='string'?item.description.replace(/\s+/g,' ').trim().slice(0,1200):null,
   identifiers:{apify_actor:APIFY_ACTOR_ID,lot_id:item?.lotId||null,sale_number:item?.saleNumber||null,department:item?.department||null},
   source_title:"Sotheby's · Apify",source_record_hash:hash,
   verification_status:'candidate',data_use_status:'review_required',
   first_seen_at:now,last_seen_at:now,updated_at:now,
   image_urls:[],hero_image_url:null,image_usage_status:'restricted',
  }
  const inserted=await db.from('omnisight_discovered_lots')
   .upsert(row,{onConflict:'source_id,source_lot_key',ignoreDuplicates:true}).select('id')
  if(inserted.error)throw new Error('APIFY_LOT_UPSERT_FAILED: '+inserted.error.message)
  if(inserted.data?.length){stored++;continue}
  const existing=await db.from('omnisight_discovered_lots').select('id').eq('source_id',source.id).eq('source_lot_key',hash).maybeSingle()
  if(existing.error||!existing.data)throw new Error('APIFY_DUPLICATE_READBACK_FAILED')
  const refreshed=await db.from('omnisight_discovered_lots').update({
   title,canonical_url:lotUrl.href,listing_status:listingStatus,estimate_low:estimateLow,
   estimate_high:estimateHigh,currency:'USD',published_value_usd:estimateLow,
   value_basis:'estimate_low',value_source_url:lotUrl.href,value_checked_at:scrapedAt,
   auction_starts_at:startsAt,auction_ends_at:endsAt,last_seen_at:now,updated_at:now,
  }).eq('id',existing.data.id)
  if(refreshed.error)throw new Error('APIFY_LOT_REFRESH_FAILED: '+refreshed.error.message)
  duplicates++
 }
 return {ok:true,runId:run.id,datasetId,received:items.length,stored,refreshed:duplicates,filtered,actor:APIFY_ACTOR_ID}
}

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

async function getSource(host, accessMethod = 'public_search_discovery') {
 if(sourceCache.has(host)) return sourceCache.get(host)
 let {data,error}=await db.from('omnisight_lot_sources')
  .select('id,domain,access_status,terms_status,automated_access_allowed,robots_url,crawl_delay_ms,max_requests_per_hour')
  .eq('domain',host).maybeSingle()
 if(error) throw new Error('SOURCE_LOOKUP_FAILED')
 if(!data) {
  const inserted=await db.from('omnisight_lot_sources').insert({
   domain:host,display_name:host,source_type:'other',access_method:accessMethod,
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
const apifyWorker=new Worker('valorax-omnisight-apify',async()=>importSothebysFromApify(),{connection,concurrency:1})
let scheduling=false
async function scheduleBatch() {
 if(scheduling)return
 scheduling=true
 try {
  const batch=Math.floor(Date.now()/300000)
  for(const pass of passes) await searchQueue.add('search-pass',{pass},{jobId:'search_'+batch+'_'+pass[0],removeOnComplete:true,removeOnFail:500,attempts:2,backoff:{type:'exponential',delay:5000}})
  if(process.env.APIFY_API_TOKEN) await apifyQueue.add('sothebys-lots-import',{}, {repeat:{pattern:'0 */6 * * *'},removeOnComplete:true,removeOnFail:50})
  const today=new Date().toISOString().slice(0,10)
  const [rawCount,candidateCount]=await Promise.all([searchQueue.client.then(c=>c.get('valorax:omnisight:raw-search-results:'+today)),candidateQueue.client.then(c=>c.get('valorax:omnisight:candidates:'+today))])
  console.log(JSON.stringify({event:'search_batch_queued',passes:passes.length,pagesPerQuery:searchPageCount,dailyRawSearchResults:Number(rawCount||0),dailyCandidateJobs:Number(candidateCount||0),dailyTargetRaw, dailyTargetCandidates,searchConcurrency,candidateConcurrency}))
 } catch(e) { console.error('SEARCH_SCHEDULER_ERROR',e instanceof Error?e.message:'UNKNOWN') }
 finally { scheduling=false }
}
searchWorker.on('failed',(j,e)=>console.error('SEARCH_JOB_FAILED',j?.id,e.message))
apifyWorker.on('completed',(j,result)=>console.log(JSON.stringify({event:'APIFY_SOTHEBYS_IMPORT_COMPLETED',jobId:j?.id,...result})))
apifyWorker.on('failed',(j,e)=>console.error('APIFY_SOTHEBYS_IMPORT_FAILED',j?.id,e.message))
candidateWorker.on('failed',(j,e)=>console.error('CANDIDATE_JOB_FAILED',j?.id,e.message))
searchWorker.on('error',e=>console.error('SEARCH_WORKER_ERROR',e.message))
candidateWorker.on('error',e=>console.error('CANDIDATE_WORKER_ERROR',e.message))
console.log(JSON.stringify({event:'omnisight_worker_started',targetDailyRawResults:dailyTargetRaw,targetDailyCandidates:dailyTargetCandidates,searchPassesPerBatch:passes.length,searchPagesPerQuery:searchPageCount,searchConcurrency,candidateConcurrency,mode:'searxng_plus_apify_sothebys_discovery',apifyConfigured:Boolean(process.env.APIFY_API_TOKEN),apifySchedule:'every_6_hours'}))
await scheduleBatch()
const timer=setInterval(scheduleBatch,300000)
async function shutdown(signal) {
 console.log('OMNISIGHT_SHUTDOWN',signal);clearInterval(timer)
 await Promise.all([searchWorker.close(),candidateWorker.close(),apifyWorker.close(),searchQueue.close(),candidateQueue.close(),apifyQueue.close()])
 process.exit(0)
}
process.once('SIGTERM',()=>shutdown('SIGTERM'));process.once('SIGINT',()=>shutdown('SIGINT'))
