"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

import { OfficeTouchGrip } from "@mrnote/core/web/components/office-ribbon/OfficeTouchGrip.tsx";

import { sheetFrozenPanes, type SheetRangePaneLayerRefs } from "./SheetRangePaneLayers";
import { SPREADSHEET_GRID_TOUCH_GRIP_LAYER } from "./spreadsheetGridConstants";
import { sheetRangePaneLayer, type SheetFrozenLines, type SheetRangePane } from "./useSheetRangeBoxes";

/**
 * Excel's touch selection handles on the live grid (Excel for iPad / Android:
 * "tap a cell, then drag a selection handle"): a round grip on the
 * selection's top-left and bottom-right corners, the fill grip just below the
 * bottom-right one, and on a whole-column or whole-row selection the double
 * line on its heading's trailing edge that resizes it.
 *
 * The grips are not inside cells. They sit on one layer in the grid's
 * scrolled content (the stage), placed by measuring the cells the selection
 * paint has already marked as its corners (`data-selection-edges` "top
 * start" / "bottom end", or the active cell): that paint has already resolved
 * merges, hidden lines, frozen panes, zoom and right-to-left, so the grips
 * land wherever the drawn border is. Being in the content, they scroll with
 * the cells in the same composited move -- a layer over the pane followed the
 * scroll a frame or more late, so a swipe left the grips off the selection --
 * and pass under the frozen bands and the headings as the cells do. A corner
 * scrolled under a frozen band or a heading, or out of the mounted window,
 * has no grip.
 */

export type SpreadsheetTouchGripCorner = "start" | "end";

interface Point {
  readonly x: number;
  readonly y: number;
  /** The frozen pane whose cell the grip stands on: drawn on that pane's
   * pinned layer, in its pixels ("body", the default: the layer itself). */
  readonly pane?: SheetRangePane;
}

/** The pane a grid cell stands in, from what its paint marks
 * (`data-frozen`, `data-frozen-pane`, its row's `data-frozen-row`). */
function cellPane(cell: HTMLElement): SheetRangePane {
  if (cell.dataset.frozenPane === "corner") return "corner";
  if (cell.closest("tr")?.hasAttribute("data-frozen-row")) return "top";
  return cell.dataset.frozen === "true" ? "left" : "body";
}

export interface SpreadsheetTouchGripGeometry {
  readonly start: Point | null;
  readonly end: Point | null;
  readonly fill: (Point & { readonly beside: boolean }) | null;
  readonly resize: (Point & { readonly axis: "col" | "row"; readonly index: number }) | null;
  /** Whole lines: the grips stand on the heading band's edge. */
  readonly lines: "col" | "row" | null;
  /** Layer px per screen px (the inverse of the zoomed stage's scale). */
  readonly unscale: number;
}

export interface SpreadsheetTouchMeasureOptions {
  readonly rtl: boolean;
  /** The heading bands' size in screen px (0 when headings are hidden). */
  readonly headerTop: number;
  readonly headerStart: number;
  readonly wholeColumns: { readonly c1: number; readonly c2: number } | null;
  readonly wholeRows: { readonly r1: number; readonly r2: number } | null;
  readonly showFill: boolean;
}

/** How far below the selection grip the fill grip hangs (screen px). */
const FILL_GRIP_OFFSET_PX = 34;
const EMPTY: SpreadsheetTouchGripGeometry = {
  start: null,
  end: null,
  fill: null,
  resize: null,
  lines: null,
  unscale: 1,
};

function topRangeCellAt(x: number, y: number): Element | null | undefined {
  // undefined: this DOM cannot tell (jsdom), so the caller trusts the rect
  if (typeof document.elementsFromPoint !== "function") return undefined;
  for (const element of document.elementsFromPoint(x, y)) {
    if (element.closest("[data-office-touch-grip]")) continue;
    const cell = element.closest("td[data-range-cell]");
    if (cell) return cell;
    // a heading or a frozen band's own chrome covers the point
    if (element.closest("th")) return null;
  }
  return null;
}

