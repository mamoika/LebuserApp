import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ChevronRight, FileArchive, FileUp,
  History, LoaderCircle, ShieldCheck, Truck, UserRoundCheck, X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getDriverCardDddContext, importDriverCardDdd, parseDriverCardDdd } from '../../lib/driverCardDddApi';
import { toastError, toastSuccess } from '../../lib/toast';

const MAX_DDD_SIZE = 2 * 1024 * 1024;

function toLocalDateTimeInput(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function minutesLabel(minutes) {
  const safe = Math.max(0, Number(minutes) || 0);
  return `${Math.floor(safe / 60)} h ${String(safe % 60).padStart(2, '0')} min`;
}

function formatDate(value, locale) {
  if (!value) return '—';
  return new Date(`${value}T00:00:00`).toLocaleDateString(locale);
}

function resetInput(inputRef) {
  if (inputRef.current) inputRef.current.value = '';
}

function formatDateTime(value, locale) {
  if (!value) return '—';
  return new Date(value).toLocaleString(locale);
}

function incidentLabel(value) {
  return String(value || 'UNKNOWN').toLowerCase().replaceAll('_', ' ');
}

function DddRecordedDetails({ summary, locale, t }) {
  const [section, setSection] = useState('days');
  const days = [...(summary.daily_activities || [])].reverse();
  const vehicles = [...(summary.vehicle_details || [])].reverse();
  const incidents = [
    ...(summary.events || []).map(item => ({ ...item, kind: 'event' })),
    ...(summary.faults || []).map(item => ({ ...item, kind: 'fault' })),
  ].sort((a, b) => String(b.begin_at).localeCompare(String(a.begin_at)));

  return (
    <div className="ddd-record-details">
      <div className="ddd-detail-tabs" role="tablist" aria-label={t('course.ddd.detailsLabel')}>
        <button type="button" role="tab" aria-selected={section === 'days'} onClick={() => setSection('days')}>{t('course.ddd.daysTab', { count: days.length })}</button>
        <button type="button" role="tab" aria-selected={section === 'vehicles'} onClick={() => setSection('vehicles')}>{t('course.ddd.vehiclesTab', { count: vehicles.length })}</button>
        <button type="button" role="tab" aria-selected={section === 'incidents'} onClick={() => setSection('incidents')}>{t('course.ddd.incidentsTab', { count: incidents.length })}</button>
      </div>

      {section === 'days' && (
        <div className="ddd-detail-table-wrap" role="tabpanel">
          <table className="ddd-detail-table">
            <thead><tr><th>{t('course.ddd.date')}</th><th>{t('course.ddd.driving')}</th><th>{t('course.ddd.work')}</th><th>{t('course.ddd.availability')}</th><th>{t('course.ddd.rest')}</th></tr></thead>
            <tbody>{days.map(day => <tr key={day.date}><td>{formatDate(day.date, locale)}</td><td>{minutesLabel(day.driving_minutes)}</td><td>{minutesLabel(day.work_minutes)}</td><td>{minutesLabel(day.availability_minutes)}</td><td>{minutesLabel(day.rest_minutes)}</td></tr>)}</tbody>
          </table>
          {!days.length && <div className="ddd-detail-empty">{t('course.ddd.noDayDetails')}</div>}
        </div>
      )}

      {section === 'vehicles' && (
        <div className="ddd-detail-list" role="tabpanel">
          {vehicles.map((vehicle, index) => (
            <article key={`${vehicle.registration}-${vehicle.first_use}-${index}`}>
              <Truck size={16} aria-hidden="true" />
              <span><strong>{vehicle.registration || t('course.ddd.unknownVehicle')}</strong><small>{formatDateTime(vehicle.first_use, locale)} – {formatDateTime(vehicle.last_use, locale)}</small></span>
              <span className="ddd-vehicle-km">{vehicle.odometer_from_km?.toLocaleString(locale)}–{vehicle.odometer_to_km?.toLocaleString(locale)} km</span>
            </article>
          ))}
          {!vehicles.length && <div className="ddd-detail-empty">{t('course.ddd.noVehicleDetails')}</div>}
        </div>
      )}

      {section === 'incidents' && (
        <div className="ddd-detail-list" role="tabpanel">
          {incidents.map((incident, index) => (
            <article key={`${incident.kind}-${incident.begin_at}-${index}`} className={incident.kind === 'fault' ? 'is-fault' : 'is-event'}>
              <AlertTriangle size={16} aria-hidden="true" />
              <span><strong>{incidentLabel(incident.type)}</strong><small>{formatDateTime(incident.begin_at, locale)} – {formatDateTime(incident.end_at, locale)}{incident.registration ? ` · ${incident.registration}` : ''}</small></span>
              <span className="ddd-incident-kind">{t(`course.ddd.${incident.kind}`)}</span>
            </article>
          ))}
          {!incidents.length && <div className="ddd-detail-empty">{t('course.ddd.noIncidents')}</div>}
        </div>
      )}
    </div>
  );
}

export default function DriverCardDddDialog({ open, onClose, sessionToken }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('de') ? 'de-DE' : 'pl-PL';
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [employeeId, setEmployeeId] = useState('');
  const [downloadedAt, setDownloadedAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recentImports, setRecentImports] = useState([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archivedImport, setArchivedImport] = useState(null);

  const summary = archivedImport?.summary || result?.summary || null;
  const drivers = useMemo(() => result?.drivers || [], [result?.drivers]);
  const selectedDriver = useMemo(
    () => drivers.find(driver => driver.employee_id === employeeId),
    [drivers, employeeId],
  );

  const clearFile = () => {
    setFile(null);
    setResult(null);
    setEmployeeId('');
    setDownloadedAt('');
    setError('');
    setArchivedImport(null);
    resetInput(inputRef);
  };

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    dialogRef.current?.focus();
    const onKeyDown = event => {
      if (event.key === 'Escape' && !busy) onClose();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus?.();
    };
  }, [busy, onClose, open]);

  useEffect(() => {
    if (!open || !sessionToken) return undefined;
    let active = true;
    setArchiveLoading(true);
    getDriverCardDddContext(sessionToken)
      .then(data => { if (active) setRecentImports(data.imports || []); })
      .catch(contextError => { if (active) setError(contextError.message); })
      .finally(() => { if (active) setArchiveLoading(false); });
    return () => { active = false; };
  }, [open, sessionToken]);

  useEffect(() => {
    if (open) return;
    setFile(null);
    setResult(null);
    setEmployeeId('');
    setDownloadedAt('');
    setError('');
    setArchivedImport(null);
    resetInput(inputRef);
  }, [open]);

  if (!open) return null;

  const analyzeFile = async selectedFile => {
    setError('');
    setResult(null);
    setEmployeeId('');
    setDownloadedAt('');
    if (!selectedFile?.name?.toLowerCase().endsWith('.ddd')) {
      setError(t('course.ddd.errors.extension'));
      resetInput(inputRef);
      return;
    }
    if (!selectedFile.size || selectedFile.size > MAX_DDD_SIZE) {
      setError(t('course.ddd.errors.size'));
      resetInput(inputRef);
      return;
    }
    setFile(selectedFile);
    setBusy(true);
    try {
      const parsed = await parseDriverCardDdd(sessionToken, selectedFile);
      setResult(parsed);
      setRecentImports(parsed.imports || []);
      setEmployeeId(parsed.summary?.matched_employee_id || '');
      setDownloadedAt(toLocalDateTimeInput(parsed.summary?.downloaded_at));
    } catch (parseError) {
      setError(parseError.message);
    } finally {
      setBusy(false);
    }
  };

  const saveImport = async () => {
    if (!file || !summary || !employeeId || !downloadedAt) return;
    setBusy(true);
    setError('');
    try {
      const response = await importDriverCardDdd(
        sessionToken,
        file,
        employeeId,
        new Date(downloadedAt).toISOString(),
      );
      toastSuccess(response.duplicate
        ? t('course.ddd.duplicate')
        : t('course.ddd.saved', { name: selectedDriver?.name || summary.matched_employee_name }));
      onClose();
    } catch (importError) {
      setError(importError.message);
      toastError(importError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ddd-dialog-overlay" onPointerDown={() => !busy && onClose()}>
      <section
        ref={dialogRef}
        className="ddd-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ddd-dialog-title"
        tabIndex={-1}
        onPointerDown={event => event.stopPropagation()}
      >
        <header className="ddd-dialog-header">
          <div className="ddd-dialog-heading">
            <span className="ddd-dialog-icon"><FileArchive size={20} aria-hidden="true" /></span>
            <div>
              <h2 id="ddd-dialog-title">{t('course.ddd.title')}</h2>
              <p>{t('course.ddd.subtitle')}</p>
            </div>
          </div>
          <button type="button" className="journal-close" onClick={onClose} disabled={busy} aria-label={t('course.ddd.close')}><X size={18} /></button>
        </header>

        {!archivedImport && <div className="ddd-flow" aria-label={t('course.ddd.flowLabel')}>
          <span className={file ? 'done' : 'active'}><FileUp size={14} /> {t('course.ddd.flowFile')}</span>
          <i aria-hidden="true" />
          <span className={summary?.signature_status === 'verified' ? 'done' : file ? 'active' : ''}><ShieldCheck size={14} /> {t('course.ddd.flowVerify')}</span>
          <i aria-hidden="true" />
          <span className={employeeId ? 'done' : summary ? 'active' : ''}><UserRoundCheck size={14} /> {t('course.ddd.flowDriver')}</span>
          <i aria-hidden="true" />
          <span><History size={14} /> {t('course.ddd.flowHistory')}</span>
        </div>}

        {archivedImport && (
          <button type="button" className="ddd-back-button" onClick={() => setArchivedImport(null)}>
            <ArrowLeft size={15} /> {t('course.ddd.backToArchive')}
          </button>
        )}

        {!file && !archivedImport && (
          <div className="ddd-file-start">
            <div>
              <strong>{t('course.ddd.chooseTitle')}</strong>
              <span>{t('course.ddd.chooseHint')}</span>
            </div>
            <label className="ddd-file-button" htmlFor="ddd-file-input"><FileUp size={16} /> {t('course.ddd.chooseButton')}</label>
          </div>
        )}

        <input
          ref={inputRef}
          id="ddd-file-input"
          className="sr-only"
          type="file"
          accept=".ddd,.DDD,application/octet-stream"
          onChange={event => analyzeFile(event.target.files?.[0])}
        />

        {file && (
          <div className="ddd-selected-file">
            <FileArchive size={18} aria-hidden="true" />
            <div><strong>{file.name}</strong><span>{Math.ceil(file.size / 1024)} KB</span></div>
            {!busy && <button type="button" onClick={clearFile}>{t('course.ddd.changeFile')}</button>}
          </div>
        )}

        {busy && !summary && <div className="ddd-loading" role="status"><LoaderCircle className="is-spinning" size={22} /> <span>{t('course.ddd.analyzing')}<small>{t('course.ddd.analyzingHint')}</small></span></div>}

        {error && <div className="ddd-error" role="alert"><AlertTriangle size={18} /><span><strong>{t('course.ddd.errorTitle')}</strong>{error}</span></div>}

        {summary && (
          <>
            <div className="ddd-verification-card">
              <div className="ddd-verified-mark"><CheckCircle2 size={21} /></div>
              <div>
                <strong>{t('course.ddd.verified')}</strong>
                <span>{t('course.ddd.verifiedDetail', { verified: summary.signatures_verified, total: summary.signatures_total, generation: summary.generation })}</span>
              </div>
              <span className="ddd-verified-badge">{t('course.ddd.authentic')}</span>
            </div>

            <div className="ddd-summary-grid">
              <div className="ddd-driver-summary">
                <span className="ddd-data-label">{t('course.ddd.cardOwner')}</span>
                <strong>{summary.first_name} {summary.surname}</strong>
                <small>{summary.masked_card_number} · {t('course.ddd.validUntil')} {formatDate(summary.card_expiry_on, locale)}</small>
              </div>
              <div className="ddd-data-block"><span>{t('course.ddd.activityRange')}</span><strong>{formatDate(summary.activity_first_on, locale)}–{formatDate(summary.activity_last_on, locale)}</strong><small>{t('course.ddd.daysCount', { count: summary.activity_days })}</small></div>
              <div className="ddd-data-block"><span>{t('course.ddd.driving')}</span><strong>{minutesLabel(summary.totals?.driving_minutes)}</strong><small>{t('course.ddd.sessionsCount', { count: summary.vehicle_sessions })}</small></div>
              <div className="ddd-data-block"><span>{t('course.ddd.work')}</span><strong>{minutesLabel(summary.totals?.work_minutes)}</strong><small>{t('course.ddd.eventsFaults', { events: summary.event_count, faults: summary.fault_count })}</small></div>
            </div>

            {!archivedImport && <div className="ddd-confirm-grid">
              <label>
                <span>{t('course.ddd.assignDriver')}</span>
                <select value={employeeId} onChange={event => setEmployeeId(event.target.value)}>
                  <option value="">{t('course.ddd.selectDriver')}</option>
                  {drivers.map(driver => <option key={driver.employee_id} value={driver.employee_id}>{driver.name}</option>)}
                </select>
                <small>{summary.matched_employee_id ? t('course.ddd.matchedAutomatically') : t('course.ddd.matchHint')}</small>
              </label>
              <label>
                <span>{t('course.ddd.readAt')}</span>
                <input type="datetime-local" value={downloadedAt} max={toLocalDateTimeInput(new Date().toISOString())} onChange={event => setDownloadedAt(event.target.value)} />
                <small>{t('course.ddd.readAtHint')}</small>
              </label>
            </div>}

            {!archivedImport && <div className="ddd-dialog-actions">
              <button type="button" className="driver-tool-btn" onClick={onClose} disabled={busy}>{t('course.ddd.cancel')}</button>
              <button type="button" className="ddd-import-button" onClick={saveImport} disabled={busy || !employeeId || !downloadedAt}>
                {busy ? <LoaderCircle className="is-spinning" size={16} /> : <ShieldCheck size={16} />}
                {busy ? t('course.ddd.saving') : t('course.ddd.confirm')}
              </button>
            </div>}

            <DddRecordedDetails summary={summary} locale={locale} t={t} />
          </>
        )}

        {!file && !archivedImport && (
          <section className="ddd-archive" aria-labelledby="ddd-archive-title">
            <div className="ddd-archive-heading">
              <div><h3 id="ddd-archive-title">{t('course.ddd.archiveTitle')}</h3><p>{t('course.ddd.archiveHint')}</p></div>
              <span>{recentImports.length}</span>
            </div>
            {archiveLoading && <div className="ddd-archive-loading" role="status"><LoaderCircle className="is-spinning" size={17} /> {t('course.ddd.loadingArchive')}</div>}
            {!archiveLoading && recentImports.length === 0 && <div className="ddd-detail-empty">{t('course.ddd.emptyArchive')}</div>}
            {!archiveLoading && recentImports.length > 0 && (
              <div className="ddd-archive-list">
                {recentImports.map(item => (
                  <button type="button" key={item.id} onClick={() => setArchivedImport(item)} disabled={!item.summary}>
                    <CheckCircle2 size={16} aria-hidden="true" />
                    <span><strong>{item.employee_name}</strong><small>{formatDateTime(item.downloaded_at, locale)} · {item.generation} · {t('course.ddd.daysCount', { count: item.activity_days })}</small></span>
                    <span className="ddd-archive-action">{item.summary ? t('course.ddd.showDetails') : t('course.ddd.summaryUnavailable')} <ChevronRight size={15} /></span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
      </section>
    </div>
  );
}
