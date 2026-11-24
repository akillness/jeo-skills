/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Document MAIL MERGE (Word/WPS "邮件合并" parity) — pure logic.
 *
 * A user inserts MERGE FIELDS — inline `mergeField` atom nodes (see
 * mergeFieldExtension.tsx), each carrying a `field` = a DATA COLUMN NAME — into
 * the document and attaches a DATA SOURCE (a recipient table) parsed from pasted
 * CSV/TSV. Previewing a record swaps each field's displayed text to that record's
 * value; "Finish & Merge" substitutes the field nodes for a chosen row, yielding
 * the merged document JSON.
 *
 * The data source is persisted as an ADDITIVE optional field on the top-level
 * document node's `attrs.mailMergeData` (see mergeFieldExtension.tsx), shaped
 * `{ columns: string[]; rows: Record<string,string>[] }`, so existing documents —
 * which carry none — still validate and round-trip unchanged (the doc-attrs
 * schema is an open passthrough, see lib/native-page-schemas.ts). Byte-stable:
 * the attribute is only written once a user attaches recipients.
 *
 * Everything in THIS module is framework-free: it operates on plain JSON-shaped
 * values (the TipTap doc JSON, the merge-data record) so the parse / normalize /
 * substitute behaviour can be unit-tested headlessly. The TipTap node + extension
 * that wire this into the live editor live in mergeFieldExtension.tsx.
 *
 * SECURITY: every column name + cell value is user-supplied and round-trips
 * through persisted JSON. Field NAMES are restricted to an attribute-safe surface
 * (they ride a `data-merge-field` DOM attribute on the atom node) and clamped;
 * cell VALUES are stripped of control bytes and clamped, and are always rendered
 * as TEXT (the renderer escapes them). Counts/lengths are bounded so a forged
 * document can never smuggle markup, attribute-breaking payloads, or an unbounded
 * blob past this edge. Mirrors the citation/cross-reference models.
 *
 * External spreadsheet/email connectors remain deliberately outside this local
 * model: the attached table is a bounded snapshot.  Everything required to make
 * a deterministic local merge (merge type, recipient filter/sort, field mapping,
 * address/greeting composition and skip-if rules) is persisted alongside that
 * snapshot.  The final editable DOCX batch is built by mailMergeDocx.ts.
 */

import { parseCsv } from "../../../../lib/spreadsheet/csv";

/** The inline atom node name. Kept in a constant so the extension + tests agree. */
export const MERGE_FIELD_NODE_NAME = "mergeField";

/** The doc-level attribute key holding the recipient data source. */
export const MAIL_MERGE_DATA_ATTR = "mailMergeData";

/** Caps. Generous for real recipient lists but bound a forged / pasted blob. */
export const MAX_MERGE_COLUMNS = 256;
export const MAX_MERGE_ROWS = 10_000;
/** A field name rides a DOM attribute; bound its length so the attr stays sane. */
export const MAX_MERGE_FIELD_NAME_LENGTH = 128;
/** A single cell value is rendered as text; bound it so a forged blob is capped. */
export const MAX_MERGE_CELL_LENGTH = 4_000;

// A field NAME (column key) is a single-line label: strip the FULL C0/C1 + DEL
// control range (incl. tab/newline) and collapse whitespace runs so it can never
// break out of the `data-merge-field` attribute or inject markup. Written with
// \u escapes (NOT literal control bytes) so the intent is explicit.
const FIELD_NAME_CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]+/g;
// A cell VALUE may legitimately contain newlines (a multi-line address); strip
// only the non-newline control bytes (and the DEL/C1 range) so a value cannot
// smuggle markup yet a multi-line cell survives.
const CELL_CONTROL_RE =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]+/g;

/** The recipient data source: a column list + a list of row records. */
export interface MailMergeData {
  columns: string[];
  rows: Record<string, string>[];
  /** Optional V2 workflow metadata. Absent on legacy/unused documents. */
  settings?: MailMergeSettings;
}

/** A single record looked up for preview / merge: the row, plus its 1-based no. */
export interface MailMergeRecord {
  /** 1-based record number (1..rows.length). */
  number: number;
  values: Record<string, string>;
}

export const MAIL_MERGE_TYPES = [
  "letters",
  "email",
  "envelopes",
  "labels",
  "directory",
] as const;
export type MailMergeType = (typeof MAIL_MERGE_TYPES)[number];

