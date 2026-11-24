/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { documentLengthUnit } from "../../../../lib/document-length-fields";

export const DOCUMENT_TABLE_LAYOUT_POLICY_SCHEMA_VERSION = 1 as const;

export const DOCUMENT_TABLE_MIN_COLUMNS = 1;
export const DOCUMENT_TABLE_MAX_COLUMNS = 63;
export const DOCUMENT_TABLE_MIN_ROWS = 1;
export const DOCUMENT_TABLE_MAX_ROWS = 32_767;
// TipTap tables materialize one ProseMirror cell node per grid cell. Keep the
// synchronous insertion path aligned with the existing Docs paste/text-table
// safety budget until a virtual/sparse table model exists.
export const DOCUMENT_TABLE_MAX_SYNCHRONOUS_CELLS = 5_000;

// Word 16.86 accepted 0.42 cm as the smallest fixed initial column width.
export const DOCUMENT_TABLE_MIN_FIXED_WIDTH_TWIPS = 238;
// The observed dialog ceiling is approximately 55.87 cm for the whole table.
export const DOCUMENT_TABLE_MAX_TOTAL_WIDTH_TWIPS = 31_680;
export const DOCUMENT_TABLE_DENSE_REPRESENTATION = "dense_v1" as const;
export const DOCUMENT_TABLE_POLICY_NAMESPACE =
  "urn:mrnote:document-table-layout:2026";

export const DOCUMENT_TABLE_INSERT_PREFERENCE_STORAGE_KEY =
  "mrnote.docs.table-insert-preference.v1";

export type DocumentTableLayoutMode =
  "initial_auto" | "initial_fixed" | "autofit_contents" | "autofit_window";

export type DocumentTableRepresentation =
  typeof DOCUMENT_TABLE_DENSE_REPRESENTATION;

export interface DocumentTableLayoutPolicy {
  readonly schemaVersion: typeof DOCUMENT_TABLE_LAYOUT_POLICY_SCHEMA_VERSION;
  readonly mode: DocumentTableLayoutMode;
  readonly fixedWidthTwips?: number;
}

export type DocumentTableDenseAdmissionReason =
  | "unsupported_representation"
  | "rows_out_of_range"
  | "columns_out_of_range"
  | "dense_cell_budget_exceeded"
  | "invalid_layout_policy"
  | "fixed_width_total_exceeded";

export type DocumentTableDenseAdmission =
  | {
      readonly ok: true;
      readonly representation: DocumentTableRepresentation;
      readonly rows: number;
      readonly columns: number;
      readonly cellCount: number;
      readonly policy: DocumentTableLayoutPolicy | null;
    }
  | {
      readonly ok: false;
      readonly reason: DocumentTableDenseAdmissionReason;
    };

export class DocumentTableDenseAdmissionError extends Error {
  readonly code = "document_table_dense_admission_failed";

  constructor(readonly reason: DocumentTableDenseAdmissionReason) {
    super(reason);
    this.name = "DocumentTableDenseAdmissionError";
  }
}

export interface DocumentTableInsertPreference {
  readonly schemaVersion: typeof DOCUMENT_TABLE_LAYOUT_POLICY_SCHEMA_VERSION;
  readonly columns: number;
  readonly rows: number;
  readonly policy: DocumentTableLayoutPolicy;
}

export const DEFAULT_DOCUMENT_TABLE_INSERT_PREFERENCE: DocumentTableInsertPreference =
  Object.freeze({
    schemaVersion: DOCUMENT_TABLE_LAYOUT_POLICY_SCHEMA_VERSION,
    columns: 3,
    rows: 3,
    policy: Object.freeze({
      schemaVersion: DOCUMENT_TABLE_LAYOUT_POLICY_SCHEMA_VERSION,
      mode: "initial_auto" as const,
    }),
  });

export interface DocumentTableDimensionValidation {
  readonly value: number | null;
  readonly error: "required" | "integer" | "range" | null;
}

export interface DocumentTableWidthValidation {
  readonly policy: DocumentTableLayoutPolicy | null;
  readonly error: "required" | "number" | "range" | null;
  readonly minimumTwips: number;
  readonly maximumTwips: number;
}

