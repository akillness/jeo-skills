// catalog.json is what the Catalog panel lists, so its rows must be the store itself: this recounts
// the directions, the knowledge kinds and the blueprint tiers straight off the record files — one
// recursive walk, not the per-directory route build-data-catalog.mjs takes — and checks the row
// shape the list depends on. The knowledge kinds' one-line descriptions are page copy, so the last
// case holds src/lib/knowledge-kind-summaries.ts to exactly the kinds the build emits.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { clampSummary } from '../scripts/build-data-catalog.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const DATA = path.join(repo, 'skills/3dviz-pro-max/data');
const SUMMARY_MAX = 100;

const catalog = JSON.parse(await readFile(new URL('../src/generated/catalog.json', import.meta.url), 'utf8'));
const summary = JSON.parse(await readFile(path.join(DATA, 'catalog-summary.json'), 'utf8'));

/** Every record file under a directory, found by one recursive walk. */
async function recordFiles(dir) {
  const entries = await readdir(path.join(DATA, dir), { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

const readRecord = async (file) => JSON.parse(await readFile(file, 'utf8'));

test('each direction row counts the recipe files that name it, by any membership', async () => {
  const counted = new Map();
  let files = 0;
  for (const file of await recordFiles('recipes')) {
    files += 1;
    for (const id of (await readRecord(file)).direction_ids) counted.set(id, (counted.get(id) ?? 0) + 1);
  }
  assert.equal(files, summary.recipes);
  assert.equal(catalog.directions.length, summary.planned_directions);
  const directions = JSON.parse(await readFile(path.join(DATA, 'directions.json'), 'utf8'));
  assert.deepEqual(
    catalog.directions.map((row) => row.id).sort(),
    directions.map((direction) => direction.id).sort(),
  );
  for (const row of catalog.directions) assert.equal(row.count, counted.get(row.id), row.id);
  // Sorted by size, biggest first: the page shows the widest directions before the narrow ones.
  const counts = catalog.directions.map((row) => row.count);
  assert.deepEqual(counts, [...counts].sort((a, b) => b - a));
});

test('each kind row counts its own directory, and the rows add up to the store', async () => {
  const counted = new Map();
  for (const file of await recordFiles('knowledge')) {
    const kind = path.basename(path.dirname(file));
    counted.set(kind, (counted.get(kind) ?? 0) + 1);
  }
  assert.deepEqual(
    catalog.kinds.map((row) => [row.id, row.count]).sort(),
    [...counted].sort(),
  );
  assert.equal(
    catalog.kinds.reduce((sum, row) => sum + row.count, 0),
    summary.knowledge,
  );
  for (const [kind, count] of counted) assert.equal(count, summary.knowledge_by_kind[kind], kind);
});

test('a kit row names the record and the highest tier it actually proved', async () => {
  const byId = new Map(catalog.blueprints.map((row) => [row.id, row]));
  const files = (await recordFiles('knowledge')).filter((file) => path.basename(path.dirname(file)) === 'blueprint');
  assert.equal(catalog.blueprints.length, files.length);
  assert.equal(catalog.blueprints.length, summary.knowledge_by_kind.blueprint);
  for (const file of files) {
    const record = await readRecord(file);
    const row = byId.get(record.id.replace(/^knowledge\./, ''));
    assert.ok(row, record.id);
    const proved = Object.entries(record.tiers ?? {})
      .filter(([, tier]) => tier.status === 'proved')
      .map(([name]) => name)
      .sort();
    assert.equal(row.tier, proved.at(-1) ?? '—', record.id);
    assert.ok(record.summary.startsWith(row.summary.replace(/…$/, '').slice(0, 40)), record.id);
  }
});

test('every row carries an id and a summary short enough for one line', () => {
  for (const row of [...catalog.directions, ...catalog.blueprints]) {
    assert.match(row.id, /^[a-z0-9-]+$/);
    assert.ok(row.summary.length > 0 && row.summary.length <= SUMMARY_MAX, `${row.id}: ${row.summary.length}`);
    assert.ok(!/\s{2,}|\n/.test(row.summary), row.id);
  }
  for (const row of catalog.kinds) assert.match(row.id, /^[a-z0-9-]+$/);
});

test('every knowledge kind the build emits carries an authored one-liner', async () => {
  const source = await readFile(new URL('../src/lib/knowledge-kind-summaries.ts', import.meta.url), 'utf8');
  const keys = [...source.matchAll(/^ {2}'?([a-z-]+)'?:$/gm)].map((match) => match[1]);
  assert.deepEqual(
    keys.sort(),
    catalog.kinds.map((row) => row.id).sort(),
  );
});

test('a long summary is cut at a word boundary, a short one is left alone', () => {
  const short = 'A coopered oak barrel.';
  assert.equal(clampSummary(`  ${short}\n`), short);

  const long = `${'word '.repeat(40)}end`;
  const cut = clampSummary(long);
  assert.ok(cut.length <= SUMMARY_MAX);
  assert.ok(cut.endsWith('…') && !cut.endsWith(' …'));
  assert.ok(long.startsWith(cut.slice(0, -1)), cut);
});
