/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// Shared Chart V2 wire contract, validation and V1 compatibility helpers.
//
// Keep this module free of React/browser imports: document import/export,
// Markdown proposals and the editor node all consume the same normalization
// rules. V2 validation is deliberately fail-closed. Invalid values are never
// converted into a different chart family or subtype.

import { fitChartTitleRuns, normalizeChartTitleRuns, type ChartTitleRun } from "../../../../lib/office-charts/chart-title-runs";
import {
  normalizeChartElementBox,
  normalizeChartElementLayout,
  type ChartElementBox,
  type ChartElementLayout,
} from "../../../../lib/office-charts/chart-element-layout";
import {
  officeChartSampleCategory,
  officeChartSampleRegionName,
  officeChartSampleSeries,
  officeChartSampleWords,
} from "../../../../lib/office-charts/sample-words";
import {
  normalizeOfficeChartAxesOptions,
  type OfficeChartAxesOptions,
} from "../../../../lib/office-charts/axis-options";
import {
  normalizeOfficeTrendline,
  type OfficeTrendline,
} from "../../../../lib/office-charts/trendline";
import {
  normalizePresentationChartAreaStyle,
  normalizePresentationChartAxisStyles,
  normalizePresentationChartEffectPreset,
  normalizePresentationChartSliceStyles,
  normalizePresentationChartSeriesStyles,
  type PresentationChartAreaStyle,
  type PresentationChartAxisStyle,
  type PresentationChartSliceStyle,
  type PresentationChartSeriesStyle,
  normalizePresentationChartAxisTitleStyles,
  type PresentationChartAxisTitleStyle,
  isChartBarShape,
  type ChartBarShape,
} from "../../../../lib/presentation-chart-area-style";

export {
  CHART_BAR_SHAPES,
  isChartBarShape,
  type ChartBarShape,
  CHART_MARKER_SYMBOLS,
  MAX_CHART_MARKER_SIZE,
  MIN_CHART_MARKER_SIZE,
  normalizeChartSeriesMarker,
  type ChartMarkerSymbol,
  type ChartSeriesMarker,
} from "../../../../lib/presentation-chart-area-style";
import {
  CHART_COLOR_PALETTE_IDS,
  type ChartColorPaletteId,
} from "../../../../lib/office-charts/chart-color-palettes.generated";
import {
  normalizeOfficeChartText,
  type OfficeChartText,
} from "../../../../lib/office-charts/chart-text";
import {
  normalizeOfficeChartLayout,
  officeChartTakesCalibratedLayouts,
  type OfficeChartLayout,
  officeInsertedChartLayout,
} from "../../../../lib/office-charts/chart-layout";

export const CHART_BLOCK_TYPES = [
  "bar",
  "line",
  "pie",
  "barh",
  "area",
  "scatter",
  "radar",
  "combo",
  "stock",
] as const;

/** V1 family names. Retained for old documents and toolbar call sites. */
export type ChartBlockType = (typeof CHART_BLOCK_TYPES)[number];

export interface ChartBlockSeries {
  name: string;
  values: number[];
}

export const CHART_FAMILIES = [
  "column",
  "bar",
  "line",
  "area",
  "pie",
  "xy",
  "stock",
  "radar",
  "combo",
  "hierarchy",
  "statistical",
  "waterfall",
  "funnel",
  "surface",
  "map",
] as const;

export type ChartFamily = (typeof CHART_FAMILIES)[number];

/** The ribbon icon a chart family shows in its type pickers — one mapping for
 * the Docs Chart Design tab and the deck's chart ribbons, so the same family
 * never wears two glyphs. */
export type ChartFamilyIconId =
  | "chart.type.column"
  | "chart.type.line"
  | "chart.type.scatter"
  | "chart.type.pie"
  | "chart.type.bar"
  | "chart.type.statistical"
  | "chart.type.combo"
  | "chart.type.other";

export function chartFamilyIcon(family: ChartFamily): ChartFamilyIconId {
  switch (family) {
    case "column":
      return "chart.type.column";
    case "bar":
      return "chart.type.bar";
    case "line":
    case "area":
    case "radar":
      return "chart.type.line";
    case "xy":
      return "chart.type.scatter";
    case "pie":
    case "funnel":
      return "chart.type.pie";
    case "statistical":
      return "chart.type.statistical";
    case "combo":
      return "chart.type.combo";
    default:
      return "chart.type.other";
  }
}

/** Exact WPS + Word leaf catalog approved for Chart V2. */
export const CHART_SUBTYPES_BY_FAMILY = {
  column: [
    "clustered",
    "stacked",
    "percentStacked",
    "clustered3d",
    "stacked3d",
    "percentStacked3d",
    "column3d",
  ],
  bar: [
    "clustered",
    "stacked",
    "percentStacked",
    "clustered3d",
    "stacked3d",
    "percentStacked3d",
  ],
  line: [
    "standard",
    "stacked",
    "percentStacked",
    "standardMarkers",
    "stackedMarkers",
    "percentStackedMarkers",
    "line3d",
  ],
  area: [
    "standard",
    "stacked",
    "percentStacked",
    "standard3d",
    "stacked3d",
    "percentStacked3d",
  ],
  pie: ["pie2d", "pie3d", "pieOfPie", "barOfPie", "doughnut"],
  xy: [
    "markers",
    "smoothMarkers",
    "smooth",
    "straightMarkers",
    "straight",
    "bubble",
    "bubble3d",
  ],
  stock: [
    "highLowClose",
    "openHighLowClose",
    "volumeHighLowClose",
    "volumeOpenHighLowClose",
  ],
  radar: ["standard", "markers", "filled"],
  combo: ["columnLine", "columnLineSecondary", "stackedAreaColumn", "custom"],
  hierarchy: ["treemap", "sunburst"],
  statistical: ["histogram", "pareto", "boxWhisker"],
  waterfall: ["waterfall"],
  funnel: ["funnel"],
  surface: ["surface3d", "wireframe3d", "contour", "wireframeContour"],
  map: ["filledMap"],
} as const satisfies Record<ChartFamily, readonly string[]>;

type Values<T> = T[keyof T];
export type ChartSubtype = Values<typeof CHART_SUBTYPES_BY_FAMILY>[number];

export type ChartDataKind =
  | "category"
  | "xy"
  | "stock"
  | "waterfall"
  | "hierarchy"
  | "sample"
  | "matrix"
  | "map";

export interface ChartSubtypeDefinition {
  family: ChartFamily;
  subtype: ChartSubtype;
  dataKind: ChartDataKind;
  /** A projection is explicitly labelled in the canvas; it is never silent. */
  renderMode: "native" | "projection";
}

const DATA_KIND_BY_FAMILY: Record<ChartFamily, ChartDataKind> = {
  column: "category",
  bar: "category",
  line: "category",
  area: "category",
  pie: "category",
  xy: "xy",
  stock: "stock",
  radar: "category",
  combo: "category",
  hierarchy: "hierarchy",
  statistical: "sample",
  waterfall: "waterfall",
  funnel: "category",
  surface: "matrix",
  map: "map",
};

export const CHART_SUBTYPE_CATALOG: readonly ChartSubtypeDefinition[] =
  CHART_FAMILIES.flatMap((family) =>
    CHART_SUBTYPES_BY_FAMILY[family].map((subtype) => ({
      family,
      subtype,
      dataKind: DATA_KIND_BY_FAMILY[family],
      // Every leaf is drawn natively: a 3-D pie in 3-D (`lib/office-charts/
      // pie-3d`), a 3-D column, bar, line or area as its flat twin turned in
      // Excel's projection (`lib/office-charts/cartesian-3d`, 44bde547f6).
      renderMode: "native",
    })),
  ) as ChartSubtypeDefinition[];

/**
 * The 37 classic chart leaves exposed by WPS Writer 6.8.2. These have native
 * ECMA-376 chartSpace representations and are the offline DOCX write contract.
 * Word-only modern chartEx families remain typed/fail-closed until chartEx
 * import and export can round-trip without collapsing their semantics.
 */
export const WPS_CLASSIC_DOCX_SUBTYPES = {
  column: ["clustered", "stacked", "percentStacked"],
  bar: ["clustered", "stacked", "percentStacked"],
  line: [
    "standard",
    "stacked",
    "percentStacked",
    "standardMarkers",
    "stackedMarkers",
    "percentStackedMarkers",
  ],
  area: ["standard", "stacked", "percentStacked"],
  pie: ["pie2d", "pie3d", "pieOfPie", "barOfPie", "doughnut"],
  xy: [
    "markers",
    "smoothMarkers",
    "smooth",
    "straightMarkers",
    "straight",
    "bubble",
  ],
  stock: [
    "highLowClose",
    "openHighLowClose",
    "volumeHighLowClose",
    "volumeOpenHighLowClose",
  ],
  radar: ["standard", "markers", "filled"],
  combo: ["columnLine", "columnLineSecondary", "stackedAreaColumn", "custom"],
} as const satisfies Partial<Record<ChartFamily, readonly ChartSubtype[]>>;

export function isWpsClassicDocxChart(
  family: ChartFamily,
  subtype: ChartSubtype,
): boolean {
  const supported = WPS_CLASSIC_DOCX_SUBTYPES[
    family as keyof typeof WPS_CLASSIC_DOCX_SUBTYPES
  ] as readonly ChartSubtype[] | undefined;
  return supported?.includes(subtype) ?? false;
}

/**
 * All ECMA-376 classic chart leaves shared by the Chart V2 server exporter and
 * the offline browser exporter. This is the WPS 37 catalog plus the 12
 * Word-exposed classic 3D leaves. chartEx and surface leaves are intentionally
 * excluded until their dedicated offline writers can round-trip losslessly.
 */
export const CLASSIC_49_DOCX_SUBTYPES = {
  column: [
    "clustered",
    "stacked",
    "percentStacked",
    "clustered3d",
    "stacked3d",
    "percentStacked3d",
    "column3d",
  ],
  bar: [
    "clustered",
    "stacked",
    "percentStacked",
    "clustered3d",
    "stacked3d",
    "percentStacked3d",
  ],
  line: [
    "standard",
    "stacked",
    "percentStacked",
    "standardMarkers",
    "stackedMarkers",
    "percentStackedMarkers",
    "line3d",
  ],
  area: [
    "standard",
    "stacked",
    "percentStacked",
    "standard3d",
    "stacked3d",
    "percentStacked3d",
  ],
  pie: ["pie2d", "pie3d", "pieOfPie", "barOfPie", "doughnut"],
  xy: [
    "markers",
    "smoothMarkers",
    "smooth",
    "straightMarkers",
    "straight",
    "bubble",
    "bubble3d",
  ],
  stock: [
    "highLowClose",
    "openHighLowClose",
    "volumeHighLowClose",
    "volumeOpenHighLowClose",
  ],
  radar: ["standard", "markers", "filled"],
  combo: ["columnLine", "columnLineSecondary", "stackedAreaColumn", "custom"],
} as const satisfies Partial<Record<ChartFamily, readonly ChartSubtype[]>>;

export function isClassic49DocxChart(
  family: ChartFamily,
  subtype: ChartSubtype,
): boolean {
  const supported = CLASSIC_49_DOCX_SUBTYPES[
    family as keyof typeof CLASSIC_49_DOCX_SUBTYPES
  ] as readonly ChartSubtype[] | undefined;
  return supported?.includes(subtype) ?? false;
}

// How big one chart may be is ONE table for every editor, reader and writer
// (generated from the server's `office_chart_limits`): Office's 255 series,
// 4,000 points per series, 50,000 values per chart, 200-character labels.
import {
  MAX_CHART_POINTS,
  MAX_CHART_POINTS_PER_SERIES,
  MAX_CHART_SERIES,
  MAX_CHART_TEXT_CHARS,
} from "../../../../lib/office-charts/chart-limits.generated";

export { MAX_CHART_POINTS, MAX_CHART_SERIES, MAX_CHART_TEXT_CHARS };
/** Points in one series (categories, xy points, nodes, regions, bars, samples). */
export const MAX_CHART_CATEGORIES = MAX_CHART_POINTS_PER_SERIES;

/**
 * The values a chart's `data` plots, all series together: a category or stock
 * chart's series values, an xy chart's points, a sample chart's samples, a
 * waterfall's bars, a hierarchy's nodes, a map's regions, a heat map's cells.
 * The server's `office_chart_limits.chart_data_point_count`.
 */
export function chartDataPointCount(data: unknown): number {
  if (!isRecord(data)) return 0;
  const length = (value: unknown) => (Array.isArray(value) ? value.length : 0);
  const series = Array.isArray(data.series) ? data.series.filter(isRecord) : [];
  switch (data.kind) {
    case "category":
    case "stock":
    case "sample":
      return series.reduce((sum, entry) => sum + length(entry.values), 0);
    case "xy":
      return series.reduce((sum, entry) => sum + length(entry.yValues), 0);
    case "waterfall":
      return length(data.values);
    case "hierarchy":
      return length(data.points);
    case "map":
      return length(data.regions);
    case "matrix":
      return Array.isArray(data.values)
        ? data.values.reduce((sum: number, row) => sum + length(row), 0)
        : 0;
    default:
      return 0;
  }
}

// The one preset table (generated from the server's copy); re-exported under
// the names this module has always offered.
import {
  CHART_STYLE_PRESET_IDS,
  type ChartStylePresetId,
} from "../../../../lib/office-charts/chart-style-presets.generated";

export { CHART_STYLE_PRESET_IDS };
export type { ChartStylePresetId };
export type ChartAxis = "primary" | "secondary";
/** How a combination draws one series: a 2-D column, line, area or X Y
 *  scatter series on the shared axes (Excel's Custom Combination), a 2-D
 *  clustered bar on an axis group of its own (`comboBarAxisRefusal`), or a
 *  pie / doughnut ring when every series of the combination is one of those
 *  two. The twin of `document_charts.COMBO_RENDER_AS`. */
export const COMBO_RENDER_AS = ["column", "bar", "line", "area", "scatter", "pie", "doughnut"] as const;
export type ComboRenderAs = (typeof COMBO_RENDER_AS)[number];
/** The ring kinds: a combination holding one of these holds only these. */
export const COMBO_RING_RENDER_AS: ReadonlySet<string> = new Set(["pie", "doughnut"]);
export function isComboRenderAs(value: unknown): value is ComboRenderAs {
  return (COMBO_RENDER_AS as readonly string[]).includes(value as string);
}

/**
 * Why a combination's horizontal bars cannot be drawn, or null. A bar runs
 * its categories up the side, so Excel lays a combination's bars out on an
 * axis group of their own and every other series on the other group (the
 * line of XlsxWriter's chart_combined05 on the secondary axis over bars on
 * the primary one; Excel refuses a bar beside a column or a line on the same
 * axes: "Some chart types cannot be combined with other chart types"). The
 * twin of `document_charts.combo_bar_axis_refusal`.
 */
export function comboBarAxisRefusal(
  series: readonly { renderAs?: unknown; axis?: unknown }[],
): "bars" | null {
  const axisOf = (entry: { axis?: unknown }) => (entry.axis === "secondary" ? "secondary" : "primary");
  const bars = new Set(series.filter((entry) => entry.renderAs === "bar").map(axisOf));
  if (!bars.size) return null;
  if (bars.size > 1) return "bars";
  const [barAxis] = [...bars];
  const others = series.filter((entry) => entry.renderAs !== "bar");
  return others.length && others.every((entry) => axisOf(entry) !== barAxis) ? null : "bars";
}
export type StockRole = "volume" | "open" | "high" | "low" | "close";
export type WaterfallPointKind = "value" | "subtotal" | "total";
export type ChartCurve = "straight" | "smooth";
export type ChartLegendPositionV2 =
  | "none"
  | "top"
  | "right"
  | "bottom"
  | "left"
  /** Format Legend ▸ Top Right (`c:legendPos val="tr"`): down the right
   *  side from the top of the plot, which keeps the room a right legend
   *  leaves it (Excel for Mac, H24_32readwriteScatterChart8). Offered by no
   *  Legend menu, as in Office. */
  | "topRight";
/** Every `format.legend` the model states. */
export const CHART_LEGEND_POSITIONS_V2: readonly ChartLegendPositionV2[] = ["none", "top", "right", "bottom", "left", "topRight"];

/**
 * A point's value, or `null` for a BLANK point: the empty cell Office leaves
 * out of a series' cache (no `c:pt`, `c:ptCount` still counting it), drawn by
 * the chart's Show empty cells as (`format.displayBlanksAs`), never as 0. A
 * sheet holds its gaps as NaN in memory; `isChartBlankValue` reads both.
 */
export type ChartPointValue = number | null;

export interface CategoryChartSeries {
  name: string;
  values: ChartPointValue[];
  renderAs?: ComboRenderAs;
  axis?: ChartAxis;
  /**
   * A combination's X Y (scatter) series' own X values, one per point
   * (`c:xVal`): Excel plots them on the shared category axis as slot numbers
   * (X = 2 over the second category, the axis growing a slot for an X past
   * the last one; XlsxWriter's chart_combined07). Absent: each point over
   * its own category.
   */
  xValues?: number[];
  /** The points whose cell holds #N/A (a sheet range's reading), drawn as
   *  `format.displayNaAsBlank` says. Display only. */
  naPoints?: number[];
  /**
   * The part names this series nothing (no `c:tx`): its "Series n" is
   * Office's own, by its place, and Switch Row/Column gives it the category
   * "n" (the server's `CategorySeries.name_unstated`). Held only beside that
   * very name; a series renamed or moved states its own.
   */
  nameUnstated?: true;
  /**
   * The number format of this series' source values (Linked to source):
   * `c:val/c:numRef/c:numCache/c:formatCode`, or the one format every value
   * cell of its column carries. A data label or value axis with no format
   * code of its own shows it (ECMA-376 21.2.2.71/121; CDC p43 "17,422" and
   * "33.1"). Absent is General, or unstated: an edit that leaves it out keeps
   * the part's own. See {@link chartSeriesSourceNumberFormat}.
   */
  numberFormat?: string;
}

export interface CategoryChartData {
  kind: "category";
  /** The leaf (innermost) category labels, one per plotted point. */
  categories: string[];
  series: CategoryChartSeries[];
  /**
   * A multi-level category axis (Excel's "Multi-level Category Labels", a
   * PivotChart with two or more row fields): the levels ABOVE the leaf level,
   * outermost first. Each level holds one entry per category (its length is
   * `categories.length`); a group's label is written on the first category
   * of the group and every following category of the same group holds "".
   * A group at one level also ends where a group of any outer level starts.
   *
   * This is `c:multiLvlStrCache` one to one (ECMA-376 21.2.2.102/115): its
   * first `c:lvl` is `categories` (the leaf level), and `c:lvl` k >= 1 is
   * `categoryLevels[categoryLevels.length - k]`; a level's `c:pt idx="i"` is
   * written exactly where its entry i is not "" (Excel writes an outer
   * level's point only at the first category of each group). Absent on a
   * single-level chart. See {@link chartCategoryLevelGroups}.
   */
  categoryLevels?: string[][];
}

/** The most levels above the leaf a multi-level category axis may hold. */
export const MAX_CHART_CATEGORY_LEVELS = 16;

/** The longest number format code a series' source values may state (Excel's
 * own bound on a `numFmt@formatCode`). */
export const MAX_CHART_SERIES_NUMBER_FORMAT_LENGTH = 255;

/**
 * A series' source values' number format as the charts show it, or undefined:
 * General (in any of its spellings), blank, too long or carrying control
 * characters is no format of its own -- the labels then show Excel's General.
 * The server's `series_source_number_format` keeps the same codes.
 */
export function chartSeriesSourceNumberFormat(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const code = value.trim();
  if (
    !code ||
    code.length > MAX_CHART_SERIES_NUMBER_FORMAT_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(code) ||
    ["general", "g/通用格式", "通用格式"].includes(code.toLowerCase())
  ) {
    return undefined;
  }
  return code;
}

/** Format Data Series' source format, checked where a chart's data is. */
function validateSeriesNumberFormat(
  value: unknown,
  path: string,
  issues: ChartValidationIssue[],
): void {
  if (value === undefined) return;
  if (
    typeof value !== "string" ||
    value.length > MAX_CHART_SERIES_NUMBER_FORMAT_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    issue(issues, "series.number_format", path, "must be a number format code of at most 255 characters");
  }
}

export interface XYChartSeries {
  name: string;
  /** A point either of whose coordinates is blank is a blank point. */
  xValues: ChartPointValue[];
  yValues: ChartPointValue[];
  bubbleSizes?: number[];
  /** Format Data Series ▸ Plot Series On: Secondary Axis (a second scatter
   * group on its own value axes); absent is primary. */
  axis?: ChartAxis;
  /** Its Y values' source format (`c:yVal`'s cache), as
   * {@link CategoryChartSeries.numberFormat}. */
  numberFormat?: string;
}

export interface XYChartData {
  kind: "xy";
  series: XYChartSeries[];
}

export interface StockChartSeries {
  name: string;
  role: StockRole;
  values: ChartPointValue[];
  /** Its values' source format, as {@link CategoryChartSeries.numberFormat}. */
  numberFormat?: string;
}

export interface StockChartData {
  kind: "stock";
  categories: string[];
  /** The levels above the leaf categories, as `CategoryChartData` states
   * them (Excel's multi-level labels under a stock chart's axis). */
  categoryLevels?: string[][];
  series: StockChartSeries[];
}

export interface WaterfallChartData {
  kind: "waterfall";
  categories: string[];
  values: number[];
  pointKinds: WaterfallPointKind[];
}

export interface HierarchyChartPoint {
  id: string;
  parentId?: string;
  label: string;
  value: number;
}

export interface HierarchyChartData {
  kind: "hierarchy";
  points: HierarchyChartPoint[];
}

export interface SampleChartSeries {
  name: string;
  values: number[];
}

export interface SampleChartData {
  kind: "sample";
  series: SampleChartSeries[];
  /** Bins > By Category's category text, one per value of the one series
   * (a Pareto over named causes); absent, each point is its own category. */
  categories?: string[];
}

export interface MatrixChartData {
  kind: "matrix";
  xCategories: string[];
  yCategories: string[];
  values: number[][];
}

export interface MapChartRegion {
  /** Stable ISO/admin code. Labels alone are intentionally insufficient. */
  id: string;
  label: string;
  value: number;
}

export interface MapChartData {
  kind: "map";
  regions: MapChartRegion[];
}

export type ChartData =
  | CategoryChartData
  | XYChartData
  | StockChartData
  | WaterfallChartData
  | HierarchyChartData
  | SampleChartData
  | MatrixChartData
  | MapChartData;

/** One shown trendline label as the part states it (`c:trendlineLbl`). */
export interface ChartTrendlineLabel {
  seriesIndex: number;
  position: number;
  text?: string;
  x?: number;
  y?: number;
  fontSizePt?: number;
  color?: string;
}

