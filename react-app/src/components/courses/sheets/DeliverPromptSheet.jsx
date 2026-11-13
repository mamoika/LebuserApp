import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, CheckCircle2, Plus, Search, ShoppingCart, X } from 'lucide-react';
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
  const [trolleyPickerOpen, setTrolleyPickerOpen] = useState(false);
  const [trolleyPickerDraft, setTrolleyPickerDraft] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredEmptyTrolleys = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return availableEmptyTrolleys;
    return availableEmptyTrolleys.filter(number => number.includes(q));
  }, [availableEmptyTrolleys, searchQuery]);

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
        captureError(error, { feature: 'DeliverPromptSheet.loadTrolleys' });
      } finally {
        if (!cancelled) setLoadingTrolleys(false);
      }
    })();

    return () => { cancelled = true; };
  }, [pendingDelivery, sessionToken, stop.client_name]);

  const openTrolleyPicker = () => {
    setTrolleyPickerDraft(prompt.emptyTrolleys);
    setSearchQuery('');
    setTrolleyPickerOpen(true);
  };

  const toggleEmptyTrolley = trolleyNo => {
    setTrolleyPickerDraft(current => (
      current.includes(trolleyNo)
        ? current.filter(number => number !== trolleyNo)
        : [...current, trolleyNo]
    ));
  };

  const saveTrolleyPicker = () => {
    setPrompt(prev => ({ ...prev, emptyTrolleys: trolleyPickerDraft }));
    setTrolleyPickerOpen(false);
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
    <CourseSheet titleId="deliver-prompt-title" title={t('course.sheets.delivery.title')} onClose={onClose} busy={busy || trolleyPickerOpen}>
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
        <div className="delivery-empty-trolley-head">
          <div>
            <div className="delivery-sheet-label">{t('course.sheets.delivery.emptyTrolleys')}</div>
            <div className="delivery-empty-trolley-hint">{t('course.sheets.delivery.emptyTrolleysHint')}</div>
          </div>
          <button type="button" className="driver-tool-btn delivery-add-trolley-btn" onClick={openTrolleyPicker} disabled={loadingTrolleys || availableEmptyTrolleys.length === 0}>
            <Plus size={16} aria-hidden="true" />
            {loadingTrolleys ? t('course.sheets.delivery.checkingTrolleys') : t('course.sheets.delivery.addTrolley')}
          </button>
        </div>
        {prompt.emptyTrolleys.length > 0 && (
          <div className="delivery-selected-trolleys" aria-label={t('course.sheets.delivery.selectedEmptyTrolleys')}>
            {prompt.emptyTrolleys.map(number => (
              <span className="delivery-selected-trolley" key={number}>
                <ShoppingCart size={15} aria-hidden="true" />
                {formatTrolleyCode(number)}
                <button type="button" onClick={() => setPrompt(prev => ({ ...prev, emptyTrolleys: prev.emptyTrolleys.filter(item => item !== number) }))} aria-label={t('course.sheets.delivery.removeEmptyTrolley', { number })}>
                  <X size={14} aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="ap-btn-group">
        <button className="ap-btn ap-btn-secondary" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
        <button className="ap-btn ap-btn-primary" onClick={confirm} disabled={busy || loadingTrolleys}>
          {loadingTrolleys ? t('course.sheets.delivery.checkingTrolleys') : busy ? t('common.saving') : t('course.sheets.delivery.confirm')}
        </button>
      </div>

      {trolleyPickerOpen && (
        <CourseSheet className="delivery-picker-sheet" titleId="empty-trolley-picker-title" title={t('course.sheets.delivery.pickerTitle')} onClose={() => setTrolleyPickerOpen(false)}>
          <div className="delivery-picker-meta">
            <span className="delivery-picker-client">{stop.client_name}</span>
            <span className="delivery-picker-count">{t('course.sheets.delivery.freeCount', { count: availableEmptyTrolleys.length })}</span>
          </div>
          <p className="live-sheet-copy">{t('course.sheets.delivery.pickerHint')}</p>

          <div className="delivery-picker-search">
            <Search size={15} aria-hidden="true" className="delivery-picker-search-icon" />
            <input
              type="text"
              inputMode="numeric"
              className="delivery-picker-search-input"
              placeholder={t('course.sheets.delivery.searchPlaceholder')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              aria-label={t('course.sheets.delivery.searchPlaceholder')}
            />
            {searchQuery && (
              <button
                type="button"
                className="delivery-picker-search-clear"
                onClick={() => setSearchQuery('')}
                aria-label={t('course.sheets.delivery.clearSearch')}
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>

          {trolleyPickerDraft.length > 0 && (
            <div className="delivery-picker-selected-strip" aria-label={t('course.sheets.delivery.selectedEmptyTrolleys')}>
              <div className="delivery-picker-selected-head">
                <span className="delivery-picker-selected-title">
                  {t('course.sheets.delivery.selectedBadge', { count: trolleyPickerDraft.length })}
                </span>
                <button
                  type="button"
                  className="delivery-picker-clear-btn"
                  onClick={() => setTrolleyPickerDraft([])}
                >
                  {t('common.clear')}
                </button>
              </div>
              <div className="delivery-picker-chips-row">
                {trolleyPickerDraft.map(number => (
                  <span key={number} className="delivery-picker-draft-chip">
                    <span className="delivery-picker-draft-chip-num">{formatTrolleyCode(number)}</span>
                    <button
                      type="button"
                      onClick={() => toggleEmptyTrolley(number)}
                      aria-label={t('course.sheets.delivery.removeEmptyTrolley', { number })}
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="delivery-picker-scroll">
            {filteredEmptyTrolleys.length > 0 ? (
              <div className="delivery-empty-trolley-grid" role="group" aria-label={t('course.sheets.delivery.emptyTrolleys')}>
                {filteredEmptyTrolleys.map(number => {
                  const selected = trolleyPickerDraft.includes(number);
                  return (
                    <button
                      type="button"
                      key={number}
                      className={`delivery-empty-trolley-tile ${selected ? 'is-selected' : ''}`}
                      onClick={() => toggleEmptyTrolley(number)}
                      aria-pressed={selected}
                      aria-label={t('course.sheets.delivery.toggleEmptyTrolley', { number })}
                    >
                      <span className="delivery-tile-num">{number}</span>
                      {selected && <Check size={13} className="delivery-tile-check" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            ) : availableEmptyTrolleys.length === 0 ? (
              <div className="delivery-empty-trolley-state">{t('course.sheets.delivery.noFreeTrolleys')}</div>
            ) : (
              <div className="delivery-empty-trolley-state">{t('course.sheets.delivery.noSearchResults')}</div>
            )}
          </div>

          <div className="delivery-picker-actions">
            <button type="button" className="ap-btn ap-btn-secondary" onClick={() => setTrolleyPickerOpen(false)}>
              {t('common.cancel')}
            </button>
            <button type="button" className="ap-btn ap-btn-primary" onClick={saveTrolleyPicker}>
              {trolleyPickerDraft.length > 0
                ? t('course.sheets.delivery.confirmCount', { count: trolleyPickerDraft.length })
                : t('course.sheets.delivery.confirmSelection')}
            </button>
          </div>
        </CourseSheet>
      )}
    </CourseSheet>
  );
}
