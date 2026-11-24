"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { ClipboardPaste } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import type {
  PasteOptionsChoice,
  PasteOptionsEntry,
  PasteOptionsGroup,
} from "@mrnote/core/web/lib/spreadsheet/paste-special.ts";
import { SpreadsheetOptionsButton } from "./SpreadsheetOptionsButton";

const CHOICE_LABEL: Record<PasteOptionsChoice, string> = {
  paste: "spreadsheet.pasteOptions.paste",
  formulas: "spreadsheet.pasteOptions.formulas",
  "formulas-number-formats": "spreadsheet.pasteOptions.formulasNumberFormatting",
  "no-borders": "spreadsheet.pasteOptions.noBorders",
  transpose: "spreadsheet.pasteOptions.transpose",
  values: "spreadsheet.pasteOptions.values",
  "values-number-formats": "spreadsheet.pasteOptions.valuesNumberFormatting",
  "values-source-formatting": "spreadsheet.pasteOptions.valuesSourceFormatting",
  formatting: "spreadsheet.pasteOptions.formatting",
  "paste-link": "spreadsheet.pasteOptions.pasteLink",
  picture: "spreadsheet.pasteOptions.picture",
  "keep-source-formatting": "spreadsheet.pasteOptions.keepSourceFormatting",
  "match-destination-formatting":
    "spreadsheet.pasteOptions.matchDestinationFormatting",
  "text-import": "spreadsheet.pasteOptions.textImport",
};

const GROUP_LABEL: Record<PasteOptionsGroup, string> = {
  paste: "spreadsheet.pasteOptions.groupPaste",
  values: "spreadsheet.pasteOptions.groupValues",
  other: "spreadsheet.pasteOptions.groupOther",
};

/**
 * Excel's Paste Options (Ctrl) button at the bottom-right of a pasted range.
 * The choice the paste was made with is checked; picking another redoes the
 * paste that way (the host makes it one Undo step in place of the first).
 */
export function SpreadsheetPasteOptionsButton({
  entries,
  current,
  left,
  top,
  openRequest,
  returnFocus,
  onChoose,
  onDismiss,
}: {
  entries: readonly PasteOptionsEntry[];
  current: PasteOptionsChoice;
  left: number;
  top: number;
  openRequest: number;
  returnFocus: () => void;
  onChoose: (choice: PasteOptionsChoice) => void;
  onDismiss: () => void;
}) {
  const t = useTranslations("console-notebooks");
  return (
    <SpreadsheetOptionsButton
      label={t("spreadsheet.pasteOptions.button")}
      icon={<ClipboardPaste size={12} aria-hidden />}
      left={left}
      top={top}
      openRequest={openRequest}
      returnFocus={returnFocus}
      onDismiss={onDismiss}
      testId="spreadsheet-paste-options"
      items={entries.map(({ choice, group, accessKey }) => ({
        id: choice,
        label: t(CHOICE_LABEL[choice]),
        group: t(GROUP_LABEL[group]),
        accessKey,
        checked: choice === current,
        onSelect: () => onChoose(choice),
        testId: `spreadsheet-paste-options-${choice}`,
      }))}
    />
  );
}
