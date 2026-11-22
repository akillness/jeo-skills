// The catalog section's rows: the 24 recipe directions, the 18 knowledge kinds and the 22 kit
// blueprints, each with its own count read off the record files, and each figure checked against
// catalog-summary.json — the store's own second opinion — before catalog.json is written.
// Nothing is typed: ids, summaries, counts and proved tiers all come out of the store.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fromRepo } from './build-data-sources.mjs';

const DATA = 'skills/3dviz-pro-max/data';
const RECIPES_DIR = fromRepo(DATA, 'recipes');
const KNOWLEDGE_DIR = fromRepo(DATA, 'knowledge');
const DIRECTIONS = fromRepo(DATA, 'directions.json');
const SUMMARY = fromRepo(DATA, 'catalog-summary.json');

/** A row's summary never wraps, so it is cut to fit rather than clipped mid-word. */
const SUMMARY_MAX = 100;

/**
 * The summary, whitespace-flattened and — when it is longer than the row can hold — cut at the last
 * word boundary that leaves room for the ellipsis. The result is always ≤ SUMMARY_MAX chars.
 */
export function clampSummary(text) {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= SUMMARY_MAX) return flat;
  const cut = flat.slice(0, SUMMARY_MAX - 1);
  const lastSpace = cut.lastIndexOf(' ');
  const kept = lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
  return `${kept.replace(/[\s,;:.—-]+$/, '')}…`;
}

/** Every `*.json` in a directory, sorted, so a rebuild on another machine emits the same file. */
async function jsonFiles(dir) {
  const names = await readdir(dir);
  return names.filter((name) => name.endsWith('.json')).sort().map((name) => path.join(dir, name));
}

const byCountThenId = (a, b) => b.count - a.count || a.id.localeCompare(b.id);

/**
 * Recipes counted per direction by **any** membership of `direction_ids`, not by the first entry:
 * a recipe serving three directions is listed under all three, which is what "across 24 directions"
 * claims and what catalog-summary.json's own recipes_by_direction holds.
 */
async function readDirections() {
  const directions = JSON.parse(await readFile(DIRECTIONS, 'utf8'));
  if (!Array.isArray(directions) || directions.length === 0) {
    throw new Error(`build-data: ${DATA}/directions.json is not a non-empty array`);
  }
  const counts = new Map(directions.map((direction) => [direction.id, 0]));
  for (const file of await jsonFiles(RECIPES_DIR)) {
    const recipe = JSON.parse(await readFile(file, 'utf8'));
    const ids = recipe.direction_ids ?? [];
    if (ids.length === 0) throw new Error(`build-data: ${DATA}/recipes/${path.basename(file)} has no direction_ids`);
    for (const id of ids) {
      if (!counts.has(id)) {
        throw new Error(`build-data: ${DATA}/recipes/${path.basename(file)} names direction "${id}", which directions.json does not`);
      }
      counts.set(id, counts.get(id) + 1);
    }
  }
  return directions
    .map((direction) => {
      if (typeof direction.summary !== 'string' || direction.summary.trim() === '') {
        throw new Error(`build-data: ${DATA}/directions.json entry ${direction.id} has no summary`);
      }
      return { id: direction.id, summary: clampSummary(direction.summary), count: counts.get(direction.id) };
    })
    .sort(byCountThenId);
}

/** The highest tier a blueprint has proved; the one kit that has proved none says so with a dash. */
function provedTier(tiers) {
  const proved = Object.entries(tiers ?? {})
    .filter(([, tier]) => tier?.status === 'proved')
    .map(([name]) => name)
    .sort();
  return proved.at(-1) ?? '—';
}

/**
 * The knowledge store is one file per record under a per-kind directory (catalog layout v2), so a
 * kind's count is its directory's file count. The blueprint directory doubles as the Kits tab.
 */
async function readKnowledge() {
  const dirs = (await readdir(KNOWLEDGE_DIR, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const kinds = [];
  const blueprints = [];
  for (const kind of dirs) {
    const files = await jsonFiles(path.join(KNOWLEDGE_DIR, kind));
    // The kind's one-line description is page copy (src/lib/knowledge-kind-summaries.ts): the store
    // itself describes no kind — only its records — and the reference pages are generated indexes.
    kinds.push({ id: kind, count: files.length });
    if (kind !== 'blueprint') continue;
    for (const file of files) {
      const record = JSON.parse(await readFile(file, 'utf8'));
      const id = String(record.id ?? '').replace(/^knowledge\./, '');
      if (!id || typeof record.summary !== 'string' || record.summary.trim() === '') {
        throw new Error(`build-data: ${DATA}/knowledge/blueprint/${path.basename(file)} has no id or summary`);
      }
      blueprints.push({ id, summary: clampSummary(record.summary), tier: provedTier(record.tiers) });
    }
  }
  return { kinds: kinds.sort(byCountThenId), blueprints: blueprints.sort((a, b) => a.id.localeCompare(b.id)) };
}

/**
 * `{ directions, kinds, blueprints }` — one row per group, counted from the record files and then
 * checked against catalog-summary.json, which recounts the same store its own way: a disagreement
 * means one of the two is stale and the section would show a figure nobody can reproduce.
 */
export async function readCatalog() {
  const [directions, knowledge, summary] = await Promise.all([
    readDirections(),
    readKnowledge(),
    readFile(SUMMARY, 'utf8').then(JSON.parse),
  ]);
  const catalog = { directions, ...knowledge };
  const disagree = (what, mine, theirs) => {
    if (mine !== theirs) {
      throw new Error(`build-data: catalog-summary.json says ${theirs} ${what}, the store holds ${mine}`);
    }
  };
  disagree('directions', directions.length, summary.planned_directions);
  disagree('knowledge records', catalog.kinds.reduce((sum, row) => sum + row.count, 0), summary.knowledge);
  disagree('blueprints', catalog.blueprints.length, summary.knowledge_by_kind.blueprint);
  for (const row of directions) disagree(`recipes under ${row.id}`, row.count, summary.recipes_by_direction[row.id]);
  for (const row of catalog.kinds) disagree(`${row.id} records`, row.count, summary.knowledge_by_kind[row.id]);
  return catalog;
}
