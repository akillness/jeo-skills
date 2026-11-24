/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Selection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import type { EditorView } from "@tiptap/pm/view";

import {
  isBlockObjectBoundary,
  selectionBetweenEdges,
} from "@mrnote/core/web/components/console/editor/extensions/equationBoundarySelection.ts";

/** The atoms a drag selection takes whole, like a character of the line. */
export const SELECTION_ATOM_NODE_NAMES: ReadonlySet<string> = new Set([
  "mathBlock",
  "inlineMath",
  "image",
  "inlineImage",
  "chart",
  "inlineChart",
  "documentShape",
  "inlineDocumentShape",
]);

export function isSelectionAtom(
  node: ProseMirrorNode | null | undefined,
): node is ProseMirrorNode {
  return Boolean(node && SELECTION_ATOM_NODE_NAMES.has(node.type.name));
}

export interface SelectionAtom {
  readonly pos: number;
  readonly node: ProseMirrorNode;
}

/**
 * `pos` itself when it is a text position, else the nearest one toward `dir`.
 */
function textPositionNear(
  doc: ProseMirrorNode,
  pos: number,
  dir: -1 | 1,
): number {
  const $pos = doc.resolve(pos);
  if ($pos.parent.inlineContent) return pos;
  const near =
    Selection.findFrom($pos, dir, true) ?? Selection.findFrom($pos, -dir, true);
  return near ? near.head : pos;
}

/**
 * Where a selection end at `pos` goes, looking toward `dir`: `pos` itself in
 * text; the edge of the line of text right there; the boundary itself beside
 * a block object with no text on that side (Word's paragraph mark of the
 * object's own line); else the nearest text position.
 */
export function selectionEdgeNear(
  doc: ProseMirrorNode,
  pos: number,
  dir: -1 | 1,
): number {
  const $pos = doc.resolve(pos);
  if ($pos.parent.inlineContent) return pos;
  const toward = dir > 0 ? $pos.nodeAfter : $pos.nodeBefore;
  if (toward?.isTextblock) return dir > 0 ? pos + 1 : pos - 1;
  if (isBlockObjectBoundary($pos)) return pos;
  return textPositionNear(doc, pos, dir);
}

/**
 * The selection from `anchor` past the far side of `atom`, as seen from the
 * anchor: the whole object is always inside it. `null` when it would hold
 * nothing.
 */
export function selectionAcrossAtom(
  doc: ProseMirrorNode,
  anchor: number,
  atom: SelectionAtom,
): Selection | null {
  const start = atom.pos;
  const end = start + atom.node.nodeSize;
  const forward = anchor <= start;
  const head = forward
    ? selectionEdgeNear(doc, end, 1)
    : selectionEdgeNear(doc, start, -1);
  if (head === anchor) return null;
  return selectionBetweenEdges(doc, anchor, head);
}

/** Whether a drawn object floats over the text (any wrap but In Line). */
function isFloatingObjectDom(dom: Element): boolean {
  if (dom.hasAttribute("data-float-mode")) return true;
  const shape = dom.matches("[data-document-shape]")
    ? dom
    : dom.querySelector(":scope > [data-document-shape]");
  return Boolean(shape?.hasAttribute("data-float-mode"));
}

/**
 * The in-line object whose own node view holds `element`, if any. An
 * equation being edited is not one (its field selects inside itself), and a
 * floating object is not one (the drag goes on to the text beneath it).
 */
export function selectionAtomOfElement(
  view: EditorView,
  element: Element | null,
): SelectionAtom | null {
  for (
    let current: Element | null = element;
    current && current !== view.dom && view.dom.contains(current);
    current = current.parentElement
  ) {
    if (!("pmViewDesc" in current)) continue;
    let pos: number;
    try {
      pos = view.posAtDOM(current, 0);
    } catch {
      continue;
    }
    for (const candidate of [pos, pos - 1]) {
      if (candidate < 0) continue;
      const node = view.state.doc.nodeAt(candidate);
      if (!isSelectionAtom(node) || view.nodeDOM(candidate) !== current) continue;
      if (current.getAttribute("data-editing") === "true") return null;
      if (isFloatingObjectDom(current)) return null;
      return { pos: candidate, node };
    }
  }
  return null;
}

/**
 * The selection end a drag from outside a table makes with the pointer in
 * one of its rows: Word takes whole rows, up to the row under the pointer.
 * The end is the far edge of that row's text; a row whose far cell has no
 * text to end in takes the whole table instead (a text selection may not end
 * on an empty cell's edge without collapsing).
 */
