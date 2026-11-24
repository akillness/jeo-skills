/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { CSSProperties, ReactElement, ReactNode } from "react";

import type {
  ChartDataLabelPosition,
  ChartMapLabelLayout,
  ChartTrendline,
} from "../console/editor/extensions/chartBlockShared";

import styles from "./OfficeChartElementIcon.module.css";

/**
 * The glyphs of Chart Design ▸ Add Chart Element, the one menu Docs, the
 * spreadsheet and the deck share (OfficeChartElementMenuItems). Each is drawn
 * the way Word, Excel and PowerPoint draw that row: a small chart in the
 * menu's own ink with the element the row adds in Office blue, and a red cross
 * on "None". One drawing per row for the three editors, on the 20px grid of
 * OfficeBorderPresetIcon so 1px lines land on whole pixels at 20px.
 */
export const OFFICE_CHART_ELEMENT_ICON_IDS = [
  "axes",
  "axes.primaryHorizontal",
  "axes.primaryVertical",
  "axisTitles",
  "axisTitles.primaryHorizontal",
  "axisTitles.primaryVertical",
  "chartTitle",
  "chartTitle.none",
  "chartTitle.aboveChart",
  "chartTitle.centeredOverlay",
  "dataLabels",
  "dataLabels.none",
  "dataLabels.automatic",
  "dataLabels.center",
  "dataLabels.insideEnd",
  "dataLabels.insideBase",
  "dataLabels.outsideEnd",
  "dataLabels.bestFit",
  "dataLabels.left",
  "dataLabels.right",
  "dataLabels.top",
  "dataLabels.bottom",
  "dataLabels.bestFitOnly",
  "dataLabels.showAll",
  "dataLabels.callout",
  "dataTable",
  "dataTable.none",
  "dataTable.withLegendKeys",
  "dataTable.noLegendKeys",
  "errorBars",
  "errorBars.none",
  "errorBars.standardError",
  "errorBars.percentage",
  "errorBars.standardDeviation",
  "gridlines",
  "gridlines.primaryMajorHorizontal",
  "gridlines.primaryMajorVertical",
  "gridlines.primaryMinorHorizontal",
  "gridlines.primaryMinorVertical",
  "legend",
  "legend.none",
  "legend.right",
  "legend.top",
  "legend.left",
  "legend.bottom",
  "lines",
  "lines.none",
  "lines.drop",
  "lines.highLow",
  "lines.series",
  "trendline",
  "trendline.none",
  "trendline.linear",
  "trendline.exponential",
  "trendline.logarithmic",
  "trendline.polynomial",
  "trendline.power",
  "trendline.movingAverage",
  "trendline.linearForecast",
  "upDownBars",
  "upDownBars.none",
  "upDownBars.shown",
] as const;

export type OfficeChartElementIconId =
  (typeof OFFICE_CHART_ELEMENT_ICON_IDS)[number];

/** A data-label position (or a filled map's label layout) → its row's glyph. */
export const OFFICE_CHART_DATA_LABEL_ICON_IDS: Record<
  ChartDataLabelPosition | ChartMapLabelLayout,
  OfficeChartElementIconId
> = {
  bestFit: "dataLabels.bestFit",
  bottom: "dataLabels.bottom",
  center: "dataLabels.center",
  insideBase: "dataLabels.insideBase",
  insideEnd: "dataLabels.insideEnd",
  left: "dataLabels.left",
  outsideEnd: "dataLabels.outsideEnd",
  right: "dataLabels.right",
  top: "dataLabels.top",
  bestFitOnly: "dataLabels.bestFitOnly",
  showAll: "dataLabels.showAll",
};

/** A trendline kind → its row's glyph. */
export const OFFICE_CHART_TRENDLINE_ICON_IDS: Record<
  ChartTrendline["type"],
  OfficeChartElementIconId
> = {
  linear: "trendline.linear",
  exponential: "trendline.exponential",
  logarithmic: "trendline.logarithmic",
  polynomial: "trendline.polynomial",
  power: "trendline.power",
  movingAverage: "trendline.movingAverage",
};

