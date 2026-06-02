// Prosty globalny system toastów — bez zewnętrznych bibliotek

let _setToasts = null;

export function registerToastSetter(fn) {
  _setToasts = fn;
}

let _idCounter = 0;

export function toast(message, type = 'info', duration = 3500) {
  if (!_setToasts) return;
  const id = ++_idCounter;
  _setToasts(prev => [...prev, { id, message, type }]);
  setTimeout(() => {
    _setToasts(prev => prev.filter(t => t.id !== id));
  }, duration);
}

export const toastError = (msg) => toast(msg, 'error', 5000);
export const toastSuccess = (msg) => toast(msg, 'success', 3000);
export const toastWarn = (msg) => toast(msg, 'warn', 4000);
