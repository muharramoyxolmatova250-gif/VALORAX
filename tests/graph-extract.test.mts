import test from 'node:test'
import assert from 'node:assert/strict'
import { extractGraphCandidates } from '../netlify/functions/lib/graph-extract.mts'

test('extracts only explicitly labelled owner, auction, event and document candidates', () => {
  const found = extractGraphCandidates({
    id: 'evidence-1',
    claim: 'Previous owner: Jane Example\nAuction: RM Sotheby\'s Monaco 2022\nEvent: Pebble Beach Concours\nDocument: Factory certificate',
    sourceName: 'RM Sotheby\'s',
    sourceUrl: 'https://rmsothebys.com/lot/123',
  })
  assert.ok(found.some(x => x.entity_type === 'person' && x.label === 'Jane Example'))
  assert.ok(found.some(x => x.entity_type === 'auction' && x.label === 'RM Sotheby\'s Monaco 2022'))
  assert.ok(found.some(x => x.entity_type === 'event' && x.label === 'Pebble Beach Concours'))
  assert.ok(found.some(x => x.entity_type === 'document' && x.label === 'Factory certificate'))
  assert.ok(found.every(x => x.evidence_record_id === 'evidence-1'))
})

test('does not infer an owner from an unlabelled name or treat a manufacturer as owner', () => {
  const found = extractGraphCandidates({
    id: 'evidence-2',
    claim: 'Jane Example visited the Pagani factory. The vehicle was displayed in Monaco.',
    sourceName: 'Pagani Automobili',
    sourceUrl: 'https://pagani.com',
  })
  assert.equal(found.some(x => x.entity_type === 'person'), false)
  assert.ok(found.some(x => x.entity_type === 'organization' && x.label === 'Pagani Automobili'))
})

test('keeps graph discovery as a candidate, never as verified fact', () => {
  const found = extractGraphCandidates({
    id: 'evidence-3',
    claim: 'Registered owner: Example Collector',
    sourceName: '',
    sourceUrl: '',
  })
  assert.equal(found[0].relationship_type, 'owner_claimed_by_evidence')
  assert.equal(found[0].evidence_record_id, 'evidence-3')
})