export function isDocumentTableLayoutMode(
  value: unknown,
): value is DocumentTableLayoutMode {
  return (
    value === "initial_auto" ||
    value === "initial_fixed" ||
    value === "autofit_contents" ||
    value === "autofit_window"
  );
}

export function normalizeDocumentTableLayoutPolicy(
  value: unknown,
): DocumentTableLayoutPolicy | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.schemaVersion !== DOCUMENT_TABLE_LAYOUT_POLICY_SCHEMA_VERSION ||
    !isDocumentTableLayoutMode(candidate.mode)
  ) {
    return null;
  }
  if (candidate.mode !== "initial_fixed") {
    return {
      schemaVersion: DOCUMENT_TABLE_LAYOUT_POLICY_SCHEMA_VERSION,
      mode: candidate.mode,
    };
  }
  const fixedWidthTwips = candidate.fixedWidthTwips;
  if (
    typeof fixedWidthTwips !== "number" ||
    !Number.isInteger(fixedWidthTwips) ||
    fixedWidthTwips < DOCUMENT_TABLE_MIN_FIXED_WIDTH_TWIPS ||
    fixedWidthTwips > DOCUMENT_TABLE_MAX_TOTAL_WIDTH_TWIPS
  ) {
    return null;
  }
  return {
    schemaVersion: DOCUMENT_TABLE_LAYOUT_POLICY_SCHEMA_VERSION,
    mode: "initial_fixed",
    fixedWidthTwips,
  };
}

export function documentTableRepresentationFromNodeAttrs(
  attrs: Record<string, unknown> | null | undefined,
): DocumentTableRepresentation | null {
  const value = attrs?.tableRepresentation;
  // Existing documents predate the explicit representation attribute and are
  // dense by construction. Any future/unknown explicit value is rejected so a
  // sparse payload can never be routed into dense algorithms by accident.
  if (value === null || value === undefined) {
    return DOCUMENT_TABLE_DENSE_REPRESENTATION;
  }
  return value === DOCUMENT_TABLE_DENSE_REPRESENTATION
    ? DOCUMENT_TABLE_DENSE_REPRESENTATION
    : null;
}

export function validateDocumentTableDenseAdmission(input: {
  readonly representation?: unknown;
  readonly rows: number;
  readonly columns: number;
  readonly policy?: unknown;
}): DocumentTableDenseAdmission {
  const representation =
    input.representation === null || input.representation === undefined
      ? DOCUMENT_TABLE_DENSE_REPRESENTATION
      : input.representation;
  if (representation !== DOCUMENT_TABLE_DENSE_REPRESENTATION) {
    return { ok: false, reason: "unsupported_representation" };
  }
  if (
    !Number.isInteger(input.rows) ||
    input.rows < DOCUMENT_TABLE_MIN_ROWS ||
    input.rows > DOCUMENT_TABLE_MAX_ROWS
  ) {
    return { ok: false, reason: "rows_out_of_range" };
  }
  if (
    !Number.isInteger(input.columns) ||
    input.columns < DOCUMENT_TABLE_MIN_COLUMNS ||
    input.columns > DOCUMENT_TABLE_MAX_COLUMNS
  ) {
    return { ok: false, reason: "columns_out_of_range" };
  }
  const cellCount = input.rows * input.columns;
  if (
    !Number.isSafeInteger(cellCount) ||
    cellCount > DOCUMENT_TABLE_MAX_SYNCHRONOUS_CELLS
  ) {
    return { ok: false, reason: "dense_cell_budget_exceeded" };
  }
  const policy =
    input.policy === null || input.policy === undefined
      ? null
      : normalizeDocumentTableLayoutPolicy(input.policy);
  if (input.policy !== null && input.policy !== undefined && policy === null) {
    return { ok: false, reason: "invalid_layout_policy" };
  }
  if (
    policy?.mode === "initial_fixed" &&
    (policy.fixedWidthTwips ?? 0) * input.columns >
      DOCUMENT_TABLE_MAX_TOTAL_WIDTH_TWIPS
  ) {
    return { ok: false, reason: "fixed_width_total_exceeded" };
  }
  return {
    ok: true,
    representation: DOCUMENT_TABLE_DENSE_REPRESENTATION,
    rows: input.rows,
    columns: input.columns,
    cellCount,
    policy,
  };
}

