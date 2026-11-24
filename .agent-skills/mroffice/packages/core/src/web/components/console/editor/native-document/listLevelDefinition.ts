/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word list DEFINITIONS: the nine-level numbering a Word list is built from.
 *
 * Word's "Define New Number Format", "Define New Multilevel List" and "Define
 * New List Style" dialogs all author the same thing: an `<w:abstractNum>` with
 * nine `<w:lvl>` entries (ECMA-376 Part 1 §17.9). Per level Word keeps
 *
 *   - Number style for this level      `<w:numFmt>` (decimal, a/b/c, i/ii, bullet …)
 *   - Enter formatting for number      `<w:lvlText>`; `%1`..`%9` are the counters
 *                                      of levels 1..9, each drawn in THAT level's
 *                                      number style ("%1.%2." reads "1.3.")
 *   - Start at                         `<w:start>` (default 1)
 *   - Restart list after               `<w:lvlRestart>` (absent: after any higher
 *                                      level; 0: never)
 *   - Number alignment                 `<w:lvlJc>` left / center / right, relative
 *                                      to "Aligned at"
 *   - Aligned at / Text indent at      `<w:pPr><w:ind w:left w:hanging>`:
 *                                      left = text indent, hanging = left - aligned at
 *   - Follow number with               `<w:suff>` tab (default) / space / nothing
 *   - Font… (list style formatting)    `<w:rPr>` of the level: bold, italic,
 *                                      colour, size, symbol font of a bullet
 *
 * This module is the single, PURE source of truth for that model: its
 * normalisation (fail closed: an invalid definition is no definition), the
 * counter arithmetic the editor paints markers with, and the presets the
 * dialogs start from. The editor, the DOCX exporter and the importer all read
 * it, so a marker means the same thing on screen, in word/numbering.xml and
 * after a re-import.
 */

import {
  formatListOrdinal,
  listStyleTypeForNumberingLevels,
  lvlJcForLevel,
  lvlTextForLevel,
  numFmtForLevel,
  type ListStyleType,
} from "./listNumbering";

/**
 * The `<w:numFmt>` values the editor authors and draws (ECMA-376 §17.18.59),
 * each drawn as Word 16 for Mac draws it (`formatListOrdinal`): every
 * ST_NumberFormat but `custom` (a `w:format` picture the editor has no
 * renderer for). The order is the "Number style for this level" list of the
 * definition dialogs.
 */
export const LIST_LEVEL_FORMATS = [
  "decimal",
  "decimalZero",
  "lowerLetter",
  "upperLetter",
  "lowerRoman",
  "upperRoman",
  "ordinal",
  "cardinalText",
  "ordinalText",
  "decimalEnclosedCircle",
  "decimalEnclosedParen",
  "decimalFullWidth",
  "chineseCounting",
  "chineseCountingThousand",
  "ideographTraditional",
  "ideographZodiac",
  "japaneseCounting",
  "japaneseLegal",
  "taiwaneseCounting",
  "taiwaneseCountingThousand",
  "taiwaneseDigital",
  "chineseLegalSimplified",
  "ideographLegalTraditional",
  "ideographDigital",
  "koreanCounting",
  "koreanDigital",
  "koreanDigital2",
  "koreanLegal",
  "decimalEnclosedFullstop",
  "decimalEnclosedCircleChinese",
  "ideographEnclosedCircle",
  "aiueo",
  "aiueoFullWidth",
  "iroha",
  "irohaFullWidth",
  "ganada",
  "chosung",
  "decimalHalfWidth",
  "numberInDash",
  "hex",
  "chicago",
  "japaneseDigitalTenThousand",
  "decimalFullWidth2",
  "ideographZodiacTraditional",
  "vietnameseCounting",
  "russianLower",
  "russianUpper",
  "hebrew1",
  "hebrew2",
  "arabicAlpha",
  "arabicAbjad",
  "hindiVowels",
  "hindiConsonants",
  "hindiNumbers",
  "hindiCounting",
  "thaiLetters",
  "thaiNumbers",
  "thaiCounting",
  "bahtText",
  "dollarText",
  "bullet",
  "none",
] as const;
export type ListLevelFormat = (typeof LIST_LEVEL_FORMATS)[number];

