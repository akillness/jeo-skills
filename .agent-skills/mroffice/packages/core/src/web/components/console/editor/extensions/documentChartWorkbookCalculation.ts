/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { requestWorkbookResults, WorkbookValuesCache, type WorkbookValuesLookup } from "../../../../lib/spreadsheet/workbook-values-cache";
import type { BackgroundCalculationSheet, BackgroundCalculationSheetContext } from "../../../../lib/spreadsheet/background-calculation-protocol";
import type { BackgroundCalculationHostBinding } from "../../../../lib/spreadsheet/background-calculation-host";
import { worksheetFormulaResultKey, type WorksheetCalculationToken, type WorksheetFormulaCoordinate } from "../../../../lib/spreadsheet/calculation-mode";
import { localArithmeticResults } from "../../../../lib/spreadsheet/stored-formula-results";
import { calcManuallyHiddenRows, tableDefsForSheet } from "../../../../lib/spreadsheet/display-cache";
import { hiddenRowsFromGroups, normalizeOutlineGroups } from "../../../../lib/spreadsheet/outline-groups";
import { isArrayValue, isFormulaError, isLambdaValue, isOmittedValue, type EngineValue } from "../../../../lib/spreadsheet/formula-engine";
import type { ChartBlockAttrsV2, ChartData } from "./chartBlockShared";
import {
  chartCellFormula,
  chartWorkbookData,
  chartWorkbookHasMissingResults,
  normalizeDocumentChartWorkbook,
  stampDocumentChartWorkbook,
  type ChartWorkbookResult,
  type DocumentChartWorkbook,
} from "./documentChartWorkbook";

export interface ChartWorkbookCalculation {
  workbook: DocumentChartWorkbook;
  data: ChartData;
  /** The results are not in yet (or could not be had): the stamps and the
   * data are the previous ones and the workbook is marked stale. */
  pending: boolean;
}

/** The old main-thread bypass bound: more formulas than this go to the server. */
const MAX_LOCAL_ARITHMETIC_FORMULAS = 256;
/** A workbook the server could not answer is asked again after this long. */
const RETRY_AFTER_MS = 15_000;

const listeners = new Set<() => void>();

/** A stateless results request names no live workbook revision. */
const CHART_WORKBOOK_TOKEN: WorksheetCalculationToken = {
  pageId: "chart-workbook", loadEpoch: 0, generation: 0, workbookRevision: 0, topologyRevision: 0, targetSheetId: null,
};

const cache = new WorkbookValuesCache({
  fetch: (source) => requestWorkbookResults({
    token: CHART_WORKBOOK_TOKEN,
    sheets: source.sheets as readonly BackgroundCalculationSheet[],
  }),
  onSettled: () => {
    for (const listener of [...listeners]) {
      try { listener(); } catch { /* one holder's failure is not another's */ }
    }
  },
  retryAfterMs: RETRY_AFTER_MS,
});