export function assertDocumentTableDenseAdmission(input: {
  readonly representation?: unknown;
  readonly rows: number;
  readonly columns: number;
  readonly policy?: unknown;
}): Extract<DocumentTableDenseAdmission, { readonly ok: true }> {
  const result = validateDocumentTableDenseAdmission(input);
  if (!result.ok) throw new DocumentTableDenseAdmissionError(result.reason);
  return result;
}

export function documentTablePolicyFromNodeAttrs(
  attrs: Record<string, unknown> | null | undefined,
): DocumentTableLayoutPolicy | null {
  if (!attrs || !isDocumentTableLayoutMode(attrs.tableLayoutPolicy))
    return null;
  return normalizeDocumentTableLayoutPolicy({
    schemaVersion: DOCUMENT_TABLE_LAYOUT_POLICY_SCHEMA_VERSION,
    mode: attrs.tableLayoutPolicy,
    fixedWidthTwips: attrs.tableFixedWidthTwips,
  });
}

export function documentTablePolicyNodeAttrs(
  policy: DocumentTableLayoutPolicy,
): {
  tableRepresentation: DocumentTableRepresentation;
  tableLayoutPolicy: DocumentTableLayoutMode;
  tableFixedWidthTwips: number | null;
} {
  const normalized = normalizeDocumentTableLayoutPolicy(policy);
  if (!normalized) {
    throw new TypeError("Invalid document table layout policy");
  }
  return {
    tableRepresentation: DOCUMENT_TABLE_DENSE_REPRESENTATION,
    tableLayoutPolicy: normalized.mode,
    tableFixedWidthTwips:
      normalized.mode === "initial_fixed"
        ? (normalized.fixedWidthTwips ?? null)
        : null,
  };
}

export function validateDocumentTableDimension(
  draft: string,
  minimum: number,
  maximum: number,
): DocumentTableDimensionValidation {
  const trimmed = draft.trim();
  if (!trimmed) return { value: null, error: "required" };
  if (!/^\d+$/.test(trimmed)) return { value: null, error: "integer" };
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    return { value: null, error: "range" };
  }
  return { value, error: null };
}

export function maximumFixedColumnWidthTwips(columns: number): number {
  const safeColumns = Math.min(
    Math.max(Math.trunc(columns) || 1, DOCUMENT_TABLE_MIN_COLUMNS),
    DOCUMENT_TABLE_MAX_COLUMNS,
  );
  return Math.floor(DOCUMENT_TABLE_MAX_TOTAL_WIDTH_TWIPS / safeColumns);
}

// The unit of every Docs length field (lib/document-length-fields): inches
// for the app's US English ("en") as well as "en-US"; matching only a
// literal "en-US" showed centimetres here and inches in the ribbon.
export function documentTableMeasurementUnit(locale: string): "cm" | "in" {
  return documentLengthUnit(locale);
}

export function twipsToDocumentTableMeasurement(
  twips: number,
  unit: "cm" | "in",
): number {
  return unit === "in" ? twips / 1_440 : (twips * 2.54) / 1_440;
}

export function documentTableMeasurementToTwips(
  value: number,
  unit: "cm" | "in",
): number {
  return Math.round(unit === "in" ? value * 1_440 : (value / 2.54) * 1_440);
}

function localeDecimalSeparator(locale: string): string {
  try {
    const decimal = new Intl.NumberFormat(locale)
      .formatToParts(1.1)
      .find((part) => part.type === "decimal")?.value;
    return decimal || ".";
  } catch {
    return ".";
  }
}

function parseLocalizedDecimal(draft: string, locale: string): number | null {
  const trimmed = draft.trim();
  if (!trimmed) return null;
  const decimal = localeDecimalSeparator(locale);
  const normalized = decimal === "." ? trimmed : trimmed.replace(decimal, ".");
  // Grouping, exponent notation, signs and multiple separators are intentionally
  // rejected. The dialog is a bounded physical width, not a free-form number.
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return Number.NaN;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : Number.NaN;
}

