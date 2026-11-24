/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Node as PmNode } from "@tiptap/pm/model";
import { joinPieces } from "./pieceJoin";
import { TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";

import {
  LIST_ITEM_SPLIT_CONTINUATION_ATTR,
  LIST_ITEM_SPLIT_CONTINUES_ATTR,
} from "./containerSplitting";
import {
  PAGE_BLOCK_NODE,
  SPLIT_CONTINUATION_ATTR,
  SPLIT_CONTINUES_ATTR,
} from "./paginationProjectionKeys";

/**
 * Backspace at the top of a page, the way Word does it.
 *
 * Word has no page objects: a page is where the text happened to wrap, so
 * Backspace at the start of a page deletes whatever sits just before the
 * caret in the text (Microsoft Support, "Remove a page break", "Delete a
 * section break", "Delete a blank page"):
 * - the previous paragraph's mark: the paragraph joins the one ending the
 *   previous page and its text flows up;
 * - an empty paragraph ending the previous page: it goes, so a page made of
 *   empty paragraphs shrinks one line per press until it disappears;
 * - a manual page break: the break goes and the text below moves up;
 * - a section break: the break goes and the combined section keeps the
 *   formatting of the section that FOLLOWED it (SectionBreak's own keymap
 *   does this, with the ordered section layouts);
 * - when the page starts in the middle of a paragraph Word split across the
 *   pages: the last character on the previous page.
 *
 * Here pages are real `pageBlock` wrappers, so ProseMirror's joinBackward
 * found its cut BETWEEN the two pages and only joined the wrappers; the
 * paginator then split them again on the next frame and the key did nothing.
 * This plan removes the page boundary instead: a split paragraph loses its
 * last character, a manual page break is deleted, and otherwise the two pages
 * (and every container the paginator cut in two across them) are joined so
 * the caret's block directly follows the previous page's last block — then
 * the editor's ordinary Backspace chain runs on that state, exactly as on the
 * same page. The paginator re-flows the result on the next frame.
 */
export type PageStartBackspacePlan =
  /** Not at the top of a later page, or someone else owns the key. */
  | { readonly kind: "none" }
  /** Word's answer is fully in this transaction; consume the key. */
  | { readonly kind: "handled"; readonly tr: Transaction }
  /** The page boundary is gone; let the ordinary Backspace chain run. */
  | { readonly kind: "merged"; readonly tr: Transaction };

const NONE: PageStartBackspacePlan = { kind: "none" };

/** Text blocks the paginator cuts at a soft wrap (plain partition). */
const WRAP_SPLIT_TEXTBLOCKS = new Set(["paragraph", "heading"]);
/** Code blocks are cut between lines; the cut consumed the newline. */
const LINE_SPLIT_TEXTBLOCK = "codeBlock";

function flag(node: PmNode, name: string): boolean {
  return (node.attrs as Record<string, unknown> | undefined)?.[name] === true;
}

function continuesInto(left: PmNode, right: PmNode): boolean {
  if (left.type !== right.type) return false;
  if (flag(left, SPLIT_CONTINUES_ATTR) && flag(right, SPLIT_CONTINUATION_ATTR)) {
    return true;
  }
  return (
    flag(left, LIST_ITEM_SPLIT_CONTINUES_ATTR) &&
    flag(right, LIST_ITEM_SPLIT_CONTINUATION_ATTR)
  );
}

/** UTF-16 length of the last user-perceived character of `text`. */
export function lastGraphemeLength(text: string): number {
  if (!text) return 0;
  const tail = text.slice(-16);
  const Segmenter = (Intl as unknown as {
    Segmenter?: new (
      locale?: string,
      options?: { granularity: "grapheme" },
    ) => { segment(input: string): Iterable<{ segment: string }> };
  }).Segmenter;
  if (Segmenter) {
    let last = "";
    for (const part of new Segmenter(undefined, { granularity: "grapheme" }).segment(tail)) {
      last = part.segment;
    }
    if (last) return last.length;
  }
  const code = tail.charCodeAt(tail.length - 1);
  return code >= 0xdc00 && code <= 0xdfff && tail.length > 1 ? 2 : 1;
}

/** The attrs a merged split pair keeps: the head's, continuing only if the
 * tail itself continued onto a further page. */
function mergedPairAttrs(left: PmNode, right: PmNode): Record<string, unknown> {
  const attrs: Record<string, unknown> = { ...left.attrs };
  for (const [continues, continuation] of [
    [SPLIT_CONTINUES_ATTR, SPLIT_CONTINUATION_ATTR],
    [LIST_ITEM_SPLIT_CONTINUES_ATTR, LIST_ITEM_SPLIT_CONTINUATION_ATTR],
  ] as const) {
    if (continues in attrs) attrs[continues] = flag(right, continues);
    if (continuation in attrs) attrs[continuation] = flag(left, continuation);
  }
  return attrs;
}

export function planPageStartBackspace(state: EditorState): PageStartBackspacePlan {
  const { selection, doc } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return NONE;
  const $from = selection.$from;
  if ($from.parentOffset > 0 || !$from.parent.isTextblock) return NONE;
  if ($from.depth < 2 || $from.node(1).type.name !== PAGE_BLOCK_NODE) return NONE;
  // At the very top of the page: every ancestor inside the page is a first
  // child. Any earlier sibling means an ordinary cut inside the page.
  for (let depth = $from.depth - 1; depth >= 1; depth -= 1) {
    if ($from.index(depth) > 0) return NONE;
  }
  const pageIndex = $from.index(0);
  if (pageIndex === 0) return NONE;
  const previousPage = doc.child(pageIndex - 1);
  if (previousPage.type.name !== PAGE_BLOCK_NODE) return NONE;
  // A table cell never joins backwards across its own edge (Word).
  for (let depth = $from.depth - 1; depth >= 2; depth -= 1) {
    const role = $from.node(depth).type.spec.tableRole;
    if (role === "cell" || role === "header_cell" || role === "table") return NONE;
  }

  const pageBoundary = $from.before(1);
  // Walk down both sides of the boundary: the previous page's trailing chain
  // against the caret's leading chain, while the paginator's split pairs line
  // up. `boundary` is the position between the left and right node at the
  // current depth once every outer pair has been joined.
  // The previous page's trailing chain: leftChain[level] meets $from.node(level).
  const leftChain: (PmNode | null)[] = [null, previousPage];
  const leftAt = (level: number) => leftChain[level] ?? null;
  const rightAt = (level: number) => (level <= $from.depth ? $from.node(level) : null);
  let left: PmNode | null = previousPage;
  let pairedDepth = 1; // the pages themselves always join
  for (let depth = 2; depth <= $from.depth; depth += 1) {
    const leftChild: PmNode | null = left?.lastChild ?? null;
    const right = $from.node(depth);
    if (!leftChild) break;
    leftChain[depth] = leftChild;
    const boundary = pageBoundary - (depth - 1);
    if (depth === 2 && leftChild.type.name === "sectionBreak") {
      // SectionBreak's own Backspace deletes it with Word's layout rule.
      return NONE;
    }
    if (depth === 2 && leftChild.type.name === "pageBreak") {
      const tr = state.tr;
      if (previousPage.childCount === 1) {
        tr.delete(pageBoundary - previousPage.nodeSize, pageBoundary);
      } else {
        tr.delete(pageBoundary - 1 - leftChild.nodeSize, pageBoundary - 1);
      }
      return { kind: "handled", tr: tr.scrollIntoView() };
    }
    if (!continuesInto(leftChild, right)) break;
    if (right.isTextblock) {
      if (depth !== $from.depth) break;
      if (WRAP_SPLIT_TEXTBLOCKS.has(right.type.name)) {
        // The page starts inside a paragraph: delete the character before
        // the caret, the last one on the previous page. The paginator then
        // pulls the text back across the boundary.
        const contentEnd = boundary - 1;
        const last = leftChild.lastChild;
        if (!last) break;
        const size = last.isText ? lastGraphemeLength(last.text ?? "") : last.nodeSize;
        if (size <= 0) break;
        const tr = state.tr.delete(contentEnd - size, contentEnd);
        return { kind: "handled", tr: tr.scrollIntoView() };
      }
      if (right.type.name === LINE_SPLIT_TEXTBLOCK) {
        // A code block cut between lines: the character before the caret is
        // the newline the cut consumed, so deleting it joins the two lines.
        const tr = joinLevels(state, pageBoundary, depth, leftAt, rightAt);
        return { kind: "handled", tr: tr.scrollIntoView() };
      }
      break;
    }
    pairedDepth = depth;
    left = leftChild;
  }
  const tr = joinLevels(state, pageBoundary, pairedDepth, leftAt, rightAt);
  return { kind: "merged", tr };
}

/** UTF-16 length of the first user-perceived character of `text`. */
export function firstGraphemeLength(text: string): number {
  if (!text) return 0;
  const head = text.slice(0, 16);
  const Segmenter = (Intl as unknown as {
    Segmenter?: new (
      locale?: string,
      options?: { granularity: "grapheme" },
    ) => { segment(input: string): Iterable<{ segment: string }> };
  }).Segmenter;
  if (Segmenter) {
    for (const part of new Segmenter(undefined, { granularity: "grapheme" }).segment(head)) {
      return part.segment.length;
    }
  }
  const code = head.charCodeAt(0);
  return code >= 0xd800 && code <= 0xdbff && head.length > 1 ? 2 : 1;
}

/**
 * Delete at the end of a page, the mirror of {@link planPageStartBackspace}:
 * Word deletes what follows the caret in the text — this paragraph's mark
 * (the next page's first paragraph joins it), or, when the paragraph runs on
 * across the page, the first character on the next page. A break ending
 * this page sits before the caret's paragraph end, so it is an ordinary
 * same-page Delete; a section break keeps SectionBreak's own keymap.
 */
export function planPageEndDelete(state: EditorState): PageStartBackspacePlan {
  const { selection, doc } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return NONE;
  const $from = selection.$from;
  if (!$from.parent.isTextblock || $from.parentOffset < $from.parent.content.size) return NONE;
  if ($from.depth < 2 || $from.node(1).type.name !== PAGE_BLOCK_NODE) return NONE;
  // At the very end of the page: every ancestor inside it is a last child.
  for (let depth = $from.depth - 1; depth >= 1; depth -= 1) {
    if ($from.index(depth) < $from.node(depth).childCount - 1) return NONE;
  }
  const pageIndex = $from.index(0);
  if (pageIndex >= doc.childCount - 1) return NONE;
  const nextPage = doc.child(pageIndex + 1);
  if (nextPage.type.name !== PAGE_BLOCK_NODE) return NONE;
  for (let depth = $from.depth - 1; depth >= 2; depth -= 1) {
    const role = $from.node(depth).type.spec.tableRole;
    if (role === "cell" || role === "header_cell" || role === "table") return NONE;
  }

  const pageBoundary = $from.after(1);
  const rightChain: (PmNode | null)[] = [null, nextPage];
  const leftAt = (level: number) => (level <= $from.depth ? $from.node(level) : null);
  const rightAt = (level: number) => rightChain[level] ?? null;
  let right: PmNode | null = nextPage;
  let pairedDepth = 1;
  for (let depth = 2; depth <= $from.depth; depth += 1) {
    const left = $from.node(depth);
    const rightChild: PmNode | null = right?.firstChild ?? null;
    if (!rightChild) break;
    rightChain[depth] = rightChild;
    if (depth === 2 && rightChild.type.name === "sectionBreak") return NONE;
    if (!continuesInto(left, rightChild)) break;
    if (left.isTextblock) {
      if (depth !== $from.depth) break;
      if (WRAP_SPLIT_TEXTBLOCKS.has(left.type.name)) {
        // The paragraph runs on across the page: delete the character after
        // the caret, the first one on the next page.
        const contentStart = pageBoundary + depth;
        const first = rightChild.firstChild;
        if (!first) break;
        const size = first.isText ? firstGraphemeLength(first.text ?? "") : first.nodeSize;
        if (size <= 0) break;
        const tr = state.tr.delete(contentStart, contentStart + size);
        return { kind: "handled", tr: tr.scrollIntoView() };
      }
      if (left.type.name === LINE_SPLIT_TEXTBLOCK) {
        const tr = joinLevels(state, pageBoundary, depth, leftAt, rightAt);
        return { kind: "handled", tr: tr.scrollIntoView() };
      }
      break;
    }
    pairedDepth = depth;
    right = rightChild;
  }
  const tr = joinLevels(state, pageBoundary, pairedDepth, leftAt, rightAt);
  return { kind: "merged", tr };
}

/**
 * Join the two pages and then each split container pair below them, down to
 * `depth` (1 = the pages only). `leftAt(level)` / `rightAt(level)` name the
 * pair meeting at that level. Joins run outermost first; a join never moves
 * positions before it, so every left node keeps its start and the gap at
 * `level` sits at `pageBoundary - (level - 1)`.
 */
function joinLevels(
  state: EditorState,
  pageBoundary: number,
  depth: number,
  leftAt: (level: number) => PmNode | null,
  rightAt: (level: number) => PmNode | null,
): Transaction {
  const tr = state.tr;
  for (let level = 1; level <= depth; level += 1) {
    const boundary = pageBoundary - (level - 1);
    const left = leftAt(level);
    const right = rightAt(level);
    if (!left || !right) break;
    joinPieces(tr, boundary);
    if (level > 1) {
      tr.setNodeMarkup(boundary - left.nodeSize, undefined, mergedPairAttrs(left, right));
    }
  }
  return tr;
}
