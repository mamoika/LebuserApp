import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const component = await readFile(new URL('./TrolleysDashboardModal.jsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../index.css', import.meta.url), 'utf8');
const polish = JSON.parse(await readFile(new URL('../i18n/locales/pl.json', import.meta.url), 'utf8'));

test('clicking a trolley opens an immediate history drawer instead of appending history below the fleet', () => {
  assert.match(component, /aria-haspopup="dialog"/);
  assert.match(component, /className="fleet-history-backdrop"/);
  assert.match(component, /className="fleet-history-panel"/);
  assert.match(component, /className="fleet-history-timeline"/);
  assert.match(styles, /\.fleet-history-panel\s*\{[\s\S]*?height:\s*100%/);
  assert.equal(polish.wash.fleet.currentStatus, 'Aktualny stan');
});

test('the history drawer supports keyboard dismissal and restores focus to its trolley card', () => {
  assert.match(component, /event\.key === 'Escape'/);
  assert.match(component, /historyCloseRef\.current\?\.focus\(\)/);
  assert.match(component, /historyTriggerRef\.current\?\.focus\(\)/);
  assert.match(component, /event\.key !== 'Tab'/);
  assert.match(component, /historyPanelRef\.current\?\.querySelectorAll/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test('admins can choose between loose laundry and a forced empty trolley with confirmation', () => {
  assert.match(component, /forceReleaseTrolley/);
  assert.match(component, /setPendingAction\('make_loose'\)/);
  assert.match(component, /setPendingAction\('force_empty'\)/);
  assert.match(component, /wash\.fleet\.actions\.\$\{pendingAction\}ConfirmTitle/);
  assert.match(component, /canForceReset && \(/);
  assert.match(component, /selectedActive \? \(/);
  assert.equal(polish.wash.fleet.actions.makeLoose, 'Zmień na bez wózka');
  assert.equal(polish.wash.fleet.actions.forceEmpty, 'Wymuś pusty wózek');
});

test('admins can manually assign a free trolley to an active client', () => {
  assert.match(component, /assignTrolleyToClient/);
  assert.match(component, /setPendingAction\('assign_client'\)/);
  assert.match(component, /activeClients\.map/);
  assert.match(component, /pendingAction === 'assign_client' && !selectedClientId/);
  assert.equal(polish.wash.fleet.actions.assignClient, 'Oznacz jako u klienta');
  assert.equal(polish.wash.fleet.actions.clientLabel, 'Klient');
});
