"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type DataTableResizeRefusal } from "../../../../lib/spreadsheet/table-buttons";
import { type RefObject } from "react";
import { Table2 } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { toast } from "@mrnote/core/web/hooks/use-toast.ts";
import { tableNativeStructureBlocked, type TableTotalKind, TABLE_TOTAL_KINDS, type DataTable } from "@mrnote/core/web/lib/spreadsheet/data-table.ts";
import { columnLabel } from "./spreadsheetRangeA1";
import { SHOW_LEGACY_TABLE_DESIGN_CONTROLS } from "./spreadsheetWindowConstants";

/** What renderSpreadsheetTableControls reads from SpreadsheetWindow's render scope. */
export interface RenderSpreadsheetTableControlsInputs {
  activeCell: { row: number; col: number; };
  activeTable: DataTable | null;
  activeTableFilterBlocker: "native" | "protected" | undefined;
  chooseTableColumnTotal: (id: string, offset: number, kind: TableTotalKind, returnFocus: HTMLElement | null) => void;
  confirmConvertTableToRange: (id: string) => void;
  resizeDataTable: (id: string, rangeA1: string) => boolean;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  tableResizeRefusalMessage: (reason: DataTableResizeRefusal | null, fallbackKey: string) => string;
  tableResizeRefusalRef: RefObject<DataTableResizeRefusal | null>;
  toggleTableFilterButton: (id: string) => void;
  toggleTableHeaderRow: (id: string) => void;
  toggleTableTotals: (id: string) => void;
}

