"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Which table border is under the pointer, for the Docs editor.
 *
 * prosemirror-tables only finds a cell's RIGHT border, and only from inside
 * that cell, so a table's left edge, every row border, and an outer edge
 * approached from outside the table could not be grabbed. Word shows its
 * resize cursor on the border itself, from either side, for columns and rows
 * alike, and on borders that are not drawn (a borderless table). This plugin
 * owns that hit test:
 *
 * - every grabbable border gets the resize cursor and a highlighted border
 *   line drawn over the page (which also marks an invisible border), without
 *   a transaction: the stock handle is left for programmatic use only;
 * - column borders keep the NodeView's column gesture, so their behaviour is
 *   shared with the stock handle path;
 * - a mouse-down on any of them starts the NodeView's drag
 *   (stableTableColumnResizeView.ts) before text selection sees it.
 */

import {
  isCompatMouseFromTouch,
  isTouchLikePointer,
} from "../../../../lib/pointer-capability";
import { Plugin } from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";
import { columnResizingPluginKey, TableMap } from "@tiptap/pm/tables";
import type { EditorView } from "@tiptap/pm/view";

import borderDragStyles from "./DocumentTableBorderDrag.module.css";
import { TABLE_ROW_CONTINUES_ATTR } from "./paged/tablePagination";
import { clipToVisibleEditor } from "./visibleEditorClip";
import {
  DOCUMENT_TABLE_RESIZE_HIT_WIDTH_PX,
  DOCUMENT_TABLE_ROW_RESIZE_HIT_PX,
  documentTableBorderDragKey,
  documentTableResizeViewFor,
  paginationOnlyDocumentChange,
  type DocumentTableBorderTarget,
  type StableTableColumnResizeView,
} from "./stableTableColumnResizeView";

export { documentTableBorderDragKey };

/** Controls near a border that keep their own mouse-down. */
const FOREIGN_CONTROL_SELECTOR =
  "button, input, select, textarea, a[href], .note-editor-image-handle, [data-office-drawing-handle]";

interface GeometricHit {
  readonly table: HTMLTableElement;
  readonly distance: number;
  readonly depth: number;
  readonly cell?: HTMLTableCellElement;
  readonly side?: "left" | "right";
  /** Client x of the column border. */
  readonly edgeX?: number;
  readonly row?: HTMLTableRowElement;
  readonly gridLeft: number;
  readonly gridRight: number;
  readonly top: number;
  readonly bottom: number;
}

export interface BorderHit {
  readonly view: StableTableColumnResizeView;
  readonly target: DocumentTableBorderTarget;
  /** The border to highlight (client px). */
  readonly line: { left: number; top: number; width: number; height: number };
}

function tableDepth(table: Element): number {
  let depth = 0;
  for (let node = table.parentElement; node; node = node.parentElement) {
    if (node.tagName === "TABLE") depth += 1;
  }
  return depth;
}

/** The innermost editor table an element belongs to, wrapper included. */
function tableOf(element: Element | null): HTMLTableElement | null {
  if (!element) return null;
  const table = element.closest("table");
  const wrapper = element.closest(".tableWrapper");
  const wrapped = wrapper?.querySelector(":scope > table") ?? null;
  if (wrapped instanceof HTMLTableElement && (!table || table.contains(wrapper))) {
    return wrapped;
  }
  return table instanceof HTMLTableElement ? table : null;
}

function bodyRows(table: HTMLTableElement): HTMLTableRowElement[] {
  const body = table.tBodies[0];
  return body ? Array.from(body.rows) : [];
}

/**
 * The nearest grabbable border of `table` to (x, y), from geometry alone.
 * Column borders are tested in the row under the pointer; row borders over
 * the table's width. Both reach outside the table by the same band.
 */
/**
 * A finger's border bands (half-widths, px): wide enough to land on, narrow
 * enough that a tap inside an ordinary cell still places the caret (Word for
 * iPad drags table borders). A mouse keeps the 6 / 4 px bands.
 */
export const DOCUMENT_TABLE_TOUCH_COLUMN_HIT_PX = 14;
export const DOCUMENT_TABLE_TOUCH_ROW_HIT_PX = 11;

interface BorderBands {
  readonly column: number;
  readonly row: number;
}

const MOUSE_BANDS: BorderBands = {
  column: DOCUMENT_TABLE_RESIZE_HIT_WIDTH_PX,
  row: DOCUMENT_TABLE_ROW_RESIZE_HIT_PX,
};
const TOUCH_BANDS: BorderBands = {
  column: DOCUMENT_TABLE_TOUCH_COLUMN_HIT_PX,
  row: DOCUMENT_TABLE_TOUCH_ROW_HIT_PX,
};