/** Where the grips go, in the layer's pixels. Pure DOM reads, no writes. */
export function measureSpreadsheetTouchGrips(
  viewport: HTMLElement,
  layer: HTMLElement,
  options: SpreadsheetTouchMeasureOptions,
  /** A frozen pane's pinned layer (absent: the grips of that pane's cells are
   * drawn on `layer`, under the frozen cells). */
  paneLayer: (pane: SheetRangePane) => HTMLElement | null | undefined = () => null,
): SpreadsheetTouchGripGeometry {
  const view = viewport.getBoundingClientRect();
  if (view.width <= 0 || view.height <= 0) return EMPTY;
  const origin = layer.getBoundingClientRect();
  // The stage may be zoomed: the layer's own pixels are layout pixels.
  const unscale = origin.width > 0 && layer.offsetWidth > 0 ? layer.offsetWidth / origin.width : 1;
  const { rtl } = options;
  const dataLeft = view.left + (rtl ? 0 : options.headerStart);
  const dataRight = view.right - (rtl ? options.headerStart : 0);
  const dataTop = view.top + options.headerTop;
  const dataBottom = view.bottom;
  const inData = (x: number, y: number) =>
    x >= dataLeft - 1 && x <= dataRight + 1 && y >= dataTop - 1 && y <= dataBottom + 1;
  const local = (x: number, y: number, pane: SheetRangePane = "body"): Point => {
    // A grip on a frozen cell is drawn on its pane's pinned layer, over the
    // frozen cells (on `layer`, under them, the cell covered it).
    const pinned = pane === "body" ? null : paneLayer(pane);
    const from = pinned ? pinned.getBoundingClientRect() : origin;
    return {
      x: (x - from.left) * unscale,
      y: (y - from.top) * unscale,
      ...(pinned ? { pane } : {}),
    };
  };
  const startX = (rect: DOMRect) => (rtl ? rect.right : rect.left);
  const endX = (rect: DOMRect) => (rtl ? rect.left : rect.right);
  const inward = rtl ? -1 : 1;

  if (options.wholeColumns && options.wholeRows) return EMPTY;
  if (options.wholeColumns || options.wholeRows) {
    const axis = options.wholeColumns ? "col" : "row";
    const first = options.wholeColumns ? options.wholeColumns.c1 : options.wholeRows!.r1;
    const last = options.wholeColumns ? options.wholeColumns.c2 : options.wholeRows!.r2;
    const heading = (index: number) =>
      viewport.querySelector<HTMLElement>(
        axis === "col" ? `th[data-header-col="${index}"]` : `th[data-header-row="${index}"]`,
      );
    const firstHeading = heading(first);
    const lastHeading = heading(last);
    let start: Point | null = null;
    let end: Point | null = null;
    let resize: SpreadsheetTouchGripGeometry["resize"] = null;
    if (axis === "col") {
      const visible = (x: number) => x >= dataLeft - 1 && x <= dataRight + 1;
      if (firstHeading) {
        const rect = firstHeading.getBoundingClientRect();
        if (visible(startX(rect))) start = local(startX(rect), rect.bottom);
      }
      if (lastHeading) {
        const rect = lastHeading.getBoundingClientRect();
        if (visible(endX(rect))) {
          end = local(endX(rect), rect.bottom);
          resize = { ...local(endX(rect), rect.top + rect.height / 2), axis, index: last };
        }
      }
    } else {
      const visible = (y: number) => y >= dataTop - 1 && y <= dataBottom + 1;
      if (firstHeading) {
        const rect = firstHeading.getBoundingClientRect();
        if (visible(rect.top)) start = local(endX(rect), rect.top);
      }
      if (lastHeading) {
        const rect = lastHeading.getBoundingClientRect();
        if (visible(rect.bottom)) {
          end = local(endX(rect), rect.bottom);
          resize = {
            ...local(rect.left + rect.width / 2, rect.bottom),
            axis,
            index: last,
          };
        }
      }
    }
    return {
      start,
      end,
      fill: null,
      resize,
      lines: axis,
      unscale,
    };
  }

  const cornerCell = (vertical: "top" | "bottom", horizontal: "start" | "end") =>
    viewport.querySelector<HTMLElement>(
      `td[data-range-cell][data-selection-edges~="${vertical}"][data-selection-edges~="${horizontal}"]`,
    ) ?? viewport.querySelector<HTMLElement>('td[data-range-cell][data-active="true"]');
  // The end grip's screen height: the fill grip hangs below it if there is room.
  let endScreenY = 0;
  const corner = (cell: HTMLElement | null, which: SpreadsheetTouchGripCorner): Point | null => {
    if (!cell) return null;
    const rect = cell.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = which === "start" ? startX(rect) : endX(rect);
    const y = which === "start" ? rect.top : rect.bottom;
    if (!inData(x, y)) return null;
    // A corner under a frozen band (or a heading) is hidden with its cell.
    const probeX = x + (which === "start" ? 3 : -3) * inward;
    const probeY = y + (which === "start" ? 3 : -3);
    const top = topRangeCellAt(probeX, probeY);
    if (top !== undefined && top !== cell) return null;
    if (which === "end") endScreenY = y;
    return local(x, y, cellPane(cell));
  };
  const start = corner(cornerCell("top", "start"), "start");
  const end = corner(cornerCell("bottom", "end"), "end");
  let fill: SpreadsheetTouchGripGeometry["fill"] = null;
  if (end && options.showFill) {
    // Excel on a touch screen hangs the fill grip below the selection grip;
    // with no room below (the last visible row), it goes beside it. The gap
    // is screen px, the layer's are layout px.
    const offset = FILL_GRIP_OFFSET_PX * unscale;
    const below = endScreenY + FILL_GRIP_OFFSET_PX <= dataBottom - 6;
    // On the selection grip's layer, in its pixels.
    const pane = end.pane ? { pane: end.pane } : {};
    fill = below
      ? { x: end.x, y: end.y + offset, beside: false, ...pane }
      : { x: end.x + offset * inward, y: end.y, beside: true, ...pane };
  }
  return {
    start,
    end,
    fill,
    resize: null,
    lines: null,
    unscale,
  };
}

