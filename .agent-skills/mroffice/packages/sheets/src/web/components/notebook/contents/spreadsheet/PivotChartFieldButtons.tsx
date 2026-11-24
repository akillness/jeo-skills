/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type {
  MouseEvent as ReactMouseEvent,
  ReactElement,
} from "react";

import type { PivotConfig } from "@mrnote/core/web/lib/spreadsheet/pivot.ts";
import {
  pivotChartShowsButtons,
  type SpreadsheetPivotChartOptions,
} from "@mrnote/core/web/lib/spreadsheet/pivot-chart.ts";
import type {
  PivotChartReport,
  PivotChartReportField,
} from "@mrnote/core/web/lib/spreadsheet/pivot-output.ts";

/**
 * Excel's PivotChart field buttons (PivotChart Analyze > Field Buttons): the
 * report filter and value fields along the top left, the legend (series)
 * fields at the top right, the axis (category) fields along the bottom left,
 * and the Expand/Collapse Entire Field buttons at the bottom right while the
 * axis has an outer field. A field button with an arrow opens that field's
 * sort-and-filter list; a filtered field shows the filter mark.
 */

export type PivotChartFieldButtonKind = "filter" | "values" | "legend" | "axis";

export interface PivotChartFieldButton {
  kind: PivotChartFieldButtonKind;
  field: PivotChartReportField;
  /** A value field's position in the recipe (value buttons only). */
  valueIndex?: number;
  /** The field hides some of its items. */
  filtered: boolean;
}

export interface PivotChartFieldButtonLayout {
  top: PivotChartFieldButton[];
  legend: PivotChartFieldButton[];
  axis: PivotChartFieldButton[];
  expandCollapse: boolean;
}

/** One band's height: Excel draws a field button row about 20 px high. */
export const PIVOT_CHART_BUTTON_BAND_HEIGHT = 22;

/** Which buttons a PivotChart shows over its report. */
export function pivotChartFieldButtonLayout(
  report: PivotChartReport,
  config: Pick<PivotConfig, "filters" | "itemFilters"> | undefined,
  options: SpreadsheetPivotChartOptions | undefined,
): PivotChartFieldButtonLayout {
  const itemFiltered = (colIndex: number) =>
    (config?.itemFilters ?? []).some(
      (entry) => entry.colIndex === colIndex && entry.selected.length > 0,
    );
  const filters = pivotChartShowsButtons(options, "filter")
    ? report.filterFields.map((field) => ({
        kind: "filter" as const,
        field,
        filtered: (config?.filters ?? []).some(
          (entry) => entry.colIndex === field.colIndex && entry.selected.length > 0,
        ),
      }))
    : [];
  const values = pivotChartShowsButtons(options, "values")
    ? report.valueCaptions.map((caption, valueIndex) => ({
        kind: "values" as const,
        field: { colIndex: -1, caption },
        valueIndex,
        filtered: false,
      }))
    : [];
  const legend = pivotChartShowsButtons(options, "legend")
    ? report.columnFields.map((field) => ({
        kind: "legend" as const,
        field,
        filtered: itemFiltered(field.colIndex),
      }))
    : [];
  const axis = pivotChartShowsButtons(options, "axis")
    ? report.rowFields.map((field) => ({
        kind: "axis" as const,
        field,
        filtered: itemFiltered(field.colIndex),
      }))
    : [];
  return {
    top: [...filters, ...values],
    legend,
    axis,
    expandCollapse:
      pivotChartShowsButtons(options, "expandCollapse") && report.rowFields.length > 1,
  };
}

function FilterMark(): ReactElement {
  return (
    <svg viewBox="0 0 10 10" width="9" height="9" aria-hidden="true">
      <path d="M1 1.5h8L6 5.2V9L4 8V5.2z" fill="currentColor" />
    </svg>
  );
}

function DropArrow(): ReactElement {
  return (
    <svg viewBox="0 0 10 10" width="9" height="9" aria-hidden="true">
      <path d="M2 3.5h6L5 7z" fill="currentColor" />
    </svg>
  );
}

