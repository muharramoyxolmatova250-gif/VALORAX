import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SEARXNG_BASE_URL = "https://valorax-searxng.onrender.com";
const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

const PASSES = [
  ["hypercar", 'hypercar "bidding now" OR "upcoming auction" lot estimate $500000'],
  ["classic_car", 'classic car "open for bidding" OR "upcoming auction" individual lot estimate $500000'],
  ["racing_car", 'historic racing car "bidding now" OR "upcoming auction" lot estimate $500000'],
  ["watch", 'rare luxury watch "open for bidding" OR "upcoming auction" lot estimate $500000'],
  ["fine_art", 'masterpiece painting "bidding now" OR "upcoming auction" individual lot estimate $500000'],
  ["sculpture", 'important sculpture "open for bidding" OR "upcoming auction" lot estimate $500000'],
  ["jewellery", 'important diamond jewellery "bidding now" OR "upcoming auction" lot estimate $500000'],
  ["coin", 'rare coin "open for bidding" OR "upcoming auction" lot estimate $500000'],
  ["historical_artifact", 'important antiquity "bidding now" OR "upcoming auction" lot estimate $500000'],
  ["collectible", 'important collectible memorabilia "open for bidding" OR "upcoming auction" lot estimate $500000'],
  ["yacht", 'superyacht "for sale by auction" "bidding open" asking price'],
  ["aircraft", 'private jet aircraft "auction" "bidding open" asking price'],
  ["real_estate", 'trophy estate "property auction" "bidding open" asking price'],
  ["business", 'company equity "open for bids" OR "auction" current offering valuation']
] as const;

const MAX_PAGES = 5;
const MAX_RESULTS_PER_PAGE = 10;
const USER_AGENT = "VALORAX-OmniSight/1.1 (+https://valorax.netlify.app)";
const PRIVATE_HOSTS = new Set(["localhost", "localhost.localdomain", "metadata.google.internal"]);

function cleanText(value: unknown, max: number) {
  return typeof value === "string"
    ? value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}
function safeListingUrl(raw: unknown): URL | null {
  try {
    if (typeof raw !== "string") return null;
    const u = new URL(raw);
    if (u.protocol !== "https:" || !u.hostname.includes(".") || u.username || u.password) return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (PRIVATE_HOSTS.has(host) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.endsWith(".local") || host.endsWith(".internal")) return null;
    if (["google.com", "bing.com", "duckduckgo.com", "searxng.org", "valorax-searxng.onrender.com"].includes(host)) return null;
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i.test(key)) u.searchParams.delete(key);
    return u;
  } catch { return null; }
}
async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, "0")).join("");
}
function attrs(tag: string) {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) out[m[1].toLowerCase()] = cleanText(m[2] ?? m[3] ?? m[4] ?? "", 3000);
  return out;
}
function meta(html: string, keys: string[]) {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    if (keys.includes((a.property || a.name || a.itemprop || "").toLowerCase()) && a.content) return a.content;
  }
  return "";
}
function jsonLd(html: string) {
  const found: Record<string, unknown>[] = [];
  for (const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const walk = (v: unknown) => {
        if (!v || typeof v !== "object") return;
        if (Array.isArray(v)) { v.forEach(walk); return; }
        const obj = v as Record<string, unknown>;
        found.push(obj);
        Object.values(obj).forEach(walk);
      };
      walk(parsed);
    } catch { /* ignore malformed third-party JSON-LD */ }
  }
  return found;
}