function samePoint(a: Point | null, b: Point | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.pane === b.pane && Math.round(a.x) === Math.round(b.x) && Math.round(a.y) === Math.round(b.y);
}

function sameGeometry(a: SpreadsheetTouchGripGeometry, b: SpreadsheetTouchGripGeometry): boolean {
  return (
    Math.abs(a.unscale - b.unscale) < 0.001 &&
    a.lines === b.lines &&
    samePoint(a.resize, b.resize) &&
    a.resize?.axis === b.resize?.axis &&
    a.resize?.index === b.resize?.index &&
    samePoint(a.fill, b.fill) &&
    a.fill?.beside === b.fill?.beside &&
    samePoint(a.start, b.start) &&
    samePoint(a.end, b.end)
  );
}

export interface SpreadsheetTouchSelectionLayerProps extends SpreadsheetTouchMeasureOptions {
  readonly enabled: boolean;
  /**
   * A fill or a move drag is under way: the grips are out of sight and take
   * no press, but stay in the page. The grip a finger pressed must outlive
   * its drag: WebKit sends the rest of a touch to the element it began on,
   * and a removed one passes no release on, so the fill never ended.
   */
  readonly hidden?: boolean;
  readonly viewportRef: RefObject<HTMLElement | null>;
  /** Anything whose change can move the corners (selection, zoom, freeze …). */
  readonly layoutKey: unknown;
  /** The frozen lines: a grip on a frozen cell is drawn over that pane. */
  readonly frozen?: SheetFrozenLines | null;
  /** A grip or a held press is dragging: follow every frame, let hits through. */
  readonly dragging: boolean;
  /** Bumped when a long press selects: the grips announce themselves. */
  readonly emphasisNonce: number;
  /** The touch toolbar's Fill was pressed: the fill grip calls for the finger. */
  readonly fillArmed: boolean;
  readonly onSelectionGrip: (
    corner: SpreadsheetTouchGripCorner,
    lines: "col" | "row" | null,
    event: ReactPointerEvent<HTMLSpanElement>,
  ) => void;
  readonly onFillGrip: (event: ReactPointerEvent<HTMLSpanElement>) => void;
  readonly onResizeGrip: (
    axis: "col" | "row",
    index: number,
    event: ReactPointerEvent<HTMLSpanElement>,
  ) => void;
}

