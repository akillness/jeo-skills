/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Insert Symbol catalog for the native document editor — the Word/WPS
 * "Insert → Symbol" picker. A curated set of the glyphs people actually reach
 * for (legal/typographic marks, math operators, arrows, currency, a few
 * decorative marks) that are awkward to type on a normal keyboard.
 *
 * This module is PURE DATA + tiny pure lookups (no editor dependency) so the
 * catalog can be unit-tested for stability (every entry has a unique id and a
 * non-empty glyph). The toolbar renders these as a grid of buttons; clicking one
 * inserts its `glyph` at the caret via `insertContent` — ordinary text that
 * round-trips through HTML/DOCX export like any typed character. No schema,
 * node, or mark is involved.
 */

export interface DocumentSymbol {
  /** Stable id (used as a React key / test-id / dedupe key). */
  id: string;
  /** The glyph to insert. */
  glyph: string;
  /** Human-readable name (also used as the button title/aria-label). */
  label: string;
  /**
   * Optional visible button face when {@link glyph} is itself invisible (e.g. a
   * non-breaking space / non-breaking hyphen), so the picker shows a legible
   * placeholder while still INSERTING the real glyph. Defaults to `glyph`.
   */
  display?: string;
}

export type DocumentSymbolCategory =
  | "typographic"
  | "math"
  | "arrows"
  | "currency"
  | "marks";

export interface DocumentSymbolGroup {
  category: DocumentSymbolCategory;
  symbols: readonly DocumentSymbol[];
}

/**
 * The symbols, grouped by category. Order within a group is intentional (most
 * common first). All glyphs are single Unicode code points except where a
 * combining/compound mark is genuinely the symbol.
 */
export const DOCUMENT_SYMBOL_GROUPS: readonly DocumentSymbolGroup[] = [
  {
    category: "typographic",
    symbols: [
      { id: "copyright", glyph: "©", label: "Copyright" },
      { id: "registered", glyph: "®", label: "Registered trademark" },
      { id: "trademark", glyph: "™", label: "Trademark" },
      { id: "section", glyph: "§", label: "Section" },
      { id: "paragraph-mark", glyph: "¶", label: "Pilcrow (paragraph)" },
      { id: "dagger", glyph: "†", label: "Dagger" },
      { id: "double-dagger", glyph: "‡", label: "Double dagger" },
      { id: "bullet", glyph: "•", label: "Bullet" },
      { id: "middot", glyph: "·", label: "Middle dot" },
      { id: "ellipsis", glyph: "…", label: "Ellipsis" },
      { id: "em-dash", glyph: "—", label: "Em dash" },
      { id: "en-dash", glyph: "–", label: "En dash" },
      { id: "degree", glyph: "°", label: "Degree" },
      { id: "prime", glyph: "′", label: "Prime (feet/minutes)" },
      { id: "double-prime", glyph: "″", label: "Double prime (inches/seconds)" },
      // Non-breaking space (U+00A0): keeps two words on the same line. It is
      // whitespace, so it shows the open-box face "␣" in the picker while still
      // inserting the real NBSP. Also reachable via Ctrl+Shift+Space.
      {
        id: "nbsp",
        glyph: " ",
        display: "␣",
        label: "Non-breaking space",
      },
      // Non-breaking hyphen (U+2011): a hyphen that never line-breaks. The glyph
      // itself is visible, so no separate display face is needed.
      { id: "nb-hyphen", glyph: "‑", label: "Non-breaking hyphen" },
    ],
  },
  {
    category: "math",
    symbols: [
      { id: "times", glyph: "×", label: "Multiplication" },
      { id: "divide", glyph: "÷", label: "Division" },
      { id: "plus-minus", glyph: "±", label: "Plus-minus" },
      { id: "not-equal", glyph: "≠", label: "Not equal" },
      { id: "less-equal", glyph: "≤", label: "Less than or equal" },
      { id: "greater-equal", glyph: "≥", label: "Greater than or equal" },
      { id: "approx", glyph: "≈", label: "Approximately equal" },
      { id: "infinity", glyph: "∞", label: "Infinity" },
      { id: "sum", glyph: "∑", label: "Summation" },
      { id: "sqrt", glyph: "√", label: "Square root" },
      { id: "integral", glyph: "∫", label: "Integral" },
      { id: "micro", glyph: "µ", label: "Micro" },
      { id: "pi", glyph: "π", label: "Pi" },
      { id: "half", glyph: "½", label: "One half" },
      { id: "quarter", glyph: "¼", label: "One quarter" },
      { id: "three-quarters", glyph: "¾", label: "Three quarters" },
    ],
  },
  {
    category: "arrows",
    symbols: [
      { id: "arrow-right", glyph: "→", label: "Right arrow" },
      { id: "arrow-left", glyph: "←", label: "Left arrow" },
      { id: "arrow-up", glyph: "↑", label: "Up arrow" },
      { id: "arrow-down", glyph: "↓", label: "Down arrow" },
      { id: "arrow-both", glyph: "↔", label: "Left-right arrow" },
      { id: "double-arrow-right", glyph: "⇒", label: "Rightwards double arrow" },
    ],
  },
  {
    category: "currency",
    symbols: [
      { id: "euro", glyph: "€", label: "Euro" },
      { id: "pound", glyph: "£", label: "Pound sterling" },
      { id: "yen", glyph: "¥", label: "Yen / Yuan" },
      { id: "cent", glyph: "¢", label: "Cent" },
      { id: "rupee", glyph: "₹", label: "Indian rupee" },
      { id: "won", glyph: "₩", label: "Won" },
    ],
  },
  {
    category: "marks",
    symbols: [
      { id: "star", glyph: "★", label: "Filled star" },
      { id: "star-outline", glyph: "☆", label: "Outlined star" },
      { id: "heart", glyph: "♥", label: "Heart" },
      { id: "check", glyph: "✓", label: "Check mark" },
      { id: "cross", glyph: "✗", label: "Ballot X" },
      { id: "arrow-index", glyph: "☞", label: "Pointing hand" },
    ],
  },
];

