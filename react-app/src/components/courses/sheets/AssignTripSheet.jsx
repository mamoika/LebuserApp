import { useEffect, useState } from 'react';
import { callExistingTripRpc } from '../../../lib/courseRpc';
import { routeNamesForTrip } from '../../../lib/tripUiHelpers';
import { toastError, toastSuccess } from '../../../lib/toast';
import { VEHICLES, VEHICLE_LABELS } from '../../../lib/vehicles';
import CourseSheet from '../CourseSheet';

const pfLabel = { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)' };

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function AssignTripSheet({ trip, sessionToken, routeMap = {}, drivers = [], onClose, onAssigned }) {
  const [driverId, setDriverId] = useState('');
  const [car, setCar] = useState(VEHICLES[0].key);
  const [plannedStart, setPlannedStart] = useState(`${trip.trip_date}T06:00`);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDriverId('');
    setCar(VEHICLES[0].key);
    setPlannedStart(`${trip.trip_date}T06:00`);
  }, [trip]);

  const assign = async () => {
    if (!driverId) {
      toastError('Wybierz kierowcę');
      return;
    }
    try {
      setBusy(true);
      const plannedStartIso = plannedStart ? new Date(plannedStart).toISOString() : null;
      await callExistingTripRpc('admin_plan_driver_trip', sessionToken, {
        p_driver_id: driverId,
        p_trip_date: trip.trip_date,
        p_car: car,
        p_routes: String(trip.routes),
        p_extra_clients: null,
        p_planned_start: plannedStartIso,
      });
      toastSuccess(`Przypisano kurs na ${fmtDate(trip.trip_date)}`);
      await onAssigned?.();
      onClose();
    } catch (error) {
      toastError(`Błąd przypisania: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <CourseSheet titleId="assign-trip-title" title="Przypisz kurs" onClose={onClose} busy={busy}>
      <p className="live-sheet-copy">{routeNamesForTrip(trip, routeMap)} · <strong>{fmtDate(trip.trip_date)}</strong></p>
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
        <button className="ap-btn ap-btn-primary" onClick={assign} disabled={busy || !driverId}>{busy ? 'Zapisywanie…' : 'Przypisz'}</button>
      </div>
    </CourseSheet>
  );
}
