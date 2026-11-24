"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { normalizeRules as normalizeConditionalRules, resolveCellConditionalDisplay, ruleOverlaps as conditionalRuleOverlaps, type ConditionalFormatRule, type RangeExtent, type RangeStats } from "@mrnote/core/web/lib/spreadsheet/conditional-format.ts";
import { calculationRuleRequests } from "../../../../lib/spreadsheet/calculation-rule-requests";
import { MAX_CALCULATION_RULE_CELLS, MAX_CALCULATION_RULES, type CalculationRuleRequest } from "@mrnote/core/web/lib/spreadsheet/background-calculation-protocol.ts";
import { useSpreadsheetFindNavigation } from "./useSpreadsheetFindNavigation";
import { type SpreadsheetFindTab } from "./SpreadsheetFindReplaceDialog";
import { type SpreadsheetCell, type CellMap, hasCellMetadata, copyCellMap } from "@mrnote/core/web/lib/spreadsheet/cell-buttons.ts";
import { buildSpillOverlay, resolveCellDisplay } from "@mrnote/core/web/lib/spreadsheet/display-cache.ts";
import { useCallback, useMemo, useState, type RefObject } from "react";
import { replaceAllInKeys } from "../../../../lib/spreadsheet/editing-buttons";
import { type CellValue, type SheetEvaluator, type SpillOverlay, FormulaResultUnavailableError, type EngineValue } from "@mrnote/core/web/lib/spreadsheet/formula-engine.ts";
import { coveredCells, normalizeMerges } from "@mrnote/core/web/lib/spreadsheet/merge-cells.ts";
import { type NamedRange } from "@mrnote/core/web/lib/spreadsheet/named-ranges.ts";
import { type PivotRange, type PivotMatrix } from "@mrnote/core/web/lib/spreadsheet/pivot.ts";
import { type PivotChartReport } from "@mrnote/core/web/lib/spreadsheet/pivot-output.ts";
import { type FindDisplayText, findMatches as findCellMatches, type WorkbookMatch, findMatchesInWorkbook, cellKeyComparator, replaceAll as replaceAllCells, replaceAllInWorkbook, describeFindMatches, type FindAllRow, type FindSearchOrder, type FindLookIn } from "../../../../lib/spreadsheet/find-replace";
import { type SpreadsheetViewOptions } from "../../../../lib/spreadsheet/view-options";
import { whatIfTableBlockAt, whatIfTableBlocks } from "@mrnote/core/web/lib/spreadsheet/what-if-table-definition.ts";
import { type SheetModel } from "./spreadsheetSheetModel";
import { selectSpreadsheetCellEntryText } from "./spreadsheetGridEventHandlers";
import { tableHeaderRenamesAfterReplace, renameTableColumnsInSheet, type TableColumnRename } from "./spreadsheetCellValuePlan";
import { type SheetViewMappedCellMutation, type SheetViewMappedDrawingMutation, type SheetViewMappedLineMutation, type SheetViewMappedPageMutation } from "./spreadsheetSheetViews";
import { type Workbook, type WorkbookSheetInput } from "@mrnote/core/web/lib/spreadsheet/formula-engine.ts";
import { type PivotOutputPlan } from "@mrnote/core/web/lib/spreadsheet/pivot-output.ts";
import { type Dispatch, type SetStateAction } from "react";

/**
 * The conditional rules Look in Values reads a cell's number format through
 * on a tab that is not the active one: the sheet's rules up to the last one
 * that states a number format (the active sheet's own reading, B494).
 */
export function findNumberFormatRules(target: SheetModel): ConditionalFormatRule[] {
  const rules = normalizeConditionalRules(target.conditionalFormats, {
    maxRow: target.rowCount - 1,
    maxCol: target.columnCount - 1,
  });
  let last = -1;
  rules.forEach((rule, index) => {
    if ("numberFormat" in rule && rule.numberFormat) last = index;
  });
  return rules.slice(0, last + 1);
}

/**
 * The rule formulas those rules evaluate on every tab but the active one, for
 * the calculation session to answer (C2: a rule formula is never evaluated in
 * the browser), within one calculation's bounds.
 */
export function findBackgroundRuleRequests(
  sheets: readonly SheetModel[],
  activeSheetId: string,
): CalculationRuleRequest[] {
  const requests: CalculationRuleRequest[] = [];
  let cells = 0;
  for (const candidate of sheets) {
    if (candidate.id === activeSheetId) continue;
    for (const request of calculationRuleRequests(candidate, findNumberFormatRules(candidate))) {
      const area = (request.range.r2 - request.range.r1 + 1) * (request.range.c2 - request.range.c1 + 1);
      if (requests.length >= MAX_CALCULATION_RULES || cells + area > MAX_CALCULATION_RULE_CELLS) return requests;
      cells += area;
      requests.push(request);
    }
  }
  return requests;
}

