"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Dispatch, SetStateAction } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogClose,
  DialogDescription,
} from "@mrnote/core/web/components/ui/dialog.tsx";
import { PDF_POPOVER_CHROME } from "./popoverChrome";
import {
  officeDialogParts,
} from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { X } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import type { PdfProofingDraft } from "./proofing";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";

export interface PdfProofingTextDialogProps {
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  proofingDraft: PdfProofingDraft | null;
  setProofingDraft: Dispatch<SetStateAction<PdfProofingDraft | null>>;
  proofingBusy: boolean;
  setProofingError: Dispatch<SetStateAction<string | null>>;
  proofingError: string | null;
  handleProofingSave: () => Promise<void>;
}

export function PdfProofingTextDialog({
  t,
  proofingDraft,
  setProofingDraft,
  proofingBusy,
  setProofingError,
  proofingError,
  handleProofingSave,
}: PdfProofingTextDialogProps) {
  return (
    <Dialog
      open={proofingDraft !== null}
      onOpenChange={(open) => {
        if (!open && !proofingBusy) {
          setProofingDraft(null);
          setProofingError(null);
        }
      }}
    >
      <DialogContent
        skin="none"
        className={`${PDF_POPOVER_CHROME} max-w-lg`}
        data-testid="pdf-proofing-text-dialog"
      >
        <div className={officeDialogParts.header}>
          <DialogTitle className={officeDialogParts.title}>
            {proofingDraft?.geometry.kind === "replace"
              ? t("pdfComment.replaceMark")
              : t("pdfComment.insertCaret")}
          </DialogTitle>
          <DialogClose
            className={officeDialogParts.close}
            aria-label={t("common.close")}
          >
            <X size={14} aria-hidden="true" />
          </DialogClose>
        </div>
        <DialogDescription className="sr-only">
          {proofingDraft?.geometry.kind === "replace"
            ? t("pdfComment.replaceMark")
            : t("pdfComment.insertCaret")}
        </DialogDescription>
        {proofingDraft?.geometry.quote ? (
          <blockquote className={`${officeDialogParts.well} m-0`}>
            {proofingDraft.geometry.quote}
          </blockquote>
        ) : null}
        <label className={officeDialogParts.field}>
          {proofingDraft?.geometry.kind === "replace"
            ? t("pdf.viewer.proofingReplaceWith")
            : t("pdf.viewer.proofingInsertText")}
          <textarea
            autoFocus
            className="min-h-24"
            data-testid="pdf-proofing-text-input"
            maxLength={32_000}
            value={proofingDraft?.replacementText ?? ""}
            onChange={(event) =>
              setProofingDraft((current) =>
                current
                  ? { ...current, replacementText: event.target.value }
                  : null,
              )
            }
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                (event.metaKey || event.ctrlKey)
              ) {
                event.preventDefault();
                void handleProofingSave();
              }
            }}
          />
        </label>
        {proofingError ? (
          <p className={officeDialogParts.error} role="alert">
            {proofingError}
          </p>
        ) : null}
        <div className={officeDialogParts.footer}>
          <button
            type="button"
            className={officeDialogParts.button}
            disabled={proofingBusy}
            onClick={() => {
              setProofingDraft(null);
              setProofingError(null);
            }}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className={officeDialogParts.primaryButton}
            data-testid="pdf-proofing-text-save"
            disabled={
              proofingBusy || !proofingDraft?.replacementText.trim()
            }
            onClick={() => void handleProofingSave()}
          >
            {proofingBusy
              ? t("pdf.viewer.saving2")
              : t("common.save")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
