"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { importedChartStatesAnalysis, chartMatrixSupportsType, spreadsheetChartTypeHasAxes, spreadsheetChartTypeHasGridlines, spreadsheetChartTypeSupportsDataTable } from "../../../../lib/spreadsheet/drawing-buttons";
import { type SpreadsheetCell } from "@mrnote/core/web/lib/spreadsheet/cell-buttons.ts";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { spreadsheetChartSupportsTrendline, spreadsheetChartSupportsErrorBars } from "@mrnote/core/web/lib/spreadsheet/chart-v2-binding.ts";
import { chartElementAvailability } from "@mrnote/core/web/lib/office-charts/chart-elements.ts";
import { type ChartFamily, type ChartSubtype } from "@mrnote/core/web/components/console/editor/extensions/chartBlockShared.ts";
import { type SpreadsheetVisibleCommandReason } from "../../../../lib/spreadsheet/visible-command-authority";
import { MAX_CHART_SERIES_REFS, buildChartSeries, normalizeSecondaryAxisSeries, normalizeChartSeriesRefs, normalizeSpreadsheetChartType, type SpreadsheetChart, type SpreadsheetChartType, type SpreadsheetPivotChartSource } from "@mrnote/core/web/lib/spreadsheet/chart.ts";
import { type PivotConfig } from "@mrnote/core/web/lib/spreadsheet/pivot.ts";
import { drawingChartSourceOf } from "@mrnote/core/web/lib/spreadsheet/drawing-chart-series.ts";
import { spreadsheetChartHasValueAxisNumberFormatBlocker } from "./SpreadsheetChartPanel";
import { type SpreadsheetObject, type SheetModel } from "./spreadsheetSheetModel";
import { type ChartBlockFormat, type ChartData } from "@mrnote/core/web/components/console/editor/extensions/chartBlockShared.ts";
import { type ChartStylePresetId } from "@mrnote/core/web/lib/office-charts/chart-style-presets.generated.ts";
import { type ResolvedSpreadsheetVisibleControl } from "../../../../lib/spreadsheet/visible-command-authority";

