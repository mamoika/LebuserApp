import { useState, useEffect } from 'react';
import { PackageCheck, X, ScanBarcode } from 'lucide-react';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';

export default function PackingModal({
  group,
  onClose,
  onPack,
  onPackMulti,
  trolleyNumbers,
  activeTrolleyByNo,
}) {
  const [scannedTrolleys, setScannedTrolleys] = useState([]);
  const [error, setError] = useState('');
  const [isPacking, setIsPacking] = useState(false);
  const [manualTrolley, setManualTrolley] = useState('');

  // Zaznacz całą zawartość pola input po otwarciu, żeby od razu móc wpisać nową wagę


  useBarcodeScanner({
    enabled: true,
    onScan: (scannedCode) => {
      const match = scannedCode.match(/^TRL-(\d+)$/i);
      if (!match) {
        setError(`Nieznany kod: ${scannedCode}. Zeskanuj wózek (np. TRL-5).`);
        return;
      }
      
      const trolleyNo = match[1];
      
      if (!trolleyNumbers.includes(trolleyNo)) {
        setError(`Wózek ${trolleyNo} nie istnieje.`);
        return;
      }
      
      const activeCycle = activeTrolleyByNo.get(trolleyNo.toLowerCase());
      if (activeCycle) {
        setError(`Wózek ${trolleyNo} jest zajęty przez: ${activeCycle.client_name}`);
        return;
      }

      if (scannedTrolleys.includes(trolleyNo)) {
        setError(`Wózek ${trolleyNo} został już dodany do listy.`);
        return;
      }
      
      setError('');
      setScannedTrolleys(prev => [...prev, trolleyNo]);
    }
  });

  const handleManualAdd = () => {
    if (!manualTrolley) {
      setError('Wybierz wózek z listy.');
      return;
    }
    
    if (scannedTrolleys.includes(manualTrolley)) {
      setError(`Wózek ${manualTrolley} został już dodany do listy.`);
      return;
    }

    setError('');
    setScannedTrolleys(prev => [...prev, manualTrolley]);
    setManualTrolley('');
  };

  const handleConfirmPack = async () => {
    if (scannedTrolleys.length === 0) {
      setError('Nie dodano żadnych wózków do spakowania.');
      return;
    }

    setError('');
    setIsPacking(true);
    try {
      if (onPackMulti) {
        await onPackMulti(group, scannedTrolleys);
      } else {
        // Fallback for safety
        await onPack(group, scannedTrolleys[0], group.remainingKg);
      }
      // onClose is not needed here as WashView handles closing on finish
    } catch (err) {
      setError(err.message || 'Błąd podczas pakowania');
      setIsPacking(false);
    }
  };

  // Auto-close if all packed
  useEffect(() => {
    if (group?.remainingKg <= 0) {
      onClose();
    }
  }, [group?.remainingKg, onClose]);

  if (!group) return null;

  return (
    <div className="ap-overlay" style={{ display: 'flex' }} onClick={onClose}>
      <div className="ap-sheet" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', margin: 'auto' }}>
        <div className="ap-handle" />
        <div className="ap-content">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div className="ap-title" style={{ textAlign: 'left', fontSize: '19px' }}>Pakowanie Wózków</div>
            <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}><X size={20} /></button>
          </div>

          <p style={{ margin: '0 0 16px 0', color: 'var(--text-secondary)' }}>
            <strong>{group.clientName}</strong> · Do spakowania zostało: <strong>{group.remainingKg} kg</strong>
          </p>

          {error && (
            <div className="ap-error" style={{ marginBottom: 15, padding: 10, background: '#fee2e2', color: '#991b1b', borderRadius: 4 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
              <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '17px' }}>Zeskanuj kody wózków</h3>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '13px' }}>
                Zeskanuj wszystkie wózki dla tego prania.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '5px', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-secondary)' }}>Dodaj wózek ręcznie (opcja):</span>
              <div style={{ display: 'flex', gap: '10px' }}>
                <select
                  className="ap-input"
                  style={{ flex: 1 }}
                  value={manualTrolley}
                  onChange={(e) => setManualTrolley(e.target.value)}
                  disabled={isPacking}
                >
                  <option value="">Wybierz wózek...</option>
                  {trolleyNumbers.map(no => {
                    const activeCycle = activeTrolleyByNo.get(no.toLowerCase());
                    const disabled = Boolean(activeCycle) || scannedTrolleys.includes(no);
                    return (
                      <option key={no} value={no} disabled={disabled}>
                        {no}{activeCycle ? ` · zajęty: ${activeCycle.client_name}` : ' · wolny'}
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
                  Dodaj
                </button>
              </div>
            </div>
            
            {scannedTrolleys.length > 0 && (
              <div style={{ padding: '15px', background: 'var(--bg-tertiary)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '10px' }}>
                  Dodane wózki ({scannedTrolleys.length}):
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {scannedTrolleys.map(no => (
                    <div key={no} style={{ background: 'var(--bg-primary)', padding: '6px 12px', borderRadius: '20px', fontSize: '14px', fontWeight: 600, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {no}
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

            <button
              type="button"
              className="ap-btn ap-btn-primary"
              style={{ width: '100%', padding: '15px', fontSize: '16px', marginTop: '10px' }}
              onClick={handleConfirmPack}
              disabled={isPacking || scannedTrolleys.length === 0}
            >
              {isPacking ? 'Pakowanie...' : `Zatwierdź i Spakuj do ${scannedTrolleys.length} wózków`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
