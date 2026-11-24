/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Closed settings models for the Writer References ribbon.
 *
 * These helpers deliberately model only switches that MRNote can persist and
 * export without guessing. UI surfaces may describe unsupported Word/WPS
 * options, but they must not write an approximation into one of these shapes.
 */

import {
  captionListSeqIdentifier,
  normalizeCaptionKind,
  sanitizeCaptionLabel,
  type CaptionKind,
  type CaptionListLabel,
} from "./captions";
import {
  isTofFormat,
  type TofFormat,
} from "../../../../lib/document-export/referenceListWordCatalog";
import {
  DEFAULT_NOTE_RESTART,
  defaultNotePosition,
  sanitizeNoteNumFmt,
  sanitizeNoteNumStart,
  sanitizeFootnoteId,
  sanitizeNotePosition,
  sanitizeNoteRestart,
  type NoteNumFmt,
  type NotePosition,
  type NoteRestart,
  type NoteStream,
} from "./footnotes";
import {
  sanitizeAnchorId,
  sanitizeHeadingText,
  type TocLevelNormalizer,
} from "./tableOfContents";
import { sanitizeBookmarkName } from "./bookmarks";

type TocLevelDigit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
/**
 * A `\o "a-b"` range: Word's dialog writes `1-k`, and `2-3` when TOC Options
 * clears Heading 1 -- the range then bounds outline levels (`\u`) as well
 * (measured in Word for Mac 16).
 */
export type TocLevelRange = `${TocLevelDigit}-${TocLevelDigit}`;
export const TOC_LEVEL_RANGES: readonly TocLevelRange[] = Array.from({ length: 9 }, (_, low) =>
  Array.from({ length: 9 - low }, (_, offset) => `${low + 1}-${low + 1 + offset}` as TocLevelRange),
).flat();

/** Word's native right-tab leader values used by generated TOC rows. */
export const TOC_TAB_LEADERS = [
  "dot",
  "hyphen",
  "underscore",
  "middleDot",
  "none",
] as const;
export type TocTabLeader = (typeof TOC_TAB_LEADERS)[number];

/**
 * Word's Table of Contents dialog "Formats" (WdTocFormat): From template,
 * Classic, Distinctive, Fancy, Modern, Formal, Simple. A format is the set of
 * TOC 1-9 paragraph styles the dialog writes into styles.xml, plus the leader
 * and right-alignment it preselects (Modern and Simple: no leader, page number
 * after a space). The style definitions come from Word itself
 * (lib/document-export/tocWordCatalog.json).
 */
export const TOC_FORMATS = [
  "template",
  "classic",
  "distinctive",
  "fancy",
  "modern",
  "formal",
  "simple",
] as const;
/**
 * Every format a table can carry: the dialog's, plus "gallery" -- the TOC 1-3
 * every block of Word's References gallery wears (Word for Mac's Document
 * Elements/Table of Contents.dotx glossary: TOC 1 bold 12pt, TOC 2 italic
 * 11pt, TOC 3 11pt, Cambria, 6pt before). Word's five Automatic blocks are
 * one and the same table in those styles; the dialog shows such a table as
 * From template, the document's own TOC styles being the gallery's.
 */
export const TOC_STORED_FORMATS = [...TOC_FORMATS, "gallery"] as const;
export type TocFormat = (typeof TOC_STORED_FORMATS)[number];

/**
 * A style's TOC level, one pair of the `\t "Style,Level,..."` switch (TOC
 * Options > Styles). Word names the style by its UI name ("Title", "标题 1"),
 * never by its id, and lists the pairs with the document's list separator.
 */
export interface TocStyleLevel {
  name: string;
  level: number;
}

