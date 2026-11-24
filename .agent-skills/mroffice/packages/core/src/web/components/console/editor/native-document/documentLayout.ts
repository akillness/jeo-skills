/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Pure helpers for two bounded document layout features — multi-column flow and
 * per-paragraph text direction (Word/WPS parity) — kept free of any
 * TipTap/React imports so the whitelist normalization can be unit-tested in
 * isolation and reused by:
 *   - the DocumentPageSetup top-node extension (parse/render of the persisted
 *     `columns` doc attr) and DocumentFormatting (the per-block `dir` global
 *     attribute),
 *   - the DocumentToolbar columns select + RTL toggle, and
 *   - NoteEditor, which paints the chosen column count onto the editing surface.
 *
 * Both inputs come from a closed whitelist, so neither a malicious page nor a
 * stray import can inject arbitrary CSS through these: `columns` is one of the
 * integers 1/2/3 and `dir` is one of the strings "ltr"/"rtl". Everything else
 * falls back to the default (single column / left-to-right).
 */

/** Allowed multi-column counts (Word/WPS parity: 1 / 2 / 3 columns). */
export const COLUMN_COUNT_VALUES = [1, 2, 3] as const;
export type ColumnCount = (typeof COLUMN_COUNT_VALUES)[number];

/** Allowed text directions. */
export const TEXT_DIRECTION_VALUES = ["ltr", "rtl"] as const;
export type TextDirection = (typeof TEXT_DIRECTION_VALUES)[number];

/**
 * Allowed document-level writing modes (Word/WPS 文字方向 / 竖排).
 *   - "horizontal-tb": the default left-to-right, top-to-bottom flow.
 *   - "vertical-rl": traditional CJK vertical text — characters run top-to-bottom
 *     and columns advance right-to-left (CSS `writing-mode: vertical-rl`).
 */
export const WRITING_MODE_VALUES = ["horizontal-tb", "vertical-rl"] as const;
export type WritingMode = (typeof WRITING_MODE_VALUES)[number];

/**
 * Allowed document-level manuscript-grid (稿纸 / squared paper) modes — the
 * character-cell background WPS Writer / Word draw for CJK manuscript writing.
 *   - "off": the default — no manuscript grid (plain page surface).
 *   - "grid": full character cells (a box per CJK glyph), the classic 稿纸 look.
 *   - "lines": baseline rules only (horizontal row lines, no vertical cell walls).
 */
export const MANUSCRIPT_GRID_VALUES = ["off", "grid", "lines"] as const;
export type ManuscriptGrid = (typeof MANUSCRIPT_GRID_VALUES)[number];

/** The defaults applied when a document carries no explicit layout. */
export const DEFAULT_COLUMN_COUNT: ColumnCount = 1;
export const DEFAULT_TEXT_DIRECTION: TextDirection = "ltr";
export const DEFAULT_WRITING_MODE: WritingMode = "horizontal-tb";
export const DEFAULT_MANUSCRIPT_GRID: ManuscriptGrid = "off";

/** Column gutter in CSS pixels (Word's default ~0.5in column spacing). */
export const COLUMN_GAP_PX = 48;

/** Default for the between-columns vertical rule (Word "Line between" 分栏分隔线). */
export const DEFAULT_COLUMN_SEPARATOR = false;

/**
 * The fixed CSS `column-rule` shorthand painted between newspaper columns when
 * the "Line between" toggle is on. Word draws its 分栏分隔线 as a thin solid
 * black (automatic colour) hairline, like a default paragraph border. Kept as
 * a constant token — never user-driven — so it can never carry an
 * injected/unbounded length or color.
 */
export const COLUMN_RULE = "1px solid #000000";

/**
 * The nominal CJK character-box edge (CSS px) one manuscript-grid cell spans. A
 * full-width CJK glyph is square at roughly the font's em size, but manuscript
 * paper leaves breathing room around each glyph, so the cell is a fixed comfortable
 * box (Word/WPS 稿纸 default ~ a 24px em rendered in a slightly larger cell). Kept
 * as a constant (not user-driven) so the repeating background can never carry an
 * unbounded/injected length.
 */
export const MANUSCRIPT_CELL_PX = 28;

/** Stroke width (CSS px) of the manuscript-grid cell rules. */
export const MANUSCRIPT_GRID_LINE_PX = 1;

const COLUMN_COUNT_SET = new Set<number>(COLUMN_COUNT_VALUES);
const TEXT_DIRECTION_SET = new Set<string>(TEXT_DIRECTION_VALUES);
const WRITING_MODE_SET = new Set<string>(WRITING_MODE_VALUES);
const MANUSCRIPT_GRID_SET = new Set<string>(MANUSCRIPT_GRID_VALUES);

/**
 * Coerce an arbitrary value into a whitelisted column count (1/2/3), or `null`
 * when it is not in the whitelist. Numbers that round to a whitelisted integer
 * are accepted; strings must be a clean numeric token (Number-parseable in
 * full), so a CSS-injection payload like `"2; background:red"` is rejected
 * rather than truncated to `2` by parseInt. Anything else (NaN, out-of-range,
 * junk strings, objects) returns `null`.
 */
