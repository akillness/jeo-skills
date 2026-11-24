/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  columnToLetters,
  lettersToColumn,
} from "../../../../lib/spreadsheet/formula-engine";
import { spreadsheetPageContentSchema } from "../../../../lib/native-spreadsheet-schemas";
import { SPREADSHEET_CONTENT_TYPE } from "../../../../lib/native-page-content-types";
import { normalizeNumberFormatCode } from "../../../../lib/spreadsheet/number-format";
import { parseA1Range } from "../../../../lib/spreadsheet/print-settings";
import {
  chartSeriesSourceNumberFormat,
  validateChartBlockAttrsV2,
  type ChartBlockAttrsV2,
  type ChartData,
  type HierarchyChartPoint,
  type WaterfallPointKind,
} from "./chartBlockShared";

export interface ChartWorkbookCell {
  value?: string | number;
  formula?: string;
  computed?: string | number | boolean | null;
  [key: string]: unknown;
}
export interface ChartWorkbookSheet {
  id: string;
  name: string;
  rowCount: number;
  columnCount: number;
  cells: Record<string, ChartWorkbookCell>;
  [key: string]: unknown;
}
export interface DocumentChartWorkbook {
  version: 1;
  content: {
    type: typeof SPREADSHEET_CONTENT_TYPE;
    sheets: ChartWorkbookSheet[];
    /**
     * The cells were edited and their formulas' results are still being
     * calculated (on the server) or could not be: every `computed` stamp is
     * the previous one and the chart's data lags behind them until the answer
     * lands. The save accepts the chart's data as it is meanwhile
     * (`document_chart_host`, `chart_v2`); whoever renders the chart next
     * fills the stamps and the data and drops the bit.
     */
    calculationStale?: true;
    [key: string]: unknown;
  };
  binding: {
    sheetId: string;
    r1: number;
    c1: number;
    r2: number;
    c2: number;
    plotBy?: "rows" | "columns";
  };
}

/**
 * The number format the chart's values carry in its sheet, when every value
 * cell of the source range carries the same one: what a value axis Linked to
 * source shows (Format Axis > Number with no format code of its own), as
 * Excel reads it from the source data. Mixed, missing or General formats
 * leave the axis at General, as the sheet's own charts do.
 */
export function documentChartWorkbookValueNumberFormat(
  /** A chart's workbook as stored; read defensively, never recalculated. */
  workbook: unknown,
): string | undefined {
  const book = workbook as Partial<DocumentChartWorkbook> | null | undefined;
  const binding = book?.binding;
  const sheets = book?.content?.sheets;
  if (
    !binding ||
    !Array.isArray(sheets) ||
    ![binding.r1, binding.c1, binding.r2, binding.c2].every(Number.isInteger)
  ) {
    return undefined;
  }
  const sheet = sheets.find((candidate) => candidate?.id === binding.sheetId);
  const cells = sheet?.cells;
  if (!cells || typeof cells !== "object") return undefined;
  // The first row holds the series names and the first column the categories
  // whichever way the chart plots them; the values are the rest.
  if ((binding.r2 - binding.r1) * (binding.c2 - binding.c1) > 20_000) return undefined;
  let code: string | undefined;
  for (let r = binding.r1 + 1; r <= binding.r2; r += 1) {
    for (let c = binding.c1 + 1; c <= binding.c2; c += 1) {
      const cell = cells[`${r}:${c}`];
      if (!cell || (cell.value ?? "") === "") continue;
      const style = cell.style as { numberFormat?: unknown } | undefined;
      const format = normalizeNumberFormatCode(style?.numberFormat);
      if (!format) return undefined;
      if (code !== undefined && code !== format) return undefined;
      code = format;
    }
  }
  return code;
}

export function sameChartWorkbookDataShape(left: ChartData, right: ChartData): boolean {
  // A hierarchy states its numbers one per leaf row and derives the rest, so
  // its shape is the tree itself — the paths, not the values. This is the same
  // identity the ChartEx writer requires before it writes a leaf value.
  if (left.kind === "hierarchy" || right.kind === "hierarchy") {
    const paths = (data: ChartData) =>
      data.kind === "hierarchy"
        ? JSON.stringify(
            data.points.map((point) => [point.id, point.parentId ?? null, point.label]),
          )
        : "";
    return left.kind === right.kind && paths(left) === paths(right);
  }
  const shape=(data:ChartData)=>JSON.stringify(data,(key,value)=>
    ["name","categories","values","xValues","yValues","bubbleSizes"].includes(key)
      ? (Array.isArray(value)?value.length:"") : value);
  return shape(left)===shape(right);
}

/**
 * Whether two readings of one chart's data are the same data, key order aside.
 *
 * The save compares a stored workbook against the chart's own cache exactly
 * this way and refuses the write when they differ, so a host that binds a grid
 * to a chart it did not author asks this first: a grid that cannot be saved is
 * never offered.
 */
function sameChartWorkbookData(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((entry, index) => sameChartWorkbookData(entry, right[index]))
    );
  if (!left || !right || typeof left !== "object" || typeof right !== "object")
    return false;
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => key in b && sameChartWorkbookData(a[key], b[key]))
  );
}

export function chartCellFormula(cell: ChartWorkbookCell): string | undefined {
  return (
    cell.formula ||
    (cell.kind !== "text" &&
    String(cell.value ?? "")
      .trim()
      .startsWith("=")
      ? String(cell.value).trim()
      : undefined)
  );
}

