"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { canonicalDocumentFontSizePx, documentFontSizePx } from "../native-document/documentFontSize";
import { PX_PER_PT, ptToPx, pxToPt, pxToPtRounded } from "../../../../lib/office-units";
import { cssAbsoluteLengthPt, cssAbsoluteLengthPx } from "../../../../lib/css-absolute-length";
import { BULK_FILL_CHUNK_META, mappedThroughBulkFill, rebuildsAfterFill } from "../native-document/bulkFillTransaction";
import { mapDecorationsFast } from "../native-document/fastRangeMapping";
import { cssNamedColorHex } from "../../../../lib/css-named-colors";
import { Extension, getMarkRange, Mark } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type {
  Mark as ProseMirrorMark,
  Node as ProseMirrorNode,
} from "@tiptap/pm/model";
import {
  NodeSelection,
  Plugin,
  PluginKey,
  type EditorState,
  type Transaction,
} from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
  AddMarkStep,
  AddNodeMarkStep,
  AttrStep,
  DocAttrStep,
  RemoveMarkStep,
  RemoveNodeMarkStep,
  ReplaceAroundStep,
  ReplaceStep,
  type Step,
} from "@tiptap/pm/transform";
import { touchedTextblocks } from "../native-document/touchedTextblocks";
import { defaultParagraphStyleId, paragraphStyleRunLook } from "../native-document/joinedParagraphStyleRuns";
import Strike from "@tiptap/extension-strike";
import { normalizeOfficeFontFace, parseOfficeFontFace, officeFontFaceStyle, type OfficeFontFace, type OfficeFontAsset } from "../../../office-ribbon/officeFontFace";
import { retainOfficeFontAssets } from "../../../office-ribbon/officeFontAssets";
import { stepOfficeFontSize, OFFICE_FONT_SIZE_LIMITS } from "../../../office-ribbon/officeFontSizeCatalog";
import { resolveFontScriptSlices, normalizeWordFontHint, normalizeWordFontHintLanguage, normalizeWordFontHintCharset, type WordFontHint, type FontScriptSlot, type FontScriptSpan } from "../../../office-ribbon/officeFontScriptSlots";

import { OpenTypeFeaturesMark, TextEffectsMark } from "./TextEffects";
import { createCharScaleLayoutPlugin, observeCharScalePieces } from "./charScaleLayout";
import { wordAutoTextAttributes } from "../native-document/wordAutoTextColor";
import { documentWordRangeAt } from "../../../../lib/document-word-at";
import { isTextBearingInlineAtom } from "../native-document/inlineAtomText";
import {
  ensureOfficeFontFaces,
  officeFontSubstitutes,
  THAI_SANS_FALLBACK_FAMILY,
  THAI_SERIF_FALLBACK_FAMILY,
} from "../../../../lib/office-fonts/substitutes";
import { withHangulEmFaces } from "../../../../lib/office-fonts/hangul-em";
import {
  OFFICE_CJK_FONT_FAMILY_VALUES,
  OFFICE_FONT_FAMILY_LABELS,
  OFFICE_FONT_FAMILY_VALUES,
} from "../../../office-ribbon/officeTypographyCatalog";

import {
  SYMBOL_CHAR_MARK,
  SymbolCharMark,
} from "../native-document/symbolCharMark";
export * from "./cssColor";
import { normalizeColor } from "./cssColor";
import { OFFICE_COMPLEX_SCALE_PREFIX, officeComplexScaleStack } from "../../../../lib/spreadsheet/office-complex-scales";
import { normalizeEastAsianFontFamilies } from "../../../../lib/document-word-line-metrics";
import { wordFontIsEastAsian, wordFontIsRecordedLatin } from "../native-document/wordFontMetrics";

/** Re-exported beside the other run-mark names the toolbar reads. */
export { SYMBOL_CHAR_MARK };

export const FONT_SIZE_VALUES = [
  "10px",
  "12px",
  "13px",
  "14px",
  "16px",
  "18px",
  "20px",
  "24px",
  "28px",
  "32px",
  "40px",
  "48px",
] as const;
export const FONT_FAMILY_VALUES = OFFICE_FONT_FAMILY_VALUES;

/**
 * CJK (east-Asia) font stacks for the independent CJK font picker (Word/WPS
 * 中文字体 parity). Each entry maps to `<w:rFonts w:eastAsia>` on export.
 * A pure CJK stack carries the canonical face first so `primaryFontFamily`
 * returns the bare name that goes into `w:eastAsia`.
 */
export const CJK_FONT_FAMILY_VALUES = OFFICE_CJK_FONT_FAMILY_VALUES;

/** Display labels for the font picker (stack → human name). */
export const FONT_FAMILY_LABELS = OFFICE_FONT_FAMILY_LABELS;
export const TEXT_COLOR_VALUES = [
  "#111827",
  "#6b7280",
  "#dc2626",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#2563eb",
  "#7c3aed",
] as const;
export const HIGHLIGHT_COLOR_VALUES = [
  "#fef3c7",
  "#ffedd5",
  "#fee2e2",
  "#dcfce7",
  "#dbeafe",
  "#f3e8ff",
] as const;

/**
 * Word's character-style gallery (Strong / Emphasis / Intense Emphasis /
 * Subtle Emphasis / Code). A character style is a NAMED bundle of inline
 * formatting applied as a single mark, so the run stays consistent and the
 * whole gallery can be re-themed in one place. The gallery is a closed
 * whitelist — a forged / imported `name` outside this set is dropped, never
 * rendered — and each name maps to concrete inline CSS via
 * {@link characterStyleCss} so the rendering is a single source of truth.
 */
export const CHARACTER_STYLE_VALUES = [
  "strong",
  "emphasis",
  "intenseEmphasis",
  "subtleEmphasis",
  "subtleReference",
  "intenseReference",
  "bookTitle",
  "code",
] as const;
export type CharacterStyleValue = (typeof CHARACTER_STYLE_VALUES)[number];

const CHARACTER_STYLE_SET = new Set<string>(CHARACTER_STYLE_VALUES);

/** Whitelisted character-style name (gallery member) or null. */
export function normalizeCharacterStyle(
  value: unknown,
): CharacterStyleValue | null {
  return typeof value === "string" && CHARACTER_STYLE_SET.has(value)
    ? (value as CharacterStyleValue)
    : null;
}

/**
 * The concrete inline CSS each character style renders as (single source of
 * truth, shared by the mark's renderHTML). The declarations are a fixed,
 * developer-authored string — never interpolated with user input — so no CSS
 * injection is possible. The same name → CSS mapping is what export maps to a
 * styles.xml `<w:style w:type="character">` definition.
 */
export function characterStyleCss(style: CharacterStyleValue): string {
  switch (style) {
    case "strong":
      return "font-weight: 700";
    case "emphasis":
      return "font-style: italic";
    // Word's built-in character styles, as its Normal template defines them
    // (Office theme: accent 1 shaded to #0F4761, text 1 tinted to #595959).
    case "intenseEmphasis":
      return "font-style: italic; color: #0f4761";
    case "subtleEmphasis":
      return "font-style: italic; color: #595959";
    case "subtleReference":
      return "font-variant: small-caps; color: #595959";
    case "intenseReference":
      return "font-weight: 700; font-variant: small-caps; color: #0f4761; letter-spacing: 0.25pt";
    case "bookTitle":
      return "font-weight: 700; font-style: italic";
    case "code":
      return 'font-family: "Courier New", Courier, monospace; background-color: #f3f4f6; padding: 0 0.2em; border-radius: 3px';
  }
}









export const DIRECT_TEXT_COLOR_VAR = "--docs-direct-text-color";

/** {@link characterStyleCss} as the editor paints it: a style colour yields
 * to a direct colour on the same text. */
export function characterStyleRenderCss(style: CharacterStyleValue): string {
  return characterStyleCss(style).replace(
    /(^|;\s*)color:\s*([^;]+)/u,
    (_match, lead: string, color: string) =>
      `${lead}color: var(${DIRECT_TEXT_COLOR_VAR}, ${color.trim()})`,
  );
}

export type FontSizeValue = (typeof FONT_SIZE_VALUES)[number];
export type FontFamilyValue = (typeof FONT_FAMILY_VALUES)[number];
export type TextColorValue = (typeof TEXT_COLOR_VALUES)[number];
export type HighlightColorValue = (typeof HIGHLIGHT_COLOR_VALUES)[number];

const FONT_SIZE_MARK = "fontSize";
const FONT_FAMILY_MARK = "fontFamily";
/** Independent CJK (east-Asia) font mark — drives `<w:rFonts w:eastAsia>` on export. */
const FONT_CJK_FAMILY_MARK = "fontCjkFamily";
/**
 * Independent complex-script font mark — drives `<w:rFonts w:cs>` on export.
 *
 * ECMA-376 17.3.2.26 gives a run four font slots and says which one a
 * character uses "shall be determined by the Unicode character values of the
 * run content": Devanagari, Arabic, Hebrew, Thai and Bengali are drawn from
 * the complex-script slot whatever the Latin and East Asian slots name.
 */
const FONT_COMPLEX_FAMILY_MARK = "fontComplexFamily";
const TEXT_COLOR_MARK = "textColor";
const HIGHLIGHT_MARK = "highlight";
const SUPERSCRIPT_MARK = "superscript";
const SUBSCRIPT_MARK = "subscript";
/** Word/WPS `<w:dstrike>` — distinct from the stock single `strike` mark. */
export const DOUBLE_STRIKE_MARK = "doubleStrike";
/**
 * Small caps (font-variant: small-caps) and All caps (text-transform: uppercase)
 * are LIVE character marks — they change how the run is RENDERED without
 * destroying the underlying text (unlike the toolbar's Change Case command, which
 * rewrites the characters). They round-trip through Word `<w:smallCaps>` /
 * `<w:caps>` and are mutually exclusive (Word treats them as one effect slot).
 */
const SMALL_CAPS_MARK = "smallCaps";
const ALL_CAPS_MARK = "allCaps";
const CHARACTER_STYLE_MARK = "characterStyle";
/**
 * Character spacing (字符间距) mark: positive = expanded, negative = condensed,
 * stored in typographic points. Drives `<w:spacing w:val>` on export (twentieths
 * of a point). Range: -1584..1584 pt, Word's own (Font > Advanced > Spacing; a
 * PDF converter's -111.7 pt over one letter is drawn as written, corpus R501-D14).
 */
export const CHAR_SPACING_MARK = "charSpacing";
/**
 * Character scaling (字符缩放) mark: horizontal glyph stretch, stored as a
 * percent (100 = normal, 150 = stretched 150%, 80 = condensed). Drives
 * `<w:w w:val>` on export. Range: 1..600 (Word's documented limits).
 */
export const CHAR_SCALE_MARK = "charScale";
/** Word's Fit Text (调整宽度, ECMA-376 17.3.2.14 w:fitText). */
export const FIT_TEXT_MARK = "fitText";
/** Word's Fit Text width bounds in twips (MS-OI29500 2.1.78: 0..31680). */
export const MAX_FIT_TEXT_TWIPS = 31_680;

/** A Fit Text width in whole twips, or null. */
export function normalizeFitTextTwips(value: unknown): number | null {
  const raw = typeof value === "string" ? Number(value) : value;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const twips = Math.round(raw);
  return twips >= 1 && twips <= MAX_FIT_TEXT_TWIPS ? twips : null;
}

/** A Fit Text run id (w:id, links contiguous runs into one region; Word
 * writes negative ids too: ST_DecimalNumber). */
export function normalizeFitTextId(value: unknown): number | null {
  const raw = typeof value === "string" ? Number(value) : value;
  return typeof raw === "number" &&
    Number.isInteger(raw) &&
    raw >= -2_147_483_648 &&
    raw <= 2_147_483_647
    ? raw
    : null;
}
/**
 * Word `<w:kern w:val>` threshold, stored exactly as integer half-points.
 * A missing mark keeps the inherited/absent Office semantics; it is not
 * rewritten to an arbitrary default until the user explicitly enables the
 * Font-dialog checkbox.
 */
export const KERNING_THRESHOLD_MARK = "kerningThreshold";
export const DEFAULT_KERNING_THRESHOLD_HALF_POINTS = 16;
const MIN_KERNING_THRESHOLD_HALF_POINTS = 1;
const MAX_KERNING_THRESHOLD_HALF_POINTS = 3277;
export type KerningThresholdProvenance = "direct" | "inherited";
export interface KerningThresholdMarkAuthority {
  readonly halfPoints: number;
  readonly provenance: KerningThresholdProvenance;
  readonly inheritedHalfPoints: number | null;
}

/**
 * Character formatting that Word's Clear All Formatting control owns. Keep
 * semantic authority marks (links, comments, bookmarks, revisions, content
 * controls, index entries, and citations) out of this list: clearing visual
 * styling must never delete document structure or review metadata.
 *
 * This mirrors the Docs Format Painter payload boundary so the two Home tab
 * controls agree on what counts as formatting without introducing a shared
 * editor abstraction for ProseMirror-specific mark semantics.
 */
const CLEARABLE_TEXT_STYLE_MARKS = [
  "bold",
  "italic",
  "underline",
  "strike",
  DOUBLE_STRIKE_MARK,
  "hiddenText",
  SUPERSCRIPT_MARK,
  SUBSCRIPT_MARK,
  SMALL_CAPS_MARK,
  ALL_CAPS_MARK,
  CHARACTER_STYLE_MARK,
  "emphasisDots",
  "enclosedChar",
  "eastAsianLayout",
  FONT_SIZE_MARK,
  FONT_FAMILY_MARK,
  FONT_CJK_FAMILY_MARK,
  FONT_COMPLEX_FAMILY_MARK,
  TEXT_COLOR_MARK,
  // Not the highlighter: Word's Clear All Formatting leaves text
  // highlighting, which Text Highlight Color › No Color removes.
  CHAR_SPACING_MARK,
  CHAR_SCALE_MARK,
  "charShading",
  "charBorder",
  "textPosition",
  TextEffectsMark.name,
  OpenTypeFeaturesMark.name,
] as const;

const FONT_SIZE_SET = new Set<string>(FONT_SIZE_VALUES);

// The preset color sets back the curated swatches and let callers ask whether a
// (already-normalized) color is one of the built-in presets — e.g. so the
// toolbar can show a swatch as active vs. surface an arbitrary custom color in
// the picker. They are NOT the security gate: any user-chosen color is validated
// independently by normalizeColor below.
const TEXT_COLOR_SET = new Set<string>(TEXT_COLOR_VALUES);
const HIGHLIGHT_COLOR_SET = new Set<string>(HIGHLIGHT_COLOR_VALUES);

export function isPresetTextColor(value: string): boolean {
  return TEXT_COLOR_SET.has(value.toLowerCase());
}

export function isPresetHighlightColor(value: string): boolean {
  return HIGHLIGHT_COLOR_SET.has(value.toLowerCase());
}

// Maps a normalized font stack (lowercased, quote-stripped, whitespace
// collapsed) back to its canonical whitelisted value so pasted HTML with minor
// whitespace/quote/casing differences still resolves, while anything not in the
// curated set is rejected — no arbitrary font-family CSS reaches the DOM.
function fontFamilyKey(value: string): string {
  return value
    .replace(/["']/g, "")
    .replace(/\s*,\s*/g, ",")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const FONT_FAMILY_LOOKUP = new Map<string, FontFamilyValue>(
  FONT_FAMILY_VALUES.map((value) => [fontFamilyKey(value), value]),
);

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    textStyling: {
      setFontSize: (size: string) => ReturnType;
      unsetFontSize: () => ReturnType;
      /**
       * Grow every selected run one rung up the preset ladder (Word/WPS
       * Grow-Font, Command+Shift+>). Missing size marks start at the document
       * default.
       */
      growFontSize: () => ReturnType;
      /**
       * Shrink every selected run one rung down the preset ladder (Word/WPS
       * Shrink-Font, Command+Shift+<). Mirror of {@link growFontSize}.
       */
      shrinkFontSize: () => ReturnType;
      /** Increase every selected run by exactly one typographic point. */
      increaseFontSizeOnePoint: () => ReturnType;
      /** Decrease every selected run by exactly one typographic point. */
      decreaseFontSizeOnePoint: () => ReturnType;
      setFontFamily: (family: string, face?: OfficeFontFace | null) => ReturnType;
      unsetFontFamily: () => ReturnType;
      /** Set an independent CJK (east-Asia) font on the selection. */
      setCjkFont: (family: string, face?: OfficeFontFace | null) => ReturnType;
      /** Remove the independent CJK font mark from the selection. */
      unsetCjkFont: () => ReturnType;
      /**
       * A direct font colour; `themeColor` (Word's `w:themeColor` with its
       * tint or shade, `normalizeTextThemeColor`) when it is a theme colour
       * swatch, which then follows the document theme.
       */
      setTextColor: (color: string, themeColor?: string | null) => ReturnType;
      /** Word's Automatic colour as a direct colour (over a style's own). */
      setTextColorAutomatic: () => ReturnType;
      unsetTextColor: () => ReturnType;
      setHighlight: (color: string) => ReturnType;
      /** Word's Text Highlight Color face: the text already wearing this
       * highlight loses it, any other text takes it. */
      toggleHighlight: (color: string) => ReturnType;
      unsetHighlight: () => ReturnType;
      toggleSuperscript: () => ReturnType;
      toggleSubscript: () => ReturnType;
      /** Toggle Word/WPS double strikethrough (`<w:dstrike>`). */
      toggleDoubleStrike: () => ReturnType;
      /**
       * Toggle the LIVE small-caps mark (font-variant: small-caps). Mutually
       * exclusive with all-caps; toggling it on drops all-caps first.
       */
      toggleSmallCaps: () => ReturnType;
      /**
       * Toggle the LIVE all-caps mark (text-transform: uppercase). Mutually
       * exclusive with small-caps; toggling it on drops small-caps first.
       */
      toggleAllCaps: () => ReturnType;
      /** Apply a named character style (Strong/Emphasis/…) to the selection. */
      setCharacterStyle: (name: string) => ReturnType;
      /** Clear any character style from the selection. */
      unsetCharacterStyle: () => ReturnType;
      clearTextStyles: () => ReturnType;
      /**
       * Set character spacing (字符间距) in typographic points (positive =
       * expanded, negative = condensed). Validated against Word's ±1584 pt.
       */
      setCharSpacing: (pt: number) => ReturnType;
      /** Remove the character spacing mark from the selection. */
      unsetCharSpacing: () => ReturnType;
      /**
       * Set character scaling (字符缩放) as a percent (100 = normal).
       * Validated and clamped to [1, 600].
       */
      setCharScale: (pct: number) => ReturnType;
      /** Remove the character scale mark from the selection. */
      unsetCharScale: () => ReturnType;
      /**
       * Word's Fit Text (调整宽度): the selected text takes exactly this width
       * in twips (w:fitText w:val), one region (w:id) for the selection.
       */
      setFitText: (widthTwips: number) => ReturnType;
      /** Remove Fit Text from the selection (the dialog's Remove). */
      unsetFitText: () => ReturnType;
      /** Set Word's kerning threshold as an exact integer half-point value. */
      setKerningThreshold: (halfPoints: number) => ReturnType;
      /** Restore inherited/absent kerning-threshold semantics. */
      unsetKerningThreshold: () => ReturnType;
    };
  }
}

function isElement(value: unknown): value is HTMLElement {
  return typeof HTMLElement !== "undefined" && value instanceof HTMLElement;
}

// Arbitrary sizes (e.g. Word 五号 = 10.5pt = 14px, 小四 = 16px) must survive
// import. Accept any pure `<number>px` in Word's own range, 1pt to 1638pt
// (w:sz 2..3276), canonicalized to a trimmed string — the regex leaves no
// room for CSS injection. A 4pt label (R02-D14's "S ja-JP U+0021") fell
// below the old 6px floor and was drawn at the document's 11pt.
const ARBITRARY_FONT_SIZE_RE = /^(\d{1,4}(?:\.\d{1,4})?)px$/;
const WORD_MIN_FONT_SIZE_PX = PX_PER_PT;
const WORD_MAX_FONT_SIZE_PX = ptToPx(1638);

export function normalizeFontSize(value: unknown): FontSizeValue | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (FONT_SIZE_SET.has(normalized)) return normalized as FontSizeValue;
  // Points, Word's own unit ("22pt", 二号), as the px the editor draws: a
  // stored "22pt" was ignored here and refused by the review's export
  
  const points = /^(\d+(?:\.\d+)?)pt$/.exec(normalized);
  if (points) return normalizeFontSize(documentFontSizePx(Number.parseFloat(points[1])));
  const match = ARBITRARY_FONT_SIZE_RE.exec(normalized);
  if (!match) return null;
  const size = Number.parseFloat(match[1]);
  if (
    !Number.isFinite(size) ||
    size < WORD_MIN_FONT_SIZE_PX - 0.001 ||
    size > WORD_MAX_FONT_SIZE_PX + 0.001
  ) {
    return null;
  }
  return `${size}px` as FontSizeValue;
}

