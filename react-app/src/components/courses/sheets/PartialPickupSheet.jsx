import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../../lib/supabaseClient';
import { formatKg, nextWorkDateAfter, workDateOptions } from '../../../lib/tripUiHelpers';
import { operationalYmd } from '../../../lib/dateUtils';
import { toastError, toastSuccess } from '../../../lib/toast';
import CourseSheet from '../CourseSheet';

const pfLabel = { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)' };

export default function PartialPickupSheet({ stop, sessionToken, contextDate, onClose, onDone }) {
  const { t } = useTranslation();
  const totalKg = Number((stop?.tasks || [])
    .filter(task => task.task_type === 'pickup_clean' && task.status === 'pending')
    .reduce((sum, task) => sum + (Number(task.quantity) || 0), 0)
    .toFixed(1));
  const [value, setValue] = useState(String(totalKg || ''));
  const [baskets, setBaskets] = useState('1');
  const [remainingDate, setRemainingDate] = useState(nextWorkDateAfter(contextDate || operationalYmd()));
  const [busy, setBusy] = useState(false);

  const pickupKg = parseFloat(String(value).replace(',', '.'));

  const submit = async () => {
    if (!Number.isFinite(pickupKg) || pickupKg <= 0) {
      toastError(t('course.sheets.partial.invalidWeight'));
      return;
    }
    if (pickupKg > totalKg) {
      toastError(t('course.sheets.partial.onlyAvailable', { weight: formatKg(totalKg) }));
      return;
    }
    const ids = [...new Set((stop?.tasks || [])
      .filter(task => task.task_type === 'pickup_clean' && task.entry_id)
      .map(task => task.entry_id))];
    if (!ids.length) {
      toastError(t('course.sheets.partial.noEntries'));
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
      toastSuccess(t(pickupKg < totalKg ? 'course.sheets.partial.successRemaining' : 'course.sheets.partial.success', { weight: formatKg(pickupKg) }));
      await onDone?.();
      onClose();
    } catch (err) {
      toastError(t('course.sheets.partial.error', { message: err.message }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <CourseSheet titleId="partial-pickup-title" title={t('course.sheets.partial.title')} onClose={onClose} busy={busy}>
      <p className="live-sheet-copy">{t('course.sheets.partial.available', { client: stop.client_name, weight: formatKg(totalKg) })}</p>
      <label style={pfLabel} htmlFor="partial-kg">{t('course.sheets.partial.amount')}</label>
      <input id="partial-kg" className="ap-input" type="text" inputMode="decimal" autoFocus value={value} onChange={event => setValue(event.target.value)} placeholder={t('entry.weightPlaceholder')} />
      <label style={pfLabel} htmlFor="partial-baskets">{t('course.sheets.partial.trolleys')}</label>
      <input id="partial-baskets" className="ap-input" type="number" min="0" inputMode="numeric" value={baskets} onChange={event => setBaskets(event.target.value)} />
      {Number.isFinite(pickupKg) && pickupKg < totalKg && (
        <>
          <label style={pfLabel} htmlFor="partial-remaining">{t('course.sheets.partial.remainingDate')}</label>
          <select id="partial-remaining" className="ap-input" value={remainingDate} onChange={event => setRemainingDate(event.target.value)}>
            {workDateOptions(21).filter(opt => opt.value > (contextDate || operationalYmd())).map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </>
      )}
      <div className="ap-btn-group">
        <button className="ap-btn ap-btn-secondary" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
        <button className="ap-btn ap-btn-primary" onClick={submit} disabled={busy}>{busy ? t('common.saving') : t('course.sheets.partial.submit')}</button>
      </div>
    </CourseSheet>
  );
}
