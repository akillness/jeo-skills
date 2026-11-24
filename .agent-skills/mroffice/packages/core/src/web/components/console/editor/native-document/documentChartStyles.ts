/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  chartSupportsDataLabels,
  chartDataLabelPositions,
  chartTakesAreaStyles,
  chartTakesColorPalette,
  chartTakesSeriesStyles,
  validateChartBlockAttrsV2,
  type ChartBlockAttrsV2,
  type ChartBlockFormat,
  type ChartStylePresetId,
} from "../extensions/chartBlockShared";
import type { PresentationChartEffectPreset } from "../../../../lib/presentation-chart-area-style";
import type { ChartNativeLook } from "../../../../lib/office-chart-native-look";
import {
  chartColorPaletteColor,
  chartColorPaletteId,
  chartThemeAccents,
} from "../../../../lib/office-charts/chart-color-palettes";
import {
  CHART_STYLE_PRESETS,
  DEFAULT_CHART_STYLE_PRESET_ID,
} from "../../../../lib/office-charts/chart-style-presets.generated";
import { tintColor } from "../../../../lib/office-color-palette";
import {
  CHART_STYLE_GALLERY_MAX,
  chartStyleFormat,
  chartStyleGalleryIds,
  chartStyleGalleryKey,
} from "../../../../lib/office-charts/chart-style-gallery";









type DocumentChartStyleShade = "plain" | "soft" | "light";
const SHADE_TINT: Readonly<Record<DocumentChartStyleShade, number>> = {
  plain: 0,
  soft: 0.7,
  light: 0.18,
};

interface DocumentChartStyle {
  id: string;
  zh: string;
  en: string;
  base: ChartStylePresetId;
  /** How the chart's own colours are painted (never another palette). */
  shade: DocumentChartStyleShade;
  background: `#${string}`;
  /** A dark backdrop made from the chart's first colour instead of `background`. */
  darkOwnBackground?: boolean;
  outline?: boolean;
  effect?: PresentationChartEffectPreset;
  labels?: "inside" | "outside";
  legend?: "top" | "right" | "bottom" | "none";
}

/** Docs recipes persist existing native paint/layout atoms, not a private
 * preview-only style id. The shared five-preset/PPT contract stays unchanged. */
export const DOCUMENT_CHART_STYLES = [
  {
    id: "classic",
    zh: "经典",
    en: "Classic",
    base: "classic",
    shade: "plain",
    background: "#ffffff",
  },
  {
    id: "ink-outline",
    zh: "彩色轮廓",
    en: "Color Outline",
    base: "classic",
    shade: "soft",
    background: "#ffffff",
    outline: true,
    legend: "top",
  },
  {
    id: "silver-shadow",
    zh: "银灰阴影",
    en: "Silver Shadow",
    base: "classic",
    shade: "plain",
    background: "#e7e7e7",
    effect: "shadow",
    labels: "inside",
    legend: "right",
  },
  {
    id: "soft-pastel",
    zh: "柔和彩色",
    en: "Soft Pastel",
    base: "classic",
    shade: "soft",
    background: "#ffffff",
    outline: true,
  },
  {
    id: "emerald-gradient",
    zh: "清新柔光",
    en: "Fresh Glow",
    base: "emerald-gradient",
    shade: "light",
    background: "#ffffff",
    effect: "softEdge",
  },
  {
    id: "mono",
    zh: "灰底简约",
    en: "Grey Backdrop",
    base: "mono",
    shade: "plain",
    background: "#f1f5f9",
    legend: "right",
  },
  {
    id: "charcoal",
    zh: "深色立体",
    en: "Dark Depth",
    base: "classic",
    shade: "light",
    background: "#292929",
    effect: "threeD",
  },
  {
    id: "warm",
    zh: "内置标签",
    en: "Inside Labels",
    base: "warm",
    shade: "plain",
    background: "#ffffff",
    labels: "inside",
    legend: "top",
  },
  {
    id: "outside-labels",
    zh: "外侧标签",
    en: "Outside Labels",
    base: "classic",
    shade: "plain",
    background: "#ffffff",
    labels: "outside",
    legend: "none",
  },
  {
    id: "blueprint",
    zh: "深底白描",
    en: "White Outline on Dark",
    base: "classic",
    shade: "soft",
    background: "#1f2d44",
    darkOwnBackground: true,
    outline: true,
    labels: "inside",
    legend: "none",
  },
  {
    id: "vivid",
    zh: "明快光晕",
    en: "Vivid Glow",
    base: "vivid",
    shade: "light",
    background: "#f8fafc",
    effect: "glow",
    labels: "inside",
  },
  {
    id: "sculpted",
    zh: "立体边缘",
    en: "Sculpted Edge",
    base: "classic",
    shade: "light",
    background: "#ffffff",
    effect: "bevel",
    outline: true,
  },
] as const satisfies readonly DocumentChartStyle[];

