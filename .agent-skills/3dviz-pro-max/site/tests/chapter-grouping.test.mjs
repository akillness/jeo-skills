// The gallery's editorial structure comes from examples/README.md: its `## ` headings are the
// chapters, its `- [Title](id/) — blurb` lines are the cards. A study the README forgets, a heading
// nobody authored, or a chapter without a subtitle must stop the build rather than quietly drop or
// misfile a card.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  CHAPTERS,
  checkAgainstCatalog,
  parseReadmeCards,
  readExamples,
} from '../scripts/build-data-content.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const fromRepo = (...parts) => path.join(repo, ...parts);
const README = () => readFile(fromRepo('examples/README.md'), 'utf8');

/** Chapter sizes in the design's order: Crafted, Lighting, Anatomy, Mathematics, Physics. */
const CHAPTER_SIZES = [11, 5, 8, 6, 7];

test('the README groups the studies into the five chapters the page renders', async () => {
  const examples = await readExamples();
  const counts = CHAPTERS.map((chapter) => examples.filter((study) => study.chapter === chapter).length);
  assert.deepEqual(counts, CHAPTER_SIZES);
  assert.equal(
    counts.reduce((sum, count) => sum + count, 0),
    examples.length,
  );
  // Cards arrive grouped: chapter order never goes backwards through the list.
  const order = examples.map((study) => CHAPTERS.indexOf(study.chapter));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});

test('every catalog study appears exactly once in the README, with its title and blurb', async () => {
  const catalog = await import(`${fromRepo('examples/shared/catalog.js')}`);
  const catalogIds = [
    ...Object.keys(catalog.artScience ?? {}),
    ...Object.keys(catalog.breadth ?? {}),
  ].sort();
  const cards = parseReadmeCards(await README());
  assert.deepEqual(cards.map((card) => card.id).sort(), catalogIds);

  const examples = await readExamples();
  const byId = new Map(cards.map((card) => [card.id, card]));
  for (const study of examples) {
    const card = byId.get(study.id);
    assert.ok(card, study.id);
    assert.equal(study.title, card.title);
    assert.equal(study.blurb, card.blurb);
    assert.equal(study.chapter, card.chapter);
    assert.ok(study.blurb.length > 0, study.id);
  }
});

async function catalogIds() {
  const catalog = await import(`${fromRepo('examples/shared/catalog.js')}`);
  return new Set([...Object.keys(catalog.artScience ?? {}), ...Object.keys(catalog.breadth ?? {})]);
}

test('a README missing one of its study lines throws instead of dropping a card', async () => {
  const markdown = await README();
  const dropped = markdown
    .split('\n')
    .filter((line) => !line.startsWith('- [Coupled Gears](gears/)'))
    .join('\n');
  const cards = parseReadmeCards(dropped);
  const ids = await catalogIds();
  assert.equal(cards.length, parseReadmeCards(markdown).length - 1);
  assert.throws(() => checkAgainstCatalog(cards, ids), /no line for study "gears"/);
});

test('a README line the catalog does not know, or listed twice, throws', async () => {
  const ids = await catalogIds();
  const cards = parseReadmeCards(await README());
  assert.throws(
    () => checkAgainstCatalog([...cards, { chapter: 'Mathematics', id: 'ghost', title: 'X', blurb: 'y' }], ids),
    /the catalog does not know/,
  );
  const twice = cards.concat(cards[0]);
  assert.throws(() => checkAgainstCatalog(twice, ids), /twice/);
});

test('a heading outside the authored chapter order throws', async () => {
  const ids = await catalogIds();
  const markdown = (await README()).replace('## Mathematics', '## Mathematical curiosities');
  assert.throws(
    () => checkAgainstCatalog(parseReadmeCards(markdown), ids),
    /is not an authored chapter/,
  );
});

test('every chapter build-data emits carries an authored subtitle', async () => {
  const source = await readFile(fromRepo('site/src/lib/chapter-subtitles.ts'), 'utf8');
  for (const chapter of CHAPTERS) {
    const key = chapter.includes(' ') ? `'${chapter}':` : `${chapter}:`;
    assert.ok(source.includes(key), `no subtitle line for "${chapter}"`);
  }
});
