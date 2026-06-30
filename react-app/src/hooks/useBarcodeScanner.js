import { useEffect, useRef } from 'react';

export function useBarcodeScanner({ onScan, enabled = true }) {
  const buffer = useRef('');
  const lastKeyTime = useRef(Date.now());

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e) => {
      // Ignore modifier keys
      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') {
        return;
      }

      const currentTime = Date.now();
      const elapsed = currentTime - lastKeyTime.current;
      lastKeyTime.current = currentTime;

      // If more than 100ms passed since the last key, it's a new sequence (likely human typing).
      // Scanners typically send characters with 5-30ms spacing.
      if (elapsed > 100) {
        buffer.current = '';
      }

      if (e.key === 'Enter') {
        if (buffer.current.length >= 3) {
          // It's a scan, prevent default (e.g. form submission) if the focus was on some input
          // Wait, preventDefault on capture phase can cause issues if someone types fast?
          // We only prevent default if we have a full barcode. But e.key === 'Enter' happens after the barcode.
          
          const scannedCode = buffer.current;
          buffer.current = '';
          
          // Allow focus to continue unless we specifically want to stop it
          onScan(scannedCode);
        } else {
          buffer.current = '';
        }
      } else {
        if (e.key.length === 1) {
          buffer.current += e.key;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [enabled, onScan]);
}
