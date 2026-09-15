export interface LiveAuctionItem {
  id: string;
  title: string;
  currentBidETH: number;
  imageUrl: string;
  source: 'Sotheby\'s' | 'Christie\'s' | 'OpenSea VIP' | 'VALOREX Exclusive';
  category: 'RWA (Real Asset)' | 'Fine Art' | 'Digital Asset';
  description: string;
  sellerAddress: string;
}

export const fetchAllGlobalAuctions = async (): Promise<LiveAuctionItem[]> => {
  try {
    // Reservoir/OpenSea API orqali eng yuqori baholi top-lotlarni yuklash
    const res = await fetch(
      'https://api.reservoir.tools/tokens/v6?sortBy=floorAskPrice&sortDirection=desc&limit=20',
      { headers: { 'accept': '*/*', 'x-api-key': 'demo-api-key' } }
    );
    const data = await res.json();

    const liveWeb3: LiveAuctionItem[] = (data.tokens || []).map((item: any) => ({
      id: item.token.tokenId,
      title: item.token.name || `${item.token.collection.name} #${item.token.tokenId}`,
      currentBidETH: item.market?.floorAsk?.price?.amount?.decimal || 120,
      imageUrl: item.token.image || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe',
      source: 'OpenSea VIP',
      category: 'Digital Asset',
      description: 'Rasmiy blokcheyn orqali tasdiqlangan va ZK-Proof kafolatiga ega noyob raqamli aktiv.',
      sellerAddress: item.token.contract
    }));

    // Dunyoning eng qimmat Sotheby's / Christie's RWA (Real World Asset) eksklyuziv lotlari
    const topRWA: LiveAuctionItem[] = [
      {
        id: 'sothebys-01',
        title: '1962 Ferrari 250 GTO (Tokenized Ownership)',
        currentBidETH: 15500, // ~$48M
        imageUrl: 'https://images.unsplash.com/photo-1583121274602-3e2820c69888?auto=format&fit=crop&q=80',
        source: 'Sotheby\'s',
        category: 'RWA (Real Asset)',
        description: 'Shveytsariya xazinasida saqlanuvchi, ZK-Sovereign sertifikatli Ferrari 250 GTO mulk huquqi.',
        sellerAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
      },
      {
        id: 'christies-02',
        title: 'The Pink Star Diamond (Physical Vaulted)',
        currentBidETH: 22000, // ~$71M
        imageUrl: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&q=80',
        source: 'Christie\'s',
        category: 'Fine Art',
        description: 'Christie\'s omborida kafolatlangan 59.6 karatli nodir brilliantning blokcheyn sertifikati.',
        sellerAddress: '0xF39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
      }
    ];

    return [...topRWA, ...liveWeb3];
  } catch (err) {
    console.error("API yuklanishda xatolik:", err);
    return [];
  }
};