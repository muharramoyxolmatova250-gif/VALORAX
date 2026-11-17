import http from "node:http";
import { lookup } from "node:dns/promises";
import net from "node:net";
import { chromium } from "playwright";

const PORT = Number(process.env.PORT || 8080);
const TOKEN = process.env.OMNISIGHT_BROWSER_TOKEN || "";
const MAX_HTML_BYTES = 1_000_000;
const USER_AGENT = "VALORAX-OmniSightBrowser/1.0 (+https://valorax.netlify.app)";
const BLOCKED_HOSTS = new Set([
  "localhost", "localhost.localdomain", "metadata.google.internal",
  "gsaauctions.gov", "www.gsaauctions.gov"
]);

function normalizedHost(host) {
  return host.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

function isPrivateIp(address) {
  const version = net.isIP(address);
  if (version === 4) {
    const p = address.split(".").map(Number);
    return p[0] === 0 || p[0] === 10 || p[0] === 127 ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) ||
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
      p[0] >= 224;
  }
  if (version === 6) {
    const v = address.toLowerCase();
    return v === "::" || v === "::1" || v.startsWith("fc") ||
      v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") ||
      v.startsWith("fea") || v.startsWith("feb") || v.startsWith("::ffff:") ||
      v.startsWith("2001:db8:");
  }
  return true;
}

async function isPublicHost(hostname) {
  const host = normalizedHost(hostname);
  if (!host || BLOCKED_HOSTS.has(host) || host.endsWith(".gsaauctions.gov") ||
      host.endsWith(".local") || host.endsWith(".internal") || net.isIP(host)) return false;
  try {
    const addresses = await lookup(host, { all: true, verbatim: true });
    return addresses.length > 0 && addresses.every(({ address }) => !isPrivateIp(address));
  } catch {
    return false;
  }
}

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 16_384) throw new Error("BODY_TOO_LARGE");
  }
  return JSON.parse(body || "{}");
}

async function render(urlValue, expectedHost) {
  const target = new URL(urlValue);
  const host = normalizedHost(target.hostname);
  if (target.protocol !== "https:" || target.username || target.password ||
      !host.includes(".") || host !== normalizedHost(expectedHost) ||
      !await isPublicHost(target.hostname)) {
    throw new Error("UNSAFE_TARGET");
  }

  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      javaScriptEnabled: true,
      acceptDownloads: false,
      ignoreHTTPSErrors: false,
      serviceWorkers: "block"
    });
    const page = await context.newPage();
    await page.route("**/*", async route => {
      try {
        const requestUrl = new URL(route.request().url());
        if (requestUrl.protocol !== "https:" || !await isPublicHost(requestUrl.hostname)) {
          return route.abort("blockedbyclient");
        }
        return route.continue();
      } catch {
        return route.abort("blockedbyclient");
      }
    });
    const response = await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 25_000 });
    if (!response || !response.ok()) throw new Error("NAVIGATION_FAILED");
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(1_000);
    const finalUrl = new URL(page.url());
    if (finalUrl.protocol !== "https:" || normalizedHost(finalUrl.hostname) !== host) {
      throw new Error("CROSS_HOST_REDIRECT_BLOCKED");
    }
    const contentType = response.headers()["content-type"] || "";
    if (!contentType.toLowerCase().includes("text/html")) throw new Error("NOT_HTML");
    const html = await page.content();
    if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) throw new Error("PAGE_TOO_LARGE");
    return { ok: true, status: response.status(), finalUrl: finalUrl.href, contentType, html };
  } finally {
    await browser.close();
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/healthz") return send(res, 200, { ok: true, service: "valorax-browser-worker" });
  if (req.method !== "POST" || req.url !== "/render") return send(res, 404, { error: "NOT_FOUND" });
  if (!TOKEN || req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, 401, { error: "UNAUTHORIZED" });
  try {
    const body = await readBody(req);
    if (typeof body.url !== "string" || typeof body.expectedHost !== "string") {
      return send(res, 400, { error: "URL_AND_EXPECTED_HOST_REQUIRED" });
    }
    const result = await render(body.url, body.expectedHost);
    return send(res, 200, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "RENDER_FAILED";
    const status = message === "UNSAFE_TARGET" ? 400 : 422;
    return send(res, status, { ok: false, error: message });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Valorax browser worker listening on ${PORT}`);
});