/** What useSpreadsheetFindReplace reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetFindReplaceInputs {
  /** Hear each commit of the grid's band (SpreadsheetGridBandStore.onCommit). */
  onGridCommit?: (listener: () => void) => () => void;
  /** A tiled workbook's matches the server found in cells not read here,
   * by sheet id (lib/spreadsheet/tiled-sheets findInTiles). */
  tiledMatches?: ReadonlyMap<string, readonly string[]> | null;
  /** The active sheet's PivotTable report cells (keyed "row:col") and the
   *  text each shows: Look in Values finds a report's labels and results as
   *  the grid shows them, though they are not stored cells (user audit S-118). */
  pivotOutputCells?: ReadonlyMap<string, unknown> | null;
  pivotShownTextAt?: (row: number, col: number) => string | null;
  activeCell: { row: number; col: number; };
  activeSheetIndex: number;
  cellDisplayValue: (cell: SpreadsheetCell | undefined, row: number, col: number, editing: boolean, numberFormatOverride?: string) => string;
  commitSheets: (nextSheets: SheetModel[], queryMutation?: boolean, activeSheetId?: string, nextViewOptions?: SpreadsheetViewOptions) => SheetModel[];
  findFormat: Readonly<Record<string, unknown>> | null;
  findInputRef: RefObject<HTMLInputElement | null>;
  findMatchIndex: number;
  findQuery: string;
  findReplaceOpen: boolean;
  findReplaceOptions: { replaceFormat?: Readonly<Record<string, unknown>> | undefined; format?: Readonly<Record<string, unknown>> | undefined; caseSensitive: boolean; wholeCell: boolean; matchByte: boolean; searchOrder: FindSearchOrder; lookIn: FindLookIn; locale: string; };
  findReplaceTab: SpreadsheetFindTab;
  findScope: "workbook" | "sheet" | "selection";
  findSearchOrder: FindSearchOrder;
  findSelectionScope: { readonly sheetId: string; readonly range: { r1: number; r2: number; c1: number; c2: number; }; } | null;
  flashJumpRange: (sheetId: string, range: { r1: number; c1: number; r2: number; c2: number; }) => void;
  formulaWorkbook: { evaluator: SheetEvaluator; evaluatorFor: (sheetName: string) => SheetEvaluator; workbook: Workbook; memoSnapshot: () => ReadonlyMap<string, EngineValue>; pivotPlans: Map<string, PivotOutputPlan>; pivotNativeFootprints: Map<string, PivotRange[]>; pivotChartReports: Map<string, PivotChartReport>; pivotChartMatrices: Map<string, PivotMatrix>; inputs: WorkbookSheetInput[]; pivotSheetIds: string[]; };
  gridWrapRef: RefObject<HTMLDivElement | null>;
  hiddenRows: Set<number>;
  isCellEditableRef: RefObject<(candidate: SheetModel, row: number, col: number) => boolean>;
  liveActiveSheetIndexRef: RefObject<number>;
  liveSheetsRef: RefObject<SheetModel[]>;
  pageId: string;
  replaceActiveSheet: (nextSheet: SheetModel, nextTitle?: string, calculationMutation?: "content" | "coordinate", sheetViewMutation?: SheetViewMappedCellMutation | SheetViewMappedDrawingMutation | SheetViewMappedLineMutation | SheetViewMappedPageMutation, followOnOtherSheets?: (candidate: SheetModel) => SheetModel) => SheetModel[];
  replaceValue: string;
  /** A conditional rule formula's value at a cell of a sheet, as the
   * calculation session answered it (C2); null where it has not answered,
   * so the rule formats nothing there, as on the grid. */
  ruleFormulaValue: (sheetId: string, formula: string, row: number, col: number, anchorRow: number, anchorCol: number) => CellValue;
  scheduleRaf: (callback: () => void) => void;
  scrollCellIntoView: (row: number, col: number, extent?: { rowCount: number; columnCount: number; }) => void;
  selectionExtendingRef: RefObject<boolean>;
  setActiveCell: Dispatch<SetStateAction<{ row: number; col: number; }>>;
  setFindAllActiveId: Dispatch<SetStateAction<string | null>>;
  setFindAllRows: Dispatch<SetStateAction<readonly FindAllRow[] | null>>;
  setFindMatchIndex: Dispatch<SetStateAction<number>>;
  setSelectedObjectId: Dispatch<SetStateAction<string | null>>;
  setSelectionAnchor: Dispatch<SetStateAction<{ row: number; col: number; } | null>>;
  sheet: SheetModel;
  sheets: SheetModel[];
  showProtectNotice: (message?: string) => void;
  /** "Cannot change part of a data table.": a replace that would write
   *  into a What-If Data Table's results is refused with it. */
  whatIfTablePartMessage?: string;
  spillOverlay: SpillOverlay;
  workbookNamedRanges: NamedRange[];
  writeActiveSheetIndex: Dispatch<SetStateAction<number>>;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
