"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Dependency-free SVG chart for native page chart blocks (bar / line / pie).
 *
 * Data is read as [label, value] per row (first column = category label, second
 * = numeric value); a leading non-numeric header row is skipped. Kept small and
 * pure so it renders deterministically (and is unit-testable) without a charting
 * library or layout measurement.
 */

import { useId, type ReactElement } from "react";

import { applyNumberFormat } from "../../../lib/spreadsheet/number-format";
import {
  LEGACY_XY_SERIES,
  finiteChartNumber,
} from "../../../lib/presentation-legacy-chart-grid";

import {
  computeBoxWhiskerStats,
  computeCandlestickBars,
  computeHistogramBins,
  DEFAULT_HISTOGRAM_INTERVAL_CLOSED,
  type HistogramIntervalClosed,
  computeParetoPoints,
  computeSunburstSegments,
  computeTreemapRects,
  computeCategoryTrendline,
  computeTrendline,
  spreadsheetTrendlineLabel,
  computeWaterfallSteps,
  makeErrorBarCenter,
  makeErrorBarDelta,
  normalizeChartLineSeriesStyles,
  normalizeChartSeriesGradientStyles,
  spreadsheetLineWidthPtToCssPx,
  type ChartErrorBarSpec,
  type ChartTrendlineSpec,
  type MiniChartXYSeries,
  type SpreadsheetChartLineSeriesStyle,
  type SpreadsheetChartSeriesGradientStyle,
  type SpreadsheetLineMarkerSymbol,
  type TrendlinePoint,
} from "../../../lib/spreadsheet/chart";

export interface MiniChartPoint {
  label: string;
  value: number;
}

/**
 * The Legend menu's four placements plus Excel's Format Legend > Top Right
 * (`legendPos val="tr"`, the spreadsheet chart's "topRight"): a horizontal row
 * in the top band, right-aligned, so it reserves the same space as "top".
 */
type MiniChartLegendPosition = "top" | "bottom" | "left" | "right" | "topRight";

function sideLegendBandWidth(
  width: number,
  position: MiniChartLegendPosition,
  showLegend: boolean,
): number {
  return showLegend && (position === "left" || position === "right")
    ? Math.min(120, Math.max(24, width * 0.3), width * 0.4)
    : 0;
}

const PALETTE = [
  "var(--mrai-chart-series-1, #0D9488)",
  "var(--mrai-chart-series-2, #2563eb)",
  "var(--mrai-chart-series-3, #f59e0b)",
  "var(--mrai-chart-series-4, #db2777)",
  "var(--mrai-chart-series-5, #7c3aed)",
  "var(--mrai-chart-series-6, #16a34a)",
  "var(--mrai-chart-series-7, #dc2626)",
  "var(--mrai-chart-series-8, #0891b2)",
];
const OUTLINE_PALETTE = [
  "var(--mrai-chart-series-outline-1, var(--mrai-chart-series-1, #0D9488))",
  "var(--mrai-chart-series-outline-2, var(--mrai-chart-series-2, #2563eb))",
  "var(--mrai-chart-series-outline-3, var(--mrai-chart-series-3, #f59e0b))",
  "var(--mrai-chart-series-outline-4, var(--mrai-chart-series-4, #db2777))",
  "var(--mrai-chart-series-outline-5, var(--mrai-chart-series-5, #7c3aed))",
  "var(--mrai-chart-series-outline-6, var(--mrai-chart-series-6, #16a34a))",
  "var(--mrai-chart-series-outline-7, var(--mrai-chart-series-7, #dc2626))",
  "var(--mrai-chart-series-outline-8, var(--mrai-chart-series-8, #0891b2))",
];

function chartSliceFill(index: number): string {
  return `var(--mrai-chart-slice-fill-${index + 1}, ${PALETTE[index % PALETTE.length]})`;
}

function chartSliceOutline(index: number): string {
  return `var(--mrai-chart-slice-outline-${index + 1}, ${OUTLINE_PALETTE[0]})`;
}

/** Inner-radius fraction of a doughnut's outer radius (the hole size). */
const DOUGHNUT_INNER_RATIO = 0.55;

/** Parse a row grid into [label, value] points, skipping a header row. */
export function pointsFromRows(rows: string[][] | undefined): MiniChartPoint[] {
  if (!Array.isArray(rows)) return [];
  // The first value column with a number in it: a text first series (a names
  // column beside the figures) has nothing to plot, and gating every chart
  // surface on it alone emptied charts, recommendations and type changes
  
  // number reads as it always did.
  let column = 1;
  if (!rows.some((row) => Array.isArray(row) && row.length > 1 && finiteChartNumber(row[1]) !== null)) {
    const widest = Math.max(0, ...rows.map((row) => (Array.isArray(row) ? row.length : 0)));
    for (let candidate = 2; candidate < widest; candidate += 1) {
      if (rows.some((row) => Array.isArray(row) && finiteChartNumber(row[candidate]) !== null)) {
        column = candidate;
        break;
      }
    }
  }
  const points: MiniChartPoint[] = [];
  rows.forEach((row, index) => {
    if (!Array.isArray(row) || row.length === 0) return;
    const rawValue = row.length > column ? row[column] : row.length > 1 ? row[1] : row[0];
    const value = finiteChartNumber(rawValue);
    // Skip a leading header row whose value cell is not numeric.
    if (value === null) {
      if (index === 0) return;
      return;
    }
    points.push({ label: String(row[0] ?? ""), value });
  });
  return points;
}








export function chartRowsHavePlottableValue(rows: string[][] | undefined): boolean {
  if (!Array.isArray(rows)) return false;
  return rows.some(
    (row) => Array.isArray(row) && row.slice(1).some((value) => finiteChartNumber(value) !== null),
  );
}

/**
 * The render kinds MiniChart dispatches on. The first three are the historical
 * single-series legacy kinds (their branches are byte-identical to before).
 * `doughnut` shares the pie geometry plus a center hole; the rest are the
 * multi-series extended kinds.
 */
type MiniKind =
  | "column"
  | "bar"
  | "line"
  | "pie"
  | "doughnut"
  | "scatter"
  | "stacked"
  | "combo"
  | "radar"
  | "bubble"
  | "histogram"
  | "waterfall"
  | "box-and-whisker"
  | "pareto"
  | "treemap"
  | "sunburst"
  | "stock";

/**
 * Resolve a free-form type label to a MiniKind. The legacy folds are preserved
 * EXACTLY: "line"/"area" -> line, "pie" -> pie, unknown -> bar, so an existing
 * bar/line/pie/area chart renders through the same branch as before.
 *
 * The extended kinds (scatter/stacked/combo/radar/doughnut) are ONLY surfaced
 * when `extended` is true. MiniChart is SHARED across the spreadsheet floating
 * chart (which exposes the new types in its picker and opts in), the spreadsheet
 * chart-OBJECT, and the presentation chart block — the latter two pass the
 * persisted type string verbatim and historically relied on MiniChart folding
 * "doughnut" -> pie and "scatter" -> bars. So when `extended` is false (the
 * default for those surfaces) the new labels fold back to their legacy base,
 * keeping their render byte-identical to before; only the opted-in floating
 * chart renders the new kinds. (Extending the other surfaces to the new kinds —
 * incl. their pptx export mapping — is tracked separately.)
 */
function normalizeType(type: string | undefined, extended = false): MiniKind {
  const t = (type || "").toLowerCase();
  if (extended) {
    // Bubble before scatter: a bubble is a 3-column scatter, so a label naming
    // both ("bubble scatter") must resolve to bubble first.
    if (t.includes("bubble")) return "bubble";
    if (t.includes("scatter") || t === "xy") return "scatter";
    if (t.includes("histogram") || t.includes("histo")) return "histogram";
    if (t.includes("waterfall") || t.includes("bridge")) return "waterfall";
    // Box-and-whisker before generic "box" so "boxplot" / "box whisker" resolve.
    if (
      t.includes("boxplot") ||
      t.includes("box plot") ||
      (t.includes("box") && t.includes("whisker")) ||
      t === "box-and-whisker"
    ) {
      return "box-and-whisker";
    }
    if (t.includes("pareto")) return "pareto";
    // Treemap / sunburst / stock: new Excel-2016 kinds.
    if (t.includes("treemap") || t.includes("tree map") || t.includes("tree-map")) {
      return "treemap";
    }
    if (
      t.includes("sunburst") ||
      t.includes("sun burst") ||
      t.includes("sun-burst")
    ) {
      return "sunburst";
    }
    if (
      t.includes("stock") ||
      t.includes("candlestick") ||
      t === "ohlc" ||
      t === "hlc"
    ) {
      return "stock";
    }
    if (t.includes("stack")) return "stacked";
    if (t.includes("combo") || t.includes("bar+line") || t.includes("bar-line")) {
      return "combo";
    }
    if (t.includes("radar") || t.includes("spider")) return "radar";
    if (t.includes("doughnut") || t.includes("donut")) return "doughnut";
    if (t.includes("column")) return "column";
    if (t.includes("bar")) return "bar";
  }
  // Legacy folds — byte-identical to the pre-extension normalizeType (line/area
  // first, then pie/donut/doughnut -> pie, else bar). When not `extended`, the
  // new-kind labels fall through to here: scatter/stacked/combo/radar -> bar and
  // doughnut/donut -> pie, exactly as the other surfaces rendered before.
  if (t.includes("line") || t.includes("area")) return "line";
  if (t.includes("pie") || t.includes("donut") || t.includes("doughnut")) {
    return "pie";
  }
  // The historical default branch draws vertical columns. Keep shared
  // Presentation/legacy callers on that geometry; Spreadsheet opts into
  // `extendedTypes` and therefore distinguishes horizontal Bar above.
  return "column";
}

/**
 * A multi-series view of the row grid: aligned category labels plus one numeric
 * series per value column. Mirrors `pointsFromRows`'s header-skip and numeric
 * coercion but keeps EVERY value column (row[1], row[2], ...). A header row is
 * detected the same way — its first value cell (row[1]) is non-numeric — and
 * dropped. Non-numeric / blank value cells coerce to 0 so a ragged column never
 * NaNs the geometry. Returns empty series when nothing is plottable.
 */
export interface MiniSeriesData {
  categories: string[];
  /** series[i] is the i-th value column, one number per category (aligned). */
  series: number[][];
  /** Count of value columns (>=0). */
  seriesCount: number;
  /**
   * Series names from the skipped header row (names[i] belongs to series[i]),
   * "" where the header cell is blank/missing. Empty array when the range has
   * no header row — legend rendering then falls back to "Series N".
   */
  names: string[];
}

export function seriesFromRows(
  rows: string[][] | undefined,
): MiniSeriesData {
  const empty: MiniSeriesData = {
    categories: [],
    series: [],
    seriesCount: 0,
    names: [],
  };
  if (!Array.isArray(rows) || rows.length === 0) return empty;
  // Widest value-column count across data rows (a row is [label, v1, v2, ...]).
  let seriesCount = 0;
  rows.forEach((row) => {
    if (Array.isArray(row) && row.length > 1) {
      seriesCount = Math.max(seriesCount, row.length - 1);
    }
  });
  if (seriesCount === 0) return empty;
  const categories: string[] = [];
  const series: number[][] = Array.from({ length: seriesCount }, () => []);
  const names: string[] = [];
  rows.forEach((row, index) => {
    if (!Array.isArray(row) || row.length === 0) return;
    const firstValue = finiteChartNumber(
      row.length > 1 ? row[1] : row[0],
    );
    // Skip a leading header row whose first value cell is non-numeric (same rule
    // pointsFromRows uses), so a header doesn't become a 0 in every series.
    // Its value cells are the SERIES NAMES (Excel: the legend lists them).
    if (firstValue === null && index === 0) {
      for (let s = 0; s < seriesCount; s += 1) {
        names.push(String(row[s + 1] ?? ""));
      }
      return;
    }
    categories.push(String(row[0] ?? ""));
    for (let s = 0; s < seriesCount; s += 1) {
      const raw = row[s + 1];
      const numeric = finiteChartNumber(raw);
      series[s].push(numeric ?? 0);
    }
  });
  if (categories.length === 0) return empty;
  return { categories, series, seriesCount, names };
}

/**
 * Render a legend row of color swatch + category label at the top of the chart
 * (Excel/WPS parity). Returns null when there is nothing to show so the toggle
 * adds no DOM when off. Kept inside the SVG so it scales with the chart.
 */
