"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as dialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { type ChartRecommendation } from "../../../../lib/spreadsheet/chart-recommendations";
import SpreadsheetChartCanvas from "./SpreadsheetChartCanvas";
import { type SpreadsheetChart, type SpreadsheetChartType } from "@mrnote/core/web/lib/spreadsheet/chart.ts";
import { OfficeChartSchematic } from "@mrnote/core/web/components/office-ribbon/OfficeChartSchematic.tsx";
import { CHART_SUBTYPES_BY_FAMILY, type ChartFamily } from "@mrnote/core/web/lib/office-charts/catalog.ts";
import { spreadsheetChartTypeLabel } from "./SpreadsheetChartPanel";
import { columnLabel } from "./spreadsheetRangeA1";
import { type RecommendedInsertConfirmReceipt } from "./spreadsheetMutationReceipts";
import { type RecommendedChartDraft } from "./spreadsheetDialogDrafts";
import { type Dispatch, type JSX, type SetStateAction } from "react";
import { type ResolvedSpreadsheetVisibleControl } from "../../../../lib/spreadsheet/visible-command-authority";
import { type ExcelDateSystemArg } from "@mrnote/core/web/lib/spreadsheet/excel-1900-calendar.ts";

/** Each recommendation's picture: the Insert Chart family it belongs to. */
const RECOMMENDED_CHART_FAMILY: Record<SpreadsheetChartType, ChartFamily> = {
  column: "column",
  "stacked-column": "column",
  bar: "bar",
  "stacked-bar": "bar",
  line: "line",
  pie: "pie",
  doughnut: "pie",
  area: "area",
  scatter: "xy",
  bubble: "xy",
  combo: "combo",
  radar: "radar",
  histogram: "statistical",
  "box-and-whisker": "statistical",
  pareto: "statistical",
  waterfall: "waterfall",
  treemap: "hierarchy",
  sunburst: "hierarchy",
  stock: "stock",
  funnel: "funnel",
  map: "map",
  surface: "surface",
  // The Camera tool is never recommended; the entry only completes the map.
  camera: "column",
};

/** What renderSpreadsheetRecommendedChartsDialog reads from SpreadsheetWindow's render scope. */
export interface RenderSpreadsheetRecommendedChartsDialogInputs {
  executeRecommendedInsertConfirm: (kind: "chart" | "pivot") => Promise<boolean>;
  insertChartTabStrip: (current: "recommended" | "all") => JSX.Element;
  insertLabels: { tables: string; pivotTable: string; table: string; forms: string; illustrations: string; picture: string; pictureInCells: string; pictureOverCells: string; pictureThisDevice: string; pictureAiImage: string; pictureOnlineImages: string; pictureInCellUnavailable: string; pictureProviderUnavailable: string; shapes: string; controls: string; checkbox: string; radio: string; spinner: string; slider: string; charts: string; recommendedCharts: string; clusteredColumn: string; column: string; line: string; scatter: string; pie: string; bar: string; statistical: string; combo: string; otherCharts: string; filters: string; filter: string; slicer: string; links: string; link: string; comments: string; comment: string; text: string; textBox: string; more: string; pivotSourceRequired: string; objectLimit: string; chartLimit: string; chartNoData: string; chartNativeExportUnavailable: string; chartInsertProtected: string; cameraNativeExportUnavailable: string; chartPreviewDescription: string; chartStale: string; chartProtected: string; chartReasonTime: string; chartReasonXy: string; chartReasonPart: string; chartReasonMulti: string; chartReasonDistribution: string; chartReasonGeneral: string; smartArtUnavailable: string; unavailable: string; };
  insertRecommendedConfirmCommandRef: RefObject<RecommendedInsertConfirmReceipt | null>;
  recommendedChartDraft: RecommendedChartDraft | null;
  recommendedChartErrorMessage: string | null;
  recommendedChartInitialFocusRef: RefObject<HTMLInputElement | null>;
  recommendedChartPreview: { chart: SpreadsheetChart; rows: string[][]; } | null;
  recommendedChartReasonLabel: (reason: ChartRecommendation["reason"]) => string;
  recommendedChartReturnFocusRef: RefObject<HTMLButtonElement | null>;
  selectedRecommendedChart: ChartRecommendation | null;
  setRecommendedChartDraft: Dispatch<SetStateAction<RecommendedChartDraft | null>>;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  visibleCommandState: (controlId: string) => ResolvedSpreadsheetVisibleControl;
  workbookDate1904: ExcelDateSystemArg;
  workbookThemeAccentColors: readonly string[];
}

