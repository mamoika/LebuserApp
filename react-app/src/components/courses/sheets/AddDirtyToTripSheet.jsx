import { useTranslation } from 'react-i18next';
import { tripDateInfo } from '../../../lib/tripUiHelpers';
import { toastSuccess } from '../../../lib/toast';
import { AddEntryModal } from '../../modals/EntryModals';

export default function AddDirtyToTripSheet({
  trip,
  clients,
  routes,
  onClose,
  onAdded,
}) {
  const { t } = useTranslation();
  const info = tripDateInfo(trip.trip_date);

  return (
    <AddEntryModal
      isOpen
      onClose={onClose}
      courseTripId={trip.id}
      defaultArrDay={info.arrDay}
      weekKey={info.weekKey}
      clients={clients.filter(client => client.route_id)}
      routes={routes}
      onAdded={async ({ clientName }) => {
        toastSuccess(t('course.sheets.dirtyAdded', { client: clientName }));
        await onAdded?.();
      }}
    />
  );
}
