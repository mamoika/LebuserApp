import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { captureError } from '../../../lib/sentry';
import { getLaundryWorkflow } from '../../../lib/laundryRpc';
import { daysAtClientLabel, daysSinceDate, describeTrolleyActions } from '../../../lib/tripUiHelpers';
import { deliveryTrolleyChoices } from '../../../lib/deliveryTrolleyChoices';
import { toastError, toastSuccess } from '../../../lib/toast';
import CourseSheet from '../CourseSheet';

const pfLabel = { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)' };

export default function DeliverPromptSheet({ stop, pendingDelivery, sessionToken, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [loadingTrolleys, setLoadingTrolleys] = useState(true);
  const [prompt, setPrompt] = useState(() => ({
    trolleys: deliveryTrolleyChoices(pendingDelivery),
    oldTrolleys: [],
  }));

  useEffect(() => {
    let cancelled = false;
    setLoadingTrolleys(true);

    (async () => {
      try {
        const wf = await getLaundryWorkflow(sessionToken);
        if (cancelled) return;
        setPrompt(prev => {
          const trolleys = deliveryTrolleyChoices(pendingDelivery, wf?.trolleys || [], prev.trolleys);
          const currentCycleIds = new Set(trolleys.map(trolley => trolley.cycleId));
          const oldTrolleys = (wf?.trolleys || [])
            .filter(c => c.client_name === stop.client_name && c.status === 'at_client' && !currentCycleIds.has(c.id))
            .map(c => ({
              cycleId: c.id,
              trolleyNo: c.trolley_no,
              days: daysSinceDate(c.delivered_at || c.packed_at),
              take: prev.oldTrolleys.some(old => old.cycleId === c.id && old.take),
            }));
          return { trolleys, oldTrolleys };
        });
      } catch (error) {
        captureError(error, { feature: 'DeliverPromptSheet.loadOldTrolleys' });
      } finally {
        if (!cancelled) setLoadingTrolleys(false);
      }
    })();

    return () => { cancelled = true; };
  }, [pendingDelivery, sessionToken, stop.client_name]);

  const toggleChoice = (cycleId, choice) => {
    setPrompt(prev => ({
      ...prev,
      trolleys: prev.trolleys.map(t => (t.cycleId === cycleId ? { ...t, choice } : t)),
    }));
  };

  const toggleOldTake = cycleId => {
    setPrompt(prev => ({
      ...prev,
      oldTrolleys: prev.oldTrolleys.map(t => (t.cycleId === cycleId ? { ...t, take: !t.take } : t)),
    }));
  };

  const confirm = async () => {
    if (loadingTrolleys) return;
    const ids = [...new Set(pendingDelivery.map(task => task.entry_id).filter(Boolean))];
    const actions = [
      ...prompt.trolleys.map(t => ({ cycle_id: t.cycleId, action: t.choice })),
      ...prompt.oldTrolleys.filter(t => t.take).map(t => ({ cycle_id: t.cycleId, action: 'return' })),
    ];
    try {
      setBusy(true);
      const { data, error } = await supabase.rpc('driver_deliver_entries', {
        p_session_token: sessionToken,
        p_ids: ids,
        p_trolley_actions: actions,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if ((data?.affected ?? 0) !== ids.length) throw new Error('Nie można dostarczyć prania odebranego przez innego kierowcę.');
      const details = describeTrolleyActions(prompt);
      toastSuccess(details ? `Dostawa zapisana · ${details}` : 'Dostawa zapisana');
      await onDone?.();
      onClose();
    } catch (err) {
      toastError(`Błąd: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <CourseSheet titleId="deliver-prompt-title" title="Co z wózkiem?" onClose={onClose} busy={busy}>
      <p className="live-sheet-copy">{stop.client_name}</p>
      {prompt.trolleys.map(t => (
        <div key={t.cycleId} style={{ marginBottom: '14px' }}>
          <label style={pfLabel}>Wózek {t.trolleyNo}</label>
          <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
            <button type="button" className="driver-tool-btn" onClick={() => toggleChoice(t.cycleId, 'return')} style={{ flex: 1, border: t.choice === 'return' ? '2px solid var(--accent)' : undefined, background: t.choice === 'return' ? 'var(--accent)' : undefined, color: t.choice === 'return' ? '#fff' : undefined }}>Zabieram z powrotem</button>
            <button type="button" className="driver-tool-btn" onClick={() => toggleChoice(t.cycleId, 'leave')} style={{ flex: 1, border: t.choice === 'leave' ? '2px solid var(--accent-orange)' : undefined, background: t.choice === 'leave' ? 'var(--accent-orange)' : undefined, color: t.choice === 'leave' ? '#fff' : undefined }}>Zostaje u klienta</button>
          </div>
        </div>
      ))}
      {prompt.oldTrolleys.length > 0 && (
        <div style={{ marginTop: '4px', marginBottom: '10px', paddingTop: '14px', borderTop: '1px solid var(--border)' }}>
          <label style={pfLabel}>Wózki zostawione wcześniej u tego klienta</label>
          {prompt.oldTrolleys.map(t => (
            <label key={t.cycleId} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', fontSize: '13px', cursor: 'pointer' }}>
              <input type="checkbox" checked={t.take} onChange={() => toggleOldTake(t.cycleId)} style={{ width: '18px', height: '18px' }} />
              <span>Zabieram wózek {t.trolleyNo} <span style={{ color: 'var(--text-tertiary)' }}>({daysAtClientLabel(t.days)})</span></span>
            </label>
          ))}
        </div>
      )}
      <div className="ap-btn-group">
        <button className="ap-btn ap-btn-secondary" onClick={onClose} disabled={busy}>Anuluj</button>
        <button className="ap-btn ap-btn-primary" onClick={confirm} disabled={busy || loadingTrolleys}>
          {loadingTrolleys ? 'Sprawdzanie wózków…' : busy ? 'Zapisywanie…' : 'Potwierdź dostawę'}
        </button>
      </div>
    </CourseSheet>
  );
}
