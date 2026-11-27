import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronRight, ClipboardCheck, History, ScanBarcode, ShieldAlert } from 'lucide-react';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { currentLocale } from '../lib/dateUtils';
import { finishTrolleyInventory, recordTrolleyInventoryObservation, startTrolleyInventory } from '../lib/laundryRpc';
import { formatTrolleyCode, parseTrolleyCode } from '../lib/trolleyCodes';
import { trolleyInventoryFoundCount, trolleyInventoryRoundStatus } from '../lib/trolleyOccupancy';
import './TrolleyInventoryView.css';

const INVENTORY_KEY = 'wash.fleet.inventory';
const FILTERS = {
  present: { label: 'seen', Icon: Check },
  review: { label: 'review', Icon: ScanBarcode },
  issues: { label: 'issues', Icon: ShieldAlert },
};

function recordedLabel(active, t) {
  let label = 'inventory.noAssignment';
  if (active) {
    if (active.status === 'returning_to_laundry') label = 'returningToLaundry';
    else if (active.occupancy_source === 'arrival') label = 'dirtyAtLaundry';
    else if (active.status === 'at_client') label = 'left';
    else if (active.released_at || active.status === 'released') label = 'inventory.inTransit';
    else label = 'inUse';
  }
  return [t(`wash.fleet.${label}`), active?.client_name].filter(Boolean).join(' · ');
}

function inventoryErrorMessage(error, t) {
  switch (error?.message) {
    case 'trolley_inventory_changed': return t(`${INVENTORY_KEY}.changed`);
    case 'trolley_inventory_not_expected': return t(`${INVENTORY_KEY}.notExpected`);
    case 'trolley_inventory_invalid_number': return t(`${INVENTORY_KEY}.numberNotFound`);
    default: return t(`${INVENTORY_KEY}.error`);
  }
}

