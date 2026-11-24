"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { ReactNode, RefObject } from "react";
import {
  ArrowDown,
  ArrowUp,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as dialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import type { ChartDisplayBlanksAs } from "@mrnote/core/web/components/console/editor/extensions/chartBlockShared.ts";
import type {
  SelectDataSeriesAbilities,
  SelectDataSeriesRow,
} from "../../../../lib/spreadsheet/chart-select-data-source";

import { SpreadsheetCollapseDialogButton } from "./SpreadsheetRangePicker";
import { SpreadsheetDialogIcon, type SpreadsheetDialogIconName } from "@mrnote/core/web/components/notebook/contents/spreadsheet/SpreadsheetDialogIcon.tsx";

/** The legend and axis list commands' pictures. */
const COMMAND_ICON: Record<string, SpreadsheetDialogIconName> = {
  "spreadsheet-chart-data-series-add": "add",
  "spreadsheet-chart-data-series-edit": "edit",
  "spreadsheet-chart-data-series-remove": "delete",
  "spreadsheet-chart-data-axis-edit": "edit",
};

/**
 * Chart Design > Select Data: Excel's Select Data Source (XLS-A072). The
 * Chart data range with its RefEdit, Switch Row/Column, the Legend Entries
 * (Series) list with Add / Edit / Remove / Move Up / Move Down, the
 * Horizontal (Category) Axis Labels with Edit, and Hidden and Empty Cells.
 * Excel opens Edit Series, Axis Labels and Hidden and Empty Cell Settings as
 * dialogs over this one; here they are pages of the same modal (`page`), so
 * one focus trap and one Escape path serve them all. OK on a page returns to
 * the main page; OK there applies everything in one step.
 *
 * The draft lives with the host (the sheet follows a range pick into it);
 * this component draws it and reports edits.
 */

export type SelectDataSourcePage = "main" | "series" | "axis" | "hidden";
export type SelectDataSourceField = "range" | "name" | "values" | "xValues" | "axis";

export interface SelectDataSourceDraft {
  readonly range: string;
  readonly byRows: boolean;
  readonly rows: readonly SelectDataSeriesRow[];
  readonly categories: string;
  /** The series were edited one by one (they no longer follow the range). */
  readonly seriesEdited: boolean;
  readonly selected: number;
  readonly displayBlanksAs: ChartDisplayBlanksAs;
  /** Show data in hidden rows and columns (`c:plotVisOnly` false), and the
   *  Hidden and Empty Cell Settings page's box for it. */
  readonly showHidden: boolean;
  readonly showHiddenDraft: boolean;
  /** Show #N/A as an empty cell (`c16r3:dispNaAsBlank`), and its page box. */
  readonly naAsBlank: boolean;
  readonly naAsBlankDraft: boolean;
  readonly page: SelectDataSourcePage;
  /** Edit Series' boxes; `index` null is Add. */
  readonly seriesDraft: {
    readonly index: number | null;
    readonly name: string;
    readonly values: string;
    readonly xValues: string;
  } | null;
  readonly axisDraft: string;
  readonly blanksDraft: ChartDisplayBlanksAs;
  readonly pageError: string | null;
}

/** The draft with one reference box's text replaced (a Collapse Dialog
 * pick following the sheet selection, or typing in its bar). */
export function selectDataDraftWithField(
  draft: SelectDataSourceDraft,
  field: SelectDataSourceField,
  text: string,
): SelectDataSourceDraft {
  if (field === "range") return { ...draft, range: text };
  if (field === "axis") return { ...draft, axisDraft: text, pageError: null };
  const series = draft.seriesDraft;
  if (!series) return draft;
  return {
    ...draft,
    pageError: null,
    seriesDraft:
      field === "name"
        ? { ...series, name: text }
        : field === "values"
          ? { ...series, values: text }
          : { ...series, xValues: text },
  };
}

export interface SelectDataSourceView {
  readonly abilities: SelectDataSeriesAbilities;
  /** The Legend Entries' names, as the chart would read them. */
  readonly seriesLabels: readonly string[];
  /** The Horizontal (Category) Axis Labels, as read. */
  readonly axisLabels: readonly string[];
  /** Show empty cells as: the methods the chart's family takes ([] = always zero). */
  readonly blanksOptions: readonly ChartDisplayBlanksAs[];
  /** Show data in hidden rows and columns, as the chart states it. */
  readonly showHiddenData: boolean;
  /** Whether Switch Row/Column can lay the range the other way. */
  readonly canSwitch: boolean;
  /** Whether the range box holds a range (or nothing) OK can take. */
  readonly rangeValid: boolean;
  readonly error: string | null;
}

export interface SpreadsheetSelectDataSourceDialogProps {
  readonly open: boolean;
  readonly draft: SelectDataSourceDraft | null;
  readonly view: SelectDataSourceView | null;
  readonly translate: (key: string, values?: Record<string, string | number>) => string;
  readonly onRangeChange: (range: string) => void;
  readonly onSwitchRowColumn: () => void;
  readonly onDraftChange: (patch: Partial<SelectDataSourceDraft>) => void;
  /** Edit Series' or Axis Labels' OK: the host reads the boxes. */
  readonly onPageSubmit: () => void;
  readonly onRemoveSeries: () => void;
  /** Move Up (-1) / Move Down (1) on the selected series. */
  readonly onMoveSeries: (delta: -1 | 1) => void;
  readonly onPick: (field: SelectDataSourceField) => void;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
  readonly initialFocusRef: RefObject<HTMLInputElement | null>;
  readonly returnFocusRef: RefObject<HTMLButtonElement | null>;
}

const BLANKS_WORDS: Record<ChartDisplayBlanksAs, string> = {
  gap: "office.chartDesign.blanksGap",
  zero: "office.chartDesign.blanksZero",
  span: "office.chartDesign.blanksSpan",
};

export function SpreadsheetSelectDataSourceDialog({
  open,
  draft,
  view,
  translate: t,
  onRangeChange,
  onSwitchRowColumn,
  onDraftChange,
  onPageSubmit,
  onRemoveSeries,
  onMoveSeries,
  onPick,
  onSubmit,
  onCancel,
  initialFocusRef,
  returnFocusRef,
}: SpreadsheetSelectDataSourceDialogProps) {
  const page = draft?.page ?? "main";
  const abilities = view?.abilities;
  const count = draft?.rows.length ?? 0;
  const selected = draft?.selected ?? -1;
  const lockReason =
    abilities?.lock === "derived"
      ? t("spreadsheet.selectDataSource.reasonDerived")
      : abilities?.lock === "references"
        ? t("spreadsheet.selectDataSource.reasonReferences")
        : null;
  const countReason = abilities?.countLocked && !lockReason
    ? t("spreadsheet.selectDataSource.reasonCombination")
    : null;
  const addReason = lockReason ?? countReason;
  const editReason = lockReason ?? (selected < 0 || selected >= count ? "" : null);
  // Remove and Move Up / Move Down: the chart's format follows its series;
  // an imported chart's save moves each series' own c:ser with it
  // (XLS-A072, `chart_series_rewrite`). A chart keeps one series.
  const picked = selected >= 0 && selected < count;
  const removeReason =
    lockReason ??
    countReason ??
    // The one series left is kept: say that, not the rule for removing
    // among several, which it already meets (user audit S-016).
    (count <= 1
      ? t("spreadsheet.selectDataSource.reasonKeepOneSeries")
      : picked
        ? null
        : "");
  const orderReason = (delta: -1 | 1): string | null =>
    lockReason ??
    countReason ??
    (picked && selected + delta >= 0 && selected + delta < count ? null : "");
  const axisReason =
    lockReason ??
    (abilities?.xy ? t("spreadsheet.selectDataSource.reasonXyAxis") : null);

  const refField = (
    field: SelectDataSourceField,
    label: string,
    value: string,
    onChange: (value: string) => void,
    focusRef?: RefObject<HTMLInputElement | null>,
  ) => (
    <label className={dialogParts.field}>
      <span className={dialogParts.label}>{label}</span>
      <span style={{ display: "flex", gap: 4 }}>
        <input
          ref={focusRef}
          className={dialogParts.mono}
          value={value}
          aria-invalid={draft?.pageError ? true : undefined}
          onChange={(event) => onChange(event.target.value)}
          data-testid={`spreadsheet-chart-data-${field}`}
          style={{ flex: 1, minWidth: 0 }}
        />
        <SpreadsheetCollapseDialogButton
          label={t("spreadsheet.cfDialog.collapse")}
          onClick={() => onPick(field)}
          testId={`spreadsheet-chart-data-${field}-pick`}
        />
      </span>
    </label>
  );

  const pageError = draft?.pageError ? (
    <p role="alert" className={dialogParts.error} data-testid="spreadsheet-chart-data-page-error">
      {draft.pageError}
    </p>
  ) : null;

  if (page === "series" && draft?.seriesDraft) {
    const series = draft.seriesDraft;
    return (
      <OfficeDialogShell
        open={open}
        title={t("spreadsheet.selectDataSource.editSeriesTitle")}
        description={t("spreadsheet.selectDataSource.editSeriesDescription")}
        defaultActionLabel={t("spreadsheet.fmtOk")}
        cancelActionLabel={t("common.cancel")}
        onDefaultAction={onPageSubmit}
        onCancel={() => onDraftChange({ page: "main", seriesDraft: null, pageError: null })}
        initialFocusRef={initialFocusRef}
        testIdPrefix="spreadsheet-chart-data-series-page"
        className="sm:max-w-[460px]"
      >
        {refField("name", t("spreadsheet.selectDataSource.seriesName"), series.name,
          (name) => onDraftChange({ seriesDraft: { ...series, name }, pageError: null }), initialFocusRef)}
        {abilities?.xy
          ? refField("xValues", t("spreadsheet.selectDataSource.seriesXValues"), series.xValues,
              (xValues) => onDraftChange({ seriesDraft: { ...series, xValues }, pageError: null }))
          : null}
        {refField("values",
          t(abilities?.xy ? "spreadsheet.selectDataSource.seriesYValues" : "spreadsheet.selectDataSource.seriesValues"),
          series.values,
          (values) => onDraftChange({ seriesDraft: { ...series, values }, pageError: null }))}
        {pageError}
      </OfficeDialogShell>
    );
  }

  if (page === "axis" && draft) {
    return (
      <OfficeDialogShell
        open={open}
        title={t("spreadsheet.selectDataSource.axisLabelsTitle")}
        description={t("spreadsheet.selectDataSource.axisLabelsDescription")}
        defaultActionLabel={t("spreadsheet.fmtOk")}
        cancelActionLabel={t("common.cancel")}
        onDefaultAction={onPageSubmit}
        onCancel={() => onDraftChange({ page: "main", pageError: null })}
        initialFocusRef={initialFocusRef}
        testIdPrefix="spreadsheet-chart-data-axis-page"
        className="sm:max-w-[460px]"
      >
        {refField("axis", t("spreadsheet.selectDataSource.axisLabelRange"), draft.axisDraft,
          (axisDraft) => onDraftChange({ axisDraft, pageError: null }), initialFocusRef)}
        {pageError}
      </OfficeDialogShell>
    );
  }

  if (page === "hidden" && draft && view) {
    const forced = view.blanksOptions.length === 0;
    return (
      <OfficeDialogShell
        open={open}
        title={t("spreadsheet.selectDataSource.hiddenAndEmptyTitle")}
        description={t("spreadsheet.selectDataSource.hiddenAndEmptyDescription")}
        defaultActionLabel={t("spreadsheet.fmtOk")}
        cancelActionLabel={t("common.cancel")}
        onDefaultAction={() => onDraftChange({ page: "main", displayBlanksAs: draft.blanksDraft, showHidden: draft.showHiddenDraft, naAsBlank: draft.naAsBlankDraft })}
        onCancel={() => onDraftChange({ page: "main", blanksDraft: draft.displayBlanksAs, showHiddenDraft: draft.showHidden, naAsBlankDraft: draft.naAsBlank })}
        testIdPrefix="spreadsheet-chart-data-hidden-page"
        className="sm:max-w-[460px]"
      >
        <fieldset className={dialogParts.group} title={forced ? t("office.chartDesign.blanksForcedZero") : undefined}>
          <legend className={dialogParts.sectionTitle}>{t("spreadsheet.selectDataSource.showEmptyCellsAs")}</legend>
          {(["gap", "zero", "span"] as const).map((method) => {
            const available = view.blanksOptions.includes(method);
            return (
              <label key={method} className={dialogParts.check}>
                <input
                  type="radio"
                  name="spreadsheet-chart-data-blanks"
                  checked={draft.blanksDraft === method}
                  disabled={!available}
                  onChange={() => onDraftChange({ blanksDraft: method })}
                  data-testid={`spreadsheet-chart-data-blanks-${method}`}
                />
                {t(BLANKS_WORDS[method])}
              </label>
            );
          })}
          {forced ? <p className={dialogParts.hint}>{t("office.chartDesign.blanksForcedZero")}</p> : null}
        </fieldset>
        <label className={dialogParts.check}>
          <input
            type="checkbox"
            checked={draft.showHiddenDraft}
            onChange={(event) => onDraftChange({ showHiddenDraft: event.target.checked })}
            data-testid="spreadsheet-chart-data-show-hidden"
          />
          {t("spreadsheet.selectDataSource.showHiddenData")}
        </label>
        <label className={dialogParts.check}>
          <input
            type="checkbox"
            checked={draft.naAsBlankDraft}
            onChange={(event) => onDraftChange({ naAsBlankDraft: event.target.checked })}
            data-testid="spreadsheet-chart-data-na-as-empty"
          />
          {t("spreadsheet.selectDataSource.showNaAsEmpty")}
        </label>
      </OfficeDialogShell>
    );
  }

  const commandButton = (
    testId: string,
    label: string,
    reason: string | null,
    onClick: () => void,
    icon?: ReactNode,
  ) => (
    <button
      type="button"
      className={icon ? dialogParts.iconButton : dialogParts.compactButton}
      disabled={reason !== null}
      title={reason || label}
      aria-label={icon ? label : undefined}
      onClick={onClick}
      data-testid={testId}
    >
      {icon ?? (
        <>
          {COMMAND_ICON[testId] ? <SpreadsheetDialogIcon name={COMMAND_ICON[testId]} /> : null}
          {label}
        </>
      )}
    </button>
  );

  return (
    <OfficeDialogShell
      open={open}
      title={t("spreadsheet.selectDataSource.title")}
      description={t("spreadsheet.selectDataSource.description")}
      defaultActionLabel={t("spreadsheet.fmtOk")}
      cancelActionLabel={t("common.cancel")}
      defaultActionDisabled={!view?.rangeValid}
      onDefaultAction={onSubmit}
      onCancel={onCancel}
      initialFocusRef={initialFocusRef}
      returnFocusRef={returnFocusRef}
      testIdPrefix="spreadsheet-chart-data"
      className="sm:max-w-[640px]"
      footerStart={
        <button
          type="button"
          className={dialogParts.button}
          onClick={() => onDraftChange({ page: "hidden", blanksDraft: draft?.displayBlanksAs ?? "gap" })}
          data-testid="spreadsheet-chart-data-hidden-empty"
        >
          <SpreadsheetDialogIcon name="hiddenCells" />
          {t("spreadsheet.selectDataSource.hiddenAndEmptyCells")}
        </button>
      }
    >
      {refField("range", t("spreadsheet.uiCopy.chartDataRange"), draft?.range ?? "", onRangeChange, initialFocusRef)}
      {draft && !draft.range.trim() && count > 0 ? (
        <p className={dialogParts.hint} data-testid="spreadsheet-chart-data-too-complex">
          {t("spreadsheet.selectDataSource.tooComplex")}
        </p>
      ) : null}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <button
          type="button"
          className={dialogParts.compactButton}
          disabled={!view?.canSwitch}
          onClick={onSwitchRowColumn}
          data-testid="spreadsheet-chart-data-switch"
        >
          <SpreadsheetDialogIcon name="switchRowColumn" />
          {t("office.chartDesign.switchRowColumn")}
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 12 }}>
        <section className={dialogParts.group} aria-labelledby="spreadsheet-chart-data-series-heading">
          <h3 id="spreadsheet-chart-data-series-heading" className={dialogParts.sectionTitle}>
            {t("spreadsheet.selectDataSource.legendEntries")}
          </h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {commandButton("spreadsheet-chart-data-series-add", t("spreadsheet.selectDataSource.add"), addReason, () =>
              onDraftChange({ page: "series", seriesDraft: { index: null, name: "", values: "={1}", xValues: "" }, pageError: null }))}
            {commandButton("spreadsheet-chart-data-series-edit", t("spreadsheet.selectDataSource.edit"), editReason, () => {
              const row = draft?.rows[selected];
              if (row) {
                onDraftChange({
                  page: "series",
                  seriesDraft: { index: selected, name: row.name, values: row.values, xValues: row.xValues ?? "" },
                  pageError: null,
                });
              }
            })}
            {commandButton("spreadsheet-chart-data-series-remove", t("spreadsheet.selectDataSource.remove"), removeReason, onRemoveSeries)}
            {commandButton("spreadsheet-chart-data-series-up", t("spreadsheet.selectDataSource.moveUp"), orderReason(-1), () => onMoveSeries(-1),
              <ArrowUp aria-hidden="true" size={14} />)}
            {commandButton("spreadsheet-chart-data-series-down", t("spreadsheet.selectDataSource.moveDown"), orderReason(1), () => onMoveSeries(1),
              <ArrowDown aria-hidden="true" size={14} />)}
          </div>
          <div
            role="listbox"
            aria-labelledby="spreadsheet-chart-data-series-heading"
            className={dialogParts.list}
            style={{ maxHeight: 180, overflowY: "auto" }}
            data-testid="spreadsheet-chart-data-series-list"
          >
            {(view?.seriesLabels ?? []).map((label, index) => (
              <button
                key={index}
                type="button"
                role="option"
                aria-selected={index === selected}
                className={dialogParts.listItem}
                onClick={() => onDraftChange({ selected: index })}
                onDoubleClick={() => {
                  const row = draft?.rows[index];
                  if (row && !lockReason) {
                    onDraftChange({
                      selected: index,
                      page: "series",
                      seriesDraft: { index, name: row.name, values: row.values, xValues: row.xValues ?? "" },
                      pageError: null,
                    });
                  }
                }}
                data-testid={`spreadsheet-chart-data-series-${index}`}
              >
                {label}
              </button>
            ))}
          </div>
          {lockReason ? <p className={dialogParts.hint}>{lockReason}</p> : null}
        </section>
        <section className={dialogParts.group} aria-labelledby="spreadsheet-chart-data-axis-heading">
          <h3 id="spreadsheet-chart-data-axis-heading" className={dialogParts.sectionTitle}>
            {t("spreadsheet.selectDataSource.axisLabels")}
          </h3>
          <div style={{ display: "flex", gap: 4 }}>
            {commandButton("spreadsheet-chart-data-axis-edit", t("spreadsheet.selectDataSource.edit"), axisReason, () =>
              onDraftChange({ page: "axis", axisDraft: draft?.categories ?? "", pageError: null }))}
          </div>
          <ul
            className={dialogParts.list}
            style={{ maxHeight: 180, overflowY: "auto", margin: 0, padding: 0, listStyle: "none" }}
            data-testid="spreadsheet-chart-data-axis-list"
          >
            {(view?.axisLabels ?? []).map((label, index) => (
              <li key={index} className={dialogParts.listItem} style={{ cursor: "default" }}>
                {label}
              </li>
            ))}
          </ul>
        </section>
      </div>
      {view?.error ? (
        <p role="alert" className={dialogParts.error} data-testid="spreadsheet-chart-data-error">
          {view.error}
        </p>
      ) : null}
    </OfficeDialogShell>
  );
}
