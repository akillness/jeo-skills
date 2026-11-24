/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/** Closed native Word `TOA` (Table of Authorities) field settings. */

export const AUTHORITY_CATEGORY_NUMBERS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
] as const;
export type AuthorityCategoryNumber =
  (typeof AUTHORITY_CATEGORY_NUMBERS)[number];

export const MAX_AUTHORITY_SEPARATOR_LENGTH = 5;

export interface AuthorityTableSettings {
  category: AuthorityCategoryNumber;
  includeCategoryHeading: boolean;
  usePassim: boolean;
  preserveEntryFormatting: boolean;
  /** Empty means Word's native tab-stop/leader result; it is not synthesized. */
  entryPageSeparator: string;
  pageRangeSeparator: string;
  pageListSeparator: string;
}

export const DEFAULT_AUTHORITY_TABLE_SETTINGS: AuthorityTableSettings =
  Object.freeze({
    category: 1,
    includeCategoryHeading: false,
    usePassim: false,
    preserveEntryFormatting: true,
    entryPageSeparator: "",
    pageRangeSeparator: "–",
    pageListSeparator: ", ",
  });

/**
 * What Word's Insert Table of Authorities dialog starts from for a new table:
 * the category heading on (`\h`, which the dialog always writes) and Use
 * passim checked, i.e. `TOA \h \c "1" \p`.
 */
export const WORD_NEW_AUTHORITY_TABLE_SETTINGS: AuthorityTableSettings =
  Object.freeze({
    ...DEFAULT_AUTHORITY_TABLE_SETTINGS,
    includeCategoryHeading: true,
    usePassim: true,
  });

/** The dialog's Category "All": one table per category that has entries. */
export const AUTHORITY_ALL_CATEGORIES = "all" as const;
export type AuthorityCategoryChoice =
  | AuthorityCategoryNumber
  | typeof AUTHORITY_ALL_CATEGORIES;

const AUTHORITY_SEPARATOR_CONTROL_RE = /[\x00-\x1f\x7f-\x9f]/g;

export function normalizeAuthorityCategory(
  value: unknown,
): AuthorityCategoryNumber {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;
  return (AUTHORITY_CATEGORY_NUMBERS as readonly number[]).includes(numeric)
    ? (numeric as AuthorityCategoryNumber)
    : DEFAULT_AUTHORITY_TABLE_SETTINGS.category;
}

export function normalizeAuthoritySeparator(
  value: unknown,
  fallback: string,
  allowEmpty = false,
): string {
  if (typeof value !== "string") return fallback;
  let normalized = "";
  for (const character of value.replace(AUTHORITY_SEPARATOR_CONTROL_RE, "")) {
    if (normalized.length + character.length > MAX_AUTHORITY_SEPARATOR_LENGTH) {
      break;
    }
    normalized += character;
  }
  return normalized || (allowEmpty ? "" : fallback);
}

export function normalizeAuthorityTableSettings(
  value: unknown,
): AuthorityTableSettings {
  const candidate =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    category: normalizeAuthorityCategory(candidate.category),
    includeCategoryHeading: candidate.includeCategoryHeading === true,
    usePassim: candidate.usePassim === true,
    preserveEntryFormatting: candidate.preserveEntryFormatting !== false,
    entryPageSeparator: normalizeAuthoritySeparator(
      candidate.entryPageSeparator,
      DEFAULT_AUTHORITY_TABLE_SETTINGS.entryPageSeparator,
      true,
    ),
    pageRangeSeparator: normalizeAuthoritySeparator(
      candidate.pageRangeSeparator,
      DEFAULT_AUTHORITY_TABLE_SETTINGS.pageRangeSeparator,
    ),
    pageListSeparator: normalizeAuthoritySeparator(
      candidate.pageListSeparator,
      DEFAULT_AUTHORITY_TABLE_SETTINGS.pageListSeparator,
    ),
  };
}

