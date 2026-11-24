"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type SpreadsheetPdfExportView, SpreadsheetPdfViewError } from "@mrnote/core/web/lib/spreadsheet/pdf-export-view.ts";
import { type ReactElement, type RefObject } from "react";
import { type PivotTimelineLevel, type PivotTimelineTranslate } from "../../../../lib/spreadsheet/pivot-timeline";
import { normalizeSheets } from "./spreadsheetNormalizeSheets";
import { type RuleAnswers } from "./spreadsheetHiddenRows";
import { type PageItem } from "@mrnote/core/web/lib/notebook-sdk.ts";
import { type EngineValue } from "@mrnote/core/web/lib/spreadsheet/formula-engine.ts";
import { type PivotRange, type PivotMatrix } from "@mrnote/core/web/lib/spreadsheet/pivot.ts";
import { type PivotChartReport, type PivotOutputLabels } from "@mrnote/core/web/lib/spreadsheet/pivot-output.ts";
import { type SheetModel } from "./spreadsheetSheetModel";
import { createSpreadsheetPdfExportView, spreadsheetPdfExportValues } from "./spreadsheetWorkbookValuePlans";
import { derivedPdfCellsForSheet } from "./spreadsheetSavedWorkbookPdfView";
import { type SpreadsheetSheetViewFilterState, type SpreadsheetSheetViewSortState } from "../../../../lib/spreadsheet/sheet-views";
import { type SheetEvaluator, type Workbook, type WorkbookSheetInput } from "@mrnote/core/web/lib/spreadsheet/formula-engine.ts";
import { type PivotOutputPlan } from "@mrnote/core/web/lib/spreadsheet/pivot-output.ts";
import { type SpreadsheetNativeTableStyle } from "@mrnote/core/web/lib/spreadsheet/native-table-styles.ts";

/** What spreadsheetSavedPagePdfViews reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetSavedPagePdfViewsInputs {
  captureExportSheetViewSession: () => { rowOrder?: number[] | undefined; sortState?: SpreadsheetSheetViewSortState | undefined; sheetId: string; filters: SpreadsheetSheetViewFilterState; } | undefined;
  formulaWorkbook: { evaluator: SheetEvaluator; evaluatorFor: (sheetName: string) => SheetEvaluator; workbook: Workbook; memoSnapshot: () => ReadonlyMap<string, EngineValue>; pivotPlans: Map<string, PivotOutputPlan>; pivotNativeFootprints: Map<string, PivotRange[]>; pivotChartReports: Map<string, PivotChartReport>; pivotChartMatrices: Map<string, PivotMatrix>; inputs: WorkbookSheetInput[]; pivotSheetIds: string[]; };
  pivotCollapsedRef: RefObject<Set<string>>;
  pivotOutputLabelsRef: RefObject<PivotOutputLabels>;
  relativeFilterToday: { year: number; month: number; day: number; };
  workbookNativeTableStyles: SpreadsheetNativeTableStyle[] | undefined;
  workbookThemeAccentColors: readonly string[];
  /** What a printed slicer and timeline say in the viewer's language. */
  /** The sheet on screen and the rule answers its grid paints with
   * (`evalConditionalFormula`): that sheet prints exactly what it shows. */
  liveRuleAnswers: { sheetId: string; answers: RuleAnswers | null };
  printPanelLabels: { blank: string; allPeriods: string; levels: Record<PivotTimelineLevel, string>; translate?: PivotTimelineTranslate };
  locale?: string;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function spreadsheetSavedPagePdfViews({
  captureExportSheetViewSession,
  formulaWorkbook,
  pivotCollapsedRef,
  pivotOutputLabelsRef,
  relativeFilterToday,
  workbookNativeTableStyles,
  workbookThemeAccentColors,
  printPanelLabels,
  locale,
  liveRuleAnswers,
}: SpreadsheetSavedPagePdfViewsInputs) {
  // The saved workbook the view is built for (a PivotTable slicer reads its
  // PivotTable on any sheet).
  let savedSheets: SheetModel[] = [];
  // What the grid shows beyond the saved cells, for the PDF the server
  // prints: a PivotTable's report cells and their style paint, a dynamic
  // array's spilled values, and the paint a table style lays on its cells.
  // The server never evaluates any of these; it lays them over the saved
  // cells exactly as the grid draws them (live audit: print fidelity).
  // The grid's own glyph components rendered to SVG markup for the PDF
  // (icon-set icons, sparklines); loaded with the export, never with the grid.
  let renderSvg: ((element: ReactElement) => string) | null = null;
  // The calculation's answers for the rule formulas the paint reads.
  let ruleAnswers: RuleAnswers | null = null;
  // The derived cells of a saved sheet (spreadsheetSavedWorkbookPdfView's
  // builder, shared with the server's own prints of a workbook): over this
  // window's read model, the sheet on screen with its grid's own rule answers
  // (an unanswered rule paints as unanswered), the others with the
  // calculation's answers for the saved workbook.
  const derivedPdfCells = (candidate: SheetModel) => derivedPdfCellsForSheet(candidate, {
    savedSheets,
    formulaWorkbook,
    renderSvg,
    ruleAnswersFor: (sheetId) => sheetId === liveRuleAnswers.sheetId ? liveRuleAnswers.answers : ruleAnswers,
    workbookNativeTableStyles,
    workbookThemeAccentColors,
    printPanelLabels,
    locale,
  });
  const spreadsheetPdfViewForSavedPage = async (
    savedPage: PageItem,
    capturedSession: ReturnType<typeof captureExportSheetViewSession>,
  ): Promise<SpreadsheetPdfExportView> => {
    try {
      if (!renderSvg) {
        try {
          renderSvg = (await import("react-dom/server")).renderToStaticMarkup;
        } catch {
          renderSvg = null;
        }
      }
      const content = savedPage.content_json as Record<string, unknown>;
      savedSheets = normalizeSheets(content);
      const values = await spreadsheetPdfExportValues(content, Boolean(capturedSession?.sortState), { labels: pivotOutputLabelsRef.current, collapsed: pivotCollapsedRef.current });
      ruleAnswers = values?.rules ?? null;
      return createSpreadsheetPdfExportView(
        content,
        capturedSession,
        relativeFilterToday,
        derivedPdfCells,
        values,
      );
    } catch (error) {
      throw error instanceof SpreadsheetPdfViewError
        ? error
        : new SpreadsheetPdfViewError("view_unavailable");
    }
  };
  return {
    spreadsheetPdfViewForSavedPage,
  };
}