export interface PivotChartFieldButtonRowProps {
  buttons: readonly PivotChartFieldButton[];
  align: "start" | "end";
  chartId: string;
  disabled?: boolean;
  /** An open button's key, `${kind}:${colIndex}`. */
  openKey?: string | null;
  labels: {
    filtered: string;
    menu: string;
  };
  onOpen: (button: PivotChartFieldButton, anchor: DOMRect) => void;
  onContextMenu: (button: PivotChartFieldButton, event: ReactMouseEvent) => void;
  /** A button was pressed (before the chart takes the selection). */
  onPress?: () => void;
}

/** One row of field buttons (a band's left or right side). */
export function PivotChartFieldButtonRow({
  buttons,
  align,
  chartId,
  disabled,
  openKey,
  labels,
  onOpen,
  onContextMenu,
  onPress,
}: PivotChartFieldButtonRowProps): ReactElement | null {
  if (buttons.length === 0) return null;
  return (
    <div
      className="spreadsheet-pivot-chart-buttons__row"
      data-align={align}
    >
      {buttons.map((button) => {
        const key = `${button.kind}:${button.kind === "values" ? `v${button.valueIndex}` : button.field.colIndex}`;
        const opens = button.kind !== "values";
        return (
          <button
            key={key}
            type="button"
            className="spreadsheet-pivot-chart-button"
            data-kind={button.kind}
            data-filtered={button.filtered ? "true" : undefined}
            data-testid={`spreadsheet-pivot-chart-field-button-${chartId}-${key}`}
            aria-haspopup={opens ? "menu" : undefined}
            aria-expanded={opens ? openKey === key : undefined}
            aria-label={
              opens
                ? `${button.field.caption}: ${button.filtered ? labels.filtered : labels.menu}`
                : button.field.caption
            }
            title={button.field.caption}
            disabled={disabled && opens}
            onPointerDown={(event) => {
              event.stopPropagation();
              onPress?.();
            }}
            onClick={(event) => {
              event.stopPropagation();
              if (!opens) return;
              onOpen(button, event.currentTarget.getBoundingClientRect());
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onContextMenu(button, event);
            }}
          >
            <span className="spreadsheet-pivot-chart-button__label">
              {button.field.caption}
            </span>
            {opens ? (
              <span className="spreadsheet-pivot-chart-button__arrow">
                {button.filtered ? <FilterMark /> : <DropArrow />}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export interface PivotChartExpandCollapseProps {
  chartId: string;
  disabled?: boolean;
  labels: { expand: string; collapse: string };
  onExpandCollapse: (expand: boolean) => void;
  onPress?: () => void;
}

/** Excel's Expand Entire Field (+) and Collapse Entire Field (-) buttons. */
export function PivotChartExpandCollapseButtons({
  chartId,
  disabled,
  labels,
  onExpandCollapse,
  onPress,
}: PivotChartExpandCollapseProps): ReactElement {
  return (
    <div className="spreadsheet-pivot-chart-buttons__row" data-align="end">
      {([true, false] as const).map((expand) => (
        <button
          key={expand ? "expand" : "collapse"}
          type="button"
          className="spreadsheet-pivot-chart-button"
          data-kind="expand-collapse"
          data-testid={`spreadsheet-pivot-chart-${expand ? "expand" : "collapse"}-field-${chartId}`}
          aria-label={expand ? labels.expand : labels.collapse}
          title={expand ? labels.expand : labels.collapse}
          disabled={disabled}
          onPointerDown={(event) => {
            event.stopPropagation();
            onPress?.();
          }}
          onClick={(event) => {
            event.stopPropagation();
            onExpandCollapse(expand);
          }}
        >
          <svg viewBox="0 0 9 9" width="9" height="9" aria-hidden="true">
            <path d="M1.5 4.5h6" stroke="currentColor" strokeWidth="1.2" />
            {expand ? <path d="M4.5 1.5v6" stroke="currentColor" strokeWidth="1.2" /> : null}
          </svg>
        </button>
      ))}
    </div>
  );
}