/** Add Chart Element ▸ Trendline's rows (`CHART_ELEMENT_TRENDLINE_MENU`) → glyphs. */
export const OFFICE_CHART_TRENDLINE_MENU_ICON_IDS: Record<
  "linear" | "exponential" | "linearForecast" | "movingAverage",
  OfficeChartElementIconId
> = {
  linear: "trendline.linear",
  exponential: "trendline.exponential",
  linearForecast: "trendline.linearForecast",
  movingAverage: "trendline.movingAverage",
};

// ---------------------------------------------------------------------------
// Drawing primitives. Coordinates are whole pixels on the 20px grid (fills) or
// half pixels (1px strokes); the chart frame is the 17px square at 1.5.

type Rect = readonly [x: number, y: number, w: number, h: number];

const FRAME = (
  <rect className={styles.frame} x={1.5} y={1.5} width={17} height={17} rx={1.5} />
);

function rects(className: string, list: readonly Rect[]): ReactNode {
  return list.map(([x, y, w, h], i) => (
    <rect key={`${className}-${i}`} className={className} x={x} y={y} width={w} height={h} />
  ));
}

/** Three columns of width `w` standing on `bottom`, heights as fractions of
 * the plot's height, their tops returned for the labels drawn on them. */
function columnTops(
  xs: readonly number[],
  top: number,
  bottom: number,
  shares: readonly number[] = [0.55, 1, 0.75],
): number[] {
  return xs.map((_, i) => bottom - Math.round(shares[i] * (bottom - top)));
}

function columns(
  xs: readonly number[],
  top: number,
  bottom: number,
  { w = 2, className = styles.plot }: { w?: number; className?: string } = {},
): ReactNode {
  const tops = columnTops(xs, top, bottom);
  return rects(
    className,
    xs.map((x, i) => [x, tops[i], w, bottom - tops[i]] as const),
  );
}

/** The value axis line the columns stand on. */
function baseline(x: number, y: number, w: number): ReactNode {
  return <rect className={styles.axis} x={x} y={y} width={w} height={1} />;
}

/** Office's red cross on a "None" row, in the frame's top-right corner. */
const NONE_MARK = (
  <path
    className={styles.none}
    d="M14.25 2.25 17.25 5.25M17.25 2.25 14.25 5.25"
    strokeWidth={1.5}
    strokeLinecap="round"
  />
);

function polyline(
  points: readonly (readonly [number, number])[],
  className: string = styles.series,
  width = 1,
): ReactNode {
  return (
    <path
      className={className}
      d={`M${points.map(([x, y]) => `${x} ${y}`).join("L")}`}
      strokeWidth={width}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  );
}

// ---------------------------------------------------------------------------
// The glyphs, element by element.

const COLS = [4, 9, 14] as const;

function axesGlyph(horizontal: boolean, vertical: boolean): ReactNode {
  const hClass = horizontal ? styles.accent : styles.axis;
  const vClass = vertical ? styles.accent : styles.axis;
  return (
    <>
      {columns([6, 10, 14], 4, 14)}
      <rect className={vClass} x={4} y={3} width={1} height={12} />
      <rect className={hClass} x={4} y={14} width={13} height={1} />
      {horizontal ? rects(styles.accent, [4, 8, 12, 16].map((x) => [x, 15, 1, 2] as const)) : null}
      {vertical ? rects(styles.accent, [3, 7, 11].map((y) => [2, y, 2, 1] as const)) : null}
    </>
  );
}

function axisTitlesGlyph(horizontal: boolean, vertical: boolean): ReactNode {
  if (horizontal && vertical) {
    return (
      <>
        {columns([7, 11, 15], 4, 13)}
        {baseline(6, 13, 11)}
        <rect className={styles.accent} x={3} y={4} width={2} height={8} />
        <rect className={styles.accent} x={9} y={15} width={6} height={2} />
      </>
    );
  }
  if (horizontal) {
    return (
      <>
        {columns(COLS, 4, 13)}
        {baseline(3, 13, 14)}
        <rect className={styles.accent} x={7} y={15} width={6} height={2} />
      </>
    );
  }
  return (
    <>
      {columns([7, 11, 15], 4, 15)}
      {baseline(6, 15, 11)}
      <rect className={styles.accent} x={3} y={5} width={2} height={8} />
    </>
  );
}

