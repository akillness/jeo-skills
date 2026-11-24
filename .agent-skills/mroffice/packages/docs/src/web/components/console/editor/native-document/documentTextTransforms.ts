/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Editor } from "@tiptap/core";
import type { Mark, Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  NodeSelection,
  Selection,
  TextSelection,
  type Transaction,
} from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import { DEFAULT_DOCUMENT_TEXT_BOX_OUTLINE } from "@mrnote/core/web/lib/document-borders.ts";
import {
  logicalTableFragmentsAt,
  logicalTableRowIndexes,
  type TableFragment,
} from "@mrnote/core/web/components/console/editor/native-document/paged/tableFragmentGroups.ts";
import { textblockDisplayText } from "@mrnote/core/web/components/console/editor/native-document/inlineAtomText.ts";
import {
  mergeTableContinuationsJson,
  TABLE_REPEATED_HEADER_ATTR,
  TABLE_ROW_CONTINUATION_ATTR,
} from "@mrnote/core/web/components/console/editor/native-document/paged/tablePagination.ts";
import { TABLE_NUMBER_CURRENCY_PREFIX_SOURCE } from "./tableCellFormula";
import {
  commitCrossSheetEdit,
  joinSelectionSheets,
} from "@mrnote/core/web/components/console/editor/native-document/paged/crossSheetEditing.ts";
import { officeSentenceCase } from "@mrnote/core/web/lib/office-text-case.ts";
import {
  isLegacySymbolFont,
  normalizeSymbolCharAttrs,
  SYMBOL_CHAR_MARK,
  symbolCharCodeFromCodePoint,
  symbolCharText,
} from "@mrnote/core/web/lib/office-symbols.ts";

/**
 * Occasional document text transforms for the native document editor —
 * Word/WPS parity for text and "Tools/Review" gestures whose logic is worth
 * unit-testing in isolation:
 *
 *   1. CHANGE CASE   (Word "Aa" + Shift+F3): UPPERCASE / lowercase / Title Case /
 *      Sentence case / tOGGLE over the selection.
 *   2. WIDTH         (Word "Aa"): convert ASCII/full-width forms and spaces
 *      between half-width and full-width characters.
 *   3. SORT          (Word "Sort"): sort a table by a column, or sort the
 *      selected sibling paragraphs / list items alphabetically or numerically.
 *
 * Everything in the FIRST half of this module is PURE (string → string, array →
 * array) so it can be tested with no editor/ProseMirror dependency. The SECOND
 * half is the thin TipTap wiring that applies those pure functions to the
 * editor's selection in a single transaction, mirroring the marks-preserving,
 * code-safe span approach already used by `simplifiedTraditional.ts`.
 *
 * CODE SAFETY: text transforms deliberately SKIP text inside a code block
 * (`spec.code` node) and text carrying the inline `code` mark, so changing the
 * case/width of prose never mangles a code identifier (`getUserById` must not
 * become `GETUSERBYID`). The colocated test pins this.
 *
 * SERIALIZATION: no transform adds any node/mark/attribute or doc schema — they
 * only rewrite the characters of existing text leaves (case/width) or reorder
 * existing sibling nodes (sort). A document that never invokes them serializes
 * byte-for-byte unchanged, and the results round-trip through HTML/DOCX export
 * exactly like any other text / block reorder.
 */

// ===========================================================================
// 1. CHANGE CASE — pure transforms
// ===========================================================================

export type ChangeCaseMode =
  "upper" | "lower" | "title" | "sentence" | "toggle";

/** Ordered list of the five modes (stable for menus and tests). */
export const CHANGE_CASE_MODES: readonly ChangeCaseMode[] = [
  "sentence",
  "upper",
  "lower",
  "title",
  "toggle",
];

/**
 * The Shift+F3 cycle, matching Word's three-state rotation: Sentence case →
 * UPPERCASE → lowercase → (back to Sentence case). Title Case and tOGGLE are
 * reachable from the menu but are NOT part of the keyboard cycle (Word doesn't
 * cycle through them either). PURE.
 */
const SHIFT_F3_CYCLE: readonly ChangeCaseMode[] = [
  "sentence",
  "upper",
  "lower",
];

/**
 * Given the text currently in the selection, decide which case mode the next
 * Shift+F3 press should apply. We look at what the text already looks like and
 * advance to the next state in the cycle, so repeated presses rotate
 * Sentence → UPPER → lower → Sentence the way Word does. When the text matches
 * none of the cycle's outputs (e.g. mixed/Title case), we start the cycle at
 * UPPERCASE — the same first transition Word makes from arbitrary text. PURE.
 */
export function nextCaseModeForShiftF3(text: string): ChangeCaseMode {
  // Find which cycle state the current text already equals, then advance.
  for (let i = 0; i < SHIFT_F3_CYCLE.length; i += 1) {
    const mode = SHIFT_F3_CYCLE[i];
    if (transformCase(text, mode) !== text) continue;
    // Advance to the next state that actually changes the text. For a single
    // letter Sentence case and UPPERCASE are the same string ("A"), so the
    
    for (let step = 1; step < SHIFT_F3_CYCLE.length; step += 1) {
      const next = SHIFT_F3_CYCLE[(i + step) % SHIFT_F3_CYCLE.length];
      if (transformCase(text, next) !== text) return next;
    }
    return SHIFT_F3_CYCLE[(i + 1) % SHIFT_F3_CYCLE.length];
  }
  return "upper";
}

/**
 * Title Case: upper-case the first letter of every "word" (a maximal run of
 * letters/digits/apostrophes) and lower-case the rest of the word. Uses Unicode
 * letter classes so non-ASCII letters (accented Latin, Greek, Cyrillic, …)
 * capitalize correctly; CJK has no case and is left unchanged by the underlying
 * `toUpperCase`/`toLowerCase`. PURE.
 */
