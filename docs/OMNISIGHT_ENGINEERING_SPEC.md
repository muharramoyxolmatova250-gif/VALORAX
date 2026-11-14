# OMNISIGHT engineering specification

## Product principle

**Trust evidence, not the beauty of the asset.** OMNISIGHT performs evidence-led public research and triage. It is not a physical inspection, authentication, legal-title, condition or appraisal service.

## Current request flow

1. The browser stores the draft evidence ledger locally and signs in using a Supabase Auth magic link.
2. The browser sends the Supabase access token to the Netlify function. The server validates the token against Supabase Auth and rejects anonymous/unauthenticated requests.
3. The Netlify function validates method, same-origin browser requests, payload size, record count, asset consistency and HTTP(S) source URLs. A persistent Supabase RPC enforces 3 requests per authenticated user per 60-second window across serverless instances; the in-memory IP limiter is only an additional best-effort layer.
4. The server atomically consumes a per-user monthly research credit before calling the AI provider.
5. The server builds an asset-class expected-evidence checklist and a deterministic coverage map of topics present or absent from the submitted ledger.
6. The server sends untrusted submitted claims plus explicit evidence-first instructions to the OpenAI Responses API with web search and strict JSON output.
7. Citation URLs are extracted from actual web-search annotations.
8. A server-side source-lineage screen normalizes URLs, collapses publisher domains, flags known press-release distribution platforms and identical normalized headlines across different publishers as possible syndication/dependency.
9. The deterministic finding guard removes citation URLs that were not returned by search, clamps confidence, and downgrades unsupported module statuses.
10. The verdict gate can downgrade GOOD or BAD to UNCERTAIN. It never upgrades a verdict; it requires at least two publisher domains remaining as corroboration candidates after dependency screening.
11. The server persists the asset, evidence, report, citation sources, typed identifier entities and candidate graph relationships in Supabase using a server-only service-role key. Explicitly labelled previous-owner/owner, auction, event and document references plus allow-listed organizations are extracted into evidence-linked graph nodes; every discovered relationship remains `candidate` with zero confidence until human review.
12. A deterministic negative-space audit reports submitted-ledger gaps, impact and next evidence steps. It lists citation domains returned by web search, while explicitly stating that the API does not expose a complete query/page audit trail.
13. The browser renders source citations, source-lineage warnings, negative-space gaps and the Responses API search trace (queries, sources, opened pages, find-in-page patterns), expected evidence, submitted-ledger coverage, module findings, exact identifiers, monthly quota, provider token usage, web-search call count and verdict-gate reasoning.

## Status semantics

- `SUPPORTED`: a concrete finding has at least one citation URL returned by the search tool; stricter modules may require two citations.
- `PARTIAL`: some information exists, but support, identity, source quality or completeness is insufficient.
- `NOT_FOUND`: not located in the defined search, not proof that a record does not exist.
- `CONFLICT`: sources disagree; the disagreement must be preserved.
- `NOT_APPLICABLE`: the analysis does not apply to this asset or request.

Source-lineage `independence_unverified` means only that the automatic screen did not identify a dependency warning. It does not mean the sources are confirmed independent. Different publisher domains may share owners, wires, PR material or undisclosed sources. Human source tracing is required.

A submitted-ledger coverage result only means a supplied record matched a topic by keyword. It does not verify the truth or quality of that record.

## Eight intelligence modules

1. Negative-Space Intelligence — identifies expected evidence topics not found in the submitted ledger and asks the web research layer to look for public traces.
2. Counterfactual Reasoning — describes hypothetical alternative histories and the evidence needed to test them. It cannot establish a hypothetical as fact.
3. Cross-Asset Connection Discovery — reports source-backed links between the exact entities; similarity alone is not a connection.
4. Evidence Conflict Engine — preserves conflicting claims and the sources that support them.
5. Unknown Asset Hypothesis Generator — presents unresolved identity explanations as hypotheses, with disconfirming checks.
6. Acquisition Intelligence — buyer diligence considerations, missing checks and risks; not investment advice.
7. Rarity Intelligence — separates factory production, surviving examples, specification rarity and marketing claims.
8. Valuation Intelligence — distinguishes asking prices from realised sales and states comparability and sample limitations.

## Two service layers

- Global Asset Discovery — public-record coverage and unresolved research leads.
- Private Collector Intelligence — lawful public/user-provided buyer-side diligence. No private database access is claimed.

These are currently structured analysis layers, not separate services, agents or databases.

## Seven advanced functions

- HIDDEN HISTORY — sourced prior ownership, events and modifications.
- MARKET ILLUSION — asks for duplicate/stale listings, unsold lots and ask-vs-sale separation.
- PROVENANCE GAPS — timeline intervals and missing document links, without implying wrongdoing.
- RARITY DECEPTION — tests limited-production and special-version claims.
- NEGOTIATION INTELLIGENCE — evidence-backed price discussion points only.
- COUNTERFACTUAL HISTORY — clearly labelled hypothetical scenarios.
- PRIVATE KNOWLEDGE DISCOVERY — connects scattered public records and labels leads for human verification.

## Supabase data foundation

Migration: `supabase/migrations/202611140001_omnisight_intelligence.sql`.

