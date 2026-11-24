"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "../../../../host/next-intl";
import NoteEditor, { type DocumentSurfaceReadiness } from "@mrnote/docs/web/components/console/editor/NoteEditor.tsx";
import ImportedEditableStatusBar from "./ImportedEditableStatusBar";
import ReferencingHighlights from "./ReferencingHighlights";
import { useWindowManagerActions } from "../WindowManager";
import { dispatchNotebookPagesChanged } from "../../../lib/notebook-events";
import { usePageLocate } from "../../../hooks/usePageLocate";
import { takeClassicOpenZoom } from "../../../lib/classic-start/handoff";
import { classicPendingEditsFor, takeClassicEditsPending } from "../../../lib/classic-start/pending";

interface NoteWindowProps {
  pageId: string;
  notebookId?: string;
  windowId?: string;
  onSurfaceReadinessChange?: (value: DocumentSurfaceReadiness) => void;
  chromeReveal?: boolean;
  initialOutlineOpen?: boolean;
  /** The Word-web ribbon (default). Only the dev document dialog gallery
   * turns it off, to mount the desktop ribbon on its scratch page. */
  docsOfficeParityV2?: boolean;
}

export default function NoteWindow({
  pageId,
  notebookId = "",
  windowId,
  onSurfaceReadinessChange,
  chromeReveal,
  initialOutlineOpen,
  docsOfficeParityV2 = true,
}: NoteWindowProps) {
  const { renameWindowByMeta } = useWindowManagerActions();
  const t = useTranslations("console-notebooks");
  const refreshTimerRef = useRef<number | null>(null);
  const [footerPortalTarget, setFooterPortalTarget] = useState<HTMLDivElement | null>(null);
  // a page placed from the homepage opens at the zoom it had there, once
  const [classicZoom] = useState(() => takeClassicOpenZoom(pageId));
  // ...and with the edits made to it there, made here (NoteEditor)
  const [classicEdits] = useState(() =>
    takeClassicEditsPending(pageId) ? classicPendingEditsFor(pageId) : undefined,
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // An AI answer's source "Locate": bring the passage it read into view.
  usePageLocate(pageId, scrollRef, { contentSelector: ".note-editor-content" });

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  // Keep window titlebar + minimized-tray label in sync with the editor title.
  const handleTitleChange = useCallback(
    (title: string, origin?: "loaded") => {
      // NoteEditor fires this from editor update callbacks that can run
      // INSIDE a React render/lifecycle (e.g. applying an AI revision that
      // rewrites the first heading). renameWindowByMeta flushes the window
      // store synchronously - calling flushSync mid-render is ignored by
      // React with a console error and drops the update. Defer one microtask
      // so the rename lands after the current render commit.
      const nextTitle = title.trim() || t("pages.untitled");
      queueMicrotask(() => renameWindowByMeta("pageId", pageId, nextTitle));
      // The title the page was loaded with is the saved one: the page list
      // has it already. Announcing it made every listener read again on
      // every open -- the import status bar the whole page (2.6 MB on a
      // large import), the sidebar its list, the catalogue its delta -- and
      // a pending announcement of a real edit is left to run.
      if (origin === "loaded") return;
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = window.setTimeout(() => {
        // U-05 — notify listeners (the sidebar, the library) that the page
        // changed so their metadata (updated_at) refreshes.
        // `dispatchNotebookPagesChanged` already fires the event under the
        // hood; the redundant `window.dispatchEvent(new CustomEvent(...))`
        // that lived here doubled every refresh and broke listeners that
        // tracked dispatch counts.
        dispatchNotebookPagesChanged(notebookId || undefined, pageId);
      }, 250);
    },
    [notebookId, pageId, renameWindowByMeta, t],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* The standalone export bar folded into the editor's utility row
          (single 导出 ▾ menu) — chrome height goes to the document itself. */}
      <ImportedEditableStatusBar
        pageId={pageId}
        notebookId={notebookId}
        pageType="document"
        // "Go to" on a declined change: the document block it names, which
        // is the n-th top-level node of the editor (as the receipt counts).
        onLocate={(target) => {
          if (target.kind !== "block") return;
          const root = scrollRef.current?.querySelector(".ProseMirror");
          const node = root?.children[target.block - 1];
          if (node instanceof HTMLElement) node.scrollIntoView({ block: "center", behavior: "smooth" });
        }}
      />
      <div
        ref={scrollRef}
        className="note-window-scroll"
        style={{ maxWidth: "none", flex: 1, minHeight: 0, overflow: "auto" }}
      >
        <NoteEditor
          pageId={pageId}
          windowId={windowId}
          onSurfaceReadinessChange={onSurfaceReadinessChange}
          chromeReveal={chromeReveal}
          footerPortalTarget={footerPortalTarget}
          initialOutlineOpen={initialOutlineOpen}
          onTitleChange={handleTitleChange}
          serverExportEnabled
          docsOfficeParityV2={docsOfficeParityV2}
          {...(classicZoom !== undefined ? { initialZoom: classicZoom } : {})}
          {...(classicEdits ? { classicPendingEdits: classicEdits } : {})}
        />
        {pageId && notebookId ? (
          <ReferencingHighlights pageId={pageId} notebookId={notebookId} />
        ) : null}
      </div>
      {





}
      <div
        ref={setFooterPortalTarget}
        className="note-window-document-footer"
        data-document-chrome-reveal={chromeReveal ? "true" : undefined}
      />
    </div>
  );
}