export interface TocSettings {
  levels: TocLevelRange;
  hyperlinks: boolean;
  showPageNumbers: boolean;
  rightAlignPageNumbers: boolean;
  tabLeader: TocTabLeader;
  /** Which Word format's TOC 1-9 styles this table wears. */
  format: TocFormat;
  /** The gallery block's heading ("Contents" / "目录") above the field; null = bare field. */
  title: string | null;
  /**
   * TOC Options' "Styles": build from the heading styles (`\o`, and the
   * `\t` mapping). Off = the instruction carries no `\o`, as Word writes
   * a table built only from outline levels and/or TC fields.
   */
  useStyles: boolean;
  /** `\u`: build from paragraph outline levels as well as heading styles. */
  useOutlineLevels: boolean;
  /** `\f`: build from TC (table of contents entry) fields. */
  entryFields: boolean;
  /** `\t`: styles other than Heading N mapped to TOC levels (TOC Options). */
  styleLevels: TocStyleLevel[];
  /**
   * The instruction's switches the dialog has no control for (`\b`, `\s`,
   * `\d`, `\l`, `\a`, `\w`, `\x`), kept verbatim -- normalized to single
   * spaces -- so changing a setting never drops what Word wrote.
   */
  preservedSwitches: string;
}

export const DEFAULT_TOC_SETTINGS: TocSettings = Object.freeze({
  levels: "1-3",
  hyperlinks: true,
  showPageNumbers: true,
  rightAlignPageNumbers: true,
  tabLeader: "dot",
  format: "template",
  title: null,
  useStyles: true,
  useOutlineLevels: true,
  entryFields: false,
  styleLevels: [],
  preservedSwitches: "",
});

/** `\x \s "Chapter" \d "-"` and the like, or "" for anything else. */
export function normalizeTocPreservedSwitches(value: unknown): string {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  // Each switch may carry one argument, quoted (`\s "Chapter"`, Word's
  // escapes `\"` and `\\` inside) or a bare token (`\b Part1`), never a
  // second switch's backslash.
  const argument = '(?: (?:"(?:[^"\\\\]|\\\\.)*"|[^\\s"\\\\]+))?';
  const pattern = new RegExp(`^\\\\[a-z]${argument}(?: \\\\[a-z]${argument})*$`, "i");
  return normalized.length <= 200 && pattern.test(normalized) ? normalized : "";
}

/**
 * The levels a `\n "a-b"` switch strips page numbers from (Word keeps the
 * other levels' numbers), or null when every level shows its number.
 */
export function tocPageNumberOmittedLevels(settings: { preservedSwitches?: unknown }): [number, number] | null {
  const switches = typeof settings.preservedSwitches === "string" ? settings.preservedSwitches : "";
  const range = /(?:^|\s)\\n\s+"\s*([1-9])\s*-\s*([1-9])\s*"/i.exec(switches);
  if (!range) return null;
  const low = Number(range[1]);
  const high = Number(range[2]);
  return low <= high ? [low, high] : [high, low];
}

export function normalizeTocFormat(value: unknown): TocFormat {
  return typeof value === "string" && (TOC_STORED_FORMATS as readonly string[]).includes(value)
    ? (value as TocFormat)
    : DEFAULT_TOC_SETTINGS.format;
}

/** A style name as the `\t` switch can carry it: no separators or quotes. */
const TOC_STYLE_NAME_RE = /^[^,;"\u0000-\u001f]{1,64}$/;

export function normalizeTocStyleLevels(value: unknown): TocStyleLevel[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: TocStyleLevel[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const name = (item as { name?: unknown }).name;
    const level = (item as { level?: unknown }).level;
    if (
      typeof name !== "string" ||
      name !== name.trim() ||
      !TOC_STYLE_NAME_RE.test(name) ||
      seen.has(name) ||
      typeof level !== "number" ||
      !Number.isInteger(level) ||
      level < 1 ||
      level > 9
    ) {
      continue;
    }
    seen.add(name);
    out.push({ name, level });
    if (out.length >= 64) break;
  }
  return out;
}

/**
 * The `\t` switch's value ("Title,2,Subtitle,3" -- or with ";" where the
 * document's list separator is a semicolon) as style/level pairs. A trailing
 * name without a level, or a level outside 1-9, ends the list as Word does.
 */
export function parseTocStyleLevelSpec(spec: string): TocStyleLevel[] {
  const parts = spec.split(/[,;]/).map((part) => part.trim());
  const pairs: { name: string; level: number }[] = [];
  for (let index = 0; index + 1 < parts.length; index += 2) {
    const level = Number.parseInt(parts[index + 1], 10);
    if (!parts[index] || !/^[1-9]$/.test(parts[index + 1]) || !Number.isInteger(level)) break;
    pairs.push({ name: parts[index], level });
  }
  return normalizeTocStyleLevels(pairs);
}

/**
 * The instruction as Word reads its switches: a token outside quotes written
 * with two backslashes (`\\h`, `\\o "1-3"`) is no switch at all (Word truth:
 * `TOC \\o "1-3" \\h \\t "Page,1" \\f "a"` builds what a bare `TOC` builds;
 * corpus R483-D08). Kept in step with `word_switch_text` in
 * document_docx_toc_field.py.
 */
export function wordSwitchText(instruction: string): string {
  if (!instruction.includes("\\\\")) return instruction;
  const tokens = instruction.match(/"(?:\\.|[^"\\])*"|\S+/g) ?? [];
  const kept = tokens.filter((token) => token.startsWith('"') || !token.startsWith("\\\\"));
  return ` ${kept.join(" ")} `;
}

