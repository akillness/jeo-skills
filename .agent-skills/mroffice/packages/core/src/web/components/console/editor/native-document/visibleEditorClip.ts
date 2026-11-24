/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/** A client rect in viewport px; a zero width or height is a line. */
export interface VisibleEditorBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** The editor chrome that stays stuck over the top of the page's scroller
 * (the ribbon, inside the same scroller as the page). */
const STICKY_EDITOR_CHROME_SELECTOR = ".note-editor-toolbar-stack, [data-sticky-editor-chrome]";

/** `box` cut to what the editor's clipping ancestors (its scroller, the
 * window it sits in) leave visible, below the ribbon stuck over the
 * scroller; null when none of it is. A line (zero width or height) stays
 * whole on its thin side while it lies inside. */
export function clipToVisibleEditor<T extends VisibleEditorBox>(dom: HTMLElement, box: T): T | null {
  let left = box.left;
  let top = box.top;
  let right = box.left + box.width;
  let bottom = box.top + box.height;
  const view = dom.ownerDocument.defaultView;
  let nearestScroller = true;
  for (let element = dom.parentElement; element && element !== dom.ownerDocument.body; element = element.parentElement) {
    const style = view?.getComputedStyle(element);
    if (!style) break;
    const clipsX = style.overflowX !== "visible";
    const clipsY = style.overflowY !== "visible";
    if (!clipsX && !clipsY) continue;
    if (nearestScroller && /(auto|scroll)/.test(style.overflowY)) {
      nearestScroller = false;
      // The ribbon is sticky inside the page's own scroller, so the scroller
      // does not hide what scrolls under it: the page shows only below it.
      // It comes before the page in the scroller, so the lookup is short.
      const chrome = element.querySelector(STICKY_EDITOR_CHROME_SELECTOR);
      if (chrome && !chrome.contains(dom) && view?.getComputedStyle(chrome).position === "sticky") {
        top = Math.max(top, chrome.getBoundingClientRect().bottom);
      }
    }
    const rect = element.getBoundingClientRect();
    if (clipsX) {
      left = Math.max(left, rect.left + element.clientLeft);
      right = Math.min(right, rect.left + element.clientLeft + element.clientWidth);
    }
    if (clipsY) {
      top = Math.max(top, rect.top + element.clientTop);
      bottom = Math.min(bottom, rect.top + element.clientTop + element.clientHeight);
    }
    if (right < left || bottom < top) return null;
    if ((box.width > 0 && right === left) || (box.height > 0 && bottom === top)) return null;
  }
  return { ...box, left, top, width: right - left, height: bottom - top };
}
