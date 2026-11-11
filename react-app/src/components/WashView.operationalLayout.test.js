import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const washView = await readFile(new URL('./WashView.jsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../index.css', import.meta.url), 'utf8');
const pl = JSON.parse(await readFile(new URL('../i18n/locales/pl.json', import.meta.url), 'utf8'));
const de = JSON.parse(await readFile(new URL('../i18n/locales/de.json', import.meta.url), 'utf8'));

test('laundry overview presents the day as one operational flow', () => {
  assert.match(washView, /className="laundry-operations-overview"/);
  assert.match(washView, /wash\.flowOverview\.planned/);
  assert.match(washView, /wash\.flowOverview\.washed/);
  assert.match(washView, /wash\.flowOverview\.packed/);
  assert.match(washView, /wash\.flowOverview\.departure/);
  assert.match(washView, /className="laundry-fleet-summary"/);
  assert.match(styles, /\.laundry-flow-metrics\s*{[^}]*grid-template-columns:\s*repeat\(4,/s);
});

test('new operational copy is complete in Polish and German', () => {
  for (const locale of [pl, de]) {
    assert.ok(locale.wash.flowOverview.title);
    assert.ok(locale.wash.flowOverview.packed);
    assert.ok(locale.wash.flowOverview.fleetOccupied);
    assert.ok(locale.wash.date.previous);
    assert.ok(locale.wash.date.next);
    assert.ok(locale.wash.date.choose);
    assert.ok(locale.wash.actions.washed);
    assert.ok(locale.wash.trolleysAssigned_one);
  }

  assert.equal(pl.wash.actions.washed, 'Oznacz jako wyprane');
  assert.equal(de.wash.actions.washed, 'Als gewaschen markieren');
  assert.doesNotMatch(washView, /title="(?:Poprzedni dzień|Następny dzień|Wybierz datę)"/);
});

test('work rows count physical trolleys from arrivals and packing without counting loose issues', () => {
  assert.match(washView, /arrivalReservations\s*\.filter\(reservation => entryIdSet\.has\(reservation\.entry_id\) && isRealTrolley\(reservation\)\)/);
  assert.match(washView, /activeCycles\s*\.filter\(isRealTrolley\)/);
  assert.match(washView, /trolleyCount: trolleyNos\.length/);
  assert.match(washView, /wash\.trolleysAssigned/);
  assert.match(washView, /group\.trolleyCount > 0/);
});
