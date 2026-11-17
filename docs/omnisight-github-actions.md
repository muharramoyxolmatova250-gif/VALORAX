# GitHub Actions GSA Auctions sync

This is a lightweight, scheduled importer for the official public GSA Auctions API.
It does not need Redis, SearXNG, Render, Oracle, or a continuously running server.

## Required GitHub secret

Add `SUPABASE_SERVICE_ROLE_KEY` in the repository's Actions secrets. Never commit this key or paste it into chat.

Optional: add `GSA_API_KEY` from api.data.gov for a personal GSA API key. Without it, the importer uses GSA's documented `DEMO_KEY`, which may have tighter access limits.

## Schedule

GitHub Actions runs at minute 17 of each hour and can also be started manually from Actions. Scheduled runs are not guaranteed to start at the exact minute.

## Safety

- The importer reads only the existing `gsaauctions.gov` source record and stops unless it remains enabled, approved, and permitted.
- It calls the official GSA Auctions public GET API.
- It writes deduplicated records as candidates to `omnisight_discovered_lots`.
- It does not publish lots, assert a $500k value, or display images. The existing publication and image-rights gates remain unchanged.
- The API documentation currently states limits of 5,000 calls per day and 5 calls per 5 seconds; this workflow makes one request per scheduled run.

Official API docs: https://gsa.github.io/auctions_api/
