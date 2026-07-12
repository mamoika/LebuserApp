import { useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { formatKg, nextWorkDateAfter, workDateOptions, ymd } from '../../../lib/tripUiHelpers';
import { toastError, toastSuccess } from '../../../lib/toast';
import CourseSheet from '../CourseSheet';

const pfLabel = { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)' };

export default function PartialPickupSheet({ stop, sessionToken, contextDate, onClose, onDone }) {
  const totalKg = Number((stop?.tasks || [])
    .filter(task => task.task_type === 'pickup_clean' && task.status === 'pending')
    .reduce((sum, task) => sum + (Number(task.quantity) || 0), 0)
    .toFixed(1));
  const [value, setValue] = useState(String(totalKg || ''));
  const [baskets, setBaskets] = useState('1');
  const [remainingDate, setRemainingDate] = useState(nextWorkDateAfter(contextDate || ymd()));
  const [busy, setBusy] = useState(false);

  const pickupKg = parseFloat(String(value).replace(',', '.'));

  const submit = async () => {
    if (!Number.isFinite(pickupKg) || pickupKg <= 0) {
      toastError('Podaj wagę większą od 0 kg');
      return;
    }
    if (pickupKg > totalKg) {
      toastError(`Ten punkt ma tylko ${formatKg(totalKg)} kg`);
      return;
    }
    const ids = [...new Set((stop?.tasks || [])
      .filter(task => task.task_type === 'pickup_clean' && task.entry_id)
      .map(task => task.entry_id))];
    if (!ids.length) {
      toastError('Brak wpisów do częściowego odbioru');
      return;
    }
    try {
      setBusy(true);
      const { data, error } = await supabase.rpc('driver_pickup_entries_partial', {
        p_session_token: sessionToken,
        p_ids: ids,
        p_pickup_kg: pickupKg,
        p_baskets: Math.max(0, Number(baskets) || 1),
        p_remaining_pick_date: pickupKg < totalKg ? remainingDate : null,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toastSuccess(pickupKg < totalKg ? `Odebrano ${formatKg(pickupKg)} kg · reszta zaplanowana` : `Odebrano ${formatKg(pickupKg)} kg`);
      await onDone?.();
      onClose();
    } catch (err) {
      toastError(`Błąd: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <CourseSheet titleId="partial-pickup-title" title="Odbierz część kg" onClose={onClose} busy={busy}>
      <p className="live-sheet-copy">{stop.client_name} · dostępne {formatKg(totalKg)} kg</p>
      <label style={pfLabel} htmlFor="partial-kg">Ile kg kierowca zabiera teraz?</label>
      <input id="partial-kg" className="ap-input" type="text" inputMode="decimal" autoFocus value={value} onChange={event => setValue(event.target.value)} placeholder="np. 100" />
      <label style={pfLabel} htmlFor="partial-baskets">Wózki</label>
      <input id="partial-baskets" className="ap-input" type="number" min="0" inputMode="numeric" value={baskets} onChange={event => setBaskets(event.target.value)} />
      {Number.isFinite(pickupKg) && pickupKg < totalKg && (
        <>
          <label style={pfLabel} htmlFor="partial-remaining">Reszta kg do odbioru dnia</label>
          <select id="partial-remaining" className="ap-input" value={remainingDate} onChange={event => setRemainingDate(event.target.value)}>
            {workDateOptions(21).filter(opt => opt.value > (contextDate || ymd())).map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </>
      )}
      <div className="ap-btn-group">
        <button className="ap-btn ap-btn-secondary" onClick={onClose} disabled={busy}>Anuluj</button>
        <button className="ap-btn ap-btn-primary" onClick={submit} disabled={busy}>{busy ? 'Zapisywanie…' : 'Odbierz tyle'}</button>
      </div>
    </CourseSheet>
  );
}
