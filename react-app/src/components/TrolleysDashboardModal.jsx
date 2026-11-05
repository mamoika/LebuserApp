import { useEffect, useState } from 'react';
import { Archive, CalendarClock, CheckCircle2, History, MapPin, Truck, WashingMachine, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getTrolleyHistory } from '../lib/laundryRpc';
import { formatTrolleyCode } from '../lib/trolleyCodes';

function daysSince(value) {
  if (!value) return 0;
  const then = new Date(value);
  const today = new Date();
  if (Number.isNaN(then.getTime())) return 0;
  then.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today - then) / 86400000));
}

function trolleyPresentation(active, t) {
  if (!active) return { label: t('wash.fleet.free'), Icon: CheckCircle2, accent: 'var(--text-quaternary)', background: 'transparent', border: 'rgba(156,163,175,.4)', text: 'var(--text-tertiary)' };
  if (active.occupancy_source === 'arrival') return { label: active.status === 'returning_to_laundry' ? t('wash.fleet.returningToLaundry') : t('wash.fleet.dirtyAtLaundry'), Icon: active.status === 'returning_to_laundry' ? Truck : WashingMachine, accent: '#AF52DE', background: 'rgba(175,82,222,.04)', border: 'rgba(175,82,222,.18)', text: '#7E22CE' };
  if (active.status === 'at_client') return { label: t('wash.fleet.left'), Icon: Archive, accent: 'var(--accent-orange)', background: 'rgba(255,149,0,.04)', border: 'rgba(255,149,0,.18)', text: 'var(--accent-orange-text)' };
  return { label: t('wash.fleet.inUse'), Icon: Truck, accent: 'var(--accent)', background: 'rgba(0,122,255,.03)', border: 'rgba(0,122,255,.16)', text: 'var(--accent)' };
}

