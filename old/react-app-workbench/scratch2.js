import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://suvyqbyrcpzrtxbnuunu.supabase.co';
const supabaseKey = '<redacted-supabase-anon-key>';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('daily_costs').select('*').like('entry_date', '2026-04-%').order('entry_date', { ascending: false }).limit(1);
  if (error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));
}
check();
