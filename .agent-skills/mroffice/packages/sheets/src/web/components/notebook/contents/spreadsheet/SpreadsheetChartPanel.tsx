"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { doubleClickOnDoubleTap } from "@mrnote/core/web/lib/double-tap.ts";
import { type DrawingLiveSize, type DrawingLiveSizeStore } from "../../../../lib/spreadsheet/drawing-preview";
import { useRef, useState, useSyncExternalStore, type CSSProperties, type ReactElement, type ReactNode, type ClipboardEvent as ReactClipboardEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Camera, X } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { OfficeDrawingResizeGrip, OFFICE_DRAWING_RESIZE_HANDLES, officeDrawingSelectionStyles, type OfficeDrawingResizeHandle } from "@mrnote/core/web/components/office-ribbon/OfficeDrawingSelection.tsx";
import { documentChartStyleAttrs, type DocumentChartStyleId, type DocumentChartStylePaint } from "@mrnote/core/web/components/console/editor/native-document/documentChartStyles.ts";
import { type SpreadsheetChartLike } from "@mrnote/core/web/lib/spreadsheet/chart-v2-model.ts";
import { OfficeChartTitleInput } from "@mrnote/core/web/components/office-ribbon/OfficeChartTitleInput.tsx";
import { dispatchOfficeChartPartHit } from "@mrnote/core/web/lib/office-charts/chart-hit.ts";
import type { ChartBlockAttrsV2 } from "@mrnote/core/web/components/console/editor/extensions/chartBlockShared.ts";
import { presentationChartAreaStyleCss, presentationChartTitleTextPaint, presentationChartTitleWordsCss } from "@mrnote/core/web/lib/presentation-chart-area-style.ts";
import { PIVOT_CHART_BUTTON_BAND_HEIGHT, PivotChartExpandCollapseButtons, PivotChartFieldButtonRow, type PivotChartFieldButton, type PivotChartFieldButtonLayout } from "./PivotChartFieldButtons";
import { isAssignedMacroClick } from "../../../../lib/spreadsheet/macros";
import { chartRowsHavePlottableValue } from "@mrnote/core/web/components/notebook/contents/MiniChart.tsx";
import SpreadsheetChartCanvas from "./SpreadsheetChartCanvas";
import { presentationChartSeriesColorCss, presentationChartSliceColorCss } from "@mrnote/core/web/lib/presentation-chart-area-style.ts";
import { normalizeChartValueAxisNumberFormat, spreadsheetChartColorPaletteColors, spreadsheetChartStyleAppearance, type MiniChartXYSeries, type SpreadsheetChart, type SpreadsheetChartType } from "@mrnote/core/web/lib/spreadsheet/chart.ts";
import { applyNumberFormat } from "@mrnote/core/web/lib/spreadsheet/number-format.ts";
import { type ExcelDateSystemArg } from "@mrnote/core/web/lib/spreadsheet/excel-1900-calendar.ts";

export type ChartInlineTextField = "title" | "axisTitleX" | "axisTitleY";

export interface ChartInlineTextEdit {
  readonly chartKey: string;
  readonly field: ChartInlineTextField;
  readonly value: string;
}

/**
 * CJK detection for the vertical Y-axis title. Excel stacks CJK axis titles
 * as upright glyphs, while Latin titles read bottom-up via the classic
 * rotate(180deg)-on-vertical-rl trick — which turns every CJK glyph
 * upside-down, so the rotation must only apply to non-CJK titles.
 * \p{Script=Han} covers all Han extension blocks.
 */
export const CJK_AXIS_TITLE_RE =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/** The strip an imported chart's vertical axis title runs up, left of its plot. */
export const IMPORTED_CHART_AXIS_TITLE_Y_WIDTH = 18;

/**
 * An imported chart's title box sits in the chart's own title row (the range
 * chart's rule): static in that row, never Office's overlay offsets.
 */
export const IMPORTED_CHART_TITLE_INPUT_STYLE = {
  position: "static",
  width: "100%",
  padding: "0 4px",
  borderRadius: 2,
} as const;

/**
 * A single floating chart canvas (Excel Web parity). The worksheet owns all
 * commands in the contextual ribbon and Format pane; this component only
 * renders the live chart plus selection/move/resize and inline text editing.
 * Positioned by `style` (left/top) the same way a slicer panel is.
 */
export function spreadsheetChartTypeLabel(
  t: (key: string) => string,
  type: SpreadsheetChartType,
): string {
  return t(
    type === "column"
      ? "spreadsheet.sparklineType_column"
      : type === "camera"
        ? "spreadsheet.insertCamera"
        : `spreadsheet.chartType_${type}`,
  );
}

/** An imported chart the shared chart model states and may edit: its
 * import receipt (`source.nativeChartV2Authority`) says `editable: true`. */
