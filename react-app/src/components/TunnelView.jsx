import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BadgeCheck,
  Cable,
  CircleCheck,
  Clock3,
  Factory,
  Package,
  PackageCheck,
  Plus,
  RotateCcw,
  ScanBarcode,
  Send,
  Settings2,
  Trash2,
  TriangleAlert,
  WashingMachine,
} from 'lucide-react';
import { useAppData } from '../hooks/useAppData';
import { useAuth } from '../context/AuthContext';
import { isTunnelGatewayEnabled, sendTunnelCommand } from '../lib/tunnelGateway';
import { toastError, toastSuccess, toastWarn } from '../lib/toast';
import DataError from './DataError';

const STORAGE_KEY = 'lebuser:tunnel:v1';
const DEFAULT_BAG_COUNT = 12;
const ACTIVE_STATUSES = new Set(['queued', 'sent', 'inTunnel', 'error']);

const PROGRAMS = [
  { id: 'p1', number: 1 },
  { id: 'p2', number: 2 },
  { id: 'p3', number: 3 },
  { id: 'p4', number: 4 },
  { id: 'p5', number: 5 },
];

const TRACKS = [
  { id: 't1', number: 1, color: '#007AFF' },
  { id: 't2', number: 2, color: '#34C759' },
  { id: 't3', number: 3, color: '#FF9500' },
  { id: 't4', number: 4, color: '#AF52DE' },
];

const STATUS_META = {
  queued: { icon: Clock3, rank: 1 },
  sent: { icon: Send, rank: 2 },
  inTunnel: { icon: WashingMachine, rank: 3 },
  error: { icon: TriangleAlert, rank: 4 },
  done: { icon: CircleCheck, rank: 5 },
};

function buildBagId(index) {
  return `BAG-${String(index).padStart(3, '0')}`;
}

function seedBags(count = DEFAULT_BAG_COUNT) {
  return Array.from({ length: count }, (_, index) => buildBagId(index + 1));
}

function readStoredTunnel() {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      bags: Array.isArray(parsed.bags) ? parsed.bags.filter(Boolean).map(String) : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    };
  } catch {
    return null;
  }
}

