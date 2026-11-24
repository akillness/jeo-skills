/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * PURE helpers for PRECISE paragraph indents (Word/WPS "段落" dialog parity):
 *
 *   - left / right indent in POINTS (≥ 0), and
 *   - a FIRST-LINE indent in POINTS that may be NEGATIVE — a negative first-line
 *     indent is Word's "hanging indent" (悬挂缩进), where the first line starts to
 *     the LEFT of the rest of the paragraph (references, definitions, glossaries).
 *
 * These complement the existing coarse `indent` LEVEL (0–7, Tab/Shift-Tab) and the
 * em-based first-line `textIndent` (首行缩进 2 字符). The precise values are stored
 * on the same paragraph/heading attrs and:
 *   - render to inline CSS (`margin-left` / `margin-right` / `text-indent`) for the
 *     on-screen page, and
 *   - export to OOXML `<w:ind w:left/right/firstLine/hanging>` (in twips) for a
 *     Word/WPS round-trip.
 *
 * Kept free of any TipTap/React/DOM import so the clamping + unit math can be
 * unit-tested in isolation and reused by the extension, the toolbar dialog and
 * the DOCX exporter.
 *
 * SECURITY: every value is coerced to a finite number and clamped to a sane band
 * before it can reach an inline `style` string or an XML attribute, so neither a
 * forged attribute nor a pasted/imported document can inject a layout-breaking
 * (or attribute-breaking) value.
 */

/** Points per inch (Word's indent dialog speaks points; OOXML speaks twips). */
const POINTS_PER_INCH = 72;
/** Twips per point: 1440 / 72 = 20 (exact integer, so pt↔twips is clean). */
const TWIPS_PER_POINT = 20;

/**
 * Upper bound for a left/right indent and the MAGNITUDE of a first-line indent,
 * in points. 1584pt = 22in mirrors Word's own indent ceiling (and the paragraph
 * before/after spacing cap), generous enough for any real document while keeping
 * a pasted/forged value from injecting an absurd margin.
 */
export const MAX_INDENT_PT = 1584;

/** Round to two decimals so a stored/rendered point value stays tidy. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Normalize a NON-NEGATIVE indent (left or right) to points, or null. Accepts a
 * number or a numeric string with an optional `pt` suffix (what the data-attr
 * serializes to on re-parse). `0`, negatives and invalid inputs return null so
 * the attribute stays ABSENT (byte-for-byte stable on untouched paragraphs).
 */
export function normalizeIndentPt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const raw =
    typeof value === "number"
      ? value
      : Number.parseFloat(String(value).trim().replace(/pt$/i, ""));
  if (!Number.isFinite(raw)) return null;
  const points = round2(Math.min(Math.max(raw, 0), MAX_INDENT_PT));
  return points > 0 ? points : null;
}

/**
 * Normalize a paragraph's LEFT or RIGHT indent to points, SIGNED, or null: a
 * negative side indent hangs the lines into the margin, as Word draws it
 * (`w:ind w:left="-567"`; corpus R09-D23). Magnitude clamped to
 * {@link MAX_INDENT_PT}; `0` / invalid → null.
 */
export function normalizeSideIndentPt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const raw =
    typeof value === "number"
      ? value
      : Number.parseFloat(String(value).trim().replace(/pt$/i, ""));
  if (!Number.isFinite(raw)) return null;
  const points = round2(Math.min(Math.max(raw, -MAX_INDENT_PT), MAX_INDENT_PT));
  return points !== 0 ? points : null;
}

/**
 * Normalize a SIGNED first-line indent to points, or null. A POSITIVE value is a
 * first-line indent; a NEGATIVE value is a HANGING indent (the first line hangs
 * to the left of the rest). The magnitude is clamped to {@link MAX_INDENT_PT}.
 * `0` / invalid → null (attribute absent). Accepts a number or a numeric string
 * with an optional `pt` suffix (incl. a leading `-`).
 */