/** Parse without clamping: an invalid source must never select different cells. */
export function parseChartWorkbookRange(
  value: string,
): Omit<DocumentChartWorkbook["binding"], "sheetId"> | null {
  const match =
    /^\$?([A-Z]{1,3})\$?([1-9]\d{0,4}):\$?([A-Z]{1,3})\$?([1-9]\d{0,4})$/i.exec(
      value.trim(),
    );
  if (!match) return null;
  const [c1, r1, c2, r2] = [
    lettersToColumn(match[1].toUpperCase()),
    Number(match[2]) - 1,
    lettersToColumn(match[3].toUpperCase()),
    Number(match[4]) - 1,
  ];
  return c1 <= c2 && r1 < r2 && r2 < 10000 && c2 < 1000
    ? { c1, r1, c2, r2 }
    : null;
}

export function normalizeDocumentChartWorkbook(
  raw: unknown,
): DocumentChartWorkbook {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw Error("invalid_chart_workbook");
  const book = raw as DocumentChartWorkbook;
  if (
    Object.keys(book).sort().join() !== "binding,content,version" ||
    book.version !== 1 ||
    !book.binding ||
    Object.keys(book.binding)
      .filter((key) => key !== "plotBy")
      .sort()
      .join() !== "c1,c2,r1,r2,sheetId" ||
    (book.binding.plotBy !== undefined &&
      !["rows", "columns"].includes(book.binding.plotBy)) ||
    !spreadsheetPageContentSchema.safeParse(book.content).success ||
    book.content.sheets.length > 8 ||
    JSON.stringify(book).length > 2_000_000
  )
    throw Error("invalid_chart_workbook");
  const binding = book.binding;
  const sheet = book.content.sheets.find(
    (sheet) => sheet.id === binding.sheetId,
  );
  if (
    !sheet ||
    ![binding.r1, binding.c1, binding.r2, binding.c2].every(Number.isInteger) ||
    binding.r1 < 0 ||
    binding.c1 < 0 ||
    binding.r2 < binding.r1 + 1 ||
    binding.c2 < binding.c1 ||
    binding.r2 >= sheet.rowCount ||
    binding.c2 >= sheet.columnCount ||
    binding.r2 - binding.r1 > 50 ||
    binding.c2 - binding.c1 > 29
  )
    throw Error("invalid_chart_source_range");
  let count = 0;
  const names = new Set<string>();
  for (const entry of book.content.sheets) {
    if (names.has(entry.name.toLowerCase()))
      throw Error("duplicate_chart_sheet_name");
    names.add(entry.name.toLowerCase());
    count += Object.keys(entry.cells).length;
    if (entry.rowCount > 10000 || entry.columnCount > 1000 || count > 20000)
      throw Error("chart_workbook_too_large");
  }
  return book;
}

/**
 * The sheet layout of one chart, in Office's documented column contract, so
 * every insertable leaf opens the same workbook editor in every host.
 *
 * Per MICROSOFT-SPEC A2: categories in the first column with one column per
 * series; stock series in the exact documented order per subtype (HLC =
 * high,low,close · OHLC = open,high,low,close · VHLC = volume,high,low,close ·
 * VOHLC = volume,open,high,low,close) — which `defaultChartData` already emits;
 * scatter as X/Y pairs with a third Size column for bubbles; hierarchy with one
 * column per level and the value last; funnel as one stage column plus one
 * value column; map as a region column plus a value column.
 *
 * Two layouts are ours, because Office keeps the information outside the sheet:
 * waterfall's per-point "Set as total" flag becomes a third `Type` column
 * (value / subtotal / total), and a map region's stable three-digit code gets
 * its own `Code` column next to its label, since a label alone cannot identify
 * a region.
 */
function chartWorkbookColumns(
  attrs: ChartBlockAttrsV2,
  categoryHeader = "Category",
): Array<{ name: string; values: Array<string | number | null>; numberFormat?: string }> | null {
  const data = attrs.data;
  // A blank point (`null`) is an empty cell of its column; a series' source
  // format is its value cells' number format (Linked to source).
  const columns: Array<{ name: string; values: Array<string | number | null>; numberFormat?: string }> = [];
  const formatOf = (series: { numberFormat?: unknown }) => {
    const numberFormat = chartSeriesSourceNumberFormat(series.numberFormat);
    return numberFormat ? { numberFormat } : {};
  };
  if (data.kind === "category" || data.kind === "stock") {
    columns.push({ name: categoryHeader, values: data.categories });
    data.series.forEach((series) =>
      columns.push({ name: series.name, values: series.values, ...formatOf(series) }),
    );
  } else if (data.kind === "sample") {
    // Bins > By Category's names first, as the server lays its workbook.
    if (data.categories) columns.push({ name: "Category", values: data.categories });
    data.series.forEach((series) =>
      columns.push({ name: series.name, values: series.values }),
    );
  } else if (data.kind === "xy") {
    data.series.forEach((series) => {
      columns.push(
        { name: "X", values: series.xValues },
        { name: series.name, values: series.yValues, ...formatOf(series) },
      );
      if (series.bubbleSizes)
        columns.push({ name: "Size", values: series.bubbleSizes });
    });
  } else if (data.kind === "waterfall") {
    columns.push(
      { name: "Category", values: data.categories },
      { name: "Value", values: data.values },
      { name: "Type", values: [...data.pointKinds] },
    );
  } else if (data.kind === "hierarchy") {
    const byId = new Map(data.points.map((point) => [point.id, point]));
    const parents = data.points.filter((point) =>
      data.points.some((child) => child.parentId === point.id),
    );
    const labelPath = (point: HierarchyChartPoint): string[] => {
      const labels: string[] = [];
      const seen = new Set<string>();
      let cursor: HierarchyChartPoint | undefined = point;
      while (cursor && !seen.has(cursor.id)) {
        seen.add(cursor.id);
        labels.unshift(cursor.label);
        cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
      }
      return labels;
    };
    // Only leaves carry a value, exactly like Excel's treemap/sunburst sheet:
    // an interior row would double-count against its own children.
    const rows = data.points
      .filter((point) => !parents.includes(point))
      .map((point) => ({ labels: labelPath(point), value: point.value }));
    if (!rows.length) return null;
    const depth = Math.max(...rows.map((row) => row.labels.length));
    for (let level = 0; level < depth; level += 1)
      columns.push({
        name: `Level ${level + 1}`,
        values: rows.map((row) => row.labels[level] ?? ""),
      });
    columns.push({ name: "Value", values: rows.map((row) => row.value) });
  } else if (data.kind === "matrix") {
    columns.push({ name: "", values: data.yCategories });
    data.xCategories.forEach((category, index) =>
      columns.push({
        name: category,
        values: data.values.map((row) => row[index]),
      }),
    );
  } else if (data.kind === "map") {
    columns.push(
      { name: "Region", values: data.regions.map((region) => region.label) },
      { name: "Code", values: data.regions.map((region) => region.id) },
      { name: "Value", values: data.regions.map((region) => region.value) },
    );
  } else return null;
  return columns;
}

