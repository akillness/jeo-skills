/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { wheelKeptByFloatingSurface } from "../../lib/popover-fit";
import { createWheelGestureLatch } from "../../lib/wheel-gesture";

/**
 * Turns a plain mouse wheel over a sideways-scrolling ribbon row (the tab
 * list, the quick actions) into a sideways move. A trackpad swipe is left to
 * the browser, which scrolls it off the main thread; a gesture begun by hand
 * stays by hand to its end, sideways ticks included (lib/wheel-gesture: one
 * scroller moved by hand and by the browser within one gesture parted
 * Safari's screen from its hit testing -- after a swipe left the tab row
 * part-way, the pointer on Layout lit Design). A menu opened from inside
 * the row keeps its own wheel (lib/popover-fit). Returns the unsubscribe.
 */
export function attachRibbonSidewaysWheel(
  element: HTMLElement,
  options: { onWheel?: () => void } = {},
): () => void {
  const gesture = createWheelGestureLatch<boolean>();
  const onWheel = (event: WheelEvent) => {
    options.onWheel?.();
    if (event.ctrlKey || event.metaKey || !event.cancelable) return;
    if (wheelKeptByFloatingSurface(event, element)) return;
    if (element.scrollWidth <= element.clientWidth + 1) return;
    const byHand = gesture.hold(event, () => event.deltaX === 0 && event.deltaY !== 0);
    if (!byHand) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientWidth : 1;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    event.preventDefault();
    element.scrollLeft += delta * unit;
  };
  element.addEventListener("wheel", onWheel, { passive: false });
  return () => element.removeEventListener("wheel", onWheel);
}