export function tableRowDragHead(
  doc: ProseMirrorNode,
  anchor: number,
  cellPos: number,
): number | null {
  const $cell = doc.resolve(cellPos);
  let tableDepth = -1;
  let rowDepth = -1;
  for (let depth = $cell.depth; depth > 0; depth -= 1) {
    const role = $cell.node(depth).type.spec.tableRole;
    if (role === "row" && rowDepth < 0) rowDepth = depth;
    if (role === "table") {
      tableDepth = depth;
      break;
    }
  }
  if (tableDepth < 0 || rowDepth < 0) return null;
  const tableStart = $cell.before(tableDepth);
  const tableEnd = $cell.after(tableDepth);
  // A drag that began inside this table is the table's own (cell selection).
  if (anchor > tableStart && anchor < tableEnd) return null;
  const forward = anchor <= tableStart;
  const rowStart = $cell.before(rowDepth);
  const rowEnd = $cell.after(rowDepth);
  const inRow = forward
    ? Selection.findFrom(doc.resolve(rowEnd), -1, true)
    : Selection.findFrom(doc.resolve(rowStart), 1, true);
  const head = inRow?.head;
  const usable =
    typeof head === "number" &&
    head > rowStart &&
    head < rowEnd &&
    (forward ? doc.resolve(head).parentOffset > 0 : doc.resolve(anchor).parentOffset > 0);
  if (usable) return head;
  return forward
    ? selectionEdgeNear(doc, tableEnd, 1)
    : selectionEdgeNear(doc, tableStart, -1);
}

/**
 * Where a drag that began inside a table keeps its anchor once the pointer
 * has left that table: Word takes whole rows, from the anchor's row outward,
 * so the anchor moves to that row's first text (dragging down) or last text
 * (dragging up). `null` while the head is still inside the anchor's table,
 * or when the anchor is in no table.
 */
export function tableRowAnchorOutward(
  doc: ProseMirrorNode,
  anchor: number,
  head: number,
): number | null {
  const $anchor = doc.resolve(anchor);
  let tableDepth = -1;
  let rowDepth = -1;
  for (let depth = $anchor.depth; depth > 0; depth -= 1) {
    const role = $anchor.node(depth).type.spec.tableRole;
    if (role === "row" && rowDepth < 0) rowDepth = depth;
    if (role === "table") {
      tableDepth = depth;
      break;
    }
  }
  if (tableDepth < 0 || rowDepth < 0) return null;
  const tableStart = $anchor.before(tableDepth);
  const tableEnd = $anchor.after(tableDepth);
  if (head > tableStart && head < tableEnd) return null;
  const forward = head >= tableEnd;
  const edge = forward
    ? Selection.findFrom(doc.resolve($anchor.before(rowDepth)), 1, true)
    : Selection.findFrom(doc.resolve($anchor.after(rowDepth)), -1, true);
  return edge ? edge.head : null;
}

/** The table cell `pos` is in (its position) and that cell's table. */
function cellAround(
  doc: ProseMirrorNode,
  pos: number,
): { pos: number; table: number } | null {
  const $pos = doc.resolve(pos);
  let cell = -1;
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const role = $pos.node(depth).type.spec.tableRole;
    if (cell < 0 && (role === "cell" || role === "header_cell")) cell = $pos.before(depth);
    if (role === "table") return cell < 0 ? null : { pos: cell, table: $pos.before(depth) };
  }
  return null;
}

export interface DragSelectionResolution {
  /** The selection to show; `null` keeps an insertion point at the anchor. */
  readonly selection: Selection | null;
  /**
   * Whether the browser cannot make this selection itself (the pointer is on
   * an object, a table reached from outside, or the boundary beside an
   * object). Once a drag needs this, the document makes its selection for
   * the rest of the drag.
   */
  readonly needsDocument: boolean;
  /** The object under the pointer, if any. */
  readonly atom: SelectionAtom | null;
}

/**
 * The selection a drag anchored at `anchor` makes with the pointer at
 * (`x`, `y`).
 */