function renderLegend(
  points: MiniChartPoint[],
  width: number,
  height: number,
  position: MiniChartLegendPosition,
): ReactElement | null {
  if (points.length === 0) return null;
  const swatch = 8;
  const gap = 6;
  const itemGap = 12;
  if (position === "left" || position === "right") {
    const rowHeight = 14;
    const visible = points.slice(
      0,
      Math.max(1, Math.floor((height - 8) / rowHeight)),
    );
    const bandWidth = sideLegendBandWidth(width, position, true);
    const maxLabelCharacters = Math.max(
      1,
      Math.floor((bandWidth - swatch - gap - 6) / 5.5),
    );
    const xBase = position === "left" ? 4 : width - bandWidth + 4;
    const yBase = Math.max(4, (height - visible.length * rowHeight) / 2);
    return (
      <g
        data-chart-legend="true"
        data-chart-legend-orientation="vertical"
        data-chart-legend-position={position}
      >
        {visible.map((point, index) => {
          const label = point.label || `#${index + 1}`;
          return (
            <g key={index}>
              <rect
                x={xBase}
                y={yBase + index * rowHeight}
                width={swatch}
                height={swatch}
                fill={PALETTE[index % PALETTE.length]}
                stroke={OUTLINE_PALETTE[index % OUTLINE_PALETTE.length]}
                strokeWidth={1}
              />
              <text
                x={xBase + swatch + gap}
                y={yBase + index * rowHeight + swatch}
                fontSize={9}
                fill="var(--mrai-chart-text, #475569)"
                aria-label={label}
                data-chart-legend-label={label}
              >
                {label.length > maxLabelCharacters
                  ? `${label.slice(0, maxLabelCharacters)}…`
                  : label}
              </text>
            </g>
          );
        })}
      </g>
    );
  }
  const yBase = position === "bottom" ? height - 14 : 2;
  // Estimate text width (~6px/char) so swatches do not overlap.
  const itemWidths = points.map(
    (point, index) =>
      swatch + gap + (point.label || `#${index + 1}`).length * 6 + itemGap,
  );
  const rowWidth = itemWidths.reduce((sum, item) => sum + item, 0) - itemGap;
  let x = position === "topRight" ? Math.max(4, width - 4 - rowWidth) : 4;
  return (
    <g
      data-chart-legend="true"
      data-chart-legend-orientation="horizontal"
      data-chart-legend-position={position}
    >
      {points.map((point, index) => {
        const label = point.label || `#${index + 1}`;
        const labelX = x + swatch + gap;
        // Clamp so a long label list still fits roughly within the chart width.
        const itemWidth = itemWidths[index];
        const startX = x;
        x += itemWidth;
        if (startX > width) return null;
        return (
          <g key={index}>
            <rect
              x={startX}
              y={yBase}
              width={swatch}
              height={swatch}
              fill={PALETTE[index % PALETTE.length]}
              stroke={OUTLINE_PALETTE[index % OUTLINE_PALETTE.length]}
              strokeWidth={1}
            />
            <text
              x={labelX}
              y={yBase + swatch}
              fontSize={9}
              fill="var(--mrai-chart-text, #475569)"
              aria-label={label}
              data-chart-legend-label={label}
            >
              {label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/**
 * Render category labels along the x-axis baseline (bar/line parity). Returns
 * null when off so the toggle adds no DOM.
 */
function renderAxisLabels(
  points: MiniChartPoint[],
  pad: number,
  chartW: number,
  baselineY: number,
): ReactElement {
  const slot = chartW / Math.max(1, points.length);
  return (
    <g data-chart-axis="true">
      {points.map((point, index) => (
        <text
          key={index}
          x={pad + index * slot + slot / 2}
          y={baselineY + 12}
          fontSize={9}
          fill="var(--mrai-chart-text, #475569)"
          textAnchor="middle"
          data-chart-axis-label={point.label}
        >
          {point.label}
        </text>
      ))}
    </g>
  );
}

function renderPrimaryValueAxis(
  min: number,
  max: number,
  top: number,
  bottom: number,
  formatCode: string | undefined,
): ReactElement | null {
  if (
    !formatCode ||
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    !Number.isFinite(top) ||
    !Number.isFinite(bottom)
  ) {
    return null;
  }
  const safeMax = min === max ? max + 1 : max;
  const scale = makeScale(min, safeMax, bottom, top);
  const values = [safeMax, ...(min < 0 && safeMax > 0 ? [0] : []), min];
  return (
    <g data-chart-primary-value-axis="true">
      {values.map((value, index) => {
        const label = applyNumberFormat(value, formatCode);
        return (
          <text
            key={`${index}:${value}`}
            x={2}
            y={Math.max(top + 8, Math.min(bottom, scale(value) + 3))}
            fontSize={9}
            fill="var(--mrai-chart-text, #475569)"
            data-chart-primary-value-axis-label={label}
          >
            {label}
          </text>
        );
      })}
    </g>
  );
}

/**
 * A linear map from a value DOMAIN [min, max] onto a pixel range, collapse-safe:
 * a zero-width domain (all values equal / a single point) maps everything to the
 * range midpoint instead of dividing by zero (NaN). Returns a function so each
 * branch can scale x or y without repeating the guard.
 */
function makeScale(
  min: number,
  max: number,
  rangeStart: number,
  rangeEnd: number,
): (value: number) => number {
  const span = max - min;
  const mid = (rangeStart + rangeEnd) / 2;
  if (!Number.isFinite(span) || span === 0) return () => mid;
  return (value: number) =>
    rangeStart + ((value - min) / span) * (rangeEnd - rangeStart);
}

/** Color of the dashed trendline overlay (Excel uses a muted slate/grey). */
const TRENDLINE_COLOR = "var(--mrai-chart-trendline, #64748b)";

/**
 * Format a numeric value for a DATA LABEL. Keeps integers bare and rounds a
 * fractional value to at most 2 decimals (trailing zeros trimmed), so a label
 * stays short and never prints a long float tail. Non-finite -> "".
 */
function formatDataLabel(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 100) / 100);
}

function DataLabelGlyph({
  x,
  y,
  value,
  textAnchor = "middle",
}: {
  x: number;
  y: number;
  value: number;
  textAnchor?: "start" | "middle" | "end";
}) {
  const label = formatDataLabel(value);
  const width = Math.max(12, label.length * 5.5 + 4);
  const left =
    textAnchor === "start" ? x - 2 : textAnchor === "end" ? x - width + 2 : x - width / 2;
  return (
    <g data-chart-data-label={label} pointerEvents="none">
      <rect
        x={left}
        y={y - 10}
        width={width}
        height={12}
        rx={2}
        fill="var(--mrai-chart-data-label-fill, transparent)"
        stroke="var(--mrai-chart-data-label-outline, transparent)"
        strokeWidth={1}
        data-chart-data-label-box="true"
      />
      <text
        x={x}
        y={y}
        fontSize={9}
        fill="var(--mrai-chart-text, #334155)"
        textAnchor={textAnchor}
      >
        {label}
      </text>
    </g>
  );
}

/**
 * Render the dashed trendline overlay as a single polyline, given a function
 * that maps a DATA-space (x, y) trendline point to PIXELS using the SAME scale
 * the host branch already computed. Returns null when there is nothing to draw
 * (the math already degraded too-few/flat data to an empty list), so the overlay
 * adds no DOM when off or undrawable — never a NaN path.
 */
function renderTrendline(
  trendPoints: ReadonlyArray<TrendlinePoint>,
  toPixel: (point: TrendlinePoint) => { x: number; y: number },
  label?: string | null,
): ReactElement | null {
  if (trendPoints.length < 2) return null;
  const pixels = trendPoints.map(toPixel);
  const coords = pixels.map((px) => `${px.x},${px.y}`);
  // Guard: a non-finite pixel (defensive — the scales are collapse-safe) drops
  // the overlay rather than emitting "NaN,NaN" into the path.
  if (coords.some((c) => c.includes("NaN") || c.includes("Infinity"))) {
    return null;
  }
  const line = (
    <polyline
      points={coords.join(" ")}
      fill="none"
      stroke={TRENDLINE_COLOR}
      strokeWidth={1.5}
      strokeDasharray="4 3"
      data-chart-trendline="true"
    />
  );
  if (!label) return line;
  // Office's equation / R² label sits beside the end of the line; under it
  // when the line ends near the top of the plot.
  const end = pixels[pixels.length - 1];
  const rows = label.split("\n");
  const below = end.y < 14 * rows.length + 6;
  return (
    <g>
      {line}
      <text
        x={end.x - 4}
        y={below ? end.y + 14 : end.y - 4 - 12 * (rows.length - 1)}
        textAnchor="end"
        fontSize={10}
        fill="var(--mrai-chart-trendline-label, #334155)"
        data-chart-trendline-label="true"
      >
        {rows.map((row, index) => (
          <tspan key={row} x={end.x - 4} dy={index === 0 ? 0 : 12}>
            {row}
          </tspan>
        ))}
      </text>
    </g>
  );
}

/**
 * Render a numeric data label above each plotted point, given the per-index
 * pixel anchor and the value to print. Returns null when off so the toggle adds
 * no DOM. Used by the bar/line branches (and scatter, anchored at each point).
 */
function renderDataLabels(
  anchors: ReadonlyArray<{ x: number; y: number; value: number }>,
): ReactElement | null {
  if (anchors.length === 0) return null;
  return (
    <g data-chart-data-labels="true">
      {anchors.map((a, index) => (
        <DataLabelGlyph
          key={index}
          x={a.x}
          y={a.y}
          value={a.value}
        />
      ))}
    </g>
  );
}

/** Color of the error-bar whiskers (a neutral dark slate, Excel-like). */
const ERROR_BAR_COLOR = "var(--mrai-chart-text, #475569)";
/** Pixel half-width of the little cap at each whisker end. */
const ERROR_BAR_CAP = 3;

/**
 * Render Excel-style ERROR BARS as vertical whiskers at each plotted anchor:
 * a center stem from (cy - dyPx) to (cy + dyPx) plus a short cap at each end.
 * `dyPx` is the whisker half-length already mapped to PIXELS by the host branch
 * (so it honors that branch's own value->pixel scale). Returns null when there
 * is nothing to draw (no anchors, or every delta rounds to <1px) so the overlay
 * adds no DOM when off / degenerate, and skips a non-finite anchor rather than
 * emitting a NaN line.
 */
function renderErrorBars(
  anchors: ReadonlyArray<{ cx: number; cy: number; dyPx: number }>,
): ReactElement | null {
  if (anchors.length === 0) return null;
  const bars = anchors.filter(
    (a) =>
      Number.isFinite(a.cx) &&
      Number.isFinite(a.cy) &&
      Number.isFinite(a.dyPx) &&
      a.dyPx >= 1,
  );
  if (bars.length === 0) return null;
  return (
    <g data-chart-error-bars="true">
      {bars.map((a, index) => {
        const top = a.cy - a.dyPx;
        const bottom = a.cy + a.dyPx;
        return (
          <g key={index} data-chart-error-bar="true">
            <line
              x1={a.cx}
              y1={top}
              x2={a.cx}
              y2={bottom}
              stroke={ERROR_BAR_COLOR}
              strokeWidth={1}
            />
            <line
              x1={a.cx - ERROR_BAR_CAP}
              y1={top}
              x2={a.cx + ERROR_BAR_CAP}
              y2={top}
              stroke={ERROR_BAR_COLOR}
              strokeWidth={1}
            />
            <line
              x1={a.cx - ERROR_BAR_CAP}
              y1={bottom}
              x2={a.cx + ERROR_BAR_CAP}
              y2={bottom}
              stroke={ERROR_BAR_COLOR}
              strokeWidth={1}
            />
          </g>
        );
      })}
    </g>
  );
}

/** Color of the secondary (right-hand) value axis spine + its tick labels. */
const SECONDARY_AXIS_COLOR = "var(--mrai-chart-muted, #94a3b8)";

/**
 * Render a SECONDARY (right-hand) value axis: a vertical spine pinned to the
 * right edge of the plot band plus a min (bottom) and max (top) tick label, so a
 * series scaled to its own right axis is readable. `min`/`max` are the secondary
 * series' data domain; the spine spans the same [pad, pad+chartH] band the left
 * axis uses. Returns null when the domain is unusable (non-finite) so a bad
 * domain adds no DOM rather than a NaN axis.
 */
function renderSecondaryAxis(
  min: number,
  max: number,
  axisX: number,
  top: number,
  bottom: number,
): ReactElement | null {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (!Number.isFinite(axisX) || !Number.isFinite(top) || !Number.isFinite(bottom)) {
    return null;
  }
  return (
    <g data-chart-secondary-axis="true">
      <line
        x1={axisX}
        y1={top}
        x2={axisX}
        y2={bottom}
        stroke={SECONDARY_AXIS_COLOR}
        strokeWidth={1}
      />
      <text
        x={axisX + 2}
        y={top + 8}
        fontSize={9}
        fill={SECONDARY_AXIS_COLOR}
        data-chart-secondary-axis-max={formatDataLabel(max)}
      >
        {formatDataLabel(max)}
      </text>
      <text
        x={axisX + 2}
        y={bottom}
        fontSize={9}
        fill={SECONDARY_AXIS_COLOR}
        data-chart-secondary-axis-min={formatDataLabel(min)}
      >
        {formatDataLabel(min)}
      </text>
    </g>
  );
}

/**
 * Resolve the secondary-axis overlay for a cartesian branch: pick the value
 * series whose column index is listed in `secondaryAxisSeries`, compute their
 * shared data domain (collapse-safe), and return a right-axis scale + the picked
 * series so the branch can draw them against the right axis. Returns null when no
 * valid secondary series exist (empty list, or every index out of range) so the
 * primary render stays byte-identical when the feature is off.
 */
function resolveSecondaryAxis(
  multi: MiniSeriesData,
  secondaryAxisSeries: ReadonlyArray<number> | undefined,
  top: number,
  bottom: number,
): {
  scale: (value: number) => number;
  min: number;
  max: number;
  series: { index: number; values: number[] }[];
} | null {
  if (!secondaryAxisSeries || secondaryAxisSeries.length === 0) return null;
  const picked = secondaryAxisSeries
    .filter((i) => Number.isInteger(i) && i >= 0 && i < multi.seriesCount)
    .map((i) => ({ index: i, values: multi.series[i] }));
  if (picked.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const s of picked) {
    for (const v of s.values) {
      if (!Number.isFinite(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  // top = pad (max), bottom = pad+chartH (min): y grows downward.
  const scale = makeScale(min, max, bottom, top);
  return { scale, min, max, series: picked };
}

/** Color set for the secondary-axis overlay series (offset from the primary). */
const SECONDARY_SERIES_COLORS = ["#db2777", "#7c3aed", "#0891b2", "#16a34a"];

/**
 * Render the secondary-axis SERIES as line overlays (one polyline + points per
 * picked series) using a precomputed right-axis scale and a category x-positioner.
 * Each series gets a distinct color so it reads apart from the primary geometry.
 * Returns null when there is nothing to draw.
 */
function renderSecondarySeries(
  series: ReadonlyArray<{ index: number; values: number[] }>,
  xOf: (categoryIndex: number) => number,
  scale: (value: number) => number,
): ReactElement | null {
  if (series.length === 0) return null;
  return (
    <g data-chart-secondary-series="true">
      {series.map((s, si) => {
        const color =
          SECONDARY_SERIES_COLORS[si % SECONDARY_SERIES_COLORS.length];
        const coords = s.values.map((v, ci) => {
          const x = xOf(ci);
          const y = scale(Number.isFinite(v) ? v : 0);
          return `${x},${y}`;
        });
        const valid = !coords.some(
          (c) => c.includes("NaN") || c.includes("Infinity"),
        );
        if (!valid) return null;
        return (
          <g key={s.index} data-chart-secondary-line={s.index}>
            <polyline
              points={coords.join(" ")}
              fill="none"
              stroke={color}
              strokeWidth={1.75}
              strokeDasharray="2 2"
            />
            {s.values.map((v, ci) => (
              <circle
                key={ci}
                cx={xOf(ci)}
                cy={scale(Number.isFinite(v) ? v : 0)}
                r={2}
                fill={color}
              />
            ))}
          </g>
        );
      })}
    </g>
  );
}

/**
 * Per-series legend points (swatch + series label). Uses the real header names
 * when the source range has them (Excel: the legend lists series names) and
 * falls back to the synthetic "Series N" label otherwise.
 */
function seriesLegendPoints(
  seriesCount: number,
  names?: readonly string[],
): MiniChartPoint[] {
  return Array.from({ length: seriesCount }, (_, i) => ({
    label: (names?.[i] ?? "").trim() || `Series ${i + 1}`,
    value: 0,
  }));
}

/** Clustered Column/Bar renderer over every value series. */
function renderClusteredClassic(
  data: MiniSeriesData,
  orientation: "column" | "bar",
  width: number,
  height: number,
  pad: number,
  chartW: number,
  chartH: number,
  showLegend: boolean,
  legendPosition: MiniChartLegendPosition,
  showAxisLabels: boolean,
  showDataLabels: boolean,
  valueAxisNumberFormat?: string,
  seriesGradientStyles?: readonly SpreadsheetChartSeriesGradientStyle[],
  gradientIdPrefix?: string,
): ReactElement | null {
  if (data.seriesCount < 1 || data.categories.length === 0) return null;
  const allValues = data.series.flat().filter(Number.isFinite);
  if (allValues.length === 0) return null;
  const domainMin = Math.min(0, ...allValues);
  const domainMax = Math.max(0, ...allValues);
  const safeMax = domainMin === domainMax ? domainMax + 1 : domainMax;
  const seriesCount = data.seriesCount;
  const categoryCount = data.categories.length;

  if (orientation === "bar") {
    const xScale = makeScale(domainMin, safeMax, pad, pad + chartW);
    const zeroX = xScale(0);
    const categorySlot = chartH / categoryCount;
    const barSlot = categorySlot / seriesCount;
    const barHeight = Math.max(1, barSlot - 2);
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        data-testid="mini-chart"
        data-chart-kind="bar"
      >
        {data.categories.flatMap((category, categoryIndex) =>
          data.series.map((series, seriesIndex) => {
            const value = series[categoryIndex] ?? 0;
            const valueX = xScale(value);
            const x = Math.min(zeroX, valueX);
            const y = pad + categoryIndex * categorySlot + seriesIndex * barSlot + 1;
            const barWidth = Math.max(1, Math.abs(valueX - zeroX));
            return (
              <g key={`${categoryIndex}:${seriesIndex}`}>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  fill={PALETTE[seriesIndex % PALETTE.length]}
                  stroke={OUTLINE_PALETTE[seriesIndex % OUTLINE_PALETTE.length]}
                  strokeWidth={1}
                  data-chart-bar={`${category}:${seriesIndex}`}
                />
                {showDataLabels ? (
                  <DataLabelGlyph
                    x={value >= 0 ? x + barWidth + 3 : x - 3}
                    y={y + barHeight / 2 + 3}
                    textAnchor={value >= 0 ? "start" : "end"}
                    value={value}
                  />
                ) : null}
              </g>
            );
          }),
        )}
        {showAxisLabels
          ? data.categories.map((category, index) => (
              <text
                key={category}
                x={pad - 4}
                y={pad + index * categorySlot + categorySlot / 2 + 3}
                textAnchor="end"
                fontSize={9}
                data-chart-axis-label={category}
              >
                {category}
              </text>
            ))
          : null}
        {showLegend
          ? renderLegend(
              seriesLegendPoints(seriesCount, data.names),
              width,
              height, legendPosition,
            )
          : null}
      </svg>
    );
  }

  const yScale = makeScale(domainMin, safeMax, pad + chartH, pad);
  const zeroY = yScale(0);
  const categorySlot = chartW / categoryCount;
  const barSlot = categorySlot / seriesCount;
  const barWidth = Math.max(1, barSlot - 2);
  const axisPoints = data.categories.map((label) => ({ label, value: 0 }));
  const normalizedGradients = normalizeChartSeriesGradientStyles(
    seriesGradientStyles,
  );
  const gradients =
    normalizedGradients?.length === seriesCount &&
    normalizedGradients.every((style, index) => style.seriesIndex === index)
      ? normalizedGradients
      : undefined;
  const gradientByIndex = new Map(
    (gradients ?? []).map((style) => [style.seriesIndex, style]),
  );
  const gradientId = (seriesIndex: number) =>
    `${gradientIdPrefix ?? "mini-chart"}-series-gradient-${seriesIndex}`;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      data-testid="mini-chart"
      data-chart-kind="column"
    >
      {gradients ? (
        <defs>
          {gradients.map((gradient) => (
            <linearGradient
              key={gradient.seriesIndex}
              id={gradientId(gradient.seriesIndex)}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor={gradient.from} />
              <stop offset="100%" stopColor={gradient.to} />
            </linearGradient>
          ))}
        </defs>
      ) : null}
      {data.categories.flatMap((category, categoryIndex) =>
        data.series.map((series, seriesIndex) => {
          const value = series[categoryIndex] ?? 0;
          const valueY = yScale(value);
          const x = pad + categoryIndex * categorySlot + seriesIndex * barSlot + 1;
          const y = Math.min(zeroY, valueY);
          const barHeight = Math.max(1, Math.abs(valueY - zeroY));
          const gradient = gradientByIndex.get(seriesIndex);
          return (
            <rect
              key={`${categoryIndex}:${seriesIndex}`}
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              fill={
                gradient
                  ? `url(#${gradientId(seriesIndex)})`
                  : PALETTE[seriesIndex % PALETTE.length]
              }
              stroke={OUTLINE_PALETTE[seriesIndex % OUTLINE_PALETTE.length]}
              strokeWidth={1}
              data-chart-column={`${category}:${seriesIndex}`}
            />
          );
        }),
      )}
      {showAxisLabels ? renderAxisLabels(axisPoints, pad, chartW, zeroY) : null}
      {showAxisLabels
        ? renderPrimaryValueAxis(
            domainMin,
            safeMax,
            pad,
            pad + chartH,
            valueAxisNumberFormat,
          )
        : null}
      {showLegend
        ? renderLegend(
            seriesLegendPoints(seriesCount, data.names),
            width,
            height, legendPosition,
          )
        : null}
    </svg>
  );
}

/**
 * SCATTER: the first value series is X, the second is Y; each category is one
 * (x, y) point. No category axis. Needs >= 2 numeric series — returns null when
 * fewer so the caller degrades to a single-series bar. Axis domains are
 * collapse-safe (all-equal X or Y maps to the midline, never NaN).
 *
 * Which series is which is the legacy grid contract
 * (`@/lib/presentation-legacy-chart-grid`): the PPTX writer exports the same
 * columns as X and Y, so a downloaded scatter shows the points drawn here.
 */
function renderScatter(
  data: MiniSeriesData,
  width: number,
  height: number,
  pad: number,
  chartW: number,
  chartH: number,
  showLegend: boolean,
  legendPosition: MiniChartLegendPosition,
  trendline: ChartTrendlineSpec | undefined,
  showDataLabels: boolean,
  errorBars: ChartErrorBarSpec | undefined,
): ReactElement | null {
  if (data.seriesCount < 2 || data.categories.length === 0) return null;
  const xs = data.series[LEGACY_XY_SERIES.x];
  const ySeries = data.series.slice(LEGACY_XY_SERIES.y);
  const ys = ySeries[0];
  const xScale = makeScale(
    Math.min(...xs),
    Math.max(...xs),
    pad,
    pad + chartW,
  );
  // y is inverted (SVG y grows downward): max -> top (pad), min -> baseline.
  const yScale = makeScale(
    Math.min(...ySeries.flat()),
    Math.max(...ySeries.flat()),
    pad + chartH,
    pad,
  );
  // Trendline runs over the (x, y) points in their native scatter coordinates.
  const trendPoints = trendline
    ? computeTrendline(
        xs.map((x, index) => ({ x, y: ys[index] })),
        trendline,
      )
    : [];
  // Error bars run on the Y value through the scatter's own yScale.
  const scatterErrorDelta = makeErrorBarDelta(errorBars, ys);
  const scatterErrorCenter = makeErrorBarCenter(errorBars, ys);
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      data-testid="mini-chart"
      data-chart-kind="scatter"
    >
      {ySeries.flatMap((series, seriesIndex) =>
        xs.map((x, index) => (
          <circle
            key={`${seriesIndex}:${index}`}
            cx={xScale(x)}
            cy={yScale(series[index])}
            r={3}
            fill={PALETTE[seriesIndex % PALETTE.length]}
            stroke={OUTLINE_PALETTE[seriesIndex % OUTLINE_PALETTE.length]}
            strokeWidth={1}
            data-chart-scatter-point={`${data.categories[index]}:${seriesIndex}`}
          />
        )),
      )}
      {errorBars
        ? renderErrorBars(
            xs.map((x, index) => ({
              cx: xScale(x),
              cy: yScale(scatterErrorCenter(ys[index])),
              dyPx: Math.abs(
                yScale(scatterErrorCenter(ys[index])) -
                  yScale(scatterErrorCenter(ys[index]) + scatterErrorDelta(ys[index])),
              ),
            })),
          )
        : null}
      {renderTrendline(
        trendPoints,
        (p) => ({ x: xScale(p.x), y: yScale(p.y) }),
        spreadsheetTrendlineLabel(
          xs.map((x, index) => ({ x, y: ys[index] })),
          trendline,
        ),
      )}
      {showDataLabels
        ? renderDataLabels(
            ySeries.flatMap((series) =>
              xs.map((x, index) => ({
                x: xScale(x),
                y: yScale(series[index]) - 6,
                value: series[index],
              })),
            ),
          )
        : null}
      {showLegend
        ? renderLegend(
            seriesLegendPoints(ySeries.length, data.names.slice(1)),
            width,
            height, legendPosition,
          )
        : null}
    </svg>
  );
}

/**
 * Native Scatter/Bubble renderer for OOXML series whose X vectors are not
 * shared. The legacy row-matrix renderers above remain the fallback for
 * authored charts and callers that do not provide `xySeries`.
 */
function renderNativeXYSeries(
  kind: "scatter" | "bubble",
  series: ReadonlyArray<MiniChartXYSeries>,
  width: number,
  height: number,
  pad: number,
  chartW: number,
  chartH: number,
  showLegend: boolean,
  legendPosition: MiniChartLegendPosition,
  trendline: ChartTrendlineSpec | undefined,
  showDataLabels: boolean,
  errorBars: ChartErrorBarSpec | undefined,
): ReactElement | null {
  if (
    series.length === 0 ||
    series.some(
      (entry) =>
        entry.points.length === 0 ||
        entry.points.some(
          (point) =>
            !Number.isFinite(point.x) ||
            !Number.isFinite(point.y) ||
            (kind === "bubble" && !Number.isFinite(point.size)),
        ),
    )
  ) {
    return null;
  }
  const points = series.flatMap((entry) => entry.points);
  const xScale = makeScale(
    Math.min(...points.map((point) => point.x)),
    Math.max(...points.map((point) => point.x)),
    pad,
    pad + chartW,
  );
  const yScale = makeScale(
    Math.min(...points.map((point) => point.y)),
    Math.max(...points.map((point) => point.y)),
    pad + chartH,
    pad,
  );
  const absSizes =
    kind === "bubble"
      ? points.map((point) => Math.abs(point.size as number))
      : [];
  const radiusScale =
    kind === "bubble"
      ? makeScale(Math.min(...absSizes), Math.max(...absSizes), 3, 16)
      : null;
  const primary = series[0].points;
  const trendPoints = trendline
    ? computeTrendline(
        primary.map((point) => ({ x: point.x, y: point.y })),
        trendline,
      )
    : [];
  const primaryErrorDelta = makeErrorBarDelta(
    errorBars,
    primary.map((point) => point.y),
  );
  const primaryErrorCenter = makeErrorBarCenter(
    errorBars,
    primary.map((point) => point.y),
  );
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      data-testid="mini-chart"
      data-chart-kind={kind}
      data-chart-native-xy="true"
    >
      {series.map((entry, seriesIndex) => {
        const color = PALETTE[seriesIndex % PALETTE.length];
        const outline = OUTLINE_PALETTE[seriesIndex % OUTLINE_PALETTE.length];
        return (
          <g
            key={`${entry.name}:${seriesIndex}`}
            data-chart-xy-series={seriesIndex}
            data-chart-series-name={entry.name}
          >
            {entry.points.map((point, pointIndex) => {
              const radius =
                kind === "bubble"
                  ? Math.max(
                      3,
                      Math.min(
                        16,
                        radiusScale!(Math.abs(point.size as number)),
                      ),
                    )
                  : 3;
              return (
                <circle
                  key={pointIndex}
                  cx={xScale(point.x)}
                  cy={yScale(point.y)}
                  r={radius}
                  fill={color}
                  fillOpacity={kind === "bubble" ? 0.55 : 1}
                  stroke={outline}
                  strokeWidth={1}
                  data-chart-scatter-point={
                    kind === "scatter"
                      ? `${formatDataLabel(point.x)}:${seriesIndex}`
                      : undefined
                  }
                  data-chart-bubble-point={
                    kind === "bubble"
                      ? `${seriesIndex}:${pointIndex}`
                      : undefined
                  }
                  data-chart-bubble-r={kind === "bubble" ? radius : undefined}
                >
                  <title>{`${entry.name}: (${formatDataLabel(point.x)}, ${formatDataLabel(point.y)})`}</title>
                </circle>
              );
            })}
          </g>
        );
      })}
      {kind === "scatter" && errorBars
        ? renderErrorBars(
            primary.map((point) => ({
              cx: xScale(point.x),
              cy: yScale(primaryErrorCenter(point.y)),
              dyPx: Math.abs(
                yScale(primaryErrorCenter(point.y)) -
                  yScale(primaryErrorCenter(point.y) + primaryErrorDelta(point.y)),
              ),
            })),
          )
        : null}
      {kind === "scatter"
        ? renderTrendline(
            trendPoints,
            (point) => ({ x: xScale(point.x), y: yScale(point.y) }),
            spreadsheetTrendlineLabel(
              primary.map((point) => ({ x: point.x, y: point.y })),
              trendline,
            ),
          )
        : null}
      {showDataLabels
        ? renderDataLabels(
            series.flatMap((entry) =>
              entry.points.map((point) => ({
                x: xScale(point.x),
                y:
                  yScale(point.y) -
                  (kind === "bubble"
                    ? radiusScale!(Math.abs(point.size as number))
                    : 3) -
                  4,
                value: kind === "bubble" ? (point.size as number) : point.y,
              })),
            ),
          )
        : null}
      {showLegend
        ? renderLegend(
            seriesLegendPoints(
              series.length,
              series.map((entry) => entry.name),
            ),
            width,
            height, legendPosition,
          )
        : null}
    </svg>
  );
}

/**
 * STACKED column: every value series stacked cumulatively per category. Needs
 * >= 2 series — returns null with one series so the caller degrades to a plain
 * bar. Only the POSITIVE part of each value contributes to the stack (negatives
 * are clamped to 0; documented limitation — true diverging stacks are deferred),
 * keeping the cumulative total monotonic and on-canvas. Scaled by the largest
 * column total so the tallest stack fills the plot.
 */
function renderStacked(
  data: MiniSeriesData,
  width: number,
  height: number,
  pad: number,
  chartW: number,
  chartH: number,
  showLegend: boolean,
  legendPosition: MiniChartLegendPosition,
  showAxisLabels: boolean,
  showSeriesLines: boolean,
  valueAxisNumberFormat?: string,
): ReactElement | null {
  if (data.seriesCount < 2 || data.categories.length === 0) return null;
  const n = data.categories.length;
  // Per-category positive total -> the stack height; scale by the max total.
  const totals = data.categories.map((_, ci) =>
    data.series.reduce((sum, s) => sum + Math.max(0, s[ci] ?? 0), 0),
  );
  const maxTotal = Math.max(1, ...totals);
  const slot = chartW / n;
  const barGap = 6;
  const barWidth = Math.max(1, slot - barGap);
  const baselineY = pad + chartH;
  const axisPoints: MiniChartPoint[] = data.categories.map((label) => ({
    label,
    value: 0,
  }));
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      data-testid="mini-chart"
      data-chart-kind="stacked"
    >
      {data.categories.map((label, ci) => {
        const x = pad + ci * slot;
        let cursorY = baselineY; // grow upward from the baseline
        return (
          <g key={ci} data-chart-stack={label}>
            {data.series.map((s, si) => {
              const v = Math.max(0, s[ci] ?? 0);
              const segH = (v / maxTotal) * chartH;
              const segY = cursorY - segH;
              cursorY = segY;
              if (segH <= 0) return null;
              return (
                <rect
                  key={si}
                  x={x}
                  y={segY}
                  width={barWidth}
                  height={segH}
                  fill={PALETTE[si % PALETTE.length]}
                  stroke={OUTLINE_PALETTE[si % OUTLINE_PALETTE.length]}
                  strokeWidth={1}
                  data-chart-stack-segment={`${label}:${si}`}
                />
              );
            })}
          </g>
        );
      })}
      {showSeriesLines
        ? data.series.slice(0, -1).map((_series, boundaryIndex) => (
            <polyline
              key={boundaryIndex}
              points={data.categories
                .map((_label, categoryIndex) => {
                  const cumulative = data.series
                    .slice(0, boundaryIndex + 1)
                    .reduce(
                      (sum, series) =>
                        sum + Math.max(0, series[categoryIndex] ?? 0),
                      0,
                    );
                  const x =
                    pad + categoryIndex * slot + barWidth / 2;
                  const y = baselineY - (cumulative / maxTotal) * chartH;
                  return `${x},${y}`;
                })
                .join(" ")}
              fill="none"
              stroke="var(--mrai-chart-series-line, #64748b)"
              strokeWidth={1}
              data-chart-series-line={boundaryIndex}
            />
          ))
        : null}
      {showAxisLabels
        ? renderAxisLabels(axisPoints, pad, chartW, baselineY)
        : null}
      {showAxisLabels
        ? renderPrimaryValueAxis(
            0,
            maxTotal,
            pad,
            baselineY,
            valueAxisNumberFormat,
          )
        : null}
      {showLegend
        ? renderLegend(seriesLegendPoints(data.seriesCount, data.names), width, height, legendPosition)
        : null}
    </svg>
  );
}

/**
 * COMBO: every value series except the last draws as clustered columns; the
 * final series draws as a line overlay, matching the native writer contract.
 * Needs >= 2 series — returns null with one series so the caller degrades to a
 * plain bar. The bars scale by their own abs-max; the line maps over its own
 * [min, max] span (collapse-safe) so a negative or flat line stays on-canvas.
 */
function renderCombo(
  data: MiniSeriesData,
  width: number,
  height: number,
  pad: number,
  chartW: number,
  chartH: number,
  showLegend: boolean,
  legendPosition: MiniChartLegendPosition,
  showAxisLabels: boolean,
): ReactElement | null {
  if (data.seriesCount < 2 || data.categories.length === 0) return null;
  const barSeries = data.series.slice(0, -1);
  const lineVals = data.series[data.series.length - 1];
  const n = data.categories.length;
  const barMax = Math.max(1, ...barSeries.flat().map((v) => Math.abs(v)));
  const lineScale = makeScale(
    Math.min(...lineVals),
    Math.max(...lineVals),
    pad + chartH,
    pad,
  );
  const slot = chartW / n;
  const barSlot = slot / barSeries.length;
  const barWidth = Math.max(1, barSlot - 2);
  const baselineY = pad + chartH;
  const lineStep = n > 1 ? chartW / (n - 1) : 0;
  const coords = lineVals.map((v, index) => {
    const x = n > 1 ? pad + index * lineStep : pad + chartW / 2;
    return `${x},${lineScale(v)}`;
  });
  const axisPoints: MiniChartPoint[] = data.categories.map((label) => ({
    label,
    value: 0,
  }));
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      data-testid="mini-chart"
      data-chart-kind="combo"
    >
      {barSeries.flatMap((series, seriesIndex) =>
        series.map((value, categoryIndex) => {
          const barHeight = (Math.abs(value) / barMax) * chartH;
          const x = pad + categoryIndex * slot + seriesIndex * barSlot;
          return (
            <rect
              key={`${seriesIndex}:${categoryIndex}`}
              x={x}
              y={baselineY - barHeight}
              width={barWidth}
              height={barHeight}
              fill={PALETTE[seriesIndex % PALETTE.length]}
              stroke={OUTLINE_PALETTE[seriesIndex % OUTLINE_PALETTE.length]}
              strokeWidth={1}
              data-chart-combo-bar={`${data.categories[categoryIndex]}:${seriesIndex}`}
            />
          );
        }),
      )}
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke={OUTLINE_PALETTE[barSeries.length % OUTLINE_PALETTE.length]}
        strokeWidth={2}
        data-chart-combo-line="true"
      />
      {lineVals.map((v, index) => {
        const x = n > 1 ? pad + index * lineStep : pad + chartW / 2;
        return (
          <circle
            key={index}
            cx={x}
            cy={lineScale(v)}
            r={2.5}
            fill={PALETTE[barSeries.length % PALETTE.length]}
            stroke={OUTLINE_PALETTE[barSeries.length % OUTLINE_PALETTE.length]}
            strokeWidth={1}
            data-chart-combo-point={data.categories[index]}
          />
        );
      })}
      {showAxisLabels
        ? renderAxisLabels(axisPoints, pad, chartW, baselineY)
        : null}
      {showLegend
        ? renderLegend(seriesLegendPoints(data.seriesCount, data.names), width, height, legendPosition)
        : null}
    </svg>
  );
}

/**
 * RADAR (spider): each value series is a polygon whose vertices are the series'
 * value at each category, placed around a circle. Needs >= 1 series AND >= 3
 * categories (a polygon needs 3+ axes) — returns null otherwise so the caller
 * degrades to a bar. Radii scale by the global abs-max across all series
 * (collapse-safe: all-zero data draws every vertex at the center, no NaN).
 */
function renderRadar(
  data: MiniSeriesData,
  width: number,
  height: number,
  showLegend: boolean,
  legendPosition: MiniChartLegendPosition,
): ReactElement | null {
  const axes = data.categories.length;
  if (data.seriesCount < 1 || axes < 3) return null;
  const sideBand = sideLegendBandWidth(width, legendPosition, showLegend);
  const plotLeft = legendPosition === "left" ? sideBand : 0;
  const plotWidth = width - sideBand;
  const cx = plotLeft + plotWidth / 2;
  const cy = height / 2;
  const radius = Math.max(1, Math.min(plotWidth, height) / 2 - 24);
  let absMax = 0;
  data.series.forEach((s) =>
    s.forEach((v) => {
      const a = Math.abs(v);
      if (a > absMax) absMax = a;
    }),
  );
  const scaleR = absMax === 0 ? () => 0 : (v: number) => (Math.abs(v) / absMax) * radius;
  const angleOf = (i: number) => -Math.PI / 2 + (i / axes) * Math.PI * 2;
  // Background axis spokes + outer ring so an empty/flat plot still shows a frame.
  const spokes = data.categories.map((_, i) => {
    const a = angleOf(i);
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
  });
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      data-testid="mini-chart"
      data-chart-kind="radar"
    >
      <polygon
        points={spokes.map((p) => `${p.x},${p.y}`).join(" ")}
        fill="none"
        stroke="var(--mrai-chart-gridline, #e2e8f0)"
        strokeWidth={1}
        data-chart-radar-frame="true"
      />
      {spokes.map((p, i) => (
        <line
          key={i}
          x1={cx}
          y1={cy}
          x2={p.x}
          y2={p.y}
          stroke="var(--mrai-chart-gridline, #e2e8f0)"
          strokeWidth={1}
        />
      ))}
      {data.series.map((s, si) => {
        const pts = data.categories.map((_, i) => {
          const a = angleOf(i);
          const r = scaleR(s[i] ?? 0);
          return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
        });
        const color = PALETTE[si % PALETTE.length];
        const outline = OUTLINE_PALETTE[si % OUTLINE_PALETTE.length];
        return (
          <polygon
            key={si}
            points={pts.join(" ")}
            fill={color}
            fillOpacity={0.18}
            stroke={outline}
            strokeWidth={2}
            data-chart-radar-series={si}
          />
        );
      })}
      {showLegend
        ? renderLegend(seriesLegendPoints(data.seriesCount, data.names), width, height, legendPosition)
        : null}
    </svg>
  );
}

/**
 * BUBBLE: a scatter (first value series X, second Y) where a THIRD value series
 * sets each point's RADIUS — a larger third value draws a larger bubble. Needs
 * >= 3 numeric series and >= 1 category — returns null otherwise so the caller
 * degrades to a plain scatter (which itself degrades to a bar). Axis domains are
 * collapse-safe; the radius maps the third series' abs-max onto [MIN, MAX] px so
 * a flat/zero third column still draws visible (min-radius) bubbles, never NaN.
 */
function renderBubble(
  data: MiniSeriesData,
  width: number,
  height: number,
  pad: number,
  chartW: number,
  chartH: number,
  showLegend: boolean,
  legendPosition: MiniChartLegendPosition,
  showDataLabels: boolean,
): ReactElement | null {
  if (data.seriesCount < 3 || data.categories.length === 0) return null;
  // Legacy grid contract (`@/lib/presentation-legacy-chart-grid`): the PPTX
  // writer exports these same three columns as X, Y and size.
  const xs = data.series[LEGACY_XY_SERIES.x];
  const ys = data.series[LEGACY_XY_SERIES.y];
  const sizes = data.series[LEGACY_XY_SERIES.size];
  const xScale = makeScale(Math.min(...xs), Math.max(...xs), pad, pad + chartW);
  const yScale = makeScale(Math.min(...ys), Math.max(...ys), pad + chartH, pad);
  // Radius scale: map |size| onto [MIN_R, MAX_R]. A zero-width size domain (all
  // equal) collapses to the midpoint radius (makeScale handles the divide-by-0).
  const MIN_R = 3;
  const MAX_R = 16;
  const absSizes = sizes.map((s) => (Number.isFinite(s) ? Math.abs(s) : 0));
  const rScale = makeScale(
    Math.min(...absSizes),
    Math.max(...absSizes),
    MIN_R,
    MAX_R,
  );
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      data-testid="mini-chart"
      data-chart-kind="bubble"
    >
      {xs.map((x, index) => {
        const r = rScale(absSizes[index]);
        const safeR = Number.isFinite(r) ? Math.max(MIN_R, Math.min(MAX_R, r)) : MIN_R;
        return (
          <circle
            key={index}
            cx={xScale(x)}
            cy={yScale(ys[index])}
            r={safeR}
            fill={PALETTE[index % PALETTE.length]}
            fillOpacity={0.55}
            stroke={OUTLINE_PALETTE[0]}
            strokeWidth={1}
            data-chart-bubble-point={data.categories[index]}
            data-chart-bubble-r={safeR}
          />
        );
      })}
      {showDataLabels
        ? renderDataLabels(
            xs.map((x, index) => ({
              x: xScale(x),
              y: yScale(ys[index]) - rScale(absSizes[index]) - 4,
              value: sizes[index],
            })),
          )
        : null}
      {showLegend
        ? renderLegend(seriesLegendPoints(data.seriesCount, data.names), width, height, legendPosition)
        : null}
    </svg>
  );
}

/**
 * HISTOGRAM: bin the FIRST numeric column into N equal-width buckets and draw the
 * per-bucket COUNT as bars (a distribution chart — its x-axis is the value range,
 * not the category labels). Driven by the flat `values` the caller extracts (so a
 * SINGLE-column range works — there is no separate label column). Needs >= 1
 * numeric value — returns null otherwise so the caller degrades to a bar. The
 * bucket count comes from Sturges' rule (the binning helper's default). Bar
 * heights scale by the max bucket count so the tallest fills the plot; an
 * empty/all-zero count plot draws flat bars.
 */
function renderHistogram(
  values: ReadonlyArray<number>,
  width: number,
  height: number,
  pad: number,
  chartW: number,
  chartH: number,
  showLegend: boolean,
  legendPosition: MiniChartLegendPosition,
  showAxisLabels: boolean,
  intervalClosed: HistogramIntervalClosed,
): ReactElement | null {
  if (values.length === 0) return null;
  const bins = computeHistogramBins(values, { intervalClosed });
  if (bins.length === 0) return null;
  const maxCount = Math.max(1, ...bins.map((b) => b.count));
  const slot = chartW / bins.length;
  const barGap = bins.length > 40 ? 0 : 2; // dense bins -> touching bars
  const barWidth = Math.max(1, slot - barGap);
  const baselineY = pad + chartH;
  // Bucket labels: the lower edge of each bin (short, 0..2 decimals).
  const axisPoints: MiniChartPoint[] = bins.map((b) => ({
    label: formatDataLabel(b.lo),
    value: b.count,
  }));
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      data-testid="mini-chart"
      data-chart-kind="histogram"
    >
      {bins.map((b, index) => {
        const barHeight = (b.count / maxCount) * chartH;
        const x = pad + index * slot;
        return (
          <rect
            key={index}
            x={x}
            y={baselineY - barHeight}
            width={barWidth}
            height={barHeight}
            fill={PALETTE[0]}
            stroke={OUTLINE_PALETTE[0]}
            strokeWidth={1}
            data-chart-histogram-bin={`${formatDataLabel(b.lo)}..${formatDataLabel(b.hi)}`}
            data-chart-histogram-count={b.count}
          />
        );
      })}
      {showAxisLabels
        ? renderAxisLabels(axisPoints, pad, chartW, baselineY)
        : null}
      {showLegend ? renderLegend(seriesLegendPoints(1), width, height, legendPosition) : null}
    </svg>
  );
}

