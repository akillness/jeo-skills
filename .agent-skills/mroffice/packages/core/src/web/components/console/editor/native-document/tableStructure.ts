/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Pure helpers for Word/WPS table-structure operations that the TipTap commands
 * and the toolbar drive: SPLIT TABLE (at a row), DISTRIBUTE COLUMNS evenly, and
 * DISTRIBUTE ROWS evenly.
 *
 * Kept free of any TipTap/ProseMirror runtime so the geometry math (column count
 * via colspan, even-width distribution, the split point) can be unit-tested in
 * isolation and reused by the command wiring.
 *
 * The table JSON shape is TipTap's: a `table` node whose `content` is `tableRow`
 * nodes, each whose `content` is `tableCell` / `tableHeader` nodes. A cell may
 * carry `colspan` / `rowspan` (default 1) and a `colwidth` attribute that is an
 * ARRAY of per-spanned-column pixel widths (e.g. a colspan-2 cell → `[120, 120]`).
 *
 * PURE: array / integer math only.
 */

import {
  DOCUMENT_TABLE_MAX_COLUMNS,
  DOCUMENT_TABLE_MAX_SYNCHRONOUS_CELLS,
  DOCUMENT_TABLE_MAX_TOTAL_WIDTH_TWIPS,
  documentTablePolicyFromNodeAttrs,
  documentTablePolicyNodeAttrs,
  validateDocumentTableDenseAdmission,
  type DocumentTableDenseAdmission,
  type DocumentTableLayoutPolicy,
} from "./tableLayoutPolicy";
import { TABLE_FRAGMENT_ID_ATTR } from "./paged/tablePagination";
import {
  MAX_ROW_HEIGHT_PX,
  MIN_ROW_HEIGHT_PX,
  normalizeTableRowHeight,
  normalizeTableRowHeightRule,
  normalizeTableRowHeightTwips,
} from "./tableRowStyle";

/** Minimum per-column width (px) a distribute pass will assign. */
export const MIN_DISTRIBUTED_COLUMN_WIDTH = 40;
/** Smallest explicit column width accepted by the native Table Layout field. */
export const MIN_TABLE_COLUMN_WIDTH = 12;
/** Largest one-column width representable inside Word's modeled table bound. */
export const MAX_TABLE_COLUMN_WIDTH = Math.floor(
  DOCUMENT_TABLE_MAX_TOTAL_WIDTH_TWIPS / 15,
);
/** Initial automatic row height shown before the first authored value. */
export const DEFAULT_TABLE_ROW_HEIGHT = 32;
/** Minimum row height (px) a distribute-rows pass will assign. */
export const MIN_DISTRIBUTED_ROW_HEIGHT = 20;
/** Default total table width (px) distribute-columns targets when none is known. */
export const DEFAULT_TABLE_TOTAL_WIDTH = 640;

interface JsonNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown> | null;
  content?: JsonNode[];
}

/** One native Word table-grid width, in twips. */
export function normalizeTableColumnWidthTwips(value: unknown): number | null {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  return Number.isInteger(numeric) &&
    numeric >= 1 &&
    numeric <= DOCUMENT_TABLE_MAX_TOTAL_WIDTH_TWIPS
    ? numeric
    : null;
}

/** Bounded native widths for the grid columns covered by one cell. */
export function normalizeTableColumnWidthsTwips(
  value: unknown,
  expectedLength?: number,
): number[] | null {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > DOCUMENT_TABLE_MAX_COLUMNS ||
    (expectedLength !== undefined && value.length !== expectedLength)
  ) {
    return null;
  }
  const widths = value.map(normalizeTableColumnWidthTwips);
  if (widths.some((width) => width === null)) return null;
  const normalized = widths as number[];
  if (
    normalized.reduce((sum, width) => sum + width, 0) >
    DOCUMENT_TABLE_MAX_TOTAL_WIDTH_TWIPS
  ) {
    return null;
  }
  return normalized;
}

export function tableColumnWidthsTwipsAttributes(
  value: unknown,
): Record<string, string> {
  const widths = normalizeTableColumnWidthsTwips(value);
  return widths
    ? { "data-colwidth-twips": JSON.stringify(widths) }
    : {};
}

export function readTableColumnWidthsTwipsFromElement(element: {
  getAttribute(name: string): string | null;
}): number[] | null {
  const serialized = element.getAttribute("data-colwidth-twips");
  if (!serialized) return null;
  try {
    return normalizeTableColumnWidthsTwips(JSON.parse(serialized));
  } catch {
    return null;
  }
}

function matchingTableColumnWidthsTwips(
  attrs: Record<string, unknown> | null | undefined,
): number[] | null {
  const native = normalizeTableColumnWidthsTwips(attrs?.colwidthTwips);
  const live = attrs?.colwidth;
  if (!native || !Array.isArray(live) || live.length !== native.length) {
    return null;
  }
  return native.every((twips, index) => {
    const px = Number(live[index]);
    return Number.isFinite(px) && px > 0 && Math.abs(px * 15 - twips) <= 2;
  })
    ? native
    : null;
}

