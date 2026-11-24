"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// The document's attachments (files pinned to a page and the document's
// own), opened from the ribbon's Comment tab: the list the comments pane

// the PDF comments pane aligned with Docs', its extra sections moved to
// the ribbon).

import { Download, Paperclip, X } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@mrnote/core/web/components/ui/dialog.tsx";
import { officeDialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { PDF_POPOVER_CHROME } from "../viewer/popoverChrome";
import type { PdfAnnotationListModel } from "../viewer/PDFViewerProps";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";

/** A file's size the way an attachments list shows it. */
function formatAttachmentSize(size: number): string {
  if (!Number.isFinite(size) || size < 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function PdfAnnotationAttachmentsDialog({
  open,
  onOpenChange,
  list,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  list: PdfAnnotationListModel | null;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
}) {
  const attachments = list?.fileAttachments ?? [];
  if (!open) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        skin="none"
        className={PDF_POPOVER_CHROME}
        showCloseButton={false}
        data-testid="pdf-attachments-section"
      >
        <div className={officeDialogParts.header}>
          <DialogTitle className={officeDialogParts.title}>
            {t("pdfViewer.pinnedAttachments", { count: attachments.length })}
          </DialogTitle>
          <DialogClose className={officeDialogParts.close} aria-label={t("common.close")}>
            <X size={14} aria-hidden="true" />
          </DialogClose>
        </div>
        <DialogDescription className="sr-only">
          {t("pdfViewer.pinnedAttachments", { count: attachments.length })}
        </DialogDescription>
        <ul className="pdf-page-window__annotation-attachments">
          {attachments.map((attachment, index) => (
            <li key={`${attachment.page ?? "document"}:${attachment.name}:${index}`}>
              <button
                type="button"
                className="pdf-page-window__annotation-attachment-main"
                onClick={() => {
                  if (attachment.page === null) return;
                  list?.onNavigateToPage?.(attachment.page);
                  onOpenChange(false);
                }}
                title={attachment.description || attachment.name}
                data-testid={attachment.page === null ? "pdf-document-attachment" : "pdf-attachment-goto"}
              >
                <Paperclip size={14} aria-hidden />
                <span className="pdf-page-window__annotation-attachment-name">{attachment.name}</span>
                <span className="pdf-page-window__annotation-attachment-page">
                  {attachment.page === null
                    ? t("pdfViewer.documentAttachmentLabel", { size: formatAttachmentSize(attachment.size) })
                    : t("pdfViewer.pinnedAttachmentPage", { page: attachment.page })}
                </span>
                {attachment.downloadDisabledReason ? (
                  <span className="pdf-page-window__annotation-attachment-blocked" data-testid="pdf-attachment-blocked-reason">
                    {attachment.downloadDisabledReason}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                className={officeDialogParts.iconButton}
                onClick={() => list?.onSaveFileAttachment?.(index)}
                disabled={Boolean(attachment.downloadDisabledReason)}
                aria-label={attachment.downloadDisabledReason ?? t("pdfViewer.pinnedAttachmentSave")}
                title={attachment.downloadDisabledReason ?? t("pdfViewer.pinnedAttachmentSave")}
                data-testid="pdf-attachment-save"
              >
                <Download size={14} aria-hidden />
              </button>
              {attachment.placedId && list?.onDeleteFileAttachment ? (
                <button
                  type="button"
                  className={officeDialogParts.iconButton}
                  onClick={() => void list.onDeleteFileAttachment?.(attachment.placedId!)}
                  disabled={Boolean(list.disabled)}
                  aria-label={t("pdfViewer.pinnedAttachmentDelete")}
                  title={t("pdfViewer.pinnedAttachmentDelete")}
                  data-testid="pdf-attachment-delete"
                >
                  <X size={14} aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
