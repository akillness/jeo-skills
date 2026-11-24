"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, useRef, type PointerEvent as ReactPointerEvent, useEffect, useLayoutEffect, type RefObject } from "react";
import { flushSync } from "react-dom";
import { type SpreadsheetViewMode } from "../../../../lib/spreadsheet/view-options";
import { type SheetModel } from "./spreadsheetSheetModel";
import { selectSpreadsheetCellEntryText } from "./spreadsheetGridEventHandlers";
import { insertSpreadsheetDraftText } from "./SpreadsheetDraftInput";
import { pointModeInsertion, pointModeReference, type PointedReference } from "../../../../lib/spreadsheet/formula-point-mode";
import { SPREADSHEET_HEADER_WIDTH_PX, SPREADSHEET_HEADER_HEIGHT_PX, MAX_SHEET_ROWS, MAX_SHEET_COLS } from "./spreadsheetGridConstants";
import { SELECTION_FILL_HANDLE_GRAB, SELECTION_BORDER_GRAB } from "./spreadsheetWindowConstants";
import { type CellRange } from "../../../../lib/spreadsheet/block-clear";
import { type SheetExtent } from "../../../../lib/spreadsheet/range-preview";
import { type GridRect } from "../../../../lib/spreadsheet/grid-nav";
import { type Dispatch, type SetStateAction } from "react";
import { spreadsheetCanvasRunCellAt, spreadsheetCellNodeAt } from "./spreadsheetCellLookup";

