/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { lineBlankAt } from "@mrnote/core/web/lib/spreadsheet/line-styles.ts";
import { storedFilterHiddenRows } from "@mrnote/core/web/lib/spreadsheet/filter-result.ts";
import { filterVisibilityGroups, prepareFilterVisibilitySteps, filterVisibilitySteps, exhaustFilterVisibility, filterMatchText, type FilterVisibilityGroup } from "../../../../lib/spreadsheet/filter-visibility";
import { FilterVisibilityClient, drainFilterVisibility } from "../../../../lib/spreadsheet/filter-visibility-client";
import { yieldCalculationTask } from "@mrnote/core/web/lib/spreadsheet/background-calculation-protocol.ts";
import { type CellMap } from "@mrnote/core/web/lib/spreadsheet/cell-buttons.ts";
import { buildSpillOverlay, cellPictureEngineOption, cellsCarryingEngineFacts, resolveCellDisplay, spillTargetOccupied, workbookSheetInputFor } from "@mrnote/core/web/lib/spreadsheet/display-cache.ts";
import { actualFilterNumberForCell } from "../../../../lib/spreadsheet/sort-buttons";
import { createValueStoreWorkbook } from "@mrnote/core/web/lib/spreadsheet/value-store.ts";
import { calculationRuleKey, type CalculationRuleRequest } from "@mrnote/core/web/lib/spreadsheet/background-calculation-protocol.ts";
import { firstPaintFormulaResults } from "@mrnote/core/web/lib/spreadsheet/stored-formula-results.ts";
import { computeSpillOverlaySteps, isDefinitelyScalarAggregateFormula, type CellValue, type SheetEvaluator, type SheetEvaluatorOptions, type SpillOverlay, type WorkbookSheetInput, type EngineValue } from "@mrnote/core/web/lib/spreadsheet/formula-engine.ts";
import { coveredCells, normalizeMerges } from "@mrnote/core/web/lib/spreadsheet/merge-cells.ts";
import { sheetColumnWidthReading, workbookCallsCell } from "../../../../lib/spreadsheet/column-width-reading";
import { normalizeNamedRanges, resolveName as resolveNamedRange } from "@mrnote/core/web/lib/spreadsheet/named-ranges.ts";
import { normalizeDataTableFilterColor, isDataTableIconSetName, normalizeDataTables, type DataTable, type DataTableColumnFilter, type DataTableIconFilter } from "@mrnote/core/web/lib/spreadsheet/data-table.ts";
import { filterValueKey, filterValueKeys, normalizeFillColor, visibleRowIndices, visibleRowIndicesByColor, type ColorRow, type SortFilterRow } from "../../../../lib/spreadsheet/sort-filter";
import { buildRowPredicate, normalizeConditionFilter, type ConditionFilter, type NumberOperator } from "@mrnote/core/web/lib/spreadsheet/filter-conditions.ts";
import { filterDateFromSpreadsheetSerial, filterDateSerialForCell, filterDateMatchesGroup, filterDateMatchesPeriod, localFilterDateToday, type FilterDateToday } from "@mrnote/core/web/lib/spreadsheet/date-filter-tree.ts";
import { parseA1Range } from "@mrnote/core/web/lib/spreadsheet/print-settings.ts";
import { normalizeRules as normalizeConditionalRules, resolveCellConditionalDisplay, type ConditionalFormatRule, type RangeExtent, type RangeStats } from "@mrnote/core/web/lib/spreadsheet/conditional-format.ts";
import { type SheetModel } from "./spreadsheetSheetModel";
import { type ExcelDateSystemArg } from "@mrnote/core/web/lib/spreadsheet/excel-1900-calendar.ts";

/**
 * The set of data rows hidden by the sheet's active AutoFilters, computed the
 * SAME way the component's `hiddenRows` memo does (resolve each filtered
 * column's DISPLAY value via a bootstrap evaluator, then keep rows whose values
 * are all allowed). Shared so the serialize-time display cache feeds SUBTOTAL
 * exactly the visibility seam the grid renders with. Returns an empty set when
 * there are no active filters (the common case).
 */
/**
 * Parse a sheet's `colorFilters` (column -> allowed normalized FILL colors) into
 * a Map, dropping out-of-range columns (so a stale filter on a deleted column
 * never hides every row). Shared by the serialize-time and component paths so
 * "filter by color" hides the SAME rows everywhere. The allowed values are
 * re-normalized defensively so a hand-edited payload (`#FFF`) still matches.
 */
export function parseColorFilters(
  raw: Record<string, string[]> | undefined,
  columnCount: number,
): Map<number, Set<string>> {
  const map = new Map<number, Set<string>>();
  if (raw && typeof raw === "object") {
    for (const [key, values] of Object.entries(raw)) {
      const col = Number(key);
      if (!Number.isInteger(col) || col < 0 || col >= columnCount) continue;
      if (Array.isArray(values)) {
        map.set(col, new Set(values.map((v) => normalizeFillColor(String(v)))));
      }
    }
  }
  return map;
}

