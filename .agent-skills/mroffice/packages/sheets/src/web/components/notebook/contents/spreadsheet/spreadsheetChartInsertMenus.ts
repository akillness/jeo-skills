/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { chartMatrixSupportsType } from "../../../../lib/spreadsheet/drawing-buttons";
import { spreadsheetChartTypeForLeaf } from "@mrnote/core/web/lib/spreadsheet/chart-v2-binding.ts";
import { officeChartHostSupport, officeChartInsertLeaves } from "@mrnote/core/web/lib/office-charts/catalog.ts";
import { OFFICE_SMARTART_GALLERY_LAYOUT_IDS } from "@mrnote/core/web/lib/office-smartart/catalog.ts";
import { type ChartFamily } from "@mrnote/core/web/components/console/editor/extensions/chartBlockShared.ts";
import { profileChartMatrix, recommendChartTypes, type ChartMatrixProfile } from "../../../../lib/spreadsheet/chart-recommendations";
import { pointsFromRows } from "@mrnote/core/web/components/notebook/contents/MiniChart.tsx";
import { type SpreadsheetChartLegendMenuPosition, type SpreadsheetChartType } from "@mrnote/core/web/lib/spreadsheet/chart.ts";
import { computePivot, headerLabel, valueFieldLabel, type PivotConfig, type PivotFieldProfile, type PivotMatrix, type PivotNativeScalarMatrix } from "@mrnote/core/web/lib/spreadsheet/pivot.ts";

/**
 * Shape Format > Outline weight, in the PIXELS a sheet object stores, derived
 * from Excel's own point ladder through the ONE shared table -- so the sheet,
 * the deck and the document offer the same nine weights instead of three
 * hand-written sets in two units (audit 64). Zero stays at the front: it is
 * "no outline", which is not a weight Office's submenu lists.
 */


/** Chart Elements → Legend, in Excel's own menu order. */
/**
 * The worksheet's names for the shared Chart Design tab's commands and Add
 * Chart Element rows (the deck's id is the key). Every row under an element
 * is `spreadsheet-ribbon-chart-element-<element>-<row>`, as the sheet's own
 * menu always named them; the suites address these.
 */
export function spreadsheetChartDesignTestId(deckId: string): string | undefined {
  const renamed: Record<string, string> = {
    "presentation-chart-elements": "spreadsheet-ribbon-chart-design-add-element",
    "presentation-chart-colors": "spreadsheet-ribbon-chart-change-colors",
    "presentation-chart-switch-data": "spreadsheet-ribbon-chart-switch-row-column",
    "presentation-chart-move": "spreadsheet-ribbon-chart-move",
    "presentation-chart-element-axisTitleX":
      "spreadsheet-ribbon-chart-element-axis-title-x",
    "presentation-chart-element-axisTitleY":
      "spreadsheet-ribbon-chart-element-axis-title-y",
    "presentation-chart-up-down-bars-shown":
      "spreadsheet-ribbon-chart-element-up-down-bars-show",
    "presentation-chart-lines-highLow": "spreadsheet-ribbon-chart-element-lines-high-low",
    "presentation-chart-error-bars-percentage":
      "spreadsheet-ribbon-chart-element-error-bars-percent",
    "presentation-chart-error-bars-standardDeviation":
      "spreadsheet-ribbon-chart-element-error-bars-stddev",
    "presentation-chart-error-bars-standardError":
      "spreadsheet-ribbon-chart-element-error-bars-standard-error",
  };
  if (renamed[deckId]) return renamed[deckId];
  const label = /^presentation-chart-data-label-position-(.+)$/.exec(deckId);
  if (label) return `spreadsheet-ribbon-chart-element-data-labels-${label[1]}`;
  const row =
    /^presentation-chart-(legend|trendline|error-bars|up-down-bars|lines|data-table|axis|gridlines)-(.+)$/.exec(
      deckId,
    );
  return row ? `spreadsheet-ribbon-chart-element-${row[1]}-${row[2]}` : undefined;
}

export const SPREADSHEET_CHART_LEGEND_LABEL_KEYS = {
  right: "spreadsheet.chartLegendRight",
  top: "spreadsheet.chartLegendTop",
  left: "spreadsheet.chartLegendLeft",
  bottom: "spreadsheet.chartLegendBottom",
} as const satisfies Record<SpreadsheetChartLegendMenuPosition, string>;

export interface PivotRecommendationDraft {
  readonly sheetId: string;
  readonly source: string;
  /** The table the source IS, when the active cell was inside one. */
  readonly sourceTableId?: string;
  /** What the dialog says it read: the table's name, or the A1 range. */
  readonly sourceLabel: string;
  readonly matrix: string[][];
  readonly scalarMatrix: PivotNativeScalarMatrix;
  readonly fields: PivotFieldProfile[];
  readonly recommendations: PivotConfig[];
  readonly previews: PivotRecommendationPreview[];
  readonly selectedIndex: number;
}