/** Workbook-scope hits with a tiled workbook's hits in rows not read here,
 * in tab order then search order. */
function withTiledWorkbookMatches(
  local: WorkbookMatch[],
  sheets: readonly SheetModel[],
  tiledMatches: ReadonlyMap<string, readonly string[]> | null,
  order: FindSearchOrder,
): WorkbookMatch[] {
  if (!tiledMatches?.size) return local;
  const seen = new Set(local.map((match) => `${match.sheetIndex}\u0000${match.key}`));
  const extra: WorkbookMatch[] = [];
  sheets.forEach((candidate, sheetIndex) => {
    for (const key of tiledMatches.get(candidate.id) ?? []) {
      if (candidate.cells[key] !== undefined || seen.has(`${sheetIndex}\u0000${key}`)) continue;
      const [row, col] = key.split(":").map(Number);
      extra.push({ sheetIndex, key, row, col });
    }
  });
  if (!extra.length) return local;
  const compare = cellKeyComparator(order);
  return [...local, ...extra].sort((a, b) => a.sheetIndex - b.sheetIndex || compare(a.key, b.key));
}

/** The cells whose value a replace changed. */
function changedCellKeys(before: CellMap, after: CellMap): string[] {
  const keys: string[] = [];
  for (const key of Object.keys(after)) {
    if (after[key]?.value !== before[key]?.value) keys.push(key);
  }
  return keys;
}

