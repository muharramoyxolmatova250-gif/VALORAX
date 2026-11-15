import { schedule } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'

type Candidate = {
  title: string
  url: string
  auction_house?: string | null
  lot_number?: string | null
  asset_class?: string | null
  make?: string | null
  model?: string | null
  model_year?: number | null
  sale_date?: string | null
  listing_status?: string | null
  estimate_low?: number | null
  estimate_high?: number | null
  currency?: string | null
  summary?: string | null
}

const MAX_CANDIDATES = 20
const ALLOWED_STATUS = new Set(['active', 'upcoming', 'sold', 'unsold', 'withdrawn', 'unknown'])

function extractOutputText(payload: any): string {
  if (typeof payload.output_text === 'string') return payload.output_text
  const parts: string[] = []
  for (const item of payload.output || []) {
    if (item.type !== 'message') continue
    for (const part of item.content || []) {
      if (part.type === 'output_text' && typeof part.text === 'string') parts.push(part.text)
    }
  }
  return parts.join('\n')
}

function parseCandidates(raw: string): Candidate[] {
  const cleaned = raw.trim().replace(/^\x60{3}(?:json)?\s*/i, '').replace(/\s*\x60{3}$/, '')
  const parsed = JSON.parse(cleaned)
  if (!Array.isArray(parsed)) throw new Error('AI_OUTPUT_NOT_ARRAY')
  const seen = new Set<string>()
  const result: Candidate[] = []
  for (const item of parsed) {
    if (!item || typeof item.title !== 'string' || typeof item.url !== 'string') continue
    try {
      const url = new URL(item.url)
      if (url.protocol !== 'https:' || seen.has(url.href)) continue
      seen.add(url.href)
      const low = typeof item.estimate_low === 'number' && Number.isFinite(item.estimate_low) ? item.estimate_low : null
      const high = typeof item.estimate_high === 'number' && Number.isFinite(item.estimate_high) ? item.estimate_high : null
      result.push({
        title: item.title.slice(0, 500),
        url: url.href,
        auction_house: typeof item.auction_house === 'string' ? item.auction_house.slice(0, 160) : null,
        lot_number: typeof item.lot_number === 'string' ? item.lot_number.slice(0, 100) : null,
        asset_class: typeof item.asset_class === 'string' ? item.asset_class.slice(0, 80) : 'unclassified',
        make: typeof item.make === 'string' ? item.make.slice(0, 100) : null,
        model: typeof item.model === 'string' ? item.model.slice(0, 160) : null,
        model_year: typeof item.model_year === 'number' && Number.isInteger(item.model_year) ? item.model_year : null,
        sale_date: typeof item.sale_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.sale_date) ? item.sale_date : null,
        listing_status: ALLOWED_STATUS.has(item.listing_status) ? item.listing_status : 'unknown',
        estimate_low: low !== null && low >= 0 ? low : null,
        estimate_high: high !== null && high >= 0 ? high : null,
        currency: typeof item.currency === 'string' && /^[A-Z]{3}$/.test(item.currency) ? item.currency : null,
        summary: typeof item.summary === 'string' ? item.summary.slice(0, 1200) : null,
      })
    } catch { /* ignore invalid URLs */ }
    if (result.length >= MAX_CANDIDATES) break
  }
  return result
}

function hostName(url: string) {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
}

