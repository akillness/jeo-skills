"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type SpreadsheetCell } from "@mrnote/core/web/lib/spreadsheet/cell-buttons.ts";
import { type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { type CellHyperlinkDetails } from "../../../../lib/spreadsheet/editing-buttons";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as dialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { type Dispatch, type SetStateAction } from "react";
import { SpreadsheetDialogIcon } from "@mrnote/core/web/components/notebook/contents/spreadsheet/SpreadsheetDialogIcon.tsx";

/** What renderSpreadsheetHyperlinkDialog reads from SpreadsheetWindow's render scope. */
export interface RenderSpreadsheetHyperlinkDialogInputs {
  activeCell: { row: number; col: number; };
  activeHyperlinkCell: SpreadsheetCell;
  closeHyperlinkDialog: () => void;
  commandDialogReturnFocusTarget: () => HTMLElement | null;
  hyperlinkDisplayDraft: string;
  hyperlinkDisplayFollowsRef: RefObject<boolean>;
  hyperlinkDisplayLocked: boolean;
  hyperlinkDraft: string;
  hyperlinkEmailDraft: string;
  hyperlinkError: string | null;
  hyperlinkInitialFocusRef: RefObject<HTMLInputElement | null>;
  hyperlinkPlaceDraft: string;
  hyperlinkTarget: () => string;
  hyperlinkTargetKind: "url" | "place" | "email";
  hyperlinkTooltipDraft: string;
  hyperlinkWriteBlocked: boolean;
  setCellHyperlink: (row: number, col: number, raw: string, details?: CellHyperlinkDetails) => boolean;
  setHyperlinkDisplayDraft: Dispatch<SetStateAction<string>>;
  setHyperlinkDraft: Dispatch<SetStateAction<string>>;
  setHyperlinkEmailDraft: Dispatch<SetStateAction<string>>;
  setHyperlinkError: Dispatch<SetStateAction<string | null>>;
  setHyperlinkPlaceDraft: Dispatch<SetStateAction<string>>;
  setHyperlinkTargetKind: Dispatch<SetStateAction<"url" | "place" | "email">>;
  setHyperlinkTooltipDraft: Dispatch<SetStateAction<string>>;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
}

/** Moved verbatim from SpreadsheetWindow's JSX: a render function (not a component), so the element tree React reconciles is unchanged. */
export function renderSpreadsheetHyperlinkDialog({
  activeCell,
  activeHyperlinkCell,
  closeHyperlinkDialog,
  commandDialogReturnFocusTarget,
  hyperlinkDisplayDraft,
  hyperlinkDisplayFollowsRef,
  hyperlinkDisplayLocked,
  hyperlinkDraft,
  hyperlinkEmailDraft,
  hyperlinkError,
  hyperlinkInitialFocusRef,
  hyperlinkPlaceDraft,
  hyperlinkTarget,
  hyperlinkTargetKind,
  hyperlinkTooltipDraft,
  hyperlinkWriteBlocked,
  setCellHyperlink,
  setHyperlinkDisplayDraft,
  setHyperlinkDraft,
  setHyperlinkEmailDraft,
  setHyperlinkError,
  setHyperlinkPlaceDraft,
  setHyperlinkTargetKind,
  setHyperlinkTooltipDraft,
  t,
}: RenderSpreadsheetHyperlinkDialogInputs) {
  return (
        <OfficeDialogShell
          open
          testIdPrefix="spreadsheet-hyperlink"
          title={t("spreadsheet.linkDialog.title")}
          description={null}
          defaultActionLabel={t("spreadsheet.fmtOk")}
          cancelActionLabel={t("common.cancel")}
          defaultActionTestId="spreadsheet-hyperlink-apply"
          defaultActionDisabled={hyperlinkWriteBlocked}
          onDefaultAction={() => {
            if (
              setCellHyperlink(
                activeCell.row,
                activeCell.col,
                hyperlinkTarget(),
                {
                  displayText: hyperlinkDisplayDraft,
                  tooltip: hyperlinkTooltipDraft,
                },
              )
            ) {
              closeHyperlinkDialog();
            }
          }}
          onCancel={closeHyperlinkDialog}
          initialFocusRef={hyperlinkInitialFocusRef}
          returnFocusTarget={commandDialogReturnFocusTarget}
          className="sm:max-w-[420px]"
          footerStart={
            <button
              type="button"
              onClick={() => {
                if (
                  setCellHyperlink(activeCell.row, activeCell.col, "")
                ) {
                  setHyperlinkDraft("");
                  setHyperlinkPlaceDraft("");
                  setHyperlinkEmailDraft("");
                  closeHyperlinkDialog();
                }
              }}
              disabled={hyperlinkWriteBlocked || !activeHyperlinkCell?.hyperlink}
              data-testid="spreadsheet-hyperlink-clear"
              className={dialogParts.button}
            >
              <SpreadsheetDialogIcon name="linkRemove" />
              {t("spreadsheet.hyperlinkClear")}
            </button>
          }
        >
            {/* Excel for the web asks for the visible text first, then the
                destination as three mutually exclusive rows. */}
            <label className={dialogParts.field}>
              {t("toolbar.linkTextPlaceholder")}
              <input
                type="text"
                value={hyperlinkDisplayDraft}
                onChange={(event) => {
                  hyperlinkDisplayFollowsRef.current = false;
                  setHyperlinkDisplayDraft(event.target.value);
                }}
                disabled={hyperlinkDisplayLocked}
                maxLength={255}
                title={
                  hyperlinkDisplayLocked
                    ? t("spreadsheet.linkDialog.formulaTextHint")
                    : undefined
                }
                data-testid="spreadsheet-hyperlink-display-text"
              />
            </label>
            <fieldset>
              <legend>
                {t("spreadsheet.linkDialog.whereTo")}
              </legend>
              {(
                [
                  {
                    kind: "url" as const,
                    testId: "spreadsheet-hyperlink-input",
                    label: t("spreadsheet.linkDialog.urlOption"),
                    value: hyperlinkDraft,
                    onChange: setHyperlinkDraft,
                    maxLength: 2048,
                    inputMode: "url" as const,
                  },
                  {
                    kind: "place" as const,
                    testId: "spreadsheet-hyperlink-place",
                    label: t("spreadsheet.linkDialog.placeOption"),
                    value: hyperlinkPlaceDraft,
                    onChange: setHyperlinkPlaceDraft,
                    maxLength: 255,
                    inputMode: "text" as const,
                  },
                  {
                    kind: "email" as const,
                    testId: "spreadsheet-hyperlink-email",
                    label: t("spreadsheet.linkDialog.emailOption"),
                    value: hyperlinkEmailDraft,
                    onChange: setHyperlinkEmailDraft,
                    maxLength: 320,
                    inputMode: "email" as const,
                  },
                ]
              ).map((option) => (
                <div
                  key={option.kind}
                  className={dialogParts.row}
                  style={{ flexWrap: "nowrap" }}
                >
                  <input
                    type="radio"
                    name="spreadsheet-hyperlink-target"
                    checked={hyperlinkTargetKind === option.kind}
                    onChange={() => {
                      setHyperlinkTargetKind(option.kind);
                      if (hyperlinkError) setHyperlinkError(null);
                    }}
                    aria-label={option.label}
                    data-testid={`${option.testId}-radio`}
                  />
                  <input
                    type="text"
                    inputMode={option.inputMode}
                    value={option.value}
                    // Typing in a row selects it, the way Excel's dialog does.
                    onFocus={() => {
                      if (hyperlinkTargetKind === option.kind) return;
                      setHyperlinkTargetKind(option.kind);
                      if (hyperlinkError) setHyperlinkError(null);
                    }}
                    onChange={(event) => {
                      option.onChange(event.target.value);
                      if (
                        hyperlinkDisplayFollowsRef.current &&
                        !hyperlinkDisplayLocked
                      ) {
                        setHyperlinkDisplayDraft(
                          option.kind === "email" && event.target.value !== ""
                            ? `mailto:${event.target.value}`
                            : event.target.value,
                        );
                      }
                      if (hyperlinkError) setHyperlinkError(null);
                    }}
                    maxLength={option.maxLength}
                    placeholder={option.label}
                    aria-label={option.label}
                    data-testid={option.testId}
                    // Excel opens the dialog in the Address box (or the
                    // row the link already uses).
                    ref={
                      hyperlinkTargetKind === option.kind
                        ? hyperlinkInitialFocusRef
                        : undefined
                    }
                    style={{ flex: 1, minWidth: 0 }}
                  />
                </div>
              ))}
            </fieldset>
            <label className={dialogParts.field}>
              {t("spreadsheet.linkDialog.screenTip")}
              <input
                type="text"
                value={hyperlinkTooltipDraft}
                onChange={(event) =>
                  setHyperlinkTooltipDraft(event.target.value)
                }
                maxLength={255}
                data-testid="spreadsheet-hyperlink-tooltip"
              />
            </label>
            {hyperlinkError ? (
              <span
                role="alert"
                data-testid="spreadsheet-hyperlink-error"
                className={dialogParts.error}
              >
                {hyperlinkError}
              </span>
            ) : hyperlinkWriteBlocked ? (
              // Says why OK is unavailable on a protected sheet.
              <span className={dialogParts.hint}>
                {t("spreadsheet.protectionBlocked")}
              </span>
            ) : null}
        </OfficeDialogShell>
  );
}
