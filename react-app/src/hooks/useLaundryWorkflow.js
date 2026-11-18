import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { getLaundryWorkflow } from '../lib/laundryRpc';
import { supabase } from '../lib/supabaseClient';

const REFRESH_INTERVAL_MS = 5000;

export function useLaundryWorkflow(sessionToken, enabled = true) {
  const channelId = useId();
  const request = useRef(0);
  const pending = useRef(false);
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const active = enabled && Boolean(sessionToken);

  const fetchSnapshot = useCallback(async (showLoading) => {
    if (!active) return;
    const id = ++request.current;
    pending.current = true;
    if (showLoading) setLoading(true);
    try {
      const data = await getLaundryWorkflow(sessionToken);
      if (request.current === id) setSnapshot({ sessionToken, data, error: null });
    } catch (error) {
      if (request.current === id) {
        setSnapshot(current => ({ sessionToken, data: current?.sessionToken === sessionToken ? current.data : null, error }));
      }
    } finally {
      if (request.current === id) {
        pending.current = false;
        setLoading(false);
      }
    }
  }, [active, sessionToken]);

  const refresh = useCallback(() => fetchSnapshot(true), [fetchSnapshot]);

  useEffect(() => {
    if (!active) {
      setSnapshot(null);
      setLoading(false);
      return undefined;
    }
    refresh();
    let timeoutId;
    const refreshWhenVisible = () => {
      if (!document.hidden && !pending.current) fetchSnapshot(false);
    };
    const onChange = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(refreshWhenVisible, 150);
    };
    const channel = supabase.channel(`laundry-workflow-${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'laundry_trolley_cycles' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, onChange)
      .subscribe(status => { if (status === 'SUBSCRIBED') onChange(); });
    // Custom login sessions can read via RPC even when Realtime cannot
    // deliver a row change under the table's RLS rules.
    const intervalId = window.setInterval(refreshWhenVisible, REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('online', refreshWhenVisible);
    window.addEventListener('focus', refreshWhenVisible);

    return () => {
      request.current += 1;
      pending.current = false;
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('online', refreshWhenVisible);
      window.removeEventListener('focus', refreshWhenVisible);
      supabase.removeChannel(channel);
    };
  }, [active, channelId, fetchSnapshot, refresh]);

  const current = active && snapshot?.sessionToken === sessionToken ? snapshot : null;
  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: active && (loading || !current),
    refresh,
  };
}
