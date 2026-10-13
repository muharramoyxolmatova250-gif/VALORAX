import type { Config } from '@netlify/functions'

export default async () => {
  const apiKey = process.env.OCD_API_KEY

  if (!apiKey) {
    return Response.json(
      { error: 'OCD_API_KEY sozlanmagan' },
      { status: 500 }
    )
  }

  try {
    const url = new URL(
      'https://api.oldcarsdata.com/auctions/live'
    )

    url.searchParams.set('sort', 'ending')
    url.searchParams.set('direction', 'asc')
    url.searchParams.set('limit', '10')
    url.searchParams.set('price_min', '500000')

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: 'Bearer ' + apiKey,
        Accept: 'application/json',
      },
    })

    const result = await response.json()

    if (!response.ok) {
      console.error('Old Cars Data API error:', response.status)

      return Response.json(
        {
          error: 'Auction API so‘rovi muvaffaqiyatsiz',
          status: response.status,
        },
        { status: response.status }
      )
    }

    const items = Array.isArray(result.data)
      ? result.data
      : Array.isArray(result)
        ? result
        : []

    const lots = items.map((item: any) => {
      const endValue = item.auction_end_at
      const endDate = endValue
        ? new Date(endValue).getTime()
        : 0

      return {
        id: 'ocd-' + item.id,
        title: item.title || 'Collector Car',
        subtitle: [
          item.year,
          item.listing_make,
          item.listing_model,
        ].filter(Boolean).join(' '),
        category: item.listing_make || 'Luxury',
        image: item.featured_image_url || '',
        currentBid: Number(item.price || 0),
        reserve: 0,
        escrow: 0,
        secondsLeft: endDate
          ? Math.max(
              0,
              Math.floor((endDate - Date.now()) / 1000)
            )
          : 0,
        bids: Number(item.bid_count || 0),
        verified: false,
        creator: item.source || 'External auction',
        source: item.source || 'Old Cars Data',
        sourceUrl: item.url || '',
        status: 'LIVE',
        currency: 'USD',
      }
    })

    return Response.json(lots, {
      headers: {
        'Cache-Control': 'public, max-age=60',
      },
    })
  } catch (error) {
    console.error('Auction API connection failed:', error)

    return Response.json(
      { error: 'Auction API bilan ulanish amalga oshmadi' },
      { status: 502 }
    )
  }
}

export const config: Config = {
  path: '/api/auctions',
}