/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Review > Accept All Changes / Reject All Changes in the headers and
 * footers. Word's two commands settle every story of the document, the
 * headers and footers with the body. A header or footer that is Word's own
 * part shows its tracked insertions and deletions as band runs carrying a
 * `revision`; the part may hold more (formatting changes, paragraph marks)
 * that the band never draws. So the band is settled for what it shows, and
 * the story records the command (`nativeEdits.revisions`): the save settles
 * the part itself, every tracked change in it, as Word does.
 */

import {
  bandRichRunsText,
  normalizeSectionBands,
  type BandRichBlock,
  type BandRichImage,
  type BandRichParagraph,
  type BandRichRun,
  type BandRichTable,
} from "./headerFooter";
import type { NativeStoryRevisions } from "./nativeStoryEdits";
import {
  normalizeSectionStoryGraph,
  resolveEffectiveSectionStoryRef,
  type SectionStoryGraph,
  type SectionStoryKind,
  type SectionStoryVariant,
} from "./sectionStoryGraph";

const RICH_KEYS = {
  header: { default: "headerRich", first: "firstPageHeaderRich", even: "evenPageHeaderRich" },
  footer: { default: "footerRich", first: "firstPageFooterRich", even: "evenPageFooterRich" },
} as const;
const TEXT_KEYS = {
  header: { default: "headerText", first: "firstPageHeader", even: "evenPageHeader" },
  footer: { default: "footerText", first: "firstPageFooter", even: "evenPageFooter" },
} as const;
const KINDS: readonly SectionStoryKind[] = ["header", "footer"];
const VARIANTS: readonly SectionStoryVariant[] = ["default", "first", "even"];

/** Thrown when a band's shape cannot be settled as its part will be. */
class Unsettled extends Error {}

interface Settled<T> {
  value: T;
  changed: boolean;
}

interface SettledRuns extends Settled<BandRichRun[]> {
  /** Whether each source run is still there. */
  alive: boolean[];
}

/** Runs with their tracked changes settled: accepting keeps an insertion's
 * words and drops a deletion's, rejecting the reverse; what stays is no
 * longer tracked. */
function settleRuns(runs: readonly BandRichRun[], decision: NativeStoryRevisions): SettledRuns {
  const gone = decision === "accept" ? "del" : "ins";
  const value: BandRichRun[] = [];
  const alive: boolean[] = [];
  let changed = false;
  for (const run of runs) {
    alive.push(run.revision?.kind !== gone);
    if (!run.revision) {
      value.push(run);
      continue;
    }
    changed = true;
    if (run.revision.kind === gone) continue;
    const kept: BandRichRun = { ...run };
    delete kept.revision;
    value.push(kept);
  }
  return { value, changed, alive };
}

/** How many of a line's first `count` runs are still there. */
function keptBefore(runs: SettledRuns, count: number): number {
  return runs.alive.slice(0, count).filter(Boolean).length;
}

function settleParagraph(paragraph: BandRichParagraph, decision: NativeStoryRevisions): Settled<BandRichParagraph> {
  const runs = settleRuns(paragraph.runs ?? [], decision);
  let changed = runs.changed;
  const next: BandRichParagraph = { ...paragraph };
  if (runs.changed) {
    next.runs = runs.value;
    // An in-line picture or a box keeps its place among the line's runs.
    if (paragraph.images) {
      next.images = paragraph.images.map((image) => {
        if (image.runsBefore === undefined) return image;
        const kept = keptBefore(runs, image.runsBefore);
        const moved: BandRichImage = { ...image, runsBefore: kept };
        if (kept >= runs.value.length) delete moved.runsBefore;
        return moved;
      });
    }
  }
  if (paragraph.frames) {
    let framesChanged = false;
    const frames = paragraph.frames.map((frame) => {
      let out = frame;
      if (runs.changed && typeof frame.runsBefore === "number") {
        out = { ...out, runsBefore: keptBefore(runs, frame.runsBefore) };
        framesChanged = true;
      }
      if (Array.isArray(frame.blocks)) {
        const blocks = settleBlocks(frame.blocks, decision);
        if (blocks.changed) {
          out = { ...out, blocks: blocks.value };
          framesChanged = true;
        }
      }
      return out;
    });
    if (framesChanged) {
      next.frames = frames;
      changed = true;
    }
  }
  return { value: changed ? next : paragraph, changed };
}

