import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, Check, ChevronRight, ClipboardCheck, History, ScanBarcode, ShieldAlert, Truck, WashingMachine } from 'lucide-react';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { currentLocale } from '../lib/dateUtils';
import { startTrolleyInventory, verifyTrolleyInventory } from '../lib/laundryRpc';
import { formatTrolleyCode, parseTrolleyCode } from '../lib/trolleyCodes';
import { trolleyFleetStatus, TROLLEY_INVENTORY_LABELS } from '../lib/trolleyOccupancy';
import './TrolleyInventoryView.css';

const FILTERS = {
  review: { label: 'review', Icon: ScanBarcode },
  verified: { label: 'checked', Icon: Check },
  conflict: { label: 'conflicts', Icon: ShieldAlert },
};

const STATUS_ICONS = {
  free_at_laundry: Check,
  at_client: Archive,
  in_use: Truck,
  dirty_at_laundry: WashingMachine,
};

const RECORDED_LABELS = {
  free: 'inventory.noAssignment',
  atClient: 'left',
  inUse: 'inUse',
  dirty: 'dirtyAtLaundry',
};

function recordedLabel(active, recorded, t) {
  const label = active?.status === 'returning_to_laundry' ? 'returningToLaundry' : RECORDED_LABELS[recorded];
  return [t(`wash.fleet.${label}`), active?.client_name].filter(Boolean).join(' · ');
}

function inventoryErrorMessage(error, t) {
  if (error?.message === 'trolley_inventory_changed') return t('wash.fleet.inventory.changed');
  if (error?.message === 'trolley_inventory_invalid_client') return t('wash.fleet.inventory.invalidClient');
  return t('wash.fleet.inventory.error');
}

