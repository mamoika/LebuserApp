import { useState, useEffect } from 'react';
import { registerToastSetter } from '../lib/toast';

const COLORS = {
  success: { bg: '#34C759', icon: '✓' },
  error:   { bg: '#FF3B30', icon: '✕' },
  warn:    { bg: '#FF9500', icon: '⚠' },
  info:    { bg: '#007AFF', icon: 'ℹ' },
};

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    registerToastSetter(setToasts);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 99999,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      alignItems: 'center',
      pointerEvents: 'none',
      maxWidth: '90vw',
    }}>
      {toasts.map(t => {
        const c = COLORS[t.type] || COLORS.info;
        return (
          <div
            key={t.id}
            style={{
              background: c.bg,
              color: '#fff',
              padding: '12px 18px',
              borderRadius: '14px',
              fontSize: '14px',
              fontWeight: 600,
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
              boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              animation: 'toast-in 0.25s cubic-bezier(0.34,1.56,0.64,1)',
              whiteSpace: 'nowrap',
              maxWidth: '85vw',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            <span style={{ fontSize: '16px', flexShrink: 0 }}>{c.icon}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.message}</span>
          </div>
        );
      })}
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(12px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
