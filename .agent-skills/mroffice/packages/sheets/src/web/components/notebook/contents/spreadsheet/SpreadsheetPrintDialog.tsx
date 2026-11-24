"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useRef } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as dialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import {
  SPREADSHEET_PRINT_WHAT,
  type SpreadsheetPrintScope,
  type SpreadsheetPrintWhat,
} from "../../../../lib/spreadsheet/print-scope";
import { SpreadsheetDialogIcon, type SpreadsheetDialogIconName } from "@mrnote/core/web/components/notebook/contents/spreadsheet/SpreadsheetDialogIcon.tsx";

const PRINT_WHAT_ICON: Record<SpreadsheetPrintWhat, SpreadsheetDialogIconName> = {
  activeSheets: "existingSheet",
  workbook: "selectAll",
  selection: "currentRegion",
};

/** File > Print > Settings: what to print, then Print (the browser's print
 * dialog for the PDF follows). */
export function SpreadsheetPrintDialog({
  scope,
  onScopeChange,
  onPrint,
  onCancel,
  returnFocusTarget,
}: {
  scope: SpreadsheetPrintScope;
  onScopeChange: (next: SpreadsheetPrintScope) => void;
  onPrint: () => void;
  onCancel: () => void;
  returnFocusTarget?: () => HTMLElement | null;
}) {
  const t = useTranslations("console-notebooks");
  const initialFocusRef = useRef<HTMLInputElement | null>(null);
  return (
    <OfficeDialogShell
      open
      testIdPrefix="spreadsheet-print"
      title={t("spreadsheet.printDialog.title")}
      description={null}
      defaultActionLabel={t("spreadsheet.printDialog.title")}
      cancelActionLabel={t("spreadsheet.cellShiftCancel")}
      defaultActionTestId="spreadsheet-print-ok"
      onDefaultAction={onPrint}
      onCancel={onCancel}
      initialFocusRef={initialFocusRef}
      returnFocusTarget={returnFocusTarget}
      className="sm:max-w-[380px]"
    >
      <fieldset
        role="radiogroup"
        aria-label={t("spreadsheet.printDialog.what")}
        style={{ border: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}
      >
        <legend className={dialogParts.hint}>{t("spreadsheet.printDialog.what")}</legend>
        {SPREADSHEET_PRINT_WHAT.map((what) => (
          <label key={what} className={dialogParts.check} title={t(`spreadsheet.printDialog.${what}Hint`)}>
            <input
              ref={scope.what === what ? initialFocusRef : undefined}
              type="radio"
              name="spreadsheet-print-what"
              value={what}
              checked={scope.what === what}
              onChange={() => onScopeChange({ ...scope, what })}
              data-testid={`spreadsheet-print-${what}`}
            />
            <SpreadsheetDialogIcon name={PRINT_WHAT_ICON[what]} />
            {t(`spreadsheet.printDialog.${what}`)}
          </label>
        ))}
      </fieldset>
      <label className={dialogParts.check}>
        <input
          type="checkbox"
          checked={scope.ignorePrintArea || scope.what === "selection"}
          // A selection prints without the print area anyway.
          disabled={scope.what === "selection"}
          onChange={(event) => onScopeChange({ ...scope, ignorePrintArea: event.target.checked })}
          data-testid="spreadsheet-print-ignore-print-area"
        />
        {t("spreadsheet.printDialog.ignorePrintArea")}
      </label>
    </OfficeDialogShell>
  );
}
