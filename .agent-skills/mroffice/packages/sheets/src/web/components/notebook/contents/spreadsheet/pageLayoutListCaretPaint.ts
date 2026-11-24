/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/** A colour an SVG stroke attribute reads as CSS does: hex, rgb()/rgba(), hsl()/hsla() or a keyword. */
const PLAIN_COLOR = /^(#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([\d\s.,%/-]+\)|[a-z]+)$/i;

/**
 * Page Layout's list caret at rest, painted as the button's background: the
 * menu chevron the caret used to hold as an icon element (the house
 * "menu.chevron.down" glyph, 12px, a 1.4px non-scaling stroke in the
 * caret's ink), placed where that icon sat (the button's left edge, centred
 * on its height). Drawn this way it matches the icon pixel for pixel; a mask
 * over the ink differs by a rounding step. Null for an ink an image cannot
 * name (a variable or a mix): the caret's stylesheet chevron draws that one.
 */
export function pageLayoutListCaretBackground(ink: string): string | null {
  const color = ink.trim();
  if (!PLAIN_COLOR.test(color) || color.toLowerCase() === "currentcolor") return null;
  const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' " +
    `stroke='${color}' stroke-linecap='round' stroke-linejoin='round'>` +
    "<path d='M5.8 9.2 12 15.4l6.2-6.2' stroke-width='2.8'/></svg>";
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 0 50% / 12px 12px no-repeat`;
}
