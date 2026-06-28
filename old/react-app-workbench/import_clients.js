import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = 'https://suvyqbyrcpzrtxbnuunu.supabase.co';
const supabaseKey = '<redacted-supabase-anon-key>';

const supabase = createClient(supabaseUrl, supabaseKey);

async function importClients() {
  console.log("Importowanie klientów z Google Sheets...");
  
  const csvData = fs.readFileSync('../clients.csv', 'utf8');
  const lines = csvData.split('\n').filter(line => line.trim() !== '');
  
  const clientsToInsert = [];
  
  // Pomijamy pierwszy wiersz (nagłówki)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // CSV format: "Nazwa","Trasa","Kolejnosc","Lat","Lng"
    const match = line.match(/"([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)"/);
    if (match) {
      const name = match[1].trim();
      if (!name) continue; // Pomiń puste nazwy
      
      const route_id = parseInt(match[2]) || 1;
      const sort_order = parseInt(match[3]) || 9999;
      
      // Google Sheets używa przecinka w liczbach dziesiętnych w PL, np. "52,73"
      const latStr = match[4].replace(',', '.');
      const lngStr = match[5].replace(',', '.');
      
      const lat = latStr ? parseFloat(latStr) : null;
      const lng = lngStr ? parseFloat(lngStr) : null;
      
      clientsToInsert.push({ name, route_id, sort_order, lat, lng });
    }
  }

  console.log(`Znaleziono ${clientsToInsert.length} klientów do zaimportowania.`);

  if (clientsToInsert.length > 0) {
    // Upsert w przypadku gdyby nazwa już istniała (dodaliśmy wcześniej testowych klientów, ale nazwy się nie pokrywają).
    // Tablica clients aktualnie nie ma constraints UNIQUE na name, więc użyjmy insert lub wyczyśćmy starą bazę.
    
    // Najpierw wyczyszczenie tabeli, by usunąć testowych klientów i wrzucić tylko prawdziwych
    await supabase.from('clients').delete().neq('name', 'FAKE_DELETE_ALL'); 
    
    // Wrzucanie paczkami
    const { error } = await supabase.from('clients').insert(clientsToInsert);
    
    if (error) {
      console.error("Błąd podczas importu:", error);
    } else {
      console.log("Klienci zaimportowani z powodzeniem!");
    }
  }
}

importClients();
