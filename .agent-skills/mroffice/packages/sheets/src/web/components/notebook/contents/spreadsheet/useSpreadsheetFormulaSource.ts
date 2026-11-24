"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { SpreadsheetFormulaInputCache } from "../../../../lib/spreadsheet/formula-input-cache";
import { spillAnchorsOfCells, calcManuallyHiddenRows, cellsCarryingEngineFacts, tableDefsForSheet, textCellKeys, cellPictureEngineOption, cellPhoneticEngineOption, formulaHiddenEngineOption, legacyArrayEngineOption, spillTargetOccupied, backgroundInputContexts, whatIfTableTextCells } from "@mrnote/core/web/lib/spreadsheet/display-cache.ts";
import { whatIfTableReader } from "@mrnote/core/web/lib/spreadsheet/what-if-table-definition.ts";
import { keptFormulaResultEntries, keptFormulaResultOption } from "@mrnote/core/web/lib/spreadsheet/kept-formula-results.ts";
import { useMemo } from "react";
import { type SheetEvaluatorOptions, columnWidthOption, makeTableRefResolver, type WorkbookSheetInput } from "@mrnote/core/web/lib/spreadsheet/formula-engine.ts";
import { sheetColumnWidthReading, workbookCallsCell } from "../../../../lib/spreadsheet/column-width-reading";
import { coveredCells, type MergeSpan } from "@mrnote/core/web/lib/spreadsheet/merge-cells.ts";
import { resolveName as resolveNamedRange, type NamedRange } from "@mrnote/core/web/lib/spreadsheet/named-ranges.ts";
import { type SheetModel } from "./spreadsheetSheetModel";
import { displayPrecisionEntries, displayPrecisionOption } from "@mrnote/core/web/lib/spreadsheet/display-precision.ts";
import { buildWorkbookSheetInput } from "./spreadsheetHiddenRows";
import { pendingSheetNames } from "../../../../lib/spreadsheet/deferred-sheets";

