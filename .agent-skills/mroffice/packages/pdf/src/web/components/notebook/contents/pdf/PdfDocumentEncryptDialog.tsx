"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  Check,
  Eye,
  EyeOff,
  Minus,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import {
  ALL_PDF_PERMISSIONS,
  encryptionAssurance,
  reviewEncryptionPolicy,
  type PdfPermission,
} from "../../../../lib/pdf/encryption-policy";

export interface PdfDocumentEncryptRequest {
  readonly openPassword: string;
  readonly openPasswordConfirmation: string;
  readonly ownerPassword: string;
  readonly ownerPasswordConfirmation: string;
  readonly allow: readonly PdfPermission[];
}

interface PdfDocumentEncryptDialogProps {
  readonly open: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onCancel: () => void;
  readonly onEncrypt: (request: PdfDocumentEncryptRequest) => void;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
}

const PERMISSION_LABEL_KEYS: Readonly<Record<PdfPermission, string>> = {
  print: "pdf.encrypt.permissionPrint",
  "print-high-resolution": "pdf.encrypt.permissionPrintHighResolution",
  copy: "pdf.encrypt.permissionCopy",
  modify: "pdf.encrypt.permissionModify",
  annotate: "pdf.encrypt.permissionAnnotate",
  "fill-forms": "pdf.encrypt.permissionFillForms",
  "extract-for-accessibility": "pdf.encrypt.permissionAccessibility",
  assemble: "pdf.encrypt.permissionAssemble",
};