export function resolveDragSelection(
  view: EditorView,
  anchor: number,
  x: number,
  y: number,
): DragSelectionResolution | null {
  const { doc } = view.state;
  // The selection from the anchor to `head`; a drag that began in a table and
  // left it takes whole rows from the anchor's row (and is the document's).
  const toward = (
    head: number,
    needsDocument: boolean,
    atom: SelectionAtom | null,
  ): DragSelectionResolution => {
    const rowAnchor = tableRowAnchorOutward(doc, anchor, head);
    // Back inside the table the drag began in: that table's own cell
    // selection, as the table makes it.
    const anchorCell = rowAnchor === null ? cellAround(doc, anchor) : null;
    const headCell = anchorCell ? cellAround(doc, head) : null;
    if (anchorCell && headCell && anchorCell.table === headCell.table) {
      return {
        selection:
          anchorCell.pos === headCell.pos
            ? selectionBetweenEdges(doc, anchor, head)
            : CellSelection.create(doc, anchorCell.pos, headCell.pos),
        needsDocument: false,
        atom,
      };
    }
    const from = rowAnchor ?? anchor;
    return {
      selection: head === from ? null : selectionBetweenEdges(doc, from, head),
      needsDocument: needsDocument || rowAnchor !== null,
      atom,
    };
  };
  const element = view.dom.ownerDocument.elementFromPoint(x, y);
  const atom = selectionAtomOfElement(view, element);
  if (atom) {
    const end = atom.pos + atom.node.nodeSize;
    const head =
      anchor <= atom.pos
        ? selectionEdgeNear(doc, end, 1)
        : selectionEdgeNear(doc, atom.pos, -1);
    return toward(head, true, atom);
  }
  const cell = element?.closest("td, th");
  if (cell && view.dom.contains(cell)) {
    let cellPos: number | null = null;
    try {
      cellPos = view.posAtDOM(cell, 0);
    } catch {
      cellPos = null;
    }
    const head = cellPos === null ? null : tableRowDragHead(doc, anchor, cellPos);
    if (head !== null) return toward(head, true, null);
  }
  const hit = view.posAtCoords({ left: x, top: y });
  if (!hit) return null;
  const inside = hit.inside >= 0 ? doc.nodeAt(hit.inside) : null;
  if (isSelectionAtom(inside)) {
    const dom = view.nodeDOM(hit.inside);
    if (!(dom instanceof Element) || !isFloatingObjectDom(dom)) {
      const near = { pos: hit.inside, node: inside };
      const end = near.pos + near.node.nodeSize;
      const head =
        anchor <= near.pos
          ? selectionEdgeNear(doc, end, 1)
          : selectionEdgeNear(doc, near.pos, -1);
      return toward(head, true, near);
    }
  }
  const $hit = doc.resolve(hit.pos);
  if ($hit.parent.inlineContent) {
    return toward(pointerOnLine(view, hit.pos, x, y).pos, false, null);
  }
  // Off the lines inside a block that holds them (a cell's empty space, a
  // quote's padding): that block's nearest line, never past it.
  if (!PAGE_LEVEL_CONTAINERS.has($hit.parent.type.name)) {
    const beside = textPositionBesideLines(view, hit.pos, x, y);
    if (beside !== null) return toward(beside, false, null);
  }
  const dir: -1 | 1 = hit.pos >= anchor ? 1 : -1;
  return toward(selectionEdgeNear(doc, hit.pos, dir), isBlockObjectBoundary($hit), null);
}

/**
 * A text position `pos` the pointer at (`x`, `y`) resolved to, checked
 * against the line it is on: a pointer above or below that line (in the
 * paragraph's spacing, under its last line) is moved onto the line at the
 * pointer's x, as Word places the insertion point. WebKit resolves such a
 * pointer to the paragraph's end whatever its x, and its own drag from
 * there does not survive (`offLine`).
 */
export function pointerOnLine(
  view: EditorView,
  pos: number,
  x: number,
  y: number,
): { readonly pos: number; readonly offLine: boolean } {
  let box: { top: number; bottom: number };
  try {
    box = view.coordsAtPos(pos);
  } catch {
    return { pos, offLine: false };
  }
  if (y >= box.top - 2 && y <= box.bottom + 2) return { pos, offLine: false };
  const lineY = Math.min(Math.max(y, box.top + 1), box.bottom - 1);
  const onLine = view.posAtCoords({ left: x, top: lineY });
  const { doc } = view.state;
  if (!onLine || doc.resolve(onLine.pos).parent !== doc.resolve(pos).parent) {
    return { pos, offLine: true };
  }
  return { pos: onLine.pos, offLine: true };
}

/** The page's own block containers: the paper between their blocks. */
export const PAGE_LEVEL_CONTAINERS: ReadonlySet<string> = new Set([
  "doc",
  "pageBlock",
]);

/**
 * The text position for a pointer OFF the lines of text (a table cell's
 * empty space under its last line, a quote's or a list item's padding, the
 * paper between two paragraphs): on the line of the block the pointer is in
 * that is nearest to it, at the pointer's x, as Word places the insertion
 * point. Never past that cell or block. `null` when that block holds no
 * text, or when `pos` is already a text position.
 */