/**
 * WATERFALL: running cumulative bars — each bar starts where the previous one
 * ended, colored UP (positive delta) vs DOWN (negative delta), with an optional
 * synthetic TOTAL bar from 0 to the grand total. Driven by the flat `points`
 * (label + delta) the caller extracts so a SINGLE delta column works. Needs >= 1
 * point — returns null otherwise so the caller degrades to a bar. The value
 * domain spans every start/end (and 0) so positive and negative running totals
 * both stay on-canvas (collapse-safe).
 */
const WATERFALL_UP_COLOR = "#16a34a";
const WATERFALL_DOWN_COLOR = "#dc2626";
const WATERFALL_TOTAL_COLOR = "#2563eb";

function renderWaterfall(
  points: ReadonlyArray<MiniChartPoint>,
  width: number,
  height: number,
  pad: number,
  chartW: number,
  chartH: number,
  showLegend: boolean,
  legendPosition: MiniChartLegendPosition,
  showAxisLabels: boolean,
  showDataLabels: boolean,
  withTotal: boolean,
): ReactElement | null {
  if (points.length === 0) return null;
  const steps = computeWaterfallSteps(
    points.map((p) => ({ label: p.label, value: p.value })),
    withTotal,
  );
  if (steps.length === 0) return null;
  // Domain spans every bar edge AND 0 so an all-negative walk still anchors to 0.
  let lo = 0;
  let hi = 0;
  for (const s of steps) {
    lo = Math.min(lo, s.start, s.end);
    hi = Math.max(hi, s.start, s.end);
  }
  const yScale = makeScale(lo, hi, pad + chartH, pad);
  const slot = chartW / steps.length;
  const barGap = 6;
  const barWidth = Math.max(1, slot - barGap);
  const axisPoints: MiniChartPoint[] = steps.map((s) => ({
    label: s.label,
    value: s.delta,
  }));
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      data-testid="mini-chart"
      data-chart-kind="waterfall"
    >
      {steps.map((s, index) => {
        const yStart = yScale(s.start);
        const yEnd = yScale(s.end);
        const top = Math.min(yStart, yEnd);
        const barHeight = Math.max(1, Math.abs(yEnd - yStart));
        const x = pad + index * slot;
        const color = s.isTotal
          ? WATERFALL_TOTAL_COLOR
          : s.delta >= 0
            ? WATERFALL_UP_COLOR
            : WATERFALL_DOWN_COLOR;
        return (
          <rect
            key={index}
            x={x}
            y={top}
            width={barWidth}
            height={barHeight}
            fill={color}
            data-chart-waterfall-bar={s.label}
            data-chart-waterfall-dir={
              s.isTotal ? "total" : s.delta >= 0 ? "up" : "down"
            }
          />
        );
      })}
      {showDataLabels
        ? renderDataLabels(
            steps.map((s, index) => ({
              x: pad + index * slot + barWidth / 2,
              y: Math.min(yScale(s.start), yScale(s.end)) - 4,
              value: s.isTotal ? s.end : s.delta,
            })),
          )
        : null}
      {showAxisLabels
        ? renderAxisLabels(axisPoints, pad, chartW, pad + chartH)
        : null}
      {showLegend ? renderLegend(seriesLegendPoints(1), width, height, legendPosition) : null}
    </svg>
  );
}

