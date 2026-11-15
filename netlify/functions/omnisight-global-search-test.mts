import type { Handler } from '@netlify/functions'
import { timingSafeEqual } from 'node:crypto'
import { runGlobalSearch } from './omnisight-global-search.mts'

function authorized(header: string | undefined, expected: string) {
  if (!header?.startsWith('Bearer ')) return false
  const supplied = Buffer.from(header.slice(7))
  const secret = Buffer.from(expected)
  return supplied.length === secret.length && timingSafeEqual(supplied, secret)
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { Allow: 'POST' }, body: JSON.stringify({ ok: false, error: 'METHOD_NOT_ALLOWED' }) }
  }

  const expected = process.env.OMNISIGHT_TEST_TOKEN
  if (!expected || expected.length < 32) {
    return { statusCode: 503, body: JSON.stringify({ ok: false, error: 'TEST_ENDPOINT_NOT_CONFIGURED' }) }
  }

  const authorization = Object.entries(event.headers || {})
    .find(([key]) => key.toLowerCase() === 'authorization')?.[1]
  if (!authorized(authorization, expected)) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'UNAUTHORIZED' }) }
  }

  try {
    const result = await runGlobalSearch()
    return {
      statusCode: result.ok ? 200 : 503,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ ...result, mode: 'manual_test', publishedToLiveLots: 0 }),
    }
  } catch {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ ok: false, error: 'OMNISIGHT_TEST_FAILED' }),
    }
  }
}
