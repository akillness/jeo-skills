"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's table selection pointers for the Docs editor. Just left of a row
 * the pointer selects the row, just above a column it selects the column
 * (Word: "move the mouse just to the left of the row" / "just above the
 * column"); dragging from there extends the selection over rows or columns
 * and Shift extends the current one. The selection is the ordinary
 * CellSelection, so Backspace, Delete and the ribbon act on it
 * (tableSelectionDelete.ts). The border resize bands keep priority
 * (documentTableBorderDrag.ts).
 */

import type { ResolvedPos } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import type { EditorView } from "@tiptap/pm/view";

import zoneStyles from "./DocumentTableSelectZones.module.css";
import { documentTableBorderAt } from "./documentTableBorderDrag";
import { DOCUMENT_TABLE_RESIZE_HIT_WIDTH_PX } from "./stableTableColumnResizeView";

/** Width of the row band left of a table, outside the border resize band. */
const ROW_ZONE_PX = 24;
/** Height of the column band above a table (the top border included). */
const COLUMN_ZONE_PX = 9;

/** Controls that keep their own mouse-down. */
const FOREIGN_CONTROL_SELECTOR =
  "button, input, select, textarea, a[href], .note-editor-image-handle, [data-office-drawing-handle]";

type Axis = "row" | "column";

interface ZoneHit {
  readonly axis: Axis;
  readonly table: HTMLTableElement;
  readonly cell: HTMLTableCellElement;
}

function visibleRows(table: HTMLTableElement): Array<{ row: HTMLTableRowElement; rect: DOMRect }> {
  return Array.from(table.rows)
    .filter((row) => row.cells.length > 0)
    .map((row) => ({ row, rect: row.getBoundingClientRect() }))
    .filter(({ rect }) => rect.height > 0);
}

function gridLeft(rows: ReadonlyArray<{ row: HTMLTableRowElement }>): number {
  let left = Number.POSITIVE_INFINITY;
  for (const { row } of rows) {
    const first = row.cells[0]?.getBoundingClientRect();
    if (first && first.width > 0) left = Math.min(left, first.left);
  }
  return left;
}

/** The editor tables `element` is in, innermost first. */
function tablesAround(view: EditorView, element: Element | null): HTMLTableElement[] {
  const found: HTMLTableElement[] = [];
  for (let table = element?.closest("table"); table; table = table.parentElement?.closest("table")) {
    if (table instanceof HTMLTableElement && view.dom.contains(table)) found.push(table);
  }
  return found;
}

function rowHit(table: HTMLTableElement, x: number, y: number): ZoneHit | null {
  const rows = visibleRows(table);
  const left = gridLeft(rows);
  if (!Number.isFinite(left)) return null;
  if (x < left - ROW_ZONE_PX || x >= left - DOCUMENT_TABLE_RESIZE_HIT_WIDTH_PX) return null;
  const hit = rows.find(({ rect }) => y >= rect.top && y < rect.bottom);
  const cell = hit?.row.cells[0];
  return cell ? { axis: "row", table, cell } : null;
}

function columnHit(table: HTMLTableElement, x: number, y: number): ZoneHit | null {
  const first = visibleRows(table)[0];
  if (!first) return null;
  const top = first.rect.top;
  if (y < top - COLUMN_ZONE_PX || y >= top + 1) return null;
  const cell = Array.from(first.row.cells).find((candidate) => {
    const rect = candidate.getBoundingClientRect();
    return rect.width > 0 && x >= rect.left && x < rect.right;
  });
  return cell ? { axis: "column", table, cell } : null;
}

/** The row or column band (x, y) is in, the innermost table winning. */
function zoneAt(view: EditorView, x: number, y: number): ZoneHit | null {
  const doc = view.dom.ownerDocument;
  if (typeof doc.elementFromPoint !== "function") return null;
  for (const table of tablesAround(view, doc.elementFromPoint(x + ROW_ZONE_PX, y))) {
    const hit = rowHit(table, x, y);
    if (hit) return hit;
  }
  for (const table of tablesAround(view, doc.elementFromPoint(x, y + COLUMN_ZONE_PX + 1))) {
    const hit = columnHit(table, x, y);
    if (hit) return hit;
  }
  return null;
}

/** The model position before `cell`. */
function resolvedCell(view: EditorView, cell: HTMLTableCellElement): ResolvedPos | null {
  let inside: number;
  try {
    inside = view.posAtDOM(cell, 0);
  } catch {
    return null;
  }
  const $pos = view.state.doc.resolve(inside);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const role = $pos.node(depth).type.spec.tableRole;
    if (role === "cell" || role === "header_cell") return view.state.doc.resolve($pos.before(depth));
  }
  return null;
}

function axisSelection(axis: Axis, $anchor: ResolvedPos, $head: ResolvedPos): CellSelection | null {
  if ($anchor.node(-1) !== $head.node(-1)) return null;
  try {
    return axis === "row"
      ? CellSelection.rowSelection($anchor, $head)
      : CellSelection.colSelection($anchor, $head);
  } catch {
    return null;
  }
}

