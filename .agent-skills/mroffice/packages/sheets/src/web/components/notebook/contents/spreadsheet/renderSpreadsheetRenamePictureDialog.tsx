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
import { type SpreadsheetObject } from "./spreadsheetSheetModel";
import { type Dispatch, type SetStateAction } from "react";

/** What renderSpreadsheetRenamePictureDialog reads from SpreadsheetWindow's render scope. */
export interface RenderSpreadsheetRenamePictureDialogInputs {
  commitNavigationPictureRename: () => void;
  navigationActionReturnFocusRef: RefObject<HTMLButtonElement | null>;
  navigationPictureRenameDraft: { sheetId: string; objectId: string; sourceObject: SpreadsheetObject; name: string; error?: string; } | null;
  navigationRenameInputRef: RefObject<HTMLInputElement | null>;
  setNavigationPictureRenameDraft: Dispatch<SetStateAction<{ sheetId: string; objectId: string; sourceObject: SpreadsheetObject; name: string; error?: string; } | null>>;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
}

/** Moved verbatim from SpreadsheetWindow's JSX: a render function (not a component), so the element tree React reconciles is unchanged. */
export function renderSpreadsheetRenamePictureDialog({
  commitNavigationPictureRename,
  navigationActionReturnFocusRef,
  navigationPictureRenameDraft,
  navigationRenameInputRef,
  setNavigationPictureRenameDraft,
  t,
}: RenderSpreadsheetRenamePictureDialogInputs) {
  return (
      <OfficeDialogShell
        open={navigationPictureRenameDraft !== null}
        title={t("spreadsheet.uiCopy.renamePicture")}
        description={
          t("spreadsheet.uiCopy.thisNameAppearsInNavigationAndIsSavedAs")
        }
        defaultActionLabel={t("code.rename.submit")}
        cancelActionLabel={t("common.cancel")}
        defaultActionDisabled={
          !navigationPictureRenameDraft ||
          !normalizedTableAltTextInput(
            navigationPictureRenameDraft.name,
            MAX_PICTURE_NAME_LENGTH,
          )
        }
        onDefaultAction={commitNavigationPictureRename}
        onCancel={() => setNavigationPictureRenameDraft(null)}
        initialFocusRef={navigationRenameInputRef}
        returnFocusRef={navigationActionReturnFocusRef}
        testIdPrefix="spreadsheet-navigation-picture-rename"
      >
        <label className={dialogParts.field}>
          <span className={dialogParts.label}>{t("presentation.master.name")}</span>
          <input
            ref={navigationRenameInputRef}
            value={navigationPictureRenameDraft?.name ?? ""}
            maxLength={MAX_PICTURE_NAME_LENGTH}
            onChange={(event) =>
              setNavigationPictureRenameDraft((current) =>
                current
                  ? {
                      ...current,
                      name: event.target.value,
                      error: undefined,
                    }
                  : current,
              )
            }
            data-testid="spreadsheet-navigation-picture-rename-name"
          />
        </label>
        {navigationPictureRenameDraft?.error ? (
          <p
            role="alert"
            data-testid="spreadsheet-navigation-picture-rename-error"
            className={dialogParts.error}
          >
            {t("spreadsheet.uiCopy.thePictureChangedOrCanTBeSafelyUpdated")}
          </p>
        ) : null}
      </OfficeDialogShell>
  );
}