function toTitleCase(text: string): string {
  // A word = a run of letters/marks/numbers plus INTRA-word apostrophes
  // (don't, O'Neil). An apostrophe before the first letter is a quotation
  
  // The apostrophe is also the typographic one AutoFormat types (U+2019) and
  // the modifier letter (U+02BC): don’t was two words, Don’T (OFL-010).
  return text.replace(/[\p{L}\p{M}\p{N}]+(?:['\u2019\u02BC][\p{L}\p{M}\p{N}]+)*/gu, (word) => {
    // The first CODE POINT, not the first UTF-16 unit: a supplementary-plane
    // letter (Deseret 𐐨) is a surrogate pair, and either half alone has no
    
    const head = String.fromCodePoint(word.codePointAt(0) ?? 0);
    // The rest is lower-cased as part of the WHOLE word, not on its own:
    // Greek final sigma depends on the letter before it, so ΟΣ lower-cased
    
    const lower = word.toLowerCase();
    return head.toUpperCase() + lower.slice(head.toLowerCase().length);
  });
}

/**
 * Sentence case: lower-case everything, then upper-case the first letter of
 * each sentence. A "sentence start" is the first letter of the string or the
 * first letter following sentence-ending punctuation (`.`, `!`, `?`, and their
 * full-width CJK forms 。！？) plus any whitespace/closing quotes. PURE.
 */
function toSentenceCase(text: string): string {
  return officeSentenceCase(text);
}

/** tOGGLE case: invert the case of every cased character. PURE. */
function toToggleCase(text: string): string {
  let out = "";
  for (const ch of text) {
    const upper = ch.toUpperCase();
    const lower = ch.toLowerCase();
    if (ch === upper && ch !== lower) {
      // Currently upper → make lower.
      out += lower;
    } else if (ch === lower && ch !== upper) {
      // Currently lower → make upper.
      out += upper;
    } else {
      // Caseless (digits, punctuation, CJK): unchanged.
      out += ch;
    }
  }
  return out;
}

/**
 * Apply a {@link ChangeCaseMode} to a plain string. PURE and the single source
 * of truth for the case logic — both the unit tests and the editor-applying
 * function below route through it.
 */
export function transformCase(text: string, mode: ChangeCaseMode): string {
  switch (mode) {
    case "upper":
      return text.toUpperCase();
    case "lower":
      return text.toLowerCase();
    case "title":
      return toTitleCase(text);
    case "sentence":
      return toSentenceCase(text);
    case "toggle":
      return toToggleCase(text);
    default:
      return text;
  }
}

// ===========================================================================
// 2. CHARACTER WIDTH — pure transforms
// ===========================================================================

export type CharacterWidthMode = "halfWidth" | "fullWidth";

/** Stable menu order matching Word's Aa menu. */
export const CHARACTER_WIDTH_MODES: readonly CharacterWidthMode[] = [
  "halfWidth",
  "fullWidth",
];

// Unicode full-width ASCII forms occupy U+FF01..U+FF5E and map to printable
// ASCII U+0021..U+007E by one fixed offset. U+3000 IDEOGRAPHIC SPACE is the
// corresponding full-width space and is the sole exception to that range.
const FULL_WIDTH_ASCII_START = 0xff01;
const FULL_WIDTH_ASCII_END = 0xff5e;
const PRINTABLE_ASCII_START = 0x21;
const WIDTH_OFFSET = FULL_WIDTH_ASCII_START - PRINTABLE_ASCII_START;
const IDEOGRAPHIC_SPACE = "\u3000";

/** Convert full-width ASCII forms and the ideographic space to half-width. */
function toHalfWidth(text: string): string {
  let out = "";
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      codePoint >= FULL_WIDTH_ASCII_START &&
      codePoint <= FULL_WIDTH_ASCII_END
    ) {
      out += String.fromCodePoint(codePoint - WIDTH_OFFSET);
    } else if (character === IDEOGRAPHIC_SPACE) {
      out += " ";
    } else {
      out += character;
    }
  }
  return out;
}

/** Convert printable ASCII and regular spaces to their full-width forms. */
function toFullWidth(text: string): string {
  let out = "";
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      codePoint >= PRINTABLE_ASCII_START &&
      codePoint <=
        PRINTABLE_ASCII_START + (FULL_WIDTH_ASCII_END - FULL_WIDTH_ASCII_START)
    ) {
      out += String.fromCodePoint(codePoint + WIDTH_OFFSET);
    } else if (character === " ") {
      out += IDEOGRAPHIC_SPACE;
    } else {
      out += character;
    }
  }
  return out;
}

/**
 * Apply a Word-style half-width/full-width transform to a plain string. PURE.
 * CJK ideographs, kana, emoji, line breaks, and every other character outside
 * the explicit Unicode width forms are intentionally left untouched.
 */
export function transformCharacterWidth(
  text: string,
  mode: CharacterWidthMode,
): string {
  return mode === "halfWidth" ? toHalfWidth(text) : toFullWidth(text);
}

// ===========================================================================
// 3. SORT — pure comparators + reordering
// ===========================================================================

export type SortDirection = "asc" | "desc";
export type SortValueType = "text" | "number" | "date";

export interface SortOptions {
  direction?: SortDirection;
  /**
   * When true, compare values as numbers (parsing a leading number out of each
   * key); non-numeric keys sort after numeric ones. When false (default),
   * compare as case-insensitive locale strings.
   */
  numeric?: boolean;
  /** Explicit Word sort type. `numeric` remains as a compatibility alias. */
  sortType?: SortValueType;
  /** When true (default false), the string compare is case-sensitive. */
  caseSensitive?: boolean;
  /** Locale used only to resolve otherwise-ambiguous day/month date forms. */
  locale?: string;
}

/** Table-only sort choices layered over the shared text/number comparator. */
export interface TableSortOptions extends SortOptions {
  /**
   * Whether row zero is a header and must remain pinned. Omit to infer from an
   * all-`tableHeader` first row, preserving every existing quick-sort caller.
   */
  hasHeader?: boolean;
}

export interface TableSortCriterion {
  readonly columnIndex: number;
  readonly direction: SortDirection;
  readonly sortType: SortValueType;
}

export interface TableSortCriteriaOptions {
  readonly hasHeader?: boolean;
  /**
   * How many leading rows stay pinned when `hasHeader` is on (a table may have
   * a band of several repeated header rows). Defaults to 1.
   */
  readonly headerRowCount?: number;
  readonly caseSensitive?: boolean;
  readonly locale?: string;
}













export function parseSortNumber(key: string): number | null {
  const trimmed = key.trim();
  if (trimmed === "") return null;
  const match = SORT_NUMBER_RE.exec(trimmed);
  if (!match) return null;
  // ONE optional sign, on either side of the currency symbol: "--5" or "-$-5"
  
  if (match[1] && match[3]) return null;
  const sign = match[1] === "-" || match[3] === "-" ? -1 : 1;
  const magnitude = Number.parseFloat(match[4].replace(/,/g, ""));
  if (!Number.isFinite(magnitude)) return null;
  return sign * magnitude * (match[5] ? 0.01 : 1);
}

const SORT_NUMBER_RE = new RegExp(
  `^([+-]?)(${TABLE_NUMBER_CURRENCY_PREFIX_SOURCE})?\\s?([+-]?)((?:\\d[\\d,]*(?:\\.\\d+)?|\\.\\d+)(?:[eE][+-]?\\d+)?)(%?)`,
  "u",
);

