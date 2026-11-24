"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { spreadsheetDraftSource } from "../../../../lib/spreadsheet/draft-source";
import { SpreadsheetDraftInput, type SpreadsheetDraftExitRequest, type SpreadsheetDraftPublishRequest, type SpreadsheetDraftPublishResult } from "./SpreadsheetDraftInput";
import { SpreadsheetCellCheckbox } from "./SpreadsheetCellCheckbox";
import { type Dispatch, type SetStateAction, type ComponentProps, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { createSpreadsheetCommandRegistry } from "../../../../lib/spreadsheet/command-registry";
import { type ReferenceStyle } from "@mrnote/core/web/lib/spreadsheet/r1c1.ts";
import { type ValidationRule } from "@mrnote/core/web/lib/spreadsheet/data-validation.ts";
import { type DataTableColumnFilter, type DataTableSortCondition } from "@mrnote/core/web/lib/spreadsheet/data-table.ts";
import { hasThread, isNoteComment } from "@mrnote/core/web/lib/spreadsheet/comments.ts";
import { compressDateFilterSelection, isDateColumn, selectedValuesForDateGroups, type FilterDateAuthority } from "@mrnote/core/web/lib/spreadsheet/date-filter-tree.ts";
import { isRadioSelected, radioValue, spinnerValue, sliderValue } from "../../../../lib/spreadsheet/form-controls";
import { FilterMenu } from "./SpreadsheetFilterMenu";
import { type SheetModel } from "./spreadsheetSheetModel";

/** Grid JSX may outlive its producing Window render. These module factories
 * retain only the stable committed bridge and the rendered cell's small inputs.
 * Capture the bridge once at dispatch; async follow-ups keep that same receipt. */
interface SpreadsheetGridEventScope {
  pickListEntryFor: (row: number, col: number, option: string) => string;
  /** A Sheet View sort (worksheet or Table) orders the display rows. */
  sheetViewSorted: boolean;
  autoFillDownFromHandle: (event: ReactMouseEvent) => void;
  autoFitRow: (row: number) => void;
  autoFitRows: (rows: ReadonlyArray<number>) => void;
  autocompleteRef: RefObject<{ key: string; prefixLen: number; } | null>;
  beginCellEditing: (row: number, col: number, input?: HTMLInputElement | null, mode?: "enter" | "edit") => boolean;
  beginCellRangeDrag: (event: ReactPointerEvent<HTMLInputElement>, row: number, col: number, editing: boolean) => void;
  beginFillDrag: (event: ReactPointerEvent) => void;
  cancelValidatedDraftForInput: (input: HTMLInputElement, row: number, col: number) => void;
  cellDraftLoadEpochRef: RefObject<number>;
  clearSlicerContext: () => void;
  commandRegistryRef: RefObject<ReturnType<typeof createSpreadsheetCommandRegistry>>;
  commentReturnFocusRef: RefObject<HTMLInputElement | null>;
  /** A mouse press on a cell, held: set from the press to its release. */
  cellRangeDragRef: RefObject<unknown>;
  commitPlainCellDraftExit: (request: SpreadsheetDraftExitRequest, row: number, col: number) => "accepted" | "rejected" | "fallback";
  commitTypedCellInput: (input: HTMLInputElement, row: number, col: number) => SheetModel[] | null;
  commitValidation: (row: number, col: number) => void;
  computedSheetViewDisplayOrder: number[] | null;
  editStartRef: RefObject<{ key: string; value: string; } | null>;
  handleCellKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>, row: number, col: number, draftPriorityOnly?: boolean) => void;
  liveSheetsRef: RefObject<SheetModel[]>;
  maybeAutocomplete: (input: HTMLInputElement, row: number, col: number, prevValue: string) => string | null;
  navigateInternalLink: (link: string) => void;
  openContextMenu: (event: ReactMouseEvent, kind: "cell" | "row" | "col", row: number, col: number) => void;
  pageId: string;
  plainDraftExitReceiptRef: RefObject<{ input: HTMLInputElement; pageId: string; loadEpoch: number; sourceWorkbook: SheetModel[]; sourceSheet: SheetModel; sourceIdentity: unknown; row: number; col: number; committedWorkbook: SheetModel[]; committedValue: string; } | null>;
  publishValidatedCellDraft: (request: SpreadsheetDraftPublishRequest, row: number, col: number) => Promise<SpreadsheetDraftPublishResult> | undefined;
  referenceStyle: ReferenceStyle;
  refreshFormulaIntel: (input: HTMLInputElement, row: number, col: number) => void;
  restoreTableFilterFocus: (tableId: string, columnId: number) => void;
  selRect: { r1: number; r2: number; c1: number; c2: number; };
  selectWholeRow: (row: number, extend?: boolean) => void;
  selectionExtendingRef: RefObject<boolean>;
  activeCellTookFocus: (row: number, col: number, keepAnchor: boolean) => void;
  setActiveCell: Dispatch<SetStateAction<{ row: number; col: number; }>>;
  setCellValue: (row: number, col: number, value: string) => SheetModel[] | null;
  setChartFormatPaneOpen: Dispatch<SetStateAction<boolean>>;
  setCommentEditorKind: Dispatch<SetStateAction<"note" | "thread">>;
  setCommentOpen: Dispatch<SetStateAction<boolean>>;
  setCommentsPaneOpen: Dispatch<SetStateAction<boolean>>;
  setControlValueAt: (row: number, col: number, value: string) => void;
  setDataTableColumnFilter: (id: string, columnId: number, filter: DataTableColumnFilter | null, options?: { allowHiddenFilterButton?: boolean; }) => void;
  setEditingCell: Dispatch<SetStateAction<{ sheetId: string; row: number; col: number; mode?: "enter" | "edit"; } | null>>;
  setFormulaIntel: (value: null) => void;
  setListPicker: Dispatch<SetStateAction<{ row: number; col: number; } | null>>;
  setPickFromList: Dispatch<SetStateAction<{ row: number; col: number; } | null>>;
  setSelectedObjectId: Dispatch<SetStateAction<string | null>>;
  setSelectionAnchor: Dispatch<SetStateAction<{ row: number; col: number; } | null>>;
  setSheetViewEditingOrder: Dispatch<SetStateAction<{ sheetId: string; sourceRow: number; order: readonly number[]; } | null>>;
  setTableFilterMenu: Dispatch<SetStateAction<{ tableId: string; columnId: number; col: number; anchorId?: string; } | null>>;
  setFilterMenuCol: Dispatch<SetStateAction<number | null>>;
  sheetFilterBlockedReason: string | null;
  /** Select locked cells / Select unlocked cells on the active sheet. */
  isCellSelectable: (row: number, col: number) => boolean;
  sheet: SheetModel;
  sheetViewDisplayOrderRef: RefObject<readonly number[] | null>;
  sheetViewProjectionActive: boolean;
  sheets: SheetModel[];
  showProtectNotice: (message?: string) => void;
  sortDataTable: (id: string, conditions: readonly DataTableSortCondition[]) => Promise<void>;
  startRowResize: (row: number, event: ReactPointerEvent<HTMLElement>) => void;
  t: (key: string) => string;
  tableFilterMenuDateAuthority: FilterDateAuthority | null;
  tableFilterMenuOptions: string[];
  toggleCheckboxAt: (row: number, col: number) => void;
}

