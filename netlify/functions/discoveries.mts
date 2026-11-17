import type { Config } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

export default async () => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    return Response.json({ error: 'Discovery feed is not configured.' }, { status: 503 })
  }

  try {
    const db = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await db.rpc('omnisight_public_discovery_feed', {
      limit_count: 30,
    })

    if (error) {
      console.error('OMNISIGHT discovery feed failed:', error.message)
      return Response.json({ error: 'Discovery feed is temporarily unavailable.' }, { status: 503 })
    }

    return Response.json(data ?? [], {
      headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' },
    })
  } catch (error) {
    console.error('OMNISIGHT discovery feed request failed:', error)
    return Response.json({ error: 'Discovery feed request failed.' }, { status: 502 })
  }
}

export const config: Config = {
  path: '/api/discoveries',
}
