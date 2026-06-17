import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getCurrentMonday, formatWeekKey } from '../lib/dateUtils';

// Ile czekamy na odpowiedź bazy, zanim uznamy zapytanie za zawieszone.
const FETCH_TIMEOUT_MS = 15000;
// Ile razy ponawiamy po timeoucie/błędzie, zanim pokażemy błąd użytkownikowi.
const MAX_RETRIES = 2;
// Po jakim czasie ciszy realtime wykonujemy JEDNO przeładowanie (anty-lawina).
const REALTIME_DEBOUNCE_MS = 600;

// Owija obietnicę limitem czasu — jeśli baza nie odpowie, odrzucamy zamiast wisieć w nieskończoność.
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Przekroczono czas oczekiwania (${label})`)), ms)
    ),
  ]);
}

export function useAppData() {
  const [data, setData] = useState({ clients: [], routes: [], entries: [], receipts: [], allRoutes: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const hasLoadedRef = useRef(false);
  const fetchInFlightRef = useRef(null);
  const debounceRef = useRef(null);
  const mountedRef = useRef(true);

  const runFetch = async () => {
    let lastErr = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const lastWeekDt = new Date(getCurrentMonday().getTime() - 7 * 86400000);
        const lastWeekStr = formatWeekKey(lastWeekDt);

        const [
          { data: clients, error: clientsError },
          { data: routes, error: routesError },
          { data: entries, error: entriesError },
          { data: receipts, error: receiptsError },
        ] = await withTimeout(
          Promise.all([
            supabase.from('clients').select('*').order('sort_order'),
            supabase.from('routes').select('*').order('sort_order'),
            supabase.from('entries').select('*').is('deleted_at', null).or(`done.eq.false,week_key.gte.${lastWeekStr},pick_week_key.gte.${lastWeekStr}`),
            supabase.from('laundry_receipts').select('*').is('deleted_at', null).order('doc_no', { ascending: false }),
          ]),
          FETCH_TIMEOUT_MS,
          'pobieranie danych'
        );

        // Kartki prania są opcjonalne — jeśli migracja `laundry_receipts` nie jest
        // jeszcze wgrana na bazę, nie wywalamy całej aplikacji, tylko pomijamy listę.
        if (receiptsError) console.warn('Pominięto kartki prania:', receiptsError.message);

        const fetchError = clientsError || routesError || entriesError;
        if (fetchError) throw fetchError;

        if (!mountedRef.current) return;
        const allRoutes = routes || [];
        setData({
          clients: clients || [],
          routes: allRoutes,
          entries: entries || [],
          receipts: receiptsError ? [] : (receipts || []),
          allRoutes,
        });
        hasLoadedRef.current = true;
        setError(null);
        return; // sukces — kończymy
      } catch (err) {
        lastErr = err;
        // Krótka przerwa przed ponowieniem (rośnie z każdą próbą).
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        }
      }
    }
    // Wyczerpaliśmy próby — pokazujemy błąd.
    if (mountedRef.current && lastErr) setError(lastErr.message);
  };

  const fetchData = async () => {
    if (fetchInFlightRef.current) return fetchInFlightRef.current;

    const request = (async () => {
      try {
        if (!hasLoadedRef.current) setLoading(true);
        await runFetch();
      } finally {
        if (mountedRef.current) setLoading(false);
        fetchInFlightRef.current = null;
      }
    })();

    fetchInFlightRef.current = request;
    return request;
  };

  // Realtime: zamiast przeładowywać przy KAŻDEJ zmianie, zbieramy zmiany
  // i robimy jedno przeładowanie po chwili ciszy (debounce). To zabija lawinę
  // zapytań, gdy ktoś wpisuje dużo danych pod rząd.
  const scheduleRefetch = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      fetchData();
    }, REALTIME_DEBOUNCE_MS);
  };

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    const channel = supabase.channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, scheduleRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, scheduleRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'routes' }, scheduleRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'laundry_receipts' }, scheduleRefetch)
      .subscribe();
    return () => {
      mountedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, []);

  return { ...data, loading, error, refetch: fetchData };
}

// Helper: przefiltruj dane dla kierowcy na podstawie jego tras
export function filterForDriver(data, routesStr) {
  if (!routesStr) return data; // brak tras = brak filtrowania
  const ids = new Set(
    routesStr.split(',').map(s => s.trim()).filter(Boolean).map(Number)
  );
  if (ids.size === 0) return data;
  return {
    ...data,
    clients: data.clients.filter(c => ids.has(c.route_id)),
    routes: data.routes.filter(r => ids.has(r.id)),
    entries: data.entries.filter(e => ids.has(e.route_id)),
  };
}
