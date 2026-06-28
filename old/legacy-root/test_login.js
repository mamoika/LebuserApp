const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://suvyqbyrcpzrtxbnuunu.supabase.co';
const supabaseKey = '<redacted-supabase-anon-key>';

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.rpc('login_user', {
    p_username: 'admin',
    p_password: 'admin123'
  });
  console.log("Response:", data, error);
}

test();
