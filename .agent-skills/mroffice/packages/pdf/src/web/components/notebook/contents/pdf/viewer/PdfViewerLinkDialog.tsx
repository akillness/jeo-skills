"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import PdfLinkDialog from "../PdfLinkDialog";
import type { Dispatch, SetStateAction, RefObject } from "react";
import type { PageRecord } from "./pageRecord";
import type { PdfLinkDraft } from "../PdfLinkDialog";
import type { SelectedPdfLinkContext } from "./annotationModels";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";

export interface PdfViewerLinkDialogProps {
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  pages: PageRecord[];
  linkSaving: boolean;
  linkSaveError: string | null;
  setLinkSaveError: Dispatch<SetStateAction<string | null>>;
  linkDraft: PdfLinkDraft | null;
  setLinkDraft: Dispatch<SetStateAction<PdfLinkDraft | null>>;
  setSelectedLinkContext: Dispatch<SetStateAction<SelectedPdfLinkContext | null>>;
  selectedLinkContextRef: RefObject<SelectedPdfLinkContext | null>;
  linkDialogReturnFocusRef: RefObject<HTMLButtonElement | null>;
  persistLinkOverlay: (input: { page: number; x: number; y: number; width: number; height: number; url?: string | null | undefined; goToPage?: number | null | undefined; editingId?: string | null | undefined; }) => Promise<boolean>;
  handleLinkOverlayDelete: (annotationId: string) => Promise<boolean>;
  persistNativeSourceLink: (annotationId: string, destination: { url: string | null; goToPage: number | null; }) => Promise<boolean>;
  handleNativeSourceLinkDelete: (annotationId: string) => Promise<boolean>;
  clearSelectedLinkContext: (restoreFocus?: boolean) => void;
  findLinkCommandTrigger: () => HTMLButtonElement;
}

export function PdfViewerLinkDialog({
  t,
  pages,
  linkSaving,
  linkSaveError,
  setLinkSaveError,
  linkDraft,
  setLinkDraft,
  setSelectedLinkContext,
  selectedLinkContextRef,
  linkDialogReturnFocusRef,
  persistLinkOverlay,
  handleLinkOverlayDelete,
  persistNativeSourceLink,
  handleNativeSourceLinkDelete,
  clearSelectedLinkContext,
  findLinkCommandTrigger,
}: PdfViewerLinkDialogProps) {
  return (
    linkDraft ? (
      <PdfLinkDialog
        draft={linkDraft}
        pageCount={pages.length}
        busy={linkSaving}
        error={linkSaveError}
        returnFocusRef={linkDialogReturnFocusRef}
        labels={{
          title: t("pdfViewer.linkEditTitle"),
          urlLabel: t("pdfViewer.linkUrlLabel"),
          urlPlaceholder: t("pdfViewer.linkUrlPlaceholder"),
          pageLabel: t("pdfViewer.linkGoToPageLabel"),
          pagePlaceholder: t("pdfViewer.linkGoToPagePlaceholder"),
          save: t("pdfViewer.linkSave"),
          cancel: t("pdfViewer.linkCancel"),
          remove: t("pdfViewer.linkDelete"),
        }}
        onChange={setLinkDraft}
        onCancel={() => {
          setLinkSaveError(null);
          setLinkDraft(null);
        }}
        onDelete={
          linkDraft.editingId || linkDraft.editingSourceId
            ? () => {
                const id = linkDraft.editingSourceId ?? linkDraft.editingId;
                if (!id) return;
                void (async () => {
                  const deleted = linkDraft.editingSourceId
                    ? await handleNativeSourceLinkDelete(id)
                    : await handleLinkOverlayDelete(id);
                  if (deleted) {
                    linkDialogReturnFocusRef.current =
                      findLinkCommandTrigger();
                    clearSelectedLinkContext(false);
                    setLinkDraft(null);
                  }
                })();
              }
            : undefined
        }
        onSave={(destination) => {
          const draft = linkDraft;
          void (async () => {
            const ok = draft.editingSourceId
              ? await persistNativeSourceLink(
                  draft.editingSourceId,
                  destination,
                )
              : await persistLinkOverlay({
                  page: draft.page,
                  x: draft.x,
                  y: draft.y,
                  width: draft.width,
                  height: draft.height,
                  ...destination,
                  editingId: draft.editingId,
                });
            if (ok) {
              const selected = selectedLinkContextRef.current;
              const editedId = draft.editingSourceId ?? draft.editingId;
              if (
                selected &&
                editedId &&
                (selected.sourceId ?? selected.overlay.id) === editedId
              ) {
                const next = {
                  ...selected,
                  overlay: { ...selected.overlay, ...destination },
                };
                selectedLinkContextRef.current = next;
                setSelectedLinkContext(next);
              }
              setLinkDraft(null);
            }
          })();
        }}
      />
    ) : null
  );
}