/**
 * The data rows hidden by a sheet's `colorFilters` (Excel "Filter by Color").
 * Colors are static cell style (not formula-derived), so this needs no
 * evaluator: it reads `cell.style.backgroundColor` directly. AND-combined with
 * the value-filter hidden set by the callers. Row 0 (header) is never hidden.
 */
function colorHiddenRows(
  sheet: SheetModel,
  cells: CellMap,
  rowCount: number,
  columnCount: number,
  shownColors?: (row: number, col: number) => { fill?: string; font?: string },
): Set<number> {
  const hidden = new Set<number>();
  const colorFilters = parseColorFilters(sheet.colorFilters, columnCount);
  if (colorFilters.size === 0) return hidden;
  const rows: ColorRow[] = [];
  for (let r = 0; r < rowCount; r += 1) {
    const rowCells: Array<{ fill?: string } | undefined> = [];
    for (let c = 0; c < columnCount; c += 1) {
      if (!colorFilters.has(c)) {
        rowCells.push(undefined);
        continue;
      }
      rowCells.push({
        fill: shownColors ? shownColors(r, c).fill : (cells[`${r}:${c}`] ?? (lineBlankAt(sheet, r, c) as typeof cells[string] | undefined))?.style?.backgroundColor,
      });
    }
    rows.push(rowCells);
  }
  const visible = new Set(visibleRowIndicesByColor(rows, colorFilters));
  for (let r = 1; r < rowCount; r += 1) {
    if (!visible.has(r)) hidden.add(r);
  }
  return hidden;
}

/**
 * What a value filter reads (C2): the session's answer for the workbook
 * revision, "stored" for what the saved cells show (an open before the first
 * answer, a saved PDF view); null reads the same stamps (manual calculation:
 * nothing is evaluated here, C3).
 */
export type FilterValueSource = ReadonlyMap<string, EngineValue> | "stored" | null;

/** What a filter over literal cells reads: no formula result. */
export const NO_FILTER_RESULTS: ReadonlyMap<string, EngineValue> = new Map();

/** A value the calculation session has not answered yet (C2). */
export const SESSION_PENDING: unique symbol = Symbol("session-pending");

/** Rule formulas the calculation answered (C2), each with the range it was
 * answered over: per rule key, the "row:col" values that are not FALSE. */
export type RuleAnswers = ReadonlyMap<string, { range: { r1: number; c1: number; r2: number; c2: number }; values: ReadonlyMap<string, EngineValue> }>;

export function ruleAnswersOf(answer: { rules?: readonly CalculationRuleRequest[]; ruleValues?: ReadonlyMap<string, ReadonlyMap<string, EngineValue>> }): RuleAnswers | null {
  if (!answer.rules || !answer.ruleValues) return null;
  const answered = new Map<string, { range: CalculationRuleRequest["range"]; values: ReadonlyMap<string, EngineValue> }>();
  for (const rule of answer.rules) {
    const values = answer.ruleValues.get(calculationRuleKey(rule));
    if (values) answered.set(calculationRuleKey(rule), { range: rule.range, values });
  }
  return answered;
}

/** Rule answers and the calculation they came with. */
export interface RuleAnswersReceipt {
  readonly token: { readonly pageId: string; readonly loadEpoch: number; readonly generation: number };
  readonly answers: RuleAnswers | null;
}

/**
 * The rule answers the grid formats from: of the automatic calculation's
 * latest answer and an explicit one's (Calculate Now / F9, Calculate Sheet),
 * each rule as the latest calculation of this load answered it. Calculate
 * Now starts a new load of the calculation authority, so the automatic
 * answer before it no longer counts and the explicit answer - calculated in
 * the same pass as the cells - is the one the formats show until a later
 * calculation answers (live audit B470). Null when none belongs to this load.
 */
export function latestRuleAnswers(
  receipts: ReadonlyArray<RuleAnswersReceipt | null | undefined>,
  authority: { readonly pageId: string; readonly loadEpoch: number } | null | undefined,
): RuleAnswers | null {
  if (!authority) return null;
  const current = receipts
    .filter((receipt): receipt is RuleAnswersReceipt & { answers: RuleAnswers } => Boolean(receipt?.answers) &&
      receipt!.token.pageId === authority.pageId && receipt!.token.loadEpoch === authority.loadEpoch)
    .sort((left, right) => left.token.generation - right.token.generation);
  if (current.length === 0) return null;
  if (current.length === 1) return current[0].answers;
  const merged = new Map<string, RuleAnswers extends ReadonlyMap<string, infer V> ? V : never>();
  for (const receipt of current) for (const [key, answer] of receipt.answers) merged.set(key, answer);
  return merged;
}

/** A rule formula's answered value at a cell, or SESSION_PENDING where the
 * calculation did not answer it there (the rule grew since, or was not sent). */
export function answeredRuleValue(answers: RuleAnswers | null | undefined, sheetId: string, formula: string, row: number, col: number,
  anchorRow: number, anchorCol: number): CellValue | typeof SESSION_PENDING {
  const answered = answers?.get(calculationRuleKey({ sheetId, formula, anchorRow, anchorCol }));
  return answered && row >= answered.range.r1 && row <= answered.range.r2 && col >= answered.range.c1 && col <= answered.range.c2
    ? (answered.values.get(`${row}:${col}`) ?? false) as CellValue : SESSION_PENDING;
}

