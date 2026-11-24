"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useRef } from "react";

import { shownOfficeTaskPane } from "./officeTaskPaneLayout";





















/** On a dock host whose panes float over the content: the edge it covers. */
export const OFFICE_TASK_PANE_OVERLAY_ATTRIBUTE = "data-office-task-pane-overlay";
/** How far a docked card sits in from the content's edge (and from the
 * ribbon above it, and from its neighbour card). */
export const OFFICE_TASK_PANE_OVERLAY_INSET_PX = 8;
/** What is kept clear beside a card when the content is brought into view. */
export const OFFICE_TASK_PANE_COVER_GAP_PX = 8;
export const OFFICE_TASK_PANE_COVER_LEFT_VARIABLE = "--office-task-pane-cover-left";
export const OFFICE_TASK_PANE_COVER_RIGHT_VARIABLE = "--office-task-pane-cover-right";

export type OfficeTaskPaneOverlayEdge = "left" | "right";

export interface OfficeTaskPaneCover {
  /** CSS px of the viewport covered at its left edge (0: none). */
  readonly left: number;
  readonly right: number;
}

export const NO_OFFICE_TASK_PANE_COVER: OfficeTaskPaneCover = Object.freeze({
  left: 0,
  right: 0,
});

interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/**
 * How far cards at the two edges reach into a viewport, in the viewport's
 * own CSS px (the rects are viewport rects, `scale` its drawn size over its
 * layout size). A card counts only where it overlaps the viewport's height;
 * the gap is kept clear beside a card that covers anything.
 */
export function officeTaskPaneCoverOf(
  viewport: Box,
  cards: ReadonlyArray<{ readonly edge: OfficeTaskPaneOverlayEdge; readonly box: Box }>,
  scale = 1,
  gap = OFFICE_TASK_PANE_COVER_GAP_PX,
): OfficeTaskPaneCover {
  const factor = scale > 0 && Number.isFinite(scale) ? scale : 1;
  const width = viewport.right - viewport.left;
  let left = 0;
  let right = 0;
  for (const { edge, box } of cards) {
    if (box.right - box.left <= 0 || box.bottom - box.top <= 0) continue;
    if (box.bottom <= viewport.top || box.top >= viewport.bottom) continue;
    if (box.right <= viewport.left || box.left >= viewport.right) continue;
    if (edge === "right") {
      right = Math.max(right, viewport.right - box.left);
    } else {
      left = Math.max(left, box.right - viewport.left);
    }
  }
  const settle = (covered: number) =>
    covered > 0
      ? Math.round(Math.min(width, covered + gap * factor) / factor)
      : 0;
  return { left: settle(left), right: settle(right) };
}

/** The card a host shows: its pane in front, or the host itself (a dock
 * that draws the card). Null for a host with nothing showing. */
function shownCardOf(host: HTMLElement): HTMLElement | null {
  if (host.getClientRects().length === 0) return null;
  const pane = shownOfficeTaskPane(host);
  if (pane && pane.getClientRects().length > 0) {
    // A host that is a box of its own (a card, a grid column) is what
    // covers; a zero-width anchor holds its pane out of flow.
    return host.offsetWidth > 0 ? host : pane;
  }
  // A side panel that is a card itself (no task pane inside).
  return host.offsetWidth > 0 && !pane ? host : null;
}

/** What `root`'s floating cards cover of `viewport` now. */
export function measureOfficeTaskPaneCover(
  viewport: HTMLElement,
  root: ParentNode,
): OfficeTaskPaneCover {
  const hosts = root.querySelectorAll<HTMLElement>(
    `[${OFFICE_TASK_PANE_OVERLAY_ATTRIBUTE}="left"], [${OFFICE_TASK_PANE_OVERLAY_ATTRIBUTE}="right"]`,
  );
  if (hosts.length === 0) return NO_OFFICE_TASK_PANE_COVER;
  const cards: Array<{ edge: OfficeTaskPaneOverlayEdge; box: Box }> = [];
  for (const host of Array.from(hosts)) {
    const card = shownCardOf(host);
    if (!card) continue;
    const edge = host.getAttribute(OFFICE_TASK_PANE_OVERLAY_ATTRIBUTE) as OfficeTaskPaneOverlayEdge;
    cards.push({ edge, box: card.getBoundingClientRect() });
  }
  if (cards.length === 0) return NO_OFFICE_TASK_PANE_COVER;
  const rect = viewport.getBoundingClientRect();
  const scale = viewport.offsetWidth > 0 ? rect.width / viewport.offsetWidth : 1;
  return officeTaskPaneCoverOf(rect, cards, scale);
}