function normalizeChartTrendlineLabels(value: unknown[]): ChartTrendlineLabel[] {
  const labels: ChartTrendlineLabel[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    if (!Number.isInteger(entry.seriesIndex) || !Number.isInteger(entry.position)) continue;
    const finite = (candidate: unknown) => typeof candidate === "number" && Number.isFinite(candidate);
    labels.push({
      seriesIndex: entry.seriesIndex as number,
      position: entry.position as number,
      ...(typeof entry.text === "string" && entry.text ? { text: entry.text } : {}),
      ...(finite(entry.x) ? { x: entry.x as number } : {}),
      ...(finite(entry.y) ? { y: entry.y as number } : {}),
      ...(finite(entry.fontSizePt) && (entry.fontSizePt as number) > 0 ? { fontSizePt: entry.fontSizePt as number } : {}),
      ...(typeof entry.color === "string" && /^#[0-9a-f]{6}$/i.test(entry.color) ? { color: entry.color } : {}),
    });
  }
  return labels;
}

export interface ChartBlockFormat {
  curve?: ChartCurve;
  /**
   * Select Data ▸ Hidden and Empty Cells ▸ Show empty cells as: Gaps, Zero
   * or Connect data points with line (`c:dispBlanksAs`). Absent is Gaps, what
   * Office writes for a new chart; a reading states it for a chart that has a
   * blank point and wherever its part says anything else, so a cell emptied
   * later draws as the part says at once. What a chart type draws:
   * `effectiveChartDisplayBlanksAs`.
   */
  displayBlanksAs?: ChartDisplayBlanksAs;
  /**
   * Hidden and Empty Cells > Show #N/A as an empty cell (Excel 2016+,
   * `c16r3:dispNaAsBlank`): a #N/A point follows Show empty cells as; off
   * (absent, every chart written before the option) it is no point at all.
   * Excel turns it on for a new chart.
   */
  displayNaAsBlank?: boolean;
  /**
   * Format Data Series ▸ Series Options of a pie or doughnut
   * (`office_chart_pie_options`): Angle of first slice (`c:firstSliceAng`,
   * degrees clockwise from 12 o'clock; absent 0; a 2-D pie or a doughnut),
   * Doughnut Hole Size (`c:holeSize`, 10..90 %; absent the writer's 50) and
   * Pie / Doughnut Explosion (each series' own `c:explosion`, 0..400 %;
   * absent 0).
   */
  firstSliceAngle?: number;
  doughnutHoleSize?: number;
  pieExplosion?: number;
  legend?: ChartLegendPositionV2;
  /**
   * Format Legend ▸ "Show the legend without overlapping the chart" cleared:
   * the legend is drawn over the plot (`c:legend/c:overlay val="1"`). Absent
   * is Office's default, beside the plot.
   */
  legendOverlay?: true;
  /**
   * Chart Title ▸ Centered Overlay: the title is drawn over the plot, which
   * keeps the chart's full height (`c:title/c:overlay val="1"`). Absent is
   * Office's Above Chart, the plot under the title.
   */
  titleOverlay?: true;
  /**
   * Format Chart Title ▸ Alignment ▸ Custom angle, whole degrees clockwise
   * (`c:title/c:tx/c:rich/a:bodyPr@rot`, else the title's `c:txPr`); absent
   * is level.
   */
  titleAngle?: number;
  /** A pie of pie's / bar of pie's Split Series By: Position: the number of
   * last values drawn in the second plot (`c:splitType val="pos"`,
   * `c:splitPos`); absent is Excel's automatic split. */
  ofPieSplitPosition?: number;
  /** Format Data Labels ▸ Text Box ▸ Wrap text in shape, off
   * (`c:dLbls/c:txPr/a:bodyPr@wrap="none"`); absent wraps. */
  dataLabelWrap?: false;
  /** Format Data Labels ▸ Text Box ▸ Custom angle, whole degrees clockwise
   * (`a:bodyPr@rot`); absent is level. */
  dataLabelRotation?: number;
  /** Format Data Series ▸ Scale bubble size to (`c:bubbleScale`): percent of
   * Office's default bubble size, 0..300; absent is 100. */
  bubbleScale?: number;
  /** Format Chart Area ▸ Border ▸ Rounded corners (`c:roundedCorners`). */
  roundedCorners?: true;
  /**
   * The title is Office's automatic one (an empty `c:title` that
   * `c:autoTitleDeleted` leaves standing): drawn as the one series' name, or
   * "Chart Title" in the reader's language, while the chart has no title
   * text of its own (`chartWithAutomaticTitle`).
   */
  automaticTitle?: true;
  /** Explicit value-label visibility. Absent keeps the selected style preset. */
  dataLabels?: boolean;
  /** Office-standard placement for the visible value labels. */
  dataLabelPosition?: ChartDataLabelPosition;
  /** Value is shown by default; explicit false enables name/percentage-only labels. */
  dataLabelValue?: boolean;
  /** Native legend-color key rendered before each visible data label. */
  dataLabelLegendKey?: boolean;
  dataLabelCategoryName?: boolean;
  dataLabelSeriesName?: boolean;
  dataLabelPercentage?: boolean;
  dataLabelBubbleSize?: boolean;
  /** Separator used when two or more label fields are visible. */
  dataLabelSeparator?: ChartDataLabelSeparator;
  /**
   * The labels' own number format (`c:dLbls/c:numFmt@formatCode`, not linked
   * to the source): a currency label keeps its symbol and decimals (PPT-B369).
   */
  dataLabelNumberFormat?: string;
  /**
   * A filled map's Map labels pick, the other half of its tri-state. It is a
   * `dataLabel*` key because it moves with the labels switch, but it is written
   * as `cx:layoutPr/cx:regionLabelLayout`, never as `cx:dataLabels`.
   */
  dataLabelRegionLayout?: ChartMapLabelLayout;
  /**
   * A histogram's or pareto's closed bucket side, written as
   * `cx:binning/@intervalClosed` (`ST_IntervalClosedSide`).
   *
   * It is the chart's, not the host's: Office's default is `r` — `(a, b]`,
   * with the first bucket also holding the minimum — and a part that says `l`
   * is drawn `[a, b)` by Office and has to be drawn that way here. Absent
   * means `r`, so a chart with no part behind it bins the way Excel bins.
   */
  binIntervalClosed?: ChartBinIntervalClosed;
  /**
   * A treemap's Format Data Series ▸ Series Options ▸ Label Options other than
   * Overlapping: its top-level branches named in a band above their tiles
   * (`banner`) or not named (`none`), written as
   * `cx:layoutPr/cx:parentLabelLayout@val`. Absent is Overlapping — Excel's
   * Insert ▸ Treemap default and what Office draws for a part stating none.
   * The twin of `document_charts.ChartParentLabelLayout`.
   */
  parentLabelLayout?: ChartParentLabelLayout;
  /**
   * A histogram's or pareto's Format Axis ▸ Bins (`cx:binning`): Bin width
   * or Number of bins (one or neither: Automatic) and the Overflow /
   * Underflow bin (a cutoff, or `"auto"`). The twin of
   * `document_charts.ChartHistogramBins`.
   */
  histogramBins?: ChartHistogramBins;
  /**
   * A box plot's Format Data Series ▸ Series Options (`cx:statistics` and
   * `cx:visibility`): Quartile Calculation and which of its means and points
   * it shows. Only what the chart states. The twin of
   * `document_charts.ChartBoxWhisker`.
   */
  boxWhisker?: ChartBoxWhisker;
  /**
   * Format Data Series ▸ Gap Width of a histogram's, a pareto's or a
   * waterfall's columns (`cx:catScaling@gapWidth`, a ratio of a column's
   * width, as a whole percent 0–500), where it is not the family's own
   * default (0 % for a histogram or pareto, 50 % for a waterfall). The twin
   * of `document_charts.ChartFormat.gap_width`.
   */
  gapWidth?: number;
  /**
   * Format Data Series ▸ Series Options ▸ Gap Width (0–500) and Series Overlap
   * (-100–100) of a 2-D 100% stacked column or bar chart (`c:barChart`'s
   * `c:gapWidth` / `c:overlap`), where they are not Office's 150 % / 100 %.
   * Absent is that default. A clustered or stacked chart states its spacing
   * in `layout` instead. The twins of `document_charts.ChartFormat.bar_gap_width`
   * / `bar_overlap`.
   */
  barGapWidth?: number;
  barOverlap?: number;
  /**
   * The Gap Width / Series Overlap of a column or bar chart's second group,
   * the one plotted on the secondary axes (its own `c:barChart`): Excel lays
   * each group out across the category band by its own spacing (XW302: wide
   * primary bars at 51%, thin secondary ones at 251% centred over them).
   * Absent is that group at Office's 150% / 0 (100 stacked). `barGapWidth` /
   * `barOverlap` are the primary group's then. The twins of
   * `document_charts.ChartFormat.secondary_bar_gap_width` / `_overlap`.
   */
  secondaryBarGapWidth?: number;
  secondaryBarOverlap?: number;
  /**
   * Format Data Series ▸ Series Options ▸ Gap Depth of a 3-D column, bar,
   * line or area chart (`c:gapDepth`, a percent of a column's depth, 0–500),
   * where it is not ECMA-376's 150. The twin of
   * `document_charts.ChartFormat.gap_depth`.
   */
  gapDepth?: number;
  /**
   * ▸ Column shape of a 3-D column or bar chart for every series that states
   * none (`c:bar3DChart/c:shape`), where it is not `box`. A series' own is
   * its `seriesStyles[].barShape`. The twin of `ChartFormat.bar_shape`.
   */
  barShape?: ChartBarShape;
  /**
   * A combination's column group stacked (its `c:barChart`'s `c:grouping`
   * "stacked": Stacked Column beside a Line, as PowerPoint draws a deck's
   * chart made that way). Absent is clustered columns. The twin of
   * `document_charts.ChartFormat.combo_column_grouping`.
   */
  comboColumnGrouping?: "stacked";
  /**
   * Chart Design ▸ Change Colors on an Office 2016 chart: one palette of the
   * shared theme-token table, written as the chart's Chart Colors part the
   * way the worksheet writes its own pick. An explicit series fill
   * (`seriesStyles`) still wins over it for that series.
   */
  colorPalette?: ChartColorPaletteId;
  /**
   * Format Chart Area ▸ 3-D Rotation of a 3-D pie (`c:view3D`). Absent is the
   * view Office gives a new 3-D pie (`CHART_PIE_3D_DEFAULT_VIEW`); Reset states
   * that view. The twin of `office_chart_view3d`.
   */
  view3D?: ChartView3D;
  /**
   * Chart Design ▸ Quick Layout's calibrated column / bar layout (Excel's
   * eleven, `lib/office-charts/chart-layout`): minor gridlines, major tick
   * marks, gap width, overlap and per-series / per-point data labels. The
   * writers state it as Excel does; the title and axis-title presence is
   * the chart's own text, whatever the layout's flags say.
   */
  layout?: OfficeChartLayout;
  /** Native leader lines for externally positioned 2-D pie labels. */
  dataLabelLeaderLines?: boolean;
  /**
   * Data Labels > Data Callout: the labels drawn in a wedge-rectangle callout
   * whose tail points at its data point (Office: "show your data label
   * inside a text bubble shape"), written as the label geometry
   * `c15:spPr/a:prstGeom[@prst="wedgeRectCallout"]`.
   */
  dataLabelCallout?: boolean;
  /** Major gridlines perpendicular to the physical horizontal axis. */
  gridlinesX?: boolean;
  /** Major gridlines perpendicular to the physical vertical axis. */
  gridlinesY?: boolean;
  /**
   * Primary minor gridlines of the physical horizontal / vertical axis
   * (`c:minorGridlines`), on a chart that takes no calibrated Quick Layout:
   * a 2-D clustered / stacked column or bar chart states them in `layout`.
   */
  minorGridlinesX?: boolean;
  minorGridlinesY?: boolean;
  /**
   * The secondary value axis (a combination's secondary series, a volume
   * stock chart's prices): Gridlines ▸ Secondary Major, and its axis title.
   * The twins of `ChartFormat.secondary_value_gridlines` /
   * `secondary_value_axis_title` (`chartHasSecondaryValueAxis`).
   */
  secondaryValueGridlines?: boolean;
  secondaryValueAxisTitle?: string;
  /** Chart Elements > Axes > Secondary Vertical (`c:delete` on the
   * secondary value axis); absent: shown. */
  secondaryValueAxis?: boolean;
  /** Chart Elements > Axis Titles > Depth: a 3-D chart's depth (series)
   * axis title, `c:serAx/c:title` (`chartHasDepthAxis`). The twin of
   * `ChartFormat.series_axis_title`. */
  seriesAxisTitle?: string;
  /**
   * Chart Filters > Values > Series: the positions (in `data.series`) of the
   * series the chart keeps but does not plot. Office states each as a
   * `c15:filtered…Series` in its chart group's `extLst`; at least one series
   * stays plotted.
   */
  hiddenSeries?: number[];
  /** The series whose legend entry shows its key and no words (a name referring
   * to cells cached empty; the model names every series). */
  legendBlankNames?: number[];
  /** The categories' names refer to cells cached empty: no words under the axis. */
  categoryNamesBlank?: boolean;
  /** A title with no words that still stands: its line's size and how far down
   * the chart it is placed. The plot starts below it; nothing is drawn. */
  blankTitleSizePt?: number;
  blankTitleY?: number;
  /** The primary axes (physical X / Y) whose title has no words and still
   * takes its line: the plot keeps a one-line title's room; nothing is drawn
   * (a worksheet chart's empty `c:title`, as Google Sheets writes on every axis). */
  blankAxisTitles?: ("X" | "Y")[];
  /** A worksheet chart's plot area stated by its OUTER box (a manual layout
   * naming no `c:layoutTarget`): the plot and its tick labels stand inside it,
   * as Excel lays them out (read for the drawing; never written). */
  plotAreaOuter?: ChartElementBox;
  /** The names come by a multi-level reference: one that clears its neighbours keeps its line. */
  categoryNamesWhole?: boolean;
  /** How a deck's trendline labels stand: typed words, their place by hand as
   * fractions of the chart off Office's own, their size and colour. */
  trendlineLabels?: ChartTrendlineLabel[];
  /**
   * Chart Filters > Values > Categories: the positions (in
   * `data.categories`) of the categories the chart keeps but does not plot.
   * Office narrows every series' references to the plotted categories and
   * keeps the full one as `c15:fullRef`; at least one category stays plotted.
   */
  hiddenCategories?: number[];
  /** Native chart data table with series legend keys. */
  dataTable?: boolean;
  /** Whether a visible data table includes each series legend-color key. */
  dataTableLegendKeys?: boolean;
  /** Format Data Table ▸ Table Borders (absent: shown). */
  dataTableHorizontalBorder?: boolean;
  dataTableVerticalBorder?: boolean;
  dataTableOutline?: boolean;
  /** Physical primary horizontal axis visibility. */
  axisX?: boolean;
  /** Physical primary vertical axis visibility. */
  axisY?: boolean;
  /** Office's Format Axis > Axis Options per physical axis (bounds, units,
   * log scale, reverse order, tick marks, label position, number format,
   * display units, crossing), the SHARED record of `lib/office-charts/axis-options`. */
  axisOptions?: OfficeChartAxesOptions;
  /** Native DrawingML paint for the complete chart frame. */
  chartAreaStyle?: PresentationChartAreaStyle;
  /** Native DrawingML paint for the data plotting rectangle. */
  plotAreaStyle?: PresentationChartAreaStyle;
  /** Native DrawingML paint for the chart title container. */
  chartTitleStyle?: PresentationChartAreaStyle;
  /** Native DrawingML paint for the legend container. */
  legendStyle?: PresentationChartAreaStyle;
  /**
   * Format Back Wall / Side Wall / Floor of a 3-D chart (`c:backWall`,
   * `c:sideWall`, `c:floor`: their `c:spPr`). Absent is Office's new-chart
   * wall: no fill, no line. Office allows them only with a 3-D plot
   * (MS-OI29500 21.2.2.11 / 69 / 191). The twins of
   * `document_charts.ChartFormat.back_wall_style` and friends.
   */
  backWallStyle?: PresentationChartAreaStyle;
  sideWallStyle?: PresentationChartAreaStyle;
  floorStyle?: PresentationChartAreaStyle;
  /**
   * Each wall's `c:thickness`: a percentage of the smaller of the 3-D plot's
   * height and width (MS-OI29500 21.2.2.206), 0..100; absent is 0.
   */
  wallThickness?: ChartWallThickness;
  /** Native DrawingML paint for individually addressed data series. */
  seriesStyles?: readonly PresentationChartSeriesStyle[];
  /** Native DrawingML paint for individually addressed 2-D pie slices. */
  sliceStyles?: readonly PresentationChartSliceStyle[];
  /**
   * One series' labels (no `pointIndex`) or one point's label that differ from
   * what they inherit (`ChartDataLabelOverride`); at most one per series and
   * one per point. The twin of `document_charts.ChartDataLabelOverride`.
   */
  dataLabelOverrides?: readonly ChartDataLabelOverride[];
  /**
   * The elements dragged (and sized) by hand: the title, the axis titles,
   * the legend and the plot area, at fractions of the chart (Office's
   * `c:layout/c:manualLayout`). An element absent is laid out by the chart.
   */
  elementLayout?: ChartElementLayout;
  /**
   * The legend's entries deleted from it (select the legend, click one
   * entry, Delete): their indexes in the legend's list. The series or points
   * stay drawn (Office's `c:legend/c:legendEntry/c:delete`).
   */
  legendHiddenEntries?: readonly number[];
  /**
   * The legend's entries formatted one at a time (select the legend, click
   * one entry, Home > Font: Office's `c:legend/c:legendEntry/c:txPr`): each
   * entry's place in the legend's list, as `legendHiddenEntries` counts them,
   * and its own text, drawn over the chart's text (`text`) -- not the
   * legend's (`legendStyle.text`), as Windows PowerPoint draws it (truth
   * office-truth/probes/c30legentry). The twin of
   * `document_charts.ChartLegendEntryFont`.
   */
  legendEntryFonts?: readonly ChartLegendEntryFont[];
  /** Native DrawingML line paint for category and value axes. */
  axisStyles?: readonly PresentationChartAxisStyle[];
  /** The axis titles' own paint and text (each axis's `c:title`), by model axis. */
  axisTitleStyles?: readonly PresentationChartAxisTitleStyle[];
  /** Native DrawingML line paint shared by visible major gridlines. */
  gridlineStyle?: PresentationChartAreaStyle;
  /**
   * One physical axis' major gridlines painted unlike the other's (over
   * `gridlineStyle`), and the primary minor gridlines' own paint: Excel
   * formats each axis' major and minor gridlines apart. The twins of
   * `ChartFormat.gridline_style_x` ... `minor_gridline_style_y`.
   */
  gridlineStyleX?: PresentationChartAreaStyle;
  gridlineStyleY?: PresentationChartAreaStyle;
  minorGridlineStyleX?: PresentationChartAreaStyle;
  minorGridlineStyleY?: PresentationChartAreaStyle;
  /** Native DrawingML paint for the visible data-label containers. */
  dataLabelStyle?: PresentationChartAreaStyle;
  /** Native DrawingML line paint for visible data-label leader lines. */
  dataLabelLeaderLineStyle?: PresentationChartAreaStyle;
  /** Native DrawingML paint for the visible chart data table. */
  dataTableStyle?: PresentationChartAreaStyle;
  /** One native linear trendline on the first data series. */
  trendline?: ChartTrendline;
  /** Native DrawingML line paint for the visible trendline. */
  trendlineStyle?: PresentationChartAreaStyle;
  /**
   * Every trendline but the first series' first (`trendline`): Office lets
   * every series carry several. Series by series, in the part's order.
   */
  seriesTrendlines?: readonly ChartSeriesTrendline[];
  /** Error bars on the first data series at Office's Error Amount. */
  errorBars?: ChartErrorBars;
  /**
   * Error bars on another series than the first (Excel gives each series
   * its own), value-axis bars, series by series with their own paint.
   */
  seriesErrorBars?: readonly ChartSeriesErrorBars[];
  /** Native DrawingML line paint for the visible error bars. */
  errorBarStyle?: PresentationChartAreaStyle;
  /**
   * An X Y chart's error bars along its X axis (`c:errDir val="x"`) on the
   * first series, beside the value axis' `errorBars`: Excel adds both to an
   * X Y series. The twin of `document_charts.ChartFormat.error_bars_x`.
   */
  errorBarsX?: ChartErrorBars;
  /** Native line paint for the X error bars. */
  errorBarXStyle?: PresentationChartAreaStyle;
  /** Native up/down bars comparing the first and last line series. */
  upDownBars?: boolean;
  /** Native paint for categories where the last series is above the first. */
  upBarStyle?: PresentationChartAreaStyle;
  /** Native paint for categories where the last series is below the first. */
  downBarStyle?: PresentationChartAreaStyle;
  /** Native drop lines from each data point to the category-axis baseline. */
  dropLines?: boolean;
  /** Native DrawingML line paint for visible drop lines. */
  dropLineStyle?: PresentationChartAreaStyle;
  /** Native lines joining the highest and lowest series value per category. */
  highLowLines?: boolean;
  /** Native DrawingML line paint for visible high-low lines. */
  highLowLineStyle?: PresentationChartAreaStyle;
  /** Native series connector lines for 2-D stacked bar and column charts. */
  seriesLines?: boolean;
  /** Native DrawingML line paint for visible series connector lines. */
  seriesLineStyle?: PresentationChartAreaStyle;
  /**
   * The chart's own text — face, size, bold, italic, underline, colour —
   * written as `c:chartSpace/c:txPr` and inherited by every element that
   * states none of its own (`lib/office-charts/chart-text`). Home's Font
   * group on a selected chart edits this, as Word, Excel and PowerPoint do.
   */
  text?: OfficeChartText;
}

/**
 * Microsoft, "Add a trend or moving average line to a chart": a trendline goes
 * on "an unstacked, 2-D, area, bar, column, line, stock, xy (scatter), or
 * bubble chart". This table used to stop at a clustered column, a plain line
 * and a scatter, so a bar, an area, a bubble and a stock chart had the control
 * greyed out in Docs and the deck while Excel offers it — and the deck's older
 * ribbon offered it on anything whose name held "bar" or "line", stacked and
 * 3-D included, which the save then gave up.
 */
export function chartSupportsTrendline(
  family: unknown,
  subtype: unknown,
): boolean {
  if (typeof subtype !== "string") return false;
  if (family === "column" || family === "bar") {
    return subtype === "clustered";
  }
  if (family === "line") {
    return subtype === "standard" || subtype === "standardMarkers";
  }
  if (family === "area") return subtype === "standard";
  // A combination of unstacked 2-D column, line and area series: each takes
  // Office's trendlines (a stacked area-column's areas do not).
  if (family === "combo")
    return subtype === "columnLine" || subtype === "columnLineSecondary" || subtype === "custom";
  return family === "xy" || family === "stock";
}

/**
 * One trendline on the first series — any of the six kinds Office's menu
 * lists. The shape and the fit live in `lib/office-charts/trendline`, shared
 * with the sheet; the twin of `document_charts.ChartTrendline`.
 */
export type ChartTrendline = OfficeTrendline;

/**
 * Whether a chart draws a secondary value axis: a combination with a series
 * on it, a stock chart with volume. The twin of
 * `document_charts.chart_has_secondary_value_axis`.
 */
export function chartHasSecondaryValueAxis(
  family: unknown,
  subtype: unknown,
  data: unknown,
): boolean {
  if (family === "stock")
    return subtype === "volumeHighLowClose" || subtype === "volumeOpenHighLowClose";
  if ((family !== "combo" && family !== "xy" && family !== "bar") || !isRecord(data) || !Array.isArray(data.series)) return false;
  return data.series.some((entry) => isRecord(entry) && entry.axis === "secondary");
}

/**
 * Whether a chart has a Depth (Series) Axis: Office's 3-D Column (the
 * standard one, its series one behind another), 3-D Line, 3-D Area and the
 * 3-D surfaces (`c:serAx`). A clustered or stacked 3-D column or area has
 * none. The twin of `document_charts.chart_has_depth_axis`.
 */
export function chartHasDepthAxis(family: unknown, subtype: unknown): boolean {
  return (
    (family === "column" && subtype === "column3d") ||
    (family === "line" && subtype === "line3d") ||
    (family === "area" && subtype === "standard3d") ||
    (family === "surface" && (subtype === "surface3d" || subtype === "wireframe3d"))
  );
}

export function normalizeChartTrendline(
  value: unknown,
): ChartTrendline | undefined {
  return normalizeOfficeTrendline(value);
}

/**
 * One more trendline (Format Data Series ▸ Add Trendline on any series, a
 * second one on the first included) with its own line paint. The twin of
 * `document_charts.ChartSeriesTrendline`.
 */
export type ChartSeriesTrendline = Readonly<{
  seriesIndex: number;
  trendline: ChartTrendline;
  style?: PresentationChartAreaStyle;
}>;
/** The twin of `document_charts.MAX_SERIES_TRENDLINES`. */
export const MAX_CHART_SERIES_TRENDLINES = 30;

/**
 * Error bars on another series than the first (Format Error Bars on the
 * series picked), with their own line paint. The twin of
 * `document_charts.ChartSeriesErrorBars`.
 */
export type ChartSeriesErrorBars = Readonly<{
  seriesIndex: number;
  errorBars: ChartErrorBars;
  style?: PresentationChartAreaStyle;
}>;

/** `format.seriesErrorBars` as the model holds it: series 1..9, each once,
 * in order, or undefined. */
export function normalizeChartSeriesErrorBars(value: unknown): ChartSeriesErrorBars[] | undefined {
  // Any series but the first (whose bars are `format.errorBars`), as the
  // server's `ChartSeriesErrorBars` takes them: a ten-series cap refused a
  // whole page whose 15th series had bars of its own.
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_CHART_SERIES - 1) return undefined;
  const entries: ChartSeriesErrorBars[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) return undefined;
    if (Object.keys(raw).some((key) => !["seriesIndex", "errorBars", "style"].includes(key))) return undefined;
    const errorBars = normalizeChartErrorBars(raw.errorBars);
    const style = raw.style === undefined ? undefined : normalizePresentationChartAreaStyle(raw.style);
    if (
      !Number.isInteger(raw.seriesIndex) ||
      (raw.seriesIndex as number) < 1 ||
      (raw.seriesIndex as number) > MAX_CHART_SERIES - 1 ||
      !errorBars ||
      (raw.style !== undefined && (!style || style.fill !== undefined))
    )
      return undefined;
    entries.push({ seriesIndex: raw.seriesIndex as number, errorBars, ...(style ? { style } : {}) });
  }
  return entries.every((entry, index) => index === 0 || entries[index - 1].seriesIndex < entry.seriesIndex)
    ? entries
    : undefined;
}

export function normalizeChartSeriesTrendlines(
  value: unknown,
): ChartSeriesTrendline[] | undefined {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_CHART_SERIES_TRENDLINES
  )
    return undefined;
  const entries: ChartSeriesTrendline[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) return undefined;
    if (Object.keys(raw).some((key) => !["seriesIndex", "trendline", "style"].includes(key)))
      return undefined;
    const trendline = normalizeChartTrendline(raw.trendline);
    const style =
      raw.style === undefined ? undefined : normalizePresentationChartAreaStyle(raw.style);
    if (
      !Number.isInteger(raw.seriesIndex) ||
      (raw.seriesIndex as number) < 0 ||
      
      // bubble chart's 15th series' trendline refused its whole page).
      (raw.seriesIndex as number) > MAX_CHART_SERIES - 1 ||
      !trendline ||
      (raw.style !== undefined && (!style || style.fill !== undefined))
    )
      return undefined;
    entries.push({
      seriesIndex: raw.seriesIndex as number,
      trendline,
      ...(style ? { style } : {}),
    });
  }
  return entries.every(
    (entry, index) => index === 0 || entries[index - 1].seriesIndex <= entry.seriesIndex,
  )
    ? entries
    : undefined;
}

/**
 * Microsoft Support ("Add, change, or remove error bars in a chart"): a 2-D
 * area, bar, column, line, X Y (scatter) or bubble chart takes error bars, and
 * so does a combination of those; a pie, a doughnut and every 3-D chart do
 * not. A Custom Combination of pie and doughnut rings is a combination of
 * neither kind: `chartDataTakesErrorBars` asks its series. The twin of
 * `document_charts.chart_supports_error_bars`.
 */
export function chartSupportsErrorBars(
  family: unknown,
  subtype: unknown,
): boolean {
  if (typeof subtype !== "string") return false;
  if (family === "column" || family === "bar") {
    return !subtype.endsWith("3d") && subtype !== "column3d";
  }
  if (family === "line" || family === "area") {
    return !subtype.endsWith("3d");
  }
  if (family === "combo") return (CHART_SUBTYPES_BY_FAMILY.combo as readonly string[]).includes(subtype);
  return family === "xy";
}

/**
 * `chartSupportsErrorBars` asked of one chart's series too: a combination
 * whose first series (the one the bars belong to) is drawn as a pie or
 * doughnut ring takes none. The twin of
 * `document_charts.chart_data_takes_error_bars`.
 */
export function chartDataTakesErrorBars(
  family: unknown,
  subtype: unknown,
  data: unknown,
): boolean {
  if (!chartSupportsErrorBars(family, subtype)) return false;
  if (family !== "combo") return true;
  const first =
    isRecord(data) && Array.isArray(data.series) && isRecord(data.series[0]) ? data.series[0] : null;
  return !(first && COMBO_RING_RENDER_AS.has(String(first.renderAs)));
}

/**
 * Format Error Bars ▸ Error Amount (Microsoft Support, "Add, change, or remove
 * error bars in a chart"; ECMA-376 `c:errBars`, `c:errValType` stdErr |
 * percentage | stdDev | fixedVal | cust, `c:val`). Standard Error is computed
 * from the series and states no amount; Percentage (of each point), Standard
 * Deviation(s) (a multiple of the series' deviation, drawn about the mean) and
 * Fixed Value state one. Office's menu picks are three values of this type
 * (Percentage 5, Standard Deviation 1, Standard Error). Custom ▸ Specify
 * Value states each point's own Positive and Negative Error Value (`cust`,
 * `c:plus` / `c:minus` as literal numbers; a point past the list draws none).
 * The twin of `document_charts.ChartErrorBars`.
 *
 * Format Error Bars ▸ Direction and End Style (`c:errBarType`, `c:noEndCap`):
 * `include` is the one side a Plus or Minus bar draws (absent: Both), and
 * `noEndCap` is No Cap (absent: Cap).
 */
export type ChartErrorBarSides = Readonly<{
  include?: "plus" | "minus";
  noEndCap?: true;
}>;
export type ChartErrorBars = ChartErrorBarSides &
  (
    | Readonly<{ type: "standardError" }>
    | Readonly<{ type: "percentage"; value: number }>
    | Readonly<{ type: "standardDeviation"; value: number }>
    | Readonly<{ type: "fixed"; value: number }>
    | Readonly<{ type: "custom"; plus: readonly number[]; minus: readonly number[] }>
  );
export type ChartErrorBarType = ChartErrorBars["type"];
export const CHART_ERROR_BAR_TYPES = [
  "standardError",
  "percentage",
  "standardDeviation",
  "fixed",
] as const satisfies readonly ChartErrorBarType[];
/** The worksheet's own bound on an error amount (`MAX_ERROR_BAR_VALUE`),
 * so every amount a sheet states fits the model. */
export const MAX_CHART_ERROR_AMOUNT = 1_000_000_000;

export function normalizeChartErrorBars(
  value: unknown,
): ChartErrorBars | undefined {
  if (!isRecord(value)) return undefined;
  if (
    (value.include !== undefined && value.include !== "plus" && value.include !== "minus") ||
    (value.noEndCap !== undefined && value.noEndCap !== true)
  ) {
    return undefined;
  }
  const sides: ChartErrorBarSides = {
    ...(value.include !== undefined ? { include: value.include as "plus" | "minus" } : {}),
    ...(value.noEndCap === true ? { noEndCap: true as const } : {}),
  };
  const keys = Object.keys(value).filter((key) => key !== "include" && key !== "noEndCap");
  if (value.type === "standardError") {
    return keys.length === 1 ? { type: "standardError", ...sides } : undefined;
  }
  if (value.type === "custom") {
    const amounts = (list: unknown): number[] | undefined =>
      Array.isArray(list) &&
      list.length <= MAX_CHART_POINTS_PER_SERIES &&
      list.every((entry) => typeof entry === "number" && Number.isFinite(entry) && entry >= 0 && entry <= MAX_CHART_ERROR_AMOUNT)
        ? [...(list as number[])]
        : undefined;
    const plus = amounts(value.plus);
    const minus = amounts(value.minus);
    return keys.length === 3 && plus && minus && (plus.length || minus.length)
      ? { type: "custom", plus, minus, ...sides }
      : undefined;
  }
  if (
    (value.type !== "percentage" &&
      value.type !== "standardDeviation" &&
      value.type !== "fixed") ||
    keys.length !== 2 ||
    typeof value.value !== "number" ||
    !Number.isFinite(value.value) ||
    value.value > MAX_CHART_ERROR_AMOUNT ||
    value.value < 0 ||
    // A percentage or a deviation multiple of zero draws nothing; a fixed
    // amount of zero is a value Office keeps.
    (value.value === 0 && value.type !== "fixed")
  ) {
    return undefined;
  }
  return { type: value.type, value: value.value, ...sides };
}

/**
 * How series `index` of `count` is drawn in its part: every family as itself,
 * a combination series as its stated `renderAs`, else where the classic
 * writer places it (Stacked Area - Clustered Column: the last series the
 * columns, the rest areas; the column-and-line presets: the first series the
 * columns, the rest lines). The twin of `document_charts.chart_series_render_as`.
 */
export function chartSeriesRenderAs(
  family: unknown,
  subtype: unknown,
  renderAs: unknown,
  index: number,
  count: number,
): string {
  if (family !== "combo") return String(family);
  if (isComboRenderAs(renderAs)) {
    return renderAs;
  }
  if (subtype === "stackedAreaColumn") {
    return index === count - 1 ? "column" : "area";
  }
  return index === 0 ? "column" : "line";
}

/**
 * Whether a series offers Format Data Series ▸ Marker (`c:marker`): a 2-D
 * line, a scatter that is not a bubble (CT_BubbleSer has no marker), a radar
 * that draws lines, a combination's line series. The twin of
 * `document_charts.chart_series_takes_marker`.
 */
/**
 * Which of a pie's Series Options the chart stated but cannot take, or null:
 * Angle of first slice on a 2-D pie or a doughnut (0..360), Doughnut Hole
 * Size on a doughnut (10..90), Pie Explosion on any pie (0..400), each a
 * whole number. The twin of `office_chart_pie_options.pie_options_refusal`.
 */
export function chartPieOptionsRefusal(
  family: unknown,
  subtype: unknown,
  format: Readonly<Record<string, unknown>> | undefined,
): "firstSliceAngle" | "doughnutHoleSize" | "pieExplosion" | null {
  const stated = (key: string, low: number, high: number, takes: boolean) => {
    const value = format?.[key];
    return value !== undefined && (!takes || !Number.isInteger(value) || (value as number) < low || (value as number) > high);
  };
  // A Custom Combination of pie and doughnut series (Excel's gauge) turns
  // and hollows its rings as a pie and a doughnut do.
  const ringCombo = family === "combo" && subtype === "custom";
  if (stated("firstSliceAngle", 0, 360, ringCombo || family === "pie" && (subtype === "pie2d" || subtype === "doughnut"))) return "firstSliceAngle";
  if (stated("doughnutHoleSize", 10, 90, ringCombo || family === "pie" && subtype === "doughnut")) return "doughnutHoleSize";
  if (stated("pieExplosion", 0, 400, family === "pie")) return "pieExplosion";
  return null;
}

export function chartSeriesTakesMarker(
  family: unknown,
  subtype: unknown,
  renderAs?: string,
): boolean {
  if (family === "line") return subtype !== "line3d";
  if (family === "xy") return subtype !== "bubble" && subtype !== "bubble3d";
  if (family === "radar") return subtype !== "filled";
  if (family === "combo") return renderAs === "line" || renderAs === "scatter";
  return false;
}

/**
 * Whether a series offers ▸ Line ▸ Smoothed line (`c:smooth`, which only
 * CT_LineSer and CT_ScatterSer carry). The twin of
 * `document_charts.chart_series_takes_smooth`.
 */
export function chartSeriesTakesSmooth(
  family: unknown,
  subtype: unknown,
  renderAs?: string,
): boolean {
  if (family === "line") return subtype !== "line3d";
  if (family === "xy") return subtype !== "bubble" && subtype !== "bubble3d";
  if (family === "combo") return renderAs === "line" || renderAs === "scatter";
  return false;
}

/** One chart's series `index` as its part draws it (`chartSeriesRenderAs`). */
export function chartSeriesRenderAsOf(
  attrs: Pick<ChartBlockAttrsV2, "chartType" | "chartSubtype" | "data">,
  index: number,
): string {
  const series =
    "series" in attrs.data && Array.isArray(attrs.data.series)
      ? (attrs.data.series as readonly { renderAs?: unknown }[])
      : [];
  return chartSeriesRenderAs(
    attrs.chartType,
    attrs.chartSubtype,
    series[index]?.renderAs,
    index,
    series.length,
  );
}

/**
 * `styles` without the marker or curve a series of this chart cannot carry
 * (a style holding nothing else goes with them): what Change Chart Type
 * keeps of each series' line options, as Office drops the markers of a series
 * that becomes a column.
 */
export function chartSeriesStylesForType(
  styles: readonly PresentationChartSeriesStyle[] | undefined,
  attrs: Pick<ChartBlockAttrsV2, "chartType" | "chartSubtype" | "data">,
): PresentationChartSeriesStyle[] | undefined {
  if (!styles) return undefined;
  const kept = styles.flatMap((style) => {
    const renderAs = chartSeriesRenderAsOf(attrs, style.seriesIndex);
    const { marker, smooth, ...rest } = style;
    const next: PresentationChartSeriesStyle = {
      ...rest,
      ...(marker !== undefined &&
      chartSeriesTakesMarker(attrs.chartType, attrs.chartSubtype, renderAs)
        ? { marker }
        : {}),
      ...(smooth !== undefined &&
      chartSeriesTakesSmooth(attrs.chartType, attrs.chartSubtype, renderAs)
        ? { smooth }
        : {}),
    };
    return Object.keys(next).length > 1 ? [next] : [];
  });
  return kept.length ? kept : undefined;
}

/**
 * Chart Elements ▸ Up/Down Bars: a 2-D line chart's, and a stock chart's
 * without an open price (Microsoft Support, "Add or remove series lines, drop
 * lines, high-low lines, or up-down bars in a chart": up/down bars join the
 * first and the last series; an Open-High-Low-Close chart has them already,
 * as its candles). The twin of `document_charts.chart_supports_up_down_bars`.
 */
export function chartSupportsUpDownBars(
  family: unknown,
  subtype: unknown,
): boolean {
  if (family === "stock") return subtype === "highLowClose" || subtype === "volumeHighLowClose";
  return family === "line" && typeof subtype === "string" && subtype !== "line3d";
}

export function chartSupportsDropLines(
  family: unknown,
  subtype: unknown,
): boolean {
  return (
    (family === "line" || family === "area") &&
    typeof subtype === "string" &&
    !subtype.endsWith("3d")
  );
}

export function chartSupportsHighLowLines(
  family: unknown,
  subtype: unknown,
): boolean {
  return (
    family === "line" && typeof subtype === "string" && subtype !== "line3d"
  );
}

export function chartSupportsSeriesLines(
  family: unknown,
  subtype: unknown,
): boolean {
  return (
    (family === "column" || family === "bar") &&
    (subtype === "stacked" || subtype === "percentStacked")
  );
}

export const CHART_DATA_LABEL_FAMILIES = [
  "column",
  "bar",
  "line",
  "area",
  "pie",
  "xy",
  "combo",
  // Word offers Data Labels on a radar and a stock chart too, and the parts
  // it writes carry a `c:dLbls` block of their own.
  "radar",
  "stock",
  // Office 2016 families whose parts carry labels of their own: a treemap and
  // a sunburst label their rectangles, a waterfall its columns, a funnel its
  // stages, and a histogram and a Pareto their columns. The twin of
  // `document_charts.CHART_DATA_LABEL_FAMILIES`.
  "hierarchy",
  "waterfall",
  "funnel",
  "statistical",
  // A filled map labels its regions with their NAMES, and it is the one family
  // whose labels are not `cx:dataLabels` at all. The note that used to stand
  // here — that Excel "writes the same `cx:dataLabels`" — was an inference from
  // 添加图表元素 offering 数据标签; it is measured false. Every Excel-authored
  // `regionMap` part carries `cx:layoutPr/cx:regionLabelLayout` and ZERO
  // `cx:dataLabels` (CHART-IMPORT-AUDIT.md §14.2, §15), and Microsoft's control
  // is Format Data Series ▸ Series Options ▸ **Map labels** — "Show geographic
  // names for your countries/regions" — with None / Best fit only / Show all.
  // The family stays here because the editors still offer one "labels" switch;
  // what it MEANS on a map is `chartMapLabelLayouts` below.
  "map",
] as const satisfies readonly ChartFamily[];

