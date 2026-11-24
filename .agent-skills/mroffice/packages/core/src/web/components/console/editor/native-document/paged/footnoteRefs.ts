/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Whether a sheeted document holds a footnote marker, on its own: the page
 * model reads it (pageHollowSheets), and the page model is also built in the
 * page-causal derive worker, where the footnote zones' measuring and the
 * editor's styling (structuralFootnotes and what it imports) cannot load:
 * a module of theirs listening on the window at load stopped the worker
 * before it said it was ready, and every page read waited out its 4 s start
 * deadline, then derived its body on the page's thread.
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { FOOTNOTE_MARK_NAME } from "../footnotes";
import { PAGE_BLOCK_NODE } from "./pageBlockExtension";

/** True when any sheet block carries a footnote marker (cheap pre-gate so
 * note-free documents pay nothing on the rebalance hot path). */
/** Asked several times per page-ledger pass of the same document: one walk
 * of a 7,000-block book per document, not per question. */
const footnoteRefsByDoc = new WeakMap<ProseMirrorNode, boolean>();

export function sheetedDocHasFootnoteRefs(doc: ProseMirrorNode): boolean {
  const known = footnoteRefsByDoc.get(doc);
  if (known !== undefined) return known;
  const found = walkForFootnoteRefs(doc);
  footnoteRefsByDoc.set(doc, found);
  return found;
}

/** Per block (a node is immutable): the page ledger moves blocks between
 * sheets as the same nodes, so a pass's new document is walked only where
 * a block itself changed. Whole-document walks for each of its documents
 * were ~100 ms a dispatch on the 298-page book (the footnote zones). */
const footnoteRefsByBlock = new WeakMap<ProseMirrorNode, boolean>();

function blockHasFootnoteRef(block: ProseMirrorNode): boolean {
  const known = footnoteRefsByBlock.get(block);
  if (known !== undefined) return known;
  let found = block.type.name === FOOTNOTE_MARK_NAME;
  if (!found) {
    block.descendants((node) => {
      if (found) return false;
      if (node.type.name === FOOTNOTE_MARK_NAME) {
        found = true;
        return false;
      }
      return true;
    });
  }
  footnoteRefsByBlock.set(block, found);
  return found;
}

function walkForFootnoteRefs(doc: ProseMirrorNode): boolean {
  let found = false;
  doc.forEach((child) => {
    if (found) return;
    if (child.type.name === PAGE_BLOCK_NODE) {
      child.forEach((block) => {
        if (!found && blockHasFootnoteRef(block)) found = true;
      });
    } else if (blockHasFootnoteRef(child)) found = true;
  });
  return found;
}

/**
 * Whether a document's footnotes leave it to be laid out a window of pages at
 * a time, like any other long document. Continued note rows carry from a page
 * into the next, so a page they are carried into opens with what the page
 * before decided: a scoped pass starts at a page none are carried into and
 * resyncs only at one (ledgerScope's carriedInto), and the planner yields only
 * where it carries none in. Laid out whole instead, R286-D01 took six passes
 * of all 124 pages to settle, each 1-3.5 s of thread.
 * A trial until its pages are compared on documents with continued notes:
 * only with `window.__docsFootnoteProgressive = true`.
 */
export function footnotesAllowProgressiveLayout(doc: ProseMirrorNode, win: Window | null | undefined): boolean {
  if (!sheetedDocHasFootnoteRefs(doc)) return true;
  return (win as (Window & { __docsFootnoteProgressive?: boolean }) | null | undefined)?.__docsFootnoteProgressive === true;
}
