import type { Config } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'

type Source = {
  id: string; domain: string; display_name: string; sitemap_url: string
  access_status: string; terms_status: string; automated_access_allowed: boolean
  rights_basis: string | null; last_policy_reviewed_at: string | null
  max_requests_per_hour: number; sitemap_requests_hour: number
  sitemap_request_window_started_at: string | null; last_sitemap_fetch_at: string | null
}
type Candidate = { url: string; title: string; description: string | null; assetClass: string }

const USER_AGENT = 'VALORAX-NativeDiscovery/1.0 (+https://valorax.netlify.app)'
const MAX_SOURCES = 8
const MAX_PAGES = 24
const ALLOWED_TERMS = new Set(['permitted', 'licensed', 'permission_granted'])
const CLASSES: Record<string, string[]> = {
  hypercar: ['hypercar','supercar','bugatti','pagani','koenigsegg','mclaren','ferrari','lamborghini'],
  classic_car: ['classic car','vintage car','historic automobile','pre-war car','roadster','automobile'],
  racing_car: ['race car','racing car','le mans','formula one','f1 car','motorsport'],
  watch: ['watch','wristwatch','chronograph','patek philippe','rolex','audemars piguet','richard mille'],
  fine_art: ['painting','oil on canvas','fine art','artwork','watercolour','watercolor'],
  sculpture: ['sculpture','bronze figure','marble sculpture'],
  jewellery: ['jewellery','jewelry','diamond necklace','gemstone','ring','brooch'],
  coin: ['rare coin','gold coin','silver coin','numismatic','banknote'],
  historical_artifact: ['antiquity','antiquities','artefact','artifact','historical object','manuscript'],
  collectible: ['memorabilia','collectible','collectable','rare book','comic','trading card'],
  yacht: ['yacht','superyacht','motor yacht','sailing yacht'],
  aircraft: ['aircraft','private jet','helicopter','business jet'],
  real_estate: ['real estate','estate','mansion','property auction','land parcel'],
  business: ['business for sale','company stake','equity stake','private equity'],
}
const BLOCKED = /\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|xml|css|js|mp4|mp3)$/i

