import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { dayNamesFull, dayNamesShort, formatWeekKey } from '../../lib/dateUtils';
import { toastError } from '../../lib/toast';
import { logAction } from '../../lib/logger';

// arr_day: 1=PN, 2=WT, 3=ŚR, 4=CZ, 5=PT
function getDefaultPickInfo(arrDay, schedule = 'other') {
  const d = parseInt(arrDay);

  if (schedule === 'daily') {
    if (d <= 4) return { pickDay: d + 1, pickWeek: 0 };
    return { pickDay: 1, pickWeek: 1 }; // PT → PN nast.
  }

  if (schedule === 'mwf') {
    if (d <= 1) return { pickDay: 3, pickWeek: 0 }; // PN → ŚR
    if (d <= 3) return { pickDay: 5, pickWeek: 0 }; // WT/ŚR → PT
    return { pickDay: 1, pickWeek: 1 }; // CZ/PT → PN nast.
  }

  if (schedule === 'tth') {
    if (d <= 2) return { pickDay: 4, pickWeek: 0 }; // PN/WT → CZW
    return { pickDay: 2, pickWeek: 1 }; // ŚR/CZW/PT → WT nast.
  }

  if (d <= 3) return { pickDay: d + 2, pickWeek: 0 };
  if (d === 4) return { pickDay: 2, pickWeek: 1 };
  return { pickDay: 1, pickWeek: 1 };
}

function parseRouteIds(routesStr) {
  return new Set(
    (routesStr || '').split(',').map(s => Number(s.trim())).filter(Boolean)
  );
}

function firstClientByRouteOrder(clients, routes) {
  const sortedRoutes = [...routes].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const firstRoute = sortedRoutes.find(r => clients.some(c => c.route_id === r.id));
  return firstRoute
    ? [...clients].filter(c => c.route_id === firstRoute.id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0]
    : clients[0];
}

function clientRouteSchedule(clients, routes, clientName) {
  const client = (clients || []).find(c => c.name === clientName);
  const route = (routes || []).find(r => r.id === client?.route_id);
  return route?.schedule || 'other';
}

function nextWeekKey(weekKey) {
  const parts = weekKey.split('-');
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  d.setDate(d.getDate() + 7);
  return formatWeekKey(d);
}

