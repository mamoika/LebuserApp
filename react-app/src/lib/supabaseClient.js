import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

// Wrapper dodający automatyczne ponawianie zapytań HTTP w przypadku nagłych, 
// krótkotrwałych problemów z siecią (np. wybudzanie aplikacji ze snu na iOS/Safari).
async function fetchWithRetry(url, options) {
  const MAX_RETRIES = 3;
  const BASE_DELAY = 1000;
  
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      lastError = err;
      const isNetworkError = err instanceof TypeError && 
        /load failed|failed to fetch|networkerror|network request failed|internet connection appears to be offline/i.test(err.message || '');
        
      if (!isNetworkError || attempt === MAX_RETRIES) {
        throw err;
      }
      
      // Zwiększamy czas oczekiwania z każdą próbą (1s, 2s, 3s)
      await new Promise(r => setTimeout(r, BASE_DELAY * (attempt + 1)));
    }
  }
  throw lastError;
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: {
    fetch: fetchWithRetry
  }
});
