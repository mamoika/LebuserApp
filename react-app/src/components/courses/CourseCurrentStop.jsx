import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, Navigation2, Package, Plus, RotateCcw, Truck } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { logAction } from '../../lib/logger';
import { formatPackInfoLabel } from '../../lib/courseLocale';
import {
  assignedTripForEntry, canManagePickupTasks, completedEntryIdsForTasks, dirtyEntriesForStop, entryAssignmentCaption, entryIdsForTasks, fmtTime, getPackInfo,
  isTripDriver, pendingEntryIdsForTasks, splitCleanTasks, sumTaskWeight, tasksDeliveredByUser,
} from '../../lib/courseTaskHelpers';
import { formatKg } from '../../lib/tripUiHelpers';
import { toastError, toastSuccess } from '../../lib/toast';
import { AddEntryModal, ViewEditEntryModal } from '../modals/EntryModals';
import { LaundryTypeChip, mapsUrlForStop } from './CourseUiBits';
import DeliverPromptSheet from './sheets/DeliverPromptSheet';
import PartialPickupSheet from './sheets/PartialPickupSheet';

function StopTaskCard({
  icon: Icon,
  tone,
  title,
  status,
  statusTone = 'pending',
  doneMeta,
  children,
  onUndo,
  undoDisabled,
  undoHint,
  undoLabel,
}) {
  return (
    <section className={`live-stop-task-card tone-${tone} ${statusTone === 'done' ? 'is-done' : statusTone === 'waiting' ? 'is-waiting' : 'is-active'}`}>
      <header className="live-stop-task-head">
        <span className={`live-stop-task-icon tone-${tone}`} aria-hidden="true"><Icon size={18} /></span>
        <div className="live-stop-task-title">
          <strong>{title}</strong>
          {status && <span className={`live-stop-task-status is-${statusTone}`}>{status}</span>}
        </div>
        {doneMeta && <span className="live-stop-task-done-meta">{doneMeta}</span>}
      </header>
      {(children || onUndo) && (
        <div className="live-stop-task-body">
          {children}
          {onUndo && (
            <button
              type="button"
              className="driver-undo-btn is-prominent"
              onClick={onUndo}
              disabled={undoDisabled}
              title={undoHint || undoLabel}
            >
              <RotateCcw size={14} aria-hidden="true" /> {undoLabel}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export default function CourseCurrentStop({
  stop,
  trip,
  stops,
  allTrips = [],
  user,
  sessionToken,
  entries,
  clients,
  allRoutes,
  busy,
  setBusy,
  onReload,
  onComplete,
  canComplete,
  partialOpen: partialOpenExternal = false,
  onPartialOpenChange,
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('de') ? 'de-DE' : 'pl-PL';
  const [partialOpenLocal, setPartialOpenLocal] = useState(false);
  const partialOpen = partialOpenExternal || partialOpenLocal;
  const setPartialOpen = value => {
    if (onPartialOpenChange) onPartialOpenChange(Boolean(value));
    else setPartialOpenLocal(Boolean(value));
  };
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [addEntryFor, setAddEntryFor] = useState(null);
  const [viewEntry, setViewEntry] = useState(null);
  const [noteEdit, setNoteEdit] = useState(null);

  const clean = useMemo(() => splitCleanTasks(stop?.tasks || []), [stop]);
  const packInfo = useMemo(() => getPackInfo(clean.pickup), [clean.pickup]);
  const packLabel = useMemo(() => formatPackInfoLabel(packInfo, t, locale), [packInfo, t, locale]);
  const pickupKg = sumTaskWeight(clean.pendingPickup.length ? clean.pendingPickup : clean.pickup);
  const hasPhysicalTrolley = clean.pickup.some(task => task.laundry_trolley_no && task.laundry_trolley_no !== 'brak');
  const hasDeliveryTrolleys = clean.pendingDelivery.some(task => task.laundry_trolley_cycle_id);
  const dirtyToday = useMemo(() => dirtyEntriesForStop(entries, stop.client_name, trip.trip_date), [entries, stop.client_name, trip.trip_date]);
  const pickupOwner = clean.pickup.map(task => task.picked_by).find(Boolean) || t('course.currentStop.otherDriver');
  const deliveryOwner = clean.delivery.map(task => task.delivered_by).find(Boolean) || t('course.currentStop.otherDriver');
  const canManagePickup = canManagePickupTasks(clean.pickup, user, trip);
  const canManageDelivery = canManagePickup && clean.completedPickup.length > 0;
  const deliveredByMe = tasksDeliveredByUser(clean.delivery, user?.name) || isTripDriver(user, trip);
  const pickupReady = clean.pendingPickup.length === 0 || clean.pendingPickup.every(() => packInfo.isReady);

  const pickupDone = clean.pendingPickup.length === 0 && clean.completedPickup.length > 0;
  const deliveryDone = clean.pendingDelivery.length === 0 && clean.completedDelivery.length > 0;
  const showDelivery = clean.delivery.length > 0 && clean.pendingPickup.length === 0;

  const completeHint = useMemo(() => {
    if (canComplete) return '';
    if (clean.pendingPickup.length > 0) return t('course.currentStop.completeHintPickup');
    if (clean.pendingDelivery.length > 0) return t('course.currentStop.completeHintDelivery');
    return t('course.driver.completeStopFirst');
  }, [canComplete, clean.pendingDelivery.length, clean.pendingPickup.length, t]);

  const dirtyTypes = useMemo(() => ({
    hasP: dirtyToday.some(entry => (entry.type || 'P') === 'P'),
    hasO: dirtyToday.some(entry => entry.type === 'O'),
    hasR: dirtyToday.some(entry => entry.type === 'R'),
  }), [dirtyToday]);

  const rpcEntries = async (fn, ids, success, logDetails) => {
    if (!ids.length) {
      toastError(t('course.currentStop.noEntries'));
      return;
    }
    try {
      setBusy(true);
      const { data, error } = await supabase.rpc(fn, { p_session_token: sessionToken, p_ids: ids });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const affected = data?.affected ?? 0;
      if (affected === 0) {
        throw new Error(t('course.currentStop.nothingAffected'));
      }
      if (affected < ids.length) {
        toastError(t('course.currentStop.partialAffected'));
      } else if (success) {
        toastSuccess(success);
      }
      if (logDetails) {
        await logAction({ sessionToken, action: logDetails.action, clientName: stop.client_name, entryId: ids[0], details: logDetails.details });
      }
      await onReload();
    } catch (error) {
      toastError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const pickupLaundry = async (leaveTrolley = false) => {
    const ids = entryIdsForTasks(clean.pendingPickup);
    const physicalTrolleys = [...new Set(clean.pendingPickup.map(task => task.laundry_trolley_no).filter(value => value && value !== 'brak'))];
    try {
      setBusy(true);
      const { data, error } = await supabase.rpc('driver_pickup_entries', {
        p_session_token: sessionToken,
        p_ids: ids,
        p_baskets: physicalTrolleys.length || 1,
        p_leave_trolley: hasPhysicalTrolley ? leaveTrolley : true,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toastSuccess(t('course.currentStop.pickupDone'));
      await onReload();
    } catch (error) {
      toastError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const undoPickup = async () => {
    if (clean.delivery.some(task => task.delivered)) {
      toastError(t('course.currentStop.undoDeliverBeforePickup'));
      return;
    }
    if (!canManagePickup) {
      toastError(t('course.currentStop.undoPickupOnly', { name: pickupOwner }));
      return;
    }
    await rpcEntries('driver_undo_pickup', completedEntryIdsForTasks(clean.completedPickup), t('course.currentStop.undoPickupDone'), { action: 'undone', details: 'cofnięto odbiór z pralni' });
  };

  const undoDeliver = async () => {
    if (!deliveredByMe) {
      toastError(t('course.currentStop.undoDeliverOnly', { name: deliveryOwner }));
      return;
    }
    await rpcEntries('driver_undo_deliver', entryIdsForTasks(clean.delivery), t('course.currentStop.undoDeliverDone'), { action: 'undone', details: 'cofnięto dostawę' });
  };

  const deliverLaundry = () => {
    if (hasDeliveryTrolleys) setDeliverOpen(true);
    else rpcEntries('driver_deliver_entries', pendingEntryIdsForTasks(clean.pendingDelivery), t('course.currentStop.deliverDone'), { action: 'delivered', details: 'dostawa do klienta' });
  };

  const saveClientNote = async value => {
    const { data, error } = await supabase.rpc('driver_set_client_note', {
      p_session_token: sessionToken,
      p_name: stop.client_name,
      p_note: value || null,
    });
    if (error) { toastError(t('course.currentStop.noteSaveError', { message: error.message })); return; }
    if (data?.error) { toastError(t('course.currentStop.noteSaveError', { message: data.error })); return; }
    setNoteEdit(null);
    await onReload();
  };

  const deleteDirty = async entry => {
    if (!window.confirm(t('course.currentStop.deleteConfirm', { name: stop.client_name }))) return;
    try {
      setBusy(true);
      const { data, error } = await supabase.rpc('driver_soft_delete_entry', { p_session_token: sessionToken, p_id: entry.id });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toastSuccess(t('course.currentStop.deleteDone'));
      await onReload();
    } catch (error) {
      toastError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const pickupAt = clean.pickup.find(task => task.completed_at)?.completed_at;
  const deliveryAt = clean.delivery.find(task => task.completed_at)?.completed_at;

  return (
    <>
      <article className="driver-focus-card live-stop-focus">
        <header className="live-stop-header">
          <h1 id="current-stop-title" className="driver-client-name">{stop.client_name}</h1>
          <div className="driver-address-row">
            <span className="driver-address-text">{stop.address || stop.note || t('course.currentStop.noAddress')}</span>
            <a className="driver-nav-btn" href={mapsUrlForStop(stop)} target="_blank" rel="noopener noreferrer">
              <Navigation2 size={15} aria-hidden="true" /> {t('course.currentStop.navigate')}
            </a>
          </div>
          <div className="driver-note-block">
            {noteEdit !== null ? (
              <textarea
                autoFocus
                rows={2}
                value={noteEdit}
                onChange={event => setNoteEdit(event.target.value)}
                onBlur={event => saveClientNote(event.target.value)}
                placeholder={t('course.currentStop.notePlaceholder')}
                className="live-note-input"
              />
            ) : stop.note ? (
              <button type="button" className="driver-note" onClick={() => setNoteEdit(stop.note || '')}>
                <AlertTriangle size={14} aria-hidden="true" /> {stop.note}
              </button>
            ) : (
              <button type="button" className="live-stop-note-add" onClick={() => setNoteEdit('')}>
                {t('course.currentStop.addNote')}
              </button>
            )}
          </div>
        </header>

        <div className="live-stop-tasks">
          {clean.pickup.length > 0 && (
            <StopTaskCard
              icon={Package}
              tone="pickup"
              title={t('course.currentStop.pickupSection')}
              status={pickupDone ? t('course.currentStop.statusDone') : t('course.currentStop.statusPending')}
              statusTone={pickupDone ? 'done' : packInfo.isReady ? 'active' : 'waiting'}
              doneMeta={pickupDone ? `✓ ${fmtTime(pickupAt)}` : null}
              onUndo={pickupDone ? undoPickup : null}
              undoDisabled={clean.delivery.some(task => task.delivered) || !canManagePickup}
              undoHint={clean.delivery.some(task => task.delivered) ? t('course.currentStop.undoDeliverFirst') : t('course.currentStop.pickupBy', { name: pickupOwner })}
              undoLabel={t('course.currentStop.undo')}
            >
              {!pickupDone && (
                <>
                  <div className={`live-pack-badge ${packInfo.isReady ? 'is-ready' : 'is-waiting'}`}>{packLabel}</div>
                  {pickupKg > 0 && (
                    <button
                      type="button"
                      className="live-kg-chip"
                      onClick={() => setPartialOpen(true)}
                      disabled={busy || !pickupReady}
                      title={t('course.currentStop.kgPartialHint')}
                    >
                      <strong>{formatKg(pickupKg)}</strong>
                      <span>kg</span>
                    </button>
                  )}
                  {hasPhysicalTrolley ? (
                    <div className="live-delivery-actions">
                      <button type="button" className="live-task-action" onClick={() => pickupLaundry(false)} disabled={busy || !pickupReady}>
                        <Package size={17} aria-hidden="true" /> {t('course.currentStop.pickupWithTrolley')}
                      </button>
                      <button type="button" className="live-task-action is-secondary" onClick={() => pickupLaundry(true)} disabled={busy || !pickupReady}>
                        {t('course.currentStop.leaveTrolley')}
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="live-task-action" onClick={() => pickupLaundry(true)} disabled={busy || !pickupReady}>
                      <Package size={17} aria-hidden="true" /> {pickupReady ? t('course.currentStop.pickupClean') : t('course.currentStop.pickupNotReady')}
                    </button>
                  )}
                </>
              )}
            </StopTaskCard>
          )}

          {showDelivery && (
            <StopTaskCard
              icon={Truck}
              tone="delivery"
              title={t('course.currentStop.deliverySection')}
              status={deliveryDone ? t('course.currentStop.statusDone') : t('course.currentStop.statusPending')}
              statusTone={deliveryDone ? 'done' : 'active'}
              doneMeta={deliveryDone ? `✓ ${fmtTime(deliveryAt)}` : null}
              onUndo={deliveryDone ? undoDeliver : null}
              undoDisabled={!deliveredByMe}
              undoHint={t('course.currentStop.deliverBy', { name: deliveryOwner })}
              undoLabel={t('course.currentStop.undo')}
            >
              {!deliveryDone && (
                <button
                  type="button"
                  className="live-task-action tone-delivery"
                  onClick={deliverLaundry}
                  disabled={busy || !clean.completedPickup.length || !canManageDelivery}
                >
                  <Truck size={17} aria-hidden="true" /> {hasDeliveryTrolleys ? t('course.currentStop.deliverWithTrolleys') : t('course.currentStop.deliverClean')}
                </button>
              )}
            </StopTaskCard>
          )}

          {clean.delivery.length > 0 && clean.pendingPickup.length > 0 && (
            <StopTaskCard
              icon={Truck}
              tone="delivery"
              title={t('course.currentStop.deliverySection')}
              status={t('course.currentStop.statusWaitingPickup')}
              statusTone="waiting"
            />
          )}

          <section className="live-stop-task-card tone-dirty is-dirty">
            <header className="live-stop-task-head">
              <span className="live-stop-task-icon tone-dirty" aria-hidden="true"><Plus size={18} /></span>
              <div className="live-stop-task-title">
                <strong>{t('course.currentStop.dirtySection')}</strong>
                {dirtyToday.length > 0 && (
                  <span className="live-stop-task-status is-active">{dirtyToday.length}</span>
                )}
              </div>
              <LaundryTypeChip {...dirtyTypes} />
            </header>
            <div className="live-stop-task-body">
              {dirtyToday.length === 0 ? (
                <div className="live-dirty-empty">{t('course.currentStop.noDirtyArrivals')}</div>
              ) : (
                <div className="live-dirty-list">
                  {dirtyToday.map(entry => {
                    const assigned = assignedTripForEntry(entry, { allTrips, trip });
                    const captionKey = entryAssignmentCaption(assigned);
                    const typeClass = `type-${entry.type || 'P'}`;
                    return (
                      <div className={`driver-arrival-chip ${typeClass}`} key={entry.id}>
                        <span className="driver-arrival-label">
                          <strong>{entry.type || 'P'}</strong>
                          {entry.weight ? ` · ${entry.weight} kg` : ''}
                          {captionKey && <span className="live-entry-assignment"> · {t(`course.assignment.${captionKey}`)}</span>}
                          {assigned?.label && <span className="live-entry-assignment-meta"> ({assigned.label})</span>}
                        </span>
                        <button type="button" className="driver-tool-btn" onClick={() => setViewEntry(entry)}>{t('course.edit')}</button>
                        <button type="button" className="driver-tool-btn" onClick={() => deleteDirty(entry)} disabled={busy}>{t('course.currentStop.delete')}</button>
                      </div>
                    );
                  })}
                </div>
              )}
              <button type="button" className="live-task-action is-secondary" onClick={() => setAddEntryFor(stop.client_name)} disabled={busy}>
                <Plus size={16} aria-hidden="true" /> {t('course.currentStop.addDirtyArrival')}
              </button>
            </div>
          </section>
        </div>
      </article>

      {!canComplete && completeHint && (
        <p className="live-stop-complete-hint" role="status">{completeHint}</p>
      )}
      <button className="driver-primary-btn" onClick={onComplete} disabled={busy || !canComplete}>
        <CheckCircle2 size={20} aria-hidden="true" /> {t('course.driver.completeStop')}
      </button>

      {partialOpen && (
        <PartialPickupSheet stop={stop} sessionToken={sessionToken} contextDate={trip.trip_date} onClose={() => setPartialOpen(false)} onDone={onReload} />
      )}
      {deliverOpen && (
        <DeliverPromptSheet stop={stop} pendingDelivery={clean.pendingDelivery} sessionToken={sessionToken} onClose={() => setDeliverOpen(false)} onDone={onReload} />
      )}
      {addEntryFor && (
        <AddEntryModal
          isOpen
          onClose={() => setAddEntryFor(null)}
          defaultArrDay={trip.trip_date ? new Date(`${trip.trip_date}T00:00:00`).getDay() : undefined}
          defaultClientName={addEntryFor}
          weekKey={undefined}
          clients={clients.filter(client => client.route_id)}
          routes={allRoutes}
          onAdded={async () => { setAddEntryFor(null); await onReload(); }}
        />
      )}
      {viewEntry && (
        <ViewEditEntryModal
          isOpen
          entry={viewEntry}
          routes={allRoutes}
          clients={clients}
          onClose={() => setViewEntry(null)}
          onUpdated={async () => { setViewEntry(null); await onReload(); }}
          onDeleted={async () => { setViewEntry(null); await onReload(); }}
          initiallyEditing
          entryAssignmentLabel={assignedTripForEntry(viewEntry, { allTrips, trip })?.label}
          entryAssignmentCaption={(() => {
            const key = entryAssignmentCaption(assignedTripForEntry(viewEntry, { allTrips, trip }));
            return key ? t(`course.assignment.${key}`) : t('course.assignment.willBring');
          })()}
        />
      )}
    </>
  );
}
