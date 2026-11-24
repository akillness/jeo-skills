/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Pure helpers for cell-level table formatting (shading / borders / text +
 * vertical alignment / text direction) surfaced in the document toolbar when the selection is
 * inside a table. Kept free of any TipTap/React imports so the whitelist
 * normalization, the CSS-injection rejection, and the parse/render round-trip
 * can be unit-tested in isolation and reused by BOTH the TableCell/TableHeader
 * extension attributes and the toolbar UI.
 *
 * Security model mirrors the inline-image controls and the text/highlight color
 * path: every persisted value comes from a closed whitelist (border/align/
 * vertical-align keywords) or the strict shared color normalizer
 * (`normalizeCssColor`, which canonicalizes to #rrggbb and rejects anything that
 * is not a single pure color). So neither a malicious page, a pasted/imported
 * table, nor a stray AI instruction can inject arbitrary CSS through a cell.
 */

import {
  normalizeCellShadingPattern,
  shadingPatternImage,
} from "./tableShading";
import { normalizeCssColor } from "../extensions/TextStyling";
import { cellBordersAttributes } from "./tableBorders";
import { wordAutoTextAttributes } from "./wordAutoTextColor";
import { matchAllBehind } from "../../../../lib/regexp-behind";

/** Curated cell shading swatches (Word/WPS-style soft fills). */
export const CELL_SHADING_VALUES = [
  "#f3f4f6",
  "#e5e7eb",
  "#fee2e2",
  "#ffedd5",
  "#fef9c3",
  "#dcfce7",
  "#dbeafe",
  "#f3e8ff",
] as const;

/** Allowed cell border presets. "none" hides borders; "outline" rings the cell. */
export const CELL_BORDER_VALUES = ["all", "none", "outline"] as const;
export type CellBorderStyle = (typeof CELL_BORDER_VALUES)[number];

/** Allowed horizontal text alignment for a cell's contents. */
export const CELL_TEXT_ALIGN_VALUES = ["left", "center", "right"] as const;
export type CellTextAlign = (typeof CELL_TEXT_ALIGN_VALUES)[number];

/** Allowed vertical alignment for a cell's contents. */
export const CELL_VERTICAL_ALIGN_VALUES = ["top", "middle", "bottom"] as const;
export type CellVerticalAlign = (typeof CELL_VERTICAL_ALIGN_VALUES)[number];

/**
 * Native Word table-cell text-flow values (`w:tcPr/w:textDirection`). The
 * contextual command cycles in this order: horizontal, 90°, 270°. Keeping the
 * OOXML tokens in the editor model avoids a second translation vocabulary at
 * the import/export and original-package patchback boundaries.
 */
export const CELL_TEXT_DIRECTION_VALUES = ["lrTb", "tbRl", "btLr"] as const;
export type CellTextDirection = (typeof CELL_TEXT_DIRECTION_VALUES)[number];

/**
 * Allowed internal cell margin / padding presets, in CSS px (Word/WPS «表格属性
 * → 单元格 → 选项 → 单元格边距» / `<w:tcMar>` / `<w:tblCellMar>`). A small closed
 * set of whole-pixel values rendered as uniform CSS `padding`. `0` is the
 * tight/no-padding option; the rest are the common comfortable spacings. A
 * closed numeric whitelist, so neither a forged attr nor a pasted/imported table
 * can inject an arbitrary length into the inline style.
 */
export const CELL_MARGIN_VALUES = [0, 2, 4, 6, 8, 12] as const;
export type CellMargin = (typeof CELL_MARGIN_VALUES)[number];

/** Word stores each `<w:tcMar>` edge independently; missing edges inherit. */
export const CELL_MARGIN_SIDES = ["top", "right", "bottom", "left"] as const;
export type CellMarginSide = (typeof CELL_MARGIN_SIDES)[number];
export const MAX_CELL_MARGIN = 96;
export const MAX_TABLE_CELL_SPACING = 96;
export type CellMargins = Readonly<Partial<Record<CellMarginSide, number>>>;

const CELL_MARGIN_SET = new Set<number>(CELL_MARGIN_VALUES);

