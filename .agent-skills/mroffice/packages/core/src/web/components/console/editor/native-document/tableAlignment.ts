/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * PURE helpers for TABLE ON-PAGE ALIGNMENT (Word/WPS "表格属性 → 对齐方式":
 * left / center / right). This is the position of the WHOLE table within the page
 * content width — distinct from the text alignment INSIDE a cell.
 *
 *   - "left"   — the table hugs the left margin (Word's default → no attribute, so
 *                an untouched table is byte-for-byte unchanged).
 *   - "center" — the table is centred (CSS `margin-left/right: auto`).
 *   - "right"  — the table hugs the right margin (CSS `margin-left: auto`).
 *
 * Kept free of any TipTap/React import so the whitelist + CSS mapping can be unit-
 * tested and shared by the Table node extension (parse/render), the toolbar
 * buttons, and the DOCX exporter (`<w:jc>` in the table's `<w:tblPr>`).
 *
 * SECURITY: only the three whitelisted values are ever stored or rendered, on both
 * parse and render — a forged `data-table-align` or imported markup can never push
 * arbitrary CSS into the inline `style` the renderer emits.
 */

/** Whitelisted table on-page alignment values. */
export const TABLE_ALIGN_VALUES = ["left", "center", "right"] as const;
export type TableAlign = (typeof TABLE_ALIGN_VALUES)[number];

/** Maximum non-negative left indent exposed by the bounded table model. */
export const MAX_TABLE_INDENT_PX = 2_112;

const TABLE_ALIGN_SET = new Set<string>(TABLE_ALIGN_VALUES);

/**
 * Normalize an arbitrary value into a whitelisted {@link TableAlign}, or null.
 * "left" (the default) maps to null so the attribute stays ABSENT on an
 * untouched table — only "center"/"right" are stored. Word's `start`/`end` (and a
 * stray `justify`) fold sensibly.
 */
export function normalizeTableAlign(value: unknown): TableAlign | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  if (raw === "start" || raw === "left" || raw === "justify") return null;
  if (raw === "end") return "right";
  return TABLE_ALIGN_SET.has(raw) && raw !== "left"
    ? (raw as TableAlign)
    : null;
}

/**
 * The inline CSS a non-default table alignment renders as. "center" sets both
 * horizontal margins to auto; "right" sets only the left margin to auto. Returns
 * "" for the default (left / null) so no style is emitted. The string is fixed,
 * developer-authored CSS — never interpolated with user input.
 */
export function tableAlignStyle(value: unknown): string {
  const align = normalizeTableAlign(value);
  if (align === "center") return "margin-left: auto; margin-right: auto";
  if (align === "right") return "margin-left: auto; margin-right: 0";
  return "";
}

/** A direct left-table indent in CSS pixels, or null for Word's zero default.
 * Negative: the table stands out into the left margin, as Word's Indent from
 * left allows (Google Docs exports state one for most tables). */
export function normalizeTableIndentPx(value: unknown): number | null {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(numeric)) return null;
  const rounded = Math.round(numeric);
  return rounded !== 0 && Math.abs(rounded) <= MAX_TABLE_INDENT_PX ? rounded : null;
}

/** Exact native twips paired with an unchanged visible indent. */
export function normalizeTableIndentTwips(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric !== 0 && Math.abs(numeric) <= 31_680
    ? numeric
    : null;
}

export function tableIndentStyle(value: unknown): string {
  const indent = normalizeTableIndentPx(value);
  return indent === null ? "" : `margin-left: ${indent}px; margin-right: 0`;
}

/**
 * Map a {@link TableAlign} to the OOXML `<w:jc w:val>` value for a table's
 * `<w:tblPr>`, or null for the default (left). Word accepts left/center/right in
 * a table's justification.
 */
export function tableAlignJustification(
  value: unknown,
): "center" | "right" | null {
  const align = normalizeTableAlign(value);
  return align === "center" ? "center" : align === "right" ? "right" : null;
}
