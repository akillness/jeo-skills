/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The zoomed page surface's reserved space: the margins that make the
 * scaled surface's box the paper as it is seen. Shared by the editor
 * (NoteEditor) and the print surface; moved unchanged out of NoteEditor.tsx.
 */
"use client";

import { useLayoutEffect, type RefObject } from "react";
import type { NoteEditorRuntime } from "./editorRuntime";

// scale() does not change LAYOUT size: zoomed-in tails were unreachable
// and zoomed-out docs left dead space. Reserve the visual overflow with a
// bottom margin on the scaled element ((zoom-1) x layout height), kept
// fresh across content growth via a ResizeObserver. The width is reserved
// the same way, half on each side: the box the body centres (and a narrow
// window scrolls) is then the paper as it is seen, not the full-size paper
// it was scaled from. Above 100% the paper scaled about its centre grew
// past the left edge of the body once the page and the comments pane no
// longer fitted side by side, where no scroll reaches (live Word audit
// WUA 040: 200% with comments open cut the first words of every line);
// reserved, the body's safe centring starts the row at the scroll origin.
// Imperative style is safe: React's style objects never carry these
// margins here. A layout effect: the scroll extent a zoom commit is
// anchored against (the live pinch, the viewport-centre anchoring) must
// exist before the frame is painted.
export function usePagedSurfaceZoomReserve(
  wrapperRef: RefObject<HTMLDivElement | null>,
  docZoom: number,
  usableEditor: NoteEditorRuntime | null,
  editorHydrated: boolean,
): void {
  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const scaled = wrapper.querySelector<HTMLElement>(
      '[data-testid="note-editor-page-surface"]',
    );
    if (!scaled) return;
    // The pages as laid out, which can run past the surface's own box: on
    // WebKit the surface kept the height of its first page after pages were
    
    // overflowed it, and the ribbon, sticky inside the wrapper the surface
    // sizes, scrolled away past the first page. The reservation is taken
    // from the content's own bottom, so whatever the surface's box, the
    // wrapper holds every page as it is seen.
    let observer: ResizeObserver | null = null;
    const contentBottom = () => {
      let bottom = scaled.offsetHeight;
      for (const child of Array.from(scaled.children)) {
        if (!(child instanceof HTMLElement) || child.offsetParent !== scaled) continue;
        observer?.observe(child);
        bottom = Math.max(bottom, child.offsetTop + child.offsetHeight);
      }
      return bottom;
    };
    const apply = () => {
      const reserve = contentBottom() * docZoom - scaled.offsetHeight;
      scaled.style.marginBottom = Math.abs(reserve) < 0.5 ? "" : `${reserve}px`;
      const inline =
        docZoom === 1 ? "" : `${((docZoom - 1) * scaled.offsetWidth) / 2}px`;
      scaled.style.marginLeft = inline;
      scaled.style.marginRight = inline;
    };
    observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => apply())
        : null;
    apply();
    observer?.observe(scaled);
    return () => {
      observer?.disconnect();
      scaled.style.marginBottom = "";
      scaled.style.marginLeft = "";
      scaled.style.marginRight = "";
    };
    // The wrapper mounts once the editor is hydrated, after it is usable.
  }, [docZoom, usableEditor, editorHydrated, wrapperRef]);
}
