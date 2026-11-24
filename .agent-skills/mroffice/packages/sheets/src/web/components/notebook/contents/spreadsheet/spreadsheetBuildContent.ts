/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { spreadsheetPersistenceJson } from "@mrnote/core/web/lib/spreadsheet/persistence-json.ts";
import { withDisplayCache, withSheetChartModels, type DisplayCacheCandidates, type SpillTargetsBeyondCells } from "@mrnote/core/web/lib/spreadsheet/display-cache.ts";
import { workbookImportsRanges } from "@mrnote/core/web/lib/spreadsheet/external-data.ts";
import { pivotChartReportForSave } from "../../../../lib/spreadsheet/pivot-buttons";
import { asLoadedSpelling } from "../../../../lib/spreadsheet/loaded-spelling";
import { type SpreadsheetDateSystem } from "@mrnote/core/web/lib/spreadsheet/excel-1900-calendar.ts";
import { SPREADSHEET_CONTENT_TYPE } from "@mrnote/core/web/lib/native-page-content-types.ts";
import type { SpreadsheetDataSourceInventory } from "../../../../lib/spreadsheet/workbook-import-client";
import { type SpreadsheetChartV2Live } from "@mrnote/core/web/lib/spreadsheet/chart-v2-model.ts";
import { createValueStoreWorkbook } from "@mrnote/core/web/lib/spreadsheet/value-store.ts";
import { storedFormulaResults } from "@mrnote/core/web/lib/spreadsheet/stored-formula-results.ts";
import { type CalculationMode } from "@mrnote/core/web/lib/spreadsheet/calculation-mode.ts";
import { pivotChartReportToRows, pivotChartReportCategoryLevels } from "@mrnote/core/web/lib/spreadsheet/pivot-chart.ts";
import { type WorkbookFormulaResultSeed } from "@mrnote/core/web/lib/spreadsheet/formula-engine.ts";
import { type ReferenceStyle } from "@mrnote/core/web/lib/spreadsheet/r1c1.ts";
import { compactWorkbookBlankCellFormats } from "@mrnote/core/web/lib/spreadsheet/blank-cell-formats.ts";
import { withColumnRunsFolded } from "../../../../lib/spreadsheet/column-runs";
import { sheetsStillLoading, storedPlaceholderSheet } from "../../../../lib/spreadsheet/deferred-sheets";
import { withFilledChartsAsPlaceholders } from "../../../../lib/spreadsheet/deferred-chart-placeholders";
import { compactLineStyleCells } from "@mrnote/core/web/lib/spreadsheet/line-styles.ts";
import { type WorkbookStructureProtection } from "@mrnote/core/web/lib/spreadsheet/protection.ts";
import { type SpreadsheetPivotChartSource } from "@mrnote/core/web/lib/spreadsheet/chart.ts";
import { sharePivotCacheSnapshots } from "@mrnote/core/web/lib/spreadsheet/pivot.ts";
import { type PivotOutputLabels } from "@mrnote/core/web/lib/spreadsheet/pivot-output.ts";
import { serializeViewOptions, type SpreadsheetViewOptions } from "../../../../lib/spreadsheet/view-options";
import { type SheetModel } from "./spreadsheetSheetModel";
import { buildWorkbookSheetInput, filterBootstrapForSheet, hiddenRowsForFilters, sheetFilterHiddenRows } from "./spreadsheetHiddenRows";

export type SpreadsheetDataSourceInventoryState =
  | {
      readonly status: "idle" | "error";
      readonly inventory: null;
    }
  | {
      readonly status: "loading";
      readonly inventory: SpreadsheetDataSourceInventory | null;
    }
  | {
      readonly status: "ready";
      readonly inventory: SpreadsheetDataSourceInventory;
    };

const DATA_SOURCE_INVENTORY_COUNT_LIMIT = 10_000;

export function normalizeDataSourceInventory(
  value: unknown,
): SpreadsheetDataSourceInventory | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const count = (key: string): number => {
    const candidate = Number(record[key]);
    return Number.isSafeInteger(candidate) && candidate >= 0
      ? Math.min(candidate, DATA_SOURCE_INVENTORY_COUNT_LIMIT)
      : 0;
  };
  const inventory = Object.freeze({
    connectionParts: count("connectionParts"),
    queryTableParts: count("queryTableParts"),
    workbookLinkParts: count("workbookLinkParts"),
    linkedDataParts: count("linkedDataParts"),
    workbookLinks: Object.freeze([]),
  });
  return dataSourceInventoryHasEntries(inventory) ? inventory : null;
}

function withoutQueries(inventory: SpreadsheetDataSourceInventory): SpreadsheetDataSourceInventory {
  if (!inventory.queries) return inventory;
  const { queries: _queries, ...rest } = inventory;
  void _queries;
  return rest;
}

export function dataSourceInventoryHasEntries(
  inventory: SpreadsheetDataSourceInventory | null | undefined,
): boolean {
  return Boolean(
    inventory &&
      (inventory.connectionParts > 0 ||
        inventory.queryTableParts > 0 ||
        inventory.workbookLinkParts > 0 ||
        inventory.linkedDataParts > 0),
  );
}

