import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export function useAppData() {
  const [data, setData] = useState({ clients: [], routes: [], entries: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [
        { data: clients }, 
        { data: routes }, 
        { data: entries }
      ] = await Promise.all([
        supabase.from('clients').select('*').order('sort_order'),
        supabase.from('routes').select('*').order('sort_order'),
        supabase.from('entries').select('*')
      ]);

      setData({
        clients: clients || [],
        routes: routes || [],
        entries: entries || []
      });
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Nasłuchuj na zmiany w tabelach (Realtime updates)
    const channel = supabase.channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'routes' }, fetchData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { ...data, loading, error, refetch: fetchData };
}