/** A declared charset belongs to the source East Asian face. Changing that
 * face must not apply the old font's charset to a different font.
 *
 * Read from the transaction, not the command's state: in a chain the state's
 * doc is the one before the chain's earlier steps (Tiptap's chainable state
 * catches up only when its `tr` is read), and a mark rebuilt from it put the
 * old face back. After it, the state is brought up to the transaction, so the
 * `setMark` that follows merges into the cleared mark: it re-added the old
 * charset from the stale doc (corpus R466-D72 E44, the Font box over a SimSun
 * run hinted with charset 86: Georgia kept GB2312, the file read back none). */
function clearChangedFontHintCharset(
  tr: Transaction,
  state: EditorState,
  slot: "primary" | "eastAsia",
  nextFamily: string | null,
): void {
  clearChangedFontHintCharsetIn(tr, slot, nextFamily);
  // Tiptap's chainable state takes the transaction's doc when `tr` is read.
  void (state as EditorState & { tr?: Transaction }).tr;
}

function clearChangedFontHintCharsetIn(
  tr: Transaction,
  slot: "primary" | "eastAsia",
  nextFamily: string | null,
): void {
  const update = (marks: readonly ProseMirrorMark[], from?: number, to?: number) => {
    const primary = marks.find(mark => mark.type.name === FONT_FAMILY_MARK);
    if (!primary?.attrs.hintCharset) return;
    const eastAsia = marks.find(mark => mark.type.name === FONT_CJK_FAMILY_MARK);
    const previous = normalizeFontFamily(eastAsia?.attrs.family ?? primary.attrs.family);
    const next = slot === "eastAsia"
      ? normalizeFontFamily(nextFamily ?? primary.attrs.family)
      : normalizeFontFamily(eastAsia?.attrs.family ?? nextFamily);
    if (previous === next) return;
    const mark = primary.type.create({ ...primary.attrs, hintCharset: undefined });
    if (from === undefined || to === undefined) tr.addStoredMark(mark);
    else tr.addMark(from, to, mark);
  };
  const { from, to, empty, $from } = tr.selection;
  if (empty) update(tr.storedMarks ?? $from.marks());
  else tr.doc.nodesBetween(from, to, (node, pos) => {
    if (node.isText) update(node.marks, Math.max(from, pos), Math.min(to, pos + node.nodeSize));
  });
}









function complexScriptHintRanges(
  state: EditorState,
  nextFamily: string,
): { from: number; to: number }[] | "stored" {
  const hinted = (marks: readonly ProseMirrorMark[]) => {
    const primary = marks.find(mark => mark.type.name === FONT_FAMILY_MARK);
    return primary?.attrs.hint === "cs" && normalizeFontFamily(primary.attrs.family) !== nextFamily;
  };
  const { from, to, empty, $from } = state.selection;
  if (empty) return hinted(state.storedMarks ?? $from.marks()) ? "stored" : [];
  const ranges: { from: number; to: number }[] = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.isText && hinted(node.marks)) {
      ranges.push({ from: Math.max(from, pos), to: Math.min(to, pos + node.nodeSize) });
    }
  });
  return ranges;
}

function clearComplexScriptHint(tr: Transaction, ranges: { from: number; to: number }[] | "stored"): void {
  const cleared = (mark: ProseMirrorMark) =>
    mark.type.create({ ...mark.attrs, hint: undefined, hintLanguage: undefined, hintCharset: undefined });
  if (ranges === "stored") {
    const primary = (tr.storedMarks ?? []).find(mark => mark.type.name === FONT_FAMILY_MARK);
    if (primary) tr.addStoredMark(cleared(primary));
    return;
  }
  for (const range of ranges) {
    tr.doc.nodesBetween(range.from, range.to, (node, pos) => {
      const primary = node.isText ? node.marks.find(mark => mark.type.name === FONT_FAMILY_MARK) : undefined;
      if (primary) {
        tr.addMark(Math.max(range.from, pos), Math.min(range.to, pos + node.nodeSize), cleared(primary));
      }
    });
  }
}

/**
 * The font size (px) the editor renders when no explicit fontSize mark is set —
 * matches the document body default. Grow/Shrink starts the ladder walk from
 * this when the caret carries no size mark (Word: the next step up/down from the
 * paragraph's effective size).
 */
export const DEFAULT_DOCUMENT_FONT_SIZE_PX = 16;

/** Hard floor/ceiling of the px ladder ({@link stepFontSize}). */
const FONT_STEP_MIN_PX = 6;
const FONT_STEP_MAX_PX = 96;

/** The numeric px ladder derived once from FONT_SIZE_VALUES (sorted ascending). */
const FONT_SIZE_LADDER_PX: readonly number[] = Array.from(
  new Set(
    FONT_SIZE_VALUES.map((value) => Number.parseFloat(value)).filter((n) =>
      Number.isFinite(n),
    ),
  ),
).sort((a, b) => a - b);

/**
 * Parse a font-size value (e.g. "14px", "14", 14) to a finite px number, or null.
 * Tolerates a missing unit (a bare number is read as px) so a stored mark value,
 * an arbitrary import, and the toolbar's numeric draft all resolve. PURE.
 */
export function fontSizeToPx(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value !== "string") return null;
  const lowered = value.trim().toLowerCase();
  const inPoints = lowered.endsWith("pt");
  const trimmed = lowered.replace(/p[xt]$/, "");
  if (!trimmed) return null;
  const n = Number.parseFloat(trimmed) * (inPoints ? PX_PER_PT : 1);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Step a font size one rung along the preset ladder (Word/WPS Grow-Font /
 * Shrink-Font, Ctrl+] / Ctrl+[).
 *
 * Given the CURRENT px size (or null → start from the document default) and a
 * direction (+1 grow, -1 shrink), returns the next canonical `"<n>px"` string:
 *   - grow → the smallest ladder rung strictly greater than current; if current
 *     is at/above the top rung, step up by the gap between the two largest rungs
 *     (so a 60px run still grows), clamped to {@link FONT_STEP_MAX_PX};
 *   - shrink → the largest ladder rung strictly less than current; if current is
 *     at/below the bottom rung, step down by the gap between the two smallest
 *     rungs, clamped to {@link FONT_STEP_MIN_PX}.
 *
 * Returns null when there is no change to make (already exactly at the bound and
 * stepping further out), so a caller can no-op. The result is always re-validated
 * by {@link normalizeFontSize} at the call site. PURE — no editor access.
 */
export function stepFontSize(
  currentPx: number | null | undefined,
  direction: 1 | -1,
): string | null {
  const ladder = FONT_SIZE_LADDER_PX;
  if (ladder.length === 0) return null;
  const current =
    typeof currentPx === "number" && Number.isFinite(currentPx) && currentPx > 0
      ? currentPx
      : DEFAULT_DOCUMENT_FONT_SIZE_PX;

  let next: number;
  if (direction === 1) {
    const up = ladder.find((rung) => rung > current);
    if (up !== undefined) {
      next = up;
    } else {
      // Past the top rung: keep growing by the top inter-rung gap (min 1px).
      const gap =
        ladder.length >= 2
          ? ladder[ladder.length - 1] - ladder[ladder.length - 2]
          : 1;
      next = current + Math.max(1, gap);
    }
    next = Math.min(FONT_STEP_MAX_PX, next);
  } else {
    // Largest rung strictly below current.
    let down: number | undefined;
    for (let i = ladder.length - 1; i >= 0; i -= 1) {
      if (ladder[i] < current) {
        down = ladder[i];
        break;
      }
    }
    if (down !== undefined) {
      next = down;
    } else {
      const gap = ladder.length >= 2 ? ladder[1] - ladder[0] : 1;
      next = current - Math.max(1, gap);
    }
    next = Math.max(FONT_STEP_MIN_PX, next);
  }

  // Round to at most 2 decimals (parity with normalizeFontSize's accepted form)
  // and drop a redundant trailing ".0".
  const rounded = Math.round(next * 100) / 100;
  if (rounded === current) return null;
  return `${rounded}px`;
}











export function stepDocumentFontSize(
  currentPx: number | null | undefined,
  direction: 1 | -1,
): string | null {
  const current =
    typeof currentPx === "number" && Number.isFinite(currentPx) && currentPx > 0
      ? currentPx
      : DEFAULT_DOCUMENT_FONT_SIZE_PX;
  // 16 pt is stored as 21.3333px; read it back as the 16 the box shows.
  const points = pxToPtRounded(current);
  const nextPoints = stepOfficeFontSize(points, direction, "word");
  // Word's own limits (stepOfficeFontSize), not the old 96 px ladder cap:
  // Grow Font went no further than 72 pt.
  const next = documentFontSizePx(Math.max(pxToPt(WORD_MIN_FONT_SIZE_PX), nextPoints));
  if (next === canonicalDocumentFontSizePx(current)) return null;
  return next;
}

/**
 * Read the font size (px) active on the editor's current selection from the
 * `fontSize` mark, or null when no size mark applies (so grow/shrink falls back
 * to the document default). Uses the editor's own attribute resolution, which
 * accounts for stored marks at a collapsed cursor and a uniform run selection.
 */
function readSelectionFontSizePx(
  editor: { getAttributes: (name: string) => Record<string, unknown> },
  state: EditorState,
): number | null {
  const rawSize = editor.getAttributes(FONT_SIZE_MARK)?.size;
  if (rawSize !== null && rawSize !== undefined) {
    const normalized = normalizeFontSize(rawSize);
    return normalized ? fontSizeToPx(normalized) : null;
  }
  if (state.selection.$from.marks().some((mark) => mark.type.name === "code")) {
    return null;
  }
  return inheritedFontSizePx(
    state,
    state.selection.from,
    null,
    createImportedStylePropertyResolver(state),
  );
}

/** A known reason a font-size step refuses the whole selection. */
export type FontSizeStepRefusal = "code";

/** Fired (bubbling) on the editor's DOM when a size shortcut is refused. */
export const FONT_SIZE_STEP_REFUSED_EVENT = "mrn-font-size-step-refused";










export function fontSizeStepRefusal(
  state: EditorState,
): FontSizeStepRefusal | null {
  const codeType = state.schema.marks.code;
  if (!codeType) return null;
  const sizeType = state.schema.marks[FONT_SIZE_MARK];
  const { selection } = state;
  if (selection.empty) {
    // The editor's own attribute read at a caret: stored marks and the
    // marks at the head. A size there is stepped; a code caret is not.
    const caretMarks = [
      ...(state.storedMarks ?? []),
      ...selection.$head.marks(),
    ];
    if (sizeType && caretMarks.some((mark) => mark.type === sizeType)) {
      return null;
    }
    return codeType.isInSet(selection.$from.marks()) ? "code" : null;
  }
  const { from, to } = selection;
  let code = false;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (code) return false;
    if (!node.isText) return;
    if (Math.max(from, pos) >= Math.min(to, pos + node.nodeSize)) return;
    if (
      codeType.isInSet(node.marks) &&
      !(sizeType && sizeType.isInSet(node.marks))
    ) {
      code = true;
    }
  });
  return code ? "code" : null;
}

function transformCollapsedFontSize(
  editor: { getAttributes: (name: string) => Record<string, unknown> },
  state: EditorState,
  tr: Transaction,
  transform: (currentPx: number) => string | null,
): string | null {
  const current = readSelectionFontSizePx(editor, state);
  if (current === null) {
    tr.setMeta("preventDispatch", true);
    return null;
  }
  return transform(current);
}

// Node types that render KaTeX in a nodeview and take font size as an
// attribute (not a text mark). Kept as a name set so this file needs no
// import of the math extensions (avoids a cycle).
const MATH_NODE_NAMES = new Set(["inlineMath", "mathBlock"]);

/**
 * Stamp (or clear) the `fontSize` attribute on every math node touched by the
 * current selection, on the shared command transaction. A collapsed cursor
 * that sits directly on an inline formula (a selected atom) is handled too.
 */
function applyFontSizeToMathNodes(
  tr: Transaction,
  state: EditorState,
  size: string | null,
): boolean {
  const { from, to, empty } = state.selection;
  // A caret is an insertion point: the size it takes is the text's, never a
  // formula's that happens to stand beside it. Only a range that covers the
  
  if (empty) return false;
  let sized = false;
  state.doc.nodesBetween(from, to, (node: ProseMirrorNode, pos: number) => {
    if (!MATH_NODE_NAMES.has(node.type.name)) return;
    sized = true;
    if ((node.attrs.fontSize ?? null) === (size ?? null)) return;
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, fontSize: size });
  });
  keepSelectedEquationSelected(tr, state);
  return sized;
}

/**
 * Home > Font Color on a display equation: the block atom takes no text mark,
 * so the colour is its own `textColor` attribute (rendered on the equation,
 * exported to every m:r and m:ctrlPr as Word writes it). Word 16.86 colours a
 * selected display equation, and one inside a selected range. An in-line
 * equation takes the textColor mark with its text.
 */
function applyTextColorToMathBlocks(
  tr: Transaction,
  state: EditorState,
  color: string | null,
): boolean {
  if (state.selection.empty) return false;
  let colored = false;
  for (const range of state.selection.ranges) {
    state.doc.nodesBetween(range.$from.pos, range.$to.pos, (node: ProseMirrorNode, pos: number) => {
      if (node.type.name !== "mathBlock") return;
      colored = true;
      if ((node.attrs.textColor ?? null) === color) return;
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, textColor: color });
    });
  }
  keepSelectedEquationSelected(tr, state);
  return colored;
}

/**
 * `setNodeMarkup` replaces the node, and a NodeSelection on it maps to a
 * cursor after it, so a selected equation lost its selection on every
 * Grow / Shrink Font (the ribbon then showed the cursor's size, not the
 * equation's, and a second press sized the cursor). Keep the equation
 * selected, as Word keeps it.
 */
function keepSelectedEquationSelected(
  tr: Transaction,
  state: EditorState,
): void {
  // The ribbon re-applies the selection as a text range before a command
  // (`setTextSelection`), so a selected equation arrives as the range that
  // exactly spans it as often as a NodeSelection.
  const { from, to } = state.selection;
  const selected = state.doc.nodeAt(from);
  if (
    !selected ||
    !MATH_NODE_NAMES.has(selected.type.name) ||
    to !== from + selected.nodeSize
  ) {
    return;
  }
  const pos = tr.mapping.map(from, -1);
  const node = tr.doc.nodeAt(pos);
  if (node && MATH_NODE_NAMES.has(node.type.name)) {
    tr.setSelection(NodeSelection.create(tr.doc, pos));
  }
}

function selectionHasTextStyleMark(
  state: EditorState,
  markName: string,
): boolean {
  const markType = state.schema.marks[markName];
  if (!markType) return false;

  const { selection } = state;
  if (selection.empty) {
    return [...selection.$from.marks(), ...(state.storedMarks ?? [])].some(
      (mark) => mark.type === markType,
    );
  }
  // Every range: a table selection's from/to are only its active cell, so a
  // plain last cell made Clear Formatting skip the bold of the other three
  
  return selection.ranges.some((range) =>
    state.doc.rangeHasMark(range.$from.pos, range.$to.pos, markType),
  );
}

/**
 * Clear Formatting in an imported Word document takes off the runs' direct
 * formatting and leaves what their paragraph style gives (Word: the text
 * "goes back to the style's formatting"). The page states the style's face,
 * size and colour on each imported run as marks, so taking every mark off
 * drew the words in the editor's default face and colour while the file, and
 * Word, kept the style's (corpus R485-D87 WALK1: a Heading 2 of the style's
 * Calibri blue drew black). The style's face, size and colour go back on the
 * cleared words (``paragraphStyleRunLook``), and a heading's words say again
 * that their bold is the style's.
 */
function restoreImportedStyleRunLook(tr: Transaction, state: EditorState): void {
  const docAttrs = state.doc.attrs as Record<string, unknown>;
  if (!docAttrs.styleDefinitions || state.selection.empty) return;
  const { fontFamily, fontSize, textColor, bold } = state.schema.marks;
  const blocks = new Set(["paragraph", "heading"]);
  const looks = new Map<string, ReturnType<typeof paragraphStyleRunLook>>();
  const adds: Array<{ from: number; to: number; mark: ProseMirrorMark }> = [];
  for (const range of state.selection.ranges) {
    const from = range.$from.pos;
    const to = range.$to.pos;
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (!blocks.has(node.type.name)) return true;
      const own = typeof node.attrs.docxStyleId === "string" && node.attrs.docxStyleId ? node.attrs.docxStyleId : null;
      const styleId = own ?? defaultParagraphStyleId(docAttrs);
      if (!styleId) return false;
      if (!looks.has(styleId)) looks.set(styleId, paragraphStyleRunLook(docAttrs, styleId));
      const look = looks.get(styleId);
      if (!look) return false;
      node.descendants((child, offset) => {
        if (!child.isText) return true;
        const start = Math.max(from, pos + 1 + offset);
        const end = Math.min(to, pos + 1 + offset + child.nodeSize);
        if (start >= end) return false;
        if (fontFamily && typeof look.family === "string") {
          adds.push({ from: start, to: end, mark: fontFamily.create({ family: `"${look.family}"` }) });
        }
        if (fontSize && look.sizePt) {
          adds.push({ from: start, to: end, mark: fontSize.create({ size: `${Math.round(((look.sizePt * 4) / 3) * 10000) / 10000}px` }) });
        }
        if (textColor && look.color) adds.push({ from: start, to: end, mark: textColor.create({ color: look.color }) });
        // An imported heading's runs say "bold as the style has it" (the
        // import's bold of value null), which is what cleared words are.
        if (bold && node.type.name === "heading") adds.push({ from: start, to: end, mark: bold.create({ value: null }) });
        return false;
      });
      return false;
    });
  }
  for (const { from, to, mark } of adds) tr.addMark(from, to, mark);
}

function clearSelectedParagraphPresentation(
  tr: Transaction,
  state: EditorState,
): void {
  const blockNames = new Set(["paragraph", "heading"]);
  const positions = new Set<number>();
  const { selection } = state;

  for (const range of selection.ranges) {
    state.doc.nodesBetween(range.$from.pos, range.$to.pos, (node, pos) => {
      if (blockNames.has(node.type.name)) positions.add(pos);
    });
  }
  if (selection.empty) {
    for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
      if (!blockNames.has(selection.$from.node(depth).type.name)) continue;
      positions.add(selection.$from.before(depth));
      break;
    }
  }

  for (const pos of positions) {
    const node = tr.doc.nodeAt(pos);
    if (!node || !blockNames.has(node.type.name)) continue;
    if ((node.attrs.textAlign ?? null) === null && node.attrs.indent === 0) {
      continue;
    }
    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      textAlign: null,
      indent: 0,
    });
  }
}

const HEADING_FONT_SIZE_PX: Readonly<Record<number, number>> = {
  1: 28,
  2: 22,
  3: 18,
  4: 16.8,
  5: 16,
  6: 15.2,
};

type ImportedRunHalfPointProperty = "fontSizeHalfPoints" | "kernHalfPoints";
/** `w:kern w:val="0"` in a style: kerning off from this level of the chain. */
const STYLE_KERNING_OFF_HALF_POINTS = 0;

interface ImportedStyleRecord {
  readonly basedOn: string | null;
  readonly default: boolean;
  readonly name: string;
  readonly rPr: Readonly<Record<string, unknown>> | null;
  readonly type: string;
}

interface ImportedStylePropertyResolver {
  readonly available: boolean;
  readonly valid: boolean;
  readonly resolve: (
    styleId: string,
    property: ImportedRunHalfPointProperty,
    expectedType: "character" | "paragraph",
  ) => Readonly<{ valid: boolean; value: number | null }>;
  readonly resolveDefault: (
    property: ImportedRunHalfPointProperty,
  ) => Readonly<{ valid: boolean; value: number | null }>;
}

function normalizeImportedStyleId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value === value.trim() &&
    value.length > 0 &&
    value.length <= 128 &&
    !/[\u0000-\u001f]/.test(value)
    ? value
    : null;
}

function normalizeImportedStyleName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value === value.trim() &&
    value.length > 0 &&
    value.length <= 256 &&
    !/[\u0000-\u001f]/.test(value)
    ? value
    : null;
}

function importedHalfPointProperty(
  rPr: Readonly<Record<string, unknown>> | null,
  property: ImportedRunHalfPointProperty,
): Readonly<{ valid: boolean; present: boolean; value: number | null }> {
  if (!rPr || !(property in rPr)) {
    return { valid: true, present: false, value: null };
  }
  const raw = rPr[property];
  const value =
    property === "kernHalfPoints"
      ? // A style's `w:kern w:val="0"` is its word that kerning is off over
        // a base that kerns (style extractor 2): a value of this level, which
        // ends the chain here; `importedEffectiveRunProperty` reads it as off.
        raw === STYLE_KERNING_OFF_HALF_POINTS
        ? STYLE_KERNING_OFF_HALF_POINTS
        : normalizeKerningThresholdHalfPoints(raw)
      : typeof raw === "number" &&
          Number.isSafeInteger(raw) &&
          raw >= 2 &&
          raw <= MAX_KERNING_THRESHOLD_HALF_POINTS
        ? raw
        : null;
  return { valid: value !== null, present: true, value };
}

/**
 * Build one bounded, immutable resolver for the imported style graph. The
 * opaque raw styles part stays under its existing custody; this reads only the
 * semantic style ids, basedOn edges and two half-point properties needed by
 * the live typography renderer.
 */