/**
 * The settings a Word `TOC` instruction spells (ECMA-376 17.16.5.68), for
 * every importer to read the same way. `null` for a `TOC \c` table of figures
 * or anything that is not a TOC field. Word writes `\o "1-3"`; an instruction
 * with no `\o` and no `\t` builds from headings 1-9.
 */
export function tocSettingsFromInstruction(
  written: string,
): Omit<TocSettings, "tabLeader" | "format" | "title"> | null {
  if (!/^\s*TOC\b/i.test(written)) return null;
  const instruction = wordSwitchText(written);
  if (/\\c\s+"/i.test(instruction)) return null;
  const preserved: string[] = [];
  for (const match of instruction.matchAll(
    /\\([a-z])(?:\s+("[^"]*"|[^\s"\\]+))?/gi,
  )) {
    const letter = match[1].toLowerCase();
    // `\n "2-2"` omits the numbers of those levels only: carried as written.
    if ("ohnpuftz".includes(letter) && !(letter === "n" && match[2] !== undefined)) continue;
    preserved.push(match[2] === undefined ? `\\${letter}` : `\\${letter} ${match[2]}`);
  }
  const outline = /\\o\s+"?\s*(\d)\s*-\s*(\d)\s*"?/i.exec(instruction);
  const styleSpec = /\\t\s+"([^"]*)"/i.exec(instruction)?.[1];
  const styleLevels = styleSpec ? parseTocStyleLevelSpec(styleSpec) : [];
  const upper = outline ? Number.parseInt(outline[2], 10) : styleLevels.length > 0 ? 0 : 9;
  const lower = outline ? Math.max(1, Number.parseInt(outline[1], 10)) : 1;
  const top = Math.max(1, Math.min(9, upper));
  const levels = normalizeTocLevelRange(`${Math.min(lower, top)}-${top}`);
  const useOutlineLevels = /(?:^|\s)\\u(?:\s|$)/i.test(instruction);
  const entryFields = /(?:^|\s)\\f(?:\s|$)/i.test(instruction);
  return {
    levels,
    hyperlinks: /(?:^|\s)\\h(?:\s|$)/i.test(instruction),
    showPageNumbers: !/(?:^|\s)\\n(?!\s+")(?:\s|$)/i.test(instruction),
    // Any `\p` separator replaces the right tab (Word writes `\p " "`).
    rightAlignPageNumbers: !/(?:^|\s)\\p(?:\s|$)/i.test(instruction),
    // Styles are a source when `\o` or `\t` names them, and for a bare TOC
    // (Word's default is the heading styles); a table spelled only with
    
    useStyles: Boolean(outline) || styleLevels.length > 0 || !(useOutlineLevels || entryFields),
    useOutlineLevels,
    entryFields,
    styleLevels,
    preservedSwitches: normalizeTocPreservedSwitches(preserved.join(" ")),
  };
}

function normalizeTocTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const title = value.replace(/[\r\n\t]+/g, " ").trim();
  return title.length > 0 && title.length <= 200 ? title : null;
}

export function normalizeTocLevelRange(value: unknown): TocLevelRange {
  return typeof value === "string" &&
    (TOC_LEVEL_RANGES as readonly string[]).includes(value)
    ? (value as TocLevelRange)
    : DEFAULT_TOC_SETTINGS.levels;
}

export function normalizeTocTabLeader(value: unknown): TocTabLeader {
  return typeof value === "string" &&
    (TOC_TAB_LEADERS as readonly string[]).includes(value)
    ? (value as TocTabLeader)
    : DEFAULT_TOC_SETTINGS.tabLeader;
}

