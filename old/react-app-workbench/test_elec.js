import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf-8');
const envVars = envContent.split('\n').reduce((acc, line) => {
  const [key, val] = line.split('=');
  if (key && val) acc[key.trim()] = val.trim();
  return acc;
}, {});

const supabase = createClient(envVars.VITE_SUPABASE_URL, envVars.VITE_SUPABASE_ANON_KEY);

async function main() {
  const { data } = await supabase.from('daily_costs').select('entry_date, elec_end, water_end, fiat_end').order('entry_date', { ascending: false }).limit(40);
  console.log(JSON.stringify(data, null, 2));
}
main();
