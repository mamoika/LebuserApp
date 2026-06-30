import { X, Archive, Truck, CheckCircle2, CalendarClock } from 'lucide-react';

export default function TrolleysDashboardModal({
  onClose,
  trolleyCount,
  activeTrolleyByNo,
  trolleys = []
}) {
  const trolleyNumbers = Array.from({ length: trolleyCount }, (_, i) => String(i + 1));

  const getDaysAtClient = (active) => {
    if (!active) return 0;
    const dateToUse = active.delivered_at || active.packed_at;
    if (!dateToUse) return 0;
    
    // Ustawiamy obydwie daty na początek dnia (północ czasu lokalnego) by poprawnie liczyć same dni
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const clientDate = new Date(dateToUse);
    clientDate.setHours(0, 0, 0, 0);
    
    const diffTime = Math.abs(today - clientDate);
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="ap-overlay" style={{ display: 'flex', backdropFilter: 'blur(4px)', background: 'rgba(15, 23, 42, 0.4)' }} onClick={onClose}>
      <div 
        className="ap-modal" 
        onClick={e => e.stopPropagation()} 
        style={{ 
          maxWidth: '900px', 
          width: '95vw', 
          maxHeight: '90vh',
          background: 'var(--bg-primary)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid var(--border)',
          borderRadius: '24px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div className="ap-modal-header" style={{ padding: '24px 32px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="ap-modal-title" style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '-0.02em' }}>Stan floty wózków</div>
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>Monitorowanie lokalizacji {trolleyCount} sztuk</div>
          </div>
          <button 
            className="ap-modal-close" 
            onClick={onClose} 
            aria-label="Zamknij"
            style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '50%', padding: '8px', cursor: 'pointer', transition: 'all 0.2s' }}
          >
            <X size={20} color="var(--text-secondary)" />
          </button>
        </div>

        <div className="ap-modal-body" style={{ padding: '32px', overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '16px' }}>
            {trolleyNumbers.map(tNo => {
              const active = activeTrolleyByNo.get(tNo);
              const isFree = !active;
              
              let statusLabel = 'Wolny w pralni';
              let tone = 'neutral';
              let Icon = CheckCircle2;
              let client = null;
              let daysAtClient = null;

              if (active) {
                client = active.client_name;
                if (active.status === 'at_client') {
                  statusLabel = 'Zostawiony';
                  tone = 'client';
                  Icon = Archive;
                  daysAtClient = getDaysAtClient(active);
                } else if (active.entry_ids?.length > 0) {
                  statusLabel = 'W trasie / Spakowany';
                  tone = 'packed';
                  Icon = Truck;
                }
              }

              return (
                <div key={tNo} style={{
                  padding: '16px',
                  borderRadius: '16px',
                  border: isFree ? `1px dashed var(--border)` : `1px solid var(--${tone}-border, var(--border))`,
                  background: isFree ? 'transparent' : `var(--${tone}-bg, var(--bg-secondary))`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  boxShadow: isFree ? 'none' : '0 4px 12px rgba(0,0,0,0.03)',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  {/* Accent bar */}
                  {!isFree && (
                    <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: '4px', background: `var(--${tone}-text, var(--primary))` }} />
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <strong style={{ fontSize: '22px', fontWeight: 800, color: isFree ? 'var(--text-tertiary)' : 'var(--text-primary)', lineHeight: 1 }}>#{tNo}</strong>
                    <div style={{ 
                      background: isFree ? 'var(--bg-secondary)' : 'var(--bg-primary)', 
                      padding: '8px', 
                      borderRadius: '12px',
                      boxShadow: isFree ? 'none' : '0 2px 8px rgba(0,0,0,0.04)'
                    }}>
                      <Icon size={18} color={isFree ? 'var(--text-tertiary)' : `var(--${tone}-text, var(--primary))`} />
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: isFree ? 'var(--text-tertiary)' : `var(--${tone}-text, var(--primary))` }}>
                      {statusLabel}
                    </div>
                    {client && (
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500, lineHeight: 1.3 }}>
                        {client}
                      </div>
                    )}
                  </div>

                  {daysAtClient !== null && (
                    <div style={{ 
                      marginTop: 'auto',
                      paddingTop: '12px',
                      borderTop: `1px solid var(--${tone}-border, var(--border))`,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: daysAtClient > 5 ? 'var(--red-600)' : 'var(--text-secondary)'
                    }}>
                      <CalendarClock size={12} />
                      {daysAtClient === 0 ? 'Zostawiony dzisiaj' : 
                       daysAtClient === 1 ? 'Od wczoraj w hotelu' : 
                       `${daysAtClient} dni u klienta`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="ap-modal-footer" style={{ padding: '24px 32px', borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
          <button className="ap-btn" onClick={onClose} style={{ padding: '12px 24px', borderRadius: '12px', fontWeight: 600 }}>Zamknij panel</button>
        </div>
      </div>
    </div>
  );
}