export const MAIL_MERGE_FIELD_ROLES = [
  "title",
  "firstName",
  "lastName",
  "company",
  "address1",
  "address2",
  "city",
  "state",
  "postalCode",
  "country",
  "email",
] as const;
export type MailMergeFieldRole = (typeof MAIL_MERGE_FIELD_ROLES)[number];

export const MAIL_MERGE_FILTER_OPERATORS = [
  "eq",
  "ne",
  "contains",
  "notContains",
  "startsWith",
  "endsWith",
  "empty",
  "notEmpty",
] as const;
export type MailMergeFilterOperator =
  (typeof MAIL_MERGE_FILTER_OPERATORS)[number];

export interface MailMergeFilter {
  column: string;
  operator: MailMergeFilterOperator;
  value: string;
}

export interface MailMergeSort {
  column: string;
  direction: "asc" | "desc";
}

export interface MailMergeAddressBlockConfig {
  includeTitle: boolean;
  includeCompany: boolean;
  includeCountry: boolean;
}

export interface MailMergeGreetingLineConfig {
  salutation: string;
  nameFormat: "first" | "full" | "titleLast" | "last";
  punctuation: "comma" | "colon" | "none";
  fallback: string;
}

export interface MailMergeSettings {
  schemaVersion: 2;
  mergeType: MailMergeType;
  filters: MailMergeFilter[];
  sorts: MailMergeSort[];
  /** `null` is an explicit user choice to keep an auto-matched role unmapped. */
  fieldMapping: Partial<Record<MailMergeFieldRole, string | null>>;
  addressBlock: MailMergeAddressBlockConfig;
  greetingLine: MailMergeGreetingLineConfig;
  /** Records for which this condition is true are omitted from final output. */
  skipIf: MergeCondition | null;
}

export type MailMergeCompositionPart =
  | { kind: "field"; field: string }
  | { kind: "text"; text: string }
  | { kind: "break" };

const MERGE_TYPE_SET = new Set<string>(MAIL_MERGE_TYPES);
const FILTER_OPERATOR_SET = new Set<string>(MAIL_MERGE_FILTER_OPERATORS);

const FIELD_ROLE_ALIASES: Readonly<
  Record<MailMergeFieldRole, readonly string[]>
> = Object.freeze({
  title: ["title", "prefix", "salutation", "称谓", "头衔"],
  firstName: ["firstname", "first name", "givenname", "given name", "名"],
  lastName: ["lastname", "last name", "surname", "familyname", "姓"],
  company: ["company", "organization", "organisation", "单位", "公司"],
  address1: ["address1", "address 1", "street", "street1", "地址", "地址1"],
  address2: ["address2", "address 2", "street2", "地址2"],
  city: ["city", "town", "城市", "市"],
  state: ["state", "province", "region", "省", "州"],
  postalCode: ["postalcode", "postal code", "zip", "zipcode", "邮编"],
  country: ["country", "country/region", "国家", "国家地区"],
  email: ["email", "e-mail", "mail", "邮箱", "电子邮件"],
});

export function defaultMailMergeSettings(): MailMergeSettings {
  return {
    schemaVersion: 2,
    mergeType: "letters",
    filters: [],
    sorts: [],
    fieldMapping: {},
    addressBlock: {
      includeTitle: true,
      includeCompany: true,
      includeCountry: true,
    },
    greetingLine: {
      salutation: "Dear",
      nameFormat: "full",
      punctuation: "comma",
      fallback: "To whom it may concern",
    },
    skipIf: null,
  };
}

/**
 * Sanitize a merge-field NAME (a data column key). Strips control bytes, collapses
 * whitespace, trims, and clamps the length. Returns "" for anything that is not a
 * non-empty string after scrubbing, so a forged/blank name never reaches the DOM.
 */
