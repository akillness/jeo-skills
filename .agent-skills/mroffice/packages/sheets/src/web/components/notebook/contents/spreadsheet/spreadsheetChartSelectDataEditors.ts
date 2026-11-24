"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { type SpreadsheetChartBinding } from "@mrnote/core/web/lib/spreadsheet/chart-v2-model.ts";
import { chartDisplayBlanksShown, chartDisplayBlanksOptions } from "@mrnote/core/web/lib/office-charts/chart-elements.ts";
import type { ChartBlockAttrsV2 } from "@mrnote/core/web/components/console/editor/extensions/chartBlockShared.ts";
import { normalizeChartVisibility } from "@mrnote/core/web/lib/spreadsheet/chart-visibility.ts";
import { normalizeChartRange, chartRangeSheetName, chartRangeToA1, chartSourceRangeToA1 } from "@mrnote/core/web/lib/spreadsheet/chart-config.ts";
import { drawingChartSheetPrefix } from "@mrnote/core/web/lib/spreadsheet/drawing-chart-series.ts";
import { normalizeChartSeriesRefs, type SpreadsheetChartType } from "@mrnote/core/web/lib/spreadsheet/chart.ts";
import { drawingChartSeriesRefsForRange, drawingChartSourceOf, drawingChartDefaultSeriesInColumns, nativeChartSeriesRefsForRange } from "@mrnote/core/web/lib/spreadsheet/drawing-chart-series.ts";
import { selectDataRowsFromRefs, selectDataCategoriesOf, type SelectDataSeriesRow, selectDataRefsFromRows, selectDataRangeOfRefs, selectDataSeriesName, selectDataReference } from "../../../../lib/spreadsheet/chart-select-data-source";
import { type SelectDataSourceDraft, type SelectDataSourceField } from "./SpreadsheetSelectDataSourceDialog";
import { type ChartDesignDialogAuthority } from "./spreadsheetMutationReceipts";
import { type Dispatch, type SetStateAction } from "react";

