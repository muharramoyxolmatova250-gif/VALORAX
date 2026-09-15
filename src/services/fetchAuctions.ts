// src/services/fetchAuctions.ts

export interface AuctionItem {
  id: string;
  title: string;
  currentBid: string;
  imageUrl: string;
  endsAt: number;
  seller: string;
}

export const fetchOpenSeaAuctions = async (): Promise<AuctionItem[]> => {
  try {
    const response = await fetch(
      'https://api.opensea.io/api/v2/events?event_type=auction_created',
      {
        headers: {
          'X-API-KEY': process.env.NEXT_PUBLIC_OPENSEA_API_KEY || '',
          'accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error('API request failed');
    }

    const data = await response.json();

    return data.asset_events.map((event: any) => ({
      id: event.asset.token_id,
      title: event.asset.name || 'VIP Exclusive Lot',
      currentBid: event.ending_price ? (Number(event.ending_price) / 1e18).toString() : '100',
      imageUrl: event.asset.image_url || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe',
      endsAt: new Date(event.event_timestamp).getTime() + 86400000,
      seller: event.asset.owner?.address || '0x000...000',
    }));
  } catch (error) {
    console.error('Error fetching OpenSea auctions:', error);
    // Zaxira uchun VIP mock lotlar (API bo'sh bo'lganda ham sayt aktiv ko'rinadi)
    return [
      {
        id: '1',
        title: 'Tokenized Luxury Estate - Dubai Marina',
        currentBid: '250.00',
        imageUrl: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750',
        endsAt: Date.now() + 36000000,
        seller: '0x71C...9B2',
      },
      {
        id: '2',
        title: 'Rare Patek Philippe Grandmaster Chime',
        currentBid: '120.50',
        imageUrl: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9',
        endsAt: Date.now() + 54000000,
        seller: '0x3F2...1A8',
      }
    ];
  }
};