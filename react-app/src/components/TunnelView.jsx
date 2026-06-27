import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock3, Radio, RefreshCw, Send, Server, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

const cardStyle = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  boxShadow: 'var(--shadow-sm)',
};

const mutedStyle = {
  color: 'var(--text-tertiary)',
  fontSize: '12px',
  fontWeight: 600,
};

const demoEvents = [
  {
    id: 'demo-1',
    accepted: true,
    bag_id: 'A-142',
    command_id: 'QUEUE-142',
    created_at: new Date(Date.now() - 45000).toISOString(),
    dry_run: true,
    event_type: 'command_sent',
    gateway_id: 'main-tunnel',
    hotel_name: 'Hotel Baltic',
    message: 'Worek skierowany na tor 2.',
    payload: { RequestedBy: 'Operator' },
    program_number: 12,
    track_number: 2,
    transport: 'dry-run',
  },
  {
    id: 'demo-2',
    accepted: true,
    bag_id: 'B-087',
    command_id: 'QUEUE-087',
    created_at: new Date(Date.now() - 120000).toISOString(),
    dry_run: true,
    event_type: 'command_sent',
    gateway_id: 'main-tunnel',
    hotel_name: 'Villa Morska',
    message: 'Program 8 czeka na wolna stacje.',
    payload: { RequestedBy: 'Operator' },
    program_number: 8,
    track_number: 1,
    transport: 'dry-run',
  },
  {
    id: 'demo-3',
    accepted: true,
    bag_id: 'C-231',
    command_id: 'QUEUE-231',
    created_at: new Date(Date.now() - 260000).toISOString(),
    dry_run: true,
    event_type: 'command_sent',
    gateway_id: 'main-tunnel',
    hotel_name: 'Grand Leba',
    message: 'Tunel potwierdzil przyjecie komendy.',
    payload: { RequestedBy: 'Operator' },
    program_number: 21,
    track_number: 3,
    transport: 'dry-run',
  },
];

const tunnelStages = [
  { id: 'in', label: 'Wejscie', meta: 'skan' },
  { id: 'wash', label: 'Pranie', meta: 'program' },
  { id: 'rinse', label: 'Plukanie', meta: 'kontrola' },
  { id: 'dry', label: 'Suszenie', meta: 'cieplo' },
  { id: 'pack', label: 'Pakowanie', meta: 'wyjscie' },
];

const stageColors = ['#0A84FF', '#34C759', '#FF9500', '#AF52DE', '#FF3B30'];

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatAgo(value) {
  if (!value) return '-';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s temu`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m temu`;
  const hours = Math.round(minutes / 60);
  return `${hours}h temu`;
}

function StatusPill({ ok, children }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      minHeight: '26px',
      padding: '4px 9px',
      borderRadius: '999px',
      background: ok ? 'rgba(52, 199, 89, 0.12)' : 'rgba(255, 59, 48, 0.12)',
      color: ok ? 'var(--accent-green)' : 'var(--accent-red)',
      fontSize: '12px',
      fontWeight: 800,
      lineHeight: 1,
      whiteSpace: 'nowrap',
    }}>
      {ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
      {children}
    </span>
  );
}

function MetricCard({ icon, label, value, sub }) {
  return (
    <div style={{ ...cardStyle, padding: '14px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <div style={{
          width: '34px',
          height: '34px',
          borderRadius: '8px',
          background: 'var(--bg-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--accent)',
          flexShrink: 0,
        }}>
          {icon}
        </div>
        <div style={{ ...mutedStyle, minWidth: 0 }}>{label}</div>
      </div>
      <div style={{
        color: 'var(--text-primary)',
        fontSize: '18px',
        fontWeight: 800,
        minWidth: 0,
        overflowWrap: 'anywhere',
      }}>
        {value}
      </div>
      {sub && <div style={{ ...mutedStyle, marginTop: '4px', overflowWrap: 'anywhere' }}>{sub}</div>}
    </div>
  );
}