/** What the save left as it was read goes back as it was read; the snapshots
 * have already gone to `pivotCaches`, which the reading's own pivots point at. */
function sheetInItsLoadedSpelling<S extends object>(out: S, live: SheetModel | undefined): S {
  if (!live) return out;
  const pivot = asLoadedSpelling(live.pivot);
  const morePivots = live.morePivots?.map(asLoadedSpelling);
  const conditionalFormats = asLoadedSpelling(live.conditionalFormats);
  const sortState = asLoadedSpelling(live.sortState);
  return {
    ...out,
    ...(pivot !== live.pivot ? { pivot } : {}),
    ...(morePivots?.some((item, index) => item !== live.morePivots?.[index]) ? { morePivots } : {}),
    ...(conditionalFormats !== live.conditionalFormats ? { conditionalFormats } : {}),
    ...(sortState !== live.sortState && (out as { sortState?: unknown }).sortState === live.sortState ? { sortState } : {}),
  };
}

/**
 * `stamped` with each formula cell `live` loaded a result for, and still holds
 * with that formula, stamped as it was loaded. While a sheet of the workbook
 * is still its placeholder (lib/spreadsheet/deferred-sheets) the calculation
 * reads it as an empty sheet, by whatever way a formula reaches it (a
 * reference, a defined name, a table, INDIRECT): its results are not stored
 * over the ones the file gave. A formula typed since carries no stamp of its
 * own formula and is stamped as calculated.
 */
export function withLoadedFormulaStamps<S extends { cells: Record<string, unknown> }>(stamped: S, live: { cells: Record<string, unknown> }): S {
  type Cell = { value?: unknown; display?: unknown; chartValueCache?: { source?: unknown } };
  let cells: Record<string, unknown> | null = null;
  for (const key in stamped.cells) {
    const out = stamped.cells[key] as Cell | undefined;
    const loaded = live.cells[key] as Cell | undefined;
    if (!out || !loaded || typeof loaded.value !== "string" || loaded.value.charCodeAt(0) !== 61 || out.value !== loaded.value) continue;
    const bound = loaded.chartValueCache?.source === loaded.value;
    if (!bound && (loaded.chartValueCache !== undefined || typeof loaded.display !== "string")) continue;
    if (out.display === loaded.display && out.chartValueCache === loaded.chartValueCache) continue;
    const kept: Record<string, unknown> = { ...(out as Record<string, unknown>) };
    if (loaded.display === undefined) delete kept.display; else kept.display = loaded.display;
    if (loaded.chartValueCache === undefined) delete kept.chartValueCache; else kept.chartValueCache = loaded.chartValueCache;
    (cells ??= { ...stamped.cells })[key] = kept;
  }
  return cells ? { ...stamped, cells } : stamped;
}

