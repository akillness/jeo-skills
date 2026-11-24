"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useLayoutEffect, useRef, type ReactNode } from "react";

import { OfficeTaskPaneDockSlot } from "./OfficeTaskPaneDockSlot";
import type { OfficeTaskPaneDockRegistry } from "./officeTaskPaneDock";
import { afterOfficeTaskPaneExits } from "./officeTaskPaneMotion";
import { OFFICE_TASK_PANE_OVERLAY_ATTRIBUTE } from "./officeTaskPaneOverlay";

/**
 * The window-edge docks of an editor, on the shared dock model
 * (officeTaskPaneDock.ts): a host element per edge that docked panes render
 * into, and a slot that puts one pane in the dock of its edge. An editor
 * supplies its docks (one registry per edge), its pane-to-edge table and its
 * own class names; Docs' adapter is components/console/editor/
 * documentTaskPaneDock.tsx.
 */

export type OfficeTaskPaneDocks<Edge extends string> = Readonly<
  Record<Edge, OfficeTaskPaneDockRegistry>
>;

/** The gap between the ribbon's bottom edge and a docked pane's top. */
export const OFFICE_TASK_PANE_RIBBON_GAP_PX = 8;

/**
 * Where a dock's top goes, in the dock's own CSS pixels: just below the
 * ribbon. The dock is `position: fixed`, which resolves against the editor
 * WINDOW (a free-canvas window is transformed), and that window may be
 * scaled; `hostTopPx` is the dock's current `top`, `scale` its drawn size over
 * its layout size, and the rects are viewport rects.
 */
export function officeTaskPaneTopBelowRibbon(input: {
  readonly hostTopPx: number;
  readonly hostRectTop: number;
  readonly scale: number;
  readonly ribbonBottom: number;
  readonly gapPx?: number;
}): number {
  const scale = input.scale > 0 && Number.isFinite(input.scale) ? input.scale : 1;
  const originTop = input.hostRectTop - input.hostTopPx * scale;
  const top =
    (input.ribbonBottom - originTop) / scale +
    (input.gapPx ?? OFFICE_TASK_PANE_RIBBON_GAP_PX);
  return Math.max(0, Math.round(top));
}

/**
 * Keeps a dock's top on the ribbon's bottom edge while a pane is open: the
 * ribbon wraps, collapses or grows, the window is resized, or the page
 * scrolls. Writes `cssVariable` on the host.
 */
export interface OfficeTaskPaneBelowRibbon {
  /** The editor root the host sits in (closest ancestor). */
  readonly containerSelector: string;
  /** The ribbon inside that root. */
  readonly ribbonSelector: string;
  /** The custom property the host's CSS reads for its `top`. */
  readonly cssVariable: string;
}

export interface OfficeTaskPaneOccupies {
  /** The editor root the host sits in (closest ancestor). */
  readonly containerSelector: string;
  /** The attribute set to "open" on it while the dock holds a pane. */
  readonly attribute: string;
}

/** Keeps `host`'s top below the ribbon while `active` (see
 * OfficeTaskPaneBelowRibbon): for a dock, and for a card an editor floats
 * beside its docks (Docs' Comments). */
export function useOfficeTaskPaneBelowRibbon(
  host: HTMLElement | null,
  active: boolean,
  belowRibbon: OfficeTaskPaneBelowRibbon | null | undefined,
): void {
  const containerSelector = belowRibbon?.containerSelector;
  const ribbonSelector = belowRibbon?.ribbonSelector;
  const cssVariable = belowRibbon?.cssVariable;
  useLayoutEffect(() => {
    if (!host || !active || typeof window === "undefined") return;
    if (!containerSelector || !ribbonSelector || !cssVariable) return;
    const wrapper = host.closest(containerSelector);
    const ribbon = wrapper?.querySelector<HTMLElement>(ribbonSelector);
    if (!ribbon) return;
    let frame = 0;
    const place = () => {
      frame = 0;
      if (!host.isConnected || host.offsetWidth <= 0) return;
      const rect = host.getBoundingClientRect();
      const top = officeTaskPaneTopBelowRibbon({
        hostTopPx: Number.parseFloat(window.getComputedStyle(host).top) || 0,
        hostRectTop: rect.top,
        scale: rect.width / host.offsetWidth,
        ribbonBottom: ribbon.getBoundingClientRect().bottom,
      });
      const next = `${top}px`;
      if (host.style.getPropertyValue(cssVariable) !== next) {
        host.style.setProperty(cssVariable, next);
      }
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(place);
    };
    place();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(ribbon);
    if (wrapper) observer?.observe(wrapper);
    window.addEventListener("resize", schedule);
    document.addEventListener("scroll", schedule, true);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
      document.removeEventListener("scroll", schedule, true);
    };
  }, [host, active, containerSelector, ribbonSelector, cssVariable]);
}

