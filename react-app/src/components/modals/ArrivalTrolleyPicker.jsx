import { useEffect, useMemo, useState } from 'react';
import { ScanBarcode } from 'lucide-react';
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
    () => trolleyNumbers.filter(no => trolleyCellState(no, selected, activeTrolleyByNo, clientName) === 'returning'),
    [trolleyNumbers, selected, activeTrolleyByNo, clientName]
  );

  const toggleTrolley = (trolleyNo) => {
    const no = String(trolleyNo || '').trim();
    if (!no || disabled) return;
    const state = trolleyCellState(no, selected, activeTrolleyByNo, clientName);
    if (state === 'busy') {
      const active = activeTrolleyByNo.get(no.toLowerCase());
      setError(t('entry.trolleyBusy', { no, client: active?.client_name || '?' }));
      return;
    }
    setError('');
    if (selected.includes(no)) {
      onSelectedChange(selected.filter(item => item !== no));
      return;
    }
    onSelectedChange([...selected, no]);
  };

  useBarcodeScanner({
    enabled: mode === 'trolley' && !disabled,
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
          className={`seg-btn${mode === 'trolley' ? ' active' : ''}`}
          onClick={() => onModeChange('trolley')}
          disabled={disabled}
        >
          {t('entry.trolleyModeNumbered')}
        </button>
        <button
          type="button"
          className={`seg-btn${mode === 'none' ? ' active' : ''}`}
          onClick={() => { onModeChange('none'); onSelectedChange([]); setError(''); }}
          disabled={disabled}
        >
          {t('entry.trolleyModeNone')}
        </button>
      </div>

      {mode === 'trolley' ? (
        <div className="live-arrival-trolley-panel">
          {loading ? (
            <div className="live-arrival-trolley-skeleton" aria-hidden="true">
              {Array.from({ length: 10 }, (_, i) => <span key={i} />)}
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
                        className={`live-arrival-trolley-return-btn${selected.includes(no) ? ' is-selected' : ''}`}
                        onClick={() => toggleTrolley(no)}
                        disabled={disabled}
                      >
                        {no}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="live-arrival-trolley-grid" role="group" aria-label={t('entry.trolleys')}>
                {trolleyNumbers.map(no => {
                  const state = trolleyCellState(no, selected, activeTrolleyByNo, clientName);
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

              {selected.length > 0 && (
                <div className="live-arrival-trolley-summary">
                  {t('entry.trolleySelected', { count: selected.length })}
                  <strong>{formatTrolleyNos(selected)}</strong>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="live-arrival-trolley-none">
          {t('entry.trolleyNoneHint')}
        </div>
      )}

      {error && <div className="ap-error live-arrival-trolley-error">{error}</div>}
    </div>
  );
}
