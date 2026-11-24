"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Fragment, type RefObject } from "react";
import { X, Search, Hash, CalendarRange, Tags, Rows3, Columns3, SquareSigma, SlidersHorizontal, Plus, Filter, ChevronRight, ChevronDown } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { spreadsheetPaneClassName, officeDialogParts as dialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { OfficeTaskPaneOptions } from "@mrnote/core/web/components/office-ribbon/officeTaskPaneLayout.tsx";
import { OfficeTaskPaneDockedTitle } from "@mrnote/core/web/components/office-ribbon/OfficeTaskPane.tsx";
import { OfficeDockedPane } from "@mrnote/core/web/components/office-ribbon/OfficeTaskPaneDockHost.tsx";
import spreadsheetHomeStyles from "./SpreadsheetHomeRibbon.module.css";
import { OfficeDeferredChrome } from "@mrnote/core/web/components/office-ribbon/OfficeDeferredChrome.tsx";
import PivotChartView from "../PivotChartView";
import { pivotChartReportToRows, pivotChartReportCategoryLevels, pivotResultToChartData } from "@mrnote/core/web/lib/spreadsheet/pivot-chart.ts";
import { normalizePivotRange, distinctValues, type PivotConfig, type PivotFieldProfile, type PivotMatrix, type PivotValueField } from "@mrnote/core/web/lib/spreadsheet/pivot.ts";
import { type PivotChartReport } from "@mrnote/core/web/lib/spreadsheet/pivot-output.ts";
import { type PivotFieldAreaName } from "./spreadsheetMutationReceipts";
import { SPREADSHEET_TASK_PANE_EDGES, pivotHeaderCellStyle, pivotBodyCellStyle, pivotTotalCellStyle } from "./spreadsheetWindowConstants";
import { type PivotOutputPlan } from "@mrnote/core/web/lib/spreadsheet/pivot-output.ts";
import { type Dispatch, type JSX, type SetStateAction } from "react";
import { type ResolvedSpreadsheetVisibleControl } from "../../../../lib/spreadsheet/visible-command-authority";
import { type PivotResult } from "@mrnote/core/web/lib/spreadsheet/pivot.ts";
import { type OfficeTaskPaneDockRegistry } from "@mrnote/core/web/components/office-ribbon/officeTaskPaneDock.ts";

/** What renderSpreadsheetPivotFieldListPane reads from SpreadsheetWindow's render scope. */
export interface RenderSpreadsheetPivotFieldListPaneInputs {
  activePivotChartReport: PivotChartReport | null;
  activePivotOutputPlan: PivotOutputPlan | null;
  addPivotCalcField: () => void;
  addPivotFieldToArea: (colIndex: number, targetArea: PivotFieldAreaName) => void;
  clearPivot: () => Promise<boolean>;
  commitPivotOutput: (rawAddress: string) => void;
  duplicatePivotValueField: (colIndex: number) => void;
  executeVisibleCommand: (controlId: string) => Promise<boolean>;
  formatPivotCell: (cell: number | null, valueIndex: number) => string;
  hasMultiSelection: boolean;
  movePivotFieldArea: (sourceArea: PivotFieldAreaName, sourceIndex: number, targetArea: PivotFieldAreaName, targetIndex?: number) => void;
  persistedPivotOutput: string;
  persistedPivotSource: string;
  pivotCalcFormulaDraft: string;
  pivotCalcNameDraft: string;
  pivotChartContextActive: boolean;
  pivotChartOpen: boolean;
  pivotCollapsed: Set<string>;
  pivotConfig: PivotConfig | null;
  pivotContextActive: boolean;
  pivotFieldIsAssigned: (colIndex: number) => boolean;
  pivotFieldLabel: (colIndex: number) => string;
  pivotFieldOrderList: (area: PivotFieldAreaName, items: readonly { key: string; label: string; colIndex: number; }[]) => JSX.Element | null;
  pivotFieldProfileByIndex: Map<number, PivotFieldProfile>;
  pivotFieldSearch: string;
  pivotFieldWriterReason: string | undefined;
  pivotFieldWriterState: ResolvedSpreadsheetVisibleControl;
  pivotGroupSelect: (colIndex: number) => JSX.Element;
  pivotOutputDraft: string;
  pivotResult: PivotResult | null;
  pivotSourceColumns: number[];
  pivotSourceDraft: string;
  pivotSourceDraftCancelledRef: RefObject<boolean>;
  pivotSourceDraftRejected: boolean;
  pivotSourceInputRef: RefObject<HTMLInputElement | null>;
  pivotSourceIsScenarios: boolean;
  pivotSourceMatrix: PivotMatrix | null;
  pivotValueColumnLabel: (field: PivotValueField) => string;
  pivotValuesFieldItem: (area: "rows" | "columns", valueCount: number, onRows: boolean) => JSX.Element | null;
  setPivotValuesOnRows: (onRows: boolean) => void;
  pivotValueSettingsLaunchIndexRef: RefObject<number | null>;
  pivotValueSettingsReturnFocusRef: RefObject<HTMLButtonElement | null>;
  removePivotCalcField: (name: string) => void;
  removePivotValueAt: (valueIndex: number) => void;
  scrollOnlyRenderRef: RefObject<boolean>;
  setPivotCalcFormulaDraft: Dispatch<SetStateAction<string>>;
  setPivotCalcNameDraft: Dispatch<SetStateAction<string>>;
  setPivotChartOpen: Dispatch<SetStateAction<boolean>>;
  setPivotFieldSearch: Dispatch<SetStateAction<string>>;
  setPivotOutputDraft: Dispatch<SetStateAction<string>>;
  setPivotOutputFromActiveCell: () => void;
  setPivotPanelOpen: Dispatch<SetStateAction<boolean>>;
  setPivotSource: (rawRange: string) => void;
  setPivotSourceDraft: Dispatch<SetStateAction<string>>;
  setPivotSourceDraftRejected: Dispatch<SetStateAction<boolean>>;
  setPivotSourceFromSelection: () => void;
  sheetTaskPaneDocks: { right: OfficeTaskPaneDockRegistry; };
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  togglePivotCatalogField: (colIndex: number) => void;
  togglePivotCollapsed: (outer: string) => void;
  togglePivotFilterValue: (colIndex: number, value: string) => void;
  togglePivotRowSubtotals: () => void;
  visibleCommandDomStateProps: (controlId: string) => { "data-control-id": string; disabled: boolean; hidden: boolean; title: string | undefined; };
  visiblePivotFieldColumns: number[];
}

/** Moved verbatim from SpreadsheetWindow's JSX: a render function (not a component), so the element tree React reconciles is unchanged. */
export function renderSpreadsheetPivotFieldListPane({
  activePivotChartReport,
  activePivotOutputPlan,
  addPivotCalcField,
  addPivotFieldToArea,
  clearPivot,
  commitPivotOutput,
  duplicatePivotValueField,
  executeVisibleCommand,
  formatPivotCell,
  hasMultiSelection,
  movePivotFieldArea,
  persistedPivotOutput,
  persistedPivotSource,
  pivotCalcFormulaDraft,
  pivotCalcNameDraft,
  pivotChartContextActive,
  pivotChartOpen,
  pivotCollapsed,
  pivotConfig,
  pivotContextActive,
  pivotFieldIsAssigned,
  pivotFieldLabel,
  pivotFieldOrderList,
  pivotFieldProfileByIndex,
  pivotFieldSearch,
  pivotFieldWriterReason,
  pivotFieldWriterState,
  pivotGroupSelect,
  pivotOutputDraft,
  pivotResult,
  pivotSourceColumns,
  pivotSourceDraft,
  pivotSourceDraftCancelledRef,
  pivotSourceDraftRejected,
  pivotSourceInputRef,
  pivotSourceIsScenarios,
  pivotSourceMatrix,
  pivotValueColumnLabel,
  pivotValuesFieldItem,
  setPivotValuesOnRows,
  pivotValueSettingsLaunchIndexRef,
  pivotValueSettingsReturnFocusRef,
  removePivotCalcField,
  removePivotValueAt,
  scrollOnlyRenderRef,
  setPivotCalcFormulaDraft,
  setPivotCalcNameDraft,
  setPivotChartOpen,
  setPivotFieldSearch,
  setPivotOutputDraft,
  setPivotOutputFromActiveCell,
  setPivotPanelOpen,
  setPivotSource,
  setPivotSourceDraft,
  setPivotSourceDraftRejected,
  setPivotSourceFromSelection,
  sheetTaskPaneDocks,
  t,
  togglePivotCatalogField,
  togglePivotCollapsed,
  togglePivotFilterValue,
  togglePivotRowSubtotals,
  visibleCommandDomStateProps,
  visiblePivotFieldColumns,
}: RenderSpreadsheetPivotFieldListPaneInputs) {
  // The pane's close, for its X, its Task Pane Options and its tab.
  const closePivotPanel = () => setPivotPanelOpen(false);
  return (
        <OfficeDockedPane
          docks={sheetTaskPaneDocks}
          edges={SPREADSHEET_TASK_PANE_EDGES}
          pane="pivot-fields"
        >
        {/* The Fields pane redraws the whole report preview; like the ribbon
            it catches up after a selection move instead of inside it. */}
        <OfficeDeferredChrome
          display="contents"
          quiet={scrollOnlyRenderRef.current}
          render={() => (
        <div
          className={`${spreadsheetHomeStyles.pivotFieldListPane} ${spreadsheetPaneClassName()} spreadsheet-window__pivot`}
          role="complementary"
          aria-label={t(pivotChartContextActive ? "spreadsheet.pivotChartFieldList.title" : "spreadsheet.pivotFieldList.title")}
          data-contextual-overlay={pivotContextActive ? "true" : undefined}
          // A task pane of the workbook's dock (F6 reaches it, its title
          // bar drags it), though it draws its own header.
          data-office-task-pane=""
          tabIndex={-1}
          // Escape leaves the pane open, as Excel's task panes do (its X, or
          // Task Pane Options > Close, closes it).
          data-testid="spreadsheet-pivot-panel"
        >
          <header className={dialogParts.header}>
            <span className={dialogParts.title}>
              <OfficeTaskPaneDockedTitle
                title={t(pivotChartContextActive ? "spreadsheet.pivotChartFieldList.title" : "spreadsheet.pivotFieldList.title")}
                onClose={closePivotPanel}
              />
            </span>
            <OfficeTaskPaneOptions
              paneId="pivot-fields"
              onClose={closePivotPanel}
              className={dialogParts.iconButton}
              testIdPrefix="spreadsheet-pivot-field-list"
            />
            <button
              type="button"
              className={dialogParts.close}
              aria-label={t("spreadsheet.pivotFieldList.close")}
              onClick={closePivotPanel}
              data-testid="spreadsheet-pivot-field-list-close"
            >
              <X aria-hidden="true" size={14} />
            </button>
          </header>
          <p className={dialogParts.description}>
            {pivotConfig?.name ?? t("spreadsheet.pivotFieldList.current")}
            {persistedPivotSource ? ` · ${persistedPivotSource}` : ""}
          </p>
          <div className={`${spreadsheetHomeStyles.pivotFieldListBody} ${dialogParts.paneBody}`}>
          <fieldset
            aria-label={t("spreadsheet.pivotFieldList.editing")}
            data-control-id="XLSCTL.CONTEXT.PIVOT.FIELD_LIST.MRAI.APPLY"
            data-control-occurrence-id="field-list-editor"
            data-control-surface="pivot-field-list"
            disabled={!pivotFieldWriterState.enabled}
            title={pivotFieldWriterReason}
            className={spreadsheetHomeStyles.pivotFieldListEditor}
          >
            <div className={spreadsheetHomeStyles.pivotFieldListToolbar}>
            <label>
              {t("spreadsheet.pivotSource")}:{" "}
              {/* Above the box: the toolbar aligns its controls on their bottom edge. */}
              {pivotConfig ? (
                <span
                  id="spreadsheet-pivot-source-hint"
                  data-testid="spreadsheet-pivot-source-hint"
                  className={spreadsheetHomeStyles.pivotFieldListInputHint}
                >
                  {t(
                    pivotSourceIsScenarios
                      ? "spreadsheet.commandStatus.pivotSourceIsScenarios"
                      : "spreadsheet.pivotFieldList.sourceHint",
                  )}
                </span>
              ) : pivotSourceDraftRejected ? (
                <span
                  id="spreadsheet-pivot-source-error"
                  role="alert"
                  data-testid="spreadsheet-pivot-source-error"
                  className={spreadsheetHomeStyles.pivotFieldListInputHint}
                  data-tone="error"
                >
                  {t("spreadsheet.uiCopy.enterAValidContiguousRangeWithAHeaderRow")}
                </span>
              ) : null}
              <input
                ref={pivotSourceInputRef}
                value={pivotSourceDraft}
                readOnly={pivotConfig !== null}
                aria-readonly={pivotConfig !== null}
                aria-invalid={
                  !pivotConfig && pivotSourceDraftRejected ? true : undefined
                }
                aria-describedby={
                  pivotConfig
                    ? "spreadsheet-pivot-source-hint"
                    : pivotSourceDraftRejected
                      ? "spreadsheet-pivot-source-error"
                      : undefined
                }
                onChange={(event) => {
                  if (pivotConfig) return;
                  setPivotSourceDraft(event.target.value);
                  setPivotSourceDraftRejected(false);
                }}
                onBlur={(event) => {
                  if (pivotSourceDraftCancelledRef.current) {
                    pivotSourceDraftCancelledRef.current = false;
                    return;
                  }
                  setPivotSource(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (pivotConfig) return;
                  if (event.key === "Enter") {
                    event.preventDefault();
                    setPivotSource(event.currentTarget.value);
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    pivotSourceDraftCancelledRef.current = true;
                    setPivotSourceDraft("");
                    setPivotSourceDraftRejected(false);
                    event.currentTarget.blur();
                  }
                }}
                placeholder={t("spreadsheet.pivotSourcePlaceholder")}
                aria-label={t("spreadsheet.pivotSource")}
                data-testid="spreadsheet-pivot-source"
                title={
                  pivotConfig
                    ? t(
                    pivotSourceIsScenarios
                      ? "spreadsheet.commandStatus.pivotSourceIsScenarios"
                      : "spreadsheet.pivotFieldList.sourceHint",
                  )
                    : undefined
                }
                className={spreadsheetHomeStyles.pivotFieldListInput}
              />
            </label>
            <button
              type="button"
              onClick={setPivotSourceFromSelection}
              disabled={Boolean(pivotConfig) || !hasMultiSelection}
              title={
                pivotConfig
                  ? t(
                    pivotSourceIsScenarios
                      ? "spreadsheet.commandStatus.pivotSourceIsScenarios"
                      : "spreadsheet.pivotFieldList.sourceHint",
                  )
                  : undefined
              }
              data-testid="spreadsheet-pivot-use-selection"
              className={`${spreadsheetHomeStyles.pivotFieldListToolbarButton} ${dialogParts.compactButton}`}
            >
              {t("spreadsheet.pivotUseSelection")}
            </button>
            <label>
              {t("spreadsheet.consolidateDestLabel")}:{" "}
              <input
                value={pivotOutputDraft}
                onChange={(event) => setPivotOutputDraft(event.target.value)}
                onBlur={(event) => commitPivotOutput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitPivotOutput(event.currentTarget.value);
                    event.currentTarget.blur();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    setPivotOutputDraft(persistedPivotOutput);
                    event.currentTarget.blur();
                  }
                }}
                placeholder={t("spreadsheet.consolidateDestPlaceholder")}
                aria-label={t("spreadsheet.consolidateDestLabel")}
                data-testid="spreadsheet-pivot-output"
                className={spreadsheetHomeStyles.pivotFieldListInput}
              />
            </label>
            <button
              type="button"
              onClick={setPivotOutputFromActiveCell}
              data-testid="spreadsheet-pivot-output-use-active"
              className={`${spreadsheetHomeStyles.pivotFieldListToolbarButton} ${dialogParts.compactButton}`}
            >
              {t("spreadsheet.pivotUseSelection")}
            </button>
            <button
              type="button"
              {...visibleCommandDomStateProps(
                "XLSCTL.CONTEXT.PIVOT.CLEAR.MRAI.APPLY",
              )}
              data-control-occurrence-id="field-list-clear"
              data-control-surface="pivot-field-list"
              onClick={() => void clearPivot()}
              data-testid="spreadsheet-pivot-clear"
              className={`${spreadsheetHomeStyles.pivotFieldListToolbarButton} ${dialogParts.compactButton}`}
            >
              {t("spreadsheet.pivotClear")}
            </button>
            {pivotOutputDraft !== "" &&
            !normalizePivotRange(pivotOutputDraft) ? (
              <span
                role="alert"
                data-testid="spreadsheet-pivot-output-error"
                style={{ color: "var(--danger, #dc2626)", fontSize: 12 }}
              >
                {t("spreadsheet.consolidateBadDest")}
              </span>
            ) : activePivotOutputPlan?.status === "out-of-bounds" ? (
              <span
                role="alert"
                data-testid="spreadsheet-pivot-output-error"
                style={{ color: "var(--danger, #dc2626)", fontSize: 12 }}
              >
                {t("spreadsheet.consolidateBadDest")}
              </span>
            ) : (activePivotOutputPlan?.collisions.length ?? 0) > 0 ? (
              <span
                role="alert"
                data-testid="spreadsheet-pivot-output-error"
                style={{ color: "var(--danger, #dc2626)", fontSize: 12 }}
              >
                {t("spreadsheet.consolidateDestLocked")}
              </span>
            ) : null}
            {/* Subtotals (Excel PivotTable): a per-outer-group subtotal row,
                Design > Subtotals in one box. Only meaningful with ≥2 row
                fields. An imported PivotTable takes it as any field edit
                (written back by the PivotTable writer). */}
            <label className={spreadsheetHomeStyles.pivotFieldListCheckboxLabel}>
              <input
                type="checkbox"
                checked={pivotConfig?.rowSubtotals === true}
                onChange={togglePivotRowSubtotals}
                disabled={Boolean(pivotConfig?.native) && !pivotFieldWriterState.enabled}
                title={
                  pivotConfig?.native && !pivotFieldWriterState.enabled
                    ? pivotFieldWriterReason ?? undefined
                    : undefined
                }
                data-testid="spreadsheet-pivot-subtotals-toggle"
              />{" "}
              {t("spreadsheet.pivotSubtotals")}
            </label>
          </div>

            {pivotSourceColumns.length > 0 ? (
              <section
                className={spreadsheetHomeStyles.pivotFieldCatalog}
                aria-labelledby="spreadsheet-pivot-field-catalog-title"
              >
                <div className={spreadsheetHomeStyles.pivotFieldSectionHeading}>
                  <strong id="spreadsheet-pivot-field-catalog-title">
                    {t("spreadsheet.pivotFieldList.chooseFields")}
                  </strong>
                  <span>{pivotSourceColumns.length}</span>
                </div>
                <label className={spreadsheetHomeStyles.pivotFieldSearch}>
                  <Search aria-hidden="true" size={15} />
                  <span className="sr-only">
                    {t("spreadsheet.pivotFieldList.search")}
                  </span>
                  <input
                    type="search"
                    value={pivotFieldSearch}
                    onChange={(event) => setPivotFieldSearch(event.target.value)}
                    placeholder={t("search.windowTitle")}
                    data-testid="spreadsheet-pivot-field-search"
                  />
                </label>
                <div
                  className={spreadsheetHomeStyles.pivotFieldCatalogList}
                  role="list"
                >
                  {visiblePivotFieldColumns.map((colIndex) => {
                    const profile = pivotFieldProfileByIndex.get(colIndex);
                    const assigned = pivotFieldIsAssigned(colIndex);
                    return (
                      <div
                        key={colIndex}
                        className={spreadsheetHomeStyles.pivotFieldCatalogItem}
                        role="listitem"
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "copyMove";
                          event.dataTransfer.setData(
                            "application/x-mrai-pivot-field-order",
                            `catalog:${colIndex}`,
                          );
                        }}
                      >
                        <label className={spreadsheetHomeStyles.pivotFieldCatalogChoice}>
                          <input
                            type="checkbox"
                            checked={assigned}
                            onChange={() => togglePivotCatalogField(colIndex)}
                            data-testid={`spreadsheet-pivot-field-${colIndex}`}
                          />
                          <span className={spreadsheetHomeStyles.pivotFieldTypeIcon}>
                            {profile?.type === "number" ? (
                              <Hash aria-hidden="true" size={14} />
                            ) : profile?.type === "date" ? (
                              <CalendarRange aria-hidden="true" size={14} />
                            ) : (
                              <Tags aria-hidden="true" size={14} />
                            )}
                          </span>
                          <span>{pivotFieldLabel(colIndex)}</span>
                        </label>
                        <select
                          aria-label={
                            t("spreadsheet.pivotFieldList.addFieldTo", {
                              field: pivotFieldLabel(colIndex),
                            })
                          }
                          value=""
                          onChange={(event) => {
                            const area = event.currentTarget.value;
                            if (area) {
                              addPivotFieldToArea(
                                colIndex,
                                area as PivotFieldAreaName,
                              );
                            }
                          }}
                          data-testid={`spreadsheet-pivot-field-add-${colIndex}`}
                        >
                          <option value="">{t("spreadsheet.pivotFieldList.addTo")}</option>
                          <option value="filters">{t("spreadsheet.pivotFilters")}</option>
                          <option value="columns">{t("spreadsheet.pivotColumns")}</option>
                          <option value="rows">{t("spreadsheet.pivotRows")}</option>
                          <option value="values">{t("spreadsheet.pivotValues")}</option>
                        </select>
                      </div>
                    );
                  })}
                  {visiblePivotFieldColumns.length === 0 ? (
                    <p className={spreadsheetHomeStyles.pivotFieldEmpty}>
                      {t("spreadsheet.pivotFieldList.noFields")}
                    </p>
                  ) : null}
                </div>
              </section>
            ) : null}

            {pivotSourceColumns.length === 0 ? (
            <span
              data-testid="spreadsheet-pivot-empty-source"
              style={{ fontSize: 12, color: "var(--muted, #6b7280)" }}
            >
              {t("spreadsheet.pivotPickSource")}
            </span>
          ) : (
            <div className={spreadsheetHomeStyles.pivotFieldListContent}>
            <div className={spreadsheetHomeStyles.pivotFieldAreas}>
                {/* Row fields */}
                <fieldset
                  data-testid="spreadsheet-pivot-rows"
                  className={spreadsheetHomeStyles.pivotFieldAreaCard}
                  onDragOver={(event) => {
                    if (
                      event.dataTransfer.types.includes(
                        "application/x-mrai-pivot-field-order",
                      )
                    ) {
                      event.preventDefault();
                    }
                  }}
                  onDrop={(event) => {
                    const [sourceArea, sourceIndex] = event.dataTransfer
                      .getData("application/x-mrai-pivot-field-order")
                      .split(":");
                    if (!sourceArea) return;
                    event.preventDefault();
                    if (sourceArea === "catalog") {
                      addPivotFieldToArea(Number(sourceIndex), "rows");
                      return;
                    }
                    if (sourceArea === "valuesField") {
                      setPivotValuesOnRows(true);
                      return;
                    }
                    movePivotFieldArea(
                      sourceArea as PivotFieldAreaName,
                      Number(sourceIndex),
                      "rows",
                    );
                  }}
                >
                <legend>
                  <Rows3 aria-hidden="true" size={14} />
                  {/* A PivotChart's Fields pane names the areas by the chart:
                      rows are its Axis (Categories), columns its Legend (Series). */}
                  <span>{t(pivotChartContextActive ? "spreadsheet.pivotChartFieldList.axis" : "spreadsheet.pivotRows")}</span>
                </legend>
                {pivotFieldOrderList(
                  "rows",
                  (pivotConfig?.rows ?? []).map((colIndex, index) => ({
                    key: `row:${colIndex}:${index}`,
                    label: pivotFieldLabel(colIndex),
                    colIndex,
                  })),
                )}
                {pivotValuesFieldItem("rows", pivotConfig?.values.length ?? 0, pivotConfig?.valuesOnRows === true)}
                {(pivotConfig?.rows ?? []).map((colIndex) => (
                  <div
                    key={`row-options:${colIndex}`}
                    className={spreadsheetHomeStyles.pivotFieldAreaOption}
                  >
                    <span>{pivotFieldLabel(colIndex)}</span>
                    {pivotGroupSelect(colIndex)}
                  </div>
                ))}
              </fieldset>

                {/* Column fields */}
                <fieldset
                  data-testid="spreadsheet-pivot-columns"
                  className={spreadsheetHomeStyles.pivotFieldAreaCard}
                  onDragOver={(event) => {
                    if (
                      event.dataTransfer.types.includes(
                        "application/x-mrai-pivot-field-order",
                      )
                    ) {
                      event.preventDefault();
                    }
                  }}
                  onDrop={(event) => {
                    const [sourceArea, sourceIndex] = event.dataTransfer
                      .getData("application/x-mrai-pivot-field-order")
                      .split(":");
                    if (!sourceArea) return;
                    event.preventDefault();
                    if (sourceArea === "catalog") {
                      addPivotFieldToArea(Number(sourceIndex), "columns");
                      return;
                    }
                    if (sourceArea === "valuesField") {
                      setPivotValuesOnRows(false);
                      return;
                    }
                    movePivotFieldArea(
                      sourceArea as PivotFieldAreaName,
                      Number(sourceIndex),
                      "columns",
                    );
                  }}
                >
                <legend>
                  <Columns3 aria-hidden="true" size={14} />
                  <span>{t(pivotChartContextActive ? "spreadsheet.pivotChartFieldList.legend" : "spreadsheet.pivotColumns")}</span>
                </legend>
                {pivotFieldOrderList(
                  "columns",
                  (pivotConfig?.columns ?? []).map((colIndex, index) => ({
                    key: `column:${colIndex}:${index}`,
                    label: pivotFieldLabel(colIndex),
                    colIndex,
                  })),
                )}
                {pivotValuesFieldItem("columns", pivotConfig?.values.length ?? 0, pivotConfig?.valuesOnRows === true)}
                {(pivotConfig?.columns ?? []).map((colIndex) => (
                  <div
                    key={`column-options:${colIndex}`}
                    className={spreadsheetHomeStyles.pivotFieldAreaOption}
                  >
                    <span>{pivotFieldLabel(colIndex)}</span>
                    {pivotGroupSelect(colIndex)}
                  </div>
                ))}
              </fieldset>

                {/* Value fields + aggregation */}
                <fieldset
                  data-testid="spreadsheet-pivot-values"
                  className={spreadsheetHomeStyles.pivotFieldAreaCard}
                  onDragOver={(event) => {
                    if (
                      event.dataTransfer.types.includes(
                        "application/x-mrai-pivot-field-order",
                      )
                    ) {
                      event.preventDefault();
                    }
                  }}
                  onDrop={(event) => {
                    const [sourceArea, sourceIndex] = event.dataTransfer
                      .getData("application/x-mrai-pivot-field-order")
                      .split(":");
                    if (!sourceArea) return;
                    event.preventDefault();
                    if (sourceArea === "catalog") {
                      addPivotFieldToArea(Number(sourceIndex), "values");
                      return;
                    }
                    movePivotFieldArea(
                      sourceArea as PivotFieldAreaName,
                      Number(sourceIndex),
                      "values",
                    );
                  }}
                >
                  <legend>
                  <SquareSigma aria-hidden="true" size={14} />
                  <span>{t("spreadsheet.pivotValues")}</span>
                </legend>
                  {pivotFieldOrderList(
                  "values",
                  (pivotConfig?.values ?? []).map((field, index) => ({
                    key: `value:${field.colIndex}:${index}`,
                    label: pivotValueColumnLabel(field),
                    colIndex: field.colIndex,
                  })),
                )}
                  {(pivotConfig?.values ?? []).map((value, valueIndex) => (
                  <div
                    key={`value-editor:${value.colIndex}:${valueIndex}`}
                    className={spreadsheetHomeStyles.pivotFieldAreaOption}
                  >
                      <span>{pivotValueColumnLabel(value)}</span>
                      <button
                        type="button"
                        {...visibleCommandDomStateProps(
                          "XLSCTL.CONTEXT.PIVOT.VALUE_FIELD_SETTINGS",
                        )}
                        onClick={(event) => {
                          pivotValueSettingsReturnFocusRef.current =
                            event.currentTarget;
                          pivotValueSettingsLaunchIndexRef.current = valueIndex;
                          void executeVisibleCommand(
                            "XLSCTL.CONTEXT.PIVOT.VALUE_FIELD_SETTINGS",
                          );
                        }}
                        aria-label={
                          t("spreadsheet.pivotFieldList.settingsFor", {
                            field: pivotValueColumnLabel(value),
                          })
                        }
                        data-testid={`spreadsheet-pivot-value-settings-${valueIndex}`}
                        className={`${spreadsheetHomeStyles.pivotFieldListToolbarButton} ${dialogParts.compactButton}`}
                      >
                        <SlidersHorizontal aria-hidden="true" size={14} />
                        {t("spreadsheet.pivotFieldList.valueSettings")}
                      </button>
                    <span className={spreadsheetHomeStyles.pivotFieldAreaActions}>
                      <button
                      type="button"
                      disabled={(pivotConfig?.values.length ?? 0) >= 8}
                      onClick={() => duplicatePivotValueField(value.colIndex)}
                      aria-label={t("spreadsheet.pivotFieldList.addValueAgain")}
                      title={t("spreadsheet.pivotFieldList.addValueAgain")}
                    >
                        <Plus aria-hidden="true" size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removePivotValueAt(valueIndex)}
                      aria-label={t("spreadsheet.pivotFieldList.removeValue")}
                    >
                        <X aria-hidden="true" size={14} />
                      </button>
                    </span>
                    </div>
                ))}
                </fieldset>

                {/* Report / page filters (Excel "Filters" area): pick filter
                  fields, then the allowed values per field (empty = "(All)"). */}
                <fieldset
                  data-testid="spreadsheet-pivot-filters"
                  className={spreadsheetHomeStyles.pivotFieldAreaCard}
                  onDragOver={(event) => {
                    if (
                      event.dataTransfer.types.includes(
                        "application/x-mrai-pivot-field-order",
                      )
                    ) {
                      event.preventDefault();
                    }
                  }}
                  onDrop={(event) => {
                    const [sourceArea, sourceIndex] = event.dataTransfer
                      .getData("application/x-mrai-pivot-field-order")
                      .split(":");
                    if (!sourceArea) return;
                    event.preventDefault();
                    if (sourceArea === "catalog") {
                      addPivotFieldToArea(Number(sourceIndex), "filters");
                      return;
                    }
                    movePivotFieldArea(
                      sourceArea as PivotFieldAreaName,
                      Number(sourceIndex),
                      "filters",
                    );
                  }}
                >
                <legend>
                  <Filter aria-hidden="true" size={14} />
                  <span>{t("spreadsheet.pivotFilters")}</span>
                </legend>
                {pivotFieldOrderList(
                  "filters",
                  (pivotConfig?.filters ?? []).map((field, index) => ({
                    key: `filter:${field.colIndex}:${index}`,
                    label: pivotFieldLabel(field.colIndex),
                    colIndex: field.colIndex,
                  })),
                )}
                {(pivotConfig?.filters ?? []).map((filter) => (
                  <div
                    key={filter.colIndex}
                    data-testid={`spreadsheet-pivot-filter-values-${filter.colIndex}`}
                    style={{
                      marginTop: 6,
                      paddingTop: 6,
                      borderTop: "1px dashed var(--border, #e5e7eb)",
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>
                      {pivotFieldLabel(filter.colIndex)}
                      {filter.selected.length === 0
                        ? ` — ${t("spreadsheet.pivotFilterAll")}`
                        : ""}
                    </div>
                    <div style={{ maxHeight: 140, overflow: "auto" }}>
                      {(pivotSourceMatrix
                        ? distinctValues(pivotSourceMatrix, filter.colIndex)
                        : []
                      )
                        .slice(0, 500)
                        .map((value) => (
                          <label
                            key={value}
                            style={{ display: "block", whiteSpace: "nowrap" }}
                          >
                            <input
                              type="checkbox"
                              checked={filter.selected.includes(value)}
                              onChange={() =>
                                togglePivotFilterValue(filter.colIndex, value)
                              }
                              data-testid={`spreadsheet-pivot-filter-value-${filter.colIndex}-${value}`}
                            />{" "}
                            {value === ""
                              ? t("spreadsheet.pivotFilterBlank")
                              : value}
                          </label>
                        ))}
                    </div>
                  </div>
                ))}
              </fieldset>

              </div>
              <div className={spreadsheetHomeStyles.pivotFieldAdvanced}>

                {/* Calculated fields (Excel "Calculated Field"): name + formula
                  over other source fields, e.g. "Sales - Cost". */}
                {pivotConfig?.native ? null : (
                <fieldset
                  data-testid="spreadsheet-pivot-calc-fields"
                  className={spreadsheetHomeStyles.pivotFieldAdvancedCard}
                >
                    <legend>
                  <SquareSigma aria-hidden="true" size={14} />
                  <span>{t("spreadsheet.pivotCalcFields")}</span>
                </legend>
                    {(pivotConfig?.calculatedFields ?? []).map((calc) => (
                  <div
                    key={calc.name}
                    data-testid={`spreadsheet-pivot-calc-${calc.name}`}
                    className={spreadsheetHomeStyles.pivotFieldAdvancedRow}
                  >
                        <strong>{calc.name}</strong>
                        <span style={{ color: "var(--muted, #6b7280)" }}>
                          = {calc.formula}
                        </span>
                        <button
                      type="button"
                      onClick={() => removePivotCalcField(calc.name)}
                      data-testid={`spreadsheet-pivot-calc-remove-${calc.name}`}
                      aria-label={t("spreadsheet.pivotCalcRemove")}
                      className={spreadsheetHomeStyles.pivotFieldIconButton}
                    >
                          <X aria-hidden="true" size={14} />
                        </button>
                      </div>
                ))}
                    <div className={spreadsheetHomeStyles.pivotFieldAdvancedForm}>
                  <input
                    value={pivotCalcNameDraft}
                    onChange={(event) =>
                      setPivotCalcNameDraft(event.target.value)
                    }
                    placeholder={t("spreadsheet.pivotCalcNamePlaceholder")}
                    aria-label={t("spreadsheet.pivotCalcName")}
                    data-testid="spreadsheet-pivot-calc-name"
                    className={spreadsheetHomeStyles.pivotFieldListInput}
                  />
                  <input
                    value={pivotCalcFormulaDraft}
                    onChange={(event) =>
                      setPivotCalcFormulaDraft(event.target.value)
                    }
                    placeholder={t("spreadsheet.pivotCalcFormulaPlaceholder")}
                    aria-label={t("spreadsheet.pivotCalcFormula")}
                    data-testid="spreadsheet-pivot-calc-formula"
                    className={spreadsheetHomeStyles.pivotFieldListInput}
                  />
                  <button
                    type="button"
                    onClick={addPivotCalcField}
                    disabled={
                      pivotCalcNameDraft.trim() === "" ||
                      pivotCalcFormulaDraft.trim() === ""
                    }
                    data-testid="spreadsheet-pivot-calc-add"
                    className={`${spreadsheetHomeStyles.pivotFieldListToolbarButton} ${dialogParts.compactButton}`}
                  >
                    {t("spreadsheet.pivotCalcAdd")}
                  </button>
                </div>
                  </fieldset>
              )}

              </div>
              </div>
          )}

            {/* Read-only result grid */}
            {pivotResult && pivotConfig ? (
            <div style={{ overflow: "auto" }}>
              {/* PivotChart (Excel): a read-only grouped-column chart of the pivot
                  result, toggled on demand and re-derived whenever it recomputes. */}
              <button
                type="button"
                onClick={() => setPivotChartOpen((value) => !value)}
                aria-pressed={pivotChartOpen}
                data-testid="spreadsheet-pivot-chart-toggle"
                className={dialogParts.compactButton}
                style={{ alignSelf: "flex-start", marginBottom: 6 }}
              >
                {pivotChartOpen
                  ? t("spreadsheet.pivotChartHide")
                  : t("spreadsheet.pivotChartShow")}
              </button>
              {pivotChartOpen ? (
                <div
                  data-testid="spreadsheet-pivot-chart"
                  style={{ marginBottom: 8 }}
                >
                  <PivotChartView
                    data={
                      activePivotChartReport
                        ? {
                            // The same axis the PivotChart draws: leaf labels
                            // under their outer fields.
                            categories: pivotChartReportToRows(activePivotChartReport)
                              .slice(1)
                              .map((row) => row[0] ?? ""),
                            categoryLevels: pivotChartReportCategoryLevels(activePivotChartReport) ?? undefined,
                            series: activePivotChartReport.series,
                          }
                        : pivotResultToChartData(
                            pivotResult,
                            pivotConfig.values.map((value) =>
                              pivotValueColumnLabel(value),
                            ),
                          )
                    }
                  />
                </div>
              ) : null}
              <table
                data-testid="spreadsheet-pivot-result"
                style={{
                  borderCollapse: "collapse",
                  fontSize: 12,
                  background: "var(--surface, #ffffff)",
                }}
              >
                <thead>
                  <tr>
                    {/* Top-left corner spanning the row-field columns. */}
                    <th
                      colSpan={Math.max(1, pivotConfig.rows.length)}
                      style={pivotHeaderCellStyle}
                    >
                      {pivotConfig.rows
                        .map((ci) => pivotFieldLabel(ci))
                        .join(" / ")}
                    </th>
                    {pivotResult.colHeaders.map((header, c) => (
                      <th key={c} style={pivotHeaderCellStyle}>
                        {[
                          ...header.columnValues,
                          pivotValueColumnLabel(
                            pivotConfig.values[header.valueIndex],
                          ),
                        ].join(" / ")}
                      </th>
                    ))}
                    {pivotConfig.values.length === 1 ? (
                      <th style={pivotHeaderCellStyle}>
                        {t("spreadsheet.pivotGrandTotal")}
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {pivotResult.rowHeaders.map((rowHeader, r) => {
                    // A per-outer-group subtotal row (Excel) sits AFTER its
                    // group's last leaf when `rowSubtotals` is on.
                    const subtotal = pivotResult.subtotals?.find(
                      (s) => s.afterRowIndex === r,
                    );
                    // Collapse (only when subtotals are on): a collapsed outer
                    // group hides its leaf rows; its subtotal stays as the
                    // collapsed representation with an expand toggle.
                    const outerValue = rowHeader[0] ?? "";
                    const collapsed = pivotResult.subtotals
                      ? pivotCollapsed.has(outerValue)
                      : false;
                    return (
                      <Fragment key={r}>
                        {collapsed ? null : (
                          <tr data-testid={`spreadsheet-pivot-row-data-${r}`}>
                            {pivotConfig.rows.length === 0 ? (
                              <th style={pivotHeaderCellStyle}>
                                {t("spreadsheet.pivotAll")}
                              </th>
                            ) : (
                              rowHeader.map((value, i) => (
                                <th key={i} style={pivotHeaderCellStyle}>
                                  {value === ""
                                    ? t("spreadsheet.pivotBlank")
                                    : value}
                                </th>
                              ))
                            )}
                            {pivotResult.cells[r].map((cell, c) => (
                              <td
                                key={c}
                                data-testid={`spreadsheet-pivot-cell-${r}-${c}`}
                                style={pivotBodyCellStyle}
                              >
                                {formatPivotCell(
                                  cell,
                                  pivotResult.colHeaders[c]?.valueIndex ?? 0,
                                )}
                              </td>
                            ))}
                            {pivotConfig.values.length === 1 ? (
                              <td
                                data-testid={`spreadsheet-pivot-rowtotal-${r}`}
                                style={pivotTotalCellStyle}
                              >
                                {/* The one value field's total, in that
                                    field's own format (27.586%, not
                                    0.275862069; user audit S-023). */}
                                {formatPivotCell(pivotResult.totals.column[r], 0)}
                              </td>
                            ) : null}
                          </tr>
                        )}
                        {subtotal ? (
                          <tr
                            data-testid={`spreadsheet-pivot-subtotal-${r}`}
                            style={{ fontWeight: 600 }}
                          >
                            <th
                              colSpan={Math.max(1, pivotConfig.rows.length)}
                              style={pivotTotalCellStyle}
                            >
                              {pivotConfig.showDrillButtons !== false ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    togglePivotCollapsed(subtotal.outerValue)
                                  }
                                  data-testid={`spreadsheet-pivot-collapse-${r}`}
                                  aria-label={t("spreadsheet.pivotToggleGroup")}
                                  aria-expanded={!collapsed}
                                  style={{
                                    marginRight: 4,
                                    border: "none",
                                    background: "none",
                                    cursor: "pointer",
                                    padding: 0,
                                    fontSize: 10,
                                  }}
                                >
                                  {collapsed ? (
                                    <ChevronRight aria-hidden="true" size={14} />
                                  ) : (
                                    <ChevronDown aria-hidden="true" size={14} />
                                  )}
                                </button>
                              ) : null}
                              {t("spreadsheet.pivotSubtotal", {
                                value: subtotal.outerValue,
                              })}
                            </th>
                            {subtotal.cells.map((cell, c) => (
                              <td
                                key={c}
                                data-testid={`spreadsheet-pivot-subtotal-cell-${r}-${c}`}
                                style={pivotTotalCellStyle}
                              >
                                {formatPivotCell(
                                  cell,
                                  pivotResult.colHeaders[c]?.valueIndex ?? 0,
                                )}
                              </td>
                            ))}
                            {pivotConfig.values.length === 1 ? (
                              <td style={pivotTotalCellStyle} />
                            ) : null}
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                  {/* Grand-total row. */}
                  <tr data-testid="spreadsheet-pivot-grand-row">
                    <th
                      colSpan={Math.max(1, pivotConfig.rows.length)}
                      style={pivotHeaderCellStyle}
                    >
                      {t("spreadsheet.pivotGrandTotal")}
                    </th>
                    {pivotResult.totals.row.map((cell, c) => (
                      <td
                        key={c}
                        data-testid={`spreadsheet-pivot-coltotal-${c}`}
                        style={pivotTotalCellStyle}
                      >
                        {formatPivotCell(
                          cell,
                          pivotResult.colHeaders[c]?.valueIndex ?? 0,
                        )}
                      </td>
                    ))}
                    {pivotConfig.values.length === 1 ? (
                      <td
                        data-testid="spreadsheet-pivot-grandtotal"
                        style={pivotTotalCellStyle}
                      >
                        {formatPivotCell(pivotResult.totals.grand[0], 0)}
                      </td>
                    ) : null}
                  </tr>
                </tbody>
              </table>
            </div>
          ) : pivotSourceColumns.length > 0 ? (
            <span
              data-testid="spreadsheet-pivot-no-values"
              style={{ fontSize: 12, color: "var(--muted, #6b7280)" }}
            >
              {t("spreadsheet.pivotPickValue")}
            </span>
          ) : null}
          </fieldset>
          </div>
        </div>
          )}
        />
        </OfficeDockedPane>
  );
}