function validUtcDate(year: number, month: number, day: number): number | null {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 100 ||
    year > 9999 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  const timestamp = Date.UTC(year, month - 1, day);
  const value = new Date(timestamp);
  return value.getUTCFullYear() === year &&
    value.getUTCMonth() === month - 1 &&
    value.getUTCDate() === day
    ? timestamp
    : null;
}

/**
 * Parse the bounded date forms surfaced by the Docs sort dialog. The parser is
 * deliberately strict: ISO/year-first, Chinese year-month-day and numeric
 * locale dates are accepted; an invalid or ambiguous unsupported value stays
 * identifiable and sorts after valid dates instead of being guessed by the JS
 * engine.
 */
export function parseSortDate(key: string, locale = "en"): number | null {
  const normalized = key.trim().normalize("NFKC");
  if (normalized === "") return null;

  const yearFirst = normalized.match(
    /^(\d{4})(?:年|[-/.])(\d{1,2})(?:月|[-/.])(\d{1,2})(?:日)?$/,
  );
  if (yearFirst) {
    return validUtcDate(
      Number(yearFirst[1]),
      Number(yearFirst[2]),
      Number(yearFirst[3]),
    );
  }

  const localNumeric = normalized.match(
    /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/,
  );
  if (!localNumeric) return null;
  const first = Number(localNumeric[1]);
  const second = Number(localNumeric[2]);
  const year = Number(localNumeric[3]);
  const normalizedLocale = locale.trim().toLowerCase();
  const monthFirst =
    second > 12 ||
    (first <= 12 &&
      second <= 12 &&
      (normalizedLocale === "en" || normalizedLocale.startsWith("en-us")));
  const month = monthFirst ? first : second;
  const day = monthFirst ? second : first;
  return validUtcDate(year, month, day);
}

/**
 * Three-way comparator for two sort keys honoring {@link SortOptions}. Ascending
 * by default; `desc` negates. Numeric mode orders by parsed number with
 * non-numeric keys last; string mode uses a case-insensitive (unless
 * `caseSensitive`) locale compare. PURE and total (stable callers should keep
 * original index as a tiebreak — see {@link sortKeyedItems}).
 */
export function compareSortKeys(
  a: string,
  b: string,
  options: SortOptions = {},
): number {
  const {
    direction = "asc",
    numeric = false,
    sortType = numeric ? "number" : "text",
    caseSensitive = false,
    locale = "en",
  } = options;
  const sign = direction === "desc" ? -1 : 1;

  if (sortType === "number") {
    const na = parseSortNumber(a);
    const nb = parseSortNumber(b);
    if (na === null && nb === null) {
      // Neither is numeric → fall back to a string compare so the order is at
      // least deterministic instead of arbitrary.
      return sign * stringCompare(a, b, caseSensitive);
    }
    // A non-numeric key always sorts AFTER a numeric one (regardless of
    // direction), matching Word's "numbers first" behavior.
    if (na === null) return 1;
    if (nb === null) return -1;
    if (na === nb) return 0;
    return sign * (na < nb ? -1 : 1);
  }

  if (sortType === "date") {
    const da = parseSortDate(a, locale);
    const db = parseSortDate(b, locale);
    if (da === null && db === null) {
      return sign * stringCompare(a, b, caseSensitive);
    }
    if (da === null) return 1;
    if (db === null) return -1;
    if (da === db) return 0;
    return sign * (da < db ? -1 : 1);
  }

  return sign * stringCompare(a, b, caseSensitive);
}

function stringCompare(a: string, b: string, caseSensitive: boolean): number {
  if (caseSensitive) {
    return a.localeCompare(b);
  }
  // `sensitivity: "base"` folds case AND accents; we want case-insensitive but
  // accent-aware, so use "accent".
  return a.localeCompare(b, undefined, { sensitivity: "accent" });
}

export interface KeyedItem<T> {
  key: string;
  value: T;
}

/**
 * Stable sort of items by their string `key` under {@link SortOptions}. Returns
 * a NEW array (never mutates the input) of the original `value`s in sorted
 * order. Stability is guaranteed by carrying the original index as a tiebreak,
 * so equal keys keep their relative order — important when sorting rows/blocks
 * so a re-sort by a column with ties doesn't shuffle equal rows. PURE.
 */
export function sortKeyedItems<T>(
  items: readonly KeyedItem<T>[],
  options: SortOptions = {},
): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const cmp = compareSortKeys(a.item.key, b.item.key, options);
      return cmp !== 0 ? cmp : a.index - b.index;
    })
    .map((entry) => entry.item.value);
}

/**
 * Plan a TABLE sort: given the table laid out as rows of cell-text (row 0 may be
 * a header), return the order in which the DATA rows should be arranged. The
 * returned array is a permutation of the data-row indices (header excluded) in
 * the new order, expressed as indices into `rows` (so they are offset by 1 when
 * `hasHeader`). PURE — the caller does the actual node reorder.
 *
 * `columnIndex` selects which cell of each row supplies the sort key; a row with
 * fewer cells contributes an empty key for that column (sorts as blank).
 */
export function planTableRowSort(
  rows: readonly (readonly string[])[],
  columnIndex: number,
  options: SortOptions & { hasHeader?: boolean } = {},
): number[] {
  const { hasHeader = false, ...sortOptions } = options;
  return planTableRowSortByCriteria(
    rows,
    [
      {
        columnIndex,
        direction: sortOptions.direction ?? "asc",
        sortType:
          sortOptions.sortType ?? (sortOptions.numeric ? "number" : "text"),
      },
    ],
    {
      hasHeader,
      caseSensitive: sortOptions.caseSensitive,
      locale: sortOptions.locale,
    },
  );
}

/**
 * Plan a stable Word-style table sort with one primary criterion and up to two
 * Then-by criteria. Each criterion is applied only when all earlier criteria
 * compare equal. Row zero remains pinned when the dialog says the table has a
 * header.
 */
export function planTableRowSortByCriteria(
  rows: readonly (readonly string[])[],
  criteria: readonly TableSortCriterion[],
  options: TableSortCriteriaOptions = {},
): number[] {
  const boundedCriteria = criteria
    .filter(
      (criterion) =>
        Number.isInteger(criterion.columnIndex) && criterion.columnIndex >= 0,
    )
    .slice(0, 3);
  const startRow = options.hasHeader
    ? Math.max(1, Math.floor(options.headerRowCount ?? 1))
    : 0;
  const rowIndices = Array.from(
    { length: Math.max(0, rows.length - startRow) },
    (_, index) => startRow + index,
  );
  if (boundedCriteria.length === 0) return rowIndices;

  return rowIndices
    .map((rowIndex, originalIndex) => ({ rowIndex, originalIndex }))
    .sort((left, right) => {
      for (const criterion of boundedCriteria) {
        const compared = compareSortKeys(
          rows[left.rowIndex]?.[criterion.columnIndex] ?? "",
          rows[right.rowIndex]?.[criterion.columnIndex] ?? "",
          {
            direction: criterion.direction,
            sortType: criterion.sortType,
            caseSensitive: options.caseSensitive,
            locale: options.locale,
          },
        );
        if (compared !== 0) return compared;
      }
      return left.originalIndex - right.originalIndex;
    })
    .map(({ rowIndex }) => rowIndex);
}