// ─── Box-and-Whisker renderer ─────────────────────────────────────────────────

/** Color constants for box-and-whisker elements (Excel-like palette). */
const BOX_FILL = PALETTE[0];
const BOX_FILL_OPACITY = 0.25;
const BOX_STROKE = PALETTE[0];
const MEDIAN_COLOR = "#1e293b";
const WHISKER_COLOR = "#64748b";
const OUTLIER_COLOR = PALETTE[3];
const MEAN_COLOR = "#dc2626"; // × marker (Excel uses red)

/**
 * BOX-AND-WHISKER: per series compute the five-number summary (QUARTILE.INC),
 * 1.5 × IQR whiskers, outlier dots, and the mean × marker (Excel parity).
 * Each series in the data (`multi.series[i]`) becomes one box. Needs >= 1 series
 * with >= 1 finite value — returns null otherwise. The category labels appear
 * below each box. The value domain spans all whisker ends, outliers, and 0 so the
 * plot stays on-canvas.
 *
 * NOTE: renders in-app only; xlsx chartEx (cx:) export is not yet supported by
 * openpyxl — deferred.
 */
function renderBoxWhisker(
  data: MiniSeriesData,
  width: number,
  height: number,
  pad: number,
  chartW: number,
  chartH: number,
  showLegend: boolean,
  legendPosition: MiniChartLegendPosition,
): ReactElement | null {
  if (data.seriesCount < 1 || data.categories.length === 0) return null;
  // Compute stats per series (each series = one box).
  const statsList = data.series.map((s) => computeBoxWhiskerStats(s));
  if (statsList.every((s) => s === null)) return null;

  // Build the value domain from all whiskers + outliers + 0.
  let lo = 0;
  let hi = 0;
  for (const st of statsList) {
    if (!st) continue;
    lo = Math.min(lo, st.min, ...st.outliers);
    hi = Math.max(hi, st.max, ...st.outliers);
  }
  // Expand lo/hi slightly so a flat all-equal series doesn't collapse.
  if (lo === hi) { lo -= 1; hi += 1; }
  const yScale = makeScale(lo, hi, pad + chartH, pad);

  const n = data.seriesCount;
  const slot = chartW / n;
  const boxWidth = Math.max(2, slot * 0.5);
  const capHalf = boxWidth * 0.3;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      data-testid="mini-chart"
      data-chart-kind="box-and-whisker"
    >
      {statsList.map((st, si) => {
        const cx = pad + si * slot + slot / 2;
        const label = data.categories[si] ?? `Series ${si + 1}`;
        if (!st) return null;
        const yMin = yScale(st.min);
        const yQ1 = yScale(st.q1);
        const yMed = yScale(st.median);
        const yQ3 = yScale(st.q3);
        const yMax = yScale(st.max);
        const yMean = yScale(st.mean);
        const boxL = cx - boxWidth / 2;
        const boxTop = Math.min(yQ1, yQ3);
        const boxBottom = Math.max(yQ1, yQ3);
        const boxH = Math.max(1, boxBottom - boxTop);
        return (
          <g key={si} data-chart-box={label}>
            {/* Lower whisker: min -> Q1 */}
            <line
              x1={cx} y1={yMin} x2={cx} y2={yQ1}
              stroke={WHISKER_COLOR} strokeWidth={1.5}
              strokeDasharray="3 2"
              data-chart-whisker-lo="true"
            />
            {/* Lower whisker cap */}
            <line
              x1={cx - capHalf} y1={yMin} x2={cx + capHalf} y2={yMin}
              stroke={WHISKER_COLOR} strokeWidth={1.5}
            />
            {/* Upper whisker: Q3 -> max */}
            <line
              x1={cx} y1={yQ3} x2={cx} y2={yMax}
              stroke={WHISKER_COLOR} strokeWidth={1.5}
              strokeDasharray="3 2"
              data-chart-whisker-hi="true"
            />
            {/* Upper whisker cap */}
            <line
              x1={cx - capHalf} y1={yMax} x2={cx + capHalf} y2={yMax}
              stroke={WHISKER_COLOR} strokeWidth={1.5}
            />
            {/* IQR box (Q1..Q3) */}
            <rect
              x={boxL}
              y={boxTop}
              width={boxWidth}
              height={boxH}
              fill={BOX_FILL}
              fillOpacity={BOX_FILL_OPACITY}
              stroke={BOX_STROKE}
              strokeWidth={1.5}
              data-chart-box-iqr="true"
            />
            {/* Median line */}
            <line
              x1={boxL} y1={yMed} x2={boxL + boxWidth} y2={yMed}
              stroke={MEDIAN_COLOR} strokeWidth={2}
              data-chart-box-median={formatDataLabel(st.median)}
            />
            {/* Mean × marker (Excel shows mean as an ×) */}
            <text
              x={cx} y={yMean + 4}
              fontSize={10}
              fontWeight="bold"
              fill={MEAN_COLOR}
              textAnchor="middle"
              data-chart-box-mean={formatDataLabel(st.mean)}
            >
              ×
            </text>
            {/* Outlier dots */}
            {st.outliers.map((v, oi) => (
              <circle
                key={oi}
                cx={cx}
                cy={yScale(v)}
                r={2.5}
                fill={OUTLIER_COLOR}
                fillOpacity={0.75}
                data-chart-box-outlier={formatDataLabel(v)}
              />
            ))}
            {/* Category label below each box */}
            <text
              x={cx}
              y={pad + chartH + 12}
              fontSize={9}
              fill="var(--mrai-chart-text, #475569)"
              textAnchor="middle"
              data-chart-box-label={label}
            >
              {label}
            </text>
          </g>
        );
      })}
      {showLegend ? renderLegend(seriesLegendPoints(n), width, height, legendPosition) : null}
    </svg>
  );
}