export function filterBootstrapForSheet(sheet: SheetModel, sheets: readonly SheetModel[], date1904: ExcelDateSystemArg = false, values: FilterValueSource = null): SheetEvaluator {
  const covered = coveredCells(normalizeMerges(sheet.merges));
  const namedRanges = normalizeNamedRanges(sheet.namedRanges);
  const name = sheet.name || sheet.id;
  const pictures = cellPictureEngineOption(cellsCarryingEngineFacts(sheet.cells), covered).option;
  const options: SheetEvaluatorOptions = {
    ...(namedRanges.length ? { resolveName: (value: string) => resolveNamedRange(value, namedRanges) } : {}),
    ...pictures,
  };
  const inputs: WorkbookSheetInput[] = sheets.map(candidate => candidate.id === sheet.id ? {
    name,
    getRawCell: (row: number, col: number) => covered.has(`${row}:${col}`) ? null : sheet.cells[`${row}:${col}`]?.value ?? null,
    ...(Object.keys(options).length ? { options } : {}),
  } : buildWorkbookSheetInput(candidate, { date1904 }));
  // Without the calculation's answer: what the saved cells already show (C3).
  const results = values && values !== "stored" ? values
    : firstPaintFormulaResults(sheets.map((candidate, index) => ({ sheet: candidate, input: inputs[index] })) as unknown as Parameters<typeof firstPaintFormulaResults>[0]);
  return createValueStoreWorkbook(inputs, { results, date1904 }).evaluatorFor(name);
}

// A standalone serialization bootstrap has different resolver context from
// the live workbook bootstrap. Cache it separately and key every filter/name/
// geometry descriptor as well as the immutable cell map; Sheet View clones
// can then reuse only the exact persisted/default filter context.
const standaloneFilterVisibilityCache = new WeakMap<CellMap, Map<string, ReadonlySet<number>>>();

function standaloneFilterVisibilityKey(sheet: SheetModel) {
  return JSON.stringify([sheet.rowCount, sheet.columnCount, sheet.autoFilterRef, sheet.filters, sheet.colorFilters,
    sheet.conditionFilters, sheet.dataTables, sheet.merges, sheet.namedRanges]);
}
function cacheStandaloneFilterVisibility(sheet: SheetModel, rows: ReadonlySet<number>) {
  const entries = standaloneFilterVisibilityCache.get(sheet.cells) ?? new Map<string, ReadonlySet<number>>();
  entries.set(standaloneFilterVisibilityKey(sheet), rows);
  while (entries.size > 4) entries.delete(entries.keys().next().value!);
  standaloneFilterVisibilityCache.set(sheet.cells, entries);
}
export function ordinaryFilterWork(sheet: SheetModel) {
  const groups = filterVisibilityGroups(sheet);
  return groups?.reduce((total, group) => total + Math.max(0, group.last - group.first + 1) * new Set(group.constraints.map(rule => rule.column)).size, 0) ?? 0;
}
const standaloneFilterPreparationJobs = new WeakMap<CellMap, Map<string, Promise<boolean>>>();
export async function prepareStandaloneFilterVisibility(sheets: readonly SheetModel[], isCurrent: () => boolean) {
  for (const sheet of sheets) {
    const groups = filterVisibilityGroups(sheet);
    const key = standaloneFilterVisibilityKey(sheet);
    if (!groups?.length || ordinaryFilterWork(sheet) < 1_000 || standaloneFilterVisibilityCache.get(sheet.cells)?.has(key)) continue;
    const jobs = standaloneFilterPreparationJobs.get(sheet.cells) ?? new Map<string, Promise<boolean>>();
    let job = jobs.get(key);
    if (!job) {
      job = (async () => {
        const client = new FilterVisibilityClient();
        try {
          await yieldCalculationTask();
          if (!isCurrent()) return false;
          const covered = coveredCells(normalizeMerges(sheet.merges));
          const prepared = await drainFilterVisibility(prepareOrdinaryFilterVisibility(sheet, groups,
            () => filterBootstrapForSheet(sheet, sheets, false, "stored"), covered, true), isCurrent);
          const rows = await client.calculate(prepared, isCurrent);
          if (!isCurrent()) return false;
          cacheStandaloneFilterVisibility(sheet, new Set(rows));
          return true;
        } finally { client.cancel(); }
      })();
      jobs.set(key, job); standaloneFilterPreparationJobs.set(sheet.cells,jobs);
    }
    try { if (!await job || !isCurrent()) return false; }
    finally { if (jobs.get(key) === job) jobs.delete(key); }
  }
  return isCurrent();
}

/**
 * The colors a filter by color reads for a cell: what the grid shows, the fill
 * and font a conditional format lays over the cell's own. Excel filters by the
 * color on screen, whether a rule or the user painted it, so a red that only a
 * rule draws is offered in the menu and kept by the filter (live audit B243).
 * Undefined when the sheet has no conditional formats (static colors only).
 */
