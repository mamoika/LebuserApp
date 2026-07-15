import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { callExistingTripRpc } from '../../../lib/courseRpc';
import { parseExtraClients, parseRouteIds, tripDateInfo, workDateOptions, ymd } from '../../../lib/tripUiHelpers';
import { formatWeekKey, operationalYmd } from '../../../lib/dateUtils';
import { toastError, toastSuccess } from '../../../lib/toast';
import { VEHICLES } from '../../../lib/vehicles';
import CourseSheet from '../CourseSheet';
import ArrivalTrolleyPicker, { arrivalTrolleyPayload } from '../../modals/ArrivalTrolleyPicker';

const pfLabel = { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)' };

function parseMonday(weekKey) {
  const [y, m, d] = weekKey.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function nextWeekKey(wk) {
  const dt = parseMonday(wk);
  dt.setDate(dt.getDate() + 7);
  return formatWeekKey(dt);
}

function defaultPickForSchedule(arrDay, schedule = 'other') {
  const d = Number(arrDay);
  if (schedule === 'daily') {
    if (d <= 4) return { pickDay: d + 1, pickWeek: 0 };
    return { pickDay: 1, pickWeek: 1 };
  }
  if (schedule === 'mwf') {
    if (d <= 1) return { pickDay: 3, pickWeek: 0 };
    if (d <= 3) return { pickDay: 5, pickWeek: 0 };
    return { pickDay: 1, pickWeek: 1 };
  }
  if (schedule === 'tth') {
    if (d <= 2) return { pickDay: 4, pickWeek: 0 };
    return { pickDay: 2, pickWeek: 1 };
  }
  if (d <= 3) return { pickDay: d + 2, pickWeek: 0 };
  if (d === 4) return { pickDay: 2, pickWeek: 1 };
  return { pickDay: 1, pickWeek: 1 };
}

function fmtDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function PlanPickupSheet({
  sessionToken,
  userName,
  clients = [],
  routes = [],
  allTrips = [],
  drivers = [],
  onClose,
  onPlanned,
}) {
  const sortedRoutes = useMemo(() => [...routes].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)), [routes]);
  const routeMap = useMemo(() => Object.fromEntries(sortedRoutes.map((route, index) => [route.id, { num: index + 1, name: route.name, schedule: route.schedule }])), [sortedRoutes]);
  const firstClient = useMemo(() => [...clients].filter(client => client.route_id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0], [clients]);
  const dates = workDateOptions();

  const plannedPickupDateFor = useCallback((dirtyDate, routeId) => {
    const dirty = tripDateInfo(dirtyDate);
    const schedule = sortedRoutes.find(route => Number(route.id) === Number(routeId))?.schedule || 'other';
    const rule = defaultPickForSchedule(dirty.arrDay, schedule);
    const monday = parseMonday(rule.pickWeek ? nextWeekKey(dirty.weekKey) : dirty.weekKey);
    monday.setDate(monday.getDate() + (rule.pickDay - 1));
    return ymd(monday);
  }, [sortedRoutes]);

  const [draft, setDraft] = useState(() => ({
    dirtyDate: dates[0]?.value || operationalYmd(),
    cleanDate: '',
    clientName: firstClient?.name || '',
    routeId: firstClient?.route_id ? String(firstClient.route_id) : '',
    type: 'P',
    weight: '',
    trolleyMode: 'trolley',
    selectedTrolleys: [],
    urgent: false,
    driverId: '',
    car: '',
  }));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!draft.dirtyDate || !draft.routeId) return;
    setDraft(current => ({ ...current, cleanDate: plannedPickupDateFor(current.dirtyDate, current.routeId) }));
  }, [draft.dirtyDate, draft.routeId, plannedPickupDateFor]);

  const setField = (field, value) => {
    setDraft(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'clientName') {
        const client = clients.find(item => item.name === value);
        if (client?.route_id) next.routeId = String(client.route_id);
      }
      return next;
    });
  };

  const existingTrip = allTrips.find(trip => {
    if (trip.trip_date !== draft.dirtyDate || trip.status === 'finished') return false;
    const extras = parseExtraClients(trip.extra_clients);
    return parseRouteIds(trip.routes).has(Number(draft.routeId)) || extras.includes(draft.clientName);
  });

  const submit = async () => {
    const routeId = Number(draft.routeId);
    if (!draft.dirtyDate || !draft.clientName || !routeId) {
      toastError('Wybierz datę, klienta i trasę');
      return;
    }
    if (draft.trolleyMode === 'trolley' && draft.selectedTrolleys.length === 0) {
      toastError('Wybierz numery wózków');
      return;
    }
    const trolleyData = arrivalTrolleyPayload(draft.trolleyMode, draft.selectedTrolleys);
    const dirty = tripDateInfo(draft.dirtyDate);
    const clean = tripDateInfo(draft.cleanDate || plannedPickupDateFor(draft.dirtyDate, routeId));
    const driver = drivers.find(item => String(item.id) === String(draft.driverId));
    try {
      setBusy(true);
      const entryId = `ID_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      const { data: plannedData, error: entryErr } = await supabase.rpc('admin_insert_entry', {
        p_session_token: sessionToken,
        p_id: entryId,
        p_week_key: dirty.weekKey,
        p_client_name: draft.clientName,
        p_arr_day: dirty.arrDay,
        p_pick_day: clean.arrDay,
        p_pick_week_key: clean.weekKey,
        p_route_id: routeId,
        p_type: draft.type || 'P',
        p_weight: draft.weight ? parseFloat(String(draft.weight).replace(',', '.')) : null,
        p_trolleys: trolleyData.trolleys,
        p_arrival_trolley_nos: trolleyData.arrival_trolley_nos,
        p_urgent: !!draft.urgent,
        p_added_by: userName,
      });
      if (entryErr) throw entryErr;
      if (plannedData?.error) throw new Error(plannedData.error);

      if (existingTrip) {
        await callExistingTripRpc('driver_set_trip_extra_clients', sessionToken, {
          p_trip_id: existingTrip.id,
          p_extra_clients: JSON.stringify([...new Set([...parseExtraClients(existingTrip.extra_clients), draft.clientName])]),
        });
      } else {
        await callExistingTripRpc('admin_plan_driver_trip', sessionToken, {
          p_driver_id: driver?.id || null,
          p_trip_date: draft.dirtyDate,
          p_car: draft.car || '',
          p_routes: String(routeId),
          p_extra_clients: JSON.stringify([draft.clientName]),
        });
      }

      toastSuccess(`Zlecono odbiór: ${draft.clientName} · ${fmtDate(draft.dirtyDate)}`);
      await onPlanned?.();
      onClose();
    } catch (error) {
      toastError(`Błąd zlecania odbioru: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const sortedClients = [...clients].filter(client => client.route_id).sort((a, b) => {
    const ar = routeMap[a.route_id]?.num || 999;
    const br = routeMap[b.route_id]?.num || 999;
    return ar - br || (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, 'pl');
  });

  return (
    <CourseSheet titleId="plan-pickup-title" title="Zleć nowy odbiór" onClose={onClose} busy={busy}>
      <p className="live-sheet-copy">Planowanie odbioru brudnego i kursu w oknie 14 dni</p>
      <label style={pfLabel} htmlFor="plan-dirty-date">Data odbioru brudnego</label>
      <select id="plan-dirty-date" className="ap-input" value={draft.dirtyDate} onChange={event => setField('dirtyDate', event.target.value)}>
        {dates.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
      <label style={pfLabel} htmlFor="plan-client">Klient</label>
      <select id="plan-client" className="ap-input" value={draft.clientName} onChange={event => setField('clientName', event.target.value)}>
        {sortedRoutes.map(route => (
          <optgroup key={route.id} label={`T${routeMap[route.id]?.num || route.id} · ${route.name}`}>
            {sortedClients.filter(client => client.route_id === route.id).map(client => (
              <option key={client.id || client.name} value={client.name}>{client.name}</option>
            ))}
          </optgroup>
        ))}
      </select>
      <label style={pfLabel} htmlFor="plan-route">Trasa</label>
      <select id="plan-route" className="ap-input" value={draft.routeId} onChange={event => setField('routeId', event.target.value)}>
        {sortedRoutes.map(route => <option key={route.id} value={route.id}>T{routeMap[route.id]?.num || route.id} · {route.name}</option>)}
      </select>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <label style={pfLabel} htmlFor="plan-type">Rodzaj</label>
          <select id="plan-type" className="ap-input" value={draft.type} onChange={event => setField('type', event.target.value)}>
            <option value="P">Pościel</option>
            <option value="O">Obrusy</option>
            <option value="R">Odzież robocza</option>
          </select>
        </div>
      </div>
      <ArrivalTrolleyPicker
        sessionToken={sessionToken}
        clientName={draft.clientName}
        mode={draft.trolleyMode}
        onModeChange={value => setField('trolleyMode', value)}
        selected={draft.selectedTrolleys}
        onSelectedChange={value => setField('selectedTrolleys', value)}
        disabled={busy}
      />
      <label style={pfLabel} htmlFor="plan-weight">Waga (kg)</label>
      <input id="plan-weight" className="ap-input" type="text" inputMode="decimal" value={draft.weight} onChange={event => setField('weight', event.target.value)} placeholder="np. 150.5" />
      <label style={pfLabel} htmlFor="plan-clean-date">Odbiór czystego z pralni</label>
      <select id="plan-clean-date" className="ap-input" value={draft.cleanDate} onChange={event => setField('cleanDate', event.target.value)}>
        {workDateOptions(21).filter(opt => !draft.dirtyDate || opt.value >= draft.dirtyDate).map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <label style={pfLabel} htmlFor="plan-driver">Kierowca</label>
          <select id="plan-driver" className="ap-input" value={draft.driverId} onChange={event => setField('driverId', event.target.value)}>
            <option value="">Brak przypisania</option>
            {drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
          </select>
        </div>
        <div>
          <label style={pfLabel} htmlFor="plan-car">Auto</label>
          <select id="plan-car" className="ap-input" value={draft.car} onChange={event => setField('car', event.target.value)}>
            <option value="">Brak przypisania</option>
            {VEHICLES.map(vehicle => <option key={vehicle.key} value={vehicle.key}>{vehicle.label}</option>)}
          </select>
        </div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 650, margin: '12px 0', cursor: 'pointer' }}>
        <input type="checkbox" checked={!!draft.urgent} onChange={event => setField('urgent', event.target.checked)} />
        <span style={{ color: 'var(--accent-red)' }}>Pilne</span>
      </label>
      <div className="live-sheet-copy" style={{ marginBottom: '12px' }}>
        {existingTrip
          ? `Zostanie dopięte do istniejącego kursu: ${existingTrip.driver_name || 'bez kierowcy'}`
          : 'Powstanie nowy kurs planowany na wybrany dzień.'}
      </div>
      <div className="ap-btn-group">
        <button className="ap-btn ap-btn-secondary" onClick={onClose} disabled={busy}>Anuluj</button>
        <button className="ap-btn ap-btn-primary" onClick={submit} disabled={busy || !draft.clientName}>{busy ? 'Zapisywanie…' : 'Zleć odbiór'}</button>
      </div>
    </CourseSheet>
  );
}
