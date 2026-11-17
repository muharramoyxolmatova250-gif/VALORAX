type CountResult = { count: number; error?: string }

async function countRows(baseUrl: string, serviceKey: string, filters: string): Promise<CountResult> {
  const url = new URL('/rest/v1/omnisight_premium_screening', baseUrl)
  url.searchParams.set('select', 'id')
  url.searchParams.set('premium_category', 'not.is.null')
  if (filters) {
    const [key, value] = filters.split('=')
    url.searchParams.set(key, value)
  }
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
  })
  if (!response.ok) return { count: 0, error: `Database returned HTTP ${response.status}` }
  const contentRange = response.headers.get('content-range') || ''
  const match = contentRange.match(/\/(\d+)$/)
  return { count: match ? Number(match[1]) : 0 }
}

export default async () => {
  const baseUrl = Netlify.env.get('SUPABASE_URL')
  const serviceKey = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!baseUrl || !serviceKey || !serviceKey.startsWith('eyJ')) {
    return Response.json(
      { error: 'Server-side screening credentials are not configured.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  try {
    const [all, passed] = await Promise.all([
      countRows(baseUrl, serviceKey, ''),
      countRows(baseUrl, serviceKey, 'passes_automated_screen=eq.true'),
    ])
    if (all.error || passed.error) {
      return Response.json({ error: 'Screening summary query failed.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
    }

    return Response.json({
      candidates: all.count,
      passed: passed.count,
      blocked: Math.max(all.count - passed.count, 0),
    }, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
      },
    })
  } catch {
    return Response.json({ error: 'Screening summary is temporarily unavailable.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
}