/** MRAI's own looks, offered where Excel has no gallery for the chart type here. */
export type LegacyDocumentChartStyleId = (typeof DOCUMENT_CHART_STYLES)[number]["id"];
/** Excel's own Chart Styles, by their place in the chart type's gallery
 * (Style 1, Style 2, ...: `lib/office-charts/chart-style-gallery`). */
export type ExcelChartStyleId = `style-${number}`;
export type DocumentChartStyleId = LegacyDocumentChartStyleId | ExcelChartStyleId;
export const EXCEL_CHART_STYLE_IDS: readonly ExcelChartStyleId[] = Array.from(
  { length: CHART_STYLE_GALLERY_MAX },
  (_, index) => `style-${index + 1}` as ExcelChartStyleId,
);
/** Every style id a command may name: Excel's numbered styles, then MRAI's own. */
export const DOCUMENT_CHART_STYLE_IDS: readonly DocumentChartStyleId[] = [
  ...EXCEL_CHART_STYLE_IDS,
  ...DOCUMENT_CHART_STYLES.map((style) => style.id),
];
export const DOCUMENT_CHART_QUICK_STYLE_IDS = DOCUMENT_CHART_STYLES.slice(
  0,
  8,
).map((style) => style.id);

/** Style N of Excel's gallery, or null for one of MRAI's own looks. */
export function excelChartStyleNumber(id: string): number | null {
  const match = /^style-([1-9][0-9]?)$/.exec(id);
  return match ? Number(match[1]) : null;
}

/**
 * The styles the gallery offers this chart: Excel's own for its type
 * (Style 1 ... Style N, as Excel's Chart Design gallery numbers them), or
 * MRAI's own looks where Excel has no gallery for the type here yet.
 */
export function documentChartStylesFor(attrs: Pick<ChartBlockAttrsV2, "chartType" | "chartSubtype">): readonly DocumentChartStyleId[] {
  const gallery = chartStyleGalleryKey(attrs.chartType, attrs.chartSubtype);
  if (!gallery) return DOCUMENT_CHART_STYLES.map((style) => style.id);
  return chartStyleGalleryIds(gallery).map((_, index) => `style-${index + 1}` as ExcelChartStyleId);
}

/** The gallery's first row: Excel shows its styles in order, MRAI's quick eight first. */
export function documentChartQuickStylesFor(attrs: Pick<ChartBlockAttrsV2, "chartType" | "chartSubtype">): readonly DocumentChartStyleId[] {
  return chartStyleGalleryKey(attrs.chartType, attrs.chartSubtype)
    ? documentChartStylesFor(attrs).slice(0, 8)
    : DOCUMENT_CHART_QUICK_STYLE_IDS;
}

/** A style's name: Excel's "Style N", MRAI's own look's name. */
export function documentChartStyleLabel(
  t: (key: string, values?: Record<string, string | number>) => string,
  id: DocumentChartStyleId,
): string {
  const number = excelChartStyleNumber(id);
  return number !== null
    ? t("presentation.ui.chart.styleItem", { index: number })
    : t(`spreadsheet.sharedStyleCopy.chart.styles.${id}`);
}

const OWNED_FORMAT_KEYS = [
  "chartAreaStyle",
  "plotAreaStyle",
  "chartTitleStyle",
  "legendStyle",
  "seriesStyles",
  "sliceStyles",
  "dataLabels",
  "dataLabelStyle",
  "dataLabelPosition",
  "dataLabelValue",
  "dataLabelCategoryName",
  "dataLabelSeriesName",
  "dataLabelPercentage",
  "dataLabelBubbleSize",
  "dataLabelLegendKey",
  "dataLabelSeparator",
  "dataLabelLeaderLines",
  "legend",
] as const satisfies readonly (keyof ChartBlockFormat)[];

