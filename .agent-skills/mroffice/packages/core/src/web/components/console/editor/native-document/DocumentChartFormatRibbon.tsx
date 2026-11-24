"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { OfficeChartAxisKey, OfficeChartAxisOptions } from "../../../../lib/office-charts/axis-options";
import { RefreshCw } from "../../../office-ribbon/icons/houseIcons";
import { useLayoutEffect, useRef, useState, type ReactNode, useEffect} from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "../../../../../host/next-intl";
import { presentationEffectsPaneLabels } from "../../../notebook/contents/presentation/presentationEffectsLabels";

import { OfficeColorPalettePopover } from "../../../office-ribbon/OfficeColorPalettePopover";
import { OfficeRibbonNumberField } from "../../../office-ribbon/OfficeRibbonNumberField";
import { OfficeShapeStyleGallery } from "../../../office-ribbon/OfficeShapeStyleGallery";
import { OfficeChartInsertShapesRow } from "../../../office-ribbon/OfficeChartInsertShapesRow";
import { OfficeShapeQuickGallery } from "../../../office-ribbon/OfficeShapeQuickGallery";
import { OfficeWordArtStyleGallery } from "../../../office-ribbon/OfficeWordArtStyleGallery";
import { OFFICE_WEB_SHAPE_ACCENTS, officeShapeStyleRecipes, type OfficeShapeStyleRecipe } from "../../../../lib/office-shape-style-catalog";
import { OFFICE_WORDART_STYLE_RECIPES, type OfficeWordArtRecipe } from "../../../../lib/office-wordart-style-catalog";
import { OFFICE_WORDART_GALLERY_RECIPES } from "../../../../lib/office-wordart-gallery";
import { patchOfficeTextPaint, sameOfficeTextPaint } from "../../../../lib/office-text-paint";
import { officeTextPaintEffect } from "../../../../lib/document-wordart-style-adapter";
import { officeChartShapeRecipePaint } from "../../../../lib/office-chart-shape-paint";
import { officeChartShapeStyleApplied } from "../../../../lib/office-chart-shape-style";
import {
  OfficeShapeCatalogPanel,
  officeShapeCatalogStyles,
} from "../../../office-ribbon/OfficeShapeCatalogPanel";
import {
  OfficeStyleGallery,
  type OfficeStyleGalleryItem,
} from "../../../office-ribbon/OfficeStyleGallery";
import {
  CHART_HOST_EMU_PER_CM,
  MAX_DOCUMENT_CHART_EMU,
  documentChartLayoutOneLayer,
  documentChartLayoutToEdge,
  type DocumentChartLayout,
  type DocumentChartSize,
} from "../extensions/documentChartHost";
import {
  OfficeHomeCommand,
  OfficeHomeCommandRow,
  OfficeHomeCommandStack,
  OfficeHomeMenuTrigger,
  OfficeHomeRibbonGroup,
  OfficeHomeSplitLayout,
} from "../../../office-ribbon/OfficeHomeRibbon";
import { OfficeSemanticIcon } from "../../../office-ribbon/icons/OfficeSemanticIcon";
import { RibbonDropdownMenuContent as DropdownMenuContent } from "../../../office-ribbon/CupertinoRibbonMenu";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "../../../ui/dropdown-menu";
import {
  PRESENTATION_CHART_EFFECT_PRESETS,
  presentationChartAreaDrawsEffect,
  PRESENTATION_CHART_TEXT_EFFECT_PRESETS,
  normalizePresentationChartAreaStyle,
  normalizePresentationChartAxisStyles,
  normalizePresentationChartSliceStyles,
  normalizePresentationChartSeriesStyles,
  type ChartMarkerSymbol,
  type PresentationChartAreaPaint,
  type PresentationChartAreaStyle,
  type PresentationChartEffectPreset,
  normalizePresentationChartAxisTitleStyles,
  chartPointEffectiveStyle,
} from "../../../../lib/presentation-chart-area-style";
import {
  CHART_FRAME_STYLE_KEYS,
  chartHasAxis,
  chartHasSecondaryValueAxis,
  chartHasDepthAxis,
  chartTakesView3D,
  chartSupportsAxisVisibility,
  chartTakesAreaStyles,
  chartTakesSeriesStyles,
  chartSupportsGridlines,
  chartSeriesRenderAsOf,
  chartSeriesTakesMarker,
  chartSeriesTakesSmooth,
  chartTakesBinIntervalClosed,
  chartWithHistogramBins,
  type ChartBlockAttrsV2,
  type ChartHistogramBins,
} from "../extensions/chartBlockShared";
import { chartPreset } from "../extensions/chartPresets";
import {
  DOCUMENT_SHAPE_RECENT_STORAGE_KEY,
  type DocumentShapePreset,
} from "../../../../lib/document-shapes";
import homeStyles from "../DocumentHomeRibbon.module.css";
import { DocumentChartPlacementControls } from "./DocumentChartPlacementControls";
import type { DocumentChartPlacementCommand, DocumentChartPlacementState } from "./chartPlacement";
import { DocumentChartFormatPane } from "./DocumentChartFormatPane";
import type { OfficeShapeFormatPaneSection } from "../../../office-ribbon/OfficeShapeFormatPane";
import type { OfficeChartPaintStyle } from "../../../office-ribbon/officeChartFillLinePage";
import {
  officeChartElementOptionPage,
  officeChartElementView,
  officeChartLabelTarget,
  type OfficeChartDataLabelContents,
  type OfficeChartElementView,
} from "../../../office-ribbon/OfficeChartDesignRibbon";
import type { ChartElementIntent } from "../../../../lib/office-charts/chart-elements";
import {
  officeChartHitArea,
  officeChartPointArea,
  officeChartPointName,
  type OfficeChartHit,
  officeChartAxisRole,
} from "../../../../lib/office-charts/chart-hit";
import { OfficeTaskPaneDockSlot } from "../../../office-ribbon/OfficeTaskPaneDockSlot";
import type { OfficeTaskPaneDockRegistry } from "../../../office-ribbon/officeTaskPaneDock";

export type DocumentChartAreaStyleKey =
  | "chartAreaStyle"
  | "plotAreaStyle"
  | "backWallStyle"
  | "sideWallStyle"
  | "floorStyle"
  | "chartTitleStyle"
  | "legendStyle"
  | "dataLabelStyle"
  | "dataTableStyle"
  | "trendlineStyle"
  | "errorBarStyle"
  /** Another series' error bars than the first (`seriesErrorBars`). */
  | `errorBarStyle:${number}`
  | "upBarStyle"
  | "downBarStyle"
  | "dropLineStyle"
  | "highLowLineStyle"
  | "seriesLineStyle"
  | "dataLabelLeaderLineStyle"
  | `slice:${number}`
  | `series:${number}`
  | `point:${number}:${number}`
  | "axis:category"
  | "axis:value"
  | "axis:secondaryValue"
  | "axis:series"
  | "axisTitle:category"
  | "axisTitle:value"
  | "gridlines"
  | "gridlineStyleX"
  | "gridlineStyleY"
  | "minorGridlineStyleX"
  | "minorGridlineStyleY";

const DOCUMENT_CHART_SHAPE_STYLE_RECIPES = [
  {
    id: "black-outline",
    fill: "#ffffff",
    outline: "#0f172a",
    zh: "白色填充，黑色轮廓",
    en: "White fill, black outline",
    labelKey: "spreadsheet.chartFormatCopy.shape.recipeBlackOutline",
  },
  {
    id: "blue-outline",
    fill: "#ffffff",
    outline: "#2563eb",
    zh: "白色填充，蓝色轮廓",
    en: "White fill, blue outline",
    labelKey: "spreadsheet.chartFormatCopy.shape.recipeBlueOutline",
  },
  {
    id: "red-outline",
    fill: "#ffffff",
    outline: "#dc2626",
    zh: "白色填充，红色轮廓",
    en: "White fill, red outline",
    labelKey: "spreadsheet.chartFormatCopy.shape.recipeRedOutline",
  },
] as const;

type DocumentChartShapeStyleId = string;
const DOCS_CHART_SHAPE_RECIPES = officeShapeStyleRecipes(OFFICE_WEB_SHAPE_ACCENTS);

export interface ChartFormatShapeStyleRecipe {
  readonly id: string;
  readonly zh: string;
  readonly en: string;
  readonly labelKey?: string;
  readonly fill: PresentationChartAreaPaint;
  readonly outline: PresentationChartAreaPaint;
}

const DOCUMENT_CHART_WORDART_STYLE_RECIPES = [
  {
    id: "black",
    textFill: "#111827",
    textOutline: "none",
    textEffect: undefined,
  },
  {
    id: "blue-shadow",
    textFill: "#2563eb",
    textOutline: "none",
    textEffect: "shadow",
  },
  {
    id: "red-outline",
    textFill: "none",
    textOutline: "#dc2626",
    textEffect: undefined,
  },
] as const;

type DocumentChartWordArtStyleId =
  (typeof DOCUMENT_CHART_WORDART_STYLE_RECIPES)[number]["id"];
type DocumentChartPaintField =
  | "fill"
  | "outline"
  | "textFill"
  | "textOutline";

