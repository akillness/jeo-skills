/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Pure helpers for the document **table-styles gallery** — one-click banded-row /
 * header-row table design themes (Word/WPS "Table Styles"). A theme is a small
 * coordinated recipe that, given a table's geometry, decides the SHADING and
 * BORDER preset for every cell so the table reads as a designed object rather
 * than a raw grid.
 *
 * ── Why this is docx-round-trip safe ─────────────────────────────────────────
 * A theme stamps the two per-cell attributes the editor + scratch DOCX export
 * already own:
 *   - `backgroundColor` (#rrggbb)  → exported as `<w:shd w:fill=…>`, re-imported
 *   - `borderStyle` ("all"|"none"|"outline") → the cell border preset
 * The selected theme + option switches are additionally stored as closed table
 * attrs in native page JSON. Source-bound original-package visual patchback is
 * deliberately a separate backend contract; this module does not claim it.
 *
 * ── Security ─────────────────────────────────────────────────────────────────
 * Every color a theme emits is a literal constant baked into this module (no
 * computed color, no user input), and the border value is from the existing
 * closed whitelist. The values still route through the same strict normalizers
 * (`normalizeCellBackgroundColor` / `normalizeCellBorderStyle`) at the apply
 * site, so even a forged theme entry could not inject CSS. Mirrors the security
 * model documented in `tableCellStyle.ts`.
 *
 * ── Header detection ─────────────────────────────────────────────────────────
 * "Header row" here means the FIRST table row visually — in this editor the
 * header row's cells are `tableHeader` nodes (and the DOCX exporter marks that
 * row `<w:tblHeader/>`). The caller passes whether row 0 is a header so the
 * theme can give it a heavier fill. A theme that wants a header look on a table
 * with no header row simply shades row 0 as a header anyway (the look is driven
 * by the row index, independent of the node type), so the gallery is useful
 * even on plain bodies.
 *
 * No TipTap / React imports: the recipe is a pure function of geometry so it can
 * be unit-tested in isolation and reused by the toolbar apply path.
 */

import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TableMap } from "@tiptap/pm/tables";

import type { CellBorderStyle } from "./tableCellStyle";

/** The per-cell visual a theme assigns. `null` = clear that attribute. */
export interface TableCellThemePatch {
  /** Fill color (#rrggbb) or `null` to clear any prior shading. */
  backgroundColor: string | null;
  /** Border preset, or `null` to leave the cell's border untouched-by-clear. */
  borderStyle: CellBorderStyle | null;
}

/** Table geometry a theme is computed against. */
export interface TableGeometry {
  /** Number of rows (>= 0). */
  rowCount: number;
  /** Number of columns (>= 0). Reserved for column-banding themes. */
  columnCount: number;
  /**
   * Whether the first row is a header row (its cells are `tableHeader` nodes).
   * Only affects which fill the FIRST row receives; banding of the body rows is
   * the same regardless. When false, a theme with a header look still styles
   * row 0 as its header (look follows row index, not node type).
   */
  hasHeaderRow: boolean;
}

/** A gallery entry: a stable id, a display label, and its recipe. */
export interface TableStyleTheme {
  /** Stable machine id (data-testid + lookup); never localized. */
  id: string;
  /** Human label shown in the gallery. */
  label: string;
  /**
   * The fill applied to the FIRST (header) row, or `null` for no header fill.
   * Kept on the entry (not just in the function) so the gallery can render a
   * representative swatch without running the recipe.
   */
  headerFill: string | null;
  /** The fill applied to "band A" body rows (the lighter / unshaded band). */
  bandFillA: string | null;
  /** The fill applied to "band B" body rows (the shaded band). */
  bandFillB: string | null;
  /** Border preset every cell in the table receives. */
  border: CellBorderStyle;
}

export type TableStyleColorFamilyId =
  "grey" | "blue" | "green" | "orange" | "purple";

export interface TableStyleColorFamily {
  id: TableStyleColorFamilyId;
  label: string;
  swatch: string;
}

/** Persisted Word-style table design switches owned by the table node. */
export interface TableStyleOptions {
  totalRow: boolean;
  firstColumn: boolean;
  lastColumn: boolean;
  bandedRows: boolean;
  bandedColumns: boolean;
}

