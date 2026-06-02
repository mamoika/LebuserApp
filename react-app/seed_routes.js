import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://suvyqbyrcpzrtxbnuunu.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1dnlxYnlyY3B6cnR4Ym51dW51Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNDQyNjAsImV4cCI6MjA5NTkyMDI2MH0.WrmLqJT-aNUb1a1uppvxzIJGeYMlL_jOy3BJvh4dfck';

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
