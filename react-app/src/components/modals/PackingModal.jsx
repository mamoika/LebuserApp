import { useState, useEffect } from 'react';
import { PackageCheck, X, ScanBarcode } from 'lucide-react';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';

export default function PackingModal({
  group,
  onClose,
  onPack,
  trolleyNumbers,
  activeTrolleyByNo,
}) {
  const [kg, setKg] = useState(group?.remainingKg > 0 ? String(group.remainingKg) : '');
  const [error, setError] = useState('');
  const [isPacking, setIsPacking] = useState(false);

  // Zaznacz całą zawartość pola input po otwarciu, żeby od razu móc wpisać nową wagę
  useEffect(() => {
    const input = document.getElementById('packing-kg-input');
    if (input) {
      input.focus();
      input.select();
    }
  }, []);

  useBarcodeScanner({
    enabled: true,
    onScan: async (scannedCode) => {
      // Oczekujemy kodu np. TRL-5
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
      
      const kgValue = Number.parseFloat(String(kg).replace(',', '.'));
      if (!Number.isFinite(kgValue) || kgValue <= 0) {
        setError('Wpisz poprawną wagę (kg) przed zeskanowaniem wózka.');
        return;
      }
      
      if (kgValue > group.remainingKg + 0.05) {
        setError(`Za dużo. Zostało ${group.remainingKg} kg.`);
        return;
      }

      setError('');
      setIsPacking(true);
      try {
        await onPack(group, trolleyNo, kgValue);
        // Po pomyślnym spakowaniu modal można np. nie zamykać,
        // a WasView odświeży group.remainingKg.
        // Wyczyszczenie wagi jeśli spakowano wszystko:
        // Ale WasView zmieni propsy, co zaktualizuje remainingKg, 
        // a jeśli remainingKg <= 0 to WasView samo zamknie modal (lub użytkownik).
      } catch (err) {
        setError(err.message || 'Błąd podczas pakowania');
      } finally {
        setIsPacking(false);
      }
    }
  });

  // Kiedy group się zaktualizuje z zewnątrz (bo zapakowano), odśwież proponowaną wagę
  useEffect(() => {
    if (group?.remainingKg > 0) {
      setKg(String(group.remainingKg));
      setError('');
      // Znowu focus
      const input = document.getElementById('packing-kg-input');
      if (input) {
        input.focus();
        input.select();
      }
    } else if (group?.remainingKg <= 0) {
      onClose(); // Zamknij automatycznie jeśli wszystko spakowano
    }
  }, [group?.remainingKg, onClose]);

  if (!group) return null;

  return (
    <div className="ap-overlay" onClick={onClose}>
      <div className="ap-modal" onClick={e => e.stopPropagation()}>
        <button type="button" className="ap-modal-close" onClick={onClose}><X size={20} /></button>
        <h2>Pakowanie Wózków</h2>
        <p className="ap-modal-sub">
          <strong>{group.clientName}</strong> · Do spakowania zostało: <strong>{group.remainingKg} kg</strong>
        </p>

        {error && (
          <div className="ap-error" style={{ marginBottom: 15, padding: 10, background: '#fee2e2', color: '#991b1b', borderRadius: 4 }}>
            {error}
          </div>
        )}

        <div className="packing-form" style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '20px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontWeight: 600, fontSize: '1rem' }}>Podaj wagę dla najbliższego wózka (kg)</span>
            <input
              id="packing-kg-input"
              type="number"
              min="0.1"
              step="0.1"
              max={group.remainingKg}
              value={kg}
              onChange={(e) => setKg(e.target.value)}
              disabled={isPacking}
              style={{
                fontSize: '2rem',
                padding: '10px 15px',
                borderRadius: '8px',
                border: '2px solid #cbd5e1',
                textAlign: 'center',
                width: '200px',
                margin: '0 auto'
              }}
            />
          </label>

          <div style={{
            background: '#f8fafc',
            border: '2px dashed #cbd5e1',
            borderRadius: '12px',
            padding: '30px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px'
          }}>
            <ScanBarcode size={48} color="#94a3b8" />
            <h3 style={{ margin: 0, color: '#334155' }}>Zeskanuj kod wózka</h3>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
              System automatycznie przypisze podaną wagę i wózek do tego klienta.
            </p>
            {isPacking && <span style={{ color: '#0ea5e9', fontWeight: 600 }}>Pakowanie...</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