export const DEFAULT_TABLE_STYLE_OPTIONS: Readonly<TableStyleOptions> =
  Object.freeze({
    totalRow: false,
    firstColumn: false,
    lastColumn: false,
    bandedRows: false,
    bandedColumns: false,
  });

/** Read the closed boolean style-option shape from persisted table attrs. */
export function tableStyleOptionsFromAttrs(
  attrs: Record<string, unknown> | null | undefined,
): TableStyleOptions {
  return {
    totalRow: attrs?.tableStyleTotalRow === true,
    firstColumn: attrs?.tableStyleFirstColumn === true,
    lastColumn: attrs?.tableStyleLastColumn === true,
    bandedRows: attrs?.tableStyleBandedRows === true,
    bandedColumns: attrs?.tableStyleBandedColumns === true,
  };
}

/** Theme defaults match the gallery preview: banded themes start with rows on. */
export function defaultTableStyleOptionsForTheme(
  theme: TableStyleTheme,
): TableStyleOptions {
  return {
    ...DEFAULT_TABLE_STYLE_OPTIONS,
    bandedRows: theme.id.startsWith("banded-") || theme.id.startsWith("list-"),
  };
}

/** Canonical attrs written in the same transaction as the per-cell visuals. */
export function tableStyleNodeAttrs(
  theme: TableStyleTheme,
  options: TableStyleOptions,
): Record<string, unknown> {
  return {
    tableStyleTheme: theme.id,
    tableStyleTotalRow: options.totalRow,
    tableStyleFirstColumn: options.firstColumn,
    tableStyleLastColumn: options.lastColumn,
    tableStyleBandedRows: options.bandedRows,
    tableStyleBandedColumns: options.bandedColumns,
  };
}

// ── Literal theme palettes (no computed colors → no injection surface) ────────
//
// All fills are soft Word/WPS-style tints drawn from the same family as the
// curated cell-shading swatches. Each theme pairs a header fill with two body
// bands (one of which may be "no fill" to read as classic banded rows).

const GREY_HEADER = "#e5e7eb";
const GREY_BAND = "#f3f4f6";

const BLUE_HEADER = "#1f3864"; // deep header (white text reads on it visually)
const BLUE_BAND = "#dbeafe";

const GREEN_HEADER = "#166534";
const GREEN_BAND = "#dcfce7";

const ORANGE_HEADER = "#fed7aa";
const ORANGE_BAND = "#fff7ed";

const PURPLE_HEADER = "#e9d5ff";
const PURPLE_BAND = "#faf5ff";

const NONE: null = null;

export const TABLE_STYLE_COLOR_FAMILIES: readonly TableStyleColorFamily[] =
  Object.freeze([
    { id: "grey", label: "Grey", swatch: GREY_HEADER },
    { id: "blue", label: "Blue", swatch: BLUE_HEADER },
    { id: "green", label: "Green", swatch: GREEN_HEADER },
    { id: "orange", label: "Orange", swatch: ORANGE_HEADER },
    { id: "purple", label: "Purple", swatch: PURPLE_HEADER },
  ]);

/**
 * The frozen gallery registry. Order = display order. Every theme is a
 * coordinated header + 2-band + border recipe; "plain" themes use a `null`
 * band so the look is true banded rows (shaded / unshaded alternation).
 */