export function importedChartOnSharedModel(target: { kind: "native" | "drawing"; chart: object }): boolean {
  if (target.kind !== "drawing") return false;
  const record = target.chart as Record<string, unknown>;
  const source = record.source && typeof record.source === "object" ? (record.source as Record<string, unknown>) : null;
  const receipt = source?.nativeChartV2Authority && typeof source.nativeChartV2Authority === "object"
    ? (source.nativeChartV2Authority as Record<string, unknown>)
    : null;
  return receipt?.editable === true && Boolean(record.chartV2 && typeof record.chartV2 === "object");
}

/** The chart kinds whose primary value axis Format Axis > Number reaches. */
export const SHEET_CHART_VALUE_AXIS_NUMBER_FORMAT_TYPES: ReadonlySet<string> = new Set([
  "column",
  "stacked-column",
  "bar",
  "stacked-bar",
  "line",
  "area",
  "scatter",
]);

export function spreadsheetChartHasValueAxisNumberFormatBlocker(
  chart: unknown,
): boolean {
  if (!chart || typeof chart !== "object" || Array.isArray(chart)) return false;
  const record = chart as Record<string, unknown>;
  return [
    record.nativeValueAxisNumberFormatBlocker,
    record.nativeChartBlocker,
  ].some((value) => typeof value === "string" && value.trim().length > 0);
}

// The sheet's chart styles are the one preset table's (`c:style` ids).
export type ChartStyleGalleryId = `${number}`;

/**
 * Chart Styles on a sheet chart's model: the shared gallery's recipe (its
 * preset and format). A chart of more series than the series paint can
 * address keeps the recipe on the series it addresses. The commit and the
 * gallery's hover preview both run it, so the preview is what OK writes.
 */
export function sheetChartWithStyleRecipe(
  attrs: ChartBlockAttrsV2,
  id: DocumentChartStyleId,
  paint?: DocumentChartStylePaint,
): ChartBlockAttrsV2 | null {
  const whole = documentChartStyleAttrs(attrs, id, paint);
  if (whole || !("series" in attrs.data) || attrs.data.series.length <= 10) return whole;
  const head = { ...attrs, data: { ...attrs.data, series: attrs.data.series.slice(0, 10) } } as ChartBlockAttrsV2;
  const trimmed = head.format?.seriesStyles ? { ...head, format: { ...head.format, seriesStyles: head.format.seriesStyles.filter((item) => item.seriesIndex < 10) } } : head;
  const recipe = documentChartStyleAttrs(trimmed, id, paint);
  return recipe ? { ...attrs, stylePreset: recipe.stylePreset, format: recipe.format } : null;
}

export function spreadsheetChartStyleCss(
  rawStyle: unknown,
  rawColorPalette?: unknown,
  themeAccents: readonly string[] = [],
): CSSProperties {
  const preset = spreadsheetChartStyleAppearance(rawStyle);
  const palette =
    spreadsheetChartColorPaletteColors(rawColorPalette, themeAccents) ??
    preset.palette;
  return {
    color: preset.text,
    "--mrai-chart-background": preset.background,
    "--mrai-chart-border": preset.border,
    "--mrai-chart-plot-background": preset.plotBackground,
    "--mrai-chart-text": preset.text,
    "--mrai-chart-muted": preset.text,
    "--mrai-chart-gridline": preset.gridline,
    ...Object.fromEntries(
      Array.from({ length: 8 }, (_, index) => {
        const color = palette[index % palette.length] ?? preset.palette[0];
        return [
          [`--mrai-chart-series-${index + 1}`, color],
          [`--mrai-chart-series-outline-${index + 1}`, color],
          [`--mrai-chart-slice-fill-${index + 1}`, color],
          [`--mrai-chart-slice-outline-${index + 1}`, color],
        ];
      }).flat(),
    ),
  } as CSSProperties;
}

const noLiveSizeSubscription = () => () => {};

/**
 * One drawing of the object layer, drawn at the size a gesture is dragging it
 * to (`active`) or its own: reads the live-size store itself, so a gesture
 * frame re-renders this drawing alone.
 */
export function SheetDrawingLiveBox({
  store,
  id,
  active,
  children,
}: {
  store: DrawingLiveSizeStore;
  id: string;
  active: boolean;
  children: (size: DrawingLiveSize | undefined) => ReactNode;
}) {
  const size = useSyncExternalStore(store.subscribe, () => store.get(id), () => undefined);
  return <>{children(active ? size : undefined)}</>;
}

/** A PivotChart's field buttons and what they do (ChartPanel, imported frame). */
export interface ChartPivotButtons {
  layout: PivotChartFieldButtonLayout;
  /** The button whose dropdown is open (`${kind}:${colIndex}`). */
  openKey: string | null;
  disabled: boolean;
  onOpen: (button: PivotChartFieldButton, anchor: DOMRect) => void;
  onContextMenu: (button: PivotChartFieldButton, event: ReactMouseEvent) => void;
  onExpandCollapse: (expand: boolean) => void;
  /** A field button was pressed: the chart it selects keeps the Fields pane
   * as it was (the dropdown opens instead). */
  onPress?: () => void;
}

