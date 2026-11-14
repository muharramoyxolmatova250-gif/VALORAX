import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeFinding } from '../netlify/functions/lib/intelligence-guard.mts'

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