function TrolleyCheckForm({ active, check, clients, onSave, disabled, busy, error }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState(check?.status || '');
  const [clientId, setClientId] = useState(() => clients.find(client => (
    client.name === (check?.client_name ?? active?.client_name)
  ))?.id || '');
  const canSave = Boolean(status && (status !== 'at_client' || clientId));

  return (
    <form className="trolley-inventory-check" onSubmit={event => {
      event.preventDefault();
      if (canSave && !disabled) onSave(status, clientId);
    }}>
      <fieldset disabled={disabled}>
        <legend>{t('wash.fleet.inventory.observed')}</legend>
        <div className="trolley-inventory-choices">
          {Object.entries(TROLLEY_INVENTORY_LABELS).map(([value, label]) => {
            const Icon = STATUS_ICONS[value];
            return (
              <label key={value}>
                <input type="radio" name="trolley-inventory-location" value={value} checked={status === value} onChange={() => setStatus(value)} />
                <span><Icon size={17} aria-hidden="true" />{t(`wash.fleet.${label}`)}</span>
              </label>
            );
          })}
        </div>
        {status === 'at_client' && (
          <label className="trolley-inventory-client">
            {t('wash.fleet.actions.clientLabel')}
            <select value={clientId} onChange={event => setClientId(event.target.value)}>
              <option value="">{t('wash.fleet.actions.clientPlaceholder')}</option>
              {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
          </label>
        )}
      </fieldset>
      {error && <p className="trolley-inventory-error" role="alert">{error}</p>}
      <button className="trolley-inventory-button is-primary" type="submit" disabled={disabled || !canSave}>
        {t(busy ? 'wash.fleet.actions.saving' : 'wash.fleet.inventory.verify')}
      </button>
    </form>
  );
}

export default function TrolleyInventoryView({
  inventory,
  trolleyCount,
  activeTrolleyByNo,
  sessionToken,
  clients,
  canEdit,
  loading,
  loadError,
  historyOpen,
  onRefresh,
  onOpenHistory,
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState(null);
  const [scan, setScan] = useState('');
  const [selectedNo, setSelectedNo] = useState(null);
  const [startRequest, setStartRequest] = useState(null);
  const [busy, setBusy] = useState(false);
  const [startError, setStartError] = useState('');
  const [lookupError, setLookupError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [verifiedNo, setVerifiedNo] = useState(null);
  const scanRef = useRef(null);
  const selectedTitleRef = useRef(null);
  const startButtonRef = useRef(null);
  const startConfirmRef = useRef(null);

  const locale = currentLocale();
  const counts = { review: 0, verified: 0, conflict: 0 };
  const rows = inventory?.trolley_nos.map(no => {
    const active = activeTrolleyByNo.get(no);
    const { status, recorded, check } = trolleyFleetStatus(no, active, inventory);
    const group = status === 'review' || status === 'conflict' ? status : 'verified';
    counts[group] += 1;
    return { no, active, recorded, check, group, code: formatTrolleyCode(no) };
  }) ?? [];
  const currentFilter = filter ?? (counts.review ? 'review' : counts.conflict ? 'conflict' : 'all');
  const visibleRows = currentFilter === 'all' ? rows : rows.filter(row => row.group === currentFilter);
  const selected = rows.find(row => row.no === selectedNo);
  const total = rows.length;
  const checked = total - counts.review;
  const writesDisabled = busy || Boolean(loadError);
  const activeClients = clients.filter(client => client?.id && !client.archived_at)
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  const startTime = inventory?.started_at && new Date(inventory.started_at).toLocaleString(locale, {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Warsaw',
  });

  const focusScan = () => requestAnimationFrame(() => scanRef.current?.focus());
  const openTrolley = no => {
    setSelectedNo(no);
    setLookupError('');
    setSaveError('');
    setVerifiedNo(null);
    setScan('');
    requestAnimationFrame(() => selectedTitleRef.current?.focus());
  };

  const openScannedTrolley = (input, reportInvalid = true) => {
    const no = parseTrolleyCode(input);
    if (no && inventory?.trolley_nos.includes(no)) {
      openTrolley(no);
      return true;
    }
    if (reportInvalid) setLookupError(t('wash.fleet.inventory.numberNotFound'));
    return false;
  };

  useBarcodeScanner({
    enabled: Boolean(inventory && !busy && !historyOpen && !startRequest),
    onScan: (code, event) => {
      if (openScannedTrolley(code, false)) event.preventDefault();
    },
  });

  const handleStart = async () => {
    if (writesDisabled || !canEdit || !startRequest) return;
    setBusy(true);
    setStartError('');
    try {
      await startTrolleyInventory(sessionToken, startRequest.previousId);
      await onRefresh();
      setStartRequest(null);
      setSelectedNo(null);
      setVerifiedNo(null);
      setFilter(null);
      setLookupError('');
      focusScan();
    } catch (error) {
      setStartError(inventoryErrorMessage(error, t));
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async (status, clientId) => {
    if (writesDisabled || !canEdit || !selected) return;
    setBusy(true);
    setSaveError('');
    try {
      const result = await verifyTrolleyInventory(sessionToken, inventory.id, selected.no, status, clientId);
      await onRefresh();
      setVerifiedNo(selected.no);
      setSelectedNo(null);
      if (result.completed_at && currentFilter === 'review') setFilter(null);
      focusScan();
    } catch (error) {
      if (error?.message === 'trolley_inventory_changed') {
        await onRefresh();
        setSelectedNo(null);
        setLookupError(inventoryErrorMessage(error, t));
        focusScan();
      } else {
        setSaveError(inventoryErrorMessage(error, t));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="trolley-inventory" aria-labelledby="trolley-inventory-title">
      <header className="trolley-inventory-summary">
        <div className="trolley-inventory-heading">
          <span className="trolley-inventory-icon"><ClipboardCheck size={22} aria-hidden="true" /></span>
          <div>
            <h2 id="trolley-inventory-title">{t('wash.fleet.inventory.pageTitle')}</h2>
            {inventory && <p>{t('wash.fleet.inventory.startedAt', { date: startTime })}</p>}
          </div>
        </div>

        {inventory && (
          <div className="trolley-inventory-progress">
            <strong role="status">{t(inventory.completed_at ? 'wash.fleet.inventory.complete' : 'wash.fleet.inventory.progress', { checked, total })}</strong>
            <progress max={total} value={checked} aria-label={t('wash.fleet.inventory.progressLabel')} />
          </div>
        )}

        {canEdit && inventory !== undefined && (!inventory || inventory.completed_at) && !startRequest && !loadError && (
          <button ref={startButtonRef} type="button" className="trolley-inventory-button is-primary" onClick={() => {
            setStartRequest({ previousId: inventory?.id });
            requestAnimationFrame(() => startConfirmRef.current?.focus());
          }}>
            {t(inventory ? 'wash.fleet.inventory.newCount' : 'wash.fleet.inventory.start')}
          </button>
        )}

        {startRequest && (
          <div className="trolley-inventory-start">
            <p>{t('wash.fleet.inventory.startDescription')}</p>
            {startError && <p className="trolley-inventory-error" role="alert">{startError}</p>}
            <div>
              <button type="button" className="trolley-inventory-button" disabled={busy} onClick={() => {
                setStartRequest(null);
                setStartError('');
                requestAnimationFrame(() => startButtonRef.current?.focus());
              }}>{t('common.cancel')}</button>
              <button ref={startConfirmRef} type="button" className="trolley-inventory-button is-primary" disabled={writesDisabled} onClick={handleStart}>
                {t(busy ? 'wash.fleet.actions.saving' : 'wash.fleet.inventory.start')}
              </button>
            </div>
          </div>
        )}

        {loadError && (
          <div className="trolley-inventory-notice" role="alert">
            <p>{t('wash.fleet.inventory.loadError')}</p>
            <button type="button" className="trolley-inventory-button" onClick={onRefresh}>{t('common.refresh')}</button>
          </div>
        )}
        {!inventory && !loadError && !startRequest && (
          <p className="trolley-inventory-notice" role="status">
            {t(loading ? 'common.loading' : inventory === undefined ? 'wash.fleet.inventory.setupMissing'
              : 'wash.fleet.inventory.notStarted', { count: trolleyCount })}
          </p>
        )}
      </header>

      {inventory && (
        <div className="trolley-inventory-workspace">
          <div className="trolley-inventory-station">
            <form className="trolley-inventory-scanner" onSubmit={event => {
              event.preventDefault();
              if (!busy) openScannedTrolley(scan);
            }}>
              <label htmlFor="inventory-scan">{t('wash.fleet.inventory.scan')}</label>
              <div>
                <ScanBarcode size={20} aria-hidden="true" />
                <input id="inventory-scan" ref={scanRef} type="search" value={scan} autoComplete="off" enterKeyHint="search" onChange={event => {
                  setScan(event.target.value);
                  setLookupError('');
                  setVerifiedNo(null);
                }} />
                <button type="submit" className="trolley-inventory-button" disabled={busy || !scan.trim()}>{t('wash.fleet.inventory.openTrolley')}</button>
              </div>
              {lookupError && <p className="trolley-inventory-error" role="alert">{lookupError}</p>}
            </form>
            <div className="trolley-inventory-detail">
              {selected ? (
                <>
                  <div className="trolley-inventory-detail-heading">
                    <h3 ref={selectedTitleRef} tabIndex={-1}>{selected.code}</h3>
                    <button className="trolley-inventory-history" type="button" onClick={() => onOpenHistory(selected.no)}>
                      <History size={16} aria-hidden="true" />{t('wash.fleet.openHistory')}
                    </button>
                  </div>
                  <p className="trolley-inventory-recorded">{t('wash.fleet.inventory.recorded', {
                    status: recordedLabel(selected.active, selected.recorded, t),
                  })}</p>
                  {selected.check && (
                    <p className="trolley-inventory-observed" data-group={selected.group}>
                      {t(selected.group === 'conflict' ? 'wash.fleet.inventory.mismatch' : 'wash.fleet.inventory.lastObservation', {
                        status: t(`wash.fleet.${TROLLEY_INVENTORY_LABELS[selected.check.status]}`),
                        client: selected.check.client_name ? ` · ${selected.check.client_name}` : '',
                      })}
                    </p>
                  )}
                  {canEdit && (
                    <TrolleyCheckForm key={`${inventory.id}-${selected.no}`} check={selected.check?.movement_since_check ? null : selected.check} active={selected.active}
                      clients={activeClients} onSave={handleSave} disabled={writesDisabled} busy={busy} error={saveError} />
                  )}
                </>
              ) : (
                <p className="trolley-inventory-ready" role="status">
                  {verifiedNo ? <><Check size={17} aria-hidden="true" />{t('wash.fleet.inventory.verified', { trolley: formatTrolleyCode(verifiedNo) })}</>
                    : t('wash.fleet.inventory.chooseTrolley')}
                </p>
              )}
            </div>
          </div>
          <section className="trolley-inventory-queue" aria-labelledby="inventory-queue-title">
            <header>
              <h3 id="inventory-queue-title">{t('wash.fleet.inventory.queue')}</h3>
              <button type="button" className="trolley-inventory-button" aria-pressed={currentFilter === 'all'} onClick={() => setFilter('all')}>
                {t('wash.fleet.showAll')}
              </button>
            </header>
            <div className="trolley-inventory-filters" role="group" aria-label={t('wash.fleet.filterLabel')}>
              {Object.entries(FILTERS).map(([group, { Icon, label }]) => (
                <button type="button" key={group} data-group={group} aria-pressed={currentFilter === group} onClick={() => setFilter(group)}>
                  <Icon size={15} aria-hidden="true" />
                  <strong>{counts[group]}</strong>
                  <span>{t(`wash.fleet.inventory.${label}`)}</span>
                </button>
              ))}
            </div>
            {visibleRows.length ? (
              <ul className="trolley-inventory-list">
                {visibleRows.map(row => {
                  const { Icon, label } = FILTERS[row.group];
                  return (
                    <li key={row.no}>
                      <button type="button" aria-pressed={selectedNo === row.no} disabled={busy} onClick={() => openTrolley(row.no)}>
                        <strong>{row.code}</strong>
                        <span className="trolley-inventory-list-location">{recordedLabel(row.active, row.recorded, t)}</span>
                        <span className="trolley-inventory-row-status" data-group={row.group}>
                          <Icon size={14} aria-hidden="true" />{t(`wash.fleet.inventory.${row.group === 'conflict' ? 'conflict' : label}`)}
                        </span>
                        <ChevronRight className="trolley-inventory-row-arrow" size={16} aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="trolley-inventory-ready" role="status">{t('wash.fleet.inventory.noMatches')}</p>}
          </section>
        </div>
      )}
    </section>
  );
}
