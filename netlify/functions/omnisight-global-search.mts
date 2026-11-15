import { schedule } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'

type SearchResult = { title?: string; url?: string; content?: string; engine?: string }
type SearchPass = { assetClass: string; query: string }

const PASSES: SearchPass[] = [
  { assetClass: 'hypercar', query: 'hypercar auction lot upcoming sale estimate' },
  { assetClass: 'classic_car', query: 'classic car auction lot upcoming sale estimate' },
  { assetClass: 'racing_car', query: 'historic racing car auction lot upcoming sale' },
  { assetClass: 'watch', query: 'rare luxury watch auction lot upcoming sale estimate' },
  { assetClass: 'fine_art', query: 'fine art painting auction lot upcoming sale estimate' },
  { assetClass: 'sculpture', query: 'sculpture decorative art auction lot upcoming sale' },
  { assetClass: 'jewellery', query: 'exceptional jewellery gemstone auction lot upcoming sale' },
  { assetClass: 'coin', query: 'rare coin banknote auction lot upcoming sale' },
  { assetClass: 'historical_artifact', query: 'historical artefact antiquities auction lot upcoming sale' },
  { assetClass: 'collectible', query: 'rare collectible memorabilia auction lot upcoming sale' },
  { assetClass: 'yacht', query: 'superyacht yacht auction sale listing' },
  { assetClass: 'aircraft', query: 'private aircraft helicopter auction sale listing' },
  { assetClass: 'real_estate', query: 'luxury estate trophy real estate auction lot upcoming sale' },
  { assetClass: 'business', query: 'business equity company stake auction sale listing' },
]

const MAX_PER_RUN = 25
const MAX_SNIPPET = 320
const USER_AGENT = 'VALORAX-OmniSightBot/1.0 (+https://valorax.netlify.app)'
const BLOCKED_HOSTS = new Set(['google.com', 'bing.com', 'duckduckgo.com', 'searxng.org', 'localhost'])

function normalizedHost(value: string) {
  return value.toLowerCase().replace(/^www\./, '')
}

function safeResult(item: SearchResult, pass: SearchPass) {
  if (typeof item.title !== 'string' || typeof item.url !== 'string') return null
  try {
    const url = new URL(item.url)
    if (url.protocol !== 'https:' || !url.hostname.includes('.') || BLOCKED_HOSTS.has(normalizedHost(url.hostname))) return null
    if (url.pathname === '/' || url.pathname.length < 2) return null
    const title = item.title.trim().replace(/\s+/g, ' ').slice(0, 500)
    if (!title) return null
    const snippet = typeof item.content === 'string'
      ? item.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_SNIPPET)
      : null
    return { url: url.href, host: normalizedHost(url.hostname), title, snippet, assetClass: pass.assetClass }
  } catch {
    return null
  }
}