// ─── Pareto renderer ──────────────────────────────────────────────────────────

/**
 * PARETO: categories sorted descending by value, rendered as bars plus a
 * secondary cumulative-percentage line on a right 0–100 % axis (Excel parity).
 * Needs >= 1 finite positive value — returns null otherwise so the caller
 * degrades to a bar. Category labels appear below the bars.
 *
 * NOTE: renders in-app only; xlsx chartEx (cx:) export is not yet supported by
 * openpyxl — deferred.
 */
function renderPareto(
  points: ReadonlyArray<MiniChartPoint>,
  width: number,
  height: number,
  pad: number,
  chartW: number,
  chartH: number,
  showLegend: boolean,
  legendPosition: MiniChartLegendPosition,
  showAxisLabels: boolean,
  showDataLabels: boolean,
): ReactElement | null {
  if (points.length === 0) return null;
  const paretoPoints = computeParetoPoints(
    points.map((p) => ({ label: p.label, value: p.value })),
  );
  if (paretoPoints.length === 0) return null;

  const maxVal = Math.max(1, ...paretoPoints.map((p) => Math.abs(p.value)));
  const n = paretoPoints.length;
  const slot = chartW / n;
  const barGap = 2; // contiguous bars (Pareto standard)
  const barWidth = Math.max(1, slot - barGap);
  const baselineY = pad + chartH;

  // Secondary right axis: 0–100 %
  const pctScale = makeScale(0, 100, pad + chartH, pad);
  // x center for each bar/point
  const xOf = (index: number) => pad + index * slot + barWidth / 2;

  // Cumulative % line coordinates
  const lineCoords = paretoPoints.map((p, i) => `${xOf(i)},${pctScale(p.cumPct)}`);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      data-testid="mini-chart"
      data-chart-kind="pareto"
    >
      {/* Bars (sorted descending) */}
      {paretoPoints.map((p, i) => {
        const barH = (Math.max(0, p.value) / maxVal) * chartH;
        const x = pad + i * slot;
        return (
          <rect
            key={i}
            x={x}
            y={baselineY - barH}
            width={barWidth}
            height={barH}
            fill={PALETTE[0]}
            stroke={OUTLINE_PALETTE[0]}
            strokeWidth={1}
            data-chart-pareto-bar={p.label}
          />
        );
      })}
      {/* Cumulative % line */}
      <polyline
        points={lineCoords.join(" ")}
        fill="none"
        stroke={PALETTE[1]}
        strokeWidth={2}
        data-chart-pareto-line="true"
      />
      {/* Dot at each cumulative % point */}
      {paretoPoints.map((p, i) => (
        <circle
          key={i}
          cx={xOf(i)}
          cy={pctScale(p.cumPct)}
          r={2.5}
          fill={PALETTE[1]}
          stroke={OUTLINE_PALETTE[1]}
          strokeWidth={1}
          data-chart-pareto-pct={formatDataLabel(p.cumPct)}
        />
      ))}
      {/* Right axis: 0 % at baseline, 100 % at top */}
      <line
        x1={pad + chartW} y1={pad}
        x2={pad + chartW} y2={pad + chartH}
        stroke="var(--mrai-chart-muted, #94a3b8)" strokeWidth={1}
        data-chart-pareto-pct-axis="true"
      />
      <text
        x={pad + chartW + 2} y={pad + 8}
        fontSize={9} fill="var(--mrai-chart-muted, #94a3b8)"
        data-chart-pareto-pct-max="100%"
      >
        100%
      </text>
      <text
        x={pad + chartW + 2} y={pad + chartH}
        fontSize={9} fill="var(--mrai-chart-muted, #94a3b8)"
        data-chart-pareto-pct-min="0%"
      >
        0%
      </text>
      {/* Data labels above bars */}
      {showDataLabels
        ? renderDataLabels(
            paretoPoints.map((p, i) => ({
              x: xOf(i),
              y: baselineY - (Math.max(0, p.value) / maxVal) * chartH - 4,
              value: p.value,
            })),
          )
        : null}
      {/* Category labels below bars */}
      {showAxisLabels
        ? renderAxisLabels(
            paretoPoints.map((p) => ({ label: p.label, value: p.value })),
            pad,
            chartW,
            baselineY,
          )
        : null}
      {showLegend ? renderLegend(seriesLegendPoints(1), width, height, legendPosition) : null}
    </svg>
  );
}

