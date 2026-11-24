/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useMemo, type ReactElement } from "react";

import {
  createChartBlockAttrsV2,
  type ChartBlockAttrsV2,
} from "@mrnote/core/web/components/console/editor/extensions/chartBlockShared.ts";
import {
  hasPivotChartData,
  pivotChartDataToRows,
  type PivotChartData,
} from "@mrnote/core/web/lib/spreadsheet/pivot-chart.ts";
import {
  withSpreadsheetChartV2,
  type SpreadsheetChartLike,
} from "@mrnote/core/web/lib/spreadsheet/chart-v2-model.ts";
import SpreadsheetChartCanvas from "./spreadsheet/SpreadsheetChartCanvas";

const WIDTH = 380;
const HEIGHT = 200;

/**
 * A PivotTable's result as the one chart model: a clustered column chart
 * (the chart Excel's Insert PivotChart starts from) whose categories are the
 * row groups (the PivotChart's axis field) and whose series are the output
 * columns (its legend field), with the legend on the right as a PivotChart
 * places it. Null when the result exceeds the model's bounds.
 */
export function pivotChartModel(data: PivotChartData): ChartBlockAttrsV2 | null {
  try {
    return createChartBlockAttrsV2("column", "clustered", {
      data: {
        kind: "category",
        categories: [...data.categories],
        ...(data.categoryLevels ? { categoryLevels: data.categoryLevels.map((level) => [...level]) } : {}),
        series: data.series.map((series) => ({
          name: series.name,
          // A gap stays a gap (the model reads NaN as no point).
          values: series.values.map((value) => value ?? Number.NaN),
        })),
      },
      format: { legend: "right" },
    });
  } catch {
    return null;
  }
}

/**
 * The PivotChart of the pivot panel: a read-only view bound to the pivot
 * result -- re-derived whenever the pivot recomputes, so it never drifts
 * (Microsoft Support: changes to the PivotTable's layout and data are
 * immediately reflected in the PivotChart). Drawn by the sheet's chart canvas
 * through the one chart planner, from the model above. Nothing is persisted.
 */
export default function PivotChartView({
  data,
}: {
  data: PivotChartData;
}): ReactElement | null {
  const chart = useMemo(() => {
    if (!hasPivotChartData(data)) return null;
    const rows = [
      ["", ...data.series.map((series) => series.name)],
      ...pivotChartDataToRows(data),
    ];
    const attrs = pivotChartModel(data);
    const record: SpreadsheetChartLike | null = attrs
      ? withSpreadsheetChartV2({ id: "pivot-chart", type: "column" }, attrs)
      : null;
    return { rows, record };
  }, [data]);
  if (!chart) return null;
  return (
    <div
      data-testid="spreadsheet-pivot-chart-svg"
      style={{ maxWidth: WIDTH }}
    >
      <SpreadsheetChartCanvas
        record={chart.record ?? undefined}
        type="column"
        rows={chart.rows}
        headerRow
        categoryLevels={data.categoryLevels}
        width={WIDTH}
        height={HEIGHT}
        showLegend
        legendPosition="right"
        showAxisLabels
        extendedTypes
        forceRender
      />
    </div>
  );
}