// ===========================================================================
// 3. TEXT BOX — pure node factory
// ===========================================================================

/**
 * Build the ProseMirror-JSON for a fresh, empty floating text box (the existing
 * `textBox` block node — see contentControlExtension.tsx). A text box holds
 * whole blocks; a new one starts with a single empty paragraph the user types
 * into. Optionally seed the paragraph with `text`. PURE (returns JSON; the
 * caller inserts it). Kept here so the shape has ONE definition shared by the
 * toolbar insert command and its test.
 */
export function createTextBoxContent(text?: string): {
  type: string;
  attrs: { textBoxOutline: typeof DEFAULT_DOCUMENT_TEXT_BOX_OUTLINE };
  content: { type: string; content?: { type: string; text: string }[] }[];
} {
  const paragraph =
    text && text.length > 0
      ? { type: "paragraph", content: [{ type: "text", text }] }
      : { type: "paragraph" };
  return {
    type: "textBox",
    attrs: { textBoxOutline: DEFAULT_DOCUMENT_TEXT_BOX_OUTLINE },
    content: [paragraph],
  };
}

// ===========================================================================
// EDITOR WIRING — apply the pure functions to the live selection
// ===========================================================================

interface TextNodeSpan {
  from: number;
  to: number;
  text: string;
  marks: readonly Mark[];
}

/** True when a mark carries the inline `code` mark (so we skip it). */
function hasInlineCodeMark(marks: readonly Mark[]): boolean {
  return marks.some((mark) => mark.type.name === "code");
}

/**
 * Collect the TEXT-TRANSFORM-ELIGIBLE leaves inside [from, to). A leaf is skipped
 * when it lives inside a code block (`spec.code` node) or carries the inline
 * `code` mark, so a text transform never rewrites code. Slices are clamped to
 * the requested range so a partially-selected text node only contributes its
 * selected portion. Positions are absolute. Mirrors
 * simplifiedTraditional.collectTextSpans but with the code guard.
 */
function collectTransformableSpans(
  doc: ProseMirrorNode,
  from: number,
  to: number,
): TextNodeSpan[] {
  const spans: TextNodeSpan[] = [];
  doc.nodesBetween(from, to, (node, pos, parent) => {
    // Don't descend into code blocks (their text is code, not prose).
    if (node.type.spec.code) return false;
    if (
      !node.isText ||
      typeof node.text !== "string" ||
      node.text.length === 0
    ) {
      return true;
    }
    if (parent?.type.spec.code) return false;
    if (hasInlineCodeMark(node.marks)) return false;
    const nodeFrom = Math.max(pos, from);
    const nodeTo = Math.min(pos + node.nodeSize, to);
    if (nodeTo <= nodeFrom) return false;
    const sliceStart = nodeFrom - pos;
    const sliceEnd = nodeTo - pos;
    spans.push({
      from: nodeFrom,
      to: nodeTo,
      text: node.text.slice(sliceStart, sliceEnd),
      marks: node.marks,
    });
    return false;
  });
  return spans;
}

/**
 * Transform one run of adjacent spans (adjacent text nodes of one text block)
 * as ONE string, so a run boundary is never a word or sentence boundary: "foo"
 * + bold "bar" is the word "foobar", and Capitalize Each Word gives "Foobar"
 * with "bar" still bold (Word). Each span's replacement is cut out of the
 * transform of the joined text by transforming the joined text up to the
 * span's start and end, which keeps a length-changing map (ß -> SS) aligned.
 * The case and width maps read left to right, so the transform of a prefix
 * is a prefix of the transform of the whole; if that ever does not hold, the
 * run falls back to transforming each span alone.
 */










function cutByCharacterLengths(
  spans: readonly TextNodeSpan[],
  whole: string,
  transform: (text: string) => string,
): string[] | null {
  const lengths = spans.map((span) =>
    Array.from(span.text).reduce((total, char) => total + transform(char).length, 0),
  );
  if (lengths.reduce((total, length) => total + length, 0) !== whole.length) return null;
  const out: string[] = [];
  let cursor = 0;
  for (const length of lengths) {
    out.push(whole.slice(cursor, cursor + length));
    cursor += length;
  }
  return out;
}

function transformSpanRun(
  spans: readonly TextNodeSpan[],
  transform: (text: string) => string,
): string[] {
  if (spans.length === 1) return [transform(spans[0].text)];
  const joined = spans.map((span) => span.text).join("");
  const whole = transform(joined);
  const out: string[] = [];
  let offset = 0;
  let producedTo = 0;
  for (const span of spans) {
    const end = offset + span.text.length;
    const upToEnd = transform(joined.slice(0, end));
    if (!whole.startsWith(upToEnd) || upToEnd.length < producedTo) {
      return cutByCharacterLengths(spans, whole, transform) ?? spans.map((item) => transform(item.text));
    }
    out.push(upToEnd.slice(producedTo));
    producedTo = upToEnd.length;
    offset = end;
  }
  return out;
}










function transformedSpanMarks(span: TextNodeSpan, next: string): Mark[] | null {
  const symbol = span.marks.find((mark) => mark.type.name === SYMBOL_CHAR_MARK);
  if (!symbol) return span.marks as Mark[];
  const attrs = normalizeSymbolCharAttrs(symbol.attrs);
  if (!attrs || isLegacySymbolFont(attrs.font)) return null;
  const previous = Array.from(span.text);
  const glyph = symbolCharText(attrs.charCode);
  if (previous.some((character) => character !== glyph)) return null;
  const characters = Array.from(next);
  if (characters.length !== previous.length) return null;
  const nextGlyph = characters[0];
  if (characters.some((character) => character !== nextGlyph)) return null;
  const charCode = symbolCharCodeFromCodePoint(nextGlyph.codePointAt(0) ?? -1);
  if (charCode === null) return null;
  return span.marks.map((mark) =>
    mark === symbol ? mark.type.create({ ...mark.attrs, charCode }) : mark,
  );
}

