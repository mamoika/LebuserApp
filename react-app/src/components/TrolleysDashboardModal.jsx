import { useCallback, useEffect, useRef, useState } from 'react';
import { Archive, CheckCircle2, ChevronRight, ClipboardCheck, Clock3, History, MapPin, PackageOpen, Search, ShieldAlert, Truck, WashingMachine, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { assignTrolleyToClient, forceReleaseTrolley, getTrolleyHistory, startTrolleyInventory, verifyTrolleyInventory } from '../lib/laundryRpc';
import { formatTrolleyCode, parseTrolleyCode } from '../lib/trolleyCodes';
import { trolleyFleetStatus } from '../lib/trolleyOccupancy';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { operationalYmd } from '../lib/dateUtils';
import { lockPageScroll } from '../lib/modalScrollLock';
import './TrolleysDashboardModal.css';

const FLEET_STATUSES = {
  free: { Icon: CheckCircle2, label: 'free', filter: 'filterFree' },
  inUse: { Icon: Truck, label: 'inUse', filter: 'inUse' },
  dirty: { Icon: WashingMachine, label: 'dirtyAtLaundry', filter: 'filterDirty' },
  atClient: { Icon: Archive, label: 'left', filter: 'left' },
};

const INVENTORY_STATUSES = {
  review: { Icon: ClipboardCheck, label: 'inventory.review' },
  conflict: { Icon: ShieldAlert, label: 'inventory.conflict' },
};

const STATUS_DETAILS = { ...FLEET_STATUSES, ...INVENTORY_STATUSES };
const OBSERVED_LABELS = {
  free_at_laundry: 'free',
  at_client: 'left',
  in_use: 'inUse',
  dirty_at_laundry: 'dirtyAtLaundry',
};

function fleetStatusDetails(status, active) {
  return status === 'dirty' && active?.status === 'returning_to_laundry'
    ? { Icon: Truck, label: 'returningToLaundry' }
    : STATUS_DETAILS[status];
}

function inventoryErrorMessage(error, t) {
  if (error?.message === 'trolley_inventory_changed') return t('wash.fleet.inventory.changed');
  if (error?.message === 'trolley_inventory_invalid_client') return t('wash.fleet.inventory.invalidClient');
  return t('wash.fleet.inventory.error');
}

function TrolleyInventoryCheck({ check, active, clients, busy, error, onVerify }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState(check?.status || '');
  const [clientId, setClientId] = useState(() => clients.find(client => (
    client.name === (check?.client_name || active?.client_name)
  ))?.id || '');

  return (
    <form className="fleet-inventory-check" onSubmit={event => {
      event.preventDefault();
      if (status && (status !== 'at_client' || clientId) && !busy) onVerify(status, clientId);
    }}>
      <label className="fleet-history-client-field">
        <span>{t('wash.fleet.inventory.observed')}</span>
        <select value={status} onChange={event => setStatus(event.target.value)} disabled={busy}>
          <option value="">{t('wash.fleet.inventory.chooseStatus')}</option>
          {Object.entries(OBSERVED_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{t(`wash.fleet.${label}`)}</option>
          ))}
        </select>
      </label>
      {status === 'at_client' && (
        <label className="fleet-history-client-field">
          <span>{t('wash.fleet.actions.clientLabel')}</span>
          <select value={clientId} onChange={event => setClientId(event.target.value)} disabled={busy}>
            <option value="">{t('wash.fleet.actions.clientPlaceholder')}</option>
            {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
        </label>
      )}
      {error && <small className="fleet-inventory-error" role="alert">{error}</small>}
      <button type="submit" className="fleet-inventory-button" disabled={busy || !status || (status === 'at_client' && !clientId)}>
        {t(busy ? 'wash.fleet.actions.saving' : 'wash.fleet.inventory.verify')}
      </button>
    </form>
  );
}

function normalizeSearch(value = '') {
  return value.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replaceAll('ł', 'l').replaceAll('ß', 'ss');
}

function daysSince(value, today = new Date()) {
  if (!value) return null;
  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return null;
  // Compare calendar days across daylight-saving changes.
  const todayDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const thenDay = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? then.getTime()
    : Date.UTC(then.getFullYear(), then.getMonth(), then.getDate());
  return Math.max(0, (todayDay - thenDay) / 86400000);
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
  inventory,
}) {
  const { t, i18n } = useTranslation();
  const [filter, setFilter] = useState(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('number');
  const [selectedTrolley, setSelectedTrolley] = useState(initialTrolley);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [inventoryStartOpen, setInventoryStartOpen] = useState(false);
  const [inventoryBusy, setInventoryBusy] = useState(false);
  const [inventoryError, setInventoryError] = useState('');
  const [inventoryFeedback, setInventoryFeedback] = useState('');
  const historyCloseRef = useRef(null);
  const historyPanelRef = useRef(null);
  const historyTriggerRef = useRef(null);
  const fleetCloseRef = useRef(null);
  const fleetContentRef = useRef(null);
  const fleetListRef = useRef(null);
  const searchRef = useRef(null);
  const inventoryStartRef = useRef(null);

  const closeHistory = useCallback((focusSearch = false) => {
    setSelectedTrolley(null);
    requestAnimationFrame(() => {
      if (focusSearch) {
        searchRef.current?.focus();
        return;
      }
      historyTriggerRef.current?.focus();
      if (document.activeElement !== historyTriggerRef.current) fleetCloseRef.current?.focus();
    });
  }, []);

  useEffect(() => {
    const opener = document.activeElement;
    if (!initialTrolley) fleetCloseRef.current?.focus();
    return () => opener?.focus();
  }, [initialTrolley]);

  useEffect(() => lockPageScroll(), []);

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
    if (selectedTrolley) historyCloseRef.current?.focus();
  }, [selectedTrolley]);

  useEffect(() => {
    if (inventoryStartOpen) inventoryStartRef.current?.focus();
  }, [inventoryStartOpen]);

  useEffect(() => {
    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        if (inventoryBusy) return;
        if (selectedTrolley) closeHistory();
        else onClose();
      }
      if (event.key !== 'Tab') return;
      const panel = selectedTrolley ? historyPanelRef.current : fleetContentRef.current;
      const focusable = panel?.querySelectorAll(
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
  }, [closeHistory, inventoryBusy, onClose, selectedTrolley]);

  const counts = { free: 0, inUse: 0, dirty: 0, atClient: 0, review: 0, conflict: 0 };
  const today = new Date();
  const fleet = Array.from({ length: trolleyCount }, (_, index) => {
    const trolleyNo = String(index + 1);
    const active = activeTrolleyByNo.get(trolleyNo);
    const { status, recorded, check } = trolleyFleetStatus(trolleyNo, active, inventory);
    counts[status] += 1;
    const clientName = status === 'atClient' && !check?.movement_since_check ? (check?.client_name || active?.client_name) : active?.client_name;
    const atClientDays = recorded === 'atClient'
      ? daysSince(active?.delivered_at || active?.entry_delivered_at || active?.packed_at, today)
      : null;
    return { trolleyNo, code: formatTrolleyCode(trolleyNo), active, status, recorded, clientName, atClientDays };
  });
  const search = normalizeSearch(query);
  const searchNumber = parseTrolleyCode(search);
  const visibleTrolleys = fleet.filter(({ trolleyNo, code, clientName, status }) => (
    (!filter || status === filter) && (!search || (
      (searchNumber ? trolleyNo === searchNumber : code.toLowerCase().includes(search))
      || normalizeSearch(clientName ?? '').includes(search)
    ))
  ));
  if (sort === 'oldest') {
    visibleTrolleys.sort((a, b) => (b.atClientDays ?? -1) - (a.atClientDays ?? -1));
  }
  const resetListScroll = () => {
    fleetListRef.current?.scrollTo(0, 0);
    fleetContentRef.current?.scrollTo(0, 0);
  };

  const openTrolley = (trolleyNo, trigger = null) => {
    historyTriggerRef.current = trigger;
    setInventoryError('');
    setInventoryFeedback('');
    setSelectedTrolley(trolleyNo);
  };

  const openScannedTrolley = value => {
    const trolleyNo = parseTrolleyCode(value);
    if (!trolleyNo || !inventory?.trolley_nos.includes(trolleyNo) || Number(trolleyNo) > trolleyCount) return false;
    setQuery('');
    openTrolley(trolleyNo, searchRef.current);
    return true;
  };

  useBarcodeScanner({
    enabled: Boolean(inventory && canForceReset && !selectedTrolley && !inventoryStartOpen && !inventoryBusy),
    onScan: (code, event) => {
      if (openScannedTrolley(code)) event.preventDefault();
    },
  });

  const handleInventoryStart = async () => {
    if (inventoryBusy) return;
    setInventoryBusy(true);
    setInventoryError('');
    setInventoryFeedback('');
    try {
      await startTrolleyInventory(sessionToken, inventory?.id);
      await onRefresh?.();
      setInventoryStartOpen(false);
      // Keep the toolbar usable while the fleet payload refreshes.
      setFilter('review');
      setQuery('');
      resetListScroll();
      searchRef.current?.focus();
    } catch (error) {
      setInventoryError(inventoryErrorMessage(error, t));
    } finally {
      setInventoryBusy(false);
    }
  };

  const handleInventoryVerification = async (status, clientId) => {
    if (inventoryBusy) return;
    setInventoryBusy(true);
    setInventoryError('');
    try {
      const result = await verifyTrolleyInventory(sessionToken, inventory.id, selectedTrolley, status, clientId);
      await onRefresh?.();
      setInventoryFeedback(t('wash.fleet.inventory.verified', { trolley: formatTrolleyCode(selectedTrolley) }));
      if (result.completed_at && filter === 'review') setFilter(null);
      setQuery('');
      closeHistory(true);
    } catch (error) {
      setInventoryError(inventoryErrorMessage(error, t));
    } finally {
      setInventoryBusy(false);
    }
  };

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

  const selectedActive = selectedTrolley ? activeTrolleyByNo.get(String(selectedTrolley)) : null;
  const occupiedDays = daysSince(selectedActive?.dirty_received_at || selectedActive?.picked_up_at, today) ?? 0;
  const overdueDays = selectedActive?.wash_date && selectedActive.wash_date < operationalYmd()
    ? daysSince(selectedActive.wash_date)
    : 0;
  const needsPlanReview = selectedActive?.occupancy_source === 'arrival' && !selectedActive.wash_date && occupiedDays > 1;
  const activeClients = clients
    .filter(client => client?.id && !client.archived_at)
    .sort((left, right) => left.name.localeCompare(right.name, i18n.language));
  const { status: selectedStatus, recorded: selectedRecorded, check: selectedCheck } = trolleyFleetStatus(selectedTrolley, selectedActive, inventory);
  const { Icon: SelectedStatusIcon, label: selectedStatusLabel } = fleetStatusDetails(selectedStatus, selectedActive);
  const inInventory = inventory?.trolley_nos.includes(selectedTrolley);
  const checkedCount = inventory ? Object.keys(inventory.checks).length : 0;

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
    <div className="ap-overlay fleet-overlay" onClick={() => { if (!inventoryBusy) onClose(); }}>
      <section className="fleet-modal" role="dialog" aria-modal="true" aria-labelledby="fleet-title" onClick={event => event.stopPropagation()}>
        <div className="fleet-content" ref={fleetContentRef} inert={Boolean(selectedTrolley)}>
          <header className="fleet-header">
            <div>
              <h2 id="fleet-title">{t('wash.fleet.title')}</h2>
              <p>{t('wash.fleet.subtitle', { count: trolleyCount })}</p>
            </div>
            <button ref={fleetCloseRef} type="button" className="fleet-icon-button fleet-close" onClick={onClose} disabled={inventoryBusy} aria-label={t('common.close')}>
              <X size={19} aria-hidden="true" />
            </button>
          </header>

          <div className="fleet-controls">
            {(inventory || (canForceReset && inventory === null)) && (
              <section className="fleet-inventory-bar" aria-label={t('wash.fleet.inventory.title')}>
                <div className="fleet-inventory-heading">
                  <ClipboardCheck size={18} aria-hidden="true" />
                  <div>
                    <strong>{t('wash.fleet.inventory.title')}</strong>
                    {inventory && (
                      <small>{t(inventory.completed_at ? 'wash.fleet.inventory.complete' : 'wash.fleet.inventory.progress', {
                        checked: checkedCount,
                        total: inventory.trolley_nos.length,
                      })}</small>
                    )}
                  </div>
                </div>
                <div className="fleet-inventory-actions">
                  {inventory && !inventory.completed_at && (
                    <button type="button" aria-pressed={filter === 'review'} onClick={() => {
                      setFilter(filter === 'review' ? null : 'review');
                      resetListScroll();
                    }}>{t('wash.fleet.inventory.review')} <strong>{counts.review}</strong></button>
                  )}
                  {counts.conflict > 0 && (
                    <button type="button" aria-pressed={filter === 'conflict'} onClick={() => {
                      setFilter(filter === 'conflict' ? null : 'conflict');
                      resetListScroll();
                    }}>{t('wash.fleet.inventory.conflicts')} <strong>{counts.conflict}</strong></button>
                  )}
                  {canForceReset && (!inventory || inventory.completed_at) && !inventoryStartOpen && (
                    <button type="button" onClick={() => {
                      setInventoryError('');
                      setInventoryFeedback('');
                      setInventoryStartOpen(true);
                    }}>{t('wash.fleet.inventory.start')}</button>
                  )}
                </div>
                {inventoryStartOpen && (
                  <div className="fleet-inventory-confirm">
                    <p>{t('wash.fleet.inventory.startDescription')}</p>
                    {inventoryError && <small className="fleet-inventory-error" role="alert">{inventoryError}</small>}
                    <div className="fleet-inventory-actions">
                      <button type="button" disabled={inventoryBusy} onClick={() => {
                        setInventoryStartOpen(false);
                        setInventoryError('');
                      }}>{t('common.cancel')}</button>
                      <button ref={inventoryStartRef} type="button" className="fleet-inventory-button" disabled={inventoryBusy} onClick={handleInventoryStart}>
                        {t(inventoryBusy ? 'wash.fleet.actions.saving' : 'wash.fleet.inventory.start')}
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}
            <div className="fleet-filters" role="group" aria-label={t('wash.fleet.filterLabel')}>
              {Object.entries(FLEET_STATUSES).map(([status, { Icon, filter: label }]) => (
                <button
                  key={status}
                  type="button"
                  className="fleet-filter"
                  data-status={status}
                  aria-pressed={filter === status}
                  onClick={() => {
                    setFilter(filter === status ? null : status);
                    resetListScroll();
                  }}
                >
                  <span className="fleet-filter-icon"><Icon size={17} aria-hidden="true" /></span>
                  <span className="fleet-filter-label">{t(`wash.fleet.${label}`)}</span>
                  <strong>{counts[status]}</strong>
                </button>
              ))}
            </div>

            <div className="fleet-toolbar">
              <form className="fleet-search" role="search" onSubmit={event => {
                event.preventDefault();
                if (!canForceReset || inventoryStartOpen || inventoryBusy) return;
                openScannedTrolley(query);
              }}>
                <Search size={17} aria-hidden="true" />
                <input
                  ref={searchRef}
                  type="search"
                  aria-label={t(inventory && canForceReset ? 'wash.fleet.inventory.scan' : 'wash.fleet.search')}
                  placeholder={t(inventory && canForceReset ? 'wash.fleet.inventory.scan' : 'wash.fleet.search')}
                  value={query}
                  onChange={event => {
                    setQuery(event.target.value);
                    resetListScroll();
                  }}
                />
                {query && (
                  <button
                    type="button"
                    className="fleet-icon-button"
                    aria-label={t('wash.fleet.clearSearch')}
                    onClick={() => {
                      setQuery('');
                      resetListScroll();
                      searchRef.current?.focus();
                    }}
                  >
                    <X size={15} aria-hidden="true" />
                  </button>
                )}
              </form>
              <label className="fleet-sort">
                <span>{t('wash.fleet.sortLabel')}</span>
                <select value={sort} onChange={event => {
                  setSort(event.target.value);
                  resetListScroll();
                }}>
                  <option value="number">{t('wash.fleet.sortNumber')}</option>
                  <option value="oldest">{t('wash.fleet.sortOldest')}</option>
                </select>
              </label>
            </div>

            <div className="fleet-results">
              <span role="status">{inventoryFeedback || t('wash.fleet.results', { shown: visibleTrolleys.length, total: trolleyCount })}</span>
              {(filter || query) && (
                <button type="button" onClick={() => {
                  searchRef.current?.focus();
                  setFilter(null);
                  setQuery('');
                  resetListScroll();
                }}>{t('wash.fleet.showAll')}</button>
              )}
            </div>
          </div>

          <div className="fleet-list-scroll" ref={fleetListRef}>
            {visibleTrolleys.length > 0 ? (
              <div className="fleet-list">
                <div className="fleet-list-heading" aria-hidden="true">
                  <span>{t('wash.fleet.columnTrolley')}</span>
                  <span>{t('wash.fleet.currentStatus')}</span>
                  <span>{t('wash.fleet.actions.clientLabel')}</span>
                  <span>{t('wash.fleet.columnStay')}</span>
                  <span><History size={16} /></span>
                </div>
                <ul aria-label={t('wash.fleet.title')}>
                  {visibleTrolleys.map(({ trolleyNo, code, active, status, recorded, clientName, atClientDays }) => {
                    const { Icon, label } = fleetStatusDetails(status, active);
                    const recordedText = recorded === 'free'
                      ? t('wash.fleet.inventory.noAssignment')
                      : t(`wash.fleet.${fleetStatusDetails(recorded, active).label}`);
                    const rowDetail = status === 'review' || status === 'conflict'
                      ? [recordedText, clientName].filter(Boolean).join(' · ')
                      : clientName;
                    const duration = atClientDays === null ? null
                      : atClientDays === 0 ? t('wash.fleet.leftToday')
                      : atClientDays === 1 ? t('wash.fleet.sinceYesterday')
                      : t('wash.fleet.daysAtClient', { count: atClientDays });

                    return (
                      <li key={trolleyNo}>
                        <button
                          type="button"
                          className="fleet-row"
                          data-status={status}
                          aria-haspopup="dialog"
                          onClick={event => openTrolley(trolleyNo, event.currentTarget)}
                        >
                          <strong className="fleet-code">{code}</strong>
                          <span className="fleet-row-status"><Icon size={14} aria-hidden="true" />{t(`wash.fleet.${label}`)}</span>
                          <span className="fleet-client" title={rowDetail || undefined}>
                            {rowDetail || <span className="fleet-list-dash" aria-hidden="true">—</span>}
                          </span>
                          <span className="fleet-stay" data-long-stay={atClientDays > 5 || undefined}>
                            {duration || <span className="fleet-list-dash" aria-hidden="true">—</span>}
                          </span>
                          <span className="fleet-row-history">
                            <span className="sr-only">{t('wash.fleet.openHistory')}</span>
                            <ChevronRight size={17} aria-hidden="true" />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <div className="fleet-empty">
                <Search size={24} aria-hidden="true" />
                <strong>{t('wash.fleet.empty')}</strong>
              </div>
            )}
          </div>
        </div>

        {selectedTrolley && (
          <div className="fleet-history-backdrop" onClick={() => { if (!inventoryBusy) closeHistory(); }}>
            <aside
              ref={historyPanelRef}
              className="fleet-history-panel"
              data-inventory={canForceReset && inInventory || undefined}
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
                <button ref={historyCloseRef} type="button" className="fleet-icon-button fleet-close" onClick={() => closeHistory()} disabled={inventoryBusy} aria-label={t('common.close')}>
                  <X size={19} aria-hidden="true" />
                </button>
              </header>

              <div className="fleet-history-current" data-status={selectedStatus}>
                <span className="fleet-history-current-icon"><SelectedStatusIcon size={18} aria-hidden="true" /></span>
                <div>
                  <span>{t('wash.fleet.currentStatus')}</span>
                  <strong>{t(`wash.fleet.${selectedStatusLabel}`)}</strong>
                  {(selectedStatus === 'review' || selectedStatus === 'conflict') && (
                    <small>
                      {t('wash.fleet.inventory.recorded', {
                        status: selectedRecorded === 'free' ? t('wash.fleet.inventory.noAssignment')
                          : t(`wash.fleet.${fleetStatusDetails(selectedRecorded, selectedActive).label}`),
                      })}
                    </small>
                  )}
                  {(selectedActive?.client_name || (selectedStatus === 'atClient' && selectedCheck?.client_name)) && (
                    <small><MapPin size={12} aria-hidden="true" /> {selectedActive?.client_name || selectedCheck.client_name}</small>
                  )}
                  {selectedStatus === 'conflict' && (
                    <small>{t('wash.fleet.inventory.mismatch', {
                      status: t(`wash.fleet.${OBSERVED_LABELS[selectedCheck.status]}`),
                      client: selectedCheck.client_name ? ` · ${selectedCheck.client_name}` : '',
                    })}</small>
                  )}
                </div>
              </div>

              {canForceReset && inInventory && (
                <TrolleyInventoryCheck
                  key={`${inventory.id}-${selectedTrolley}`}
                  check={selectedCheck?.movement_since_check ? null : selectedCheck}
                  active={selectedActive}
                  clients={activeClients}
                  busy={inventoryBusy || actionBusy}
                  error={inventoryError}
                  onVerify={handleInventoryVerification}
                />
              )}

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
      </section>
    </div>
  );
}
