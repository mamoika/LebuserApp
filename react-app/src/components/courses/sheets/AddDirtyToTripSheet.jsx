import { callExistingTripRpc } from '../../../lib/courseRpc';
import { parseExtraClients, tripDateInfo } from '../../../lib/tripUiHelpers';
import { toastError, toastSuccess } from '../../../lib/toast';
import { AddEntryModal } from '../../modals/EntryModals';

export default function AddDirtyToTripSheet({
  trip,
  sessionToken,
  clients,
  routes,
  onClose,
  onAdded,
}) {
  const info = tripDateInfo(trip.trip_date);

  const attachClient = async clientName => {
    if (!clientName) return;
    const extras = parseExtraClients(trip.extra_clients);
    const next = JSON.stringify([...new Set([...extras, clientName])]);
    try {
      await callExistingTripRpc('driver_set_trip_extra_clients', sessionToken, {
        p_trip_id: trip.id,
        p_extra_clients: next,
      });
      toastSuccess(`Dodano odbiór brudnego: ${clientName}`);
      await onAdded?.();
      onClose();
    } catch (error) {
      toastError(error.message);
    }
  };

  return (
    <AddEntryModal
      isOpen
      onClose={onClose}
      defaultArrDay={info.arrDay}
      weekKey={info.weekKey}
      clients={clients.filter(client => client.route_id)}
      routes={routes}
      onAdded={async payload => { await attachClient(payload?.clientName); }}
    />
  );
}
