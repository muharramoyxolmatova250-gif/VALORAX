import { schedule } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'

type Source = {
  id: string
  domain: string
  display_name: string
  feed_url: string
  access_status: string
  terms_status: string
  automated_access_allowed: boolean
  rights_basis: string | null
  last_policy_reviewed_at: string | null
  crawl_delay_ms: number
  max_requests_per_hour: number
  feed_requests_hour: number
  feed_request_window_started_at: string | null
  last_feed_fetch_at: string | null
}

type FeedEntry = { key: string; url: string; title: string; summary: string | null }

const USER_AGENT = 'VALORAX-OmniSightBot/1.0 (+https://valorax.netlify.app; contact: site operator)'
const MAX_FEED_BYTES = 5 * 1024 * 1024
const MAX_ENTRIES_PER_SOURCE = 5000
const MAX_SOURCES_PER_RUN = 25

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

function tagValue(block: string, tag: string) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = block.match(new RegExp('<(?:[\\w.-]+:)?' + escaped + '\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?' + escaped + '\\s*>', 'i'))
  return match ? decodeXml(match[1]).slice(0, 1200) : ''
}

function parseFeed(xml: string): FeedEntry[] {
  const blocks = [...xml.matchAll(/<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)\s*>/gi)]
  const entries: FeedEntry[] = []
  for (const match of blocks.slice(0, MAX_ENTRIES_PER_SOURCE)) {
    const block = match[1]
    const title = tagValue(block, 'title')
    const guid = tagValue(block, 'guid') || tagValue(block, 'id')
    const linkTag = block.match(/<link\b([^>]*)\/?\s*>/i)
    const href = linkTag?.[1]?.match(/href=["']([^"']+)["']/i)?.[1]
    const url = href || tagValue(block, 'link')
    const summary = tagValue(block, 'description') || tagValue(block, 'summary') || tagValue(block, 'content')
    if (!title || !url) continue
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'https:') continue
      entries.push({ key: (guid || parsed.href).slice(0, 1000), url: parsed.href, title: title.slice(0, 500), summary: summary || null })
    } catch { /* ignore malformed feed entries */ }
  }
  return entries
}

async function fetchText(url: string, maxBytes: number) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9' },
    signal: AbortSignal.timeout(15000),
    redirect: 'manual',
  })
  if (!response.ok) throw new Error('HTTP_' + response.status)
  const finalUrl = new URL(url)
  if (response.headers.get('content-length') && Number(response.headers.get('content-length')) > maxBytes) {
    throw new Error('RESPONSE_TOO_LARGE')
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > maxBytes) throw new Error('RESPONSE_TOO_LARGE')
  return { text: new TextDecoder().decode(bytes), finalUrl }
}

