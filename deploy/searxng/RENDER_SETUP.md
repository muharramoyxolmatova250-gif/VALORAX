# VALORAX SearXNG host (Render)

This directory contains a Docker image for the self-hosted, API-key-free SearXNG search service used by OmniSight.

## Render resources provisioned

- Web service: `valorax-searxng` (free plan, Singapore)
- Key Value: `valorax-searxng-valkey` (free plan, Singapore)
- Service URL: `https://valorax-searxng.onrender.com`
- Repository branch: `feat/searxng-render-host`

The web service build has been started, but it is not considered operational until the deploy reaches **live**, the health endpoint responds, and a JSON search succeeds.

## Required Render configuration

1. In the Key Value dashboard, open **Connect** and copy the **internal connection URL**.
2. In the `valorax-searxng` web service environment, set `SEARXNG_VALKEY_URL` to that exact internal URL. The web service and Key Value must remain in Singapore and the same workspace.
3. Keep `SEARXNG_SECRET` as a secret environment variable. SearXNG reads it to override `server.secret_key`.
4. Confirm `SEARXNG_PORT=10000` and `SEARXNG_BIND_ADDRESS=0.0.0.0`.
5. Confirm `server.limiter: true`, JSON search format enabled, and the service is healthy.

## Security gate — do not connect OmniSight yet

Render web services have a public URL. Before using it from Netlify, add an authenticated reverse-proxy / access-control layer (for example, a Cloudflare Access service token or a private authenticated gateway) and configure the Netlify search worker to send that credential server-side. Do not expose an unrestricted SearXNG JSON endpoint or put credentials in browser code.

The free Render web service may sleep when idle; a 15-minute schedule can still experience cold starts. This is not a guaranteed 24/7 or high-throughput host.

## Netlify integration after the security gate

Set server-side only:
- `SEARXNG_BASE_URL=https://valorax-searxng.onrender.com` (or the authenticated gateway URL)
- `OMNISIGHT_GLOBAL_SEARCH_ENABLED=true`
- A correct Supabase `SUPABASE_URL`
- A correct, secret Supabase `SUPABASE_SERVICE_ROLE_KEY`

The existing global-search worker queries 14 asset categories and stores up to 25 unique candidate results per 15-minute run. That is a theoretical maximum of 100 candidate search results/hour, not 100 verified lots/hour. Search results are leads, not verified auction lots. New source domains remain pending review and candidate rows remain review_required; no automatic publishing to LIVE LOTS occurs.

## Verification checklist

- [ ] Render deploy status is live
- [ ] SearXNG responds at `/healthz`
- [ ] `/search?q=rare+watch+auction&format=json` returns JSON from the secured gateway
- [ ] Valkey limiter works
- [ ] Gateway rejects requests without the service token
- [ ] Netlify worker can reach the secured gateway
- [ ] Supabase receives real candidate URLs with source attribution
- [ ] Human/source permission review completed before public display
