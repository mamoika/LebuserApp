import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, ShoppingCart } from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import { captureError } from '../../../lib/sentry';
import { getLaundryWorkflow } from '../../../lib/laundryRpc';
import { describeTrolleyActions } from '../../../lib/tripUiHelpers';
import { deliveryTrolleyChoices } from '../../../lib/deliveryTrolleyChoices';
import { formatTrolleyCode } from '../../../lib/trolleyCodes';
import { toastError, toastSuccess } from '../../../lib/toast';
import CourseSheet from '../CourseSheet';

export default function DeliverPromptSheet({ stop, pendingDelivery, sessionToken, onClose, onDone }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [loadingTrolleys, setLoadingTrolleys] = useState(true);
  const [prompt, setPrompt] = useState(() => ({
    trolleys: deliveryTrolleyChoices(pendingDelivery),
    emptyTrolleys: [],
  }));
  const [availableEmptyTrolleys, setAvailableEmptyTrolleys] = useState([]);
  const [emptyTrolleyToAdd, setEmptyTrolleyToAdd] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoadingTrolleys(true);

    (async () => {
      try {
        const wf = await getLaundryWorkflow(sessionToken);
        if (cancelled) return;
        const occupied = new Set([
          ...(wf?.trolleys || [])
            .filter(cycle => !cycle.returned_at && !['returned', 'canceled'].includes(cycle.status))
            .map(cycle => String(cycle.trolley_no)),
          ...(wf?.arrival_reservations || []).map(reservation => String(reservation.trolley_no)),
        ]);
        const free = Array.from({ length: Number(wf?.trolley_count) || 25 }, (_, index) => String(index + 1))
          .filter(number => !occupied.has(number));
        setAvailableEmptyTrolleys(free);
        setPrompt(prev => {
          const trolleys = deliveryTrolleyChoices(pendingDelivery, wf?.trolleys || []);
          return { trolleys, emptyTrolleys: prev.emptyTrolleys.filter(number => free.includes(number)) };
        });
      } catch (error) {
        captureError(error, { feature: 'DeliverPromptSheet.loadOldTrolleys' });
      } finally {
        if (!cancelled) setLoadingTrolleys(false);
      }
    })();

    return () => { cancelled = true; };
  }, [pendingDelivery, sessionToken, stop.client_name]);

  const addEmptyTrolley = () => {
    if (!emptyTrolleyToAdd) return;
    setPrompt(prev => ({
      ...prev,
      emptyTrolleys: [...new Set([...prev.emptyTrolleys, emptyTrolleyToAdd])],
    }));
    setEmptyTrolleyToAdd('');
  };

  const confirm = async () => {
    if (loadingTrolleys) return;
    const ids = [...new Set(pendingDelivery.map(task => task.entry_id).filter(Boolean))];
    const actions = prompt.trolleys.map(t => ({ cycle_id: t.cycleId, action: 'leave' }));
    try {
      setBusy(true);
      const rpcName = prompt.emptyTrolleys.length > 0
        ? 'driver_deliver_entries_with_empty_trolleys'
        : 'driver_deliver_entries';
      const args = {
        p_session_token: sessionToken,
        p_ids: ids,
        p_trolley_actions: actions,
      };
      if (prompt.emptyTrolleys.length > 0) args.p_empty_trolley_nos = prompt.emptyTrolleys;
      const { data, error } = await supabase.rpc(rpcName, args);
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if ((data?.affected ?? 0) !== ids.length) throw new Error(t('course.sheets.delivery.otherDriverError'));
      const details = describeTrolleyActions(prompt);
      toastSuccess(details ? t('course.sheets.delivery.savedDetails', { details }) : t('course.sheets.delivery.saved'));
      await onDone?.();
      onClose();
    } catch (err) {
      toastError(t('course.sheets.delivery.error', { message: err.message }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <CourseSheet titleId="deliver-prompt-title" title={t('course.sheets.delivery.title')} onClose={onClose} busy={busy}>
      <p className="live-sheet-copy">{stop.client_name}</p>
      <div className="delivery-trolley-notice">
        <CheckCircle2 size={18} aria-hidden="true" />
        <div>
          <strong>{t('course.sheets.delivery.allDeliveredTitle')}</strong>
          <span>{t('course.sheets.delivery.allDeliveredHint')}</span>
        </div>
      </div>
      <div className="delivery-trolley-summary" aria-label={t('course.sheets.delivery.deliveredTrolleys')}>
        {prompt.trolleys.map(trolley => (
          <span className="delivery-trolley-chip" key={trolley.cycleId}>
            <ShoppingCart size={15} aria-hidden="true" />
            {formatTrolleyCode(trolley.trolleyNo)}
          </span>
        ))}
      </div>
      <p className="delivery-trolley-pickup-hint">{t('course.sheets.delivery.pickupHint')}</p>
      <div className="delivery-empty-trolley-section">
        <label className="delivery-sheet-label">{t('course.sheets.delivery.emptyTrolleys')}</label>
        <div className="delivery-empty-trolley-row">
          <select className="ap-input" value={emptyTrolleyToAdd} onChange={event => setEmptyTrolleyToAdd(event.target.value)}>
            <option value="">{t('course.sheets.delivery.chooseFreeTrolley')}</option>
            {availableEmptyTrolleys.filter(number => !prompt.emptyTrolleys.includes(number)).map(number => (
              <option key={number} value={number}>{formatTrolleyCode(number)}</option>
            ))}
          </select>
          <button type="button" className="driver-tool-btn" onClick={addEmptyTrolley} disabled={!emptyTrolleyToAdd}>{t('common.add')}</button>
        </div>
        {prompt.emptyTrolleys.length > 0 && (
          <div className="delivery-empty-trolley-chips">
            {prompt.emptyTrolleys.map(number => (
              <button type="button" key={number} className="driver-tool-btn" onClick={() => setPrompt(prev => ({ ...prev, emptyTrolleys: prev.emptyTrolleys.filter(item => item !== number) }))}>
                {formatTrolleyCode(number)} ×
              </button>
            ))}
          </div>
        )}
        <div className="delivery-empty-trolley-hint">{t('course.sheets.delivery.emptyTrolleysHint')}</div>
      </div>
      <div className="ap-btn-group">
        <button className="ap-btn ap-btn-secondary" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
        <button className="ap-btn ap-btn-primary" onClick={confirm} disabled={busy || loadingTrolleys}>
          {loadingTrolleys ? t('course.sheets.delivery.checkingTrolleys') : busy ? t('common.saving') : t('course.sheets.delivery.confirm')}
        </button>
      </div>
    </CourseSheet>
  );
}
