import { supabase } from '../lib/supabase'
import type { AuctionLot } from '../types'

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

  return [...eligibleExternal, ...eligibleDatabase]
}