function filterCellColorReader(
  sheet: SheetModel,
  evaluator: () => SheetEvaluator,
  ruleValues?: RuleAnswers | null,
): ((row: number, col: number) => { fill?: string; font?: string }) | undefined {
  const rules = normalizeConditionalRules(sheet.conditionalFormats, {
    maxRow: sheet.rowCount - 1,
    maxCol: sheet.columnCount - 1,
  });
  if (rules.length === 0) return undefined;
  let values: SheetEvaluator | undefined;
  const extentCache = new Map();
  const statsCache = new Map();
  return (row, col) => {
    const cell = sheet.cells[`${row}:${col}`] ?? (lineBlankAt(sheet, row, col) as typeof sheet.cells[string] | undefined);
    values ??= evaluator();
    const read = values;
    const cond = resolveCellConditionalDisplay(rules, read.getComputed(row, col), row, col, {
      cellValueAt: (r, c) => read.getComputed(r, c),
      evalFormula: (formula, r, c, anchorRow, anchorCol) => {
        // The rule's value from the calculation (C2); unanswered it does not format.
        const answered = answeredRuleValue(ruleValues, sheet.id, formula, r, c, anchorRow, anchorCol);
        return answered !== SESSION_PENDING ? answered : null;
      },
      extentCache,
      statsCache,
      date1904: read.date1904,
    });
    return {
      fill: cond.style.backgroundColor ?? cell?.style?.backgroundColor,
      font: cond.style.color ?? cell?.style?.color,
    };
  };
}

export function prepareOrdinaryFilterVisibility(
  sheet: SheetModel,
  groups: readonly FilterVisibilityGroup[],
  bootstrapFactory: () => SheetEvaluator,
  covered: ReadonlySet<string>,
  standaloneUnseeded = false,
  formulaCandidates?: readonly string[],
  ruleValues?: RuleAnswers | null,
) {
  // This function returns a generator; expensive evaluator/overlay work begins
  // only after the caller has yielded the first pending frame.
  return (function* () {
    const needsValues = new Set(groups.flatMap(group => group.constraints.filter(rule => rule.values || rule.condition).map(rule => rule.column)));
    const needsNumbers = new Set(groups.flatMap(group => group.constraints.filter(rule => rule.condition).map(rule => rule.column)));
    const bootstrap = needsValues.size ? bootstrapFactory() : undefined;
    let overlay: SpillOverlay | undefined;
    if (bootstrap) {
      const anchors: Array<{row:number; col:number}> = [];
      let scanned = 0;
      // Indexed formula candidates avoid enumerating a large sheet; each key
      // is still judged by its current cell.
      for (const key of formulaCandidates ?? Object.keys(sheet.cells)) {
        if (sheet.cells[key]?.formula && !covered.has(key)) {
          const [row,col] = key.split(":").map(Number);
          // Use the actual raw formula at this anchor, not possibly stale
          // cell.formula metadata. Caller-owned/seeded evaluators stay on the
          // original discovery path, including manual frozen array results.
          // A legacy array formula lays even a SUM over its whole range.
          if (!standaloneUnseeded || (sheet.cells[key] as { arrayRef?: unknown }).arrayRef || !isDefinitelyScalarAggregateFormula(
            bootstrap.getFormula(row,col), { standaloneUnseeded: true },
          )) anchors.push({row,col});
        }
        if (++scanned % 128 === 0) yield;
      }
      overlay = yield* computeSpillOverlaySteps({ anchors,
        getArray: (row,col) => bootstrap.getArray(row,col),
        isOccupied: (row,col) => spillTargetOccupied(sheet.cells, covered, row, col),
      });
    }
    const shownColors = filterCellColorReader(sheet, () => bootstrap ?? bootstrapFactory(), ruleValues);
    return yield* prepareFilterVisibilitySteps(groups, (row, col) => {
      const cell = sheet.cells[`${row}:${col}`];
      const colors = shownColors?.(row, col);
      return {
        display: bootstrap && overlay && needsValues.has(col) ? resolveCellDisplay(cell, row, col, bootstrap, overlay) : "",
        numeric: bootstrap && overlay && needsNumbers.has(col) ? actualFilterNumberForCell(cell, row, col, bootstrap, overlay) : null,
        fill: colors ? colors.fill : cell?.style?.backgroundColor,
        font: colors ? colors.font : cell?.style?.color,
        text: cell?.kind === "text" && !(cell as { formula?: unknown }).formula && !String(cell?.value ?? "").startsWith("="),
        ...(needsValues.has(col) && filterMatchText(cell) !== undefined ? { match: filterMatchText(cell) } : {}),
      };
    });
  })();
}

