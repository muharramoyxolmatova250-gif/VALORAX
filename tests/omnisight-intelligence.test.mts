import test from 'node:test'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { normalizeFinding } from '../netlify/functions/lib/intelligence-guard.mts'
import { extractAssetIdentifiers, resolveAssetCanonicalKey } from '../netlify/functions/lib/omnisight-db.mts'

const citation = 'https://example.com/verified-record'
const allowed = new Set([citation])

function finding(overrides = {}) {
  return {
    status: 'SUPPORTED',
    summary: 'A source-backed finding.',
    findings: ['The record states a specific fact.'],
    evidence_refs: [citation],
    confidence: 0.92,
    limitations: [],
    next_actions: [],
    ...overrides,
  }
}

test('keeps a supported finding when it has a real citation and concrete finding', () => {
  const result = normalizeFinding(finding(), allowed, 'hidden_history')
  assert.equal(result.status, 'SUPPORTED')
  assert.equal(result.confidence, 0.92)
  assert.deepEqual(result.evidence_refs, [citation])
})

test('downgrades a supported finding when its citation was not returned by search', () => {
  const result = normalizeFinding(finding({ evidence_refs: ['https://fake.example/claim'] }), allowed, 'hidden_history')
  assert.equal(result.status, 'PARTIAL')
  assert.ok(result.confidence <= 0.45)
  assert.deepEqual(result.evidence_refs, [])
})

test('does not allow a conflict label with only one cited source', () => {
  const result = normalizeFinding(finding({ status: 'CONFLICT' }), allowed, 'evidence_conflict_engine')
  assert.equal(result.status, 'PARTIAL')
})

test('does not allow hypothetical history to be labelled as established fact', () => {
  const result = normalizeFinding(finding(), allowed, 'counterfactual_history')
  assert.equal(result.status, 'PARTIAL')
})

test('does not allow a supported valuation with only one source', () => {
  const result = normalizeFinding(finding(), allowed, 'valuation_intelligence')
  assert.equal(result.status, 'PARTIAL')
})

test('clamps invalid confidence and deduplicates citation URLs', () => {
  const result = normalizeFinding(finding({ confidence: 4, evidence_refs: [citation, citation] }), allowed, 'hidden_history')
  assert.equal(result.confidence, 1)
  assert.deepEqual(result.evidence_refs, [citation])
})

test('keeps VIN/chassis and production serial as different identifier types', () => {
  const result = extractAssetIdentifiers('Chassis No. ZA9H11WTYYSF76003; Serial No. 11/30')
  assert.deepEqual(result, [
    { identifier_type: 'vin_or_chassis', value: 'ZA9H11WTYYSF76003', normalized_value: 'ZA9H11WTYYSF76003' },
    { identifier_type: 'production_serial', value: '11/30', normalized_value: '11/30' },
  ])
})

test('does not infer a production serial from the final VIN digits', () => {
  const result = extractAssetIdentifiers('VIN: ZA9H11WTYYSF76003')
  assert.equal(result.length, 1)
  assert.equal(result[0].identifier_type, 'vin_or_chassis')
})

test('extracts an explicitly described numbered production sequence', () => {
  const result = extractAssetIdentifiers('Numbered 11 of 30 customer examples')
  assert.equal(result[0]?.identifier_type, 'production_serial')
  assert.equal(result[0]?.normalized_value, '11/30')
})

test('Pagani real-source fixture keeps target chassis, production serial and comparison car distinct', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/pagani-huayra-r.json', import.meta.url), 'utf8'))
  assert.equal(fixture.target_identity.vin_or_chassis, 'ZA9H11WTYYSF76003')
  assert.equal(fixture.target_identity.production_serial, '11/30')
  const identifiers = extractAssetIdentifiers(fixture.evidence_records[0].claim)
  assert.deepEqual(identifiers.map(item => [item.identifier_type, item.normalized_value]), [
    ['vin_or_chassis', 'ZA9H11WTYYSF76003'],
    ['production_serial', '11/30'],
  ])
  assert.match(fixture.comparison_only[0].claim, /ZA9H11WTYYSF76005/)
  assert.doesNotMatch(fixture.comparison_only[0].claim, /ZA9H11WTYYSF76003/)
  assert.ok(fixture.expected_invariants.some(item => item.includes('CHF 2,367,500')))
  const disputed = fixture.evidence_records.find(record => record.status === 'disputed')
  assert.ok(disputed)
  assert.match(disputed.claim, /CHF 5,292,500/)
  assert.match(disputed.claim, /does not clearly explain/)
  assert.ok(fixture.expected_invariants.some(item => item.includes('Do not speculate that the price difference includes the simulator')))
})

test('resolves an asset to a VIN key only when exactly one distinct VIN is present', () => {
  const single = resolveAssetCanonicalKey('2022 Pagani Huayra R', [
    'Chassis No. ZA9H11WTYYSF76003; Serial No. 11/30',
    'VIN ZA9H11WTYYSF76003',
  ])
  assert.equal(single.canonicalKey, 'identifier-za9h11wtyysf76003')
  assert.equal(single.identityState, 'single_vin_candidate')

  const multiple = resolveAssetCanonicalKey('2022 Pagani Huayra R', [
    'Chassis No. ZA9H11WTYYSF76003; Serial No. 11/30',
    'Chassis No. ZA9H11WTYYSF76005; Serial No. 5/30',
  ])
  assert.equal(multiple.canonicalKey, 'model-2022-pagani-huayra-r')
  assert.equal(multiple.identityState, 'multiple_vin_candidates')
})