// Data dnia roboczego (1=Pn..5=Pt) w tygodniu zaczynającym się od weekKey (poniedziałek).
function dateForDay(weekKey, day) {
  const [y, m, d] = (weekKey || '').split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + (Number(day) - 1));
  return dt;
}
function shortDate(dt) {
  return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}`;
}
function dayWithDate(weekKey, day) {
  return `${dayNamesShort()[day - 1]} ${shortDate(dateForDay(weekKey, day))}`;
}
// Dni ODBIORU dla wybranego tygodnia. „Ten sam tydzień" (pickWeek 0) startuje od
// dnia przyjazdu — nie da się wybrać dnia wcześniejszego niż przyjazd. „Następny
// tydzień" (pickWeek 1) ma wszystkie dni (zawsze jest po przyjeździe). `includeDay`
// chroni bieżącą wartość (np. starszy wpis) przed cichą zmianą przy otwarciu.
function buildPickDayOptions(baseWeekKey, arrDay, pickWeek, includeDay) {
  const wk = Number(pickWeek) === 1 ? nextWeekKey(baseWeekKey) : baseWeekKey;
  const min = Number(pickWeek) === 1 ? 1 : (parseInt(arrDay) || 1);
  const out = [];
  const seen = new Set();
  for (let d = min; d <= 5; d++) { out.push({ value: d, label: dayWithDate(wk, d) }); seen.add(d); }
  const inc = Number(includeDay);
  if (inc && !seen.has(inc)) out.unshift({ value: inc, label: dayWithDate(wk, inc) });
  return out;
}

// Porównuje wpis przed i po edycji, zwraca listę zmienionych pól w formacie
// "etykieta: stara → nowa". Dzięki temu log edycji jest zawsze kompletny —
// łapie KAŻDE zmienione pole, nie tylko te wpisane ręcznie.
function buildEditDiff(entry, updates, routes, t) {
  const days = dayNamesShort();
  const dayLabel = v => days[v - 1] || '?';
  const fields = [
    { key: 'client_name',  label: t('entry.diffClient'),     fmt: v => (v ?? '') === '' ? '—' : String(v) },
    { key: 'type',         label: t('entry.diffType'),       fmt: v => v === 'O' ? t('entry.tablecloths') : (v === 'R' ? t('entry.workwear') : t('entry.sheets')) },
    { key: 'weight',       label: t('entry.diffWeight'),     fmt: v => (v === null || v === undefined || v === '') ? '—' : `${v} kg` },
    { key: 'arr_day',      label: t('entry.diffArrival'),    fmt: dayLabel },
    { key: 'pick_day',     label: t('entry.diffPickup'),     fmt: dayLabel },
    { key: 'pick_week_key', label: t('entry.diffPickupWeek'), fmt: v => (v ?? '') === '' ? '—' : String(v) },
    { key: 'urgent',       label: t('entry.diffUrgent'),     fmt: v => v ? t('entry.yes') : t('entry.no') },
    { key: 'route_id',     label: t('entry.diffRoute'),      fmt: v => (routes || []).find(r => r.id === v)?.name || '—' },
  ];
  const norm = v => (v === null || v === undefined) ? '' : (typeof v === 'number' ? String(v) : String(v).trim());
  const changes = [];
  for (const f of fields) {
    if (norm(entry[f.key]) !== norm(updates[f.key])) {
      changes.push(`${f.label}: ${f.fmt(entry[f.key])} → ${f.fmt(updates[f.key])}`);
    }
  }
  return changes;
}

function isWorkwearRoute(routes, routeId) {
  const route = (routes || []).find(r => r.id === routeId);
  return route?.is_workwear === true;
}

export function AddEntryModal({ isOpen, onClose, defaultArrDay, weekKey, clients, routes, onAdded, defaultClientName, defaultType }) {
  const { t } = useTranslation();
  const { user, isDriver, isAdmin, sessionToken } = useAuth();
  const [clientName, setClientName] = useState('');
  const [showOtherRoutes, setShowOtherRoutes] = useState(false);
  const [type, setType] = useState('P');
  const [weight, setWeight] = useState('');
  const [arrDay, setArrDay] = useState(defaultArrDay || 1);
  const [pickDay, setPickDay] = useState(defaultArrDay || 1);
  const [pickWeek, setPickWeek] = useState(0); // 0 = same, 1 = next
  const [trolleys, setTrolleys] = useState(1);
  const [urgent, setUrgent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [explicitRouteId, setExplicitRouteId] = useState('');
  const isClientScoped = !!defaultClientName;

  const assignedRouteIds = useMemo(() => parseRouteIds(user?.routes), [user?.routes]);
  const hasAssignedRouteFilter = isDriver && assignedRouteIds.size > 0;
  const ownClients = useMemo(() => hasAssignedRouteFilter
    ? clients.filter(c => assignedRouteIds.has(c.route_id))
    : clients, [assignedRouteIds, clients, hasAssignedRouteFilter]);
  const otherClients = useMemo(() => hasAssignedRouteFilter
    ? clients.filter(c => c.route_id && !assignedRouteIds.has(c.route_id))
    : [], [assignedRouteIds, clients, hasAssignedRouteFilter]);
  const selectableClients = useMemo(() => hasAssignedRouteFilter && showOtherRoutes ? otherClients : ownClients, [hasAssignedRouteFilter, showOtherRoutes, otherClients, ownClients]);
  const canToggleOtherRoutes = hasAssignedRouteFilter && otherClients.length > 0;

  useEffect(() => {
    if (isOpen) {
      const day = defaultArrDay || 1;
      // Jeśli podano defaultClientName, pre-wybierz tego klienta; inaczej pierwszy z tras
      let initClient;
      if (defaultClientName) {
        initClient = clients.find(c => c.name === defaultClientName);
      }
      if (!initClient) initClient = firstClientByRouteOrder(ownClients, routes);
      const { pickDay: pd, pickWeek: pw } = getDefaultPickInfo(day, clientRouteSchedule(clients, routes, initClient?.name));
      const isWorkwear = isWorkwearRoute(routes, initClient?.route_id);
      setArrDay(day);
      setPickDay(pd);
      setPickWeek(pw);
      setShowOtherRoutes(false);
      setClientName(initClient?.name || '');
      setWeight('');
      setType(isWorkwear ? 'R' : (defaultType || 'P'));
      setTrolleys(1);
      setUrgent(false);
      setExplicitRouteId('');
    }
  }, [isOpen, defaultArrDay, clients, routes, ownClients, defaultClientName, defaultType]);

  useEffect(() => {
    if (!isOpen) return;
    if (defaultClientName) return; // Blokada dla pre-wybranego klienta
    const nextClient = firstClientByRouteOrder(selectableClients, routes);
    if (!selectableClients.some(c => c.name === clientName)) {
      setClientName(nextClient?.name || '');
      const { pickDay: pd, pickWeek: pw } = getDefaultPickInfo(arrDay, clientRouteSchedule(clients, routes, nextClient?.name));
      setPickDay(pd);
      setPickWeek(pw);
      setType(isWorkwearRoute(routes, nextClient?.route_id) ? 'R' : 'P');
    }
  }, [isOpen, showOtherRoutes, selectableClients, routes, clients, clientName, arrDay, defaultClientName]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    try {
      setLoading(true);
      const client = clients.find(c => c.name === clientName);
      if (!client) throw new Error(t('entry.selectClient'));
      const routeId = explicitRouteId ? Number(explicitRouteId) : (client ? client.route_id : 1);

      // Calculate pick_week_key
      let pickWeekKey = weekKey;
      if (pickWeek === 1) {
        pickWeekKey = nextWeekKey(weekKey);
      }

      // Unikalne ID — sam timestamp w ms powodował kolizje przy szybkim dodawaniu
      // dwóch wpisów (ten sam id → akcje/grupowanie łączyły je w jedno zamówienie).
      const newEntryId = 'ID_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const { data, error } = await supabase.rpc('admin_insert_entry', {
        p_session_token: sessionToken,
        p_id: newEntryId,
        p_week_key: weekKey,
        p_client_name: clientName,
        p_arr_day: parseInt(arrDay),
        p_pick_day: parseInt(pickDay),
        p_pick_week_key: pickWeekKey,
        p_route_id: routeId,
        p_type: type,
        p_weight: weight ? parseFloat(weight.replace(',', '.')) : null,
        p_trolleys: trolleys !== '' ? Number(trolleys) : 1,
        p_urgent: urgent,
        p_added_by: user.name,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await logAction({ sessionToken, action: 'added', clientName, entryId: newEntryId, details: `${type === 'R' ? t('entry.workwear') : type === 'O' ? t('entry.tablecloths') : t('entry.sheets')}${weight ? ', ' + weight + ' kg' : ''}` });
      await onAdded?.({ id: newEntryId, clientName, routeId, type, weight, trolleys });
      onClose();
    } catch (err) {
      toastError(t('entry.errAdding') + ' ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ap-overlay" style={{ display: 'flex' }}>
      <div className="ap-sheet">
        <div className="ap-handle"></div>
        <div className="ap-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(145deg,#34C759,#25A244)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0, boxShadow: '0 3px 10px rgba(52,199,89,0.3)' }}>📦</div>
            <div>
              <div className="ap-title" style={{ textAlign: 'left', fontSize: '19px', marginBottom: '1px' }}>
                {isClientScoped ? (clientName || defaultClientName) : t('entry.addArrival')}
              </div>
              <div style={{ fontSize: '12px', color: 'rgba(60,60,67,0.5)', fontWeight: 400 }}>
                {isClientScoped ? t('entry.dirtyToLaundry') : user?.name}
              </div>
            </div>
          </div>

          {!isClientScoped && (
            <>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.client')}</div>
              <select
                className="ap-input"
                style={{ padding: '12px 14px', marginBottom: '12px' }}
                value={clientName}
                onChange={e => {
                  setClientName(e.target.value);
                  const selectedClient = clients.find(c => c.name === e.target.value);
                  const { pickDay: pd, pickWeek: pw } = getDefaultPickInfo(arrDay, clientRouteSchedule(clients, routes, e.target.value));
                  setPickDay(pd);
                  setPickWeek(pw);
                  setType(isWorkwearRoute(routes, selectedClient?.route_id) ? 'R' : 'P');
                }}
              >
                {routes
                  .filter(r => selectableClients.some(c => c.route_id === r.id))
                  .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                  .map(r => (
                    <optgroup key={r.id} label={`${r.name}${hasAssignedRouteFilter && assignedRouteIds.has(r.id) ? t('entry.yourRouteSuffix') : ''}`}>
                      {selectableClients
                        .filter(c => c.route_id === r.id)
                        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                        .map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </optgroup>
                  ))}
              </select>
              {canToggleOtherRoutes && (
                <button
                  type="button"
                  onClick={() => setShowOtherRoutes(v => !v)}
                  style={{
                    width: '100%',
                    border: '1px solid rgba(0,122,255,0.22)',
                    background: showOtherRoutes ? 'rgba(0,122,255,0.12)' : 'rgba(0,122,255,0.06)',
                    color: 'var(--accent)',
                    borderRadius: '12px',
                    padding: '10px 12px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    marginTop: '-4px',
                    marginBottom: '12px',
                  }}
                >
                  {showOtherRoutes ? t('entry.backToMyRoutes') : t('entry.addFromOtherRoute')}
                </button>
              )}
            </>
          )}

          {isAdmin && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.assignToRoute')}</div>
              <select className="ap-input" value={explicitRouteId} onChange={e => setExplicitRouteId(e.target.value)}>
                <option value="">{t('entry.defaultClientRoute')}</option>
                {routes.map(r => (
                  <option key={r.id} value={r.id}>T{r.sort_order ?? r.id} - {r.name}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.laundryType')}</div>
          {isWorkwearRoute(routes, clients.find(c => c.name === clientName)?.route_id) ? (
            <div className="segmented-control" style={{ marginBottom: '12px' }}>
              <button type="button" className={`seg-btn type-R active`}>{t('entry.workwear')}</button>
            </div>
          ) : (
            <div className="segmented-control" style={{ marginBottom: '12px' }}>
              <button type="button" className={`seg-btn type-P ${type === 'P' ? 'active' : ''}`} onClick={() => setType('P')}>{t('entry.sheets')}</button>
              <button type="button" className={`seg-btn type-O ${type === 'O' ? 'active' : ''}`} onClick={() => setType('O')}>{t('entry.tablecloths')}</button>
            </div>
          )}

          <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.weightOptional')}</div>
          <input type="text" className="ap-input" placeholder={t('entry.weightPlaceholder')} style={{ marginBottom: '12px' }} inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value)} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.arrivalDay')}</div>
              <select className="ap-input" value={arrDay} onChange={e => { const { pickDay: pd, pickWeek: pw } = getDefaultPickInfo(e.target.value, clientRouteSchedule(clients, routes, clientName)); setArrDay(e.target.value); setPickDay(pd); setPickWeek(pw); }}>
                {dayNamesShort().map((name, i) => <option key={i} value={i + 1}>{name} {shortDate(dateForDay(weekKey, i + 1))}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.pickupDay')}</div>
              <select className="ap-input" value={pickDay} onChange={e => setPickDay(Number(e.target.value))}>
                {buildPickDayOptions(weekKey, arrDay, pickWeek, pickDay).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.pickupWeek')}</div>
              <select className="ap-input" value={pickWeek} onChange={e => { const w = Number(e.target.value); setPickWeek(w); if (w === 0 && Number(pickDay) < (parseInt(arrDay) || 1)) setPickDay(parseInt(arrDay) || 1); }}>
                <option value={0}>{t('entry.sameWeek')}</option>
                <option value={1}>{t('entry.nextWeek')}</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.trolleys')}</div>
              <input type="number" className="ap-input" value={trolleys} onChange={e => setTrolleys(e.target.value ? Number(e.target.value) : '')} min="0" />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, marginBottom: '4px', cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: '18px', height: '18px' }} checked={urgent} onChange={e => setUrgent(e.target.checked)} />
            <span style={{ color: 'var(--accent-red)' }}>{t('entry.urgent')}</span>
          </label>

          <div className="ap-btn-group" style={{ marginTop: '18px' }}>
            <button className="ap-btn ap-btn-primary" onClick={handleSubmit} disabled={loading}>{loading ? t('entry.adding') : t('entry.add')}</button>
            <button className="ap-btn ap-btn-secondary" onClick={onClose} disabled={loading}>{t('common.cancel')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ViewEditEntryModal({ isOpen, onClose, entry, relatedEntries = [], onUpdated, onDeleted, routes, clients = [], contextMode = 'view', initiallyEditing = false }) {
  const { t } = useTranslation();
  const { isAdmin, canEdit, user, sessionToken } = useAuth();
  const [editing, setEditing] = useState(false);
  const [clientName, setClientName] = useState('');
  const [type, setType] = useState('P');
  const [weight, setWeight] = useState('');
  const [arrDay, setArrDay] = useState(1);
  const [pickDay, setPickDay] = useState(1);
  const [pickWeek, setPickWeek] = useState(0); // 0 = same, 1 = next week
  const [trolleys, setTrolleys] = useState(1);
  const [urgent, setUrgent] = useState(false);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [routeId, setRouteId] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [washing, setWashing] = useState(false);

  useEffect(() => {
    if (isOpen && entry) {
      setEditing(initiallyEditing);
      setClientName(entry.client_name || '');
      setType(entry.type || 'P');
      setWeight(entry.weight || '');
      setArrDay(entry.arr_day || 1);
      setPickDay(entry.pick_day || 1);
      setPickWeek(entry.week_key === entry.pick_week_key ? 0 : 1);
      setTrolleys(entry.trolleys ?? 1);
      setUrgent(entry.urgent || false);
      // Komentarz klienta (wspólna notatka) — preferuj clients.note, fallback na stary entry.comment
      const clientNote = (clients || []).find(c => c.name === entry.client_name)?.note;
      setComment(clientNote !== undefined ? (clientNote || '') : (entry.comment || ''));
      setRouteId(entry.route_id || 1);
    }
  }, [isOpen, entry, clients, initiallyEditing]);

  if (!isOpen || !entry) return null;

  const sortedRoutes = [...(routes || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const knownClientNames = new Set((clients || []).map(c => c.name));
  const selectedClient = (clients || []).find(c => c.name === clientName);
  const isPickupContext = contextMode === 'pick';
  const pickupEntries = isPickupContext && relatedEntries.length > 0 ? relatedEntries : [entry];
  const isGroupedPickup = isPickupContext && pickupEntries.length > 1;
  // W widoku ODBIORÓW „entry" to syntetyczna grupa z id "pickup-..." (patrz
  // groupPickupEntries w ScheduleView) — taki wiersz nie istnieje w bazie.
  // Dla pojedynczego odbioru operujemy więc na PRAWDZIWYM wpisie, żeby edycja /
  // usuwanie / „wyprane" trafiały w istniejący rekord (inaczej: „Nie znaleziono wpisu").
  const targetEntry = isPickupContext && pickupEntries.length === 1 ? pickupEntries[0] : entry;
  const pickupTotalWeight = pickupEntries.reduce((sum, e) => sum + (parseFloat(e.weight) || 0), 0);
  const allPickupDone = pickupEntries.every(e => e.done);
  const pickedByNames = [...new Set(pickupEntries.map(e => e.picked_by).filter(Boolean))];
  const daysFull = dayNamesFull();
  const pickupArrivalDays = [...new Set(pickupEntries.map(e => daysFull[(e.arr_day || 1) - 1]).filter(Boolean))].join(', ');
  const hasPickupSheets = pickupEntries.some(e => (e.type || 'P') === 'P');
  const hasPickupTablecloths = pickupEntries.some(e => e.type === 'O');
  const hasPickupWorkwear = pickupEntries.some(e => e.type === 'R');
  const pickupTypeLabel = hasPickupWorkwear ? t('entry.workwear') :
    (hasPickupSheets && hasPickupTablecloths
      ? t('entry.sheetsTablecloths')
      : hasPickupTablecloths
        ? t('entry.tablecloths')
        : t('entry.sheets'));
  const directEditMode = contextMode === 'arr' && initiallyEditing;
  const showEditForm = canEdit && (editing || directEditMode);

  const handleClientChange = (name) => {
    setClientName(name);
    const selected = (clients || []).find(c => c.name === name);
    if (selected?.route_id) {
      setRouteId(selected.route_id);
      const { pickDay: pd, pickWeek: pw } = getDefaultPickInfo(arrDay, clientRouteSchedule(clients, routes, name));
      setPickDay(pd);
      setPickWeek(pw);
      setType(isWorkwearRoute(routes, selected.route_id) ? 'R' : 'P');
    }
  };

  const toggleDone = async () => {
    try {
      setLoading(true);
      const isDone = !allPickupDone;

      const ids = pickupEntries.map(e => e.id);
      const { data, error } = await supabase.rpc('admin_set_entries_done', {
        p_session_token: sessionToken,
        p_ids: ids,
        p_done: isDone,
        p_by: user.name,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await logAction({
        sessionToken,
        action: isDone ? 'done' : 'undone',
        clientName: entry.client_name,
        entryId: entry.id,
        details: isGroupedPickup ? t('entry.logDoneDetails', { count: pickupEntries.length, weight: pickupTotalWeight ? Number(pickupTotalWeight.toFixed(1)) + ' kg' : t('entry.noWeight') }) : undefined,
      });
      onUpdated();
      onClose();
    } catch (err) {
      toastError(t('entry.errGeneric') + ' ' + err.message);
      setLoading(false);
    }
    };

    // Prywatny status „wyprane" — nie rusza odbioru (done) ani dostawy.
    // Pomniejsza tylko licznik „Do prania" w harmonogramie.
    const toggleWashed = async () => {
    try {
      setWashing(true);
      const next = !targetEntry.washed;
      const { data, error } = await supabase.rpc('admin_set_entry_washed', {
        p_session_token: sessionToken,
        p_id: targetEntry.id,
        p_washed: next,
        p_by: user.name,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await logAction({
        sessionToken,
        action: next ? 'washed' : 'unwashed',
        clientName: targetEntry.client_name,
        entryId: targetEntry.id,
        details: `${targetEntry.type === 'R' ? t('entry.workwear') : targetEntry.type === 'O' ? t('entry.tablecloths') : t('entry.sheets')}${targetEntry.weight ? ', ' + targetEntry.weight + ' kg' : ''}`,
      });
      onUpdated();
      onClose();
    } catch (err) {
      toastError(t('entry.errGeneric') + ' ' + err.message);
      setWashing(false);
    }
    };

    const handleSaveEdit = async () => {
    try {
      setLoading(true);

      let pickWeekKey = targetEntry.week_key;
      if (pickWeek === 1) pickWeekKey = nextWeekKey(targetEntry.week_key);

      const nextRouteId = routeId || selectedClient?.route_id || targetEntry.route_id || null;

      let updates = {
        client_name: clientName,
        type: type,
        weight: weight ? parseFloat(String(weight).replace(',', '.')) : null,
        arr_day: parseInt(arrDay),
        pick_day: parseInt(pickDay),
        pick_week_key: pickWeekKey,
        trolleys: trolleys !== '' ? Number(trolleys) : 1,
        urgent,
        route_id: nextRouteId
        // comment usunięty z entries — teraz w clients.note (wspólna notatka)
      };

      const { data: editData, error } = await supabase.rpc('admin_update_entry', {
        p_session_token: sessionToken,
        p_id: targetEntry.id,
        p_client_name: clientName,
        p_type: type,
        p_arr_day: parseInt(arrDay),
        p_pick_day: parseInt(pickDay),
        p_pick_week_key: pickWeekKey,
        p_route_id: nextRouteId,
        p_weight: weight ? parseFloat(String(weight).replace(',', '.')) : null,
        p_trolleys: trolleys !== '' ? Number(trolleys) : 1,
        p_urgent: urgent,
      });
      if (error) throw error;
      if (editData?.error) throw new Error(editData.error);

      // Zapisz komentarz do clients.note (wspólny dla całego klienta)
      const currentClientNote = (clients || []).find(c => c.name === entry.client_name)?.note || '';
      if (comment !== (currentClientNote || '')) {
        await supabase.rpc('admin_set_client_note', {
          p_session_token: sessionToken,
          p_name: clientName.trim() || entry.client_name,
          p_note: comment || null,
        });
      }
      // Loguj tylko realne zmiany — automatycznie wykrywamy każde zmienione pole.
      const changes = buildEditDiff(targetEntry, updates, routes, t);
      // Śledź też zmianę komentarza klienta
      const currentClientNote2 = (clients || []).find(c => c.name === entry.client_name)?.note || '';
      if (comment !== (currentClientNote2 || '')) {
        changes.push(`${t('entry.diffComment')}: "${currentClientNote2 || '—'}" → "${comment || '—'}"`);
      }
      if (changes.length > 0) {
        await logAction({
          sessionToken,
          action: 'edited',
          clientName: updates.client_name,
          entryId: targetEntry.id,
          details: changes.join(', '),
        });
      }
      onUpdated();
      onClose();
    } catch (err) {
      toastError(t('entry.errEdit') + ' ' + err.message);
      setLoading(false);
    }
    };

    const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    try {
      setLoading(true);
      // Miękkie usuwanie: oznaczamy wpis jako usunięty zamiast kasować go z bazy,
      // dzięki czemu zostaje w historii i nic nie przepada.
      const { data, error } = await supabase.rpc('admin_soft_delete_entry', {
        p_session_token: sessionToken,
        p_id: targetEntry.id,
        p_by: user.name,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await logAction({
        sessionToken,
        action: 'deleted',
        clientName: targetEntry.client_name,
        entryId: targetEntry.id,
        details: t('entry.logDeletedDetails', {
          type: targetEntry.type === 'R' ? t('entry.workwear') : targetEntry.type === 'O' ? t('entry.tablecloths') : t('entry.sheets'),
          arrival: daysFull[targetEntry.arr_day - 1] || '?',
          pickup: daysFull[targetEntry.pick_day - 1] || '?',
          weight: targetEntry.weight ?? '—',
        }),      });
      onDeleted();
      onClose();
    } catch (err) {
      toastError(t('entry.errGeneric') + ' ' + err.message);
      setLoading(false);
    }
    };

    // Widok Edycji (tylko dla Admin/Driver po kliknięciu 'Edytuj')
    if (showEditForm) {
    return (
      <div className="ap-overlay" style={{ display: 'flex' }}>
        <div className="ap-sheet">
          <div className="ap-handle"></div>
          <div className="ap-content">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(145deg,#007AFF,#0055CC)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0, boxShadow: '0 3px 10px rgba(0,122,255,0.3)' }}>✏️</div>
              <div>
                <div className="ap-title" style={{ textAlign: 'left', fontSize: '19px', marginBottom: '1px' }}>
                  {contextMode === 'arr' ? (clientName || entry.client_name) : t('entry.editEntry')}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: 600 }}>
                  {contextMode === 'arr' ? t('entry.editEntry') : entry.client_name}
                </div>
              </div>
            </div>

            {contextMode !== 'arr' && (
              <>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.client')}</div>
                <select className="ap-input" style={{ padding: '12px 14px', marginBottom: '14px' }} value={clientName} onChange={e => handleClientChange(e.target.value)}>
                  {!knownClientNames.has(entry.client_name) && <option value={entry.client_name}>{entry.client_name}</option>}
                  {sortedRoutes
                    .filter(r => clients.some(c => c.route_id === r.id))
                    .map((r, index) => (
                      <optgroup key={r.id} label={`T${index + 1} - ${r.name}`}>
                        {clients
                          .filter(c => c.route_id === r.id)
                          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                          .map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </optgroup>
                    ))}
                </select>
              </>
            )}

            <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.laundryType')}</div>
            {isWorkwearRoute(routes, clients.find(c => c.name === clientName)?.route_id || routeId) ? (
              <div className="segmented-control" style={{ marginBottom: '14px' }}>
                <button type="button" className={`seg-btn type-R active`}>{t('entry.workwear')}</button>
              </div>
            ) : (
              <div className="segmented-control" style={{ marginBottom: '14px' }}>
                <button type="button" className={`seg-btn type-P ${type === 'P' ? 'active' : ''}`} onClick={() => setType('P')}>{t('entry.sheets')}</button>
                <button type="button" className={`seg-btn type-O ${type === 'O' ? 'active' : ''}`} onClick={() => setType('O')}>{t('entry.tablecloths')}</button>
              </div>
            )}

            <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.weight')}</div>
            <input type="text" className="ap-input" value={weight} onChange={e => setWeight(e.target.value)} style={{ marginBottom: '14px' }} inputMode="decimal" />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.arrival')}</div>
                <select
                  className="ap-input"
                  value={arrDay}
                  onChange={e => {
                    const { pickDay: pd, pickWeek: pw } = getDefaultPickInfo(e.target.value, clientRouteSchedule(clients, routes, clientName));
                    setArrDay(e.target.value);
                    setPickDay(pd);
                    setPickWeek(pw);
                  }}
                >
                  {daysFull.map((name, i) => <option key={i} value={i + 1}>{name} {shortDate(dateForDay(entry.week_key, i + 1))}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.pickup')}</div>
                <select className="ap-input" value={pickDay} onChange={e => setPickDay(Number(e.target.value))}>
                  {buildPickDayOptions(entry.week_key, arrDay, pickWeek, pickDay).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.pickupWeek')}</div>
                <select className="ap-input" value={pickWeek} onChange={e => { const w = Number(e.target.value); setPickWeek(w); if (w === 0 && Number(pickDay) < (parseInt(arrDay) || 1)) setPickDay(parseInt(arrDay) || 1); }}>
                  <option value={0}>{t('entry.sameWeek')}</option>
                  <option value={1}>{t('entry.nextWeek')}</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.trolleys')}</div>
                <input type="number" className="ap-input" value={trolleys} onChange={e => setTrolleys(e.target.value ? Number(e.target.value) : '')} min="0" />
              </div>
            </div>

            {isAdmin && (
              <div className="ap-field" style={{ marginBottom: '14px' }}>
                <label className="ap-label" style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: '6px' }}>{t('entry.logisticsRoute')}</label>
                <select className="ap-select ap-input" value={routeId} onChange={e => setRouteId(Number(e.target.value))} style={{ width: '100%', padding: '12px 14px' }}>
                  {sortedRoutes.map((r, index) => (
                    <option key={r.id} value={r.id}>T{index + 1} - {r.name}</option>
                  ))}
                </select>
              </div>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px', fontWeight: 500, marginBottom: '14px', cursor: 'pointer', padding: '12px 14px', background: 'rgba(255,59,48,0.06)', borderRadius: '12px', border: '1px solid rgba(255,59,48,0.15)' }}>
              <input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} style={{ width: '20px', height: '20px', accentColor: '#FF3B30' }} />
              <span style={{ color: '#FF3B30', fontWeight: 600 }}>{t('entry.urgent')}</span>
            </label>

            <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{t('entry.comment')}</div>
            <input type="text" className="ap-input" value={comment} onChange={e => setComment(e.target.value)} style={{ marginBottom: '18px' }} />

            <div className="ap-btn-group">
              <button className="ap-btn ap-btn-primary" onClick={handleSaveEdit} disabled={loading}>{t('entry.save')}</button>
              <button className="ap-btn ap-btn-secondary" onClick={() => directEditMode ? onClose() : setEditing(false)} disabled={loading}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Widok Szczegółów (Domyślny)
  const routeName = routes?.find(r => r.id === entry.route_id)?.name || '—';

  return (
    <div className="ap-overlay" style={{ display: 'flex' }}>
      <div className="ap-sheet">
        <div className="ap-handle"></div>
        <div className="ap-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(145deg,#007AFF,#0055CC)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0, boxShadow: '0 3px 10px rgba(0,122,255,0.3)' }}>📋</div>
            <div>
              <div className="ap-title" style={{ textAlign: 'left', fontSize: '19px', marginBottom: '2px' }}>{entry.client_name}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{routeName}{entry.urgent ? ` · ${t('entry.urgentShort')}` : ''}</div>
            </div>
          </div>

          <ROW label={t('entry.status')} value={allPickupDone ? t('entry.pickedUpCheck') : t('entry.inProgress')} valueColor={allPickupDone ? 'var(--accent-green)' : undefined} />
          <ROW label={t('entry.view')} value={isPickupContext ? t('entry.pickup') : contextMode === 'arr' ? t('entry.arrival') : t('entry.viewDetails')} valueColor={isPickupContext ? 'var(--accent-green)' : undefined} />
          <ROW label={t('entry.kind')} value={isPickupContext ? pickupTypeLabel : entry.type === 'R' ? t('entry.workwear') : entry.type === 'O' ? t('entry.tablecloths') : t('entry.sheets')} />
          <ROW label={t('entry.weight')} value={isPickupContext ? (pickupTotalWeight ? `${Number(pickupTotalWeight.toFixed(1))} kg` : '—') : (entry.weight ? `${entry.weight} kg` : '—')} />
          {!isGroupedPickup && <ROW label={t('entry.trolleys')} value={entry.trolleys ?? 1} />}
          {isGroupedPickup && <ROW label={t('entry.entriesField')} value={t('entry.arrivalsCount', { count: pickupEntries.length })} />}
          <ROW label={isGroupedPickup ? t('entry.arrivals') : t('entry.arrival')} value={isGroupedPickup ? pickupArrivalDays : daysFull[entry.arr_day - 1]} />
          <ROW label={t('entry.pickup')} value={daysFull[entry.pick_day - 1]} />
          {entry.added_by && <ROW label={t('entry.addedBy')} value={`${entry.added_by} · ${fmtDateTime(entry.added_at)}`} />}
          {allPickupDone && pickedByNames.length > 0 && <ROW label={t('entry.pickedBy')} value={pickedByNames.join(', ')} valueColor="var(--accent-green)" />}
          {!isGroupedPickup && entry.washed && <ROW label={t('entry.washingRow')} value={`${t('entry.washedCheck')}${entry.washed_by ? ` · ${entry.washed_by}` : ''}${entry.washed_at ? ` · ${fmtDateTime(entry.washed_at)}` : ''}`} valueColor="var(--accent-green)" />}
          {(() => { const cn = (clients || []).find(c => c.name === entry.client_name)?.note || entry.comment; return cn ? <ROW label={t('entry.comment')} value={cn} /> : null; })()}

          {isGroupedPickup && (
            <div style={{ marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px' }}>
                {t('entry.arrivalDetails')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {pickupEntries.map((item, index) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '28px 1fr auto auto',
                      gap: '8px',
                      alignItems: 'center',
                      padding: '8px 10px',
                      borderRadius: '10px',
                      background: item.done ? 'rgba(142,142,147,0.08)' : 'var(--accent-light)',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                      fontWeight: 650,
                    }}
                  >
                    <span style={{ color: 'var(--text-tertiary)' }}>#{index + 1}</span>
                    <span>
                      {daysFull[item.arr_day - 1]}
                      <span style={{ color: 'var(--text-tertiary)', fontWeight: 550 }}> · {item.added_by || '—'}</span>
                    </span>
                    <span>{item.type === 'R' ? t('entry.workwear') : item.type === 'O' ? t('entry.tablecloths') : t('entry.sheets')}</span>
                    <span>{item.weight ? `${item.weight} kg` : '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(() => {
            const canUndone = isPickupContext && (!allPickupDone || isAdmin || pickupEntries.some(e => e.picked_by === user?.name));
            return (
              <div className="ap-btn-group" style={{ marginTop: '16px' }}>
                {canUndone && (
                  <button className="ap-btn" style={{ background: 'var(--accent-green-light)', color: 'var(--accent-green)' }} onClick={toggleDone} disabled={loading}>
                    {allPickupDone ? t('entry.undoPickup') : t('entry.markPickedUp')}
                  </button>
                )}
                <button className="ap-btn ap-btn-secondary" onClick={onClose} disabled={loading}>{t('entry.close')}</button>
              </div>
            );
          })()}

          {canEdit && !isGroupedPickup && !isPickupContext && (
            <button
              className="ap-btn"
              style={{
                width: '100%', marginTop: '8px',
                background: entry.washed ? 'var(--accent-green-light)' : 'var(--bg-secondary)',
                color: entry.washed ? 'var(--accent-green)' : 'var(--text-primary)',
              }}
              onClick={toggleWashed}
              disabled={washing || loading}
            >
              {entry.washed ? t('entry.washedUndo') : t('entry.markWashed')}
            </button>
          )}

          {canEdit && !isGroupedPickup && (
            <div style={{ display: 'grid', gridTemplateColumns: isAdmin ? '1fr 1fr' : '1fr', gap: '8px', marginTop: '8px' }}>
              <button className="ap-btn" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} onClick={() => setEditing(true)} disabled={loading}>{t('entry.edit')}</button>
              {isAdmin && (
                <button className="ap-btn ap-btn-danger" onClick={handleDelete} disabled={loading}>
                  {confirmDelete ? t('entry.confirmDeleteShort') : t('entry.delete')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const fmtDateTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const hh = String(d.getHours()).padStart(2,'0');
  const min = String(d.getMinutes()).padStart(2,'0');
  return `${dd}.${mm} ${hh}:${min}`;
};

const ROW = ({ label, value, valueColor }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', padding: '10px 0' }}>
    <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>{label}</span>
    <span style={{ fontWeight: 600, fontSize: '13px', color: valueColor || 'var(--text-primary)', textAlign: 'right', maxWidth: '60%' }}>{value}</span>
  </div>
);
