"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { MAX_PICTURE_NAME_LENGTH } from "../../../../lib/spreadsheet/drawing-buttons";
import { type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as dialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { type PivotConfig } from "@mrnote/core/web/lib/spreadsheet/pivot.ts";
import { normalizedPivotTableObjectName } from "./spreadsheetWindowHelpers";
import { type Dispatch, type SetStateAction } from "react";

/** What renderSpreadsheetRenamePivotTableDialog reads from SpreadsheetWindow's render scope. */
export interface RenderSpreadsheetRenamePivotTableDialogInputs {
  commitNavigationPivotRename: () => void;
  navigationActionReturnFocusRef: RefObject<HTMLButtonElement | null>;
  navigationPivotRenameDraft: { sheetId: string; source: PivotConfig; name: string; error?: string; } | null;
  navigationRenameInputRef: RefObject<HTMLInputElement | null>;
  setNavigationPivotRenameDraft: Dispatch<SetStateAction<{ sheetId: string; source: PivotConfig; name: string; error?: string; } | null>>;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
}

/** Moved verbatim from SpreadsheetWindow's JSX: a render function (not a component), so the element tree React reconciles is unchanged. */
export function renderSpreadsheetRenamePivotTableDialog({
  commitNavigationPivotRename,
  navigationActionReturnFocusRef,
  navigationPivotRenameDraft,
  navigationRenameInputRef,
  setNavigationPivotRenameDraft,
  t,
}: RenderSpreadsheetRenamePivotTableDialogInputs) {
  return (
      <OfficeDialogShell
        open={navigationPivotRenameDraft !== null}
        title={t("spreadsheet.uiCopy.renamePivotTable")}
        description={
          t("spreadsheet.uiCopy.theNameIsSavedToTheNativePivotTableIts")
        }
        defaultActionLabel={t("code.rename.submit")}
        cancelActionLabel={t("common.cancel")}
        defaultActionDisabled={
          !navigationPivotRenameDraft ||
          !normalizedPivotTableObjectName(navigationPivotRenameDraft.name)
        }
        onDefaultAction={commitNavigationPivotRename}
        onCancel={() => setNavigationPivotRenameDraft(null)}
        initialFocusRef={navigationRenameInputRef}
        returnFocusRef={navigationActionReturnFocusRef}
        testIdPrefix="spreadsheet-navigation-pivot-rename"
      >
        <label className={dialogParts.field}>
          <span className={dialogParts.label}>{t("presentation.master.name")}</span>
          <input
            ref={navigationRenameInputRef}
            value={navigationPivotRenameDraft?.name ?? ""}
            maxLength={MAX_PICTURE_NAME_LENGTH}
            onChange={(event) =>
              setNavigationPivotRenameDraft((current) =>
                current
                  ? {
                      ...current,
                      name: event.target.value,
                      error: undefined,
                    }
                  : current,
              )
            }
            data-testid="spreadsheet-navigation-pivot-rename-name"
          />
        </label>
        {navigationPivotRenameDraft?.error ? (
          <p
            role="alert"
            data-testid="spreadsheet-navigation-pivot-rename-error"
            className={dialogParts.error}
          >
            {navigationPivotRenameDraft.error === "invalid"
              ? t("spreadsheet.uiCopy.theNameCanTBeEmptyOrContainOr")
              : navigationPivotRenameDraft.error === "duplicate"
                ? t("spreadsheet.uiCopy.aPivotTableWithThisNameAlreadyExistsInThe")
              : t("spreadsheet.uiCopy.thePivotTableChangedOrCanTBeSafelyUpdated")}
          </p>
        ) : null}
      </OfficeDialogShell>
  );
}
