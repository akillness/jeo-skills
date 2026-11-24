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
import { type GoToSpecialOption, type GoToSpecialValueTypes } from "@mrnote/core/web/lib/spreadsheet/go-to-special.ts";
import { type Dispatch, type SetStateAction } from "react";
import { GO_TO_SPECIAL_ICON, SpreadsheetDialogIcon } from "@mrnote/core/web/components/notebook/contents/spreadsheet/SpreadsheetDialogIcon.tsx";
import { spreadsheetCellNodeAt } from "./spreadsheetCellLookup";

/** What renderSpreadsheetGoToSpecialDialog reads from SpreadsheetWindow's render scope. */
export interface RenderSpreadsheetGoToSpecialDialogInputs {
  goToSpecialActiveCellRef: RefObject<{ row: number; col: number; }>;
  goToSpecialCheckedOptionRef: RefObject<HTMLInputElement | null>;
  goToSpecialChoice: { readonly option: GoToSpecialOption; readonly types: GoToSpecialValueTypes; readonly same: boolean; readonly allLevels: boolean; };
  goToSpecialOpen: boolean;
  gridWrapRef: RefObject<HTMLDivElement | null>;
  runGoToSpecial: (option: GoToSpecialOption, choices?: { types?: GoToSpecialValueTypes; same?: boolean; allLevels?: boolean; }) => void;
  scheduleRaf: (callback: () => void) => void;
  selectionExtendingRef: RefObject<boolean>;
  setGoToSpecialChoice: Dispatch<SetStateAction<{ readonly option: GoToSpecialOption; readonly types: GoToSpecialValueTypes; readonly same: boolean; readonly allLevels: boolean; }>>;
  setGoToSpecialOpen: Dispatch<SetStateAction<boolean>>;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
}

