"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { ReactNode } from "react";

import {
  MAX_CHART_CATEGORIES,
  MAX_CHART_SERIES,
  clampChartText,
  type CategoryChartData,
  type ChartData,
  type ChartFamily,
  type ChartValidationIssue,
  type HierarchyChartData,
  type MapChartData,
  type MatrixChartData,
  type SampleChartData,
  type StockChartData,
  type WaterfallChartData,
  type XYChartData,
} from "@mrnote/core/web/components/console/editor/extensions/chartBlockShared.ts";
import { ChartDataGrid, type ChartDataGridLabels } from "./ChartDataGrid";

export interface ChartV2DataEditorLabels extends ChartDataGridLabels {
  value: string;
  xValues: string;
  yValues: string;
  bubbleSizes: string;
  role: string;
  pointKind: string;
  pointKindValue: string;
  pointKindSubtotal: string;
  pointKindTotal: string;
  id: string;
  parentId: string;
  label: string;
  samples: string;
  regionCode: string;
  addRow: string;
  removeRow: string;
  validationTitle: string;
  validationIssue: (issue: ChartValidationIssue) => string;
}

export type ChartValidationIssueMessageKey =
  | "block.chart.v2.validation.combo"
  | "block.chart.v2.validation.configuration"
  | "block.chart.v2.validation.data"
  | "block.chart.v2.validation.hierarchy"
  | "block.chart.v2.validation.invalid"
  | "block.chart.v2.validation.map"
  | "block.chart.v2.validation.matrix"
  | "block.chart.v2.validation.series"
  | "block.chart.v2.validation.stock"
  | "block.chart.v2.validation.text"
  | "block.chart.v2.validation.values"
  | "block.chart.v2.validation.waterfall"
  | "block.chart.v2.validation.xy";

export function chartValidationIssueMessageKey(
  code: string,
): ChartValidationIssueMessageKey {
  const family = code.split(".", 1)[0];
  if (
    ["attrs", "schema", "family", "subtype", "style", "format"].includes(
      family,
    )
  ) {
    return "block.chart.v2.validation.configuration";
  }
  if (family === "text" || family === "labels") {
    return "block.chart.v2.validation.text";
  }
  if (family === "number" || family === "numbers") {
    return "block.chart.v2.validation.values";
  }
  if (family === "series") return "block.chart.v2.validation.series";
  if (family === "data") return "block.chart.v2.validation.data";
  if (family === "xy" || family === "bubble") {
    return "block.chart.v2.validation.xy";
  }
  if (family === "waterfall") {
    return "block.chart.v2.validation.waterfall";
  }
  if (family === "hierarchy") {
    return "block.chart.v2.validation.hierarchy";
  }
  if (family === "matrix") return "block.chart.v2.validation.matrix";
  if (family === "map") return "block.chart.v2.validation.map";
  if (family === "stock") return "block.chart.v2.validation.stock";
  if (family === "combo") return "block.chart.v2.validation.combo";
  return "block.chart.v2.validation.invalid";
}

export interface ChartV2DataEditorProps {
  chartType: ChartFamily;
  title: string;
  data: ChartData;
  labels: ChartV2DataEditorLabels;
  issues: ChartValidationIssue[];
  onTitleChange: (title: string) => void;
  onChange: (data: ChartData) => void;
  onDone: () => void;
}

function numberFromInput(raw: string, previous: number): number {
  if (raw.trim() === "") return previous;
  const value = Number(raw);
  return Number.isFinite(value) ? value : previous;
}

