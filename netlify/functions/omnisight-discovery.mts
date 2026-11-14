import type { Config } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

type Source = {
  id: string
  domain: string
  terms_status: string
  rights_basis: string | null
  licence_reference: string | null
  max_requests_per_hour: number
  crawl_delay_ms: number
}

function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) return null
    if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) return null
    return url.toString()
  } catch {
    return null
  }
}

function dateValue(value: unknown): Date | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export default async () => {
  if (process.env.OMNISIGHT_DISCOVERY_ENABLED !== 'true') {
    return new Response('Discovery disabled', { status: 200 })
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const apiKey = process.env.OCD_API_KEY
  if (!supabaseUrl || !serviceRoleKey || !apiKey) {
    console.error('OMNISIGHT discovery configuration is incomplete')
    return new Response('Discovery configuration incomplete', { status: 503 })
  }

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Contact Old Cars Data only after an operator has explicitly approved
  // the source, automated access and the applicable data licence.
  const { data: source, error: sourceError } = await db
    .from('omnisight_lot_sources')
    .select('id,domain,terms_status,rights_basis,licence_reference,max_requests_per_hour,crawl_delay_ms')
    .eq('domain', 'oldcarsdata.com')
    .eq('access_status', 'approved')
    .eq('enabled', true)
    .eq('automated_access_allowed', true)
    .in('terms_status', ['licensed', 'permission_granted'])
    .maybeSingle()

  if (sourceError) {
    console.error('OMNISIGHT source registry lookup failed:', sourceError.message)
    return new Response('Source registry unavailable', { status: 503 })
  }
  if (!source) return new Response('No approved licensed source', { status: 200 })

  const approvedSource = source as Source
  const { data: queuedJob, error: queueLookupError } = await db
    .from('omnisight_discovery_jobs')
    .select('id,cursor_state,pages_processed,lots_discovered,lots_updated')
    .eq('source_id', approvedSource.id)
    .eq('job_type', 'discover')
    .eq('status', 'queued')
    .lte('run_after', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (queueLookupError) {
    console.error('OMNISIGHT discovery queue lookup failed:', queueLookupError.message)
    return new Response('Discovery queue unavailable', { status: 503 })
  }

  let job = queuedJob
  if (!job) {
    const { data: created, error } = await db
      .from('omnisight_discovery_jobs')
      .insert({ source_id: approvedSource.id, job_type: 'discover', status: 'queued', cursor_state: { page: 1 } })
      .select('id,cursor_state,pages_processed,lots_discovered,lots_updated')
      .single()
    if (error || !created) {
      console.error('OMNISIGHT discovery job could not be created:', error?.message)
      return new Response('Could not create discovery job', { status: 503 })
    }
    job = created
  }

  const page = Math.max(1, Math.floor(Number(job.cursor_state?.page) || 1))
  await db.from('omnisight_discovery_jobs').update({
    status: 'running',
    started_at: new Date().toISOString(),
    attempts: Number(job.cursor_state?.attempts || 0) + 1,
  }).eq('id', job.id)

  try {
    const url = new URL('https://api.oldcarsdata.com/auctions/live')
    url.searchParams.set('sort', 'ending')
    url.searchParams.set('direction', 'asc')
    url.searchParams.set('limit', '100')
    url.searchParams.set('page', String(page))
    url.searchParams.set('price_min', '500000')

    const response = await fetch(url, {
      headers: { Authorization: 'Bearer ' + apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    })
    const payload = await response.json()
    if (!response.ok) throw new Error('PROVIDER_HTTP_' + response.status)

    const items = Array.isArray(payload?.data) ? payload.data : []
    const totalPages = Math.max(1, Math.floor(Number(payload?.meta?.total_pages) || 1))
    const now = Date.now()
    let discovered = 0
    let updated = 0

    for (const item of items.slice(0, 100)) {
      const sourceLotKey = String(item?.id ?? '').trim()
      const title = typeof item?.title === 'string' ? item.title.trim().slice(0, 240) : ''
      const canonicalUrl = safeHttpsUrl(item?.url)
      const endAt = dateValue(item?.auction_end_at)
      const price = Number(item?.price)
      const currency = typeof item?.currency === 'string' ? item.currency.toUpperCase() : ''

      // The provider's live endpoint is documented to return active auctions only.
      // Keep its status explicit; never infer upcoming from a missing start timestamp.
      if (!sourceLotKey || !title || !canonicalUrl || item?.auction_status !== 'active') continue
      if (!Number.isFinite(price) || price < 500_000 || currency !== 'USD') continue
      if (endAt && endAt.getTime() <= now) continue

      const imageUrl = safeHttpsUrl(item?.featured_image_url || item?.image_url)
      const termsCleared = approvedSource.terms_status === 'licensed' || approvedSource.terms_status === 'permission_granted'
      const rightsRef = approvedSource.licence_reference || approvedSource.rights_basis
      const dataUseStatus = termsCleared && rightsRef
        ? (approvedSource.terms_status === 'licensed' ? 'licensed' : 'permission_granted')
        : 'review_required'

      const record = {
        source_id: approvedSource.id,
        source_lot_key: sourceLotKey,
        canonical_url: canonicalUrl,
        title,
        asset_class: 'automotive',
        make: typeof item?.listing_make === 'string' ? item.listing_make.slice(0, 120) : null,
        model: typeof item?.listing_model === 'string' ? item.listing_model.slice(0, 120) : null,
        model_year: Number.isInteger(Number(item?.year)) && Number(item.year) >= 1500 && Number(item.year) <= 2200 ? Number(item.year) : null,
        lot_number: null,
        auction_house: typeof item?.source === 'string' ? item.source.slice(0, 160) : 'Auction source not specified',
        sale_date: endAt ? endAt.toISOString().slice(0, 10) : null,
        listing_status: 'active',
        currency: 'USD',
        published_value_usd: price,
        value_basis: 'current_bid',
        value_source_url: canonicalUrl,
        value_checked_at: new Date().toISOString(),
        auction_ends_at: endAt?.toISOString() ?? null,
        // Store image URL as a reference only; never embed it until image-specific rights are cleared.
        hero_image_url: null,
        image_urls: imageUrl ? [imageUrl] : [],
        image_usage_status: 'unknown',
        identifiers: {
          vin: typeof item?.vin === 'string' ? item.vin : null,
          source_updated_at: typeof item?.updated_at === 'string' ? item.updated_at : null,
          auction_end_precision: typeof item?.auction_end_precision === 'string' ? item.auction_end_precision : null,
        },
        short_factual_summary: typeof item?.description === 'string' ? item.description.slice(0, 1200) : null,
        source_title: title,
        verification_status: 'source_checked',
        data_use_status: dataUseStatus,
        rights_reference: dataUseStatus === 'review_required' ? null : rightsRef,
        rights_reviewed_at: dataUseStatus === 'review_required' ? null : new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        last_checked_at: new Date().toISOString(),
      }

      const { data: saved, error: saveError } = await db
        .from('omnisight_discovered_lots')
        .upsert(record, { onConflict: 'source_id,source_lot_key' })
        .select('id')
        .single()

      if (saveError || !saved) {
        console.error('OMNISIGHT lot upsert failed:', saveError?.message)
        continue
      }

      const { error: reportError } = await db
        .from('omnisight_lot_ai_reports')
        .upsert(
          { lot_id: saved.id, report_version: 1, status: 'queued', limitations: ['AI report is queued; no analysis is claimed until the report worker completes.'] },
          { onConflict: 'lot_id,report_version', ignoreDuplicates: true },
        )
      if (reportError) console.error('OMNISIGHT AI report queue failed:', reportError.message)

      discovered += 1
    }

    const nextPage = page < totalPages ? page + 1 : 1
    const finishedSweep = page >= totalPages
    await db.from('omnisight_discovery_jobs').update({
      status: finishedSweep ? 'completed' : 'queued',
      cursor_state: { page: nextPage, total_pages: totalPages },
      pages_processed: Number(job.pages_processed || 0) + 1,
      lots_discovered: Number(job.lots_discovered || 0) + discovered,
      lots_updated: Number(job.lots_updated || 0) + updated,
      run_after: new Date(Date.now() + Math.max(60_000, approvedSource.crawl_delay_ms || 60_000)).toISOString(),
      finished_at: finishedSweep ? new Date().toISOString() : null,
    }).eq('id', job.id)

    return Response.json({ ok: true, page, totalPages, processed: items.length, eligibleLots: discovered, aiReportsQueued: discovered })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'DISCOVERY_FAILED'
    await db.from('omnisight_discovery_jobs').update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      last_error_code: message.slice(0, 120),
    }).eq('id', job.id)
    console.error('OMNISIGHT discovery failed:', message)
    return new Response('Discovery failed', { status: 502 })
  }
}

export const config: Config = {
  schedule: '0 * * * *',
}
