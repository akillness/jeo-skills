/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's "Exactly" row height for a centred or bottom-aligned cell.
 *
 * An exact row (`w:trHeight w:hRule="exact"`) keeps its height whatever its
 * cells hold; what does not fit is cut at the row edge (TableRowHeight,
 * Open XML). The stylesheet takes a cell's content height out of the row by
 * giving its last block a large negative bottom margin, which leaves the
 * cell nothing to align: CSS `vertical-align: middle` / `bottom` needs the
 * content height, so those cells kept growing the row (WUA 111: two lines
 * in a 0.5 in exact row drew it 70 px high).
 *
 * Such a cell is laid out from its top like the others, and this plugin
 * measures its content and moves it by the alignment's offset -- half the
 * free height when centred, all of it at the bottom. Content taller than
 * the row is not moved up: Word 16 draws it from the top of the cell and
 * cuts it at the bottom whatever the cell's alignment (measured: a 0.5 in
 * exact row holding four 14 pt lines, centred / bottom / top cells, exported
 * to PDF -- all three show their first two lines). The offset is a CSS
 * custom property on the cell, written with the editor's DOM observer
 * paused, and the stylesheet translates the cell's blocks by it.
 */
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

import { measureOutsideEditorObservation } from "./documentLayoutStatus";
import { registerLayoutSettler } from "./paged/layoutPending";
import { MEASURE_HORIZON_EVENT, sheetsWithinMeasureHorizon } from "./paged/measureHorizon";
import { SheetMeasureMemo } from "./paged/sheetMeasureMemo";

const SHIFT_PROPERTY = "--exact-cell-shift";
const CELL_SELECTOR =
  'tr[data-row-height-rule="exact"] > :is(td, th):is([data-cell-valign="middle"], [data-cell-valign="bottom"])';

export const exactRowCellAlignmentKey = new PluginKey("documentExactRowCellAlignment");

function cellShift(cell: HTMLElement): number | null {
  const blocks = Array.from(cell.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement &&
      child.offsetParent === cell &&
      !child.classList.contains("column-resize-handle"),
  );
  if (!blocks.length) return null;
  const first = blocks[0]!;
  const last = blocks[blocks.length - 1]!;
  const view = cell.ownerDocument.defaultView;
  const style = view?.getComputedStyle(cell);
  const paddingTop = Number.parseFloat(style?.paddingTop ?? "") || 0;
  const paddingBottom = Number.parseFloat(style?.paddingBottom ?? "") || 0;
  const firstMargin = Number.parseFloat(view?.getComputedStyle(first).marginTop ?? "") || 0;
  // offsetTop/offsetHeight ignore the translation this plugin applied.
  const contentTop = first.offsetTop - Math.max(0, firstMargin);
  const contentHeight = last.offsetTop + last.offsetHeight - contentTop;
  const available = cell.clientHeight - paddingTop - paddingBottom;
  if (!(available > 0) || !(contentHeight >= 0)) return null;
  const free = Math.max(0, available - contentHeight);
  const shift = cell.getAttribute("data-cell-valign") === "bottom" ? free : free / 2;
  return Math.round(shift * 100) / 100;
}

/** The sheets whose exact rows stand as they were measured: a pass looked at
 * every such cell after every view update (a read of a sheet the browser
 * skips lays it out: 22 s of a 30-page document of forms opening). */
const measuredSheets = new WeakMap<HTMLElement, SheetMeasureMemo<true>>();

function memoOf(root: HTMLElement): SheetMeasureMemo<true> {
  let memo = measuredSheets.get(root);
  if (!memo) measuredSheets.set(root, (memo = new SheetMeasureMemo<true>(root)));
  return memo;
}

function alignExactRowCells(view: EditorView, whole = false): void {
  if (view.isDestroyed) return;
  const root = view.dom as HTMLElement;
  const memo = memoOf(root);
  const horizon = whole ? null : sheetsWithinMeasureHorizon(root);
  measureOutsideEditorObservation(view, () => {
    const measured: HTMLElement[] = [];
    const cells: HTMLElement[] = [];
    for (const child of Array.from(root.children)) {
      if (!(child instanceof HTMLElement)) continue;
      const sheet = child.matches("article[data-page-sheet]");
      if (sheet) {
        // Past the horizon a sheet waits its turn, and is measured then.
        if (memo.get(child, null) || (horizon && !horizon.has(child))) continue;
        measured.push(child);
      }
      for (const cell of child.querySelectorAll<HTMLElement>(CELL_SELECTOR)) cells.push(cell);
    }
    const shifts = cells.map((cell) => cellShift(cell));
    cells.forEach((cell, index) => {
      const shift = shifts[index];
      const next = shift === null || shift === undefined ? "" : `${shift}px`;
      if (cell.style.getPropertyValue(SHIFT_PROPERTY) === next) return;
      if (next) cell.style.setProperty(SHIFT_PROPERTY, next);
      else cell.style.removeProperty(SHIFT_PROPERTY);
    });
    // After the writes: they are this measurement's own.
    for (const sheet of measured) memo.set(sheet, null, true);
  });
}

export function createExactRowCellAlignmentPlugin(): Plugin {
  return new Plugin({
    key: exactRowCellAlignmentKey,
    view(view) {
      let frame: number | null = null;
      const schedule = () => {
        if (frame !== null || typeof window === "undefined") return;
        frame = window.requestAnimationFrame(() => {
          frame = null;
          alignExactRowCells(view);
        });
      };
      // The width or a face changes rows with no change to their cells.
      const remeasure = () => {
        memoOf(view.dom as HTMLElement).clear();
        schedule();
      };
      const resize =
        typeof ResizeObserver === "function" ? new ResizeObserver(remeasure) : null;
      resize?.observe(view.dom);
      const fonts = typeof document !== "undefined" ? document.fonts : undefined;
      fonts?.addEventListener?.("loadingdone", remeasure);
      view.dom.addEventListener(MEASURE_HORIZON_EVENT, schedule);
      // Print draws every sheet: each one's rows are measured first.
      const unregisterSettler = registerLayoutSettler(view.dom, "exact-row-cells", () => {
        if (frame !== null) window.cancelAnimationFrame(frame);
        frame = null;
        alignExactRowCells(view, true);
      });
      schedule();
      return {
        update: schedule,
        destroy() {
          if (frame !== null) window.cancelAnimationFrame(frame);
          resize?.disconnect();
          fonts?.removeEventListener?.("loadingdone", remeasure);
          view.dom.removeEventListener(MEASURE_HORIZON_EVENT, schedule);
          unregisterSettler();
          memoOf(view.dom as HTMLElement).disconnect();
          measuredSheets.delete(view.dom as HTMLElement);
        },
      };
    },
  });
}
