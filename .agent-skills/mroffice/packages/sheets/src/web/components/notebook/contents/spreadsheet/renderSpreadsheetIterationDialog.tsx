"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { type Dispatch, type SetStateAction } from "react";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as dialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";

/** The dialog's fields as typed (the limits as text until OK). */
export type SpreadsheetIterationDialogDraft = {
  enabled: boolean;
  maxIterations: string;
  maxChange: string;
};

/** The limits a draft states, or null when Excel would refuse them
 * (Maximum Iterations 1..32767, Maximum Change a number of at least 0). */
export function spreadsheetIterationDialogLimits(
  draft: SpreadsheetIterationDialogDraft,
): { maxIterations: number; maxChange: number } | null {
  const maxIterations = Number(draft.maxIterations.trim());
  const maxChange = Number(draft.maxChange.trim());
  if (!Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > 32767) return null;
  if (draft.maxChange.trim() === "" || !Number.isFinite(maxChange) || maxChange < 0) return null;
  return { maxIterations, maxChange };
}

export interface RenderSpreadsheetIterationDialogInputs {
  commandDialogReturnFocusTarget: () => HTMLElement | null;
  confirmIterationDialog: () => void;
  iterationDialogDraft: SpreadsheetIterationDialogDraft | null;
  setIterationDialogDraft: Dispatch<SetStateAction<SpreadsheetIterationDialogDraft | null>>;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
}

/**
 * Excel's iteration settings (File > Options > Formulas > Calculation
 * options; Excel for Mac: Preferences > Calculation): Enable iterative
 * calculation, Maximum Iterations and Maximum Change, saved with the
 * workbook (calcPr@iterate, @iterateCount, @iterateDelta). The limits stay
 * editable with iteration off, as Excel keeps them.
 */
export function renderSpreadsheetIterationDialog({
  commandDialogReturnFocusTarget,
  confirmIterationDialog,
  iterationDialogDraft,
  setIterationDialogDraft,
  t,
}: RenderSpreadsheetIterationDialogInputs) {
  if (!iterationDialogDraft) return null;
  const update = (patch: Partial<SpreadsheetIterationDialogDraft>) =>
    setIterationDialogDraft((current) => (current ? { ...current, ...patch } : current));
  return (
    <OfficeDialogShell
      open
      testIdPrefix="spreadsheet-iteration-dialog"
      title={t("spreadsheet.formulas.iterativeCalculationTitle")}
      description={null}
      defaultActionLabel={t("spreadsheet.cellShiftOk")}
      cancelActionLabel={t("spreadsheet.cellShiftCancel")}
      defaultActionTestId="spreadsheet-iteration-dialog-ok"
      defaultActionDisabled={spreadsheetIterationDialogLimits(iterationDialogDraft) === null}
      onDefaultAction={confirmIterationDialog}
      onCancel={() => setIterationDialogDraft(null)}
      returnFocusTarget={commandDialogReturnFocusTarget}
      className="sm:max-w-[320px]"
    >
      <div style={{ display: "grid", gap: 8 }}>
        <label className={dialogParts.check}>
          <input
            type="checkbox"
            checked={iterationDialogDraft.enabled}
            onChange={(event) => update({ enabled: event.target.checked })}
            data-testid="spreadsheet-iteration-dialog-enabled"
          />
          {t("spreadsheet.formulas.iterativeCalculationEnable")}
        </label>
        <label className={dialogParts.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          {t("spreadsheet.formulas.iterativeCalculationMaxIterations")}
          <input
            type="text"
            inputMode="numeric"
            value={iterationDialogDraft.maxIterations}
            onChange={(event) => update({ maxIterations: event.target.value })}
            style={{ width: 88 }}
            data-testid="spreadsheet-iteration-dialog-max-iterations"
          />
        </label>
        <label className={dialogParts.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          {t("spreadsheet.formulas.iterativeCalculationMaxChange")}
          <input
            type="text"
            inputMode="decimal"
            value={iterationDialogDraft.maxChange}
            onChange={(event) => update({ maxChange: event.target.value })}
            style={{ width: 88 }}
            data-testid="spreadsheet-iteration-dialog-max-change"
          />
        </label>
      </div>
    </OfficeDialogShell>
  );
}

export interface RenderSpreadsheetPrecisionWarningInputs {
  commandDialogReturnFocusTarget: () => HTMLElement | null;
  confirmPrecisionAsDisplayed: () => void;
  precisionWarningOpen: boolean;
  setPrecisionWarningOpen: Dispatch<SetStateAction<boolean>>;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
}

/**
 * The warning Excel gives when Set precision as displayed is turned on
 * (Options > Advanced > When calculating this workbook): every number then
 * becomes the number its format shows, for good. OK turns it on; Cancel
 * leaves the workbook as it is.
 */
export function renderSpreadsheetPrecisionWarning({
  commandDialogReturnFocusTarget,
  confirmPrecisionAsDisplayed,
  precisionWarningOpen,
  setPrecisionWarningOpen,
  t,
}: RenderSpreadsheetPrecisionWarningInputs) {
  if (!precisionWarningOpen) return null;
  return (
    <OfficeDialogShell
      open
      testIdPrefix="spreadsheet-precision-warning"
      title={t("spreadsheet.formulas.precisionAsDisplayedMenu")}
      description={t("spreadsheet.formulas.precisionAsDisplayedWarning")}
      defaultActionLabel={t("spreadsheet.cellShiftOk")}
      cancelActionLabel={t("spreadsheet.cellShiftCancel")}
      defaultActionTestId="spreadsheet-precision-warning-ok"
      onDefaultAction={confirmPrecisionAsDisplayed}
      onCancel={() => setPrecisionWarningOpen(false)}
      returnFocusTarget={commandDialogReturnFocusTarget}
      className="sm:max-w-[360px]"
    />
  );
}