/** Selections up to this many cells read their chart matrix during render;
 * larger ones build the same matrix in row chunks off the render path and
 * report the chart commands as calculating until it is complete. Every gate
 * and recommendation then sees the whole selection, never a sample. */
export const CHART_SELECTION_SYNC_CELLS = 20_000;
export const CHART_SELECTION_CHUNK_ROWS = 2_000;
/** Results still streaming in or a selection still moving would only restart
 * a large build, so it starts after this quiet interval. */
export const CHART_SELECTION_DEFER_MS = 250;
/** One profile per selection matrix identity: the ribbon's chart gates and the
 * recommendation ranking all read the same numeric-column analysis instead of
 * each walking the matrix again. */
export const chartMatrixProfiles = new WeakMap<object, ChartMatrixProfile>();
export function chartProfileFor(matrix: string[][]): ChartMatrixProfile {
  let profile = chartMatrixProfiles.get(matrix);
  if (!profile) {
    profile = profileChartMatrix(matrix);
    chartMatrixProfiles.set(matrix, profile);
  }
  return profile;
}
/** The recommendation list one selection matrix yields: supported round-trip
 * families, else a line chart when the data allows one, else nothing. */
export function recommendSafeChartTypes(
  matrix: string[][],
): ReturnType<typeof recommendChartTypes> {
  if (pointsFromRows(matrix).length === 0) return [];
  const profile = chartProfileFor(matrix);
  const safe = recommendChartTypes(matrix, profile).filter(
    ({ type }) =>
      RECOMMENDED_CHART_ROUNDTRIP_TYPES.has(type) &&
      chartMatrixSupportsType(matrix, type, true, undefined, profile),
  );
  return safe.length > 0
    ? safe
    : chartMatrixSupportsType(matrix, "line", true, undefined, profile)
      ? [{ type: "line", reason: "general" }]
      : [];
}

// Excel's Insert ▸ Charts is a row of per-family split buttons, and each button
// owns a block of the ONE shared chart catalog, in Excel's order (Excel for Mac
// and for Windows alike): Insert Column or Bar Chart, Insert Line or Area
// Chart, Insert Pie or Doughnut Chart, Insert Hierarchy Chart, Insert
// Statistic Chart, Insert Scatter (X, Y) or Bubble Chart, Insert Waterfall,
// Funnel, Stock, Surface or Radar Chart, Insert Combo Chart, Maps. These are
// those blocks; every list here is filtered through the shared host table so
// that table stays the single gate rather than a second opinion.
export const SPREADSHEET_CHART_MENU_FAMILIES = {
  column: ["column", "bar"],
  line: ["line", "area"],
  pie: ["pie"],
  hierarchy: ["hierarchy"],
  statistical: ["statistical"],
  scatter: ["xy"],
  other: ["waterfall", "funnel", "stock", "surface", "radar"],
  combo: ["combo"],
  map: ["map"],
} as const satisfies Record<string, readonly ChartFamily[]>;

/**
 * Insert Chart ▸ All Charts lists the kinds in Excel's own order (Column,
 * Line, Pie, Bar, Area, X Y (Scatter), Map, Stock, Surface, Radar, then the
 * newer kinds, then Combo), not in the Insert buttons' blocks.
 */
export const SPREADSHEET_ALL_CHARTS_FAMILY_ORDER: readonly ChartFamily[] = [
  "column",
  "line",
  "pie",
  "bar",
  "area",
  "xy",
  "map",
  "stock",
  "surface",
  "radar",
  "hierarchy",
  "statistical",
  "waterfall",
  "funnel",
  "combo",
];

export type SpreadsheetChartMenuId = keyof typeof SPREADSHEET_CHART_MENU_FAMILIES;

/** XLS-A017: the Insert button (and its authority) that inserts a family. */
export function spreadsheetChartMenuForFamily(family: ChartFamily): SpreadsheetChartMenuId {
  for (const menu of Object.keys(SPREADSHEET_CHART_MENU_FAMILIES) as SpreadsheetChartMenuId[]) {
    if ((SPREADSHEET_CHART_MENU_FAMILIES[menu] as readonly ChartFamily[]).includes(family)) return menu;
  }
  return "column";
}

/** The authority control of an Insert chart button (Excel's Maps button is
 * `XLSCTL.INSERT.CHART.MAP`, the others `..._MENU`). */
