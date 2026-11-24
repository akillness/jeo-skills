"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useMemo, useRef, useState, type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import {
  ArrowDown,
  ArrowUp,
  Plus,
  Trash2,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import {
  MAX_CHART_CATEGORIES,
  MAX_CHART_SERIES,
  chartFormatFollowingDataEdit,
  clampChartText,
  validateChartBlockAttrsV2,
  withChartCategoryLevelsPicked,
  type ChartBlockAttrsV2,
  type ChartData,
  type ChartDisplayBlanksAs,
} from "@mrnote/core/web/components/console/editor/extensions/chartBlockShared.ts";
import {
  chartDisplayBlanksOptions,
  chartDisplayBlanksShown,
} from "@mrnote/core/web/lib/office-charts/chart-elements.ts";

export interface DocumentChartSelectDataDialogProps {
  readonly open: boolean;
  readonly canEdit: boolean;
  readonly locale: string;
  readonly initialAttrs: ChartBlockAttrsV2;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  /** The edited data, and the format with its per-series and per-category
   * references moved to follow the entries they belong to. */
  readonly onSubmit: (
    data: ChartData,
    format: ChartBlockAttrsV2["format"],
  ) => boolean;
  readonly onClose: () => void;
  /**
   * PowerPoint's Select Data Source (PPT-B019) on a chart whose data lives in
   * the chart itself: Excel's words for the dialog and its lists, Switch
   * Row/Column, and Hidden and Empty Cells... (the page of the dialog that
   * holds Show empty cells as, which PowerPoint keeps off the ribbon,
   * PPT-A150). Absent: the Docs dialog as it was.
   */
  readonly officeSource?: {
    /** The chart with its rows and columns switched, or null when it cannot be. */
    readonly switchRowColumn?: (attrs: ChartBlockAttrsV2) => ChartBlockAttrsV2 | null;
  };
}

// Every button inside an Office dialog is the shared chrome's button
// (OfficeDialogChrome.css), never a private recipe: same height, frame, hover
// and focus ring as the footer's Cancel.
const SECONDARY_BUTTON_CLASS = officeDialogParts.compactButton;
const ICON_BUTTON_CLASS = officeDialogParts.iconButton;

export function documentChartSupportsSelectData(
  attrs: ChartBlockAttrsV2,
): boolean {
  return ["category", "xy", "stock", "sample"].includes(attrs.data.kind);
}

function seriesCount(data: ChartData): number {
  if (
    data.kind === "category" ||
    data.kind === "xy" ||
    data.kind === "stock" ||
    data.kind === "sample"
  ) {
    return data.series.length;
  }
  return 0;
}

function seriesName(data: ChartData, index: number): string {
  if (
    data.kind === "category" ||
    data.kind === "xy" ||
    data.kind === "stock" ||
    data.kind === "sample"
  ) {
    return data.series[index]?.name ?? "";
  }
  return "";
}

function setSeriesName(
  data: ChartData,
  index: number,
  name: string,
): ChartData {
  const nextName = clampChartText(name);
  if (data.kind === "category") {
    return {
      ...data,
      series: data.series.map((entry, current) =>
        current === index ? { ...entry, name: nextName } : entry,
      ),
    };
  }
  if (data.kind === "xy") {
    return {
      ...data,
      series: data.series.map((entry, current) =>
        current === index ? { ...entry, name: nextName } : entry,
      ),
    };
  }
  if (data.kind === "stock") {
    return {
      ...data,
      series: data.series.map((entry, current) =>
        current === index ? { ...entry, name: nextName } : entry,
      ),
    };
  }
  if (data.kind === "sample") {
    return {
      ...data,
      series: data.series.map((entry, current) =>
        current === index ? { ...entry, name: nextName } : entry,
      ),
    };
  }
  return data;
}

function reorderSeries(
  data: ChartData,
  index: number,
  direction: -1 | 1,
): ChartData {
  const swap = <T,>(series: readonly T[]): T[] =>
    swapped(series, index, direction);
  if (data.kind === "category") {
    return { ...data, series: swap(data.series) };
  }
  if (data.kind === "xy") {
    return { ...data, series: swap(data.series) };
  }
  if (data.kind === "sample") {
    return { ...data, series: swap(data.series) };
  }
  return data;
}

function removeSeries(data: ChartData, index: number): ChartData {
  if (data.kind === "category") {
    return {
      ...data,
      series: data.series.filter((_, current) => current !== index),
    };
  }
  if (data.kind === "xy") {
    return {
      ...data,
      series: data.series.filter((_, current) => current !== index),
    };
  }
  if (data.kind === "sample") {
    return {
      ...data,
      series: data.series.filter((_, current) => current !== index),
    };
  }
  return data;
}

