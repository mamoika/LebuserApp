import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://suvyqbyrcpzrtxbnuunu.supabase.co';
const supabaseKey = '<redacted-supabase-anon-key>';

const supabase = createClient(supabaseUrl, supabaseKey);

async function populateRoutes() {
  console.log("Dodawanie tras...");
  
  const routesData = Array.from({length: 10}, (_, i) => ({
    id: i + 1,
    name: `Trasa ${i + 1}`
  }));

  const { data, error } = await supabase.from('routes').upsert(routesData, { onConflict: 'id' });
  
  if (error) {
    console.error("Błąd podczas dodawania tras:", error);
  } else {
    console.log("Trasy zostały pomyślnie dodane!");
  }
}

populateRoutes();