/** Moved verbatim from SpreadsheetWindow's JSX: a render function (not a component), so the element tree React reconciles is unchanged. */
export function renderSpreadsheetTableControls({
  activeCell,
  activeTable,
  activeTableFilterBlocker,
  chooseTableColumnTotal,
  confirmConvertTableToRange,
  resizeDataTable,
  t,
  tableResizeRefusalMessage,
  tableResizeRefusalRef,
  toggleTableFilterButton,
  toggleTableHeaderRow,
  toggleTableTotals,
}: RenderSpreadsheetTableControlsInputs) {
  return (
       SHOW_LEGACY_TABLE_DESIGN_CONTROLS && activeTable ? (
        <section
          className="spreadsheet-window__table-controls"
          data-testid="spreadsheet-table-controls"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            padding: "4px 8px",
            fontSize: 12,
            borderBottom: "1px solid var(--border, #e5e7eb)",
          }}
        >
          <strong
            data-testid="spreadsheet-table-name"
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <Table2 size={13} />
            {activeTable.name}
          </strong>
          <label
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            title={
              t("spreadsheet.uiCopy.showOrHideTheHeaderRowWhilePreservingTable")
            }
          >
            <input
              type="checkbox"
              checked={activeTable.headerRow}
              onChange={() => toggleTableHeaderRow(activeTable.id)}
              data-testid="spreadsheet-table-header-toggle"
              aria-label={
                t("spreadsheet.uiCopy.headerRow")
              }
            />
            {t("spreadsheet.uiCopy.headerRow")}
          </label>
          <label
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            title={
              !activeTable.headerRow
                ? t("spreadsheet.uiCopy.showTheHeaderRowBeforeShowingFilterButtons")
                : activeTableFilterBlocker === "native"
                  ? t("spreadsheet.uiCopy.thisTableContainsNativeFilterMetadataThatCannotBe")
                  : activeTableFilterBlocker === "protected"
                    ? t("spreadsheet.uiCopy.sheetProtectionPreventsEditingThisTableFilter")
                    : t("spreadsheet.uiCopy.showOrHideThisTableSFilterButtonsWhile")
            }
          >
            <input
              type="checkbox"
              checked={
                activeTable.headerRow &&
                activeTable.showFilterButton !== false
              }
              disabled={
                !activeTable.headerRow ||
                Boolean(activeTableFilterBlocker)
              }
              onChange={() => toggleTableFilterButton(activeTable.id)}
              data-testid="spreadsheet-table-filter-button-toggle"
              aria-label={
                t("spreadsheet.uiCopy.filterButton_6582ac")
              }
            />
            {t("spreadsheet.uiCopy.filterButton_6582ac")}
          </label>
          <label
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <input
              type="checkbox"
              checked={Boolean(activeTable.totalsRow)}
              onChange={() => toggleTableTotals(activeTable.id)}
              data-testid="spreadsheet-table-totals-toggle"
              aria-label={t("spreadsheet.tableTotalsToggle")}
            />
            {t("spreadsheet.tableTotalsLabel")}
          </label>
          <label
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <span style={{ opacity: 0.7 }}>
              {t("spreadsheet.uiCopy.tableRange_6b4ded")}
            </span>
            <input
              key={`${activeTable.id}:${activeTable.range.r1}:${activeTable.range.c1}:${activeTable.range.r2}:${activeTable.range.c2}`}
              aria-label={
                t("spreadsheet.uiCopy.resizeTable")
              }
              data-testid="spreadsheet-table-range"
              defaultValue={`${columnLabel(activeTable.range.c1)}${
                activeTable.range.r1 + 1
              }:${columnLabel(activeTable.range.c2)}${
                activeTable.range.r2 + 1
              }`}
              onBlur={(event) => {
                if (
                  !resizeDataTable(activeTable.id, event.currentTarget.value)
                ) {
                  event.currentTarget.value = `${columnLabel(
                    activeTable.range.c1,
                  )}${activeTable.range.r1 + 1}:${columnLabel(
                    activeTable.range.c2,
                  )}${activeTable.range.r2 + 1}`;
                  toast({
                    variant: "destructive",
                    description: tableResizeRefusalMessage(
                      tableResizeRefusalRef.current,
                      "spreadsheet.uiCopy.theTableRangeIsInvalidProtectedConflictsWithContent",
                    ),
                  });
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.currentTarget.value = `${columnLabel(
                    activeTable.range.c1,
                  )}${activeTable.range.r1 + 1}:${columnLabel(
                    activeTable.range.c2,
                  )}${activeTable.range.r2 + 1}`;
                  event.currentTarget.blur();
                }
              }}
              style={{
                width: 88,
                fontSize: 12,
                padding: "2px 5px",
                border: "1px solid var(--border, #e5e7eb)",
                borderRadius: 5,
              }}
            />
          </label>
          {activeTable.totalsRow &&
          activeCell.col >= activeTable.range.c1 &&
          activeCell.col <= activeTable.range.c2 ? (
            <label
              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              <span style={{ opacity: 0.7 }}>
                {columnLabel(activeCell.col)}
              </span>
              <select
                disabled={tableNativeStructureBlocked(activeTable)}
                title={
                  tableNativeStructureBlocked(activeTable)
                    ? t("spreadsheet.uiCopy.thisImportedTableContainsNativeDataThatCannotBe_0bd9e5")
                    : undefined
                }
                value={
                  activeTable.totals?.[
                    activeCell.col - activeTable.range.c1
                  ] === "custom"
                    ? "customCurrent"
                    : activeTable.totals?.[
                        activeCell.col - activeTable.range.c1
                      ] ?? "none"
                }
                onChange={(event) =>
                  chooseTableColumnTotal(
                    activeTable.id,
                    activeCell.col - activeTable.range.c1,
                    event.target.value as TableTotalKind,
                    event.currentTarget,
                  )
                }
                data-testid="spreadsheet-table-column-agg"
                aria-label={t("spreadsheet.tableColumnTotal")}
                style={{
                  fontSize: 12,
                  padding: "2px 4px",
                  border: "1px solid var(--border, #e5e7eb)",
                  borderRadius: 5,
                }}
              >
                {activeTable.totals?.[
                  activeCell.col - activeTable.range.c1
                ] === "custom" ? (
                  <option disabled value="customCurrent">
                    {t("spreadsheet.tableAgg_customCurrent")}
                  </option>
                ) : null}
                {TABLE_TOTAL_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {t(`spreadsheet.tableAgg_${kind}`)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            type="button"
            onClick={() => confirmConvertTableToRange(activeTable.id)}
            title={t("spreadsheet.tableRemove")}
            aria-label={t("spreadsheet.tableRemove")}
            data-testid="spreadsheet-table-remove"
            style={{ marginLeft: "auto" }}
          >
            {t("spreadsheet.tableRemove")}
          </button>
        </section>
      ) : null
  );
}