function extractUsdLotValue(html: string): number | null {
  const text = cleanText(html, 250000);
  const patterns = [
    /(?:estimate(?:d)?(?:\s+(?:at|between|from))?|asking\s+price|starting\s+bid|current\s+bid|reserve(?:\s+price)?|valuation|price)\D{0,100}\$\s*([\d,]+(?:\.\d+)?)\s*(million|mn|m|thousand|k)?\b/ig,
    /(?:estimate(?:d)?(?:\s+(?:at|between|from))?|asking\s+price|starting\s+bid|current\s+bid|reserve(?:\s+price)?|valuation|price)\D{0,100}USD\s*([\d,]+(?:\.\d+)?)\s*(million|mn|m|thousand|k)?\b/ig
  ];
  for (const re of patterns) {
    for (const match of text.matchAll(re)) {
      const base = Number(match[1].replace(/,/g, ""));
      const unit = (match[2] || "").toLowerCase();
      const value = base * (["million", "mn", "m"].includes(unit) ? 1_000_000 : ["thousand", "k"].includes(unit) ? 1_000 : 1);
      if (Number.isFinite(value) && value >= 500000 && value < 1e12) return value;
    }
  }
  return null;
}
function has500kUsdEvidence(text: string) {
  return extractUsdLotValue(text) !== null;
}

function parsePage(html: string, fallback: string, pageUrl: URL) {
  const nodes = jsonLd(html);
  const node = nodes.find(n => /Product|Vehicle|IndividualProduct|Event/i.test(String(n["@type"] || ""))) || nodes[0] || {};
  const title = cleanText(meta(html, ["og:title", "twitter:title"]) || node.name || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "") || fallback, 500);
  const description = cleanText(meta(html, ["og:description", "description", "twitter:description"]) || node.description, 1200);
  const sku = cleanText(node.sku || node.productID || meta(html, ["product:retailer_item_id", "lotnumber", "lot-number"]), 100);
  const offer = (node.offers && typeof node.offers === "object" ? node.offers : {}) as Record<string, unknown>;
  const priceRaw = offer.price ?? node.price ?? meta(html, ["product:price:amount"]);
  const price = typeof priceRaw === "number" ? priceRaw : (typeof priceRaw === "string" && /^\d+(\.\d+)?$/.test(priceRaw.replace(/,/g, "")) ? Number(priceRaw.replace(/,/g, "")) : null);
  const currency = cleanText(offer.priceCurrency || meta(html, ["product:price:currency"]), 3).toUpperCase();
  const visibleUsdValue = extractUsdLotValue(html);
  const availability = cleanText(offer.availability || "", 100);
  const rawImages: string[] = [];
  const metaImage = meta(html, ["og:image", "og:image:url", "twitter:image", "twitter:image:src"]);
  if (metaImage) rawImages.push(metaImage);
  const nodeImage = typeof node.image === "string" ? [node.image] : Array.isArray(node.image) ? node.image.map((v: unknown) => typeof v === "string" ? v : v && typeof v === "object" ? String((v as Record<string, unknown>).url || "") : "") : node.image && typeof node.image === "object" ? [String((node.image as Record<string, unknown>).url || "")] : [];
  rawImages.push(...nodeImage);
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const candidate = a.src || a["data-src"] || a["data-original"] || (a.srcset ? a.srcset.split(",")[0].trim().split(/\s+/)[0] : "");
    if (candidate) rawImages.push(candidate);
  }
  const imageUrls: string[] = [];
  for (const raw of rawImages) {
    try {
      const candidate = new URL(String(raw || ""), pageUrl);
      const path = candidate.pathname.toLowerCase();
      if (candidate.protocol !== "https:" || !candidate.hostname.includes(".") || candidate.username || candidate.password) continue;
      if (candidate.href === pageUrl.href) continue;
      if (["logo", "icon", "avatar", "sprite", "placeholder", "tracking"].some(term => path.includes(term))) continue;
      if (path.endsWith(".svg") || path.endsWith(".gif")) continue;
      if (!imageUrls.includes(candidate.href)) imageUrls.push(candidate.href);
    } catch { /* ignore invalid image URL */ }
    if (imageUrls.length >= 8) break;
  }
  const result: Record<string, unknown> = {};
  if (title) result.title = title;
  if (imageUrls.length) result.image_urls = imageUrls;
  if (description) result.short_factual_summary = description;
  if (sku) result.lot_number = sku;
  if (price !== null && Number.isFinite(price) && price > 0 && price < 1e12) {
    if (/^[A-Z]{3}$/.test(currency)) result.currency = currency;
    if (currency === "USD") {
      result.published_value_usd = price;
      result.value_basis = "asking_price";
    }
  }
  if (visibleUsdValue !== null && (currency === "USD" || /\$/.test(cleanText(html, 250000)))) {
    result.published_value_usd = visibleUsdValue;
    result.value_basis = "estimate_or_asking_price";
  }
  if (/soldout|outofstock/i.test(availability)) result.listing_status = "sold";
  else if (/instock|limitedavailability/i.test(availability)) result.listing_status = "active";
  return result;
}