export function normalizeFirstLineIndentPt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const raw =
    typeof value === "number"
      ? value
      : Number.parseFloat(String(value).trim().replace(/pt$/i, ""));
  if (!Number.isFinite(raw)) return null;
  const clamped = Math.min(Math.max(raw, -MAX_INDENT_PT), MAX_INDENT_PT);
  const points = round2(clamped);
  return points !== 0 ? points : null;
}

/** Points → twips (1pt = 20 twips). Rounded; non-finite → 0. */
export function pointsToTwips(points: number): number {
  if (!Number.isFinite(points)) return 0;
  return Math.round(points * TWIPS_PER_POINT);
}

/** Twips → points (1pt = 20 twips). Two-decimal rounded; non-finite → 0. */
export function twipsToPoints(twips: number): number {
  if (!Number.isFinite(twips)) return 0;
  return round2(twips / TWIPS_PER_POINT);
}

/** Centimetres → points (1in = 2.54cm = 72pt). Two-decimal rounded. */
export function cmToPoints(cm: number): number {
  if (!Number.isFinite(cm)) return 0;
  return round2((cm / 2.54) * POINTS_PER_INCH);
}

/** Points → centimetres (1in = 2.54cm = 72pt). Two-decimal rounded. */
export function pointsToCm(points: number): number {
  if (!Number.isFinite(points)) return 0;
  return round2((points / POINTS_PER_INCH) * 2.54);
}

/**
 * The unit a precise-indent input/field is expressed in. `char` is Word's
 * 字符 (the default indent unit of Chinese Word): ECMA-376 17.3.1.12 states
 * `w:leftChars` / `w:rightChars` / `w:hangingChars` / `w:firstLineChars` in
 * hundredths of a character unit. A character of a left, right or hanging
 * indent is the size of the document's default paragraph text (Word 16.86,
 * measured for the DOCX importer); a first-line character is the paragraph's
 * own text size (`textIndent`, rendered in em).
 */
export type IndentUnit = "pt" | "cm" | "in" | "char";

/** Chinese Word's Normal text, 五号 = 10.5 pt: a character when nothing says otherwise. */
export const DEFAULT_CHARACTER_UNIT_PT = 10.5;

/**
 * Parse a free-text indent entry (the paragraph dialog's input) into POINTS,
 * honouring the field's unit. An explicit `cm`/`pt` suffix in the text overrides
 * the field unit. `signed` allows a leading `-` (first-line/hanging); otherwise a
 * negative parses as null (cleared). Returns null for blank/invalid input.
 */
export function parseIndentInput(
  text: unknown,
  unit: IndentUnit,
  signed = false,
  characterPt: number = DEFAULT_CHARACTER_UNIT_PT,
): number | null {
  if (typeof text !== "string") {
    if (typeof text === "number") {
      return signed
        ? normalizeFirstLineIndentPt(text)
        : normalizeIndentPt(text);
    }
    return null;
  }
  const parsed = parseIndentEntry(text, unit);
  if (!parsed) return null;
  const points =
    parsed.unit === "cm"
      ? cmToPoints(parsed.value)
      : parsed.unit === "in"
        ? round2(parsed.value * POINTS_PER_INCH)
        : parsed.unit === "char"
          ? round2(parsed.value * characterPt)
          : parsed.value;
  return signed
    ? normalizeFirstLineIndentPt(points)
    : normalizeIndentPt(points);
}