export interface DocumentChartFormatRibbonProps {
  readonly application?: "docs" | "spreadsheet" | "presentation";
  /**
   * The document's Theme Colors for the Fill / Outline / Text palettes. A
   * workbook passes its own theme's grid: without it the palettes showed
   * Office 2013's accents under the workbook theme's names (S-125, "Green,
   * Accent 3" drew #a5a5a5 grey). A host under OfficeColorPaletteThemeProvider
   * (the deck) leaves it out.
   */
  readonly themeColumns?: readonly (readonly string[])[];
  /**
   * The chart's theme accents (its part's own theme's, else the document's),
   * accent 1 to 6: the Format pane's Glow presets ("Glow: 8 point; Orange,
   * Accent color 2") paint in them, as Office's do. Absent: Office's own.
   */
  readonly accentColors?: readonly string[];
  /** Opt in only when the host's native writer supports the shared paint model. */
  readonly officeProfile?: boolean;
  /**
   * The WordArt Styles gallery (office profile): the site's twenty by default,
   * Word's own fifteen in a document (w14 holds no pattern fill or inner
   * shadow), a deck's twenty under its theme.
   */
  readonly wordArtRecipes?: readonly OfficeWordArtRecipe[];
  readonly sharedShapeStyleRecipes?: readonly OfficeShapeStyleRecipe[];
  readonly shapeRecentStorageKey?: string;
  readonly testIdPrefix?: string;
  readonly slots?: { readonly insertShapes?: ReactNode; readonly arrange?: ReactNode };
  /**
   * Current Selection as PowerPoint draws it: the Chart Elements box showing
   * the selected element (PPT-A152). The host's word for the box; the
   * trigger is then named "<word>: <element>" and shows the element alone.
   * Absent: the menu button as it was.
   */
  readonly selectionFieldLabel?: string;
  readonly maxSizeEmu?: number;
  readonly shapeStyleRecipes?: readonly ChartFormatShapeStyleRecipe[];
  readonly attrs: ChartBlockAttrsV2 | null;
  readonly selectionIdentity?: string | object | null;
  readonly authority?: object | null;
  readonly disabledReason: string | null;
  readonly getAreaDisabledReason?: (area: DocumentChartAreaStyleKey) => string | null;
  readonly showWordArt?: boolean;
  readonly locale: string;
  /** Optional host catalogue; omitted preserves the existing Docs/PPT copy. */
  readonly translate?: (key: string, values?: Record<string, string | number>) => string;
  readonly onRememberSelection: () => void;
  readonly onPaint: (
    area: DocumentChartAreaStyleKey,
    field: "fill" | "outline",
    paint: PresentationChartAreaPaint,
  ) => void;
  readonly onStyle?: (
    area: DocumentChartAreaStyleKey,
    style: PresentationChartAreaStyle,
  ) => void;
  readonly onEffect?: (
    area: DocumentChartAreaStyleKey,
    effect: PresentationChartEffectPreset | null,
  ) => void;
  readonly onTextStyle?: (
    area: DocumentChartAreaStyleKey,
    style: PresentationChartAreaStyle,
  ) => void;
  readonly onReset?: (area: DocumentChartAreaStyleKey) => void;
  readonly size?: DocumentChartSize;
  readonly layout?: DocumentChartLayout;
  readonly onRememberSize?: () => void;
  readonly onSize?: (axis: keyof DocumentChartSize, value: number) => boolean;
  /**
   * Why the object's size cannot be set, when the host says it apart from
   * the chart's own reason: a deck's chart kept as its file has it takes no
   * chart edit, and its frame still resizes. Unstated, the size follows
   * `disabledReason`.
   */
  readonly sizeDisabledReason?: string | null;
  /** Sections the host adds to the Format pane's Size & Properties under
   * Size (a worksheet chart's Properties). */
  readonly paneSizePropertiesSections?: readonly OfficeShapeFormatPaneSection[];
  readonly onLayout?: (layout: DocumentChartLayout) => boolean;
  /** Word's Layout Options on a Docs chart (`chartPlacement`); with it the
   * Arrange group is Word's, without it the coarse host layout above. */
  readonly placement?: DocumentChartPlacementState;
  readonly onPlacement?: (command: DocumentChartPlacementCommand) => boolean;
  readonly onMoreLayoutOptions?: () => void;
  /** Arrange > Group with Word's Layout Options (`placement`): this chart and
   * the shapes picked with it become one group. */
  readonly onGroup?: { readonly onGroup: () => void; readonly disabledReason: string | null };
  readonly onInsertShape?: (preset: DocumentShapePreset) => boolean;
  readonly onSelectionPane?: (trigger: HTMLButtonElement) => void;
  readonly selectionPaneOpen?: boolean;
  /** Format > Accessibility > Alt Text: the host's Alt Text pane on this
   * chart (Microsoft Support, "Add alternative text to a shape, picture,
   * chart, SmartArt graphic, or other object"). Absent: no group. */
  readonly onAltText?: () => void;
  readonly altTextPaneOpen?: boolean;
  readonly paneContainer?: HTMLElement | null;
  /** The editor's right task pane dock: the Format pane takes a tab there
   * beside the Selection Pane and the others instead of covering them. */
  readonly paneDock?: OfficeTaskPaneDockRegistry | null;
  /** Optional host ownership of the dock; omitted keeps the Docs local pane. */
  readonly formatPaneOpen?: boolean;
  readonly onFormatPaneOpenChange?: (open: boolean) => void;
  /**
   * Host request to scope the Format pane to one chart element, the way Word's
   * "More <element> Options…" commands do. `token` distinguishes two requests
   * for the same element; a request for an element this chart does not carry is
   * ignored.
   */
  readonly focusArea?: {
    readonly area: DocumentChartAreaStyleKey;
    readonly token: number;
  } | null;
  /**
   * A click on the drawn chart (`lib/office-charts/chart-hit`): one click on
   * a series selects the series, a second click on one of its points that
   * point, as Office's clicks do. A single click only moves Current
   * Selection (an open pane follows it); `open` (a double click) opens the
   * pane on it. `token` tells two clicks on the same thing apart.
   */
  readonly elementHit?: {
    readonly hit: OfficeChartHit;
    readonly open: boolean;
    readonly token: number;
  } | null;
  /**
   * Current Selection as it stands (a click on the chart, the pane's own
   * pick): the host's Home ▸ Font group formats that element, as Office
   * formats the element selected, and the host frames it on the chart.
   */
  readonly onAreaChange?: (area: DocumentChartAreaStyleKey) => void;
  /**
   * The host's Current Selection as the chart's clicks left it
   * (`chart-selection-store`): the ribbon opens on it. Two clicks on a
   * column made before the Format tab is shown select that point, as
   * Office's do; the ribbon, mounted after them, read only the last click
   * and opened on the series.
   */
  readonly selectedArea?: string | null;
  /**
   * The host's own options for the element the Format pane is formatting,
   * Office's per-element options page (Axis Options > Number, Series
   * Options...), shown under Current Selection.
   */
  readonly paneOptions?: (area: DocumentChartAreaStyleKey) => ReactNode;
  /**
   * Office's Format Axis > Axis Options: the host writes the SHARED record
   * (`format.axisOptions`) for the axis the pane is formatting. Omitted for a
   * host whose writer cannot carry it (the deck's legacy in-place charts).
   */
  readonly onAxisOptions?: (
    axis: OfficeChartAxisKey,
    options: OfficeChartAxisOptions | null,
  ) => void;
  /**
   * The host's writer of the whole chart model: the command returns the
   * chart as it should be (null: no change) and the host commits it the way
   * it commits any chart edit (Docs' node, the deck's chart, the worksheet's
   * part). Options the shared pane owns outright -- a histogram's Bins --
   * are written through it, so every editor offers them alike. Omitted for
   * a host whose writer cannot carry the whole model.
   */
  readonly onChartModel?: (
    command: (attrs: ChartBlockAttrsV2) => ChartBlockAttrsV2 | null,
  ) => void;
  /** Host commands beside the Format pane's close button. */
  readonly paneHeaderActions?: ReactNode;
  /**
   * The `relativeHeight` of every floating object in the document's one
   * stack (`documentFloatingStack`): with it Arrange offers Bring to Front /
   * Send to Back beside the one-layer steps, as Word's split buttons do.
   */
  readonly floatingHeights?: readonly number[];
  /** The host's placement of the Format pane (Docs' floating card when
   * omitted; the worksheet's dock column; the deck's stage dock). */
  readonly paneClassName?: string;
  /**
   * Office's element options pages on the Format pane (Legend, Data Labels,
   * Data Table, Error Bars, Trendline): the host's writer for the SAME
   * intents its Add Chart Element menu emits. `view` defaults to the chart's
   * own (`officeChartElementView(attrs)`); `areas` limits the pages to the
   * elements the host's writer states this way.
   */
  readonly elementPane?: {
    readonly view?: OfficeChartElementView | null;
    readonly onIntent: (intent: ChartElementIntent) => void;
    readonly label?: (key: string) => string | undefined;
    readonly trendlineOptions?: boolean;
    /** The writer carries Series Options (Series Overlap, Gap Width). */
    readonly seriesOptions?: boolean;
    /** The reader and writer carry a 100% stacked chart's own spacing too. */
    readonly barSpacingOptions?: boolean;
    /** The writer carries a pie's Series Options and Point Explosion. */
    readonly pieOptions?: boolean;
    /** The writer carries Custom ▸ Specify Value error amounts. */
    readonly customErrorAmounts?: boolean;
    readonly dataLabelContents?: OfficeChartDataLabelContents;
    readonly areas?: readonly (DocumentChartAreaStyleKey | "series:" | "slice:" | "point:")[];
  };
}







const rememberedChartAreas = new WeakMap<object, DocumentChartAreaStyleKey>();
const consumedChartHits = new WeakSet<object>();

function rememberedChartArea(identity: unknown): DocumentChartAreaStyleKey | undefined {
  return identity && typeof identity === "object" ? rememberedChartAreas.get(identity) : undefined;
}

function rememberChartArea(identity: unknown, area: DocumentChartAreaStyleKey): void {
  if (identity && typeof identity === "object") rememberedChartAreas.set(identity, area);
}

