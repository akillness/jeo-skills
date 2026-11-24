"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type FillAcrossMode } from "../../../../lib/spreadsheet/fill-extras";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as dialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { type SheetModel } from "./spreadsheetSheetModel";
import { type Dispatch, type SetStateAction } from "react";

/** What renderSpreadsheetFillAcrossSheetsDialog reads from SpreadsheetWindow's render scope. */
export interface RenderSpreadsheetFillAcrossSheetsDialogInputs {
  commandDialogReturnFocusTarget: () => HTMLElement | null;
  confirmFillAcross: () => void;
  fillAcrossDraft: { targets: string[]; mode: FillAcrossMode; } | null;
  setFillAcrossDraft: Dispatch<SetStateAction<{ targets: string[]; mode: FillAcrossMode; } | null>>;
  sheet: SheetModel;
  sheets: SheetModel[];
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
}

/** Moved verbatim from SpreadsheetWindow's JSX: a render function (not a component), so the element tree React reconciles is unchanged. */
export function renderSpreadsheetFillAcrossSheetsDialog({
  commandDialogReturnFocusTarget,
  confirmFillAcross,
  fillAcrossDraft,
  setFillAcrossDraft,
  sheet,
  sheets,
  t,
}: RenderSpreadsheetFillAcrossSheetsDialogInputs) {
  return (
       fillAcrossDraft ? (
        // XLS-A011: Excel's Fill Across Worksheets.
        <OfficeDialogShell
          open
          testIdPrefix="spreadsheet-fill-across"
          title={t("spreadsheet.fillAcrossTitle")}
          description={t("spreadsheet.fillAcrossSheets")}
          defaultActionLabel={t("spreadsheet.cellShiftOk")}
          cancelActionLabel={t("spreadsheet.cellShiftCancel")}
          defaultActionTestId="spreadsheet-fill-across-ok"
          defaultActionDisabled={fillAcrossDraft.targets.length === 0}
          onDefaultAction={confirmFillAcross}
          onCancel={() => setFillAcrossDraft(null)}
          returnFocusTarget={commandDialogReturnFocusTarget}
          className="sm:max-w-[320px]"
        >
          <div className={`${dialogParts.list} max-h-48`} role="group" aria-label={t("spreadsheet.fillAcrossSheets")}>
            {sheets
              .filter((candidate) => candidate.id !== sheet.id)
              .map((candidate) => (
                <label key={candidate.id} className={`${dialogParts.listItem} flex items-center gap-2`}>
                  <input
                    type="checkbox"
                    checked={fillAcrossDraft.targets.includes(candidate.id)}
                    onChange={(event) =>
                      setFillAcrossDraft((current) =>
                        current
                          ? {
                              ...current,
                              targets: event.target.checked
                                ? [...current.targets, candidate.id]
                                : current.targets.filter((id) => id !== candidate.id),
                            }
                          : current,
                      )
                    }
                    data-testid={`spreadsheet-fill-across-sheet-${candidate.id}`}
                  />
                  <span className="min-w-0 flex-1 truncate">{candidate.name}</span>
                </label>
              ))}
          </div>
          <fieldset role="radiogroup" aria-label={t("spreadsheet.fillAcrossFill")} style={{ border: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
            <legend className={dialogParts.label}>{t("spreadsheet.fillAcrossFill")}</legend>
            {(["all", "contents", "formats"] as const).map((mode) => (
              <label key={mode} className={dialogParts.check}>
                <input
                  type="radio"
                  name="spreadsheet-fill-across-mode"
                  checked={fillAcrossDraft.mode === mode}
                  onChange={() => setFillAcrossDraft((current) => (current ? { ...current, mode } : current))}
                  data-testid={`spreadsheet-fill-across-${mode}`}
                />
                {t(`spreadsheet.fillAcrossMode.${mode}`)}
              </label>
            ))}
          </fieldset>
        </OfficeDialogShell>
      ) : null
  );
}