/**
 * Row-header handlers that do not belong to the shared grid event scope: the
 * unhide gesture reads its own small scope, so the row header can grow a
 * behaviour without touching the scope object every other grid surface shares.
 */
interface SpreadsheetRowHeaderScope {
  manualHiddenRunAfter: (
    axis: "col" | "row",
    index: number,
  ) => readonly number[];
  commitLinesHidden: (
    axis: "col" | "row",
    lines: readonly number[],
    hide: boolean,
  ) => void;
}

export const spreadsheetRowHeaderHandlers = {
  /** Excel: double-clicking the doubled line shows the rows it hides; any
   * other divider auto-fits, as before. */
  resizeDoubleClick(
    rowHeaderBridge: RefObject<SpreadsheetRowHeaderScope>,
    gridEventBridge: RefObject<SpreadsheetGridEventScope>,
    row: number,
  ): NonNullable<ComponentProps<"span">["onDoubleClick"]> {
    return (event) => {
      const scope = rowHeaderBridge.current;
      const hiddenAfter = scope.manualHiddenRunAfter("row", row);
      if (hiddenAfter.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        scope.commitLinesHidden("row", hiddenAfter, false);
        return;
      }
      spreadsheetGridRowHandlers.autoFit(gridEventBridge, row)(event);
    };
  },
};

export const spreadsheetGridRowHandlers = {
  select(gridEventBridge: RefObject<SpreadsheetGridEventScope>, row: number): NonNullable<ComponentProps<"th">["onClick"]> {
    return (event) => { const gridEventSnapshot = gridEventBridge.current;
      if (event.defaultPrevented) return;
      gridEventSnapshot.selectWholeRow(row, event.shiftKey);
    };
  },
  contextMenu(gridEventBridge: RefObject<SpreadsheetGridEventScope>, row: number): NonNullable<ComponentProps<"th">["onContextMenu"]> {
    return (event) =>
    { const gridEventSnapshot = gridEventBridge.current; return gridEventSnapshot.openContextMenu(event, "row", row, 0); };
  },
  resize(gridEventBridge: RefObject<SpreadsheetGridEventScope>, row: number): NonNullable<ComponentProps<"span">["onPointerDown"]> {
    return (event) => { const gridEventSnapshot = gridEventBridge.current;
      if (gridEventSnapshot.sheetViewProjectionActive) {
        event.preventDefault();
        gridEventSnapshot.showProtectNotice(
          gridEventSnapshot.t("spreadsheet.uiCopy.rowStructureCannotBeChangedInASortedSheet"),
        );
        return;
      }
      gridEventSnapshot.startRowResize(row, event);
    };
  },
  autoFit(gridEventBridge: RefObject<SpreadsheetGridEventScope>, row: number): NonNullable<ComponentProps<"span">["onDoubleClick"]> {
    return (event) => { const gridEventSnapshot = gridEventBridge.current;
      event.preventDefault();
      event.stopPropagation();
      if (gridEventSnapshot.sheetViewProjectionActive) {
        gridEventSnapshot.showProtectNotice(
          gridEventSnapshot.t("spreadsheet.uiCopy.rowStructureCannotBeChangedInASortedSheet"),
        );
        return;
      }
      // Excel/WPS: double-clicking one selected row's divider
      // auto-fits every selected row at once (one undo step).
      if (
        gridEventSnapshot.selRect.r1 !== gridEventSnapshot.selRect.r2 &&
        row >= gridEventSnapshot.selRect.r1 &&
        row <= gridEventSnapshot.selRect.r2
      ) {
        const rows: number[] = [];
        for (let r = gridEventSnapshot.selRect.r1; r <= gridEventSnapshot.selRect.r2; r += 1)
          rows.push(r);
        gridEventSnapshot.autoFitRows(rows);
      } else {
        gridEventSnapshot.autoFitRow(row);
      }
    };
  },
  resizeClick(gridEventBridge: RefObject<SpreadsheetGridEventScope>): NonNullable<ComponentProps<"span">["onClick"]> {
    return (event) => { const gridEventSnapshot = gridEventBridge.current; return event.stopPropagation(); };
  },
};

export const spreadsheetGridAutoFilterHandlers = {
  // An AutoFilter arrow opens (or closes) its column's filter menu. On a
  // protected sheet Excel answers the arrow with its protected-sheet message.
  toggle(gridEventBridge: RefObject<SpreadsheetGridEventScope>, col: number): NonNullable<ComponentProps<"button">["onClick"]> {
    return (event) => { const gridEventSnapshot = gridEventBridge.current;
      event.stopPropagation();
      if (gridEventSnapshot.sheetFilterBlockedReason) {
        gridEventSnapshot.showProtectNotice(gridEventSnapshot.sheetFilterBlockedReason);
        return;
      }
      gridEventSnapshot.setTableFilterMenu(null);
      gridEventSnapshot.setFilterMenuCol((current) => (current === col ? null : col));
    };
  },
};

