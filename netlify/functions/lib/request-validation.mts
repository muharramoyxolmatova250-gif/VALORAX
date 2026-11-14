export type IncomingEvidence = {
  id: string
  assetName: string
  claim: string
  sourceName: string
  sourceUrl: string
  status: 'seller_claim' | 'source_observed' | 'independently_corroborated' | 'disputed' | 'unknown'
  createdAt: string
}
export type ValidatedResearchRequest = {
  assetName: string
  records: Array<{
    id: string
    assetName: string
    claim: string
    sourceName: string
    sourceUrl: string
    status: IncomingEvidence['status']
    recordedAt: string
  }>
}
export type ValidationResult =
  | { ok: true; value: ValidatedResearchRequest }
  | { ok: false; status: 400 | 413; error: string }

const MAX_BODY_BYTES = 40_000
const MAX_RECORDS = 12
const MAX_TOTAL_TEXT = 24_000
const clean = (value: string, max: number) => value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max)
const allowedStatuses = new Set(['seller_claim', 'source_observed', 'independently_corroborated', 'disputed', 'unknown'])

function safeEvidenceUrl(raw: string): boolean {
  if (!raw) return true
  try {
    const url = new URL(raw)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return false
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false
    // Evidence URLs are references only. Reject all IP literals, including private,
    // loopback, link-local and mapped-IPv6 forms, to avoid numeric-address edge cases.
    if (host.startsWith('[') || /^\\d+(?:\\.\\d+){0,3}$/.test(host)) return false
    return true
  } catch {
    return false
  }
}

/** Validate untrusted client input before charging quota or calling the model. */
export function validateResearchRequest(rawBody: string): ValidationResult {
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: 'Request is too large.' }
  }
  let body: unknown
  try { body = JSON.parse(rawBody) } catch {
    return { ok: false, status: 400, error: 'Invalid JSON request.' }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, status: 400, error: 'A JSON object is required.' }
  }
  const input = body as Record<string, unknown>
  if (typeof input.assetName !== 'string' || !Array.isArray(input.records)) {
    return { ok: false, status: 400, error: 'Asset name and evidence records are required.' }
  }
  const assetName = clean(input.assetName, 180)
  if (assetName.length < 2 || input.records.length < 1 || input.records.length > MAX_RECORDS) {
    return { ok: false, status: 400, error: 'Provide an asset name and between 1 and 12 evidence records.' }
  }
  const records: ValidatedResearchRequest['records'] = []
  const seenIds = new Set<string>()
  let totalText = assetName.length
  for (const raw of input.records) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, status: 400, error: 'Each evidence record must be an object.' }
    }
    const item = raw as Record<string, unknown>
    const fields = ['id', 'assetName', 'claim', 'sourceName', 'sourceUrl', 'status', 'createdAt']
    if (!fields.every(key => typeof item[key] === 'string') || !allowedStatuses.has(String(item.status))) {
      return { ok: false, status: 400, error: 'One or more evidence records have invalid fields or status.' }
    }
    const record = {
      id: clean(item.id as string, 80),
      assetName: clean(item.assetName as string, 180),
      claim: clean(item.claim as string, 1200),
      sourceName: clean(item.sourceName as string, 180),
      sourceUrl: clean(item.sourceUrl as string, 1000),
      status: item.status as IncomingEvidence['status'],
      recordedAt: clean(item.createdAt as string, 40),
    }
    if (!record.id || !record.claim || !record.sourceName || seenIds.has(record.id)) {
      return { ok: false, status: 400, error: 'Evidence IDs must be unique; claim and source name cannot be empty.' }
    }
    if (record.assetName !== assetName) {
      return { ok: false, status: 400, error: 'All evidence records must refer to the same exact asset name.' }
    }
    if (!safeEvidenceUrl(record.sourceUrl)) {
      return { ok: false, status: 400, error: 'Evidence URLs must be valid public HTTP or HTTPS URLs without credentials.' }
    }
    if (record.recordedAt && !Number.isFinite(Date.parse(record.recordedAt))) {
      return { ok: false, status: 400, error: 'Evidence dates must be valid date strings.' }
    }
    seenIds.add(record.id)
    totalText += record.id.length + record.assetName.length + record.claim.length + record.sourceName.length + record.sourceUrl.length + record.recordedAt.length
    records.push(record)
  }
  if (totalText > MAX_TOTAL_TEXT) {
    return { ok: false, status: 413, error: 'Evidence text exceeds the allowed total size.' }
  }
  return { ok: true, value: { assetName, records } }
}
