# Valorax Cloud Run Playwright browser worker

This service renders JavaScript-heavy auction lot pages for the existing OmniSight discovery function. It is not a source-discovery engine and does not grant permission to crawl or republish any auction-house content.

## Deploy

Use a Google Cloud project managed by the account owner/guardian. Cloud Run may require an active billing account even when usage stays within its free tier.

1. Enable Cloud Run and Artifact Registry APIs.
2. Create a Secret Manager secret named `omnisight-browser-token` with a long random value.
3. Deploy from this directory:

```bash
gcloud run deploy valorax-browser-worker \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --max-instances 1 \
  --concurrency 1 \
  --cpu 1 \
  --memory 1Gi \
  --timeout 60 \
  --min 0 \
  --set-secrets OMNISIGHT_BROWSER_TOKEN=omnisight-browser-token:latest
```

The HTTP endpoint is publicly reachable but requires the secret bearer token at the application layer. Keep that token only in Secret Manager and Supabase Edge Function secrets. Do not commit it or put it in Vite/client variables.

## Connect Supabase

Set these Supabase Edge Function secrets:

- `OMNISIGHT_BROWSER_WORKER_URL`: Cloud Run service URL, without a trailing slash.
- `OMNISIGHT_BROWSER_TOKEN`: the same Secret Manager secret value.

The discovery function uses the browser worker only after the source registry confirms that a domain is enabled, approved, allowed for automated access, and has permitted/licensed terms. It checks robots.txt first and enforces the source crawl delay. If the worker is not configured, the existing static HTML fetch remains in use.

## Safety and cost limits

- GSA Auctions and its subdomains are rejected.
- Only HTTPS targets on the exact expected auction-house host are accepted.
- Private/local IP destinations and non-HTTPS subrequests are blocked.
- Cross-host redirects are rejected.
- One browser request at a time, one Cloud Run instance maximum, no minimum instances, 60-second request timeout.
- The worker returns page HTML to the existing parser; it does not store or republish images.
- This does not guarantee a lot count or a zero-cost deployment. Check Cloud Billing budgets and usage before enabling recurring discovery.
