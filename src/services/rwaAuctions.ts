import { supabase } from '../lib/supabase'
import type { AuctionLot } from '../types'

const categoryMap: Record<string, AuctionLot['category']> = {
  automotive: 'Cars', hypercar: 'Cars', classic_car: 'Cars', racing_car: 'Cars',
  watch: 'Watches', jewelry: 'Jewelry', jewellery: 'Jewelry',
  art: 'Fine Art', fine_art: 'Fine Art', sculpture: 'Fine Art',
  real_estate: 'Real Estate', property: 'Real Estate', aircraft: 'Aircraft',
  yacht: 'Luxury', collectible: 'Collectibles', coin: 'Collectibles',
  historical_artifact: 'Historical', antiquity: 'Historical',
}

async function fetchDiscoveredCandidates(): Promise<AuctionLot[]> {
  try {
    const response = await fetch('/api/discoveries')
    if (!response.ok) throw new Error('Discovery feed returned ' + response.status)
    const result = await response.json()
    if (!Array.isArray(result)) return []

    return result.flatMap((lot: any): AuctionLot[] => {
      const value = Number(lot.published_value_usd)
      const low = Number(lot.published_value_usd)
      const checked = Boolean(lot.value_checked_at)
      const url = typeof lot.canonical_url === 'string' ? lot.canonical_url : ''
      // published_value_usd is only populated from the independently checked
      // estimate low by the discovery query; never infer it from an upper bound.
      if (!checked || !Number.isFinite(value) || value < 500_000 ||
          !Number.isFinite(low) || low < 500_000 ||
          !(url.startsWith('https://') || url.startsWith('http://'))) return []

      return [{
        id: 'discovery-' + String(lot.id),
        title: String(lot.title || 'Uncatalogued asset'),
        subtitle: [lot.source_title, lot.asset_class].filter(Boolean).join(' · '),
        category: categoryMap[String(lot.asset_class || '').toLowerCase()] || 'Luxury',
        image: '',
        currentBid: 0,
        reserve: value,
        escrow: 0,
        secondsLeft: 0,
        bids: 0,
        verified: false,
        creator: 'OmniSight · review required',
        source: String(lot.auction_house || lot.source_title || 'Auction source'),
        sourceUrl: url,
        status: 'REVIEW REQUIRED',
        currency: 'USD',
        publishedValueUsd: value,
        valueBasis: 'checked_source_value',
        summary: String(lot.short_factual_summary || ''),
        estimateLow: low,
        estimateHigh: lot.estimate_high == null ? undefined : Number(lot.estimate_high),
        imageRightsStatus: String(lot.image_usage_status || 'unknown'),
        reviewRequired: true,
      }]
    })
  } catch (error) {
    console.error('VALORAX discovery candidates unavailable:', error)
    return []
  }
}

export async function fetchAllGlobalAuctions(): Promise<AuctionLot[]> {
  let externalLots: AuctionLot[] = []

  try {
    const response = await fetch('/api/auctions')
    if (!response.ok) throw new Error('Catalogue API returned ' + response.status)
    const result = await response.json()
    const items = Array.isArray(result) ? result : []

    externalLots = items.map((lot: any): AuctionLot => ({
      id: String(lot.id),
      title: lot.title || 'Collector Asset',
      subtitle: lot.subtitle || '',
      category: lot.category || 'Luxury',
      image: lot.image || '',
      imageSourceUrl: lot.imageSourceUrl || '',
      currentBid: Number(lot.currentBid ?? 0),
      reserve: Number(lot.reserve ?? 0),
      escrow: 0,
      secondsLeft: Number(lot.secondsLeft ?? 0),
      bids: Number(lot.bids ?? 0),
      verified: Boolean(lot.verified),
      creator: lot.creator || 'External auction',
      source: lot.source || 'External source',
      sourceUrl: lot.sourceUrl || '',
      status: lot.status === 'LIVE' || lot.status === 'UPCOMING' ? lot.status : undefined,
      currency: lot.currency || 'USD',
      publishedValueUsd: Number(lot.publishedValueUsd ?? 0),
      valueBasis: typeof lot.valueBasis === 'string' ? lot.valueBasis : '',
      summary: typeof lot.summary === 'string' ? lot.summary : '',
      aiStatus: lot.aiStatus || 'not_started',
      aiVerdict: lot.aiVerdict || null,
      aiSummary: typeof lot.aiSummary === 'string' ? lot.aiSummary : '',
    }))
  } catch (error) {
    console.error('VALORAX premium catalogue API failed:', error)
  }

  let databaseLots: AuctionLot[] = []
  try {
    const { data, error } = await supabase
      .from('auctions')
      .select('*')
      .in('status', ['live', 'upcoming'])
      .order('created_at', { ascending: false })
    if (error) throw error

    databaseLots = (data ?? []).map((row): AuctionLot => ({
      id: row.id,
      title: row.title,
      subtitle: row.subtitle || '',
      category: row.category || 'Luxury',
      image: row.image || '',
      currentBid: Number(row.current_bid ?? 0),
      reserve: Number(row.reserve ?? 0),
      escrow: Number(row.escrow ?? 0),
      secondsLeft: row.ends_at
        ? Math.max(0, Math.floor((new Date(row.ends_at).getTime() - Date.now()) / 1000))
        : 0,
      bids: Number(row.bids_count ?? 0),
      verified: false,
      creator: row.creator || '',
      status: row.status === 'upcoming' ? 'UPCOMING' : row.status === 'live' ? 'LIVE' : 'ENDED',
      currency: 'USD',
      publishedValueUsd: Math.max(Number(row.reserve ?? 0), Number(row.current_bid ?? 0)),
      valueBasis: 'platform_bid',
    }))
  } catch (error) {
    console.error('VALORAX own auction query failed:', error)
  }

  const eligibleExternal = externalLots.filter(lot =>
    (lot.status === 'LIVE' || lot.status === 'UPCOMING') &&
    lot.currency === 'USD' &&
    Number(lot.publishedValueUsd) >= 500_000 &&
    Boolean(lot.sourceUrl)
  )
  const eligibleDatabase = databaseLots.filter(lot =>
    (lot.status === 'UPCOMING' || lot.secondsLeft > 0) &&
    Math.max(lot.currentBid, lot.reserve) >= 500_000
  )
  const discovered = await fetchDiscoveredCandidates()
  const seen = new Set([...eligibleExternal, ...eligibleDatabase].map(lot => lot.sourceUrl).filter(Boolean))
  const uniqueDiscovered = discovered.filter(lot => !seen.has(lot.sourceUrl || ''))

  return [...eligibleExternal, ...eligibleDatabase, ...uniqueDiscovered]
}
