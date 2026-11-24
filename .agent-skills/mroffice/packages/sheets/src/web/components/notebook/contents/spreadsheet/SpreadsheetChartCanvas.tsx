"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { officeChartAreaPart } from "@mrnote/core/web/lib/office-charts/chart-hit.ts";
import { AUTOMATIC_AXIS_TITLE_READING } from "@mrnote/core/web/lib/office-charts/chart-automatic-title.ts";
import { useOfficeChartSelectedArea } from "@mrnote/core/web/lib/office-charts/chart-selection-store.ts";
import {
  useLayoutEffect,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { chartTakesElementLayout } from "@mrnote/core/web/lib/office-charts/chart-element-layout.ts";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { EditorLoadingState } from "@mrnote/core/web/components/ui/editor-loading-state.tsx";

import MiniChart, { type MiniChartProps } from "@mrnote/core/web/components/notebook/contents/MiniChart.tsx";
import { SpreadsheetShapeView } from "./SpreadsheetShapeView";
import { normalizeShapeStyle } from "@mrnote/core/web/lib/spreadsheet/shapes.ts";
import {
  isReadingDefaultSeriesName,
  normalizeSpreadsheetChartMapRegionCodes,
  spreadsheetChartV2Drawn,
  type SpreadsheetChartMapRegionCode,
  type SpreadsheetChartV2Input,
} from "@mrnote/core/web/lib/spreadsheet/chart-v2-binding.ts";
import type { SpreadsheetChartSeriesGradientStyle } from "@mrnote/core/web/lib/spreadsheet/chart.ts";
import {
  spreadsheetChartModelInput,
  spreadsheetChartRecordInput,
  spreadsheetChartStoredModel,
  type SpreadsheetChartLike,
} from "@mrnote/core/web/lib/spreadsheet/chart-v2-model.ts";
import type {
  PresentationChartSeriesStyle,
  PresentationChartSliceStyle,
} from "@mrnote/core/web/lib/presentation-chart-area-style.ts";
import { presentationChartAreaStyleCss } from "@mrnote/core/web/lib/presentation-chart-area-style.ts";
import type { SpreadsheetChartFormat } from "@mrnote/core/web/lib/spreadsheet/chart-format.ts";
import type { ComboRenderAs } from "@mrnote/core/web/components/console/editor/extensions/chartBlockShared.ts";
import type { ChartNativeLook } from "@mrnote/core/web/lib/office-chart-native-look.ts";
import { canonicalJson } from "@mrnote/core/web/lib/engine-host/client.ts";
import type { ChartRenderPicture, ChartRenderRequest } from "@mrnote/core/web/lib/engine-host/charts-types.ts";
import { chartLeafNeedsWebGL } from "@mrnote/core/web/lib/office-charts/catalog.ts";
import { chartPictureSeriesColors, requestChartPicture } from "@mrnote/core/web/lib/office-charts/chart-picture-client.ts";
import { officeSheetChartDataTableLook } from "@mrnote/core/web/lib/office-charts/data-table.ts";
import { OfficeChartDataTableGrid } from "@mrnote/core/web/components/office-charts/OfficeChartDataTableGrid.tsx";
import { sanitizeChartPicture } from "@mrnote/core/web/lib/office-charts/chart-picture-sanitize.ts";
import { rasterDataUrlToPngBlob } from "@mrnote/core/web/lib/export/svg-to-png.ts";
import { OfficeChartPicture } from "@mrnote/core/web/components/office-charts/OfficeChartPicture.tsx";
import { OfficeGlChart } from "@mrnote/core/web/components/office-charts/OfficeGlChart.tsx";
import { type ExcelDateSystemArg } from "@mrnote/core/web/lib/spreadsheet/excel-1900-calendar.ts";
import { chartFrameLineOnEdge } from "../../../../lib/spreadsheet/chart-print-input";

export interface SpreadsheetChartCanvasProps extends MiniChartProps {
  /** The workbook reads serials in the 1904 date system (date-formatted
   *  value axes and data labels). */
  date1904?: ExcelDateSystemArg;
  /** The host's key for this chart's selected element (`chart-selection-store`):
   * the picture frames the element Current Selection names. */
  selectionKey?: string | null;
  /**
   * The picture draws the chart's title and axis titles (a chart on the
   * model, drawn by the engine), where they are typed in place and placed by
   * hand, as Excel's chart area holds them. A host that lays titles out
   * around the plot hears which it is (`onTitlesInPicture`) and leaves its
   * own out when the picture has them.
   */
  drawTitles?: boolean;
  onTitlesInPicture?: (inPicture: boolean) => void;
  /** Its title and axis titles are typed in place, its elements dragged by hand. */
  editable?: boolean;
  /**
   * The chart record drawn (a `sheet.charts[]` chart or an imported
   * `sheet.objects[]` one; a gallery preview hands the record with the
   * previewed model). Its stored model (`chartV2`) is what the one planner
   * draws -- handed to it as Docs and the deck hand theirs, and as the
   * worksheet PDF export draws the same chart -- its data read live from
   * `rows` / `xySeries`; the chart's flat props below are then not read (the
   * host's own -- the live data, sizes, theme accents, the resolved value
   * axis format, an imported chart's look -- still are). A record not on the
   * model yet is drawn from its own flat fields. The caller keeps the
   * record's identity while it is unchanged: the plan is memoized on it.
   */
  record?: SpreadsheetChartLike;
  /** rows[0] is the series-title row (rows built from series references). */
  headerRow?: boolean;
  /** The number format the category cells are written in (Linked to
   *  source), which a date axis writes its labels in. */
  categoryNumberFormat?: string;
  /** Each series' source format (its value cells' one number format), by
   *  series index: a data label Linked to source shows its series'. */
  seriesNumberFormats?: readonly (string | undefined)[];
  /**
   * A multi-level category axis over `rows` (a PivotChart with two or more
   * row fields; see `SpreadsheetChartV2Input.categoryLevels`): outermost
   * level first, one entry per data row. Absent, the model's own
   * `data.categoryLevels` is drawn when it aligns with the rows.
   */
  categoryLevels?: readonly (readonly string[])[];
  /** Selection/export can wake a chart before it enters the viewport. */
  selected?: boolean;
  forceRender?: boolean;
  /** Printed: the chart area's line is drawn on the frame's edge, half of it
   *  outside, as Windows Excel prints it (R457-X21), not inside the box. */
  frameOnEdge?: boolean;
  title?: string;
  chartStyle?: number;
  chartColorPalette?: string;
  themeAccents?: readonly string[];
  /** The workbook theme's body face stack (chart text's `+mn-lt`). */
  fontFamily?: string;
  chartFormat?: SpreadsheetChartFormat;
  chartSubtype?: string;
  seriesRefs?: unknown;
  /** A range-bound Custom Combination's per-series chart types. */
  comboSeriesTypes?: readonly ComboRenderAs[];
  seriesStyles?: readonly PresentationChartSeriesStyle[];
  seriesGradientStyles?: readonly SpreadsheetChartSeriesGradientStyle[];
  sliceStyles?: readonly PresentationChartSliceStyle[];
  showGridlines?: boolean;
  ariaLabel?: string;
  sourcePointIndices?: readonly number[];
  visibilityState?: "resolved" | "unavailable" | "unsupported";
  /** The look an imported Office 2016 chart's style parts give it; display only. */
  nativeLook?: ChartNativeLook;
  /** The countries an imported filled map's cells name, as its cache resolved them. */
  mapRegionCodes?: readonly SpreadsheetChartMapRegionCode[];
}

type RenderStatus = "loading" | "ready" | "fallback";

/** A size held this long is the frame's settled size. */
const SETTLE_MS = 150;

// The PNG a chart was last exported as, by its picture request (a sync caller
// reads it; `prepareSpreadsheetChartPngSnapshot` makes a current one).
const pngSnapshots = new WeakMap<Element, { request: () => ChartRenderRequest | null; png: string | null }>();

/** The chart's last exported PNG; null until `prepare` drew one. */
export function spreadsheetChartPngSnapshot(container: Element | null): string | null {
  const host = container?.querySelector('[data-chart-canvas-host="true"]');
  return host ? pngSnapshots.get(host)?.png ?? null : null;
}

/** The chart as a PNG (Copy as Picture, Save as Picture): the server's
 * picture of it at its size, rastered here at twice its pixels. */
export async function prepareSpreadsheetChartPngSnapshot(container: Element | null): Promise<string | null> {
  const host = container?.querySelector('[data-chart-canvas-host="true"]');
  const entry = host ? pngSnapshots.get(host) : undefined;
  const request = entry?.request();
  if (!entry || !request) return null;
  try {
    const picture = await requestChartPicture(request);
    const markup = sanitizeChartPicture(picture.svg, picture.width, picture.height);
    const svg = new DOMParser().parseFromString(markup, "image/svg+xml").documentElement;
    svg.setAttribute("width", String(picture.width));
    svg.setAttribute("height", String(picture.height));
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
    const blob = await rasterDataUrlToPngBlob(dataUrl, picture.width, picture.height, { scale: 2 });
    if (!blob) return null;
    const png = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
    entry.png = png;
    return png;
  } catch {
    return null;
  }
}

// Unit tests draw the legacy picture unless a test asks for the engine.
let engineInTests = false;
/** Tests: draw with the chart engine (served in-process) under jsdom. */
export function setSpreadsheetChartEngineInTests(value: boolean): void {
  engineInTests = value;
}

const VISUALLY_HIDDEN: CSSProperties = {
  border: 0,
  clip: "rect(0 0 0 0)",
  clipPath: "inset(50%)",
  height: 1,
  margin: -1,
  overflow: "hidden",
  padding: 0,
  position: "absolute",
  whiteSpace: "nowrap",
  width: 1,
};

/** The shapes a chart's own drawing places over it (`chartUserShapes`, read
 * at import from `c:userShapes`): each a box in fractions of the chart and its
 * shape. At most 64; anything malformed is left out. */
function chartUserShapesOf(record: unknown): { x: number; y: number; w: number; h: number; shape: ReturnType<typeof normalizeShapeStyle> }[] {
  const raw = (record as { chartUserShapes?: unknown } | null | undefined)?.chartUserShapes;
  if (!Array.isArray(raw)) return [];
  const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
  return raw.slice(0, 64).flatMap((entry) => {
    const item = entry as { x?: unknown; y?: unknown; w?: unknown; h?: unknown; shape?: unknown } | null;
    if (!item || !finite(item.x) || !finite(item.y) || !finite(item.w) || !finite(item.h) || item.w <= 0 || item.h <= 0) return [];
    if (!item.shape || typeof item.shape !== "object") return [];
    // What its text body leaves unstated is DrawingML's own default, as Excel
    // draws a chart's shape (C19_tdf137505): 11 pt words from the top left,
    // not the centred 9 pt label of a shape inserted on the sheet.
    const raw = item.shape as { textSize?: unknown; textAlign?: unknown; textVerticalAlign?: unknown; textLayout?: unknown };
    const layout = raw.textLayout as { bodyPr?: { anchor?: unknown }; paragraphs?: { align?: unknown }[] } | undefined;
    const statesAlign = Array.isArray(layout?.paragraphs) && layout!.paragraphs!.some((paragraph) => paragraph?.align !== undefined);
    const shape = normalizeShapeStyle({
      ...raw,
      ...(raw.textSize === undefined ? { textSize: 14.67 } : {}),
      ...(raw.textAlign === undefined && !statesAlign ? { textAlign: "left" } : {}),
      ...(raw.textVerticalAlign === undefined && layout?.bodyPr?.anchor === undefined ? { textVerticalAlign: "top" } : {}),
    });
    return [{ x: item.x, y: item.y, w: item.w, h: item.h, shape }];
  });
}

/**
 * A worksheet chart: the server chart engine's picture of the chart's record
 * over its live range (`host: "spreadsheet"`), with the sheet's own frame and
 * accessible data table from the binding (no planner here). MiniChart stays
 * the legacy picture for data the chart model cannot state.
 */
export default function SpreadsheetChartCanvas(props: SpreadsheetChartCanvasProps) {
  // A chart imported with its model deferred (``chartPending``;
  // CHART-DEFER-DESIGN.md) stands as a frame while the page fills it in.
  if ((props.record as { chartPending?: unknown } | undefined)?.chartPending === true) {
    return <SpreadsheetChartPending width={props.width ?? 320} height={props.height ?? 180} ariaLabel={props.ariaLabel} />;
  }
  return <SpreadsheetChartCanvasDrawn {...props} />;
}

function SpreadsheetChartPending({ width, height, ariaLabel }: { width: number; height: number; ariaLabel?: string }) {
  const t = useTranslations("console-notebooks");
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      aria-busy="true"
      data-testid="spreadsheet-chart-pending"
      className="spreadsheet-window__chart-pending"
      style={{ width, height }}
    >
      <span>{t("spreadsheet.chartLoadingDeferred")}</span>
    </div>
  );
}

