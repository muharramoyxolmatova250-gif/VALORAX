import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeSourceLineage } from '../netlify/functions/lib/source-lineage.mts'

test('normalizes tracking URLs and counts the same publisher only once', () => {
  const result = analyzeSourceLineage([
    { title: 'Official Pagani Huayra R specifications', url: 'https://www.pagani.com/huayra-r/?utm_source=newsletter' },
    { title: 'Pagani Huayra R specifications', url: 'http://pagani.com/huayra-r/#specs' },
  ])
  assert.equal(result.distinct_publisher_domains, 1)
  assert.equal(result.records[0].normalized_url, result.records[1].normalized_url)
  assert.ok(result.records.every(item => item.independence_state === 'same_publisher'))
})

test('flags matching headlines across domains as potentially syndicated', () => {
  const result = analyzeSourceLineage([
    { title: 'Pagani announces new Huayra R limited edition', url: 'https://example-news.com/story' },
    { title: 'Pagani announces new Huayra R limited edition', url: 'https://collector-journal.net/news' },
  ])
  assert.equal(result.distinct_publisher_domains, 2)
  assert.equal(result.corroboration_candidate_domains, 0)
  assert.ok(result.records.every(item => item.independence_state === 'potentially_dependent'))
})

test('flags known press-release distribution platforms', () => {
  const result = analyzeSourceLineage([
    { title: 'Official company announcement', url: 'https://www.prnewswire.com/news-releases/example.html' },
    { title: 'Independent reporting', url: 'https://specialist-journal.com/article' },
  ])
  assert.equal(result.records[0].publisher_type, 'distribution_platform')
  assert.equal(result.records[0].independence_state, 'potentially_dependent')
  assert.equal(result.records[1].independence_state, 'independence_unverified')
})

test('rejects non-web URLs and never calls an unflagged source independent', () => {
  const result = analyzeSourceLineage([
    { title: 'Not a web source', url: 'javascript:alert(1)' },
    { title: 'Publisher page', url: 'https://auction-house.example/lot/123' },
  ])
  assert.equal(result.records.length, 1)
  assert.equal(result.records[0].independence_state, 'independence_unverified')
  assert.match(result.limitations[3], /not confirmed independent/)
})
