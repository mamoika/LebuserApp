import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('./CostsView.jsx', import.meta.url), 'utf8');

test('cost entry table fills the available desktop workspace', () => {
  assert.match(source, /className=\{`costs-view costs-view--\$\{activeTab\}`\}/);
  assert.match(source, /className="costs-entry-card"/);
  assert.match(source, /className="costs-entry-scroll"/);
  assert.match(
    source,
    /@media \(min-width: 901px\)[\s\S]*?\.app-main-content:has\(> \.costs-view--entry\) \{[^}]*height: 100dvh;[^}]*padding: 12px;[^}]*overflow: hidden;/,
  );
  assert.match(
    source,
    /\.costs-view--entry \.costs-entry-card \{[^}]*flex: 1 1 auto;/,
  );
  assert.match(
    source,
    /\.costs-view--entry \.costs-entry-scroll \{[^}]*flex: 1 1 auto;[^}]*max-height: none;/,
  );
});
