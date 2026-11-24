/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { SVGProps } from "react";

import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import type { OfficeSemanticIconId } from "@mrnote/core/web/components/office-ribbon/icons/officeIconRegistry.ts";

export const SPREADSHEET_INSERT_ICON_NAMES = [
  "pivotTable",
  "recommendedPivot",
  "pivotChart",
  "table",
  "picture",
  "shapes",
  "smartArt",
  "chart",
  "recommendedChart",
  "chartColumn",
  "chartLine",
  "chartScatter",
  "chartPie",
  "chartBar",
  "chartStatistical",
  "chartCombo",
  "chartOther",
  "chartHierarchy",
  "chartWaterfall",
  "chartMap",
  "chartSwitch",
  "chartSelectData",
  "chartTitle",
  "chartAxisTitles",
  "chartLegend",
  "chartDataLabels",
  "chartDataTable",
  "chartAxes",
  "chartGridlines",
  "chartFormat",
  "sparkline",
  "sparklineWinLoss",
  "slicer",
  "hyperlink",
  "share",
  "copyLink",
  "sheetLink",
  "publishWeb",
  "textBox",
  "comment",
  "forms",
  "checkbox",
  "radio",
  "spinner",
  "slider",
  "overflow",
  "wordArt",
  "symbol",
  "screenshot",
  "newScript",
  "viewScripts",
  "recordActions",
  "unhideAll",
  "freezeSelection",
  "clearLinks",
  "countBlankRows",
] as const;

export type SpreadsheetInsertIconName =
  (typeof SPREADSHEET_INSERT_ICON_NAMES)[number];

/** Spreadsheet Insert adapter for the shared Office semantic SVG system. */
export const SPREADSHEET_INSERT_SEMANTIC_ICON_IDS: Readonly<
  Partial<Record<SpreadsheetInsertIconName, OfficeSemanticIconId>>
> = Object.freeze({
  table: "table.insert",
  chart: "chart.insert",
  chartColumn: "chart.type.column",
  chartLine: "chart.type.line",
  chartScatter: "chart.type.scatter",
  chartPie: "chart.type.pie",
  chartBar: "chart.type.bar",
  chartStatistical: "chart.type.statistical",
  chartCombo: "chart.type.combo",
  chartOther: "chart.type.other",
  chartSwitch: "chart.switchRowColumn",
  chartSelectData: "chart.selectData",
  chartTitle: "chart.title",
  chartAxisTitles: "chart.axisTitles",
  chartLegend: "chart.legend",
  chartDataLabels: "chart.dataLabels",
  chartDataTable: "chart.dataTable",
  chartAxes: "chart.axes",
  chartGridlines: "chart.gridlines",
  chartFormat: "chart.format",
  picture: "image.insert",
  shapes: "shape.insert",
  smartArt: "diagram.smartArt.insert",
  symbol: "symbol.insert",
  hyperlink: "link.insert",
  textBox: "textBox.insert",
  comment: "comment.add",
  overflow: "overflow.more",
});

interface SpreadsheetInsertIconProps
  extends Omit<SVGProps<SVGSVGElement>, "children" | "name"> {
  name: SpreadsheetInsertIconName;
  size?: number;
}

/** Shared 17x17 optical frames keep every Chart Design glyph centered. */
function chartAxesFrame() {
  return (
    <path
      className="docs-home-icon__ink"
      d="M4.5 4v15.5H20"
      data-chart-icon-frame="axes"
    />
  );
}

function chartPanelFrame() {
  return (
    <rect
      className="docs-home-icon__paper"
      data-chart-icon-frame="panel"
      height="17"
      rx="1.25"
      width="17"
      x="3.5"
      y="3.5"
    />
  );
}

