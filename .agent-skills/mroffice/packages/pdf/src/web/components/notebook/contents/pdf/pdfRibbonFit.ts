"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";


















/** The groups collapsed on the band now, by their collapse id. */
export const PdfRibbonFitContext = createContext<ReadonlySet<string>>(new Set());

export function usePdfRibbonGroupCollapsed(id: string | undefined): boolean {
  const collapsed = useContext(PdfRibbonFitContext);
  return id !== undefined && collapsed.has(id);
}

export const PDF_RIBBON_COLLAPSIBLE_ATTRIBUTE = "data-pdf-ribbon-collapsible";

/** A pixel of rounding is not an overflow. */
const FIT_EPSILON = 1;

export type PdfRibbonFitStep =
  | { readonly kind: "collapse"; readonly id: string }
  | { readonly kind: "expand" }
  | { readonly kind: "stay" };

/**
 * The next step of the band's fit, from what it measures now.
 *
 * `collapsed` are the ids collapsed so far, in the order they collapsed;
 * `needed[i]` is the width the band's content took with the first `i` of
 * them collapsed (recorded when that state overflowed, which is why the
 * next one collapsed). `candidates` are the collapsible groups on show,
 * in band order.
 */
export function nextPdfRibbonFitStep(input: {
  readonly available: number;
  readonly content: number;
  readonly collapsed: readonly string[];
  readonly needed: readonly (number | undefined)[];
  readonly candidates: readonly string[];
}): PdfRibbonFitStep {
  const { available, content, collapsed, needed, candidates } = input;
  if (available <= 0) return { kind: "stay" };
  if (content > available + FIT_EPSILON) {
    // The furthest group along that is still open.
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const id = candidates[index]!;
      if (!collapsed.includes(id)) return { kind: "collapse", id };
    }
    return { kind: "stay" };
  }
  const looser = needed[collapsed.length - 1];
  if (collapsed.length > 0 && looser !== undefined && looser <= available + FIT_EPSILON) {
    return { kind: "expand" };
  }
  return { kind: "stay" };
}

interface FitState {
  readonly tab: string;
  readonly collapsed: readonly string[];
}

/**
 * The band's fit controller: the marker it returns goes inside the band's
 * track; the set goes to PdfRibbonFitContext. Every tab starts open and is
 * fitted again from there.
 */
export function usePdfRibbonFit(activeTab: string): {
  markerRef: (element: HTMLElement | null) => void;
  collapsed: ReadonlySet<string>;
} {
  const [marker, setMarker] = useState<HTMLElement | null>(null);
  const [state, setState] = useState<FitState>({ tab: activeTab, collapsed: [] });
  // Another tab is fitted from open: its own widths, none collapsed.
  const current = useMemo<FitState>(
    () => (state.tab === activeTab ? state : { tab: activeTab, collapsed: [] }),
    [activeTab, state],
  );
  const neededRef = useRef<{ tab: string; widths: (number | undefined)[] }>({ tab: activeTab, widths: [] });
  const stateRef = useRef(current);
  stateRef.current = current;

  const measure = useCallback(() => {
    if (!marker) return;
    const scroller = marker.closest<HTMLElement>(".note-editor-ribbon-body");
    const track = marker.parentElement;
    if (!scroller || !track) return;
    const { tab, collapsed } = stateRef.current;
    if (neededRef.current.tab !== tab) neededRef.current = { tab, widths: [] };
    const needed = neededRef.current.widths;
    const candidates: string[] = [];
    for (const group of Array.from(
      track.querySelectorAll<HTMLElement>(`[${PDF_RIBBON_COLLAPSIBLE_ATTRIBUTE}]`),
    )) {
      // A group of another tab is hidden by the tab gating: no box.
      if (group.getClientRects().length === 0) continue;
      const id = group.getAttribute(PDF_RIBBON_COLLAPSIBLE_ATTRIBUTE);
      if (id && !candidates.includes(id)) candidates.push(id);
    }
    const content = scroller.scrollWidth;
    const step = nextPdfRibbonFitStep({
      available: scroller.clientWidth,
      content,
      collapsed,
      needed,
      candidates,
    });
    if (step.kind === "collapse") {
      needed[collapsed.length] = content;
      setState({ tab, collapsed: [...collapsed, step.id] });
    } else if (step.kind === "expand") {
      needed.length = collapsed.length - 1;
      setState({ tab, collapsed: collapsed.slice(0, -1) });
    }
  }, [marker]);

  // Measured after every change of what is collapsed, before the paint: the
  // band settles in one frame, never showing the wider state first.
  useLayoutEffect(() => {
    measure();
  }, [measure, current.collapsed, activeTab]);

  useLayoutEffect(() => {
    if (!marker || typeof ResizeObserver === "undefined") return;
    const scroller = marker.closest<HTMLElement>(".note-editor-ribbon-body");
    const track = marker.parentElement;
    if (!scroller || !track) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    observer.observe(scroller);
    observer.observe(track);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [marker, measure]);

  const collapsedSet = useMemo<ReadonlySet<string>>(
    () => new Set(current.collapsed),
    [current.collapsed],
  );
  return { markerRef: setMarker, collapsed: collapsedSet };
}
