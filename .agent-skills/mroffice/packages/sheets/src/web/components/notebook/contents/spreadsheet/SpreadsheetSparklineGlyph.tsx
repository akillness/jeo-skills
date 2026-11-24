"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type ReactElement } from "react";
import {
  sparklineMarkerDiagonalPx,
  sparklinePoints,
  sparklineStrokeWidthPx,
  type Sparkline,
} from "@mrnote/core/web/lib/spreadsheet/sparkline.ts";

// Conditional-format icon glyphs: components/notebook/contents/spreadsheet/
// ConditionalIconGlyph (Excel's icon look, XLS-A044/A045/A046).

// Default sparkline colors when the model carries none. The positive/primary
// color is the accent; negatives/losses use a muted red.
export const SPARKLINE_DEFAULT_COLOR = "#0d9488";
export const SPARKLINE_DEFAULT_NEGATIVE = "#dc2626";
/**
 * Where a sparkline's picture stands in its cell, as a CSS `inset`. Excel
 * plots a line sparkline 2 px in from the cell's sides and 4 px from its top
 * and foot whatever the cell's size (lookwin p152: 1.5 pt / 3 pt printed);
 * its markers may stand out over that band. Columns keep 2 px all round.
 * `scale`: the surface's own magnification (Page Layout's page scale).
 */
export function sparklineLayerInset(sparkline: Pick<Sparkline, "type">, scale = 1): string {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return sparkline.type === "line" ? `${4 * s}px ${2 * s}px` : `${2 * s}px`;
}

/**
 * Render an in-cell sparkline (Excel/WPS parity) as a small inline SVG from the
 * sparkline model + the numeric values it is bound to. Pure presentation: it
 * calls the shared `sparklinePoints` geometry helper and draws the result.
 * A line draws a polyline; a column/win-loss draws mini bars (negatives/losses in
 * the negative color). The SVG scales to the cell via 100% width/height.
 */
export function SparklineGlyph({
  sparkline,
  values,
  axisBounds,
  scale = 1,
}: {
  sparkline: Sparkline;
  values: Array<number | null>;
  axisBounds?: { minimum?: number; maximum?: number };
  /** The surface's own magnification (Page Layout's page scale). */
  scale?: number;
}): ReactElement {
  // Fixed internal coordinate space; the SVG scales to the cell box. A wider box
  // gives the line/bars room without re-deriving geometry per cell size.
  const W = 80;
  const H = 18;
  // A line's points reach the picture's edges (its plot area); a marker on
  // the first, last, highest or lowest point shows whole over the cell's
  // inset band around it (sparklineLayerInset; live audit S-048).
  const color = sparkline.color || SPARKLINE_DEFAULT_COLOR;
  const negColor = sparkline.negativeColor || SPARKLINE_DEFAULT_NEGATIVE;
  const model = sparklinePoints(values, sparkline.type, W, H, {
    displayEmptyCellsAs: sparkline.displayEmptyCellsAs,
    includeZero: sparkline.displayXAxis,
    minimum: axisBounds?.minimum,
    maximum: axisBounds?.maximum,
    customMinimum: sparkline.minAxisType === "custom",
    customMaximum: sparkline.maxAxisType === "custom",
  });
  const plottedValues =
    model.type === "line" ? model.pointValues : model.barValues;
  const minimum = plottedValues.length ? Math.min(...plottedValues) : 0;
  const maximum = plottedValues.length ? Math.max(...plottedValues) : 0;
  // Excel's precedence when a point is several of these (Excel for Mac
  // measured, X-198 SP_priority): high, then low, first, last, negative,
  // then the plain marker -- a first point that is also the lowest wears the
  // low colour, a negative first or last point its first/last colour.
  const pointColor = (value: number, ordinal: number): string | null => {
    if (sparkline.high && value === maximum)
      return sparkline.highColor || color;
    if (sparkline.low && value === minimum)
      return sparkline.lowColor || color;
    if (sparkline.first && ordinal === 0)
      return sparkline.firstColor || color;
    if (sparkline.last && ordinal === plottedValues.length - 1)
      return sparkline.lastColor || color;
    if (sparkline.negative && value < 0) return negColor;
    if (sparkline.markers) return sparkline.markerColor || color;
    return null;
  };
  // The line and bars live in the stretched 80 x 18 view box; a marker is a
  // diamond of its own CSS size drawn in the cell's own px (the outer
  // picture has no view box), so it keeps its shape however the cell
  // stretches the view box (Excel: a diamond, lookwin p151).
  const strokePx = sparklineStrokeWidthPx(sparkline, scale);
  const halfDiagonal = sparklineMarkerDiagonalPx(sparkline, scale) / 2;
  const percent = (value: number, of: number) => `${Number(((value / of) * 100).toFixed(4))}%`;
  const markers =
    model.type === "line"
      ? model.points.map((point, index) => {
          const markerColor = pointColor(model.pointValues[index], index);
          if (!markerColor && model.points.length !== 1) return null;
          const r = Number((markerColor ? halfDiagonal : strokePx).toFixed(3));
          return (
            <svg
              key={`point-${model.pointIndexes[index]}`}
              x={percent(point.x, W)}
              y={percent(point.y, H)}
              overflow="visible"
            >
              {markerColor ? (
                <path
                  d={`M0 ${-r}L${r} 0L0 ${r}L${-r} 0Z`}
                  fill={markerColor}
                  data-testid="spreadsheet-sparkline-marker"
                />
              ) : (
                // A lone point with no marker: a dot of twice the line.
                <circle cx="0" cy="0" r={r} fill={color} />
              )}
            </svg>
          );
        })
      : [];
  return (
    <svg
      className="spreadsheet-window__sparkline"
      width="100%"
      height="100%"
      overflow="visible"
      style={{ overflow: "visible" }}
      aria-hidden="true"
      focusable="false"
      data-testid="spreadsheet-sparkline-svg"
      data-sparkline-type={sparkline.type}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        overflow="visible"
      >
      {sparkline.displayXAxis && model.zeroY !== null ? (
        <line
          x1="0"
          y1={model.zeroY}
          x2={W}
          y2={model.zeroY}
          stroke={sparkline.axisColor || "#94a3b8"}
          strokeWidth="0.8"
          vectorEffect="non-scaling-stroke"
          data-testid="spreadsheet-sparkline-axis"
        />
      ) : null}
      {model.type === "line" ? (
        <g>
          {model.segments.map((segment, index) =>
            segment.length > 1 ? (
              <polyline
                key={`segment-${index}`}
                points={segment.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke={color}
                // The group's lineWeight (points), drawn at its size in CSS
                // px whatever the cell's box stretches the viewBox to.
                strokeWidth={strokePx}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ) : null,
          )}
        </g>
      ) : (
        model.bars.map((bar, i) => (
          <rect
            key={i}
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={bar.height}
            fill={
              pointColor(model.barValues[i], i) ||
              (sparkline.negative && bar.positive === false ? negColor : color)
            }
          />
        ))
      )}
      </svg>
      {markers}
    </svg>
  );
}