/** What useSpreadsheetFormulaSource reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetFormulaSourceInputs {
  formulaDataSheets: SheetModel[];
  groupHiddenRows: Set<number>;
  hiddenRows: Set<number>;
  manualHiddenRows: Set<number>;
  mergeSpans: MergeSpan[];
  namedRanges: NamedRange[];
  pageId: string;
  pivotRefreshRevision: number;
  /** The workbook sets precision as displayed (calcPr@fullPrecision="0"). */
  precisionAsDisplayed?: boolean;
  sheet: SheetModel;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetFormulaSource({
  formulaDataSheets,
  groupHiddenRows,
  hiddenRows,
  manualHiddenRows,
  mergeSpans,
  namedRanges,
  pageId,
  pivotRefreshRevision,
  precisionAsDisplayed = false,
  sheet,
}: SpreadsheetFormulaSourceInputs) {
  const formulaInputCache = useMemo(() => new SpreadsheetFormulaInputCache(), [pageId]);
  const formulaSource = useMemo(() => {
    // Deliberately consume the editor-only revision so PivotTable Refresh
    // invalidates this complete derived workbook/pivot calculation.
    void pivotRefreshRevision;
    const activeName =
      typeof sheet.name === "string" && sheet.name ? sheet.name : sheet.id;
    const activeCells = sheet.cells;
    // CELL("width") reads column widths; only a workbook that calls CELL
    // carries them, so a column drag elsewhere recalculates nothing.
    const cellWidthUsed = workbookCallsCell(formulaDataSheets);
    const widthKeys = (candidate: SheetModel) => cellWidthUsed
      ? [true, candidate.columnWidths, candidate.defaultColumnWidth, candidate.nativeGrid, candidate.manuallyHiddenCols, candidate.outlineGroups]
      : [false];
    // Sheets the open has not filled in yet: a formula naming one answers the
    // file's last value until it is in (kept-formula-results).
    const pendingNames = pendingSheetNames(formulaDataSheets);
    const pendingKey = pendingNames.size ? [...pendingNames].sort().join("\n") : "";
    const activeInput = formulaInputCache.input(sheet.id, "active", [
      pendingKey, precisionAsDisplayed,
      ...widthKeys(sheet),
      sheet.cells, sheet.name, sheet.rowCount, sheet.columnCount, sheet.merges,
      sheet.namedRanges, sheet.dataTables, sheet.whatIfTables, sheet.protected, pivotRefreshRevision,
      JSON.stringify([...hiddenRows].sort((a, b) => a - b)),
      JSON.stringify([...groupHiddenRows].sort((a, b) => a - b)),
      JSON.stringify([...manualHiddenRows].sort((a, b) => a - b)),
    ], () => {
      const covered = coveredCells(mergeSpans);
      // Rows hidden by Hide Rows join the outline-collapsed ones: both are
      // "manually hidden" to SUBTOTAL 101-111 and AGGREGATE (B050).
      const calcHiddenRows = calcManuallyHiddenRows(groupHiddenRows, manualHiddenRows);
      // Every cell a calculation reads comes through here (all 730,000 of a
      
      // spelled once, and a sheet without merges asks no cover.
      const readActiveStored = covered.size === 0
        ? (row: number, col: number): string | null => activeCells[`${row}:${col}`]?.value ?? null
        : (row: number, col: number): string | null => {
          const key = `${row}:${col}`;
          return covered.has(key) ? null : (activeCells[key]?.value ?? null);
        };
      // The active sheet's structured-ref registry — read its data-table headers
      // through the SAME merge-cover reader the evaluator uses, so Table1[Amount]
      // resolves on the on-screen sheet exactly as it serializes.
      const activeTableDefs = tableDefsForSheet(
        sheet.dataTables,
        { rowCount: sheet.rowCount, columnCount: sheet.columnCount },
        readActiveStored,
      );
      // What-If Data Tables: their results read as =TABLE(...), the same
      // reader the serialize path builds (workbookSheetInputFor).
      const activeWhatIf = whatIfTableReader(
        sheet.whatIfTables,
        { rowCount: sheet.rowCount, columnCount: sheet.columnCount },
        readActiveStored,
      );
      const readActiveRaw = activeWhatIf?.readRaw ?? readActiveStored;
      const activeTextCells = whatIfTableTextCells(textCellKeys(activeCells), activeWhatIf);
      const activeTextCellSet = new Set(activeTextCells);
      const carrying = cellsCarryingEngineFacts(activeCells);
      const activePictureCells = cellPictureEngineOption(carrying, covered);
      const activePhoneticCells = cellPhoneticEngineOption(carrying, covered);
      // Formulas over external data keep the file's last value (X-079).
      const activeKeptResults = keptFormulaResultEntries(
        carrying, covered, pendingNames.size ? { sheets: pendingNames, cells: activeCells } : undefined);
      const activeFormulaHidden = formulaHiddenEngineOption(sheet.protected === true, activeCells, covered);
      const activeLegacyArrays = legacyArrayEngineOption(carrying, covered);
      // Set precision as displayed: a formula keeps the number it shows.
      const activeShownPrecision = precisionAsDisplayed ? displayPrecisionEntries(activeCells, covered) : [];
      const activeColumnWidths = cellWidthUsed ? sheetColumnWidthReading(sheet) : undefined;
      const activeOptions: SheetEvaluatorOptions = {
        // The sheet's extent bounds a whole-column or whole-row reference, as
        // it does on every other sheet (workbookSheetInputFor). Without it
        // the engine inferred the extent by scanning, which gives up past 4.5
        // million cells: INDEX(Comparison!$L:$Z,2,1) (15 whole columns) read
        // #REF! on the sheet being viewed (S14_tdf131536, X-096).
        usedRange: { rowCount: Number(sheet.rowCount) || 0, columnCount: Number(sheet.columnCount) || 0 },
        // A picture placed in a cell is that cell's value (Place in Cell).
        ...activePictureCells.option,
        // PHONETIC reads a cell's furigana (Phonetic Guide).
        ...activePhoneticCells.option,
        ...keptFormulaResultOption(activeKeptResults, readActiveStored),
        // FORMULATEXT of a formula protection hides is #N/A (B405).
        ...activeFormulaHidden.option,
        ...activeLegacyArrays.option,
        ...displayPrecisionOption(activeShownPrecision),
        ...columnWidthOption(activeColumnWidths),
        // Same cell typing the serialize path uses (buildWorkbookSheetInput):
        // a quote-prefixed or Text-cell entry is a string to the engine.
        ...(activeTextCells.length > 0
          ? {
              isTextCell: (row: number, col: number) =>
                activeTextCellSet.has(`${row}:${col}`),
            }
          : {}),
        ...(namedRanges.length > 0
          ? {
              resolveName: (name: string) => resolveNamedRange(name, namedRanges),
            }
          : {}),
        ...(hiddenRows.size > 0
          ? { isRowHiddenByFilter: (row: number) => hiddenRows.has(row) }
          : {}),
        ...(calcHiddenRows.size > 0
          ? { isRowManuallyHidden: (row: number) => calcHiddenRows.has(row) }
          : {}),
        // A plain reference into a dynamic array's spill reads the element the
        // grid shows there; the engine lays the footprints out with the same
        // occupancy rule as the overlay.
        spillAnchors: () => spillAnchorsOfCells(activeCells),
        isSpillTargetOccupied: (row: number, col: number) =>
          spillTargetOccupied(activeCells, covered, row, col),
        ...(activeTableDefs.length > 0
          ? { resolveTableRef: makeTableRefResolver(activeTableDefs) }
          : {}),
        ...(activeWhatIf ? { whatIfTables: activeWhatIf.whatIfTables } : {}),
      };
      const activeInput: WorkbookSheetInput = {
        name: activeName,
        getRawCell: readActiveRaw,
        ...(Object.keys(activeOptions).length > 0
          ? { options: activeOptions }
          : {}),
      };
      backgroundInputContexts.set(activeInput, {
        ...(namedRanges.length ? { namedRanges } : {}),
        ...(activeTableDefs.length ? { tables: activeTableDefs } : {}),
        ...(activeWhatIf ? { whatIfTables: activeWhatIf.whatIfTables } : {}),
        ...(hiddenRows.size ? { filterHiddenRows: [...hiddenRows] } : {}),
        ...(calcHiddenRows.size ? { manuallyHiddenRows: [...calcHiddenRows] } : {}),
        ...(activeTextCells.length ? { textCells: activeTextCells } : {}),
        ...(activePictureCells.entries.length ? { pictureCells: activePictureCells.entries } : {}),
        ...(activePhoneticCells.entries.length ? { phoneticCells: activePhoneticCells.entries } : {}),
        ...(activeKeptResults.length ? { keptResults: activeKeptResults } : {}),
        ...(activeFormulaHidden.keys.length ? { formulaHiddenCells: activeFormulaHidden.keys } : {}),
        ...(activeLegacyArrays.entries.length ? { legacyArrays: activeLegacyArrays.entries } : {}),
        ...(activeShownPrecision.length ? { displayPrecision: activeShownPrecision } : {}),
        ...(activeColumnWidths ? { columnWidths: activeColumnWidths } : {}),
        ...(covered.size ? { coveredCells: [...covered] } : {}),
      });
      return activeInput;
    });
    const inputs: WorkbookSheetInput[] = formulaDataSheets.map((candidate) =>
      candidate.id === sheet.id ? activeInput : formulaInputCache.input(candidate.id, "nonactive", [
        candidate.cells, candidate.id, candidate.name, candidate.rowCount, candidate.columnCount,
        candidate.merges, candidate.namedRanges, candidate.dataTables, candidate.whatIfTables, candidate.outlineGroups, candidate.protected,
        ...widthKeys(candidate), pendingKey, precisionAsDisplayed,
      ], () => buildWorkbookSheetInput(candidate, { columnWidths: cellWidthUsed, pendingSheetNames: pendingNames, precisionAsDisplayed })),
    );
    const bindings = formulaInputCache.bindings(formulaDataSheets, inputs, input => backgroundInputContexts.get(input) ?? {});
    const readActiveRaw = activeInput.getRawCell;
    return { inputs: formulaInputCache.orderedInputs(inputs), bindings, activeName, activeCells, readActiveRaw };
  }, [sheet.cells, sheet.id, sheet.name, sheet.dataTables, sheet.whatIfTables, sheet.protected, sheet.rowCount, sheet.columnCount, sheet.columnWidths, sheet.defaultColumnWidth, sheet.nativeGrid, sheet.manuallyHiddenCols, sheet.outlineGroups, formulaDataSheets, namedRanges, mergeSpans, hiddenRows, groupHiddenRows, pivotRefreshRevision, precisionAsDisplayed, formulaInputCache]);
  return {
    formulaSource,
  };
}
