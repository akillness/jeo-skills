"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type RefObject, useLayoutEffect, useState } from "react";

const PAGE_SELECTOR = ".pdf-viewer__page";
const MARGIN = 4;









export function useKeepPopoverInsidePage(
  ref: RefObject<HTMLElement | null>,
  anchorBelow: boolean,
  revision: unknown,
): { shiftX: number; below: boolean } {
  const [placement, setPlacement] = useState({ shiftX: 0, below: anchorBelow });
  useLayoutEffect(() => {
    const popover = ref.current;
    const page = popover?.closest<HTMLElement>(PAGE_SELECTOR);
    const anchor = popover?.parentElement;
    if (!popover || !page || !anchor) {
      setPlacement((current) =>
        current.shiftX === 0 && current.below === anchorBelow
          ? current
          : { shiftX: 0, below: anchorBelow },
      );
      return;
    }
    const pageRect = page.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const width = popover.offsetWidth;
    const height = popover.offsetHeight;
    const naturalLeft = anchorRect.left;
    const overflowRight = naturalLeft + width - (pageRect.right - MARGIN);
    const room = naturalLeft - (pageRect.left + MARGIN);
    const shiftX = overflowRight > 0 ? -Math.min(overflowRight, Math.max(0, room)) : 0;
    const fitsBelow = anchorRect.bottom + MARGIN + height <= pageRect.bottom - MARGIN;
    const fitsAbove = anchorRect.top - MARGIN - height >= pageRect.top + MARGIN;
    const below = anchorBelow ? fitsBelow || !fitsAbove : !fitsAbove && fitsBelow;
    setPlacement((current) =>
      Math.abs(current.shiftX - shiftX) < 0.5 && current.below === below
        ? current
        : { shiftX, below },
    );
  }, [anchorBelow, ref, revision]);
  return placement;
}
