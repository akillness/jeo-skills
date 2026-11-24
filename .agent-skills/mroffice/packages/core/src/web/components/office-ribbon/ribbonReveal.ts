/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { screenScaleOf } from "../../lib/css-zoom";
/**
 * Reveal a ribbon control along the ribbon's own (horizontal) scroll only.
 *
 * `scrollIntoView({ block: "nearest" })` also scrolls every vertical
 * ancestor, and for a control inside a ribbon that is sticky at the top of
 * the document's scroll box Chrome scrolls to the ribbon's LAYOUT position,
 * not where it is drawn: the page jumped by the distance scrolled whenever a
 * key tip or an arrow key moved focus along the ribbon. Only the horizontal
 * strips between the control and the document body are scrolled here, by
 * the least amount that shows the control, the way "nearest" would.
 */
export function revealRibbonControlInline(element: HTMLElement | null | undefined): void {
  if (!element?.isConnected || typeof element.getBoundingClientRect !== "function") return;
  let ancestor = element.parentElement;
  while (ancestor && ancestor !== document.body) {
    const style = getComputedStyle(ancestor);
    const scrollsX =
      /(auto|scroll|overlay)/.test(style.overflowX) && ancestor.scrollWidth > ancestor.clientWidth + 1;
    if (scrollsX) {
      const box = ancestor.getBoundingClientRect();
      const target = element.getBoundingClientRect();
      // Screen distances in the strip's own scroll units: Touch mode zooms
      // the ribbon, and a screen pixel is then less than one of its own.
      const scale = screenScaleOf(ancestor);
      if (target.left < box.left) ancestor.scrollLeft -= (box.left - target.left) / scale;
      else if (target.right > box.right) ancestor.scrollLeft += (target.right - box.right) / scale;
    }
    ancestor = ancestor.parentElement;
  }
}
