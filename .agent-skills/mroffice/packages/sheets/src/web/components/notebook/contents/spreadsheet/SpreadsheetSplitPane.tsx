"use client";























/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { wheelKeptByFloatingSurface } from "@mrnote/core/web/lib/popover-fit.ts";
import { createWheelGestureLatch } from "@mrnote/core/web/lib/wheel-gesture.ts";
import { doubleClickOnDoubleTap } from "@mrnote/core/web/lib/double-tap.ts";
import {
  Fragment,
  useCallback,
  useEffect,
  useInsertionEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import type { SplitPaneName } from "@mrnote/core/web/lib/spreadsheet/freeze-panes.ts";
import { lineIndexAtOffset, offsetOfLine } from "@mrnote/core/web/lib/spreadsheet/grid-sizing.ts";
import {
  splitPaneCellAt,
  splitPaneMergeAt,
  splitPaneMergeRect,
  splitPaneVisibleWindow,
  type SplitPaneMerge,
  type SplitPaneWindow,
} from "../../../../lib/spreadsheet/split-pane-geometry";

import { SpreadsheetMemoRow } from "./SpreadsheetMemoRow";

export interface SplitPaneDrawing {
  readonly id: string;
  /** Stage coordinates (the live grid's object layer origin). */
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly zIndex: number;
  readonly node: ReactNode;
}

export type SplitPaneHeadingMark = "partial" | "full" | null;

/** Everything a pane draws, in the live grid's own terms. */
export interface SpreadsheetSplitPanePainter {
  readonly rowCount: number;
  readonly columnCount: number;
  /** Size of a VISUAL row (0 when hidden). */
  readonly rowSize: (visualRow: number) => number;
  /** Size of a column (0 when hidden). */
  readonly colSize: (col: number) => number;
  readonly sourceRow: (visualRow: number) => number;
  readonly visualRow: (sourceRow: number) => number;
  /** Merged ranges in source coordinates (sheet merges and imported spans). */
  readonly merges: readonly SplitPaneMerge[];
  /** Height the stage reserves above row 1 (column outline bar + letters). */
  readonly columnBand: number;
  /** Height of the column outline bar inside the column band. */
  readonly columnOutlineBand: number;
  /** Width the stage reserves before column A (row numbers). */
  readonly rowBand: number;
  readonly showGridlines: boolean;
  readonly columnLabel: (col: number) => string;
  readonly rowLabel: (visualRow: number) => string;
  readonly columnHeadingMark: (col: number) => SplitPaneHeadingMark;
  readonly rowHeadingMark: (sourceRow: number) => SplitPaneHeadingMark;
  readonly hiddenBeforeColumn: (col: number) => boolean;
  readonly hiddenBeforeRow: (sourceRow: number) => boolean;
  readonly renderColumnOutline?: (col: number) => ReactNode;
  readonly renderRowOutline?: (sourceRow: number) => ReactNode;
  readonly renderColumnLevelButtons?: () => ReactNode;
  readonly renderRowLevelButtons?: () => ReactNode;
  readonly cellStyle: (row: number, col: number) => CSSProperties | undefined;
  readonly cellContent: (row: number, col: number, width: number, height: number) => ReactNode;
  /** A cell whose painting leans past its box (an angled cell's band). */
  readonly cellPaintsOutside?: (row: number, col: number) => boolean;
  readonly cellDecorations: (row: number, col: number) => ReactNode;
  readonly textSpill?: (
    row: number,
    col: number,
    width: number,
  ) => { startCol: number; endCol: number } | null;
  readonly drawings: readonly SplitPaneDrawing[];
  /** Stage-coordinate paint over the cells (page breaks), if any. */
  readonly pageOverlay?: ReactNode;
  /**
   * The heading boundaries a pane carries act as the live grid's own (Excel
   * resizes a column from whichever pane shows its letter): drag to resize,
   * double-click to fit or to show the hidden lines after it.
   */
  readonly lineResize?: {
    readonly columnLabel: string;
    readonly rowLabel: string;
    readonly startColumn: (col: number, event: ReactPointerEvent<HTMLSpanElement>) => void;
    readonly startRow: (row: number, event: ReactPointerEvent<HTMLSpanElement>) => void;
    readonly fitColumn: (col: number, event: ReactMouseEvent<HTMLSpanElement>) => void;
    readonly fitRow: (row: number, event: ReactMouseEvent<HTMLSpanElement>) => void;
  };
}

export type SplitPaneTarget =
  | { kind: "cell"; row: number; col: number; extend: boolean }
  | { kind: "column"; col: number; extend: boolean }
  | { kind: "row"; row: number; extend: boolean }
  | { kind: "all" }
  | { kind: "drawing"; id: string; additive: boolean }
  | { kind: "proxy"; row: number; col: number; selector: string };

export interface SpreadsheetSplitPaneProps {
  readonly pane: SplitPaneName;
  readonly ariaLabel: string;
  readonly rtl: boolean;
  readonly zoom: number;
  readonly gridArea: string;
  readonly background: string;
  /** The live grid stage's size (content px), so both share coordinates. */
  readonly stageWidth: number;
  readonly stageHeight: number;
  readonly columnHeadings: boolean;
  readonly rowHeadings: boolean;
  readonly corner: boolean;
  /** Where the pane opens (content px from row 1 / column A). */
  readonly initialScroll: { left: number; top: number };
  readonly painter: SpreadsheetSplitPanePainter;
  /** Visual dependencies of the painted cells and drawings. */
  readonly paintEpoch: readonly unknown[];
  readonly selection: { r1: number; c1: number; r2: number; c2: number } | null;
  readonly activeCell: { row: number; col: number } | null;
  /** The cut / copied range's marching ants, drawn in every pane (Excel). */
  readonly marquee?: { r1: number; c1: number; r2: number; c2: number } | null;
  readonly registerViewport: (pane: SplitPaneName, node: HTMLDivElement | null) => void;
  readonly onScrolled: (pane: SplitPaneName, scroll: { left: number; top: number }) => void;
  readonly onActivate: (
    pane: SplitPaneName,
    target: SplitPaneTarget,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
  readonly onFocusPane: (pane: SplitPaneName) => void;
  readonly onBlurPane?: (pane: SplitPaneName) => void;
  /** The scroll bars this pane carries (Excel: at the window edge only). */
  readonly scrollBars?: { vertical: boolean; horizontal: boolean };
  /** Wheel movement on an axis whose bar a partner pane carries. */
  readonly onHiddenAxisWheel?: (
    pane: SplitPaneName,
    delta: { left: number; top: number },
  ) => void;
}

/**
 * The wheel movement a pane without a scroll bar on an axis hands to the
 * partner that carries it (pixels; Ctrl/Cmd+wheel is zoom, not scroll).
 */
export function splitPaneHiddenAxisWheel(
  event: { deltaX: number; deltaY: number; deltaMode: number; ctrlKey: boolean; metaKey: boolean },
  scrollBars: { vertical: boolean; horizontal: boolean },
  pageHeight: number,
): { left: number; top: number } | null {
  if (event.ctrlKey || event.metaKey) return null;
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? Math.max(1, pageHeight) : 1;
  const left = scrollBars.horizontal ? 0 : event.deltaX * unit;
  const top = scrollBars.vertical ? 0 : event.deltaY * unit;
  return left || top ? { left, top } : null;
}

/**
 * The wheel over a split pane. A gesture that moves along an axis whose bar a
 * partner pane carries is scrolled by hand from its first tick to its end:
 * this pane on its own axis, the partner on the other (whose shared scroll
 * then brings this pane along). Any other gesture is the browser's. Half by
 * hand and half by the browser -- the partner's echo writing this pane's
 * scroll while the browser moved it sideways -- one pane moved from two
 * threads and Safari's screen and its hit testing parted (lib/wheel-gesture).
 * Returns the unsubscribe.
 */
export function attachSplitPaneWheel(
  node: HTMLElement,
  context: () => {
    scrollBars: { vertical: boolean; horizontal: boolean };
    forward: (delta: { left: number; top: number }) => void;
  } | null,
): () => void {
  const gesture = createWheelGestureLatch<boolean>();
  const onWheel = (event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey) return;
    if (wheelKeptByFloatingSurface(event, node)) return;
    const current = context();
    if (!current) return;
    const hidden = splitPaneHiddenAxisWheel(event, current.scrollBars, node.clientHeight);
    const byHand = gesture.hold(event, () => hidden !== null && event.cancelable && !event.defaultPrevented);
    if (!byHand || !event.cancelable || event.defaultPrevented) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? Math.max(1, node.clientHeight) : 1;
    const own = {
      left: current.scrollBars.horizontal ? event.deltaX * unit : 0,
      top: current.scrollBars.vertical ? event.deltaY * unit : 0,
    };
    if ((own.left || own.top) && typeof node.scrollBy === "function") {
      node.scrollBy({ ...own, behavior: "instant" });
    }
    if (hidden) current.forward(hidden);
  };
  node.addEventListener("wheel", onWheel, { passive: false });
  return () => node.removeEventListener("wheel", onWheel);
}

const FALLBACK_VIEW = { width: 1024, height: 640 };
const DRAWING_TILE_PX = 256;
const WINDOW_BLOCK_PX = 160;

function safeScale(zoom: number): number {
  return zoom > 0 && Number.isFinite(zoom) ? zoom : 1;
}

/** A pane's scroll in content pixels (RTL scrolls negative). */
export function readSplitPaneScroll(
  node: HTMLElement,
  zoom: number,
): { left: number; top: number } {
  const scale = safeScale(zoom);
  return {
    left: Math.abs(node.scrollLeft) / scale,
    top: Math.max(0, node.scrollTop) / scale,
  };
}

/** Position a pane's scroll container from content pixels. */
export function writeSplitPaneScroll(
  node: HTMLElement,
  scroll: { left?: number; top?: number },
  zoom: number,
  rtl: boolean,
): void {
  const scale = safeScale(zoom);
  if (scroll.top !== undefined && Number.isFinite(scroll.top)) {
    const top = Math.max(0, scroll.top) * scale;
    if (Math.abs(node.scrollTop - top) >= 1) node.scrollTop = top;
  }
  if (scroll.left !== undefined && Number.isFinite(scroll.left)) {
    const left = Math.max(0, scroll.left) * scale;
    const target = rtl ? -left : left;
    if (Math.abs(node.scrollLeft - target) >= 1) node.scrollLeft = target;
  }
}

/** A press on the pane's own scroll bars (outside its client area). */
function onScrollBar(node: HTMLElement, clientX: number, clientY: number, rtl: boolean): boolean {
  const rect = node.getBoundingClientRect();
  const x = rtl ? rect.right - clientX : clientX - rect.left;
  const y = clientY - rect.top;
  return (
    (node.clientWidth > 0 && x >= node.clientWidth) ||
    (node.clientHeight > 0 && y >= node.clientHeight)
  );
}

function isMerged(merge: SplitPaneMerge | null): merge is SplitPaneMerge {
  return Boolean(merge && (merge.rowSpan > 1 || merge.colSpan > 1));
}

function paintCells(
  painter: SpreadsheetSplitPanePainter,
  paneWindow: SplitPaneWindow,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  const paintedMerges = new Set<string>();
  const { rowCount, columnCount, rowSize, colSize, columnBand, rowBand } = painter;
  // Only the merges that reach this window are looked up per cell.
  let firstRow = Number.POSITIVE_INFINITY;
  let lastRow = Number.NEGATIVE_INFINITY;
  for (const visualRow of paneWindow.rows) {
    const row = painter.sourceRow(visualRow);
    if (row < firstRow) firstRow = row;
    if (row > lastRow) lastRow = row;
  }
  const firstCol = paneWindow.cols[0] ?? 0;
  const lastCol = paneWindow.cols.at(-1) ?? -1;
  const windowMerges = painter.merges.filter(
    (merge) =>
      (merge.rowSpan > 1 || merge.colSpan > 1) &&
      merge.row <= lastRow &&
      merge.row + merge.rowSpan > firstRow &&
      merge.col <= lastCol &&
      merge.col + merge.colSpan > firstCol,
  );
  for (const visualRow of paneWindow.rows) {
    const row = painter.sourceRow(visualRow);
    const rowTop = offsetOfLine(visualRow, rowCount, rowSize);
    const rowHeight = rowSize(visualRow);
    for (const col of paneWindow.cols) {
      const merge = windowMerges.length > 0 ? splitPaneMergeAt(windowMerges, row, col) : null;
      let anchorRow = row;
      let anchorCol = col;
      let rect: { left: number; top: number; width: number; height: number } | null;
      if (isMerged(merge)) {
        // A merge is drawn once, whole, wherever the window first meets it;
        // the pane clips it, so a merge across a split bar shows its part.
        const mergeKey = `${merge.row}:${merge.col}`;
        if (paintedMerges.has(mergeKey)) continue;
        paintedMerges.add(mergeKey);
        anchorRow = merge.row;
        anchorCol = merge.col;
        rect = splitPaneMergeRect(merge, rowCount, columnCount, rowSize, colSize, painter.visualRow);
      } else {
        const width = colSize(col);
        rect =
          width > 0 && rowHeight > 0
            ? { left: offsetOfLine(col, columnCount, colSize), top: rowTop, width, height: rowHeight }
            : null;
      }
      if (!rect) continue;
      const style = painter.cellStyle(anchorRow, anchorCol) ?? {};
      const spill = isMerged(merge) ? null : painter.textSpill?.(anchorRow, anchorCol, rect.width) ?? null;
      let spillBox: { start: number; width: number } | null = null;
      if (spill && (spill.startCol !== anchorCol || spill.endCol !== anchorCol)) {
        const start = offsetOfLine(spill.startCol, columnCount, colSize);
        const end = offsetOfLine(spill.endCol + 1, columnCount, colSize);
        spillBox = { start: start - rect.left, width: end - start };
      }
      const content = painter.cellContent(anchorRow, anchorCol, rect.width, rect.height);
      const paintsOutside = !isMerged(merge) && Boolean(painter.cellPaintsOutside?.(anchorRow, anchorCol));
      nodes.push(
        <div
          key={`${anchorRow}:${anchorCol}`}
          className="spreadsheet-window__split-cell"
          data-split-cell={`${anchorRow}:${anchorCol}`}
          data-merged={isMerged(merge) ? "true" : undefined}
          style={{
            ...style,
            position: "absolute",
            top: columnBand + rect.top,
            left: undefined,
            right: undefined,
            insetInlineStart: rowBand + rect.left,
            width: rect.width,
            height: rect.height,
            boxSizing: "border-box",
            overflow: spillBox || paintsOutside ? "visible" : "hidden",
            zIndex: spillBox || paintsOutside ? 1 : undefined,
          }}
        >
          {content !== null && content !== undefined && content !== false ? (
            <span
              aria-hidden="true"
              className="spreadsheet-window__split-cell-content"
              style={spillBox ? { insetInlineStart: spillBox.start, width: spillBox.width } : undefined}
            >
              {content}
            </span>
          ) : null}
          {painter.cellDecorations(anchorRow, anchorCol)}
        </div>,
      );
    }
  }
  return nodes;
}

function paintDrawings(
  painter: SpreadsheetSplitPanePainter,
  area: { left: number; top: number; width: number; height: number },
): ReactNode[] {
  // A drawing paints in a pane when it overlaps the pane's view; the pane
  // clips it, so a drawing across a split bar shows its part on each side.
  return painter.drawings
    .filter(
      (drawing) =>
        drawing.left < area.left + area.width &&
        drawing.left + drawing.width > area.left &&
        drawing.top < area.top + area.height &&
        drawing.top + drawing.height > area.top,
    )
    .map((drawing) => (
      <div
        key={drawing.id}
        className="spreadsheet-window__split-drawing"
        data-split-drawing={drawing.id}
        style={{
          top: drawing.top,
          insetInlineStart: drawing.left,
          width: drawing.width,
          height: drawing.height,
          zIndex: drawing.zIndex,
        }}
      >
        {drawing.node}
      </div>
    ));
}

type Rect = { top: number; left: number; width: number; height: number };

function paintSelection(
  pane: SplitPaneName,
  painter: SpreadsheetSplitPanePainter,
  selection: SpreadsheetSplitPaneProps["selection"],
  activeCell: SpreadsheetSplitPaneProps["activeCell"],
): ReactNode[] {
  if (!selection) return [];
  const { rowCount, columnCount, rowSize, colSize } = painter;
  const firstVisual = painter.visualRow(selection.r1);
  const lastVisual = painter.visualRow(selection.r2);
  const top = offsetOfLine(Math.min(firstVisual, lastVisual), rowCount, rowSize);
  const bottom = offsetOfLine(Math.max(firstVisual, lastVisual) + 1, rowCount, rowSize);
  const left = offsetOfLine(selection.c1, columnCount, colSize);
  const right = offsetOfLine(selection.c2 + 1, columnCount, colSize);
  if (bottom <= top || right <= left) return [];
  const activeMerge = activeCell ? splitPaneMergeAt(painter.merges, activeCell.row, activeCell.col) : null;
  const activeRect: Rect | null = !activeCell
    ? null
    : isMerged(activeMerge)
      ? splitPaneMergeRect(activeMerge, rowCount, columnCount, rowSize, colSize, painter.visualRow)
      : {
          top: offsetOfLine(painter.visualRow(activeCell.row), rowCount, rowSize),
          height: rowSize(painter.visualRow(activeCell.row)),
          left: offsetOfLine(activeCell.col, columnCount, colSize),
          width: colSize(activeCell.col),
        };
  const boxes: ReactNode[] = [];
  const singleCell =
    activeRect !== null &&
    Math.abs(activeRect.top - top) < 0.5 &&
    Math.abs(activeRect.left - left) < 0.5 &&
    Math.abs(activeRect.top + activeRect.height - bottom) < 0.5 &&
    Math.abs(activeRect.left + activeRect.width - right) < 0.5;
  if (!singleCell) {
    // The range takes a tint except the active cell, which keeps its own fill
    // as the cell that takes the entry (Excel).
    const bands: Rect[] = activeRect
      ? [
          { top, left, width: right - left, height: activeRect.top - top },
          {
            top: activeRect.top + activeRect.height,
            left,
            width: right - left,
            height: bottom - activeRect.top - activeRect.height,
          },
          { top: activeRect.top, left, width: activeRect.left - left, height: activeRect.height },
          {
            top: activeRect.top,
            left: activeRect.left + activeRect.width,
            width: right - activeRect.left - activeRect.width,
            height: activeRect.height,
          },
        ]
      : [{ top, left, width: right - left, height: bottom - top }];
    bands.forEach((band, index) => {
      if (band.width <= 0 || band.height <= 0) return;
      boxes.push(
        <div
          key={`tint:${index}`}
          className="spreadsheet-window__split-selection-tint"
          style={{
            top: painter.columnBand + band.top,
            insetInlineStart: painter.rowBand + band.left,
            width: band.width,
            height: band.height,
          }}
        />,
      );
    });
  }
  boxes.push(
    <div
      key="edge"
      className="spreadsheet-window__split-selection"
      data-testid={`spreadsheet-split-selection-${pane}`}
      style={{
        top: painter.columnBand + top,
        insetInlineStart: painter.rowBand + left,
        width: right - left,
        height: bottom - top,
      }}
    />,
  );
  return boxes;
}

export function SpreadsheetSplitPane(props: SpreadsheetSplitPaneProps) {
  const { pane, painter, zoom, rtl, columnHeadings, rowHeadings, corner, stageWidth, stageHeight } = props;
  const scale = safeScale(zoom);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  // A press activates the pane itself (with the pressed cell); the focus it
  // may bring must not activate it a second time with the pane's old cell.
  const pressedRef = useRef(false);
  const contentScrollRef = useRef(props.initialScroll);
  // Handlers read the latest props; they are published at commit, before any
  // layout effect or event can call them.
  const propsRef = useRef(props);
  useInsertionEffect(() => {
    propsRef.current = props;
  });
  const [view, setView] = useState(() => ({ ...props.initialScroll, ...FALLBACK_VIEW }));
  // The pane carries only the headings of its window edge. The stage keeps
  // the live grid's coordinates, and the bands this pane does not show are
  // pulled out of view rather than drawn.
  const hiddenTop = columnHeadings ? 0 : painter.columnBand;
  const hiddenStart = rowHeadings ? 0 : painter.rowBand;

  const setViewport = useCallback(
    (node: HTMLDivElement | null) => {
      viewportRef.current = node;
      propsRef.current.registerViewport(pane, node);
    },
    [pane],
  );

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return undefined;
    return attachSplitPaneWheel(node, () => {
      const { scrollBars, onHiddenAxisWheel } = propsRef.current;
      return scrollBars && onHiddenAxisWheel
        ? { scrollBars, forward: (delta) => onHiddenAxisWheel(pane, delta) }
        : null;
    });
  }, [pane]);

  useLayoutEffect(() => {
    const node = viewportRef.current;
    if (!node) return undefined;
    writeSplitPaneScroll(node, contentScrollRef.current, scale, rtl);
    const measure = () => {
      const scroll = readSplitPaneScroll(node, scale);
      setView((current) => {
        const next = {
          left: scroll.left,
          top: scroll.top,
          width: node.clientWidth > 0 ? node.clientWidth / scale : current.width,
          height: node.clientHeight > 0 ? node.clientHeight / scale : current.height,
        };
        return next.left === current.left &&
          next.top === current.top &&
          next.width === current.width &&
          next.height === current.height
          ? current
          : next;
      });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [scale, rtl]);

  useEffect(
    () => () => {
      if (frameRef.current !== null && typeof window !== "undefined") {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    },
    [],
  );

  // Data coordinates the viewport covers (a superset under pinned headings),
  // taken in blocks so a scroll repaints the cells every few rows rather than
  // on every row.
  const dataTop = view.top + hiddenTop - painter.columnBand;
  const dataLeft = view.left + hiddenStart - painter.rowBand;
  const blockTop = Math.floor(Math.max(0, dataTop) / WINDOW_BLOCK_PX) * WINDOW_BLOCK_PX;
  const blockLeft = Math.floor(Math.max(0, dataLeft) / WINDOW_BLOCK_PX) * WINDOW_BLOCK_PX;
  const paneWindow = splitPaneVisibleWindow({
    top: blockTop,
    left: blockLeft,
    height: view.height + (dataTop - blockTop) + WINDOW_BLOCK_PX,
    width: view.width + (dataLeft - blockLeft) + WINDOW_BLOCK_PX,
    rowCount: painter.rowCount,
    columnCount: painter.columnCount,
    rowSize: painter.rowSize,
    colSize: painter.colSize,
  });
  const stageView = {
    left: view.left + hiddenStart,
    top: view.top + hiddenTop,
    width: view.width,
    height: view.height,
  };
  const drawingTiles = [
    Math.floor(stageView.left / DRAWING_TILE_PX),
    Math.floor(stageView.top / DRAWING_TILE_PX),
    Math.ceil(stageView.width / DRAWING_TILE_PX),
    Math.ceil(stageView.height / DRAWING_TILE_PX),
  ] as const;

  const onScroll = () => {
    const node = viewportRef.current;
    if (!node) return;
    const scroll = readSplitPaneScroll(node, scale);
    contentScrollRef.current = scroll;
    propsRef.current.onScrolled(pane, scroll);
    if (frameRef.current !== null) return;
    const apply = () => {
      frameRef.current = null;
      const next = contentScrollRef.current;
      setView((current) =>
        current.left === next.left && current.top === next.top ? current : { ...current, ...next },
      );
    };
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      frameRef.current = window.requestAnimationFrame(apply);
    } else {
      apply();
    }
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    // Live controls a pane keeps (the outline buttons) act for themselves.
    if (target?.closest("[data-split-pane-live]")) return;
    const node = viewportRef.current;
    if (!node) return;
    // The pane's scroll bars scroll it; they select nothing.
    if (onScrollBar(node, event.clientX, event.clientY, rtl)) return;
    // A focus a press brings arrives in the same task; a later one (Tab) is
    // the user's own and activates as usual.
    pressedRef.current = true;
    setTimeout(() => {
      pressedRef.current = false;
    }, 0);
    const proxy = target?.closest<HTMLElement>("[data-split-proxy]");
    if (proxy?.dataset.splitProxy) {
      const [row, col] = (proxy.dataset.splitProxyCell ?? "").split(":").map(Number);
      if (Number.isInteger(row) && Number.isInteger(col)) {
        event.preventDefault();
        propsRef.current.onActivate(pane, { kind: "proxy", row, col, selector: proxy.dataset.splitProxy }, event);
        return;
      }
    }
    const drawing = target?.closest<HTMLElement>("[data-split-drawing]");
    if (drawing?.dataset.splitDrawing) {
      event.preventDefault();
      propsRef.current.onActivate(
        pane,
        { kind: "drawing", id: drawing.dataset.splitDrawing, additive: event.shiftKey || event.ctrlKey || event.metaKey },
        event,
      );
      return;
    }
    const rect = node.getBoundingClientRect();
    const viewX = (rtl ? rect.right - event.clientX : event.clientX - rect.left) / scale;
    const viewY = (event.clientY - rect.top) / scale;
    const scroll = readSplitPaneScroll(node, scale);
    const dataX = scroll.left + viewX + hiddenStart - painter.rowBand;
    const dataY = scroll.top + viewY + hiddenTop - painter.columnBand;
    const inColumnHeadings = columnHeadings && viewY < painter.columnBand;
    const inRowHeadings = rowHeadings && viewX < painter.rowBand;
    const extend = event.shiftKey;
    event.preventDefault();
    if (inColumnHeadings && inRowHeadings) {
      propsRef.current.onActivate(pane, { kind: "all" }, event);
      return;
    }
    if (inColumnHeadings) {
      if (viewY < painter.columnOutlineBand) return;
      const col = lineIndexAtOffset(Math.max(0, dataX), painter.columnCount, painter.colSize);
      propsRef.current.onActivate(pane, { kind: "column", col, extend }, event);
      return;
    }
    if (inRowHeadings) {
      const visual = lineIndexAtOffset(Math.max(0, dataY), painter.rowCount, painter.rowSize);
      propsRef.current.onActivate(pane, { kind: "row", row: painter.sourceRow(visual), extend }, event);
      return;
    }
    const hit = splitPaneCellAt({
      x: dataX,
      y: dataY,
      rowCount: painter.rowCount,
      columnCount: painter.columnCount,
      rowSize: painter.rowSize,
      colSize: painter.colSize,
      sourceRow: painter.sourceRow,
    });
    if (!hit) return;
    const merge = splitPaneMergeAt(painter.merges, hit.row, hit.col);
    propsRef.current.onActivate(
      pane,
      { kind: "cell", row: merge?.row ?? hit.row, col: merge?.col ?? hit.col, extend },
      event,
    );
  };

  return (
    <div
      ref={setViewport}
      role="region"
      tabIndex={0}
      aria-label={props.ariaLabel}
      className="spreadsheet-window__grid-wrap spreadsheet-window__split-pane"
      data-testid={`spreadsheet-split-pane-${pane}`}
      data-pane={pane}
      data-active="false"
      data-hide-gridlines={painter.showGridlines ? undefined : "true"}
      data-column-headings={columnHeadings ? "true" : undefined}
      data-row-headings={rowHeadings ? "true" : undefined}
      // Stated either way: an rtl interface must not flip an ltr sheet.
      dir={rtl ? "rtl" : "ltr"}
      onScroll={onScroll}
      onPointerDown={onPointerDown}
      onMouseDown={(event) => {
        // The press already activated the pane; keep the browser from also
        // moving focus here (the live grid takes it).
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest("[data-split-pane-live]")) return;
        if (onScrollBar(event.currentTarget, event.clientX, event.clientY, rtl)) return;
        event.preventDefault();
      }}
      onFocus={(event) => {
        if (event.target !== event.currentTarget) return;
        if (pressedRef.current) {
          pressedRef.current = false;
          return;
        }
        props.onFocusPane(pane);
      }}
      onBlur={() => props.onBlurPane?.(pane)}
      style={{
        gridArea: props.gridArea,
        background: props.background,
        ...(props.scrollBars
          ? {
              overflowX: props.scrollBars.horizontal ? "auto" : "hidden",
              overflowY: props.scrollBars.vertical ? "auto" : "hidden",
            }
          : {}),
      }}
    >
      <div
        className="spreadsheet-window__split-pane-stage"
        style={{
          width: stageWidth,
          minWidth: stageWidth,
          height: stageHeight,
          marginTop: -hiddenTop,
          marginInlineStart: -hiddenStart,
          ...(scale === 1 ? {} : { zoom: scale }),
        }}
      >
        {columnHeadings ? (
          <div
            className="spreadsheet-window__split-headings spreadsheet-window__split-headings--columns"
            style={{ width: stageWidth, height: painter.columnBand }}
          >
            {corner ? (
              <div
                className="spreadsheet-window__split-corner"
                data-testid={`spreadsheet-split-corner-${pane}`}
                style={{ width: painter.rowBand, height: painter.columnBand }}
              >
                {painter.columnOutlineBand > 0 && painter.renderColumnLevelButtons ? (
                  <span
                    data-split-pane-live="true"
                    className="spreadsheet-window__split-corner-levels"
                    style={{ height: painter.columnOutlineBand }}
                  >
                    {painter.renderColumnLevelButtons()}
                  </span>
                ) : null}
                {painter.renderRowLevelButtons ? (
                  <span
                    data-split-pane-live="true"
                    className="spreadsheet-window__split-corner-levels"
                    style={{ height: painter.columnBand - painter.columnOutlineBand }}
                  >
                    {painter.renderRowLevelButtons()}
                  </span>
                ) : null}
              </div>
            ) : null}
            {paneWindow.cols.map((col) => {
              const start = painter.rowBand + offsetOfLine(col, painter.columnCount, painter.colSize);
              const width = painter.colSize(col);
              return (
                <Fragment key={col}>
                  {painter.columnOutlineBand > 0 ? (
                    <div
                      className="spreadsheet-window__split-outline spreadsheet-window__split-outline--column"
                      data-split-pane-live="true"
                      style={{ top: 0, insetInlineStart: start, width, height: painter.columnOutlineBand }}
                    >
                      {painter.renderColumnOutline?.(col)}
                    </div>
                  ) : null}
                  <div
                    className="spreadsheet-window__split-heading"
                    data-axis="column"
                    data-split-heading-col={col}
                    data-selection-header={painter.columnHeadingMark(col) ?? undefined}
                    data-hidden-before={painter.hiddenBeforeColumn(col) ? "true" : undefined}
                    style={{
                      top: painter.columnOutlineBand,
                      insetInlineStart: start,
                      width,
                      height: painter.columnBand - painter.columnOutlineBand,
                    }}
                  >
                    {painter.columnLabel(col)}
                    {painter.lineResize ? (
                      <span
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={painter.lineResize.columnLabel}
                        title={painter.lineResize.columnLabel}
                        className="spreadsheet-window__split-resizer spreadsheet-window__split-resizer--column"
                        data-split-pane-live="true"
                        data-testid={`spreadsheet-split-col-resize-${col}`}
                        onPointerDown={(event) => painter.lineResize?.startColumn(col, event)}
                        onDoubleClick={(event) => painter.lineResize?.fitColumn(col, event)}
                        // A finger's double tap fits the column as a double-click does.
                        onClick={doubleClickOnDoubleTap}
                      />
                    ) : null}
                  </div>
                </Fragment>
              );
            })}
          </div>
        ) : null}
        {rowHeadings ? (
          <div
            className="spreadsheet-window__split-headings spreadsheet-window__split-headings--rows"
            style={{
              width: painter.rowBand,
              height: Math.max(0, stageHeight - painter.columnBand),
              marginTop: columnHeadings ? 0 : painter.columnBand,
            }}
          >
            {paneWindow.rows.map((visualRow) => {
              const row = painter.sourceRow(visualRow);
              return (
                <div
                  key={visualRow}
                  className="spreadsheet-window__split-heading"
                  data-axis="row"
                  data-split-heading-row={visualRow}
                  data-selection-header={painter.rowHeadingMark(row) ?? undefined}
                  data-hidden-before={painter.hiddenBeforeRow(row) ? "true" : undefined}
                  style={{
                    top: offsetOfLine(visualRow, painter.rowCount, painter.rowSize),
                    insetInlineStart: 0,
                    width: painter.rowBand,
                    height: painter.rowSize(visualRow),
                  }}
                >
                  {painter.renderRowOutline ? (
                    <span
                      className="spreadsheet-window__split-outline spreadsheet-window__split-outline--row"
                      data-split-pane-live="true"
                    >
                      {painter.renderRowOutline(row)}
                    </span>
                  ) : null}
                  <span
                    style={painter.renderRowOutline ? { marginInlineStart: 16, display: "inline-block" } : undefined}
                  >
                    {painter.rowLabel(visualRow)}
                  </span>
                  {painter.lineResize ? (
                    <span
                      role="separator"
                      aria-orientation="horizontal"
                      aria-label={painter.lineResize.rowLabel}
                      title={painter.lineResize.rowLabel}
                      className="spreadsheet-window__split-resizer spreadsheet-window__split-resizer--row"
                      data-split-pane-live="true"
                      data-testid={`spreadsheet-split-row-resize-${visualRow}`}
                      onPointerDown={(event) => painter.lineResize?.startRow(row, event)}
                      onDoubleClick={(event) => painter.lineResize?.fitRow(row, event)}
                      // A finger's double tap fits the row as a double-click does.
                      onClick={doubleClickOnDoubleTap}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
        <SpreadsheetMemoRow
          epoch={props.paintEpoch}
          interaction={[paneWindow.key, scale, rtl, stageWidth, stageHeight]}
          render={() => (
            <div className="spreadsheet-window__split-cells" aria-hidden="true">
              {paintCells(painter, paneWindow)}
            </div>
          )}
        />
        {painter.pageOverlay ?? null}
        <div className="spreadsheet-window__split-selection-layer" aria-hidden="true">
          {paintSelection(pane, painter, props.selection, props.activeCell)}
          {props.marquee
            ? (() => {
                const range = props.marquee;
                const first = painter.visualRow(range.r1);
                const last = painter.visualRow(range.r2);
                const top = offsetOfLine(Math.min(first, last), painter.rowCount, painter.rowSize);
                const bottom = offsetOfLine(Math.max(first, last) + 1, painter.rowCount, painter.rowSize);
                const start = offsetOfLine(range.c1, painter.columnCount, painter.colSize);
                const end = offsetOfLine(range.c2 + 1, painter.columnCount, painter.colSize);
                return bottom > top && end > start ? (
                  <div
                    className="spreadsheet-window__split-marquee"
                    data-testid={`spreadsheet-split-marquee-${pane}`}
                    style={{
                      top: painter.columnBand + top,
                      insetInlineStart: painter.rowBand + start,
                      width: end - start,
                      height: bottom - top,
                    }}
                  />
                ) : null;
              })()
            : null}
        </div>
        <SpreadsheetMemoRow
          epoch={props.paintEpoch}
          interaction={drawingTiles}
          render={() => (
            <div className="spreadsheet-window__split-drawings">
              {paintDrawings(painter, {
                left: (drawingTiles[0] - 1) * DRAWING_TILE_PX,
                top: (drawingTiles[1] - 1) * DRAWING_TILE_PX,
                width: (drawingTiles[2] + 2) * DRAWING_TILE_PX,
                height: (drawingTiles[3] + 2) * DRAWING_TILE_PX,
              })}
            </div>
          )}
        />
      </div>
    </div>
  );
}
