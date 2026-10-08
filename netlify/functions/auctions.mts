import type { Config } from '@netlify/functions'

export default async () => {
  return Response.json([
    {
      id: 'valorax-test-001',
      title: 'Valorax API Connection Test',
      subtitle: 'Global Auction Network',
      category: 'Luxury',
      image:
        'https://images.unsplash.com/photo-1561214115-f2f134cc4912?auto=format&fit=crop&w=1200&q=80',
      currentBid: 0,
      reserve: 0,
      escrow: 0,
      secondsLeft: 86400,
      bids: 0,
      verified: false,
      creator: 'valorax',
      source: 'Valorax API',
      sourceUrl: '',
      status: 'LIVE',
      currency: 'USD',
    },
  ])
}

export const config: Config = {
  path: '/api/auctions',
}