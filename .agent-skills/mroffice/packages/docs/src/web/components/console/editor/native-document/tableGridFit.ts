"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Bounded display fitting for existing table grids.
 *
 * The import projection and this one-shot hydration repair keep oversized
 * legacy grids from creating table-local scroll containers. This is MRAI's
 * display policy, not evidence of the native widths Word rendered. Exact
 * native geometry is verified separately from the fitted view.
 *
 * Tables use their own section's content area. An explicit fixed initial
 * width remains authored geometry, and later user resizing is never policed.
 * Repair transactions skip undo history.
 */

import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { TableMap } from "@tiptap/pm/tables";

import {
  resolvePageDimensionsPx,
  resolvePageMarginsPx,
} from "@mrnote/core/web/components/console/editor/native-document/pageSetup.ts";
import { nativeTableGridWidths } from "@mrnote/core/web/components/console/editor/native-document/nativeTableGridView.ts";
import { normalizeSectionLayouts, sectionBreakBoundaries } from "@mrnote/core/web/components/console/editor/native-document/sectionLayouts.ts";
import { trustReadOnlyDocumentMutation } from "@mrnote/core/web/components/console/editor/native-document/readOnlyTransactionAuthority.ts";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tableGridFit: {
      /** Fit legacy display grids once using each table's own section. */
      fitTableGridsToPage: () => ReturnType;
    };
  }
}

const CELL_TYPES = new Set(["tableCell", "tableHeader"]);

/** Word's Insert > Table quick gallery is a fixed 10-column by 8-row grid. */
export const QUICK_TABLE_GRID_COLUMNS = 10;
export const QUICK_TABLE_GRID_ROWS = 8;

export type QuickTableGridPosition = Readonly<{
  rows: number;
  cols: number;
}>;

function clampQuickTableGridPosition({
  rows,
  cols,
}: QuickTableGridPosition): QuickTableGridPosition {
  return {
    rows: Math.max(1, Math.min(QUICK_TABLE_GRID_ROWS, Math.trunc(rows) || 1)),
    cols: Math.max(
      1,
      Math.min(QUICK_TABLE_GRID_COLUMNS, Math.trunc(cols) || 1),
    ),
  };
}

/**
 * Resolve one keyboard move in the quick-table gallery.
 *
 * Arrow keys never wrap. Home/End address the current row; with Ctrl/Cmd they
 * address the whole gallery. Unsupported keys return null so the caller can
 * leave them to the surrounding menu (Tab, Escape, Enter, and Space each have
 * distinct menu/commit behavior).
 */
export function quickTableGridNavigationTarget(
  current: QuickTableGridPosition,
  key: string,
  wholeGrid = false,
): QuickTableGridPosition | null {
  const position = clampQuickTableGridPosition(current);
  switch (key) {
    case "ArrowUp":
      return { ...position, rows: Math.max(1, position.rows - 1) };
    case "ArrowDown":
      return {
        ...position,
        rows: Math.min(QUICK_TABLE_GRID_ROWS, position.rows + 1),
      };
    case "ArrowLeft":
      return { ...position, cols: Math.max(1, position.cols - 1) };
    case "ArrowRight":
      return {
        ...position,
        cols: Math.min(QUICK_TABLE_GRID_COLUMNS, position.cols + 1),
      };
    case "Home":
      return wholeGrid ? { rows: 1, cols: 1 } : { ...position, cols: 1 };
    case "End":
      return wholeGrid
        ? { rows: QUICK_TABLE_GRID_ROWS, cols: QUICK_TABLE_GRID_COLUMNS }
        : { ...position, cols: QUICK_TABLE_GRID_COLUMNS };
    default:
      return null;
  }
}

/** Grid width of a table = per-column max of the stored cell colwidths. */
function tableColumnWidths(table: ProseMirrorNode): number[] {
  const map = TableMap.get(table);
  const widths = Array.from<number>({ length: map.width }).fill(0);
  const seen = new Set<number>();
  for (
    let firstGridIndex = 0;
    firstGridIndex < map.map.length;
    firstGridIndex += 1
  ) {
    const cellOffset = map.map[firstGridIndex];
    if (seen.has(cellOffset)) continue;
    seen.add(cellOffset);
    const cell = table.nodeAt(cellOffset);
    if (!cell || !CELL_TYPES.has(cell.type.name)) continue;
    const col = firstGridIndex % map.width;
    const colspan =
      typeof cell.attrs.colspan === "number" && cell.attrs.colspan > 0
        ? cell.attrs.colspan
        : 1;
    const colwidth = Array.isArray(cell.attrs.colwidth)
      ? (cell.attrs.colwidth as unknown[])
      : null;
    for (let i = 0; i < colspan; i += 1) {
      const value = colwidth?.[i];
      const width =
        typeof value === "number" && Number.isFinite(value) && value > 0
          ? value
          : 0;
      widths[col + i] = Math.max(widths[col + i] ?? 0, width);
    }
  }
  return widths;
}