export function spreadsheetChartMenuControlId(menu: SpreadsheetChartMenuId): string {
  return menu === "map" ? "XLSCTL.INSERT.CHART.MAP" : `XLSCTL.INSERT.CHART.${menu.toUpperCase()}_MENU`;
}

/** All Charts' kinds this host inserts, in Excel's order. */
export function spreadsheetAllChartsFamilies(): readonly ChartFamily[] {
  return SPREADSHEET_ALL_CHARTS_FAMILY_ORDER.filter((family) => officeChartHostSupport("spreadsheet", family));
}

export function spreadsheetChartMenuFamilies(
  menu: SpreadsheetChartMenuId,
): readonly ChartFamily[] {
  return SPREADSHEET_CHART_MENU_FAMILIES[menu].filter((family) =>
    officeChartHostSupport("spreadsheet", family),
  );
}

/**
 * The native kinds each button's block can insert. The button's own authority
 * control is what a gallery card executes through, so the writer accepts a
 * receipt only for a kind that button actually offers.
 */
export const SPREADSHEET_CHART_MENU_TYPES = Object.fromEntries(
  (Object.keys(SPREADSHEET_CHART_MENU_FAMILIES) as SpreadsheetChartMenuId[]).map(
    (menu) => {
      const families = spreadsheetChartMenuFamilies(menu);
      return [
        menu,
        new Set(
          officeChartInsertLeaves("spreadsheet")
            .filter((leaf) => families.includes(leaf.family))
            .flatMap((leaf) => {
              const insert = spreadsheetChartTypeForLeaf(
                leaf.family,
                leaf.subtype,
              );
              return insert ? [insert.type] : [];
            }),
        ) as ReadonlySet<SpreadsheetChartType>,
      ];
    },
  ),
) as Record<SpreadsheetChartMenuId, ReadonlySet<SpreadsheetChartType>>;

// The layouts 转换为可编辑 offers, in catalog order: the same set the
// worksheet's Insert gallery offers (Office's one gallery, shared by the three
// editors), because a converted diagram becomes an ordinary inserted one and
// must be buildable by the same projection.
const SPREADSHEET_SMARTART_CONVERT_ITEMS: readonly string[] = OFFICE_SMARTART_GALLERY_LAYOUT_IDS;

// Recommended Charts uses the same fixed-point boundary, minus Radar because
// the recommendation engine does not currently recommend it.
export const RECOMMENDED_CHART_ROUNDTRIP_TYPES = new Set<SpreadsheetChartType>([
  "column",
  "bar",
  "line",
  "pie",
  "area",
  "doughnut",
  "scatter",
  "bubble",
  "combo",
]);

const MAX_PIVOT_RECOMMENDATION_PREVIEW_ROWS = 4;
const MAX_PIVOT_RECOMMENDATION_PREVIEW_COLUMNS = 4;

interface PivotRecommendationPreview {
  readonly columnHeaders: string[];
  /** Per preview column, its value field's own number format, if any. */
  readonly columnNumberFormats: Array<string | undefined>;
  readonly rows: Array<{
    readonly label: string;
    readonly values: Array<number | null>;
  }>;
  readonly truncated: boolean;
}

export function buildPivotRecommendationPreview(
  matrix: PivotMatrix,
  config: PivotConfig,
): PivotRecommendationPreview {
  const result = computePivot(matrix, config);
  const previewColumns = result.colHeaders.slice(
    0,
    MAX_PIVOT_RECOMMENDATION_PREVIEW_COLUMNS,
  );
  const columnNumberFormats = previewColumns.map(
    (column) => config.values[column.valueIndex]?.numberFormat,
  );
  const columnHeaders = previewColumns
    .map((column) => {
      const field = config.values[column.valueIndex];
      const valueLabel = field
        ? valueFieldLabel(field, headerLabel(matrix, field.colIndex))
        : "";
      return [...column.columnValues, valueLabel].filter(Boolean).join(" / ");
    });
  const rows = result.rowHeaders
    .slice(0, MAX_PIVOT_RECOMMENDATION_PREVIEW_ROWS)
    .map((rowValues, rowIndex) => ({
      label: rowValues.filter(Boolean).join(" / "),
      values: (result.cells[rowIndex] ?? []).slice(
        0,
        MAX_PIVOT_RECOMMENDATION_PREVIEW_COLUMNS,
      ),
    }));
  return {
    columnHeaders,
    columnNumberFormats,
    rows,
    truncated:
      result.rowHeaders.length > MAX_PIVOT_RECOMMENDATION_PREVIEW_ROWS ||
      result.colHeaders.length > MAX_PIVOT_RECOMMENDATION_PREVIEW_COLUMNS,
  };
}
