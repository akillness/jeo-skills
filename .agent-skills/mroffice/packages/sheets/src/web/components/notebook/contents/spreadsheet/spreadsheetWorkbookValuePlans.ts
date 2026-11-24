/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { BackgroundCalculationHost } from "@mrnote/core/web/lib/spreadsheet/background-calculation-host.ts";
import { calculationRawSemanticsKey } from "../../../../lib/spreadsheet/formula-input-cache";
import { SpreadsheetPdfViewError, assertSpreadsheetPdfViewBudget, fitSpreadsheetPdfViewBudget, spreadsheetPdfRowRuns, MAX_SPREADSHEET_PDF_FILTER_WORK, type SpreadsheetPdfDerivedCell, type SpreadsheetPdfExportView, type SpreadsheetPdfPanel } from "@mrnote/core/web/lib/spreadsheet/pdf-export-view.ts";
import { canAuthorNativeXlsxChart, chartMatrixSupportsType } from "../../../../lib/spreadsheet/drawing-buttons";
import { type SpreadsheetCell, updateCellValues } from "@mrnote/core/web/lib/spreadsheet/cell-buttons.ts";
import { backgroundInputContexts, buildSpillOverlay, resolveCellChartScalar, resolveCellDisplay } from "@mrnote/core/web/lib/spreadsheet/display-cache.ts";
import { actualFilterNumberForCell, actualSortTypeForCell } from "../../../../lib/spreadsheet/sort-buttons";
import { normalizeSpreadsheetDateSystem } from "@mrnote/core/web/lib/spreadsheet/excel-1900-calendar.ts";
import { spreadsheetChartBornWithModel } from "@mrnote/core/web/lib/spreadsheet/chart-v2-model.ts";
import { spreadsheetChartFamily } from "@mrnote/core/web/lib/spreadsheet/chart-v2-binding.ts";
import { chartTakesColorPalette } from "@mrnote/core/web/components/console/editor/extensions/chartBlockShared.ts";
import { pageDocumentJsonEquals as copilotJsonEqual } from "@mrnote/core/web/lib/page-save-acknowledgement.ts";
import { planCopilotSortFilter, type NativeCopilotSortFilterPlanner } from "@mrnote/core/web/__cut__/m8a31ea8a72.ts";
import { type CopilotSpreadsheetContent, type NativeCopilotChartPlanner } from "@mrnote/core/web/__cut__/mfc2dd2a6e6.ts";
import { createValueStoreWorkbook } from "@mrnote/core/web/lib/spreadsheet/value-store.ts";
import { requestSettledWorkbookResults, type WorkbookAnswerRequest, type WorkbookValuesLookup } from "@mrnote/core/web/lib/spreadsheet/workbook-values-cache.ts";
import { MAX_CALCULATION_RULES, type CalculationRuleRequest } from "@mrnote/core/web/lib/spreadsheet/background-calculation-protocol.ts";
import { calculationRuleRequests, conditionalRuleFormulas } from "../../../../lib/spreadsheet/calculation-rule-requests";
import { type WorksheetCalculationToken } from "@mrnote/core/web/lib/spreadsheet/calculation-mode.ts";
import { formatCellValue, type SheetEvaluator, type SpillOverlay, type EngineValue } from "@mrnote/core/web/lib/spreadsheet/formula-engine.ts";
import { coveredCells, mergeAnchorCells, normalizeMerges } from "@mrnote/core/web/lib/spreadsheet/merge-cells.ts";
import {
  DEFAULT_SPREADSHEET_COLUMN_WIDTH_PX,
  DEFAULT_SPREADSHEET_HEADER_HEIGHT_PX,
  DEFAULT_SPREADSHEET_HEADER_WIDTH_PX,
  DEFAULT_SPREADSHEET_ROW_HEIGHT_PX,
  offsetOfLine,
  resolvedColumnWidth,
  resolvedRowHeight,
} from "@mrnote/core/web/lib/spreadsheet/grid-sizing.ts";
import { normalizeNamedRanges } from "@mrnote/core/web/lib/spreadsheet/named-ranges.ts";
import { buildChartSeries, MAX_CHARTS, normalizeCharts, type SpreadsheetChart, type SpreadsheetChartType } from "@mrnote/core/web/lib/spreadsheet/chart.ts";
import { sheetPivots } from "@mrnote/core/web/lib/spreadsheet/pivot.ts";
import { type PivotOverlaySheet } from "@mrnote/core/web/lib/spreadsheet/pivot-overlay.ts";
import { calculationPivotsFromResults } from "@mrnote/core/web/lib/spreadsheet/calculation-pivots.ts";
import { type PivotOutputLabels } from "@mrnote/core/web/lib/spreadsheet/pivot-output.ts";
import { localFilterDateToday, type FilterDateToday } from "@mrnote/core/web/lib/spreadsheet/date-filter-tree.ts";
import { parseA1Range } from "@mrnote/core/web/lib/spreadsheet/print-settings.ts";
import { normalizePastPageRules, normalizeRules as normalizeConditionalRules, type ConditionalFormatRule } from "@mrnote/core/web/lib/spreadsheet/conditional-format.ts";
import { applySheetViewFilters, sheetViewRowOrder, type SpreadsheetSheetViewFilterState, type SpreadsheetSheetViewSortState } from "../../../../lib/spreadsheet/sheet-views";
import { type SheetModel } from "./spreadsheetSheetModel";
import { MAX_SHEET_COLS, MAX_SHEET_ROWS } from "./spreadsheetGridConstants";
import { normalizeSheets } from "./spreadsheetNormalizeSheets";
import { buildWorkbookSheetInput, filterBootstrapForSheet, hiddenRowsForFilters, type RuleAnswers, ruleAnswersOf } from "./spreadsheetHiddenRows";
import { planSpreadsheetCellValue } from "./spreadsheetCellValuePlan";
import { excelDateSystemArg } from "@mrnote/core/web/lib/spreadsheet/excel-1900-calendar.ts";
import { MAX_GRID_COLUMNS, MAX_GRID_ROWS } from "@mrnote/core/web/lib/spreadsheet/grid-sizing.ts";