function clean(value: string) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}
function locations(xml: string) {
  return [...xml.matchAll(/<(?:[\w.-]+:)?loc\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?loc\s*>/gi)]
    .map(m => clean(m[1])).filter(Boolean)
}
function meta(html: string, key: string, value: string) {
  const tags = html.match(/<meta\b[^>]*>/gi) || []
  for (const tag of tags) {
    const attributes = [...tag.matchAll(/([^\s=]+)\s*=\s*(["'])(.*?)\2/g)]
    const attribute = (name: string) => attributes.find(match => match[1].toLowerCase() === name.toLowerCase())?.[3] || ''
    if (attribute(key).toLowerCase() === value.toLowerCase()) {
      return clean(attribute('content')).slice(0, 1000)
    }
  }
  return ''
}
function titleOf(html: string) {
  return (meta(html, 'property', 'og:title') || clean(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')).slice(0, 500)
}
function classify(text: string) {
  const value = text.toLowerCase()
  let best = { name: 'unclassified', hits: 0 }
  for (const [name, words] of Object.entries(CLASSES)) {
    const hits = words.filter(word => value.includes(word)).length
    if (hits > best.hits) best = { name, hits }
  }
  return best.name
}
async function bounded(url: URL, limit: number, accept: string) {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: accept }, redirect: 'manual', signal: AbortSignal.timeout(12000) })
  if (!response.ok || response.status >= 300) throw new Error('HTTP_' + response.status)
  if (Number(response.headers.get('content-length') || 0) > limit) throw new Error('TOO_LARGE')
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > limit) throw new Error('TOO_LARGE')
  return { text: new TextDecoder().decode(bytes), contentType: response.headers.get('content-type') || '' }
}
async function robotsAllows(url: URL) {
  try {
    const { text } = await bounded(new URL('/robots.txt', url.origin), 256 * 1024, 'text/plain')
    let applies = false
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.split('#')[0].trim()
      const [key, ...rest] = line.split(':')
      if (!key || !rest.length) continue
      const value = rest.join(':').trim()
      if (key.toLowerCase() === 'user-agent') applies = value === '*' || USER_AGENT.toLowerCase().includes(value.toLowerCase())
      if (key.toLowerCase() === 'disallow' && applies && value && url.pathname.startsWith(value)) return false
    }
    return true
  } catch { return false }
}
async function readMap(url: URL, host: string, depth = 0): Promise<string[]> {
  if (depth > 1 || url.protocol !== 'https:' || url.hostname.toLowerCase().replace(/^www\./, '') !== host) return []
  const { text } = await bounded(url, 2 * 1024 * 1024, 'application/xml,text/xml;q=0.9')
  const found = locations(text).slice(0, 500)
  if (!/<(?:[\w.-]+:)?sitemapindex\b/i.test(text)) return found
  const nested = await Promise.all(found.slice(0, 5).map(async raw => {
    try { return await readMap(new URL(raw), host, depth + 1) } catch { return [] }
  }))
  return nested.flat()
}
async function inspect(raw: string, source: Source): Promise<Candidate | null> {
  let url: URL
  try { url = new URL(raw) } catch { return null }
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  const sourceHost = source.domain.toLowerCase().replace(/^www\./, '')
  if (url.protocol !== 'https:' || host !== sourceHost || BLOCKED.test(url.pathname)) return null
  if (!await robotsAllows(url)) return null
  const { text: html, contentType } = await bounded(url, 1024 * 1024, 'text/html,application/xhtml+xml')
  if (!contentType.includes('html') && !contentType.includes('xhtml')) return null
  const title = titleOf(html)
  if (!title) return null
  const description = meta(html, 'name', 'description') || meta(html, 'property', 'og:description') || ''
  const visible = clean(html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')).slice(0, 10000)
  const combined = title + ' ' + description + ' ' + visible
  const pathSignal = /\/(lot|lots|item|items|catalogue|catalog|auction)\//i.test(url.pathname)
  const detailSignal = /\b(lot\s*#?\d+|lot details|auction lot|estimate|provenance|serial number)\b/i.test(combined)
  const assetClass = classify(combined)
  if ((!pathSignal && !detailSignal) || assetClass === 'unclassified') return null
  return { url: url.href, title, description: description || null, assetClass }
}
async function run() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return { ok: false, error: 'MISSING_SUPABASE_CONFIGURATION' }
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await db.from('omnisight_lot_sources')
    .select('id,domain,display_name,sitemap_url,terms_status,automated_access_allowed,rights_basis,last_policy_reviewed_at,max_requests_per_hour,sitemap_requests_hour,sitemap_request_window_started_at,last_sitemap_fetch_at')
    .eq('enabled', true).eq('access_status', 'approved').not('sitemap_url', 'is', null).limit(MAX_SOURCES)
  if (error) throw new Error('SOURCE_QUERY_FAILED')
  let checked = 0, inspected = 0, saved = 0, skipped = 0, failed = 0
  for (const source of (data || []) as Source[]) {
    if (!source.automated_access_allowed || !ALLOWED_TERMS.has(source.terms_status) || !source.rights_basis?.trim() || !source.last_policy_reviewed_at) { skipped++; continue }
    const now = Date.now()
    const start = source.sitemap_request_window_started_at ? Date.parse(source.sitemap_request_window_started_at) : 0
    const sameHour = Number.isFinite(start) && now - start < 3600000
    const count = sameHour ? source.sitemap_requests_hour : 0
    if (count >= source.max_requests_per_hour || (source.last_sitemap_fetch_at && now - Date.parse(source.last_sitemap_fetch_at) < 900000)) { skipped++; continue }
    try {
      const map = new URL(source.sitemap_url)
      const host = source.domain.toLowerCase().replace(/^www\./, '')
      if (map.protocol !== 'https:' || map.hostname.toLowerCase().replace(/^www\./, '') !== host || !await robotsAllows(map)) { skipped++; continue }
      const urls = [...new Set(await readMap(map, host))].filter(raw => {
        try { const item = new URL(raw); return item.protocol === 'https:' && item.hostname.toLowerCase().replace(/^www\./, '') === host } catch { return false }
      }).slice(0, MAX_PAGES)
      const results = await Promise.all(urls.map(async raw => { try { return await inspect(raw, source) } catch { return null } }))
      inspected += urls.length
      const candidates = results.filter((item): item is Candidate => Boolean(item))
      const timestamp = new Date().toISOString()
      const rows = candidates.map(item => ({
        source_id: source.id, source_lot_key: item.url, canonical_url: item.url,
        title: item.title, asset_class: item.assetClass, listing_status: 'unknown',
        short_factual_summary: item.description, source_title: source.display_name,
        source_record_hash: createHash('sha256').update(item.title + '\n' + item.url + '\n' + (item.description || '')).digest('hex'),
        verification_status: 'candidate', data_use_status: 'review_required',
        first_seen_at: timestamp, last_seen_at: timestamp, image_urls: [], image_usage_status: 'unknown',
      }))
      for (let i = 0; i < rows.length; i += 100) {
        const { data: inserted, error: writeError } = await db.from('omnisight_discovered_lots').upsert(rows.slice(i, i + 100), { onConflict: 'source_id,source_lot_key' }).select('id')
        if (writeError) throw new Error('CANDIDATE_SAVE_FAILED')
        saved += inserted?.length || 0
      }
      await db.from('omnisight_lot_sources').update({
        sitemap_requests_hour: count + 1,
        sitemap_request_window_started_at: sameHour ? source.sitemap_request_window_started_at : new Date().toISOString(),
        last_sitemap_fetch_at: new Date().toISOString(),
      }).eq('id', source.id)
      checked++
    } catch (error) {
      failed++
      console.error('VALORAX native discovery source failed', source.domain, error instanceof Error ? error.message : 'UNKNOWN')
      await db.from('omnisight_lot_sources').update({ last_sitemap_fetch_at: new Date().toISOString() }).eq('id', source.id)
    }
  }
  const summary = { ok: true, engine: 'VALORAX_NATIVE_DISCOVERY_V1', sourcesChecked: checked, skipped, failed, pagesInspected: inspected, candidatesSaved: saved, verifiedLots: 0, publishedLots: 0 }
  console.log('VALORAX native discovery', JSON.stringify(summary))
  return summary
}
export default async (req: Request) => {
  const payload = await req.json().catch(() => ({})) as { next_run?: string }
  if (process.env.VALORAX_NATIVE_DISCOVERY_ENABLED !== 'true') {
    console.log('VALORAX native discovery disabled pending approved sitemap sources and migration.')
    return new Response(JSON.stringify({ ok: false, disabled: true, nextRun: payload.next_run || null }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  }
  try {
    const summary = await run()
    return new Response(JSON.stringify({ ...summary, nextRun: payload.next_run || null }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  } catch (error) {
    console.error('VALORAX native discovery failed', error instanceof Error ? error.message : 'UNKNOWN')
    return new Response(JSON.stringify({ ok: false, error: 'DISCOVERY_FAILED' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
}

export const config: Config = { schedule: '*/15 * * * *' }