export function sanitizeMergeFieldName(value: unknown): string {
  if (typeof value !== "string") return "";
  const cleaned = value
    .replace(FIELD_NAME_CONTROL_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  return cleaned.length > MAX_MERGE_FIELD_NAME_LENGTH
    ? cleaned.slice(0, MAX_MERGE_FIELD_NAME_LENGTH)
    : cleaned;
}

/**
 * Sanitize a single CELL value. Strips non-newline control bytes (a multi-line
 * value is preserved), normalizes CRLF/CR to LF, and clamps the length. Returns
 * "" for a non-string. Always rendered as TEXT by callers, so markup is kept
 * verbatim (the renderer escapes it); this only removes control bytes + bounds.
 */
export function sanitizeMergeCellValue(value: unknown): string {
  if (typeof value !== "string") return "";
  const cleaned = value.replace(/\r\n?/g, "\n").replace(CELL_CONTROL_RE, "");
  return cleaned.length > MAX_MERGE_CELL_LENGTH
    ? cleaned.slice(0, MAX_MERGE_CELL_LENGTH)
    : cleaned;
}

/**
 * Deduplicate + sanitize a column-name list. The first occurrence of any given
 * (sanitized) name wins; later duplicates and blanks are dropped. Caps the total
 * column count. A blank/duplicate column would make a row record ambiguous, so we
 * keep the column set unique. Always returns an array (never throws).
 */
export function normalizeMergeColumns(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of value) {
    if (out.length >= MAX_MERGE_COLUMNS) break;
    const name = sanitizeMergeFieldName(candidate);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

function normalizeMatchKey(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[\s_\-./]+/g, "")
    .trim();
}

/** Deterministically match common Word/WPS address roles to pasted headers. */
export function autoMatchMergeFields(
  columns: readonly string[],
): Partial<Record<MailMergeFieldRole, string>> {
  const normalized = columns.map((column) => ({
    column,
    key: normalizeMatchKey(column),
  }));
  const mapping: Partial<Record<MailMergeFieldRole, string>> = {};
  for (const role of MAIL_MERGE_FIELD_ROLES) {
    const aliases = FIELD_ROLE_ALIASES[role].map(normalizeMatchKey);
    const exact = normalized.find(({ key }) => aliases.includes(key));
    if (exact) mapping[role] = exact.column;
  }
  return mapping;
}

function normalizeMergeFilter(
  value: unknown,
  columns: readonly string[],
): MailMergeFilter | null {
  if (!value || typeof value !== "object") return null;
  const bag = value as Record<string, unknown>;
  const column = sanitizeMergeFieldName(bag.column);
  const operator = typeof bag.operator === "string" ? bag.operator : "";
  if (
    !column ||
    !columns.includes(column) ||
    !FILTER_OPERATOR_SET.has(operator)
  ) {
    return null;
  }
  return {
    column,
    operator: operator as MailMergeFilterOperator,
    value: sanitizeMergeCellValue(bag.value),
  };
}

function normalizeMergeSort(
  value: unknown,
  columns: readonly string[],
): MailMergeSort | null {
  if (!value || typeof value !== "object") return null;
  const bag = value as Record<string, unknown>;
  const column = sanitizeMergeFieldName(bag.column);
  if (!column || !columns.includes(column)) return null;
  return {
    column,
    direction: bag.direction === "desc" ? "desc" : "asc",
  };
}

/** Normalize the optional V2 workflow contract while keeping legacy rows valid. */
export function normalizeMailMergeSettings(
  value: unknown,
  columns: readonly string[],
): MailMergeSettings {
  const defaults = defaultMailMergeSettings();
  const bag =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const mergeType =
    typeof bag.mergeType === "string" && MERGE_TYPE_SET.has(bag.mergeType)
      ? (bag.mergeType as MailMergeType)
      : defaults.mergeType;
  const filters = (Array.isArray(bag.filters) ? bag.filters : [])
    .map((item) => normalizeMergeFilter(item, columns))
    .filter((item): item is MailMergeFilter => item !== null)
    .slice(0, 16);
  const sorts = (Array.isArray(bag.sorts) ? bag.sorts : [])
    .map((item) => normalizeMergeSort(item, columns))
    .filter((item): item is MailMergeSort => item !== null)
    .slice(0, 3);
  const suppliedMapping =
    bag.fieldMapping && typeof bag.fieldMapping === "object"
      ? (bag.fieldMapping as Record<string, unknown>)
      : {};
  const fieldMapping: Partial<Record<MailMergeFieldRole, string | null>> =
    autoMatchMergeFields(columns);
  for (const role of MAIL_MERGE_FIELD_ROLES) {
    if (!Object.prototype.hasOwnProperty.call(suppliedMapping, role)) continue;
    const field = sanitizeMergeFieldName(suppliedMapping[role]);
    fieldMapping[role] = field && columns.includes(field) ? field : null;
  }
  const addressBag =
    bag.addressBlock && typeof bag.addressBlock === "object"
      ? (bag.addressBlock as Record<string, unknown>)
      : {};
  const greetingBag =
    bag.greetingLine && typeof bag.greetingLine === "object"
      ? (bag.greetingLine as Record<string, unknown>)
      : {};
  const nameFormat = ["first", "full", "titleLast", "last"].includes(
    String(greetingBag.nameFormat),
  )
    ? (greetingBag.nameFormat as MailMergeGreetingLineConfig["nameFormat"])
    : defaults.greetingLine.nameFormat;
  const punctuation = ["comma", "colon", "none"].includes(
    String(greetingBag.punctuation),
  )
    ? (greetingBag.punctuation as MailMergeGreetingLineConfig["punctuation"])
    : defaults.greetingLine.punctuation;
  return {
    schemaVersion: 2,
    mergeType,
    filters,
    sorts,
    fieldMapping,
    addressBlock: {
      includeTitle:
        typeof addressBag.includeTitle === "boolean"
          ? addressBag.includeTitle
          : defaults.addressBlock.includeTitle,
      includeCompany:
        typeof addressBag.includeCompany === "boolean"
          ? addressBag.includeCompany
          : defaults.addressBlock.includeCompany,
      includeCountry:
        typeof addressBag.includeCountry === "boolean"
          ? addressBag.includeCountry
          : defaults.addressBlock.includeCountry,
    },
    greetingLine: {
      salutation:
        sanitizeMergeCellValue(greetingBag.salutation).trim() ||
        defaults.greetingLine.salutation,
      nameFormat,
      punctuation,
      fallback:
        sanitizeMergeCellValue(greetingBag.fallback).trim() ||
        defaults.greetingLine.fallback,
    },
    skipIf: normalizeMergeCondition(bag.skipIf),
  };
}

export function resolveMailMergeSettings(
  data: MailMergeData,
): MailMergeSettings {
  return normalizeMailMergeSettings(data.settings, data.columns);
}

export function withMailMergeSettings(
  data: MailMergeData,
  settings: unknown,
): MailMergeData {
  return normalizeMailMergeData({ ...data, settings });
}

/**
 * Normalize a recipient data source candidate to a clean {@link MailMergeData}.
 * Columns are deduped/sanitized; each row is projected onto exactly the known
 * columns (extra keys dropped, missing keys filled with ""), so every record has a
 * stable shape regardless of the raw input. Row count is capped. A source with no
 * usable columns collapses to empty (so a forged blob degrades to "no data").
 * Always returns a value (never throws).
 */
export function normalizeMailMergeData(value: unknown): MailMergeData {
  const record =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const columns = normalizeMergeColumns(record.columns);
  if (columns.length === 0) return { columns: [], rows: [] };

  const rawRows = Array.isArray(record.rows) ? record.rows : [];
  const rows: Record<string, string>[] = [];
  for (const rawRow of rawRows) {
    if (rows.length >= MAX_MERGE_ROWS) break;
    const source =
      rawRow && typeof rawRow === "object"
        ? (rawRow as Record<string, unknown>)
        : {};
    const projected: Record<string, string> = {};
    for (const column of columns) {
      projected[column] = sanitizeMergeCellValue(source[column]);
    }
    rows.push(projected);
  }
  const result: MailMergeData = { columns, rows };
  // Preserve byte stability for legacy documents: V2 metadata is emitted only
  // when it was explicitly present on the candidate.
  if (record.settings && typeof record.settings === "object") {
    result.settings = normalizeMailMergeSettings(record.settings, columns);
  }
  return result;
}

/**
 * Parse pasted CSV/TSV text into a {@link MailMergeData}. The delimiter is
 * auto-detected (a TAB anywhere in the first non-empty line → TSV, else CSV) and
 * routed through the shared {@link parseCsv} (quotes, embedded newlines, CRLF).
 * The FIRST row is the HEADER (column names); subsequent rows are records mapped
 * by column. Empty input — or a header with no usable column — yields empty data.
 *
 * Rows are padded/truncated to the header width so a short/long row never shifts
 * columns. Fully-empty trailing rows (a stray blank line) are skipped. Everything
 * is funneled through {@link normalizeMailMergeData} so the result is already
 * sanitized + capped.
 */
export function parseMailMergeText(input: unknown): MailMergeData {
  if (typeof input !== "string" || input.trim() === "") {
    return { columns: [], rows: [] };
  }
  const firstLine = input.split(/\r\n?|\n/, 1)[0] ?? "";
  const delimiter = firstLine.includes("\t") ? "\t" : ",";
  const grid = parseCsv(input, delimiter);
  if (grid.length === 0) return { columns: [], rows: [] };

  const header = grid[0] ?? [];
  const columns = normalizeMergeColumns(header);
  if (columns.length === 0) return { columns: [], rows: [] };

  // Map each subsequent grid row onto the header columns BY POSITION (the i-th
  // column name gets the i-th cell). We key the projected record by column name;
  // when two header cells sanitize to the same name only the first column index
  // survives in `columns`, so we resolve each name back to its first header index.
  const headerSanitized = header.map((cell) => sanitizeMergeFieldName(cell));
  const columnIndex = new Map<string, number>();
  for (const column of columns) {
    columnIndex.set(column, headerSanitized.indexOf(column));
  }

  const rows: Record<string, unknown>[] = [];
  for (let r = 1; r < grid.length; r += 1) {
    const cells = grid[r] ?? [];
    // Skip a fully-empty row (a trailing blank line / spacer).
    if (cells.every((c) => c.trim() === "")) continue;
    const projected: Record<string, unknown> = {};
    for (const column of columns) {
      const idx = columnIndex.get(column) ?? -1;
      projected[column] = idx >= 0 ? (cells[idx] ?? "") : "";
    }
    rows.push(projected);
  }
  return normalizeMailMergeData({ columns, rows });
}

/**
 * Resolve a 1-based record number against the data's rows, returning the record
 * (number + its values) or null when out of range / no rows. Used by the preview
 * selector and by Finish & Merge to pick which row to substitute.
 */
export function getMergeRecord(
  data: MailMergeData,
  recordNumber: number,
): MailMergeRecord | null {
  if (!data.rows.length) return null;
  if (!Number.isInteger(recordNumber)) return null;
  if (recordNumber < 1 || recordNumber > data.rows.length) return null;
  return { number: recordNumber, values: data.rows[recordNumber - 1] };
}

function evaluateFilter(
  filter: MailMergeFilter,
  values: Record<string, string>,
): boolean {
  const cell = sanitizeMergeCellValue(values[filter.column]);
  switch (filter.operator) {
    case "eq":
      return cell === filter.value;
    case "ne":
      return cell !== filter.value;
    case "contains":
      return cell.includes(filter.value);
    case "notContains":
      return !cell.includes(filter.value);
    case "startsWith":
      return cell.startsWith(filter.value);
    case "endsWith":
      return cell.endsWith(filter.value);
    case "empty":
      return cell === "";
    case "notEmpty":
      return cell !== "";
  }
}

/**
 * Resolve the records that participate in preview/final output. Filters and a
 * skip-if rule are ANDed, then stable multi-key sorts are applied. `number`
 * remains the row's original 1-based number so preview navigation never points
 * at the wrong source row after sorting.
 */
export function selectMailMergeRecords(data: MailMergeData): MailMergeRecord[] {
  const normalized = normalizeMailMergeData(data);
  const settings = resolveMailMergeSettings(normalized);
  const records = normalized.rows
    .map((values, index) => ({ number: index + 1, values }))
    .filter((record) =>
      settings.filters.every((filter) => evaluateFilter(filter, record.values)),
    )
    .filter(
      (record) =>
        !settings.skipIf || !evaluateMergeCondition(settings.skipIf, record),
    );
  return records
    .map((record, stableIndex) => ({ record, stableIndex }))
    .sort((left, right) => {
      for (const sort of settings.sorts) {
        const compared = compareMergeValues(
          left.record.values[sort.column] ?? "",
          right.record.values[sort.column] ?? "",
        );
        if (compared !== 0)
          return sort.direction === "desc" ? -compared : compared;
      }
      return left.stableIndex - right.stableIndex;
    })
    .map(({ record }) => record);
}

function addFieldPart(
  parts: MailMergeCompositionPart[],
  mapping: Partial<Record<MailMergeFieldRole, string | null>>,
  role: MailMergeFieldRole,
): boolean {
  const field = sanitizeMergeFieldName(mapping[role]);
  if (!field) return false;
  parts.push({ kind: "field", field });
  return true;
}

function addSpacedFields(
  parts: MailMergeCompositionPart[],
  mapping: Partial<Record<MailMergeFieldRole, string | null>>,
  roles: readonly MailMergeFieldRole[],
): void {
  let wrote = false;
  for (const role of roles) {
    const field = sanitizeMergeFieldName(mapping[role]);
    if (!field) continue;
    if (wrote) parts.push({ kind: "text", text: " " });
    parts.push({ kind: "field", field });
    wrote = true;
  }
}

function addLineBreak(parts: MailMergeCompositionPart[]): void {
  if (parts.length > 0 && parts[parts.length - 1]?.kind !== "break") {
    parts.push({ kind: "break" });
  }
}

/** Build an editable address block from mapped native MERGEFIELD atoms. */
export function buildAddressBlockParts(
  data: MailMergeData,
): MailMergeCompositionPart[] {
  const settings = resolveMailMergeSettings(data);
  const mapping = settings.fieldMapping;
  const parts: MailMergeCompositionPart[] = [];
  addSpacedFields(
    parts,
    mapping,
    settings.addressBlock.includeTitle
      ? ["title", "firstName", "lastName"]
      : ["firstName", "lastName"],
  );
  addLineBreak(parts);
  if (
    settings.addressBlock.includeCompany &&
    addFieldPart(parts, mapping, "company")
  ) {
    addLineBreak(parts);
  }
  if (addFieldPart(parts, mapping, "address1")) addLineBreak(parts);
  if (addFieldPart(parts, mapping, "address2")) addLineBreak(parts);
  addSpacedFields(parts, mapping, ["city", "state", "postalCode"]);
  addLineBreak(parts);
  if (settings.addressBlock.includeCountry)
    addFieldPart(parts, mapping, "country");
  while (parts[parts.length - 1]?.kind === "break") parts.pop();
  return parts;
}

/** Build an editable greeting line from literal text + mapped MERGEFIELD atoms. */
export function buildGreetingLineParts(
  data: MailMergeData,
): MailMergeCompositionPart[] {
  const settings = resolveMailMergeSettings(data);
  const mapping = settings.fieldMapping;
  const config = settings.greetingLine;
  const roles: readonly MailMergeFieldRole[] =
    config.nameFormat === "first"
      ? ["firstName"]
      : config.nameFormat === "last"
        ? ["lastName"]
        : config.nameFormat === "titleLast"
          ? ["title", "lastName"]
          : ["firstName", "lastName"];
  const hasMappedName = roles.some((role) => Boolean(mapping[role]));
  if (!hasMappedName) {
    return [{ kind: "text", text: config.fallback }];
  }
  const parts: MailMergeCompositionPart[] = [];
  if (config.salutation)
    parts.push({ kind: "text", text: `${config.salutation} ` });
  addSpacedFields(parts, mapping, roles);
  if (config.punctuation === "comma") parts.push({ kind: "text", text: "," });
  if (config.punctuation === "colon") parts.push({ kind: "text", text: ":" });
  return parts;
}

/**
 * Resolve the DISPLAY text for a merge field against a record (or null for "no
 * record selected"). With a record, an empty/missing column value renders as ""
 * (Word shows nothing for an empty merge value). With no record — or for a field
 * whose name is not a known column — the field DEGRADES to its «placeholder» so
 * the marker is never invisible. `record` being null means "show the placeholder"
 * (the un-previewed editing state).
 */
export function resolveMergeFieldDisplay(
  fieldName: unknown,
  record: MailMergeRecord | null,
): string {
  const name = sanitizeMergeFieldName(fieldName);
  if (!name) return mergeFieldPlaceholder(name);
  if (!record) return mergeFieldPlaceholder(name);
  // An UNBOUND field (its column is not in the record) degrades to the
  // placeholder so a typo'd / stale field name is visible, not silently blank.
  if (!Object.prototype.hasOwnProperty.call(record.values, name)) {
    return mergeFieldPlaceholder(name);
  }
  return sanitizeMergeCellValue(record.values[name]);
}

/**
 * The «FieldName» placeholder shown for a merge field when no record is being
 * previewed (or the field is unbound). Mirrors Word's chevron-guillemet field
 * chrome. A blank name yields a neutral «» so the atom is still visible.
 */
export function mergeFieldPlaceholder(fieldName: unknown): string {
  const name = sanitizeMergeFieldName(fieldName);
  return `«${name}»`;
}

/**
 * Conditional (IF) merge field (Word `{ IF field op value "trueText"
 * "falseText" }`): emits one of two literal texts based on comparing a data
 * column against a value for the merged record. Stored as a structured attr on
 * the same `mergeField` atom (so it rides the existing serialize / substitute /
 * sanitize edges); a node carries EITHER a plain `field` OR a `condition`.
 */
export const MERGE_CONDITION_OPS = [
  "eq",
  "ne",
  "gt",
  "lt",
  "ge",
  "le",
  "contains",
  "empty",
  "notEmpty",
] as const;
export type MergeConditionOp = (typeof MERGE_CONDITION_OPS)[number];
const MERGE_CONDITION_OP_SET = new Set<string>(MERGE_CONDITION_OPS);

export interface MergeCondition {
  /** Data column whose value is tested. */
  column: string;
  /** Comparison operator. */
  op: MergeConditionOp;
  /** Literal compared against (ignored for empty / notEmpty). */
  value: string;
  /** Emitted when the test passes. */
  trueText: string;
  /** Emitted when the test fails. */
  falseText: string;
}

/**
 * Validate + normalize an arbitrary value into a {@link MergeCondition}, or null
 * when structurally invalid (no usable column or unknown operator). Every text
 * field is scrubbed + clamped like a cell value so a forged condition can never
 * smuggle control bytes or an unbounded blob.
 */
export function normalizeMergeCondition(value: unknown): MergeCondition | null {
  if (!value || typeof value !== "object") return null;
  const bag = value as Record<string, unknown>;
  const column = sanitizeMergeFieldName(bag.column);
  if (!column) return null;
  const op = typeof bag.op === "string" ? bag.op : "";
  if (!MERGE_CONDITION_OP_SET.has(op)) return null;
  return {
    column,
    op: op as MergeConditionOp,
    value: sanitizeMergeCellValue(bag.value),
    trueText: sanitizeMergeCellValue(bag.trueText),
    falseText: sanitizeMergeCellValue(bag.falseText),
  };
}

/** Compare two scrubbed strings numerically when both parse as finite numbers,
 *  else by locale string order. Returns -1 / 0 / 1. */
function compareMergeValues(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (
    a.trim() !== "" &&
    b.trim() !== "" &&
    Number.isFinite(na) &&
    Number.isFinite(nb)
  ) {
    return na < nb ? -1 : na > nb ? 1 : 0;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Evaluate a conditional field for a record, returning the scrubbed true/false
 * text. With NO record (the un-previewed editing state) it degrades to a compact
 * «IF column» placeholder so the marker is visible, mirroring
 * {@link resolveMergeFieldDisplay}. An unbound column compares as "".
 */
export function resolveMergeConditionDisplay(
  condition: unknown,
  record: MailMergeRecord | null,
): string {
  const cond = normalizeMergeCondition(condition);
  if (!cond) return mergeConditionPlaceholder(condition);
  if (!record) return mergeConditionPlaceholder(condition);
  return evaluateMergeCondition(cond, record) ? cond.trueText : cond.falseText;
}

/** Evaluate a normalized IF/skip-if condition without converting it to text. */
export function evaluateMergeCondition(
  condition: unknown,
  record: MailMergeRecord,
): boolean {
  const cond = normalizeMergeCondition(condition);
  if (!cond) return false;
  const cell = Object.prototype.hasOwnProperty.call(record.values, cond.column)
    ? sanitizeMergeCellValue(record.values[cond.column])
    : "";
  switch (cond.op) {
    case "eq":
      return cell === cond.value;
    case "ne":
      return cell !== cond.value;
    case "contains":
      return cond.value !== "" && cell.includes(cond.value);
    case "empty":
      return cell === "";
    case "notEmpty":
      return cell !== "";
    case "gt":
      return compareMergeValues(cell, cond.value) > 0;
    case "lt":
      return compareMergeValues(cell, cond.value) < 0;
    case "ge":
      return compareMergeValues(cell, cond.value) >= 0;
    case "le":
      return compareMergeValues(cell, cond.value) <= 0;
    default:
      return false;
  }
}

/** The «IF column» placeholder for an un-previewed / malformed conditional. */
export function mergeConditionPlaceholder(condition: unknown): string {
  const cond = normalizeMergeCondition(condition);
  return cond ? `«IF ${cond.column}»` : "«IF»";
}

/**
 * Substitute the text RUNS of every `mergeField` atom in a document JSON tree for
 * the given record's values, returning a NEW doc JSON (the input is never
 * mutated). Each `mergeField` node is replaced by a plain `text` node carrying the
 * record's value for that field (an unbound field keeps its «placeholder» so a
 * typo is visible in the output). A field that resolves to "" is dropped entirely
 * (an empty text node is invalid in ProseMirror), matching Word's "nothing for an
 * empty value".
 *
 * PURE: a plain structural recursion over the JSON; given the same doc + record it
 * always yields the same output. The document's own `attrs` (incl. the
 * `mailMergeData` store) are preserved verbatim, so the merged copy is still a
 * valid document — callers that want a "data-stripped" final copy can clear the
 * attr themselves.
 */
export function mergeDocument(
  docJson: unknown,
  record: MailMergeRecord | null,
): unknown {
  return substituteNode(docJson, record);
}

/**
 * Produce the final-copy JSON used by DOCX export. Recipient metadata is removed
 * so a generated file cannot leak the whole address list; field atoms are
 * replaced by ordinary editable runs for the selected record.
 */
export function finalizeMergedDocument(
  docJson: unknown,
  record: MailMergeRecord,
): unknown {
  const merged = mergeDocument(docJson, record);
  if (!merged || typeof merged !== "object" || Array.isArray(merged))
    return merged;
  const document = merged as Record<string, unknown>;
  const attrs =
    document.attrs &&
    typeof document.attrs === "object" &&
    !Array.isArray(document.attrs)
      ? { ...(document.attrs as Record<string, unknown>) }
      : null;
  if (!attrs || !(MAIL_MERGE_DATA_ATTR in attrs)) return merged;
  delete attrs[MAIL_MERGE_DATA_ATTR];
  return Object.keys(attrs).length > 0
    ? { ...document, attrs }
    : Object.fromEntries(
        Object.entries(document).filter(([key]) => key !== "attrs"),
      );
}

/** Recursive worker for {@link mergeDocument}. Returns a fresh node (or null). */
function substituteNode(
  node: unknown,
  record: MailMergeRecord | null,
): unknown {
  if (Array.isArray(node)) {
    // Substitute each child; a mergeField that resolves to "" yields null and is
    // dropped so no empty text node is emitted into the content array.
    const out: unknown[] = [];
    for (const child of node) {
      const replaced = substituteChild(child, record);
      if (replaced !== null) out.push(replaced);
    }
    return out;
  }
  if (!node || typeof node !== "object") return node;
  const obj = node as Record<string, unknown>;
  const next: Record<string, unknown> = { ...obj };
  if (Array.isArray(obj.content)) {
    next.content = substituteNode(obj.content, record) as unknown[];
  }
  return next;
}

/**
 * Substitute a single child node: a `mergeField` atom becomes a `text` node with
 * the resolved value (or null when the value is ""), preserving any marks the
 * field carried so e.g. a bolded field stays bold. Any other node recurses.
 */
function substituteChild(
  child: unknown,
  record: MailMergeRecord | null,
): unknown {
  if (child && typeof child === "object" && !Array.isArray(child)) {
    const obj = child as Record<string, unknown>;
    if (obj.type === MERGE_FIELD_NODE_NAME) {
      const attrs = (obj.attrs ?? {}) as Record<string, unknown>;
      // A node carries EITHER a structured `condition` (IF field) or a plain
      // `field` (column name); the condition takes precedence when present.
      const text =
        attrs.condition != null
          ? resolveMergeConditionDisplay(attrs.condition, record)
          : resolveMergeFieldDisplay(attrs.field, record);
      if (!text) return null;
      const textNode: Record<string, unknown> = { type: "text", text };
      if (Array.isArray(obj.marks) && obj.marks.length > 0) {
        textNode.marks = obj.marks;
      }
      return textNode;
    }
  }
  return substituteNode(child, record);
}

/**
 * Count the `mergeField` atoms present in a document JSON tree. Used by the
 * toolbar to disable Finish & Merge when the document carries no fields (nothing
 * to substitute). PURE.
 */
export function countMergeFields(docJson: unknown): number {
  let count = 0;
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    if (obj.type === MERGE_FIELD_NODE_NAME) count += 1;
    if (Array.isArray(obj.content)) walk(obj.content);
  };
  walk(docJson);
  return count;
}