export function hiddenRowsForFilters(
  sheet: SheetModel,
  cells: CellMap,
  covered: ReadonlySet<string>,
  namedRanges: ReturnType<typeof normalizeNamedRanges>,
  rowCount: number,
  columnCount: number,
  options: {
    bootstrap?: SheetEvaluator;
    /** Builds the bootstrap only if a filter reads values (C2: a ValueStore
     * over the calculation's results; see filterBootstrapForSheet). */
    bootstrapFactory?: () => SheetEvaluator;
    today?: FilterDateToday;
    date1904?: ExcelDateSystemArg;
    /** Conditional-format rule values for colour filters (C2). */
    ruleValues?: RuleAnswers | null;
    /** Apply the filters now (Reapply, a changed criterion) instead of
     *  reading the result the sheet keeps (`filterResult`). */
    apply?: boolean;
  } = {},
): Set<number> {
  // The rows the filters hid when they were last applied stay hidden (and
  // the others shown) until they are applied again, as in Excel: an edited
  
  const kept = options.apply ? null : storedFilterHiddenRows(sheet);
  if (kept) return new Set(kept);
  let madeBootstrap: SheetEvaluator | undefined;
  const seededBootstrap = (): SheetEvaluator | undefined =>
    options.bootstrap ?? (options.bootstrapFactory ? (madeBootstrap ??= options.bootstrapFactory()) : undefined);
  const seeded = Boolean(options.bootstrap || options.bootstrapFactory);
  // The workbook's date system: the bootstrap evaluator's own, else the
  // caller's (a standalone evaluator reads serials in that system too).
  const date1904 = options.bootstrap?.date1904 ?? options.date1904;
  // Without the calculation's answer: what the saved cells already show (C3).
  let storedBootstrap: SheetEvaluator | undefined;
  const storedEvaluator = () => {
    const standalone = { ...sheet, cells, rowCount, columnCount };
    return storedBootstrap ??= filterBootstrapForSheet(standalone, [standalone], date1904, "stored");
  };
  const ordinaryGroups = filterVisibilityGroups(sheet);
  if (ordinaryGroups) {
    const standalone = !seeded && cells === sheet.cells && rowCount === sheet.rowCount && columnCount === sheet.columnCount;
    const cached = standalone ? standaloneFilterVisibilityCache.get(cells)?.get(standaloneFilterVisibilityKey(sheet)) : undefined;
    if (cached) return new Set(cached);
    const prepared = exhaustFilterVisibility(prepareOrdinaryFilterVisibility(
      { ...sheet, cells }, ordinaryGroups,
      () => seededBootstrap() ?? storedEvaluator(), covered, !seeded, undefined, options.ruleValues,
    ));
    const result = new Set(exhaustFilterVisibility(filterVisibilitySteps(prepared)));
    if (standalone) cacheStandaloneFilterVisibility(sheet, result);
    return result;
  }
  // An explicit AutoFilter owns its header and body, not the whole worksheet.
  // Table filters below retain their own independent ranges.
  const filterRange = sheet.autoFilterRef
    ? parseA1Range(sheet.autoFilterRef.replace(/\$/g, ""))
    : null;
  const firstDataRow = filterRange ? filterRange.r1 + 1 : 1;
  const lastDataRow = Math.min(rowCount - 1, filterRange?.r2 ?? rowCount - 1);
  const ownsColumn = (col: number) =>
    !filterRange || (col >= filterRange.c1 && col <= filterRange.c2);
  const colorSheet =
    filterRange && sheet.colorFilters
      ? {
          ...sheet,
          colorFilters: Object.fromEntries(
            Object.entries(sheet.colorFilters).filter(([key]) =>
              ownsColumn(Number(key)),
            ),
          ),
        }
      : sheet;
  const colorEvaluator = () => seededBootstrap() ?? storedEvaluator();
  const hidden = new Set(
    [...colorHiddenRows(
      colorSheet,
      cells,
      rowCount,
      columnCount,
      filterCellColorReader({ ...colorSheet, cells }, colorEvaluator, options.ruleValues),
    )].filter(
      (row) => row >= firstDataRow && row <= lastDataRow,
    ),
  );
  const dataTables = normalizeDataTables(sheet.dataTables, {
    rowCount,
    columnCount,
  });
  const hasTableFilters = dataTables.some(
    (table) => Object.keys(table.columnFilters ?? {}).length > 0,
  );

  // Parse condition filters (Excel "Text Filters" / "Number Filters").
  const activeConditions = new Map<number, ConditionFilter>();
  const rawCond = sheet.conditionFilters;
  if (rawCond && typeof rawCond === "object") {
    for (const [key, cond] of Object.entries(rawCond)) {
      const col = Number(key);
      if (
        !Number.isInteger(col) ||
        col < 0 ||
        col >= columnCount ||
        !ownsColumn(col)
      )
        continue;
      const normalized = normalizeConditionFilter(cond);
      if (normalized) activeConditions.set(col, normalized);
    }
  }

  // Parse value-checkbox filters, SKIPPING columns that have a condition filter
  // (Excel: picking condition mode replaces value-checkbox for that column).
  const activeFilters = new Map<number, Set<string>>();
  const raw = sheet.filters;
  if (raw && typeof raw === "object") {
    for (const [key, values] of Object.entries(raw)) {
      const col = Number(key);
      if (
        !Number.isInteger(col) ||
        col < 0 ||
        col >= columnCount ||
        !ownsColumn(col)
      )
        continue;
      if (activeConditions.has(col)) continue; // condition takes precedence
      if (Array.isArray(values))
        activeFilters.set(col, new Set(values.map(String)));
    }
  }

  if (
    activeFilters.size === 0 &&
    activeConditions.size === 0 &&
    !hasTableFilters
  ) {
    return hidden;
  }

  // Build bootstrap evaluator (needed for formula resolution).
  const bootstrap = seededBootstrap() ?? storedEvaluator();
  const overlay = buildSpillOverlay(cells, covered, bootstrap);
  const conditionalRules = normalizeConditionalRules(sheet.conditionalFormats, {
    maxRow: Math.max(0, rowCount - 1),
    maxCol: Math.max(0, columnCount - 1),
  });
  const iconExtentCache = new Map<ConditionalFormatRule, RangeExtent | null>();
  const iconStatsCache = new Map<ConditionalFormatRule, RangeStats | null>();

  const tableHidden = hiddenRowsForTableFilters(
    dataTables,
    (row, col) =>
      resolveCellDisplay(cells[`${row}:${col}`], row, col, bootstrap, overlay),
    (row, col) =>
      actualFilterNumberForCell(
        cells[`${row}:${col}`],
        row,
        col,
        bootstrap,
        overlay,
      ),
    // A date is the cell's actual number - a formula's result included -
    // under a date format, the identity the filter menu groups by (B459).
    (row, col, requirement) => {
      const cell = cells[`${row}:${col}`];
      return filterDateFromSpreadsheetSerial(
        filterDateSerialForCell(
          actualFilterNumberForCell(cell, row, col, bootstrap, overlay),
          cell?.style?.numberFormat,
          requirement,
        ),
        date1904,
      );
    },
    (row, col, kind) => {
      const style = cells[`${row}:${col}`]?.style;
      const raw = kind === "cell" ? style?.backgroundColor : style?.color;
      return normalizeDataTableFilterColor({ kind, value: raw })?.value ?? null;
    },
    (row, col) => {
      const icon = resolveCellConditionalDisplay(
        conditionalRules,
        bootstrap.getComputed(row, col),
        row,
        col,
        {
          cellValueAt: (targetRow, targetCol) =>
            bootstrap.getComputed(targetRow, targetCol),
          // The rule's value from the calculation; unanswered it matches nothing (C3).
          evalFormula: (formula, targetRow, targetCol, anchorRow, anchorCol) => {
            const answered = answeredRuleValue(options.ruleValues, sheet.id, formula, targetRow, targetCol, anchorRow, anchorCol);
            return answered === SESSION_PENDING ? null : answered;
          },
          extentCache: iconExtentCache,
          statsCache: iconStatsCache,
          date1904,
        },
      ).icon;
      return icon && isDataTableIconSetName(icon.iconSet)
        ? { iconSet: icon.iconSet, iconId: icon.index }
        : null;
    },
    options.today,
  );
  for (const row of tableHidden) hidden.add(row);
  if (activeFilters.size === 0 && activeConditions.size === 0) return hidden;

  // Resolve all columns needed for either filter type.
  const neededCols = new Set([
    ...activeFilters.keys(),
    ...activeConditions.keys(),
  ]);

  // Build display + authoritative numeric lists for statistical conditions.
  // Only data rows (r ≥ 1) contribute.
  const condColValues = new Map<number, string[]>();
  const condColNumbers = new Map<number, Array<number | null>>();
  for (const [col, cond] of activeConditions) {
    if (conditionUsesColumnStatistics(cond)) {
      const vals: string[] = [];
      const numbers: Array<number | null> = [];
      for (let r = firstDataRow; r <= lastDataRow; r += 1) {
        vals.push(
          resolveCellDisplay(cells[`${r}:${col}`], r, col, bootstrap, overlay),
        );
        numbers.push(
          actualFilterNumberForCell(
            cells[`${r}:${col}`],
            r,
            col,
            bootstrap,
            overlay,
          ),
        );
      }
      condColValues.set(col, vals);
      condColNumbers.set(col, numbers);
    }
  }

  // Build condition predicates once (pre-computed per column).
  const condPredicates = new Map<
    number,
    (v: string, numericValue?: number | null) => boolean
  >();
  for (const [col, cond] of activeConditions) {
    condPredicates.set(
      col,
      buildRowPredicate(
        cond,
        condColValues.get(col) ?? [],
        condColNumbers.get(col),
      ),
    );
  }

  const rows: SortFilterRow[] = [];
  for (let r = 0; r < rowCount; r += 1) {
    const rowCells: Array<{ value?: string } | undefined> = [];
    for (let c = 0; c < columnCount; c += 1) {
      if (!neededCols.has(c)) {
        rowCells.push(undefined);
        continue;
      }
      rowCells.push({
        value: resolveCellDisplay(cells[`${r}:${c}`], r, c, bootstrap, overlay),
      });
    }
    rows.push(rowCells);
  }

  // Compute visible set: row passes when it passes ALL active constraints.
  const visibleByValue = new Set(visibleRowIndices(rows, activeFilters));
  for (let r = firstDataRow; r <= lastDataRow; r += 1) {
    // The explicit range's header and every outside row stay visible.
    // Value-checkbox check.
    if (activeFilters.size > 0 && !visibleByValue.has(r)) {
      hidden.add(r);
      continue;
    }
    // Condition filter check (AND-combined).
    if (activeConditions.size > 0) {
      let passedAllConditions = true;
      for (const [col, pred] of condPredicates) {
        const display = rows[r][col]?.value ?? "";
        if (
          !pred(
            display,
            actualFilterNumberForCell(
              cells[`${r}:${col}`],
              r,
              col,
              bootstrap,
              overlay,
            ),
          )
        ) {
          passedAllConditions = false;
          break;
        }
      }
      if (!passedAllConditions) hidden.add(r);
    }
  }
  return hidden;
}