export const TABLE_STYLE_THEMES: readonly TableStyleTheme[] = Object.freeze([
  {
    id: "plain",
    label: "Plain Table",
    // No header tint, no banding, no borders — the neutral "clear styling" entry
    // so a user can strip a previously applied theme in one click.
    headerFill: NONE,
    bandFillA: NONE,
    bandFillB: NONE,
    border: "all",
  },
  {
    id: "grid-grey",
    label: "Grid (Grey Header)",
    headerFill: GREY_HEADER,
    bandFillA: NONE,
    bandFillB: NONE,
    border: "all",
  },
  {
    id: "grid-blue",
    label: "Grid (Blue Header)",
    headerFill: BLUE_HEADER,
    bandFillA: NONE,
    bandFillB: NONE,
    border: "all",
  },
  {
    id: "grid-green",
    label: "Grid (Green Header)",
    headerFill: GREEN_HEADER,
    bandFillA: NONE,
    bandFillB: NONE,
    border: "all",
  },
  {
    id: "grid-orange",
    label: "Grid (Orange Header)",
    headerFill: ORANGE_HEADER,
    bandFillA: NONE,
    bandFillB: NONE,
    border: "all",
  },
  {
    id: "grid-purple",
    label: "Grid (Purple Header)",
    headerFill: PURPLE_HEADER,
    bandFillA: NONE,
    bandFillB: NONE,
    border: "all",
  },
  {
    id: "banded-grey",
    label: "Banded Rows (Grey)",
    headerFill: GREY_HEADER,
    bandFillA: NONE,
    bandFillB: GREY_BAND,
    border: "all",
  },
  {
    id: "banded-blue",
    label: "Banded Rows (Blue)",
    headerFill: BLUE_HEADER,
    bandFillA: NONE,
    bandFillB: BLUE_BAND,
    border: "all",
  },
  {
    id: "banded-green",
    label: "Banded Rows (Green)",
    headerFill: GREEN_HEADER,
    bandFillA: NONE,
    bandFillB: GREEN_BAND,
    border: "all",
  },
  {
    id: "banded-orange",
    label: "Banded Rows (Orange)",
    headerFill: ORANGE_HEADER,
    bandFillA: NONE,
    bandFillB: ORANGE_BAND,
    border: "all",
  },
  {
    id: "banded-purple",
    label: "Banded Rows (Purple)",
    headerFill: PURPLE_HEADER,
    bandFillA: NONE,
    bandFillB: PURPLE_BAND,
    border: "all",
  },
  {
    id: "header-grey",
    label: "Header Row (Grey)",
    headerFill: GREY_HEADER,
    bandFillA: NONE,
    bandFillB: NONE,
    border: "outline",
  },
  {
    id: "header-blue",
    label: "Header Row (Blue)",
    headerFill: BLUE_HEADER,
    bandFillA: NONE,
    bandFillB: NONE,
    border: "outline",
  },
  {
    id: "header-green",
    label: "Header Row (Green)",
    headerFill: GREEN_HEADER,
    bandFillA: NONE,
    bandFillB: NONE,
    border: "outline",
  },
  {
    id: "header-orange",
    label: "Header Row (Orange)",
    headerFill: ORANGE_HEADER,
    bandFillA: NONE,
    bandFillB: NONE,
    border: "outline",
  },
  {
    id: "header-purple",
    label: "Header Row (Purple)",
    headerFill: PURPLE_HEADER,
    bandFillA: NONE,
    bandFillB: NONE,
    border: "outline",
  },
  {
    id: "list-grey",
    label: "List (Grey)",
    headerFill: GREY_HEADER,
    bandFillA: NONE,
    bandFillB: GREY_BAND,
    border: "none",
  },
  {
    id: "list-blue",
    label: "List (Blue)",
    headerFill: BLUE_BAND,
    bandFillA: NONE,
    bandFillB: "#eff6ff",
    border: "none",
  },
  {
    id: "list-green",
    label: "List (Green)",
    headerFill: GREEN_BAND,
    bandFillA: NONE,
    bandFillB: "#f0fdf4",
    border: "none",
  },
  {
    id: "list-orange",
    label: "List (Orange)",
    headerFill: ORANGE_HEADER,
    bandFillA: NONE,
    bandFillB: ORANGE_BAND,
    border: "none",
  },
  {
    id: "list-purple",
    label: "List (Purple)",
    headerFill: PURPLE_HEADER,
    bandFillA: NONE,
    bandFillB: PURPLE_BAND,
    border: "none",
  },
]);

const THEME_BY_ID: ReadonlyMap<string, TableStyleTheme> = new Map(
  TABLE_STYLE_THEMES.map((theme) => [theme.id, theme]),
);

/** Resolve a theme by id (never throws; unknown → `null`). */
export function getTableStyleTheme(id: string): TableStyleTheme | null {
  return THEME_BY_ID.get(id) ?? null;
}