function createImportedStylePropertyResolver(
  state: EditorState,
): ImportedStylePropertyResolver {
  const rawDefinitions = state.doc.attrs.styleDefinitions;
  if (rawDefinitions === null || rawDefinitions === undefined) {
    return {
      available: false,
      valid: true,
      resolve: () => ({ valid: false, value: null }),
      resolveDefault: () => ({ valid: true, value: null }),
    };
  }
  if (
    !rawDefinitions ||
    typeof rawDefinitions !== "object" ||
    Array.isArray(rawDefinitions)
  ) {
    return {
      available: true,
      valid: false,
      resolve: () => ({ valid: false, value: null }),
      resolveDefault: () => ({ valid: false, value: null }),
    };
  }
  const definitions = rawDefinitions as Record<string, unknown>;
  const rawStyles = definitions.styles;
  if (
    definitions.version !== 1 ||
    !Array.isArray(rawStyles) ||
    rawStyles.length > 512
  ) {
    return {
      available: true,
      valid: false,
      resolve: () => ({ valid: false, value: null }),
      resolveDefault: () => ({ valid: false, value: null }),
    };
  }

  const styles = new Map<string, ImportedStyleRecord>();
  let invalidDefaultParagraphStyle = false;
  const declaredDefaultParagraphStyles: string[] = [];
  const namedNormalParagraphStyles: string[] = [];
  for (const rawStyle of rawStyles) {
    if (!rawStyle || typeof rawStyle !== "object" || Array.isArray(rawStyle)) {
      return {
        available: true,
        valid: false,
        resolve: () => ({ valid: false, value: null }),
        resolveDefault: () => ({ valid: false, value: null }),
      };
    }
    const style = rawStyle as Record<string, unknown>;
    const styleId = normalizeImportedStyleId(style.styleId);
    const name = normalizeImportedStyleName(style.name);
    const type =
      typeof style.type === "string" &&
      ["character", "numbering", "paragraph", "table"].includes(style.type)
        ? style.type
        : null;
    const isDefault = style.default === true;
    const hasValidDefault =
      style.default === undefined ||
      style.default === null ||
      typeof style.default === "boolean";
    const basedOn =
      style.basedOn === null || style.basedOn === undefined
        ? null
        : normalizeImportedStyleId(style.basedOn);
    const rPr =
      style.rPr === null || style.rPr === undefined
        ? null
        : typeof style.rPr === "object" && !Array.isArray(style.rPr)
          ? (style.rPr as Record<string, unknown>)
          : undefined;
    if (
      !styleId ||
      !name ||
      !type ||
      !hasValidDefault ||
      styles.has(styleId) ||
      (basedOn === null && style.basedOn != null) ||
      rPr === undefined
    ) {
      return {
        available: true,
        valid: false,
        resolve: () => ({ valid: false, value: null }),
        resolveDefault: () => ({ valid: false, value: null }),
      };
    }
    styles.set(styleId, {
      basedOn,
      default: isDefault,
      name,
      rPr,
      type,
    });
    if (isDefault && type === "paragraph") {
      declaredDefaultParagraphStyles.push(styleId);
    }
    if (styleId === "Normal" || name.toLowerCase() === "normal") {
      if (type !== "paragraph") invalidDefaultParagraphStyle = true;
      else namedNormalParagraphStyles.push(styleId);
    }
  }

  const defaultParagraphCandidates =
    declaredDefaultParagraphStyles.length > 0
      ? declaredDefaultParagraphStyles
      : [...new Set(namedNormalParagraphStyles)];
  if (defaultParagraphCandidates.length > 1) {
    invalidDefaultParagraphStyle = true;
  }
  const defaultParagraphStyleId = defaultParagraphCandidates[0] ?? null;

  const rawDefaults = definitions.docDefaults;
  const defaultRPr =
    rawDefaults === null || rawDefaults === undefined
      ? null
      : typeof rawDefaults === "object" && !Array.isArray(rawDefaults)
        ? (() => {
            const value = (rawDefaults as Record<string, unknown>).rPr;
            return value === null || value === undefined
              ? null
              : typeof value === "object" && !Array.isArray(value)
                ? (value as Record<string, unknown>)
                : undefined;
          })()
        : undefined;
  if (defaultRPr === undefined) {
    return {
      available: true,
      valid: false,
      resolve: () => ({ valid: false, value: null }),
      resolveDefault: () => ({ valid: false, value: null }),
    };
  }

  const caches = new Map<
    ImportedRunHalfPointProperty,
    Map<string, Readonly<{ valid: boolean; value: number | null }>>
  >();
  const chainValidity = new Map<string, boolean>();
  const hasValidChain = (
    styleId: string,
    expectedType: "character" | "paragraph",
  ): boolean => {
    const cached = chainValidity.get(`${expectedType}:${styleId}`);
    if (cached !== undefined) return cached;
    const seen = new Set<string>();
    let current: string | null = styleId;
    while (current) {
      if (seen.has(current)) {
        chainValidity.set(`${expectedType}:${styleId}`, false);
        return false;
      }
      seen.add(current);
      const style = styles.get(current);
      if (!style || style.type !== expectedType) {
        chainValidity.set(`${expectedType}:${styleId}`, false);
        return false;
      }
      current = style.basedOn;
    }
    chainValidity.set(`${expectedType}:${styleId}`, true);
    return true;
  };
  const resolve = (
    styleId: string,
    property: ImportedRunHalfPointProperty,
    expectedType: "character" | "paragraph",
  ): Readonly<{ valid: boolean; value: number | null }> => {
    if (!hasValidChain(styleId, expectedType)) {
      return { valid: false, value: null };
    }
    const cache = caches.get(property) ?? new Map();
    caches.set(property, cache);
    const visit = (
      id: string,
      resolving: Set<string>,
    ): Readonly<{ valid: boolean; value: number | null }> => {
      const cached = cache.get(id);
      if (cached) return cached;
      const style = styles.get(id);
      if (!style || resolving.has(id)) return { valid: false, value: null };
      if (style.type !== expectedType) return { valid: false, value: null };
      const own = importedHalfPointProperty(style.rPr, property);
      if (!own.valid) return { valid: false, value: null };
      if (own.present) {
        const result = { valid: true, value: own.value } as const;
        cache.set(id, result);
        return result;
      }
      if (!style.basedOn) {
        const result = { valid: true, value: null } as const;
        cache.set(id, result);
        return result;
      }
      const nextResolving = new Set(resolving);
      nextResolving.add(id);
      const result = visit(style.basedOn, nextResolving);
      if (result.valid) cache.set(id, result);
      return result;
    };
    return visit(styleId, new Set());
  };
  return {
    available: true,
    valid: true,
    resolve,
    resolveDefault: (property) => {
      if (invalidDefaultParagraphStyle) {
        return { valid: false, value: null };
      }
      if (defaultParagraphStyleId) {
        const inherited = resolve(
          defaultParagraphStyleId,
          property,
          "paragraph",
        );
        if (!inherited.valid || inherited.value !== null) return inherited;
      }
      const own = importedHalfPointProperty(defaultRPr, property);
      return own.valid
        ? { valid: true, value: own.present ? own.value : null }
        : { valid: false, value: null };
    },
  };
}

function textBlockAt(state: EditorState, pos: number): ProseMirrorNode | null {
  const resolved = state.doc.resolve(
    Math.max(0, Math.min(pos, state.doc.content.size)),
  );
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    const ancestor = resolved.node(depth);
    if (ancestor.isTextblock) return ancestor;
  }
  return null;
}

function importedEffectiveRunProperty(
  state: EditorState,
  pos: number,
  target: ProseMirrorNode | null,
  resolver: ImportedStylePropertyResolver,
  property: ImportedRunHalfPointProperty,
): Readonly<{ valid: boolean; value: number | null }> {
  const result = importedStatedRunProperty(state, pos, target, resolver, property);
  // The nearest level that states a kern states 0: Word draws the run
  // unkerned whatever its bases say, the same as no threshold at all.
  return property === "kernHalfPoints" && result.valid && result.value === STYLE_KERNING_OFF_HALF_POINTS
    ? { valid: true, value: null }
    : result;
}

/** The value of the nearest level of the chain that states the property. */
function importedStatedRunProperty(
  state: EditorState,
  pos: number,
  target: ProseMirrorNode | null,
  resolver: ImportedStylePropertyResolver,
  property: ImportedRunHalfPointProperty,
): Readonly<{ valid: boolean; value: number | null }> {
  const characterStyle = target?.marks.find(
    (mark) => mark.type.name === CHARACTER_STYLE_MARK,
  );
  const rawCharacterStyleId = characterStyle?.attrs.styleId;
  if (rawCharacterStyleId !== null && rawCharacterStyleId !== undefined) {
    const styleId = normalizeImportedStyleId(rawCharacterStyleId);
    if (!styleId || !resolver.available || !resolver.valid) {
      return { valid: false, value: null };
    }
    const result = resolver.resolve(styleId, property, "character");
    if (!result.valid || result.value !== null) return result;
  }

  const block = textBlockAt(state, pos);
  const rawParagraphStyleId = block?.attrs.docxStyleId;
  if (rawParagraphStyleId !== null && rawParagraphStyleId !== undefined) {
    const styleId = normalizeImportedStyleId(rawParagraphStyleId);
    if (!styleId || !resolver.available || !resolver.valid) {
      return { valid: false, value: null };
    }
    const result = resolver.resolve(styleId, property, "paragraph");
    if (!result.valid || result.value !== null) return result;
  }

  return resolver.valid
    ? resolver.resolveDefault(property)
    : { valid: false, value: null };
}

function documentDefaultFontSizePx(state: EditorState): number | null {
  const rawDefault = state.doc.attrs.defaultFontSize;
  const normalized =
    rawDefault === null || rawDefault === undefined
      ? `${DEFAULT_DOCUMENT_FONT_SIZE_PX}px`
      : normalizeFontSize(rawDefault);
  return normalized ? fontSizeToPx(normalized) : null;
}

/**
 * Resolve the size an unmarked run actually inherits from the immutable
 * document. Only model-backed contexts whose identity is complete are
 * accepted; imported opaque styles, malformed defaults, code scaling, and
 * ambiguous palette references fail closed before a transaction is touched.
 */
function inheritedFontSizePx(
  state: EditorState,
  pos: number,
  target: ProseMirrorNode | null,
  styleResolver: ImportedStylePropertyResolver,
): number | null {
  if (
    target?.isText &&
    target.marks.some((mark) => mark.type.name === "code")
  ) {
    return null;
  }

  const block = textBlockAt(state, pos);
  if (!block) {
    return target && MATH_NODE_NAMES.has(target.type.name)
      ? documentDefaultFontSizePx(state)
      : null;
  }

  const rawParagraphSize = block.attrs.paragraphFontSize;
  if (rawParagraphSize !== null && rawParagraphSize !== undefined) {
    const normalized = normalizeFontSize(rawParagraphSize);
    return normalized ? fontSizeToPx(normalized) : null;
  }

  const imported = importedEffectiveRunProperty(
    state,
    pos,
    target,
    styleResolver,
    "fontSizeHalfPoints",
  );
  if (!imported.valid) return null;
  if (imported.value !== null) return imported.value * (2 / 3);

  const rawCustomId = block.attrs.customStyleId;
  const rawCustomName = block.attrs.customStyleName;
  if (
    (rawCustomId !== null && rawCustomId !== undefined) ||
    (rawCustomName !== null && rawCustomName !== undefined)
  ) {
    const customId =
      typeof rawCustomId === "string" && rawCustomId === rawCustomId.trim()
        ? rawCustomId
        : null;
    const customName =
      typeof rawCustomName === "string" &&
      rawCustomName === rawCustomName.trim()
        ? rawCustomName
        : null;
    if (!customId && !customName) return null;
    const palette = state.doc.attrs.namedStyles;
    if (!Array.isArray(palette)) return null;
    const matches = palette.filter((rawStyle) => {
      if (
        !rawStyle ||
        typeof rawStyle !== "object" ||
        Array.isArray(rawStyle)
      ) {
        return false;
      }
      const style = rawStyle as Record<string, unknown>;
      return customId
        ? style.styleId === customId &&
            (!customName || style.name === customName)
        : style.name === customName;
    });
    if (matches.length !== 1) return null;
    const rawSize = (matches[0] as Record<string, unknown>).fontSize;
    if (rawSize === null || rawSize === undefined) {
      return documentDefaultFontSizePx(state);
    }
    const normalized = normalizeFontSize(rawSize);
    return normalized ? fontSizeToPx(normalized) : null;
  }

  if (block.type.name === "heading") {
    const level = block.attrs.level;
    return typeof level === "number" && Number.isInteger(level)
      ? (HEADING_FONT_SIZE_PX[level] ?? null)
      : null;
  }
  if (block.type.name === "paragraph") {
    return block.attrs.dropCap === "dropped"
      ? null
      : documentDefaultFontSizePx(state);
  }
  return null;
}

export interface EffectiveKerningThresholdAuthority {
  readonly valid: boolean;
  readonly halfPoints: number | null;
  readonly fontSizePx: number | null;
  readonly direct: boolean;
}

/**
 * Create one bounded resolver for an immutable editor state. Direct formatting
 * wins over styleDefinitions; otherwise the character-style, paragraph-style,
 * basedOn and docDefaults chain is resolved without flattening it into a run
 * mark. The same authenticated size resolver powers Font-step commands and the
 * deterministic kerning decoration.
 */
export function createEffectiveKerningThresholdResolver(
  state: EditorState,
): (
  pos: number,
  target: ProseMirrorNode,
) => EffectiveKerningThresholdAuthority {
  const styleResolver = createImportedStylePropertyResolver(state);
  return (pos, target) => {
    const mark = target.marks.find(
      (candidate) => candidate.type.name === KERNING_THRESHOLD_MARK,
    );
    const markAuthority = mark
      ? normalizeKerningThresholdMarkAuthority(mark.attrs)
      : null;
    if (mark && !markAuthority) {
      return {
        valid: false,
        halfPoints: null,
        fontSizePx: null,
        direct: false,
      };
    }

    const inherited = markAuthority
      ? {
          valid: true,
          // A direct 0 turns kerning off: no threshold applies.
          value: markAuthority.halfPoints === 0 ? null : markAuthority.halfPoints,
        }
      : importedEffectiveRunProperty(
          state,
          pos,
          target,
          styleResolver,
          "kernHalfPoints",
        );
    if (!inherited.valid) {
      return {
        valid: false,
        halfPoints: null,
        fontSizePx: null,
        direct: false,
      };
    }

    const explicitSize = target.marks.find(
      (candidate) => candidate.type.name === FONT_SIZE_MARK,
    );
    const normalizedSize = explicitSize
      ? normalizeFontSize(explicitSize.attrs.size)
      : null;
    if (explicitSize && !normalizedSize) {
      return {
        valid: false,
        halfPoints: null,
        fontSizePx: null,
        direct: false,
      };
    }
    const fontSizePx = normalizedSize
      ? fontSizeToPx(normalizedSize)
      : inheritedFontSizePx(state, pos, target, styleResolver);
    return {
      valid: inherited.value === null || fontSizePx !== null,
      halfPoints: inherited.value,
      fontSizePx,
      direct: markAuthority?.provenance === "direct",
    };
  };
}

const kerningRenderingPluginKey = new PluginKey<DecorationSet>(
  "docsKerningThresholdRendering",
);

export interface DocumentFontDescriptor {
  readonly family: string;
  readonly face?: OfficeFontFace;
}

export function documentFontDescriptor(
  family: unknown,
  rawFace?: unknown,
): DocumentFontDescriptor | null {
  const face = normalizeOfficeFontFace(rawFace);
  const normalized =
    normalizeFontFamily(family) ?? normalizeFontFamily(face?.family);
  return normalized ? { family: normalized, ...(face ? { face } : {}) } : null;
}

export function documentFontDescriptorStyle(
  value: DocumentFontDescriptor,
): string {
  return value.face
    ? officeFontFaceStyle(value.face)
    : `font-family: ${fontFamilyWithCjkRenderFallback(value.family) ?? value.family}`;
}

/** Render-only font routing; raw marks still independently represent w:ascii/
 * hAnsi and w:eastAsia. Full adjacent text, not each marked fragment, determines
 * graphemes, so a mark boundary cannot split a combining/ZWJ sequence. */
export interface DocumentFontScriptRange {
  readonly from: number;
  readonly to: number;
  readonly slot: FontScriptSlot;
  readonly value: DocumentFontDescriptor | null;
  readonly node: ProseMirrorNode;
}
const fontScriptPlanCache = new WeakMap<
  ProseMirrorNode,
  { readonly defaultEastAsia: string | null; readonly plan: readonly DocumentFontScriptRange[] }
>();
/** `window.__docsDefaultEastAsianOff = true` asks the older reading (the
 * defaults' East Asian text in their stack's first face), for an A/B of one build. */
function defaultEastAsianSlotOff(): boolean {
  return typeof window !== "undefined" && (window as Window & {__docsDefaultEastAsianOff?: boolean}).__docsDefaultEastAsianOff === true;
}
/**
 * The face the document's defaults set their East Asian text in where their
 * stack's first face is an East Asian face of the ascii slot
 * (`defaultEastAsianFontFamily`, the eastAsia slot of Normal/docDefaults).
 * Word picks a character's face by the character (17.3.2.26): R313-D27 names
 * 宋体 for ascii over the theme's ＭＳ 明朝, and Word sets its Han text in MS
 * Mincho (YaHei where it lacks a glyph), not in the stack's first face.
 */
export function documentDefaultEastAsianFontFamily(doc: ProseMirrorNode): string | null {
  if (defaultEastAsianSlotOff()) return null;
  return normalizeFontFamily(doc.attrs.defaultEastAsianFontFamily);
}
/** `window.__docsLatinRunEastAsianOff = true` asks the older reading (a run
 * naming only a Latin face sets its East Asian text in that face's stack),
 * for an A/B of one build. */
function latinRunInheritedEastAsianOff(): boolean {
  return typeof window !== "undefined" && (window as Window & {__docsLatinRunEastAsianOff?: boolean}).__docsLatinRunEastAsianOff === true;
}
const latinRunEastAsianFaces = new WeakMap<object, (stack: unknown) => string | null>();
/**
 * The East Asian face a family stack the document states carries behind its
 * first face, or null: the first token the document declares East Asian
 * (its font table's signed faces) or Word records as one. The page's own CJK
 * render fallbacks are not in the stacks the document states.
 */