function addSeries(
  data: ChartData,
  chartType: ChartBlockAttrsV2["chartType"],
  label: string,
): ChartData {
  const name = `${label} ${seriesCount(data) + 1}`;
  if (data.kind === "category") {
    return {
      ...data,
      series: [
        ...data.series,
        {
          name,
          values: data.categories.map(() => 0),
          ...(chartType === "combo"
            ? { renderAs: "line" as const, axis: "primary" as const }
            : {}),
        },
      ],
    };
  }
  if (data.kind === "xy") {
    const first = data.series[0];
    const xValues = first?.xValues.length ? [...first.xValues] : [1, 2, 3];
    return {
      ...data,
      series: [
        ...data.series,
        {
          name,
          xValues,
          yValues: xValues.map(() => 0),
          ...(first?.bubbleSizes ? { bubbleSizes: xValues.map(() => 1) } : {}),
        },
      ],
    };
  }
  if (data.kind === "sample") {
    const length = data.series[0]?.values.length ?? 3;
    return {
      ...data,
      series: [
        ...data.series,
        { name, values: Array.from({ length }, () => 0) },
      ],
    };
  }
  return data;
}

/** Where each series and category of the draft stood in the chart as it
 * was opened (null: added in this dialog), so the format's references to
 * them can follow them. */
interface DataOrigins {
  readonly series: readonly (number | null)[];
  readonly categories: readonly (number | null)[];
}

function swapped<T>(list: readonly T[], index: number, direction: -1 | 1): T[] {
  const next = [...list];
  const target = index + direction;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function without<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, current) => current !== index);
}

function categories(data: ChartData): readonly string[] {
  return data.kind === "category" || data.kind === "stock"
    ? data.categories
    : [];
}

function setCategoryName(
  data: ChartData,
  index: number,
  label: string,
): ChartData {
  if (data.kind !== "category" && data.kind !== "stock") return data;
  const next = [...data.categories];
  next[index] = clampChartText(label);
  return { ...data, categories: next };
}

function addCategory(data: ChartData, label: string): ChartData {
  if (data.kind === "category") {
    // A multi-level axis's new last category joins the last group.
    return withChartCategoryLevelsPicked(
      data,
      {
        ...data,
        categories: [
          ...data.categories,
          `${label} ${data.categories.length + 1}`,
        ],
        series: data.series.map((entry) => ({
          ...entry,
          values: [...entry.values, 0],
        })),
      },
      [...data.categories.map((_, index) => index), null],
    );
  }
  if (data.kind === "stock") {
    return {
      ...data,
      categories: [
        ...data.categories,
        `${label} ${data.categories.length + 1}`,
      ],
      series: data.series.map((entry) => ({
        ...entry,
        values: [...entry.values, 0],
      })),
    };
  }
  return data;
}

function removeCategory(data: ChartData, index: number): ChartData {
  if (data.kind === "category") {
    // A multi-level axis's group label moves to the group's next category.
    return withChartCategoryLevelsPicked(
      data,
      {
        ...data,
        categories: data.categories.filter((_, current) => current !== index),
        series: data.series.map((entry) => ({
          ...entry,
          values: entry.values.filter((_, current) => current !== index),
        })),
      },
      data.categories.map((_, current) => current).filter((current) => current !== index),
    );
  }
  if (data.kind === "stock") {
    return {
      ...data,
      categories: data.categories.filter((_, current) => current !== index),
      series: data.series.map((entry) => ({
        ...entry,
        values: entry.values.filter((_, current) => current !== index),
      })),
    };
  }
  return data;
}

const BLANKS_WORDS: Record<ChartDisplayBlanksAs, string> = {
  gap: "office.chartDesign.blanksGap",
  zero: "office.chartDesign.blanksZero",
  span: "office.chartDesign.blanksSpan",
};