function readPx(style: CSSStyleDeclaration, name: string): number {
  const value = Number.parseFloat(style.getPropertyValue(name));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * The cover published on `element` or on its nearest ancestor that carries
 * it (useOfficeTaskPaneCover writes it inline on the editor root and its
 * viewport). Read from inline styles only, so a caret or an active cell can
 * ask on every move without a style recalculation.
 */
export function readOfficeTaskPaneCover(
  element: Element | null | undefined,
): OfficeTaskPaneCover {
  for (
    let node: Element | null = element ?? null;
    node;
    node = node.parentElement
  ) {
    const style = (node as HTMLElement).style as CSSStyleDeclaration | undefined;
    if (!style) continue;
    const left = style.getPropertyValue(OFFICE_TASK_PANE_COVER_LEFT_VARIABLE);
    const right = style.getPropertyValue(OFFICE_TASK_PANE_COVER_RIGHT_VARIABLE);
    if (!left && !right) continue;
    return { left: readPx(style, OFFICE_TASK_PANE_COVER_LEFT_VARIABLE), right: readPx(style, OFFICE_TASK_PANE_COVER_RIGHT_VARIABLE) };
  }
  return NO_OFFICE_TASK_PANE_COVER;
}

function writeCover(element: HTMLElement, cover: OfficeTaskPaneCover): void {
  const write = (name: string, value: number) => {
    const next = value > 0 ? `${value}px` : "";
    if (element.style.getPropertyValue(name) === next) return;
    if (next) element.style.setProperty(name, next);
    else element.style.removeProperty(name);
  };
  write(OFFICE_TASK_PANE_COVER_LEFT_VARIABLE, cover.left);
  write(OFFICE_TASK_PANE_COVER_RIGHT_VARIABLE, cover.right);
}

/**
 * Keeps the cover of `root`'s floating cards over `viewport` published on
 * both (see the module notes) while they open, close, change width, move
 * off the edge, or the window is resized. `onChange` hears every new value
 * (after it is published) and every resize of the viewport, for an editor
 * that keeps room in its own layout.
 */
export function useOfficeTaskPaneCover({
  root,
  viewport,
  onChange,
}: {
  readonly root: HTMLElement | null;
  /** The element that scrolls the content (defaults to the root). */
  readonly viewport?: HTMLElement | null;
  readonly onChange?: (cover: OfficeTaskPaneCover) => void;
}): void {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  const target = viewport ?? root;
  useEffect(() => {
    if (!root || !target || typeof window === "undefined") return;
    let frame = 0;
    let settleTimer = 0;
    let last: OfficeTaskPaneCover = NO_OFFICE_TASK_PANE_COVER;
    let lastWidth = -1;
    // The editor root grows with its content (a long document's pages laid
    // out one pass after another): only its width moves what the cards
    // cover. The viewport and the cards are measured on any resize.
    const rootWidths = new WeakMap<Element, number>();
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver((entries) => {
            let changed = false;
            for (const entry of entries) {
              if (entry.target !== root || root === target) {
                changed = true;
                continue;
              }
              const width = entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;
              if (rootWidths.get(root) !== width) changed = true;
              rootWidths.set(root, width);
            }
            if (changed) schedule();
          });
    const childObserver =
      typeof MutationObserver === "undefined" ? null : new MutationObserver(() => schedule());
    const attributeObserver =
      typeof MutationObserver === "undefined" ? null : new MutationObserver(() => schedule());
    let watched: HTMLElement[] = [];
    const watchHosts = () => {
      const hosts = Array.from(
        root.querySelectorAll<HTMLElement>(`[${OFFICE_TASK_PANE_OVERLAY_ATTRIBUTE}]`),
      );
      if (hosts.length === watched.length && hosts.every((host, index) => host === watched[index])) {
        return;
      }
      for (const host of watched) resizeObserver?.unobserve(host);
      watched = hosts;
      childObserver?.disconnect();
      attributeObserver?.disconnect();
      for (const host of hosts) {
        resizeObserver?.observe(host);
        // A slot added or removed; a pane brought forward or hidden; the
        // host moved off the edge.
        childObserver?.observe(host, { childList: true });
        attributeObserver?.observe(host, {
          attributes: true,
          subtree: true,
          attributeFilter: ["hidden", OFFICE_TASK_PANE_OVERLAY_ATTRIBUTE],
        });
      }
    };
    const measure = () => {
      frame = 0;
      if (!root.isConnected || !target.isConnected) return;
      watchHosts();
      const cover = measureOfficeTaskPaneCover(target, root);
      writeCover(root, cover);
      if (target !== root) writeCover(target, cover);
      // The editor hears a new cover, and a viewport resized under the same
      // one (what the cover hides of the content depends on both).
      const width = target.clientWidth;
      if (cover.left === last.left && cover.right === last.right && width === lastWidth) return;
      last = cover;
      lastWidth = width;
      onChangeRef.current?.(cover);
    };
    function schedule() {
      if (!frame) frame = window.requestAnimationFrame(measure);
      // Once more after a pane's entrance or a card's slide has settled.
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        if (!frame) frame = window.requestAnimationFrame(measure);
      }, 360);
    }
    measure();
    resizeObserver?.observe(target);
    if (target !== root) resizeObserver?.observe(root);
    // Hosts that mount later (a pane moved out of its tab group).
    const rootObserver =
      typeof MutationObserver === "undefined" ? null : new MutationObserver(() => {
        const count = root.querySelectorAll(`[${OFFICE_TASK_PANE_OVERLAY_ATTRIBUTE}]`).length;
        if (count !== watched.length) schedule();
      });
    rootObserver?.observe(root, { childList: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer);
      resizeObserver?.disconnect();
      childObserver?.disconnect();
      attributeObserver?.disconnect();
      rootObserver?.disconnect();
      window.removeEventListener("resize", schedule);
      writeCover(root, NO_OFFICE_TASK_PANE_COVER);
      if (target !== root) writeCover(target, NO_OFFICE_TASK_PANE_COVER);
    };
  }, [root, target]);
}

