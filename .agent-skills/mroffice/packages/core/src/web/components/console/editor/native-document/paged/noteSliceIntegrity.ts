/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";

import {
  NOTE_LIST_NODE,
  NOTE_SLICE_END_ATTR,
  NOTE_SLICE_END_OFFSET_ATTR,
  NOTE_SLICE_START_ATTR,
  NOTE_SLICE_START_OFFSET_ATTR,
} from "./blockSplitting";
import { PAGE_BLOCK_NODE } from "./paginationProjectionKeys";
import { imeReplayingAppendTransaction } from "../imeCompositionGuard";
import {
  FOOTNOTE_MARK_NAME,
  noteStreamOf,
  resolveFootnoteMode,
  sanitizeFootnoteId,
  sanitizeNotePosition,
} from "../footnotes";
import { trustReadOnlyDocumentMutation } from "../readOnlyTransactionAuthority";

/** The ledger's own transactions (pageRebalanceExtension REBALANCE_META): it cuts and joins slices itself. */
const STRUCTURAL_REBALANCE_META = "structuralRebalance";
/** Corrections this rule appends: at most one per dispatch. */
export const NOTE_SLICE_INTEGRITY_META = "mrnoteNoteSliceIntegrity";

const SLICE_ATTRS = [
  NOTE_SLICE_START_ATTR,
  NOTE_SLICE_END_ATTR,
  NOTE_SLICE_START_OFFSET_ATTR,
  NOTE_SLICE_END_OFFSET_ATTR,
] as const;

interface NoteCursor {
  entry: number;
  offset: number;
}

