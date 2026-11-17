import { schedule } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

/**
 * Publishes only rows accepted by the database's existing
 * omnisight_publish_eligible_lots() policy gate.
 *
 * The SQL function is the authority for source approval, active/upcoming
 * status, $500k minimum, checked valuation, data-use rights and deduplication.
 * This worker deliberately does not weaken or duplicate those rules.
 */
async function publishEligibleLots() {
  const url = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    console.error('OMNISIGHT publisher missing server configuration')
    return { ok: false, error: 'MISSING_SERVER_CONFIGURATION' }
  }

  const db = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await db.rpc('omnisight_publish_eligible_lots')
  if (error) {
    console.error('OMNISIGHT publisher RPC failed:', error.message)
    return { ok: false, error: 'PUBLISH_RPC_FAILED' }
  }

  const published = Number(data)
  if (!Number.isInteger(published) || published < 0) {
    console.error('OMNISIGHT publisher returned an invalid count')
    return { ok: false, error: 'INVALID_PUBLISH_COUNT' }
  }

  console.log('OMNISIGHT live publisher completed:', JSON.stringify({ published }))
  return { ok: true, published }
}

export default schedule('*/5 * * * *', async () => {
  if (process.env.OMNISIGHT_PUBLISHER_ENABLED !== 'true') {
    console.log('OMNISIGHT live publisher is disabled')
    return
  }
  await publishEligibleLots()
})

export const config = { schedule: '*/5 * * * *' }
