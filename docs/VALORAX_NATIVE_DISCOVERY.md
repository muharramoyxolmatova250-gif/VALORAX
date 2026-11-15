# VALORAX Native Lot Discovery v1

A first-party deterministic discovery pipeline for source-approved auction catalogues. It does not depend on SearXNG or a third-party web-search API.

## Pipeline

1. Read only source rows that are explicitly enabled and approved.
2. Require automated access permission, permitted/licensed/permission_granted terms, a recorded rights basis and a policy-review timestamp.
3. Read a same-domain HTTPS sitemap, check robots.txt, and inspect a capped number of same-domain HTML pages.
4. Extract titles/descriptions, classify asset classes with a local ruleset, and apply lot-detail heuristics.
5. Deduplicate by canonical URL and store only candidate / review_required records for OmniSight.

## Limitations

- This v1 is a native rules-based engine, not a trained foundation model.
- It discovers pages exposed by sitemaps of sources that have been explicitly approved; it does not search the entire internet.
- It does not prove authenticity, current availability, value of USD 500,000+, or rights to republish.
- It never marks a lot verified and never publishes directly to LIVE LOTS.
- No source is enabled by this migration and no sitemap URLs are invented or auto-approved.
- It inspects at most 24 pages per run on a 15-minute schedule, subject to Netlify schedule availability and source limits. No throughput or uptime is guaranteed.

## Setup

1. Apply the migration in supabase/migrations.
2. For each source, obtain permission and review terms/robots policy. Then set its real same-domain HTTPS sitemap URL, rights basis, policy-review timestamp, permitted terms status, automated access permission, enabled and approved status through the source-management process.
3. Add server-side Netlify variable VALORAX_NATIVE_DISCOVERY_ENABLED=true.
4. Existing server-side SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. Never expose the service-role key in browser code.
5. Review function logs and the OmniSight candidate queue before approving any lot.

The worker uses same-domain HTTPS checks, manual redirect rejection, bounded response sizes, robots checks, request caps and candidate-only writes. This does not replace written data and image rights.
