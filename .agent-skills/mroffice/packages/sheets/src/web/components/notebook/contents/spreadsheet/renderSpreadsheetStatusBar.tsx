"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { SpreadsheetSelectionStatistics } from "./SpreadsheetSelectionStatistics";
import { useSpreadsheetBackgroundCalculation } from "./useSpreadsheetBackgroundCalculation";
import { type CellMap } from "@mrnote/core/web/lib/spreadsheet/cell-buttons.ts";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { OfficeStatusProgress, type OfficeStatusPhase } from "@mrnote/core/web/components/office-ribbon/OfficeStatusBar.tsx";
import spreadsheetHomeStyles from "./SpreadsheetHomeRibbon.module.css";
import { SpreadsheetViewModeIcon } from "./SpreadsheetViewModeIcons";
import { type CellValue } from "@mrnote/core/web/lib/spreadsheet/formula-engine.ts";
import { type ErrorStyle, type ValidationAlertDecision } from "@mrnote/core/web/lib/spreadsheet/data-validation.ts";
import { type SpreadsheetViewMode } from "../../../../lib/spreadsheet/view-options";
import { type SheetModel } from "./spreadsheetSheetModel";
import { SPREADSHEET_EXPORT_STATUS_MESSAGE, SPREADSHEET_PRINT_STATUS_FORMAT } from "./spreadsheetWindowConstants";
import { type JSX, useEffect, useState, type ComponentProps } from "react";
import { type GridRect } from "../../../../lib/spreadsheet/grid-nav";
import { type PivotOutputCell } from "@mrnote/core/web/lib/spreadsheet/pivot-output.ts";
import { type ResolvedSpreadsheetVisibleControl } from "../../../../lib/spreadsheet/visible-command-authority";
import { type ExcelDateSystemArg } from "@mrnote/core/web/lib/spreadsheet/excel-1900-calendar.ts";

/**
 * Excel's status-bar "Calculating" appears only for a calculation that
 * takes a moment; every keystroke's own recalculation finishes in a few
 * frames and would make the chip blink. The chip is mounted at once (so what
 * waits on it -- tests, probes -- still finds it) but stays invisible for
 * its first 150ms.
 */
function SettledStatusProgress(props: ComponentProps<typeof OfficeStatusProgress>) {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(true), 150);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <span
      className="contents"
      style={settled ? undefined : { visibility: "hidden" }}
      data-office-status-settled={settled ? "true" : "false"}
    >
      <OfficeStatusProgress {...props} />
    </span>
  );
}

/** What renderSpreadsheetStatusBar reads from SpreadsheetWindow's render scope. */
/** The browser's session refusing a workbook as too large says nothing stale
 * of one whose saves calculate on the server: "not calculated" would be untrue
 * of every value on the sheet. Any other reason (offline, busy) still says so. */
export function calculationStaleNeedsNoNotice(reason: string, tiledCalculatesOnSave: boolean): boolean {
  return reason === "budget" && tiledCalculatesOnSave;
}

export interface RenderSpreadsheetStatusBarInputs {
  activeCell: { row: number; col: number; };
  activeCellDisplayLabel: string;
  /** One slide-in from the bottom as a reviewed workbook lands in its frame. */
  chromeReveal?: boolean;
  backgroundCalculation: ReturnType<typeof useSpreadsheetBackgroundCalculation>;
  /** A large tiled workbook's saves calculate what they feed on the server,
   * and the last one did. */
  tiledCalculatesOnSave: boolean;
  backgroundPlanBusy: boolean;
  endMode: boolean;
  editingCell: { sheetId: string; row: number; col: number; mode?: "enter" | "edit"; multiline?: boolean; rich?: boolean; } | null;
  executeVisibleCommand: (controlId: string) => Promise<boolean>;
  explicitCalculationBusy: boolean;
  exportStatus: { phase: OfficeStatusPhase; format: string; error?: string; } | null;
  

  exportWarmup?: { done: number; total: number } | null;
  filterVisibility: { wait: () => Promise<boolean>; retry: () => void; pending: boolean; failed: boolean; rows: ReadonlySet<number>; };
  macroRecording: boolean;
  openRecordMacroDialog: (name?: string) => void;
  renderSpreadsheetZoomDial: (testIdPrefix: string, menuSide?: "top" | "bottom", menuAlign?: "start" | "center" | "end", controlId?: string) => JSX.Element;
  selectionStatisticsSource: { enabled: boolean; calculationPending: boolean; isCurrent: () => boolean; isRowHidden?: ((row: number) => boolean) | undefined; pageId: string; range: GridRect; cells: CellMap; getComputed: (row: number, col: number) => CellValue; spilled: Map<string, CellValue>; pivot: ReadonlyMap<string, PivotOutputCell> | null; };
  sheet: SheetModel;
  spreadsheetViewMode: SpreadsheetViewMode;
  stopMacroRecording: () => void;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  validatedDraftPending: boolean;
  validationAlert: { sheetId: string; row: number; col: number; title: string; message: string; style: ErrorStyle; revertTo: string; input?: HTMLInputElement | null; returnFocus?: HTMLElement | null; draftDecision?: (decision: ValidationAlertDecision) => void; } | null;
  visibleCommandState: (controlId: string) => ResolvedSpreadsheetVisibleControl;
  workbookDate1904: ExcelDateSystemArg;
}