function stackEastAsianFace(doc: ProseMirrorNode): (stack: unknown) => string | null {
  const key = doc.attrs as object;
  let read = latinRunEastAsianFaces.get(key);
  if (!read) {
    const declared = new Set(
      (normalizeEastAsianFontFamilies(doc.attrs.eastAsianFontFamilies) ?? [])
        .filter((family) => !wordFontIsRecordedLatin(family))
        .map((family) => family.toLowerCase()),
    );
    const isEastAsian = (name: string) => declared.has(name.toLowerCase()) || wordFontIsEastAsian(name);
    read = (stack: unknown) => {
      if (typeof stack !== "string") return null;
      const tokens = stack.split(",").map(unquotedFontFamilyToken).filter(Boolean);
      return tokens.find(isEastAsian) ?? null;
    };
    latinRunEastAsianFaces.set(key, read);
  }
  return read;
}
export function documentFontScriptRanges(
  state: EditorState,
  from = 0,
  to = state.doc.content.size,
): DocumentFontScriptRange[] {
  const result: DocumentFontScriptRange[] = [];
  const defaultEastAsia = documentDefaultEastAsianFontFamily(state.doc);
  // A run that names only its Latin face (w:rFonts w:ascii/w:hAnsi, no
  // w:eastAsia) inherits the eastAsia slot slot by slot (17.3.2.26): from its
  // paragraph's face, else from the defaults. Word sets its East Asian text
  // there: corpus R382-D30, Japanese in Times New Roman runs under a ja-JP
  // theme, is Yu Mincho in Word, 20.08 pt a 12 pt line; drawn in the run's
  // Latin stack it ran 13.8 pt, a page short.
  const eastAsianOf = stackEastAsianFace(state.doc);
  const inheritedOff = latinRunInheritedEastAsianOff();
  const defaultsEastAsia = inheritedOff ? null : defaultEastAsia ?? eastAsianOf(state.doc.attrs.defaultFontFamily);
  const memoKey = `${defaultEastAsia ?? ""}\u0000${defaultsEastAsia ?? ""}`;
  state.doc.nodesBetween(from, to, (block, blockPos) => {
    if (!block.isTextblock) return true;
    const memo = fontScriptPlanCache.get(block);
    const cached = memo && memo.defaultEastAsia === memoKey ? memo.plan : null;
    if (cached) {
      for (const range of cached)
        result.push({
          ...range,
          from: range.from + blockPos + 1,
          to: range.to + blockPos + 1,
        });
      return false;
    }
    const plan: DocumentFontScriptRange[] = [];
    let entries: Array<
      {
        node: ProseMirrorNode;
        pos: number;
      } & FontScriptSpan<DocumentFontDescriptor>
    > = [];
    const flush = () => {
      if (!entries.some((entry) => entry.eastAsia || entry.complexScript)) {
        for (const entry of entries)
          plan.push({
            from: entry.pos,
            to: entry.pos + entry.node.nodeSize,
            slot: "primary",
            value: entry.primary,
            node: entry.node,
          });
        entries = [];
        return;
      }
      for (const slice of resolveFontScriptSlices(entries)) {
        const entry = entries[slice.index];
        plan.push({
          from: entry.pos + slice.from,
          to: entry.pos + slice.to,
          slot: slice.slot,
          value: slice.value,
          node: entry.node,
        });
      }
      entries = [];
    };
    // The eastAsia face a run naming only a Latin face inherits: its
    // paragraph's, else the defaults'. Not for a run hinted East Asian or
    // complex script (its "Latin" mark is that slot's face) nor one whose own
    // stack already names an East Asian face.
    const blockEastAsia = block.attrs.fontFamily ? eastAsianOf(block.attrs.fontFamily) : defaultsEastAsia;
    const inheritedEastAsia = (latin: { attrs: Record<string, unknown> }): string | null => {
      if (inheritedOff || !blockEastAsia || normalizeWordFontHint(latin.attrs.hint)) return null;
      return eastAsianOf(latin.attrs.family) ? null : blockEastAsia;
    };
    block.descendants((node, localPos) => {
      if (!node.isText) {
        flush();
        return !node.isAtom;
      }
      const pos = localPos;
      if (
        entries.length &&
        entries.at(-1)!.pos + entries.at(-1)!.node.nodeSize !== pos
      )
        flush();
      const latin = node.marks.find(
        (mark) => mark.type.name === FONT_FAMILY_MARK,
      );
      const cjk = node.marks.find(
        (mark) => mark.type.name === FONT_CJK_FAMILY_MARK,
      );
      const complexScript = node.marks.find(
        (mark) => mark.type.name === FONT_COMPLEX_FAMILY_MARK,
      );
      entries.push({
        node,
        pos,
        text: node.text ?? "",
        ...(normalizeWordFontHint(latin?.attrs.hint) ? { word: {
          hint: normalizeWordFontHint(latin?.attrs.hint)!,
          eastAsiaCharset: normalizeWordFontHintCharset(latin?.attrs.hintCharset),
          language: node.marks.find(mark => mark.type.name === "proofingLanguage")?.attrs.eastAsia
            ?? normalizeWordFontHintLanguage(latin?.attrs.hintLanguage)
            ?? node.marks.find(mark => mark.type.name === "proofingLanguage")?.attrs.val,
          // Word explicitly gives this resolved-font exception in MS-OI29500 2.1.88.
          eastAsiaUsesPrimary: unquotedFontFamilyToken(String(cjk?.attrs.family ?? "").split(",")[0]).toLowerCase() === "times new roman",
        } } : {}),
        primary: documentFontDescriptor(
          latin?.attrs.family ?? block.attrs.fontFamily,
          latin?.attrs.face,
        ),
        eastAsia: documentFontDescriptor(
          cjk?.attrs.family ?? block.attrs.fontCjkFamily ??
            // A run that names no face takes the defaults' eastAsia slot.
            (!latin && !block.attrs.fontFamily ? defaultEastAsia : null) ??
            (latin ? inheritedEastAsia(latin) : null),
          cjk?.attrs.face,
        ),
        complexScript: documentFontDescriptor(
          complexScript?.attrs.family,
          complexScript?.attrs.face,
        ),
      });
      return false;
    });
    flush();
    fontScriptPlanCache.set(block, { defaultEastAsia: memoKey, plan });
    for (const range of plan)
      result.push({
        ...range,
        from: range.from + blockPos + 1,
        to: range.to + blockPos + 1,
      });
    return false;
  });
  return result;
}
/** The two slots a mark does not paint by itself: the Latin mark renders its
 * own font-family, while the East Asian and complex-script faces belong to the
 * characters the script routing puts in their slot, not to the whole run. */
function fontScriptDecorations(
  state: EditorState,
  from?: number,
  to?: number,
): Decoration[] {
  return documentFontScriptRanges(state, from, to).flatMap((range) =>
    (range.slot === "eastAsia" || range.slot === "cs") && range.value
      ? [
          Decoration.inline(
            range.from,
            range.to,
            {
              "data-office-font-slot": range.slot,
              style: documentFontDescriptorStyle(range.value),
            },
            { inclusiveStart: false, inclusiveEnd: false },
          ),
        ]
      : [],
  );
}

/** The synchronous/static counterpart for schema HTML. Preview/measurement/
 * structural print clone the live decorations; HTML serialization does not. */
export function projectDocumentFontSlotsToDom(root: HTMLElement): void {
  for (const element of root.querySelectorAll<HTMLElement>(
    "[data-cjk-font-family],[data-cs-font-family]",
  )) {
    if (!element.hasAttribute("data-font-family"))
      element.style.removeProperty("font-family");
  }
  let entries: Array<{ node: Text } & FontScriptSpan<DocumentFontDescriptor>> =
    [];
  const flush = () => {
    if (!entries.some((entry) => entry.eastAsia || entry.complexScript)) {
      entries = [];
      return;
    }
    const slices = resolveFontScriptSlices(entries);
    const byIndex = new Map<number, typeof slices>();
    for (const slice of slices) {
      const parts = byIndex.get(slice.index) ?? [];
      parts.push(slice);
      byIndex.set(slice.index, parts);
    }
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index],
        parts = byIndex.get(index) ?? [];
      if (!parts.some((part) => part.slot !== "primary" && part.value))
        continue;
      const fragment = entry.node.ownerDocument.createDocumentFragment();
      for (const part of parts) {
        const text = entry.text.slice(part.from, part.to);
        if (part.slot === "primary" || !part.value)
          fragment.append(entry.node.ownerDocument.createTextNode(text));
        else {
          const span = entry.node.ownerDocument.createElement("span");
          span.dataset.officeFontSlot = part.slot;
          span.setAttribute("style", documentFontDescriptorStyle(part.value));
          span.textContent = text;
          fragment.append(span);
        }
      }
      entry.node.replaceWith(fragment);
    }
    entries = [];
  };
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      const text = node as Text;
      if (!text.length) return;
      let primary: DocumentFontDescriptor | null = null,
        eastAsia: DocumentFontDescriptor | null = null,
        complexScript: DocumentFontDescriptor | null = null;
      let hint: WordFontHint | null = null, language: string | null = null, primaryLanguage: string | null = null, hintLanguage: string | null = null, hintCharset: "86" | "88" | null = null;
      for (
        let element = text.parentElement;
        element;
        element = element.parentElement
      ) {
        if (!primary)
          primary = documentFontDescriptor(
            element.getAttribute("data-font-family") ??
              element.getAttribute("data-code-font-family"),
            parseOfficeFontFace(element.getAttribute("data-office-font-face")),
          );
        if (!eastAsia)
          eastAsia = documentFontDescriptor(
            element.getAttribute("data-cjk-font-family") ??
              element.getAttribute("data-code-font-cjk-family"),
            parseOfficeFontFace(
              element.getAttribute("data-office-cjk-font-face"),
            ),
          );
        if (!complexScript)
          complexScript = documentFontDescriptor(
            element.getAttribute("data-cs-font-family"),
            parseOfficeFontFace(element.getAttribute("data-office-cs-font-face")),
          );
        hint ??= normalizeWordFontHint(element.getAttribute("data-office-font-hint"));
        language ??= element.getAttribute("data-proofing-language-east-asia") || null;
        primaryLanguage ??= element.getAttribute("data-proofing-language") || element.getAttribute("lang");
        hintLanguage ??= normalizeWordFontHintLanguage(element.getAttribute("data-office-font-hint-language"));
        hintCharset ??= normalizeWordFontHintCharset(element.getAttribute("data-office-font-hint-charset"));
        if (element === root) break;
      }
      entries.push({ node: text, text: text.data, primary, eastAsia, complexScript, ...(hint ? { word: { hint, language: language ?? hintLanguage ?? primaryLanguage, eastAsiaCharset: hintCharset,
        eastAsiaUsesPrimary: unquotedFontFamilyToken((eastAsia?.family ?? "").split(",")[0]).toLowerCase() === "times new roman",
      } } : {}) });
      return;
    }
    if (node.nodeType !== 1) return;
    const element = node as HTMLElement;
    if (
      element.matches(
        '[data-office-font-slot],.katex,[data-latex],[contenteditable="false"],br,hr,script,style',
      )
    ) {
      flush();
      return;
    }
    const block =
      element !== root &&
      element.matches("p,h1,h2,h3,h4,h5,h6,li,pre,td,th,div,section,article");
    if (block) flush();
    for (const child of Array.from(element.childNodes)) walk(child);
    if (block) flush();
  };
  walk(root);
  flush();
}

function kerningDecoration(
  resolveKerning: ReturnType<typeof createEffectiveKerningThresholdResolver>,
  node: ProseMirrorNode,
  pos: number,
): Decoration {
  const authority = resolveKerning(pos, node);
  const enabled =
    authority.valid &&
    authority.halfPoints !== null &&
    authority.fontSizePx !== null &&
    authority.fontSizePx * 1.5 >= authority.halfPoints;
  return Decoration.inline(pos, pos + node.nodeSize, {
    "data-docs-effective-kerning": enabled ? "on" : "off",
    style: `font-kerning: ${enabled ? "normal" : "none"}`,
  });
}

export function buildKerningRenderingDecorations(state: EditorState): DecorationSet {
  const resolveKerning = createEffectiveKerningThresholdResolver(state);
  const decorations: Decoration[] = [];
  state.doc.descendants((node, pos) => {
    if (!node.isText) return true;
    decorations.push(kerningDecoration(resolveKerning, node, pos));
    return false;
  });
  return DecorationSet.create(state.doc, [
    ...decorations,
    ...fontScriptDecorations(state),
  ]);
}

/** What `buildKerningRenderingDecorations` draws for the textblock at
 * `pos`: its runs' kerning and its East Asian / complex-script font slots. */
function textblockKerningRenderingDecorations(
  state: EditorState,
  resolveKerning: ReturnType<typeof createEffectiveKerningThresholdResolver>,
  block: ProseMirrorNode,
  pos: number,
): Decoration[] {
  const decorations: Decoration[] = [];
  block.descendants((node, offset) => {
    if (!node.isText) return true;
    decorations.push(kerningDecoration(resolveKerning, node, pos + 1 + offset));
    return false;
  });
  return [...decorations, ...fontScriptDecorations(state, pos, pos + block.nodeSize)];
}

/** The document attributes the page ledger writes as it lays pages out:
 * no run's kerning or font depends on them. */
const LAYOUT_DOC_ATTRS = new Set(["pageBlockSizes", "pageBlockLayoutKey", "pageRegionLayoutReceipt"]);

function sameDocumentStyling(before: ProseMirrorNode, after: ProseMirrorNode): boolean {
  if (before.attrs === after.attrs) return true;
  const keys = new Set([...Object.keys(before.attrs), ...Object.keys(after.attrs)]);
  for (const key of keys) {
    if (LAYOUT_DOC_ATTRS.has(key)) continue;
    if (before.attrs[key] !== after.attrs[key]) return false;
  }
  return true;
}

/** Steps whose reach `touchedTextblocks` knows. */
function knownStep(step: Step): boolean {
  return (
    step instanceof ReplaceStep ||
    step instanceof ReplaceAroundStep ||
    step instanceof AddMarkStep ||
    step instanceof RemoveMarkStep ||
    step instanceof AttrStep ||
    step instanceof DocAttrStep ||
    step instanceof AddNodeMarkStep ||
    step instanceof RemoveNodeMarkStep
  );
}

/**
 * The kerning decorations mapped through `tr` at the cost of what it touches
 * (mapDecorationsFast): a page move or a fill chunk of a long document took
 * every decoration of the sheets it reached through every one of its steps
 * (R492-D04's print: 25 s of 850). `window.__docsKerningFastMapOff = true`:
 * through `tr.mapping`, as before.
 */
function mapKerningDecorations(current: DecorationSet, tr: Transaction): DecorationSet {
  const off =
    (globalThis as { __docsKerningFastMapOff?: boolean }).__docsKerningFastMapOff === true;
  return off ? current.map(tr.mapping, tr.doc) : mapDecorationsFast(current, tr);
}

/**
 * The kerning and font-slot decorations after `tr`: a textblock's are its
 * own and the document's attributes' alone, so the set is mapped and only
 * the textblocks the transaction touched are drawn again (every page move
 * and keystroke rebuilt the whole book's: one decoration per run).
 */
function applyKerningRenderingDecorations(
  tr: Transaction,
  current: DecorationSet,
  newState: EditorState,
): DecorationSet {
  if (!sameDocumentStyling(tr.before, tr.doc) || !tr.steps.every(knownStep)) {
    return buildKerningRenderingDecorations(newState);
  }
  let next = mapKerningDecorations(current, tr);
  const touched = touchedTextblocks(tr);
  if (touched.size === 0) return next;
  const resolveKerning = createEffectiveKerningThresholdResolver(newState);
  const stale: Decoration[] = [];
  const added: Decoration[] = [];
  for (const pos of touched) {
    const block = tr.doc.nodeAt(pos);
    if (!block) continue;
    stale.push(...next.find(pos + 1, pos + block.nodeSize - 1));
    added.push(...textblockKerningRenderingDecorations(newState, resolveKerning, block, pos));
  }
  if (stale.length) next = next.remove(stale);
  return added.length ? next.add(tr.doc, added) : next;
}

function kerningRenderingPlugin(): Plugin<DecorationSet> {
  let composing = false;
  return new Plugin<DecorationSet>({
    key: kerningRenderingPluginKey,
    state: {
      init: (_config, state) => buildKerningRenderingDecorations(state),
      apply: (tr, current, _oldState, newState) =>
        composing
          ? current.map(tr.mapping, tr.doc)
          : tr.getMeta(BULK_FILL_CHUNK_META) === true && !tr.getMeta(kerningRenderingPluginKey)
            ? mappedThroughBulkFill(mapKerningDecorations(current, tr))
          : tr.getMeta(kerningRenderingPluginKey) || (tr.docChanged && rebuildsAfterFill(current))
            ? buildKerningRenderingDecorations(newState)
            : tr.docChanged
              ? applyKerningRenderingDecorations(tr, current, newState)
              : current,
    },
    props: {
      decorations(state) {
        return this.getState(state) ?? DecorationSet.empty;
      },
      handleDOMEvents: {
        compositionstart: () => {
          composing = true;
          return false;
        },
        compositionend: (view) => {
          composing = false;
          queueMicrotask(() => {
            if (!view.isDestroyed && !view.composing)
              view.dispatch(
                view.state.tr
                  .setMeta(kerningRenderingPluginKey, true)
                  .setMeta("addToHistory", false),
              );
          });
          return false;
        },
      },
    },
  });
}

type PlannedFontSizeChange =
  | Readonly<{ kind: "text"; from: number; to: number; size: string }>
  | Readonly<{
      kind: "math";
      pos: number;
      node: ProseMirrorNode;
      size: string;
    }>;

/**
 * Apply one size transform independently to every selected text run and math
 * atom. Planning is complete before `tr` is touched, so malformed imported
 * size authority fails closed rather than partially resizing a mixed range.
 */
function transformSelectedFontSizes(
  tr: Transaction,
  state: EditorState,
  transform: (currentPx: number | null) => string | null,
): boolean {
  const markType = state.schema.marks[FONT_SIZE_MARK];
  if (!markType || state.selection.empty) {
    tr.setMeta("preventDispatch", true);
    return false;
  }

  const plan: PlannedFontSizeChange[] = [];
  let invalid = false;
  const styleResolver = createImportedStylePropertyResolver(state);
  const nextSize = (
    rawSize: unknown,
    node: ProseMirrorNode,
    pos: number,
  ): string | null => {
    const hasExplicitSize = rawSize !== null && rawSize !== undefined;
    const current = hasExplicitSize ? normalizeFontSize(rawSize) : null;
    const currentPx = hasExplicitSize
      ? current !== null
        ? fontSizeToPx(current)
        : null
      : inheritedFontSizePx(state, pos, node, styleResolver);
    if (currentPx === null) {
      invalid = true;
      return null;
    }
    const next = transform(currentPx);
    if (!next) return null;
    const normalized = normalizeFontSize(next);
    if (!normalized) {
      invalid = true;
      return null;
    }
    return normalized === current ? null : normalized;
  };

  const { from, to } = state.selection;
  state.doc.nodesBetween(from, to, (node, pos, parent) => {
    if (invalid) return false;
    if (node.isText) {
      const start = Math.max(from, pos);
      const end = Math.min(to, pos + node.nodeSize);
      if (start >= end) return;
      const currentMark = node.marks.find((mark) => mark.type === markType);
      const size = nextSize(currentMark?.attrs.size, node, pos);
      if (size) plan.push({ kind: "text", from: start, to: end, size });
      return;
    }
    if (MATH_NODE_NAMES.has(node.type.name)) {
      const size = nextSize(node.attrs.fontSize, node, pos);
      if (size) plan.push({ kind: "math", pos, node, size });
      return false;
    }
    // A field's result (a TITLE, a date) is text the reader sees; Grow Font
    // on a line steps it with its words, as Set Font Size already did
    
    if (isTextBearingInlineAtom(node) && parent?.type.allowsMarkType(markType)) {
      const currentMark = node.marks.find((mark) => mark.type === markType);
      const size = nextSize(currentMark?.attrs.size, node, pos);
      if (size) plan.push({ kind: "text", from: pos, to: pos + node.nodeSize, size });
      return false;
    }
  });

  if (invalid) {
    tr.setMeta("preventDispatch", true);
    return false;
  }
  if (plan.length === 0) return false;
  for (const change of plan) {
    if (change.kind === "text") {
      tr.removeMark(change.from, change.to, markType);
      tr.addMark(
        change.from,
        change.to,
        markType.create({ size: change.size }),
      );
    } else {
      tr.setNodeMarkup(change.pos, undefined, {
        ...change.node.attrs,
        fontSize: change.size,
      });
    }
  }
  keepSelectedEquationSelected(tr, state);
  return true;
}

/** Word for Mac Command+] / Command+[: exact one-point adjustment. */
function stepFontSizeOnePoint(
  currentPx: number | null,
  direction: 1 | -1,
): string | null {
  const current = currentPx ?? DEFAULT_DOCUMENT_FONT_SIZE_PX;
  // The Ribbon displays points rounded to two decimals. Normalize through that
  // same boundary before adding one point so 10pt (stored as 13.3333px)
  // becomes exactly 11pt (14.6667px), without accumulating rounding drift.
  const currentPoints = pxToPtRounded(current);
  // Word's own range (1 to 1638 pt), not the old 96 px ladder cap.
  const next = documentFontSizePx(
    Math.min(OFFICE_FONT_SIZE_LIMITS.word.max, Math.max(pxToPt(WORD_MIN_FONT_SIZE_PX), currentPoints + direction)),
  );
  if (next === canonicalDocumentFontSizePx(current)) return null;
  return next;
}

// A font-family list is safe when every comma-separated token is either a
// generic keyword or a name made of letters/digits/CJK/space/dot/hyphen/
// underscore. Tokens are re-quoted canonically, so no quote/escape/`;`/url()
// fragment can ever reach the inline style.
const GENERIC_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
]);
const SAFE_FONT_NAME_RE =
  /^[A-Za-z0-9À-ɏ　-ヿ㐀-䶿一-鿿豈-﫿０-９Ａ-Ｚａ-ｚ가-힣 ._+-]{1,64}$/;