function geometricHit(
  table: HTMLTableElement,
  x: number,
  y: number,
  bands: BorderBands = MOUSE_BANDS,
): GeometricHit | null {
  const columnBand = bands.column;
  const rowBand = bands.row;
  const box = table.getBoundingClientRect();
  if (!(box.width > 0 && box.height > 0)) return null;
  if (
    x < box.left - columnBand || x > box.right + columnBand ||
    y < box.top - rowBand || y > box.bottom + rowBand
  ) {
    return null;
  }
  const rows = bodyRows(table);
  const rects = rows.map((row) => row.getBoundingClientRect());
  let gridLeft = Number.POSITIVE_INFINITY;
  let gridRight = Number.NEGATIVE_INFINITY;
  rows.forEach((row) => {
    const first = row.cells[0]?.getBoundingClientRect();
    const last = row.cells[row.cells.length - 1]?.getBoundingClientRect();
    if (first && first.width > 0) gridLeft = Math.min(gridLeft, first.left);
    if (last && last.width > 0) gridRight = Math.max(gridRight, last.right);
  });
  if (!Number.isFinite(gridLeft) || !Number.isFinite(gridRight)) return null;
  const top = rects.find((rect) => rect.height > 0)?.top ?? box.top;
  const bottom = [...rects].reverse().find((rect) => rect.height > 0)?.bottom ?? box.bottom;
  const depth = tableDepth(table);
  const frame = { table, depth, gridLeft, gridRight, top, bottom };

  let best: GeometricHit | null = null;
  const consider = (hit: GeometricHit) => {
    if (!best || hit.distance < best.distance) best = hit;
  };
  const rowIndex = rects.findIndex((rect) => rect.height > 0 && y >= rect.top && y <= rect.bottom);
  const hoveredRow = rowIndex >= 0 ? rows[rowIndex] : undefined;
  if (hoveredRow) {
    for (const cell of Array.from(hoveredRow.cells)) {
      const rect = cell.getBoundingClientRect();
      if (!(rect.width > 0)) continue;
      const right = Math.abs(x - rect.right);
      if (right <= columnBand) consider({ ...frame, distance: right, cell, side: "right", edgeX: rect.right });
      const left = Math.abs(x - rect.left);
      if (left <= columnBand) consider({ ...frame, distance: left, cell, side: "left", edgeX: rect.left });
    }
  }
  if (x >= gridLeft - columnBand && x <= gridRight + columnBand) {
    const spanningCells = rows.flatMap((row) =>
      Array.from(row.cells)
        .filter((cell) => cell.rowSpan > 1)
        .map((cell) => cell.getBoundingClientRect()),
    );
    rows.forEach((row, index) => {
      const rect = rects[index]!;
      if (!(rect.height > 0) || row.cells.length === 0) return;
      const distance = Math.abs(y - rect.bottom);
      if (distance > rowBand) return;
      // A vertically merged cell has no border where the rows under it meet:
      // Word keeps the I-beam there and the click places the caret. The row
      // border stays grabbable from the cells beside the merged one.
      if (spanningCells.some((span) => (
        x > span.left && x < span.right &&
        span.top < rect.bottom - 1 && span.bottom > rect.bottom + 1
      ))) {
        return;
      }
      // A column border wins a tie: it is the narrower target.
      if (distance <= rowBand && (!best || distance < best.distance)) {
        best = { ...frame, distance, row };
      }
    });
  }
  return best;
}

interface CellModel {
  readonly tablePos: number;
  readonly map: TableMap;
  readonly rect: { left: number; right: number; top: number; bottom: number };
  readonly rowIndex: number;
}

/** Model position of a rendered cell of `expected`'s table. */
function cellModel(
  view: EditorView,
  cell: HTMLTableCellElement,
  expected: StableTableColumnResizeView,
): CellModel | null {
  let inside: number;
  try {
    inside = view.posAtDOM(cell, 0);
  } catch {
    return null;
  }
  const $pos = view.state.doc.resolve(inside);
  let cellDepth = -1;
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const role = $pos.node(depth).type.spec.tableRole;
    if (role === "cell" || role === "header_cell") {
      cellDepth = depth;
      break;
    }
  }
  if (cellDepth < 2) return null;
  const table = $pos.node(cellDepth - 2);
  if (table !== expected.node || table.type.name !== "table") return null;
  const tablePos = $pos.before(cellDepth - 2);
  const tableStart = tablePos + 1;
  let map: TableMap;
  try {
    map = TableMap.get(table);
  } catch {
    return null;
  }
  const rect = map.findCell($pos.before(cellDepth) - tableStart);
  return { tablePos, map, rect, rowIndex: $pos.index(cellDepth - 2) };
}