/** Each point's total over the leaf rows beneath it. */
function hierarchyLeafTotals(
  points: readonly HierarchyChartPoint[],
): Map<string, number> {
  const children = new Map<string, HierarchyChartPoint[]>();
  for (const point of points) {
    const key = point.parentId ?? "";
    children.set(key, [...(children.get(key) ?? []), point]);
  }
  const totals = new Map<string, number>();
  const total = (point: HierarchyChartPoint): number => {
    const kids = children.get(point.id) ?? [];
    const value = kids.length
      ? kids.reduce((sum, kid) => sum + total(kid), 0)
      : point.value;
    totals.set(point.id, value);
    return value;
  };
  for (const point of points) if (!point.parentId) total(point);
  return totals;
}

function hierarchyParentIds(points: readonly HierarchyChartPoint[]): Set<string> {
  return new Set(
    points.flatMap((point) => (point.parentId ? [point.parentId] : [])),
  );
}

/**
 * Whether every interior value is already the sum of the rows beneath it —
 * which is how a chart read out of an Office part states them, since the part
 * stores a number only per leaf row and the reader derives the rest.
 */
function hierarchyInteriorsAreSums(points: readonly HierarchyChartPoint[]): boolean {
  const totals = hierarchyLeafTotals(points);
  const parents = hierarchyParentIds(points);
  return points.every(
    (point) => !parents.has(point.id) || totals.get(point.id) === point.value,
  );
}

function deriveHierarchyInteriors(points: HierarchyChartPoint[]): void {
  const totals = hierarchyLeafTotals(points);
  const parents = hierarchyParentIds(points);
  for (const point of points)
    if (parents.has(point.id)) point.value = totals.get(point.id) ?? point.value;
}

export function seedDocumentChartWorkbook(
  attrs: ChartBlockAttrsV2,
  /** `categoryHeader`: the words above a category chart's category column
   * ("Category" unless a host says otherwise; "" leaves the corner blank,
   * as PowerPoint's own chart data sheet does). The reader never reads it. */
  options: { readonly categoryHeader?: string } = {},
): DocumentChartWorkbook | null {
  const columns = chartWorkbookColumns(attrs, options.categoryHeader);
  if (!columns) return null;
  const cells: Record<string, ChartWorkbookCell> = {};
  columns.forEach((column, c) =>
    [column.name, ...column.values].forEach((value, r) => {
      // Blank stays blank: the matrix corner cell has no header (a surface
      // chart's first column holds its Y categories under Excel's own blank
      // corner) and a shallow hierarchy branch has no deeper level. Labels and
      // numbers are never empty for the other kinds, so nothing else is skipped
      // -- but a blank point, which is an empty cell (`null`, NaN in a sheet).
      if (value === "" || value === null || Number.isNaN(value)) return;
      cells[`${r}:${c}`] = {
        value: String(value),
        kind: typeof value === "string" ? "text" : "number",
        // A series' source format is its value cells' (Linked to source).
        ...(r > 0 && typeof value === "number" && column.numberFormat
          ? { style: { numberFormat: column.numberFormat } }
          : {}),
      };
    }),
  );
  const rows = Math.max(...columns.map((column) => column.values.length));
  return {
    version: 1,
    content: {
      type: SPREADSHEET_CONTENT_TYPE,
      sheets: [
        {
          id: "chart-data",
          name: "ChartData",
          rowCount: Math.max(30, rows + 10),
          columnCount: Math.max(12, columns.length + 3),
          cells,
        },
      ],
    },
    binding: {
      sheetId: "chart-data",
      r1: 0,
      c1: 0,
      r2: rows,
      c2: columns.length - 1,
    },
  };
}

/**
 * The grid an imported chart may be edited through, or null.
 *
 * A chart this editor did not author states its numbers in its own part, and
 * the writer behind it edits those numbers in place. The grid is therefore
 * seeded from them and offered only when it reads back as exactly them — the
 * same comparison the save makes before it writes that part, so a grid that
 * could never be saved is never opened.
 */
export function importedChartWorkbook(
  attrs: ChartBlockAttrsV2,
): DocumentChartWorkbook | null {
  try {
    const seeded = seedDocumentChartWorkbook(attrs);
    if (!seeded) return null;
    // Seeded from the chart's own numbers: literal cells only, nothing to
    // calculate.
    return sameChartWorkbookData(chartWorkbookData(attrs, seeded).data, attrs.data)
      ? seeded
      : null;
  } catch {
    return null;
  }
}

/**
 * Match the rows (or columns) of a sheet before and after an edit: the index
 * each old line has now, or -1 when it is gone. Lines are matched by content
 * in order (a longest common subsequence), so an inserted line leaves the
 * lines after it matched one place further on.
 */
