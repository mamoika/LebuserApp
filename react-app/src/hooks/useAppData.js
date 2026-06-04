import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

export function useAppData() {
  const [data, setData] = useState({ clients: [], routes: [], entries: [], allRoutes: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const hasLoadedRef = useRef(false);
  const fetchInFlightRef = useRef(null);

  const fetchData = async () => {
    if (fetchInFlightRef.current) return fetchInFlightRef.current;

    const request = (async () => {
    try {
      if (!hasLoadedRef.current) setLoading(true);
      const [
        { data: clients, error: clientsError },
        { data: routes, error: routesError },
        { data: entries, error: entriesError }
      ] = await Promise.all([
        supabase.from('clients').select('*').order('sort_order'),
        supabase.from('routes').select('*').order('sort_order'),
        supabase.from('entries').select('*')
      ]);

      const fetchError = clientsError || routesError || entriesError;
      if (fetchError) throw fetchError;

      const allRoutes = routes || [];
      setData({
        clients: clients || [],
        routes: allRoutes,
        entries: entries || [],
        allRoutes,
      });
      hasLoadedRef.current = true;
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      fetchInFlightRef.current = null;
    }
    })();

    fetchInFlightRef.current = request;
    return request;
  };

  useEffect(() => {
    fetchData();
    const channel = supabase.channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'routes' }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
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
