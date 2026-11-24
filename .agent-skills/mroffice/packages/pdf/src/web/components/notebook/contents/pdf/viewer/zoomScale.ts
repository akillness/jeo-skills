/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
export const MIN_SCALE = 0.5;
// 640% — safe now that zoom changes anchor the scroll position and page
// canvases cap their backing pixels (lib/pdf/zoom-anchor.ts). Mirrors
// PDF_MAX_SCALE in lib/pdf/view-modes.ts.
export const MAX_SCALE = 6.4;
export const SCALE_STEP = 0.2;















export function dodgeIntegerScale(scale: number): number {
  const nearest = Math.round(scale);
  if (nearest >= 1 && Math.abs(scale - nearest) < 0.001) {
    return nearest + 0.0001;
  }
  return scale;
}
