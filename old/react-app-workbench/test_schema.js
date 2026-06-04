import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env.local', 'utf-8');
const envVars = envContent.split('
').reduce((acc, line) => {
  const [key, val] = line.split('=');
  if (key && val) acc[key.trim()] = val.trim();
  return acc;
}, {});

const supabase = createClient(envVars.VITE_SUPABASE_URL, envVars.VITE_SUPABASE_ANON_KEY);

async function main() {
  const { data, error } = await supabase.rpc('query_sql', { query: 'SELECT column_name, data_type FROM information_schema.columns WHERE table_name = ''daily_costs'';' });
  console.log(JSON.stringify(data, null, 2));
}
main();
