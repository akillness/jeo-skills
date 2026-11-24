/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Where a page or column break typed at the caret goes, as Word puts it
 * (measured in Word 16.86 with Insert ▸ Page Break and InsertBreak):
 *
 *   - in a paragraph: the paragraph is split at the caret and the break sits
 *     between the halves (at the paragraph's start it goes before it);
 *   - in a list item's paragraph: the same split, and the text after the
 *     caret is the NEXT item of the list -- Word's break paragraph carries no
 *     numbering and the half after it is numbered on (1. head / break /
 *     2. tail / 3. ...). The editor keeps that break as the last block of
 *     the head item, which the DOCX writer emits as exactly Word's
 *     paragraphs and the paginator honours; at the item's start the break
 *     ends the item before it (Word: the break paragraph goes above);
 *   - in a table, at any nesting depth: the OUTERMOST table is split above
 *     the row holding the caret and the break goes between the two tables
 *     (in its first row, before the table);
 *   - anything the pages cannot cut around (a text box, a content control)
 *     refuses the break with a reason instead of leaving one that does not
 *     break the page.
 */
import { Fragment, type Node as PmNode, type NodeType } from "@tiptap/pm/model";
import { TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { canSplit } from "@tiptap/pm/transform";

import {
  LIST_ITEM_SPLIT_CONTINUATION_ATTR,
  LIST_ITEM_SPLIT_CONTINUES_ATTR,
} from "./paged/containerSplitting";
import { SPLIT_CONTINUATION_ATTR, SPLIT_CONTINUES_ATTR } from "./paged/paginationProjectionKeys";
import { findOutermostTable, insertBreakSplittingTable } from "./tableStructureExtension";

/** Why a break cannot go where the caret is (toolbar.breakRefused.*). */
export type BreakRefusal = "textBox" | "contentControl" | "container" | "tableRow";

/** Blocks a break may sit in: the paginator cuts these around one. */
const BREAK_CONTAINERS = new Set([
  "pageBlock",
  "bulletList",
  "orderedList",
  "taskList",
  "listItem",
  "taskItem",
  "blockquote",
  "callout",
]);

const LIST_ITEMS = new Set(["listItem", "taskItem"]);

function refusalFor(node: PmNode): BreakRefusal {
  if (node.type.name === "textBox") return "textBox";
  if (node.type.name === "blockContentControl") return "contentControl";
  return "container";
}

/**
 * The reason a break cannot be inserted at the selection, or null when it
 * can. Pure: the command and the toolbar both ask it.
 */
export function breakRefusalAt(state: EditorState): BreakRefusal | null {
  const { $from } = state.selection;
  for (let depth = 1; depth < $from.depth; depth += 1) {
    const node = $from.node(depth);
    // Everything inside the outermost table is left behind: the break goes
    // between the two halves of that table.
    if (node.type.name === "table") return null;
    if (!BREAK_CONTAINERS.has(node.type.name)) return refusalFor(node);
  }
  return null;
}

/** Position at the end of the deepest last item of `item` (at `pos`). */
function itemEndPosition(item: PmNode, pos: number): number {
  let node = item;
  let at = pos;
  for (let guard = 0; guard < 32; guard += 1) {
    const list = node.lastChild;
    if (!list || !/^(bulletList|orderedList|taskList)$/.test(list.type.name) || !list.lastChild) break;
    const listPos = at + node.nodeSize - 1 - list.nodeSize;
    const last = list.lastChild;
    at = listPos + list.nodeSize - 1 - last.nodeSize;
    node = last;
  }
  return at + node.nodeSize - 1;
}

/**
 * After a split, the head half ends where the split is and the tail half
 * starts there: the head no longer runs on to the next page (its runtime
 * "continues" flag passes to the tail) and the tail no longer continues the
 * page before (its "continuation" flag stays with the head). Walks the head's
 * last-child edge and the tail's first-child edge, `depth` levels.
 */
function settleSplitPagination(tr: Transaction, headPos: number, tailPos: number, depth: number): void {
  const flags = (node: PmNode) =>
    LIST_ITEMS.has(node.type.name)
      ? { continues: LIST_ITEM_SPLIT_CONTINUES_ATTR, continuation: LIST_ITEM_SPLIT_CONTINUATION_ATTR }
      : { continues: SPLIT_CONTINUES_ATTR, continuation: SPLIT_CONTINUATION_ATTR };
  const walk = (start: number, edge: "last" | "first") => {
    let pos = start;
    for (let level = 0; level < depth; level += 1) {
      const node = tr.doc.nodeAt(pos);
      if (!node) return;
      const key = edge === "last" ? flags(node).continues : flags(node).continuation;
      if (node.attrs[key] === true) tr.setNodeMarkup(pos, undefined, { ...node.attrs, [key]: false });
      const child = edge === "last" ? node.lastChild : node.firstChild;
      if (!child || child.isText || child.isInline) return;
      pos = edge === "last" ? pos + node.nodeSize - 1 - child.nodeSize : pos + 1;
    }
  };
  walk(headPos, "last");
  walk(tailPos, "first");
}

export type StructuredBreakResult =
  /** Placed where Word puts it; the selection is set. */
  | { kind: "placed" }
  /** A plain paragraph (or quote/callout block): insert at the caret. */
  | { kind: "inline" }
  | { kind: "refused"; reason: BreakRefusal };

/** The document, schema and selection of `tr`, which the placement reads. */
export function transactionState(tr: Transaction): EditorState {
  return { doc: tr.doc, selection: tr.selection, schema: tr.doc.type.schema } as unknown as EditorState;
}

/**
 * Insert `breakNode` in `tr` where Word puts it, reading the caret from
 * `tr` (any selected text is removed first, as typing over it would).
 */
export function insertStructuredBreak(tr: Transaction, breakNode: PmNode): StructuredBreakResult {
  const refusal = breakRefusalAt(transactionState(tr));
  if (refusal) return { kind: "refused", reason: refusal };
  const needsStructure = (state: EditorState) => {
    const { $from } = state.selection;
    if (findOutermostTable(state)) return true;
    return $from.depth >= 3 && $from.parent.isTextblock &&
      LIST_ITEMS.has($from.node($from.depth - 1).type.name) && $from.index($from.depth - 1) === 0;
  };
  if (!needsStructure(transactionState(tr))) return { kind: "inline" };
  if (!tr.selection.empty) tr.deleteSelection();
  const state = transactionState(tr);

  const table = findOutermostTable(state);
  if (table) {
    const { $from } = state.selection;
    const caret = $from.pos;
    // The caret's place in its row of the outer table: the split row opens
    // the second table, so the caret stays in the same cell's text.
    let rowStart: number | null = null;
    for (let depth = 1; depth < $from.depth; depth += 1) {
      if ($from.node(depth) === table.node) {
        rowStart = $from.before(depth + 1);
        break;
      }
    }
    const textBefore = $from.parent.textContent;
    const at = insertBreakSplittingTable(state, tr, table, breakNode);
    if (at === null) return { kind: "refused", reason: "tableRow" };
    const tailTablePos = at.tablePos;
    const tailTable = tr.doc.nodeAt(tailTablePos);
    let target: number | null = null;
    if (rowStart !== null && tailTable?.type.name === "table") {
      const candidate = tailTablePos + 1 + (caret - rowStart);
      if (candidate > tailTablePos && candidate < tailTablePos + tailTable.nodeSize) {
        const $candidate = tr.doc.resolve(candidate);
        if ($candidate.parent.isTextblock && $candidate.parent.textContent === textBefore) target = candidate;
      }
    }
    tr.setSelection(
      target !== null
        ? TextSelection.create(tr.doc, target)
        : TextSelection.near(tr.doc.resolve(tailTablePos), 1),
    );
    return { kind: "placed" };
  }

  const { $from } = state.selection;
  const itemDepth = $from.depth - 1;
  const item = $from.node(itemDepth);
  const listDepth = itemDepth - 1;
  const caret = $from.pos;

  if ($from.parentOffset === 0) {
    // At the item's start the break ends the item before it, or -- for the
    // list's first item -- stands before the list (inside the item that
    // holds a nested list, between its paragraph and that list).
    const itemIndex = $from.index(listDepth);
    const itemPos = $from.before(itemDepth);
    let insertAt: number;
    if (itemIndex > 0) {
      const previous = $from.node(listDepth).child(itemIndex - 1);
      insertAt = itemEndPosition(previous, itemPos - previous.nodeSize);
    } else {
      insertAt = $from.before(listDepth);
    }
    tr.insert(insertAt, breakNode);
    tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(caret, 1)));
    return { kind: "placed" };
  }

  // Split the item at the caret (Enter's split): the tail is the next item.
  const textblock = $from.parent;
  const itemAttrs = item.type.name === "taskItem" ? { ...item.attrs, checked: false } : { ...item.attrs };
  const typesAfter = [
    { type: item.type, attrs: itemAttrs },
    { type: textblock.type, attrs: { ...textblock.attrs } },
  ];
  if (!canSplit(tr.doc, caret, 2, typesAfter)) return { kind: "inline" };
  tr.split(caret, 2, typesAfter);
  // Whatever ran on to the next page runs on from the new item now.
  const headItemPos = $from.before(itemDepth);
  settleSplitPagination(tr, headItemPos, headItemPos + (tr.doc.nodeAt(headItemPos)?.nodeSize ?? 0), 2);
  // `caret` is the head paragraph's end now; one past it, the head item's.
  tr.insert(caret + 1, breakNode);
  // </p></li><li><p> follow the break: the tail paragraph's text starts 3 on.
  const tailStart = caret + 1 + breakNode.nodeSize + 3;
  const $tail = tr.doc.resolve(tailStart);
  tr.setSelection(
    $tail.parent.isTextblock
      ? TextSelection.create(tr.doc, tailStart)
      : TextSelection.near($tail, 1),
  );
  return { kind: "placed" };
}

