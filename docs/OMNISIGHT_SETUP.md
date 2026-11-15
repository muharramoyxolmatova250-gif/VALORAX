# OMNISIGHT server setup

This guide enables the existing server-side research flow. Never put secret keys in Git, frontend `VITE_*` variables, screenshots, or chat messages.

## Netlify environment variables

In Netlify, open the VALORAX site → Site configuration → Environment variables. Add these variables for the deploy contexts you intend to use (Deploy Previews and Production):

| Variable | Value / purpose |
|---|---|
| `VITE_SUPABASE_URL` | `https://rokrbppnohafumsueicg.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase legacy anon key or publishable key. This is public client configuration, not a secret. |
| `SUPABASE_URL` | Same project URL above; server-side. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase server secret/service-role key. Secret; server-side only. |
| `OPENAI_API_KEY` | OpenAI API key with API billing/access enabled. Secret; server-side only. |
| `OMNISIGHT_MODEL` | A Responses API model available to the OpenAI project, with web search tool support. |
| `OMNISIGHT_ENABLED` | Set to `true` only after the server secrets are configured. |

Do not prefix server secrets with `VITE_`. Never expose `SUPABASE_SERVICE_ROLE_KEY` or `OPENAI_API_KEY` to the browser.

## Existing research flow

- The client sends the selected asset and up to 12 submitted evidence records to `POST /api/omnisight/analyze`.
- The Netlify function authenticates the Supabase user, applies a persistent rate limit and monthly credit limit, runs OpenAI Responses API with web search, applies evidence/verdict safeguards, and stores the report/evidence in the user's private Supabase records.
- A missing key, unavailable model, missing login, or unavailable database must produce a visible error, not a fabricated report.
- Market comparables are included only when `verification_status = verified` and `data_use_status` is `licensed`, `public_domain`, or `permission_granted`. Existing records marked `review_required` are intentionally excluded.

## Deploy and verify

1. Add variables to Netlify for Deploy Previews first.
2. Trigger a fresh deploy; Netlify functions only receive environment variables at deploy/runtime after the relevant deploy is rebuilt.
3. Open the Deploy Preview, sign in with a VALORAX account, import one lot or add one evidence record with its original source URL, then run analysis.
4. Verify the response contains real citations and a checked timestamp, and verify one private row appears in `omnisight_analyses` and its evidence in `omnisight_evidence`.
5. Confirm a missing/weak evidence case stays `UNCERTAIN`; do not treat a clean search as authentication.
6. Only after the preview test passes should Production variables be configured and a production deploy performed.

## Not yet enabled by this setup

- Automatic third-party auction-feed ingestion requires a separate source contract/permission, an approved source-registry record, and its provider key. The current discovery function is Old Cars Data-specific and deliberately does nothing while no licensed/approved source is registered.
- The scheduled queue worker requires `OMNISIGHT_LOT_ANALYSIS_ENABLED=true` in addition to its server credentials. Do not enable it until a licensed source and eligible queue records exist.
- Historical market analysis remains empty unless rights-cleared completed-sale records are loaded. Publicly visible URLs do not automatically grant data/image reuse rights.
- No 100,000-lot/day throughput is claimed; that requires licensed feeds, worker capacity, deduplication, monitoring and load tests.

For accounts, API billing, and secret-key configuration, a parent/guardian should manage the account and payment settings. Never send secret keys in this repository or chat.
