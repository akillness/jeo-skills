/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { ySyncPluginKey } from "@tiptap/y-tiptap";

import { normalizeSectionBands, type SectionBandEntry } from "./headerFooter";
import { imeReplayingAppendTransaction } from "./imeCompositionGuard";
import {
  authoredBatchRoot,
  batchTouchesSectionBreaks,
  carriedSectionBreaks,
  liveBreaks,
} from "./sectionLayoutBoundarySync";
import {
  SECTION_STORY_SLOTS,
  normalizeSectionStoryGraph,
  withSectionStorySections,
  type SectionStorySection,
} from "./sectionStoryGraph";





























export const SECTION_STORY_BOUNDARY_SYNC_META = "mrai.sectionStories.boundarySync";

const BAND_LINK_KEYS = [
  "headerLinkedToPrevious",
  "footerLinkedToPrevious",
  "firstPageHeaderLinkedToPrevious",
  "firstPageFooterLinkedToPrevious",
  "evenPageHeaderLinkedToPrevious",
  "evenPageFooterLinkedToPrevious",
] as const;

type YSyncMeta = { isChangeOrigin?: boolean; isUndoRedoOperation?: boolean };

/**
 * For each section after the batch, the section it continues before the
 * batch (its "owner"): the section whose ending break it still carries, or
 * for a new break, the section that break split.
 */
function sectionOwners(
  carried: readonly (number | null)[],
  oldBreakCount: number,
): number[] {
  const owners = new Array<number>(carried.length + 1);
  owners[carried.length] = oldBreakCount;
  for (let index = carried.length - 1; index >= 0; index -= 1) {
    owners[index] = carried[index] ?? owners[index + 1];
  }
  return owners;
}

/** Old sections merged into new section `index` (their breaks were deleted). */
function mergedAway(owners: readonly number[], index: number): number[] {
  const previous = index === 0 ? -1 : owners[index - 1];
  const out: number[] = [];
  for (let old = owners[index] - 1; old > previous; old -= 1) out.push(old);
  return out;
}

function isHead(owners: readonly number[], index: number): boolean {
  return index === 0 || owners[index - 1] !== owners[index];
}

function ownsAnyStory(section: SectionStorySection): boolean {
  return SECTION_STORY_SLOTS.some((slot) => section[slot] !== null);
}

export function alignSectionStoryGraph(
  graphValue: unknown,
  owners: readonly number[],
): unknown | null {
  const oldCount = Math.max(...owners) + 1;
  const graph = normalizeSectionStoryGraph(graphValue, oldCount);
  if (!graph) return null;
  const sections: SectionStorySection[] = owners.map((owner, index) => {
    const own = graph.sections[owner];
    if (!isHead(owners, index)) {
      const linked = { titlePage: own.titlePage } as SectionStorySection;
      for (const slot of SECTION_STORY_SLOTS) linked[slot] = null;
      return linked;
    }
    const merged: SectionStorySection = { ...own };
    if (ownsAnyStory(own)) return merged;
    const donor = mergedAway(owners, index)
      .map((old) => graph.sections[old])
      .find(ownsAnyStory);
    if (donor) for (const slot of SECTION_STORY_SLOTS) merged[slot] = donor[slot];
    return merged;
  });
  return withSectionStorySections(graph, sections);
}

export function alignSectionBands(
  bandsValue: unknown,
  owners: readonly number[],
  graphValue?: unknown,
): SectionBandEntry[] | null {
  const oldCount = Math.max(...owners) + 1;
  const bands = normalizeSectionBands(bandsValue);
  if (!bands || bands.length !== oldCount) return null;
  // Which sections own a story: the imported package's references when the
  // page carries them (the graph aligns by the same rule), else the bands.
  const graph =
    graphValue === null || graphValue === undefined
      ? null
      : normalizeSectionStoryGraph(graphValue, oldCount);
  const owns = (old: number): boolean =>
    graph ? ownsAnyStory(graph.sections[old]) : ownsAnyBand(bands[old]);
  const aligned: SectionBandEntry[] = [];
  owners.forEach((owner, index) => {
    const entry: SectionBandEntry = { ...bands[owner] };
    if (!isHead(owners, index)) {
      // The painted band is already the effective one; the flags record that
      // the new section owns no story of its own yet. A native page-scoped
      // entry (the product's per-page header model, sheetSectionIsolation)
      // is split into two independent copies instead, as it always was.
      if (entry.pageScoped !== true) {
        for (const key of BAND_LINK_KEYS) entry[key] = true;
      }
      aligned.push(entry);
      return;
    }
    if (!owns(owner)) {
      // A merged section that owns no story takes the removed section's.
      const donorIndex = mergedAway(owners, index).find(owns);
      const donor = donorIndex === undefined ? undefined : bands[donorIndex];
      if (donor) {
        for (const key of BAND_LINK_KEYS) {
          for (const field of BAND_SLOT_FIELDS[key]) {
            copyBandField(entry, donor, field);
          }
          if (donor[key] === true) entry[key] = true;
          else delete entry[key];
        }
      }
    }
    // A linked story paints what the section before it paints now; the
    // first section has nothing before it, so it paints nothing there.
    const previous = aligned[index - 1];
    for (const key of BAND_LINK_KEYS) {
      if (entry[key] !== true) continue;
      for (const field of BAND_SLOT_FIELDS[key]) {
        copyBandField(entry, previous, field);
      }
      if (index === 0) delete entry[key];
    }
    aligned.push(entry);
  });
  return aligned;
}

