/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A preview's zoom: its paper fitted to the window it is read in. Shared by
 * the editor (NoteEditor's preview mode) and the print surface; moved
 * unchanged out of NoteEditor.tsx.
 */
"use client";

import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import { EDITOR_ZOOM_DEFAULT, fitPageWidthZoom, MULTIPLE_PAGES_FIT_ZOOM_BOUNDS } from "@mrnote/core/web/lib/editor-zoom.ts";
import type { NoteEditorRuntime } from "./editorRuntime";

/** Room kept around a preview's paper when it is fitted to a narrow window:
 * enough for the review's accent ring and the paper's shadow. */
export const PREVIEW_PAGE_WIDTH_INSET_PX = 24;

// A preview (a generated document under review) is read in whatever
// window it opened in and has no zoom control. When its paper is wider
// than that window it is shown whole at a smaller scale, Word's Page Width,
// centred and never cut at the edge; it is never enlarged past 100%. Only
// the view scales: pagination measures the unscaled paper.
export function usePreviewPageFitZoom(
  previewMode: boolean,
  wrapperRef: RefObject<HTMLDivElement | null>,
  usableEditor: NoteEditorRuntime | null,
  editorHydrated: boolean,
  setDocZoom: Dispatch<SetStateAction<number>>,
): void {
  useEffect(() => {
    if (!previewMode) return;
    const wrapper = wrapperRef.current;
    if (!wrapper || typeof ResizeObserver === "undefined") return;
    const fit = () => {
      const sheet = wrapper.querySelector<HTMLElement>(
        ".note-editor-content > article[data-page-sheet]",
      );
      const available = wrapper.clientWidth;
      const paper = sheet?.offsetWidth ?? 0;
      if (!available || !paper) return;
      const next = Math.min(
        EDITOR_ZOOM_DEFAULT,
        fitPageWidthZoom(
          available,
          paper,
          PREVIEW_PAGE_WIDTH_INSET_PX,
          MULTIPLE_PAGES_FIT_ZOOM_BOUNDS,
        ),
      );
      setDocZoom((current) => (Math.abs(current - next) < 0.005 ? current : next));
    };
    fit();
    const observer = new ResizeObserver(() => fit());
    observer.observe(wrapper);
    const surface = wrapper.querySelector<HTMLElement>(
      '[data-testid="note-editor-page-surface"]',
    );
    if (surface) observer.observe(surface);
    return () => observer.disconnect();
    // The wrapper mounts once the editor is hydrated, after it is usable:
    // keyed on usability alone, this ran before there was a paper to fit.
  }, [previewMode, usableEditor, editorHydrated, setDocZoom, wrapperRef]);
}
