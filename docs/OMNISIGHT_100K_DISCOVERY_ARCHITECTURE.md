# OMNISIGHT 100K/day Global Discovery Architecture

## Product requirement

Target: discover up to 100,000 candidate lot records per 24 hours across approved, contractually permitted providers and public catalogues. This is a capacity target, not a current capability or guaranteed daily yield. The customer-facing LIVE LOTS catalogue remains restricted to source-checked, current active listings with a source-supported USD value of at least $500,000 and a usable original listing URL.

## Pipeline

1. **Discovery connectors** — separate adapters for official auction APIs, licensed data feeds, permissioned exports, search-index APIs and explicitly permitted public catalogues. A search result is only a candidate URL, not proof that fetching or reusing its contents is allowed.
2. **Source policy registry** — each domain/provider records its terms URL, robots policy, access method, permission/licence reference, allowed fields, image rights, request budget, crawl delay, review date and enabled state.
3. **Durable queue** — enqueue URL discovery, listing fetch, refresh, image-rights review and analysis as separate jobs. Partition by provider/domain and use cursor checkpoints, retries with exponential backoff, concurrency caps and dead-letter handling.
4. **Safe fetch and parse** — fetch only approved domains and endpoints; enforce HTTPS, redirect and private-network protections, payload/time limits, per-host rate limits and parser isolation. Stop on access blocks or policy changes. Never bypass logins, paywalls, CAPTCHAs or other access controls.
5. **Normalisation** — preserve source-native IDs and original URLs; normalize currencies only with a timestamped FX source; distinguish asking price, current bid, estimate and realised price.
6. **Deduplication** — exact provider ID/canonical URL first; cross-provider candidates linked by identifiers and similarity, with ambiguous matches reviewed rather than merged blindly.
7. **Eligibility and freshness** — publish only if active state, >=$500,000 USD basis, original URL, recent source check and data-use rights are all present. Expire or hide stale/ended/withdrawn listings.
8. **Image delivery** — store source image URLs separately from the listing URL. Render an image only where image-specific terms/licence/permission allow it; otherwise show a neutral placeholder and a source link. A public image URL is not itself a reproduction licence.
9. **OMNISIGHT analysis** — enqueue analysis only after lot eligibility and evidence capture. Apply prioritisation and budgets; a 100,000-candidate ingest target does not mean 100,000 expensive full AI reports per day.
10. **Observability** — track candidate throughput, unique lots, duplicate ratio, eligible yield, stale ratio, image-rights coverage, provider errors, queue age, cost per eligible lot and per-source request consumption.

## Capacity model

100,000 candidates/day averages about 1.16 candidates/second across the full day. Real throughput must be load-tested because providers have different quotas, pagination, burst limits, latency and permitted access windows. Required capacity is calculated from measured page sizes and provider quotas, not assumed from the average. Use horizontally scalable workers and bounded queues; do not attempt this in one serverless invocation.

Before enabling a provider, confirm that its plan and contract cover the intended commercial use, fields, volume, caching, display and image use. Never enter private API keys in client code or commit them to Git. Configure secrets in the deployment environment under an authorised adult/operator account.

## Current implementation boundary

- Existing discovery worker is a single Old Cars Data live-feed adapter, one page (up to 100 items) per scheduled hourly run.
- Existing public catalogue endpoint reads at most 100 recent rights-cleared active lots.
- External lots open in a compact OMNISIGHT detail modal with source facts, report state and an explicit button to the original auction page.
- The multi-provider connector fleet, 100k/day throughput, production image rights approvals, load testing and live provider ingestion are not yet implemented or verified.
- Do not enable arbitrary-domain crawling by changing a broad flag. Each source must first pass its own policy and rights review.

## Release gates

1. Add and test each provider adapter independently with fixture data.
2. Verify permission, terms, allowed fields, volume limits and image rights for each provider.
3. Run staging ingestion and confirm dedupe, freshness, takedown and source attribution.
4. Load-test with synthetic fixtures at the intended throughput; monitor queue lag, DB writes, memory and costs.
5. Verify customer UI only displays eligible lots and never invents bid, estimate, countdown, AI verdict or verification status.
6. Enable providers gradually with per-source kill switches and alerts.