/** The element a dock's panes render into. Empty (no pane open), it takes
 * no room. It says which edge it docks at and whether it is a card of its
 * own, for the panes' motion (officeTaskPaneMotion.ts): a card moves as a
 * whole when its first pane comes or its last pane goes. */
export function OfficeTaskPaneDockHost<Edge extends string>({
  docks,
  edge,
  className,
  testId,
  belowRibbon,
  hiddenWhenEmpty = false,
  occupies,
  card = false,
  overlay,
}: {
  readonly docks: OfficeTaskPaneDocks<Edge>;
  readonly edge: Edge;
  readonly className?: string;
  readonly testId?: string;
  /** Keep this dock's top below the ribbon (Word's right-edge panes). */
  readonly belowRibbon?: OfficeTaskPaneBelowRibbon | null;
  /** Hide the empty dock from assistive technology (a host that lays the
   * dock out as a column only while a pane is open). */
  readonly hiddenWhenEmpty?: boolean;
  /**
   * A dock that floats over the editor (a fixed card) tells the editor while
   * it holds a pane, so the page can move out from under it: the attribute
   * is set to "open" on the closest `containerSelector` ancestor.
   */
  readonly occupies?: OfficeTaskPaneOccupies | null;
  /** The dock draws the card its panes sit in (a bordered, shadowed box),
   * rather than each pane drawing its own. */
  readonly card?: boolean;
  /**
   * The dock's panes float over the editor's content instead of taking a
   * column beside it (officeTaskPaneOverlay.ts): the host says which edge it
   * covers, so the editor can keep what it brings into view clear of it.
   * false: such a dock whose pane the person moved off the edge (it floats
   * where they put it).
   */
  readonly overlay?: boolean;
}): React.JSX.Element {
  const dock = docks[edge];
  // The panes this host shows: those moved out of the tab have columns of
  // their own (officeTaskPaneDock.ts, `separate`).
  const grouped = dock.separate
    ? dock.state.opened.filter((id) => !dock.separate?.has(id)).length
    : dock.state.opened.length;
  const empty = grouped === 0;
  const occupiesContainer = occupies?.containerSelector;
  const occupiesAttribute = occupies?.attribute;
  const releaseRef = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    if (!dock.host || empty || !occupiesContainer || !occupiesAttribute) return;
    const host = dock.host;
    const container = host.closest(occupiesContainer);
    if (!container) return;
    releaseRef.current?.();
    releaseRef.current = null;
    container.setAttribute(occupiesAttribute, "open");
    return () => {
      // The page gets its room back once the last pane has been seen
      // leaving, not under it (and never in a transition).
      releaseRef.current = afterOfficeTaskPaneExits(host, () => {
        releaseRef.current = null;
        container.removeAttribute(occupiesAttribute);
      });
    };
  }, [dock.host, empty, occupiesContainer, occupiesAttribute]);
  useOfficeTaskPaneBelowRibbon(belowRibbon ? dock.host : null, !empty, belowRibbon);
  return (
    <div
      ref={dock.setHost}
      className={className}
      data-testid={testId}
      data-tab-count={grouped}
      aria-hidden={hiddenWhenEmpty && empty ? true : undefined}
      // What the pane motion (officeTaskPaneMotion.ts) reads.
      data-office-task-pane-dock={card ? "card" : "column"}
      data-office-task-pane-edge={
        edge === "left" || edge === "right" ? edge : undefined
      }
      {...{
        // false: an overlay dock whose pane was moved off the edge.
        [OFFICE_TASK_PANE_OVERLAY_ATTRIBUTE]:
          overlay === undefined || (edge !== "left" && edge !== "right")
            ? undefined
            : overlay
              ? edge
              : "floating",
      }}
    />
  );
}

/** One pane in the dock of its edge. Without docks (a pane's own unit test)
 * it renders where it is. */
export function OfficeDockedPane<Pane extends string, Edge extends string>({
  docks,
  edges,
  pane,
  children,
}: {
  readonly docks: OfficeTaskPaneDocks<Edge> | null;
  /** The editor's pane-to-edge table. */
  readonly edges: Readonly<Record<Pane, Edge>>;
  readonly pane: Pane;
  readonly children: ReactNode;
}): React.JSX.Element | null {
  return (
    <OfficeTaskPaneDockSlot dock={docks?.[edges[pane]]} id={pane}>
      {children}
    </OfficeTaskPaneDockSlot>
  );
}
