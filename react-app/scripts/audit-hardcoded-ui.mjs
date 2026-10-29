import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';

const traverse = traverseModule.default;
const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));
const polishLocale = JSON.parse(await readFile(new URL('../src/i18n/locales/pl.json', import.meta.url), 'utf8'));
const humanText = /\p{L}/u;
const uiCalls = new Set([
  'alert',
  'confirm',
  'prompt',
  'setError',
  'toastError',
  'toastSuccess',
]);
const uiAttributes = new Set(['alt', 'aria-label', 'placeholder', 'title']);

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'i18n' || entry.name === 'mockups') continue;
      files.push(...await collectFiles(path));
    } else if (['.js', '.jsx'].includes(extname(entry.name)) && !entry.name.endsWith('.test.js')) {
      files.push(path);
    }
  }
  return files;
}

function isHardcodedUiText(text) {
  return humanText.test(text);
}

function callName(node) {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier') {
    return node.property.name;
  }
  return null;
}

function flattenStrings(value, prefix = '', result = new Map()) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenStrings(item, `${prefix}[${index}]`, result));
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => flattenStrings(item, prefix ? `${prefix}.${key}` : key, result));
  } else if (typeof value === 'string') {
    const keys = result.get(value) || [];
    keys.push(prefix);
    result.set(value, keys);
  }
  return result;
}

const localeKeysByValue = flattenStrings(polishLocale);

const findings = [];
for (const file of await collectFiles(sourceRoot)) {
  const source = await readFile(file, 'utf8');
  const ast = parse(source, {
    sourceType: 'module',
    plugins: ['jsx'],
  });
  const add = (node, kind, text) => {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized || !isHardcodedUiText(normalized)) return;
    findings.push({
      file: relative(join(sourceRoot, '..'), file),
      line: node.loc.start.line,
      kind,
      text: normalized,
    });
  };

  traverse(ast, {
    JSXText(path) {
      add(path.node, 'jsx', path.node.value);
    },
    StringLiteral(path) {
      const parent = path.parent;
      const inJsxExpression = parent.type === 'JSXExpressionContainer';
      const inUiAttribute = parent.type === 'JSXAttribute'
        && parent.name.type === 'JSXIdentifier'
        && uiAttributes.has(parent.name.name);
      const inUiCall = parent.type === 'CallExpression' && uiCalls.has(callName(parent.callee));
      if (inJsxExpression || inUiAttribute || inUiCall) add(path.node, 'string', path.node.value);
    },
    TemplateLiteral(path) {
      const parent = path.parent;
      const inJsx = parent.type === 'JSXExpressionContainer';
      const inUiCall = parent.type === 'CallExpression' && uiCalls.has(callName(parent.callee));
      if (inJsx || inUiCall) add(path.node, 'template', path.node.quasis.map((part) => part.value.cooked).join('{{…}}'));
    },
  });
}

findings
  .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
  .forEach(({ file, line, kind, text }) => {
    const keys = localeKeysByValue.get(text)?.join(', ') || '—';
    console.log(`${file}:${line}\t${kind}\t${text}\t${keys}`);
  });

if (findings.length > 0) process.exitCode = 1;
