"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useState, type FormEvent } from "react";
import { Lock } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import {
  officeDialogClassName,
  officeDialogParts as parts,
} from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

const PASSWORD_TARGET_CLASS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

export interface PdfPasswordPromptProps {
  /** Set after a rejected attempt so the prompt shows the inline error. */
  incorrect?: boolean;
  /** Disables the form while a retry is in flight. */
  busy?: boolean;
  onSubmit: (password: string) => void;
}

/**
 * Inline unlock panel for password-protected PDFs. Shown by PDFViewer /
 * PdfTextEditor when pdf.js rejects the document load with a
 * `PasswordException`; submitting retries the load with the typed password.
 *
 * It wears the shared Office dialog chrome (the card, field, error line and
 * default button every editor's dialogs use), so it follows the PDF tone and
 * dark mode instead of its own hex colours.
 */
export default function PdfPasswordPrompt({
  incorrect = false,
  busy = false,
  onSubmit,
}: PdfPasswordPromptProps) {
  const t = useTranslations("console-notebooks");
  const [password, setPassword] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !password) return;
    onSubmit(password);
  };

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="pdf-password-prompt"
      className={`${officeDialogClassName({ tone: "pdf", size: "sm" })} pdf-password-prompt`}
    >
      <header className={parts.header}>
        <Lock size={20} aria-hidden />
        <strong className={parts.title}>{t("pdfViewer.passwordTitle")}</strong>
      </header>
      <div className={parts.body}>
        <label className={parts.field}>
          <span className={parts.label}>{t("pdfViewer.passwordPlaceholder")}</span>
          <input
            type="password"
            className={PASSWORD_TARGET_CLASS}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t("pdfViewer.passwordPlaceholder")}
            aria-invalid={incorrect || undefined}
            disabled={busy}
            autoFocus
            data-testid="pdf-password-input"
          />
        </label>
        {incorrect ? (
          <p className={parts.error} role="alert" data-testid="pdf-password-error">
            {t("pdfViewer.passwordIncorrect")}
          </p>
        ) : null}
      </div>
      <footer className={parts.footer}>
        <button
          type="submit"
          className={`${parts.primaryButton} ${PASSWORD_TARGET_CLASS}`}
          disabled={busy || password.length === 0}
          data-testid="pdf-password-submit"
        >
          {busy ? t("pdfViewer.passwordUnlocking") : t("pdfViewer.passwordSubmit")}
        </button>
      </footer>
    </form>
  );
}
