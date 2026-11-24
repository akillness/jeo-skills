/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Pure geometry for the ribbon's single-strip overflow behaviour.
 *
 * The ribbon band renders as ONE horizontal strip (WPS-style). When the
 * hosting window is narrower than the strip's content the band scrolls
 * horizontally; chevron buttons at either end page the scroll position.
 * These helpers hold the arithmetic (arrow visibility + scroll stepping) so
 * it stays unit-testable without a DOM.
 */

export interface RibbonScrollMetrics {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

export interface RibbonOverflowState {
  canScrollLeft: boolean;
  canScrollRight: boolean;
}

/** How far one chevron click travels, in px (about two command groups). */
export const RIBBON_SCROLL_STEP = 240;

/**
 * Sub-pixel scroll positions (zoomed displays) make exact comparisons flap;
 * anything within this tolerance of an edge counts as AT the edge.
 */
export const RIBBON_SCROLL_EPSILON = 1;

/**
 * Arrow visibility from live scroller metrics: the left arrow shows once the
 * strip has scrolled away from its start, the right arrow while more content
 * remains. A strip that fits entirely (scrollWidth <= clientWidth) shows no
 * arrows at all.
 */
export function computeRibbonOverflow(
  metrics: RibbonScrollMetrics,
): RibbonOverflowState {
  const maxScrollLeft = Math.max(0, metrics.scrollWidth - metrics.clientWidth);
  if (maxScrollLeft <= RIBBON_SCROLL_EPSILON) {
    return { canScrollLeft: false, canScrollRight: false };
  }
  // dir="rtl" scrollers report scrollLeft as 0 → -max (Chromium/WebKit);
  // normalize to distance-from-the-start so the math is direction-agnostic.
  // (Latent today — the shell ships LTR locales only.)
  const fromStart = Math.abs(metrics.scrollLeft);
  return {
    canScrollLeft: fromStart > RIBBON_SCROLL_EPSILON,
    canScrollRight: fromStart < maxScrollLeft - RIBBON_SCROLL_EPSILON,
  };
}

/**
 * The next scrollLeft after one chevron click, clamped to the strip's valid
 * scroll range so repeated clicks settle exactly at either edge.
 */
export function nextRibbonScrollLeft(
  metrics: RibbonScrollMetrics,
  direction: "left" | "right",
  step: number = RIBBON_SCROLL_STEP,
): number {
  const maxScrollLeft = Math.max(0, metrics.scrollWidth - metrics.clientWidth);
  const target =
    direction === "left"
      ? metrics.scrollLeft - step
      : metrics.scrollLeft + step;
  return Math.min(maxScrollLeft, Math.max(0, target));
}
