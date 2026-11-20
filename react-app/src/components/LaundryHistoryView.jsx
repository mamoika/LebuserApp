import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { currentLocale } from '../lib/dateUtils';
import { buildLaundryHistoryDays } from '../lib/laundryHistory';
import { getLaundryHistory } from '../lib/laundryRpc';
import { plannedWashDateOf } from '../lib/laundryWashDates';
import './LaundryHistoryView.css';

function formatDate(date, locale) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(locale, {
    dateStyle: 'long',
    timeZone: 'Europe/Warsaw',
  });
}

function HistoryEvents({ label, events, dateTime, missing }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {events.length ? events.map(event => (
          <div className="laundry-history-event" key={event.key}>
            {event.time != null && (
              <time className="tabular-nums" dateTime={new Date(event.time).toISOString()}>
                {dateTime.format(event.time)}
              </time>
            )}
            {event.person && <span>{event.person}</span>}
          </div>
        )) : missing}
      </dd>
    </div>
  );
}

export default function LaundryHistoryView({ sessionToken, initialFrom, initialTo, scheduleByRoute, dailyServiceByClient }) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState({ from: initialFrom, to: initialTo, client: '' });
  const [request, setRequest] = useState({ filters, cursors: [null] });
  const [result, setResult] = useState(null);

  useEffect(() => {
    let active = true;
    getLaundryHistory(sessionToken, { ...request.filters, before: request.cursors.at(-1) })
      .then(data => { if (active) setResult({ request, data }); })
      .catch(() => { if (active) setResult({ request, error: true }); });
    return () => { active = false; };
  }, [request, sessionToken]);

  const current = result?.request === request ? result : null;
  const days = useMemo(() => buildLaundryHistoryDays(
    current?.data?.entries || [],
    entry => plannedWashDateOf(entry, scheduleByRoute, dailyServiceByClient),
  ), [current, dailyServiceByClient, scheduleByRoute]);
  const locale = currentLocale();
  const dateTime = new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Warsaw',
  });
  const weight = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const invalidRange = !filters.from || !filters.to || filters.from > filters.to;

  const search = event => {
    event.preventDefault();
    if (!invalidRange) setRequest({ filters, cursors: [null] });
  };

  return (
    <section className="laundry-history" aria-label={t('wash.history.title')}>
      <form className="laundry-history-filters" onSubmit={search}>
        <label>
          {t('wash.history.client')}
          <input
            type="search"
            value={filters.client}
            onChange={event => setFilters({ ...filters, client: event.target.value })}
          />
        </label>
        <label>
          {t('wash.history.from')}
          <input
            className="tabular-nums"
            type="date"
            max={filters.to || undefined}
            value={filters.from}
            onChange={event => setFilters({ ...filters, from: event.target.value })}
            required
          />
        </label>
        <label>
          {t('wash.history.to')}
          <input
            className="tabular-nums"
            type="date"
            min={filters.from || undefined}
            value={filters.to}
            onChange={event => setFilters({ ...filters, to: event.target.value })}
            required
          />
        </label>
        <button className="laundry-action-btn is-primary" type="submit">
          <Search size={16} aria-hidden="true" />
          {t('wash.history.search')}
        </button>
      </form>

      <div className="laundry-history-results" aria-busy={!current}>
        {!current && <p className="laundry-history-notice" role="status">{t('wash.history.loading')}</p>}
        {current?.error && (
          <div className="laundry-history-notice" role="alert">
            <p>{t('wash.history.error')}</p>
            <button className="laundry-action-btn" type="button" onClick={() => setRequest({ ...request })}>
              {t('common.refresh')}
            </button>
          </div>
        )}
        {current?.data && !days.length && <p className="laundry-history-notice" role="status">{t('wash.history.empty')}</p>}

        {days.map(day => (
          <section key={day.date} className="laundry-history-day">
            <h2><time className="tabular-nums" dateTime={day.date}>{formatDate(day.date, locale)}</time></h2>
            <div className="laundry-history-batches">
              {day.batches.map(batch => (
                <details className="laundry-history-batch" key={batch.key}>
                  <summary>
                    <span className="laundry-history-client">{batch.clientName || '—'}</span>
                    {batch.collected && <span className="laundry-history-collected">{t('wash.history.collected')}</span>}
                    <span className="laundry-history-weight tabular-nums">
                      {batch.weight > 0
                        ? t(batch.hasUnknownWeight ? 'wash.history.knownWeight' : 'wash.weightKg', { weight: weight.format(batch.weight) })
                        : t('wash.unknownWeight')}
                    </span>
                    <ChevronDown size={16} aria-hidden="true" />
                  </summary>
                  <dl className="laundry-history-timeline">
                    <div>
                      <dt>{t('wash.history.planned')}</dt>
                      <dd>{batch.washDate ? (
                        <time className="tabular-nums" dateTime={batch.washDate}>{formatDate(batch.washDate, locale)}</time>
                      ) : '—'}</dd>
                    </div>
                    <HistoryEvents label={t('wash.history.washed')} events={batch.washed} dateTime={dateTime} missing="—" />
                    <HistoryEvents label={t('wash.history.packed')} events={batch.packed} dateTime={dateTime} missing="—" />
                    <HistoryEvents label={t('wash.history.picked')} events={batch.picked} dateTime={dateTime} missing="—" />
                  </dl>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>

      {current?.data && (request.cursors.length > 1 || current.data.older_than) && (
        <nav className="laundry-history-pages" aria-label={t('wash.history.pagination')}>
          <button
            type="button"
            className="laundry-action-btn"
            disabled={request.cursors.length === 1}
            onClick={() => setRequest({ ...request, cursors: request.cursors.slice(0, -1) })}
          >
            <ChevronLeft size={16} aria-hidden="true" />
            {t('wash.history.newer')}
          </button>
          <button
            type="button"
            className="laundry-action-btn"
            disabled={!current.data.older_than}
            onClick={() => setRequest({ ...request, cursors: [...request.cursors, current.data.older_than] })}
          >
            {t('wash.history.older')}
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </nav>
      )}
    </section>
  );
}
