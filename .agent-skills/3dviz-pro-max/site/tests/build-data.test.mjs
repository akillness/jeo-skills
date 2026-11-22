// The generated data is the page's only source of numbers, so these tests recompute every
// counter from the repository's files by their own route and compare with src/generated/*.json.
// The only literal allowed here is structural: the 38 runnable study directories.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { countStudyDirectories, readCatalogSummary, readEvalScale } from '../scripts/build-data-sources.mjs';
import { CHAPTERS, readExamples, readInstall, readPalette } from '../scripts/build-data-content.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const fromRepo = (...parts) => path.join(repo, ...parts);
const readJson = async (rel) => JSON.parse(await readFile(fromRepo(rel), 'utf8'));
const generated = (name) => readJson(path.join('site/src/generated', name));

const STUDY_COUNT = 37;

/** Study ids with both clip encodings under site/public/media/clips, listed from the disk. */
async function recordedClipIds() {
  let names = [];
  try {
    names = await readdir(fromRepo('site/public/media/clips'));
  } catch {
    return [];
  }
  const stem = (extension) =>
    names.filter((name) => name.endsWith(extension)).map((name) => name.slice(0, -extension.length));
  const webm = new Set(stem('.webm'));
  return stem('.mp4').filter((id) => webm.has(id)).sort();
}

/** Every events.jsonl under evidence/, counted here rather than through the generator's walker. */
async function evidenceEvents(dir = fromRepo('evidence')) {
  let events = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) events += await evidenceEvents(full);
    else if (entry.name === 'events.jsonl') {
      events += (await readFile(full, 'utf8')).split('\n').filter((line) => line.trim() !== '').length;
    }
  }
  return events;
}

test('every stats counter equals the number recomputed from its source file', async () => {
  const stats = await generated('stats.json');
  const summary = await readJson('skills/3dviz-pro-max/data/catalog-summary.json');
  const sources = await readJson('skills/3dviz-pro-max/data/sources.json');
  const showcase = await readJson('docs/demos/showcase/showcase.json');

  assert.equal(stats.recipes, summary.recipes);
  assert.equal(stats.knowledge, summary.knowledge);
  assert.equal(stats.blueprints, summary.knowledge_by_kind.blueprint);
  assert.equal(stats.directions, summary.planned_directions);
  assert.equal(stats.sources, sources.length);
  assert.equal(stats.evidence_events, await evidenceEvents());
  assert.equal(stats.showcase_frames, showcase.shots.length);
  assert.equal(stats.studies, await countStudyDirectories());
  assert.equal(stats.studies, STUDY_COUNT);
});

test('the eval scale is the published checklist item count, read from the scorecard headers', async () => {
  const stats = await generated('stats.json');
  const readme = await readFile(
    fromRepo('evals/skill-behavior/before-after-2026-09/README.md'),
    'utf8',
  );
  // Independent of readEvalScale's regexes: take the two "(N)" counts that follow the checklist
  // links in the scorecard header line, and the declared total.
  const counts = [...readme.matchAll(/\((\d+)\)/g)].map((match) => Number(match[1]));
  const total = Number(readme.match(/out of \*\*(\d+)\*\*/)[1]);
  const scale = await readEvalScale();
  assert.equal(stats.eval_scale.total, total);
  assert.equal(stats.eval_scale.anti_slop + stats.eval_scale.inspection, total);
  assert.ok(counts.includes(scale.anti_slop) && counts.includes(scale.inspection));
});

test('examples.json ships one card per study, with unique ids, a real thumb and a clip iff recorded', async () => {
  const examples = await generated('examples.json');
  assert.equal(examples.length, STUDY_COUNT);
  assert.equal(new Set(examples.map((study) => study.id)).size, STUDY_COUNT);
  const recorded = await recordedClipIds();
  for (const study of examples) {
    await stat(fromRepo('site/public', study.thumb)); // throws when the still is missing
    assert.equal(study.href, `/examples/${study.id}/`);
    assert.ok(study.title.length > 0 && study.blurb.length > 0, study.id);
    // A card claims a clip exactly when both encodings are on disk — never from a list.
    assert.equal(study.clip, recorded.includes(study.id) ? `media/clips/${study.id}` : null, study.id);
    if (study.clip !== null) {
      for (const extension of ['webm', 'mp4']) await stat(fromRepo('site/public', `${study.clip}.${extension}`));
    }
  }
  assert.deepEqual(examples.filter((study) => study.clip).map((study) => study.id).sort(), recorded);
});

test('every study lands in a known chapter and carries no undefined field', async () => {
  const examples = await readExamples();
  assert.equal(examples.length, await countStudyDirectories());
  for (const study of examples) {
    assert.ok(CHAPTERS.includes(study.chapter), `${study.id}: ${study.chapter}`);
    for (const [key, value] of Object.entries(study)) {
      assert.notEqual(value, undefined, `${study.id}.${key}`);
    }
  }
  assert.deepEqual(
    [...new Set(examples.map((study) => study.chapter))],
    CHAPTERS.filter((chapter) => examples.some((study) => study.chapter === chapter)),
  );
});

test('the eval scale adds up to its published total', async () => {
  const scale = await readEvalScale();
  assert.equal(scale.anti_slop + scale.inspection, scale.total);
});

test('the palette maps at least eight named tokens to six-digit hexes', async () => {
  const palette = await readPalette();
  const entries = Object.entries(palette.colors);
  assert.ok(entries.length >= 8, `only ${entries.length} tokens`);
  for (const [name, hex] of entries) assert.match(hex, /^#[0-9a-f]{6}$/, name);
});

test('both install tabs are parsed and at least one ships a command', async () => {
  const install = await readInstall();
  assert.deepEqual(
    install.map((tab) => tab.id),
    ['claude-code', 'codex'],
  );
  assert.ok(install.some((tab) => tab.commands.length > 0));
  // The panel renders `blocks` in document order; every block must carry text.
  for (const tab of install) for (const block of tab.blocks) assert.ok(block.text.trim().length > 0, tab.id);
});

test('catalog counters are positive integers', async () => {
  const summary = await readCatalogSummary();
  for (const [key, value] of Object.entries(summary)) {
    assert.ok(Number.isInteger(value) && value > 0, `${key} = ${value}`);
  }
});
