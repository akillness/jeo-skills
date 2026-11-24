"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { type Dispatch, type SetStateAction } from "react";

/** What renderSpreadsheetChartPasteSpecialDialog reads from SpreadsheetWindow's render scope. */
export interface RenderSpreadsheetChartPasteSpecialDialogInputs {
  applyChartPasteSpecial: (as: "chart" | "picture") => Promise<boolean>;
  chartPasteSpecial: { as: "chart" | "picture"; } | null;
  commandDialogReturnFocusTarget: () => HTMLElement | null;
  setChartPasteSpecial: Dispatch<SetStateAction<{ as: "chart" | "picture"; } | null>>;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
}

/** Moved verbatim from SpreadsheetWindow's JSX: a render function (not a component), so the element tree React reconciles is unchanged. */
export function renderSpreadsheetChartPasteSpecialDialog({
  applyChartPasteSpecial,
  chartPasteSpecial,
  commandDialogReturnFocusTarget,
  setChartPasteSpecial,
  t,
}: RenderSpreadsheetChartPasteSpecialDialogInputs) {
  return (
      <OfficeDialogShell
        open={chartPasteSpecial !== null}
        testIdPrefix="spreadsheet-chart-paste-special"
        title={t("toolbar.pasteSpecial")}
        description={null}
        defaultActionLabel={t("spreadsheet.pasteSpecialOk")}
        cancelActionLabel={t("spreadsheet.pasteSpecialCancel")}
        defaultActionTestId="spreadsheet-chart-paste-special-apply"
        onDefaultAction={() => {
          const as = chartPasteSpecial?.as ?? "chart";
          setChartPasteSpecial(null);
          void applyChartPasteSpecial(as);
        }}
        onCancel={() => setChartPasteSpecial(null)}
        returnFocusTarget={commandDialogReturnFocusTarget}
        className="sm:max-w-[360px]"
      >
        <fieldset
          role="radiogroup"
          aria-label={t("spreadsheet.uiCopy.chartPasteSpecialAs")}
          style={{ border: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}
        >
          <legend style={{ fontWeight: 600, marginBottom: 4 }}>{t("spreadsheet.uiCopy.chartPasteSpecialAs")}</legend>
          {(
            [
              ["chart", t("spreadsheet.uiCopy.chartPasteSpecialChart")],
              ["picture", t("spreadsheet.uiCopy.chartPasteSpecialPicture")],
            ] as const
          ).map(([value, label]) => (
            <label key={value} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="radio"
                name="spreadsheet-chart-paste-special-as"
                data-testid={`spreadsheet-chart-paste-special-${value}`}
                checked={(chartPasteSpecial?.as ?? "chart") === value}
                onChange={() => setChartPasteSpecial({ as: value })}
              />
              {label}
            </label>
          ))}
        </fieldset>
      </OfficeDialogShell>
  );
}
