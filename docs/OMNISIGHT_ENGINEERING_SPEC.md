# OMNISIGHT engineering specification

## Product principle

**Trust evidence, not the beauty of the asset.** OMNISIGHT performs evidence-led public research and triage. It is not a physical inspection, authentication, legal-title, condition or appraisal service.

## Current request flow

1. The browser stores the user's evidence ledger locally and submits records for one exact asset.
2. The Netlify function validates method, same-origin browser requests, payload size, record count, asset consistency and HTTP(S) source URLs.
3. The server builds an asset-class expected-evidence checklist and a deterministic coverage map of topics present or absent from the submitted ledger.
4. The server sends untrusted submitted claims plus explicit evidence-first instructions to the OpenAI Responses API with web search and strict JSON output.
5. Citation URLs are extracted from actual web-search annotations.
6. The deterministic finding guard removes citation URLs that were not returned by search, clamps confidence, and downgrades unsupported module statuses.
7. The verdict gate can downgrade GOOD or BAD to UNCERTAIN. It never upgrades a verdict.
8. The browser renders source citations, expected evidence, submitted-ledger coverage, module findings and verdict-gate reasoning.

## Status semantics

- `SUPPORTED`: a concrete finding has at least one citation URL returned by the search tool; stricter modules may require two citations.
- `PARTIAL`: some information exists, but support, identity, source quality or completeness is insufficient.
- `NOT_FOUND`: not located in the defined search, not proof that a record does not exist.
- `CONFLICT`: sources disagree; the disagreement must be preserved.
- `NOT_APPLICABLE`: the analysis does not apply to this asset or request.

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
- Valuation does not yet have a curated, normalized, independently verified comparable-sales database.
- The evidence ledger is local to the browser, not a shared server database.
- The in-memory IP rate limit is per function instance and is not a durable global quota. Production deployment needs stronger abuse protection and account-level usage limits.
- The endpoint requires Netlify secrets `OMNISIGHT_ENABLED`, `OPENAI_API_KEY` and `OMNISIGHT_MODEL`. Never expose the API key with a `VITE_` prefix.
- A live OpenAI request, live asset audit, production deployment and third-party source licensing review are still required before launch.

## Quality checks

The `OMNISIGHT quality gate` GitHub Actions workflow runs:
- focused regression tests for citation and status guards;
- TypeScript checks for the OMNISIGHT frontend;
- TypeScript checks for the Netlify analysis function and guard;
- the production Vite build.

The broader repository currently has unrelated TypeScript issues in auction category and button props. The OMNISIGHT workflow intentionally checks the OMNISIGHT files separately and builds the frontend. Those existing unrelated issues remain tracked as separate cleanup work.