/**
 * Apply a text transform to the editor's current selection in ONE transaction,
 * preserving marks and skipping code (see {@link collectTransformableSpans}).
 *
 * Adjacent spans (a word split by a format change) are transformed together
 * ({@link transformSpanRun}); spans separated by a block boundary or a skipped
 * code run are separate texts, as a new paragraph starts a new sentence. Each
 * replacement carries its own span's marks. Spans are replaced back-to-front
 * so a length change never invalidates an earlier span's position. Returns
 * true iff something actually changed.
 */
function applyTextTransformToSelection(
  editor: Editor,
  transform: (text: string) => string,
): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const { state } = editor;
  const { selection, doc, schema } = state;
  if (selection.empty) return false;

  // Every range of the selection: a table selection is one range per cell,
  
  // whole table changed the last cell only).
  const spans = selection.ranges
    .flatMap((range) => collectTransformableSpans(doc, range.$from.pos, range.$to.pos))
    .sort((left, right) => left.from - right.from);
  if (spans.length === 0) return false;

  const replacements: string[] = [];
  let runStart = 0;
  for (let index = 1; index <= spans.length; index += 1) {
    if (index === spans.length || spans[index].from !== spans[index - 1].to) {
      replacements.push(...transformSpanRun(spans.slice(runStart, index), transform));
      runStart = index;
    }
  }

  let transaction = state.tr;
  let changed = false;

  for (let index = spans.length - 1; index >= 0; index -= 1) {
    const span = spans[index];
    const next = replacements[index];
    if (next === span.text) continue;
    const marks = transformedSpanMarks(span, next);
    // A symbol whose glyph lives in its font's own encoding is not a letter
    
    if (marks === null) continue;
    const replacement =
      next.length > 0 ? schema.text(next, marks) : null;
    transaction = replacement
      ? transaction.replaceWith(span.from, span.to, replacement)
      : transaction.delete(span.from, span.to);
    changed = true;
  }

  if (!changed) return false;
  editor.view.dispatch(transaction.scrollIntoView());
  return true;
}

/**
 * Apply a case transform to the editor's current selection in one transaction.
 * See {@link applyTextTransformToSelection} for mark and code-safety behavior.
 */
export function applyCaseTransformToSelection(
  editor: Editor,
  mode: ChangeCaseMode,
): boolean {
  return applyTextTransformToSelection(editor, (text) =>
    transformCase(text, mode),
  );
}

/**
 * Apply a half-width/full-width transform to the current selection in one
 * transaction, preserving inline marks and leaving inline/code-block text
 * untouched just like the neighboring case commands.
 */
export function applyCharacterWidthTransformToSelection(
  editor: Editor,
  mode: CharacterWidthMode,
): boolean {
  return applyTextTransformToSelection(editor, (text) =>
    transformCharacterWidth(text, mode),
  );
}

// ---------------------------------------------------------------------------
// SORT wiring
// ---------------------------------------------------------------------------

/** A located table row with its absolute position + the node. */
interface LocatedRow {
  node: ProseMirrorNode;
  cells: string[];
}

/**
 * Find the innermost `table` node that contains the selection, or null when the
 * selection is not inside a table. Returns the table node + its absolute start
 * position.
 */
function findEnclosingTable(
  doc: ProseMirrorNode,
  pos: number,
): { node: ProseMirrorNode; pos: number } | null {
  const resolved = doc.resolve(Math.min(Math.max(pos, 0), doc.content.size));
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    const ancestor = resolved.node(depth);
    if (ancestor.type.name === "table") {
      return { node: ancestor, pos: resolved.before(depth) };
    }
  }
  return null;
}

/** Read a table node into its rows (each row = array of cell textContent). */
function readTableRows(table: ProseMirrorNode): LocatedRow[] {
  const rows: LocatedRow[] = [];
  table.forEach((row) => {
    if (row.type.name !== "tableRow") return;
    const cells: string[] = [];
    row.forEach((cell) => {
      // A cell's paragraphs stay apart: "2" over "10 pack" is the number 2
      
      cells.push(cell.textBetween(0, cell.content.size, "\n"));
    });
    rows.push({ node: row, cells });
  });
  return rows;
}

/** True when ANY cell in the table carries a rowspan/colspan > 1. */
function tableHasMergedCells(table: ProseMirrorNode): boolean {
  let merged = false;
  table.descendants((node) => {
    if (node.type.name === "tableCell" || node.type.name === "tableHeader") {
      const attrs = node.attrs as { rowspan?: unknown; colspan?: unknown };
      if (Number(attrs.rowspan) > 1 || Number(attrs.colspan) > 1) {
        merged = true;
      }
    }
    return !merged;
  });
  return merged;
}

/**
 * A header row for sorting: a row marked "Repeat as header row" (the row's
 * native `headerRow`, which is what the ribbon command writes) or a row made
 * entirely of header cells.
 */
function isHeaderRow(row: ProseMirrorNode): boolean {
  if (row.type.name !== "tableRow" || row.childCount === 0) return false;
  if (row.attrs.headerRow === true) return true;
  let allHeader = true;
  row.forEach((cell) => {
    if (cell.type.name !== "tableHeader") allHeader = false;
  });
  return allHeader;
}

/** Number of leading header rows (the band Word repeats on every page). */
function leadingHeaderRowCount(table: ProseMirrorNode): number {
  let count = 0;
  while (count < table.childCount && isHeaderRow(table.child(count))) count += 1;
  return count;
}

/** True when the table's first row is a header row. */
function firstRowIsHeader(table: ProseMirrorNode): boolean {
  return leadingHeaderRowCount(table) > 0;
}

/**
 * The rows sort keeps in place: none when the user says the table has no
 * header row, otherwise the leading header band (at least the first row when
 * the user says it has one).
 */
function pinnedHeaderRowCount(
  table: ProseMirrorNode,
  hasHeader: boolean | undefined,
): number {
  if (hasHeader === false) return 0;
  const band = leadingHeaderRowCount(table);
  return hasHeader === true ? Math.max(1, band) : band;
}

/**
 * The LOGICAL table the selection is in: a table pagination cut into page
 * fragments is joined back into one table (repeated header clones dropped,
 * split rows rejoined, pagination bookkeeping removed), exactly as it is
 * saved. `fragments` are the physical nodes it replaces.
 */
export function logicalTableAtSelection(
  doc: ProseMirrorNode,
  located: { node: ProseMirrorNode; pos: number },
): { table: ProseMirrorNode; fragments: TableFragment[] } {
  const fragments = logicalTableFragmentsAt(doc, located.pos);
  if (fragments.length < 2) {
    return { table: located.node, fragments: [located] };
  }
  const merged = mergeTableContinuationsJson({
    type: "doc",
    content: fragments.map((fragment) => fragment.node.toJSON()),
  }) as { content: Record<string, unknown>[] };
  if (merged.content.length !== 1) {
    return { table: located.node, fragments: [located] };
  }
  return {
    table: doc.type.schema.nodeFromJSON(merged.content[0]),
    fragments,
  };
}