export function DocumentChartSelectDataDialog({
  open,
  canEdit,
  initialAttrs,
  returnFocusRef,
  onSubmit,
  onClose,
  officeSource,
}: DocumentChartSelectDataDialogProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const copy = useMemo(
    () => ({
      title: t("toolbar.chartSelectDataDialog.title"),
      description: t("toolbar.chartSelectDataDialog.description"),
      series: t("toolbar.chartSelectDataDialog.series"),
      category: t("toolbar.chartSelectDataDialog.category"),
      addSeries: t("toolbar.chartSelectDataDialog.addSeries"),
      addCategory: t("toolbar.chartSelectDataDialog.addCategory"),
      moveUp: t("toolbar.chartSelectDataDialog.moveUp"),
      moveDown: t("toolbar.chartSelectDataDialog.moveDown"),
      remove: t("toolbar.chartSelectDataDialog.remove"),
      roleLocked: t("toolbar.chartSelectDataDialog.roleLocked"),
      apply: t("toolbar.chartSelectDataDialog.apply"),
      cancel: t("toolbar.chartSelectDataDialog.cancel"),
      invalid: t("toolbar.chartSelectDataDialog.invalid"),
      stale: t("toolbar.chartSelectDataDialog.stale"),
      seriesLabel: t("toolbar.chartSelectDataDialog.seriesLabel"),
      categoryLabel: t("toolbar.chartSelectDataDialog.categoryLabel"),
    }),
    [t],
  );
  // The chart the draft's series and categories are counted from: the one
  // opened, or the one Switch Row/Column made of it in this dialog.
  const [base, setBase] = useState<ChartBlockAttrsV2>(initialAttrs);
  const [draft, setDraft] = useState<ChartData>(() => initialAttrs.data);
  // Hidden and Empty Cells... : the page shown, and the method it holds.
  const [hiddenPage, setHiddenPage] = useState<ChartDisplayBlanksAs | null>(null);
  const [blanks, setBlanks] = useState<ChartDisplayBlanksAs>(() =>
    chartDisplayBlanksShown(initialAttrs),
  );
  const [origins, setOrigins] = useState<DataOrigins>(() => ({
    series: Array.from(
      { length: seriesCount(initialAttrs.data) },
      (_, index) => index,
    ),
    categories: categories(initialAttrs.data).map((_, index) => index),
  }));
  const [error, setError] = useState<string | null>(null);
  const initialFocusRef = useRef<HTMLInputElement | null>(null);
  const count = seriesCount(draft);
  const categoryLabels = categories(draft);
  const seriesStructureLocked = draft.kind === "stock";
  const minimumSeries = base.chartType === "combo" ? 2 : 1;
  const maximumSeries =
    base.chartType === "pie" || base.chartType === "funnel"
      ? 1
      : MAX_CHART_SERIES;
  const canAddSeries =
    !seriesStructureLocked &&
    (draft.kind === "category" ||
      draft.kind === "xy" ||
      draft.kind === "sample") &&
    count < maximumSeries;
  // A series' paint, filter and label overrides go with it when another one
  // is removed or the order changes; they are not left on the position.
  const followed = chartFormatFollowingDataEdit(
    base.format,
    origins.series,
    draft.kind === "category" || draft.kind === "stock"
      ? origins.categories
      : null,
  );
  // Show empty cells as, stated only when the page changed what the chart draws.
  const format =
    officeSource && blanks !== chartDisplayBlanksShown(base)
      ? { ...followed, displayBlanksAs: blanks }
      : followed;
  const validation = validateChartBlockAttrsV2({
    ...base,
    data: draft,
    ...(format ? { format } : {}),
  });

  const switchRowColumn = () => {
    const switched = officeSource?.switchRowColumn?.({
      ...base,
      data: draft,
      ...(followed ? { format: followed } : {}),
    });
    if (!switched) return;
    // The switched chart is the new base: its series and categories are
    // counted from it, their formatting already moved with them.
    setBase(switched);
    setDraft(switched.data);
    setOrigins({
      series: Array.from({ length: seriesCount(switched.data) }, (_, index) => index),
      categories: categories(switched.data).map((_, index) => index),
    });
    setError(null);
  };
  const canSwitch =
    canEdit &&
    Boolean(officeSource?.switchRowColumn) &&
    draft.kind === "category" &&
    validation.valid;
  const blanksOptions = chartDisplayBlanksOptions({ ...base, data: draft });

  const updateDraft = (
    next: ChartData,
    moveOrigins?: (current: DataOrigins) => DataOrigins,
  ) => {
    if (next !== draft && moveOrigins) setOrigins(moveOrigins);
    setDraft(next);
    setError(null);
  };

  if (officeSource && hiddenPage !== null) {
    const forced = blanksOptions.length === 0;
    return (
      <OfficeDialogShell
        open={open}
        title={t("spreadsheet.selectDataSource.hiddenAndEmptyTitle")}
        description={t("spreadsheet.selectDataSource.hiddenAndEmptyDescription")}
        defaultActionLabel={copy.apply}
        cancelActionLabel={copy.cancel}
        defaultActionDisabled={!canEdit}
        onDefaultAction={() => {
          setBlanks(hiddenPage);
          setHiddenPage(null);
        }}
        onCancel={() => setHiddenPage(null)}
        testIdPrefix="document-chart-select-data-hidden-page"
        className="sm:max-w-[460px]"
      >
        <fieldset className={officeDialogParts.group}>
          <legend className={officeDialogParts.sectionTitle}>
            {t("spreadsheet.selectDataSource.showEmptyCellsAs")}
          </legend>
          {(["gap", "zero", "span"] as const).map((method) => (
            <label key={method} className={officeDialogParts.check}>
              <input
                type="radio"
                name="document-chart-select-data-blanks"
                checked={hiddenPage === method}
                disabled={!canEdit || !blanksOptions.includes(method)}
                onChange={() => setHiddenPage(method)}
                data-testid={`document-chart-select-data-blanks-${method}`}
              />
              {t(BLANKS_WORDS[method])}
            </label>
          ))}
          {forced ? (
            <p className={officeDialogParts.hint}>
              {t("office.chartDesign.blanksForcedZero")}
            </p>
          ) : null}
        </fieldset>
      </OfficeDialogShell>
    );
  }

  return (
    <OfficeDialogShell
      open={open}
      title={officeSource ? t("spreadsheet.selectDataSource.title") : copy.title}
      description={copy.description}
      defaultActionLabel={copy.apply}
      cancelActionLabel={copy.cancel}
      defaultActionDisabled={!canEdit || !validation.valid}
      onDefaultAction={() => {
        if (!canEdit || !validation.valid) return;
        // Nothing changed only when the data AND the formatting that follows
        // each series are the same: two identical series swapped leave the
        // data as it was but move their colours.
        if (
          base === initialAttrs &&
          JSON.stringify(draft) === JSON.stringify(initialAttrs.data) &&
          JSON.stringify(format ?? null) ===
            JSON.stringify(initialAttrs.format ?? null)
        ) {
          onClose();
          return;
        }
        if (onSubmit(draft, format)) onClose();
        else setError(copy.stale);
      }}
      onCancel={onClose}
      initialFocusRef={initialFocusRef}
      returnFocusRef={returnFocusRef}
      testIdPrefix="document-chart-select-data"
      className="sm:max-w-[760px]"
      footerStart={
        officeSource ? (
          <button
            type="button"
            className={officeDialogParts.button}
            onClick={() => setHiddenPage(blanks)}
            data-testid="document-chart-select-data-hidden-empty"
          >
            {t("spreadsheet.selectDataSource.hiddenAndEmptyCells")}...
          </button>
        ) : undefined
      }
    >
      {officeSource?.switchRowColumn ? (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <button
            type="button"
            className={SECONDARY_BUTTON_CLASS}
            disabled={!canSwitch}
            onClick={switchRowColumn}
            data-testid="document-chart-select-data-switch"
          >
            {t("office.chartDesign.switchRowColumn")}
          </button>
        </div>
      ) : null}
      <section
        className={officeDialogParts.group}
        aria-labelledby="document-chart-series-heading"
      >
        <div className="flex min-h-8 items-center justify-between gap-3">
          <h3
            id="document-chart-series-heading"
            className={officeDialogParts.sectionTitle}
          >
            {officeSource
              ? t("spreadsheet.selectDataSource.legendEntries")
              : copy.series}
          </h3>
          <button
            type="button"
            className={SECONDARY_BUTTON_CLASS}
            disabled={!canEdit || !canAddSeries}
            data-testid="document-chart-select-data-add-series"
            onClick={() =>
              updateDraft(
                addSeries(draft, base.chartType, copy.seriesLabel),
                (current) => ({ ...current, series: [...current.series, null] }),
              )
            }
          >
            <Plus aria-hidden="true" size={14} />
            {copy.addSeries}
          </button>
        </div>
        <div className="grid max-h-52 gap-1.5 overflow-y-auto">
          {Array.from({ length: count }, (_, index) => (
            <div
              key={index}
              className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-1.5"
            >
              <label
                className="sr-only"
                htmlFor={`document-chart-series-${index}`}
              >
                {copy.seriesLabel} {index + 1}
              </label>
              <input
                ref={index === 0 ? initialFocusRef : undefined}
                id={`document-chart-series-${index}`}
                value={seriesName(draft, index)}
                disabled={!canEdit}
                maxLength={200}
                className="min-w-0"
                data-testid={`document-chart-select-data-series-${index}`}
                onChange={(event) =>
                  updateDraft(setSeriesName(draft, index, event.target.value))
                }
              />
              <button
                type="button"
                className={ICON_BUTTON_CLASS}
                aria-label={`${copy.moveUp} ${index + 1}`}
                title={copy.moveUp}
                disabled={!canEdit || seriesStructureLocked || index === 0}
                data-testid={`document-chart-select-data-series-up-${index}`}
                onClick={() =>
                  updateDraft(reorderSeries(draft, index, -1), (current) => ({
                    ...current,
                    series: swapped(current.series, index, -1),
                  }))
                }
              >
                <ArrowUp aria-hidden="true" size={14} />
              </button>
              <button
                type="button"
                className={ICON_BUTTON_CLASS}
                aria-label={`${copy.moveDown} ${index + 1}`}
                title={copy.moveDown}
                disabled={
                  !canEdit || seriesStructureLocked || index >= count - 1
                }
                data-testid={`document-chart-select-data-series-down-${index}`}
                onClick={() =>
                  updateDraft(reorderSeries(draft, index, 1), (current) => ({
                    ...current,
                    series: swapped(current.series, index, 1),
                  }))
                }
              >
                <ArrowDown aria-hidden="true" size={14} />
              </button>
              <button
                type="button"
                className={ICON_BUTTON_CLASS}
                aria-label={`${copy.remove} ${index + 1}`}
                title={copy.remove}
                disabled={
                  !canEdit || seriesStructureLocked || count <= minimumSeries
                }
                data-testid={`document-chart-select-data-series-remove-${index}`}
                onClick={() =>
                  updateDraft(removeSeries(draft, index), (current) => ({
                    ...current,
                    series: without(current.series, index),
                  }))
                }
              >
                <Trash2 aria-hidden="true" size={14} />
              </button>
            </div>
          ))}
        </div>
        {seriesStructureLocked ? (
          <p className={officeDialogParts.hint}>{copy.roleLocked}</p>
        ) : null}
      </section>

      {categoryLabels.length > 0 ? (
        <section
          className={officeDialogParts.group}
          aria-labelledby="document-chart-categories-heading"
        >
          <div className="flex min-h-8 items-center justify-between gap-3">
            <h3
              id="document-chart-categories-heading"
              className={officeDialogParts.sectionTitle}
            >
              {officeSource
                ? t("spreadsheet.selectDataSource.axisLabels")
                : copy.category}
            </h3>
            <button
              type="button"
              className={SECONDARY_BUTTON_CLASS}
              disabled={
                !canEdit || categoryLabels.length >= MAX_CHART_CATEGORIES
              }
              data-testid="document-chart-select-data-add-category"
              onClick={() =>
                updateDraft(addCategory(draft, copy.categoryLabel), (current) => ({
                  ...current,
                  categories: [...current.categories, null],
                }))
              }
            >
              <Plus aria-hidden="true" size={14} />
              {copy.addCategory}
            </button>
          </div>
          <div className="grid max-h-44 gap-1.5 overflow-y-auto sm:grid-cols-2">
            {categoryLabels.map((label, index) => (
              <div
                key={index}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5"
              >
                <label
                  className="sr-only"
                  htmlFor={`document-chart-category-${index}`}
                >
                  {copy.category} {index + 1}
                </label>
                <input
                  id={`document-chart-category-${index}`}
                  value={label}
                  disabled={!canEdit}
                  maxLength={200}
                  className="min-w-0"
                  data-testid={`document-chart-select-data-category-${index}`}
                  onChange={(event) =>
                    updateDraft(
                      setCategoryName(draft, index, event.target.value),
                    )
                  }
                />
                <button
                  type="button"
                  className={ICON_BUTTON_CLASS}
                  aria-label={`${copy.remove} ${index + 1}`}
                  title={copy.remove}
                  disabled={!canEdit || categoryLabels.length <= 1}
                  data-testid={`document-chart-select-data-category-remove-${index}`}
                  onClick={() =>
                    updateDraft(removeCategory(draft, index), (current) => ({
                      ...current,
                      categories: without(current.categories, index),
                    }))
                  }
                >
                  <Trash2 aria-hidden="true" size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {!validation.valid ? (
        <p
          role="alert"
          className={officeDialogParts.error}
          data-testid="document-chart-select-data-error"
        >
          {copy.invalid}
        </p>
      ) : error ? (
        <p
          role="alert"
          className={officeDialogParts.error}
          data-testid="document-chart-select-data-error"
        >
          {error}
        </p>
      ) : null}
    </OfficeDialogShell>
  );
}
