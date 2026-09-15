export interface Profile {
  id: number
  name: string
  handle: string
  avatar: string
  lostYield: number
  rank: string
  sector: string
}

export type AuctionCategory = 'ALL' | 'Hypercars' | 'Media' | 'Equity' | 'Real Estate'

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
