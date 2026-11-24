"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, useMemo, useRef, useState, type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { moveListboxSelection } from "@mrnote/core/web/lib/listbox-arrow-keys.ts";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { documentValueInputClassName } from "@mrnote/core/web/components/console/editor/documentValueInput.ts";
import { formatListOrdinal } from "@mrnote/core/web/components/console/editor/native-document/listNumbering.ts";

/**
 * Word's Insert > Number dialog (Word for Mac, Insert > Symbols > Number):
 * a Number box and a Number type list. Word writes the result as an
 * `= n \* format` field whose value never changes (read back from Word
 * 16.86: 42 with "I, II, III" is `{ = 42 \* ROMAN }` showing XLII), so the
 * document gets the formatted number itself. The types are the counters
 * Word's list numbering draws (`formatListOrdinal`, read from Word's own
 * output); the East Asian ones are offered where Word offers them, in a
 * Chinese, Japanese or Korean Word.
 */
const WESTERN_FORMATS = [
  "decimal",
  "upperLetter",
  "lowerLetter",
  "upperRoman",
  "lowerRoman",
] as const;

const CHINESE_FORMATS = [
  "ideographTraditional",
  "ideographZodiac",
  "chineseLegalSimplified",
  "chineseCountingThousand",
  "decimalEnclosedFullstop",
  "decimalEnclosedParen",
  "decimalEnclosedCircle",
  "ideographEnclosedCircle",
  "ideographLegalTraditional",
  "taiwaneseCountingThousand",
  "decimalFullWidth",
] as const;

const JAPANESE_FORMATS = [
  "aiueoFullWidth",
  "irohaFullWidth",
  "japaneseCounting",
  "decimalEnclosedCircle",
  "decimalFullWidth",
] as const;

const KOREAN_FORMATS = [
  "ganada",
  "chosung",
  "koreanDigital",
  "koreanCounting",
  "decimalEnclosedCircle",
  "decimalFullWidth",
] as const;

/** Word's largest Number: the field's integer range. */
const MAX_NUMBER = 999_999;

export function documentNumberFormats(locale: string): readonly string[] {
  const language = locale.toLowerCase().split(/[-_]/, 1)[0];
  if (language === "zh") return [...WESTERN_FORMATS, ...CHINESE_FORMATS];
  if (language === "ja") return [...WESTERN_FORMATS, ...JAPANESE_FORMATS];
  if (language === "ko") return [...WESTERN_FORMATS, ...KOREAN_FORMATS];
  return WESTERN_FORMATS;
}

/** The number as `format` draws it, or null when that type cannot show it. */
export function documentNumberText(format: string, value: number): string | null {
  if (!Number.isInteger(value) || value < 0 || value > MAX_NUMBER) return null;
  if (value === 0 && format !== "decimal" && format !== "decimalFullWidth") return null;
  // Word's letters and Roman numerals stop where its field does.
  if ((format === "upperRoman" || format === "lowerRoman") && value > 32_767) return null;
  if ((format === "upperLetter" || format === "lowerLetter") && value > 780) return null;
  const text = formatListOrdinal(format, value);
  return text ? text : null;
}

/** "1, 2, 3, …" in the type's own glyphs: the row's label. */
function sampleOf(format: string): string {
  return `${[1, 2, 3].map((n) => formatListOrdinal(format, n)).join(", ")}, …`;
}

export interface DocumentNumberDialogProps {
  readonly open: boolean;
  readonly canEdit?: boolean;
  readonly locale: string;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onSubmit: (text: string) => boolean;
  readonly onClose: () => void;
}

export function DocumentNumberDialog({
  open,
  canEdit = true,
  locale,
  returnFocusRef,
  onSubmit,
  onClose,
}: DocumentNumberDialogProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const formats = useMemo(() => documentNumberFormats(locale), [locale]);
  const numberRef = useRef<HTMLInputElement | null>(null);
  const [number, setNumber] = useState("");
  const [format, setFormat] = useState<string>(formats[0] ?? "decimal");
  const [error, setError] = useState<string | null>(null);
  const parsed = /^\s*\d{1,6}\s*$/.test(number) ? Number(number.trim()) : null;
  const preview = parsed === null ? null : documentNumberText(format, parsed);

  const submit = useCallback(() => {
    if (!canEdit) return;
    if (parsed === null) {
      setError(t("toolbar.numberDialog.invalidNumber"));
      return;
    }
    if (preview === null) {
      setError(t("toolbar.numberDialog.outOfRange"));
      return;
    }
    if (!onSubmit(preview)) {
      setError(t("toolbar.numberDialog.rejected"));
      return;
    }
    onClose();
  }, [canEdit, onClose, onSubmit, parsed, preview, t]);

  return (
    <OfficeDialogShell
      open={open}
      title={t("toolbar.numberDialog.title")}
      description={t("toolbar.numberDialog.description")}
      defaultActionLabel={t("toolbar.numberDialog.ok")}
      cancelActionLabel={t("toolbar.numberDialog.cancel")}
      defaultActionDisabled={!canEdit || number.trim() === ""}
      onDefaultAction={submit}
      onCancel={onClose}
      initialFocusRef={numberRef}
      returnFocusRef={returnFocusRef}
      testIdPrefix="document-number"
      defaultActionTestId="document-number-apply"
    >
      <label className={parts.field}>
        <span className={parts.label}>{t("toolbar.numberDialog.number")}</span>
        <input
          ref={numberRef}
          disabled={!canEdit}
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={number}
          className={documentValueInputClassName("min-w-0")}
          data-testid="document-number-value"
          aria-invalid={error ? "true" : undefined}
          onChange={(event) => {
            setNumber(event.target.value);
            setError(null);
          }}
        />
      </label>
      <div className={parts.field}>
        <span className={parts.label} id="document-number-type-label">
          {t("toolbar.numberDialog.type")}
        </span>
        <div
          className={`${parts.list} max-h-56 overflow-auto`}
          role="listbox"
          onKeyDown={moveListboxSelection}
          aria-labelledby="document-number-type-label"
          data-testid="document-number-types"
        >
          {formats.map((value) => (
            <button
              key={value}
              type="button"
              role="option"
              disabled={!canEdit}
              aria-selected={value === format}
              data-selected={value === format ? "true" : undefined}
              className={`${parts.listItem} flex w-full items-center text-left`}
              data-testid={`document-number-type-${value}`}
              onClick={() => {
                setFormat(value);
                setError(null);
              }}
            >
              {sampleOf(value)}
            </button>
          ))}
        </div>
      </div>
      <p className={parts.hint} data-testid="document-number-preview" aria-live="polite">
        {preview ?? " "}
      </p>
      {error ? (
        <p role="alert" className={parts.error} data-testid="document-number-error">
          {error}
        </p>
      ) : null}
    </OfficeDialogShell>
  );
}