export interface TableSortContext {
  readonly columnLabels: readonly string[];
  readonly currentColumnIndex: number;
  readonly hasHeader: boolean;
  readonly hasMergedCells: boolean;
  readonly rowCount: number;
}

/** Read the bounded, live table facts needed to open the native Sort dialog. */
export function tableSortContextAtSelection(
  editor: Editor,
): TableSortContext | null {
  const { state } = editor;
  const located = findEnclosingTable(state.doc, state.selection.from);
  if (!located) return null;
  const { table } = logicalTableAtSelection(state.doc, located);
  const rows = readTableRows(table);
  if (rows.length === 0) return null;
  const columnCount = rows.reduce(
    (maximum, row) => Math.max(maximum, row.cells.length),
    0,
  );
  if (columnCount === 0) return null;
  const hasHeader = firstRowIsHeader(table);
  const headerCells = hasHeader ? rows[0]?.cells ?? [] : [];
  return {
    columnLabels: Array.from(
      { length: columnCount },
      (_, index) => headerCells[index] ?? "",
    ),
    currentColumnIndex: Math.min(
      currentTableColumnIndex(state.doc, state.selection.from),
      columnCount - 1,
    ),
    hasHeader,
    hasMergedCells: tableHasMergedCells(table),
    rowCount: rows.length,
  };
}

/**
 * Sort the table containing the selection by `columnIndex`. The header row is
 * inferred from all-header first-row cells unless the caller supplies the
 * dialog's explicit Header row choice. Tables with merged cells are LEFT
 * UNTOUCHED (returning false) because reordering rows would corrupt the spans.
 * Returns true iff a reorder transaction was dispatched.
 */
export function sortTableByColumn(
  editor: Editor,
  columnIndex: number,
  options: TableSortOptions = {},
): boolean {
  const {
    hasHeader,
    caseSensitive,
    locale,
    direction = "asc",
    numeric = false,
    sortType = numeric ? "number" : "text",
  } = options;
  return sortTableByCriteria(
    editor,
    [{ columnIndex, direction, sortType }],
    { hasHeader, caseSensitive, locale },
  );
}

/**
 * Apply the frozen Sort-dialog criteria to one table in one transaction.
 *
 * The whole LOGICAL table is sorted, as in Word: when pagination has cut the
 * table across pages, its fragments are joined into the one table they are,
 * sorted, and put back as that one table (the paginator cuts it into pages
 * again). Header rows stay on top — by default the leading band of repeated
 * header rows; an explicit `hasHeader` choice from the Sort dialog wins.
 */
export function sortTableByCriteria(
  editor: Editor,
  criteria: readonly TableSortCriterion[],
  options: TableSortCriteriaOptions = {},
): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const { state } = editor;
  const { doc } = state;
  const located = findEnclosingTable(doc, state.selection.from);
  if (!located) return false;
  const { table, fragments } = logicalTableAtSelection(doc, located);
  if (tableHasMergedCells(table)) return false;

  const rows = readTableRows(table);
  if (rows.length < 2) return false;
  const headerRowCount = Math.min(
    rows.length,
    options.headerRowCount ?? pinnedHeaderRowCount(table, options.hasHeader),
  );
  const cellGrid = rows.map((row) => row.cells);
  const order = planTableRowSortByCriteria(cellGrid, criteria, {
    caseSensitive: options.caseSensitive,
    locale: options.locale,
    hasHeader: headerRowCount > 0,
    headerRowCount,
  });

  // Build the reordered list of row NODES: pinned header rows (if any) then
  // the sorted data rows.
  const headerRows = rows.slice(0, headerRowCount).map((row) => row.node);
  const sortedDataRows = order.map((rowIdx) => rows[rowIdx].node);
  const newRowNodes = [...headerRows, ...sortedDataRows];

  // No-op when the order is unchanged.
  const unchanged = newRowNodes.every(
    (rowNode, i) => rowNode === table.child(i),
  );
  if (unchanged) return false;

  const newTable = table.type.create(table.attrs, newRowNodes, table.marks);
  const plan = planSortedTableSelection(state.selection, fragments, table);
  const tr = state.tr;
  if (!replaceLogicalTableFragments(tr, fragments, newTable)) return false;
  // Each sorted row's new place: the header band stays, data rows follow
  // the order.
  const sortedRowIndex = new Map<number, number>();
  for (let index = 0; index < headerRowCount; index += 1) {
    sortedRowIndex.set(index, index);
  }
  order.forEach((rowIndex, index) => {
    sortedRowIndex.set(rowIndex, headerRowCount + index);
  });
  restoreSortedTableSelection(tr, plan, fragments[0].pos, sortedRowIndex);
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

/**
 * A place in a table being sorted, by what it is rather than where it was:
 * the LOGICAL row (an index into the table the fragments join into), the
 * cell's index in that row, and the offset into the cell's content. For the
 * second part of a row the page cut, the offset counts from the cell's end:
 * that part is the joined cell's tail.
 */
interface SortedTableAddress {
  readonly row: number;
  readonly column: number;
  readonly offset: number;
  readonly fromEnd: boolean;
}

 
type SortedTableSelectionPlan =
  | {
      readonly kind: "text";
      readonly anchor: SortedTableAddress | number;
      readonly head: SortedTableAddress | number;
    }
  | { readonly kind: "node"; readonly at: SortedTableAddress }
  | {
      readonly kind: "cells";
      /** Logical rows the cell selection covers. */
      readonly rows: readonly number[];
      readonly anchorColumn: number;
      readonly headColumn: number;
      readonly anchorOnTop: boolean;
    }
  | null;

/**
 * The logical address of `pos` when it is inside a cell of one of the sorted
 * table's `fragments`; null anywhere else (outside the table, or between its
 * rows or cells). A position in a table nested in a cell is addressed in the
 * sorted table's cell that holds it.
 */
