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
import { type ShapeRotationDialogAuthority } from "./spreadsheetMutationReceipts";
import { type Dispatch, type SetStateAction } from "react";

/** What renderSpreadsheetShapeRotationDialog reads from SpreadsheetWindow's render scope. */
export interface RenderSpreadsheetShapeRotationDialogInputs {
  applyShapeRotationDialog: () => void;
  setShapeRotationDraft: Dispatch<SetStateAction<{ authority: ShapeRotationDialogAuthority; value: string; error: string | null; silent?: boolean; } | null>>;
  shapeRotationApplyAvailable: boolean;
  shapeRotationDraft: { authority: ShapeRotationDialogAuthority; value: string; error: string | null; silent?: boolean; } | null;
  shapeRotationInputRef: RefObject<HTMLInputElement | null>;
  shapeRotationReturnFocusRef: RefObject<HTMLButtonElement | null>;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
}

/** Moved verbatim from SpreadsheetWindow's JSX: a render function (not a component), so the element tree React reconciles is unchanged. */
export function renderSpreadsheetShapeRotationDialog({
  applyShapeRotationDialog,
  setShapeRotationDraft,
  shapeRotationApplyAvailable,
  shapeRotationDraft,
  shapeRotationInputRef,
  shapeRotationReturnFocusRef,
  t,
}: RenderSpreadsheetShapeRotationDialogInputs) {
  return (
      <OfficeDialogShell
        open={shapeRotationDraft !== null && !shapeRotationDraft.silent}
        title={t("spreadsheet.uiCopy.rotation")}
        description={
          t("spreadsheet.uiCopy.enterTheExactClockwiseRotationForTheShapeConfirming")
        }
        defaultActionLabel={t("spreadsheet.fmtOk")}
        cancelActionLabel={t("common.cancel")}
        defaultActionDisabled={!shapeRotationApplyAvailable}
        defaultActionTestId="spreadsheet-shape-rotation-apply"
        initialFocusRef={shapeRotationInputRef}
        returnFocusRef={shapeRotationReturnFocusRef}
        testIdPrefix="spreadsheet-shape-rotation"
        onCancel={() => setShapeRotationDraft(null)}
        onDefaultAction={applyShapeRotationDialog}
      >
        <label className={dialogParts.field}>
          <span className={dialogParts.label}>{t("spreadsheet.uiCopy.rotation")}</span>
          <span className={dialogParts.inputGroup}>
            <input
              ref={shapeRotationInputRef}
              aria-invalid={Boolean(shapeRotationDraft?.error)}
              data-control-id="XLSCTL.CONTEXT.SHAPE.ROTATION.MRAI.APPLY"
              data-testid="spreadsheet-shape-rotation-input"
              max={359.9}
              min={0}
              step={0.1}
              type="number"
              value={shapeRotationDraft?.value ?? ""}
              onChange={(event) =>
                setShapeRotationDraft((current) =>
                  current
                    ? { ...current, value: event.target.value, error: null }
                    : null,
                )
              }
            />
            <span aria-hidden="true">°</span>
          </span>
        </label>
        {shapeRotationDraft?.error ? (
          <p
            role="alert"
            className={dialogParts.error}
            data-testid="spreadsheet-shape-rotation-error"
          >
            {shapeRotationDraft.error}
          </p>
        ) : null}
      </OfficeDialogShell>
  );
}