function resolveHit(view: EditorView, geo: GeometricHit): BorderHit | null {
  const tableView = documentTableResizeViewFor(geo.table);
  if (!tableView) return null;
  if (geo.row) {
    const first = geo.row.cells[0];
    if (!first) return null;
    const model = cellModel(view, first, tableView);
    if (!model) return null;
    const rowNode = tableView.node.maybeChild(model.rowIndex);
    if (!rowNode || rowNode.attrs[TABLE_ROW_CONTINUES_ATTR] === true) return null;
    const bottom = geo.row.getBoundingClientRect().bottom;
    return {
      view: tableView,
      target: { kind: "row", rowIndex: model.rowIndex, tablePos: model.tablePos },
      line: { left: geo.gridLeft, top: bottom - 1.5, width: geo.gridRight - geo.gridLeft, height: 3 },
    };
  }
  if (!geo.cell || !geo.side || geo.edgeX === undefined) return null;
  const model = cellModel(view, geo.cell, tableView);
  if (!model) return null;
  const boundary = geo.side === "right" ? model.rect.right : model.rect.left;
  const line = { left: geo.edgeX - 1.5, top: geo.top, width: 3, height: geo.bottom - geo.top };
  if (boundary <= 0) {
    if (!tableView.canDragLeftEdge()) return null;
    return { view: tableView, target: { kind: "leftEdge", tablePos: model.tablePos }, line };
  }
  if (boundary > model.map.width) return null;
  return {
    view: tableView,
    target: { kind: "column", column: boundary - 1, tablePos: model.tablePos },
    line,
  };
}

/** Every editor table the pointer is on or within a border band of. */
function candidateTables(
  view: EditorView,
  event: MouseEvent,
  bands: BorderBands = MOUSE_BANDS,
): HTMLTableElement[] {
  const found = new Set<HTMLTableElement>();
  const add = (element: Element | null) => {
    const table = tableOf(element);
    if (table && view.dom.contains(table) && documentTableResizeViewFor(table)) found.add(table);
  };
  add(event.target instanceof Element ? event.target : null);
  const doc = view.dom.ownerDocument;
  if (typeof doc.elementFromPoint === "function") {
    const { clientX: x, clientY: y } = event;
    const column = bands.column;
    const row = bands.row;
    for (const [px, py] of [[x - column, y], [x + column, y], [x, y - row], [x, y + row]] as const) {
      add(doc.elementFromPoint(px, py));
    }
  }
  return [...found];
}

/** The border (x, y) grabs, the innermost table winning a tie. */
export function documentTableBorderAt(
  view: EditorView,
  event: MouseEvent,
  touch = false,
): BorderHit | null {
  if (!view.editable) return null;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest(FOREIGN_CONTROL_SELECTOR)) return null;
  const bands = touch ? TOUCH_BANDS : MOUSE_BANDS;
  let best: GeometricHit | null = null;
  for (const table of candidateTables(view, event, bands)) {
    const hit = geometricHit(table, event.clientX, event.clientY, bands);
    if (!hit) continue;
    if (
      !best ||
      hit.distance < best.distance ||
      (hit.distance === best.distance && hit.depth > best.depth)
    ) {
      best = hit;
    }
  }
  return best ? resolveHit(view, best) : null;
}

type HoverKind = "column" | "row" | null;

class BorderHoverController {
  private kind: HoverKind = null;
  private edge: HTMLDivElement | null = null;

  constructor(private readonly view: EditorView) {}

  /** Hover never sets the stock handle (a transaction per border crossed);
   * one set elsewhere is dropped so its decoration cannot linger. */
  private dropStockHandle(): void {
    const state = columnResizingPluginKey.getState(this.view.state) as
      | { activeHandle: number; dragging: unknown }
      | undefined;
    if (!state || state.dragging || state.activeHandle < 0) return;
    this.view.dispatch(
      this.view.state.tr.setMeta(columnResizingPluginKey, { setHandle: -1 }),
    );
  }

  private setKind(kind: HoverKind): void {
    if (this.kind === kind) return;
    const classes = this.view.dom.classList;
    if (borderDragStyles.hoverColumn) classes.toggle(borderDragStyles.hoverColumn, kind === "column");
    if (borderDragStyles.hoverRow) classes.toggle(borderDragStyles.hoverRow, kind === "row");
    this.kind = kind;
  }