/** The flat list of all symbols, in group order. */
export const DOCUMENT_SYMBOLS: readonly DocumentSymbol[] =
  DOCUMENT_SYMBOL_GROUPS.flatMap((group) => group.symbols);

// ---------------------------------------------------------------------------
// WPS-style Insert-tab SYMBOL DIALOG catalog (插入 → 符号). Distinct from the
// review-menu grid above: the dialog groups the glyphs a CJK document reaches
// for (CJK punctuation, math, arrows, Greek, enclosed numerals) into tabs, and
// the toolbar keeps a "recently used" row in localStorage. PURE DATA — each
// glyph is ordinary text inserted at the caret (insertContent), so it
// round-trips through HTML/DOCX export like any typed character.
// ---------------------------------------------------------------------------

export type SymbolPickerCategory =
  | "common"
  | "math"
  | "arrows"
  | "greek"
  | "numbering";

export interface SymbolPickerGroup {
  category: SymbolPickerCategory;
  glyphs: readonly string[];
}

/** The symbol-dialog categories, in tab order (most-reached-for first). */
export const SYMBOL_PICKER_GROUPS: readonly SymbolPickerGroup[] = [
  {
    // CJK punctuation + common typographic marks (WPS 常用).
    category: "common",
    glyphs: [
      "、", "。", "·", "—", "…", "《", "》", "【", "】",
      "「", "」", "『", "』", "（", "）", "〈", "〉", "％",
    ],
  },
  {
    category: "math",
    glyphs: [
      "±", "×", "÷", "≠", "≤", "≥", "∞", "∑", "∏",
      "√", "∫", "°", "≈", "∈", "∩", "∪", "∵", "∴",
    ],
  },
  {
    category: "arrows",
    glyphs: ["←", "→", "↑", "↓", "⇐", "⇒", "↔", "⇔", "↖", "↗", "↘", "↙"],
  },
  {
    category: "greek",
    glyphs: [
      "α", "β", "γ", "δ", "ε", "ζ", "η", "θ", "λ", "μ", "π", "ρ",
      "σ", "τ", "φ", "χ", "ψ", "ω",
      "Γ", "Δ", "Θ", "Λ", "Ξ", "Π", "Σ", "Φ", "Ψ", "Ω",
    ],
  },
  {
    // Enclosed / dotted numerals (①–⑩ / ⒈–⒑), the WPS 序号 tab.
    category: "numbering",
    glyphs: [
      "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩",
      "⒈", "⒉", "⒊", "⒋", "⒌", "⒍", "⒎", "⒏", "⒐", "⒑",
    ],
  },
];

/** Max glyphs remembered in the dialog's "recently used" row. */
export const SYMBOL_RECENT_LIMIT = 12;

/** The flat whitelist of every glyph the picker can insert (recent-row gate). */
const SYMBOL_PICKER_GLYPH_SET: ReadonlySet<string> = new Set(
  SYMBOL_PICKER_GROUPS.flatMap((group) => group.glyphs),
);

/**
 * Parse the persisted recently-used list (a JSON string array from
 * localStorage) into a safe, bounded glyph list: only glyphs present in the
 * picker catalog survive (a tampered value can never inject arbitrary text),
 * de-duplicated, most recent first, clamped to {@link SYMBOL_RECENT_LIMIT}.
 * PURE — returns [] for any malformed input.
 */
export function parseRecentSymbols(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: string[] = [];
  for (const item of parsed) {
    if (typeof item !== "string") continue;
    if (!SYMBOL_PICKER_GLYPH_SET.has(item)) continue;
    if (out.includes(item)) continue;
    out.push(item);
    if (out.length >= SYMBOL_RECENT_LIMIT) break;
  }
  return out;
}

/**
 * The recently-used list after inserting `glyph` (front, de-duplicated,
 * clamped). PURE so the toolbar's localStorage write is a one-liner.
 */
export function pushRecentSymbol(recent: readonly string[], glyph: string): string[] {
  if (!SYMBOL_PICKER_GLYPH_SET.has(glyph)) return [...recent];
  return [glyph, ...recent.filter((g) => g !== glyph)].slice(
    0,
    SYMBOL_RECENT_LIMIT,
  );
}

/** Look up a symbol's glyph by id, or null when the id is unknown. PURE. */
export function symbolGlyphById(id: string): string | null {
  const found = DOCUMENT_SYMBOLS.find((symbol) => symbol.id === id);
  return found ? found.glyph : null;
}
