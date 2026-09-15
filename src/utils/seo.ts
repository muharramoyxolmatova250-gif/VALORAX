export interface SEOProps {
  title: string;
  price: string;
  imageUrl: string;
}

export function updateAuctionSEO({ title, price, imageUrl }: SEOProps) {
  const fullTitle = `${title} (${price} ETH) | VALOREX VIP Web3 Auction`;
  const description = `Bid anonymously on ${title} via Non-Custodial ZK-Escrow. Exclusive 24/7 Web3 Auction.`;

  if (typeof window !== 'undefined') {
    window.document.title = fullTitle;

    const setMetaTag = (nameAttr: string, propertyValue: string, content: string) => {
      let element = window.document.querySelector(`meta[${nameAttr}="${propertyValue}"]`);
      if (!element) {
        element = window.document.createElement('meta');
        element.setAttribute(nameAttr, propertyValue);
        window.document.head.appendChild(element);
      }
      element.setAttribute('content', content);
    };

    setMetaTag('name', 'description', description);
    setMetaTag('property', 'og:title', fullTitle);
    setMetaTag('property', 'og:description', description);
    setMetaTag('property', 'og:image', imageUrl);
    setMetaTag('property', 'twitter:title', fullTitle);
    setMetaTag('property', 'twitter:description', description);
  }
}