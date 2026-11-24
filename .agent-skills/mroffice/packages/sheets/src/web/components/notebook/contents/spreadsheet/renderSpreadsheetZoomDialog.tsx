"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as dialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { SPREADSHEET_ZOOM_DIALOG_PRESETS } from "./spreadsheetWindowConstants";
import { type Dispatch, type SetStateAction } from "react";

/** What renderSpreadsheetZoomDialog reads from SpreadsheetWindow's render scope. */
export interface RenderSpreadsheetZoomDialogInputs {
  commandDialogReturnFocusTarget: () => HTMLElement | null;
  confirmZoomDialog: () => void;
  setZoomDialogDraft: Dispatch<SetStateAction<{ choice: (typeof SPREADSHEET_ZOOM_DIALOG_PRESETS)[number] | "fit" | "custom"; custom: string; } | null>>;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  zoomDialogDraft: { choice: (typeof SPREADSHEET_ZOOM_DIALOG_PRESETS)[number] | "fit" | "custom"; custom: string; } | null;
}

/** Moved verbatim from SpreadsheetWindow's JSX: a render function (not a component), so the element tree React reconciles is unchanged. */
export function renderSpreadsheetZoomDialog({
  commandDialogReturnFocusTarget,
  confirmZoomDialog,
  setZoomDialogDraft,
  t,
  zoomDialogDraft,
}: RenderSpreadsheetZoomDialogInputs) {
  return (
       zoomDialogDraft ? (
        // XLS-A030: Excel's Zoom dialog.
        <OfficeDialogShell
          open
          testIdPrefix="spreadsheet-zoom-dialog"
          title={t("spreadsheet.view.zoomGroup")}
          description={null}
          defaultActionLabel={t("spreadsheet.cellShiftOk")}
          cancelActionLabel={t("spreadsheet.cellShiftCancel")}
          defaultActionTestId="spreadsheet-zoom-dialog-ok"
          onDefaultAction={confirmZoomDialog}
          onCancel={() => setZoomDialogDraft(null)}
          returnFocusTarget={commandDialogReturnFocusTarget}
          className="sm:max-w-[280px]"
        >
          <fieldset role="radiogroup" aria-label={t("spreadsheet.view.magnification")} style={{ border: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
            <legend className={dialogParts.label}>{t("spreadsheet.view.magnification")}</legend>
            {[...SPREADSHEET_ZOOM_DIALOG_PRESETS, "fit" as const, "custom" as const].map((choice) => (
              <label key={choice} className={dialogParts.check}>
                <input
                  type="radio"
                  name="spreadsheet-zoom-dialog"
                  checked={zoomDialogDraft.choice === choice}
                  onChange={() => setZoomDialogDraft((current) => (current ? { ...current, choice } : current))}
                  data-testid={`spreadsheet-zoom-dialog-${choice}`}
                />
                {choice === "fit"
                  ? t("spreadsheet.view.fitSelection")
                  : choice === "custom"
                    ? t("spreadsheet.view.customZoom")
                    : `${choice}%`}
                {choice === "custom" ? (
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label={t("spreadsheet.view.customZoom")}
                    value={zoomDialogDraft.custom}
                    onFocus={() => setZoomDialogDraft((current) => (current ? { ...current, choice: "custom" } : current))}
                    onChange={(event) =>
                      setZoomDialogDraft((current) => (current ? { ...current, custom: event.target.value, choice: "custom" } : current))
                    }
                    style={{ width: 64, marginInlineStart: 8 }}
                    data-testid="spreadsheet-zoom-dialog-custom-value"
                  />
                ) : null}
              </label>
            ))}
          </fieldset>
        </OfficeDialogShell>
      ) : null
  );
}
