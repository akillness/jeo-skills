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
  verifyProtectionPassword,
  type ProtectionPasswordVerification,
  type SheetProtectionPassword,
} from "@mrnote/core/web/lib/spreadsheet/protection.ts";

/** The words for a failed password check (Excel's wrong-password message). */
export function protectionPasswordErrorKey(
  status: Exclude<ProtectionPasswordVerification, "verified">,
): string {
  switch (status) {
    case "unsupported-algorithm":
      return "spreadsheet.protectionPassword.unsupportedAlgorithm";
    case "unsupported-encoding":
      return "spreadsheet.audit.protection.encodingUnsupported";
    case "unsupported-length":
      return "spreadsheet.audit.protection.lengthUnsupported";
    default:
      return "spreadsheet.protectionPassword.incorrect";
  }
}

/**
 * Excel's Confirm Password step, shared by Protect Sheet and Protect
 * Workbook: one masked box, the lost-password caution, the mismatch error.
 */
export function ProtectionPasswordConfirmFields({
  inputRef,
  value,
  error,
  onChange,
  testIdPrefix,
}: {
  readonly inputRef?: RefObject<HTMLInputElement | null>;
  readonly value: string;
  readonly error: string | null;
  readonly onChange: (value: string) => void;
  readonly testIdPrefix: string;
}) {
  const t = useTranslations("console-notebooks");
  return (
    <>
      <label className={officeDialogParts.field}>
        <span className={officeDialogParts.label}>
          {t("spreadsheet.protectionPassword.passwordLabel")}
        </span>
        <input
          ref={inputRef}
          type="password"
          autoComplete="new-password"
          maxLength={255}
          autoFocus
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${testIdPrefix}-password-error` : undefined}
          data-testid={`${testIdPrefix}-confirm-password`}
        />
      </label>
      <p className={officeDialogParts.hint}>
        {t("spreadsheet.protectionPassword.caution")}
      </p>
      {error ? (
        <p
          id={`${testIdPrefix}-password-error`}
          role="alert"
          className={officeDialogParts.error}
          data-testid={`${testIdPrefix}-password-error`}
        >
          {error}
        </p>
      ) : null}
    </>
  );
}

interface SpreadsheetProtectionPasswordDialogProps {
  readonly title: string;
  readonly verifier: SheetProtectionPassword;
  /** Runs once the typed password matched; the dialog closes itself then. */
  readonly onVerified: () => void;
  readonly onCancel: () => void;
  readonly testIdPrefix: string;
}

/**
 * Excel's Unprotect Sheet password prompt (also Pause Protection on a
 * password-protected sheet). A wrong password keeps protection and says so;
 * the typed text never leaves this component.
 */
export function SpreadsheetProtectionPasswordDialog({
  title,
  verifier,
  onVerified,
  onCancel,
  testIdPrefix,
}: SpreadsheetProtectionPasswordDialogProps) {
  const t = useTranslations("console-notebooks");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    if (busy) return;
    setBusy(true);
    void verifyProtectionPassword(password, verifier)
      .then((status) => {
        if (status === "verified") {
          setPassword("");
          onVerified();
          return;
        }
        setError(t(protectionPasswordErrorKey(status)));
        inputRef.current?.select();
      })
      .finally(() => setBusy(false));
  };

  return (
    <OfficeDialogShell
      open
      title={title}
      description={t("spreadsheet.protectionPassword.enterToUnprotect")}
      defaultActionLabel={t("spreadsheet.protectSheetDialog.ok")}
      cancelActionLabel={t("common.cancel")}
      busy={busy}
      busyActionLabel={t("spreadsheet.protectionPassword.checking")}
      onDefaultAction={submit}
      onCancel={onCancel}
      initialFocusRef={inputRef}
      className="sm:max-w-[380px]"
      testIdPrefix={testIdPrefix}
    >
      <label className={officeDialogParts.field}>
        <span className={officeDialogParts.label}>
          {t("spreadsheet.protectionPassword.passwordLabel")}
        </span>
        <input
          ref={inputRef}
          type="password"
          autoComplete="current-password"
          maxLength={255}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setError(null);
          }}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${testIdPrefix}-error` : undefined}
          data-testid={`${testIdPrefix}-password`}
        />
      </label>
      {error ? (
        <p
          id={`${testIdPrefix}-error`}
          role="alert"
          className={officeDialogParts.error}
          data-testid={`${testIdPrefix}-error`}
        >
          {error}
        </p>
      ) : null}
    </OfficeDialogShell>
  );
}