function EventRow({ event }) {
  const payload = event.payload || {};
  const requestedBy = payload.RequestedBy || payload.requestedBy || payload.requested_by || '';

  return (
    <div style={{
      ...cardStyle,
      padding: '12px',
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1.2fr) minmax(96px, 0.45fr) minmax(96px, 0.45fr)',
      gap: '12px',
      alignItems: 'center',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', minWidth: 0 }}>
          <Send size={15} color="var(--accent)" style={{ flexShrink: 0 }} />
          <strong style={{ fontSize: '14px', overflowWrap: 'anywhere' }}>
            {event.hotel_name || 'Bez hotelu'}
          </strong>
        </div>
        <div style={{ ...mutedStyle, overflowWrap: 'anywhere' }}>
          Worek {event.bag_id || '-'} - komenda {event.command_id || '-'}
          {requestedBy ? ` - ${requestedBy}` : ''}
        </div>
        {event.message && (
          <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '6px', overflowWrap: 'anywhere' }}>
            {event.message}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ ...mutedStyle, color: 'var(--text-secondary)' }}>P{event.program_number || '-'}</span>
        <span style={{ ...mutedStyle, color: 'var(--text-secondary)' }}>Tor {event.track_number || '-'}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', flexDirection: 'column', gap: '6px', textAlign: 'right' }}>
        <StatusPill ok={event.accepted !== false}>{event.accepted === false ? 'Odrzucone' : 'Przyjete'}</StatusPill>
        <span style={mutedStyle}>{formatDateTime(event.created_at)}</span>
      </div>
    </div>
  );
}