export default function TrolleyInventoryView({
  inventory,
  activeTrolleyByNo,
  sessionToken,
  canEdit,
  canCorrect,
  loading,
  loadError,
  historyOpen,
  onRefresh,
  onOpenHistory,
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('round');
  const [scan, setScan] = useState('');
  const [selectedNo, setSelectedNo] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState(null);
  const scanRef = useRef(null);
  const pendingScansRef = useRef([]);
  const actionRef = useRef(null);

  const round = Array.isArray(inventory?.expected_trolley_nos) ? inventory : null;
  const canRecord = Boolean(round && !round.completed_at && canEdit && !loadError);
  const rows = round?.trolley_nos.map(no => {
    const active = activeTrolleyByNo.get(no);
    const status = trolleyInventoryRoundStatus(no, active, round);
    return { no, active, status };
  }) ?? [];
  const matchesFilter = (row, key) => {
    if (key === 'present') return row.status === 'present' || row.status === 'conflict';
    if (key === 'issues') return row.status === 'missing' || row.status === 'conflict';
    return row.status === key;
  };
  const selected = rows.find(row => row.no === selectedNo);
  const foundCount = trolleyInventoryFoundCount(round);
  const visibleRows = rows.filter(row => (
    filter === 'all' || (filter === 'round' ? row.status !== 'outside' : matchesFilter(row, filter))
  ));
  const dateFormat = new Intl.DateTimeFormat(currentLocale(), {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Warsaw',
  });

  const focusScan = () => requestAnimationFrame(() => scanRef.current?.focus());

  const runRoundAction = async (action) => {
    if (actionRef.current || loadError || !canEdit) return;
    actionRef.current = 'round';
    setBusy('round');
    setError('');
    try {
      if (action === 'start') {
        await startTrolleyInventory(sessionToken, inventory?.id);
        setFilter('round');
        setSelectedNo(null);
        setFeedback(null);
      } else {
        await finishTrolleyInventory(sessionToken, round.id);
      }
      await onRefresh();
      if (action === 'start') focusScan();
    } catch (error) {
      setError(inventoryErrorMessage(error, t));
      if (error?.message === 'trolley_inventory_changed') await onRefresh();
    } finally {
      actionRef.current = null;
      setBusy(null);
    }
  };

  const saveObservation = async (no, status) => {
    if (!canRecord || actionRef.current === 'round') return;
    pendingScansRef.current.push({ no, status, inventoryId: round.id });
    setSelectedNo(no);
    setScan('');
    setError('');
    if (actionRef.current) return;
    actionRef.current = 'observation';
    setBusy('observation');
    try {
      while (pendingScansRef.current.length) {
        const next = pendingScansRef.current.shift();
        try {
          await recordTrolleyInventoryObservation(sessionToken, next.inventoryId, next.no, next.status);
          setFeedback(next);
        } catch (error) {
          setError(inventoryErrorMessage(error, t));
          if (error?.message === 'trolley_inventory_changed') pendingScansRef.current = [];
        }
        if (!pendingScansRef.current.length) await onRefresh();
      }
    } finally {
      actionRef.current = null;
      setBusy(null);
    }
  };

  const readTrolleyNumber = input => {
    const no = parseTrolleyCode(input);
    if (no && round.trolley_nos.includes(no)) return no;
    setError(t(`${INVENTORY_KEY}.numberNotFound`));
    return null;
  };

  useBarcodeScanner({
    enabled: canRecord && busy !== 'round' && !historyOpen,
    onScan: (code, event) => {
      const no = readTrolleyNumber(code);
      if (!no) return;
      event.preventDefault();
      void saveObservation(no, 'present');
    },
  });

  return (
    <section className="trolley-inventory" aria-labelledby="trolley-inventory-title">
      <header className="trolley-inventory-summary">
        <div className="trolley-inventory-heading">
          <span className="trolley-inventory-icon"><ClipboardCheck size={22} aria-hidden="true" /></span>
          <div>
            <h2 id="trolley-inventory-title">{t(`${INVENTORY_KEY}.pageTitle`)}</h2>
            {round && <p>{t(`${INVENTORY_KEY}.${round.completed_at ? 'finishedAt' : 'startedAt'}`, {
              date: dateFormat.format(new Date(round.completed_at || round.started_at)),
            })}</p>}
          </div>
        </div>
        {round && <strong className="trolley-inventory-count" role="status">{t(`${INVENTORY_KEY}.foundCount`, { count: foundCount })}</strong>}
        {canEdit && inventory !== undefined && !loadError && (
          <button className="trolley-inventory-button is-primary" type="button" disabled={Boolean(busy)} onClick={() => {
            void runRoundAction(canRecord ? 'finish' : 'start');
          }}>{t(`${INVENTORY_KEY}.${canRecord ? 'finish' : round ? 'newCount' : 'start'}`)}</button>
        )}
        {loadError && (
          <div className="trolley-inventory-notice" role="alert">
            <p>{t(`${INVENTORY_KEY}.loadError`)}</p>
            <button type="button" className="trolley-inventory-button" onClick={onRefresh}>{t('common.refresh')}</button>
          </div>
        )}
        {!round && !loadError && (
          <p className="trolley-inventory-notice" role="status">
            {t(loading ? 'common.loading' : `${INVENTORY_KEY}.${inventory === undefined ? 'setupMissing' : 'notStarted'}`)}
          </p>
        )}
        {!round && error && <p className="trolley-inventory-error" role="alert">{error}</p>}
      </header>

      {round && (
        <div className="trolley-inventory-workspace">
          <div className="trolley-inventory-station">
            <form className="trolley-inventory-scanner" onSubmit={event => {
              event.preventDefault();
              const no = readTrolleyNumber(scan);
              if (!no) return;
              if (canRecord) void saveObservation(no, 'present');
              else {
                setSelectedNo(no);
                setError('');
                setScan('');
              }
            }}>
              <label htmlFor="inventory-scan">{t(`${INVENTORY_KEY}.${canRecord ? 'scan' : 'lookup'}`)}</label>
              <div>
                <ScanBarcode size={20} aria-hidden="true" />
                <input id="inventory-scan" ref={scanRef} type="search" value={scan} autoComplete="off"
                  onChange={event => setScan(event.target.value)} />
                <button type="submit" className="trolley-inventory-button" disabled={!scan.trim() || busy === 'round'}>
                  {t(`${INVENTORY_KEY}.${canRecord ? 'isHere' : 'openTrolley'}`)}
                </button>
              </div>
              <span role="status" className="trolley-inventory-ready" hidden={busy !== 'observation' && !feedback}>
                {busy === 'observation' ? t('wash.fleet.actions.saving') : feedback && t(
                  `${INVENTORY_KEY}.${feedback.status === 'missing' ? 'markedMissing' : 'verified'}`,
                  { trolley: formatTrolleyCode(feedback.no) },
                )}
              </span>
              {error && <p className="trolley-inventory-error" role="alert">{error}</p>}
            </form>
            {selected && (
              <div className="trolley-inventory-detail">
                <div className="trolley-inventory-detail-heading">
                  <h3>{formatTrolleyCode(selected.no)}</h3>
                  <button className="trolley-inventory-history" type="button" onClick={() => onOpenHistory(selected.no)}>
                    <History size={16} aria-hidden="true" />
                    {t(selected.status === 'conflict' && canCorrect ? `${INVENTORY_KEY}.reviewAssignment` : 'wash.fleet.openHistory')}
                  </button>
                </div>
                <p className="trolley-inventory-recorded" data-group={selected.status}>
                  {t(`${INVENTORY_KEY}.recorded`, { status: recordedLabel(selected.active, t) })}
                </p>
                {round.last_seen_at[selected.no] && <p className="trolley-inventory-observed">
                  {t(`${INVENTORY_KEY}.lastSeen`, { date: dateFormat.format(new Date(round.last_seen_at[selected.no])) })}
                </p>}
                {selected.status === 'missing' && <p className="trolley-inventory-observed">
                  {t(`${INVENTORY_KEY}.missing`)} · {dateFormat.format(new Date(round.observations[selected.no].observed_at))}
                </p>}
                {canRecord && (
                  <div className="trolley-inventory-actions">
                    <button type="button" className="trolley-inventory-button is-primary"
                      disabled={Boolean(busy) || (round.observations[selected.no]?.status === 'present' && !round.observations[selected.no].movement_since_check)}
                      onClick={() => void saveObservation(selected.no, 'present')}>{t(`${INVENTORY_KEY}.isHere`)}</button>
                    {round.expected_trolley_nos.includes(selected.no) && (
                      <button type="button" className="trolley-inventory-button"
                        disabled={Boolean(busy) || (selected.status === 'missing' && round.packing_holds.includes(selected.no))}
                        onClick={() => void saveObservation(selected.no, 'missing')}>{t(`${INVENTORY_KEY}.missing`)}</button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <section className="trolley-inventory-queue" aria-labelledby="inventory-queue-title">
            <header>
              <h3 id="inventory-queue-title">{t(`${INVENTORY_KEY}.queue`)}</h3>
              <button type="button" className="trolley-inventory-button" aria-pressed={filter === 'all'}
                onClick={() => setFilter(filter === 'all' ? 'round' : 'all')}>{t('wash.fleet.showAll')}</button>
            </header>
            <div className="trolley-inventory-filters" role="group" aria-label={t('wash.fleet.filterLabel')}>
              {Object.entries(FILTERS).map(([key, { Icon, label }]) => (
                <button type="button" key={key} aria-pressed={filter === key} onClick={() => setFilter(filter === key ? 'round' : key)}>
                  <Icon size={15} aria-hidden="true" />
                  <strong>{rows.filter(row => matchesFilter(row, key)).length}</strong>
                  <span>{t(`${INVENTORY_KEY}.${label}`)}</span>
                </button>
              ))}
            </div>
            {visibleRows.length ? (
              <ul className="trolley-inventory-list">
                {visibleRows.map(row => (
                  <li key={row.no}>
                    <button type="button" aria-pressed={selectedNo === row.no} onClick={() => {
                      setSelectedNo(row.no);
                      setError('');
                    }}>
                      <strong>{formatTrolleyCode(row.no)}</strong>
                      <span className="trolley-inventory-list-location">{recordedLabel(row.active, t)}</span>
                      <span className="trolley-inventory-row-status" data-group={row.status}>{t(
                        `${INVENTORY_KEY}.${row.status === 'present' ? 'seenRow' : row.status === 'review' ? 'unconfirmed' : row.status}`,
                      )}</span>
                      <ChevronRight className="trolley-inventory-row-arrow" size={16} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="trolley-inventory-ready">{t(`${INVENTORY_KEY}.noMatches`)}</p>}
          </section>
        </div>
      )}
    </section>
  );
}
