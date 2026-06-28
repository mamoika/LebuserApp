import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://suvyqbyrcpzrtxbnuunu.supabase.co';
const supabaseKey = '<redacted-supabase-anon-key>';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const updates = [
    { old: 'BIURO / BÜRO', new: 'BIURO' },
    { old: 'TECHNICZNY / TECHNIKER', new: 'TECHNICZNY' },
    { old: 'KIEROWCY / FAHRER', new: 'KIEROWCY' }
  ];

  for (const u of updates) {
    const { data, error } = await supabase
      .from('employees')
      .update({ group_name: u.new })
      .eq('group_name', u.old);
    
    if (error) {
      console.error('Error updating', u.old, error);
    } else {
      console.log('Updated', u.old, 'to', u.new);
    }
  }
}

run();
