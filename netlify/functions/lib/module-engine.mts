export type ModuleEvidence = {
  id: string
  claim: string
  sourceName: string
  sourceUrl: string
  status: string
  recordedAt?: string
}
export type ModuleSale = {
  sale_amount: number
  currency: string
  result_status: 'sold' | 'unsold' | 'withdrawn'
  sale_date: string | null
}
export type ModuleSignal = {
  module: string
  state: 'ACTIONABLE' | 'LIMITED' | 'NO_SIGNAL'
  observations: string[]
  checks: string[]
  evidence_record_ids: string[]
  limitations: string[]
  conflicts?: Array<{ attribute: string; values: string[]; record_ids: string[]; source_domains: string[] }>
  connections?: CrossAssetLink[]
}
export type CrossAssetLink = {
  related_asset: string
  related_asset_key: string
  shared_entity: string
  shared_entity_type: string
  relationship_type: string
  evidence_id: string | null
  review_status: string
}
export type DeterministicModuleReport = {
  generated_by: 'deterministic_rules_v1'
  modules: {
    negative_space: ModuleSignal
    counterfactual_reasoning: ModuleSignal
    cross_asset_connections: ModuleSignal
    evidence_conflict_engine: ModuleSignal
    unknown_asset_hypotheses: ModuleSignal
    acquisition_intelligence: ModuleSignal
    rarity_intelligence: ModuleSignal
    valuation_intelligence: ModuleSignal
  }
}
const make = (module: string, state: ModuleSignal['state'], observations: string[], checks: string[], ids: string[] = [], limitations: string[] = []): ModuleSignal =>
  ({ module, state, observations, checks, evidence_record_ids: [...new Set(ids)], limitations })