function alignLines(before: readonly string[], after: readonly string[]): number[] {
  const n = before.length;
  const m = after.length;
  // The same number of lines is an edit in place, whatever the lines now
  // say: nothing was inserted or deleted, so every line is where it was, as
  // Excel keeps a reference through typing. Matched by content, a row
  // retyped to read like its neighbour was taken for that neighbour and the
  // line it displaced for a deletion, which pulled the range's edge in
  // (PPT-B344).
  if (n === m || n === 0 || m === 0 || n * m > 250_000) {
    return before.map((_, index) => (index < m ? index : -1));
  }
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i][j] =
        before[i] === after[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const mapped = new Array<number>(n).fill(-1);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      mapped[i] = j;
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) i += 1;
    else j += 1;
  }
  // A run of lines that changed between two matched lines, as many before as
  // after, is those lines edited in place, not deleted and inserted: a value
  // typed or pasted into a row changes its content, and read as a deletion it
  // pulled the range's edge in to the header, so the edit never reached the
  // chart. Only a run whose length changed is an insertion or a deletion.
  let anchorBefore = -1;
  let anchorAfter = -1;
  for (let index = 0; index <= n; index += 1) {
    if (index < n && mapped[index] < 0) continue;
    const nextAfter = index < n ? mapped[index] : m;
    if (index - anchorBefore === nextAfter - anchorAfter) {
      for (let gap = anchorBefore + 1; gap < index; gap += 1) {
        mapped[gap] = anchorAfter + (gap - anchorBefore);
      }
    }
    anchorBefore = index;
    anchorAfter = nextAfter;
  }
  return mapped;
}

function lineSignatures(sheet: ChartWorkbookSheet, axis: "row" | "column"): string[] {
  const count = axis === "row" ? sheet.rowCount : sheet.columnCount;
  const lines: string[][] = Array.from({ length: Math.max(0, count) }, () => []);
  for (const [key, cell] of Object.entries(sheet.cells ?? {})) {
    const [r, c] = key.split(":").map(Number);
    const index = axis === "row" ? r : c;
    const other = axis === "row" ? c : r;
    if (!Number.isInteger(index) || index < 0 || index >= lines.length) continue;
    lines[index].push(`${other}=${JSON.stringify(cell)}`);
  }
  return lines.map((parts) => parts.sort().join("\u0000"));
}








export function rebindChartWorkbookAfterEdit(
  previous: DocumentChartWorkbook,
  content: DocumentChartWorkbook["content"],
): DocumentChartWorkbook["binding"] {
  const binding = previous.binding;
  const before = previous.content.sheets.find((sheet) => sheet.id === binding.sheetId);
  const after = content.sheets.find((sheet) => sheet.id === binding.sheetId);
  if (!before || !after) return binding;
  const span = (axis: "row" | "column", first: number, last: number): [number, number] => {
    const mapped = alignLines(lineSignatures(before, axis), lineSignatures(after, axis));
    if (first < 0 || last < first || last >= mapped.length) return [first, last];
    // The range's edges follow their lines; a deleted edge falls back to the
    // nearest surviving line inside the range.
    let start = -1;
    for (let index = first; index <= last && start < 0; index += 1) start = mapped[index];
    let end = -1;
    for (let index = last; index >= first && end < 0; index -= 1) end = mapped[index];
    if (start < 0 || end < 0 || end < start) return [first, last];
    return [start, end];
  };
  const [r1, r2] = span("row", binding.r1, binding.r2);
  const [c1, c2] = span("column", binding.c1, binding.c2);
  if (r1 === binding.r1 && r2 === binding.r2 && c1 === binding.c1 && c2 === binding.c2) {
    return binding;
  }
  return { ...binding, r1, r2, c1, c2 };
}

/**
 * The source range grown onto the rows typed directly beneath it and the
 * columns typed directly beside it, as the data range of a Word or
 * PowerPoint chart grows when a value is typed next to it in its sheet (a
 * fourth category typed under the third joins the chart). Only cells that
 * were empty before this edit and hold content now count, and a row or
 * column joins only when the chart can read the grown range (`accepts`):
 * a label typed before its number leaves the range as it is until the
 * number lands. The range never shrinks here (a cleared row is a blank
 * point, as in Office); deletions narrow it through
 * {@link rebindChartWorkbookAfterEdit}.
 */
export function extendChartWorkbookBindingToTypedNeighbours(
  previous: DocumentChartWorkbook,
  content: DocumentChartWorkbook["content"],
  binding: DocumentChartWorkbook["binding"],
  accepts: (candidate: DocumentChartWorkbook["binding"]) => boolean,
): DocumentChartWorkbook["binding"] {
  const before = previous.content.sheets.find((sheet) => sheet.id === binding.sheetId);
  const after = content.sheets.find((sheet) => sheet.id === binding.sheetId);
  if (!before || !after || binding.plotBy === "rows") return binding;
  const filled = (sheet: typeof after, r: number, c: number): boolean => {
    const cell = sheet.cells[`${r}:${c}`];
    if (!cell) return false;
    const value = chartCellFormula(cell) ?? cell.value;
    return value !== undefined && value !== null && String(value).trim() !== "";
  };
  // A row or column inserted or deleted moved the range (`binding` is the
  // moved one): a cell beneath or beside it is "typed now" only when the
  // cell it CAME FROM was empty, or a helper row the author had excluded
  // walked back into the range after an insert above it (PPT-B437).
  const dr = binding.r2 - previous.binding.r2;
  const dc = binding.c2 - previous.binding.c2;
  const typedNow = (r: number, c: number, shiftR: number, shiftC: number) =>
    filled(after, r, c) && !filled(before, r - shiftR, c - shiftC);
  let next = binding;
  // Rows beneath: at least one cell of the row inside the range's columns
  // was typed in this edit, and the row reads.
  for (let guard = 0; guard < 64; guard += 1) {
    const r = next.r2 + 1;
    if (r >= after.rowCount) break;
    let typed = false;
    for (let c = next.c1; c <= next.c2; c += 1) if (typedNow(r, c, dr, dc)) typed = true;
    if (!typed) break;
    const candidate = { ...next, r2: r };
    if (!accepts(candidate)) break;
    next = candidate;
  }
  // Columns beside: a series typed to the right (its header or a value).
  for (let guard = 0; guard < 64; guard += 1) {
    const c = next.c2 + 1;
    if (c >= after.columnCount) break;
    let typed = false;
    for (let r = next.r1; r <= next.r2; r += 1) if (typedNow(r, c, dr, dc)) typed = true;
    if (!typed) break;
    const candidate = { ...next, c2: c };
    if (!accepts(candidate)) break;
    next = candidate;
  }
  return next;
}