/** Moved verbatim from SpreadsheetWindow's JSX: a render function (not a component), so the element tree React reconciles is unchanged. */
export function renderSpreadsheetStatusBar({
  activeCell,
  activeCellDisplayLabel,
  chromeReveal = false,
  backgroundCalculation,
  tiledCalculatesOnSave,
  backgroundPlanBusy,
  editingCell,
  endMode,
  executeVisibleCommand,
  explicitCalculationBusy,
  exportStatus,
  exportWarmup,
  filterVisibility,
  macroRecording,
  openRecordMacroDialog,
  renderSpreadsheetZoomDial,
  selectionStatisticsSource,
  sheet,
  spreadsheetViewMode,
  stopMacroRecording,
  t,
  validatedDraftPending,
  validationAlert,
  visibleCommandState,
  workbookDate1904,
}: RenderSpreadsheetStatusBarInputs) {
  return (
      <footer
        className="native-page-window__footer !gap-3 !px-3 !py-1.5"
        data-testid="spreadsheet-statusbar"
        data-office-chrome-reveal={chromeReveal ? "bottom" : undefined}
        // Right-click anywhere here opens Customize Status Bar (Excel); the
        // selection statistics own that menu and listen on this element.
        data-spreadsheet-status-bar=""
        style={{ minHeight: 40 }}
      >
        {/* Excel's mode indicator at the status bar's left end: Ready, Enter
          (typing over a cell) or Edit (F2, double-click, the formula bar). */}
        <span
          className="shrink-0 text-xs font-medium text-slate-600"
          data-testid="spreadsheet-cell-mode-status"
          data-cell-mode={editingCell?.sheetId === sheet.id ? (editingCell.mode ?? "enter") : "ready"}
        >
          {t(
            editingCell?.sheetId !== sheet.id
              ? "spreadsheet.cellMode.ready"
              : editingCell.mode === "edit"
                ? "spreadsheet.cellMode.edit"
                : "spreadsheet.cellMode.enter",
          )}
        </span>
        {/* Excel's End Mode indicator, beside the mode while End is armed. */}
        {endMode && editingCell?.sheetId !== sheet.id ? (
          <span
            className="shrink-0 text-xs font-medium text-slate-600"
            data-testid="spreadsheet-end-mode-status"
          >
            {t("spreadsheet.cellMode.endMode")}
          </span>
        ) : null}
        {/* Excel's macro recording button at the status bar's left end: a
            record dot, a stop square while a recording runs. */}
        <button
          type="button"
          className="spreadsheet-window__status-macro"
          aria-label={t(macroRecording ? "spreadsheet.macroStatusStop" : "spreadsheet.macroStatusRecord")}
          title={t(macroRecording ? "spreadsheet.macroStatusStop" : "spreadsheet.macroStatusRecord")}
          onClick={macroRecording ? stopMacroRecording : () => openRecordMacroDialog()}
          data-recording={macroRecording ? "true" : undefined}
          data-testid="spreadsheet-statusbar-macro-record"
        >
          {macroRecording ? (
            <span className="spreadsheet-window__status-macro-stop" aria-hidden="true" />
          ) : (
            <SpreadsheetViewModeIcon name="macroRecord" size={15} />
          )}
          {macroRecording ? <span>{t("spreadsheet.macroStatusRecording")}</span> : null}
        </button>
        <span
          className="min-w-0 truncate text-xs font-medium text-slate-600"
          data-testid="spreadsheet-active-cell-status"
          style={{ maxWidth: 160 }}
          title={`${sheet.name} · ${activeCellDisplayLabel}`}
        >
          {sheet.name} · {activeCellDisplayLabel}
        </span>
        <SpreadsheetSelectionStatistics
          source={selectionStatisticsSource}
          numberFormat={sheet.cells[`${activeCell.row}:${activeCell.col}`]?.style?.numberFormat}
          date1904={workbookDate1904}
        />
        {/* Excel's "Calculating" in the status bar, as the Docs progress chip.
            A draft whose error alert waits on the user is not calculating. */}
        {!filterVisibility.failed &&
        (filterVisibility.pending ||
          backgroundCalculation.pending ||
          backgroundPlanBusy ||
          explicitCalculationBusy ||
          (validatedDraftPending && !validationAlert?.draftDecision)) ? (
          <SettledStatusProgress
            phase="preparing"
            className="shrink-0 text-xs font-medium"
            label={t("spreadsheet.calculationCalculating")}
            testId="spreadsheet-background-calculating"
          />
        ) : null}
        {/* C4: the calculation could not answer -- the grid shows the last
            results (stale) until it does; it is asked again by itself, and
            Retry asks now. A PivotTable report that did not settle says so. */}
        {backgroundCalculation.failure && !backgroundCalculation.pending && !explicitCalculationBusy &&
        !calculationStaleNeedsNoNotice(backgroundCalculation.failure.reason, tiledCalculatesOnSave) ? (
          <OfficeStatusProgress
            phase="failed"
            className="min-w-0 text-xs font-medium"
            label={<>
              {t(`spreadsheet.calculationStale.${backgroundCalculation.failure.reason}`)}{" "}
              <button type="button" className="underline" data-testid="spreadsheet-calculation-retry"
                onClick={backgroundCalculation.retry}>{t("spreadsheet.calculationStale.retry")}</button>
            </>}
            testId="spreadsheet-calculation-stale"
            data={{ "data-calculation-unavailable": backgroundCalculation.failure.reason }}
          />
        ) : backgroundCalculation.pivotStale ? (
          <OfficeStatusProgress
            phase="failed"
            className="min-w-0 text-xs font-medium"
            label={t("spreadsheet.calculationStale.pivots")}
            testId="spreadsheet-pivot-stale"
          />
        ) : null}
        {exportStatus ? (
          <OfficeStatusProgress
            phase={exportStatus.phase}
            className="min-w-0 text-xs font-medium"
            label={exportStatus.format === SPREADSHEET_PRINT_STATUS_FORMAT
              ? t("toolbar.printPreparing")
              : exportStatus.phase === "preparing" && exportWarmup
                ? t("toolbar.exportPreparingWorkbookRooms", {
                  format: exportStatus.format, done: exportWarmup.done, total: exportWarmup.total,
                })
                : t(SPREADSHEET_EXPORT_STATUS_MESSAGE[exportStatus.phase], {
                  format: exportStatus.format,
                })}
            title={exportStatus.error}
            transferName={exportStatus.format === SPREADSHEET_PRINT_STATUS_FORMAT
              ? t("toolbar.printPreparing")
              : t("toolbar.exportPreparing", { format: exportStatus.format })}
            testId="spreadsheet-export-status"
          />
        ) : null}
        <span
          className={spreadsheetHomeStyles.viewModeSwitcher}
          role="group"
          aria-label={t("spreadsheet.uiCopy.workbookViews")}
          data-testid="spreadsheet-statusbar-view-modes"
        >
          <button
            type="button"
            className={spreadsheetHomeStyles.viewModeButton}
            aria-label={t("spreadsheet.uiCopy.normalView")}
            aria-pressed={spreadsheetViewMode === "normal"}
            data-active={
              spreadsheetViewMode === "normal" ? "true" : undefined
            }
            data-control-id="XLSCTL.VIEW.MODE.NORMAL"
            data-testid="spreadsheet-statusbar-view-normal"
            disabled={
              !visibleCommandState("XLSCTL.VIEW.MODE.NORMAL").enabled
            }
            title={t("spreadsheet.uiCopy.normalView")}
            onClick={() =>
              executeVisibleCommand("XLSCTL.VIEW.MODE.NORMAL")
            }
          >
            <SpreadsheetViewModeIcon name="normal" />
          </button>
          <button
            type="button"
            className={spreadsheetHomeStyles.viewModeButton}
            aria-label={t("spreadsheet.view.pageLayout")}
            aria-pressed={spreadsheetViewMode === "pageLayout"}
            data-active={
              spreadsheetViewMode === "pageLayout"
                ? "true"
                : undefined
            }
            data-control-id="XLSCTL.VIEW.MODE.PAGE_LAYOUT"
            data-testid="spreadsheet-statusbar-view-page-layout"
            disabled={
              !visibleCommandState("XLSCTL.VIEW.MODE.PAGE_LAYOUT")
                .enabled
            }
            title={t("spreadsheet.view.pageLayout")}
            onClick={() =>
              executeVisibleCommand("XLSCTL.VIEW.MODE.PAGE_LAYOUT")
            }
          >
            <SpreadsheetViewModeIcon name="pageLayout" />
          </button>
          <button
            type="button"
            className={spreadsheetHomeStyles.viewModeButton}
            aria-label={t("spreadsheet.pageBreakPreviewToggle")}
            aria-pressed={
              spreadsheetViewMode === "pageBreakPreview"
            }
            data-active={
              spreadsheetViewMode === "pageBreakPreview"
                ? "true"
                : undefined
            }
            data-control-id="XLSCTL.VIEW.MODE.PAGE_BREAK"
            data-testid="spreadsheet-statusbar-view-page-break"
            disabled={
              !visibleCommandState("XLSCTL.VIEW.MODE.PAGE_BREAK")
                .enabled
            }
            title={t("spreadsheet.pageBreakPreviewToggle")}
            onClick={() =>
              executeVisibleCommand("XLSCTL.VIEW.MODE.PAGE_BREAK")
            }
          >
            <SpreadsheetViewModeIcon name="pageBreakPreview" />
          </button>
        </span>
        <div
          role="group"
          aria-label={t("spreadsheet.zoomLabel")}
          className={`${spreadsheetHomeStyles.zoomStatusControls} ml-auto`}
          data-testid="spreadsheet-statusbar-zoom"
        >
          {renderSpreadsheetZoomDial(
            "spreadsheet-status",
            "top",
            "end",
            "XLSCTL.WINDOW.STATUS.ZOOM.DIALOG_ENTRY",
          )}
        </div>
      </footer>
  );
}
