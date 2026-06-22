import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppData } from '../hooks/useAppData';
import DataError from './DataError';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { toastError, toastSuccess, toastWarn } from '../lib/toast';
import { getRouteColorByDisplay } from '../lib/visualSystem';

// Etykiety pobierane przez t(`clients.schedule.<value>`) / t(`clients.groups.<value>`).
const SCHEDULE_VALUES = ['daily', 'mwf', 'tth', 'other'];

function parseRouteIds(routesStr) {
  return new Set(
    (routesStr || '').split(',').map(s => Number(s.trim())).filter(Boolean)
  );
}

function sortClientsByOrder(a, b) {
  const orderDiff = (a.sort_order ?? 9999) - (b.sort_order ?? 9999);
  if (orderDiff !== 0) return orderDiff;
  const nameDiff = String(a.name || '').localeCompare(String(b.name || ''), 'pl');
  if (nameDiff !== 0) return nameDiff;
  return String(a.id).localeCompare(String(b.id));
}

// ---- Modals ----

const LABEL_STYLE = { fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' };

function DriverRoutesModal({ routes, onClose }) {
  const { t } = useTranslation();
  const { sessionToken } = useAuth();
  const [drivers, setDrivers] = useState([]);
  const [edited, setEdited] = useState({}); // { driverId: Set of routeIds }
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.rpc('get_all_users', { p_session_token: sessionToken }).then(({ data }) => {
      const driverList = (data || []).filter(u => u.role === 'driver' || u.role === 'admin_viewer_driver');
      setDrivers(driverList);
      const init = {};
      driverList.forEach(d => {
        init[d.id] = new Set(
          (d.routes || '').split(',').map(s => s.trim()).filter(Boolean).map(Number)
        );
      });
      setEdited(init);
    });
  }, [sessionToken]);

  const toggle = (driverId, routeId) => {
    setEdited(prev => {
      const next = new Set(prev[driverId]);
      next.has(routeId) ? next.delete(routeId) : next.add(routeId);
      return { ...prev, [driverId]: next };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    for (const driver of drivers) {
      const routesStr = [...edited[driver.id]].sort((a, b) => a - b).join(',');
      await supabase.rpc('update_user_routes', { p_session_token: sessionToken, p_user_id: driver.id, p_routes: routesStr });
    }
    setSaving(false);
    onClose();
  };

  const sortedRoutes = [...routes].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  return (
    <div className="ap-overlay" style={{ display: 'flex' }} onClick={onClose}>
      <div className="ap-sheet" onClick={e => e.stopPropagation()}>
        <div className="ap-handle" />
        <div className="ap-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(145deg,#5856D6,#3634A3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0, boxShadow: '0 3px 10px rgba(88,86,214,0.3)' }}>👨‍✈️</div>
            <div className="ap-title" style={{ textAlign: 'left', fontSize: '19px' }}>{t('clients.driverRoutes')}</div>
          </div>

          {drivers.length === 0 && (
            <div style={{ color: 'var(--text-tertiary)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>{t('clients.noDrivers')}</div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '55vh', overflowY: 'auto', paddingRight: '4px' }}>
            {drivers.map(driver => (
              <div key={driver.id} style={{
                background: '#fff', borderRadius: '14px',
                padding: '12px 14px', boxShadow: '0 0 0 0.5px rgba(0,0,0,0.08)',
              }}>
                <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '10px' }}>
                  {driver.name}
                  <span style={{ fontWeight: 400, color: 'rgba(60,60,67,0.5)', fontSize: '12px', marginLeft: '6px' }}>@{driver.username}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {sortedRoutes.map(r => {
                    const on = edited[driver.id]?.has(r.id);
                    return (
                      <button
                        key={r.id}
                        onClick={() => toggle(driver.id, r.id)}
                        style={{
                          padding: '5px 11px', borderRadius: '20px', border: 'none',
                          fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                          background: on ? 'var(--accent)' : 'rgba(0,0,0,0.06)',
                          color: on ? '#fff' : 'var(--text-secondary)',
                          transition: 'all 0.12s',
                        }}
                      >
                        {r.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="ap-btn-group" style={{ marginTop: '16px' }}>
            <button className="ap-btn ap-btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? t('common.saving') : t('clients.saveChanges')}
            </button>
            <button className="ap-btn ap-btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddRouteModal({ onClose, onSave }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [schedule, setSchedule] = useState('daily');
  const [isWorkwear, setIsWorkwear] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave(name.trim(), schedule, isWorkwear);
    setSaving(false);
  };

  return (
    <div className="ap-overlay" style={{ display: 'flex' }} onClick={onClose}>
      <div className="ap-sheet" onClick={e => e.stopPropagation()}>
        <div className="ap-handle" />
        <div className="ap-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(145deg,#007AFF,#0055CC)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0, boxShadow: '0 3px 10px rgba(0,122,255,0.3)' }}>🗺</div>
            <div className="ap-title" style={{ textAlign: 'left', fontSize: '19px' }}>{t('clients.newRoute')}</div>
          </div>

          <div style={LABEL_STYLE}>{t('clients.routeName')}</div>
          <input
            className="ap-input"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }}
            placeholder={t('clients.routeNamePlaceholder')}
            style={{ marginBottom: '12px' }}
            autoFocus
          />

          <div style={LABEL_STYLE}>{t('clients.scheduleLabel')}</div>
          <select className="ap-input" value={schedule} onChange={e => setSchedule(e.target.value)} style={{ marginBottom: '12px' }}>
            {SCHEDULE_VALUES.map(v => <option key={v} value={v}>{t(`clients.schedule.${v}`)}</option>)}
          </select>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', cursor: 'pointer', fontSize: '14px' }}>
            <input type="checkbox" checked={isWorkwear} onChange={e => setIsWorkwear(e.target.checked)} style={{ transform: 'scale(1.2)' }} />
            Trasa dla Odzieży Roboczej
          </label>

          <div className="ap-btn-group">
            <button className="ap-btn ap-btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? t('common.saving') : t('clients.addRoute')}
            </button>
            <button className="ap-btn ap-btn-secondary" onClick={onClose} disabled={saving}>{t('common.cancel')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditRouteModal({ route, onClose, onSave, onDelete }) {
  const { t } = useTranslation();
  const [name, setName] = useState(route.name);
  const [schedule, setSchedule] = useState(route.schedule || 'other');
  const [isWorkwear, setIsWorkwear] = useState(!!route.is_workwear);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave(route.id, name.trim(), schedule, isWorkwear);
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setSaving(true);
    await onDelete(route);
    setSaving(false);
  };

  return (
    <div className="ap-overlay" style={{ display: 'flex' }} onClick={onClose}>
      <div className="ap-sheet" onClick={e => e.stopPropagation()}>
        <div className="ap-handle" />
        <div className="ap-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(145deg,#FF9500,#CC6600)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0, boxShadow: '0 3px 10px rgba(255,149,0,0.3)' }}>✏️</div>
            <div className="ap-title" style={{ textAlign: 'left', fontSize: '19px' }}>{t('clients.editRoute')}</div>
          </div>

          <div style={LABEL_STYLE}>{t('clients.routeName')}</div>
          <input
            className="ap-input"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }}
            style={{ marginBottom: '12px' }}
            autoFocus
          />

          <div style={LABEL_STYLE}>{t('clients.scheduleLabel')}</div>
          <select className="ap-input" value={schedule} onChange={e => setSchedule(e.target.value)} style={{ marginBottom: '12px' }}>
            {SCHEDULE_VALUES.map(v => <option key={v} value={v}>{t(`clients.schedule.${v}`)}</option>)}
          </select>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', cursor: 'pointer', fontSize: '14px' }}>
            <input type="checkbox" checked={isWorkwear} onChange={e => setIsWorkwear(e.target.checked)} style={{ transform: 'scale(1.2)' }} />
            Trasa dla Odzieży Roboczej
          </label>

          <div className="ap-btn-group">
            <button className="ap-btn ap-btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? t('common.saving') : t('clients.saveChanges')}
            </button>
            <button className="ap-btn ap-btn-danger" onClick={handleDelete} disabled={saving}>
              {confirmDelete ? t('clients.confirmDeleteRoute') : t('clients.deleteRoute')}
            </button>
            <button className="ap-btn ap-btn-secondary" onClick={onClose} disabled={saving}>{t('common.cancel')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddClientModal({ routes, defaultRouteId, onClose, onSave }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [routeId, setRouteId] = useState(defaultRouteId);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave(name.trim(), routeId);
    setSaving(false);
  };

  return (
    <div className="ap-overlay" style={{ display: 'flex' }} onClick={onClose}>
      <div className="ap-sheet" onClick={e => e.stopPropagation()}>
        <div className="ap-handle" />
        <div className="ap-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(145deg,#34C759,#25A244)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0, boxShadow: '0 3px 10px rgba(52,199,89,0.3)' }}>👤</div>
            <div className="ap-title" style={{ textAlign: 'left', fontSize: '19px' }}>{t('clients.newClient')}</div>
          </div>

          <div style={LABEL_STYLE}>{t('clients.clientName')}</div>
          <input
            className="ap-input"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }}
            placeholder={t('clients.clientName')}
            style={{ marginBottom: '12px' }}
            autoFocus
          />

          <div style={LABEL_STYLE}>{t('clients.route')}</div>
          <select className="ap-input" value={routeId} onChange={e => setRouteId(Number(e.target.value))} style={{ marginBottom: '12px' }}>
            {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>

          <div className="ap-btn-group">
            <button className="ap-btn ap-btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? t('common.saving') : t('clients.addClient')}
            </button>
            <button className="ap-btn ap-btn-secondary" onClick={onClose} disabled={saving}>{t('common.cancel')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditClientModal({ client, clients, routes, onClose, onSave, onDelete, onMerge }) {
  const { t } = useTranslation();
  const [name, setName] = useState(client.name);
  const [routeId, setRouteId] = useState(client.route_id);
  const [lat, setLat] = useState(client.lat != null ? String(client.lat) : '');
  const [lng, setLng] = useState(client.lng != null ? String(client.lng) : '');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [confirmMerge, setConfirmMerge] = useState(false);
  const mergeTargets = clients
    .filter(c => c.id !== client.id)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pl'));

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave({ id: client.id, name: name.trim(), routeId: Number(routeId), lat, lng, oldName: client.name, oldRouteId: client.route_id });
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setSaving(true);
    await onDelete(client);
    setSaving(false);
  };

  const handleMerge = async () => {
    if (!mergeTargetId) return;
    if (!confirmMerge) { setConfirmMerge(true); return; }
    setSaving(true);
    await onMerge(client, mergeTargetId);
    setSaving(false);
  };

  return (
    <div className="ap-overlay" style={{ display: 'flex' }} onClick={onClose}>
      <div className="ap-sheet" onClick={e => e.stopPropagation()}>
        <div className="ap-handle" />
        <div className="ap-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(145deg,#FF9500,#CC6600)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0, boxShadow: '0 3px 10px rgba(255,149,0,0.3)' }}>✏️</div>
            <div>
              <div className="ap-title" style={{ textAlign: 'left', fontSize: '19px', marginBottom: '1px' }}>{t('clients.editClient')}</div>
              <div style={{ fontSize: '12px', color: 'rgba(60,60,67,0.5)' }}>{client.name}</div>
            </div>
          </div>

          <div style={LABEL_STYLE}>{t('clients.clientName')}</div>
          <input className="ap-input" value={name} onChange={e => setName(e.target.value)} style={{ marginBottom: '12px' }} autoFocus />

          <div style={LABEL_STYLE}>{t('clients.route')}</div>
          <select className="ap-input" value={routeId} onChange={e => setRouteId(Number(e.target.value))} style={{ marginBottom: '12px' }}>
            {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div>
              <div style={LABEL_STYLE}>{t('clients.lat')}</div>
              <input className="ap-input" value={lat} onChange={e => setLat(e.target.value)} placeholder="52.2297" inputMode="decimal" />
            </div>
            <div>
              <div style={LABEL_STYLE}>{t('clients.lng')}</div>
              <input className="ap-input" value={lng} onChange={e => setLng(e.target.value)} placeholder="21.0122" inputMode="decimal" />
            </div>
          </div>

          <div className="ap-btn-group">
            <button className="ap-btn ap-btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? t('common.saving') : t('clients.saveChanges')}
            </button>
            <button className="ap-btn ap-btn-danger" onClick={handleDelete} disabled={saving}>
              {confirmDelete ? t('clients.confirmDeleteClient') : t('clients.deleteClient')}
            </button>
            <button className="ap-btn ap-btn-secondary" onClick={onClose} disabled={saving}>{t('common.cancel')}</button>
          </div>

          <div style={{ marginTop: '14px', padding: '12px', borderRadius: '14px', background: 'rgba(255,149,0,0.08)', border: '1px solid rgba(255,149,0,0.22)' }}>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#B45309', marginBottom: '4px' }}>{t('clients.mergeDuplicateTitle')}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.35, marginBottom: '10px' }}>{t('clients.mergeDuplicateHint')}</div>
            <select
              className="ap-input"
              value={mergeTargetId}
              onChange={e => { setMergeTargetId(e.target.value); setConfirmMerge(false); }}
              style={{ marginBottom: '10px' }}
            >
              <option value="">{t('clients.mergeSelectTarget')}</option>
              {mergeTargets.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button className="ap-btn" onClick={handleMerge} disabled={saving || !mergeTargetId} style={{ color: '#B45309', background: '#fff' }}>
              {confirmMerge ? t('clients.confirmMergeDuplicate') : t('clients.mergeDuplicate')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}



// ---- Main component ----

export default function ClientsRoutesView() {
  const { t } = useTranslation();
  const rawData = useAppData();
  const { isAdmin, isDriver, user, sessionToken } = useAuth();
  const { clients, routes, loading, error, refetch } = rawData;
  const assignedRouteIds = parseRouteIds(user?.routes);

  const [localClients, setLocalClients] = useState([]);

  const [addRouteOpen, setAddRouteOpen] = useState(false);
  const [editRouteModal, setEditRouteModal] = useState(null);
  const [addClientForRoute, setAddClientForRoute] = useState(null);
  const [editClient, setEditClient] = useState(null);
  const [driverRoutesOpen, setDriverRoutesOpen] = useState(false);
  const savingOrderRef = useRef(false);

  useEffect(() => {
    if (savingOrderRef.current) return;
    setLocalClients(clients);
  }, [clients]);

  if (loading) return <div className="loader">{t('schedule.loadingData')}</div>;
  if (error) return <DataError onRetry={refetch} />;

  // ---- Route actions ----

  const handleAddRoute = async (name, schedule, isWorkwear) => {
    try {
      const maxSort = routes.length > 0 ? Math.max(...routes.map(r => r.sort_order ?? 0)) : 0;
      const { data, error } = await supabase.rpc('admin_create_route', {
        p_session_token: sessionToken,
        p_name: name,
        p_schedule: schedule,
        p_sort_order: maxSort + 1,
        p_is_workwear: isWorkwear,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setAddRouteOpen(false);
      refetch();
    } catch (err) {
      toastError(t('clients.errAddRoute') + ' ' + err.message);
    }
  };

  const handleSaveRoute = async (routeId, name, schedule, isWorkwear) => {
    try {
      const { data, error } = await supabase.rpc('admin_update_route', {
        p_session_token: sessionToken,
        p_route_id: routeId,
        p_name: name,
        p_schedule: schedule,
        p_is_workwear: isWorkwear,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setEditRouteModal(null);
      refetch();
    } catch (err) {
      toastError(t('clients.errSaveRoute') + ' ' + err.message);
    }
  };

  const handleDeleteRoute = async (route) => {
    const hasClients = localClients.some(c => c.route_id === route.id);
    if (hasClients) {
      toastWarn(t('clients.routeHasClients'));
      return;
    }
    try {
      const { data, error } = await supabase.rpc('admin_delete_route', {
        p_session_token: sessionToken,
        p_route_id: route.id,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setEditRouteModal(null);
      refetch();
    } catch (err) {
      toastError(t('clients.errDeleteRoute') + ' ' + err.message);
    }
  };

  const moveRoute = async (route, direction) => {
    const sorted = [...routes].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const idx = sorted.findIndex(r => r.id === route.id);
    if (idx < 0) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= sorted.length) return;

    const swapped = [...sorted];
    [swapped[idx], swapped[newIdx]] = [swapped[newIdx], swapped[idx]];

    const updates = swapped.map((r, i) => ({ id: r.id, sort_order: i + 1 }));

    try {
      const { data, error } = await supabase.rpc('admin_reorder_routes', {
        p_session_token: sessionToken,
        p_updates: updates,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      refetch();
    } catch (err) {
      toastError(t('clients.errSaveOrder') + ' ' + err.message);
    }
  };

  // ---- Client actions ----

  const handleAddClient = async (name, routeId) => {
    const duplicate = clients.some(c => c.name.trim().toLowerCase() === name.toLowerCase());
    if (duplicate) { toastWarn(t('clients.clientExists')); return; }
    try {
      const { data, error } = await supabase.rpc('admin_insert_client', {
        p_session_token: sessionToken,
        p_name: name,
        p_route_id: routeId,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setAddClientForRoute(null);
      refetch();
    } catch (err) {
      toastError(t('clients.errAddClient') + ' ' + err.message);
    }
  };

  const handleSaveClient = async ({ id, name, routeId, lat, lng }) => {
    const duplicate = clients.some(c => c.name.trim().toLowerCase() === name.toLowerCase() && c.id !== id);
    if (duplicate) { toastWarn(t('clients.clientExists')); return; }

    const parsedLat = lat !== '' ? parseFloat(String(lat).replace(',', '.')) : null;
    const parsedLng = lng !== '' ? parseFloat(String(lng).replace(',', '.')) : null;

    try {
      // Update klienta + kaskada client_name w entries (gdy zmiana nazwy) — w jednym RPC
      const { data, error: clientErr } = await supabase.rpc('admin_update_client', {
        p_session_token: sessionToken,
        p_id: id,
        p_name: name,
        p_route_id: routeId,
        p_lat: !isNaN(parsedLat) ? parsedLat : null,
        p_lng: !isNaN(parsedLng) ? parsedLng : null,
      });
      if (clientErr) throw clientErr;
      if (data?.error) throw new Error(data.error);

      setEditClient(null);
      refetch();
    } catch (err) {
      toastError(t('clients.errSaveClient') + ' ' + err.message);
    }
  };

  const handleDeleteClient = async (client) => {
    try {
      const { data: usedEntry, error: usedErr } = await supabase
        .from('entries')
        .select('id')
        .eq('client_name', client.name)
        .limit(1)
        .maybeSingle();
      if (usedErr) throw usedErr;
      if (usedEntry) {
        toastWarn(t('clients.clientHasHistory'));
        return;
      }
      const { data, error } = await supabase.rpc('admin_delete_client', {
        p_session_token: sessionToken,
        p_id: client.id,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setEditClient(null);
      refetch();
    } catch (err) {
      toastError(t('clients.errDeleteClient') + ' ' + err.message);
    }
  };

  const handleMergeClient = async (sourceClient, targetClientId) => {
    try {
      const { data, error } = await supabase.rpc('admin_merge_clients', {
        p_session_token: sessionToken,
        p_source_client_id: sourceClient.id,
        p_target_client_id: targetClientId,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const target = clients.find(c => c.id === targetClientId);
      toastSuccess(t('clients.mergeDone', { source: sourceClient.name, target: target?.name || '' }));
      setEditClient(null);
      refetch();
    } catch (err) {
      toastError(t('clients.errMergeClient') + ' ' + err.message);
    }
  };

  // ---- Drag & Drop ----

  const onDragEnd = async (result) => {
    if (!isAdmin) return;
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const sourceRouteId = parseInt(source.droppableId.replace('route-', ''));
    const destRouteId = parseInt(destination.droppableId.replace('route-', ''));
    const clientToMove = localClients.find(c => c.id === draggableId);
    if (!clientToMove) return;

    const rest = localClients.filter(c => c.id !== draggableId);

    const previousClients = localClients;
    let toUpdate;
    let newLocalClients;

    if (sourceRouteId === destRouteId) {
      // Reorder w tej samej trasie
      const routeClients = rest
        .filter(c => c.route_id === sourceRouteId)
        .sort(sortClientsByOrder);
      routeClients.splice(destination.index, 0, { ...clientToMove });
      const reordered = routeClients.map((c, i) => ({ ...c, sort_order: i + 1 }));

      newLocalClients = [...rest.filter(c => c.route_id !== sourceRouteId), ...reordered];
      toUpdate = reordered.map(c => ({ id: c.id, route_id: c.route_id, sort_order: c.sort_order }));
    } else {
      // Przeniesienie między trasami
      const sourceClients = rest
        .filter(c => c.route_id === sourceRouteId)
        .sort(sortClientsByOrder)
        .map((c, i) => ({ ...c, sort_order: i + 1 }));

      const destClients = rest
        .filter(c => c.route_id === destRouteId)
        .sort(sortClientsByOrder);
      destClients.splice(destination.index, 0, { ...clientToMove, route_id: destRouteId });
      const destClientsOrdered = destClients.map((c, i) => ({ ...c, sort_order: i + 1 }));

      newLocalClients = [
        ...rest.filter(c => c.route_id !== sourceRouteId && c.route_id !== destRouteId),
        ...sourceClients,
        ...destClientsOrdered,
      ];
      toUpdate = [
        ...sourceClients.map(c => ({ id: c.id, route_id: c.route_id, sort_order: c.sort_order })),
        ...destClientsOrdered.map(c => ({ id: c.id, route_id: c.route_id, sort_order: c.sort_order })),
      ];
    }

    savingOrderRef.current = true;
    setLocalClients(newLocalClients);

    try {
      const { data, error } = await supabase.rpc('admin_reorder_clients', {
        p_session_token: sessionToken,
        p_updates: toUpdate,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await refetch();
    } catch (err) {
      setLocalClients(previousClients);
      toastError(t('clients.errSaveOrder') + ' ' + err.message);
      await refetch();
    } finally {
      savingOrderRef.current = false;
    }
  };

  // ---- Render ----

  const sortedRoutes = [...routes].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const groups = SCHEDULE_VALUES.map(value => ({
    value,
    title: t(`clients.groups.${value}`),
    routes: sortedRoutes.filter(r => (r.schedule || 'other') === value),
  }));

  const renderRouteCol = (route) => {
    const isOwnRoute = isDriver && assignedRouteIds.has(route.id);
    const routeClients = localClients
      .filter(c => c.route_id === route.id)
      .sort(sortClientsByOrder);
    const displayNum = sortedRoutes.findIndex(r => r.id === route.id) + 1;
    const routeColor = getRouteColorByDisplay(displayNum);

    return (
      <div
        key={route.id}
        className="col route-card"
        style={{
          borderTopColor: routeColor,
          borderColor: isOwnRoute ? routeColor : undefined,
          boxShadow: isOwnRoute ? `0 0 0 2px ${routeColor}33, 0 10px 24px rgba(0,0,0,0.08)` : undefined,
          background: isOwnRoute ? `linear-gradient(180deg, ${routeColor}0f 0%, var(--bg-card) 32%)` : undefined,
        }}
      >
        <div className="col-header" style={{ paddingBottom: '10px', marginBottom: '4px' }}>
          <span className="route-id-badge" style={{ background: routeColor }}>T{displayNum}</span>

          <span
            className="route-title"
            style={{ color: routeColor, cursor: isAdmin ? 'pointer' : 'default', marginLeft: '6px', flex: 1 }}
            onDoubleClick={() => isAdmin && setEditRouteModal(route)}
          >
            {route.name}
          </span>

          {isOwnRoute && (
            <span
              style={{
                color: routeColor,
                background: `${routeColor}18`,
                border: `1px solid ${routeColor}55`,
                borderRadius: '999px',
                padding: '3px 8px',
                fontSize: '10px',
                fontWeight: 800,
                whiteSpace: 'nowrap',
              }}
            >
              {t('map.yourRoute')}
            </span>
          )}

          {isAdmin && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
              <span className="edit-icon" onClick={() => moveRoute(route, -1)} title={t('clients.moveUp', 'W górę / W lewo')}>◀️</span>
              <span className="edit-icon" onClick={() => moveRoute(route, 1)} title={t('clients.moveDown', 'W dół / W prawo')}>▶️</span>
              <span className="edit-icon" onClick={() => setEditRouteModal(route)} title={t('clients.editRoute')}>✏️</span>
            </div>
          )}
        </div>

        <Droppable droppableId={`route-${route.id}`}>
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className="sortable-list"
              style={{ minHeight: '40px', background: snapshot.isDraggingOver ? 'rgba(0,0,0,0.02)' : 'transparent', borderRadius: '8px' }}
            >
              {routeClients.length === 0 ? (
                <div style={{ color: 'var(--text-quaternary)', fontSize: '12px', textAlign: 'center', margin: '10px 0' }}>{t('clients.noClients')}</div>
              ) : (
                routeClients.map((client, index) => (
                  <Draggable key={client.id} draggableId={client.id} index={index} isDragDisabled={!isAdmin}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        className={`tag-client ${isAdmin ? 'draggable' : ''}`}
                        style={{
                          ...provided.draggableProps.style,
                          boxShadow: snapshot.isDragging ? '0 5px 15px rgba(0,0,0,0.1)' : 'none',
                          opacity: snapshot.isDragging ? 0.9 : 1,
                        }}
                      >
                        {isAdmin && <span className="drag-handle">⠿</span>}
                        <span className="client-order">{index + 1}</span>
                        <span className="client-name">{client.name}</span>
                        <span
                          className={(client.lat && client.lng) ? 'gps-dot ok' : 'gps-dot missing'}
                          title={(client.lat && client.lng) ? t('clients.hasGps') : t('clients.noGps')}
                        />
                        {isAdmin && (
                          <span className="edit-icon" style={{ marginLeft: '8px' }} onClick={() => setEditClient(client)}>{t('clients.edit')}</span>
                        )}
                      </div>
                    )}
                  </Draggable>
                ))
              )}
              {provided.placeholder}
            </div>
          )}
        </Droppable>

        <div style={{ flex: 1 }} />
        <div className="divider" style={{ margin: '8px 0' }} />
        {isAdmin && (
          <button className="add-btn" onClick={() => setAddClientForRoute(route.id)}>{t('clients.addClientBtn')}</button>
        )}
      </div>
    );
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="clients-routes-view">
        {isAdmin && (
          <div className="clients-header" style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button className="add-route-btn" onClick={() => setAddRouteOpen(true)}>{t('clients.newRouteBtn')}</button>
            <button className="add-route-btn" onClick={() => setDriverRoutesOpen(true)}>{t('clients.driverRoutesBtn')}</button>
          </div>
        )}

        <div className="clients-hint" style={{ marginBottom: '16px' }}>
          {isAdmin && <span>{t('clients.dragHint')} &nbsp;·&nbsp;</span>}
          <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent-green)', verticalAlign: 'middle', margin: '0 2px' }} /> <span>{t('clients.hasGps')}</span> &nbsp;·&nbsp;
          <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent-orange)', verticalAlign: 'middle', margin: '0 2px', opacity: 0.6 }} /> <span>{t('clients.noGps')}</span>
        </div>

        {groups.map((g, i) => {
          if (g.routes.length === 0) return null;
          return (
            <div key={i} style={{ width: '100%' }}>
              <div className="route-group-header">{g.title}</div>
              <div className="grid" style={{ marginBottom: '8px' }}>
                {g.routes.map(route => renderRouteCol(route))}
              </div>
            </div>
          );
        })}
      </div>

      {addRouteOpen && (
        <AddRouteModal onClose={() => setAddRouteOpen(false)} onSave={handleAddRoute} />
      )}

      {editRouteModal && (
        <EditRouteModal
          route={editRouteModal}
          onClose={() => setEditRouteModal(null)}
          onSave={handleSaveRoute}
          onDelete={handleDeleteRoute}
        />
      )}

      {addClientForRoute !== null && (
        <AddClientModal
          routes={routes}
          defaultRouteId={addClientForRoute}
          onClose={() => setAddClientForRoute(null)}
          onSave={handleAddClient}
        />
      )}

      {editClient && (
        <EditClientModal
          client={editClient}
          clients={clients}
          routes={routes}
          onClose={() => setEditClient(null)}
          onSave={handleSaveClient}
          onDelete={handleDeleteClient}
          onMerge={handleMergeClient}
        />
      )}

      {driverRoutesOpen && (
        <DriverRoutesModal
          routes={rawData.allRoutes}
          onClose={() => setDriverRoutesOpen(false)}
        />
      )}


    </DragDropContext>
  );
}