function sortedTableAddress(
  doc: ProseMirrorNode,
  pos: number,
  fragments: readonly TableFragment[],
  logicalRows: Array<Array<number | null>> | null,
): SortedTableAddress | null {
  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth - 2; depth >= 1; depth -= 1) {
    if ($pos.node(depth).type.name !== "table") continue;
    const fragmentIndex = fragments.findIndex(
      (fragment) => fragment.pos === $pos.before(depth),
    );
    if (fragmentIndex < 0) continue;
    const rowIndex = $pos.index(depth);
    const row = $pos.node(depth + 1);
    let logicalRow: number | null = rowIndex;
    let fromEnd = false;
    if (fragments.length > 1) {
      // A header row a later page repeats is a copy of the band's row at
      // the same index; a row's second part is the tail of the joined row.
      logicalRow =
        row.attrs[TABLE_REPEATED_HEADER_ATTR] === true
          ? rowIndex
          : logicalRows?.[fragmentIndex]?.[rowIndex] ?? null;
      fromEnd = row.attrs[TABLE_ROW_CONTINUATION_ATTR] === true;
    }
    if (logicalRow === null) return null;
    const cellStart = $pos.start(depth + 2);
    const cellEnd = $pos.end(depth + 2);
    return {
      row: logicalRow,
      column: $pos.index(depth + 1),
      offset: fromEnd ? cellEnd - pos : pos - cellStart,
      fromEnd,
    };
  }
  return null;
}

/** Read the selection a sort of `fragments` must give back, before it runs. */
function planSortedTableSelection(
  selection: Selection,
  fragments: readonly TableFragment[],
  table: ProseMirrorNode,
): SortedTableSelectionPlan {
  const doc = selection.$anchor.doc;
  let logicalRows: Array<Array<number | null>> | null = null;
  if (fragments.length > 1) {
    const logical = logicalTableRowIndexes(fragments);
    // The join the sort used must be the one these indexes describe.
    if (logical.count !== table.childCount) return null;
    logicalRows = logical.rows;
  }
  const address = (pos: number) =>
    sortedTableAddress(doc, pos, fragments, logicalRows);
  if (selection instanceof CellSelection) {
    const anchor = address(selection.$anchorCell.pos + 1);
    const head = address(selection.$headCell.pos + 1);
    if (!anchor || !head) return null;
    const rows = new Set<number>();
    selection.forEachCell((_cell, cellPos) => {
      const at = address(cellPos + 1);
      if (at) rows.add(at.row);
    });
    return {
      kind: "cells",
      rows: [...rows],
      anchorColumn: anchor.column,
      headColumn: head.column,
      anchorOnTop: anchor.row <= head.row,
    };
  }
  if (selection instanceof NodeSelection) {
    const at = address(selection.from);
    return at ? { kind: "node", at } : null;
  }
  if (!(selection instanceof TextSelection)) return null;
  const anchor = address(selection.anchor);
  const head = address(selection.head);
  if (!anchor && !head) return null;
  return {
    kind: "text",
    anchor: anchor ?? selection.anchor,
    head: head ?? selection.head,
  };
}

/** The content start of cell (`row`, `column`) of the table at `tablePos`. */
function sortedTableCell(
  doc: ProseMirrorNode,
  tablePos: number,
  row: number,
  column: number,
): { start: number; cell: ProseMirrorNode } | null {
  const table = doc.nodeAt(tablePos);
  if (!table || table.type.name !== "table") return null;
  if (row < 0 || row >= table.childCount) return null;
  let pos = tablePos + 1;
  for (let index = 0; index < row; index += 1) {
    pos += table.child(index).nodeSize;
  }
  const rowNode = table.child(row);
  if (rowNode.childCount === 0) return null;
  const cellIndex = Math.min(Math.max(column, 0), rowNode.childCount - 1);
  pos += 1;
  for (let index = 0; index < cellIndex; index += 1) {
    pos += rowNode.child(index).nodeSize;
  }
  return { start: pos + 1, cell: rowNode.child(cellIndex) };
}









function restoreSortedTableSelection(
  tr: Transaction,
  plan: SortedTableSelectionPlan,
  tablePos: number,
  sortedRowIndex: ReadonlyMap<number, number>,
): void {
  if (!plan) return;
  const doc = tr.doc;
  const cellAt = (row: number, column: number) => {
    const sortedRow = sortedRowIndex.get(row);
    return sortedRow === undefined
      ? null
      : sortedTableCell(doc, tablePos, sortedRow, column);
  };
  const place = (address: SortedTableAddress | number): number | null => {
    if (typeof address === "number") return tr.mapping.map(address);
    const target = cellAt(address.row, address.column);
    if (!target) return null;
    const size = target.cell.content.size;
    const offset = Math.min(Math.max(address.offset, 0), size);
    return target.start + (address.fromEnd ? size - offset : offset);
  };
  try {
    if (plan.kind === "cells") {
      const rows = plan.rows
        .map((row) => sortedRowIndex.get(row))
        .filter((row): row is number => row !== undefined);
      if (rows.length === 0) return;
      const top = Math.min(...rows);
      const bottom = Math.max(...rows);
      const anchor = sortedTableCell(doc, tablePos, plan.anchorOnTop ? top : bottom, plan.anchorColumn);
      const head = sortedTableCell(doc, tablePos, plan.anchorOnTop ? bottom : top, plan.headColumn);
      if (!anchor || !head) return;
      tr.setSelection(CellSelection.create(doc, anchor.start - 1, head.start - 1));
      return;
    }
    if (plan.kind === "node") {
      const pos = place(plan.at);
      if (pos === null) return;
      const node = doc.nodeAt(pos);
      tr.setSelection(
        node && NodeSelection.isSelectable(node)
          ? NodeSelection.create(doc, pos)
          : Selection.near(doc.resolve(pos)),
      );
      return;
    }
    const anchor = place(plan.anchor);
    const head = place(plan.head);
    if (anchor === null || head === null) return;
    const $anchor = doc.resolve(anchor);
    const $head = doc.resolve(head);
    tr.setSelection(
      $anchor.parent.inlineContent && $head.parent.inlineContent
        ? TextSelection.create(doc, anchor, head)
        : TextSelection.between($anchor, $head),
    );
  } catch {
    // A table the sort rebuilt into an unexpected shape keeps the
    // transaction's own mapped selection rather than a guessed cell.
  }
}

/**
 * Put `replacement` where a logical table's page fragments are: the first
 * fragment is replaced, the later ones removed. Later fragments go first so
 * earlier positions stay valid. A page that held nothing but a fragment goes
 * with it; the paginator re-flows the content over the following pages.
 */
