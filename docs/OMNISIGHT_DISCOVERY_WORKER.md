# OMNISIGHT discovery worker

This worker is a conservative RSS/Atom ingestion foundation, not a promise of 100,000 unique luxury lots per day.

## What it does
- Runs once per minute as a Netlify scheduled function when `OMNISIGHT_DISCOVERY_ENABLED=true`.
- Reads only `omnisight_lot_sources` rows that are explicitly enabled and approved.
- Requires a reviewed rights basis, permitted/licensed/permission-granted terms, HTTPS feed URL on the registered domain, and a robots.txt check.
- Respects each source's crawl delay and hourly request ceiling.
- Parses RSS/Atom listing metadata and upserts by source + source lot key.
- Stores listings as `candidate` / `review_required`; it does not grant reuse rights, verify authenticity, copy images, or publish them to LIVE LOTS.

## Required server environment
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OMNISIGHT_DISCOVERY_ENABLED=false` initially; switch to `true` only after an administrator has reviewed and approved at least one source.

No OpenAI API key is needed for feed ingestion. OMNISIGHT AI analysis is a separate service.

## Source onboarding
For each source, an administrator must independently review its terms and robots policy, then set:
- `domain`
- `feed_url` (HTTPS RSS/Atom URL on exactly that domain)
- `access_method='permitted_public_catalogue'` (or the accurate approved method)
- `access_status='approved'`
- `terms_status='permitted'` / `licensed'` / `permission_granted'`
- `automated_access_allowed=true`
- `rights_basis` and `last_policy_reviewed_at`
- `enabled=true`

Do not approve a source merely because its feed is publicly reachable. Obtain permission or a licence where required.

## Capacity and limitations
The current worker checks at most 25 sources per minute and upserts at most 5,000 entries per source per run. Actual throughput is limited by each source's own crawl delay, hourly cap, feed size, Netlify execution limits, and Supabase capacity. The 100,000/day target is not validated; measure observed throughput before scaling. A feed may contain old, duplicated, or low-value listings. $500,000+ filtering and independent corroboration must happen downstream; this worker deliberately does not infer a lot's value from arbitrary text.
