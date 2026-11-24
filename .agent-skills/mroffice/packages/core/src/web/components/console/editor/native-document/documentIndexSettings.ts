/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Closed Word/WPS INDEX-field settings shared by authoring and export.
 *
 * Word's Index dialog (Insert > Index and Tables > Index; Microsoft Support
 * "Create and update an index", "Field codes: Index field"): Type (Indented
 * / Run-in `\r`), Columns (`\c`), Language (`\z`), "Right align page
 * numbers" (`\e "<tab>"`, the page number after a right tab stop), "Tab
 * leader" (the dots/hyphens/underscores on that tab stop, kept in the index
 * styles), and Formats (the index 1..9 / index heading styles; the formats
 * with letter headings add `\h "A"`, see referenceListWordCatalog.ts).
 */
import {
  INDEX_FORMATS,
  indexFormatHasHeadings,
  isIndexFormat,
  type IndexFormat,
} from "../../../../lib/document-export/referenceListWordCatalog";

export { INDEX_FORMATS, type IndexFormat };

export const INDEX_TAB_LEADERS = ["dot", "hyphen", "underscore", "none"] as const;
export type IndexTabLeader = (typeof INDEX_TAB_LEADERS)[number];

export const INDEX_COLUMN_COUNTS = [1, 2, 3, 4] as const;
export type IndexColumnCount = (typeof INDEX_COLUMN_COUNTS)[number];

export const INDEX_LANGUAGE_IDS = [
  "auto",
  "1033",
  "2057",
  "2052",
  "1028",
  "1041",
] as const;
export type IndexLanguageId = (typeof INDEX_LANGUAGE_IDS)[number];

export const MAX_INDEX_SEPARATOR_LENGTH = 5;

export interface IndexSettings {
  columns: IndexColumnCount;
  runIn: boolean;
  entryPageSeparator: string;
  pageRangeSeparator: string;
  crossReferenceSeparator: string;
  pageListSeparator: string;
  languageId: IndexLanguageId;
  /** Word's "Right align page numbers": `\e "<tab>"`. */
  rightAlignPageNumbers: boolean;
  /** The leader on the right tab stop (only with right alignment). */
  tabLeader: IndexTabLeader;
  /** Word's Formats list (the index styles; letter headings `\h`). */
  format: IndexFormat;
}

export const DEFAULT_INDEX_SETTINGS: IndexSettings = Object.freeze({
  columns: 2,
  runIn: false,
  entryPageSeparator: ", ",
  pageRangeSeparator: "–",
  crossReferenceSeparator: ". ",
  pageListSeparator: ", ",
  languageId: "auto",
  rightAlignPageNumbers: false,
  tabLeader: "dot",
  format: "template",
});

const INDEX_SEPARATOR_CONTROL_RE = /[\x00-\x1f\x7f-\x9f]/g;

export function normalizeIndexColumnCount(value: unknown): IndexColumnCount {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : NaN;
  return (INDEX_COLUMN_COUNTS as readonly number[]).includes(numeric)
    ? (numeric as IndexColumnCount)
    : DEFAULT_INDEX_SETTINGS.columns;
}

export function normalizeIndexLanguageId(value: unknown): IndexLanguageId {
  return typeof value === "string" &&
    (INDEX_LANGUAGE_IDS as readonly string[]).includes(value)
    ? (value as IndexLanguageId)
    : DEFAULT_INDEX_SETTINGS.languageId;
}

export function normalizeIndexSeparator(
  value: unknown,
  fallback: string,
): string {
  if (typeof value !== "string") return fallback;
  let normalized = "";
  for (const character of value.replace(INDEX_SEPARATOR_CONTROL_RE, "")) {
    if (normalized.length + character.length > MAX_INDEX_SEPARATOR_LENGTH) {
      break;
    }
    normalized += character;
  }
  return normalized || fallback;
}

