import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { Printer, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { getLaundryWorkflow } from '../lib/laundryRpc';

export default function BarcodeGenerator() {
  const { t } = useTranslation();
  const { sessionToken } = useAuth();
  const [trolleyCount, setTrolleyCount] = useState(25);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getLaundryWorkflow(sessionToken);
        setTrolleyCount(Math.max(1, Math.min(99, Number(data?.trolley_count) || 25)));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    if (sessionToken) load();
  }, [sessionToken]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) return <div>{t('common.loading') || 'Ładowanie...'}</div>;

  const codes = Array.from({ length: trolleyCount }, (_, i) => `TRL-${i + 1}`);

  return (
    <div>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '17px', fontWeight: 700 }}>Kody kreskowe wózków</div>
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Wydrukuj etykiety dla skanera</div>
        </div>
        <button
          onClick={handlePrint}
          style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '10px', padding: '8px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Printer size={16} />
          Drukuj Kody
        </button>
      </div>

      <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)' }} className="print-container">
        <style>{`
          @media print {
            body * { visibility: hidden; }
            .print-container, .print-container * { visibility: visible; }
            .print-container {
              position: absolute; left: 0; top: 0;
              width: 100%; border: none !important; padding: 0 !important;
            }
            .no-print { display: none !important; }
            .barcode-grid { display: grid; grid-template-columns: repeat(3, 1fr) !important; gap: 20px !important; }
            .barcode-item { page-break-inside: avoid; border: 1px dashed #ccc; padding: 10px; text-align: center; }
          }
        `}</style>

        <div className="barcode-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
          {codes.map(code => (
            <BarcodeItem key={code} value={code} />
          ))}
        </div>
      </div>
    </div>
  );
}

function BarcodeItem({ value }) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (svgRef.current) {
      try {
        JsBarcode(svgRef.current, value, {
          format: 'CODE128',
          lineColor: '#000',
          width: 2,
          height: 60,
          displayValue: true,
          fontSize: 20,
          margin: 10,
        });
      } catch (e) {
        console.error('Error rendering barcode', e);
      }
    }
  }, [value]);

  return (
    <div className="barcode-item" style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '15px', display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#fff' }}>
      <svg ref={svgRef}></svg>
    </div>
  );
}
