import { useState, useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { useAppData } from '../hooks/useAppData';
import DataError from './DataError';
import { useAuth } from '../context/AuthContext';
import { getRouteColorByIndex } from '../lib/visualSystem';

const BASE_LAT = 52.7229319;
const BASE_LNG = 15.2520164;

function parseRouteIds(routesStr) {
  return new Set(
    (routesStr || '').split(',').map(s => Number(s.trim())).filter(Boolean)
  );
}

function makeClientIcon(num, color, isOwnRoute = false) {
  return L.divIcon({
    className: '',
    html: `<div style="
      background:${color};
      color:#fff;
      width:28px;height:28px;
      border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      font-weight:700;font-size:11px;
      border:${isOwnRoute ? '3.5px' : '2.5px'} solid ${isOwnRoute ? '#111827' : '#fff'};
      box-shadow:${isOwnRoute ? `0 0 0 3px ${color}55, 0 3px 12px rgba(0,0,0,0.32)` : '0 2px 8px rgba(0,0,0,0.25)'};
      transform:translate(-50%,-50%);
    ">${num}</div>`,
    iconSize: [0, 0],
  });
}

function makeBaseIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="
      background:#fff;
      color:#1C1C1E;
      padding:5px 10px;
      border-radius:20px;
      font-weight:700;font-size:11px;
      border:2.5px solid #007AFF;
      white-space:nowrap;
      transform:translate(-50%,-50%);
      box-shadow:0 3px 12px rgba(0,0,0,0.2);
      display:flex;align-items:center;gap:4px;
    ">🏢 ${i18n.t('map.base')}</div>`,
    iconSize: [0, 0],
  });
}

function makeUserIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:16px;height:16px;
      background:#007AFF;
      border-radius:50%;
      border:3px solid #fff;
      box-shadow:0 0 0 3px rgba(0,122,255,0.3), 0 2px 8px rgba(0,0,0,0.2);
      transform:translate(-50%,-50%);
    "></div>`,
    iconSize: [0, 0],
  });
}