/** Moved verbatim from SpreadsheetWindow's JSX: a render function (not a component), so the element tree React reconciles is unchanged. */
export function renderSpreadsheetGoToSpecialDialog({
  goToSpecialActiveCellRef,
  goToSpecialCheckedOptionRef,
  goToSpecialChoice,
  goToSpecialOpen,
  gridWrapRef,
  runGoToSpecial,
  scheduleRaf,
  selectionExtendingRef,
  setGoToSpecialChoice,
  setGoToSpecialOpen,
  t,
}: RenderSpreadsheetGoToSpecialDialogInputs) {
  return (
      <OfficeDialogShell
        open={goToSpecialOpen}
        // A dialog's title carries no ellipsis; the menu command that opens
        // it does (Excel: "Go To Special..." opens "Go To Special").
        title={t("spreadsheet.goToSpecialTitle")}
        description={null}
        defaultActionLabel={t("spreadsheet.fmtOk")}
        cancelActionLabel={t("common.cancel")}
        onDefaultAction={() =>
          runGoToSpecial(goToSpecialChoice.option, {
            types: goToSpecialChoice.types,
            same: goToSpecialChoice.same,
            allLevels: goToSpecialChoice.allLevels,
          })
        }
        onCancel={() => setGoToSpecialOpen(false)}
        initialFocusRef={goToSpecialCheckedOptionRef}
        returnFocusTarget={() => {
          const input = spreadsheetCellNodeAt<HTMLInputElement>(gridWrapRef.current, `${goToSpecialActiveCellRef.current.row}:${goToSpecialActiveCellRef.current.col}`);
          if (input && document.activeElement !== input) {
            // Keep whatever selection the run made (or the one Cancel left):
            // focusing the cell must not collapse it. Cleared next frame in
            // case the focus does not take.
            selectionExtendingRef.current = true;
            scheduleRaf(() => {
              selectionExtendingRef.current = false;
            });
          }
          return input ?? null;
        }}
        testIdPrefix="spreadsheet-go-to-special"
        defaultActionTestId="spreadsheet-go-to-special-ok"
        className="sm:max-w-[560px]"
      >
        {(() => {
          const radio = (option: GoToSpecialOption, label: string) => (
            <label key={option} className="flex min-h-7 items-center gap-2">
              <input
                ref={
                  goToSpecialChoice.option === option
                    ? goToSpecialCheckedOptionRef
                    : undefined
                }
                type="radio"
                name="spreadsheet-go-to-special-option"
                value={option}
                checked={goToSpecialChoice.option === option}
                onChange={() =>
                  setGoToSpecialChoice((current) => ({ ...current, option }))
                }
                data-testid={`spreadsheet-go-to-special-${option}`}
              />
              <SpreadsheetDialogIcon name={GO_TO_SPECIAL_ICON[option]} />
              <span>{label}</span>
            </label>
          );
          // Numbers / Text / Logicals / Errors refine Constants and Formulas;
          // All / Same refine Conditional formats and Data validation.
          const typesEnabled =
            goToSpecialChoice.option === "constants" ||
            goToSpecialChoice.option === "formulas";
          const scopeEnabled =
            goToSpecialChoice.option === "conditionalFormats" ||
            goToSpecialChoice.option === "validation";
          // A refinement greys with its own disabled box (the chrome's check).
          const subOption = `${dialogParts.check} ml-6`;
          return (
            <fieldset
              className="grid gap-x-8 gap-y-0 sm:grid-cols-2"
              data-testid="spreadsheet-go-to-special-options"
            >
              <legend>
                {t("spreadsheet.goToSpecialSelect")}
              </legend>
              <div className="grid content-start">
                {radio("comments", t("spreadsheet.goToSpecial_comments"))}
                {radio("constants", t("spreadsheet.goToSpecial_constants"))}
                {radio("formulas", t("spreadsheet.goToSpecial_formulas"))}
                {(
                  [
                    ["numbers", t("spreadsheet.goToSpecialType_numbers")],
                    ["text", t("spreadsheet.goToSpecialType_text")],
                    ["logicals", t("spreadsheet.goToSpecialType_logicals")],
                    ["errors", t("spreadsheet.goToSpecialType_errors")],
                  ] as const
                ).map(([type, label]) => (
                  <label key={type} className={subOption}>
                    <input
                      type="checkbox"
                      checked={goToSpecialChoice.types[type]}
                      disabled={!typesEnabled}
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;
                        setGoToSpecialChoice((current) => ({
                          ...current,
                          types: { ...current.types, [type]: checked },
                        }));
                      }}
                      data-testid={`spreadsheet-go-to-special-type-${type}`}
                    />
                    <span>{label}</span>
                  </label>
                ))}
                {radio("blanks", t("spreadsheet.goToSpecial_blanks"))}
                {radio(
                  "currentRegion",
                  t("spreadsheet.goToSpecial_currentRegion"),
                )}
                {/* Excel's left column ends with Current array and Objects
                    (XLS-A062). */}
                {radio(
                  "currentArray",
                  t("spreadsheet.goToSpecial_currentArray"),
                )}
                {radio("objects", t("spreadsheet.goToSpecial_objects"))}
              </div>
              <div className="grid content-start">
                {radio(
                  "rowDifferences",
                  t("spreadsheet.goToSpecial_rowDifferences"),
                )}
                {radio(
                  "columnDifferences",
                  t("spreadsheet.goToSpecial_columnDifferences"),
                )}
                {radio("precedents", t("spreadsheet.goToSpecial_precedents"))}
                {radio("dependents", t("spreadsheet.goToSpecial_dependents"))}
                {(
                  [
                    [false, t("spreadsheet.goToSpecialLevels_direct"), "direct"],
                    [true, t("spreadsheet.goToSpecialLevels_all"), "all"],
                  ] as const
                ).map(([allLevels, label, id]) => (
                  <label key={id} className={subOption}>
                    <input
                      type="radio"
                      name="spreadsheet-go-to-special-levels"
                      checked={goToSpecialChoice.allLevels === allLevels}
                      disabled={
                        goToSpecialChoice.option !== "precedents" &&
                        goToSpecialChoice.option !== "dependents"
                      }
                      onChange={() =>
                        setGoToSpecialChoice((current) => ({
                          ...current,
                          allLevels,
                        }))
                      }
                      data-testid={`spreadsheet-go-to-special-levels-${id}`}
                    />
                    <span>{label}</span>
                  </label>
                ))}
                {radio("lastCell", t("spreadsheet.goToSpecial_lastCell"))}
                {radio("visible", t("spreadsheet.goToSpecial_visible"))}
                {radio(
                  "conditionalFormats",
                  t("spreadsheet.goToSpecial_conditionalFormats"),
                )}
                {radio("validation", t("spreadsheet.goToSpecial_validation"))}
                {(
                  [
                    [false, t("spreadsheet.goToSpecialScope_all"), "all"],
                    [true, t("spreadsheet.goToSpecialScope_same"), "same"],
                  ] as const
                ).map(([same, label, id]) => (
                  <label key={id} className={subOption}>
                    <input
                      type="radio"
                      name="spreadsheet-go-to-special-scope"
                      checked={goToSpecialChoice.same === same}
                      disabled={!scopeEnabled}
                      onChange={() =>
                        setGoToSpecialChoice((current) => ({
                          ...current,
                          same,
                        }))
                      }
                      data-testid={`spreadsheet-go-to-special-scope-${id}`}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })()}
      </OfficeDialogShell>
  );
}
