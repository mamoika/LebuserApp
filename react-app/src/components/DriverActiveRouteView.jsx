import { useTranslation } from 'react-i18next';
import { ChevronLeft, Navigation, Navigation2, Phone } from 'lucide-react';
import { buildGoogleMapsRouteSegments } from '../lib/googleMapsRoute';

// Using the same base coordinates as MapView for consistency if needed
const BASE_LAT = 52.7229319;
const BASE_LNG = 15.2520164;

export default function DriverActiveRouteView({ route, clients, trip, onBack }) {
  const { t } = useTranslation();

  // Sort clients by their order
  const sortedClients = [...clients]
    .filter(c => c.route_id === route.id)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const validGeoClients = sortedClients.filter(c => c.lat && c.lng);

  const routeSegments = buildGoogleMapsRouteSegments(
    { lat: BASE_LAT, lng: BASE_LNG },
    validGeoClients
  );

  return (
    <div className="driver-active-route-view">
      <header className="driver-active-header">
        <button type="button" className="driver-back-btn" onClick={onBack}>
          <ChevronLeft size={24} />
          <span>{t('common.back', 'Wróć')}</span>
        </button>
        <div className="driver-active-title">
          <h2>{route.name}</h2>
          <div className="driver-active-meta">
            {trip?.planned_start && <span>{t('activeRoute.start', { time: new Date(trip.planned_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}</span>}
            <span>{t('activeRoute.stops', { count: sortedClients.length })}</span>
          </div>
        </div>
      </header>

      {validGeoClients.length > 0 && (
        <div className="driver-route-actions">
          {routeSegments.map((segment, index) => {
            const isMultiple = routeSegments.length > 1;
            const label = isMultiple
              ? t('activeRoute.navigatePart', { current: index + 1, total: routeSegments.length })
              : t('activeRoute.openFullRoute');
            return (
              <a
                key={segment.url}
                href={segment.url}
                target="_blank"
                rel="noopener noreferrer"
                className="driver-btn-primary"
              >
                <Navigation size={18} />
                <span>{label}</span>
              </a>
            );
          })}
        </div>
      )}

      <div className="driver-stops-list">
        {sortedClients.map((client, index) => (
          <div key={client.id} className="driver-stop-card">
            <div className="driver-stop-number">{index + 1}</div>
            <div className="driver-stop-content">
              <h3>{client.name}</h3>
              {/* Optional fields if available in the future */}
              {client.address && <div className="driver-stop-address">{client.address}</div>}
              
              <div className="driver-stop-actions">
                {client.lat && client.lng ? (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${client.lat},${client.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="driver-btn-nav"
                  >
                    <Navigation2 size={16} />
                    <span>{t('activeRoute.navigate')}</span>
                  </a>
                ) : (
                  <span className="driver-no-gps">{t('activeRoute.noGps')}</span>
                )}
                
                {client.phone && (
                  <a href={`tel:${client.phone}`} className="driver-btn-phone">
                    <Phone size={16} />
                    <span>{t('activeRoute.call')}</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
        {sortedClients.length === 0 && (
          <div className="driver-empty-route">
            {t('activeRoute.noClients')}
          </div>
        )}
      </div>
    </div>
  );
}