export function normalizeTocSettings(value: unknown): TocSettings {
  const candidate =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    levels: normalizeTocLevelRange(candidate.levels),
    hyperlinks:
      typeof candidate.hyperlinks === "boolean"
        ? candidate.hyperlinks
        : DEFAULT_TOC_SETTINGS.hyperlinks,
    showPageNumbers:
      typeof candidate.showPageNumbers === "boolean"
        ? candidate.showPageNumbers
        : DEFAULT_TOC_SETTINGS.showPageNumbers,
    rightAlignPageNumbers:
      typeof candidate.rightAlignPageNumbers === "boolean"
        ? candidate.rightAlignPageNumbers
        : DEFAULT_TOC_SETTINGS.rightAlignPageNumbers,
    tabLeader: normalizeTocTabLeader(candidate.tabLeader),
    format: normalizeTocFormat(candidate.format),
    title: normalizeTocTitle(candidate.title),
    useStyles:
      typeof candidate.useStyles === "boolean"
        ? candidate.useStyles
        : DEFAULT_TOC_SETTINGS.useStyles,
    useOutlineLevels:
      typeof candidate.useOutlineLevels === "boolean"
        ? candidate.useOutlineLevels
        : DEFAULT_TOC_SETTINGS.useOutlineLevels,
    entryFields:
      typeof candidate.entryFields === "boolean"
        ? candidate.entryFields
        : DEFAULT_TOC_SETTINGS.entryFields,
    styleLevels: normalizeTocStyleLevels(candidate.styleLevels),
    preservedSwitches: normalizeTocPreservedSwitches(candidate.preservedSwitches),
  };
}

/** The shallowest level a table's `\o` takes (1 unless TOC Options cleared it). */
export function tocMinimumLevel(settings: unknown): number {
  return Number.parseInt(normalizeTocSettings(settings).levels.split("-")[0], 10);
}

export function tocMaximumLevel(settings: unknown): number {
  return Number.parseInt(
    normalizeTocSettings(settings).levels.split("-")[1],
    10,
  );
}

/** The heading style a `\t` entry names ("Heading 2", Word's "heading 2"). */
function tocHeadingStyleNumber(name: string): number | null {
  const match = /^heading\s*([1-9])$/i.exec(name.trim());
  return match ? Number.parseInt(match[1], 10) : null;
}

/**
 * The TOC level each source reaches under a table's settings, as Word builds
 * the field: a heading style named in `\t` takes the level it is mapped to
 * there (TOC Options mapping Heading 2 to level 1 lists it at level 1), any
 * other heading style and a direct outline level are in the table when
 * `\o` covers them. Every collector of a table's entries (insert, update,
 * the live view, its links and the export) reads the same answer.
 */
export function tocSourceLevelResolver(settings: unknown): TocLevelNormalizer {
  const normalized = normalizeTocSettings(settings);
  const maximum = tocMaximumLevel(normalized);
  const minimum = tocMinimumLevel(normalized);
  const mapped = new Map<number, number>();
  for (const { name, level } of normalized.styleLevels) {
    const heading = tocHeadingStyleNumber(name);
    if (heading !== null && !mapped.has(heading)) mapped.set(heading, level);
  }
  const named = new Map<string, number>();
  for (const { name, level } of normalized.styleLevels) {
    const key = name.trim().toLowerCase();
    if (tocHeadingStyleNumber(name) === null && !named.has(key)) named.set(key, level);
  }
  return (value, source = "heading") => {
    if (source === "style") {
      return normalized.useStyles && typeof value === "string"
        ? (named.get(value.trim().toLowerCase()) ?? null)
        : null;
    }
    // Without `\u` a paragraph's own outline level lists nothing.
    if (source === "outline" && !normalized.useOutlineLevels) return null;
    const numeric =
      typeof value === "number"
        ? value
        : typeof value === "string"
          ? Number.parseInt(value, 10)
          : NaN;
    if (!Number.isInteger(numeric) || numeric < 1 || numeric > 9) return null;
    if (source === "heading") {
      // TOC Options' Styles box off: a heading STYLE is not a source (a
      // heading paragraph still enters through its outline level, `\u`).
      if (!normalized.useStyles) return null;
      const level = mapped.get(numeric);
      if (level !== undefined) return level;
    }
    return numeric >= minimum && numeric <= maximum ? numeric : null;
  };
}

