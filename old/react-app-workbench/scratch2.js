import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://suvyqbyrcpzrtxbnuunu.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1dnlxYnlyY3B6cnR4Ym51dW51Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNDQyNjAsImV4cCI6MjA5NTkyMDI2MH0.WrmLqJT-aNUb1a1uppvxzIJGeYMlL_jOy3BJvh4dfck';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('daily_costs').select('*').like('entry_date', '2026-04-%').order('entry_date', { ascending: false }).limit(1);
  if (error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));
}
check();
