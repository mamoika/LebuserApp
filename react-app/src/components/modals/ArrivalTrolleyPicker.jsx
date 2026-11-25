import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronRight, Package, Search, ShoppingCart, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLaundryWorkflow } from '../../hooks/useLaundryWorkflow';
import { activePhysicalTrolleyCycles, canUseFreeTrolley } from '../../lib/trolleyOccupancy';
import { trolleyCellState } from '../../lib/arrivalTrolleyAvailability';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import { formatTrolleyCode, parseTrolleyCode } from '../../lib/trolleyCodes';
import './ArrivalTrolleyPicker.css';

const DEFAULT_TROLLEY_COUNT = 25;

function parseTrolleyNos(value) {
  if (!value) return [];
  return String(value)
    .split(/[,;]/)
    .map(part => part.trim())
    .filter(Boolean);
}

function formatTrolleyNos(numbers) {
  return [...new Set(numbers.map(n => String(n).trim()).filter(Boolean))]
    .sort((a, b) => Number(a) - Number(b))
    .join(', ');
}

export function arrivalTrolleyModeFromEntry(entry) {
  const nos = parseTrolleyNos(entry?.arrival_trolley_nos);
  if (nos.length > 0) return { mode: 'trolley', numbers: nos };
  if (!entry?.trolleys) return { mode: 'none', numbers: [] };
  return { mode: 'trolley', numbers: [] };
}

export function arrivalTrolleyPayload(mode, numbers) {
  if (mode === 'none') {
    return { trolleys: 0, arrival_trolley_nos: null };
  }
  const cleaned = [...new Set(numbers.map(n => String(n).trim()).filter(Boolean))];
  return {
    trolleys: cleaned.length,
    arrival_trolley_nos: cleaned.length ? formatTrolleyNos(cleaned) : null,
  };
}

