"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as dialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { type Dispatch, type SetStateAction } from "react";
import { SpreadsheetDialogIcon } from "@mrnote/core/web/components/notebook/contents/spreadsheet/SpreadsheetDialogIcon.tsx";

/** What renderSpreadsheetFillBlanksDialog reads from SpreadsheetWindow's render scope. */
export interface RenderSpreadsheetFillBlanksDialogInputs {
  fillBlanksMode: "above" | "constant";
  fillBlanksOpen: boolean;
  fillBlanksStatus: { kind: "success" | "error"; text: string; } | null;
  fillBlanksValue: string;
  gridActiveCellFocusTarget: () => HTMLElement | null;
  locateBlanks: () => void;
  runFillBlanks: () => void;
  setFillBlanksMode: Dispatch<SetStateAction<"above" | "constant">>;
  setFillBlanksOpen: Dispatch<SetStateAction<boolean>>;
  setFillBlanksStatus: Dispatch<SetStateAction<{ kind: "success" | "error"; text: string; } | null>>;
  setFillBlanksValue: Dispatch<SetStateAction<string>>;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
}

/** Moved verbatim from SpreadsheetWindow's JSX: a render function (not a component), so the element tree React reconciles is unchanged. */
export function renderSpreadsheetFillBlanksDialog({
  fillBlanksMode,
  fillBlanksOpen,
  fillBlanksStatus,
  fillBlanksValue,
  gridActiveCellFocusTarget,
  locateBlanks,
  runFillBlanks,
  setFillBlanksMode,
  setFillBlanksOpen,
  setFillBlanksStatus,
  setFillBlanksValue,
  t,
}: RenderSpreadsheetFillBlanksDialogInputs) {
  return (
       fillBlanksOpen ? (
        <OfficeDialogShell
          open
          title={t("spreadsheet.fillBlanksTitle")}
          description={null}
          testIdPrefix="spreadsheet-fill-blanks"
          defaultActionTestId="spreadsheet-fill-blanks-run"
          defaultActionLabel={t("spreadsheet.fillBlanksRun")}
          cancelActionLabel={t("spreadsheet.goalSeekCancel")}
          onDefaultAction={runFillBlanks}
          onCancel={() => {
            setFillBlanksOpen(false);
            setFillBlanksStatus(null);
          }}
          returnFocusTarget={gridActiveCellFocusTarget}
          className="sm:max-w-[360px]"
        >
          <button
            type="button"
            onClick={locateBlanks}
            data-testid="spreadsheet-fill-blanks-locate"
            className={dialogParts.button}
            style={{ alignSelf: "flex-start" }}
          >
            <SpreadsheetDialogIcon name="blanks" />
            {t("spreadsheet.fillBlanksLocate")}
          </button>
          <span className={dialogParts.sectionTitle}>
            {t("spreadsheet.fillBlanksFillLabel")}
          </span>
          <label className={dialogParts.check}>
            <input
              type="radio"
              name="fill-blanks-mode"
              checked={fillBlanksMode === "above"}
              onChange={() => {
                setFillBlanksMode("above");
                if (fillBlanksStatus) setFillBlanksStatus(null);
              }}
              data-testid="spreadsheet-fill-blanks-mode-above"
            />
            <SpreadsheetDialogIcon name="fillFromAbove" />
            {t("spreadsheet.fillBlanksAbove")}
          </label>
          <label className={dialogParts.check}>
            <input
              type="radio"
              name="fill-blanks-mode"
              checked={fillBlanksMode === "constant"}
              onChange={() => {
                setFillBlanksMode("constant");
                if (fillBlanksStatus) setFillBlanksStatus(null);
              }}
              data-testid="spreadsheet-fill-blanks-mode-constant"
            />
            <SpreadsheetDialogIcon name="constants" />
            {t("spreadsheet.fillBlanksConstant")}
          </label>
          {fillBlanksMode === "constant" ? (
            <input
              type="text"
              value={fillBlanksValue}
              onChange={(event) => {
                setFillBlanksValue(event.target.value);
                if (fillBlanksStatus) setFillBlanksStatus(null);
              }}
              placeholder={t("spreadsheet.fillBlanksValuePlaceholder")}
              aria-label={t("spreadsheet.fillBlanksConstant")}
              data-testid="spreadsheet-fill-blanks-value"
            />
          ) : null}
          {fillBlanksStatus ? (
            <span
              data-testid="spreadsheet-fill-blanks-status"
              data-status={fillBlanksStatus.kind}
              className={dialogParts.message}
              data-tone={fillBlanksStatus.kind === "success" ? "success" : "error"}
            >
              {fillBlanksStatus.text}
            </span>
          ) : null}
        </OfficeDialogShell>
      ) : null
  );
}