/** What useSpreadsheetCellRangeDrag reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetCellRangeDragInputs {
  /** Hear each commit of the grid's band (SpreadsheetGridBandStore.onCommit). */
  onGridCommit?: (listener: () => void) => () => void;
  activeCell: { row: number; col: number; };
  cellRangeDragRef: RefObject<{ pointerId: number; anchor: { row: number; col: number; }; clientX: number; clientY: number; row: number; col: number; framePending: boolean; } | null>;
  dataDialogWriteAllowedRef: RefObject<boolean>;
  editingCell: { sheetId: string; row: number; col: number; mode?: "enter" | "edit"; multiline?: boolean; rich?: boolean; } | null;
  ensureGridViewportCapacity: (viewport: HTMLDivElement, growAtEdge: boolean) => void;
  gridColumnCount: number;
  gridRowCount: number;
  gridRtl: boolean;
  gridWrapRef: RefObject<HTMLDivElement | null>;
  hasMultiSelection: boolean;
  isCellSelectableRef: RefObject<(candidate: SheetModel, row: number, col: number) => boolean>;
  /** A finger's press on a cell at rest: the touch adapter decides between a
   * scroll, a long-press range drag, a move and a tap
   * (useSpreadsheetTouchGestures). A mouse never reaches it. */
  onTouchCellPress?: (event: ReactPointerEvent<HTMLInputElement>, row: number, col: number) => void;
  /** A pen's press on a cell at rest: it drags a range exactly as the mouse
   * does (Excel for iPad: a Pencil drag selects); the adapter only keeps the
   * page from scrolling under it. */
  onPenCellPress?: (event: ReactPointerEvent<HTMLInputElement>) => void;
  /** A mouse press on a cell (`start`), and its release on the cell it
   * started on with no range dragged (`released`). */
  onCellPress?: (phase: "start" | "released", cell: { row: number; col: number }) => void;
  liveActiveSheetIndexRef: RefObject<number>;
  liveSheetsRef: RefObject<SheetModel[]>;
  pageId: string;
  rangePreview: { schedule(next: CellRange): void; paintNow(): void; clear(): void; };
  scheduleRaf: (callback: () => void) => void;
  selectionEdgeRect: CellRange;
  selectionExtendingRef: RefObject<boolean>;
  selectionMoveDragRef: RefObject<{ src: { r1: number; r2: number; c1: number; c2: number; }; grab: { row: number; col: number; }; pointerId: number; sourceSheet: SheetModel; sourceWorkbook: SheetModel[]; target: { row: number; col: number; }; copy: boolean; clientX: number; clientY: number; } | null>;
  selectionPaint: { paint(range: CellRange | null, edges?: CellRange | null): void; pressed(edges: CellRange): void; paintHeaders(range: CellRange | null, extent: SheetExtent | null): void; };
  selRect: GridRect;
  setActiveCell: Dispatch<SetStateAction<{ row: number; col: number; }>>;
  setGridScroll: Dispatch<SetStateAction<{ left: number; top: number; }>>;
  setSelectionAnchor: Dispatch<SetStateAction<{ row: number; col: number; } | null>>;
  setSelectionMoveDrag: Dispatch<SetStateAction<{ src: { r1: number; r2: number; c1: number; c2: number; }; target: { row: number; col: number; }; copy: boolean; } | null>>;
  sheet: SheetModel;
  sheetViewProjectionActiveRef: RefObject<boolean>;
  spreadsheetViewMode: SpreadsheetViewMode;
  toScreenPx: (contentPx: number) => number;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetCellRangeDrag({
  onGridCommit,
  activeCell,
  cellRangeDragRef,
  dataDialogWriteAllowedRef,
  editingCell,
  ensureGridViewportCapacity,
  gridColumnCount,
  gridRowCount,
  gridRtl,
  gridWrapRef,
  hasMultiSelection,
  isCellSelectableRef,
  onTouchCellPress,
  onPenCellPress,
  onCellPress,
  liveActiveSheetIndexRef,
  liveSheetsRef,
  pageId,
  rangePreview,
  scheduleRaf,
  selectionEdgeRect,
  selectionExtendingRef,
  selectionMoveDragRef,
  selectionPaint,
  selRect,
  setActiveCell,
  setGridScroll,
  setSelectionAnchor,
  setSelectionMoveDrag,
  sheet,
  sheetViewProjectionActiveRef,
  spreadsheetViewMode,
  toScreenPx,
}: SpreadsheetCellRangeDragInputs) {
  // Excel Web grows a range continuously while the primary pointer is held.
  // Hit-test inside the live virtualized viewport, then keep scrolling when the
  // pointer rests in an edge band so large ranges do not require Shift+Arrow.
  const cellForRangeDragPointer = useCallback(
    (clientX: number, clientY: number, eventTarget?: EventTarget | null) => {
      const wrap = gridWrapRef.current;
      if (!wrap) return null;
      const readCell = (candidate: Element | null) => {
        // A gridline is the cell's own box (data-range-cell).
        const owner = candidate?.closest<HTMLElement>("[data-cell], [data-range-cell]");
        // Or a cell drawn on the canvas, inside a run's one element.
        const raw = owner ? (wrap.contains(owner) ? owner.dataset.cell ?? owner.dataset.rangeCell : undefined)
          : candidate && wrap.contains(candidate) ? spreadsheetCanvasRunCellAt(candidate, clientX) : undefined;
        if (!raw) return null;
        const [row, col] = raw.split(":").map(Number);
        if (
          !Number.isInteger(row) ||
          !Number.isInteger(col) ||
          row < 0 ||
          col < 0 ||
          row >= gridRowCount ||
          col >= gridColumnCount
        ) {
          return null;
        }
        return { row, col };
      };
      const direct =
        eventTarget instanceof Element ? readCell(eventTarget) : null;
      if (direct) return direct;

      const rect = wrap.getBoundingClientRect();
      const headerWidth = toScreenPx(SPREADSHEET_HEADER_WIDTH_PX);
      const headerHeight = toScreenPx(SPREADSHEET_HEADER_HEIGHT_PX);
      const dataLeft = rect.left + (gridRtl ? 1 : headerWidth + 1);
      const dataRight = rect.right - (gridRtl ? headerWidth + 1 : 1);
      const dataTop = rect.top + headerHeight + 1;
      const dataBottom = rect.bottom - 1;
      if (dataLeft >= dataRight || dataTop >= dataBottom) return null;
      const hit =
        typeof document.elementFromPoint === "function"
          ? document.elementFromPoint(
              Math.max(dataLeft, Math.min(clientX, dataRight)),
              Math.max(dataTop, Math.min(clientY, dataBottom)),
            )
          : null;
      const hitCell = readCell(hit);
      return hitCell;
    },
    [gridColumnCount, gridRowCount, gridRtl, toScreenPx],
  );

  const extendCellRangeDragAt = useCallback(
    (clientX: number, clientY: number, eventTarget?: EventTarget | null) => {
      const drag = cellRangeDragRef.current;
      if (!drag) return;
      const cell = cellForRangeDragPointer(clientX, clientY, eventTarget);
      if (!cell || (cell.row === drag.row && cell.col === drag.col)) return;
      // The far end never lands on a cell the selection may not reach.
      const liveSheet = liveSheetsRef.current[liveActiveSheetIndexRef.current];
      if (liveSheet && !isCellSelectableRef.current(liveSheet, cell.row, cell.col)) return;
      drag.row = cell.row;
      drag.col = cell.col;
      rangePreview.schedule({ r1: Math.min(drag.anchor.row, cell.row), r2: Math.max(drag.anchor.row, cell.row), c1: Math.min(drag.anchor.col, cell.col), c2: Math.max(drag.anchor.col, cell.col) });
    },
    [cellForRangeDragPointer, rangePreview],
  );

  const scheduleCellRangeAutoScrollRef = useRef<() => void>(() => {});
  const scheduleCellRangeAutoScroll = useCallback(() => {
    const drag = cellRangeDragRef.current;
    if (!drag || drag.framePending) return;
    drag.framePending = true;
    scheduleRaf(() => {
      const live = cellRangeDragRef.current;
      if (!live) return;
      live.framePending = false;
      const wrap = gridWrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const headerWidth = toScreenPx(SPREADSHEET_HEADER_WIDTH_PX);
      const headerHeight = toScreenPx(SPREADSHEET_HEADER_HEIGHT_PX);
      const dataLeft = rect.left + (gridRtl ? 0 : headerWidth);
      const dataRight = rect.right - (gridRtl ? headerWidth : 0);
      const dataTop = rect.top + headerHeight;
      const dataBottom = rect.bottom;
      const edgeDelta = (
        point: number,
        start: number,
        end: number,
        maximum: number,
      ) => {
        const zone = Math.max(24, Math.min(48, (end - start) / 3));
        if (point < start + zone) {
          return -Math.min(
            maximum,
            Math.max(4, Math.ceil(((start + zone - point) / zone) * maximum)),
          );
        }
        if (point > end - zone) {
          return Math.min(
            maximum,
            Math.max(4, Math.ceil(((point - (end - zone)) / zone) * maximum)),
          );
        }
        return 0;
      };
      const deltaX = edgeDelta(live.clientX, dataLeft, dataRight, 28);
      const deltaY = edgeDelta(live.clientY, dataTop, dataBottom, 24);
      const previousLeft = wrap.scrollLeft;
      const previousTop = wrap.scrollTop;
      if (deltaX !== 0) wrap.scrollLeft += deltaX;
      if (deltaY !== 0) wrap.scrollTop += deltaY;
      const moved = wrap.scrollLeft !== previousLeft || wrap.scrollTop !== previousTop;
      // A clamped leading edge cannot scroll. Trailing edges may still need
      // one viewport-capacity update before the next frame can move.
      const canGrow = spreadsheetViewMode === "normal" && !sheet.chartSheet && (
        (deltaY > 0 && gridRowCount < MAX_SHEET_ROWS) ||
        ((gridRtl ? deltaX < 0 : deltaX > 0) && gridColumnCount < MAX_SHEET_COLS)
      );
      if (moved) {
        setGridScroll({ left: Math.abs(wrap.scrollLeft), top: wrap.scrollTop });
      }
      if (moved || canGrow) ensureGridViewportCapacity(wrap, true);
      extendCellRangeDragAt(live.clientX, live.clientY);
      if (cellRangeDragRef.current && (moved || canGrow)) {
        scheduleCellRangeAutoScrollRef.current();
      }
    });
  }, [
    ensureGridViewportCapacity,
    extendCellRangeDragAt,
    gridColumnCount,
    gridRowCount,
    gridRtl,
    scheduleRaf,
    setGridScroll,
    sheet.chartSheet,
    spreadsheetViewMode,
    toScreenPx,
  ]);
  scheduleCellRangeAutoScrollRef.current = scheduleCellRangeAutoScroll;

  /**
   * Whether a pointerdown landed on the selection's OUTLINE rather than
   * inside it: within `SELECTION_BORDER_GRAB` of the outer edge of a cell
   * that sits on that edge of the selection, and clear of the fill handle in
   * the bottom-right corner. Excel's own grab zone is the drawn border, which
   * is what turns the pointer into the move pointer.
   *
   * With no layout there is no border to grab (jsdom and the first paint both
   * report a zero-sized rect), so the answer there is always "no": a range
   * drag must never become a move because the geometry was unknown.
   */
  const pointerIsOnSelectionBorder = useCallback(
    (event: ReactPointerEvent<HTMLInputElement>, row: number, col: number) => {
      if (
        row < selRect.r1 ||
        row > selRect.r2 ||
        col < selRect.c1 ||
        col > selRect.c2
      ) {
        return false;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const fromLeft = event.clientX - rect.left;
      const fromRight = rect.right - event.clientX;
      const fromTop = event.clientY - rect.top;
      const fromBottom = rect.bottom - event.clientY;
      // The fill handle owns the bottom-right corner of the last cell; it has
      // its own pointerdown, but the corner stays out of the grab zone so a
      // near miss extends the fill rather than starting a move.
      if (
        row === selRect.r2 &&
        col === selRect.c2 &&
        fromRight <= SELECTION_FILL_HANDLE_GRAB &&
        fromBottom <= SELECTION_FILL_HANDLE_GRAB
      ) {
        return false;
      }
      return (
        (row === selRect.r1 && fromTop <= SELECTION_BORDER_GRAB) ||
        (row === selRect.r2 && fromBottom <= SELECTION_BORDER_GRAB) ||
        (col === selRect.c1 && fromLeft <= SELECTION_BORDER_GRAB) ||
        (col === selRect.c2 && fromRight <= SELECTION_BORDER_GRAB)
      );
    },
    [selRect],
  );
  const beginSelectionMoveDrag = useCallback(
    (event: ReactPointerEvent<HTMLInputElement>, row: number, col: number) => {
      const src = {
        r1: selRect.r1,
        r2: selRect.r2,
        c1: selRect.c1,
        c2: selRect.c2,
      };
      const target = { row: src.r1, col: src.c1 };
      selectionMoveDragRef.current = {
        src,
        grab: { row: row - src.r1, col: col - src.c1 },
        pointerId: event.pointerId,
        sourceSheet: sheet,
        sourceWorkbook: liveSheetsRef.current,
        target,
        copy: event.ctrlKey || event.metaKey,
        clientX: event.clientX,
        clientY: event.clientY,
      };
      setSelectionMoveDrag({ src, target, copy: event.ctrlKey || event.metaKey });
    },
    [selRect, sheet],
  );
  // The pointer over the selection's border becomes the move pointer, which is
  // how Excel tells the user the border is a grip at all. One listener on the
  // grid wrapper rather than a handler on every cell: the grid mounts
  // thousands of them, and this has to stay free when the pointer is nowhere
  // near an edge.
  useEffect(() => {
    const viewport = gridWrapRef.current;
    if (!viewport) return;
    let marked: HTMLElement | null = null;
    const release = () => {
      if (!marked) return;
      marked.style.cursor = "";
      marked = null;
    };
    const onMove = (event: PointerEvent) => {
      const element = (event.target as Element | null)?.closest<HTMLElement>(
        "[data-cell]",
      );
      const attr = element?.getAttribute("data-cell");
      if (!element || !attr) {
        release();
        return;
      }
      const [rowPart, colPart] = attr.split(":");
      const row = Number(rowPart);
      const col = Number(colPart);
      const onBorder =
        dataDialogWriteAllowedRef.current &&
        !sheetViewProjectionActiveRef.current &&
        pointerIsOnSelectionBorder(
          {
            currentTarget: element,
            clientX: event.clientX,
            clientY: event.clientY,
          } as unknown as ReactPointerEvent<HTMLInputElement>,
          row,
          col,
        );
      if (!onBorder) {
        release();
        return;
      }
      if (marked !== element) {
        release();
        marked = element;
      }
      element.style.cursor = "move";
    };
    viewport.addEventListener("pointermove", onMove);
    viewport.addEventListener("pointerleave", release);
    return () => {
      viewport.removeEventListener("pointermove", onMove);
      viewport.removeEventListener("pointerleave", release);
      release();
    };
  }, [pointerIsOnSelectionBorder]);
  // Point mode (lib/spreadsheet/formula-point-mode): the reference the last
  // click or drag wrote into the formula being typed, so the next click on a
  // cell replaces it as Excel does.
  const pointedReferenceRef = useRef<(PointedReference & { editor: HTMLInputElement | HTMLTextAreaElement }) | null>(null);
  const pointAtCell = useCallback(
    (event: ReactPointerEvent<HTMLInputElement>, row: number, col: number): boolean => {
      // The formula being typed: the open cell entry or the formula bar,
      // still focused while the press lands on another cell.
      const editor = document.activeElement;
      if (!(editor instanceof HTMLInputElement || editor instanceof HTMLTextAreaElement)) return false;
      if (editor === event.currentTarget) return false;
      const inCell = editor.dataset.testid === "spreadsheet-cell" && editor.dataset.editing === "true";
      const inBar = editor.dataset.testid === "spreadsheet-formula";
      if (!inCell && !inBar) return false;
      if (inCell && !gridWrapRef.current?.contains(editor)) return false;
      const last = pointedReferenceRef.current?.editor === editor ? pointedReferenceRef.current : null;
      const span = pointModeInsertion(editor.value, editor.selectionStart ?? editor.value.length, editor.selectionEnd ?? editor.value.length, last);
      if (!span) return false;
      event.preventDefault();
      const anchor = { row, col };
      const write = (cell: { row: number; col: number }, from: { start: number; end: number }) => {
        const text = pointModeReference(anchor, cell);
        insertSpreadsheetDraftText(editor, text, from.start, from.end);
        pointedReferenceRef.current = { editor, start: from.start, text };
      };
      write(anchor, span);
      // A drag with the button held writes the range it covers.
      const pointerId = event.pointerId;
      let current = anchor;
      const move = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        const cell = cellForRangeDragPointer(moveEvent.clientX, moveEvent.clientY, moveEvent.target);
        const pointed = pointedReferenceRef.current;
        if (!cell || !pointed || pointed.editor !== editor || (cell.row === current.row && cell.col === current.col)) return;
        current = cell;
        write(cell, { start: pointed.start, end: pointed.start + pointed.text.length });
      };
      const end = (endEvent: PointerEvent) => {
        if (endEvent.pointerId !== pointerId) return;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
      return true;
    },
    [cellForRangeDragPointer, gridWrapRef],
  );

  const beginCellRangeDrag = useCallback(
    (
      event: ReactPointerEvent<HTMLInputElement>,
      row: number,
      col: number,
      editing: boolean,
    ) => {
      // A press on another cell while a formula waits for a reference
      // points at it instead of ending the entry (audit P-002).
      if (event.button === 0 && event.pointerType !== "touch" && !editing && pointAtCell(event, row, col)) return;
      if (event.pointerType === "touch" && event.button === 0 && !editing) {
        onTouchCellPress?.(event, row, col);
        return;
      }
      if (event.pointerType === "pen" && event.button === 0 && !editing) onPenCellPress?.(event);
      if (event.button !== 0 || event.pointerType === "touch" || editing)
        return;
      // The selection's border is a grip, not a place to start a new range.
      if (
        !event.shiftKey &&
        dataDialogWriteAllowedRef.current &&
        !sheetViewProjectionActiveRef.current &&
        pointerIsOnSelectionBorder(event, row, col)
      ) {
        event.preventDefault();
        beginSelectionMoveDrag(event, row, col);
        return;
      }
      event.preventDefault();
      // Excel's Select locked cells / Select unlocked cells: a click on a cell
      // the selection may not reach does nothing (no focus, no selection).
      if (!isCellSelectableRef.current(sheet, row, col)) return;
      // Excel: the cell a selection starts from stays the active cell (Name
      // Box, white cell, typing target) while a drag or a Shift+click only
      // moves the far end. `drag.anchor` is that fixed origin; the far end
      // lives in selectionAnchor, as it does for a whole row or column.
      const origin = event.shiftKey ? activeCell : { row, col };
      setSelectionAnchor({ row, col });
      if (!event.shiftKey) setActiveCell({ row, col });
      cellRangeDragRef.current = {
        pointerId: event.pointerId,
        anchor: origin,
        clientX: event.clientX,
        clientY: event.clientY,
        row,
        col,
        framePending: false,
      };
      cellRangeHandlersRef.current.onCellPress?.("start", origin);
      const originInput = event.shiftKey
        ? spreadsheetCellNodeAt<HTMLInputElement>(gridWrapRef.current, `${origin.row}:${origin.col}`)
        : event.currentTarget;
      if (!originInput) return;
      if (document.activeElement === originInput) {
        // Already there. A Shift+click while the origin is being edited still
        // commits the draft, as leaving the cell used to: blur, then return.
        if (!editingCell) return;
        originInput.blur();
      }
      selectionExtendingRef.current = true;
      originInput.focus({ preventScroll: true });
      selectSpreadsheetCellEntryText(originInput);
    },
    [
      activeCell,
      beginSelectionMoveDrag,
      editingCell,
      pointAtCell,
      onTouchCellPress,
      onPenCellPress,
      pointerIsOnSelectionBorder,
      setActiveCell,
      setSelectionAnchor,
      sheet,
    ],
  );

  /**
   * A touch range drag (a long press on a cell, or a selection grip): the
   * mouse drag's own state, listeners, preview and edge scroll, entered with
   * the fixed corner as the origin. `fixed` becomes (or stays) the active
   * cell, as the cell a mouse drag starts from does; `moving` is the far end
   * the finger carries. Focus follows on release, as for the mouse.
   */
  const beginTouchRangeDrag = useCallback(
    (
      pointer: { pointerId: number; clientX: number; clientY: number },
      fixed: { row: number; col: number },
      moving: { row: number; col: number },
    ) => {
      if (!isCellSelectableRef.current(sheet, fixed.row, fixed.col)) return false;
      if (activeCell.row !== fixed.row || activeCell.col !== fixed.col) {
        setActiveCell({ row: fixed.row, col: fixed.col });
      }
      setSelectionAnchor({ row: moving.row, col: moving.col });
      cellRangeDragRef.current = {
        pointerId: pointer.pointerId,
        anchor: { row: fixed.row, col: fixed.col },
        clientX: pointer.clientX,
        clientY: pointer.clientY,
        row: moving.row,
        col: moving.col,
        framePending: false,
      };
      rangePreview.schedule({
        r1: Math.min(fixed.row, moving.row),
        r2: Math.max(fixed.row, moving.row),
        c1: Math.min(fixed.col, moving.col),
        c2: Math.max(fixed.col, moving.col),
      });
      return true;
    },
    [activeCell, rangePreview, setActiveCell, setSelectionAnchor, sheet],
  );

  const cellRangeHandlersRef = useRef({ extendCellRangeDragAt, setSelectionAnchor, scheduleRaf, activeCell, editingCell, onCellPress });
  cellRangeHandlersRef.current = { extendCellRangeDragAt, setSelectionAnchor, scheduleRaf, activeCell, editingCell, onCellPress };
  useLayoutEffect(() => { if (cellRangeDragRef.current) rangePreview.paintNow(); });
  // A drag that scrolls the grid mounts cells in a render of the band alone:
  // they take the preview at its commit too.
  useLayoutEffect(() => onGridCommit?.(() => { if (cellRangeDragRef.current) rangePreview.paintNow(); }), [cellRangeDragRef, onGridCommit, rangePreview]);
  // Rows leave selection membership out of their memo key; the committed
  // selection is painted onto the mounted cells right after each commit that
  // changes it. A pointer drag keeps its own preview until it finishes.
  useLayoutEffect(() => {
    if (!cellRangeDragRef.current) selectionPaint.paint(hasMultiSelection ? selRect : null, selectionEdgeRect);
    // A press: the cells' paint waits for the pointer, the frame need not.
    else selectionPaint.pressed(selectionEdgeRect);
  }, [selectionPaint, selRect, selectionEdgeRect, hasMultiSelection]);
  // Row headings sit in the same memoized rows, so their selection mark is
  // painted the same way; the column headings render it themselves.
  useLayoutEffect(() => {
    if (!cellRangeDragRef.current) selectionPaint.paintHeaders(selRect, { rows: gridRowCount, cols: gridColumnCount });
  }, [selectionPaint, selRect, gridRowCount, gridColumnCount]);
  useEffect(() => {
    const finish = (pointerId: number | null, restoreFocus: boolean) => {
      const drag = cellRangeDragRef.current;
      if (!drag || (pointerId !== null && pointerId !== drag.pointerId)) return;
      cellRangeDragRef.current = null;
      rangePreview.clear();
      // The origin is already the active cell; the release point becomes the
      // selection's far end.
      cellRangeHandlersRef.current.setSelectionAnchor({ row: drag.row, col: drag.col });
      const origin = drag.anchor;
      if (!restoreFocus) return;
      if (drag.row === origin.row && drag.col === origin.col) cellRangeHandlersRef.current.onCellPress?.("released", origin);
      cellRangeHandlersRef.current.scheduleRaf(() => {
        // This frame can land long after the pointer-up when the main thread
        // is busy (first load, font and calculation work): a click, two typed
        // characters and a Tab all fit inside the wait. Refocusing then took
        // the focus back to the clicked cell, so the next value typed
        // overwrote the first one and the whole row landed one cell to the
        // left; and even in the same cell, the select() made the next key
        // replace what had been typed. The restore is only for a pointer
        // gesture nothing has followed.
        const live = cellRangeHandlersRef.current;
        if (
          live.editingCell ||
          live.activeCell.row !== origin.row ||
          live.activeCell.col !== origin.col
        ) {
          return;
        }
        const focused = document.activeElement;
        const input = spreadsheetCellNodeAt<HTMLInputElement>(gridWrapRef.current, `${origin.row}:${origin.col}`);
        if (
          focused instanceof HTMLElement &&
          focused !== input &&
          focused.hasAttribute("data-cell") &&
          gridWrapRef.current?.contains(focused)
        ) {
          return;
        }
        if (input) {
          if (focused === input) return;
          selectionExtendingRef.current = true;
          input.focus({ preventScroll: true });
          selectSpreadsheetCellEntryText(input);
          return;
        }
        gridWrapRef.current
          ?.querySelector<HTMLTableElement>('table[role="grid"]')
          ?.focus({ preventScroll: true });
      });
    };
    const onMove = (event: PointerEvent) => {
      const drag = cellRangeDragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag.clientX = event.clientX;
      drag.clientY = event.clientY;
      cellRangeHandlersRef.current.extendCellRangeDragAt(event.clientX, event.clientY, event.target);
      scheduleCellRangeAutoScrollRef.current();
      event.preventDefault();
    };
    const onUp = (event: PointerEvent) => { cellRangeHandlersRef.current.extendCellRangeDragAt(event.clientX, event.clientY, event.target); finish(event.pointerId, true); };
    const onCancel = (event: PointerEvent) => finish(event.pointerId, true);
    const onWindowBlur = () => finish(null, false);
    const onKey = () => { if (cellRangeDragRef.current) flushSync(() => finish(null, false)); };
    window.addEventListener("keydown", onKey, { capture: true });
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("blur", onWindowBlur);
      cellRangeDragRef.current = null;
      rangePreview.clear();
    };
  }, [rangePreview, pageId, sheet.id]);
  return {
    beginCellRangeDrag,
    beginSelectionMoveDrag,
    beginTouchRangeDrag,
  };
}
