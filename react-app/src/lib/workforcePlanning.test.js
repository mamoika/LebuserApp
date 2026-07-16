import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPlanningRoster,
  defaultWorkforceRequirements,
  normalizeWorkforcePlan,
  summarizeWorkforcePlan,
} from './workforcePlanning.js';

test('planning roster includes planned and working people but excludes absences', () => {
  const roster = [
    { id: 'a', name: 'Anna', default_start: '06:00', default_end: '14:00' },
    { id: 'b', name: 'Beata', default_start: '07:00', default_end: '15:00' },
    { id: 'c', name: 'Celina', default_start: '07:00', default_end: '15:00' },
  ];
  const schedule = [
    { employee_id: 'a', day: 16, value: 'I' },
    { employee_id: 'b', day: 16, value: '8' },
    { employee_id: 'c', day: 16, value: 'L4' },
  ];

  const result = buildPlanningRoster(roster, schedule, '2026-07-16');
  assert.deepEqual(result.filter(person => person.available).map(person => person.id), ['a', 'b']);
  assert.equal(result.find(person => person.id === 'c').available, false);
});

test('plan drops assignments for absent people and calculates staffing gaps', () => {
  const requirements = { ...defaultWorkforceRequirements(), packing: 2 };
  const plan = normalizeWorkforcePlan({
    assignments: { a: 'packing', absent: 'tunnel', b: 'unknown' },
    requirements,
  }, new Set(['a', 'b']));
  const summary = summarizeWorkforcePlan(plan, 2);

  assert.deepEqual(plan.assignments, { a: 'packing' });
  assert.equal(summary.assigned, 1);
  assert.equal(summary.unassigned, 1);
  assert.equal(summary.missing, summary.required - 1);
});
