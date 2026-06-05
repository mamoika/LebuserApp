/* global process */
import { createClient } from '@supabase/supabase-js'
const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

const supabase = createClient(supabaseUrl, supabaseKey)
async function run() {
  const { error } = await supabase.rpc('execute_sql', { sql: 'ALTER TABLE entries ADD COLUMN IF NOT EXISTS baskets INTEGER DEFAULT 1;' })
  if (error) console.error("RPC failed, we need to alter table via postgres directly or API.", error)
  else console.log("Added baskets column successfully.")
}
run()
