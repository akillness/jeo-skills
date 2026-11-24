"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import WindowNotice from "@mrnote/core/web/components/notebook/WindowNotice.tsx";
import { useState } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

export type PdfViewerFeedbackTone = "error" | "status";

export interface PdfViewerFeedbackMessage {
  readonly message: string;
  readonly tone: PdfViewerFeedbackTone;
}

export interface PdfViewerFeedbackCopy {
  readonly actionFallback: string;
  readonly detectFallback: string;
  readonly fileOpFallback: string;
  readonly flattenFallback: string;
  readonly noteFallback: string;
  readonly signatureFallback: string;
  readonly snapshotFallback: string;
  readonly sourceRequired: string;
  readonly stale: string;
  /** Save-policy refusals the reader can act on, by reason key. Any other
   * internal key still reads as the generic fallback. */
  readonly policyReasons?: Readonly<Record<string, string>>;
}

/** The save-policy refusals worth telling the reader in their own words. */
export const PDF_VIEWER_EXPLAINED_POLICY_REASONS = [
  "pagePackageStructureUnsupported",
  "riskySourceReadOnly",
  "riskyAdditionalSourceReadOnly",
  "riskyReplacementReadOnly",
  "readOnly",
  "documentLoading",
  "editsRequireRewrite",
] as const;

export function isInternalPdfViewerFeedback(message: string): boolean {
  return (
    message === "pdf.savePolicy.sourceIdentityRequired" ||
    message === "pdf.savePolicy.staleAuthority" ||
    /^pdf\.[a-z0-9_.-]+$/iu.test(message) ||
    /^[a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+){2,}$/iu.test(message) ||
    /(?:\/api\/|\bprovider\b|\bschema\b|\bsha256\b|\bobject\s+(?:id|ref)\b|\bstack\s*trace\b|\breasonkey\b|\bdataitemid\b|\bbytegenerationkey\b|\bdocumentrevision\b|\bpage-package\b|\bsave\s+policy\b|\bpolicy\s+decision\b|\boutput\s+plan\b)/iu.test(
      message,
    )
  );
}

export function resolvePdfViewerFeedbackText(
  message: string | null | undefined,
  copy: Readonly<{
    fallback: string;
    sourceRequired: string;
    stale: string;
    policyReasons?: Readonly<Record<string, string>>;
  }>,
): string {
  const normalized = message?.trim() ?? "";
  if (!normalized) return copy.fallback;
  if (normalized === "pdf.savePolicy.sourceIdentityRequired") {
    return copy.sourceRequired;
  }
  if (normalized === "pdf.savePolicy.staleAuthority") return copy.stale;
  const explained = Object.hasOwn(copy.policyReasons ?? {}, normalized)
    ? copy.policyReasons?.[normalized]
    : undefined;
  if (explained) return explained;
  if (isInternalPdfViewerFeedback(normalized)) {
    return copy.fallback;
  }
  return normalized;
}

export interface PdfViewerGlobalFeedbackHostProps {
  readonly copy: PdfViewerFeedbackCopy;
  readonly actionNotice: PdfViewerFeedbackMessage | null;
  readonly detectNotice: PdfViewerFeedbackMessage | null;
  readonly noteActionError: string | null;
  /** A failed note save stays until closed: closing it takes it, and with the
   *  last line the window's triangle, away. */
  readonly onDismissNoteActionError?: () => void;
  readonly noteActionErrorDismissLabel?: string;
  readonly flattenError: string | null;
  /** The raise behind `flattenError`: a new object each time it is raised. */
  readonly flattenErrorRaise?: object | null;
  readonly signatureWarning: string | null;
  readonly onDismissSignatureWarning: () => void;
  readonly signatureWarningDismissLabel: string;
  readonly fileOpError: string | null;
  readonly fileOpSaveOffer: Readonly<{
    busy: boolean;
    label: string;
    onSave: () => void;
    title: string;
  }> | null;
  readonly fileOpSavedMessage: string | null;
  readonly snapshotToast: PdfViewerFeedbackMessage | null;
}

