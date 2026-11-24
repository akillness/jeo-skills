"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef } from "react";
import { powerPointLineFitStaleAfter, requestPowerPointLineFit } from "@mrnote/core/web/lib/presentation/powerpoint-line-fit-dom.ts";

/**
 * True inside a slide's thumbnail: its columns are fitted once the frame has
 * painted (`requestPowerPointLineFit(…, "after-paint")`), so a deck's slide
 * is not held while its miniatures read their layout. Same fit, later.
 */
export const PowerPointLineFitAfterPaintContext = createContext(false);

/**
 * A slide text column's lines end where PowerPoint ends them: its glyph
 * advances rounded to 1/8 pt, a hair from the browser's exact sum either way
 * (`lib/presentation/powerpoint-line-fit`). Returns the ref callback each
 * column registers with; the columns are fitted after every layout of the
 * component, when a font arrives and when a column's container changes width.
 */
export function usePowerPointLineFit(): (element: HTMLElement | null) => void {
  const afterPaint = useContext(PowerPointLineFitAfterPaintContext);
  const columns = useRef(new Set<HTMLElement>());
  const observer = useRef<ResizeObserver | null>(null);
  const register = useCallback((element: HTMLElement | null) => {
    if (element) columns.current.add(element);
  }, []);
  const fit = useCallback(() => {
    for (const column of columns.current) {
      if (!column.isConnected) columns.current.delete(column);
      else if (column.parentElement) observer.current?.observe(column.parentElement);
    }
    requestPowerPointLineFit(columns.current, afterPaint ? "after-paint" : "now");
  }, [afterPaint]);
  useLayoutEffect(fit);
  useEffect(() => {
    const fonts = typeof document === "undefined" ? undefined : document.fonts;
    const refit = () => fit();
    // Only a face its columns are drawn in (see powerPointLineFitStaleAfter).
    const refitForFonts = (event: Event) => {
      if (powerPointLineFitStaleAfter(columns.current, event)) refit();
    };
    fonts?.addEventListener?.("loadingdone", refitForFonts);
    const widths = new WeakMap<Element, number>();
    observer.current =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver((entries) => {
            // The container's own width only: the fitted column's margin
            // never changes the element it sits in.
            if (entries.some((entry) => {
              const width = entry.contentRect.width;
              const changed = widths.get(entry.target) !== width;
              widths.set(entry.target, width);
              return changed;
            })) refit();
          });
    refit();
    return () => {
      fonts?.removeEventListener?.("loadingdone", refitForFonts);
      observer.current?.disconnect();
      observer.current = null;
    };
  }, [fit]);
  return register;
}
