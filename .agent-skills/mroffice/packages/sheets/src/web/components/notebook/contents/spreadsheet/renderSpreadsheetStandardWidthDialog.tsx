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
import { MAX_ROW_HEIGHT_POINTS, MAX_COLUMN_WIDTH_CHARACTERS } from "@mrnote/core/web/lib/spreadsheet/grid-sizing.ts";
import { type Dispatch, type SetStateAction } from "react";

/** What renderSpreadsheetStandardWidthDialog reads from SpreadsheetWindow's render scope. */
export interface RenderSpreadsheetStandardWidthDialogInputs {
  commandDialogReturnFocusTarget: () => HTMLElement | null;
  commitSizeDialog: () => void;
  setSizeDialog: Dispatch<SetStateAction<{ axis: "col" | "row" | "default-col"; indices: readonly number[]; sheetId: string; } | null>>;
  setSizeDialogError: Dispatch<SetStateAction<string | null>>;
  setSizeDialogValue: Dispatch<SetStateAction<string>>;
  sizeDialog: { axis: "col" | "row" | "default-col"; indices: readonly number[]; sheetId: string; } | null;
  sizeDialogError: string | null;
  sizeDialogInputRef: RefObject<HTMLInputElement | null>;
  sizeDialogValue: string;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
}

/** Moved verbatim from SpreadsheetWindow's JSX: a render function (not a component), so the element tree React reconciles is unchanged. */
export function renderSpreadsheetStandardWidthDialog({
  commandDialogReturnFocusTarget,
  commitSizeDialog,
  setSizeDialog,
  setSizeDialogError,
  setSizeDialogValue,
  sizeDialog,
  sizeDialogError,
  sizeDialogInputRef,
  sizeDialogValue,
  t,
}: RenderSpreadsheetStandardWidthDialogInputs) {
  return (
       sizeDialog ? (
        <OfficeDialogShell
          open
          testIdPrefix="spreadsheet-size"
          title={
            sizeDialog.axis === "default-col"
              ? t("spreadsheet.standardWidthDialogTitle")
              : sizeDialog.axis === "col"
                ? t("spreadsheet.columnWidthDialogTitle")
                : t("spreadsheet.rowHeightDialogTitle")
          }
          description={null}
          defaultActionLabel={t("spreadsheet.fmtOk")}
          cancelActionLabel={t("spreadsheet.sizeDialogCancel")}
          defaultActionTestId="spreadsheet-size-dialog-apply"
          cancelActionTestId="spreadsheet-size-dialog-cancel"
          onDefaultAction={commitSizeDialog}
          onCancel={() => setSizeDialog(null)}
          initialFocusRef={sizeDialogInputRef}
          returnFocusTarget={commandDialogReturnFocusTarget}
          className="sm:max-w-[340px]"
        >
          <label
            className={dialogParts.field}
          >
            {sizeDialog.axis === "default-col"
              ? t("spreadsheet.standardColumnWidthLabel")
              : sizeDialog.axis === "col"
                ? t("spreadsheet.columnWidthLabel")
                : t("spreadsheet.rowHeightLabel")}
            <input
              ref={sizeDialogInputRef}
              type="number"
              min={0}
              max={
                sizeDialog.axis === "row"
                  ? MAX_ROW_HEIGHT_POINTS
                  : MAX_COLUMN_WIDTH_CHARACTERS
              }
              step="any"
              value={sizeDialogValue}
              onChange={(event) => {
                setSizeDialogValue(event.target.value);
                if (sizeDialogError) setSizeDialogError(null);
              }}
              // An entry the box itself rejects (out of range, not a number)
              // stops OK before it runs: say so inline, as OK would, instead
              // of the browser's own bubble.
              onInvalid={(event) => {
                event.preventDefault();
                setSizeDialogError(
                  t(
                    sizeDialog.axis === "row"
                      ? "spreadsheet.rowHeightInvalid"
                      : "spreadsheet.columnWidthInvalid",
                  ),
                );
              }}
              aria-invalid={sizeDialogError ? true : undefined}
              data-testid="spreadsheet-size-dialog-input"
            />
          </label>
          {sizeDialogError ? (
            <span
              role="alert"
              data-testid="spreadsheet-size-dialog-error"
              className={dialogParts.error}
            >
              {sizeDialogError}
            </span>
          ) : null}
        </OfficeDialogShell>
      ) : null
  );
}
