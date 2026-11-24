"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { officeDialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";

/** `null` is Excel's "(move to end)" row. */
export type MoveCopySheetBefore = string | null;

interface SpreadsheetMoveCopySheetFieldsProps {
  /** The sheets Excel lists under "Before sheet": the visible ones, in tab
   * order. A hidden sheet has no tab to land in front of. */
  readonly sheets: ReadonlyArray<{ readonly id: string; readonly name: string }>;
  readonly before: MoveCopySheetBefore;
  readonly copy: boolean;
  /** Set when the workbook cannot take another sheet. */
  readonly copyDisabledReason?: string;
  readonly onBeforeChange: (before: MoveCopySheetBefore) => void;
  readonly onCopyChange: (copy: boolean) => void;
}

// Option values are list positions, so no sheet id can collide with the
// closing row's value.
const MOVE_TO_END_VALUE = "end";

/**
 * The body of Excel's Move or Copy dialog (Microsoft Support, "Move or copy
 * worksheets or worksheet data"): To book, Before sheet with its closing
 * "(move to end)" row, and Create a copy.
 *
 * MRAI has one workbook per page, so To book shows that workbook and stays
 * fixed - Excel's other entries there are the other OPEN workbooks and
 * "(new book)", neither of which exists here.
 */
export function SpreadsheetMoveCopySheetFields({
  sheets,
  before,
  copy,
  copyDisabledReason,
  onBeforeChange,
  onCopyChange,
}: SpreadsheetMoveCopySheetFieldsProps) {
  const t = useTranslations("console-notebooks");
  return (
    <div className="grid gap-3">
      <label className={officeDialogParts.field}>
        <span className={officeDialogParts.label}>{t("spreadsheet.moveCopySheet.toBook")}</span>
        <select
          disabled
          value="current"
          onChange={() => undefined}
          data-testid="spreadsheet-move-copy-sheet-to-book"
        >
          <option value="current">
            {t("spreadsheet.moveCopySheet.thisWorkbook")}
          </option>
        </select>
      </label>
      <label className={officeDialogParts.field}>
        <span className={officeDialogParts.label}>{t("spreadsheet.moveCopySheet.beforeSheet")}</span>
        <select
          size={Math.min(8, Math.max(4, sheets.length + 1))}
          value={
            before === null
              ? MOVE_TO_END_VALUE
              : String(sheets.findIndex(({ id }) => id === before))
          }
          onChange={(event) =>
            onBeforeChange(
              event.target.value === MOVE_TO_END_VALUE
                ? null
                : (sheets[Number(event.target.value)]?.id ?? null),
            )
          }
          data-testid="spreadsheet-move-copy-sheet-before"
        >
          {sheets.map((candidate, position) => (
            <option key={candidate.id} value={String(position)}>
              {candidate.name}
            </option>
          ))}
          <option value={MOVE_TO_END_VALUE}>
            {t("spreadsheet.moveCopySheet.moveToEnd")}
          </option>
        </select>
      </label>
      <label
        className={officeDialogParts.check}
        title={copyDisabledReason}
      >
        <input
          type="checkbox"
          checked={copy}
          disabled={Boolean(copyDisabledReason)}
          onChange={(event) => onCopyChange(event.target.checked)}
          data-testid="spreadsheet-move-copy-sheet-create-copy"
        />
        {t("spreadsheet.uiCopy.createACopy")}
      </label>
    </div>
  );
}
