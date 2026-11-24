"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import PdfAnnotationsPanel from "../PdfAnnotationsPanel";
import { PdfDockedPane, type PdfTaskPaneDocks } from "../pdfTaskPaneDock";
import type {
  AnnotationListItem,
  AnnotationListBatchDeleteTarget,
} from "../../../../../lib/pdf/annotation-list";
import type {
  ReadDocumentAttachment,
  ReadFileAttachment,
  FileAttachmentReadBlockedReason,
} from "../../../../../lib/pdf/file-attachments";
import type { PdfNavigationPanel } from "../PdfNavigationRail";
import type {
  CommentMentionsController,
} from "@mrnote/core/web/components/office-comments/CommentMentions.tsx";

export interface PdfViewerAnnotationsPaneProps {
  dataItemId: string | undefined;
  /** The document's annotations are still being read (PdfAnnotationsPanel). */
  annotationListReading?: boolean;
  onNativeFileAttachmentDelete: ((id: string) => Promise<void>) | undefined;
  nativeFileAttachmentBusy: boolean;
  nativeFileAttachmentDisabledReason: string | undefined;
  loading: boolean;
  commentMentions: CommentMentionsController | null;
  placedAttachments: { id: string; page: number; x: number; y: number; name: string; mimeType: string; size: number; sha256: string; attachmentDataItemId: string; icon: "Paperclip" | "PushPin" | "Graph" | "Tag"; }[];
  pdfTaskPaneDocks: PdfTaskPaneDocks;
  annotationsOpen: boolean;
  goToPage: (pageNumber: number, options?: { offset?: number | undefined; offsetX?: number | undefined; scrollTop?: number | undefined; recordHistory?: boolean | undefined; restoringView?: boolean | undefined; locate?: boolean | undefined; } | undefined) => void;
  handleDeletePlacedAttachment: (id: string) => Promise<boolean>;
  consolidatedAnnotations: AnnotationListItem[];
  annotationDocxExporting: boolean;
  annotationListCounts: Record<"highlight" | "note" | "ink" | "shape" | "bookmark", number>;
  handleAnnotationNavigate: (item: AnnotationListItem) => void;
  handleExportAnnotationsJson: () => void;
  handleExportAnnotationsText: () => void;
  handleExportAnnotationsDocx: () => Promise<void>;
  annotationBatchDeleteBusy: boolean;
  annotationBatchDeleteError: boolean;
  handleAnnotationBatchDelete: (targets: readonly AnnotationListBatchDeleteTarget[]) => Promise<boolean>;
  thirdPartyPinnedAttachments: ReadFileAttachment[] | null;
   
  documentAttachments?: readonly ReadDocumentAttachment[];
  importedAttachmentDownloadDisabledReason: (reason: FileAttachmentReadBlockedReason) => string;
  handleSaveListedAttachment: (index: number) => void;
  closeNavigationPanel: (panel: PdfNavigationPanel) => void;
}

export function PdfViewerAnnotationsPane({
  dataItemId,
  annotationListReading = false,
  onNativeFileAttachmentDelete,
  nativeFileAttachmentBusy,
  nativeFileAttachmentDisabledReason,
  loading,
  commentMentions,
  placedAttachments,
  pdfTaskPaneDocks,
  annotationsOpen,
  goToPage,
  handleDeletePlacedAttachment,
  consolidatedAnnotations,
  annotationDocxExporting,
  annotationListCounts,
  handleAnnotationNavigate,
  handleExportAnnotationsJson,
  handleExportAnnotationsText,
  handleExportAnnotationsDocx,
  annotationBatchDeleteBusy,
  annotationBatchDeleteError,
  handleAnnotationBatchDelete,
  thirdPartyPinnedAttachments,
  documentAttachments = [],
  importedAttachmentDownloadDisabledReason,
  handleSaveListedAttachment,
  closeNavigationPanel,
}: PdfViewerAnnotationsPaneProps) {
  return (
    annotationsOpen && !loading ? (
      <PdfDockedPane docks={pdfTaskPaneDocks} pane="annotations">
        <PdfAnnotationsPanel
          mentions={commentMentions}
          items={consolidatedAnnotations}
          counts={annotationListCounts}
          reading={annotationListReading}
          disabled={
            loading || nativeFileAttachmentBusy || annotationBatchDeleteBusy
          }
          onNavigate={handleAnnotationNavigate}
          onExportJson={handleExportAnnotationsJson}
          onExportText={handleExportAnnotationsText}
          onExportDocx={handleExportAnnotationsDocx}
          exportDocxPending={annotationDocxExporting}
          onDeleteSelected={
            dataItemId ? handleAnnotationBatchDelete : undefined
          }
          deleteSelectedBusy={annotationBatchDeleteBusy}
          deleteSelectedError={annotationBatchDeleteError}
          fileAttachments={[
            ...placedAttachments.map((attachment) => ({
              page: attachment.page,
              name: attachment.name,
              description: attachment.name,
              size: attachment.size,
              placedId: attachment.id,
            })),
            ...(thirdPartyPinnedAttachments ?? []).map((attachment) => ({
              page: attachment.page,
              name: attachment.name,
              description: attachment.description,
              size: attachment.size,
              ...(attachment.blockedReason
                ? {
                    downloadDisabledReason:
                      importedAttachmentDownloadDisabledReason(
                        attachment.blockedReason,
                      ),
                  }
                : {}),
            })),
            // After the page ones: the save handler walks the same order.
            ...documentAttachments.map((attachment) => ({
              page: null,
              name: attachment.name,
              description: attachment.description,
              size: attachment.size,
              ...(attachment.blockedReason
                ? {
                    downloadDisabledReason:
                      importedAttachmentDownloadDisabledReason(
                        attachment.blockedReason,
                      ),
                  }
                : {}),
            })),
          ]}
          onSaveFileAttachment={handleSaveListedAttachment}
          onDeleteFileAttachment={onNativeFileAttachmentDelete &&
            !nativeFileAttachmentBusy &&
            !nativeFileAttachmentDisabledReason
            ? handleDeletePlacedAttachment
            : undefined}
          onNavigateToPage={(page) => goToPage(page)}
          onClose={() => closeNavigationPanel("annotations")}
        />
      </PdfDockedPane>
    ) : null
  );
}
