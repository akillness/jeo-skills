"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useRef, useState, type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";

import { documentValueInputClassName } from "@mrnote/core/web/components/console/editor/documentValueInput.ts";

/**
 * Home > Paragraph > Asian Layout > Fit Text (中文版式 > 调整宽度).
 *
 * Word shows the selection's current width and asks for the new one, both in
 * characters, with Remove for text that already has a width (ECMA-376
 * 17.3.2.14 w:fitText: the run takes exactly that width, its characters
 * resized equally). The caller converts characters at the text's own size.
 */
export interface DocumentFitTextDialogProps {
  readonly open: boolean;
  /** The selection's width as drawn now, in characters. */
  readonly currentChars: number;
  /** Points per character at the selection's text size. */
  readonly charPt: number;
  /** Word's length unit for the locale, which the current width is shown in. */
  readonly lengthUnit: "cm" | "in";
  /** The width the selection already fits, in characters, or null. */
  readonly fittedChars: number | null;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly onApply: (chars: number) => boolean;
  readonly onRemove: () => boolean;
  readonly onClose: () => void;
}

function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function DocumentFitTextDialog({
  open,
  currentChars,
  charPt,
  lengthUnit,
  fittedChars,
  returnFocusRef,
  onApply,
  onRemove,
  onClose,
}: DocumentFitTextDialogProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState(() =>
    String(round(fittedChars ?? Math.max(1, Math.round(currentChars)), 1)),
  );
  const value = Number(draft.trim().replace(",", "."));
  const valid = Number.isFinite(value) && value > 0 && value <= 999;

  return (
    <OfficeDialogShell
      open={open}
      title={t("toolbar.fitText.title")}
      description=""
      defaultActionLabel={t("toolbar.dialogOk")}
      cancelActionLabel={t("toolbar.pageSetupCancel")}
      defaultActionDisabled={!valid}
      onDefaultAction={() => {
        if (valid && onApply(value)) onClose();
      }}
      onCancel={onClose}
      initialFocusRef={inputRef}
      returnFocusRef={returnFocusRef}
      testIdPrefix="document-fit-text"
      className="sm:max-w-[360px]"
      footerStart={
        <button
          type="button"
          className="office-dialog__button"
          data-testid="document-fit-text-remove"
          disabled={fittedChars === null}
          onClick={() => {
            if (onRemove()) onClose();
          }}
        >
          {t("toolbar.fitText.remove")}
        </button>
      }
    >
      <div className="office-dialog__body">
        <p className="office-dialog__message" data-testid="document-fit-text-current">
          {t("toolbar.fitText.current", {
            chars: String(round(currentChars, 1)),
            // In Word's unit: "(1.59 厘米)" in Chinese Word, `(0.63")` in US English.
            length:
              lengthUnit === "cm"
                ? `${round(((currentChars * charPt) / 72) * 2.54)} ${t("toolbar.indentUnitCm")}`
                : `${round((currentChars * charPt) / 72)}"`,
          })}
        </p>
        <label className="office-dialog__field">
          <span className="office-dialog__label">{t("toolbar.fitText.newWidth")}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input
              ref={inputRef}
              type="text"
              inputMode="decimal"
              className={documentValueInputClassName("note-editor-office-toolbar__input")}
              data-testid="document-fit-text-width"
              aria-label={t("toolbar.fitText.newWidth")}
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
            />
            <span>{t("toolbar.indentUnitChar")}</span>
          </span>
        </label>
      </div>
    </OfficeDialogShell>
  );
}