export function resolveCellChartValue(
  cell: SpreadsheetCell | undefined,
  row: number,
  col: number,
  evaluator: SheetEvaluator,
  overlay: SpillOverlay,
): string {
  const value = resolveCellChartScalar(cell, row, col, evaluator, overlay);
  return typeof value === "number" && Number.isFinite(value) ? String(value) : formatCellValue(value);
}

/**
 * Each sheet's rules past the ones its page lists (by sheet id), from the raw
 * content's read-only `conditionalFormatsPastPage` (the API reads them from
 * the saved file for a print it makes, spreadsheet_cf_overflow), clamped to
 * the normalized sheet's grid; empty for every page the editor holds.
 */
export function spreadsheetPastPageRules(content: Record<string, unknown>, sheets: readonly SheetModel[]): Map<string, ConditionalFormatRule[]> {
  const out = new Map<string, ConditionalFormatRule[]>();
  const raw = Array.isArray(content["sheets"]) ? content["sheets"] as unknown[] : [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as { id?: unknown; conditionalFormatsPastPage?: unknown };
    if (!Array.isArray(record.conditionalFormatsPastPage) || record.conditionalFormatsPastPage.length === 0) continue;
    const sheet = sheets.find((candidate) => candidate.id === record.id);
    if (!sheet) continue;
    const rules = normalizePastPageRules(record.conditionalFormatsPastPage, { maxRow: sheet.rowCount - 1, maxCol: sheet.columnCount - 1 });
    if (rules.length) out.set(sheet.id, rules);
  }
  return out;
}

/** What the saved workbook's PDF view reads from the calculation: every
 * formula result, and the conditional-format rule formulas its colour
 * filters read (C2). */
export type SpreadsheetPdfValues = { readonly results: ReadonlyMap<string, EngineValue>; readonly rules: RuleAnswers | null };

/** The saved workbook's formula results for its PDF view, when a filter or a
 * sort of the view reads them (the calculation, stateless); null without. */
