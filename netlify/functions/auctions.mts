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
    // Public catalogue reads use anon credentials and RLS; service-role keys never reach this endpoint.
    const db = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    // Public output is restricted to rows already inserted into the publication ledger.
    // Raw discovery candidates are never exposed directly by this endpoint.
    const { data, error } = await db
      .from('omnisight_public_live_lots')
      .select('id,title,asset_class,make,model,model_year,lot_number,sale_date,location,estimate_low,estimate_high,auction_house,canonical_url,listing_status,published_value_usd,currency,value_basis,auction_starts_at,auction_ends_at,hero_image_url,image_urls,image_usage_status,short_factual_summary,verification_status,last_seen_at,current_bid,reserve,category,creator')
      .gte('published_value_usd', MIN_VALUE_USD)
      .gte('last_seen_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('auction_ends_at', { ascending: true, nullsFirst: false })
      .limit(500)

    if (error) {
      console.error('VALORAX published catalogue query failed:', error.message)
      return Response.json({ error: 'Catalogue is temporarily unavailable.' }, { status: 503 })
    }

    const now = Date.now()
    const lots = (data ?? []).flatMap((lot: any) => {
      const endAt = lot.auction_ends_at ? new Date(lot.auction_ends_at).getTime() : NaN
      const startAt = lot.auction_starts_at ? new Date(lot.auction_starts_at).getTime() : NaN
      const value = Number(lot.published_value_usd)
      const sourceUrl = typeof lot.canonical_url === 'string' ? lot.canonical_url : ''
      const imageRightsCleared = ['licensed', 'permission_granted'].includes(lot.image_usage_status)
      const allowedImages = imageRightsCleared && Array.isArray(lot.image_urls)
        ? lot.image_urls.filter((item: unknown): item is string => typeof item === 'string' && /^https?:\/\//i.test(item))
        : []
      const image = imageRightsCleared && typeof lot.hero_image_url === 'string' && /^https?:\/\//i.test(lot.hero_image_url)
        ? lot.hero_image_url
        : allowedImages[0] || ''
      if (!Number.isFinite(value) || value < MIN_VALUE_USD || !sourceUrl) return []
      if (Number.isFinite(endAt) && endAt <= now) return []
      const isUpcoming = lot.listing_status === 'upcoming'
        || lot.auction_status === 'upcoming'
        || (Number.isFinite(startAt) && startAt > now)

      const categoryMap: Record<string, string> = {
        automotive: 'Cars',
        hypercar: 'Cars',
        classic_car: 'Cars',
        racing_car: 'Cars',
        watch: 'Watches',
        jewelry: 'Jewelry',
        jewellery: 'Jewelry',
        art: 'Fine Art',
        fine_art: 'Fine Art',
        sculpture: 'Fine Art',
        real_estate: 'Real Estate',
        property: 'Real Estate',
        aircraft: 'Aircraft',
        yacht: 'Aircraft',
        collectible: 'Collectibles',
        coin: 'Collectibles',
        historical_artifact: 'Historical',
        antiquity: 'Historical',
      }
      return [{
        id: lot.id,
        title: lot.title,
        subtitle: [lot.model_year, lot.make, lot.model].filter(Boolean).join(' '),
        category: categoryMap[lot.asset_class] || lot.category || 'Luxury',
        image,
        imageSourceUrl: '',
        currentBid: Number(lot.current_bid || 0),
        reserve: Number(lot.reserve || value),
        escrow: 0,
        secondsLeft: Number.isFinite(endAt) ? Math.max(0, Math.floor((endAt - now) / 1000)) : 0,
        bids: 0,
        verified: lot.verification_status === 'human_reviewed',
        creator: lot.creator || 'OmniSight · verified source',
        source: lot.auction_house || 'Verified auction source',
        sourceUrl,
        status: isUpcoming ? 'UPCOMING' : 'LIVE',
        currency: lot.currency || 'USD',
        publishedValueUsd: value,
        valueBasis: lot.value_basis || 'published_value',
        summary: lot.short_factual_summary || '',
        lotNumber: lot.lot_number || '',
        saleDate: lot.sale_date || '',
        auctionStartsAt: lot.auction_starts_at || '',
        auctionEndsAt: lot.auction_ends_at || '',
        location: lot.location || '',
        estimateLow: lot.estimate_low === null ? undefined : Number(lot.estimate_low),
        estimateHigh: lot.estimate_high === null ? undefined : Number(lot.estimate_high),
        images: image ? [image] : [],
        imageRightsStatus: lot.image_usage_status || 'unknown',
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
