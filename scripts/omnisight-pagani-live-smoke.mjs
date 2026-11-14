import { readFile } from 'node:fs/promises'

const baseUrl = process.env.OMNISIGHT_BASE_URL?.replace(/\/$/, '')
const accessToken = process.env.OMNISIGHT_TEST_ACCESS_TOKEN
const fixturePath = new URL('../tests/fixtures/pagani-huayra-r.json', import.meta.url)

if (!baseUrl || !accessToken) {
  console.error('Set OMNISIGHT_BASE_URL and OMNISIGHT_TEST_ACCESS_TOKEN in your local shell. Never paste tokens into chat or commit them.')
  process.exit(2)
}

const fixture = JSON.parse(await readFile(fixturePath, 'utf8'))
const response = await fetch(baseUrl + '/api/omnisight/analyze', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: 'Bearer ' + accessToken,
  },
  body: JSON.stringify({
    assetName: fixture.asset_name,
    records: fixture.evidence_records,
  }),
  signal: AbortSignal.timeout(180_000),
})

const text = await response.text()
let payload
try {
  payload = JSON.parse(text)
} catch {
  console.error('Live smoke test returned non-JSON response. HTTP', response.status)
  process.exit(1)
}

if (!response.ok) {
  console.error('Live smoke test failed. HTTP', response.status, payload.error || 'Unknown server error')
  process.exit(1)
}

const checks = [
  ['verdict is a supported enum', ['GOOD', 'BAD', 'UNCERTAIN'].includes(payload.analysis?.verdict)],
  ['Pagani chassis/VIN and production serial are separate', payload.identity_identifiers?.some(x => x.identifier_type === 'vin_or_chassis' && x.value === fixture.target_identity.vin_or_chassis) && payload.identity_identifiers?.some(x => x.identifier_type === 'production_serial' && x.value === fixture.target_identity.production_serial)],
  ['source lineage report returned', Array.isArray(payload.source_lineage?.records)],
  ['negative-space audit returned', Array.isArray(payload.negative_space_audit?.gaps)],
  ['search action trace returned', Array.isArray(payload.negative_space_audit?.search_trace)],
  ['market summary returned', Array.isArray(payload.market_summary?.currency_groups)],
  ['private analysis persisted', Boolean(payload.persistence?.analysisId)],
  ['usage quota returned', Number.isFinite(payload.usage?.used) && Number.isFinite(payload.usage?.limit)],
]

for (const [label, passed] of checks) {
  console.log((passed ? 'PASS' : 'FAIL') + ' — ' + label)
}

console.log('HTTP status:', response.status)
console.log('Verdict:', payload.analysis.verdict)
console.log('Confidence:', payload.analysis.confidence)
console.log('Citation count:', payload.citations?.length ?? 0)
console.log('Graph nodes/links:', payload.persistence.graphEntityCount, '/', payload.persistence.graphRelationshipCount)
console.log('Analysis ID:', payload.persistence.analysisId)

if (checks.some(([, passed]) => !passed)) process.exit(1)