export const LIST_LEVEL_ALIGNMENTS = ["left", "center", "right"] as const;
export type ListLevelAlignment = (typeof LIST_LEVEL_ALIGNMENTS)[number];

export const LIST_LEVEL_SUFFIXES = ["tab", "space", "nothing"] as const;
export type ListLevelSuffix = (typeof LIST_LEVEL_SUFFIXES)[number];

/** Word defines exactly nine levels (ilvl 0..8). */
export const LIST_DEFINITION_LEVELS = 9;
/** Longest `w:lvlText` accepted (Word's own field is short; 64 is generous). */
export const MAX_LIST_LEVEL_TEXT = 64;
/** Largest start value a file may carry (ST_DecimalNumber, a 32-bit int);
 * Word's own dialog types up to 32767 but numbers from whatever the file says. */
export const MAX_LIST_LEVEL_START = 2147483647;
/** Positions are limited to a 22-inch page (Word's own maximum). */
export const MAX_LIST_POSITION_PT = 1584;

export type ListLevelFontSlots = Partial<Record<"ascii" | "hAnsi" | "eastAsia" | "cs", string>>;

const FONT_SLOT_NAMES = new Set(["ascii", "hAnsi", "eastAsia", "cs"]);

export interface ListLevelDefinition {
  format: ListLevelFormat;
  /** `w:lvlText`; for a bullet level the glyph itself. */
  text: string;
  start: number;
  /**
   * 0-based level this level restarts after: an item at this level or any
   * higher one resets it. Word's default is the immediately higher level
   * (L - 1). -1: never restart (`<w:lvlRestart w:val="0"/>`).
   */
  restartAfter: number;
  align: ListLevelAlignment;
  alignAtPt: number;
  indentPt: number;
  suffix: ListLevelSuffix;
  /** The marker's font (a bullet's symbol font), or null for the paragraph's. */
  font: string | null;
  /**
   * The marker's `w:rFonts` slot by slot as an imported package states them
   * (ECMA-376 §17.3.2.26), carried for the export; `font` is the Latin slot
   * the editor draws and edits. Absent unless the package says more than it.
   */
  fonts?: ListLevelFontSlots;
  bold: boolean | null;
  italic: boolean | null;
  /** `#rrggbb`, or null for the paragraph's colour. */
  color: string | null;
  sizePt: number | null;
  /**
   * Word's legal numbering (`<w:isLgl/>`, ECMA-376 §17.9.4): every counter
   * of this level's text is drawn as an Arabic number whatever its own level's
   * style ("Article I" above, "1.1" here). Absent when off, so a definition
   * without it keeps its exact stored shape.
   */
  legal?: true;
}

export interface ListDefinition {
  levels: ListLevelDefinition[];
}

const FORMAT_SET = new Set<string>(LIST_LEVEL_FORMATS);
const ALIGN_SET = new Set<string>(LIST_LEVEL_ALIGNMENTS);
const SUFFIX_SET = new Set<string>(LIST_LEVEL_SUFFIXES);
const CONTROL = /[\u0000-\u001f\u007f]/u;
const FONT_NAME = /^[^\u0000-\u001f\u007f;{}<>\\"]{1,64}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function roundPt(value: number): number {
  return Math.round(value * 100) / 100;
}

function position(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_LIST_POSITION_PT
    ? roundPt(value)
    : null;
}

/**
 * Validate a level's `w:lvlText`. A counter placeholder may only name this
 * level or a higher one (Word's "Include level number from" offers exactly
 * those), and a literal "%" that is not a placeholder is rejected rather than
 * guessed at.
 */