/** What a style paints the chart's series (a pie's points) from. */
export interface DocumentChartStylePaint {
  /** The host document's theme accents a Change Colors pick resolves against
   * (Office's own theme when the host states none). */
  accents?: readonly string[];
  /** The look an imported chart's part gives it, whose colours the chart
   * shows when it states no pick. */
  look?: ChartNativeLook;
}

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * The colours the chart shows for its first `count` series (points), as the
 * canvas resolves them: a Change Colors pick against the theme accents, else
 * the imported look's own colours, else the colours it already states, else
 * its preset's palette.
 */
export function documentChartOwnColors(
  attrs: ChartBlockAttrsV2,
  count: number,
  paint?: DocumentChartStylePaint,
): `#${string}`[] {
  const paletteId = chartTakesColorPalette(attrs.chartType)
    ? chartColorPaletteId(attrs)
    : null;
  const accents =
    paint?.look?.themeAccents?.length === 6
      ? paint.look.themeAccents
      : chartThemeAccents(paint?.accents);
  const points = attrs.chartType === "pie";
  const stated = ((points ? attrs.format?.sliceStyles : attrs.format?.seriesStyles) ??
    []) as readonly Record<string, unknown>[];
  const preset =
    CHART_STYLE_PRESETS[attrs.stylePreset ?? DEFAULT_CHART_STYLE_PRESET_ID]?.palette ??
    CHART_STYLE_PRESETS[DEFAULT_CHART_STYLE_PRESET_ID].palette;
  const hex = (value: unknown): `#${string}` | null =>
    typeof value === "string" && HEX.test(value) ? (value.toLowerCase() as `#${string}`) : null;
  return Array.from({ length: Math.max(0, count) }, (_, index) => {
    if (paletteId) {
      return chartColorPaletteColor(paletteId, accents, index, count) as `#${string}`;
    }
    const look = paint?.look?.points?.[index];
    const lookColor = hex(look?.fill && look.fill !== "none" ? look.fill : look?.outline);
    if (lookColor) return lookColor;
    const own = hex(
      stated.find((entry) => entry[points ? "pointIndex" : "seriesIndex"] === index)?.fill,
    );
    if (own) return own;
    return preset[index % preset.length] as `#${string}`;
  });
}

function styleBackground(
  style: DocumentChartStyle,
  own: readonly `#${string}`[],
): `#${string}` {
  if (!style.darkOwnBackground) return style.background;
  const first = own[0] ?? (CHART_STYLE_PRESETS.classic.palette[0] as `#${string}`);
  return tintColor(first, -0.55) as `#${string}`;
}

/** The chart-area colour a style gives this chart (a dark style's follows the
 * chart's first colour). */
export function documentChartStyleBackground(
  attrs: ChartBlockAttrsV2,
  id: DocumentChartStyleId,
  paint?: DocumentChartStylePaint,
): `#${string}` | null {
  const style: DocumentChartStyle | undefined = DOCUMENT_CHART_STYLES.find(
    (item) => item.id === id,
  );
  if (!style) return null;
  return styleBackground(style, documentChartOwnColors(attrs, 1, paint));
}

/**
 * Excel's style N of the chart type's gallery, on this chart: the format the
 * style writes, in the chart's own colours against the host theme. A format
 * key the chart type refuses is left out, so a style never fails a save.
 */