function chartTitleGlyph(kind: "above" | "overlay"): ReactNode {
  if (kind === "overlay") {
    return (
      <>
        {columns(COLS, 4, 15)}
        {baseline(3, 15, 14)}
        <rect className={styles.accent} x={6} y={6} width={8} height={2} />
      </>
    );
  }
  return (
    <>
      <rect className={styles.accent} x={6} y={3} width={8} height={2} />
      {columns(COLS, 7, 15)}
      {baseline(3, 15, 14)}
    </>
  );
}

type LabelSpot = "outsideEnd" | "insideEnd" | "center" | "insideBase";

/** Columns with a 4×2 label on each, placed as Office's row says. */
function columnLabelsGlyph(spots: readonly LabelSpot[]): ReactNode {
  const outside = spots.includes("outsideEnd");
  const top = outside ? 7 : 4;
  const bottom = 16;
  const tops = columnTops(COLS, top, bottom);
  const labels = COLS.map((x, i) => {
    const barTop = tops[i];
    const height = bottom - barTop;
    const y =
      spots[i] === "outsideEnd"
        ? barTop - 3
        : spots[i] === "insideEnd"
          ? barTop + 1
          : spots[i] === "center"
            ? barTop + Math.floor(height / 2) - 1
            : bottom - 3;
    return [x - 1, y, 4, 2] as const;
  });
  return (
    <>
      {columns(COLS, top, bottom)}
      {baseline(3, bottom, 14)}
      {rects(styles.accent, labels)}
    </>
  );
}

function calloutGlyph(): ReactNode {
  return (
    <>
      {columns(COLS, 9, 16)}
      {baseline(3, 16, 14)}
      <rect className={styles.accent} x={6} y={3} width={8} height={3} rx={0.75} />
      <path className={styles.accent} d="M9 5.5 10 8 11 5.5Z" />
    </>
  );
}

function pieLabelsGlyph(): ReactNode {
  return (
    <>
      <path className={styles.plot} d="M10 11 10 5.5A5.5 5.5 0 0 1 12.75 15.76Z" />
      <path
        className={styles.plotSoft}
        d="M10 11 12.75 15.76A5.5 5.5 0 0 1 4.58 11.95Z"
      />
      <path className={styles.axis} d="M10 11 4.58 11.95A5.5 5.5 0 0 1 10 5.5Z" />
      {rects(styles.accent, [
        [11, 8, 4, 2],
        [7, 13, 4, 2],
        [3, 3, 4, 2],
      ])}
    </>
  );
}

/** A line chart's labels beside its points (Above / Below / Left / Right). */
function lineLabelsGlyph(side: "top" | "bottom" | "left" | "right"): ReactNode {
  const points: Record<typeof side, readonly (readonly [number, number])[]> = {
    top: [
      [5, 13],
      [10, 9],
      [15, 12],
    ],
    bottom: [
      [5, 9],
      [10, 5],
      [15, 8],
    ],
    left: [
      [8, 13],
      [12, 8],
      [16, 11],
    ],
    right: [
      [4, 13],
      [8, 8],
      [12, 11],
    ],
  };
  const pts = points[side];
  const labels = pts.map(([x, y]) =>
    side === "top"
      ? ([x - 2, y - 4, 4, 2] as const)
      : side === "bottom"
        ? ([x - 2, y + 2, 4, 2] as const)
        : side === "left"
          ? ([x - 5, y - 1, 4, 2] as const)
          : ([x + 1, y - 1, 4, 2] as const),
  );
  return (
    <>
      {baseline(3, 16, 14)}
      {polyline(pts)}
      {pts.map(([x, y]) => (
        <circle key={`${x}-${y}`} className={styles.axis} cx={x} cy={y} r={1} />
      ))}
      {rects(styles.accent, labels)}
    </>
  );
}