- Shared `omnisight_global_assets` contains only pre-curated public identities. User-entered asset names are never auto-published to this shared index; a private user asset links to a global record only when one exact curated identifier matches. Owner-scoped `omnisight_assets`, submitted evidence and analysis reports remain private under row-level security.
- `omnisight_global_sources` and `omnisight_global_asset_sources` create a shared public asset-to-source graph from URLs returned by web search. The edge state is `search_returned`, not verified; citation presence does not prove claim support.
- The private per-user entity graph stores assets, source domains and explicitly extracted identifiers. VIN/chassis and factory production serial are separate entity types; relationships are candidate links until human review.
- Exact global asset keys use one unambiguous VIN when the submitted records agree on exactly one. If records contain zero or multiple distinct VINs, the system falls back to a model-level key and marks identity resolution as unresolved/ambiguous. This avoids merging two chassis merely because they share a model name.
- Curated auction sales have explicit sold/unsold/withdrawn and candidate/verified/rejected states plus a separate data-use/licensing status. The analysis endpoint queries only fact-verified rows whose data-use status is licensed, public-domain or permission-granted. The seeded Pagani auction facts remain `review_required` and are not exposed as cleared market data until rights review. An empty cleared-results set is explicitly described as 'no cleared records in this database', never 'no historical sales exist'.
- Monthly quota is enforced atomically by a database function. Current limit: 10 analysis attempts per user per calendar month. Failed provider calls consume an attempt to avoid repeated unmetered retries.
- Direct user writes are not granted by the migration; the server writes with the service role after authenticating the user's JWT.

The migration seeds two RM Sotheby's Huayra R sold-result catalogue entries and creates a shared public asset/source index. It must be applied manually in the Supabase SQL Editor before enabling the server endpoint. It has not been applied to the user's Supabase project from this repository workflow.

## Authentication and required environment

Browser build variables:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Netlify server-only variables:
- `OMNISIGHT_ENABLED=true`
- `OPENAI_API_KEY=<server-side secret>`
- `OMNISIGHT_MODEL=<model available to the connected API project>`
- `SUPABASE_URL=<same Supabase project URL>`
- `SUPABASE_SERVICE_ROLE_KEY=<server-only service role secret>`

Never use a `VITE_` prefix for OpenAI or Supabase service-role secrets. Configure the Supabase Auth email template and allowed redirect URLs for the deployed VALORAX domain. Do not paste any secret into chat or commit it to GitHub.

## Deterministic verdict gates

### GOOD
Requires:
- at least two distinct cited publisher domains;
- at least two model-assessed strong sources;
- confidence at least 0.80;
- no unresolved conflicts;
- no material unknowns.

### BAD
Requires:
- at least two distinct cited publisher domains;
- at least one model-assessed strong source;
- at least one explicit conflict.

Failure of either gate downgrades the verdict to `UNCERTAIN`. These checks are conservative triage signals, not proof that sources are independent or that citations support every claim. The model's source-strength labels are not independently verified by this gate.

## Known limitations — do not present as completed capabilities

- The 8 modules and 7 advanced functions are currently model-guided research tasks with shared schemas and deterministic post-processing, not independent specialised algorithms or separately trained models.
- Citation matching proves only that the URL appeared in web-search citation annotations; it does not prove the page content supports the finding.
- Source-domain counting is an approximation and cannot detect all syndication, common ownership or copied reporting.
- Submitted-evidence coverage is keyword-based and only covers the browser-submitted ledger.
- Cross-asset discovery does not yet have a persistent, multi-asset entity graph or a licensed global asset corpus.
- The historical sales schema and query pipeline exist, but the seeded Pagani facts are still rights-review-only; no cleared comparable-sale dataset is currently available to the live analysis until licensing/permission is documented.
- Draft evidence records remain in the browser until a successful authenticated analysis persists them. The server then stores a durable per-user copy; cross-device draft synchronisation is not yet implemented.
- The in-memory IP rate limit is per function instance and is not a durable global quota. The new database monthly quota is durable per user, but production still needs stronger distributed abuse protection, payment/plan entitlements and account-level monitoring.
- The endpoint requires the browser Supabase URL/anon key and server-side `OMNISIGHT_ENABLED`, `OPENAI_API_KEY`, `OMNISIGHT_MODEL`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Never expose server secrets with a `VITE_` prefix.
- The Pagani Huayra R validation case and real-source fixture are documented in `docs/OMNISIGHT_PAGANI_VALIDATION.md` and `tests/fixtures/pagani-huayra-r.json`; regression tests verify the VIN/serial distinction and ensure the Paris comparison chassis is not merged into the target. The OpenAI live run still requires the user's Netlify and Supabase secrets and a configured deployment. The SQL migration has not yet been applied to the live Supabase project.

## Quality checks

The `OMNISIGHT quality gate` GitHub Actions workflow runs:
- focused regression tests for citation and status guards;
- TypeScript checks for the OMNISIGHT frontend;
- TypeScript checks for the Netlify analysis function and guard;
- the production Vite build.

The broader repository currently has unrelated TypeScript issues in auction category and button props. The OMNISIGHT workflow intentionally checks the OMNISIGHT files separately and builds the frontend. Those existing unrelated issues remain tracked as separate cleanup work.