export async function spreadsheetPdfExportValues(savedContent: Record<string, unknown>, sorted: boolean, view: CopilotPivotView,
  /** A print no window makes reads every result (its derived cells do: a
   * PivotTable's source, a spill, a formula's number format), answered by
   * `request` (the engine host's own calculation on the server). */
  options?: {
    readonly always?: boolean; readonly request?: WorkbookAnswerRequest;
    /** A server-only print's own bound on the rule formulas it asks (the
     * engine answers them in one call on one workbook); the protocol's
     * MAX_CALCULATION_RULES / MAX_CALCULATION_RULE_CELLS without. */
    readonly ruleBounds?: { readonly requests: number; readonly cells: number };
  }): Promise<SpreadsheetPdfValues | null> {
  const sheets = normalizeSheets(savedContent);
  const pastPage = spreadsheetPastPageRules(savedContent, sheets);
  const filtered = sheets.some(sheet => Object.keys(sheet.filters ?? {}).length || Object.keys(sheet.colorFilters ?? {}).length ||
    Object.keys(sheet.conditionFilters ?? {}).length || sheet.dataTables?.some(table => Object.keys(table.columnFilters ?? {}).length));
  // A colour filter over a formula rule's colour reads the rule's answer,
  // and so does the PDF's own paint of a formula rule or a formula stop
  // (the grid reads the calculation's answer for them, never evaluating).
  // A sheet's rules past the ones its page lists follow its own, lowest in
  // priority: a bound cuts them first.
  const sheetRules = sheets.map(sheet => [
    ...normalizeConditionalRules(sheet.conditionalFormats, { maxRow: sheet.rowCount - 1, maxCol: sheet.columnCount - 1 }),
    ...(pastPage.get(sheet.id) ?? []),
  ]);
  const formulaPainted = sheetRules.map(rules => rules.some(rule => conditionalRuleFormulas(rule).length > 0));
  if (!filtered && !sorted && !formulaPainted.some(Boolean) && !options?.always) return null;
  const rules = sheets.flatMap((sheet, index) => formulaPainted[index] || Object.keys(sheet.colorFilters ?? {}).length ||
      sheet.dataTables?.some(table => Object.keys(table.columnFilters ?? {}).length)
    ? calculationRuleRequests(sheet, sheetRules[index], [], [], options?.ruleBounds) : [])
    .slice(0, options?.ruleBounds?.requests ?? MAX_CALCULATION_RULES);
  const settled = await fetchSettledWorkbook({ sheets, dateSystem: savedContent["dateSystem"] }, view, rules, options?.request).catch(() => null);
  return settled ? { results: settled.results, rules: ruleAnswersOf({ rules, ruleValues: settled.ruleValues ?? new Map() }) } : null;
}

/**
 * The cells a sheet shows beyond what it stores, for the PDF view: the host
 * supplies them per saved sheet (PivotTable reports, spills, table style
 * paint); the builder only attaches what it is given, within the budget.
 */
export type SpreadsheetPdfDerivedCellsProvider = (sheet: SheetModel) =>
  readonly SpreadsheetPdfDerivedCell[] | {
    readonly cells: readonly SpreadsheetPdfDerivedCell[];
    readonly glyphs: readonly string[];
    readonly panels?: readonly SpreadsheetPdfPanel[];
    /** Some were left out past the sheet's budget. */
    readonly trimmed?: boolean;
  };