function levelText(value: unknown, level: number, format: ListLevelFormat) {
  if (typeof value !== "string" || CONTROL.test(value)) return null;
  if (value.length > MAX_LIST_LEVEL_TEXT) return null;
  if (format === "bullet") {
    const glyphs = Array.from(value);
    return glyphs.length >= 1 && glyphs.length <= 4 && !value.includes("%")
      ? value
      : null;
  }
  const withoutPlaceholders = value.replace(/%[1-9]/g, (token) =>
    Number(token.slice(1)) <= level + 1 ? "" : "%",
  );
  return withoutPlaceholders.includes("%") ? null : value;
}

/** Fail-closed normalisation of one level; null when any field is invalid. */
export function normalizeListLevel(
  value: unknown,
  level: number,
): ListLevelDefinition | null {
  if (!isRecord(value)) return null;
  const format = value.format;
  if (typeof format !== "string" || !FORMAT_SET.has(format)) return null;
  const text = levelText(value.text, level, format as ListLevelFormat);
  if (text === null) return null;
  // An absent start, restart, alignment or suffix is the level's default
  // (Word's own: 1, after the level above, left, a tab), which a numbered
  // heading's imported definition leaves out.
  const start = value.start ?? 1;
  if (
    typeof start !== "number" ||
    !Number.isInteger(start) ||
    start < 0 ||
    start > MAX_LIST_LEVEL_START
  )
    return null;
  // "Restart list after" names a HIGHER level (0..L-1), or -1 for never;
  // level 0 has no higher level, so only "never" is meaningful there.
  const restartAfter = value.restartAfter ?? defaultRestartAfter(level);
  if (
    typeof restartAfter !== "number" ||
    !Number.isInteger(restartAfter) ||
    restartAfter < -1 ||
    restartAfter > level - 1
  )
    return null;
  const align = value.align ?? "left";
  const suffix = value.suffix ?? "tab";
  if (typeof align !== "string" || !ALIGN_SET.has(align)) return null;
  if (typeof suffix !== "string" || !SUFFIX_SET.has(suffix)) return null;
  const alignAtPt = position(value.alignAtPt);
  const indentPt = position(value.indentPt);
  if (alignAtPt === null || indentPt === null) return null;
  const font = value.font ?? null;
  if (font !== null && (typeof font !== "string" || !FONT_NAME.test(font)))
    return null;
  const fonts = value.fonts ?? null;
  if (
    fonts !== null &&
    (typeof fonts !== "object" ||
      Array.isArray(fonts) ||
      Object.keys(fonts).length === 0 ||
      Object.entries(fonts as Record<string, unknown>).some(
        ([slot, name]) =>
          !FONT_SLOT_NAMES.has(slot) || typeof name !== "string" || !FONT_NAME.test(name),
      ))
  )
    return null;
  const bold = value.bold ?? null;
  const italic = value.italic ?? null;
  if (bold !== null && typeof bold !== "boolean") return null;
  if (italic !== null && typeof italic !== "boolean") return null;
  const color = value.color ?? null;
  if (color !== null && (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color)))
    return null;
  const sizePt = value.sizePt ?? null;
  if (
    sizePt !== null &&
    (typeof sizePt !== "number" ||
      !Number.isFinite(sizePt) ||
      sizePt < 1 ||
      sizePt > 1638)
  )
    return null;
  const legal = value.legal ?? false;
  if (typeof legal !== "boolean") return null;
  return {
    format: format as ListLevelFormat,
    text,
    start,
    restartAfter,
    align: align as ListLevelAlignment,
    alignAtPt,
    indentPt,
    suffix: suffix as ListLevelSuffix,
    font: font as string | null,
    ...(fonts !== null ? { fonts: { ...(fonts as ListLevelFontSlots) } } : {}),
    bold: bold as boolean | null,
    italic: italic as boolean | null,
    color: color === null ? null : (color as string).toLowerCase(),
    sizePt: sizePt === null ? null : roundPt(sizePt as number),
    ...(legal ? { legal: true as const } : {}),
  };
}

/**
 * Fail-closed normalisation of a whole definition: nine valid levels, or
 * null. A stored value is never partially trusted. A stored definition states
 * one to nine levels; the levels it leaves unstated are Word's default levels
 * (`wordDefaultListLevel`), which is how a DOCX import stores a definition
 * whose deeper levels are Word's own. The result always holds all nine.
 */
