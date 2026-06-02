import { supabase } from './src/js/supabaseClient.js';
async function run() {
  const { data, error } = await supabase.from('clients').select('*').limit(1);
  console.log({data, error});
}
run();
