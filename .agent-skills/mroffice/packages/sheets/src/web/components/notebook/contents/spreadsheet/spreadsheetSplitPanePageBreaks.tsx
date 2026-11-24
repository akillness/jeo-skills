"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type ReactNode } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { type SpreadsheetPageBreakPreviewPages } from "../../../../lib/spreadsheet/page-layout-view";

/** What spreadsheetSplitPanePageBreaks reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetSplitPanePageBreaksInputs {
  normalViewPageBreaks: boolean;
  pageBreakLines: { regions: SpreadsheetPageBreakPreviewPages[]; rowBreaks: number[]; colBreaks: number[]; manualRows: Set<number>; manualCols: Set<number>; } | null;
  pageBreakPreview: boolean;
  pageBreakPreviewFrame: { top: number; bottom: number; start: number; end: number; regions: { pages: SpreadsheetPageBreakPreviewPages; top: number; bottom: number; start: number; end: number; }[]; rowAt: (line: number) => number; colAt: (line: number) => number; } | null;
  pageBreakPreviewLabels: { key: string; page: number; top: number; start: number; width: number; height: number; }[];
  pageBreakPreviewShades: { key: string; top: number; start: number; width: number; height: number; }[];
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function spreadsheetSplitPanePageBreaks({
  normalViewPageBreaks,
  pageBreakLines,
  pageBreakPreview,
  pageBreakPreviewFrame,
  pageBreakPreviewLabels,
  pageBreakPreviewShades,
  t,
}: SpreadsheetSplitPanePageBreaksInputs) {
  // Page Break Preview's shading, page numbers and break lines (or Normal
  // view's dashed breaks), painted in an inactive pane as the live grid paints
  // them; the lines are dragged in the live pane.
  const renderSplitPanePageBreaks = (): ReactNode => {
    if (!pageBreakLines || !pageBreakPreviewFrame) return null;
    const frame = pageBreakPreviewFrame;
    if (pageBreakPreview) {
      return (
        <div className="spreadsheet-window__page-break-layer" aria-hidden="true">
          {pageBreakPreviewShades
            .filter((shade) => shade.width >= 0.5 && shade.height >= 0.5)
            .map((shade) => (
              <div
                key={`pb-shade-${shade.key}`}
                className="spreadsheet-window__page-break-shade"
                style={{ top: shade.top, insetInlineStart: shade.start, width: shade.width, height: shade.height }}
              />
            ))}
          {pageBreakPreviewLabels.map((label) => {
            const fontSize = Math.min(48, label.width / 4.5, label.height / 1.6);
            return (
              <div
                key={`pb-page-${label.key}`}
                className="spreadsheet-window__page-break-page"
                style={{ top: label.top, insetInlineStart: label.start, width: label.width, height: label.height, fontSize }}
              >
                {fontSize >= 8 ? t("spreadsheet.pageBreakPreviewPageLabel", { page: String(label.page) }) : null}
              </div>
            );
          })}
          {frame.regions.map(({ pages, top, bottom, start, end }) => (
            <div
              key={`pb-area-${pages.firstPage}`}
              className="spreadsheet-window__page-break-print-area"
              style={{ top: top - 1.5, insetInlineStart: start - 1.5, width: end - start + 3, height: bottom - top + 3 }}
            />
          ))}
          {pageBreakLines.rowBreaks.map((rowIndex) => (
            <div
              key={`pb-row-${rowIndex}`}
              style={{
                position: "absolute",
                insetInlineStart: frame.start,
                top: frame.rowAt(rowIndex),
                width: frame.end - frame.start,
                height: 7,
                marginTop: -3.5,
                borderTop: pageBreakLines.manualRows.has(rowIndex)
                  ? "3px solid var(--spreadsheet-page-break-line, #2563eb)"
                  : "2px dashed rgba(37, 99, 235, 0.5)",
                zIndex: 5,
              }}
            />
          ))}
          {pageBreakLines.colBreaks.map((colIndex) => (
            <div
              key={`pb-col-${colIndex}`}
              style={{
                position: "absolute",
                top: frame.top,
                insetInlineStart: frame.colAt(colIndex),
                height: frame.bottom - frame.top,
                width: 7,
                marginInlineStart: -3.5,
                borderInlineStart: pageBreakLines.manualCols.has(colIndex)
                  ? "3px solid var(--spreadsheet-page-break-line, #2563eb)"
                  : "2px dashed rgba(37, 99, 235, 0.5)",
                zIndex: 5,
              }}
            />
          ))}
        </div>
      );
    }
    if (!normalViewPageBreaks) return null;
    return (
      <div className="spreadsheet-window__page-break-layer" aria-hidden="true">
        {pageBreakLines.rowBreaks.map((rowIndex) => (
          <div
            key={`nv-pb-row-${rowIndex}`}
            style={{
              position: "absolute",
              insetInlineStart: frame.start,
              top: frame.rowAt(rowIndex) - 1,
              width: frame.end - frame.start,
              height: 0,
              borderTop: pageBreakLines.manualRows.has(rowIndex)
                ? "1px dashed var(--spreadsheet-page-break-line, #2563eb)"
                : "1px dashed rgba(37, 99, 235, 0.45)",
              zIndex: 4,
            }}
          />
        ))}
        {pageBreakLines.colBreaks.map((colIndex) => (
          <div
            key={`nv-pb-col-${colIndex}`}
            style={{
              position: "absolute",
              top: frame.top,
              insetInlineStart: frame.colAt(colIndex) - 1,
              height: frame.bottom - frame.top,
              width: 0,
              borderInlineStart: pageBreakLines.manualCols.has(colIndex)
                ? "1px dashed var(--spreadsheet-page-break-line, #2563eb)"
                : "1px dashed rgba(37, 99, 235, 0.45)",
              zIndex: 4,
            }}
          />
        ))}
      </div>
    );
  };
  return {
    renderSplitPanePageBreaks,
  };
}
