import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('./DeliverPromptSheet.jsx', import.meta.url), 'utf8');

test('clean delivery leaves every delivered trolley at the client', () => {
  assert.match(source, /prompt\.trolleys\.map\(t => \(\{ cycle_id: t\.cycleId, action: 'leave' \}\)\)/);
  assert.doesNotMatch(source, /toggleChoice/);
  assert.doesNotMatch(source, /course\.sheets\.delivery\.takeBack/);
});

test('delivery explains that dirty-return trolleys are selected separately', () => {
  assert.match(source, /course\.sheets\.delivery\.allDeliveredTitle/);
  assert.match(source, /course\.sheets\.delivery\.pickupHint/);
  assert.match(source, /delivery-trolley-summary/);
});

test('extra empty trolleys open in a dedicated tile picker', () => {
  assert.match(source, /course\.sheets\.delivery\.addTrolley/);
  assert.match(source, /trolleyPickerOpen &&/);
  assert.match(source, /className="delivery-picker-sheet" titleId="empty-trolley-picker-title"/);
  assert.match(source, /className="delivery-picker-scroll"/);
  assert.match(source, /className=\{`delivery-empty-trolley-tile \$\{selected \? 'is-selected' : ''\}`\}/);
  assert.match(source, /aria-pressed=\{selected\}/);
  assert.match(source, /toggleEmptyTrolley\(number\)/);
  assert.doesNotMatch(source, /<select/);
});