function quoteAuthorityArgument(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Compile the supported native Word TOA switches, never a visual fake. */
export function authorityTableFieldInstruction(settings: unknown): string {
  const normalized = normalizeAuthorityTableSettings(settings);
  const parts = [`TOA \\c "${normalized.category}"`];
  if (normalized.includeCategoryHeading) parts.push("\\h");
  if (normalized.usePassim) parts.push("\\p");
  if (!normalized.preserveEntryFormatting) parts.push("\\f");
  if (normalized.entryPageSeparator) {
    parts.push(`\\e ${quoteAuthorityArgument(normalized.entryPageSeparator)}`);
  }
  if (
    normalized.pageRangeSeparator !==
    DEFAULT_AUTHORITY_TABLE_SETTINGS.pageRangeSeparator
  ) {
    parts.push(`\\g ${quoteAuthorityArgument(normalized.pageRangeSeparator)}`);
  }
  if (
    normalized.pageListSeparator !==
    DEFAULT_AUTHORITY_TABLE_SETTINGS.pageListSeparator
  ) {
    parts.push(`\\l ${quoteAuthorityArgument(normalized.pageListSeparator)}`);
  }
  return ` ${parts.join(" ")} `;
}

function tokenizeAuthorityInstruction(value: string): string[] {
  const tokens: string[] = [];
  const pattern = /"((?:\\.|[^"\\])*)"|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    tokens.push(
      match[1] !== undefined
        ? match[1].replace(/\\(["\\])/g, "$1")
        : match[2],
    );
  }
  return tokens;
}

/** Parse only the bounded TOA grammar this editor can persist and export. */
export function parseAuthorityTableFieldInstructionSettings(
  instruction: unknown,
): AuthorityTableSettings | null {
  if (typeof instruction !== "string") return null;
  const tokens = tokenizeAuthorityInstruction(instruction.trim());
  if (tokens[0]?.toUpperCase() !== "TOA") return null;
  const candidate: Partial<AuthorityTableSettings> = {};
  let hasCategory = false;
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index]?.toLowerCase();
    if (token === "\\*") {
      if (tokens[index + 1]?.toUpperCase() !== "MERGEFORMAT") return null;
      index += 1;
    } else if (token === "\\c" && tokens[index + 1]) {
      if (hasCategory) return null;
      const raw = tokens[++index];
      const parsed = Number.parseInt(raw, 10);
      if (
        String(parsed) !== raw ||
        !(AUTHORITY_CATEGORY_NUMBERS as readonly number[]).includes(parsed)
      ) {
        return null;
      }
      candidate.category = parsed as AuthorityCategoryNumber;
      hasCategory = true;
    } else if (token === "\\h") {
      candidate.includeCategoryHeading = true;
    } else if (token === "\\p") {
      candidate.usePassim = true;
    } else if (token === "\\f") {
      candidate.preserveEntryFormatting = false;
    } else if (
      (token === "\\e" || token === "\\g" || token === "\\l") &&
      tokens[index + 1] !== undefined
    ) {
      const raw = tokens[++index];
      if (token === "\\e" && raw === "") return null;
      const normalized = normalizeAuthoritySeparator(
        raw,
        token === "\\e"
          ? ""
          : token === "\\g"
            ? DEFAULT_AUTHORITY_TABLE_SETTINGS.pageRangeSeparator
            : DEFAULT_AUTHORITY_TABLE_SETTINGS.pageListSeparator,
        token === "\\e",
      );
      if (normalized !== raw || (token !== "\\e" && !normalized)) return null;
      if (token === "\\e") candidate.entryPageSeparator = normalized;
      if (token === "\\g") candidate.pageRangeSeparator = normalized;
      if (token === "\\l") candidate.pageListSeparator = normalized;
    } else {
      // Bookmark/sequence-number scopes and presentation-only format switches
      // need additional native authority and remain unsupported, fail-closed.
      return null;
    }
  }
  return hasCategory ? normalizeAuthorityTableSettings(candidate) : null;
}