export function createSpreadsheetPdfExportView(
  savedContent: Record<string, unknown>,
  session?: {
    sheetId: string;
    filters: SpreadsheetSheetViewFilterState;
    sortState?: SpreadsheetSheetViewSortState;
    /** The display order the view showed (display slot -> sheet row). */
    rowOrder?: readonly number[];
  },
  today: FilterDateToday = localFilterDateToday(),
  derivedCells?: SpreadsheetPdfDerivedCellsProvider,
  /** Every formula's result in the saved workbook (the calculation's,
   * spreadsheetPdfExportValues, with the rule formulas its colour filters
   * read); without them the saved stamps. */
  answer?: SpreadsheetPdfValues | ReadonlyMap<string, EngineValue> | null,
): SpreadsheetPdfExportView {
  const values = answer instanceof Map ? answer : (answer as SpreadsheetPdfValues | null | undefined)?.results;
  const ruleValues = answer instanceof Map ? null : (answer as SpreadsheetPdfValues | null | undefined)?.rules ?? null;
  const savedSheets = normalizeSheets(savedContent);
  const date1904 = excelDateSystemArg(savedContent["dateSystem"]);
  if (session && !savedSheets.some(sheet => sheet.id === session.sheetId)) throw new SpreadsheetPdfViewError("source_changed");
  const sheets = savedSheets.map(sheet => sheet.id === session?.sheetId ? applySheetViewFilters(sheet, session.filters) : sheet);
  const filtered = (sheet: SheetModel) => Boolean(Object.keys(sheet.filters ?? {}).length || Object.keys(sheet.colorFilters ?? {}).length ||
    Object.keys(sheet.conditionFilters ?? {}).length || sheet.dataTables?.some(table => Object.keys(table.columnFilters ?? {}).length));
  const needsEvaluation = sheets.some(filtered) || Boolean(session?.sortState);
  // A filter reads its own columns on every row, not the whole sheet: the
  // work counted rows x every column, so a wide filtered sheet refused the
  // whole PDF (and Print) while far within what the filter reads.
  const filteredColumns = (sheet: SheetModel) => Math.max(1, new Set([
    ...Object.keys(sheet.filters ?? {}), ...Object.keys(sheet.colorFilters ?? {}), ...Object.keys(sheet.conditionFilters ?? {}),
    ...(sheet.dataTables ?? []).flatMap((table, index) => Object.keys(table.columnFilters ?? {}).map((key) => `t${index}:${key}`)),
  ]).size);
  const work = needsEvaluation ? sheets.reduce((sum, sheet) => sum + sheet.rowCount + Object.keys(sheet.cells).length +
    (sheet.merges ?? []).reduce((area, merge) => area + merge.rowSpan * merge.colSpan, 0) +
    (filtered(sheet) ? sheet.rowCount * Math.min(sheet.columnCount, filteredColumns(sheet)) : 0), 0) : 0;
  if (work > MAX_SPREADSHEET_PDF_FILTER_WORK) throw new SpreadsheetPdfViewError("too_complex");
  let providerTrimmed = false;
  const view: SpreadsheetPdfExportView = { version: 1, sheets: sheets.map(sheet => {
    const sorting = session?.sheetId === sheet.id ? session.sortState : undefined;
    // The saved view reads the calculation's results (saved content may
    // lack a stamp, e.g. a cross-sheet formula never shown); nothing is
    // evaluated here (C2).
    const bootstrap = filtered(sheet) || sorting ? filterBootstrapForSheet(sheet, sheets, date1904, values ?? "stored") : undefined;
    const covered = bootstrap ? coveredCells(normalizeMerges(sheet.merges)) : new Set<string>();
    const hidden = filtered(sheet) ? hiddenRowsForFilters(sheet, sheet.cells, covered,
      normalizeNamedRanges(sheet.namedRanges), sheet.rowCount, sheet.columnCount, { bootstrap, today, date1904, ruleValues }) : new Set<number>();
    let order: number[] | null = null;
    // The live view's own order covers every key a view can hold (colours,
    // icons, Table sorts); it is taken when it is a permutation of this sheet.
    const liveOrder = session?.sheetId === sheet.id ? session.rowOrder?.slice(0, sheet.rowCount) : undefined;
    if (liveOrder && liveOrder.length === sheet.rowCount &&
      new Set(liveOrder).size === sheet.rowCount && liveOrder.every((row) => Number.isInteger(row) && row >= 0 && row < sheet.rowCount)) {
      order = liveOrder;
    } else if (sorting && bootstrap) {
      const bounds = parseA1Range(sorting.ref.replace(/\$/g, ""));
      if (!bounds || bounds.r1 < 0 || bounds.r2 >= sheet.rowCount || bounds.c1 < 0 || bounds.c2 >= sheet.columnCount) throw new SpreadsheetPdfViewError("source_changed");
      const overlay = buildSpillOverlay(sheet.cells, covered, bootstrap, undefined, mergeAnchorCells(normalizeMerges(sheet.merges)));
      order = sheetViewRowOrder(sheet.rowCount, sorting, (row, col) => {
        const cell = sheet.cells[`${row}:${col}`];
        const numeric = actualFilterNumberForCell(cell, row, col, bootstrap, overlay);
        // The exported view sorts on the same authenticated key the live view
        // does: the raw scalar, and the logical/error type for values that are
        // neither number nor text. Display text alone would order TRUE and
        // #N/A among the words.
        return { value: resolveCellDisplay(cell, row, col, bootstrap, overlay),
          ...(numeric !== null ? { numericValue: numeric } : actualSortTypeForCell(cell, row, col, bootstrap, overlay) ?? {}) };
      });
    }
    const provided = derivedCells?.(sheet) ?? [];
    const derived = "cells" in provided ? provided.cells : provided;
    const glyphs = "glyphs" in provided ? provided.glyphs : [];
    const panels = "panels" in provided ? provided.panels ?? [] : [];
    if ("trimmed" in provided && provided.trimmed) providerTrimmed = true;
    return { sheetId: sheet.id, hiddenRowRanges: spreadsheetPdfRowRuns([...hidden].sort((a, b) => a - b)),
      ...(order && order.some((row, index) => row !== index) ? { rowOrderRanges: spreadsheetPdfRowRuns(order, true) } : {}),
      ...(derived.length ? { derivedCells: [...derived] } : {}),
      ...(glyphs.length ? { glyphs: [...glyphs] } : {}),
      ...(panels.length ? { panels: [...panels] } : {}) };
  }) };
  // The grid's extras past their budget are left out, never the PDF; the
  // view says so (budgetTrimmed), and an export drawn from it tells the reader.
  const fitted = fitSpreadsheetPdfViewBudget(providerTrimmed ? { ...view, budgetTrimmed: true } : view);
  assertSpreadsheetPdfViewBudget(fitted);
  return fitted;
}