/**
 * The Map labels values Office offers beyond "off", in its own order.
 *
 * `ST_RegionLabelLayout` has exactly three members — `none` ("no region labels
 * appear"), `bestFitOnly` ("region labels only appear if they can fit in their
 * respective containing geometries") and `showAll` ("all region labels appear")
 * — and declares no default ([MS-ODRAWXML], the chartex schema: `val` is
 * `use="required"`). `none` is spelled `dataLabels: false`, the way every other
 * family spells labels off, so this table holds the other two. The twin of
 * `document_charts.CHART_MAP_LABEL_LAYOUTS`.
 */
export const CHART_MAP_LABEL_LAYOUTS = ["bestFitOnly", "showAll"] as const;
export type ChartMapLabelLayout = (typeof CHART_MAP_LABEL_LAYOUTS)[number];

/** The Map labels values this family takes; empty for every other family. */
export function chartMapLabelLayouts(
  family: unknown,
): readonly ChartMapLabelLayout[] {
  return family === "map" ? CHART_MAP_LABEL_LAYOUTS : [];
}

export function isChartMapLabelLayout(
  value: unknown,
): value is ChartMapLabelLayout {
  return CHART_MAP_LABEL_LAYOUTS.includes(value as ChartMapLabelLayout);
}

/**
 * `ST_IntervalClosedSide` ([MS-ODRAWXML], `CT_Binning/@intervalClosed`): which
 * edge of a histogram bucket is the closed one.
 *
 * `r` is `(a, b]` — Excel's default and what every Office-authored binning in
 * the corpora declares — with the FIRST bucket also holding the minimum; `l`
 * is `[a, b)`, with the LAST bucket also holding the maximum. The attribute is
 * optional in the schema, and absent means `r`. The twin of
 * `office_chart_binning.INTERVAL_CLOSED_SIDES`.
 */
export const CHART_BIN_INTERVAL_CLOSED_SIDES = ["l", "r"] as const;
export type ChartBinIntervalClosed =
  (typeof CHART_BIN_INTERVAL_CLOSED_SIDES)[number];

/** Format Axis ▸ Bins of a histogram or pareto (`format.histogramBins`). */
export type ChartHistogramBins = Readonly<{
  /**
   * Bins > By Category (`cx:aggregation`, or a histogram part that states
   * no `cx:binning`): one column per category, its values summed -- with no
   * category text, one per point, 1..n (C30_clusteredColumn in Excel). It
   * states nothing else.
   */
  byCategory?: true;
  binWidth?: number;
  binCount?: number;
  overflow?: number | "auto";
  underflow?: number | "auto";
}>;
/** The most buckets a histogram states (`MAX_HISTOGRAM_BIN_COUNT`). */
export const MAX_CHART_HISTOGRAM_BIN_COUNT = 200;

/**
 * `format.histogramBins` as the model holds it, or undefined for a value it
 * does not hold: a bin width AND a number of bins, a width that is not
 * positive, a count outside 1..200, a bound that is not a finite number or
 * `"auto"`, an underflow at or above the overflow, or no setting at all.
 */
export function normalizeChartHistogramBins(value: unknown): ChartHistogramBins | undefined {
  if (!isRecord(value)) return undefined;
  const keys = Object.keys(value);
  if (keys.includes("byCategory")) {
    return keys.length === 1 && value.byCategory === true ? { byCategory: true } : undefined;
  }
  if (keys.some((key) => !["binWidth", "binCount", "overflow", "underflow"].includes(key))) return undefined;
  if (!keys.length) return undefined;
  const bound = (entry: unknown) =>
    entry === undefined || entry === "auto" || (typeof entry === "number" && Number.isFinite(entry));
  if (!bound(value.overflow) || !bound(value.underflow)) return undefined;
  if (value.binWidth !== undefined && value.binCount !== undefined) return undefined;
  if (
    value.binWidth !== undefined &&
    (typeof value.binWidth !== "number" || !Number.isFinite(value.binWidth) || value.binWidth <= 0)
  ) {
    return undefined;
  }
  if (
    value.binCount !== undefined &&
    (typeof value.binCount !== "number" ||
      !Number.isInteger(value.binCount) ||
      value.binCount < 1 ||
      value.binCount > MAX_CHART_HISTOGRAM_BIN_COUNT)
  ) {
    return undefined;
  }
  if (
    typeof value.overflow === "number" &&
    typeof value.underflow === "number" &&
    value.underflow >= value.overflow
  ) {
    return undefined;
  }
  return {
    ...(value.binWidth !== undefined ? { binWidth: value.binWidth as number } : {}),
    ...(value.binCount !== undefined ? { binCount: value.binCount as number } : {}),
    ...(value.overflow !== undefined ? { overflow: value.overflow as number | "auto" } : {}),
    ...(value.underflow !== undefined ? { underflow: value.underflow as number | "auto" } : {}),
  };
}

/**
 * The chart with Format Axis ▸ Bins set (`null`: Automatic, no overflow or
 * underflow bin), or null when the chart is not a histogram or pareto, the
 * setting is not one the model holds, or nothing changes. Every editor's
 * Format pane and the worksheet's command write it through here.
 */
export function chartWithHistogramBins(
  attrs: ChartBlockAttrsV2,
  bins: ChartHistogramBins | null,
): ChartBlockAttrsV2 | null {
  if (!chartTakesBinIntervalClosed(attrs.chartType, attrs.chartSubtype)) return null;
  const normalized = bins === null ? null : normalizeChartHistogramBins(bins);
  if (normalized === undefined) return null;
  const format: ChartBlockFormat = { ...attrs.format };
  if (normalized) format.histogramBins = normalized;
  else delete format.histogramBins;
  if (JSON.stringify(format.histogramBins ?? null) === JSON.stringify(attrs.format?.histogramBins ?? null)) return null;
  return { ...attrs, format };
}

/**
 * A box plot's Series Options (`format.boxWhisker`; Microsoft Support, "Create
 * a box and whisker chart"): Quartile Calculation (Inclusive or Exclusive
 * median), Show mean markers, Show mean line, Show inner points, Show outlier
 * points, and Gap Width (`cx:catScaling/@gapWidth` as a whole percent of the
 * cluster of boxes; absent is the 100 % every writer here states).
 */
export type ChartBoxWhisker = Readonly<{
  quartileMethod?: "inclusive" | "exclusive";
  meanMarkers?: boolean;
  meanLine?: boolean;
  innerPoints?: boolean;
  outlierPoints?: boolean;
  gapWidth?: number;
}>;
const CHART_BOX_WHISKER_FLAGS = ["meanMarkers", "meanLine", "innerPoints", "outlierPoints"] as const;

/** `format.boxWhisker` as the model holds it, or undefined for anything else
 * (an unknown key, a word that is not a setting, no setting at all). */
export function normalizeChartBoxWhisker(value: unknown): ChartBoxWhisker | undefined {
  if (!isRecord(value)) return undefined;
  const keys = Object.keys(value);
  if (
    !keys.length ||
    keys.some((key) => key !== "quartileMethod" && key !== "gapWidth" && !(CHART_BOX_WHISKER_FLAGS as readonly string[]).includes(key))
  ) {
    return undefined;
  }
  if (
    value.gapWidth !== undefined &&
    !(Number.isInteger(value.gapWidth) && (value.gapWidth as number) >= 0 && (value.gapWidth as number) <= 500)
  ) {
    return undefined;
  }
  if (value.quartileMethod !== undefined && value.quartileMethod !== "inclusive" && value.quartileMethod !== "exclusive") {
    return undefined;
  }
  if (CHART_BOX_WHISKER_FLAGS.some((key) => value[key] !== undefined && typeof value[key] !== "boolean")) return undefined;
  return {
    ...(value.quartileMethod !== undefined ? { quartileMethod: value.quartileMethod as "inclusive" | "exclusive" } : {}),
    ...Object.fromEntries(CHART_BOX_WHISKER_FLAGS.filter((key) => value[key] !== undefined).map((key) => [key, value[key] as boolean])),
    ...(value.gapWidth !== undefined ? { gapWidth: value.gapWidth as number } : {}),
  };
}

/** A treemap's Label Options the model states (`ST_ParentLabelLayout` less
 * Overlapping, which is the key left off). */
export const CHART_PARENT_LABEL_LAYOUTS = ["banner", "none"] as const;
export type ChartParentLabelLayout = (typeof CHART_PARENT_LABEL_LAYOUTS)[number];

export function isChartParentLabelLayout(value: unknown): value is ChartParentLabelLayout {
  return CHART_PARENT_LABEL_LAYOUTS.includes(value as ChartParentLabelLayout);
}

/** Whether this chart states a treemap's Label Options: only a treemap's
 * series has a `cx:parentLabelLayout` (a sunburst names its branches on its
 * rings). The twin of `document_charts.chart_takes_parent_label_layout`. */
export function chartTakesParentLabelLayout(family: unknown, subtype: unknown): boolean {
  return family === "hierarchy" && subtype === "treemap";
}

/** Whether this chart states a box plot's Series Options: a box and whisker
 * chart alone has `cx:visibility` and `cx:statistics` to write them to. */
export function chartTakesBoxWhisker(family: unknown, subtype: unknown): boolean {
  return family === "statistical" && subtype === "boxWhisker";
}

export function isChartBinIntervalClosed(
  value: unknown,
): value is ChartBinIntervalClosed {
  return CHART_BIN_INTERVAL_CLOSED_SIDES.includes(
    value as ChartBinIntervalClosed,
  );
}

/**
 * `ST_DispBlanksAs` (ECMA-376 §21.2.2.42): Hidden and Empty Cells ▸ Show
 * empty cells as — Gaps, Zero, Connect data points with line. The twin of
 * `office_chart_blanks.CHART_DISPLAY_BLANKS_AS`.
 */
export const CHART_DISPLAY_BLANKS_AS = ["gap", "zero", "span"] as const;
export type ChartDisplayBlanksAs = (typeof CHART_DISPLAY_BLANKS_AS)[number];

export function isChartDisplayBlanksAs(
  value: unknown,
): value is ChartDisplayBlanksAs {
  return CHART_DISPLAY_BLANKS_AS.includes(value as ChartDisplayBlanksAs);
}














export interface ChartWallThickness {
  backWall?: number;
  sideWall?: number;
  floor?: number;
}

/** The walls a 3-D chart's format states (`c:backWall`, `c:sideWall`, `c:floor`). */
export const CHART_WALL_STYLE_KEYS = ["backWallStyle", "sideWallStyle", "floorStyle"] as const;

/** A wall thickness record in its one spelling, or null when it is not one. */
export function normalizeChartWallThickness(value: unknown): ChartWallThickness | null {
  if (!isRecord(value)) return null;
  const out: ChartWallThickness = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key !== "backWall" && key !== "sideWall" && key !== "floor") return null;
    if (typeof entry !== "number" || !Number.isInteger(entry) || entry < 0 || entry > 100) return null;
    if (entry > 0) out[key] = entry;
  }
  return Object.keys(out).length ? out : null;
}

export interface ChartView3D {
  rotX: number;
  rotY: number;
  perspective: number;
  rightAngleAxes: boolean;
  depthPercent?: number;
  heightPercent?: number;
}

/** Insert ▸ Pie ▸ 3-D Pie in Excel and PowerPoint. */
export const CHART_PIE_3D_DEFAULT_VIEW: Readonly<ChartView3D> = Object.freeze({
  rotX: 30,
  rotY: 0,
  perspective: 30,
  rightAngleAxes: false,
});

/**
 * Insert ▸ 3-D Clustered (Stacked, 100% Stacked) Column or Bar in Excel:
 * 15° of tilt, 20° of turn, Right Angle Axes (its gallery style writes
 * `rAngAx val="1"`; measured on the clustered column and bar).
 */
export const CHART_3D_RIGHT_ANGLE_DEFAULT_VIEW: Readonly<ChartView3D> = Object.freeze({
  rotX: 15,
  rotY: 20,
  perspective: 30,
  rightAngleAxes: true,
});

/**
 * Every other 3-D chart Excel inserts -- the 3-D Column with its series
 * axis, 3-D Line, 3-D Area, 3-D Surface: 15° of tilt, 20° of turn and the
 * 15° field of view, no right-angle axes.
 */
export const CHART_3D_PERSPECTIVE_DEFAULT_VIEW: Readonly<ChartView3D> = Object.freeze({
  rotX: 15,
  rotY: 20,
  perspective: 30,
  rightAngleAxes: false,
});

const CHART_VIEW_3D_BOUNDS = {
  rotX: [-90, 90],
  rotY: [0, 360],
  perspective: [0, 240],
  depthPercent: [20, 2000],
  heightPercent: [5, 500],
} as const;

const CHART_VIEW_3D_KEYS = ["rotX", "rotY", "perspective", "rightAngleAxes", "depthPercent", "heightPercent"];

/** The chart leaves Format Chart Area ▸ 3-D Rotation turns: every 3-D leaf
 * with a view of its own (a 3-D bubble is a flat chart of shaded bubbles; a
 * contour is the surface seen from straight above). */
const CHART_VIEW_3D_LEAVES: Readonly<Record<string, readonly string[]>> = {
  column: ["clustered3d", "stacked3d", "percentStacked3d", "column3d"],
  bar: ["clustered3d", "stacked3d", "percentStacked3d"],
  line: ["line3d"],
  area: ["standard3d", "stacked3d", "percentStacked3d"],
  pie: ["pie3d"],
  surface: ["surface3d", "wireframe3d"],
};

/** The view Office gives a new chart of this leaf (the model's absent view). */
export function chartDefaultView3D(chartType: unknown, chartSubtype: unknown): Readonly<ChartView3D> {
  if (chartType === "pie") return CHART_PIE_3D_DEFAULT_VIEW;
  if ((chartType === "column" || chartType === "bar") && chartSubtype !== "column3d") {
    return CHART_3D_RIGHT_ANGLE_DEFAULT_VIEW;
  }
  return CHART_3D_PERSPECTIVE_DEFAULT_VIEW;
}

/**
 * `value` as a 3-D view in its one spelling, or `null` when it is not one.
 * A child left out takes `defaults`' value (the leaf's own view); Depth 100
 * is not stated, and under Right Angle Axes the perspective is the schema's
 * 30 (the file states none there).
 */
export function normalizeChartView3D(
  value: unknown,
  defaults: Readonly<ChartView3D> = CHART_PIE_3D_DEFAULT_VIEW,
): ChartView3D | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !CHART_VIEW_3D_KEYS.includes(key))) {
    return null;
  }
  const integer = (key: keyof typeof CHART_VIEW_3D_BOUNDS, fallback: number | undefined) => {
    const number = record[key] ?? fallback;
    if (number === undefined) return undefined;
    const [low, high] = CHART_VIEW_3D_BOUNDS[key];
    return typeof number === "number" && Number.isInteger(number) && number >= low && number <= high
      ? number
      : null;
  };
  const rotX = integer("rotX", defaults.rotX);
  const rotY = integer("rotY", defaults.rotY);
  const perspective = integer("perspective", defaults.perspective);
  const depthPercent = integer("depthPercent", defaults.depthPercent);
  const heightPercent = integer("heightPercent", defaults.heightPercent);
  if (rotX == null || rotY == null || perspective == null || depthPercent === null || heightPercent === null) {
    return null;
  }
  const angles = record.rightAngleAxes ?? defaults.rightAngleAxes;
  if (typeof angles !== "boolean") return null;
  return {
    rotX,
    rotY,
    perspective: angles ? 30 : perspective,
    rightAngleAxes: angles,
    ...(depthPercent !== undefined && depthPercent !== 100 ? { depthPercent } : {}),
    ...(heightPercent !== undefined ? { heightPercent } : {}),
  };
}

/** Whether two views are the same view. */
export function sameChartView3D(left: Readonly<ChartView3D>, right: Readonly<ChartView3D>): boolean {
  return (
    left.rotX === right.rotX &&
    left.rotY === right.rotY &&
    left.perspective === right.perspective &&
    left.rightAngleAxes === right.rightAngleAxes &&
    (left.depthPercent ?? 100) === (right.depthPercent ?? 100) &&
    left.heightPercent === right.heightPercent
  );
}

/** The view a chart is drawn in: its own, else the one Office gives its leaf. */
export function effectiveChartView3D(
  attrs: Pick<ChartBlockAttrsV2, "format"> & Partial<Pick<ChartBlockAttrsV2, "chartType" | "chartSubtype">>,
): ChartView3D {
  const defaults = chartDefaultView3D(attrs.chartType ?? "pie", attrs.chartSubtype ?? "pie3d");
  return normalizeChartView3D(attrs.format?.view3D, defaults) ?? { ...defaults };
}

/** Whether Format Chart Area ▸ 3-D Rotation turns this chart: its 3-D leaves. */
export function chartTakesView3D(chartType: unknown, chartSubtype: unknown): boolean {
  return typeof chartType === "string" && typeof chartSubtype === "string"
    ? (CHART_VIEW_3D_LEAVES[chartType]?.includes(chartSubtype) ?? false)
    : false;
}

/** A blank point: `null` on the page, NaN in a sheet's memory. */
export function isChartBlankValue(value: unknown): boolean {
  return value === null || (typeof value === "number" && Number.isNaN(value));
}

/** Whether a chart's `data` holds a blank point anywhere. */
export function chartDataHasBlanks(data: unknown): boolean {
  if (!isRecord(data) || !Array.isArray(data.series)) return false;
  return data.series.some(
    (series) =>
      isRecord(series) &&
      (["values", "xValues", "yValues"] as const).some(
        (key) => Array.isArray(series[key]) && series[key].some(isChartBlankValue),
      ),
  );
}

/**
 * What a chart of `family`/`subtype` draws for a blank point ([MS-OI29500]
 * §21.2.2.42): stacked and 100% lines and areas and 3-D areas take only Zero;
 * standard lines, X Y and radar charts take all three; every other type Gaps
 * and Zero, a method it does not take falling back to its default (Gaps). The
 * twin of `office_chart_blanks.effective_display_blanks_as`.
 */
export function effectiveChartDisplayBlanksAs(
  family: string,
  subtype: string,
  requested: ChartDisplayBlanksAs | undefined,
): ChartDisplayBlanksAs {
  const wanted = requested ?? "gap";
  const stacked = subtype.toLowerCase().includes("stacked");
  if (
    ((family === "line" || family === "area") && stacked) ||
    (family === "area" && subtype.endsWith("3d"))
  ) {
    return "zero";
  }
  if (wanted === "span") {
    const spans =
      family === "xy" ||
      family === "radar" ||
      (family === "line" && !subtype.endsWith("3d"));
    return spans ? "span" : "gap";
  }
  return wanted;
}

export function isChartColorPaletteId(
  value: unknown,
): value is ChartColorPaletteId {
  return (
    typeof value === "string" &&
    (CHART_COLOR_PALETTE_IDS as readonly string[]).includes(value)
  );
}

/**
 * The families whose Chart Colors part Change Colors writes: the Office 2016
 * charts, whose series state no paint of their own, so that part is all Office
 * paints them with. The twin of `document_charts.CHART_COLOR_PALETTE_FAMILIES`.
 */
export const CHART_COLOR_PALETTE_FAMILIES = [
  "hierarchy",
  "statistical",
  "waterfall",
  "funnel",
  "map",
] as const;

/**
 * Whether Change Colors reaches this chart. Microsoft ("Change the color or
 * style of a chart in Office") offers the Colorful and Monochromatic schemes
 * on every chart in Word, Excel and PowerPoint: an Office 2016 chart takes the
 * pick as its Chart Colors part (`CHART_COLOR_PALETTE_FAMILIES`), a classic
 * chart as each series' (a pie's each point's) theme-colour paint, the way
 * Excel writes it. A surface plot is painted by its height bands, never its
 * series, so it takes none. The twin of
 * `document_charts.chart_takes_color_palette`.
 */
export function chartTakesColorPalette(family: unknown): boolean {
  return typeof family === "string" && family !== "surface";
}

/** Whether a chart's Chart Colors part IS its paint (the Office 2016 families). */
export function chartColorPaletteIsItsPart(family: unknown): boolean {
  return (CHART_COLOR_PALETTE_FAMILIES as readonly unknown[]).includes(family);
}

/** The two families whose part carries a `cx:binning`, and so a closed side. */
/** Whether `format.gapWidth` is this chart's: a histogram, a pareto, a waterfall. */
export function chartTakesExtendedGapWidth(family: unknown, subtype: unknown): boolean {
  return (family === "statistical" && (subtype === "histogram" || subtype === "pareto")) || family === "waterfall";
}

/** Whether `format.barGapWidth` / `format.barOverlap` are this chart's: a 2-D
 * column or bar chart (a clustered or stacked one states them where it has no
 * calibrated `layout`, as a deck's chart read from PowerPoint's part does)
 * and a combination's column group. The twin of
 * `document_charts.chart_takes_bar_spacing`. */
export function chartTakesBarSpacing(family: unknown, subtype: unknown): boolean {
  return (
    ((family === "column" || family === "bar") &&
      (subtype === "clustered" || subtype === "stacked" || subtype === "percentStacked")) ||
    family === "combo"
  );
}

/** The 3-D column and bar leaves (`c:bar3DChart`). */
const CHART_3D_BAR_SUBTYPES: ReadonlySet<string> = new Set(["clustered3d", "stacked3d", "percentStacked3d", "column3d"]);

/** Whether `format.barShape` (and a series' `barShape`) are this chart's: a
 * 3-D column or bar chart. The twin of `document_charts.chart_takes_bar_shape`. */
export function chartTakesBarShape(family: unknown, subtype: unknown): boolean {
  return (family === "column" || family === "bar") && CHART_3D_BAR_SUBTYPES.has(String(subtype));
}

/** Whether `format.barGapWidth` -- and not `barOverlap`, which a
 * `c:bar3DChart` has no element for -- is this chart's as a 3-D column or bar
 * chart's Gap Width. The twin of `document_charts.chart_takes_3d_gap_width`. */
export function chartTakes3DGapWidth(family: unknown, subtype: unknown): boolean {
  return chartTakesBarShape(family, subtype);
}

/** Whether `format.gapDepth` is this chart's: a 3-D column, bar, line or area
 * chart. The twin of `document_charts.chart_takes_gap_depth`. */
export function chartTakesGapDepth(family: unknown, subtype: unknown): boolean {
  return (
    chartTakesBarShape(family, subtype) ||
    (family === "line" && subtype === "line3d") ||
    (family === "area" && (subtype === "standard3d" || subtype === "stacked3d" || subtype === "percentStacked3d"))
  );
}

/** Whether `format.secondaryBarGapWidth` / `secondaryBarOverlap` are this
 * chart's: a 2-D column or bar chart (or a combination) with columns or bars
 * plotted on the secondary axis. The twin of
 * `document_charts.chart_takes_secondary_bar_spacing`. */
export function chartTakesSecondaryBarSpacing(family: unknown, subtype: unknown, data: unknown): boolean {
  if (!chartTakesBarSpacing(family, subtype) || !isRecord(data) || !Array.isArray(data.series)) return false;
  return data.series.some(
    (series) =>
      isRecord(series) &&
      series.axis === "secondary" &&
      (family !== "combo" || series.renderAs === "column" || series.renderAs === "bar"),
  );
}

/** What absent `format.barGapWidth` / `format.barOverlap` mean for a chart:
 * the spacing the classic writer states for it (Gap Width 150 %; Series
 * Overlap 0 for clustered bars, 100 for a stacked group). The twin of
 * `document_charts.bar_spacing_defaults`. */
export function chartBarSpacingDefaults(
  family: unknown,
  subtype: unknown,
  comboColumnGrouping?: unknown,
): { gapWidth: number; overlap: number } {
  const stacked =
    family === "column" || family === "bar"
      ? subtype === "stacked" || subtype === "percentStacked"
      : comboColumnGrouping === "stacked";
  return { gapWidth: 150, overlap: stacked ? 100 : 0 };
}

/** Office's spacing of a 100% stacked column or bar chart, which absent
 * `format.barGapWidth` / `format.barOverlap` mean: Gap Width 150 %, Series
 * Overlap 100 %. The twin of `document_charts.PERCENT_STACKED_BAR_SPACING_DEFAULTS`. */
export const PERCENT_STACKED_BAR_SPACING_DEFAULTS = { gapWidth: 150, overlap: 100 } as const;

