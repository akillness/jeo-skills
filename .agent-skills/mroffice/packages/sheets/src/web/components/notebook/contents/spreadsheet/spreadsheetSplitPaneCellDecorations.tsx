"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type SpreadsheetCell } from "@mrnote/core/web/lib/spreadsheet/cell-buttons.ts";
import { type ReactNode } from "react";
import { Filter, ArrowDownAZ, ArrowUpAZ, Link as LinkIcon, MessageSquare } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import spreadsheetHomeStyles from "./SpreadsheetHomeRibbon.module.css";
import reviewCommentStyles from "./SpreadsheetReviewComments.module.css";
import { SpreadsheetErrorIndicatorMark } from "./SpreadsheetErrorIndicators";
import { parseInternalLink, parseNamedLink } from "@mrnote/core/web/lib/spreadsheet/sheet-interactions.ts";
import { type DataTable, type TableCellRole, type DataTableSortState } from "@mrnote/core/web/lib/spreadsheet/data-table.ts";
import { hasComment, isThreadComment } from "@mrnote/core/web/lib/spreadsheet/comments.ts";
import { type PivotConfig } from "@mrnote/core/web/lib/spreadsheet/pivot.ts";
import { sanitizeHyperlink } from "@mrnote/core/web/lib/spreadsheet/conditional-format.ts";
import { shouldShowFormulaText } from "../../../../lib/spreadsheet/view-options";
import { isCheckboxCell } from "../../../../lib/spreadsheet/checkbox";
import { type SheetModel } from "./spreadsheetSheetModel";
import { type PivotOutputCell } from "@mrnote/core/web/lib/spreadsheet/pivot-output.ts";
import { type SpreadsheetErrorIndicatorReader } from "./SpreadsheetErrorIndicators";