/** Resolve a persisted theme id without trimming or case-folding provenance. */
export function tableStyleThemeFromAttrs(
  attrs: Record<string, unknown> | null | undefined,
): TableStyleTheme | null {
  return typeof attrs?.tableStyleTheme === "string"
    ? getTableStyleTheme(attrs.tableStyleTheme)
    : null;
}

export function tableStyleColorFamilyFromTheme(
  theme: TableStyleTheme | null | undefined,
): TableStyleColorFamilyId | null {
  if (!theme) return null;
  const family = theme.id.split("-").at(-1);
  return family === "grey" ||
    family === "blue" ||
    family === "green" ||
    family === "orange" ||
    family === "purple"
    ? family
    : null;
}

/** Change only the color family while preserving Grid/Banded/Header/List anatomy. */
export function tableStyleThemeForColorFamily(
  theme: TableStyleTheme | null | undefined,
  family: TableStyleColorFamilyId,
): TableStyleTheme | null {
  if (!theme || !tableStyleColorFamilyFromTheme(theme)) return null;
  const separator = theme.id.lastIndexOf("-");
  if (separator <= 0) return null;
  return getTableStyleTheme(`${theme.id.slice(0, separator)}-${family}`);
}

/**
 * Compute the visual patch for a SINGLE cell at (rowIndex, colIndex) under a
 * theme + table geometry. `rowIndex` is 0-based from the top.
 *
 *   - Row 0 (the header row) → the theme's `headerFill`.
 *   - Body rows alternate `bandFillA` / `bandFillB`. The FIRST body row is
 *     band A. With a header row, body rows start at index 1; without one, the
 *     header look is applied to row 0 and banding begins at row 1 as well, so
 *     the alternation reads consistently either way.
 *   - Every cell gets the theme's `border` preset.
 *
 * Returns `{ backgroundColor, borderStyle }` where a `null` background means
 * "clear any prior fill on this cell" — so re-stamping a lighter theme or the
 * "plain" theme deterministically removes stale shading rather than layering.
 */
export function tableCellThemePatch(
  theme: TableStyleTheme,
  geometry: TableGeometry,
  rowIndex: number,
  columnIndex: number,
  styleOptions?: TableStyleOptions,
): TableCellThemePatch {
  // Calls from the legacy pure grid helper omit options; preserve its historic
  // header + row-banding recipe while the product path always supplies the
  // persisted switches below.
  if (!styleOptions) {
    if (rowIndex === 0) {
      return { backgroundColor: theme.headerFill, borderStyle: theme.border };
    }
    const bodyOrdinal = rowIndex - 1;
    const fill = bodyOrdinal % 2 === 0 ? theme.bandFillA : theme.bandFillB;
    return { backgroundColor: fill, borderStyle: theme.border };
  }

  const lastRowIndex = Math.max(0, geometry.rowCount - 1);
  const lastColumnIndex = Math.max(0, geometry.columnCount - 1);
  const isHeaderRow = geometry.hasHeaderRow && rowIndex === 0;
  if (isHeaderRow) {
    return { backgroundColor: theme.headerFill, borderStyle: theme.border };
  }

  let fill: string | null = null;
  if (styleOptions.totalRow && rowIndex === lastRowIndex) {
    fill = theme.headerFill ?? theme.bandFillB;
  } else if (
    (styleOptions.firstColumn && columnIndex === 0) ||
    (styleOptions.lastColumn && columnIndex === lastColumnIndex)
  ) {
    fill = theme.headerFill ?? theme.bandFillB;
  } else if (styleOptions.bandedColumns) {
    fill = columnIndex % 2 === 0 ? theme.bandFillA : theme.bandFillB;
  } else if (styleOptions.bandedRows) {
    const bodyOrdinal = rowIndex - (geometry.hasHeaderRow ? 1 : 0);
    fill = bodyOrdinal % 2 === 0 ? theme.bandFillA : theme.bandFillB;
  }
  return { backgroundColor: fill, borderStyle: theme.border };
}