/** The painted fields of the story each link flag stands for. */
const BAND_SLOT_FIELDS: Record<
  (typeof BAND_LINK_KEYS)[number],
  readonly (keyof SectionBandEntry)[]
> = {
  headerLinkedToPrevious: ["headerText", "headerRich"],
  footerLinkedToPrevious: ["footerText", "footerRich"],
  firstPageHeaderLinkedToPrevious: ["firstPageHeader", "firstPageHeaderRich"],
  firstPageFooterLinkedToPrevious: ["firstPageFooter", "firstPageFooterRich"],
  evenPageHeaderLinkedToPrevious: ["evenPageHeader", "evenPageHeaderRich"],
  evenPageFooterLinkedToPrevious: ["evenPageFooter", "evenPageFooterRich"],
};

/** ``field`` as ``source`` paints it, or absent when it paints nothing there. */
function copyBandField(
  target: SectionBandEntry,
  source: SectionBandEntry | undefined,
  field: keyof SectionBandEntry,
): void {
  if (source && source[field] !== undefined) Object.assign(target, { [field]: source[field] });
  else delete target[field];
}

function ownsAnyBand(entry: SectionBandEntry): boolean {
  return BAND_LINK_KEYS.some(
    (key) =>
      entry[key] !== true &&
      BAND_SLOT_FIELDS[key].some((field) => {
        const value = entry[field];
        return Array.isArray(value) ? value.length > 0 : typeof value === "string" && value !== "";
      }),
  );
}

export function sectionStoryBoundarySyncTransaction(
  transactions: readonly Transaction[],
  oldState: EditorState,
  newState: EditorState,
): Transaction | null {
  const root = transactions[0];
  if (!root || !transactions.some((tr) => tr.docChanged)) return null;
  if (!authoredBatchRoot(root)) return null;
  const oldAttrs = oldState.doc.attrs as Record<string, unknown>;
  const newAttrs = newState.doc.attrs as Record<string, unknown>;
  const graphValue = newAttrs.sectionStoryGraph;
  const bandsValue = newAttrs.sectionBands;
  // A batch that wrote a chain itself (a restore, a repair, a story edit)
  // owns that chain.
  const graphOwned = graphValue !== oldAttrs.sectionStoryGraph;
  const bandsOwned = bandsValue !== oldAttrs.sectionBands;
  const graphPresent = graphValue !== null && graphValue !== undefined;
  const bandsPresent = bandsValue !== null && bandsValue !== undefined;
  const startValue = newAttrs.pageNumberStartSection;
  const startFollows =
    startValue === oldAttrs.pageNumberStartSection &&
    typeof startValue === "number" && Number.isInteger(startValue) && startValue > 0;
  if ((!graphPresent || graphOwned) && (!bandsPresent || bandsOwned) && !startFollows) return null;
  if (!batchTouchesSectionBreaks(transactions)) return null;

  const before = liveBreaks(oldState.doc);
  const after = liveBreaks(newState.doc);
  const { carried } = carriedSectionBreaks(transactions, before, after);
  const identity =
    before.length === after.length &&
    carried.every((value, index) => value === index);
  if (identity) return null;
  const owners = sectionOwners(carried, before.length);

  let tr: Transaction | null = null;
  if (graphPresent && !graphOwned) {
    const next = alignSectionStoryGraph(graphValue, owners);
    if (next) {
      tr = (tr ?? newState.tr).setDocAttribute("sectionStoryGraph", next);
    }
  }
  if (bandsPresent && !bandsOwned) {
    const next = alignSectionBands(bandsValue, owners, graphPresent ? graphValue : null);
    if (next) tr = (tr ?? newState.tr).setDocAttribute("sectionBands", next);
  }
  if (startFollows) {
    // The section page numbering starts at follows its section, as Word's
    // own w:pgNumType rides that section's break: a deleted break before it
    // merges it into the section before (which takes its formatting), an
    // inserted one before it moves it on (corpus R456-D21 E59: the first
    // break deleted, the numbered footer of the merged first section lost
    // its PAGE field in the export).
    const next = owners.findIndex((owner) => owner >= (startValue as number));
    const moved = next < 0 ? owners.length - 1 : next;
    if (moved !== startValue) tr = (tr ?? newState.tr).setDocAttribute("pageNumberStartSection", moved);
  }
  if (!tr) return null;
  tr.setMeta(SECTION_STORY_BOUNDARY_SYNC_META, { sections: owners.length });
  if (root.getMeta("addToHistory") === false) tr.setMeta("addToHistory", false);
  const ySync = root.getMeta(ySyncPluginKey) as YSyncMeta | undefined;
  if (ySync?.isChangeOrigin) {
    tr.setMeta(ySyncPluginKey, { isChangeOrigin: true, isUndoRedoOperation: true });
  }
  return tr;
}

export const sectionStoryBoundarySyncKey = new PluginKey(
  "mraiSectionStoryBoundarySync",
);

export function sectionStoryBoundarySyncPlugin(): Plugin {
  return new Plugin({
    key: sectionStoryBoundarySyncKey,
    appendTransaction: imeReplayingAppendTransaction((transactions, oldState, newState) =>
      sectionStoryBoundarySyncTransaction(transactions, oldState, newState),
    ),
  });
}