/**
 * Upper bound on a persisted cell-formula string. Word-style cell formulas are
 * short directional aggregates / small A1 arithmetic; this cap simply rejects an
 * absurd pasted/forged value before it rides through the schema.
 */
export const MAX_CELL_FORMULA_LENGTH = 512;

/**
 * The exact numeric picture switches the document-table evaluator and both
 * DOCX writers can reproduce. `null` is Word's General display. Keeping this a
 * closed catalog prevents a forged field switch from being silently accepted
 * and then exported with different semantics.
 */
export const CELL_FORMULA_NUMBER_FORMAT_VALUES = [
  "0",
  "0.00",
  "#,##0",
  "#,##0.00",
  "0%",
  "0.00%",
] as const;
export type CellFormulaNumberFormat =
  (typeof CELL_FORMULA_NUMBER_FORMAT_VALUES)[number];

const CELL_FORMULA_NUMBER_FORMAT_SET = new Set<string>(
  CELL_FORMULA_NUMBER_FORMAT_VALUES,
);
const SUPPORTED_CELL_FORMULA_FUNCTION_SET = new Set([
  "ABS",
  "AND",
  "SUM",
  "AVERAGE",
  "COUNT",
  "DEFINED",
  "FALSE",
  "IF",
  "INT",
  "PRODUCT",
  "MIN",
  "MAX",
  "MOD",
  "NOT",
  "OR",
  "ROUND",
  "SIGN",
  "TRUE",
]);
const SUPPORTED_CELL_FORMULA_DIRECTION_SET = new Set([
  "ABOVE",
  "BELOW",
  "LEFT",
  "RIGHT",
]);

function cellFormulaFunctionsSupported(formula: string): boolean {
  const body = formula.slice(1);
  if (!/^[\p{L}\p{N}_+\-*/().,:\s|=<>]+$/u.test(body)) return false;
  // A name not after a letter, digit or "_" (tested in code: Safari before
  // 16.4 cannot compile a lookbehind).
  for (const match of matchAllBehind(
    body,
    /([\p{L}_][\p{L}\p{N}_]*)(?![\p{L}\p{N}_])/gu,
    { char: /[\p{L}\p{N}_]/u, not: true },
  )) {
    const rawToken = match[1];
    const token = rawToken.toUpperCase();
    const tail = body.slice((match.index ?? 0) + match[1].length);
    if (/^\s*\(/.test(tail)) {
      if (!SUPPORTED_CELL_FORMULA_FUNCTION_SET.has(token)) return false;
      continue;
    }
    if (
      SUPPORTED_CELL_FORMULA_DIRECTION_SET.has(token) ||
      /^[A-Z]{1,3}[1-9][0-9]{0,6}$/.test(token)
    ) {
      continue;
    }
    // A bare, Word-legal identifier is a bookmark operand. Resolution stays
    // fail-closed in the evaluator: a missing/ambiguous bookmark renders #REF!
    // rather than being coerced to zero.
    if (!/^\p{L}[\p{L}\p{N}_]{0,39}$/u.test(rawToken)) return false;
  }
  return true;
}

const CELL_BORDER_SET = new Set<string>(CELL_BORDER_VALUES);
const CELL_TEXT_ALIGN_SET = new Set<string>(CELL_TEXT_ALIGN_VALUES);
const CELL_VERTICAL_ALIGN_SET = new Set<string>(CELL_VERTICAL_ALIGN_VALUES);

/** The CSS border applied for the "all"/"outline" presets. */
const CELL_BORDER_CSS = "1px solid #9ca3af";

/**
 * Coerce an arbitrary value into a canonical cell background color (#rrggbb) or
 * `null`. Routes through the SAME strict gate as text/highlight colors, so an
 * injection payload like `"#fff;background:url(x)"` is rejected outright — only a
 * single pure validated color is ever returned.
 */
export function normalizeCellBackgroundColor(value: unknown): string | null {
  return normalizeCssColor(value);
}

/**
 * Coerce an arbitrary value into one of the whitelisted border presets, or
 * `null` when it is not in the whitelist (case-insensitive, trimmed).
 */
export function normalizeCellBorderStyle(value: unknown): CellBorderStyle | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return CELL_BORDER_SET.has(normalized)
    ? (normalized as CellBorderStyle)
    : null;
}

