import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, Plus, Save, UserRound, UsersRound, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getWorkScheduleMonth } from '../lib/readRpc';
import { toastError, toastSuccess } from '../lib/toast';
import { currentLocale } from '../lib/dateUtils';
import { normalizeWorkforcePlan, WORKFORCE_STATIONS } from '../lib/workforcePlanning';
import { getWorkforceFloorPlan, saveWorkforceFloorPlan } from '../lib/workforcePlanningRpc';
import DataError from './DataError';

function MachineShape({ station, label }) {
  if (station.id === 'small_washers') {
    return (
      <div className="workforce-visual-machine-group is-washers">
        <div><span/><span/></div>
        <b>{label}</b>
      </div>
    );
  }
  if (station.id === 'dryers') {
    return (
      <div className="workforce-visual-machine-group is-dryers">
        <div>{[0, 1, 2, 3, 4].map(unit => <span key={unit}/>)}</div>
        <b>{label}</b>
      </div>
    );
  }
  return <div className="workforce-visual-machine" style={{ background: station.color }}><b>{label}</b></div>;
}

export default function WorkforcePlanningView() {
  const { t } = useTranslation();
  const { isAdmin, canViewAdminData, sessionToken } = useAuth();
  const [people, setPeople] = useState([]);
  const [plan, setPlan] = useState(() => normalizeWorkforcePlan(null));
  const [updatedAt, setUpdatedAt] = useState(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!canViewAdminData || !sessionToken) return;
    const now = new Date();
    setLoading(true);
    setError(null);
    try {
      const [scheduleData, planData] = await Promise.all([
        getWorkScheduleMonth(sessionToken, now.getFullYear(), now.getMonth() + 1),
        getWorkforceFloorPlan(sessionToken),
      ]);
      const roster = (scheduleData?.roster || []).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), currentLocale()));
      setPeople(roster);
      setPlan(normalizeWorkforcePlan(planData?.plan, new Set(roster.map(person => String(person.id)))));
      setUpdatedAt(planData?.updated_at || null);
      setDirty(false);
      setSelectedEmployeeId(null);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [canViewAdminData, sessionToken]);

  useEffect(() => { load(); }, [load]);

  const personById = useMemo(() => Object.fromEntries(people.map(person => [String(person.id), person])), [people]);
  const unassignedPeople = useMemo(() => people.filter(person => !plan.assignments[String(person.id)]), [people, plan.assignments]);
  const selectedPerson = selectedEmployeeId ? personById[selectedEmployeeId] : null;

  const updatePlan = (recipe) => {
    if (!isAdmin) return;
    setPlan(previous => recipe(previous));
    setDirty(true);
  };

  const assign = (employeeId, stationId) => {
    const id = String(employeeId);
    if (!personById[id]) return;
    updatePlan(previous => ({ ...previous, assignments: { ...previous.assignments, [id]: stationId } }));
    setSelectedEmployeeId(null);
  };

  const removeAssignment = (employeeId) => {
    updatePlan(previous => {
      const assignments = { ...previous.assignments };
      delete assignments[String(employeeId)];
      return { ...previous, assignments };
    });
  };

  const changeNeed = (stationId, delta) => {
    updatePlan(previous => ({
      ...previous,
      requirements: {
        ...previous.requirements,
        [stationId]: Math.max(0, Math.min(30, (Number(previous.requirements[stationId]) || 0) + delta)),
      },
    }));
  };

  const save = async () => {
    if (!isAdmin || !dirty) return;
    setSaving(true);
    try {
      const result = await saveWorkforceFloorPlan(sessionToken, plan, updatedAt);
      setUpdatedAt(result?.updated_at || null);
      setDirty(false);
      toastSuccess(t('workforcePlanning.saved'));
    } catch (err) {
      toastError(t(/CONCURRENT_MODIFICATION/i.test(err?.message || '') ? 'workforcePlanning.concurrentError' : 'workforcePlanning.saveError'));
    } finally {
      setSaving(false);
    }
  };

  if (!canViewAdminData) return <div className="workforce-planning-empty">{t('admin.noAccess')}</div>;
  if (loading) return <div className="loader workforce-planning-loader">{t('workforcePlanning.loading')}</div>;
  if (error) return <DataError error={error} onRetry={load} />;

  return (
    <div className="workforce-visual">
      <header className="workforce-visual-toolbar">
        <div>
          <h3>{t('workforcePlanning.generalPlanTitle')}</h3>
          <p>{selectedPerson ? t('workforcePlanning.choosePlaceFor', { name: selectedPerson.name }) : t('workforcePlanning.generalPlanHint')}</p>
        </div>
        {isAdmin && (
          <button type="button" disabled={!dirty || saving} onClick={save}>
            <Save size={17}/>{saving ? t('common.saving') : dirty ? t('workforcePlanning.save') : t('workforcePlanning.saved')}
          </button>
        )}
      </header>

      <section className="workforce-visual-roster" aria-label={t('workforcePlanning.peopleFromSchedule')}>
        <div className="workforce-visual-roster-label"><UsersRound size={17}/><span>{t('workforcePlanning.peopleFromSchedule')}</span><b>{people.length}</b></div>
        <div className="workforce-visual-roster-list">
          {unassignedPeople.map(person => (
            <button
              type="button"
              key={person.id}
              draggable={isAdmin}
              className={selectedEmployeeId === String(person.id) ? 'is-selected' : ''}
              onClick={() => isAdmin && setSelectedEmployeeId(current => current === String(person.id) ? null : String(person.id))}
              onDragStart={event => event.dataTransfer.setData('text/plain', String(person.id))}
            >
              <span>{String(person.name || '?').trim().charAt(0)}</span>
              <strong>{person.name}</strong>
            </button>
          ))}
          {!unassignedPeople.length && <em>{t('workforcePlanning.everyoneOnFloor')}</em>}
        </div>
      </section>

      <div className="workforce-visual-scroll">
        <section className="workforce-visual-floor" aria-label={t('workforcePlanning.floorPlan')}>
          {WORKFORCE_STATIONS.map(station => {
            const assignedIds = Object.entries(plan.assignments).filter(([, value]) => value === station.id).map(([employeeId]) => employeeId);
            const required = Number(plan.requirements[station.id]) || 0;
            const missing = Math.max(0, required - assignedIds.length);
            return (
              <article
                key={station.id}
                className={`workforce-visual-station ${selectedPerson ? 'can-place' : ''}`}
                style={{ left: `${station.x}%`, top: `${station.y}%`, width: `${station.w}%`, height: `${station.h}%`, '--machine-color': station.color }}
                role={selectedPerson ? 'button' : undefined}
                tabIndex={selectedPerson ? 0 : undefined}
                onClick={() => selectedPerson && assign(selectedPerson.id, station.id)}
                onKeyDown={event => { if (selectedPerson && (event.key === 'Enter' || event.key === ' ')) assign(selectedPerson.id, station.id); }}
                onDragOver={event => { if (isAdmin) event.preventDefault(); }}
                onDrop={event => { event.preventDefault(); assign(event.dataTransfer.getData('text/plain'), station.id); }}
              >
                <MachineShape station={station} label={t(`workforcePlanning.stations.${station.labelKey}`)} />
                <div className="workforce-visual-people">
                  {assignedIds.map(employeeId => {
                    const person = personById[employeeId];
                    if (!person) return null;
                    return (
                      <div key={employeeId} className="workforce-visual-person" title={person.name} draggable={isAdmin} onDragStart={event => event.dataTransfer.setData('text/plain', employeeId)}>
                        <button type="button" onClick={event => { event.stopPropagation(); if (isAdmin) setSelectedEmployeeId(employeeId); }}><UserRound size={14}/><span>{String(person.name || '?').trim().charAt(0)}</span></button>
                        <small>{person.name}</small>
                        {isAdmin && <button type="button" className="remove" aria-label={t('workforcePlanning.removeAssignment')} onClick={event => { event.stopPropagation(); removeAssignment(employeeId); }}><X size={11}/></button>}
                      </div>
                    );
                  })}
                  {Array.from({ length: missing }, (_, index) => (
                    <button key={`missing-${index}`} type="button" className="workforce-visual-vacancy" title={t('workforcePlanning.extraPerson')} onClick={event => { event.stopPropagation(); changeNeed(station.id, -1); }}><Plus size={16}/></button>
                  ))}
                </div>
                {isAdmin && (
                  <button type="button" className="workforce-visual-add" title={t('workforcePlanning.addExtraPerson')} onClick={event => { event.stopPropagation(); changeNeed(station.id, 1); }}><Plus size={14}/></button>
                )}
                {isAdmin && required > assignedIds.length && (
                  <button type="button" className="workforce-visual-less" title={t('workforcePlanning.removeExtraPerson')} onClick={event => { event.stopPropagation(); changeNeed(station.id, -1); }}><Minus size={12}/></button>
                )}
              </article>
            );
          })}
        </section>
      </div>
    </div>
  );
}