/**
 * What a Copilot planner reads a planned workbook's formulas from (C2): the
 * server's results for that exact workbook (WorkbookValuesCache), "pending"
 * while they are on their way or when the server cannot answer it (the
 * planner cannot plan yet: null). Without a lookup only a workbook with no
 * formula is read (its typed values). Nothing is evaluated here (C3).
 */
export type CopilotWorkbookValues = (content: CopilotSpreadsheetContent) => WorkbookValuesLookup;
const COPILOT_PENDING = Symbol("copilot-values-pending");
function copilotPlanEvaluator(
  content: CopilotSpreadsheetContent,
  sheet: SheetModel,
  values: CopilotWorkbookValues | undefined,
): SheetEvaluator | typeof COPILOT_PENDING {
  // The server unable to answer plans nothing (the cache asks again after a
  // while), never computing the workbook here.
  const sheets = content.sheets as unknown as SheetModel[];
  let results: ReadonlyMap<string, EngineValue> = new Map();
  if (values) {
    const lookup = values(content);
    if (lookup.kind === "pending" || lookup.kind === "local") return COPILOT_PENDING;
    results = lookup.results;
  } else if (sheets.some((candidate) => Object.values(candidate.cells).some((cell) => Boolean(cell?.formula)))) return COPILOT_PENDING;
  const date1904 = excelDateSystemArg((content as Record<string, unknown>)["dateSystem"]);
  return createValueStoreWorkbook(sheets.map((candidate) => buildWorkbookSheetInput(candidate, { date1904 })), { results, date1904 })
    .evaluatorFor(sheet.name || sheet.id);
}

/** A stateless results request names no live workbook revision. */
const COPILOT_VALUES_TOKEN: WorksheetCalculationToken = { pageId: "copilot-plan", loadEpoch: 0, generation: 0, workbookRevision: 0, topologyRevision: 0, targetSheetId: null };

/** The view a workbook's PivotTable reports are laid out in (labels, collapsed items). */
type CopilotPivotView = { readonly labels: PivotOutputLabels; readonly collapsed: ReadonlySet<string> };

/** Every formula result of a planned workbook, from the server (null: it
 * cannot take it), with its PivotTables' reports laid over the cells the way
 * the session lays them (pivot option C): a formula reading a report reads it. */
export async function fetchCopilotWorkbookResults(source: { sheets: readonly object[]; dateSystem?: unknown }, view: CopilotPivotView): Promise<ReadonlyMap<string, EngineValue> | null> {
  return (await fetchSettledWorkbook(source, view))?.results ?? null;
}

/** A workbook's results (and the rule formulas asked beside them) from the
 * stateless calculation, its PivotTables' reports settled. */
async function fetchSettledWorkbook(source: { sheets: readonly object[]; dateSystem?: unknown }, view: CopilotPivotView,
  rules?: readonly CalculationRuleRequest[], request?: WorkbookAnswerRequest): Promise<Awaited<ReturnType<typeof requestSettledWorkbookResults>>> {
  const sheets = source.sheets as unknown as SheetModel[];
  const date1904 = excelDateSystemArg(source.dateSystem);
  const inputs = sheets.map((candidate) => buildWorkbookSheetInput(candidate, { date1904 }));
  const host = new BackgroundCalculationHost();
  const prepared = host.reset(COPILOT_VALUES_TOKEN, sheets.map((candidate, index) => ({ sheet: candidate, input: inputs[index],
    rawSemanticsKey: calculationRawSemanticsKey(candidate), resolverContext: { options: inputs[index].options, serialized: backgroundInputContexts.get(inputs[index]) ?? {} } })),
    undefined, date1904);
  host.clear();
  if (!prepared.ok) return null;
  const derive = sheets.some((candidate) => sheetPivots(candidate).length > 0)
    ? (results: ReadonlyMap<string, EngineValue>) => calculationPivotsFromResults(sheets as unknown as PivotOverlaySheet[], inputs, results,
        { date1904, labels: view.labels, collapsed: view.collapsed })
    : undefined;
  return requestSettledWorkbookResults(prepared.snapshot, derive, undefined, request, rules);
}

