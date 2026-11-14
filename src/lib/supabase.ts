import { createClient } from '@supabase/supabase-js'

const configuredUrl = import.meta.env.VITE_SUPABASE_URL
const configuredAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(configuredUrl && configuredAnonKey)

if (!supabaseConfigured) {
  console.warn('Supabase URL or anon key is missing. Authenticated features will remain unavailable until environment variables are configured.')
}

// A valid inert placeholder prevents the whole application from crashing during local
// UI development when Supabase is not configured. Requests will fail until real values exist.
export const supabase = createClient(
  configuredUrl || 'https://placeholder.supabase.co',
  configuredAnonKey || 'placeholder-anon-key',
)