function excelChartStyleAttrs(
  attrs: ChartBlockAttrsV2,
  number: number,
  paint?: DocumentChartStylePaint,
): ChartBlockAttrsV2 | null {
  const gallery = chartStyleGalleryKey(attrs.chartType, attrs.chartSubtype);
  const styleId = gallery ? chartStyleGalleryIds(gallery)[number - 1] : undefined;
  if (styleId === undefined || !validateChartBlockAttrsV2(attrs).valid) return null;
  const count =
    attrs.chartType === "pie" && attrs.data.kind === "category"
      ? attrs.data.categories.length
      : "series" in attrs.data
        ? attrs.data.series.length
        : 0;
  const own = documentChartOwnColors(attrs, Math.max(1, count), paint);
  const accents =
    paint?.look?.themeAccents?.length === 6
      ? paint.look.themeAccents
      : chartThemeAccents(paint?.accents);
  const format = chartStyleFormat(attrs, styleId, {
    accents,
    own: (index) => own[index % Math.max(1, own.length)] ?? accents[index % 6],
  });
  if (!format) return null;
  let next: ChartBlockAttrsV2 = { ...attrs, format };
  // A key this chart type takes no style for is the style's to leave out.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const checked = validateChartBlockAttrsV2(next);
    if (checked.valid) return next;
    const keys = new Set(
      checked.issues
        .map((issue) => /^format\.([A-Za-z0-9]+)/.exec(issue.path)?.[1])
        .filter((key): key is string => Boolean(key)),
    );
    if (!keys.size) return null;
    const trimmed: Record<string, unknown> = { ...next.format };
    for (const key of keys) delete trimmed[key];
    next = { ...next, format: trimmed as ChartBlockFormat };
  }
  return null;
}

export function documentChartStyleAttrs(
  attrs: ChartBlockAttrsV2,
  id: DocumentChartStyleId,
  paint?: DocumentChartStylePaint,
): ChartBlockAttrsV2 | null {
  const number = excelChartStyleNumber(id);
  if (number !== null) return excelChartStyleAttrs(attrs, number, paint);
  const style: DocumentChartStyle | undefined = DOCUMENT_CHART_STYLES.find(
    (item) => item.id === id,
  );
  if (!style || !validateChartBlockAttrsV2(attrs).valid) return null;
  const format: ChartBlockFormat = { ...attrs.format };
  for (const key of OWNED_FORMAT_KEYS) delete format[key];
  const dark = id === "charcoal" || id === "blueprint";
  const count =
    attrs.chartType === "pie" && attrs.data.kind === "category"
      ? attrs.data.categories.length
      : "series" in attrs.data
        ? attrs.data.series.length
        : 0;
  // The colours the style paints: the chart's own, shaded (an outlined style
  // rims each in the colour itself, white on a dark backdrop). Office's Chart
  // Styles never change a chart's hues; Change Colors does.
  const own = documentChartOwnColors(attrs, count, paint);
  const background = styleBackground(style, own);
  // The frame styles (chart area, plot area, title, legend) every part
  // carries, the chartEx part of a treemap or a funnel included; the element
  // styles beyond them only the classic part does, and a key the save
  // refuses is never written (a treemap given a style failed every save,
  
  const elements = chartTakesAreaStyles(attrs.chartType);
  format.chartAreaStyle = { fill: background, outline: "none" };
  format.plotAreaStyle = {
    fill: dark ? "#ffffff" : background,
    outline: "none",
  };
  if (attrs.title) format.chartTitleStyle = {
    fill: background,
    outline: "none",
    textFill: dark ? "#ffffff" : "#334155",
  };
  format.legend = style.legend ?? "bottom";
  // Office's Chart Styles never box the legend: it sits on the chart area
  // with no fill of its own (a white box behind it, on a tinted or dark
  // chart area, was ours alone). On a dark style its words turn white.
  if (format.legend !== "none") {
    format.legendStyle = {
      fill: "none",
      outline: "none",
      ...(dark ? { text: { color: "#ffffff" } } : {}),
    };
  }
  if (chartSupportsDataLabels(attrs.chartType)) {
    format.dataLabels = Boolean(style.labels);
    if (style.labels) {
      format.dataLabelValue = attrs.chartType !== "pie";
      format.dataLabelCategoryName =
        style.labels === "outside" && attrs.chartType !== "xy";
      format.dataLabelPercentage = attrs.chartType === "pie";
    }
    if (style.labels === "inside") {
      if (
        chartDataLabelPositions(attrs.chartType, attrs.chartSubtype).includes(
          "center",
        )
      )
        format.dataLabelPosition = "center";
      // A label inside its bar is Office's white (bold) text on the bar, not
      // a white box over it; on a dark style the bars are soft tints, so the
      // words stay dark. The label's own paint is an element style too
      // (refused with the areas).
      if (elements) {
        format.dataLabelStyle = {
          fill: "none",
          outline: "none",
          text: { color: dark ? "#334155" : "#ffffff" },
        };
      }
    }
    // Let each chart family choose its native outside-label placement — and
    // state none where its own chart group may carry none (a `doughnutChart`
    // is one of the six ECMA-376 forbids a `c:dLblPos`).
    if (style.labels === "outside" && attrs.chartType === "pie") {
      if (
        chartDataLabelPositions(attrs.chartType, attrs.chartSubtype).includes(
          "outsideEnd",
        )
      )
        format.dataLabelPosition = "outsideEnd";
      format.dataLabelSeparator = ", ";
    }
  }
  const paintAt = (
    index: number,
  ): {
    fill: `#${string}`;
    outline: `#${string}`;
    effect?: PresentationChartEffectPreset;
  } => {
    const base = own[index] ?? (CHART_STYLE_PRESETS.classic.palette[index % 6] as `#${string}`);
    return {
      fill: tintColor(base, SHADE_TINT[style.shade]) as `#${string}`,
      outline: style.outline && !dark ? base : "#ffffff",
      ...(style.effect ? { effect: style.effect } : {}),
    };
  };
  if (attrs.chartType === "pie" && attrs.data.kind === "category") {
    // Per-slice paint is written on a 2-D pie or doughnut only; a Pie of
    // Pie, Bar of Pie or 3-D Pie takes the style's background, labels and
    // legend and keeps its colours (Office's Chart Styles leave the palette
    // to Change Colors). Painting them refused all twelve styles.
    if (attrs.chartSubtype !== "pie2d" && attrs.chartSubtype !== "doughnut") {
      const next = { ...attrs, stylePreset: style.base, format };
      return validateChartBlockAttrsV2(next).valid ? next : null;
    }
    format.sliceStyles = attrs.data.categories.map((_, pointIndex) => ({
      pointIndex,
      ...paintAt(pointIndex),
    }));
  } else if ("series" in attrs.data && chartTakesSeriesStyles(attrs.chartType)) {
    format.seriesStyles = attrs.data.series.map((_, seriesIndex) => ({
      seriesIndex,
      ...paintAt(seriesIndex),
    }));
  }
  const next = { ...attrs, stylePreset: style.base, format };
  return validateChartBlockAttrsV2(next).valid ? next : null;
}

