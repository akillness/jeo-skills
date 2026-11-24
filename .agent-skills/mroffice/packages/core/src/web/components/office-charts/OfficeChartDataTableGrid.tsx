"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A chart's data table (Add Chart Element > Data Table), as Office draws it
 * under the plot inside the chart: a column per category, a row per series
 * led by its legend key, the borders Format Data Table > Table Borders keeps.
 * The one grid the deck and the worksheet draw (`lib/office-charts/
 * data-table` reads the table and its band; each host hands the colours its
 * picture paints the series in).
 */
import type { CSSProperties } from "react";

import { officeChartDataTableCellEdges, type OfficeChartDataTable } from "../../lib/office-charts/data-table";

/** A line series' key in a data table: the legend's line, its marker in the
 * middle (Excel's "─●─", C29_ChartDataTable), px. */
export const OFFICE_TABLE_LINE_KEY_PX = 22;

export function OfficeChartDataTableGrid({
  table,
  colors,
  rowPx,
  heightPx,
  style,
  className,
  ariaLabel,
  frameTestId,
  testId,
  keyTestId,
  valueAlign = "center",
  plotSpan,
  openCorner = false,
  keyShapes,
  rowHeightsPx,
  wrapNames = false,
  nameLines,
  headerLines = 1,
  keyPx = 6,
}: {
  table: OfficeChartDataTable;
  /** Each series' legend key colour, by the series' place. */
  colors: readonly (string | undefined)[];
  /** One row's height and the band's, px. */
  rowPx: number;
  heightPx: number;
  /** The table's own text and frame (Format Data Table, the chart's text). */
  style?: CSSProperties;
  /** A host's own class for the grid (its theme's ink and rules). */
  className?: string;
  ariaLabel: string;
  frameTestId: string;
  testId: string;
  keyTestId: string;
  /** Where a value sits in its cell (Excel centres it). */
  valueAlign?: "center" | "right";
  /**
   * The plot area's span across the picture, px: Office lays the table's
   * category columns under the plot, a column per category band, and its
   * series names in the room left of the plot (R11_bootstrap70). Without
   * it the table spans the host's width.
   */
  plotSpan?: Readonly<{ leftPx: number; widthPx: number }>;
  /** The corner above the series names drawn without lines (Excel's). */
  openCorner?: boolean;
  /** Each series' key when it is the legend's line (and marker) rather than
   * the filled square, by the series' place. */
  keyShapes?: readonly ({ line: true; marker?: string } | undefined)[];
  /** Each row's own height, px (the categories' row first): a deck's table,
   * whose series rows grow by the lines a wrapped name takes. */
  rowHeightsPx?: readonly number[];
  /** The series names wrap in their column instead of being cut (PowerPoint). */
  wrapNames?: boolean;
  /** With `wrapNames`: the lines each series' name takes (a one-line name never wraps). */
  nameLines?: readonly number[];
  /** The lines the header row's category names may take (more than one: they wrap). */
  headerLines?: number;
  /** A filled legend key's side, px. */
  keyPx?: number;
}) {
  const rowStyle: CSSProperties = { height: rowPx };
  const rowStyleAt = (row: number): CSSProperties =>
    typeof rowHeightsPx?.[row] === "number" ? { height: rowHeightsPx[row] } : rowStyle;
  const rows = table.series.length + 1;
  const columns = table.categories.length + 1;
  // A table that states its frame's colour rules its cells in it too.
  const rule = typeof style?.borderColor === "string" ? style.borderColor : undefined;
  const cell: CSSProperties = className
    ? {}
    : {
        border: `1px solid ${rule ?? "var(--mrai-chart-border, #cbd5e1)"}`,
        overflow: "hidden",
        padding: "1px 3px",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        // The table's own Font > Bold reaches its cells (XW242; X-346).
        fontWeight: style?.fontWeight ?? 400,
      };
  const edges = (row: number, column: number): CSSProperties => {
    const drawn = officeChartDataTableCellEdges(table.borders, row, column, rows, columns, openCorner);
    return {
      ...cell,
      ...(drawn.top ? {} : { borderTopStyle: "none" }),
      ...(drawn.right ? {} : { borderRightStyle: "none" }),
      ...(drawn.bottom ? {} : { borderBottomStyle: "none" }),
      ...(drawn.left ? {} : { borderLeftStyle: "none" }),
    };
  };
  const grid: CSSProperties = className
    ? {}
    : {
        borderCollapse: "collapse",
        color: "var(--mrai-chart-text, #404040)",
        fontSize: 12,
        lineHeight: 1.2,
        tableLayout: "fixed",
        width: "100%",
      };
  const spanned = plotSpan && plotSpan.widthPx > 0 && plotSpan.leftPx >= 0 ? plotSpan : null;
  // Format Data Table > Fill paints behind the table's values and category
  // names only, never the whole grid nor the series names (Excel for Mac on
  // screen, R11_bootstrap70 and C29_ChartDataTable; X-068).
  const { background, backgroundColor, backgroundImage, ...stated } = style ?? {};
  // An open corner keeps the table's own frame off: the cells draw the
  // outline round the header cells and the names (a frame on the table
  // closed the corner again).
  const tableStyle: CSSProperties = openCorner ? { ...stated, border: "none", borderStyle: "none", borderWidth: 0 } : stated;
  const textFill: CSSProperties | null =
    background !== undefined || backgroundColor !== undefined || backgroundImage !== undefined
      ? {
          ...(background !== undefined ? { background } : {}),
          ...(backgroundColor !== undefined ? { backgroundColor } : {}),
          ...(backgroundImage !== undefined ? { backgroundImage } : {}),
        }
      : null;
  const filled = (text: string) => (textFill && text !== "" ? <span style={textFill}>{text}</span> : text);
  return (
    <div data-testid={frameTestId} style={{ flex: `0 0 ${heightPx}px`, overflow: "hidden" }}>
      <table
        className={className}
        data-testid={testId}
        data-legend-keys={table.legendKeys ? "true" : "false"}
        aria-label={ariaLabel}
        style={{ ...grid, ...tableStyle, marginTop: 0, ...(spanned ? { width: spanned.leftPx + spanned.widthPx } : {}) }}
      >
        {spanned ? (
          <colgroup>
            <col style={{ width: spanned.leftPx }} />
            {table.categories.map((_category, index) => (
              <col key={index} style={{ width: spanned.widthPx / Math.max(1, table.categories.length) }} />
            ))}
          </colgroup>
        ) : null}
        <thead>
          <tr style={rowStyleAt(0)}>
            <th scope="col" style={edges(0, 0)} />
            {table.categories.map((category, index) => (
              <th
                key={`${index}:${category}`}
                scope="col"
                title={category}
                style={{ ...edges(0, index + 1), ...(headerLines > 1 ? { whiteSpace: "normal", textOverflow: "clip" } : {}) }}
              >
                {filled(category)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.series.map((series, seriesIndex) => (
            <tr key={`${seriesIndex}:${series.name}`} style={rowStyleAt(seriesIndex + 1)}>
              <th
                scope="row"
                title={series.name}
                style={{
                  ...edges(seriesIndex + 1, 0),
                  textAlign: "left",
                  ...(wrapNames && (nameLines?.[seriesIndex] ?? 2) > 1
                    ? { whiteSpace: "normal", textOverflow: "clip", overflowWrap: "anywhere" }
                    : {}),
                }}
              >
                {table.legendKeys && keyShapes?.[seriesIndex]?.line ? (
                  <svg
                    aria-hidden="true"
                    data-testid={keyTestId}
                    width={OFFICE_TABLE_LINE_KEY_PX}
                    height={8}
                    viewBox={`0 0 ${OFFICE_TABLE_LINE_KEY_PX} 8`}
                    style={{ display: "inline-block", marginRight: 3, verticalAlign: "middle", overflow: "visible" }}
                  >
                    <line x1={0} y1={4} x2={OFFICE_TABLE_LINE_KEY_PX} y2={4} stroke={colors[seriesIndex] ?? "#64748b"} strokeWidth={2} />
                    {keyShapes[seriesIndex]?.marker ? (
                      keyShapes[seriesIndex]?.marker === "rect" || keyShapes[seriesIndex]?.marker === "square" ? (
                        <rect x={OFFICE_TABLE_LINE_KEY_PX / 2 - 3} y={1} width={6} height={6} fill={colors[seriesIndex] ?? "#64748b"} />
                      ) : (
                        <circle cx={OFFICE_TABLE_LINE_KEY_PX / 2} cy={4} r={3} fill={colors[seriesIndex] ?? "#64748b"} />
                      )
                    ) : null}
                  </svg>
                ) : table.legendKeys ? (
                  <span
                    aria-hidden="true"
                    data-testid={keyTestId}
                    style={{
                      display: "inline-block",
                      width: keyPx,
                      height: keyPx,
                      marginRight: 3,
                      verticalAlign: "middle",
                      background: colors[seriesIndex] ?? "#64748b",
                    }}
                  />
                ) : null}
                {series.name}
              </th>
              {series.values.map((value, valueIndex) => (
                <td
                  key={valueIndex}
                  style={{ ...edges(seriesIndex + 1, valueIndex + 1), textAlign: valueAlign }}
                >
                  {filled(value)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
