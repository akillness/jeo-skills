"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, useState } from "react";
// The grid's action buttons wear the Office dialog button class: inside an
// OfficeDialogShell (the deck's Select Data, the Docs chart dialogs) that is
// the one button style; outside one (the floating chart-data window) the
// class matches no rule and the window's own styles apply.
import { officeDialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { columnToLetters } from "@mrnote/core/web/lib/spreadsheet/formula-engine.ts";
import { dataRegionEdge, type NavDirection } from "@mrnote/sheets/web/lib/spreadsheet/grid-nav.ts";
import { pasteDocumentChartWorksheet } from "./documentChartWorksheet";

import {
  MAX_CHART_CATEGORIES,
  MAX_CHART_SERIES,
  clampChartText,
  sanitizeChartCategories,
  type ChartPointValue,
} from "@mrnote/core/web/components/console/editor/extensions/chartBlockShared.ts";
import { isImeKeydown } from "@mrnote/core/web/lib/soft-keyboard.ts";

/** One series of the grid: a `null` value is an EMPTY cell, the chart's
 * blank point (drawn by its Show empty cells as, never as 0). */
export interface ChartDataGridSeries {
  name: string;
  values: ChartPointValue[];
}

function sanitizeGridSeries(value: readonly ChartDataGridSeries[]): ChartDataGridSeries[] {
  return value.slice(0, MAX_CHART_SERIES).map((entry) => ({
    name: clampChartText(entry.name),
    values: entry.values.slice(0, MAX_CHART_CATEGORIES).map((item) =>
      item === null || Number.isNaN(item) ? null : Number.isFinite(item) ? item : 0,
    ),
  }));
}

export interface ChartDataGridLabels {
  category: string;
  series: string;
  addCategory: string;
  addSeries: string;
  removeCategory: string;
  removeSeries: string;
  title: string;
  done: string;
  invalidData?: string;
  validationTitle?: string;
}

export interface ChartDataGridProps {
  title: string;
  categories: string[];
  series: ChartDataGridSeries[];
  labels: ChartDataGridLabels;
  lockSeriesStructure?: boolean;
  /** Whether an emptied value cell is a blank point (else it settles to 0). */
  blankCells?: boolean;
  minSeries?: number;
  maxSeries?: number;
  onTitleChange?: (title: string) => void;
  onChange: (next: {
    title: string;
    categories: string[];
    series: ChartDataGridSeries[];
  }) => void;
  onDone: () => void;
}

export function ChartDataGrid({
  title,
  categories,
  series,
  labels,
  lockSeriesStructure = false,
  blankCells = true,
  minSeries = 1,
  maxSeries = MAX_CHART_SERIES,
  onTitleChange,
  onChange,
  onDone,
}: ChartDataGridProps) {
  const [pasteRejected, setPasteRejected] = useState(false);
  // A value cell is a controlled <input type="number"> over a numeric model,
  // so an emptied cell used to snap back to its stored number on the very
  // next render: the first digit could never be deleted. The text the user is
  // typing lives here until the cell blurs; an empty or unfinished draft
  // commits nothing while typing and settles on blur to an EMPTY cell -- the
  // chart's blank point, as an emptied cell of Office's data sheet is (0 where
  // the chart takes no blank) -- a finished number commits at once.
  const [valueDrafts, setValueDrafts] = useState<Record<string, string>>({});
  const draftKey = (seriesIndex: number, valueIndex: number) =>
    `${seriesIndex}:${valueIndex}`;
  const effectiveMinSeries = Math.max(1, Math.min(minSeries, MAX_CHART_SERIES));
  const effectiveMaxSeries = Math.max(
    effectiveMinSeries,
    Math.min(maxSeries, MAX_CHART_SERIES),
  );
  const commit = useCallback(
    (
      nextTitle: string,
      nextCategories: string[],
      nextSeries: ChartDataGridSeries[],
    ) => {
      onChange({
        title: clampChartText(nextTitle),
        categories: sanitizeChartCategories(nextCategories),
        series: sanitizeGridSeries(nextSeries),
      });
    },
    [onChange],
  );

  const setCategory = (index: number, value: string) => {
    const next = categories.slice();
    next[index] = value;
    commit(
      title,
      next,
      series.map((entry) => ({
        ...entry,
        values: next.map((_, i) => (i < entry.values.length ? entry.values[i] : 0)),
      })),
    );
  };
  const addCategory = () => {
    if (categories.length >= MAX_CHART_CATEGORIES) return;
    commit(
      title,
      [...categories, ""],
      series.map((entry) => ({ ...entry, values: [...entry.values, 0] })),
    );
  };
  const removeCategory = (index: number) => {
    if (categories.length <= 1) return;
    commit(
      title,
      categories.filter((_, i) => i !== index),
      series.map((entry) => ({
        ...entry,
        values: entry.values.filter((_, i) => i !== index),
      })),
    );
  };
  const setSeriesName = (index: number, value: string) =>
    commit(
      title,
      categories,
      series.map((entry, i) =>
        i === index ? { ...entry, name: value } : entry,
      ),
    );
  const commitSeriesValue = (
    seriesIndex: number,
    valueIndex: number,
    numeric: ChartPointValue,
  ) =>
    commit(
      title,
      categories,
      series.map((entry, i) => {
        if (i !== seriesIndex) return entry;
        const values = categories.map((_, vi) =>
          vi < entry.values.length ? entry.values[vi] : 0,
        );
        values[valueIndex] = numeric;
        return { ...entry, values };
      }),
    );
  const setSeriesValue = (
    seriesIndex: number,
    valueIndex: number,
    raw: string,
  ) => {
    setValueDrafts((drafts) => ({
      ...drafts,
      [draftKey(seriesIndex, valueIndex)]: raw,
    }));
    if (raw.trim() === "") return;
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return;
    commitSeriesValue(seriesIndex, valueIndex, numeric);
  };
  const settleSeriesValue = (seriesIndex: number, valueIndex: number) => {
    const key = draftKey(seriesIndex, valueIndex);
    const draft = valueDrafts[key];
    setValueDrafts((drafts) => {
      if (!(key in drafts)) return drafts;
      const next = { ...drafts };
      delete next[key];
      return next;
    });
    if (draft === undefined) return;
    const numeric = draft.trim() === "" ? (blankCells ? null : 0) : Number(draft);
    const stored = series[seriesIndex]?.values[valueIndex] ?? null;
    if ((numeric === null || Number.isFinite(numeric)) && numeric !== stored) {
      commitSeriesValue(seriesIndex, valueIndex, numeric);
    }
  };
  const addSeries = () => {
    if (series.length >= effectiveMaxSeries) return;
    commit(title, categories, [
      ...series,
      { name: "", values: categories.map(() => 0) },
    ]);
  };
  const removeSeries = (index: number) => {
    if (series.length <= effectiveMinSeries) return;
    commit(
      title,
      categories,
      series.filter((_, i) => i !== index),
    );
  };

  return (
    <div className="chart-block__grid" data-testid="chart-block-grid">
      <label className="chart-block__grid-title">
        {labels.title}
        <input
          type="text"
          value={title}
          data-testid="chart-block-grid-title"
          onChange={(event) => {
            const nextTitle = clampChartText(event.target.value);
            if (onTitleChange) {
              onTitleChange(nextTitle);
              return;
            }
            commit(nextTitle, categories, series);
          }}
        />
      </label>
      {pasteRejected ? (
        <div role="alert">
          {labels.invalidData ??
            labels.validationTitle ??
            "The pasted cells do not match this chart's data."}
        </div>
      ) : null}
      <div style={{ overflowX: "auto" }}>
        <table
          className="chart-block__grid-table"
          data-chart-worksheet="ChartData"
          aria-label="ChartData"
          onPaste={(event) => {
            const input = event.target;
            if (
              !(input instanceof HTMLInputElement) ||
              !input.dataset.chartCell
            )
              return;
            const text = event.clipboardData.getData("text/plain");
            if (!/[\t\r\n]/.test(text)) return;
            event.preventDefault();
            const next = pasteDocumentChartWorksheet(
              categories,
              series,
              Number(input.dataset.row),
              Number(input.dataset.column),
              text,
              { maxSeries: effectiveMaxSeries, lockSeriesStructure, blankCells },
            );
            setPasteRejected(next === null);
            if (next) commit(title, next.categories, next.series);
          }}
          onKeyDown={(event) => {
            if (isImeKeydown(event)) return;
            const input = event.target;
            if (
              !(input instanceof HTMLInputElement) ||
              !input.dataset.chartCell
            )
              return;
            const row = Number(input.dataset.row),
              column = Number(input.dataset.column);
            const direction: NavDirection | null =
              (
                {
                  ArrowUp: "up",
                  ArrowDown: "down",
                  ArrowLeft: "left",
                  ArrowRight: "right",
                } as Partial<Record<string, NavDirection>>
              )[event.key] ?? null;
            let next = { row, col: column };
            if (direction) {
              if (
                (direction === "left" || direction === "right") &&
                !event.ctrlKey &&
                !event.metaKey
              )
                return;
              if (event.ctrlKey || event.metaKey) {
                next = dataRegionEdge(
                  (r, c) =>
                    r === 0
                      ? c > 0 && Boolean(series[c - 1]?.name)
                      : c === 0
                        ? Boolean(categories[r - 1])
                        : (series[c - 1]?.values[r - 1] ?? null) !== null,
                  row,
                  column,
                  direction,
                  categories.length + 1,
                  series.length + 1,
                );
              } else next.row += direction === "up" ? -1 : 1;
            } else if (event.key === "Enter")
              next.row += event.shiftKey ? -1 : 1;
            else if (event.key === "Tab") {
              next.col += event.shiftKey ? -1 : 1;
              if (next.col > series.length) {
                next.col = 0;
                next.row += 1;
              }
              if (next.col < 0) {
                next.col = series.length;
                next.row -= 1;
              }
            } else return;
            const target = event.currentTarget.querySelector<HTMLInputElement>(
              `input[data-row="${next.row}"][data-column="${next.col}"]`,
            );
            if (target && !target.readOnly) {
              event.preventDefault();
              target.focus();
              target.select();
            }
          }}
        >
          <thead>
            <tr>
              <th />
              {Array.from({ length: series.length + 1 }, (_, index) => (
                <th key={index} scope="col">
                  {columnToLetters(index)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">1</th>
              <td>{labels.category}</td>
              {series.map((entry, seriesIndex) => (
                <td key={seriesIndex}>
                  <input
                    type="text"
                    value={entry.name}
                    aria-label={`${labels.series} ${seriesIndex + 1}`}
                    data-chart-cell={`${columnToLetters(seriesIndex + 1)}1`}
                    data-row={0}
                    data-column={seriesIndex + 1}
                    data-testid={`chart-block-grid-series-name-${seriesIndex}`}
                    readOnly={lockSeriesStructure}
                    onChange={(event) =>
                      setSeriesName(seriesIndex, event.target.value)
                    }
                  />
                  {!lockSeriesStructure ? (
                    <button
                      type="button"
                      title={labels.removeSeries}
                      aria-label={`${labels.removeSeries} ${seriesIndex + 1}`}
                      data-testid={`chart-block-grid-remove-series-${seriesIndex}`}
                      onClick={() => removeSeries(seriesIndex)}
                      disabled={series.length <= effectiveMinSeries}
                    >
                      ×
                    </button>
                  ) : null}
                </td>
              ))}
            </tr>
            {categories.map((category, valueIndex) => (
              <tr key={valueIndex}>
                <th scope="row">{valueIndex + 2}</th>
                <td>
                  <input
                    type="text"
                    value={category}
                    aria-label={`${labels.category} ${valueIndex + 1}`}
                    data-chart-cell={`A${valueIndex + 2}`}
                    data-row={valueIndex + 1}
                    data-column={0}
                    data-testid={`chart-block-grid-category-${valueIndex}`}
                    onChange={(event) =>
                      setCategory(valueIndex, event.target.value)
                    }
                  />
                  <button
                    type="button"
                    title={labels.removeCategory}
                    aria-label={`${labels.removeCategory} ${valueIndex + 1}`}
                    data-testid={`chart-block-grid-remove-category-${valueIndex}`}
                    onClick={() => removeCategory(valueIndex)}
                    disabled={categories.length <= 1}
                  >
                    ×
                  </button>
                </td>
                {series.map((entry, seriesIndex) => (
                  <td key={seriesIndex}>
                    <input
                      type="number"
                      value={
                        valueDrafts[draftKey(seriesIndex, valueIndex)] ??
                        // A blank point shows as the empty cell it is.
                        (entry.values[valueIndex] === null ||
                        Number.isNaN(entry.values[valueIndex])
                          ? ""
                          : (entry.values[valueIndex] ?? 0))
                      }
                      aria-label={`${labels.series} ${seriesIndex + 1}, ${labels.category} ${valueIndex + 1}`}
                      data-chart-cell={`${columnToLetters(seriesIndex + 1)}${valueIndex + 2}`}
                      data-row={valueIndex + 1}
                      data-column={seriesIndex + 1}
                      data-testid={`chart-block-grid-value-${seriesIndex}-${valueIndex}`}
                      onChange={(event) =>
                        setSeriesValue(
                          seriesIndex,
                          valueIndex,
                          event.target.value,
                        )
                      }
                      onBlur={() => settleSeriesValue(seriesIndex, valueIndex)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="chart-block__grid-actions">
        <button
          type="button"
          className={officeDialogParts.button}
          data-testid="chart-block-grid-add-category"
          onClick={addCategory}
          disabled={categories.length >= MAX_CHART_CATEGORIES}
        >
          {labels.addCategory}
        </button>
        {!lockSeriesStructure ? (
          <button
            type="button"
            className={officeDialogParts.button}
            data-testid="chart-block-grid-add-series"
            onClick={addSeries}
            disabled={series.length >= effectiveMaxSeries}
          >
            {labels.addSeries}
          </button>
        ) : null}
        <button
          type="button"
          className={officeDialogParts.button}
          data-testid="chart-block-grid-done"
          onClick={onDone}
        >
          {labels.done}
        </button>
      </div>
    </div>
  );
}
