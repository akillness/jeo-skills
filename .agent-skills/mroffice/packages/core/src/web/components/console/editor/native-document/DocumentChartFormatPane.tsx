"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { EMU_PER_PT, EMU_PER_PX, PX_PER_PT } from "../../../../lib/office-units";
import { OFFICE_CHART_MAX_SOFT_EDGE_PT } from "../../../../lib/office-chart-shape-paint";
import { OFFICE_GLOW_ACCENTS, OFFICE_GLOW_SIZES_PT, officeGlowVariation } from "../../../../lib/office-picture-effects";
import { useState, type ReactNode, type RefObject } from "react";
import { OfficeHomeMenuTrigger } from "../../../office-ribbon/OfficeHomeRibbon";
import { OfficeSemanticIcon } from "../../../office-ribbon/icons/OfficeSemanticIcon";
import {
  OfficeShapeFormatPane,
  officeShapeFormatPaneStyles as paneStyles,
  type OfficeShapeFormatPaneField,
  type OfficeShapeFormatPaneSection,
  type OfficeShapeFormatPaneTab,
} from "../../../office-ribbon/OfficeShapeFormatPane";
import {
  CHART_HOST_EMU_PER_CM,
  MAX_DOCUMENT_CHART_EMU,
  type DocumentChartSize,
} from "../extensions/documentChartHost";
import {
  PRESENTATION_CHART_EFFECT_PRESETS,
  presentationChartAreaDrawsEffect,
  type PresentationChartEffectPreset,
} from "../../../../lib/presentation-chart-area-style";
import styles from "./DocumentShapeFormatPane.module.css";
import {
  officeChartFillLineSections,
  officeChartSwatchColor,
  type OfficeChartPaintStyle,
} from "../../../office-ribbon/officeChartFillLinePage";
import type { ChartMarkerSymbol } from "../../../../lib/presentation-chart-area-style";
import type { OfficeShapeShadow } from "../../../../lib/office-shape-paint";
import {
  officeEffectsPaneSections,
  type OfficeEffectsPaneArgs,
  type OfficeEffectsPaneLabels,
} from "../../../office-ribbon/officeEffectsPaneSections";
import {
  normalizeOfficeChartAxisOptions,
  OFFICE_CHART_AXIS_TYPES,
  OFFICE_CHART_BASE_TIME_UNITS,
  OFFICE_CHART_DISPLAY_UNITS,
  OFFICE_CHART_MAX_SKIP,
  OFFICE_CHART_TICK_LABEL_POSITIONS,
  OFFICE_CHART_TICK_MARKS,
  type OfficeChartAxisOptions,
} from "../../../../lib/office-charts/axis-options";
import { applyNumberFormat } from "../../../../lib/spreadsheet/number-format";
import { localizedNumberFormatGallery, numberFormatGalleryItem } from "../../../../lib/spreadsheet/number-format-gallery";
import {
  MAX_CHART_HISTOGRAM_BIN_COUNT,
  normalizeChartHistogramBins,
  type ChartHistogramBins,
} from "../extensions/chartBlockShared";


/** Office's Format Axis > Axis Options for the axis the pane is formatting. */
export interface DocumentChartFormatPaneAxisOptions {
  /** "series": a 3-D chart's Depth (Series) Axis, whose page is Excel's:
   * Series in reverse order, the two intervals, tick marks, label position. */
  readonly kind: "category" | "value" | "series";
  readonly value: OfficeChartAxisOptions | null;
  readonly onChange: (next: OfficeChartAxisOptions | null) => void;
  /** The category axis has multi-level categories: Office's Labels group
   * then offers "Multi-level Category Labels" (and only then). */
  readonly multiLevel?: boolean;
  /** The other axis this one is crossed by, as Office names it on this
   * axis's pane: "Horizontal axis crosses" on a vertical axis, "Vertical
   * axis crosses" on a horizontal one. */
  readonly crossedBy?: "horizontal" | "vertical";
  /** A histogram's or pareto's horizontal axis: Office's Bins group
   * (`format.histogramBins`), which is that axis's whole Axis Options page --
   * a binned axis has no type, crossing or tick spacing of its own. */
  readonly bins?: {
    readonly value: ChartHistogramBins | null;
    readonly onChange: (next: ChartHistogramBins | null) => void;
  };
}

interface Props {
  area: string;
  areas: readonly { value: string; label: string }[];
  fill?: string;
  outline?: string;
  effect?: PresentationChartEffectPreset;
  fillAvailable: boolean;
  hasStyle: boolean;
  disabledReason: string | null;
  isChinese: boolean;
  translate?: (key: string, values?: Record<string, string | number>) => string;
  fillRef: RefObject<HTMLButtonElement | null>;
  outlineRef: RefObject<HTMLButtonElement | null>;
  onArea: (area: string) => void;
  onOpenPalette: (field: "fill" | "outline") => void;
  activePalette?: "fill" | "outline" | null;
  onRememberSelection: () => void;
  onReset: () => void;
  onEffect?: (effect: PresentationChartEffectPreset | null) => void;
  onClose: () => void;
  size?: DocumentChartSize;
  maxSizeEmu?: number;
  onRememberSize?: () => void;
  onSize?: (axis: keyof DocumentChartSize, emu: number) => boolean;
  /** Why the object's size cannot change, when that differs from the
   * chart's own reason (a preserve-only chart's frame still resizes, as its
   * ribbon Size group and handles do). Defaults to `disabledReason`. */
  sizeDisabledReason?: string | null;
  /** Sections the host adds to Size & Properties under Size (a worksheet
   * chart's Properties: how it follows the cells). Absent: Size alone. */
  sizePropertiesSections?: readonly OfficeShapeFormatPaneSection[];
  /** The host's options for the selected element (see the ribbon's
   * `paneOptions`). */
  options?: ReactNode;
  /** Office's Axis Options page, when the selected element is an axis and
   * the host writes the shared record. */
  axisOptions?: DocumentChartFormatPaneAxisOptions;
  headerActions?: ReactNode;
  /** Office's options page of the element being formatted (Legend Options,
   * Label Options, Data Table / Error Bar / Trendline Options), built by the
   * shared chart menu module from the picks its submenu offers. */
  elementPage?: { title: string; sections: OfficeShapeFormatPaneSection[] } | null;
  /** An element with no paint of its own (one point, whose fill and line are
   * its series'): its pane has no Fill & Line or Effects page. */
  paintless?: boolean;
  /** Where the host places the pane (Docs' floating card is the default);
   * a host whose class already docks it (the deck's stage) passes it here. */
  className?: string;
  /**
   * The element's style record and its writer: with them the Fill & Line
   * page is Office's whole page (every fill and line kind, transparency,
   * gradient stops, width, compound, dash, cap, join, arrows) and Effects
   * takes a shadow's own colour, transparency, blur, angle and distance.
   * Without them the page offers the two colours alone, as before.
   */
  style?: OfficeChartPaintStyle;
  onStyle?: (next: OfficeChartPaintStyle) => void;
  /**
   * The shapes' Effects pane words: with them, a series' or a data point's
   * Effects page takes Office's 3-D Format (Top and Bottom bevel, Depth,
   * Contour, Material, Lighting) in the shapes' own section.
   */
  effectsLabels?: OfficeEffectsPaneLabels;
  /**
   * The chart's theme accents, accent 1 to 6: the Glow presets paint in
   * them (Office's "Glow: 5 point; Blue, Accent color 1" is the chart's
   * theme's accent 1). Absent: Office's own theme.
   */
  accentColors?: readonly string[];
  chartType?: string;
  /** The colours the element draws while its paint is automatic. */
  automaticFill?: string;
  automaticLine?: string;
  /** A line or scatter series' Smoothed line, as it draws. */
  smooth?: { checked: boolean };
  /** A series that draws markers: its marker (absent: automatic). */
  marker?: { symbol?: ChartMarkerSymbol; size?: number };
  /** The chart area's Rounded corners and their writer. */
  roundedCorners?: { checked: boolean; onChange: (checked: boolean) => void };
}

