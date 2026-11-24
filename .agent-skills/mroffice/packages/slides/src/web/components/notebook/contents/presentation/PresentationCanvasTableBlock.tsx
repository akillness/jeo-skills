"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * One table block as the edit canvas draws it (cells, borders, gesture
 * handles).
 *
 * Extracted verbatim from the render of
 * `components/notebook/contents/PresentationWindow.tsx`: the JSX is unchanged;
 * the window passes the bindings it used to close over as `ctl`, and the render
 * condition and key stay at the call site. No hooks run here, so the window's
 * hook order is unchanged.
 */

import presentationChrome from "@mrnote/core/web/lib/presentation/presentation-window-shell.module.css";
import { hasLayoutGeometry } from "@mrnote/core/web/lib/presentation-object-buttons.ts";
import type { PresentationTableBlock, PresentationBlock } from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import {
  Plus,
  Trash2,
  TableCellsMerge,
  TableCellsSplit,
  Move,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { tableLogicalWidth } from "@mrnote/core/web/lib/presentation-table-merge.ts";
import { PresentationTableShadowFrame } from "./PresentationTableShadowFrame";
import {
  tableLayoutStyle,
  tableDirectionProps,
  TableColgroup,
  tableRowHeightStyles,
  tableCellRenderFrame,
  tableCellTdStyle,
  TableCellCompoundEdges,
  tableCellStatedHeightPx,
  tableCellVisualTextStyle,
} from "../../../../lib/presentation/table-canvas-layout";
import { tableCellIntersectsSelection, type TableSelectionScope } from "@mrnote/core/web/lib/presentation-table-selection.ts";
import { normalizeCellStyle, type CellStyleInput } from "@mrnote/core/web/lib/presentation-table-style.ts";
import {
  presentationTableCellParagraphStyles,
  presentationTableCellTrailingParagraphStyle,
} from "../../../../lib/presentation/table-cell-paragraphs";
import { PresentationTypingCellEditor } from "./PresentationTypingCellEditor";
import { OfficeTableTouchGrips } from "@mrnote/core/web/components/office-ribbon/OfficeTableTouchGrips.tsx";
import { canManipulateBlock, isTextEditLocked } from "@mrnote/core/web/lib/presentation-text-case.ts";
import { tableTabTarget, tableArrowTarget, type TableArrowKey } from "../../../../lib/presentation-table-keyboard";
import {
  tableBorderEdgeKey,
  type TableBorderCellBox,
  type TableBorderEdgeHit,
  type TableBorderPenSplit,
} from "../../../../lib/presentation-table-border-pen";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { memo, useLayoutEffect, useMemo, useRef } from "react";
import { usePresentationMergedRowHeights } from "./usePresentationMergedRowHeights";
import type {
  CSSProperties,
  Dispatch,
  PointerEvent,
  RefObject,
  SetStateAction,
} from "react";
import type { PresentationCellTextEdit, PresentationCellTextElement } from "@mrnote/core/web/components/notebook/contents/PresentationCellRichTextEditor.tsx";
import type { TextRun, ToggleableRunStyleKey } from "@mrnote/core/web/lib/presentation-runs.ts";
import type { embeddedPresentationAutosave } from "../../../../lib/presentation-embedded-session";
import type { SlideModel } from "@mrnote/core/web/lib/presentation/deck-model.ts";
import type { ResizeHandle } from "@mrnote/core/web/lib/presentation-drag.ts";
import { useOfficeDataVersion } from "@mrnote/core/web/lib/office-data/use-office-data.ts";

/** The window bindings this tab reads, passed through unchanged. */
export interface PresentationCanvasTableBlockCtl {
  pageId: string;
  guestMode: boolean;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  tableCellFocus: { blockId: string; row: number; col: number; } | null;
  setTableCellFocus: Dispatch<SetStateAction<{ blockId: string; row: number; col: number; } | null>>;
  tableSelectionAnchor: { blockId: string; row: number; col: number; } | null;
  setTableSelectionAnchor: Dispatch<SetStateAction<{ blockId: string; row: number; col: number; } | null>>;
  tableSelectionScope: TableSelectionScope;
  setTableSelectionScope: Dispatch<SetStateAction<TableSelectionScope>>;
  tableGridlinesVisible: boolean;
  tableCellInputRefs: RefObject<Map<string, PresentationCellTextElement>>;
  setTableCharacterSelectionVersion: Dispatch<SetStateAction<number>>;
  restoringTableScopeFocusRef: RefObject<boolean>;
  pendingTableKeyboardFocusRef: RefObject<{ blockId: string; row: number; col: number; } | null>;
  tableBorderPenMode: "draw" | "erase" | null;
  tableBorderPenHover: TableBorderEdgeHit | null;
  setTableBorderPenHover: Dispatch<SetStateAction<TableBorderEdgeHit | null>>;
  tableBorderPenStroke: TableBorderEdgeHit[];
  setTableBorderPenStroke: Dispatch<SetStateAction<TableBorderEdgeHit[]>>;
  tableBorderPenStrokeRef: RefObject<TableBorderEdgeHit[]>;
  tableBorderPenOverlayRef: RefObject<HTMLDivElement | null>;
  tableBorderPenSplitOriginRef: RefObject<{ box: TableBorderCellBox; from: { x: number; y: number; }; crossed?: TableBorderCellBox[]; measured?: TableBorderCellBox[]; } | null>;
  tableBorderPenSplitRef: RefObject<TableBorderPenSplit | null>;
  tableBorderPenSplit: TableBorderPenSplit | null;
  setTableBorderPenSplit: Dispatch<SetStateAction<TableBorderPenSplit | null>>;
  tableShiftSelectRef: RefObject<boolean>;
  textSelectionIntentRef: RefObject<number>;
  tableHomeFormatRef: RefObject<{ apply: (patch: Partial<CellStyleInput>) => boolean; toggle: (key: ToggleableRunStyleKey) => boolean; step: (direction: 1 | -1) => boolean; } | null>;
  tableAxisPreview: { blockId: string; axis: "col" | "row"; index: number; size: number; } | null;
  autosave: ReturnType<typeof embeddedPresentationAutosave>;
  activeSlide: SlideModel;
  contextualTableBlock: PresentationTableBlock | null;
  tableFormattingSelection: { row1: number; row2: number; col1: number; col2: number; blockId: string; positions: ({ row: number; col: number; } | null)[][]; } | null;
  replaceBlock: (blockId: string, nextBlock: PresentationBlock) => void;
  deleteBlock: (blockId: string) => void;
  beginBlockGesture: (blockId: string, handle: ResizeHandle | "move", event: PointerEvent, scope?: "member" | "group") => void;
  updateTableCell: (blockId: string, rowIndex: number, cellIndex: number, text: string, runs?: TextRun[], caretAfter?: number,
    edit?: PresentationCellTextEdit) => void;
  copyTableSelectionToClipboard: (blockId: string, clipboard: DataTransfer) => boolean;
  cutTableSelectionToClipboard: (blockId: string, clipboard: DataTransfer) => boolean;
  clearSelectedTableContents: (blockId: string) => boolean;
  pasteTableClipboard: (blockId: string, rowIndex: number, cellIndex: number, clipboard: DataTransfer) => boolean;
  appendTableRowToBlock: (blockId: string) => void;
  appendTableColumnToBlock: (blockId: string) => void;
  deleteLastTableRowFromBlock: (blockId: string) => void;
  deleteLastTableColumnFromBlock: (blockId: string) => void;
  insertTableRowAtBoundary: (blockId: string, atRow: number) => void;
  insertTableColumnAtBoundary: (blockId: string, atColumn: number) => void;
  selectTableScope: (blockId: string, scope: TableSelectionScope, requestedFocus?: { row: number; col: number; }, extendSelection?: boolean) => void;
  mergeTableSelection: () => void;
  splitTableCell: () => void;
  tableSelectionCanMerge: boolean;
  tableFocusCanSplit: boolean;
  beginTableBorderPenStroke: (event: PointerEvent<HTMLDivElement>) => void;
  extendTableBorderPenStroke: (event: PointerEvent<HTMLDivElement>) => void;
  commitTableBorderPenStroke: (blockId: string) => void;
  beginTableAxisResize: (blockId: string, axis: "col" | "row", index: number, event: PointerEvent) => void;
  block: PresentationTableBlock;
  showHandles: boolean;
  displayedTableBlock: PresentationTableBlock | null;
  tableCellPositions: ({ row: number; col: number; } | null)[][] | null;
  tableColumnCount: number;
}

type PresentationTableCellModel = PresentationTableBlock["rows"][number][number];

interface PresentationCanvasTableCellProps {
  /** The table's controls as of its latest render: a cell that did not draw
   * again reads them here when it is used, never from the render it last drew
   * in (that render's table may lack a later keystroke). */
  live: { readonly current: PresentationCanvasTableBlockCtl };
  blockId: string;
  cell: PresentationTableCellModel;
  rowIndex: number;
  cellIndex: number;
  cellTag: "th" | "td";
  tdStyle: CSSProperties | undefined;
  textStyle: CSSProperties;
  isFocusedCell: boolean;
  isSelectedCell: boolean;
  logicalRowIndex: number;
  logicalColumnIndex: number;
  columnBoundaryIndex: number;
  rowBoundaryIndex: number;
  showColumnBoundary: boolean;
  showRowBoundary: boolean;
  showColumnSelector: boolean;
  showRowSelector: boolean;
  showTableSelector: boolean;
  tableColumnCount: number;
  rowCount: number;
  selectorScope: TableSelectionScope | null;
  columnBoundaryActive: boolean;
  rowBoundaryActive: boolean;
  readOnly: boolean;
  editorKey: string;
  /** Its table draws a cell's empty last paragraph as a line (readings row 1004). */
  trailingParagraphLines: boolean;
  t: PresentationCanvasTableBlockCtl["t"];
}

/** Focus a cell's words with all of them selected (an empty cell: the caret). */
function selectWholeCellText(element: HTMLElement | null | undefined): void {
  if (!element) return;
  element.focus();
  const selectAll = () => {
    if (element.ownerDocument.activeElement !== element) return;
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
      element.setSelectionRange(0, element.value.length);
      return;
    }
    const selection = element.ownerDocument.defaultView?.getSelection();
    if (!selection) return;
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
  };
  selectAll();
  // The cell's editor puts back the range it kept when it is focused, after
  // the focus (a microtask): the whole text is selected after it.
  queueMicrotask(selectAll);
}

