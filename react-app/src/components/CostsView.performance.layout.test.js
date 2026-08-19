import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('./CostsView.jsx', import.meta.url), 'utf8');
const performanceSource = source.slice(
  source.indexOf('function PerformanceGrid'),
  source.indexOf('/* ───────────── STYLES'),
);

test('performance view uses a full-width table between summary and insights', () => {
  const summaryIndex = performanceSource.indexOf('<PerformanceSummary');
  const tableIndex = performanceSource.indexOf('<table className="costs-table"');
  const insightsIndex = performanceSource.indexOf('<PerformanceInsights');

  assert.ok(summaryIndex >= 0, 'missing top performance summary');
  assert.ok(tableIndex > summaryIndex, 'table should follow the KPI summary');
  assert.ok(insightsIndex > tableIndex, 'analytical insights should follow the table');
  assert.doesNotMatch(performanceSource, /PerformanceSidebar/);
});

test('performance KPI and insights layouts have explicit responsive grids', () => {
  assert.match(source, /\.performance-kpi-grid\s*\{[^}]*grid-template-columns:\s*repeat\(6,/s);
  assert.match(source, /\.performance-insights-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.35fr\)\s+minmax\(320px,\s*0\.65fr\)/s);
  assert.match(source, /@media\s*\(max-width:\s*760px\)[\s\S]*\.performance-kpi-grid\s*\{[^}]*repeat\(2,/);
});