/** Office's own theme's accents, the Effects presets' when the host states none. */
const OFFICE_EFFECT_ACCENTS = ["#4472c4", "#ed7d31", "#a5a5a5", "#ffc000", "#5b9bd5", "#70ad47"] as const;

/** The six accents the Effects presets paint in, by name. */
function chartEffectAccents(accents: readonly string[] | undefined): OfficeEffectsPaneArgs["accentColors"] {
  const valid = accents?.length === 6 && accents.every((color) => /^#[0-9a-f]{6}$/i.test(color));
  const six = valid ? accents : OFFICE_EFFECT_ACCENTS;
  return Object.fromEntries(
    six.map((color, index) => [`accent${index + 1}`, color.toLowerCase()]),
  ) as OfficeEffectsPaneArgs["accentColors"];
}

/** The outer shadow Office's Shadow presets start from (Outer, Offset:
 * Bottom Right): black at 60 % transparency, 4 pt blur, 3 pt away at 45°.
 * The model's blur and distance are pixels. */
const DEFAULT_CHART_SHADOW: OfficeShapeShadow = { color: "#000000", opacity: 0.4, blur: 5, distance: 4, direction: 45 };
/** Points as the model's shadow pixels, on the file's EMU grid (12 700 EMU a
 * point, 9 525 a pixel), so what is written reads back the same. */
const pointsAsShadowPixels = (points: number) => Math.round(points * EMU_PER_PT) / EMU_PER_PX;

type Word = (
  key: string,
  zh: string,
  en: string,
  values?: Record<string, string | number>,
) => string;

/**
 * Office's Format Axis > Axis Options > Bins on a histogram's or pareto's
 * horizontal axis (Microsoft Support, "Create a histogram"): By Category,
 * Automatic, Bin width or Number of bins, and an Overflow and an Underflow
 * bin, each a check box with its cut-off (left empty: Office's automatic
 * cut-off). Every change states the whole setting again.
 */
function binOptionSection(
  bins: NonNullable<DocumentChartFormatPaneAxisOptions["bins"]>,
  disabledReason: string | null,
  word: Word,
): OfficeShapeFormatPaneSection {
  const current = bins.value ?? {};
  const disabled = disabledReason !== null;
  const reason = disabledReason ?? undefined;
  const mode = current.byCategory
    ? "byCategory"
    : current.binWidth !== undefined
      ? "width"
      : current.binCount !== undefined
        ? "count"
        : "auto";
  const write = (next: Record<string, unknown>) => {
    for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
    if (!Object.keys(next).length) {
      bins.onChange(null);
      return true;
    }
    const normalized = normalizeChartHistogramBins(next);
    if (!normalized) return false;
    bins.onChange(normalized);
    return true;
  };
  const tails = { overflow: current.overflow, underflow: current.underflow };
  const labels = {
    bins: word("spreadsheet.chartBins", "箱", "Bins"),
    byCategory: word("spreadsheet.chartBinsByCategory", "按类别", "By Category"),
    automatic: word("spreadsheet.chartBinsAutomatic", "自动", "Automatic"),
    width: word("spreadsheet.chartBinsWidth", "箱宽度", "Bin width"),
    count: word("spreadsheet.chartBinsCount", "箱数", "Number of bins"),
    overflow: word("spreadsheet.chartBinsOverflow", "溢出箱", "Overflow bin"),
    underflow: word("spreadsheet.chartBinsUnderflow", "下溢箱", "Underflow bin"),
    auto: word("spreadsheet.chartFormatCopy.axis.auto", "自动", "Auto"),
  };
  const amountField: OfficeShapeFormatPaneField[] =
    mode === "width" || mode === "count"
      ? [
          {
            kind: "number",
            id: "axis-bins-amount",
            label: mode === "width" ? labels.width : labels.count,
            value: (mode === "width" ? current.binWidth : current.binCount) ?? "",
            min: mode === "width" ? 0 : 1,
            max: mode === "count" ? MAX_CHART_HISTOGRAM_BIN_COUNT : undefined,
            step: mode === "count" ? 1 : undefined,
            disabled,
            disabledReason: reason,
            onCommit: (raw) => {
              const amount = Number(raw.trim());
              if (raw.trim() === "" || !Number.isFinite(amount) || amount <= 0) return false;
              return write(
                mode === "width"
                  ? { ...tails, binWidth: amount }
                  : { ...tails, binCount: Math.max(1, Math.min(MAX_CHART_HISTOGRAM_BIN_COUNT, Math.round(amount))) },
              );
            },
          },
        ]
      : [];
  const tailFields = (["overflow", "underflow"] as const).flatMap((bound): OfficeShapeFormatPaneField[] => {
    const value = current[bound];
    return [
      {
        kind: "checkbox",
        id: `axis-bins-${bound}`,
        label: labels[bound],
        checked: value !== undefined,
        disabled: disabled || mode === "byCategory",
        disabledReason: reason,
        onChange: (checked) => {
          write({
            binWidth: current.binWidth,
            binCount: current.binCount,
            ...tails,
            [bound]: checked ? "auto" : undefined,
          });
        },
      },
      ...(value !== undefined
        ? [
            {
              kind: "number" as const,
              id: `axis-bins-${bound}-value`,
              label: labels[bound],
              value: typeof value === "number" ? value : "",
              placeholder: labels.auto,
              disabled,
              disabledReason: reason,
              onCommit: (raw: string) => {
                const text = raw.trim();
                const cutoff = text === "" ? "auto" : Number(text);
                if (cutoff !== "auto" && !Number.isFinite(cutoff)) return false;
                if (cutoff === value) return true;
                return write({
                  binWidth: current.binWidth,
                  binCount: current.binCount,
                  ...tails,
                  [bound]: cutoff,
                });
              },
            },
          ]
        : []),
    ];
  });
  return {
    id: "axis-bins",
    testId: "document-chart-format-pane-axis-bins",
    title: labels.bins,
    fields: [
      {
        kind: "select",
        id: "axis-bins-mode",
        label: labels.bins,
        value: mode,
        options: [
          { value: "byCategory", label: labels.byCategory },
          { value: "auto", label: labels.automatic },
          { value: "width", label: labels.width },
          { value: "count", label: labels.count },
        ],
        disabled,
        disabledReason: reason,
        onChange: (value) => {
          if (value === mode) return;
          if (value === "byCategory") {
            bins.onChange({ byCategory: true });
            return;
          }
          // Office keeps the overflow and underflow bins across the choice.
          write({
            ...tails,
            ...(value === "width"
              ? { binWidth: current.binWidth ?? 1 }
              : value === "count"
                ? { binCount: current.binCount ?? 5 }
                : {}),
          });
        },
      },
      ...amountField,
      ...tailFields,
    ],
  };
}

/**
 * Office's Format Axis > Axis Options page, as the pane's sections: Axis
 * Options (bounds, units, display units, logarithmic scale, reverse order),
 * Tick Marks, Labels and Number -- the groups Word, Excel and PowerPoint
 * draw on that page. A bound or unit left empty is Office's "Auto".
 */
export function axisOptionSections(
  axis: DocumentChartFormatPaneAxisOptions,
  disabledReason: string | null,
  word: Word,
  /** The chart's type: an area chart's categories sit on the tick marks
   * until the axis states otherwise. */
  chartType?: string,
  /** The UI locale: Number's Category list is the region's own. */
  locale = "en",
): OfficeShapeFormatPaneSection[] {
  if (axis.bins) return [binOptionSection(axis.bins, disabledReason, word)];
  const gallery = localizedNumberFormatGallery(locale);
  const current = axis.value ?? {};
  const disabled = disabledReason !== null;
  const reason = disabledReason ?? undefined;
  const patch = (fields: Record<string, unknown>) => {
    const next: Record<string, unknown> = { ...current, ...fields };
    for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
    axis.onChange(normalizeOfficeChartAxisOptions(next));
  };
  // Every label is one literal key so the copy catalog can be checked.
  const labels = {
    options: word("spreadsheet.chartFormatCopy.axis.options", "坐标轴选项", "Axis Options"),
    tickMarks: word("spreadsheet.chartFormatCopy.axis.tickMarks", "刻度线", "Tick Marks"),
    labels: word("spreadsheet.chartFormatCopy.axis.labels", "标签", "Labels"),
    number: word("spreadsheet.chartFormatCopy.axis.number", "数字", "Number"),
    auto: word("spreadsheet.chartFormatCopy.axis.auto", "自动", "Auto"),
    min: word("spreadsheet.chartFormatCopy.axis.min", "最小值", "Minimum"),
    max: word("spreadsheet.chartFormatCopy.axis.max", "最大值", "Maximum"),
    minAboveMax: word("spreadsheet.chartFormatCopy.axis.minAboveMax", "最小值必须小于最大值。", "The minimum must be less than the maximum."),
    maxBelowMin: word("spreadsheet.chartFormatCopy.axis.maxBelowMin", "最大值必须大于最小值。", "The maximum must be greater than the minimum."),
    majorUnit: word("spreadsheet.chartFormatCopy.axis.majorUnit", "主要单位", "Major unit"),
    minorUnit: word("spreadsheet.chartFormatCopy.axis.minorUnit", "次要单位", "Minor unit"),
    displayUnits: word("spreadsheet.chartFormatCopy.axis.displayUnits", "显示单位", "Display units"),
    showDisplayUnitsLabel: word("spreadsheet.chartFormatCopy.axis.showDisplayUnitsLabel", "在图表上显示单位标签", "Show display units label on chart"),
    logBase: word("spreadsheet.chartFormatCopy.axis.logBase", "对数刻度", "Logarithmic scale"),
    reverse: word("spreadsheet.chartFormatCopy.axis.reverse", "逆序刻度值", "Values in reverse order"),
    reverseCategories: word("spreadsheet.chartFormatCopy.axis.reverseCategories", "逆序类别", "Categories in reverse order"),
    reverseSeries: word("spreadsheet.chartFormatCopy.axis.reverseSeries", "逆序系列", "Series in reverse order"),
    majorTickMark: word("spreadsheet.chartFormatCopy.axis.majorTickMark", "主刻度线类型", "Major tick mark type"),
    minorTickMark: word("spreadsheet.chartFormatCopy.axis.minorTickMark", "次刻度线类型", "Minor tick mark type"),
    labelPosition: word("spreadsheet.chartFormatCopy.axis.labelPosition", "标签位置", "Label position"),
    numberFormat: word("spreadsheet.chartFormatCopy.axis.numberFormat", "数字格式代码", "Number format code"),
    linked: word("spreadsheet.chartFormatCopy.axis.linked", "链接到源", "Linked to source"),
    tickNone: word("spreadsheet.chartFormatCopy.axis.tick.none", "无", "None"),
    tickIn: word("spreadsheet.chartFormatCopy.axis.tick.in", "内部", "Inside"),
    tickOut: word("spreadsheet.chartFormatCopy.axis.tick.out", "外部", "Outside"),
    tickCross: word("spreadsheet.chartFormatCopy.axis.tick.cross", "交叉", "Cross"),
    labelNextTo: word("spreadsheet.chartFormatCopy.axis.label.nextTo", "轴旁", "Next to Axis"),
    labelHigh: word("spreadsheet.chartFormatCopy.axis.label.high", "高", "High"),
    labelLow: word("spreadsheet.chartFormatCopy.axis.label.low", "低", "Low"),
    labelNone: word("spreadsheet.chartFormatCopy.axis.label.none", "无", "None"),
    unitNone: word("spreadsheet.chartFormatCopy.axis.unit.none", "无", "None"),
    unitHundreds: word("spreadsheet.chartFormatCopy.axis.unit.hundreds", "百", "Hundreds"),
    unitThousands: word("spreadsheet.chartFormatCopy.axis.unit.thousands", "千", "Thousands"),
    unitTenThousands: word("spreadsheet.chartFormatCopy.axis.unit.tenThousands", "万", "10000"),
    unitHundredThousands: word("spreadsheet.chartFormatCopy.axis.unit.hundredThousands", "十万", "100000"),
    unitMillions: word("spreadsheet.chartFormatCopy.axis.unit.millions", "百万", "Millions"),
    unitTenMillions: word("spreadsheet.chartFormatCopy.axis.unit.tenMillions", "千万", "10000000"),
    unitHundredMillions: word("spreadsheet.chartFormatCopy.axis.unit.hundredMillions", "亿", "100000000"),
    unitBillions: word("spreadsheet.chartFormatCopy.axis.unit.billions", "十亿", "Billions"),
    unitTrillions: word("spreadsheet.chartFormatCopy.axis.unit.trillions", "万亿", "Trillions"),
    axisType: word("spreadsheet.chartFormatCopy.axis.axisType", "坐标轴类型", "Axis Type"),
    axisTypeAuto: word("spreadsheet.chartFormatCopy.axis.axisTypeAuto", "根据数据自动选择", "Automatically select based on data"),
    axisTypeText: word("spreadsheet.chartFormatCopy.axis.axisTypeText", "文本坐标轴", "Text axis"),
    axisTypeDate: word("spreadsheet.chartFormatCopy.axis.axisTypeDate", "日期坐标轴", "Date axis"),
    baseTimeUnit: word("spreadsheet.chartFormatCopy.axis.baseTimeUnit", "基本单位", "Base"),
    baseDays: word("spreadsheet.chartFormatCopy.axis.base.days", "天", "Days"),
    baseMonths: word("spreadsheet.chartFormatCopy.axis.base.months", "月", "Months"),
    baseYears: word("spreadsheet.chartFormatCopy.axis.base.years", "年", "Years"),
    tickMarkSkip: word("spreadsheet.chartFormatCopy.axis.tickMarkSkip", "刻度线间隔", "Interval between tick marks"),
    tickLabelSkip: word("spreadsheet.chartFormatCopy.axis.tickLabelSkip", "标签间隔", "Interval between labels"),
    labelOffset: word("spreadsheet.chartFormatCopy.axis.labelOffset", "与坐标轴的距离", "Distance from axis"),
    multiLevelLabels: word("spreadsheet.chartFormatCopy.axis.multiLevelLabels", "多级分类标签", "Multi-level Category Labels"),
    logBaseValue: word("spreadsheet.chartFormatCopy.axis.logBaseValue", "底数", "Base"),
    horizontalCrosses: word("spreadsheet.chartFormatCopy.axis.horizontalCrosses", "横坐标轴交叉", "Horizontal axis crosses"),
    verticalCrosses: word("spreadsheet.chartFormatCopy.axis.verticalCrosses", "纵坐标轴交叉", "Vertical axis crosses"),
    crossesAuto: word("spreadsheet.chartFormatCopy.axis.crossesAuto", "自动", "Automatic"),
    crossesValue: word("spreadsheet.chartFormatCopy.axis.crossesValue", "坐标轴值", "Axis value"),
    crossesMax: word("spreadsheet.chartFormatCopy.axis.crossesMax", "最大坐标轴值", "Maximum axis value"),
    crossesCategory: word("spreadsheet.chartFormatCopy.axis.crossesCategory", "分类编号", "At category number"),
    crossesMaxCategory: word("spreadsheet.chartFormatCopy.axis.crossesMaxCategory", "最大分类", "At maximum category"),
    crossesAt: word("spreadsheet.chartFormatCopy.axis.crossesAt", "交叉位置", "Crosses at"),
    axisPosition: word("spreadsheet.chartFormatCopy.axis.axisPosition", "坐标轴位置", "Axis position"),
    onTickMarks: word("spreadsheet.chartFormatCopy.axis.onTickMarks", "在刻度线上", "On tick marks"),
    betweenTickMarks: word("spreadsheet.chartFormatCopy.axis.betweenTickMarks", "刻度线之间", "Between tick marks"),
  };
  const tickLabel: Record<string, string> = { none: labels.tickNone, in: labels.tickIn, out: labels.tickOut, cross: labels.tickCross };
  const positionLabel: Record<string, string> = { nextTo: labels.labelNextTo, high: labels.labelHigh, low: labels.labelLow, none: labels.labelNone };
  const axisTypeLabel: Record<string, string> = { text: labels.axisTypeText, date: labels.axisTypeDate };
  const baseLabel: Record<string, string> = { days: labels.baseDays, months: labels.baseMonths, years: labels.baseYears };
  const unitLabel: Record<string, string> = {
    hundreds: labels.unitHundreds, thousands: labels.unitThousands, tenThousands: labels.unitTenThousands,
    hundredThousands: labels.unitHundredThousands, millions: labels.unitMillions, tenMillions: labels.unitTenMillions,
    hundredMillions: labels.unitHundredMillions, billions: labels.unitBillions, trillions: labels.unitTrillions,
  };
  const numberField = (key: "min" | "max" | "majorUnit" | "minorUnit"): OfficeShapeFormatPaneField => ({
    kind: "number",
    id: `axis-${key}`,
    label: labels[key],
    value: current[key] ?? "",
    placeholder: labels.auto,
    disabled,
    disabledReason: reason,
    // A minimum at or above the fixed maximum (or a maximum at or below the
    // fixed minimum) is not a range: the draft stays to be corrected, the
    // other, valid bound is left alone -- the record's normaliser would
    // otherwise drop both -- and the field says why the chart did not take
    // it (S-081: 2000 stood in the box over an axis still drawn from 20).
    invalidReason: (raw) => {
      const text = raw.trim();
      const value = text === "" ? undefined : Number(text);
      if (value === undefined || !Number.isFinite(value)) return null;
      if (key === "min" && current.max !== undefined && value >= current.max) return labels.minAboveMax;
      if (key === "max" && current.min !== undefined && value <= current.min) return labels.maxBelowMin;
      return null;
    },
    onCommit: (raw) => {
      const text = raw.trim();
      const value = text === "" ? undefined : Number(text);
      if (value !== undefined && !Number.isFinite(value)) return false;
      if (
        value !== undefined &&
        ((key === "min" && current.max !== undefined && value >= current.max) ||
          (key === "max" && current.min !== undefined && value <= current.min))
      ) {
        return false;
      }
      if (value !== current[key]) patch({ [key]: value });
      return true;
    },
  });
  // Whole-number fields of a category axis: the intervals (at least 1, blank
  // = Automatic) and the labels' distance (0..1000, blank = 100).
  const wholeField = (
    key: "tickLabelSkip" | "tickMarkSkip" | "labelOffset",
  ): OfficeShapeFormatPaneField => ({
    kind: "number",
    id: `axis-${key}`,
    label: labels[key],
    value: current[key] ?? "",
    placeholder: key === "labelOffset" ? "100" : labels.auto,
    disabled,
    disabledReason: reason,
    onCommit: (raw) => {
      const text = raw.trim();
      const value = text === "" ? undefined : Number(text);
      const low = key === "labelOffset" ? 0 : 1;
      const high = key === "labelOffset" ? 1000 : OFFICE_CHART_MAX_SKIP;
      if (value !== undefined && (!Number.isInteger(value) || value < low || value > high)) return false;
      if (value !== current[key]) patch({ [key]: value });
      return true;
    },
  });
  const dateAxis = axis.kind === "category" && current.axisType === "date";
  const selectField = (
    key: "majorTickMark" | "minorTickMark" | "labelPosition" | "displayUnits" | "axisType" | "baseTimeUnit",
    choices: readonly string[],
    labelOf: Record<string, string>,
    none: string,
  ): OfficeShapeFormatPaneField => ({
    kind: "select",
    id: `axis-${key}`,
    label: labels[key],
    value: (current[key] as string | undefined) ?? "",
    options: [
      { value: "", label: none },
      ...choices.map((choice) => ({ value: choice, label: labelOf[choice] ?? choice })),
    ],
    disabled,
    disabledReason: reason,
    onChange: (value) => {
      // Excel shows the units label when a display unit is first chosen
      // ("Thousands" beside the axis, its box checked); None takes it away,
      // and moving between units keeps whatever the box says.
      if (key === "displayUnits") {
        const unit = value || undefined;
        patch({
          displayUnits: unit,
          showDisplayUnitsLabel: unit ? (current.displayUnits ? current.showDisplayUnitsLabel : true) : undefined,
        });
        return;
      }
      patch({ [key]: value || undefined });
    },
  });
  const checkbox = (
    key: "logBase" | "reverse" | "showDisplayUnitsLabel",
    label: string,
  ): OfficeShapeFormatPaneField => ({
    kind: "checkbox",
    id: `axis-${key}`,
    label,
    checked: key === "logBase" ? current.logBase !== undefined : current[key] === true,
    disabled,
    disabledReason: reason,
    onChange: (checked) =>
      patch(
        key === "logBase"
          ? { logBase: checked ? 10 : undefined }
          : { [key]: checked ? true : undefined },
      ),
  });
  // Office's "Horizontal / Vertical axis crosses": where the other axis
  // crosses this one -- Automatic (zero, or the first category), at a value
  // (a category number on a category axis), or at this axis's maximum
  // (`crosses`: autoZero | max, or a number).
  const crossing = current.crosses;
  const crossingMode = typeof crossing === "number" ? "value" : crossing === "max" ? "max" : "auto";
  const categoryCrossing = axis.kind === "category";
  const crossingFields: OfficeShapeFormatPaneField[] = [
    {
      kind: "select",
      id: "axis-crosses",
      label: axis.crossedBy === "vertical" ? labels.verticalCrosses : labels.horizontalCrosses,
      value: crossingMode,
      options: [
        { value: "auto", label: labels.crossesAuto },
        { value: "value", label: categoryCrossing ? labels.crossesCategory : labels.crossesValue },
        { value: "max", label: categoryCrossing ? labels.crossesMaxCategory : labels.crossesMax },
      ],
      disabled,
      disabledReason: reason,
      onChange: (value) =>
        patch({
          crosses:
            value === "max"
              ? "max"
              : value === "value"
                ? (typeof crossing === "number" ? crossing : categoryCrossing ? 1 : 0)
                : undefined,
        }),
    },
    ...(crossingMode === "value"
      ? [
          {
            kind: "number" as const,
            id: "axis-crossesAt",
            label: labels.crossesAt,
            value: typeof crossing === "number" ? crossing : "",
            step: categoryCrossing ? 1 : undefined,
            min: categoryCrossing ? 1 : undefined,
            disabled,
            disabledReason: reason,
            onCommit: (raw: string) => {
              const value = Number(raw.trim());
              if (raw.trim() === "" || !Number.isFinite(value) || (categoryCrossing && (!Number.isInteger(value) || value < 1)))
                return false;
              if (value !== crossing) patch({ crosses: value });
              return true;
            },
          },
        ]
      : []),
  ];
  // Logarithmic scale ▸ Base: 10 by default, 2 .. 1000 (`c:logBase`).
  const logBaseField: OfficeShapeFormatPaneField[] =
    current.logBase !== undefined
      ? [
          {
            kind: "number",
            id: "axis-logBaseValue",
            label: labels.logBaseValue,
            value: current.logBase,
            min: 2,
            max: 1000,
            step: 1,
            disabled,
            disabledReason: reason,
            onCommit: (raw) => {
              const value = Number(raw.trim());
              if (raw.trim() === "" || !Number.isFinite(value) || value < 2 || value > 1000) return false;
              if (value !== current.logBase) patch({ logBase: value });
              return true;
            },
          },
        ]
      : [];
  if (axis.kind === "series") {
    // Microsoft Support, "Change the display of a 3-D chart": the depth
    // axis's Format Axis page -- Series in reverse order, Interval between
    // tick marks / labels, the tick mark types and the label position. It
    // has no bounds, crossing or number of its own (its labels are the
    // series' names).
    return [
      {
        id: "axis-options",
        testId: "document-chart-format-pane-axis-options",
        title: labels.options,
        fields: [checkbox("reverse", labels.reverseSeries)],
      },
      {
        id: "axis-tick-marks",
        title: labels.tickMarks,
        fields: [
          wholeField("tickMarkSkip"),
          selectField("majorTickMark", OFFICE_CHART_TICK_MARKS, tickLabel, labels.auto),
          selectField("minorTickMark", OFFICE_CHART_TICK_MARKS, tickLabel, labels.auto),
        ],
      },
      {
        id: "axis-labels",
        title: labels.labels,
        fields: [
          wholeField("tickLabelSkip"),
          selectField("labelPosition", OFFICE_CHART_TICK_LABEL_POSITIONS, positionLabel, labels.auto),
        ],
      },
    ];
  }
  return [
    {
      id: "axis-options",
      testId: "document-chart-format-pane-axis-options",
      title: labels.options,
      fields:
        axis.kind === "value"
          ? [
              numberField("min"),
              numberField("max"),
              numberField("majorUnit"),
              numberField("minorUnit"),
              selectField("displayUnits", OFFICE_CHART_DISPLAY_UNITS, unitLabel, labels.unitNone),
              ...(current.displayUnits
                ? [checkbox("showDisplayUnitsLabel", labels.showDisplayUnitsLabel)]
                : []),
              ...crossingFields,
              checkbox("logBase", labels.logBase),
              ...logBaseField,
              checkbox("reverse", labels.reverse),
            ]
          : [
              // Office's Axis Type; a date axis takes a base unit, a text
              // axis its intervals (Tick Marks / Labels below).
              selectField("axisType", OFFICE_CHART_AXIS_TYPES, axisTypeLabel, labels.axisTypeAuto),
              ...(dateAxis
                ? [selectField("baseTimeUnit", OFFICE_CHART_BASE_TIME_UNITS, baseLabel, labels.auto)]
                : []),
              ...crossingFields,
              // Axis position: between tick marks (Office's default for a
              // new column or line chart) or on them.
              ...(dateAxis
                ? []
                : [
                    {
                      kind: "select" as const,
                      id: "axis-axisPosition",
                      label: labels.axisPosition,
                      value: current.axisPosition ?? (chartType === "area" ? "onTickMarks" : "between"),
                      options: [
                        { value: "onTickMarks", label: labels.onTickMarks },
                        { value: "between", label: labels.betweenTickMarks },
                      ],
                      disabled,
                      disabledReason: reason,
                      onChange: (value: string) =>
                        patch({
                          axisPosition:
                            value === "onTickMarks" ? "onTickMarks" : chartType === "area" ? "between" : undefined,
                        }),
                    },
                  ]),
              checkbox("reverse", labels.reverseCategories),
            ],
    },
    {
      id: "axis-tick-marks",
      title: labels.tickMarks,
      fields: [
        ...(axis.kind === "category" && !dateAxis ? [wholeField("tickMarkSkip")] : []),
        selectField("majorTickMark", OFFICE_CHART_TICK_MARKS, tickLabel, labels.auto),
        selectField("minorTickMark", OFFICE_CHART_TICK_MARKS, tickLabel, labels.auto),
      ],
    },
    {
      id: "axis-labels",
      title: labels.labels,
      fields: [
        ...(axis.kind === "category" && !dateAxis ? [wholeField("tickLabelSkip")] : []),
        ...(axis.kind === "category" ? [wholeField("labelOffset")] : []),
        selectField("labelPosition", OFFICE_CHART_TICK_LABEL_POSITIONS, positionLabel, labels.auto),
        // Checked by default; cleared, the levels are drawn as flat text
        // (`c:noMultiLvlLbl`). A text axis over multi-level categories only.
        ...(axis.kind === "category" && axis.multiLevel && !dateAxis
          ? [
              {
                kind: "checkbox" as const,
                id: "axis-multiLevelLabels",
                label: labels.multiLevelLabels,
                checked: current.multiLevelLabels !== false,
                disabled,
                disabledReason: reason,
                onChange: (checked: boolean) => patch({ multiLevelLabels: checked ? undefined : false }),
              },
            ]
          : []),
      ],
    },
    {
      id: "axis-number",
      title: labels.number,
      fields: [
        // Office's Number group: Category (the locale's list, as Format
        // Cells has it), the code, Linked to source and a sample.
        {
          kind: "select",
          id: "axis-numberCategory",
          label: word("spreadsheet.fmtCatLabel", "类别", "Category"),
          value:
            current.numberFormat === undefined
              ? "general"
              : numberFormatGalleryItem(current.numberFormat, locale).id,
          options: [
            ...gallery.map((item) => ({
              value: item.id,
              label: `${word(item.labelKey, item.id, item.id)}${item.id === "long-date" ? ` (${applyNumberFormat(45000, item.code)})` : ""}`,
            })),
            { value: "custom", label: word("spreadsheet.fmtCatCustom", "自定义", "Custom") },
          ],
          disabled,
          disabledReason: reason,
          onChange: (id) => {
            if (id === "custom") return;
            const item = gallery.find((entry) => entry.id === id);
            if (item) patch({ numberFormat: item.code || "General" });
          },
        },
        {
          kind: "text",
          id: "axis-numberFormat",
          label: labels.numberFormat,
          value: current.numberFormat ?? "",
          placeholder: labels.linked,
          maxLength: 255,
          disabled,
          disabledReason: reason,
          onCommit: (raw) => {
            const text = raw.trim();
            if ((text || undefined) !== current.numberFormat) patch({ numberFormat: text || undefined });
            return true;
          },
        },
        {
          kind: "checkbox",
          id: "axis-numberLinked",
          label: labels.linked,
          checked: current.numberFormat === undefined,
          disabled,
          disabledReason: reason,
          onChange: (checked) => patch({ numberFormat: checked ? undefined : "General" }),
        },
        {
          kind: "custom",
          id: "axis-numberSample",
          render: (
            <output className={paneStyles.hint} data-testid="document-chart-format-pane-axis-number-sample">
              {word("spreadsheet.chartValueAxisNumberFormatPreview", "示例：{value}", "Sample: {value}", {
                value: applyNumberFormat(1234.5, current.numberFormat ?? "General"),
              })}
            </output>
          ),
        },
      ],
    },
  ];
}

/**
 * The chart's Format pane in the three editors: the ONE Office format pane
 * the shapes use (OfficeShapeFormatPane on the shared task pane frame), with
 * Office's pages for a chart element -- the element's own options (Format
 * Axis > Axis Options, a host's series or label options), Fill & Line,
 * Effects, and Size & Properties -- and Current Selection on top of each, as
 * Word, Excel and PowerPoint draw it. Placement is the host's: Docs' floating
 * card by default, the worksheet's dock column, the deck's stage dock.
 */
export function DocumentChartFormatPane(props: Props) {
  // The gradient stop each gradient editor has selected, per element.
  const [stopState, setStopState] = useState<{ area: string; fill: number; line: number }>({ area: props.area, fill: 0, line: 0 });
  const selectedStops = stopState.area === props.area ? stopState : { area: props.area, fill: 0, line: 0 };
  const setSelectedStops = (update: (current: { fill: number; line: number }) => { fill: number; line: number }) =>
    setStopState((current) => ({ area: props.area, ...update(current.area === props.area ? current : { fill: 0, line: 0 }) }));
  const maxSizeEmu = props.maxSizeEmu ?? MAX_DOCUMENT_CHART_EMU;
  const word: Word = (key, zh, en, values) =>
    props.translate ? props.translate(key, values) : (props.isChinese ? zh : en);
  const disabled = props.disabledReason !== null;
  const reason = props.disabledReason ?? undefined;
  const sizeReason =
    (props.sizeDisabledReason === undefined ? props.disabledReason : props.sizeDisabledReason) ??
    undefined;
  const currentLabel =
    props.areas.find((item) => item.value === props.area)?.label ?? "";
  const selection: OfficeShapeFormatPaneSection = {
    id: "selection",
    title: word("spreadsheet.chartFormatCopy.pane.currentSelection", "当前所选内容", "Current Selection"),
    fields: [
      {
        kind: "select",
        id: "area",
        label: word("spreadsheet.chartFormatCopy.pane.chartElement", "图表元素", "Chart Element"),
        value: props.area,
        options: props.areas,
        onChange: props.onArea,
      },
    ],
  };
  const paintRow = (field: "fill" | "outline"): OfficeShapeFormatPaneField => {
    const value = props[field];
    const enabled = !disabled && (field !== "fill" || props.fillAvailable);
    return {
      kind: "custom",
      id: `${field}-row`,
      render: (
        <span className={paneStyles.row}>
          <OfficeHomeMenuTrigger
            ref={field === "fill" ? props.fillRef : props.outlineRef}
            icon={
              <OfficeSemanticIcon
                semanticId={field === "fill" ? "shape.fill" : "shape.outline"}
                size={18}
              />
            }
            label={word("spreadsheet.chartFormatCopy.pane.color", "颜色", "Color")}
            aria-haspopup="dialog"
            aria-expanded={props.activePalette === field}
            hasMenuIndicator
            variant="compact"
            disabled={!enabled}
            onClick={() => props.onOpenPalette(field)}
            testId={`document-chart-format-pane-${field}`}
          />
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: 20,
              height: 20,
              flex: "none",
              border: "1px solid #a3a3a3",
              borderRadius: 3,
              background: officeChartSwatchColor(
                value,
                field === "fill" ? props.style?.shapePaint?.fillAlpha : props.style?.shapePaint?.lineAlpha,
              ),
            }}
          />
          <span>
            {value === "none"
              ? field === "fill"
                ? word("spreadsheet.chartFormatCopy.pane.noFill", "无填充", "No Fill")
                : word("spreadsheet.chartFormatCopy.pane.noLine", "无线条", "No Line")
              : (value ?? word("spreadsheet.chartFormatCopy.pane.automatic", "自动", "Automatic"))}
          </span>
        </span>
      ),
    };
  };
  const onStyle = props.onStyle;
  const paintSections: OfficeShapeFormatPaneSection[] = onStyle
    ? officeChartFillLineSections({
        style: props.style,
        area: props.area,
        chartType: props.chartType,
        fillAvailable: props.fillAvailable,
        disabledReason: props.disabledReason,
        word,
        fillColorRow: paintRow("fill"),
        lineColorRow: paintRow("outline"),
        automaticFill: props.automaticFill,
        automaticLine: props.automaticLine,
        selectedStop: selectedStops,
        onSelectStop: (target, index) => setSelectedStops((current) => ({ ...current, [target]: index })),
        onStyle,
        pictureFillReason: word(
          "spreadsheet.chartFormatCopy.fillLine.pictureFillUnavailable",
          "图表元素暂不支持图片或纹理填充",
          "Picture or texture fill isn't available for chart elements yet",
        ),
        smooth: props.smooth,
        marker: props.marker,
        roundedCorners: props.roundedCorners,
      })
    : [
        { id: "fill", title: word("spreadsheet.chartFormatCopy.pane.fill", "填充", "Fill"), fields: [paintRow("fill")] },
        { id: "line", title: word("spreadsheet.chartFormatCopy.pane.line", "线条", "Line"), fields: [paintRow("outline")] },
      ];
  const fillLine: OfficeShapeFormatPaneTab = {
    id: "fillLine",
    label: word("spreadsheet.chartFormatCopy.pane.fillAndLine", "填充与线条", "Fill & Line"),
    sections: [
      selection,
      ...paintSections,
      {
        id: "reset",
        fields: [
          {
            kind: "custom",
            id: "reset-row",
            render: (
              <div className={paneStyles.actions}>
                <button
                  type="button"
                  disabled={disabled || !props.hasStyle}
                  title={disabled ? reason : undefined}
                  onClick={props.onReset}
                  data-testid="document-chart-format-pane-reset"
                >
                  {word("spreadsheet.chartFormatCopy.pane.resetToMatchStyle", "重设以匹配样式", "Reset to Match Style")}
                </button>
              </div>
            ),
          },
        ],
      },
    ],
  };
  // Effects ▸ Shadow: the element's own outer shadow (`shapePaint.shadow`),
  // its Color, Transparency, Blur, Angle and Distance as Office's pane
  // states them (points and degrees; the model holds pixels). A custom
  // shadow takes the place of an effect preset, which the model holds
  // beside no shadow of its own.
  const shadow = props.style?.shapePaint?.shadow;
  const shadowShown = shadow ?? (props.style?.effect === "shadow" ? DEFAULT_CHART_SHADOW : undefined);
  const writeShadow = (next: OfficeShapeShadow | undefined) => {
    if (!onStyle || disabled) return;
    const record: Record<string, unknown> = { ...(props.style ?? {}) };
    delete record.effect;
    const paint: Record<string, unknown> = { ...(props.style?.shapePaint ?? {}) };
    if (next) paint.shadow = next;
    else delete paint.shadow;
    if (Object.keys(paint).length) record.shapePaint = paint;
    else delete record.shapePaint;
    onStyle(record as OfficeChartPaintStyle);
  };
  const shadowNumber = (
    id: string,
    label: string,
    value: number,
    unit: string,
    min: number,
    max: number,
    apply: (value: number, current: OfficeShapeShadow) => OfficeShapeShadow,
  ): OfficeShapeFormatPaneField => ({
    kind: "number",
    id,
    label,
    value: String(Math.round(value * 100) / 100),
    min,
    max,
    step: 1,
    unit,
    disabled: disabled || !shadowShown,
    disabledReason: reason,
    onCommit: (raw) => {
      const number = Number(raw);
      if (!shadowShown || raw.trim() === "" || !Number.isFinite(number) || number < min || number > max) return false;
      writeShadow(apply(number, shadowShown));
      return true;
    },
  });
  const shadowSection: OfficeShapeFormatPaneSection | null =
    onStyle && !props.paintless
      ? {
          id: "shadow",
          title: word("spreadsheet.chartFormatCopy.pane.shadow", "阴影", "Shadow"),
          fields: [
            {
              kind: "select",
              id: "shadow-kind",
              label: word("spreadsheet.chartFormatCopy.fillLine.shadowKind", "阴影", "Shadow"),
              value: shadowShown ? "outer" : "none",
              disabled,
              disabledReason: reason,
              options: [
                { value: "none", label: word("spreadsheet.chartFormatCopy.fillLine.noShadow", "无阴影", "No Shadow") },
                { value: "outer", label: word("spreadsheet.chartFormatCopy.fillLine.outerShadow", "外部阴影", "Outer shadow") },
              ],
              onChange: (value) => writeShadow(value === "outer" ? (shadowShown ?? DEFAULT_CHART_SHADOW) : undefined),
            },
            {
              kind: "color",
              id: "shadow-color",
              label: word("spreadsheet.chartFormatCopy.pane.color", "颜色", "Color"),
              value: shadowShown?.color ?? DEFAULT_CHART_SHADOW.color,
              disabled: disabled || !shadowShown,
              disabledReason: reason,
              onChange: (value) => {
                if (shadowShown && /^#[0-9a-f]{6}$/i.test(value)) writeShadow({ ...shadowShown, color: value.toLowerCase() });
              },
            },
            shadowNumber(
              "shadow-transparency",
              word("spreadsheet.chartFormatCopy.fillLine.transparency", "透明度", "Transparency"),
              Math.round((1 - (shadowShown?.opacity ?? DEFAULT_CHART_SHADOW.opacity)) * 100),
              "%",
              0,
              100,
              (value, current) => ({ ...current, opacity: Math.round(100 - value) / 100 }),
            ),
            shadowNumber(
              "shadow-blur",
              word("spreadsheet.chartFormatCopy.fillLine.blur", "模糊", "Blur"),
              (shadowShown?.blur ?? DEFAULT_CHART_SHADOW.blur) / PX_PER_PT,
              word("spreadsheet.chartFormatCopy.fillLine.points", "磅", "pt"),
              0,
              48,
              (value, current) => ({ ...current, blur: pointsAsShadowPixels(value) }),
            ),
            shadowNumber(
              "shadow-angle",
              word("spreadsheet.chartFormatCopy.fillLine.angle", "角度", "Angle"),
              shadowShown?.direction ?? 90,
              "°",
              0,
              359,
              // Straight down is the shadow that states no direction.
              (value, current) => {
                const rest: OfficeShapeShadow = { ...current };
                delete rest.direction;
                return value === 90 ? rest : { ...rest, direction: value };
              },
            ),
            shadowNumber(
              "shadow-distance",
              word("spreadsheet.chartFormatCopy.fillLine.distance", "距离", "Distance"),
              (shadowShown?.distance ?? DEFAULT_CHART_SHADOW.distance) / PX_PER_PT,
              word("spreadsheet.chartFormatCopy.fillLine.points", "磅", "pt"),
              0,
              48,
              (value, current) => ({ ...current, distance: pointsAsShadowPixels(value) }),
            ),
          ],
        }
      : null;
  // Effects ▸ 3-D Format of a series, a data point, the chart area, the
  // plot area, the walls and floor of a 3-D chart, the title, the legend and
  // an axis (Format <element> ▸ Effects in Excel, Word and PowerPoint), the
  // shapes' own section and model (`shapePaint.bevel` / `.format3d`). A
  // stated 3-D Format takes the place of a bevel or 3-D preset, as a stated
  // shadow takes the shadow preset's.
  const effectAccents = chartEffectAccents(props.accentColors);
  const takesThreeD =
    /^(?:series|slice|point|axis):|^(?:chartAreaStyle|plotAreaStyle|backWallStyle|sideWallStyle|floorStyle|chartTitleStyle|legendStyle)$/.test(
      props.area,
    );
  // Effects ▸ Glow of the same elements (`shapePaint.glow`, `a:glow`): its
  // colour, size and transparency, the shared section every shape shows.
  const glowSection: OfficeShapeFormatPaneSection | null =
    onStyle && !props.paintless && props.effectsLabels && takesThreeD
      ? (() => {
          const glow = props.style?.shapePaint?.glow;
          const stated = glow
            ? {
                radius: Math.round(glow.radiusPt * EMU_PER_PT),
                color: glow.color.toLowerCase(),
                alpha: Math.round((glow.opacity ?? 1) * 100_000),
              }
            : null;
          // The chart keeps a glow's drawn colour, not its theme slot: one that
          // is a Glow Variation in this chart's own accents reads as that
          // variation (it showed Custom right after it was picked).
          const variation = stated
            ? OFFICE_GLOW_SIZES_PT.flatMap((sizePt) =>
                OFFICE_GLOW_ACCENTS.map((accent) => officeGlowVariation(sizePt, accent, effectAccents[accent])),
              ).find((item) => item.radius === stated.radius && item.alpha === stated.alpha && item.color === stated.color)
            : undefined;
          const section = officeEffectsPaneSections({
            effects: stated ? { glow: variation ?? stated } : {},
            accentColors: effectAccents,
            labels: props.effectsLabels!,
            disabled,
            disabledReason: reason,
            testIdPrefix: "chart-effects",
            onChange: (kind, value) => {
              if (disabled || kind !== "glow") return;
              const picked = value as { radius: number; color: string; alpha: number } | null;
              const record: Record<string, unknown> = { ...(props.style ?? {}) };
              if (record.effect === "glow") delete record.effect;
              const next: Record<string, unknown> = { ...(props.style?.shapePaint ?? {}) };
              if (picked && picked.radius > 0) {
                const opacity = Math.round(picked.alpha / 1000) / 100;
                next.glow = {
                  color: picked.color.toLowerCase(),
                  radiusPt: Math.min(150, Math.round((picked.radius / EMU_PER_PT) * 100) / 100),
                  ...(opacity < 1 ? { opacity } : {}),
                };
              } else delete next.glow;
              if (Object.keys(next).length) record.shapePaint = next;
              else delete record.shapePaint;
              onStyle(record as OfficeChartPaintStyle);
            },
          }).find((item) => item.id === "effects-glow");
          return section ?? null;
        })()
      : null;
  // Effects ▸ Soft Edges of the same elements (`shapePaint.softEdge`,
  // `a:softEdge`): its presets and its size, the shared section every shape
  // shows. A stated soft edge takes the place of the "softEdge" preset.
  const softEdgeSection: OfficeShapeFormatPaneSection | null =
    onStyle && !props.paintless && props.effectsLabels && takesThreeD
      ? (() => {
          const softEdge = props.style?.shapePaint?.softEdge;
          const section = officeEffectsPaneSections({
            effects: softEdge ? { softEdge: { radius: Math.round(softEdge.radiusPt * EMU_PER_PT) } } : {},
            accentColors: effectAccents,
            labels: props.effectsLabels!,
            disabled,
            disabledReason: reason,
            testIdPrefix: "chart-effects",
            onChange: (kind, value) => {
              if (disabled || kind !== "softEdge") return;
              const picked = value as { radius: number } | null;
              const record: Record<string, unknown> = { ...(props.style ?? {}) };
              if (record.effect === "softEdge") delete record.effect;
              const next: Record<string, unknown> = { ...(props.style?.shapePaint ?? {}) };
              if (picked && picked.radius > 0)
                next.softEdge = {
                  radiusPt: Math.min(
                    OFFICE_CHART_MAX_SOFT_EDGE_PT,
                    Math.round((picked.radius / EMU_PER_PT) * 100) / 100,
                  ),
                };
              else delete next.softEdge;
              if (Object.keys(next).length) record.shapePaint = next;
              else delete record.shapePaint;
              onStyle(record as OfficeChartPaintStyle);
            },
          }).find((item) => item.id === "effects-soft-edge");
          return section ?? null;
        })()
      : null;
  const threeDSection: OfficeShapeFormatPaneSection | null =
    onStyle && !props.paintless && props.effectsLabels && takesThreeD
      ? (() => {
          const paint = props.style?.shapePaint;
          const section = officeEffectsPaneSections({
            effects: {
              ...(paint?.bevel ? { bevel: paint.bevel } : {}),
              ...(paint?.format3d ? { format3d: paint.format3d } : {}),
            },
            accentColors: effectAccents,
            labels: props.effectsLabels,
            disabled,
            disabledReason: reason,
            testIdPrefix: "chart-effects",
            onChange: (kind, value) => {
              if (disabled || (kind !== "bevel" && kind !== "format3d")) return;
              const record: Record<string, unknown> = { ...(props.style ?? {}) };
              if (record.effect === "bevel" || record.effect === "threeD") delete record.effect;
              const next: Record<string, unknown> = { ...(props.style?.shapePaint ?? {}) };
              if (value && (kind === "bevel" || Object.keys(value).length)) next[kind] = value;
              else delete next[kind];
              if (Object.keys(next).length) record.shapePaint = next;
              else delete record.shapePaint;
              onStyle(record as OfficeChartPaintStyle);
            },
          }).find((item) => item.id === "effects-bevel");
          return section ?? null;
        })()
      : null;
  const effects: OfficeShapeFormatPaneTab | null = props.onEffect
    ? {
        id: "effects",
        label: word("spreadsheet.chartFormatCopy.pane.effects", "效果", "Effects"),
        sections: [
          selection,
          {
            id: "effects",
            title: word("spreadsheet.chartFormatCopy.pane.effects", "效果", "Effects"),
            fields: [
              {
                kind: "select",
                id: "effect",
                label: word("spreadsheet.chartFormatCopy.pane.preset", "预设", "Preset"),
                value: props.effect ?? "none",
                disabled,
                disabledReason: reason,
                options: [
                  { value: "none", label: word("spreadsheet.chartFormatCopy.pane.noEffect", "无效果", "No Effect") },
                  { value: "shadow", label: word("spreadsheet.chartFormatCopy.pane.shadow", "阴影", "Shadow") },
                  { value: "reflection", label: word("spreadsheet.chartFormatCopy.pane.reflection", "映像", "Reflection") },
                  { value: "glow", label: word("spreadsheet.chartFormatCopy.pane.glow", "发光", "Glow") },
                  { value: "softEdge", label: word("spreadsheet.chartFormatCopy.pane.softEdges", "柔化边缘", "Soft Edges") },
                  { value: "bevel", label: word("spreadsheet.chartFormatCopy.pane.bevel", "棱台", "Bevel") },
                  { value: "threeD", label: word("spreadsheet.chartFormatCopy.pane.3DRotation", "三维旋转", "3-D Rotation") },
                ].filter(
                  (option) =>
                    option.value === "none" ||
                    // An effect the element cannot draw is not offered; one
                    // already stored stays listed so the box shows it.
                    (PRESENTATION_CHART_EFFECT_PRESETS.includes(option.value as PresentationChartEffectPreset) &&
                      (option.value === props.effect ||
                        presentationChartAreaDrawsEffect(
                          props.area,
                          option.value as PresentationChartEffectPreset,
                        ))),
                ),
                onChange: (value) =>
                  props.onEffect?.(
                    value === "none" ? null : (value as PresentationChartEffectPreset),
                  ),
              },
            ],
          },
          ...(shadowSection ? [shadowSection] : []),
          ...(glowSection ? [glowSection] : []),
          ...(softEdgeSection ? [softEdgeSection] : []),
          ...(threeDSection ? [threeDSection] : []),
        ],
      }
    : null;
  const size: OfficeShapeFormatPaneTab | null =
    props.size && props.onSize
      ? {
          id: "size",
          label: word("spreadsheet.chartFormatCopy.pane.sizeAndProperties", "大小与属性", "Size & Properties"),
          sections: [
            selection,
            {
              id: "size",
              title: word("spreadsheet.chartFormatCopy.pane.size", "大小", "Size"),
              fields: (["heightEmu", "widthEmu"] as const).map((axis) => ({
                kind: "number" as const,
                id: axis,
                label:
                  axis === "widthEmu"
                    ? word("spreadsheet.chartFormatCopy.pane.width", "宽度", "Width")
                    : word("spreadsheet.chartFormatCopy.pane.height", "高度", "Height"),
                value: (props.size![axis] / CHART_HOST_EMU_PER_CM).toFixed(2),
                unit: word("spreadsheet.chartFormatCopy.pane.cm", "厘米", "cm"),
                min: 0.01,
                max: maxSizeEmu / CHART_HOST_EMU_PER_CM,
                step: 0.1,
                disabled: sizeReason !== undefined,
                disabledReason: sizeReason,
                onCommit: (raw: string) => {
                  const value = Number(raw);
                  const emu = Math.round(value * CHART_HOST_EMU_PER_CM);
                  return (
                    raw.trim() !== "" &&
                    Number.isFinite(value) &&
                    emu >= 1 &&
                    emu <= maxSizeEmu &&
                    props.onSize!(axis, emu)
                  );
                },
              })),
            },
            ...(props.sizePropertiesSections ?? []),
          ],
        }
      : null;
  // The host's own options for the element (the worksheet's axis number
  // source, its series and label options) sit on the element's options page,
  // above Office's shared Axis Options when the element is an axis.
  const hostOptions: OfficeShapeFormatPaneSection | null = props.options
    ? {
        id: "host-options",
        fields: [{ kind: "custom", id: "options", render: props.options }],
      }
    : null;
  const optionsTab: OfficeShapeFormatPaneTab | null = props.axisOptions
    ? {
        id: "options",
        label: word("spreadsheet.chartFormatCopy.axis.options", "坐标轴选项", "Axis Options"),
        sections: [
          selection,
          ...(hostOptions ? [hostOptions] : []),
          ...axisOptionSections(props.axisOptions, props.disabledReason, word, props.chartType, props.isChinese ? "zh-CN" : "en"),
        ],
      }
    : props.elementPage
      ? {
          id: "options",
          label: props.elementPage.title,
          sections: [
            selection,
            ...props.elementPage.sections,
            ...(hostOptions ? [hostOptions] : []),
          ],
        }
      : hostOptions
        ? {
            id: "options",
            label: word("spreadsheet.chartFormatCopy.pane.options", "选项", "Options"),
            sections: [selection, hostOptions],
          }
        : null;
  const tabs = [optionsTab, props.paintless ? null : fillLine, props.paintless ? null : effects, size].filter(
    (tab): tab is OfficeShapeFormatPaneTab => tab !== null,
  );
  return (
    // The editor keeps its selection (the chart) while a control of the pane
    // takes the pointer; a size field remembers the chart's extent too.
    <div
      style={{ display: "contents" }}
      onPointerDownCapture={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest?.('[data-testid$="-heightEmu"], [data-testid$="-widthEmu"]')) {
          (props.onRememberSize ?? props.onRememberSelection)();
        } else {
          props.onRememberSelection();
        }
      }}
    >
      <OfficeShapeFormatPane
        // The element's options page opens first when it has one (Office
        // opens "More Axis Options…" on Axis Options); a pane whose page set
        // changes starts again on that page.
        key={optionsTab ? "options" : "plain"}
        testIdPrefix="document-chart-format-pane"
        className={props.className ?? styles.pane}
        dockRight={false}
        headerActions={props.headerActions}
        initialTab={tabs[0]?.id}
        labels={{
          title: word("spreadsheet.chartFormatCopy.pane.formatElement", `设置${currentLabel}格式`, `Format ${currentLabel}`, { label: currentLabel }),
          close: word("spreadsheet.chartFormatCopy.pane.close", "关闭", "Close"),
          apply: word("spreadsheet.chartFormatCopy.pane.apply", "应用", "Apply"),
          cancel: word("spreadsheet.chartFormatCopy.pane.cancel", "取消", "Cancel"),
        }}
        tabs={tabs}
        writable
        onClose={props.onClose}
      />
    </div>
  );
}