async function searchLotImages(title: string, lotUrl: URL, expectedHost: string): Promise<string[]> {
  // Search the open web like a normal visual search: exact artwork/lot title,
  // not only images hosted on the auction house's own domain.
  const query = new URL("/search", SEARXNG_BASE_URL);
  query.searchParams.set("q", '"' + title.slice(0, 140).replace(/["']/g, " ") + '" auction artwork');
  query.searchParams.set("format", "json");
  query.searchParams.set("categories", "images");
  query.searchParams.set("language", "en");
  query.searchParams.set("safesearch", "1");
  query.searchParams.set("engines", "yandex,bing");
  const response = await fetch(query, {
    headers: { "User-Agent": USER_AGENT, "Accept": "application/json" },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) return [];
  const payload = await response.json();
  const images: string[] = [];
  const normalize = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
  const titleNorm = normalize(title);
  const titleTokens = titleNorm.split(/\s+/).filter(t => t.length > 2 && !["the","and","with","from","pour","les","des"].includes(t));
  for (const raw of (Array.isArray(payload.results) ? payload.results : []).slice(0, 30)) {
    const hit = raw as Record<string, unknown>;
    const evidence = normalize([hit.title, hit.content, hit.source, hit.url].filter(Boolean).join(" "));
    const matched = titleTokens.filter(token => evidence.includes(token)).length;
    // Require a meaningful title match so unrelated auction pictures are not attached.
    if (!evidence.includes(titleNorm) && matched < Math.max(2, Math.ceil(titleTokens.length * 0.6))) continue;
    const rawImage = typeof hit.img_src === "string" ? hit.img_src
      : typeof hit.thumbnail_src === "string" ? hit.thumbnail_src
      : "";
    try {
      const image = new URL(rawImage, lotUrl);
      if (image.protocol !== "https:" || !image.hostname.includes(".") || image.username || image.password) continue;
      if (["localhost", "metadata.google.internal"].includes(image.hostname.toLowerCase())) continue;
      if (/\.(svg|gif)(?:$|\?)/i.test(image.href)) continue;
      if (!images.includes(image.href)) images.push(image.href);
    } catch { /* ignore malformed image results */ }
    if (images.length >= 4) break;
  }
  return images;
}

async function robotsAllows(url: URL) {
  const robotsUrl = new URL("/robots.txt", url.origin);
  const response = await fetch(robotsUrl, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(5000), redirect: "error" });
  if (response.status === 404) return true;
  if (!response.ok) return false;
  const lines = (await response.text()).split(/\r?\n/);
  let inRelevantGroup = false, sawSpecific = false, disallows: string[] = [];
  for (const raw of lines) {
    const line = raw.split("#")[0].trim();
    if (!line) continue;
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase(), value = line.slice(i + 1).trim();
    if (key === "user-agent") {
      if (disallows.length) break;
      const match = value === "*" || USER_AGENT.toLowerCase().includes(value.toLowerCase());
      if (match && (!sawSpecific || value !== "*")) { inRelevantGroup = true; if (value !== "*") sawSpecific = true; }
      else if (inRelevantGroup) inRelevantGroup = false;
    } else if (inRelevantGroup && key === "disallow" && value) disallows.push(value);
  }
  return !disallows.some(path => url.pathname.startsWith(path));
}
async function readApprovedLotPage(url: URL, source: Record<string, unknown>, fallback: string) {
  if (source.enabled !== true || source.automated_access_allowed !== true || source.access_status !== "approved" || !["permitted", "licensed", "permission_granted"].includes(String(source.terms_status))) {
    return { checked: false, reason: "SOURCE_NOT_APPROVED", patch: {} };
  }
  if (!await robotsAllows(url)) return { checked: false, reason: "ROBOTS_DISALLOW_OR_UNAVAILABLE", patch: {} };
  const delay = Math.max(1000, Number(source.crawl_delay_ms || 1000));
  const last = source.last_checked_at ? new Date(String(source.last_checked_at)).getTime() : 0;
  if (last && Date.now() - last < delay) return { checked: false, reason: "SOURCE_CRAWL_DELAY", patch: {} };
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml;q=0.9" }, signal: AbortSignal.timeout(10000), redirect: "follow" });
  const finalUrl = new URL(response.url || url.href);
  if (!response.ok || finalUrl.protocol !== "https:" || finalUrl.hostname.toLowerCase() !== url.hostname.toLowerCase()) return { checked: false, reason: "LOT_PAGE_FETCH_FAILED", patch: {} };
  if (!(response.headers.get("content-type") || "").toLowerCase().includes("text/html")) return { checked: false, reason: "NOT_HTML", patch: {} };
  const reader = response.body?.getReader();
  if (!reader) return { checked: false, reason: "EMPTY_PAGE", patch: {} };
  const chunks: Uint8Array[] = []; let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > 1_000_000) { await reader.cancel(); return { checked: false, reason: "PAGE_TOO_LARGE", patch: {} }; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const patch = parsePage(new TextDecoder().decode(bytes), fallback, finalUrl);
  const imageRights = String(source.image_rights_status || "unknown");
  if (Array.isArray(patch.image_urls) && patch.image_urls.length) {
    patch.image_usage_status = imageRights === "licensed" ? "licensed" : imageRights === "permission_granted" ? "permission_granted" : "restricted";
    if (["licensed", "permission_granted"].includes(imageRights) && source.image_rights_reference && source.image_rights_reviewed_at) {
      patch.hero_image_url = patch.image_urls[0];
      patch.image_rights_reference = source.image_rights_reference;
    }
  }
  return { checked: Object.keys(patch).length > 0, reason: "PAGE_READ", patch };
}


Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return Response.json({ error: "POST_REQUIRED" }, { status: 405 });
  const body = await req.json().catch(() => ({}));
  const token = req.headers.get("x-omnisight-cron-secret") || "";
  if (!token) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { data: allowed, error: authError } = await db.rpc("omnisight_authorize_worker", { p_token: token });
  if (authError || allowed !== true) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });

  // Enrich previously discovered lots from currently approved sources so existing rows
  // are not permanently skipped by the discovery upsert's ignoreDuplicates setting.
  let imagePagesChecked = 0, imageUrlsFound = 0, imagePagesFailed = 0;
  const { data: approvedSources, error: approvedSourcesError } = await db.from("omnisight_lot_sources")
    .select("id,domain,enabled,access_status,terms_status,automated_access_allowed,rights_basis,licence_reference,robots_url,crawl_delay_ms,max_requests_per_hour,last_robots_checked_at,image_rights_status,image_rights_reference,image_rights_reviewed_at")
    .eq("enabled", true).eq("automated_access_allowed", true).eq("access_status", "approved")
    .in("terms_status", ["permitted", "licensed", "permission_granted"]);
  if (approvedSourcesError) throw approvedSourcesError;
  for (const source of (approvedSources || []).slice(0, 3)) {
    const { data: pendingImages, error: pendingError } = await db.from("omnisight_discovered_lots")
      .select("id,canonical_url,title,image_urls,hero_image_url")
      .eq("source_id", source.id)
      .order("last_checked_at", { ascending: true, nullsFirst: true }).limit(5);
    if (pendingError) throw pendingError;
    for (const lot of (pendingImages || [])) {
      if (lot.hero_image_url || (Array.isArray(lot.image_urls) && lot.image_urls.length > 0)) continue;
      try {
        const pageUrl = safeListingUrl(lot.canonical_url);
        if (!pageUrl) { imagePagesFailed++; continue; }
        const checked = await readApprovedLotPage(pageUrl, source as Record<string, unknown>, lot.title || "Auction lot");
        imagePagesChecked++;
        const patch = checked.patch || {};
        let candidateImages = Array.isArray(patch.image_urls) ? [...patch.image_urls] as string[] : [];
        // Fallback: search indexed images for this exact lot, accepting only image hits
        // whose source page belongs to the approved auction-house domain.
        if (candidateImages.length === 0) {
          try {
            const imageSearchUrl = new URL("/search", SEARXNG_BASE_URL);
            imageSearchUrl.searchParams.set("q", '"' + String(lot.title || "").slice(0, 160) + '" site:' + source.domain);
            imageSearchUrl.searchParams.set("format", "json");
            imageSearchUrl.searchParams.set("categories", "images");
            imageSearchUrl.searchParams.set("language", "en");
            imageSearchUrl.searchParams.set("safesearch", "1");
            imageSearchUrl.searchParams.set("engines", "yandex,bing");
            const imageResponse = await fetch(imageSearchUrl, { headers: { "User-Agent": USER_AGENT, "Accept": "application/json" }, signal: AbortSignal.timeout(10000) });
            if (imageResponse.ok) {
              const imagePayload = await imageResponse.json();
              for (const hit of (Array.isArray(imagePayload.results) ? imagePayload.results : []).slice(0, 10)) {
                const item = hit as Record<string, unknown>;
                const sourcePage = safeListingUrl(item.url);
                const imageUrl = safeListingUrl(item.img_src || item.thumbnail_src);
                if (!sourcePage || !imageUrl || sourcePage.hostname.toLowerCase().replace(/^www\./, "") !== String(source.domain).toLowerCase().replace(/^www\./, "")) continue;
                if (!candidateImages.includes(imageUrl.href)) candidateImages.push(imageUrl.href);
                if (candidateImages.length >= 8) break;
              }
            }
          } catch { /* image search is optional; retry on the next scheduled pass */ }
        }
        if (candidateImages.length > 0) {
          const imageRights = String(source.image_rights_status || "unknown");
          const canDisplay = ["licensed", "permission_granted"].includes(imageRights) && source.image_rights_reference && source.image_rights_reviewed_at;
          const imageUpdate: Record<string, unknown> = {
            image_urls: candidateImages,
            image_usage_status: canDisplay ? imageRights : "restricted",
            updated_at: new Date().toISOString()
          };
          if (canDisplay) {
            imageUpdate.hero_image_url = candidateImages[0];
            imageUpdate.image_rights_reference = source.image_rights_reference;
          }
          if (patch.hero_image_url && patch.image_rights_reference) {
            imageUpdate.hero_image_url = patch.hero_image_url;
            imageUpdate.image_rights_reference = patch.image_rights_reference;
          }
          const { error: updateError } = await db.from("omnisight_discovered_lots").update(imageUpdate).eq("id", lot.id);
          if (updateError) throw updateError;
          imageUrlsFound++;
        }
      } catch { imagePagesFailed++; }
    }
  }
  const minute = Math.floor(Date.now() / 60000);
  const batchSize = PASSES.length;
  const selected = Array.from({length: batchSize}, (_, i) => PASSES[(minute * batchSize + i) % PASSES.length]);
  let rawResults = 0, stored = 0, duplicates = 0, skipped = 0, pagesRead = 0, pagesFailed = 0, pagesEnriched = 0, imageSearches = 0, imageResultsFound = 0;
  const pageErrors: string[] = [];
  const queryStats: Array<Record<string, unknown>> = [];
  const rejectionSamples: Array<Record<string, unknown>> = [];
  const runQuery = async ([assetClass, query]: readonly [string, string]) => {
    let qRaw = 0, qPages = 0, qFailed = 0, qStored = 0, qDuplicates = 0, qSkipped = 0, qEnriched = 0;
    const errors: string[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const searchUrl = new URL("/search", SEARXNG_BASE_URL);
      const valueQualifiedQuery = `${query} ("$500,000+" OR "$500k+" OR "500,000 USD" OR "estimate $500,000" OR "over $500,000") ("with photos" OR images OR photographs OR "photo gallery" OR "view images" OR "lot pictures")`;
      searchUrl.searchParams.set("q", valueQualifiedQuery);
      searchUrl.searchParams.set("format", "json");
      searchUrl.searchParams.set("language", "en");
      searchUrl.searchParams.set("safesearch", "1");
      searchUrl.searchParams.set("engines", "yandex,bing");
      searchUrl.searchParams.set("pageno", String(page));
      let payload: Record<string, unknown>;
      try {
        const response = await fetch(searchUrl, {
          headers: { "User-Agent": USER_AGENT, "Accept": "application/json" },
          signal: AbortSignal.timeout(12000)
        });
        if (!response.ok) { qFailed++; errors.push("PAGE_" + page + "_HTTP_" + response.status); continue; }
        payload = await response.json();
      } catch (error) {
        qFailed++;
        errors.push("PAGE_" + page + "_" + (error instanceof Error ? error.name : "FETCH_ERROR"));
        continue;
      }
      qPages++;
      const results = Array.isArray(payload.results) ? payload.results.slice(0, MAX_RESULTS_PER_PAGE) : [];
      if (!results.length) break;
      qRaw += results.length;
      for (const hit of results) {
        const url = safeListingUrl((hit as Record<string, unknown>)?.url);
        const title = cleanText((hit as Record<string, unknown>)?.title, 500);
        if (!url || !title) { qSkipped++; continue; }
        const host = url.hostname.toLowerCase().replace(/^www\./, "");
        const hash = await sha256(url.href);
        let { data: source, error: sourceReadError } = await db.from("omnisight_lot_sources")
          .select("id,domain,enabled,access_status,terms_status,automated_access_allowed,rights_basis,licence_reference,robots_url,crawl_delay_ms,max_requests_per_hour,last_robots_checked_at,image_rights_status,image_rights_reference,image_rights_reviewed_at")
          .eq("domain", host).maybeSingle();
        if (sourceReadError) throw sourceReadError;
        if (!source) {
          const inserted = await db.from("omnisight_lot_sources").insert({
            domain: host, display_name: host, source_type: "other", access_method: "manual_import",
            access_status: "pending_review", terms_status: "unknown", automated_access_allowed: false,
            enabled: false, crawl_delay_ms: 5000, max_requests_per_hour: 1
          }).select("id,domain,enabled,access_status,terms_status,automated_access_allowed,rights_basis,licence_reference,crawl_delay_ms,max_requests_per_hour").single();
          if (inserted.error) {
            const retry = await db.from("omnisight_lot_sources").select("id,domain,enabled,access_status,terms_status,automated_access_allowed,rights_basis,licence_reference,crawl_delay_ms,max_requests_per_hour").eq("domain", host).maybeSingle();
            if (retry.error || !retry.data) throw inserted.error;
            source = retry.data;
          } else source = inserted.data;
        }
        const summary = cleanText((hit as Record<string, unknown>)?.content, 1200);
        const searchText = (title + " " + summary + " " + url.href).toLowerCase();
        const path = url.pathname.toLowerCase();
        // Auction houses use different canonical lot URL patterns. Sotheby's uses
        // /en/buy/auction/{year}/{sale-slug}/{lot-slug}, not /lot(s)/.
        const sothebysLotPath = host === "sothebys.com" && /\/en\/buy\/auction\/\d{4}\/[^/]+\/[^/]+\/?$/.test(path);
        const detailPath = sothebysLotPath || path.includes("/lots/") || path.includes("/lot/")
          || /\/auctions?\/[^/]+\/lots?\/[^/]+/.test(path);
        const numberedCatalogTitle = sothebysLotPath && /^\s*\d{1,5}[.]\s+/.test(title);
        const explicitLotRecordPath = /\/(?:lots?|lot-details?|lotdetail|items?|objects?|artworks?|catalogue|catalog|auction-lot)\/[^/?#]{2,}(?:\/|$)/i.test(path)
          || sothebysLotPath;
        const pathParts = path.split("/").filter(Boolean);
        const excludedPath = /\/(?:search|results|category|categories|departments?|collections?|artists?|auction-calendar|calendar|about|contact|news|blog|events?|buy|sell|login|register|account|help|terms|privacy|tag|tags|page|pages)(?:\/|$)/i.test(path);
        // Only accept a real lot-detail URL, not an arbitrary product/article page.
        const strictLotPath = sothebysLotPath
          || /\/(?:lots?|lot-details?|lotdetail|auction-lot)\/[^/?#]{2,}(?:\/|$)/i.test(path);
        const titleHasLotIdentity = numberedCatalogTitle
          || /\b(lot\s*(?:no\.?|number|#)?\s*[:#-]?\s*[a-z0-9-]+|catalogue number|item number)\b/i.test(title)
          || /\b(lot\s+(?:no\.?|number|#)?|lot\s*#)\b/i.test(title);
        const hasAuctionEvidence = /\b(auction|bidding|bid|estimate|hammer price|auction house|auctioneer)\b/i.test(title + " " + summary);
        const closedEvidence = /\b(sold|realized|realised|past auction|auction results|lot results|ended|closed bidding|archived)\b/i.test(title + " " + summary);
        const openEvidence = /\b(open for bidding|bidding (?:is )?open|bidding now|bid now|current bid|live bidding|upcoming auction|register to bid|accepting bids|auction starts|auction ends|ends in|closes? (?:today|tomorrow|in))\b/i.test(title + " " + summary);
        const editorialPage = /\b(press release|news article|blog post|auction results|sale results|auction calendar|upcoming auctions|past auctions|department|category)\b/i.test(title + " " + summary)
          || /\/(?:news|blog|press|stories|articles|calendar|results|departments|categories)(?:\/|$)/i.test(path);
        const plausibleItem = strictLotPath && !excludedPath
          && title.length >= 12 && hasAuctionEvidence && titleHasLotIdentity && !editorialPage;
        const highValueEvidence = has500kUsdEvidence(title + " " + summary);
        // Do not store generic search hits: require a specific lot URL, explicit USD 500k+ evidence,
        // and positive evidence that bidding is currently open or the sale is upcoming.
        if (!plausibleItem || closedEvidence || !openEvidence || !highValueEvidence) {
          qSkipped++;
          if (rejectionSamples.length < 25) rejectionSamples.push({
            title, url: url.href, path, plausibleItem, titleHasLotIdentity,
            hasAuctionEvidence, closedEvidence, editorialPage, highValueEvidence, summary: summary.slice(0, 180)
          });
          continue;
        }
        let pagePatch: Record<string, unknown> = {};
        let pageVerified = false;
        if (source?.enabled === true && source?.automated_access_allowed === true && source?.access_status === "approved" && ["permitted", "licensed", "permission_granted"].includes(String(source?.terms_status))) {
          try {
            const checked = await readApprovedLotPage(url, source as Record<string, unknown>, title);
            pagePatch = checked.patch;
            pageVerified = checked.checked;
          } catch { /* retry source verification on later pass */ }
        }
        let foundImages = Array.isArray(pagePatch.image_urls) ? [...pagePatch.image_urls] as string[] : [];
        if (foundImages.length === 0 && imageSearches < 20) {
          imageSearches++;
          try {
            foundImages = await searchLotImages(String(pagePatch.title || title), url, host);
            imageResultsFound += foundImages.length;
          } catch { /* image search is retried on the next discovery pass */ }
        }
        const now = new Date().toISOString();
        const row = {
          source_id: source.id, source_lot_key: hash, canonical_url: url.href, title: String(pagePatch.title || title),
          asset_class: assetClass, listing_status: pagePatch.listing_status || (openEvidence ? (/upcoming auction|auction starts/i.test(searchText) ? "upcoming" : "active") : "unknown"),
          short_factual_summary: pagePatch.short_factual_summary || summary || null,
          source_title: host, source_record_hash: hash,
          verification_status: pageVerified ? "source_checked" : "candidate",
          data_use_status: "review_required", first_seen_at: now, last_seen_at: now,
          image_urls: foundImages, hero_image_url: pagePatch.hero_image_url || null,
          image_usage_status: pagePatch.image_usage_status || (foundImages.length ? "link_only" : "link_only"),
          ...pagePatch,
          image_urls: foundImages,
          image_usage_status: pagePatch.image_usage_status || "link_only",
          ...(pagePatch.published_value_usd ? { value_source_url: url.href, value_checked_at: now } : {})
        };
        const { data: insertedLot, error: lotError } = await db.from("omnisight_discovered_lots")
          .upsert(row, { onConflict: "source_id,source_lot_key", ignoreDuplicates: true })
          .select("id");
        if (lotError) throw lotError;
        if (insertedLot?.length) qStored++; else {
          qDuplicates++;
          const { data: existingLot, error: existingError } = await db.from("omnisight_discovered_lots")
            .select("id,image_urls,image_usage_status").eq("source_id", source.id).eq("source_lot_key", hash).maybeSingle();
          if (existingError) throw existingError;
          if (existingLot) {
            const refresh: Record<string, unknown> = { last_seen_at: now, updated_at: now };
            if (foundImages.length) {
              const prior = Array.isArray(existingLot.image_urls) ? existingLot.image_urls as string[] : [];
              refresh.image_urls = [...new Set([...prior, ...foundImages])].slice(0, 8);
              if (!existingLot.image_usage_status || existingLot.image_usage_status === "link_only") refresh.image_usage_status = "link_only";
            }
            const { error: refreshError } = await db.from("omnisight_discovered_lots").update(refresh).eq("id", existingLot.id);
            if (refreshError) throw refreshError;
          }
          if (foundImages.length) {

          }
        }
        if (pageVerified) qEnriched++;
      }
    }
    return { assetClass, query, rawResults:qRaw, pagesRead:qPages, pagesFailed:qFailed, stored:qStored, duplicates:qDuplicates, skipped:qSkipped, pagesEnriched:qEnriched, errors };
  };
  const results = await Promise.all(selected.map(q => runQuery(q)));
  for (const s of results) {
    rawResults += Number(s.rawResults || 0); pagesRead += Number(s.pagesRead || 0);
    pagesFailed += Number(s.pagesFailed || 0); stored += Number(s.stored || 0);
    duplicates += Number(s.duplicates || 0); skipped += Number(s.skipped || 0);
    pagesEnriched += Number(s.pagesEnriched || 0);
    pageErrors.push(...(s.errors as string[]));
    queryStats.push(s);
  }
  const { data: publishedCount, error: publishError } = await db.rpc("omnisight_publish_eligible_lots");
  if (publishError) throw publishError;
  return Response.json({
    ok: true, queriesRun: selected.length, queryStats, pagesPerQuery: MAX_PAGES, maxResultsPerPage: MAX_RESULTS_PER_PAGE, pagesRead, pagesFailed, publishedCount: publishedCount ?? 0,
    rawResults, stored, duplicates, skipped, pagesEnriched, rejectionSamples, imagePagesChecked, imageUrlsFound, imagePagesFailed, imageSearches, imageResultsFound, pageErrors,
    targetRawPerDay: 100000, theoreticalRawPerDayAtCurrentCadence: selected.length * MAX_PAGES * MAX_RESULTS_PER_PAGE * 144,
    mode: "strict discovery: individual auction-lot URL, auction evidence and explicit USD 500,000+ value evidence in the search snippet; approved source-page value extraction required before publication; photo/image terms retained; images hidden unless rights are licensed or permission granted",
    timestamp: new Date().toISOString()
  });
});
