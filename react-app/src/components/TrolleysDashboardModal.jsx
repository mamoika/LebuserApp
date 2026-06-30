import { X, Archive, Truck, CheckCircle2 } from 'lucide-react';

export default function TrolleysDashboardModal({
  onClose,
  trolleyCount,
  activeTrolleyByNo,
  trolleys = []
}) {
  const trolleyNumbers = Array.from({ length: trolleyCount }, (_, i) => String(i + 1));

  return (
    <div className="ap-overlay" style={{ display: 'flex' }} onClick={onClose}>
      <div className="ap-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px', width: '90vw' }}>
        <div className="ap-modal-header">
          <div className="ap-modal-title">Stan wszystkich wózków ({trolleyCount})</div>
          <button className="ap-modal-close" onClick={onClose} aria-label="Zamknij">
            <X size={20} />
          </button>
        </div>

        <div className="ap-modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
            {trolleyNumbers.map(tNo => {
              const active = activeTrolleyByNo.get(tNo);
              const isFree = !active;
              
              let statusLabel = 'Wolny';
              let tone = 'neutral';
              let Icon = CheckCircle2;
              let client = null;

              if (active) {
                client = active.client_name;
                if (active.status === 'at_client') {
                  statusLabel = 'Zostawiony u klienta';
                  tone = 'client';
                  Icon = Archive;
                } else if (active.entry_ids?.length > 0) {
                  statusLabel = 'W użyciu';
                  tone = 'packed';
                  Icon = Truck;
                }
              }

              return (
                <div key={tNo} style={{
                  padding: '12px',
                  borderRadius: '12px',
                  border: `1px solid var(--border)`,
                  background: isFree ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '18px' }}>#{tNo}</strong>
                    <Icon size={16} color={isFree ? 'var(--text-tertiary)' : `var(--${tone}-text, var(--primary))`} />
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: isFree ? 'var(--text-tertiary)' : `var(--${tone}-text, var(--primary))` }}>
                    {statusLabel}
                  </div>
                  {client && (
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {client}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="ap-modal-footer">
          <button className="ap-btn" onClick={onClose}>Zamknij</button>
        </div>
      </div>
    </div>
  );
}