/** A filled map's regions, labelled everywhere or only where a label fits. */
function mapLabelsGlyph(all: boolean): ReactNode {
  const regions: readonly Rect[] = [
    [3, 3, 7, 6],
    [11, 3, 6, 6],
    [3, 10, 6, 7],
    [10, 10, 7, 7],
  ];
  const labels: readonly Rect[] = all
    ? [
        [4, 5, 4, 2],
        [12, 5, 4, 2],
        [4, 12, 4, 2],
        [11, 12, 4, 2],
      ]
    : [
        [4, 5, 4, 2],
        [11, 12, 4, 2],
      ];
  return (
    <>
      {rects(styles.plotSoft, regions)}
      {rects(styles.accent, labels)}
    </>
  );
}

function dataTableGlyph(legendKeys: boolean, lowered = false): ReactNode {
  const top = lowered ? 6 : 3;
  if (legendKeys) {
    return (
      <>
        {columns([6, 10, 14], top, 10, { w: 3 })}
        <rect className={styles.accentBox} x={2.5} y={10.5} width={15} height={6} />
        <path
          className={styles.accentLine}
          d="M2.5 13.5H17.5M5.5 10.5V16.5M9.5 10.5V16.5M13.5 10.5V16.5"
        />
        {rects(styles.accent, [
          [3, 11, 2, 2],
          [3, 14, 2, 2],
        ])}
      </>
    );
  }
  return (
    <>
      {columns(COLS, top, 10)}
      <rect className={styles.accentBox} x={2.5} y={10.5} width={15} height={6} />
      <path className={styles.accentLine} d="M2.5 13.5H17.5M7.5 10.5V16.5M12.5 10.5V16.5" />
    </>
  );
}

/** Three points with I-shaped error bars; `amount` is the corner mark. */
function errorBarsGlyph(amount: "none" | "percent" | "sigma"): ReactNode {
  const points = [
    [5, 12.5],
    [10, 10.5],
    [15, 13.5],
  ] as const;
  return (
    <>
      {polyline(points.map(([x, y]) => [x + 0.5, y] as const))}
      {points.map(([x, y]) => (
        <g key={x} className={styles.accent}>
          <rect x={x} y={y - 3.5} width={1} height={7} />
          <rect x={x - 1} y={y - 3.5} width={3} height={1} />
          <rect x={x - 1} y={y + 2.5} width={3} height={1} />
        </g>
      ))}
      {rects(
        styles.axis,
        points.map(([x, y]) => [x - 1, y - 1.5, 3, 3] as const),
      )}
      {amount === "percent" ? (
        <g className={styles.accentLine} strokeWidth={1} strokeLinecap="round">
          {/* "5%", drawn rather than typeset so no font can change it. */}
          <path d="M14 2.5H11.5V4.5H13A1 1 0 0 1 13 6.5H11.5" strokeLinejoin="round" />
          <path d="M17.5 2.5 15 6.5" />
          <rect className={styles.accent} x={15} y={2} width={1} height={1} stroke="none" />
          <rect className={styles.accent} x={17} y={6} width={1} height={1} stroke="none" />
        </g>
      ) : null}
      {amount === "sigma" ? (
        <g className={styles.accentLine} strokeWidth={1} strokeLinecap="round">
          <circle cx={14} cy={5} r={1.75} />
          <path d="M14 3.25H17.5" />
        </g>
      ) : null}
    </>
  );
}

function gridlinesGlyph(
  direction: "horizontal" | "vertical",
  minor: boolean,
): ReactNode {
  const lines: Rect[] =
    direction === "horizontal"
      ? (minor ? [4, 6, 8, 10, 12, 14] : [4, 8, 12]).map((y) => [3, y, 14, 1] as const)
      : (minor ? [3, 5, 7, 9, 11, 13, 15] : [7, 12]).map((x) => [x, 4, 1, 12] as const);
  return (
    <>
      {rects(styles.accent, lines)}
      {columns(COLS, 4, 16)}
      {baseline(3, 16, 14)}
    </>
  );
}

