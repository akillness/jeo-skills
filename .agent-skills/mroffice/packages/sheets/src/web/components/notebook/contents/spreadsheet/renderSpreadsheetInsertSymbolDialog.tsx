"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type SpreadsheetCell } from "@mrnote/core/web/lib/spreadsheet/cell-buttons.ts";
import { type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as dialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { SYMBOL_CATEGORIES } from "../../../../lib/spreadsheet/symbols";
import { type Dispatch, type SetStateAction } from "react";

/** What renderSpreadsheetInsertSymbolDialog reads from SpreadsheetWindow's render scope. */
export interface RenderSpreadsheetInsertSymbolDialogInputs {
  closeSymbolPicker: () => void;
  commitSymbolPicker: (requestedSymbol?: string) => boolean;
  setSymbolPickerDraft: Dispatch<SetStateAction<{ sheetId: string; row: number; col: number; sourceCell: SpreadsheetCell | undefined; sourceValue: string; selectionStart: number; selectionEnd: number; symbol: string; error?: "stale"; } | null>>;
  symbolPickerDraft: { sheetId: string; row: number; col: number; sourceCell: SpreadsheetCell | undefined; sourceValue: string; selectionStart: number; selectionEnd: number; symbol: string; error?: "stale"; } | null;
  symbolPickerFirstSymbolRef: RefObject<HTMLButtonElement | null>;
  symbolPickerOpen: boolean;
  symbolPickerReturnFocusRef: RefObject<HTMLElement | null>;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
}

/** Moved verbatim from SpreadsheetWindow's JSX: a render function (not a component), so the element tree React reconciles is unchanged. */
export function renderSpreadsheetInsertSymbolDialog({
  closeSymbolPicker,
  commitSymbolPicker,
  setSymbolPickerDraft,
  symbolPickerDraft,
  symbolPickerFirstSymbolRef,
  symbolPickerOpen,
  symbolPickerReturnFocusRef,
  t,
}: RenderSpreadsheetInsertSymbolDialogInputs) {
  return (
      <OfficeDialogShell
        open={symbolPickerOpen}
        title={t("spreadsheet.insertSymbol")}
        description={
          t("spreadsheet.symbolDialog.instruction")
        }
        defaultActionLabel={t("toolbar.dialogInsert")}
        cancelActionLabel={t("common.cancel")}
        defaultActionDisabled={
          !symbolPickerDraft || Boolean(symbolPickerDraft.error)
        }
        onDefaultAction={() => void commitSymbolPicker()}
        onCancel={closeSymbolPicker}
        initialFocusRef={symbolPickerFirstSymbolRef}
        returnFocusRef={symbolPickerReturnFocusRef}
        className="sm:max-w-[600px]"
        testIdPrefix="spreadsheet-symbol"
      >
        <div
          className={`${dialogParts.well} flex items-center justify-between px-3 py-2`}
          data-testid="spreadsheet-symbol-selection"
        >
          <span className={dialogParts.hint}>
            {t("spreadsheet.symbolDialog.selected")}
          </span>
          <span className="text-2xl leading-none" aria-live="polite">
            {symbolPickerDraft?.symbol ?? ""}
          </span>
        </div>
        <div className="grid max-h-[340px] gap-4 overflow-y-auto pr-1">
          {SYMBOL_CATEGORIES.map((category, categoryIndex) => (
            <section
              key={category.id}
              className="grid gap-2"
              data-testid={`spreadsheet-symbol-group-${category.id}`}
            >
              <h3 className={dialogParts.sectionTitle}>
                {t(`spreadsheet.symbolGroup_${category.id}`)}
              </h3>
              {/* One well per group with borderless cells, as a character
                  viewer shows them; hover and the chosen symbol tint the cell. */}
              <div
                className={`${dialogParts.well} grid grid-cols-8 gap-0.5 p-1`}
                role="group"
              >
                {category.symbols.map((symbol, symbolIndex) => {
                  const selected = symbolPickerDraft?.symbol === symbol;
                  return (
                    <button
                      key={`${category.id}-${symbolIndex}`}
                      ref={
                        categoryIndex === 0 && symbolIndex === 0
                          ? symbolPickerFirstSymbolRef
                          : undefined
                      }
                      type="button"
                      aria-label={symbol}
                      aria-pressed={selected}
                      className={`${dialogParts.listItem} inline-grid h-9 place-items-center`}
                      data-selected={selected ? "true" : "false"}
                      data-testid="spreadsheet-symbol-char"
                      onClick={() =>
                        setSymbolPickerDraft((current) =>
                          current
                            ? { ...current, symbol, error: undefined }
                            : current,
                        )
                      }
                      onDoubleClick={() => void commitSymbolPicker(symbol)}
                    >
                      <span className="text-lg leading-none">{symbol}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        {symbolPickerDraft?.error ? (
          <p
            role="alert"
            className={dialogParts.error}
            data-testid="spreadsheet-symbol-error"
          >
            {t("spreadsheet.symbolDialog.stale")}
          </p>
        ) : null}
      </OfficeDialogShell>
  );
}
