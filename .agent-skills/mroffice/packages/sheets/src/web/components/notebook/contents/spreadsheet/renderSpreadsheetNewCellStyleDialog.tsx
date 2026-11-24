"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { pxToPt } from "@mrnote/core/web/lib/office-units.ts";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as dialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { CUSTOM_CELL_STYLE_CATEGORIES, customCellStyleDescribes, type CustomCellStyleCategory, type CustomCellStyleProtection } from "../../../../lib/spreadsheet/cell-styles";
import { type Dispatch, type SetStateAction } from "react";

/** What renderSpreadsheetNewCellStyleDialog reads from SpreadsheetWindow's render scope. */
export interface RenderSpreadsheetNewCellStyleDialogInputs {
  commandDialogReturnFocusTarget: () => HTMLElement | null;
  confirmNewCellStyle: () => void;
  nativeDefaultFontFamily: string | undefined;
  newCellStyleDraft: { mode: "new" | "modify" | "duplicate"; targetId?: string; name: string; categories: CustomCellStyleCategory[]; format: Record<string, unknown>; protection: CustomCellStyleProtection; } | null;
  newCellStyleNameTaken: boolean;
  setCellStyleFormatOpen: Dispatch<SetStateAction<boolean>>;
  setNewCellStyleDraft: Dispatch<SetStateAction<{ mode: "new" | "modify" | "duplicate"; targetId?: string; name: string; categories: CustomCellStyleCategory[]; format: Record<string, unknown>; protection: CustomCellStyleProtection; } | null>>;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  workbookThemeFontFamily: string;
}

/** Moved verbatim from SpreadsheetWindow's JSX: a render function (not a component), so the element tree React reconciles is unchanged. */
export function renderSpreadsheetNewCellStyleDialog({
  commandDialogReturnFocusTarget,
  confirmNewCellStyle,
  nativeDefaultFontFamily,
  newCellStyleDraft,
  newCellStyleNameTaken,
  setCellStyleFormatOpen,
  setNewCellStyleDraft,
  t,
  workbookThemeFontFamily,
}: RenderSpreadsheetNewCellStyleDialogInputs) {
  return (
       newCellStyleDraft ? (
        // XLS-A012: Excel's Style dialog from New Cell Style…, by example.
        <OfficeDialogShell
          open
          testIdPrefix="spreadsheet-new-cell-style"
          title={t("spreadsheet.styleDialogTitle")}
          description={null}
          defaultActionLabel={t("spreadsheet.cellShiftOk")}
          cancelActionLabel={t("spreadsheet.cellShiftCancel")}
          defaultActionTestId="spreadsheet-new-cell-style-ok"
          defaultActionDisabled={!newCellStyleDraft.name.trim() || newCellStyleNameTaken}
          onDefaultAction={confirmNewCellStyle}
          onCancel={() => {
            setCellStyleFormatOpen(false);
            setNewCellStyleDraft(null);
          }}
          footerStart={
            <button
              type="button"
              className={dialogParts.button}
              data-testid="spreadsheet-new-cell-style-format"
              onClick={() => setCellStyleFormatOpen(true)}
            >
              {t("spreadsheet.styleFormatButton")}
            </button>
          }
          returnFocusTarget={commandDialogReturnFocusTarget}
          className="sm:max-w-[380px]"
        >
          <label className={dialogParts.field}>
            <span className={dialogParts.label}>{t("spreadsheet.styleNameLabel")}</span>
            <input
              type="text"
              maxLength={255}
              autoFocus
              value={newCellStyleDraft.name}
              onChange={(event) =>
                setNewCellStyleDraft((current) =>
                  current ? { ...current, name: event.target.value } : current,
                )
              }
              aria-invalid={newCellStyleNameTaken}
              data-testid="spreadsheet-new-cell-style-name"
            />
          </label>
          {newCellStyleNameTaken ? (
            <p role="alert" className={dialogParts.error} data-testid="spreadsheet-new-cell-style-error">
              {t("spreadsheet.styleNameTaken")}
            </p>
          ) : null}
          <fieldset style={{ border: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
            <legend className={dialogParts.label}>{t("spreadsheet.styleIncludesLabel")}</legend>
            {CUSTOM_CELL_STYLE_CATEGORIES.map((category) => {
              // Excel's summary beside each box: what the style holds.
              const facts = customCellStyleDescribes(newCellStyleDraft.format);
              const { locked, hidden } = newCellStyleDraft.protection;
              const summary =
                category === "number"
                  ? facts.numberFormat ?? t("spreadsheet.fmtCatGeneral")
                  : category === "font"
                    ? [
                        facts.font.family ?? nativeDefaultFontFamily ?? workbookThemeFontFamily,
                        facts.font.sizePx ? String(Math.round(pxToPt(facts.font.sizePx) * 2) / 2) : null,
                      ].filter(Boolean).join(" ")
                    : category === "border"
                      ? t(facts.borders ? "spreadsheet.styleSummary.borders" : "spreadsheet.styleSummary.noBorders")
                      : category === "fill"
                        ? t(facts.fill ? "spreadsheet.styleSummary.shading" : "spreadsheet.styleSummary.noShading")
                        : category === "protection"
                          ? locked && hidden
                            ? `${t("spreadsheet.styleSummary.locked")}, ${t("spreadsheet.styleSummary.hidden")}`
                            : locked
                              ? t("spreadsheet.styleSummary.locked")
                              : hidden
                                ? t("spreadsheet.styleSummary.hidden")
                                : t("spreadsheet.styleSummary.noProtection")
                          : null;
              return (
                <label key={category} className={dialogParts.check}>
                  <input
                    type="checkbox"
                    checked={newCellStyleDraft.categories.includes(category)}
                    onChange={(event) =>
                      setNewCellStyleDraft((current) =>
                        current
                          ? {
                              ...current,
                              categories: CUSTOM_CELL_STYLE_CATEGORIES.filter((entry) =>
                                entry === category
                                  ? event.target.checked
                                  : current.categories.includes(entry),
                              ),
                            }
                          : current,
                      )
                    }
                    data-testid={`spreadsheet-new-cell-style-${category}`}
                  />
                  <span>
                    {t(`spreadsheet.styleCategory.${category}`)}
                    {summary ? (
                      <span className={dialogParts.hint} data-testid={`spreadsheet-new-cell-style-${category}-summary`}>
                        {`: ${summary}`}
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </fieldset>
        </OfficeDialogShell>
      ) : null
  );
}