function sanitizeFontFamilyList(value: string): string | null {
  const tokens = value.split(",").map((token) => token.trim().replace(/^["']|["']$/g, ""));
  if (!tokens.length || tokens.some((token) => !token)) return null;
  const out: string[] = [];
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (GENERIC_FAMILIES.has(lower)) {
      out.push(lower);
      continue;
    }
    if (!SAFE_FONT_NAME_RE.test(token)) return null;
    out.push(/[^A-Za-z0-9-]/.test(token) ? `"${token}"` : token);
  }
  return out.join(", ");
}

export function normalizeFontFamily(value: unknown): FontFamilyValue | null {
  if (typeof value !== "string") return null;
  const preset = FONT_FAMILY_LOOKUP.get(fontFamilyKey(value));
  if (preset) return preset;
  const sanitized = sanitizeFontFamilyList(value.trim());
  return sanitized ? (sanitized as FontFamilyValue) : null;
}

// Rendering-only CJK fallbacks. The selected font remains the first face and
// the persisted `fontFamily` mark is never changed; these faces are appended
// only to the DOM style used by the editor, page preview and print/PDF clone.
// This mirrors the browser's normal per-glyph fallback while making the chain
// deterministic across macOS, Windows and the loaded Noto Sans SC web font.
// Hangul in a face without it: Word draws it in its Korean default, Batang
// (Word 16.86, measured: a ko-KR run in Calibri prints in Batang, every
// syllable 1 em, and wraps a 451 pt line where 0.865 em Apple SD Gothic Neo,
// the browser's own pick, fits a quarter more; corpus R54-D15). None of the
// Chinese faces above carries Hangul, so these decide only Hangul: Batang
// where it is installed, else AppleMyungjo, the Mac's 1 em Myungjo.
const HANGUL_RENDER_FALLBACKS = ["Batang", "AppleMyungjo"] as const;
const CJK_SANS_RENDER_FALLBACKS = [
  '"Noto Sans SC"',
  '"PingFang SC"',
  '"Microsoft YaHei"',
  ...HANGUL_RENDER_FALLBACKS,
] as const;
const CJK_SERIF_RENDER_FALLBACKS = [
  '"Noto Serif SC"',
  '"Songti SC"',
  "SimSun",
  '"Noto Sans SC"',
  ...HANGUL_RENDER_FALLBACKS,
] as const;
// Same faces, platform-installed ones first. Order decides which face PAINTS,
// and for an imported document that decides pagination: an installed face is
// there at first layout, a web font arrives whenever the network says so. The
// tail below is added for a named face that may exist nowhere, so it must lead
// with the faces that are certainly present; putting "Noto Sans SC" first
// repainted a whole document in a 1.448 em face where the ledger had measured a
// 1.4 em one, and pushed a page's trailing leading past the sheet. The
// Latin-primary tail keeps its established order and its established paint.
const CJK_SANS_NAMED_FACE_FALLBACKS = [
  '"PingFang SC"',
  '"Microsoft YaHei"',
  '"Noto Sans SC"',
  ...HANGUL_RENDER_FALLBACKS,
] as const;
const CJK_SERIF_NAMED_FACE_FALLBACKS = [
  '"Songti SC"',
  "SimSun",
  '"Noto Serif SC"',
  '"Noto Sans SC"',
  ...HANGUL_RENDER_FALLBACKS,
] as const;
const TERMINAL_GENERIC_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
]);
const KNOWN_CJK_RENDER_FACES = new Set([
  "noto sans sc",
  "noto serif sc",
  "noto sans cjk sc",
  "source han sans sc",
  "source han serif sc",
  "pingfang sc",
  "microsoft yahei",
  "simsun",
  "simhei",
  "kaiti",
  "fangsong",
  "songti sc",
  "heiti sc",
  "kaiti sc",
  "stheiti",
  "stkaiti",
  "stfangsong",
]);
/**
 * Faces with the same advance for every glyph as an Office face that browsers
 * usually lack. Word lays the runs out with the Office face; without it the
 * browser used the CJK tail's proportional Latin glyphs, so code paths set in
 * Aptos Mono wrapped a tenth shorter and a guide lost a page. Aptos Mono
 * advances 1229/2048 em for every glyph, as do Courier New and its
 * metric-compatible clones. Display only, like the CJK tail.
 */
const METRIC_COMPATIBLE_LATIN_FALLBACKS: ReadonlyMap<string, readonly string[]> = new Map([
  ["aptos mono", ['"Courier New"', '"Liberation Mono"', "Cousine"]],
]);
/**
 * Word names a face by its family; a Mac authoring tool writes the full name
 * instead ("Times New Roman Regular", "Arial Bold Italic"), which is a family
 * nowhere. Word substitutes the family the name is built on (the PANOSE it
 * stored for the name is the family's), and the browser matches families
 * only, so the family follows such a name. Display only, like the CJK tail:
 * the persisted mark keeps the authored name.
 */
const WORD_STYLE_NAMED_FACE_RE =
  /^(.+?) (?:Regular|Italic|Bold|Bold Italic|Oblique|Bold Oblique)$/i;
function styleNamedFaceFamily(face: string): string | null {
  const family = WORD_STYLE_NAMED_FACE_RE.exec(face)?.[1]?.trim() ?? "";
  return family && SAFE_FONT_NAME_RE.test(family) ? family : null;
}
/** Serif intent carried by the face name itself, for stacks with no generic. */
const CJK_SERIF_FACE_RE =
  /宋|明朝|明體|楷|仿宋|simsun|nsimsun|songti|stsong|noto serif|source han serif|kaiti|stkaiti|fangsong|stfangsong|mincho|batang/i;
const CJK_FONT_NAME_RE = /[　-ヿ㐀-䶿一-鿿豈-﫿가-힣]/;

function unquotedFontFamilyToken(token: string): string {
  return token.trim().replace(/^"|"$/g, "");
}

/**
 * Build a display-only font stack that keeps Chinese glyphs visible when the
 * selected Latin face has no CJK coverage. The returned value must never be
 * stored back into the document: `data-font-family` and DOCX w:rFonts retain
 * the exact normalized user choice.
 */
/** Faces that set Thai themselves: no Thai fallback is added behind them. */
const THAI_CAPABLE_FACE_RE =
  /thai|tahoma|angsana|browallia|cordia|dillenia|eucrosia|freesia|iris|jasmine|kodchiang|lily|leelawadee|thonburi|ayuthaya|krungthep|silom|sathu|sukhumvit|sarabun|arial unicode/i;
/** Latin faces Word takes as serif when it picks a Thai face for them. */
const SERIF_LATIN_FACE_RE =
  /cambria|times|georgia|garamond|book antiqua|palatino|century|bookman|baskerville|caladea|tinos|gelasio|liberation serif|constantia|perpetua|rockwell|^serif$/i;

/** Faces Word draws Hebrew, Arabic or Bengali in themselves (a face of the
 * script, a Unicode face, Courier New), and Arial, whose letters of those
 * scripts are its own metric-clone script parts: given no fallback. */
const OWN_COMPLEX_SCRIPT_FACE_RE =
  /arab|hebr|naskh|nasta|kufi|thuluth|majalla|aldhabi|typesetting|traditional|simplified|andalus|david|miriam|narkisim|gisha|levenim|aharoni|frank ?ruehl|\brod\b|courier|microsoft sans serif|lucida sans unicode|arial unicode|mangal|nirmala|vrinda|shonar|kalinga|noto|jameel|nafees|urdu|\bb (?:nazanin|lotus|zar|titr|mitra|yekan)\b|vazir|sahel|shabnam|dubai|sakkal|^arial$|^mrai /i;
/** Faces Windows Office draws those scripts in at widths the Excel table
 * measured for the face itself (office-complex-scales.json). */
const OWN_COMPLEX_SCALE_FACES = new Set(["times new roman", "calibri", "tahoma", "segoe ui"]);
/** Where Word's own advances differ from Excel's printed widths: Times New
 * Roman's Hebrew, whose advances Word lays out at exactly (R399-D17's Word
 * PDF, every letter = the font's hmtx, Windows and Mac alike), is 0.796 of
 * Noto Sans Hebrew's over a running text (R399-D17 0.7963, R305-D06 0.7959;
 * bold 0.80), where Excel prints it at 0.825 -- 3.6 % wide, and R399-D17's
 * pages ran a line or two longer each. Arial's 0.912 is its advances too. */
const WORD_COMPLEX_SCALES: Readonly<Record<string, Readonly<Partial<Record<"arabic" | "hebrew" | "bengali", number>>>>> = {
  "times new roman": { hebrew: 0.796 },
};

/** Word's face for Hebrew or Arabic in a face without them: Times New Roman
 * behind a serif face, Courier New behind a monospace one, Arial behind any
 * other (docx-look/probes/cjk15 b1, Windows Word, a run's face installed and
 * lacking Arabic: Georgia, Cambria, Book Antiqua, Garamond, SimSun, Batang,
 * Comic Sans MS, Gabriola, Segoe Print -> Times New Roman; Malgun Gothic,
 * Yu Gothic, Microsoft YaHei, Verdana, Candara, Century Gothic, Impact ->
 * Arial; Consolas -> Courier New). */
function wordComplexFallbackKey(key: string): "times new roman" | "arial" | null {
  if (/mono|consol|courier|menlo|monaco|lucida console/i.test(key)) return null;
  return SERIF_LATIN_FACE_RE.test(key) && !/sans/i.test(key) ? "times new roman" : "arial";
}
const WORD_COMPLEX_FALLBACK_FACES = { "times new roman": "Times New Roman", arial: "Arial" } as const;
/** Arial's Arabic alone: the core stylesheet's family of the Arabic blocks
 * in Arial's metric-clone part (then the installed Arial), which presentations
 * draw a missing complex-script face's words in (sync-office-fonts.mjs
 * MISSING_SCRIPT_FAMILY, presentation-font-face-reads.ts). */
const WORD_ARIAL_ARABIC_FAMILY = "MRAI Missing Script Arial";

/**
 * The face Word sets a run's Hebrew or Arabic in when the run's face (the
 * stack's first) has none: Times New Roman, Arial or Courier New, which the
 * line then takes its box from. Null for a face with its own (a face of the
 * script, Arial, Times New Roman, Calibri, Tahoma, Segoe UI, a generic).
 * Corpus R458-D53: Jameel Noori Nastaleeq, which Word lacks, set in its font
 * table's altName Malgun Gothic -- its Urdu in Arial, every line Arial's
 * 16.1 pt at 14 pt, where Malgun Gothic's East Asian line is 21 pt.
 */
export function wordComplexScriptFallbackFace(stack: string | null | undefined): string | null {
  const tokens = stack ? stack.split(",").map((token) => token.trim()).filter(Boolean) : [];
  const first = tokens.length ? unquotedFontFamilyToken(tokens[runFaceIndex(tokens)]!).trim() : "";
  if (!first || TERMINAL_GENERIC_FAMILIES.has(first.toLowerCase()) || OWN_COMPLEX_SCRIPT_FACE_RE.test(first)) return null;
  const key = first.toLowerCase();
  if (OWN_COMPLEX_SCALE_FACES.has(key)) return null;
  const as = wordComplexFallbackKey(key);
  return as ? WORD_COMPLEX_FALLBACK_FACES[as] : "Courier New";
}

/**
 * Hebrew, Arabic and Bengali at Windows Word's widths, right behind the
 * run's face (ahead of its stand-ins and every other fallback): the letters
 * of each script in its packaged Noto face at the width Office sets them in
 * (lib/spreadsheet/office-complex-scales, the table the sheet grid and its
 * PDF writer share; each family covers its script alone). A face that lacks
 * the script is drawn as Word draws it (probes/hebslot f1): a serif face's
 * letters in Times New Roman's, a sans face's in Arial's, a mono face's
 * left to Courier New further down. Corpus R399-D17: pandoc's Hebrew in
 * the theme's Cambria, Word Times New Roman, was set in the browser's own
 * Hebrew face, wider, and its pages ran long. Display only.
 * `window.__docsWordComplexWidthsOff = true` leaves the stack as it was (A/B).
 */
function withWordComplexScriptWidths(tokens: string[]): string[] {
  if (typeof window !== "undefined" &&
    (window as Window & {__docsWordComplexWidthsOff?: boolean}).__docsWordComplexWidthsOff === true) return tokens;
  const at = runFaceIndex(tokens);
  const first = at < tokens.length ? unquotedFontFamilyToken(tokens[at]!).trim() : "";
  if (!first || TERMINAL_GENERIC_FAMILIES.has(first.toLowerCase()) || OWN_COMPLEX_SCRIPT_FACE_RE.test(first)) return tokens;
  if (tokens.some((token) => unquotedFontFamilyToken(token).startsWith(OFFICE_COMPLEX_SCALE_PREFIX))) return tokens;
  const key = first.toLowerCase();
  const as = OWN_COMPLEX_SCALE_FACES.has(key) ? key : wordComplexFallbackKey(key);
  if (!as) return tokens;
  const families = officeComplexScaleStack(as, { ownScriptParts: false, scales: WORD_COMPLEX_SCALES[as] })
    .split(",").map((token) => token.trim()).filter(Boolean);
  // Arial's Arabic is Office's own advances (the metric-clone part behind
  // WORD_ARIAL_ARABIC_FAMILY, Arabic blocks only), ahead of Excel's
  // printed scale of Noto Sans Arabic, which sets Word's text 6 % narrow
  // (corpus R458-D53, Urdu Word lays at Arial's hmtx).
  // `window.__docsWordArialArabicPartOff = true`: the scale alone (A/B).
  const arialArabic = as === "arial" && !(typeof window !== "undefined" &&
    (window as Window & {__docsWordArialArabicPartOff?: boolean}).__docsWordArialArabicPartOff === true)
    ? [`"${WORD_ARIAL_ARABIC_FAMILY}"`] : [];
  const added = [...arialArabic, ...families];
  return added.length ? [...tokens.slice(0, at + 1), ...added, ...tokens.slice(at + 1)] : tokens;
}

/** The run's own face in a display stack: past the Hangul full-em faces the
 * stack leads with for a Korean Office family (`withHangulEmFaces`). */
function runFaceIndex(tokens: readonly string[]): number {
  let at = 0;
  while (at < tokens.length - 1 && /^MRAI-Metric-Hangul-/i.test(unquotedFontFamilyToken(tokens[at]!))) at += 1;
  return at;
}

/**
 * A family Word lacks, drawn in its picks (documentDisplayFonts): its Hebrew
 * and Arabic in the face Word sets them in behind the first pick, as a run
 * of that face has them (`withThaiScriptFallback`). Corpus R458-D53: Urdu in
 * Jameel Noori Nastaleeq, drawn in its altName Malgun Gothic, which has no
 * Arabic -- Word's PDF sets it in Arial; the page fell to the reader's
 * system Arabic (Geeza Pro, 9 % wider). Display only.
 */
export function withWordComplexScriptFallback(stack: string | null): string | null {
  if (!stack) return stack;
  return withWordComplexScriptWidths(stack.split(",").map((token) => token.trim()).filter(Boolean)).join(", ");
}

/**
 * Word's Thai face for a run that names no complex-script font: Angsana New
 * behind a serif Latin face, Browallia New behind a sans one (Word 16 for
 * Mac, wp-fix-a/thai.docx). Inserted before the stack's terminal generic,
 * where the browser otherwise fell back to the system's Thai face (Thonburi,
 * "ภาษาไทย" 58.46px at 11 pt against Word's 33.00px). Display only.
 */
export function withThaiScriptFallback(stack: string | null): string | null {
  if (!stack) return stack;
  const tokens = withWordComplexScriptWidths(stack.split(",").map((token) => token.trim()).filter(Boolean));
  const names = tokens.map((token) => unquotedFontFamilyToken(token));
  if (names.some((name) => THAI_CAPABLE_FACE_RE.test(name))) return tokens.join(", ");
  const serif = names.some((name) => SERIF_LATIN_FACE_RE.test(name)) &&
    !names.slice(0, 1).some((name) => /arial|calibri|helvetica|verdana|segoe|aptos|sans/i.test(name));
  const family = serif ? THAI_SERIF_FALLBACK_FAMILY : THAI_SANS_FALLBACK_FAMILY;
  ensureOfficeFontFaces(family);
  const generic = tokens.findIndex((token) =>
    TERMINAL_GENERIC_FAMILIES.has(unquotedFontFamilyToken(token).toLowerCase()),
  );
  const at = generic >= 0 ? generic : tokens.length;
  return [...tokens.slice(0, at), `"${family}"`, ...tokens.slice(at)].join(", ");
}

/**
 * The display stack (below), with each Korean Office family's Hangul at its
 * own full em in front of it (lib/office-fonts/hangul-em.ts): Word draws
 * Malgun Gothic's, Gulim's and Batang's Hangul 1 em where the served Noto KR
 * draws 0.92 (corpus R284-D30).
 */
export function fontFamilyWithCjkRenderFallback(value: unknown): string | null {
  const stack = cjkRenderFallbackStack(value);
  return stack ? withHangulEmFaces(stack, ensureOfficeFontFaces) : stack;
}

function cjkRenderFallbackStack(value: unknown): string | null {
  const family = normalizeFontFamily(value);
  if (!family) return null;

  const authored = family.split(",").map((token) => token.trim());
  const authoredNames = new Set(
    authored.map((token) => unquotedFontFamilyToken(token).toLowerCase()),
  );
  // Each authored face is followed by the family a style-named face is built
  // on, then by the faces that lay its runs out alike, then by the open face
  // the product serves for an Office family (lib/office-fonts) so a name with
  // no stylesheet alias of its own still reaches its stand-in.
  const emitted = new Set(authoredNames);
  const tokens = authored.flatMap((token) => {
    const face = unquotedFontFamilyToken(token);
    ensureOfficeFontFaces(face);
    const family = styleNamedFaceFamily(face);
    const faces = family && !authoredNames.has(family.toLowerCase()) ? [face, family] : [face];
    return faces.flatMap((name, index) => [
      ...(index === 0 ? [token] : [/[^A-Za-z0-9-]/.test(name) ? `"${name}"` : name]),
      ...(METRIC_COMPATIBLE_LATIN_FALLBACKS.get(name.toLowerCase()) ?? [])
        .filter((fallback) => {
          const key = unquotedFontFamilyToken(fallback).toLowerCase();
          if (emitted.has(key)) return false;
          emitted.add(key);
          return true;
        }),
      ...officeFontSubstitutes(name)
        .filter((substitute) => {
          if (emitted.has(substitute.toLowerCase())) return false;
          emitted.add(substitute.toLowerCase());
          return true;
        })
        .map((substitute) => `"${substitute}"`),
    ]);
  });
  const withLatinFallbacks = tokens.length === authored.length ? family : tokens.join(", ");
  const normalizedNames = new Set(
    tokens.map((token) => unquotedFontFamilyToken(token).toLowerCase()),
  );
  const alreadyHasCjkFace = tokens.some((token) => {
    const face = unquotedFontFamilyToken(token);
    return (
      CJK_FONT_NAME_RE.test(face) ||
      KNOWN_CJK_RENDER_FACES.has(face.toLowerCase())
    );
  });
  const terminalGenericIndex = tokens.findIndex((token) =>
    TERMINAL_GENERIC_FAMILIES.has(unquotedFontFamilyToken(token).toLowerCase()),
  );
  const terminalGeneric =
    terminalGenericIndex >= 0
      ? unquotedFontFamilyToken(tokens[terminalGenericIndex]).toLowerCase()
      : null;
  // With no generic to read the intent from, the authored CJK face names it.
  const serif =
    terminalGeneric === "serif" ||
    (terminalGeneric === null &&
      alreadyHasCjkFace &&
      tokens.some((token) =>
        CJK_SERIF_FACE_RE.test(unquotedFontFamilyToken(token)),
      ));
  const fallbacks = alreadyHasCjkFace
    ? serif
      ? CJK_SERIF_NAMED_FACE_FALLBACKS
      : CJK_SANS_NAMED_FACE_FALLBACKS
    : serif
      ? CJK_SERIF_RENDER_FALLBACKS
      : CJK_SANS_RENDER_FALLBACKS;
  // One of these faces present is what makes the chain deterministic across
  // macOS, Windows and the loaded web font. Some *other* CJK name is not:
  // it may be installed nowhere, and the chain then ends at the terminal
  // generic (or, with no generic, the browser's standard font) — whose face
  // the browser picks from the document language, so the same document
  // paginated to 8 pages under `<html lang="zh-CN">` (PingFang SC, 27px
  // lines) and 7 under `lang="en-US"` (Helvetica, 22.95px lines) because its
  // runs name "Noto Sans CJK SC", installed on neither machine. Any named
  // face that does exist still wins: it stays ahead of these.
  if (
    alreadyHasCjkFace &&
    fallbacks.some((token) =>
      !(HANGUL_RENDER_FALLBACKS as readonly string[]).includes(token) &&
      normalizedNames.has(unquotedFontFamilyToken(token).toLowerCase()),
    )
  )
    return withLatinFallbacks;
  const missingFallbacks = fallbacks.filter(
    (token) =>
      !normalizedNames.has(unquotedFontFamilyToken(token).toLowerCase()),
  );
  if (!missingFallbacks.length) return withLatinFallbacks;

  const insertionIndex =
    terminalGenericIndex >= 0 ? terminalGenericIndex : tokens.length;
  return [
    ...tokens.slice(0, insertionIndex),
    ...missingFallbacks,
    ...tokens.slice(insertionIndex),
  ].join(", ");
}

// Exported so UI surfaces (e.g. the document toolbar's recent-color memory) can
// record the SAME canonical #rrggbb the editor actually applies, instead of the
// raw picker input — keeping remembered swatches identical to the applied color.
/**
 * A run colour's theme reference, as Word writes it: `w:themeColor`
 * (`accent1`, `text1`, ...) with an optional `w:themeTint` / `w:themeShade`
 * byte, stored as `accent1`, `accent1:tint:99` or `text1:shade:BF`.
 */
export function normalizeTextThemeColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match =
    /^(text1|text2|background1|background2|dark1|dark2|light1|light2|accent[1-6]|hyperlink|followedHyperlink)(?::(tint|shade):([0-9A-Fa-f]{2}))?$/.exec(
      value.trim(),
    );
  if (!match) return null;
  return match[2] ? `${match[1]}:${match[2]}:${match[3].toUpperCase()}` : match[1];
}

export function normalizeTextColor(value: unknown): TextColorValue | null {
  return normalizeColor<TextColorValue>(value);
}

export function normalizeHighlightColor(value: unknown): HighlightColorValue | null {
  return normalizeColor<HighlightColorValue>(value);
}

