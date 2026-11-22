// Shapes of site/src/generated/*.json, written by site/scripts/build-data.mjs. The JSON modules are
// imported by App.tsx and structurally match these; the interfaces exist so a component's props are
// a contract rather than an inferred blob.

export interface Example {
  id: string;
  /** Link label of the study's line in examples/README.md. */
  title: string;
  /** The same line's one-clause description, after the em dash. */
  blurb: string;
  /** The `## ` heading the line sits under; the gallery's chapter. */
  chapter: string;
  accent: string;
  href: string;
  thumb: string;
  /** Extensionless clip path (`media/clips/heart`), or null when no clip was recorded. */
  clip: string | null;
}

/** One paragraph or fenced block of an install section, in document order (intro excluded). */
export interface InstallBlock {
  /** 'p' for prose, 'code' for a fenced block (JSON import widens it to string). */
  kind: string;
  lang?: string;
  text: string;
}

export interface InstallTab {
  id: string;
  label: string;
  intro: string;
  steps: string[];
  /** Empty for Codex: docs/installation.md ships prose only for that host. */
  commands: string[];
  blocks: InstallBlock[];
}

export interface EvalScale {
  anti_slop: number;
  inspection: number;
  total: number;
}

export interface Stats {
  blueprints: number;
  directions: number;
  evidence_events: number;
  knowledge: number;
  recipes: number;
  showcase_frames: number;
  sources: number;
  studies: number;
  eval_scale: EvalScale;
}

/** One row of the compatibility table in docs/compatibility.md. */
export interface CompatRow {
  surface: string;
  statement: string;
}

/**
 * catalog.json: one row per group of the skill's store — the recipe directions, the knowledge kinds
 * and the kit blueprints — written by scripts/build-data-catalog.mjs and checked against
 * catalog-summary.json inside the build. Small enough (~9 KB) to ship in the entry bundle.
 */
export interface CatalogDirection {
  /** The direction id as directions.json spells it: `environments-dioramas`. */
  id: string;
  summary: string;
  /** Recipes whose `direction_ids` include this one; a recipe can serve several. */
  count: number;
}

export interface CatalogKind {
  /** The knowledge_kind directory name; its one-line description is page copy. */
  id: string;
  count: number;
}

export interface CatalogBlueprint {
  /** The record id without its `knowledge.` prefix: `blueprint-barrel`. */
  id: string;
  summary: string;
  /** The highest tier the kit has proved (`T2`, `T3`), or an em dash when it has proved none. */
  tier: string;
}

export interface Catalog {
  directions: CatalogDirection[];
  kinds: CatalogKind[];
  blueprints: CatalogBlueprint[];
}
