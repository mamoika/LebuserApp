import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ChevronRight, FileArchive, FileUp,
  History, IdCard, LoaderCircle, MapPinned, ShieldAlert, ShieldCheck, Truck, UserRoundCheck, X,
} from 'lucide-react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useTranslation } from 'react-i18next';
import { getDriverCardDddContext, getDriverCardDddDetails, importDriverCardDdd, parseDriverCardDdd } from '../../lib/driverCardDddApi';
import { toastError, toastSuccess } from '../../lib/toast';
import '../mockups/mockups.css';

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

function minuteTime(value) {
  const safe = Math.max(0, Math.min(1440, Number(value) || 0));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function DddMapFit({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const positions = points.map(point => [point.latitude, point.longitude]);
    if (positions.length === 1) map.setView(positions[0], 10);
    else map.fitBounds(positions, { padding: [24, 24], maxZoom: 11 });
  }, [map, points]);
  return null;
}

function DddGnssMap({ points, locale, t }) {
  if (!points.length) return <div className="ddd-detail-empty">{t('course.ddd.noGnss')}</div>;
  const positions = points.map(point => [point.latitude, point.longitude]);
  return (
    <div className="ddd-gnss-map">
      <MapContainer center={positions[0]} zoom={7} scrollWheelZoom={false}>
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <DddMapFit points={points} />
        {points.map((point, index) => (
          <CircleMarker key={`${point.timestamp}-${index}`} center={[point.latitude, point.longitude]} radius={index === points.length - 1 ? 6 : 4} pathOptions={{ color: '#007AFF', fillColor: index === points.length - 1 ? '#007AFF' : '#fff', fillOpacity: 1, weight: 2 }}>
            <Popup><strong>{formatDateTime(point.timestamp, locale)}</strong><br />{point.odometer_km?.toLocaleString(locale)} km<br />{point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}</Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}

function DddRecordedDetails({ summary, locale, t }) {
  const [section, setSection] = useState('activity');
  const days = [...(summary.daily_activities || [])].reverse();
  const [selectedDayDate, setSelectedDayDate] = useState(days[0]?.date || '');
  const selectedDay = days.find(day => day.date === selectedDayDate) || days[0];
  const vehicles = [...(summary.vehicle_details || [])].reverse();
  const gnss = [...(summary.gnss_points || [])].sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  const mapDates = [...new Set(gnss.map(point => String(point.timestamp || '').slice(0, 10)).filter(Boolean))].sort().reverse();
  const [selectedMapDate, setSelectedMapDate] = useState(mapDates[0] || '');
  const mapPoints = gnss.filter(point => String(point.timestamp || '').startsWith(selectedMapDate));
  const units = [...(summary.vehicle_units || [])].reverse();
  const alerts = summary.compliance_alerts || [];
  const incidents = [
    ...(summary.events || []).map(item => ({ ...item, kind: 'event' })),
    ...(summary.faults || []).map(item => ({ ...item, kind: 'fault' })),
  ].sort((a, b) => String(b.begin_at).localeCompare(String(a.begin_at)));

  return (
    <div className="ddd-record-details">
      <div className="ddd-detail-tabs" role="tablist" aria-label={t('course.ddd.detailsLabel')}>
        <button type="button" role="tab" aria-selected={section === 'activity'} onClick={() => setSection('activity')}>{t('course.ddd.activityTab')}</button>
        <button type="button" role="tab" aria-selected={section === 'vehicles'} onClick={() => setSection('vehicles')}>{t('course.ddd.vehiclesTab', { count: vehicles.length })}</button>
        <button type="button" role="tab" aria-selected={section === 'locations'} onClick={() => setSection('locations')}><MapPinned size={13} /> {t('course.ddd.locationsTab', { count: gnss.length })}</button>
        <button type="button" role="tab" aria-selected={section === 'records'} onClick={() => setSection('records')}><IdCard size={13} /> {t('course.ddd.recordsTab')}</button>
        <button type="button" role="tab" aria-selected={section === 'alerts'} onClick={() => setSection('alerts')}><ShieldAlert size={13} /> {t('course.ddd.alertsTab', { count: alerts.length + incidents.length })}</button>
      </div>

      {section === 'activity' && (
        <div role="tabpanel">
          <div className="ddd-detail-table-wrap">
            <table className="ddd-detail-table">
              <thead><tr><th>{t('course.ddd.date')}</th><th>{t('course.ddd.driving')}</th><th>{t('course.ddd.work')}</th><th>{t('course.ddd.availability')}</th><th>{t('course.ddd.rest')}</th><th>{t('course.ddd.distance')}</th></tr></thead>
              <tbody>{days.map(day => <tr key={day.date} className={selectedDay?.date === day.date ? 'is-selected' : ''}><td><button type="button" onClick={() => setSelectedDayDate(day.date)}>{formatDate(day.date, locale)}</button></td><td>{minutesLabel(day.driving_minutes)}</td><td>{minutesLabel(day.work_minutes)}</td><td>{minutesLabel(day.availability_minutes)}</td><td>{minutesLabel(day.rest_minutes)}</td><td>{day.distance_km?.toLocaleString(locale)} km</td></tr>)}</tbody>
            </table>
            {!days.length && <div className="ddd-detail-empty">{t('course.ddd.noDayDetails')}</div>}
          </div>
          {selectedDay && (
            <div className="ddd-day-timeline">
              <div className="ddd-day-timeline-heading"><strong>{t('course.ddd.dayTimeline')}</strong><span>{formatDate(selectedDay.date, locale)} · {selectedDay.changes?.length || 0} {t('course.ddd.changes')}</span></div>
              <div className="ddd-day-strip" aria-hidden="true">{(selectedDay.changes || []).map((change, index) => <i key={index} className={`is-${change.activity.toLowerCase()}`} style={{ width: `${Math.max(0.3, ((change.end_minute - change.start_minute) / 1440) * 100)}%` }} />)}</div>
              <div className="ddd-timeline-list">{(selectedDay.changes || []).map((change, index) => <div key={`${change.start_minute}-${index}`}><time>{minuteTime(change.start_minute)}–{minuteTime(change.end_minute)}</time><span className={`ddd-activity-kind is-${change.activity.toLowerCase()}`}>{t(`course.ddd.activity.${change.activity.toLowerCase()}`)}</span><small>{change.inserted ? t('course.ddd.cardInserted') : t('course.ddd.cardRemoved')} · {t('course.ddd.slot', { slot: change.slot })}{change.crew ? ` · ${t('course.ddd.crew')}` : ''}</small></div>)}</div>
            </div>
          )}
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
          {units.length > 0 && <div className="ddd-list-divider">{t('course.ddd.tachographs', { count: units.length })}</div>}
          {units.map((unit, index) => <article key={`${unit.timestamp}-${index}`}><ShieldCheck size={16} aria-hidden="true" /><span><strong>{t('course.ddd.tachographUnit', { code: unit.manufacturer_code })}</strong><small>{formatDateTime(unit.timestamp, locale)} · {unit.software_version || '—'}</small></span><span className="ddd-vehicle-km">{unit.device_id}</span></article>)}
          {!vehicles.length && <div className="ddd-detail-empty">{t('course.ddd.noVehicleDetails')}</div>}
        </div>
      )}

      {section === 'locations' && <div role="tabpanel"><div className="ddd-map-toolbar"><label htmlFor="ddd-map-date">{t('course.ddd.mapDay')}</label><select id="ddd-map-date" value={selectedMapDate} onChange={event => setSelectedMapDate(event.target.value)}>{mapDates.map(date => <option key={date} value={date}>{formatDate(date, locale)}</option>)}</select><span>{t('course.ddd.mapPointsOnDay', { count: mapPoints.length })}</span></div><DddGnssMap points={mapPoints} locale={locale} t={t} /><p className="ddd-map-note">{t('course.ddd.gnssNote')}</p></div>}

      {section === 'records' && (
        <div className="ddd-records-panel" role="tabpanel">
          <div className="ddd-metadata-grid">
            {[
              ['birthDate', summary.card_metadata?.birth_date], ['preferredLanguage', summary.card_metadata?.preferred_language],
              ['issuingState', summary.card_metadata?.issuing_state], ['issuingAuthority', summary.card_metadata?.issuing_authority],
              ['issueDate', summary.card_metadata?.issue_date ? formatDateTime(summary.card_metadata.issue_date, locale) : '—'],
              ['validityBegin', summary.card_metadata?.validity_begin ? formatDateTime(summary.card_metadata.validity_begin, locale) : '—'],
              ['licence', summary.card_metadata?.licence_number_masked], ['licenceAuthority', summary.card_metadata?.licence_authority],
              ['previousDownload', formatDateTime(summary.card_metadata?.previous_download_at, locale)],
              ['currentVehicle', summary.card_metadata?.current_vehicle || '—'],
            ].map(([label, value]) => <div key={label}><span>{t(`course.ddd.meta.${label}`)}</span><strong>{value || '—'}</strong></div>)}
          </div>
          <div className="ddd-control-card"><ShieldCheck size={18} /><div><strong>{t('course.ddd.lastControl')}</strong>{summary.control?.valid ? <><span>{formatDateTime(summary.control.control_at, locale)} · {summary.control.vehicle || '—'}</span><small>{(summary.control.actions || []).map(action => t(`course.ddd.control.${action.toLowerCase()}`)).join(', ') || '—'} · {formatDateTime(summary.control.period_begin, locale)}–{formatDateTime(summary.control.period_end, locale)}</small></> : <span>{summary.control ? t('course.ddd.controlUnreadable') : t('course.ddd.noControl')}</span>}</div></div>
        </div>
      )}

      {section === 'alerts' && (
        <div role="tabpanel">
          <div className="ddd-compliance-note"><ShieldAlert size={17} /><span><strong>{t('course.ddd.analysisNoticeTitle')}</strong>{t('course.ddd.analysisNotice')}</span></div>
          <div className="ddd-detail-list ddd-alert-list">
            {alerts.map((alert, index) => <article key={`${alert.type}-${alert.date_from}-${index}`} className={`is-${alert.severity}`}><ShieldAlert size={16} /><span><strong>{t(`course.ddd.alert.${alert.type.toLowerCase()}`)}</strong><small>{formatDate(alert.date_from, locale)}{alert.date_to ? `–${formatDate(alert.date_to, locale)}` : ''}</small></span><span className="ddd-alert-value">{alert.unit === 'days' ? `${alert.actual}/${alert.limit}` : `${minutesLabel(alert.actual)} / ${minutesLabel(alert.limit)}`}</span></article>)}
            {incidents.map((incident, index) => (
              <article key={`${incident.kind}-${incident.begin_at}-${index}`} className={incident.kind === 'fault' ? 'is-fault' : 'is-event'}>
                <AlertTriangle size={16} aria-hidden="true" />
                <span><strong>{incidentLabel(incident.type)}</strong><small>{formatDateTime(incident.begin_at, locale)} – {formatDateTime(incident.end_at, locale)}{incident.registration ? ` · ${incident.registration}` : ''}</small></span>
                <span className="ddd-incident-kind">{t(`course.ddd.${incident.kind}`)}</span>
              </article>
            ))}
            {!alerts.length && !incidents.length && <div className="ddd-detail-empty">{t('course.ddd.noAlerts')}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DriverCardDddDialog({ open, onClose, onSaved, presetDriver = null, sessionToken }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('de') ? 'de-DE' : 'pl-PL';
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [employeeId, setEmployeeId] = useState(presetDriver?.employee_id || '');
  const [downloadedAt, setDownloadedAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recentImports, setRecentImports] = useState([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveDetailLoading, setArchiveDetailLoading] = useState(false);
  const [archivedImport, setArchivedImport] = useState(null);

  const summary = archivedImport?.summary || result?.summary || null;
  const drivers = useMemo(() => result?.drivers || [], [result?.drivers]);
  const selectedDriver = useMemo(
    () => presetDriver || drivers.find(driver => driver.employee_id === employeeId),
    [drivers, employeeId, presetDriver],
  );

  const clearFile = () => {
    setFile(null);
    setResult(null);
    setEmployeeId(presetDriver?.employee_id || '');
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
    getDriverCardDddContext(sessionToken, presetDriver?.employee_id)
      .then(data => { if (active) setRecentImports(data.imports || []); })
      .catch(contextError => { if (active) setError(contextError.message); })
      .finally(() => { if (active) setArchiveLoading(false); });
    return () => { active = false; };
  }, [open, presetDriver?.employee_id, sessionToken]);

  useEffect(() => {
    if (open) return;
    setFile(null);
    setResult(null);
    setEmployeeId(presetDriver?.employee_id || '');
    setDownloadedAt('');
    setError('');
    setArchivedImport(null);
    resetInput(inputRef);
  }, [open, presetDriver?.employee_id]);

  if (!open) return null;

  const analyzeFile = async selectedFile => {
    setError('');
    setResult(null);
    setEmployeeId(presetDriver?.employee_id || '');
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
      const parsed = await parseDriverCardDdd(sessionToken, selectedFile, presetDriver?.employee_id);
      setResult(parsed);
      setRecentImports(parsed.imports || []);
      setEmployeeId(presetDriver?.employee_id || parsed.summary?.matched_employee_id || '');
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
      await onSaved?.();
      onClose();
    } catch (importError) {
      setError(importError.message);
      toastError(importError.message);
    } finally {
      setBusy(false);
    }
  };

  const showArchivedImport = async item => {
    setArchiveDetailLoading(true);
    setError('');
    try {
      const detail = await getDriverCardDddDetails(sessionToken, item.id, presetDriver?.employee_id);
      setArchivedImport({ ...item, summary: detail.summary });
    } catch (detailError) {
      setError(detailError.message);
    } finally {
      setArchiveDetailLoading(false);
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
              <h2 id="ddd-dialog-title">{presetDriver ? t('course.ddd.driverTitle', { name: presetDriver.name }) : t('course.ddd.title')}</h2>
              <p>{presetDriver ? t('course.ddd.driverSubtitle') : t('course.ddd.subtitle')}</p>
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

        {(busy || archiveDetailLoading) && !summary && <div className="ddd-loading" role="status"><LoaderCircle className="is-spinning" size={22} /> <span>{archiveDetailLoading ? t('course.ddd.loadingDetails') : t('course.ddd.analyzing')}<small>{archiveDetailLoading ? t('course.ddd.loadingDetailsHint') : t('course.ddd.analyzingHint')}</small></span></div>}

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
              {presetDriver ? <div className="ddd-assigned-driver">
                <span>{t('course.ddd.assignDriver')}</span>
                <strong><UserRoundCheck size={15} /> {presetDriver.name}</strong>
                <small>{t('course.ddd.driverLockedHint')}</small>
              </div> : <label>
                <span>{t('course.ddd.assignDriver')}</span>
                <select value={employeeId} onChange={event => setEmployeeId(event.target.value)}>
                  <option value="">{t('course.ddd.selectDriver')}</option>
                  {drivers.map(driver => <option key={driver.employee_id} value={driver.employee_id}>{driver.name}</option>)}
                </select>
                <small>{summary.matched_employee_id ? t('course.ddd.matchedAutomatically') : t('course.ddd.matchHint')}</small>
              </label>}
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

            <DddRecordedDetails key={archivedImport?.id || summary.sha256 || summary.file_name} summary={summary} locale={locale} t={t} />
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
                  <button type="button" key={item.id} onClick={() => showArchivedImport(item)} disabled={archiveDetailLoading}>
                    <CheckCircle2 size={16} aria-hidden="true" />
                    <span><strong>{item.employee_name}</strong><small>{formatDateTime(item.downloaded_at, locale)} · {item.generation} · {t('course.ddd.daysCount', { count: item.activity_days })}</small></span>
                    <span className="ddd-archive-action">{t('course.ddd.showDetails')} <ChevronRight size={15} /></span>
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