/** Which bands a layout needs: the top (filters, values, legend), the bottom. */
export function pivotChartButtonBands(layout: PivotChartFieldButtonLayout | undefined): {
  top: boolean;
  bottom: boolean;
} {
  return {
    top: Boolean(layout && (layout.top.length > 0 || layout.legend.length > 0)),
    bottom: Boolean(layout && (layout.axis.length > 0 || layout.expandCollapse)),
  };
}

export function PivotChartButtonBand({
  chartId,
  band,
  buttons,
  t,
}: {
  chartId: string;
  band: "top" | "bottom";
  buttons: ChartPivotButtons;
  t: (key: string) => string;
}): ReactElement {
  const labels = {
    filtered: t("spreadsheet.pivotChartFieldFiltered"),
    menu: t("spreadsheet.pivotFieldMenu"),
  };
  return (
    <div
      className="spreadsheet-pivot-chart-buttons"
      data-band={band}
      data-testid={`spreadsheet-pivot-chart-buttons-${band}-${chartId}`}
      style={{ height: PIVOT_CHART_BUTTON_BAND_HEIGHT }}
    >
      <PivotChartFieldButtonRow
        buttons={band === "top" ? buttons.layout.top : buttons.layout.axis}
        align="start"
        chartId={chartId}
        disabled={buttons.disabled}
        openKey={buttons.openKey}
        labels={labels}
        onOpen={buttons.onOpen}
        onContextMenu={buttons.onContextMenu}
        onPress={buttons.onPress}
      />
      {band === "top" ? (
        <PivotChartFieldButtonRow
          buttons={buttons.layout.legend}
          align="end"
          chartId={chartId}
          disabled={buttons.disabled}
          openKey={buttons.openKey}
          labels={labels}
          onOpen={buttons.onOpen}
          onContextMenu={buttons.onContextMenu}
          onPress={buttons.onPress}
        />
      ) : buttons.layout.expandCollapse ? (
        <PivotChartExpandCollapseButtons
          chartId={chartId}
          disabled={buttons.disabled}
          labels={{
            expand: t("spreadsheet.pivotChartExpandEntireField"),
            collapse: t("spreadsheet.pivotChartCollapseEntireField"),
          }}
          onExpandCollapse={buttons.onExpandCollapse}
          onPress={buttons.onPress}
        />
      ) : null}
    </div>
  );
}