function legendGlyph(position: "right" | "left" | "top" | "bottom"): ReactNode {
  switch (position) {
    case "right":
      return (
        <>
          {columns([3, 6, 9], 4, 15)}
          {baseline(3, 15, 8)}
          <rect className={styles.accentBox} x={12.5} y={6.5} width={5} height={8} />
          {rects(styles.accent, [8, 10, 12].map((y) => [14, y, 2, 1] as const))}
        </>
      );
    case "left":
      return (
        <>
          <rect className={styles.accentBox} x={2.5} y={6.5} width={5} height={8} />
          {rects(styles.accent, [8, 10, 12].map((y) => [4, y, 2, 1] as const))}
          {columns([9, 12, 15], 4, 15)}
          {baseline(9, 15, 8)}
        </>
      );
    case "top":
      return (
        <>
          <rect className={styles.accentBox} x={4.5} y={3.5} width={11} height={4} />
          {rects(styles.accent, [6, 9, 12].map((x) => [x, 5, 2, 1] as const))}
          {columns(COLS, 9, 16)}
          {baseline(3, 16, 14)}
        </>
      );
    case "bottom":
      return (
        <>
          {columns(COLS, 3, 10)}
          {baseline(3, 10, 14)}
          <rect className={styles.accentBox} x={4.5} y={12.5} width={11} height={4} />
          {rects(styles.accent, [6, 9, 12].map((x) => [x, 14, 2, 1] as const))}
        </>
      );
  }
}

type Pt = readonly [number, number];
const LINE_XS = [4.5, 8.5, 11.5, 15.5] as const;
const line = (ys: readonly number[]): Pt[] => LINE_XS.map((x, i) => [x, ys[i]] as const);

function dropLinesGlyph(): ReactNode {
  const series = line([11, 6, 9, 5]);
  return (
    <>
      {baseline(3, 16, 14)}
      {rects(
        styles.accent,
        series.map(([x, y]) => [x - 0.5, y, 1, 16 - y] as const),
      )}
      {polyline(series, styles.series, 1.25)}
    </>
  );
}

function highLowGlyph(high: readonly number[], low: readonly number[]): ReactNode {
  const a = line(high);
  const b = line(low);
  return (
    <>
      {baseline(3, 16, 14)}
      {rects(
        styles.accent,
        a.map(([x, y], i) => [x - 0.5, y, 1, b[i][1] - y] as const),
      )}
      {polyline(a, styles.series, 1.25)}
      {polyline(b, styles.series, 1.25)}
    </>
  );
}

function seriesLinesGlyph(): ReactNode {
  const lower = [4, 6, 5];
  const upper = [3, 4, 3];
  const lowerTops = lower.map((h) => 16 - h);
  const upperTops = upper.map((h, i) => lowerTops[i] - h);
  return (
    <>
      {rects(
        styles.plot,
        COLS.map((x, i) => [x, lowerTops[i], 2, lower[i]] as const),
      )}
      {rects(
        styles.plotSoft,
        COLS.map((x, i) => [x, upperTops[i], 2, upper[i]] as const),
      )}
      {baseline(3, 16, 14)}
      <path
        className={styles.accentLine}
        d={[lowerTops, upperTops]
          .map(
            (tops) =>
              `M6 ${tops[0]}L9 ${tops[1]}M11 ${tops[1]}L14 ${tops[2]}`,
          )
          .join("")}
        strokeLinecap="round"
      />
    </>
  );
}

