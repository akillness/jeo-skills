// compatibility.json is the install card's only source of surface names and statements. This test
// walks back to docs/compatibility.md by its own route, so a reworded table cannot silently change
// what the page claims.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCompatibility } from '../scripts/build-data-design.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const fromRepo = (...parts) => path.join(repo, ...parts);
const generated = async (name) =>
  JSON.parse(await readFile(fromRepo('site/src/generated', name), 'utf8'));

const MIN_COMPAT_ROWS = 8;
/** The two surfaces install-panel.tsx states as WORKS WITH rows. */
const PANEL_SURFACES = ['Codex', 'Claude Code'];

test('compatibility.json is the first table of docs/compatibility.md, row for row', async () => {
  const rows = await generated('compatibility.json');
  const doc = await readFile(fromRepo('docs/compatibility.md'), 'utf8');
  const table = doc
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
  const [header, divider, ...body] = table;
  assert.deepEqual(header, ['Surface', 'Current statement']);
  assert.match(divider[0], /^-+$/);
  assert.equal(rows.length, body.length);
  assert.ok(rows.length >= MIN_COMPAT_ROWS, `only ${rows.length} rows`);
  for (const [index, row] of rows.entries()) {
    assert.equal(body[index][0].replace(/[`*]/g, ''), row.surface);
    assert.ok(row.statement.length > 0, row.surface);
  }
  assert.deepEqual(await readCompatibility(), rows);
});

test('the install panel finds both surfaces it names, and neither is called supported', async () => {
  const rows = await generated('compatibility.json');
  for (const surface of PANEL_SURFACES) {
    const row = rows.find((entry) => entry.surface === surface);
    assert.ok(row, `no compatibility row for ${surface}`);
    assert.doesNotMatch(row.statement, /\bsupported\b/i, surface);
  }
});
