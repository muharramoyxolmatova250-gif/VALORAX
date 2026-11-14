import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeComparableSales } from '../netlify/functions/lib/market-intelligence.mts'

test('summarizes sold comparables by currency without mixing currencies', () => {
  const summary = summarizeComparableSales([
    { sale_amount: 100, currency: 'CHF', result_status: 'sold', sale_date: '2024-01-01' },
    { sale_amount: 300, currency: 'CHF', result_status: 'sold', sale_date: '2025-01-01' },
    { sale_amount: 200, currency: 'USD', result_status: 'sold', sale_date: '2025-02-01' },
    { sale_amount: 500, currency: 'CHF', result_status: 'unsold', sale_date: null },
  ])
  assert.equal(summary.sold_records, 3)
  assert.equal(summary.unsold_records, 1)
  assert.equal(summary.currency_groups.length, 2)
  assert.equal(summary.currency_groups.find(x => x.currency === 'CHF')?.median, 200)
  assert.equal(summary.currency_groups.find(x => x.currency === 'USD')?.median, 200)
  assert.ok(summary.limitations.some(item => item.includes('not an appraisal')))
})

test('does not produce a valuation range when no sold records are supplied', () => {
  const summary = summarizeComparableSales([
    { sale_amount: 100, currency: 'EUR', result_status: 'withdrawn', sale_date: null },
  ])
  assert.equal(summary.sold_records, 0)
  assert.deepEqual(summary.currency_groups, [])
  assert.match(summary.limitations[4], /no sales exist elsewhere/)
})
