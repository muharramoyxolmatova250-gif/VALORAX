import { supabase } from '../lib/supabase'
import type { AuctionLot } from '../types'

export async function fetchAllGlobalAuctions(): Promise<AuctionLot[]> {
  // 1. Tashqi API: real auktsionlar
  let externalLots: AuctionLot[] = []

  try {
    const response = await fetch('/api/auctions')

    if (response.ok) {
      const result = await response.json()

      const items = Array.isArray(result) ? result : []

      externalLots = items.map((lot: any): AuctionLot => ({
        id: String(lot.id),
        title: lot.title || 'Collector Car',
        subtitle: lot.subtitle || '',
        category: lot.category || 'Hypercars',
        image: lot.image || '',
        currentBid: Number(lot.currentBid ?? 0),
        reserve: Number(lot.reserve ?? 0),
        escrow: Number(lot.escrow ?? 0),
        secondsLeft: Number(lot.secondsLeft ?? 0),
        bids: Number(lot.bids ?? 0),
        verified: Boolean(lot.verified),
        creator: lot.creator || 'External auction',
      }))
    } else {
      console.error('External auction API error:', response.status)
    }
  } catch (error) {
    console.error('External auction API failed:', error)
  }

  // 2. Supabase: Valorax foydalanuvchilari yaratgan auktsionlar
  let databaseLots: AuctionLot[] = []

  try {
    const { data, error } = await supabase
      .from('auctions')
      .select('*')
      .eq('status', 'live')
      .order('created_at', { ascending: false })

    if (error) throw error

    databaseLots = (data ?? []).map((row): AuctionLot => ({
      id: row.id,
      title: row.title,
      subtitle: row.subtitle || '',
      category: row.category || 'Hypercars',
      image: row.image || '',
      currentBid: Number(row.current_bid ?? 0),
      reserve: Number(row.reserve ?? 0),
      escrow: Number(row.escrow ?? 0),
      secondsLeft: row.ends_at
        ? Math.max(
            0,
            Math.floor(
              (new Date(row.ends_at).getTime() - Date.now()) / 1000
            )
          )
        : 0,
      bids: Number(row.bids_count ?? 0),
      verified: false,
      creator: row.creator || '',
    }))
  } catch (error) {
    console.error('Valorax Supabase auction error:', error)
  }

  // Tashqi lotlar va o‘zimiz yaratgan lotlar
  return [...externalLots, ...databaseLots]
}