/**
 * The chart's sheet once one series has left the chart (Delete on a selected
 * series, Select Data > Remove): as in Office the series' cells stay in the
 * sheet, outside the range the chart reads. The last series' column (row,
 * for a sheet laid out by rows) is simply left out of the range; another
 * series' cells move to the range's far edge, the later series' cells
 * stepping back one place, and the range then leaves them out -- the range
 * is one rectangle, it cannot skip a column in its middle. A move is refused
 * (null) on a sheet whose formulas or merged cells it could break. `next` is
 * the chart without that series (`chartWithoutSeries`); the sheet must read
 * back exactly its data, as the save checks, or null.
 */
export function chartWorkbookWithoutSeries(
  raw: DocumentChartWorkbook,
  next: ChartBlockAttrsV2,
  seriesIndex: number,
  previousKind: ChartData["kind"],
  previousSubtype: string,
): DocumentChartWorkbook | null {
  let book: DocumentChartWorkbook;
  try {
    book = structuredClone(normalizeDocumentChartWorkbook(raw));
  } catch {
    return null;
  }
  const source = book.binding;
  const transposed = source.plotBy === "rows";
  if (transposed && previousKind !== "category") return null;
  // The range in the chart's own terms: columns are series (the sheet's rows
  // when it is laid out by rows).
  const lo = transposed ? source.r1 : source.c1;
  const hi = transposed ? source.r2 : source.c2;
  const across = transposed ? [source.c1, source.c2] : [source.r1, source.r2];
  const stride = previousKind === "xy" ? (previousSubtype.startsWith("bubble") ? 3 : 2) : 1;
  const start =
    previousKind === "category" || previousKind === "stock"
      ? lo + 1 + seriesIndex
      : previousKind === "xy" || previousKind === "sample"
        ? lo + seriesIndex * stride
        : -1;
  if (start < 0 || start + stride - 1 > hi) return null;
  const sheet = book.content.sheets.find((candidate) => candidate.id === source.sheetId);
  if (!sheet) return null;
  const key = (line: number, place: number) => (transposed ? `${place}:${line}` : `${line}:${place}`);
  if (start + stride - 1 < hi) {
    const formulas = book.content.sheets.some((candidate) =>
      Object.values(candidate.cells).some((cell) => chartCellFormula(cell) !== undefined),
    );
    const merges = Array.isArray(sheet.merges) && sheet.merges.length > 0;
    const hiddenLines =
      transposed &&
      ((Array.isArray(sheet.manuallyHiddenRows) && sheet.manuallyHiddenRows.length > 0) || sheet.filters !== undefined);
    if (formulas || merges || hiddenLines) return null;
    const width = hi - start + 1;
    for (let line = across[0]!; line <= across[1]!; line += 1) {
      const cells = Array.from({ length: width }, (_, offset) => sheet.cells[key(line, start + offset)]);
      const moved = [...cells.slice(stride), ...cells.slice(0, stride)];
      moved.forEach((cell, offset) => {
        if (cell === undefined) delete sheet.cells[key(line, start + offset)];
        else sheet.cells[key(line, start + offset)] = cell;
      });
    }
  }
  book.binding = transposed ? { ...source, r2: source.r2 - stride } : { ...source, c2: source.c2 - stride };
  try {
    book = normalizeDocumentChartWorkbook(book);
    if (chartWorkbookIsStale(book)) return book;
    return sameChartWorkbookData(chartWorkbookData(next, book, { missing: "blank" }).data, next.data) ? book : null;
  } catch {
    return null;
  }
}

export function chartWorkbookRange(book: DocumentChartWorkbook): string {
  const b = book.binding;
  return `${columnToLetters(b.c1)}${b.r1 + 1}:${columnToLetters(b.c2)}${b.r2 + 1}`;
}

/** Why a histogram's or Pareto chart's source was refused: more than one column. */
export const CHART_SINGLE_SAMPLE_COLUMN = "chart_single_sample_column";
/** A chart value past what the chart part stores and the server accepts
 * (`document_charts.MAX_CHART_ABS_VALUE`): refused where it is typed, with its
 * own reason, instead of at the save (PPT-B403). */
export const MAX_CHART_ABS_VALUE = 1e15;
export const CHART_VALUE_OUT_OF_RANGE = "chart_value_out_of_range";
/** A formula cell the chart reads has no result stamped yet (never read as 0 or blank). */
export const CHART_WORKBOOK_RESULT_MISSING = "chart_workbook_result_missing";

/** Whether the workbook's formula results are behind its cells (see `calculationStale`). */
export function chartWorkbookIsStale(book: DocumentChartWorkbook): boolean {
  return book.content.calculationStale === true;
}

/** Whether a formula cell of the workbook has no result stamped. */
export function chartWorkbookHasMissingResults(book: DocumentChartWorkbook): boolean {
  return book.content.sheets.some((sheet) =>
    Object.values(sheet.cells).some(
      (cell) => chartCellFormula(cell) !== undefined && cell.computed === undefined,
    ),
  );
}

