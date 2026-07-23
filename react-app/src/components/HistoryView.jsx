import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../hooks/useAppData';
import { routeBadgeStyle, STATUS_COLORS } from '../lib/visualSystem';
import { getEntryLogs } from '../lib/logsRpc';
import { getHistoryEntries } from '../lib/historyRpc';
import { dayNamesShort, weekdayFull, currentLocale } from '../lib/dateUtils';
import { printSavedLaundryReceipt } from './modals/EntryModals';

// Data dostawy = poniedziałek tygodnia (week_key) + (arr_day - 1)
function parseMonday(weekKey) {
  const [y, m, d] = weekKey.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function deliveryDate(e) {
  if (!e.week_key) return null;
  const dt = parseMonday(e.week_key);
  dt.setDate(dt.getDate() + ((e.arr_day || 1) - 1));
  return dt;
}
function fullDayName(date) {
  return weekdayFull()[(date.getDay() + 6) % 7];
}
function formatDayDate(date) {
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
}

// Kolory akcji logu; etykiety pobierane z t(`logActions.<action>`).
const LOG_ACTION_COLORS = {
  added: '#34C759', edited: '#FF9500', done: '#007AFF', undone: '#FF3B30',
  deleted: '#FF3B30', delivered: '#34C759', washed: '#30B0C7',
  unwashed: '#FF9500', trip_start: '#5856D6', trip_end: '#5856D6',
};

function formatDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  const loc = currentLocale();
  return d.toLocaleDateString(loc, { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
}

// Oś czasu zmian danego wpisu — dociągana z tabeli logs po kliknięciu.
function EntryChangeLog({ entryId }) {
  const { t } = useTranslation();
  const { sessionToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState(null); // null = jeszcze nie wczytano
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && logs === null) {
      setLoading(true);
      try {
        const data = await getEntryLogs(sessionToken, entryId);
        setLogs(data.logs || []);
      } catch {
        setLogs([]);
      }
      setLoading(false);
    }
  };

  return (
    <div style={{ marginTop: '8px' }}>
      <button
        onClick={toggle}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}
      >
        🕓 {open ? t('history.changeLogHide') : t('history.changeLogShow')}
      </button>
      {open && (
        <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '5px', paddingLeft: '8px', borderLeft: '2px solid var(--border)' }}>
          {loading && <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{t('common.loading')}</div>}
          {!loading && logs && logs.length === 0 && (
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{t('history.noChanges')}</div>
          )}
          {!loading && logs && logs.map(l => {
            const color = LOG_ACTION_COLORS[l.action] || '#636366';
            const label = t(`logActions.${l.action}`, { defaultValue: l.action });
            return (
              <div key={l.id} style={{ fontSize: '11px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, color: color, background: color + '18', padding: '1px 6px', borderRadius: '5px' }}>{label}</span>
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
  const { t } = useTranslation();
  const rawData = useAppData();
  const { isAdmin, user, sessionToken } = useAuth();

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterClient, setFilterClient] = useState('');
  const [filterRoute, setFilterRoute] = useState('');
  const [filterDriver, setFilterDriver] = useState('');
  const [filterDone, setFilterDone] = useState(''); // '' | 'done' | 'pending'
  const [showReceipts, setShowReceipts] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 7; // dni na stronę

  useEffect(() => {
    let cancelled = false;
    const fetchEntries = async () => {
      setLoading(true);
      try {
        const data = await getHistoryEntries(sessionToken, { limit: 1500 });
        if (cancelled) return;
        setError(null);
        setEntries(data || []);
      } catch (entriesError) {
        if (cancelled) return;
        setError(entriesError.message);
        setEntries([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchEntries();
    return () => { cancelled = true; };
  }, [sessionToken]);

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

  // Grupowanie po dniu dostawy (jak w harmonogramie), najnowsze dni u góry
  const groupsMap = new Map();
  filtered.forEach(e => {
    const dt = deliveryDate(e);
    const key = dt ? `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}` : 'none';
    if (!groupsMap.has(key)) groupsMap.set(key, { key, date: dt, entries: [] });
    groupsMap.get(key).entries.push(e);
  });
  const dayGroups = [...groupsMap.values()].sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));

  const totalPages = Math.ceil(dayGroups.length / PAGE_SIZE);
  const pagedGroups = dayGroups.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const routeMap = Object.fromEntries(rawData.allRoutes.map((r, i) => [r.id, { name: r.name, num: i + 1 }]));
  const todayKey = (() => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; })();

  if (loading) return <div className="loader">{t('history.loading')}</div>;
  if (error) return <div style={{ padding: '20px', color: 'var(--accent-red)' }}>{t('schedule.errorPrefix')} {error}</div>;

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
          placeholder={t('history.searchClient')}
          style={{ flex: '1 1 140px', marginBottom: 0 }}
        />
        <select
          className="ap-input"
          value={filterRoute}
          onChange={e => { setFilterRoute(e.target.value); setPage(0); }}
          style={{ flex: '1 1 140px', marginBottom: 0 }}
        >
          <option value="">{t('history.allRoutes')}</option>
          {rawData.allRoutes.map((r, i) => (
            <option key={r.id} value={r.id}>T{i + 1} {r.name}</option>
          ))}
        </select>
        {isAdmin && (
          <input
            className="ap-input"
            value={filterDriver}
            onChange={e => { setFilterDriver(e.target.value); setPage(0); }}
            placeholder={t('history.searchDriver')}
            style={{ flex: '1 1 140px', marginBottom: 0 }}
          />
        )}
        <select
          className="ap-input"
          value={filterDone}
          onChange={e => { setFilterDone(e.target.value); setPage(0); }}
          style={{ flex: '1 1 120px', marginBottom: 0 }}
        >
          <option value="">{t('history.all')}</option>
          <option value="done">{t('history.pickedUp')}</option>
          <option value="pending">{t('history.pending')}</option>
          <option value="deleted">{t('history.deleted')}</option>
        </select>
        {(filterClient || filterRoute || filterDriver || filterDone) && (
          <button
            onClick={() => { setFilterClient(''); setFilterRoute(''); setFilterDriver(''); setFilterDone(''); setPage(0); }}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '10px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer', color: 'var(--text-secondary)' }}
          >
            {t('history.clear')}
          </button>
        )}
      </div>

      {/* Kartki prania (zapisane dowody przyjęcia/wydania) */}
      {(() => {
        const allReceipts = rawData.receipts || [];
        const receipts = allReceipts.filter(r =>
          !filterClient || r.client_name?.toLowerCase().includes(filterClient.toLowerCase())
        );
        if (allReceipts.length === 0) return null;
        const itemCount = (items) => (Array.isArray(items) ? items : []).filter(i => i.accepted || i.issued).length;
        return (
          <div style={{ marginBottom: '14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
            <button
              onClick={() => setShowReceipts(v => !v)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'none', border: 0, cursor: 'pointer', font: 'inherit' }}
            >
              <span style={{ fontWeight: 700, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🧾 Kartki prania
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)' }}>({receipts.length})</span>
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{showReceipts ? '▲' : '▼'}</span>
            </button>
            {showReceipts && (
              <div style={{ borderTop: '1px solid var(--border)' }}>
                {receipts.length === 0 && (
                  <div style={{ padding: '14px', fontSize: '12px', color: 'var(--text-tertiary)' }}>Brak kartek dla tego filtra.</div>
                )}
                {receipts.map(r => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontWeight: 700, fontSize: '13px', minWidth: '54px' }}>NR {r.doc_no}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.client_name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                        {r.arrival || '—'} → {r.pickup || '—'} · {itemCount(r.items)} poz.{r.total_kg != null ? ` · ${r.total_kg} kg` : ''}
                      </div>
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', color: r.status === 'closed' ? '#1b7a3d' : '#9a6b00', background: r.status === 'closed' ? 'rgba(52,199,89,0.15)' : 'rgba(255,179,0,0.18)' }}>
                      {r.status === 'closed' ? 'Zamknięta' : 'Otwarta'}
                    </span>
                    <button
                      onClick={() => printSavedLaundryReceipt(r, user?.name)}
                      style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '10px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer', color: 'var(--text-secondary)' }}
                    >
                      Drukuj
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '10px' }}>
        {t('history.entries', { count: filtered.length })} {filtered.length !== entries.length ? t('history.ofTotal', { total: entries.length }) : ''} · {t('history.days', { count: dayGroups.length })}
      </div>

      {pagedGroups.length === 0 && (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '14px' }}>
          {t('history.noEntries')}
        </div>
      )}

      {/* Historia w stylu harmonogramu — sekcje po dniach dostawy */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {pagedGroups.map(group => {
          const isToday = group.key === todayKey;
          const dayWeight = group.entries.reduce((s, e) => s + (parseFloat(e.weight) || 0), 0);
          return (
            <div key={group.key}>
              {/* Nagłówek dnia */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', marginBottom: '8px',
                background: isToday ? 'rgba(0,122,255,0.10)' : 'var(--bg-card)',
                border: `1px solid ${isToday ? 'rgba(0,122,255,0.35)' : 'var(--border)'}`,
                borderRadius: '12px',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <span style={{ fontWeight: 700, fontSize: '14px' }}>
                    {group.date ? fullDayName(group.date) : t('history.noDate')}
                  </span>
                  {group.date && (
                    <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{formatDayDate(group.date)}</span>
                  )}
                  {isToday && (
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#007AFF', background: 'rgba(0,122,255,0.12)', padding: '2px 7px', borderRadius: '6px' }}>{t('schedule.today')}</span>
                  )}
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  {t('history.entries', { count: group.entries.length })}{dayWeight > 0 ? ` · ${Number(dayWeight.toFixed(1))} kg` : ''}
                </span>
              </div>

              {/* Wpisy danego dnia */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {group.entries.map(e => {
          const routeInfo = routeMap[e.route_id];
          const shortDays = dayNamesShort();
          const arrDay = shortDays[e.arr_day - 1] || '?';
          const pickDay = shortDays[e.pick_day - 1] || '?';
          const isDeleted = !!e.deleted_at;
          const typeCode = ['P', 'O', 'F', 'R'].includes(e.type) ? e.type : 'P';
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
                  <span className={`laundry-type-badge type-${typeCode}`}>{typeCode}</span>
                  {isDeleted ? (
                    <span style={{
                      fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
                      background: 'rgba(255,59,48,0.12)', color: '#FF3B30',
                    }}>{t('history.deletedBadge')}</span>
                  ) : (
                    <span style={{
                      fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
                      background: e.done ? STATUS_COLORS.pickup.background : 'rgba(0,0,0,0.06)',
                      color: e.done ? STATUS_COLORS.pickup.color : 'var(--text-tertiary)',
                    }}>{e.done ? t('history.pickedBadge') : t('history.waiting')}</span>
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
                <span>📅 {t('history.rowDelivery')}: {arrDay} · {t('history.rowPickup')}: {pickDay}</span>
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
                {e.week_key} · {t('history.addedAt')} {formatDate(e.added_at)}
              </div>
              {isDeleted && (
                <div style={{ marginTop: '2px', fontSize: '11px', color: '#FF3B30', fontWeight: 600 }}>
                  🗑️ {t('history.deletedAt')} {formatDate(e.deleted_at)}{e.deleted_by ? ` · ${e.deleted_by}` : ''}
                </div>
              )}
              <EntryChangeLog entryId={e.id} />
            </div>
          );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Paginacja po dniach */}
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
