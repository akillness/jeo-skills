/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  OFFICE_BULLET_STYLE_GLYPHS,
  OFFICE_BULLET_STYLE_TYPES,
  type OfficeBulletStyleType,
} from "../../../../lib/office-list-catalog";

/**
 * Word/WPS bullet-list GLYPH styles — the mirror of the ordered-list numbering
 * style menu (see listNumbering.ts), but for the unordered (bullet) list.
 *
 * A bullet list carries a `bulletStyle` attr that selects which glyph its item
 * markers render with. The DEFAULT ("disc") is the browser's native solid round
 * bullet — a list with no attribute is byte-for-byte the historical rendering.
 *
 * This module is the SINGLE SOURCE OF TRUTH for the style whitelist and the
 * glyph each style renders, so the extension-provided CSS variable and the
 * DOCX exporter agree on what glyph a given style means.
 *
 * PURE: string lookups only, no DOM, no TipTap runtime.
 */

/**
 * The bullet glyph styles. `disc` is the native default (no attribute emitted).
 * The others map to a concrete Unicode glyph below — chosen to match the bullets
 * Word/WPS offer in the "Bullets" gallery (round/square/diamond marks, arrows,
 * checks, stars, triangles and an en-dash).
 */
export const BULLET_STYLE_GLYPHS = OFFICE_BULLET_STYLE_GLYPHS;

export type BulletStyleType = OfficeBulletStyleType;

export const BULLET_STYLE_TYPES = OFFICE_BULLET_STYLE_TYPES;

/** The native bullet (browser's `list-style-type: disc`). */
export const DEFAULT_BULLET_STYLE: BulletStyleType = "disc";

const BULLET_STYLE_SET = new Set<string>(BULLET_STYLE_TYPES);
const BULLET_STYLE_BY_GLYPH = new Map<string, BulletStyleType>(
  BULLET_STYLE_TYPES.map((style) => [BULLET_STYLE_GLYPHS[style], style]),
);

/** Coerce an untrusted attr value to a known {@link BulletStyleType}. */
export function normalizeBulletStyle(value: unknown): BulletStyleType {
  return typeof value === "string" && BULLET_STYLE_SET.has(value)
    ? (value as BulletStyleType)
    : DEFAULT_BULLET_STYLE;
}

/**
 * The Unicode glyph each bullet style renders as the item marker. `disc` returns
 * the native bullet "•" (used by the export; on screen the native marker is kept
 * for `disc` by emitting NO attribute). All glyphs are fixed, developer-authored
 * characters — never interpolated with user input — so there is no injection
 * surface when they reach CSS `content` or the export. PURE.
 */
export function bulletGlyph(style: BulletStyleType): string {
  return BULLET_STYLE_GLYPHS[normalizeBulletStyle(style)];
}

/**
 * Resolve the exact single-glyph marker stored in Word's `<w:lvlText>` back to
 * its durable editor style. Unknown, malformed and multi-character markers are
 * deliberately not authenticated as a known gallery choice.
 */
export function bulletStyleForGlyph(value: unknown): BulletStyleType | null {
  if (typeof value !== "string" || Array.from(value).length !== 1) return null;
  return BULLET_STYLE_BY_GLYPH.get(value) ?? null;
}

/**
 * The paragraph whose `::before` paints its list item's gallery bullet or
 * number (styles/note-editor.css): the first paragraph of an item of a list
 * carrying a glyph style or a numbering scheme, unless the item is a
 * page-split tail. Word lays that marker out as text on the paragraph's first
 * line, so it is an inline box of that line, never a box of its own height.
 */
export const LIST_MARKER_HOST_SELECTOR =
  ':is(ul[data-bullet-style], ol[data-list-style]) > li:not([data-page-split-item-continuation="true"]) > p:first-of-type';

/** Whether this paragraph's `::before` paints an imported Word list's own
 * marker (note-editor.css: the first paragraph of a docs-native-list-indent
 * item the gallery does not style -- the default bullet, a number the
 * measured label does not carry). Checked by hand: jsdom rejects the
 * stylesheet's `:is()` selector list. */
export function isNativeListMarkerHost(element: Element): boolean {
  const item = element.parentElement;
  const list = item?.parentElement;
  if (element.tagName !== "P" || !item || !list || item.tagName !== "LI") return false;
  if (item.querySelector(":scope > p") !== element) return false;
  if (!item.classList.contains("docs-native-list-indent__item") ||
    item.classList.contains("docs-native-list-indent__item--continued") ||
    item.getAttribute("data-docs-numbering-marker-host") === "true" ||
    item.getAttribute("data-page-split-item-continuation") === "true") return false;
  if (!list.classList.contains("docs-native-list-indent")) return false;
  if (list.tagName === "OL") return !list.hasAttribute("data-list-style");
  return list.tagName === "UL" && !list.hasAttribute("data-bullet-style") && !list.hasAttribute("data-bullet-picture");
}

/**
 * The OOXML `<w:numFmt w:val>` for a bullet list is always "bullet"; the glyph
 * itself rides the `<w:lvlText>`. Exposed for symmetry with listNumbering's
 * numFmtForLevel and so the exporter has a single place to read it. PURE.
 */
export function bulletNumFmt(): "bullet" {
  return "bullet";
}
