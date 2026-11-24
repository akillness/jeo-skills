"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useMemo, useRef, useState, type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import {
  DOCUMENT_SIGNATURE_LINE_MAX_EMAIL_CHARS,
  DOCUMENT_SIGNATURE_LINE_MAX_INSTRUCTIONS_CHARS,
  DOCUMENT_SIGNATURE_LINE_MAX_NAME_CHARS,
  DOCUMENT_SIGNATURE_LINE_MAX_TITLE_CHARS,
  type DocumentSignatureLineDraft,
} from "./documentSignatureLineExtension";

export interface DocumentSignatureLineDialogProps {
  readonly canEdit?: boolean;
  readonly open: boolean;
  readonly locale: string;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onSubmit: (draft: DocumentSignatureLineDraft) => boolean;
  readonly onClose: () => void;
}

export function DocumentSignatureLineDialog({
  canEdit = true,
  open,
  returnFocusRef,
  onSubmit,
  onClose,
}: DocumentSignatureLineDialogProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const copy = useMemo(
    () => ({
      title: t("toolbar.signatureLineDialog.title"),
      description: t("toolbar.signatureLineDialog.description"),
      signer: t("toolbar.signatureLineDialog.signer"),
      signerTitle: t("toolbar.signatureLineDialog.signerTitle"),
      signerEmail: t("toolbar.signatureLineDialog.signerEmail"),
      instructions: t("toolbar.signatureLineDialog.instructions"),
      allowComments: t("toolbar.signatureLineDialog.allowComments"),
      showSignDate: t("toolbar.signatureLineDialog.showSignDate"),
      insert: t("toolbar.signatureLineDialog.insert"),
      cancel: t("toolbar.signatureLineDialog.cancel"),
      rejected: t("toolbar.signatureLineDialog.rejected"),
    }),
    [t],
  );
  const [suggestedSigner, setSuggestedSigner] = useState("");
  const [suggestedSignerTitle, setSuggestedSignerTitle] = useState("");
  const [suggestedSignerEmail, setSuggestedSignerEmail] = useState("");
  const [signingInstructions, setSigningInstructions] = useState("");
  const [allowComments, setAllowComments] = useState(false);
  const [showSignDate, setShowSignDate] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const signerRef = useRef<HTMLInputElement | null>(null);

  const submit = () => {
    if (!canEdit) return;
    const inserted = onSubmit({
      suggestedSigner,
      suggestedSignerTitle,
      suggestedSignerEmail,
      signingInstructions,
      allowComments,
      showSignDate,
    });
    if (!inserted) {
      setError(copy.rejected);
      return;
    }
    onClose();
  };


  return (
    <OfficeDialogShell
      open={open}
      title={copy.title}
      description={copy.description}
      defaultActionLabel={copy.insert}
      cancelActionLabel={copy.cancel}
      defaultActionDisabled={!canEdit}
      onDefaultAction={submit}
      onCancel={onClose}
      initialFocusRef={signerRef}
      returnFocusRef={returnFocusRef}
      testIdPrefix="document-signature-line"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={parts.field}>
          <span className={parts.label}>{copy.signer}</span>
          <input
            disabled={!canEdit}
            ref={signerRef}
            type="text"
            value={suggestedSigner}
            maxLength={DOCUMENT_SIGNATURE_LINE_MAX_NAME_CHARS}
            data-testid="document-signature-line-signer"
            onChange={(event) => {
              setSuggestedSigner(event.target.value);
              setError(null);
            }}
          />
        </label>
        <label className={parts.field}>
          <span className={parts.label}>{copy.signerTitle}</span>
          <input
            disabled={!canEdit}
            type="text"
            value={suggestedSignerTitle}
            maxLength={DOCUMENT_SIGNATURE_LINE_MAX_TITLE_CHARS}
            data-testid="document-signature-line-title"
            onChange={(event) => {
              setSuggestedSignerTitle(event.target.value);
              setError(null);
            }}
          />
        </label>
      </div>
      <label className={parts.field}>
        <span className={parts.label}>{copy.signerEmail}</span>
        <input
          disabled={!canEdit}
          type="email"
          value={suggestedSignerEmail}
          maxLength={DOCUMENT_SIGNATURE_LINE_MAX_EMAIL_CHARS}
          data-testid="document-signature-line-email"
          onChange={(event) => {
            setSuggestedSignerEmail(event.target.value);
            setError(null);
          }}
        />
      </label>
      <label className={parts.field}>
        <span className={parts.label}>{copy.instructions}</span>
        <textarea
          disabled={!canEdit}
          className="min-h-20 resize-y"
          value={signingInstructions}
          maxLength={DOCUMENT_SIGNATURE_LINE_MAX_INSTRUCTIONS_CHARS}
          data-testid="document-signature-line-instructions"
          onChange={(event) => {
            setSigningInstructions(event.target.value);
            setError(null);
          }}
        />
      </label>
      <div className={parts.group}>
        <label className={parts.check}>
          <input
            disabled={!canEdit}
            type="checkbox"
            checked={allowComments}
            data-testid="document-signature-line-allow-comments"
            onChange={(event) => setAllowComments(event.target.checked)}
          />
          <span>{copy.allowComments}</span>
        </label>
        <label className={parts.check}>
          <input
            disabled={!canEdit}
            type="checkbox"
            checked={showSignDate}
            data-testid="document-signature-line-show-date"
            onChange={(event) => setShowSignDate(event.target.checked)}
          />
          <span>{copy.showSignDate}</span>
        </label>
      </div>
      {error ? (
        <p role="alert" className={parts.error}>
          {error}
        </p>
      ) : null}
    </OfficeDialogShell>
  );
}