/** The deepest TOC level a table's entries can have (its `\o` or `\t`). */
export function tocEntryMaximumLevel(settings: unknown): number {
  const normalized = normalizeTocSettings(settings);
  return Math.max(
    tocMaximumLevel(normalized),
    ...normalized.styleLevels
      .filter(({ name }) => tocHeadingStyleNumber(name) !== null)
      .map(({ level }) => level),
  );
}

/** The deepest heading STYLE a table lists (its `\o`, or one `\t` maps). */
export function tocSourceMaximumHeading(settings: unknown): number {
  const normalized = normalizeTocSettings(settings);
  return Math.max(
    tocMaximumLevel(normalized),
    ...normalized.styleLevels.map(({ name }) => tocHeadingStyleNumber(name) ?? 0),
  );
}

/**
 * The native Word instruction for a configured TOC, spelled as Word's own
 * dialog writes it (ECMA-376 17.16.5.68; measured in Word for Mac 16):
 * ` TOC \o "1-3" [\n] [\p " "] \h \z [\u] [\f] [\t "Style,Level,..."] `.
 * `\z` always accompanies `\h` (hide leaders and page numbers in Web layout);
 * `\n` alone omits every page number; `\p " "` is what "Right align page
 * numbers" off produces; `\t` lists every non-Heading style in TOC Options.
 */
export function tocFieldInstruction(settings: unknown): string {
  const normalized = normalizeTocSettings(settings);
  const parts = normalized.useStyles ? [`TOC \\o "${normalized.levels}"`] : ["TOC"];
  if (!normalized.showPageNumbers) parts.push("\\n");
  else if (!normalized.rightAlignPageNumbers) parts.push('\\p " "');
  if (normalized.hyperlinks) parts.push("\\h");
  parts.push("\\z");
  if (normalized.useOutlineLevels) parts.push("\\u");
  if (normalized.entryFields) parts.push("\\f");
  if (normalized.styleLevels.length > 0) {
    const spec = normalized.styleLevels
      .map(({ name, level }) => `${name},${level}`)
      .join(",");
    parts.push(`\\t "${spec}"`);
  }
  if (normalized.preservedSwitches) parts.push(normalized.preservedSwitches);
  return ` ${parts.join(" ")} `;
}

/**
 * Closed formatting switches shared by Word's Table of Figures and Table of
 * Tables fields. They intentionally reuse the TOC leader/boolean authority:
 * both features serialize the same native right-tab and field switches, while
 * the caption kind remains the independent `TOC \\c` sequence selector.
 */
export type GeneratedListSettings = Pick<
  TocSettings,
  | "hyperlinks"
  | "showPageNumbers"
  | "rightAlignPageNumbers"
  | "tabLeader"
> & {
  /** Word's "Include label and number" (off = `\\a` instead of `\\c`). */
  includeLabel: boolean;
  /** Word's Table of Figures Formats (the "table of figures" style). */
  format: TofFormat;
};

export const DEFAULT_GENERATED_LIST_SETTINGS: GeneratedListSettings =
  Object.freeze({
    hyperlinks: DEFAULT_TOC_SETTINGS.hyperlinks,
    showPageNumbers: DEFAULT_TOC_SETTINGS.showPageNumbers,
    rightAlignPageNumbers: DEFAULT_TOC_SETTINGS.rightAlignPageNumbers,
    tabLeader: DEFAULT_TOC_SETTINGS.tabLeader,
    includeLabel: true,
    format: "template" as TofFormat,
  });

export function normalizeGeneratedListSettings(
  value: unknown,
): GeneratedListSettings {
  const normalized = normalizeTocSettings(value);
  const candidate =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    hyperlinks: normalized.hyperlinks,
    showPageNumbers: normalized.showPageNumbers,
    rightAlignPageNumbers: normalized.rightAlignPageNumbers,
    tabLeader: normalized.tabLeader,
    includeLabel: candidate.includeLabel !== false,
    format: isTofFormat(candidate.format) ? candidate.format : "template",
  };
}

