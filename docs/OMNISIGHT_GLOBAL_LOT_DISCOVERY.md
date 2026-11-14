# OMNISIGHT Global Lot Discovery

## Goal

Build a continuously growing, source-linked catalogue of auction lots, with a long-term target of **500,000+ distinct lot records**. This is a target, not a current count or a guarantee. The catalogue should cover multiple asset classes and geographies, prioritising high-value collector assets while retaining useful lower-value records for market context.

## What a lot record contains

Store structured facts and a link to the original listing, not a mirror of the source website:
- Original lot URL and source/auction-house name
- Lot title, asset class, make/model/year and lot number where available
- Sale date and listing state (upcoming, active, sold, unsold, withdrawn, unknown)
- Published estimate, realised price and currency when available
- Location and concise factual summary
- Exact identifiers as separate structured fields (VIN/chassis, production serial, reference, registration, etc.)
- First/last seen timestamps, source-check status, data-use rights status and record fingerprint

Do not copy full catalogue pages, photographs, videos, legal packs, bidder information or other protected content by default. The original source remains the authority; every lot links back to it.

## Ingestion design

1. **Source registry** — register each auction house, marketplace, aggregator, public registry or data provider with its access method, terms URL, robots policy, rights basis, rate limit and review date.
2. **Permission gate** — only sources explicitly marked approved and enabled can receive automated jobs. An accessible page or permissive robots.txt alone is not a commercial data licence.
3. **Discovery adapters** — prefer official APIs, licensed feeds, permissioned exports and documented partner endpoints. Use public catalogue pages only where the source terms and applicable rules permit the intended access and storage.
4. **Queue and workers** — enqueue bounded discovery/fetch/refresh jobs; workers respect per-source delay and request ceilings, use pagination/cursors, retry transient errors with backoff and stop on blocks or policy changes.
5. **Normalisation** — map source fields into one schema while retaining source-native IDs and exact URLs.
6. **Deduplication** — deduplicate within a source by source lot key and canonical URL; cross-source matches become candidate links using identifiers, not automatic merges.
7. **Rights and verification gates** — a source-checked listing is not an authenticated asset. A factually checked lot is not automatically licensed for redistribution. Only rows with documented rights clearance are readable in the customer-facing catalogue.
8. **Refresh and takedown** — revisit approved sources at their allowed cadence; mark stale/removed listings, honour source-owner correction/takedown requests, and retain an audit trail.

## Scale plan

- Start with a small, manually reviewed allowlist of high-value auction sources.
- Measure unique lots per source, duplicate rate, stale rate, missing-field rate, source error rate and rights-cleared percentage.
- Expand source-by-source and region-by-region. Keep ingestion asynchronous; a single Netlify request or one AI prompt must never attempt to crawl 500,000 pages.
- Use a durable queue and scheduled workers with per-source concurrency limits. Add partitioning, batch upserts and back-pressure only when measured volume requires them.
- Treat 500,000 as a catalogue coverage target, not an instruction to bypass access controls or scrape every domain.

## OMNISIGHT behaviour

- Search the catalogue first; then search the web for gaps and newer records.
- Return the original source link for every lot.
- Clearly label candidate, source_checked, human_reviewed and rejected states.
- Keep asking prices separate from completed-sale prices.
- Keep currencies separate unless a conversion rate and timestamp are explicitly supplied.
- Distinguish chassis/VIN, factory serial, production number and auction lot number.
- Never treat repeated syndicated copies as independent corroboration.
- Missing search results are not proof that a record does not exist.
- A lot's existence or published auction result does not prove authenticity, ownership, title, condition, settlement or data redistribution rights.

## Database foundation

Migration: supabase/migrations/202611140003_omnisight_global_lot_discovery.sql.

- omnisight_lot_sources: source allowlist and policy/rights review.
- omnisight_discovered_lots: normalized source-linked lot index.
- omnisight_discovery_jobs: durable queue state for future workers.
- Client reads are limited by RLS to rights-cleared records. Source registry and job queue are service-role only.

**Implementation status:** this change adds the database foundation and engineering contract only. It does not start a crawler, populate 500,000 records, create a scheduler/worker, or grant permission to use any auction-house data. Those require the approved source list, operational worker, staging tests and documented data rights.
