"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { EditorLoadingState } from "@mrnote/core/web/components/ui/editor-loading-state.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as dialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { type normalizeCustomCellStyles } from "../../../../lib/spreadsheet/cell-styles";
import { type Dispatch, type SetStateAction } from "react";

/** What renderSpreadsheetMergeStylesDialog reads from SpreadsheetWindow's render scope. */
export interface RenderSpreadsheetMergeStylesDialogInputs {
  commandDialogReturnFocusTarget: () => HTMLElement | null;
  confirmMergeStyles: () => void;
  mergeStylesState: { workbooks: Array<{ id: string; title: string; }> | null; selected: string | null; error?: string; busy?: boolean; sameNames?: ReturnType<typeof normalizeCustomCellStyles>; } | null;
  setMergeStylesState: Dispatch<SetStateAction<{ workbooks: Array<{ id: string; title: string; }> | null; selected: string | null; error?: string; busy?: boolean; sameNames?: ReturnType<typeof normalizeCustomCellStyles>; } | null>>;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
}

/** Moved verbatim from SpreadsheetWindow's JSX: a render function (not a component), so the element tree React reconciles is unchanged. */
export function renderSpreadsheetMergeStylesDialog({
  commandDialogReturnFocusTarget,
  confirmMergeStyles,
  mergeStylesState,
  setMergeStylesState,
  t,
}: RenderSpreadsheetMergeStylesDialogInputs) {
  return (
       mergeStylesState && !mergeStylesState.sameNames ? (
        // XLS-A012: Merge Styles… — copy another workbook's styles in.
        <OfficeDialogShell
          open
          testIdPrefix="spreadsheet-merge-styles"
          title={t("spreadsheet.mergeStylesTitle")}
          description={null}
          defaultActionLabel={t("spreadsheet.cellShiftOk")}
          cancelActionLabel={t("spreadsheet.cellShiftCancel")}
          defaultActionTestId="spreadsheet-merge-styles-ok"
          defaultActionDisabled={!mergeStylesState.selected}
          busy={mergeStylesState.busy}
          onDefaultAction={confirmMergeStyles}
          onCancel={() => setMergeStylesState(null)}
          returnFocusTarget={commandDialogReturnFocusTarget}
          className="sm:max-w-[380px]"
        >
          <span className={dialogParts.label} id="spreadsheet-merge-styles-from">
            {t("spreadsheet.mergeStylesFrom")}
          </span>
          {mergeStylesState.workbooks === null ? (
            <EditorLoadingState
              kind="spreadsheet"
              minimal
              label={t("spreadsheet.mergeStylesLoading")}
            />
          ) : mergeStylesState.workbooks.length === 0 ? (
            <p className={dialogParts.hint} data-testid="spreadsheet-merge-styles-none">
              {t("spreadsheet.mergeStylesNone")}
            </p>
          ) : (
            <div
              role="radiogroup"
              aria-labelledby="spreadsheet-merge-styles-from"
              className={`${dialogParts.list} max-h-60`}
              data-testid="spreadsheet-merge-styles-workbooks"
            >
              {mergeStylesState.workbooks.map((workbook) => (
                <label key={workbook.id} className={`${dialogParts.listItem} flex items-center gap-2`}>
                  <input
                    type="radio"
                    name="spreadsheet-merge-styles-source"
                    checked={mergeStylesState.selected === workbook.id}
                    onChange={() =>
                      setMergeStylesState((current) =>
                        current ? { ...current, selected: workbook.id, error: undefined } : current,
                      )
                    }
                    data-testid={`spreadsheet-merge-styles-workbook-${workbook.id}`}
                  />
                  <span className="min-w-0 flex-1 truncate">{workbook.title}</span>
                </label>
              ))}
            </div>
          )}
          {mergeStylesState.error ? (
            <p role="alert" className={dialogParts.error} data-testid="spreadsheet-merge-styles-error">
              {mergeStylesState.error}
            </p>
          ) : null}
        </OfficeDialogShell>
      ) : null
  );
}
