# OMNISIGHT staging setup

Use a Netlify Deploy Preview for this feature branch. Do not merge PR #3 or publish to the production branch for this setup.

## Netlify environment variables

1. Open Netlify and select the VALORAX site.
2. Open **Project configuration → Environment variables**.
3. Add the following variables with the **Deploy Previews** context (or a branch-specific context for `feature/omnisight-server-ai-v0-1`).
4. Save, then trigger a new Deploy Preview so the functions receive the values.

### Public Supabase browser configuration

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

These are public client values. They are protected by Supabase RLS, not by secrecy.

### Server-side Supabase configuration

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

The service-role key must remain server-only. Never give it a `VITE_` prefix and never paste it into chat, GitHub, or source files.

### OMNISIGHT research configuration

- `OMNISIGHT_ENABLED=true`
- `OPENAI_API_KEY`
- `OMNISIGHT_MODEL` — the exact model ID available in the API project.

Only enable the per-lot worker after the staging smoke test:
- `OMNISIGHT_LOT_ANALYSIS_ENABLED=false` initially.

### Auction source configuration

- `OCD_API_KEY` — add only after the account owner has confirmed an appropriate commercial-use plan and source terms.
- `OMNISIGHT_DISCOVERY_ENABLED=false` initially.

Do not set either worker flag to true until the source registry has an approved, enabled Old Cars Data entry with documented licence reference, terms review date and image/data-use boundaries. The worker will not call the provider while that approval is absent.

## Test in a Deploy Preview

1. Wait for Netlify's Deploy Preview to complete for PR #3.
2. Open the preview and check the existing site still loads.
3. Check `/api/auctions`; an empty catalogue is expected until a source is approved and imported.
4. In Netlify **Functions**, select `omnisight-discovery` or `omnisight-lot-analysis` and use **Run now** only after their flags and secrets are configured.
5. Scheduled Functions do not run automatically for Deploy Previews or branch deploys; they run on published deploys. Netlify's UI allows manual **Run now** testing on a preview.
6. Inspect function logs and Supabase rows after each manual run.

## Current limitations

- Old Cars Data's live feed returns active listings, not a general upcoming feed. Upcoming lots from other asset classes require additional licensed providers.
- The discovery worker imports one page (up to 100 records) per invocation and uses a durable page cursor. A production 500,000-record programme needs additional licensed sources, a scalable worker/queue and monitored throughput.
- The scheduled AI worker processes one queued report per invocation and has a short execution timeout. It is a staging prototype, not yet a high-throughput AI fleet.
- Image URLs are stored as references. Images are not embedded until image-specific rights are documented.
- No live provider import or OpenAI per-lot run has been performed yet.

## Safety and cost

The user is 13. A parent/guardian should manage provider subscriptions, OpenAI billing, API keys and Netlify secrets. Do not share secret values in chat. Commercial data-use rights and image rights must be checked before enabling a source.