/** The cell of `table` along `axis` nearest the pointer (clamped to the grid). */
function cellAlong(table: HTMLTableElement, axis: Axis, x: number, y: number): HTMLTableCellElement | null {
  const rows = visibleRows(table);
  if (rows.length === 0) return null;
  if (axis === "row") {
    const hit =
      rows.find(({ rect }) => y >= rect.top && y < rect.bottom) ??
      (y < rows[0]!.rect.top ? rows[0] : rows[rows.length - 1]);
    return hit?.row.cells[0] ?? null;
  }
  const cells = Array.from(rows[0]!.row.cells).filter((cell) => cell.getBoundingClientRect().width > 0);
  if (cells.length === 0) return null;
  return (
    cells.find((cell) => {
      const rect = cell.getBoundingClientRect();
      return x >= rect.left && x < rect.right;
    }) ?? (x < cells[0]!.getBoundingClientRect().left ? cells[0]! : cells[cells.length - 1]!)
  );
}

class SelectZoneController {
  private hover: Axis | null = null;
  private stopDrag: (() => void) | null = null;

  constructor(private readonly view: EditorView) {}

  private setHover(axis: Axis | null): void {
    if (this.hover === axis) return;
    const classes = this.view.dom.classList;
    if (zoneStyles.hoverRow) classes.toggle(zoneStyles.hoverRow, axis === "row");
    if (zoneStyles.hoverColumn) classes.toggle(zoneStyles.hoverColumn, axis === "column");
    this.hover = axis;
  }

  move(event: MouseEvent): void {
    if (this.stopDrag) return;
    // A pressed button is a text selection drag on its way somewhere else.
    if (event.buttons !== 0 || !this.view.editable) {
      this.setHover(null);
      return;
    }
    const hit = zoneAt(this.view, event.clientX, event.clientY);
    this.setHover(hit && !documentTableBorderAt(this.view, event) ? hit.axis : null);
  }

  leave(): void {
    if (!this.stopDrag) this.setHover(null);
  }

  down(event: MouseEvent): void {
    const view = this.view;
    if (event.button !== 0 || !view.editable || event.defaultPrevented) return;
    if (event.target instanceof Element && event.target.closest(FOREIGN_CONTROL_SELECTOR)) return;
    const hit = zoneAt(view, event.clientX, event.clientY);
    if (!hit || documentTableBorderAt(view, event)) return;
    const $cell = resolvedCell(view, hit.cell);
    if (!$cell) return;
    const current = view.state.selection;
    const $anchor =
      event.shiftKey && current instanceof CellSelection && current.$anchorCell.node(-1) === $cell.node(-1)
        ? current.$anchorCell
        : $cell;
    const selection = axisSelection(hit.axis, $anchor, $cell);
    if (!selection) return;
    // Before the text, cell and page handlers: this click selects cells.
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!view.hasFocus()) view.focus();
    view.dispatch(view.state.tr.setSelection(selection));
    this.drag(hit, $anchor);
  }

  private drag(hit: ZoneHit, $anchor: ResolvedPos): void {
    const view = this.view;
    const win = view.dom.ownerDocument.defaultView;
    if (!win) return;
    const root = view.dom.ownerDocument.documentElement;
    if (zoneStyles.dragging) root.classList.add(zoneStyles.dragging);
    const anchorPos = $anchor.pos;
    const onMove = (event: MouseEvent) => {
      if (event.buttons === 0) {
        stop();
        return;
      }
      const cell = cellAlong(hit.table, hit.axis, event.clientX, event.clientY);
      const $head = cell ? resolvedCell(view, cell) : null;
      if (!$head || anchorPos > view.state.doc.content.size) return;
      const selection = axisSelection(hit.axis, view.state.doc.resolve(anchorPos), $head);
      if (selection && !selection.eq(view.state.selection)) {
        view.dispatch(view.state.tr.setSelection(selection));
      }
    };
    const stop = () => {
      win.removeEventListener("mousemove", onMove, true);
      win.removeEventListener("mouseup", stop, true);
      if (zoneStyles.dragging) root.classList.remove(zoneStyles.dragging);
      this.stopDrag = null;
    };
    this.stopDrag = stop;
    win.addEventListener("mousemove", onMove, true);
    win.addEventListener("mouseup", stop, true);
  }

  destroy(): void {
    this.stopDrag?.();
    this.setHover(null);
  }
}

const controllers = new WeakMap<EditorView, SelectZoneController>();

export function createDocumentTableSelectZonesPlugin(): Plugin {
  return new Plugin({
    view(editorView) {
      const controller = new SelectZoneController(editorView);
      controllers.set(editorView, controller);
      // Capture: ahead of ProseMirror's own mouse-down (a text caret in the
      // page margin or the paragraph above) and of prosemirror-tables'.
      const onMouseDown = (event: MouseEvent) => controller.down(event);
      editorView.dom.addEventListener("mousedown", onMouseDown, true);
      return {
        destroy() {
          editorView.dom.removeEventListener("mousedown", onMouseDown, true);
          controller.destroy();
          controllers.delete(editorView);
        },
      };
    },
    props: {
      handleDOMEvents: {
        mousemove(view, event) {
          controllers.get(view)?.move(event);
          return false;
        },
        mouseleave(view) {
          controllers.get(view)?.leave();
          return false;
        },
      },
    },
  });
}
