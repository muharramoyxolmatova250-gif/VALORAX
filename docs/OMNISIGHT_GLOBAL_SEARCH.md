# OmniSight global web discovery (SearXNG)

This adds an API-key-free *search-index discovery* path. It is not a full-web crawler and it does not guarantee 100 new lots/hour.

## What it does

- Runs every 15 minutes when `OMNISIGHT_GLOBAL_SEARCH_ENABLED=true`.
- Sends 14 category-focused searches through a self-hosted SearXNG instance.
- Deduplicates result URLs and stores up to 25 results per run (theoretical ceiling: 100 candidate records/hour).
- Registers unknown domains as `pending_review`, `terms_status=unknown`, `automated_access_allowed=false`.
- Stores records only as `candidate` / `review_required`. It does not fetch or republish third-party page content, mark a source approved, verify a lot, or publish to LIVE LOTS.

A search result is a lead, not proof that the item is a real, active auction lot. Search engines may return stale, irrelevant, blocked or incomplete results. A human/source-specific verification stage is still required before publication.

## Deploy a private SearXNG instance

Use a small VPS or other always-on Docker host. A free public SearXNG instance is not a reliable production dependency and may prohibit automated use.

1. Copy `deploy/searxng/docker-compose.yml` and `deploy/searxng/settings.yml` to the host.
2. Set a long random secret in `settings.yml` and configure `SEARXNG_BASE_URL` in the host environment.
3. Start with `docker compose up -d`.
4. Put SearXNG behind HTTPS and restrict access to the VALORAX worker (firewall/IP allowlist or private network). Do not expose an unrestricted JSON endpoint to the public internet.
5. Check that `https://YOUR-SEARXNG-HOST/search?q=test&format=json` returns JSON from the secured worker network.

## Netlify environment variables

Set these in Netlify (server-side only):

- `SEARXNG_BASE_URL=https://YOUR-SEARXNG-HOST`
- `OMNISIGHT_GLOBAL_SEARCH_ENABLED=true`
- Existing `SUPABASE_URL`
- Existing `SUPABASE_SERVICE_ROLE_KEY`

Do not put the SearXNG endpoint secret or Supabase service-role key in any `VITE_*` variable or browser code.

## Throughput and truthfulness

The schedule allows four runs/hour and caps each run at 25 unique search results. That is a maximum of 100 *candidate search results* per hour, not 100 verified lots. Actual results depend on search-engine coverage, indexing, rate limits, relevance and duplicate rates. If fewer than 100 distinct relevant lots exist or are returned, the worker will store fewer. Never pad the counter with fabricated lots.

## Before showing a result publicly

- Open the original lot page and confirm it is an individual lot, not a search/category page.
- Confirm the listing is active/upcoming and the asset identity and estimate from the primary source.
- Review the source's terms, robots policy and written permissions for automated access and commercial display.
- Confirm image rights separately; this worker stores no images.
- Only then update source approval and lot verification/data-use status through the reviewed admin workflow.

## Current limitations

- SearXNG queries public search indexes; it does not crawl the whole internet itself.
- This worker saves candidate leads only; it does not auto-publish to LIVE LOTS.
- A separate source-permission and lot-verification stage is mandatory.
- The SearXNG host, Netlify variables and deployment are operator setup steps; creating these repository files does not deploy them.
