import { createClient } from '@supabase/supabase-js'
const supabaseUrl = 'https://suvyqbyrcpzrtxbnuunu.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1dnlxYnlyY3B6cnR4Ym51dW51Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNDQyNjAsImV4cCI6MjA5NTkyMDI2MH0.WrmLqJT-aNUb1a1uppvxzIJGeYMlL_jOy3BJvh4dfck';
const supabase = createClient(supabaseUrl, supabaseKey)
async function run() {
  const { error } = await supabase.rpc('execute_sql', { sql: 'ALTER TABLE entries ADD COLUMN IF NOT EXISTS baskets INTEGER DEFAULT 1;' })
  if (error) console.error("RPC failed, we need to alter table via postgres directly or API.", error)
  else console.log("Added baskets column successfully.")
}
run()