interface NoteListMember {
  pos: number;
  node: PmNode;
  /** Its index among the blocks of the reading order (pages flattened). */
  order: number;
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function isSliced(node: PmNode): boolean {
  return SLICE_ATTRS.some((key) => node.attrs?.[key] !== null && node.attrs?.[key] !== undefined);
}

function sliceStart(node: PmNode): NoteCursor {
  return {
    entry: Math.max(0, integer(node.attrs?.[NOTE_SLICE_START_ATTR]) ?? 0),
    offset: Math.max(0, integer(node.attrs?.[NOTE_SLICE_START_OFFSET_ATTR]) ?? 0),
  };
}

function sliceEnd(node: PmNode): NoteCursor | null {
  const entry = integer(node.attrs?.[NOTE_SLICE_END_ATTR]);
  if (entry === null) return null;
  return { entry: Math.max(0, entry), offset: Math.max(0, integer(node.attrs?.[NOTE_SLICE_END_OFFSET_ATTR]) ?? 0) };
}

function sameCursor(left: NoteCursor, right: NoteCursor): boolean {
  return left.entry === right.entry && left.offset === right.offset;
}

/** Every footnoteList at the top of a sheet (or of the document), in reading order. */
export function noteListMembers(doc: PmNode): NoteListMember[] {
  const members: NoteListMember[] = [];
  let order = 0;
  doc.forEach((child, offset) => {
    if (child.type.name !== PAGE_BLOCK_NODE) {
      if (child.type.name === NOTE_LIST_NODE) members.push({ pos: offset, node: child, order });
      order += 1;
      return;
    }
    child.forEach((block, blockOffset) => {
      if (block.type.name === NOTE_LIST_NODE) members.push({ pos: offset + 1 + blockOffset, node: block, order });
      order += 1;
    });
  });
  return members;
}

/**
 * Whether `members` are one chain of the one list: a single whole list, or
 * slices from the first entry on, each starting where the previous ended,
 * the last one open, each the block right after the one before (the
 * reading order runs on across page breaks).
 */
export function isOneNoteChain(members: readonly NoteListMember[]): boolean {
  if (members.length === 0) return true;
  if (members.length === 1) return !isSliced(members[0].node);
  if (!sameCursor(sliceStart(members[0].node), { entry: 0, offset: 0 })) return false;
  for (let index = 1; index < members.length; index += 1) {
    const previous = members[index - 1];
    const current = members[index];
    const end = sliceEnd(previous.node);
    if (!end || !sameCursor(end, sliceStart(current.node))) return false;
    // Next to each other: nothing but a page break between them.
    if (current.order !== previous.order + 1) return false;
  }
  return sliceEnd(members[members.length - 1].node) === null;
}

/**
 * The transaction that folds the note lists back into one whole list after
 * `transactions` took `oldState` to `newState`, or null. Pure: exported for
 * tests.
 */
export function buildNoteSliceIntegrity(
  transactions: readonly Transaction[],
  _oldState: EditorState,
  newState: EditorState,
): Transaction | null {
  if (!transactions.some((transaction) => transaction.docChanged)) return null;
  if (transactions.some((transaction) => transaction.getMeta(NOTE_SLICE_INTEGRITY_META) === true)) return null;
  // The ledger makes, moves and joins slices itself, and what other plugins
  // append to its transactions (a new slice's block identity) is part of it.
  const paginators = (transaction: Transaction) => {
    const root = (transaction.getMeta("appendedTransaction") as Transaction | undefined) ?? transaction;
    return root.getMeta(STRUCTURAL_REBALANCE_META) === true || transaction.getMeta(STRUCTURAL_REBALANCE_META) === true;
  };
  if (transactions.every((transaction) => !transaction.docChanged || paginators(transaction))) return null;
  return noteListRepair(newState);
}

/** The transaction that puts the note lists of `state` in shape, or null. */
function noteListRepair(state: EditorState): Transaction | null {
  const members = noteListMembers(state.doc);
  if (members.length === 0) return null;
  const plan = sectionEndnotePlan(state.doc);
  if (plan) {
    if (matchesSectionEndnotePlan(members, plan)) return null;
    return finish(buildSectionEndnoteAreas(state, members, plan));
  }
  if (isOneNoteChain(members)) return null;

  const tr = state.tr;
  const keep = members[storedNoteListIndex(members)];
  // From the end, so earlier positions stay valid.
  deleteMembers(tr, members.filter((member) => member !== keep));
  const keptPos = tr.mapping.map(keep.pos);
  if (isSliced(keep.node)) {
    tr.setNodeMarkup(keptPos, undefined, withSlice(keep.node, null, null), keep.node.marks);
  }
  return finish(tr);
}

function finish(tr: Transaction): Transaction | null {
  if (!tr.docChanged) return null;
  return tr.setMeta(NOTE_SLICE_INTEGRITY_META, true).setMeta("addToHistory", false);
}

/** Delete `members` (in any order), each sheet left without a block with it. */
function deleteMembers(tr: Transaction, members: readonly NoteListMember[]): void {
  for (const member of [...members].sort((a, b) => b.pos - a.pos)) {
    const $pos = tr.doc.resolve(member.pos);
    const parent = $pos.parent;
    if (parent.type.name === PAGE_BLOCK_NODE && parent.childCount === 1 && tr.doc.childCount > 1) {
      // A sheet holds at least one block: its only block gone, so is it.
      const sheetPos = $pos.before($pos.depth);
      tr.delete(sheetPos, sheetPos + parent.nodeSize);
    } else {
      tr.delete(member.pos, member.pos + member.node.nodeSize);
    }
  }
}

function withSlice(node: PmNode, start: number | null, end: number | null): Record<string, unknown> {
  const attrs: Record<string, unknown> = { ...node.attrs };
  for (const key of SLICE_ATTRS) attrs[key] = null;
  attrs[NOTE_SLICE_START_ATTR] = start && start > 0 ? start : null;
  attrs[NOTE_SLICE_END_ATTR] = end;
  return attrs;
}

/**
 * Which of `members` is the stored list: the head of the last run of lists
 * standing next to each other. For the document-end area that is its first
 * slice; with endnotes at the end of each section, the list after the last
 * break (the runs before it are the earlier sections' areas). The storage
 * merge (mergeSplitContinuationsJson) keeps the same one.
 */
export function storedNoteListIndex(members: readonly { order: number }[]): number {
  let head = 0;
  for (let index = 1; index < members.length; index += 1) {
    if (members[index].order !== members[index - 1].order + 1) head = index;
  }
  return head;
}

/** A section's endnote area: the entries [start, end) of the endnote stream,
 * before the section break that is block `breakOrder` of the reading order. */
export interface SectionEndnoteArea {
  breakOrder: number;
  start: number;
  end: number;
}

export interface SectionEndnotePlan {
  /** The areas of the sections before the last break that have endnotes. */
  areas: SectionEndnoteArea[];
  /** The last section's first entry (its area is the stored list). */
  lastStart: number;
  /** The reading-order index of the last section break. */
  lastBreakOrder: number;
}

function readingOrder(doc: PmNode): PmNode[] {
  const blocks: PmNode[] = [];
  doc.forEach((child) => {
    if (child.type.name === PAGE_BLOCK_NODE) child.forEach((block) => blocks.push(block));
    else blocks.push(child);
  });
  return blocks;
}

/**
 * Where each section's endnotes print when the document places endnotes at
 * the end of each section, or null when the one area at the document end is
 * all there is (endnotes at the document end, no section break, no endnote
 * before the last break, or a break the reading order does not reach).
 * Entries are numbered in reference order (numberNoteStreams), so a
 * section's entries are the run its references number.
 */
export function sectionEndnotePlan(doc: PmNode): SectionEndnotePlan | null {
  if (sanitizeNotePosition("endnote", doc.attrs?.endnotePosition) !== "sectEnd") return null;
  const blocks = readingOrder(doc);
  const mode = resolveFootnoteMode(doc.attrs?.footnoteMode);
  const seen = new Set<string>();
  const breakOrders: number[] = [];
  const counts: number[] = [0];
  let nestedBreak = false;
  blocks.forEach((block, order) => {
    if (block.type.name === "sectionBreak") {
      breakOrders.push(order);
      counts.push(0);
      return;
    }
    block.descendants((node) => {
      if (node.type.name === "sectionBreak") nestedBreak = true;
      if (node.type.name !== FOOTNOTE_MARK_NAME) return true;
      const id = sanitizeFootnoteId(node.attrs?.noteId);
      if (id && !seen.has(id)) {
        seen.add(id);
        if (noteStreamOf(id, mode) === "endnote") counts[counts.length - 1] += 1;
      }
      return false;
    });
  });
  if (nestedBreak || breakOrders.length === 0) return null;
  const areas: SectionEndnoteArea[] = [];
  let start = 0;
  breakOrders.forEach((breakOrder, section) => {
    const end = start + counts[section];
    if (end > start) areas.push({ breakOrder, start, end });
    start = end;
  });
  if (areas.length === 0) return null;
  return { areas, lastStart: start, lastBreakOrder: breakOrders[breakOrders.length - 1] };
}

/** Whether `run` is one chain of slices from `start` to `end` (null: open). */
function isChain(run: readonly NoteListMember[], start: number, end: number | null): boolean {
  if (!sameCursor(sliceStart(run[0].node), { entry: start, offset: 0 })) return false;
  for (let index = 1; index < run.length; index += 1) {
    const previous = sliceEnd(run[index - 1].node);
    if (!previous || !sameCursor(previous, sliceStart(run[index].node))) return false;
  }
  const last = sliceEnd(run[run.length - 1].node);
  return end === null ? last === null : last !== null && sameCursor(last, { entry: end, offset: 0 });
}

/** Whether the lists are the plan's areas: a chain right before each break
 * with endnotes before it, and the stored list's chain after the last break. */
export function matchesSectionEndnotePlan(
  members: readonly NoteListMember[],
  plan: SectionEndnotePlan,
): boolean {
  const runs: NoteListMember[][] = [];
  for (const member of members) {
    const run = runs[runs.length - 1];
    if (run && member.order === run[run.length - 1].order + 1) run.push(member);
    else runs.push([member]);
  }
  if (runs.length !== plan.areas.length + 1) return false;
  for (let index = 0; index < plan.areas.length; index += 1) {
    const area = plan.areas[index];
    const run = runs[index];
    if (run[run.length - 1].order + 1 !== area.breakOrder) return false;
    if (!isChain(run, area.start, area.end)) return false;
  }
  const stored = runs[runs.length - 1];
  return stored[0].order > plan.lastBreakOrder && isChain(stored, plan.lastStart, null);
}

/**
 * Lay the lists out as `plan` says: the stored list (moved to the document
 * end when it stands before the last break) draws the last section's
 * entries, and a new list right before each earlier break with endnotes
 * draws that section's. The ledger then cuts each of them across pages.
 */
function buildSectionEndnoteAreas(
  state: EditorState,
  members: readonly NoteListMember[],
  plan: SectionEndnotePlan,
): Transaction {
  const tr = state.tr;
  const index = storedNoteListIndex(members);
  const stored = members[index];
  const keepInPlace = stored.order > plan.lastBreakOrder;
  deleteMembers(tr, keepInPlace ? members.filter((member) => member !== stored) : members);
  const listType = stored.node.type;
  if (keepInPlace) {
    tr.setNodeMarkup(tr.mapping.map(stored.pos), undefined, withSlice(stored.node, plan.lastStart, null), stored.node.marks);
  } else {
    // At the end of the last section: the end of the document's last sheet.
    const last = tr.doc.lastChild;
    const at = last && last.type.name === PAGE_BLOCK_NODE ? tr.doc.content.size - 1 : tr.doc.content.size;
    tr.insert(at, listType.create(withSlice(stored.node, plan.lastStart, null), null, stored.node.marks));
  }
  // Each earlier area before its break, from the last, so earlier positions
  // stay valid. The new lists take a block identity of their own.
  const breakPositions: number[] = [];
  tr.doc.forEach((child, offset) => {
    if (child.type.name === PAGE_BLOCK_NODE) {
      child.forEach((block, blockOffset) => {
        if (block.type.name === "sectionBreak") breakPositions.push(offset + 1 + blockOffset);
      });
    } else if (child.type.name === "sectionBreak") {
      breakPositions.push(offset);
    }
  });
  // The k-th break of the plan is the k-th break still (no break moved).
  const breakOrders: number[] = [];
  readingOrder(state.doc).forEach((block, blockOrder) => {
    if (block.type.name === "sectionBreak") breakOrders.push(blockOrder);
  });
  for (const area of [...plan.areas].reverse()) {
    const pos = breakPositions[breakOrders.indexOf(area.breakOrder)];
    if (pos === undefined) continue;
    tr.insert(pos, listType.create({ ...withSlice(stored.node, area.start, area.end), block_id: null }));
  }
  return tr;
}

export const noteSliceIntegrityKey = new PluginKey("mrnote-note-slice-integrity");

export const NoteSliceIntegrity = Extension.create({
  name: "noteSliceIntegrity",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: noteSliceIntegrityKey,
        appendTransaction: imeReplayingAppendTransaction((transactions, oldState, newState) =>
          buildNoteSliceIntegrity(transactions, oldState, newState),
        ),
        // A document opened with endnotes at the end of each section gets
        // its sections' areas at once: no transaction has run yet.
        view: (view) => {
          let pending = true;
          queueMicrotask(() => {
            if (!pending || view.isDestroyed) return;
            pending = false;
            if (!sectionEndnotePlan(view.state.doc)) return;
            const tr = noteListRepair(view.state);
            if (tr) view.dispatch(trustReadOnlyDocumentMutation(tr, "layout-normalization"));
          });
          return { destroy: () => { pending = false; } };
        },
      }),
    ];
  },
});

export default NoteSliceIntegrity;
