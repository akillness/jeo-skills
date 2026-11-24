/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type SheetOwnHistoryState } from "../../../../lib/spreadsheet/own-history";
import { mergeForwardDataQueryHistory } from "@mrnote/core/web/lib/spreadsheet/data-queries.ts";
import type { SpreadsheetDataSourceInventory } from "../../../../lib/spreadsheet/workbook-import-client";
import { type SpreadsheetNativeObjectCopyHistoryStep } from "@mrnote/core/web/lib/spreadsheet-native-object-copy.ts";
import { type SpreadsheetNativeCopyHistoryStep } from "@mrnote/core/web/lib/spreadsheet-native-copy-history.ts";
import { parseCellRef } from "@mrnote/core/web/lib/spreadsheet/formula-engine.ts";
import { type SplitPaneViewState } from "@mrnote/core/web/lib/spreadsheet/freeze-panes.ts";
import { splitCarriedOntoRestoredSheet, type SplitStructureSheet } from "@mrnote/core/web/lib/spreadsheet/split-pane-structure.ts";
import { type DataTableColumnFilter, type DataTableSortCondition } from "@mrnote/core/web/lib/spreadsheet/data-table.ts";
import { type WorkbookStructureProtection } from "@mrnote/core/web/lib/spreadsheet/protection.ts";
import { type ConditionFilter } from "@mrnote/core/web/lib/spreadsheet/filter-conditions.ts";
import { parseA1Range } from "@mrnote/core/web/lib/spreadsheet/print-settings.ts";
import { type SpreadsheetSheetViewFilterState, type SpreadsheetSheetViewSessionTable, type SpreadsheetSheetViewSortState } from "../../../../lib/spreadsheet/sheet-views";
import { type SpreadsheetWorkbookThemeSelection } from "@mrnote/core/web/lib/spreadsheet/workbook-theme.ts";
import { type SheetModel } from "./spreadsheetSheetModel";
import type { SheetLineEdit } from "@mrnote/core/web/lib/spreadsheet/structural.ts";
import type { WorksheetCalculationLinesDropped } from "@mrnote/core/web/lib/spreadsheet/calculation-mode.ts";
import { spreadsheetRangeA1 } from "./spreadsheetRangeA1";

export interface SheetViewSession {
  sheetId: string;
  activeViewId: string | "temporary";
  defaultState: SpreadsheetSheetViewFilterState;
  defaultAutoFilterId?: string;
  defaultAutoFilterRef?: string;
  defaultOwnsAutoFilter?: true;
  filterId?: string;
  sortState?: SpreadsheetSheetViewSortState;
  ref?: string;
  ownsAutoFilter?: true;
  /** The view's Table AutoFilters: identity and the view's Table sorts. */
  tables?: SpreadsheetSheetViewSessionTable[];
  /** Named views: the shared definition as last merged; see sheet-views.ts. */
  sharedState?: SpreadsheetSheetViewFilterState;
}

/**
 * A sort or filter the user asked for while other people are in the workbook,
 * held until they choose whether it is for everyone or only for themselves.
 * Replayed through the ordinary setters once a temporary view exists, so the
 * in-view path applies it.
 */
export type SheetViewScopedAction =
  | { kind: "valueFilter"; col: number; allowed: string[] | null }
  | {
      kind: "combinedFilter";
      col: number;
      valueAllowed: string[] | null;
      colorAllowed: string[] | null;
    }
  | { kind: "conditionFilter"; col: number; condition: ConditionFilter }
  | { kind: "quickSort"; direction: "asc" | "desc"; column?: number }
  | { kind: "colorSort"; color: string; column: number }
  | {
      kind: "tableFilter";
      tableId: string;
      columnId: number;
      filter: DataTableColumnFilter;
      allowHiddenFilterButton?: boolean;
    }
  | { kind: "tableSort"; tableId: string; conditions: DataTableSortCondition[] }
  | { kind: "sortDialog" };

export type SheetViewScopePreference = "ask" | "me" | "everyone";
const SHEET_VIEW_SCOPE_STORAGE_KEY = "mrai.spreadsheet.sheetViewScope";

export function readSheetViewScopePreference(): SheetViewScopePreference {
  if (typeof window === "undefined") return "ask";
  try {
    const stored = window.localStorage.getItem(SHEET_VIEW_SCOPE_STORAGE_KEY);
    return stored === "me" || stored === "everyone" ? stored : "ask";
  } catch {
    return "ask";
  }
}

export function writeSheetViewScopePreference(value: SheetViewScopePreference): void {
  try {
    if (value === "ask") {
      window.localStorage.removeItem(SHEET_VIEW_SCOPE_STORAGE_KEY);
    } else {
      window.localStorage.setItem(SHEET_VIEW_SCOPE_STORAGE_KEY, value);
    }
  } catch {
    // Per-viewer convenience only; the prompt simply asks again next time.
  }
}

export interface SheetViewMappedDrawingMutation {
  readonly chartGroup?: true;
  readonly chartProperties?: true;
  readonly chartOrder?: true;
  authority: symbol;
  kind: "mapped-drawing";
  collection: "objects" | "charts" | "slicers";
  objectId: string;
  sourceSheet: SheetModel;
  rowMapKey: string;
}

export interface SheetViewMappedCellMutation {
  kind: "mapped-cell";
  key: string;
  authority: symbol;
}

export interface SheetViewMappedLineMutation {
  kind: "mapped-line";
  authority: symbol;
  sourceSheet: SheetModel;
  rowMapKey: string;
  axis: "row" | "col";
  index: number;
}

