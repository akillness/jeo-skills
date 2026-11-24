"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as dialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { isAuthorableTableTotalFormula, MAX_TABLE_TOTAL_FORMULA_LENGTH, type DataTable } from "@mrnote/core/web/lib/spreadsheet/data-table.ts";
import { type SheetModel } from "./spreadsheetSheetModel";
import { type Dispatch, type SetStateAction } from "react";

/** What renderSpreadsheetMoreTotalFunctionsDialog reads from SpreadsheetWindow's render scope. */
export interface RenderSpreadsheetMoreTotalFunctionsDialogInputs {
  activeSheetIndex: number;
  applyTableTotalFormulaDialog: () => void;
  setTableTotalFormulaDraft: Dispatch<SetStateAction<{ workbook: readonly SheetModel[]; activeSheetIndex: number; sheet: SheetModel; tableCollection: readonly DataTable[]; table: DataTable; tableId: string; offset: number; columnName: string; formula: string; error: string | null; } | null>>;
  sheet: SheetModel;
  sheets: SheetModel[];
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  tableTotalFormulaDraft: { workbook: readonly SheetModel[]; activeSheetIndex: number; sheet: SheetModel; tableCollection: readonly DataTable[]; table: DataTable; tableId: string; offset: number; columnName: string; formula: string; error: string | null; } | null;
  tableTotalFormulaInputRef: RefObject<HTMLInputElement | null>;
  tableTotalFormulaReturnFocusRef: RefObject<HTMLElement | null>;
}

/** Moved verbatim from SpreadsheetWindow's JSX: a render function (not a component), so the element tree React reconciles is unchanged. */
export function renderSpreadsheetMoreTotalFunctionsDialog({
  activeSheetIndex,
  applyTableTotalFormulaDialog,
  setTableTotalFormulaDraft,
  sheet,
  sheets,
  t,
  tableTotalFormulaDraft,
  tableTotalFormulaInputRef,
  tableTotalFormulaReturnFocusRef,
}: RenderSpreadsheetMoreTotalFunctionsDialogInputs) {
  return (
      <OfficeDialogShell
        open={tableTotalFormulaDraft !== null}
        title={t("spreadsheet.uiCopy.moreTotalFunctions")}
        description={
          tableTotalFormulaDraft
            ? t("spreadsheet.dynamicCopy.tableTotalFormula", { column: tableTotalFormulaDraft.columnName })
            : ""
        }
        defaultActionLabel={t("spreadsheet.fmtOk")}
        cancelActionLabel={t("common.cancel")}
        defaultActionDisabled={
          !tableTotalFormulaDraft ||
          tableTotalFormulaDraft.workbook !== sheets ||
          tableTotalFormulaDraft.activeSheetIndex !== activeSheetIndex ||
          tableTotalFormulaDraft.sheet !== sheet ||
          !isAuthorableTableTotalFormula(
            tableTotalFormulaDraft.formula,
          )
        }
        onDefaultAction={applyTableTotalFormulaDialog}
        onCancel={() => setTableTotalFormulaDraft(null)}
        initialFocusRef={tableTotalFormulaInputRef}
        returnFocusRef={tableTotalFormulaReturnFocusRef}
        testIdPrefix="spreadsheet-table-total-formula"
      >
        <label className={dialogParts.field}>
          <span className={dialogParts.label}>{t("spreadsheet.formulaLabel")}</span>
          <input
            ref={tableTotalFormulaInputRef}
            autoComplete="off"
            className={dialogParts.mono}
            data-testid="spreadsheet-table-total-formula-input"
            maxLength={MAX_TABLE_TOTAL_FORMULA_LENGTH}
            onChange={(event) =>
              setTableTotalFormulaDraft((current) =>
                current
                  ? { ...current, formula: event.target.value, error: null }
                  : current,
              )
            }
            value={tableTotalFormulaDraft?.formula ?? ""}
          />
        </label>
        <p className={dialogParts.hint}>
          {t("spreadsheet.uiCopy.theFormulaMustStartWithStructuredReferencesAreSupported")}
        </p>
        {tableTotalFormulaDraft?.error ? (
          <p
            role="alert"
            className={dialogParts.error}
            data-testid="spreadsheet-table-total-formula-error"
          >
            {tableTotalFormulaDraft.error}
          </p>
        ) : null}
      </OfficeDialogShell>
  );
}