export function replaceLogicalTableFragments(
  tr: Transaction,
  fragments: readonly TableFragment[],
  replacement: ProseMirrorNode | readonly ProseMirrorNode[],
): boolean {
  if (fragments.length === 0) return false;
  for (const fragment of [...fragments].slice(1).reverse()) {
    const $fragment = tr.doc.resolve(fragment.pos);
    const parent = $fragment.parent;
    if (parent.childCount > 1) {
      tr.delete(fragment.pos, fragment.pos + fragment.node.nodeSize);
    } else if ($fragment.depth > 0 && parent.type.name === "pageBlock") {
      tr.delete($fragment.before(), $fragment.after());
    } else {
      const filler = parent.type.contentMatch.defaultType?.createAndFill();
      if (!filler) return false;
      tr.replaceWith(fragment.pos, fragment.pos + fragment.node.nodeSize, filler);
    }
  }
  const head = fragments[0];
  tr.replaceWith(
    head.pos,
    head.pos + head.node.nodeSize,
    replacement as ProseMirrorNode | ProseMirrorNode[],
  );
  return true;
}

/**
 * Sort the SELECTED sibling top-level blocks (paragraphs / list items /
 * headings) alphabetically or numerically by their text. The selection must
 * span ≥ 2 sibling blocks that share the same parent; otherwise this is a no-op
 * (returns false).
 *
 * For a LIST selection (the selected blocks are `listItem`s under one
 * `bulletList`/`orderedList`), the items are reordered within the list. For a
 * body selection (paragraphs/headings under the doc), those blocks are
 * reordered. Each block's sort key is its `textContent`. Returns true iff a
 * reorder was dispatched.
 */
export function sortSelectedBlocks(
  editor: Editor,
  options: SortOptions = {},
): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const tr = editor.state.tr;
  // A selection crossing a page sorts its paragraphs, never the pages (Word
  // pages are layout): sort on the joined text, then cut the pages again
  // after the same number of blocks (paged/crossSheetEditing.ts).
  // A refused sort never dispatches `tr`, join included.
  const plan = joinSelectionSheets(tr);
  const { selection, doc } = tr;
  const from = doc.resolve(selection.from);
  let to = doc.resolve(selection.to);
  // A selection that ends at the very start of a paragraph (Shift+Down from
  // the line above lands there) holds none of that paragraph: Word sorts the
  // paragraphs it holds characters of, so the range ends in the one before
  
  if (selection.to > selection.from && to.parent.isTextblock && to.parentOffset === 0) {
    const previous = Selection.findFrom(doc.resolve(to.before()), -1, true);
    if (previous && previous.head >= selection.from) to = previous.$head;
  }

  // `blockRange` finds the shallowest NodeRange whose parent contains BOTH
  // endpoints as a run of sibling children — exactly the set of sibling blocks
  // to reorder. It handles the top-level case (parent = the page) that a
  // manual depth walk gets wrong, and the list case (parent = the list,
  // children = listItems). When the selection doesn't cover a clean sibling run
  // it returns null → no-op.
  const range = from.blockRange(to);
  if (!range) return false;

  const parent = range.parent;
  const firstIndex = range.startIndex;
  const lastIndex = range.endIndex - 1; // endIndex is exclusive
  if (lastIndex <= firstIndex) return false;

  // Collect the selected sibling block nodes + their sort keys.
  const selectedNodes: ProseMirrorNode[] = [];
  for (let i = firstIndex; i <= lastIndex; i += 1) {
    selectedNodes.push(parent.child(i));
  }
  if (selectedNodes.length < 2) return false;

  // The key is the block's text AS SHOWN: a field's result counts (a
  // paragraph that is one PAGE / numeric field read as an empty key and
  
  const keyed: KeyedItem<ProseMirrorNode>[] = selectedNodes.map((node) => ({
    key: textblockDisplayText(node),
    value: node,
  }));
  const sorted = sortKeyedItems(keyed, options);

  // Already in the requested order: the sort is satisfied, nothing to
  // dispatch. That is a success, not a refusal (the toolbar reported every
  
  const unchanged = sorted.every((node, i) => node === selectedNodes[i]);
  if (unchanged) return true;

  // The absolute span covering exactly the selected children: `range.start` is
  // the position just before the first selected child; advance past each
  // selected child to find the end. Replace that span with the sorted nodes.
  const spanStart = range.start;
  const childStarts: number[] = [];
  let spanEnd = spanStart;
  for (const node of selectedNodes) {
    childStarts.push(spanEnd);
    spanEnd += node.nodeSize;
  }
  // Page boundaries that fell between two sorted blocks keep their count.
  const boundaryIndexes = plan
    ? plan.seams
        .map((seam) =>
          childStarts.indexOf(tr.mapping.slice(seam.step).map(seam.pos)),
        )
        .filter((index) => index > 0)
    : [];

  tr.replaceWith(spanStart, spanEnd, sorted);
  // The sorted paragraphs stay selected, as in Word. Mapped through the
  // replacement, the selection's end fell after the sorted run and the
  // nearest selection there was the object that follows it (a text box):
  // the next key typed replaced that object's text (WUA 231).
  const sortedEnd = sorted.reduce((pos, node) => pos + node.nodeSize, spanStart);
  const first = Selection.findFrom(tr.doc.resolve(spanStart), 1, true);
  const last = Selection.findFrom(tr.doc.resolve(sortedEnd), -1, true);
  if (first && last && first.from >= spanStart && last.to <= sortedEnd && first.from <= last.to) {
    tr.setSelection(TextSelection.create(tr.doc, first.from, last.to));
  }
  if (plan) {
    commitCrossSheetEdit(
      tr,
      plan,
      boundaryIndexes.map((index) =>
        sorted
          .slice(0, index)
          .reduce((pos, node) => pos + node.nodeSize, spanStart),
      ),
    );
  }
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

/**
 * Convenience entry used by the toolbar: sort the table column when the caret
 * is inside a table, otherwise sort the selected sibling blocks. The column for
 * a table sort is the caret's current column (derived from the resolved
 * position). Returns true iff something was reordered.
 */
export function sortAtSelection(
  editor: Editor,
  options: SortOptions = {},
): boolean {
  const { state } = editor;
  const located = findEnclosingTable(state.doc, state.selection.from);
  if (located) {
    const columnIndex = currentTableColumnIndex(
      state.doc,
      state.selection.from,
    );
    return sortTableByColumn(editor, columnIndex, options);
  }
  return sortSelectedBlocks(editor, options);
}

/**
 * The 0-based column index of the cell containing `pos`, or 0 when it can't be
 * determined. Counts the caret cell's offset among its row's children (so it is
 * correct for an unmerged table — the merged-cell case is excluded upstream by
 * {@link tableHasMergedCells}).
 */
function currentTableColumnIndex(doc: ProseMirrorNode, pos: number): number {
  const resolved = doc.resolve(Math.min(Math.max(pos, 0), doc.content.size));
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    const node = resolved.node(depth);
    if (node.type.name === "tableRow") {
      return resolved.index(depth);
    }
  }
  return 0;
}
