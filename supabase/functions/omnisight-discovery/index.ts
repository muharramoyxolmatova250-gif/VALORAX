import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SEARXNG_BASE_URL = "https://valorax-searxng.onrender.com";
const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

const PASSES = [
  ["hypercar", "site:rmsothebys.com OR site:bonhams.com OR site:goodingco.com hypercar auction lot upcoming"],
  ["classic_car", "classic car auction lot upcoming live estimate"],
  ["racing_car", "historic racing car auction lot upcoming estimate"],
  ["watch", "rare luxury watch auction lot upcoming estimate"],
  ["fine_art", "fine art painting auction lot upcoming estimate"],
  ["sculpture", "rare sculpture auction lot upcoming estimate"],
  ["jewellery", "exceptional jewellery gemstone auction lot estimate"],
  ["coin", "rare coin banknote auction lot estimate"],
  ["historical_artifact", "historical artifact antiquities auction lot upcoming"],
  ["collectible", "rare collectible memorabilia auction lot estimate"],
  ["yacht", "superyacht yacht auction listing asking price"],
  ["aircraft", "private aircraft helicopter auction listing price"],
  ["real_estate", "luxury estate trophy real estate auction listing"],
  ["business", "business equity company stake auction listing"]
] as const;

const MAX_PAGES = 3;
const MAX_RESULTS_PER_PAGE = 10;
const USER_AGENT = "VALORAX-OmniSight/1.1 (+https://valorax.netlify.app)";
const PRIVATE_HOSTS = new Set(["localhost", "localhost.localdomain", "metadata.google.internal"]);
const EXCLUDED_SOURCE_HOSTS = new Set(["gsaauctions.gov", "www.gsaauctions.gov"]);

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
function parsePage(html: string, fallback: string) {
  const nodes = jsonLd(html);
  const node = nodes.find(n => /Product|Vehicle|IndividualProduct|Event/i.test(String(n["@type"] || ""))) || nodes[0] || {};
  const title = cleanText(meta(html, ["og:title", "twitter:title"]) || node.name || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "") || fallback, 500);
  const description = cleanText(meta(html, ["og:description", "description", "twitter:description"]) || node.description, 1200);
  const sku = cleanText(node.sku || node.productID || meta(html, ["product:retailer_item_id", "lotnumber", "lot-number"]), 100);
  const offer = (node.offers && typeof node.offers === "object" ? node.offers : {}) as Record<string, unknown>;
  const priceRaw = offer.price ?? node.price ?? meta(html, ["product:price:amount"]);
  const price = typeof priceRaw === "number" ? priceRaw : (typeof priceRaw === "string" && /^\d+(\.\d+)?$/.test(priceRaw.replace(/,/g, "")) ? Number(priceRaw.replace(/,/g, "")) : null);
  const currency = cleanText(offer.priceCurrency || meta(html, ["product:price:currency"]), 3).toUpperCase();
  const availability = cleanText(offer.availability || "", 100);
  const imageValue = node.image || meta(html, ["og:image", "twitter:image", "twitter:image:src"]);
  const imageCandidates = (Array.isArray(imageValue) ? imageValue : [imageValue])
    .flatMap(value => typeof value === "string" ? [value] : value && typeof value === "object" && typeof (value as Record<string, unknown>).url === "string" ? [(value as Record<string, unknown>).url as string] : [])
    .map(value => { try { const imageUrl = new URL(value, fallback); return imageUrl.protocol === "https:" ? imageUrl.href : null; } catch { return null; } })
    .filter((value): value is string => Boolean(value))
    .slice(0, 8);
  if (imageCandidates.length) result.image_urls = [...new Set(imageCandidates)];
  const result: Record<string, unknown> = {};
  if (title) result.title = title;
  if (description) result.short_factual_summary = description;
  if (sku) result.lot_number = sku;
  if (price !== null && Number.isFinite(price) && price > 0 && price < 1e12 && /^[A-Z]{3}$/.test(currency)) {
    result.currency = currency;
    if (currency === "USD") {
      result.published_value_usd = price;
      result.value_basis = "source_page_observed_price";
    }
  }
  const startRaw = node.startDate || node.startDateTime || node.auctionStartDate;
  const endRaw = node.endDate || node.endDateTime || node.auctionEndDate;
  const start = typeof startRaw === "string" ? new Date(startRaw) : null;
  const end = typeof endRaw === "string" ? new Date(endRaw) : null;
  if (start && Number.isFinite(start.getTime())) result.auction_starts_at = start.toISOString();
  if (end && Number.isFinite(end.getTime())) result.auction_ends_at = end.toISOString();
  const organizer = (node.organizer && typeof node.organizer === "object" ? node.organizer : {}) as Record<string, unknown>;
  const seller = (node.seller && typeof node.seller === "object" ? node.seller : {}) as Record<string, unknown>;
  const auctionHouse = cleanText(organizer.name || seller.name, 200);
  if (auctionHouse) result.auction_house = auctionHouse;
  if (/soldout|outofstock/i.test(availability)) result.listing_status = "sold";
  else if (start && Number.isFinite(start.getTime()) && start.getTime() > Date.now()) result.listing_status = "upcoming";
  else if (end && Number.isFinite(end.getTime()) && end.getTime() < Date.now()) result.listing_status = "closed";
  else if (/instock|limitedavailability/i.test(availability)) result.listing_status = "active";
  else if (start && Number.isFinite(start.getTime())) result.listing_status = "active";
  return result;
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
async function fetchRenderedHtml(url: URL): Promise<string | null> {
  const workerUrl = Deno.env.get("OMNISIGHT_BROWSER_WORKER_URL");
  const token = Deno.env.get("OMNISIGHT_BROWSER_TOKEN");
  if (!workerUrl || !token) return null;
  let endpoint: URL;
  try { endpoint = new URL("/render", workerUrl); } catch { return null; }
  if (endpoint.protocol !== "https:") return null;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url: url.href, expectedHost: url.hostname }),
    signal: AbortSignal.timeout(45000),
    redirect: "error"
  });
  if (!response.ok) throw new Error("BROWSER_WORKER_HTTP_" + response.status);
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > 1_500_000) throw new Error("BROWSER_WORKER_RESPONSE_TOO_LARGE");
  const payload = JSON.parse(text) as Record<string, unknown>;
  if (payload.ok !== true || typeof payload.html !== "string" || typeof payload.finalUrl !== "string") {
    throw new Error("BROWSER_WORKER_INVALID_RESPONSE");
  }
  const finalUrl = new URL(payload.finalUrl);
  if (finalUrl.protocol !== "https:" || finalUrl.hostname.toLowerCase() !== url.hostname.toLowerCase()) {
    throw new Error("BROWSER_WORKER_FINAL_HOST_MISMATCH");
  }
  return payload.html;
}