/**
 * Coerce an arbitrary value into one of the whitelisted horizontal alignment
 * keywords, or `null` when it is not in the whitelist.
 */
export function normalizeCellTextAlign(value: unknown): CellTextAlign | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return CELL_TEXT_ALIGN_SET.has(normalized)
    ? (normalized as CellTextAlign)
    : null;
}

/**
 * Coerce an arbitrary value into one of the whitelisted vertical alignment
 * keywords, or `null` when it is not in the whitelist.
 */
export function normalizeCellVerticalAlign(
  value: unknown,
): CellVerticalAlign | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return CELL_VERTICAL_ALIGN_SET.has(normalized)
    ? (normalized as CellVerticalAlign)
    : null;
}

/** Closed, case-insensitive normalizer for native cell text-flow tokens. */
export function normalizeCellTextDirection(
  value: unknown,
): CellTextDirection | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "lrtb") return "lrTb";
  if (normalized === "tbrl") return "tbRl";
  if (normalized === "btlr") return "btLr";
  return null;
}

/**
 * Coerce an arbitrary value into one of the whitelisted cell-margin px presets,
 * or `null` when it is not usable. Accepts a number or a numeric string (e.g.
 * "4" or "4px" from a parsed `padding`); a value that is not exactly one of the
 * presets SNAPS to the nearest preset so an imported `<w:tcMar>` twip value
 * (converted to px) maps onto a supported padding rather than being dropped.
 * Non-finite / non-numeric input returns `null` (the cell keeps the table
 * default — no padding override).
 */
export function normalizeCellMargin(value: unknown): CellMargin | null {
  let n: number;
  if (typeof value === "number") {
    n = value;
  } else if (typeof value === "string") {
    // Strip a trailing "px" (and surrounding space) so a parsed `padding` works.
    // An unset CSS property reads as "" — that is no margin, not a 0 margin
    
    const text = value.trim().replace(/px$/i, "").trim();
    if (text === "") return null;
    n = Number(text);
  } else {
    return null;
  }
  if (!Number.isFinite(n) || n < 0) return null;
  if (CELL_MARGIN_SET.has(n)) return n as CellMargin;
  // Snap to the nearest whitelisted preset (ties → the smaller value).
  let best = CELL_MARGIN_VALUES[0] as number;
  let bestDelta = Math.abs(n - best);
  for (const preset of CELL_MARGIN_VALUES) {
    const delta = Math.abs(n - preset);
    if (delta < bestDelta) {
      best = preset;
      bestDelta = delta;
    }
  }
  return best as CellMargin;
}

/**
 * Normalize one authored cell-margin edge without snapping it to the legacy
 * preset ladder. Word's dialog accepts independent measurements, so exact
 * imported twip values need a bounded decimal representation to round-trip.
 */
export function normalizeCellMarginSide(value: unknown, preservePrecision = false): number | null {
  let numeric: number;
  if (typeof value === "number") {
    numeric = value;
  } else if (typeof value === "string") {
    const text = value.trim().replace(/px$/i, "").trim();
    // "" is an absent edge (it keeps inheriting), never an explicit 0.
    if (text === "") return null;
    numeric = Number(text);
  } else {
    return null;
  }
  if (
    !Number.isFinite(numeric) ||
    numeric < 0 ||
    numeric > MAX_CELL_MARGIN
  ) {
    return null;
  }
  return preservePrecision ? numeric : Math.round(numeric * 10) / 10;
}

export function normalizeTableCellSpacingPx(value: unknown): number | null {
  const spacing = normalizeCellMarginSide(value);
  return spacing !== null && spacing > 0 ? spacing : null;
}

export function normalizeTableCellSpacingTwips(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 && numeric <= 1_440
    ? numeric
    : null;
}

/** Expand a legacy uniform preset into Word's native four-edge shape. */
export function uniformCellMargins(margin: CellMargin): CellMargins {
  return {
    top: margin,
    right: margin,
    bottom: margin,
    left: margin,
  };
}