async function discover() {
  const apiKey = process.env.OPENAI_API_KEY
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!apiKey || !supabaseUrl || !serviceKey) {
    console.error('OMNISIGHT web discovery missing required server configuration')
    return
  }

  const model = process.env.OMNISIGHT_MODEL || 'gpt-6-astra'
  const prompt = `Act as a broad, multi-category auction research agent. Search the live web in separate passes for each VALORAX asset category, not just vehicles. Cover: (1) hypercars and supercars, (2) classic, vintage and racing automobiles, (3) luxury watches and horology, (4) fine art, paintings and drawings, (5) sculptures and decorative arts, (6) rare jewellery, gemstones and precious objects, (7) rare coins, banknotes, stamps and historical artefacts, (8) collectible memorabilia, rare books and manuscripts, (9) wine and collectible spirits only as catalogue records where legally appropriate, (10) yachts, superyachts and ships, (11) private aircraft and helicopters, (12) trophy real estate, estates, land and commercial property, (13) company stakes, private equity, businesses and other exceptional investment assets. Also discover other legitimate high-value collectible asset classes that fit a luxury auction marketplace.

Use the same practical research approach as a careful human web researcher: search broadly, follow results to the original lot page, verify the exact item against its official auction-house or authorized marketplace listing, and capture the direct lot-detail URL. Do not stop after finding cars; make a deliberate effort to return candidates from multiple different asset categories and multiple auction houses in each run. Prioritize Sotheby's, Christie's, RM Sotheby's, Bonhams, Mecum, Gooding, Broad Arrow, Phillips, Drouot, major yacht/aviation/property auctioneers and other legitimate specialist houses. Do not treat search snippets, aggregator summaries or AI-generated claims as verified lot details.

Prioritize active and upcoming lots with a published low estimate of at least USD 500,000. Also include exceptional candidates where an estimate is explicitly published in another currency, preserving the original currency and amount without guessing or converting. If no estimate is published, include only when the listing is clearly exceptional and mark estimate fields null. Never invent a price, date, lot number, specification, identity, provenance or condition. Exclude generic category pages, homepages, expired search results and duplicate listings. Return at most 20 distinct lot-detail pages, balanced across categories where credible results exist. Return ONLY a JSON array; each object must have: title, url, auction_house, lot_number, asset_class, make, model, model_year, sale_date (YYYY-MM-DD or null), listing_status (active/upcoming/sold/unsold/withdrawn/unknown), estimate_low (number or null), estimate_high (number or null), currency (3-letter code or null), summary (brief factual description or null). Use asset_class labels such as hypercar, classic_car, racing_car, watch, fine_art, sculpture, jewellery, gemstone, coin, historical_artifact, collectible, rare_book, yacht, aircraft, real_estate, land, business, equity, or other. If no reliable lot page is found, return [].`

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      tools: [{ type: 'web_search', search_context_size: 'high' }],
      tool_choice: 'required',
      input: prompt,
    }),
    signal: AbortSignal.timeout(24000),
  })
  if (!response.ok) {
    console.error('OMNISIGHT web search API failed', response.status)
    return
  }
  const payload = await response.json()
  const candidates = parseCandidates(extractOutputText(payload))
  if (!candidates.length) {
    console.log('OMNISIGHT web discovery found no parseable lot candidates')
    return
  }

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const domains = [...new Set(candidates.map(item => hostName(item.url)))]
  const { data: currentSources, error: sourceReadError } = await db.from('omnisight_lot_sources')
    .select('id,domain').in('domain', domains)
  if (sourceReadError) throw new Error('SOURCE_LOOKUP_FAILED')

  const known = new Set((currentSources || []).map((source: any) => source.domain))
  const missingDomains = domains.filter(domain => !known.has(domain))
  if (missingDomains.length) {
    const newSources = missingDomains.map(domain => ({
      domain,
      display_name: domain,
      source_type: 'auction_house',
      access_method: 'manual_import',
      access_status: 'pending_review',
      terms_status: 'unknown',
      automated_access_allowed: false,
      enabled: false,
      crawl_delay_ms: 1000,
      max_requests_per_hour: 30,
    }))
    const { error } = await db.from('omnisight_lot_sources').insert(newSources)
    if (error) throw new Error('SOURCE_REGISTER_FAILED')
  }

  const { data: allSources, error: allSourceError } = await db.from('omnisight_lot_sources')
    .select('id,domain').in('domain', domains)
  if (allSourceError) throw new Error('SOURCE_LOOKUP_FAILED')
  const sourceIds = new Map((allSources || []).map((source: any) => [source.domain, source.id]))

  const rows = candidates.flatMap(item => {
    const domain = hostName(item.url)
    const sourceId = sourceIds.get(domain)
    if (!sourceId) return []
    const currency = item.currency || null
    const usdLow = currency === 'USD' ? item.estimate_low : null
    return [{
      source_id: sourceId,
      source_lot_key: item.lot_number || item.url,
      canonical_url: item.url,
      title: item.title,
      asset_class: item.asset_class || 'unclassified',
      make: item.make,
      model: item.model,
      model_year: item.model_year && item.model_year >= 1500 && item.model_year <= 2200 ? item.model_year : null,
      lot_number: item.lot_number,
      auction_house: item.auction_house,
      sale_date: item.sale_date,
      listing_status: item.listing_status || 'unknown',
      estimate_low: item.estimate_low,
      estimate_high: item.estimate_high,
      currency,
      published_value_usd: usdLow,
      value_basis: item.estimate_low !== null ? 'estimate_low' : null,
      value_source_url: item.estimate_low !== null ? item.url : null,
      short_factual_summary: item.summary,
      source_title: item.auction_house || domain,
      source_record_hash: createHash('sha256').update(item.title + '\n' + item.url).digest('hex'),
      verification_status: 'candidate',
      data_use_status: 'review_required',
      first_seen_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      image_urls: [],
      image_usage_status: 'unknown',
    }]
  })

  let savedCount = 0
  for (let index = 0; index < rows.length; index += 100) {
    const { data, error } = await db.from('omnisight_discovered_lots')
      .upsert(rows.slice(index, index + 100), { onConflict: 'source_id,source_lot_key' })
      .select('id')
    if (error) throw new Error('LOT_UPSERT_FAILED')
    savedCount += data?.length || 0
  }
  console.log('OMNISIGHT scheduled web discovery completed', JSON.stringify({
    candidatesFound: candidates.length,
    lotsUpserted: savedCount,
    sourceDomains: domains.length,
    model,
  }))
}

export default schedule('0 7 * * *', async () => {
  if (process.env.OMNISIGHT_WEB_DISCOVERY_ENABLED !== 'true') {
    console.log('OMNISIGHT web discovery is disabled; enable only after reviewing API billing and deployment.')
    return
  }
  try {
    await discover()
  } catch (error) {
    console.error('OMNISIGHT web discovery failed', error instanceof Error ? error.message : 'UNKNOWN')
  }
})

export const config = { schedule: '0 7 * * *' }
