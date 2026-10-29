import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PackageCheck, X, ScanBarcode, ShoppingCart, Package } from 'lucide-react';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';

export default function PackingModal({
  group,
  onClose,
  onPack,
  onPackMulti,
  trolleyNumbers,
  activeTrolleyByNo,
}) {
  const { t } = useTranslation();
  const [scannedTrolleys, setScannedTrolleys] = useState([]);
  const [error, setError] = useState('');
  const [isPacking, setIsPacking] = useState(false);
  const [manualTrolley, setManualTrolley] = useState('');
  const [packMode, setPackMode] = useState('trolley'); // 'trolley' | 'no_trolley'
  // Waga nie była znana przy przyjeździe — trzeba ją wpisać teraz, przy ważeniu na pralni,
  // zamiast automatycznie dzielić już znane kg na wózki.
  const needsManualKg = !group?.hasKnownWeight;
  const [manualKg, setManualKg] = useState({}); // { [trolleyNo|'brak']: '12,5' }

  // Zaznacz całą zawartość pola input po otwarciu, żeby od razu móc wpisać nową wagę


  useBarcodeScanner({
    enabled: packMode === 'trolley',
    onScan: (scannedCode) => {
      const match = scannedCode.match(/^TRL-(\d+)$/i);
      if (!match) {
        setError(t('wash.packing.unknownCode', { code: scannedCode }));
        return;
      }
      
      const trolleyNo = match[1];
      
      if (!trolleyNumbers.includes(trolleyNo)) {
        setError(t('wash.packing.missingTrolley', { trolley: trolleyNo }));
        return;
      }
      
      const activeCycle = activeTrolleyByNo.get(trolleyNo.toLowerCase());
      if (activeCycle) {
        setError(t('wash.packing.occupied', { trolley: trolleyNo, client: activeCycle.client_name }));
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

  const handleManualAdd = () => {
    if (!manualTrolley) {
      setError(t('wash.packing.chooseTrolley'));
      return;
    }
    
    if (scannedTrolleys.includes(manualTrolley)) {
      setError(t('wash.packing.duplicate', { trolley: manualTrolley }));
      return;
    }

    setError('');
    setScannedTrolleys(prev => [...prev, manualTrolley]);
    setManualTrolley('');
  };

  const handleConfirmPack = async () => {
    setError('');
    const trolleysToSend = packMode === 'trolley' ? scannedTrolleys : ['brak'];
    if (packMode === 'trolley' && trolleysToSend.length === 0) {
      setError(t('wash.packing.chooseAtLeastOne'));
      return;
    }
    // Waga jest opcjonalna, gdy nie była znana przy przyjeździe — czasem dowiadujemy się
    // jej dopiero po fakcie (np. od kierowcy), więc puste pole nie blokuje pakowania.
    const kgByTrolley = needsManualKg
      ? Object.fromEntries(trolleysToSend.map(no => [no, parseFloat(String(manualKg[no] ?? '').replace(',', '.')) || 0]))
      : null;
    setIsPacking(true);
    try {
      if (onPackMulti) {
        await onPackMulti(group, trolleysToSend, kgByTrolley);
      } else {
        // Fallback for safety
        await onPack(group, trolleysToSend[0], kgByTrolley ? kgByTrolley[trolleysToSend[0]] : group.remainingKg);
      }
      // onClose is not needed here as WashView handles closing on finish
    } catch (err) {
      setError(err.message || t('wash.packing.error'));
      setIsPacking(false);
    }
  };

  // Auto-close, gdy nic już nie czeka na spakowanie (uniwersalne — działa też
  // przy nieznanej wadze, gdzie remainingKg zawsze wynosi 0).
  useEffect(() => {
    if (group && group.washedIds?.length === 0) {
      onClose();
    }
  }, [group, onClose]);

  if (!group) return null;

  return (
    <div className="ap-overlay" style={{ display: 'flex' }} onClick={onClose}>
      <div className="ap-sheet" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', margin: 'auto' }}>
        <div className="ap-handle" />
        <div className="ap-content">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div className="ap-title" style={{ textAlign: 'left', fontSize: '19px' }}>{t('wash.packing.title')}</div>
            <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}><X size={20} /></button>
          </div>

          <p style={{ margin: '0 0 16px 0', color: 'var(--text-secondary)' }}>
            {needsManualKg
              ? t('wash.packing.unknownWeightHint', { client: group.clientName })
              : t('wash.packing.remaining', { client: group.clientName, weight: group.remainingKg })}
          </p>

          {error && (
            <div className="ap-error" style={{ marginBottom: 15, padding: 10, background: 'var(--accent-red-light)', color: 'var(--accent-red)', borderRadius: 4 }}>
              {error}
            </div>
          )}

          {/* Segmented Control / Tab Picker */}
          <div style={{ display: 'flex', background: 'var(--bg-tertiary)', padding: '4px', borderRadius: '8px', marginBottom: '16px' }}>
            <button
              type="button"
              onClick={() => setPackMode('trolley')}
              style={{
                flex: 1, padding: '8px', borderRadius: '6px', border: 'none', cursor: 'pointer',
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
              onClick={() => setPackMode('no_trolley')}
              style={{
                flex: 1, padding: '8px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                fontWeight: 600, fontSize: '13px',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                background: packMode === 'no_trolley' ? 'var(--bg-card-solid)' : 'transparent',
                color: packMode === 'no_trolley' ? 'var(--text-primary)' : 'var(--text-secondary)',
                boxShadow: packMode === 'no_trolley' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <Package size={15} /> {t('wash.packing.loose')}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {packMode === 'trolley' ? (
              <>
                <div style={{
                  background: 'var(--bg-secondary)',
                  border: '2px dashed var(--border)',
                  borderRadius: '12px',
                  padding: '20px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  <ScanBarcode size={48} color="var(--text-tertiary)" />
                  <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '17px' }}>{t('wash.packing.scanTitle')}</h3>
                  <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '13px' }}>
                    {t('wash.packing.scanHint')}
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '5px', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-secondary)' }}>{t('wash.packing.manual')}</span>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <select
                      className="ap-input"
                      style={{ flex: 1 }}
                      value={manualTrolley}
                      onChange={(e) => setManualTrolley(e.target.value)}
                      disabled={isPacking}
                    >
                      <option value="">{t('wash.packing.choosePlaceholder')}</option>
                      {trolleyNumbers.map(no => {
                        const activeCycle = activeTrolleyByNo.get(no.toLowerCase());
                        const disabled = Boolean(activeCycle) || scannedTrolleys.includes(no);
                        return (
                          <option key={no} value={no} disabled={disabled}>
                            {activeCycle
                              ? t('wash.packing.occupiedOption', { trolley: no, client: activeCycle.client_name })
                              : t('wash.packing.free', { trolley: no })}
                          </option>
                        );
                      })}
                    </select>
                    <button
                      type="button"
                      className="ap-btn ap-btn-secondary"
                      onClick={handleManualAdd}
                      disabled={isPacking || !manualTrolley}
                    >
                      {t('common.add')}
                    </button>
                  </div>
                </div>
                
                {scannedTrolleys.length > 0 && (
                  <div style={{ padding: '15px', background: 'var(--bg-tertiary)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '10px' }}>
                      {t('wash.packing.added', { count: scannedTrolleys.length })}{needsManualKg ? t('wash.packing.kgOptional') : ''}:
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {scannedTrolleys.map(no => (
                        <div key={no} style={{ background: 'var(--bg-card-solid)', padding: '6px 12px', borderRadius: '20px', fontSize: '14px', fontWeight: 600, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {no}
                          {needsManualKg && (
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="kg"
                              value={manualKg[no] ?? ''}
                              onChange={e => setManualKg(prev => ({ ...prev, [no]: e.target.value }))}
                              style={{ width: '52px', border: '1px solid var(--border)', borderRadius: '8px', padding: '3px 6px', fontSize: '13px', fontWeight: 600 }}
                            />
                          )}
                          <button
                            type="button"
                            style={{ background: 'transparent', border: 'none', padding: 0, margin: 0, cursor: 'pointer', display: 'flex', color: 'var(--text-secondary)' }}
                            onClick={() => setScannedTrolleys(prev => prev.filter(t => t !== no))}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div style={{
                padding: '24px 20px',
                background: 'var(--accent-light)',
                borderRadius: '12px',
                border: '1px solid var(--accent-border)',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px'
              }}>
                <PackageCheck size={40} color="var(--accent)" />
                <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '16px' }}>{t('wash.packing.looseTitle')}</h3>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.4 }}>
                  {t('wash.packing.looseHint')}
                </p>
                {needsManualKg && (
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder={t('wash.packing.optionalKg')}
                    value={manualKg.brak ?? ''}
                    onChange={e => setManualKg(prev => ({ ...prev, brak: e.target.value }))}
                    className="ap-input"
                    style={{ width: '140px', textAlign: 'center', fontWeight: 700 }}
                  />
                )}
              </div>
            )}

            <button
              type="button"
              className="ap-btn ap-btn-primary"
              style={{ width: '100%', padding: '15px', fontSize: '16px', marginTop: '10px' }}
              onClick={handleConfirmPack}
              disabled={isPacking || (packMode === 'trolley' && scannedTrolleys.length === 0)}
            >
              {isPacking
                ? t('wash.packing.packing')
                : packMode === 'trolley'
                  ? t('wash.packing.confirmTrolleys', { count: scannedTrolleys.length })
                  : t('wash.packing.confirmLoose')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
