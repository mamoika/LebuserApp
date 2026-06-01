import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export function useAppData() {
  const [data, setData] = useState({ clients: [], routes: [], drivers: [], entries: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [
        { data: clients }, 
        { data: routes }, 
        { data: drivers },
        { data: entries }
      ] = await Promise.all([
        supabase.from('clients').select('*').order('sort_order'),
        supabase.from('routes').select('*').order('id'),
        supabase.from('drivers').select('*'),
        supabase.from('entries').select('*')
      ]);

      setData({
        clients: clients || [],
        routes: routes || [],
        drivers: drivers || [],
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

    // Nasłuchuj na zmiany w tabeli wpisów (Realtime updates)
    const channel = supabase.channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, fetchData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { ...data, loading, error, refetch: fetchData };
}