export function useSpreadsheetFindReplace({
  onGridCommit,
  activeCell,
  activeSheetIndex,
  cellDisplayValue,
  commitSheets,
  findFormat,
  findInputRef,
  findMatchIndex,
  findQuery,
  findReplaceOpen,
  findReplaceOptions,
  findReplaceTab,
  findScope,
  findSearchOrder,
  findSelectionScope,
  flashJumpRange,
  formulaWorkbook,
  gridWrapRef,
  hiddenRows,
  isCellEditableRef,
  liveActiveSheetIndexRef,
  liveSheetsRef,
  pageId,
  replaceActiveSheet,
  replaceValue,
  ruleFormulaValue,
  scheduleRaf,
  scrollCellIntoView,
  selectionExtendingRef,
  setActiveCell,
  setFindAllActiveId,
  setFindAllRows,
  setFindMatchIndex,
  setSelectedObjectId,
  setSelectionAnchor,
  sheet,
  sheets,
  showProtectNotice,
  whatIfTablePartMessage,
  spillOverlay,
  workbookNamedRanges,
  writeActiveSheetIndex,
  tiledMatches = null,
  pivotOutputCells = null,
  pivotShownTextAt,
}: SpreadsheetFindReplaceInputs) {
  // Look in Values matches what each cell DISPLAYS, read from the live
  // workbook calculation rather than a second, single-sheet evaluator: the
  // active sheet through the grid's own cellDisplayValue, another tab through
  // its evaluator in the same workbook, so =Second!A1 is found where it
  // shows 42.
  const findDisplayTextFor = useCallback(
    (sheetIndex: number): FindDisplayText | undefined => {
      const target = sheets[sheetIndex];
      if (!target) return undefined;
      if (target.id === sheet.id) {
        return (row, col, cell) =>
          pivotShownTextAt?.(row, col) ??
          cellDisplayValue(cell as SpreadsheetCell, row, col, false);
      }
      let evaluator: SheetEvaluator | null = null;
      let overlay: SpillOverlay | null = null;
      // The target sheet's conditional number formats (findNumberFormatRules):
      // a value shown through one is found as shown on every tab (B494).
      let numberFormatRules: ConditionalFormatRule[] | null = null;
      const extentCache = new Map<ConditionalFormatRule, RangeExtent | null>();
      const statsCache = new Map<ConditionalFormatRule, RangeStats | null>();
      const conditionalNumberFormat = (
        row: number,
        col: number,
        sheetEvaluator: SheetEvaluator,
      ): string | undefined => {
        numberFormatRules ??= findNumberFormatRules(target);
        if (
          !numberFormatRules.some(
            (rule) =>
              "numberFormat" in rule &&
              Boolean(rule.numberFormat) &&
              conditionalRuleOverlaps(rule, { r1: row, c1: col, r2: row, c2: col }),
          )
        ) {
          return undefined;
        }
        return resolveCellConditionalDisplay(
          numberFormatRules,
          sheetEvaluator.getComputed(row, col),
          row,
          col,
          {
            cellValueAt: (r, c) => sheetEvaluator.getComputed(r, c),
            evalFormula: (formula, r, c, anchorRow, anchorCol) =>
              ruleFormulaValue(target.id, formula, r, c, anchorRow, anchorCol),
            extentCache,
            statsCache,
            date1904: sheetEvaluator.date1904,
          },
        ).style.numberFormat;
      };
      return (row, col, cell) => {
        try {
          evaluator ??= formulaWorkbook.evaluatorFor(target.name || target.id);
          overlay ??= buildSpillOverlay(
            target.cells,
            coveredCells(normalizeMerges(target.merges)),
            evaluator,
          );
          return resolveCellDisplay(
            cell as SpreadsheetCell,
            row,
            col,
            evaluator,
            overlay,
            conditionalNumberFormat(row, col, evaluator),
          );
        } catch (error) {
          if (!(error instanceof FormulaResultUnavailableError)) throw error;
          const stored = cell as SpreadsheetCell;
          return stored.display ?? stored.value ?? "";
        }
      };
    },
    [cellDisplayValue, formulaWorkbook, pivotShownTextAt, ruleFormulaValue, sheet.id, sheets],
  );
  // A "selection" scope keeps the hits inside the range the dialog was opened
  // on (and none once the user is on another sheet).
  const restrictToFindSelection = useCallback(
    (allKeys: string[]): string[] => {
      // Rows an AutoFilter (or Advanced Filter) hides are out of Find's reach,
      // as they are in Excel: filtered data is searched as it is shown. Rows
      // hidden by hand are not part of this rule.
      const keys =
        hiddenRows.size > 0
          ? allKeys.filter((key) => !hiddenRows.has(Number(key.split(":")[0])))
          : allKeys;
      if (findScope !== "selection") return keys;
      if (!findSelectionScope || findSelectionScope.sheetId !== sheet.id) {
        return [];
      }
      const { range } = findSelectionScope;
      return keys.filter((key) => {
        const [rowText, columnText] = key.split(":");
        const row = Number(rowText);
        const column = Number(columnText);
        return (
          Number.isInteger(row) &&
          Number.isInteger(column) &&
          row >= range.r1 &&
          row <= range.r2 &&
          column >= range.c1 &&
          column <= range.c2
        );
      });
    },
    [findScope, findSelectionScope, sheet.id, hiddenRows],
  );
  // A dynamic array's spilled results have no stored cell; Look in Values
  // visits them through displayText (live audit B126), and a PivotTable
  // report's cells likewise.
  const findSpilledKeys = useMemo(
    () =>
      spillOverlay.spilled.size > 0 || (pivotOutputCells?.size ?? 0) > 0
        ? [...spillOverlay.spilled.keys(), ...(pivotOutputCells?.keys() ?? [])]
        : undefined,
    [pivotOutputCells, spillOverlay.spilled],
  );
  // Sheet-scope matches: the active sheet's matching cell keys, in the
  // dialog's search order.
  const findReplaceMatches = useMemo(
    () => {
      if (!findReplaceOpen || findScope === "workbook") return [];
      const local = findCellMatches(sheet.cells, findQuery, {
        ...findReplaceOptions,
        ...(findSpilledKeys ? { extraKeys: findSpilledKeys } : {}),
        displayText: findDisplayTextFor(
          sheets.findIndex((candidate) => candidate.id === sheet.id),
        ),
      });
      // A tiled workbook's hits in rows not read here, as the server found them.
      const remote = tiledMatches?.get(sheet.id);
      const keys = remote?.length
        ? [...new Set([...local, ...remote.filter((key) => sheet.cells[key] === undefined)])].sort(
            cellKeyComparator(findSearchOrder),
          )
        : local;
      return restrictToFindSelection(keys);
    },
    [
      tiledMatches,
      findSearchOrder,
      findReplaceOpen,
      findScope,
      findDisplayTextFor,
      findSpilledKeys,
      restrictToFindSelection,
      sheet,
      sheets,
      findQuery,
      findReplaceOptions,
    ],
  );
  // Workbook-scope matches: every hit across all sheet tabs (tab order, then
  // row-major), each tagged with its sheet index so Find Next can jump tabs.
  // Keyed on `sheets` (not just the active sheet) so an edit on any tab refreshes.
  const findReplaceWorkbookMatches = useMemo<WorkbookMatch[]>(
    () =>
      findReplaceOpen && findScope === "workbook"
        ? withTiledWorkbookMatches(
            findMatchesInWorkbook(
              sheets.map((s) => s.cells),
              findQuery,
              findReplaceOptions,
              findDisplayTextFor,
              (sheetIndex) => (sheets[sheetIndex]?.id === sheet.id ? findSpilledKeys : undefined),
            ),
            sheets,
            tiledMatches,
            findSearchOrder,
          )
        : [],
    [
      tiledMatches,
      findSearchOrder,
      findReplaceOpen,
      findScope,
      sheet.id,
      sheets,
      findQuery,
      findReplaceOptions,
      findDisplayTextFor,
      findSpilledKeys,
    ],
  );
  // The total match count + whether any action is possible, regardless of scope.
  const findMatchTotal =
    findScope === "workbook"
      ? findReplaceWorkbookMatches.length
      : findReplaceMatches.length;

  const navigateFindResult = useSpreadsheetFindNavigation({
    pageId, sheetId: sheet.id, activeCell, viewport: gridWrapRef,
    scheduleFrame: scheduleRaf, scrollTo: scrollCellIntoView, onGridCommit,
    navigate: ({ sheetId, row, col }) => {
      const live = liveSheetsRef.current;
      const matches = live.map((candidate, index) => ({ candidate, index })).filter(({ candidate }) => candidate.id === sheetId);
      if (matches.length !== 1) return false;
      const { candidate, index } = matches[0];
      if (row >= candidate.rowCount || col >= candidate.columnCount) return false;
      if (index !== liveActiveSheetIndexRef.current) writeActiveSheetIndex(index);
      setSelectedObjectId(null);
      setActiveCell({ row, col });
      setSelectionAnchor({ row, col });
      return true;
    },
    focus: (input) => {
      selectionExtendingRef.current = true;
      input.focus({ preventScroll: true });
      selectSpreadsheetCellEntryText(input);
    },
  });
  const focusMatchCell = useCallback((cellKey: string) => {
    const [row, col] = cellKey.split(":").map(Number);
    const current = liveSheetsRef.current[liveActiveSheetIndexRef.current];
    if (current) navigateFindResult({ sheetId: current.id, row, col });
  }, [navigateFindResult]);

  const focusWorkbookMatch = useCallback((match: WorkbookMatch) => {
    const current = liveSheetsRef.current[match.sheetIndex];
    if (current) navigateFindResult({ sheetId: current.id, row: match.row, col: match.col });
  }, [navigateFindResult]);

  // The active cell's place among the hits. Excel searches from the active
  // cell: before a hit has been visited, Find Next goes to the first hit after
  // it in search order and Find Previous to the last one before it, wrapping
  // round. Inside a captured selection the search starts at the range's first
  // hit, as Excel's does.
  const activeFindSheetIndex = Math.min(activeSheetIndex, sheets.length - 1);
  const findStartIndex = useCallback(
    (direction: 1 | -1): number => {
      const total =
        findScope === "workbook"
          ? findReplaceWorkbookMatches.length
          : findReplaceMatches.length;
      if (total === 0) return -1;
      if (findScope === "selection") return direction === 1 ? 0 : total - 1;
      const compareKeys = cellKeyComparator(findSearchOrder);
      const activeKey = `${activeCell.row}:${activeCell.col}`;
      const relation = (index: number): number => {
        if (findScope !== "workbook") {
          return compareKeys(findReplaceMatches[index], activeKey);
        }
        const match = findReplaceWorkbookMatches[index];
        return (
          match.sheetIndex - activeFindSheetIndex ||
          compareKeys(match.key, activeKey)
        );
      };
      if (direction === 1) {
        for (let index = 0; index < total; index += 1) {
          if (relation(index) > 0) return index;
        }
        return 0;
      }
      for (let index = total - 1; index >= 0; index -= 1) {
        if (relation(index) < 0) return index;
      }
      return total - 1;
    },
    [
      activeCell,
      activeFindSheetIndex,
      findScope,
      findSearchOrder,
      findReplaceMatches,
      findReplaceWorkbookMatches,
    ],
  );
  // The hit Replace acts on: the one Find went to last, else the active cell
  // when it is a hit itself. -1 means Replace first finds the next hit, as
  // Excel's Replace does when the active cell does not match.
  const findReplaceCurrentIndex = useCallback((): number => {
    const activeKey = `${activeCell.row}:${activeCell.col}`;
    if (findScope === "workbook") {
      if (
        findMatchIndex >= 0 &&
        findMatchIndex < findReplaceWorkbookMatches.length
      ) {
        return findMatchIndex;
      }
      return findReplaceWorkbookMatches.findIndex(
        (match) =>
          match.sheetIndex === activeFindSheetIndex && match.key === activeKey,
      );
    }
    if (findMatchIndex >= 0 && findMatchIndex < findReplaceMatches.length) {
      return findMatchIndex;
    }
    return findReplaceMatches.indexOf(activeKey);
  }, [
    activeCell,
    activeFindSheetIndex,
    findScope,
    findMatchIndex,
    findReplaceMatches,
    findReplaceWorkbookMatches,
  ]);

  const stepFindMatch = useCallback(
    (direction: 1 | -1) => {
      const total =
        findScope === "workbook"
          ? findReplaceWorkbookMatches.length
          : findReplaceMatches.length;
      if (total === 0) return;
      const index =
        findMatchIndex < 0 || findMatchIndex >= total
          ? findStartIndex(direction)
          : (findMatchIndex + direction + total) % total;
      setFindMatchIndex(index);
      if (findScope === "workbook") {
        focusWorkbookMatch(findReplaceWorkbookMatches[index]);
      } else {
        focusMatchCell(findReplaceMatches[index]);
      }
    },
    [
      findScope,
      findReplaceMatches,
      findReplaceWorkbookMatches,
      findMatchIndex,
      findStartIndex,
      focusMatchCell,
      focusWorkbookMatch,
    ],
  );
  const findNextMatch = useCallback(() => stepFindMatch(1), [stepFindMatch]);
  const findPreviousMatch = useCallback(
    () => stepFindMatch(-1),
    [stepFindMatch],
  );

  const findReplaceTargetIsEditable = useCallback(
    (targetSheet: SheetModel | undefined, key: string): boolean => {
      if (!targetSheet) return false;
      const separator = key.indexOf(":");
      const row = Number(key.slice(0, separator));
      const col = Number(key.slice(separator + 1));
      const editable =
        separator > 0 &&
        Number.isInteger(row) &&
        Number.isInteger(col) &&
        row >= 0 &&
        col >= 0 &&
        isCellEditableRef.current(targetSheet, row, col);
      // A What-If Data Table's result never changes alone (Excel's Replace
      // refuses it as typing does).
      return editable && !whatIfTableBlockAt(whatIfTableBlocks(targetSheet.whatIfTables), row, col);
    },
    [],
  );
  // The refusal's words: "Cannot change part of a data table." when a target
  // is a data table's result, else the protection notice.
  const showReplaceRefusal = useCallback(
    (targets: ReadonlyArray<readonly [SheetModel | undefined, string]>) => {
      const whatIf = targets.some(([targetSheet, key]) => {
        if (!targetSheet?.whatIfTables) return false;
        const [row, col] = key.split(":").map(Number);
        return whatIfTableBlockAt(whatIfTableBlocks(targetSheet.whatIfTables), row, col) !== null;
      });
      showProtectNotice(whatIf ? whatIfTablePartMessage : undefined);
    },
    [showProtectNotice, whatIfTablePartMessage],
  );

  // Replace the currently-focused match (or the first match) then advance to the
  // NEXT match. We must recompute the match list against the post-replacement
  // cells: a case-insensitive replace (e.g. "foo"->"Foo") leaves the cell still
  // matching, so re-targeting by stale index would loop on the same cell forever.
  // A replaced table header renames its column: the table's column identity
  // and every structured reference in the workbook follow, exactly as when
  // the header is edited by hand (live audit B165).
  const commitReplacedCells = useCallback(
    (nextCells: CellMap, replacedKeys: readonly string[]) => {
      const { dataTables, renames } = tableHeaderRenamesAfterReplace(
        sheet,
        nextCells,
        replacedKeys,
      );
      const renameAll = (candidate: SheetModel): SheetModel =>
        renameTableColumnsInSheet(candidate, renames);
      const next: SheetModel = {
        ...sheet,
        cells: nextCells,
        ...(dataTables !== sheet.dataTables ? { dataTables } : {}),
      };
      replaceActiveSheet(
        renames.length > 0 ? renameAll(next) : next,
        undefined,
        "content",
        undefined,
        renames.length > 0 ? renameAll : undefined,
      );
    },
    [replaceActiveSheet, sheet],
  );

  const replaceCurrentMatch = useCallback(() => {
    if ((!findQuery && !findFormat) || findReplaceTab !== "replace") return;
    const current = findReplaceCurrentIndex();
    if (current < 0) {
      findNextMatch();
      return;
    }

    // Workbook scope: replace the focused match in ITS OWN sheet (by sheet
    // index, not the active sheet) and commit the whole array, then recompute
    // the workbook match list and step to the next hit. Same anti-loop logic as
    // sheet scope: a still-matching cell (case-insensitive/partial) is stepped
    // past so repeated Replace clicks always make progress.
    if (findScope === "workbook") {
      const index = current;
      const match = findReplaceWorkbookMatches[index];
      const targetSheet = sheets[match.sheetIndex];
      if (!targetSheet) return;
      if (!findReplaceTargetIsEditable(targetSheet, match.key)) {
        showReplaceRefusal([[targetSheet, match.key]]);
        return;
      }
      const single = replaceAllCells(
        { [match.key]: targetSheet.cells[match.key] },
        findQuery,
        replaceValue,
        findReplaceOptions,
      );
      if (single.count === 0) return;
      const updatedCell = single.cells[match.key];
      const nextCells = { ...targetSheet.cells };
      if (updatedCell && (updatedCell.value || hasCellMetadata(updatedCell))) {
        nextCells[match.key] = updatedCell as SpreadsheetCell;
      } else {
        delete nextCells[match.key];
      }
      const nextSheets = sheets.map((candidate, i) =>
        i === match.sheetIndex ? { ...candidate, cells: nextCells } : candidate,
      );
      commitSheets(nextSheets);

      const remaining = findMatchesInWorkbook(
        nextSheets.map((s) => s.cells),
        findQuery,
        findReplaceOptions,
      );
      if (remaining.length === 0) {
        setFindMatchIndex(-1);
        return;
      }
      // Step PAST the just-replaced cell (it may still match) to the next hit.
      const stillAt = remaining.findIndex(
        (m) => m.sheetIndex === match.sheetIndex && m.key === match.key,
      );
      const nextIndex =
        stillAt >= 0
          ? (stillAt + 1) % remaining.length
          : Math.min(index, remaining.length - 1);
      setFindMatchIndex(nextIndex);
      focusWorkbookMatch(remaining[nextIndex]);
      return;
    }

    const index = current;
    const targetKey = findReplaceMatches[index];
    if (!findReplaceTargetIsEditable(sheet, targetKey)) {
      showReplaceRefusal([[sheet, targetKey]]);
      return;
    }
    const single = replaceAllCells(
      { [targetKey]: sheet.cells[targetKey] },
      findQuery,
      replaceValue,
      findReplaceOptions,
    );
    if (single.count === 0) return;
    const updatedCell = single.cells[targetKey];
    const nextCells = copyCellMap(sheet.cells);
    if (updatedCell && (updatedCell.value || hasCellMetadata(updatedCell))) {
      nextCells[targetKey] = updatedCell as SpreadsheetCell;
    } else {
      delete nextCells[targetKey];
    }
    commitReplacedCells(nextCells, [targetKey]);

    // Recompute matches over the updated cells (same find logic the modal uses)
    // and advance to the next match so repeated Replace clicks make progress.
    const remaining = restrictToFindSelection(
      findCellMatches(nextCells, findQuery, findReplaceOptions),
    );
    if (remaining.length === 0) {
      setFindMatchIndex(-1);
      return;
    }
    // The replaced cell may still match (case-insensitive / partial); step PAST
    // it to the next cell in row-major order, wrapping around the list.
    const stillAt = remaining.indexOf(targetKey);
    const nextIndex =
      stillAt >= 0
        ? (stillAt + 1) % remaining.length
        : Math.min(index, remaining.length - 1);
    setFindMatchIndex(nextIndex);
    focusMatchCell(remaining[nextIndex]);
  }, [
    findQuery,
    findFormat,
    findReplaceTab,
    findReplaceCurrentIndex,
    findNextMatch,
    restrictToFindSelection,
    findScope,
    findReplaceMatches,
    findReplaceWorkbookMatches,
    sheet,
    sheets,
    replaceValue,
    findReplaceOptions,
    commitReplacedCells,
    commitSheets,
    findReplaceTargetIsEditable,
    showReplaceRefusal,
    focusMatchCell,
    focusWorkbookMatch,
    showProtectNotice,
  ]);

  // What the last Replace All did, for the status line. Once every match is
  // replaced the live count is zero, and "No matches found" under a Replace All
  // that just worked reads as a failure; Excel reports how many it made. The
  // outcome belongs to the query it was made for and is dropped with it.
  const [findReplaceOutcome, setFindReplaceOutcome] = useState<{
    query: string;
    count: number;
  } | null>(null);
  const reportReplaceAll = useCallback(
    (count: number) => {
      setFindReplaceOutcome({ query: findQuery, count });
      // A Find All list would show the values from before the replacement.
      setFindAllRows(null);
      setFindAllActiveId(null);
      // The button that was pressed is disabled by now (nothing left to
      // replace), which drops the focus to the body, where Escape and Enter
      // reach nothing. Keep the focus in the dialog, as Excel does.
      scheduleRaf(() => findInputRef.current?.focus({ preventScroll: true }));
    },
    [findQuery, scheduleRaf],
  );
  const replaceAllMatches = useCallback(() => {
    if ((!findQuery && !findFormat) || findReplaceTab !== "replace") return;

    // Workbook scope: replace across EVERY sheet in one commit (one undo step).
    // replaceAllInWorkbook preserves each unchanged sheet's identity, so only
    // touched sheets get a new cells object.
    if (findScope === "workbook") {
      if (
        findReplaceWorkbookMatches.some((match) =>
          !findReplaceTargetIsEditable(sheets[match.sheetIndex], match.key),
        )
      ) {
        showReplaceRefusal(findReplaceWorkbookMatches.map((match) => [sheets[match.sheetIndex], match.key] as const));
        return;
      }
      const result = replaceAllInWorkbook(
        sheets.map((s) => s.cells),
        findQuery,
        replaceValue,
        findReplaceOptions,
      );
      if (result.count === 0) return;
      // A replaced table header renames its column on every sheet, as the
      // sheet and selection scopes do (S-123).
      const renames: TableColumnRename[] = [];
      const replacedSheets = sheets.map((candidate, i) => {
        if (result.countsBySheet[i] <= 0) return candidate;
        const cells = result.sheets[i] as CellMap;
        const header = tableHeaderRenamesAfterReplace(
          candidate,
          cells,
          changedCellKeys(candidate.cells, cells),
        );
        renames.push(...header.renames);
        return {
          ...candidate,
          cells,
          ...(header.dataTables !== candidate.dataTables ? { dataTables: header.dataTables } : {}),
        };
      });
      commitSheets(
        renames.length > 0
          ? replacedSheets.map((candidate) => renameTableColumnsInSheet(candidate, renames))
          : replacedSheets,
      );
      setFindMatchIndex(-1);
      reportReplaceAll(result.count);
      return;
    }

    // A selection, or a sheet whose filter hides rows, replaces only the
    // matches Find lists: the filtered-out rows are not searched, so they are
    // not replaced either.
    if (findScope === "selection" || hiddenRows.size > 0) {
      if (
        findReplaceMatches.some(
          (key) => !findReplaceTargetIsEditable(sheet, key),
        )
      ) {
        showReplaceRefusal(findReplaceMatches.map((key) => [sheet, key] as const));
        return;
      }
      const result = replaceAllInKeys(
        sheet.cells,
        findReplaceMatches,
        findQuery,
        replaceValue,
        findReplaceOptions,
      );
      if (result.count === 0) return;
      commitReplacedCells(result.cells, findReplaceMatches);
      setFindMatchIndex(-1);
      reportReplaceAll(result.count);
      return;
    }

    if (
      findReplaceMatches.some(
        (key) => !findReplaceTargetIsEditable(sheet, key),
      )
    ) {
      showReplaceRefusal(findReplaceMatches.map((key) => [sheet, key] as const));
      return;
    }
    const result = replaceAllCells(
      sheet.cells,
      findQuery,
      replaceValue,
      findReplaceOptions,
    );
    if (result.count === 0) return;
    // Through the header path: a replaced table header renames its column
    // and its references follow (S-123: the header text changed, the column
    // and its formulas kept the old name, and the new name read #REF!).
    commitReplacedCells(
      result.cells as CellMap,
      changedCellKeys(sheet.cells, result.cells as CellMap),
    );
    setFindMatchIndex(-1);
    reportReplaceAll(result.count);
  }, [
    reportReplaceAll,
    findQuery,
    findFormat,
    findReplaceTab,
    findScope,
    sheet,
    sheets,
    replaceValue,
    findReplaceOptions,
    replaceActiveSheet,
    commitReplacedCells,
    commitSheets,
    findReplaceMatches,
    findReplaceWorkbookMatches,
    findReplaceTargetIsEditable,
    showReplaceRefusal,
    showProtectNotice,
    hiddenRows,
  ]);

  // Find All (Excel): every hit of the current search, in search order, as
  // Book | Sheet | Name | Cell | Value | Formula rows under the dialog.
  const findAllMatches = useCallback(() => {
    const hits: WorkbookMatch[] =
      findScope === "workbook"
        ? findReplaceWorkbookMatches
        : findReplaceMatches.map((key) => {
            const [row, col] = key.split(":").map(Number);
            return { sheetIndex: activeFindSheetIndex, key, row, col };
          });
    setFindAllRows(
      describeFindMatches(
        sheets.map(({ id, name, cells }) => ({ id, name, cells })),
        hits,
        workbookNamedRanges,
        findDisplayTextFor,
      ),
    );
    setFindAllActiveId(null);
  }, [
    activeFindSheetIndex,
    findDisplayTextFor,
    findScope,
    findReplaceMatches,
    findReplaceWorkbookMatches,
    sheets,
    workbookNamedRanges,
  ]);
  // Choosing a row selects its cell, switching sheets when it lives on
  // another one, and Find Next carries on from there.
  const selectFindAllRow = useCallback(
    (row: FindAllRow) => {
      setFindAllActiveId(row.id);
      setFindMatchIndex(
        findScope === "workbook"
          ? findReplaceWorkbookMatches.findIndex(
              (match) =>
                match.sheetIndex === row.sheetIndex && match.key === row.key,
            )
          : findReplaceMatches.indexOf(row.key),
      );
      navigateFindResult({ sheetId: row.sheetId, row: row.row, col: row.col });
      flashJumpRange(row.sheetId, { r1: row.row, c1: row.col, r2: row.row, c2: row.col });
    },
    [
      findScope,
      findReplaceMatches,
      findReplaceWorkbookMatches,
      flashJumpRange,
      navigateFindResult,
    ],
  );
  return {
    findAllMatches,
    findDisplayTextFor,
    findMatchTotal,
    findNextMatch,
    findPreviousMatch,
    findReplaceCurrentIndex,
    findReplaceMatches,
    findReplaceOutcome,
    findReplaceTargetIsEditable,
    findReplaceWorkbookMatches,
    replaceAllMatches,
    replaceCurrentMatch,
    selectFindAllRow,
    setFindReplaceOutcome,
  };
}