const isWholeIn = (value: unknown, low: number, high: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= low && value <= high;

/** The Gap Width (whole percent) a histogram, pareto or waterfall draws when it states none. */
export function chartExtendedGapWidth(family: unknown, subtype: unknown, stated: unknown): number {
  if (typeof stated === "number" && Number.isInteger(stated) && stated >= 0 && stated <= 500) return stated;
  return family === "waterfall" ? 50 : 0;
}

export function chartTakesBinIntervalClosed(
  family: unknown,
  subtype: unknown,
): boolean {
  return family === "statistical" && (subtype === "histogram" || subtype === "pareto");
}

export const CHART_DATA_LABEL_POSITIONS = [
  "bestFit",
  "bottom",
  "center",
  "insideBase",
  "insideEnd",
  "left",
  "outsideEnd",
  "right",
  "top",
] as const;
export type ChartDataLabelPosition =
  (typeof CHART_DATA_LABEL_POSITIONS)[number];

export const CHART_DATA_LABEL_SEPARATORS = [
  ", ",
  "; ",
  " ",
  "\n",
  ". ",
] as const;
export type ChartDataLabelSeparator =
  (typeof CHART_DATA_LABEL_SEPARATORS)[number];

/**
 * Whether ECMA-376 forbids this chart's group a `c:dLblPos` at all.
 *
 * ISO/IEC 29500-1 §21.2.2.48 says the element "shall not be specified" for
 * `areaChart`, `area3DChart`, `bar3DChart`, `doughnutChart`, `line3DChart` and
 * `radarChart` — a `pie3DChart` is NOT on that list. Office obeys it: 103 area
 * groups across the local Office corpus carry zero `dLblPos` between them. The
 * twin of `document_charts._forbidden_data_label_position_group`.
 */
function forbiddenDataLabelPositionGroup(
  family: ChartFamily,
  subtype: ChartSubtype,
): boolean {
  if (family === "area" || family === "radar") return true;
  if (family === "column" || family === "bar" || family === "line") {
    return subtype.endsWith("3d") || subtype === "column3d";
  }
  return family === "pie" && subtype === "doughnut";
}

export function chartDataLabelPositions(
  family: ChartFamily,
  subtype: ChartSubtype,
): readonly ChartDataLabelPosition[] {
  if (forbiddenDataLabelPositionGroup(family, subtype)) return [];
  if (family === "pie") {
    return ["bestFit", "center", "insideEnd", "outsideEnd"];
  }
  if (family === "column" || family === "bar") {
    const stacked =
      subtype.startsWith("stacked") || subtype.startsWith("percentStacked");
    return stacked
      ? ["center", "insideBase", "insideEnd"]
      : ["center", "insideBase", "insideEnd", "outsideEnd"];
  }
  if (family === "line" || family === "xy") {
    return ["center", "left", "right", "top", "bottom"];
  }
  if (family === "combo") return ["center"];
  // The Office 2016 families place a label where their own parts place one:
  // centred inside a treemap's or sunburst's rectangle and inside a funnel's
  // stage, and at a waterfall column's end, inside or outside it (Word writes
  // `outEnd`, Excel `inEnd`; the end of a decrease is its foot).
  if (family === "hierarchy" || family === "funnel") return ["center"];
  if (family === "waterfall") return ["center", "insideEnd", "outsideEnd"];
  // ECMA-376 lists bubble, line, scatter and stock together as the groups
  // whose `c:dLblPos` may be left, right, bottom, top or center.
  if (family === "stock") return ["center", "left", "right", "top", "bottom"];
  // A histogram and a Pareto are `clusteredColumn` chartEx layouts and take a
  // column chart's four positions; a box plot takes four of its own. Measured
  
  // 数据标签内/轴内侧/数据标签外 on a histogram and a Pareto, and 无/左侧/
  // 右侧/顶部/底部 on a box plot; picking one writes the ST_DataLabelPos token
  // onto `cx:dataLabels` (`pos="outEnd"`, `pos="r"`, `pos="t"` observed).
  if (family === "statistical") {
    return subtype === "boxWhisker"
      ? ["left", "right", "top", "bottom"]
      : ["center", "insideBase", "insideEnd", "outsideEnd"];
  }
  return [];
}

/**
 * The positions one point's label may state: the family's, and on a funnel
 * Below too. Excel offers a funnel no Label Position, yet draws a point
 * label a part places `b` under its band, on the next band, in the labels'
 * own ink (Excel for Mac, X-051 oracle: C18_funnel-label-options' delta
 * "¥8.00" on epsilon); every other position it draws in the band. The twin
 * of `document_charts.chart_data_label_point_positions`.
 */
export function chartDataLabelPointPositions(
  family: ChartFamily,
  subtype: ChartSubtype,
): readonly ChartDataLabelPosition[] {
  const positions = chartDataLabelPositions(family, subtype);
  return family === "funnel" ? [...positions, "bottom"] : positions;
}













export function chartLabelOverridesForType(
  overrides: readonly ChartDataLabelOverride[] | undefined,
  family: ChartFamily,
  subtype: ChartSubtype,
): ChartDataLabelOverride[] | undefined {
  if (!overrides || !CHART_LABEL_OVERRIDE_FAMILIES.has(family)) return undefined;
  const positions = chartDataLabelPointPositions(family, subtype);
  const bubble = family === "xy" && (subtype === "bubble" || subtype === "bubble3d");
  const kept = overrides.flatMap((entry) => {
    const label: { -readonly [K in keyof ChartDataLabelOverride]: ChartDataLabelOverride[K] } = { ...entry };
    if (label.dataLabelPosition !== undefined && !positions.includes(label.dataLabelPosition)) {
      delete label.dataLabelPosition;
    }
    if (label.dataLabelPercentage === true && family !== "pie") delete label.dataLabelPercentage;
    if (label.dataLabelBubbleSize === true && !bubble) delete label.dataLabelBubbleSize;
    return Object.keys(label).some((key) => key !== "seriesIndex" && key !== "pointIndex") ? [label] : [];
  });
  return kept.length ? kept : undefined;
}

export function isChartDataLabelPosition(
  value: unknown,
): value is ChartDataLabelPosition {
  return CHART_DATA_LABEL_POSITIONS.includes(value as ChartDataLabelPosition);
}

export function isChartDataLabelSeparator(
  value: unknown,
): value is ChartDataLabelSeparator {
  return CHART_DATA_LABEL_SEPARATORS.includes(value as ChartDataLabelSeparator);
}

/**
 * The families whose labels are classic `c:dLbls`: a series' own block and a
 * point's own `c:dLbl` override the chart's. Office formats, adds and deletes
 * one series' labels (the first click selects them) or one label (the second
 * click), and a label's typed text replaces what it shows (Microsoft Support
 * "Add or remove data labels in a chart", "Edit titles or data labels in a
 * chart"). The twin of `document_charts.CHART_LABEL_OVERRIDE_FAMILIES`.
 */
export const CHART_LABEL_OVERRIDE_FAMILIES: ReadonlySet<ChartFamily> = new Set<ChartFamily>([
  // A funnel's points restate its labels in `cx:dataLabel` (X-051).
  // A stock chart's series state their own labels as a line's do (X-262).
  "column", "bar", "line", "area", "pie", "xy", "combo", "radar", "funnel", "stock",
]);

/** The label keys a series or point states over what it inherits, spelled as the chart's own. */
export const CHART_LABEL_STATEMENT_KEYS = [
  "dataLabels",
  "dataLabelNumberFormat",
  "dataLabelValue",
  "dataLabelLegendKey",
  "dataLabelCategoryName",
  "dataLabelSeriesName",
  "dataLabelPercentage",
  "dataLabelBubbleSize",
  "dataLabelSeparator",
  "dataLabelPosition",
] as const;
export type ChartLabelStatementKey = (typeof CHART_LABEL_STATEMENT_KEYS)[number];

/** A series' labels or one point's label as they differ from what they inherit. */
export interface ChartDataLabelOverride {
  readonly seriesIndex: number;
  /** Absent: the whole series' labels. */
  readonly pointIndex?: number;
  readonly dataLabels?: boolean;
  readonly dataLabelValue?: boolean;
  readonly dataLabelLegendKey?: boolean;
  readonly dataLabelCategoryName?: boolean;
  readonly dataLabelSeriesName?: boolean;
  readonly dataLabelPercentage?: boolean;
  readonly dataLabelBubbleSize?: boolean;
  readonly dataLabelSeparator?: ChartDataLabelSeparator;
  readonly dataLabelNumberFormat?: string;
  readonly dataLabelPosition?: ChartDataLabelPosition;
  /**
   * The labels stand where their chart type stands them by default, whatever
   * their chart (a point: their series) states -- their own block states no
   * `c:dLblPos`. A stated position goes over it. The twin of
   * `document_charts.ChartDataLabelOverride.dataLabelPositionAutomatic`.
   */
  readonly dataLabelPositionAutomatic?: true;
  /** One label's typed words (`c:dLbl/c:tx/c:rich`), shown instead of its fields. */
  readonly text?: string;
  /** A label dragged by hand: from its default place, as fractions of the chart's width and height. */
  readonly offset?: Readonly<{ x: number; y: number }>;
  /** The labels' own text style (the series' `c:dLbls/c:txPr`, one label's
   * `c:dLbl/c:txPr`), over the chart's data label text: what Home's Font
   * group writes with the series (or the one label) selected, as Office
   * formats the element selected. */
  readonly font?: OfficeChartText;
  /** The label's own Wrap text in shape (`a:bodyPr@wrap`), where it differs. */
  readonly wrap?: boolean;
  /** The label's own Custom angle, whole degrees clockwise (`a:bodyPr@rot`). */
  readonly rotation?: number;
  /**
   * One label's typed words with fields (Insert Data Label Field: `a:fld`
   * runs in its `c:tx/c:rich`), each field written `{CATEGORYNAME}`,
   * `{VALUE}`, `{PERCENTAGE}`... and a literal brace doubled: drawn with the
   * point's own values instead of the label's switches, as Office draws it.
   * The twin of `document_charts.ChartDataLabelOverride.field_text`.
   */
  readonly fieldText?: string;
  /** One label's own box paint (Format Data Label > Fill / Border, its `c:spPr`). */
  readonly box?: PresentationChartAreaStyle;
  /** One label resized by hand (`c15:layout`), as fractions of the chart's width and height. */
  readonly size?: Readonly<{ w: number; h: number }>;
  /** One label's words set left or right in its box (its paragraph's `algn`); unstated, centred. */
  readonly textAlign?: "left" | "right";
  /** The line a moved label is led back to its point by (its series' `c15:leaderLines`), read for the drawing. */
  readonly leaderLine?: Readonly<{ outline: string; widthPt: number }>;
}

/** The data label fields a label's typed words may hold (`a:fld@type`). */
export const CHART_LABEL_TEXT_FIELDS = new Set([
  "CATEGORYNAME", "SERIESNAME", "VALUE", "PERCENTAGE", "XVALUE", "YVALUE", "BUBBLESIZE", "CELLRANGE",
]);

/** A label's `fieldText` as its parts (words and fields), or null when it is
 * not one: an unknown field, a lone brace, no field at all. The twin of
 * `document_charts.chart_label_field_text_parts`. */
export function chartLabelFieldTextParts(
  template: string,
): ReadonlyArray<{ readonly field?: string; readonly text?: string }> | null {
  const parts: { field?: string; text?: string }[] = [];
  let words = "";
  for (let at = 0; at < template.length; ) {
    if (template.startsWith("{{", at) || template.startsWith("}}", at)) {
      words += template[at];
      at += 2;
      continue;
    }
    const char = template[at];
    if (char === "}") return null;
    if (char === "{") {
      const match = /^\{([A-Z]+)\}/.exec(template.slice(at));
      if (!match || !CHART_LABEL_TEXT_FIELDS.has(match[1])) return null;
      if (words) parts.push({ text: words });
      words = "";
      parts.push({ field: match[1] });
      at += match[0].length;
      continue;
    }
    words += char;
    at += 1;
  }
  if (words) parts.push({ text: words });
  return parts.some((part) => part.field) ? parts : null;
}

const CHART_LABEL_OVERRIDE_KEYS = new Set<string>([
  "seriesIndex", "pointIndex", ...CHART_LABEL_STATEMENT_KEYS, "dataLabelPositionAutomatic", "text", "offset", "font",
  "wrap", "rotation", "fieldText", "box", "size", "textAlign", "leaderLine",
]);
const CHART_LABEL_TOGGLE_KEYS = [
  "dataLabels",
  "dataLabelValue",
  "dataLabelLegendKey",
  "dataLabelCategoryName",
  "dataLabelSeriesName",
  "dataLabelPercentage",
  "dataLabelBubbleSize",
] as const;

/** `value` as a list of label overrides, or undefined when any entry is malformed. */
export function normalizeChartDataLabelOverrides(
  value: unknown,
): readonly ChartDataLabelOverride[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_CHART_POINTS) return undefined;
  const seen = new Set<string>();
  const result: ChartDataLabelOverride[] = [];
  for (const raw of value) {
    if (!isRecord(raw) || Object.keys(raw).some((key) => !CHART_LABEL_OVERRIDE_KEYS.has(key))) return undefined;
    const seriesIndex = raw.seriesIndex;
    const pointIndex = raw.pointIndex;
    if (
      typeof seriesIndex !== "number" || !Number.isInteger(seriesIndex) || seriesIndex < 0 ||
      seriesIndex >= MAX_CHART_SERIES ||
      (pointIndex !== undefined &&
        (typeof pointIndex !== "number" || !Number.isInteger(pointIndex) || pointIndex < 0 ||
          pointIndex >= MAX_CHART_POINTS_PER_SERIES))
    )
      return undefined;
    const key = `${seriesIndex}:${pointIndex ?? "series"}`;
    if (seen.has(key)) return undefined;
    seen.add(key);
    const entry: Record<string, unknown> = { seriesIndex };
    if (pointIndex !== undefined) entry.pointIndex = pointIndex;
    for (const name of CHART_LABEL_TOGGLE_KEYS) {
      if (raw[name] === undefined) continue;
      if (typeof raw[name] !== "boolean") return undefined;
      entry[name] = raw[name];
    }
    if (raw.dataLabelSeparator !== undefined) {
      if (!isChartDataLabelSeparator(raw.dataLabelSeparator)) return undefined;
      entry.dataLabelSeparator = raw.dataLabelSeparator;
    }
    if (raw.dataLabelNumberFormat !== undefined) {
      if (typeof raw.dataLabelNumberFormat !== "string" || raw.dataLabelNumberFormat.length > 255) return undefined;
      entry.dataLabelNumberFormat = raw.dataLabelNumberFormat;
    }
    if (raw.dataLabelPosition !== undefined) {
      if (!isChartDataLabelPosition(raw.dataLabelPosition)) return undefined;
      entry.dataLabelPosition = raw.dataLabelPosition;
    }
    if (raw.dataLabelPositionAutomatic !== undefined) {
      if (raw.dataLabelPositionAutomatic !== true) return undefined;
      entry.dataLabelPositionAutomatic = true;
    }
    if (raw.font !== undefined) {
      const font = normalizeOfficeChartText(raw.font);
      if (!font) return undefined;
      entry.font = font;
    }
    if (raw.wrap !== undefined) {
      if (typeof raw.wrap !== "boolean") return undefined;
      entry.wrap = raw.wrap;
    }
    if (raw.rotation !== undefined) {
      if (typeof raw.rotation !== "number" || !Number.isInteger(raw.rotation) || Math.abs(raw.rotation) > 90) return undefined;
      entry.rotation = raw.rotation;
    }
    if (raw.text !== undefined) {
      // The server strips a label's surrounding whitespace (`_ChartModel`).
      const text = typeof raw.text === "string" ? raw.text.trim() : "";
      if (!text || text.length > MAX_CHART_TEXT_CHARS || pointIndex === undefined) return undefined;
      entry.text = text;
    }
    if (raw.offset !== undefined) {
      const offset = raw.offset;
      if (
        pointIndex === undefined || !isRecord(offset) ||
        Object.keys(offset).sort().join() !== "x,y" ||
        [offset.x, offset.y].some((n) => typeof n !== "number" || !Number.isFinite(n) || n < -1 || n > 1)
      )
        return undefined;
      entry.offset = { x: offset.x as number, y: offset.y as number };
    }
    // Typed words win over field words: typing into a label replaces both.
    if (raw.fieldText !== undefined && entry.text === undefined) {
      const fieldText = typeof raw.fieldText === "string" ? raw.fieldText.trim() : "";
      if (
        !fieldText || fieldText.length > MAX_CHART_TEXT_CHARS || pointIndex === undefined ||
        !chartLabelFieldTextParts(fieldText)
      )
        return undefined;
      entry.fieldText = fieldText;
    }
    if (raw.box !== undefined) {
      const box = normalizePresentationChartAreaStyle(raw.box);
      // A series' box is its part's own (`c:dLbls/c:spPr`), drawn on its labels.
      if (!box) return undefined;
      entry.box = box;
    }
    if (raw.size !== undefined) {
      const size = raw.size;
      if (
        pointIndex === undefined || !isRecord(size) ||
        Object.keys(size).sort().join() !== "h,w" ||
        [size.w, size.h].some((n) => typeof n !== "number" || !Number.isFinite(n) || n <= 0 || n > 1)
      )
        return undefined;
      entry.size = { w: size.w as number, h: size.h as number };
    }
    if (raw.textAlign !== undefined) {
      if (pointIndex === undefined || (raw.textAlign !== "left" && raw.textAlign !== "right")) return undefined;
      entry.textAlign = raw.textAlign;
    }
    if (raw.leaderLine !== undefined) {
      const line = raw.leaderLine;
      if (
        pointIndex === undefined || !isRecord(line) ||
        typeof line.outline !== "string" || !/^#[0-9a-fA-F]{6}$/.test(line.outline) ||
        typeof line.widthPt !== "number" || !(line.widthPt > 0) || line.widthPt > 20
      )
        return undefined;
      entry.leaderLine = { outline: line.outline, widthPt: line.widthPt };
    }
    const stated = Object.keys(entry).filter((name) => name !== "seriesIndex" && name !== "pointIndex");
    if (!stated.length) return undefined;
    if (entry.dataLabels === false && stated.length > 1) return undefined;
    result.push(entry as unknown as ChartDataLabelOverride);
  }
  // Series by series, the series' own labels before its points', points by
  // place: one spelling for one set of labels (the server's order).
  return result.sort(
    (left, right) =>
      left.seriesIndex - right.seriesIndex ||
      (left.pointIndex ?? -1) - (right.pointIndex ?? -1),
  );
}

/** A chart's, a series' or a point's labels, every key resolved. */
export interface ChartDataLabelStatement {
  readonly dataLabels: boolean;
  readonly dataLabelValue: boolean;
  readonly dataLabelLegendKey: boolean;
  readonly dataLabelCategoryName: boolean;
  readonly dataLabelSeriesName: boolean;
  readonly dataLabelPercentage: boolean;
  readonly dataLabelBubbleSize: boolean;
  readonly dataLabelSeparator?: ChartDataLabelSeparator;
  readonly dataLabelNumberFormat?: string;
  readonly dataLabelPosition?: ChartDataLabelPosition;
  readonly text?: string;
  readonly offset?: Readonly<{ x: number; y: number }>;
  readonly fieldText?: string;
  readonly box?: PresentationChartAreaStyle;
  readonly size?: Readonly<{ w: number; h: number }>;
  readonly textAlign?: "left" | "right";
  readonly leaderLine?: Readonly<{ outline: string; widthPt: number }>;
}

function chartLabelStatementOver(
  inherited: ChartDataLabelStatement,
  entry: ChartDataLabelOverride | undefined,
): ChartDataLabelStatement {
  if (!entry) return inherited;
  const next: Record<string, unknown> = { ...inherited };
  // No position of its own (a stated one goes over it, below).
  if (entry.dataLabelPositionAutomatic === true) delete next.dataLabelPosition;
  for (const name of CHART_LABEL_STATEMENT_KEYS) {
    if (entry[name] !== undefined) next[name] = entry[name];
  }
  if (entry.text !== undefined) next.text = entry.text;
  if (entry.offset !== undefined) next.offset = entry.offset;
  if (entry.fieldText !== undefined) next.fieldText = entry.fieldText;
  if (entry.box !== undefined) next.box = entry.box;
  if (entry.size !== undefined) next.size = entry.size;
  if (entry.textAlign !== undefined) next.textAlign = entry.textAlign;
  if (entry.leaderLine !== undefined) next.leaderLine = entry.leaderLine;
  return next as unknown as ChartDataLabelStatement;
}

/**
 * What one series' labels (no `pointIndex`) or one point's label show: the
 * chart's statement (`chartShows`: whether the chart's labels are on, the
 * style preset's default decided), then the series' override, then the
 * point's. The one resolution the renderer and the editors use.
 */
export function chartDataLabelStatement(
  format: ChartBlockFormat | undefined,
  chartShows: boolean,
  seriesIndex: number,
  pointIndex?: number,
): ChartDataLabelStatement {
  const chart: ChartDataLabelStatement = {
    dataLabels: chartShows,
    dataLabelValue: format?.dataLabelValue !== false,
    dataLabelLegendKey: format?.dataLabelLegendKey === true,
    dataLabelCategoryName: format?.dataLabelCategoryName === true,
    dataLabelSeriesName: format?.dataLabelSeriesName === true,
    dataLabelPercentage: format?.dataLabelPercentage === true,
    dataLabelBubbleSize: format?.dataLabelBubbleSize === true,
    ...(format?.dataLabelSeparator ? { dataLabelSeparator: format.dataLabelSeparator } : {}),
    ...(format?.dataLabelNumberFormat ? { dataLabelNumberFormat: format.dataLabelNumberFormat } : {}),
    ...(format?.dataLabelPosition ? { dataLabelPosition: format.dataLabelPosition } : {}),
  };
  const overrides = format?.dataLabelOverrides ?? [];
  const series = chartLabelStatementOver(
    chart,
    overrides.find((entry) => entry.seriesIndex === seriesIndex && entry.pointIndex === undefined),
  );
  if (pointIndex === undefined) return series;
  return chartLabelStatementOver(
    series,
    overrides.find((entry) => entry.seriesIndex === seriesIndex && entry.pointIndex === pointIndex),
  );
}

/**
 * The overrides after a chart-wide label command: every key the command
 * changed is the chart's again on every series and every label, as the shared
 * writer restates it on each (Office's Add Chart Element > Data Labels applies
 * to the whole chart). Turning the labels on or off restates the value switch
 * too, and turning them off every field. A deleted label stays deleted and a
 * label keeps its typed words and the place it was dragged to. The twin of
 * `document_charts.chart_label_overrides_after_chart_edit`.
 */
export function chartFormatReconcileDataLabelOverrides(
  previous: ChartBlockFormat | undefined,
  next: ChartBlockFormat | undefined,
): ChartBlockFormat | undefined {
  const overrides = next?.dataLabelOverrides;
  if (!next || !overrides?.length) return next;
  if (JSON.stringify(previous?.dataLabelOverrides ?? null) !== JSON.stringify(overrides)) return next;
  const changed = new Set<ChartLabelStatementKey>(
    CHART_LABEL_STATEMENT_KEYS.filter((name) => (previous?.[name] ?? null) !== (next[name] ?? null)),
  );
  if (!changed.size) return next;
  const toggled = changed.has("dataLabels");
  const off = toggled && next.dataLabels !== true;
  const kept = overrides.flatMap((entry) => {
    const copy: Record<string, unknown> = { ...entry };
    for (const name of CHART_LABEL_STATEMENT_KEYS) {
      if (copy[name] === undefined) continue;
      if (name === "dataLabels") {
        if (!toggled || (entry.pointIndex !== undefined && entry.dataLabels === false)) continue;
      } else if (!changed.has(name) && !(toggled && (off || name === "dataLabelValue"))) {
        continue;
      }
      delete copy[name];
    }
    // A chart-wide position is every label's again, the automatic one too.
    if (changed.has("dataLabelPosition") || off) delete copy.dataLabelPositionAutomatic;
    return Object.keys(copy).some((name) => name !== "seriesIndex" && name !== "pointIndex")
      ? [copy as unknown as ChartDataLabelOverride]
      : [];
  });
  const result: ChartBlockFormat = { ...next };
  if (kept.length) result.dataLabelOverrides = kept;
  else delete result.dataLabelOverrides;
  return result;
}










export function chartSupportsDataLabels(
  family: unknown,
): family is (typeof CHART_DATA_LABEL_FAMILIES)[number] {
  return (CHART_DATA_LABEL_FAMILIES as readonly unknown[]).includes(family);
}

/**
 * Whether Add Chart Element > Data Labels > Data Callout applies: a 2-D
 * classic column, bar, line, pie, scatter or combination chart (the twin of
 * `chart_supports_data_label_callout`).
 */
export function chartSupportsDataLabelCallout(family: unknown, subtype: unknown): boolean {
  return (
    ["column", "bar", "line", "pie", "xy", "combo"].includes(String(family)) &&
    !String(subtype).endsWith("3d") &&
    subtype !== "column3d"
  );
}

export function chartSupportsDataLabelLeaderLines(
  family: unknown,
  subtype: unknown,
): boolean {
  return (
    family === "pie" &&
    (subtype === "pie2d" || subtype === "doughnut")
  );
}

/**
 * Leader lines to labels dragged away from their points (Excel 2013+, the
 * labels' `c15:showLeaderLines` extension): a 2-D column, bar, line, area,
 * XY or combination chart draws a line from the point to a label moved off
 * it (C16_testDataPointLabelCustomPos; X-086). The twin of the API's
 * `chart_supports_dragged_label_leader_lines`.
 */
/** Whether a single point's label is shown (`dataLabelOverrides`), the
 * server's `point_label_shown`. */
function chartFormatShowsPointLabel(format: Record<string, unknown>): boolean {
  const overrides = format.dataLabelOverrides;
  return (
    Array.isArray(overrides) &&
    overrides.some(
      (override) =>
        Boolean(override) &&
        typeof override === "object" &&
        typeof (override as { pointIndex?: unknown }).pointIndex === "number" &&
        (override as { dataLabels?: unknown }).dataLabels === true,
    )
  );
}

export function chartSupportsDraggedLabelLeaderLines(
  family: unknown,
  subtype: unknown,
): boolean {
  return (
    ((family === "column" || family === "bar" || family === "line" || family === "area" || family === "xy" || family === "combo") &&
      !/3d/i.test(String(subtype))) ||
    // A 2-D pie's or doughnut's label dragged off its slice keeps a line to
    // it (C29_tdf161607: a doughnut, whose labels take no position, draws
    // its four moved labels' purple 7pt lines; X-222).
    (family === "pie" && (subtype === "pie2d" || subtype === "doughnut"))
  );
}

export const CHART_AXIS_TITLE_FAMILIES = [
  "column",
  "bar",
  "line",
  "area",
  "xy",
  "stock",
  "combo",
  "surface",
  // The Office 2016 families whose own parts state axes, and whose Chart
  // Elements menu offers 坐标轴标题: the three statistical charts, the
  // waterfall, and the funnel with its single category axis. Measured on Excel
  
  // only 图表标题 / 数据标签 / 图例 and stay out. The twin of
  // `document_charts.CHART_AXIS_TITLE_FAMILIES`.
  "statistical",
  "waterfall",
  "funnel",
] as const satisfies readonly ChartFamily[];













export const CHART_AREA_STYLE_FAMILIES = [
  "column",
  "bar",
  "line",
  "area",
  "pie",
  "xy",
  "stock",
  "radar",
  "combo",
  "surface",
] as const satisfies readonly ChartFamily[];

/** The element styles every family's part carries, the chartEx part included. */
export const CHART_FRAME_STYLE_KEYS = [
  "chartAreaStyle",
  "plotAreaStyle",
  "chartTitleStyle",
  "legendStyle",
] as const;

export function chartTakesAreaStyles(
  family: unknown,
): family is (typeof CHART_AREA_STYLE_FAMILIES)[number] {
  return (CHART_AREA_STYLE_FAMILIES as readonly unknown[]).includes(family);
}

/**
 * An Office 2016 chart's axis labels and data labels state their own text in
 * its part ([MS-ODRAWXML] CT_Axis and CT_DataLabels: `cx:txPr`), as a classic
 * chart's do: the size Excel draws them at. That text -- and no paint -- is
 * the one element style these families take beyond the frame's; the
 * axis-bearing ones take it on their axes (a funnel on its category axis
 * alone). The twin of `document_charts.chart_element_text_only`.
 */
const CHART_ELEMENT_TEXT_AXES: Readonly<Record<string, readonly string[]>> = {
  waterfall: ["category", "value"],
  statistical: ["category", "value"],
  funnel: ["category"],
  hierarchy: [],
  map: [],
};

export function chartTakesElementTextOnly(family: unknown, axis?: unknown): boolean {
  if (typeof family !== "string" || !Object.prototype.hasOwnProperty.call(CHART_ELEMENT_TEXT_AXES, family)) return false;
  return axis === undefined || CHART_ELEMENT_TEXT_AXES[family]!.includes(String(axis));
}

/** A style record that states its `text` alone (an axis's: with its `axis`). */
function statesTextOnly(raw: unknown, axisKey = false): boolean {
  return (
    isRecord(raw) &&
    raw.text !== undefined &&
    Object.keys(raw).every((key) => key === "text" || (axisKey && key === "axis"))
  );
}

/** A series' own paint reaches one family further: Office fills a funnel's
 * stages from the series. The twin of `document_charts.CHART_SERIES_STYLE_FAMILIES`. */
export function chartTakesSeriesStyles(family: unknown): boolean {
  return chartTakesAreaStyles(family) || family === "funnel";
}

export function chartSupportsAxisTitles(
  family: unknown,
): family is (typeof CHART_AXIS_TITLE_FAMILIES)[number] {
  return (CHART_AXIS_TITLE_FAMILIES as readonly unknown[]).includes(family);
}

/** Whether this editor offers one chart's `x` or `y` axis title. The twin of
 * `document_charts.chart_supports_axis_title`. */
export function chartSupportsAxisTitle(
  family: unknown,
  axis: "x" | "y",
): boolean {
  return chartSupportsAxisTitles(family) && chartHasAxis(family, axis);
}

/**
 * Axis visibility reaches one family further than axis titles do. A treemap, a
 * sunburst and a filled map are axisless in Office and carry none. The twin of
 * `document_charts.CHART_AXIS_VISIBILITY_FAMILIES`.
 */
export const CHART_AXIS_VISIBILITY_FAMILIES = [
  ...CHART_AXIS_TITLE_FAMILIES,
  // Radar has both axes and the value axis's gridlines in every part Word
  // writes; what it cannot have is an axis title, which is why it is not in
  // the list above.
  "radar",
] as const satisfies readonly ChartFamily[];

export function chartSupportsAxisVisibility(
  family: unknown,
): family is (typeof CHART_AXIS_VISIBILITY_FAMILIES)[number] {
  return (CHART_AXIS_VISIBILITY_FAMILIES as readonly unknown[]).includes(
    family,
  );
}

/**
 * Whether one chart family has a primary `x` or `y` axis at all.
 *
 * A funnel carries exactly one axis — its categories, which this contract keys
 * `x` the way it keys the funnel's `axisX` — so there is no `y` axis to show,
 * hide or title. Excel agrees: its 坐标轴标题 submenu lists 主要纵坐标轴 alone
 * on a funnel, while a waterfall's and a box plot's list both. Offering `axisY`
 * there wrote a key no part of a funnel can hold, and the save refused the
 * whole page over it. The twin of `document_charts.chart_has_axis`.
 */
export function chartHasAxis(family: unknown, axis: "x" | "y"): boolean {
  if (!chartSupportsAxisVisibility(family)) return false;
  return !(family === "funnel" && axis === "y");
}






export const CHART_GRIDLINE_FAMILIES = CHART_AXIS_VISIBILITY_FAMILIES.filter(
  (
    family,
  ): family is Exclude<
    (typeof CHART_AXIS_VISIBILITY_FAMILIES)[number],
    "funnel"
  > => family !== "funnel",
);

export function chartSupportsGridlines(
  family: unknown,
): family is (typeof CHART_GRIDLINE_FAMILIES)[number] {
  return (CHART_GRIDLINE_FAMILIES as readonly unknown[]).includes(family);
}

/**
 * Whether a stored chart may still carry gridline keys its family is no longer
 * offered. Every imported funnel states `gridlinesX: false`, read from its own
 * axis, and a page saved with it must still open: the keys are accepted, never
 * offered and never drawn (the funnel renderer draws no gridline). The twin of
 * `document_charts._RETIRED_GRIDLINE_FAMILIES`.
 */
function chartAcceptsStoredGridlines(family: unknown): boolean {
  return chartSupportsGridlines(family) || family === "funnel";
}

/**
 * Whether Chart Filters can hide one of this chart's series: a classic chart
 * whose series are independent plots (a pie draws one series, a stock chart's
 * series are its price roles, a surface's are the rows of one height matrix).
 */
export function chartSupportsSeriesFilter(family: unknown): boolean {
  return ["column", "bar", "line", "area", "radar", "xy", "combo"].includes(
    String(family),
  );
}

/**
 * Whether Chart Filters can hide one of this chart's categories: a classic
 * chart plotted per category (the twin of `CHART_CATEGORY_FILTER_FAMILIES`).
 */
export function chartSupportsCategoryFilter(family: unknown): boolean {
  return ["column", "bar", "line", "area", "radar", "pie", "combo"].includes(
    String(family),
  );
}

/**
 * Whether a chart states its primary minor gridlines as
 * `format.minorGridlinesX` / `Y`: a classic chart with gridlines that takes no
 * calibrated Quick Layout (a 2-D clustered / stacked column or bar chart
 * carries them in `format.layout`). An Office 2016 chart's writer states
 * none yet.
 */
export function chartSupportsMinorGridlines(
  family: unknown,
  subtype: unknown,
): boolean {
  if (!chartSupportsGridlines(family)) return false;
  if (["hierarchy", "statistical", "waterfall", "funnel", "map"].includes(String(family)))
    return false;
  return !(
    (family === "column" || family === "bar") &&
    (subtype === "clustered" || subtype === "stacked")
  );
}

export const CHART_DATA_TABLE_FAMILIES = [
  "column",
  "bar",
  "line",
  "area",
  "combo",
] as const satisfies readonly ChartFamily[];

export function chartSupportsDataTable(
  family: unknown,
): family is (typeof CHART_DATA_TABLE_FAMILIES)[number] {
  return (CHART_DATA_TABLE_FAMILIES as readonly unknown[]).includes(family);
}

export interface ChartBlockAttrsV2 {
  schemaVersion: 2;
  chartType: ChartFamily;
  chartSubtype: ChartSubtype;
  title: string;
  /** Primary physical horizontal axis title. */
  axisTitleX?: string;
  /** Primary physical vertical axis title. */
  axisTitleY?: string;
  /** The title's characters in runs with their own text format
   * (`c:title/c:tx/c:rich`'s `a:r`); absent for a title of one plain run.
   * Always spells `title` exactly (`chart-title-runs`). */
  titleRuns?: readonly ChartTitleRun[];
  


  axisTitleXRuns?: readonly ChartTitleRun[];
  axisTitleYRuns?: readonly ChartTitleRun[];
  data: ChartData;
  stylePreset: ChartStylePresetId;
  format?: ChartBlockFormat;
}

export interface ChartValidationIssue {
  code: string;
  path: string;
  message: string;
}

export interface ChartValidationResult {
  valid: boolean;
  issues: ChartValidationIssue[];
}

export interface NormalizedChartBlockAttrs {
  attrs: ChartBlockAttrsV2;
  source: "v1" | "v2";
  validation: ChartValidationResult;
}

export function isChartBlockType(value: unknown): value is ChartBlockType {
  return (CHART_BLOCK_TYPES as readonly unknown[]).includes(value);
}

export function isChartFamily(value: unknown): value is ChartFamily {
  return (CHART_FAMILIES as readonly unknown[]).includes(value);
}

export function isChartSubtype(value: unknown): value is ChartSubtype {
  return CHART_SUBTYPE_CATALOG.some((entry) => entry.subtype === value);
}

export function isChartSubtypeForFamily(
  family: unknown,
  subtype: unknown,
): family is ChartFamily {
  return (
    isChartFamily(family) &&
    (CHART_SUBTYPES_BY_FAMILY[family] as readonly unknown[]).includes(subtype)
  );
}

export function chartSubtypeDefinition(
  family: unknown,
  subtype: unknown,
): ChartSubtypeDefinition | null {
  if (!isChartSubtypeForFamily(family, subtype)) return null;
  return (
    CHART_SUBTYPE_CATALOG.find(
      (entry) => entry.family === family && entry.subtype === subtype,
    ) ?? null
  );
}

export function isChartStylePreset(
  value: unknown,
): value is ChartStylePresetId {
  return (CHART_STYLE_PRESET_IDS as readonly unknown[]).includes(value);
}

/** A legend's deleted entries: sorted, once each, indexes of its list. */
/** One legend entry's own text (`ChartFormatV2.legendEntryFonts`). */
export interface ChartLegendEntryFont {
  readonly entry: number;
  readonly font: OfficeChartText;
}

export function normalizeChartLegendEntryFonts(value: unknown): ChartLegendEntryFont[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const rows = new Map<number, ChartLegendEntryFont>();
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const entry = raw.entry;
    if (typeof entry !== "number" || !Number.isInteger(entry) || entry < 0 || entry >= MAX_CHART_POINTS_PER_SERIES) continue;
    const font = normalizeOfficeChartText(raw.font);
    if (font && !rows.has(entry)) rows.set(entry, { entry, font });
  }
  return rows.size ? [...rows.values()].sort((left, right) => left.entry - right.entry) : undefined;
}

export function normalizeChartLegendHiddenEntries(value: unknown): number[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  if (value.some((entry) => typeof entry !== "number" || !Number.isInteger(entry) || entry < 0 || entry >= MAX_CHART_POINTS_PER_SERIES))
    return undefined;
  return [...new Set(value as number[])].sort((left, right) => left - right);
}

export function clampChartText(value: unknown): string {
  return typeof value === "string" ? value.slice(0, MAX_CHART_TEXT_CHARS) : "";
}

export function sanitizeChartCategories(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_CHART_CATEGORIES).map(clampChartText);
}

// ---------------------------------------------------------------------------
// Multi-level category axis (`CategoryChartData.categoryLevels`)
// ---------------------------------------------------------------------------

/**
 * A reader's multi-level categories as the model holds them, or undefined
 * when they are not a multi-level axis over `count` categories: 1 to
 * {@link MAX_CHART_CATEGORY_LEVELS} levels (outermost first), each exactly
 * `count` entries long, each entry text (a blank cell, null, reads as "")
 * clamped to the model's label bound. Anything else is refused whole -- a
 * level that does not align with the categories cannot be placed.
 */
export function normalizeChartCategoryLevels(
  value: unknown,
  count: number,
): string[][] | undefined {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > MAX_CHART_CATEGORY_LEVELS ||
    count < 1 ||
    count > MAX_CHART_CATEGORIES
  ) {
    return undefined;
  }
  const levels: string[][] = [];
  for (const level of value) {
    if (!Array.isArray(level) || level.length !== count) return undefined;
    const labels: string[] = [];
    for (const label of level) {
      if (label === null || label === undefined) labels.push("");
      else if (typeof label === "string") labels.push(clampChartText(label));
      else return undefined;
    }
    levels.push(labels);
  }
  return levels;
}

/** One group of categories a level of a multi-level axis labels. */
export interface ChartCategoryLevelGroup {
  /** The group's first category. */
  readonly start: number;
  /** One past its last category. */
  readonly end: number;
  readonly label: string;
}

