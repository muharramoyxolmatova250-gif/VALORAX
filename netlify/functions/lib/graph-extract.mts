export type GraphEntityType = 'person' | 'organization' | 'auction' | 'document' | 'event'

export type GraphCandidate = {
  entity_type: GraphEntityType
  canonical_key: string
  label: string
  attributes: Record<string, string>
  relationship_type: string
  evidence_record_id: string
}

const ORGANIZATIONS = [
  'RM Sotheby\'s', 'Sotheby\'s', 'Bonhams', 'Gooding Christie\'s',
  'Broad Arrow Auctions', 'Mecum Auctions', 'Barrett-Jackson',
  'Pagani Automobili', 'Ferrari', 'Bugatti', 'Porsche',
]

function cleanLabel(value: string) {
  return value.trim().replace(/^["'“”]+|["'“”]+$/g, '').replace(/[.,;:]+$/, '').replace(/\s+/g, ' ').slice(0, 140)
}

function key(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 160)
}

function add(
  out: Map<string, GraphCandidate>,
  entity_type: GraphEntityType,
  labelRaw: string,
  relationship_type: string,
  evidence_record_id: string,
  attributes: Record<string, string> = {},
) {
  const label = cleanLabel(labelRaw)
  const canonical_key = key(label)
  if (!label || canonical_key.length < 3) return
  const id = entity_type + ':' + canonical_key
  if (!out.has(id)) out.set(id, { entity_type, canonical_key, label, attributes, relationship_type, evidence_record_id })
}

/**
 * Extract only explicitly labelled names and a small allow-list of organizations.
 * Every result remains a candidate tied to the exact submitted evidence record.
 * This is entity discovery, not verification of ownership or historical truth.
 */
export function extractGraphCandidates(record: {
  id: string
  claim: string
  sourceName: string
  sourceUrl: string
}): GraphCandidate[] {
  const out = new Map<string, GraphCandidate>()
  const text = [record.claim, record.sourceName].filter(Boolean).join('\n')

  for (const organization of ORGANIZATIONS) {
    const escaped = organization.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp('\\b' + escaped + '\\b', 'i').test(text)) {
      add(out, 'organization', organization, 'mentioned_by_evidence', record.id, { extraction: 'allowlisted_name_match' })
    }
  }

  const labelledPatterns: Array<{ type: GraphEntityType; label: string; relation: string; pattern: RegExp }> = [
    { type: 'person', label: 'previous_owner', relation: 'previous_owner_claimed_by_evidence', pattern: /(?:previous|former|past)\s+owner\s*[:=-]\s*([^\n|;,]{2,100})/gi },
    { type: 'person', label: 'owner', relation: 'owner_claimed_by_evidence', pattern: /(?:registered\s+owner|owner\s+name)\s*[:=-]\s*([^\n|;,]{2,100})/gi },
    { type: 'auction', label: 'auction', relation: 'auction_context_claimed_by_evidence', pattern: /(?:auction|sale\s+event)\s*[:=-]\s*([^\n|;,]{3,120})/gi },
    { type: 'event', label: 'event', relation: 'event_mentioned_by_evidence', pattern: /(?:event|race|concours|exhibition)\s*[:=-]\s*([^\n|;,]{3,120})/gi },
    { type: 'document', label: 'document', relation: 'document_described_by_evidence', pattern: /(?:document|certificate|title|invoice|service\s+record)\s*[:=-]\s*([^\n|;,]{3,120})/gi },
  ]
  for (const item of labelledPatterns) {
    for (const match of text.matchAll(item.pattern)) {
      const label = cleanLabel(match[1])
      add(out, item.type, label, item.relation, record.id, { extracted_from: item.label, explicit_label: item.label })
    }
  }

  return [...out.values()]
}