export function normalizeListDefinition(value: unknown): ListDefinition | null {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.levels)) return null;
  if (parsed.levels.length < 1 || parsed.levels.length > LIST_DEFINITION_LEVELS)
    return null;
  const levels: ListLevelDefinition[] = [];
  for (let level = 0; level < parsed.levels.length; level += 1) {
    const normalized = normalizeListLevel(parsed.levels[level], level);
    if (!normalized) return null;
    levels.push(normalized);
  }
  for (let level = levels.length; level < LIST_DEFINITION_LEVELS; level += 1)
    levels.push(wordDefaultListLevel(level));
  return { levels };
}

/**
 * Word's default numbering level (Home > Numbering: 1. / a) / i., repeated),
 * what a stored definition's unstated deeper levels are; the API's
 * `default_level` (numbering_definitions.py), kept in step.
 */
export function wordDefaultListLevel(level: number): ListLevelDefinition {
  return {
    ...baseLevel(level),
    format: numFmtForLevel("decimal", level) as ListLevelFormat,
    text: lvlTextForLevel("decimal", level),
    align: lvlJcForLevel("decimal", level),
  };
}

/** Word's default "restart after" for a level: the level immediately above. */
export function defaultRestartAfter(level: number): number {
  return level === 0 ? -1 : level - 1;
}

/**
 * The editor's own list geometry (what the DOCX exporter has always written:
 * `w:ind w:left = 720 + 360·L`, `w:hanging = 360`), so a preset definition
 * paints and exports exactly like the gallery list it came from.
 */
export function defaultLevelGeometry(level: number): {
  alignAtPt: number;
  indentPt: number;
} {
  return { alignAtPt: 18 + 18 * level, indentPt: 36 + 18 * level };
}

function baseLevel(level: number): Omit<ListLevelDefinition, "format" | "text"> {
  return {
    start: 1,
    restartAfter: defaultRestartAfter(level),
    align: "left",
    ...defaultLevelGeometry(level),
    suffix: "tab",
    font: null,
    bold: null,
    italic: null,
    color: null,
    sizePt: null,
  };
}

/** A gallery numbering style as a nine-level definition (dialog starting point). */
export function presetListDefinition(style: ListStyleType): ListDefinition {
  return {
    levels: Array.from({ length: LIST_DEFINITION_LEVELS }, (_, level) => ({
      ...baseLevel(level),
      format: numFmtForLevel(style, level) as ListLevelFormat,
      text: lvlTextForLevel(style, level),
      align: lvlJcForLevel(style, level),
    })),
  };
}

/** A bullet list's glyph as a nine-level definition (headings with bullets). */
export function bulletListDefinition(
  glyph: string,
  font: string | null = null,
  align: ListLevelAlignment = "left",
): ListDefinition {
  return {
    levels: Array.from({ length: LIST_DEFINITION_LEVELS }, (_, level) => ({
      ...baseLevel(level),
      format: "bullet" as const,
      text: glyph,
      font,
      align,
    })),
  };
}

/**
 * Word's Define New Number Format: the number "format" is literal text around
 * the styled number, which the dialog shows as a shaded field that cannot be
 * edited — so it is authored here as a prefix and a suffix around this level's
 * own counter. Returns null when the level text is not of that shape (a
 * multilevel "%1.%2." path), which the single-level dialog then cannot edit.
 */
export function splitLevelText(
  text: string,
  level: number,
): { prefix: string; suffix: string } | null {
  const token = `%${level + 1}`;
  const placeholders = text.match(/%[1-9]/g) ?? [];
  if (placeholders.length !== 1 || placeholders[0] !== token) return null;
  const index = text.indexOf(token);
  return { prefix: text.slice(0, index), suffix: text.slice(index + token.length) };
}

/**
 * The same split for a level of a MULTILEVEL list ("%1.%2."): the other
 * levels' counters stay where they are, shaded and uneditable as in Word's
 * "Enter formatting for number", and only the literal text touching this
 * level's own counter is authored. `before` runs up to the last other
 * counter ahead of this level's, `after` from the first one behind it.
 * Null when the level text does not carry its own counter exactly once --
 * the dialog then keeps that text as it is.
 */