export default function ArrivalTrolleyPicker({
  sessionToken,
  clientName,
  mode,
  onModeChange,
  selected,
  onSelectedChange,
  onOpenChange,
  entryId,
  disabled = false,
  purpose = 'pickup',
  hideModeSwitch = false,
  modeLabelId,
  triggerLabel,
  triggerHint,
  activeTrolleyByNo: externalActiveTrolleyByNo,
  trolleyCount: externalTrolleyCount,
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const pickerRef = useRef(null);
  const dialogRef = useRef(null);
  const listRef = useRef(null);
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftSelected, setDraftSelected] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [requestedFilter, setRequestedFilter] = useState(null);

  const { data: workflow, error: workflowError, refresh } = useLaundryWorkflow(sessionToken, pickerOpen);
  const availabilityReady = Boolean(workflow) && !workflowError;
  const effectiveActiveTrolleyByNo = useMemo(() => workflow
    ? new Map(activePhysicalTrolleyCycles(workflow.trolleys || []).map(cycle => [String(cycle.trolley_no).trim().toLowerCase(), cycle]))
    : (externalActiveTrolleyByNo || new Map()), [externalActiveTrolleyByNo, workflow]);
  const reservedTrolleyByNo = useMemo(() => new Map((workflow?.arrival_reservations || [])
    .filter(reservation => !entryId || String(reservation.entry_id) !== String(entryId))
    .map(reservation => [String(reservation.trolley_no).trim().toLowerCase(), reservation])), [entryId, workflow]);
  const effectiveTrolleyCount = Number(workflow?.trolley_count) || externalTrolleyCount || DEFAULT_TROLLEY_COUNT;
  const effectiveClientName = purpose === 'pack' ? '' : clientName;

  const trolleyNumbers = useMemo(
    () => Array.from({ length: effectiveTrolleyCount }, (_, index) => String(index + 1)),
    [effectiveTrolleyCount]
  );

  const inventory = purpose === 'pack' ? workflow?.trolley_inventory : null;
  const stateByNo = useMemo(() => new Map(trolleyNumbers.map(no => {
    const state = trolleyCellState(no, [], effectiveActiveTrolleyByNo, effectiveClientName, reservedTrolleyByNo);
    return [no, state === 'free' && !canUseFreeTrolley(no, null, inventory) ? 'busy' : state];
  })), [trolleyNumbers, effectiveActiveTrolleyByNo, effectiveClientName, reservedTrolleyByNo, inventory]);
  const counts = { free: 0, returning: 0, busy: 0 };
  for (const state of stateByNo.values()) counts[state] += 1;
  const filterTab = requestedFilter ?? (purpose === 'pack' || counts.returning === 0 ? 'free' : 'returning');
  const query = searchQuery.trim();
  const searchedNumber = parseTrolleyCode(query);
  const visibleTrolleyNumbers = trolleyNumbers.filter(no => (
    (filterTab === 'all' || stateByNo.get(no) === filterTab)
    && (!query || no === searchedNumber || no.includes(query))
  ));
  const hasConflictingSelection = draftSelected.some(no => !stateByNo.has(no) || stateByNo.get(no) === 'busy');

  useEffect(() => {
    if (!pickerOpen) return undefined;
    const opener = document.activeElement;
    const picker = pickerRef.current;
    dialogRef.current?.focus({ preventScroll: true });
    return () => {
      const target = opener?.isConnected ? opener : picker?.querySelector('button[aria-pressed="true"]');
      target?.focus({ preventScroll: true });
    };
  }, [pickerOpen]);

  const openPicker = () => {
    setDraftSelected(selected);
    setError('');
    setSearchQuery('');
    setRequestedFilter(null);
    setPickerOpen(true);
    onOpenChange?.(true);
  };

  const closePicker = () => {
    setError('');
    setPickerOpen(false);
    onOpenChange?.(false);
  };

  const savePicker = () => {
    if (!availabilityReady || hasConflictingSelection) return;
    onSelectedChange(draftSelected);
    if (!hideModeSwitch && draftSelected.length === 0) onModeChange('none');
    closePicker();
  };

  const clearSelection = () => {
    setDraftSelected([]);
  };

  const toggleTrolley = (trolleyNo) => {
    const no = String(trolleyNo || '').trim();
    if (!no || disabled || !availabilityReady) return;
    if (draftSelected.includes(no)) {
      setDraftSelected(current => current.filter(item => item !== no));
      setError('');
      return;
    }
    const state = stateByNo.get(no);
    if (state === 'busy') {
      const occupied = reservedTrolleyByNo.get(no.toLowerCase()) || effectiveActiveTrolleyByNo.get(no.toLowerCase());
      setError(occupied
        ? t('entry.trolleyBusy', { no, client: occupied.client_name || '?' })
        : t('wash.fleet.inventory.unavailable', { trolley: formatTrolleyCode(no) }));
      return;
    }
    setError('');
    setDraftSelected(current => current.includes(no) ? current : [...current, no]);
  };

  const selectFilter = filter => {
    setRequestedFilter(filter);
    listRef.current?.scrollTo(0, 0);
  };

  const handleDialogKeyDown = event => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      closePicker();
    }
    if (event.key !== 'Tab') return;
    const focusable = event.currentTarget.querySelectorAll('button:not(:disabled), input:not(:disabled)');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  useBarcodeScanner({
    enabled: mode === 'trolley' && pickerOpen && availabilityReady && !disabled,
    onScan: (scannedCode, event) => {
      event.preventDefault();
      const no = parseTrolleyCode(scannedCode);
      if (!no) {
        setError(t('entry.trolleyScanUnknown', { code: scannedCode }));
        return;
      }
      if (!trolleyNumbers.includes(no)) {
        setError(t('entry.trolleyInvalid', { max: effectiveTrolleyCount }));
        return;
      }
      toggleTrolley(no);
    },
  });

  return (
    <div className="live-arrival-trolleys" ref={pickerRef}>
      {!hideModeSwitch && (
        <>
          {!modeLabelId && <div className="live-entry-field-label">{t('entry.trolleys')}</div>}

          <div className="live-arrival-trolley-mode" role="group" aria-labelledby={modeLabelId} aria-label={modeLabelId ? undefined : t('entry.trolleys')}>
            <button
              type="button"
              aria-pressed={mode === 'trolley'}
              onClick={() => {
                onModeChange('trolley');
                if (selected.length === 0) openPicker();
              }}
              disabled={disabled}
            >
              <ShoppingCart size={16} aria-hidden="true" />
              {t('entry.trolleyModeNumbered')}
            </button>
            <button
              type="button"
              aria-pressed={mode === 'none'}
              onClick={() => { onModeChange('none'); onSelectedChange([]); setError(''); }}
              disabled={disabled}
            >
              <Package size={16} aria-hidden="true" />
              {t('entry.trolleyModeNone')}
            </button>
          </div>
        </>
      )}

      {mode === 'trolley' ? (
        <button
          type="button"
          className={`live-arrival-trolley-trigger${selected.length > 0 ? ' has-selection' : ''}`}
          onClick={openPicker}
          disabled={disabled}
        >
          <span className="live-arrival-trolley-trigger-icon"><ShoppingCart size={19} /></span>
          <span className="live-arrival-trolley-trigger-copy">
            <strong>{selected.length > 0 ? t('entry.trolleySelected', { count: selected.length }) : (triggerLabel || t('entry.trolleyChoose'))}</strong>
            <small>{selected.length > 0 ? selected.map(formatTrolleyCode).join(', ') : (triggerHint || t('entry.trolleyChooseHint'))}</small>
          </span>
          <ChevronRight size={19} aria-hidden="true" />
        </button>
      ) : (
        <div className="live-arrival-trolley-none">
          {t('entry.trolleyNoneHint')}
        </div>
      )}

      {error && !pickerOpen && <div className="ap-error live-arrival-trolley-error">{error}</div>}

      {pickerOpen && typeof document !== 'undefined' && createPortal(
        <div className="ap-overlay live-trolley-picker-overlay" onClick={closePicker}>
          <div
            className="ap-sheet live-trolley-picker-sheet"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            onClick={event => event.stopPropagation()}
            onKeyDown={handleDialogKeyDown}
          >
            <header className="live-trolley-picker-header">
              <div>
                <h2 id={titleId} className="live-trolley-picker-title">{t('entry.trolleyPickerTitle')}</h2>
                {clientName && <p className="live-trolley-picker-subtitle">{clientName}</p>}
              </div>
              <button type="button" className="live-trolley-picker-close" onClick={closePicker} aria-label={t('common.close')}>
                <X size={18} aria-hidden="true" />
              </button>
            </header>

            {availabilityReady && (
              <div className="live-trolley-picker-toolbar">
                <div className="live-trolley-search-box">
                  <Search size={16} className="live-trolley-search-icon" aria-hidden="true" />
                  <input
                    type="text"
                    className="live-trolley-search-input"
                    aria-label={t('entry.trolleySearchPlaceholder')}
                    placeholder={t('entry.trolleySearchPlaceholder')}
                    value={searchQuery}
                    onChange={event => {
                      const nextQuery = event.target.value;
                      setSearchQuery(nextQuery);
                      if (nextQuery.trim()) selectFilter('all');
                    }}
                  />
                  {searchQuery && (
                    <button type="button" className="live-trolley-search-clear" onClick={() => setSearchQuery('')} aria-label={t('entry.trolleyClearSearch')}>
                      <X size={16} aria-hidden="true" />
                    </button>
                  )}
                </div>
                <div className="live-trolley-filter-chips" role="group" aria-label={t('entry.trolleyFilters')}>
                  {[
                    ...(purpose === 'pack' ? [] : [['returning', t('entry.trolleyAtClientCount', { count: counts.returning })]]),
                    ['free', t(purpose === 'pack' ? 'entry.trolleyAvailableCount' : 'entry.trolleyOtherAvailableCount', { count: counts.free })],
                    ['all', t('entry.trolleyAllCount', { count: trolleyNumbers.length })],
                    ['busy', t('entry.trolleyOccupiedCount', { count: counts.busy })],
                  ].map(([filter, label]) => (
                    <button key={filter} type="button" className="live-trolley-chip" aria-pressed={filterTab === filter} onClick={() => selectFilter(filter)}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {availabilityReady && (
              <div className="live-trolley-picker-selection">
                <div className="live-trolley-selection-title">
                  {t(purpose === 'pack' ? 'entry.trolleySelectedCount' : 'entry.trolleySelectedForPickup', { count: draftSelected.length })}
                </div>
                <div className="live-trolley-selection-list">
                  {draftSelected.map(no => {
                    const code = formatTrolleyCode(no);
                    return (
                      <button key={no} type="button" className="live-trolley-selection-chip" disabled={disabled} aria-label={t('entry.trolleyRemove', { no: code })} onClick={() => toggleTrolley(no)}>
                        {code}
                        {purpose !== 'pack' && stateByNo.get(no) === 'free' && <small>{t('entry.trolleySelectedManually')}</small>}
                        <X size={13} aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="live-trolley-picker-content" ref={listRef}>
              {workflowError ? (
                <div className="live-trolley-picker-error" role="alert">
                  <p>{t('entry.trolleyAvailabilityError')}</p>
                  <button type="button" className="ap-btn ap-btn-secondary" onClick={refresh}>{t('common.refresh')}</button>
                </div>
              ) : !availabilityReady ? (
                <div className="live-trolley-picker-note" role="status">{t('entry.trolleyLoading')}</div>
              ) : (
                <>
                  {hasConflictingSelection && <div className="live-trolley-picker-error" role="alert">{t('entry.trolleySelectionChanged')}</div>}
                  {error && <div className="live-trolley-picker-error" role="alert">{error}</div>}

                  {purpose !== 'pack' && filterTab === 'free' && !query && (
                    <div className="live-trolley-picker-note">
                      {counts.returning === 0 && <strong>{t('entry.trolleyAtClientEmpty')}</strong>}
                      {t('entry.trolleyOtherHint')}
                    </div>
                  )}
                  {filterTab === 'all' && visibleTrolleyNumbers.length > 0 && (
                    <div className="live-arrival-trolley-legend">
                      <span><i className="is-free" aria-hidden="true" />{t('entry.trolleyLegendFree')}</span>
                      {purpose !== 'pack' && <span><i className="is-returning" aria-hidden="true" />{t('entry.trolleyLegendReturning')}</span>}
                      <span><i className="is-busy" aria-hidden="true" />{t('entry.trolleyLegendBusy')}</span>
                    </div>
                  )}

                  {visibleTrolleyNumbers.length > 0 ? (
                    <div className="live-arrival-trolley-grid" role="group" aria-label={t('entry.trolleys')}>
                      {visibleTrolleyNumbers.map(no => {
                        const state = draftSelected.includes(no) ? 'selected' : stateByNo.get(no);
                        const occupied = reservedTrolleyByNo.get(no) || effectiveActiveTrolleyByNo.get(no);
                        const label = state === 'busy'
                          ? occupied
                            ? t('entry.trolleyBusy', { no, client: occupied.client_name || '?' })
                            : t('wash.fleet.inventory.unavailable', { trolley: formatTrolleyCode(no) })
                          : state === 'returning' ? t('entry.trolleyAtClient', { no, client: clientName }) : no;
                        return (
                          <button
                            key={no}
                            type="button"
                            className={`live-arrival-trolley-cell is-${state}`}
                            onClick={() => toggleTrolley(no)}
                            disabled={disabled || state === 'busy'}
                            aria-pressed={state === 'selected'}
                            aria-label={label}
                            title={state === 'free' ? t('entry.trolleyFree', { no }) : label}
                          >
                            {state === 'selected' && <Check size={14} aria-hidden="true" />}
                            {no}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="live-trolley-picker-note">
                      {filterTab === 'returning' && !query ? (
                        <>
                          <strong>{t('entry.trolleyAtClientEmpty')}</strong>
                          {counts.free > 0 && (
                            <button type="button" className="live-trolley-picker-link" onClick={() => selectFilter('free')}>
                              {t('entry.trolleyAddOther')}
                            </button>
                          )}
                        </>
                      ) : (
                        t(query ? 'entry.trolleyNoSearchResults'
                          : filterTab === 'busy' ? 'entry.trolleyNoneBusy' : 'entry.trolleyNoneAvailable')
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            <footer className="live-trolley-picker-footer">
              <button
                type="button"
                className="live-trolley-picker-clear-btn"
                onClick={clearSelection}
                disabled={disabled || draftSelected.length === 0}
                title={t('entry.trolleyClearSelection')}
              >
                {t('common.clear')}
              </button>
              <button
                type="button"
                className="live-trolley-picker-save-btn"
                onClick={savePicker}
                disabled={disabled || !availabilityReady || hasConflictingSelection}
              >
                {draftSelected.length > 0 && <Check size={16} aria-hidden="true" />}
                {draftSelected.length > 0
                  ? t('entry.trolleyDoneCount', { count: draftSelected.length })
                  : t('entry.trolleyDoneEmpty')}
              </button>
            </footer>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