/**
 * How much room a scroller that centres its content keeps at each side for
 * the cards floating over its edges, in CSS px. The content stays centred
 * where it is; only when a card would cover part of it does the scroller
 * keep this much padding at both sides and scroll sideways, so the content's
 * start scrolls out from under a left card and its end from under a right
 * one. 0: the content is clear of every card.
 *
 * `startInset` / `endInset` are the scroller's insets from the viewport's
 * left and right edges (0 when it is the viewport), `width` its width and
 * `contentWidth` the width of the row it centres, all in the viewport's
 * CSS px.
 */
export function officeTaskPaneRoom(input: {
  readonly cover: OfficeTaskPaneCover;
  readonly startInset: number;
  readonly endInset: number;
  readonly width: number;
  readonly contentWidth: number;
}): number {
  const { cover, startInset, endInset, width, contentWidth } = input;
  if (cover.left <= 0 && cover.right <= 0) return 0;
  // Where the centred row sits with no room kept.
  const slack = Math.max(0, (width - contentWidth) / 2);
  if (cover.left <= startInset + slack && cover.right <= endInset + slack) return 0;
  // Enough at either end of the scroll to clear that end's card.
  return Math.ceil(Math.max(0, cover.left - startInset, cover.right - endInset));
}

/** Children measured for the row a scroller centres (a long PDF's pages are
 * all alike: the first ones say how wide the row is). */
const ROOM_ROW_SAMPLE = 40;

/**
 * Keeps `officeTaskPaneRoom` on a scroller that centres its content: the
 * room goes to `variable` on `holder` (the editor's CSS turns it into the
 * scroller's inline padding, and lets it scroll sideways while `attribute`
 * is set), and the scroller's own scroll takes up what the room moves the
 * content by, so nothing moves on screen.
 */
export function keepOfficeTaskPaneRoom({
  scroller,
  viewport,
  cover,
  holder,
  variable,
  attribute,
}: {
  readonly scroller: HTMLElement;
  readonly viewport: HTMLElement;
  readonly cover: OfficeTaskPaneCover;
  readonly holder: HTMLElement;
  readonly variable: string;
  readonly attribute: string;
}): void {
  const win = scroller.ownerDocument.defaultView;
  if (!win) return;
  const current = Number.parseFloat(holder.style.getPropertyValue(variable));
  const kept = Number.isFinite(current) && current > 0 ? current : 0;
  // No card covers the viewport and no room is kept: the room is 0 again,
  // whatever the row measures (nothing is read, nothing written).
  if (kept === 0 && cover.left <= 0 && cover.right <= 0) return;
  const port = viewport.getBoundingClientRect();
  const scale = viewport.offsetWidth > 0 ? port.width / viewport.offsetWidth : 1;
  if (!(scale > 0)) return;
  // The row the scroller centres: its in-flow children, as laid out now
  // (the room is padding around the row, so the row's width does not
  // depend on it).
  let first = Number.POSITIVE_INFINITY;
  let last = Number.NEGATIVE_INFINITY;
  let anchor: HTMLElement | null = null;
  let sampled = 0;
  for (const child of Array.from(scroller.children)) {
    if (sampled >= ROOM_ROW_SAMPLE) break;
    if (!(child instanceof HTMLElement) || child.getClientRects().length === 0) continue;
    const position = win.getComputedStyle(child).position;
    if (position === "absolute" || position === "fixed") continue;
    const box = child.getBoundingClientRect();
    if (box.width <= 0) continue;
    sampled += 1;
    anchor ??= child;
    first = Math.min(first, box.left);
    last = Math.max(last, box.right);
  }
  if (!anchor || !(last > first)) return;
  const rect = scroller.getBoundingClientRect();
  const room = officeTaskPaneRoom({
    cover,
    startInset: Math.max(0, (rect.left - port.left) / scale),
    endInset: Math.max(0, (port.right - rect.right) / scale),
    width: rect.width / scale,
    contentWidth: (last - first) / scale,
  });
  if (room === kept) return;
  const before = anchor.getBoundingClientRect().left;
  if (room > 0) {
    holder.style.setProperty(variable, `${room}px`);
    holder.setAttribute(attribute, "");
  } else {
    holder.style.removeProperty(variable);
    holder.removeAttribute(attribute);
  }
  const after = anchor.getBoundingClientRect().left;
  if (room > 0 && after !== before) scroller.scrollLeft += (after - before) / scale;
}
