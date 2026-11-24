"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

import {
  TOUCH_DOUBLE_TAP_MS,
  TOUCH_LONG_PRESS_SLOP_PX,
  createDoubleTapDetector,
  createPointerVelocityTracker,
  holdTouchGesture,
  swallowNextClick,
  touchFlickDirection,
  touchHaptic,
  watchTouchLongPress,
  type TouchFlickDirection,
  type TouchLongPressWatch,
} from "@mrnote/core/web/lib/touch-gestures.ts";

import type { SpreadsheetTouchGripCorner } from "./SpreadsheetTouchSelectionLayer";
import { useChangedState } from "@mrnote/core/web/hooks/useChangedState.ts";



























type Cell = { row: number; col: number };
type Rect = { r1: number; r2: number; c1: number; c2: number };
type Pointer = { pointerId: number; clientX: number; clientY: number };

export interface SpreadsheetTouchGestureInputs {
  readonly gridWrapRef: RefObject<HTMLDivElement | null>;
  readonly sheetId: string;
  readonly activeCell: Cell;
  readonly selRect: Rect;
  readonly hasMultiSelection: boolean;
  readonly editing: boolean;
  readonly gridRtl: boolean;
  /** Screen px of the heading bands (0 when headings are hidden). */
  readonly headerTop: number;
  readonly headerStart: number;
  readonly writeAllowed: () => boolean;
  readonly isCellSelectable: (row: number, col: number) => boolean;
  readonly beginTouchRangeDrag: (pointer: Pointer, fixed: Cell, moving: Cell) => boolean;
  readonly beginSelectionMoveDrag: (
    event: ReactPointerEvent<HTMLInputElement>,
    row: number,
    col: number,
  ) => void;
  readonly cancelSelectionMoveDrag: () => void;
  readonly beginFillDrag: (event: ReactPointerEvent) => void;
  readonly startColumnResize: (col: number, event: ReactPointerEvent<HTMLElement>) => void;
  readonly startRowResize: (row: number, event: ReactPointerEvent<HTMLElement>) => void;
  readonly selectWholeColumn: (col: number, extend?: boolean) => void;
  readonly selectWholeRow: (row: number, extend?: boolean) => void;
  readonly autoFitLines: (axis: "col" | "row", index: number) => void;
  readonly beginCellEditing: (row: number, col: number, input: HTMLElement) => void;
  /** Ctrl+Shift+Arrow from the selection's far end, by screen direction. */
  readonly extendToDataEdge: (direction: TouchFlickDirection) => void;
}

export interface SpreadsheetTouchCommandBarState {
  readonly x: number;
  readonly y: number;
}

/** A cell's own press counts as the tap of the selection it already has. */
function insideRect(rect: Rect, row: number, col: number): boolean {
  return row >= rect.r1 && row <= rect.r2 && col >= rect.c1 && col <= rect.c2;
}

/** The heading under a point, through anything above it (a held grip). */
function headingAt(x: number, y: number, axis: "col" | "row", root: HTMLElement): number | null {
  const attribute = axis === "col" ? "data-header-col" : "data-header-row";
  const stack =
    typeof document.elementsFromPoint === "function"
      ? document.elementsFromPoint(x, y)
      : typeof document.elementFromPoint === "function"
        ? [document.elementFromPoint(x, y)].filter((element): element is Element => element !== null)
        : [];
  for (const element of stack) {
    const heading = element.closest(`th[${attribute}]`);
    if (heading && root.contains(heading)) {
      const index = Number(heading.getAttribute(attribute));
      return Number.isInteger(index) ? index : null;
    }
  }
  return null;
}

/**
 * The shortcut menu at a press point, as a right-click opens it: a
 * `contextmenu` on the pressed cell, which the grid's own handler takes.
 */
function openShortcutMenu(target: Element, at: { clientX: number; clientY: number }) {
  const element = target.isConnected
    ? target
    : typeof document.elementFromPoint === "function"
      ? document.elementFromPoint(at.clientX, at.clientY)
      : null;
  element?.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: at.clientX,
      clientY: at.clientY,
      button: 2,
    }),
  );
  swallowNextClick();
}