  private showEdge(line: BorderHit["line"] | null): void {
    // The line is drawn on the page's top layer (fixed, on <body>), out of
    // the window's clipping: a border of a table running past the window's
    // visible area was drawn down across the window below it. Only the part
    // the editor shows is drawn.
    const visible = line ? clipToVisibleEditor(this.view.dom, line) : null;
    if (!visible) {
      this.edge?.remove();
      this.edge = null;
      return;
    }
    line = visible;
    const doc = this.view.dom.ownerDocument;
    if (!this.edge) {
      this.edge = doc.body.appendChild(doc.createElement("div"));
      this.edge.className = borderDragStyles.edge ?? "";
      this.edge.setAttribute("aria-hidden", "true");
      this.edge.dataset.testid = "document-table-border-hover";
    }
    this.edge.style.left = `${line.left}px`;
    this.edge.style.top = `${line.top}px`;
    this.edge.style.width = `${line.width}px`;
    this.edge.style.height = `${line.height}px`;
  }

  hover(event: MouseEvent): void {
    // Mid-drag the NodeView owns the pointer; a pressed button is a text
    // selection drag, which must not light borders up on its way.
    if (event.buttons !== 0) return;
    const hit = documentTableBorderAt(this.view, event);
    if (!hit) {
      this.clear();
      return;
    }
    this.setKind(hit.target.kind === "row" ? "row" : "column");
    this.showEdge(hit.line);
    this.dropStockHandle();
  }

  /** Forget the hover visuals; `dispatch` also drops a stock handle. */
  clear(dispatch = true): void {
    this.setKind(null);
    this.showEdge(null);
    if (dispatch) this.dropStockHandle();
  }

  destroy(): void {
    this.clear(false);
  }
}

const controllers = new WeakMap<EditorView, BorderHoverController>();

function refreshIfStale(view: EditorView, previous: EditorState): void {
  if (view.state.doc !== previous.doc) controllers.get(view)?.clear(false);
}

/**
 * Table border hover and drag start. Install before prosemirror-tables'
 * columnResizing, whose own hover and mouse-down handlers are removed.
 */
export function createDocumentTableBorderDragPlugin(): Plugin {
  return new Plugin<boolean>({
    key: documentTableBorderDragKey,
    state: {
      init: () => false,
      apply: (tr, previous) => paginationOnlyDocumentChange(tr, previous),
    },
    view(editorView) {
      const controller = new BorderHoverController(editorView);
      controllers.set(editorView, controller);
      // Capture: the border wins before any cell, image or text handler, and
      // before the table NodeView's own stock-handle listener.
      const onMouseDown = (event: MouseEvent) => {
        if (event.button !== 0 || !editorView.editable) return;
        // a tap's compatibility mousedown: the pointerdown below had it
        if (isCompatMouseFromTouch(event)) return;
        const hit = documentTableBorderAt(editorView, event);
        if (!hit) return;
        if (hit.view.beginBorderDrag(event, hit.target)) controller.clear(false);
      };
      
      // drags it with pointer events (a touch sends no mousemove); the
      // table's touch guard keeps the page from scrolling under it.
      const onPointerDown = (event: PointerEvent) => {
        if (event.button !== 0 || !editorView.editable) return;
        if (!isTouchLikePointer(event)) return;
        const hit = documentTableBorderAt(editorView, event, true);
        if (!hit) return;
        if (hit.view.beginBorderDrag(event, hit.target)) {
          event.preventDefault();
          controller.clear(false);
        }
      };
      const onScroll = () => controller.clear(false);
      const win = editorView.dom.ownerDocument.defaultView;
      editorView.dom.addEventListener("mousedown", onMouseDown, true);
      editorView.dom.addEventListener("pointerdown", onPointerDown, true);
      win?.addEventListener("scroll", onScroll, true);
      return {
        update(view, previous) {
          refreshIfStale(view, previous);
        },
        destroy() {
          editorView.dom.removeEventListener("mousedown", onMouseDown, true);
          editorView.dom.removeEventListener("pointerdown", onPointerDown, true);
          win?.removeEventListener("scroll", onScroll, true);
          controller.destroy();
          controllers.delete(editorView);
        },
      };
    },
    props: {
      handleDOMEvents: {
        mousemove(view, event) {
          controllers.get(view)?.hover(event);
          return false;
        },
        mouseleave(view) {
          controllers.get(view)?.clear();
          return false;
        },
      },
    },
  });
}