// Komponent do automatycznego dopasowania widoku do markerów.
// Realtime odświeża dane co chwilę (np. zmiana statusu prania), co bez tej
// blokady wywoływało nowe fitBounds() w trakcie animacji poprzedniego —
// nakładające się animacje Leaflet potrafią zostawić marker bez _leaflet_pos
// i wywalić się przy kolejnej klatce ("undefined is not an object").
function FitBounds({ positions }) {
  const map = useMap();
  const lastBoundsRef = useRef(null);
  useEffect(() => {
    if (positions.length === 0) return;
    const bounds = L.latLngBounds(positions);
    if (lastBoundsRef.current?.equals(bounds)) return;
    lastBoundsRef.current = bounds;
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [map, positions]);
  return null;
}

export default function MapView() {
  const { t } = useTranslation();
  const { clients, routes, loading, error, refetch } = useAppData();
  const { isDriver, user } = useAuth();
  const [hiddenRoutes, setHiddenRoutes] = useState(new Set());
  const [initialized, setInitialized] = useState(false);
  const [userPos, setUserPos] = useState(null);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    if (routes.length > 0 && !initialized) {
      const hidden = new Set();
      const day = new Date().getDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
      routes.forEach(r => {
        const schedule = r.schedule || 'other';
        let isActive = true;
        if (schedule === 'mwf') isActive = [1, 3, 5].includes(day);
        else if (schedule === 'tth') isActive = [2, 4].includes(day);
        
        if (!isActive) hidden.add(r.id);
      });
      setHiddenRoutes(hidden);
      setInitialized(true);
    }
  }, [routes, initialized]);

  const sortedRoutes = [...routes].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const assignedRouteIds = parseRouteIds(user?.routes);

  const toggleRoute = (routeId) => {
    setHiddenRoutes(prev => {
      const next = new Set(prev);
      next.has(routeId) ? next.delete(routeId) : next.add(routeId);
      return next;
    });
  };

  const tileUrl = darkMode
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

  // Wszystkie pozycje do FitBounds — trzymamy referencję stabilną między
  // odświeżeniami realtime, które nie zmieniają współrzędnych klientów
  // (np. status prania), żeby nie wywoływać fitBounds() bez potrzeby.
  const geoClients = clients.filter(c => c.lat && c.lng);
  const positionsKey = geoClients.map(c => `${c.id}:${c.lat}:${c.lng}`).sort().join('|');
  const allPositions = useMemo(() => [
    [BASE_LAT, BASE_LNG],
    ...geoClients.map(c => [c.lat, c.lng]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [positionsKey]);

  if (loading) return <div className="loader">{t('schedule.loadingData')}</div>;
  if (error) return <DataError onRetry={refetch} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 180px)', minHeight: '400px' }}>

      {/* Legenda + kontrolki */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '6px',
        padding: '10px 16px', alignItems: 'center',
        background: 'var(--bg-card)', borderBottom: '1px solid var(--border)',
      }}>
        <button
          onClick={() => setDarkMode(d => !d)}
          style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: '8px', padding: '4px 10px', fontSize: '12px',
            cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 500,
          }}
        >
          {darkMode ? t('map.lightMode') : t('map.darkMode')}
        </button>

        <div style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 4px' }} />

        {sortedRoutes.map((route, i) => {
          const color = getRouteColorByIndex(i);
          const hidden = hiddenRoutes.has(route.id);
          const hasGps = clients.some(c => c.route_id === route.id && c.lat && c.lng);
          const isOwnRoute = isDriver && assignedRouteIds.has(route.id);
          if (!hasGps) return null;
          return (
              <div key={route.id} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  onClick={() => toggleRoute(route.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    background: hidden ? 'var(--bg-secondary)' : color + '18',
                    border: `${isOwnRoute ? '2.5px' : '1.5px'} solid ${hidden ? 'var(--border)' : color}`,
                    borderRadius: '20px', padding: '4px 10px',
                    fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                    color: hidden ? 'var(--text-tertiary)' : color,
                    opacity: hidden ? 0.6 : 1,
                    boxShadow: isOwnRoute && !hidden ? `0 0 0 2px ${color}22` : 'none',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: hidden ? 'var(--text-tertiary)' : color, flexShrink: 0 }} />
                  {route.name}
                  {isOwnRoute && <span style={{ fontSize: '10px', fontWeight: 800 }}>{t('map.yours')}</span>}
                </button>
                {!hidden && (
                  <button
                    onClick={() => {
                      const rc = clients.filter(c => c.route_id === route.id && c.lat && c.lng).sort((a, b) => a.sort_order - b.sort_order);
                      if (rc.length === 0) return;
                      const origin = `${BASE_LAT},${BASE_LNG}`;
                      const dest = rc[rc.length - 1];
                      const wps = rc.slice(0, -1).map(c => `${c.lat},${c.lng}`).join('|');
                      let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest.lat},${dest.lng}`;
                      if (wps) url += `&waypoints=${wps}`;
                      window.open(url, '_blank');
                    }}
                    title="Nawiguj całą trasę w Google Maps"
                    style={{
                      background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                      borderRadius: '8px', padding: '4px 6px', fontSize: '13px',
                      cursor: 'pointer', color: 'var(--text-primary)'
                    }}
                  >
                    🗺️
                  </button>
                )}
              </div>
          );
        })}
      </div>

      {/* Mapa */}
      <div style={{ flex: 1, position: 'relative' }}>
        <MapContainer
          center={[BASE_LAT, BASE_LNG]}
          zoom={10}
          style={{ height: '100%', width: '100%' }}
          zoomControl={true}
        >
          <TileLayer
            url={tileUrl}
            attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, © <a href="https://carto.com/">CARTO</a>'
          />

          <FitBounds positions={allPositions} />

          {/* Marker bazy */}
          <Marker position={[BASE_LAT, BASE_LNG]} icon={makeBaseIcon()}>
            <Popup>
              <strong>🏢 LEBUSER – {t('map.base')}</strong><br />
              {BASE_LAT.toFixed(6)}, {BASE_LNG.toFixed(6)}
            </Popup>
          </Marker>

          {/* Markery i polyline dla każdej trasy */}
          {sortedRoutes.map((route, routeIndex) => {
            if (hiddenRoutes.has(route.id)) return null;
            const color = getRouteColorByIndex(routeIndex);
            const isOwnRoute = isDriver && assignedRouteIds.has(route.id);
            const routeClients = clients
              .filter(c => c.route_id === route.id && c.lat && c.lng)
              .sort((a, b) => a.sort_order - b.sort_order);

            if (routeClients.length === 0) return null;

            const polyPoints = [
              [BASE_LAT, BASE_LNG],
              ...routeClients.map(c => [c.lat, c.lng]),
            ];

            return (
              <span key={route.id}>
                <Polyline
                  positions={polyPoints}
                  pathOptions={{ color, weight: isOwnRoute ? 5 : 3.5, opacity: isOwnRoute ? 0.92 : 0.75, dashArray: null }}
                />
                {routeClients.map((client, idx) => (
                  <Marker
                    key={client.id}
                    position={[client.lat, client.lng]}
                    icon={makeClientIcon(idx + 1, color, isOwnRoute)}
                  >
                    <Popup>
                      <strong>{client.name}</strong><br />
                      {route.name}{isOwnRoute ? ` · ${t('map.yourRoute')}` : ''}<br />
                      <span style={{ color: '#888', fontSize: '11px' }}>
                        {Number(client.lat).toFixed(5)}, {Number(client.lng).toFixed(5)}
                      </span>
                      <div style={{ marginTop: '10px' }}>
                        <a 
                          href={`https://www.google.com/maps/dir/?api=1&destination=${client.lat},${client.lng}`} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          style={{ display: 'inline-block', background: '#34C759', color: '#fff', padding: '6px 12px', borderRadius: '8px', textDecoration: 'none', fontSize: '12px', fontWeight: 600, boxShadow: '0 2px 8px rgba(52,199,89,0.3)' }}
                        >
                          📍 Nawiguj
                        </a>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </span>
            );
          })}

          {/* Marker użytkownika */}
          {userPos && (
            <Marker position={[userPos.lat, userPos.lng]} icon={makeUserIcon()}>
              <Popup>📍 {t('map.yourLocation')}</Popup>
            </Marker>
          )}

          <UserLocationButton onLocate={setUserPos} />
        </MapContainer>
      </div>

      {/* Info o brakujących GPS */}
      {(() => {
        const missing = clients.filter(c => !c.lat || !c.lng).length;
        if (missing === 0) return null;
        return (
          <div style={{
            padding: '8px 16px', fontSize: '12px',
            color: 'var(--text-tertiary)', background: 'var(--bg-secondary)',
            borderTop: '1px solid var(--border)',
          }}>
            {t('map.missingGps', { count: missing })}
          </div>
        );
      })()}
    </div>
  );
}

// Przycisk geolokalizacji jako osobny komponent (musi być wewnątrz MapContainer)
function UserLocationButton({ onLocate }) {
  const { t } = useTranslation();
  const map = useMap();
  return (
    <div
      style={{
        position: 'absolute', bottom: '24px', right: '10px', zIndex: 1000,
      }}
    >
      <button
        onClick={() => {
          map.locate({ maxZoom: 14 });
          map.once('locationfound', e => {
            onLocate(e.latlng);
            map.setView(e.latlng, 14);
          });
          map.once('locationerror', () => alert(t('map.locationDenied')));
        }}
        style={{
          background: '#007AFF', color: '#fff',
          border: 'none', borderRadius: '12px',
          padding: '10px 16px', fontSize: '13px', fontWeight: 600,
          cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,122,255,0.4)',
          display: 'flex', alignItems: 'center', gap: '6px',
        }}
      >
        📍 {t('map.myLocation')}
      </button>
    </div>
  );
}