/** A cell node's colspan as a positive integer (default 1). */
function cellColspan(cell: JsonNode): number {
  const raw = cell?.attrs?.colspan;
  const n =
    typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/** A cell node's rowspan as a positive integer (default 1). */
function cellRowspan(cell: JsonNode): number {
  const raw = cell?.attrs?.rowspan;
  const n =
    typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

interface TableCellColumn {
  readonly cell: JsonNode;
  /** The first logical grid column the cell covers. */
  readonly column: number;
  readonly colspan: number;
}

/**
 * The logical grid column of every cell, per child of `table.content` (null
 * for a child that is not a row). A cell starts at the first grid column its
 * row still has free: a column a rowspan from a row above covers is skipped,
 * exactly as ProseMirror's TableMap and Word's grid (`w:vMerge`) place it.
 * Counting colspans from column 0 in every row put the cells beside a
 * vertical merge one column to the left. Lenient, like TableMap: an overlap
 * or hole in a malformed table never throws.
 */
function tableCellColumns(
  table: JsonNode,
): Array<readonly TableCellColumn[] | null> {
  const content = Array.isArray(table?.content) ? table.content : [];
  const coveredUntil: number[] = [];
  let physicalRow = -1;
  return content.map((row) => {
    if (!row || row.type !== "tableRow" || !Array.isArray(row.content)) {
      return null;
    }
    physicalRow += 1;
    let column = 0;
    return row.content.map((cell) => {
      while ((coveredUntil[column] ?? 0) > physicalRow) column += 1;
      const colspan = cellColspan(cell);
      const rowspan = cellRowspan(cell);
      if (rowspan > 1) {
        for (let offset = 0; offset < colspan; offset += 1) {
          coveredUntil[column + offset] = Math.max(
            coveredUntil[column + offset] ?? 0,
            physicalRow + rowspan,
          );
        }
      }
      const placement = { cell, column, colspan };
      column += colspan;
      return placement;
    });
  });
}

/**
 * The number of GRID columns a table has, measured from the row with the widest
 * summed colspan (so a header row that spans every column still reports the true
 * width). Returns 0 for a table with no rows/cells. PURE.
 */
export function tableColumnCount(table: JsonNode): number {
  if (!table || !Array.isArray(table.content)) return 0;
  let max = 0;
  for (const row of table.content) {
    if (!row || !Array.isArray(row.content)) continue;
    let width = 0;
    for (const cell of row.content) width += cellColspan(cell);
    if (width > max) max = width;
  }
  return max;
}

/**
 * Admit a materialized TipTap table to the current dense_v1 algorithms before
 * any command clones or rewrites its cells. Word's larger bounds belong to the
 * future sparse/streaming representation; an unknown representation or a grid
 * above the synchronous budget is rejected as one whole object.
 */
export function validateDocumentTableDenseJsonNode(
  table: JsonNode,
  policy?: DocumentTableLayoutPolicy | null,
): DocumentTableDenseAdmission {
  const hasDeclaredPolicy =
    (table.attrs?.tableLayoutPolicy !== null &&
      table.attrs?.tableLayoutPolicy !== undefined) ||
    (table.attrs?.tableFixedWidthTwips !== null &&
      table.attrs?.tableFixedWidthTwips !== undefined);
  const effectivePolicy =
    policy === undefined
      ? documentTablePolicyFromNodeAttrs(table.attrs)
      : policy;
  if (policy === undefined && hasDeclaredPolicy && effectivePolicy === null) {
    return { ok: false, reason: "invalid_layout_policy" };
  }
  const rows = Array.isArray(table.content)
    ? table.content.filter((row) => row?.type === "tableRow")
    : [];
  if (rows.length === 0) {
    return validateDocumentTableDenseAdmission({
      representation: table.attrs?.tableRepresentation,
      rows: 0,
      columns: 0,
      policy: effectivePolicy,
    });
  }
  const maxColumnsForBudget = Math.floor(
    DOCUMENT_TABLE_MAX_SYNCHRONOUS_CELLS / rows.length,
  );
  let columns = 0;
  for (const row of rows) {
    const cells = Array.isArray(row.content) ? row.content : [];
    if (cells.length > maxColumnsForBudget) {
      return { ok: false, reason: "dense_cell_budget_exceeded" };
    }
    let rowColumns = 0;
    for (const cell of cells) {
      rowColumns += cellColspan(cell);
      if (rowColumns > maxColumnsForBudget) {
        return { ok: false, reason: "dense_cell_budget_exceeded" };
      }
    }
    columns = Math.max(columns, rowColumns);
  }
  return validateDocumentTableDenseAdmission({
    representation: table.attrs?.tableRepresentation,
    rows: rows.length,
    columns,
    policy: effectivePolicy,
  });
}

/**
 * Split `total` px across `count` columns as evenly as possible with integer
 * widths whose sum is EXACTLY `total` (the remainder is spread one px at a time
 * across the leading columns). Each width is floored at
 * {@link MIN_DISTRIBUTED_COLUMN_WIDTH}. Returns [] for count ≤ 0. PURE.
 */
export function evenColumnWidths(count: number, total: number): number[] {
  if (!Number.isFinite(count) || count <= 0) return [];
  const n = Math.floor(count);
  const safeTotal = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  const base = Math.floor(safeTotal / n);
  let remainder = safeTotal - base * n;
  const widths: number[] = [];
  for (let i = 0; i < n; i += 1) {
    let w = base;
    if (remainder > 0) {
      w += 1;
      remainder -= 1;
    }
    widths.push(Math.max(MIN_DISTRIBUTED_COLUMN_WIDTH, w));
  }
  return widths;
}

/**
 * The current total table width (px), summed from the FIRST row's per-column
 * colwidth arrays. Falls back to {@link DEFAULT_TABLE_TOTAL_WIDTH} when no widths
 * are recorded (a fresh table whose columns have never been resized), so a
 * distribute pass still produces sensible widths. PURE.
 */
export function tableTotalWidth(table: JsonNode): number {
  const firstRow = table?.content?.find(
    (n) => n?.type === "tableRow" && Array.isArray(n.content),
  );
  if (!firstRow || !Array.isArray(firstRow.content)) {
    return DEFAULT_TABLE_TOTAL_WIDTH;
  }
  let sum = 0;
  let sawWidth = false;
  for (const cell of firstRow.content) {
    const nativeWidths = matchingTableColumnWidthsTwips(cell?.attrs);
    if (nativeWidths) {
      sum += nativeWidths.reduce((total, width) => total + width, 0) / 15;
      sawWidth = true;
      continue;
    }
    const cw = cell?.attrs?.colwidth;
    if (Array.isArray(cw)) {
      for (const w of cw) {
        const n = typeof w === "number" ? w : Number.parseFloat(String(w));
        if (Number.isFinite(n) && n > 0) {
          sum += n;
          sawWidth = true;
        }
      }
    }
  }
  return sawWidth && sum > 0 ? Math.round(sum) : DEFAULT_TABLE_TOTAL_WIDTH;
}

/**
 * Resolve one complete live width plan from the materialized table grid. Live
 * pixel widths win; exact imported twips are a fallback when a cell has not yet
 * acquired a browser width. Like the DOCX writer, the first usable value for a
 * grid column is authoritative across rowspans/colspans.
 */
export function materializedColumnWidths(table: JsonNode): number[] | null {
  const columns = tableColumnCount(table);
  if (columns <= 0 || !Array.isArray(table.content)) return null;
  const widths = new Array<number>(columns).fill(0);
  for (const row of tableCellColumns(table)) {
    if (!row) continue;
    for (const { cell, column, colspan: span } of row) {
      const live = Array.isArray(cell.attrs?.colwidth)
        ? cell.attrs.colwidth.map((value) => Number(value))
        : null;
      const validLive =
        live?.length === span &&
        live.every((value) => Number.isFinite(value) && value > 0)
          ? live
          : null;
      const native = normalizeTableColumnWidthsTwips(
        cell.attrs?.colwidthTwips,
        span,
      );
      const resolved =
        validLive ?? native?.map((widthTwips) => widthTwips / 15) ?? null;
      for (let offset = 0; offset < span; offset += 1) {
        if (!(widths[column + offset] > 0) && resolved?.[offset]) {
          widths[column + offset] = resolved[offset];
        }
      }
    }
  }
  return widths.length === columns &&
    widths.every((width) => Number.isFinite(width) && width > 0)
    ? widths
    : null;
}

/**
 * The imported native grid (`colwidthTwips`) of every grid column, read as
 * {@link materializedColumnWidths} reads the live widths: the first cell whose
 * twips state its whole span is authoritative for those columns. Null when a
 * column has no such cell (the table never carried a native grid).
 */
export function materializedColumnWidthsTwips(table: JsonNode): number[] | null {
  const columns = tableColumnCount(table);
  if (columns <= 0 || !Array.isArray(table.content)) return null;
  const widths = new Array<number>(columns).fill(0);
  for (const row of tableCellColumns(table)) {
    if (!row) continue;
    for (const { cell, column, colspan: span } of row) {
      const native = normalizeTableColumnWidthsTwips(cell.attrs?.colwidthTwips, span);
      if (!native) continue;
      for (let offset = 0; offset < span; offset += 1) {
        if (!(widths[column + offset] > 0)) widths[column + offset] = native[offset]!;
      }
    }
  }
  return widths.every((width) => width > 0) ? widths : null;
}

/**
 * Give an unsized table the column widths it is drawn at, so Distribute
 * Columns has a grid to redistribute (a table inserted from the ribbon models
 * no widths until a column is resized). A table that already models every
 * width, or a measurement that does not fit its grid, is returned as is. PURE.
 */
export function seedMissingColumnWidths(
  table: JsonNode,
  renderedWidths: readonly number[],
): JsonNode {
  if (materializedColumnWidths(table) !== null) return table;
  if (
    renderedWidths.length !== tableColumnCount(table) ||
    !renderedWidths.every((width) => Number.isFinite(width) && width > 0)
  ) {
    return table;
  }
  return applyColumnWidths(
    table,
    renderedWidths.map((width) => Math.round(width)),
  );
}

/**
 * Resolve the width shown by Table Layout for one unambiguous grid column.
 * Unsized tables use the same bounded initial geometry as the existing table
 * commands; the value is not persisted until the user commits a change.
 */
export function tableColumnWidth(
  table: JsonNode,
  columnIndex: number,
): number | null {
  if (!validateDocumentTableDenseJsonNode(table).ok) return null;
  const columns = tableColumnCount(table);
  if (
    !Number.isInteger(columnIndex) ||
    columnIndex < 0 ||
    columnIndex >= columns
  ) {
    return null;
  }
  const widths =
    materializedColumnWidths(table) ??
    evenColumnWidths(columns, tableTotalWidth(table));
  const width = widths[columnIndex];
  return Number.isFinite(width) && width > 0 ? Math.round(width) : null;
}

/**
 * The width a grid column is stored at, unrounded: an imported twip width
 * (100.4 px from 1506 twips) or one typed in centimetres (3 cm, 113.3858 px).
 * The ribbon shows it where the column is drawn at that width.
 */
export function tableColumnWidthExact(
  table: JsonNode,
  columnIndex: number,
): number | null {
  const widths = materializedColumnWidths(table);
  const width = widths?.[columnIndex];
  return width !== undefined && Number.isFinite(width) && width > 0 ? width : null;
}

/**
 * Set one Word table grid-column width. The complete grid is materialized so
 * every row and merged cell receives the same per-column geometry, while the
 * total remains inside the bounded DOCX table width. One immutable transform
 * lets the command publish this as one transaction and one Undo step.
 */
export function setTableColumnWidth(
  table: JsonNode,
  columnIndex: number,
  widthPx: number,
  drawnWidths?: readonly number[] | null,
): JsonNode {
  if (!validateDocumentTableDenseJsonNode(table).ok) return table;
  const columns = tableColumnCount(table);
  // Kept to the twip (a fifteenth of a pixel), not a whole pixel: a width
  // typed in centimetres (1 cm is 37.8 px) read back as 1.01 cm and drifted
  // at each step (2.75, 2.86 …), and its export was off by up to 7 twips.
  // Whole twips, as the Word package states a grid column (its save refuses
  // a width more than 0.01 px off one).
  const width = Math.round(Math.round(widthPx * 15) / 15 * 10_000) / 10_000;
  if (
    !Number.isInteger(columnIndex) ||
    columnIndex < 0 ||
    columnIndex >= columns ||
    !Number.isFinite(widthPx) ||
    Math.round(width) < MIN_TABLE_COLUMN_WIDTH ||
    Math.round(width) > MAX_TABLE_COLUMN_WIDTH
  ) {
    return table;
  }
  // Word sets the one column and keeps every other at the width it is drawn
  // at (its preferred width becomes that drawn width): a table squeezed into
  // a narrow cell or text area must not make the other columns jump when one
  // is set (WUA 006). Without a drawn grid, the stored one.
  const drawn =
    drawnWidths &&
    drawnWidths.length === columns &&
    drawnWidths.every((value) => Number.isFinite(value) && value > 0)
      ? [...drawnWidths]
      : null;
  const widths =
    drawn ??
    materializedColumnWidths(table) ??
    evenColumnWidths(columns, tableTotalWidth(table));
  // A width the column already has is no edit, so an imported exact width
  // keeps its native precision: the same width within a hundredth of a
  // pixel, or the whole pixel a drawn width (100.4 px drawn as 100) is
  // confirmed at.
  if (
    widths.length !== columns ||
    Math.abs(widths[columnIndex] - width) < 0.01 ||
    (Number.isInteger(width) && Math.round(widths[columnIndex]) === width)
  ) {
    return table;
  }
  const nextWidths = widths.map((current, index) =>
    index === columnIndex ? width : current,
  );
  if (
    nextWidths.reduce((sum, current) => sum + current, 0) >
    MAX_TABLE_COLUMN_WIDTH
  ) {
    return table;
  }
  return withoutTableLayoutPolicy(applyColumnWidths(table, nextWidths));
}

export interface TableRowHeightValue {
  readonly heightPx: number;
  /** The row's exact height (its twips, when they agree with heightPx). */
  readonly exactHeightPx: number;
  readonly rule: "atLeast" | "exact";
}

/** Resolve one physical row's authored height, or Word's editable auto value. */
export function tableRowHeight(
  table: JsonNode,
  rowIndex: number,
): TableRowHeightValue | null {
  if (!validateDocumentTableDenseJsonNode(table).ok) return null;
  const rows = (table.content ?? []).filter(
    (node) => node?.type === "tableRow",
  );
  if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= rows.length) {
    return null;
  }
  const row = rows[rowIndex];
  if (!row) return null;
  const heightPx =
    normalizeTableRowHeight(row.attrs?.rowHeight) ?? DEFAULT_TABLE_ROW_HEIGHT;
  const twips = normalizeTableRowHeightTwips(row.attrs?.rowHeightTwips);
  return {
    heightPx,
    exactHeightPx:
      twips !== null && Math.round(twips / 15) === heightPx
        ? twips / 15
        : heightPx,
    rule: normalizeTableRowHeightRule(row.attrs?.rowHeightRule) ?? "atLeast",
  };
}

/**
 * Set one physical row height without disturbing header, pagination, cell, or
 * table geometry. Native twips are retained for an unchanged visible value;
 * an actual edit states the twips typed (`heightTwips`, a value given in
 * centimetres or inches: 1 cm is 567 twips, not the 570 of its nearest whole
 * pixel), or clears them so export derives a fresh measurement.
 */
export function setTableRowHeight(
  table: JsonNode,
  rowIndex: number,
  heightPx: number,
  rule: "atLeast" | "exact" = "atLeast",
  heightTwips?: number,
): JsonNode {
  if (!validateDocumentTableDenseJsonNode(table).ok) return table;
  const height = normalizeTableRowHeight(heightPx);
  if (height === null || normalizeTableRowHeightRule(rule) === null) {
    return table;
  }
  const twips =
    heightTwips === undefined
      ? null
      : normalizeTableRowHeightTwips(heightTwips);
  const statedTwips =
    twips !== null && Math.round(twips / 15) === height ? twips : null;
  let physicalRow = -1;
  let changed = false;
  const content = (table.content ?? []).map((node) => {
    if (node?.type !== "tableRow") return node;
    physicalRow += 1;
    if (physicalRow !== rowIndex) return node;
    const currentHeight = normalizeTableRowHeight(node.attrs?.rowHeight);
    const currentRule =
      normalizeTableRowHeightRule(node.attrs?.rowHeightRule) ?? "atLeast";
    const currentTwips = normalizeTableRowHeightTwips(node.attrs?.rowHeightTwips);
    if (
      currentHeight === height &&
      currentRule === rule &&
      (statedTwips === null || statedTwips === currentTwips)
    ) {
      return node;
    }
    const attrs = { ...(node.attrs ?? {}) };
    delete attrs.rowHeightTwips;
    changed = true;
    return {
      ...node,
      attrs: {
        ...attrs,
        rowHeight: height,
        ...(statedTwips === null ? {} : { rowHeightTwips: statedTwips }),
        rowHeightRule: rule,
      },
    };
  });
  return changed ? { ...table, content } : table;
}

/**
 * A table with explicit cell/grid widths and no AutoFit policy serializes as
 * native `tblLayout=fixed`. Removing only the two policy attrs preserves every
 * other table attribute and keeps arbitrary per-column geometry intact.
 */
function withoutTableLayoutPolicy(table: JsonNode): JsonNode {
  const attrs = { ...(table.attrs ?? {}) };
  delete attrs.tableLayoutPolicy;
  delete attrs.tableFixedWidthTwips;
  return { ...table, attrs };
}

interface DenseTableCellPlacement {
  readonly rowIndex: number;
  readonly cellIndex: number;
  readonly columnIndex: number;
  readonly colspan: number;
  readonly rowspan: number;
  readonly cell: JsonNode;
}

interface DenseTableGrid {
  readonly rows: readonly JsonNode[];
  readonly columns: number;
  readonly placements: readonly DenseTableCellPlacement[];
}

function strictPositiveSpan(value: unknown, maximum: number): number | null {
  const candidate = value ?? 1;
  return typeof candidate === "number" &&
    Number.isInteger(candidate) &&
    candidate >= 1 &&
    candidate <= maximum
    ? candidate
    : null;
}

/**
 * Recover the unique dense logical grid represented by the physical table
 * rows. Unlike a simple per-row colspan sum this accounts for cells covered by
 * a rowspan; any overlap, hole, malformed span, or non-cell child fails closed.
 */
function denseTableGrid(table: JsonNode): DenseTableGrid | null {
  if (!Array.isArray(table.content) || table.content.length < 1) return null;
  const rows = table.content;
  if (
    rows.some((row) => row?.type !== "tableRow" || !Array.isArray(row.content))
  ) {
    return null;
  }
  const occupied = rows.map(() => [] as boolean[]);
  const placements: DenseTableCellPlacement[] = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!row?.content) return null;
    let columnIndex = 0;
    for (let cellIndex = 0; cellIndex < row.content.length; cellIndex += 1) {
      const cell = row.content[cellIndex];
      if (cell?.type !== "tableCell" && cell?.type !== "tableHeader") {
        return null;
      }
      while (occupied[rowIndex][columnIndex]) columnIndex += 1;
      const colspan = strictPositiveSpan(
        cell.attrs?.colspan,
        DOCUMENT_TABLE_MAX_COLUMNS,
      );
      const rowspan = strictPositiveSpan(cell.attrs?.rowspan, rows.length);
      if (
        colspan === null ||
        rowspan === null ||
        rowIndex + rowspan > rows.length ||
        columnIndex + colspan > DOCUMENT_TABLE_MAX_COLUMNS
      ) {
        return null;
      }
      for (let rowOffset = 0; rowOffset < rowspan; rowOffset += 1) {
        for (let columnOffset = 0; columnOffset < colspan; columnOffset += 1) {
          const targetRow = rowIndex + rowOffset;
          const targetColumn = columnIndex + columnOffset;
          if (occupied[targetRow][targetColumn]) return null;
          occupied[targetRow][targetColumn] = true;
        }
      }
      placements.push({
        rowIndex,
        cellIndex,
        columnIndex,
        colspan,
        rowspan,
        cell,
      });
      columnIndex += colspan;
    }
  }

  const columns = occupied.reduce(
    (maximum, row) => Math.max(maximum, row.length),
    0,
  );
  if (
    columns < 1 ||
    columns > DOCUMENT_TABLE_MAX_COLUMNS ||
    columns * rows.length > DOCUMENT_TABLE_MAX_SYNCHRONOUS_CELLS ||
    occupied.some(
      (row) =>
        row.length !== columns ||
        Array.from(
          { length: columns },
          (_value, index) => row[index] !== true,
        ).some(Boolean),
    )
  ) {
    return null;
  }
  return { rows, columns, placements };
}