/**
 * The groups of each level of a multi-level category axis, outermost level
 * first, each level's groups in category order and together covering every
 * category. A group starts at the first category, where its level states a
 * label, and where a group of any outer level starts (Excel ends an inner
 * group at an outer boundary: Region > Quarter's "Q1..Q3" of East and West
 * are two groups however the cells read).
 */
export function chartCategoryLevelGroups(
  levels: readonly (readonly string[])[],
  count: number,
): ChartCategoryLevelGroup[][] {
  const groups: ChartCategoryLevelGroup[][] = [];
  if (count < 1) return levels.map(() => []);
  let outer = new Set<number>([0]);
  for (const level of levels) {
    const starts = new Set<number>(outer);
    for (let index = 1; index < count; index += 1) {
      if ((level[index] ?? "") !== "") starts.add(index);
    }
    const ordered = [...starts].sort((left, right) => left - right);
    groups.push(
      ordered.map((start, at) => ({
        start,
        end: ordered[at + 1] ?? count,
        label: level[start] ?? "",
      })),
    );
    outer = starts;
  }
  return groups;
}

/**
 * Each category's labels from the outermost level to its own leaf label
 * (Region > Quarter: `["East", "Q2"]`); a single-level chart's are its leaf
 * labels alone.
 */
export function chartCategoryLevelPaths(
  data: Pick<CategoryChartData, "categories" | "categoryLevels">,
): string[][] {
  const paths = data.categories.map(() => [] as string[]);
  for (const level of chartCategoryLevelGroups(
    data.categoryLevels ?? [],
    data.categories.length,
  )) {
    for (const group of level) {
      for (let index = group.start; index < group.end; index += 1) {
        paths[index].push(group.label);
      }
    }
  }
  return paths.map((path, index) => [...path, data.categories[index]]);
}

/**
 * The name a category goes by where one text stands for it -- a pie's
 * legend and slice labels, a data label's Category Name, a tooltip: its
 * labels outermost first, joined by a space, as Excel names a multi-level
 * category ("East Q1"). A single-level category's name is its label.
 */
export function chartCategoryFullNames(
  data: Pick<CategoryChartData, "categories" | "categoryLevels">,
): string[] {
  if (!data.categoryLevels?.length) return [...data.categories];
  return chartCategoryLevelPaths(data).map((path) =>
    path.filter((label) => label !== "").join(" "),
  );
}

/**
 * The category labels of a multi-level axis drawn as flat text (Format Axis
 * > Labels, "Multi-level Category Labels" cleared: `c:noMultiLvlLbl
 * val="1"`): each category's own label, then under it the label of every
 * outer group that starts at it, innermost first (Excel draws "Q1\nEast",
 * "Q2", "Q3", "Q1\nWest", ...). A single-level chart's are its labels.
 */
export function chartCategoryFlatLabels(
  data: Pick<CategoryChartData, "categories" | "categoryLevels">,
): string[] {
  const lines = data.categories.map((label) => [label]);
  const groups = chartCategoryLevelGroups(
    data.categoryLevels ?? [],
    data.categories.length,
  );
  for (let level = groups.length - 1; level >= 0; level -= 1) {
    for (const group of groups[level]) {
      if (group.label !== "") lines[group.start].push(group.label);
    }
  }
  return lines.map((entry) => entry.join("\n"));
}

/**
 * The levels of the categories an edit leaves, in their new order:
 * `origins[i]` is the category the i-th one was before the edit (a filter, a
 * removal, a reordering), or null for one the edit added, which joins the
 * group before it. Each group's label moves to the first of its categories
 * still there (a hidden first quarter hands "East" to the second), and a
 * group split by a reordering is labelled again where it resumes. Undefined
 * when the chart has no levels or no category is left.
 */
export function chartCategoryLevelsPicked(
  data: Pick<CategoryChartData, "categories" | "categoryLevels">,
  origins: readonly (number | null)[],
): string[][] | undefined {
  const levels = data.categoryLevels;
  if (!levels?.length || origins.length === 0) return undefined;
  const count = data.categories.length;
  const groups = chartCategoryLevelGroups(levels, count);
  const groupOf = groups.map((level) => {
    const owner = new Array<number>(count);
    level.forEach((group, at) => {
      for (let index = group.start; index < group.end; index += 1) owner[index] = at;
    });
    return owner;
  });
  const picked = levels.map(() => new Array<string>(origins.length).fill(""));
  const previous = levels.map((): number | undefined => undefined);
  origins.forEach((origin, position) => {
    let outerRestarted = position === 0;
    groups.forEach((level, depth) => {
      const known = origin !== null && origin >= 0 && origin < count;
      const group = known ? groupOf[depth][origin] : previous[depth];
      const restarted = outerRestarted || group !== previous[depth];
      if (restarted && group !== undefined) picked[depth][position] = level[group].label;
      previous[depth] = group;
      outerRestarted = restarted;
    });
  });
  return picked;
}

/**
 * Category data after an edit that keeps, drops, reorders or adds categories
 * (`origins` as {@link chartCategoryLevelsPicked} reads it): the levels
 * follow their categories, and a chart without levels is returned as built.
 */
export function withChartCategoryLevelsPicked<T extends CategoryChartData>(
  source: Pick<CategoryChartData, "categories" | "categoryLevels">,
  next: T,
  origins: readonly (number | null)[],
): T {
  const { categoryLevels: _stale, ...rest } = next;
  const levels = chartCategoryLevelsPicked(source, origins);
  return (
    levels && levels[0].length === next.categories.length
      ? { ...rest, categoryLevels: levels }
      : rest
  ) as T;
}

/** V1-only sanitization. V2 uses fail-closed validation instead of coercion. */
export function sanitizeChartSeries(value: unknown): ChartBlockSeries[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_CHART_SERIES).map((entry) => {
    const record = isRecord(entry) ? entry : {};
    const values = Array.isArray(record.values)
      ? record.values.slice(0, MAX_CHART_CATEGORIES).map((item) => {
          const numeric = typeof item === "number" ? item : Number(item);
          return Number.isFinite(numeric) ? numeric : 0;
        })
      : [];
    return { name: clampChartText(record.name), values };
  });
}

// ---------------------------------------------------------------------------
// V1 stock compatibility
// ---------------------------------------------------------------------------

export const STOCK_SERIES_ROLE_ALIASES: Record<
  Exclude<StockRole, "volume">,
  readonly string[]
> = {
  open: ["开盘", "open"],
  high: ["最高", "high"],
  low: ["最低", "low"],
  close: ["收盘", "close"],
};

export function resolveStockSeriesRoles(
  series: unknown,
): Record<Exclude<StockRole, "volume">, number> | null {
  if (!Array.isArray(series) || series.length !== 4) return null;
  const roles: Partial<Record<Exclude<StockRole, "volume">, number>> = {};
  for (let index = 0; index < series.length; index += 1) {
    const entry = series[index];
    if (!isRecord(entry)) return null;
    const name = String(entry.name ?? "")
      .trim()
      .toLowerCase();
    const role = (
      Object.keys(STOCK_SERIES_ROLE_ALIASES) as Exclude<StockRole, "volume">[]
    ).find((candidate) => STOCK_SERIES_ROLE_ALIASES[candidate].includes(name));
    if (!role || roles[role] !== undefined) return null;
    roles[role] = index;
  }
  return Object.keys(roles).length === 4
    ? (roles as Record<Exclude<StockRole, "volume">, number>)
    : null;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function issue(
  issues: ChartValidationIssue[],
  code: string,
  path: string,
  message: string,
) {
  issues.push({ code, path, message });
}

function validateText(
  value: unknown,
  path: string,
  issues: ChartValidationIssue[],
  options: { required?: boolean } = {},
) {
  if (typeof value !== "string") {
    issue(issues, "text.type", path, "must be a string");
  } else if (options.required && value.trim() === "") {
    issue(issues, "text.required", path, "must not be empty");
  } else if (value.length > MAX_CHART_TEXT_CHARS) {
    issue(
      issues,
      "text.too_long",
      path,
      `must be at most ${MAX_CHART_TEXT_CHARS} characters`,
    );
  }
}

function validateFiniteArray(
  value: unknown,
  path: string,
  issues: ChartValidationIssue[],
  options: { min?: number; max?: number; nonNegative?: boolean } = {},
) {
  if (!Array.isArray(value)) {
    issue(issues, "numbers.type", path, "must be an array");
    return;
  }
  const min = options.min ?? 1;
  const max = options.max ?? MAX_CHART_CATEGORIES;
  if (value.length < min || value.length > max) {
    issue(
      issues,
      "numbers.length",
      path,
      `must contain ${min} to ${max} values`,
    );
  }
  value.forEach((item, index) => {
    // NaN (or null, its JSON form) is a gap: a category this series has no
    // value for, drawn as an empty point, never as 0.
    if (item === null || (typeof item === "number" && Number.isNaN(item))) return;
    if (typeof item !== "number" || !Number.isFinite(item)) {
      issue(
        issues,
        "number.finite",
        `${path}[${index}]`,
        "must be a finite number",
      );
    } else if (options.nonNegative && item < 0) {
      issue(
        issues,
        "number.non_negative",
        `${path}[${index}]`,
        "must be zero or greater",
      );
    }
  });
}

function validateTextArray(
  value: unknown,
  path: string,
  issues: ChartValidationIssue[],
) {
  if (!Array.isArray(value)) {
    issue(issues, "labels.type", path, "must be an array");
    return;
  }
  if (value.length < 1 || value.length > MAX_CHART_CATEGORIES) {
    issue(
      issues,
      "labels.length",
      path,
      `must contain 1 to ${MAX_CHART_CATEGORIES} labels`,
    );
  }
  value.forEach((item, index) =>
    validateText(item, `${path}[${index}]`, issues),
  );
}

function validateCategoryLevels(
  value: unknown,
  count: number,
  issues: ChartValidationIssue[],
) {
  const path = "data.categoryLevels";
  if (!Array.isArray(value)) {
    issue(issues, "category_levels.type", path, "must be an array of levels");
    return;
  }
  if (count === 0) {
    issue(
      issues,
      "category_levels.empty_plot",
      path,
      "a chart with no categories has no category levels",
    );
    return;
  }
  if (value.length < 1 || value.length > MAX_CHART_CATEGORY_LEVELS) {
    issue(
      issues,
      "category_levels.length",
      path,
      `must contain 1 to ${MAX_CHART_CATEGORY_LEVELS} levels`,
    );
  }
  value.forEach((level, index) => {
    const levelPath = `${path}[${index}]`;
    if (!Array.isArray(level)) {
      issue(issues, "category_levels.level", levelPath, "must be an array of labels");
      return;
    }
    if (level.length !== count) {
      issue(
        issues,
        "category_levels.alignment",
        levelPath,
        `must contain exactly ${count} labels, one per category`,
      );
    }
    level.forEach((label, at) => validateText(label, `${levelPath}[${at}]`, issues));
  });
}

function validateNamedSeries(
  value: unknown,
  valueKey: "values" | "yValues",
  path: string,
  issues: ChartValidationIssue[],
  expectedLength?: number,
) {
  if (!Array.isArray(value)) {
    issue(issues, "series.type", path, "must be an array");
    return;
  }
  if (value.length < 1 || value.length > MAX_CHART_SERIES) {
    issue(
      issues,
      "series.length",
      path,
      `must contain 1 to ${MAX_CHART_SERIES} series`,
    );
  }
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) {
      issue(issues, "series.item", itemPath, "must be an object");
      return;
    }
    validateText(item.name, `${itemPath}.name`, issues, { required: true });
    validateFiniteArray(item[valueKey], `${itemPath}.${valueKey}`, issues);
    if (expectedLength !== undefined && Array.isArray(item[valueKey])) {
      if (item[valueKey].length !== expectedLength) {
        issue(
          issues,
          "series.alignment",
          `${itemPath}.${valueKey}`,
          `must contain exactly ${expectedLength} values`,
        );
      }
    }
  });
}

const STOCK_ROLES_BY_SUBTYPE: Record<string, readonly StockRole[]> = {
  highLowClose: ["high", "low", "close"],
  openHighLowClose: ["open", "high", "low", "close"],
  volumeHighLowClose: ["volume", "high", "low", "close"],
  volumeOpenHighLowClose: ["volume", "open", "high", "low", "close"],
};

