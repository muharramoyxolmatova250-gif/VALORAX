import test from 'node:test'
import assert from 'node:assert/strict'
import { buildNegativeSpaceAudit } from '../netlify/functions/lib/negative-space.mts'

test('reports absent submitted evidence as a gap, not as proof a record does not exist', () => {
  const audit = buildNegativeSpaceAudit([
    { key: 'identity', label: 'Exact identity', status: 'NOT_PRESENT_IN_SUBMITTED_RECORDS', record_ids: [], note: '' },
    { key: 'transactions', label: 'Completed sales', status: 'PRESENT_IN_SUBMITTED_RECORDS', record_ids: ['r1'], note: '' },
  ], [{ title: 'Auction catalogue', url: 'https://www.example-auction.com/lot/1' }], ['Pagani Huayra R chassis history', 'Pagani Huayra R chassis history'], [
    { action: 'search', queries: ['Pagani Huayra R chassis history'], url: null, pattern: null, source_urls: ['https://www.example-auction.com/search-result'] },
    { action: 'open_page', queries: [], url: 'https://www.example-auction.com/lot/1', pattern: null, source_urls: [] },
    { action: 'find_in_page', queries: [], url: 'https://www.example-auction.com/lot/1', pattern: 'ZA9H11WTYYSF76003', source_urls: [] },
  ])
  assert.equal(audit.gaps.length, 1)
  assert.equal(audit.gaps[0].significance, 'IDENTITY_CRITICAL')
  assert.ok(audit.searched_source_domains.includes('example-auction.com'))
  assert.match(audit.limitations[0], /not evidence of fraud/)
  assert.match(audit.search_scope[2], /does not prove/)
  assert.deepEqual(audit.search_queries, ['Pagani Huayra R chassis history'])
  assert.equal(audit.opened_page_urls[0], 'https://www.example-auction.com/lot/1')
  assert.equal(audit.find_in_page_checks[0].pattern, 'ZA9H11WTYYSF76003')
  assert.ok(audit.searched_source_urls.includes('https://www.example-auction.com/search-result'))
})

test('does not invent searched domains when there are no citation annotations', () => {
  const audit = buildNegativeSpaceAudit([], [])
  assert.deepEqual(audit.searched_source_domains, [])
  assert.deepEqual(audit.search_queries, [])
  assert.equal(audit.expected_trace_count, 0)
  assert.match(audit.limitations[2], /Search query strings are recorded only/)
})
