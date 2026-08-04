import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, ScanBarcode, ShoppingCart, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getLaundryWorkflow } from '../../lib/laundryRpc';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';

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

function trolleyCellState(no, selected, activeTrolleyByNo, clientName) {
  if (selected.includes(no)) return 'selected';
  const active = activeTrolleyByNo.get(no.toLowerCase());
  if (!active) return 'free';
  if (active.status === 'at_client' && active.client_name === clientName) return 'returning';
  return 'busy';
}

export default function ArrivalTrolleyPicker({
  sessionToken,
  clientName,
  mode,
  onModeChange,
  selected,
  onSelectedChange,
  disabled = false,
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [trolleyCount, setTrolleyCount] = useState(DEFAULT_TROLLEY_COUNT);
  const [activeTrolleyByNo, setActiveTrolleyByNo] = useState(new Map());
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftSelected, setDraftSelected] = useState([]);

  useEffect(() => {
    let cancelled = false;
    if (!sessionToken) {
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    (async () => {
      try {
        const wf = await getLaundryWorkflow(sessionToken);
        if (cancelled) return;
        const count = Number(wf?.trolley_count || DEFAULT_TROLLEY_COUNT);
        const map = new Map();
        (wf?.trolleys || []).forEach(cycle => {
          if (!cycle?.returned_at && !['returned', 'canceled'].includes(cycle.status)) {
            map.set(String(cycle.trolley_no || '').trim().toLowerCase(), cycle);
          }
        });
        setTrolleyCount(Math.max(1, count));
        setActiveTrolleyByNo(map);
      } catch {
        if (!cancelled) {
          setTrolleyCount(DEFAULT_TROLLEY_COUNT);
          setActiveTrolleyByNo(new Map());
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionToken]);

  const trolleyNumbers = useMemo(
    () => Array.from({ length: trolleyCount }, (_, index) => String(index + 1)),
    [trolleyCount]
  );

  const returningTrolleys = useMemo(
    () => trolleyNumbers.filter(no => {
      const active = activeTrolleyByNo.get(no.toLowerCase());
      return active?.status === 'at_client' && active.client_name === clientName;
    }),
    [trolleyNumbers, activeTrolleyByNo, clientName]
  );

  const openPicker = () => {
    setDraftSelected(selected);
    setError('');
    setPickerOpen(true);
  };

  const closePicker = () => {
    setError('');
    setPickerOpen(false);
  };

  const savePicker = () => {
    onSelectedChange(draftSelected);
    closePicker();
  };

  const toggleTrolley = (trolleyNo) => {
    const no = String(trolleyNo || '').trim();
    if (!no || disabled) return;
    const state = trolleyCellState(no, draftSelected, activeTrolleyByNo, clientName);
    if (state === 'busy') {
      const active = activeTrolleyByNo.get(no.toLowerCase());
      setError(t('entry.trolleyBusy', { no, client: active?.client_name || '?' }));
      return;
    }
    setError('');
    if (draftSelected.includes(no)) {
      setDraftSelected(draftSelected.filter(item => item !== no));
      return;
    }
    setDraftSelected([...draftSelected, no]);
  };

  useBarcodeScanner({
    enabled: mode === 'trolley' && pickerOpen && !disabled,
    onScan: (scannedCode) => {
      const match = scannedCode.match(/^TRL-(\d+)$/i);
      if (!match) {
        setError(t('entry.trolleyScanUnknown', { code: scannedCode }));
        return;
      }
      const no = match[1];
      if (!trolleyNumbers.includes(no)) {
        setError(t('entry.trolleyInvalid', { max: trolleyCount }));
        return;
      }
      toggleTrolley(no);
    },
  });

  return (
    <div className="live-arrival-trolleys">
      <div className="live-entry-field-label">{t('entry.trolleys')}</div>

      <div className="segmented-control live-arrival-trolley-mode">
        <button
          type="button"
          className={`seg-btn${mode === 'none' ? ' active' : ''}`}
          onClick={() => { onModeChange('none'); onSelectedChange([]); setError(''); }}
          disabled={disabled}
        >
          {t('entry.trolleyModeNone')}
        </button>
        <button
          type="button"
          className={`seg-btn${mode === 'trolley' ? ' active' : ''}`}
          onClick={() => {
            onModeChange('trolley');
            if (selected.length === 0) openPicker();
          }}
          disabled={disabled}
        >
          {t('entry.trolleyModeNumbered')}
        </button>
      </div>

      {mode === 'trolley' ? (
        <button
          type="button"
          className={`live-arrival-trolley-trigger${selected.length > 0 ? ' has-selection' : ''}`}
          onClick={openPicker}
          disabled={disabled}
        >
          <span className="live-arrival-trolley-trigger-icon"><ShoppingCart size={19} /></span>
          <span className="live-arrival-trolley-trigger-copy">
            <strong>{selected.length > 0 ? t('entry.trolleySelected', { count: selected.length }) : t('entry.trolleyChoose')}</strong>
            <small>{selected.length > 0 ? formatTrolleyNos(selected) : t('entry.trolleyChooseHint')}</small>
          </span>
          <ChevronRight size={19} aria-hidden="true" />
        </button>
      ) : (
        <div className="live-arrival-trolley-none">
          {t('entry.trolleyNoneHint')}
        </div>
      )}

      {error && !pickerOpen && <div className="ap-error live-arrival-trolley-error">{error}</div>}

      {pickerOpen && (
        <div className="ap-overlay live-trolley-picker-overlay" style={{ display: 'flex' }} onClick={closePicker}>
          <div className="ap-sheet live-trolley-picker-sheet" onClick={event => event.stopPropagation()}>
            <div className="ap-handle" />
            <div className="live-trolley-picker-header">
              <div>
                <div className="live-trolley-picker-title">{t('entry.trolleyPickerTitle')}</div>
                <div className="live-trolley-picker-subtitle">
                  {clientName} · {t('entry.trolleySelected', { count: draftSelected.length })}
                </div>
              </div>
              <button type="button" className="live-trolley-picker-close" onClick={closePicker} aria-label={t('common.close')}>
                <X size={18} />
              </button>
            </div>

            <div className="live-trolley-picker-content">
              {loading ? (
                <div className="live-arrival-trolley-skeleton" aria-hidden="true">
                  {Array.from({ length: 15 }, (_, i) => <span key={i} />)}
                </div>
              ) : (
                <>
                  {returningTrolleys.length > 0 && (
                    <div className="live-arrival-trolley-returning">
                      <div className="live-arrival-trolley-returning-label">{t('entry.trolleyReturningFromClient')}</div>
                      <div className="live-arrival-trolley-returning-row">
                        {returningTrolleys.map(no => (
                          <button
                            key={no}
                            type="button"
                            className={`live-arrival-trolley-return-btn${draftSelected.includes(no) ? ' is-selected' : ''}`}
                            onClick={() => toggleTrolley(no)}
                            disabled={disabled}
                          >
                            {draftSelected.includes(no) && <Check size={14} />}
                            {no}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="live-arrival-trolley-grid" role="group" aria-label={t('entry.trolleys')}>
                    {trolleyNumbers.map(no => {
                      const state = trolleyCellState(no, draftSelected, activeTrolleyByNo, clientName);
                      return (
                        <button
                          key={no}
                          type="button"
                          className={`live-arrival-trolley-cell is-${state}`}
                          onClick={() => toggleTrolley(no)}
                          disabled={disabled || state === 'busy'}
                          aria-pressed={state === 'selected'}
                          title={
                            state === 'returning' ? t('entry.trolleyAtClient', { no, client: clientName })
                              : state === 'busy' ? t('entry.trolleyBusy', { no, client: activeTrolleyByNo.get(no.toLowerCase())?.client_name || '?' })
                                : t('entry.trolleyFree', { no })
                          }
                        >
                          {state === 'selected' && <Check size={14} />}
                          {no}
                        </button>
                      );
                    })}
                  </div>

                  <div className="live-arrival-trolley-legend">
                    <span className="live-arrival-trolley-legend-item is-free">{t('entry.trolleyLegendFree')}</span>
                    <span className="live-arrival-trolley-legend-item is-returning">{t('entry.trolleyLegendReturning')}</span>
                    <span className="live-arrival-trolley-legend-item is-selected">{t('entry.trolleyLegendSelected')}</span>
                  </div>

                  <div className="live-arrival-trolley-scan-hint">
                    <ScanBarcode size={16} aria-hidden="true" />
                    <span>{t('entry.trolleyScanHintShort')}</span>
                  </div>

                  {error && <div className="ap-error live-arrival-trolley-error">{error}</div>}
                </>
              )}
            </div>

            <div className="live-trolley-picker-footer">
              <button type="button" className="ap-btn ap-btn-primary" onClick={savePicker} disabled={disabled || draftSelected.length === 0}>
                {draftSelected.length > 0
                  ? t('entry.trolleyDoneCount', { count: draftSelected.length })
                  : t('entry.trolleyChooseRequired')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
