import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const washView = await readFile(new URL('./WashView.jsx', import.meta.url), 'utf8');
const polish = JSON.parse(await readFile(new URL('../i18n/locales/pl.json', import.meta.url), 'utf8'));

test('occupied dirty trolley cards explain their date context and next planning dates', () => {
  assert.match(washView, /laundry_origin_date: arrivalDateOf\(entry\)/);
  assert.match(washView, /dirty_received_at: entry\?\.dirty_received_at/);
  assert.match(washView, /wash_date: entry \? slotToDate\(washSlotOf/);
  assert.match(washView, /departure_date: entry \? departureDateOf/);
  assert.equal(polish.wash.trolleyBoard.liveContext, 'Stan na teraz — niezależny od daty wybranej w planie pralni powyżej.');
});

test('an overdue dirty trolley is highlighted and opens its own history', () => {
  assert.match(washView, /className="laundry-trolley-overdue"/);
  assert.match(washView, /setHistoryTrolley\(String\(reservation\.trolley_no\)\)/);
  assert.match(washView, /initialTrolley=\{historyTrolley\}/);
});