/** The format keys only a Chart Styles recipe writes: a chart without any of
 * them, on the default preset, wears no style but the first. */
const STYLE_ONLY_FORMAT_KEYS = [
  "chartAreaStyle",
  "plotAreaStyle",
  "chartTitleStyle",
  "legendStyle",
  "dataLabelStyle",
] as const satisfies readonly (keyof ChartBlockFormat)[];

/**
 * Whether the chart wears no Chart Style: the default preset, none of the
 * frame paint a recipe writes, and no series effect. Office's gallery shows
 * such a chart on Style 1 - its default - and so does ours; moving its legend
 * or turning on its labels (Chart Elements) does not take it off the style.
 */
export function documentChartWearsNoStyle(attrs: ChartBlockAttrsV2): boolean {
  if ((attrs.stylePreset ?? DEFAULT_CHART_STYLE_PRESET_ID) !== DEFAULT_CHART_STYLE_PRESET_ID) {
    return false;
  }
  const format = attrs.format ?? {};
  if (STYLE_ONLY_FORMAT_KEYS.some((key) => format[key] !== undefined)) return false;
  const paints = [
    ...((format.seriesStyles ?? []) as readonly Record<string, unknown>[]),
    ...((format.sliceStyles ?? []) as readonly Record<string, unknown>[]),
  ];
  return !paints.some((entry) => entry.effect !== undefined);
}

export function activeDocumentChartStyle(
  attrs: ChartBlockAttrsV2,
  paint?: DocumentChartStylePaint,
): DocumentChartStyleId | null {
  const stable = (value: unknown): string =>
    JSON.stringify(value, (_key, item) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? Object.fromEntries(
            Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
          )
        : item,
    );
  const offered = documentChartStylesFor(attrs);
  const worn = offered.find((id) => {
    const next = documentChartStyleAttrs(attrs, id, paint);
    return (
      next?.stylePreset === attrs.stylePreset &&
      stable(next.format) === stable(attrs.format)
    );
  });
  if (worn) return worn;
  // A chart nobody styled wears its gallery's first style, as in Excel.
  return documentChartWearsNoStyle(attrs) ? offered[0] ?? null : null;
}