export function SpreadsheetTouchSelectionLayer(props: SpreadsheetTouchSelectionLayerProps): React.JSX.Element | null {
  const { enabled, viewportRef, layoutKey, dragging, emphasisNonce } = props;
  const layerRef = useRef<HTMLDivElement | null>(null);
  const paneLayersRef = useRef<SheetRangePaneLayerRefs>({});
  const [geometry, setGeometry] = useState<SpreadsheetTouchGripGeometry>(EMPTY);
  const frameRef = useRef(0);
  const live = useRef(props);
  live.current = props;

  const schedule = useCallback(() => {
    if (frameRef.current || typeof requestAnimationFrame !== "function") return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      const viewport = viewportRef.current;
      const layer = layerRef.current;
      const current = live.current;
      const next =
        viewport && layer && current.enabled
          ? measureSpreadsheetTouchGrips(viewport, layer, current, (pane) => paneLayersRef.current[pane])
          : EMPTY;
      setGeometry((previous) => (sameGeometry(previous, next) ? previous : next));
      // A drag repaints the corners every frame without a React commit here.
      if (current.dragging) schedule();
    });
  }, [viewportRef]);

  useLayoutEffect(() => {
    if (enabled) schedule();
  });
  useLayoutEffect(() => {
    if (!enabled) setGeometry(EMPTY);
  }, [enabled, layoutKey, dragging]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!enabled || !viewport) return;
    viewport.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    observer?.observe(viewport);
    return () => {
      viewport.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer?.disconnect();
    };
  }, [enabled, schedule, viewportRef]);

  useEffect(
    () => () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    },
    [],
  );

  const [emphasis, setEmphasis] = useState(false);
  useEffect(() => {
    if (!emphasisNonce) return;
    setEmphasis(true);
    const timer = setTimeout(() => setEmphasis(false), 320);
    return () => clearTimeout(timer);
  }, [emphasisNonce]);

  if (!enabled) return null;
  const { start, end, fill, resize, lines, unscale } = geometry;
  // On whole lines the selection grips lean into the cells, off the heading
  // edge whose middle the resize grip owns: a column heading is short, so
  // its grips lean a whole half target down; a row heading is wide enough
  // for a smaller lean.
  const startOffset =
    lines === "col" ? { hitOffsetY: 22 } : lines === "row" ? { hitOffsetX: (props.rtl ? -1 : 1) * 14 } : {};
  // Each grip keeps its screen size on the zoomed stage.
  const place = (key: string, point: Point, grip: React.JSX.Element) => (
    <span
      key={key}
      style={{
        position: "absolute",
        left: point.x,
        top: point.y,
        width: 0,
        height: 0,
        transform: unscale !== 1 ? `scale(${unscale})` : undefined,
        transformOrigin: "0 0",
      }}
    >
      {grip}
    </span>
  );
  const selectionGrip = (corner: SpreadsheetTouchGripCorner, point: Point) =>
    place(
      `${corner}-${emphasisNonce}`,
      point,
      <OfficeTouchGrip
        variant="selection"
        testId={`spreadsheet-touch-grip-${corner}`}
        x={0}
        y={0}
        emphasis={emphasis}
        zIndex={2}
        {...startOffset}
        onPointerDown={(event) => props.onSelectionGrip(corner, lines, event)}
      />,
    );
  // Each grip with the pane it is drawn over ("body": the layer itself).
  const grips: [SheetRangePane, React.JSX.Element][] = [];
  if (start) grips.push([start.pane ?? "body", selectionGrip("start", start)]);
  if (fill) {
    grips.push([
      fill.pane ?? "body",
      place(
        "fill",
        fill,
        <OfficeTouchGrip
          variant="fill"
          testId="spreadsheet-touch-fill-grip"
          x={0}
          y={0}
          emphasis={props.fillArmed}
          zIndex={1}
          {...(fill.beside ? { hitOffsetX: (props.rtl ? -1 : 1) * 6 } : { hitOffsetY: 6 })}
          onPointerDown={props.onFillGrip}
        />,
      ),
    ]);
  }
  if (end) grips.push([end.pane ?? "body", selectionGrip("end", end)]);
  if (resize) {
    grips.push([
      "body",
      place(
        `resize-${resize.axis}-${resize.index}`,
        resize,
        <OfficeTouchGrip
          variant={resize.axis === "col" ? "resize-col" : "resize-row"}
          testId={`spreadsheet-touch-resize-${resize.axis}-${resize.index}`}
          x={0}
          y={0}
          zIndex={3}
          onPointerDown={(event) => props.onResizeGrip(resize.axis, resize.index, event)}
        />,
      ),
    ]);
  }
  const onPane = (pane: SheetRangePane) => grips.filter(([at]) => at === pane).map(([, grip]) => grip);
  return (
    <>
      <div
        ref={layerRef}
        data-testid="spreadsheet-touch-grips"
        data-office-touch-grips={props.hidden ? "hidden" : dragging ? "dragging" : "idle"}
        aria-hidden="true"
        // A press on a grip is not a press on the stage under it.
        onPointerDown={(event) => event.stopPropagation()}
        style={{
          position: "absolute",
          inset: 0,
          overflow: "visible",
          pointerEvents: "none",
          visibility: props.hidden ? "hidden" : undefined,
          zIndex: SPREADSHEET_GRID_TOUCH_GRIP_LAYER,
        }}
      >
        {onPane("body")}
      </div>
      {/* A grip on a frozen cell, on a layer pinned with its pane over that
          pane's cells, as the range boxes are (SheetRangePaneLayers): on
          the layer above, under the frozen cells, the cell covered it. */}
      {sheetFrozenPanes(props.frozen).map((pane) => (
        <div
          key={pane}
          ref={(element) => {
            paneLayersRef.current[pane] = element;
          }}
          data-testid={`spreadsheet-touch-grips-pane-${pane}`}
          aria-hidden="true"
          onPointerDown={(event) => event.stopPropagation()}
          style={{
            position: "sticky",
            ...(pane !== "left" ? { top: 0 } : {}),
            ...(pane !== "top" ? { left: 0, width: 0 } : {}),
            height: 0,
            overflow: "visible",
            pointerEvents: "none",
            visibility: props.hidden ? "hidden" : undefined,
            zIndex: sheetRangePaneLayer(pane, SPREADSHEET_GRID_TOUCH_GRIP_LAYER),
          }}
        >
          {onPane(pane)}
        </div>
      ))}
    </>
  );
}
