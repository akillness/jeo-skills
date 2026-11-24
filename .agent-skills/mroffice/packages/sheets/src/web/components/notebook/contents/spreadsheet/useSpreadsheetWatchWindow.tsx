"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { doubleClickOnDoubleTap } from "@mrnote/core/web/lib/double-tap.ts";
import { useCallback } from "react";
import { X, Trash2 } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { spreadsheetPaneClassName, officeDialogParts as dialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { type SheetEvaluator, type EngineValue } from "@mrnote/core/web/lib/spreadsheet/formula-engine.ts";
import { normalizeWatches, MAX_WATCHES, hasWatch, addWatch, type WatchedCell, removeWatch } from "../../../../lib/spreadsheet/watch-list";
import { type PivotRange, type PivotMatrix } from "@mrnote/core/web/lib/spreadsheet/pivot.ts";
import { type PivotChartReport } from "@mrnote/core/web/lib/spreadsheet/pivot-output.ts";
import { type SheetModel } from "./spreadsheetSheetModel";
import { columnLabel } from "./spreadsheetRangeA1";
import { type Workbook, type WorkbookSheetInput } from "@mrnote/core/web/lib/spreadsheet/formula-engine.ts";
import { type PivotOutputPlan } from "@mrnote/core/web/lib/spreadsheet/pivot-output.ts";
import { type GridRect } from "../../../../lib/spreadsheet/grid-nav";
import { type Dispatch, type SetStateAction } from "react";

/** What useSpreadsheetWatchWindow reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetWatchWindowInputs {
  formulaWorkbook: { evaluator: SheetEvaluator; evaluatorFor: (sheetName: string) => SheetEvaluator; workbook: Workbook; memoSnapshot: () => ReadonlyMap<string, EngineValue>; pivotPlans: Map<string, PivotOutputPlan>; pivotNativeFootprints: Map<string, PivotRange[]>; pivotChartReports: Map<string, PivotChartReport>; pivotChartMatrices: Map<string, PivotMatrix>; inputs: WorkbookSheetInput[]; pivotSheetIds: string[]; };
  /** Format Cells > Protection > Hidden in effect on a cell (the formula bar withholds it). */
  isCellContentHiddenRef: { readonly current: (sheet: SheetModel, cell: SheetModel["cells"][string] | undefined) => boolean };
  navigateToSheetCell: (targetSheetIndex: number, row: number, col: number) => void;
  pageId: string;
  selRect: GridRect;
  setSessionWatchesBySheetId: Dispatch<SetStateAction<Record<string, readonly WatchedCell[]>>>;
  setWatchPanelOpen: Dispatch<SetStateAction<boolean>>;
  sheet: SheetModel;
  sheets: SheetModel[];
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  title: string;
  watches: WatchedCell[];
  watchPanelOpen: boolean;
  workbookWatchRows: { sourceSheet: SheetModel; watch: WatchedCell; }[];
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetWatchWindow({
  formulaWorkbook,
  isCellContentHiddenRef,
  navigateToSheetCell,
  pageId,
  selRect,
  setSessionWatchesBySheetId,
  setWatchPanelOpen,
  sheet,
  sheets,
  t,
  title,
  watches,
  watchPanelOpen,
  workbookWatchRows,
}: SpreadsheetWatchWindowInputs) {
  const addWatchSelection = useCallback(() => {
    setSessionWatchesBySheetId((current) => {
      const currentWatches = normalizeWatches(current[sheet.id], {
        rowCount: sheet.rowCount,
        columnCount: sheet.columnCount,
      });
      let remaining = MAX_WATCHES - currentWatches.length;
      if (remaining <= 0) return current;
      let next = currentWatches;
      addRows: for (let row = selRect.r1; row <= selRect.r2; row += 1) {
        for (let col = selRect.c1; col <= selRect.c2; col += 1) {
          const cell = { row, col };
          if (hasWatch(next, cell)) continue;
          next = addWatch(next, cell);
          remaining -= 1;
          if (remaining === 0) break addRows;
        }
      }
      if (next.length === currentWatches.length) return current;
      return { ...current, [sheet.id]: next };
    });
  }, [
    selRect.c1,
    selRect.c2,
    selRect.r1,
    selRect.r2,
    sheet.columnCount,
    sheet.id,
    sheet.rowCount,
  ]);

  const removeWatchCell = useCallback(
    (sourceSheetId: string, cell: WatchedCell) => {
      const sourceSheet = sheets.find(
        (candidate) => candidate.id === sourceSheetId,
      );
      if (!sourceSheet) return;
      setSessionWatchesBySheetId((current) => {
        const currentWatches = normalizeWatches(current[sourceSheetId], {
          rowCount: sourceSheet.rowCount,
          columnCount: sourceSheet.columnCount,
        });
        const next = removeWatch(currentWatches, cell);
        if (next.length === currentWatches.length) return current;
        const updated = { ...current };
        if (next.length > 0) updated[sourceSheetId] = next;
        else delete updated[sourceSheetId];
        return updated;
      });
    },
    [sheets],
  );

  const navigateWatchCell = (sourceSheetId: string, cell: WatchedCell) => {
    const sourceSheetIndex = sheets.findIndex(
      (candidate) => candidate.id === sourceSheetId,
    );
    const sourceSheet = sheets[sourceSheetIndex];
    if (!sourceSheet || sourceSheet.hidden) return;
    navigateToSheetCell(sourceSheetIndex, cell.row, cell.col);
  };

  // Rendered exactly once at the workbook boundary below. `hidden` closes the
  // pane without unmounting it, so the browser-owned native resize and the
  // session watch rows survive either physical trigger toggling the pane.
  const renderWatchDock = () => {
    const workbookWatchLabel = title.trim() || pageId;
    const watchGridTemplateColumns =
      "minmax(88px, 1.1fr) minmax(72px, 1fr) auto minmax(72px, 1fr) minmax(96px, 1.4fr) auto";
    const selectionSize =
      (selRect.r2 - selRect.r1 + 1) * (selRect.c2 - selRect.c1 + 1);
    const watchedSelectionCount = watches.reduce(
      (count, watch) =>
        watch.row >= selRect.r1 &&
        watch.row <= selRect.r2 &&
        watch.col >= selRect.c1 &&
        watch.col <= selRect.c2
          ? count + 1
          : count,
      0,
    );
    const addDisabled =
      watches.length >= MAX_WATCHES || watchedSelectionCount >= selectionSize;
    const firstSelectionLabel = `${columnLabel(selRect.c1)}${selRect.r1 + 1}`;
    const lastSelectionLabel = `${columnLabel(selRect.c2)}${selRect.r2 + 1}`;
    const selectionLabel =
      firstSelectionLabel === lastSelectionLabel
        ? firstSelectionLabel
        : `${firstSelectionLabel}:${lastSelectionLabel}`;
    return (
      <span
        role="dialog"
        aria-label={t("spreadsheet.watchMenu")}
        data-testid="spreadsheet-watch-panel"
        data-dock="bottom"
        data-resizable="block"
        className={`${spreadsheetPaneClassName()} office-pop-in`}
        hidden={!watchPanelOpen}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setWatchPanelOpen(false);
          }
        }}
        style={{
          flex: "0 0 auto",
          width: "calc(100% - 16px)",
          height: 160,
          minWidth: 0,
          minHeight: 104,
          maxHeight: "45vh",
          margin: "0 8px 8px",
          resize: "block",
        }}
      >
        <header className={dialogParts.header}>
          <strong className={dialogParts.title}>{t("spreadsheet.watchMenu")}</strong>
          <button
            type="button"
            className={dialogParts.compactButton}
            onClick={addWatchSelection}
            disabled={addDisabled}
            data-testid="spreadsheet-watch-add"
            style={{ whiteSpace: "nowrap" }}
          >
            {t("spreadsheet.watchAdd", {
              cell: selectionLabel,
            })}
          </button>
          <button
            type="button"
            className={dialogParts.close}
            onClick={() => setWatchPanelOpen(false)}
            aria-label={t("common.close")}
            data-testid="spreadsheet-watch-close"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </header>
        {workbookWatchRows.length === 0 ? (
          <span
            data-testid="spreadsheet-watch-empty"
            className={dialogParts.hint}
          >
            {t("spreadsheet.watchEmpty")}
          </span>
        ) : (
          <span
            className={dialogParts.paneBody}
            style={{ display: "flex", flexDirection: "column", gap: 2 }}
            role="table"
          >
            <span
              role="row"
              style={{
                display: "grid",
                gridTemplateColumns: watchGridTemplateColumns,
                gap: 8,
                fontSize: 10,
                fontWeight: 600,
                color: "var(--muted, #6b7280)",
                padding: "0 2px",
              }}
            >
              <span data-testid="spreadsheet-watch-header-workbook">
                {t("spreadsheet.findScopeWorkbook")}
              </span>
              <span>{t("spreadsheet.findScopeSheet")}</span>
              <span>{t("spreadsheet.watchCell")}</span>
              <span>{t("spreadsheet.watchValue")}</span>
              <span>{t("spreadsheet.watchFormula")}</span>
              <span />
            </span>
            {workbookWatchRows.map(({ sourceSheet, watch }) => {
              const cell = sourceSheet.cells[`${watch.row}:${watch.col}`];
              // A hidden formula on a protected sheet stays hidden here as in
              // the formula bar: the value shows, the formula does not (S-074).
              const formula = isCellContentHiddenRef.current(sourceSheet, cell)
                ? ""
                : (cell?.formula ?? cell?.value ?? "");
              const label = `${columnLabel(watch.col)}${watch.row + 1}`;
              const sourceSheetName = sourceSheet.name || sourceSheet.id;
              const display = formulaWorkbook
                .evaluatorFor(sourceSheetName)
                .getDisplay(watch.row, watch.col);
              return (
                <span
                  key={`${sourceSheet.id}:${watch.row}:${watch.col}`}
                  role="row"
                  data-testid={`spreadsheet-watch-row-${label}`}
                  data-watch-workbook={workbookWatchLabel}
                  data-watch-sheet-id={sourceSheet.id}
                  data-watch-cell={label}
                  onDoubleClick={() => navigateWatchCell(sourceSheet.id, watch)}
                  // A finger's double tap goes to the cell as a double-click does.
                  onClick={doubleClickOnDoubleTap}
                  style={{
                    display: "grid",
                    gridTemplateColumns: watchGridTemplateColumns,
                    gap: 8,
                    alignItems: "center",
                    fontSize: 12,
                    padding: "2px",
                    cursor: sourceSheet.hidden ? "default" : "pointer",
                  }}
                >
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={workbookWatchLabel}
                  >
                    {workbookWatchLabel}
                  </span>
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={sourceSheetName}
                  >
                    {sourceSheetName}
                  </span>
                  <strong style={{ fontVariantNumeric: "tabular-nums" }}>
                    {label}
                  </strong>
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontVariantNumeric: "tabular-nums",
                    }}
                    title={display}
                  >
                    {display}
                  </span>
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: "var(--muted, #6b7280)",
                      fontFamily: "ui-monospace, Menlo, monospace",
                    }}
                    title={formula}
                  >
                    {formula}
                  </span>
                  <button
                    type="button"
                    onDoubleClick={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      removeWatchCell(sourceSheet.id, watch);
                    }}
                    title={t("spreadsheet.watchRemove")}
                    aria-label={t("spreadsheet.watchRemove")}
                    data-testid={`spreadsheet-watch-remove-${label}`}
                    className={dialogParts.iconButton}
                  >
                    <Trash2 size={12} />
                  </button>
                </span>
              );
            })}
          </span>
        )}
      </span>
    );
  };
  return {
    renderWatchDock,
  };
}
