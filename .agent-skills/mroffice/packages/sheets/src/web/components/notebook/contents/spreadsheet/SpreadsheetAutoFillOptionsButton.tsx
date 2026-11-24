"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { ListPlus } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import type { SeriesDateUnit } from "../../../../lib/spreadsheet/fill-series";
import { SpreadsheetOptionsButton } from "./SpreadsheetOptionsButton";

/** The Auto Fill Options choices (Microsoft Support, "Fill data
 * automatically in worksheet cells"). */
export type SpreadsheetAutoFillChoice =
  | "copy"
  | "series"
  | "formats"
  | "values"
  | "flash"
  | SeriesDateUnit;

const CHOICES: ReadonlyArray<{
  choice: SpreadsheetAutoFillChoice;
  label: string;
  accessKey?: string;
}> = [
  { choice: "copy", label: "spreadsheet.autoFillOptions.copyCells", accessKey: "C" },
  { choice: "series", label: "spreadsheet.autoFillOptions.fillSeries", accessKey: "S" },
  { choice: "formats", label: "spreadsheet.autoFillOptions.fillFormattingOnly", accessKey: "F" },
  { choice: "values", label: "spreadsheet.autoFillOptions.fillWithoutFormatting", accessKey: "O" },
  { choice: "day", label: "spreadsheet.autoFillOptions.fillDays", accessKey: "D" },
  { choice: "weekday", label: "spreadsheet.autoFillOptions.fillWeekdays", accessKey: "W" },
  { choice: "month", label: "spreadsheet.autoFillOptions.fillMonths", accessKey: "M" },
  { choice: "year", label: "spreadsheet.autoFillOptions.fillYears", accessKey: "Y" },
  { choice: "flash", label: "spreadsheet.autoFillOptions.flashFill" },
];

/**
 * Excel's Auto Fill Options button at the bottom-right of a fill-handle
 * drag. Copy Cells or Fill Series is checked for what the drag did; the date
 * steps appear for a source of dates, Fill Series only where the source can
 * be extended, and Flash Fill for a fill down one column.
 */
export function SpreadsheetAutoFillOptionsButton({
  current,
  series,
  dates,
  flashFill,
  left,
  top,
  onChoose,
  onDismiss,
}: {
  current: SpreadsheetAutoFillChoice;
  series: boolean;
  dates: boolean;
  flashFill: boolean;
  left: number;
  top: number;
  onChoose: (choice: SpreadsheetAutoFillChoice) => void;
  onDismiss: () => void;
}) {
  const t = useTranslations("console-notebooks");
  const offered = CHOICES.filter(({ choice }) =>
    choice === "series"
      ? series
      : choice === "flash"
        ? flashFill
        : choice === "day" ||
            choice === "weekday" ||
            choice === "month" ||
            choice === "year"
          ? dates
          : true,
  );
  return (
    <SpreadsheetOptionsButton
      label={t("spreadsheet.autoFillOptions.button")}
      icon={<ListPlus size={12} aria-hidden />}
      left={left}
      top={top}
      onDismiss={onDismiss}
      testId="spreadsheet-autofill-options"
      items={offered.map(({ choice, label, accessKey }) => ({
        id: choice,
        label: t(label),
        accessKey,
        checked: choice === current,
        onSelect: () => onChoose(choice),
        testId: `spreadsheet-autofill-options-${choice}`,
      }))}
    />
  );
}
