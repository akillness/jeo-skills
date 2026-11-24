/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Pure helpers for the table-row `rowHeight` attribute (Word/WPS row height /
 * "Distribute Rows Evenly"). Kept free of any TipTap/React imports so the
 * normalization and the parse/render round-trip can be unit-tested in isolation
 * and reused by the TableRow extension attribute.
 *
 * `rowHeight` is a positive pixel height stored on a `tableRow` node.
 * `rowHeightRule` preserves Word's `w:trHeight/@w:hRule`: `atLeast` may grow
 * with content, while `exact` requests a fixed authored height. A row with no
 * height carries neither attribute and remains byte-for-byte historical.
 */

/** Smallest row height (px) the editor accepts. */
export const MIN_ROW_HEIGHT_PX = 8;
/** Largest row height (px) the editor accepts (a sane cap; Word allows huge). */
export const MAX_ROW_HEIGHT_PX = 2000;
/** Native twip cap matching the editor's bounded pixel range. */
export const MAX_ROW_HEIGHT_TWIPS = MAX_ROW_HEIGHT_PX * 15;

export const TABLE_ROW_HEIGHT_RULES = ["atLeast", "exact"] as const;
export type TableRowHeightRule = (typeof TABLE_ROW_HEIGHT_RULES)[number];

/** Strict Word row-height rule parser. An omitted rule resolves at the writer. */
export function normalizeTableRowHeightRule(
  value: unknown,
): TableRowHeightRule | null {
  return value === "atLeast" || value === "exact" ? value : null;
}

/** Preserve an authored native `w:trHeight/@w:val` without px rounding. */
export function normalizeTableRowHeightTwips(value: unknown): number | null {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  if (
    !Number.isInteger(numeric) ||
    numeric < 1 ||
    numeric > MAX_ROW_HEIGHT_TWIPS
  )
    return null;
  return numeric;
}

/**
 * Coerce an arbitrary value into a row height in [MIN, MAX] px, or `null` when it
 * is absent / non-finite / out of range. Accepts a number, a numeric string, or a
 * `"<n>px"` string (so a parsed inline `min-height` round-trips). PURE.
 */
export function normalizeTableRowHeight(value: unknown): number | null {
  let n: number | null = null;
  if (typeof value === "number" && Number.isFinite(value)) {
    n = value;
  } else if (typeof value === "string") {
    const trimmed = value.trim().replace(/px$/i, "");
    if (trimmed !== "") {
      const parsed = Number.parseFloat(trimmed);
      if (Number.isFinite(parsed)) n = parsed;
    }
  }
  if (n === null) return null;
  const rounded = Math.round(n);
  if (rounded < MIN_ROW_HEIGHT_PX || rounded > MAX_ROW_HEIGHT_PX) return null;
  return rounded;
}

/**
 * Render the canonical data payload and a stylesheet-free visual projection.
 * A table row's CSS `height` is already a minimum (the row still grows with
 * its content), which is Word's "At least"; browsers ignore `min-height` on
 * a row, so it would render nothing. `exact` uses the same declaration;
 * note-editor.css clips an exact row's top-aligned cells to it (the cells'
 * content stops growing the row), as Word does. `splitPiece` marks one page's half of a row that
 * pagination split: an "At least" height describes the whole row, so the
 * halves carry the data but no floor each. Returns an empty object for an
 * invalid/unset height. PURE.
 */
export function tableRowHeightAttributes(
  value: unknown,
  rule?: unknown,
  nativeTwips?: unknown,
  splitPiece = false,
): Record<string, string> {
  const height = normalizeTableRowHeight(value);
  if (height === null) return {};
  const normalizedRule = normalizeTableRowHeightRule(rule);
  const twips = normalizeTableRowHeightTwips(nativeTwips);
  const cssHeight =
    twips === null ? height : Math.round((twips / 15) * 1000) / 1000;
  return {
    "data-row-height": String(height),
    ...(twips !== null ? { "data-row-height-twips": String(twips) } : {}),
    ...(normalizedRule
      ? { "data-row-height-rule": normalizedRule }
      : {}),
    ...(splitPiece && normalizedRule !== "exact"
      ? {}
      : { style: `height:${cssHeight}px` }),
  };
}
