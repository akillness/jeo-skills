"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Excel's chart data highlight on the sheet: while a chart is selected, its
 * source data is outlined in colour -- the series names red, the categories
 * (an XY chart's X values) purple, the values blue -- each outline with a
 * sizing handle at its corners (`lib/spreadsheet/chart-source-highlight`).
 *
 * Dragging a handle resizes the outline and dragging its edge moves it; the
 * other outlines follow as the chart's layout has them, the cells the drag
 * would give the chart are outlined as it goes, and letting go writes the
 * chart's data the way Select Data does (`onCommit`), one Undo step. Escape,
 * or a drag that gives the chart nothing it can plot, puts the outlines
 * back. The outlines take no click inside them: the cells under them stay
 * the sheet's.
 */

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import {
  chartSourceBoxes,
  chartSourceDragged,
  chartSourceEditable,
  chartSourceReading,
  chartSourceSelectedSeries,
  type ChartSourceBox,
  type ChartSourceEdit,
  type ChartSourceGesture,
  type ChartSourceSeriesCells,
} from "../../../../lib/spreadsheet/chart-source-highlight";

import { SheetRangePaneLayers, type SheetRangePaneLayerRefs } from "./SheetRangePaneLayers";
import { sheetCellAtPoint, sheetOverlayStage, useSheetRangeBoxes, type SheetFrozenLines, type SheetRangePane } from "./useSheetRangeBoxes";

type Corner = "nw" | "ne" | "sw" | "se";
type Side = "top" | "right" | "bottom" | "left";

/** The outline's line width. */
const OUTLINE_PX = 2;
/** The outline's sizing handle, drawn; its hit area is wider. */
const HANDLE_PX = 6;
const HANDLE_HIT_PX = 12;
/** The width of an outline's edge that answers a press (a move). */
const EDGE_HIT_PX = 6;
/** The outline's layer in the body: over the cells and what is drawn in them
 * (the fill handle at 5, the comment indicator at 8), under the drawings (a
 * chart covers the outline of the cells it stands on) and the frozen panes. */
const BODY_LAYER = 9;

const CORNER_CURSOR: Record<Corner, string> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
};

interface Drag {
  readonly role: ChartSourceBox["role"];
  readonly box: ChartSourceBox["range"];
  readonly corner: Corner | null;
  readonly from: { row: number; col: number } | null;
  edit: ChartSourceEdit | null;
  /** Removes the window listeners the drag runs on. */
  readonly release: () => void;
}

