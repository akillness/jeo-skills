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
import { type SpreadsheetVisibleCommandReason } from "../../../../lib/spreadsheet/visible-command-authority";
import { CELL_SHIFT_DIALOG_OPTIONS, type CellShiftChoice } from "./spreadsheetDialogDrafts";
import { SpreadsheetDialogIcon, type SpreadsheetDialogIconName } from "@mrnote/core/web/components/notebook/contents/spreadsheet/SpreadsheetDialogIcon.tsx";

const CELL_SHIFT_ICON: Record<CellShiftChoice, SpreadsheetDialogIconName> = {
  right: "shiftRight",
  down: "shiftDown",
  left: "shiftLeft",
  up: "shiftUp",
  row: "entireRow",
  col: "entireColumn",
};
import { type Dispatch, type SetStateAction } from "react";
import { type ResolvedSpreadsheetVisibleControl } from "../../../../lib/spreadsheet/visible-command-authority";

/** What renderSpreadsheetCellShiftDialog reads from SpreadsheetWindow's render scope. */
export interface RenderSpreadsheetCellShiftDialogInputs {
  cellShiftChoice: CellShiftChoice;
  cellShiftDialog: "insert" | "delete" | null;
  cellShiftInitialFocusRef: RefObject<HTMLInputElement | null>;
  closeCellShiftDialog: () => void;
  commandDialogReturnFocusTarget: () => HTMLElement | null;
  confirmCellShiftDialog: () => void;
  setCellShiftChoice: Dispatch<SetStateAction<CellShiftChoice>>;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  visibleCommandReason: (reasonKey: SpreadsheetVisibleCommandReason | null) => string | undefined;
  visibleCommandState: (controlId: string) => ResolvedSpreadsheetVisibleControl;
}

/** Moved verbatim from SpreadsheetWindow's JSX: a render function (not a component), so the element tree React reconciles is unchanged. */
export function renderSpreadsheetCellShiftDialog({
  cellShiftChoice,
  cellShiftDialog,
  cellShiftInitialFocusRef,
  closeCellShiftDialog,
  commandDialogReturnFocusTarget,
  confirmCellShiftDialog,
  setCellShiftChoice,
  t,
  visibleCommandReason,
  visibleCommandState,
}: RenderSpreadsheetCellShiftDialogInputs) {
  return (
       cellShiftDialog ? (
        <OfficeDialogShell
          open
          testIdPrefix="spreadsheet-cell-shift"
          title={
            cellShiftDialog === "insert"
              ? t("spreadsheet.cellShiftInsertTitle")
              : t("spreadsheet.cellShiftDeleteTitle")
          }
          description={null}
          defaultActionLabel={t("spreadsheet.cellShiftOk")}
          cancelActionLabel={t("spreadsheet.cellShiftCancel")}
          defaultActionTestId="spreadsheet-cell-shift-ok"
          defaultActionDisabled={
            !CELL_SHIFT_DIALOG_OPTIONS[cellShiftDialog].some(
              ([choice, , controlId]) =>
                choice === cellShiftChoice &&
                visibleCommandState(controlId).enabled,
            )
          }
          onDefaultAction={confirmCellShiftDialog}
          onCancel={closeCellShiftDialog}
          initialFocusRef={cellShiftInitialFocusRef}
          returnFocusTarget={commandDialogReturnFocusTarget}
          className="sm:max-w-[340px]"
        >
          <fieldset
            role="radiogroup"
            aria-label={
              cellShiftDialog === "insert"
                ? t("spreadsheet.cellShiftInsertTitle")
                : t("spreadsheet.cellShiftDeleteTitle")
            }
            data-cell-shift-kind={cellShiftDialog}
            style={{ border: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                // Enter on an option is the dialog's OK.
                if (
                  !(event.target instanceof HTMLInputElement) ||
                  event.nativeEvent.isComposing
                ) {
                  return;
                }
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
                return;
              }
              const step =
                event.key === "ArrowDown" || event.key === "ArrowRight"
                  ? 1
                  : event.key === "ArrowUp" || event.key === "ArrowLeft"
                    ? -1
                    : 0;
              if (
                step === 0 ||
                !(event.target instanceof HTMLInputElement) ||
                event.target.type !== "radio"
              ) {
                return;
              }
              event.preventDefault();
              const enabled = CELL_SHIFT_DIALOG_OPTIONS[cellShiftDialog].filter(
                ([, , controlId]) => visibleCommandState(controlId).enabled,
              );
              if (enabled.length === 0) return;
              const index = enabled.findIndex(
                ([choice]) => choice === cellShiftChoice,
              );
              const next =
                enabled[(Math.max(index, 0) + step + enabled.length) % enabled.length];
              if (!next) return;
              setCellShiftChoice(next[0]);
              event.currentTarget
                .querySelector<HTMLInputElement>(
                  `[data-testid="spreadsheet-cell-shift-${next[0]}"]`,
                )
                ?.focus();
            }}
          >
            {CELL_SHIFT_DIALOG_OPTIONS[cellShiftDialog].map(
              ([choice, key, controlId]) => {
                const state = visibleCommandState(controlId);
                const reason = state.enabled
                  ? undefined
                  : visibleCommandReason(state.reasonKey);
                return (
                  <label
                    key={choice}
                    title={reason}
                    className={dialogParts.check}
                  >
                    <input
                      ref={
                        cellShiftChoice === choice
                          ? cellShiftInitialFocusRef
                          : undefined
                      }
                      type="radio"
                      name="spreadsheet-cell-shift"
                      value={choice}
                      checked={cellShiftChoice === choice}
                      disabled={!state.enabled}
                      aria-label={reason ? `${t(key)}: ${reason}` : undefined}
                      onChange={() => setCellShiftChoice(choice)}
                      data-control-id={controlId}
                      data-testid={`spreadsheet-cell-shift-${choice}`}
                    />
                    <SpreadsheetDialogIcon name={CELL_SHIFT_ICON[choice]} />
                    {t(key)}
                  </label>
                );
              },
            )}
          </fieldset>
        </OfficeDialogShell>
      ) : null
  );
}
