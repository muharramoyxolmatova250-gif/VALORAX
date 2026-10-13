import { supabase } from '../lib/supabase'
import type { AuctionLot } from '../types'

export async function fetchAllGlobalAuctions(): Promise<AuctionLot[]> {
  try {
    const { data, error } = await supabase
      .from('auctions')
      .select('*')
      .eq('status', 'live')
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    return (data ?? []).map((row): AuctionLot => ({
      id: row.id,
      title: row.title,
      subtitle: row.subtitle || '',
      category: row.category || 'Hypercars',
      image: row.image || '',
      currentBid: Number(row.current_bid || 0),
      reserve: Number(row.reserve || 0),
      escrow: Number(row.escrow || 0),
      secondsLeft: row.ends_at
        ? Math.max(
            0,
            Math.floor(
              (new Date(row.ends_at).getTime() - Date.now()) / 1000
            )
          )
        : 0,
      bids: Number(row.bids_count || 0),
      verified: false,
      creator: row.creator || '',
    }))
  } catch (error) {
    console.error('Valorax Supabase auction error:', error)
    return []
  }
}