async function runGlobalSearch() {
  const base = process.env.SEARXNG_BASE_URL
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !supabaseUrl || !serviceKey) {
    console.error('OMNISIGHT global search missing SEARXNG_BASE_URL or Supabase server configuration')
    return { ok: false, error: 'MISSING_SERVER_CONFIGURATION' }
  }
  if (/^sb_publishable_/i.test(serviceKey) || /^eyJ/i.test(serviceKey) && serviceKey.split('.').length !== 3) {
    console.error('OMNISIGHT requires a server-only Supabase secret/service-role key, not a publishable key')
    return { ok: false, error: 'INVALID_SUPABASE_SERVER_KEY_TYPE' }
  }

  let endpoint: URL
  try {
    endpoint = new URL(base)
    if (endpoint.protocol !== 'https:' && endpoint.hostname !== 'localhost') throw new Error('HTTPS_REQUIRED')
  } catch {
    return { ok: false, error: 'INVALID_SEARXNG_BASE_URL' }
  }

  const candidatesMap = new Map<string, NonNullable<ReturnType<typeof safeResult>>>()
  let failedPasses = 0
  for (const pass of PASSES) {
    if (candidatesMap.size >= MAX_PER_RUN) break
    try {
      const url = new URL('/search', endpoint)
      url.searchParams.set('q', pass.query)
      url.searchParams.set('format', 'json')
      url.searchParams.set('engines', 'bing')
      url.searchParams.set('language', 'en')
      url.searchParams.set('safesearch', '1')
      url.searchParams.set('pageno', '1')
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(18000),
      })
      if (!response.ok) throw new Error('SEARXNG_HTTP_' + response.status)
      const payload = await response.json() as { results?: SearchResult[] }
      for (const item of Array.isArray(payload.results) ? payload.results : []) {
        const result = safeResult(item, pass)
        if (result && !candidatesMap.has(result.url)) candidatesMap.set(result.url, result)
        if (candidatesMap.size >= MAX_PER_RUN) break
      }
    } catch (error) {
      failedPasses++
      console.error('OMNISIGHT search pass failed', pass.assetClass, error instanceof Error ? error.message : 'UNKNOWN')
    }
  }

  const candidates = [...candidatesMap.values()]
  if (!candidates.length) {
    const summary = { ok: true, searchPasses: PASSES.length, failedPasses, candidatesFound: 0, lotsUpserted: 0, note: 'No search results passed basic URL checks.' }
    console.log('OMNISIGHT global search', JSON.stringify(summary))
    return summary
  }

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const domains = [...new Set(candidates.map(item => item.host))]
  const { data: knownSources, error: readError } = await db.from('omnisight_lot_sources')
    .select('id,domain').in('domain', domains)
  if (readError) throw new Error('SOURCE_LOOKUP_FAILED')

  const known = new Set((knownSources || []).map((source: { domain: string }) => normalizedHost(source.domain)))
  const missing = domains.filter(domain => !known.has(domain))
  if (missing.length) {
    const rows = missing.map(domain => ({
      domain,
      display_name: domain,
      source_type: 'web_search_discovery',
      access_method: 'search_index',
      access_status: 'pending_review',
      terms_status: 'unknown',
      automated_access_allowed: false,
      enabled: false,
      crawl_delay_ms: 1000,
      max_requests_per_hour: 0,
    }))
    const { error } = await db.from('omnisight_lot_sources').insert(rows)
    if (error) throw new Error('SOURCE_REGISTER_FAILED')
  }

  const { data: allSources, error: allReadError } = await db.from('omnisight_lot_sources')
    .select('id,domain').in('domain', domains)
  if (allReadError) throw new Error('SOURCE_LOOKUP_FAILED')
  const sourceIds = new Map((allSources || []).map((source: { id: string; domain: string }) => [normalizedHost(source.domain), source.id]))

  const now = new Date().toISOString()
  const rows = candidates.flatMap(item => {
    const sourceId = sourceIds.get(item.host)
    if (!sourceId) return []
    return [{
      source_id: sourceId,
      source_lot_key: item.url,
      canonical_url: item.url,
      title: item.title,
      asset_class: item.assetClass,
      listing_status: 'unknown',
      short_factual_summary: item.snippet,
      source_title: item.host,
      source_record_hash: createHash('sha256').update(item.title + '\n' + item.url + '\n' + (item.snippet || '')).digest('hex'),
      verification_status: 'candidate',
      data_use_status: 'review_required',
      first_seen_at: now,
      last_seen_at: now,
      image_urls: [],
      image_usage_status: 'unknown',
    }]
  })

  let saved = 0
  for (let i = 0; i < rows.length; i += 100) {
    const { data, error } = await db.from('omnisight_discovered_lots')
      .upsert(rows.slice(i, i + 100), { onConflict: 'source_id,source_lot_key' })
      .select('id')
    if (error) throw new Error('CANDIDATE_UPSERT_FAILED')
    saved += data?.length || 0
  }

  const summary = {
    ok: true,
    searchEngine: 'bing',
    searchPasses: PASSES.length,
    failedPasses,
    uniqueCandidates: candidates.length,
    lotsUpserted: saved,
    theoreticalCandidateCeilingPerHour: MAX_PER_RUN * 4,
    verifiedLots: 0,
    publishedToLiveLots: 0,
  }
  console.log('OMNISIGHT global search completed', JSON.stringify(summary))
  return summary
}

export default schedule('*/15 * * * *', async () => {
  if (process.env.OMNISIGHT_GLOBAL_SEARCH_ENABLED !== 'true') {
    console.log('OMNISIGHT global search is disabled; configure SearXNG and enable after review.')
    return
  }
  try { await runGlobalSearch() }
  catch (error) {
    console.error('OMNISIGHT global search failed', error instanceof Error ? error.message : 'UNKNOWN')
  }
})

export const config = { schedule: '*/15 * * * *' }
