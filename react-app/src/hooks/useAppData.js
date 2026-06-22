import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getCurrentMonday, formatWeekKey } from '../lib/dateUtils';
import { useAuth } from '../context/AuthContext';
import { getAppData } from '../lib/appDataRpc';

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
  const { sessionToken } = useAuth();
  const [data, setData] = useState({ clients: [], routes: [], entries: [], receipts: [], allRoutes: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const hasLoadedRef = useRef(false);
  const fetchInFlightRef = useRef(null);
  const debounceRef = useRef(null);
  const mountedRef = useRef(true);

  const runFetch = useCallback(async () => {
    if (!sessionToken) {
      if (mountedRef.current) setError('Brak aktywnej sesji');
      return;
    }

    let lastErr = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const lastWeekDt = new Date(getCurrentMonday().getTime() - 7 * 86400000);
        const lastWeekStr = formatWeekKey(lastWeekDt);

        const result = await withTimeout(
          getAppData(sessionToken, lastWeekStr),
          FETCH_TIMEOUT_MS,
          'pobieranie danych'
        );

        if (!mountedRef.current) return;
        const routes = result?.routes || [];
        setData({
          clients: result?.clients || [],
          routes,
          entries: result?.entries || [],
          receipts: result?.receipts || [],
          allRoutes: routes,
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
  }, [sessionToken]);

  const fetchData = useCallback(async () => {
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
  }, [runFetch]);

  // Realtime: zamiast przeładowywać przy KAŻDEJ zmianie, zbieramy zmiany
  // i robimy jedno przeładowanie po chwili ciszy (debounce). To zabija lawinę
  // zapytań, gdy ktoś wpisuje dużo danych pod rząd.
  const scheduleRefetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      fetchData();
    }, REALTIME_DEBOUNCE_MS);
  }, [fetchData]);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    // Unikalna nazwa kanału na każdy mount — zapobiega kolizji nazw przy
    // podwójnym montowaniu (React StrictMode / HMR), gdy poprzedni kanał nie
    // został jeszcze w pełni usunięty. Logika subskrypcji pozostaje ta sama.
    const channelName = `schema-db-changes-${
      globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
    }`;
    const channel = supabase.channel(channelName)
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
  }, [fetchData, scheduleRefetch]);

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
