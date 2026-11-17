# VALORAX OmniSight — Oracle VM deployment

This stack runs SearXNG, Redis/BullMQ and the existing OmniSight worker on one Linux VM. It does not require Render. It does not publish candidates automatically.

## Before deployment
- Create an Oracle Cloud Always Free VM with a parent/guardian managing the account and billing.
- Use only resources explicitly marked **Always Free**. Do not upgrade or create paid resources.
- Install Docker Engine and the Docker Compose plugin on the VM.
- Open no inbound ports for Redis, SearXNG or the worker. Only SSH should be exposed for administration.

## Configure
1. In this folder, copy `.env.example` to `.env`.
2. Fill `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` locally. Never put secrets in GitHub, screenshots, or chat.
3. Generate a long random `SEARXNG_SECRET`.
4. Keep the initial concurrency and daily targets low. Raise them only after observing memory, CPU, search-engine limits and source permissions.

## Start
From this folder on the VM:

```bash
cp .env.example .env
nano .env
docker compose up -d --build
docker compose ps
docker compose logs -f omnisight-worker
```

## Important safety rules
- The worker uses Playwright Chromium to render pages and collect page image evidence.
- It only opens individual lot pages when the source record is approved, automated access is explicitly allowed, and terms status is permitted/licensed/permission_granted. Robots rules and per-source rate limits are also checked.
- New sources are inserted as pending_review and disabled. Do not change a source to approved without documented permission.
- Image URLs remain rights-unknown. Browser visibility is not image reuse permission; images must not be shown publicly until image rights are documented.
- This worker discovers and enriches candidates. It does not bypass the database publishing gate and does not guarantee a number of valid lots per hour.
- No AI vision API is configured here. Playwright renders pages and records image URL/alt/dimension evidence; visual model review is a separate optional integration and may incur usage charges.
- The free Oracle shape has limited CPU/RAM and capacity is not guaranteed. Monitor the VM; do not assume it can sustain high concurrency.
- Back up Redis/Supabase data and monitor logs. Never expose Redis or SearXNG publicly.
