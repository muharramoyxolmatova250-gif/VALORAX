const ACTOR_ID = "crawlergang~sothebys-lot-scraper";
const MIN_ESTIMATE_USD = 500000;
const MAX_ITEMS = 50;

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
function numberOrNull(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!cleaned || !/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
function safeLotUrl(raw) {
  try {
    const u = new URL(String(raw || ""));
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (u.protocol !== "https:" || !(host === "sothebys.com" || host.endsWith(".sothebys.com")) || u.username || u.password) return null;
    if (u.pathname === "/" || /\/(search|results|calendar|departments?)(\/|$)/i.test(u.pathname)) return null;
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) u.searchParams.delete(key);
    return u.href;
  } catch { return null; }
}
async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
}
function assetClass(item) {
  const s = [item.title, item.department, item.brand, item.description].filter(Boolean).join(" ").toLowerCase();
  if (/\b(watch|watches|rolex|patek|cartier|timepiece)\b/.test(s)) return "watch";
  if (/\b(jewelry|jewellery|diamond|gemstone)\b/.test(s)) return "jewellery";
  if (/\b(automobilia|car|automobile|ferrari|porsche|bugatti|mclaren)\b/.test(s)) return "classic_car";
  if (/\b(furniture|design)\b/.test(s)) return "collectible";
  if (/\b(coin|numismatic)\b/.test(s)) return "coin";
  return "fine_art";
}
async function apify(path, env, init = {}) {
  const response = await fetch("https://api.apify.com/v2" + path, {
    ...init,
    headers: {
      Authorization: "Bearer " + env.APIFY_API_TOKEN,
      Accept: "application/json",
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(25000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error("APIFY_HTTP_" + response.status);
  return body;
}
async function supabase(path, env, init = {}) {
  const response = await fetch(env.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + path, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(25000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error("SUPABASE_HTTP_" + response.status + ": " + body.slice(0, 500));
  return body ? JSON.parse(body) : null;
}
async function getOrCreateSource(env) {
  const rows = await supabase('omnisight_lot_sources?select=id,domain,access_status,terms_status,automated_access_allowed&domain=eq.sothebys.com&limit=1', env);
  if (rows?.length) return rows[0];
  const inserted = await supabase("omnisight_lot_sources", env, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      domain: "sothebys.com",
      display_name: "Sotheby's",
      source_type: "auction_house",
      access_method: "apify_actor",
      access_status: "pending_review",
      terms_status: "unknown",
      automated_access_allowed: false,
      enabled: false,
      crawl_delay_ms: 5000,
      max_requests_per_hour: 1,
    }),
  });
  if (inserted?.[0]) return inserted[0];
  const retry = await supabase('omnisight_lot_sources?select=id,domain,access_status,terms_status,automated_access_allowed&domain=eq.sothebys.com&limit=1', env);
  if (retry?.[0]) return retry[0];
  throw new Error("SOTHEBYS_SOURCE_CREATE_FAILED");
}
async function runActor(env) {
  const input = {
    mode: "search",
    query: env.APIFY_SOTHEBYS_QUERY || "rare art jewelry watches",
    saleType: "upcoming",
    maxItems: MAX_ITEMS,
  };
  if (env.APIFY_SOTHEBYS_DEPARTMENT) input.department = env.APIFY_SOTHEBYS_DEPARTMENT;
  const started = await apify("/acts/" + encodeURIComponent(ACTOR_ID) + "/runs?waitForFinish=90&maxItems=" + MAX_ITEMS + "&maxTotalChargeUsd=1", env, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  let run = started?.data || started;
  if (!run?.id) throw new Error("APIFY_RUN_ID_MISSING");
  const done = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]);
  const deadline = Date.now() + 240000;
  while (!done.has(String(run.status || "").toUpperCase()) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    const status = await apify("/actor-runs/" + encodeURIComponent(run.id), env);
    run = status?.data || status;
  }
  if (String(run.status || "").toUpperCase() !== "SUCCEEDED") throw new Error("APIFY_RUN_" + String(run.status || "TIMEOUT"));
  if (!run.defaultDatasetId) throw new Error("APIFY_DATASET_MISSING");
  const result = await apify("/datasets/" + encodeURIComponent(run.defaultDatasetId) + "/items?format=json&clean=true&limit=" + MAX_ITEMS, env);
  return { runId: run.id, items: Array.isArray(result) ? result : [] };
}
async function ingest(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.APIFY_API_TOKEN) {
    throw new Error("MISSING_REQUIRED_SECRETS: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APIFY_API_TOKEN");
  }
  const { runId, items } = await runActor(env);
  const source = await getOrCreateSource(env);
  const now = new Date().toISOString();
  let inserted = 0, refreshed = 0, filtered = 0;
  for (const item of items) {
    if (String(item?.saleType || "").toLowerCase() !== "auction") { filtered++; continue; }
    const url = safeLotUrl(item?.lotUrl);
    const title = typeof item?.title === "string" ? item.title.replace(/\s+/g, " ").trim().slice(0, 500) : "";
    const currency = String(item?.currency || "").trim().toUpperCase();
    const low = numberOrNull(item?.estimateLow);
    const high = numberOrNull(item?.estimateHigh);
    if (!url || !title || currency !== "USD" || low === null || low < MIN_ESTIMATE_USD || (high !== null && high < low)) { filtered++; continue; }
    const startDate = item?.auctionStartDate ? new Date(item.auctionStartDate) : null;
    const endDate = item?.auctionEndDate ? new Date(item.auctionEndDate) : null;
    const startsAt = startDate && Number.isFinite(startDate.getTime()) ? startDate.toISOString() : null;
    const endsAt = endDate && Number.isFinite(endDate.getTime()) ? endDate.toISOString() : null;
    if (endsAt && Date.parse(endsAt) <= Date.now()) { filtered++; continue; }
    if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) { filtered++; continue; }
    const hash = await sha256(url);
    const row = {
      source_id: source.id,
      source_lot_key: hash,
      canonical_url: url,
      title,
      asset_class: assetClass(item),
      make: typeof item.brand === "string" ? item.brand.slice(0, 120) : null,
      auction_house: "Sotheby's",
      lot_number: typeof item.lotNumber === "string" ? item.lotNumber.slice(0, 100) : null,
      sale_date: startsAt ? startsAt.slice(0, 10) : null,
      listing_status: startsAt && Date.parse(startsAt) <= Date.now() ? "active" : "upcoming",
      estimate_low: low,
      estimate_high: high,
      currency: "USD",
      location: typeof item.location === "string" ? item.location.slice(0, 250) : null,
      short_factual_summary: typeof item.description === "string" ? item.description.replace(/\s+/g, " ").trim().slice(0, 1200) : null,
      identifiers: { apify_actor: ACTOR_ID, lot_id: item.lotId || null, sale_number: item.saleNumber || null, department: item.department || null },
      source_title: "Sotheby's · Apify",
      source_record_hash: hash,
      verification_status: "candidate",
      data_use_status: "review_required",
      first_seen_at: now,
      last_seen_at: now,
      updated_at: now,
      auction_starts_at: startsAt,
      auction_ends_at: endsAt,
      published_value_usd: low,
      value_basis: "estimate_low",
      value_source_url: url,
      value_checked_at: item.scrapedAt && Number.isFinite(Date.parse(item.scrapedAt)) ? new Date(item.scrapedAt).toISOString() : now,
      image_urls: [],
      hero_image_url: null,
      image_usage_status: "restricted",
    };
    const result = await supabase("omnisight_discovered_lots?on_conflict=source_id%2Csource_lot_key", env, {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify(row),
    });
    if (result?.length) { inserted++; continue; }
    const existing = await supabase("omnisight_discovered_lots?select=id&source_id=eq." + source.id + "&source_lot_key=eq." + hash + "&limit=1", env);
    if (!existing?.[0]) throw new Error("UPSERT_READBACK_FAILED");
    await supabase("omnisight_discovered_lots?id=eq." + existing[0].id, env, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        title, canonical_url: url, listing_status: row.listing_status,
        estimate_low: low, estimate_high: high, currency: "USD",
        published_value_usd: low, value_basis: "estimate_low",
        value_source_url: url, value_checked_at: row.value_checked_at,
        auction_starts_at: startsAt, auction_ends_at: endsAt,
        last_seen_at: now, updated_at: now,
      }),
    });
    refreshed++;
  }
  return { ok: true, actor: ACTOR_ID, runId, received: items.length, inserted, refreshed, filtered, minimumEstimateUSD: MIN_ESTIMATE_USD, sourceStatus: source.access_status };
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      return json({ service: "VALORAX OMNISIGHT", runtime: "cloudflare-workers", status: "online", discovery: Boolean(env.APIFY_API_TOKEN), database: Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY), minimumEstimateUSD: MIN_ESTIMATE_USD });
    }
    if (url.pathname === "/run" && request.method === "POST") {
      if (!env.RUN_SECRET || request.headers.get("authorization") !== "Bearer " + env.RUN_SECRET) return json({ error: "unauthorized" }, 401);
      try { return json(await ingest(env)); }
      catch (error) { return json({ ok: false, error: String(error?.message || error) }, 500); }
    }
    return json({ error: "not_found" }, 404);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(ingest(env).catch(error => console.error("OMNISIGHT_CRON_FAILED", String(error?.message || error))));
  },
};