export function DocumentChartFormatRibbon({
  themeColumns,
  accentColors,
  elementPane,
  paneClassName,
  application = "docs",
  officeProfile = application === "docs",
  wordArtRecipes = application === "docs" ? OFFICE_WORDART_STYLE_RECIPES : OFFICE_WORDART_GALLERY_RECIPES,
  sharedShapeStyleRecipes = DOCS_CHART_SHAPE_RECIPES,
  shapeRecentStorageKey = DOCUMENT_SHAPE_RECENT_STORAGE_KEY,
  testIdPrefix = "document-toolbar-chart-format",
  slots,
  selectionFieldLabel,
  maxSizeEmu = MAX_DOCUMENT_CHART_EMU,
  shapeStyleRecipes = DOCUMENT_CHART_SHAPE_STYLE_RECIPES,
  attrs,
  selectionIdentity = attrs,
  authority = attrs,
  disabledReason: editorDisabledReason,
  getAreaDisabledReason,
  showWordArt = true,
  locale,
  translate: translateProp,
  onRememberSelection,
  onPaint,
  onStyle,
  onEffect,
  onTextStyle,
  onReset,
  size,
  layout = { mode: "inline" },
  onRememberSize,
  onSize,
  sizeDisabledReason: hostSizeDisabledReason,
  paneSizePropertiesSections,
  onLayout,
  placement,
  onPlacement,
  onMoreLayoutOptions,
  onGroup,
  onInsertShape,
  onSelectionPane,
  selectionPaneOpen,
  onAltText,
  altTextPaneOpen,
  paneContainer,
  paneDock,
  formatPaneOpen,
  onFormatPaneOpenChange,
  focusArea,
  elementHit,
  paneOptions,
  onAxisOptions,
  onChartModel,
  paneHeaderActions,
  floatingHeights,
  onAreaChange,
  selectedArea,
}: DocumentChartFormatRibbonProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  // A host without its own translator (the deck's chart tab) reads this
  // editor's catalogue, so every language gets the ribbon's words.
  const translate: (key: string, values?: Record<string, string | number>) => string =
    translateProp ?? t;
  const zh = /^zh(?:-|$)/i.test(locale);
  const copy = (key: string, _fallback: string, values?: Record<string, string | number>) =>
    translate(key, values);
  const [selection, setSelection] = useState(() => {
    // The clicks the host already applied are not applied again here.
    if (selectedArea && elementHit) consumedChartHits.add(elementHit);
    return {
      identity: selectionIdentity,
      area: (selectedArea as DocumentChartAreaStyleKey | null | undefined) ??
        rememberedChartArea(selectionIdentity) ??
        ("chartAreaStyle" as DocumentChartAreaStyleKey),
    };
  });
  type PaintSession = {
    identity: typeof selectionIdentity;
    authority: typeof authority;
    area: DocumentChartAreaStyleKey;
    field: DocumentChartPaintField;
    origin: "ribbon" | "pane" | "wordart";
  };
  const [paletteSession, setPaletteSession] = useState<PaintSession | null>(
    null,
  );
  const [sizeReset, setSizeReset] = useState(0);
  const fillTriggerRef = useRef<HTMLButtonElement | null>(null);
  const outlineTriggerRef = useRef<HTMLButtonElement | null>(null);
  const textFillTriggerRef = useRef<HTMLButtonElement | null>(null);
  const textOutlineTriggerRef = useRef<HTMLButtonElement | null>(null);
  const paneFillRef = useRef<HTMLButtonElement | null>(null);
  const paneOutlineRef = useRef<HTMLButtonElement | null>(null);
  const paneTriggerRef = useRef<HTMLButtonElement | null>(null);
  const selectionPaneTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [paneIdentity, setPaneIdentity] = useState<
    typeof selectionIdentity | undefined
  >(undefined);
  const [controlledPane, setControlledPane] = useState({
    open: formatPaneOpen, identity: selectionIdentity, authority,
  });
  if (controlledPane.open !== formatPaneOpen) {
    setControlledPane({ open: formatPaneOpen, identity: selectionIdentity, authority });
  }
  const invalidatedPane = useRef<typeof controlledPane | null>(null);
  const controlledOwnerCurrent = controlledPane.identity === selectionIdentity &&
    controlledPane.authority === authority && attrs !== null;
  const localPaneOpen =
    paneIdentity !== undefined && paneIdentity === selectionIdentity;
  if (paneIdentity !== undefined && !localPaneOpen) setPaneIdentity(undefined);
  const paneOpen = formatPaneOpen === undefined ? localPaneOpen :
    formatPaneOpen && controlledPane.open === true && controlledOwnerCurrent;
  useLayoutEffect(() => {
    if (formatPaneOpen && controlledPane.open && !controlledOwnerCurrent &&
      invalidatedPane.current !== controlledPane) {
      invalidatedPane.current = controlledPane;
      onFormatPaneOpenChange?.(false);
    }
  }, [controlledOwnerCurrent, controlledPane, formatPaneOpen, onFormatPaneOpenChange]);
  const setPaneOpen = (open: boolean) => {
    if (formatPaneOpen === undefined) setPaneIdentity(open ? selectionIdentity : undefined);
    onFormatPaneOpenChange?.(open);
  };
  const seriesNames =
    attrs?.data.kind === "category" ||
    attrs?.data.kind === "xy" ||
    attrs?.data.kind === "stock"
      ? attrs.data.series.map((series) => series.name)
      : attrs?.data.kind === "matrix"
        ? attrs.data.yCategories
        : [];
  // A point of its own to format: the 2-D pie's and the doughnut's slices,
  // the ones the model carries a slice style for (a bar-of-pie's or a 3-D
  // pie's point listed here took a colour that never applied, PPT-B283).
  const sliceNames =
    attrs?.chartType === "pie" &&
    attrs.data.kind === "category" &&
    (attrs.chartSubtype === "pie2d" || attrs.chartSubtype === "doughnut")
      ? attrs.data.categories
      : [];
  const selections: readonly {
    readonly value: DocumentChartAreaStyleKey;
    readonly label: string;
  }[] = [
    { value: "chartAreaStyle", label: copy("spreadsheet.chartFormatCopy.selection.chartArea", zh ? "图表区" : "Chart Area") },
    { value: "plotAreaStyle", label: copy("spreadsheet.chartFormatCopy.selection.plotArea", zh ? "绘图区" : "Plot Area") },
    // A 3-D chart's walls and floor (Excel's Current Selection: Back Wall,
    // Floor, Side Wall), each its own Fill & Line (`format.backWallStyle`...).
    ...(attrs && attrs.chartType !== "pie" && chartTakesView3D(attrs.chartType, attrs.chartSubtype)
      ? [
          { value: "backWallStyle" as const, label: copy("spreadsheet.chartFormatCopy.selection.backWall", zh ? "背景墙" : "Back Wall") },
          { value: "floorStyle" as const, label: copy("spreadsheet.chartFormatCopy.selection.floor", zh ? "基底" : "Floor") },
          { value: "sideWallStyle" as const, label: copy("spreadsheet.chartFormatCopy.selection.sideWall", zh ? "侧面墙" : "Side Wall") },
        ]
      : []),
    ...(attrs?.title
      ? [
          {
            value: "chartTitleStyle" as const,
            label: copy("spreadsheet.chartFormatCopy.selection.chartTitle", zh ? "图表标题" : "Chart Title"),
          },
        ]
      : []),
    ...(attrs?.format?.legend !== "none"
      ? [
          {
            value: "legendStyle" as const,
            label: copy("spreadsheet.chartFormatCopy.selection.legend", zh ? "图例" : "Legend"),
          },
        ]
      : []),
    ...(attrs &&
    (attrs.format?.dataLabels ?? chartPreset(attrs.stylePreset).dataLabels)
      ? [
          {
            value: "dataLabelStyle" as const,
            label: copy("spreadsheet.chartFormatCopy.selection.dataLabels", zh ? "数据标签" : "Data Labels"),
          },
        ]
      : []),
    ...(attrs?.format?.dataTable === true
      ? [
          {
            value: "dataTableStyle" as const,
            label: copy("spreadsheet.chartFormatCopy.selection.dataTable", zh ? "数据表" : "Data Table"),
          },
        ]
      : []),
    // Every trendline type the menu offers has its Format Trendline page,
    // not the linear one alone (PPT-B265).
    ...(attrs?.format?.trendline
      ? [
          {
            value: "trendlineStyle" as const,
            label: copy("spreadsheet.chartFormatCopy.selection.trendline", `${zh ? "趋势线" : "Trendline"} · ${seriesNames[0] ?? (zh ? "系列 1" : "Series 1")}`, { name: seriesNames[0] ?? (copy("spreadsheet.chartFormatCopy.selection.series1", zh ? "系列 1" : "Series 1")) }),
          },
        ]
      : []),
    ...(attrs?.format?.errorBars
      ? [
          {
            value: "errorBarStyle" as const,
            label: copy("spreadsheet.chartFormatCopy.selection.errorBars", `${zh ? "误差线" : "Error Bars"} · ${seriesNames[0] ?? (zh ? "系列 1" : "Series 1")}`, { name: seriesNames[0] ?? (copy("spreadsheet.chartFormatCopy.selection.series1", zh ? "系列 1" : "Series 1")) }),
          },
        ]
      : []),
    // Each other series' own error bars (Excel's "Series N Y Error Bars").
    ...(attrs?.format?.seriesErrorBars ?? []).map((entry) => {
      const name = seriesNames[entry.seriesIndex] ?? String(entry.seriesIndex + 1);
      return {
        value: `errorBarStyle:${entry.seriesIndex}` as const,
        label: copy("spreadsheet.chartFormatCopy.selection.errorBars", `${zh ? "误差线" : "Error Bars"} · ${name}`, { name }),
      };
    }),
    ...(attrs?.format?.upDownBars === true
      ? [
          {
            value: "upBarStyle" as const,
            label: copy("spreadsheet.chartFormatCopy.selection.upBars", zh ? "上涨柱" : "Up Bars"),
          },
          {
            value: "downBarStyle" as const,
            label: copy("spreadsheet.chartFormatCopy.selection.downBars", zh ? "下跌柱" : "Down Bars"),
          },
        ]
      : []),
    ...(attrs?.format?.dropLines === true
      ? [
          {
            value: "dropLineStyle" as const,
            label: copy("spreadsheet.chartFormatCopy.selection.dropLines", zh ? "垂直线" : "Drop Lines"),
          },
        ]
      : []),
    ...(attrs?.format?.highLowLines === true
      ? [
          {
            value: "highLowLineStyle" as const,
            label: copy("spreadsheet.chartFormatCopy.selection.highLowLines", zh ? "高低点连线" : "High-Low Lines"),
          },
        ]
      : []),
    ...(attrs?.format?.seriesLines === true
      ? [
          {
            value: "seriesLineStyle" as const,
            label: copy("spreadsheet.chartFormatCopy.selection.seriesLines", zh ? "系列线" : "Series Lines"),
          },
        ]
      : []),
    ...(attrs?.format?.dataLabelLeaderLines === true
      ? [
          {
            value: "dataLabelLeaderLineStyle" as const,
            label: copy("spreadsheet.chartFormatCopy.selection.dataLabelLeaderLines", zh ? "数据标签引导线" : "Data Label Leader Lines"),
          },
        ]
      : []),
    // The one point a second click selected (it is not listed otherwise,
    // as Office lists no point until one is clicked).
    ...(() => {
      const point = officeChartPointArea(selection.area);
      const name =
        attrs && point && selection.identity === selectionIdentity && officeChartLabelTarget(selection.area, attrs)
          ? officeChartPointName(attrs, point.seriesIndex, point.pointIndex)
          : null;
      return name
        ? [
            {
              value: selection.area,
              label: copy("spreadsheet.chartFormatCopy.selection.dataPoint", `${zh ? "数据点" : "Data Point"} · ${name}`, { name }),
            },
          ]
        : [];
    })(),
    ...sliceNames.map((name, index) => ({
      value: `slice:${index}` as const,
      label: copy("spreadsheet.chartFormatCopy.selection.dataPoint", `${zh ? "数据点" : "Data Point"} · ${name}`, { name: name }),
    })),
    ...seriesNames.map((name, index) => ({
      value: `series:${index}` as const,
      label: copy("spreadsheet.chartFormatCopy.selection.series", `${zh ? "数据系列" : "Series"} · ${name}`, { name: name }),
    })),
    ...(attrs && chartSupportsAxisVisibility(attrs.chartType)
      ? [
          ...(attrs.format?.axisX !== false
            ? [
                {
                  value: (attrs.chartType === "bar"
                    ? "axis:value"
                    : "axis:category") as "axis:category" | "axis:value",
                  label: copy("spreadsheet.chartFormatCopy.selection.primaryHorizontalAxis", zh ? "主横轴" : "Primary Horizontal Axis"),
                },
              ]
            : []),
          // A funnel has no value axis to select, only its categories.
          ...(attrs.format?.axisY !== false && chartHasAxis(attrs.chartType, "y")
            ? [
                {
                  value: (attrs.chartType === "bar"
                    ? "axis:category"
                    : "axis:value") as "axis:category" | "axis:value",
                  label: copy("spreadsheet.chartFormatCopy.selection.primaryVerticalAxis", zh ? "主纵轴" : "Primary Vertical Axis"),
                },
              ]
            : []),
          // A combination's (or a bar or scatter chart's) series on the
          // secondary axis: Office's Secondary Vertical Axis, its own Axis
          // Options (`format.axisOptions.secondaryValue`).
          ...(attrs.format?.secondaryValueAxis !== false &&
          chartHasSecondaryValueAxis(attrs.chartType, attrs.chartSubtype, attrs.data)
            ? [
                {
                  value: "axis:secondaryValue" as const,
                  label: copy("spreadsheet.chartFormatCopy.selection.secondaryVerticalAxis", zh ? "次纵轴" : "Secondary Vertical Axis"),
                },
              ]
            : []),
          // A 3-D chart's Depth (Series) Axis, shown: its own Axis Options
          // (`format.axisOptions.series`).
          ...(attrs.format?.axisOptions?.series?.hidden !== true &&
          chartHasDepthAxis(attrs.chartType, attrs.chartSubtype)
            ? [
                {
                  value: "axis:series" as const,
                  label: copy("spreadsheet.chartFormatCopy.selection.depthAxis", zh ? "竖坐标轴" : "Depth Axis"),
                },
              ]
            : []),
          // An axis title is an element of its own (Office: Horizontal (Category)
          // Axis Title), by the model axis the drawn axis stands for.
          ...(attrs.axisTitleX && attrs.format?.axisX !== false
            ? [
                {
                  value: `axisTitle:${officeChartAxisRole(attrs, "X")}` as "axisTitle:category" | "axisTitle:value",
                  label: copy("spreadsheet.chartFormatCopy.selection.primaryHorizontalAxisTitle", zh ? "主横轴标题" : "Primary Horizontal Axis Title"),
                },
              ]
            : []),
          ...(attrs.axisTitleY && attrs.format?.axisY !== false && chartHasAxis(attrs.chartType, "y")
            ? [
                {
                  value: `axisTitle:${officeChartAxisRole(attrs, "Y")}` as "axisTitle:category" | "axisTitle:value",
                  label: copy("spreadsheet.chartFormatCopy.selection.primaryVerticalAxisTitle", zh ? "主纵轴标题" : "Primary Vertical Axis Title"),
                },
              ]
            : []),
        ]
      : []),
    ...(attrs &&
    chartSupportsGridlines(attrs.chartType) &&
    (attrs.format?.gridlinesX === true || attrs.format?.gridlinesY === true)
      ? [
          {
            value: "gridlines" as const,
            label: copy("spreadsheet.chartFormatCopy.selection.majorGridlines", zh ? "主要网格线" : "Major Gridlines"),
          },
        ]
      : []),
    // Each axis' own Major and Minor Gridlines, as Office lists them, each
    // with its own line (`gridlineStyleX` / `Y`, `minorGridlineStyleX` / `Y`).
    // The vertical axis' gridlines run across the plot (`Y`), the
    // horizontal axis' up it (`X`). Major ones are listed apart only when
    // both axes show them (one axis' alone is Major Gridlines above).
    ...(attrs && chartSupportsGridlines(attrs.chartType)
      ? (
          [
            ["gridlineStyleY", attrs.format?.gridlinesY === true && attrs.format?.gridlinesX === true, "spreadsheet.chartFormatCopy.selection.verticalMajorGridlines", "纵轴主要网格线", "Vertical Axis Major Gridlines"],
            ["gridlineStyleX", attrs.format?.gridlinesY === true && attrs.format?.gridlinesX === true, "spreadsheet.chartFormatCopy.selection.horizontalMajorGridlines", "横轴主要网格线", "Horizontal Axis Major Gridlines"],
            ["minorGridlineStyleY", attrs.format?.minorGridlinesY === true, "spreadsheet.chartFormatCopy.selection.verticalMinorGridlines", "纵轴次要网格线", "Vertical Axis Minor Gridlines"],
            ["minorGridlineStyleX", attrs.format?.minorGridlinesX === true, "spreadsheet.chartFormatCopy.selection.horizontalMinorGridlines", "横轴次要网格线", "Horizontal Axis Minor Gridlines"],
          ] as const
        )
          .filter(([, shown]) => shown)
          .map(([value, , key, zhLabel, enLabel]) => ({
            value,
            label: copy(key, zh ? zhLabel : enLabel),
          }))
      : []),
  ];
  const area =
    selection.identity === selectionIdentity &&
    selections.some((item) => item.value === selection.area)
      ? selection.area
      : "chartAreaStyle";
  if (selection.identity !== selectionIdentity || selection.area !== area) {
    setSelection({ identity: selectionIdentity, area });
  }
  rememberChartArea(selectionIdentity, area);
  useEffect(() => {
    onAreaChange?.(area);
    // The callback is the host's latest closure; the area is what changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, selectionIdentity]);
  const setArea = (value: DocumentChartAreaStyleKey) =>
    setSelection({ identity: selectionIdentity, area: value });
  // Word's "More <element> Options…" commands do not open a dialog of their
  // own: they open the Format pane already scoped to the element the command
  // names. A host asks for that here by naming the element plus a token, so
  // that asking twice in a row for the same element reopens the pane rather
  // than being swallowed as an unchanged prop. An element the chart does not
  // currently carry is not in `selections`, and the request is ignored — the
  // same guard the render-phase fallback above already applies.
  const focusRequest = focusArea?.token;
  const focusRequestArea = focusArea?.area;
  const focusAvailable =
    focusRequestArea !== undefined &&
    selections.some((item) => item.value === focusRequestArea);
  const consumedFocusRequest = useRef<number | undefined>(undefined);
  useLayoutEffect(() => {
    if (focusRequest === undefined || focusRequestArea === undefined) return;
    if (consumedFocusRequest.current === focusRequest) return;
    if (!focusAvailable) return;
    consumedFocusRequest.current = focusRequest;
    setSelection({ identity: selectionIdentity, area: focusRequestArea });
    if (formatPaneOpen === undefined) setPaneIdentity(selectionIdentity);
    onFormatPaneOpenChange?.(true);
  }, [
    focusAvailable,
    focusRequest,
    focusRequestArea,
    formatPaneOpen,
    onFormatPaneOpenChange,
    selectionIdentity,
  ]);
  const hitToken = elementHit?.token;
  useLayoutEffect(() => {
    if (!elementHit || !attrs || consumedChartHits.has(elementHit)) return;
    consumedChartHits.add(elementHit);
    const next = officeChartHitArea(attrs, elementHit.hit, area);
    if (!next) return;
    setSelection({ identity: selectionIdentity, area: next as DocumentChartAreaStyleKey });
    if (elementHit.open) {
      if (formatPaneOpen === undefined) setPaneIdentity(selectionIdentity);
      onFormatPaneOpenChange?.(true);
    }
    // One reading per click token; the rest are read when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hitToken]);
  const foreignAdvancedPaint = !officeProfile && Object.values(attrs?.format ?? {}).flatMap(value => Array.isArray(value) ? value : [value]).some(value =>
    value && typeof value === "object" && ("shapePaint" in value || "textPaint" in value));
  const disabledReason = editorDisabledReason ?? getAreaDisabledReason?.(area) ?? (foreignAdvancedPaint
    ? (copy("spreadsheet.chartFormatCopy.availability.editThisAdvancedStyleInDocs", zh ? "此高级样式请在 Docs 中编辑" : "Edit this advanced style in Docs")) : null);
  // One point selected by a second click (Format Data Point): a column's,
  // a bar's or a funnel stage's own fill, line and effects (its `c:dPt`,
  // `sliceStyles` by series and point), as Office formats it. A line's or a
  // scatter's point is its marker and label (the paint controls stand aside).
  const pointSelected =
    officeChartPointArea(area) !== null &&
    !(attrs !== null && (attrs.chartType === "column" || attrs.chartType === "bar" || attrs.chartType === "funnel"));
  // What the chart's part keeps: an Office 2016 (chartEx) chart keeps its
  // frame's paint only, and a series' own paint reaches a funnel at most. The
  // axis of a histogram, a waterfall or a funnel is still selectable (its Axis
  // Options are kept); its fill and line are not, and writing them refused
  // the whole page at the save (`ChartAttrsV2`).
  const paintNotKept =
    attrs !== null &&
    !pointSelected &&
    // The secondary axis's line and labels follow the primary's (the model
    // keeps no paint of its own for it).
    (area === "axis:secondaryValue" ||
      area === "axis:series" ||
      (area.startsWith("series:")
        ? !chartTakesSeriesStyles(attrs.chartType)
        : !(CHART_FRAME_STYLE_KEYS as readonly string[]).includes(area) &&
          !chartTakesAreaStyles(attrs.chartType)));
  const paintDisabledReason =
    disabledReason ??
    (pointSelected
      ? copy("spreadsheet.chartFormatCopy.selection.pointPaintFollowsSeries", zh ? "数据点的填充与线条随其系列" : "A point's fill and line follow its series")
      : paintNotKept
        ? copy("spreadsheet.chartFormatCopy.selection.paintNotKeptForChartType", zh ? "此图表类型不保存该元素的填充与线条" : "This chart type doesn't keep fill and line on this element")
        : null);
  const palette =
    paletteSession &&
    paletteSession.identity === selectionIdentity &&
    paletteSession.authority === authority &&
    paletteSession.area === area &&
    (paletteSession.origin !== "pane" || paneOpen) &&
    disabledReason === null
      ? paletteSession.field
      : null;
  if (paletteSession && palette === null) setPaletteSession(null);
  const live = useRef({
    identity: selectionIdentity,
    authority,
    area,
    editable: disabledReason === null,
    session: paletteSession,
  });
  useLayoutEffect(() => {
    live.current = {
      identity: selectionIdentity,
      authority,
      area,
      editable: disabledReason === null,
      session: paletteSession,
    };
    return () => {
      live.current.editable = false;
      live.current.session = null;
    };
  }, [selectionIdentity, authority, area, disabledReason, paletteSession]);
  const setPalette = (
    value:
      | DocumentChartPaintField
      | null
      | ((
          current: DocumentChartPaintField | null,
        ) => DocumentChartPaintField | null),
    origin: "ribbon" | "pane" | "wordart" = "ribbon",
  ) => {
    const field =
      typeof value === "function"
        ? value(paletteSession?.origin === origin ? palette : null)
        : value;
    const session = field
      ? { identity: selectionIdentity, authority, area, field, origin }
      : null;
    live.current.session = session;
    setPaletteSession(session);
  };
  const seriesMatch = /^series:([0-9]+)$/.exec(area);
  const seriesIndex = seriesMatch ? Number(seriesMatch[1]) : null;
  const sliceMatch = /^slice:([0-9]+)$/.exec(area);
  const sliceIndex = sliceMatch ? Number(sliceMatch[1]) : null;
  const axisMatch = /^axis:(category|value)$/.exec(area);
  const axis = axisMatch?.[1] as "category" | "value" | undefined;
  const axisTitleMatch = /^axisTitle:(category|value)$/.exec(area);
  const axisTitle = axisTitleMatch?.[1] as "category" | "value" | undefined;
  // Format Data Point: the point's own row (`c:dPt`), or its series' paint
  // before it has one.
  const pointRef = officeChartPointArea(area);
  const style =
    pointRef !== null
      ? chartPointEffectiveStyle(attrs?.format, pointRef.seriesIndex, pointRef.pointIndex)
      : axis !== undefined
      ? normalizePresentationChartAxisStyles(attrs?.format?.axisStyles)?.find(
          (entry) => entry.axis === axis,
        )
      : axisTitle !== undefined
        ? normalizePresentationChartAxisTitleStyles(attrs?.format?.axisTitleStyles)?.find(
            (entry) => entry.axis === axisTitle,
          )
      : area === "gridlines"
        ? normalizePresentationChartAreaStyle(attrs?.format?.gridlineStyle)
        : area.startsWith("errorBarStyle:")
          ? normalizePresentationChartAreaStyle(
              attrs?.format?.seriesErrorBars?.find((entry) => `errorBarStyle:${entry.seriesIndex}` === area)?.style,
            )
        : sliceIndex !== null
          ? normalizePresentationChartSliceStyles(
              attrs?.format?.sliceStyles,
            )?.find((entry) => entry.pointIndex === sliceIndex)
          : seriesIndex === null
            ? normalizePresentationChartAreaStyle(
                attrs?.format?.[
                  area as Exclude<
                    DocumentChartAreaStyleKey,
                    | `series:${number}`
                    | `slice:${number}`
                    | `point:${number}:${number}`
                    | `axis:${string}`
                    | `axisTitle:${string}`
                    | `errorBarStyle:${number}`
                    | "gridlines"
                  >
                ],
              )
            : normalizePresentationChartSeriesStyles(
                attrs?.format?.seriesStyles,
              )?.find((entry) => entry.seriesIndex === seriesIndex);
  const fill = style && "fill" in style ? style.fill : undefined;
  const outline = style?.outline;
  const effect = style?.shapePaint?.shadow ? "shadow" : style?.effect;
  const textPaint = style && "textPaint" in style ? style.textPaint : undefined;
  const textFill =
    textPaint ? textPaint.fill as PresentationChartAreaPaint : style && "textFill" in style ? style.textFill : undefined;
  const textOutline =
    textPaint ? textPaint.outline as PresentationChartAreaPaint : style && "textOutline" in style ? style.textOutline : undefined;
  const textEffect =
    textPaint ? officeTextPaintEffect(textPaint) : style && "textEffect" in style ? style.textEffect : undefined;
  const areaLabel =
    selections.find((selection) => selection.value === area)?.label ??
    selections[0].label;
  const selectionTestId = (value: DocumentChartAreaStyleKey): string =>
    ({
      chartAreaStyle: "chart-area",
      plotAreaStyle: "plot-area",
      backWallStyle: "back-wall",
      sideWallStyle: "side-wall",
      floorStyle: "floor",
      chartTitleStyle: "chart-title",
      legendStyle: "legend",
      dataLabelStyle: "data-labels",
      dataTableStyle: "data-table",
      trendlineStyle: "trendline",
      errorBarStyle: "error-bars",
      upBarStyle: "up-bars",
      downBarStyle: "down-bars",
      dropLineStyle: "drop-lines",
      highLowLineStyle: "high-low-lines",
      seriesLineStyle: "series-lines",
      dataLabelLeaderLineStyle: "data-label-leader-lines",
      gridlineStyleX: "gridlines-x",
      gridlineStyleY: "gridlines-y",
      minorGridlineStyleX: "minor-gridlines-x",
      minorGridlineStyleY: "minor-gridlines-y",
    })[
      value as Exclude<
        DocumentChartAreaStyleKey,
        `series:${number}` | `slice:${number}` | `point:${number}:${number}` | `axisTitle:${string}`
        | `axis:${string}` | "gridlines" | `errorBarStyle:${number}`
      >
    ] ?? value.replaceAll(":", "-");
  const fillAvailable =
    (seriesIndex !== null && !(officeProfile && (attrs?.chartType === "line" || (attrs?.chartType === "radar" && attrs.chartSubtype !== "filled") || (attrs?.chartType === "xy" && !["bubble", "bubble3d", "markers"].includes(attrs.chartSubtype))))) ||
    sliceIndex !== null ||
    (seriesIndex === null && axis === undefined &&
      area !== "gridlines" &&
      !/^(minorG|g)ridlineStyle[XY]$/.test(area) &&
      area !== "trendlineStyle" &&
      area !== "errorBarStyle" &&
      !area.startsWith("errorBarStyle:") &&
      area !== "dropLineStyle" &&
      area !== "highLowLineStyle" &&
      area !== "seriesLineStyle" &&
      area !== "dataLabelLeaderLineStyle");
  const shapeStyleItems: readonly OfficeStyleGalleryItem<DocumentChartShapeStyleId>[] =
    shapeStyleRecipes.map((recipe) => ({
      id: recipe.id,
      label: recipe.labelKey ? t(recipe.labelKey) : zh ? recipe.zh : recipe.en,
      ...(paintDisabledReason || !onStyle
        ? {
            disabled: true,
            disabledReason:
              paintDisabledReason ??
              (copy("spreadsheet.chartFormatCopy.shape.theSelectedChartElementCannotApplyAPresetStyle", zh
                ? "当前图表元素不能应用预设样式"
                : "The selected chart element cannot apply a preset style")),
          }
        : {}),
    }));
  const sharedStylesUnavailable = officeProfile && (
    (area === "plotAreaStyle" && !["column", "bar", "line", "area", "xy", "combo", "stock"].includes(attrs?.chartType ?? "")) ||
    (seriesIndex !== null && ["radar", "surface", "stock"].includes(attrs?.chartType ?? ""))
  );
  const activeShapeStyleId =
    shapeStyleRecipes.find(
      (recipe) =>
        recipe.outline === outline && (!fillAvailable || recipe.fill === fill),
    )?.id ?? null;
  const wordArtAvailable = area === "chartTitleStyle";
  const wordArtStyleItems: readonly OfficeStyleGalleryItem<DocumentChartWordArtStyleId>[] =
    DOCUMENT_CHART_WORDART_STYLE_RECIPES.map((recipe, index) => ({
      id: recipe.id,
      label: copy("spreadsheet.chartFormatCopy.wordArt.wordArtStyle", `${zh ? "艺术字样式" : "WordArt Style"} ${index + 1}`, { index: index + 1 }),
      ...(!wordArtAvailable || disabledReason || !onTextStyle
        ? {
            disabled: true,
            disabledReason:
              disabledReason ??
              (copy("spreadsheet.chartFormatCopy.wordArt.selectTheChartTitleFirst", zh ? "请先选择图表标题" : "Select the chart title first")),
          }
        : {}),
    }));
  const activeWordArtStyleId =
    DOCUMENT_CHART_WORDART_STYLE_RECIPES.find(
      (recipe) =>
        recipe.textFill === textFill &&
        recipe.textOutline === textOutline &&
        recipe.textEffect === textEffect,
    )?.id ?? null;

  const closePalette = () => {
    if (live.current.session !== paletteSession) return;
    const trigger =
      palette === "fill"
        ? paletteSession?.origin === "pane"
          ? paneFillRef.current
          : fillTriggerRef.current
        : palette === "outline"
          ? paletteSession?.origin === "pane"
            ? paneOutlineRef.current
            : outlineTriggerRef.current
          : palette === "textFill"
            ? textFillTriggerRef.current
            : palette === "textOutline"
              ? textOutlineTriggerRef.current
          : null;
    setPalette(null);
    if (trigger?.isConnected && !trigger.disabled) {
      trigger.focus({ preventScroll: true });
    }
  };

  const paint = (field: DocumentChartPaintField, color: string | null) => {
    const current = live.current;
    if (
      !paletteSession ||
      current.session !== paletteSession ||
      !current.editable ||
      current.identity !== paletteSession.identity ||
      current.authority !== paletteSession.authority ||
      current.area !== paletteSession.area
    )
      return;
    const paintValue =
      color === null ? "none" : (color as PresentationChartAreaPaint);
    if (field === "textFill" || field === "textOutline") {
      onTextStyle?.(area, textPaint ? { textPaint: patchOfficeTextPaint(textPaint, {
        [field === "textFill" ? "fill" : "outline"]: paintValue,
      }) } : {
        ...(textFill === undefined ? {} : { textFill }),
        ...(textOutline === undefined ? {} : { textOutline }),
        ...(textEffect === undefined || textEffect === "none" || textEffect === "bevel" ? {} : { textEffect }),
        [field]: paintValue,
      });
    } else {
      onPaint(area, field, paintValue);
    }
    closePalette();
  };
  const canWriteCurrentArea = () => {
    const current = live.current;
    return current.editable && current.identity === selectionIdentity &&
      current.authority === authority && current.area === area &&
      editorDisabledReason === null && (getAreaDisabledReason?.(area) ?? null) === null;
  };
  // The colour a series or a point draws while automatic (its palette slot),
  // seeding a solid or gradient paint picked on the Format pane.
  const automaticPaint = (() => {
    if (!attrs || (seriesIndex === null && sliceIndex === null)) return undefined;
    const palette = chartPreset(attrs.stylePreset).palette;
    return palette.length ? palette[(seriesIndex ?? sliceIndex ?? 0) % palette.length] : undefined;
  })();
  const sizeDisabledReason =
    hostSizeDisabledReason === undefined ? disabledReason : hostSizeDisabledReason;
  // The size is the object's, not the chart area's: the same selection, and
  // the host's own size reason when it states one.
  const canWriteSize = () =>
    hostSizeDisabledReason === undefined
      ? canWriteCurrentArea()
      : hostSizeDisabledReason === null &&
        live.current.identity === selectionIdentity &&
        live.current.authority === authority;
  const pane = paneOpen ? (
    <DocumentChartFormatPane
      area={area}
      accentColors={accentColors}
      areas={selections}
      paintless={pointSelected || paintNotKept}
      options={paneOptions?.(area)}
      axisOptions={(() => {
        const match = /^axis:(category|value|secondaryValue|series)$/.exec(area);
        if (!match || !onAxisOptions || !attrs) return undefined;
        const axis = match[1] as OfficeChartAxisKey;
        return {
          // A scatter's horizontal axis is a value axis: bounds and units,
          // not category spacing (PPT-B111). The depth axis has its own page.
          kind: axis === "series" ? "series" : attrs.chartType === "xy" || axis === "secondaryValue" ? "value" : axis,
          value: attrs.format?.axisOptions?.[axis] ?? null,
          onChange: (next: OfficeChartAxisOptions | null) => onAxisOptions(axis, next),
          multiLevel:
            axis === "category" &&
            attrs.data.kind === "category" &&
            Boolean(attrs.data.categoryLevels?.length),
          // A bar chart's category axis runs up the side.
          crossedBy: (axis === "category") !== (attrs.chartType === "bar") ? ("vertical" as const) : ("horizontal" as const),
          bins:
            axis === "category" && onChartModel && chartTakesBinIntervalClosed(attrs.chartType, attrs.chartSubtype)
              ? {
                  value: attrs.format?.histogramBins ?? null,
                  onChange: (next: ChartHistogramBins | null) => {
                    if (canWriteCurrentArea()) onChartModel((current) => chartWithHistogramBins(current, next));
                  },
                }
              : undefined,
        };
      })()}
      headerActions={paneHeaderActions}
      className={paneClassName}
      elementPage={(() => {
        // A host's `areas` names the pages it takes; an entry ending in ":"
        // takes every series or point entry of that kind.
        if (
          !elementPane ||
          (elementPane.areas &&
            !elementPane.areas.some(
              (allowed) => allowed === area || (allowed.endsWith(":") && area.startsWith(allowed)),
            ))
        )
          return null;
        const view = elementPane.view ?? (attrs ? officeChartElementView(attrs) : null);
        if (!view) return null;
        return officeChartElementOptionPage(area, {
          locale,
          translate: t,
          view,
          attrs: attrs ?? undefined,
          writable: disabledReason === null && (getAreaDisabledReason?.(area) ?? null) === null,
          disabledReason: disabledReason ?? getAreaDisabledReason?.(area) ?? undefined,
          onIntent: (intent) => {
            if (canWriteCurrentArea()) elementPane.onIntent(intent);
          },
          label: elementPane.label,
          trendlineOptions: elementPane.trendlineOptions,
          seriesOptions: elementPane.seriesOptions,
          barSpacingOptions: elementPane.barSpacingOptions,
          pieOptions: elementPane.pieOptions,
          customErrorAmounts: elementPane.customErrorAmounts,
          dataLabelContents: elementPane.dataLabelContents
            ? {
                ...elementPane.dataLabelContents,
                onChange: (contents) =>
                  canWriteCurrentArea() && elementPane.dataLabelContents!.onChange(contents),
              }
            : undefined,
        });
      })()}
      fill={fill}
      outline={outline}
      effect={effect}
      style={style as OfficeChartPaintStyle | undefined}
      onStyle={
        onStyle && !paintDisabledReason
          ? (next) => {
              if (canWriteCurrentArea()) onStyle(area, next as PresentationChartAreaStyle);
            }
          : undefined
      }
      chartType={attrs?.chartType}
      automaticFill={automaticPaint}
      automaticLine={seriesIndex !== null || sliceIndex !== null ? automaticPaint : undefined}
      smooth={
        attrs && seriesIndex !== null &&
        chartSeriesTakesSmooth(attrs.chartType, attrs.chartSubtype, chartSeriesRenderAsOf(attrs, seriesIndex))
          ? {
              checked:
                (style as { smooth?: boolean } | undefined)?.smooth ??
                (attrs.format?.curve === "smooth" || /smooth/i.test(attrs.chartSubtype)),
            }
          : undefined
      }
      marker={
        attrs && seriesIndex !== null &&
        chartSeriesTakesMarker(attrs.chartType, attrs.chartSubtype, chartSeriesRenderAsOf(attrs, seriesIndex))
          ? { ...((style as { marker?: { symbol?: ChartMarkerSymbol; size?: number } } | undefined)?.marker ?? {}) }
          : undefined
      }
      roundedCorners={
        area === "chartAreaStyle" && elementPane && attrs
          ? {
              checked: attrs.format?.roundedCorners === true,
              onChange: (checked) => {
                if (canWriteCurrentArea()) elementPane.onIntent({ element: "roundedCorners", on: checked });
              },
            }
          : undefined
      }
      fillAvailable={fillAvailable}
      hasStyle={style !== undefined && onReset !== undefined}
      disabledReason={disabledReason}
      isChinese={zh}
      translate={translate}
      effectsLabels={presentationEffectsPaneLabels(t)}
      fillRef={paneFillRef}
      outlineRef={paneOutlineRef}
      activePalette={
        paletteSession?.origin === "pane" &&
        (palette === "fill" || palette === "outline")
          ? palette
          : null
      }
      onArea={(value) => {
        if (selections.some((item) => item.value === value))
          setArea(value as DocumentChartAreaStyleKey);
      }}
      onOpenPalette={(field) =>
        setPalette((open) => (open === field ? null : field), "pane")
      }
      onRememberSelection={onRememberSelection}
      onReset={() => { if (canWriteCurrentArea()) onReset?.(area); }}
      onEffect={
        onEffect ? (nextEffect) => { if (canWriteCurrentArea()) onEffect(area, nextEffect); } : undefined
      }
      onClose={() => {
        closePalette();
        setPaneOpen(false);
        paneTriggerRef.current?.focus({ preventScroll: true });
      }}
      size={size}
      maxSizeEmu={maxSizeEmu}
      onSize={onSize ? (axis, value) => canWriteSize() && onSize(axis, value) : undefined}
      sizeDisabledReason={sizeDisabledReason}
      sizePropertiesSections={paneSizePropertiesSections}
      onRememberSize={onRememberSize}
    />
  ) : null;
  const floatingLayout: Extract<DocumentChartLayout, { mode: "floating" }> =
    layout.mode === "floating"
      ? layout
      : {
          mode: "floating",
          horizontal: "center",
          wrap: "square",
          relativeHeight: 251_658_240,
        };

  const unavailable = (
    id: "wordart" | "arrange" | "size",
    label: string,
    semanticId: "text.fontColor" | "object.align" | "object.width",
    reason: string,
  ) => (
    <OfficeHomeRibbonGroup
      key={id}
      ribbon="chartFormat"
      label={label}
      className={homeStyles.chartDesignGroup}
      testId={`${testIdPrefix}-${id}-group`}
    >
      <OfficeHomeCommandRow>
        <OfficeHomeMenuTrigger
          disabled
          icon={<OfficeSemanticIcon semanticId={semanticId} size={24} />}
          label={label}
          title={reason}
          testId={`${testIdPrefix}-${id}`}
          variant="large"
        />
      </OfficeHomeCommandRow>
    </OfficeHomeRibbonGroup>
  );

  return (
    <>
      <OfficeHomeRibbonGroup
        ribbon="chartFormat"
        label={copy("spreadsheet.chartFormatCopy.selection.currentSelection", zh ? "当前所选内容" : "Current Selection")}
        className={homeStyles.chartDesignGroup}
        testId={`${testIdPrefix}-current-selection-group`}
      >
        <OfficeHomeCommandStack>
          <OfficeHomeCommandRow>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <OfficeHomeMenuTrigger
                  hasMenuIndicator
                  icon={
                    <OfficeSemanticIcon
                      semanticId="chart.selectData"
                      size={18}
                    />
                  }
                  label={selectionFieldLabel ? `${selectionFieldLabel}: ${areaLabel}` : areaLabel}
                  displayLabel={selectionFieldLabel ? areaLabel : undefined}
                  data-office-chart-elements-box={selectionFieldLabel ? "true" : undefined}
                  onPointerDown={onRememberSelection}
                  testId={`${testIdPrefix}-selection`}
                  variant="compact"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="note-editor-toolbar-menu"
              >
                <DropdownMenuRadioGroup value={area}>
                  {selections.map((selection) => (
                    <DropdownMenuRadioItem
                      key={selection.value}
                      value={selection.value}
                      data-testid={`${testIdPrefix}-selection-${selectionTestId(selection.value)}`}
                      onSelect={() => setArea(selection.value)}
                    >
                      {selection.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </OfficeHomeCommandRow>
          <OfficeHomeCommandRow>
            <OfficeHomeCommand
              disabled={paintDisabledReason !== null || style === undefined || !onReset}
              disabledReason={!onReset ? (copy("spreadsheet.chartFormatCopy.selection.resetStyleIsUnavailableForThisChart", zh ? "当前图表不支持重设样式" : "Reset Style is unavailable for this chart")) : undefined}
              displayLabel={copy("spreadsheet.chartFormatCopy.selection.resetStyle", zh ? "重设样式" : "Reset Style")}
              icon={<RefreshCw size={16} />}
              label={copy("spreadsheet.chartFormatCopy.selection.resetToMatchStyle", zh ? "重设以匹配样式" : "Reset to Match Style")}
              onClick={() => { if (canWriteCurrentArea()) onReset?.(area); }}
              testId={`${testIdPrefix}-reset-style`}
              variant="compact"
            />
          </OfficeHomeCommandRow>
        </OfficeHomeCommandStack>
      </OfficeHomeRibbonGroup>

      {slots?.insertShapes !== undefined ? slots.insertShapes : (
      <OfficeHomeRibbonGroup
        ribbon="chartFormat"
        label={copy("spreadsheet.chartFormatCopy.insert.insertShapes", zh ? "插入形状" : "Insert Shapes")}
        className={homeStyles.chartDesignGroup}
        testId={`${testIdPrefix}-insert-shapes-group`}
      >
        <OfficeChartInsertShapesRow
          changeLabel={copy("spreadsheet.chartFormatCopy.insert.changeShape", zh ? "更改形状" : "Change Shape")}
          changeReason={copy("spreadsheet.chartFormatCopy.insert.selectTheInsertedShapeAndUseShapeFormatTo", zh ? "插入后请选择该形状，在“形状格式”中更改" : "Select the inserted shape and use Shape Format to change it")}
          changeTestId={`${testIdPrefix}-change-shape`}
          gallery={
          officeProfile ? <OfficeShapeQuickGallery columns={3} rows={3} disabled={disabledReason !== null || !onInsertShape}
            onSelect={preset => { if (canWriteCurrentArea()) return onInsertShape?.(preset); }} onRememberSelection={onRememberSelection}
            testIdPrefix={`${testIdPrefix}-insert-shapes`} more={
              <DropdownMenu modal={false}><DropdownMenuTrigger asChild>
                <OfficeHomeMenuTrigger geometry="gallery" variant="icon" disabled={disabledReason !== null || !onInsertShape} icon={<OfficeSemanticIcon semanticId="shape.insert" size={16}/>} label={copy("spreadsheet.chartFormatCopy.insert.moreShapes", zh?"更多形状":"More Shapes")} testId={`${testIdPrefix}-insert-shapes`}/>
              </DropdownMenuTrigger><DropdownMenuContent align="start" className={`note-editor-toolbar-menu ${officeShapeCatalogStyles.menu}`}>
                <OfficeShapeCatalogPanel application={application === "spreadsheet" ? "spreadsheet" : "document"} disabled={disabledReason !== null || !onInsertShape} onSelect={preset => canWriteCurrentArea() ? onInsertShape?.(preset) : false} recentStorageKey={shapeRecentStorageKey} testIdPrefix={`${testIdPrefix}-insert-shape`}/>
              </DropdownMenuContent></DropdownMenu>
            }/> :
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <OfficeHomeMenuTrigger
                disabled={disabledReason !== null || !onInsertShape}
                disabledReason={disabledReason ?? undefined}
                hasMenuIndicator
                icon={<OfficeSemanticIcon semanticId="shape.insert" size={24} />}
                label={copy("spreadsheet.chartFormatCopy.insert.shapes", zh ? "形状" : "Shapes")}
                onPointerDown={onRememberSelection}
                testId={`${testIdPrefix}-insert-shapes`}
                variant="large"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className={`note-editor-toolbar-menu ${officeShapeCatalogStyles.menu}`}
            >
              <OfficeShapeCatalogPanel
                application={application === "spreadsheet" ? "spreadsheet" : "document"}
                disabled={disabledReason !== null || !onInsertShape}
                onSelect={(preset) => onInsertShape?.(preset)}
                recentStorageKey={shapeRecentStorageKey}
                testIdPrefix={`${testIdPrefix}-insert-shape`}
              />
            </DropdownMenuContent>
          </DropdownMenu>
          }
        />
      </OfficeHomeRibbonGroup>
      )}

      <OfficeHomeRibbonGroup
        ribbon="chartFormat"
        label={copy("spreadsheet.chartFormatCopy.shape.shapeStyles", zh ? "形状样式" : "Shape Styles")}
        className={homeStyles.chartDesignGroup}
        testId={`${testIdPrefix}-shape-styles-group`}
      >
        <div className={homeStyles.shapeStylesBody}>
          {officeProfile ? <OfficeShapeStyleGallery
            application={application}
            recipes={sharedShapeStyleRecipes}
            quickCount={3} pagingLabels={{previous:copy("spreadsheet.chartFormatCopy.shape.previousStyles", zh?"上一组样式":"Previous styles"),next:copy("spreadsheet.chartFormatCopy.shape.nextStyles", zh?"下一组样式":"Next styles")}}
            quickRow={fillAvailable ? "shadow" : "outline"}
            label={copy("spreadsheet.chartFormatCopy.shape.chartElementShapeStyles", zh ? "图表元素形状样式" : "Chart Element Shape Styles")}
            moreLabel={copy("spreadsheet.chartFormatCopy.shape.moreShapeStyles", zh ? "更多形状样式" : "More Shape Styles")}
            labelFor={translate
              ? (recipe) => translate("spreadsheet.sharedStyleCopy.shape.label", {
                  style: translate(`spreadsheet.sharedStyleCopy.shape.rows.${recipe.row}`),
                  color: translate(`spreadsheet.sharedStyleCopy.shape.columns.${recipe.column}`),
                })
              : undefined}
            disabled={paintDisabledReason !== null || !onStyle || sharedStylesUnavailable}
            getDisabledReason={(recipe) => sharedStylesUnavailable
              ? (copy("spreadsheet.chartFormatCopy.shape.sharedShapeStylesAreUnavailableForThisElement", zh ? "此元素暂不支持共享形状样式" : "Shared shape styles are unavailable for this element"))
              : !fillAvailable && recipe.row !== "outline"
              ? (copy("spreadsheet.chartFormatCopy.shape.thisLineElementSupportsOutlineStylesOnly", zh ? "此线条元素仅支持轮廓样式" : "This line element supports outline styles only")) : undefined}
            value={sharedShapeStyleRecipes.find((recipe) =>
              recipe.stroke === outline && (!fillAvailable || recipe.fill === fill) &&
              JSON.stringify(officeChartShapeRecipePaint(recipe, fillAvailable)) === JSON.stringify(style?.shapePaint)
            )?.id ?? null}
            onCommit={(recipe) => {
              if (!canWriteCurrentArea()) return;
              // The shared tile writer (lib/office-chart-shape-style), which the
              // AI's chart format_element commands run too.
              const next = officeChartShapeStyleApplied(attrs, area, style ?? undefined, recipe);
              if (next) onStyle?.(area, next);
            }}
            testIdPrefix={`${testIdPrefix}-shape-styles`}
          /> : <OfficeStyleGallery<DocumentChartShapeStyleId>
            application={application}
            ariaLabel={copy("spreadsheet.chartFormatCopy.shape.chartElementShapeStyles", zh ? "图表元素形状样式" : "Chart Element Shape Styles")}
            className={homeStyles.shapeTextStyleGallery}
            disabled={paintDisabledReason !== null || !onStyle}
            items={shapeStyleItems}
            labels={{ more: copy("spreadsheet.chartFormatCopy.shape.moreShapeStyles", zh ? "更多形状样式" : "More Shape Styles") }}
            quickIds={shapeStyleRecipes.map(
              (recipe) => recipe.id,
            )}
            value={activeShapeStyleId}
            renderPreview={(item) => {
              const recipe = shapeStyleRecipes.find(
                (candidate) => candidate.id === item.id,
              )!;
              return (
                <span
                  aria-hidden="true"
                  style={{
                    alignItems: "center",
                    background: fillAvailable ? recipe.fill : "transparent",
                    border: `2px solid ${recipe.outline}`,
                    borderRadius: 5,
                    color: recipe.outline,
                    display: "flex",
                    fontSize: 15,
                    fontWeight: 600,
                    height: 42,
                    justifyContent: "center",
                    width: 50,
                  }}
                >
                  Abc
                </span>
              );
            }}
            onPreviewChange={() => undefined}
            onCommit={(styleId) => {
              const recipe = shapeStyleRecipes.find(
                (candidate) => candidate.id === styleId,
              );
              if (!recipe || !canWriteCurrentArea()) return;
              onStyle?.(
                area,
                fillAvailable
                  ? { fill: recipe.fill, outline: recipe.outline }
                  : { outline: recipe.outline },
              );
            }}
            testIdPrefix={`${testIdPrefix}-shape-styles`}
          />}
          <OfficeHomeCommandStack className={officeProfile ? homeStyles.formatPaintCommands : homeStyles.shapeStyleCommands}>
            <OfficeHomeCommandRow>
              <div className={homeStyles.shapeColorPopoverHost}>
                <OfficeHomeMenuTrigger
                  ref={fillTriggerRef}
                  active={officeProfile ? palette === "fill" : fill !== undefined}
                  disabled={paintDisabledReason !== null || !fillAvailable}
                  disabledReason={
                    paintDisabledReason ??
                    (!fillAvailable
                      ? copy("spreadsheet.chartFormatCopy.shape.lineElementsHaveAnOutlineNotAFill", zh
                        ? "线对象只有轮廓，没有填充"
                        : "Line elements have an outline, not a fill")
                      : undefined)
                  }
                  hasMenuIndicator
                  icon={
                    <OfficeSemanticIcon semanticId="shape.fill" size={20} />
                  }
                  label={copy("spreadsheet.chartFormatCopy.shape.shapeFill", zh ? "形状填充" : "Shape Fill")}
                  aria-expanded={palette === "fill"}
                  aria-haspopup="dialog"
                  onClick={() =>
                    setPalette((open) => (open === "fill" ? null : "fill"))
                  }
                  testId={`${testIdPrefix}-fill`}
                  variant={officeProfile ? "large" : "compact"}
                />
                {palette === "fill" ? (
                  <OfficeColorPalettePopover
                    themeColumns={themeColumns}
                    anchorRef={
                      paletteSession?.origin === "pane"
                        ? paneFillRef
                        : fillTriggerRef
                    }
                    value={fill === "none" ? undefined : fill}
                    allowNoFill={seriesIndex === null && fillAvailable}
                    noFillSelected={fill === "none"}
                    labels={{
                      themeColors: t("toolbar.themeColors"),
                      standardColors: t("toolbar.standardColors"),
                      recentColors: t("spreadsheet.recentColors"),
                      moreColors: copy("spreadsheet.chartFormatCopy.shape.moreFillColors", zh ? "更多填充颜色" : "More Fill Colors"),
                      noFill: copy("spreadsheet.chartFormatCopy.shape.noFill", zh ? "无填充" : "No Fill"),
                    }}
                    onPick={(color) => paint("fill", color)}
                    onDismiss={closePalette}
                    testIdPrefix={`${testIdPrefix}-fill`}
                  />
                ) : null}
              </div>
              <div className={homeStyles.shapeColorPopoverHost}>
                <OfficeHomeMenuTrigger
                  ref={outlineTriggerRef}
                  active={officeProfile ? palette === "outline" : outline !== undefined}
                  disabled={paintDisabledReason !== null}
                  disabledReason={paintDisabledReason ?? undefined}
                  hasMenuIndicator
                  icon={
                    <OfficeSemanticIcon semanticId="shape.outline" size={20} />
                  }
                  label={copy("spreadsheet.chartFormatCopy.shape.shapeOutline", zh ? "形状轮廓" : "Shape Outline")}
                  aria-expanded={palette === "outline"}
                  aria-haspopup="dialog"
                  onClick={() =>
                    setPalette((open) =>
                      open === "outline" ? null : "outline",
                    )
                  }
                  testId={`${testIdPrefix}-outline`}
                  variant={officeProfile ? "icon" : "compact"}
                />
                {palette === "outline" ? (
                  <OfficeColorPalettePopover
                    themeColumns={themeColumns}
                    anchorRef={
                      paletteSession?.origin === "pane"
                        ? paneOutlineRef
                        : outlineTriggerRef
                    }
                    value={outline === "none" ? undefined : outline}
                    allowNoFill
                    noFillSelected={outline === "none"}
                    labels={{
                      themeColors: t("toolbar.themeColors"),
                      standardColors: t("toolbar.standardColors"),
                      recentColors: t("spreadsheet.recentColors"),
                      moreColors: copy("spreadsheet.chartFormatCopy.shape.moreOutlineColors", zh ? "更多轮廓颜色" : "More Outline Colors"),
                      noFill: copy("spreadsheet.chartFormatCopy.shape.noOutline", zh ? "无轮廓" : "No Outline"),
                    }}
                    onPick={(color) => paint("outline", color)}
                    onDismiss={closePalette}
                    testIdPrefix={`${testIdPrefix}-outline`}
                  />
                ) : null}
              </div>
            </OfficeHomeCommandRow>
            <OfficeHomeCommandRow>
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <OfficeHomeMenuTrigger
                    active={effect !== undefined}
                    disabled={paintDisabledReason !== null || !onEffect}
                    disabledReason={paintDisabledReason ?? undefined}
                    hasMenuIndicator
                    icon={
                      <OfficeSemanticIcon semanticId="shape.effects" size={20} />
                    }
                    label={copy("spreadsheet.chartFormatCopy.shape.shapeEffects", zh ? "形状效果" : "Shape Effects")}
                    testId={`${testIdPrefix}-effects`}
                    variant={officeProfile ? "icon" : "compact"}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="note-editor-toolbar-menu"
                >
                  <DropdownMenuRadioGroup value={effect ?? "none"}>
                    {(["none", ...PRESENTATION_CHART_EFFECT_PRESETS] as const).map(
                      (preset) => (
                        <DropdownMenuRadioItem
                          key={preset}
                          value={preset}
                          data-testid={`${testIdPrefix}-effect-${preset}`}
                          disabled={
                            preset !== "none" &&
                            !presentationChartAreaDrawsEffect(area, preset)
                          }
                          title={
                            preset !== "none" &&
                            !presentationChartAreaDrawsEffect(area, preset)
                              ? copy(
                                  "spreadsheet.chartFormatCopy.shape.effectNotForElement",
                                  zh
                                    ? "此效果只能用于整个图表区"
                                    : "This effect applies to the whole chart area only",
                                )
                              : undefined
                          }
                          onSelect={() =>
                            canWriteCurrentArea() && onEffect?.(
                              area,
                              preset === "none" ? null : preset,
                            )
                          }
                        >
                          {{
                            none: copy("spreadsheet.chartFormatCopy.shape.noEffect", zh ? "无效果" : "No Effect"),
                            shadow: copy("spreadsheet.chartFormatCopy.shape.shadow", zh ? "阴影" : "Shadow"),
                            reflection: copy("spreadsheet.chartFormatCopy.shape.reflection", zh ? "映像" : "Reflection"),
                            glow: copy("spreadsheet.chartFormatCopy.shape.glow", zh ? "发光" : "Glow"),
                            softEdge: copy("spreadsheet.chartFormatCopy.shape.softEdges", zh ? "柔化边缘" : "Soft Edges"),
                            bevel: copy("spreadsheet.chartFormatCopy.shape.bevel", zh ? "棱台" : "Bevel"),
                            threeD: copy("spreadsheet.chartFormatCopy.shape.3DRotation", zh ? "三维旋转" : "3-D Rotation"),
                          }[preset]}
                        </DropdownMenuRadioItem>
                      ),
                    )}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </OfficeHomeCommandRow>
          </OfficeHomeCommandStack>
        </div>
      </OfficeHomeRibbonGroup>

      {showWordArt ? <OfficeHomeRibbonGroup
        ribbon="chartFormat"
        label={copy("spreadsheet.chartFormatCopy.wordArt.wordArtStyles", zh ? "艺术字样式" : "WordArt Styles")}
        className={homeStyles.chartDesignGroup}
        testId={`${testIdPrefix}-wordart-group`}
      >
        <div className={homeStyles.shapeStylesBody}>
          {officeProfile ? <OfficeWordArtStyleGallery
            application={application}
            labels={translate ? {
              title: translate("spreadsheet.chartFormatCopy.wordArtGallery.title"),
              more: translate("spreadsheet.chartFormatCopy.wordArtGallery.more"),
            } : undefined}
            recipes={wordArtRecipes}
            // The fifteen have the chart copy's names; the twenty PowerPoint's.
            labelFor={translate ? recipe => recipe.id.startsWith("ppt-wordart-") ? "" : translate(`spreadsheet.chartFormatCopy.wordArtGallery.styles.${recipe.id}`) : undefined}
            value={wordArtRecipes.find((recipe) => sameOfficeTextPaint(textPaint, recipe.paint))?.id ?? null}
            disabled={!wordArtAvailable || disabledReason !== null || !onTextStyle}
            disabledReason={disabledReason ?? (copy("spreadsheet.chartFormatCopy.wordArt.selectTheChartTitleFirst", zh ? "请先选择图表标题" : "Select the chart title first"))}
            onCommit={(recipe) => {
              if (wordArtAvailable && canWriteCurrentArea()) onTextStyle?.(area, { textPaint: recipe.paint });
            }}
            testIdPrefix={`${testIdPrefix}-wordart`}
          /> : <OfficeStyleGallery<DocumentChartWordArtStyleId>
            application={application}
            ariaLabel={copy("spreadsheet.chartFormatCopy.wordArt.chartTitleWordArtStyles", zh ? "图表标题艺术字样式" : "Chart Title WordArt Styles")}
            className={homeStyles.shapeTextStyleGallery}
            disabled={!wordArtAvailable || disabledReason !== null || !onTextStyle}
            items={wordArtStyleItems}
            labels={{ more: copy("spreadsheet.chartFormatCopy.wordArt.moreWordArtStyles", zh ? "更多艺术字样式" : "More WordArt Styles") }}
            quickIds={DOCUMENT_CHART_WORDART_STYLE_RECIPES.map(
              (recipe) => recipe.id,
            )}
            value={activeWordArtStyleId}
            renderPreview={(item) => {
              const recipe = DOCUMENT_CHART_WORDART_STYLE_RECIPES.find(
                (candidate) => candidate.id === item.id,
              )!;
              return (
                <span
                  aria-hidden="true"
                  className={homeStyles.shapeTextStylePreview}
                  style={{
                    color:
                      recipe.textFill === "none"
                        ? "transparent"
                        : recipe.textFill,
                    WebkitTextStroke:
                      recipe.textOutline === "none"
                        ? undefined
                        : `1px ${recipe.textOutline}`,
                    textShadow:
                      recipe.textEffect === "shadow"
                        ? "2px 2px 2px rgb(15 23 42 / 35%)"
                        : undefined,
                  }}
                >
                  A
                </span>
              );
            }}
            onPreviewChange={() => undefined}
            onCommit={(styleId) => {
              const recipe = DOCUMENT_CHART_WORDART_STYLE_RECIPES.find(
                (candidate) => candidate.id === styleId,
              );
              if (!recipe || !canWriteCurrentArea()) return;
              onTextStyle?.(area, {
                textFill: recipe.textFill,
                textOutline: recipe.textOutline,
                ...(recipe.textEffect
                  ? { textEffect: recipe.textEffect }
                  : {}),
              });
            }}
            testIdPrefix={`${testIdPrefix}-wordart`}
          />}
          <OfficeHomeCommandStack className={officeProfile ? homeStyles.formatPaintCommands : homeStyles.shapeStyleCommands}>
            <OfficeHomeCommandRow>
              <div className={homeStyles.shapeColorPopoverHost}>
                <OfficeHomeMenuTrigger
                  ref={textFillTriggerRef}
                  active={officeProfile ? palette === "textFill" : textFill !== undefined}
                  disabled={!wordArtAvailable || disabledReason !== null || !onTextStyle}
                  disabledReason={
                    disabledReason ??
                    (!wordArtAvailable
                      ? copy("spreadsheet.chartFormatCopy.wordArt.selectTheChartTitleFirst", zh
                        ? "请先选择图表标题"
                        : "Select the chart title first")
                      : undefined)
                  }
                  hasMenuIndicator
                  icon={
                    <OfficeSemanticIcon semanticId="text.fontColor" size={18} />
                  }
                  label={copy("spreadsheet.chartFormatCopy.wordArt.textFill", zh ? "文本填充" : "Text Fill")}
                  aria-expanded={palette === "textFill"}
                  aria-haspopup="dialog"
                  onClick={() =>
                    setPalette(
                      (open) => (open === "textFill" ? null : "textFill"),
                      "wordart",
                    )
                  }
                  testId={`${testIdPrefix}-text-fill`}
                  variant={officeProfile ? "large" : "compact"}
                />
                {palette === "textFill" ? (
                  <OfficeColorPalettePopover
                    themeColumns={themeColumns}
                    anchorRef={textFillTriggerRef}
                    value={textFill === "none" ? undefined : textFill}
                    allowNoFill
                    noFillSelected={textFill === "none"}
                    labels={{
                      themeColors: t("toolbar.themeColors"),
                      standardColors: t("toolbar.standardColors"),
                      recentColors: t("spreadsheet.recentColors"),
                      moreColors: copy("spreadsheet.chartFormatCopy.wordArt.moreTextColors", zh ? "更多文本颜色" : "More Text Colors"),
                      noFill: copy("spreadsheet.chartFormatCopy.wordArt.noFill", zh ? "无填充" : "No Fill"),
                    }}
                    onPick={(color) => paint("textFill", color)}
                    onDismiss={closePalette}
                    testIdPrefix={`${testIdPrefix}-text-fill`}
                  />
                ) : null}
              </div>
              <div className={homeStyles.shapeColorPopoverHost}>
                <OfficeHomeMenuTrigger
                  ref={textOutlineTriggerRef}
                  active={officeProfile ? palette === "textOutline" : textOutline !== undefined && textOutline !== "none"}
                  disabled={!wordArtAvailable || disabledReason !== null || !onTextStyle}
                  disabledReason={
                    disabledReason ??
                    (!wordArtAvailable
                      ? copy("spreadsheet.chartFormatCopy.wordArt.selectTheChartTitleFirst", zh
                        ? "请先选择图表标题"
                        : "Select the chart title first")
                      : undefined)
                  }
                  hasMenuIndicator
                  icon={
                    <OfficeSemanticIcon semanticId="format.lineColor" size={18} />
                  }
                  label={copy("spreadsheet.chartFormatCopy.wordArt.textOutline", zh ? "文本轮廓" : "Text Outline")}
                  aria-expanded={palette === "textOutline"}
                  aria-haspopup="dialog"
                  onClick={() =>
                    setPalette(
                      (open) =>
                        open === "textOutline" ? null : "textOutline",
                      "wordart",
                    )
                  }
                  testId={`${testIdPrefix}-text-outline`}
                  variant={officeProfile ? "icon" : "compact"}
                />
                {palette === "textOutline" ? (
                  <OfficeColorPalettePopover
                    themeColumns={themeColumns}
                    anchorRef={textOutlineTriggerRef}
                    value={textOutline === "none" ? undefined : textOutline}
                    allowNoFill
                    noFillSelected={textOutline === "none"}
                    labels={{
                      themeColors: t("toolbar.themeColors"),
                      standardColors: t("toolbar.standardColors"),
                      recentColors: t("spreadsheet.recentColors"),
                      moreColors: copy("spreadsheet.chartFormatCopy.wordArt.moreTextOutlineColors", zh ? "更多文本轮廓颜色" : "More Text Outline Colors"),
                      noFill: copy("spreadsheet.chartFormatCopy.wordArt.noOutline", zh ? "无轮廓" : "No Outline"),
                    }}
                    onPick={(color) => paint("textOutline", color)}
                    onDismiss={closePalette}
                    testIdPrefix={`${testIdPrefix}-text-outline`}
                  />
                ) : null}
              </div>
            </OfficeHomeCommandRow>
            <OfficeHomeCommandRow>
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <OfficeHomeMenuTrigger
                    active={textEffect !== undefined}
                    disabled={!wordArtAvailable || disabledReason !== null || !onTextStyle}
                    disabledReason={disabledReason ?? undefined}
                    hasMenuIndicator
                    icon={
                      <OfficeSemanticIcon semanticId="shape.effects" size={18} />
                    }
                    label={copy("spreadsheet.chartFormatCopy.wordArt.textEffects", zh ? "文本效果" : "Text Effects")}
                    testId={`${testIdPrefix}-text-effects`}
                    variant={officeProfile ? "icon" : "compact"}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="note-editor-toolbar-menu"
                >
                  <DropdownMenuRadioGroup value={textEffect ?? "none"}>
                    {(["none", ...PRESENTATION_CHART_TEXT_EFFECT_PRESETS] as const).map(
                      (preset) => (
                        <DropdownMenuRadioItem
                          key={preset}
                          value={preset}
                          data-testid={`${testIdPrefix}-text-effect-${preset}`}
                          disabled={Boolean(textPaint) && preset === "softEdge"}
                          onSelect={() =>
                            canWriteCurrentArea() && !(textPaint && preset === "softEdge") && onTextStyle?.(area, textPaint ? {
                              textPaint: patchOfficeTextPaint(textPaint, { effect: preset }),
                            } : {
                              ...(textFill === undefined ? {} : { textFill }),
                              ...(textOutline === undefined
                                ? {}
                                : { textOutline }),
                              ...(preset === "none"
                                ? {}
                                : { textEffect: preset }),
                            })
                          }
                        >
                          {{
                            none: copy("spreadsheet.chartFormatCopy.wordArt.noEffect", zh ? "无效果" : "No Effect"),
                            shadow: copy("spreadsheet.chartFormatCopy.wordArt.shadow", zh ? "阴影" : "Shadow"),
                            reflection: copy("spreadsheet.chartFormatCopy.wordArt.reflection", zh ? "映像" : "Reflection"),
                            glow: copy("spreadsheet.chartFormatCopy.wordArt.glow", zh ? "发光" : "Glow"),
                            softEdge: copy("spreadsheet.chartFormatCopy.wordArt.softEdges", zh ? "柔化边缘" : "Soft Edges"),
                          }[preset]}
                        </DropdownMenuRadioItem>
                      ),
                    )}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </OfficeHomeCommandRow>
          </OfficeHomeCommandStack>
        </div>
      </OfficeHomeRibbonGroup> : null}
      {onAltText ? (
        <OfficeHomeRibbonGroup
          ribbon="chartFormat"
          label={copy("presentation.review.accessibilityGroup", "Accessibility")}
          className={homeStyles.chartDesignGroup}
          size="narrow"
          testId={`${testIdPrefix}-accessibility-group`}
        >
          <OfficeHomeCommand
            variant="large"
            icon={<OfficeSemanticIcon semanticId="object.altText" size={24} />}
            label={copy("toolbar.altText", "Alt Text")}
            active={altTextPaneOpen}
            onClick={() => {
              closePalette();
              onAltText();
            }}
            testId={`${testIdPrefix}-alt-text`}
          />
        </OfficeHomeRibbonGroup>
      ) : null}
      {slots?.arrange !== undefined ? slots.arrange : (
      <OfficeHomeRibbonGroup
        ribbon="chartFormat"
        label={copy("spreadsheet.chartFormatCopy.arrange.arrange", zh ? "排列" : "Arrange")}
        className={homeStyles.chartDesignGroup}
        testId={`${testIdPrefix}-arrange-group`}
      >
        <OfficeHomeCommandRow className={officeProfile ? homeStyles.formatArrangeRow : undefined}>
          {onPlacement && placement ? (
            <DocumentChartPlacementControls
              placement={placement}
              onPlacement={onPlacement}
              disabledReason={disabledReason}
              copy={copy}
              testIdPrefix={testIdPrefix}
              officeProfile={officeProfile}
              onMoreLayoutOptions={onMoreLayoutOptions}
              moreLayoutOptionsLabel={copy("document.floatLayout.moreLayoutOptions", "More Layout Options…")}
              group={onGroup}
              selectionPane={
                  <OfficeHomeCommand
                    icon={<OfficeSemanticIcon semanticId="object.selectionPane" size={18} />}
                    label={copy("spreadsheet.chartFormatCopy.arrange.selectionPane", zh ? "选择窗格" : "Selection Pane")}
                    active={selectionPaneOpen}
                    disabled={!onSelectionPane}
                    buttonRef={selectionPaneTriggerRef}
                    onClick={() => {
                      const trigger = selectionPaneTriggerRef.current;
                      if (trigger) {
                        closePalette();
                        onSelectionPane?.(trigger);
                      }
                    }}
                    testId={`${testIdPrefix}-selection-pane`}
                    variant={officeProfile ? "large" : "compact"}
                  />
              }
            />
          ) : (
          <>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <OfficeHomeMenuTrigger
                active={layout.mode === "floating"}
                disabled={disabledReason !== null || !onLayout}
                disabledReason={disabledReason ?? undefined}
                hasMenuIndicator
                icon={<OfficeSemanticIcon semanticId="object.align" size={22} />}
                label={copy("spreadsheet.chartFormatCopy.arrange.position", zh ? "位置" : "Position")}
                testId={`${testIdPrefix}-position`}
                variant="large"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="note-editor-toolbar-menu">
              <DropdownMenuLabel>{copy("spreadsheet.chartFormatCopy.arrange.horizontalPosition", zh ? "水平位置" : "Horizontal Position")}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={layout.mode === "inline" ? "inline" : layout.horizontal}
              >
                {(
                  [
                    ["inline", copy("spreadsheet.chartFormatCopy.arrange.inLineWithText", zh ? "嵌入文字行" : "In Line with Text")],
                    ["left", copy("spreadsheet.chartFormatCopy.arrange.left", zh ? "靠左" : "Left")],
                    ["center", copy("spreadsheet.chartFormatCopy.arrange.center", zh ? "居中" : "Center")],
                    ["right", copy("spreadsheet.chartFormatCopy.arrange.right", zh ? "靠右" : "Right")],
                  ] as const
                ).map(([value, label]) => (
                  <DropdownMenuRadioItem
                    key={value}
                    value={value}
                    data-testid={`${testIdPrefix}-position-${value}`}
                    onSelect={() =>
                      onLayout?.(
                        value === "inline"
                          ? { mode: "inline" }
                          : { ...floatingLayout, horizontal: value },
                      )
                    }
                  >
                    {label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <OfficeHomeMenuTrigger
                active={layout.mode === "floating"}
                disabled={disabledReason !== null || !onLayout}
                disabledReason={disabledReason ?? undefined}
                hasMenuIndicator
                icon={<OfficeSemanticIcon semanticId="paragraph.spacing.line" size={22} />}
                label={copy("spreadsheet.chartFormatCopy.arrange.wrapText", zh ? "自动换行" : "Wrap Text")}
                testId={`${testIdPrefix}-wrap`}
                variant="large"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="note-editor-toolbar-menu">
              <DropdownMenuRadioGroup
                value={layout.mode === "floating" ? layout.wrap : "inline"}
              >
                <DropdownMenuRadioItem
                  value="inline"
                  data-testid={`${testIdPrefix}-wrap-inline`}
                  onSelect={() => onLayout?.({ mode: "inline" })}
                >
                  {copy("spreadsheet.chartFormatCopy.arrange.inLineWithText", zh ? "嵌入文字行" : "In Line with Text")}
                </DropdownMenuRadioItem>
                {(
                  [
                    ["square", copy("spreadsheet.chartFormatCopy.arrange.square", zh ? "四周型" : "Square")],
                    ["topAndBottom", copy("spreadsheet.chartFormatCopy.arrange.topAndBottom", zh ? "上下型" : "Top and Bottom")],
                    ["behindText", copy("spreadsheet.chartFormatCopy.arrange.behindText", zh ? "衬于文字下方" : "Behind Text")],
                    ["inFrontOfText", copy("spreadsheet.chartFormatCopy.arrange.inFrontOfText", zh ? "浮于文字上方" : "In Front of Text")],
                  ] as const
                ).map(([value, label]) => (
                  <DropdownMenuRadioItem
                    key={value}
                    value={value}
                    data-testid={`${testIdPrefix}-wrap-${value}`}
                    onSelect={() => onLayout?.({ ...floatingLayout, wrap: value })}
                  >
                    {label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <OfficeHomeCommandStack>
            <OfficeHomeCommandRow>
              {floatingHeights ? (
                <DropdownMenu>
                  <OfficeHomeSplitLayout
                    testId={`${testIdPrefix}-bring-forward-split`}
                    primary={<OfficeHomeCommand
                disabled={layout.mode !== "floating" || disabledReason !== null || !onLayout}
                icon={<OfficeSemanticIcon semanticId="object.bringForward" size={18} />}
                label={copy("spreadsheet.chartFormatCopy.arrange.bringForward", zh ? "上移一层" : "Bring Forward")}
                onClick={() => {
                  const next = documentChartLayoutOneLayer(floatingLayout, 1);
                  if (next) onLayout?.(next);
                }}
                testId={`${testIdPrefix}-bring-forward`}
                variant={officeProfile ? "large" : "compact"}
              />}
                    trigger={
                      <DropdownMenuTrigger asChild>
                        <OfficeHomeMenuTrigger
                          disabled={layout.mode !== "floating" || disabledReason !== null || !onLayout}
                          icon={<OfficeSemanticIcon semanticId="menu.chevron.down" size={12} />}
                          label={copy("spreadsheet.chartFormatCopy.arrange.bringToFront", zh ? "置于顶层" : "Bring to Front")}
                          testId={`${testIdPrefix}-bring-forward-menu`}
                          variant="icon"
                        />
                      </DropdownMenuTrigger>
                    }
                  />
                  <DropdownMenuContent align="start" className="note-editor-toolbar-menu">
                    <DropdownMenuItem
                      data-testid={`${testIdPrefix}-bring-forward-one`}
                      onSelect={() => {
                        const next = documentChartLayoutOneLayer(floatingLayout, 1);
                        if (next) onLayout?.(next);
                      }}
                    >
                      {copy("spreadsheet.chartFormatCopy.arrange.bringForward", zh ? "上移一层" : "Bring Forward")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      data-testid={`${testIdPrefix}-bring-forward-edge`}
                      onSelect={() => {
                        const next = documentChartLayoutToEdge(floatingLayout, "front", floatingHeights);
                        if (next) onLayout?.(next);
                      }}
                    >
                      {copy("spreadsheet.chartFormatCopy.arrange.bringToFront", zh ? "置于顶层" : "Bring to Front")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : <OfficeHomeCommand
                disabled={layout.mode !== "floating" || disabledReason !== null || !onLayout}
                icon={<OfficeSemanticIcon semanticId="object.bringForward" size={18} />}
                label={copy("spreadsheet.chartFormatCopy.arrange.bringForward", zh ? "上移一层" : "Bring Forward")}
                onClick={() => {
                  const next = documentChartLayoutOneLayer(floatingLayout, 1);
                  if (next) onLayout?.(next);
                }}
                testId={`${testIdPrefix}-bring-forward`}
                variant={officeProfile ? "large" : "compact"}
              />}
              {floatingHeights ? (
                <DropdownMenu>
                  <OfficeHomeSplitLayout
                    testId={`${testIdPrefix}-send-backward-split`}
                    primary={<OfficeHomeCommand
                disabled={layout.mode !== "floating" || disabledReason !== null || !onLayout}
                icon={<OfficeSemanticIcon semanticId="object.sendBackward" size={18} />}
                label={copy("spreadsheet.chartFormatCopy.arrange.sendBackward", zh ? "下移一层" : "Send Backward")}
                onClick={() => {
                  const next = documentChartLayoutOneLayer(floatingLayout, -1);
                  if (next) onLayout?.(next);
                }}
                testId={`${testIdPrefix}-send-backward`}
                variant={officeProfile ? "large" : "compact"}
              />}
                    trigger={
                      <DropdownMenuTrigger asChild>
                        <OfficeHomeMenuTrigger
                          disabled={layout.mode !== "floating" || disabledReason !== null || !onLayout}
                          icon={<OfficeSemanticIcon semanticId="menu.chevron.down" size={12} />}
                          label={copy("spreadsheet.chartFormatCopy.arrange.sendToBack", zh ? "置于底层" : "Send to Back")}
                          testId={`${testIdPrefix}-send-backward-menu`}
                          variant="icon"
                        />
                      </DropdownMenuTrigger>
                    }
                  />
                  <DropdownMenuContent align="start" className="note-editor-toolbar-menu">
                    <DropdownMenuItem
                      data-testid={`${testIdPrefix}-send-backward-one`}
                      onSelect={() => {
                        const next = documentChartLayoutOneLayer(floatingLayout, -1);
                        if (next) onLayout?.(next);
                      }}
                    >
                      {copy("spreadsheet.chartFormatCopy.arrange.sendBackward", zh ? "下移一层" : "Send Backward")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      data-testid={`${testIdPrefix}-send-backward-edge`}
                      onSelect={() => {
                        const next = documentChartLayoutToEdge(floatingLayout, "back", floatingHeights);
                        if (next) onLayout?.(next);
                      }}
                    >
                      {copy("spreadsheet.chartFormatCopy.arrange.sendToBack", zh ? "置于底层" : "Send to Back")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : <OfficeHomeCommand
                disabled={layout.mode !== "floating" || disabledReason !== null || !onLayout}
                icon={<OfficeSemanticIcon semanticId="object.sendBackward" size={18} />}
                label={copy("spreadsheet.chartFormatCopy.arrange.sendBackward", zh ? "下移一层" : "Send Backward")}
                onClick={() => {
                  const next = documentChartLayoutOneLayer(floatingLayout, -1);
                  if (next) onLayout?.(next);
                }}
                testId={`${testIdPrefix}-send-backward`}
                variant={officeProfile ? "large" : "compact"}
              />}
            </OfficeHomeCommandRow>
            <OfficeHomeCommandRow>
              <OfficeHomeCommand
                icon={<OfficeSemanticIcon semanticId="object.selectionPane" size={18} />}
                label={copy("spreadsheet.chartFormatCopy.arrange.selectionPane", zh ? "选择窗格" : "Selection Pane")}
                active={selectionPaneOpen}
                disabled={!onSelectionPane}
                buttonRef={selectionPaneTriggerRef}
                onClick={() => {
                  const trigger = selectionPaneTriggerRef.current;
                  if (trigger) {
                    closePalette();
                    onSelectionPane?.(trigger);
                  }
                }}
                testId={`${testIdPrefix}-selection-pane`}
                variant={officeProfile ? "large" : "compact"}
              />
            </OfficeHomeCommandRow>
          </OfficeHomeCommandStack>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <OfficeHomeMenuTrigger
                disabled={layout.mode !== "floating" || disabledReason !== null || !onLayout}
                hasMenuIndicator
                icon={<OfficeSemanticIcon semanticId="object.align" size={22} />}
                label={copy("spreadsheet.chartFormatCopy.arrange.align", zh ? "对齐" : "Align")}
                testId={`${testIdPrefix}-align`}
                variant="large"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="note-editor-toolbar-menu">
              <DropdownMenuRadioGroup value={floatingLayout.horizontal}>
                {(["left", "center", "right"] as const).map((value) => (
                  <DropdownMenuRadioItem
                    key={value}
                    value={value}
                    data-testid={`${testIdPrefix}-align-${value}`}
                    onSelect={() => onLayout?.({ ...floatingLayout, horizontal: value })}
                  >
                    {{
                      left: copy("spreadsheet.chartFormatCopy.arrange.alignLeft", zh ? "左对齐" : "Align Left"),
                      center: copy("spreadsheet.chartFormatCopy.arrange.alignCenter", zh ? "居中" : "Align Center"),
                      right: copy("spreadsheet.chartFormatCopy.arrange.alignRight", zh ? "右对齐" : "Align Right"),
                    }[value]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          </>
          )}
          <OfficeHomeMenuTrigger
            disabled
            icon={<OfficeSemanticIcon semanticId="object.group" size={22} />}
            label={copy("spreadsheet.chartFormatCopy.arrange.group", zh ? "组合" : "Group")}
            title={copy("spreadsheet.chartFormatCopy.arrange.aChartIsNotAMultiShapeSelection", zh ? "图表不是多选形状组" : "A chart is not a multi-shape selection")}
            testId={`${testIdPrefix}-group`}
            variant={officeProfile ? "compact" : "large"}
          />
          <OfficeHomeMenuTrigger
            disabled
            icon={<OfficeSemanticIcon semanticId="object.rotate" size={22} />}
            label={copy("spreadsheet.chartFormatCopy.arrange.rotate", zh ? "旋转" : "Rotate")}
            title={copy("spreadsheet.chartFormatCopy.arrange.wordChartHostsDoNotSupportRotation", zh ? "Word 原生图表宿主不支持旋转" : "Word chart hosts do not support rotation")}
            testId={`${testIdPrefix}-rotate`}
            variant={officeProfile ? "compact" : "large"}
          />
        </OfficeHomeCommandRow>
      </OfficeHomeRibbonGroup>
      )}
      {size && onSize ? (
        <OfficeHomeRibbonGroup
          ribbon="chartFormat"
          label={copy("spreadsheet.chartFormatCopy.size.size", zh ? "大小" : "Size")}
          className={homeStyles.chartDesignGroup}
          testId={`${testIdPrefix}-size-group`}
        >
          <OfficeHomeCommandStack>
            {(["heightEmu", "widthEmu"] as const).map((axis) => (
              <OfficeRibbonNumberField
                key={`${axis}:${sizeReset}`}
                icon={
                  <OfficeSemanticIcon
                    semanticId={
                      axis === "widthEmu" ? "object.width" : "object.height"
                    }
                    size={18}
                  />
                }
                label={
                  axis === "widthEmu"
                    ? copy("spreadsheet.chartFormatCopy.size.width", zh
                      ? "宽度"
                      : "Width")
                    : copy("spreadsheet.chartFormatCopy.size.height", zh
                      ? "高度"
                      : "Height")
                }
                visibleLabel={
                  axis === "widthEmu"
                    ? copy("spreadsheet.chartFormatCopy.size.width", zh
                      ? "宽度"
                      : "Width")
                    : copy("spreadsheet.chartFormatCopy.size.height", zh
                      ? "高度"
                      : "Height")
                }
                testId={`${testIdPrefix}-${axis === "widthEmu" ? "width" : "height"}`}
                value={(size[axis] / CHART_HOST_EMU_PER_CM).toFixed(2)}
                min={0.01}
                max={maxSizeEmu / CHART_HOST_EMU_PER_CM}
                step={0.1}
                unit={copy("spreadsheet.chartFormatCopy.size.cm", zh ? "厘米" : "cm")}
                disabled={sizeDisabledReason !== null}
                disabledReason={sizeDisabledReason ?? undefined}
                classNames={officeProfile ? undefined : { input: homeStyles.layoutValueInput }}
                onRememberSelection={onRememberSize ?? onRememberSelection}
                onCommit={(raw) => {
                  if (!canWriteSize()) return false;
                  const number = Number(raw);
                  const emu = Math.round(number * CHART_HOST_EMU_PER_CM);
                  if (
                    !raw.trim() ||
                    !Number.isFinite(number) ||
                    emu < 1 ||
                    emu > maxSizeEmu ||
                    !onSize(axis, emu)
                  )
                    setSizeReset((value) => value + 1);
                }}
              />
            ))}
          </OfficeHomeCommandStack>
        </OfficeHomeRibbonGroup>
      ) : (
        unavailable(
          "size",
          copy("spreadsheet.chartFormatCopy.size.size", zh ? "大小" : "Size"),
          "object.width",
          copy("spreadsheet.chartFormatCopy.size.chartSizeRequiresAHostExtentWriter", zh
            ? "图表大小需要宿主 extent 写入器"
            : "Chart size requires a host extent writer"),
        )
      )}
      <OfficeHomeRibbonGroup
        ribbon="chartFormat"
        label={copy("spreadsheet.chartFormatCopy.pane.formatPane", zh ? "格式窗格" : "Format Pane")}
        className={homeStyles.chartDesignGroup}
        testId={`${testIdPrefix}-pane-group`}
      >
        <OfficeHomeCommand
          buttonRef={paneTriggerRef}
          active={paneOpen}
          disabled={!attrs}
          icon={<OfficeSemanticIcon semanticId="format.painter" size={24} />}
          label={copy("spreadsheet.chartFormatCopy.pane.formatPane", zh ? "格式窗格" : "Format Pane")}
          variant="large"
          testId={`${testIdPrefix}-pane`}
          onClick={() => setPaneOpen(!paneOpen)}
        />
      </OfficeHomeRibbonGroup>
      {pane && paneDock ? (
        <OfficeTaskPaneDockSlot dock={paneDock} id="format-chart">
          {pane}
        </OfficeTaskPaneDockSlot>
      ) : pane && paneContainer ? (
        createPortal(pane, paneContainer)
      ) : (
        pane
      )}
    </>
  );
}
