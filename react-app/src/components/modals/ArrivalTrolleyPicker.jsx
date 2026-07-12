import { useEffect, useMemo, useState } from 'react';
import { ScanBarcode, ShoppingCart, Package, X } from 'lucide-react';
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
  return [...new Set(numbers.map(n => String(n).trim()).filter(Boolean))].sort((a, b) => Number(a) - Number(b)).join(', ');
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
  disabled = false,
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [trolleyCount, setTrolleyCount] = useState(DEFAULT_TROLLEY_COUNT);
  const [activeTrolleyByNo, setActiveTrolleyByNo] = useState(new Map());
  const [manualTrolley, setManualTrolley] = useState('');
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

  const canSelectTrolley = (no) => {
    if (selected.includes(no)) return false;
    const active = activeTrolleyByNo.get(no.toLowerCase());
    if (!active) return true;
    if (active.status === 'at_client' && active.client_name === clientName) return true;
    return false;
  };

  const trolleyOptionLabel = (no) => {
    const active = activeTrolleyByNo.get(no.toLowerCase());
    if (!active) return t('entry.trolleyFree', { no });
    if (active.status === 'at_client' && active.client_name === clientName) {
      return t('entry.trolleyAtClient', { no, client: clientName });
    }
    return t('entry.trolleyBusy', { no, client: active.client_name });
  };

  const addTrolley = (trolleyNo) => {
    const no = String(trolleyNo || '').trim();
    if (!no) return;
    if (!trolleyNumbers.includes(no)) {
      setError(t('entry.trolleyInvalid', { max: trolleyCount }));
      return;
    }
    if (!canSelectTrolley(no)) {
      const active = activeTrolleyByNo.get(no.toLowerCase());
      setError(active
        ? t('entry.trolleyBusy', { no, client: active.client_name })
        : t('entry.trolleyAlreadyAdded', { no }));
      return;
    }
    setError('');
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
      addTrolley(match[1]);
    },
  });

  const handleManualAdd = () => {
    if (!manualTrolley) {
      setError(t('entry.trolleyPickOne'));
      return;
    }
    addTrolley(manualTrolley);
    setManualTrolley('');
  };

  return (
    <div className="live-arrival-trolleys">
      <div className="live-entry-field-label">{t('entry.trolleys')}</div>

      <div className="live-arrival-trolley-tabs">
        <button
          type="button"
          className={`live-arrival-trolley-tab${mode === 'trolley' ? ' is-active' : ''}`}
          onClick={() => onModeChange('trolley')}
          disabled={disabled}
        >
          <ShoppingCart size={15} /> {t('entry.trolleyModeNumbered')}
        </button>
        <button
          type="button"
          className={`live-arrival-trolley-tab${mode === 'none' ? ' is-active' : ''}`}
          onClick={() => { onModeChange('none'); onSelectedChange([]); setError(''); }}
          disabled={disabled}
        >
          <Package size={15} /> {t('entry.trolleyModeNone')}
        </button>
      </div>

      {mode === 'trolley' ? (
        <div className="live-arrival-trolley-body">
          {loading ? (
            <div className="live-arrival-trolley-hint">{t('entry.trolleyLoading')}</div>
          ) : (
            <>
              <div className="live-arrival-trolley-scan">
                <ScanBarcode size={28} color="var(--text-tertiary)" />
                <div>
                  <div className="live-arrival-trolley-scan-title">{t('entry.trolleyScanTitle')}</div>
                  <div className="live-arrival-trolley-hint">{t('entry.trolleyScanHint')}</div>
                </div>
              </div>

              <div className="live-arrival-trolley-manual">
                <span className="live-arrival-trolley-manual-label">{t('entry.trolleyManual')}</span>
                <div className="live-arrival-trolley-manual-row">
                  <select
                    className="ap-input"
                    value={manualTrolley}
                    onChange={e => setManualTrolley(e.target.value)}
                    disabled={disabled}
                  >
                    <option value="">{t('entry.trolleyPickPlaceholder')}</option>
                    {trolleyNumbers.map(no => (
                      <option key={no} value={no} disabled={!canSelectTrolley(no)}>
                        {trolleyOptionLabel(no)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="ap-btn ap-btn-secondary"
                    onClick={handleManualAdd}
                    disabled={disabled || !manualTrolley}
                  >
                    {t('entry.trolleyAdd')}
                  </button>
                </div>
              </div>

              {selected.length > 0 && (
                <div className="live-arrival-trolley-chips">
                  <div className="live-arrival-trolley-chips-label">
                    {t('entry.trolleySelected', { count: selected.length })}
                  </div>
                  <div className="live-arrival-trolley-chip-row">
                    {selected.map(no => (
                      <div key={no} className="live-arrival-trolley-chip">
                        {no}
                        <button
                          type="button"
                          aria-label={t('entry.trolleyRemove', { no })}
                          onClick={() => onSelectedChange(selected.filter(item => item !== no))}
                          disabled={disabled}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
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