/** What spreadsheetChartDesignControlState reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetChartDesignControlStateInputs {
  cellDisplayValue: (cell: SpreadsheetCell | undefined, row: number, col: number, editing: boolean, numberFormatOverride?: string) => string;
  chartMatrixForRange: (range: { r1: number; r2: number; c1: number; c2: number; }, sourceSheetId?: string) => string[][];
  desktopChartAttrs: { title: string; schemaVersion: 2; chartType: ChartFamily; chartSubtype: ChartSubtype; axisTitleX?: string; axisTitleY?: string; data: ChartData; stylePreset: ChartStylePresetId; format?: ChartBlockFormat; } | null;
  selectedChartDesignTarget: { readonly kind: "drawing"; readonly chart: SpreadsheetObject; } | { readonly kind: "native"; readonly chart: SpreadsheetChart; } | null;
  selectedChartDesignType: SpreadsheetChartType | undefined;
  selectedChartMarkerSeriesIndices: number[];
  selectedChartValueAxisNumberFormatSupported: boolean;
  selectedDrawingChart: SpreadsheetObject | null;
  selectedNativeChart: SpreadsheetChart | null;
  selectedPivotChartBound: { sheet: SheetModel; sheetIndex: number; slot: number; pivot: PivotConfig; } | null;
  selectedPivotChartSource: SpreadsheetPivotChartSource | undefined;
  sheet: SheetModel;
  sheetChartEditReason: (chart: SpreadsheetChart | SpreadsheetObject) => string | null;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  visibleCommandReason: (reasonKey: SpreadsheetVisibleCommandReason | null) => string | undefined;
  visibleCommandState: (controlId: string) => ResolvedSpreadsheetVisibleControl;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function spreadsheetChartDesignControlState({
  cellDisplayValue,
  chartMatrixForRange,
  desktopChartAttrs,
  selectedChartDesignTarget,
  selectedChartDesignType,
  selectedChartMarkerSeriesIndices,
  selectedChartValueAxisNumberFormatSupported,
  selectedDrawingChart,
  selectedNativeChart,
  selectedPivotChartBound,
  selectedPivotChartSource,
  sheet,
  sheetChartEditReason,
  t,
  visibleCommandReason,
  visibleCommandState,
}: SpreadsheetChartDesignControlStateInputs) {
  const chartDesignControlState = (controlId: string) => {
    const state = visibleCommandState(controlId);
    // A preserve-only chart: every command that edits its model is refused.
    const preserveReason =
      selectedChartDesignTarget && controlId !== "XLSCTL.CONTEXT.CHART.FORMAT_PANE"
        ? sheetChartEditReason(selectedChartDesignTarget.chart)
        : null;
    const threeDimensional=selectedChartDesignTarget?.chart.chartSubtype?.toLowerCase().includes("3d")===true;
    const type = selectedChartDesignType ?? "column";
    const requiresAxes = new Set([
      "XLSCTL.CONTEXT.CHART.AXIS_TITLE_X.MRAI.APPLY",
      "XLSCTL.CONTEXT.CHART.AXIS_TITLE_Y.MRAI.APPLY",
      "XLSCTL.CONTEXT.CHART.AXES",
      "XLSCTL.CONTEXT.CHART.GRIDLINES",
    ]).has(controlId);
    const requiresGridlines = controlId === "XLSCTL.CONTEXT.CHART.GRIDLINES";
    const requiresDataTable =
      controlId === "XLSCTL.CONTEXT.CHART.DATA_TABLE";
    const requiresCompatibleOrientation =
      controlId === "XLSCTL.CONTEXT.CHART.SWITCH_ROW_COLUMN";
    const requiresTrendline =
      controlId === "XLSCTL.CONTEXT.CHART.TRENDLINE.MRAI.APPLY";
    const requiresErrorBars =
      controlId === "XLSCTL.CONTEXT.CHART.ERROR_BARS.MRAI.APPLY";
    const requiresUpDownBars =
      controlId === "XLSCTL.CONTEXT.CHART.UP_DOWN_BARS.MRAI.APPLY";
    const requiresChartLines =
      controlId === "XLSCTL.CONTEXT.CHART.LINES.MRAI.APPLY" ||
      controlId === "XLSCTL.CONTEXT.CHART.LINES_MENU";
    const requiresSecondaryAxis =
      controlId === "XLSCTL.CONTEXT.CHART.SECONDARY_AXIS.MRAI.APPLY";
    const requiresValueAxisNumberFormat =
      controlId === "XLSCTL.CONTEXT.CHART.VALUE_AXIS_NUMBER_FORMAT.MRAI.APPLY";
    const requiresLineMarker =
      controlId === "XLSCTL.CONTEXT.CHART.LINE_MARKER_SYMBOL.MRAI.APPLY" ||
      controlId === "XLSCTL.CONTEXT.CHART.LINE_MARKER_SIZE.MRAI.APPLY";
    const requiresNativeAnalysis =
      requiresTrendline ||
      requiresErrorBars ||
      requiresUpDownBars ||
      requiresChartLines ||
      requiresSecondaryAxis;
    // Every analysis element but a secondary axis reaches an imported chart
    // too: a trendline and error bars where the projection states its own
    // reading of them, up-down bars and the predefined lines always (the
    // projection has stated those since they were first read).
    const importedAnalysisKey = requiresTrendline
      ? "trendline"
      : requiresErrorBars
        ? "errorBars"
        : null;
    const nativeAnalysisTarget = Boolean(
      selectedChartDesignTarget &&
        (selectedChartDesignTarget.kind === "native"
          ? true
          : selectedChartDesignTarget.chart.pivotSource
            ? true
          : importedAnalysisKey !== null
            ? importedChartStatesAnalysis(
                selectedChartDesignTarget.chart,
                importedAnalysisKey,
              )
            : requiresUpDownBars || requiresChartLines),
    );
    // One rule for the ribbon, the command and the part writer: Microsoft's
    // own list, asked of the family and subtype this chart draws as.
    const analysisLeaf = selectedChartDesignTarget
      ? selectedChartDesignTarget.kind === "native"
        ? selectedChartDesignTarget.chart
        : {
            type,
            chartSubtype:
              typeof selectedChartDesignTarget.chart.chartSubtype === "string"
                ? selectedChartDesignTarget.chart.chartSubtype
                : undefined,
          }
      : null;
    // The chart's model answers which elements it takes (the shared element
    // rule every host's menu asks); a chart it cannot plan, its flat leaf.
    const modelElements = desktopChartAttrs ? chartElementAvailability(desktopChartAttrs) : null;
    const trendlineTypeSupported = modelElements
      ? modelElements.trendline
      : analysisLeaf !== null && spreadsheetChartSupportsTrendline(analysisLeaf);
    const errorBarTypeSupported = modelElements
      ? modelElements.errorBars
      : analysisLeaf !== null && spreadsheetChartSupportsErrorBars(analysisLeaf);
    // A secondary axis is this editor's own line/column recipe.
    const secondaryAxisTypeSupported = [
      "line",
      "column",
      "stacked-column",
    ].includes(type);
    const selectedSeriesCount =
      selectedChartDesignTarget?.kind === "drawing"
        ? Array.isArray(selectedChartDesignTarget.chart.seriesRefs)
          ? Math.min(
              selectedChartDesignTarget.chart.seriesRefs.length,
              MAX_CHART_SERIES_REFS,
            )
          : 0
        : selectedChartDesignTarget?.kind === "native"
        ? Math.max(
            0,
            (buildChartSeries(
              selectedChartDesignTarget.chart,
              (row, col) =>
                cellDisplayValue(
                  sheet.cells[`${row}:${col}`],
                  row,
                  col,
                  false,
                ),
            )[0]?.length ?? 1) - 1,
          )
        : 0;
    // An imported drawing carries the list unnormalized; read it as the
    // chart renderer does.
    const selectedSecondaryAxisSeriesCount =
      normalizeSecondaryAxisSeries(
        selectedChartDesignTarget?.chart.secondaryAxisSeries,
      )?.length ?? 0;
    const analysisSupported =
      (!requiresNativeAnalysis || (nativeAnalysisTarget&&!threeDimensional)) &&
      (!requiresTrendline || trendlineTypeSupported) &&
      (!requiresErrorBars || errorBarTypeSupported) &&
      (!requiresUpDownBars ||
        (modelElements
          ? modelElements.upDownBars
          : type === "line" &&
            selectedSeriesCount >= 2 &&
            selectedSecondaryAxisSeriesCount === 0)) &&
      (!requiresChartLines ||
        (modelElements
          ? modelElements.dropLines || modelElements.highLowLines || modelElements.seriesLines
          : ["line", "area", "stacked-column", "stacked-bar"].includes(type) &&
            selectedSecondaryAxisSeriesCount === 0 &&
            (type === "line" || type === "area" || selectedSeriesCount >= 2))) &&
      (!requiresSecondaryAxis ||
        (secondaryAxisTypeSupported &&
          selectedSeriesCount >= 2 &&
          !selectedChartDesignTarget?.chart.upDownBars));
    const orientationSupported =
      !requiresCompatibleOrientation ||
      !state.enabled ||
      // A PivotChart switches its PivotTable's row and column fields.
      Boolean(selectedPivotChartBound) ||
      Boolean(
        selectedNativeChart &&
          chartMatrixSupportsType(
            chartMatrixForRange(selectedNativeChart.range,selectedNativeChart.sourceSheetId),
            selectedNativeChart.type,
            selectedNativeChart.seriesInColumns === false,
          ),
      ) ||
      // An imported chart switches when its series are one range laid one
      // way (Excel's "too complex" data range has no other way to lay).
      Boolean(
        selectedDrawingChart &&
          drawingChartSourceOf(
            normalizeChartSeriesRefs(selectedDrawingChart.seriesRefs),
            normalizeSpreadsheetChartType(selectedDrawingChart.chartType),
          ),
      );
    // Axis Titles > Depth: a chart the shared element rule gives a depth
    // (series) axis, a 3-D column, line, area or surface chart.
    const requiresDepthAxis =
      controlId === "XLSCTL.CONTEXT.CHART.AXIS_TITLE_DEPTH.MRAI.APPLY";
    const typeSupported =
      (!requiresAxes || spreadsheetChartTypeHasAxes(type)) &&
      (!requiresDepthAxis || modelElements?.axisDepth === true) &&
      (!requiresGridlines || spreadsheetChartTypeHasGridlines(type)) &&
      (!requiresDataTable || spreadsheetChartTypeSupportsDataTable(type)) &&
      (!requiresValueAxisNumberFormat ||
        selectedChartValueAxisNumberFormatSupported) &&
      (!requiresLineMarker ||
        (selectedChartMarkerSeriesIndices.length > 0 && !threeDimensional)) &&
      orientationSupported &&
      analysisSupported;
    // Microsoft Support: a PivotChart's data range cannot be changed in
    // Select Data; its data is its PivotTable's.
    const sourceEditUnavailableReason =
      selectedPivotChartSource && controlId === "XLSCTL.CONTEXT.CHART.SELECT_DATA"
        ? t("spreadsheet.pivotChartSelectDataReason")
        : selectedChartDesignTarget &&
      state.reasonKey === "spreadsheet.capability.commandUnavailable" &&
      (controlId === "XLSCTL.CONTEXT.CHART.SWITCH_ROW_COLUMN" ||
        controlId === "XLSCTL.CONTEXT.CHART.SELECT_DATA")
        && selectedChartDesignTarget.kind === "drawing"
          ? // Only a kind whose series one range lays keeps its imported data
            // (an Office 2016 chart, a combination, stock or bubble chart).
            t("spreadsheet.uiCopy.thisChartTypeKeepsTheDataRangeItWasImportedWith")
        : undefined;
    const reason = threeDimensional&&(requiresNativeAnalysis||requiresLineMarker)
      ? t("spreadsheet.uiCopy.thisAnalysisElementIsUnavailableForA3DChart")
      : typeSupported
      ? (sourceEditUnavailableReason ?? visibleCommandReason(state.reasonKey))
      : !orientationSupported
        ? selectedChartDesignTarget?.kind === "drawing"
          ? t("spreadsheet.uiCopy.thisChartsSeriesDoNotComeFromOneRangeOfCells")
          : t("spreadsheet.uiCopy.switchingRowsAndColumnsWouldMakeTheSourceIncompatible")
      : requiresNativeAnalysis && !nativeAnalysisTarget
        ? t("spreadsheet.uiCopy.thisElementRequiresAnEditableNativeWorksheetChart")
        : requiresValueAxisNumberFormat
          ? spreadsheetChartHasValueAxisNumberFormatBlocker(
              selectedChartDesignTarget?.chart,
            )
            ? t("spreadsheet.uiCopy.thisImportedChartSPrimaryValueAxisFormatCannot")
            : t("spreadsheet.uiCopy.thisChartDoesNotHaveOneSafelyIdentifiablePrimary")
            : requiresLineMarker
              ? t("spreadsheet.uiCopy.thisControlIsAvailableOnlyForLineCharts")
        : t("spreadsheet.uiCopy.thisChartTypeOrSeriesCountDoesNotSupport");
    const enabled = state.enabled && typeSupported && !preserveReason;
    return {
      state: { ...state, enabled },
      reason: preserveReason ?? reason,
      dom: {
        "data-control-id": controlId,
        "data-control-surface": "chart-design",
        disabled: !enabled,
        hidden: !state.visible,
        title: reason,
      },
    };
  };
  return {
    chartDesignControlState,
  };
}
