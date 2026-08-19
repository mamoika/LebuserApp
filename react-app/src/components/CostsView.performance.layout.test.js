import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('./CostsView.jsx', import.meta.url), 'utf8');
const performanceSource = source.slice(
  source.indexOf('function PerformanceGrid'),
  source.indexOf('/* ───────────── STYLES'),
);

test('performance view keeps KPI beside the table and insights below them', () => {
  const workspaceIndex = performanceSource.indexOf('<div className="performance-workspace">');
  const summaryIndex = performanceSource.indexOf('<PerformanceSummary');
  const tableIndex = performanceSource.indexOf('<table className="costs-table performance-data-table"');
  const insightsIndex = performanceSource.indexOf('<PerformanceInsights');

  assert.ok(workspaceIndex >= 0, 'missing table and KPI workspace');
  assert.ok(summaryIndex > workspaceIndex, 'KPI summary should belong to the workspace');
  assert.ok(tableIndex > summaryIndex, 'table should belong to the same workspace');
  assert.ok(insightsIndex > tableIndex, 'analytical insights should stay below the workspace');
  assert.doesNotMatch(performanceSource, /PerformanceSidebar/);
});

test('performance KPI and insights layouts have explicit responsive grids', () => {
  assert.match(source, /\.performance-workspace\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(244px,\s*272px\)/s);
  assert.match(source, /\.performance-workspace\s*\{[^}]*grid-template-areas:\s*"table summary"/s);
  assert.match(source, /\.performance-kpi-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  assert.match(source, /\.performance-insights-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.35fr\)\s+minmax\(320px,\s*0\.65fr\)/s);
  assert.match(source, /@media\s*\(max-width:\s*1380px\)[\s\S]*\.performance-workspace\s*\{[^}]*grid-template-areas:\s*"summary"\s*"table"/);
  assert.match(source, /@media\s*\(max-width:\s*760px\)[\s\S]*\.performance-kpi-grid\s*\{[^}]*repeat\(2,/);
});

test('plant throughput column has a compact wrapping header', () => {
  assert.match(performanceSource, /className="sticky-head performance-throughput-cell performance-throughput-head"/);
  assert.match(performanceSource, /<col className="performance-col-throughput"\s*\/>/);
  assert.match(source, /\.performance-col-throughput\s*\{\s*width:\s*7\.7%;\s*\}/s);
  assert.match(source, /th\.performance-throughput-head\s*\{[^}]*white-space:\s*normal/s);
});

test('all performance columns fit without horizontal scrolling', () => {
  const columns = performanceSource.match(/<col className="performance-col-/g) || [];

  assert.equal(columns.length, 14, 'performance table should define all 14 column widths');
  assert.match(performanceSource, /className="costs-table performance-data-table"/);
  assert.match(source, /\.performance-data-table\s*\{[^}]*table-layout:\s*fixed/s);
  assert.match(source, /\.performance-table-scroll\s*\{[^}]*overflow-x:\s*hidden/s);
  assert.match(source, /\.performance-data-table thead th\s*\{[^}]*white-space:\s*normal/s);
});