export function validateDocumentTableFixedWidth(
  draft: string,
  locale: string,
  columns: number,
): DocumentTableWidthValidation {
  const minimumTwips = DOCUMENT_TABLE_MIN_FIXED_WIDTH_TWIPS;
  const maximumTwips = maximumFixedColumnWidthTwips(columns);
  const value = parseLocalizedDecimal(draft, locale);
  if (value === null) {
    return { policy: null, error: "required", minimumTwips, maximumTwips };
  }
  if (!Number.isFinite(value)) {
    return { policy: null, error: "number", minimumTwips, maximumTwips };
  }
  if (value === 0) {
    return {
      policy: {
        schemaVersion: DOCUMENT_TABLE_LAYOUT_POLICY_SCHEMA_VERSION,
        mode: "initial_auto",
      },
      error: null,
      minimumTwips,
      maximumTwips,
    };
  }
  const unit = documentTableMeasurementUnit(locale);
  const fixedWidthTwips = documentTableMeasurementToTwips(value, unit);
  if (fixedWidthTwips < minimumTwips || fixedWidthTwips > maximumTwips) {
    return { policy: null, error: "range", minimumTwips, maximumTwips };
  }
  return {
    policy: {
      schemaVersion: DOCUMENT_TABLE_LAYOUT_POLICY_SCHEMA_VERSION,
      mode: "initial_fixed",
      fixedWidthTwips,
    },
    error: null,
    minimumTwips,
    maximumTwips,
  };
}

export function formatDocumentTableWidth(
  twips: number,
  locale: string,
): string {
  const unit = documentTableMeasurementUnit(locale);
  const value = twipsToDocumentTableMeasurement(twips, unit);
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(value);
}

export function normalizeDocumentTableInsertPreference(
  value: unknown,
): DocumentTableInsertPreference | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const columns = validateDocumentTableDimension(
    String(candidate.columns ?? ""),
    DOCUMENT_TABLE_MIN_COLUMNS,
    DOCUMENT_TABLE_MAX_COLUMNS,
  ).value;
  const rows = validateDocumentTableDimension(
    String(candidate.rows ?? ""),
    DOCUMENT_TABLE_MIN_ROWS,
    DOCUMENT_TABLE_MAX_ROWS,
  ).value;
  const policy = normalizeDocumentTableLayoutPolicy(candidate.policy);
  const admission =
    columns !== null && rows !== null
      ? validateDocumentTableDenseAdmission({
          representation: DOCUMENT_TABLE_DENSE_REPRESENTATION,
          columns,
          rows,
          policy,
        })
      : null;
  if (
    candidate.schemaVersion !== DOCUMENT_TABLE_LAYOUT_POLICY_SCHEMA_VERSION ||
    columns === null ||
    rows === null ||
    !policy ||
    !admission?.ok
  ) {
    return null;
  }
  return {
    schemaVersion: DOCUMENT_TABLE_LAYOUT_POLICY_SCHEMA_VERSION,
    columns,
    rows,
    policy,
  };
}

export function loadDocumentTableInsertPreference(
  storage: Pick<Storage, "getItem"> | null | undefined,
): DocumentTableInsertPreference {
  if (!storage) return DEFAULT_DOCUMENT_TABLE_INSERT_PREFERENCE;
  try {
    const raw = storage.getItem(DOCUMENT_TABLE_INSERT_PREFERENCE_STORAGE_KEY);
    if (!raw) return DEFAULT_DOCUMENT_TABLE_INSERT_PREFERENCE;
    return (
      normalizeDocumentTableInsertPreference(JSON.parse(raw)) ??
      DEFAULT_DOCUMENT_TABLE_INSERT_PREFERENCE
    );
  } catch {
    return DEFAULT_DOCUMENT_TABLE_INSERT_PREFERENCE;
  }
}

export function saveDocumentTableInsertPreference(
  storage: Pick<Storage, "setItem"> | null | undefined,
  preference: DocumentTableInsertPreference,
): boolean {
  const normalized = normalizeDocumentTableInsertPreference(preference);
  if (!storage || !normalized) return false;
  try {
    storage.setItem(
      DOCUMENT_TABLE_INSERT_PREFERENCE_STORAGE_KEY,
      JSON.stringify(normalized),
    );
    return true;
  } catch {
    return false;
  }
}