/** Two style objects that set the same properties to the same values. */
function sameStyle(a: CSSProperties | undefined, b: CSSProperties | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = Object.keys(a) as (keyof CSSProperties)[];
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => a[key] === b[key]);
}

function sameCellProps(a: PresentationCanvasTableCellProps, b: PresentationCanvasTableCellProps): boolean {
  for (const key of Object.keys(a) as (keyof PresentationCanvasTableCellProps)[]) {
    if (a[key] === b[key]) continue;
    if ((key === "tdStyle" || key === "textStyle") && sameStyle(a[key], b[key])) continue;
    return false;
  }
  return Object.keys(a).length === Object.keys(b).length;
}








const PresentationCanvasTableCell = memo(function PresentationCanvasTableCell({
  live,
  blockId,
  cell,
  rowIndex,
  cellIndex,
  cellTag,
  tdStyle,
  textStyle,
  isFocusedCell,
  isSelectedCell,
  logicalRowIndex,
  logicalColumnIndex,
  columnBoundaryIndex,
  rowBoundaryIndex,
  showColumnBoundary,
  showRowBoundary,
  showColumnSelector,
  showRowSelector,
  showTableSelector,
  tableColumnCount,
  rowCount,
  selectorScope,
  columnBoundaryActive,
  rowBoundaryActive,
  readOnly,
  editorKey,
  trailingParagraphLines,
  t,
}: PresentationCanvasTableCellProps) {
  const L = () => live.current;
  const cellStyle = normalizeCellStyle(cell);
  const CellTag = cellTag;
  return (
  <CellTag
    scope={CellTag === "th" ? "col" : undefined}
    colSpan={cell.colspan}
    rowSpan={cell.rowspan}
    style={{
      ...tdStyle,
      ...(isSelectedCell
        ? {
            boxShadow:
              "inset 0 0 0 2px rgba(15, 108, 189, 0.78)",
          }
        : {}),
      ...(showColumnBoundary ||
      showRowBoundary ||
      showColumnSelector ||
      showRowSelector
        ? { position: "relative" }
        : {}),
    }}
    data-focused={
      isFocusedCell ? "true" : undefined
    }
    data-selected={
      isSelectedCell ? "true" : undefined
    }
    // Source-array coordinates on the `<td>`
    // itself: the border pen measures these
    // boxes to hit-test individual cell edges.
    data-table-cell-row={rowIndex}
    data-table-cell-col={cellIndex}
  >
    <TableCellCompoundEdges tdStyle={tdStyle} />
    {showColumnSelector ? (
      <button
        type="button"
        className={
          presentationChrome.tableColumnSelector
        }
        data-testid="presentation-table-column-selector"
        data-table-axis-index={
          logicalColumnIndex
        }
        data-active={
          selectorScope === "column" &&
          isSelectedCell
            ? "true"
            : undefined
        }
        aria-label={t("presentation.ui.table.selectColumn", {
          index: logicalColumnIndex + 1,
        })}
        title={t("presentation.ui.table.selectColumn", {
          index: logicalColumnIndex + 1,
        })}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          L().selectTableScope(
            blockId,
            "column",
            {
              row: rowIndex,
              col: cellIndex,
            },
            event.shiftKey,
          );
        }}
      />
    ) : null}
    {showColumnSelector &&
    columnBoundaryIndex + 1 <
      tableColumnCount ? (
      <button
        type="button"
        className={`${presentationChrome.tableAxisInsert} ${presentationChrome.tableColumnInsert}`}
        data-testid="presentation-table-insert-column-boundary"
        data-table-axis-index={
          columnBoundaryIndex + 1
        }
        aria-label={t("presentation.ui.table.insertColumnAfter", {
          index: columnBoundaryIndex + 1,
        })}
        title={t("presentation.ui.table.insertColumn")}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          L().insertTableColumnAtBoundary(
            blockId,
            columnBoundaryIndex + 1,
          );
        }}
      >
        <Plus size={12} aria-hidden="true" />
      </button>
    ) : null}
    {showRowSelector ? (
      <button
        type="button"
        className={
          presentationChrome.tableRowSelector
        }
        data-testid="presentation-table-row-selector"
        data-table-axis-index={logicalRowIndex}
        data-active={
          selectorScope === "row" &&
          isSelectedCell
            ? "true"
            : undefined
        }
        aria-label={t("presentation.ui.table.selectRow", {
          index: logicalRowIndex + 1,
        })}
        title={t("presentation.ui.table.selectRow", {
          index: logicalRowIndex + 1,
        })}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          L().selectTableScope(
            blockId,
            "row",
            {
              row: rowIndex,
              col: cellIndex,
            },
            event.shiftKey,
          );
        }}
      />
    ) : null}
    {showRowSelector &&
    rowBoundaryIndex + 1 < rowCount ? (
      <button
        type="button"
        className={`${presentationChrome.tableAxisInsert} ${presentationChrome.tableRowInsert}`}
        data-testid="presentation-table-insert-row-boundary"
        data-table-axis-index={
          rowBoundaryIndex + 1
        }
        aria-label={t("presentation.ui.table.insertRowAfter", {
          index: rowBoundaryIndex + 1,
        })}
        title={t("presentation.ui.table.insertRow")}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          L().insertTableRowAtBoundary(
            blockId,
            rowBoundaryIndex + 1,
          );
        }}
      >
        <Plus size={12} aria-hidden="true" />
      </button>
    ) : null}
    {showTableSelector ? (
      <button
        type="button"
        className={
          presentationChrome.tableSelector
        }
        data-testid="presentation-table-selector"
        data-table-move-handle="true"
        data-active={
          selectorScope === "table"
            ? "true"
            : undefined
        }
        aria-label={t("presentation.ui.table.moveOrSelect")}
        title={t("presentation.ui.table.move")}
        onPointerDown={(event) =>
          L().beginBlockGesture(
            blockId,
            "move",
            event,
          )
        }
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          L().selectTableScope(blockId, "table", {
            row: rowIndex,
            col: cellIndex,
          });
        }}
      >
        <Move size={14} aria-hidden="true" />
      </button>
    ) : null}
    <PresentationTypingCellEditor
      key={editorKey}
      runs={cell.runs}
      
      paragraphStyles={presentationTableCellParagraphStyles(cell, cell.text)}
      
      trailingParagraph={presentationTableCellTrailingParagraphStyle({ source: { cellTrailingParagraphLines: trailingParagraphLines } }, cell)}
      
      powerPointLineFit
      
      slideFaces
      // A plain character typed in its words is the browser's own: the cell
      
      nativeTyping
      inheritedStyle={{ superscript: cellStyle.superscript, subscript: cellStyle.subscript }}
      // A raised or lowered run is drawn at the size the cell draws it at
      
      
      // (²²⁷Th) pushed the names onto further lines, and scaled twice it was
      // a third smaller while typed than at rest.
      // The cell's WordArt: Font Color on its words is their fill.
      containerPaint={cellStyle.textPaint}
      // A caret formats no existing word: the format waits for
      
      readOnly={readOnly}
      onSelectionUpdate={() => L().setTableCharacterSelectionVersion(value => value + 1)}
      className={presentationChrome.tableCellRichEditor}
      onPointerDown={() => { L().textSelectionIntentRef.current += 1; }}
      ref={(element) => {
        const key = `${blockId}:${rowIndex}:${cellIndex}`;
        if (element) {
          L().tableCellInputRefs.current.set(
            key,
            element,
          );
        } else {
          L().tableCellInputRefs.current.delete(
            key,
          );
        }
      }}
      value={cell.text}
      onFocus={() => {
        if (
          L().restoringTableScopeFocusRef.current
        ) {
          L().restoringTableScopeFocusRef.current = false;
          return;
        }
        L().setTableSelectionScope("cells");
        // A SHIFT mouse-down (fired just before this
        // focus) sets the selection anchor; in that
        // case keep it. A plain focus starts a fresh
        // selection, clearing any stale anchor --
        // unless it is the cell already focused
        // getting its focus back, which moves
        // nothing.
        const focused = L().tableCellFocus;
        const refocused =
          focused?.blockId === blockId &&
          focused.row === rowIndex &&
          focused.col === cellIndex;
        if (!L().tableShiftSelectRef.current && !refocused) {
          L().setTableSelectionAnchor(null);
        }
        L().tableShiftSelectRef.current = false;
        L().setTableCellFocus({
          blockId: blockId,
          row: rowIndex,
          col: cellIndex,
        });
      }}
      // Shift-click a SECOND cell to extend the merge
      // selection from the first-focused cell to here.
      // Mouse-down fires BEFORE focus, so we snapshot
      // the prior focus as the anchor + flag the focus
      // handler to preserve it.
      onMouseDown={(event) => {
        if (!event.shiftKey) return;
        const prior = L().tableCellFocus;
        if (
          prior &&
          prior.blockId === blockId
        ) {
          L().setTableSelectionAnchor(prior);
          L().tableShiftSelectRef.current = true;
          if (prior.row !== rowIndex || prior.col !== cellIndex) {
            // The browser's own Shift+click
            // extends the TEXT selection from
            // the first cell's caret, which
            // keeps the caret in that cell's
            // editor: focus came here and went
            // straight back, and no cells were
            
            // is a cell range, as the keyboard
            // makes one: the browser stays out
            // of it and this cell takes focus.
            event.preventDefault();
            event.currentTarget.focus({ preventScroll: true });
          }
        }
      }}
      onChange={(event) =>
        L().updateTableCell(
          blockId,
          rowIndex,
          cellIndex,
          event.target.value,
          event.target.runs,
          // The caret the key left: behind what it typed (the field's change
          // event carries its edit, not its selection).
          event.target.edit ? event.target.edit.start + event.target.edit.insert.length : undefined,
          // The edit, of the words the cell showed (the room carries it to
          // where they now stand when a collaborator's reached it first).
          event.target.edit,
        )
      }
      onCopy={(event) => {
        if (
          event.currentTarget.selectionStart !==
          event.currentTarget.selectionEnd
        ) {
          return;
        }
        if (
          L().copyTableSelectionToClipboard(
            blockId,
            event.clipboardData,
          )
        ) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onCut={(event) => {
        if (
          event.currentTarget.selectionStart !==
          event.currentTarget.selectionEnd
        ) {
          return;
        }
        if (
          L().cutTableSelectionToClipboard(
            blockId,
            event.clipboardData,
          )
        ) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      // "Does the TABLE own this paste, or the
      // cell's own editor?" is answered in one
      // place: `L().pasteTableClipboard` returns
      // false for a 1x1 plain-text payload with
      // no cell rectangle selected, which is
      // what leaves the rich-text editor's own
      // insert to run. A second copy of that
      // rule here also swallowed MULTI-cell
      // Excel/WPS TSV, which then landed in one
      // cell with its tabs and newlines intact.
      onPaste={(event) => {
        if (
          L().pasteTableClipboard(
            blockId,
            rowIndex,
            cellIndex,
            event.clipboardData,
          )
        ) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onKeyDown={(event) => {
        L().textSelectionIntentRef.current += 1;
        if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
          const key = event.key.toLowerCase();
          if (key === "b" || key === "i" || key === "u") {
            event.preventDefault();
            event.stopPropagation();
            L().tableHomeFormatRef.current?.toggle(key === "b" ? "bold" : key === "i" ? "italic" : "underline");
            return;
          }
        }
        // PowerPoint: Esc leaves the cell's
        // words and selects the table by its
        // border, so Home then formats every
        // cell and the arrows move the table.
        if (event.key === "Escape" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          event.stopPropagation();
          L().setTableCellFocus(null);
          L().setTableSelectionAnchor(null);
          L().setTableSelectionScope("cells");
          L().tableShiftSelectRef.current = false;
          event.currentTarget
            .closest<HTMLElement>("[data-block-id]")
            ?.focus({ preventScroll: true });
          return;
        }
        const current = {
          row: rowIndex,
          cellIndex,
        };
        if (
          (event.key === "Backspace" ||
            event.key === "Delete") &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          event.currentTarget.selectionStart ===
            event.currentTarget.selectionEnd &&
          L().clearSelectedTableContents(blockId)
        ) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        // A tab character in a cell: Ctrl+Tab (PowerPoint for Windows) or
        // Option+Shift+Tab (PowerPoint for Mac), Microsoft Support "Use
        // keyboard shortcuts to create PowerPoint presentations", Work with
        // tables. Plain Tab and Shift+Tab move between cells.
        if (
          event.key === "Tab" &&
          !event.metaKey &&
          ((event.ctrlKey && !event.altKey && !event.shiftKey) ||
            (event.altKey && event.shiftKey && !event.ctrlKey))
        ) {
          if (readOnly) return;
          event.preventDefault();
          event.stopPropagation();
          try {
            event.currentTarget.ownerDocument.execCommand("insertText", false, "\t");
          } catch {
            // A document without editing commands types nothing.
          }
          return;
        }
        if (event.key === "Tab" && !event.ctrlKey && !event.altKey && !event.metaKey) {
          const target = tableTabTarget(
            L().block.rows,
            current,
            event.shiftKey,
          );
          if (!target) return;
          // Tab past the last cell adds a
          // row, which a locked or read-only
          // table does not take: focus leaves
          // the table as it does on Shift+Tab
          // from the first cell (PPT-B389).
          if (
            target.kind === "append-row" &&
            (L().autosave.readOnly ||
              !canManipulateBlock(L().block) ||
              (!L().guestMode && L().autosave.page?.id !== L().pageId))
          ) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          L().setTableSelectionAnchor(null);
          L().setTableSelectionScope("cells");
          L().tableShiftSelectRef.current = false;
          if (target.kind === "cell") {
            // PowerPoint: Tab and Shift+Tab select the whole text of the
            // cell they move to, so what is typed next replaces it.
            selectWholeCellText(
              L().tableCellInputRefs.current.get(
                `${blockId}:${target.row}:${target.cellIndex}`,
              ),
            );
          } else {
            L().pendingTableKeyboardFocusRef.current =
              {
                blockId: blockId,
                row: target.row,
                col: 0,
              };
            L().appendTableRowToBlock(blockId);
          }
          return;
        }
        const isArrow =
          event.key === "ArrowLeft" ||
          event.key === "ArrowRight" ||
          event.key === "ArrowUp" ||
          event.key === "ArrowDown";
        // Preserve normal Shift+Arrow text
        // selection for non-empty cell text.
        // Empty cells, or Ctrl/Cmd+Shift+Arrow,
        // extend the native cell rectangle.
        if (
          !isArrow ||
          !event.shiftKey ||
          (cell.text.length > 0 &&
            !event.ctrlKey &&
            !event.metaKey)
        ) {
          return;
        }
        // Left and Right are where the cells
        // are drawn: a right-to-left table's
        // next column is on the left, and
        // Ctrl+Shift+Right took the cell
        
        const visualKey = (
          L().block.rightToLeft === true &&
          (event.key === "ArrowLeft" || event.key === "ArrowRight")
            ? event.key === "ArrowLeft" ? "ArrowRight" : "ArrowLeft"
            : event.key
        ) as TableArrowKey;
        const target = tableArrowTarget(
          L().block.rows,
          current,
          visualKey,
        );
        if (!target) return;
        const targetInput =
          L().tableCellInputRefs.current.get(
            `${blockId}:${target.row}:${target.cellIndex}`,
          );
        if (!targetInput) return;
        event.preventDefault();
        event.stopPropagation();
        L().setTableSelectionScope("cells");
        const anchor = L().tableSelectionAnchor;
        if (
          !anchor ||
          anchor.blockId !==
            blockId
        ) {
          L().setTableSelectionAnchor({
            blockId: blockId,
            row: rowIndex,
            col: cellIndex,
          });
        }
        L().tableShiftSelectRef.current = true;
        targetInput.focus();
      }}
      // The cell text style shows through the inline
      // editor; its background stays transparent
      // so the `<td>` fill is visible behind it.
      style={textStyle}
      data-text-paint={cellStyle.textPaint ? "true" : undefined}
      data-testid="presentation-table-cell"
      data-table-row={rowIndex}
      data-table-col={cellIndex}
    />
    {showColumnBoundary ? (
      <span
        aria-hidden="true"
        className={
          presentationChrome.tableColumnBoundary
        }
        data-testid="presentation-table-column-boundary"
        data-table-axis-index={
          columnBoundaryIndex
        }
        data-active={
          columnBoundaryActive
            ? "true"
            : undefined
        }
        onPointerDown={(event) =>
          L().beginTableAxisResize(
            blockId,
            "col",
            columnBoundaryIndex,
            event,
          )
        }
        onClick={(event) =>
          event.stopPropagation()
        }
      />
    ) : null}
    {showRowBoundary ? (
      <span
        aria-hidden="true"
        className={
          presentationChrome.tableRowBoundary
        }
        data-testid="presentation-table-row-boundary"
        data-table-axis-index={rowBoundaryIndex}
        data-active={
          rowBoundaryActive
            ? "true"
            : undefined
        }
        onPointerDown={(event) =>
          L().beginTableAxisResize(
            blockId,
            "row",
            rowBoundaryIndex,
            event,
          )
        }
        onClick={(event) =>
          event.stopPropagation()
        }
      />
    ) : null}
  </CellTag>
  );
}, sameCellProps);

const EMPTY_FRAME: readonly unknown[] = Object.freeze([]);

/** What a table row's cells read of the table besides the rows themselves. */
interface PresentationCanvasTableRowEnv {
  live: { readonly current: PresentationCanvasTableBlockCtl };
  tableFormattingSelection: PresentationCanvasTableBlockCtl["tableFormattingSelection"];
  showHandles: boolean;
  tableColumnCount: number;
  tableSelectionScope: PresentationCanvasTableBlockCtl["tableSelectionScope"];
  tableAxisPreview: PresentationCanvasTableBlockCtl["tableAxisPreview"];
  readOnly: boolean;
  pageId: string;
  slideId: string;
  t: PresentationCanvasTableBlockCtl["t"];
}

interface PresentationCanvasTableRowProps {
  env: PresentationCanvasTableRowEnv;
  block: PresentationTableBlock;
  /** The table as drawn (a gallery style preview over `block`). */
  displayed: PresentationTableBlock;
  /** The drawn table's facts its cells' styles read (`tableCellRenderFrame`). */
  frame: readonly unknown[];
  row: PresentationTableBlock["rows"][number];
  rowIndex: number;
  rowStyle: CSSProperties | undefined;
  positions: ReadonlyArray<{ row: number; col: number } | null | undefined> | null;
  /** The focused cell's index in this row, or -1: moving the focus draws
   * again only the rows it leaves and enters. */
  focusedCol: number;
}

/** A table's fields other than its rows are the same objects, or (a list of
 * sizes) hold the same values: the table as drawn is aligned to its frame at
 * every render (`tableWithFrameAlignedGrid`), its column widths and row
 * heights new lists of the same numbers each time. */
function sameTableFacts(a: PresentationTableBlock, b: PresentationTableBlock): boolean {
  if (a === b) return true;
  if (a.rows.length !== b.rows.length) return false;
  const keys = Object.keys(a) as (keyof PresentationTableBlock)[];
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => {
    if (key === "rows") return true;
    const x = a[key], y = b[key];
    if (x === y) return true;
    if ((key !== "colWidths" && key !== "rowHeights") || !Array.isArray(x) || !Array.isArray(y)) return false;
    return x.length === y.length && x.every((value, index) => value === y[index]);
  });
}

/** The rows a row's cells read (its own, and its neighbours' for the halves of
 * their lines, `tableCellTdStyle`) are the same objects. */
function sameRowWindow(a: PresentationTableBlock, b: PresentationTableBlock, rowIndex: number): boolean {
  for (let row = rowIndex - 1; row <= rowIndex + 1; row += 1) {
    if (a.rows[row] !== b.rows[row]) return false;
  }
  return true;
}

function sameTableRowProps(a: PresentationCanvasTableRowProps, b: PresentationCanvasTableRowProps): boolean {
  if (a.rowIndex !== b.rowIndex || a.row !== b.row || a.focusedCol !== b.focusedCol) return false;
  const envKeys = Object.keys(a.env) as (keyof PresentationCanvasTableRowEnv)[];
  if (!envKeys.every((key) => a.env[key] === b.env[key])) return false;
  if (!sameStyle(a.rowStyle, b.rowStyle)) return false;
  if (a.frame.length !== b.frame.length || !a.frame.every((value, index) => value === b.frame[index])) return false;
  const positionsSame = a.positions === b.positions || (Boolean(a.positions) && Boolean(b.positions) &&
    a.positions!.length === b.positions!.length &&
    a.positions!.every((at, index) => at?.row === b.positions![index]?.row && at?.col === b.positions![index]?.col));
  if (!positionsSame) return false;
  return sameTableFacts(a.block, b.block) && sameTableFacts(a.displayed, b.displayed) &&
    sameRowWindow(a.block, b.block, a.rowIndex) && sameRowWindow(a.displayed, b.displayed, a.rowIndex);
}







const PresentationCanvasTableRow = memo(function PresentationCanvasTableRow({
  env,
  block,
  displayed,
  row,
  rowIndex,
  rowStyle,
  positions,
  focusedCol,
}: PresentationCanvasTableRowProps) {
  return (
    <tr style={rowStyle}>
                              {row.map((cell, cellIndex) => {
                                const isFocusedCell = focusedCol === cellIndex;
                                const logicalPosition =
                                  env.tableFormattingSelection?.blockId === block.id
                                    ? (env.tableFormattingSelection.positions[
                                        rowIndex
                                      ]?.[cellIndex] ?? null)
                                    : null;
                                const isSelectedCell =
                                  logicalPosition !== null &&
                                  tableCellIntersectsSelection(
                                    cell,
                                    logicalPosition,
                                    env.tableFormattingSelection!,
                                  );
                                const cellStyle = normalizeCellStyle(cell);
                                const headerEmphasis =
                                  block.headerRow === true && rowIndex === 0;
                                const cellGridPosition =
                                  positions?.[cellIndex] ??
                                  null;
                                const logicalRowIndex =
                                  cellGridPosition?.row ?? -1;
                                const logicalColumnIndex =
                                  cellGridPosition?.col ?? -1;
                                const columnBoundaryIndex = cellGridPosition
                                  ? cellGridPosition.col +
                                    Math.max(
                                      1,
                                      Math.floor(Number(cell.colspan) || 1),
                                    ) -
                                    1
                                  : -1;
                                const rowBoundaryIndex =
                                  rowIndex +
                                  Math.max(
                                    1,
                                    Math.floor(Number(cell.rowspan) || 1),
                                  ) -
                                  1;
                                const showColumnBoundary =
                                  env.showHandles &&
                                  columnBoundaryIndex >= 0 &&
                                  columnBoundaryIndex < env.tableColumnCount - 1;
                                const showRowBoundary =
                                  env.showHandles &&
                                  rowBoundaryIndex >= 0 &&
                                  rowBoundaryIndex < block.rows.length - 1;
                                const showColumnSelector =
                                  env.showHandles && logicalRowIndex === 0;
                                const showRowSelector =
                                  env.showHandles && logicalColumnIndex === 0;
                                const showTableSelector =
                                  showColumnSelector &&
                                  showRowSelector &&
                                  logicalRowIndex === 0 &&
                                  logicalColumnIndex === 0;
                                return (
                                  <PresentationCanvasTableCell
                                    key={`${block.id}-cell-${rowIndex}-${cellIndex}`}
                                    live={env.live}
                                    blockId={block.id}
                                    cell={cell}
                                    rowIndex={rowIndex}
                                    cellIndex={cellIndex}
                                    cellTag={displayed.headerRow === true && rowIndex === 0 ? "th" : "td"} // PPT-B361
                                    tdStyle={tableCellTdStyle(displayed, cell, rowIndex, cellIndex)}
                                    trailingParagraphLines={(displayed.source as { cellTrailingParagraphLines?: unknown } | undefined)?.cellTrailingParagraphLines === true}
                                    textStyle={tableCellVisualTextStyle(displayed, { ...cellStyle, superscript: false, subscript: false }, headerEmphasis, true, cell, tableCellStatedHeightPx(displayed, rowIndex, cell))}
                                    isFocusedCell={isFocusedCell}
                                    isSelectedCell={isSelectedCell}
                                    logicalRowIndex={logicalRowIndex}
                                    logicalColumnIndex={logicalColumnIndex}
                                    columnBoundaryIndex={columnBoundaryIndex}
                                    rowBoundaryIndex={rowBoundaryIndex}
                                    showColumnBoundary={showColumnBoundary}
                                    showRowBoundary={showRowBoundary}
                                    showColumnSelector={showColumnSelector}
                                    showRowSelector={showRowSelector}
                                    showTableSelector={showTableSelector}
                                    tableColumnCount={env.tableColumnCount}
                                    rowCount={block.rows.length}
                                    selectorScope={showColumnSelector || showRowSelector || showTableSelector ? env.tableSelectionScope : null}
                                    columnBoundaryActive={showColumnBoundary && env.tableAxisPreview?.blockId === block.id && env.tableAxisPreview.axis === "col" && env.tableAxisPreview.index === columnBoundaryIndex}
                                    rowBoundaryActive={showRowBoundary && env.tableAxisPreview?.blockId === block.id && env.tableAxisPreview.axis === "row" && env.tableAxisPreview.index === rowBoundaryIndex}
                                    readOnly={env.readOnly}
                                    editorKey={`${env.pageId}:${env.slideId}:${block.id}:${rowIndex}:${cellIndex}`}
                                    t={env.t}
                                  />
                                );
                              })}
    </tr>
  );
}, sameTableRowProps);

export function PresentationCanvasTableBlock({ ctl }: { ctl: PresentationCanvasTableBlockCtl }) {
  // A built-in style the table names but does not carry draws from the served
  // gallery looks: draw again when they land.
  useOfficeDataVersion("presentation-table-styles");
  // The controls every cell's handlers read when they run (see
  // `PresentationCanvasTableCell`): set as each render commits.
  const liveCtl = useRef(ctl);
  useLayoutEffect(() => {
    liveCtl.current = ctl;
  });
  const {
    pageId,
    guestMode,
    t,
    tableCellFocus,
    setTableCellFocus,
    setTableSelectionAnchor,
    tableSelectionScope,
    setTableSelectionScope,
    tableGridlinesVisible,
    tableBorderPenMode,
    tableBorderPenHover,
    setTableBorderPenHover,
    tableBorderPenStroke,
    setTableBorderPenStroke,
    tableBorderPenStrokeRef,
    tableBorderPenOverlayRef,
    tableBorderPenSplitOriginRef,
    tableBorderPenSplitRef,
    tableBorderPenSplit,
    setTableBorderPenSplit,
    tableAxisPreview,
    autosave,
    activeSlide,
    contextualTableBlock,
    tableFormattingSelection,
    replaceBlock,
    deleteBlock,
    appendTableRowToBlock,
    appendTableColumnToBlock,
    deleteLastTableRowFromBlock,
    deleteLastTableColumnFromBlock,
    mergeTableSelection,
    splitTableCell,
    tableSelectionCanMerge,
    tableFocusCanSplit,
    beginTableBorderPenStroke,
    extendTableBorderPenStroke,
    commitTableBorderPenStroke,
    block,
    showHandles,
    displayedTableBlock,
    tableCellPositions,
    tableColumnCount,
  } = ctl;
  // Rows under merged cells as PowerPoint sizes them: a merge's shortfall on
  // the last row it covers (`usePresentationMergedRowHeights`).
  const tableRef = useRef<HTMLTableElement | null>(null);
  const displayedRowStyles = usePresentationMergedRowHeights(
    tableRef,
    useMemo(() => (displayedTableBlock ? tableRowHeightStyles(displayedTableBlock) : []), [displayedTableBlock]),
    displayedTableBlock,
    displayedTableBlock !== null && displayedTableBlock !== undefined,
  );
  // What every row's cells read of the table besides their own rows: a row
  // whose cells, neighbours and these are unchanged is not drawn again.
  const rowEnv: PresentationCanvasTableRowEnv = {
    live: liveCtl,
    tableFormattingSelection,
    showHandles,
    tableColumnCount,
    tableSelectionScope,
    tableAxisPreview,
    readOnly: autosave.readOnly || isTextEditLocked(block) || (!guestMode && autosave.page?.id !== pageId),
    pageId,
    slideId: activeSlide.id,
    t,
  };
  const rowFrame = displayedTableBlock ? tableCellRenderFrame(displayedTableBlock) : EMPTY_FRAME;
  return (
                    <div
                      className={`presentation-window__table-block ${presentationChrome.tableResizeSurface}`}
                      style={hasLayoutGeometry(block) ? { overflow: "visible" } : undefined}
                      data-testid="presentation-table-block"
                      data-axis-resizing={
                        tableAxisPreview?.blockId === block.id
                          ? tableAxisPreview.axis
                          : undefined
                      }
                      data-gridlines={
                        tableGridlinesVisible ? "true" : undefined
                      }
                      data-table-controls-outside={
                        showHandles ? "true" : undefined
                      }
                    >
                      {block.caption !== undefined &&
                      !hasLayoutGeometry(block) ? (
                        <input
                          value={block.caption || ""}
                          onChange={(event) =>
                            replaceBlock(block.id, {
                              ...block,
                              caption: event.target.value,
                            } satisfies PresentationTableBlock)
                          }
                          placeholder={t("presentation.captionPlaceholder")}
                        />
                      ) : null}
                      {!hasLayoutGeometry(block) ? (
                        <div className="presentation-window__table-actions">
                          <button
                            type="button"
                            onClick={() => appendTableRowToBlock(block.id)}
                            data-testid="presentation-table-add-row"
                          >
                            <Plus size={13} />
                            {t("presentation.addRow")}
                          </button>
                          <button
                            type="button"
                            onClick={() => appendTableColumnToBlock(block.id)}
                            data-testid="presentation-table-add-column"
                          >
                            <Plus size={13} />
                            {t("presentation.addColumn")}
                          </button>
                          <button
                            type="button"
                            disabled={block.rows.length <= 1}
                            onClick={() =>
                              deleteLastTableRowFromBlock(block.id)
                            }
                            data-testid="presentation-table-delete-row"
                          >
                            <Trash2 size={13} />
                            {t("presentation.deleteRow")}
                          </button>
                          <button
                            type="button"
                            disabled={tableLogicalWidth(block.rows) <= 1}
                            onClick={() =>
                              deleteLastTableColumnFromBlock(block.id)
                            }
                            data-testid="presentation-table-delete-column"
                          >
                            <Trash2 size={13} />
                            {t("presentation.deleteColumn")}
                          </button>
                          {/* MERGE / SPLIT cells (PowerPoint parity). Merge collapses
                          the focused cell + the shift-selected anchor into one
                          spanning cell; Split breaks a merged cell back to 1×1.
                          Both gated on the selection belonging to THIS table. */}
                          <button
                            type="button"
                            disabled={
                              tableCellFocus?.blockId !== block.id ||
                              !tableSelectionCanMerge
                            }
                            onClick={mergeTableSelection}
                            data-testid="presentation-table-merge"
                            title={t("presentation.tableMergeHint")}
                          >
                            <TableCellsMerge size={13} />
                            {t("presentation.tableMerge")}
                          </button>
                          <button
                            type="button"
                            disabled={
                              tableCellFocus?.blockId !== block.id ||
                              !tableFocusCanSplit
                            }
                            onClick={splitTableCell}
                            data-testid="presentation-table-split"
                            title={t("presentation.tableSplitHint")}
                          >
                            <TableCellsSplit size={13} />
                            {t("presentation.tableSplit")}
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteBlock(block.id)}
                            data-testid="presentation-delete-block"
                          >
                            <Trash2 size={13} />
                            {t("presentation.deleteBlock")}
                          </button>
                        </div>
                      ) : null}
                      <PresentationTableShadowFrame block={displayedTableBlock!}>
                      <table
                        ref={tableRef}
                        style={tableLayoutStyle(displayedTableBlock!)}
                        {...tableDirectionProps(displayedTableBlock!)}
                      >
                        <TableColgroup block={displayedTableBlock!} />
                        <tbody>
                          {block.rows.map((row, rowIndex) => (
                            <PresentationCanvasTableRow
                              key={`${block.id}-row-${rowIndex}`}
                              env={rowEnv}
                              block={block}
                              displayed={displayedTableBlock!}
                              frame={rowFrame}
                              row={row}
                              rowIndex={rowIndex}
                              rowStyle={displayedRowStyles[rowIndex]}
                              positions={tableCellPositions?.[rowIndex] ?? null}
                              focusedCol={tableCellFocus?.blockId === block.id && tableCellFocus.row === rowIndex ? tableCellFocus.col : -1}
                            />
                          ))}
                        </tbody>
                      </table>
                      </PresentationTableShadowFrame>
                      {/* A finger's selection handles on the cell range
                      (PowerPoint for iPad: tap a cell, drag a handle to take
                      more cells; a finger across the cells scrolls). Touch
                      input only; the mouse keeps Shift+click. */}
                      <OfficeTableTouchGrips
                        enabled={
                          showHandles &&
                          tableBorderPenMode === null &&
                          tableSelectionScope === "cells" &&
                          tableCellFocus?.blockId === block.id
                        }
                        cellSelector="[data-table-cell-row]"
                        testIdPrefix="presentation-table-touch-grip"
                        layoutKey={tableFormattingSelection ?? tableCellFocus}
                        selectedCells={(layer) => {
                          const surface = layer.parentElement;
                          if (!surface) return [];
                          const range = surface.querySelectorAll(
                            '[data-table-cell-row][data-selected="true"]',
                          );
                          return Array.from(
                            range.length > 0
                              ? range
                              : surface.querySelectorAll(
                                  '[data-table-cell-row][data-focused="true"]',
                                ),
                          );
                        }}
                        onRange={(fixed, moving) => {
                          const at = (cell: Element) => ({
                            row: Number((cell as HTMLElement).dataset.tableCellRow),
                            col: Number((cell as HTMLElement).dataset.tableCellCol),
                          });
                          const anchor = at(fixed);
                          const focus = at(moving);
                          if (
                            !block.rows[anchor.row]?.[anchor.col] ||
                            !block.rows[focus.row]?.[focus.col]
                          ) {
                            return;
                          }
                          // What Shift+click on the moving cell selects:
                          // the fixed corner is the anchor, the finger's
                          // cell the focus. The caret stays where it is.
                          setTableSelectionScope("cells");
                          setTableSelectionAnchor(
                            anchor.row === focus.row && anchor.col === focus.col
                              ? null
                              : { blockId: block.id, ...anchor },
                          );
                          setTableCellFocus({ blockId: block.id, ...focus });
                        }}
                      />
                      {/* BORDER PEN overlay — mounted only while a pen is held
                      on THIS table. It swallows the pointer so a pencil stroke
                      never lands inside cell text, hit-tests the measured `<td>`
                      edges, and commits the whole drag as one undoable edit. */}
                      {tableBorderPenMode === "erase" &&
                      contextualTableBlock?.id === block.id ? (
                        <div
                          ref={tableBorderPenOverlayRef}
                          className={presentationChrome.tableBorderPenOverlay}
                          data-testid="presentation-table-border-pen-overlay"
                          data-pen-mode={tableBorderPenMode}
                          role="application"
                          aria-label={
                            tableBorderPenMode === "erase"
                              ? t("presentation.ui.table.borderEraser")
                              : t("presentation.ui.table.borderPen")
                          }
                          onPointerDown={beginTableBorderPenStroke}
                          onPointerMove={extendTableBorderPenStroke}
                          onPointerUp={(event) => {
                            try {
                              event.currentTarget.releasePointerCapture?.(
                                event.pointerId,
                              );
                            } catch {
                              /* nothing was captured. */
                            }
                            commitTableBorderPenStroke(block.id);
                          }}
                          onPointerCancel={() => {
                            tableBorderPenStrokeRef.current = [];
                            tableBorderPenSplitRef.current = null;
                            tableBorderPenSplitOriginRef.current = null;
                            setTableBorderPenStroke([]);
                            setTableBorderPenSplit(null);
                          }}
                          onPointerLeave={() => {
                            if (tableBorderPenStrokeRef.current.length === 0) {
                              setTableBorderPenHover(null);
                            }
                          }}
                        >
                          {(tableBorderPenStroke.length > 0
                            ? tableBorderPenStroke
                            : tableBorderPenHover
                              ? [tableBorderPenHover]
                              : []
                          ).map((edge) => (
                            <span
                              key={tableBorderEdgeKey(edge)}
                              aria-hidden="true"
                              className={
                                presentationChrome.tableBorderPenMarker
                              }
                              data-testid="presentation-table-border-pen-marker"
                              data-edge={`${edge.row}:${edge.col}:${edge.side}`}
                              style={{
                                left: edge.left,
                                top: edge.top,
                                width: edge.width,
                                height: edge.height,
                              }}
                            />
                          ))}
                          {/* The gridline a pencil stroke through a cell is
                          about to draw — dashed while it is still a proposal. */}
                          {tableBorderPenSplit ? (
                            <span
                              aria-hidden="true"
                              className={`${presentationChrome.tableBorderPenMarker} ${presentationChrome.tableBorderPenSplitMarker}`}
                              data-testid="presentation-table-border-pen-split-marker"
                              data-split-axis={tableBorderPenSplit.axis}
                              data-cell={`${tableBorderPenSplit.row}:${tableBorderPenSplit.col}`}
                              style={{
                                left: tableBorderPenSplit.left,
                                top: tableBorderPenSplit.top,
                                width: tableBorderPenSplit.width,
                                height: tableBorderPenSplit.height,
                              }}
                            />
                          ) : null}
                        </div>
                      ) : null}
                    </div>
  );
}
