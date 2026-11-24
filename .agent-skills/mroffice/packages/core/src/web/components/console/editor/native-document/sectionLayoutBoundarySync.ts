/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Fragment, Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  Plugin,
  PluginKey,
  type EditorState,
  type Transaction,
} from "@tiptap/pm/state";
import {
  Mapping,
  ReplaceAroundStep,
  ReplaceStep,
  type Step,
} from "@tiptap/pm/transform";
import { ySyncPluginKey } from "@tiptap/y-tiptap";

import {
  COLLABORATIVE_DOCUMENT_ATTRS_REMOTE_META,
  COLLABORATIVE_DOCUMENT_SECTION_MUTATION_META,
  type CollaborativeDocumentSectionMutation,
} from "./collaborationDocumentAttrs";
import { MRNOTE_BLOCK_IDENTITY_META } from "./blockIds";
import { imeReplayingAppendTransaction } from "./imeCompositionGuard";
import { normalizeSectionLayouts, type SectionLayout } from "./sectionLayouts";

/**
 * Word stores a section's properties in the section break that ends it (the
 * `w:sectPr` of the section's last paragraph; the last section's live at the
 * end of the body), so a break and its section's layout always travel
 * together. MRAI keeps the same chain as the ordered `doc.attrs.sectionLayouts`
 * array: entry i belongs to the section closed by section break i, and the
 * final entry to the last section.
 *
 * The dedicated Insert ▸ Break and Backspace/Delete commands update that
 * array themselves. Every other way the body gains, loses or moves a break
 * (paste, drag and drop, cut, typing over a selection, Select All + Delete,
 * the per-page header/footer boundary, AI inserts, a legacy Yjs Undo) used to
 * change the breaks alone, leaving N sections with N±k layouts; every page
 * setup command then refused to run. This plugin commits the array in the
 * same dispatch as the body change, with Word's semantics:
 *
 * - a break that survives (or is moved, like a drag) keeps its own layout;
 * - a deleted break takes its layout with it, so the merged section keeps
 *   the following section's properties;
 * - a new break inherits the layout of the section it splits, so no text
 *   changes page setup;
 * - the last section keeps the final entry.
 *
 * It never touches a document that was already mismatched before the edit
 * (that is the explicit repair flow's job), a batch that wrote the array
 * itself, pagination and remote/peer transactions (the author's client
 * commits the array; peers receive it). A silent whole-body restore (an AI
 * edit rolled back) is committed like any edit; hydration writes the stored
 * array right after its body, so it owns the final result either way.
 */

export const SECTION_LAYOUT_BOUNDARY_SYNC_META = "mrai.sectionLayouts.boundarySync";

/** pageRebalanceExtension REBALANCE_META: pagination only re-wraps pages. */
const PAGINATION_REBALANCE_META = "structuralRebalance";
/** paged-document-bridge PAGED_CANONICAL_REMOTE_META: peer edits, Undo/Redo
 * of the canonical room (which restores the attribute map itself). */
const CANONICAL_REMOTE_META = "mrnotePagedCanonicalRemote";
const SECTION_BREAK = "sectionBreak";

export interface SectionLayoutBoundarySyncReceipt {
  readonly inserted: number;
  readonly removed: number;
  readonly moved: number;
}

export interface LiveBreak {
  readonly pos: number;
  readonly node: ProseMirrorNode;
}

export function liveBreaks(doc: ProseMirrorNode): LiveBreak[] {
  const breaks: LiveBreak[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === SECTION_BREAK) {
      breaks.push({ pos, node });
      return false;
    }
    return !node.isTextblock && !node.isLeaf;
  });
  return breaks;
}

function fragmentHasBreak(fragment: Fragment): boolean {
  let found = false;
  fragment.descendants((node) => {
    if (found) return false;
    if (node.type.name === SECTION_BREAK) {
      found = true;
      return false;
    }
    return !node.isTextblock;
  });
  return found;
}

function rangeHasBreak(doc: ProseMirrorNode, from: number, to: number): boolean {
  if (to <= from) return false;
  let found = false;
  doc.nodesBetween(from, to, (node) => {
    if (found) return false;
    if (node.type.name === SECTION_BREAK) {
      found = true;
      return false;
    }
    return !node.isTextblock;
  });
  return found;
}

/** Cheap per-step screen: typing never walks the whole document. */
export function stepTouchesSectionBreak(step: Step, doc: ProseMirrorNode): boolean {
  if (step instanceof ReplaceStep) {
    const { from, to, slice } = step as unknown as {
      from: number;
      to: number;
      slice: { content: Fragment };
    };
    return fragmentHasBreak(slice.content) || rangeHasBreak(doc, from, to);
  }
  if (step instanceof ReplaceAroundStep) {
    const { from, to, gapFrom, gapTo, slice } = step as unknown as {
      from: number;
      to: number;
      gapFrom: number;
      gapTo: number;
      slice: { content: Fragment };
    };
    return (
      fragmentHasBreak(slice.content) ||
      rangeHasBreak(doc, from, gapFrom) ||
      rangeHasBreak(doc, gapTo, to)
    );
  }
  return false;
}

