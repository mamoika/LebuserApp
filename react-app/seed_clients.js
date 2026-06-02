import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://suvyqbyrcpzrtxbnuunu.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1dnlxYnlyY3B6cnR4Ym51dW51Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNDQyNjAsImV4cCI6MjA5NTkyMDI2MH0.WrmLqJT-aNUb1a1uppvxzIJGeYMlL_jOy3BJvh4dfck';

const supabase = createClient(supabaseUrl, supabaseKey);

async function addClients() {
  console.log("Dodawanie klientów...");
  
  const clientsData = [
    { name: 'Szpital Wojewódzki', route_id: 1, sort_order: 1, lat: 52.2297, lng: 21.0122 },
    { name: 'Hotel Marriott', route_id: 2, sort_order: 1, lat: 52.2274, lng: 21.0029 },
    { name: 'Restauracja Belvedere', route_id: 3, sort_order: 1, lat: 52.2144, lng: 21.0312 }
  ];

  const { data, error } = await supabase.from('clients').insert(clientsData);
  
  if (error) {
    console.error("Błąd podczas dodawania klientów:", error);
  } else {
    console.log("Klienci zostali pomyślnie dodani!");
  }
}

addClients();