function dateKey(value) {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nextBagId(existingBags) {
  const used = new Set(existingBags);
  let index = existingBags.length + 1;
  while (used.has(buildBagId(index))) index += 1;
  return buildBagId(index);
}

export default function TunnelView() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { clients, loading, error, refetch } = useAppData();
  const [stored] = useState(() => readStoredTunnel());

  const [bags, setBags] = useState(() => stored?.bags?.length ? stored.bags : seedBags());
  const [tasks, setTasks] = useState(() => stored?.tasks || []);
  const [bagTarget, setBagTarget] = useState(() => String(Math.max(stored?.bags?.length || DEFAULT_BAG_COUNT, DEFAULT_BAG_COUNT)));
  const [selectedBagId, setSelectedBagId] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedProgramId, setSelectedProgramId] = useState(PROGRAMS[0].id);
  const [selectedTrackId, setSelectedTrackId] = useState(TRACKS[0].id);
  const [priority, setPriority] = useState('normal');
  const [sendingTaskId, setSendingTaskId] = useState(null);

  const formatter = useMemo(() => new Intl.DateTimeFormat(i18n.language || 'pl', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }), [i18n.language]);

  const hotelOptions = useMemo(() => {
    const names = new Set((clients || []).map(client => String(client.name || '').trim()).filter(Boolean));
    return [...names].sort((a, b) => a.localeCompare(b, i18n.language || 'pl'));
  }, [clients, i18n.language]);

  const activeBagIds = useMemo(() => new Set(
    tasks.filter(task => ACTIVE_STATUSES.has(task.status)).map(task => task.bagId)
  ), [tasks]);

  const availableBags = useMemo(
    () => bags.filter(bagId => !activeBagIds.has(bagId)),
    [bags, activeBagIds]
  );

  const selectedProgram = PROGRAMS.find(program => program.id === selectedProgramId) || PROGRAMS[0];
  const selectedTrack = TRACKS.find(track => track.id === selectedTrackId) || TRACKS[0];
  const canQueue = !!selectedBagId && !!selectedClient.trim() && !!selectedProgram && !!selectedTrack;
  const today = dateKey(new Date());

  const activeTasks = tasks.filter(task => ACTIVE_STATUSES.has(task.status));
  const doneToday = tasks.filter(task => task.status === 'done' && dateKey(task.updatedAt || task.createdAt) === today).length;
  const queuedCount = tasks.filter(task => task.status === 'queued').length;
  const inTunnelCount = tasks.filter(task => task.status === 'inTunnel').length;

  const visibleTasks = useMemo(() => [...tasks].sort((a, b) => {
    const rankA = STATUS_META[a.status]?.rank || 99;
    const rankB = STATUS_META[b.status]?.rank || 99;
    if (rankA !== rankB) return rankA - rankB;
    return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
  }), [tasks]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ bags, tasks }));
  }, [bags, tasks]);

  useEffect(() => {
    if (!selectedBagId || !availableBags.includes(selectedBagId)) {
      setSelectedBagId(availableBags[0] || '');
    }
  }, [availableBags, selectedBagId]);

  useEffect(() => {
    if (!selectedClient && hotelOptions.length > 0) setSelectedClient(hotelOptions[0]);
  }, [hotelOptions, selectedClient]);

  const addBag = () => {
    setBags(prev => [...prev, nextBagId(prev)]);
    setBagTarget(prev => String(Math.max(Number(prev) || 0, bags.length + 1)));
  };

  const ensureBagCount = () => {
    const target = Math.max(1, Math.min(999, Number(bagTarget) || bags.length));
    setBags(prev => {
      if (target <= prev.length) return prev;
      const next = [...prev];
      while (next.length < target) next.push(nextBagId(next));
      return next;
    });
  };

  const queueTask = () => {
    if (!canQueue) return;
    const now = new Date().toISOString();
    const task = {
      id: `${Date.now()}-${selectedBagId}`,
      bagId: selectedBagId,
      clientName: selectedClient.trim(),
      programId: selectedProgramId,
      trackId: selectedTrackId,
      priority,
      status: 'queued',
      operator: user?.name || user?.username || '',
      createdAt: now,
      updatedAt: now,
    };
    setTasks(prev => [task, ...prev]);
    setPriority('normal');
  };

  const updateTaskStatus = (taskId, status) => {
    setTasks(prev => prev.map(task => (
      task.id === taskId ? { ...task, status, updatedAt: new Date().toISOString() } : task
    )));
  };

  const removeTask = (taskId) => {
    setTasks(prev => prev.filter(task => task.id !== taskId));
  };

  const resetTunnel = () => {
    setTasks(prev => prev.filter(task => task.status !== 'done'));
  };

  const taskProgram = (task) => PROGRAMS.find(program => program.id === task.programId) || PROGRAMS[0];
  const taskTrack = (task) => TRACKS.find(track => track.id === task.trackId) || TRACKS[0];
  const statusLabel = (status) => t(`tunnel.status.${status}`);
  const operatorName = user?.name || user?.username || '';

  const sendTask = async (task) => {
    const program = taskProgram(task);
    const track = taskTrack(task);
    setSendingTaskId(task.id);

    try {
      if (isTunnelGatewayEnabled()) {
        await sendTunnelCommand({
          commandId: task.id,
          bagId: task.bagId,
          hotelName: task.clientName,
          programNumber: program.number,
          trackNumber: track.number,
          priority: task.priority,
          requestedBy: operatorName,
        });
        toastSuccess(t('tunnel.gatewaySent'));
      } else {
        toastWarn(t('tunnel.gatewayDisabled'));
      }
      updateTaskStatus(task.id, 'sent');
    } catch (err) {
      toastError(`${t('tunnel.gatewayError')} ${err.message}`);
      updateTaskStatus(task.id, 'error');
    } finally {
      setSendingTaskId(null);
    }
  };

  if (loading) return <div className="loader">{t('tunnel.loadingData')}</div>;
  if (error) return <DataError onRetry={refetch} />;

  return (
    <div className="tunnel-shell">
      <div className="tunnel-status-strip">
        <div className="tunnel-status-item">
          <Factory size={18} />
          <span>{t('tunnel.plc')}</span>
          <strong>{t('tunnel.plcProject')}</strong>
        </div>
        <div className="tunnel-status-item">
          <Package size={18} />
          <span>{t('tunnel.bags')}</span>
          <strong>{bags.length}</strong>
        </div>
        <div className="tunnel-status-item">
          <PackageCheck size={18} />
          <span>{t('tunnel.available')}</span>
          <strong>{availableBags.length}</strong>
        </div>
        <div className="tunnel-status-item">
          <WashingMachine size={18} />
          <span>{t('tunnel.inTunnel')}</span>
          <strong>{inTunnelCount}</strong>
        </div>
        <div className="tunnel-status-item">
          <BadgeCheck size={18} />
          <span>{t('tunnel.doneToday')}</span>
          <strong>{doneToday}</strong>
        </div>
      </div>

      <section className="tunnel-layout">
        <div className="tunnel-tool-panel">
          <div className="tunnel-section-head">
            <div>
              <div className="tunnel-kicker">{t('tunnel.order')}</div>
              <h2>{t('tunnel.newJob')}</h2>
            </div>
            <button type="button" className="tunnel-icon-btn" onClick={addBag} title={t('tunnel.addBag')}>
              <Plus size={17} />
            </button>
          </div>

          <div className="tunnel-form-grid">
            <label className="tunnel-field">
              <span>{t('tunnel.bagId')}</span>
              <select className="ap-input" value={selectedBagId} onChange={e => setSelectedBagId(e.target.value)}>
                {availableBags.length === 0 && <option value="">{t('tunnel.noBags')}</option>}
                {availableBags.map(bagId => <option key={bagId} value={bagId}>{bagId}</option>)}
              </select>
            </label>

            <label className="tunnel-field">
              <span>{t('tunnel.hotel')}</span>
              <input
                className="ap-input"
                list="tunnel-hotels"
                value={selectedClient}
                onChange={e => setSelectedClient(e.target.value)}
                placeholder={t('tunnel.hotelPlaceholder')}
              />
              <datalist id="tunnel-hotels">
                {hotelOptions.map(name => <option key={name} value={name} />)}
              </datalist>
            </label>

            <label className="tunnel-field">
              <span>{t('tunnel.program')}</span>
              <select className="ap-input" value={selectedProgramId} onChange={e => setSelectedProgramId(e.target.value)}>
                {PROGRAMS.map(program => (
                  <option key={program.id} value={program.id}>
                    {program.number}. {t(`tunnel.programs.${program.id}`)}
                  </option>
                ))}
              </select>
            </label>

            <label className="tunnel-field">
              <span>{t('tunnel.track')}</span>
              <select className="ap-input" value={selectedTrackId} onChange={e => setSelectedTrackId(e.target.value)}>
                {TRACKS.map(track => (
                  <option key={track.id} value={track.id}>
                    {track.number}. {t('tunnel.trackName', { number: track.number })}
                  </option>
                ))}
              </select>
            </label>

            <label className="tunnel-field">
              <span>{t('tunnel.priority')}</span>
              <select className="ap-input" value={priority} onChange={e => setPriority(e.target.value)}>
                <option value="normal">{t('tunnel.normal')}</option>
                <option value="urgent">{t('tunnel.urgent')}</option>
              </select>
            </label>

            <div className="tunnel-field tunnel-count-field">
              <span>{t('tunnel.bagCount')}</span>
              <div className="tunnel-inline-control">
                <input
                  className="ap-input"
                  type="number"
                  min="1"
                  max="999"
                  value={bagTarget}
                  onChange={e => setBagTarget(e.target.value)}
                />
                <button type="button" className="driver-tool-btn" onClick={ensureBagCount}>
                  <ScanBarcode size={15} />
                  {t('tunnel.generate')}
                </button>
              </div>
            </div>
          </div>

          <button type="button" className="tunnel-primary-btn" onClick={queueTask} disabled={!canQueue}>
            <Plus size={17} />
            {t('tunnel.queueBag')}
          </button>
        </div>

        <div className="tunnel-tool-panel tunnel-plc-panel">
          <div className="tunnel-section-head">
            <div>
              <div className="tunnel-kicker">{t('tunnel.gateway')}</div>
              <h2>{t('tunnel.signal')}</h2>
            </div>
            <Cable size={22} />
          </div>

          <div className="tunnel-plc-grid">
            <div><span>bag_id</span><strong>{selectedBagId || '-'}</strong></div>
            <div><span>hotel</span><strong>{selectedClient.trim() || '-'}</strong></div>
            <div><span>program_number</span><strong>{selectedProgram?.number || '-'}</strong></div>
            <div><span>track_number</span><strong>{selectedTrack?.number || '-'}</strong></div>
            <div><span>send_request</span><strong>{canQueue ? '1' : '0'}</strong></div>
            <div><span>priority</span><strong>{priority === 'urgent' ? '1' : '0'}</strong></div>
          </div>
        </div>
      </section>

      <section className="tunnel-board-section">
        <div className="tunnel-section-head">
          <div>
            <div className="tunnel-kicker">{t('tunnel.queue')}</div>
            <h2>{t('tunnel.tracks')}</h2>
          </div>
          <div className="tunnel-mini-stat">{queuedCount} {t('tunnel.waiting')}</div>
        </div>

        <div className="tunnel-track-grid">
          {TRACKS.map(track => {
            const trackTasks = activeTasks
              .filter(task => task.trackId === track.id)
              .sort((a, b) => (STATUS_META[a.status]?.rank || 99) - (STATUS_META[b.status]?.rank || 99));
            return (
              <article className="tunnel-track-card" key={track.id} style={{ '--track-color': track.color }}>
                <div className="tunnel-track-header">
                  <span className="tunnel-track-badge">T{track.number}</span>
                  <strong>{t('tunnel.trackName', { number: track.number })}</strong>
                  <span>{trackTasks.length}</span>
                </div>
                <div className="tunnel-track-list">
                  {trackTasks.length === 0 && <div className="tunnel-empty-row">{t('tunnel.trackFree')}</div>}
                  {trackTasks.map(task => {
                    const StatusIcon = STATUS_META[task.status]?.icon || Clock3;
                    const program = taskProgram(task);
                    return (
                      <div className={`tunnel-task-row status-${task.status}`} key={task.id}>
                        <div className="tunnel-task-main">
                          <div className="tunnel-task-title">
                            <strong>{task.bagId}</strong>
                            {task.priority === 'urgent' && <span className="tunnel-urgent">{t('tunnel.urgentShort')}</span>}
                          </div>
                          <span>{task.clientName}</span>
                          <small>P{program.number} · {t(`tunnel.programs.${program.id}`)}</small>
                        </div>
                        <span className={`tunnel-status-pill status-${task.status}`}>
                          <StatusIcon size={13} />
                          {statusLabel(task.status)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="tunnel-jobs-section">
        <div className="tunnel-section-head">
          <div>
            <div className="tunnel-kicker">{t('tunnel.jobs')}</div>
            <h2>{t('tunnel.allJobs')}</h2>
          </div>
          <button type="button" className="driver-tool-btn" onClick={resetTunnel} disabled={!tasks.some(task => task.status === 'done')}>
            <RotateCcw size={15} />
            {t('tunnel.clearDone')}
          </button>
        </div>

        <div className="tunnel-jobs-list">
          {visibleTasks.length === 0 && <div className="tunnel-empty-list">{t('tunnel.emptyQueue')}</div>}
          {visibleTasks.map(task => {
            const program = taskProgram(task);
            const track = taskTrack(task);
            const StatusIcon = STATUS_META[task.status]?.icon || Clock3;
            return (
              <article className={`tunnel-job-card status-${task.status}`} key={task.id}>
                <div className="tunnel-job-main">
                  <span className="tunnel-job-bag">{task.bagId}</span>
                  <div>
                    <strong>{task.clientName}</strong>
                    <small>
                      P{program.number} · {t(`tunnel.programs.${program.id}`)} · {t('tunnel.trackName', { number: track.number })}
                    </small>
                  </div>
                </div>

                <div className="tunnel-job-meta">
                  <span className={`tunnel-status-pill status-${task.status}`}>
                    <StatusIcon size={13} />
                    {statusLabel(task.status)}
                  </span>
                  <span>{formatter.format(new Date(task.updatedAt || task.createdAt))}</span>
                  {task.operator && <span>{task.operator}</span>}
                </div>

                <div className="tunnel-job-actions">
                  {task.status === 'queued' && (
                    <button
                      type="button"
                      className="tunnel-action-btn"
                      onClick={() => sendTask(task)}
                      disabled={sendingTaskId === task.id}
                    >
                      <Send size={14} />
                      {sendingTaskId === task.id ? t('tunnel.sending') : t('tunnel.send')}
                    </button>
                  )}
                  {task.status === 'sent' && (
                    <button type="button" className="tunnel-action-btn" onClick={() => updateTaskStatus(task.id, 'inTunnel')}>
                      <WashingMachine size={14} />
                      {t('tunnel.markInTunnel')}
                    </button>
                  )}
                  {['queued', 'sent', 'inTunnel'].includes(task.status) && (
                    <button type="button" className="tunnel-action-btn is-danger" onClick={() => updateTaskStatus(task.id, 'error')}>
                      <TriangleAlert size={14} />
                      {t('tunnel.markError')}
                    </button>
                  )}
                  {['inTunnel', 'error'].includes(task.status) && (
                    <button type="button" className="tunnel-action-btn is-success" onClick={() => updateTaskStatus(task.id, 'done')}>
                      <CircleCheck size={14} />
                      {t('tunnel.finish')}
                    </button>
                  )}
                  {task.status === 'error' && (
                    <button type="button" className="tunnel-action-btn" onClick={() => updateTaskStatus(task.id, 'queued')}>
                      <RotateCcw size={14} />
                      {t('tunnel.retry')}
                    </button>
                  )}
                  {task.status === 'done' && (
                    <button type="button" className="tunnel-icon-btn" onClick={() => removeTask(task.id)} title={t('common.delete')}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="tunnel-next-section">
        <div className="tunnel-section-head">
          <div>
            <div className="tunnel-kicker">{t('tunnel.integration')}</div>
            <h2>{t('tunnel.plcContract')}</h2>
          </div>
          <Settings2 size={20} />
        </div>
        <div className="tunnel-contract-grid">
          <div><span>write.program_number</span><strong>INT</strong></div>
          <div><span>write.track_number</span><strong>INT</strong></div>
          <div><span>write.send_request</span><strong>BOOL</strong></div>
          <div><span>read.ack</span><strong>BOOL</strong></div>
          <div><span>read.busy</span><strong>BOOL</strong></div>
          <div><span>read.error_code</span><strong>INT</strong></div>
        </div>
      </section>
    </div>
  );
}