export function validateChartData(
  family: ChartFamily,
  subtype: ChartSubtype,
  data: unknown,
): ChartValidationResult {
  const issues: ChartValidationIssue[] = [];
  const definition = chartSubtypeDefinition(family, subtype);
  if (!definition) {
    issue(
      issues,
      "subtype.family",
      "chartSubtype",
      `subtype ${String(subtype)} does not belong to ${family}`,
    );
    return { valid: false, issues };
  }
  if (!isRecord(data)) {
    issue(issues, "data.type", "data", "must be an object");
    return { valid: false, issues };
  }
  if (data.kind !== definition.dataKind) {
    issue(
      issues,
      "data.kind",
      "data.kind",
      `must be ${definition.dataKind} for ${family}/${subtype}`,
    );
    return { valid: false, issues };
  }

  if (definition.dataKind === "category") {
    const categories = data.categories;
    // Office allows a chart with no series at all (an empty plot); it has no
    // categories either, since only a series references them.
    const emptyPlot =
      Array.isArray(categories) &&
      categories.length === 0 &&
      Array.isArray(data.series) &&
      data.series.length === 0;
    if (!emptyPlot) {
      validateTextArray(categories, "data.categories", issues);
      validateNamedSeries(
        data.series,
        "values",
        "data.series",
        issues,
        Array.isArray(categories) ? categories.length : undefined,
      );
    }
    if (data.categoryLevels !== undefined) {
      validateCategoryLevels(
        data.categoryLevels,
        emptyPlot || !Array.isArray(categories) ? 0 : categories.length,
        issues,
      );
    }
    if (Array.isArray(data.series)) {
      // A pie keeps several series as Office does (it draws the first; a
      // doughnut draws each as a ring); a funnel holds one.
      if (
        family === "funnel" &&
        data.series.some(
          (entry) =>
            isRecord(entry) &&
            Array.isArray(entry.values) &&
            entry.values.some(isChartBlankValue),
        )
      ) {
        // Every stage of a funnel is drawn: it takes no blank point.
        issue(issues, "funnel.blank", "data.series", "a funnel's values must be numbers");
      }
      const expectedSeries = family === "funnel" ? 1 : undefined;
      if (expectedSeries && !emptyPlot && data.series.length !== expectedSeries) {
        issue(
          issues,
          "series.cardinality",
          "data.series",
          `${family} charts require exactly one series`,
        );
      }
      if (family === "combo" && data.series.length < 2) {
        issue(
          issues,
          "series.cardinality",
          "data.series",
          "combo charts require at least two series",
        );
      }
      // The twin of `ChartAttrsV2`: Clustered Column - Line on Secondary Axis
      // states the series it puts on that axis; one that lost it (new data
      // written without the preset's mapping) was refused at the save.
      if (
        family === "combo" &&
        subtype === "columnLineSecondary" &&
        !data.series.some((entry) => isRecord(entry) && entry.axis === "secondary")
      ) {
        issue(
          issues,
          "combo.secondary_series",
          "data.series",
          "columnLineSecondary requires a secondary-axis series",
        );
      }
      if (
        family === "combo" &&
        comboBarAxisRefusal(data.series.filter(isRecord)) !== null
      ) {
        issue(
          issues,
          "combo.bar_axis",
          "data.series",
          "a combination's bars take an axis group of their own",
        );
      }
      data.series.forEach((entry, index) => {
        if (!isRecord(entry)) return;
        validateSeriesNumberFormat(entry.numberFormat, `data.series[${index}].numberFormat`, issues);
        if (entry.renderAs !== undefined && !isComboRenderAs(entry.renderAs)) {
          issue(
            issues,
            "combo.render_as",
            `data.series[${index}].renderAs`,
            "must be column, bar, line, area, scatter, pie or doughnut",
          );
        }
        // The twin of `CategorySeries.x_values`: a combination's scatter
        // series alone states its X values, one per point.
        if (entry.xValues !== undefined) {
          validateFiniteArray(entry.xValues, `data.series[${index}].xValues`, issues);
          if (
            family !== "combo" ||
            entry.renderAs !== "scatter" ||
            !Array.isArray(entry.xValues) ||
            !Array.isArray(entry.values) ||
            entry.xValues.length !== entry.values.length
          ) {
            issue(
              issues,
              "combo.x_values",
              `data.series[${index}].xValues`,
              "X values belong to a combination's scatter series, one per point",
            );
          }
        }
        if (
          entry.axis !== undefined &&
          entry.axis !== "primary" &&
          entry.axis !== "secondary"
        ) {
          issue(
            issues,
            "combo.axis",
            `data.series[${index}].axis`,
            "must be primary or secondary",
          );
        }
        // The twin of `ChartAttrsV2`: "renderAs/axis are valid only for
        // combo charts". A series of any other type is drawn as that type.
        // A bar chart's series may name their axis (Plot Series On:
        // Secondary Axis); only a combination names how each is drawn.
        if (
          family !== "combo" &&
          (entry.renderAs !== undefined || (entry.axis !== undefined && family !== "bar"))
        ) {
          issue(
            issues,
            "combo.family",
            `data.series[${index}]`,
            "renderAs and axis belong to a combo chart's series",
          );
        }
        if (
          family === "combo" &&
          subtype === "custom" &&
          (entry.renderAs === undefined || entry.axis === undefined)
        ) {
          issue(
            issues,
            "combo.custom_mapping",
            `data.series[${index}]`,
            "custom combo series require both renderAs and axis",
          );
        }
      });
    }
  } else if (definition.dataKind === "xy") {
    validateNamedSeries(data.series, "yValues", "data.series", issues);
    if (Array.isArray(data.series)) {
      data.series.forEach((entry, index) => {
        if (!isRecord(entry)) return;
        validateSeriesNumberFormat(entry.numberFormat, `data.series[${index}].numberFormat`, issues);
        validateFiniteArray(
          entry.xValues,
          `data.series[${index}].xValues`,
          issues,
        );
        if (
          Array.isArray(entry.xValues) &&
          Array.isArray(entry.yValues) &&
          entry.xValues.length !== entry.yValues.length
        ) {
          issue(
            issues,
            "xy.alignment",
            `data.series[${index}]`,
            "xValues and yValues must have equal length",
          );
        }
        const bubble = subtype === "bubble" || subtype === "bubble3d";
        // The twin of `ChartAttrsV2`: "bubbleSizes are valid only for bubble
        // charts" (`c:bubbleSize` is CT_BubbleSer's alone).
        if (!bubble && entry.bubbleSizes !== undefined) {
          issue(
            issues,
            "bubble.family",
            `data.series[${index}].bubbleSizes`,
            "bubble sizes belong to a bubble chart",
          );
        }
        if (entry.axis !== undefined && entry.axis !== "primary" && entry.axis !== "secondary") {
          issue(issues, "xy.axis", `data.series[${index}].axis`, "must be primary or secondary");
        }
        if (bubble) {
          validateFiniteArray(
            entry.bubbleSizes,
            `data.series[${index}].bubbleSizes`,
            issues,
            { nonNegative: true },
          );
          if (
            Array.isArray(entry.xValues) &&
            Array.isArray(entry.bubbleSizes) &&
            entry.xValues.length !== entry.bubbleSizes.length
          ) {
            issue(
              issues,
              "bubble.alignment",
              `data.series[${index}].bubbleSizes`,
              "bubbleSizes must align with xValues",
            );
          }
        }
      });
    }
  } else if (definition.dataKind === "stock") {
    validateTextArray(data.categories, "data.categories", issues);
    const count = Array.isArray(data.categories)
      ? data.categories.length
      : undefined;
    if (data.categoryLevels !== undefined) {
      validateCategoryLevels(data.categoryLevels, count ?? 0, issues);
    }
    if (!Array.isArray(data.series)) {
      issue(issues, "series.type", "data.series", "must be an array");
    } else {
      const expectedRoles = STOCK_ROLES_BY_SUBTYPE[subtype] ?? [];
      const seen = new Set<StockRole>();
      data.series.forEach((entry, index) => {
        const path = `data.series[${index}]`;
        if (!isRecord(entry)) {
          issue(issues, "series.item", path, "must be an object");
          return;
        }
        validateText(entry.name, `${path}.name`, issues, { required: true });
        if (
          !(["volume", "open", "high", "low", "close"] as const).includes(
            entry.role as StockRole,
          )
        ) {
          issue(
            issues,
            "stock.role",
            `${path}.role`,
            "has an unknown stock role",
          );
        } else if (seen.has(entry.role as StockRole)) {
          issue(
            issues,
            "stock.duplicate_role",
            `${path}.role`,
            "stock roles must be unique",
          );
        } else {
          seen.add(entry.role as StockRole);
        }
        validateFiniteArray(entry.values, `${path}.values`, issues, {
          nonNegative: entry.role === "volume",
        });
        validateSeriesNumberFormat(entry.numberFormat, `${path}.numberFormat`, issues);
        if (
          count !== undefined &&
          Array.isArray(entry.values) &&
          entry.values.length !== count
        ) {
          issue(
            issues,
            "series.alignment",
            `${path}.values`,
            `must contain exactly ${count} values`,
          );
        }
      });
      const actualRoles = [...seen].sort();
      const wantedRoles = [...expectedRoles].sort();
      if (JSON.stringify(actualRoles) !== JSON.stringify(wantedRoles)) {
        issue(
          issues,
          "stock.roles",
          "data.series",
          `requires exactly these roles: ${expectedRoles.join(", ")}`,
        );
      }
      // No order is asked of a day's prices: Excel draws a stock chart whose
      // high is below its low or close (the high-low line joins the two
      // values, the close tick sits where the close is), so such a workbook
      // stays a stock chart to edit (twin of `document_charts.ChartAttrsV2`).
    }
  } else if (definition.dataKind === "waterfall") {
    validateTextArray(data.categories, "data.categories", issues);
    validateFiniteArray(data.values, "data.values", issues);
    const count = Array.isArray(data.categories)
      ? data.categories.length
      : undefined;
    if (
      count !== undefined &&
      Array.isArray(data.values) &&
      data.values.length !== count
    ) {
      issue(
        issues,
        "waterfall.alignment",
        "data.values",
        "must align with categories",
      );
    }
    if (!Array.isArray(data.pointKinds)) {
      issue(issues, "waterfall.kinds", "data.pointKinds", "must be an array");
    } else {
      if (count !== undefined && data.pointKinds.length !== count) {
        issue(
          issues,
          "waterfall.alignment",
          "data.pointKinds",
          "must align with categories",
        );
      }
      data.pointKinds.forEach((value, index) => {
        if (
          !(["value", "subtotal", "total"] as const).includes(
            value as WaterfallPointKind,
          )
        ) {
          issue(
            issues,
            "waterfall.kind",
            `data.pointKinds[${index}]`,
            "has an unknown point kind",
          );
        }
      });
    }
  } else if (definition.dataKind === "hierarchy") {
    if (!Array.isArray(data.points)) {
      issue(issues, "hierarchy.points", "data.points", "must be an array");
    } else {
      if (data.points.length < 1 || data.points.length > MAX_CHART_CATEGORIES) {
        issue(
          issues,
          "hierarchy.length",
          "data.points",
          `must contain 1 to ${MAX_CHART_CATEGORIES} points`,
        );
      }
      const ids = new Set<string>();
      const parents = new Map<string, string | undefined>();
      data.points.forEach((entry, index) => {
        const path = `data.points[${index}]`;
        if (!isRecord(entry)) {
          issue(issues, "hierarchy.point", path, "must be an object");
          return;
        }
        validateText(entry.id, `${path}.id`, issues, { required: true });
        validateText(entry.label, `${path}.label`, issues, { required: true });
        if (
          typeof entry.value !== "number" ||
          !Number.isFinite(entry.value) ||
          entry.value < 0
        ) {
          issue(
            issues,
            "hierarchy.value",
            `${path}.value`,
            "must be a finite non-negative number",
          );
        }
        if (typeof entry.id === "string") {
          if (ids.has(entry.id))
            issue(
              issues,
              "hierarchy.duplicate",
              `${path}.id`,
              "ids must be unique",
            );
          ids.add(entry.id);
          parents.set(
            entry.id,
            typeof entry.parentId === "string" && entry.parentId
              ? entry.parentId
              : undefined,
          );
        }
        if (entry.parentId !== undefined)
          validateText(entry.parentId, `${path}.parentId`, issues);
      });
      parents.forEach((parentId, id) => {
        if (parentId && !ids.has(parentId))
          issue(
            issues,
            "hierarchy.parent",
            `data.points.${id}.parentId`,
            "must reference an existing point",
          );
        const visited = new Set<string>([id]);
        let cursor = parentId;
        while (cursor) {
          if (visited.has(cursor)) {
            issue(
              issues,
              "hierarchy.cycle",
              `data.points.${id}`,
              "hierarchy must not contain a cycle",
            );
            break;
          }
          visited.add(cursor);
          cursor = parents.get(cursor);
        }
      });
    }
  } else if (definition.dataKind === "sample") {
    validateNamedSeries(data.series, "values", "data.series", issues);
    if (data.categories !== undefined) {
      validateTextArray(data.categories, "data.categories", issues);
      const only = Array.isArray(data.series) && data.series.length === 1 && isRecord(data.series[0])
        ? data.series[0].values
        : undefined;
      if (!Array.isArray(only) || !Array.isArray(data.categories) || only.length !== data.categories.length) {
        issue(issues, "sample.categories", "data.categories", "must name each value of the one series");
      }
    }
  } else if (definition.dataKind === "matrix") {
    validateTextArray(data.xCategories, "data.xCategories", issues);
    validateTextArray(data.yCategories, "data.yCategories", issues);
    const width = Array.isArray(data.xCategories)
      ? data.xCategories.length
      : undefined;
    const height = Array.isArray(data.yCategories)
      ? data.yCategories.length
      : undefined;
    if (!Array.isArray(data.values)) {
      issue(issues, "matrix.values", "data.values", "must be an array of rows");
    } else {
      if (height !== undefined && data.values.length !== height) {
        issue(
          issues,
          "matrix.height",
          "data.values",
          "row count must align with yCategories",
        );
      }
      data.values.forEach((row, index) => {
        validateFiniteArray(row, `data.values[${index}]`, issues);
        if (width !== undefined && Array.isArray(row) && row.length !== width) {
          issue(
            issues,
            "matrix.width",
            `data.values[${index}]`,
            "column count must align with xCategories",
          );
        }
      });
    }
  } else if (definition.dataKind === "map") {
    if (!Array.isArray(data.regions)) {
      issue(issues, "map.regions", "data.regions", "must be an array");
    } else {
      if (
        data.regions.length < 1 ||
        data.regions.length > MAX_CHART_CATEGORIES
      ) {
        issue(
          issues,
          "map.length",
          "data.regions",
          `must contain 1 to ${MAX_CHART_CATEGORIES} regions`,
        );
      }
      const ids = new Set<string>();
      data.regions.forEach((entry, index) => {
        const path = `data.regions[${index}]`;
        if (!isRecord(entry)) {
          issue(issues, "map.region", path, "must be an object");
          return;
        }
        validateText(entry.id, `${path}.id`, issues, { required: true });
        validateText(entry.label, `${path}.label`, issues, { required: true });
        if (typeof entry.id === "string") {
          if (!/^\d{3}$/.test(entry.id)) {
            issue(
              issues,
              "map.region_code",
              `${path}.id`,
              "must be a three-digit ISO 3166-1 numeric code",
            );
          }
          if (ids.has(entry.id))
            issue(
              issues,
              "map.duplicate",
              `${path}.id`,
              "region ids must be unique",
            );
          ids.add(entry.id);
        }
        if (typeof entry.value !== "number" || !Number.isFinite(entry.value)) {
          issue(
            issues,
            "number.finite",
            `${path}.value`,
            "must be a finite number",
          );
        }
      });
    }
  }
  if (chartDataPointCount(data) > MAX_CHART_POINTS) {
    issue(
      issues,
      "data.points",
      "data",
      `must plot at most ${MAX_CHART_POINTS} values`,
    );
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Where each series and category of `after` stood in `before`, for
 * {@link chartFormatFollowingDataEdit}, when a chart's data is replaced
 * whole -- by its workbook, where a row or column was inserted or deleted.
 * A list that kept its length was edited in place: each entry keeps its
 * slot. One that grew or shrank is matched by name, in order, so a hidden
 * category stays with its own label: deleting the first row of the data
 * sheet hid the category after the hidden one (WUA 166). Null when the
 * data's kind changed or it is not a category chart's.
 */
export function chartDataEditOrigins(
  before: ChartData,
  after: ChartData,
): { series: (number | null)[]; categories: (number | null)[] } | null {
  if (before.kind !== "category" || after.kind !== "category") return null;
  const origins = (old: readonly string[], next: readonly string[]): (number | null)[] => {
    if (old.length === next.length) return next.map((_name, index) => index);
    const used = new Set<number>();
    return next.map((name) => {
      const at = old.findIndex((candidate, index) => !used.has(index) && candidate === name);
      if (at < 0) return null;
      used.add(at);
      return at;
    });
  };
  return {
    series: origins(
      before.series.map((series) => series.name),
      after.series.map((series) => series.name),
    ),
    categories: origins(chartCategoryFullNames(before), chartCategoryFullNames(after)),
  };
}

/**
 * Select Data edits a chart's series and categories by position, and the
 * format refers to them by position too: series and slice paint, the Chart
 * Filters' hidden series and categories, and a Quick Layout's data-label
 * overrides. `seriesOrigins[i]` (`categoryOrigins[i]`) is the position the
 * i-th entry had before the edit, or null for one the edit added; null
 * `categoryOrigins` leaves category references alone. Each reference follows
 * its entry to its new position (Excel's formatting stays with the series,
 * not with the slot), and one to an entry the edit removed is dropped.
 */
export function chartFormatFollowingDataEdit(
  format: ChartBlockFormat | undefined,
  seriesOrigins: readonly (number | null)[],
  categoryOrigins: readonly (number | null)[] | null,
): ChartBlockFormat | undefined {
  if (!format) return format;
  const destinations = (origins: readonly (number | null)[]) => {
    const to = new Map<number, number>();
    origins.forEach((origin, index) => {
      if (origin !== null) to.set(origin, index);
    });
    return to;
  };
  const seriesTo = destinations(seriesOrigins);
  const categoryTo = categoryOrigins ? destinations(categoryOrigins) : null;
  const category = (index: number): number | undefined =>
    categoryTo ? categoryTo.get(index) : index;
  const next: ChartBlockFormat = { ...format };
  // The first series' own trendline and error bars (`trendline`,
  // `errorBars`, `errorBarsX` and their paint) leave with it when the edit
  // removed that series: Office deletes a series' trendline and error bars
  // with the series, and the series that becomes first never had them.
  // (A series moved from the first place keeps them on the first place, as
  // before.)
  if (seriesOrigins.length > 0 && !seriesOrigins.includes(0)) {
    delete next.trendline;
    delete next.trendlineStyle;
    delete next.errorBars;
    delete next.errorBarStyle;
    delete next.errorBarsX;
    delete next.errorBarXStyle;
  }

  if (format.seriesStyles) {
    const styles = format.seriesStyles.flatMap((style) => {
      const to = seriesTo.get(style.seriesIndex);
      return to === undefined ? [] : [{ ...style, seriesIndex: to }];
    });
    if (styles.length) next.seriesStyles = styles;
    else delete next.seriesStyles;
  }
  if (format.seriesTrendlines) {
    // Each trendline follows its series; the first series' first one stays
    // `trendline` (as that key always has), one moved to the first place
    // without it becomes it.
    const moved = format.seriesTrendlines
      .flatMap((entry) => {
        const to = seriesTo.get(entry.seriesIndex);
        return to === undefined ? [] : [{ ...entry, seriesIndex: to }];
      })
      .sort((left, right) => left.seriesIndex - right.seriesIndex);
    if (!next.trendline && moved[0]?.seriesIndex === 0) {
      const [first] = moved.splice(0, 1);
      next.trendline = first.trendline;
      if (first.style) next.trendlineStyle = first.style;
      else delete next.trendlineStyle;
    }
    if (moved.length) next.seriesTrendlines = moved;
    else delete next.seriesTrendlines;
  }
  if (format.seriesErrorBars) {
    // Each series' bars follow it; bars moved to the first place become its
    // `errorBars` when it has none (the first series' are that key).
    const moved = format.seriesErrorBars
      .flatMap((entry) => {
        const to = seriesTo.get(entry.seriesIndex);
        return to === undefined ? [] : [{ ...entry, seriesIndex: to }];
      })
      .sort((left, right) => left.seriesIndex - right.seriesIndex);
    if (moved[0]?.seriesIndex === 0) {
      const [first] = moved.splice(0, 1);
      if (!next.errorBars) {
        next.errorBars = first.errorBars;
        if (first.style) next.errorBarStyle = first.style;
        else delete next.errorBarStyle;
      }
    }
    if (moved.length) next.seriesErrorBars = moved;
    else delete next.seriesErrorBars;
  }
  if (format.sliceStyles) {
    const styles = format.sliceStyles.flatMap((style) => {
      const to = category(style.pointIndex);
      const ring = seriesTo.get(style.seriesIndex ?? 0);
      if (to === undefined || ring === undefined) return [];
      const { seriesIndex: _ring, ...rest } = style;
      return [{ ...rest, ...(ring ? { seriesIndex: ring } : {}), pointIndex: to }];
    });
    if (styles.length) next.sliceStyles = styles;
    else delete next.sliceStyles;
  }
  // A filter keeps at least one entry plotted; one that would hide every
  // remaining entry (or none) is not stated at all.
  const hidden = (
    key: "hiddenSeries" | "hiddenCategories",
    move: (index: number) => number | undefined,
    count: number,
  ) => {
    const list = format[key];
    if (!list) return;
    const moved = list
      .map(move)
      .filter((index): index is number => index !== undefined)
      .sort((a, b) => a - b);
    if (moved.length && moved.length < count) next[key] = moved;
    else delete next[key];
  };
  hidden("hiddenSeries", (index) => seriesTo.get(index), seriesOrigins.length);
  if (categoryOrigins) {
    hidden("hiddenCategories", category, categoryOrigins.length);
  }
  if (format.dataLabelOverrides) {
    // A label follows its series and its point, as the paint does.
    const labels = format.dataLabelOverrides.flatMap((entry) => {
      const seriesIndex = seriesTo.get(entry.seriesIndex);
      const pointIndex = entry.pointIndex === undefined ? undefined : category(entry.pointIndex);
      if (seriesIndex === undefined) return [];
      if (entry.pointIndex !== undefined && pointIndex === undefined) return [];
      return [{ ...entry, seriesIndex, ...(pointIndex === undefined ? {} : { pointIndex }) }];
    });
    labels.sort(
      (left, right) =>
        left.seriesIndex - right.seriesIndex || (left.pointIndex ?? -1) - (right.pointIndex ?? -1),
    );
    if (labels.length) next.dataLabelOverrides = labels;
    else delete next.dataLabelOverrides;
  }
  if (format.layout) {
    const labels = format.layout.labels.flatMap((label) => {
      const seriesIndex = seriesTo.get(label.seriesIndex);
      const pointIndex =
        label.pointIndex === undefined ? undefined : category(label.pointIndex);
      if (seriesIndex === undefined) return [];
      if (label.pointIndex !== undefined && pointIndex === undefined) return [];
      return [
        {
          ...label,
          seriesIndex,
          ...(pointIndex === undefined ? {} : { pointIndex }),
        },
      ];
    });
    next.layout = { ...format.layout, labels };
  }
  return next;
}

export function validateChartBlockAttrsV2(
  value: unknown,
): ChartValidationResult {
  const issues: ChartValidationIssue[] = [];
  if (!isRecord(value)) {
    return {
      valid: false,
      issues: [
        {
          code: "attrs.type",
          path: "",
          message: "chart attrs must be an object",
        },
      ],
    };
  }
  if (value.schemaVersion !== 2)
    issue(issues, "schema.version", "schemaVersion", "must equal 2");
  if (!isChartFamily(value.chartType))
    issue(issues, "family.unknown", "chartType", "has an unknown chart family");
  if (!isChartSubtype(value.chartSubtype))
    issue(
      issues,
      "subtype.unknown",
      "chartSubtype",
      "has an unknown chart subtype",
    );
  if (isChartFamily(value.chartType) && isChartSubtype(value.chartSubtype)) {
    issues.push(
      ...validateChartData(value.chartType, value.chartSubtype, value.data)
        .issues,
    );
  }
  validateText(value.title, "title", issues);
  if (value.axisTitleX !== undefined) {
    validateText(value.axisTitleX, "axisTitleX", issues);
  }
  if (value.axisTitleY !== undefined) {
    validateText(value.axisTitleY, "axisTitleY", issues);
  }
  // A title of one plain run states no runs: absent, or null (the Docs chart
  // node's attribute after a title typed back to one run, or a pasted node
  // without the attribute) -- neither is a malformed value.
  if (
    value.titleRuns != null &&
    !normalizeChartTitleRuns(value.titleRuns, typeof value.title === "string" ? value.title : "")
  ) {
    issue(issues, "titleRuns", "titleRuns", "must be runs with a valid text format spelling the title");
  }
  if (isChartFamily(value.chartType)) {
    for (const [text, axis, path] of [
      [value.axisTitleX, "x", "axisTitleX"],
      [value.axisTitleY, "y", "axisTitleY"],
    ] as const) {
      if (
        typeof text === "string" &&
        text.length > 0 &&
        !chartSupportsAxisTitle(value.chartType, axis)
      ) {
        issue(
          issues,
          "axis_title.family",
          path,
          "this axis title is unavailable for this chart family",
        );
      }
    }
  }
  if (!isChartStylePreset(value.stylePreset))
    issue(
      issues,
      "style.unknown",
      "stylePreset",
      "has an unknown style preset",
    );
  if (value.format !== undefined) {
    if (!isRecord(value.format)) {
      issue(issues, "format.type", "format", "must be an object");
    } else {
      if (
        value.format.curve !== undefined &&
        value.format.curve !== "straight" &&
        value.format.curve !== "smooth"
      ) {
        issue(
          issues,
          "format.curve",
          "format.curve",
          "must be straight or smooth",
        );
      }
      if (
        value.format.legend !== undefined &&
        !CHART_LEGEND_POSITIONS_V2.includes(
          value.format.legend as ChartLegendPositionV2,
        )
      ) {
        issue(
          issues,
          "format.legend",
          "format.legend",
          "has an unknown legend position",
        );
      }
      for (const key of [
        "chartAreaStyle",
        "plotAreaStyle",
        "chartTitleStyle",
        "legendStyle",
        "backWallStyle",
        "sideWallStyle",
        "floorStyle",
        "dataLabelStyle",
        "dataLabelLeaderLineStyle",
        "dataTableStyle",
        "upBarStyle",
        "downBarStyle",
        "dropLineStyle",
        "highLowLineStyle",
        "seriesLineStyle",
      ] as const) {
        if (value.format[key] === undefined) continue;
        // The server refuses the page outright for these (`ChartAttrsV2`):
        // the chartEx part has no writer for an element style, so a style
        // the canvas drew would be lost in the file.
        if (
          !chartTakesAreaStyles(value.chartType) &&
          !(CHART_FRAME_STYLE_KEYS as readonly string[]).includes(key) &&
          !(key === "dataLabelStyle" && chartTakesElementTextOnly(value.chartType) && statesTextOnly(value.format[key]))
        ) {
          issue(
            issues,
            `format.${key}`,
            `format.${key}`,
            `is unavailable for ${String(value.chartType)} charts`,
          );
          continue;
        }
        const rawStyle = value.format[key];
        const style = normalizePresentationChartAreaStyle(rawStyle);
        if (
          !style ||
          !isRecord(rawStyle) ||
          Object.keys(rawStyle).some(
            (styleKey) =>
              styleKey !== "fill" &&
              styleKey !== "outline" &&
              styleKey !== "effect" &&
              styleKey !== "textFill" &&
              styleKey !== "textOutline" &&
              styleKey !== "textEffect" &&
              styleKey !== "textPaint" &&
              styleKey !== "shapePaint" &&
              styleKey !== "text",
          ) ||
          (rawStyle.fill !== undefined && style.fill === undefined) ||
          (rawStyle.outline !== undefined && style.outline === undefined) ||
          (rawStyle.effect !== undefined && style.effect === undefined) ||
          (rawStyle.textFill !== undefined && style.textFill === undefined) ||
          (rawStyle.textOutline !== undefined &&
            style.textOutline === undefined) ||
          (rawStyle.textEffect !== undefined && style.textEffect === undefined) ||
          (rawStyle.textPaint !== undefined && style.textPaint === undefined) ||
          (rawStyle.shapePaint !== undefined && style.shapePaint === undefined) ||
          (rawStyle.text !== undefined && style.text === undefined)
        ) {
          issue(
            issues,
            `format.${key}`,
            `format.${key}`,
            "must contain only bounded native paint and effect presets",
          );
        }
      }
      for (const key of [
        "chartAreaStyle",
        "plotAreaStyle",
        "legendStyle",
        "backWallStyle",
        "sideWallStyle",
        "floorStyle",
        "dataLabelStyle",
        "dataLabelLeaderLineStyle",
        "dataTableStyle",
        "trendlineStyle",
        "errorBarStyle",
        "errorBarXStyle",
        "upBarStyle",
        "downBarStyle",
        "dropLineStyle",
        "highLowLineStyle",
        "seriesLineStyle",
      ] as const) {
        const rawStyle = value.format[key];
        if (
          isRecord(rawStyle) &&
          (rawStyle.textFill !== undefined ||
            rawStyle.textOutline !== undefined ||
            rawStyle.textEffect !== undefined ||
            rawStyle.textPaint !== undefined)
        ) {
          issue(
            issues,
            `format.${key}.text`,
            `format.${key}`,
            "chart WordArt styling is limited to the chart title",
          );
        }
      }
      if (
        value.format.dataLabels !== undefined &&
        typeof value.format.dataLabels !== "boolean"
      ) {
        issue(
          issues,
          "format.data_labels",
          "format.dataLabels",
          "must be a boolean",
        );
      } else if (
        value.format.dataLabels === true &&
        !chartSupportsDataLabels(value.chartType)
      ) {
        issue(
          issues,
          "format.data_labels_family",
          "format.dataLabels",
          "is unavailable for this chart family",
        );
      }
      if (
        value.format.dataLabelPosition !== undefined &&
        !isChartDataLabelPosition(value.format.dataLabelPosition)
      ) {
        issue(
          issues,
          "format.data_label_position",
          "format.dataLabelPosition",
          "has an unknown data-label position",
        );
      } else if (
        value.format.dataLabelPosition !== undefined &&
        value.format.dataLabels !== true
      ) {
        issue(
          issues,
          "format.data_label_position_dependency",
          "format.dataLabelPosition",
          "requires visible data labels",
        );
      } else if (
        isChartFamily(value.chartType) &&
        isChartSubtype(value.chartSubtype) &&
        isChartDataLabelPosition(value.format.dataLabelPosition) &&
        // A family whose chart group may carry NO position at all is not a
        // rejection: pages saved before this contract knew still carry one on
        // an area chart or a doughnut, and refusing it here would stop such a
        // page opening. It is accepted on the way in and dropped on the way
        // out — neither the renderer nor the writer states it. A
        // combination's labels are each series group's (Inside Base on its
        // columns, Above on its lines), so its position is never one either
        // (R403-D17; the twin of `document_charts.ChartAttrsV2`).
        value.chartType !== "combo" &&
        chartDataLabelPositions(value.chartType, value.chartSubtype).length >
          0 &&
        !chartDataLabelPositions(value.chartType, value.chartSubtype).includes(
          value.format.dataLabelPosition,
        )
      ) {
        issue(
          issues,
          "format.data_label_position_family",
          "format.dataLabelPosition",
          "is unavailable for this chart family and subtype",
        );
      }
      if (
        value.format.dataLabelRegionLayout !== undefined &&
        !isChartMapLabelLayout(value.format.dataLabelRegionLayout)
      ) {
        issue(
          issues,
          "format.data_label_region_layout",
          "format.dataLabelRegionLayout",
          "has an unknown map-label layout",
        );
      } else if (
        value.format.dataLabelRegionLayout !== undefined &&
        chartMapLabelLayouts(value.chartType).length === 0
      ) {
        issue(
          issues,
          "format.data_label_region_layout_family",
          "format.dataLabelRegionLayout",
          "is unavailable for this chart family",
        );
      } else if (
        value.format.dataLabelRegionLayout !== undefined &&
        value.format.dataLabels !== true
      ) {
        // Office's Map labels control is one tri-state: its "None" member is
        // this contract's `dataLabels: false`, so a pick without visible labels
        // would be two ways of saying the same thing.
        issue(
          issues,
          "format.data_label_region_layout_dependency",
          "format.dataLabelRegionLayout",
          "requires visible data labels",
        );
      }
      if (
        value.format.colorPalette !== undefined &&
        !isChartColorPaletteId(value.format.colorPalette)
      ) {
        issue(
          issues,
          "format.color_palette",
          "format.colorPalette",
          "is not a palette of the Change Colors gallery",
        );
      } else if (
        value.format.colorPalette !== undefined &&
        !chartTakesColorPalette(value.chartType)
      ) {
        // A surface plot is painted by its height bands, never its series.
        issue(
          issues,
          "format.color_palette_family",
          "format.colorPalette",
          "is unavailable for this chart family",
        );
      }
      if (value.format.view3D !== undefined) {
        if (!normalizeChartView3D(value.format.view3D)) {
          issue(issues, "format.view_3d", "format.view3D", "is not a 3-D Rotation");
        } else if (!chartTakesView3D(value.chartType, value.chartSubtype)) {
          issue(issues, "format.view_3d_family", "format.view3D", "is unavailable for this chart type");
        }
      }
      // A 3-D chart's walls and floor: only a 3-D plot has them.
      for (const key of [...CHART_WALL_STYLE_KEYS, "wallThickness"] as const) {
        if (value.format[key] === undefined) continue;
        if (!chartTakesView3D(value.chartType, value.chartSubtype)) {
          issue(issues, "format.walls_3d_family", `format.${key}`, "is unavailable for this chart type");
        } else if (key === "wallThickness" && !normalizeChartWallThickness(value.format.wallThickness)) {
          issue(issues, "format.wall_thickness", "format.wallThickness", "must hold whole percentages 1..100 of backWall, sideWall, floor");
        }
      }
      if (value.format.layout !== undefined) {
        const layout = normalizeOfficeChartLayout(value.format.layout);
        const seriesCount =
          value.data && typeof value.data === "object" && "series" in value.data &&
          Array.isArray((value.data as { series?: unknown }).series)
            ? (value.data as { series: unknown[] }).series.length
            : 0;
        if (!layout) {
          issue(issues, "format.layout", "format.layout", "is not a Quick Layout of the shared catalogue");
        } else if (!officeChartTakesCalibratedLayouts(value.chartType, value.chartSubtype)) {
          // Excel's calibrated layouts are a 2-D column / bar chart's; no
          // other plot has a `c:gapWidth` and `c:overlap` to write them into.
          issue(issues, "format.layout_family", "format.layout", "is unavailable for this chart type");
        } else if (layout.labels.some((label) => label.seriesIndex >= seriesCount)) {
          issue(issues, "format.layout_label_series", "format.layout", "labels a series the chart does not have");
        }
      }
      for (const key of ["legendOverlay", "titleOverlay", "roundedCorners", "automaticTitle"] as const) {
        if (value.format[key] !== undefined && value.format[key] !== true) {
          issue(issues, `format.${key}`, `format.${key}`, "is only ever stated as true");
        }
      }
      if (
        value.format.bubbleScale !== undefined &&
        !(
          typeof value.format.bubbleScale === "number" &&
          Number.isInteger(value.format.bubbleScale) &&
          value.format.bubbleScale >= 0 &&
          value.format.bubbleScale <= 300
        )
      ) {
        issue(issues, "format.bubble_scale", "format.bubbleScale", "must be a whole percent from 0 to 300");
      }
      if (value.format.dataLabelWrap !== undefined && value.format.dataLabelWrap !== false) {
        issue(issues, "format.data_label_wrap", "format.dataLabelWrap", "must be false when stated");
      }
      if (
        value.format.dataLabelRotation !== undefined &&
        !(
          typeof value.format.dataLabelRotation === "number" &&
          Number.isInteger(value.format.dataLabelRotation) &&
          Math.abs(value.format.dataLabelRotation) <= 90
        )
      ) {
        issue(issues, "format.data_label_rotation", "format.dataLabelRotation", "must be whole degrees from -90 to 90");
      }
      if (
        value.format.titleAngle !== undefined &&
        !(
          typeof value.format.titleAngle === "number" &&
          Number.isInteger(value.format.titleAngle) &&
          Math.abs(value.format.titleAngle) <= 90
        )
      ) {
        issue(issues, "format.title_angle", "format.titleAngle", "must be whole degrees from -90 to 90");
      }
      if (
        value.format.ofPieSplitPosition !== undefined &&
        !(
          typeof value.format.ofPieSplitPosition === "number" &&
          Number.isInteger(value.format.ofPieSplitPosition) &&
          value.format.ofPieSplitPosition >= 1 &&
          value.format.ofPieSplitPosition <= 255
        )
      ) {
        issue(issues, "format.of_pie_split_position", "format.ofPieSplitPosition", "must be a whole count from 1 to 255");
      }
      const pieRefusal = chartPieOptionsRefusal(value.chartType, value.chartSubtype, value.format as Readonly<Record<string, unknown>>);
      if (pieRefusal) issue(issues, "format.pie_options", `format.${pieRefusal}`, "is unavailable or out of range for this chart");
      if (
        value.format.displayBlanksAs !== undefined &&
        !isChartDisplayBlanksAs(value.format.displayBlanksAs)
      ) {
        issue(
          issues,
          "format.display_blanks_as",
          "format.displayBlanksAs",
          "is not a Show empty cells as setting",
        );
      }
      if (
        value.format.binIntervalClosed !== undefined &&
        !isChartBinIntervalClosed(value.format.binIntervalClosed)
      ) {
        issue(
          issues,
          "format.bin_interval_closed",
          "format.binIntervalClosed",
          "has an unknown closed bucket side",
        );
      } else if (
        value.format.binIntervalClosed !== undefined &&
        !chartTakesBinIntervalClosed(value.chartType, value.chartSubtype)
      ) {
        // Only a histogram and a pareto carry `cx:binning`; no other family has
        // anywhere to write a closed side, so holding one would be a reading no
        // writer could restate.
        issue(
          issues,
          "format.bin_interval_closed_family",
          "format.binIntervalClosed",
          "is unavailable for this chart family and subtype",
        );
      }
      if (
        value.format.gapWidth !== undefined &&
        (!Number.isInteger(value.format.gapWidth) ||
          (value.format.gapWidth as number) < 0 ||
          (value.format.gapWidth as number) > 500 ||
          !chartTakesExtendedGapWidth(value.chartType, value.chartSubtype))
      ) {
        issue(issues, "format.gap_width", "format.gapWidth", "must be a whole percent 0-500 on a histogram, pareto or waterfall");
      }
      for (const [key, low, high] of [["barGapWidth", 0, 500], ["barOverlap", -100, 100]] as const) {
        if (
          value.format[key] !== undefined &&
          (!isWholeIn(value.format[key], low, high) ||
            !(
              chartTakesBarSpacing(value.chartType, value.chartSubtype) ||
              (key === "barGapWidth" && value.format.barOverlap === undefined && chartTakes3DGapWidth(value.chartType, value.chartSubtype))
            ))
        ) {
          issue(issues, `format.${key}`, `format.${key}`, `must be a whole percent ${low}-${high} on a 2-D column or bar chart`);
        }
      }
      if (
        value.format.gapDepth !== undefined &&
        (!isWholeIn(value.format.gapDepth, 0, 500) || !chartTakesGapDepth(value.chartType, value.chartSubtype))
      ) {
        issue(issues, "format.gap_depth", "format.gapDepth", "must be a whole percent 0-500 on a 3-D column, bar, line or area chart");
      }
      if (
        (value.format.barShape !== undefined ||
          (Array.isArray(value.format.seriesStyles) &&
            value.format.seriesStyles.some((style) => isRecord(style) && style.barShape !== undefined))) &&
        (!(value.format.barShape === undefined || isChartBarShape(value.format.barShape)) ||
          !chartTakesBarShape(value.chartType, value.chartSubtype))
      ) {
        issue(issues, "format.bar_shape", "format.barShape", "must be a column shape on a 3-D column or bar chart");
      }
      for (const [key, low, high] of [["secondaryBarGapWidth", 0, 500], ["secondaryBarOverlap", -100, 100]] as const) {
        if (
          value.format[key] !== undefined &&
          (!isWholeIn(value.format[key], low, high) ||
            !chartTakesSecondaryBarSpacing(value.chartType, value.chartSubtype, value.data))
        ) {
          issue(issues, `format.${key}`, `format.${key}`, `must be a whole percent ${low}-${high} on a column or bar group on the secondary axis`);
        }
      }
      if (
        value.format.comboColumnGrouping !== undefined &&
        (value.format.comboColumnGrouping !== "stacked" ||
          value.chartType !== "combo" ||
          !isRecord(value.data) ||
          !Array.isArray(value.data.series) ||
          !value.data.series.some(
            (entry) => isRecord(entry) && (entry.renderAs === undefined || entry.renderAs === "column"),
          ))
      ) {
        issue(
          issues,
          "format.combo_column_grouping",
          "format.comboColumnGrouping",
          "a stacked column group belongs to a combination with a column series",
        );
      }
      if (
        value.format.histogramBins !== undefined &&
        normalizeChartHistogramBins(value.format.histogramBins) === undefined
      ) {
        issue(
          issues,
          "format.histogram_bins",
          "format.histogramBins",
          "is not a histogram's Bins setting",
        );
      } else if (
        value.format.histogramBins !== undefined &&
        !chartTakesBinIntervalClosed(value.chartType, value.chartSubtype)
      ) {
        // Only a histogram and a pareto carry `cx:binning`.
        issue(
          issues,
          "format.histogram_bins_family",
          "format.histogramBins",
          "is unavailable for this chart family and subtype",
        );
      }
      if (
        value.format.parentLabelLayout !== undefined &&
        !isChartParentLabelLayout(value.format.parentLabelLayout)
      ) {
        issue(
          issues,
          "format.parent_label_layout",
          "format.parentLabelLayout",
          "is not a treemap's Label Options",
        );
      } else if (
        value.format.parentLabelLayout !== undefined &&
        !chartTakesParentLabelLayout(value.chartType, value.chartSubtype)
      ) {
        issue(
          issues,
          "format.parent_label_layout_family",
          "format.parentLabelLayout",
          "is unavailable for this chart family and subtype",
        );
      }
      if (
        value.format.boxWhisker !== undefined &&
        normalizeChartBoxWhisker(value.format.boxWhisker) === undefined
      ) {
        issue(issues, "format.box_whisker", "format.boxWhisker", "is not a box plot's Series Options");
      } else if (
        value.format.boxWhisker !== undefined &&
        !chartTakesBoxWhisker(value.chartType, value.chartSubtype)
      ) {
        issue(
          issues,
          "format.box_whisker_family",
          "format.boxWhisker",
          "is unavailable for this chart family and subtype",
        );
      }
      const dataLabelContentKeys = [
        "dataLabelValue",
        "dataLabelLegendKey",
        "dataLabelCategoryName",
        "dataLabelSeriesName",
        "dataLabelPercentage",
        "dataLabelBubbleSize",
      ] as const;
      // The callback cannot see the isRecord narrowing of `value.format`.
      const recordFormat = value.format;
      const hasExplicitDataLabelContent = dataLabelContentKeys.some(
        (key) => recordFormat[key] !== undefined,
      );
      for (const key of dataLabelContentKeys) {
        if (
          value.format[key] !== undefined &&
          typeof value.format[key] !== "boolean"
        ) {
          issue(issues, `format.${key}`, `format.${key}`, "must be a boolean");
        }
      }
      if (
        (hasExplicitDataLabelContent ||
          value.format.dataLabelSeparator !== undefined) &&
        value.format.dataLabels !== true
      ) {
        issue(
          issues,
          "format.data_label_content_dependency",
          "format.dataLabelValue",
          "requires visible data labels",
        );
      }
      const visibleDataLabelFieldCount = [
        value.format.dataLabelValue !== false,
        value.format.dataLabelLegendKey === true,
        value.format.dataLabelCategoryName === true,
        value.format.dataLabelSeriesName === true,
        value.format.dataLabelPercentage === true,
        value.format.dataLabelBubbleSize === true,
      ].filter(Boolean).length;
      const visibleTextDataLabelFieldCount = [
        value.format.dataLabelValue !== false,
        value.format.dataLabelCategoryName === true,
        value.format.dataLabelSeriesName === true,
        value.format.dataLabelPercentage === true,
        value.format.dataLabelBubbleSize === true,
      ].filter(Boolean).length;
      if (
        value.format.dataLabels === true &&
        visibleDataLabelFieldCount === 0
      ) {
        issue(
          issues,
          "format.data_label_content_empty",
          "format.dataLabelValue",
          "at least one label field must remain visible",
        );
      }
      // On an X Y chart the category-name switch (`c:showCatName`) is
      // Office's "X Value": the point's x (Format Data Labels).
      if (
        value.format.dataLabelPercentage === true &&
        value.chartType !== "pie"
      ) {
        issue(
          issues,
          "format.data_label_percentage_family",
          "format.dataLabelPercentage",
          "percentage labels are available only for pie charts",
        );
      }
      if (
        value.format.dataLabelBubbleSize === true &&
        !(
          value.chartType === "xy" &&
          (value.chartSubtype === "bubble" || value.chartSubtype === "bubble3d")
        )
      ) {
        issue(
          issues,
          "format.data_label_bubble_family",
          "format.dataLabelBubbleSize",
          "bubble-size labels require a bubble chart",
        );
      }
      if (
        value.format.dataLabelSeparator !== undefined &&
        !isChartDataLabelSeparator(value.format.dataLabelSeparator)
      ) {
        issue(
          issues,
          "format.data_label_separator",
          "format.dataLabelSeparator",
          "has an unsupported separator",
        );
      } else if (
        value.format.dataLabelSeparator !== undefined &&
        visibleTextDataLabelFieldCount < 2
      ) {
        issue(
          issues,
          "format.data_label_separator_dependency",
          "format.dataLabelSeparator",
          "requires at least two visible label fields",
        );
      }
      for (const key of ["gridlinesX", "gridlinesY"] as const) {
        if (
          value.format[key] !== undefined &&
          typeof value.format[key] !== "boolean"
        ) {
          issue(issues, `format.${key}`, `format.${key}`, "must be a boolean");
        }
      }
      if (value.format.hiddenSeries !== undefined) {
        const hidden = value.format.hiddenSeries as unknown;
        const count =
          isRecord(value.data) && Array.isArray(value.data.series)
            ? value.data.series.length
            : 0;
        if (
          !chartSupportsSeriesFilter(value.chartType) ||
          !Array.isArray(hidden) ||
          hidden.length === 0 ||
          // A chart keeps one series plotted; a combination may be down to
          // one too, its other group's series filtered (PPT-B141).
          hidden.length > count - 1 ||
          hidden.some(
            (index, at) =>
              !Number.isInteger(index) ||
              index < 0 ||
              index >= count ||
              (at > 0 && index <= (hidden[at - 1] as number)),
          )
        ) {
          issue(
            issues,
            "format.hidden_series",
            "format.hiddenSeries",
            "must name sorted series positions of a filterable chart and leave one plotted",
          );
        }
      }
      if (value.format.hiddenCategories !== undefined) {
        const hidden = value.format.hiddenCategories as unknown;
        const count =
          isRecord(value.data) && Array.isArray(value.data.categories)
            ? value.data.categories.length
            : 0;
        if (
          !chartSupportsCategoryFilter(value.chartType) ||
          !Array.isArray(hidden) ||
          hidden.length === 0 ||
          hidden.length >= count ||
          hidden.some(
            (index, at) =>
              !Number.isInteger(index) ||
              index < 0 ||
              index >= count ||
              (at > 0 && index <= (hidden[at - 1] as number)),
          )
        ) {
          issue(
            issues,
            "format.hidden_categories",
            "format.hiddenCategories",
            "must name sorted category positions of a filterable chart and leave one plotted",
          );
        }
      }
      if (
        value.format.text !== undefined &&
        normalizeOfficeChartText(value.format.text) === undefined
      ) {
        issue(
          issues,
          "format.text",
          "format.text",
          "must be a bounded chart text: font family, size in points, bold, italic, underline and colour",
        );
      }
      if (
        value.format.seriesAxisTitle !== undefined &&
        (typeof value.format.seriesAxisTitle !== "string" ||
          value.format.seriesAxisTitle.trim().length === 0 ||
          value.format.seriesAxisTitle.length > 200 ||
          !chartHasDepthAxis(value.chartType, value.chartSubtype))
      ) {
        issue(
          issues,
          "format.series_axis_title",
          "format.seriesAxisTitle",
          "must be words, on a 3-D chart with a depth axis",
        );
      }
      if (
        value.format.secondaryValueGridlines !== undefined ||
        value.format.secondaryValueAxisTitle !== undefined ||
        value.format.secondaryValueAxis !== undefined
      ) {
        if (
          (value.format.secondaryValueGridlines !== undefined &&
            typeof value.format.secondaryValueGridlines !== "boolean") ||
          (value.format.secondaryValueAxis !== undefined &&
            typeof value.format.secondaryValueAxis !== "boolean") ||
          (value.format.secondaryValueAxisTitle !== undefined &&
            (typeof value.format.secondaryValueAxisTitle !== "string" ||
              value.format.secondaryValueAxisTitle.length === 0 ||
              value.format.secondaryValueAxisTitle.length > 200)) ||
          !chartHasSecondaryValueAxis(value.chartType, value.chartSubtype, value.data)
        ) {
          issue(
            issues,
            "format.secondary_value_axis",
            "format.secondaryValueGridlines",
            "the secondary value axis belongs to a chart that draws one",
          );
        }
      }
      for (const key of ["minorGridlinesX", "minorGridlinesY"] as const) {
        if (value.format[key] === undefined) continue;
        if (typeof value.format[key] !== "boolean") {
          issue(issues, `format.${key}`, `format.${key}`, "must be a boolean");
        } else if (!chartSupportsMinorGridlines(value.chartType, value.chartSubtype)) {
          issue(
            issues,
            "format.minor_gridlines_family",
            `format.${key}`,
            "minor gridlines are stated by the calibrated layout or unavailable for this chart",
          );
        }
      }
      if (value.format.seriesStyles !== undefined) {
        const seriesStyles = normalizePresentationChartSeriesStyles(
          value.format.seriesStyles,
        );
        const seriesCount =
          isRecord(value.data) &&
          Array.isArray(value.data.series) &&
          value.data.series.length > 0
            ? value.data.series.length
            : isRecord(value.data) && Array.isArray(value.data.yCategories)
              ? value.data.yCategories.length
              : 0;
        if (
          !seriesStyles ||
          // The twin of `document_charts.CHART_SERIES_STYLE_FAMILIES`: a
          // treemap, sunburst, histogram, Pareto, box plot, waterfall or map
          // colours by point or by its Chart Colors part, and the save
          // refused a series paint on one for the whole page.
          !chartTakesSeriesStyles(value.chartType) ||
          seriesStyles.some((style) => style.seriesIndex >= seriesCount) ||
          (Array.isArray(value.format.seriesStyles) &&
            value.format.seriesStyles.some(
              (raw) =>
                isRecord(raw) &&
                (Object.keys(raw).some(key => !["seriesIndex", "fill", "outline", "effect", "shapePaint", "marker", "smooth", "barShape"].includes(key)) ||
                raw.effect !== undefined &&
                normalizePresentationChartEffectPreset(raw.effect) === undefined),
            ))
        ) {
          issue(
            issues,
            "format.seriesStyles",
            "format.seriesStyles",
            "must address each existing series at most once with native paint",
          );
        } else {
          // A series' own marker and curve belong to a series that draws
          // them (`chartSeriesTakesMarker` / `chartSeriesTakesSmooth`).
          const listed =
            isRecord(value.data) &&
            (value.data.kind === "category" || value.data.kind === "xy") &&
            Array.isArray(value.data.series)
              ? (value.data.series as unknown[])
              : [];
          seriesStyles.forEach((style) => {
            if (style.marker === undefined && style.smooth === undefined) return;
            const entry = listed[style.seriesIndex];
            const renderAs = chartSeriesRenderAs(
              value.chartType,
              value.chartSubtype,
              isRecord(entry) ? entry.renderAs : undefined,
              style.seriesIndex,
              listed.length,
            );
            if (
              style.marker !== undefined &&
              !chartSeriesTakesMarker(value.chartType, value.chartSubtype, renderAs)
            ) {
              issue(
                issues,
                "format.seriesStyles.marker",
                `format.seriesStyles[${style.seriesIndex}].marker`,
                "markers belong to a line, scatter, radar or combination line series",
              );
            }
            if (
              style.smooth !== undefined &&
              !chartSeriesTakesSmooth(value.chartType, value.chartSubtype, renderAs)
            ) {
              issue(
                issues,
                "format.seriesStyles.smooth",
                `format.seriesStyles[${style.seriesIndex}].smooth`,
                "a smoothed line belongs to a line, scatter or combination line series",
              );
            }
          });
        }
      }
      if (value.format.sliceStyles !== undefined) {
        const sliceStyles = normalizePresentationChartSliceStyles(
          value.format.sliceStyles,
        );
        const categoryCount =
          isRecord(value.data) && Array.isArray(value.data.categories)
            ? value.data.categories.length
            : 0;
        const pieSeriesCount =
          isRecord(value.data) && Array.isArray(value.data.series)
            ? value.data.series.length
            : 0;
        // A Custom Combination of pie and doughnut rings paints its points
        // as a pie does (a gauge, C20_tdf111173); a ring mixed with an axis
        // series is refused by the combination's own rule.
        const ringCombination =
          value.chartType === "combo" &&
          value.chartSubtype === "custom" &&
          isRecord(value.data) &&
          Array.isArray(value.data.series) &&
          value.data.series.some((entry) => isRecord(entry) && COMBO_RING_RENDER_AS.has(String(entry.renderAs)));
        // A column or bar chart's Format Data Point fill (one bar's own
        
        
        const barPoints =
          (value.chartType === "column" || value.chartType === "bar") &&
          !(Array.isArray(value.format.sliceStyles) &&
            value.format.sliceStyles.some((raw) => isRecord(raw) && (raw.explosion !== undefined || raw.marker !== undefined)));
        // A combination's bars: each bar's own fill, on a series the
        
        // `chartComboBarPointPaint`).
        const comboBarPoints =
          value.chartType === "combo" &&
          !!sliceStyles &&
          sliceStyles.every((style) => {
            const entry = isRecord(value.data) && Array.isArray(value.data.series) ? value.data.series[style.seriesIndex ?? 0] : undefined;
            return (
              style.explosion === undefined &&
              style.marker === undefined &&
              isRecord(entry) &&
              (entry.renderAs === "column" || entry.renderAs === "bar")
            );
          });
        // A funnel stage's own paint (`cx:dataPt`: its glow, its inner
        // shadow; X-051 C18's gamma and zeta).
        const funnelPoints =
          value.chartType === "funnel" &&
          !(Array.isArray(value.format.sliceStyles) &&
            value.format.sliceStyles.some((raw) => isRecord(raw) && (raw.explosion !== undefined || raw.marker !== undefined)));
        // A line or X Y point's own marker (Format Data Point ▸ Marker,
        // C28_tdf126033; X-003) and its own line colour (Format Data Point ▸
        // Line: the segment that ends at it; Vary Colors by Point, X-184),
        // on a point its series has.
        const markerPoints =
          (value.chartType === "line" || value.chartType === "xy") &&
          !!sliceStyles &&
          sliceStyles.every(
            (style) =>
              (style.marker !== undefined || style.outline !== undefined) &&
              style.fill === undefined &&
              style.effect === undefined &&
              style.explosion === undefined &&
              style.shapePaint === undefined,
          );
        const seriesPoints = (index: number): number => {
          const entry = isRecord(value.data) && Array.isArray(value.data.series) ? value.data.series[index] : undefined;
          if (!isRecord(entry)) return 0;
          const points = value.chartType === "xy" ? entry.yValues : entry.values;
          return Array.isArray(points) ? points.length : 0;
        };
        if (markerPoints) {
          if (sliceStyles.some((style) => style.pointIndex >= seriesPoints(style.seriesIndex ?? 0))) {
            issue(issues, "format.sliceStyles", "format.sliceStyles", "must address existing points of a line or X Y series");
          }
        } else if (
          !sliceStyles ||
          !ringCombination && !barPoints && !comboBarPoints && !funnelPoints &&
          (value.chartType !== "pie" ||
          // A Pie of Pie and a Bar of Pie paint their points as a pie does
          // (C06_pieOfPieChart's six c:dPt fills).
          !["pie2d", "pie3d", "doughnut", "pieOfPie", "barOfPie"].includes(String(value.chartSubtype))) ||
          // A Pie of Pie's or Bar of Pie's point one past its data is its
          // first plot's "Other" slice (`c:dPt` idx = the point count), which
          
          sliceStyles.some(
            (style) =>
              style.pointIndex >= categoryCount &&
              !(
                style.pointIndex === categoryCount &&
                (style.seriesIndex ?? 0) === 0 &&
                (value.chartSubtype === "pieOfPie" || value.chartSubtype === "barOfPie")
              ),
          ) ||
          sliceStyles.some((style) => (style.seriesIndex ?? 0) >= pieSeriesCount) ||
          (Array.isArray(value.format.sliceStyles) &&
            value.format.sliceStyles.some(
              (raw) =>
                isRecord(raw) &&
                (Object.keys(raw).some(key => !["seriesIndex", "pointIndex", "fill", "outline", "effect", "shapePaint", "explosion"].includes(key)) ||
                raw.effect !== undefined &&
                normalizePresentationChartEffectPreset(raw.effect) === undefined),
            ))
        ) {
          issue(
            issues,
            "format.sliceStyles",
            "format.sliceStyles",
            "must address existing slices on a supported pie, doughnut or compound pie chart",
          );
        }
      }
      if (value.format.dataLabelOverrides !== undefined) {
        const overrides = normalizeChartDataLabelOverrides(value.format.dataLabelOverrides);
        const data = isRecord(value.data) ? value.data : {};
        const series = Array.isArray(data.series) ? data.series : [];
        const pointCount = (seriesIndex: number): number => {
          const entry = series[seriesIndex];
          if (data.kind === "xy") {
            return isRecord(entry) && Array.isArray(entry.yValues) ? entry.yValues.length : 0;
          }
          return Array.isArray(data.categories) ? data.categories.length : 0;
        };
        const positions = chartDataLabelPointPositions(value.chartType as ChartFamily, value.chartSubtype as ChartSubtype);
        if (
          !overrides ||
          !CHART_LABEL_OVERRIDE_FAMILIES.has(value.chartType as ChartFamily) ||
          overrides.some(
            (entry) =>
              entry.seriesIndex >= series.length ||
              (entry.pointIndex !== undefined && entry.pointIndex >= pointCount(entry.seriesIndex)) ||
              // A combination's label is its series' group's, and the writer
              // states a position only where that group offers it (R403-D17):
              // never a rejection, as `document_charts` takes it.
              (value.chartType !== "combo" &&
                entry.dataLabelPosition !== undefined &&
                !positions.includes(entry.dataLabelPosition)) ||
              (entry.dataLabelPercentage === true && value.chartType !== "pie") ||
              (entry.dataLabelBubbleSize === true &&
                !(value.chartType === "xy" && ["bubble", "bubble3d"].includes(String(value.chartSubtype)))),
          )
        ) {
          issue(
            issues,
            "format.dataLabelOverrides",
            "format.dataLabelOverrides",
            "must address existing series and points once, with labels this chart can show",
          );
        }
      }
      if (value.format.axisStyles !== undefined) {
        const axisStyles = normalizePresentationChartAxisStyles(
          value.format.axisStyles,
        );
        if (
          !axisStyles ||
          !chartSupportsAxisVisibility(value.chartType) ||
          // The secondary value axis's own text, on a chart that draws one.
          (axisStyles.some((style) => style.axis === "secondaryValue") &&
            !chartHasSecondaryValueAxis(value.chartType, value.chartSubtype, value.data)) ||
          // An axis's line paint is a classic part's element style: a
          // histogram's, waterfall's or funnel's axis shows and hides, and the
          // save refused its paint ("chart element styles are unavailable");
          // its labels' own text it takes (`chartTakesElementTextOnly`).
          (!chartTakesAreaStyles(value.chartType) &&
            !(
              Array.isArray(value.format.axisStyles) &&
              value.format.axisStyles.every(
                (raw) => statesTextOnly(raw, true) && chartTakesElementTextOnly(value.chartType, (raw as { axis?: unknown }).axis),
              )
            )) ||
          (Array.isArray(value.format.axisStyles) &&
            value.format.axisStyles.some(
              (raw) =>
                isRecord(raw) &&
                (Object.keys(raw).some(key => !["axis", "outline", "fill", "effect", "shapePaint", "text"].includes(key)) ||
                raw.effect !== undefined &&
                normalizePresentationChartEffectPreset(raw.effect) === undefined),
            ))
        ) {
          issue(
            issues,
            "format.axisStyles",
            "format.axisStyles",
            "requires a native category/value axis outline",
          );
        }
      }
      if (value.format.axisTitleStyles !== undefined) {
        // An axis title's own paint and text: a classic part's element style
        // on an axis the chart draws.
        const axisTitleStyles = normalizePresentationChartAxisTitleStyles(
          value.format.axisTitleStyles,
        );
        if (
          !axisTitleStyles ||
          !chartSupportsAxisVisibility(value.chartType) ||
          !chartTakesAreaStyles(value.chartType)
        ) {
          issue(
            issues,
            "format.axisTitleStyles",
            "format.axisTitleStyles",
            "requires a native category/value axis title style",
          );
        }
      }
      for (const key of ["gridlineStyleX", "gridlineStyleY", "minorGridlineStyleX", "minorGridlineStyleY"] as const) {
        const raw = value.format[key];
        if (raw === undefined) continue;
        const style = normalizePresentationChartAreaStyle(raw);
        if (
          !style ||
          !isRecord(raw) ||
          raw.fill !== undefined ||
          style.fill !== undefined ||
          !chartSupportsGridlines(value.chartType) ||
          !chartTakesAreaStyles(value.chartType)
        ) {
          issue(issues, `format.${key}`, `format.${key}`, "requires native gridline paint or an effect");
        }
      }
      if (value.format.gridlineStyle !== undefined) {
        const rawGridlineStyle = value.format.gridlineStyle;
        const gridlineStyle = normalizePresentationChartAreaStyle(
          rawGridlineStyle,
        );
        if (
          !gridlineStyle ||
          !isRecord(rawGridlineStyle) ||
          rawGridlineStyle.fill !== undefined ||
          gridlineStyle.fill !== undefined ||
          !chartAcceptsStoredGridlines(value.chartType) ||
          !chartTakesAreaStyles(value.chartType)
        ) {
          issue(
            issues,
            "format.gridlineStyle",
            "format.gridlineStyle",
            "requires native gridline paint or an effect",
          );
        }
      }
      if (
        value.format.dataLabelStyle !== undefined &&
        value.format.dataLabels !== true &&
        // The labels' look stands while any label shows: one series' labels
        // turned off (its own `c:delete`) leave the chart's look on the rest
        
        !(Array.isArray(value.format.dataLabelOverrides) &&
          value.format.dataLabelOverrides.some(
            (entry) => isRecord(entry) && (entry as { dataLabels?: unknown }).dataLabels === true,
          ))
      ) {
        issue(
          issues,
          "format.dataLabelStyle",
          "format.dataLabelStyle",
          "requires visible data labels",
        );
      }
      if (
        value.format.dataLabelLeaderLines !== undefined &&
        typeof value.format.dataLabelLeaderLines !== "boolean"
      ) {
        issue(
          issues,
          "format.dataLabelLeaderLines",
          "format.dataLabelLeaderLines",
          "must be a boolean",
        );
      } else if (
        value.format.dataLabelLeaderLines === true &&
        !(
          (value.format.dataLabels === true &&
            // Best Fit puts a pie's labels outside where they do not fit,
            // with their leader lines, as Outside End does.
            (((value.format.dataLabelPosition === "outsideEnd" ||
              value.format.dataLabelPosition === "bestFit") &&
              chartSupportsDataLabelLeaderLines(value.chartType, value.chartSubtype)) ||
              chartSupportsDraggedLabelLeaderLines(value.chartType, value.chartSubtype))) ||
          // A point's label shown on its own (dragged off its point while the
          // series' labels are off, corpus R253-D06) keeps its line.
          (chartFormatShowsPointLabel(value.format) &&
            chartSupportsDraggedLabelLeaderLines(value.chartType, value.chartSubtype))
        )
      ) {
        issue(
          issues,
          "format.dataLabelLeaderLines",
          "format.dataLabelLeaderLines",
          "requires outside-end or best-fit labels on a supported 2-D pie chart",
        );
      }
      if (
        value.format.dataLabelCallout !== undefined &&
        (typeof value.format.dataLabelCallout !== "boolean" ||
          (value.format.dataLabelCallout &&
            (value.format.dataLabels !== true ||
              !chartSupportsDataLabelCallout(value.chartType, value.chartSubtype))))
      ) {
        issue(
          issues,
          "format.data_label_callout",
          "format.dataLabelCallout",
          "requires visible labels on a 2-D classic chart",
        );
      }
      if (value.format.dataLabelLeaderLineStyle !== undefined) {
        const rawStyle = value.format.dataLabelLeaderLineStyle;
        const style = normalizePresentationChartAreaStyle(rawStyle);
        if (
          value.format.dataLabelLeaderLines !== true ||
          !style ||
          !isRecord(rawStyle) ||
          rawStyle.fill !== undefined ||
          style.fill !== undefined
        ) {
          issue(
            issues,
            "format.dataLabelLeaderLineStyle",
            "format.dataLabelLeaderLineStyle",
            "requires visible leader lines and native paint or an effect",
          );
        }
      }
      if (
        value.format.dataTableStyle !== undefined &&
        value.format.dataTable !== true
      ) {
        issue(
          issues,
          "format.dataTableStyle",
          "format.dataTableStyle",
          "requires a visible data table",
        );
      }
      if (value.format.trendline !== undefined) {
        if (
          !normalizeChartTrendline(value.format.trendline) ||
          !chartSupportsTrendline(value.chartType, value.chartSubtype)
        ) {
          issue(
            issues,
            "format.trendline",
            "format.trendline",
            "requires one native linear trendline on a supported 2-D chart",
          );
        }
      }
      if (value.format.trendlineStyle !== undefined) {
        const rawTrendlineStyle = value.format.trendlineStyle;
        const trendlineStyle = normalizePresentationChartAreaStyle(
          rawTrendlineStyle,
        );
        if (
          !trendlineStyle ||
          !isRecord(rawTrendlineStyle) ||
          rawTrendlineStyle.fill !== undefined ||
          trendlineStyle.fill !== undefined ||
          value.format.trendline === undefined
        ) {
          issue(
            issues,
            "format.trendlineStyle",
            "format.trendlineStyle",
            "requires a visible trendline and native paint or an effect",
          );
        }
      }
      if (value.format.seriesTrendlines !== undefined) {
        const entries = normalizeChartSeriesTrendlines(
          value.format.seriesTrendlines,
        );
        const listed =
          isRecord(value.data) && Array.isArray(value.data.series)
            ? value.data.series.length
            : 0;
        if (
          !entries ||
          !Array.isArray(value.format.seriesTrendlines) ||
          entries.length !== value.format.seriesTrendlines.length ||
          !chartSupportsTrendline(value.chartType, value.chartSubtype) ||
          entries.some((entry) => entry.seriesIndex >= listed) ||
          (entries.some((entry) => entry.seriesIndex === 0) &&
            value.format.trendline === undefined)
        ) {
          issue(
            issues,
            "format.seriesTrendlines",
            "format.seriesTrendlines",
            "requires Office trendlines on existing series, listed series by series, after the first series' trendline",
          );
        }
      }
      if (value.format.errorBars !== undefined) {
        if (
          !normalizeChartErrorBars(value.format.errorBars) ||
          !chartDataTakesErrorBars(value.chartType, value.chartSubtype, value.data)
        ) {
          issue(
            issues,
            "format.errorBars",
            "format.errorBars",
            "requires one Office error amount on a supported 2-D chart",
          );
        }
      }
      if (value.format.seriesErrorBars !== undefined) {
        const entries = normalizeChartSeriesErrorBars(value.format.seriesErrorBars);
        const listed =
          isRecord(value.data) && Array.isArray(value.data.series) ? value.data.series.length : 0;
        if (
          !entries ||
          !Array.isArray(value.format.seriesErrorBars) ||
          entries.length !== value.format.seriesErrorBars.length ||
          !chartDataTakesErrorBars(value.chartType, value.chartSubtype, value.data) ||
          entries.some((entry) => entry.seriesIndex >= listed)
        ) {
          issue(
            issues,
            "format.seriesErrorBars",
            "format.seriesErrorBars",
            "requires Office error amounts on existing series after the first, listed series by series",
          );
        }
      }
      if (value.format.errorBarsX !== undefined) {
        if (
          !normalizeChartErrorBars(value.format.errorBarsX) ||
          value.chartType !== "xy" ||
          !chartSupportsErrorBars(value.chartType, value.chartSubtype)
        ) {
          issue(
            issues,
            "format.errorBarsX",
            "format.errorBarsX",
            "requires one Office error amount on an X Y chart",
          );
        }
      }
      if (value.format.errorBarXStyle !== undefined) {
        const rawStyle = value.format.errorBarXStyle;
        const style = normalizePresentationChartAreaStyle(rawStyle);
        if (
          !style ||
          !isRecord(rawStyle) ||
          rawStyle.fill !== undefined ||
          style.fill !== undefined ||
          value.format.errorBarsX === undefined
        ) {
          issue(
            issues,
            "format.errorBarXStyle",
            "format.errorBarXStyle",
            "requires visible X error bars and native paint or an effect",
          );
        }
      }
      if (value.format.errorBarStyle !== undefined) {
        const rawErrorBarStyle = value.format.errorBarStyle;
        const errorBarStyle = normalizePresentationChartAreaStyle(
          rawErrorBarStyle,
        );
        if (
          !errorBarStyle ||
          !isRecord(rawErrorBarStyle) ||
          rawErrorBarStyle.fill !== undefined ||
          errorBarStyle.fill !== undefined ||
          value.format.errorBars === undefined
        ) {
          issue(
            issues,
            "format.errorBarStyle",
            "format.errorBarStyle",
            "requires visible error bars and native paint or an effect",
          );
        }
      }
      if (
        value.format.upDownBars !== undefined &&
        typeof value.format.upDownBars !== "boolean"
      ) {
        issue(
          issues,
          "format.upDownBars",
          "format.upDownBars",
          "must be a boolean",
        );
      } else if (value.format.upDownBars === true) {
        const seriesCount =
          isRecord(value.data) && Array.isArray(value.data.series)
            ? value.data.series.length
            : 0;
        if (
          !chartSupportsUpDownBars(value.chartType, value.chartSubtype) ||
          seriesCount < 2
        ) {
          issue(
            issues,
            "format.upDownBars",
            "format.upDownBars",
            "requires a 2-D line chart with at least two series",
          );
        }
      }
      for (const key of ["upBarStyle", "downBarStyle"] as const) {
        if (
          value.format[key] !== undefined &&
          value.format.upDownBars !== true &&
          // A stock chart with an open price paints its own candles.
          !(
            value.chartType === "stock" &&
            (value.chartSubtype === "openHighLowClose" ||
              value.chartSubtype === "volumeOpenHighLowClose")
          )
        ) {
          issue(
            issues,
            `format.${key}`,
            `format.${key}`,
            "requires visible up/down bars",
          );
        }
      }
      for (const key of ["dropLines", "highLowLines", "seriesLines"] as const) {
        if (
          value.format[key] !== undefined &&
          typeof value.format[key] !== "boolean"
        ) {
          issue(issues, `format.${key}`, `format.${key}`, "must be a boolean");
        }
      }
      if (
        value.format.dropLines === true &&
        !chartSupportsDropLines(value.chartType, value.chartSubtype)
      ) {
        issue(
          issues,
          "format.dropLines",
          "format.dropLines",
          "requires a supported 2-D line or area chart",
        );
      }
      if (value.format.highLowLines === true) {
        const seriesCount =
          isRecord(value.data) && Array.isArray(value.data.series)
            ? value.data.series.length
            : 0;
        if (
          !chartSupportsHighLowLines(value.chartType, value.chartSubtype) ||
          seriesCount < 2
        ) {
          issue(
            issues,
            "format.highLowLines",
            "format.highLowLines",
            "requires a 2-D line chart with at least two series",
          );
        }
      }
      if (
        value.format.dropLineStyle !== undefined &&
        value.format.dropLines !== true
      ) {
        issue(
          issues,
          "format.dropLineStyle",
          "format.dropLineStyle",
          "requires visible drop lines",
        );
      }
      if (
        value.format.highLowLineStyle !== undefined &&
        value.format.highLowLines !== true
      ) {
        issue(
          issues,
          "format.highLowLineStyle",
          "format.highLowLineStyle",
          "requires visible high-low lines",
        );
      }
      if (value.format.seriesLines === true) {
        const seriesCount =
          isRecord(value.data) && Array.isArray(value.data.series)
            ? value.data.series.length
            : 0;
        if (
          !chartSupportsSeriesLines(value.chartType, value.chartSubtype) ||
          seriesCount < 2
        ) {
          issue(
            issues,
            "format.seriesLines",
            "format.seriesLines",
            "requires a 2-D stacked bar or column chart with at least two series",
          );
        }
      }
      if (
        value.format.seriesLineStyle !== undefined &&
        value.format.seriesLines !== true
      ) {
        issue(
          issues,
          "format.seriesLineStyle",
          "format.seriesLineStyle",
          "requires visible series lines",
        );
      }
      for (const key of [
        "dropLineStyle",
        "highLowLineStyle",
        "seriesLineStyle",
      ] as const) {
        if (value.format[key] === undefined) continue;
        const rawStyle = value.format[key];
        const style = normalizePresentationChartAreaStyle(rawStyle);
        if (
          !style ||
          !isRecord(rawStyle) ||
          rawStyle.fill !== undefined ||
          style.fill !== undefined
        ) {
          issue(
            issues,
            `format.${key}`,
            `format.${key}`,
            "requires native line paint or an effect and no fill",
          );
        }
      }
      if (
        isChartFamily(value.chartType) &&
        !chartAcceptsStoredGridlines(value.chartType) &&
        (value.format.gridlinesX !== undefined ||
          value.format.gridlinesY !== undefined)
      ) {
        issue(
          issues,
          "format.gridlines_family",
          "format.gridlinesX",
          "gridlines are unavailable for this chart family",
        );
      }
      if (
        value.format.dataTable !== undefined &&
        typeof value.format.dataTable !== "boolean"
      ) {
        issue(
          issues,
          "format.dataTable",
          "format.dataTable",
          "must be a boolean",
        );
      } else if (
        value.format.dataTable !== undefined &&
        isChartFamily(value.chartType) &&
        !chartSupportsDataTable(value.chartType)
      ) {
        issue(
          issues,
          "format.data_table_family",
          "format.dataTable",
          "a data table is unavailable for this chart family",
        );
      }
      if (
        value.format.dataTableLegendKeys !== undefined &&
        typeof value.format.dataTableLegendKeys !== "boolean"
      ) {
        issue(
          issues,
          "format.data_table_legend_keys",
          "format.dataTableLegendKeys",
          "must be a boolean",
        );
      } else if (
        value.format.dataTableLegendKeys !== undefined &&
        value.format.dataTable !== true
      ) {
        issue(
          issues,
          "format.data_table_legend_keys_dependency",
          "format.dataTableLegendKeys",
          "requires a visible data table",
        );
      }
      for (const key of ["axisX", "axisY"] as const) {
        if (
          value.format[key] !== undefined &&
          typeof value.format[key] !== "boolean"
        ) {
          issue(issues, `format.${key}`, `format.${key}`, "must be a boolean");
        }
      }
      if (
        isChartFamily(value.chartType) &&
        !chartSupportsAxisVisibility(value.chartType) &&
        (value.format.axisX !== undefined || value.format.axisY !== undefined)
      ) {
        issue(
          issues,
          "format.axis_visibility_family",
          "format.axisX",
          "axis visibility is unavailable for this chart family",
        );
      }
    }
  }
  return { valid: issues.length === 0, issues };
}

// ---------------------------------------------------------------------------
// V1 lazy normalization
// ---------------------------------------------------------------------------

export const LEGACY_CHART_DEFAULTS: Record<
  ChartBlockType,
  { family: ChartFamily; subtype: ChartSubtype; format?: ChartBlockFormat }
> = {
  bar: { family: "column", subtype: "clustered" },
  barh: { family: "bar", subtype: "clustered" },
  line: { family: "line", subtype: "standard", format: { curve: "smooth" } },
  area: { family: "area", subtype: "standard", format: { curve: "smooth" } },
  pie: { family: "pie", subtype: "pie2d" },
  scatter: { family: "xy", subtype: "markers" },
  radar: { family: "radar", subtype: "filled" },
  combo: { family: "combo", subtype: "columnLine" },
  stock: { family: "stock", subtype: "openHighLowClose" },
};

function legacyCategoryData(
  categories: string[],
  series: ChartBlockSeries[],
): CategoryChartData {
  return { kind: "category", categories, series };
}

function legacyToData(
  legacyType: ChartBlockType,
  categories: string[],
  series: ChartBlockSeries[],
): ChartData {
  if (legacyType === "scatter") {
    return {
      kind: "xy",
      series: series.map((entry) => ({
        name: entry.name,
        xValues: categories.map((label, index) => {
          const parsed = Number(label);
          return Number.isFinite(parsed) && label.trim() !== ""
            ? parsed
            : index + 1;
        }),
        yValues: entry.values.slice(0, categories.length),
      })),
    };
  }
  if (legacyType === "stock") {
    const roles = resolveStockSeriesRoles(series);
    return {
      kind: "stock",
      categories,
      series: roles
        ? (["open", "high", "low", "close"] as const).map((role) => ({
            role,
            name: series[roles[role]].name,
            values: series[roles[role]].values.slice(0, categories.length),
          }))
        : series.map((entry, index) => ({
            role: (["open", "high", "low", "close"] as const)[index] ?? "close",
            name: entry.name,
            values: entry.values.slice(0, categories.length),
          })),
    };
  }
  // A pie draws one series (Word draws a pie's first series, and so did the
  // V1 canvas); the one model's pie holds exactly that one.
  const data = legacyCategoryData(
    categories,
    legacyType === "pie" ? series.slice(0, 1) : series,
  );
  if (legacyType === "combo") {
    data.series = data.series.map((entry, index) => ({
      ...entry,
      renderAs: index === 0 ? "column" : "line",
      axis: "primary",
    }));
  }
  return data;
}

function safeV2Attrs(record: Record<string, unknown>): ChartBlockAttrsV2 {
  const family = isChartFamily(record.chartType) ? record.chartType : "column";
  const requestedSubtype = isChartSubtype(record.chartSubtype)
    ? record.chartSubtype
    : CHART_SUBTYPES_BY_FAMILY[family][0];
  const subtype = isChartSubtypeForFamily(family, requestedSubtype)
    ? requestedSubtype
    : CHART_SUBTYPES_BY_FAMILY[family][0];
  const data = validateChartData(family, subtype, record.data).valid
    ? (record.data as unknown as ChartData)
    : defaultChartData(family, subtype);
  const format: ChartBlockFormat | undefined = isRecord(record.format)
    ? {
        ...(record.format.curve === "straight" ||
        record.format.curve === "smooth"
          ? { curve: record.format.curve as ChartCurve }
          : {}),
        ...((CHART_LEGEND_POSITIONS_V2 as readonly string[]).includes(
          String(record.format.legend),
        )
          ? { legend: record.format.legend as ChartLegendPositionV2 }
          : {}),
        ...(typeof record.format.dataLabels === "boolean"
          ? { dataLabels: record.format.dataLabels }
          : {}),
        ...(isChartDataLabelPosition(record.format.dataLabelPosition)
          ? { dataLabelPosition: record.format.dataLabelPosition }
          : {}),
        ...(typeof record.format.dataLabelValue === "boolean"
          ? { dataLabelValue: record.format.dataLabelValue }
          : {}),
        ...(typeof record.format.dataLabelLegendKey === "boolean"
          ? { dataLabelLegendKey: record.format.dataLabelLegendKey }
          : {}),
        ...(typeof record.format.dataLabelCategoryName === "boolean"
          ? { dataLabelCategoryName: record.format.dataLabelCategoryName }
          : {}),
        ...(typeof record.format.dataLabelSeriesName === "boolean"
          ? { dataLabelSeriesName: record.format.dataLabelSeriesName }
          : {}),
        ...(typeof record.format.dataLabelPercentage === "boolean"
          ? { dataLabelPercentage: record.format.dataLabelPercentage }
          : {}),
        ...(typeof record.format.dataLabelBubbleSize === "boolean"
          ? { dataLabelBubbleSize: record.format.dataLabelBubbleSize }
          : {}),
        ...(isChartDataLabelSeparator(record.format.dataLabelSeparator)
          ? { dataLabelSeparator: record.format.dataLabelSeparator }
          : {}),
        // The labels' own number format: dropped here, a printed or Docs
        // chart's "0.000%" Percentage read 29% where the sheet showed 28.571%.
        ...(typeof record.format.dataLabelNumberFormat === "string" &&
        record.format.dataLabelNumberFormat.length > 0 &&
        record.format.dataLabelNumberFormat.length <= 255
          ? { dataLabelNumberFormat: record.format.dataLabelNumberFormat }
          : {}),
        ...(isChartMapLabelLayout(record.format.dataLabelRegionLayout)
          ? { dataLabelRegionLayout: record.format.dataLabelRegionLayout }
          : {}),
        ...(isChartBinIntervalClosed(record.format.binIntervalClosed)
          ? { binIntervalClosed: record.format.binIntervalClosed }
          : {}),
        ...(isChartParentLabelLayout(record.format.parentLabelLayout) &&
        chartTakesParentLabelLayout(family, subtype)
          ? { parentLabelLayout: record.format.parentLabelLayout }
          : {}),
        ...(normalizeChartHistogramBins(record.format.histogramBins)
          ? { histogramBins: normalizeChartHistogramBins(record.format.histogramBins) }
          : {}),
        ...(normalizeChartBoxWhisker(record.format.boxWhisker)
          ? { boxWhisker: normalizeChartBoxWhisker(record.format.boxWhisker) }
          : {}),
        ...(typeof record.format.gapWidth === "number" &&
        Number.isInteger(record.format.gapWidth) &&
        record.format.gapWidth >= 0 &&
        record.format.gapWidth <= 500
          ? { gapWidth: record.format.gapWidth }
          : {}),
        ...(isWholeIn(record.format.barGapWidth, 0, 500) ? { barGapWidth: record.format.barGapWidth } : {}),
        ...(isWholeIn(record.format.barOverlap, -100, 100) ? { barOverlap: record.format.barOverlap } : {}),
        ...(isWholeIn(record.format.gapDepth, 0, 500) ? { gapDepth: record.format.gapDepth } : {}),
        ...(isChartBarShape(record.format.barShape) ? { barShape: record.format.barShape } : {}),
        ...(isWholeIn(record.format.secondaryBarGapWidth, 0, 500)
          ? { secondaryBarGapWidth: record.format.secondaryBarGapWidth }
          : {}),
        ...(isWholeIn(record.format.secondaryBarOverlap, -100, 100)
          ? { secondaryBarOverlap: record.format.secondaryBarOverlap }
          : {}),
        ...(record.format.comboColumnGrouping === "stacked" ? { comboColumnGrouping: "stacked" as const } : {}),
        ...(isChartDisplayBlanksAs(record.format.displayBlanksAs)
          ? { displayBlanksAs: record.format.displayBlanksAs }
          : {}),
        ...(record.format.displayNaAsBlank === true ? { displayNaAsBlank: true } : {}),
        ...(record.format.legendOverlay === true ? { legendOverlay: true as const } : {}),
        ...(record.format.titleOverlay === true ? { titleOverlay: true as const } : {}),
        ...(Number.isInteger(record.format.titleAngle) && Math.abs(record.format.titleAngle as number) <= 90
          ? { titleAngle: record.format.titleAngle as number }
          : {}),
        ...(record.format.roundedCorners === true ? { roundedCorners: true as const } : {}),
        ...(record.format.automaticTitle === true ? { automaticTitle: true as const } : {}),
        ...(Number.isInteger(record.format.firstSliceAngle) ? { firstSliceAngle: record.format.firstSliceAngle as number } : {}),
        ...(record.format.dataLabelWrap === false ? { dataLabelWrap: false as const } : {}),
        ...(Number.isInteger(record.format.dataLabelRotation) && Math.abs(record.format.dataLabelRotation as number) <= 90
          ? { dataLabelRotation: record.format.dataLabelRotation as number }
          : {}),
        ...(Number.isInteger(record.format.ofPieSplitPosition) && (record.format.ofPieSplitPosition as number) >= 1
          ? { ofPieSplitPosition: record.format.ofPieSplitPosition as number }
          : {}),
        ...(Number.isInteger(record.format.bubbleScale) ? { bubbleScale: record.format.bubbleScale as number } : {}),
        ...(Number.isInteger(record.format.doughnutHoleSize) ? { doughnutHoleSize: record.format.doughnutHoleSize as number } : {}),
        ...(Number.isInteger(record.format.pieExplosion) ? { pieExplosion: record.format.pieExplosion as number } : {}),
        ...(() => {
          const layout = normalizeChartElementLayout(record.format.elementLayout);
          return layout ? { elementLayout: layout } : {};
        })(),
        ...(() => {
          const hidden = normalizeChartLegendHiddenEntries(record.format.legendHiddenEntries);
          return hidden ? { legendHiddenEntries: hidden } : {};
        })(),
        ...(() => {
          const fonts = normalizeChartLegendEntryFonts(record.format.legendEntryFonts);
          return fonts ? { legendEntryFonts: fonts } : {};
        })(),
        ...(isChartColorPaletteId(record.format.colorPalette)
          ? { colorPalette: record.format.colorPalette }
          : {}),
        ...(() => {
          const view = normalizeChartView3D(record.format.view3D);
          return view ? { view3D: view } : {};
        })(),
        ...(typeof record.format.dataLabelLeaderLines === "boolean"
          ? { dataLabelLeaderLines: record.format.dataLabelLeaderLines }
          : {}),
        ...(typeof record.format.dataLabelCallout === "boolean"
          ? { dataLabelCallout: record.format.dataLabelCallout }
          : {}),
        ...(typeof record.format.gridlinesX === "boolean"
          ? { gridlinesX: record.format.gridlinesX }
          : {}),
        ...(() => {
          const axisOptions = normalizeOfficeChartAxesOptions(record.format.axisOptions);
          return axisOptions ? { axisOptions } : {};
        })(),
        ...(typeof record.format.gridlinesY === "boolean"
          ? { gridlinesY: record.format.gridlinesY }
          : {}),
        ...(typeof record.format.minorGridlinesX === "boolean"
          ? { minorGridlinesX: record.format.minorGridlinesX }
          : {}),
        ...(typeof record.format.minorGridlinesY === "boolean"
          ? { minorGridlinesY: record.format.minorGridlinesY }
          : {}),
        ...(typeof record.format.secondaryValueGridlines === "boolean"
          ? { secondaryValueGridlines: record.format.secondaryValueGridlines }
          : {}),
        ...(typeof record.format.secondaryValueAxis === "boolean"
          ? { secondaryValueAxis: record.format.secondaryValueAxis }
          : {}),
        ...(typeof record.format.secondaryValueAxisTitle === "string" &&
        record.format.secondaryValueAxisTitle.length > 0
          ? { secondaryValueAxisTitle: record.format.secondaryValueAxisTitle }
          : {}),
        ...(typeof record.format.seriesAxisTitle === "string" && record.format.seriesAxisTitle.trim().length > 0
          ? { seriesAxisTitle: record.format.seriesAxisTitle }
          : {}),
        ...(Array.isArray(record.format.hiddenSeries) &&
        record.format.hiddenSeries.every((index) => Number.isInteger(index))
          ? { hiddenSeries: [...(record.format.hiddenSeries as number[])] }
          : {}),
        ...(record.format.categoryNamesBlank === true ? { categoryNamesBlank: true } : {}),
        ...(typeof record.format.blankTitleSizePt === "number" && record.format.blankTitleSizePt > 0
          ? { blankTitleSizePt: record.format.blankTitleSizePt } : {}),
        ...(typeof record.format.blankTitleY === "number" && record.format.blankTitleY >= 0 && record.format.blankTitleY < 1
          ? { blankTitleY: record.format.blankTitleY } : {}),
        ...(Array.isArray(record.format.blankAxisTitles) &&
        record.format.blankAxisTitles.length > 0 &&
        record.format.blankAxisTitles.every((axis) => axis === "X" || axis === "Y")
          ? { blankAxisTitles: [...(record.format.blankAxisTitles as ("X" | "Y")[])] }
          : {}),
        ...(record.format.categoryNamesWhole === true ? { categoryNamesWhole: true } : {}),
        ...((() => {
          const outer = normalizeChartElementBox(record.format.plotAreaOuter);
          return outer ? { plotAreaOuter: outer } : {};
        })()),
        ...(Array.isArray(record.format.trendlineLabels)
          ? { trendlineLabels: normalizeChartTrendlineLabels(record.format.trendlineLabels) }
          : {}),
        ...(Array.isArray(record.format.legendBlankNames) &&
        record.format.legendBlankNames.every((index) => Number.isInteger(index))
          ? { legendBlankNames: [...(record.format.legendBlankNames as number[])] }
          : {}),
        ...(Array.isArray(record.format.hiddenCategories) &&
        record.format.hiddenCategories.every((index) => Number.isInteger(index))
          ? { hiddenCategories: [...(record.format.hiddenCategories as number[])] }
          : {}),
        ...(normalizeOfficeChartText(record.format.text)
          ? { text: normalizeOfficeChartText(record.format.text) }
          : {}),
        ...(typeof record.format.dataTable === "boolean"
          ? { dataTable: record.format.dataTable }
          : {}),
        ...(typeof record.format.dataTableLegendKeys === "boolean"
          ? { dataTableLegendKeys: record.format.dataTableLegendKeys }
          : {}),
        // A border shown is the default, unstated (the twin of the API's).
        ...(record.format.dataTableHorizontalBorder === false ? { dataTableHorizontalBorder: false } : {}),
        // A border shown is the default, unstated (the twin of the API's).
        ...(record.format.dataTableVerticalBorder === false ? { dataTableVerticalBorder: false } : {}),
        // A border shown is the default, unstated (the twin of the API's).
        ...(record.format.dataTableOutline === false ? { dataTableOutline: false } : {}),
        ...(normalizeOfficeChartLayout(record.format.layout)
          ? { layout: normalizeOfficeChartLayout(record.format.layout) }
          : {}),
        ...(typeof record.format.axisX === "boolean"
          ? { axisX: record.format.axisX }
          : {}),
        ...(typeof record.format.axisY === "boolean"
          ? { axisY: record.format.axisY }
          : {}),
        ...(normalizePresentationChartAreaStyle(record.format.chartAreaStyle)
          ? {
              chartAreaStyle: normalizePresentationChartAreaStyle(
                record.format.chartAreaStyle,
              ),
            }
          : {}),
        ...(normalizePresentationChartAreaStyle(record.format.plotAreaStyle)
          ? {
              plotAreaStyle: normalizePresentationChartAreaStyle(
                record.format.plotAreaStyle,
              ),
            }
          : {}),
        ...Object.fromEntries(
          CHART_WALL_STYLE_KEYS.flatMap((key) => {
            const style = normalizePresentationChartAreaStyle((record.format as Record<string, unknown>)[key]);
            return style ? [[key, style]] : [];
          }),
        ),
        ...(normalizeChartWallThickness(record.format.wallThickness)
          ? { wallThickness: normalizeChartWallThickness(record.format.wallThickness)! }
          : {}),
        ...(normalizePresentationChartAreaStyle(record.format.chartTitleStyle)
          ? {
              chartTitleStyle: normalizePresentationChartAreaStyle(
                record.format.chartTitleStyle,
              ),
            }
          : {}),
        ...(normalizePresentationChartAreaStyle(record.format.legendStyle)
          ? {
              legendStyle: normalizePresentationChartAreaStyle(
                record.format.legendStyle,
              ),
            }
          : {}),
        ...(normalizePresentationChartSeriesStyles(record.format.seriesStyles)
          ? {
              seriesStyles: normalizePresentationChartSeriesStyles(
                record.format.seriesStyles,
              ),
            }
          : {}),
        ...(normalizePresentationChartSliceStyles(record.format.sliceStyles)
          ? {
              sliceStyles: normalizePresentationChartSliceStyles(
                record.format.sliceStyles,
              ),
            }
          : {}),
        ...(normalizeChartDataLabelOverrides(record.format.dataLabelOverrides)
          ? {
              dataLabelOverrides: normalizeChartDataLabelOverrides(
                record.format.dataLabelOverrides,
              ),
            }
          : {}),
        ...(normalizePresentationChartAxisTitleStyles(record.format.axisTitleStyles)
          ? {
              axisTitleStyles: normalizePresentationChartAxisTitleStyles(
                record.format.axisTitleStyles,
              ),
            }
          : {}),
        ...(normalizePresentationChartAxisStyles(record.format.axisStyles)
          ? {
              axisStyles: normalizePresentationChartAxisStyles(
                record.format.axisStyles,
              ),
            }
          : {}),
        ...(normalizePresentationChartAreaStyle(record.format.gridlineStyle)
          ? {
              gridlineStyle: normalizePresentationChartAreaStyle(
                record.format.gridlineStyle,
              ),
            }
          : {}),
        ...Object.fromEntries(
          (["gridlineStyleX", "gridlineStyleY", "minorGridlineStyleX", "minorGridlineStyleY"] as const)
            .map((key) => [key, normalizePresentationChartAreaStyle((record.format as Record<string, unknown>)[key])] as const)
            .filter(([, style]) => style !== undefined),
        ),
        ...(normalizePresentationChartAreaStyle(record.format.dataLabelStyle)
          ? {
              dataLabelStyle: normalizePresentationChartAreaStyle(
                record.format.dataLabelStyle,
              ),
            }
          : {}),
        ...(normalizePresentationChartAreaStyle(
          record.format.dataLabelLeaderLineStyle,
        )
          ? {
              dataLabelLeaderLineStyle: normalizePresentationChartAreaStyle(
                record.format.dataLabelLeaderLineStyle,
              ),
            }
          : {}),
        ...(normalizePresentationChartAreaStyle(record.format.dataTableStyle)
          ? {
              dataTableStyle: normalizePresentationChartAreaStyle(
                record.format.dataTableStyle,
              ),
            }
          : {}),
        ...(normalizeChartTrendline(record.format.trendline)
          ? { trendline: normalizeChartTrendline(record.format.trendline) }
          : {}),
        ...(normalizePresentationChartAreaStyle(record.format.trendlineStyle)
          ? {
              trendlineStyle: normalizePresentationChartAreaStyle(
                record.format.trendlineStyle,
              ),
            }
          : {}),
        ...(normalizeChartSeriesTrendlines(record.format.seriesTrendlines)
          ? {
              seriesTrendlines: normalizeChartSeriesTrendlines(
                record.format.seriesTrendlines,
              ),
            }
          : {}),
        ...(normalizeChartErrorBars(record.format.errorBars)
          ? { errorBars: normalizeChartErrorBars(record.format.errorBars) }
          : {}),
        ...(normalizePresentationChartAreaStyle(record.format.errorBarStyle)
          ? {
              errorBarStyle: normalizePresentationChartAreaStyle(
                record.format.errorBarStyle,
              ),
            }
          : {}),
        ...(normalizeChartSeriesErrorBars(record.format.seriesErrorBars)
          ? { seriesErrorBars: normalizeChartSeriesErrorBars(record.format.seriesErrorBars) }
          : {}),
        ...(normalizeChartErrorBars(record.format.errorBarsX)
          ? { errorBarsX: normalizeChartErrorBars(record.format.errorBarsX) }
          : {}),
        ...(normalizePresentationChartAreaStyle(record.format.errorBarXStyle)
          ? {
              errorBarXStyle: normalizePresentationChartAreaStyle(
                record.format.errorBarXStyle,
              ),
            }
          : {}),
        ...(typeof record.format.upDownBars === "boolean"
          ? { upDownBars: record.format.upDownBars }
          : {}),
        ...(normalizePresentationChartAreaStyle(record.format.upBarStyle)
          ? {
              upBarStyle: normalizePresentationChartAreaStyle(
                record.format.upBarStyle,
              ),
            }
          : {}),
        ...(normalizePresentationChartAreaStyle(record.format.downBarStyle)
          ? {
              downBarStyle: normalizePresentationChartAreaStyle(
                record.format.downBarStyle,
              ),
            }
          : {}),
        ...(typeof record.format.dropLines === "boolean"
          ? { dropLines: record.format.dropLines }
          : {}),
        ...(normalizePresentationChartAreaStyle(record.format.dropLineStyle)
          ? {
              dropLineStyle: normalizePresentationChartAreaStyle(
                record.format.dropLineStyle,
              ),
            }
          : {}),
        ...(typeof record.format.highLowLines === "boolean"
          ? { highLowLines: record.format.highLowLines }
          : {}),
        ...(normalizePresentationChartAreaStyle(record.format.highLowLineStyle)
          ? {
              highLowLineStyle: normalizePresentationChartAreaStyle(
                record.format.highLowLineStyle,
              ),
            }
          : {}),
        ...(typeof record.format.seriesLines === "boolean"
          ? { seriesLines: record.format.seriesLines }
          : {}),
        ...(normalizePresentationChartAreaStyle(record.format.seriesLineStyle)
          ? {
              seriesLineStyle: normalizePresentationChartAreaStyle(
                record.format.seriesLineStyle,
              ),
            }
          : {}),
      }
    : undefined;
  return {
    schemaVersion: 2,
    chartType: family,
    chartSubtype: subtype,
    title: typeof record.title === "string" ? record.title : "",
    ...(() => {
      const titleRuns = normalizeChartTitleRuns(record.titleRuns, typeof record.title === "string" ? record.title : "");
      return titleRuns ? { titleRuns } : {};
    })(),
    ...(typeof record.axisTitleX === "string" && record.axisTitleX.length > 0
      ? { axisTitleX: record.axisTitleX }
      : {}),
    ...(typeof record.axisTitleY === "string" && record.axisTitleY.length > 0
      ? { axisTitleY: record.axisTitleY }
      : {}),
    ...chartAxisTitleRunsOf(record),
    data,
    stylePreset: isChartStylePreset(record.stylePreset)
      ? record.stylePreset
      : "classic",
    ...(format && Object.keys(format).length > 0 ? { format } : {}),
  };
}

/** The axis titles' runs a record states that still spell their titles. */
function chartAxisTitleRunsOf(record: Record<string, unknown>): Pick<ChartBlockAttrsV2, "axisTitleXRuns" | "axisTitleYRuns"> {
  const out: { axisTitleXRuns?: readonly ChartTitleRun[]; axisTitleYRuns?: readonly ChartTitleRun[] } = {};
  for (const axis of ["X", "Y"] as const) {
    const title = record[`axisTitle${axis}`];
    if (typeof title !== "string" || !title) continue;
    const runs = normalizeChartTitleRuns(record[`axisTitle${axis}Runs`], title);
    if (runs) out[`axisTitle${axis}Runs`] = runs;
  }
  return out;
}

const LEGACY_CHART_FORMAT_STRINGS: Readonly<Record<string, ChartBlockFormat>> =
  {
    straight: { curve: "straight" },
    smooth: { curve: "smooth" },
    none: { legend: "none" },
    top: { legend: "top" },
    right: { legend: "right" },
    bottom: { legend: "bottom" },
    left: { legend: "left" },
  };
const EMPTY_CHART_FORMAT_STRINGS = new Set(["", "auto", "default"]);
const CHART_SUBTYPE_ALIASES_BY_FAMILY: Partial<
  Record<ChartFamily, Readonly<Record<string, ChartSubtype>>>
> = {
  // AI/legacy payloads use these generic labels for the plain, unstacked,
  // marker-free line. Keep aliases family-scoped so unknown or ambiguous
  // labels for every other family still fail closed.
  line: {
    basic: "standard",
    default: "standard",
  },
};

/**
 * Canonicalize only lossless Chart V2 transport artifacts.
 *
 * `chartType` determines the required discriminated data kind. A model/tool
 * occasionally emits a category envelope with `kind: "xy"`; we replace only
 * that discriminator, and only when the otherwise unchanged envelope validates
 * for the requested family/subtype. Real XY or mixed data therefore remains an
 * error instead of being silently downgraded.
 *
 * Tiptap and pre-V2 clients represent an absent format as null/empty/default,
 * or a known one-token curve/legend value. Canonical V2 uses an object or omits
 * the key. Unknown non-empty strings are deliberately left invalid.
 */
export function normalizeChartBlockAttrsV2Wire(
  value: unknown,
): Record<string, unknown> {
  const record = isRecord(value) ? value : {};
  const normalized: Record<string, unknown> = { ...record };

  const rawFormat = normalized.format;
  if (rawFormat === null || rawFormat === undefined) {
    delete normalized.format;
  } else if (typeof rawFormat === "string") {
    const formatKey = rawFormat.trim().toLowerCase();
    if (EMPTY_CHART_FORMAT_STRINGS.has(formatKey)) {
      delete normalized.format;
    } else if (LEGACY_CHART_FORMAT_STRINGS[formatKey]) {
      normalized.format = { ...LEGACY_CHART_FORMAT_STRINGS[formatKey] };
    }
  }

  const family = normalized.chartType;
  const rawSubtype = normalized.chartSubtype;
  if (isChartFamily(family) && typeof rawSubtype === "string") {
    const canonicalSubtype =
      CHART_SUBTYPE_ALIASES_BY_FAMILY[family]?.[
        rawSubtype.trim().toLowerCase()
      ];
    if (canonicalSubtype) normalized.chartSubtype = canonicalSubtype;
  }
  const subtype = normalized.chartSubtype;
  const data = normalized.data;
  if (
    isChartSubtypeForFamily(family, subtype) &&
    isChartSubtype(subtype) &&
    isRecord(data) &&
    (Object.values(DATA_KIND_BY_FAMILY) as unknown[]).includes(data.kind)
  ) {
    const expectedKind = DATA_KIND_BY_FAMILY[family];
    if (data.kind !== expectedKind) {
      const candidate = { ...data, kind: expectedKind };
      if (validateChartData(family, subtype, candidate).valid) {
        normalized.data = candidate;
      }
    }
  }
  return normalized;
}

/**
 * Reads V1 and V2 attrs through one path. V1 is normalized in memory only;
 * callers persist the returned V2 attrs on the next user edit/save.
 */
export function normalizeChartBlockAttrs(
  value: unknown,
): NormalizedChartBlockAttrs {
  const record = isRecord(value) ? value : {};
  if (record.schemaVersion === 2) {
    const canonicalRecord = normalizeChartBlockAttrsV2Wire(record);
    const attrs = safeV2Attrs(canonicalRecord);
    // Validate the losslessly canonicalized wire record as well as the safe
    // view so a truly invalid family/subtype cannot disappear behind defaults.
    return {
      attrs,
      source: "v2",
      validation: validateChartBlockAttrsV2(canonicalRecord),
    };
  }

  const legacyType = isChartBlockType(record.chartType)
    ? record.chartType
    : "bar";
  const mapping = LEGACY_CHART_DEFAULTS[legacyType];
  const categories = sanitizeChartCategories(record.categories);
  const series = sanitizeChartSeries(record.series);
  const data =
    categories.length > 0 && series.length > 0
      ? legacyToData(legacyType, categories, series)
      : defaultChartData(mapping.family, mapping.subtype);
  const attrs: ChartBlockAttrsV2 = {
    schemaVersion: 2,
    chartType: mapping.family,
    chartSubtype: mapping.subtype,
    title: clampChartText(record.title),
    ...(() => {
      const titleRuns = fitChartTitleRuns(
        normalizeChartTitleRuns(record.titleRuns, typeof record.title === "string" ? record.title : ""),
        clampChartText(record.title),
      );
      return titleRuns ? { titleRuns } : {};
    })(),
    ...(clampChartText(record.axisTitleX)
      ? { axisTitleX: clampChartText(record.axisTitleX) }
      : {}),
    ...(clampChartText(record.axisTitleY)
      ? { axisTitleY: clampChartText(record.axisTitleY) }
      : {}),
    data,
    stylePreset: isChartStylePreset(record.stylePreset)
      ? record.stylePreset
      : "classic",
    ...(mapping.format ? { format: mapping.format } : {}),
  };
  return {
    attrs,
    source: "v1",
    validation: validateChartBlockAttrsV2(attrs),
  };
}

/** The chart's semantics: what a V1 node spells one way and V2 another. */
const CHART_NODE_SEMANTIC_ATTRS = [
  "schemaVersion",
  "chartType",
  "chartSubtype",
  "title",
  "axisTitleX",
  "axisTitleY",
  "data",
  "stylePreset",
  "format",
  // V1 only: its data grid.
  "categories",
  "series",
] as const;

/**
 * A Docs chart node's attrs on the one chart model, or null when the node is
 * already there. A V1 node (no `schemaVersion: 2`) is lifted by
 * `normalizeChartBlockAttrs`, the one converter; everything else the node
 * carries -- block id, import source, the physical host (`documentChart`),
 * paragraph alignment -- stays as it is, and the V1-only arrays go.
 */
export function chartNodeAttrsOnV2(
  attrs: unknown,
): Record<string, unknown> | null {
  const record = isRecord(attrs) ? attrs : {};
  if (record.schemaVersion === 2) return null;
  const lifted: Record<string, unknown> = { ...record };
  for (const key of CHART_NODE_SEMANTIC_ATTRS) delete lifted[key];
  return { ...lifted, ...normalizeChartBlockAttrs(record).attrs };
}

/**
 * The sample data a new chart of a kind is born with, its words in the
 * reader's language (`locale`, the viewer's interface language at the
 * insert: "Category 1" / "Series 1" in English, "类别 1" / "系列 1" in
 * Chinese -- `lib/office-charts/sample-words`). Without a locale (repairing
 * a stored chart whose data is unreadable) the words are the factory's
 * fallback, the same on every machine.
 */
export function defaultChartData(
  family: ChartFamily,
  subtype: ChartSubtype,
  locale?: string | null,
): ChartData {
  const words = officeChartSampleWords(locale);
  const seriesName = (n: number) => officeChartSampleSeries(words, n);
  const categories = [1, 2, 3, 4].map((n) => officeChartSampleCategory(words, n));
  if (family === "xy") {
    const bubble = subtype === "bubble" || subtype === "bubble3d";
    return {
      kind: "xy",
      series: [
        {
          name: seriesName(1),
          xValues: [1, 2, 3, 4],
          yValues: [4, 6, 5, 7],
          ...(bubble ? { bubbleSizes: [8, 14, 10, 18] } : {}),
        },
      ],
    };
  }
  if (family === "stock") {
    const roles =
      STOCK_ROLES_BY_SUBTYPE[subtype] ??
      STOCK_ROLES_BY_SUBTYPE.openHighLowClose;
    const values: Record<StockRole, number[]> = {
      volume: [120, 180, 140, 210],
      open: [10.2, 10.5, 10.3, 10.8],
      high: [10.9, 10.9, 11.0, 11.2],
      low: [10.0, 10.2, 10.1, 10.5],
      close: [10.5, 10.3, 10.8, 10.6],
    };
    return {
      kind: "stock",
      categories,
      series: roles.map((role) => ({ name: words.stock[role], role, values: values[role] })),
    };
  }
  if (family === "waterfall") {
    return {
      kind: "waterfall",
      categories: [...words.waterfall],
      values: [100, 45, -30, 115],
      pointKinds: ["total", "value", "value", "total"],
    };
  }
  if (family === "hierarchy") {
    return {
      kind: "hierarchy",
      points: [
        { id: "root", label: words.total, value: 0 },
        { id: "a", parentId: "root", label: officeChartSampleCategory(words, "A"), value: 6 },
        { id: "b", parentId: "root", label: officeChartSampleCategory(words, "B"), value: 4 },
      ],
    };
  }
  if (family === "statistical") {
    return {
      kind: "sample",
      series: [{ name: seriesName(1), values: [2, 3, 3, 4, 5, 5, 6, 8] }],
    };
  }
  if (family === "surface") {
    return {
      kind: "matrix",
      xCategories: ["X1", "X2", "X3"],
      yCategories: ["Y1", "Y2", "Y3"],
      values: [
        [1, 3, 2],
        [2, 5, 4],
        [1, 4, 6],
      ],
    };
  }
  if (family === "map") {
    return {
      kind: "map",
      regions: [
        { id: "156", label: officeChartSampleRegionName("CN", locale), value: 7 },
        { id: "840", label: officeChartSampleRegionName("US", locale), value: 5 },
        { id: "392", label: officeChartSampleRegionName("JP", locale), value: 3 },
      ],
    };
  }
  const baseSeries: CategoryChartSeries[] = [
    { name: seriesName(1), values: [4, 6, 5, 7] },
    { name: seriesName(2), values: [3, 5, 4, 6] },
  ];
  if (family === "pie" || family === "funnel") baseSeries.splice(1);
  if (family === "combo") {
    if (subtype === "stackedAreaColumn") {
      baseSeries[0] = {
        ...baseSeries[0],
        renderAs: "area",
        axis: "primary",
      };
      baseSeries[1] = {
        ...baseSeries[1],
        renderAs: "column",
        axis: "primary",
      };
    } else {
      baseSeries[0] = {
        ...baseSeries[0],
        renderAs: "column",
        axis: "primary",
      };
      baseSeries[1] = {
        ...baseSeries[1],
        renderAs: "line",
        axis: subtype === "columnLineSecondary" ? "secondary" : "primary",
      };
    }
  }
  return { kind: "category", categories, series: baseSeries };
}

/**
 * What Office's own insert turns on, for families whose default draws an
 * element the stored format would otherwise not name.
 *
 * A radar's rings are Word's default — every radar part in the corpus carries
 * `valAx/majorGridlines` — and one key feeds three consumers: the renderer
 * draws the rings from it, the Chart Elements checkbox reports it, and the
 * DOCX writer emits `<c:majorGridlines>` only when it is there. Leaving it
 * unstated made all three disagree: the page drew rings, the menu said
 * gridlines were off, and the exported chart had none.
 */
const AUTHORED_CHART_FORMAT_DEFAULTS: Partial<
  Record<ChartFamily, ChartBlockAttrsV2["format"]>
> = {
  radar: { gridlinesY: true },
  // Office's inserted chart draws its value axis's major gridlines: across
  // the plot for a column, line, area, scatter, stock or combo chart, down it
  // for a bar chart (style 201's `gridlineMajor`; every chart part a
  // PowerPoint, Word or Excel insert writes carries `valAx/majorGridlines`).
  column: { gridlinesY: true },
  line: { gridlinesY: true },
  area: { gridlinesY: true },
  // A scatter or bubble chart's X axis is a value axis too, and Office's
  // inserted one draws its major gridlines as well (style 240 / 269: the
  
  xy: { gridlinesX: true, gridlinesY: true },
  stock: { gridlinesY: true },
  combo: { gridlinesY: true },
  bar: { gridlinesX: true },
  // The newer kinds with a value axis draw its gridlines too (styles 366,
  // 395, 406: Excel for Mac's inserted histogram, Pareto, box and whisker
  
  statistical: { gridlinesY: true },
  waterfall: { gridlinesY: true },
};










export function officeInsertedChartLegendAndLabels(
  family: string,
  subtype: string,
): {
  legend?: "top" | "none";
  dataLabels?: true;
  dataLabelCategoryName?: true;
  dataLabelValue?: false;
  boxWhisker?: ChartBoxWhisker;
} {
  switch (family) {
    case "radar":
      return { legend: "top" };
    case "waterfall":
      return { legend: "top", dataLabels: true };
    case "funnel":
      return { legend: "none", dataLabels: true };
    case "statistical":
      return subtype === "boxWhisker"
        ? { legend: "none", boxWhisker: { quartileMethod: "exclusive", meanMarkers: true } }
        : { legend: "none" };
    case "hierarchy":
      // Labelled with each point's name, not its value.
      return {
        legend: subtype === "sunburst" ? "none" : "top",
        dataLabels: true,
        dataLabelCategoryName: true,
        dataLabelValue: false,
      };
    default:
      return {};
  }
}










export function withOfficeInsertedChartFormat<T extends ChartBlockAttrsV2>(attrs: T): T {
  const layout = attrs.format?.layout ? null : officeInsertedChartLayout(attrs);
  const doughnut =
    attrs.chartType === "pie" && attrs.chartSubtype === "doughnut" && attrs.format?.doughnutHoleSize === undefined;
  if (!layout && !doughnut) return attrs;
  return {
    ...attrs,
    format: {
      ...(attrs.format ?? {}),
      ...(layout ? { layout } : {}),
      ...(doughnut ? { doughnutHoleSize: 75 } : {}),
    },
  };
}

export function createChartBlockAttrsV2(
  family: ChartFamily,
  subtype: ChartSubtype,
  patch: Partial<
    Omit<ChartBlockAttrsV2, "schemaVersion" | "chartType" | "chartSubtype">
  > = {},
  /** `locale`: the reader's interface language, which names the sample data
   * a chart born without `patch.data` carries (`defaultChartData`). */
  options: { locale?: string | null } = {},
): ChartBlockAttrsV2 {
  if (!isChartSubtypeForFamily(family, subtype)) {
    throw new Error(`Chart subtype ${subtype} does not belong to ${family}`);
  }
  // A new chart in Office's default style is born with Office's Change Colors
  // pick, Colorful Palette 1 (chart colours 10: accent1..6 of the document's
  // theme), so it follows the theme as an inserted Word / PowerPoint / Excel
  // chart does; in the file the pick is the chart's own Chart Colors part,
  // read back from there (CHART-UNIFICATION.md phase 3). A chart inserted in
  // another style takes that style's own palette, and a surface chart no pick.
  const authoredFormat: ChartBlockFormat = {
    ...(chartTakesColorPalette(family) && (patch.stylePreset ?? "classic") === "classic"
      ? { colorPalette: "colorful-1" }
      : {}),
    ...(AUTHORED_CHART_FORMAT_DEFAULTS[family] ?? {}),
    ...officeInsertedChartLegendAndLabels(family, subtype),
  };
  const attrs: ChartBlockAttrsV2 = {
    schemaVersion: 2,
    chartType: family,
    chartSubtype: subtype,
    title: "",
    data: patch.data ?? defaultChartData(family, subtype, options.locale),
    stylePreset: "classic",
    ...patch,
    // A caller that states the key keeps its own value; the default only
    // fills a key nobody stated.
    ...(Object.keys(authoredFormat ?? {}).length || patch.format
      ? { format: { ...authoredFormat, ...(patch.format ?? {}) } }
      : {}),
  };
  const validation = validateChartBlockAttrsV2(attrs);
  if (!validation.valid) {
    throw new Error(
      validation.issues
        .map((entry) => `${entry.path}: ${entry.message}`)
        .join("; "),
    );
  }
  return attrs;
}