export function textPositionBesideLines(
  view: EditorView,
  pos: number,
  x: number,
  y: number,
): number | null {
  const { doc } = view.state;
  const $pos = doc.resolve(pos);
  if ($pos.parent.inlineContent) return null;
  const start = $pos.start();
  const end = $pos.end();
  let best: { head: number; distance: number; mid: number } | null = null;
  for (const dir of [-1, 1] as const) {
    const found = Selection.findFrom($pos, dir, true);
    if (!found || found.head < start || found.head > end) continue;
    let distance = Number.POSITIVE_INFINITY;
    let mid = y;
    try {
      const box = view.coordsAtPos(found.head, dir);
      distance = y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0;
      mid = (box.top + box.bottom) / 2;
    } catch {
      // Not drawn: the other side wins if it is.
    }
    if (!best || distance < best.distance) best = { head: found.head, distance, mid };
  }
  if (!best) return null;
  // That line, at the pointer's x.
  const onLine = view.posAtCoords({ left: x, top: best.mid });
  if (onLine) {
    const $line = doc.resolve(onLine.pos);
    const $best = doc.resolve(best.head);
    if ($line.parent.inlineContent && $line.parent === $best.parent) return onLine.pos;
  }
  return best.head;
}

/**
 * The block object whose own line a press beside it landed on, and the side
 * of it: Word puts the insertion point on that side of the object (its
 * paragraph's start or end), and a drag from there selects from that side.
 * `null` for a press anywhere else.
 */
export function blockObjectBesidePress(
  view: EditorView,
  target: Element,
  x: number,
  y: number,
): { atom: SelectionAtom; side: "before" | "after"; level: boolean } | null {
  const own = selectionAtomOfElement(view, target);
  if (own) {
    // The object itself (its drawing) is pressed to select or move it; the
    // rest of its node view (its line beside it, its margin) is beside it.
    if (own.node.isInline) return null;
    const dom = view.nodeDOM(own.pos);
    const box = dom instanceof Element ? drawnBox(dom) : null;
    const side = box ? sideOfBox(box, x, y) : null;
    return side && box ? { atom: own, side, level: isLevel(box, y) } : null;
  }
  const { doc } = view.state;
  // Below the paper's last page there is no position under the pointer: that
  // is the end of the document, after its last block.
  const hit = view.posAtCoords({ left: x, top: y }) ?? endOfDocumentBelow(view, y);
  if (!hit) return null;
  // The block object the browser put the point in, the press being beside,
  // below or above its drawing.
  const inside = hit.inside >= 0 ? doc.nodeAt(hit.inside) : null;
  if (isSelectionAtom(inside) && !inside.isInline) {
    const dom = view.nodeDOM(hit.inside);
    if (dom instanceof Element && !isFloatingObjectDom(dom)) {
      const box = drawnBox(dom);
      const side = sideOfBox(box, x, y);
      if (side) return { atom: { pos: hit.inside, node: inside }, side, level: isLevel(box, y) };
    }
  }
  const $hit = doc.resolve(hit.pos);
  if ($hit.parent.inlineContent) return null;
  for (const [node, pos, side] of [
    [$hit.nodeBefore, hit.pos - ($hit.nodeBefore?.nodeSize ?? 0), "after"],
    [$hit.nodeAfter, hit.pos, "before"],
  ] as const) {
    if (!isSelectionAtom(node) || node.isInline) continue;
    const dom = view.nodeDOM(pos);
    if (!(dom instanceof Element) || isFloatingObjectDom(dom)) continue;
    const box = drawnBox(dom);
    // Beside the object, or on the empty paper past it: an object with
    // nothing after it (the last block of the page or the document) is
    // reached from the paper below it, and one with nothing before it from
    // the paper above it.
    if (side === "after" ? y < box.top : y > box.bottom) continue;
    return { atom: { pos, node }, side, level: isLevel(box, y) };
  }
  return null;
}

/** Whether a point is level with a drawn box (on the object's own line). */
function isLevel(box: DOMRect, y: number): boolean {
  return y >= box.top && y <= box.bottom;
}

/** Which side of a drawn box a point outside it is on; `null` inside it. */
function sideOfBox(box: DOMRect, x: number, y: number): "before" | "after" | null {
  if (y > box.bottom) return "after";
  if (y < box.top) return "before";
  if (x < box.left) return "before";
  if (x > box.right) return "after";
  return null;
}

/** The end of the last page, for a press on the paper below it. */
function endOfDocumentBelow(
  view: EditorView,
  y: number,
): { pos: number; inside: number } | null {
  const sheets = view.dom.querySelectorAll<HTMLElement>(":scope > article[data-page-sheet]");
  const last = sheets.item(sheets.length - 1);
  const bottom = last ? last.getBoundingClientRect().bottom : view.dom.getBoundingClientRect().bottom;
  if (y <= bottom - 1 && last) return null;
  const { doc } = view.state;
  const page = doc.lastChild;
  if (!page || page.isTextblock) return null;
  return { pos: doc.content.size - 1, inside: -1 };
}

function drawnBox(dom: Element): DOMRect {
  const drawn =
    dom.querySelector(":scope > .chart-block-wrapper") ??
    dom.querySelector("[data-document-shape-canvas]") ??
    dom.querySelector(":scope > .math-block-preview") ??
    dom;
  return drawn.getBoundingClientRect();
}