export function PdfViewerGlobalFeedbackHost({
  copy,
  actionNotice,
  detectNotice,
  noteActionError,
  onDismissNoteActionError,
  noteActionErrorDismissLabel,
  flattenError,
  flattenErrorRaise,
  signatureWarning,
  onDismissSignatureWarning,
  signatureWarningDismissLabel,
  fileOpError,
  fileOpSaveOffer,
  fileOpSavedMessage,
  snapshotToast,
}: PdfViewerGlobalFeedbackHostProps) {
  const noticeText = useTranslations("console-notebooks");
  // A report the reader closed stays closed only until something new is
  // raised: then it opens again, or a later failure would sit unseen behind
  // the titlebar's notice button.
  const raised = [
    actionNotice,
    detectNotice,
    noteActionError,
    flattenErrorRaise ?? flattenError,
    signatureWarning,
    fileOpError,
    fileOpSavedMessage,
    snapshotToast,
  ];
  const [raise, setRaise] = useState({ seen: raised, count: 0 });
  if (raised.some((value, index) => value !== raise.seen[index])) {
    setRaise({
      seen: raised,
      count: raised.some(
        (value, index) => value != null && value !== raise.seen[index],
      )
        ? raise.count + 1
        : raise.count,
    });
  }
  const sanitize = (
    state: PdfViewerFeedbackMessage | null,
    fallback: string,
  ): PdfViewerFeedbackMessage | null =>
    state
      ? {
          ...state,
          tone: isInternalPdfViewerFeedback(state.message.trim())
            ? "error"
            : state.tone,
          message: resolvePdfViewerFeedbackText(state.message, {
            fallback,
            sourceRequired: copy.sourceRequired,
            stale: copy.stale,
            policyReasons: copy.policyReasons,
          }),
        }
      : null;
  const feedback = (
    testId: string,
    state: PdfViewerFeedbackMessage,
  ) => (
    <span
      className={
        state.tone === "error"
          ? "pdf-viewer__flatten-error"
          : "pdf-viewer__snapshot-toast office-pop-in"
      }
      role={state.tone === "error" ? "alert" : "status"}
      aria-live={state.tone === "error" ? "assertive" : "polite"}
      aria-atomic="true"
      data-testid={testId}
    >
      {state.message}
    </span>
  );
  const resolvedActionNotice = sanitize(actionNotice, copy.actionFallback);
  const resolvedDetectNotice = sanitize(detectNotice, copy.detectFallback);
  const resolvedNoteActionError = sanitize(
    noteActionError ? { message: noteActionError, tone: "error" } : null,
    copy.noteFallback,
  );
  const resolvedFlattenError = sanitize(
    flattenError ? { message: flattenError, tone: "error" } : null,
    copy.flattenFallback,
  );
  const resolvedSignatureWarning = sanitize(
    signatureWarning
      ? { message: signatureWarning, tone: "error" }
      : null,
    copy.signatureFallback,
  );
  const resolvedFileOpError = sanitize(
    fileOpError ? { message: fileOpError, tone: "error" } : null,
    copy.fileOpFallback,
  );
  const resolvedFileOpSavedMessage = sanitize(
    fileOpSavedMessage
      ? { message: fileOpSavedMessage, tone: "status" }
      : null,
    copy.fileOpFallback,
  );
  const resolvedSnapshotToast = sanitize(
    snapshotToast,
    copy.snapshotFallback,
  );
  if (
    !resolvedActionNotice &&
    !resolvedDetectNotice &&
    !resolvedNoteActionError &&
    !resolvedFlattenError &&
    !resolvedSignatureWarning &&
    !resolvedFileOpError &&
    !fileOpSaveOffer &&
    !resolvedFileOpSavedMessage &&
    !resolvedSnapshotToast
  ) {
    return null;
  }
  return (
    <WindowNotice
      title={noticeText("windowNotices.title")}
      scopeKey={`raise-${raise.count}`}
    >
      <div
        className="pdf-viewer__feedback-host flex min-h-0 flex-wrap items-center gap-2 px-3 py-1"
        data-testid="pdf-global-feedback-host"
      >
        {resolvedActionNotice
          ? feedback("pdf-action-notice", resolvedActionNotice)
          : null}
        {resolvedDetectNotice
          ? feedback("pdf-detect-notice", resolvedDetectNotice)
          : null}
        {resolvedNoteActionError ? (
          <>
            {feedback("pdf-note-action-error", resolvedNoteActionError)}
            {onDismissNoteActionError ? (
              <button
                type="button"
                data-testid="pdf-note-action-error-dismiss"
                onClick={onDismissNoteActionError}
              >
                {noteActionErrorDismissLabel}
              </button>
            ) : null}
          </>
        ) : null}
        {resolvedFlattenError
          ? feedback("pdf-flatten-error", resolvedFlattenError)
          : null}
        {resolvedSignatureWarning ? (
          <span
            className="pdf-viewer__flatten-error"
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
            data-testid="pdf-signature-warning"
          >
            {resolvedSignatureWarning.message}
            <button
              type="button"
              data-testid="pdf-signature-warning-cancel"
              onClick={onDismissSignatureWarning}
            >
              {signatureWarningDismissLabel}
            </button>
          </span>
        ) : null}
        {resolvedFileOpError
          ? feedback("pdf-file-op-error", resolvedFileOpError)
          : null}
        {fileOpSaveOffer ? (
          <button
            type="button"
            className="pdf-viewer__file-op-save"
            onClick={fileOpSaveOffer.onSave}
            disabled={fileOpSaveOffer.busy}
            data-testid="pdf-file-op-save-to-notebook"
            title={fileOpSaveOffer.title}
          >
            {fileOpSaveOffer.label}
          </button>
        ) : null}
        {resolvedFileOpSavedMessage
          ? feedback("pdf-file-op-saved", resolvedFileOpSavedMessage)
          : null}
        {resolvedSnapshotToast
          ? feedback("pdf-snapshot-toast", resolvedSnapshotToast)
          : null}
      </div>
    </WindowNotice>
  );
}

export function PdfProjectionReadyBadge() {
  // Successful import is the normal document state; it needs no report badge.
  return null;
}