/** Whether the chart's renderer should ask for the workbook's results. */
export function chartWorkbookNeedsResults(book: DocumentChartWorkbook): boolean {
  return chartWorkbookIsStale(book) || chartWorkbookHasMissingResults(book);
}

/** A formula result as the workbook stamps it (`computed`). */
export type ChartWorkbookResult = string | number | boolean | null;

/**
 * The workbook with every formula cell's result stamped and the stale bit
 * dropped, or null when a formula has no result in `resultOf`. The input is
 * not mutated; source cells are never rewritten as their displayed values.
 */
export function stampDocumentChartWorkbook(
  raw: DocumentChartWorkbook,
  resultOf: (sheetName: string, row: number, col: number) => ChartWorkbookResult | undefined,
  /** Whether the result is text (not an error whose stamp is its code). */
  isTextResult?: (sheetName: string, row: number, col: number) => boolean,
): DocumentChartWorkbook | null {
  const workbook = structuredClone(raw);
  delete workbook.content.calculationStale;
  for (const sheet of workbook.content.sheets) {
    for (const [key, cell] of Object.entries(sheet.cells)) {
      if (!chartCellFormula(cell)) continue;
      const [r, c] = key.split(":").map(Number);
      const value = resultOf(sheet.name, r, c);
      if (value === undefined) return null;
      cell.computed = value;
      // A text result that reads like an error code ("#N/A" from ="#N/A")
      // is marked as text: the workbook writer wrote it as an error
      
      const record = cell as typeof cell & { computedText?: true };
      if (typeof value === "string" && value.startsWith("#") && isTextResult?.(sheet.name, r, c)) record.computedText = true;
      else delete record.computedText;
    }
  }
  return workbook;
}

/**
 * The chart's data as its workbook states it: literal cells by value, formula
 * cells by their stamped result. The same reading the save makes
 * (`chart_workbook_data`). A formula cell without a stamp throws
 * {@link CHART_WORKBOOK_RESULT_MISSING}, unless `missing` is "blank": the
 * save's own reading, for a check that must accept exactly what the save does.
 */
export function chartWorkbookData(
  attrs: ChartBlockAttrsV2,
  raw: DocumentChartWorkbook,
  options: { missing?: "throw" | "blank" } = {},
): { workbook: DocumentChartWorkbook; data: ChartData } {
  const workbook = structuredClone(normalizeDocumentChartWorkbook(raw));
  return { workbook, data: chartDataOf(attrs, workbook, options.missing ?? "throw") };
}








export function chartWorkbookHiddenRows(sheet: ChartWorkbookSheet): ReadonlySet<number> {
  const hidden = new Set<number>();
  const manual = (sheet as { manuallyHiddenRows?: unknown }).manuallyHiddenRows;
  if (Array.isArray(manual)) for (const row of manual) if (Number.isInteger(row)) hidden.add(row as number);
  // The filter's ticked values (`filters`: column -> the values it shows)
  // under its range (`autoFilterRef`, header row first). The server's
  // `chart_workbook_hidden_rows` reads the same.
  const filters = (sheet as { filters?: unknown }).filters;
  const ref = (sheet as { autoFilterRef?: unknown }).autoFilterRef;
  const range = typeof ref === "string" ? parseA1Range(ref.replace(/\$/g, "")) : null;
  if (!range || !filters || typeof filters !== "object" || Array.isArray(filters)) return hidden;
  const columns = Object.entries(filters as Record<string, unknown>)
    .map(([key, values]) => [Number(key), values] as const)
    .filter(
      (entry): entry is readonly [number, unknown[]] =>
        Number.isInteger(entry[0]) && entry[0] >= range.c1 && entry[0] <= range.c2 && Array.isArray(entry[1]),
    )
    .map(([column, values]) => [column, new Set(values.map(String))] as const);
  if (!columns.length) return hidden;
  for (let row = range.r1 + 1; row <= range.r2; row += 1) {
    for (const [column, shown] of columns) {
      const cell = sheet.cells[`${row}:${column}`];
      const raw = cell ? (chartCellFormula(cell) || cell.spill === true ? cell.computed : cell.value) : null;
      if (!shown.has(raw === null || raw === undefined ? "" : String(raw))) {
        hidden.add(row);
        break;
      }
    }
  }
  return hidden;
}

/** A series as it was, but for the source format its cells now state. */
function withoutSourceFormat<T extends object>(series: T | undefined): Omit<T, "numberFormat"> | Record<string, never> {
  if (!series) return {};
  const { numberFormat: _stated, ...rest } = series as T & { numberFormat?: unknown };
  return rest;
}




function cellWords(value: string | number | boolean | null): string {
  if (value === true) return "TRUE";
  if (value === false) return "FALSE";
  return String(value ?? "");
}

