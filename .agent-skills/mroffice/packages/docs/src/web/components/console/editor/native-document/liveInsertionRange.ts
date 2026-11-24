/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Editor } from "@tiptap/core";
import type { Fragment, Node as PmNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";

/**
 * Where an insertion that waits for something (a file picker, an upload, a
 * capture, a dialog) goes in, kept on its place in the text while the
 * document changes under it.
 *
 * A step's own mapping is not enough: a co-author's edit reaches this view
 * from the collaborative room as the whole paragraph it touched replaced
 * (PagedDocumentBridge.fitChangedBlocks), and pagination moves a paragraph to
 * another sheet as a delete and an insert. A position inside such a block is
 * "deleted" by the step and mapped to the block's edge, so a file chosen
 * after a peer typed "REMOTE " before the caret went in at the caret's old
 * offset, splitting the word there (WUA 232). The text around the position
 * says where it is instead: what changed before it moves it, what changed
 * after it does not.
 */

export interface InsertionRange {
  readonly from: number;
  readonly to: number;
}

/** `start`, and the old / new end of the region where two fragments differ. */
function differingRegion(
  before: Fragment,
  after: Fragment,
): { start: number; endA: number; endB: number } | null {
  const start = before.findDiffStart(after);
  if (start === null) return null;
  const end = before.findDiffEnd(after);
  if (!end) return null;
  let { a: endA, b: endB } = end;
  // As ProseMirror's own diff: a repeated run makes the two ends overlap.
  const overlap = Math.max(0, start - Math.min(endA, endB));
  endA += overlap;
  endB += overlap;
  return { start, endA, endB };
}

/** `offset` in `before` read again in `after`, by the text around it. */
function offsetAcross(before: Fragment, after: Fragment, offset: number): number {
  const region = differingRegion(before, after);
  if (!region || offset <= region.start) return offset;
  if (offset >= region.endA) return offset + (region.endB - region.endA);
  // Inside text the change replaced: after what replaced it.
  return region.endB;
}

/** The textblock `pos` is in, found again in `after` by its block id. */
function sameTextblockPosition(before: PmNode, after: PmNode, pos: number): number | null {
  const $pos = before.resolve(pos);
  if (!$pos.parent.isTextblock) return null;
  const id = $pos.parent.attrs.block_id;
  if (typeof id !== "string" || !id) return null;
  let found: { node: PmNode; pos: number } | null = null;
  after.descendants((node, at) => {
    if (found) return false;
    if (node.isTextblock) {
      if (node.attrs.block_id === id) found = { node, pos: at };
      return false;
    }
    return true;
  });
  if (!found) return null;
  const { node, pos: at } = found as { node: PmNode; pos: number };
  const offset = offsetAcross($pos.parent.content, node.content, $pos.parentOffset);
  return at + 1 + Math.min(offset, node.content.size);
}

/**
 * `pos` through one transaction, keeping its place in the text when a step
 * replaced the block around it (see the module note).
 */
export function mapPositionThroughTransaction(
  transaction: Transaction,
  pos: number,
  assoc: -1 | 1 = 1,
): number {
  const mapped = transaction.mapping.mapResult(pos, assoc);
  if (!mapped.deleted) return mapped.pos;
  const before = transaction.before;
  const after = transaction.doc;
  if (pos < 0 || pos > before.content.size) return mapped.pos;
  const region = differingRegion(before.content, after.content);
  if (!region) return Math.min(pos, after.content.size);
  if (pos <= region.start) return pos;
  if (pos >= region.endA) return pos + (region.endB - region.endA);
  return sameTextblockPosition(before, after, pos) ?? mapped.pos;
}

/** A range through one transaction: a selection keeps covering what took
 * its place (its ends map outward), a caret stays a caret. */
export function mapInsertionRangeThroughTransaction(
  transaction: Transaction,
  range: InsertionRange,
): InsertionRange {
  const selected = range.from < range.to;
  const from = mapPositionThroughTransaction(transaction, range.from, selected ? -1 : 1);
  const to = selected
    ? Math.max(from, mapPositionThroughTransaction(transaction, range.to, 1))
    : from;
  return { from, to };
}

export interface LiveInsertionRange {
  /** The range now, or null when it no longer fits the document. */
  current(): InsertionRange | null;
  /** Stop following the document (idempotent). */
  release(): void;
}

/**
 * Follow `range` through every change the editor takes until `release`
 * (or until the editor is destroyed).
 */
export function trackInsertionRange(editor: Editor, range: InsertionRange): LiveInsertionRange {
  let live: InsertionRange | null = { from: range.from, to: range.to };
  let released = false;
  const onTransaction = ({
    transaction,
    appendedTransactions,
  }: {
    transaction: Transaction;
    appendedTransactions?: readonly Transaction[];
  }) => {
    if (!live) return;
    for (const step of [transaction, ...(appendedTransactions ?? [])]) {
      if (!step.docChanged || !live) continue;
      live = mapInsertionRangeThroughTransaction(step, live);
      if (live.to > step.doc.content.size) live = null;
    }
  };
  const release = () => {
    if (released) return;
    released = true;
    live = null;
    editor.off("transaction", onTransaction);
    editor.off("destroy", release);
  };
  editor.on("transaction", onTransaction);
  editor.on("destroy", release);
  return {
    current: () => {
      if (!live || editor.isDestroyed) return null;
      const size = editor.state.doc.content.size;
      return live.to <= size ? live : null;
    },
    release,
  };
}
