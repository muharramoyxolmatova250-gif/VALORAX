export type FindingStatus = 'SUPPORTED' | 'PARTIAL' | 'NOT_FOUND' | 'CONFLICT' | 'NOT_APPLICABLE'

export type IntelligenceFinding = {
  status: FindingStatus
  summary: string
  findings: string[]
  evidence_refs: string[]
  confidence: number
  limitations: string[]
  next_actions: string[]
}

export type IntelligenceModuleReport = {
  negative_space: IntelligenceFinding
  counterfactual_reasoning: IntelligenceFinding
  cross_asset_connections: IntelligenceFinding
  evidence_conflict_engine: IntelligenceFinding
  unknown_asset_hypotheses: IntelligenceFinding
  acquisition_intelligence: IntelligenceFinding
  rarity_intelligence: IntelligenceFinding
  valuation_intelligence: IntelligenceFinding
}

export type ServiceLayer = {
  summary: string
  priorities: string[]
  limitations: string[]
}

export type AdvancedAnalysisFunctions = {
  hidden_history: IntelligenceFinding
  market_illusion: IntelligenceFinding
  provenance_gaps: IntelligenceFinding
  rarity_deception: IntelligenceFinding
  negotiation_intelligence: IntelligenceFinding
  counterfactual_history: IntelligenceFinding
  private_knowledge_discovery: IntelligenceFinding
}

export function normalizeFinding(
  finding: IntelligenceFinding,
  allowedUrls: Set<string>,
  key: string,
): IntelligenceFinding {
  const validRefs = finding.evidence_refs.filter((value) => {
    try {
      return allowedUrls.has(new URL(value).href)
    } catch {
      return false
    }
  })
  const refs = [...new Set(validRefs)]
  const invalidRefs = finding.evidence_refs.length - validRefs.length
  const result: IntelligenceFinding = {
    ...finding,
    evidence_refs: refs,
    confidence: Number.isFinite(finding.confidence)
      ? Math.max(0, Math.min(1, finding.confidence))
      : 0,
    findings: finding.findings.filter((value) => typeof value === 'string' && value.trim()).slice(0, 12),
    limitations: finding.limitations.filter((value) => typeof value === 'string' && value.trim()).slice(0, 12),
    next_actions: finding.next_actions.filter((value) => typeof value === 'string' && value.trim()).slice(0, 12),
  }

  const reasons: string[] = []
  if (invalidRefs > 0) reasons.push('Unsupported evidence references were removed.')
  if (result.status === 'SUPPORTED' && (refs.length === 0 || result.findings.length === 0)) {
    reasons.push('A supported finding requires at least one returned research citation and a concrete finding.')
  }
  if (result.status === 'CONFLICT' && refs.length < 2) {
    reasons.push('A conflict finding requires at least two returned citation URLs.')
  }
  if (result.status === 'NOT_FOUND' && refs.length === 0) {
    reasons.push('No citation identifies the public sources or search trail reviewed for this not-found result.')
  }
  if (key === 'counterfactual_reasoning' || key === 'counterfactual_history' || key === 'unknown_asset_hypotheses') {
    if (result.status === 'SUPPORTED') {
      reasons.push('Hypothetical scenarios and unresolved identity hypotheses cannot be labelled as established facts.')
    }
  }
  if (['cross_asset_connections', 'rarity_intelligence', 'valuation_intelligence', 'rarity_deception', 'negotiation_intelligence'].includes(key)
    && result.status === 'SUPPORTED' && refs.length < 2) {
    reasons.push('This analysis requires at least two traceable research citations before it can be marked supported.')
  }

  if (reasons.length > 0) {
    result.status = 'PARTIAL'
    result.confidence = Math.min(result.confidence, 0.45)
    result.limitations = [...result.limitations, ...reasons]
  }
  return result
}

export function normalizeIntelligence(
  intelligence: IntelligenceModuleReport,
  advanced: AdvancedAnalysisFunctions,
  citations: Array<{ title: string; url: string }>,
) {
  const allowedUrls = new Set(citations.map(({ url }) => {
    try { return new URL(url).href } catch { return '' }
  }).filter(Boolean))

  for (const [key, finding] of Object.entries(intelligence)) {
    Object.assign(intelligence[key as keyof IntelligenceModuleReport], normalizeFinding(finding, allowedUrls, key))
  }
  for (const [key, finding] of Object.entries(advanced)) {
    Object.assign(advanced[key as keyof AdvancedAnalysisFunctions], normalizeFinding(finding, allowedUrls, key))
  }
}