/**
 * Native Word/WPS `TOC` instruction for a Table of Figures (read back from
 * Word for Mac 16's Insert > Index and Tables > Table of Figures): the caption
 * label is `\\c "Figure"`, or `\\a "Figure"` without label and number;
 * "(none)" builds from the Caption style (`\\t "Caption,1"`). `\\n` hides the
 * page numbers and `\\p " "` puts them after a space instead of on a right
 * tab. The Formats change only the "table of figures" style.
 */
export function generatedListFieldInstruction(
  kind: CaptionListLabel,
  settings: unknown,
): string {
  const normalized = normalizeGeneratedListSettings(settings);
  const source =
    kind === "none"
      ? '\\t "Caption,1"'
      : `${normalized.includeLabel ? "\\c" : "\\a"} "${captionListSeqIdentifier(kind)}"`;
  return ` TOC${normalized.hyperlinks ? " \\h" : ""}${
    normalized.showPageNumbers ? "" : " \\n"
  }${
    normalized.showPageNumbers && !normalized.rightAlignPageNumbers
      ? ' \\p " "'
      : ""
  } \\z ${source} `;
}

export interface CaptionSettings {
  kind: CaptionKind;
  label: string;
}

export function normalizeCaptionSettings(value: unknown): CaptionSettings {
  const candidate =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    kind: normalizeCaptionKind(candidate.kind),
    label: sanitizeCaptionLabel(candidate.label),
  };
}

export interface CrossReferenceSettings {
  targetAnchorId: string;
  targetType: CrossRefTargetType;
  label: string;
}

export type CrossRefTargetType =
  | "heading"
  | "figure"
  | "table"
  | "bookmark"
  | "footnote"
  | "endnote";

function normalizeCrossRefTargetType(value: unknown): CrossRefTargetType {
  return value === "figure" ||
    value === "table" ||
    value === "bookmark" ||
    value === "footnote" ||
    value === "endnote"
    ? value
    : "heading";
}

export function normalizeCrossReferenceSettings(
  value: unknown,
): CrossReferenceSettings | null {
  const candidate =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const targetType = normalizeCrossRefTargetType(candidate.targetType);
  const targetAnchorId =
    targetType === "bookmark"
      ? sanitizeBookmarkName(candidate.targetAnchorId)
      : targetType === "footnote" || targetType === "endnote"
        ? sanitizeFootnoteId(candidate.targetAnchorId)
      : sanitizeAnchorId(candidate.targetAnchorId);
  if (!targetAnchorId) return null;
  return {
    targetAnchorId,
    targetType,
    label: sanitizeHeadingText(candidate.label),
  };
}

export interface FootnoteSettings {
  stream: NoteStream;
  numFmt: NoteNumFmt;
  start: number;
}

export interface NativeNoteSettings extends FootnoteSettings {
  position: NotePosition;
  restart: NoteRestart;
}

export function normalizeFootnoteSettings(value: unknown): FootnoteSettings {
  const candidate =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    stream: candidate.stream === "endnote" ? "endnote" : "footnote",
    numFmt: sanitizeNoteNumFmt(candidate.numFmt) ?? "decimal",
    start: sanitizeNoteNumStart(candidate.start) ?? 1,
  };
}

/**
 * Footnote and Endnote > Start at, as typed: the field's whole number the
 * way a number input reads it ("1e2" is 100), or null for anything that is
 * not a whole number in 1..9999 (never its leading digits).
 */
export function noteStartValue(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  const value = Number(text);
  return Number.isInteger(value) && value >= 1 && value <= 9999 ? value : null;
}

export function normalizeNativeNoteSettings(value: unknown): NativeNoteSettings {
  const candidate =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const base = normalizeFootnoteSettings(candidate);
  return {
    ...base,
    position:
      sanitizeNotePosition(base.stream, candidate.position) ??
      defaultNotePosition(base.stream),
    restart:
      sanitizeNoteRestart(base.stream, candidate.restart) ??
      DEFAULT_NOTE_RESTART,
  };
}

export {
  DEFAULT_INDEX_SETTINGS,
  INDEX_COLUMN_COUNTS,
  INDEX_LANGUAGE_IDS,
  indexFieldInstruction,
  normalizeIndexColumnCount,
  normalizeIndexLanguageId,
  normalizeIndexSeparator,
  normalizeIndexSettings,
  parseIndexFieldInstructionSettings,
  type IndexColumnCount,
  type IndexLanguageId,
  type IndexSettings,
} from "./documentIndexSettings";