export function normalizeIndexSettings(value: unknown): IndexSettings {
  const candidate =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    columns: normalizeIndexColumnCount(candidate.columns),
    runIn: candidate.runIn === true,
    entryPageSeparator: normalizeIndexSeparator(
      candidate.entryPageSeparator,
      DEFAULT_INDEX_SETTINGS.entryPageSeparator,
    ),
    pageRangeSeparator: normalizeIndexSeparator(
      candidate.pageRangeSeparator,
      DEFAULT_INDEX_SETTINGS.pageRangeSeparator,
    ),
    crossReferenceSeparator: normalizeIndexSeparator(
      candidate.crossReferenceSeparator,
      DEFAULT_INDEX_SETTINGS.crossReferenceSeparator,
    ),
    pageListSeparator: normalizeIndexSeparator(
      candidate.pageListSeparator,
      DEFAULT_INDEX_SETTINGS.pageListSeparator,
    ),
    languageId: normalizeIndexLanguageId(candidate.languageId),
    rightAlignPageNumbers: candidate.rightAlignPageNumbers === true,
    tabLeader: (INDEX_TAB_LEADERS as readonly unknown[]).includes(
      candidate.tabLeader,
    )
      ? (candidate.tabLeader as IndexTabLeader)
      : DEFAULT_INDEX_SETTINGS.tabLeader,
    format: isIndexFormat(candidate.format)
      ? candidate.format
      : DEFAULT_INDEX_SETTINGS.format,
  };
}

function quoteIndexArgument(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function appendNonDefaultSeparator(
  parts: string[],
  switchName: "e" | "g" | "k" | "l",
  value: string,
  fallback: string,
): void {
  if (value !== fallback) {
    parts.push(`\\${switchName} ${quoteIndexArgument(value)}`);
  }
}

/** The closed native Word/WPS instruction emitted for an INDEX field. */
export function indexFieldInstruction(settings: unknown): string {
  const normalized = normalizeIndexSettings(settings);
  const parts = [`INDEX \\c "${normalized.columns}"`];
  if (normalized.runIn) parts.push("\\r");
  if (normalized.rightAlignPageNumbers) {
    // Word writes the right-aligned page number as a tab separator.
    parts.push('\\e "\t"');
  } else {
    appendNonDefaultSeparator(
      parts,
      "e",
      normalized.entryPageSeparator,
      DEFAULT_INDEX_SETTINGS.entryPageSeparator,
    );
  }
  if (indexFormatHasHeadings(normalized.format)) parts.push('\\h "A"');
  appendNonDefaultSeparator(
    parts,
    "g",
    normalized.pageRangeSeparator,
    DEFAULT_INDEX_SETTINGS.pageRangeSeparator,
  );
  appendNonDefaultSeparator(
    parts,
    "k",
    normalized.crossReferenceSeparator,
    DEFAULT_INDEX_SETTINGS.crossReferenceSeparator,
  );
  appendNonDefaultSeparator(
    parts,
    "l",
    normalized.pageListSeparator,
    DEFAULT_INDEX_SETTINGS.pageListSeparator,
  );
  if (normalized.languageId !== "auto") {
    parts.push(`\\z "${normalized.languageId}"`);
  }
  return ` ${parts.join(" ")} `;
}

function unescapeIndexArgument(value: string): string {
  return value.replace(/\\(["\\])/g, "$1");
}

function quotedIndexSwitch(instruction: string, switchName: string): string | null {
  const pattern = new RegExp(
    `\\\\${switchName}\\s+"((?:\\\\.|[^"\\\\])*)"`,
    "i",
  );
  const match = instruction.match(pattern);
  return match ? unescapeIndexArgument(match[1]) : null;
}

/** Parse the supported INDEX switches without manufacturing unsupported state. */
export function parseIndexFieldInstructionSettings(
  instruction: unknown,
): IndexSettings {
  const source = typeof instruction === "string" ? instruction : "";
  const entrySeparator = quotedIndexSwitch(source, "e");
  const rightAlignPageNumbers = entrySeparator === "\t";
  // The format itself lives in the index styles (the importer reads it from
  // them); the field only says whether letter headings are on.
  const headings = /(?:^|\s)\\h(?:\s|$)/i.test(source);
  return normalizeIndexSettings({
    rightAlignPageNumbers,
    format: headings ? "classic" : "template",
    columns: source.match(/\\c\s+"?(\d+)"?/i)?.[1],
    runIn: /(?:^|\s)\\r(?:\s|$)/i.test(source),
    entryPageSeparator:
      (rightAlignPageNumbers ? null : entrySeparator) ??
      DEFAULT_INDEX_SETTINGS.entryPageSeparator,
    pageRangeSeparator:
      quotedIndexSwitch(source, "g") ??
      DEFAULT_INDEX_SETTINGS.pageRangeSeparator,
    crossReferenceSeparator:
      quotedIndexSwitch(source, "k") ??
      DEFAULT_INDEX_SETTINGS.crossReferenceSeparator,
    pageListSeparator:
      quotedIndexSwitch(source, "l") ??
      DEFAULT_INDEX_SETTINGS.pageListSeparator,
    languageId:
      source.match(/\\z\s+"?(\d+)"?/i)?.[1] ??
      DEFAULT_INDEX_SETTINGS.languageId,
  });
}
