"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type Dispatch, type RefObject, type SetStateAction } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as dialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";

/** The command a Sort Warning holds until the user picks a range for it. */
export type SortWarningRun =
  | { kind: "quick"; direction: "asc" | "desc" }
  | { kind: "color"; color: string }
  | { kind: "dialog"; trigger: HTMLElement | null }
  | { kind: "removeDuplicates" };

export interface RenderSpreadsheetSortWarningDialogInputs {
  open: boolean;
  removeDuplicates: boolean;
  choice: "expand" | "current";
  setChoice: Dispatch<SetStateAction<"expand" | "current">>;
  initialFocusRef: RefObject<HTMLInputElement | null>;
  onConfirm: () => void;
  onCancel: () => void;
  returnFocusTarget: () => HTMLElement | null;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
}

/** Excel's Sort Warning: data beside the selection is expanded to, or left out. */
export function renderSpreadsheetSortWarningDialog({
  open,
  removeDuplicates,
  choice,
  setChoice,
  initialFocusRef,
  onConfirm,
  onCancel,
  returnFocusTarget,
  t,
}: RenderSpreadsheetSortWarningDialogInputs) {
  if (!open) return null;
  // Remove Duplicates asks the same question about its own action (live
  // audit S-037: it read "sort by" and "sort with the current selection").
  const question = removeDuplicates ? "spreadsheet.sortWarning.removeDuplicatesQuestion" : "spreadsheet.sortWarning.question";
  const choices = [
    ["expand", "spreadsheet.sortWarning.expand"],
    ["current", removeDuplicates ? "spreadsheet.sortWarning.removeDuplicatesCurrent" : "spreadsheet.sortWarning.current"],
  ] as const;
  return (
    <OfficeDialogShell
      open
      testIdPrefix="spreadsheet-sort-warning"
      title={t(removeDuplicates ? "spreadsheet.sortWarning.removeDuplicatesTitle" : "spreadsheet.sortWarning.title")}
      description={t(removeDuplicates ? "spreadsheet.sortWarning.removeDuplicatesMessage" : "spreadsheet.sortWarning.message")}
      defaultActionLabel={t(removeDuplicates ? "spreadsheet.sortWarning.removeDuplicates" : "spreadsheet.sortWarning.sort")}
      cancelActionLabel={t("spreadsheet.sortWarning.cancel")}
      defaultActionTestId="spreadsheet-sort-warning-ok"
      onDefaultAction={onConfirm}
      onCancel={onCancel}
      initialFocusRef={initialFocusRef}
      returnFocusTarget={returnFocusTarget}
      className="sm:max-w-[380px]"
    >
      <fieldset
        role="radiogroup"
        aria-label={t(question)}
        style={{ border: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            if (!(event.target instanceof HTMLInputElement) || event.nativeEvent.isComposing) return;
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
            return;
          }
          if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(event.key)) return;
          if (!(event.target instanceof HTMLInputElement) || event.target.type !== "radio") return;
          event.preventDefault();
          const next = choice === "expand" ? "current" : "expand";
          setChoice(next);
          event.currentTarget
            .querySelector<HTMLInputElement>(`[data-testid="spreadsheet-sort-warning-${next}"]`)
            ?.focus();
        }}
      >
        <legend className={dialogParts.check} style={{ padding: 0 }}>
          {t(question)}
        </legend>
        {choices.map(([value, key]) => (
          <label key={value} className={dialogParts.check}>
            <input
              ref={choice === value ? initialFocusRef : undefined}
              type="radio"
              name="spreadsheet-sort-warning"
              value={value}
              checked={choice === value}
              onChange={() => setChoice(value)}
              data-testid={`spreadsheet-sort-warning-${value}`}
            />
            {t(key)}
          </label>
        ))}
      </fieldset>
    </OfficeDialogShell>
  );
}