/** Native batch planner for the private preview and the receipt-bound writer.
 * Every step uses the typing planner; no save/history/React state is touched. */
export function planSpreadsheetCopilotSortFilter(
  content: Parameters<NativeCopilotSortFilterPlanner>[0],
  operation: Parameters<NativeCopilotSortFilterPlanner>[1],
  values?: CopilotWorkbookValues,
): ReturnType<NativeCopilotSortFilterPlanner> {
  const sheets=content.sheets as unknown as SheetModel[];
  const sheet=sheets.find(s=>s.id===operation.sheet_id);
  if(!sheet)return null;
  try {
    const evaluator=copilotPlanEvaluator(content,sheet,values);
    if(evaluator===COPILOT_PENDING)return null;
    const spill=buildSpillOverlay(sheet.cells,coveredCells(normalizeMerges(sheet.merges)),evaluator);
    const next=planCopilotSortFilter(sheet as unknown as CopilotSpreadsheetContent["sheets"][number],operation,(row,col)=>{
      const cell=sheet.cells[`${row}:${col}`];
      const numeric=actualFilterNumberForCell(cell,row,col,evaluator,spill);
      // Logicals and errors carry their type the way the numeric scalar does,
      // so a planned sort lands in Excel's order (numbers, text, FALSE, TRUE,
      // errors) instead of ordering TRUE and #N/A as the text they display.
      return {value:resolveCellDisplay(cell,row,col,evaluator,spill),...(numeric!==null?{numericValue:numeric}:actualSortTypeForCell(cell,row,col,evaluator,spill)??{})};
    },(row,col)=>spill.spilled.has(`${row}:${col}`)||spill.blocked.has(`${row}:${col}`));
    return next?{...content,sheets:content.sheets.map(s=>s.id===sheet.id?next:s)}:null;
  } catch { return null; }
}

