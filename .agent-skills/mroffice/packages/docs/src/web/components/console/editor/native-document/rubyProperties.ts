/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Phonetic Guide (Word "拼音指南") properties and the dialog's row model.
 *
 * Word semantics this module reproduces (Word desktop is the specification;
 * sources: ECMA-376 Part 1 §17.3.3.25 `ruby` / §17.3.3.24 `rubyPr` and its
 * children, the Open XML SDK `RubyProperties` reference, and Word VBA
 * `Range.PhoneticGuide` / `WdPhoneticGuideAlignmentType`):
 *
 * - One `w:ruby` holds ONE base group and its guide text. Word's dialog lists
 *   the selection as rows (Base text / Ruby text), one row per group; OK writes
 *   one `w:ruby` per row whose ruby text is not empty and leaves a row with an
 *   empty ruby text as plain text (so clearing a reading removes that guide).
 * - Group ("组合") merges every row into one base group; Mono ("单字") splits
 *   every group into one row per character.
 * - Alignment (`w:rubyAlign`, ST_RubyAlign) is one of Center (the default),
 *   0-1-0 (`distributeLetter`), 1-2-1 (`distributeSpace`), Left, Right and
 *   Vertical (`rightVertical`, the guide on the right of vertical text).
 * - Size (`w:hps`, half-points) is the guide's font size. Word's default is
 *   half the base text's size.
 * - Offset (pt) is the extra distance between the base and the guide. OOXML
 *   stores the guide's raise above the base (`w:hpsRaise`, half-points); MRAI
 *   maps Offset 0 to a raise of the base size minus 1pt (Word's own 11pt base /
 *   10pt raise pairing in the spec example), so
 *   `hpsRaise = hpsBaseText - 2 + 2 * offset` and the import inverts it
 *   exactly on the half-point lattice.
 * - `w:hpsBaseText` records the base text's size, written from the size of
 *   the text the guide was applied to.
 * - Font is the guide run's face (`w:rt/w:r/w:rPr/w:rFonts`); none means the
 *   guide uses the base text's font (Word's default).
 *
 * Every attribute is optional on the node: `null` means "not stated" and
 * exports as the historical defaults (center, 8pt guide over an 11pt base,
 * offset 0), so a document that never used the dialog exports byte-for-byte
 * as before.
 */

import { graphemeClusters } from "@mrnote/core/web/lib/document-word-count.ts";

export const DOCUMENT_RUBY_ALIGN_VALUES = [
  "center",
  "distributeLetter",
  "distributeSpace",
  "left",
  "right",
  "rightVertical",
] as const;

export type DocumentRubyAlign = (typeof DOCUMENT_RUBY_ALIGN_VALUES)[number];

export interface DocumentRubyProperties {
  readonly align: DocumentRubyAlign | null;
  /** Guide font size, pt (half-point lattice). */
  readonly fontSize: number | null;
  /** Base text font size the guide was laid out for, pt (half-point lattice). */
  readonly baseFontSize: number | null;
  /** Extra distance between base and guide, pt (half-point lattice). */
  readonly offset: number | null;
  /** Guide font face name, or null for the base text's own face. */
  readonly fontFamily: string | null;
}

export const DOCUMENT_RUBY_PROPERTY_KEYS = [
  "align",
  "fontSize",
  "baseFontSize",
  "offset",
  "fontFamily",
] as const;

/** Word's font-size range (1-1638 pt), in the half points OOXML stores. */
export const MIN_RUBY_FONT_SIZE_PT = 1;
export const MAX_RUBY_FONT_SIZE_PT = 1638;
/** Offset range the dialog and the importer accept, pt. */
export const MIN_RUBY_OFFSET_PT = -1638;
export const MAX_RUBY_OFFSET_PT = 1638;
export const MAX_RUBY_FONT_FAMILY_LENGTH = 128;

/** Historical export defaults for a guide whose properties are not stated. */
export const DEFAULT_RUBY_GUIDE_HALF_POINTS = 16;
export const DEFAULT_RUBY_BASE_HALF_POINTS = 22;

const RUBY_FONT_CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]/;

export function normalizeRubyAlign(value: unknown): DocumentRubyAlign | null {
  return typeof value === "string" &&
    (DOCUMENT_RUBY_ALIGN_VALUES as readonly string[]).includes(value)
    ? (value as DocumentRubyAlign)
    : null;
}

function onHalfPointLattice(value: number): boolean {
  return Number.isInteger(value * 2);
}

