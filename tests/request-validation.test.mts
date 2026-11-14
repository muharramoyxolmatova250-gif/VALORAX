import test from 'node:test'
import assert from 'node:assert/strict'
import { validateResearchRequest } from '../netlify/functions/lib/request-validation.mts'

const sample = (overrides: Record<string, unknown> = {}) => ({
  assetName: 'Pagani Huayra R',
  records: [{
    id: 'r1', assetName: 'Pagani Huayra R', claim: 'Serial 11/30',
    sourceName: 'Auction catalogue', sourceUrl: 'https://example.com/lot',
    status: 'source_observed', createdAt: '2026-11-14T10:00:00Z',
    ...overrides,
  }],
})

test('accepts a valid public evidence URL and normalizes fields', () => {
  const result = validateResearchRequest(JSON.stringify(sample()))
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.value.records[0].recordedAt, '2026-11-14T10:00:00Z')
})

test('rejects duplicate evidence IDs and empty claims', () => {
  const body = sample()
  body.records.push({ ...body.records[0] })
  const duplicate = validateResearchRequest(JSON.stringify(body))
  assert.equal(duplicate.ok, false)
  const empty = validateResearchRequest(JSON.stringify(sample({ claim: '   ' })))
  assert.equal(empty.ok, false)
})

test('rejects credentialed, local and non-http source URLs', () => {
  for (const sourceUrl of ['javascript:alert(1)', 'https://user:pass@example.com/x', 'http://127.0.0.1/admin', 'http://localhost/x', 'http://192.168.1.1/x']) {
    const result = validateResearchRequest(JSON.stringify(sample({ sourceUrl })))
    assert.equal(result.ok, false, sourceUrl)
  }
})

test('rejects mismatched asset names and oversized request bodies', () => {
  const mismatch = sample({ assetName: 'Different car' })
  assert.equal(validateResearchRequest(JSON.stringify(mismatch)).ok, false)
  assert.equal(validateResearchRequest(' '.repeat(40_001)).status, 413)
})
