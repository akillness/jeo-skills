/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/** A text box's rectangle on the page, in page pixels. */
export interface TextBoxHitRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TextBoxHitMargin {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

















export function textBoxHitMargins(
  rects: ReadonlyArray<TextBoxHitRect | null>,
  margins: ReadonlyArray<number>,
): TextBoxHitMargin[] {
  return rects.map((rect, index) => {
    const margin = margins[index] ?? 0;
    const out = { left: margin, top: margin, right: margin, bottom: margin };
    if (!rect) return out;
    const right = rect.left + rect.width;
    const bottom = rect.top + rect.height;
    rects.forEach((other, otherIndex) => {
      if (!other || otherIndex === index) return;
      const otherRight = other.left + other.width;
      const otherBottom = other.top + other.height;
      // Only a neighbour the margins could reach across: it lies alongside
      // this box within both boxes' margins.
      const reach = margin + (margins[otherIndex] ?? 0);
      const overlapsAcross = other.left < right + reach && otherRight > rect.left - reach;
      const overlapsAlong = other.top < bottom + reach && otherBottom > rect.top - reach;
      if (overlapsAcross && otherBottom <= rect.top) {
        out.top = Math.min(out.top, (rect.top - otherBottom) / 2);
      }
      if (overlapsAcross && other.top >= bottom) {
        out.bottom = Math.min(out.bottom, (other.top - bottom) / 2);
      }
      if (overlapsAlong && otherRight <= rect.left) {
        out.left = Math.min(out.left, (rect.left - otherRight) / 2);
      }
      if (overlapsAlong && other.left >= right) {
        out.right = Math.min(out.right, (other.left - right) / 2);
      }
    });
    return out;
  });
}