function settleTable(table: BandRichTable, decision: NativeStoryRevisions): Settled<BandRichTable> {
  let changed = false;
  const cells = table.cells.map((cell) => {
    let out = cell;
    if (cell.paragraphs) {
      const paragraphs = cell.paragraphs.map((paragraph) => settleParagraph(paragraph, decision));
      if (paragraphs.some((item) => item.changed)) {
        out = { ...out, paragraphs: paragraphs.map((item) => item.value) };
      }
    }
    if (cell.runs) {
      const runs = settleRuns(cell.runs, decision);
      if (runs.changed) {
        // A cell's text is its runs spelled out; one that is not cannot be
        // told what it becomes.
        if (cell.text !== bandRichRunsText(cell.runs)) throw new Unsettled();
        out = { ...out, runs: runs.value, text: bandRichRunsText(runs.value) };
      }
    }
    if (cell.tables) {
      const tables = cell.tables.map((nested) => ({ at: nested.at, settled: settleTable(nested.table, decision) }));
      if (tables.some((item) => item.settled.changed)) {
        out = { ...out, tables: tables.map((item) => ({ at: item.at, table: item.settled.value })) };
      }
    }
    if (out !== cell) changed = true;
    return out;
  });
  return { value: changed ? { ...table, cells } : table, changed };
}

function settleBlocks(blocks: readonly BandRichBlock[], decision: NativeStoryRevisions): Settled<BandRichBlock[]> {
  let changed = false;
  const value = blocks.map((block) => {
    const settled = block.type === "paragraph" ? settleParagraph(block, decision) : settleTable(block, decision);
    changed ||= settled.changed;
    return settled.value;
  });
  return { value, changed };
}

/** A header or footer's blocks with every tracked change it shows accepted
 * or rejected, or null when it shows none (or one it cannot settle). */
export function bandBlocksWithRevisionsSettled(
  blocks: readonly BandRichBlock[],
  decision: NativeStoryRevisions,
): BandRichBlock[] | null {
  try {
    const settled = settleBlocks(blocks, decision);
    return settled.changed ? settled.value : null;
  } catch (error) {
    if (error instanceof Unsettled) return null;
    throw error;
  }
}

/**
 * The document's story graph and section bands with Accept / Reject All
 * Changes applied to every header and footer that is Word's own part and
 * shows a tracked change, or null when none does. A story already edited
 * beyond its tracked changes is left as it is: its part takes no settlement
 * beside those edits (the server's `native_story_edit_revision`).
 */
export function sectionBandsWithRevisionsSettled(
  attrs: Record<string, unknown>,
  decision: NativeStoryRevisions,
): { sectionStoryGraph: SectionStoryGraph; sectionBands: NonNullable<ReturnType<typeof normalizeSectionBands>> } | null {
  const bands = normalizeSectionBands(attrs.sectionBands);
  if (!bands) return null;
  const graph = normalizeSectionStoryGraph(attrs.sectionStoryGraph, bands.length);
  if (!graph) return null;
  const nextBands = bands.map((entry) => ({ ...entry })) as Record<string, unknown>[];
  const stories = graph.stories.map((story) => ({ ...story }));
  let changed = false;
  for (const story of stories) {
    const content = story.content;
    if (content.mode !== "opaque" || !("nativeText" in content)) continue;
    if (Object.keys(content.textEdits).length) continue;
    const edits = content.nativeEdits;
    if (edits && Object.keys(edits).some((key) => key !== "revisions")) continue;
    const places: { section: number; kind: SectionStoryKind; variant: SectionStoryVariant }[] = [];
    for (let section = 0; section < bands.length; section += 1) {
      for (const kind of KINDS) {
        for (const variant of VARIANTS) {
          if (resolveEffectiveSectionStoryRef(graph, section, kind, variant)?.storyId === story.storyId) {
            places.push({ section, kind, variant });
          }
        }
      }
    }
    const shown = places
      .map(({ section, kind, variant }) => nextBands[section][RICH_KEYS[kind][variant]])
      .find((value): value is BandRichBlock[] => Array.isArray(value));
    if (!shown) continue;
    const settled = bandBlocksWithRevisionsSettled(shown, decision);
    if (!settled) continue;
    story.content = { ...content, nativeEdits: { revisions: decision } };
    for (const { section, kind, variant } of places) {
      nextBands[section][RICH_KEYS[kind][variant]] = settled;
      delete nextBands[section][TEXT_KEYS[kind][variant]];
    }
    changed = true;
  }
  if (!changed) return null;
  return {
    sectionStoryGraph: { ...graph, stories },
    sectionBands: nextBands as NonNullable<ReturnType<typeof normalizeSectionBands>>,
  };
}
