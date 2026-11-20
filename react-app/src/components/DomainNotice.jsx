import { useState } from 'react';
import { ArrowUpRight, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './DomainNotice.css';

const LEGACY_HOST = 'lebuser.vercel.app';
const NEW_ADDRESS = new URL('https://lebuser.app');
const DISMISS_KEY = `lebuser.domain-notice.${NEW_ADDRESS.hostname}`;

function wasDismissed() {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export default function DomainNotice() {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(wasDismissed);

  if (typeof window === 'undefined' || window.location.hostname !== LEGACY_HOST || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // The current notice can still be dismissed when storage is blocked.
    }
  };

  return (
    <div className="domain-notice">
      <div className="domain-notice-copy">
        <span>{t('domainNotice.label')}</span>
        <a href={NEW_ADDRESS.href} target="_blank" rel="noopener noreferrer" aria-label={t('domainNotice.open', { domain: NEW_ADDRESS.hostname })}>
          {NEW_ADDRESS.hostname}
          <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      </div>
      <button type="button" onClick={dismiss} aria-label={t('domainNotice.dismiss')}>
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