/** hiddenRowsForFilters in the shape the shared recalculation asks for. */
export function sheetFilterHiddenRows(
  sheet: SheetModel,
  covered: ReadonlySet<string>,
  namedRanges: ReturnType<typeof normalizeNamedRanges>,
  rowCount: number,
  columnCount: number,
): Set<number> {
  return hiddenRowsForFilters(sheet, sheet.cells, covered, namedRanges, rowCount, columnCount);
}

export function buildWorkbookSheetInput(
  sheet: SheetModel,
  opts?: {
    // When true, compute this sheet's AutoFilter-hidden rows too (a bootstrap
    // evaluator pass per sheet). The serialize path passes this so an EXPORTED
    // SUBTOTAL's cached display matches the grid exactly; the live display memo
    // skips it for non-active sheets (perf), see formulaEvaluator.
    withFilterHiddenRows?: boolean;
    /** The workbook reads serials in the 1904 date system (date filters). */
    date1904?: ExcelDateSystemArg;
    /** How those hidden rows are found (default: evaluating the sheet). */
    filterHiddenRows?: typeof sheetFilterHiddenRows;
    /** Give CELL("width") the sheet's column widths (default: when one of
     *  the sheet's own formulas calls CELL; the live workbook passes whether
     *  any sheet's does). */
    columnWidths?: boolean;
    /** The workbook's sheets still placeholders (deferred-sheets). */
    pendingSheetNames?: ReadonlySet<string>;
    /** The workbook sets precision as displayed (calcPr@fullPrecision="0"). */
    precisionAsDisplayed?: boolean;
  },
): WorkbookSheetInput {
  const date1904 = opts?.date1904;
  const columnWidths = opts?.columnWidths ?? workbookCallsCell([sheet]);
  return workbookSheetInputFor(sheet, {
    ...(opts?.withFilterHiddenRows
      ? {
          filterHiddenRows: opts.filterHiddenRows ?? ((candidate, covered, namedRanges, rowCount, columnCount) =>
            hiddenRowsForFilters(candidate, candidate.cells, covered, namedRanges, rowCount, columnCount, { date1904 })),
        }
      : {}),
    ...(columnWidths ? { columnWidths: sheetColumnWidthReading(sheet) } : {}),
    ...(opts?.pendingSheetNames?.size ? { pendingSheetNames: opts.pendingSheetNames } : {}),
    ...(opts?.precisionAsDisplayed ? { precisionAsDisplayed: true } : {}),
  });
}

