import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { PRIVACY_NOTICE_VERSION } from '../context/AuthContext';

// Pełna klauzula informacyjna RODO. Treść utrzymywana w i18n (rodoFull.*),
// wersjonowana razem z PRIVACY_NOTICE_VERSION. Dostępna dla każdego
// zalogowanego użytkownika pod /rodo.

const pStyle = { margin: '0 0 8px', fontSize: '13px', lineHeight: 1.55, color: 'var(--text-secondary)' };
const liStyle = { fontSize: '13px', lineHeight: 1.5, color: 'var(--text-secondary)' };

export default function RodoNotice() {
  const { t } = useTranslation();
  const controllerLines = t('rodoFull.controllerLines', { returnObjects: true });
  const sections = t('rodoFull.sections', { returnObjects: true });
  const lines = Array.isArray(controllerLines) ? controllerLines : [];
  const list = Array.isArray(sections) ? sections : [];
  const email = t('rodoFull.contactEmail');

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', padding: '4px 16px 56px' }}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <ShieldCheck size={20} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-tertiary)' }}>
            {t('privacy.version', { version: PRIVACY_NOTICE_VERSION })}
          </span>
        </div>

        <p style={pStyle}>{t('rodoFull.intro')}</p>

        <section style={{ marginTop: '12px', padding: '14px 16px', background: 'var(--bg-secondary)', borderRadius: '12px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 8px' }}>{t('rodoFull.controllerTitle')}</h2>
          {lines.map((l, i) => (
            <div key={i} style={liStyle}>{l}</div>
          ))}
          <div style={{ ...liStyle, marginTop: '6px' }}>
            {t('rodoFull.contactLabel')}:{' '}
            <a href={`mailto:${email}`} style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>{email}</a>
          </div>
        </section>

        {list.map((s, i) => (
          <section key={i} style={{ marginTop: '20px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 8px' }}>{s.title}</h2>
            {s.intro && <p style={pStyle}>{s.intro}</p>}
            {Array.isArray(s.paragraphs) && s.paragraphs.map((p, j) => <p key={j} style={pStyle}>{p}</p>)}
            {Array.isArray(s.bullets) && (
              <ul style={{ margin: '4px 0 0', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {s.bullets.map((b, j) => <li key={j} style={liStyle}>{b}</li>)}
              </ul>
            )}
            {s.footer && <p style={{ ...pStyle, marginTop: '8px' }}>{s.footer}</p>}
          </section>
        ))}

        <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '24px', fontSize: '13px', color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
          <ArrowLeft size={15} /> {t('common.back')}
        </Link>
      </div>
    </div>
  );
}
