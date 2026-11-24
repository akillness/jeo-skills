"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import PdfOutlinePanel from "../PdfOutlinePanel";
import { PdfDockedPane, type PdfTaskPaneDocks } from "../pdfTaskPaneDock";
import type {
  OutlineNode,
  ManagedOutlineMutation,
  ManagedOutlineDestination,
  ManagedOutlineNode,
} from "@mrnote/core/web/lib/pdf/outline.ts";
import type { UserBookmark } from "../../../../../lib/pdf/user-bookmarks";
import type { PdfNavigationPanel } from "../PdfNavigationRail";

export interface PdfViewerOutlinePaneProps {
  managedOutline: readonly ManagedOutlineNode[] | undefined;
  onManagedOutlineMutation: ((input: { operation: "add" | "rename" | "update-destination" | "move" | "delete"; tree: readonly ManagedOutlineNode[]; }) => boolean | Promise<boolean>) | undefined;
  onSourceOutlineEdit: ((edit: Readonly<{ kind: "rename" | "delete"; node: OutlineNode; title?: string; managedPath?: readonly number[] }>) => Promise<void>) | undefined;
  managedOutlineBusy: boolean | undefined;
  managedOutlineDisabledReason: string | undefined;
  dataItemId: string | undefined;
  loading: boolean;
  pdfTaskPaneDocks: PdfTaskPaneDocks;
  outlineOpen: boolean;
  outline: OutlineNode[];
  outlineReady: boolean;
  bookmarkSaving: boolean;
  insertBookmarkRenameId: string | null;
  activeOutlineId: string | null;
  handleManagedOutlineMutation: (mutation: ManagedOutlineMutation) => Promise<void>;
  currentManagedOutlineDestination: () => ManagedOutlineDestination | undefined;
  goToPage: (pageNumber: number, options?: { offset?: number | undefined; offsetX?: number | undefined; scrollTop?: number | undefined; recordHistory?: boolean | undefined; restoringView?: boolean | undefined; locate?: boolean | undefined; } | undefined) => void;
  handleOutlineNavigate: (node: OutlineNode) => Promise<void>;
  handleInsertBookmark: (trigger: HTMLButtonElement | null) => Promise<boolean>;
  finishInsertBookmarkRename: () => void;
  handleBookmarkDelete: (annotationId: string) => Promise<boolean>;
  handleBookmarkRename: (bookmark: UserBookmark, label: string) => Promise<boolean>;
  sortedBookmarks: UserBookmark[];
  closeNavigationPanel: (panel: PdfNavigationPanel) => void;
}

export function PdfViewerOutlinePane({
  managedOutline,
  onManagedOutlineMutation,
  onSourceOutlineEdit,
  managedOutlineBusy,
  managedOutlineDisabledReason,
  dataItemId,
  loading,
  pdfTaskPaneDocks,
  outlineOpen,
  outline,
  outlineReady,
  bookmarkSaving,
  insertBookmarkRenameId,
  activeOutlineId,
  handleManagedOutlineMutation,
  currentManagedOutlineDestination,
  goToPage,
  handleOutlineNavigate,
  handleInsertBookmark,
  finishInsertBookmarkRename,
  handleBookmarkDelete,
  handleBookmarkRename,
  sortedBookmarks,
  closeNavigationPanel,
}: PdfViewerOutlinePaneProps) {
  return (
    outlineOpen ? (
      <PdfDockedPane docks={pdfTaskPaneDocks} pane="outline">
        <PdfOutlinePanel
          nodes={outline}
          managedNodes={managedOutline}
          currentDestination={currentManagedOutlineDestination()}
          managedBusy={managedOutlineBusy}
          managedDisabledReason={managedOutlineDisabledReason}
          onManagedMutation={
            onManagedOutlineMutation ? handleManagedOutlineMutation : undefined
          }
          onSourceBookmarkEdit={onSourceOutlineEdit}
          onNavigateManaged={(node) =>
            goToPage(node.destination.pageNumber, { locate: true })
          }
          ready={outlineReady}
          disabled={loading}
          onNavigate={(node) => {
            void handleOutlineNavigate(node);
          }}
          onClose={() => closeNavigationPanel("outline")}
          // Current-section highlight: the last outline entry whose resolved
          // start page is <= the current page (binary search, pure helper).
          activeNodeId={activeOutlineId}
          // User-created bookmarks only when this data-item can persist them.
          userBookmarks={dataItemId ? sortedBookmarks : undefined}
          bookmarkSaving={bookmarkSaving}
          autoRenameBookmarkId={insertBookmarkRenameId}
          onAutoRenameEnd={finishInsertBookmarkRename}
          onAddBookmark={
            dataItemId
              ? (trigger) => handleInsertBookmark(trigger)
              : undefined
          }
          onNavigateBookmark={
            dataItemId
              ? (bookmark) => goToPage(bookmark.page, { locate: true })
              : undefined
          }
          onDeleteBookmark={
            dataItemId
              ? (bookmark) => handleBookmarkDelete(bookmark.id)
              : undefined
          }
          onRenameBookmark={
            dataItemId
              ? (bookmark, label) => handleBookmarkRename(bookmark, label)
              : undefined
          }
        />
      </PdfDockedPane>
    ) : null
  );
}