/** Called whenever a requested chart workbook's results land (or fail). */
export function subscribeChartWorkbookResults(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Test seam: forget every answer and every request in flight. */
export function resetChartWorkbookResultsForTests(): void {
  cache.clear();
}

function coordinateOf(key: string, sheet: { rowCount: number; columnCount: number }): [number, number] | null {
  if (!/^\d+:\d+$/.test(key)) return null;
  const [row, col] = key.split(":").map(Number);
  return row < sheet.rowCount && col < sheet.columnCount && `${row}:${col}` === key ? [row, col] : null;
}

/** The engine reads raw input. Typed literal text is quoted only at this
 * boundary (as the chart's evaluation always has); the stored cell is never
 * rewritten into a formula. */
function rawInput(cell: DocumentChartWorkbook["content"]["sheets"][number]["cells"][string]): string {
  const formula = chartCellFormula(cell);
  return formula ?? (cell.kind === "text"
    ? `="${String(cell.value ?? "").replaceAll('"', '""')}"`
    : String(cell.value ?? ""));
}

function calculationSheets(book: DocumentChartWorkbook): BackgroundCalculationSheet[] {
  return book.content.sheets.map((sheet) => {
    // The workbook's defined names ride with the cells: a formula over a
    // name (=SUM(INPUT_VALUES)) was sent without them, came back as an
    // error and was refused for the chart although the grid showed its
    
    
    const namedRanges = Array.isArray(sheet.namedRanges) && sheet.namedRanges.length > 0
      ? sheet.namedRanges as NonNullable<BackgroundCalculationSheetContext["namedRanges"]>
      : null;
    const tables = tableDefsForSheet(sheet.dataTables, sheet, (row, col) => {
      const cell = sheet.cells[`${row}:${col}`];
      return cell ? String(cell.value ?? "") : null;
    });
    // Rows hidden with Hide Rows or a collapsed outline, which SUBTOTAL
    // 101-111 skip as the grid does: without them the chart summed a hidden
    
    const hiddenRows = calcManuallyHiddenRows(
      hiddenRowsFromGroups(normalizeOutlineGroups(sheet.outlineGroups, sheet)),
      sheet.manuallyHiddenRows as Parameters<typeof calcManuallyHiddenRows>[1],
      sheet.rowCount,
    );
    const context: BackgroundCalculationSheetContext = {
      ...(namedRanges ? { namedRanges } : {}),
      ...(tables.length > 0 ? { tables } : {}),
      ...(hiddenRows.size > 0 ? { manuallyHiddenRows: [...hiddenRows].sort((a, b) => a - b) } : {}),
    };
    return {
      id: sheet.id,
      name: sheet.name,
      rowCount: sheet.rowCount,
      columnCount: sheet.columnCount,
      ...(Object.keys(context).length > 0 ? { context } : {}),
      cells: Object.entries(sheet.cells).flatMap(([key, cell]) =>
        coordinateOf(key, sheet) ? [[key, rawInput(cell)] as const] : []),
    };
  });
}

function formulaCoordinates(book: DocumentChartWorkbook): WorksheetFormulaCoordinate[] {
  const coordinates: WorksheetFormulaCoordinate[] = [];
  for (const sheet of book.content.sheets) {
    for (const [key, cell] of Object.entries(sheet.cells)) {
      const at = coordinateOf(key, sheet);
      if (at && chartCellFormula(cell)) coordinates.push({ sheetId: sheet.id, sheetName: sheet.name, row: at[0], col: at[1] });
    }
  }
  return coordinates;
}

/** The arithmetic evaluator's answers, or null when any formula needs the server. */
function arithmeticResults(book: DocumentChartWorkbook, coordinates: readonly WorksheetFormulaCoordinate[]): ReadonlyMap<string, EngineValue> | null {
  if (coordinates.length >= MAX_LOCAL_ARITHMETIC_FORMULAS) return null;
  const bindings = book.content.sheets.map((sheet) => ({
    sheet: { id: sheet.id },
    input: {
      name: sheet.name,
      getRawCell: (row: number, col: number) => {
        const cell = sheet.cells[`${row}:${col}`];
        return cell ? rawInput(cell) : null;
      },
      // Literal text is read by the server (Excel's text-to-number coercion
      // is its); a formula is a formula whatever kind the cell had before.
      options: { isTextCell: (row: number, col: number) => {
        const cell = sheet.cells[`${row}:${col}`];
        return cell?.kind === "text" && !chartCellFormula(cell);
      } },
    },
  })) as unknown as BackgroundCalculationHostBinding[];
  return localArithmeticResults(bindings, coordinates);
}

type ResultsLookup = WorkbookValuesLookup | { readonly kind: "none" };

function lookupResults(book: DocumentChartWorkbook): ResultsLookup {
  const coordinates = formulaCoordinates(book);
  if (coordinates.length === 0) return { kind: "none" };
  // Manual calculation (Formulas > Calculation Options > Manual): the sheet
  // keeps the results it last calculated until Calculate Now, and so does the
  
  // with no result yet is still answered.
  if (book.content.calculationMode === "manual" && !chartWorkbookHasMissingResults(book)) return { kind: "none" };
  const local = arithmeticResults(book, coordinates);
  if (local) return { kind: "values", results: local };
  return cache.lookup({ sheets: calculationSheets(book) });
}

function stampOf(value: EngineValue | undefined): ChartWorkbookResult | undefined {
  if (value === undefined) return undefined;
  const scalar = isArrayValue(value) ? (value.grid[0]?.[0] ?? null) : value;
  if (isLambdaValue(scalar)) return "#CALC!";
  if (isOmittedValue(scalar)) return null;
  if (isFormulaError(scalar)) return scalar.code;
  return scalar as ChartWorkbookResult;
}

function settledWith(attrs: ChartBlockAttrsV2, source: DocumentChartWorkbook, lookup: ResultsLookup): ChartWorkbookCalculation | null {
  if (lookup.kind === "none") {
    const workbook = structuredClone(source);
    delete workbook.content.calculationStale;
    return { ...chartWorkbookData(attrs, workbook), pending: false };
  }
  if (lookup.kind !== "values") return null;
  const results = lookup.results;
  const workbook = stampDocumentChartWorkbook(
    source,
    (sheetName, row, col) => stampOf(results.get(worksheetFormulaResultKey(sheetName, row, col))),
    (sheetName, row, col) => {
      const value = results.get(worksheetFormulaResultKey(sheetName, row, col));
      const scalar = value !== undefined && isArrayValue(value) ? (value.grid[0]?.[0] ?? null) : value;
      return typeof scalar === "string";
    },
  );
  if (!workbook) return null;
  // An array formula's result spills into the cells to its right and below:
  // they are stamped too (`spill`), so a chart over the range reads every
  // value, not the anchor alone (PPT-B382). A cell with its own content is
  // never overwritten.
  for (const sheet of workbook.content.sheets) {
    for (const [key, cell] of Object.entries(sheet.cells)) {
      if (!chartCellFormula(cell)) continue;
      const [r, c] = key.split(":").map(Number);
      const value = results.get(worksheetFormulaResultKey(sheet.name, r, c));
      if (!isArrayValue(value)) continue;
      value.grid.forEach((row, dr) => {
        row.forEach((item, dc) => {
          if (dr === 0 && dc === 0) return;
          const spillKey = `${r + dr}:${c + dc}`;
          const existing = sheet.cells[spillKey];
          if (existing && (chartCellFormula(existing) || (existing.value !== undefined && existing.value !== ""))) return;
          sheet.cells[spillKey] = { ...(existing ?? {}), computed: stampOf(item) ?? null, spill: true };
        });
      });
    }
  }
  return { ...chartWorkbookData(attrs, workbook), pending: false };
}

/** A formula naming a reference that no longer exists (`#REF!` outside its
 * quoted text): Excel's result for it is `#REF!` whatever else it reads. */
export function formulaHasDeletedReference(formula: string): boolean {
  return /#REF!/i.test(formula.replace(/"(?:[^"]|"")*"/g, ""));
}

function pendingWith(attrs: ChartBlockAttrsV2, source: DocumentChartWorkbook): ChartWorkbookCalculation {
  const workbook = structuredClone(source);
  workbook.content.calculationStale = true;
  
  // `#REF!` now, not when the server answers: stamped so, the chart reads it
  // at once and refuses it as the settled reading does. Waiting for the
  // answer kept the chart's old data, and a window closed meanwhile saved
  // that stale workbook and published the old values as current.
  let deleted = false;
  for (const sheet of workbook.content.sheets) {
    for (const cell of Object.values(sheet.cells)) {
      const formula = chartCellFormula(cell);
      if (formula && formulaHasDeletedReference(formula)) {
        cell.computed = "#REF!";
        deleted = true;
      }
    }
  }
  if (deleted) return { workbook, data: chartWorkbookData(attrs, workbook, { missing: "blank" }).data, pending: true };
  let data: ChartData;
  try {
    // The cells as typed over the previous results: a typed number shows at
    // once; a formula without a result yet keeps the chart's data as it is.
    data = chartWorkbookData(attrs, workbook).data;
  } catch {
    data = attrs.data;
  }
  return { workbook, data, pending: true };
}

/**
 * The workbook's cells with their formulas' results stamped and the chart's
 * data read from them, at once when the results are known; else the pending
 * reading (see the module comment). Throws what the chart's source refuses
 * (a missing label, a formula error where a number goes, ...) once the
 * results are known.
 */
export function calculateDocumentChartWorkbook(
  attrs: ChartBlockAttrsV2,
  raw: DocumentChartWorkbook,
): ChartWorkbookCalculation {
  const source = normalizeDocumentChartWorkbook(raw);
  return settledWith(attrs, source, lookupResults(source)) ?? pendingWith(attrs, source);
}

/**
 * {@link calculateDocumentChartWorkbook} once the server has answered (an
 * export, Refresh Data): still pending only when it cannot answer.
 */
export async function calculateDocumentChartWorkbookSettled(
  attrs: ChartBlockAttrsV2,
  raw: DocumentChartWorkbook,
  signal?: AbortSignal,
): Promise<ChartWorkbookCalculation> {
  const source = normalizeDocumentChartWorkbook(raw);
  for (;;) {
    const lookup = lookupResults(source);
    if (lookup.kind !== "pending") return settledWith(attrs, source, lookup) ?? pendingWith(attrs, source);
    await new Promise<void>((resolve, reject) => {
      const done = () => { unsubscribe(); signal?.removeEventListener("abort", aborted); resolve(); };
      const aborted = () => { unsubscribe(); reject(signal!.reason ?? new DOMException("Aborted", "AbortError")); };
      const unsubscribe = subscribeChartWorkbookResults(done);
      if (signal?.aborted) aborted();
      else signal?.addEventListener("abort", aborted, { once: true });
    });
  }
}
