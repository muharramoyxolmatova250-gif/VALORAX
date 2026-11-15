export type EvidenceStatus =
  | 'seller_claim'
  | 'source_observed'
  | 'independently_corroborated'
  | 'disputed'
  | 'unknown'

export interface EvidenceRecord {
  id: string
  assetName: string
  claim: string
  sourceName: string
  sourceUrl: string
  status: EvidenceStatus
  createdAt: string
}

export interface EvidenceAudit {
  total: number
  sourceLinked: number
  independentlyCorroborated: number
  sellerClaims: number
  disputed: number
  warnings: string[]
}

/**
 * Evidence triage only. This function does not authenticate an asset,
 * verify a URL's contents, or establish legal ownership.
 */
export function auditEvidence(records: EvidenceRecord[]): EvidenceAudit {
  const warnings: string[] = []
  const sourceLinked = records.filter(record => isHttpUrl(record.sourceUrl)).length
  const independentlyCorroborated = records.filter(
    record => record.status === 'independently_corroborated'
  ).length
  const sellerClaims = records.filter(record => record.status === 'seller_claim').length
  const disputed = records.filter(record => record.status === 'disputed').length

  if (records.length === 0) warnings.push('No evidence records have been added.')
  if (sourceLinked < records.length) warnings.push('One or more records have no valid source URL.')
  if (sellerClaims > 0) warnings.push('Seller claims are present and must not be treated as independently verified facts.')
  if (disputed > 0) warnings.push('Conflicting or disputed information requires human review.')
  if (independentlyCorroborated === 0 && records.length > 0) {
    warnings.push('No record is marked as independently corroborated.')
  }

  return {
    total: records.length,
    sourceLinked,
    independentlyCorroborated,
    sellerClaims,
    disputed,
    warnings,
  }
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}