export function buildContent(
  liveSheets: SheetModel[],
  referenceStyle: ReferenceStyle = "a1",
  viewOptions?: SpreadsheetViewOptions,
  activeSheetId?: string,
  formulaResultSeed?: WorkbookFormulaResultSeed,
  dataSourceInventory?: SpreadsheetDataSourceInventory | null,
  calculationMode: CalculationMode = "auto",
  workbookStructureProtection?: WorkbookStructureProtection,
  displayCacheCandidates?: (sheet: SheetModel) => DisplayCacheCandidates | undefined,
  pivotOutputLabels?: Partial<PivotOutputLabels>,
  dateSystem?: SpreadsheetDateSystem,
  /** Whether this save left a sheet as it was loaded (withDisplayCache's `resultsOnly`). */
  sheetUntouched?: (sheet: SheetModel) => boolean,
  /** What a sheet's `cells` leave out that can block a spill (withDisplayCache's
   * `spillTargets`): a structured tiled workbook's body is saved without its
   * tile-owned cells (TiledSheets.spillTargets). */
  spillTargets?: (sheet: SheetModel) => Pick<SpillTargetsBeyondCells, "cells" | "rowsKnown"> | undefined,
): Record<string, unknown> {
  const sheets = withFilledChartsAsPlaceholders(liveSheets);
  const date1904 = dateSystem === "1904";
  // C2: with the calculation's results in hand (the seed), a value filter
  // reads them, as the grid does; nothing is evaluated for it here.
  const seededFilterHiddenRows: typeof sheetFilterHiddenRows | undefined = formulaResultSeed
    ? (candidate, covered, namedRanges, rowCount, columnCount) => hiddenRowsForFilters(candidate, candidate.cells, covered, namedRanges,
        rowCount, columnCount, { date1904, bootstrapFactory: () => filterBootstrapForSheet(candidate, sheets, date1904, formulaResultSeed.snapshot) })
    : undefined;
  // ONE workbook view over every sheet, so a formula's cached display reads
  // a CROSS-SHEET result the way the live grid does. It evaluates nothing
  // (C3): it reads the calculation's results (the seed), else the results the
  // cells already carry; a formula with neither keeps the display it had.
  const inputs = sheets.map((s) =>
    buildWorkbookSheetInput(s, { withFilterHiddenRows: true, date1904, filterHiddenRows: seededFilterHiddenRows }));
  const { workbook, evaluatorFor } = createValueStoreWorkbook(inputs, {
    results: formulaResultSeed?.snapshot ?? storedFormulaResults(
      sheets.map((sheet, index) => ({ sheet, input: inputs[index] })) as unknown as Parameters<typeof storedFormulaResults>[0]),
    date1904, onMissing: "throw" });
  // Runs of identically formatted blank cells are stored as ranges, and the
  // ranges an edit left alone are persisted exactly as they were loaded, so
  // typing in a formatted block stays one cell patch rather than a rewritten
  // sheet. The display cache is stamped first: a blank inside a live spill
  // keeps its own entry.
  // PivotTables on one cache persist its snapshot once, under `pivotCaches`.
  // Each chart's shared model is stamped after the display cache it reads
  // (a formula's numeric result), so the model saved is the data saved.
  // A workbook that imports another page's range stores no computed value:
  // a reader of this page who may not read that page must not find its data
  // here (nor in a print or an export made from what is stored).
  const withholdComputed = workbookImportsRanges(sheets);
  // A sheet not filled in yet reads as empty to the calculation: this save
  // keeps the results the cells were loaded with, and says so to the server
  // (`sheetsUnfilled`, never stored), which keeps the file's values too.
  const sheetsUnfilled = sheetsStillLoading(liveSheets);
  const stamped = sheets.map((s) => {
    const out = withDisplayCache(s, workbook, evaluatorFor, displayCacheCandidates?.(s), {
      withholdComputed,
      resultsOnly: sheetUntouched?.(s) === true,
      spillTargets: spillTargets?.(s),
    });
    return sheetsUnfilled ? withLoadedFormulaStamps(out, s) : out;
  });
  const pivotChartLive = (source: SpreadsheetPivotChartSource): SpreadsheetChartV2Live | null => {
    // A PivotChart's cache is computed data too.
    if (withholdComputed) return null;
    const report = pivotChartReportForSave(stamped, source, evaluatorFor, pivotOutputLabels);
    if (!report) return null;
    const rows = pivotChartReportToRows(report);
    const categoryLevels = pivotChartReportCategoryLevels(report);
    return rows.length ? { rows, headerRow: true, ...(categoryLevels ? { categoryLevels } : {}) } : null;
  };
  const persisted = sharePivotCacheSnapshots(
    compactWorkbookBlankCellFormats(
      sheets,
      stamped.map((s) => withColumnRunsFolded(compactLineStyleCells(withSheetChartModels(s, stamped, pivotChartLive)))),
    ),
  );
  return spreadsheetPersistenceJson({
    type: SPREADSHEET_CONTENT_TYPE,
    ...(persisted.pivotCaches ? { pivotCaches: persisted.pivotCaches } : {}),
    // A sheet still its placeholder, or filled in and not changed since, is
    // stored as the placeholder (lib/spreadsheet/deferred-sheets).
    sheets: persisted.sheets.map((out, index) =>
      storedPlaceholderSheet(liveSheets[index]) ?? sheetInItsLoadedSpelling(out, sheets[index])),
    // R1C1 reference style (Excel parity) is a workbook-level DISPLAY/INPUT
    // setting — the stored formulas stay A1. Persisted at the content top level
    // (the schema passthrough keeps it). Only emitted when ENABLED so a default
    // (a1) workbook serializes byte-for-byte as before.
    ...(referenceStyle === "r1c1" ? { referenceStyle } : {}),
    ...(sheetsUnfilled ? { sheetsUnfilled: true } : {}),
    ...(activeSheetId && sheets.some((sheet) => sheet.id === activeSheetId)
      ? { activeSheetId }
      : {}),
    // Workbook VIEW options (formula bar, reading mode, theme, custom fill
    // lists; gridlines, headings, Show Formulas and the view are each sheet's).
    // Like referenceStyle, only the NON-default fields are emitted, so an
    // untouched workbook serializes byte-for-byte as before.
    ...(viewOptions ? serializeViewOptions(viewOptions) : {}),
    // The queries' M text is read from the source package on demand, never
    // stored on the page.
    ...(dataSourceInventoryHasEntries(dataSourceInventory)
      ? { dataSourceInventory: withoutQueries(dataSourceInventory!) }
      : {}),
    // Excel for the web stores calculation mode with the workbook. Automatic is
    // the native/default state, so only Manual needs an additive content field.
    ...(calculationMode === "manual" ? { calculationMode } : {}),
    ...(workbookStructureProtection ? { workbookStructureProtection } : {}),
    // Excel's "Use 1904 date system" (workbookPr@date1904). The 1900 system
    // is the default and stays implicit unless the page records it — a page
    // switched back from 1904 says so, which tells an original-package save
    // its serials are already in the page's own system.
    ...(dateSystem ? { dateSystem } : {}),
  });
}
