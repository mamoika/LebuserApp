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
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const clientDate = new Date(dateToUse);
    clientDate.setHours(0, 0, 0, 0);
    
    const diffTime = Math.abs(today - clientDate);
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  // Calculate statistics
  let freeCount = 0;
  let inUseCount = 0;
  let atClientCount = 0;

  trolleyNumbers.forEach(tNo => {
    const active = activeTrolleyByNo.get(tNo);
    if (!active) {
      freeCount++;
    } else if (active.status === 'at_client') {
      atClientCount++;
    } else {
      inUseCount++;
    }
  });

  return (
    <div className="ap-overlay" style={{ display: 'flex', backdropFilter: 'blur(16px)', background: 'rgba(15, 23, 42, 0.45)' }} onClick={onClose}>
      <div 
        className="ap-modal" 
        onClick={e => e.stopPropagation()} 
        style={{ 
          maxWidth: '900px', 
          width: '95vw', 
          maxHeight: '90vh',
          background: '#FFFFFF',
          boxShadow: '0 30px 60px -15px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0, 0, 0, 0.05)',
          border: 'none',
          borderRadius: '24px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'ap-sheet-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both'
        }}
      >
        {/* Apple style drag handle (for decorative purpouses to fit other sheets) */}
        <div className="ap-handle" style={{ marginTop: '12px', marginBottom: '-8px' }}></div>

        <div className="ap-modal-header" style={{ padding: '24px 32px', borderBottom: '1px solid rgba(229, 231, 235, 0.7)', background: 'rgba(249, 250, 251, 0.8)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="ap-modal-title" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)', textAlign: 'left' }}>Stan floty wózków</div>
            <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '2px', textAlign: 'left', fontWeight: 500 }}>Monitorowanie i status logistyczny {trolleyCount} sztuk</div>
          </div>
          <button 
            className="ap-modal-close" 
            onClick={onClose} 
            aria-label="Zamknij"
            style={{ 
              background: '#FFFFFF', 
              border: '1px solid rgba(229, 231, 235, 0.8)', 
              borderRadius: '50%', 
              padding: '10px', 
              cursor: 'pointer', 
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(0,0,0,0.04)'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--bg-tertiary)';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = '#FFFFFF';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <X size={16} color="var(--text-secondary)" />
          </button>
        </div>

        <div className="ap-modal-body" style={{ padding: '24px 32px', overflowY: 'auto', background: '#FAFAFC' }}>
          {/* Quick Stats Bar */}
          <div style={{ 
            display: 'flex', 
            gap: '12px', 
            marginBottom: '24px', 
            background: '#FFFFFF', 
            padding: '12px 16px', 
            borderRadius: '16px',
            border: '1px solid rgba(229, 231, 235, 0.6)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, justifyContent: 'center', borderRight: '1px solid rgba(229, 231, 235, 0.6)' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--text-quaternary)' }}></span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Wolne: <strong style={{ color: 'var(--text-primary)', fontSize: '14px' }}>{freeCount}</strong></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, justifyContent: 'center', borderRight: '1px solid rgba(229, 231, 235, 0.6)' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--accent)' }}></span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>W użyciu: <strong style={{ color: 'var(--text-primary)', fontSize: '14px' }}>{inUseCount}</strong></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, justifyContent: 'center' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--accent-orange, #FF9500)' }}></span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Zostawione: <strong style={{ color: 'var(--text-primary)', fontSize: '14px' }}>{atClientCount}</strong></span>
            </div>
          </div>

          {/* Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '14px' }}>
            {trolleyNumbers.map(tNo => {
              const active = activeTrolleyByNo.get(tNo);
              const isFree = !active;
              
              let statusLabel = 'Wolny w pralni';
              let Icon = CheckCircle2;
              let client = null;
              let daysAtClient = null;

              // Color configs
              let bgColor = '#FFFFFF';
              let borderColor = 'rgba(229, 231, 235, 0.8)';
              let accentColor = 'var(--text-quaternary)';
              let textColor = 'var(--text-tertiary)';

              if (active) {
                client = active.client_name;
                if (active.status === 'at_client') {
                  statusLabel = 'Zostawiony';
                  Icon = Archive;
                  daysAtClient = getDaysAtClient(active);
                  bgColor = 'rgba(255, 149, 0, 0.04)';
                  borderColor = 'rgba(255, 149, 0, 0.18)';
                  accentColor = 'var(--accent-orange, #FF9500)';
                  textColor = '#B45309';
                } else if (active.entry_ids?.length > 0) {
                  statusLabel = 'W użyciu';
                  Icon = Truck;
                  bgColor = 'rgba(0, 122, 255, 0.03)';
                  borderColor = 'rgba(0, 122, 255, 0.16)';
                  accentColor = 'var(--accent)';
                  textColor = 'var(--accent)';
                }
              }

              return (
                <div key={tNo} style={{
                  padding: '16px',
                  borderRadius: '16px',
                  border: isFree ? `1px dashed rgba(156, 163, 175, 0.4)` : `1px solid ${borderColor}`,
                  background: isFree ? 'transparent' : bgColor,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  boxShadow: isFree ? 'none' : '0 4px 12px rgba(0,0,0,0.02)',
                  position: 'relative',
                  overflow: 'hidden',
                  minHeight: '110px'
                }}>
                  {/* Accent side bar */}
                  {!isFree && (
                    <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: '4px', background: accentColor }} />
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '20px', fontWeight: 800, color: isFree ? 'var(--text-quaternary)' : 'var(--text-primary)', lineHeight: 1 }}>#{tNo}</strong>
                    <div style={{ 
                      background: '#FFFFFF', 
                      padding: '6px', 
                      borderRadius: '10px',
                      boxShadow: isFree ? 'none' : '0 2px 6px rgba(0,0,0,0.04)',
                      border: '1px solid rgba(229, 231, 235, 0.5)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Icon size={15} color={isFree ? 'var(--text-quaternary)' : accentColor} />
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: isFree ? 'var(--text-quaternary)' : textColor }}>
                      {statusLabel}
                    </div>
                    {client && (
                      <div style={{ 
                        fontSize: '11px', 
                        color: 'var(--text-secondary)', 
                        fontWeight: 600, 
                        lineHeight: 1.3,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '100%'
                      }} title={client}>
                        {client}
                      </div>
                    )}
                  </div>

                  {daysAtClient !== null && (
                    <div style={{ 
                      marginTop: 'auto',
                      paddingTop: '8px',
                      borderTop: `1px solid rgba(229, 231, 235, 0.6)`,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '10px',
                      fontWeight: 700,
                      color: daysAtClient > 5 ? 'var(--accent-red)' : 'var(--text-tertiary)'
                    }}>
                      <CalendarClock size={11} color={daysAtClient > 5 ? 'var(--accent-red)' : 'var(--text-quaternary)'} />
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


      </div>
    </div>
  );
}
