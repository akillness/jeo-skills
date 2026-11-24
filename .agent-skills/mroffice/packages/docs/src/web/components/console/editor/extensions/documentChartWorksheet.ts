/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { parseCsv } from "@mrnote/core/web/lib/spreadsheet/csv.ts";
import {
  MAX_CHART_CATEGORIES,
  MAX_CHART_SERIES,
  MAX_CHART_TEXT_CHARS,
  type ChartPointValue,
} from "@mrnote/core/web/components/console/editor/extensions/chartBlockShared.ts";

type WorksheetSeries = { name: string; values: ChartPointValue[] };

/** Same orientation as the native ChartData worksheet: first row = series,
 * first column = categories. A pasted rectangle is one validated operation,
 * never a sequence of partial chart writes. Spreadsheet owns TSV parsing. */
export function pasteDocumentChartWorksheet<Series extends WorksheetSeries>(
  categories: readonly string[],
  series: readonly Series[],
  startRow: number,
  startColumn: number,
  text: string,
  options: { maxSeries?: number; lockSeriesStructure?: boolean; blankCells?: boolean } = {},
): { categories: string[]; series: Series[] } | null {
  if (
    !Number.isInteger(startRow) ||
    !Number.isInteger(startColumn) ||
    startRow < 0 ||
    startColumn < 0 ||
    text.length > 256_000
  )
    return null;
  const rows = parseCsv(text, "\t");
  if (!rows.length || !rows[0].length) return null;
  const width = rows[0].length;
  if (rows.some((row) => row.length !== width)) return null;
  const maxSeries = Math.min(
    options.maxSeries ?? MAX_CHART_SERIES,
    MAX_CHART_SERIES,
  );
  // Growing a worksheet requires explicit row/series commands. A paste must
  // not invent categories, alter stock roles or silently truncate the source.
  if (
    startRow + rows.length > categories.length + 1 ||
    startColumn + width > series.length + 1 ||
    categories.length > MAX_CHART_CATEGORIES ||
    series.length > maxSeries
  )
    return null;
  const nextCategories = [...categories];
  const nextSeries = series.map((entry) => ({
    ...entry,
    values: [...entry.values],
  }));
  for (let r = 0; r < rows.length; r += 1) {
    for (let c = 0; c < width; c += 1) {
      const row = startRow + r,
        column = startColumn + c;
      const value = rows[r][c];
      if (row === 0 && column === 0) continue; // non-data corner heading
      if (row === 0 || column === 0) {
        if (!value.trim() || value.length > MAX_CHART_TEXT_CHARS) return null;
        if (row === 0) {
          if (
            options.lockSeriesStructure &&
            nextSeries[column - 1].name !== value
          )
            return null;
          nextSeries[column - 1].name = value;
        } else nextCategories[row - 1] = value;
      } else {
        if (!value.trim()) {
          // A pasted empty cell is a blank point where the chart takes one.
          if (!options.blankCells) return null;
          nextSeries[column - 1].values[row - 1] = null;
          continue;
        }
        const number = Number(value);
        if (!Number.isFinite(number) || Math.abs(number) > 1e15) return null;
        nextSeries[column - 1].values[row - 1] = number;
      }
    }
  }
  return { categories: nextCategories, series: nextSeries };
}
