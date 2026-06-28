import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://suvyqbyrcpzrtxbnuunu.supabase.co';
const supabaseKey = '<redacted-supabase-anon-key>';

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
