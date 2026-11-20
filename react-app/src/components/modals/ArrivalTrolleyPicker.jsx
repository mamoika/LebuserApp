import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronRight, Package, ScanBarcode, Search, ShoppingCart, Sparkles, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLaundryWorkflow } from '../../hooks/useLaundryWorkflow';
import { activePhysicalTrolleyCycles } from '../../lib/trolleyOccupancy';
import { trolleysAtClient, trolleyCellState, visibleArrivalTrolleyNumbers } from '../../lib/arrivalTrolleyAvailability';
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
  entryId,
  disabled = false,
  purpose = 'pickup',
  hideModeSwitch = false,
  triggerLabel,
  triggerHint,
  activeTrolleyByNo: externalActiveTrolleyByNo,
  trolleyCount: externalTrolleyCount,
}) {
  const { t } = useTranslation();
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftSelected, setDraftSelected] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState(() => purpose === 'pack' ? 'free' : 'returning');

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

  const returningTrolleys = useMemo(
    () => purpose === 'pack'
      ? []
      : trolleysAtClient(trolleyNumbers, effectiveActiveTrolleyByNo, clientName)
        .filter(no => !reservedTrolleyByNo.has(no.toLowerCase())),
    [purpose, trolleyNumbers, effectiveActiveTrolleyByNo, clientName, reservedTrolleyByNo]
  );

  const visibleTrolleyNumbers = useMemo(
    () => {
      return trolleyNumbers.filter(no => {
        if (searchQuery.trim() && !no.includes(searchQuery.trim())) return false;
        const state = trolleyCellState(no, draftSelected, effectiveActiveTrolleyByNo, effectiveClientName, reservedTrolleyByNo);
        if (filterTab === 'returning') {
          return returningTrolleys.includes(no);
        }
        if (filterTab === 'selected') {
          return draftSelected.includes(no);
        }
        if (filterTab === 'free') {
          return state === 'free' || state === 'selected';
        }
        if (filterTab === 'busy') return state === 'busy';
        return true;
      });
    },
    [trolleyNumbers, draftSelected, effectiveActiveTrolleyByNo, effectiveClientName, reservedTrolleyByNo, returningTrolleys, searchQuery, filterTab],
  );

  const availableTrolleyCount = useMemo(() => visibleArrivalTrolleyNumbers(
    trolleyNumbers,
    draftSelected,
    effectiveActiveTrolleyByNo,
    effectiveClientName,
    reservedTrolleyByNo,
  ).length, [trolleyNumbers, draftSelected, effectiveActiveTrolleyByNo, effectiveClientName, reservedTrolleyByNo]);

  const occupiedTrolleyCount = useMemo(() => trolleyNumbers.filter(no => (
    trolleyCellState(no, draftSelected, effectiveActiveTrolleyByNo, effectiveClientName, reservedTrolleyByNo) === 'busy'
  )).length, [trolleyNumbers, draftSelected, effectiveActiveTrolleyByNo, effectiveClientName, reservedTrolleyByNo]);

  const otherAvailableTrolleyCount = useMemo(() => trolleyNumbers.filter(no => (
    trolleyCellState(no, draftSelected, effectiveActiveTrolleyByNo, effectiveClientName, reservedTrolleyByNo) === 'free'
  )).length, [trolleyNumbers, draftSelected, effectiveActiveTrolleyByNo, effectiveClientName, reservedTrolleyByNo]);

  const hasConflictingSelection = draftSelected.some(no => (
    trolleyCellState(no, [], effectiveActiveTrolleyByNo, effectiveClientName, reservedTrolleyByNo) === 'busy'
  ));

  const openPicker = () => {
    setDraftSelected(selected);
    setError('');
    setSearchQuery('');
    setFilterTab(purpose === 'pack' ? 'free' : 'returning');
    setPickerOpen(true);
  };

  const closePicker = () => {
    setError('');
    setPickerOpen(false);
  };

  const savePicker = () => {
    if (!availabilityReady || hasConflictingSelection) return;
    onSelectedChange(draftSelected);
    closePicker();
  };

  const selectAllReturning = () => {
    const toAdd = returningTrolleys.filter(no => !draftSelected.includes(no));
    if (toAdd.length > 0) {
      setDraftSelected([...draftSelected, ...toAdd]);
    }
  };

  const clearSelection = () => {
    setDraftSelected([]);
  };

  const toggleTrolley = (trolleyNo) => {
    const no = String(trolleyNo || '').trim();
    if (!no || disabled || !availabilityReady) return;
    if (draftSelected.includes(no)) {
      setDraftSelected(draftSelected.filter(item => item !== no));
      return;
    }
    const state = trolleyCellState(no, [], effectiveActiveTrolleyByNo, effectiveClientName, reservedTrolleyByNo);
    if (state === 'busy') {
      const occupied = reservedTrolleyByNo.get(no.toLowerCase()) || effectiveActiveTrolleyByNo.get(no.toLowerCase());
      setError(t('entry.trolleyBusy', { no, client: occupied?.client_name || '?' }));
      return;
    }
    setError('');
    setDraftSelected([...draftSelected, no]);
  };

  useBarcodeScanner({
    enabled: mode === 'trolley' && pickerOpen && availabilityReady && !disabled,
    onScan: (scannedCode) => {
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
      if (purpose !== 'pack' && !returningTrolleys.includes(no)) setFilterTab('selected');
    },
  });

  return (
    <div className="live-arrival-trolleys">
      {!hideModeSwitch && (
        <>
          <div className="live-entry-field-label">{t('entry.trolleys')}</div>

          <div className="live-arrival-trolley-mode" role="group" aria-label={t('entry.trolleys')}>
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
        <div className="ap-overlay live-trolley-picker-overlay" style={{ display: 'flex' }} onClick={closePicker}>
          <div className="ap-sheet live-trolley-picker-sheet" onClick={event => event.stopPropagation()}>
            <div className="ap-handle" />
            <div className="live-trolley-picker-header">
              <div>
                <div className="live-trolley-picker-title">
                  <ShoppingCart size={18} style={{ color: '#007AFF' }} />
                  <span>{t('entry.trolleyPickerTitle')}</span>
                </div>
                <div className="live-trolley-picker-subtitle">
                  <span>{clientName || t('entry.client')}</span>
                  {draftSelected.length > 0 && (
                    <span className="live-trolley-badge">{t('entry.trolleySelectedCount', { count: draftSelected.length })}</span>
                  )}
                </div>
              </div>
              <button type="button" className="live-trolley-picker-close" onClick={closePicker} aria-label={t('common.close')}>
                <X size={16} />
              </button>
            </div>

            {/* Pasek wyszukiwania i zakładek filtrów */}
            {availabilityReady && <div className="live-trolley-picker-toolbar">
              <div className="live-trolley-search-box">
                <Search size={14} className="live-trolley-search-icon" />
                <input
                  type="text"
                  className="live-trolley-search-input"
                  placeholder={t('entry.trolleySearchPlaceholder')}
                  value={searchQuery}
                  onChange={e => {
                    const nextQuery = e.target.value;
                    setSearchQuery(nextQuery);
                    if (purpose !== 'pack' && nextQuery.trim() && filterTab === 'returning') {
                      setFilterTab('free');
                    }
                  }}
                />
                {searchQuery && (
                  <button type="button" className="live-trolley-search-clear" onClick={() => setSearchQuery('')}>
                    <X size={14} />
                  </button>
                )}
              </div>
              <div className="live-trolley-filter-chips">
                {purpose !== 'pack' && (
                  <button
                    type="button"
                    className={`live-trolley-chip is-client${filterTab === 'returning' ? ' is-active' : ''}`}
                    onClick={() => { setFilterTab('returning'); setSearchQuery(''); }}
                  >
                    {t('entry.trolleyAtClientCount', { count: returningTrolleys.length })}
                  </button>
                )}
                <button
                  type="button"
                  className={`live-trolley-chip${filterTab === 'free' ? ' is-active' : ''}`}
                  onClick={() => setFilterTab('free')}
                >
                  {purpose === 'pack'
                    ? t('entry.trolleyAvailableCount', { count: availableTrolleyCount })
                    : t('entry.trolleyOtherAvailableCount', { count: otherAvailableTrolleyCount })}
                </button>
                <button
                  type="button"
                  className={`live-trolley-chip${filterTab === 'all' ? ' is-active' : ''}`}
                  onClick={() => setFilterTab('all')}
                >
                  {t('entry.trolleyAllCount', { count: trolleyNumbers.length })}
                </button>
                {occupiedTrolleyCount > 0 && (
                  <button
                    type="button"
                    className={`live-trolley-chip is-busy${filterTab === 'busy' ? ' is-active' : ''}`}
                    onClick={() => setFilterTab('busy')}
                  >
                    {t('entry.trolleyOccupiedCount', { count: occupiedTrolleyCount })}
                  </button>
                )}
                <button
                  type="button"
                  className={`live-trolley-chip${filterTab === 'selected' ? ' is-active' : ''}`}
                  onClick={() => setFilterTab('selected')}
                  style={filterTab === 'selected' ? {} : { color: '#007AFF', borderColor: 'rgba(0,122,255,0.2)' }}
                >
                  {t('entry.trolleySelectedCount', { count: draftSelected.length })}
                </button>
              </div>
            </div>}

            <div className="live-trolley-picker-content">
              {workflowError ? (
                <div className="ap-error live-arrival-trolley-error" role="alert">
                  <p>{t('entry.trolleyAvailabilityError')}</p>
                  <button type="button" className="ap-btn ap-btn-secondary" onClick={refresh}>{t('common.refresh')}</button>
                </div>
              ) : !availabilityReady ? (
                <div className="live-arrival-trolley-skeleton" aria-hidden="true">
                  {Array.from({ length: 15 }, (_, i) => <span key={i} />)}
                </div>
              ) : (
                <>
                  {/* Najpierw fizyczny stan klienta; pełna lista jest korektą awaryjną. */}
                  {purpose !== 'pack' && filterTab === 'returning' && !searchQuery && (
                    <div className="live-arrival-trolley-returning">
                      <div className="live-arrival-trolley-returning-head">
                        <div className="live-arrival-trolley-returning-label">
                          <Sparkles size={13} />
                          <span>{t('entry.trolleyReturningFromClient')}</span>
                        </div>
                        {returningTrolleys.length > 0 && returningTrolleys.some(no => !draftSelected.includes(no)) ? (
                          <button
                            type="button"
                            className="live-arrival-trolley-select-all"
                            onClick={selectAllReturning}
                          >
                            {t('entry.trolleySelectAll', { count: returningTrolleys.length })}
                          </button>
                        ) : returningTrolleys.length > 0 ? (
                          <span style={{ fontSize: '11px', color: '#248A3D', fontWeight: 600 }}>{t('entry.trolleyAllSelected')} ✓</span>
                        ) : null}
                      </div>
                      <p className="live-arrival-trolley-returning-copy">
                        {returningTrolleys.length > 0
                          ? t('entry.trolleyAtClientHint', { client: clientName })
                          : t('entry.trolleyAtClientEmpty', { client: clientName })}
                      </p>
                      <button
                        type="button"
                        className="live-arrival-trolley-add-other"
                        onClick={() => setFilterTab('free')}
                      >
                        {t('entry.trolleyAddOther')}
                      </button>
                    </div>
                  )}

                  {visibleTrolleyNumbers.length > 0 ? (
                    <div className="live-arrival-trolley-grid" role="group" aria-label={t('entry.trolleys')}>
                      {visibleTrolleyNumbers.map(no => {
                        const state = trolleyCellState(no, draftSelected, effectiveActiveTrolleyByNo, effectiveClientName, reservedTrolleyByNo);
                        return (
                          <button
                            key={no}
                            type="button"
                            className={`live-arrival-trolley-cell is-${state}`}
                            onClick={() => toggleTrolley(no)}
                            disabled={disabled || state === 'busy'}
                            aria-pressed={state === 'selected'}
                            aria-label={state === 'busy'
                              ? t('entry.trolleyBusy', { no, client: (reservedTrolleyByNo.get(no.toLowerCase()) || effectiveActiveTrolleyByNo.get(no.toLowerCase()))?.client_name || '?' })
                              : undefined}
                            title={
                              state === 'returning' ? t('entry.trolleyAtClient', { no, client: clientName })
                                : state === 'busy' ? t('entry.trolleyBusy', { no, client: (reservedTrolleyByNo.get(no.toLowerCase()) || effectiveActiveTrolleyByNo.get(no.toLowerCase()))?.client_name || '?' })
                                  : t('entry.trolleyFree', { no })
                            }
                          >
                            {state === 'selected' && <Check size={14} />}
                            {no}
                          </button>
                        );
                      })}
                    </div>
                  ) : filterTab === 'returning' ? null : (
                    <div className="live-arrival-trolley-none">
                      {searchQuery || filterTab !== 'all'
                        ? t('entry.trolleyNoSearchResults')
                        : t('entry.trolleyNoneAvailable')}
                    </div>
                  )}

                  <div className="live-arrival-trolley-legend">
                    <span className="live-arrival-trolley-legend-item">
                      <span className="live-arrival-trolley-legend-dot" />
                      {t('entry.trolleyLegendFree')}
                    </span>
                    {purpose !== 'pack' && (
                      <span className="live-arrival-trolley-legend-item">
                        <span className="live-arrival-trolley-legend-dot is-returning" />
                        {t('entry.trolleyLegendReturning')}
                      </span>
                    )}
                    <span className="live-arrival-trolley-legend-item">
                      <span className="live-arrival-trolley-legend-dot is-selected" />
                      {t('entry.trolleyLegendSelected')}
                    </span>
                    <span className="live-arrival-trolley-legend-item">
                      <span className="live-arrival-trolley-legend-dot is-busy" />
                      {t('entry.trolleyLegendBusy')}
                    </span>
                  </div>

                  <div className="live-arrival-trolley-scan-hint">
                    <ScanBarcode size={15} aria-hidden="true" style={{ color: '#007AFF', flexShrink: 0 }} />
                    <span>{t('entry.trolleyScanHintShort')}</span>
                  </div>

                  {hasConflictingSelection && <div className="ap-error live-arrival-trolley-error" role="alert">{t('entry.trolleySelectionChanged')}</div>}
                  {error && <div className="ap-error live-arrival-trolley-error">{error}</div>}
                </>
              )}
            </div>

            <div className="live-trolley-picker-footer">
              {draftSelected.length > 0 && (
                <button
                  type="button"
                  className="live-trolley-picker-clear-btn"
                  onClick={clearSelection}
                  title={t('entry.trolleyClearSelection')}
                >
                  {t('common.clear')}
                </button>
              )}
              <button
                type="button"
                className="live-trolley-picker-save-btn"
                onClick={savePicker}
                disabled={disabled || !availabilityReady || hasConflictingSelection}
              >
                {draftSelected.length > 0 ? (
                  <>
                    <Check size={16} />
                    <span>{t('entry.trolleyDoneCount', { count: draftSelected.length })}</span>
                  </>
                ) : (
                  <span>{t('entry.trolleyDoneEmpty')}</span>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
