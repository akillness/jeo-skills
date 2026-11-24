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
import { type PictureRotationDialogAuthority } from "./spreadsheetMutationReceipts";
import { type Dispatch, type SetStateAction } from "react";

/** What renderSpreadsheetPictureRotationDialog reads from SpreadsheetWindow's render scope. */
export interface RenderSpreadsheetPictureRotationDialogInputs {
  applyPictureRotationDialog: () => void;
  pictureRotationApplyAvailable: boolean;
  pictureRotationDraft: { authority: PictureRotationDialogAuthority; value: string; error: string | null; } | null;
  pictureRotationInputRef: RefObject<HTMLInputElement | null>;
  pictureRotationReturnFocusRef: RefObject<HTMLButtonElement | null>;
  setPictureRotationDraft: Dispatch<SetStateAction<{ authority: PictureRotationDialogAuthority; value: string; error: string | null; } | null>>;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
}

/** Moved verbatim from SpreadsheetWindow's JSX: a render function (not a component), so the element tree React reconciles is unchanged. */
export function renderSpreadsheetPictureRotationDialog({
  applyPictureRotationDialog,
  pictureRotationApplyAvailable,
  pictureRotationDraft,
  pictureRotationInputRef,
  pictureRotationReturnFocusRef,
  setPictureRotationDraft,
  t,
}: RenderSpreadsheetPictureRotationDialogInputs) {
  return (
      <OfficeDialogShell
        open={pictureRotationDraft !== null}
        title={t("spreadsheet.uiCopy.pictureRotation")}
        description={
          t("spreadsheet.uiCopy.enterTheExactClockwiseRotationForThePictureConfirming")
        }
        defaultActionLabel={t("spreadsheet.fmtOk")}
        cancelActionLabel={t("common.cancel")}
        defaultActionDisabled={!pictureRotationApplyAvailable}
        defaultActionTestId="spreadsheet-picture-rotation-apply"
        initialFocusRef={pictureRotationInputRef}
        returnFocusRef={pictureRotationReturnFocusRef}
        testIdPrefix="spreadsheet-picture-rotation"
        onCancel={() => setPictureRotationDraft(null)}
        onDefaultAction={applyPictureRotationDialog}
      >
        <label className={dialogParts.field}>
          <span className={dialogParts.label}>{t("spreadsheet.uiCopy.rotation")}</span>
          <span className={dialogParts.inputGroup}>
            <input
              ref={pictureRotationInputRef}
              aria-invalid={Boolean(pictureRotationDraft?.error)}
              data-control-id="XLSCTL.CONTEXT.PICTURE.ROTATION.MRAI.APPLY"
              data-testid="spreadsheet-picture-rotation-input"
              max={359.9}
              min={0}
              step={0.1}
              type="number"
              value={pictureRotationDraft?.value ?? ""}
              onChange={(event) =>
                setPictureRotationDraft((current) =>
                  current
                    ? { ...current, value: event.target.value, error: null }
                    : null,
                )
              }
            />
            <span aria-hidden="true">°</span>
          </span>
        </label>
        {pictureRotationDraft?.error ? (
          <p
            role="alert"
            className={dialogParts.error}
            data-testid="spreadsheet-picture-rotation-error"
          >
            {pictureRotationDraft.error}
          </p>
        ) : null}
      </OfficeDialogShell>
  );
}