async function readApprovedLotPage(url: URL, source: Record<string, unknown>, fallback: string, sourceFetchAt: Map<string, number>) {
  if (source.enabled !== true || source.automated_access_allowed !== true || source.access_status !== "approved" || !["permitted", "licensed", "permission_granted"].includes(String(source.terms_status))) {
    return { checked: false, reason: "SOURCE_NOT_APPROVED", patch: {} };
  }
  if (!await robotsAllows(url)) return { checked: false, reason: "ROBOTS_DISALLOW_OR_UNAVAILABLE", patch: {} };
  const delay = Math.max(1000, Number(source.crawl_delay_ms || 1000));
  const last = sourceFetchAt.get(url.hostname) || 0;
  if (Date.now() - last < delay) return { checked: false, reason: "SOURCE_CRAWL_DELAY", patch: {} };
  sourceFetchAt.set(url.hostname, Date.now());
  let html: string;
  const rendered = await fetchRenderedHtml(url);
  if (rendered !== null) {
    html = rendered;
  } else {
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
    html = new TextDecoder().decode(bytes);
  }
  const patch = parsePage(html, fallback);
  if (patch.currency === "USD" && typeof patch.published_value_usd === "number" && patch.published_value_usd >= 500000) {
    patch.value_basis = "asking_price";
    patch.value_source_url = url.href;
    patch.value_checked_at = new Date().toISOString();
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

  const minute = Math.floor(Date.now() / 60000);
  const batchSize = 3;
  const selected = Array.from({length: batchSize}, (_, i) => PASSES[(minute * batchSize + i) % PASSES.length]);
  let rawResults = 0, stored = 0, duplicates = 0, skipped = 0, pagesRead = 0, pagesFailed = 0, pagesEnriched = 0;
  const pageErrors: string[] = [];
  const queryStats: Array<Record<string, unknown>> = [];
  const sourceFetchAt = new Map<string, number>();
  const runQuery = async ([assetClass, query]: readonly [string, string]) => {
    let qRaw = 0, qPages = 0, qFailed = 0, qStored = 0, qDuplicates = 0, qSkipped = 0, qEnriched = 0;
    const errors: string[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const searchUrl = new URL("/search", SEARXNG_BASE_URL);
      searchUrl.searchParams.set("q", query);
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
        const host = url.hostname.toLowerCase().replace(/^www\\./, "");
        if (EXCLUDED_SOURCE_HOSTS.has(host) || host.endsWith(".gsaauctions.gov")) { qSkipped++; continue; }
        const hash = await sha256(url.href);
        let { data: source, error: sourceReadError } = await db.from("omnisight_lot_sources")
          .select("id,domain,enabled,access_status,terms_status,automated_access_allowed,rights_basis,licence_reference,robots_url,crawl_delay_ms,max_requests_per_hour,last_robots_checked_at,last_policy_reviewed_at")
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
        const lotSignals = ["auction", "lot", "bidding", "bid", "estimate", "hammer price", "sale results", "upcoming sale", "consignment", "catalogue", "catalog"].some(term => searchText.includes(term))
          || ["/lot/", "/lots/", "/auction/", "/auctions/"].some(part => url.pathname.toLowerCase().includes(part));
        if (!lotSignals) { qSkipped++; continue; }
        let pagePatch: Record<string, unknown> = {};
        let pageVerified = false;
        if (source?.enabled === true && source?.automated_access_allowed === true && source?.access_status === "approved" && ["permitted", "licensed", "permission_granted"].includes(String(source?.terms_status))) {
          try {
            const checked = await readApprovedLotPage(url, source as Record<string, unknown>, title, sourceFetchAt);
            pagePatch = checked.patch;
            pageVerified = checked.checked;
          } catch { /* retry source verification on later pass */ }
        }
        const now = new Date().toISOString();
        const { data: existingByUrl, error: duplicateLookupError } = await db.from("omnisight_discovered_lots")
          .select("id").eq("canonical_url", url.href).limit(1).maybeSingle();
        if (duplicateLookupError) throw duplicateLookupError;
        if (existingByUrl?.id) {
          const { error: touchError } = await db.from("omnisight_discovered_lots")
            .update({ last_seen_at: now, updated_at: now }).eq("id", existingByUrl.id);
          if (touchError) throw touchError;
          qDuplicates++;
          continue;
        }
        const row = {
          source_id: source.id, source_lot_key: hash, canonical_url: url.href, title: String(pagePatch.title || title),
          asset_class: assetClass, listing_status: pagePatch.listing_status || "unknown",
          short_factual_summary: pagePatch.short_factual_summary || summary || null,
          source_title: host, source_record_hash: hash,
          verification_status: pageVerified ? "source_checked" : "candidate",
          data_use_status: "review_required", first_seen_at: now, last_seen_at: now,
          image_urls: [], hero_image_url: null, image_usage_status: "link_only",
          ...pagePatch
        };
        const { data: insertedLot, error: lotError } = await db.from("omnisight_discovered_lots")
          .upsert(row, { onConflict: "source_id,source_lot_key", ignoreDuplicates: true })
          .select("id");
        if (lotError) throw lotError;
        if (insertedLot?.length) qStored++; else qDuplicates++;
        if (pageVerified) qEnriched++;
        const verifiedValue = Number(pagePatch.published_value_usd);
        const verifiedStatus = String(pagePatch.listing_status || "unknown");
        if (insertedLot?.length && pageVerified && verifiedValue >= 500000 &&
            pagePatch.currency === "USD" && ["active", "upcoming"].includes(verifiedStatus)) {
          const rightsBasis = String(source?.rights_basis || "");
          const publicDomainMetadata = /CC0\s*1\.0|Public Domain Dedication/i.test(rightsBasis);
          if (publicDomainMetadata && source?.last_policy_reviewed_at) {
            await db.from("omnisight_discovered_lots").update({
              data_use_status: "public_domain",
              rights_reference: rightsBasis.slice(0, 1000),
              rights_reviewed_at: source.last_policy_reviewed_at,
              image_usage_status: "link_only",
              hero_image_url: null
            }).eq("id", insertedLot[0].id);
          }
          await db.from("omnisight_lot_ai_reports").upsert({
            lot_id: insertedLot[0].id,
            report_version: 1,
            status: "queued",
            limitations: ["AI visual and evidence analysis queued; image reuse rights remain separate."]
          }, { onConflict: "lot_id,report_version", ignoreDuplicates: true });
        }
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
    rawResults, stored, duplicates, skipped, pagesEnriched, pageErrors,
    targetRawPerDay: 100000, theoreticalRawPerDayAtCurrentCadence: selected.length * MAX_PAGES * MAX_RESULTS_PER_PAGE * 1440,
    mode: "multi-query discovery; global canonical-URL dedupe; approved-domain page checks with per-host crawl delay; USD value evidence only from checked source pages; publication gated by verified active/upcoming status and documented data/image rights",
    timestamp: new Date().toISOString()
  });
});