export const spreadsheetGridTableHandlers = {
  sortAscending(gridEventBridge: RefObject<SpreadsheetGridEventScope>, tableId: string, columnId: number): NonNullable<ComponentProps<typeof FilterMenu>["onSortAscending"]> {
    return () => { const gridEventSnapshot = gridEventBridge.current;
      gridEventSnapshot.sortDataTable(tableId, [
        { columnId: columnId },
      ]);
      gridEventSnapshot.setTableFilterMenu(null);
      gridEventSnapshot.restoreTableFilterFocus(
        tableId,
        columnId,
      );
    };
  },
  sortDescending(gridEventBridge: RefObject<SpreadsheetGridEventScope>, tableId: string, columnId: number): NonNullable<ComponentProps<typeof FilterMenu>["onSortDescending"]> {
    return () => { const gridEventSnapshot = gridEventBridge.current;
      gridEventSnapshot.sortDataTable(tableId, [
        {
          columnId: columnId,
          descending: true,
        },
      ]);
      gridEventSnapshot.setTableFilterMenu(null);
      gridEventSnapshot.restoreTableFilterFocus(
        tableId,
        columnId,
      );
    };
  },
  sortColor(gridEventBridge: RefObject<SpreadsheetGridEventScope>, tableId: string, columnId: number): NonNullable<ComponentProps<typeof FilterMenu>["onSortColor"]> {
    return (color) => { const gridEventSnapshot = gridEventBridge.current;
      gridEventSnapshot.sortDataTable(tableId, [
        {
          columnId: columnId,
          color: {
            kind: "cell",
            value: color,
          },
        },
      ]);
      gridEventSnapshot.setTableFilterMenu(null);
      gridEventSnapshot.restoreTableFilterFocus(
        tableId,
        columnId,
      );
    };
  },
  sortFontColor(gridEventBridge: RefObject<SpreadsheetGridEventScope>, tableId: string, columnId: number): NonNullable<ComponentProps<typeof FilterMenu>["onSortFontColor"]> {
    return (color) => { const gridEventSnapshot = gridEventBridge.current;
      gridEventSnapshot.sortDataTable(tableId, [
        {
          columnId: columnId,
          color: {
            kind: "font",
            value: color,
          },
        },
      ]);
      gridEventSnapshot.setTableFilterMenu(null);
      gridEventSnapshot.restoreTableFilterFocus(
        tableId,
        columnId,
      );
    };
  },
  sortIcon(gridEventBridge: RefObject<SpreadsheetGridEventScope>, tableId: string, columnId: number): NonNullable<ComponentProps<typeof FilterMenu>["onSortIcon"]> {
    return (icon) => { const gridEventSnapshot = gridEventBridge.current;
      gridEventSnapshot.sortDataTable(tableId, [
        { columnId: columnId, icon },
      ]);
      gridEventSnapshot.setTableFilterMenu(null);
      gridEventSnapshot.restoreTableFilterFocus(
        tableId,
        columnId,
      );
    };
  },
  apply(gridEventBridge: RefObject<SpreadsheetGridEventScope>, tableColumnFilter: DataTableColumnFilter | null | undefined, tableId: string, columnId: number): NonNullable<ComponentProps<typeof FilterMenu>["onApply"]> {
    return (
      allowed,
      _colorAllowed,
      commitOptions,
    ) => { const gridEventSnapshot = gridEventBridge.current;
      const persistedDateSelection =
        tableColumnFilter?.dateGroups
          ? selectedValuesForDateGroups(
              gridEventSnapshot.tableFilterMenuOptions,
              tableColumnFilter.dateGroups,
              tableColumnFilter.values,
              gridEventSnapshot.tableFilterMenuDateAuthority?.byDisplay,
            )
          : null;
      const appliedValues =
        allowed ?? gridEventSnapshot.tableFilterMenuOptions;
      const dateSelectionUnchanged =
        persistedDateSelection !== null &&
        persistedDateSelection.size ===
          appliedValues.length &&
        appliedValues.every((value) =>
          persistedDateSelection.has(value),
        );
      const dateCriterion =
        allowed !== null &&
        (gridEventSnapshot.tableFilterMenuDateAuthority?.byDisplay
          .size ||
          isDateColumn(gridEventSnapshot.tableFilterMenuOptions))
          ? compressDateFilterSelection(
              gridEventSnapshot.tableFilterMenuOptions,
              new Set(allowed),
              gridEventSnapshot.tableFilterMenuDateAuthority?.byDisplay,
            )
          : null;
      const nativeDateCriterion =
        dateCriterion &&
        (gridEventSnapshot.tableFilterMenuDateAuthority?.complete ||
          dateCriterion.dateGroups.every(
            (group) =>
              ![
                "hour",
                "minute",
                "second",
              ].includes(group.grouping),
          ))
          ? dateCriterion
          : null;
      const receivedNativeDateCriterion =
        nativeDateCriterion &&
        tableColumnFilter?.calendarType ===
          "gregorian"
          ? {
              ...nativeDateCriterion,
              calendarType:
                "gregorian" as const,
            }
          : nativeDateCriterion;
      gridEventSnapshot.setDataTableColumnFilter(
        tableId,
        columnId,
        dateSelectionUnchanged &&
        tableColumnFilter
          ? tableColumnFilter
          : allowed === null
          ? null
          : receivedNativeDateCriterion &&
            receivedNativeDateCriterion
              .dateGroups.length > 0
          ? receivedNativeDateCriterion
          : { values: allowed },
      );
      if (!commitOptions?.keepOpen) {
        gridEventSnapshot.setTableFilterMenu(null);
        gridEventSnapshot.restoreTableFilterFocus(
          tableId,
          columnId,
        );
      }
    };
  },
  applyColor(gridEventBridge: RefObject<SpreadsheetGridEventScope>, tableId: string, columnId: number): NonNullable<ComponentProps<typeof FilterMenu>["onApplyColor"]> {
    return (color, commitOptions) => { const gridEventSnapshot = gridEventBridge.current;
      gridEventSnapshot.setDataTableColumnFilter(
        tableId,
        columnId,
        color === null ? null : { color },
      );
      if (!commitOptions?.keepOpen) {
        gridEventSnapshot.setTableFilterMenu(null);
        gridEventSnapshot.restoreTableFilterFocus(
          tableId,
          columnId,
        );
      }
    };
  },
  applyIcon(gridEventBridge: RefObject<SpreadsheetGridEventScope>, tableId: string, columnId: number): NonNullable<ComponentProps<typeof FilterMenu>["onApplyIcon"]> {
    return (icon, commitOptions) => { const gridEventSnapshot = gridEventBridge.current;
      gridEventSnapshot.setDataTableColumnFilter(
        tableId,
        columnId,
        icon === null ? null : { icon },
      );
      if (!commitOptions?.keepOpen) {
        gridEventSnapshot.setTableFilterMenu(null);
        gridEventSnapshot.restoreTableFilterFocus(
          tableId,
          columnId,
        );
      }
    };
  },
  applyRelativeDate(gridEventBridge: RefObject<SpreadsheetGridEventScope>, tableId: string, columnId: number): NonNullable<ComponentProps<typeof FilterMenu>["onApplyRelativeDate"]> {
    return (relativeDate, commitOptions) => { const gridEventSnapshot = gridEventBridge.current;
      gridEventSnapshot.setDataTableColumnFilter(
        tableId,
        columnId,
        relativeDate === null
          ? null
          : { relativeDate },
      );
      if (!commitOptions?.keepOpen) {
        gridEventSnapshot.setTableFilterMenu(null);
        gridEventSnapshot.restoreTableFilterFocus(
          tableId,
          columnId,
        );
      }
    };
  },
  applyCondition(gridEventBridge: RefObject<SpreadsheetGridEventScope>, tableId: string, columnId: number): NonNullable<ComponentProps<typeof FilterMenu>["onApplyCondition"]> {
    return (
      condition,
      commitOptions,
    ) => { const gridEventSnapshot = gridEventBridge.current;
      gridEventSnapshot.setDataTableColumnFilter(
        tableId,
        columnId,
        condition === null
          ? null
          : { condition },
      );
      if (!commitOptions?.keepOpen) {
        gridEventSnapshot.setTableFilterMenu(null);
        gridEventSnapshot.restoreTableFilterFocus(
          tableId,
          columnId,
        );
      }
    };
  },
  clear(gridEventBridge: RefObject<SpreadsheetGridEventScope>, tableId: string, columnId: number): NonNullable<ComponentProps<typeof FilterMenu>["onClear"]> {
    return () => { const gridEventSnapshot = gridEventBridge.current;
      gridEventSnapshot.setDataTableColumnFilter(
        tableId,
        columnId,
        null,
      );
      gridEventSnapshot.setTableFilterMenu(null);
      gridEventSnapshot.restoreTableFilterFocus(
        tableId,
        columnId,
      );
    };
  },
  close(gridEventBridge: RefObject<SpreadsheetGridEventScope>, tableId: string, columnId: number): NonNullable<ComponentProps<typeof FilterMenu>["onClose"]> {
    return () => { const gridEventSnapshot = gridEventBridge.current;
      gridEventSnapshot.setTableFilterMenu(null);
      gridEventSnapshot.restoreTableFilterFocus(
        tableId,
        columnId,
      );
    };
  },
};

/**
 * Arm a grid cell's hidden input for Excel's Ready mode.
 *
 * A selected cell is not being edited: Excel draws it exactly like any other
 * cell, text from the start and overflowing into the empty neighbours, and
 * only F2, a double click or typing opens the editor. The cell's whole value
 * still has to be SELECTED inside its input so the next character replaces it,
 * so the selection is anchored backward — the input then scrolls to the start
 * of the text instead of to its end, where plain select() left it showing only
 * the tail. The grid's CSS keeps that selection unpainted (the browser paints
 * selected text in the selection's own colour, which otherwise overrode the
 * transparent text the display and spill layers stand in for).
 */