/** A font size in pt on the half-point lattice within Word's range, or null. */
export function normalizeRubyFontSize(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (!onHalfPointLattice(value)) return null;
  return value >= MIN_RUBY_FONT_SIZE_PT && value <= MAX_RUBY_FONT_SIZE_PT
    ? value
    : null;
}

export function normalizeRubyOffset(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (!onHalfPointLattice(value)) return null;
  const normalized = value === 0 ? 0 : value;
  return normalized >= MIN_RUBY_OFFSET_PT && normalized <= MAX_RUBY_OFFSET_PT
    ? normalized
    : null;
}

/** A canonical face name: trimmed, no control bytes, bounded, else null. */
export function normalizeRubyFontFamily(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed !== value ||
    trimmed.length > MAX_RUBY_FONT_FAMILY_LENGTH ||
    RUBY_FONT_CONTROL_RE.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
}

export function readDocumentRubyProperties(
  attrs: Readonly<Record<string, unknown>> | null | undefined,
): DocumentRubyProperties {
  const source = attrs ?? {};
  return {
    align: normalizeRubyAlign(source.align),
    fontSize: normalizeRubyFontSize(source.fontSize),
    baseFontSize: normalizeRubyFontSize(source.baseFontSize),
    offset: normalizeRubyOffset(source.offset),
    fontFamily: normalizeRubyFontFamily(source.fontFamily),
  };
}

export interface DocumentRubyPrValues {
  readonly align: DocumentRubyAlign;
  readonly hps: number;
  readonly hpsRaise: number;
  readonly hpsBaseText: number;
  readonly fontFamily: string | null;
}

/** The `w:rubyPr` values a guide exports as. */
export function documentRubyPrValues(
  properties: DocumentRubyProperties,
): DocumentRubyPrValues {
  const hps =
    properties.fontSize === null
      ? DEFAULT_RUBY_GUIDE_HALF_POINTS
      : Math.round(properties.fontSize * 2);
  const hpsBaseText =
    properties.baseFontSize === null
      ? DEFAULT_RUBY_BASE_HALF_POINTS
      : Math.round(properties.baseFontSize * 2);
  const hpsRaise = Math.max(
    0,
    hpsBaseText - 2 + Math.round((properties.offset ?? 0) * 2),
  );
  return {
    align: properties.align ?? "center",
    hps,
    hpsRaise,
    hpsBaseText,
    fontFamily: properties.fontFamily,
  };
}

function halfPointInteger(value: string | null | undefined): number | null {
  if (typeof value !== "string" || !/^\d{1,5}$/.test(value.trim())) return null;
  return Number.parseInt(value.trim(), 10);
}

/**
 * The node attributes a `w:rubyPr` states. Only what the file states is
 * returned (an absent or invalid element reads as not stated), so an import
 * and the server projection agree key for key.
 */
export function documentRubyPropertiesFromOoxml(input: {
  readonly align?: string | null;
  readonly hps?: string | null;
  readonly hpsRaise?: string | null;
  readonly hpsBaseText?: string | null;
  readonly fontFamily?: string | null;
}): Partial<DocumentRubyProperties> {
  const out: {
    align?: DocumentRubyAlign;
    fontSize?: number;
    baseFontSize?: number;
    offset?: number;
    fontFamily?: string;
  } = {};
  const align = normalizeRubyAlign(input.align ?? null);
  if (align) out.align = align;
  const hps = halfPointInteger(input.hps);
  const fontSize = hps === null ? null : normalizeRubyFontSize(hps / 2);
  if (fontSize !== null) out.fontSize = fontSize;
  const hpsBase = halfPointInteger(input.hpsBaseText);
  const baseFontSize =
    hpsBase === null ? null : normalizeRubyFontSize(hpsBase / 2);
  if (baseFontSize !== null) out.baseFontSize = baseFontSize;
  const raise = halfPointInteger(input.hpsRaise);
  if (raise !== null) {
    const base =
      baseFontSize === null
        ? DEFAULT_RUBY_BASE_HALF_POINTS
        : Math.round(baseFontSize * 2);
    const offset = normalizeRubyOffset((raise - base + 2) / 2);
    if (offset !== null) out.offset = offset;
  }
  const fontFamily = normalizeRubyFontFamily(
    typeof input.fontFamily === "string" ? input.fontFamily.trim() : null,
  );
  if (fontFamily) out.fontFamily = fontFamily;
  return out;
}

/** CSS `ruby-align` for an ST_RubyAlign value. */
export function documentRubyCssAlign(align: DocumentRubyAlign | null): string {
  switch (align) {
    case "distributeLetter":
      return "space-between";
    case "distributeSpace":
      return "space-around";
    case "left":
      return "start";
    default:
      // Right has no CSS ruby-align keyword; the guide's own text-align does it.
      return "center";
  }
}