function chartDataOf(
  attrs: ChartBlockAttrsV2,
  workbook: DocumentChartWorkbook,
  missing: "throw" | "blank",
): ChartData {
  const sourceBinding = workbook.binding;
  const transposed = sourceBinding.plotBy === "rows";
  if (transposed && attrs.data.kind !== "category")
    throw Error("chart_rows_not_supported");
  const b = transposed
    ? {
        ...sourceBinding,
        r1: sourceBinding.c1,
        r2: sourceBinding.c2,
        c1: sourceBinding.r1,
        c2: sourceBinding.r2,
      }
    : sourceBinding;
  const sheet = workbook.content.sheets.find(
    (sheet) => sheet.id === b.sheetId,
  )!;
  const read = (r: number, c: number): string | number | boolean | null => {
    const cell = sheet.cells[transposed ? `${c}:${r}` : `${r}:${c}`];
    if (!cell) return null;
    // A cell an array formula spilled into carries the result it was stamped
    // with (PPT-B382).
    if (!chartCellFormula(cell)) return cell.spill === true ? (cell.computed ?? null) : (cell.value ?? null);
    if (cell.computed === undefined && missing === "throw")
      throw Error(CHART_WORKBOOK_RESULT_MISSING);
    return cell.computed ?? null;
  };
  const text = (r: number, c: number) => {
    const value = cellWords(read(r, c));
    if (!value.trim() || value.length > 200)
      throw Error("chart_source_label_required");
    return value;
  };
  const numberAt = (r: number, c: number): number | null => {
    const value = read(r, c);
    if (value === null || value === "") return null;
    const n = Number(value);
    if (!Number.isFinite(n) || typeof value === "boolean")
      throw Error("chart_source_formula_error");
    if (Math.abs(n) > MAX_CHART_ABS_VALUE) throw Error(CHART_VALUE_OUT_OF_RANGE);
    return n;
  };
  const requiredNumber = (r: number, c: number) => {
    const value = numberAt(r, c);
    if (value === null) throw Error("chart_source_number_required");
    return value;
  };
  // The data rows the chart plots: a row its sheet hides (by hand or by its
  
  // sheet laid out by rows plots its rows as series; those stay, and so do
  // the other kinds' rows (a waterfall's, a hierarchy's, a map's).
  const allRows = Array.from({ length: b.r2 - b.r1 }, (_, r) => b.r1 + r + 1);
  const hiddenRows =
    !transposed && ["category", "stock", "xy"].includes(attrs.data.kind)
      ? chartWorkbookHiddenRows(sheet)
      : new Set<number>();
  const plotRows = allRows.filter((row) => !hiddenRows.has(row));
  const numbers = (c: number) => {
    const values: number[] = [];
    for (const r of plotRows) {
      const value = numberAt(r, c);
      if (value === null) {
        if (attrs.data.kind === "sample") continue;
        throw Error("chart_source_number_required");
      }
      values.push(value);
    }
    return values;
  };
  /** A series' points: an empty cell is a blank point (the server's
   * `chart_workbook_data` reads it so too). */
  const points = (c: number) => plotRows.map((row) => numberAt(row, c));
  /** Blank-tolerant label read: only the hierarchy levels may be empty. */
  const label = (r: number, c: number) => cellWords(read(r, c)).trim();
  /** A series' source format: the one number format every value cell of its
   * column carries (the server's `_column_number_format`); none when they
   * differ or carry none. Linked to source, its labels and axis show it. */
  const sourceFormat = (c: number): { numberFormat?: string } => {
    let code: string | undefined;
    for (const r of plotRows) {
      const cell = sheet.cells[transposed ? `${c}:${r}` : `${r}:${c}`];
      if (!cell || (read(r, c) ?? "") === "") continue;
      const format =
        chartSeriesSourceNumberFormat((cell.style as { numberFormat?: unknown } | undefined)?.numberFormat) ?? "";
      if (code !== undefined && code !== format) return {};
      code = format;
    }
    return code ? { numberFormat: code } : {};
  };
  const rowCount = b.r2 - b.r1;
  let data: ChartData;
  if (attrs.data.kind === "category" || attrs.data.kind === "stock") {
    const previous = attrs.data;
    const categories = plotRows.map((row) => text(row, b.c1));
    const series = Array.from({ length: b.c2 - b.c1 }, (_, i) => ({
      ...withoutSourceFormat(previous.series[i]),
      name: text(b.r1, b.c1 + i + 1),
      // Every stage of a funnel is drawn: its empty cell is refused.
      values: attrs.chartType === "funnel" ? numbers(b.c1 + i + 1) : points(b.c1 + i + 1),
      ...(attrs.chartType === "combo" && !previous.series[i]
        ? { renderAs: "line" as const, axis: "primary" as const }
        : {}),
      // A funnel is an Office 2016 part, whose caches carry no series format.
      ...(attrs.chartType === "funnel" ? {} : sourceFormat(b.c1 + i + 1)),
    }));
    data = { kind: previous.kind, categories, series } as ChartData;
  } else if (attrs.data.kind === "sample") {
    // A histogram and a Pareto chart bin ONE column of samples (their chart
    // part takes one series and the writer refuses more). A second column in
    // the source was taken and silently not drawn (PPT-B177): refuse it here,
    // where the range is chosen, with its own reason.
    if (attrs.data.categories) {
      // Bins > By Category over named categories: their names, then the one
      // column of values; a blank value is no point (the server reads it so).
      if (b.c2 !== b.c1 + 1) throw Error(CHART_SINGLE_SAMPLE_COLUMN);
      const categories: string[] = [];
      const values: number[] = [];
      for (const r of plotRows) {
        const value = numberAt(r, b.c2);
        if (value === null) continue;
        categories.push(text(r, b.c1));
        values.push(value);
      }
      data = { kind: "sample", categories, series: [{ name: text(b.r1, b.c2), values }] };
    } else if (
      (attrs.chartSubtype === "histogram" || attrs.chartSubtype === "pareto") &&
      b.c2 > b.c1
    ) {
      throw Error(CHART_SINGLE_SAMPLE_COLUMN);
    } else data = {
      kind: "sample",
      series: Array.from({ length: b.c2 - b.c1 + 1 }, (_, i) => ({
        name: text(b.r1, b.c1 + i),
        values: numbers(b.c1 + i),
      })),
    };
  } else if (attrs.data.kind === "xy") {
    const stride = attrs.chartSubtype.startsWith("bubble") ? 3 : 2;
    if ((b.c2 - b.c1 + 1) % stride) throw Error("chart_xy_source_columns");
    data = {
      kind: "xy",
      series: Array.from({ length: (b.c2 - b.c1 + 1) / stride }, (_, i) => ({
        name: text(b.r1, b.c1 + i * stride + 1),
        xValues: points(b.c1 + i * stride),
        yValues: points(b.c1 + i * stride + 1),
        ...sourceFormat(b.c1 + i * stride + 1),
        ...(stride === 3
          ? { bubbleSizes: numbers(b.c1 + i * stride + 2) }
          : {}),
      })),
    };
  } else if (attrs.data.kind === "waterfall") {
    const previous = attrs.data;
    const kinds = ["value", "subtotal", "total"] as const;
    data = {
      kind: "waterfall",
      categories: Array.from({ length: rowCount }, (_, r) =>
        text(b.r1 + r + 1, b.c1),
      ),
      values: numbers(b.c1 + 1),
      // Office keeps "Set as total" on the point, not in the sheet. Our third
      // column carries it; without that column the existing flags are kept.
      pointKinds: Array.from({ length: rowCount }, (_, r): WaterfallPointKind => {
        if (b.c2 - b.c1 < 2) return previous.pointKinds[r] ?? "value";
        const raw = label(b.r1 + r + 1, b.c1 + 2).toLowerCase();
        if (!raw) return previous.pointKinds[r] ?? "value";
        const kind = kinds.find((entry) => entry === raw);
        if (!kind) throw Error("chart_waterfall_point_kind");
        return kind;
      }),
    };
  } else if (attrs.data.kind === "hierarchy") {
    const previous = attrs.data;
    const byId = new Map(previous.points.map((point) => [point.id, point]));
    const pathOf = (point: HierarchyChartPoint): string => {
      const labels: string[] = [];
      const seen = new Set<string>();
      let cursor: HierarchyChartPoint | undefined = point;
      while (cursor && !seen.has(cursor.id)) {
        seen.add(cursor.id);
        labels.unshift(cursor.label);
        cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
      }
      return JSON.stringify(labels);
    };
    // Two rows that spell the same full path are two leaves of that name
    // (Office draws two tiles / two arcs; it never adds them up), so a leaf's
    // key carries its occurrence number and an interior node's does not.
    const occurrences = new Map<string, number>();
    const leafKey = (path: string): string => {
      const n = (occurrences.get(path) ?? 0) + 1;
      occurrences.set(path, n);
      return n === 1 ? path : `${path}#${n}`;
    };
    const previousParents = hierarchyParentIds(previous.points);
    const previousByPath = new Map(
      previous.points.map((point) => [
        previousParents.has(point.id) ? pathOf(point) : leafKey(pathOf(point)),
        point,
      ]),
    );
    occurrences.clear();
    const levels = b.c2 - b.c1;
    if (levels < 1) throw Error("chart_hierarchy_source_columns");
    const points: HierarchyChartPoint[] = [];
    const idByPath = new Map<string, string>();
    const usedIds = new Set<string>();
    for (let r = b.r1 + 1; r <= b.r2; r++) {
      const labels: string[] = [];
      for (let c = 0; c < levels; c++) {
        const value = label(r, b.c1 + c);
        if (!value) break;
        labels.push(value);
      }
      if (!labels.length) throw Error("chart_source_label_required");
      const value = requiredNumber(r, b.c2);
      // Excel leaves a negative row out of a treemap or sunburst (measured,
      
      if (value < 0) continue;
      labels.forEach((entry, index) => {
        const leaf = index === labels.length - 1;
        const path = leaf
          ? leafKey(JSON.stringify(labels.slice(0, index + 1)))
          : JSON.stringify(labels.slice(0, index + 1));
        if (idByPath.has(path)) return;
        // Reuse the id the point already had at this label path so editing a
        // value never renames the node the renderer and exporter address.
        const match = previousByPath.get(path);
        let id = match && !usedIds.has(match.id) ? match.id : "";
        for (let n = points.length + 1; !id; n += 1)
          if (!usedIds.has(`node-${n}`)) id = `node-${n}`;
        usedIds.add(id);
        idByPath.set(path, id);
        const parentPath = JSON.stringify(labels.slice(0, index));
        points.push({
          id,
          ...(index ? { parentId: idByPath.get(parentPath)! } : {}),
          label: entry,
          // Only the deepest label on a row owns the row's value; an interior
          // node keeps the value it already had (Office shows the sum).
          value: index === labels.length - 1 ? value : (match?.value ?? 0),
        });
      });
    }
    // A chart whose interior values were already the sums beneath them keeps
    // them derived, so an edited leaf leaves the page still describing the part
    // it came from. A chart that authored its own interior values keeps those.
    if (hierarchyInteriorsAreSums(previous.points)) deriveHierarchyInteriors(points);
    data = { kind: "hierarchy", points };
  } else if (attrs.data.kind === "matrix") {
    const xCategories = Array.from({ length: b.c2 - b.c1 }, (_, c) =>
      text(b.r1, b.c1 + c + 1),
    );
    data = {
      kind: "matrix",
      xCategories,
      yCategories: Array.from({ length: rowCount }, (_, r) =>
        text(b.r1 + r + 1, b.c1),
      ),
      values: Array.from({ length: rowCount }, (_, r) =>
        xCategories.map((_unused, c) => requiredNumber(b.r1 + r + 1, b.c1 + c + 1)),
      ),
    };
  } else if (attrs.data.kind === "map") {
    data = {
      kind: "map",
      regions: Array.from({ length: rowCount }, (_, r) => ({
        id: text(b.r1 + r + 1, b.c1 + 1),
        label: text(b.r1 + r + 1, b.c1),
        value: requiredNumber(b.r1 + r + 1, b.c1 + 2),
      })),
    };
  } else throw Error("chart_workbook_kind_unavailable");
  if (!validateChartBlockAttrsV2({ ...attrs, data }).valid)
    throw Error("chart_source_not_compatible");
  return data;
}
