"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { normalizedTableAltTextInput, MAX_PICTURE_NAME_LENGTH } from "../../../../lib/spreadsheet/drawing-buttons";
import { type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as dialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { type SpreadsheetChart } from "@mrnote/core/web/lib/spreadsheet/chart.ts";
import { type SpreadsheetObject } from "./spreadsheetSheetModel";
import { type Dispatch, type SetStateAction } from "react";

/** What renderSpreadsheetRenameChartDialog reads from SpreadsheetWindow's render scope. */
export interface RenderSpreadsheetRenameChartDialogInputs {
  commitNavigationChartRename: () => void;
  navigationActionReturnFocusRef: RefObject<HTMLButtonElement | null>;
  navigationChartRenameDraft: { sheetId: string; chartId: string; kind: "drawing" | "native"; source: SpreadsheetObject | SpreadsheetChart; name: string; error?: string; } | null;
  navigationRenameInputRef: RefObject<HTMLInputElement | null>;
  setNavigationChartRenameDraft: Dispatch<SetStateAction<{ sheetId: string; chartId: string; kind: "drawing" | "native"; source: SpreadsheetObject | SpreadsheetChart; name: string; error?: string; } | null>>;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
}

/** Moved verbatim from SpreadsheetWindow's JSX: a render function (not a component), so the element tree React reconciles is unchanged. */
export function renderSpreadsheetRenameChartDialog({
  commitNavigationChartRename,
  navigationActionReturnFocusRef,
  navigationChartRenameDraft,
  navigationRenameInputRef,
  setNavigationChartRenameDraft,
  t,
}: RenderSpreadsheetRenameChartDialogInputs) {
  return (
      <OfficeDialogShell
        open={navigationChartRenameDraft !== null}
        title={t("spreadsheet.uiCopy.renameChart")}
        description={
          t("spreadsheet.uiCopy.thisNameIsUsedByNavigationTheChartTitle")
        }
        defaultActionLabel={t("code.rename.submit")}
        cancelActionLabel={t("common.cancel")}
        defaultActionDisabled={
          !navigationChartRenameDraft ||
          !normalizedTableAltTextInput(
            navigationChartRenameDraft.name,
            MAX_PICTURE_NAME_LENGTH,
          )
        }
        onDefaultAction={commitNavigationChartRename}
        onCancel={() => setNavigationChartRenameDraft(null)}
        initialFocusRef={navigationRenameInputRef}
        returnFocusRef={navigationActionReturnFocusRef}
        testIdPrefix="spreadsheet-navigation-chart-rename"
      >
        <label className={dialogParts.field}>
          <span className={dialogParts.label}>{t("presentation.master.name")}</span>
          <input
            ref={navigationRenameInputRef}
            value={navigationChartRenameDraft?.name ?? ""}
            maxLength={MAX_PICTURE_NAME_LENGTH}
            onChange={(event) =>
              setNavigationChartRenameDraft((current) =>
                current
                  ? {
                      ...current,
                      name: event.target.value,
                      error: undefined,
                    }
                  : current,
              )
            }
            data-testid="spreadsheet-navigation-chart-rename-name"
          />
        </label>
        {navigationChartRenameDraft?.error ? (
          <p
            role="alert"
            data-testid="spreadsheet-navigation-chart-rename-error"
            className={dialogParts.error}
          >
            {t("spreadsheet.uiCopy.theChartChangedOrCanTBeSafelyUpdated")}
          </p>
        ) : null}
      </OfficeDialogShell>
  );
}