export function useSpreadsheetTouchGestures(inputs: SpreadsheetTouchGestureInputs) {
  const live = useRef(inputs);
  live.current = inputs;

  const [dragging, setDragging] = useChangedState(false);
  const [emphasisNonce, setEmphasisNonce] = useState(0);
  const [fillArmed, setFillArmed] = useChangedState(false);
  const [commandBar, setCommandBar] = useChangedState<SpreadsheetTouchCommandBarState | null>(null);

  const pressRef = useRef<TouchLongPressWatch | null>(null);
  const commandBarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doubleTapRef = useRef(createDoubleTapDetector());
  const suppressDblClickUntilRef = useRef(0);
  const endGestureRef = useRef<(() => void) | null>(null);

  const cancelCommandBarTimer = () => {
    if (commandBarTimerRef.current !== null) clearTimeout(commandBarTimerRef.current);
    commandBarTimerRef.current = null;
  };

  /** Track one held pointer to its release; `onEnd` runs once. */
  const followPointer = useCallback(
    (
      pointerId: number,
      handlers: {
        onMove?: (event: PointerEvent) => void;
        onEnd?: (event: PointerEvent | null, cancelled: boolean) => void;
      },
    ) => {
      endGestureRef.current?.();
      setDragging(true);
      let ended = false;
      const move = (event: PointerEvent) => {
        if (event.pointerId === pointerId) handlers.onMove?.(event);
      };
      const finish = (event: PointerEvent | null, cancelled: boolean) => {
        if (ended) return;
        ended = true;
        window.removeEventListener("pointermove", move, true);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", cancel);
        if (endGestureRef.current === stop) endGestureRef.current = null;
        setDragging(false);
        handlers.onEnd?.(event, cancelled);
      };
      // bubbling listeners: the mouse drag's own release runs first
      const up = (event: PointerEvent) => {
        if (event.pointerId === pointerId) finish(event, false);
      };
      const cancel = (event: PointerEvent) => {
        if (event.pointerId === pointerId) finish(event, true);
      };
      const stop = () => finish(null, true);
      window.addEventListener("pointermove", move, true);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
      endGestureRef.current = stop;
    },
    [],
  );

  // --- whole lines: a heading drag, or a grip on a whole-line selection ----
  const beginLineDrag = useCallback(
    (axis: "col" | "row", fixed: number, pointer: Pointer, alreadySelected: boolean) => {
      const viewport = live.current.gridWrapRef.current;
      if (!viewport) return;
      const release = holdTouchGesture(viewport, pointer.pointerId);
      const select = (index: number, extend: boolean) =>
        axis === "col"
          ? live.current.selectWholeColumn(index, extend)
          : live.current.selectWholeRow(index, extend);
      if (!alreadySelected) select(fixed, false);
      let current = -1;
      let lastPoint = { x: pointer.clientX, y: pointer.clientY };
      let frame = 0;
      // A finger in the heading band picks the line under it; past the band
      // (in the cells) the band's line at the finger's other coordinate.
      const lineAt = (x: number, y: number) => {
        const rect = viewport.getBoundingClientRect();
        const { headerTop, headerStart, gridRtl } = live.current;
        const bandY = rect.top + Math.max(1, headerTop / 2);
        const bandX = gridRtl ? rect.right - Math.max(1, headerStart / 2) : rect.left + Math.max(1, headerStart / 2);
        return axis === "col" ? headingAt(x, bandY, axis, viewport) : headingAt(bandX, y, axis, viewport);
      };
      const extendTo = (x: number, y: number) => {
        const index = lineAt(x, y);
        if (index === null || index === current) return;
        current = index;
        select(index, true);
      };
      // Excel scrolls on while the finger rests by the window's edge.
      const edgeScroll = () => {
        frame = 0;
        const rect = viewport.getBoundingClientRect();
        const band = 32;
        let delta = 0;
        if (axis === "col") {
          if (lastPoint.x < rect.left + band) delta = -16;
          else if (lastPoint.x > rect.right - band) delta = 16;
          if (delta) viewport.scrollLeft += delta;
        } else {
          if (lastPoint.y < rect.top + live.current.headerTop + band) delta = -16;
          else if (lastPoint.y > rect.bottom - band) delta = 16;
          if (delta) viewport.scrollTop += delta;
        }
        if (delta) {
          extendTo(lastPoint.x, lastPoint.y);
          frame = requestAnimationFrame(edgeScroll);
        }
      };
      followPointer(pointer.pointerId, {
        onMove: (event) => {
          lastPoint = { x: event.clientX, y: event.clientY };
          extendTo(event.clientX, event.clientY);
          if (!frame) frame = requestAnimationFrame(edgeScroll);
        },
        onEnd: () => {
          if (frame) cancelAnimationFrame(frame);
          release();
          swallowNextClick();
        },
      });
    },
    [followPointer],
  );

  // --- the selection grips ---------------------------------------------------
  const onSelectionGrip = useCallback(
    (
      corner: SpreadsheetTouchGripCorner,
      lines: "col" | "row" | null,
      event: ReactPointerEvent<HTMLSpanElement>,
    ) => {
      event.preventDefault();
      event.stopPropagation();
      setCommandBar(null);
      const { selRect, gridWrapRef } = live.current;

      const pointer = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
      if (lines) {
        const fixed =
          lines === "col"
            ? corner === "end" ? selRect.c1 : selRect.c2
            : corner === "end" ? selRect.r1 : selRect.r2;
        // the fixed line is the band's origin, the far one the finger's
        const far =
          lines === "col"
            ? corner === "end" ? selRect.c2 : selRect.c1
            : corner === "end" ? selRect.r2 : selRect.r1;
        if (lines === "col") live.current.selectWholeColumn(fixed);
        else live.current.selectWholeRow(fixed);
        if (far !== fixed) {
          if (lines === "col") live.current.selectWholeColumn(far, true);
          else live.current.selectWholeRow(far, true);
        }
        beginLineDrag(lines, fixed, pointer, true);
        return;
      }
      const fixed = corner === "end" ? { row: selRect.r1, col: selRect.c1 } : { row: selRect.r2, col: selRect.c2 };
      const moving = corner === "end" ? { row: selRect.r2, col: selRect.c2 } : { row: selRect.r1, col: selRect.c1 };
      const viewport = gridWrapRef.current;
      if (!live.current.beginTouchRangeDrag(pointer, fixed, moving)) return;
      const release = holdTouchGesture(viewport, event.pointerId);
      const velocity = createPointerVelocityTracker();
      velocity.add(event.clientX, event.clientY);
      followPointer(event.pointerId, {
        onMove: (move) => velocity.add(move.clientX, move.clientY),
        onEnd: (end, cancelled) => {
          release();
          if (cancelled || !end) return;
          velocity.add(end.clientX, end.clientY);
          const direction = touchFlickDirection(velocity.velocity());
          // The release has been committed by now; the flick carries the far
          // end on to the data edge once that commit has rendered.
          if (direction) setTimeout(() => live.current.extendToDataEdge(direction), 0);
        },
      });
    },
    [beginLineDrag, followPointer],
  );

  const onFillGrip = useCallback(
    (event: ReactPointerEvent<HTMLSpanElement>) => {
      setCommandBar(null);
      setFillArmed(false);
      const viewport = live.current.gridWrapRef.current;
      const pointerId = event.pointerId;
      live.current.beginFillDrag(event);
      const release = holdTouchGesture(viewport, pointerId);
      followPointer(pointerId, { onEnd: () => release() });
    },
    [followPointer],
  );

  const onResizeGrip = useCallback(
    (axis: "col" | "row", index: number, event: ReactPointerEvent<HTMLSpanElement>) => {
      setCommandBar(null);
      if (doubleTapRef.current.tap(event.clientX, event.clientY, `resize:${axis}:${index}`)) {
        event.preventDefault();
        event.stopPropagation();
        live.current.autoFitLines(axis, index);
        return;
      }
      const viewport = live.current.gridWrapRef.current;
      const pointerId = event.pointerId;
      if (axis === "col") live.current.startColumnResize(index, event);
      else live.current.startRowResize(index, event);
      const release = holdTouchGesture(viewport, pointerId);
      followPointer(pointerId, { onEnd: () => release() });
    },
    [followPointer],
  );

  // --- a finger on a cell ----------------------------------------------------
  const onTouchCellPress = useCallback(
    (event: ReactPointerEvent<HTMLInputElement>, row: number, col: number) => {
      if (!event.isPrimary) return;
      const input = event.currentTarget;
      const { activeCell, selRect, hasMultiSelection } = live.current;
      const wasActive = activeCell.row === row && activeCell.col === col;
      const inSelection = hasMultiSelection && insideRect(selRect, row, col);
      const pointer = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
      cancelCommandBarTimer();
      pressRef.current?.cancel();
      pressRef.current = watchTouchLongPress(pointer, {
        slopPx: TOUCH_LONG_PRESS_SLOP_PX,
        onLongPress: () => {
          pressRef.current = null;
          const current = live.current;
          const viewport = current.gridWrapRef.current;
          if (!viewport || !current.isCellSelectable(row, col)) return;
          // the platform's own long press (a text callout) must not start
          window.getSelection?.()?.removeAllRanges();
          const moving = inSelection && current.writeAllowed();
          if (moving) {
            // Excel: hold a selected range, then drag it somewhere else.
            current.beginSelectionMoveDrag(
              { ...pointer, ctrlKey: false, metaKey: false } as unknown as ReactPointerEvent<HTMLInputElement>,
              row,
              col,
            );
          } else if (!current.beginTouchRangeDrag(pointer, { row, col }, { row, col })) {
            return;
          } else {
            setEmphasisNonce((nonce) => nonce + 1);
            const cell = input.closest("td");
            cell?.setAttribute("data-touch-press", "true");
            setTimeout(() => cell?.removeAttribute("data-touch-press"), 320);
          }
          const release = holdTouchGesture(viewport, pointer.pointerId);
          touchHaptic();
          // A hold that never travels is the shortcut menu's (Excel on
          // Android: press and hold a cell), opened when the finger lifts.
          let travelled = false;
          followPointer(pointer.pointerId, {
            onMove: (move) => {
              if (Math.hypot(move.clientX - pointer.clientX, move.clientY - pointer.clientY) > TOUCH_LONG_PRESS_SLOP_PX) {
                travelled = true;
              }
            },
            onEnd: (end, cancelled) => {
              release();
              if (travelled || cancelled || !end) return;
              if (moving) live.current.cancelSelectionMoveDrag();
              openShortcutMenu(input, pointer);
            },
          });
        },
        onAbort: (reason, end) => {
          pressRef.current = null;
          if (reason !== "released" || !end) return;
          const current = live.current;
          if (current.editing) return;
          // A double tap edits the cell (Excel: double-tap a cell). The
          // browser's own dblclick, where one follows, is the same request.
          if (doubleTapRef.current.tap(end.clientX, end.clientY, `${current.sheetId}:${row}:${col}`)) {
            suppressDblClickUntilRef.current = Date.now() + 500;
            setCommandBar(null);
            current.beginCellEditing(row, col, input);
            return;
          }
          // A second tap on the active cell: the touch command bar, once the
          // double-tap window has passed without a second tap.
          if (wasActive) {
            const at = { x: end.clientX, y: end.clientY };
            commandBarTimerRef.current = setTimeout(() => {
              commandBarTimerRef.current = null;
              if (!live.current.editing) setCommandBar(at);
            }, TOUCH_DOUBLE_TAP_MS);
          }
        },
      });
    },
    [followPointer],
  );

  // --- a pen on a cell -------------------------------------------------------
  // The range drag itself is the mouse's (useSpreadsheetCellRangeDrag); the
  // page must only not scroll under the pen while it drags.
  const onPenCellPress = useCallback((event: ReactPointerEvent<HTMLInputElement>) => {
    const viewport = live.current.gridWrapRef.current;
    if (!viewport) return;
    holdTouchGesture(viewport, event.pointerId);
  }, []);

  // --- headings, the browser's dblclick, and the shortcut menu -------------
  // Window listeners that look for the live grid: the grid mounts after the
  // workbook loads and moves between split panes, so no element is stable.
  const gridWrapRef = inputs.gridWrapRef;
  useEffect(() => {
    const inGrid = (target: EventTarget | null): Element | null => {
      const element = target instanceof Element ? target : null;
      return element && gridWrapRef.current?.contains(element) ? element : null;
    };
    const onPointerDown = (event: PointerEvent) => {
      // A finger only: a pen on a heading is a precise pointer (its click).
      if (event.pointerType !== "touch" || !event.isPrimary || event.button > 0) return;
      const target = inGrid(event.target);
      const heading = target?.closest<HTMLElement>("th[data-header-col], th[data-header-row]");
      if (!heading) return;
      // the edge divider, a filter arrow, a button: their own presses
      if (target?.closest('[role="separator"], button, input, select, a')) return;
      const axis = heading.hasAttribute("data-header-col") ? "col" : "row";
      const index = Number(heading.getAttribute(axis === "col" ? "data-header-col" : "data-header-row"));
      if (!Number.isInteger(index)) return;
      setCommandBar(null);
      const start = { x: event.clientX, y: event.clientY };
      const pointerId = event.pointerId;
      let begun = false;
      const stop = () => {
        window.removeEventListener("pointermove", move, true);
        window.removeEventListener("pointerup", up, true);
        window.removeEventListener("pointercancel", stop, true);
      };
      const move = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId || begun) return;
        const along = axis === "col" ? moveEvent.clientX - start.x : moveEvent.clientY - start.y;
        if (Math.abs(along) <= TOUCH_LONG_PRESS_SLOP_PX) return;
        begun = true;
        stop();
        // Excel: drag along the headings to select the lines it crosses,
        // from the one the finger pressed.
        beginLineDrag(axis, index, { pointerId, clientX: start.x, clientY: start.y }, false);
      };
      const up = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== pointerId) return;
        stop();
        if (begun) return;
        // Excel: double-tap a heading to AutoFit its line (the click of each
        // tap has already selected it).
        if (doubleTapRef.current.tap(upEvent.clientX, upEvent.clientY, `${axis}:${index}`)) {
          live.current.autoFitLines(axis, index);
        }
      };
      window.addEventListener("pointermove", move, true);
      window.addEventListener("pointerup", up, true);
      window.addEventListener("pointercancel", stop, true);
    };
    const onDblClick = (event: MouseEvent) => {
      if (Date.now() > suppressDblClickUntilRef.current || !inGrid(event.target)) return;
      suppressDblClickUntilRef.current = 0;
      event.preventDefault();
      event.stopPropagation();
    };
    // The platform's own long-press menu (Chrome on Android) during a held
    // gesture: the menu is up, so the gesture (and a move it started) ends.
    const onContextMenu = (event: MouseEvent) => {
      if (!event.isTrusted || !endGestureRef.current || !inGrid(event.target)) return;
      live.current.cancelSelectionMoveDrag();
      endGestureRef.current();
    };
    window.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
    window.addEventListener("dblclick", onDblClick, true);
    window.addEventListener("contextmenu", onContextMenu, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("dblclick", onDblClick, true);
      window.removeEventListener("contextmenu", onContextMenu, true);
    };
  }, [beginLineDrag, gridWrapRef]);

  // Editing, another sheet, or the gesture's surface going away end it all.
  useEffect(() => {
    if (!inputs.editing) return;
    cancelCommandBarTimer();
    setCommandBar(null);
    setFillArmed(false);
  }, [inputs.editing]);
  useEffect(
    () => () => {
      pressRef.current?.cancel();
      cancelCommandBarTimer();
      endGestureRef.current?.();
    },
    [inputs.sheetId],
  );

  const closeCommandBar = useCallback(() => setCommandBar(null), []);
  // Where the bar stands: a finger-sized box around the second tap.
  const commandBarAnchor = useMemo(
    () => (commandBar ? { left: commandBar.x - 1, top: commandBar.y - 12, width: 2, height: 24 } : null),
    [commandBar],
  );
  const armFill = useCallback(() => setFillArmed(true), []);

  return {
    onTouchCellPress,
    onPenCellPress,
    onSelectionGrip,
    onFillGrip,
    onResizeGrip,
    dragging,
    emphasisNonce,
    fillArmed,
    armFill,
    commandBar,
    commandBarAnchor,
    closeCommandBar,
  };
}

/** The fill handle's double-click, for a command that has no mouse event. */
export function syntheticHandleEvent(): ReactMouseEvent {
  return {
    preventDefault() {},
    stopPropagation() {},
  } as unknown as ReactMouseEvent;
}