export function splitMultilevelLevelText(
  text: string,
  level: number,
): { before: string; prefix: string; suffix: string; after: string } | null {
  const token = `%${level + 1}`;
  const placeholders = Array.from(text.matchAll(/%[1-9]/g));
  const own = placeholders.filter((match) => match[0] === token);
  if (own.length !== 1) return null;
  const at = own[0].index ?? 0;
  const ahead = placeholders.filter((match) => (match.index ?? 0) < at);
  const behind = placeholders.filter((match) => (match.index ?? 0) > at);
  const beforeEnd = ahead.length
    ? (ahead[ahead.length - 1].index ?? 0) + 2
    : 0;
  const afterStart = behind.length ? (behind[0].index ?? text.length) : text.length;
  return {
    before: text.slice(0, beforeEnd),
    prefix: text.slice(beforeEnd, at),
    suffix: text.slice(at + token.length, afterStart),
    after: text.slice(afterStart),
  };
}

/** Is literal number-format text safe to put around a counter? */
export function isListFormatLiteral(value: string): boolean {
  return (
    !CONTROL.test(value) && !value.includes("%") && value.length <= 24
  );
}

/**
 * Apply Define New Number Format to ONE level of a definition (Word changes
 * only the level the selection is at; the others keep their definition).
 */
export function withNumberFormat(
  definition: ListDefinition,
  level: number,
  change: {
    format: ListLevelFormat;
    prefix: string;
    suffix: string;
    align: ListLevelAlignment;
    /**
     * A multilevel level's other counters around the authored text, kept
     * verbatim ({@link splitMultilevelLevelText}); or `keepText` for a level
     * text the single-level form cannot express, which is left as it is.
     */
    before?: string;
    after?: string;
    keepText?: boolean;
  },
): ListDefinition | null {
  if (!isListFormatLiteral(change.prefix) || !isListFormatLiteral(change.suffix))
    return null;
  if (change.format === "bullet") return null;
  const levels = definition.levels.map((entry, index) =>
    index === level
      ? {
          ...entry,
          format: change.format,
          text: change.keepText
            ? entry.text
            : `${change.before ?? ""}${change.prefix}%${level + 1}${change.suffix}${change.after ?? ""}`,
          align: change.align,
        }
      : entry,
  );
  return normalizeListDefinition({ levels });
}

/** The closest gallery style, for readers that only know `listStyleType`. */
export function listStyleTypeForDefinition(
  definition: ListDefinition,
): ListStyleType {
  return listStyleTypeForNumberingLevels(
    definition.levels
      .filter((level) => level.format !== "none")
      .map((level) => ({ numFmt: level.format, lvlText: level.text })),
  );
}

/** Structural equality of two normalised definitions. */
export function listDefinitionsEqual(
  a: ListDefinition | null,
  b: ListDefinition | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Word's own counter walk for one numbering instance: an item at level L
 * advances L's counter (the first one reads the level's start) and resets every
 * deeper level whose "restart after" is at or below L. Levels above an item
 * that never had one of their own read their start value, as Word draws them.
 */
export class ListCounterState {
  private readonly counters: Array<number | undefined> = new Array(
    LIST_DEFINITION_LEVELS,
  ).fill(undefined);

  /** The level-0 ordinal the next level-0 item would read, if any item was seen. */
  nextTopOrdinal(definition: ListDefinition | null): number {
    return this.nextOrdinalAt(definition, 0);
  }

  /** The ordinal the next item at `level` would read. */
  nextOrdinalAt(definition: ListDefinition | null, level: number): number {
    const safe = Math.min(Math.max(Math.floor(level), 0), LIST_DEFINITION_LEVELS - 1);
    const current = this.counters[safe];
    return current === undefined
      ? (definition?.levels[safe].start ?? 1)
      : current + 1;
  }

