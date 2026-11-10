import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

for (const [locale, expected] of [['pl', 'Pliki DDD'], ['de', 'DDD-Dateien']]) {
  test(`Grafik exposes the DDD button label in ${locale}`, () => {
    const messages = JSON.parse(readFileSync(new URL(`./locales/${locale}.json`, import.meta.url), 'utf8'));
    assert.equal(messages.grafik?.driverCard?.dddFiles, expected);
  });
}