export function planSpreadsheetCopilotValues(
  content: CopilotSpreadsheetContent,
  sheetId: string,
  writes: readonly { row: number; col: number; value: string }[],
  authority: Pick<
    Parameters<typeof planSpreadsheetCellValue>[3],
    "isEditableCell" | "rangeHasLockedCell"
  >,
  values?: CopilotWorkbookValues,
): CopilotSpreadsheetContent | null {
  // As many as one command may list (MAX_SPREADSHEET_COMMAND_CELLS).
  if (writes.length > 20_000) return null;
  let sheets = content.sheets as unknown as SheetModel[];
  const index = sheets.findIndex((sheet) => sheet.id === sheetId);
  if (index < 0) return null;
  for (const write of writes) {
    if (
      !Number.isSafeInteger(write.row) ||
      !Number.isSafeInteger(write.col) ||
      write.row < 0 ||
      write.col < 0 ||
      write.row >= MAX_SHEET_ROWS ||
      write.col >= MAX_SHEET_COLS ||
      typeof write.value !== "string"
    )
      return null;
  }
  // The spills a write must not land in are read from two workbooks, never
  // one per write: each planned workbook is a server round trip, and a
  // column of 40 or 80 formulas asked one after another -- past the values
  // cache's 16 entries, so the first were gone by the time the last landed
  // and the chain began again -- left the Copilot's preview "calculating"
  // for as long as anyone waited (H41 C07, H43 C10, H44 C07). The workbook
  // before the writes names the arrays already on the sheet; the workbook
  // after them names any array a written formula (or a written argument of
  // an existing one) would lay over another written cell.
  const spillsOf = (planned: SheetModel[]): SpillOverlay & { evaluator: SheetEvaluator } | null | typeof COPILOT_PENDING => {
    const sheet = planned[index];
    if (!Object.values(sheet.cells).some((cell) => Boolean(cell?.formula))) return null;
    const evaluator = copilotPlanEvaluator({ ...content, sheets: planned as unknown as CopilotSpreadsheetContent["sheets"] }, sheet, values);
    if (evaluator === COPILOT_PENDING) return COPILOT_PENDING;
    return { ...buildSpillOverlay(sheet.cells, coveredCells(normalizeMerges(sheet.merges)), evaluator), evaluator };
  };
  let before: ReturnType<typeof spillsOf>;
  try {
    before = spillsOf(sheets);
  } catch {
    // A missing formula authority must not turn a spill cell into a writer.
    return null;
  }
  if (before === COPILOT_PENDING) return null;
  const spilled: { has(key: string): boolean } = before?.spilled ?? new Set<string>();
  const written = new Set<string>();
  // Writes outside every table are plain cells (planSpreadsheetCellValue
  // writes them with updateCellValue after its protection and spill gates):
  // checked one by one, written in one pass. A table's cells keep their
  // calculated-column and header rules, one by one.
  const target = sheets[index];
  const tables = target.dataTables ?? [];
  const inTable = (write: { row: number; col: number }) =>
    tables.some(
      (table) =>
        write.row >= table.range.r1 &&
        write.row <= table.range.r2 + 1 &&
        write.col >= table.range.c1 &&
        write.col <= table.range.c2,
    );
  if (writes.length > 1 && !writes.some(inTable)) {
    for (const write of writes) {
      if (!authority.isEditableCell(target, write.row, write.col)) return null;
      if (write.value.trim() && spilled.has(`${write.row}:${write.col}`)) return null;
    }
    const next = updateCellValues(target, writes);
    sheets = sheets.map((candidate, at) => (at === index ? next : candidate));
    for (const write of writes) {
      const key = `${write.row}:${write.col}`;
      if (write.value.trim()) written.add(key); else written.delete(key);
    }
  } else
  for (const write of writes) {
    const plan = planSpreadsheetCellValue(sheets, index, write, {
      ...authority,
      spilled,
    });
    if (!plan.ok) return null;
    sheets = plan.sheets;
    const key = `${write.row}:${write.col}`;
    if (write.value.trim()) written.add(key); else written.delete(key);
  }
  if (written.size) {
    let after: ReturnType<typeof spillsOf>;
    try {
      after = spillsOf(sheets);
    } catch {
      return null;
    }
    if (after === COPILOT_PENDING) return null;
    // An array the batch blocks: its footprint holds a cell the batch wrote
    // (other than the anchor), and it was not blocked already. That is the
    // write into a spill a batch writer refuses, whichever came first.
    for (const anchor of after?.blocked ?? []) {
      if (before?.blocked.has(anchor)) continue;
      const [row, col] = anchor.split(":").map(Number);
      const block = after!.evaluator.getArray(row, col);
      if (!block) continue;
      const height = block.length, width = block[0]?.length ?? 0;
      for (const key of written) {
        if (key === anchor) continue;
        const [r, c] = key.split(":").map(Number);
        if (r >= row && r < row + height && c >= col && c < col + width) return null;
      }
    }
  }
  return {
    ...content,
    sheets: sheets as unknown as CopilotSpreadsheetContent["sheets"],
  };
}

/** Range-chart construction shares the native Insert data/type gates. No
 * snapshot numbers are authored; the chart keeps live worksheet references. */
/** The rightmost column the sheet writes anything into (a value, or a merge
 * that reaches across), or -1 for an empty sheet. */
function sheetUsedColumnEnd(sheet: SheetModel): number {
  let end = -1;
  for (const [key, cell] of Object.entries(sheet.cells ?? {})) {
    const value = (cell as { value?: unknown } | undefined)?.value;
    if (value === undefined || value === null || value === "") continue;
    const col = Number(key.split(":")[1]);
    if (Number.isInteger(col) && col > end) end = col;
  }
  for (const merge of normalizeMerges(sheet.merges)) end = Math.max(end, merge.col + merge.colSpan - 1);
  return end;
}