type YSyncMeta = { isChangeOrigin?: boolean; isUndoRedoOperation?: boolean };

/**
 * Only this author's own edits are committed here. A legacy Yjs Undo/Redo is
 * this author's edit (its undo manager restores the body only); every other
 * y-sync change is a peer's, and the canonical room's history and peer
 * changes carry their attributes themselves.
 */
export function authoredBatchRoot(root: Transaction): boolean {
  if (
    root.getMeta(PAGINATION_REBALANCE_META) ||
    root.getMeta(CANONICAL_REMOTE_META) ||
    root.getMeta(COLLABORATIVE_DOCUMENT_ATTRS_REMOTE_META)
  ) {
    return false;
  }
  const ySync = root.getMeta(ySyncPluginKey) as YSyncMeta | undefined;
  return !ySync?.isChangeOrigin || ySync.isUndoRedoOperation === true;
}

function sameLayouts(a: readonly SectionLayout[], b: readonly SectionLayout[]) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Whether an authored edit of this batch (not pagination re-wrapping or a
 * block-id backfill, which move or re-mark breaks without changing the
 * section chain) added, removed or moved a section break.
 */
export function batchTouchesSectionBreaks(
  transactions: readonly Transaction[],
): boolean {
  return transactions.some(
    (tr) =>
      !tr.getMeta(PAGINATION_REBALANCE_META) &&
      !tr.getMeta(MRNOTE_BLOCK_IDENTITY_META) &&
      tr.steps.some((step, index) =>
        stepTouchesSectionBreak(step, tr.docs[index]),
      ),
  );
}

export interface CarriedSectionBreaks {
  /** For each live break after the batch, the index of the break it was
   * before the batch, or null for a new break. */
  readonly carried: (number | null)[];
  readonly claimed: ReadonlySet<number>;
  readonly moved: number;
}

/**
 * Which old section break each new section break carries across one batch
 * of transactions. Shared by every per-section chain (layouts, header and
 * footer stories) so they all follow a break the same way.
 */
export function carriedSectionBreaks(
  transactions: readonly Transaction[],
  before: readonly LiveBreak[],
  after: readonly LiveBreak[],
): CarriedSectionBreaks {
  // Which old break (and so which layout) each new break carries.
  const carried: (number | null)[] = after.map(() => null);
  const claimed = new Set<number>();
  const mapping = new Mapping();
  for (const tr of transactions) mapping.appendMapping(tr.mapping);
  const afterIndexAt = new Map(after.map((entry, index) => [entry.pos, index]));
  before.forEach((entry, oldIndex) => {
    const result = mapping.mapResult(entry.pos, 1);
    if (result.deletedAfter) return;
    const newIndex = afterIndexAt.get(result.pos);
    if (newIndex === undefined || carried[newIndex] !== null) return;
    carried[newIndex] = oldIndex;
    claimed.add(oldIndex);
  });
  // A break deleted in one place and inserted in another within the same
  // batch (drag and drop, pagination re-wrapping) is the same node object: it
  // was moved, not replaced, and keeps its own section's layout. A pasted
  // copy is always a new node, even when it repeats a block id.
  const unclaimedByNode = new Map<ProseMirrorNode, number>();
  before.forEach((entry, oldIndex) => {
    if (!claimed.has(oldIndex) && !unclaimedByNode.has(entry.node)) {
      unclaimedByNode.set(entry.node, oldIndex);
    }
  });
  let moved = 0;
  after.forEach((entry, newIndex) => {
    if (carried[newIndex] !== null) return;
    const oldIndex = unclaimedByNode.get(entry.node);
    if (oldIndex === undefined || claimed.has(oldIndex)) return;
    carried[newIndex] = oldIndex;
    claimed.add(oldIndex);
    moved += 1;
  });
  // A break replaced in place by an identical-position break is the same
  // break with new attributes (a break-kind change, block-id backfill).
  before.forEach((entry, oldIndex) => {
    if (claimed.has(oldIndex)) return;
    const start = mapping.map(entry.pos, -1);
    const end = mapping.map(entry.pos + entry.node.nodeSize, 1);
    const newIndex = afterIndexAt.get(start);
    if (
      newIndex === undefined ||
      carried[newIndex] !== null ||
      start + after[newIndex].node.nodeSize !== end
    ) {
      return;
    }
    carried[newIndex] = oldIndex;
    claimed.add(oldIndex);
  });

  // A whole-body replacement (a silent restore, a legacy Yjs re-render)
  // rebuilds every node; a break that comes back with the block id of a
  // break it replaced is that break. A pasted copy repeats the id of a break
  // that is still there (claimed above), so it never matches here.
  const blockId = (node: ProseMirrorNode): string | null =>
    typeof node.attrs.block_id === "string" && node.attrs.block_id
      ? node.attrs.block_id
      : null;
  const unclaimedIds = new Map<string, number[]>();
  before.forEach((entry, oldIndex) => {
    const id = blockId(entry.node);
    if (claimed.has(oldIndex) || !id) return;
    unclaimedIds.set(id, [...(unclaimedIds.get(id) ?? []), oldIndex]);
  });
  const newIds = new Map<string, number[]>();
  after.forEach((entry, newIndex) => {
    const id = blockId(entry.node);
    if (carried[newIndex] !== null || !id) return;
    newIds.set(id, [...(newIds.get(id) ?? []), newIndex]);
  });
  for (const [id, newIndexes] of newIds) {
    const oldIndexes = unclaimedIds.get(id);
    if (newIndexes.length !== 1 || oldIndexes?.length !== 1) continue;
    carried[newIndexes[0]] = oldIndexes[0];
    claimed.add(oldIndexes[0]);
  }
  return { carried, claimed, moved };
}