  /** Seed the level-0 counter so the next level-0 item reads `ordinal`. */
  seedTop(ordinal: number): void {
    this.counters[0] = ordinal - 1;
    for (let level = 1; level < LIST_DEFINITION_LEVELS; level += 1)
      this.counters[level] = undefined;
  }

  /** Seed `level` so its next item reads `ordinal`; deeper levels restart. */
  seedLevel(level: number, ordinal: number): void {
    const safe = Math.min(Math.max(Math.floor(level), 0), LIST_DEFINITION_LEVELS - 1);
    this.counters[safe] = ordinal - 1;
    for (let deeper = safe + 1; deeper < LIST_DEFINITION_LEVELS; deeper += 1)
      this.counters[deeper] = undefined;
  }

  /**
   * Count one item at `level`; returns the counter values of levels 0..level
   * as Word substitutes them into `%1`..`%{level+1}`.
   */
  advance(definition: ListDefinition | null, level: number): number[] {
    const safe = Math.min(Math.max(Math.floor(level), 0), LIST_DEFINITION_LEVELS - 1);
    const startOf = (index: number) => definition?.levels[index].start ?? 1;
    const current = this.counters[safe];
    this.counters[safe] = current === undefined ? startOf(safe) : current + 1;
    for (let deeper = safe + 1; deeper < LIST_DEFINITION_LEVELS; deeper += 1) {
      const restartAfter =
        definition?.levels[deeper].restartAfter ?? defaultRestartAfter(deeper);
      if (restartAfter >= 0 && safe <= restartAfter)
        this.counters[deeper] = undefined;
    }
    return Array.from(
      { length: safe + 1 },
      (_, index) => this.counters[index] ?? startOf(index),
    );
  }
}

/** The text Word draws for an item at `level` whose counters are `values`. */
export function listMarkerText(
  definition: ListDefinition,
  level: number,
  values: readonly number[],
): string {
  const entry = definition.levels[level];
  if (!entry) return "";
  if (entry.format === "bullet") return entry.text;
  return entry.text.replace(/%([1-9])/g, (_, digit: string) => {
    const index = Number(digit) - 1;
    const source = definition.levels[index];
    if (!source || index >= values.length) return "";
    // A bullet level referenced from a deeper level has no number to show:
    // Word draws "%1.%2)" under a bullet level as ".1)" (Word 16 for Mac).
    if (source.format === "bullet") return "";
    // Legal numbering draws every counter of this level in Arabic numerals,
    // "Article I" above becoming "1.1" here (§17.9.4); "none" stays empty.
    // Word keeps a decimalZero counter's leading zero, its own or a level
    // above ("Section 1.01", "01.1"): it is already Arabic.
    const format =
      entry.legal && source.format !== "none" && source.format !== "decimalZero"
        ? "decimal"
        : source.format;
    return formatListOrdinal(format, values[index]);
  });
}

// ---------------------------------------------------------------------------
// Document list styles (Word "Define New List Style"): named definitions kept
// in the document (`doc.attrs.listStyles`), exported as numbering styles.
// ---------------------------------------------------------------------------

export interface DocumentListStyle {
  id: string;
  name: string;
  definition: ListDefinition;
}

export const MAX_DOCUMENT_LIST_STYLES = 50;
const LIST_STYLE_ID = /^[A-Za-z0-9_-]{1,40}$/;

/** Fail closed per entry: an invalid style is dropped, never repaired. */
export function normalizeDocumentListStyles(value: unknown): DocumentListStyle[] {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const out: DocumentListStyle[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const entry of parsed) {
    if (!isRecord(entry)) continue;
    const id = entry.id;
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    if (typeof id !== "string" || !LIST_STYLE_ID.test(id) || ids.has(id)) continue;
    if (!name || name.length > 80 || CONTROL.test(name) || names.has(name)) continue;
    const definition = normalizeListDefinition(entry.definition);
    if (!definition) continue;
    ids.add(id);
    names.add(name);
    out.push({ id, name, definition });
    if (out.length >= MAX_DOCUMENT_LIST_STYLES) break;
  }
  return out;
}