/** Scattered points and the fitted line Office's row names. */
function trendlineGlyph(points: readonly Pt[], fit: string): ReactNode {
  return (
    <>
      {rects(
        styles.axis,
        points.map(([x, y]) => [x - 1, y - 1, 2, 2] as const),
      )}
      <path
        className={styles.accentLine}
        d={fit}
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

const TREND_POINTS: readonly Pt[] = [
  [4, 14],
  [6, 11],
  [8, 12],
  [10, 9],
  [12, 10],
  [14, 7],
  [16, 6],
];

function upDownBarsGlyph(open: readonly number[], close: readonly number[]): ReactNode {
  const xs = [3, 8, 13];
  const centers = xs.map((x) => x + 2);
  return (
    <>
      {polyline(centers.map((x, i) => [x, open[i]] as const))}
      {polyline(centers.map((x, i) => [x, close[i]] as const))}
      {xs.map((x, i) => {
        const top = Math.min(open[i], close[i]);
        const height = Math.abs(open[i] - close[i]);
        // An up bar (close above open) is light, a down bar solid.
        return close[i] < open[i] ? (
          <rect
            key={x}
            className={styles.accentBox}
            x={x + 0.5}
            y={top + 0.5}
            width={3}
            height={height - 1}
          />
        ) : (
          <rect key={x} className={styles.accent} x={x} y={top} width={4} height={height} />
        );
      })}
    </>
  );
}

const GLYPHS: Record<OfficeChartElementIconId, () => ReactNode> = {
  axes: () => axesGlyph(true, true),
  "axes.primaryHorizontal": () => axesGlyph(true, false),
  "axes.primaryVertical": () => axesGlyph(false, true),
  axisTitles: () => axisTitlesGlyph(true, true),
  "axisTitles.primaryHorizontal": () => axisTitlesGlyph(true, false),
  "axisTitles.primaryVertical": () => axisTitlesGlyph(false, true),
  chartTitle: () => chartTitleGlyph("above"),
  "chartTitle.none": () => (
    <>
      {chartTitleGlyph("above")}
      {NONE_MARK}
    </>
  ),
  "chartTitle.aboveChart": () => chartTitleGlyph("above"),
  "chartTitle.centeredOverlay": () => chartTitleGlyph("overlay"),
  dataLabels: () => columnLabelsGlyph(["outsideEnd", "outsideEnd", "outsideEnd"]),
  "dataLabels.none": () => (
    <>
      {columnLabelsGlyph(["outsideEnd", "outsideEnd", "outsideEnd"])}
      {NONE_MARK}
    </>
  ),
  // Where Office puts them itself: outside a short column, inside a tall one.
  "dataLabels.automatic": () => columnLabelsGlyph(["outsideEnd", "insideEnd", "insideEnd"]),
  "dataLabels.center": () => columnLabelsGlyph(["center", "center", "center"]),
  "dataLabels.insideEnd": () => columnLabelsGlyph(["insideEnd", "insideEnd", "insideEnd"]),
  "dataLabels.insideBase": () =>
    columnLabelsGlyph(["insideBase", "insideBase", "insideBase"]),
  "dataLabels.outsideEnd": () =>
    columnLabelsGlyph(["outsideEnd", "outsideEnd", "outsideEnd"]),
  "dataLabels.bestFit": pieLabelsGlyph,
  "dataLabels.left": () => lineLabelsGlyph("left"),
  "dataLabels.right": () => lineLabelsGlyph("right"),
  "dataLabels.top": () => lineLabelsGlyph("top"),
  "dataLabels.bottom": () => lineLabelsGlyph("bottom"),
  "dataLabels.bestFitOnly": () => mapLabelsGlyph(false),
  "dataLabels.showAll": () => mapLabelsGlyph(true),
  "dataLabels.callout": calloutGlyph,
  dataTable: () => dataTableGlyph(true),
  "dataTable.none": () => (
    <>
      {dataTableGlyph(false, true)}
      {NONE_MARK}
    </>
  ),
  "dataTable.withLegendKeys": () => dataTableGlyph(true),
  "dataTable.noLegendKeys": () => dataTableGlyph(false),
  errorBars: () => errorBarsGlyph("none"),
  "errorBars.none": () => (
    <>
      {errorBarsGlyph("none")}
      {NONE_MARK}
    </>
  ),
  "errorBars.standardError": () => errorBarsGlyph("none"),
  "errorBars.percentage": () => errorBarsGlyph("percent"),
  "errorBars.standardDeviation": () => errorBarsGlyph("sigma"),
  gridlines: () => gridlinesGlyph("horizontal", false),
  "gridlines.primaryMajorHorizontal": () => gridlinesGlyph("horizontal", false),
  "gridlines.primaryMajorVertical": () => gridlinesGlyph("vertical", false),
  "gridlines.primaryMinorHorizontal": () => gridlinesGlyph("horizontal", true),
  "gridlines.primaryMinorVertical": () => gridlinesGlyph("vertical", true),
  legend: () => legendGlyph("right"),
  "legend.none": () => (
    <>
      {legendGlyph("right")}
      {NONE_MARK}
    </>
  ),
  "legend.right": () => legendGlyph("right"),
  "legend.top": () => legendGlyph("top"),
  "legend.left": () => legendGlyph("left"),
  "legend.bottom": () => legendGlyph("bottom"),
  lines: dropLinesGlyph,
  "lines.none": () => (
    <>
      {highLowGlyph([10, 7, 9, 8], [15, 12, 14, 13])}
      {NONE_MARK}
    </>
  ),
  "lines.drop": dropLinesGlyph,
  "lines.highLow": () => highLowGlyph([9, 5, 7, 4], [14, 11, 13, 10]),
  "lines.series": seriesLinesGlyph,
  trendline: () => trendlineGlyph(TREND_POINTS, "M3 15 17 5"),
  "trendline.none": () => (
    <>
      {trendlineGlyph(
        TREND_POINTS.map(([x, y]) => [x, y + 2] as const),
        "M3 17 15.5 8",
      )}
      {NONE_MARK}
    </>
  ),
  "trendline.linear": () => trendlineGlyph(TREND_POINTS, "M3 15 17 5"),
  "trendline.exponential": () =>
    trendlineGlyph(
      [
        [4, 15],
        [7, 16],
        [9, 14],
        [12, 14],
        [14, 10],
        [16, 6],
      ],
      "M3 16C11 16 14 13 17 3",
    ),
  "trendline.logarithmic": () =>
    trendlineGlyph(
      [
        [4, 13],
        [6, 10],
        [8, 7],
        [11, 7],
        [13, 5],
        [16, 6],
      ],
      "M3 15C5 8 9 6 17 5",
    ),
  "trendline.polynomial": () =>
    trendlineGlyph(
      [
        [4, 9],
        [6, 13],
        [8, 14],
        [10, 16],
        [12, 14],
        [14, 12],
        [16, 8],
      ],
      "M3 6C7 19 13 19 17 6",
    ),
  "trendline.power": () =>
    trendlineGlyph(
      [
        [4, 15],
        [7, 13],
        [9, 14],
        [11, 11],
        [13, 10],
        [15, 9],
        [16, 7],
      ],
      "M3 16Q11 13 17 6",
    ),
  "trendline.movingAverage": () =>
    trendlineGlyph(
      [
        [4, 13],
        [6, 10],
        [8, 14],
        [10, 9],
        [12, 12],
        [14, 7],
        [16, 10],
      ],
      "M3 13 6 11.5 8 12.5 10 10 12 10.5 14 8 17 8.5",
    ),
  // The linear fit over the points, carried on past the last one dashed:
  // the periods forecast forward.
  "trendline.linearForecast": () => (
    <>
      {trendlineGlyph(
        TREND_POINTS.map(([x, y]) => [x - 1, y + 1] as const),
        "M2 16 12 9",
      )}
      <path
        className={styles.accentLine}
        d="M13.5 8 18 4.75"
        strokeWidth={1.25}
        strokeDasharray="1.5 1.25"
        strokeLinecap="butt"
      />
    </>
  ),
  upDownBars: () => upDownBarsGlyph([13, 7, 11], [8, 12, 5]),
  "upDownBars.none": () => (
    <>
      {upDownBarsGlyph([14, 9, 13], [10, 14, 8])}
      {NONE_MARK}
    </>
  ),
  "upDownBars.shown": () => upDownBarsGlyph([13, 7, 11], [8, 12, 5]),
};

export function isOfficeChartElementIconId(
  value: unknown,
): value is OfficeChartElementIconId {
  return (
    typeof value === "string" &&
    (OFFICE_CHART_ELEMENT_ICON_IDS as readonly string[]).includes(value)
  );
}

/**
 * One Add Chart Element glyph, decorative (the row's label names it). The
 * size is set inline so a menu row's own `svg` sizing cannot shrink it.
 */
export function OfficeChartElementIcon({
  id,
  size = 20,
  className,
  disabled,
}: {
  id: OfficeChartElementIconId;
  size?: number;
  className?: string;
  /** Grey the glyph outside a disabled menu row (a row greys it itself). */
  disabled?: boolean;
}): ReactElement {
  const style: CSSProperties = { width: size, height: size };
  return (
    <svg
      className={[styles.root, className].filter(Boolean).join(" ")}
      style={style}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      focusable="false"
      data-office-chart-element-icon={id}
      data-office-chart-icon-disabled={disabled ? "true" : undefined}
    >
      {FRAME}
      {GLYPHS[id]()}
    </svg>
  );
}
