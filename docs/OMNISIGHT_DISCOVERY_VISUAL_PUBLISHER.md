# OmniSight discovery → visual analysis → live publication

This pipeline has three separate stages:

1. **Discovery**: the existing Supabase Edge Function searches the configured search provider and only opens listing pages whose domain is approved in `omnisight_lot_sources`. It now also extracts up to eight HTTPS image references from OpenGraph/Twitter/JSON-LD metadata.
2. **Visual AI**: eligible USD 500,000+ active/upcoming lots are queued for the existing Responses API analysis worker. That worker sends up to four distinct image URLs with the lot record and web-search evidence. Image observations are stored separately from provenance/authenticity claims.
3. **Live Publisher**: a Netlify scheduled function calls `omnisight_publish_eligible_lots()` every five minutes when `OMNISIGHT_PUBLISHER_ENABLED=true`. The SQL function remains the final gate.

## Required server settings

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only)
- `OPENAI_API_KEY`
- `OMNISIGHT_MODEL` (must support image input and web search)
- `OMNISIGHT_LOT_ANALYSIS_ENABLED=true`
- `OMNISIGHT_PUBLISHER_ENABLED=true`
- Existing discovery scheduler must continue sending the configured `x-omnisight-cron-secret`.

Do not expose the service-role key or OpenAI key in Vite/client variables.

## Discovery source policy

The source registry is authoritative. A domain must be enabled, approved, and explicitly allowed for automated access. Search results from all other domains remain candidates and are not fetched. The currently approved GSA record documents CC0 1.0 for API listing metadata only; third-party image rights remain separate and are not cleared by this license.

## Publication gate

A lot is published only if all existing SQL requirements pass: active/upcoming, USD value at least $500,000, source-page valuation evidence and timestamp, source-checked/human-reviewed status, documented data-use rights, an approved enabled source, and no prior publication. Public images require a separate image-specific rights reference and review timestamp; otherwise the publisher inserts no image URL into the public auction row.

The publisher preserves upcoming versus live status and ignores expired auctions.

## Limits

- Discovery still uses the currently configured SearXNG search provider. This PR does not replace that provider or make it free/always-on.
- Vision and web research use the configured external model/API; the agent orchestration is custom code, not a newly trained foundation model.
- The current approved source set is limited. This implementation does not grant permission for Sotheby's, RM Sotheby's, Bonhams, Christie's, Mecum, or other unapproved sites.
- No target lot count or publication rate is guaranteed. A lot is never invented to fill the catalogue.
