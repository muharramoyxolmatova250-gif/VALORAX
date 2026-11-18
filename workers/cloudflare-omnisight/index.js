const ACTOR_ID = "crawlergang~sothebys-lot-scraper";
const MAX_ITEMS = 50;
const MAX_CHARGE_USD = 1;
const MIN_ESTIMATE_USD = 500000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function apiJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(30000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error("HTTP_" + response.status + ": " + JSON.stringify(body).slice(0, 500));
  }
  return body;
}

async function supabase(env, path, init = {}) {
  const response = await fetch(env.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + path, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(20000),
  });
  const bodyText = await response.text();
  if (!response.ok) throw new Error("SUPABASE_HTTP_" + response.status + ": " + bodyText.slice(0, 600));
  return bodyText ? JSON.parse(bodyText) : [];
}

function numberValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/[$,\s]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function safeLotUrl(value) {
  try {
    const u = new URL(String(value || ""));
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (u.protocol !== "https:" || !(host === "sothebys.com" || host.endsWith(".sothebys.com")) || u.username || u.password) return null;
    if (u.pathname === "/" || /\/(search|results|calendar|departments?)(\/|$)/i.test(u.pathname)) return null;
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$)/i.test(key)) u.searchParams.delete(key);
    }
    return u;
  } catch {
    return null;
  }
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
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

async function getOrCreateSource(env) {
  const domain = "sothebys.com";
  await supabase(env,
    "omnisight_lot_sources?on_conflict=domain",
    {
      method: "POST",
      headers: { prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify([{
        domain,
        display_name: "Sotheby's",
        source_type: "auction_house",
        access_method: "apify_actor",
      }]),
    }
  );
  const rows = await supabase(env,
    "omnisight_lot_sources?domain=eq.sothebys.com&select=id,access_status,terms_status,automated_access_allowed"
  );
  if (!rows.length) throw new Error("SOTHEBYS_SOURCE_ROW_NOT_FOUND");
  return rows[0];
}

async function runActor(env) {
  const actorUrl = "https://api.apify.com/v2/acts/" + encodeURIComponent(ACTOR_ID) +
    "/runs?waitForFinish=120&maxItems=" + MAX_ITEMS + "&maxTotalChargeUsd=" + MAX_CHARGE_USD;
  const started = await apiJson(actorUrl, {
    method: "POST",
    headers: {
      authorization: "Bearer " + env.APIFY_API_TOKEN,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      mode: "search",
      query: env.APIFY_SOTHEBYS_QUERY || "rare art jewelry watches",
      saleType: "upcoming",
      maxItems: MAX_ITEMS,
    }),
  });
  let run = started?.data || started;
  if (!run?.id) throw new Error("APIFY_RUN_ID_MISSING");

  const terminal = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]);
  for (let i = 0; i < 8 && !terminal.has(String(run.status || "").toUpperCase()); i++) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const status = await apiJson("https://api.apify.com/v2/actor-runs/" + encodeURIComponent(run.id), {
      headers: { authorization: "Bearer " + env.APIFY_API_TOKEN },
    });
    run = status?.data || status;
  }
  if (String(run.status || "").toUpperCase() !== "SUCCEEDED") {
    throw new Error("APIFY_RUN_NOT_SUCCEEDED_" + String(run.status || "UNKNOWN"));
  }
  if (!run.defaultDatasetId) throw new Error("APIFY_DATASET_ID_MISSING");
  const items = await apiJson(
    "https://api.apify.com/v2/datasets/" + encodeURIComponent(run.defaultDatasetId) +
    "/items?format=json&clean=true&limit=" + MAX_ITEMS,
    { headers: { authorization: "Bearer " + env.APIFY_API_TOKEN } }
  );
  if (!Array.isArray(items)) throw new Error("APIFY_DATASET_NOT_ARRAY");
  return { runId: run.id, datasetId: run.defaultDatasetId, items };
}

