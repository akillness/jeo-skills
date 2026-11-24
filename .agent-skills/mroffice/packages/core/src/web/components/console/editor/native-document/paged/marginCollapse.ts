/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * CSS 2.1 §8.3.1 margin collapsing, read from computed styles.
 *
 * getComputedStyle reports a block's OWN margins, while the browser places
 * its border box by the margin its descendants collapse through that edge.
 * Pagination measures heights between border boxes, so every place that has
 * to re-add a margin a page seam dropped (the edge of a sheet, the join of
 * two continuation fragments) must read the collapsed value, not the own one.
 */

/** Adjoining margins: positive margins take the max, negative margins the
 * min, mixed signs add. */
export function collapseMargins(a: number, b: number): number {
  if (a >= 0 && b >= 0) return Math.max(a, b);
  if (a < 0 && b < 0) return Math.min(a, b);
  return a + b;
}

export function marginsCollapseThrough(css: CSSStyleDeclaration, edge: "top" | "bottom"): boolean {
  if (css.display !== "block" && css.display !== "list-item") return false;
  if (css.overflowY !== "visible" && css.overflowY !== "clip") return false;
  if (css.position === "absolute" || css.position === "fixed") return false;
  if (css.float !== "none") return false;
  if ((Number.parseFloat(edge === "top" ? css.paddingTop : css.paddingBottom) || 0) > 0) return false;
  if ((Number.parseFloat(edge === "top" ? css.borderTopWidth : css.borderBottomWidth) || 0) > 0) return false;
  return true;
}

export function firstInFlowChild(element: HTMLElement, edge: "top" | "bottom"): HTMLElement | null {
  const children = Array.from(element.children) as HTMLElement[];
  if (edge === "bottom") children.reverse();
  for (const child of children) {
    const css = getComputedStyle(child);
    if (css.display === "none" || css.position === "absolute" || css.position === "fixed" || css.float !== "none") continue;
    if (css.display !== "block" && css.display !== "list-item" && css.display !== "flow-root" && css.display !== "flex" && css.display !== "grid" && css.display !== "table") return null;
    return child;
  }
  return null;
}

/** A block's authored margin at one edge, when a caller knows it better
 * than the live computed style does (the page-edge rules zero the painted
 * margins of a sheet's first and last blocks and of their collapse chains). */
export type AuthoredMarginPx = (element: HTMLElement, edge: "top" | "bottom") => number | undefined;

function ownMarginPx(element: HTMLElement, edge: "top" | "bottom", authored?: AuthoredMarginPx): number {
  const known = authored?.(element, edge);
  if (known !== undefined) return known;
  const css = getComputedStyle(element);
  return Number.parseFloat(edge === "top" ? css.marginTop : css.marginBottom) || 0;
}

/**
 * The margin a block's descendants collapse through its own `edge`: the
 * browser positions the block's border box by max(own, inner) while
 * getComputedStyle only reports own. A node-view wrapper whose first child
 * carries margin-top (the footnote separator) is the canonical case.
 */
export function collapsedInnerMarginPx(
  element: HTMLElement,
  edge: "top" | "bottom",
  authored?: AuthoredMarginPx,
): number {
  let inner = 0;
  let current: HTMLElement | null = element;
  for (let depth = 0; depth < 8 && current; depth += 1) {
    const css = getComputedStyle(current);
    if (!marginsCollapseThrough(css, edge)) break;
    const child = firstInFlowChild(current, edge);
    if (!child) break;
    inner = collapseMargins(inner, ownMarginPx(child, edge, authored));
    current = child;
  }
  return inner;
}

/** The elements whose margins collapse through `element`'s `edge`, outermost
 * first; the same walk collapsedInnerMarginPx takes. */
export function marginCollapseChain(element: HTMLElement, edge: "top" | "bottom"): HTMLElement[] {
  const chain: HTMLElement[] = [];
  let current: HTMLElement | null = element;
  for (let depth = 0; depth < 8 && current; depth += 1) {
    if (!marginsCollapseThrough(getComputedStyle(current), edge)) break;
    const child = firstInFlowChild(current, edge);
    if (!child) break;
    chain.push(child);
    current = child;
  }
  return chain;
}

/** A block's effective margin at `edge`: its own margin collapsed with the
 * chain its in-flow descendants push through that edge. */
export function collapsedEdgeMarginPx(
  element: HTMLElement,
  edge: "top" | "bottom",
  authored?: AuthoredMarginPx,
): number {
  return collapseMargins(ownMarginPx(element, edge, authored), collapsedInnerMarginPx(element, edge, authored));
}
