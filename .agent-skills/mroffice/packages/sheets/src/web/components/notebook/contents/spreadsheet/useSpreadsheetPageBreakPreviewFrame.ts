"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useMemo } from "react";
import { offsetOfLine } from "@mrnote/core/web/lib/spreadsheet/grid-sizing.ts";
import { pageBreakPreviewLineOffsets } from "../../../../lib/spreadsheet/page-layout-view";
import { type SheetModel } from "./spreadsheetSheetModel";
import { SPREADSHEET_HEADER_HEIGHT_PX, SPREADSHEET_HEADER_WIDTH_PX } from "./spreadsheetGridConstants";
import { type SpreadsheetPageBreakPreviewPages } from "../../../../lib/spreadsheet/page-layout-view";

/** What useSpreadsheetPageBreakPreviewFrame reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetPageBreakPreviewFrameInputs {
  pageBreakLines: { regions: SpreadsheetPageBreakPreviewPages[]; rowBreaks: number[]; colBreaks: number[]; manualRows: Set<number>; manualCols: Set<number>; } | null;
  pageLayoutColSize: (col: number) => number;
  pageLayoutRowSize: (visual: number) => number;
  renderWindow: { rowStart: number; colStart: number; rowEnd: number; colEnd: number; rows: number[]; cols: number[]; totalWidth: number; totalHeight: number; };
  sheet: SheetModel;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetPageBreakPreviewFrame({
  pageBreakLines,
  pageLayoutColSize,
  pageLayoutRowSize,
  renderWindow,
  sheet,
}: SpreadsheetPageBreakPreviewFrameInputs) {
  // pbp-pages: Excel's Page Break Preview shows what prints. The printed
  // region is white inside a solid blue outline, everything else is shaded
  // grey, and every page carries a large "Page N" in print order. All of it is
  // measured in content pixels with the same line sizes as the break lines, so
  // it scrolls, zooms and collapses hidden lines with the grid; each axis is
  // measured in one walk rather than one prefix sum per line.
  const pageBreakPreviewFrame = useMemo(() => {
    if (!pageBreakLines) return null;
    const { regions } = pageBreakLines;
    const rowOffsets = pageBreakPreviewLineOffsets(
      [...regions.flatMap((pages) => pages.rows), ...pageBreakLines.rowBreaks], sheet.rowCount, pageLayoutRowSize);
    const colOffsets = pageBreakPreviewLineOffsets(
      [...regions.flatMap((pages) => pages.cols), ...pageBreakLines.colBreaks], sheet.columnCount, pageLayoutColSize);
    const rowAt = (line: number) => SPREADSHEET_HEADER_HEIGHT_PX +
      (rowOffsets.get(line) ?? offsetOfLine(line, sheet.rowCount, pageLayoutRowSize));
    const colAt = (line: number) => SPREADSHEET_HEADER_WIDTH_PX +
      (colOffsets.get(line) ?? offsetOfLine(line, sheet.columnCount, pageLayoutColSize));
    // One measured region per print area (Excel shades everything outside
    // every area); the frame itself is their hull, the extent of the break
    // lines. A region that prints nothing is left out.
    const measured = regions.map((pages) => ({
      pages,
      top: rowAt(pages.rows[0]), bottom: rowAt(pages.rows[pages.rows.length - 1]),
      start: colAt(pages.cols[0]), end: colAt(pages.cols[pages.cols.length - 1]),
    }));
    const printed = measured.filter((region) => region.bottom > region.top && region.end > region.start);
    const hull = printed.length > 0
      ? {
          top: Math.min(...printed.map((region) => region.top)),
          bottom: Math.max(...printed.map((region) => region.bottom)),
          start: Math.min(...printed.map((region) => region.start)),
          end: Math.max(...printed.map((region) => region.end)),
        }
      : { top: measured[0].top, bottom: measured[0].bottom, start: measured[0].start, end: measured[0].end };
    return { regions: printed, rowAt, colAt, ...hull };
  }, [pageBreakLines, pageLayoutRowSize, pageLayoutColSize, sheet.rowCount, sheet.columnCount]);
  // pbp-pages: only the pages that meet the rendered grid window get a label,
  // capped, so a print area of thousands of pages never mounts thousands of
  // nodes. Numbering follows Page Setup's page order (down, then over).
  const pageBreakPreviewLabels = useMemo(() => {
    if (!pageBreakPreviewFrame) return [];
    const { regions, rowAt, colAt } = pageBreakPreviewFrame;
    const inView = (bounds: readonly number[], start: number, end: number) => {
      const indices: number[] = [];
      for (let index = 0; index + 1 < bounds.length; index += 1) {
        if (bounds[index + 1] > start && bounds[index] < end) indices.push(index);
      }
      return indices;
    };
    const labels: Array<{ key: string; page: number; top: number; start: number; width: number; height: number }> = [];
    // A later print area's pages continue the count where the previous
    // area's stopped (Excel prints the areas in order, each on its own pages).
    for (const { pages } of regions) {
      const rowPages = pages.rows.length - 1, colPages = pages.cols.length - 1;
      for (const rowPage of inView(pages.rows, renderWindow.rowStart, renderWindow.rowEnd)) {
        for (const colPage of inView(pages.cols, renderWindow.colStart, renderWindow.colEnd)) {
          if (labels.length >= 200) return labels;
          const top = rowAt(pages.rows[rowPage]), start = colAt(pages.cols[colPage]);
          const height = rowAt(pages.rows[rowPage + 1]) - top, width = colAt(pages.cols[colPage + 1]) - start;
          if (height <= 0 || width <= 0) continue;
          labels.push({
            key: `${pages.firstPage}:${rowPage}:${colPage}`,
            page: pages.firstPage + (pages.overThenDown ? rowPage * colPages + colPage : colPage * rowPages + rowPage),
            top, start, width, height,
          });
        }
      }
    }
    return labels;
  }, [pageBreakPreviewFrame, renderWindow.rowStart, renderWindow.rowEnd, renderWindow.colStart, renderWindow.colEnd]);
  // pbp-pages: grey everything no print area covers. The sheet is cut along
  // every region edge and the tiles no region covers are kept, merged along
  // each band; full-width bands come first so a single area still reads as
  // above / below / before / after. All of the sheet is grey when nothing
  // prints.
  const pageBreakPreviewShades = useMemo(() => {
    if (!pageBreakPreviewFrame) return [];
    const { regions } = pageBreakPreviewFrame;
    const sheetTop = SPREADSHEET_HEADER_HEIGHT_PX, sheetStart = SPREADSHEET_HEADER_WIDTH_PX;
    const sheetEnd = renderWindow.totalWidth, sheetBottom = renderWindow.totalHeight;
    type Shade = { key: string; top: number; start: number; width: number; height: number };
    if (regions.length === 0) {
      return [{ key: "all", top: sheetTop, start: sheetStart, width: sheetEnd - sheetStart, height: sheetBottom - sheetTop }];
    }
    const axis = (first: number, last: number, edges: number[]) =>
      Array.from(new Set([first, last, ...edges]))
        .filter((value) => value >= first && value <= last)
        .sort((a, b) => a - b);
    const ys = axis(sheetTop, sheetBottom, regions.flatMap((region) => [region.top, region.bottom]));
    const xs = axis(sheetStart, sheetEnd, regions.flatMap((region) => [region.start, region.end]));
    const covered = (y0: number, y1: number, x0: number, x1: number) => regions.some((region) =>
      region.top <= y0 + 0.25 && region.bottom >= y1 - 0.25 && region.start <= x0 + 0.25 && region.end >= x1 - 0.25);
    const shades: Shade[] = [];
    for (let row = 0; row + 1 < ys.length; row += 1) {
      const y0 = ys[row], y1 = ys[row + 1];
      if (y1 - y0 < 0.5) continue;
      let open: number | null = null;
      const close = (end: number) => {
        if (open === null) return;
        shades.push({ key: `${y0}:${open}`, top: y0, start: open, width: end - open, height: y1 - y0 });
        open = null;
      };
      for (let col = 0; col + 1 < xs.length; col += 1) {
        const x0 = xs[col], x1 = xs[col + 1];
        if (x1 - x0 < 0.5) continue;
        if (covered(y0, y1, x0, x1)) close(x0);
        else if (open === null) open = x0;
      }
      close(xs[xs.length - 1]);
    }
    const fullWidth = (shade: Shade) => shade.start <= sheetStart + 0.25 && shade.start + shade.width >= sheetEnd - 0.25;
    return shades.sort((a, b) => Number(fullWidth(b)) - Number(fullWidth(a)) || a.top - b.top || a.start - b.start);
  }, [pageBreakPreviewFrame, renderWindow.totalWidth, renderWindow.totalHeight]);
  return {
    pageBreakPreviewFrame,
    pageBreakPreviewLabels,
    pageBreakPreviewShades,
  };
}
