/* global process */
import { createClient } from '@supabase/supabase-js'
const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

const supabase = createClient(supabaseUrl, supabaseKey)
async function run() {
  const { data, error } = await supabase.from('driver_trips').select('*').limit(1)
  if (error) console.error(error)
  else console.log(Object.keys(data[0] || {}))
}
run()
