import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDeterministicModuleReport } from '../netlify/functions/lib/module-engine.mts'

test('returns all eight deterministic module checks without inventing evidence', () => {
  const report = buildDeterministicModuleReport({
    assetName: 'Pagani Huayra R',
    records: [
      { id: 'r1', claim: 'VIN ZA9H11WTYYSF76003; Serial No. 11/30', sourceName: 'Seller listing', sourceUrl: 'https://seller.example/lot', status: 'seller_claim', recordedAt: '2026-11-01' },
      { id: 'r2', claim: 'Only 30 units produced', sourceName: 'Seller listing', sourceUrl: 'https://seller.example/lot', status: 'disputed', recordedAt: '2026-11-02' },
    ],
    sales: [
      { sale_amount: 1000000, currency: 'USD', result_status: 'sold', sale_date: '2025-01-01' },
      { sale_amount: 2000000, currency: 'USD', result_status: 'unsold', sale_date: '2025-02-01' },
    ],
  })
  assert.equal(report.generated_by, 'deterministic_rules_v1')
  assert.equal(Object.keys(report.modules).length, 8)
  assert.equal(report.modules.negative_space.state, 'ACTIONABLE')
  assert.equal(report.modules.evidence_conflict_engine.state, 'ACTIONABLE')
  assert.match(report.modules.valuation_intelligence.observations[0], /1 rights-cleared sold record/)
  assert.match(report.modules.cross_asset_connections.limitations[0], /No connection is inferred/)
  assert.ok(report.modules.unknown_asset_hypotheses.limitations.length > 0)
})

test('does not turn an empty market database into a claim that no sales exist', () => {
  const report = buildDeterministicModuleReport({ assetName: 'Unknown object', records: [], sales: [] })
  assert.match(report.modules.valuation_intelligence.observations[0], /No eligible rights-cleared/)
  assert.match(report.modules.valuation_intelligence.limitations[1], /does not mean no sales exist/)
})

test('detects conflicting explicit production-count claims without choosing a winner', () => {
  const report = buildDeterministicModuleReport({
    assetName: 'Pagani Huayra R',
    records: [
      { id: 'factory', claim: 'Production of 30 units', sourceName: 'Manufacturer archive', sourceUrl: 'https://pagani.example/archive', status: 'source_observed' },
      { id: 'seller', claim: 'Only 25 units built', sourceName: 'Seller listing', sourceUrl: 'https://seller.example/car', status: 'seller_claim' },
    ],
    sales: [],
  })
  const conflict = report.modules.evidence_conflict_engine
  assert.equal(conflict.state, 'ACTIONABLE')
  assert.equal(conflict.conflicts?.[0]?.attribute, 'claimed_production_total')
  assert.deepEqual(conflict.conflicts?.[0]?.values, ['30', '25'])
  assert.deepEqual(conflict.conflicts?.[0]?.record_ids, ['factory', 'seller'])
  assert.match(conflict.limitations[1], /not proof that either source is correct/)
})
