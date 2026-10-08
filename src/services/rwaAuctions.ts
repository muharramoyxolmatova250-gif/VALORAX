import type { AuctionLot } from '../types'

export async function fetchAllGlobalAuctions(): Promise<AuctionLot[]> {
  try {
    const response = await fetch('/api/auctions')

    if (!response.ok) {
      throw new Error(
        'Auction API error: ' + response.status
      )
    }

    const data = await response.json()

    if (!Array.isArray(data)) {
      return []
    }

    return data
  } catch (error) {
    console.error(
      'Valorax auction API error:',
      error
    )

    return []
  }
}