export function gridFitContentWidthPx(attrs: Record<string, unknown>): number {
  const dims = resolvePageDimensionsPx(
    attrs.pageSize,
    attrs.customPageSize,
    attrs.pageOrientation,
  );
  const margins = resolvePageMarginsPx(attrs.pageMargins, attrs.customPageMargins);
  return dims.width - margins.left - margins.right;
}

/**
 * Append the one-shot grid-fit mutations to an existing transaction.
 *
 * Keeping this as an explicit command (rather than an appendTransaction hook)
 * is intentional: hydration/import replacements need the repair, but a user who
 * later drags a column beyond the page edge is authoring real geometry and must
 * not have that choice continuously clamped away.
 */
function fitTableGridsToPageTransaction(
  state: Pick<EditorState, "doc">,
  transaction: Transaction,
): boolean {
  const fallbackWidth = gridFitContentWidthPx(
    (state.doc.attrs ?? {}) as Record<string, unknown>,
  );
  const boundaries = sectionBreakBoundaries(state.doc);
  const layouts = normalizeSectionLayouts(state.doc.attrs.sectionLayouts);
  // A present but incomplete chain cannot authorize rewriting table geometry
  // using the last section's document-wide fallback.
  if (state.doc.attrs.sectionLayouts != null && layouts?.length !== boundaries.length + 1) {
    return false;
  }
  let sectionIndex = 0;

  let changed = false;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== "table") return true;
    while (sectionIndex < boundaries.length && pos >= boundaries[sectionIndex].to) {
      sectionIndex += 1;
    }
    const layout = layouts?.[sectionIndex];
    const contentWidth = layout
      ? (layout.pageSize.widthTwips - layout.pageMargins.leftTwips
          - layout.pageMargins.rightTwips - layout.pageMargins.gutterTwips) / 15
      : fallbackWidth;
    if (!Number.isFinite(contentWidth) || contentWidth <= 0) return false;
    // An explicit Word fixed initial width is authored geometry. Never heal it
    // into the page width; doing so would silently change the saved native
    // policy. Other modes may safely materialize fitted view geometry.
    if (node.attrs.tableLayoutPolicy === "initial_fixed") return false;
    // Raw import geometry must survive save/export. Its NodeView applies the
    // bounded visual fit without rewriting these shared semantic widths.
    if (nativeTableGridWidths(node)) return false;
    const columns = tableColumnWidths(node);
    const total = columns.reduce((sum, width) => sum + width, 0);
    if (total <= contentWidth || total <= 0) return false;
    const scale = contentWidth / total;
    node.descendants((cell, cellOffset) => {
      if (cell.type.name === "tableRow") return true;
      if (!CELL_TYPES.has(cell.type.name)) return false;
      const colwidth = Array.isArray(cell.attrs.colwidth)
        ? (cell.attrs.colwidth as unknown[])
        : null;
      if (!colwidth || !colwidth.some((w) => typeof w === "number" && w > 0)) {
        return false;
      }
      const fitted = colwidth.map((value) =>
        typeof value === "number" && Number.isFinite(value) && value > 0
          ? Math.max(1, Math.floor(value * scale))
          : 0,
      );
      transaction.setNodeMarkup(pos + 1 + cellOffset, undefined, {
        ...cell.attrs,
        colwidth: fitted,
      });
      changed = true;
      return false;
    });
    // Nested tables live inside cell content width, not the page grid — the
    // outer fit already rescues the scroll container.
    return false;
  });
  return changed;
}

const TableGridFit = Extension.create({
  name: "tableGridFit",

  addCommands() {
    return {
      fitTableGridsToPage:
        () =>
        ({ state, tr }) => {
          const changed = fitTableGridsToPageTransaction(state, tr);
          if (changed) {
            trustReadOnlyDocumentMutation(tr, "layout-normalization");
          }
          return changed;
        },
    };
  },

  onCreate() {
    const { editor } = this;
    const { state } = editor;
    const tr = state.tr;
    if (!fitTableGridsToPageTransaction(state, tr)) return;
    trustReadOnlyDocumentMutation(tr, "layout-normalization");
    editor.view.dispatch(tr);
  },
});

export default TableGridFit;