function parseNumberList(raw: string): number[] | null {
  const parts = raw
    .split(/[，,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 1 || parts.length > MAX_CHART_CATEGORIES) return null;
  const values = parts.map(Number);
  return values.every(Number.isFinite) ? values : null;
}

/** An X Y list whose empty item between commas ("1, , 3") is a blank point. */
function parsePointList(raw: string): Array<number | null> | null {
  if (!/[，,]/.test(raw)) return parseNumberList(raw);
  const parts = raw.split(/[，,]/).map((part) => part.trim());
  if (parts.length < 1 || parts.length > MAX_CHART_CATEGORIES) return null;
  const values = parts.map((part) => (part === "" ? null : Number(part)));
  return values.every((value) => value === null || Number.isFinite(value)) &&
    values.some((value) => value !== null)
    ? values
    : null;
}

function EditorFrame({
  title,
  labels,
  issues,
  onTitleChange,
  onDone,
  children,
}: Omit<ChartV2DataEditorProps, "data" | "onChange" | "chartType"> & {
  children: ReactNode;
}) {
  return (
    <div className="chart-block__grid" data-testid="chart-block-v2-data-editor">
      <label className="chart-block__grid-title">
        {labels.title}
        <input
          type="text"
          value={title}
          data-testid="chart-block-v2-title"
          onChange={(event) =>
            onTitleChange(clampChartText(event.target.value))
          }
        />
      </label>
      {issues.length > 0 ? (
        <div
          role="alert"
          data-testid="chart-block-v2-editor-validation"
          style={{ color: "var(--office-dialog-danger, #b91c1c)", fontSize: 12 }}
        >
          <strong>{labels.validationTitle}</strong>
          <ul>
            {issues.slice(0, 5).map((entry, index) => (
              <li key={`${entry.path}-${entry.code}-${index}`}>
                {labels.validationIssue(entry)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {children}
      <div className="chart-block__grid-actions">
        <button
          type="button"
          data-testid="chart-block-grid-done"
          onClick={onDone}
        >
          {labels.done}
        </button>
      </div>
    </div>
  );
}

function CategoryEditor({
  chartType,
  title,
  data,
  labels,
  onChange,
  onTitleChange,
  onDone,
}: Omit<ChartV2DataEditorProps, "data" | "issues"> & {
  data: CategoryChartData;
}) {
  return (
    <ChartDataGrid
      title={title}
      categories={data.categories}
      series={data.series}
      labels={labels}
      // A funnel's stages are all drawn: its emptied cell settles to 0.
      blankCells={chartType !== "funnel"}
      minSeries={chartType === "combo" ? 2 : 1}
      maxSeries={
        chartType === "pie" || chartType === "funnel"
          ? 1
          : MAX_CHART_SERIES
      }
      onTitleChange={onTitleChange}
      onChange={(next) => {
        onChange({
          kind: "category",
          categories: next.categories,
          // A multi-level axis keeps its outer levels while its categories
          // are renamed or their values edited; a row added or removed
          // leaves the grid with no place for them, and the axis flat.
          ...(data.categoryLevels &&
          next.categories.length === data.categories.length
            ? { categoryLevels: data.categoryLevels }
            : {}),
          series: next.series.map((entry, index) => ({
            ...(chartType === "combo"
              ? {
                  renderAs: index === 0 ? ("column" as const) : ("line" as const),
                  axis: "primary" as const,
                }
              : {}),
            ...(data.series[index] ?? {}),
            ...entry,
            // ChartDataGrid uses an empty draft name for a new row. V2 names
            // are required, so persist a deterministic name (or preserve the
            // previous one while it is being replaced) instead of invalidating
            // the chart node mid-edit.
            name:
              entry.name.trim() ||
              data.series[index]?.name ||
              `${labels.series} ${index + 1}`,
          })),
        });
      }}
      onDone={onDone}
    />
  );
}

function StockEditor({
  title,
  data,
  labels,
  onChange,
  onTitleChange,
  onDone,
}: Omit<ChartV2DataEditorProps, "data" | "issues"> & {
  data: StockChartData;
}) {
  return (
    <ChartDataGrid
      title={title}
      categories={data.categories}
      series={data.series}
      labels={labels}
      lockSeriesStructure
      onTitleChange={onTitleChange}
      onChange={(next) => {
        onChange({
          kind: "stock",
          categories: next.categories,
          series: next.series.map((entry, index) => ({
            ...entry,
            role: data.series[index].role,
          })),
        });
      }}
      onDone={onDone}
    />
  );
}

function XYEditor({
  title,
  data,
  labels,
  issues,
  onChange,
  onTitleChange,
  onDone,
}: Omit<ChartV2DataEditorProps, "data"> & { data: XYChartData }) {
  const setSeries = (
    index: number,
    patch: Partial<XYChartData["series"][number]>,
  ) =>
    onChange({
      kind: "xy",
      series: data.series.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry,
      ),
    });
  return (
    <EditorFrame {...{ title, labels, issues, onTitleChange, onDone }}>
      {data.series.map((entry, index) => (
        <fieldset
          key={index}
          data-testid={`chart-block-v2-xy-series-${index}`}
          style={{ margin: "8px 0" }}
        >
          <label>
            {`${labels.series} ${index + 1}`}
            <input
              aria-label={`${labels.series} ${index + 1}`}
              value={entry.name}
              onChange={(event) =>
                setSeries(index, { name: clampChartText(event.target.value) })
              }
            />
          </label>
          <label>
            {labels.xValues}
            <input
              value={entry.xValues.join(", ")}
              onChange={(event) => {
                const values = parsePointList(event.target.value);
                if (values) setSeries(index, { xValues: values });
              }}
            />
          </label>
          <label>
            {labels.yValues}
            <input
              value={entry.yValues.join(", ")}
              onChange={(event) => {
                const values = parsePointList(event.target.value);
                if (values) setSeries(index, { yValues: values });
              }}
            />
          </label>
          {entry.bubbleSizes ? (
            <label>
              {labels.bubbleSizes}
              <input
                value={entry.bubbleSizes.join(", ")}
                onChange={(event) => {
                  const values = parseNumberList(event.target.value);
                  if (values) setSeries(index, { bubbleSizes: values });
                }}
              />
            </label>
          ) : null}
          <button
            type="button"
            onClick={() =>
              onChange({
                kind: "xy",
                series: data.series.filter((_, i) => i !== index),
              })
            }
            disabled={data.series.length <= 1}
          >
            {labels.removeSeries}
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange({
            kind: "xy",
            series: [
              ...data.series,
              {
                name: `${labels.series} ${data.series.length + 1}`,
                xValues: [1, 2, 3],
                yValues: [0, 0, 0],
                ...(data.series[0]?.bubbleSizes
                  ? { bubbleSizes: [1, 1, 1] }
                  : {}),
              },
            ],
          })
        }
        disabled={data.series.length >= MAX_CHART_SERIES}
      >
        {labels.addSeries}
      </button>
    </EditorFrame>
  );
}

function WaterfallEditor({
  title,
  data,
  labels,
  issues,
  onChange,
  onTitleChange,
  onDone,
}: Omit<ChartV2DataEditorProps, "data"> & { data: WaterfallChartData }) {
  const remove = (index: number) =>
    onChange({
      kind: "waterfall",
      categories: data.categories.filter((_, i) => i !== index),
      values: data.values.filter((_, i) => i !== index),
      pointKinds: data.pointKinds.filter((_, i) => i !== index),
    });
  return (
    <EditorFrame {...{ title, labels, issues, onTitleChange, onDone }}>
      <table className="chart-block__grid-table">
        <thead>
          <tr>
            <th>{labels.category}</th>
            <th>{labels.value}</th>
            <th>{labels.pointKind}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.categories.map((category, index) => (
            <tr key={index}>
              <td>
                <input
                  aria-label={`${labels.category} ${index + 1}`}
                  value={category}
                  onChange={(event) =>
                    onChange({
                      ...data,
                      categories: data.categories.map((value, i) =>
                        i === index
                          ? clampChartText(event.target.value)
                          : value,
                      ),
                    })
                  }
                />
              </td>
              <td>
                <input
                  aria-label={`${labels.value} ${index + 1}`}
                  type="number"
                  value={data.values[index]}
                  onChange={(event) =>
                    onChange({
                      ...data,
                      values: data.values.map((value, i) =>
                        i === index
                          ? numberFromInput(event.target.value, value)
                          : value,
                      ),
                    })
                  }
                />
              </td>
              <td>
                <select
                  aria-label={`${labels.pointKind} ${index + 1}`}
                  value={data.pointKinds[index]}
                  onChange={(event) =>
                    onChange({
                      ...data,
                      pointKinds: data.pointKinds.map((value, i) =>
                        i === index
                          ? (event.target
                              .value as WaterfallChartData["pointKinds"][number])
                          : value,
                      ),
                    })
                  }
                >
                  <option value="value">{labels.pointKindValue}</option>
                  <option value="subtotal">{labels.pointKindSubtotal}</option>
                  <option value="total">{labels.pointKindTotal}</option>
                </select>
              </td>
              <td>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  disabled={data.categories.length <= 1}
                >
                  {labels.removeRow}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        onClick={() =>
          onChange({
            ...data,
            categories: [...data.categories, ""],
            values: [...data.values, 0],
            pointKinds: [...data.pointKinds, "value"],
          })
        }
        disabled={data.categories.length >= MAX_CHART_CATEGORIES}
      >
        {labels.addRow}
      </button>
    </EditorFrame>
  );
}

function HierarchyEditor({
  title,
  data,
  labels,
  issues,
  onChange,
  onTitleChange,
  onDone,
}: Omit<ChartV2DataEditorProps, "data"> & { data: HierarchyChartData }) {
  const patchPoint = (
    index: number,
    patch: Partial<HierarchyChartData["points"][number]>,
  ) =>
    onChange({
      kind: "hierarchy",
      points: data.points.map((point, i) =>
        i === index ? { ...point, ...patch } : point,
      ),
    });
  return (
    <EditorFrame {...{ title, labels, issues, onTitleChange, onDone }}>
      <table className="chart-block__grid-table">
        <thead>
          <tr>
            <th>{labels.id}</th>
            <th>{labels.parentId}</th>
            <th>{labels.label}</th>
            <th>{labels.value}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.points.map((point, index) => (
            <tr key={index}>
              <td>
                <input
                  aria-label={`${labels.id} ${index + 1}`}
                  value={point.id}
                  onChange={(event) =>
                    patchPoint(index, {
                      id: clampChartText(event.target.value),
                    })
                  }
                />
              </td>
              <td>
                <input
                  aria-label={`${labels.parentId} ${index + 1}`}
                  value={point.parentId ?? ""}
                  onChange={(event) =>
                    patchPoint(index, {
                      parentId: clampChartText(event.target.value) || undefined,
                    })
                  }
                />
              </td>
              <td>
                <input
                  aria-label={`${labels.label} ${index + 1}`}
                  value={point.label}
                  onChange={(event) =>
                    patchPoint(index, {
                      label: clampChartText(event.target.value),
                    })
                  }
                />
              </td>
              <td>
                <input
                  aria-label={`${labels.value} ${index + 1}`}
                  type="number"
                  value={point.value}
                  onChange={(event) =>
                    patchPoint(index, {
                      value: numberFromInput(event.target.value, point.value),
                    })
                  }
                />
              </td>
              <td>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      kind: "hierarchy",
                      points: data.points.filter((_, i) => i !== index),
                    })
                  }
                  disabled={data.points.length <= 1}
                >
                  {labels.removeRow}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        onClick={() =>
          onChange({
            kind: "hierarchy",
            points: [
              ...data.points,
              {
                id: `node-${data.points.length + 1}`,
                label: `${labels.label} ${data.points.length + 1}`,
                value: 0,
              },
            ],
          })
        }
        disabled={data.points.length >= MAX_CHART_CATEGORIES}
      >
        {labels.addRow}
      </button>
    </EditorFrame>
  );
}

function SampleEditor({
  title,
  data,
  labels,
  issues,
  onChange,
  onTitleChange,
  onDone,
}: Omit<ChartV2DataEditorProps, "data"> & { data: SampleChartData }) {
  return (
    <EditorFrame {...{ title, labels, issues, onTitleChange, onDone }}>
      {data.series.map((entry, index) => (
        <div key={index}>
          <input
            value={entry.name}
            aria-label={`${labels.series} ${index + 1}`}
            onChange={(event) =>
              onChange({
                kind: "sample",
                series: data.series.map((value, i) =>
                  i === index
                    ? { ...value, name: clampChartText(event.target.value) }
                    : value,
                ),
              })
            }
          />
          <input
            value={entry.values.join(", ")}
            aria-label={`${labels.samples} ${index + 1}`}
            onChange={(event) => {
              const values = parseNumberList(event.target.value);
              if (values)
                onChange({
                  kind: "sample",
                  series: data.series.map((value, i) =>
                    i === index ? { ...value, values } : value,
                  ),
                });
            }}
          />
          <button
            type="button"
            onClick={() =>
              onChange({
                kind: "sample",
                series: data.series.filter((_, i) => i !== index),
              })
            }
            disabled={data.series.length <= 1}
          >
            {labels.removeSeries}
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange({
            kind: "sample",
            series: [
              ...data.series,
              {
                name: `${labels.series} ${data.series.length + 1}`,
                values: [0],
              },
            ],
          })
        }
        disabled={data.series.length >= MAX_CHART_SERIES}
      >
        {labels.addSeries}
      </button>
    </EditorFrame>
  );
}

function MatrixEditor({
  title,
  data,
  labels,
  issues,
  onChange,
  onTitleChange,
  onDone,
}: Omit<ChartV2DataEditorProps, "data"> & { data: MatrixChartData }) {
  return (
    <EditorFrame {...{ title, labels, issues, onTitleChange, onDone }}>
      <div style={{ overflowX: "auto" }}>
        <table className="chart-block__grid-table">
          <thead>
            <tr>
              <th />
              <th colSpan={data.xCategories.length}>
                {data.xCategories.join(" · ")}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.yCategories.map((label, rowIndex) => (
              <tr key={rowIndex}>
                <th>{label}</th>
                {data.xCategories.map((_, columnIndex) => (
                  <td key={columnIndex}>
                    <input
                      aria-label={`${labels.value} ${rowIndex + 1}, ${columnIndex + 1}`}
                      type="number"
                      value={data.values[rowIndex]?.[columnIndex] ?? 0}
                      onChange={(event) =>
                        onChange({
                          ...data,
                          values: data.values.map((row, r) =>
                            r === rowIndex
                              ? row.map((value, c) =>
                                  c === columnIndex
                                    ? numberFromInput(event.target.value, value)
                                    : value,
                                )
                              : row,
                          ),
                        })
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </EditorFrame>
  );
}

function MapEditor({
  title,
  data,
  labels,
  issues,
  onChange,
  onTitleChange,
  onDone,
}: Omit<ChartV2DataEditorProps, "data"> & { data: MapChartData }) {
  const patchRegion = (
    index: number,
    patch: Partial<MapChartData["regions"][number]>,
  ) =>
    onChange({
      kind: "map",
      regions: data.regions.map((region, i) =>
        i === index ? { ...region, ...patch } : region,
      ),
    });
  return (
    <EditorFrame {...{ title, labels, issues, onTitleChange, onDone }}>
      <table className="chart-block__grid-table">
        <thead>
          <tr>
            <th>{labels.regionCode}</th>
            <th>{labels.label}</th>
            <th>{labels.value}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.regions.map((region, index) => (
            <tr key={index}>
              <td>
                <input
                  aria-label={`${labels.regionCode} ${index + 1}`}
                  value={region.id}
                  inputMode="numeric"
                  onChange={(event) =>
                    patchRegion(index, { id: event.target.value.slice(0, 3) })
                  }
                />
              </td>
              <td>
                <input
                  aria-label={`${labels.label} ${index + 1}`}
                  value={region.label}
                  onChange={(event) =>
                    patchRegion(index, {
                      label: clampChartText(event.target.value),
                    })
                  }
                />
              </td>
              <td>
                <input
                  aria-label={`${labels.value} ${index + 1}`}
                  type="number"
                  value={region.value}
                  onChange={(event) =>
                    patchRegion(index, {
                      value: numberFromInput(event.target.value, region.value),
                    })
                  }
                />
              </td>
              <td>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      kind: "map",
                      regions: data.regions.filter((_, i) => i !== index),
                    })
                  }
                  disabled={data.regions.length <= 1}
                >
                  {labels.removeRow}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        onClick={() =>
          onChange({
            kind: "map",
            regions: [...data.regions, { id: "000", label: "", value: 0 }],
          })
        }
        disabled={data.regions.length >= MAX_CHART_CATEGORIES}
      >
        {labels.addRow}
      </button>
    </EditorFrame>
  );
}

export function ChartV2DataEditor(props: ChartV2DataEditorProps) {
  switch (props.data.kind) {
    case "category":
      return <CategoryEditor {...props} data={props.data} />;
    case "stock":
      return <StockEditor {...props} data={props.data} />;
    case "xy":
      return <XYEditor {...props} data={props.data} />;
    case "waterfall":
      return <WaterfallEditor {...props} data={props.data} />;
    case "hierarchy":
      return <HierarchyEditor {...props} data={props.data} />;
    case "sample":
      return <SampleEditor {...props} data={props.data} />;
    case "matrix":
      return <MatrixEditor {...props} data={props.data} />;
    case "map":
      return <MapEditor {...props} data={props.data} />;
  }
}
