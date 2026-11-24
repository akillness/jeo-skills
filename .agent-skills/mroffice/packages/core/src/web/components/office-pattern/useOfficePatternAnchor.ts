"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { OFFICE_PATTERN_ANCHOR_ATTRIBUTE, watchOfficePatterns } from "../../lib/office-pattern-anchor";

/**
 * Makes `ref`'s element (a slide, a Word page) its patterns' anchor: every
 * Office pattern fill under it is drawn one bit `bitCssPx` CSS pixels on
 * screen (1: PowerPoint's window, at any zoom) on the element's own grid
 * from its top-left corner -- or, with `originSelector`, on the page that
 * holds each pattern (lib/office-pattern-anchor). `zoomKey`: any value
 * that changes when the element is drawn at another size from outside it
 * (the view's zoom, a thumbnail's width), so the patterns re-lay.
 *
 * The element is looked for after every render (a host mounts it late, or
 * replaces it: the slide canvas appears once the deck has loaded), and
 * watched from the moment it is there.
 */
export function useOfficePatternAnchor(
  ref: RefObject<HTMLElement | null>,
  zoomKey: unknown,
  bitCssPx = 1,
  /** A paged host's pages (each its own grid), e.g. `article[data-page-sheet]`. */
  originSelector?: string,
): void {
  const watched = useRef<{
    element: HTMLElement;
    watcher: ReturnType<typeof watchOfficePatterns>;
    bitCssPx: number;
    originSelector?: string;
  } | null>(null);
  // No dependency list: the ref's element is compared after every render.
  useLayoutEffect(() => {
    const element = ref.current;
    const current = watched.current;
    if (current && current.element === element && current.bitCssPx === bitCssPx && current.originSelector === originSelector) return;
    if (current) {
      current.watcher.disconnect();
      current.element.removeAttribute(OFFICE_PATTERN_ANCHOR_ATTRIBUTE);
      watched.current = null;
    }
    if (!element) return;
    element.setAttribute(OFFICE_PATTERN_ANCHOR_ATTRIBUTE, "");
    watched.current = { element, watcher: watchOfficePatterns(element, bitCssPx, originSelector), bitCssPx, originSelector };
  });
  useLayoutEffect(() => {
    watched.current?.watcher.refresh();
  }, [zoomKey]);
  useEffect(
    () => () => {
      const current = watched.current;
      if (!current) return;
      current.watcher.disconnect();
      current.element.removeAttribute(OFFICE_PATTERN_ANCHOR_ATTRIBUTE);
      watched.current = null;
    },
    [],
  );
}
