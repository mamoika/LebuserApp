let lockCount = 0;
let restorePage = null;

export function lockPageScroll(documentRef = globalThis.document, windowRef = globalThis.window) {
  const body = documentRef?.body;
  const root = documentRef?.documentElement;
  if (!body || !root || !windowRef) return () => {};

  lockCount += 1;

  if (lockCount === 1) {
    const scrollY = windowRef.scrollY || 0;
    const previous = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      paddingRight: body.style.paddingRight,
    };
    const scrollbarWidth = Math.max(0, windowRef.innerWidth - root.clientWidth);
    const currentPadding = Number.parseFloat(windowRef.getComputedStyle?.(body)?.paddingRight) || 0;

    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    if (scrollbarWidth > 0) body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;

    restorePage = () => {
      body.style.overflow = previous.overflow;
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.width = previous.width;
      body.style.paddingRight = previous.paddingRight;
      windowRef.scrollTo?.(0, scrollY);
    };
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      restorePage?.();
      restorePage = null;
    }
  };
}