export interface SheetViewMappedPageMutation {
  kind: "mapped-page-settings";
  authority: symbol;
  sourceSheet: SheetModel;
}

export type SheetViewDialogState =
  | { mode: "keep"; name: string; error?: string }
  | { mode: "options"; selectedId: string; name: string; error?: string };

export interface SheetHistoryEntry {
  sheets: SheetModel[];
  /** Exact outcome recorded by this ordinary command, before any peer update. */
  ownAfter?: SheetOwnHistoryState<SheetModel>;
  /** Native copy history carries only a saved export receipt, never a workbook
   * snapshot. These entries use an empty sheets array and the native handler. */
  nativeCopy?: SpreadsheetNativeCopyHistoryStep;
  nativeObjectCopy?: SpreadsheetNativeObjectCopyHistoryStep;
  /** Query history restores only its output delta against the live workbook. */
  queryExpected?: SheetModel[];
  /** Active worksheet identity paired with a topology snapshot. */
  activeSheetId?: string;
  /** Where Undo and Redo of this step open, wherever they are pressed: the
   * sheet a cell edit was made on (Excel). Absent: Redo opens the sheet Undo
   * was pressed on, which is where a step that switched sheets left the
   * person (a PivotTable moved to a new worksheet). */
  stepSheetId?: string;
  /** Session-only active/default filter authority paired with this snapshot. */
  sheetViewSession?: SheetViewSession | null;
  /** The sheet whose coordinate identity changed in this history transition. */
  coordinateSheetId?: string;
  /** Whole rows or columns this step inserted or deleted, by sheet id (the
   * forward step): Manual calculation's last results move with them. */
  lineEdits?: ReadonlyArray<readonly [string, SheetLineEdit]>;
  /** Manual calculation's last results this step's transition took off with
   * the cells it deleted: replaying the entry (the inverse transition) brings
   * them back with the cells, as Excel's Undo restores a deleted formula with
   * its last result. Session-only, like the calculation ledger itself. */
  calculationDropped?: WorksheetCalculationLinesDropped<unknown> | null;
  /** Present only for an undoable workbook-theme transition. */
  workbookTheme?: SpreadsheetWorkbookThemeSelection;
  /** Present only when a whole-workbook import changes source provenance. */
  dataSourceInventory?: SpreadsheetDataSourceInventory | null;
  /** Present only for an undoable workbook structure-protection transition. */
  workbookStructureProtection?: WorkbookStructureProtection | null;
}

/** The sheets without their split window state (see mergeForwardSplitPaneAuthority). */
export function sheetsWithoutSplitView(sheets: SheetModel[]): SheetModel[] {
  return sheets.map((candidate) => {
    if (
      candidate.splitRow === undefined &&
      candidate.splitCol === undefined &&
      candidate.splitPaneState === undefined
    ) {
      return candidate;
    }
    const next = { ...candidate };
    delete next.splitRow;
    delete next.splitCol;
    delete next.splitPaneState;
    return next;
  });
}

/**
 * Undo/Redo restore a sheet snapshot, but a split is window state that
 * Excel's Undo never touches: the restored sheets take the split the window
 * shows now (splitCarriedOntoRestoredSheet), their extent holding it. Null
 * only when the live workbook has two sheets with one identity, which no
 * restore can map.
 */
export function mergeForwardSplitPaneAuthority(
  restored: SheetModel[],
  current: SheetModel[],
): SheetModel[] | null {
  const currentById = new Map<string, SheetModel | null>();
  for (const candidate of current) {
    currentById.set(
      candidate.id,
      currentById.has(candidate.id) ? null : candidate,
    );
  }
  const merged: SheetModel[] = [];
  for (const candidate of restored) {
    const live = currentById.get(candidate.id);
    if (live === null) return null;
    merged.push(
      live === undefined
        ? candidate
        : (splitCarriedOntoRestoredSheet(
            candidate as unknown as SplitStructureSheet,
            live as unknown as SplitStructureSheet,
          ) as unknown as SheetModel),
    );
  }
  return mergeForwardDataQueryHistory(merged, current);
}

export function splitPaneAuthorityFingerprint(
  sheetId: string,
  split: { splitRow: number; splitCol: number },
  view: SplitPaneViewState,
): string {
  return `${sheetId}:${split.splitRow}:${split.splitCol}:${JSON.stringify(view)}`;
}

export function splitPaneSelectionHydration(
  selection: SplitPaneViewState["selections"][number],
): {
  active: { row: number; col: number };
  anchor: { row: number; col: number };
  signature: string;
} | null {
  const active = parseCellRef(selection.activeCell);
  const ranges = selection.sqref.trim().split(/\s+/).filter(Boolean);
  const activeRange = parseA1Range(ranges[selection.activeCellId] ?? "");
  if (!active || !activeRange) return null;
  const anchor =
    active.row === activeRange.r1 && active.col === activeRange.c1
      ? { row: activeRange.r2, col: activeRange.c2 }
      : { row: activeRange.r1, col: activeRange.c1 };
  const selected = {
    r1: Math.min(active.row, anchor.row),
    c1: Math.min(active.col, anchor.col),
    r2: Math.max(active.row, anchor.row),
    c2: Math.max(active.col, anchor.col),
  };
  return {
    active,
    anchor,
    signature: `${active.row}:${active.col}:${spreadsheetRangeA1(selected)}`,
  };
}
