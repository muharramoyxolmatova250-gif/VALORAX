import { createHash } from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GSA_API_KEY = process.env.GSA_API_KEY || 'DEMO_KEY';
const API_URL = 'https://api.gsa.gov/assets/gsaauctions/v2/auctions';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable.');
}

const supabaseBase = SUPABASE_URL.replace(/\/$/, '');
const headers = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

function field(record, ...names) {
  const entries = Object.entries(record || {});
  for (const name of names) {
    const found = entries.find(([key]) => key.toLowerCase() === name.toLowerCase());
    if (found && found[1] !== null && found[1] !== undefined && found[1] !== '') return found[1];
  }
  return null;
}

function recordsFrom(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of ['auctions', 'results', 'data', 'records', 'items', 'auction']) {
    const value = payload[key] ?? payload[key[0].toUpperCase() + key.slice(1)];
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const nested = recordsFrom(value);
      if (nested.length) return nested;
    }
  }
  for (const value of Object.values(payload)) {
    if (Array.isArray(value) && value.length && typeof value[0] === 'object') return value;
  }
  return [];
}

function clean(value, max = 500) {
  return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function parseDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function listingUrl(record, saleNo) {
  const raw = field(record, 'ItemDescURL', 'ItemDescriptionURL', 'LotURL', 'URL');
  if (raw) {
    try {
      const url = new URL(String(raw), 'https://www.gsaauctions.gov');
      const host = url.hostname.toLowerCase().replace(/^www\./, '');
      if (url.protocol === 'https:' && (host === 'gsaauctions.gov' || host.endsWith('.gsaauctions.gov'))) {
        url.hash = '';
        return url.href;
      }
    } catch {}
  }
  return `https://www.gsaauctions.gov/auctions/preview/${encodeURIComponent(String(saleNo))}`;
}

function assetClass(title) {
  const text = title.toLowerCase();
  if (/aircraft|airplane|helicopter/.test(text)) return 'aircraft';
  if (/boat|vessel|marine|yacht/.test(text)) return 'boat';
  if (/vehicle|truck|car|automobile|motorcycle|bus/.test(text)) return 'vehicle';
  if (/tractor|grader|excavator|loader|forklift|crane|heavy equipment/.test(text)) return 'heavy_equipment';
  if (/jewelry|jewellery|coin|artwork|painting|sculpture/.test(text)) return 'collectible';
  if (/computer|laptop|server|monitor|electronics/.test(text)) return 'electronics';
  return 'other';
}

function normalize(record) {
  const saleNo = clean(field(record, 'SaleNo', 'SaleNumber'), 80);
  const lotNo = clean(field(record, 'LotNo', 'LotSequence', 'LotNumber'), 80);
  const title = clean(field(record, 'ItemName', 'LotDescript', 'Description'), 500);
  if (!saleNo || !title) return null;

  const start = parseDate(field(record, 'AucStartDt', 'AuctionStartDate'));
  const end = parseDate(field(record, 'AucEndDt', 'AuctionEndDate'));
  const statusCode = clean(field(record, 'AuctionStatus', 'Status'), 4).toUpperCase();
  let listingStatus = 'unknown';
  if (statusCode === 'A') listingStatus = 'active';
  else if (statusCode === 'P' || statusCode === '') listingStatus = 'upcoming';
  if (end && new Date(end).getTime() < Date.now()) listingStatus = 'closed';

  const location = [
    field(record, 'PropertyCity', 'LocationCity'),
    field(record, 'PropertyState', 'LocationST'),
  ].map(v => clean(v, 80)).filter(Boolean).join(', ');
  const highBid = field(record, 'HighBidAmount');
  const reserve = field(record, 'Reserve');
  const sourceUrl = listingUrl(record, saleNo);
  const lotKey = `${saleNo}:${lotNo || '0'}`;
  const now = new Date().toISOString();
  const imageUrl = field(record, 'ImageURL');

  return {
    source_lot_key: lotKey,
    canonical_url: sourceUrl,
    title,
    asset_class: assetClass(title),
    lot_number: lotNo || null,
    auction_house: 'GSA Auctions',
    sale_date: end ? end.slice(0, 10) : null,
    listing_status: listingStatus,
    currency: 'USD',
    location: location || null,
    short_factual_summary: clean(field(record, 'LotDescript', 'ItemName'), 1200) || null,
    identifiers: {
      sale_no: saleNo,
      lot_no: lotNo || null,
      auction_status_code: statusCode || null,
      current_high_bid_usd: highBid ?? null,
      reserve_usd: reserve ?? null,
      agency_name: clean(field(record, 'AgencyName'), 160) || null,
      source_image_url_reference: imageUrl ? String(imageUrl).slice(0, 1000) : null,
    },
    source_title: 'GSA Auctions',
    source_record_hash: createHash('sha256').update(lotKey).digest('hex'),
    verification_status: 'source_checked',
    data_use_status: 'review_required',
    first_seen_at: now,
    last_seen_at: now,
    last_checked_at: now,
    created_at: now,
    updated_at: now,
    hero_image_url: null,
    image_urls: [],
    image_usage_status: 'unknown',
    auction_starts_at: start,
    auction_ends_at: end,
  };
}

async function supabase(path, options = {}) {
  const response = await fetch(`${supabaseBase}/rest/v1/${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
    signal: AbortSignal.timeout(20000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${body.slice(0, 500)}`);
  return body ? JSON.parse(body) : null;
}

async function main() {
  const sources = await supabase(
    'omnisight_lot_sources?domain=eq.gsaauctions.gov&select=id,domain,enabled,access_status,terms_status,automated_access_allowed',
  );
  const source = sources?.[0];
  if (!source || source.enabled !== true || source.access_status !== 'approved' ||
      source.automated_access_allowed !== true ||
      !['permitted', 'licensed', 'permission_granted'].includes(source.terms_status)) {
    throw new Error('GSA source is not approved for automated discovery; refusing to continue.');
  }

  const url = new URL(API_URL);
  url.searchParams.set('api_key', GSA_API_KEY);
  url.searchParams.set('format', 'JSON');
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'VALORAX-OmniSight/1.0 (+https://valorax.netlify.app)' },
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new Error(`GSA Auctions API returned HTTP ${response.status}`);
  const payload = await response.json();
  const raw = recordsFrom(payload);
  if (!raw.length) throw new Error('GSA API response contained no recognizable auction records.');

  const normalized = raw.map(normalize).filter(Boolean);
  const rows = normalized.map(row => ({ ...row, source_id: source.id }));
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    await supabase(
      'omnisight_discovered_lots?on_conflict=source_id,source_lot_key',
      {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify(batch),
      },
    );
    inserted += batch.length;
  }

  const active = normalized.filter(row => row.listing_status === 'active').length;
  const upcoming = normalized.filter(row => row.listing_status === 'upcoming').length;
  console.log(JSON.stringify({
    ok: true,
    source: 'GSA Auctions official public API',
    rawRecords: raw.length,
    normalizedRecords: normalized.length,
    submittedForDeduplicatedInsert: inserted,
    activeCandidates: active,
    upcomingCandidates: upcoming,
    publishedAutomatically: 0,
    note: 'Candidate-only import. No lot is published until the existing value, data-rights and image-rights checks pass.',
    timestamp: new Date().toISOString(),
  }));
}

main().catch(error => {
  console.error('OMNISIGHT_GSA_SYNC_FAILED:', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
});