/** Moved verbatim from SpreadsheetWindow's JSX: a render function (not a component), so the element tree React reconciles is unchanged. */
export function renderSpreadsheetRecommendedChartsDialog({
  executeRecommendedInsertConfirm,
  insertChartTabStrip,
  insertLabels,
  insertRecommendedConfirmCommandRef,
  recommendedChartDraft,
  recommendedChartErrorMessage,
  recommendedChartInitialFocusRef,
  recommendedChartPreview,
  recommendedChartReasonLabel,
  recommendedChartReturnFocusRef,
  selectedRecommendedChart,
  setRecommendedChartDraft,
  t,
  visibleCommandState,
  workbookDate1904,
  workbookThemeAccentColors,
}: RenderSpreadsheetRecommendedChartsDialogInputs) {
  return (
       recommendedChartDraft ? (
        <OfficeDialogShell
          open
          title={insertLabels.recommendedCharts}
          description={insertLabels.chartPreviewDescription}
          defaultActionLabel={t("spreadsheet.fmtOk")}
          cancelActionLabel={t("spreadsheet.fmtCancel")}
          onDefaultAction={() => void executeRecommendedInsertConfirm("chart")}
          onCancel={() => {
            insertRecommendedConfirmCommandRef.current = null;
            setRecommendedChartDraft(null);
          }}
          defaultActionDisabled={
            !selectedRecommendedChart ||
            !visibleCommandState(
              "XLSCTL.INSERT.CHART.RECOMMENDED_MENU.APPLY",
            ).enabled
          }
          initialFocusRef={recommendedChartInitialFocusRef}
          returnFocusRef={recommendedChartReturnFocusRef}
          className="sm:max-w-[680px]"
          testIdPrefix="spreadsheet-recommended-chart"
          tabStrip={insertChartTabStrip("recommended")}
        >
          <div
            role="radiogroup"
            aria-label={insertLabels.recommendedCharts}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(150px, 0.8fr) minmax(260px, 1.2fr)",
              gap: 12,
              alignItems: "stretch",
            }}
          >
            <div
              className={dialogParts.choices}
              style={{ alignContent: "start" }}
            >
              {recommendedChartDraft.recommendations.map(
                (recommendation, index) => {
                  const checked =
                    recommendedChartDraft.selectedIndex === index;
                  const inputId = `spreadsheet-recommended-chart-input-${recommendation.type}`;
                  return (
                    <label
                      key={recommendation.type}
                      htmlFor={inputId}
                      data-testid={`spreadsheet-recommended-chart-option-${recommendation.type}`}
                      className={dialogParts.choice}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "auto minmax(0, 1fr)",
                        gap: 8,
                        minHeight: 44,
                        alignItems: "center",
                      }}
                    >
                      <input
                        ref={
                          checked ? recommendedChartInitialFocusRef : undefined
                        }
                        id={inputId}
                        type="radio"
                        name="spreadsheet-recommended-chart"
                        checked={checked}
                        data-testid={inputId}
                        onChange={() =>
                          setRecommendedChartDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  selectedIndex: index,
                                  error: null,
                                }
                              : current,
                          )
                        }
                      />
                      <OfficeChartSchematic
                        family={RECOMMENDED_CHART_FAMILY[recommendation.type]}
                        subtype={CHART_SUBTYPES_BY_FAMILY[RECOMMENDED_CHART_FAMILY[recommendation.type]][0]}
                        compact
                      />
                      <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
                        <strong style={{ fontSize: 13 }}>
                          {spreadsheetChartTypeLabel(t, recommendation.type)}
                        </strong>
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--muted-foreground, #64748b)",
                          }}
                        >
                          {recommendedChartReasonLabel(recommendation.reason)}
                        </span>
                      </span>
                    </label>
                  );
                },
              )}
            </div>
            <div
              data-testid="spreadsheet-recommended-chart-preview"
              aria-live="polite"
              className={dialogParts.well}
              style={{
                display: "grid",
                gridTemplateRows: "auto minmax(180px, 1fr)",
                gap: 8,
                minWidth: 0,
                padding: 10,
              }}
            >
              <div style={{ display: "grid", gap: 2 }}>
                <strong>
                  {selectedRecommendedChart
                    ? spreadsheetChartTypeLabel(
                        t,
                        selectedRecommendedChart.type,
                      )
                    : insertLabels.recommendedCharts}
                </strong>
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--muted-foreground, #64748b)",
                  }}
                >
                  {columnLabel(recommendedChartDraft.range.c1)}
                  {recommendedChartDraft.range.r1 + 1}:
                  {columnLabel(recommendedChartDraft.range.c2)}
                  {recommendedChartDraft.range.r2 + 1}
                </span>
              </div>
              {recommendedChartPreview ? (
                <SpreadsheetChartCanvas date1904={workbookDate1904}
                  record={recommendedChartPreview.chart}
                  type={recommendedChartPreview.chart.type}
                  rows={recommendedChartPreview.rows}
                  width={360}
                  height={180}
                  themeAccents={workbookThemeAccentColors}
                  extendedTypes
                  forceRender
                  ariaLabel={spreadsheetChartTypeLabel(t, recommendedChartPreview.chart.type)}
                />
              ) : null}
            </div>
          </div>
          {recommendedChartErrorMessage ? (
            <p
              role="alert"
              data-error={recommendedChartDraft.error ?? undefined}
              data-testid="spreadsheet-recommended-chart-error"
              style={{ margin: 0, color: "var(--destructive, #b91c1c)" }}
            >
              {recommendedChartErrorMessage}
            </p>
          ) : null}
        </OfficeDialogShell>
      ) : null
  );
}
