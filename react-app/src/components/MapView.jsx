import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAppData } from '../hooks/useAppData';
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
    ">🏢 Baza</div>`,
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

// Komponent do automatycznego dopasowania widoku do markerów
function FitBounds({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [map, positions]);
  return null;
}

export default function MapView() {
  const { clients, routes, loading } = useAppData();
  const { isDriver, user } = useAuth();
  const [hiddenRoutes, setHiddenRoutes] = useState(new Set());
  const [userPos, setUserPos] = useState(null);
  const [darkMode, setDarkMode] = useState(
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );

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

  // Wszystkie pozycje do FitBounds
  const allPositions = [
    [BASE_LAT, BASE_LNG],
    ...clients.filter(c => c.lat && c.lng).map(c => [c.lat, c.lng]),
  ];

  if (loading) return <div className="loader">Ładowanie danych…</div>;

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
          {darkMode ? '☀️ Jasna' : '🌙 Ciemna'}
        </button>

        <div style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 4px' }} />

        {sortedRoutes.map((route, i) => {
          const color = getRouteColorByIndex(i);
          const hidden = hiddenRoutes.has(route.id);
          const hasGps = clients.some(c => c.route_id === route.id && c.lat && c.lng);
          const isOwnRoute = isDriver && assignedRouteIds.has(route.id);
          if (!hasGps) return null;
          return (
            <button
              key={route.id}
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
              {isOwnRoute && <span style={{ fontSize: '10px', fontWeight: 800 }}>Twoja</span>}
            </button>
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
              <strong>🏢 LEBUSER – Baza</strong><br />
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
              [BASE_LAT, BASE_LNG],
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
                      {route.name}{isOwnRoute ? ' · Twoja trasa' : ''}<br />
                      <span style={{ color: '#888', fontSize: '11px' }}>
                        {Number(client.lat).toFixed(5)}, {Number(client.lng).toFixed(5)}
                      </span>
                    </Popup>
                  </Marker>
                ))}
              </span>
            );
          })}

          {/* Marker użytkownika */}
          {userPos && (
            <Marker position={[userPos.lat, userPos.lng]} icon={makeUserIcon()}>
              <Popup>📍 Twoja lokalizacja</Popup>
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
            ⚠️ {missing} {missing === 1 ? 'klient nie ma' : 'klientów nie ma'} współrzędnych GPS — edytuj w Klienci i Trasy
          </div>
        );
      })()}
    </div>
  );
}

// Przycisk geolokalizacji jako osobny komponent (musi być wewnątrz MapContainer)
function UserLocationButton({ onLocate }) {
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
          map.once('locationerror', () => alert('Brak dostępu do lokalizacji'));
        }}
        style={{
          background: '#007AFF', color: '#fff',
          border: 'none', borderRadius: '12px',
          padding: '10px 16px', fontSize: '13px', fontWeight: 600,
          cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,122,255,0.4)',
          display: 'flex', alignItems: 'center', gap: '6px',
        }}
      >
        📍 Moja lokalizacja
      </button>
    </div>
  );
}
