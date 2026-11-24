/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Process-local authority for PDF commands that knowingly produce declared
 * loss.
 *
 * A receipt is intentionally opaque: its public shape carries no trusted
 * fields. The binding lives only in this module's WeakMap and is accepted once
 * for the exact document authority, host, command, loss set, and revisions that
 * were present when the user confirmed. Serialized lookalikes, booleans, stale
 * revisions, and replay all fail closed.
 *
 * Dialog Cancel and Esc are represented by `null`; this module does not issue
 * or mutate anything for either outcome.
 */

const MAX_BINDING_STRING_LENGTH = 512;
const MAX_LOSS_CODES = 256;

const documentAuthorityBrand: unique symbol = Symbol(
  "PdfCommandConsentDocumentAuthority",
);
const receiptBrand: unique symbol = Symbol("PdfCommandConsentReceipt");

export type PdfCommandConsentHost = "reader" | "native-editor";
export type PdfCommandConsentRevision = string | number;

export type PdfCommandConsentDocumentAuthority = Readonly<{
  [documentAuthorityBrand]: true;
}>;

export type PdfCommandConsentReceipt = Readonly<{
  [receiptBrand]: true;
}>;

export interface PdfCommandConsentBinding {
  readonly documentAuthority: PdfCommandConsentDocumentAuthority;
  readonly host: PdfCommandConsentHost;
  readonly featureId: string;
  readonly action: string;
  readonly lossCodes: readonly string[];
  readonly documentRevision: PdfCommandConsentRevision;
  readonly sourceRevision: PdfCommandConsentRevision;
  readonly editRevision: PdfCommandConsentRevision;
}

interface NormalizedPdfCommandConsentBinding {
  readonly documentAuthority: PdfCommandConsentDocumentAuthority;
  readonly host: PdfCommandConsentHost;
  readonly featureId: string;
  readonly action: string;
  readonly lossCodes: readonly string[];
  readonly documentRevision: PdfCommandConsentRevision;
  readonly sourceRevision: PdfCommandConsentRevision;
  readonly editRevision: PdfCommandConsentRevision;
}

const issuedDocumentAuthorities =
  new WeakSet<PdfCommandConsentDocumentAuthority>();
const issuedReceipts = new WeakMap<
  PdfCommandConsentReceipt,
  NormalizedPdfCommandConsentBinding
>();

function requireExactString(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_BINDING_STRING_LENGTH ||
    value !== value.trim() ||
    value.includes("\0")
  ) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function requireRevision(
  value: unknown,
  label: string,
): PdfCommandConsentRevision {
  if (typeof value === "string") return requireExactString(value, label);
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  throw new Error(`Invalid ${label}`);
}

function normalizeLossCodes(value: unknown): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_LOSS_CODES
  ) {
    throw new Error("Invalid PDF command consent loss codes");
  }

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    if (!(index in value)) {
      throw new Error("Invalid PDF command consent loss codes");
    }
    const code = requireExactString(
      value[index],
      `PDF command consent loss code ${index}`,
    );
    if (seen.has(code)) {
      throw new Error("Duplicate PDF command consent loss code");
    }
    seen.add(code);
    normalized.push(code);
  }

  normalized.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  return Object.freeze(normalized);
}

function normalizeBinding(
  value: PdfCommandConsentBinding,
): NormalizedPdfCommandConsentBinding {
  if (value === null || typeof value !== "object") {
    throw new Error("Invalid PDF command consent binding");
  }

  const documentAuthority = value.documentAuthority;
  if (
    documentAuthority === null ||
    typeof documentAuthority !== "object" ||
    !issuedDocumentAuthorities.has(documentAuthority)
  ) {
    throw new Error("Invalid PDF command consent document authority");
  }

  const host = value.host;
  if (host !== "reader" && host !== "native-editor") {
    throw new Error("Invalid PDF command consent host");
  }

  return Object.freeze({
    documentAuthority,
    host,
    featureId: requireExactString(
      value.featureId,
      "PDF command consent feature ID",
    ),
    action: requireExactString(value.action, "PDF command consent action"),
    lossCodes: normalizeLossCodes(value.lossCodes),
    documentRevision: requireRevision(
      value.documentRevision,
      "PDF command consent document revision",
    ),
    sourceRevision: requireRevision(
      value.sourceRevision,
      "PDF command consent source revision",
    ),
    editRevision: requireRevision(
      value.editRevision,
      "PDF command consent edit revision",
    ),
  });
}

function sameLossCodes(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((code, index) => code === right[index])
  );
}

function sameBinding(
  issued: NormalizedPdfCommandConsentBinding,
  expected: NormalizedPdfCommandConsentBinding,
): boolean {
  return (
    issued.documentAuthority === expected.documentAuthority &&
    issued.host === expected.host &&
    issued.featureId === expected.featureId &&
    issued.action === expected.action &&
    sameLossCodes(issued.lossCodes, expected.lossCodes) &&
    Object.is(issued.documentRevision, expected.documentRevision) &&
    Object.is(issued.sourceRevision, expected.sourceRevision) &&
    Object.is(issued.editRevision, expected.editRevision)
  );
}

/**
 * Create one private authority for one loaded PDF document instance.
 *
 * Callers must replace this authority when document custody changes. Identity,
 * not the empty runtime shape, is the trust boundary.
 */
export function createPdfCommandConsentDocumentAuthority(): PdfCommandConsentDocumentAuthority {
  const authority = Object.freeze(
    Object.create(null),
  ) as PdfCommandConsentDocumentAuthority;
  issuedDocumentAuthorities.add(authority);
  return authority;
}

/**
 * Issue a receipt only after the user confirmed the exact displayed loss set.
 *
 * Invalid or forged authority/binding input throws before any receipt exists.
 * The caller represents Cancel or Esc with `null` and does not call this
 * function.
 */
export function issuePdfCommandConsentReceipt(
  binding: PdfCommandConsentBinding,
): PdfCommandConsentReceipt {
  const normalized = normalizeBinding(binding);
  const receipt = Object.freeze(
    Object.create(null),
  ) as PdfCommandConsentReceipt;
  issuedReceipts.set(receipt, normalized);
  return receipt;
}

/**
 * Consume a receipt exactly once.
 *
 * A recognized receipt is retired before the expected binding is read. This
 * makes mismatch, malformed input, throwing getters, and re-entrant checks
 * terminal: none can probe a receipt and then retry it against a different
 * document or revision.
 */
export function consumePdfCommandConsentReceipt(
  receipt: unknown,
  expectedBinding: PdfCommandConsentBinding,
): boolean {
  if (receipt === null || typeof receipt !== "object") return false;

  const issued = issuedReceipts.get(receipt as PdfCommandConsentReceipt);
  if (!issued) return false;
  issuedReceipts.delete(receipt as PdfCommandConsentReceipt);

  try {
    return sameBinding(issued, normalizeBinding(expectedBinding));
  } catch {
    return false;
  }
}