function glyph(name: SpreadsheetInsertIconName) {
  switch (name) {
    case "pivotTable":
      return (
        <>
          <rect className="docs-home-icon__paper" x="3.5" y="3.5" width="13" height="16" rx="1" />
          <path className="docs-home-icon__accent-fill" d="M4.5 4.5h11v3h-11z" />
          <path className="docs-home-icon__ink-soft" d="M8 3.5v16m4.2-16v16M3.5 11h13m-13 4.2h13" />
          <path className="docs-home-icon__accent" d="M18.2 10.5h2.3v7.2m0 0-2.2-2.2m2.2 2.2-2.2 2.2M20.5 13h-3.2" />
        </>
      );
    case "pivotChart":
      // A PivotTable with the chart it drives standing in front of it: the
      // table keeps the PivotTable glyph's accent field band, and the chart
      // card repeats the accent in its tallest column.
      return (
        <>
          <rect className="docs-home-icon__paper" x="2.5" y="3" width="14" height="12.5" rx="1.2" />
          <path className="docs-home-icon__accent-fill" d="M3.5 4h12v2.8h-12z" />
          <path className="docs-home-icon__ink-soft" d="M7 6.8v8.7M2.5 10.6h6" />
          <rect className="docs-home-icon__paper" x="9" y="9" width="12.5" height="12" rx="1.5" />
          <path className="docs-home-icon__accent-fill" d="M11.4 15.6h2v3.4h-2zM14.3 12h2v7h-2zM17.2 14h2v5h-2z" />
        </>
      );
    case "recommendedPivot":
      return (
        <>
          <rect className="docs-home-icon__ink" x="3.5" y="5" width="14" height="14" rx="1" />
          <path className="docs-home-icon__ink-soft" d="M8.2 5v14m4.6-14v14M3.5 9.7h14m-14 4.7h14" />
          <path className="docs-home-icon__accent-fill" d="m19 3 .8 2.1L22 6l-2.2.8L19 9l-.8-2.2L16 6l2.2-.9L19 3Z" />
        </>
      );
    case "table":
      return (
        <>
          <rect className="docs-home-icon__paper" x="3.5" y="4" width="17" height="16" rx="1" />
          <path className="docs-home-icon__accent-fill" d="M4.5 5h15v3.5h-15z" />
          <path className="docs-home-icon__ink-soft" d="M9 4v16m6-16v16M3.5 12h17m-17 4h17" />
        </>
      );
    case "picture":
      return (
        <>
          <rect className="docs-home-icon__ink" x="3.5" y="4" width="17" height="15" rx="1.5" />
          <circle className="docs-home-icon__accent-fill" cx="8" cy="8.3" r="1.7" />
          <path className="docs-home-icon__accent" d="m5.5 17 4.5-4.6 2.6 2.5 2.3-2.2 3.6 4.3" />
        </>
      );
    case "shapes":
      return (
        <>
          <rect className="docs-home-icon__accent-fill" x="3.5" y="4" width="9" height="9" rx="1.4" />
          <circle className="docs-home-icon__ink" cx="15.5" cy="15.5" r="5" />
          <path className="docs-home-icon__ink-soft" d="m17 4 4 7h-8l4-7Z" />
        </>
      );
    case "smartArt":
      return (
        <>
          <rect className="docs-home-icon__accent-fill" x="3.5" y="4" width="7" height="5" rx="1" />
          <rect className="docs-home-icon__paper" x="13.5" y="4" width="7" height="5" rx="1" />
          <rect className="docs-home-icon__paper" x="8.5" y="15" width="7" height="5" rx="1" />
          <path className="docs-home-icon__accent" d="M7 9v3h10V9m-5 3v3" />
        </>
      );
    case "chart":
      return (
        <>
          <path className="docs-home-icon__ink" d="M4 4v16h16" />
          <path className="docs-home-icon__accent-fill" d="M6 13h3v5H6zm5-5h3v10h-3zm5 3h3v7h-3z" />
          <path className="docs-home-icon__danger" d="m6 10 4-3 3 2 5-5" />
        </>
      );
    case "recommendedChart":
      return (
        <>
          <path className="docs-home-icon__ink" d="M3.5 5v15h15" />
          <path className="docs-home-icon__accent-fill" d="M5.5 13h3v5h-3zm5-4h3v9h-3z" />
          <path className="docs-home-icon__accent" d="m18 3 .8 2.2L21 6l-2.2.8L18 9l-.8-2.2L15 6l2.2-.8L18 3Z" />
        </>
      );
    case "chartColumn":
      return (
        <>
          <path className="docs-home-icon__ink" d="M4 4v16h16" />
          <path className="docs-home-icon__accent-fill" d="M6.2 13h3v5h-3zm4.5-5h3v10h-3zm4.5 3h3v7h-3z" />
        </>
      );
    case "chartLine":
      return (
        <>
          <path className="docs-home-icon__ink" d="M4 4v16h16" />
          <path className="docs-home-icon__accent" d="m6 15 4-5 3.5 2.5L18.5 7" />
          <circle className="docs-home-icon__accent-fill" cx="6" cy="15" r="1" />
          <circle className="docs-home-icon__accent-fill" cx="10" cy="10" r="1" />
          <circle className="docs-home-icon__accent-fill" cx="13.5" cy="12.5" r="1" />
          <circle className="docs-home-icon__accent-fill" cx="18.5" cy="7" r="1" />
        </>
      );
    case "chartScatter":
      return (
        <>
          <path className="docs-home-icon__ink" d="M4 4v16h16" />
          <circle className="docs-home-icon__accent-fill" cx="7" cy="15.5" r="1.25" />
          <circle className="docs-home-icon__ink-soft" cx="10" cy="11" r="1.25" />
          <circle className="docs-home-icon__accent-fill" cx="14" cy="13" r="1.25" />
          <circle className="docs-home-icon__ink-soft" cx="17.5" cy="7.5" r="1.25" />
        </>
      );
    case "chartPie":
      return (
        <>
          <path className="docs-home-icon__paper" d="M11 3.5a8.5 8.5 0 1 0 8.5 8.5H11V3.5Z" />
          <path className="docs-home-icon__accent-fill" d="M13 3.5V10h6.5A8.5 8.5 0 0 0 13 3.5Z" />
          <path className="docs-home-icon__accent" d="M13 3.5V10h6.5" />
        </>
      );
    case "chartBar":
      return (
        <>
          <path className="docs-home-icon__ink" d="M4 4v16h16" />
          <path className="docs-home-icon__accent-fill" d="M6 6.5h10v3H6zm0 4.5h13v3H6zm0 4.5h7v3H6z" />
        </>
      );
    case "chartStatistical":
      return (
        <>
          <path className="docs-home-icon__ink" d="M4 4v16h16" />
          <path className="docs-home-icon__accent-fill" d="M6 14h2.5v4H6zm3.3-5h2.5v9H9.3zm3.3-2h2.5v11h-2.5zm3.3 4h2.5v7h-2.5z" />
          <path className="docs-home-icon__accent" d="M5.5 13c2.6-1.8 3.6-6 7.2-6 3.1 0 3.9 3.4 6.3 4.2" />
        </>
      );
    case "chartCombo":
      return (
        <>
          <path className="docs-home-icon__ink" d="M4 4v16h16" />
          <path className="docs-home-icon__ink-soft" d="M6 13h3v5H6zm5-4h3v9h-3zm5 2h3v7h-3z" />
          <path className="docs-home-icon__accent" d="m6 10 4-3 3.5 2 5-4" />
          <circle className="docs-home-icon__accent-fill" cx="18.5" cy="5" r="1" />
        </>
      );
    case "chartOther":
      return (
        <>
          <rect className="docs-home-icon__paper" x="3.5" y="4" width="7" height="7" rx="1" />
          <path className="docs-home-icon__accent" d="M5 9 7 6.5 9 8" />
          <rect className="docs-home-icon__paper" x="13.5" y="4" width="7" height="7" rx="1" />
          <path className="docs-home-icon__accent-fill" d="M15.3 9V7h1.4v2h1.1V5.7h1.4V9z" />
          <rect className="docs-home-icon__paper" x="3.5" y="14" width="17" height="6" rx="1" />
          <circle className="docs-home-icon__accent-fill" cx="8" cy="17" r="1.2" />
          <circle className="docs-home-icon__ink-soft" cx="12" cy="16" r="1.2" />
          <circle className="docs-home-icon__accent-fill" cx="16" cy="18" r="1.2" />
        </>
      );
    case "chartHierarchy":
      // A treemap: one branch's tile beside two smaller ones.
      return (
        <>
          <rect className="docs-home-icon__accent-fill" x="4" y="4" width="8.5" height="16" rx="0.5" />
          <rect className="docs-home-icon__paper" x="13.5" y="4" width="6.5" height="8.5" rx="0.5" />
          <rect className="docs-home-icon__ink-soft" x="13.5" y="13.5" width="6.5" height="6.5" rx="0.5" />
        </>
      );
    case "chartWaterfall":
      // Columns that rise and fall from one running total.
      return (
        <>
          <path className="docs-home-icon__ink" d="M4 4v16h16" />
          <path className="docs-home-icon__accent-fill" d="M6 11h2.5v7H6zm3.3-4h2.5v4H9.3zm6.6 2h2.5v9h-2.5z" />
          <path className="docs-home-icon__ink-soft" d="M12.6 7h2.5v3h-2.5z" />
        </>
      );
    case "chartMap":
      // A folded map with a region marked on it.
      return (
        <>
          <path className="docs-home-icon__paper" d="M3.5 6.5 9 4.5l6 2 5.5-2v13l-5.5 2-6-2-5.5 2z" />
          <path className="docs-home-icon__ink-soft" d="M9 4.5v13M15 6.5v13" />
          <path className="docs-home-icon__accent-fill" d="M10.5 9.5c1.2-.9 2.9-.6 3.3.6.4 1.1-.3 2.3-1.6 2.6-1.2.3-2.2-.5-2.2-1.6 0-.6.2-1.2.5-1.6z" />
        </>
      );
    case "chartSwitch":
      return (
        <>
          {chartAxesFrame()}
          <path
            className="docs-home-icon__accent-fill"
            d="M7 13.5h2.5v4H7zm4-3.5h2.5v7.5H11zm4-3h2.5v10.5H15z"
          />
          <path
            className="docs-home-icon__accent"
            d="M7 7h9.5m-2-2 2 2-2 2M17.5 20H8m2-1.5L8 20l2 1.5"
          />
        </>
      );
    case "chartSelectData":
      return (
        <>
          {chartPanelFrame()}
          <path
            className="docs-home-icon__ink-soft"
            d="M7.75 3.5v17m4.25-17v17M3.5 9h12.75m-12.75 5.5h12.75"
          />
          <path
            className="docs-home-icon__accent"
            d="M18 7.5h2.5v9H18m-2.5-4.5h5m-2-2 2 2-2 2"
          />
        </>
      );
    case "chartTitle":
      return (
        <>
          {chartPanelFrame()}
          <rect
            className="docs-home-icon__accent-fill"
            height="2.5"
            rx=".7"
            width="10"
            x="7"
            y="6"
          />
          <path className="docs-home-icon__ink-soft" d="M6.5 17.5h11" />
          <path
            className="docs-home-icon__accent"
            d="M7.5 15v-3h2.5v3m2 0V9.5h2.5V15m2 0v-4h2"
          />
        </>
      );
    case "chartAxisTitles":
      return (
        <>
          {chartAxesFrame()}
          <path className="docs-home-icon__accent" d="m7 15 3.5-4 3 2 4-5" />
          <rect
            className="docs-home-icon__accent-fill"
            height="1.5"
            rx=".5"
            width="7"
            x="9"
            y="19.9"
          />
          <rect
            className="docs-home-icon__accent-fill"
            height="7"
            rx=".5"
            width="1.8"
            x="2"
            y="8"
          />
        </>
      );
    case "chartLegend":
      return (
        <>
          {chartPanelFrame()}
          <path className="docs-home-icon__ink-soft" d="M6 17V7h8" />
          <path className="docs-home-icon__accent" d="m6.5 15 2.8-3.5 2.2 1.8 2.8-4.3" />
          <rect className="docs-home-icon__accent-fill" height="1.8" rx=".4" width="2.4" x="16" y="7" />
          <rect className="docs-home-icon__accent-fill" height="1.8" rx=".4" width="2.4" x="16" y="11.2" />
          <rect className="docs-home-icon__accent-fill" height="1.8" rx=".4" width="2.4" x="16" y="15.4" />
        </>
      );
    case "chartDataLabels":
      return (
        <>
          {chartAxesFrame()}
          <path
            className="docs-home-icon__accent-fill"
            d="M7 14h2.75v3.5H7zm4.25-5h2.75v8.5h-2.75zm4.25 3h2.75v5.5H15.5z"
          />
          <rect className="docs-home-icon__accent" height="2" rx=".5" width="3.5" x="6.6" y="10.5" />
          <rect className="docs-home-icon__accent" height="2" rx=".5" width="3.5" x="10.9" y="5.5" />
          <rect className="docs-home-icon__accent" height="2" rx=".5" width="3.5" x="15.1" y="8.5" />
        </>
      );
    case "chartDataTable":
      return (
        <>
          {chartPanelFrame()}
          <path className="docs-home-icon__ink-soft" d="M5.5 13.5V5.5h13" />
          <path className="docs-home-icon__accent" d="m6.5 11.5 3.2-3 2.8 1.8 4.8-4" />
          <rect className="docs-home-icon__paper" height="5" rx=".7" width="14" x="5" y="15" />
          <path className="docs-home-icon__ink-soft" d="M9.7 15v5m4.6-5v5M5 17.5h14" />
        </>
      );
    case "chartAxes":
      return (
        <>
          {chartAxesFrame()}
          <path className="docs-home-icon__accent" d="M8 17.5v-6m4 6v-10m4 10v-4" />
          <path className="docs-home-icon__ink-soft" d="m3 6 1.5-2L6 6m12 12 2 1.5-2 1.5" />
        </>
      );
    case "chartGridlines":
      return (
        <>
          {chartPanelFrame()}
          <path className="docs-home-icon__ink-soft" d="M3.5 9h17m-17 5.5h17M9 3.5v17m5.5-17v17" />
          <path className="docs-home-icon__accent" d="m5.5 17.5 3.7-4.5 3 2 5.8-7" />
        </>
      );
    case "chartFormat":
      return (
        <>
          {chartPanelFrame()}
          <path className="docs-home-icon__ink-soft" d="M6 16.5V7h9.5" />
          <path className="docs-home-icon__accent" d="m7 14 3-3.5 2.5 1.8 3-4" />
          <path className="docs-home-icon__accent-fill" d="m13.5 18 5.8-5.8 2 2-5.8 5.8h-2V18Z" />
          <path className="docs-home-icon__accent" d="m18.5 13 2 2" />
        </>
      );
    case "sparkline":
      return (
        <>
          <rect className="docs-home-icon__ink" x="3.5" y="5" width="17" height="14" rx="1" />
          <path className="docs-home-icon__ink-soft" d="M3.5 12h17" />
          <path className="docs-home-icon__accent" d="m5.5 15 3-5 3 3 3.2-5 3.8 2" />
        </>
      );
    case "sparklineWinLoss":
      // Win/Loss: equal bars above or below the axis, by sign alone.
      return (
        <>
          <path className="docs-home-icon__ink-soft" d="M3.5 12h17" />
          <path className="docs-home-icon__accent-fill" d="M5 6.5h2.4V11H5zm3.9 0h2.4V11H8.9zm7.8 0h2.4V11h-2.4z" />
          <path className="docs-home-icon__ink" d="M12.8 13h2.4v4.5h-2.4z" />
        </>
      );
    case "slicer":
      return (
        <>
          <rect className="docs-home-icon__paper" x="4" y="3.5" width="16" height="17" rx="1.5" />
          <path className="docs-home-icon__accent-fill" d="M5 4.5h14v3H5z" />
          <path className="docs-home-icon__ink" d="M7 11h3m2 0h5M7 15h5m2 0h3" />
          <path className="docs-home-icon__accent" d="M11 9v4m2-4v4m0 0-1 1-1-1M13 13h-2" />
        </>
      );
    case "forms":
      return (
        <>
          <rect className="docs-home-icon__paper" x="4" y="3.5" width="16" height="17" rx="1.5" />
          <path className="docs-home-icon__accent-fill" d="M5 4.5h14v3H5z" />
          <path className="docs-home-icon__accent" d="m6.5 11 1.2 1.2 2.1-2.4m-3.3 6 1.2 1.2 2.1-2.4" />
          <path className="docs-home-icon__ink-soft" d="M12 11h5m-5 5h5" />
        </>
      );
    case "checkbox":
      return (
        <>
          <rect className="docs-home-icon__paper" x="3.5" y="3.5" width="17" height="17" rx="2" />
          <path className="docs-home-icon__accent" d="m7 12 3.2 3.2L17.5 8" />
        </>
      );
    case "radio":
      return (
        <>
          <circle className="docs-home-icon__paper" cx="12" cy="12" r="8.5" />
          <circle className="docs-home-icon__accent-fill" cx="12" cy="12" r="3.6" />
        </>
      );
    case "spinner":
      return (
        <>
          <rect className="docs-home-icon__paper" x="3.5" y="5" width="17" height="14" rx="2" />
          <path className="docs-home-icon__ink-soft" d="M15.5 5v14" />
          <path className="docs-home-icon__accent" d="m17.2 10 1.6-2 1.6 2m-3.2 4 1.6 2 1.6-2" />
          <path className="docs-home-icon__ink" d="M6.5 12h5" />
        </>
      );
    case "slider":
      return (
        <>
          <path className="docs-home-icon__ink-soft" d="M4 12h16" />
          <path className="docs-home-icon__accent" d="M4 12h8" />
          <circle className="docs-home-icon__paper" cx="12" cy="12" r="3.5" />
          <circle className="docs-home-icon__accent-fill" cx="12" cy="12" r="1.4" />
        </>
      );
    case "overflow":
      return (
        <>
          <circle className="docs-home-icon__ink" cx="6" cy="12" r="1" />
          <circle className="docs-home-icon__ink" cx="12" cy="12" r="1" />
          <circle className="docs-home-icon__ink" cx="18" cy="12" r="1" />
        </>
      );
    case "hyperlink":
      return (
        <>
          <path className="docs-home-icon__ink" d="m9.2 14.8-1.4 1.4a3.7 3.7 0 0 1-5.2-5.2l3-3a3.7 3.7 0 0 1 5.2 0" />
          <path className="docs-home-icon__ink" d="m14.8 9.2 1.4-1.4a3.7 3.7 0 0 1 5.2 5.2l-3 3a3.7 3.7 0 0 1-5.2 0" />
          <path className="docs-home-icon__accent" d="m8.5 15.5 7-7" />
        </>
      );
    case "share":
      return (
        <>
          <circle className="docs-home-icon__paper" cx="8" cy="8.5" r="3" />
          <path className="docs-home-icon__ink" d="M3.5 19c.5-3.3 2.4-5.2 4.5-5.2s4 1.9 4.5 5.2" />
          <path className="docs-home-icon__accent" d="M14 6.5h6v6m0-6-7.5 7.5" />
        </>
      );
    case "copyLink":
      return (
        <>
          <rect className="docs-home-icon__paper" x="3.5" y="4" width="12" height="14" rx="1.5" />
          <path className="docs-home-icon__ink-soft" d="M8 7h8.5A2.5 2.5 0 0 1 19 9.5V18" />
          <path className="docs-home-icon__accent" d="m10.2 14.8-1.1 1.1a2.5 2.5 0 0 0 3.6 3.6l1.8-1.8m-.7-8.5 1.1-1.1a2.5 2.5 0 0 1 3.6 3.6l-1.8 1.8m-5 3 5-5" />
        </>
      );
    case "sheetLink":
      return (
        <>
          <rect className="docs-home-icon__paper" x="3.5" y="3.5" width="13" height="17" rx="1.5" />
          <path className="docs-home-icon__accent-fill" d="M4.5 4.5h11v3h-11z" />
          <path className="docs-home-icon__ink-soft" d="M8 3.5v10m4.2-10v9M3.5 11h10" />
          <path className="docs-home-icon__accent" d="m15.2 15.8-1.1 1.1a2.3 2.3 0 0 0 3.3 3.3l1.1-1.1m.3-5.3 1.1-1.1a2.3 2.3 0 0 1 3.3 3.3l-1.1 1.1m-5.8 1 4.7-4.7" />
        </>
      );
    case "publishWeb":
      return (
        <>
          <circle className="docs-home-icon__paper" cx="10.5" cy="12.5" r="7.5" />
          <path className="docs-home-icon__ink-soft" d="M3 12.5h15M10.5 5c2.1 2 3.2 4.5 3.2 7.5s-1.1 5.5-3.2 7.5m0-15c-2.1 2-3.2 4.5-3.2 7.5s1.1 5.5 3.2 7.5" />
          <path className="docs-home-icon__accent" d="M18.5 11V4.5m0 0L16 7m2.5-2.5L21 7" />
        </>
      );
    case "comment":
      return (
        <>
          <path className="docs-home-icon__paper" d="M4 4.5h16v12H10l-4.5 3v-3H4z" />
          <path className="docs-home-icon__accent" d="M15.5 7.5v5m-2.5-2.5h5" />
        </>
      );
    case "textBox":
      return (
        <>
          <rect className="docs-home-icon__ink" x="3.5" y="5" width="17" height="14" rx="1" />
          <path className="docs-home-icon__accent" d="M7 8h10M12 8v8M9.5 16h5" />
        </>
      );
    case "wordArt":
      return (
        <>
          <path className="docs-home-icon__accent-fill" d="m3.5 19 5.2-14h2.8L17 19h-3l-1.2-3.5H7.3L6.1 19H3.5Zm4.6-6h3.8L10 7.5 8.1 13Z" />
          <path className="docs-home-icon__ink" d="m16 5 1 2.5L19.5 9 17 10.3l-1 2.7-1-2.7L12.5 9 15 7.5 16 5Z" />
        </>
      );
    case "symbol":
      return (
        <>
          <path className="docs-home-icon__ink" d="M17.5 7.5a6.5 6.5 0 1 0 0 9M7 19h10" />
          <path className="docs-home-icon__accent" d="M14.5 5.5h6m-3-3v6" />
        </>
      );
    case "screenshot":
      return (
        <>
          <rect className="docs-home-icon__paper" x="3.5" y="5" width="17" height="14" rx="1.5" />
          <path className="docs-home-icon__ink" d="M8 5 9.2 3.5h5.6L16 5" />
          <circle className="docs-home-icon__accent" cx="12" cy="12" r="3.5" />
          <circle className="docs-home-icon__accent-fill" cx="12" cy="12" r="1.2" />
        </>
      );
    case "newScript":
      return (
        <>
          <rect className="docs-home-icon__paper" x="4" y="3.5" width="14" height="17" rx="1.5" />
          <path className="docs-home-icon__ink-soft" d="M7 8h8M7 11.5h5" />
          <path className="docs-home-icon__accent" d="m10 16-2 2 2 2m4-4 2 2-2 2m-1.2-5-1.6 6" />
          <path className="docs-home-icon__accent-fill" d="M18.5 3v4m-2-2h4" />
        </>
      );
    case "viewScripts":
      return (
        <>
          <rect className="docs-home-icon__paper" x="4" y="3.5" width="14" height="17" rx="1.5" />
          <path className="docs-home-icon__ink-soft" d="M7 8h8M7 11.5h6M7 15h4" />
          <path className="docs-home-icon__accent" d="m15 15.5-1.5 1.5 1.5 1.5m3-3 1.5 1.5-1.5 1.5" />
        </>
      );
    case "recordActions":
      return (
        <>
          <rect className="docs-home-icon__paper" x="3.5" y="4" width="17" height="16" rx="2" />
          <circle className="docs-home-icon__accent-fill" cx="9" cy="12" r="3.2" />
          <path className="docs-home-icon__ink-soft" d="M14.5 9h3m-3 3h3m-3 3h3" />
        </>
      );
    case "unhideAll":
      return (
        <>
          <rect className="docs-home-icon__paper" x="3.5" y="4" width="17" height="16" rx="1.5" />
          <path className="docs-home-icon__ink-soft" d="M9 4v16m6-16v16M3.5 10h17m-17 5h17" />
          <path className="docs-home-icon__accent" d="M6 7h12m-9.5-2L6 7l2.5 2M15.5 5 18 7l-2.5 2" />
        </>
      );
    case "freezeSelection":
      return (
        <>
          <rect className="docs-home-icon__paper" x="3.5" y="4" width="17" height="16" rx="1.5" />
          <path className="docs-home-icon__ink-soft" d="M9 4v16m6-16v16M3.5 10h17m-17 5h17" />
          <path className="docs-home-icon__accent" d="M12 5.5v13m-3.2-11 6.4 9m0-9-6.4 9" />
        </>
      );
    case "clearLinks":
      return (
        <>
          <path className="docs-home-icon__ink" d="m9 15-1.4 1.4a3.5 3.5 0 0 1-5-5l2.8-2.8a3.5 3.5 0 0 1 5 0M15 9l1.4-1.4a3.5 3.5 0 0 1 5 5l-2.8 2.8a3.5 3.5 0 0 1-5 0" />
          <path className="docs-home-icon__accent" d="m5 5 14 14" />
        </>
      );
    case "countBlankRows":
      return (
        <>
          <rect className="docs-home-icon__paper" x="3.5" y="4" width="13" height="16" rx="1.5" />
          <path className="docs-home-icon__ink-soft" d="M7.8 4v16M3.5 9h13m-13 5h13" />
          <path className="docs-home-icon__accent" d="M18.5 8.5h2v2h-2zm0 5h2v2h-2zm0 5h2v2h-2z" />
        </>
      );
  }
  const exhaustive: never = name;
  return exhaustive;
}

export function SpreadsheetInsertIcon({
  name,
  size = 18,
  className,
  ...props
}: SpreadsheetInsertIconProps) {
  const semanticId = SPREADSHEET_INSERT_SEMANTIC_ICON_IDS[name];
  if (semanticId) {
    return (
      <OfficeSemanticIcon
        semanticId={semanticId}
        size={size}
        className={className}
      />
    );
  }

  return (
    <svg
      {...props}
      aria-hidden={props["aria-hidden"] ?? true}
      className={`docs-home-icon${className ? ` ${className}` : ""}`}
      data-spreadsheet-insert-icon={name}
      fill="none"
      focusable="false"
      height={size}
      shapeRendering="geometricPrecision"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1}
      viewBox="0 0 24 24"
      width={size}
    >
      {glyph(name)}
    </svg>
  );
}