async function discover(env) {
  for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "APIFY_API_TOKEN"]) {
    if (!env[key]) throw new Error("MISSING_SECRET_" + key);
  }
  const source = await getOrCreateSource(env);
  const { runId, datasetId, items } = await runActor(env);
  const now = new Date().toISOString();
  let inserted = 0, filtered = 0, duplicates = 0;

  for (const item of items) {
    if (String(item?.saleType || "").toLowerCase() !== "auction") {
      filtered++;
      continue;
    }
    const url = safeLotUrl(item?.lotUrl);
    const title = typeof item?.title === "string" ? item.title.replace(/\s+/g, " ").trim().slice(0, 500) : "";
    const currency = String(item?.currency || "").trim().toUpperCase();
    const low = numberValue(item?.estimateLow);
    const high = numberValue(item?.estimateHigh);
    if (!url || !title || currency !== "USD" || low === null || low < MIN_ESTIMATE_USD || (high !== null && high < low)) {
      filtered++;
      continue;
    }
    const start = item?.auctionStartDate ? new Date(item.auctionStartDate) : null;
    const end = item?.auctionEndDate ? new Date(item.auctionEndDate) : null;
    const startsAt = start && Number.isFinite(start.getTime()) ? start.toISOString() : null;
    const endsAt = end && Number.isFinite(end.getTime()) ? end.toISOString() : null;
    if (endsAt && Date.parse(endsAt) <= Date.now()) {
      filtered++;
      continue;
    }
    if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
      filtered++;
      continue;
    }
    const hash = await sha256(url.href);
    const row = {
      source_id: source.id,
      source_lot_key: hash,
      canonical_url: url.href,
      title,
      asset_class: assetClass(item),
      listing_status: startsAt && Date.parse(startsAt) <= Date.now() ? "active" : "upcoming",
      make: typeof item?.brand === "string" ? item.brand.slice(0, 120) : null,
      auction_house: "Sotheby's",
      lot_number: typeof item?.lotNumber === "string" ? item.lotNumber.slice(0, 100) : null,
      sale_date: startsAt ? startsAt.slice(0, 10) : null,
      auction_starts_at: startsAt,
      auction_ends_at: endsAt,
      estimate_low: low,
      estimate_high: high,
      currency: "USD",
      published_value_usd: low,
      value_basis: "estimate_low",
      value_source_url: url.href,
      value_checked_at: item?.scrapedAt && Number.isFinite(Date.parse(item.scrapedAt)) ? new Date(item.scrapedAt).toISOString() : now,
      location: typeof item?.location === "string" ? item.location.slice(0, 250) : null,
      short_factual_summary: typeof item?.description === "string" ? item.description.replace(/\s+/g, " ").trim().slice(0, 1200) : null,
      identifiers: {
        apify_actor: ACTOR_ID,
        lot_id: item?.lotId || null,
        sale_number: item?.saleNumber || null,
        department: item?.department || null,
      },
      source_title: "Sotheby's · Apify",
      source_record_hash: hash,
      verification_status: "candidate",
      data_use_status: "review_required",
      first_seen_at: now,
      last_seen_at: now,
      updated_at: now,
      image_urls: [],
      hero_image_url: null,
      image_usage_status: "restricted",
    };
    const result = await supabase(env,
      "omnisight_discovered_lots?on_conflict=source_id,source_lot_key",
      {
        method: "POST",
        headers: { prefer: "resolution=ignore-duplicates,return=representation" },
        body: JSON.stringify([row]),
      }
    );
    if (result.length) inserted++;
    else duplicates++;
  }

  return {
    ok: true,
    actor: ACTOR_ID,
    runId,
    datasetId,
    received: items.length,
    inserted,
    duplicates,
    filtered,
    minEstimateUsd: MIN_ESTIMATE_USD,
    sourceStatus: source.access_status,
    note: "Imported as review_required candidates; not published to public Live Lots automatically.",
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ service: "VALORAX OMNISIGHT CLOUDFLARE", status: "online", version: "1.1.0", discovery: "apify_sothebys", database: "configured_at_runtime" });
    }
    if (request.method === "POST" && url.pathname === "/run") {
      if (!env.JOB_SECRET || request.headers.get("authorization") !== "Bearer " + env.JOB_SECRET) {
        return json({ error: "UNAUTHORIZED" }, 401);
      }
      try {
        return json(await discover(env));
      } catch (error) {
        return json({ ok: false, error: String(error?.message || error) }, 500);
      }
    }
    return json({ error: "NOT_FOUND" }, 404);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(discover(env).catch((error) => console.error("OMNISIGHT_CRON_FAILED", String(error?.message || error))));
  },
};