export function normalizeColumns(value: unknown): ColumnCount | null {
  let numeric: number;
  if (typeof value === "number") {
    numeric = value;
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    // Number("") is 0; reject empty (and any string with trailing junk, which
    // Number() turns into NaN) explicitly so it cannot resolve to a count.
    numeric = trimmed === "" ? Number.NaN : Number(trimmed);
  } else {
    return null;
  }
  if (!Number.isFinite(numeric)) return null;
  const rounded = Math.round(numeric);
  return COLUMN_COUNT_SET.has(rounded) ? (rounded as ColumnCount) : null;
}

/**
 * Coerce an arbitrary value into a whitelisted text direction, or `null` when it
 * is not in the whitelist. Case-insensitive and trims surrounding whitespace.
 */
export function normalizeDir(value: unknown): TextDirection | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return TEXT_DIRECTION_SET.has(normalized)
    ? (normalized as TextDirection)
    : null;
}

/**
 * Like {@link normalizeColumns} but always resolves to a concrete value,
 * falling back to {@link DEFAULT_COLUMN_COUNT} for an unset/invalid input. Used
 * at the rendering edge where the surface must always have a column count.
 */
export function resolveColumns(value: unknown): ColumnCount {
  return normalizeColumns(value) ?? DEFAULT_COLUMN_COUNT;
}

/**
 * Like {@link normalizeDir} but always resolves to a concrete value, falling
 * back to {@link DEFAULT_TEXT_DIRECTION} for an unset/invalid input.
 */
export function resolveDir(value: unknown): TextDirection {
  return normalizeDir(value) ?? DEFAULT_TEXT_DIRECTION;
}

/**
 * Inline-style object (camelCased, React-friendly) for the editing surface's
 * multi-column flow. A single column returns an empty object (no CSS) so the
 * default surface is untouched; 2/3 columns return only `columnCount` and a
 * numeric px `columnGap`, both drawn from the whitelist, so they can never carry
 * injected CSS.
 */
export function documentColumnsCss(value: unknown): {
  columnCount?: number;
  columnGap?: string;
} {
  const count = resolveColumns(value);
  if (count <= 1) return {};
  return {
    columnCount: count,
    columnGap: `${COLUMN_GAP_PX}px`,
  };
}

/**
 * Coerce an arbitrary value into the between-columns separator boolean (Word
 * "Line between" 分栏分隔线). Accepts a real boolean, the strings
 * "true"/"false"/"1"/"0" (case-insensitive, trimmed) — the shapes a persisted
 * `data-*` attribute can carry — and resolves everything else (numbers other
 * than 0/1, junk strings, objects, null/undefined) to the
 * {@link DEFAULT_COLUMN_SEPARATOR} (off). PURE.
 */
export function resolveColumnSeparator(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
    return DEFAULT_COLUMN_SEPARATOR;
  }
  if (value === 1) return true;
  if (value === 0) return false;
  return DEFAULT_COLUMN_SEPARATOR;
}

/**
 * Inline-style object (camelCased, React-friendly) for the vertical rule drawn
 * between newspaper columns (Word "Line between" 分栏分隔线). Returns an empty
 * object — so the surface is byte-for-byte untouched — UNLESS the separator is
 * on AND the document is genuinely multi-column (2/3): a rule is meaningless
 * with a single column, so a single-column doc never paints one regardless of
 * the flag. When emitted it is ONLY the fixed {@link COLUMN_RULE} shorthand (a
 * whitelisted token), so it can never carry injected CSS.
 */
export function documentColumnSeparatorCss(
  columns: unknown,
  separator: unknown,
): { columnRule?: string } {
  if (!resolveColumnSeparator(separator)) return {};
  if (resolveColumns(columns) <= 1) return {};
  return { columnRule: COLUMN_RULE };
}

/**
 * Coerce an arbitrary value into a whitelisted writing mode, or `null` when it is
 * not in the whitelist. Case-insensitive and trims surrounding whitespace. The
 * legacy alias "vertical" (no `-rl`) and the truthy boolean form used by an older
 * toggle both resolve to "vertical-rl"; everything else returns `null`.
 */
export function normalizeWritingMode(value: unknown): WritingMode | null {
  if (value === true) return "vertical-rl";
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "vertical") return "vertical-rl";
  return WRITING_MODE_SET.has(normalized)
    ? (normalized as WritingMode)
    : null;
}

/**
 * Like {@link normalizeWritingMode} but always resolves to a concrete value,
 * falling back to {@link DEFAULT_WRITING_MODE} for an unset/invalid input.
 */
export function resolveWritingMode(value: unknown): WritingMode {
  return normalizeWritingMode(value) ?? DEFAULT_WRITING_MODE;
}

/**
 * Whether the document should render top-to-bottom, right-to-left (竖排).
 * Convenience predicate over {@link normalizeWritingMode} for the toolbar toggle
 * and the surface painter.
 */
