import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../hooks/useAppData';
import { routeBadgeStyle, STATUS_COLORS } from '../lib/visualSystem';

const DAY_NAMES = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt'];

const LOG_ACTION_LABELS = {
  added:   { label: 'Dodano',    color: '#34C759' },
  edited:  { label: 'Edytowano', color: '#FF9500' },
  done:    { label: 'Odebrano',  color: '#007AFF' },
  undone:  { label: 'Cofnięto',  color: '#FF3B30' },
  deleted: { label: 'Usunięto',  color: '#FF3B30' },
};

function formatDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}

// Oś czasu zmian danego wpisu — dociągana z tabeli logs po kliknięciu.
function EntryChangeLog({ entryId }) {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState(null); // null = jeszcze nie wczytano
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && logs === null) {
      setLoading(true);
      const { data } = await supabase
        .from('logs')
        .select('*')
        .eq('entry_id', entryId)
        .order('created_at', { ascending: true });
      setLogs(data || []);
      setLoading(false);
    }
  };

  return (
    <div style={{ marginTop: '8px' }}>
      <button
        onClick={toggle}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}
      >
        🕓 {open ? 'Ukryj historię zmian' : 'Historia zmian'}
      </button>
      {open && (
        <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '5px', paddingLeft: '8px', borderLeft: '2px solid var(--border)' }}>
          {loading && <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Ładowanie…</div>}
          {!loading && logs && logs.length === 0 && (
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Brak zapisanych zmian</div>
          )}
          {!loading && logs && logs.map(l => {
            const meta = LOG_ACTION_LABELS[l.action] || { label: l.action, color: '#636366' };
            return (
              <div key={l.id} style={{ fontSize: '11px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, color: meta.color, background: meta.color + '18', padding: '1px 6px', borderRadius: '5px' }}>{meta.label}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{l.user_name}</span>
                  <span style={{ color: 'var(--text-tertiary)' }}>· {formatDate(l.created_at)}</span>
                </div>
                {l.details && (
                  <div style={{ marginTop: '2px', color: 'var(--text-secondary)' }}>{l.details}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function HistoryView() {
  const rawData = useAppData();
  const { isAdmin, isDriver, user } = useAuth();

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterClient, setFilterClient] = useState('');
  const [filterRoute, setFilterRoute] = useState('');
  const [filterDriver, setFilterDriver] = useState('');
  const [filterDone, setFilterDone] = useState(''); // '' | 'done' | 'pending'
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  useEffect(() => {
    const fetchEntries = async () => {
      setLoading(true);
      let q = supabase.from('entries').select('*').order('added_at', { ascending: false });

      // Kierowca widzi tylko swoje trasy
      if (isDriver && user?.routes) {
        const ids = user.routes.split(',').map(s => parseInt(s.trim())).filter(Boolean);
        if (ids.length > 0) q = q.in('route_id', ids);
      }

      const { data, error: entriesError } = await q;
      if (entriesError) {
        setError(entriesError.message);
        setEntries([]);
        setLoading(false);
        return;
      }
      setError(null);
      setEntries(data || []);
      setLoading(false);
    };
    fetchEntries();
  }, [user?.routes]);

  // Filtrowanie
  const filtered = entries.filter(e => {
    if (filterClient && !e.client_name?.toLowerCase().includes(filterClient.toLowerCase())) return false;
    if (filterRoute && String(e.route_id) !== filterRoute) return false;
    if (filterDriver && !e.added_by?.toLowerCase().includes(filterDriver.toLowerCase())) return false;
    if (filterDone === 'done' && (!e.done || e.deleted_at)) return false;
    if (filterDone === 'pending' && (e.done || e.deleted_at)) return false;
    if (filterDone === 'deleted' && !e.deleted_at) return false;
    return true;
  });

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const routeMap = Object.fromEntries(rawData.allRoutes.map((r, i) => [r.id, { name: r.name, num: i + 1 }]));

  if (loading) return <div className="loader">Ładowanie historii…</div>;
  if (error) return <div style={{ padding: '20px', color: 'var(--accent-red)' }}>Błąd: {error}</div>;

  return (
    <div>
      {/* Filtry */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px',
        padding: '12px 14px', background: 'var(--bg-card)',
        border: '1px solid var(--border)', borderRadius: '14px',
      }}>
        <input
          className="ap-input"
          value={filterClient}
          onChange={e => { setFilterClient(e.target.value); setPage(0); }}
          placeholder="Szukaj klienta…"
          style={{ flex: '1 1 140px', marginBottom: 0 }}
        />
        <select
          className="ap-input"
          value={filterRoute}
          onChange={e => { setFilterRoute(e.target.value); setPage(0); }}
          style={{ flex: '1 1 140px', marginBottom: 0 }}
        >
          <option value="">Wszystkie trasy</option>
          {rawData.allRoutes.map((r, i) => (
            <option key={r.id} value={r.id}>T{i + 1} {r.name}</option>
          ))}
        </select>
        {isAdmin && (
          <input
            className="ap-input"
            value={filterDriver}
            onChange={e => { setFilterDriver(e.target.value); setPage(0); }}
            placeholder="Szukaj kierowcy…"
            style={{ flex: '1 1 140px', marginBottom: 0 }}
          />
        )}
        <select
          className="ap-input"
          value={filterDone}
          onChange={e => { setFilterDone(e.target.value); setPage(0); }}
          style={{ flex: '1 1 120px', marginBottom: 0 }}
        >
          <option value="">Wszystkie</option>
          <option value="done">Odebrane</option>
          <option value="pending">Oczekujące</option>
          <option value="deleted">Usunięte</option>
        </select>
        {(filterClient || filterRoute || filterDriver || filterDone) && (
          <button
            onClick={() => { setFilterClient(''); setFilterRoute(''); setFilterDriver(''); setFilterDone(''); setPage(0); }}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '10px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer', color: 'var(--text-secondary)' }}
          >
            ✕ Wyczyść
          </button>
        )}
      </div>

      <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '10px' }}>
        {filtered.length} wpisów {filtered.length !== entries.length ? `(z ${entries.length})` : ''}
      </div>

      {/* Lista */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {paginated.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '14px' }}>
            Brak wpisów
          </div>
        )}
        {paginated.map(e => {
          const routeInfo = routeMap[e.route_id];
          const arrDay = DAY_NAMES[e.arr_day - 1] || '?';
          const pickDay = DAY_NAMES[e.pick_day - 1] || '?';
          const isDeleted = !!e.deleted_at;
          return (
            <div key={e.id} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: '12px', padding: '12px 14px',
              borderLeft: `3px solid ${isDeleted ? STATUS_COLORS.urgent.color : e.done ? STATUS_COLORS.done.color : e.urgent ? STATUS_COLORS.urgent.color : STATUS_COLORS.pickup.color}`,
              opacity: isDeleted ? 0.6 : 1,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <div style={{ fontWeight: 700, fontSize: '14px', textDecoration: isDeleted ? 'line-through' : 'none' }}>
                  {e.urgent && '🚩 '}{e.client_name}
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span style={{
                    fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
                    background: e.type === 'O' ? 'rgba(175,82,222,0.10)' : 'rgba(0,122,255,0.10)',
                    color: e.type === 'O' ? '#AF52DE' : '#007AFF',
                  }}>{e.type || 'P'}</span>
                  {isDeleted ? (
                    <span style={{
                      fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
                      background: 'rgba(255,59,48,0.12)', color: '#FF3B30',
                    }}>🗑️ Usunięte</span>
                  ) : (
                    <span style={{
                      fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
                      background: e.done ? STATUS_COLORS.pickup.background : 'rgba(0,0,0,0.06)',
                      color: e.done ? STATUS_COLORS.pickup.color : 'var(--text-tertiary)',
                    }}>{e.done ? '✓ Odebrane' : 'Oczekuje'}</span>
                  )}
                </div>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {routeInfo && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    <span className="rt-badge" style={routeBadgeStyle(routeInfo.num)}>T{routeInfo.num}</span>
                    {routeInfo.name}
                  </span>
                )}
                <span>📅 Dostawa: {arrDay} · Odbiór: {pickDay}</span>
                {e.weight && <span>⚖️ {e.weight} kg</span>}
                {e.added_by && <span>👤 {e.added_by}</span>}
                {e.done && e.picked_by && <span>✅ {e.picked_by}</span>}
              </div>
              {e.comment && (
                <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                  💬 {e.comment}
                </div>
              )}
              <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                {e.week_key} · dodano {formatDate(e.added_at)}
              </div>
              {isDeleted && (
                <div style={{ marginTop: '2px', fontSize: '11px', color: '#FF3B30', fontWeight: 600 }}>
                  🗑️ usunięto {formatDate(e.deleted_at)}{e.deleted_by ? ` · ${e.deleted_by}` : ''}
                </div>
              )}
              <EntryChangeLog entryId={e.id} />
            </div>
          );
        })}
      </div>

      {/* Paginacja */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '20px', alignItems: 'center' }}>
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            style={{ padding: '8px 16px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: 'pointer', fontWeight: 600 }}
          >‹</button>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            style={{ padding: '8px 16px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: 'pointer', fontWeight: 600 }}
          >›</button>
        </div>
      )}
    </div>
  );
}
