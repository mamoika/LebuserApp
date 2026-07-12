import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, Navigation2, Package, Truck } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { logAction } from '../../lib/logger';
import {
  assignedTripForEntry, canManagePickupTasks, completedEntryIdsForTasks, dirtyEntriesForStop, entryAssignmentCaption, entryIdsForTasks, fmtTime, getPackInfo,
  isTripDriver, pendingEntryIdsForTasks, splitCleanTasks, tasksDeliveredByUser,
} from '../../lib/courseTaskHelpers';
import { formatKg } from '../../lib/tripUiHelpers';
import { toastError, toastSuccess } from '../../lib/toast';
import { AddEntryModal, ViewEditEntryModal } from '../modals/EntryModals';
import DeliverPromptSheet from './sheets/DeliverPromptSheet';
import PartialPickupSheet from './sheets/PartialPickupSheet';

function mapsUrl(stop) {
  if (stop.lat != null && stop.lng != null && stop.lat !== '' && stop.lng !== '') {
    return `https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.address || stop.client_name)}`;
}

function ActionRow({ label, done, at, extra, children, onUndo, undoDisabled, undoHint }) {
  return (
    <div className="live-task-action-row">
      <div className="live-task-action-head">
        <strong>{label}</strong>
        {done && <span className="live-task-action-meta">✓ {fmtTime(at)}{extra ? ` · ${extra}` : ''}</span>}
      </div>
      {done && onUndo ? (
        <button className="driver-undo-btn" onClick={onUndo} disabled={undoDisabled} title={undoHint || 'Cofnij'}>↩ cofnij</button>
      ) : children}
    </div>
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
  const { t } = useTranslation();
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
  const pickupKg = sumTaskWeight(clean.pendingPickup.length ? clean.pendingPickup : clean.pickup);
  const hasPhysicalTrolley = clean.pickup.some(task => task.laundry_trolley_no && task.laundry_trolley_no !== 'brak');
  const hasDeliveryTrolleys = clean.pendingDelivery.some(task => task.laundry_trolley_cycle_id);
  const dirtyToday = useMemo(() => dirtyEntriesForStop(entries, stop.client_name, trip.trip_date), [entries, stop.client_name, trip.trip_date]);
  const pickupOwner = clean.pickup.map(task => task.picked_by).find(Boolean) || t('course.currentStop.otherDriver');
  const deliveryOwner = clean.delivery.map(task => task.delivered_by).find(Boolean) || t('course.currentStop.otherDriver');
  const canManagePickup = canManagePickupTasks(clean.pickup, user, trip);
  const canManageDelivery = canManagePickup && clean.completedPickup.length > 0;
  const deliveredByMe = tasksDeliveredByUser(clean.delivery, user?.name) || isTripDriver(user, trip);
  const pickupReady = clean.pendingPickup.length === 0 || clean.pendingPickup.every(task => packInfo.isReady);

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
      toastSuccess('Odebrano czyste pranie z pralni');
      await onReload();
    } catch (error) {
      toastError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const undoPickup = async () => {
    if (clean.delivery.some(task => task.delivered)) {
      toastError('Najpierw cofnij dostawę');
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
      toastError(`Cofnąć dostawę może tylko: ${deliveryOwner}`);
      return;
    }
    await rpcEntries('driver_undo_deliver', entryIdsForTasks(clean.delivery), 'Cofnięto dostawę', { action: 'undone', details: 'cofnięto dostawę' });
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
    if (error) { toastError(`Błąd zapisu notatki: ${error.message}`); return; }
    if (data?.error) { toastError(`Błąd zapisu notatki: ${data.error}`); return; }
    setNoteEdit(null);
    await onReload();
  };

  const deleteDirty = async entry => {
    if (!window.confirm(`Usunąć wpis dla ${stop.client_name}?`)) return;
    try {
      setBusy(true);
      const { data, error } = await supabase.rpc('driver_soft_delete_entry', { p_session_token: sessionToken, p_id: entry.id });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toastSuccess('Usunięto przyjazd');
      await onReload();
    } catch (error) {
      toastError(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <article className="driver-focus-card">
        <h1 id="current-stop-title" className="driver-client-name">{stop.client_name}</h1>
        <div className="driver-address-row">
          <span className="driver-address-text">{stop.address || stop.note || 'Brak zapisanego adresu'}</span>
          <a className="driver-nav-btn" href={mapsUrl(stop)} target="_blank" rel="noopener noreferrer"><Navigation2 size={15} /> Nawiguj</a>
        </div>

        <div className="driver-note-block">
          {noteEdit !== null ? (
            <textarea
              autoFocus
              rows={2}
              value={noteEdit}
              onChange={event => setNoteEdit(event.target.value)}
              onBlur={event => saveClientNote(event.target.value)}
              placeholder="Notatka do klienta…"
              className="live-note-input"
            />
          ) : (
            <button type="button" className="driver-note" onClick={() => setNoteEdit(stop.note || '')}>
              {stop.note ? <><AlertTriangle size={14} /> {stop.note}</> : 'Dodaj notatkę do klienta'}
            </button>
          )}
        </div>

        {clean.pickup.length > 0 && (
          <ActionRow
            label="Odbiór z pralni"
            done={clean.pendingPickup.length === 0 && clean.completedPickup.length > 0}
            at={clean.pickup.find(task => task.completed_at)?.completed_at}
            onUndo={clean.completedPickup.length > 0 ? undoPickup : null}
            undoDisabled={clean.delivery.some(task => task.delivered) || !canManagePickup}
            undoHint={clean.delivery.some(task => task.delivered) ? t('course.currentStop.undoDeliverFirst') : t('course.currentStop.pickupBy', { name: pickupOwner })}
          >
            <div className={`live-pack-badge ${packInfo.isReady ? 'is-ready' : 'is-waiting'}`}>{packInfo.text}</div>
            {clean.pendingPickup.length > 0 && (
              <>
                {pickupKg > 0 && (
                  <button type="button" className="driver-tool-btn" onClick={() => setPartialOpen(true)} disabled={busy || !pickupReady}>
                    {formatKg(pickupKg)} kg
                  </button>
                )}
                {hasPhysicalTrolley ? (
                  <div className="live-delivery-actions">
                    <button className="live-task-action" onClick={() => pickupLaundry(false)} disabled={busy || !pickupReady}><Package size={17} /> Zabieram z wózkiem</button>
                    <button className="live-task-action is-secondary" onClick={() => pickupLaundry(true)} disabled={busy || !pickupReady}>Wózek zostaje</button>
                  </div>
                ) : (
                  <button className="live-task-action" onClick={() => pickupLaundry(true)} disabled={busy || !pickupReady}>
                    <Package size={17} /> {pickupReady ? 'Odbierz czyste z pralni' : 'Pranie jeszcze niegotowe'}
                  </button>
                )}
              </>
            )}
          </ActionRow>
        )}

        {clean.delivery.length > 0 && clean.pendingPickup.length === 0 && (
          <ActionRow
            label="Dostarczono"
            done={clean.pendingDelivery.length === 0 && clean.completedDelivery.length > 0}
            at={clean.delivery.find(task => task.completed_at)?.completed_at}
            onUndo={clean.completedDelivery.length > 0 ? undoDeliver : null}
            undoDisabled={!deliveredByMe}
            undoHint={`Dostawę oznaczył: ${deliveryOwner}`}
          >
            {clean.pendingDelivery.length > 0 && (
              <button className="live-task-action" onClick={deliverLaundry} disabled={busy || !clean.completedPickup.length || !canManageDelivery}>
                <Truck size={17} /> {hasDeliveryTrolleys ? 'Dostarcz — wybierz wózki' : 'Dostarcz czyste'}
              </button>
            )}
          </ActionRow>
        )}

        <div className="live-dirty-block">
          <div className="driver-upcoming-title">Brudne pranie do pralni</div>
          {dirtyToday.length === 0 && <div className="driver-empty-row">Brak zarejestrowanych przyjazdów</div>}
          {dirtyToday.map(entry => {
            const assigned = assignedTripForEntry(entry, { allTrips, trip });
            const captionKey = entryAssignmentCaption(assigned);
            return (
            <div className="driver-arrival-chip" key={entry.id}>
              <span>
                {entry.type || 'P'}{entry.weight ? ` · ${entry.weight} kg` : ''}
                {captionKey && <span className="live-entry-assignment"> · {t(`course.assignment.${captionKey}`)}</span>}
                {assigned?.label && <span className="live-entry-assignment-meta"> ({assigned.label})</span>}
              </span>
              <button type="button" className="driver-tool-btn" onClick={() => setViewEntry(entry)}>{t('course.edit')}</button>
              <button type="button" className="driver-tool-btn" onClick={() => deleteDirty(entry)} disabled={busy}>{t('course.currentStop.delete')}</button>
            </div>
          );})}
          <button className="live-task-action is-secondary" onClick={() => setAddEntryFor(stop.client_name)} disabled={busy}>{t('course.currentStop.addDirtyArrival')}</button>
        </div>
      </article>

      <button className="driver-primary-btn" onClick={onComplete} disabled={busy || !canComplete}>
        <CheckCircle2 size={20} /> {canComplete ? t('course.driver.completeStop') : t('course.driver.completeStopFirst')}
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

function sumTaskWeight(tasks) {
  return Number(tasks.reduce((sum, task) => sum + (Number(task.quantity) || 0), 0).toFixed(1));
}
