export type IntelligenceStatus =
  | 'SUPPORTED'
  | 'PARTIAL'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'NOT_APPLICABLE'

export interface IntelligenceFinding {
  status: IntelligenceStatus
  summary: string
  findings: string[]
  evidence_refs: string[]
  confidence: number
  limitations: string[]
  next_actions: string[]
}

export interface IntelligenceModuleReport {
  negative_space: IntelligenceFinding
  counterfactual_reasoning: IntelligenceFinding
  cross_asset_connections: IntelligenceFinding
  evidence_conflict_engine: IntelligenceFinding
  unknown_asset_hypotheses: IntelligenceFinding
  acquisition_intelligence: IntelligenceFinding
  rarity_intelligence: IntelligenceFinding
  valuation_intelligence: IntelligenceFinding
}

export interface IntelligenceServiceLayer {
  summary: string
  priorities: string[]
  limitations: string[]
}

export interface IntelligenceServiceLayers {
  global_asset_discovery: IntelligenceServiceLayer
  private_collector_intelligence: IntelligenceServiceLayer
}

export interface AdvancedAnalysisFunctions {
  hidden_history: IntelligenceFinding
  market_illusion: IntelligenceFinding
  provenance_gaps: IntelligenceFinding
  rarity_deception: IntelligenceFinding
  negotiation_intelligence: IntelligenceFinding
  counterfactual_history: IntelligenceFinding
  private_knowledge_discovery: IntelligenceFinding
}

export const INTELLIGENCE_MODULES: Array<{ key: keyof IntelligenceModuleReport; name: string; purpose: string }> = [
  { key: 'negative_space', name: 'Negative-Space Intelligence', purpose: 'Identify expected records and traces that were not found in the defined search.' },
  { key: 'counterfactual_reasoning', name: 'Counterfactual Reasoning', purpose: 'Compare plausible alternative histories without presenting hypotheticals as facts.' },
  { key: 'cross_asset_connections', name: 'Cross-Asset Connection Discovery', purpose: 'Find evidence-backed links between assets, people, events and organisations.' },
  { key: 'evidence_conflict_engine', name: 'Evidence Conflict Engine', purpose: 'Surface incompatible claims and preserve both sides for review.' },
  { key: 'unknown_asset_hypotheses', name: 'Unknown Asset Hypothesis Generator', purpose: 'Generate explicitly labelled hypotheses for unresolved identity or history questions.' },
  { key: 'acquisition_intelligence', name: 'Acquisition Intelligence', purpose: 'Explain buyer-relevant strengths, risks, missing checks and decision limits.' },
  { key: 'rarity_intelligence', name: 'Rarity Intelligence', purpose: 'Test production, surviving-example and specification rarity claims against evidence.' },
  { key: 'valuation_intelligence', name: 'Valuation Intelligence', purpose: 'Analyse documented asking prices, realised sales and comparable limitations.' },
]

export const ADVANCED_ANALYSIS_FUNCTIONS: Array<{ key: keyof AdvancedAnalysisFunctions; name: string }> = [
  { key: 'hidden_history', name: 'HIDDEN HISTORY' },
  { key: 'market_illusion', name: 'MARKET ILLUSION' },
  { key: 'provenance_gaps', name: 'PROVENANCE GAPS' },
  { key: 'rarity_deception', name: 'RARITY DECEPTION' },
  { key: 'negotiation_intelligence', name: 'NEGOTIATION INTELLIGENCE' },
  { key: 'counterfactual_history', name: 'COUNTERFACTUAL HISTORY' },
  { key: 'private_knowledge_discovery', name: 'PRIVATE KNOWLEDGE DISCOVERY' },
]

export function isIntelligenceFinding(value: unknown): value is IntelligenceFinding {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    ['SUPPORTED', 'PARTIAL', 'NOT_FOUND', 'CONFLICT', 'NOT_APPLICABLE'].includes(String(item.status)) &&
    typeof item.summary === 'string' &&
    Array.isArray(item.findings) &&
    Array.isArray(item.evidence_refs) &&
    typeof item.confidence === 'number' &&
    Array.isArray(item.limitations) &&
    Array.isArray(item.next_actions)
  )
}