/**
 * Resolve either the historical uniform numeric attr or the native per-edge
 * object. A side omitted from the object remains omitted so it can inherit the
 * table default rather than being forged as zero.
 */
export function normalizeCellMargins(value: unknown): CellMargins | null {
  if (typeof value === "number" || typeof value === "string") {
    const legacy = normalizeCellMargin(value);
    return legacy === null ? null : uniformCellMargins(legacy);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const normalized: Partial<Record<CellMarginSide, number>> = {};
  for (const side of CELL_MARGIN_SIDES) {
    const alias = side === "left" ? "start" : side === "right" ? "end" : side;
    // Per-edge native values can represent an exact twip fraction (85 / 15).
    // Legacy presets and the cell-spacing control retain their own rules.
    const edge = normalizeCellMarginSide(source[side] ?? source[alias], true);
    if (edge !== null) normalized[side] = edge;
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
}

/**
 * A table's default cell margins, edge by edge: its own `tableCellMargin`,
 * else the margins an imported Word table inherits (`source.inheritedCellMargin`:
 * its style chain, then Word's built-in defaults). Null when neither exists,
 * so a table the editor created keeps its own look.
 */
export function tableDefaultCellMargins(tableAttrs: {
  readonly tableCellMargin?: unknown;
  readonly source?: unknown;
}): CellMargins | null {
  const own = normalizeCellMargins(tableAttrs.tableCellMargin);
  const inherited = tableInheritedCellMargins(tableAttrs);
  if (!inherited) return own;
  return own ? { ...inherited, ...own } : inherited;
}

/** The margins an imported Word table's cells get where the table declares
 * none; null for tables without that source fact. */
export function tableInheritedCellMargins(tableAttrs: {
  readonly source?: unknown;
}): CellMargins | null {
  const source = tableAttrs.source;
  return source && typeof source === "object" && !Array.isArray(source)
    ? normalizeCellMargins((source as Record<string, unknown>).inheritedCellMargin)
    : null;
}

/** Return the legacy preset only when all four explicit edges match it. */
export function uniformCellMarginPreset(value: unknown): CellMargin | null {
  const margins = normalizeCellMargins(value);
  if (!margins) return null;
  const first = margins.top;
  if (
    first === undefined ||
    margins.right !== first ||
    margins.bottom !== first ||
    margins.left !== first ||
    !CELL_MARGIN_SET.has(first)
  ) {
    return null;
  }
  return first as CellMargin;
}

/** Semantic equality after sanitization, including inherited missing edges. */
export function cellMarginsEqual(a: unknown, b: unknown): boolean {
  const left = normalizeCellMargins(a);
  const right = normalizeCellMargins(b);
  if (left === null || right === null) return left === right;
  return CELL_MARGIN_SIDES.every((side) => left[side] === right[side]);
}

/**
 * Read a cell's internal margin off a parsed DOM element, preferring the
 * explicit `data-cell-margin` attribute (what we render) and falling back to the
 * inline `padding` style for pasted/imported tables. Both paths funnel through
 * {@link normalizeCellMargin}, so a junk value snaps to a preset or drops.
 */
export function readCellMarginFromElement(
  element: { getAttribute(name: string): string | null; style?: { padding?: string } },
): CellMargin | null {
  const explicit = normalizeCellMargin(element.getAttribute("data-cell-margin"));
  if (explicit !== null) return explicit;
  return normalizeCellMargin(element.style?.padding);
}

/**
 * Read the native per-edge data payload, then fall back to the historical
 * uniform data/style forms. Individual CSS padding declarations are retained
 * independently so HTML paste/import does not collapse asymmetry either.
 */
export function readCellMarginsFromElement(element: {
  getAttribute(name: string): string | null;
  style?: {
    padding?: string;
    paddingTop?: string;
    paddingRight?: string;
    paddingBottom?: string;
    paddingLeft?: string;
  };
}): CellMargins | null {
  const serialized = element.getAttribute("data-cell-margins");
  if (serialized) {
    try {
      const explicit = normalizeCellMargins(JSON.parse(serialized));
      if (explicit) return explicit;
    } catch {
      // Fall through to the independently sanitized legacy/CSS projections.
    }
  }

  const legacy = normalizeCellMargin(element.getAttribute("data-cell-margin"));
  if (legacy !== null) return uniformCellMargins(legacy);

  const perEdge = normalizeCellMargins({
    top: element.style?.paddingTop,
    right: element.style?.paddingRight,
    bottom: element.style?.paddingBottom,
    left: element.style?.paddingLeft,
  });
  if (perEdge) return perEdge;

  const padding = normalizeCellMarginSide(element.style?.padding);
  return padding === null
    ? null
    : { top: padding, right: padding, bottom: padding, left: padding };
}

/**
 * Read a cell's background color off a parsed DOM element, preferring the
 * explicit `data-cell-bg` attribute (what we render) and falling back to the
 * inline `background-color` style for pasted/imported tables. Both paths are
 * re-validated through the strict color gate.
 */
export function readCellBackgroundColorFromElement(
  element: { getAttribute(name: string): string | null; style?: { backgroundColor?: string } },
): string | null {
  return (
    normalizeCellBackgroundColor(element.getAttribute("data-cell-bg")) ||
    normalizeCellBackgroundColor(element.style?.backgroundColor)
  );
}

/**
 * Read a cell's vertical alignment off a parsed DOM element, preferring the
 * explicit `data-cell-valign` attribute and falling back to the inline
 * `vertical-align` style. ("middle" maps both ways since CSS uses `middle`.)
 */
export function readCellVerticalAlignFromElement(
  element: { getAttribute(name: string): string | null; style?: { verticalAlign?: string } },
): CellVerticalAlign | null {
  return (
    normalizeCellVerticalAlign(element.getAttribute("data-cell-valign")) ||
    normalizeCellVerticalAlign(element.style?.verticalAlign)
  );
}

/** Read the canonical text-flow token rendered on a table cell. */
export function readCellTextDirectionFromElement(element: {
  getAttribute(name: string): string | null;
}): CellTextDirection | null {
  return normalizeCellTextDirection(
    element.getAttribute("data-cell-text-direction"),
  );
}

/**
 * renderHTML fragment for a cell background color: `data-cell-bg` (the canonical
 * attribute we own) plus an inline `background-color` so the shading survives a
 * stylesheet-less HTML export. Returns an empty object when the color is unset
 * or fails validation, so renderHTML emits nothing.
 */
export function cellBackgroundAttributes(
  value: unknown,
): { "data-cell-bg": string; style: string } | Record<string, never> {
  const color = normalizeCellBackgroundColor(value);
  if (color === null) return {};
  return { "data-cell-bg": color, style: `background-color:${color}` };
}

export const DOCUMENT_CELL_BACKGROUND_CSS_VARIABLE = "--document-cell-bg";

/**
 * Convert a schema-rendered cell shell into its live-editor projection.
 *
 * The schema keeps `background-color` for stylesheet-less HTML serialization,
 * but a live ProseMirror DOM flush would also treat that property as a generic
 * text highlight. The cell NodeView calls this before mounting/updating the
 * shell, so only the editor DOM uses the unambiguous custom-property token.
 */
export function projectCellBackgroundForEditor(
  element: HTMLElement,
): void {
  const color = normalizeCellBackgroundColor(
    element.getAttribute("data-cell-bg"),
  );
  element.style.removeProperty("background-color");
  if (color === null) {
    element.style.removeProperty(DOCUMENT_CELL_BACKGROUND_CSS_VARIABLE);
  } else {
    element.style.setProperty(DOCUMENT_CELL_BACKGROUND_CSS_VARIABLE, color);
  }
  if (element.style.length === 0) element.removeAttribute("style");
}

/**
 * renderHTML fragment for the border preset: a `data-cell-border` attribute
 * (consumed by CSS) plus an explicit inline border declaration so the chosen
 * preset survives without the surrounding stylesheet. "none" emits an explicit
 * `border:none`; "all"/"outline" emit a concrete 1px border. Returns an empty
 * object when unset.
 */
export function cellBorderAttributes(
  value: unknown,
): { "data-cell-border": CellBorderStyle; style: string } | Record<string, never> {
  const border = normalizeCellBorderStyle(value);
  if (border === null) return {};
  const style = border === "none" ? "border:none" : `border:${CELL_BORDER_CSS}`;
  return { "data-cell-border": border, style };
}

/**
 * renderHTML fragment for horizontal text alignment: `data-cell-align` plus an
 * inline `text-align` so the alignment survives a stylesheet-less export.
 */
export function cellTextAlignAttributes(
  value: unknown,
): { "data-cell-align": CellTextAlign; style: string } | Record<string, never> {
  const align = normalizeCellTextAlign(value);
  if (align === null) return {};
  return { "data-cell-align": align, style: `text-align:${align}` };
}

/**
 * renderHTML fragment for vertical alignment: `data-cell-valign` plus an inline
 * `vertical-align` so the alignment survives a stylesheet-less export.
 */
export function cellVerticalAlignAttributes(
  value: unknown,
): { "data-cell-valign": CellVerticalAlign; style: string } | Record<string, never> {
  const valign = normalizeCellVerticalAlign(value);
  if (valign === null) return {};
  return { "data-cell-valign": valign, style: `vertical-align:${valign}` };
}

/** Render the native text-flow token plus the closest safe CSS projection. */
export function cellTextDirectionAttributes(
  value: unknown,
):
  | { "data-cell-text-direction": CellTextDirection; style: string }
  | Record<string, never> {
  const direction = normalizeCellTextDirection(value);
  if (direction === null) return {};
  if (direction === "tbRl") {
    return {
      "data-cell-text-direction": direction,
      style: "writing-mode:vertical-rl;text-orientation:mixed;direction:ltr",
    };
  }
  if (direction === "btLr") {
    // Word's "Rotate all text 270°": the lines run bottom to top, the glyphs
    // turned anticlockwise -- CSS's sideways-lr. A right-to-left vertical-lr
    
    return {
      "data-cell-text-direction": direction,
      style: "writing-mode:sideways-lr;text-orientation:mixed;direction:ltr",
    };
  }
  return {
    "data-cell-text-direction": direction,
    style: "writing-mode:horizontal-tb;direction:ltr",
  };
}

/**
 * renderHTML fragment for the internal cell margin: `data-cell-margin` (the
 * canonical attribute we own) plus an inline uniform `padding` so the spacing
 * survives a stylesheet-less HTML export. Returns an empty object when the margin
 * is unset or fails validation, so renderHTML emits nothing — a cell without an
 * explicit margin is byte-for-byte today's.
 */
export function cellMarginAttributes(
  value: unknown,
): Record<string, string> {
  if (typeof value === "number" || typeof value === "string") {
    const legacy = normalizeCellMargin(value);
    if (legacy === null) return {};
    return {
      "data-cell-margin": String(legacy),
      style: `padding:${legacy}px`,
    };
  }
  const margins = normalizeCellMargins(value);
  if (margins === null) return {};
  const uniformPreset = uniformCellMarginPreset(margins);
  if (uniformPreset !== null) {
    return {
      "data-cell-margins": JSON.stringify(margins),
      "data-cell-margin": String(uniformPreset),
      style: `padding:${uniformPreset}px`,
    };
  }
  const style = CELL_MARGIN_SIDES.flatMap((side) => {
    const margin = margins[side];
    return margin === undefined ? [] : [`padding-${side}:${margin}px`];
  }).join(";");
  return {
    "data-cell-margins": JSON.stringify(margins),
    style,
  };
}

/**
 * Merge the cell-style render fragments (background, border, text-align,
 * vertical-align, text direction, internal margin) into a single attribute map + ONE inline-style
 * string for renderHTML. Folding everything into a single `style` key avoids
 * TipTap's style-merge dropping one declaration when multiple addAttributes each
 * emit their own `style`. Ordering is deterministic (background, border,
 * text-align, vertical-align, margin) so the output is stable for tests.
 * Empty/invalid inputs contribute nothing.
 */
export function mergeCellStyleAttributes(attrs: {
  backgroundColor?: unknown;
  borderStyle?: unknown;
  cellBorders?: unknown;
  textAlign?: unknown;
  verticalAlign?: unknown;
  textDirection?: unknown;
  cellMargin?: unknown;
  cellShading?: unknown;
}): Record<string, string> {
  const out: Record<string, string> = {};
  const styleParts: string[] = [];

  // Word's Shading pattern (w:shd w:val/w:color) over the cell's fill.
  const shading = normalizeCellShadingPattern(attrs.cellShading);
  if (shading) {
    out["data-cell-shading"] = JSON.stringify(shading);
    const image = shadingPatternImage(
      normalizeCellBackgroundColor(attrs.backgroundColor),
      shading,
    );
    if (image) styleParts.push(`background-image:${image}`);
  }

  const bg = cellBackgroundAttributes(attrs.backgroundColor);
  if ("data-cell-bg" in bg) {
    out["data-cell-bg"] = bg["data-cell-bg"];
    styleParts.push(bg.style);
    // Word's Automatic text colour contrasts with the cell's shading.
    Object.assign(out, wordAutoTextAttributes(bg["data-cell-bg"]));
  }

  const border = cellBorderAttributes(attrs.borderStyle);
  if ("data-cell-border" in border) {
    out["data-cell-border"] = border["data-cell-border"];
    styleParts.push(border.style);
  }

  // Native per-edge borders supersede the legacy all/outline/none shorthand
  // one edge at a time. The original OOXML tokens remain in the JSON data attr;
  // only the safe visual CSS projection is merged into this single style string.
  const perEdge = cellBordersAttributes(attrs.cellBorders);
  if ("data-cell-borders" in perEdge) {
    out["data-cell-borders"] = perEdge["data-cell-borders"];
    if (perEdge.style) styleParts.push(perEdge.style);
  }

  const textAlign = cellTextAlignAttributes(attrs.textAlign);
  if ("data-cell-align" in textAlign) {
    out["data-cell-align"] = textAlign["data-cell-align"];
    styleParts.push(textAlign.style);
  }

  const verticalAlign = cellVerticalAlignAttributes(attrs.verticalAlign);
  if ("data-cell-valign" in verticalAlign) {
    out["data-cell-valign"] = verticalAlign["data-cell-valign"];
    styleParts.push(verticalAlign.style);
  }

  const textDirection = cellTextDirectionAttributes(attrs.textDirection);
  if ("data-cell-text-direction" in textDirection) {
    out["data-cell-text-direction"] = textDirection["data-cell-text-direction"];
    styleParts.push(textDirection.style);
  }

  const margin = cellMarginAttributes(attrs.cellMargin);
  if ("data-cell-margins" in margin || "data-cell-margin" in margin) {
    if (margin["data-cell-margins"]) {
      out["data-cell-margins"] = margin["data-cell-margins"];
    }
    if (margin["data-cell-margin"]) {
      out["data-cell-margin"] = margin["data-cell-margin"];
    }
    styleParts.push(margin.style);
  }

  if (styleParts.length > 0) {
    out.style = styleParts.join(";");
  }
  return out;
}

/**
 * Coerce an arbitrary value into a canonical cell-formula string, or `null` when
 * it is not a formula. A formula is a `=`-prefixed string (after trimming) with
 * at least one more character, bounded to MAX_CELL_FORMULA_LENGTH, and stripped
 * of control bytes / tag-shaped markup so a pasted/imported/forged
 * `data-cell-formula` can never smuggle markup or break out of the attribute.
 * Comparison `<` / `>` remain legal formula operators. The result keeps the
 * leading `=` so downstream code (and the evaluator) recognise it uniformly.
 */
export function normalizeCellFormula(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length < 2 || !trimmed.startsWith("=")) return null;
  if (trimmed.length > MAX_CELL_FORMULA_LENGTH) return null;
  // Comparison operators need `<` / `>`, but tag-shaped sequences never do.
  // Reject controls plus XML/HTML declarations, closing tags, and a complete
  // letter-named tag. The closed formula grammar/serializer applies the second
  // validation layer before any native field is emitted.
  if (
    /[\x00-\x1f\x7f]/.test(trimmed) ||
    /<\s*[!?/]/.test(trimmed) ||
    /<\s*\p{L}[\p{L}\p{N}_-]*\s*>/u.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
}

/** Normalize the supported Word `\\#` numeric picture switch. */
export function normalizeCellFormulaNumberFormat(
  value: unknown,
): CellFormulaNumberFormat | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return CELL_FORMULA_NUMBER_FORMAT_SET.has(normalized)
    ? (normalized as CellFormulaNumberFormat)
    : null;
}

export interface ParsedCellFormulaFieldInstruction {
  readonly formula: string;
  readonly numberFormat: CellFormulaNumberFormat | null;
}

/**
 * Parse the bounded subset of a native Word table-formula field instruction.
 * Unknown switches fail closed so cached field text remains ordinary cell text
 * instead of being exposed as an editable formula with guessed semantics.
 */
export function parseCellFormulaFieldInstruction(
  value: unknown,
): ParsedCellFormulaFieldInstruction | null {
  if (typeof value !== "string") return null;
  let body = value.trim();
  if (!body) return null;

  // Word commonly appends MERGEFORMAT after the numeric picture. It does not
  // change calculation semantics, so it is safe to consume only in this final
  // position. Any other switch remains in `body` and is rejected below.
  body = body.replace(/\s+\\\*\s+MERGEFORMAT\s*$/i, "").trim();

  let numberFormat: CellFormulaNumberFormat | null = null;
  const pictureMatch = /\s+\\#\s+"([^"]+)"\s*$/.exec(body);
  if (pictureMatch) {
    numberFormat = normalizeCellFormulaNumberFormat(pictureMatch[1]);
    if (numberFormat === null) return null;
    body = body.slice(0, pictureMatch.index).trim();
  }

  // A residual backslash is an unsupported field switch. Quotes are likewise
  // outside the evaluator grammar and must never be folded into the formula.
  if (body.includes("\\") || body.includes('"')) return null;
  const formula = normalizeCellFormula(body);
  if (!formula) return null;
  return cellFormulaFunctionsSupported(formula)
    ? { formula, numberFormat }
    : null;
}

/** Serialize the same closed instruction subset for browser DOCX export. */
export function serializeCellFormulaFieldInstruction(
  formulaValue: unknown,
  numberFormatValue: unknown,
): string | null {
  const formula = normalizeCellFormula(formulaValue);
  if (
    !formula ||
    formula.includes("\\") ||
    formula.includes('"') ||
    !cellFormulaFunctionsSupported(formula)
  ) {
    return null;
  }
  const hasFormat =
    numberFormatValue !== null && numberFormatValue !== undefined;
  const numberFormat = normalizeCellFormulaNumberFormat(numberFormatValue);
  if (hasFormat && numberFormat === null) return null;
  return ` ${formula}${numberFormat ? ` \\# "${numberFormat}"` : ""} `;
}

/**
 * renderHTML fragment for the formula attribute: a single `data-cell-formula`
 * attribute carrying the canonical formula string. The COMPUTED value lives in
 * the cell's text content (kept in sync by the recompute plugin), so the formula
 * attribute is purely the source-of-truth record that survives a copy/export and
 * lets the editor re-render the value. Returns an empty object when unset/invalid
 * so renderHTML emits nothing — a cell without a formula is byte-for-byte today's.
 */
export function cellFormulaAttributes(
  value: unknown,
): { "data-cell-formula": string } | Record<string, never> {
  const formula = normalizeCellFormula(value);
  if (formula === null) return {};
  return { "data-cell-formula": formula };
}

/** HTML persistence fragment for the supported formula numeric picture. */
export function cellFormulaNumberFormatAttributes(
  value: unknown,
): { "data-cell-formula-number-format": CellFormulaNumberFormat } | Record<string, never> {
  const numberFormat = normalizeCellFormulaNumberFormat(value);
  return numberFormat === null
    ? {}
    : { "data-cell-formula-number-format": numberFormat };
}