/**
 * The layouts transaction to append for this batch, or null. Exported for the
 * plugin and its tests only.
 */
export function sectionLayoutBoundarySyncTransaction(
  transactions: readonly Transaction[],
  oldState: EditorState,
  newState: EditorState,
): Transaction | null {
  const root = transactions[0];
  if (!root || !transactions.some((tr) => tr.docChanged)) return null;
  if (!authoredBatchRoot(root)) return null;
  const raw = newState.doc.attrs.sectionLayouts;
  // The legacy document-wide model has no per-section chain to keep aligned.
  if (raw === null || raw === undefined) return null;
  // A batch that wrote the chain itself (Insert ▸ Break, Backspace on a
  // break, a restore, a repair) owns the result.
  if (raw !== oldState.doc.attrs.sectionLayouts) return null;
  // Pagination re-wrapping and block-id backfill move or re-mark breaks
  // without changing the chain; only the batch's other edits can.
  if (!batchTouchesSectionBreaks(transactions)) return null;

  const layouts = normalizeSectionLayouts(raw);
  const before = liveBreaks(oldState.doc);
  // Already mismatched before this edit: never guess; the repair prompt owns it.
  if (!layouts || layouts.length !== before.length + 1) return null;
  const after = liveBreaks(newState.doc);
  const { carried, claimed, moved } = carriedSectionBreaks(
    transactions,
    before,
    after,
  );

  // Build the chain from the end: the last section keeps the final entry; a
  // carried break keeps its own; a new break copies the section it split,
  // which is whatever the next section (up to the next carried break) holds.
  const next: SectionLayout[] = new Array(after.length + 1);
  next[after.length] = layouts[layouts.length - 1];
  for (let index = after.length - 1; index >= 0; index -= 1) {
    const oldIndex = carried[index];
    next[index] = oldIndex === null ? next[index + 1] : layouts[oldIndex];
  }
  const normalized = normalizeSectionLayouts(next);
  if (!normalized || normalized.length !== after.length + 1) return null;
  if (sameLayouts(normalized, layouts)) return null;

  const inserted = carried.filter((value) => value === null).length;
  const removed = before.length - claimed.size;
  const carriedInOrder = carried
    .filter((value): value is number => value !== null)
    .every((value, index, list) => index === 0 || list[index - 1] < value);
  let mutation: CollaborativeDocumentSectionMutation | null = null;
  if (carriedInOrder && inserted === 1 && removed === 0) {
    mutation = { type: "insert", index: carried.indexOf(null) };
  } else if (carriedInOrder && inserted === 0 && removed === 1) {
    const deleted = before.findIndex((_, index) => !claimed.has(index));
    mutation = { type: "delete", index: deleted };
  }

  const tr = newState.tr.setDocAttribute("sectionLayouts", normalized);
  const receipt: SectionLayoutBoundarySyncReceipt = { inserted, removed, moved };
  tr.setMeta(SECTION_LAYOUT_BOUNDARY_SYNC_META, receipt);
  if (mutation) tr.setMeta(COLLABORATIVE_DOCUMENT_SECTION_MUTATION_META, mutation);
  // Keep the batch's classification: the chain is part of the same edit.
  if (root.getMeta("addToHistory") === false) tr.setMeta("addToHistory", false);
  const ySync = root.getMeta(ySyncPluginKey) as YSyncMeta | undefined;
  if (ySync?.isChangeOrigin) {
    // A legacy Yjs Undo: the body already came from the room; do not echo it.
    tr.setMeta(ySyncPluginKey, { isChangeOrigin: true, isUndoRedoOperation: true });
  }
  return tr;
}

export const sectionLayoutBoundarySyncKey = new PluginKey(
  "mraiSectionLayoutBoundarySync",
);

export function sectionLayoutBoundarySyncPlugin(): Plugin {
  return new Plugin({
    key: sectionLayoutBoundarySyncKey,
    appendTransaction: imeReplayingAppendTransaction((transactions, oldState, newState) =>
      sectionLayoutBoundarySyncTransaction(transactions, oldState, newState),
    ),
  });
}