/**
 * A SECTION break ends its section at a top-level block: Word holds it in
 * the mark of the paragraph that ends the section, and a list item that ends
 * one is the last item of its list (the DOCX import draws the break after
 * the list; measured in Word 16.86, InsertBreak "section break next page"
 * in a list item keeps the head numbered and numbers the tail on). So in a
 * list, quote or callout the container is split at the caret and the break
 * goes between the halves; a numbered list's second half continues the
 * first's numbering. In a table the outermost table is split above the row,
 * as for a page break. A container inside another one (a nested list, a
 * list in a quote) cannot hold a section boundary and refuses it.
 */
export function insertTopLevelBreak(tr: Transaction, breakNode: PmNode): StructuredBreakResult {
  const refusal = breakRefusalAt(transactionState(tr));
  if (refusal) return { kind: "refused", reason: refusal };
  const initial = transactionState(tr).selection.$from;
  // The block holding the caret directly under its sheet (depth 1 is the
  // pageBlock; a doc without sheets holds blocks at depth 1 itself).
  const topDepth = initial.node(1)?.type.name === "pageBlock" ? 2 : 1;
  if (initial.depth <= topDepth) return { kind: "inline" };
  if (!tr.selection.empty) tr.deleteSelection();
  const state = transactionState(tr);
  const { $from } = state.selection;
  const top = $from.node(topDepth);

  const table = findOutermostTable(state);
  if (table) {
    if (table.pos !== $from.before(topDepth)) return { kind: "refused", reason: "container" };
    const at = insertBreakSplittingTable(state, tr, table, breakNode);
    if (at === null) return { kind: "refused", reason: "tableRow" };
    tr.setSelection(TextSelection.near(tr.doc.resolve(at.tablePos), 1));
    return { kind: "placed" };
  }
  if (!$from.parent.isTextblock) return { kind: "refused", reason: "container" };
  const topPos = $from.before(topDepth);
  const isList = /^(bulletList|orderedList|taskList)$/.test(top.type.name);
  // A list item's paragraph, or a block of a quote or callout, directly.
  const textDepth = $from.depth;
  const direct = isList ? textDepth === topDepth + 2 && $from.index(topDepth + 1) === 0 : textDepth === topDepth + 1;
  if (!direct) return { kind: "refused", reason: "container" };
  const childIndex = $from.index(topDepth);
  const caret = $from.pos;
  const atStart = $from.parentOffset === 0;

  let boundary: number;
  let depth: number;
  if (atStart && childIndex === 0) {
    tr.insert(topPos, breakNode);
    tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(caret, 1)));
    return { kind: "placed" };
  }
  if (atStart) {
    // Between the item (or block) before and this one.
    depth = 1;
    tr.split($from.before(topDepth + 1), depth);
    boundary = $from.before(topDepth + 1) + depth;
  } else {
    depth = textDepth - topDepth + 1;
    const typesAfter: Array<{ type: NodeType; attrs: Record<string, unknown> }> = [];
    for (let level = topDepth; level <= textDepth; level += 1) {
      const node = $from.node(level);
      const attrs: Record<string, unknown> = node.type.name === "taskItem" ? { ...node.attrs, checked: false } : { ...node.attrs };
      typesAfter.push({ type: node.type, attrs });
    }
    if (!canSplit(tr.doc, caret, depth, typesAfter)) return { kind: "refused", reason: "container" };
    tr.split(caret, depth, typesAfter);
    boundary = caret + depth;
  }
  settleSplitPagination(tr, topPos, boundary, depth);
  // [head container][tail container]: the break goes between them.
  tr.insert(boundary, breakNode);
  const tailPos = boundary + breakNode.nodeSize;
  const tail = tr.doc.nodeAt(tailPos);
  if (tail?.type.name === "orderedList" && "listContinue" in (tail.type.spec.attrs ?? {})) {
    tr.setNodeMarkup(tailPos, undefined, { ...tail.attrs, listContinue: true, start: tail.type.spec.attrs?.start?.default ?? 1 });
  }
  tr.setSelection(TextSelection.near(tr.doc.resolve(tailPos), 1));
  return { kind: "placed" };
}

/** The node to insert for `kind`, or null when the schema lacks it. */
export function breakNodeOf(state: EditorState, name: string, attrs?: Record<string, unknown>): PmNode | null {
  const type = state.schema.nodes[name];
  if (!type) return null;
  try {
    return type.create(attrs ?? null, Fragment.empty);
  } catch {
    return null;
  }
}

type BreakRefusalListener = (reason: BreakRefusal) => void;
const refusalListeners = new WeakMap<object, Set<BreakRefusalListener>>();

/** A break command refused to run: the toolbar says why (never silent). */
export function reportBreakRefusal(editor: object, reason: BreakRefusal): void {
  for (const listener of refusalListeners.get(editor) ?? []) {
    try {
      listener(reason);
    } catch {
      // A listener's failure must not turn a refused command into a throw.
    }
  }
}

export function subscribeBreakRefusal(editor: object, listener: BreakRefusalListener): () => void {
  let listeners = refusalListeners.get(editor);
  if (!listeners) {
    listeners = new Set();
    refusalListeners.set(editor, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners?.delete(listener);
  };
}
