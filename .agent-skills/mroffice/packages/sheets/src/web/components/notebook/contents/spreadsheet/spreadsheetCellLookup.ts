/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The one way the workbook finds a grid cell's element by its address. Every
 * keyed lookup (`row:col`) goes through here, so the grid decides how a cell
 * is represented without each caller knowing: a resting editor, an open
 * entry, or (with the canvas text layer) none at all. A cell the canvas
 * paints at rest is a bare `td[data-ghost-cell]`; asking for its editor
 * mounts it first (the grid's materializer, registered on its table), so a
 * caller that focuses or reads the cell finds it as it always did.
 */

import type { SyntheticEvent } from "react";

const materializers = new WeakMap<Element, (key: string) => void>();

/**
 * The grid table's way to give a ghost cell its editor now (a synchronous
 * render). Page Layout view registers its own on its root, marked
 * `data-spreadsheet-cell-host`: its cells at rest are painted boxes
 * (`[data-page-layout-ghost]`) until something asks for their editor.
 */
export function registerSpreadsheetCellMaterializer(table: Element | null, materialize: (key: string) => void): () => void {
  if (!table) return () => undefined;
  materializers.set(table, materialize);
  // Gone with its grid: the materializer is its window's, and anything still
  // holding the table element (a stale reference, a test's spy) would keep
  // the whole closed window alive through this entry.
  return () => {
    if (materializers.get(table) === materialize) materializers.delete(table);
  };
}

/**
 * The stretch of a canvas row that holds the cell at `key` (`td[data-canvas-run]`, or
 * the frozen columns' `td[data-canvas-pinned]`): a row at rest keeps no element per
 * cell. Missing these, Enter onto such a row found no editor: the selection moved on,
 * the focus fell to the page and everything typed next was lost.
 */
function canvasRunHolding(root: ParentNode, key: string): HTMLElement | undefined {
  const separator = key.indexOf(":");
  const row = key.slice(0, separator);
  const col = key.slice(separator + 1);
  return [...root.querySelectorAll<HTMLElement>(`td[data-canvas-run-row="${row}"]`)].find((run) =>
    (run.dataset.canvasRun ?? run.dataset.canvasPinned ?? "").split(",").includes(col),
  );
}

/** Mounts the editor of the cell at rest at `key` under `root`, when there is one. True when it did. */
function materializeGhost(root: ParentNode, key: string): boolean {
  const ghost = root.querySelector<HTMLElement>(
    `td[data-ghost-cell][data-range-cell="${key}"], [data-page-layout-ghost][data-range-cell="${key}"]`,
  ) ?? canvasRunHolding(root, key);
  const table = ghost?.closest('table[role="grid"], [data-spreadsheet-cell-host]');
  const materialize = table ? materializers.get(table) : undefined;
  if (!materialize) return false;
  materialize(key);
  return true;
}

/** The cell's editor element (its resting span, input or textarea), as `[data-testid="spreadsheet-cell"][data-cell="key"]`, plus `suffix` (more attribute tests). */
export function spreadsheetCellEditorAt<T extends Element = HTMLInputElement>(root: ParentNode, key: string, suffix?: string): T | null;
export function spreadsheetCellEditorAt<T extends Element = HTMLInputElement>(root: ParentNode | null | undefined, key: string, suffix?: string): T | null | undefined;
export function spreadsheetCellEditorAt<T extends Element = HTMLInputElement>(
  root: ParentNode | null | undefined,
  key: string,
  suffix = "",
): T | null | undefined {
  const selector = `[data-testid="spreadsheet-cell"][data-cell="${key}"]${suffix}`;
  const found = root?.querySelector<T>(selector);
  // A ghost is at rest: never the edited cell, so only a plain lookup mounts it.
  if (found || !root || suffix || !materializeGhost(root, key)) return found;
  return root.querySelector<T>(selector);
}

/** The first element carrying the cell's address (`[data-cell="key"]`): its editor, ahead of its display layer. */
export function spreadsheetCellNodeAt<T extends Element = HTMLInputElement>(root: ParentNode, key: string): T | null;
export function spreadsheetCellNodeAt<T extends Element = HTMLInputElement>(root: ParentNode | null | undefined, key: string): T | null | undefined;
export function spreadsheetCellNodeAt<T extends Element = HTMLInputElement>(
  root: ParentNode | null | undefined,
  key: string,
): T | null | undefined {
  const found = root?.querySelector<T>(`[data-cell="${key}"]`);
  if (found || !root || !materializeGhost(root, key)) return found;
  return root.querySelector<T>(`[data-cell="${key}"]`);
}

/**
 * A ghost cell's own handlers: a press, click or double click on the bare
 * cell mounts its editor and is handed to the editor's handler as if it had
 * landed there (its target and current target are the editor).
 */
export function spreadsheetGhostCellHandler<E extends SyntheticEvent<HTMLElement>>(handler: (event: E) => void) {
  return (event: SyntheticEvent<HTMLTableCellElement>) => {
    const cell = event.currentTarget;
    // Only a press on the cell itself; its buttons and markers keep theirs.
    if (event.target !== cell) return;
    const key = cell.getAttribute("data-range-cell");
    const table = cell.closest('table[role="grid"]');
    const editor = key && table ? spreadsheetCellEditorAt<HTMLElement>(table, key) : null;
    if (!editor) return;
    handler(retargetSpreadsheetCellEvent(event, editor) as unknown as E);
  };
}

/** `event` as if it had landed on `editor` (its target and current target), for a handler written for the editor. */
export function retargetSpreadsheetCellEvent<E extends SyntheticEvent>(event: E, editor: Element): E {
  return new Proxy(event, {
    get(target, property) {
      if (property === "currentTarget" || property === "target") return editor;
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/**
 * The `row:col` a point falls on inside a run of resting cells drawn on the
 * canvas (SpreadsheetCanvasRunRow: one empty element spans them), by the
 * column headings' boxes; null outside such a run.
 */
export function spreadsheetCanvasRunCellAt(element: Element | null | undefined, clientX: number): string | null {
  const run = element?.closest<HTMLElement>("td[data-canvas-run]");
  if (!run) return null;
  const table = run.closest("table");
  for (const col of (run.dataset.canvasRun ?? "").split(",")) {
    const rect = table?.querySelector<HTMLElement>(`:scope > thead th[data-header-col="${col}"]`)?.getBoundingClientRect();
    if (rect && clientX >= rect.left && clientX < rect.right) return `${run.dataset.canvasRunRow}:${col}`;
  }
  return null;
}
