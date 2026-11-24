"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The Paragraph dialog's Asian Typography > Text alignment box, shared by
 * Word's dialog (Docs, `w:pPr/w:textAlignment`) and PowerPoint's
 * (`a:pPr@fontAlgn`, ST_TextFontAlignType): where a line's characters stand
 * on it when their sizes differ. Both products offer Auto, Top, Centered,
 * Baseline and Bottom; Word adds the paragraph's inherited value. The labels
 * are the shared `toolbar.paragraphAsianTextAlign_*` strings; each editor maps
 * its own file values to these choices.
 */

import { useTranslations } from "../../../host/next-intl";

import { officeDialogParts } from "./officeDialogChrome";

export type OfficeTextAlignmentChoice = "inherit" | "auto" | "top" | "center" | "baseline" | "bottom";

export const OFFICE_TEXT_ALIGNMENT_CHOICES = ["auto", "top", "center", "baseline", "bottom"] as const;

export function OfficeTextAlignmentField<T extends OfficeTextAlignmentChoice>({
  testId,
  value,
  choices,
  onChange,
  disabled,
  placeholder,
}: {
  readonly testId: string;
  /** "" shows no choice (the selected rows differ). */
  readonly value: T | "";
  readonly choices: readonly T[];
  readonly onChange: (value: T) => void;
  readonly disabled?: boolean;
  /** Shown for "" (mixed rows); a blank row when absent. */
  readonly placeholder?: string;
}): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  return (
    <label className={officeDialogParts.field}>
      <span>{t("toolbar.paragraphAsianTextAlignment")}</span>
      <select
        data-testid={testId}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {value === "" ? <option value="">{placeholder ?? ""}</option> : null}
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {t(`toolbar.paragraphAsianTextAlign_${choice}` as Parameters<typeof t>[0])}
          </option>
        ))}
      </select>
    </label>
  );
}