export function ChartPanel({
  chart,
  selected,
  showResizeHandles,
  onSelect,
  rows,
  headerRow,
  categoryLevels,
  xySeries,
  valueAxisNumberFormat,
  seriesNumberFormats,
  date1904 = false,
  rangeLabel,
  inlineTextEdit,
  onBeginInlineTextEdit,
  onCommitInlineTextEdit,
  onCancelInlineTextEdit,
  onRemove,
  onMoveStart,
  onResizeStart,
  onObjectKeyDown,
  onObjectPaste,
  onObjectClipboard,
  objectTabIndex,
  liveWidth,
  liveHeight,
  liveSizeStore,
  gestureActive = false,
  themeAccents,
  fontFamily,
  mutationDisabled,
  deleteDisabled,
  resizeDisabled,
  style,
  t,
  quickButtons,
  pivotButtons,
  onRunMacro,
  selectionKey = null,
}: {
  /** The key of this chart's selected element (`chart-selection-store`),
   * while it is the chart selected: its picture frames that element, and its
   * titles are typed in place there. */
  selectionKey?: string | null;
  /** XLS-A081: runs the chart's assigned macro (a plain click on it). */
  onRunMacro?: () => void;
  /** Excel's buttons beside the selected chart (OfficeChartQuickButtons). */
  quickButtons?: ReactNode;
  /** A PivotChart's field buttons, in bands above and below the plot. */
  pivotButtons?: ChartPivotButtons;
  chart: SpreadsheetChart;
  /** Real sheet-chart selection that owns the contextual Chart Design tab. */
  selected: boolean;
  /** Only the primary member exposes grips; all group members retain outlines. */
  showResizeHandles: boolean;
  onSelect: (additive?: boolean, preserve?: boolean) => void;
  onObjectKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => boolean;
  /** A paste with the chart focused (Ctrl+V): the worksheet's object paste. */
  onObjectPaste?: (event: ReactClipboardEvent<HTMLElement>) => void;
  /** The browser's own Copy / Cut on the selected chart (its Edit menu, or a
   *  key the page receives only as the command). */
  onObjectClipboard?: (event: ReactClipboardEvent<HTMLElement>, verb: "copy" | "cut") => void;
  objectTabIndex?: number;
  /** Live [label, value] rows from the source range (re-read on every edit). */
  rows: string[][];
  /** The first row names the series (a PivotChart's report always does). */
  headerRow?: boolean;
  /** A PivotChart's outer axis fields (the model's `categoryLevels`). */
  categoryLevels?: readonly (readonly string[])[];
  /** Native Scatter/Bubble series with independently authenticated X vectors. */
  xySeries?: MiniChartXYSeries[];
  /** Effective live primary value-axis format (linked source already resolved). */
  valueAxisNumberFormat?: string;
  /** Each series' source format (data labels Linked to source). */
  seriesNumberFormats?: readonly (string | undefined)[];
  /** The workbook reads serials in the 1904 date system. */
  date1904?: ExcelDateSystemArg;
  /** The source range's A1 label, shown in the title bar. */
  rangeLabel: string;
  /** Office-style in-place title/axis-title editor owned by the selected chart. */
  inlineTextEdit: ChartInlineTextEdit | null;
  onBeginInlineTextEdit: (field: ChartInlineTextField, value: string) => void;
  onCommitInlineTextEdit: (field: ChartInlineTextField, value: string) => void;
  onCancelInlineTextEdit: () => void;
  onRemove: () => void;
  /** Title-grip pointer-down: begin a MOVE drag (mirrors the column-resize start). */
  onMoveStart: (event: ReactPointerEvent<HTMLElement>) => void;
  /** Corner-handle pointer-down: begin a RESIZE drag. */
  onResizeStart: (event: ReactPointerEvent<HTMLElement>, handle?: OfficeDrawingResizeHandle) => void;
  /**
   * In-flight drag preview size: while THIS chart is being resized, the parent
   * passes the live width/height so the box + MiniChart reflow immediately; the
   * committed chart.width/height are used otherwise. Position is applied via
   * `style` from the parent (left/top), same as a slicer panel.
   */
  liveWidth?: number;
  liveHeight?: number;
  /**
   * The size this chart is being dragged to, frame by frame, while a gesture
   * runs (`gestureActive`): the chart is laid out again at it, as Excel
   * re-draws a chart being resized, instead of the gesture scaling its last
   * drawing. Read from a store so a frame re-renders this panel alone.
   */
  liveSizeStore?: DrawingLiveSizeStore;
  gestureActive?: boolean;
  /** Current workbook accent slots used by Chart Design ▸ Change Colors. */
  themeAccents: readonly string[];
  /** The workbook theme's body face stack, the chart text's own. */
  fontFamily?: string;
  /** Fail-closed route/protection boundary shared by every persistent editor. */
  mutationDisabled: boolean;
  /** Whether the chart cannot be deleted here. Delete and the remove button
   * still reach `onRemove`, which says why. */
  deleteDisabled: boolean;
  /** Whether the chart's frame cannot be sized by its handles (a chart made
   * here on an imported workbook moves and sizes though it is not deleted
   * there). Defaults to `deleteDisabled`. */
  resizeDisabled?: boolean;
  style?: CSSProperties;
  t: (key: string) => string;
}): ReactElement {
  // The picture draws the title and the axis titles (a chart on the model,
  // drawn by the engine): the panel's own title row and axis strips step
  // aside, and the picture takes the whole chart area.
  const [titlesInPicture, setTitlesInPicture] = useState(false);
  const gestureSize = useSyncExternalStore(
    liveSizeStore?.subscribe ?? noLiveSizeSubscription,
    () => liveSizeStore?.get(`native:${chart.id}`),
    () => undefined,
  );
  const liveSize = gestureActive ? gestureSize : undefined;
  const macroPressRef = useRef<{ x: number; y: number } | null>(null);
  const width = liveSize?.width ?? liveWidth ?? chart.width;
  const pivotBands = pivotChartButtonBands(pivotButtons?.layout);
  const height =
    (liveSize?.height ?? liveHeight ?? chart.height) -
    (pivotBands.top ? PIVOT_CHART_BUTTON_BAND_HEIGHT : 0) -
    (pivotBands.bottom ? PIVOT_CHART_BUTTON_BAND_HEIGHT : 0);
  // Camera tool: a live picture of the source range. It reuses this chart object's
  // float/drag/resize/remove/remap/persist machinery but renders the range's
  // display values (`rows` here is the full matrix, not [label,value] series) as
  // a read-only mini-grid — no chart chrome (type selector / axes / legend).
  if (chart.type === "camera") {
    return (
      <div
        className={`spreadsheet-window__chart ${officeDrawingSelectionStyles.selectedHost}`}
        data-testid={`spreadsheet-camera-${chart.id}`}
        data-chart-id={chart.id}
        data-chart-type="camera"
        data-selected={selected ? "true" : undefined}
        tabIndex={objectTabIndex ?? 0}
        aria-label={chart.title || rangeLabel}
        // Excel: a click on a linked picture selects it and takes the keys,
        // so Delete deletes the picture. Here a click on its body selected
        // nothing and the focus stayed on the grid, whose Delete cleared the
        // selected cells instead.
        onPointerDown={(event) => {
          event.stopPropagation();
          if ((event.target as Element).closest("button, input, textarea, select")) return;
          event.currentTarget.focus({ preventScroll: true });
          if (!selected) onSelect(false);
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (onObjectKeyDown(event)) return;
          if (!selected || (event.key !== "Delete" && event.key !== "Backspace")) return;
          event.preventDefault();
          event.stopPropagation();
          onRemove();
        }}
        style={{
          position: "absolute",
          zIndex: 20,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          width,
          padding: 6,
          background: "var(--surface, #ffffff)",
          border: "1px solid var(--border, #e5e7eb)",
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          fontSize: 12,
          ...style,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontWeight: 600,
          }}
        >
          <span
            onPointerDown={onMoveStart}
            title={t("spreadsheet.cameraMove")}
            aria-label={t("spreadsheet.cameraMove")}
            data-testid={`spreadsheet-camera-title-${chart.id}`}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              cursor: "move",
              touchAction: "none",
            }}
          >
            <Camera size={12} aria-hidden /> {chart.title || rangeLabel}
          </span>
          <button
            type="button"
            onClick={onRemove}
            title={t("spreadsheet.cameraRemove")}
            aria-label={t("spreadsheet.cameraRemove")}
            data-testid={`spreadsheet-camera-remove-${chart.id}`}
            style={{ fontSize: 11, padding: "1px 4px", cursor: "pointer" }}
          >
            <X size={11} />
          </button>
        </div>
        <div
          data-testid={`spreadsheet-camera-grid-${chart.id}`}
          style={{
            overflow: "auto",
            maxHeight: Math.max(40, height),
            border: "1px solid var(--border, #e5e7eb)",
            borderRadius: 4,
          }}
        >
          {rows.map((row, ri) => (
            <div key={`r${ri}`} style={{ display: "flex" }}>
              {row.map((cell, ci) => (
                <div
                  key={`c${ci}`}
                  style={{
                    flex: "1 0 56px",
                    minWidth: 56,
                    padding: "2px 5px",
                    borderRight: "1px solid var(--border, #eee)",
                    borderBottom: "1px solid var(--border, #eee)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontVariantNumeric: "tabular-nums",
                  }}
                  title={cell}
                >
                  {cell}
                </div>
              ))}
            </div>
          ))}
        </div>
        {/* A linked picture resizes like every other drawing: the shared
            selection outline above and eight grips, on the chart's own
            resize path. */}
        {selected && showResizeHandles && !(resizeDisabled ?? deleteDisabled) ? OFFICE_DRAWING_RESIZE_HANDLES.map(handle => (
          <OfficeDrawingResizeGrip key={handle} handle={handle} label={`${t("spreadsheet.cameraResize")}: ${handle}`}
            onPointerDown={event=>onResizeStart(event,handle)}
            onClick={event=>event.stopPropagation()}
            data-testid={handle === "se" ? `spreadsheet-camera-resize-${chart.id}` : `spreadsheet-camera-resize-${chart.id}-${handle}`}/>
        )) : null}
      </div>
    );
  }
  // The chart area's outline is the canvas frame's to draw
  // (SpreadsheetChartCanvas); this frame keeps its transparent selection edge,
  // and mixing its `border` with an outline's longhands made React warn and
  // drop one or the other on a restyle.
  const chartAreaFrameStyle = Object.fromEntries(
    Object.entries(presentationChartAreaStyleCss(chart.chartFormat?.chartAreaStyle)).filter(
      ([key]) => !["border", "borderColor", "borderStyle", "borderWidth"].includes(key),
    ),
  ) as CSSProperties;
  const chartVisualStyle = {
    ...spreadsheetChartStyleCss(
      chart.chartStyle,
      chart.chartColorPalette,
      themeAccents,
    ),
    ...presentationChartSeriesColorCss(chart.seriesStyles),
    ...presentationChartSliceColorCss(chart.sliceStyles),
    ...chartAreaFrameStyle,
    ...presentationChartSeriesColorCss(chart.chartFormat?.seriesStyles),
    ...presentationChartSliceColorCss(chart.chartFormat?.sliceStyles),
  };
  return (
    <div
      className={`spreadsheet-window__chart ${officeDrawingSelectionStyles.selectedHost}`}
      data-testid={`spreadsheet-chart-${chart.id}`}
      data-chart-id={chart.id}
      data-drawing-preview-id={`native:${chart.id}`}
      data-drawing-preview-fit="position"
      data-chart-type={chart.type}
      data-chart-group-id={chart.groupId}
      data-selected={selected ? "true" : undefined}
      tabIndex={objectTabIndex ?? 0}
      aria-label={chart.title || rangeLabel}
      onFocus={() => {
        if (!macroPressRef.current) onSelect(false, true);
      }}
      data-macro={chart.macro ? "true" : undefined}
      title={chart.macro && onRunMacro && !selected ? chart.macro : undefined}
      onPointerDownCapture={(event) => {
        // XLS-A081: a plain press on a chart with a macro starts a click that
        // runs it; it neither selects nor moves the chart.
        macroPressRef.current =
          chart.macro && onRunMacro && event.button === 0 &&
          !event.shiftKey && !event.ctrlKey && !event.metaKey
            ? { x: event.clientX, y: event.clientY }
            : null;
        if (macroPressRef.current) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onClick={(event) => {
        const macroPress = macroPressRef.current;
        macroPressRef.current = null;
        if (
          onRunMacro &&
          isAssignedMacroClick(macroPress, {
            x: event.clientX,
            y: event.clientY,
            button: event.button,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
            shiftKey: event.shiftKey,
          })
        ) {
          event.stopPropagation();
          onRunMacro();
          return;
        }
        onSelect(event.shiftKey || event.ctrlKey || event.metaKey);
        event.currentTarget.focus({ preventScroll: true });
        event.stopPropagation();
      }}
      onPointerDown={(event) => {
        if ((event.target as Element).closest("input, textarea, select, button, [contenteditable='true']")) return;
        if (event.shiftKey || event.ctrlKey || event.metaKey) { event.preventDefault(); return; }
        event.currentTarget.focus({ preventScroll: true });
        onSelect(false, true);
        if (!event.shiftKey && !event.ctrlKey && !event.metaKey) onMoveStart(event);
        event.stopPropagation();
      }}
      onPaste={(event) => {
        if (event.target !== event.currentTarget) return;
        onObjectPaste?.(event);
      }}
      onCopy={(event) => {
        if (event.target !== event.currentTarget) return;
        onObjectClipboard?.(event, "copy");
      }}
      onCut={(event) => {
        if (event.target !== event.currentTarget) return;
        onObjectClipboard?.(event, "cut");
      }}
      onKeyDown={(event) => {
        if ((event.target === event.currentTarget || event.key === "Escape" && !(event.target as Element).closest("input,textarea,[contenteditable='true']")) && onObjectKeyDown(event)) return;
        if (
          event.target !== event.currentTarget ||
          !selected ||
          (event.key !== "Delete" && event.key !== "Backspace")
        ) {
          return;
        }
        // The key is the chart's even where it cannot go: `onRemove` deletes
        // the selected element or the chart, or says why it cannot.
        event.preventDefault();
        event.stopPropagation();
        onRemove();
      }}
      style={{
        ...chartVisualStyle,
        position: "absolute",
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        gap: 2,
        width,
        padding: 0,
        // Excel's chart area is white unless the chart states No Fill: with
        // nothing stated, only the plot was painted and the sheet's gridlines
        // showed through the title, legend and axis rows.
        backgroundColor:
          chartVisualStyle.backgroundColor ??
          (chart.chartFormat?.chartAreaStyle?.fill === "none" ? "transparent" : "#ffffff"),
        // No border: selection is the shared outline (selectedHost). The 1px
        // transparent border left from the old blue selection border made the
        // chart 2px taller and its plot 2px narrower than its stated size, and
        // than the same chart once an edit moved it to the drawing layer
        // (live audit S-132: 480x290 became 480x288 on a series rename).
        border: 0,
        borderRadius: 0,
        boxShadow: "none",
        fontSize: 12,
        ...(chart.macro && onRunMacro && !selected ? { cursor: "pointer" } : {}),
        ...style,
      }}
    >
      {selected ? quickButtons : null}
      {/* The chart's title row, while the picture does not draw the title
          itself (a chart not on the model yet, or no engine). */}
      {titlesInPicture ? null : (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontWeight: 600,
        }}
      >
        <span
          // The title is the MOVE grip (Excel/Sheets: drag the header to move the
          // chart). pointer-down starts the drag; touchAction none so a touch
          // drag doesn't scroll the grid underneath.
          onPointerDown={
            inlineTextEdit?.field === "title" ? undefined : onMoveStart}
          // The title is drawn here, not in the picture: a click selects it
          // (Current Selection, an open Format pane follows), a double-click
          // edits it and opens the pane on it, as the drawn parts do.
          onClick={(event) => {
            dispatchOfficeChartPartHit(event.currentTarget, "title", false);
            // A finger's double tap edits as a double-click does.
            doubleClickOnDoubleTap(event);
          }}
          onDoubleClick={(event) => {
            if (mutationDisabled) return;
            event.preventDefault();
            event.stopPropagation();
            dispatchOfficeChartPartHit(event.currentTarget, "title", true);
            onBeginInlineTextEdit("title", chart.title ?? "");
          }}
          aria-disabled={mutationDisabled}
          title={t("spreadsheet.chartMove")}
          aria-label={t("spreadsheet.chartMove")}
          data-testid={`spreadsheet-chart-title-${chart.id}`}
          style={{
            ...presentationChartAreaStyleCss(chart.chartFormat?.chartTitleStyle),
            flex: 1,
            minHeight: chart.title ? 22 : 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            textAlign: "center",
            cursor: "move",
            touchAction: "none",
          }}
        >
          {inlineTextEdit?.field === "title" ? (
            // The one chart title box (Microsoft Support, "Edit titles or data
            // labels in a chart": Enter keeps, Escape keeps the old text, leaving
            // the box keeps what was typed), in the sheet's header layout.
            <OfficeChartTitleInput
              autoFocus
              kind="title"
              value={inlineTextEdit.value}
              label={t("spreadsheet.chartTitle")}
              testId={`spreadsheet-chart-inline-title-${chart.id}`}
              style={{ position: "static", width: "100%", padding: "0 4px", borderRadius: 2 }}
              textPaint={presentationChartTitleTextPaint(chart.chartFormat?.chartTitleStyle)}
              onFinish={(commit, value) =>
                commit
                  ? onCommitInlineTextEdit("title", value)
                  : onCancelInlineTextEdit()
              }
            />
          ) : chart.title ? (
            <span style={presentationChartTitleWordsCss(chart.chartFormat?.chartTitleStyle)}>{chart.title}</span>
          ) : (
            ""
          )}
        </span>
      </div>
      )}
      {pivotButtons && pivotBands.top ? (
        <PivotChartButtonBand chartId={chart.id} band="top" buttons={pivotButtons} t={t} />
      ) : null}
      {/* Axis titles (Excel/WPS): the Y title runs vertically beside the value
          axis, the X title sits centered under the category axis. Each is shown
          only when set; the MiniChart width/height shrink to make room so the
          plot + titles stay within the panel box. Rendered around the SVG (not
          inside it) so every chart type gets them without per-renderer changes. */}
      <div style={{ display: "flex", alignItems: "stretch" }}>
        {chart.axisTitleY && !titlesInPicture ? (
          <div
            data-testid={`spreadsheet-chart-axis-y-${chart.id}`}
            onClick={(event) => {
              dispatchOfficeChartPartHit(event.currentTarget, "axisY", false);
              // A finger's double tap edits as a double-click does.
              doubleClickOnDoubleTap(event);
            }}
            onDoubleClick={(event) => {
              if (mutationDisabled) return;
              event.preventDefault();
              event.stopPropagation();
              dispatchOfficeChartPartHit(event.currentTarget, "axisY", true);
              onBeginInlineTextEdit("axisTitleY", chart.axisTitleY ?? "");
            }}
            style={{
              writingMode: "vertical-rl",
              // Latin titles read bottom-up (rotated); CJK titles stack
              // upright like Excel — the rotation would flip every glyph.
              transform: CJK_AXIS_TITLE_RE.test(chart.axisTitleY)
                ? undefined
                : "rotate(180deg)",
              textAlign: "center",
              fontSize: 11,
              opacity: 0.75,
              padding: "0 1px",
              alignSelf: "center",
              maxHeight: height,
              overflow: "hidden",
            }}
          >
            {inlineTextEdit?.field === "axisTitleY" ? (
              // The one chart title box (Microsoft Support, "Edit titles or data
              // labels in a chart": Enter keeps, Escape keeps the old text, leaving
              // the box keeps what was typed), in the sheet's header layout.
              <OfficeChartTitleInput
                autoFocus
                kind="axisY"
                value={inlineTextEdit.value}
                label={t("spreadsheet.chartAxisTitleY")}
                testId={`spreadsheet-chart-inline-axis-y-${chart.id}`}
                style={{ position: "static", width: "100%", padding: "0 4px", borderRadius: 2 }}
                onFinish={(commit, value) =>
                  commit
                    ? onCommitInlineTextEdit("axisTitleY", value)
                    : onCancelInlineTextEdit()
                }
              />
            ) : (
              chart.axisTitleY
            )}
          </div>
        ) : null}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            data-testid={`spreadsheet-chart-canvas-${chart.id}`}
            style={{
              display: "flex",
              justifyContent: "center",
              backgroundColor: "var(--mrai-chart-plot-background, #ffffff)",
              backgroundImage:
                chart.showGridlines === false
                  ? undefined
                  : "repeating-linear-gradient(to bottom, transparent 0, transparent 31px, var(--mrai-chart-gridline, rgba(100,116,139,.16)) 32px)",
            }}
          >
            {chartRowsHavePlottableValue(rows) || (xySeries?.length ?? 0) > 0 ? (
              // The chart's stored model, drawn by the one planner; the panel
              // draws the title and axis titles around it itself.
              <SpreadsheetChartCanvas
                selected={selected}
                selectionKey={selectionKey}
                editable={!mutationDisabled}
                onTitlesInPicture={setTitlesInPicture}
                record={chart as unknown as SpreadsheetChartLike}
                type={chart.type}
                rows={rows}
                headerRow={headerRow}
                categoryLevels={categoryLevels}
                xySeries={xySeries}
                // The whole chart area when the picture draws the titles (Excel's
                // chart area holds them), else the plot beside the sheet's own.
                width={titlesInPicture ? width : width - (chart.axisTitleY ? 18 : 0)}
                height={titlesInPicture ? height : height - (chart.axisTitleX ? 16 : 0)}
                themeAccents={themeAccents}
                fontFamily={fontFamily}
                extendedTypes
                valueAxisNumberFormat={valueAxisNumberFormat}
                seriesNumberFormats={seriesNumberFormats}
                date1904={date1904}
                ariaLabel={
                  chart.title ||
                  `${t("spreadsheet.chartType")}: ${spreadsheetChartTypeLabel(t, chart.type)}`
                }
              />
            ) : (
              // Gate on a PLOTTABLE value in any series: buildChartSeries
              // returns one row per source row whatever it holds, so a range
              // with no numeric value at all falls through to the empty state
              // here (otherwise the picture would be a blank box). A text
              // first series (names beside the figures) does not empty it.
              <span
                style={{ fontSize: 11, opacity: 0.6, padding: "8px 0" }}
                data-testid={`spreadsheet-chart-empty-${chart.id}`}
              >
                {t("spreadsheet.chartNoData")}
              </span>
            )}
          </div>
          {chart.axisTitleX && !titlesInPicture ? (
            <div
              data-testid={`spreadsheet-chart-axis-x-${chart.id}`}
              onClick={(event) => {
                dispatchOfficeChartPartHit(event.currentTarget, "axisX", false);
                // A finger's double tap edits as a double-click does.
                doubleClickOnDoubleTap(event);
              }}
              onDoubleClick={(event) => {
                if (mutationDisabled) return;
                event.preventDefault();
                event.stopPropagation();
                dispatchOfficeChartPartHit(event.currentTarget, "axisX", true);
                onBeginInlineTextEdit("axisTitleX", chart.axisTitleX ?? "");
              }}
              style={{
                textAlign: "center",
                fontSize: 11,
                opacity: 0.75,
                paddingTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {inlineTextEdit?.field === "axisTitleX" ? (
                // The one chart title box (Microsoft Support, "Edit titles or data
                // labels in a chart": Enter keeps, Escape keeps the old text, leaving
                // the box keeps what was typed), in the sheet's header layout.
                <OfficeChartTitleInput
                  autoFocus
                  kind="axisX"
                  value={inlineTextEdit.value}
                  label={t("spreadsheet.chartAxisTitleX")}
                  testId={`spreadsheet-chart-inline-axis-x-${chart.id}`}
                  style={{ position: "static", width: "100%", padding: "0 4px", borderRadius: 2 }}
                  onFinish={(commit, value) =>
                    commit
                      ? onCommitInlineTextEdit("axisTitleX", value)
                      : onCancelInlineTextEdit()
                  }
                />
              ) : (
                chart.axisTitleX
              )}
            </div>
          ) : null}
          {chart.showDataTable && !(chartRowsHavePlottableValue(rows) || (xySeries?.length ?? 0) > 0) ? (() => {
            // Only when no picture is drawn: the picture draws Excel's data
            // table inside the chart area itself, and this grid under it
            // showed the same values twice (S-197).
            // The table prints the values in their source's format, as the
            // labels do (a PivotChart's: its value field's); an axis with a
            // format of its own is no source format.
            const linked = normalizeChartValueAxisNumberFormat(chart.valueAxisNumberFormat)?.sourceLinked !== false
              ? valueAxisNumberFormat
              : undefined;
            const cellText = (value: unknown, rowIndex: number, columnIndex: number) => {
              const text = String(value);
              if (!linked || rowIndex === 0 || columnIndex === 0 || text.trim() === "") return text;
              const number = Number(text);
              return Number.isFinite(number) ? applyNumberFormat(number, linked, { date1904 }) : text;
            };
            return (
            <div
              data-testid={`spreadsheet-chart-data-table-${chart.id}`}
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${Math.max(1, Math.min(6, rows[0]?.length ?? 1))}, minmax(0, 1fr))`,
                borderTop: "1px solid rgba(100,116,139,.35)",
                borderLeft: "1px solid rgba(100,116,139,.35)",
                fontSize: 9,
                lineHeight: 1.25,
              }}
            >
              {rows.slice(0, 6).flatMap((row, rowIndex) =>
                row.slice(0, 6).map((value, columnIndex) => (
                  <span
                    key={`${rowIndex}:${columnIndex}`}
                    style={{
                      minWidth: 0,
                      padding: "2px 3px",
                      borderRight: "1px solid rgba(100,116,139,.35)",
                      borderBottom: "1px solid rgba(100,116,139,.35)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={cellText(value, rowIndex, columnIndex)}
                  >
                    {cellText(value, rowIndex, columnIndex)}
                  </span>
                )),
              )}
            </div>
            );
          })() : null}
        </div>
      </div>
      {pivotButtons && pivotBands.bottom ? (
        <PivotChartButtonBand chartId={chart.id} band="bottom" buttons={pivotButtons} t={t} />
      ) : null}
      {/* Bottom-right RESIZE handle (Excel/Sheets: drag the corner to resize).
          pointer-down starts the resize drag; absolutely pinned to the panel
          corner so it tracks the live size. */}
      {selected && showResizeHandles && !(resizeDisabled ?? deleteDisabled) ? OFFICE_DRAWING_RESIZE_HANDLES.map(handle => (
        <OfficeDrawingResizeGrip key={handle} handle={handle} label={`${t("spreadsheet.chartResize")}: ${handle}`}
          onPointerDown={event=>onResizeStart(event,handle)}
          onClick={event=>event.stopPropagation()}
          data-testid={handle === "se" ? `spreadsheet-chart-resize-${chart.id}` : `spreadsheet-chart-resize-${chart.id}-${handle}`}/>
      )) : null}
    </div>
  );
}