export function selectSpreadsheetCellEntryText(input: HTMLInputElement) {
  try {
    input.setSelectionRange(0, input.value.length, "backward");
  } catch {
    input.select();
  }
  input.scrollLeft = 0;
}

export const spreadsheetGridDraftHandlers = {
  discard(gridEventBridge: RefObject<SpreadsheetGridEventScope>, row: number, col: number): NonNullable<ComponentProps<typeof SpreadsheetDraftInput>["onDraftDiscard"]> {
    return input => { const gridEventSnapshot = gridEventBridge.current; return gridEventSnapshot.cancelValidatedDraftForInput(input, row, col); };
  },
  publish(gridEventBridge: RefObject<SpreadsheetGridEventScope>, row: number, col: number): NonNullable<ComponentProps<typeof SpreadsheetDraftInput>["onDraftPublish"]> {
    return request => { const gridEventSnapshot = gridEventBridge.current; return gridEventSnapshot.publishValidatedCellDraft(request, row, col); };
  },
  draftChange(gridEventBridge: RefObject<SpreadsheetGridEventScope>, row: number, col: number, editing: boolean, cellRule: Pick<ValidationRule, "kind"> | null): NonNullable<ComponentProps<typeof SpreadsheetDraftInput>["onDraftChange"]> {
    return (event, previousValue, composing) => { const gridEventSnapshot = gridEventBridge.current;
      gridEventSnapshot.cancelValidatedDraftForInput(event.currentTarget, row, col);
      if (!editing) gridEventSnapshot.beginCellEditing(row, col);
      if (composing || (event.nativeEvent as InputEvent | undefined)?.isComposing) return;
      if (cellRule?.kind !== "list") gridEventSnapshot.maybeAutocomplete(event.currentTarget, row, col, previousValue);
      gridEventSnapshot.refreshFormulaIntel(event.currentTarget, row, col);
    };
  },
  focus(gridEventBridge: RefObject<SpreadsheetGridEventScope>, row: number, col: number, cell: SheetModel["cells"][string] | undefined, editing: boolean): NonNullable<ComponentProps<typeof SpreadsheetDraftInput>["onFocus"]> {
    return (event) => { const gridEventSnapshot = gridEventBridge.current;
      // Focus returning to the editor of the cell being edited (its element
      // was replaced by a text area for a manual line break) keeps the entry
      // open: the cell is the active cell already, and an active-cell write
      // would end Edit mode.
      if (editing) return;
      // A cell the selection may not reach (Select locked/unlocked cells)
      // never becomes the active cell, however it got focus.
      if (!gridEventSnapshot.isCellSelectable(row, col)) {
        event.currentTarget.blur();
        return;
      }
      if (gridEventSnapshot.sheetViewSorted) {
        const order =
          gridEventSnapshot.sheetViewDisplayOrderRef.current ??
          gridEventSnapshot.computedSheetViewDisplayOrder;
        if (order) {
          gridEventSnapshot.setSheetViewEditingOrder({
            sheetId: gridEventSnapshot.sheet.id,
            sourceRow: row,
            order,
          });
        }
      }
      const keepAnchor = gridEventSnapshot.selectionExtendingRef.current;
      gridEventSnapshot.selectionExtendingRef.current = false;
      gridEventSnapshot.activeCellTookFocus(row, col, keepAnchor);
      gridEventSnapshot.setSelectedObjectId(null);
      gridEventSnapshot.clearSlicerContext();
      // Selecting a cell never opens its NOTE: Excel shows a note while the
      // pointer rests on the cell and edits it only through Edit Note,
      // Shift+F2 or the shortcut menu, so the grid stays in Ready mode. A
      // threaded comment's card still follows the selection -- once a mouse
      // press is released on the cell (useSpreadsheetCellRangeDrag onCellPress): opened on the
      // press, it lay over the next cells and a drag from the cell selected
      
      const pressed = Boolean(gridEventSnapshot.cellRangeDragRef.current);
      if (hasThread(cell?.comment) && !pressed) {
        gridEventSnapshot.setCommentEditorKind("thread");
      }
      if (gridEventSnapshot.commentReturnFocusRef.current !== event.currentTarget) gridEventSnapshot.setCommentOpen(hasThread(cell?.comment) && !pressed);
      // A focus/click is selection, not edit mode. Keep
      // the hidden input selected so a typed character
      // still replaces the cell like Excel's Enter mode.
      if (!editing) selectSpreadsheetCellEntryText(event.currentTarget);
    };
  },
  change(gridEventBridge: RefObject<SpreadsheetGridEventScope>, editing: boolean, row: number, col: number): NonNullable<ComponentProps<typeof SpreadsheetDraftInput>["onChange"]> {
    return (event) => { const gridEventSnapshot = gridEventBridge.current;
      if (!editing) {
        gridEventSnapshot.beginCellEditing(
          row,
          col,
          event.currentTarget,
        );
      }
      gridEventSnapshot.commitTypedCellInput(event.currentTarget, row, col);
    };
  },
  exit(gridEventBridge: RefObject<SpreadsheetGridEventScope>, row: number, col: number): NonNullable<ComponentProps<typeof SpreadsheetDraftInput>["onDraftExit"]> {
    return request => { const gridEventSnapshot = gridEventBridge.current; return gridEventSnapshot.commitPlainCellDraftExit(request, row, col); };
  },
  draftKeyDown(gridEventBridge: RefObject<SpreadsheetGridEventScope>, row: number, col: number): NonNullable<ComponentProps<typeof SpreadsheetDraftInput>["onDraftKeyDown"]> {
    return (event) => { const gridEventSnapshot = gridEventBridge.current;
      gridEventSnapshot.handleCellKeyDown(event, row, col, true);
      return event.defaultPrevented;
    };
  },
  keyDown(gridEventBridge: RefObject<SpreadsheetGridEventScope>, row: number, col: number): NonNullable<ComponentProps<typeof SpreadsheetDraftInput>["onKeyDown"]> {
    return (event) =>
    { const gridEventSnapshot = gridEventBridge.current; return gridEventSnapshot.handleCellKeyDown(event, row, col); };
  },
  keyUp(gridEventBridge: RefObject<SpreadsheetGridEventScope>, editing: boolean, row: number, col: number): NonNullable<ComponentProps<typeof SpreadsheetDraftInput>["onKeyUp"]> {
    return (event) => {
      // Caret moved via Arrow/Home/End (not consumed by the dropdown): keep
      // the hint in sync with the caret. Only those keys, as in the formula
      // bar: the keyup of Esc must not reopen the list Esc has just closed,
      // and a typed character already refreshed it through the draft change.
      if (!editing || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return undefined;
      const gridEventSnapshot = gridEventBridge.current;
      return gridEventSnapshot.refreshFormulaIntel(
        event.currentTarget,
        row,
        col,
      );
    };
  },
  click(gridEventBridge: RefObject<SpreadsheetGridEventScope>, editing: boolean, row: number, col: number): NonNullable<ComponentProps<typeof SpreadsheetDraftInput>["onClick"]> {
    return (event) => { const gridEventSnapshot = gridEventBridge.current;
      if (!editing) {
        // select() focuses the input it is called on. A Shift+click is an
        // EXTENSION: the clicked cell is the selection's far end, not the
        // active cell, and pulling focus (and with it the active cell) over
        // there collapsed the range the user had just drawn.
        if (!event.shiftKey) selectSpreadsheetCellEntryText(event.currentTarget);
        gridEventSnapshot.setFormulaIntel(null);
        return;
      }
      // A click into the open entry places the caret in it: Excel is in Edit
      // mode from there on, and the arrows stay in the cell.
      gridEventSnapshot.setEditingCell((current) =>
        current && current.row === row && current.col === col && current.mode !== "edit"
          ? { ...current, mode: "edit" }
          : current,
      );
      gridEventSnapshot.refreshFormulaIntel(
        event.currentTarget,
        row,
        col,
      );
    };
  },
  pointerDown(gridEventBridge: RefObject<SpreadsheetGridEventScope>, row: number, col: number, editing: boolean): NonNullable<ComponentProps<typeof SpreadsheetDraftInput>["onPointerDown"]> {
    return (event) =>
    { const gridEventSnapshot = gridEventBridge.current; return gridEventSnapshot.beginCellRangeDrag(event, row, col, editing); };
  },
  doubleClick(gridEventBridge: RefObject<SpreadsheetGridEventScope>, row: number, col: number): NonNullable<ComponentProps<typeof SpreadsheetDraftInput>["onDoubleClick"]> {
    return (event) => { const gridEventSnapshot = gridEventBridge.current;
      event.stopPropagation();
      gridEventSnapshot.beginCellEditing(
        row,
        col,
        event.currentTarget,
        "edit",
      );
    };
  },
  blur(gridEventBridge: RefObject<SpreadsheetGridEventScope>, row: number, col: number, cell: SheetModel["cells"][string] | undefined, editing: boolean): NonNullable<ComponentProps<typeof SpreadsheetDraftInput>["onBlur"]> {
    return (event) => { const gridEventSnapshot = gridEventBridge.current;
      const receipt = gridEventSnapshot.plainDraftExitReceiptRef.current;
      const committedExit = receipt?.input === event.currentTarget &&
        receipt.pageId === gridEventSnapshot.pageId && receipt.loadEpoch === gridEventSnapshot.cellDraftLoadEpochRef.current &&
        receipt.sourceSheet === gridEventSnapshot.sheet && receipt.sourceWorkbook === gridEventSnapshot.sheets &&
        receipt.row === row && receipt.col === col &&
        receipt.sourceIdentity === spreadsheetDraftSource(cell, gridEventSnapshot.referenceStyle) &&
        receipt.committedWorkbook === gridEventSnapshot.liveSheetsRef.current;
      if (editing) {
        if (!committedExit) gridEventSnapshot.commitValidation(row, col);
        gridEventSnapshot.setEditingCell((current) =>
          current?.sheetId === gridEventSnapshot.sheet.id &&
          current.row === row &&
          current.col === col
            ? null
            : current,
        );
      }
      gridEventSnapshot.setSheetViewEditingOrder((current) =>
        current?.sheetId === gridEventSnapshot.sheet.id &&
        current.sourceRow === row
          ? null
          : current,
      );
      // Drop any in-column autocomplete state so a stale
      // prefix can't leak into the next cell edited.
      gridEventSnapshot.autocompleteRef.current = null;
      // Close on blur, but defer so a mousedown on a
      // suggestion (which blurs first) can still fire.
      window.setTimeout(
        () => gridEventSnapshot.setFormulaIntel(null),
        120,
      );
    };
  },
  paste(gridEventBridge: RefObject<SpreadsheetGridEventScope>, row: number, col: number): NonNullable<ComponentProps<typeof SpreadsheetDraftInput>["onPaste"]> {
    return (event) =>
    { const gridEventSnapshot = gridEventBridge.current; return gridEventSnapshot.commandRegistryRef.current.dispatch(
      "pasteIntoCell",
      { event, row, col },
    ); };
  },
  // The host's native Copy / Cut (an Edit menu, a context menu, a device
  // without the chord) copies the grid's selection as the keyboard chord
  // does; in-cell text editing keeps its native copy (B517: the native copy
  // took the active cell's text alone).
  copy(gridEventBridge: RefObject<SpreadsheetGridEventScope>): NonNullable<ComponentProps<typeof SpreadsheetDraftInput>["onCopy"]> {
    return (event) =>
    { const gridEventSnapshot = gridEventBridge.current; return gridEventSnapshot.commandRegistryRef.current.dispatch(
      "copySelection",
      event,
    ); };
  },
  cut(gridEventBridge: RefObject<SpreadsheetGridEventScope>): NonNullable<ComponentProps<typeof SpreadsheetDraftInput>["onCut"]> {
    return (event) =>
    { const gridEventSnapshot = gridEventBridge.current; return gridEventSnapshot.commandRegistryRef.current.dispatch(
      "cutSelection",
      event,
    ); };
  },
};

/**
 * The grid's event scope, registered on its table. A cell at rest (neither
 * the active nor the edited cell) is rendered without per-cell closures: its
 * handlers are the shared ones below, which find the scope from the table
 * the cell is in and the cell from its `data-cell`, at the time of the event.
 */
const spreadsheetGridEventScopes = new WeakMap<Element, RefObject<SpreadsheetGridEventScope>>();
export function registerSpreadsheetGridEventScope(
  table: Element | null,
  gridEventBridge: RefObject<SpreadsheetGridEventScope>,
): () => void {
  if (!table) return () => undefined;
  spreadsheetGridEventScopes.set(table, gridEventBridge);
  // Gone with its grid, as the cell materializer is (spreadsheetCellLookup).
  return () => {
    if (spreadsheetGridEventScopes.get(table) === gridEventBridge) spreadsheetGridEventScopes.delete(table);
  };
}
function inertCellTarget(target: EventTarget | null): { bridge: RefObject<SpreadsheetGridEventScope>; row: number; col: number; key: string; input: HTMLElement } | null {
  if (!(target instanceof HTMLElement)) return null;
  const key = target.getAttribute("data-cell");
  const table = key ? target.closest('table[role="grid"]') : null;
  const bridge = table ? spreadsheetGridEventScopes.get(table) : undefined;
  if (!key || !bridge) return null;
  const split = key.indexOf(":");
  return { bridge, row: Number(key.slice(0, split)), col: Number(key.slice(split + 1)), key, input: target };
}
/** A cell at rest is never the edited cell. */
const INERT_EDITING = false;
/**
 * The handlers of a cell at rest: the same grid handlers its editor is given
 * when it is the active cell, bound to the cell the event lands on. A cell
 * at rest that receives the focus becomes the active cell, and from the
 * next render on it carries its own bound handlers again.
 */
export const spreadsheetInertCellHandlers = {
  focus: ((event) => {
    const cell = inertCellTarget(event.currentTarget);
    if (!cell) return;
    spreadsheetGridDraftHandlers.focus(cell.bridge, cell.row, cell.col, cell.bridge.current.sheet.cells[cell.key], INERT_EDITING)(event);
  }) as NonNullable<ComponentProps<typeof SpreadsheetDraftInput>["onFocus"]>,
  blur: ((event) => {
    const cell = inertCellTarget(event.currentTarget);
    if (!cell) return;
    spreadsheetGridDraftHandlers.blur(cell.bridge, cell.row, cell.col, cell.bridge.current.sheet.cells[cell.key], INERT_EDITING)(event);
  }) as NonNullable<ComponentProps<typeof SpreadsheetDraftInput>["onBlur"]>,
  change: ((event) => {
    const cell = inertCellTarget(event.currentTarget);
    if (!cell) return;
    spreadsheetGridDraftHandlers.change(cell.bridge, INERT_EDITING, cell.row, cell.col)(event);
  }) as NonNullable<ComponentProps<typeof SpreadsheetDraftInput>["onChange"]>,
  click: ((event) => {
    const cell = inertCellTarget(event.currentTarget);
    if (!cell) return;
    spreadsheetGridDraftHandlers.click(cell.bridge, INERT_EDITING, cell.row, cell.col)(event);
  }) as NonNullable<ComponentProps<typeof SpreadsheetDraftInput>["onClick"]>,
  pointerDown: ((event) => {
    const cell = inertCellTarget(event.currentTarget);
    if (!cell) return;
    spreadsheetGridDraftHandlers.pointerDown(cell.bridge, cell.row, cell.col, INERT_EDITING)(event);
  }) as NonNullable<ComponentProps<typeof SpreadsheetDraftInput>["onPointerDown"]>,
  doubleClick: ((event) => {
    const cell = inertCellTarget(event.currentTarget);
    if (!cell) return;
    spreadsheetGridDraftHandlers.doubleClick(cell.bridge, cell.row, cell.col)(event);
  }) as NonNullable<ComponentProps<typeof SpreadsheetDraftInput>["onDoubleClick"]>,
  keyDown: ((event) => {
    const cell = inertCellTarget(event.currentTarget);
    if (!cell) return;
    spreadsheetGridDraftHandlers.keyDown(cell.bridge, cell.row, cell.col)(event);
  }) as NonNullable<ComponentProps<typeof SpreadsheetDraftInput>["onKeyDown"]>,
  keyUp: ((event) => {
    const cell = inertCellTarget(event.currentTarget);
    if (!cell) return;
    spreadsheetGridDraftHandlers.keyUp(cell.bridge, INERT_EDITING, cell.row, cell.col)(event);
  }) as NonNullable<ComponentProps<typeof SpreadsheetDraftInput>["onKeyUp"]>,
  paste: ((event) => {
    const cell = inertCellTarget(event.currentTarget);
    if (!cell) return;
    spreadsheetGridDraftHandlers.paste(cell.bridge, cell.row, cell.col)(event);
  }) as NonNullable<ComponentProps<typeof SpreadsheetDraftInput>["onPaste"]>,
  copy: ((event) => {
    const cell = inertCellTarget(event.currentTarget);
    if (!cell) return;
    spreadsheetGridDraftHandlers.copy(cell.bridge)(event);
  }) as NonNullable<ComponentProps<typeof SpreadsheetDraftInput>["onCopy"]>,
  cut: ((event) => {
    const cell = inertCellTarget(event.currentTarget);
    if (!cell) return;
    spreadsheetGridDraftHandlers.cut(cell.bridge)(event);
  }) as NonNullable<ComponentProps<typeof SpreadsheetDraftInput>["onCut"]>,
  draftKeyDown: ((event) => {
    const cell = inertCellTarget(event.currentTarget);
    if (!cell) return false;
    return spreadsheetGridDraftHandlers.draftKeyDown(cell.bridge, cell.row, cell.col)(event);
  }) as NonNullable<ComponentProps<typeof SpreadsheetDraftInput>["onDraftKeyDown"]>,
  draftChange: ((event, previousValue, composing) => {
    const cell = inertCellTarget(event.currentTarget);
    if (!cell) return;
    // The rule's kind is all the handler reads; the cell carries it.
    const kind = cell.input.getAttribute("data-validation");
    spreadsheetGridDraftHandlers.draftChange(cell.bridge, cell.row, cell.col, INERT_EDITING,
      kind ? ({ kind } as Pick<ValidationRule, "kind">) : null)(event, previousValue, composing);
  }) as NonNullable<ComponentProps<typeof SpreadsheetDraftInput>["onDraftChange"]>,
  draftExit: ((request) => {
    const cell = inertCellTarget(request.event.currentTarget);
    if (!cell) return "fallback";
    return spreadsheetGridDraftHandlers.exit(cell.bridge, cell.row, cell.col)(request);
  }) as NonNullable<ComponentProps<typeof SpreadsheetDraftInput>["onDraftExit"]>,
  draftPublish: ((request) => {
    const cell = inertCellTarget(request.input);
    if (!cell) return undefined;
    return spreadsheetGridDraftHandlers.publish(cell.bridge, cell.row, cell.col)(request);
  }) as NonNullable<ComponentProps<typeof SpreadsheetDraftInput>["onDraftPublish"]>,
  draftDiscard: ((input) => {
    const cell = inertCellTarget(input);
    if (!cell) return;
    spreadsheetGridDraftHandlers.discard(cell.bridge, cell.row, cell.col)(input);
  }) as NonNullable<ComponentProps<typeof SpreadsheetDraftInput>["onDraftDiscard"]>,
};

export const spreadsheetGridControlHandlers = {
  nativeCheckboxPointerDown(gridEventBridge: RefObject<SpreadsheetGridEventScope>): NonNullable<ComponentProps<typeof SpreadsheetCellCheckbox>["onPointerDown"]> {
    return event => { const gridEventSnapshot = gridEventBridge.current; return event.stopPropagation(); };
  },
  nativeCheckboxChange(gridEventBridge: RefObject<SpreadsheetGridEventScope>, cellLocked: boolean, row: number, col: number): NonNullable<ComponentProps<typeof SpreadsheetCellCheckbox>["onChange"]> {
    return event => { const gridEventSnapshot = gridEventBridge.current; event.stopPropagation(); if (cellLocked) return;
    gridEventSnapshot.setActiveCell({ row, col }); gridEventSnapshot.setSelectionAnchor({ row, col }); gridEventSnapshot.toggleCheckboxAt(row, col); };
  },
  checkboxPointerDown(gridEventBridge: RefObject<SpreadsheetGridEventScope>): NonNullable<ComponentProps<"input">["onPointerDown"]> {
    return (event) => { const gridEventSnapshot = gridEventBridge.current;
      // Keep focus off the underlying text input so the
      // checkbox stays visible (the overlay hides when
      // the cell becomes active).
      event.stopPropagation();
    };
  },
  checkboxChange(gridEventBridge: RefObject<SpreadsheetGridEventScope>, cellLocked: boolean, row: number, col: number): NonNullable<ComponentProps<"input">["onChange"]> {
    return (event) => { const gridEventSnapshot = gridEventBridge.current;
      event.stopPropagation();
      if (cellLocked) return;
      gridEventSnapshot.setActiveCell({ row, col });
      gridEventSnapshot.setSelectionAnchor({ row, col });
      gridEventSnapshot.toggleCheckboxAt(row, col);
    };
  },
  radioPointerDown(gridEventBridge: RefObject<SpreadsheetGridEventScope>): NonNullable<ComponentProps<"input">["onPointerDown"]> {
    return (event) => { const gridEventSnapshot = gridEventBridge.current;
      event.stopPropagation();
    };
  },
  radioClick(gridEventBridge: RefObject<SpreadsheetGridEventScope>, cellLocked: boolean, row: number, col: number, cell: SheetModel["cells"][string] | undefined): NonNullable<ComponentProps<"input">["onClick"]> {
    return (event) => { const gridEventSnapshot = gridEventBridge.current;
      // A radio fires no onChange when re-clicked while
      // already checked, so toggle on click (select <->
      // deselect) to support the value-bound boolean.
      event.stopPropagation();
      if (cellLocked) return;
      gridEventSnapshot.setActiveCell({ row, col });
      gridEventSnapshot.setSelectionAnchor({ row, col });
      gridEventSnapshot.setControlValueAt(
        row,
        col,
        radioValue(!isRadioSelected(cell?.value)),
      );
    };
  },
  spinnerPointerDown(gridEventBridge: RefObject<SpreadsheetGridEventScope>): NonNullable<ComponentProps<"input">["onPointerDown"]> {
    return (event) => { const gridEventSnapshot = gridEventBridge.current;
      event.stopPropagation();
    };
  },
  spinnerChange(gridEventBridge: RefObject<SpreadsheetGridEventScope>, cellLocked: boolean, row: number, col: number): NonNullable<ComponentProps<"input">["onChange"]> {
    return (event) => { const gridEventSnapshot = gridEventBridge.current;
      event.stopPropagation();
      if (cellLocked) return;
      gridEventSnapshot.setActiveCell({ row, col });
      gridEventSnapshot.setSelectionAnchor({ row, col });
      gridEventSnapshot.setControlValueAt(
        row,
        col,
        spinnerValue(event.target.value),
      );
    };
  },
  sliderPointerDown(gridEventBridge: RefObject<SpreadsheetGridEventScope>): NonNullable<ComponentProps<"input">["onPointerDown"]> {
    return (event) => { const gridEventSnapshot = gridEventBridge.current;
      event.stopPropagation();
    };
  },
  sliderChange(gridEventBridge: RefObject<SpreadsheetGridEventScope>, cellLocked: boolean, row: number, col: number): NonNullable<ComponentProps<"input">["onChange"]> {
    return (event) => { const gridEventSnapshot = gridEventBridge.current;
      event.stopPropagation();
      if (cellLocked) return;
      gridEventSnapshot.setActiveCell({ row, col });
      gridEventSnapshot.setSelectionAnchor({ row, col });
      gridEventSnapshot.setControlValueAt(
        row,
        col,
        sliderValue(event.target.value),
      );
    };
  },
};

export const spreadsheetGridAuxHandlers = {
  contextMenu(gridEventBridge: RefObject<SpreadsheetGridEventScope>, row: number, col: number): NonNullable<ComponentProps<"td">["onContextMenu"]> {
    return (event) =>
    { const gridEventSnapshot = gridEventBridge.current; return gridEventSnapshot.openContextMenu(event, "cell", row, col); };
  },
  pickerPointerDown(gridEventBridge: RefObject<SpreadsheetGridEventScope>): NonNullable<ComponentProps<"button">["onPointerDown"]> {
    return (event) => { const gridEventSnapshot = gridEventBridge.current;
      // pointerDown (not click) so the click-away handler
      // doesn't immediately re-close a just-opened picker.
      event.preventDefault();
      event.stopPropagation();
    };
  },
  pickerClick(gridEventBridge: RefObject<SpreadsheetGridEventScope>, row: number, col: number): NonNullable<ComponentProps<"button">["onClick"]> {
    return (event) => { const gridEventSnapshot = gridEventBridge.current;
      event.preventDefault();
      event.stopPropagation();
      gridEventSnapshot.setCommentsPaneOpen(false);
      gridEventSnapshot.setChartFormatPaneOpen(false);
      gridEventSnapshot.setActiveCell({ row, col });
      gridEventSnapshot.setSelectionAnchor({ row, col });
      gridEventSnapshot.setListPicker((prev) =>
        prev && prev.row === row && prev.col === col
          ? null
          : { row, col },
      );
    };
  },
  validationOptionPick(gridEventBridge: RefObject<SpreadsheetGridEventScope>, row: number, col: number): (option: string) => void {
    return (option) => { const gridEventSnapshot = gridEventBridge.current;
      // The picker only offers ALLOWED values, so the
      // pick is valid by construction — write it through
      // setCellValue (undo + autosave + protection) and
      // advance the validation baseline so a later edit
      // reverts to it. No commit-validate needed (and a
      // synchronous one would read the pre-write sheet).
      gridEventSnapshot.setActiveCell({ row, col });
      gridEventSnapshot.editStartRef.current = {
        key: `${row}:${col}`,
        value: option,
      };
      gridEventSnapshot.setCellValue(row, col, option);
      gridEventSnapshot.setListPicker(null);
    };
  },
  listPickerClose(gridEventBridge: RefObject<SpreadsheetGridEventScope>): () => void {
    return () => gridEventBridge.current.setListPicker(null);
  },
  pickListOptionPick(gridEventBridge: RefObject<SpreadsheetGridEventScope>, row: number, col: number): (option: string) => void {
    return (option) => { const gridEventSnapshot = gridEventBridge.current;
      // The value already in the column keeps what it is: text "=1+1" is
      // picked as that text, not entered as a formula (live audit B251).
      const entry = gridEventSnapshot.pickListEntryFor(row, col, option);
      gridEventSnapshot.setActiveCell({ row, col });
      gridEventSnapshot.editStartRef.current = {
        key: `${row}:${col}`,
        value: entry,
      };
      gridEventSnapshot.setCellValue(row, col, entry);
      gridEventSnapshot.setPickFromList(null);
    };
  },
  pickListClose(gridEventBridge: RefObject<SpreadsheetGridEventScope>): () => void {
    return () => gridEventBridge.current.setPickFromList(null);
  },
  externalLinkClick(gridEventBridge: RefObject<SpreadsheetGridEventScope>): NonNullable<ComponentProps<"a">["onClick"]> {
    return (event) => { const gridEventSnapshot = gridEventBridge.current; return event.stopPropagation(); };
  },
  internalLinkClick(gridEventBridge: RefObject<SpreadsheetGridEventScope>, cellInternalLink: string): NonNullable<ComponentProps<"button">["onClick"]> {
    return (event) => { const gridEventSnapshot = gridEventBridge.current;
      event.stopPropagation();
      gridEventSnapshot.navigateInternalLink(cellInternalLink);
    };
  },
  commentClick(gridEventBridge: RefObject<SpreadsheetGridEventScope>, row: number, col: number, cell: SheetModel["cells"][string] | undefined): NonNullable<ComponentProps<"button">["onClick"]> {
    return (event) => { const gridEventSnapshot = gridEventBridge.current;
      event.stopPropagation();
      // The comment's cell becomes the selection, as a click on the cell
      // does: moving the active cell alone left the anchor where it was and
      // selected the rectangle between them (live audit S-133).
      gridEventSnapshot.setActiveCell({ row, col });
      gridEventSnapshot.setSelectionAnchor({ row, col });
      gridEventSnapshot.setSelectedObjectId(null);
      if (isNoteComment(cell?.comment)) return;
      gridEventSnapshot.setCommentEditorKind("thread");
      gridEventSnapshot.setCommentOpen(true);
    };
  },
};

// Following a link from its cell (Excel: "Click once to follow a hyperlink;
// click and hold until the pointer becomes a cross to select the cell without
// following it"). A plain primary click on the link's TEXT follows it; a press
// held past SPREADSHEET_LINK_HOLD_MS, a drag, a modified or touch press, a click
// in the empty rest of the cell and every keyboard route only select. The
// follow waits one double-click interval so a double-click still edits the
// cell, and any key or press in that interval cancels it (F2 right after the
// click edits instead). One pointer means one press, so the state is shared.
const SPREADSHEET_LINK_HOLD_MS = 500;
const SPREADSHEET_LINK_FOLLOW_DELAY_MS = 300;
const SPREADSHEET_LINK_DRAG_SLOP_PX = 4;

interface SpreadsheetLinkPress {
  input: HTMLInputElement;
  /** The cell pressed: a cell at rest gives way to its input on the press,
   * so the click lands on another node of the same cell. */
  key: string | null;
  followable: boolean;
  release: () => void;
}

let spreadsheetLinkPress: SpreadsheetLinkPress | null = null;
let cancelSpreadsheetLinkFollow: (() => void) | null = null;

/**
 * Whether (x, y) is over the text a link cell shows: Excel follows a link from
 * its text, and a click in the rest of the cell only selects it. The plain
 * display layer's text box is measured; a cell drawn any other way (spilled,
 * wrapped, rich text), or a layout that cannot be measured, counts as text.
 */
function isOverSpreadsheetLinkText(cell: Element, x: number, y: number): boolean {
  // A note's corner mark lets the click through to the cell (it is only a
  // mark), but a press on it is meant for the note, never for the cell's
  // link (live audit S-099: clicking the mark also opened the link).
  const mark = cell.querySelector('[data-testid="spreadsheet-comment-indicator"]');
  if (mark) {
    const corner = mark.getBoundingClientRect();
    if (
      corner.width > 0 &&
      x >= corner.left &&
      x <= corner.right &&
      y >= corner.top &&
      y <= corner.bottom
    ) {
      return false;
    }
  }
  const text = cell.querySelector(
    ".spreadsheet-window__cell-display-layer > span",
  );
  if (!text) return true;
  const box = text.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) return true;
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
}