export function planSpreadsheetCopilotChart(
  content: Parameters<NativeCopilotChartPlanner>[0],
  sheetId: Parameters<NativeCopilotChartPlanner>[1],
  operation: Parameters<NativeCopilotChartPlanner>[2],
  id: Parameters<NativeCopilotChartPlanner>[3],
  values?: CopilotWorkbookValues,
): ReturnType<NativeCopilotChartPlanner> {
  const sheets = content.sheets as unknown as SheetModel[];
  const sheet = sheets.find((item) => item.id === sheetId);
  const {
    start_row: row,
    start_col: col,
    row_count: rows,
    col_count: cols,
  } = operation;
  const type = operation.chart_type as SpreadsheetChartType;
  if (
    !sheet ||
    sheet.protected ||
    sheet.chartSheet ||
    !canAuthorNativeXlsxChart(type) ||
    ![row, col, rows, cols].every(Number.isInteger) ||
    row < 0 ||
    col < 0 ||
    rows < 1 ||
    cols < 1 ||
    rows * cols > 1024 ||
    // The worksheet's own bounds, not the 10,000 x 1,000 grid the editor had.
    row + rows > MAX_GRID_ROWS ||
    col + cols > MAX_GRID_COLUMNS ||
    (normalizeCharts(sheet.charts).length >= MAX_CHARTS && !normalizeCharts(sheet.charts).some(chart => chart.id === id))
  )
    return null;
  try {
    const evaluator = copilotPlanEvaluator(content, sheet, values);
    if (evaluator === COPILOT_PENDING) return null;
    const spill = buildSpillOverlay(
      sheet.cells,
      coveredCells(normalizeMerges(sheet.merges)),
      evaluator,
    );
    const matrix = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) =>
        resolveCellDisplay(
          sheet.cells[`${row + r}:${col + c}`],
          row + r,
          col + c,
          evaluator,
          spill,
        ),
      ),
    );
    if (
      !chartMatrixSupportsType(
        matrix,
        type,
        operation.series_in_columns !== false,
      )
    )
      return null;
    // Beside the sheet's data, at the source's top row: a chart with no
    // place of its own is drawn at a fixed spot near the top-left of the
    
    // 四大指数 column chart over C1:D8).
    const besideCol = sheetUsedColumnEnd(sheet) + 1;
    const width = (line: number) => resolvedColumnWidth(line, sheet.columnWidths,
      sheet.defaultColumnWidth ?? DEFAULT_SPREADSHEET_COLUMN_WIDTH_PX);
    const height = (line: number) => resolvedRowHeight(line, sheet.rowHeights,
      sheet.defaultRowHeight ?? DEFAULT_SPREADSHEET_ROW_HEIGHT_PX);
    // One series: no legend, as Excel inserts a single-series chart (its
    // legend only repeated "Series 1").
    const seriesCount = operation.series_in_columns === false ? rows - 1 : cols - 1;
    const flat: SpreadsheetChart = {
      id,
      type,
      range: { r1: row, c1: col, r2: row + rows - 1, c2: col + cols - 1 },
      anchor: { row, col: besideCol },
      // In the drawing layer's frame, past the row and column headings, as
      // Insert Chart places one (lib/spreadsheet/chart-buttons): without
      
      x: Math.round(
        DEFAULT_SPREADSHEET_HEADER_WIDTH_PX +
          offsetOfLine(besideCol, Math.max(sheet.columnCount ?? 0, besideCol + 1), width) +
          24,
      ),
      y: Math.round(
        DEFAULT_SPREADSHEET_HEADER_HEIGHT_PX +
          offsetOfLine(row, Math.max(sheet.rowCount ?? 0, row + 1), height),
      ),
      // Insert Chart's chart: Excel's 5 x 3 inches, the legend under the
      // plot area, Colorful Palette 1. At 320 x 200 the title ran into the
      // value axis's top label.
      width: 480,
      height: 288,
      legendPosition: "bottom",
      ...(chartTakesColorPalette(spreadsheetChartFamily(type))
        ? { chartColorPalette: "colorful-1" as const }
        : {}),
      ...(operation.title?.trim() ? { title: operation.title.trim() } : {}),
      ...(operation.series_in_columns === false
        ? { seriesInColumns: false }
        : {}),
      ...(seriesCount === 1 ? { showLegend: false } : {}),
    };
    // Born with its model, as Insert Chart's chart is.
    const cellAt = (r: number, c: number) => sheet.cells[`${r}:${c}`];
    const chart = spreadsheetChartBornWithModel(flat, {
      rows: buildChartSeries(
        flat,
        (r, c) => resolveCellDisplay(cellAt(r, c), r, c, evaluator, spill),
        (r, c) => resolveCellChartValue(cellAt(r, c), r, c, evaluator, spill),
      ),
    });
    const normalized = normalizeCharts([chart])[0];
    return normalized && copilotJsonEqual(normalized, chart) ? chart : null;
  } catch {
    return null;
  }
}
