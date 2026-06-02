const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://suvyqbyrcpzrtxbnuunu.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1dnlxYnlyY3B6cnR4Ym51dW51Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNDQyNjAsImV4cCI6MjA5NTkyMDI2MH0.WrmLqJT-aNUb1a1uppvxzIJGeYMlL_jOy3BJvh4dfck';

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.rpc('login_user', {
    p_username: 'admin',
    p_password: 'admin123'
  });
  console.log("Response:", data, error);
}

test();