export function isVerticalWritingMode(value: unknown): boolean {
  return normalizeWritingMode(value) === "vertical-rl";
}

/**
 * Whether draft page estimates can be painted for the current writing mode.
 * Their geometry is block-height based, which is only meaningful for the
 * horizontal block axis. Vertical text advances along the horizontal axis, so
 * keeping the guides visible there would promise page boundaries we cannot
 * calculate correctly.
 */
export function shouldPaintDraftPageGuides(
  enabled: unknown,
  writingMode: unknown,
): boolean {
  return enabled === true && !isVerticalWritingMode(writingMode);
}

/**
 * Inline-style object (camelCased, React-friendly) that flips the editing surface
 * to vertical text. Returns an empty object for the default horizontal flow (so
 * the surface is byte-for-byte untouched), else `{ writingMode: "vertical-rl" }`
 * — a single whitelisted token that can never carry injected CSS.
 */
export function documentWritingModeCss(value: unknown): {
  writingMode?: "vertical-rl";
} {
  return isVerticalWritingMode(value) ? { writingMode: "vertical-rl" } : {};
}

/**
 * Coerce an arbitrary value into a whitelisted manuscript-grid mode, or `null`
 * when it is not in the whitelist. Case-insensitive and trims surrounding
 * whitespace. The legacy boolean form used by an older toggle resolves to "grid"
 * (true) / "off" (false); everything else returns `null`.
 */
export function normalizeManuscriptGrid(value: unknown): ManuscriptGrid | null {
  if (value === true) return "grid";
  if (value === false) return "off";
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return MANUSCRIPT_GRID_SET.has(normalized)
    ? (normalized as ManuscriptGrid)
    : null;
}

/**
 * Like {@link normalizeManuscriptGrid} but always resolves to a concrete value,
 * falling back to {@link DEFAULT_MANUSCRIPT_GRID} for an unset/invalid input.
 */
export function resolveManuscriptGrid(value: unknown): ManuscriptGrid {
  return normalizeManuscriptGrid(value) ?? DEFAULT_MANUSCRIPT_GRID;
}

/**
 * Whether the document should paint visible manuscript paper. OOXML
 * `w:docGrid w:type="lines"` is a baseline/layout constraint; Word does not
 * mean "draw horizontal rules" by storing it. Only the editor's explicit full
 * manuscript-paper mode paints a background.
 */
export function isManuscriptGridEnabled(value: unknown): boolean {
  const mode = normalizeManuscriptGrid(value);
  return mode === "grid";
}

/**
 * The geometric metrics of one manuscript-grid cell (in CSS px) for a given mode.
 * `cellPx` is the square character-box edge; `linePx` the rule stroke width;
 * `vertical` is true when the "grid" mode paints both axes' rules (full cells),
 * false when only horizontal rules would be drawn. `lines` intentionally
 * returns null: imported Word baseline grids affect layout metrics, not page
 * decoration. PURE — no DOM, no React, so it is unit-testable in isolation.
 */
export function manuscriptGridMetrics(value: unknown): {
  cellPx: number;
  linePx: number;
  vertical: boolean;
} | null {
  const mode = normalizeManuscriptGrid(value);
  if (mode !== "grid") return null;
  return {
    cellPx: MANUSCRIPT_CELL_PX,
    linePx: MANUSCRIPT_GRID_LINE_PX,
    vertical: true,
  };
}

/**
 * Inline-style object (camelCased, React-friendly) that paints a repeating
 * character-cell grid background on the editing surface (稿纸 / squared paper).
 * Returns an empty object for the default "off" mode (so the surface is
 * byte-for-byte untouched). Otherwise it emits ONLY a CSS `linearGradient`
 * `backgroundImage` plus a numeric-px `backgroundSize`, both built from the fixed
 * {@link MANUSCRIPT_CELL_PX} / {@link MANUSCRIPT_GRID_LINE_PX} constants and the
 * `currentColor`-derived rule color — so it can never carry an injected/unbounded
 * value. Only the explicit "grid" mode draws rules. Imported OOXML "lines"
 * stays in the document model for round-trip fidelity but paints nothing.
 */
export function manuscriptGridCss(value: unknown): {
  backgroundImage?: string;
  backgroundSize?: string;
} {
  const metrics = manuscriptGridMetrics(value);
  if (!metrics) return {};
  const { cellPx, linePx } = metrics;
  // A faint ink rule (semi-transparent) so the cells read as manuscript paper
  // without overpowering the text. Fixed token — never user-driven.
  const rule = "rgba(120, 120, 120, 0.35)";
  const horizontal = `repeating-linear-gradient(to bottom, ${rule} 0, ${rule} ${linePx}px, transparent ${linePx}px, transparent ${cellPx}px)`;
  const vertical = `repeating-linear-gradient(to right, ${rule} 0, ${rule} ${linePx}px, transparent ${linePx}px, transparent ${cellPx}px)`;
  return {
    backgroundImage: metrics.vertical ? `${horizontal}, ${vertical}` : horizontal,
    backgroundSize: `${cellPx}px ${cellPx}px`,
  };
}
