"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useMemo, useRef, type TouchEvent } from "react";

/** How far a finger moves before it counts as a drag rather than a tap. */
const DRAG_SLOP_PX = 8;

/** Fields that raise the on-screen keyboard. */
const TEXT_ENTRY =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="file"]), textarea, [contenteditable]:not([contenteditable="false"])';

export interface KeyboardDismissHandlers {
  onTouchStart: (event: TouchEvent<HTMLElement>) => void;
  onTouchMove: (event: TouchEvent<HTMLElement>) => void;
}

/**
 * A finger that starts scrolling a panel while one of its text fields has
 * focus closes the keyboard first, as native iOS forms do (a scroll view's
 * keyboard dismiss "on drag"). Without it iPad Safari keeps bringing the
 * focused field back into view: content swiped to snaps back to the caret.
 * A drag that starts inside the focused field (selecting or scrolling its
 * text) leaves it alone. Spread the handlers on the panel's root.
 */
export function useKeyboardDismissOnDrag(): KeyboardDismissHandlers {
  const start = useRef<{
    x: number;
    y: number;
    target: EventTarget | null;
  } | null>(null);
  return useMemo(
    () => ({
      onTouchStart(event) {
        const touch = event.touches[0];
        start.current =
          event.touches.length === 1 && touch
            ? { x: touch.clientX, y: touch.clientY, target: event.target }
            : null;
      },
      onTouchMove(event) {
        const from = start.current;
        if (!from) return;
        const touch = event.touches[0];
        if (
          !touch ||
          Math.hypot(touch.clientX - from.x, touch.clientY - from.y) <
            DRAG_SLOP_PX
        ) {
          return;
        }
        start.current = null;
        const active = document.activeElement;
        if (!(active instanceof HTMLElement) || !active.matches(TEXT_ENTRY)) {
          return;
        }
        if (!event.currentTarget.contains(active)) return;
        if (from.target instanceof Node && active.contains(from.target)) return;
        active.blur();
      },
    }),
    [],
  );
}