function spreadsheetLinkCellInput(target: EventTarget | null): HTMLInputElement | null {
  // The cell's input, its text area (a cell that wraps or holds line
  // breaks) or, at rest, its resting element.
  return target instanceof HTMLElement && target.matches('[data-testid="spreadsheet-cell"][data-cell]')
    ? (target as HTMLInputElement)
    : null;
}

export const spreadsheetGridLinkHandlers = {
  pointerDown(): NonNullable<ComponentProps<"td">["onPointerDown"]> {
    return (event) => {
      spreadsheetLinkPress?.release();
      spreadsheetLinkPress = null;
      const input = spreadsheetLinkCellInput(event.target);
      if (
        !input ||
        event.button !== 0 ||
        event.pointerType === "touch" ||
        event.shiftKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        // An armed Format Painter owns the click: it paints the link cell.
        input.closest("[data-format-painter]") ||
        !isOverSpreadsheetLinkText(event.currentTarget, event.clientX, event.clientY)
      ) {
        return;
      }
      const { pointerId, clientX: startX, clientY: startY } = event;
      const press: SpreadsheetLinkPress = { input, key: input.getAttribute("data-cell"), followable: true, release: () => {} };
      // Held long enough, the press selects: the pointer turns to the cell
      // cross, as Excel's does.
      const hold = window.setTimeout(() => {
        press.followable = false;
        input.style.cursor = "cell";
      }, SPREADSHEET_LINK_HOLD_MS);
      const onMove = (move: PointerEvent) => {
        if (
          move.pointerId === pointerId &&
          Math.hypot(move.clientX - startX, move.clientY - startY) >
            SPREADSHEET_LINK_DRAG_SLOP_PX
        ) {
          press.followable = false;
        }
      };
      const onUp = (up: PointerEvent) => {
        if (up.pointerId !== pointerId) return;
        if (up.type === "pointercancel") press.followable = false;
        press.release();
        // The click, when there is one, is dispatched right after this
        // release; a press that ends anywhere else is forgotten.
        window.setTimeout(() => {
          if (spreadsheetLinkPress === press) spreadsheetLinkPress = null;
        }, 0);
      };
      press.release = () => {
        window.clearTimeout(hold);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
      spreadsheetLinkPress = press;
    };
  },
  click(
    gridEventBridge: RefObject<SpreadsheetGridEventScope>,
    link: { href: string } | { internal: string },
  ): NonNullable<ComponentProps<"td">["onClick"]> {
    return (event) => {
      const press = spreadsheetLinkPress;
      spreadsheetLinkPress = null;
      press?.release();
      if (
        !press ||
        !press.followable ||
        // The click on the cell pressed: its node, the node that took its
        // place, or the table cell itself (a click whose press target was
        // replaced lands on the nearest ancestor both share).
        !(press.input === event.target ||
          (press.key !== null && (event.target === event.currentTarget ||
            spreadsheetLinkCellInput(event.target)?.getAttribute("data-cell") === press.key) &&
            event.currentTarget.querySelector('[data-testid="spreadsheet-cell"][data-cell]')?.getAttribute("data-cell") === press.key)) ||
        // The second click of a double-click edits the cell (the first one's
        // follow was already cancelled by this click's press).
        event.detail > 1
      ) {
        return;
      }
      cancelSpreadsheetLinkFollow?.();
      const cancel = () => {
        window.clearTimeout(timer);
        window.removeEventListener("pointerdown", cancel, true);
        window.removeEventListener("keydown", cancel, true);
        if (cancelSpreadsheetLinkFollow === cancel) cancelSpreadsheetLinkFollow = null;
      };
      const timer = window.setTimeout(() => {
        cancel();
        if ("internal" in link) {
          gridEventBridge.current.navigateInternalLink(link.internal);
        } else {
          window.open(link.href, "_blank", "noopener,noreferrer");
        }
      }, SPREADSHEET_LINK_FOLLOW_DELAY_MS);
      window.addEventListener("pointerdown", cancel, true);
      window.addEventListener("keydown", cancel, true);
      cancelSpreadsheetLinkFollow = cancel;
    };
  },
  // Excel's pointer is a hand over a link's text and the cell cross elsewhere.
  pointerMove(): NonNullable<ComponentProps<"td">["onPointerMove"]> {
    return (event) => {
      const input = spreadsheetLinkCellInput(event.target);
      if (!input || spreadsheetLinkPress?.input === input) return;
      input.style.cursor =
        event.pointerType !== "touch" &&
        !input.closest("[data-format-painter]") &&
        isOverSpreadsheetLinkText(event.currentTarget, event.clientX, event.clientY)
          ? "pointer"
          : "cell";
    };
  },
  pointerLeave(): NonNullable<ComponentProps<"td">["onPointerLeave"]> {
    return (event) => {
      const input =
        event.currentTarget.querySelector<HTMLInputElement>('[data-testid="spreadsheet-cell"][data-cell]');
      if (input?.style.cursor === "pointer") input.style.cursor = "cell";
    };
  },
};

export const spreadsheetGridFillHandlers = {
  pointerDown(gridEventBridge: RefObject<SpreadsheetGridEventScope>): NonNullable<ComponentProps<"span">["onPointerDown"]> {
    return (...args: Parameters<SpreadsheetGridEventScope["beginFillDrag"]>) => { const gridEventSnapshot = gridEventBridge.current; return gridEventSnapshot.beginFillDrag(...args); };
  },
  doubleClick(gridEventBridge: RefObject<SpreadsheetGridEventScope>): NonNullable<ComponentProps<"span">["onDoubleClick"]> {
    return (...args: Parameters<SpreadsheetGridEventScope["autoFillDownFromHandle"]>) => { const gridEventSnapshot = gridEventBridge.current; return gridEventSnapshot.autoFillDownFromHandle(...args); };
  },
};