/** The one "nothing is hidden" answer the filter-list scoping declines with. */
export const EMPTY_FILTER_LIST_HIDDEN_ROWS: ReadonlySet<number> = new Set<number>();

/**
 * The same per-column criteria record with ONE column's entry lifted, used to
 * ask what the other columns alone would hide. Returns the record unchanged
 * when the column has no entry, so an untouched sheet keeps its identity.
 */
export function withoutFilterColumn<T>(
  record: Record<string, T> | undefined,
  column: number,
): Record<string, T> | undefined {
  if (!record || record[String(column)] === undefined) return record;
  const next = { ...record };
  delete next[String(column)];
  return next;
}

const TOP_BOTTOM_FILTER_OPERATORS: readonly NumberOperator[] = [
  "top-items",
  "bottom-items",
  "top-percent",
  "bottom-percent",
];

function isTopBottomFilterOperator(operator: NumberOperator): boolean {
  return TOP_BOTTOM_FILTER_OPERATORS.includes(operator);
}

function conditionUsesColumnStatistics(condition: ConditionFilter): boolean {
  return (
    condition.type === "number" &&
    (condition.operator === "top-n" ||
      isTopBottomFilterOperator(condition.operator) ||
      condition.operator === "above-average" ||
      condition.operator === "below-average")
  );
}

/**
 * Resolve table-owned AutoFilter criteria without leaking them into worksheet
 * A/B/C filter state. Every table addresses its column by stable
 * `tableColumn.id`, and only rows inside that table's data body participate.
 * Hidden rows from multiple tables are additive with one another and with the
 * worksheet-level filters layered by the caller.
 */