// ─── Treemap renderer ─────────────────────────────────────────────────────────

/**
 * TREEMAP: nested rectangles sized proportionally by value. Uses a flat
 * slice-and-dice layout (computeTreemapRects). Each rectangle is labelled.
 * NOTE: single-level only; multi-level hierarchy from multi-column category paths
 * is limited to grouping by the first category. Renders in-app only; xlsx chartEx
 * (cx:) export is not yet supported by openpyxl — deferred.
 */
function renderTreemap(
  points: MiniChartPoint[],
  width: number,
  height: number,
  pad: number,
  chartW: number,
  chartH: number,
  showLegend: boolean,
  legendPosition: MiniChartLegendPosition,
  showDataLabels: boolean,
): ReactElement | null {
  if (points.length === 0) return null;
  const rects = computeTreemapRects(
    points.map((p) => ({ label: p.label, value: p.value })),
  );
  if (rects.length === 0) return null;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      data-testid="mini-chart"
      data-chart-kind="treemap"
    >
      {rects.map((r, i) => {
        const px = pad + r.x * chartW;
        const py = pad + r.y * chartH;
        const pw = Math.max(1, r.w * chartW);
        const ph = Math.max(1, r.h * chartH);
        const fill = PALETTE[r.index % PALETTE.length];
        // Only show labels when the rect is wide enough to fit them.
        const showLabel = pw > 24 && ph > 14;
        return (
          <g key={i} data-chart-treemap-cell={r.label}>
            <rect
              x={px}
              y={py}
              width={pw}
              height={ph}
              fill={fill}
              fillOpacity={0.82}
              stroke="#fff"
              strokeWidth={1.5}
            />
            {showLabel ? (
              <text
                x={px + pw / 2}
                y={py + ph / 2 + 4}
                fontSize={Math.max(7, Math.min(11, pw / 6))}
                fill="#fff"
                textAnchor="middle"
                data-chart-treemap-label={r.label}
              >
                {r.label}
              </text>
            ) : null}
            {showDataLabels && showLabel ? (
              <text
                x={px + pw / 2}
                y={py + ph / 2 + 15}
                fontSize={8}
                fill="#fff"
                textAnchor="middle"
                data-chart-treemap-value={formatDataLabel(r.value)}
              >
                {formatDataLabel(r.value)}
              </text>
            ) : null}
          </g>
        );
      })}
      {showLegend ? renderLegend(points, width, height, legendPosition) : null}
    </svg>
  );
}

// ─── Sunburst renderer ────────────────────────────────────────────────────────

/**
 * SUNBURST: radial concentric ring segments, inner = top level, outer = leaf.
 * With flat single-level data this degrades to a doughnut (one ring). Angles
 * start at 12 o'clock and sweep clockwise. Renders in-app only; xlsx chartEx
 * (cx:) export is not yet supported by openpyxl — deferred.
 */
function renderSunburst(
  points: MiniChartPoint[],
  width: number,
  height: number,
  showLegend: boolean,
  legendPosition: MiniChartLegendPosition,
): ReactElement | null {
  if (points.length === 0) return null;
  const segments = computeSunburstSegments(
    points.map((p) => ({ label: p.label, value: p.value })),
  );
  if (segments.length === 0) return null;
  const sideBand = sideLegendBandWidth(width, legendPosition, showLegend);
  const plotLeft = legendPosition === "left" ? sideBand : 0;
  const plotWidth = width - sideBand;
  const cx = plotLeft + plotWidth / 2;
  const cy = height / 2;
  const maxRadius = Math.max(1, Math.min(plotWidth, height) / 2 - 8);
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      data-testid="mini-chart"
      data-chart-kind="sunburst"
    >
      {segments.map((seg, i) => {
        const innerR = seg.innerR * maxRadius;
        const outerR = seg.outerR * maxRadius;
        const sweep = seg.endAngle - seg.startAngle;
        // Full ring (only one category): draw two concentric semicircles.
        if (sweep >= Math.PI * 2 - 1e-6) {
          const fill = PALETTE[seg.index % PALETTE.length];
          return (
            <path
              key={i}
              d={
                `M ${cx + outerR} ${cy} ` +
                `A ${outerR} ${outerR} 0 1 1 ${cx - outerR} ${cy} ` +
                `A ${outerR} ${outerR} 0 1 1 ${cx + outerR} ${cy} Z ` +
                `M ${cx + innerR} ${cy} ` +
                `A ${innerR} ${innerR} 0 1 0 ${cx - innerR} ${cy} ` +
                `A ${innerR} ${innerR} 0 1 0 ${cx + innerR} ${cy} Z`
              }
              fill={fill}
              fillRule="evenodd"
              data-chart-sunburst-segment={seg.label}
            />
          );
        }
        const large = sweep > Math.PI ? 1 : 0;
        const ox1 = cx + outerR * Math.cos(seg.startAngle);
        const oy1 = cy + outerR * Math.sin(seg.startAngle);
        const ox2 = cx + outerR * Math.cos(seg.endAngle);
        const oy2 = cy + outerR * Math.sin(seg.endAngle);
        const ix2 = cx + innerR * Math.cos(seg.endAngle);
        const iy2 = cy + innerR * Math.sin(seg.endAngle);
        const ix1 = cx + innerR * Math.cos(seg.startAngle);
        const iy1 = cy + innerR * Math.sin(seg.startAngle);
        const fill = PALETTE[seg.index % PALETTE.length];
        return (
          <path
            key={i}
            d={
              `M ${ox1} ${oy1} ` +
              `A ${outerR} ${outerR} 0 ${large} 1 ${ox2} ${oy2} ` +
              `L ${ix2} ${iy2} ` +
              `A ${innerR} ${innerR} 0 ${large} 0 ${ix1} ${iy1} Z`
            }
            fill={fill}
            fillOpacity={0.88}
            stroke="#fff"
            strokeWidth={1}
            data-chart-sunburst-segment={seg.label}
          />
        );
      })}
      {showLegend ? renderLegend(points, width, height, legendPosition) : null}
    </svg>
  );
}

// ─── Stock / Candlestick renderer ─────────────────────────────────────────────

/** Candle up color (bullish / close >= open: green). */
const CANDLE_UP_COLOR = "#16a34a";
/** Candle down color (bearish / close < open: red). */
const CANDLE_DOWN_COLOR = "#dc2626";

/**
 * STOCK / CANDLESTICK: per-category OHLC candles — a high-low wick plus an
 * open-close box. Up candles (close >= open) are green, down candles are red.
 * Supports the High-Low-Close (3-series) and Open-High-Low-Close (4-series)
 * Excel variants. Returns null when fewer than 3 numeric series exist. The
 * value domain spans all OHLC values so the plot stays on-canvas.
 *
 * NOTE: renders in-app only; xlsx StockChart export via openpyxl is not yet
 * wired — deferred.
 */
function renderStock(
  data: MiniSeriesData,
  width: number,
  height: number,
  pad: number,
  chartW: number,
  chartH: number,
  showLegend: boolean,
  legendPosition: MiniChartLegendPosition,
  showAxisLabels: boolean,
): ReactElement | null {
  if (data.seriesCount < 3 || data.categories.length === 0) return null;
  const bars = computeCandlestickBars(data.categories, data.series);
  if (bars.length === 0) return null;
  // Build value domain from all OHLC values.
  let lo = Infinity;
  let hi = -Infinity;
  for (const b of bars) {
    if (b.open !== null) { lo = Math.min(lo, b.open); hi = Math.max(hi, b.open); }
    lo = Math.min(lo, b.low);
    hi = Math.max(hi, b.high);
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  if (lo === hi) { lo -= 1; hi += 1; }
  const yScale = makeScale(lo, hi, pad + chartH, pad);
  const n = data.categories.length;
  const slot = chartW / n;
  const candleWidth = Math.max(2, slot * 0.5);
  const axisPoints: MiniChartPoint[] = data.categories.map((label) => ({
    label,
    value: 0,
  }));
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      data-testid="mini-chart"
      data-chart-kind="stock"
    >
      {bars.map((bar) => {
        const cx = pad + bar.index * slot + slot / 2;
        const yHigh = yScale(bar.high);
        const yLow = yScale(bar.low);
        const yClose = yScale(bar.close);
        const color = bar.up ? CANDLE_UP_COLOR : CANDLE_DOWN_COLOR;
        if (bar.open === null) {
          // HLC variant: wick + close tick only.
          return (
            <g key={bar.index} data-chart-candle={bar.label}>
              <line
                x1={cx} y1={yHigh} x2={cx} y2={yLow}
                stroke={color} strokeWidth={1.5}
                data-chart-candle-wick="true"
              />
              <line
                x1={cx} y1={yClose} x2={cx + candleWidth / 2} y2={yClose}
                stroke={color} strokeWidth={2}
                data-chart-candle-close={formatDataLabel(bar.close)}
              />
            </g>
          );
        }
        const yOpen = yScale(bar.open);
        const boxTop = Math.min(yOpen, yClose);
        const boxH = Math.max(1, Math.abs(yClose - yOpen));
        return (
          <g key={bar.index} data-chart-candle={bar.label}>
            {/* High-low wick */}
            <line
              x1={cx} y1={yHigh} x2={cx} y2={yLow}
              stroke={color} strokeWidth={1.5}
              data-chart-candle-wick="true"
            />
            {/* Open-close box */}
            <rect
              x={cx - candleWidth / 2}
              y={boxTop}
              width={candleWidth}
              height={boxH}
              fill={bar.up ? "none" : color}
              stroke={color}
              strokeWidth={1.5}
              data-chart-candle-box={bar.up ? "up" : "down"}
            />
          </g>
        );
      })}
      {showAxisLabels
        ? renderAxisLabels(axisPoints, pad, chartW, pad + chartH)
        : null}
      {showLegend ? renderLegend(seriesLegendPoints(data.seriesCount, data.names), width, height, legendPosition) : null}
    </svg>
  );
}

export interface MiniChartProps {
  type?: string;
  rows?: string[][];
  /** Native Scatter/Bubble series with independent authenticated X vectors. */
  xySeries?: MiniChartXYSeries[];
  width?: number;
  height?: number;
  /**
   * Explicit caller-owned empty state. Legacy call sites omit this and retain
   * the historical null result; native chart objects provide a visible status
   * instead of silently presenting an empty card when refs are not plottable.
   */
  emptyFallback?: ReactElement | null;
  // Chart editor toggles (Excel/WPS parity). Optional/additive so existing call
  // sites render exactly as before when omitted (legend / axis labels hidden);
  // the spreadsheet chart editor passes the persisted toggle values to show
  // them. The legend lists each category swatch+label; axis labels print the
  // category labels beneath bar/line charts.
  showLegend?: boolean;
  // Where the legend sits — "top" (default, the prior fixed placement) or
  // "bottom" (Excel "Legend position"). Only affects the legend's y-offset.
  legendPosition?: MiniChartLegendPosition;
  showAxisLabels?: boolean;
  // Opt in to the extended chart kinds (scatter/stacked/combo/radar/doughnut).
  // Off by default so the SHARED chart-object + presentation surfaces keep their
  // legacy fold (doughnut->pie, scatter/stacked/combo/radar->bar); only the
  // spreadsheet floating chart, whose picker exposes the new types, opts in.
  extendedTypes?: boolean;
  // Optional Excel-style trendline overlaid on the PRIMARY series (linear OLS or
  // trailing moving average). Drawn as a dashed polyline on the bar/line/area/
  // scatter branches using each branch's own scale; ignored on pie/doughnut/
  // radar (no ordered series). Absent -> no overlay (byte-identical to before).
  trendline?: ChartTrendlineSpec;
  // When true, print each plotted value next to its point/bar (Excel "Data
  // Labels"). Off by default so existing call sites render exactly as before.
  showDataLabels?: boolean;
  // Optional Excel-style error bars (vertical whiskers) at each plotted point/bar
  // on the cartesian branches (bar/line/scatter), sized by the spec's amount.
  // Ignored on pie/doughnut/radar. Absent -> no whiskers (byte-identical).
  errorBars?: ChartErrorBarSpec;
  /** Spreadsheet-only classic line marker/smooth identity; PPT callers omit it. */
  lineSeriesStyles?: readonly SpreadsheetChartLineSeriesStyle[];
  /** Spreadsheet-only exact two-stop series gradients; shared callers omit it. */
  seriesGradientStyles?: readonly SpreadsheetChartSeriesGradientStyle[];
  /** First-to-last series delta bars for 2-D multi-series line charts. */
  upDownBars?: boolean;
  dropLines?: boolean;
  highLowLines?: boolean;
  seriesLines?: boolean;
  // 0-based VALUE-series indices to plot against a SECONDARY (right-hand) Y axis.
  // The listed series render as line overlays scaled to a right spine; the primary
  // geometry is unchanged. Ignored on pie/doughnut/radar. Empty/absent -> no
  // secondary axis (byte-identical to before).
  secondaryAxisSeries?: number[];
  // When true, a WATERFALL chart appends a synthetic final TOTAL bar (0..grand
  // total). Ignored by every other kind. Off by default (byte-identical).
  waterfallTotal?: boolean;
  /** Effective primary value-axis format. Omitted keeps shared PPT rendering unchanged. */
  valueAxisNumberFormat?: string;
  /**
   * The closed side a HISTOGRAM declares (`cx:binning/@intervalClosed`).
   * Omitted is Excel's own default `r`, so a preview of a chart with no part
   * behind it bins the way Excel bins.
   */
  binIntervalClosed?: HistogramIntervalClosed;
}

function smoothLinePath(
  values: readonly number[],
  xOf: (index: number) => number,
  yOf: (value: number) => number,
): string {
  const points = values.map((value, index) => ({
    x: xOf(index),
    y: yOf(value),
  }));
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] ?? points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return path;
}