function positiveCellWidths(value: unknown, span: number): number[] | null {
  if (!Array.isArray(value) || value.length !== span) return null;
  const widths = value.map((entry) =>
    typeof entry === "number" && Number.isFinite(entry) && entry > 0
      ? entry
      : null,
  );
  return widths.some((entry) => entry === null) ? null : (widths as number[]);
}

function sameWidths(
  left: readonly number[] | null,
  right: readonly number[],
): boolean {
  return (
    left !== null &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function evenlySplitInteger(total: number, count: number): number[] | null {
  if (!Number.isInteger(total) || total < count || count < 1) return null;
  const base = Math.floor(total / count);
  let remainder = total - base * count;
  return Array.from({ length: count }, () => {
    const piece = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    return piece;
  });
}

/**
 * Distribute the selected complete physical columns while preserving their
 * authored total. Imported `colwidthTwips` is the sole authority whenever it
 * occurs anywhere in the table; every cell must then carry a complete, matching
 * native/live pair. Tables without native companions may use a complete,
 * consistent integer-pixel grid. Merged cells are supported through the dense
 * placement map and receive the exact slice for every logical column they span.
 * Unselected cells and every non-width attribute retain object identity. PURE.
 */
export function distributeColumnsEvenly(
  table: JsonNode,
  selectedColumnIndexes?: readonly number[],
): JsonNode {
  if (!validateDocumentTableDenseJsonNode(table).ok) return table;
  const grid = denseTableGrid(table);
  if (!grid) return table;
  const selected = selectedColumnIndexes
    ? [...selectedColumnIndexes]
    : Array.from({ length: grid.columns }, (_value, index) => index);
  if (
    selected.length < 2 ||
    new Set(selected).size !== selected.length ||
    selected.some(
      (index) => !Number.isInteger(index) || index < 0 || index >= grid.columns,
    )
  ) {
    return table;
  }
  selected.sort((left, right) => left - right);
  if (
    selected.some(
      (column, index) => index > 0 && column !== selected[index - 1] + 1,
    )
  ) {
    return table;
  }

  const selectedSet = new Set(selected);
  const carriesNative = grid.placements.some(
    ({ cell }) =>
      cell.attrs?.colwidthTwips !== null &&
      cell.attrs?.colwidthTwips !== undefined,
  );
  const nativeGrid = carriesNative
    ? new Array<number | null>(grid.columns).fill(null)
    : null;
  const pixelGrid = new Array<number | null>(grid.columns).fill(null);

  for (const placement of grid.placements) {
    const live = positiveCellWidths(
      placement.cell.attrs?.colwidth,
      placement.colspan,
    );
    if (!live) return table;
    const native = carriesNative
      ? normalizeTableColumnWidthsTwips(
          placement.cell.attrs?.colwidthTwips,
          placement.colspan,
        )
      : null;
    if (carriesNative && !native) return table;
    for (let offset = 0; offset < placement.colspan; offset += 1) {
      const column = placement.columnIndex + offset;
      const liveWidth = live[offset];
      if (carriesNative) {
        const nativeWidth = native?.[offset];
        if (
          nativeWidth === undefined ||
          Math.abs(liveWidth * 15 - nativeWidth) > 2 ||
          (nativeGrid?.[column] !== null &&
            nativeGrid?.[column] !== nativeWidth)
        ) {
          return table;
        }
        if (nativeGrid) nativeGrid[column] = nativeWidth;
      } else if (
        !Number.isInteger(liveWidth) ||
        (pixelGrid[column] !== null && pixelGrid[column] !== liveWidth)
      ) {
        return table;
      }
      if (pixelGrid[column] === null) pixelGrid[column] = liveWidth;
    }
  }
  if (
    pixelGrid.some((width) => width === null) ||
    nativeGrid?.some((width) => width === null)
  ) {
    return table;
  }

  const trustedPixels = pixelGrid as number[];
  const trustedTwips = nativeGrid as number[] | null;
  const nextTwips = trustedTwips ? [...trustedTwips] : null;
  const nextPixels = [...trustedPixels];
  if (nextTwips) {
    const total = selected.reduce((sum, column) => sum + nextTwips[column], 0);
    const pieces = evenlySplitInteger(total, selected.length);
    if (!pieces) return table;
    selected.forEach((column, index) => {
      nextTwips[column] = pieces[index];
      nextPixels[column] = pieces[index] / 15;
    });
  } else {
    const total = selected.reduce((sum, column) => sum + nextPixels[column], 0);
    const pieces = evenlySplitInteger(total, selected.length);
    if (
      !pieces ||
      pieces.some((width) => width < MIN_DISTRIBUTED_COLUMN_WIDTH)
    ) {
      return table;
    }
    selected.forEach((column, index) => {
      nextPixels[column] = pieces[index];
    });
  }

  let changed = false;
  const rows = [...grid.rows];
  for (const placement of grid.placements) {
    const touchesSelection = Array.from(
      { length: placement.colspan },
      (_value, offset) => placement.columnIndex + offset,
    ).some((column) => selectedSet.has(column));
    if (!touchesSelection) continue;
    const liveSlice = nextPixels.slice(
      placement.columnIndex,
      placement.columnIndex + placement.colspan,
    );
    const nativeSlice = nextTwips?.slice(
      placement.columnIndex,
      placement.columnIndex + placement.colspan,
    );
    const currentLive = positiveCellWidths(
      placement.cell.attrs?.colwidth,
      placement.colspan,
    );
    const currentNative = nextTwips
      ? normalizeTableColumnWidthsTwips(
          placement.cell.attrs?.colwidthTwips,
          placement.colspan,
        )
      : null;
    if (
      sameWidths(currentLive, liveSlice) &&
      (!nativeSlice || sameWidths(currentNative, nativeSlice))
    ) {
      continue;
    }
    const sourceRow = rows[placement.rowIndex];
    const sourceCells = sourceRow?.content;
    if (!sourceRow || !sourceCells) return table;
    const cells = [...sourceCells];
    cells[placement.cellIndex] = {
      ...placement.cell,
      attrs: {
        ...(placement.cell.attrs ?? {}),
        colwidth: liveSlice,
        ...(nativeSlice ? { colwidthTwips: nativeSlice } : {}),
      },
    };
    rows[placement.rowIndex] = { ...sourceRow, content: cells };
    changed = true;
  }
  if (!changed) return table;
  // A manual distribute operation is explicit geometry. Clear any active
  // AutoFit policy in the same immutable transform so a later edit cannot
  // recompute the authored widths behind the user's back.
  return withoutTableLayoutPolicy({ ...table, content: rows });
}

/**
 * Freeze the table's current materialized grid (Word "Fixed Column Width").
 * Existing per-column widths — including exact imported twips — are preserved.
 * A never-sized auto table receives the same bounded content estimate already
 * used by AutoFit Contents, then the policy is cleared so subsequent edits do
 * not recompute it. The resulting explicit grid is exported as `tblLayout`
 * fixed by both browser and server writers.
 */
export function fixTableColumnWidths(table: JsonNode): JsonNode {
  if (!validateDocumentTableDenseJsonNode(table).ok) return table;
  const widths = materializedColumnWidths(table);
  const hasPolicy =
    table.attrs?.tableLayoutPolicy !== null &&
    table.attrs?.tableLayoutPolicy !== undefined;
  if (widths && !hasPolicy && table.attrs?.tableFixedWidthTwips == null) {
    return table;
  }
  const materialized = widths
    ? table
    : applyColumnWidths(table, contentColumnWidths(table));
  return materialized === table && !hasPolicy
    ? table
    : withoutTableLayoutPolicy(materialized);
}

/**
 * Distribute the selected physical rows while preserving their modeled total
 * height. Native twips are authoritative and use stable largest-first integer
 * remainder allocation; complete legacy pixel heights are the bounded fallback.
 * An explicit target remains available to legacy pure callers. Unselected rows,
 * cell content, merge geometry, and opaque attributes retain object identity.
 * PURE.
 */
export function distributeRowsEvenly(
  table: JsonNode,
  targetHeight?: number,
  selectedRowIndexes?: readonly number[],
): JsonNode {
  if (!validateDocumentTableDenseJsonNode(table).ok) return table;
  if (!Array.isArray(table.content)) return table;
  const rows = table.content.filter((n) => n?.type === "tableRow");
  if (rows.length === 0) return table;

  const selected = selectedRowIndexes
    ? [...new Set(selectedRowIndexes)].sort((left, right) => left - right)
    : rows.map((_row, index) => index);
  if (
    selected.length < 2 ||
    selected.some(
      (index) => !Number.isInteger(index) || index < 0 || index >= rows.length,
    )
  ) {
    return table;
  }
  const selectedSet = new Set(selected);
  const selectedOffsets = new Map(
    selected.map((physicalRow, offset) => [physicalRow, offset]),
  );
  const selectedRows = selected.map((index) => rows[index]);
  if (selectedRows.some((row) => !row)) return table;

  const effectiveRules = selectedRows.map((row) => {
    const rawRule = row?.attrs?.rowHeightRule;
    const normalizedRule = normalizeTableRowHeightRule(rawRule);
    if (rawRule !== null && rawRule !== undefined && normalizedRule === null) {
      return null;
    }
    return normalizedRule ?? "atLeast";
  });
  const distributedRule = effectiveRules[0];
  if (
    distributedRule === null ||
    effectiveRules.some((rule) => rule !== distributedRule)
  ) {
    return table;
  }

  const rawNativeHeights = selectedRows.map(
    (row) => row?.attrs?.rowHeightTwips,
  );
  const nativePresence = rawNativeHeights.map(
    (height) => height !== null && height !== undefined,
  );
  const nativeHeights = rawNativeHeights.map((height) =>
    normalizeTableRowHeightTwips(height),
  );
  if (nativePresence.some(Boolean)) {
    if (
      !nativePresence.every(Boolean) ||
      nativeHeights.some((height) => height === null) ||
      selectedRows.some(
        (row, index) =>
          normalizeTableRowHeight(row?.attrs?.rowHeight) !==
          normalizeTableRowHeight((nativeHeights[index] as number) / 15),
      )
    ) {
      return table;
    }
  }

  const explicitTarget =
    typeof targetHeight === "number" && Number.isFinite(targetHeight)
      ? Math.max(
          MIN_DISTRIBUTED_ROW_HEIGHT,
          Math.min(MAX_ROW_HEIGHT_PX, Math.floor(targetHeight)),
        )
      : null;
  let pixelPieces: number[];
  let twipPieces: number[] | null = null;

  if (explicitTarget !== null) {
    pixelPieces = selected.map(() => explicitTarget);
  } else if (nativePresence.every(Boolean)) {
    const trustedNative = nativeHeights as number[];
    const totalTwips = trustedNative.reduce(
      (total, height) => total + height,
      0,
    );
    const base = Math.floor(totalTwips / selected.length);
    let remainder = totalTwips - base * selected.length;
    twipPieces = selected.map(() => {
      const piece = base + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
      return piece;
    });
    if (
      twipPieces.some(
        (height) =>
          height < MIN_ROW_HEIGHT_PX * 15 || height > MAX_ROW_HEIGHT_PX * 15,
      )
    ) {
      return table;
    }
    pixelPieces = twipPieces.map((height) => Math.round(height / 15));
  } else {
    const legacyHeights = selectedRows.map((row) =>
      normalizeTableRowHeight(row?.attrs?.rowHeight),
    );
    if (legacyHeights.some((height) => height === null)) return table;
    const totalPixels = (legacyHeights as number[]).reduce(
      (total, height) => total + height,
      0,
    );
    const base = Math.floor(totalPixels / selected.length);
    let remainder = totalPixels - base * selected.length;
    pixelPieces = selected.map(() => {
      const piece = base + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
      return piece;
    });
    if (
      pixelPieces.some(
        (height) =>
          height < MIN_DISTRIBUTED_ROW_HEIGHT || height > MAX_ROW_HEIGHT_PX,
      )
    ) {
      return table;
    }
  }

  let physicalRow = -1;
  let changed = false;
  const content = table.content.map((row) => {
    if (row?.type !== "tableRow") return row;
    physicalRow += 1;
    if (!selectedSet.has(physicalRow)) return row;
    const selectedOffset = selectedOffsets.get(physicalRow);
    if (selectedOffset === undefined) return row;
    const rowAttrs = { ...(row.attrs ?? {}) };
    const nextHeight = pixelPieces[selectedOffset];
    const nextTwips = twipPieces?.[selectedOffset] ?? null;
    const nextRule = distributedRule;
    if (
      normalizeTableRowHeight(rowAttrs.rowHeight) === nextHeight &&
      normalizeTableRowHeightTwips(rowAttrs.rowHeightTwips) === nextTwips &&
      normalizeTableRowHeightRule(rowAttrs.rowHeightRule) === nextRule
    ) {
      return row;
    }
    changed = true;
    if (nextTwips === null) delete rowAttrs.rowHeightTwips;
    return {
      ...row,
      attrs: {
        ...rowAttrs,
        rowHeight: nextHeight,
        ...(nextTwips === null ? {} : { rowHeightTwips: nextTwips }),
        rowHeightRule: nextRule,
      },
    };
  });
  return changed ? { ...table, content } : table;
}

/**
 * Default page-content width (px) "AutoFit Window" stretches a table to when the
 * caller does not pass a measured width (matches a Letter page minus 1" margins
 * at the editor's render scale; the same family of magnitudes as
 * {@link DEFAULT_TABLE_TOTAL_WIDTH}).
 */
export const DEFAULT_AUTOFIT_WINDOW_WIDTH = 720;

/**
 * Approximate per-HALF-WIDTH-character advance (px) used by AutoFit-Contents to
 * estimate a column's natural width from its longest cell text. A coarse
 * average-glyph advance — exact metrics need a DOM measure, but Word's own
 * AutoFit-Contents is itself an estimate, and the goal here is proportional
 * column sizing, not pixel fidelity. East Asian full-width characters advance
 * TWO units (one CJK glyph ≈ the em square ≈ two Latin advances) — with a flat
 * per-character count a CJK table sized to roughly half its natural width.
 */
export const AUTOFIT_CHAR_WIDTH = 8;

/**
 * East Asian full-width / wide characters (CJK ideographs, kana, hangul
 * syllables, CJK punctuation, fullwidth forms). One of these advances ~an em
 * square — two half-width units — under any CJK-capable font.
 */
const FULL_WIDTH_CHAR_RE =
  // Hangul jamo | CJK radicals..Yi (ideographs, kana, bopomofo, CJK
  // punctuation) | Hangul syllables | CJK compat ideographs |
  // vertical/compat forms | fullwidth ASCII/brackets | fullwidth signs.
  /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF01-\uFF60\uFFE0-\uFFE6]/;

/** Per-cell horizontal padding (px, both sides) folded into a content estimate. */
export const AUTOFIT_CELL_PADDING = 16;

/**
 * Upper bound (px) a single AutoFit-Contents column may claim, so one very long
 * line cannot blow the table far past the page. Word similarly caps content fit
 * to the page width; this is a per-column ceiling.
 */
export const AUTOFIT_MAX_COLUMN_WIDTH = 360;

/**
 * The plain text of a cell's content subtree, one line per visual line: every
 * paragraph (any node holding text directly) and every hard line break starts
 * a new line, so AutoFit sizes to the longest line the cell really shows.
 * Joining all the text into one run sized two five-letter paragraphs like one
 * ten-letter line. Text split into runs by marks stays one line. PURE.
 */
function cellText(cell: JsonNode): string {
  const lines: string[] = [];
  let line: string | null = null;
  const visit = (node: JsonNode | undefined): void => {
    if (!node || typeof node !== "object") return;
    if (typeof node.text === "string") {
      line = (line ?? "") + node.text;
      return;
    }
    if (node.type === "hardBreak") {
      lines.push(line ?? "");
      line = "";
      return;
    }
    const children = Array.isArray(node.content) ? node.content : [];
    const textblock = children.some(
      (child) => typeof child?.text === "string" || child?.type === "hardBreak",
    );
    if (textblock) {
      if (line !== null) lines.push(line);
      line = "";
    }
    for (const child of children) visit(child);
    if (textblock) {
      lines.push(line ?? "");
      line = null;
    }
  };
  visit(cell);
  if (line !== null) lines.push(line);
  return lines.join("\n");
}

/**
 * The longest single LINE of a cell's text (newlines split lines), in
 * HALF-WIDTH advance units: an East Asian full-width character counts two (it
 * occupies ~an em square — a flat character count sized CJK tables to half
 * their natural width). A wrapped paragraph's natural width is driven by its
 * longest unwrapped line, so AutoFit-Contents sizes to that rather than the
 * total character count. PURE.
 */
function longestLineLength(text: string): number {
  let max = 0;
  for (const line of text.split(/\r?\n/)) {
    let units = 0;
    for (const ch of line) {
      units += FULL_WIDTH_CHAR_RE.test(ch) ? 2 : 1;
    }
    if (units > max) max = units;
  }
  return max;
}

/**
 * Estimate the natural content width (px) each GRID column needs from the longest
 * cell text in that column (Word "AutoFit Contents"). Returns one width per grid
 * column. A cell spanning N columns contributes its estimate spread across the N
 * columns it covers (so a wide merged header does not over-inflate one column).
 * Every width is clamped to [{@link MIN_DISTRIBUTED_COLUMN_WIDTH},
 * {@link AUTOFIT_MAX_COLUMN_WIDTH}]. Returns [] for a table with no columns. PURE.
 */
export function contentColumnWidths(table: JsonNode): number[] {
  const columns = tableColumnCount(table);
  if (columns <= 0 || !Array.isArray(table.content)) return [];
  const widths = new Array<number>(columns).fill(MIN_DISTRIBUTED_COLUMN_WIDTH);
  for (const row of tableCellColumns(table)) {
    if (!row) continue;
    for (const { cell, column: col, colspan: span } of row) {
      const estimate =
        longestLineLength(cellText(cell)) * AUTOFIT_CHAR_WIDTH +
        AUTOFIT_CELL_PADDING;
      // Spread a spanning cell's estimate evenly across the columns it covers.
      const perColumn = Math.ceil(estimate / span);
      for (let i = 0; i < span; i += 1) {
        const idx = Math.min(col + i, columns - 1);
        if (perColumn > widths[idx]) widths[idx] = perColumn;
      }
    }
  }
  return widths.map((w) =>
    Math.min(
      AUTOFIT_MAX_COLUMN_WIDTH,
      Math.max(MIN_DISTRIBUTED_COLUMN_WIDTH, w),
    ),
  );
}

/**
 * Apply a per-grid-column width plan to every cell of a table, returning a NEW
 * table node (input untouched). Each cell's `colwidth` is sliced from `widths`
 * for the grid columns it spans (a colspan-2 cell gets two widths). Shared by
 * AutoFit-Contents and AutoFit-Window so the cell-rewriting logic lives once.
 * Returns the input unchanged when `widths` is empty or the table has no rows.
 * PURE.
 */
function applyColumnWidths(table: JsonNode, widths: number[]): JsonNode {
  if (widths.length === 0 || !Array.isArray(table.content)) return table;
  const placements = tableCellColumns(table);
  const content = table.content.map((row, rowIndex) => {
    const rowPlacements = placements[rowIndex];
    if (!row || !rowPlacements || !Array.isArray(row.content)) return row;
    const cells = rowPlacements.map(({ cell, column: col, colspan: span }) => {
      const slice: number[] = [];
      for (let i = 0; i < span; i += 1) {
        slice.push(
          widths[Math.min(col + i, widths.length - 1)] ??
            MIN_DISTRIBUTED_COLUMN_WIDTH,
        );
      }
      const attrs = { ...(cell.attrs ?? {}) };
      const native = normalizeTableColumnWidthsTwips(
        attrs.colwidthTwips,
        span,
      );
      if (
        !native ||
        !native.every(
          (widthTwips, index) =>
            Math.abs(widthTwips - slice[index] * 15) <= 2,
        )
      ) {
        delete attrs.colwidthTwips;
      }
      return { ...cell, attrs: { ...attrs, colwidth: slice } };
    });
    return { ...row, content: cells };
  });
  return { ...table, content };
}

function clearColumnWidths(table: JsonNode): JsonNode {
  if (!Array.isArray(table.content)) return table;
  const content = table.content.map((row) => {
    if (!row || row.type !== "tableRow" || !Array.isArray(row.content))
      return row;
    return {
      ...row,
      content: row.content.map((cell) => {
        if (!cell?.attrs || !("colwidth" in cell.attrs)) return cell;
        const attrs = { ...cell.attrs };
        delete attrs.colwidth;
        return { ...cell, attrs };
      }),
    };
  });
  return { ...table, content };
}

function withTableLayoutPolicy(
  table: JsonNode,
  policy: DocumentTableLayoutPolicy,
): JsonNode {
  return {
    ...table,
    attrs: {
      ...(table.attrs ?? {}),
      ...documentTablePolicyNodeAttrs(policy),
    },
  };
}

/**
 * Apply an EXPLICIT table-layout policy to a TipTap table. The policy identity
 * lives on the table node; materialized `colwidth` values are merely editor
 * geometry and are never used to infer that identity. PURE.
 */
export function applyDocumentTableLayoutPolicy(
  table: JsonNode,
  policy: DocumentTableLayoutPolicy,
  autoFitWindowWidth = DEFAULT_AUTOFIT_WINDOW_WIDTH,
): JsonNode {
  if (!validateDocumentTableDenseJsonNode(table, policy).ok) return table;
  const columns = tableColumnCount(table);
  if (columns <= 0) return table;
  if (policy.mode === "initial_auto") {
    return withTableLayoutPolicy(clearColumnWidths(table), policy);
  }
  if (policy.mode === "initial_fixed") {
    const fixedWidthTwips = policy.fixedWidthTwips ?? 0;
    if (!Number.isInteger(fixedWidthTwips) || fixedWidthTwips <= 0)
      return table;
    const widthPx = Math.max(1, Math.round(fixedWidthTwips / 15));
    return withTableLayoutPolicy(
      applyColumnWidths(table, new Array<number>(columns).fill(widthPx)),
      policy,
    );
  }
  if (policy.mode === "autofit_contents") {
    return autoFitTableContents(table);
  }
  return autoFitTableWindow(table, autoFitWindowWidth);
}

/**
 * Size each column to its content (Word/WPS "AutoFit Contents" → shrink columns
 * to fit the longest text). Returns a NEW table whose every cell carries a
 * `colwidth` sliced from {@link contentColumnWidths}. Returns the input unchanged
 * when the table has no columns. PURE.
 */
export function autoFitTableContents(table: JsonNode): JsonNode {
  const policy: DocumentTableLayoutPolicy = {
    schemaVersion: 1,
    mode: "autofit_contents",
  };
  if (!validateDocumentTableDenseJsonNode(table, policy).ok) return table;
  const widths = contentColumnWidths(table);
  if (widths.length === 0) return table;
  return withTableLayoutPolicy(applyColumnWidths(table, widths), policy);
}

/**
 * Stretch a table to fill the page/window width (Word/WPS "AutoFit Window" →
 * distribute columns proportionally across the full content width). Returns a NEW
 * table whose columns sum to `totalWidth` (default
 * {@link DEFAULT_AUTOFIT_WINDOW_WIDTH}), distributed EVENLY. Returns the input
 * unchanged when the table has no columns. PURE.
 *
 * (Even distribution to the target width is the behavior users expect from
 * AutoFit-Window on a table whose columns have not been individually weighted; it
 * is the same geometry as Distribute-Columns but pinned to the page width rather
 * than the table's current total.)
 */
export function autoFitTableWindow(
  table: JsonNode,
  totalWidth: number = DEFAULT_AUTOFIT_WINDOW_WIDTH,
): JsonNode {
  const policy: DocumentTableLayoutPolicy = {
    schemaVersion: 1,
    mode: "autofit_window",
  };
  if (!validateDocumentTableDenseJsonNode(table, policy).ok) return table;
  const columns = tableColumnCount(table);
  if (columns <= 0) return table;
  const target =
    Number.isFinite(totalWidth) && totalWidth > 0
      ? Math.floor(totalWidth)
      : DEFAULT_AUTOFIT_WINDOW_WIDTH;
  // The window's width is the plan: Distribute's 40px floor would widen a
  // table of many columns past it (30 columns of 720px came out 1200px wide,
  // OFL-011). Only a column narrower than a table column can be makes the
  // target impossible, and then nothing is changed.
  if (target < columns * MIN_TABLE_COLUMN_WIDTH) return table;
  const base = Math.floor(target / columns);
  const widths = Array.from({ length: columns }, (_, index) =>
    base + (index < target - base * columns ? 1 : 0),
  );
  return withTableLayoutPolicy(applyColumnWidths(table, widths), policy);
}

/** Node identity that belongs to one block, never to a copy of it. */
const BLOCK_IDENTITY_ATTRS = ["block_id", "source"] as const;

function withoutBlockIdentity(
  attrs: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const next = { ...(attrs ?? {}) };
  for (const key of BLOCK_IDENTITY_ATTRS) {
    if (key in next) next[key] = null;
  }
  return next;
}

function withRowspan(cell: JsonNode, rowspan: number): JsonNode {
  const attrs = { ...(cell.attrs ?? {}) };
  if (rowspan > 1) attrs.rowspan = rowspan;
  else if ("rowspan" in attrs) attrs.rowspan = 1;
  return { ...cell, attrs };
}

/**
 * Split a table at `rowIndex` (Word "Split Table"): the row at `rowIndex` starts
 * a NEW table; every row before it stays in the first table. Returns an ARRAY of
 * one or two table nodes:
 *   - rowIndex ≤ 0 or ≥ rowCount → `[table]` unchanged (nothing to split off:
 *     the cursor is at the very top, or past the last row).
 *   - otherwise → `[firstTable, secondTable]`, each a NEW node carrying the
 *     original table's attrs and its slice of the rows.
 *
 * Both halves keep the logical grid. A vertically merged cell that crosses the
 * split is cut the way Word cuts its `w:vMerge`: the first table keeps the
 * cell and its content over the rows above the split, and the second table
 * gets an empty cell of the same width and formatting over the rows below it,
 * in the same grid column — so the cells beside it keep their columns and
 * both tables are complete grids. Slicing the row array alone left an
 * overlong rowspan above and a table one column short below.
 *
 * The first table is the original one (Word's `Table.Split` returns the new
 * table that starts at the split row), so the second drops the table's block
 * identity (`block_id`, native `source`). PURE.
 */
export function splitTableAtRow(table: JsonNode, rowIndex: number): JsonNode[] {
  if (!table || table.type !== "table" || !Array.isArray(table.content)) {
    return [table];
  }
  // A page fragment of a longer table cannot be split on its own: which
  // logical table each half belongs to depends on the other fragments, which
  // only the Split Table command (planTableSplit) can see. Refusing here keeps
  // a caller from creating two tables that share the fragment's identity.
  const fragmentId = table.attrs?.[TABLE_FRAGMENT_ID_ATTR];
  if (typeof fragmentId === "string" && fragmentId) return [table];
  if (!validateDocumentTableDenseJsonNode(table).ok) return [table];
  const rows = table.content;
  if (rows.some((row) => row?.type !== "tableRow")) return [table];
  const rowCount = rows.length;
  if (
    !Number.isInteger(rowIndex) ||
    rowIndex <= 0 ||
    rowIndex >= rowCount ||
    rowCount < 2
  ) {
    return [table];
  }

  const placements = tableCellColumns(table);
  const headCells = rows
    .slice(0, rowIndex)
    .map((row) => [...(row.content ?? [])]);
  const continuations: Array<{ column: number; cell: JsonNode }> = [];
  for (let originRow = 0; originRow < rowIndex; originRow += 1) {
    placements[originRow]?.forEach(({ cell, column }, cellIndex) => {
      const rowspan = Math.min(cellRowspan(cell), rowCount - originRow);
      const endRow = originRow + rowspan;
      if (endRow <= rowIndex) return;
      headCells[originRow][cellIndex] = withRowspan(
        cell,
        rowIndex - originRow,
      );
      // The merged cell's content -- its text and its formula -- stays with
      // the original above the split; the filler that keeps the lower
      
      const fillerAttrs: Record<string, unknown> = { ...(cell.attrs ?? {}) };
      delete fillerAttrs.formula;
      delete fillerAttrs.formulaNumberFormat;
      continuations.push({
        column,
        cell: withRowspan(
          {
            type: cell.type,
            attrs: fillerAttrs,
            content: [{ type: "paragraph" }],
          },
          endRow - rowIndex,
        ),
      });
    });
  }

  const tailRows = rows.slice(rowIndex);
  if (continuations.length > 0) {
    const firstTail = tailRows[0];
    const existing = (placements[rowIndex] ?? []).map(({ cell, column }) => ({
      column,
      cell,
    }));
    tailRows[0] = {
      ...firstTail,
      content: [...existing, ...continuations]
        .sort((left, right) => left.column - right.column)
        .map(({ cell }) => cell),
    };
  }

  const headRows = rows
    .slice(0, rowIndex)
    .map((row, index) => ({ ...row, content: headCells[index] }));
  return [
    { ...table, content: headRows },
    { ...table, attrs: withoutBlockIdentity(table.attrs), content: tailRows },
  ];
}
