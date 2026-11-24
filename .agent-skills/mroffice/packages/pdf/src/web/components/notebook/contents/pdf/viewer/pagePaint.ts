/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A page's first paint: its settle bar ends (office-motion.css
 * `.office-settle-shimmer`) and its content fades up with the shared sheet
 * entrance for a virtualized fill (`.office-page-enter--filled`). Both marks
 * are set on the element itself, once: the attribute is not React's, so a
 * re-render keeps it, and a repaint (zoom, rotation) never replays the fade.
 */
/** A short name for the bytes a page shows, safe to leave in the DOM (the
 * byte-generation key itself is a signed URL). Equal keys, equal tokens. */
export function pdfPaintedSourceToken(byteGenerationKey: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < byteGenerationKey.length; index += 1) {
    hash ^= byteGenerationKey.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${byteGenerationKey.length.toString(36)}-${(hash >>> 0).toString(36)}`;
}

export function markPdfPageSettled(page: HTMLElement | null): void {
  if (!page || page.getAttribute("data-office-settled") === "true") return;
  page.setAttribute("data-office-settled", "true");
  page.classList.add("office-page-enter", "office-page-enter--filled");
}