/**
 * Compute the patch for EVERY cell of a table as a row-major 2-D array
 * (`patches[rowIndex][colIndex]`). Pure: used by the toolbar to drive a single
 * batched transaction that stamps each cell. A 0-row or 0-column geometry yields
 * an empty grid (no cells to style).
 */
export function tableStylePatchGrid(
  theme: TableStyleTheme,
  geometry: TableGeometry,
): TableCellThemePatch[][] {
  const rows = Math.max(0, Math.floor(geometry.rowCount));
  const cols = Math.max(0, Math.floor(geometry.columnCount));
  const grid: TableCellThemePatch[][] = [];
  for (let r = 0; r < rows; r += 1) {
    const rowPatches: TableCellThemePatch[] = [];
    for (let c = 0; c < cols; c += 1) {
      rowPatches.push(tableCellThemePatch(theme, geometry, r, c));
    }
    grid.push(rowPatches);
  }
  return grid;
}

/** A located table cell: the cell node, its absolute doc position, its row. */
export interface LocatedStyleCell {
  node: ProseMirrorNode;
  /** Absolute document position of the cell node. */
  pos: number;
  /** 0-based row index from the top of the table. */
  rowIndex: number;
  /** 0-based logical grid column (colspan/rowspan aware). */
  columnIndex: number;
}

/** A table's cells (with absolute positions) plus its derived geometry. */
export interface LocatedTable {
  cells: LocatedStyleCell[];
  geometry: TableGeometry;
}

/**
 * Walk a ProseMirror `table` node and return every `tableCell`/`tableHeader`
 * with its ABSOLUTE document position, plus the table's geometry (row count,
 * widest-row column count, and whether row 0 is an all-`tableHeader` header row).
 *
 * Position math mirrors the proven walk in tableFormulaPlugin's
 * `locateTableCells`: the table's first child is at `tablePos + 1`, a row's
 * first child at `rowPos + 1`, so a cell sits at `rowPos + 1 + cellOffset`.
 * Banding is by ROW INDEX (not the colspan/rowspan grid), so a plain per-child
 * walk is correct. Kept here (pure, no editor import) so the position/geometry
 * logic can be unit-tested against a real document node without pulling in the
 * toolbar.
 */
export function locateTableStyleCells(
  table: ProseMirrorNode,
  tablePos: number,
): LocatedTable {
  const cells: LocatedStyleCell[] = [];
  const tableMap = TableMap.get(table);
  const firstGridIndexByOffset = new Map<number, number>();
  tableMap.map.forEach((offset, gridIndex) => {
    if (!firstGridIndexByOffset.has(offset)) {
      firstGridIndexByOffset.set(offset, gridIndex);
    }
  });
  let rowIndex = -1;
  let firstRowSeen = false;
  let firstRowAllHeader = false;
  table.forEach((row, rowOffset) => {
    if (row.type.name !== "tableRow") {
      rowIndex += 1;
      return;
    }
    rowIndex += 1;
    if (rowIndex === 0) {
      firstRowSeen = true;
      firstRowAllHeader = true; // assume header until a non-header cell appears.
    }
    const rowPos = tablePos + 1 + rowOffset;
    row.forEach((cell, cellOffset) => {
      if (cell.type.name !== "tableCell" && cell.type.name !== "tableHeader") {
        return;
      }
      const absolutePos = rowPos + 1 + cellOffset;
      // TableMap offsets are relative to the table's CONTENT start (the first
      // row open token is offset 0); absolute node positions include the table
      // open token, so remove it before lookup.
      const relativeOffset = absolutePos - (tablePos + 1);
      const firstGridIndex = firstGridIndexByOffset.get(relativeOffset);
      cells.push({
        node: cell,
        pos: absolutePos,
        rowIndex: Math.max(0, rowIndex),
        columnIndex:
          firstGridIndex === undefined
            ? 0
            : firstGridIndex % Math.max(1, tableMap.width),
      });
      if (rowIndex === 0 && cell.type.name !== "tableHeader") {
        firstRowAllHeader = false;
      }
    });
  });
  return {
    cells,
    geometry: {
      rowCount: rowIndex + 1,
      columnCount: tableMap.width,
      hasHeaderRow: firstRowSeen && firstRowAllHeader,
    },
  };
}
