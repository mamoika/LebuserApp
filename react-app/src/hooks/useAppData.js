import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getCurrentMonday, formatWeekKey } from '../lib/dateUtils';
import { useAuth } from '../context/AuthContext';
import { getAppData } from '../lib/appDataRpc';
import { captureError } from '../lib/sentry';

// Ile czekamy na odpowiedź bazy, zanim uznamy zapytanie za zawieszone.
const FETCH_TIMEOUT_MS = 15000;
// Ile razy ponawiamy po timeoucie/błędzie, zanim pokażemy błąd użytkownikowi.
const MAX_RETRIES = 2;
// Po jakim czasie ciszy realtime wykonujemy JEDNO przeładowanie (anty-lawina).
const REALTIME_DEBOUNCE_MS = 600;
// Krótki cache między widokami: przełączanie Harmonogram/Trasy nie powinno
// blokować UI pełnym pobieraniem tych samych danych.
const CACHE_TTL_MS = 30000;
const EMPTY_DATA = { clients: [], routes: [], entries: [], receipts: [], allRoutes: [] };

let sharedCache = null;
let sharedCacheToken = null;
let sharedCacheAt = 0;
let sharedFetch = null;
let sharedFetchToken = null;

// Owija obietnicę limitem czasu — jeśli baza nie odpowie, odrzucamy zamiast wisieć w nieskończoność.
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Przekroczono czas oczekiwania (${label})`)), ms)
    ),
  ]);
}

function isSessionError(err) {
  return err?.code === '28000' || /invalid or expired session|brak aktywnej sesji/i.test(err?.message || '');
}

function normalizeAppData(result) {
  const routes = result?.routes || [];
  return {
    clients: result?.clients || [],
    routes,
    entries: result?.entries || [],
    receipts: result?.receipts || [],
    allRoutes: routes,
  };
}

function getCachedData(sessionToken) {
  return sessionToken && sharedCacheToken === sessionToken ? sharedCache : null;
}

function hasFreshCache(sessionToken) {
  return !!getCachedData(sessionToken) && Date.now() - sharedCacheAt < CACHE_TTL_MS;
}

async function loadAppData(sessionToken, { force = false } = {}) {
  if (!force && hasFreshCache(sessionToken)) return sharedCache;
  if (sharedFetch && sharedFetchToken === sessionToken) return sharedFetch;

  const lastWeekDt = new Date(getCurrentMonday().getTime() - 7 * 86400000);
  const lastWeekStr = formatWeekKey(lastWeekDt);
  const token = sessionToken;

  sharedFetchToken = token;
  sharedFetch = withTimeout(
    getAppData(token, lastWeekStr),
    FETCH_TIMEOUT_MS,
    'pobieranie danych'
  ).then((result) => {
    const next = normalizeAppData(result);
    sharedCache = next;
    sharedCacheToken = token;
    sharedCacheAt = Date.now();
    return next;
  }).finally(() => {
    if (sharedFetchToken === token) {
      sharedFetch = null;
      sharedFetchToken = null;
    }
  });

  return sharedFetch;
}

export function useAppData() {
  const { sessionToken } = useAuth();
  const cachedData = getCachedData(sessionToken);
  const [data, setData] = useState(() => cachedData || EMPTY_DATA);
  const [loading, setLoading] = useState(() => !cachedData);
  const [error, setError] = useState(null);
  const hasLoadedRef = useRef(!!cachedData);
  const fetchInFlightRef = useRef(null);
  const debounceRef = useRef(null);
  const mountedRef = useRef(true);

  const runFetch = useCallback(async ({ force = false } = {}) => {
    if (!sessionToken) {
      if (mountedRef.current) setError('Brak aktywnej sesji');
      if (mountedRef.current) setLoading(false);
      return;
    }

    let lastErr = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const next = await loadAppData(sessionToken, { force });

        if (!mountedRef.current) return;
        setData(next);
        hasLoadedRef.current = true;
        setError(null);
        return; // sukces — kończymy
      } catch (err) {
        lastErr = err;
        if (isSessionError(err)) break;
        // Krótka przerwa przed ponowieniem (rośnie z każdą próbą).
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        }
      }
    }
    // Wyczerpaliśmy próby — pokazujemy błąd.
    if (mountedRef.current && lastErr) {
      setError(lastErr.message);
      setLoading(false);
    }
    // Zgłoś do Sentry ciche awarie ładowania danych (pomijając wygaśnięcie
    // sesji, które jest normalne) — to one psują ekran kierowcy/admina bez śladu.
    // Błędy sieciowe (offline/słaby zasięg u kierowcy) oznaczamy osobnym tagiem —
    // nie da się ich "naprawić" w kodzie, więc nie powinny wyglądać jak bug do zrobienia.
    if (lastErr && !isSessionError(lastErr)) {
      captureError(
        lastErr,
        { feature: 'useAppData', retries: MAX_RETRIES },
        lastErr.isNetworkError ? { networkError: 'true' } : undefined
      );
    }
  }, [sessionToken]);

  const fetchData = useCallback(async ({ force = false } = {}) => {
    if (fetchInFlightRef.current) return fetchInFlightRef.current;

    const cached = getCachedData(sessionToken);
    if (cached) {
      setData(cached);
      hasLoadedRef.current = true;
      setError(null);
      if (!force && hasFreshCache(sessionToken)) {
        setLoading(false);
        return cached;
      }
    }

    const request = (async () => {
      try {
        if (!hasLoadedRef.current) setLoading(true);
        await runFetch({ force });
      } finally {
        if (mountedRef.current) setLoading(false);
        fetchInFlightRef.current = null;
      }
    })();

    fetchInFlightRef.current = request;
    return request;
  }, [runFetch, sessionToken]);

  const refetch = useCallback(() => fetchData({ force: true }), [fetchData]);

  // Realtime: zamiast przeładowywać przy KAŻDEJ zmianie, zbieramy zmiany
  // i robimy jedno przeładowanie po chwili ciszy (debounce). To zabija lawinę
  // zapytań, gdy ktoś wpisuje dużo danych pod rząd.
  const scheduleRefetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      refetch();
    }, REALTIME_DEBOUNCE_MS);
  }, [refetch]);

  useEffect(() => {
    mountedRef.current = true;
    const cached = getCachedData(sessionToken);
    if (cached) {
      setData(cached);
      hasLoadedRef.current = true;
      setLoading(false);
    } else {
      setData(EMPTY_DATA);
      hasLoadedRef.current = false;
    }
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
  }, [fetchData, scheduleRefetch, sessionToken]);

  return { ...data, loading, error, refetch };
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
