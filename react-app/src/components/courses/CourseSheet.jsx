import { useEffect, useRef } from 'react';

export default function CourseSheet({ titleId, title, onClose, busy = false, children }) {
  const sheetRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement;
    sheetRef.current?.focus();
    return () => { previous?.focus?.(); };
  }, []);

  useEffect(() => {
    const keydown = event => {
      if (event.key === 'Escape' && !busy) onCloseRef.current();
      if (event.key === 'Tab' && sheetRef.current) {
        const focusable = [...sheetRef.current.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); };
  }, [busy]);

  return (
    <div className="ap-overlay" style={{ display: 'flex' }} onPointerDown={() => !busy && onClose()}>
      <div
        ref={sheetRef}
        className="ap-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onPointerDown={event => event.stopPropagation()}
      >
        <div className="ap-handle" />
        <div className="ap-content">
          <h2 id={titleId} className="ap-title">{title}</h2>
          {children}
        </div>
      </div>
    </div>
  );
}
