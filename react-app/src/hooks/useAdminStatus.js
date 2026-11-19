import { useCallback, useEffect, useRef, useState } from 'react';

export function useAdminStatus(readStatus, sessionToken) {
  const [snapshot, setSnapshot] = useState(null);
  const [status, setStatus] = useState('checking');
  const request = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++request.current;
    setStatus('checking');
    try {
      const data = await readStatus(sessionToken);
      if (request.current !== id) return;
      setSnapshot(data);
      setStatus('available');
    } catch {
      if (request.current === id) setStatus('unavailable');
    }
  }, [readStatus, sessionToken]);

  useEffect(() => {
    refresh();
    return () => { request.current += 1; };
  }, [refresh]);

  return { snapshot, status, refresh };
}