async function robotsAllows(feedUrl: URL, domain: string) {
  const robotsUrl = new URL('/robots.txt', feedUrl.origin)
  const result = await fetchText(robotsUrl.href, 512 * 1024)
  const lines = result.text.split(/\r?\n/)
  let applies = false
  let disallowed = false
  for (const raw of lines) {
    const line = raw.split('#')[0].trim()
    if (!line) continue
    const [field, ...rest] = line.split(':')
    if (!field || !rest.length) continue
    const value = rest.join(':').trim()
    if (field.toLowerCase() === 'user-agent') {
      applies = value === '*' || USER_AGENT.toLowerCase().includes(value.toLowerCase())
    } else if (field.toLowerCase() === 'disallow' && applies && value) {
      if (feedUrl.pathname.startsWith(value)) disallowed = true
    }
  }
  return !disallowed
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

async function runDiscovery() {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    console.error('OMNISIGHT discovery missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    return { ok: false, error: 'MISSING_SERVER_CONFIGURATION' }
  }
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await db.from('omnisight_lot_sources')
    .select('id,domain,display_name,feed_url,access_status,terms_status,automated_access_allowed,rights_basis,last_policy_reviewed_at,crawl_delay_ms,max_requests_per_hour,feed_requests_hour,feed_request_window_started_at,last_feed_fetch_at')
    .eq('enabled', true).eq('access_status', 'approved').not('feed_url', 'is', null)
    .limit(MAX_SOURCES_PER_RUN)
  if (error) {
    console.error('OMNISIGHT source query failed', error.message)
    return { ok: false, error: 'SOURCE_QUERY_FAILED' }
  }

  let sourcesChecked = 0, entriesSeen = 0, lotsUpserted = 0, sourcesSkipped = 0, sourcesFailed = 0
  for (const source of (data || []) as Source[]) {
    if (!source.automated_access_allowed ||
      !['permitted', 'licensed', 'permission_granted'].includes(source.terms_status) ||
      !source.rights_basis?.trim() || !source.last_policy_reviewed_at) {
      sourcesSkipped++
      continue
    }
    let feed: URL
    try {
      feed = new URL(source.feed_url)
      if (feed.protocol !== 'https:' || feed.hostname.toLowerCase() !== source.domain.toLowerCase()) {
        sourcesSkipped++
        continue
      }
    } catch { sourcesSkipped++; continue }

    const now = Date.now()
    const windowStart = source.feed_request_window_started_at ? Date.parse(source.feed_request_window_started_at) : 0
    const sameHourWindow = Number.isFinite(windowStart) && now - windowStart < 60 * 60 * 1000
    const requestCount = sameHourWindow ? source.feed_requests_hour : 0
    if (requestCount >= source.max_requests_per_hour ||
      (source.last_feed_fetch_at && now - Date.parse(source.last_feed_fetch_at) < source.crawl_delay_ms)) {
      sourcesSkipped++
      continue
    }

    try {
      const robots = await robotsAllows(feed, source.domain)
      if (!robots) {
        await db.from('omnisight_lot_sources').update({ enabled: false, access_status: 'paused' }).eq('id', source.id)
        sourcesSkipped++
        continue
      }
      const { text: xml } = await fetchText(feed.href, MAX_FEED_BYTES)
      const entries = parseFeed(xml)
      entriesSeen += entries.length
      const rows = entries.map(entry => ({
        source_id: source.id,
        source_lot_key: entry.key,
        canonical_url: entry.url,
        title: entry.title,
        asset_class: 'unclassified',
        listing_status: 'unknown',
        short_factual_summary: entry.summary,
        source_title: source.display_name,
        source_record_hash: createHash('sha256').update(entry.title + '\n' + entry.url + '\n' + (entry.summary || '')).digest('hex'),
        verification_status: 'candidate',
        data_use_status: 'review_required',
        last_seen_at: new Date().toISOString(),
      }))
      for (let i = 0; i < rows.length; i += 200) {
        const { data: saved, error: saveError } = await db.from('omnisight_discovered_lots')
          .upsert(rows.slice(i, i + 200), { onConflict: 'source_id,source_lot_key' })
          .select('id')
        if (saveError) throw new Error('UPSERT_FAILED')
        lotsUpserted += saved?.length || 0
      }
      const nextWindowStart = sameHourWindow ? source.feed_request_window_started_at : new Date().toISOString()
      await db.from('omnisight_lot_sources').update({
        feed_requests_hour: requestCount + 1,
        feed_request_window_started_at: nextWindowStart,
        last_feed_fetch_at: new Date().toISOString(),
      }).eq('id', source.id)
      sourcesChecked++
    } catch (error) {
      sourcesFailed++
      const code = error instanceof Error ? error.message.slice(0, 80) : 'UNKNOWN'
      console.error('OMNISIGHT source failed', source.domain, code)
      await db.from('omnisight_lot_sources').update({ last_feed_fetch_at: new Date().toISOString() }).eq('id', source.id)
    }
  }
  const summary = { ok: true, sourcesChecked, sourcesSkipped, sourcesFailed, entriesSeen, lotsUpserted, maxSourcesPerRun: MAX_SOURCES_PER_RUN, maxEntriesPerSource: MAX_ENTRIES_PER_SOURCE }
  console.log('OMNISIGHT discovery run', JSON.stringify(summary))
  return summary
}

export default schedule('* * * * *', async () => {
  if (process.env.OMNISIGHT_DISCOVERY_ENABLED !== 'true') {
    console.log('OMNISIGHT discovery is disabled; set OMNISIGHT_DISCOVERY_ENABLED=true after approving feed sources.')
    return
  }
  await runDiscovery()
})

export const config = { schedule: '* * * * *' }