/**
 * Normalize a character spacing value (pt, may be fractional, can be negative).
 * Accepts a number or a numeric string, within Word's range: Font > Advanced >
 * Spacing expands or condenses by up to 1584 pt (31680 twips), and the
 * import reads a document's spacing up to that (reading generation 406).
 * Returns null for non-finite / out-of-range / non-numeric values.
 */
export const CHAR_SPACING_LIMIT_PT = 1584;

export function normalizeCharSpacing(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(n)) return null;
  if (n < -CHAR_SPACING_LIMIT_PT || n > CHAR_SPACING_LIMIT_PT) return null;
  // Round to 3 decimal places to avoid floating-point noise.
  return Math.round(n * 1000) / 1000;
}

/**
 * Normalize a character scale value (integer percent). Accepts a number or
 * numeric string. Clamps to [1, 600] (Word's documented range for `<w:w>`).
 * Returns null for non-finite / out-of-range / non-integer-equivalent values.
 */
export function normalizeCharScale(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > 600) return null;
  return rounded;
}

/**
 * Validate Word's `<w:kern w:val>` unit without rounding. The OOXML value is
 * already expressed in half-points, so accepting a fractional or prefix-only
 * number here would silently change the user's threshold on save.
 */
export function normalizeKerningThresholdHalfPoints(
  value: unknown,
): number | null {
  const normalized =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : Number.NaN;
  if (
    !Number.isSafeInteger(normalized) ||
    normalized < MIN_KERNING_THRESHOLD_HALF_POINTS ||
    normalized > MAX_KERNING_THRESHOLD_HALF_POINTS
  ) {
    return null;
  }
  return normalized;
}

/**
 * Authenticate the complete editor representation of Word's kerning threshold.
 * Provenance is mandatory: a missing/forged authority can never mint direct
 * `w:kern`. An inherited mark is an effective-style projection only: it can
 * render and populate the dialog, but it can never authorize direct output or
 * Clear Formatting ownership.
 */
export function normalizeKerningThresholdMarkAuthority(
  value: unknown,
): KerningThresholdMarkAuthority | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const attrs = value as Record<string, unknown>;
  if (
    Object.keys(attrs).sort().join("|") !==
    "halfPoints|inheritedHalfPoints|provenance"
  ) {
    return null;
  }
  const provenance = attrs.provenance;
  if (provenance !== "direct" && provenance !== "inherited") return null;
  // 0 is Word's direct "no kerning" (`w:kern w:val="0"`: Kerning for fonts
  // cleared over a style that kerns). Only a run's own value may say it.
  const halfPoints =
    provenance === "direct" && (attrs.halfPoints === 0 || attrs.halfPoints === "0")
      ? 0
      : normalizeKerningThresholdHalfPoints(attrs.halfPoints);
  if (halfPoints === null) return null;
  const rawInherited = attrs.inheritedHalfPoints;
  const inheritedHalfPoints =
    rawInherited === null || rawInherited === undefined
      ? null
      : normalizeKerningThresholdHalfPoints(rawInherited);
  if (
    (rawInherited !== null &&
      rawInherited !== undefined &&
      inheritedHalfPoints === null) ||
    (provenance === "inherited" && inheritedHalfPoints !== null)
  ) {
    return null;
  }
  return { halfPoints, provenance, inheritedHalfPoints };
}

/** Convert a Font-dialog point value to the exact OOXML half-point unit. */
export function kerningThresholdPointsToHalfPoints(
  value: unknown,
): number | null {
  const normalized =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value.trim())
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isFinite(normalized)) return null;
  const halfPoints = normalized * 2;
  return Number.isSafeInteger(halfPoints)
    ? normalizeKerningThresholdHalfPoints(halfPoints)
    : null;
}

/**
 * CSS for character spacing: letter-spacing in points (pt).
 * A positive value expands; negative condenses. We use `pt` directly because
 * TipTap renders inside a browser, where `pt` is a valid CSS unit.
 */
function charSpacingCss(pt: number): string {
  // Over a section's character grid the run's spacing adds to the grid's
  // (sectionLineGrid: Word sets both).
  return `letter-spacing: calc(var(--doc-grid-char-space, 0pt) + ${pt}pt)`;
}

/**
 * CSS for character scaling in static HTML (clipboard, previews): horizontal
 * glyph stretch via inline-block + scaleX, painted from the run's left edge.
 * The editor lays a scaled run out piece by piece instead (charScaleLayout).
 */
function charScaleCss(pct: number): string {
  return `display: inline-block; text-indent: 0; transform: scaleX(${pct / 100}); transform-origin: left center`;
}

function readFontSize(element: unknown): FontSizeValue | null {
  if (!isElement(element)) return null;
  return (
    normalizeFontSize(element.getAttribute("data-font-size")) ||
    normalizeFontSize(element.style.fontSize) ||
    fontSizeFromCssLength(element.style.fontSize)
  );
}

/** `font-size: 24pt` (or in/cm/mm/pc) as the `px` size the mark stores. */
function fontSizeFromCssLength(value: unknown): FontSizeValue | null {
  const px = cssAbsoluteLengthPx(value);
  return px === null ? null : normalizeFontSize(`${Math.round(px * 10_000) / 10_000}px`);
}

function readFontFamily(element: unknown): FontFamilyValue | null {
  if (!isElement(element)) return null;
  return (
    normalizeFontFamily(element.getAttribute("data-font-family")) ||
    normalizeFontFamily(element.style.fontFamily)
  );
}

/** Word's Automatic colour, stored on the textColor mark as "auto". */
export const AUTOMATIC_TEXT_COLOR = "auto";

function readTextColor(element: unknown): TextColorValue | null {
  if (!isElement(element)) return null;
  if (element.getAttribute("data-text-color") === AUTOMATIC_TEXT_COLOR) {
    return AUTOMATIC_TEXT_COLOR as unknown as TextColorValue;
  }
  return (
    normalizeTextColor(element.getAttribute("data-text-color")) ||
    normalizeTextColor(element.style.color)
  );
}

function readHighlightColor(element: unknown): HighlightColorValue | null {
  if (!isElement(element)) return null;
  return (
    normalizeHighlightColor(element.getAttribute("data-highlight-color")) ||
    normalizeHighlightColor(element.style.backgroundColor)
  );
}

