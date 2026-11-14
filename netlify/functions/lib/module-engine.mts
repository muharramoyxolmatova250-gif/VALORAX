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

/**
 * Rule-based checks over the submitted evidence ledger and rights-cleared sale rows.
 * These checks never claim that web research, physical inspection or private records occurred.
 */
export function buildDeterministicModuleReport(input: {
  assetName: string
  records: ModuleEvidence[]
  sales: ModuleSale[]
}): DeterministicModuleReport {
  const { records, sales } = input
  const textOf = (r: ModuleEvidence) => [r.claim, r.sourceName, r.sourceUrl].join(' ')
  const ids = (pattern: RegExp) => records.filter(r => pattern.test(textOf(r))).map(r => r.id)
  const identityIds = ids(/\b(vin|chassis|serial|reference number|build number|engine number)\b/i)
  const factoryIds = ids(/factory|manufacturer|build sheet|production record|certificate/i)
  const provenanceIds = ids(/owner|ownership|provenance|delivered to|consigned by/i)
  const saleIds = ids(/auction|sold for|sale price|hammer price|realised|realized|completed sale|transaction/i)
  const conditionIds = ids(/condition|service|maintenance|restoration|repair|inspection/i)
  const legalIds = ids(/title|registration|import|export|customs/i)
  const allDisputed = records.filter(r => r.status === 'disputed')
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
      counterfactual_reasoning: make('Counterfactual Reasoning', 'LIMITED',
        ['No alternative history is asserted as fact by the deterministic engine.', 'Counterfactual scenarios require a clearly defined event or claim to test.'],
        ['Define one falsifiable alternative scenario.', 'Identify primary records that would support or disconfirm it.', 'Keep hypothetical consequences separate from documented history.'],
        [], ['This module does not generate historical facts from hypothetical scenarios.']),
      cross_asset_connections: make('Cross-Asset Connection Discovery', 'NO_SIGNAL',
        ['The submitted ledger is scoped to one named asset; no independently identified second asset is supplied for deterministic linking.'],
        ['Compare exact VIN/serial, owner, event, document and auction identifiers across separately researched assets.', 'Require a source-backed relationship; model-name similarity is not a connection.'],
        [], ['No connection is inferred from shared brand or model name. A persistent multi-asset graph is not queried by this function.']),
      evidence_conflict_engine: make('Evidence Conflict Engine', allDisputed.length ? 'ACTIONABLE' : 'LIMITED',
        allDisputed.length ? [`${allDisputed.length} submitted record(s) are explicitly marked disputed and need claim-by-claim comparison.`] : ['No submitted record is explicitly marked disputed. This does not prove all claims agree.'],
        ['Pair claims about the same attribute and exact asset identifier.', 'Compare source dates, primary/secondary status and source lineage before resolving.', 'Do not resolve a conflict by majority vote among copied sources.'],
        allDisputed.map(r => r.id), ['A disputed label is a user-supplied workflow status, not an independently detected contradiction.']),
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