// Inches, millimetres and picas as well as Word's own Chinese names: Word
// reads any length unit typed into an indent box ("0.5\"", "5 mm").
const UNIT_SUFFIX = /(cm|厘米|mm|毫米|inches|inch|in|"|”|英寸|pt|磅|pi|chars?|ch|字符)$/i;

/**
 * The number an indent entry states and the unit it is in: the field's own,
 * or the one written after the number ("2 字符", "1.5cm", "12 磅").
 */
export function parseIndentEntry(
  text: string,
  unit: IndentUnit,
): { value: number; unit: IndentUnit } | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const suffix = UNIT_SUFFIX.exec(trimmed)?.[1]?.toLowerCase() ?? null;
  const number = trimmed.replace(UNIT_SUFFIX, "").trim();
  // The whole entry is one number and its unit: "0.5in" read as 0.5 of the
  // field's unit when "in" was not a unit it knew.
  if (!/^[-+−]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(number)) return null;
  const numeric = Number.parseFloat(number.replace("−", "-").replace(",", "."));
  if (!Number.isFinite(numeric)) return null;
  if (suffix === "mm" || suffix === "毫米") return { value: numeric / 10, unit: "cm" };
  if (suffix === "pi") return { value: numeric * 12, unit: "pt" };
  const effective: IndentUnit =
    suffix === null
      ? unit
      : suffix === "cm" || suffix === "厘米"
        ? "cm"
        : suffix === "in" || suffix === "inch" || suffix === "inches" ||
            suffix === '"' || suffix === "”" || suffix === "英寸"
          ? "in"
          : suffix === "pt" || suffix === "磅"
            ? "pt"
            : "char";
  return { value: numeric, unit: effective };
}

/**
 * Format a stored POINT value for display in the paragraph dialog, in the chosen
 * unit, with no trailing zeros. `null`/`0` → "" so an unset field shows blank.
 */
export function formatIndentValue(
  points: number | null | undefined,
  unit: IndentUnit,
  characterPt: number = DEFAULT_CHARACTER_UNIT_PT,
): string {
  if (points === null || points === undefined || !Number.isFinite(points)) {
    return "";
  }
  if (points === 0) return "";
  const value =
    unit === "cm"
      ? pointsToCm(points)
      : unit === "in"
        ? round2(points / POINTS_PER_INCH)
        : unit === "char"
          ? round2(points / (characterPt > 0 ? characterPt : DEFAULT_CHARACTER_UNIT_PT))
          : round2(points);
  // Strip a trailing ".0" / ".00" so "12" not "12.00", but keep "1.5".
  return String(value);
}

/** A paragraph's precise indents, all in points (null = unset). */
export interface PreciseIndents {
  /** Left indent (≥ 0) in points, or null. */
  left: number | null;
  /** Right indent (≥ 0) in points, or null. */
  right: number | null;
  /** First-line indent in points: positive = first-line, negative = hanging. */
  firstLine: number | null;
}

/** Read + normalize the precise indents off a block node's attrs. PURE. */
export function readPreciseIndents(attrs: {
  indentLeftPt?: unknown;
  indentRightPt?: unknown;
  firstLineIndentPt?: unknown;
}): PreciseIndents {
  return {
    left: normalizeIndentPt(attrs.indentLeftPt),
    right: normalizeIndentPt(attrs.indentRightPt),
    firstLine: normalizeFirstLineIndentPt(attrs.firstLineIndentPt),
  };
}

/** View-only geometry for a source list paragraph. Word's left indent is the
 * body-text position; the hanging value is the marker slot to its left. */
export interface NativeListIndent {
  leftPt: number;
  relativeLeftPt: number;
  hangingPt: number;
  /** The marker's box, to the tab after it. The hanging indent, or for a
   * paragraph that states no hanging (`w:firstLine="0"`, the marker on the
   * paragraph's own left edge, its lines under the marker), up to the next
   * default tab stop (corpus R280-D18's cell bullets). */
  markerSlotPt: number;
}

/** The marker of a list paragraph with no hanging indent ends about here. */
const NO_HANGING_MARKER_PT = 6;
/**
 * `nativeCellFlow`: the paragraph sits in a cell of a DOCX table whose own
 * `source.cellParagraphFlow` states that its cell paragraphs are the
 * package's own. Cell paragraphs carry no per-paragraph `source` (the table
 * owns that authority, as it does for every other cell typography rule), so
 * the table's statement stands in for the paragraph's here. A paragraph that
 * DOES carry a source must still be a docx one.
 */
