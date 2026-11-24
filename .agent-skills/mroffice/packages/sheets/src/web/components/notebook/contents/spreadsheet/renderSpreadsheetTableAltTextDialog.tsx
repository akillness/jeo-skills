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
import { MAX_TABLE_ALT_TEXT_SUMMARY_LENGTH, MAX_TABLE_ALT_TEXT_LENGTH } from "@mrnote/core/web/lib/spreadsheet/data-table.ts";
import { type TableAltTextMutationReceipt } from "./spreadsheetMutationReceipts";
import { type Dispatch, type SetStateAction } from "react";
import { type ResolvedSpreadsheetVisibleControl } from "../../../../lib/spreadsheet/visible-command-authority";

/** What renderSpreadsheetTableAltTextDialog reads from SpreadsheetWindow's render scope. */
export interface RenderSpreadsheetTableAltTextDialogInputs {
  applyTableAltTextDialog: () => void;
  setTableAltTextDraft: Dispatch<SetStateAction<{ receipt: Omit<TableAltTextMutationReceipt, "controlId" | "nextAltText" | "nextAltTextSummary">; title: string; description: string; error: string | null; } | null>>;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  tableAltTextDraft: { receipt: Omit<TableAltTextMutationReceipt, "controlId" | "nextAltText" | "nextAltTextSummary">; title: string; description: string; error: string | null; } | null;
  tableAltTextMutationCommandRef: RefObject<TableAltTextMutationReceipt | null>;
  tableAltTextTitleInputRef: RefObject<HTMLInputElement | null>;
  tableAltTextTriggerRef: RefObject<HTMLButtonElement | null>;
  visibleCommandState: (controlId: string) => ResolvedSpreadsheetVisibleControl;
}

/** Moved verbatim from SpreadsheetWindow's JSX: a render function (not a component), so the element tree React reconciles is unchanged. */
export function renderSpreadsheetTableAltTextDialog({
  applyTableAltTextDialog,
  setTableAltTextDraft,
  t,
  tableAltTextDraft,
  tableAltTextMutationCommandRef,
  tableAltTextTitleInputRef,
  tableAltTextTriggerRef,
  visibleCommandState,
}: RenderSpreadsheetTableAltTextDialogInputs) {
  return (
      <OfficeDialogShell
        open={tableAltTextDraft !== null}
        title={t("spreadsheet.uiCopy.tableAltText")}
        description={
          t("spreadsheet.uiCopy.brieflyDescribeTheTableSPurposeAndContentFor")
        }
        defaultActionLabel={t("spreadsheet.fmtOk")}
        cancelActionLabel={t("common.cancel")}
        defaultActionDisabled={
          !visibleCommandState("XLSCTL.CONTEXT.TABLE.ALT_TEXT.MRAI.APPLY")
            .enabled
        }
        onDefaultAction={applyTableAltTextDialog}
        onCancel={() => {
          tableAltTextMutationCommandRef.current = null;
          setTableAltTextDraft(null);
        }}
        initialFocusRef={tableAltTextTitleInputRef}
        returnFocusRef={tableAltTextTriggerRef}
        testIdPrefix="spreadsheet-table-alt-text"
      >
        <div className="grid gap-4">
          <label className={dialogParts.field}>
            <span className={dialogParts.label}>{t("common.title")}</span>
            <input
              ref={tableAltTextTitleInputRef}
              autoComplete="off"
              data-testid="spreadsheet-table-alt-text-title"
              disabled={!tableAltTextDraft}
              maxLength={MAX_TABLE_ALT_TEXT_SUMMARY_LENGTH}
              onChange={(event) =>
                setTableAltTextDraft((current) =>
                  current
                    ? { ...current, title: event.target.value, error: null }
                    : current,
                )
              }
              value={tableAltTextDraft?.title ?? ""}
            />
          </label>
          <label className={dialogParts.field}>
            <span className={dialogParts.label}>{t("spreadsheet.uiCopy.description")}</span>
            <textarea
              className="min-h-28 resize-y"
              data-testid="spreadsheet-table-alt-text-description"
              disabled={!tableAltTextDraft}
              maxLength={MAX_TABLE_ALT_TEXT_LENGTH}
              onChange={(event) =>
                setTableAltTextDraft((current) =>
                  current
                    ? {
                        ...current,
                        description: event.target.value,
                        error: null,
                      }
                    : current,
                )
              }
              value={tableAltTextDraft?.description ?? ""}
            />
          </label>
          {tableAltTextDraft?.error ? (
            <p
              role="alert"
              className={dialogParts.error}
              data-testid="spreadsheet-table-alt-text-error"
            >
              {tableAltTextDraft.error}
            </p>
          ) : null}
        </div>
      </OfficeDialogShell>
  );
}
