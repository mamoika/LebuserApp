import { useEffect, useMemo, useState } from 'react';
import { callExistingTripRpc } from '../../../lib/courseRpc';
import { routeNamesForTrip } from '../../../lib/tripUiHelpers';
import { toastError, toastSuccess } from '../../../lib/toast';
import { VEHICLES } from '../../../lib/vehicles';
import CourseSheet from '../CourseSheet';

const pfLabel = { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)' };

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function AssignTripSheet({ trip, sessionToken, routeMap = {}, routes = [], drivers = [], onClose, onAssigned }) {
  const [driverId, setDriverId] = useState('');
  const [car, setCar] = useState(VEHICLES[0].key);
  const [routeId, setRouteId] = useState(String(trip?.routes || '').split(',').find(Boolean) || '');
  const [plannedStart, setPlannedStart] = useState('');
  const [busy, setBusy] = useState(false);
  const isNewCourse = !trip?.routes;
  const sortedRoutes = useMemo(
    () => [...routes].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [routes],
  );

  useEffect(() => {
    setDriverId('');
    setCar(VEHICLES[0].key);
    setRouteId(String(trip?.routes || '').split(',').find(Boolean) || '');
    setPlannedStart('');
  }, [trip]);

  const assign = async () => {
    if (!driverId || !routeId) {
      toastError(!routeId ? 'Wybierz trasę' : 'Wybierz kierowcę');
      return;
    }
    try {
      setBusy(true);
      const plannedStartIso = plannedStart ? new Date(plannedStart).toISOString() : null;
      const result = await callExistingTripRpc('admin_plan_driver_trip', sessionToken, {
        p_driver_id: driverId,
        p_trip_date: trip.trip_date,
        p_car: car,
        p_routes: String(routeId),
        p_extra_clients: null,
        p_planned_start: plannedStartIso,
      });
      toastSuccess(`Przypisano kurs na ${fmtDate(trip.trip_date)}`);
      await onAssigned?.(result?.trip || null);
      onClose();
    } catch (error) {
      toastError(`Błąd przypisania: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <CourseSheet titleId="assign-trip-title" title={isNewCourse ? 'Nowy kurs' : 'Przypisz kurs'} onClose={onClose} busy={busy}>
      <p className="live-sheet-copy">{routeId ? routeNamesForTrip({ routes: routeId }, routeMap) : 'Wybierz trasę'} · <strong>{fmtDate(trip.trip_date)}</strong></p>
      <label style={pfLabel} htmlFor="assign-route">Trasa</label>
      <select id="assign-route" className="ap-input" value={routeId} onChange={event => setRouteId(event.target.value)}>
        <option value="">— wybierz trasę —</option>
        {sortedRoutes.map(route => (
          <option key={route.id} value={route.id}>T{routeMap[route.id]?.num || route.id} · {route.name}</option>
        ))}
      </select>
      <label style={pfLabel} htmlFor="assign-driver">Kierowca</label>
      <select id="assign-driver" className="ap-input" value={driverId} onChange={event => setDriverId(event.target.value)}>
        <option value="">— wybierz kierowcę —</option>
        {drivers.map(driver => (
          <option key={driver.id} value={driver.id}>{driver.name}{driver.role === 'admin' ? ' (admin)' : ''}</option>
        ))}
      </select>
      <label style={pfLabel}>Auto</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
        {VEHICLES.map(vehicle => (
          <button
            key={vehicle.key}
            type="button"
            onClick={() => setCar(vehicle.key)}
            style={{
              flex: '1 1 100px', padding: '10px', borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontSize: '13px',
              border: `2px solid ${car === vehicle.key ? 'var(--accent)' : 'var(--border)'}`,
              background: car === vehicle.key ? 'var(--accent-light)' : 'var(--bg-card)',
              color: car === vehicle.key ? 'var(--accent)' : 'var(--text-secondary)',
            }}
          >
            {vehicle.label}
          </button>
        ))}
      </div>
      <label style={pfLabel} htmlFor="assign-start">Planowany start</label>
      <input id="assign-start" type="datetime-local" className="ap-input" value={plannedStart} onChange={event => setPlannedStart(event.target.value)} />
      <small style={{ display: 'block', marginBottom: '14px', color: 'var(--text-tertiary)' }}>Zostaw puste, jeśli kierowca ma startować ręcznie.</small>
      <div className="ap-btn-group">
        <button className="ap-btn ap-btn-secondary" onClick={onClose} disabled={busy}>Anuluj</button>
        <button className="ap-btn ap-btn-primary" onClick={assign} disabled={busy || !driverId || !routeId}>{busy ? 'Zapisywanie…' : isNewCourse ? 'Utwórz i planuj' : 'Przypisz i planuj'}</button>
      </div>
    </CourseSheet>
  );
}