export function readNativeListIndent(
  attrs: Record<string, unknown>,
  parentLeftPt = 0,
  nativeCellFlow = false,
  defaultTabStopPt = 36,
): NativeListIndent | null {
  const source = attrs.source;
  const sourceIsDocx =
    Boolean(source) &&
    typeof source === "object" &&
    !Array.isArray(source) &&
    (source as Record<string, unknown>).adapter === "docx";
  if (
    !(sourceIsDocx || (nativeCellFlow && source == null)) ||
    attrs.dir === "rtl" ||
    attrs.indentLeftPt == null
  )
    return null;
  const left = normalizeIndentPt(attrs.indentLeftPt);
  const rawLeft =
    typeof attrs.indentLeftPt === "number"
      ? attrs.indentLeftPt
      : Number.parseFloat(String(attrs.indentLeftPt));
  // A stated zero is the paragraph's word over the level's hanging.
  const first = attrs.firstLineIndentPt === 0 ? 0 : normalizeFirstLineIndentPt(attrs.firstLineIndentPt);
  if (
    (left === null && rawLeft !== 0) ||
    first === null ||
    first > 0 ||
    !Number.isFinite(parentLeftPt)
  )
    return null;
  const leftPt = left ?? 0;
  const tabPt = defaultTabStopPt > 0 ? defaultTabStopPt : 36;
  return {
    leftPt,
    relativeLeftPt: round2(leftPt - parentLeftPt),
    hangingPt: first < 0 ? -first : 0,
    markerSlotPt:
      first < 0 ? -first : round2((Math.floor((leftPt + NO_HANGING_MARKER_PT) / tabPt) + 1) * tabPt - leftPt),
  };
}

/** One indent stated in characters, with the points it drew when stated. */
export interface IndentCharacterUnit {
  readonly chars: number;
  readonly pt: number;
}

export type IndentCharacterSide = "left" | "right" | "hanging";

/**
 * Which of a paragraph's left, right and hanging indents were stated in
 * characters (Word's `w:leftChars` / `w:rightChars` / `w:hangingChars`). The
 * points stay the geometry every reader uses (`indentLeftPt`, ...); this
 * records the characters beside the points they came to, so the DOCX export
 * can write the character unit and the dialog can show it. A record whose
 * points no longer match the paragraph's (the ruler, Increase Indent or a
 * style moved it) is stale and reads as absent.
 */
export type IndentCharacterUnits = Partial<
  Record<IndentCharacterSide, IndentCharacterUnit>
>;

const MAX_INDENT_CHARS = 100;

export function normalizeIndentCharacterUnits(
  value: unknown,
): IndentCharacterUnits | null {
  let record: unknown = value;
  if (typeof value === "string") {
    try {
      record = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const out: { -readonly [K in IndentCharacterSide]?: IndentCharacterUnit } = {};
  for (const side of ["left", "right", "hanging"] as const) {
    const entry = (record as Record<string, unknown>)[side];
    if (!entry || typeof entry !== "object") continue;
    const chars = Number((entry as Record<string, unknown>).chars);
    const pt = normalizeIndentPt((entry as Record<string, unknown>).pt);
    if (!Number.isFinite(chars) || chars <= 0 || chars > MAX_INDENT_CHARS || pt === null) {
      continue;
    }
    out[side] = { chars: round2(chars), pt };
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** The characters `side` was stated in, when that statement still holds. */
export function indentCharacterCount(
  attrs: Record<string, unknown>,
  side: IndentCharacterSide,
): number | null {
  const units = normalizeIndentCharacterUnits(attrs.indentCharacterUnits);
  const entry = units?.[side];
  if (!entry) return null;
  const current =
    side === "left"
      ? normalizeIndentPt(attrs.indentLeftPt)
      : side === "right"
        ? normalizeIndentPt(attrs.indentRightPt)
        : (() => {
            const first = normalizeFirstLineIndentPt(attrs.firstLineIndentPt);
            return first !== null && first < 0 ? -first : null;
          })();
  return current !== null && Math.abs(current - entry.pt) < 0.01 ? entry.chars : null;
}