function hiddenRowsForTableFilters(
  tables: readonly DataTable[],
  resolveDisplay: (row: number, col: number) => string,
  resolveNumber: (row: number, col: number) => number | null,
  resolveDate: (
    row: number,
    col: number,
    requirement: "calendar" | "clock" | "calendar-or-clock",
  ) => ReturnType<typeof filterDateFromSpreadsheetSerial>,
  resolveColor: (
    row: number,
    col: number,
    kind: "cell" | "font",
  ) => string | null,
  resolveIcon: (row: number, col: number) => DataTableIconFilter | null,
  today: FilterDateToday = localFilterDateToday(),
): Set<number> {
  const hidden = new Set<number>();
  for (const table of tables) {
    if (
      table.nativeResizeBlocker ||
      !table.headerRow ||
      !table.columns ||
      !table.columnFilters
    ) {
      continue;
    }
    const dataStart = table.range.r1 + 1;
    const dataEnd = table.range.r2;
    if (dataStart > dataEnd) continue;
    const columnById = new Map(
      table.columns.map((column, offset) => [
        String(column.id),
        table.range.c1 + offset,
      ]),
    );
    const constraints: Array<{
      col: number;
      allowed?: ReadonlySet<string>;
      dateGroups?: NonNullable<DataTableColumnFilter["dateGroups"]>;
      predicate?: (value: string, numericValue?: number | null) => boolean;
      color?: NonNullable<DataTableColumnFilter["color"]>;
      icon?: NonNullable<DataTableColumnFilter["icon"]>;
      relativeDate?: NonNullable<DataTableColumnFilter["relativeDate"]>;
      dateRequirement?: "calendar" | "clock" | "calendar-or-clock";
    }> = [];
    let dateAuthorityBlocked = false;
    for (const [columnId, filter] of Object.entries(table.columnFilters)) {
      const col = columnById.get(columnId);
      if (col === undefined) continue;
      if (filter.values || filter.dateGroups) {
        const dateRequirement = filter.dateGroups?.some((group) =>
          ["hour", "minute", "second"].includes(group.grouping),
        )
          ? "clock"
          : "calendar";
        if (filter.dateGroups) {
          let recovered = 0;
          for (let row = dataStart; row <= dataEnd; row += 1) {
            const display = resolveDisplay(row, col);
            if (display === "" || filter.values?.includes(display)) continue;
            const actual = resolveDate(row, col, dateRequirement);
            if (resolveNumber(row, col) !== null && !actual) {
              dateAuthorityBlocked = true;
              break;
            }
            if (actual) recovered += 1;
          }
          if (dateAuthorityBlocked || recovered === 0) {
            dateAuthorityBlocked = true;
            break;
          }
        }
        constraints.push({
          col,
          ...(filter.values ? { allowed: filterValueKeys(filter.values) } : {}),
          ...(filter.dateGroups ? { dateGroups: filter.dateGroups } : {}),
          ...(filter.dateGroups ? { dateRequirement } : {}),
        });
        continue;
      }
      if (filter.condition) {
        const values: string[] = [];
        const numericValues: Array<number | null> = [];
        for (let row = dataStart; row <= dataEnd; row += 1) {
          values.push(resolveDisplay(row, col));
          numericValues.push(resolveNumber(row, col));
        }
        constraints.push({
          col,
          predicate: buildRowPredicate(
            filter.condition,
            values,
            numericValues,
          ),
        });
        continue;
      }
      if (filter.color) {
        constraints.push({ col, color: filter.color });
        continue;
      }
      if (filter.icon) {
        constraints.push({ col, icon: filter.icon });
        continue;
      }
      if (filter.relativeDate) {
        let recovered = 0;
        for (let row = dataStart; row <= dataEnd; row += 1) {
          const display = resolveDisplay(row, col);
          if (display === "") continue;
          const actual = resolveDate(row, col, "calendar");
          if (resolveNumber(row, col) !== null && !actual) {
            dateAuthorityBlocked = true;
            break;
          }
          if (actual) recovered += 1;
        }
        if (dateAuthorityBlocked || recovered === 0) {
          dateAuthorityBlocked = true;
          break;
        }
        constraints.push({
          col,
          relativeDate: filter.relativeDate,
          dateRequirement: "calendar",
        });
      }
    }
    if (dateAuthorityBlocked) continue;
    for (let row = dataStart; row <= dataEnd; row += 1) {
      for (const constraint of constraints) {
        const value = resolveDisplay(row, constraint.col);
        if (
          ((constraint.allowed || constraint.dateGroups) &&
            !constraint.allowed?.has(filterValueKey(value)) &&
            !constraint.dateGroups?.some((group) =>
              filterDateMatchesGroup(
                resolveDate(
                  row,
                  constraint.col,
                  constraint.dateRequirement ?? "calendar",
                ),
                group,
              ),
            )) ||
          (constraint.predicate &&
            !constraint.predicate(
              value,
              resolveNumber(row, constraint.col),
            )) ||
          (constraint.color &&
            resolveColor(row, constraint.col, constraint.color.kind) !==
              constraint.color.value) ||
          (constraint.icon &&
            (() => {
              const icon = resolveIcon(row, constraint.col);
              return (
                !icon ||
                icon.iconSet !== constraint.icon.iconSet ||
                icon.iconId !== constraint.icon.iconId
              );
            })()) ||
          (constraint.relativeDate &&
            !filterDateMatchesPeriod(
              resolveDate(row, constraint.col, "calendar"),
              constraint.relativeDate.period,
              today,
            ))
        ) {
          hidden.add(row);
          break;
        }
      }
    }
  }
  return hidden;
}