export function SpreadsheetChartSourceOverlay({
  kind,
  chart,
  sheetName,
  sheetId,
  cellValue,
  cellsVersion,
  selectedArea,
  editable,
  layoutKey,
  frozen = null,
  onCommit,
}: {
  kind: "native" | "drawing";
  /** The selected chart's record. */
  chart: object;
  /** The sheet on screen (the chart's own). */
  sheetName: string;
  sheetId: string;
  /** A cell of this sheet as the chart reads a value. */
  cellValue: (row: number, col: number) => string;
  /** Changes when the sheet's cells do (the reading is kept until then). */
  cellsVersion: unknown;
  /** The chart's selected element (`series:S` shows that series alone). */
  selectedArea: string | null;
  /** The chart's data may be changed here (Select Data is available). */
  editable: boolean;
  /** Changes when the grid lays out again (scroll window, sizes, zoom). */
  layoutKey: unknown;
  /** The frozen lines: data across a freeze line is outlined in each pane. */
  frozen?: SheetFrozenLines | null;
  onCommit: (edit: ChartSourceEdit) => void;
}) {
  const cellValueRef = useRef(cellValue);
  cellValueRef.current = cellValue;
  const reading = useMemo(
    () => chartSourceReading({ kind, chart, sheetName, sheetId, cellValue: (row, col) => cellValueRef.current(row, col) }),
    // The cells are read through the ref; `cellsVersion` says when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, chart, sheetName, sheetId, cellsVersion],
  );
  const selected = chartSourceSelectedSeries(selectedArea);
  const only = selected !== null && reading?.series[selected] ? selected : null;
  const [preview, setPreview] = useState<readonly ChartSourceSeriesCells[] | null>(null);
  const signature = useMemo(
    () => (reading ? chartSourceBoxes(preview ?? reading.series, only).map((box) => box.key).join("|") : ""),
    [reading, preview, only],
  );
  // The same outlines keep their identity: nothing is measured again for a
  // render that changes none of them.
  const spans = useMemo(
    () => (reading ? chartSourceBoxes(preview ?? reading.series, only) : []).map((box) => ({ ...box, ...box.range })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature],
  );
  const hostRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<SheetRangePaneLayerRefs>({});
  const boxes = useSheetRangeBoxes(hostRef, spans, layoutKey, frozen, layersRef);
  const handles = Boolean(reading && editable && chartSourceEditable(reading, only));

  const dragRef = useRef<Drag | null>(null);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const readingRef = useRef(reading);
  readingRef.current = reading;
  const onlyRef = useRef(only);
  onlyRef.current = only;

  const cancel = () => {
    dragRef.current?.release();
    dragRef.current = null;
    setPreview(null);
  };
  // The chart deselected, or its data changed under a drag: the drag ends.
  useEffect(() => cancel, [reading]);

  // The drag runs on the window: the outline it started on is drawn anew
  // (under another key) as it follows the pointer.
  const begin = (event: ReactPointerEvent<HTMLElement>, box: ChartSourceBox, corner: Corner | null) => {
    if (event.button !== 0 || !reading || dragRef.current) return;
    // The press is the outline's: the cell under it is not selected and the
    // chart stays selected.
    event.preventDefault();
    event.stopPropagation();
    const stage = sheetOverlayStage(hostRef.current);
    const from = stage ? sheetCellAtPoint(stage, event.clientX, event.clientY) : null;
    if (!stage || (!corner && !from)) return;
    const pointerId = event.pointerId;
    const onMove = (moved: PointerEvent) => {
      const drag = dragRef.current;
      const current = readingRef.current;
      if (!drag || moved.pointerId !== pointerId || !current) return;
      moved.preventDefault();
      const at = sheetCellAtPoint(stage, moved.clientX, moved.clientY);
      if (!at) return;
      const gesture: ChartSourceGesture = drag.corner
        ? { kind: "resize", role: drag.role, box: drag.box, corner: drag.corner, to: at }
        : { kind: "move", role: drag.role, box: drag.box, rows: at.row - drag.from!.row, cols: at.col - drag.from!.col };
      const result = chartSourceDragged(current, gesture, onlyRef.current);
      drag.edit = result?.edit ?? null;
      setPreview(result?.series ?? current.series);
    };
    const onEnd = (ended: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || ended.pointerId !== pointerId) return;
      ended.preventDefault();
      ended.stopPropagation();
      cancel();
      // The click that ends the drag is not a click on the cell it ends over.
      const swallow = (click: MouseEvent) => {
        click.stopPropagation();
        click.preventDefault();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
      if (ended.type === "pointerup" && drag.edit) onCommitRef.current(drag.edit);
    };
    const onKey = (key: KeyboardEvent) => {
      if (key.key !== "Escape") return;
      key.preventDefault();
      key.stopPropagation();
      cancel();
    };
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onEnd, true);
    window.addEventListener("pointercancel", onEnd, true);
    window.addEventListener("keydown", onKey, true);
    dragRef.current = {
      role: box.role,
      box: box.range,
      corner,
      from,
      edit: null,
      release: () => {
        window.removeEventListener("pointermove", onMove, true);
        window.removeEventListener("pointerup", onEnd, true);
        window.removeEventListener("pointercancel", onEnd, true);
        window.removeEventListener("keydown", onKey, true);
      },
    };
    setPreview(reading.series);
  };

  if (!reading) return null;
  const drawn = (pane: SheetRangePane) =>
    boxes.filter((measured) => measured.pane === pane).map((measured) => {
        const box = measured.span;
        const [top, right, bottom, left] = measured.edges;
        const sides: [Side, boolean][] = [["top", top], ["right", right], ["bottom", bottom], ["left", left]];
        const corners: [Corner, boolean][] = [
          ["nw", top && left],
          ["ne", top && right],
          ["sw", bottom && left],
          ["se", bottom && right],
        ];
        // Each outline is drawn on the gridlines around its cells (half its
        // width either side), so neighbouring outlines share one line, the
        // later one over the earlier, as Excel draws them.
        const outset = (own: boolean) => (own ? OUTLINE_PX / 2 : 0);
        return (
          <div
            key={`${box.key}@${measured.pane}`}
            data-testid="spreadsheet-chart-source-box"
            data-pane={measured.pane}
            data-role={box.role}
            data-range={`${box.range.r1}:${box.range.c1}:${box.range.r2}:${box.range.c2}`}
            data-color={box.color}
            style={{
              position: "absolute",
              left: measured.left - outset(left),
              top: measured.top - outset(top),
              width: measured.width + outset(left) + outset(right),
              height: measured.height + outset(top) + outset(bottom),
              boxSizing: "border-box",
              borderStyle: "solid",
              borderColor: box.color,
              borderWidth: measured.edges.map((edge) => (edge ? `${OUTLINE_PX}px` : "0")).join(" "),
              // Excel tints the cells of each outline in its colour.
              background: `color-mix(in srgb, ${box.color} 10%, transparent)`,
            }}
          >
            {handles
              ? sides.map(([side, own]) =>
                  own ? (
                    <span
                      key={side}
                      data-testid="spreadsheet-chart-source-edge"
                      data-side={side}
                      onPointerDown={(event) => begin(event, box, null)}
                      style={{
                        position: "absolute",
                        pointerEvents: "auto",
                        cursor: "move",
                        touchAction: "none",
                        ...(side === "top" || side === "bottom"
                          ? { left: 0, right: 0, height: EDGE_HIT_PX, [side]: -EDGE_HIT_PX / 2 - 1 }
                          : { top: 0, bottom: 0, width: EDGE_HIT_PX, [side]: -EDGE_HIT_PX / 2 - 1 }),
                      }}
                    />
                  ) : null,
                )
              : null}
            {handles
              ? corners.map(([corner, own]) =>
                  own ? (
                    <span
                      key={corner}
                      data-testid="spreadsheet-chart-source-handle"
                      data-corner={corner}
                      onPointerDown={(event) => begin(event, box, corner)}
                      style={{
                        position: "absolute",
                        width: HANDLE_HIT_PX,
                        height: HANDLE_HIT_PX,
                        [corner[0] === "n" ? "top" : "bottom"]: -HANDLE_HIT_PX / 2 - 1,
                        [corner[1] === "w" ? "left" : "right"]: -HANDLE_HIT_PX / 2 - 1,
                        display: "grid",
                        placeItems: "center",
                        pointerEvents: "auto",
                        cursor: CORNER_CURSOR[corner],
                        touchAction: "none",
                      }}
                    >
                      <span
                        style={{
                          width: HANDLE_PX,
                          height: HANDLE_PX,
                          boxSizing: "border-box",
                          background: box.color,
                          border: "1px solid #ffffff",
                        }}
                      />
                    </span>
                  ) : null,
                )
              : null}
          </div>
        );
    });
  // The body's outlines in the host, under the frozen panes; a frozen pane's
  // on a layer pinned with that pane, over its cells (SheetRangePaneLayers).
  return (
    <SheetRangePaneLayers
      hostRef={hostRef}
      layersRef={layersRef}
      frozen={frozen}
      bodyLayer={BODY_LAYER}
      testId="spreadsheet-chart-source-overlay"
      hostProps={{ "data-dragging": preview ? "true" : undefined }}
    >
      {drawn}
    </SheetRangePaneLayers>
  );
}