function PdfDocumentEncryptDialogSession({
  open,
  busy,
  error,
  onCancel,
  onEncrypt,
  returnFocusRef,
}: PdfDocumentEncryptDialogProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const [openPassword, setOpenPassword] = useState("");
  const [openPasswordConfirmation, setOpenPasswordConfirmation] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [ownerPasswordConfirmation, setOwnerPasswordConfirmation] =
    useState("");
  const [allow, setAllow] =
    useState<readonly PdfPermission[]>(ALL_PDF_PERMISSIONS);
  const [showPasswords, setShowPasswords] = useState(false);
  const clearSecrets = useCallback(() => {
    setOpenPassword("");
    setOpenPasswordConfirmation("");
    setOwnerPassword("");
    setOwnerPasswordConfirmation("");
    setShowPasswords(false);
  }, []);
  useEffect(() => {
    if (error) clearSecrets();
  }, [clearSecrets, error]);
  const selectablePermissions = useMemo(
    () =>
      ALL_PDF_PERMISSIONS.filter(
        (permission) => permission !== "extract-for-accessibility",
      ),
    [],
  );
  const allPermissionsSelected = selectablePermissions.every((permission) =>
    allow.includes(permission),
  );
  const somePermissionsSelected = selectablePermissions.some((permission) =>
    allow.includes(permission),
  );
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        somePermissionsSelected && !allPermissionsSelected;
    }
  }, [allPermissionsSelected, somePermissionsSelected]);

  const verdict = useMemo(
    () =>
      reviewEncryptionPolicy({
        openPassword,
        permissionsPassword: ownerPassword,
        allow,
      }),
    [allow, openPassword, ownerPassword],
  );
  const passwordsLongEnough =
    openPassword.length >= 6 && ownerPassword.length >= 6;
  const confirmationsMatch =
    openPassword === openPasswordConfirmation &&
    ownerPassword === ownerPasswordConfirmation;
  const valid = verdict.ok && passwordsLongEnough && confirmationsMatch;
  const problem = !passwordsLongEnough
    ? t("pdf.encrypt.passwordLength")
    : !confirmationsMatch
      ? t("pdf.encrypt.confirmationMismatch")
      : verdict.problems.includes("same-password")
        ? t("pdf.encrypt.passwordsMustDiffer")
        : verdict.problems.length > 0
          ? t("pdf.encrypt.reviewBeforeEncrypt")
          : null;

  const submit = () => {
    if (!valid || busy) return;
    const request = {
      openPassword,
      openPasswordConfirmation,
      ownerPassword,
      ownerPasswordConfirmation,
      allow: verdict.effectiveAllow,
    } satisfies PdfDocumentEncryptRequest;
    clearSecrets();
    onEncrypt(request);
  };
  const cancel = () => {
    clearSecrets();
    onCancel();
  };

  return (
    <OfficeDialogShell
      open={open}
      title={t("pdf.encrypt.title")}
      description={t("pdf.encrypt.description")}
      defaultActionLabel={t("pdf.encrypt.apply")}
      cancelActionLabel={t("pdf.encrypt.cancel")}
      onDefaultAction={submit}
      onCancel={cancel}
      defaultActionDisabled={!valid || busy}
      busy={busy}
      busyActionLabel={t("pdf.encrypt.encrypting")}
      initialFocus="cancel"
      returnFocusRef={returnFocusRef}
      testIdPrefix="pdf-document-encrypt"
      className="sm:max-w-[620px]"
    >
      <div className="grid gap-4">
        <div className={`${parts.group} grid gap-3 sm:grid-cols-2`}>
          <label className={parts.field}>
            {t("pdf.encrypt.openPassword")}
            <input
              type={showPasswords ? "text" : "password"}
              autoComplete="new-password"
              minLength={6}
              maxLength={127}
              value={openPassword}
              disabled={busy}
              onChange={(event) => setOpenPassword(event.currentTarget.value)}
              data-testid="pdf-document-encrypt-open-password"
            />
          </label>
          <label className={parts.field}>
            {t("pdf.encrypt.confirmOpenPassword")}
            <input
              type={showPasswords ? "text" : "password"}
              autoComplete="new-password"
              minLength={6}
              maxLength={127}
              value={openPasswordConfirmation}
              disabled={busy}
              onChange={(event) =>
                setOpenPasswordConfirmation(event.currentTarget.value)
              }
              data-testid="pdf-document-encrypt-open-confirmation"
            />
          </label>
          <label className={parts.field}>
            {t("pdf.encrypt.permissionsPassword")}
            <input
              type={showPasswords ? "text" : "password"}
              autoComplete="new-password"
              minLength={6}
              maxLength={127}
              value={ownerPassword}
              disabled={busy}
              onChange={(event) => setOwnerPassword(event.currentTarget.value)}
              data-testid="pdf-document-encrypt-owner-password"
            />
          </label>
          <label className={parts.field}>
            {t("pdf.encrypt.confirmPermissionsPassword")}
            <input
              type={showPasswords ? "text" : "password"}
              autoComplete="new-password"
              minLength={6}
              maxLength={127}
              value={ownerPasswordConfirmation}
              disabled={busy}
              onChange={(event) =>
                setOwnerPasswordConfirmation(event.currentTarget.value)
              }
              data-testid="pdf-document-encrypt-owner-confirmation"
            />
          </label>
          <button
            type="button"
            className={`${parts.compactButton} flex items-center justify-center gap-2 sm:col-span-2`}
            aria-pressed={showPasswords}
            disabled={busy}
            onClick={() => setShowPasswords((current) => !current)}
            data-testid="pdf-document-encrypt-password-visibility"
          >
            {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}
            {showPasswords
              ? t("pdf.encrypt.hidePasswords")
              : t("pdf.encrypt.showPasswords")}
          </button>
        </div>

        <fieldset
          className={`${parts.group} grid grid-cols-1 gap-1 sm:grid-cols-2`}
          disabled={busy}
        >
          <legend className={parts.sectionTitle}>
            {t("pdf.encrypt.permissionsHeading")}
          </legend>
          <label className={`${parts.check} sm:col-span-2 min-h-11`}>
            <span className="relative size-11 shrink-0">
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={allPermissionsSelected}
                aria-checked={
                  allPermissionsSelected
                    ? "true"
                    : somePermissionsSelected
                      ? "mixed"
                      : "false"
                }
                disabled={busy}
                onChange={(event) => {
                  setAllow(
                    event.currentTarget.checked
                      ? ALL_PDF_PERMISSIONS
                      : ["extract-for-accessibility"],
                  );
                }}
                className={`${parts.markInput} absolute inset-0 size-11 cursor-pointer`}
                data-testid="pdf-document-encrypt-permission-select-all"
              />
              <span
                aria-hidden
                className={`${parts.mark} pointer-events-none absolute left-3.5 top-3.5 inline-flex size-4 items-center justify-center`}
              >
                {allPermissionsSelected ? (
                  <Check size={12} strokeWidth={2.4} />
                ) : somePermissionsSelected ? (
                  <Minus size={12} strokeWidth={2.4} />
                ) : null}
              </span>
            </span>
            <span>{t("pdf.encrypt.selectAll")}</span>
          </label>
          {ALL_PDF_PERMISSIONS.map((permission) => {
            const checked = allow.includes(permission);
            return (
              <label
                key={permission}
                className={`${parts.check} min-h-11`}
              >
                <span className="relative size-11 shrink-0">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={
                      busy || permission === "extract-for-accessibility"
                    }
                    onChange={(event) => {
                      const nextChecked = event.currentTarget.checked;
                      setAllow((current) => {
                        if (permission === "print" && !nextChecked) {
                          return current.filter(
                            (entry) =>
                              entry !== "print" &&
                              entry !== "print-high-resolution",
                          );
                        }
                        if (
                          permission === "print-high-resolution" &&
                          nextChecked
                        ) {
                          return Array.from(
                            new Set([...current, "print", permission]),
                          );
                        }
                        return nextChecked
                          ? Array.from(new Set([...current, permission]))
                          : current.filter((entry) => entry !== permission);
                      });
                    }}
                    className={`${parts.markInput} absolute inset-0 size-11 cursor-pointer`}
                    data-testid="pdf-document-encrypt-permission"
                  />
                  <span
                    aria-hidden
                    className={`${parts.mark} pointer-events-none absolute left-3.5 top-3.5 inline-flex size-4 items-center justify-center`}
                  >
                    {checked ? <Check size={12} strokeWidth={2.4} /> : null}
                  </span>
                </span>
                <span>{t(PERMISSION_LABEL_KEYS[permission])}</span>
              </label>
            );
          })}
        </fieldset>

        <p
          className={parts.message}
          role="status"
        >
          {encryptionAssurance(verdict, t)}
        </p>
        {problem ? (
          <p
            className={parts.error}
            role="alert"
            data-testid="pdf-document-encrypt-validation"
          >
            {problem}
          </p>
        ) : null}
        {error ? (
          <p
            className={parts.message}
            role="alert"
            data-testid="pdf-document-encrypt-error"
          >
            {error}
          </p>
        ) : null}
      </div>
    </OfficeDialogShell>
  );
}

export default function PdfDocumentEncryptDialog(
  props: PdfDocumentEncryptDialogProps,
): React.JSX.Element {
  return (
    <PdfDocumentEncryptDialogSession
      key={props.open ? "open" : "closed"}
      {...props}
    />
  );
}
