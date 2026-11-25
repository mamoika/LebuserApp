import { useState, useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PackageCheck,
  X,
  ShoppingCart,
  Package,
  Clock,
  CheckCircle2,
  Archive,
  Scale,
  ScanBarcode,
} from 'lucide-react';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import { laundryActionErrorMessage } from '../../lib/laundryRpc';
import { canUseFreeTrolley } from '../../lib/trolleyOccupancy';
import { formatTrolleyCode, parseTrolleyCode } from '../../lib/trolleyCodes';
import ArrivalTrolleyPicker from './ArrivalTrolleyPicker';

export default function PackingModal({
  group,
  onClose,
  addingEmptyTrolleys = false,
  onPackMulti,
  onFinishPacking,
  workflowAvailable = true,
  workflowError = null,
  onRefreshAvailability,
  sessionToken,
  trolleyNumbers = [],
  trolleyInventory,
  activeTrolleyByNo = new Map(),
}) {
  const { t } = useTranslation();
  const [scannedTrolleys, setScannedTrolleys] = useState([]);
  const titleId = useId();
  const [error, setError] = useState('');
  const [isPacking, setIsPacking] = useState(false);
  const [packMode, setPackMode] = useState('trolley'); // 'trolley' | 'none'
  const [trolleyPickerOpen, setTrolleyPickerOpen] = useState(false);

  // Barcode scanner — dodaje zeskanowany wózek do bieżącej partii
  useBarcodeScanner({
    enabled: packMode === 'trolley' && workflowAvailable && !isPacking && !trolleyPickerOpen,
    onScan: (scannedCode) => {
      const trolleyNo = parseTrolleyCode(scannedCode);
      if (!trolleyNo) {
        setError(t('wash.packing.unknownCode', { code: scannedCode }));
        return;
      }
      
      if (!trolleyNumbers.includes(trolleyNo)) {
        setError(t('wash.packing.missingTrolley', { trolley: trolleyNo }));
        return;
      }
      
      const activeCycle = activeTrolleyByNo.get(trolleyNo.toLowerCase());
      if (activeCycle) {
        setError(t('wash.packing.occupied', { trolley: trolleyNo, client: activeCycle.client_name }));
        return;
      }
      if (!canUseFreeTrolley(trolleyNo, activeCycle, trolleyInventory)) {
        setError(t('wash.fleet.inventory.unavailable', { trolley: formatTrolleyCode(trolleyNo) }));
        return;
      }

      if (scannedTrolleys.includes(trolleyNo)) {
        setError(t('wash.packing.duplicate', { trolley: trolleyNo }));
        return;
      }
      
      setError('');
      setScannedTrolleys(prev => [...prev, trolleyNo]);
    }
  });

  const handleTrolleySelectionChange = (newSelected) => {
    setError('');
    setScannedTrolleys(newSelected);
  };

  const hasExistingCycles = group.cycles.length > 0;
  const canFinishOnly = !addingEmptyTrolleys && packMode === 'trolley' && scannedTrolleys.length === 0
    && group.washedIds.length > 0 && group.washedIds.every(id => group.cycles.some(cycle => cycle.entry_ids?.includes(id)));

  const handleConfirm = async (finish) => {
    if (!workflowAvailable || isPacking) return;
    const numbers = packMode === 'trolley' ? scannedTrolleys : ['brak'];
    if (!numbers.length && !(finish && canFinishOnly)) return;

    setError('');
    setIsPacking(true);
    try {
      if (!numbers.length) await onFinishPacking(group);
      else await onPackMulti(group, numbers, finish);
    } catch (err) {
      setError(laundryActionErrorMessage(err, t) || t('wash.packing.error'));
      setIsPacking(false);
    }
  };

  return (
    <div className="ap-overlay" style={{ display: 'flex' }} onClick={isPacking ? undefined : onClose}>
      <div
        className="ap-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '640px',
          width: '94vw',
          margin: 'auto',
          borderRadius: '24px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.28), 0 0 0 1px rgba(0, 0, 0, 0.08)',
        }}
      >
        <div className="ap-handle" />

        <div className="ap-content" style={{ overflowY: 'auto', padding: '20px 24px 28px' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
            <div>
              <div id={titleId} className="ap-title" style={{ textAlign: 'left', fontSize: '20px', fontWeight: 700, letterSpacing: '-0.015em' }}>
                {t(addingEmptyTrolleys ? 'wash.actions.addEmptyTrolleys' : 'wash.packing.title')}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px', fontWeight: 500 }}>
                <strong>{group.clientName}</strong>
                {group.route && <span style={{ marginLeft: 8, opacity: 0.8 }}>({group.route})</span>}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isPacking}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'var(--bg-tertiary)',
                border: 'none',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
                color: 'var(--text-secondary)',
              }}
              aria-label={t('common.close')}
            >
              <X size={18} />
            </button>
          </div>

          {/* Baner wagowy / stanowy */}
          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '12px 14px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(0, 122, 255, 0.1)',
                color: '#007AFF',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}>
                <Scale size={18} />
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {group.hasKnownWeight
                    ? t('wash.packing.batchWeight', { weight: group.kg })
                    : t('wash.packing.noWeightRequired', { client: group.clientName })}
                </div>
                {addingEmptyTrolleys && (
                  <div className="laundry-work-state">{t('wash.packing.emptyTrolleysHint')}</div>
                )}
              </div>
            </div>
          </div>

          {workflowError && (
            <div className="ap-error" role="alert">
              <p>{t('entry.trolleyAvailabilityError')}</p>
              <button type="button" className="ap-btn ap-btn-secondary" onClick={onRefreshAvailability}>{t('common.refresh')}</button>
            </div>
          )}
          {error && (
            <div
              className="ap-error"
              style={{
                marginBottom: 16,
                padding: '10px 14px',
                background: 'rgba(255, 59, 48, 0.1)',
                color: '#FF3B30',
                border: '1px solid rgba(255, 59, 48, 0.2)',
                borderRadius: 10,
                fontSize: '13px',
                fontWeight: 500,
              }}
            >
              {error}
            </div>
          )}

          {/* WÓZKI JUŻ SPAKOWANE DLA TEGO HOTELU (Wielu pakowaczy) */}
          {hasExistingCycles && (
            <div style={{
              background: 'rgba(52, 199, 89, 0.08)',
              border: '1px solid rgba(52, 199, 89, 0.25)',
              borderRadius: '14px',
              padding: '14px 16px',
              marginBottom: '18px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, color: '#248A3D' }}>
                  <Archive size={15} />
                  <span>{t('wash.packing.alreadyPackedTitle')}</span>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {group.cycles.map(cycle => (
                  <div
                    key={cycle.id || cycle.trolley_no}
                    style={{
                      background: 'var(--bg-card-solid)',
                      padding: '5px 10px',
                      borderRadius: '8px',
                      border: '1px solid rgba(52, 199, 89, 0.3)',
                      fontSize: '12px',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      color: 'var(--text-primary)',
                    }}
                    className="tabular-nums"
                  >
                    <CheckCircle2 size={13} style={{ color: '#34C759' }} />
                    <strong>{cycle.trolley_no === 'brak' ? t('wash.packing.loose') : formatTrolleyCode(cycle.trolley_no)}</strong>
                    {cycle.packed_by && <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>({cycle.packed_by})</span>}
                  </div>
                ))}
              </div>

              {!addingEmptyTrolleys && (
                <p style={{ margin: '8px 0 0', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                  {t('wash.packing.multiPersonNote')}
                </p>
              )}
            </div>
          )}

          {/* Segmented Control / Tryb pakowania */}
          {!addingEmptyTrolleys && (
          <div style={{ display: 'flex', background: 'var(--bg-tertiary)', padding: '4px', borderRadius: '10px', marginBottom: '16px' }}>
            <button
              type="button"
              onClick={() => { setPackMode('trolley'); setError(''); }}
              style={{
                flex: 1, padding: '8px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                fontWeight: 600, fontSize: '13px',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                background: packMode === 'trolley' ? 'var(--bg-card-solid)' : 'transparent',
                color: packMode === 'trolley' ? 'var(--text-primary)' : 'var(--text-secondary)',
                boxShadow: packMode === 'trolley' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <ShoppingCart size={15} /> {t('wash.packing.toTrolleys')}
            </button>
            <button
              type="button"
              onClick={() => { setPackMode('none'); setError(''); }}
              style={{
                flex: 1, padding: '8px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                fontWeight: 600, fontSize: '13px',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                background: packMode === 'none' ? 'var(--bg-card-solid)' : 'transparent',
                color: packMode === 'none' ? 'var(--text-primary)' : 'var(--text-secondary)',
                boxShadow: packMode === 'none' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <Package size={15} /> {t('wash.packing.loose')}
            </button>
          </div>
          )}

          {/* Główna sekcja wyboru wózków / pakowania */}
          {packMode === 'trolley' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Baner skanera kodów kreskowych (zawsze aktywny automatycznie) */}
              <div style={{
                background: 'rgba(0, 122, 255, 0.04)',
                border: '1px solid rgba(0, 122, 255, 0.16)',
                borderRadius: '14px',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}>
                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'rgba(0, 122, 255, 0.1)',
                  color: '#007AFF',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                }}>
                  <ScanBarcode size={20} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <strong style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {t('wash.packing.scannerReady')}
                    </strong>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '1px 7px',
                      borderRadius: '999px',
                      fontSize: '10px',
                      fontWeight: 700,
                      background: 'rgba(52, 199, 89, 0.14)',
                      color: '#248A3D',
                    }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34C759' }} />
                      {t('wash.packing.scannerLive')}
                    </span>
                  </div>
                  <p style={{ margin: '3px 0 0', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                    {t('wash.packing.scannerInstruction')}
                  </p>
                </div>
              </div>

              {/* Ręczny wybór wózków dla osoby bez skanera (siatka floty 1-90) */}
              <ArrivalTrolleyPicker
                sessionToken={sessionToken}
                clientName={group.clientName}
                mode="trolley"
                onModeChange={() => {}}
                selected={scannedTrolleys}
                onSelectedChange={handleTrolleySelectionChange}
                onOpenChange={setTrolleyPickerOpen}
                activeTrolleyByNo={activeTrolleyByNo}
                trolleyCount={trolleyNumbers.length}
                purpose="pack"
                hideModeSwitch={true}
                triggerLabel={t('wash.packing.chooseTrolleysButton')}
                triggerHint={t('wash.packing.chooseTrolleysSubtitle', { count: trolleyNumbers.length })}
                disabled={isPacking}
              />

              {/* Wybrane wózki w tej bieżącej partii z opcją wpisania kg na wózek */}
              {scannedTrolleys.length > 0 ? (
                <div style={{
                  padding: '14px 16px',
                  background: 'var(--bg-secondary)',
                  borderRadius: '14px',
                  border: '1px solid var(--border)',
                }}>
                  <div style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    marginBottom: '10px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <span>{t('wash.packing.currentBatch')}</span>
                    <span className="tabular-nums" style={{ color: 'var(--accent)', fontWeight: 700 }}>
                      {t('entry.trolleySelected', { count: scannedTrolleys.length })}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {scannedTrolleys.map(no => (
                      <div
                        key={no}
                        style={{
                          background: 'var(--bg-card-solid)',
                          padding: '8px 12px',
                          borderRadius: '10px',
                          border: '1px solid var(--border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '10px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text-primary)' }} className="tabular-nums">
                            {formatTrolleyCode(no)}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600 }}>
                            {t('wash.packing.scannedTrolleyTag')}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <button
                            type="button"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              padding: '5px',
                              cursor: 'pointer',
                              display: 'grid',
                              placeItems: 'center',
                              color: 'var(--text-tertiary)',
                              borderRadius: '50%',
                            }}
                            onClick={() => setScannedTrolleys(selected => selected.filter(value => value !== no))}
                            disabled={isPacking}
                            aria-label={t('common.remove')}
                          >
                            <X size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                </div>
              ) : (
                <div style={{
                  padding: '16px',
                  background: 'var(--bg-secondary)',
                  borderRadius: '14px',
                  border: '1px dashed var(--border)',
                  textAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  color: 'var(--text-tertiary)',
                  fontSize: '13px',
                  fontWeight: 500,
                }}>
                  <ShoppingCart size={16} />
                  <span>{t('wash.packing.batchEmpty')}</span>
                </div>
              )}
            </div>
          ) : (
            <div style={{
              padding: '24px 20px',
              background: 'var(--accent-light)',
              borderRadius: '14px',
              border: '1px solid var(--accent-border)',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
            }}>
              <PackageCheck size={38} color="var(--accent)" />
              <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '16px', fontWeight: 700 }}>
                {t('wash.packing.looseTitle')}
              </h3>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.45 }}>
                {t('wash.packing.looseHint')}
              </p>
            </div>
          )}

          {/* PRZYCISKI AKCJI: Kontynuuj pakowanie vs Zakończ pakowanie */}
          <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Opcja A: Zakończenie pakowania (jeśli wcześniejsze wózki pokrywają hotel, a w tej partii nic nowego nie wybrano) */}
            {addingEmptyTrolleys ? (
              <button type="button" className="ap-btn ap-btn-primary" onClick={() => handleConfirm(false)}
                disabled={isPacking || !workflowAvailable || scannedTrolleys.length === 0}>
                {t(isPacking ? 'common.saving' : 'wash.actions.addEmptyTrolleys')}
              </button>
            ) : canFinishOnly ? (
              <button
                type="button"
                className="ap-btn ap-btn-primary"
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  borderRadius: '12px',
                  fontSize: '15px',
                  fontWeight: 700,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '3px',
                  boxShadow: '0 4px 14px rgba(0, 122, 255, 0.25)',
                }}
                onClick={() => handleConfirm(true)}
                disabled={isPacking || !workflowAvailable}
              >
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <PackageCheck size={18} />
                  <span>{isPacking ? t('wash.packing.packing') : t('wash.packing.finishPackingOnly')}</span>
                </div>
                <small style={{ fontSize: '11px', opacity: 0.85, fontWeight: 500 }}>
                  {t('wash.packing.finishOnlyHint')}
                </small>
              </button>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {/* 1. KONTYNUUJ PAKOWANIE (DLA 2 OSÓB / KILKU PARTII) */}
                <button
                  type="button"
                  className="ap-btn ap-btn-secondary"
                  style={{
                    padding: '12px 14px',
                    borderRadius: '12px',
                    fontSize: '14px',
                    fontWeight: 700,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    textAlign: 'center',
                    minHeight: '62px',
                    border: '1px solid var(--border)',
                  }}
                  onClick={() => handleConfirm(false)}
                  disabled={isPacking || !workflowAvailable || (packMode === 'trolley' && scannedTrolleys.length === 0)}
                  title={t('wash.packing.continueHint')}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={16} />
                    <span>{t('wash.packing.continuePacking')}</span>
                  </div>
                  <small style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 500, lineHeight: 1.2 }}>
                    {t('wash.packing.continueHint')}
                  </small>
                </button>

                {/* 2. ZAKOŃCZ PAKOWANIE (PRZEKAŻ KIEROWCY) */}
                <button
                  type="button"
                  className="ap-btn ap-btn-primary"
                  style={{
                    padding: '12px 14px',
                    borderRadius: '12px',
                    fontSize: '14px',
                    fontWeight: 700,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    textAlign: 'center',
                    minHeight: '62px',
                    boxShadow: '0 4px 14px rgba(0, 122, 255, 0.25)',
                  }}
                  onClick={() => handleConfirm(true)}
                  disabled={isPacking || !workflowAvailable || (packMode === 'trolley' && scannedTrolleys.length === 0)}
                  title={t('wash.packing.finishHint')}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <PackageCheck size={16} />
                    <span>{t('wash.packing.finishPacking')}</span>
                  </div>
                  <small style={{ fontSize: '10px', opacity: 0.85, fontWeight: 500, lineHeight: 1.2 }}>
                    {t('wash.packing.finishHint')}
                  </small>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