/** What spreadsheetSplitPaneCellDecorations reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetSplitPaneCellDecorationsInputs {
  activePivotOutputCells: ReadonlyMap<string, PivotOutputCell> | null;
  cellLinkTarget: (row: number, col: number) => string | undefined;
  checkboxCheckedAt: (cell: SpreadsheetCell | undefined, row: number, col: number) => boolean;
  errorIndicatorAt: SpreadsheetErrorIndicatorReader;
  invalidCircleKeys: Set<string>;
  isActivePivotOutputOwnedCell: (row: number, col: number) => boolean;
  pivotConfig: PivotConfig | null;
  sheet: SheetModel;
  tableRoleAt: (row: number, col: number) => { table: DataTable; role: TableCellRole; } | null;
  tableShownSortState: (table: DataTable) => DataTableSortState | undefined;
  worksheetAutoFilterArrows: { sorted: Map<number, "asc" | "desc">; filtered: Set<number>; r1: number; c1: number; r2: number; c2: number; } | null;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function spreadsheetSplitPaneCellDecorations({
  activePivotOutputCells,
  cellLinkTarget,
  checkboxCheckedAt,
  errorIndicatorAt,
  invalidCircleKeys,
  isActivePivotOutputOwnedCell,
  pivotConfig,
  sheet,
  tableRoleAt,
  tableShownSortState,
  worksheetAutoFilterArrows,
}: SpreadsheetSplitPaneCellDecorationsInputs) {
  // What a cell carries over its text in an inactive split pane: the marks the
  // live grid draws there (AutoFilter and table filter buttons, PivotTable
  // field and expand buttons, link and comment marks, invalid-data circles,
  // error triangles, checkboxes). A button acts through the live grid once its
  // pane is active, so each names the live control it stands for.
  const renderSplitPaneCellDecorations = (row: number, col: number): ReactNode => {
    const key = `${row}:${col}`;
    const cell = sheet.cells[key];
    const proxy = (selector: string) => ({
      "data-split-proxy": selector,
      "data-split-proxy-cell": key,
    });
    const tableHit = tableRoleAt(row, col);
    const tableColumn =
      tableHit?.role === "header"
        ? tableHit.table.columns?.[col - tableHit.table.range.c1]
        : undefined;
    const tableFilter = Boolean(
      tableColumn &&
        tableHit?.table.headerRow &&
        tableHit.table.showFilterButton !== false,
    );
    const autoFilter =
      !tableHit &&
      worksheetAutoFilterArrows !== null &&
      row === worksheetAutoFilterArrows.r1 &&
      col >= worksheetAutoFilterArrows.c1 &&
      col <= worksheetAutoFilterArrows.c2;
    const pivotCell = activePivotOutputCells?.get(key);
    const pivotOwned = isActivePivotOutputOwnedCell(row, col);
    const linkTarget = cellLinkTarget(row, col);
    const href = sanitizeHyperlink(linkTarget);
    const errorFinding =
      pivotOwned || pivotCell ? null : errorIndicatorAt(row, col);
    const showFormula = shouldShowFormulaText(cell?.value, sheet.showFormulas === true);
    return (
      <>
        {autoFilter && worksheetAutoFilterArrows ? (
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className={spreadsheetHomeStyles.tableFilterButton}
            data-table-filter-toggle="true"
            data-active={
              worksheetAutoFilterArrows.filtered.has(col) ||
              worksheetAutoFilterArrows.sorted.has(col)
                ? "true"
                : "false"
            }
            {...proxy(`[data-testid="spreadsheet-filter-toggle-${col}"]`)}
          >
            {worksheetAutoFilterArrows.filtered.has(col) ? (
              <Filter size={12} aria-hidden="true" />
            ) : worksheetAutoFilterArrows.sorted.get(col) === "asc" ? (
              <ArrowDownAZ size={12} aria-hidden="true" />
            ) : worksheetAutoFilterArrows.sorted.get(col) === "desc" ? (
              <ArrowUpAZ size={12} aria-hidden="true" />
            ) : (
              <OfficeSemanticIcon semanticId="menu.chevron.down" size={12} />
            )}
          </button>
        ) : null}
        {tableFilter && tableHit && tableColumn ? (
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className={spreadsheetHomeStyles.tableFilterButton}
            data-table-filter-toggle="true"
            data-active={
              tableHit.table.columnFilters?.[String(tableColumn.id)] ||
              tableShownSortState(tableHit.table)?.conditions.some(
                (condition) => condition.columnId === tableColumn.id,
              )
                ? "true"
                : "false"
            }
            {...proxy(
              `[data-testid="spreadsheet-table-filter-toggle-${tableHit.table.id}-${tableColumn.id}"]`,
            )}
          >
            {tableHit.table.columnFilters?.[String(tableColumn.id)] ? (
              <Filter size={12} aria-hidden="true" />
            ) : (
              <OfficeSemanticIcon semanticId="menu.chevron.down" size={12} />
            )}
          </button>
        ) : null}
        {pivotCell?.drill &&
        pivotCell.drillPath !== undefined &&
        pivotConfig?.showDrillButtons !== false ? (
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className="spreadsheet-window__pivot-drill"
            {...proxy(`[data-testid="spreadsheet-pivot-drill-${key}"]`)}
          >
            <svg viewBox="0 0 9 9" width="9" height="9" aria-hidden="true">
              <rect x="0.5" y="0.5" width="8" height="8" fill="#ffffff" stroke="currentColor" />
              <path d="M2 4.5h5" stroke="currentColor" strokeWidth="1" />
              {pivotCell.drill === "collapsed" ? (
                <path d="M4.5 2v5" stroke="currentColor" strokeWidth="1" />
              ) : null}
            </svg>
          </button>
        ) : null}
        {pivotCell?.field !== undefined &&
        (pivotCell.role === "page-item" ||
          pivotCell.role === "corner" ||
          pivotCell.role === "column-header") &&
        pivotCell.value !== null &&
        pivotCell.value !== "" ? (
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className="spreadsheet-window__pivot-field-trigger"
            {...proxy(`[data-testid="spreadsheet-pivot-field-trigger-${key}"]`)}
          >
            <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
              <path d="M2 3.5h6L5 7z" fill="currentColor" />
            </svg>
          </button>
        ) : null}
        {href || (linkTarget && (parseInternalLink(linkTarget) || parseNamedLink(linkTarget) !== null)) ? (
          <span className="spreadsheet-window__hyperlink-indicator" aria-hidden="true">
            <LinkIcon size={10} />
          </span>
        ) : null}
        {hasComment(cell?.comment) ? (
          <span
            className={reviewCommentStyles.cellIndicator}
            aria-hidden="true"
            data-kind={cell?.comment?.kind}
            data-resolved={
              isThreadComment(cell?.comment) && cell.comment.done ? "true" : undefined
            }
            data-testid="spreadsheet-split-comment-indicator"
          >
            <MessageSquare size={10} />
          </span>
        ) : null}
        {invalidCircleKeys.has(key) ? (
          <svg
            className="spreadsheet-window__invalid-circle"
            aria-hidden="true"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{ position: "absolute", inset: 1, width: "calc(100% - 2px)", height: "calc(100% - 2px)", pointerEvents: "none", zIndex: 6 }}
          >
            <ellipse cx="50" cy="50" rx="46" ry="42" fill="none" stroke="var(--danger, #dc2626)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
          </svg>
        ) : null}
        {errorFinding ? <SpreadsheetErrorIndicatorMark rule={errorFinding.rule} /> : null}
        {!showFormula && isCheckboxCell(cell?.style) ? (
          <span
            aria-hidden="true"
            style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}
          >
            <input type="checkbox" tabIndex={-1} readOnly checked={checkboxCheckedAt(cell, row, col)} />
          </span>
        ) : null}
      </>
    );
  };
  return {
    renderSplitPaneCellDecorations,
  };
}
