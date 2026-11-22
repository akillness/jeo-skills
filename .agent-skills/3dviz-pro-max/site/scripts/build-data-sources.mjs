// Readers for build-data.mjs. Every number the landing page shows is counted here from the
// repository's own files; nothing is typed as a literal.
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
export const fromRepo = (...parts) => path.join(repoRoot, ...parts);

async function readText(rel) {
  try {
    return await readFile(fromRepo(rel), 'utf8');
  } catch (cause) {
    throw new Error(`build-data: cannot read source file ${rel}`, { cause });
  }
}

async function readJson(rel) {
  return JSON.parse(await readText(rel));
}

const SUMMARY = 'skills/3dviz-pro-max/data/catalog-summary.json';
const SOURCES = 'skills/3dviz-pro-max/data/sources.json';
// The knowledge store is one file per record under per-kind directories (catalog layout v2);
// the hero's dusk sky reads one style-profile record for its palette.
const LOOKS_DIR = 'skills/3dviz-pro-max/data/knowledge/style-profile';
const LOOKS = `${LOOKS_DIR}/<style profiles>`;

/** One style-profile record, read from its own file and checked against the id it claims. */
async function readStyleRecord(id) {
  const record = await readJson(`${LOOKS_DIR}/${id.replace(/^knowledge\./, '')}.json`);
  if (record?.id !== id) throw new Error(`build-data: ${LOOKS_DIR} record ${id} is missing or renamed`);
  return record;
}
const EVAL_README = 'evals/skill-behavior/before-after-2026-09/README.md';
const SHOWCASE = 'docs/demos/showcase/showcase.json';
const SHOWCASE_LOG = 'docs/demos/showcase/showcase-log.json';
const INSTALL_DOC = 'docs/installation.md';
const COMPAT_DOC = 'docs/compatibility.md';

/** recipes / knowledge / blueprints / directions, straight from the catalog summary. */
export async function readCatalogSummary() {
  const summary = await readJson(SUMMARY);
  const blueprints = summary.knowledge_by_kind?.blueprint;
  for (const [key, value] of Object.entries({
    recipes: summary.recipes,
    knowledge: summary.knowledge,
    blueprints,
    directions: summary.planned_directions,
  })) {
    if (!Number.isInteger(value)) throw new Error(`build-data: ${SUMMARY} has no integer ${key}`);
  }
  return {
    recipes: summary.recipes,
    knowledge: summary.knowledge,
    blueprints,
    directions: summary.planned_directions,
  };
}

/** sources.json is a flat array of source records. */
export async function readSourceCount() {
  const sources = await readJson(SOURCES);
  if (!Array.isArray(sources)) throw new Error(`build-data: ${SOURCES} is not an array`);
  return sources.length;
}

async function walkFiles(dir, name, found = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walkFiles(full, name, found);
    else if (entry.name === name) found.push(full);
  }
  return found;
}

/** One JSON line per event, across every ledger under evidence/. */
export async function countEvidenceEvents() {
  const ledgers = await walkFiles(fromRepo('evidence'), 'events.jsonl');
  if (ledgers.length === 0) throw new Error('build-data: no evidence/**/events.jsonl found');
  let events = 0;
  for (const ledger of ledgers.sort()) {
    const text = await readFile(ledger, 'utf8');
    events += text.split('\n').filter((line) => line.trim() !== '').length;
  }
  return events;
}

/**
 * The published scale the five runs were graded on, taken from the evaluation README's scorecard
 * table headers and its declared total. The checklist files themselves are deliberately not
 * parsed: `inspection-per-frame.md` numbers fewer items than the scorecards grade.
 */
export async function readEvalScale() {
  const readme = await readText(EVAL_README);
  const item = (slug) => {
    const found = readme.match(new RegExp(`\\[${slug}\\]\\([^)]*\\)\\s*\\((\\d+)\\)`));
    if (!found) throw new Error(`build-data: ${EVAL_README} has no scorecard header for ${slug}`);
    return Number(found[1]);
  };
  const totalMatch = readme.match(/out of \*\*(\d+)\*\*/);
  if (!totalMatch) throw new Error(`build-data: ${EVAL_README} declares no "out of **N**" total`);
  const scale = {
    anti_slop: item('visual-anti-slop'),
    inspection: item('inspection-per-frame'),
    total: Number(totalMatch[1]),
  };
  if (scale.anti_slop + scale.inspection !== scale.total) {
    throw new Error(`build-data: eval scale ${scale.anti_slop}+${scale.inspection} ≠ ${scale.total}`);
  }
  return scale;
}

/** Key-art frames: showcase.json shots joined with their capture log entry by id. */
export async function readShowcase() {
  const shots = (await readJson(SHOWCASE)).shots;
  const log = await readJson(SHOWCASE_LOG);
  if (!Array.isArray(shots) || shots.length === 0) throw new Error(`build-data: ${SHOWCASE} has no shots`);
  const host = log.host?.gpu?.name ?? log.host?.cpu?.brand;
  if (!host) throw new Error(`build-data: ${SHOWCASE_LOG} names no capture host`);
  const byId = new Map((log.shots ?? []).map((entry) => [entry.id, entry]));
  return shots.map((shot) => {
    const entry = byId.get(shot.id);
    if (!entry) throw new Error(`build-data: ${SHOWCASE_LOG} has no entry for shot ${shot.id}`);
    return {
      id: shot.id,
      caption: shot.caption,
      look: shot.look,
      source: shot.source,
      tiers: shot.tiers ?? null,
      image: `media/keyart/${shot.id}.jpg`,
      thumb: `media/keyart/${shot.id}-thumb.jpg`,
      capture_mode: entry.capture_mode,
      host,
    };
  });
}

/** Directories under examples/ that ship a runnable study (index.html + scene.js). */
export async function countStudyDirectories() {
  const entries = await readdir(fromRepo('examples'), { withFileTypes: true });
  let studies = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const hasBoth = await Promise.all(
      ['index.html', 'scene.js'].map((file) =>
        stat(fromRepo('examples', entry.name, file)).then(
          () => true,
          () => false,
        ),
      ),
    );
    if (hasBoth.every(Boolean)) studies += 1;
  }
  return studies;
}

export { readJson, readText, readStyleRecord, LOOKS, INSTALL_DOC, COMPAT_DOC };