export default function TrolleysDashboardModal({ onClose, sessionToken, trolleyCount, activeTrolleyByNo }) {
  const { t, i18n } = useTranslation();
  const [selectedTrolley, setSelectedTrolley] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const trolleyNumbers = Array.from({ length: trolleyCount }, (_, index) => String(index + 1));

  useEffect(() => {
    let cancelled = false;
    if (!selectedTrolley || !sessionToken) {
      setHistory([]);
      return undefined;
    }
    setHistoryLoading(true);
    setHistoryError('');
    getTrolleyHistory(sessionToken, selectedTrolley)
      .then(data => { if (!cancelled) setHistory(data?.events || []); })
      .catch(error => { if (!cancelled) setHistoryError(error.message || t('wash.fleet.historyError')); })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [selectedTrolley, sessionToken, t]);

  const counts = trolleyNumbers.reduce((result, trolleyNo) => {
    const active = activeTrolleyByNo.get(trolleyNo);
    if (!active) result.free += 1;
    else if (active.occupancy_source === 'arrival') result.dirty += 1;
    else if (active.status === 'at_client') result.atClient += 1;
    else result.inUse += 1;
    return result;
  }, { free: 0, inUse: 0, dirty: 0, atClient: 0 });

  const formatDate = value => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString(i18n.language?.startsWith('de') ? 'de-DE' : 'pl-PL', { dateStyle: 'medium', timeStyle: 'short' });
  };

  const metric = (color, label) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', flex: 1, minWidth: '130px' }}>
      <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: color }} />
      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>{label}</span>
    </div>
  );

  return (
    <div className="ap-overlay" style={{ display: 'flex', backdropFilter: 'blur(16px)', background: 'rgba(15,23,42,.45)' }} onClick={onClose}>
      <div className="ap-modal" onClick={event => event.stopPropagation()} style={{ maxWidth: '980px', width: '95vw', maxHeight: '90vh', borderRadius: '24px', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#fff', border: 'none', boxShadow: '0 30px 60px -15px rgba(0,0,0,.3)' }}>
        <div className="ap-handle" style={{ marginTop: '12px', marginBottom: '-8px' }} />
        <header className="ap-modal-header" style={{ padding: '24px 32px', borderBottom: '1px solid rgba(229,231,235,.7)', background: 'rgba(249,250,251,.8)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="ap-modal-title" style={{ fontSize: '22px', fontWeight: 800, textAlign: 'left' }}>{t('wash.fleet.title')}</div>
            <div style={{ marginTop: '2px', fontSize: '13px', fontWeight: 500, color: 'var(--text-tertiary)' }}>{t('wash.fleet.subtitle', { count: trolleyCount })}</div>
          </div>
          <button type="button" className="ap-modal-close" onClick={onClose} aria-label={t('common.close')}><X size={16} /></button>
        </header>

        <div className="ap-modal-body" style={{ padding: '24px 32px', overflowY: 'auto', background: '#FAFAFC' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '22px', padding: '12px 16px', borderRadius: '16px', background: '#fff', border: '1px solid rgba(229,231,235,.6)' }}>
            {metric('var(--text-quaternary)', t('wash.fleet.freeCount', { count: counts.free }))}
            {metric('var(--accent)', t('wash.fleet.inUseCount', { count: counts.inUse }))}
            {metric('#AF52DE', t('wash.fleet.dirtyCount', { count: counts.dirty }))}
            {metric('var(--accent-orange)', t('wash.fleet.leftCount', { count: counts.atClient }))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: '12px' }}>
            {trolleyNumbers.map(trolleyNo => {
              const active = activeTrolleyByNo.get(trolleyNo);
              const presentation = trolleyPresentation(active, t);
              const Icon = presentation.Icon;
              const atClientDays = active?.status === 'at_client' ? daysSince(active.delivered_at || active.entry_delivered_at || active.packed_at) : null;
              return (
                <button type="button" key={trolleyNo} onClick={() => setSelectedTrolley(trolleyNo)} style={{ minHeight: '118px', padding: '15px', textAlign: 'left', cursor: 'pointer', borderRadius: '16px', border: `1px ${active ? 'solid' : 'dashed'} ${presentation.border}`, background: presentation.background, display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: active ? '0 4px 12px rgba(0,0,0,.025)' : 'none', fontFamily: 'inherit' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <strong style={{ fontSize: '17px', fontWeight: 850, color: active ? 'var(--text-primary)' : 'var(--text-quaternary)' }}>{formatTrolleyCode(trolleyNo)}</strong>
                    <Icon size={16} color={presentation.accent} />
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 750, color: presentation.text }}>{presentation.label}</div>
                    {active?.client_name && <div title={active.client_name} style={{ marginTop: '2px', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{active.client_name}</div>}
                  </div>
                  {atClientDays !== null && (
                    <div style={{ marginTop: 'auto', paddingTop: '7px', borderTop: '1px solid rgba(229,231,235,.65)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 750, color: atClientDays > 5 ? 'var(--accent-red)' : 'var(--text-tertiary)' }}>
                      <CalendarClock size={11} />
                      {atClientDays === 0 ? t('wash.fleet.leftToday') : atClientDays === 1 ? t('wash.fleet.sinceYesterday') : t('wash.fleet.daysAtClient', { count: atClientDays })}
                    </div>
                  )}
                  <span style={{ marginTop: 'auto', fontSize: '10px', fontWeight: 700, color: 'var(--text-quaternary)' }}>{t('wash.fleet.openHistory')}</span>
                </button>
              );
            })}
          </div>

          {selectedTrolley && (
            <section style={{ marginTop: '24px', padding: '18px', borderRadius: '18px', background: '#fff', border: '1px solid rgba(229,231,235,.8)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '17px', fontWeight: 800 }}><History size={18} /> {t('wash.fleet.historyTitle', { trolley: formatTrolleyCode(selectedTrolley) })}</div>
                  <div style={{ marginTop: '3px', fontSize: '12px', color: 'var(--text-tertiary)' }}>{t('wash.fleet.historySubtitle')}</div>
                </div>
                <button type="button" className="ap-modal-close" onClick={() => setSelectedTrolley(null)} aria-label={t('common.close')}><X size={15} /></button>
              </div>
              {historyLoading && <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)' }}>{t('wash.fleet.historyLoading')}</div>}
              {historyError && <div className="ap-error">{historyError}</div>}
              {!historyLoading && !historyError && history.length === 0 && <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)' }}>{t('wash.fleet.noHistory')}</div>}
              {!historyLoading && history.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {history.map(event => (
                    <article key={event.id} style={{ display: 'grid', gridTemplateColumns: '12px minmax(0,1fr)', gap: '10px', padding: '11px 0', borderTop: '1px solid rgba(229,231,235,.65)' }}>
                      <span style={{ width: '10px', height: '10px', marginTop: '5px', borderRadius: '50%', background: event.to_status === 'at_client' ? 'var(--accent-orange)' : event.to_status === 'free_at_laundry' ? 'var(--accent-green)' : 'var(--accent)' }} />
                      <div>
                        <strong style={{ display: 'block', fontSize: '13px' }}>{t(`wash.fleet.events.${event.event_type}`, { defaultValue: event.event_type })}</strong>
                        <span style={{ display: 'block', marginTop: '2px', fontSize: '12px', color: 'var(--text-secondary)' }}>{formatDate(event.occurred_at)}{event.actor_name ? ` · ${event.actor_name}` : ''}</span>
                        {(event.client_name || event.location_type) && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', fontSize: '12px', color: 'var(--text-tertiary)' }}><MapPin size={12} /> {event.client_name || t(`wash.fleet.locations.${event.location_type}`, { defaultValue: event.location_type })}</span>}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
