export const WORKFORCE_STATIONS = [
  { id: 'small_washers', labelKey: 'smallWashers', color: '#F04444', x: 8, y: 4, w: 17, h: 13, defaultRequired: 1 },
  { id: 'dryers', labelKey: 'dryers', color: '#F04444', x: 28, y: 27, w: 37, h: 13, defaultRequired: 1 },
  { id: 'folder', labelKey: 'folder', color: '#2727A8', x: 6, y: 47, w: 18, h: 15, defaultRequired: 1 },
  { id: 'tunnel', labelKey: 'tunnel', color: '#E31EDB', x: 25, y: 82, w: 31, h: 12, defaultRequired: 2 },
  { id: 'shaking', labelKey: 'shaking', color: '#26934F', x: 62, y: 45, w: 5, h: 37, defaultRequired: 3 },
  { id: 'large_mangle', labelKey: 'largeMangle', color: '#0D84DB', x: 70, y: 33, w: 17, h: 50, defaultRequired: 3 },
  { id: 'small_mangle', labelKey: 'smallMangle', color: '#55A7E8', x: 90, y: 38, w: 8, h: 34, defaultRequired: 2 },
  { id: 'packing', labelKey: 'packing', color: '#F04444', x: 80, y: 8, w: 7, h: 13, defaultRequired: 1 },
];

const NON_WORK_VALUES = new Set(['W', 'UW', 'L4', 'NU', 'NN', 'END']);

export function buildPlanningRoster(roster, scheduleEntries, dateStr) {
  const [year, month, day] = String(dateStr).split('-').map(Number);
  const entries = new Map(
    (scheduleEntries || [])
      .filter(entry => Number(entry.day) === day)
      .map(entry => [String(entry.employee_id), entry.value]),
  );

  return (roster || []).map(employee => {
    const explicit = entries.get(String(employee.id));
    const calendarDate = new Date(year, month - 1, day);
    const weekday = calendarDate.getDay();
    const scheduleValue = explicit == null ? (weekday === 0 || weekday === 6 || isHoliday(calendarDate) ? 'W' : 'I') : explicit;
    const normalized = String(scheduleValue || '').trim().toUpperCase();
    const available = !NON_WORK_VALUES.has(normalized);
    const shift = {
      start: employee.default_start || '07:00',
      end: employee.default_end || '15:00',
    };
    return { ...employee, scheduleValue, available, shift };
  });
}

export function defaultWorkforceRequirements() {
  return Object.fromEntries(WORKFORCE_STATIONS.map(station => [station.id, station.defaultRequired]));
}

export function normalizeWorkforcePlan(plan, availableEmployeeIds = null) {
  const stationIds = new Set(WORKFORCE_STATIONS.map(station => station.id));
  const allowedEmployees = availableEmployeeIds ? new Set([...availableEmployeeIds].map(String)) : null;
  const assignments = {};
  Object.entries(plan?.assignments || {}).forEach(([employeeId, stationId]) => {
    if (stationIds.has(stationId) && (!allowedEmployees || allowedEmployees.has(String(employeeId)))) {
      assignments[String(employeeId)] = stationId;
    }
  });

  const requirements = defaultWorkforceRequirements();
  Object.entries(plan?.requirements || {}).forEach(([stationId, count]) => {
    const value = Number(count);
    if (stationIds.has(stationId) && Number.isInteger(value) && value >= 0 && value <= 99) {
      requirements[stationId] = value;
    }
  });

  return { assignments, requirements };
}

export function summarizeWorkforcePlan(plan, availableCount) {
  const requirements = plan?.requirements || defaultWorkforceRequirements();
  const required = Object.values(requirements).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const assigned = Object.keys(plan?.assignments || {}).length;
  return {
    available: availableCount,
    assigned,
    unassigned: Math.max(0, availableCount - assigned),
    required,
    missing: Math.max(0, required - assigned),
  };
}
import { isHoliday } from '../utils/holidays.js';
