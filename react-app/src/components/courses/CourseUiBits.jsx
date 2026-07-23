import { routeBadgeStyle } from '../../lib/visualSystem';

export function UrgentChip() {
  return <span className="driver-urgent-badge">Pilne</span>;
}

export function RouteChip({ routeId, routeMap }) {
  if (!routeId) return null;
  const info = routeMap?.[Number(routeId)];
  const display = info?.num || routeId;
  return (
    <span className="kurs-route-badge live-route-chip" style={routeBadgeStyle(display)}>
      T{display}
    </span>
  );
}

export function LaundryTypeChip({ hasP, hasO, hasF, hasR }) {
  const types = [
    hasP && 'P',
    hasO && 'O',
    hasF && 'F',
    hasR && 'R',
  ].filter(Boolean);
  if (!types.length) return null;
  const label = types.join('/');
  const tone = types.length > 1 ? 'type-P' : `type-${types[0]}`;
  return <span className={`laundry-type-badge ${tone}`}>{label}</span>;
}

export function TripProgressBar({ stats }) {
  const total = stats?.stops || 0;
  if (!total) return null;
  const pctPicked = Math.round(((stats.picked || 0) / total) * 100);
  const pctDelivered = Math.round(((stats.delivered || 0) / total) * 100);
  return (
    <div className="trip-progress live-trip-progress" title={`${stats.delivered}/${total} dostarczone · ${stats.picked}/${total} odebrane`}>
      <div className="trip-progress-picked" style={{ width: `${pctPicked}%` }} />
      <div className="trip-progress-delivered" style={{ width: `${pctDelivered}%` }} />
    </div>
  );
}

function Metric({ value, label, tone }) {
  return (
    <div className={`trip-metric ${tone ? `tone-${tone}` : ''}`}>
      <span className="trip-metric-val">{value}</span>
      <span className="trip-metric-label">{label}</span>
    </div>
  );
}

export function TripMetricsPanel({ stats }) {
  if (!stats) return null;
  return (
    <div className="trip-metric-groups live-trip-metrics">
      <div className="trip-metric-group trip-metric-group-total">
        <div className="trip-card-metrics">
          <Metric value={stats.totalStops || 0} label="punkty" tone="total" />
          <Metric value={stats.stops || 0} label="z czystym" />
          <Metric value={stats.dirtyStops || 0} label="z brudnym" tone="dirty" />
        </div>
      </div>
      <div className="trip-metric-group">
        <div className="trip-metric-grouplabel">Dostawa czystego</div>
        <div className="trip-card-metrics">
          <Metric value={`${stats.delivered}/${stats.stops || 0}`} label="dostarczone" tone="delivered" />
          <Metric value={`${stats.picked}/${stats.stops || 0}`} label="z pralni" tone="picked" />
          <Metric value={stats.kg || 0} label="kg" />
        </div>
      </div>
      {(stats.dirtyStops > 0 || stats.dirtyTrolleys > 0) && (
        <div className="trip-metric-group">
          <div className="trip-metric-grouplabel">Odbiór brudnego</div>
          <div className="trip-card-metrics">
            <Metric value={stats.dirtyStops} label="punkty" tone="dirty" />
            <Metric value={stats.dirtyTrolleys} label="wózki" tone="dirty" />
          </div>
        </div>
      )}
    </div>
  );
}

export function mapsUrlForStop(stop) {
  if (stop?.lat != null && stop?.lng != null && stop.lat !== '' && stop.lng !== '') {
    return `https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop?.address || stop?.client_name || '')}`;
}

export function stopHasNavLocation(stop) {
  if (stop?.lat != null && stop?.lng != null && stop.lat !== '' && stop.lng !== '') return true;
  return Boolean(String(stop?.address || '').trim());
}
