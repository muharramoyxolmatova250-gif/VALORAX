import type { Config } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

const MIN_VALUE_USD = 500_000

export default async () => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    return Response.json({ error: 'Public catalogue database is not configured.' }, { status: 503 })
  }

  try {
    // Use only the public anon key. RLS is the publication gate; never use service-role credentials here.
    const db = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await db
      .from('omnisight_discovered_lots')
      .select('id,title,asset_class,make,model,model_year,auction_house,canonical_url,listing_status,published_value_usd,currency,value_basis,auction_starts_at,auction_ends_at,hero_image_url,image_urls,image_usage_status,short_factual_summary,verification_status,last_seen_at')
      .in('listing_status', ['active', 'upcoming'])
      .gte('published_value_usd', MIN_VALUE_USD)
      .gte('last_seen_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
      .order('auction_ends_at', { ascending: true })
      .limit(100)

    if (error) {
      console.error('VALORAX catalogue query failed:', error.message)
      return Response.json({ error: 'Catalogue is temporarily unavailable.' }, { status: 503 })
    }

    const now = Date.now()
    const lots = (data ?? []).flatMap((lot: any) => {
      const endAt = lot.auction_ends_at ? new Date(lot.auction_ends_at).getTime() : NaN
      const startAt = lot.auction_starts_at ? new Date(lot.auction_starts_at).getTime() : NaN
      const value = Number(lot.published_value_usd)
      const sourceUrl = typeof lot.canonical_url === 'string' ? lot.canonical_url : ''
      const imageRightsCleared = ['licensed', 'permission_granted'].includes(lot.image_usage_status)
      const image = imageRightsCleared && typeof lot.hero_image_url === 'string' ? lot.hero_image_url : ''
      const imageSourceUrl = Array.isArray(lot.image_urls) && typeof lot.image_urls[0] === 'string' ? lot.image_urls[0] : ''
      if (!Number.isFinite(value) || value < MIN_VALUE_USD || !sourceUrl) return []
      if (Number.isFinite(endAt) && endAt <= now) return []
      if (lot.listing_status === 'upcoming' && (!Number.isFinite(startAt) || startAt <= now)) return []
      const status = lot.listing_status === 'upcoming' ? 'UPCOMING' : 'LIVE'
      const categoryMap: Record<string, string> = {
        automotive: 'Cars',
        watch: 'Watches',
        jewelry: 'Jewelry',
        art: 'Fine Art',
        real_estate: 'Real Estate',
        aircraft: 'Aircraft',
        collectible: 'Collectibles',
      }
      return [{
        id: lot.id,
        title: lot.title,
        subtitle: [lot.model_year, lot.make, lot.model].filter(Boolean).join(' '),
        category: categoryMap[lot.asset_class] || 'Luxury',
        image,
        imageSourceUrl,
        currentBid: value,
        reserve: value,
        escrow: 0,
        secondsLeft: Number.isFinite(endAt) ? Math.max(0, Math.floor((endAt - now) / 1000)) : 0,
        bids: 0,
        verified: lot.verification_status === 'human_reviewed',
        creator: lot.auction_house || 'External auction',
        source: lot.auction_house || 'Auction source',
        sourceUrl,
        status,
        currency: 'USD',
        publishedValueUsd: value,
        valueBasis: lot.value_basis,
        summary: lot.short_factual_summary || '',
      }]
    })

    const reportByLot = new Map<string, any>()
    if (lots.length > 0) {
      const { data: reports, error: reportError } = await db
        .from('omnisight_lot_ai_reports')
        .select('lot_id,status,verdict,summary,created_at')
        .in('lot_id', lots.map((lot: any) => lot.id))
        .order('created_at', { ascending: false })
      if (reportError) {
        console.error('OMNISIGHT report status lookup failed:', reportError.message)
      } else {
        for (const report of reports ?? []) {
          if (!reportByLot.has(report.lot_id)) reportByLot.set(report.lot_id, report)
        }
      }
    }

    const lotsWithAi = lots.map((lot: any) => {
      const report = reportByLot.get(lot.id)
      return {
        ...lot,
        aiStatus: report?.status || 'not_started',
        aiVerdict: report?.verdict || null,
        aiSummary: report?.summary || '',
      }
    })

    return Response.json(lotsWithAi, {
      headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=120' },
    })
  } catch (error) {
    console.error('VALORAX catalogue request failed:', error)
    return Response.json({ error: 'Catalogue request failed.' }, { status: 502 })
  }
}

export const config: Config = {
  path: '/api/auctions',
}
