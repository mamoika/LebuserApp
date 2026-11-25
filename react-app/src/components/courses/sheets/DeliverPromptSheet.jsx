import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, CheckCircle2, Plus, Search, ShoppingCart, X } from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import { useLaundryWorkflow } from '../../../hooks/useLaundryWorkflow';
import { buildTrolleyOccupancy, canUseFreeTrolley } from '../../../lib/trolleyOccupancy';
import { laundryActionErrorMessage } from '../../../lib/laundryRpc';
import { describeTrolleyActions } from '../../../lib/tripUiHelpers';
import { deliveryTrolleyChoices } from '../../../lib/deliveryTrolleyChoices';
import { formatTrolleyCode } from '../../../lib/trolleyCodes';
import { toastError, toastSuccess } from '../../../lib/toast';
import CourseSheet from '../CourseSheet';
import '../../mockups/mockups.css';

export default function DeliverPromptSheet({ stop, pendingDelivery, sessionToken, onClose, onDone }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const { data: workflow, error: workflowError, refresh } = useLaundryWorkflow(sessionToken);
  const [emptyTrolleys, setEmptyTrolleys] = useState([]);
  const loadingTrolleys = !workflow && !workflowError;
  const availableEmptyTrolleys = useMemo(() => {
    if (!workflow || workflowError) return [];
    const occupied = buildTrolleyOccupancy(workflow.trolleys, workflow.arrival_reservations);
    return Array.from({ length: Number(workflow.trolley_count) || 25 }, (_, index) => String(index + 1))
      .filter(number => canUseFreeTrolley(number, occupied.get(number), workflow.trolley_inventory));
  }, [workflow, workflowError]);
  const prompt = { trolleys: deliveryTrolleyChoices(pendingDelivery, workflow?.trolleys), emptyTrolleys };
  const emptySelectionChanged = emptyTrolleys.some(number => !availableEmptyTrolleys.includes(number));
  const [trolleyPickerOpen, setTrolleyPickerOpen] = useState(false);
  const [trolleyPickerDraft, setTrolleyPickerDraft] = useState([]);
  const draftSelectionChanged = trolleyPickerDraft.some(number => !availableEmptyTrolleys.includes(number));
  const [searchQuery, setSearchQuery] = useState('');

  const filteredEmptyTrolleys = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return availableEmptyTrolleys;
    return availableEmptyTrolleys.filter(number => number.includes(q));
  }, [availableEmptyTrolleys, searchQuery]);

  const openTrolleyPicker = () => {
    setTrolleyPickerDraft(emptyTrolleys.filter(number => availableEmptyTrolleys.includes(number)));
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
    if (workflowError || draftSelectionChanged) return;
    setEmptyTrolleys(trolleyPickerDraft);
    setTrolleyPickerOpen(false);
  };

  const confirm = async () => {
    if (loadingTrolleys || workflowError || emptySelectionChanged || pendingDelivery.length === 0) return;
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
      const affected = data?.affected ?? 0;
      if (affected !== ids.length) {
        toastError(t(affected > 0 ? 'course.currentStop.partialAffected' : 'course.sheets.delivery.otherDriverError'));
        await onDone?.();
        return;
      }
      const details = describeTrolleyActions(prompt);
      toastSuccess(details ? t('course.sheets.delivery.savedDetails', { details }) : t('course.sheets.delivery.saved'));
      await onDone?.();
      onClose();
    } catch (err) {
      toastError(t('course.sheets.delivery.error', { message: laundryActionErrorMessage(err, t) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
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
        <div className="delivery-empty-trolley-card">
          <div className="delivery-empty-trolley-head">
            <div className="delivery-empty-trolley-title">
              <ShoppingCart size={15} aria-hidden="true" />
              <span>{t('course.sheets.delivery.emptyTrolleys')}</span>
            </div>
            <p className="delivery-empty-trolley-hint">{t('course.sheets.delivery.emptyTrolleysHint')}</p>
          </div>
          <button
            type="button"
            className="delivery-add-trolley-btn"
            onClick={openTrolleyPicker}
            disabled={loadingTrolleys || Boolean(workflowError) || (availableEmptyTrolleys.length === 0 && emptyTrolleys.length === 0)}
          >
            <Plus size={16} aria-hidden="true" />
            <span>{loadingTrolleys ? t('course.sheets.delivery.checkingTrolleys') : t('course.sheets.delivery.addTrolley')}</span>
          </button>
          {workflowError && (
            <div className="ap-error" role="alert">
              <p>{t('entry.trolleyAvailabilityError')}</p>
              <button type="button" className="driver-tool-btn" onClick={refresh}>{t('common.refresh')}</button>
            </div>
          )}
          {!workflowError && emptySelectionChanged && <div className="ap-error" role="alert">{t('entry.trolleySelectionChanged')}</div>}
          {prompt.emptyTrolleys.length > 0 && (
            <div className="delivery-selected-trolleys" aria-label={t('course.sheets.delivery.selectedEmptyTrolleys')}>
              {prompt.emptyTrolleys.map(number => (
                <span className="delivery-selected-trolley" key={number}>
                  <ShoppingCart size={14} aria-hidden="true" />
                  {formatTrolleyCode(number)}
                  <button
                    type="button"
                    onClick={() => setEmptyTrolleys(current => current.filter(item => item !== number))}
                    aria-label={t('course.sheets.delivery.removeEmptyTrolley', { number })}
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="ap-btn-group delivery-main-actions">
          <button className="ap-btn ap-btn-secondary" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
          <button className="ap-btn ap-btn-primary" onClick={confirm} disabled={busy || loadingTrolleys || Boolean(workflowError) || emptySelectionChanged || pendingDelivery.length === 0}>
            {loadingTrolleys ? t('course.sheets.delivery.checkingTrolleys') : busy ? t('common.saving') : t('course.sheets.delivery.confirm')}
          </button>
        </div>
      </CourseSheet>

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
            {workflowError ? (
              <div className="ap-error" role="alert">
                <p>{t('entry.trolleyAvailabilityError')}</p>
                <button type="button" className="driver-tool-btn" onClick={refresh}>{t('common.refresh')}</button>
              </div>
            ) : filteredEmptyTrolleys.length > 0 ? (
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
          {!workflowError && draftSelectionChanged && <div className="ap-error" role="alert">{t('entry.trolleySelectionChanged')}</div>}

          <div className="delivery-picker-actions">
            <button type="button" className="ap-btn ap-btn-secondary" onClick={() => setTrolleyPickerOpen(false)}>
              {t('common.cancel')}
            </button>
            <button type="button" className="ap-btn ap-btn-primary" onClick={saveTrolleyPicker} disabled={Boolean(workflowError) || draftSelectionChanged}>
              {trolleyPickerDraft.length > 0
                ? t('course.sheets.delivery.confirmCount', { count: trolleyPickerDraft.length })
                : t('course.sheets.delivery.confirmSelection')}
            </button>
          </div>
        </CourseSheet>
      )}
    </>
  );
}
