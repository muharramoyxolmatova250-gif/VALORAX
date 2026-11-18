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
  imageSourceUrl?: string
  currentBid: number
  reserve: number
  escrow: number
  secondsLeft: number
  bids: number
  verified: boolean
  creator: string
  source?: string
  sourceUrl?: string
  status?: 'LIVE' | 'UPCOMING' | 'ENDED' | 'REVIEW REQUIRED'
  reviewRequired?: boolean
  currency?: string
  publishedValueUsd?: number
  valueBasis?: string
  summary?: string
  lotNumber?: string
  saleDate?: string
  auctionStartsAt?: string
  auctionEndsAt?: string
  location?: string
  estimateLow?: number
  estimateHigh?: number
  images?: string[]
  imageRightsStatus?: string
  aiStatus?: 'queued' | 'running' | 'completed' | 'partial' | 'failed' | 'stale' | 'not_started'
  aiVerdict?: 'GOOD' | 'BAD' | 'UNCERTAIN' | null
  aiSummary?: string
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
