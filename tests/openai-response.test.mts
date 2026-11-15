import test from 'node:test'
import assert from 'node:assert/strict'
import { extractOpenAiResponse } from '../netlify/functions/lib/openai-response.mts'

test('captures Responses API search queries, returned sources, opened pages and in-page checks', () => {
  const parsed = extractOpenAiResponse({
    output: [
      {
        type: 'web_search_call',
        action: {
          type: 'search',
          queries: ['Pagani Huayra R chassis 003', 'Pagani Huayra R serial 11/30'],
          sources: [{ type: 'url', url: 'https://www.pagani.com/huayra-r/' }],
        },
      },
      {
        type: 'web_search_call',
        action: { type: 'open_page', url: 'https://rmsothebys.com/lot/132' },
      },
      {
        type: 'web_search_call',
        action: { type: 'find_in_page', url: 'https://rmsothebys.com/lot/132', pattern: 'ZA9H11WTYYSF76003' },
      },
      {
        type: 'message',
        content: [{
          type: 'output_text',
          text: 'The catalogue lists the car.',
          annotations: [{ type: 'url_citation', title: 'RM Sotheby\'s lot', url: 'https://rmsothebys.com/lot/132' }],
        }],
      },
    ],
    usage: { input_tokens: 1200, output_tokens: 450, total_tokens: 1650 },
  })
  assert.deepEqual(parsed.searchQueries, ['Pagani Huayra R chassis 003', 'Pagani Huayra R serial 11/30'])
  assert.equal(parsed.searchTrace.length, 3)
  assert.equal(parsed.searchTrace[0].source_urls[0], 'https://www.pagani.com/huayra-r/')
  assert.equal(parsed.searchTrace[1].url, 'https://rmsothebys.com/lot/132')
  assert.equal(parsed.searchTrace[2].pattern, 'ZA9H11WTYYSF76003')
  assert.equal(parsed.citations.length, 1)
  assert.deepEqual(parsed.providerUsage, { input_tokens: 1200, output_tokens: 450, total_tokens: 1650 })
})

test('does not fabricate missing search traces or token usage', () => {
  const parsed = extractOpenAiResponse({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'No search performed.' }] }] })
  assert.deepEqual(parsed.searchQueries, [])
  assert.deepEqual(parsed.searchTrace, [])
  assert.equal(parsed.providerUsage, null)
  assert.equal(parsed.citations.length, 0)
})

test('supports the legacy single query field but prefers query arrays', () => {
  const parsed = extractOpenAiResponse({
    output: [
      { type: 'web_search_call', action: { type: 'search', query: 'legacy query' } },
      { type: 'web_search_call', action: { type: 'search', queries: ['new query'] } },
    ],
  })
  assert.deepEqual(parsed.searchQueries, ['legacy query', 'new query'])
})