const FontSizeMark = Mark.create({
  name: FONT_SIZE_MARK,
  // The run's font marks nest outermost among the formatting marks (with the
  // character border right inside them, charEffectsExtension): a bordered
  // group's box takes its height from its font, and colour, shading, bold or
  // underline changing inside it no longer cut the box (Word draws one box).
  priority: 101,

  addAttributes() {
    return {
      size: {
        default: null,
        parseHTML: readFontSize,
        renderHTML: (attrs) => {
          const size = normalizeFontSize(attrs.size);
          return size
            ? { "data-font-size": size, style: `font-size: ${size}` }
            : {};
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-font-size]",
        getAttrs: (element) => {
          // An editor node that writes its own size as data-font-size (an
          // inline equation) is parsed as that node: read as a size mark it
          // became an empty container and the equation vanished on paste
          
          if ((element as HTMLElement).hasAttribute("data-type")) return false;
          const size = readFontSize(element);
          return size ? { size } : false;
        },
      },
      {
        style: "font-size",
        getAttrs: (value) => {
          const size = normalizeFontSize(value) ?? fontSizeFromCssLength(value);
          return size ? { size } : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", HTMLAttributes, 0];
  },
});

const FontFamilyMark = Mark.create({
  name: FONT_FAMILY_MARK,
  priority: 101,

  addAttributes() {
    return {
      hintCharset: {
        default: undefined,
        parseHTML: (element) => normalizeWordFontHintCharset(element.getAttribute("data-office-font-hint-charset")) ?? undefined,
        renderHTML: (attrs) => {
          const charset = normalizeWordFontHintCharset(attrs.hintCharset);
          return normalizeWordFontHint(attrs.hint) && charset ? { "data-office-font-hint-charset": charset } : {};
        },
      },
      hintLanguage: {
        default: undefined,
        parseHTML: (element) => normalizeWordFontHintLanguage(element.getAttribute("data-office-font-hint-language")) ?? undefined,
        renderHTML: (attrs) => {
          const language = normalizeWordFontHintLanguage(attrs.hintLanguage);
          return normalizeWordFontHint(attrs.hint) && language ? { "data-office-font-hint-language": language } : {};
        },
      },
      hint: {
        default: undefined,
        parseHTML: (element) => normalizeWordFontHint(element.getAttribute("data-office-font-hint")) ?? undefined,
        renderHTML: (attrs) => {
          const hint = normalizeWordFontHint(attrs.hint);
          return hint ? { "data-office-font-hint": hint } : {};
        },
      },
      face: {
        default: undefined,
        parseHTML: (element) => element.hasAttribute("data-document-display-font") ? undefined : parseOfficeFontFace(element.getAttribute("data-office-font-face")) ?? undefined,
        renderHTML: (attrs) => {
          const face = normalizeOfficeFontFace(attrs.face);
          return face ? { "data-office-font-face": JSON.stringify(face) } : {};
        },
      },
      family: {
        default: null,
        parseHTML: readFontFamily,
        renderHTML: (attrs) => {
          const family = normalizeFontFamily(attrs.family);
          const renderFamily = fontFamilyWithCjkRenderFallback(family);
          const usesRenderFallback = Boolean(
            family && renderFamily && renderFamily !== family,
          );
          return family
            ? {
                "data-font-family": family,
                ...(usesRenderFallback
                  ? { "data-font-cjk-fallback": "render-only" }
                  : {}),
                style: normalizeOfficeFontFace(attrs.face)
                  ? officeFontFaceStyle(normalizeOfficeFontFace(attrs.face)!)
                  : `font-family: ${withThaiScriptFallback(renderFamily ?? family)}`,
              }
            : {};
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-font-family]",
        getAttrs: (element) => {
          const family = readFontFamily(element);
          return family ? { family } : false;
        },
      },
      {
        style: "font-family",
        getAttrs: (value) => {
          const family = normalizeFontFamily(value);
          return family ? { family } : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", HTMLAttributes, 0];
  },
});

/**
 * Independent CJK (east-Asia) font mark. Stored separately from `fontFamily`
 * so the user can set the CJK typeface without touching the Latin face (Word /
 * WPS 中文字体 parity). On export it drives `<w:rFonts w:eastAsia>` on the run.
 *
 * The family value is validated through the same `normalizeFontFamily` whitelist
 * as the Latin mark. The DOM mark retains only metadata: the render-only font
 * projection applies this slot to complete East Asian graphemes, never Latin.
 */
const FontCjkFamilyMark = Mark.create({
  name: FONT_CJK_FAMILY_MARK,
  priority: 101,

  addAttributes() {
    return {
      face: {
        default: undefined,
        parseHTML: (element) => parseOfficeFontFace(element.getAttribute("data-office-cjk-font-face")) ?? undefined,
        renderHTML: (attrs) => {
          const face = normalizeOfficeFontFace(attrs.face);
          return face ? { "data-office-cjk-font-face": JSON.stringify(face) } : {};
        },
      },
      family: {
        default: null,
        parseHTML: (element) => {
          if (!(element instanceof HTMLElement)) return null;
          return (
            normalizeFontFamily(element.getAttribute("data-cjk-font-family")) ??
            null
          );
        },
        renderHTML: (attrs) => {
          const family = normalizeFontFamily(attrs.family);
          // Render with data-cjk-font-family (not data-font-family) so the
          // importer's fontFamily parseHTML rule does not accidentally pick it up
          // and store it as a Latin font. Decorations own its script-specific paint.
          return family
            ? { "data-cjk-font-family": family }
            : {};
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-cjk-font-family]",
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) return false;
          const family = normalizeFontFamily(
            element.getAttribute("data-cjk-font-family"),
          );
          return family ? { family } : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", HTMLAttributes, 0];
  },
});

/**
 * Independent complex-script font mark, the third Word run font slot beside
 * `fontFamily` (`w:ascii`/`w:hAnsi`) and `fontCjkFamily` (`w:eastAsia`). On
 * export it drives `<w:rFonts w:cs>` on the run, which is the face Word draws
 * every Devanagari, Arabic, Hebrew, Thai and Bengali character from.
 *
 * Its own data attributes, so neither the Latin nor the CJK parse rule picks
 * it up and stores it as their slot's face.
 */
const FontComplexFamilyMark = Mark.create({
  name: FONT_COMPLEX_FAMILY_MARK,
  priority: 101,

  addAttributes() {
    return {
      face: {
        default: undefined,
        parseHTML: (element) => parseOfficeFontFace(element.getAttribute("data-office-cs-font-face")) ?? undefined,
        renderHTML: (attrs) => {
          const face = normalizeOfficeFontFace(attrs.face);
          return face ? { "data-office-cs-font-face": JSON.stringify(face) } : {};
        },
      },
      family: {
        default: null,
        parseHTML: (element) => {
          if (!(element instanceof HTMLElement)) return null;
          return (
            normalizeFontFamily(element.getAttribute("data-cs-font-family")) ??
            null
          );
        },
        renderHTML: (attrs) => {
          const family = normalizeFontFamily(attrs.family);
          return family ? { "data-cs-font-family": family } : {};
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-cs-font-family]",
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) return false;
          const family = normalizeFontFamily(
            element.getAttribute("data-cs-font-family"),
          );
          return family ? { family } : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", HTMLAttributes, 0];
  },
});

const TextColorMark = Mark.create({
  name: TEXT_COLOR_MARK,

  addAttributes() {
    return {
      // Word's theme colour behind a theme swatch (w:themeColor, with
      // w:themeTint / w:themeShade): the colour above is its value under the
      // document theme, and a theme change recolours it.
      themeColor: {
        default: null,
        parseHTML: (element) =>
          normalizeTextThemeColor(element.getAttribute("data-theme-color")),
        renderHTML: (attrs) => {
          const ref = normalizeTextThemeColor(attrs.themeColor);
          return ref ? { "data-theme-color": ref } : {};
        },
      },
      color: {
        default: null,
        parseHTML: readTextColor,
        renderHTML: (attrs) => {
          if (attrs.color === AUTOMATIC_TEXT_COLOR) {
            // Automatic is a direct colour: it cancels a character style's
            // fixed colour and follows the shading's tone (white on dark,
            
            return {
              "data-text-color": AUTOMATIC_TEXT_COLOR,
              style: `color: var(--docs-auto-text-color, inherit); ${DIRECT_TEXT_COLOR_VAR}: var(--docs-auto-text-color, inherit)`,
            };
          }
          const color = normalizeTextColor(attrs.color);
          return color
            ? {
                "data-text-color": color,
                style: `color: ${color}; ${DIRECT_TEXT_COLOR_VAR}: ${color}`,
              }
            : {};
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-text-color]",
        getAttrs: (element) => {
          const color = readTextColor(element);
          return color ? { color } : false;
        },
      },
      {
        style: "color",
        getAttrs: (value) => {
          const color = normalizeTextColor(value);
          return color ? { color } : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", HTMLAttributes, 0];
  },
});

/**
 * Pictures, charts and shapes in the selection keep no highlight: Word draws
 * none on a graphic, and the run's background showed through a transparent
 * picture (and an Exactly line's run shift moved the object). Their words
 * -- a text box's story -- keep it.
 */
const HIGHLIGHT_FREE_OBJECTS: ReadonlySet<string> = new Set([
  "inlineImage",
  "inlineChart",
  "inlineDocumentShape",
]);

function unhighlightObjects(tr: Transaction): void {
  const type = tr.doc.type.schema.marks[HIGHLIGHT_MARK];
  if (!type) return;
  const objects: number[] = [];
  for (const range of tr.selection.ranges) {
    tr.doc.nodesBetween(range.$from.pos, range.$to.pos, (node, pos) => {
      if (HIGHLIGHT_FREE_OBJECTS.has(node.type.name) && type.isInSet(node.marks)) objects.push(pos);
      return true;
    });
  }
  for (const pos of objects) tr.removeNodeMark(pos, type);
}

/** The word a caret stands strictly inside (not at its edge, where the
 * colour goes on what is typed next). */
function caretInsideWord(state: EditorState): { from: number; to: number } | null {
  const { selection } = state;
  if (!selection.empty) return null;
  const word = documentWordRangeAt(selection.$from);
  return word && word.from < selection.from && selection.from < word.to ? word : null;
}

/**
 * Every character of the selection (a caret: the character it types) wears
 * this highlight -- a highlight, not run shading of the same colour.
 */
function selectionWearsHighlight(state: EditorState, color: string): boolean {
  const wears = (marks: readonly ProseMirrorMark[]) =>
    marks.some(
      (mark) =>
        mark.type.name === HIGHLIGHT_MARK &&
        mark.attrs.shading !== true &&
        normalizeHighlightColor(mark.attrs.color) === color,
    );
  const { selection } = state;
  if (selection.empty) return wears(state.storedMarks ?? selection.$from.marks());
  let sawText = false;
  let all = true;
  for (const range of selection.ranges) {
    state.doc.nodesBetween(range.$from.pos, range.$to.pos, (node) => {
      if (!all) return false;
      if (!node.isText) return true;
      sawText = true;
      if (!wears(node.marks)) all = false;
      return false;
    });
  }
  return sawText && all;
}

const HighlightMark = Mark.create({
  name: HIGHLIGHT_MARK,

  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: readHighlightColor,
        renderHTML: (attrs) => {
          const color = normalizeHighlightColor(attrs.color);
          // The custom property lets an object inside the run (an equation's
          // box, taller than the line) wear the whole highlight.
          return color
            ? {
                "data-highlight-color": color,
                style: `background-color: ${color}; --docs-highlight-color: ${color}`,
              }
            : {};
        },
      },
      // The background is Word run SHADING (`w:rPr/w:shd`), not a Word
      // highlight. Both paint behind the text, but Word turns Automatic text
      // white on dark shading and never on a highlight (wordAutoTextColor),
      // and each saves back to its own element. Null is a highlight.
      shading: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-highlight-shading") === "true" ? true : null,
        renderHTML: (attrs) => {
          if (attrs.shading !== true) return {};
          return {
            "data-highlight-shading": "true",
            ...wordAutoTextAttributes(normalizeHighlightColor(attrs.color)),
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "mark[data-highlight-color]",
        getAttrs: (element) => {
          const color = readHighlightColor(element);
          return color ? { color } : false;
        },
      },
      {
        tag: "span[data-highlight-color]",
        getAttrs: (element) => {
          const color = readHighlightColor(element);
          return color ? { color } : false;
        },
      },
      // A table cell's own background is its shading (the cell's
      // backgroundColor), never a highlight of its words. A style rule
      // matches any element, the <td> of a copied shaded table included:
      // pasting it highlighted every word of the cell, and clearing the
      // cell's shading left the colour behind the text (WUA 060). Read on a
      // cell (parsed into a table row), the background clears the highlight
      // instead; a highlighted word inside the cell is still a highlight.
      {
        style: "background-color",
        context: "tableRow/",
        priority: 60,
        clearMark: (mark) => mark.type.name === HIGHLIGHT_MARK,
      },
      {
        style: "background-color",
        getAttrs: (value) => {
          const color = normalizeHighlightColor(value);
          return color ? { color } : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["mark", HTMLAttributes, 0];
  },
});

function verticalAlignIs(target: "super" | "sub") {
  return (value: unknown) =>
    typeof value === "string" && value.trim().toLowerCase() === target ? {} : false;
}

const SuperscriptMark = Mark.create({
  name: SUPERSCRIPT_MARK,
  // Superscript and subscript cannot co-exist on the same text.
  excludes: SUBSCRIPT_MARK,
  parseHTML() {
    return [
      // A footnote/endnote reference is a <sup data-type="footnote-ref"> atom;
      // as a superscript mark it parsed to an empty mark and the note marker
      
      {
        tag: "sup",
        getAttrs: (element) =>
          element instanceof HTMLElement &&
          element.getAttribute("data-type") === "footnote-ref"
            ? false
            : null,
      },
      { style: "vertical-align", getAttrs: verticalAlignIs("super") },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ["sup", HTMLAttributes, 0];
  },
});

const SubscriptMark = Mark.create({
  name: SUBSCRIPT_MARK,
  excludes: SUPERSCRIPT_MARK,
  parseHTML() {
    return [
      { tag: "sub" },
      { style: "vertical-align", getAttrs: verticalAlignIs("sub") },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ["sub", HTMLAttributes, 0];
  },
});

/**
 * Replace StarterKit's stock strike with the same mark plus mutual exclusion
 * against doubleStrike. Adding either style now replaces the other instead of
 * producing an ambiguous run carrying both `<w:strike>` and `<w:dstrike>`.
 */
const SingleStrikeMark = Strike.extend({
  excludes: DOUBLE_STRIKE_MARK,
});

/** Word/WPS double strikethrough (`<w:dstrike>`) with lossless HTML storage. */
const DoubleStrikeMark = Mark.create({
  name: DOUBLE_STRIKE_MARK,
  excludes: "strike",

  parseHTML() {
    return [
      { tag: "span[data-double-strike]" },
      {
        tag: "span",
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) return false;
          const line = element.style.textDecorationLine
            .trim()
            .toLowerCase();
          const style = element.style.textDecorationStyle
            .trim()
            .toLowerCase();
          return line.includes("line-through") && style === "double"
            ? {}
            : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      {
        ...HTMLAttributes,
        "data-double-strike": "",
        style:
          "text-decoration-line: line-through; text-decoration-style: double",
      },
      0,
    ];
  },
});

// A `font-variant` / `text-transform` value is "small-caps"/"uppercase" exactly
// when its trimmed lowercased form matches — used to recognize pasted/imported
// inline styles. (We never echo the raw style back; renderHTML emits a fixed
// developer-authored declaration, so there is no injection surface.)
function cssKeywordIs(target: string) {
  return (value: unknown) =>
    typeof value === "string" && value.trim().toLowerCase() === target ? {} : false;
}

/**
 * Small caps mark (Word `<w:smallCaps>`). Rendered as `font-variant: small-caps`
 * on a span carrying `data-small-caps` so it round-trips through HTML import.
 * Mutually exclusive with all-caps (one rendered-case effect at a time, matching
 * Word). PRESERVES the underlying text — unlike the destructive Change Case
 * command.
 */
const SmallCapsMark = Mark.create({
  name: SMALL_CAPS_MARK,
  excludes: ALL_CAPS_MARK,
  parseHTML() {
    return [
      { tag: "span[data-small-caps]" },
      { style: "font-variant", getAttrs: cssKeywordIs("small-caps") },
      { style: "font-variant-caps", getAttrs: cssKeywordIs("small-caps") },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      { ...HTMLAttributes, "data-small-caps": "", style: "font-variant: small-caps" },
      0,
    ];
  },
});

/**
 * All caps mark (Word `<w:caps>`). Rendered as `text-transform: uppercase` on a
 * span carrying `data-all-caps` so it round-trips through HTML import. Mutually
 * exclusive with small-caps. PRESERVES the underlying text (the lowercase glyphs
 * are still there; only the display is uppercased) — unlike Change Case.
 */
const AllCapsMark = Mark.create({
  name: ALL_CAPS_MARK,
  excludes: SMALL_CAPS_MARK,
  parseHTML() {
    return [
      { tag: "span[data-all-caps]" },
      { style: "text-transform", getAttrs: cssKeywordIs("uppercase") },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      { ...HTMLAttributes, "data-all-caps": "", style: "text-transform: uppercase" },
      0,
    ];
  },
});

function readCharacterStyle(element: unknown): CharacterStyleValue | null {
  if (!isElement(element)) return null;
  return normalizeCharacterStyle(element.getAttribute("data-character-style"));
}

function normalizeDocxCharacterStyleId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= 128 && !/[\u0000-\u001f]/.test(trimmed)
    ? trimmed
    : null;
}

const CharacterStyleMark = Mark.create({
  name: CHARACTER_STYLE_MARK,
  // A single named style at a time: re-applying replaces the previous name,
  // matching Word's character-style gallery (one style per run).
  excludes: CHARACTER_STYLE_MARK,

  addAttributes() {
    return {
      name: {
        default: null,
        parseHTML: readCharacterStyle,
        renderHTML: (attrs) => {
          const style = normalizeCharacterStyle(attrs.name);
          return style
            ? { "data-character-style": style, style: characterStyleRenderCss(style) }
            : {};
        },
      },
      // Stable direct w:rStyle identity. Unknown/custom character styles keep
      // this reference even when they have no entry in the editor's five-item
      // visual gallery; their effective formatting is still rendered by the
      // ordinary marks projected alongside it.
      styleId: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          normalizeDocxCharacterStyleId(
            element.getAttribute("data-docx-character-style-id"),
          ),
        renderHTML: (attrs) => {
          const styleId = normalizeDocxCharacterStyleId(attrs.styleId);
          return styleId
            ? { "data-docx-character-style-id": styleId }
            : {};
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-character-style], span[data-docx-character-style-id]",
        getAttrs: (element) => {
          const style = readCharacterStyle(element);
          const styleId = isElement(element)
            ? normalizeDocxCharacterStyleId(
                element.getAttribute("data-docx-character-style-id"),
              )
            : null;
          return style || styleId ? { name: style, styleId } : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", HTMLAttributes, 0];
  },
});

/**
 * Character spacing mark (字符间距 / 字符间距).
 * `spacing` is a pt value (positive = expanded, negative = condensed).
 * Rendered as CSS `letter-spacing: Npt` on an inline-block span.
 * Exported to `<w:spacing w:val>` (twentieths of a point).
 */
const CharSpacingMark = Mark.create({
  name: CHAR_SPACING_MARK,

  addAttributes() {
    return {
      spacing: {
        default: null,
        parseHTML: (element) => {
          if (!(element instanceof HTMLElement)) return null;
          return normalizeCharSpacing(element.getAttribute("data-char-spacing"));
        },
        renderHTML: (attrs) => {
          const v = normalizeCharSpacing(attrs.spacing);
          if (v === null) return {};
          return { "data-char-spacing": String(v), style: charSpacingCss(v) };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-char-spacing]",
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) return false;
          const v = normalizeCharSpacing(element.getAttribute("data-char-spacing"));
          return v !== null ? { spacing: v } : false;
        },
      },
      {
        // Standard CSS from pasted HTML: `letter-spacing: 2pt` is the same
        // spacing the Font dialog writes.
        style: "letter-spacing",
        getAttrs: (value) => {
          const points = cssAbsoluteLengthPt(value);
          const v = points === null ? null : normalizeCharSpacing(points);
          return v !== null && v !== 0 ? { spacing: v } : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", HTMLAttributes, 0];
  },
});

/**
 * Character scaling mark (字符缩放).
 * `scale` is an integer percent (100 = normal; e.g. 150 = 150% wide).
 * Rendered as CSS `transform: scaleX()` on an `display:inline-block` span.
 * Exported to `<w:w w:val>` (percent integer).
 */
const CharScaleMark = Mark.create({
  name: CHAR_SCALE_MARK,

  addAttributes() {
    return {
      scale: {
        default: null,
        parseHTML: (element) => {
          if (!(element instanceof HTMLElement)) return null;
          return normalizeCharScale(element.getAttribute("data-char-scale"));
        },
        renderHTML: (attrs) => {
          const v = normalizeCharScale(attrs.scale);
          if (v === null) return {};
          return { "data-char-scale": String(v), style: charScaleCss(v) };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-char-scale]",
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) return false;
          const v = normalizeCharScale(element.getAttribute("data-char-scale"));
          return v !== null && v !== 100 ? { scale: v } : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", HTMLAttributes, 0];
  },

  





  addMarkView() {
    return ({ mark, HTMLAttributes, view }) => {
      const dom = document.createElement("span");
      for (const [name, value] of Object.entries(HTMLAttributes)) {
        if (name === "style" || value === null || value === undefined) continue;
        dom.setAttribute(name, String(value));
      }
      const scale = normalizeCharScale(mark.attrs.scale);
      const disconnect =
        scale !== null && scale !== 100 ? observeCharScalePieces(dom, view) : () => {};
      return { dom, contentDOM: dom, destroy: disconnect };
    };
  },

  addProseMirrorPlugins() {
    return [createCharScaleLayoutPlugin(CHAR_SCALE_MARK, normalizeCharScale)];
  },
});

/**
 * Lay a Fit Text region out at its width. Word fits every run that shares a
 * `w:fitText w:id` into ONE `w:val` width (ECMA-376 17.3.2.14), and a region
 * routinely spans several runs: Word writes Fit Text as a spaced run plus an
 * unspaced last character (R06-D17 【様式1】: 「所　在　」 + 「地」, both
 * `w:val="1680" w:id="961862400"`). Word draws the region's characters at
 * their natural advance plus one equal gap between neighbours, the last one
 * flush with the region's end; the runs' own `w:spacing` is Word's stale
 * record of that gap, not added to it (所 在 地 at 248.3/284.3/320.3pt for
 * 84pt, i.e. a 6pt gap where the run says 3pt).
 *
 * The rendered HTML keeps a static approximation (each piece an inline-block
 * of the full width, justified); the live view measures the region's pieces
 * in their paragraph and replaces it: every character takes the gap as
 * letter-spacing (--fit-text-gap, note-editor.css) and the last piece gives
 * the final character's trailing gap back, so the region is exactly the width
 * and stays an ordinary inline run of its line. A region narrower than its
 * text compresses its characters instead, by painting (scaleX), each piece
 * keeping its share of the width.
 */
const FIT_TEXT_BLOCK_SELECTOR = "p, h1, h2, h3, h4, h5, h6, li, td, th";

export function fitTextRegion(dom: HTMLElement): HTMLElement[] {
  const id = dom.getAttribute("data-fit-text-id");
  const width = dom.getAttribute("data-fit-text-width");
  const block = dom.closest(FIT_TEXT_BLOCK_SELECTOR);
  if (id === null || width === null || block === null) return [dom];
  const pieces = Array.from(
    block.querySelectorAll<HTMLElement>("[data-fit-text-id]"),
  ).filter(
    (piece) =>
      piece.getAttribute("data-fit-text-id") === id &&
      piece.getAttribute("data-fit-text-width") === width &&
      piece.closest(FIT_TEXT_BLOCK_SELECTOR) === block,
  );
  return pieces.includes(dom) ? pieces : [dom];
}

/** The characters a piece shows on its line: a guide's text stands above. */
function fitTextCharacterCount(piece: HTMLElement): number {
  let count = 0;
  const walker = piece.ownerDocument.createTreeWalker(piece, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node.parentElement?.closest("rt")) continue;
    count += Array.from(node.textContent ?? "").length;
  }
  return count;
}

export function layOutFitTextRegion(pieces: readonly HTMLElement[]): void {
  const twips = normalizeFitTextTwips(pieces[0]?.getAttribute("data-fit-text-width"));
  if (twips === null) return;
  const target = twips / 15;
  for (const piece of pieces) {
    piece.setAttribute("data-fit-text-gap", "");
    piece.style.setProperty("--fit-text-gap", "0px");
    piece.style.display = "inline";
    piece.style.width = "auto";
    piece.style.transform = "";
    piece.style.marginInlineEnd = "";
    piece.style.verticalAlign = "baseline";
  }
  const naturals = pieces.map((piece) => piece.offsetWidth);
  const natural = naturals.reduce((sum, width) => sum + width, 0);
  const characters = pieces.reduce(
    (sum, piece) => sum + fitTextCharacterCount(piece),
    0,
  );
  if (natural <= 0 || characters === 0) return;
  if (natural <= target + 0.5) {
    const gap = characters > 1 ? (target - natural) / (characters - 1) : 0;
    const rounded = Math.round(gap * 1000) / 1000;
    for (const piece of pieces) piece.style.setProperty("--fit-text-gap", `${rounded}px`);
    const rest = target - natural - characters * rounded;
    const last = pieces[pieces.length - 1];
    if (last && Math.abs(rest) > 0.01) {
      last.style.marginInlineEnd = `${Math.round(rest * 1000) / 1000}px`;
    }
    return;
  }
  const scale = Math.round((target / natural) * 10_000) / 10_000;
  pieces.forEach((piece, index) => {
    piece.style.display = "inline-block";
    piece.style.width = `${Math.round(naturals[index]! * scale * 1000) / 1000}px`;
    piece.style.transform = `scaleX(${scale})`;
  });
}

function observeFitTextWidth(dom: HTMLElement): () => void {
  let frame: number | null = null;
  let lastBlock: Element | null = null;
  const measure = () => {
    frame = null;
    if (!dom.isConnected) return;
    lastBlock = dom.closest(FIT_TEXT_BLOCK_SELECTOR);
    layOutFitTextRegion(fitTextRegion(dom));
  };
  const schedule = () => {
    if (frame !== null || typeof requestAnimationFrame !== "function") return;
    frame = requestAnimationFrame(measure);
  };
  schedule();
  const observer =
    typeof MutationObserver === "function" ? new MutationObserver(schedule) : null;
  observer?.observe(dom, { characterData: true, childList: true, subtree: true });
  // A face arriving late (an embedded or display font) changes the natural
  // width the gap was computed from.
  const fonts = typeof document !== "undefined" ? document.fonts : undefined;
  fonts?.addEventListener?.("loadingdone", schedule);
  return () => {
    observer?.disconnect();
    fonts?.removeEventListener?.("loadingdone", schedule);
    if (frame !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(frame);
    }
    // The region's other pieces now share the width without this one.
    const block = lastBlock;
    const id = dom.getAttribute("data-fit-text-id");
    if (block === null || id === null || typeof requestAnimationFrame !== "function") return;
    requestAnimationFrame(() => {
      const survivor = Array.from(
        block.querySelectorAll<HTMLElement>("[data-fit-text-id]"),
      ).find((piece) => piece !== dom && piece.getAttribute("data-fit-text-id") === id);
      if (survivor?.isConnected) layOutFitTextRegion(fitTextRegion(survivor));
    });
  };
}

const FitTextMark = Mark.create({
  name: FIT_TEXT_MARK,
  // One region per selection: applying Fit Text again replaces it.
  excludes: FIT_TEXT_MARK,

  addAttributes() {
    return {
      width: {
        default: null,
        parseHTML: (element) =>
          normalizeFitTextTwips(element.getAttribute("data-fit-text-width")),
        renderHTML: (attrs) => {
          const twips = normalizeFitTextTwips(attrs.width);
          if (twips === null) return {};
          return {
            "data-fit-text-width": String(twips),
            style:
              `display: inline-block; width: ${twips / 20}pt; white-space: nowrap; ` +
              "text-align: justify; text-align-last: justify; text-indent: 0; " +
              "vertical-align: bottom; transform-origin: left center",
          };
        },
      },
      id: {
        default: null,
        parseHTML: (element) =>
          normalizeFitTextId(element.getAttribute("data-fit-text-id")),
        renderHTML: (attrs) => {
          const id = normalizeFitTextId(attrs.id);
          return id === null ? {} : { "data-fit-text-id": String(id) };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-fit-text-width]",
        getAttrs: (element) =>
          isElement(element) &&
          normalizeFitTextTwips(element.getAttribute("data-fit-text-width")) !== null
            ? null
            : false,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", HTMLAttributes, 0];
  },

  addMarkView() {
    return ({ HTMLAttributes }) => {
      const dom = document.createElement("span");
      for (const [name, value] of Object.entries(HTMLAttributes)) {
        if (value !== null && value !== undefined) dom.setAttribute(name, String(value));
      }
      const disconnect = observeFitTextWidth(dom);
      return {
        dom,
        contentDOM: dom,
        ignoreMutation: (mutation) =>
          mutation.type === "attributes" && mutation.target === dom,
        destroy: disconnect,
      };
    };
  },
});

const KerningThresholdMark = Mark.create({
  name: KERNING_THRESHOLD_MARK,

  addAttributes() {
    return {
      halfPoints: { default: null, rendered: false },
      provenance: { default: null, rendered: false },
      inheritedHalfPoints: { default: null, rendered: false },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-kerning-threshold-half-points]",
        getAttrs: (element) => {
          if (!isElement(element)) return false;
          const rawProvenance = element.getAttribute(
            "data-kerning-threshold-provenance",
          );
          const rawInherited = element.getAttribute(
            "data-kerning-inherited-half-points",
          );
          const authority = normalizeKerningThresholdMarkAuthority({
            halfPoints: element.getAttribute(
              "data-kerning-threshold-half-points",
            ),
            provenance: rawProvenance,
            inheritedHalfPoints: rawInherited,
          });
          return authority ? { ...authority } : false;
        },
      },
    ];
  },

  renderHTML({ mark }) {
    const authority = normalizeKerningThresholdMarkAuthority(mark.attrs);
    if (!authority) return ["span", {}, 0];
    return [
      "span",
      {
        "data-kerning-threshold-half-points": String(authority.halfPoints),
        "data-kerning-threshold-provenance": authority.provenance,
        ...(authority.inheritedHalfPoints === null
          ? {}
          : {
              "data-kerning-inherited-half-points": String(
                authority.inheritedHalfPoints,
              ),
            }),
      },
      0,
    ];
  },
});

interface PlannedKerningThresholdRange {
  readonly from: number;
  readonly to: number;
  readonly mark: ProseMirrorMark | null;
}

interface PlannedKerningThresholdChange {
  readonly valid: boolean;
  readonly sawText: boolean;
  readonly ranges: readonly PlannedKerningThresholdRange[];
  readonly storedMarks: readonly ProseMirrorMark[] | null;
}

function kerningThresholdMark(
  state: EditorState,
  authority: KerningThresholdMarkAuthority,
): ProseMirrorMark {
  return state.schema.marks[KERNING_THRESHOLD_MARK].create({ ...authority });
}

function importedKerningFallback(
  state: EditorState,
  pos: number,
  node: ProseMirrorNode,
  resolver: ImportedStylePropertyResolver,
  authority: KerningThresholdMarkAuthority | null,
): Readonly<{ valid: boolean; value: number | null }> {
  const imported = resolver.available
    ? importedEffectiveRunProperty(state, pos, node, resolver, "kernHalfPoints")
    : { valid: true, value: null };
  if (!imported.valid) return imported;
  if (!authority) return imported;
  if (authority.provenance === "inherited") {
    return imported.value !== null && imported.value !== authority.halfPoints
      ? { valid: false, value: null }
      : { valid: true, value: authority.halfPoints };
  }
  if (
    authority.inheritedHalfPoints !== null &&
    imported.value !== null &&
    authority.inheritedHalfPoints !== imported.value
  ) {
    return { valid: false, value: null };
  }
  return {
    valid: true,
    value: authority.inheritedHalfPoints ?? imported.value,
  };
}

function plannedKerningThresholdChange(
  state: EditorState,
  targetHalfPoints: number | null,
  options: Readonly<{ extendEmpty: boolean }>,
): PlannedKerningThresholdChange {
  const markType = state.schema.marks[KERNING_THRESHOLD_MARK];
  if (!markType) {
    return { valid: false, sawText: false, ranges: [], storedMarks: null };
  }

  let from = state.selection.from;
  let to = state.selection.to;
  if (state.selection.empty) {
    if (!options.extendEmpty) {
      return { valid: false, sawText: false, ranges: [], storedMarks: null };
    }
    const activeMark = [
      ...(state.storedMarks ?? []),
      ...state.selection.$from.marks(),
    ].find((mark) => mark.type === markType);
    if (!activeMark) {
      return {
        valid: true,
        sawText: false,
        ranges: [],
        storedMarks: state.storedMarks,
      };
    }
    const authority = normalizeKerningThresholdMarkAuthority(activeMark.attrs);
    if (!authority) {
      return { valid: false, sawText: false, ranges: [], storedMarks: null };
    }
    const range = getMarkRange(
      state.selection.$from,
      markType,
      activeMark.attrs,
    );
    if (range) {
      from = range.from;
      to = range.to;
    }
  }

  const styleResolver = createImportedStylePropertyResolver(state);
  if (!styleResolver.valid) {
    return { valid: false, sawText: false, ranges: [], storedMarks: null };
  }
  let sawText = false;
  let valid = true;
  const ranges: PlannedKerningThresholdRange[] = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!valid || !node.isText) return true;
    const rangeFrom = Math.max(from, pos);
    const rangeTo = Math.min(to, pos + node.nodeSize);
    if (rangeFrom >= rangeTo) return false;
    sawText = true;
    const mark = node.marks.find(
      (candidate) => candidate.type.name === KERNING_THRESHOLD_MARK,
    );
    const authority = mark
      ? normalizeKerningThresholdMarkAuthority(mark.attrs)
      : null;
    if (mark && !authority) {
      valid = false;
      return false;
    }
    const inherited = importedKerningFallback(
      state,
      pos,
      node,
      styleResolver,
      authority,
    );
    if (!inherited.valid) {
      valid = false;
      return false;
    }
    const targetAuthority =
      targetHalfPoints === null
        ? authority?.provenance === "direct" &&
          inherited.value !== null &&
          !styleResolver.available
          ? ({
              halfPoints: inherited.value,
              provenance: "inherited",
              inheritedHalfPoints: null,
            } satisfies KerningThresholdMarkAuthority)
          : null
        : ({
            halfPoints: targetHalfPoints,
            provenance: "direct",
            inheritedHalfPoints: inherited.value,
          } satisfies KerningThresholdMarkAuthority);
    const targetMark = targetAuthority
      ? kerningThresholdMark(state, targetAuthority)
      : null;
    if (
      (mark === undefined && targetMark === null) ||
      (mark !== undefined && targetMark?.eq(mark) === true) ||
      (authority?.provenance === "inherited" && targetHalfPoints === null)
    ) {
      return false;
    }
    ranges.push({ from: rangeFrom, to: rangeTo, mark: targetMark });
    return false;
  });

  let storedMarks = state.storedMarks;
  if (valid && options.extendEmpty && storedMarks) {
    const existing = storedMarks.find((mark) => mark.type === markType);
    if (existing) {
      const authority = normalizeKerningThresholdMarkAuthority(existing.attrs);
      if (!authority) {
        valid = false;
      } else if (authority.provenance === "direct") {
        const targetAuthority =
          targetHalfPoints === null
            ? authority.inheritedHalfPoints === null || styleResolver.available
              ? null
              : ({
                  halfPoints: authority.inheritedHalfPoints,
                  provenance: "inherited",
                  inheritedHalfPoints: null,
                } satisfies KerningThresholdMarkAuthority)
            : ({
                halfPoints: targetHalfPoints,
                provenance: "direct",
                inheritedHalfPoints: authority.inheritedHalfPoints,
              } satisfies KerningThresholdMarkAuthority);
        storedMarks = [
          ...storedMarks.filter((mark) => mark.type !== markType),
          ...(targetAuthority
            ? [kerningThresholdMark(state, targetAuthority)]
            : []),
        ];
      } else if (targetHalfPoints !== null) {
        storedMarks = [
          ...storedMarks.filter((mark) => mark.type !== markType),
          kerningThresholdMark(state, {
            halfPoints: targetHalfPoints,
            provenance: "direct",
            inheritedHalfPoints: authority.halfPoints,
          }),
        ];
      }
    }
  }

  return {
    valid,
    sawText,
    ranges: valid ? ranges : [],
    storedMarks: valid ? storedMarks : null,
  };
}

function applyPlannedKerningThresholdChange(
  tr: Transaction,
  state: EditorState,
  plan: PlannedKerningThresholdChange,
): boolean {
  const markType = state.schema.marks[KERNING_THRESHOLD_MARK];
  let changed = false;
  for (const range of plan.ranges) {
    tr.removeMark(range.from, range.to, markType);
    if (range.mark) tr.addMark(range.from, range.to, range.mark);
    changed = true;
  }
  if (state.storedMarks && plan.storedMarks !== state.storedMarks) {
    tr.setStoredMarks(plan.storedMarks);
    changed = true;
  }
  return changed;
}

function documentFontAssetLifecyclePlugin(): Plugin {
  // PM nodes are immutable. Pagination rearranges shared subtrees, so avoid
  // rescanning every run on each derived transaction or selection update.
  const cache = new WeakMap<ProseMirrorNode, readonly OfficeFontAsset[]>();
  const assetsFor = (node: ProseMirrorNode): readonly OfficeFontAsset[] => {
    const existing = cache.get(node);
    if (existing) return existing;
    const assets: OfficeFontAsset[] = [];
    for (const mark of node.marks) {
      if (mark.type.name !== FONT_FAMILY_MARK && mark.type.name !== FONT_CJK_FAMILY_MARK
          && mark.type.name !== FONT_COMPLEX_FAMILY_MARK) continue;
      const face = normalizeOfficeFontFace(mark.attrs.face);
      if (face?.asset) assets.push(face.asset);
    }
    node.forEach((child) => assets.push(...assetsFor(child)));
    cache.set(node, assets);
    return assets;
  };
  return new Plugin({
    key: new PluginKey("documentFontAssetLifecycle"),
    view(view) {
      let assets = assetsFor(view.state.doc);
      let release = retainOfficeFontAssets(assets, view.dom.ownerDocument);
      return {
        update(nextView, previous) {
          if (nextView.state.doc === previous.doc) return;
          const next = assetsFor(nextView.state.doc);
          if (next === assets) return;
          // Acquire first so identical/shared faces cannot flicker or unload.
          const nextRelease = retainOfficeFontAssets(next, nextView.dom.ownerDocument);
          release();
          release = nextRelease;
          assets = next;
        },
        destroy() { release(); },
      };
    },
  });
}

const TextStyling = Extension.create({
  name: "textStyling",

  addExtensions() {
    return [
      FontSizeMark,
      FontFamilyMark,
      FontCjkFamilyMark,
      FontComplexFamilyMark,
      TextColorMark,
      HighlightMark,
      SingleStrikeMark,
      SuperscriptMark,
      SubscriptMark,
      DoubleStrikeMark,
      SmallCapsMark,
      AllCapsMark,
      CharacterStyleMark,
      CharSpacingMark,
      CharScaleMark,
      FitTextMark,
      KerningThresholdMark,
      TextEffectsMark,
      OpenTypeFeaturesMark,
      // A Word symbol character's (font, char) identity — see symbolCharMark.
      SymbolCharMark,
    ];
  },

  addCommands() {
    return {
      setFontSize:
        (size) =>
        ({ commands, editor, tr, state }) => {
          if (!editor.isEditable) return false;
          const normalized = normalizeFontSize(size);
          if (!normalized) return false;
          // Math nodes (inlineMath / mathBlock) are atoms and carry no text
          // mark, so the font control writes the size onto their own
          // `fontSize` attribute in the SAME shared transaction that marks
          // the surrounding text (TipTap dispatches `tr` once for the whole
          // command). Without this a formula stayed a fixed size while its
          // neighbours resized.
          // A display equation alone takes no text mark (setMark answers
          // false for it): the size it took is still the command's, or the
          // size box read the command as refused and put the old size back
          // (WUA 047: 24 typed on a display equation read 12, and Grow went
          // on from there).
          const sizedMath = applyFontSizeToMathNodes(tr, state, normalized);
          return commands.setMark(FONT_SIZE_MARK, { size: normalized }) || sizedMath;
        },
      unsetFontSize:
        () =>
        ({ commands, editor, tr, state }) => {
          if (!editor.isEditable) return false;
          const sizedMath = applyFontSizeToMathNodes(tr, state, null);
          return (
            commands.unsetMark(FONT_SIZE_MARK, {
              extendEmptyMarkRange: false,
            }) || sizedMath
          );
        },
      growFontSize:
        () =>
        ({ editor, commands, state, tr }) =>
          editor.isEditable &&
          (state.selection.empty
            ? commands.setFontSize(
                transformCollapsedFontSize(editor, state, tr, (current) =>
                  stepDocumentFontSize(current, 1),
                ) ?? "",
              )
            : transformSelectedFontSizes(tr, state, (current) =>
                stepDocumentFontSize(current, 1),
              )),
      shrinkFontSize:
        () =>
        ({ editor, commands, state, tr }) =>
          editor.isEditable &&
          (state.selection.empty
            ? commands.setFontSize(
                transformCollapsedFontSize(editor, state, tr, (current) =>
                  stepDocumentFontSize(current, -1),
                ) ?? "",
              )
            : transformSelectedFontSizes(tr, state, (current) =>
                stepDocumentFontSize(current, -1),
              )),
      increaseFontSizeOnePoint:
        () =>
        ({ editor, commands, state, tr }) =>
          editor.isEditable &&
          (state.selection.empty
            ? commands.setFontSize(
                transformCollapsedFontSize(editor, state, tr, (current) =>
                  stepFontSizeOnePoint(current, 1),
                ) ?? "",
              )
            : transformSelectedFontSizes(tr, state, (current) =>
                stepFontSizeOnePoint(current, 1),
              )),
      decreaseFontSizeOnePoint:
        () =>
        ({ editor, commands, state, tr }) =>
          editor.isEditable &&
          (state.selection.empty
            ? commands.setFontSize(
                transformCollapsedFontSize(editor, state, tr, (current) =>
                  stepFontSizeOnePoint(current, -1),
                ) ?? "",
              )
            : transformSelectedFontSizes(tr, state, (current) =>
                stepFontSizeOnePoint(current, -1),
              )),
      setFontFamily:
        (family, face) =>
        ({ commands, editor, tr, state }) => {
          if (!editor.isEditable) return false;
          const normalized = normalizeFontFamily(family);
          const identity = normalizeOfficeFontFace(face);
          if (!normalized || (face != null && identity === null)) return false;
          clearChangedFontHintCharset(tr, state, "primary", normalized);
          const hinted = complexScriptHintRanges(state, normalized);
          const set = commands.setMark(FONT_FAMILY_MARK, { family: normalized, face: identity ?? undefined });
          clearComplexScriptHint(tr, hinted);
          return set;
        },
      unsetFontFamily:
        () =>
        ({ commands, editor }) =>
          editor.isEditable &&
          commands.unsetMark(FONT_FAMILY_MARK, { extendEmptyMarkRange: false }),
      setCjkFont:
        (family, face) =>
        ({ commands, editor, tr, state }) => {
          if (!editor.isEditable) return false;
          const normalized = normalizeFontFamily(family);
          const identity = normalizeOfficeFontFace(face);
          if (!normalized || (face != null && identity === null)) return false;
          clearChangedFontHintCharset(tr, state, "eastAsia", normalized);
          return commands.setMark(FONT_CJK_FAMILY_MARK, { family: normalized, face: identity ?? undefined });
        },
      unsetCjkFont:
        () =>
        ({ commands, editor, tr, state }) => {
          if (!editor.isEditable) return false;
          clearChangedFontHintCharset(tr, state, "eastAsia", null);
          return commands.unsetMark(FONT_CJK_FAMILY_MARK, {
            extendEmptyMarkRange: false,
          });
        },
      setTextColor:
        (color, themeColor) =>
        ({ commands, editor, tr, state }) => {
          if (!editor.isEditable) return false;
          const normalized = normalizeTextColor(color);
          if (!normalized) return false;
          // A display equation alone takes no text mark (setMark answers
          // false for it): the colour it took is still the command's.
          const coloredMath = applyTextColorToMathBlocks(tr, state, normalized);
          return (
            commands.setMark(TEXT_COLOR_MARK, {
              color: normalized,
              // setMark merges attributes: a literal colour drops the theme
              // reference a previous swatch left.
              themeColor: normalizeTextThemeColor(themeColor),
            }) || coloredMath
          );
        },
      setTextColorAutomatic:
        () =>
        ({ commands, editor, tr, state }) => {
          if (!editor.isEditable) return false;
          // Automatic on an equation is no colour of its own.
          const coloredMath = applyTextColorToMathBlocks(tr, state, null);
          return commands.setMark(TEXT_COLOR_MARK, { color: AUTOMATIC_TEXT_COLOR }) || coloredMath;
        },
      unsetTextColor:
        () =>
        ({ commands, editor, tr, state }) => {
          if (!editor.isEditable) return false;
          const coloredMath = applyTextColorToMathBlocks(tr, state, null);
          return commands.unsetMark(TEXT_COLOR_MARK, { extendEmptyMarkRange: false }) || coloredMath;
        },
      setHighlight:
        (color) =>
        ({ commands, editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const normalized = normalizeHighlightColor(color);
          if (!normalized) return false;
          // A highlight, never shading: setMark keeps the attributes a run's
          // mark had, and a run imported with shading (w:shd) took the colour
          // still flagged as shading -- saved back as shading, and its text
          // turned white on a dark colour as no highlight does.
          const attrs = { color: normalized, shading: null };
          // A caret inside a word highlights the word: a colour only armed
          // for the next keystroke showed nothing, and read as not applied.
          const word = caretInsideWord(state);
          if (word) {
            if (dispatch) tr.addMark(word.from, word.to, state.schema.marks[HIGHLIGHT_MARK]!.create(attrs));
            return true;
          }
          if (!commands.setMark(HIGHLIGHT_MARK, attrs)) return false;
          if (dispatch) unhighlightObjects(tr);
          return true;
        },
      toggleHighlight:
        (color) =>
        ({ commands, editor, state }) => {
          if (!editor.isEditable) return false;
          const normalized = normalizeHighlightColor(color);
          if (!normalized) return false;
          return selectionWearsHighlight(state, normalized)
            ? commands.unsetHighlight()
            : commands.setHighlight(normalized);
        },
      unsetHighlight:
        () =>
        ({ commands, editor }) =>
          // A caret clears the highlighted run it stands in: with only the
          // stored mark cleared, No Color in a highlighted word did nothing
          // the reader could see.
          editor.isEditable &&
          commands.unsetMark(HIGHLIGHT_MARK, { extendEmptyMarkRange: true }),
      toggleSuperscript:
        () =>
        ({ chain, editor }) => {
          if (!editor.isEditable) return false;
          if (editor.isActive(SUPERSCRIPT_MARK)) {
            // extendEmptyMarkRange so a collapsed cursor inside a <sup> run
            // removes the whole run (Word/WPS parity).
            return chain()
              .unsetMark(SUPERSCRIPT_MARK, { extendEmptyMarkRange: false })
              .run();
          }
          // Explicitly drop subscript first so the two never co-exist; setMark
          // arms a stored mark at a collapsed cursor so the next typed char is
          // superscript.
          return chain()
            .unsetMark(SUBSCRIPT_MARK, { extendEmptyMarkRange: false })
            .setMark(SUPERSCRIPT_MARK)
            .run();
        },
      toggleSubscript:
        () =>
        ({ chain, editor }) => {
          if (!editor.isEditable) return false;
          if (editor.isActive(SUBSCRIPT_MARK)) {
            return chain()
              .unsetMark(SUBSCRIPT_MARK, { extendEmptyMarkRange: false })
              .run();
          }
          return chain()
            .unsetMark(SUPERSCRIPT_MARK, { extendEmptyMarkRange: false })
            .setMark(SUBSCRIPT_MARK)
            .run();
        },
      toggleDoubleStrike:
        () =>
        ({ chain, editor }) => {
          if (!editor.isEditable) return false;
          if (editor.isActive(DOUBLE_STRIKE_MARK)) {
            return chain()
              .unsetMark(DOUBLE_STRIKE_MARK, { extendEmptyMarkRange: false })
              .run();
          }
          return chain().setMark(DOUBLE_STRIKE_MARK).run();
        },
      toggleSmallCaps:
        () =>
        ({ chain, editor }) => {
          if (!editor.isEditable) return false;
          if (editor.isActive(SMALL_CAPS_MARK)) {
            return chain()
              .unsetMark(SMALL_CAPS_MARK, { extendEmptyMarkRange: false })
              .run();
          }
          // Drop all-caps first so the two never co-exist (one case effect).
          return chain()
            .unsetMark(ALL_CAPS_MARK, { extendEmptyMarkRange: false })
            .setMark(SMALL_CAPS_MARK)
            .run();
        },
      toggleAllCaps:
        () =>
        ({ chain, editor }) => {
          if (!editor.isEditable) return false;
          if (editor.isActive(ALL_CAPS_MARK)) {
            return chain()
              .unsetMark(ALL_CAPS_MARK, { extendEmptyMarkRange: false })
              .run();
          }
          return chain()
            .unsetMark(SMALL_CAPS_MARK, { extendEmptyMarkRange: false })
            .setMark(ALL_CAPS_MARK)
            .run();
        },
      setCharacterStyle:
        (name) =>
        ({ commands, editor }) => {
          if (!editor.isEditable) return false;
          const normalized = normalizeCharacterStyle(name);
          return normalized
            ? commands.setMark(CHARACTER_STYLE_MARK, {
                name: normalized,
                styleId: null,
              })
            : false;
        },
      unsetCharacterStyle:
        () =>
        ({ commands, editor }) =>
          editor.isEditable &&
          commands.unsetMark(CHARACTER_STYLE_MARK, {
            extendEmptyMarkRange: false,
          }),
      setCharSpacing:
        (pt) =>
        ({ commands, editor }) => {
          if (!editor.isEditable) return false;
          const normalized = normalizeCharSpacing(pt);
          if (normalized === null) return false;
          // Word keeps the spacing in twentieths of a point (w:spacing
          // w:val): Font > Advanced > Spacing By 44.71 pt is 894 twips, 44.7
          // pt. A finer value is no DOCX spacing and the full export refused
          // the whole document over it (character_spacing_not_natively_representable,
          // corpus R458-D77 WALK1); one under half a twip is Normal spacing.
          const twips = Math.round(normalized * 20);
          if (twips === 0) {
            return commands.unsetMark(CHAR_SPACING_MARK, { extendEmptyMarkRange: false });
          }
          return commands.setMark(CHAR_SPACING_MARK, { spacing: twips / 20 });
        },
      unsetCharSpacing:
        () =>
        ({ commands, editor }) =>
          editor.isEditable &&
          commands.unsetMark(CHAR_SPACING_MARK, { extendEmptyMarkRange: false }),
      setCharScale:
        (pct) =>
        ({ commands, editor }) => {
          if (!editor.isEditable) return false;
          const normalized = normalizeCharScale(pct);
          // 100 % is Word's unscaled text (no w:w): the exporters refuse a
          // scale mark of 100, so it is the mark's removal.
          if (normalized === 100)
            return commands.unsetMark(CHAR_SCALE_MARK, { extendEmptyMarkRange: false });
          return normalized !== null
            ? commands.setMark(CHAR_SCALE_MARK, { scale: normalized })
            : false;
        },
      unsetCharScale:
        () =>
        ({ commands, editor }) =>
          editor.isEditable &&
          commands.unsetMark(CHAR_SCALE_MARK, { extendEmptyMarkRange: false }),
      setFitText:
        (widthTwips) =>
        ({ commands, editor, state }) => {
          if (!editor.isEditable || state.selection.empty) return false;
          const width = normalizeFitTextTwips(widthTwips);
          if (width === null) return false;
          // A new region id, unlike any other in the document (w:id links
          // only contiguous runs, so a fresh one keeps this region apart).
          let id = 1;
          state.doc.descendants((node) => {
            for (const mark of node.marks) {
              const existing = normalizeFitTextId(mark.attrs.id);
              if (mark.type.name === FIT_TEXT_MARK && existing !== null && existing >= id) {
                id = existing + 1;
              }
            }
            return true;
          });
          return commands.setMark(FIT_TEXT_MARK, { width, id });
        },
      unsetFitText:
        () =>
        ({ commands, editor }) =>
          editor.isEditable &&
          commands.unsetMark(FIT_TEXT_MARK, { extendEmptyMarkRange: false }),
      setKerningThreshold:
        (halfPoints) =>
        ({ editor, state, tr }) => {
          if (!editor.isEditable) return false;
          const normalized = normalizeKerningThresholdHalfPoints(halfPoints);
          if (normalized === null) return false;
          const plan = plannedKerningThresholdChange(state, normalized, {
            extendEmpty: false,
          });
          if (!plan.valid || !plan.sawText) return false;
          if (applyPlannedKerningThresholdChange(tr, state, plan)) {
            closeHistory(tr);
          }
          return true;
        },
      unsetKerningThreshold:
        () =>
        ({ editor, state, tr }) => {
          if (!editor.isEditable) return false;
          const plan = plannedKerningThresholdChange(state, null, {
            extendEmpty: false,
          });
          if (!plan.valid || !plan.sawText) return false;
          if (applyPlannedKerningThresholdChange(tr, state, plan)) {
            closeHistory(tr);
          }
          return true;
        },
      clearTextStyles:
        () =>
        ({ commands, editor, state, tr }) => {
          if (!editor.isEditable) return false;
          // Authenticate the complete kerning provenance before touching any
          // other visual mark. Clear Formatting owns only direct w:kern; a
          // style-derived threshold remains effective and export-owned by the
          // style graph.
          
          // the formats are dropped for what is typed next only.
          const kerningPlan = plannedKerningThresholdChange(state, null, {
            extendEmpty: false,
          });
          if (!kerningPlan.valid) return false;

          // Every direct format goes, bold included: a bold mark set to
          // `value: null` (inherit) is the same run with an empty mark left on
          // it, which no other format does.
          for (const markName of CLEARABLE_TEXT_STYLE_MARKS) {
            if (!selectionHasTextStyleMark(state, markName)) continue;
            commands.unsetMark(markName, { extendEmptyMarkRange: false });
          }

          applyPlannedKerningThresholdChange(tr, state, kerningPlan);
          applyFontSizeToMathNodes(tr, state, null);
          clearSelectedParagraphPresentation(tr, state);
          restoreImportedStyleRunLook(tr, state);

          if (!tr.docChanged && !tr.storedMarksSet) {
            tr.setMeta("preventDispatch", true);
            return false;
          }
          closeHistory(tr);
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [kerningRenderingPlugin(), documentFontAssetLifecyclePlugin()];
  },

  addKeyboardShortcuts() {
    // A size step the selection refuses for a known reason (inline code) is
    
    // than falling through silently (or to the browser: Command+[ is Back).
    const step = (run: () => boolean): boolean => {
      const refusal = this.editor.isEditable
        ? fontSizeStepRefusal(this.editor.state)
        : null;
      if (!refusal) return run();
      this.editor.view.dom.dispatchEvent(
        new CustomEvent(FONT_SIZE_STEP_REFUSED_EVENT, {
          bubbles: true,
          detail: { reason: refusal },
        }),
      );
      return true;
    };
    return {
      // Word for Mac keeps two distinct size gestures: Command+Shift+>/< walks
      // the preset ladder used by the Ribbon buttons, while Command+]/[ changes
      // every selected run by exactly one point. Literal Ctrl variants preserve
      // the established cross-platform aliases.
      "Mod-Shift->": () => step(() => this.editor.commands.growFontSize()),
      "Mod-Shift-<": () => step(() => this.editor.commands.shrinkFontSize()),
      "Ctrl-Shift->": () => step(() => this.editor.commands.growFontSize()),
      "Ctrl-Shift-<": () => step(() => this.editor.commands.shrinkFontSize()),
      "Mod-]": () => step(() => this.editor.commands.increaseFontSizeOnePoint()),
      "Mod-[": () => step(() => this.editor.commands.decreaseFontSizeOnePoint()),
      "Ctrl-]": () => step(() => this.editor.commands.increaseFontSizeOnePoint()),
      "Ctrl-[": () => step(() => this.editor.commands.decreaseFontSizeOnePoint()),
    };
  },
});

export default TextStyling;
