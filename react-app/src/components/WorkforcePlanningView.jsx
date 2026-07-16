import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Minus, Plus, Save, UserRound, UsersRound, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getWorkScheduleMonth } from '../lib/readRpc';
import { toastError, toastSuccess } from '../lib/toast';
import { currentLocale } from '../lib/dateUtils';
import {
  buildPlanningRoster,
  normalizeWorkforcePlan,
  summarizeWorkforcePlan,
  WORKFORCE_STATIONS,
} from '../lib/workforcePlanning';
import { getWorkforcePlan, saveWorkforcePlan } from '../lib/workforcePlanningRpc';
import DataError from './DataError';

function ymd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateFromYmd(value) {
  const [year, month, day] = String(value).split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

function moveDay(value, delta) {
  const date = dateFromYmd(value);
  date.setDate(date.getDate() + delta);
  return ymd(date);
}

function shortTime(value) {
  return String(value || '').slice(0, 5);
}

export default function WorkforcePlanningView() {
  const { t } = useTranslation();
  const { isAdmin, canViewAdminData, sessionToken } = useAuth();
  const [workDate, setWorkDate] = useState(() => ymd(new Date()));
  const [roster, setRoster] = useState([]);
  const [plan, setPlan] = useState(() => normalizeWorkforcePlan(null));
  const [updatedAt, setUpdatedAt] = useState(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState(null);

  const loadPlan = useCallback(async () => {
    if (!canViewAdminData || !sessionToken) return;
    const date = dateFromYmd(workDate);
    setLoading(true);
    setError(null);
    setSelectedEmployeeId(null);
    try {
      const [scheduleData, planData] = await Promise.all([
        getWorkScheduleMonth(sessionToken, date.getFullYear(), date.getMonth() + 1),
        getWorkforcePlan(sessionToken, workDate),
      ]);
      const people = buildPlanningRoster(scheduleData?.roster || [], scheduleData?.schedule_entries || [], workDate);
      const availableIds = new Set(people.filter(person => person.available).map(person => String(person.id)));
      setRoster(people);
      setPlan(normalizeWorkforcePlan(planData?.plan, availableIds));
      setUpdatedAt(planData?.updated_at || null);
      setDirty(false);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [canViewAdminData, sessionToken, workDate]);

  useEffect(() => { loadPlan(); }, [loadPlan]);

  const availablePeople = useMemo(
    () => roster.filter(person => person.available).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), currentLocale())),
    [roster],
  );
  const absentPeople = useMemo(() => roster.filter(person => !person.available), [roster]);
  const personById = useMemo(() => Object.fromEntries(roster.map(person => [String(person.id), person])), [roster]);
  const unassignedPeople = useMemo(
    () => availablePeople.filter(person => !plan.assignments[String(person.id)]),
    [availablePeople, plan.assignments],
  );
  const summary = useMemo(() => summarizeWorkforcePlan(plan, availablePeople.length), [plan, availablePeople.length]);

  const updatePlan = (recipe) => {
    if (!isAdmin) return;
    setPlan(previous => recipe(previous));
    setDirty(true);
  };

  const assignPerson = (employeeId, stationId) => {
    const id = String(employeeId);
    if (!personById[id]?.available) return;
    updatePlan(previous => ({
      ...previous,
      assignments: { ...previous.assignments, [id]: stationId },
    }));
    setSelectedEmployeeId(null);
  };

  const removeAssignment = (employeeId) => {
    updatePlan(previous => {
      const assignments = { ...previous.assignments };
      delete assignments[String(employeeId)];
      return { ...previous, assignments };
    });
  };

  const changeRequirement = (stationId, delta) => {
    updatePlan(previous => ({
      ...previous,
      requirements: {
        ...previous.requirements,
        [stationId]: Math.max(0, Math.min(99, (Number(previous.requirements[stationId]) || 0) + delta)),
      },
    }));
  };

  const save = async () => {
    if (!isAdmin || !dirty) return;
    setSaving(true);
    try {
      const result = await saveWorkforcePlan(sessionToken, workDate, plan, updatedAt);
      setUpdatedAt(result?.updated_at || null);
      setDirty(false);
      toastSuccess(t('workforcePlanning.saved'));
    } catch (err) {
      const concurrent = /CONCURRENT_MODIFICATION/i.test(err?.message || '');
      toastError(t(concurrent ? 'workforcePlanning.concurrentError' : 'workforcePlanning.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const selectDate = (nextDate) => {
    if (dirty && !window.confirm(t('workforcePlanning.discardConfirm'))) return;
    setWorkDate(nextDate);
  };

  if (!canViewAdminData) return <div className="workforce-planning-empty">{t('admin.noAccess')}</div>;
  if (loading) return <div className="loader workforce-planning-loader">{t('workforcePlanning.loading')}</div>;
  if (error) return <DataError error={error} onRetry={loadPlan} />;

  const selectedPerson = selectedEmployeeId ? personById[selectedEmployeeId] : null;
  const dateLabel = dateFromYmd(workDate).toLocaleDateString(currentLocale(), {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="workforce-planning">
      <section className="workforce-planning-daybar">
        <div className="workforce-planning-date-nav">
          <button type="button" onClick={() => selectDate(moveDay(workDate, -1))} aria-label={t('workforcePlanning.previousDay')}><ChevronLeft size={18}/></button>
          <label>
            <span>{dateLabel}</span>
            <input type="date" value={workDate} onChange={event => selectDate(event.target.value)} />
          </label>
          <button type="button" onClick={() => selectDate(moveDay(workDate, 1))} aria-label={t('workforcePlanning.nextDay')}><ChevronRight size={18}/></button>
          <button type="button" className="workforce-planning-today" onClick={() => selectDate(ymd(new Date()))}>{t('workforcePlanning.today')}</button>
        </div>
        <div className={`workforce-planning-day-status ${summary.missing > 0 ? 'has-gap' : 'is-complete'}`}>
          {summary.missing > 0 ? <AlertTriangle size={18}/> : <CheckCircle2 size={18}/>} 
          <strong>{summary.missing > 0 ? t('workforcePlanning.missingPeople', { count: summary.missing }) : t('workforcePlanning.complete')}</strong>
        </div>
        {isAdmin && (
          <button type="button" className="workforce-planning-save" disabled={!dirty || saving} onClick={save}>
            <Save size={17}/> {saving ? t('common.saving') : dirty ? t('workforcePlanning.save') : t('workforcePlanning.saved')}
          </button>
        )}
      </section>

      <section className="workforce-planning-stats" aria-label={t('workforcePlanning.balance')}>
        <div><span>{t('workforcePlanning.fromSchedule')}</span><strong>{summary.available}</strong></div>
        <div><span>{t('workforcePlanning.required')}</span><strong>{summary.required}</strong></div>
        <div><span>{t('workforcePlanning.assigned')}</span><strong>{summary.assigned}</strong></div>
        <div className={summary.unassigned > 0 ? 'is-warning' : ''}><span>{t('workforcePlanning.unassigned')}</span><strong>{summary.unassigned}</strong></div>
        <div className={summary.missing > 0 ? 'is-danger' : 'is-success'}><span>{t('workforcePlanning.shortage')}</span><strong>{summary.missing}</strong></div>
      </section>

      <div className="workforce-planning-workspace">
        <aside className="workforce-planning-roster">
          <div className="workforce-planning-panel-title">
            <span><UsersRound size={18}/> {t('workforcePlanning.peopleFromSchedule')}</span>
            <b>{availablePeople.length}</b>
          </div>
          <p>{selectedPerson ? t('workforcePlanning.chooseStation', { name: selectedPerson.name }) : t('workforcePlanning.selectPersonHint')}</p>
          <div className="workforce-planning-roster-section">
            <h3>{t('workforcePlanning.unassignedWithCount', { count: unassignedPeople.length })}</h3>
            <div className="workforce-planning-people">
              {unassignedPeople.map(person => (
                <button
                  type="button"
                  draggable={isAdmin}
                  key={person.id}
                  className={`workforce-person ${selectedEmployeeId === String(person.id) ? 'is-selected' : ''}`}
                  onClick={() => isAdmin && setSelectedEmployeeId(current => current === String(person.id) ? null : String(person.id))}
                  onDragStart={event => event.dataTransfer.setData('text/plain', String(person.id))}
                >
                  <span className="workforce-person-avatar">{String(person.name || '?').trim().charAt(0)}</span>
                  <span><strong>{person.name}</strong><small>{shortTime(person.shift.start)}–{shortTime(person.shift.end)} · {person.group_name || t('workforcePlanning.noGroup')}</small></span>
                </button>
              ))}
              {!unassignedPeople.length && <div className="workforce-planning-none">{t('workforcePlanning.everyoneAssigned')}</div>}
            </div>
          </div>
          {!!absentPeople.length && (
            <details className="workforce-planning-absent">
              <summary>{t('workforcePlanning.absentWithCount', { count: absentPeople.length })}</summary>
              {absentPeople.map(person => <div key={person.id}><span>{person.name}</span><b>{person.scheduleValue || '—'}</b></div>)}
            </details>
          )}
        </aside>

        <section className="workforce-floor" aria-label={t('workforcePlanning.floorPlan')}>
          <div className="workforce-floor-hint">{selectedPerson ? t('workforcePlanning.clickStationNow') : t('workforcePlanning.floorHint')}</div>
          {WORKFORCE_STATIONS.map(station => {
            const assignedIds = Object.entries(plan.assignments).filter(([, stationId]) => stationId === station.id).map(([employeeId]) => employeeId);
            const required = Number(plan.requirements[station.id]) || 0;
            const missing = Math.max(0, required - assignedIds.length);
            const status = required === 0 ? 'is-inactive' : missing === 0 ? 'is-complete' : assignedIds.length ? 'is-partial' : 'is-empty';
            return (
              <article
                key={station.id}
                className={`workforce-station ${status} ${selectedPerson ? 'can-assign' : ''}`}
                style={{ '--station-color': station.color, gridArea: station.area }}
                role={selectedPerson ? 'button' : undefined}
                tabIndex={selectedPerson ? 0 : undefined}
                onClick={() => selectedPerson && assignPerson(selectedPerson.id, station.id)}
                onKeyDown={event => { if (selectedPerson && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); assignPerson(selectedPerson.id, station.id); } }}
                onDragOver={event => { if (isAdmin) event.preventDefault(); }}
                onDrop={event => { event.preventDefault(); assignPerson(event.dataTransfer.getData('text/plain'), station.id); }}
              >
                <header>
                  <div><span className="workforce-station-dot"/><h3>{t(`workforcePlanning.stations.${station.labelKey}`)}</h3></div>
                  <span className="workforce-station-count">{assignedIds.length}/{required}</span>
                </header>
                <div className="workforce-station-people">
                  {assignedIds.map(employeeId => {
                    const person = personById[employeeId];
                    if (!person) return null;
                    return (
                      <div
                        draggable={isAdmin}
                        key={employeeId}
                        className="workforce-station-person"
                        role={isAdmin ? 'button' : undefined}
                        tabIndex={isAdmin ? 0 : undefined}
                        onClick={event => { event.stopPropagation(); if (isAdmin) setSelectedEmployeeId(employeeId); }}
                        onKeyDown={event => { if (isAdmin && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setSelectedEmployeeId(employeeId); } }}
                        onDragStart={event => { event.stopPropagation(); event.dataTransfer.setData('text/plain', employeeId); }}
                      >
                        <UserRound size={13}/><span>{person.name}</span>
                        {isAdmin && <button type="button" aria-label={t('workforcePlanning.removeAssignment')} onClick={event => { event.stopPropagation(); removeAssignment(employeeId); }}><X size={12}/></button>}
                      </div>
                    );
                  })}
                  {missing > 0 && <div className="workforce-station-missing"><Plus size={13}/> {t('workforcePlanning.needMore', { count: missing })}</div>}
                </div>
                {isAdmin && (
                  <footer onClick={event => event.stopPropagation()}>
                    <span>{t('workforcePlanning.targetStaff')}</span>
                    <div>
                      <button type="button" onClick={() => changeRequirement(station.id, -1)} aria-label={t('workforcePlanning.decreaseRequirement')}><Minus size={14}/></button>
                      <b>{required}</b>
                      <button type="button" onClick={() => changeRequirement(station.id, 1)} aria-label={t('workforcePlanning.increaseRequirement')}><Plus size={14}/></button>
                    </div>
                  </footer>
                )}
              </article>
            );
          })}
        </section>
      </div>
    </div>
  );
}
