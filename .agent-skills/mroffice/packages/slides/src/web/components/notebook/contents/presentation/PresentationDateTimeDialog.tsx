"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useRef, useState, type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import {
  PRESENTATION_DATE_FIELD_FORMATS,
  PRESENTATION_DATE_FIELD_LOCALES,
  formatDeckDate,
  type PresentationDateFieldFormat,
  type PresentationDateFieldLocale,
} from "@mrnote/core/web/lib/presentation-header-footer.ts";

export interface PresentationDateTimeChoice {
  readonly format: PresentationDateFieldFormat;
  readonly locale: PresentationDateFieldLocale;
  readonly updateAutomatically: boolean;
}

/**
 * PowerPoint's Date and Time dialog (Insert > Date & Time with the cursor in
 * text; Mac 16.86 strings): the "Date & Time formats" list, Update
 * Automatically, Cancel / Insert (PPT-A052). The language picks how the
 * formats spell the date, as the Header and Footer dialog's does.
 */
export function PresentationDateTimeDialog({
  open,
  defaultLocale,
  now,
  returnFocusRef,
  onInsert,
  onCancel,
}: {
  readonly open: boolean;
  readonly defaultLocale: PresentationDateFieldLocale;
  readonly now: Date;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onInsert: (choice: PresentationDateTimeChoice) => void;
  readonly onCancel: () => void;
}): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const [format, setFormat] = useState<PresentationDateFieldFormat>("datetime1");
  const [locale, setLocale] = useState<PresentationDateFieldLocale>(defaultLocale);
  const [updateAutomatically, setUpdateAutomatically] = useState(true);
  const listRef = useRef<HTMLSelectElement | null>(null);
  return (
    <OfficeDialogShell
      open={open}
      description=""
      title={t("presentation.dateTimeDialog.title")}
      defaultActionLabel={t("presentation.dateTimeDialog.insert")}
      cancelActionLabel={t("toolbar.cancel")}
      onDefaultAction={() => onInsert({ format, locale, updateAutomatically })}
      onCancel={onCancel}
      initialFocusRef={listRef}
      returnFocusRef={returnFocusRef}
      testIdPrefix="presentation-date-time"
      className="sm:max-w-[420px]"
    >
      <div className="grid gap-3">
        <label className={officeDialogParts.field}>
          <span className={officeDialogParts.label}>{t("presentation.dateTimeDialog.formats")}</span>
          <select
            ref={listRef}
            size={8}
            value={format}
            onChange={(event) => setFormat(event.target.value as PresentationDateFieldFormat)}
            data-testid="presentation-date-time-format"
          >
            {PRESENTATION_DATE_FIELD_FORMATS.map((item) => (
              <option key={item} value={item}>
                {formatDeckDate({ mode: "auto", format: item, locale }, now)}
              </option>
            ))}
          </select>
        </label>
        <label className={officeDialogParts.field}>
          <span className={officeDialogParts.label}>{t("presentation.headerFooter.dateLanguage")}</span>
          <select
            value={locale}
            onChange={(event) => setLocale(event.target.value as PresentationDateFieldLocale)}
            data-testid="presentation-date-time-language"
          >
            {PRESENTATION_DATE_FIELD_LOCALES.map((item) => (
              <option key={item} value={item}>
                {t(
                  item === "zh-CN"
                    ? "presentation.headerFooter.dateLanguageZh"
                    : "presentation.headerFooter.dateLanguageEn",
                )}
              </option>
            ))}
          </select>
        </label>
        <label className={officeDialogParts.check}>
          <input
            type="checkbox"
            checked={updateAutomatically}
            onChange={(event) => setUpdateAutomatically(event.target.checked)}
            data-testid="presentation-date-time-auto"
          />
          <span>{t("presentation.dateTimeDialog.updateAutomatically")}</span>
        </label>
      </div>
    </OfficeDialogShell>
  );
}
