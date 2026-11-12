import { useCallback, useEffect, useRef, useState } from 'react';
import { Archive, CalendarClock, CheckCircle2, ChevronRight, Clock3, History, MapPin, PackageOpen, ShieldAlert, Truck, WashingMachine, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { assignTrolleyToClient, forceReleaseTrolley, getTrolleyHistory } from '../lib/laundryRpc';
import { formatTrolleyCode } from '../lib/trolleyCodes';
import { operationalYmd } from '../lib/dateUtils';

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

export default function TrolleysDashboardModal({
  onClose,
  onRefresh,
  sessionToken,
  trolleyCount,
  activeTrolleyByNo,
  clients = [],
  initialTrolley = null,
  canForceReset = false,
  actorName = null,
}) {
  const { t, i18n } = useTranslation();
  const [selectedTrolley, setSelectedTrolley] = useState(initialTrolley);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const historyCloseRef = useRef(null);
  const historyPanelRef = useRef(null);
  const historyTriggerRef = useRef(null);
  const trolleyNumbers = Array.from({ length: trolleyCount }, (_, index) => String(index + 1));

  const closeHistory = useCallback(() => {
    setSelectedTrolley(null);
    requestAnimationFrame(() => historyTriggerRef.current?.focus());
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!selectedTrolley || !sessionToken) {
      setHistory([]);
      return undefined;
    }
    setPendingAction(null);
    setSelectedClientId('');
    setActionError('');
    setActionSuccess('');
    setHistoryLoading(true);
    setHistoryError('');
    getTrolleyHistory(sessionToken, selectedTrolley)
      .then(data => { if (!cancelled) setHistory(data?.events || []); })
      .catch(error => { if (!cancelled) setHistoryError(error.message || t('wash.fleet.historyError')); })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [selectedTrolley, sessionToken, t]);

  useEffect(() => {
    if (!selectedTrolley) return undefined;
    historyCloseRef.current?.focus();
    const handleKeyDown = event => {
      if (event.key === 'Escape') closeHistory();
      if (event.key !== 'Tab') return;
      const focusable = historyPanelRef.current?.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeHistory, selectedTrolley]);

  const counts = trolleyNumbers.reduce((result, trolleyNo) => {
    const active = activeTrolleyByNo.get(trolleyNo);
    if (!active) result.free += 1;
    else if (active.occupancy_source === 'arrival') result.dirty += 1;
    else if (active.status === 'at_client') result.atClient += 1;
    else result.inUse += 1;
    return result;
  }, { free: 0, inUse: 0, dirty: 0, atClient: 0 });

  const formatDate = value => {
    if (!value) return '—';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const parts = value.split('-');
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return d.toLocaleDateString(i18n.language?.startsWith('de') ? 'de-DE' : 'pl-PL', { dateStyle: 'medium' });
    }
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

  const selectedActive = selectedTrolley ? activeTrolleyByNo.get(String(selectedTrolley)) : null;
  const occupiedDays = selectedActive ? daysSince(selectedActive.dirty_received_at || selectedActive.picked_up_at) : 0;
  const overdueDays = selectedActive?.wash_date && selectedActive.wash_date < operationalYmd()
    ? daysSince(selectedActive.wash_date)
    : 0;
  const needsPlanReview = selectedActive?.occupancy_source === 'arrival' && !selectedActive.wash_date && occupiedDays > 1;
  const activeClients = clients
    .filter(client => client?.id && !client.archived_at)
    .sort((left, right) => left.name.localeCompare(right.name, i18n.language));
  const selectedPresentation = trolleyPresentation(selectedActive, t);
  const SelectedStatusIcon = selectedPresentation.Icon;

  const handleCorrection = async () => {
    if (!pendingAction || !selectedTrolley || actionBusy) return;
    setActionBusy(true);
    setActionError('');
    setActionSuccess('');
    try {
      if (pendingAction === 'assign_client') {
        if (!selectedClientId) {
          setActionError(t('wash.fleet.actions.selectClientError'));
          return;
        }
        await assignTrolleyToClient(sessionToken, selectedTrolley, selectedClientId, actorName);
      } else {
        await forceReleaseTrolley(sessionToken, selectedTrolley, pendingAction, actorName);
      }
      const data = await getTrolleyHistory(sessionToken, selectedTrolley);
      setHistory(data?.events || []);
      await onRefresh?.();
      setPendingAction(null);
      setActionSuccess(t(`wash.fleet.actions.${pendingAction}Success`));
    } catch (error) {
      setActionError(error.message || t('wash.fleet.actions.error'));
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="ap-overlay" style={{ display: 'flex', backdropFilter: 'blur(16px)', background: 'rgba(15,23,42,.45)' }} onClick={onClose}>
      <div className="ap-modal" onClick={event => event.stopPropagation()} style={{ position: 'relative', maxWidth: '980px', width: '95vw', maxHeight: '90vh', borderRadius: '24px', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#fff', border: 'none', boxShadow: '0 30px 60px -15px rgba(0,0,0,.3)' }}>
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
                <button
                  type="button"
                  key={trolleyNo}
                  aria-label={`${formatTrolleyCode(trolleyNo)} — ${presentation.label}. ${t('wash.fleet.openHistory')}`}
                  aria-haspopup="dialog"
                  onClick={event => {
                    historyTriggerRef.current = event.currentTarget;
                    setSelectedTrolley(trolleyNo);
                  }}
                  style={{ minHeight: '118px', padding: '15px', textAlign: 'left', cursor: 'pointer', borderRadius: '16px', border: `1px ${active ? 'solid' : 'dashed'} ${presentation.border}`, background: presentation.background, display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: active ? '0 4px 12px rgba(0,0,0,.025)' : 'none', fontFamily: 'inherit' }}
                >
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
                  <span style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', fontSize: '10px', fontWeight: 700, color: 'var(--text-quaternary)' }}>
                    {t('wash.fleet.openHistory')}
                    <ChevronRight size={13} aria-hidden="true" />
                  </span>
                </button>
              );
            })}
          </div>

        </div>

        {selectedTrolley && (
          <div className="fleet-history-backdrop" onClick={closeHistory}>
            <aside
              ref={historyPanelRef}
              className="fleet-history-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="fleet-history-title"
              onClick={event => event.stopPropagation()}
            >
              <header className="fleet-history-header">
                <div>
                  <div id="fleet-history-title" className="fleet-history-title">
                    <History size={19} aria-hidden="true" />
                    {t('wash.fleet.historyTitle', { trolley: formatTrolleyCode(selectedTrolley) })}
                  </div>
                  <div className="fleet-history-subtitle">{t('wash.fleet.historySubtitle')}</div>
                </div>
                <button ref={historyCloseRef} type="button" className="ap-modal-close" onClick={closeHistory} aria-label={t('common.close')}><X size={16} /></button>
              </header>

              <div className="fleet-history-current" style={{ '--fleet-status-color': selectedPresentation.accent, '--fleet-status-bg': selectedPresentation.background }}>
                <span className="fleet-history-current-icon"><SelectedStatusIcon size={18} aria-hidden="true" /></span>
                <div>
                  <span>{t('wash.fleet.currentStatus')}</span>
                  <strong>{selectedPresentation.label}</strong>
                  {selectedActive?.client_name && <small><MapPin size={12} aria-hidden="true" /> {selectedActive.client_name}</small>}
                </div>
              </div>

              {selectedActive?.occupancy_source === 'arrival' && (
                <div style={{ margin: '0 24px 16px', padding: '14px 16px', borderRadius: '16px', background: 'rgba(175,82,222,.05)', border: '1px solid rgba(175,82,222,.18)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', fontSize: '12px' }}>
                  <div>
                    <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: '11px' }}>{t('wash.trolleyBoard.laundryFrom')}</span>
                    <strong>{selectedActive.laundry_origin_date ? formatDate(selectedActive.laundry_origin_date) : '—'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: '11px' }}>{t('wash.trolleyBoard.receivedAtLaundry')}</span>
                    <strong>{selectedActive.dirty_received_at ? formatDate(selectedActive.dirty_received_at) : (selectedActive.picked_up_at ? formatDate(selectedActive.picked_up_at) : '—')}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: '11px' }}>{t('wash.trolleyBoard.plannedWash')}</span>
                    <strong>{selectedActive.wash_date ? formatDate(selectedActive.wash_date) : t('wash.trolleyBoard.missingPlan')}</strong>
                  </div>
                  {selectedActive.departure_date && (
                    <div>
                      <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: '11px' }}>{t('wash.trolleyBoard.plannedDeparture')}</span>
                      <strong>{formatDate(selectedActive.departure_date)}</strong>
                    </div>
                  )}
                  {overdueDays > 0 && (
                    <div className="laundry-trolley-overdue" role="status" style={{ gridColumn: 'span 2' }}>
                      <Clock3 size={15} />
                      {t('wash.trolleyBoard.overdueDays', { count: overdueDays })}
                    </div>
                  )}
                  {needsPlanReview && (
                    <div className="laundry-trolley-overdue" role="status" style={{ gridColumn: 'span 2' }}>
                      <Clock3 size={15} />
                      {t('wash.trolleyBoard.missingPlanWarning', { count: occupiedDays })}
                    </div>
                  )}
                </div>
              )}

              <div className="fleet-history-content">
                {historyLoading && <div className="fleet-history-state">{t('wash.fleet.historyLoading')}</div>}
                {historyError && <div className="ap-error">{historyError}</div>}
                {!historyLoading && !historyError && history.length === 0 && <div className="fleet-history-state">{t('wash.fleet.noHistory')}</div>}
                {!historyLoading && history.length > 0 && (
                  <div className="fleet-history-timeline">
                    {history.map(event => (
                      <article key={event.id} className="fleet-history-event">
                        <span className={`fleet-history-dot ${event.to_status === 'at_client' ? 'is-client' : event.to_status === 'free_at_laundry' ? 'is-free' : ''}`} />
                        <div>
                          <strong>{t(`wash.fleet.events.${event.event_type}`, { defaultValue: event.event_type })}</strong>
                          <time dateTime={event.occurred_at}>{formatDate(event.occurred_at)}{event.actor_name ? ` · ${event.actor_name}` : ''}</time>
                          {(event.client_name || event.location_type) && <span><MapPin size={12} aria-hidden="true" /> {event.client_name || t(`wash.fleet.locations.${event.location_type}`, { defaultValue: event.location_type })}</span>}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>

              {canForceReset && (
                <footer className="fleet-history-actions">
                  <div className="fleet-history-actions-title">{selectedActive ? <ShieldAlert size={15} aria-hidden="true" /> : <MapPin size={15} aria-hidden="true" />} {t(selectedActive ? 'wash.fleet.actions.title' : 'wash.fleet.actions.manualTitle')}</div>
                  {!pendingAction ? (
                    <div className="fleet-history-action-buttons">
                      {selectedActive ? (
                        <>
                          <button type="button" className="fleet-history-action is-loose" onClick={() => setPendingAction('make_loose')}>
                            <PackageOpen size={16} aria-hidden="true" />
                            <span><strong>{t('wash.fleet.actions.makeLoose')}</strong><small>{t('wash.fleet.actions.makeLooseHint')}</small></span>
                          </button>
                          <button type="button" className="fleet-history-action is-force" onClick={() => setPendingAction('force_empty')}>
                            <ShieldAlert size={16} aria-hidden="true" />
                            <span><strong>{t('wash.fleet.actions.forceEmpty')}</strong><small>{t('wash.fleet.actions.forceEmptyHint')}</small></span>
                          </button>
                        </>
                      ) : (
                        <button type="button" className="fleet-history-action is-client" onClick={() => setPendingAction('assign_client')}>
                          <MapPin size={16} aria-hidden="true" />
                          <span><strong>{t('wash.fleet.actions.assignClient')}</strong><small>{t('wash.fleet.actions.assignClientHint')}</small></span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className={`fleet-history-confirm ${pendingAction === 'assign_client' ? 'is-client' : ''}`} role="alert">
                      <strong>{t(`wash.fleet.actions.${pendingAction}ConfirmTitle`)}</strong>
                      <p>{t(`wash.fleet.actions.${pendingAction}ConfirmBody`, { trolley: formatTrolleyCode(selectedTrolley) })}</p>
                      {pendingAction === 'assign_client' && (
                        <label className="fleet-history-client-field">
                          <span>{t('wash.fleet.actions.clientLabel')}</span>
                          <select value={selectedClientId} onChange={event => setSelectedClientId(event.target.value)} disabled={actionBusy} autoFocus>
                            <option value="">{t('wash.fleet.actions.clientPlaceholder')}</option>
                            {activeClients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
                          </select>
                        </label>
                      )}
                      {actionError && <div className="ap-error">{actionError}</div>}
                      <div>
                        <button type="button" className="btn-secondary" onClick={() => { setPendingAction(null); setSelectedClientId(''); setActionError(''); }} disabled={actionBusy}>{t('common.cancel')}</button>
                        <button type="button" className={pendingAction === 'assign_client' ? 'btn-primary' : 'btn-danger'} onClick={handleCorrection} disabled={actionBusy || (pendingAction === 'assign_client' && !selectedClientId)}>{actionBusy ? t('wash.fleet.actions.saving') : t(pendingAction === 'assign_client' ? 'wash.fleet.actions.assignConfirm' : 'wash.fleet.actions.confirm')}</button>
                      </div>
                    </div>
                  )}
                </footer>
              )}
              {actionSuccess && <div className="fleet-history-success" role="status">{actionSuccess}</div>}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
