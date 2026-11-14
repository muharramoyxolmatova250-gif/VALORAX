# OMNISIGHT deployment checklist

This checklist is required before the first real OpenAI server run. No secret values belong in GitHub source files or chat messages.

## 1. Apply the database migration

In the correct Supabase project:
1. Open **SQL Editor**.
2. Create a new query.
3. Copy and run the full file `supabase/migrations/202611140001_omnisight_intelligence.sql`.
4. Confirm the tables exist:
   - `omnisight_global_assets`
   - `omnisight_global_sources`
   - `omnisight_global_asset_sources`
   - `omnisight_assets`
   - `omnisight_evidence`
   - `omnisight_analyses`
   - `omnisight_entities`
   - `omnisight_relationships`
   - `omnisight_market_sales`
   - `omnisight_usage_monthly`
5. Confirm the migration created the monthly quota RPC `omnisight_consume_monthly_credit`.

The two seeded Huayra R sale facts are marked `data_use_status='review_required'`. They are not exposed as cleared comparables until licensing/permission review is documented.

## 2. Configure Supabase Auth

1. Open **Authentication → Providers** and enable Email.
2. Configure the email sign-in link template and deliverability/SMTP settings for production.
3. Set the deployed VALORAX domain as the Site URL.
4. Add the exact deployed domain to the allowed redirect URLs.
5. Test that the one-time email link returns to VALORAX and creates a real Supabase session.

## 3. Configure browser environment variables in Netlify

These are public browser configuration values:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## 4. Configure server-only environment variables in Netlify

- `OMNISIGHT_ENABLED=true`
- `OPENAI_API_KEY` — secret API key for the OpenAI project
- `OMNISIGHT_MODEL` — exact model identifier enabled for that API project
- `SUPABASE_URL` — same project URL as the browser configuration
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service-role secret

Never prefix `OPENAI_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY` with `VITE_`. Never commit or share these secrets.

After setting or changing environment variables, trigger a new Netlify deploy so the function receives them.

## 5. Run the Pagani validation case

1. Sign in using the email magic link.
2. Open OMNISIGHT.
3. Add the two target records from `tests/fixtures/pagani-huayra-r.json`:
   - RM Sotheby's lot 132: chassis `ZA9H11WTYYSF76003`, serial `11/30`, published result CHF 2,367,500.
   - Pagani official model facts: 30 examples, 850 HP, 750 Nm, 9,000 rpm redline, 1,050 kg.
   - The disputed secondary media-centre CHF 5,292,500 figure; it must remain an unresolved scope conflict.
4. Do not enter the Paris 2025 chassis 005 as if it were the target car's provenance. It is a separate comparable.
5. Run **ANALYZE LATEST ASSET**.
6. Confirm the UI shows chassis/VIN and production serial as separate identifiers.
7. Open each research citation and compare the actual page content with every material AI claim.
8. Confirm the report does not claim physical authentication, legal title or condition verification.
9. Save the analysis ID and record any incorrect joins, unsupported claims or missing citations.

## 6. Quotas and cost controls

- Current hard monthly limit: 10 analysis attempts per authenticated user.
- Server rate limiter: up to 3 requests per minute per Netlify function instance/IP.
- Request body: maximum 40 KB and 12 evidence records.
- Model output: maximum 8,000 tokens per request.
- Failed AI calls consume an attempt; this prevents repeated free retries.
- These are initial controls, not a complete billing or abuse-management system. Monitor OpenAI usage and Netlify logs.

## 7. Release conditions

Do not merge or announce production readiness until:
- the SQL migration has been applied successfully;
- magic-link sign-in has been tested on the deployed domain;
- the OpenAI server request succeeds with the configured model;
- the Pagani case has been reviewed source by source;
- data-use rights are reviewed for any reusable market data;
- the full build and quality workflow passes for the latest commit;
- Netlify logs show no secret exposure or persistence errors.

A passing GitHub build proves code compilation and automated tests only. It does not prove that Supabase, OpenAI billing, email delivery or production deployment is configured.
