import { createHash } from 'node:crypto'
import { Queue, Worker } from 'bullmq'
import { createClient } from '@supabase/supabase-js'

for (const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','REDIS_URL','SEARXNG_BASE_URL']) {
  if (!process.env[key]) throw new Error('Missing required environment variable: ' + key)
}
const dailyTarget = Math.max(1000, Number(process.env.OMNISIGHT_TARGET_DAILY_RAW || 100000))
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
async function getSourceId(host) {
 if(sourceCache.has(host)) return sourceCache.get(host)
 let {data,error}=await db.from('omnisight_lot_sources').select('id').eq('domain',host).maybeSingle()
 if(error) throw new Error('SOURCE_LOOKUP_FAILED')
 if(!data) {
  const inserted=await db.from('omnisight_lot_sources').insert({domain:host,display_name:host,source_type:'other',access_method:'permitted_public_catalogue',access_status:'pending_review',terms_status:'unknown',automated_access_allowed:false,enabled:false,crawl_delay_ms:1000,max_requests_per_hour:1}).select('id').single()
  if(inserted.error||!inserted.data) {
   const retry=await db.from('omnisight_lot_sources').select('id').eq('domain',host).maybeSingle()
   if(retry.error||!retry.data) throw new Error('SOURCE_REGISTER_FAILED')
   data=retry.data
  } else data=inserted.data
 }
 sourceCache.set(host,data.id)
 return data.id
}
async function discover(pass) {
 const [assetClass,q]=pass, url=new URL(endpoint)
 url.searchParams.set('q',q);url.searchParams.set('format','json');url.searchParams.set('language','en');url.searchParams.set('safesearch','1');url.searchParams.set('pageno','1')
 const res=await fetch(url,{headers:{'User-Agent':'VALORAX-OmniSight/1.0 (+https://valorax.netlify.app)',Accept:'application/json'},signal:AbortSignal.timeout(20000)})
 if(!res.ok) throw new Error('SEARXNG_HTTP_'+res.status)
 const payload=await res.json(), items=Array.isArray(payload.results)?payload.results.slice(0,30):[]
 let enqueued=0
 for(const hit of items) {
  const safe=safeUrl(hit?.url),title=typeof hit?.title==='string'?hit.title.replace(/\s+/g,' ').trim().slice(0,500):''
  if(!safe||!title) continue
  const hash=createHash('sha256').update(safe.url).digest('hex')
  const summary=typeof hit?.content==='string'?hit.content.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,1200):null
  await candidateQueue.add('store-candidate',{url:safe.url,host:safe.host,title,summary,assetClass,hash},{jobId:'lot_'+hash,removeOnComplete:true,removeOnFail:1000,attempts:3,backoff:{type:'exponential',delay:3000}})
  enqueued++
 }
 return {assetClass,results:items.length,enqueued}
}
async function storeCandidate(job) {
 const today=new Date().toISOString().slice(0,10),key='valorax:omnisight:raw:'+today
 const count=await candidateQueue.client.then(c=>c.incr(key))
 if(count===1) await candidateQueue.client.then(c=>c.expire(key,172800))
 if(count>dailyTarget) return {capped:true}
 const item=job.data,sourceId=await getSourceId(item.host),now=new Date().toISOString()
 const {error}=await db.from('omnisight_discovered_lots').upsert({source_id:sourceId,source_lot_key:item.hash,canonical_url:item.url,title:item.title,asset_class:item.assetClass,listing_status:'unknown',short_factual_summary:item.summary,source_title:item.host,source_record_hash:item.hash,verification_status:'candidate',data_use_status:'review_required',first_seen_at:now,last_seen_at:now,image_urls:[],image_usage_status:'unknown'},{onConflict:'source_id,source_lot_key',ignoreDuplicates:true})
 if(error) throw new Error('CANDIDATE_UPSERT_FAILED: '+error.message)
 return {stored:true}
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
  const count=await candidateQueue.client.then(c=>c.get('valorax:omnisight:raw:'+new Date().toISOString().slice(0,10)))
  console.log(JSON.stringify({event:'search_batch_queued',passes:passes.length,dailyRawResultsProcessed:Number(count||0),dailyTarget,searchConcurrency,candidateConcurrency}))
 } catch(e) { console.error('SEARCH_SCHEDULER_ERROR',e instanceof Error?e.message:'UNKNOWN') }
 finally { scheduling=false }
}
searchWorker.on('failed',(j,e)=>console.error('SEARCH_JOB_FAILED',j?.id,e.message))
candidateWorker.on('failed',(j,e)=>console.error('CANDIDATE_JOB_FAILED',j?.id,e.message))
searchWorker.on('error',e=>console.error('SEARCH_WORKER_ERROR',e.message))
candidateWorker.on('error',e=>console.error('CANDIDATE_WORKER_ERROR',e.message))
console.log(JSON.stringify({event:'omnisight_worker_started',targetDailyRawResults:dailyTarget,searchPassesPerBatch:passes.length,searchConcurrency,candidateConcurrency,mode:'discovery_candidates_only_no_unapproved_source_scraping'}))
await scheduleBatch()
const timer=setInterval(scheduleBatch,300000)
async function shutdown(signal) {
 console.log('OMNISIGHT_SHUTDOWN',signal);clearInterval(timer)
 await Promise.all([searchWorker.close(),candidateWorker.close(),searchQueue.close(),candidateQueue.close()])
 process.exit(0)
}
process.once('SIGTERM',()=>shutdown('SIGTERM'));process.once('SIGINT',()=>shutdown('SIGINT'))