// ---------------------------------------------------------------------------
// Dialog rows
// ---------------------------------------------------------------------------

/** One Base text / Ruby text row of the dialog. */
export interface PhoneticGuideRow {
  readonly base: string;
  readonly ruby: string;
}

/**
 * A piece of the selection: an editable row, or the whitespace between two
 * words, which Word keeps as plain text between the groups.
 */
export type PhoneticGuideSegment =
  | { readonly kind: "row"; readonly base: string; readonly ruby: string }
  | { readonly kind: "gap"; readonly text: string };

const CJK_CHAR_RE =
  /[⺀-⿟々-〇〡-〩぀-ヿ㐀-䶿一-鿿豈-﫿\u{20000}-\u{3134f}]/u;

export function isPhoneticGuideCjkCharacter(character: string): boolean {
  return CJK_CHAR_RE.test(character);
}

/**
 * Split plain selected text into rows the way Word first lists them: each
 * CJK character is its own row (a reading per character, as Chinese pinyin
 * needs), every other run of non-space characters is one row (a word), and
 * whitespace between them stays as plain text.
 */
export function phoneticGuideSegmentsFromText(
  text: string,
): PhoneticGuideSegment[] {
  const segments: PhoneticGuideSegment[] = [];
  let word = "";
  let gap = "";
  const flushWord = () => {
    if (word) segments.push({ kind: "row", base: word, ruby: "" });
    word = "";
  };
  const flushGap = () => {
    if (gap) segments.push({ kind: "gap", text: gap });
    gap = "";
  };
  for (const character of Array.from(text)) {
    if (/\s/u.test(character)) {
      flushWord();
      gap += character;
      continue;
    }
    flushGap();
    if (isPhoneticGuideCjkCharacter(character)) {
      flushWord();
      segments.push({ kind: "row", base: character, ruby: "" });
      continue;
    }
    word += character;
  }
  flushWord();
  flushGap();
  return segments;
}

/** Group: every row and the whitespace between them become one base group. */
export function groupPhoneticGuideSegments(
  segments: readonly PhoneticGuideSegment[],
): PhoneticGuideSegment[] {
  const rows = segments.filter(
    (segment): segment is Extract<PhoneticGuideSegment, { kind: "row" }> =>
      segment.kind === "row",
  );
  if (rows.length <= 1) return [...segments];
  const first = segments.findIndex((segment) => segment.kind === "row");
  let last = -1;
  segments.forEach((segment, index) => {
    if (segment.kind === "row") last = index;
  });
  const base = segments
    .slice(first, last + 1)
    .map((segment) => (segment.kind === "row" ? segment.base : segment.text))
    .join("");
  const ruby = rows
    .map((row) => row.ruby.trim())
    .filter(Boolean)
    .join(" ");
  return [
    ...segments.slice(0, first),
    { kind: "row", base, ruby },
    ...segments.slice(last + 1),
  ];
}

/**
 * Mono: every group splits into one row per character. A reading made of as
 * many space-separated parts as the group has characters is distributed over
 * them (a pinyin syllable per character); any other reading stays on the
 * first character so nothing typed is lost.
 */
export function monoPhoneticGuideSegments(
  segments: readonly PhoneticGuideSegment[],
): PhoneticGuideSegment[] {
  const out: PhoneticGuideSegment[] = [];
  for (const segment of segments) {
    if (segment.kind === "gap") {
      out.push(segment);
      continue;
    }
    // One row per character as the reader sees it: "é" written as e plus a
    // combining acute is one base, not an e with a guide and a stray accent
    
    const characters = graphemeClusters(segment.base);
    if (characters.length <= 1) {
      out.push(segment);
      continue;
    }
    const parts = segment.ruby.trim() ? segment.ruby.trim().split(/\s+/u) : [];
    // Spaces in the base take no reading: "你 好" / "ni hao" is two
    // characters and two syllables.
    const letters = characters.filter((character) => !/\s/u.test(character));
    const distribute = parts.length === letters.length;
    let letter = 0;
    characters.forEach((character) => {
      if (/\s/u.test(character)) {
        out.push({ kind: "gap", text: character });
        return;
      }
      const ruby = distribute
        ? parts[letter]
        : letter === 0
          ? segment.ruby
          : "";
      letter += 1;
      out.push({ kind: "row", base: character, ruby });
    });
  }
  return out;
}