function lineMarker(
  symbol: SpreadsheetLineMarkerSymbol,
  size: number,
  cx: number,
  cy: number,
  fill: string,
  stroke: string,
  pointLabel: string,
  key: string,
): ReactElement | null {
  if (symbol === "none") return null;
  const radius = size / 2;
  const common = {
    fill,
    stroke,
    strokeWidth: 1,
    "data-chart-point": pointLabel,
  };
  let shape: ReactElement;
  if (symbol === "circle" || symbol === "dot") {
    shape = (
      <circle
        cx={cx}
        cy={cy}
        r={symbol === "dot" ? Math.max(1, radius * 0.45) : radius}
        {...common}
      />
    );
  } else if (symbol === "square" || symbol === "dash") {
    shape = (
      <rect
        x={cx - radius}
        y={cy - (symbol === "dash" ? Math.max(1, radius * 0.3) : radius)}
        width={size}
        height={symbol === "dash" ? Math.max(2, radius * 0.6) : size}
        {...common}
      />
    );
  } else if (symbol === "diamond") {
    shape = (
      <polygon
        points={`${cx},${cy - radius} ${cx + radius},${cy} ${cx},${cy + radius} ${cx - radius},${cy}`}
        {...common}
      />
    );
  } else if (symbol === "triangle") {
    shape = (
      <polygon
        points={`${cx},${cy - radius} ${cx + radius},${cy + radius} ${cx - radius},${cy + radius}`}
        {...common}
      />
    );
  } else if (symbol === "star") {
    const points = Array.from({ length: 10 }, (_, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI) / 5;
      const r = index % 2 === 0 ? radius : radius * 0.42;
      return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`;
    }).join(" ");
    shape = <polygon points={points} {...common} />;
  } else {
    const paths =
      symbol === "plus"
        ? `M ${cx - radius} ${cy} H ${cx + radius} M ${cx} ${cy - radius} V ${cy + radius}`
        : `M ${cx - radius} ${cy - radius} L ${cx + radius} ${cy + radius} M ${cx + radius} ${cy - radius} L ${cx - radius} ${cy + radius}`;
    shape = (
      <path
        d={paths}
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeWidth={Math.max(1, size / 5)}
      />
    );
  }
  return (
    <g
      key={key}
      data-chart-marker={key}
      data-chart-marker-size={size}
      data-chart-marker-symbol={symbol}
    >
      {shape}
    </g>
  );
}

export default function MiniChart({
  type,
  rows,
  xySeries,
  width = 320,
  height = 180,
  emptyFallback = null,
  showLegend = false,
  legendPosition = "top",
  showAxisLabels = false,
  extendedTypes = false,
  trendline,
  showDataLabels = false,
  errorBars,
  lineSeriesStyles,
  seriesGradientStyles,
  upDownBars = false,
  dropLines = false,
  highLowLines = false,
  seriesLines = false,
  secondaryAxisSeries,
  waterfallTotal = false,
  valueAxisNumberFormat,
  binIntervalClosed = DEFAULT_HISTOGRAM_INTERVAL_CLOSED,
}: MiniChartProps) {
  const gradientIdPrefix = `mini-chart-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const points = pointsFromRows(rows);
  const kind = normalizeType(type, extendedTypes);
  const nativeXYKind = kind === "scatter" || kind === "bubble";
  if (points.length === 0 && !(nativeXYKind && xySeries?.length)) {
    return emptyFallback;
  }
  const sideLegendBand = sideLegendBandWidth(
    width,
    legendPosition,
    showLegend,
  );
  const basePad = sideLegendBand > 0 && width < 200 ? 8 : 24;
  const pad = basePad + (legendPosition === "left" ? sideLegendBand : 0);
  // Reserve space at the bottom for axis labels (bar/line/stacked/combo) so they
  // do not overlap the plotted geometry. Radial charts (pie/doughnut/radar) and
  // scatter (its own numeric x-axis) have no category baseline. Box-and-whisker
  // and pareto handle their own labels internally.
  const noCategoryAxis =
    kind === "pie" ||
    kind === "doughnut" ||
    kind === "radar" ||
    kind === "scatter" ||
    kind === "bubble" ||
    kind === "box-and-whisker" ||
    kind === "pareto" ||
    kind === "treemap" ||
    kind === "sunburst" ||
    kind === "stock";
  const axisBand = showAxisLabels && !noCategoryAxis ? 16 : 0;
  const chartW = Math.max(
    1,
    width -
      pad -
      basePad -
      (legendPosition === "right" ? sideLegendBand : 0),
  );
  const chartH = Math.max(1, height - pad * 2 - axisBand);

  // ---- Extended multi-series kinds (additive; legacy branches below are
  // byte-identical for bar/line/pie/area). Each guards too-few series and
  // degrades to a sane single-series fallback rather than crashing or NaN-ing.
  const multi = seriesFromRows(rows);
  const lineStyleByIndex = new Map(
    (normalizeChartLineSeriesStyles(lineSeriesStyles) ?? []).map((style) => [
      style.seriesIndex,
      style,
    ]),
  );

  if (nativeXYKind && xySeries?.length) {
    const nativeXY = renderNativeXYSeries(
      kind,
      xySeries,
      width,
      height,
      pad,
      chartW,
      chartH,
      showLegend,
      legendPosition,
      trendline,
      showDataLabels,
      errorBars,
    );
    if (nativeXY) return nativeXY;
  }

  if (kind === "scatter") {
    const fallback = renderScatter(
      multi,
      width,
      height,
      pad,
      chartW,
      chartH,
      showLegend,
      legendPosition,
      trendline,
      showDataLabels,
      errorBars,
    );
    if (fallback) return fallback;
    // Too few numeric series (<2): fall through to the bar fallback so a
    // mis-configured scatter still shows its single series instead of nothing.
  }

  if (kind === "bubble") {
    const bubble = renderBubble(
      multi,
      width,
      height,
      pad,
      chartW,
      chartH,
      showLegend,
      legendPosition,
      showDataLabels,
    );
    if (bubble) return bubble;
    // No 3rd numeric series: degrade to a plain scatter (then to bar) so a
    // 2-column "bubble" still plots its XY points instead of nothing.
    const scatter = renderScatter(
      multi,
      width,
      height,
      pad,
      chartW,
      chartH,
      showLegend,
      legendPosition,
      trendline,
      showDataLabels,
      errorBars,
    );
    if (scatter) return scatter;
    // <2 numeric series -> fall through to the bar fallback below.
  }

  if (kind === "histogram") {
    // Histogram bins a single numeric column; `points` already reads a 1-column
    // range (value = row[1] ?? row[0]), so it works whether the range is one or
    // two columns wide.
    const histogram = renderHistogram(
      points.map((p) => p.value),
      width,
      height,
      pad,
      chartW,
      chartH,
      showLegend,
      legendPosition,
      showAxisLabels,
      binIntervalClosed,
    );
    if (histogram) return histogram;
    // No numeric value -> fall through to bar.
  }

  if (kind === "waterfall") {
    // Waterfall walks a single delta column; drive it from `points` (label +
    // value) so a 1-column or 2-column range both work.
    const waterfall = renderWaterfall(
      points,
      width,
      height,
      pad,
      chartW,
      chartH,
      showLegend,
      legendPosition,
      showAxisLabels,
      showDataLabels,
      waterfallTotal,
    );
    if (waterfall) return waterfall;
    // No numeric value -> fall through to bar.
  }

  if (kind === "box-and-whisker") {
    // Box-and-whisker uses the MULTI-series view: each value column (series[i])
    // becomes one box so a wider range plots multiple boxes side-by-side. When
    // there is only one value column `multi.seriesCount` is 1, and the box is
    // drawn from the values in that single series. Falls back to bar when no
    // plottable series exist.
    const box = renderBoxWhisker(
      multi,
      width,
      height,
      pad,
      chartW,
      chartH,
      showLegend,
      legendPosition,
    );
    if (box) return box;
    // No plottable series -> fall through to bar.
  }

  if (kind === "pareto") {
    // Pareto sorts categories by value descending + draws a cumulative % line;
    // driven from `points` (label + value) so a 1-column or 2-column range works.
    const pareto = renderPareto(
      points,
      width,
      height,
      pad,
      chartW,
      chartH,
      showLegend,
      legendPosition,
      showAxisLabels,
      showDataLabels,
    );
    if (pareto) return pareto;
    // No numeric value -> fall through to bar.
  }

  if (kind === "treemap") {
    // Treemap uses flat single-level data from `points`; the last numeric column
    // is the size. Falls back to bar when no positive values exist.
    const treemap = renderTreemap(
      points,
      width,
      height,
      pad,
      chartW,
      chartH,
      showLegend,
      legendPosition,
      showDataLabels,
    );
    if (treemap) return treemap;
    // No positive values -> fall through to bar.
  }

  if (kind === "sunburst") {
    // Sunburst draws radial ring segments from flat `points` (degrades to a
    // doughnut with single-level data). Falls back to bar when no positive values.
    const sunburst = renderSunburst(
      points,
      width,
      height,
      showLegend,
      legendPosition,
    );
    if (sunburst) return sunburst;
    // No positive values -> fall through to bar.
  }

  if (kind === "stock") {
    // Stock uses the MULTI-series view for OHLC data: series[0..3] = O/H/L/C
    // (or series[0..2] = H/L/C in HLC mode). Falls back to bar when < 3 series.
    const stock = renderStock(
      multi,
      width,
      height,
      pad,
      chartW,
      chartH,
      showLegend,
      legendPosition,
      showAxisLabels,
    );
    if (stock) return stock;
    // Fewer than 3 numeric series -> fall through to bar.
  }

  if (kind === "radar") {
    const radar = renderRadar(
      multi,
      width,
      height,
      showLegend,
      legendPosition,
    );
    if (radar) return radar;
    // No plottable series -> fall through to bar.
  }

  if (kind === "stacked") {
    const stacked = renderStacked(
      multi,
      width,
      height,
      pad,
      chartW,
      chartH,
      showLegend,
      legendPosition,
      showAxisLabels,
      seriesLines,
      valueAxisNumberFormat,
    );
    if (stacked) return stacked;
    // Single series -> fall through to the bar branch (a stacked chart of one
    // series IS a bar chart), so it degrades to a plain bar rather than empty.
  }

  if (kind === "combo") {
    const combo = renderCombo(
      multi,
      width,
      height,
      pad,
      chartW,
      chartH,
      showLegend,
      legendPosition,
      showAxisLabels,
    );
    if (combo) return combo;
    // Single series -> fall through to bar (combo needs a second series for the
    // line overlay; with one series it degrades to a plain bar).
  }

  if (kind === "bar") {
    const bar = renderClusteredClassic(
      multi,
      "bar",
      width,
      height,
      pad,
      chartW,
      chartH,
      showLegend,
      legendPosition,
      showAxisLabels,
      showDataLabels,
      valueAxisNumberFormat,
    );
    if (bar) return bar;
  }

  // Keep the feature-rich historical single-series column branch below (trend
  // line, error bars and secondary-axis overlays). Wider ranges use the same
  // clustered-series geometry as native Column charts.
  if (
    kind === "column" &&
    (multi.seriesCount > 1 || seriesGradientStyles !== undefined) &&
    !(secondaryAxisSeries && secondaryAxisSeries.length > 0)
  ) {
    const column = renderClusteredClassic(
      multi,
      "column",
      width,
      height,
      pad,
      chartW,
      chartH,
      showLegend,
      legendPosition,
      showAxisLabels,
      showDataLabels,
      valueAxisNumberFormat,
      seriesGradientStyles,
      gradientIdPrefix,
    );
    if (column) return column;
  }

  if (kind === "doughnut") {
    // A pie with a hollow center: same angular geometry as the pie branch, but
    // each slice is a ring SEGMENT (outer arc out, inner arc back) and a single
    // center circle stamps the hole. Single category at 100% draws a full ring.
    const total = points.reduce((sum, p) => sum + Math.max(0, p.value), 0);
    const cx = pad + chartW / 2;
    const cy = height / 2;
    const radius = Math.min(chartW, chartH) / 2;
    const inner = radius * DOUGHNUT_INNER_RATIO;
    let angle = -Math.PI / 2;
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        data-testid="mini-chart"
        data-chart-kind="doughnut"
      >
        {total <= 0
          ? null
          : points.map((point, index) => {
              const slice = (Math.max(0, point.value) / total) * Math.PI * 2;
              const start = angle;
              const end = angle + slice;
              angle = end;
              const fill = chartSliceFill(index);
              // A single category at 100% of the total is a full ring: draw an
              // outer circle with the hole punched (two opposed half-arcs) so it
              // is not an invisible zero-area arc.
              if (slice >= Math.PI * 2 - 1e-6) {
                return (
                  <path
                    key={index}
                    d={
                      `M ${cx + radius} ${cy} ` +
                      `A ${radius} ${radius} 0 1 1 ${cx - radius} ${cy} ` +
                      `A ${radius} ${radius} 0 1 1 ${cx + radius} ${cy} Z ` +
                      `M ${cx + inner} ${cy} ` +
                      `A ${inner} ${inner} 0 1 0 ${cx - inner} ${cy} ` +
                      `A ${inner} ${inner} 0 1 0 ${cx + inner} ${cy} Z`
                    }
                    fill={fill}
                    stroke={chartSliceOutline(index)}
                    strokeWidth={1}
                    fillRule="evenodd"
                    data-chart-slice={point.label}
                  />
                );
              }
              const large = slice > Math.PI ? 1 : 0;
              const ox1 = cx + radius * Math.cos(start);
              const oy1 = cy + radius * Math.sin(start);
              const ox2 = cx + radius * Math.cos(end);
              const oy2 = cy + radius * Math.sin(end);
              const ix2 = cx + inner * Math.cos(end);
              const iy2 = cy + inner * Math.sin(end);
              const ix1 = cx + inner * Math.cos(start);
              const iy1 = cy + inner * Math.sin(start);
              return (
                <path
                  key={index}
                  d={
                    `M ${ox1} ${oy1} ` +
                    `A ${radius} ${radius} 0 ${large} 1 ${ox2} ${oy2} ` +
                    `L ${ix2} ${iy2} ` +
                    `A ${inner} ${inner} 0 ${large} 0 ${ix1} ${iy1} Z`
                  }
                  fill={fill}
                  stroke={chartSliceOutline(index)}
                  strokeWidth={1}
                  data-chart-slice={point.label}
                />
              );
            })}
        <circle
          cx={cx}
          cy={cy}
          r={inner}
          fill="none"
          data-chart-doughnut-hole="true"
        />
        {showLegend ? renderLegend(points, width, height, legendPosition) : null}
      </svg>
    );
  }

  if (kind === "pie") {
    const total = points.reduce((sum, p) => sum + Math.max(0, p.value), 0);
    const cx = pad + chartW / 2;
    const cy = height / 2;
    const radius = Math.min(chartW, chartH) / 2;
    let angle = -Math.PI / 2;
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        data-testid="mini-chart"
        data-chart-kind="pie"
      >
        {total <= 0
          ? null
          : points.map((point, index) => {
              const slice = (Math.max(0, point.value) / total) * Math.PI * 2;
              const start = angle;
              const end = angle + slice;
              angle = end;
              // A slice covering (effectively) the whole circle — one category at
              // 100% of the non-zero total — has coincident start/end points, so
              // the arc path collapses to zero area and renders invisible. Draw a
              // full circle instead.
              if (slice >= Math.PI * 2 - 1e-6) {
                return (
                  <circle
                    key={index}
                    cx={cx}
                    cy={cy}
                    r={radius}
                    fill={chartSliceFill(index)}
                    stroke={chartSliceOutline(index)}
                    strokeWidth={1}
                    data-chart-slice={point.label}
                  />
                );
              }
              const x1 = cx + radius * Math.cos(start);
              const y1 = cy + radius * Math.sin(start);
              const x2 = cx + radius * Math.cos(end);
              const y2 = cy + radius * Math.sin(end);
              const large = slice > Math.PI ? 1 : 0;
              return (
                <path
                  key={index}
                  d={`M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`}
                  fill={chartSliceFill(index)}
                  stroke={chartSliceOutline(index)}
                  strokeWidth={1}
                  data-chart-slice={point.label}
                />
              );
            })}
        {showLegend ? renderLegend(points, width, height, legendPosition) : null}
      </svg>
    );
  }

  const maxValue = Math.max(1, ...points.map((p) => Math.abs(p.value)));

  if (kind === "line") {
    // Map over the full [min, max] data span (not the abs-scaled maxValue the bar
    // branch uses) so NEGATIVE points stay on-canvas — a bare `value / absMax`
    // sends a negative y below the viewport where SVG clips it, silently dropping
    // the point and the line segment to it. min -> baseline, max -> top; a flat
    // series sits mid-height. Mirrors lib/spreadsheet/sparkline.ts line mode.
    const secondaryIndices = new Set(
      (secondaryAxisSeries ?? []).filter(
        (index) =>
          Number.isInteger(index) && index >= 0 && index < multi.seriesCount,
      ),
    );
    const primaryCandidates = multi.series
      .map((values, index) => ({ index, values }))
      .filter((series) => !secondaryIndices.has(series.index));
    // Keep the historical first-series path as the collapse-safe fallback when
    // a malformed secondary-axis declaration assigns every series away.
    const primarySeries =
      primaryCandidates.length > 0
        ? primaryCandidates
        : [{ index: 0, values: points.map((point) => point.value) }];
    const primaryValues = primarySeries.flatMap((series) => series.values);
    const lineValues = primarySeries[0].values;
    const lineMin = Math.min(...primaryValues);
    const lineMax = Math.max(...primaryValues);
    const lineSpan = lineMax - lineMin;
    const yOf = (value: number) =>
      pad +
      chartH -
      (lineSpan === 0 ? 0.5 : (value - lineMin) / lineSpan) * chartH;
    const step = points.length > 1 ? chartW / (points.length - 1) : 0;
    // x for point i. Byte-identical to the pre-feature line branch
    // (`pad + index * step`, with step=0 for a single point -> pad). The
    // trendline never draws on <2 points (computeTrendline returns []), so no
    // special single-point handling is needed here.
    const xOf = (index: number) => pad + index * step;
    // Trendline over (index, value) in data space, mapped through the SAME x/y
    // scale the line points use.
    const trendPoints = trendline
      ? computeCategoryTrendline(
          points.map((point) => point.value),
          trendline,
        )
      : [];
    // Error-bar half-length per point, mapped to PIXELS through the line's own
    // value scale (|yOf(v) - yOf(v +/- delta)|): a flat series (span 0) has no
    // scale so the whisker collapses to 0px and is skipped.
    const lineErrorDelta = makeErrorBarDelta(errorBars, lineValues);
    const lineErrorCenter = makeErrorBarCenter(errorBars, lineValues);
    // Secondary right-hand axis: overlay the listed value series against their own
    // scale + draw the right spine. Off (null) when unset -> primary render is
    // byte-identical.
    const lineSecondary = resolveSecondaryAxis(
      multi,
      secondaryAxisSeries,
      pad,
      pad + chartH,
    );
    const upDownBarWidth = Math.max(
      4,
      Math.min(14, step > 0 ? step * 0.32 : 8),
    );
    const lineUpDownBars =
      upDownBars &&
      multi.seriesCount >= 2 &&
      secondaryIndices.size === 0
        ? multi.series[0].map((firstValue, index) => {
            const lastValue = multi.series[multi.series.length - 1]?.[index];
            if (
              !Number.isFinite(firstValue) ||
              typeof lastValue !== "number" ||
              !Number.isFinite(lastValue)
            ) {
              return null;
            }
            const firstY = yOf(firstValue);
            const lastY = yOf(lastValue);
            const rising = lastValue >= firstValue;
            return (
              <rect
                key={index}
                x={xOf(index) - upDownBarWidth / 2}
                y={Math.min(firstY, lastY)}
                width={upDownBarWidth}
                height={Math.max(1, Math.abs(lastY - firstY))}
                fill={
                  rising
                    ? "var(--mrai-chart-up-bar, #dcfce7)"
                    : "var(--mrai-chart-down-bar, #fee2e2)"
                }
                stroke={
                  rising
                    ? "var(--mrai-chart-up-bar-outline, #16a34a)"
                    : "var(--mrai-chart-down-bar-outline, #dc2626)"
                }
                strokeWidth={1}
                data-chart-up-down-bar={rising ? "up" : "down"}
                data-chart-category={points[index]?.label ?? index}
              />
            );
          })
        : null;
    const lineDropLines = dropLines
      ? primarySeries.flatMap((series) =>
          series.values.map((value, index) => (
            <line
              key={`${series.index}:${index}`}
              x1={xOf(index)}
              y1={yOf(value)}
              x2={xOf(index)}
              y2={pad + chartH}
              stroke="var(--mrai-chart-drop-line, #94a3b8)"
              strokeWidth={1}
              data-chart-drop-line={`${series.index}:${index}`}
            />
          )),
        )
      : null;
    const lineHighLowLines =
      highLowLines && primarySeries.length >= 2
        ? points.map((point, index) => {
            const values = primarySeries.map((series) => series.values[index]);
            const low = Math.min(...values);
            const high = Math.max(...values);
            return (
              <line
                key={index}
                x1={xOf(index)}
                y1={yOf(high)}
                x2={xOf(index)}
                y2={yOf(low)}
                stroke="var(--mrai-chart-high-low-line, #64748b)"
                strokeWidth={1.25}
                data-chart-high-low-line={point.label || index}
              />
            );
          })
        : null;
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        data-testid="mini-chart"
        data-chart-kind="line"
      >
        {lineDropLines}
        {lineHighLowLines}
        {lineUpDownBars}
        {primarySeries.map((series) => {
          const style = lineStyleByIndex.get(series.index);
          const stroke = OUTLINE_PALETTE[series.index % OUTLINE_PALETTE.length];
          const fill = PALETTE[series.index % PALETTE.length];
          const symbol = style?.markerSymbol ?? "circle";
          const markerSize = style?.markerSize ?? 5;
          const lineWidth =
            spreadsheetLineWidthPtToCssPx(style?.lineWidthPt) ?? 2;
          return (
          <g key={series.index} data-chart-primary-line={series.index}>
              {style?.smooth === true ? (
                <path
                  d={smoothLinePath(series.values, xOf, yOf)}
                  data-chart-smooth-line={series.index}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={lineWidth}
                />
              ) : (
            <polyline
              points={series.values
                .map((value, index) => `${xOf(index)},${yOf(value)}`)
                .join(" ")}
                  data-chart-straight-line={series.index}
              fill="none"
                  stroke={stroke}
              strokeWidth={lineWidth}
            />
              )}
              {series.values.map((value, index) =>
                lineMarker(
                  symbol,
                  markerSize,
                  xOf(index),
                  yOf(value),
                  fill,
                  stroke,
                  series.index === 0
                    ? (points[index]?.label ?? String(index))
                    : `${points[index]?.label ?? index}:${series.index}`,
                  `${series.index}:${points[index]?.label ?? index}`,
                ),
              )}
          </g>
          );
        })}
        {errorBars
          ? renderErrorBars(
              points.map((point, index) => ({
                cx: xOf(index),
                cy: yOf(lineErrorCenter(point.value)),
                dyPx: Math.abs(
                  yOf(lineErrorCenter(point.value)) -
                    yOf(lineErrorCenter(point.value) + lineErrorDelta(point.value)),
                ),
              })),
            )
          : null}
        {lineSecondary
          ? renderSecondarySeries(
              lineSecondary.series,
              xOf,
              lineSecondary.scale,
            )
          : null}
        {lineSecondary
          ? renderSecondaryAxis(
              lineSecondary.min,
              lineSecondary.max,
              pad + chartW,
              pad,
              pad + chartH,
            )
          : null}
        {renderTrendline(
          trendPoints,
          (p) => ({ x: xOf(p.x), y: yOf(p.y) }),
          // A category axis is fitted on the ordinal from 1, as Office does.
          spreadsheetTrendlineLabel(
            points.map((point, index) => ({ x: index + 1, y: point.value })),
            trendline,
          ),
        )}
        {showDataLabels
          ? renderDataLabels(
              points.map((point, index) => ({
                x: xOf(index),
                y: yOf(point.value) - 6,
                value: point.value,
              })),
            )
          : null}
        {showAxisLabels
          ? renderAxisLabels(points, pad, chartW, pad + chartH)
          : null}
        {showAxisLabels
          ? renderPrimaryValueAxis(
              lineMin,
              lineMax,
              pad,
              pad + chartH,
              valueAxisNumberFormat,
            )
          : null}
        {/* Excel parity: a LINE legend lists the series name (header cell),
            not one chip per category — category legends belong to pie. */}
        {showLegend
          ? renderLegend(
              seriesLegendPoints(multi.seriesCount, multi.names),
              width,
              height, legendPosition,
            )
          : null}
      </svg>
    );
  }

  // Single-series clustered column (the historical vertical-bar renderer).
  const barGap = 6;
  const slot = chartW / points.length;
  const barWidth = Math.max(1, slot - barGap);
  // Center of each bar (used by both the trendline and the data labels so they
  // sit over the bar rather than its left edge).
  const barCenterX = (index: number) => pad + index * slot + barWidth / 2;
  // The overlay (trendline / labels) maps the TRUE signed value over the full
  // [min, max] span (collapse-safe), independent of the abs-scaled bar heights,
  // so a negative value stays on-canvas and the trend reflects real values.
  const barValues = points.map((p) => p.value);
  const barOverlayScale = makeScale(
    Math.min(...barValues),
    Math.max(...barValues),
    pad + chartH,
    pad,
  );
  const trendPoints = trendline
    ? computeCategoryTrendline(
        points.map((point) => point.value),
        trendline,
      )
    : [];
  // Error-bar half-length per bar, mapped to PIXELS through the bars' own
  // abs-height scale (delta / maxValue * chartH), anchored at each bar's TOP so
  // the whisker straddles the value. Off (constant 0) when unset -> no DOM.
  const barErrorDelta = makeErrorBarDelta(errorBars, barValues);
  const barErrorCenter = makeErrorBarCenter(errorBars, barValues);
  // Secondary right-hand axis overlay (off / null when unset -> primary
  // render byte-identical).
  const barSecondary = resolveSecondaryAxis(
    multi,
    secondaryAxisSeries,
    pad,
    pad + chartH,
  );
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      data-testid="mini-chart"
      data-chart-kind="column"
    >
      {points.map((point, index) => {
        const barHeight = (Math.abs(point.value) / maxValue) * chartH;
        const x = pad + index * slot;
        const y = pad + chartH - barHeight;
        return (
          <rect
            key={index}
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            fill={PALETTE[index % PALETTE.length]}
            stroke={OUTLINE_PALETTE[0]}
            strokeWidth={1}
            data-chart-bar={point.label}
          />
        );
      })}
      {errorBars
        ? renderErrorBars(
            points.map((point, index) => ({
              cx: barCenterX(index),
              // Anchor at the bar TOP (abs height from the baseline).
              cy:
                pad +
                chartH -
                (Math.abs(barErrorCenter(point.value)) / maxValue) * chartH,
              dyPx: (barErrorDelta(point.value) / maxValue) * chartH,
            })),
          )
        : null}
      {barSecondary
        ? renderSecondarySeries(
            barSecondary.series,
            barCenterX,
            barSecondary.scale,
          )
        : null}
      {barSecondary
        ? renderSecondaryAxis(
            barSecondary.min,
            barSecondary.max,
            pad + chartW,
            pad,
            pad + chartH,
          )
        : null}
      {renderTrendline(
        trendPoints,
        (p) => ({ x: barCenterX(p.x), y: barOverlayScale(p.y) }),
        spreadsheetTrendlineLabel(
          points.map((point, index) => ({ x: index + 1, y: point.value })),
          trendline,
        ),
      )}
      {showDataLabels
        ? renderDataLabels(
            points.map((point, index) => ({
              x: barCenterX(index),
              // Anchor just above the bar TOP (abs height from the baseline).
              y:
                pad +
                chartH -
                (Math.abs(point.value) / maxValue) * chartH -
                4,
              value: point.value,
            })),
          )
        : null}
      {showAxisLabels
        ? renderAxisLabels(points, pad, chartW, pad + chartH)
        : null}
      {showAxisLabels
        ? renderPrimaryValueAxis(
            Math.min(0, ...barValues),
            Math.max(0, ...barValues),
            pad,
            pad + chartH,
            valueAxisNumberFormat,
          )
        : null}
      {/* Excel parity: a BAR legend lists the series name (header cell), not
          one chip per category — category legends belong to pie. */}
      {showLegend ? renderLegend(seriesLegendPoints(1, multi.names), width, height, legendPosition) : null}
    </svg>
  );
}
