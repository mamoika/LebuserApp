import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, FileArchive, FileUp,
  History, LoaderCircle, ShieldCheck, UserRoundCheck, X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { importDriverCardDdd, parseDriverCardDdd } from '../../lib/driverCardDddApi';
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

  const summary = result?.summary || null;
  const drivers = useMemo(() => result?.drivers || [], [result?.drivers]);
  const recentImports = result?.imports || [];
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
    if (open) return;
    setFile(null);
    setResult(null);
    setEmployeeId('');
    setDownloadedAt('');
    setError('');
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

        <div className="ddd-flow" aria-label={t('course.ddd.flowLabel')}>
          <span className={file ? 'done' : 'active'}><FileUp size={14} /> {t('course.ddd.flowFile')}</span>
          <i aria-hidden="true" />
          <span className={summary?.signature_status === 'verified' ? 'done' : file ? 'active' : ''}><ShieldCheck size={14} /> {t('course.ddd.flowVerify')}</span>
          <i aria-hidden="true" />
          <span className={employeeId ? 'done' : summary ? 'active' : ''}><UserRoundCheck size={14} /> {t('course.ddd.flowDriver')}</span>
          <i aria-hidden="true" />
          <span><History size={14} /> {t('course.ddd.flowHistory')}</span>
        </div>

        {!file && (
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

            <div className="ddd-confirm-grid">
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
            </div>

            <div className="ddd-dialog-actions">
              <button type="button" className="driver-tool-btn" onClick={onClose} disabled={busy}>{t('course.ddd.cancel')}</button>
              <button type="button" className="ddd-import-button" onClick={saveImport} disabled={busy || !employeeId || !downloadedAt}>
                {busy ? <LoaderCircle className="is-spinning" size={16} /> : <ShieldCheck size={16} />}
                {busy ? t('course.ddd.saving') : t('course.ddd.confirm')}
              </button>
            </div>
          </>
        )}

        {summary && recentImports.length > 0 && (
          <details className="ddd-recent-imports">
            <summary><History size={14} /> {t('course.ddd.recentImports', { count: recentImports.length })}</summary>
            <div>
              {recentImports.slice(0, 8).map(item => (
                <article key={item.id}>
                  <CheckCircle2 size={14} />
                  <span><strong>{item.employee_name}</strong><small>{new Date(item.downloaded_at).toLocaleString(locale)} · {item.generation}</small></span>
                </article>
              ))}
            </div>
          </details>
        )}
      </section>
    </div>
  );
}
