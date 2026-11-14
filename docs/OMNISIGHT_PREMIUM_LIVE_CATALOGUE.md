# OMNISIGHT Premium Live Lot Catalogue

## Catalogue rule

VALORAX's Global Auction Catalogue contains only lots that are currently active or officially announced as upcoming, and whose documented published value is at least USD 500,000. Ended, sold, unsold, withdrawn and cancelled lots are excluded from the live catalogue. They may be retained in a separate research/history store if the data-use rights allow it, but must not appear as live inventory.

The USD 500,000 threshold must be supported by a source-linked published estimate low, reserve, asking price, current bid or fixed price. Store the exact basis and source URL. Convert non-USD values only with a recorded FX source, rate and timestamp; never compare raw EUR/GBP/CHF figures directly to USD 500,000. If no reliable USD value can be established, keep the record out of the premium catalogue until reviewed.

## Required lot page fields

- Lot title, asset category, make/model/year and concise factual description
- Auction house/source name and direct original lot URL
- One hero image URL plus a list of source image URLs, subject to image-use rights
- Published estimate range, reserve/asking/current bid where available, currency, USD threshold basis and value source
- Auction start/end timestamps and active/upcoming status
- Location, lot number and exact asset identifiers where publicly available
- First/last checked timestamps and source/data/image rights status
- OMNISIGHT report status, verdict, confidence, evidence references and limitations

Use image URLs as references; do not copy or re-host protected images unless the licence or permission explicitly allows it. If only linking is permitted, show the original source image link or a permitted thumbnail method. A source link is not a licence to republish the image.

## Per-lot OMNISIGHT

Every eligible lot receives a report job for all eight intelligence modules:
1. Negative-Space Intelligence
2. Counterfactual Reasoning
3. Cross-Asset Connection Discovery
4. Evidence Conflict Engine
5. Unknown Asset Hypothesis Generator
6. Acquisition Intelligence
7. Rarity Intelligence
8. Valuation Intelligence

The report also covers both service layers (Global Asset Discovery and Private Collector Intelligence) and all seven advanced analysis functions:
Hidden History, Market Illusion, Provenance Gaps, Rarity Deception, Negotiation Intelligence, Counterfactual History and Private Knowledge Discovery.

Reports are asynchronous, versioned and evidence-linked. A lot is not blocked from catalogue display merely because AI analysis is queued, but it must show "Analysis pending". Partial reports must show which services did not complete. AI findings are not authenticity certificates, title opinions, condition guarantees or investment advice.

## Data acquisition and scale

- Use official APIs, licensed feeds, permissioned exports, or public catalogues only where the terms and applicable law permit the intended collection and use.
- Keep a source allowlist with access method, policy review, rights basis, rate limits and pause/blocked states.
- Use durable queued workers, pagination, incremental refresh, retries with backoff and source-specific concurrency.
- Deduplicate by source lot ID and canonical URL; treat cross-source matches as candidates until checked.
- Preserve source links and audit records; honour corrections and takedown requests.
- 500,000+ is a scale target, not a current count or permission to bypass access controls.

## Implementation status

Migration `202611140004_omnisight_premium_live_catalogue.sql` adds the live/upcoming, USD threshold, image-reference and per-lot AI report data model. It does not itself connect a source, populate records, run workers, create images, or execute the AI analyses. Those require source adapters, a scheduler/worker, a catalogue API/UI and staging validation.
