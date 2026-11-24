"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useContext, useMemo, type CSSProperties } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import type { PresentationChartBlock } from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import { POWERPOINT_DATA_TABLE, type OfficeChartDataTable } from "@mrnote/core/web/lib/office-charts/data-table.ts";
import {
  presentationChartDataTableBand,
  presentationChartDataTableBasis,
} from "../../../../lib/presentation/chart-picture-request";
import presentationChrome from "@mrnote/core/web/lib/presentation/presentation-window-shell.module.css";
import { presentationChartAreaStyleCss } from "@mrnote/core/web/lib/presentation-chart-area-style.ts";
import { chartPictureSeriesColors } from "@mrnote/core/web/lib/office-charts/chart-picture-client.ts";
import { useChartPicturePosted } from "@mrnote/core/web/lib/office-charts/chart-picture-board.ts";
import { usePresentationChartPicture } from "./PresentationChartCanvas";
import { PresentationFontAliasesContext } from "./usePresentationFontFaces";
import { presentationFontFamilyWithAssets } from "@mrnote/core/web/lib/presentation-font-face-reads.ts";
import { OfficeChartDataTableGrid } from "@mrnote/core/web/components/office-charts/OfficeChartDataTableGrid.tsx";


export type PresentationChartDataTableView = Readonly<{
  table: OfficeChartDataTable;
  /** The chart the table belongs to: its legend keys take the colours the
   * chart's picture paints the series in. */
  block: PresentationChartBlock;
  style: CSSProperties;
  /** The height the table takes from the chart's frame, design px. */
  heightPx: number;
  /** One row's height, design px: the text's size, its padding and rule. */
  rowPx: number;
}>;

/**
 * The data table a deck chart shows and the band it takes under the plot
 * (`presentationChartDataTableBasis`, one reading with the picture's request).
 */
export function presentationChartDataTableView(
  block: PresentationChartBlock,
  frameHeightPx: number,
): PresentationChartDataTableView | null {
  const basis = presentationChartDataTableBasis(block);
  if (!basis) return null;
  const inherited = basis.inherited as CSSProperties;
  // The band under the plot (the one rule the printed chart takes too).
  const band = presentationChartDataTableBand(basis, frameHeightPx);
  const { heightPx, rowPx } = band;
  const fitted: CSSProperties = band.fitted ? { fontSize: band.fitted.fontSize, lineHeight: 1.1 } : {};
  return {
    table: basis.table,
    block,
    style: { ...inherited, ...presentationChartAreaStyleCss(basis.style), ...fitted },
    heightPx,
    rowPx,
  };
}

/**
 * The table beneath the plot, laid out as PowerPoint draws it: a column per
 * category, a row per series led by its legend key.
 */
export function PresentationChartDataTable({
  view,
}: {
  view: PresentationChartDataTableView;
}) {
  const t = useTranslations("console-notebooks");
  const { table } = view;
  // The legend keys are the colours the server painted this chart's series
  // in (its posted picture); grey until the chart is drawn.
  const { contentKey } = usePresentationChartPicture(view.block);
  const picture = useChartPicturePosted(contentKey);
  const colors = useMemo(
    () => (picture ? chartPictureSeriesColors(picture, table.series.map((series) => series.name)) : []),
    [picture, table],
  );
  return (
    <OfficeChartDataTableGrid
      table={table}
      colors={colors}
      rowPx={view.rowPx}
      heightPx={view.heightPx}
      style={view.style}
      className={presentationChrome.chartDataTable}
      ariaLabel={t("presentation.ui.chart.dataTable")}
      frameTestId="presentation-chart-data-table-frame"
      testId="presentation-chart-data-table"
      keyTestId="presentation-chart-data-table-legend-key"
      valueAlign="right"
    />
  );
}

/**
 * A deck chart's data table inside its chart, as Windows PowerPoint lays it
 * out (TRIAGE C40; the picture was asked with `dataTableLayout: "plot"`): its
 * header row where the category labels were, right under the plot, a column
 * under each category band, the series names (keys first, wrapping) in their
 * column left of the plot, every row and the names' column measured by the
 * server (`ChartRenderDataTable.rowHeightsPx` / `nameColumnPx`). Laid over the
 * picture, in its px; nothing until the picture answers where.
 */
export function PresentationChartPlotDataTable({ block }: { block: PresentationChartBlock }) {
  const t = useTranslations("console-notebooks");
  const { contentKey } = usePresentationChartPicture(block);
  const picture = useChartPicturePosted(contentKey);
  const fontAliases = useContext(PresentationFontAliasesContext);
  const table = picture?.dataTable;
  if (!picture || !table || !table.rowHeightsPx || typeof table.topPx !== "number") return null;
  const nameColumnPx = table.nameColumnPx ?? 0;
  const plotLeftPx = table.plotLeftPx ?? 0;
  const left = Math.max(0, plotLeftPx - nameColumnPx);
  const grid: OfficeChartDataTable = {
    categories: table.categories,
    series: table.series.map((series) => ({ name: series.name, values: series.values })),
    legendKeys: table.legendKeys,
    borders: table.borders,
  };
  const style: CSSProperties = {
    fontSize: table.fontSize,
    color: table.color,
    // The face the server measured the table in, drawn through the deck's
    // metric clones (MRAI-Metric-*), not a bare name the host maps elsewhere.
    ...(table.fontFamily ? { fontFamily: presentationFontFamilyWithAssets(table.fontFamily, fontAliases) } : {}),
    ...(table.rule ? { borderColor: table.rule } : {}),
    ...(table.fill ? { backgroundColor: table.fill } : {}),
    lineHeight: POWERPOINT_DATA_TABLE.rowFactor,
  };
  return (
    <div
      data-testid="presentation-chart-plot-data-table"
      style={{
        position: "absolute",
        left: `${(left / picture.width) * 100}%`,
        top: `${(table.topPx / picture.height) * 100}%`,
        width: nameColumnPx + (table.plotWidthPx ?? 0),
        pointerEvents: "none",
      }}
    >
      <OfficeChartDataTableGrid
        table={grid}
        colors={table.series.map((series) => series.color)}
        rowPx={table.rowPx}
        heightPx={table.heightPx}
        rowHeightsPx={table.rowHeightsPx}
        style={style}
        ariaLabel={t("presentation.ui.chart.dataTable")}
        frameTestId="presentation-chart-data-table-frame"
        testId="presentation-chart-data-table"
        keyTestId="presentation-chart-data-table-legend-key"
        valueAlign={table.valueAlign ?? "center"}
        plotSpan={{ leftPx: nameColumnPx, widthPx: table.plotWidthPx ?? 0 }}
        openCorner
        keyShapes={table.series.map((series) => series.key)}
        wrapNames
        nameLines={table.nameLines}
        headerLines={table.headerLines ?? 1}
        keyPx={Math.max(4, Math.round(table.fontSize * 0.55))}
      />
    </div>
  );
}