function SpreadsheetChartCanvasDrawn({
  type,
  rows,
  headerRow,
  categoryLevels,
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
  upDownBars,
  dropLines,
  highLowLines,
  seriesLines,
  secondaryAxisSeries,
  waterfallTotal = false,
  valueAxisNumberFormat,
  categoryNumberFormat,
  seriesNumberFormats,
  date1904 = false,
  record,
  title,
  chartStyle,
  chartColorPalette,
  themeAccents,
  fontFamily,
  chartFormat,
  chartSubtype,
  seriesRefs,
  comboSeriesTypes,
  seriesStyles,
  seriesGradientStyles,
  lineSeriesStyles,
  sliceStyles,
  showGridlines = true,
  ariaLabel,
  sourcePointIndices,
  visibilityState,
  nativeLook,
  mapRegionCodes,
  selected = false,
  forceRender = false,
  frameOnEdge = false,
  selectionKey = null,
  drawTitles = true,
  onTitlesInPicture,
  editable = false,
}: SpreadsheetChartCanvasProps) {
  const t = useTranslations("console-notebooks");
  const selectedArea = useOfficeChartSelectedArea(selectionKey);
  const testEnvironment =
    !engineInTests && typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent);
  const hostRef = useRef<HTMLDivElement>(null);
  const [shell, setShell] = useState<HTMLDivElement | null>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const active = nearViewport || selected || forceRender;
  const [pictured, setPictured] = useState(false);
  // The picture shown: its titles' frames go over a 3-D canvas and into prints.
  const shownPictureRef = useRef<ChartRenderPicture | null>(null);
  // The record's own statement of the chart: its stored model (with the
  // model's derivation of what the sheet's display reads around the plan),
  // else -- a record not on the model yet -- its flat fields.
  const recorded = useMemo((): SpreadsheetChartV2Input | null => {
    if (!record) return null;
    const model = spreadsheetChartStoredModel(record);
    return model
      ? spreadsheetChartModelInput({ ...record, chartV2: model })
      : spreadsheetChartRecordInput(record);
  }, [record]);
  // What the drawing reads of the chart: the record's statement, else (a
  // caller with no record) the flat props.
  const chart = useMemo(
    (): SpreadsheetChartV2Input =>
      recorded ?? {
        type,
        title,
        chartStyle,
        chartColorPalette,
        chartFormat,
        chartSubtype,
        seriesRefs,
        comboSeriesTypes,
        seriesStyles,
        seriesGradientStyles,
        lineSeriesStyles,
        sliceStyles,
        showLegend,
        legendPosition,
        showAxisLabels,
        showGridlines,
        showDataLabels,
        secondaryAxisSeries,
        trendline,
        errorBars,
        upDownBars,
        dropLines,
        highLowLines,
        seriesLines,
      },
    [
      recorded,
      type,
      title,
      chartStyle,
      chartColorPalette,
      chartFormat,
      chartSubtype,
      seriesRefs,
      comboSeriesTypes,
      seriesStyles,
      seriesGradientStyles,
      lineSeriesStyles,
      sliceStyles,
      showLegend,
      legendPosition,
      showAxisLabels,
      showGridlines,
      showDataLabels,
      secondaryAxisSeries,
      trendline,
      errorBars,
      upDownBars,
      dropLines,
      highLowLines,
      seriesLines,
    ],
  );
  // An imported chart's look and its map's regions are the host's to hand;
  // a record carries its own.
  // A classic part's built-in text rides on the model's input (`chart`).
  const look = nativeLook ?? (record?.nativeLook as ChartNativeLook | undefined) ?? chart.nativeLook;
  const regions = useMemo(
    () => mapRegionCodes ?? normalizeSpreadsheetChartMapRegionCodes(record?.mapRegionCodes),
    [mapRegionCodes, record],
  );
  // Only a Pie of Pie / Bar of Pie draws the word, so only its picture follows
  // the viewer's language; every other chart keeps its picture across a locale change.
  const otherSliceLabel =
    chart.chartSubtype === "pieOfPie" || chart.chartSubtype === "barOfPie"
      ? t("office.chart.otherSlice")
      : undefined;
  // Office's automatic title reads "Chart Title" in the reader's language
  // where no one series names the chart: only such a chart's picture
  // follows the viewer's language.
  const automaticTitle =
    !chart.storedModel?.title && chart.storedModel?.format?.automaticTitle === true;
  const chartTitleWord = automaticTitle ? t("presentation.ui.chart.defaultChartTitle") : undefined;
  // An automatic axis title reads "Axis Title" in the reader's language too.
  const automaticAxisTitle = [chart.storedModel?.axisTitleX, chart.storedModel?.axisTitleY].includes(AUTOMATIC_AXIS_TITLE_READING);
  const axisTitleWord = automaticAxisTitle ? t("presentation.ui.chart.defaultAxisTitle") : undefined;
  // Excel names a series that names nothing in the reader's language (系列1,
  // Series1): only such a chart's picture follows the viewer's language.
  const unnamedSeries = Array.isArray(chart.seriesRefs)
    ? chart.seriesRefs.some((ref) => !(ref as { title?: unknown }).title && !(ref as { titleText?: unknown }).titleText)
    : // A chart of its own data: the reading's "Series n" (no c:tx).
      ((chart.storedModel?.data as { series?: readonly { name?: unknown }[] } | undefined)?.series ?? []).some(
        (series, index) => isReadingDefaultSeriesName(series?.name, index),
      );
  const defaultSeriesName = unnamedSeries ? t("office.chart.defaultSeriesName", { index: "{index}" }) : undefined;
  // The titles in the picture: a chart on the model, drawn by the engine.
  const titlesDrawn =
    drawTitles && !waterfallTotal && !testEnvironment && Boolean(recorded?.storedModel);
  // Everything the drawing depends on, as the engine reads it.
  // The series' source formats by value, so a host's fresh array of the same
  // formats keeps the memoized plan.
  const seriesFormatsKey = seriesNumberFormats?.some(Boolean)
    ? seriesNumberFormats.map((code) => code ?? "").join("\u0000")
    : "";
  const input = useMemo((): SpreadsheetChartV2Input => {
    const modelData = chart.storedModel?.data;
    return {
      ...chart,
      rows,
      headerRow,
      categoryLevels:
        categoryLevels ??
        (modelData?.kind === "category" ? modelData.categoryLevels : undefined),
      xySeries,
      themeAccents,
      ...(fontFamily ? { chartFontFamily: fontFamily } : {}),
      sourcePointIndices,
      valueAxisNumberFormat,
      ...(categoryNumberFormat ? { categoryNumberFormat } : {}),
      ...(seriesFormatsKey ? { seriesNumberFormats: seriesFormatsKey.split("\u0000").map((code) => code || undefined) } : {}),
      date1904,
      nativeLook: look,
      mapRegionCodes: regions,
      // The page's own language names what Office leaves to the reader.
      locale: typeof document === "undefined" ? undefined : document.documentElement.lang,
      otherSliceLabel,
      ...(chartTitleWord ? { chartTitleWord } : {}),
      ...(axisTitleWord ? { axisTitleWord } : {}),
      ...(defaultSeriesName ? { defaultSeriesName } : {}),
      ...(titlesDrawn ? { drawTitles: true } : {}),
    };
  }, [chart, rows, headerRow, categoryLevels, xySeries, themeAccents, fontFamily, sourcePointIndices, valueAxisNumberFormat, categoryNumberFormat, seriesFormatsKey, date1904, look, regions, otherSliceLabel, chartTitleWord, axisTitleWord, defaultSeriesName, titlesDrawn]);
  // What the chart draws as (the model, its frame, its accessible table),
  // read here without drawing; the picture is the engine's.
  const drawn = useMemo(() => spreadsheetChartV2Drawn(input), [input]);
  // The chart area the frame paints: the drawn model's (a Chart Styles
  // preview on it included), else the record's.
  const chartAreaStyle =
    (drawn?.drawnFromModel
      ? (drawn.attrs.format?.chartAreaStyle as SpreadsheetChartFormat["chartAreaStyle"] | undefined)
      : undefined) ?? chart.chartFormat?.chartAreaStyle;
  // Add Chart Element > Data Table: Excel draws it inside the chart area,
  // under the plot -- a column per category, a row per series led by its
  // legend key -- and the plot gives way to it (X-037, C28_tdf159450). The
  // grid and its band are the ones the deck draws.
  // The frame's own line takes its width off both edges (the box is
  // border-box): the plot and a data table share what is left, or the
  // table's last row was cut by the frame (X-037).
  // Printed on the frame's edge (frameOnEdge), the line takes nothing.
  const frameBorderPx = frameOnEdge ? 0 :
    chartAreaStyle?.outline === undefined
      ? chart.chartStyle === undefined && look?.chartArea?.outline === "none" ? 0 : 1
      : chartAreaStyle.outline === "none"
        ? 0
        : Math.max(1, Number(presentationChartAreaStyleCss(chartAreaStyle).borderWidth ?? 1) || 1);
  const innerHeight = Math.max(24, height - 2 * frameBorderPx);
  const dataTable = useMemo(
    () => (drawn ? officeSheetChartDataTableLook(drawn.attrs, innerHeight) : null),
    [drawn, innerHeight],
  );
  // A chart with a data table is drawn on the whole chart area: the plot
  // stands above the table's band and the legend below it, as Excel lays
  // them out (X-037: the legend stood between the plot and the table); the
  // picture says where the band starts (`dataTable.topPx`).
  const pictureHeight = dataTable ? innerHeight : height;
  const [tablePicture, setTablePicture] = useState<ChartRenderPicture | null>(null);
  const tableColors = useMemo(
    () =>
      dataTable && tablePicture
        ? chartPictureSeriesColors(tablePicture, dataTable.table.series.map((series) => series.name))
        : [],
    [dataTable, tablePicture],
  );
  // The table's columns under the plot's category bands, its series names
  // left of the plot, as Office lays the table out (X-068).
  const tablePlotSpan = useMemo(() => {
    const plot = tablePicture?.parts?.plot;
    if (!dataTable || !plot || !tablePicture || !(tablePicture.width > 0) || !(width > 0)) return undefined;
    const scale = width / tablePicture.width;
    return { leftPx: Math.max(0, plot.x * scale), widthPx: Math.max(0, plot.width * scale) };
  }, [dataTable, tablePicture, width]);
  // A line series' key in the table is the legend's line and marker, as
  // the picture's table says (C29_ChartDataTable).
  const tableKeyShapes = useMemo(
    () =>
      dataTable && tablePicture?.dataTable
        ? dataTable.table.series.map(
            (series) => tablePicture.dataTable?.series.find((entry) => entry.name === series.name)?.key,
          )
        : undefined,
    [dataTable, tablePicture],
  );
  // Where the table's band starts: under the plot the picture drew (until
  // the first picture, at the foot of the chart area).
  const tableTopPx = useMemo(() => {
    if (!dataTable) return 0;
    const top = tablePicture?.dataTable?.topPx;
    const scale = tablePicture && tablePicture.height > 0 ? pictureHeight / tablePicture.height : 1;
    return typeof top === "number" && Number.isFinite(top)
      ? top * scale
      : Math.max(0, pictureHeight - dataTable.band.heightPx);
  }, [dataTable, tablePicture, pictureHeight]);
  const legacyOnly = Boolean(waterfallTotal);
  const hasPlan = Boolean(drawn);
  const content = useMemo(() => {
    const sheet = JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
    const content = { host: "spreadsheet" as const, sheet, tips: true };
    return { content, contentKey: canonicalJson(content) };
  }, [input]);
  const request = useMemo<ChartRenderRequest>(
    () => ({ ...content.content, width, height: pictureHeight, ...(dataTable ? { dataTableBand: true } : {}) }),
    [content, width, pictureHeight, dataTable],
  );
  // A size that keeps changing (a frame being dragged) is followed by the
  // picture (OfficeChartPicture `following`); the settled size is drawn once.
  const [settledSize, setSettledSize] = useState(() => `${width}x${height}`);
  const settling = settledSize !== `${width}x${height}`;
  useEffect(() => {
    const timer = setTimeout(() => setSettledSize(`${width}x${height}`), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [width, height]);
  // What a picture export asks for: the chart as it is now.
  const latestRequest = useRef<ChartRenderRequest | null>(null);
  useEffect(() => {
    latestRequest.current = hasPlan && !legacyOnly ? request : null;
  }, [hasPlan, legacyOnly, request]);
  const needsGL = Boolean(drawn && chartLeafNeedsWebGL(drawn.attrs.chartType, drawn.attrs.chartSubtype));
  const [glReadyKey, setGlReadyKey] = useState<string | null>(null);
  const glReady = glReadyKey === content.contentKey;
  const accessibleName =
    ariaLabel?.trim() || chart.title?.trim() || t("spreadsheet.finalCopy.chartAccessibleName");

  useEffect(() => setShell(hostRef.current), []);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    pngSnapshots.set(host, { request: () => latestRequest.current, png: null });
    return () => {
      pngSnapshots.delete(host);
    };
  }, []);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (typeof IntersectionObserver === "undefined") {
      let disposed = false;
      queueMicrotask(() => { if (!disposed) setNearViewport(true); });
      return () => { disposed = true; };
    }
    // Only a chart in (or near) view asks for its picture; one out of view
    // keeps the last picture it had.
    const observer = new IntersectionObserver((entries) => {
      // The latest of its entries: one delivery can hold two for the same
      // host (out of view, then scrolled into it in the same frame), and the
      
      let entry: IntersectionObserverEntry | undefined;
      for (const item of entries) if (item.target === host) entry = item;
      if (entry) setNearViewport(entry.isIntersecting);
    }, { rootMargin: "200px" });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const engine = hasPlan && !legacyOnly && !testEnvironment;
  // The host lays its own titles out only where the picture has none.
  const titlesInPicture = engine && titlesDrawn;
  const reportTitles = useRef(onTitlesInPicture);
  reportTitles.current = onTitlesInPicture;
  useLayoutEffect(() => {
    reportTitles.current?.(titlesInPicture);
  }, [titlesInPicture]);
  const userShapes = useMemo(() => chartUserShapesOf(record), [record]);
  const status: RenderStatus = !engine ? "fallback" : pictured ? "ready" : "loading";
  const showFallback = status === "fallback";
  const appearance = drawn?.appearance;
  const frameStyle = (style: CSSProperties): CSSProperties =>
    frameOnEdge ? (chartFrameLineOnEdge(style as unknown as Record<string, unknown>) as unknown as CSSProperties) : style;
  return (
    <div
      data-chart-render-status={status}
      data-chart-export-engine-required={hasPlan && !legacyOnly ? "true" : undefined}
      data-chart-render-active={active ? "true" : "false"}
      data-chart-visibility-state={visibilityState}
      data-chart-source-point-indices={sourcePointIndices?.join(",")}
      data-spreadsheet-chart-engine="echarts-v2"
      // Whether the chart draws its stored model or a flat reading.
      data-chart-drawn-from={drawn ? (drawn.drawnFromModel ? "model" : "fields") : undefined}
      style={frameStyle({
        backgroundColor: appearance?.plotBackground ?? "transparent",
        color: appearance?.text,
        height,
        maxHeight: "100%",
        maxWidth: "100%",
        overflow: "hidden",
        position: "relative",
        width,
        // Excel's chart area, when the chart says nothing about its fill:
        // white (a chart style that paints its own background keeps it). A
        // chart area style that states an outline or an effect but no fill
        // keeps the white too; only No Fill clears it.
        ...((chartAreaStyle?.fill === undefined) &&
        (appearance?.plotBackground ?? "transparent") === "transparent"
          ? { backgroundColor: "#ffffff" }
          : {}),
        // ...and its outline, when the chart states none: the style's 0.75pt
        // hairline at 15% of the text colour, which every chart Excel inserts
        
        // transparent style, so the default white chart had no edge at all.
        // An imported Office 2016 chart's own look may say No line instead.
        ...(chartAreaStyle?.outline === undefined &&
        !(chart.chartStyle === undefined && look?.chartArea?.outline === "none")
          ? { border: `1px solid ${appearance?.border ?? "#d9d9d9"}`, boxSizing: "border-box" }
          : {}),
        ...presentationChartAreaStyleCss(chartAreaStyle),
        // Format Chart Area ▸ Border ▸ Rounded corners.
        ...(drawn?.attrs.format?.roundedCorners ? { borderRadius: 10 } : {}),
      })}
    >
      <div style={{ height: dataTable ? pictureHeight : "100%", position: "relative", width: "100%" }}>
        <div
          ref={hostRef}
          data-chart-canvas-host="true"
          // The legacy picture speaks for a chart the engine does not draw.
          aria-hidden={engine ? undefined : "true"}
          style={{ height: "100%", width: "100%", position: "relative" }}
        >
          {engine ? (
            <div data-chart-flat-covered={needsGL && glReady ? "true" : undefined} style={{ height: "100%" }}>
              <OfficeChartPicture
                request={request}
                contentKey={content.contentKey}
                selectedPart={officeChartAreaPart({ chartType: type ?? "column" }, selectedArea)}
                // Its titles typed in place and its elements dragged by hand
                // on the sheet, while it is the chart selected.
                textEditKey={editable && titlesInPicture ? selectionKey : null}
                placeable={editable && titlesInPicture && Boolean(selectionKey) && chartTakesElementLayout(drawn?.attrs.chartType ?? "")}
                // Excel's clicks: the first selects the chart, the next one
                // the element under the pointer (the sheet hands the chart its
                // selection key only once it is selected); its chart tips name
                // the element under the pointer.
                chartSelected={selected}
                elementTips
                // A right click names the series it lands on, so the chart's
                // menu offers that series' own rows (Excel's).
                contextMenuHits
                chartType={drawn?.attrs.chartType}
                // Out of view, or while its frame is resized, nothing is
                // asked; the last picture stays.
                live={!active || settling}
                following={active && settling}
                label={accessibleName}
                testId="spreadsheet-chart-picture"
                tooltips
                onPicture={(picture) => {
                  shownPictureRef.current = picture;
                  setPictured(true);
                  if (dataTable) setTablePicture(picture);
                }}
              >
                {





}
                <div
                  data-testid="spreadsheet-chart-loading"
                  data-chart-loading-idle={active ? undefined : "true"}
                  style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}
                >
                  {active ? <EditorLoadingState kind="dashboard" compact label={t("block.chart.v2.loading")} announce={false} /> : null}
                </div>
              </OfficeChartPicture>
            </div>
          ) : null}
          {engine && needsGL && active ? (
            <OfficeGlChart
              content={content.content}
              chartSelected={selected}
              height={pictureHeight}
              shell={shell}
              // The flat picture's layer draws the titles over the 3-D canvas.
              hostTexts={
                titlesInPicture
                  ? () => {
                      const picture = shownPictureRef.current;
                      return picture?.texts ? { texts: picture.texts, width: picture.width, height: picture.height } : undefined;
                    }
                  : undefined
              }
              onReady={() => setGlReadyKey(content.contentKey)}
              onFailed={() => setGlReadyKey(null)}
            />
          ) : null}
        </div>
        <div
          aria-hidden={showFallback ? undefined : "true"}
          data-chart-export-source="legacy-svg"
          data-chart-svg-fallback="true"
          style={{
            display: "grid",
            inset: 0,
            opacity: showFallback ? 1 : 0,
            placeItems: "center",
            pointerEvents: showFallback ? undefined : "none",
            position: "absolute",
            visibility: showFallback ? "visible" : "hidden",
          }}
        >
          {/* The legacy picture has no surface of its own and folds an
              unknown kind into a column chart, so a surface chart waits for
              its own renderer instead of showing a different chart. */}
          {showFallback && chart.type !== "surface" ? <MiniChart
            type={chart.type}
            rows={rows}
            xySeries={xySeries}
            width={width}
            height={pictureHeight}
            emptyFallback={visibilityState ? <span>{t(visibilityState === "unavailable" ? "spreadsheet.chartVisibility.unavailable" : visibilityState === "unsupported" ? "spreadsheet.chartVisibility.unsupported" : "spreadsheet.chartVisibility.empty")}</span> : emptyFallback}
            showLegend={chart.showLegend !== false}
            legendPosition={chart.legendPosition ?? "top"}
            showAxisLabels={chart.showAxisLabels !== false}
            extendedTypes={extendedTypes}
            trendline={chart.trendline}
            showDataLabels={chart.showDataLabels === true}
            errorBars={chart.errorBars}
            upDownBars={chart.upDownBars}
            dropLines={chart.dropLines}
            highLowLines={chart.highLowLines}
            seriesLines={chart.seriesLines}
            lineSeriesStyles={chart.lineSeriesStyles}
            seriesGradientStyles={chart.seriesGradientStyles}
            secondaryAxisSeries={chart.secondaryAxisSeries}
            waterfallTotal={waterfallTotal}
            valueAxisNumberFormat={valueAxisNumberFormat}
          /> : null}
        </div>
      </div>
      {userShapes.length ? (
        // The chart's own drawing (`c:userShapes`), over the chart area at
        // its fractions of it, as Excel draws it (X-208); display only.
        <div aria-hidden="true" data-chart-user-shapes="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {userShapes.map((entry, index) => (
            <div
              key={index}
              style={{
                position: "absolute",
                left: entry.x * width,
                top: entry.y * height,
                width: entry.w * width,
                height: entry.h * height,
                fontFamily: fontFamily ?? undefined,
              }}
            >
              <SpreadsheetShapeView shape={entry.shape} boxWidthPx={entry.w * width} boxHeightPx={entry.h * height} />
            </div>
          ))}
        </div>
      ) : null}
      {dataTable ? (
        <div
          style={{
            height: dataTable.band.heightPx,
            left: 0,
            overflow: "hidden",
            pointerEvents: "none",
            position: "absolute",
            right: 0,
            top: tableTopPx,
          }}
        >
          <OfficeChartDataTableGrid
            table={dataTable.table}
            colors={tableColors}
            rowPx={dataTable.band.rowPx}
            heightPx={dataTable.band.heightPx}
            // A table that states no border is ruled in the look's axis line
            // colour, as Excel draws it (XW064's 2007 look: #7b838e; X-297).
            style={
              dataTable.style.borderColor === undefined && typeof look?.axis?.line?.outline === "string" && look.axis.line.outline !== "none"
                ? { ...dataTable.style, borderColor: look.axis.line.outline }
                : dataTable.style
            }
            ariaLabel={t("presentation.ui.chart.dataTable")}
            frameTestId="spreadsheet-chart-data-table-frame"
            testId="spreadsheet-chart-data-table"
            keyTestId="spreadsheet-chart-data-table-legend-key"
            plotSpan={tablePlotSpan}
            openCorner
            keyShapes={tableKeyShapes}
          />
        </div>
      ) : null}
      {drawn ? (
        // Hidden in a 1px box of its own: a table is never narrower than its
        // words (`width: 1` does not hold it), and a long one laid out 3,493px
        // across past the page's right edge, so the editor's print shrank the
        // whole sheet to fit it (R478-X59 0.879, X23 0.918).
        <div style={VISUALLY_HIDDEN}>
        <table
          aria-label={t("spreadsheet.finalCopy.chartDataLabel", { name: accessibleName })}
          data-chart-accessible-table="true"
        >
          <caption>{t("spreadsheet.chartA11y.summary", {
            chartType: t(`toolbar.chartV2.subtype.${drawn.attrs.chartType}.${drawn.attrs.chartSubtype}`),
            seriesCount: drawn.seriesCount,
            categoryCount: drawn.categoryCount,
          })}</caption>
          <thead>
            <tr>
              {drawn.accessibleTable.headers.map((header, index) => {
                const role = drawn.accessibleTable.headerRoles[index];
                return (
                  <th key={`${index}:${header}`} scope="col">
                    {role === "literal" ? header : t(`spreadsheet.chartA11y.header.${role}`)}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {drawn.accessibleTable.rows.map((row, rowIndex) => {
              // A row left out of the drawing (a hidden category) leaves the
              // others their own source points.
              const sourceRow = drawn.accessibleTable.rowSources?.[rowIndex] ?? rowIndex;
              return (
              <tr key={sourcePointIndices?.[sourceRow] ?? sourceRow} data-source-point-index={sourcePointIndices?.[sourceRow]}>
                {row.map((value, cellIndex) =>
                  cellIndex === 0 ? (
                    <th key={cellIndex} scope="row">
                      {value}
                    </th>
                  ) : (
                    <td key={cellIndex}>{value}</td>
                  ),
                )}
              </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      ) : null}
    </div>
  );
}