function WinWashVisual({ status, events, isOnline, realtimeOk }) {
  const visualEvents = events.length > 0 ? events.slice(0, 5) : demoEvents;
  const activeCount = visualEvents.filter(event => event.accepted !== false).length;
  const queueCount = Math.max(0, visualEvents.length - activeCount);
  const latest = visualEvents[0] || null;
  const lanes = [1, 2, 3];

  return (
    <section className="ww-panel">
      <style>{`
        .ww-panel {
          display: grid;
          grid-template-columns: minmax(180px, 0.75fr) minmax(360px, 1.7fr) minmax(180px, 0.75fr);
          gap: 14px;
          padding: 14px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: linear-gradient(180deg, rgba(255,255,255,0.92), rgba(245,247,250,0.98));
          box-shadow: var(--shadow-sm);
          overflow: hidden;
        }
        .dark .ww-panel {
          background: linear-gradient(180deg, rgba(24,27,32,0.96), rgba(17,19,23,0.98));
        }
        .ww-side {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .ww-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          min-width: 0;
        }
        .ww-title {
          color: var(--text-primary);
          font-size: 15px;
          font-weight: 850;
          letter-spacing: 0;
          overflow-wrap: anywhere;
        }
        .ww-chip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 24px;
          padding: 3px 8px;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: var(--bg-card);
          color: var(--text-secondary);
          font-size: 11px;
          font-weight: 800;
          white-space: nowrap;
        }
        .ww-queue {
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-width: 0;
        }
        .ww-bag {
          display: grid;
          grid-template-columns: 34px minmax(0, 1fr);
          gap: 9px;
          align-items: center;
          padding: 9px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--bg-card);
          min-width: 0;
        }
        .ww-bag-code {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-size: 11px;
          font-weight: 900;
        }
        .ww-bag-main {
          color: var(--text-primary);
          font-size: 13px;
          font-weight: 800;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .ww-bag-sub {
          margin-top: 2px;
          color: var(--text-tertiary);
          font-size: 11px;
          font-weight: 700;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .ww-tunnel {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .ww-machine {
          position: relative;
          min-height: 318px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background:
            linear-gradient(90deg, rgba(10,132,255,0.08), transparent 24%, rgba(52,199,89,0.08) 48%, transparent 72%, rgba(255,149,0,0.08)),
            var(--bg-card);
          overflow: hidden;
        }
        .ww-machine-head {
          display: grid;
          grid-template-columns: repeat(5, minmax(70px, 1fr));
          gap: 8px;
          padding: 12px 12px 4px;
          position: relative;
          z-index: 2;
        }
        .ww-stage {
          min-width: 0;
          padding: 8px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: rgba(255,255,255,0.78);
        }
        .dark .ww-stage {
          background: rgba(20,22,26,0.78);
        }
        .ww-stage-label {
          color: var(--text-primary);
          font-size: 12px;
          font-weight: 850;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .ww-stage-meta {
          margin-top: 2px;
          color: var(--text-tertiary);
          font-size: 10px;
          font-weight: 750;
          text-transform: uppercase;
        }
        .ww-lanes {
          position: absolute;
          left: 12px;
          right: 12px;
          top: 106px;
          bottom: 18px;
          display: grid;
          grid-template-rows: repeat(3, 1fr);
          gap: 16px;
        }
        .ww-lane {
          position: relative;
          min-height: 50px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background:
            repeating-linear-gradient(90deg, rgba(120,120,120,0.14) 0 10px, transparent 10px 22px),
            linear-gradient(180deg, rgba(0,0,0,0.02), rgba(0,0,0,0.05));
          overflow: hidden;
        }
        .ww-lane::before {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          top: 50%;
          height: 3px;
          transform: translateY(-50%);
          background: linear-gradient(90deg, transparent, rgba(10,132,255,0.45), rgba(52,199,89,0.45), transparent);
        }
        .ww-lane-label {
          position: absolute;
          left: 8px;
          top: 8px;
          z-index: 2;
          color: var(--text-tertiary);
          font-size: 11px;
          font-weight: 900;
        }
        .ww-moving-bag {
          position: absolute;
          top: 50%;
          width: 78px;
          min-height: 36px;
          padding: 6px 8px;
          border-radius: 8px;
          transform: translateY(-50%);
          color: #fff;
          box-shadow: 0 8px 20px rgba(0,0,0,0.18);
          animation: wwMove 8.5s linear infinite;
          display: flex;
          flex-direction: column;
          justify-content: center;
          overflow: hidden;
        }
        .ww-moving-bag strong {
          font-size: 11px;
          line-height: 1.1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ww-moving-bag span {
          margin-top: 2px;
          font-size: 10px;
          font-weight: 750;
          opacity: 0.88;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        @keyframes wwMove {
          from { left: -92px; }
          to { left: calc(100% + 16px); }
        }
        .ww-live-stack {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }
        .ww-tile {
          padding: 11px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--bg-card);
          min-width: 0;
        }
        .ww-tile-label {
          color: var(--text-tertiary);
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
        }
        .ww-tile-value {
          margin-top: 6px;
          color: var(--text-primary);
          font-size: 18px;
          font-weight: 900;
          overflow-wrap: anywhere;
        }
        .ww-tile-sub {
          margin-top: 3px;
          color: var(--text-secondary);
          font-size: 12px;
          font-weight: 700;
          overflow-wrap: anywhere;
        }
        @media (max-width: 980px) {
          .ww-panel {
            grid-template-columns: 1fr;
          }
          .ww-machine {
            min-height: 300px;
          }
        }
        @media (max-width: 640px) {
          .ww-machine-head {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .ww-lanes {
            top: 196px;
            gap: 10px;
          }
          .ww-machine {
            min-height: 390px;
          }
          .ww-moving-bag {
            width: 70px;
          }
        }
      `}</style>

      <div className="ww-side">
        <div className="ww-title-row">
          <div className="ww-title">Kolejka workow</div>
          <span className="ww-chip">{visualEvents.length}</span>
        </div>
        <div className="ww-queue">
          {visualEvents.slice(0, 4).map((event, index) => (
            <div className="ww-bag" key={`queue-${event.id}`}>
              <div className="ww-bag-code" style={{ background: stageColors[index % stageColors.length] }}>
                {event.bag_id?.slice(-3) || `0${index + 1}`}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="ww-bag-main">{event.hotel_name || 'Bez hotelu'}</div>
                <div className="ww-bag-sub">P{event.program_number || '-'} / tor {event.track_number || '-'}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="ww-tunnel">
        <div className="ww-title-row">
          <div className="ww-title">LEBUSER WinWash</div>
          <span className="ww-chip">{status?.dry_run ? 'DRY RUN' : 'LIVE'}</span>
        </div>
        <div className="ww-machine" aria-label="Wizualny podglad tunelu">
          <div className="ww-machine-head">
            {tunnelStages.map((stage, index) => (
              <div className="ww-stage" key={stage.id}>
                <div className="ww-stage-label">{stage.label}</div>
                <div className="ww-stage-meta" style={{ color: stageColors[index] }}>{stage.meta}</div>
              </div>
            ))}
          </div>

          <div className="ww-lanes">
            {lanes.map((lane, laneIndex) => {
              const laneEvents = visualEvents.filter((event, index) => Number(event.track_number || (index % 3) + 1) === lane);
              const renderEvents = laneEvents.length > 0 ? laneEvents : visualEvents.slice(laneIndex, laneIndex + 1);

              return (
                <div className="ww-lane" key={lane}>
                  <div className="ww-lane-label">TOR {lane}</div>
                  {renderEvents.slice(0, 2).map((event, index) => (
                    <div
                      className="ww-moving-bag"
                      key={`${lane}-${event.id}-${index}`}
                      style={{
                        animationDelay: `${-(laneIndex * 1.8 + index * 3.2)}s`,
                        animationDuration: `${8 + laneIndex + index}s`,
                        background: stageColors[(laneIndex + index) % stageColors.length],
                      }}
                    >
                      <strong>{event.bag_id || 'BAG'}</strong>
                      <span>{event.hotel_name || 'Hotel'}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="ww-side">
        <div className="ww-title-row">
          <div className="ww-title">Stan tunelu</div>
          <span className="ww-chip">{realtimeOk ? 'RT' : 'SYNC'}</span>
        </div>
        <div className="ww-live-stack">
          <div className="ww-tile">
            <div className="ww-tile-label">Status</div>
            <div className="ww-tile-value" style={{ color: isOnline ? 'var(--accent-green)' : 'var(--accent-orange)' }}>
              {isOnline ? 'Online' : 'Podglad'}
            </div>
            <div className="ww-tile-sub">{status?.transport || 'tryb wizualny'}</div>
          </div>
          <div className="ww-tile">
            <div className="ww-tile-label">Aktywne</div>
            <div className="ww-tile-value">{activeCount}</div>
            <div className="ww-tile-sub">worki w obiegu</div>
          </div>
          <div className="ww-tile">
            <div className="ww-tile-label">Ostatni worek</div>
            <div className="ww-tile-value">{latest?.bag_id || '-'}</div>
            <div className="ww-tile-sub">{latest?.hotel_name || 'czekam na zdarzenia'}</div>
          </div>
          <div className="ww-tile">
            <div className="ww-tile-label">Kolejka</div>
            <div className="ww-tile-value">{queueCount}</div>
            <div className="ww-tile-sub">do wyslania</div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function TunnelView() {
  const [status, setStatus] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [realtimeState, setRealtimeState] = useState('CONNECTING');

  const loadTunnel = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError('');

    const [
      { data: statusRow, error: statusError },
      { data: eventRows, error: eventsError },
    ] = await Promise.all([
      supabase
        .from('tunnel_gateway_status')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('tunnel_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    if (statusError || eventsError) {
      setError(statusError?.message || eventsError?.message || 'Nie udalo sie pobrac danych tunelu.');
    } else {
      setStatus(statusRow || null);
      setEvents(eventRows || []);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadTunnel();

    const channel = supabase.channel('tunnel-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tunnel_gateway_status' }, payload => {
        if (payload.new) setStatus(payload.new);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tunnel_events' }, payload => {
        if (!payload.new) return;
        setEvents(current => [payload.new, ...current].slice(0, 50));
      })
      .subscribe(nextState => setRealtimeState(nextState));

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadTunnel]);

  const statusTime = status?.updated_at || status?.checked_at;
  const isFresh = useMemo(() => {
    if (!statusTime) return false;
    return Date.now() - new Date(statusTime).getTime() < 20000;
  }, [statusTime]);
  const isOnline = !!status?.connected && isFresh;
  const realtimeOk = realtimeState === 'SUBSCRIBED';

  if (loading) {
    return (
      <div className="loader" style={{ minHeight: '240px' }}>
        Ladowanie tunelu...
      </div>
    );
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <StatusPill ok={isOnline}>{isOnline ? 'Gateway online' : 'Gateway offline'}</StatusPill>
          <StatusPill ok={realtimeOk}>{realtimeOk ? 'Realtime aktywny' : 'Realtime laczy'}</StatusPill>
          {status?.dry_run && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              minHeight: '26px',
              padding: '4px 9px',
              borderRadius: '999px',
              background: 'rgba(255, 149, 0, 0.13)',
              color: 'var(--accent-orange)',
              fontSize: '12px',
              fontWeight: 800,
            }}>
              Dry run
            </span>
          )}
        </div>

        <button
          type="button"
          className="driver-btn"
          onClick={() => loadTunnel({ silent: true })}
          disabled={refreshing}
          title="Odswiez status"
        >
          <RefreshCw size={14} />
          {refreshing ? 'Odswiezam...' : 'Odswiez'}
        </button>
      </div>

      {error && (
        <div style={{
          ...cardStyle,
          padding: '12px',
          display: 'flex',
          gap: '10px',
          alignItems: 'flex-start',
          color: 'var(--accent-red)',
          background: 'rgba(255, 59, 48, 0.08)',
        }}>
          <AlertTriangle size={18} style={{ flexShrink: 0 }} />
          <div style={{ fontSize: '13px', fontWeight: 700, overflowWrap: 'anywhere' }}>{error}</div>
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '12px',
      }}>
        <MetricCard
          icon={<Server size={18} />}
          label="Gateway"
          value={status?.gateway_id || 'Brak danych'}
          sub={status ? `ostatnio ${formatAgo(statusTime)}` : 'czekam na pierwszy status'}
        />
        <MetricCard
          icon={<Radio size={18} />}
          label="Transport"
          value={status?.transport || '-'}
          sub={status?.port_name ? `port ${status.port_name}` : 'bez portu'}
        />
        <MetricCard
          icon={<Activity size={18} />}
          label="Polaczenie"
          value={status?.connected ? 'Aktywne' : 'Nieaktywne'}
          sub={status?.last_error || 'brak bledu'}
        />
        <MetricCard
          icon={<Clock3 size={18} />}
          label="Ostatni check"
          value={formatDateTime(status?.checked_at)}
          sub={status?.updated_at ? `zapis ${formatDateTime(status.updated_at)}` : ''}
        />
      </div>

      <WinWashVisual
        status={status}
        events={events}
        isOnline={isOnline}
        realtimeOk={realtimeOk}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'baseline' }}>
          <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '18px', letterSpacing: 0 }}>
            Ostatnie zdarzenia
          </h2>
          <span style={mutedStyle}>{events.length} wpisow</span>
        </div>

        {events.length === 0 ? (
          <div style={{ ...cardStyle, padding: '22px', color: 'var(--text-secondary)', fontWeight: 700, textAlign: 'center' }}>
            Brak zdarzen z gatewaya.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {events.map(event => <EventRow key={event.id} event={event} />)}
          </div>
        )}
      </div>
    </section>
  );
}