const unique = (values: string[]) => [...new Set(values.filter(Boolean))]
const extractClaimAttributes = (record: ModuleEvidence) => {
  const value = record.claim
  const found: Array<{ attribute: string; value: string }> = []
  const vin = value.match(/\b[A-HJ-NPR-Z0-9]{17}\b/i)?.[0]
  if (vin) found.push({ attribute: 'VIN', value: vin.toUpperCase() })
  const serial = value.match(/\b(?:serial|production number|build number)\s*(?:no\.?|number|#|:)?\s*(\d{1,3}\s*\/\s*\d{1,3})\b/i)?.[1]
  if (serial) found.push({ attribute: 'production_sequence', value: serial.replace(/\s+/g, '') })
  const production = value.match(/\b(?:limited to|only|total production of|production of)\s*(\d{1,5})\s*(?:units|cars|examples)?\b/i)?.[1]
  if (production) found.push({ attribute: 'claimed_production_total', value: production })
  const year = value.match(/\b(?:model year|built in|manufactured in)\s*(19\d{2}|20\d{2})\b/i)?.[1]
  if (year) found.push({ attribute: 'stated_build_year', value: year })
  return found
}
const sourceDomain = (url: string) => {
  try { return new URL(url).hostname.replace(/^www\./i, '').toLowerCase() } catch { return '' }
}

/**
 * Rule-based checks over the submitted evidence ledger and rights-cleared sale rows.
 * These checks never claim that web research, physical inspection or private records occurred.
 */
export function buildDeterministicModuleReport(input: {
  assetName: string
  records: ModuleEvidence[]
  sales: ModuleSale[]
  crossAssetLinks?: CrossAssetLink[]
}): DeterministicModuleReport {
  const { records, sales, crossAssetLinks = [] } = input
  const textOf = (r: ModuleEvidence) => [r.claim, r.sourceName, r.sourceUrl].join(' ')
  const ids = (pattern: RegExp) => records.filter(r => pattern.test(textOf(r))).map(r => r.id)
  const identityIds = ids(/\b(vin|chassis|serial|reference number|build number|engine number)\b/i)
  const factoryIds = ids(/factory|manufacturer|build sheet|production record|certificate/i)
  const provenanceIds = ids(/owner|ownership|provenance|delivered to|consigned by/i)
  const saleIds = ids(/auction|sold for|sale price|hammer price|realised|realized|completed sale|transaction/i)
  const conditionIds = ids(/condition|service|maintenance|restoration|repair|inspection/i)
  const legalIds = ids(/title|registration|import|export|customs/i)
  const allDisputed = records.filter(r => r.status === 'disputed')
  const attributeGroups = new Map<string, Array<{ value: string; id: string; domain: string }>>()
  for (const record of records) {
    for (const item of extractClaimAttributes(record)) {
      const rows = attributeGroups.get(item.attribute) ?? []
      rows.push({ value: item.value, id: record.id, domain: sourceDomain(record.sourceUrl) })
      attributeGroups.set(item.attribute, rows)
    }
  }
  const detectedConflicts = [...attributeGroups.entries()].flatMap(([attribute, rows]) => {
    const values = unique(rows.map(row => row.value))
    const domains = unique(rows.map(row => row.domain))
    if (values.length < 2) return []
    return [{ attribute, values, record_ids: unique(rows.map(row => row.id)), source_domains: domains }]
  })
  const identifiers = records.flatMap(r => {
    const matches = textOf(r).match(/\b[A-HJ-NPR-Z0-9]{17}\b|\b\d{1,3}\s*\/\s*\d{1,3}\b/gi) ?? []
    return matches.map(v => v.replace(/\s+/g, ''))
  })
  const uniqueIdentifiers = unique(identifiers)
  const gaps = [
    ['exact identity', identityIds], ['factory/build', factoryIds], ['ownership/provenance', provenanceIds],
    ['completed transactions', saleIds], ['condition/service', conditionIds], ['legal/title', legalIds],
  ] as const
  const missing = gaps.filter(([, matched]) => matched.length === 0).map(([label]) => label)
  const sold = sales.filter(s => s.result_status === 'sold' && Number.isFinite(s.sale_amount) && s.sale_amount > 0 && /^[A-Z]{3}$/.test(s.currency))
  const currencies = unique(sold.map(s => s.currency))
  const saleSummary = currencies.map(currency => {
    const rows = sold.filter(s => s.currency === currency)
    const amounts = rows.map(s => s.sale_amount).sort((a,b) => a-b)
    return { currency, count: rows.length, min: amounts[0], max: amounts[amounts.length - 1] }
  })
  return {
    generated_by: 'deterministic_rules_v1',
    modules: {
      negative_space: make('Negative-Space Intelligence', missing.length ? 'ACTIONABLE' : 'LIMITED',
        missing.length ? [`Submitted ledger has no keyword-matched record for: ${missing.join(', ')}.`] : ['The submitted ledger contains keyword matches across the configured evidence topics.'],
        ['Search manufacturer/factory archives for identity and build records.', 'Request dated ownership, condition and legal documents where relevant.', 'Record each search scope and inaccessible archive separately.'],
        unique([...identityIds, ...factoryIds, ...provenanceIds, ...saleIds, ...conditionIds, ...legalIds]),
        ['This is coverage of submitted records only; it does not establish whether missing records exist elsewhere.', 'Keyword matching is a triage aid, not verification.']),
      counterfactual_reasoning: make('Counterfactual Reasoning', detectedConflicts.length ? 'ACTIONABLE' : 'LIMITED',
        detectedConflicts.length
          ? detectedConflicts.flatMap(conflict => conflict.values.map(value => `HYPOTHETICAL ONLY: if ${conflict.attribute} = ${value}, reconcile records ${conflict.record_ids.join(', ')} against the manufacturer or original dated record before accepting this scenario.`))
          : ['No machine-comparable contradiction was available to build a case-specific alternative scenario.', 'No alternative history is asserted as fact by the deterministic engine.'],
        ['For each scenario, identify a primary record that would support it and a different record that would falsify it.', 'Compare dates, exact asset identifiers and source lineage before drawing consequences.', 'Keep hypothetical outcomes separate from documented history.'],
        unique(detectedConflicts.flatMap(conflict => conflict.record_ids)),
        ['Scenarios are conditional reasoning prompts, not claims that an alternative event occurred.', 'Automatic scenarios are limited to explicit identifier, production-count and build-year conflicts.']),

      cross_asset_connections: {
        ...make('Cross-Asset Connection Discovery', crossAssetLinks.length ? 'ACTIONABLE' : 'NO_SIGNAL',
          crossAssetLinks.length
            ? crossAssetLinks.map(link => `Saved research links this asset to ${link.related_asset} through shared ${link.shared_entity_type}: ${link.shared_entity} (${link.review_status}).`)
            : ['No evidence-linked shared entity with another saved asset was found in this user\'s OMNISIGHT graph.'],
          ['Review the original evidence attached to each shared entity.', 'Distinguish a shared auction house or marque from a meaningful owner, event or document connection.', 'Promote a relationship only after human review of the underlying records.'],
          unique(crossAssetLinks.map(link => link.evidence_id || '').filter(Boolean)),
          ['Only this user\'s saved OMNISIGHT graph is searched; no global or private external database is queried.', 'A shared entity is a research lead, not proof of common ownership or wrongdoing.']),
        connections: crossAssetLinks,
      },
      evidence_conflict_engine: {
        ...make('Evidence Conflict Engine', detectedConflicts.length || allDisputed.length ? 'ACTIONABLE' : 'LIMITED',
          detectedConflicts.length ? detectedConflicts.map(conflict => `Conflicting submitted values for ${conflict.attribute}: ${conflict.values.join(' vs ')}.`) : allDisputed.length ? [`${allDisputed.length} submitted record(s) are explicitly marked disputed; no machine-comparable attribute conflict was extracted.`] : ['No machine-comparable contradiction was detected in the submitted ledger. This does not prove all claims agree.'],
          ['Compare only claims about the same exact asset and attribute.', 'Check original documents, dates, context and source lineage before resolution.', 'Treat differing values from copied sources as one evidence family, not independent votes.'],
          unique([...detectedConflicts.flatMap(item => item.record_ids), ...allDisputed.map(r => r.id)]),
          ['Automatic extraction covers only explicit VIN, production sequence, production-total and stated build-year patterns.', 'A detected value difference is a conflict candidate, not proof that either source is correct.']),
        conflicts: detectedConflicts,
      },
      unknown_asset_hypotheses: make('Unknown Asset Hypothesis Generator', uniqueIdentifiers.length > 1 ? 'ACTIONABLE' : 'LIMITED',
        uniqueIdentifiers.length > 1 ? [`The ledger contains ${uniqueIdentifiers.length} distinct identifier-like strings that may need identity reconciliation.`] : ['The ledger does not contain multiple distinct identifier-like strings for hypothesis ranking.'],
        ['Check each candidate identifier against the manufacturer or registry.', 'Keep VIN/chassis, production sequence and auction lot numbers as separate identifier types.', 'Write each explanation as a hypothesis and state what would falsify it.'],
        records.filter(r => /\b(vin|chassis|serial|build number)\b/i.test(textOf(r))).map(r => r.id),
        ['Identifier-like text is not validated against an authoritative registry.', 'No identity hypothesis is promoted to fact.']),
      acquisition_intelligence: make('Acquisition Intelligence', 'ACTIONABLE',
        [`Buyer diligence coverage: ${[identityIds, factoryIds, provenanceIds, conditionIds, legalIds].filter(x => x.length).length}/5 key topic groups have at least one keyword-matched submitted record.`],
        ['Verify identity and seller authority before payment.', 'Obtain independent condition inspection and original supporting documents.', 'Check title, liens, export/import and transfer requirements with qualified professionals.', 'Use escrow and contractual protections reviewed by counsel.'],
        unique([...identityIds, ...factoryIds, ...provenanceIds, ...conditionIds, ...legalIds]),
        ['Coverage does not verify document authenticity, title cleanliness, condition or seller authority.', 'This is diligence guidance, not a purchase recommendation or investment advice.']),
      rarity_intelligence: make('Rarity Intelligence', ids(/only|limited|one of|production|units|made|built|numbered|edition/i).length ? 'ACTIONABLE' : 'LIMITED',
        ids(/only|limited|one of|production|units|made|built|numbered|edition/i).length ? ['Rarity-related language appears in submitted records and requires separation into production, surviving examples and specification claims.'] : ['No explicit rarity/production-count language was detected in submitted records.'],
        ['Verify total factory production from a primary manufacturer source.', 'Treat surviving-example counts as a separate claim requiring separate evidence.', 'Verify special specification and numbered-edition claims at the individual-asset level.'],
        ids(/only|limited|one of|production|units|made|built|numbered|edition/i),
        ['Text matching cannot validate a production count or surviving population.']),
      valuation_intelligence: make('Valuation Intelligence', sold.length ? 'ACTIONABLE' : 'LIMITED',
        sold.length ? saleSummary.map(s => `${s.count} rights-cleared sold record(s) in ${s.currency}; observed range ${s.min}–${s.max}.`) : ['No eligible rights-cleared completed-sale records were supplied to this analysis.'],
        ['Use completed sales, not asking prices, as transaction observations.', 'Compare exact model/version, specification, condition, provenance, date and sale terms.', 'Keep currencies separate unless a documented conversion method and date are supplied.'],
        [], ['The deterministic engine reports descriptive ranges only; it does not appraise or predict value.', 'An empty cleared dataset does not mean no sales exist elsewhere.'])
    }
  }
}
