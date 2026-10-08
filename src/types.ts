export interface Profile {
  id: number
  name: string
  handle: string
  avatar: string
  lostYield: number
  rank: string
  sector: string
}

export type AuctionCategory =
  | 'ALL'
  | 'Cars'
  | 'Watches'
  | 'Jewelry'
  | 'Fine Art'
  | 'Real Estate'
  | 'Collectibles'
  | 'Historical'
  | 'Digital Assets'
  | 'Aircraft'
  | 'Wine & Spirits'
  | 'Motorcycles'
  | 'Luxury'

export interface AuctionLot {
  id: string

  title: string

  subtitle: string

  category: Exclude<AuctionCategory, 'ALL'>

  image: string

  currentBid: number

  reserve: number

  escrow: number

  secondsLeft: number

  bids: number

  verified: boolean

  creator: string

  // Auction source
  source?: string

  // Original auction URL
  sourceUrl?: string

  // Auction status
  status?: 'LIVE' | 'UPCOMING' | 'ENDED'

  // Currency used by original auction
  currency?: string
}

export interface BidEntry {
  addr: string
  amount: number
  delta: string
  ts: string
}

export interface StakePosition {
  token: 'USDT' | 'ETH'
  amount: number
  apy: number
  earned: number
  lockDays: number
}