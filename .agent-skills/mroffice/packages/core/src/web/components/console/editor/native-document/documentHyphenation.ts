/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Document-wide automatic hyphenation (`word/settings.xml` / `w:autoHyphenation`).
 *
 * This is intentionally a strict boolean instead of a CSS approximation or a
 * visible marker. Word owns the final line-breaking decision; MRNote preserves
 * the setting and exports it to both DOCX paths.
 */
export function normalizeAutoHyphenation(value: unknown): boolean {
  return value === true;
}

/**
 * Layout > Hyphenation > Hyphenation Options as the document states them
 * (server twin `document_docx_hyphenation_options`): the zone in twips, the
 * consecutive-hyphen limit (0: no limit) and `hyphenateCaps: false` for
 * Word's "Hyphenate words in CAPS" off. A setting left out is Word's
 * default: a 0.25" zone, no limit, capitals hyphenated.
 */
export interface HyphenationOptions {
  readonly zoneTwips?: number;
  readonly consecutiveLimit?: number;
  readonly hyphenateCaps?: false;
}

export const WORD_DEFAULT_HYPHENATION_ZONE_TWIPS = 360;
const MAX_ZONE_TWIPS = 31_680;
const MAX_CONSECUTIVE_LIMIT = 32_767;

export function normalizeHyphenationOptions(value: unknown): HyphenationOptions | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some((key) => !["zoneTwips", "consecutiveLimit", "hyphenateCaps"].includes(key))) return null;
  const out: { zoneTwips?: number; consecutiveLimit?: number; hyphenateCaps?: false } = {};
  if (raw.zoneTwips !== undefined && raw.zoneTwips !== null) {
    if (!Number.isInteger(raw.zoneTwips) || (raw.zoneTwips as number) < 0 || (raw.zoneTwips as number) > MAX_ZONE_TWIPS) return null;
    out.zoneTwips = raw.zoneTwips as number;
  }
  if (raw.consecutiveLimit !== undefined && raw.consecutiveLimit !== null) {
    if (
      !Number.isInteger(raw.consecutiveLimit) ||
      (raw.consecutiveLimit as number) < 0 ||
      (raw.consecutiveLimit as number) > MAX_CONSECUTIVE_LIMIT
    ) {
      return null;
    }
    out.consecutiveLimit = raw.consecutiveLimit as number;
  }
  if (raw.hyphenateCaps !== undefined && raw.hyphenateCaps !== null) {
    if (raw.hyphenateCaps !== false) return null;
    out.hyphenateCaps = false;
  }
  return Object.keys(out).length > 0 ? out : null;
}

