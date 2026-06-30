import { createClient } from '@supabase/supabase-js'
import { env } from '../env'

// Backend admin client. Uses the service-role key, which bypasses RLS.
// Used for Auth admin API (createUser / signInWithPassword / getUserById),
// data, and storage. No session persistence — we issue our own JWT.
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})
