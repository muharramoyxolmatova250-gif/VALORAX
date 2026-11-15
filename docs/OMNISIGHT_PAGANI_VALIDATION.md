# OMNISIGHT Pagani Huayra R validation case

## Purpose
A controlled research case for testing identity resolution, model-vs-asset scope, source lineage and market-result separation. This is not a physical authentication exercise.

## Target asset
2022 Pagani Huayra R, RM Sotheby's Zurich, The Tailored for Speed Collection, lot 132.

### Primary source: auction-house catalogue
- URL: https://rmsothebys.com/auctions/id25/lots/r0042-2022-pagani-huayra-r/
- Chassis No.: `ZA9H11WTYYSF76003`
- Serial No.: `11/30`
- Published result: `CHF 2,367,500 | Sold`
- Catalogue mileage: 470 kilometres at cataloguing.
- Auction event date: 11 October 2025.

### Primary source: manufacturer model information
- URL: https://www.pagani.com/huayra-r/
- Huayra R limited to 30 examples.
- Naturally aspirated V12-R, 850 HP, 750 Nm, 9,000 rpm redline.
- Dry weight 1,050 kg.
- These are model-level facts; they do not authenticate chassis `ZA9H11WTYYSF76003`.

### Separate comparable: Paris 2025
- URL: https://backoffice.rmsothebys.com/auctions/pa25/lots/r0020-2022-pagani-huayra-r/
- Chassis No.: `ZA9H11WTYYSF76005`
- Serial No.: `5/30`
- Published result: `EUR 3,042,500 | Sold`.
- This is a different physical car. It must not be merged into the target's identity or provenance.

### Conflicting secondary price signal
- URL: https://barchetta.mediacenter.plus/?i=6312200
- The media-centre image record for Zurich lot 132 displays `Sold CHF 5,292,500`, which conflicts with the RM Sotheby's primary lot page's `CHF 2,367,500 | Sold`.
- The media-centre record does not clearly establish the scope of its number. Treat it as an unresolved, lower-context conflicting signal.
- Do not silently substitute it for the auction-house lot result and do not speculate that it includes the simulator; the source does not establish that explanation.

## Deterministic acceptance checks
1. Extract chassis/VIN and factory production serial into different typed identifiers.
2. Never infer `3/30` from the trailing `003` in the VIN.
3. Preserve exact currency and auction-house published result.
4. Do not use the Paris chassis 005 result as the target car's sale history.
5. Preserve the CHF 5,292,500 secondary media-centre discrepancy against the primary RM result; label its scope unresolved and do not invent an explanation.
6. Manufacturer model specifications cannot establish the target chassis identity.
7. Do not call the target physically authentic, legally titled, mechanically sound or investment-grade based only on public catalogues.
8. If the research cannot establish exact identity and relevant provenance, the overall verdict should remain `UNCERTAIN`.

## Known research limitations
- The RM Sotheby's page is a primary source for what the auction house catalogued and published as the result; it is not independent proof of payment settlement, legal transfer, or physical condition.
- The Pagani page is primary for manufacturer-published model specifications and production limit; it is not a chassis-specific certificate.
- No Pagani factory build sheet, current physical inspection, title/registration dossier or full chain of custody is included in this public-source case.
- A separate media-centre image record contains a different number whose scope is unclear. It is excluded from the vehicle-only sale result unless the auction house clarifies whether it represents a different package, an accounting distinction or a data error.

## Manual live-run procedure
1. Apply the Supabase migration in `supabase/migrations/202611140001_omnisight_intelligence.sql`.
2. Configure the required Netlify environment variables described in `docs/OMNISIGHT_ENGINEERING_SPEC.md`.
3. Sign in using a Supabase magic link.
4. Add the three target/discrepancy evidence records from `tests/fixtures/pagani-huayra-r.json` (do not add the Paris comparable as target provenance).
5. Run the server analysis.
6. Compare every claim and citation against the acceptance checks above.
7. Save the returned report ID and review any false positives, false negatives, missing citations and incorrect identity joins.

A real OpenAI API call cannot be asserted as tested until this procedure is run in the configured Netlify environment with a valid API key and model.