/** What spreadsheetChartSelectDataEditors reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetChartSelectDataEditorsInputs {
  captureChartDesignAuthority: () => ChartDesignDialogAuthority | null;
  selectDataByRefs: (authority: ChartDesignDialogAuthority) => boolean;
  selectDataChartType: (authority: ChartDesignDialogAuthority) => SpreadsheetChartType;
  selectDataDefaultPrefix: (authority: ChartDesignDialogAuthority) => string;
  selectDataSheetExists: (name: string) => boolean;
  selectDataXy: (authority: ChartDesignDialogAuthority) => boolean;
  setChartDataDialog: Dispatch<SetStateAction<{ authority: ChartDesignDialogAuthority; draft: SelectDataSourceDraft; initial: { range: string; byRows: boolean; displayBlanksAs: SelectDataSourceDraft["displayBlanksAs"]; showHidden: boolean; naAsBlank: boolean; }; blanksOptions: readonly SelectDataSourceDraft["displayBlanksAs"][]; picking: { field: SelectDataSourceField; r1: number; c1: number; r2: number; c2: number; sheetId: string; } | null; error: string | null; } | null>>;
  sheetChartModelOf: (authority: ChartDesignDialogAuthority) => { attrs: ChartBlockAttrsV2; binding?: SpreadsheetChartBinding; } | null;
  /** A chart born here: the label lines Excel reads in a typed range (no
   * category column, no row of names), laid by columns or by rows. */
  selectDataRangeLabels?: (
    authority: ChartDesignDialogAuthority,
    range: NonNullable<ReturnType<typeof normalizeChartRange>>,
    byRows: boolean,
    prefix?: string,
  ) => { noCategories?: true; noSeriesNames?: true };
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function spreadsheetChartSelectDataEditors({
  captureChartDesignAuthority,
  selectDataByRefs,
  selectDataChartType,
  selectDataDefaultPrefix,
  selectDataSheetExists,
  selectDataXy,
  setChartDataDialog,
  sheetChartModelOf,
  selectDataRangeLabels,
  t,
}: SpreadsheetChartSelectDataEditorsInputs) {
  // An imported chart's series as a range lays them (a range typed in the
  // box replaces every series, as in Excel), or null when it lays none.
  const selectDataLaid = (
    authority: ChartDesignDialogAuthority,
    draft: SelectDataSourceDraft,
    range: NonNullable<ReturnType<typeof normalizeChartRange>>,
    byRows: boolean,
    // The sheet a typed range named, when it named one the workbook has.
    prefix?: string,
  ): SelectDataSourceDraft | null => {
    // A chart born here lays the range by Excel's label rule, as its OK
    // writes it; an imported chart by the series' usual layout.
    const labels = authority.kind === "native" ? selectDataRangeLabels?.(authority, range, byRows, prefix) : undefined;
    const refs = labels
      ? nativeChartSeriesRefsForRange(
          prefix ?? selectDataDefaultPrefix(authority),
          { range, ...(byRows ? { seriesInColumns: false } : {}), ...labels },
          !byRows,
          selectDataChartType(authority),
        )
      : drawingChartSeriesRefsForRange(
          prefix ?? selectDataDefaultPrefix(authority),
          range,
          !byRows,
          selectDataChartType(authority),
        );
    if (!refs) return null;
    return {
      ...draft,
      byRows,
      rows: selectDataRowsFromRefs(refs),
      categories: selectDataXy(authority) ? "" : selectDataCategoriesOf(refs),
      seriesEdited: false,
      selected: Math.min(Math.max(draft.selected, 0), refs.length - 1),
    };
  };
  // The series edited one by one: the range box shows the one range they
  // are laid over, or nothing (Excel's "too complex").
  const selectDataWithRows = (
    authority: ChartDesignDialogAuthority,
    draft: SelectDataSourceDraft,
    rows: readonly SelectDataSeriesRow[],
    categories: string,
    selected: number,
  ): SelectDataSourceDraft => {
    const built = selectDataRefsFromRows(rows, categories, {
      xy: selectDataXy(authority),
      defaultPrefix: selectDataDefaultPrefix(authority),
      sheetExists: selectDataSheetExists,
    });
    const laid = "refs" in built ? selectDataRangeOfRefs(built.refs, selectDataChartType(authority)) : null;
    return {
      ...draft,
      rows,
      categories,
      selected,
      seriesEdited: true,
      range: laid ? chartRangeToA1(laid.range) : "",
      byRows: laid ? laid.byRows : draft.byRows,
      page: "main",
      seriesDraft: null,
      pageError: null,
    };
  };
  const openChartDataDialog = (): boolean => {
    const authority = captureChartDesignAuthority();
    if (!authority || authority.chart.pivotSource) {
      return false;
    }
    const type = selectDataChartType(authority);
    const attrs = sheetChartModelOf(authority)?.attrs ?? null;
    const displayBlanksAs = attrs ? chartDisplayBlanksShown(attrs) : "gap";
    // Show data in hidden rows and columns: the chart's `c:plotVisOnly`.
    const openedVisibility = normalizeChartVisibility(authority.chart.chartVisibility);
    const showHidden = openedVisibility?.state === "known" && !openedVisibility.plotVisOnly;
    // Show #N/A as an empty cell: the model's `displayNaAsBlank`.
    const naAsBlank = attrs?.format?.displayNaAsBlank === true;
    let range: string;
    let byRows: boolean;
    let rows: SelectDataSeriesRow[] = [];
    let categories = "";
    if (authority.kind === "drawing") {
      // An imported chart shows its one data range; one whose series are
      // not one range starts empty (Excel's "too complex" range).
      const refs = normalizeChartSeriesRefs(authority.chart.seriesRefs);
      const source = drawingChartSourceOf(refs, type);
      range = source ? chartRangeToA1(source.range) : "";
      byRows = source ? !source.seriesInColumns : false;
      if (refs) {
        rows = selectDataRowsFromRefs(refs);
        categories = type === "scatter" ? "" : selectDataCategoriesOf(refs);
      }
    } else {
      range = chartSourceRangeToA1(authority.chart);
      // A chart that reads another sheet says which ('Sheet1'!A1:D4), as
      // Excel's box does; its own sheet's range stays bare.
      if (authority.chart.sourceSheetId && authority.chart.sourceSheetId !== authority.sheetId && range && range !== "#REF!") {
        range = `${selectDataDefaultPrefix(authority)}!${range}`;
      }
      byRows = authority.chart.seriesInColumns === false;
      // Its Legend Entries are the series its range lays (XLS-A072).
      const laid = selectDataByRefs(authority)
        ? nativeChartSeriesRefsForRange(selectDataDefaultPrefix(authority), authority.chart, !byRows, type)
        : null;
      if (laid) {
        rows = selectDataRowsFromRefs(laid);
        categories = selectDataCategoriesOf(laid);
      }
    }
    setChartDataDialog({
      authority,
      draft: {
        range,
        byRows,
        rows,
        categories,
        seriesEdited: false,
        selected: 0,
        displayBlanksAs,
        showHidden,
        showHiddenDraft: showHidden,
        naAsBlank,
        naAsBlankDraft: naAsBlank,
        page: "main",
        seriesDraft: null,
        axisDraft: "",
        blanksDraft: displayBlanksAs,
        pageError: null,
      },
      initial: { range, byRows, displayBlanksAs, showHidden, naAsBlank },
      blanksOptions: attrs ? chartDisplayBlanksOptions(attrs) : [],
      picking: null,
      error: null,
    });
    return true;
  };
  const changeChartDataDraft = (patch: Partial<SelectDataSourceDraft>) =>
    setChartDataDialog((current) =>
      current ? { ...current, error: null, draft: { ...current.draft, ...patch } } : current,
    );
  const changeChartDataRange = (text: string) =>
    setChartDataDialog((current) => {
      if (!current) return current;
      const draft = { ...current.draft, range: text };
      const normalized = normalizeChartRange(text);
      if (!selectDataByRefs(current.authority) || !normalized) {
        return { ...current, error: null, draft };
      }
      // A chart whose series were not one range takes the new range the way
      // its series ran (Excel puts the longer side on the category axis).
      const byRows = current.draft.range.trim()
        ? current.draft.byRows
        : !drawingChartDefaultSeriesInColumns(
            normalizeChartSeriesRefs(current.authority.chart.seriesRefs),
            normalized,
          );
      // Its Legend Entries read the sheet the range names ('Sheet1'!A1:D4).
      const named = chartRangeSheetName(text);
      const prefix = named !== undefined && selectDataSheetExists(named) ? drawingChartSheetPrefix(named) : undefined;
      return {
        ...current,
        error: null,
        draft: selectDataLaid(current.authority, draft, normalized, byRows, prefix) ?? draft,
      };
    });
  const switchChartDataRowColumn = () =>
    setChartDataDialog((current) => {
      if (!current) return current;
      const normalized = normalizeChartRange(current.draft.range);
      if (!normalized) return current;
      const byRows = !current.draft.byRows;
      const draft = selectDataByRefs(current.authority)
        ? selectDataLaid(current.authority, current.draft, normalized, byRows)
        : { ...current.draft, byRows };
      return draft ? { ...current, error: null, draft } : current;
    });
  // Edit Series' and Axis Labels' OK: the boxes read, the list takes them.
  const submitChartDataPage = () =>
    setChartDataDialog((current) => {
      if (!current) return current;
      const { authority, draft } = current;
      const prefix = selectDataDefaultPrefix(authority);
      if (draft.page === "series" && draft.seriesDraft) {
        const series = draft.seriesDraft;
        const xy = selectDataXy(authority);
        const name = selectDataSeriesName(series.name, prefix, selectDataSheetExists);
        const values = selectDataReference(series.values, prefix, selectDataSheetExists, "vector");
        const xValues = xy && series.xValues.trim()
          ? selectDataReference(series.xValues, prefix, selectDataSheetExists, "vector")
          : undefined;
        if (!name) {
          return { ...current, draft: { ...draft, pageError: t("spreadsheet.selectDataSource.invalidName") } };
        }
        if (!values || xValues === null) {
          return { ...current, draft: { ...draft, pageError: t("spreadsheet.selectDataSource.invalidReference") } };
        }
        const base = series.index === null ? undefined : draft.rows[series.index];
        const row: SelectDataSeriesRow = {
          name: name.title ? `=${name.title}` : (name.titleText ?? ""),
          values: `=${values}`,
          ...(xValues ? { xValues: `=${xValues}` } : {}),
          ...(base?.renderType ? { renderType: base.renderType } : {}),
          ...(base?.axis ? { axis: base.axis } : {}),
        };
        const rows = series.index === null
          ? [...draft.rows, row]
          : draft.rows.map((item, index) => (index === series.index ? row : item));
        return {
          ...current,
          error: null,
          draft: selectDataWithRows(authority, draft, rows, draft.categories, series.index ?? rows.length - 1),
        };
      }
      if (draft.page === "axis") {
        const text = draft.axisDraft.trim();
        const categories = text ? selectDataReference(text, prefix, selectDataSheetExists, "vector") : "";
        if (categories === null) {
          return { ...current, draft: { ...draft, pageError: t("spreadsheet.selectDataSource.invalidReference") } };
        }
        return {
          ...current,
          error: null,
          draft: selectDataWithRows(authority, draft, draft.rows, categories ? `=${categories}` : "", draft.selected),
        };
      }
      return current;
    });
  // Remove: the selected series (the chart's format follows the others);
  // the last one only on a chart whose imported part is rewritten slot by
  // slot -- see chart-select-data-source.
  const removeChartDataSeries = () =>
    setChartDataDialog((current) => {
      if (!current || current.draft.rows.length <= 1) return current;
      const last = current.draft.rows.length - 1;
      // Any series: an imported chart's save moves the others' own c:ser
      // into place (XLS-A072).
      const index = Math.min(Math.max(current.draft.selected, 0), last);
      const rows = current.draft.rows.filter((_, position) => position !== index);
      return {
        ...current,
        error: null,
        draft: selectDataWithRows(current.authority, current.draft, rows, current.draft.categories, Math.min(index, rows.length - 1)),
      };
    });
  // Move Up / Move Down: the series changes places with its neighbour, as
  // Excel reorders the legend entries.
  const moveChartDataSeries = (delta: -1 | 1) =>
    setChartDataDialog((current) => {
      if (!current) return current;
      const from = current.draft.selected;
      const to = from + delta;
      if (from < 0 || to < 0 || from >= current.draft.rows.length || to >= current.draft.rows.length) return current;
      const rows = [...current.draft.rows];
      [rows[from], rows[to]] = [rows[to], rows[from]];
      return {
        ...current,
        error: null,
        draft: selectDataWithRows(current.authority, current.draft, rows, current.draft.categories, to),
      };
    });
  return {
    changeChartDataDraft,
    changeChartDataRange,
    moveChartDataSeries,
    openChartDataDialog,
    removeChartDataSeries,
    submitChartDataPage,
    switchChartDataRowColumn,
  };
}
