/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Pure helpers for the document PROPERTIES / METADATA (Word/WPS "File →
 * Properties" → docProps/core.xml + app.xml): Title, Author, Subject, Keywords
 * and Company, plus the optional Category and Cover Page Properties that
 * Word's cover pages bind to (see {@link DocumentMetadata}). A plain bag of single-line text fields persisted on the doc node
 * and round-tripped through the DOCX core/app properties parts.
 *
 * Kept free of any TipTap/React imports so the normalization can be unit-tested
 * in isolation and reused by:
 *   - the DocumentPageSetup node extension (parse/render of the persisted attr),
 *   - the DocumentToolbar "Document properties" dialog,
 *   - the DOCX exporter (docProps/core.xml `dc:title`/`dc:creator`/`dc:subject`/
 *     `cp:keywords` + docProps/app.xml `Company`), and
 *   - the DOCX importer (reading those same parts back).
 *
 * SECURITY: every field is sanitized — control characters are STRIPPED (never
 * merely escaped), newlines collapse to single spaces, the value is trimmed and
 * length-clamped — on BOTH parse and render. So neither a malicious paste, an AI
 * instruction, nor a stray import can smuggle markup, an XML-breaking payload, or
 * an unbounded string through a property. Literal angle brackets / quotes are
 * preserved verbatim (React escapes them on screen; the exporter XML-escapes
 * them), so only bytes that could actually break the DOM or the package are
 * removed.
 */

/** Hard upper bound for each metadata field (a generous single line). */
export const MAX_METADATA_FIELD_LENGTH = 255;

// C0 control characters (U+0000-U+001F incl. tab/newline/CR), DEL (U+007F), and
// the C1 control range (U+0080-U+009F). Stripped so a payload cannot break out of
// the exported XML or the on-screen field. Declared via \x escapes (never literal
// control bytes) so the source stays reviewable.
const CONTROL_CHARS_RE = /[\x00-\x1f\x7f-\x9f]/g;

/**
 * The document's editable metadata. Every field is OPTIONAL; an empty/absent
 * field is omitted from the exported package (and renders no value on screen).
 */
export interface DocumentMetadata {
  /** Document title (docProps/core.xml `dc:title`). */
  title: string;
  /** Author / creator (docProps/core.xml `dc:creator`). */
  author: string;
  /** Subject (docProps/core.xml `dc:subject`). */
  subject: string;
  /** Keywords / tags (docProps/core.xml `cp:keywords`). */
  keywords: string;
  /** Company (docProps/app.xml `Company`). */
  company: string;
  /**
   * The properties Word's cover pages bind to beyond the five above: the core
   * `cp:category`, and the Cover Page Properties store (a customXml part in
   * the `http://schemas.microsoft.com/office/2006/coverPageProps` namespace).
   * Each is present ONLY when non-empty, so a document that never set one
   * keeps its five-field bag byte-for-byte.
   */
  category?: string;
  abstract?: string;
  publishDate?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyFax?: string;
  companyEmail?: string;
}

/** The optional properties, in the order the exporters write them. */
export const EXTENDED_DOCUMENT_METADATA_KEYS = [
  "category",
  "abstract",
  "publishDate",
  "companyAddress",
  "companyPhone",
  "companyFax",
  "companyEmail",
] as const;

export type ExtendedDocumentMetadataKey =
  (typeof EXTENDED_DOCUMENT_METADATA_KEYS)[number];

/** Every property a document-property control can bind to. */
export type DocumentMetadataKey =
  | "title"
  | "author"
  | "subject"
  | "keywords"
  | "company"
  | ExtendedDocumentMetadataKey;

/**
 * Word's abstract is a paragraph of prose, not a label: it gets a longer
 * bound than the single-line fields (still one line: the cover's Abstract
 * control is plain text).
 */
export const MAX_METADATA_ABSTRACT_LENGTH = 2_000;

/** An all-empty metadata bag — the "nothing set" baseline. */
export const EMPTY_DOCUMENT_METADATA: DocumentMetadata = {
  title: "",
  author: "",
  subject: "",
  keywords: "",
  company: "",
};

/**
 * Sanitize a single metadata field into a safe, single-line plain string: drop
 * control characters (including newlines/tabs), collapse whitespace runs to a
 * single space, trim, and clamp the length. Returns `""` when nothing usable
 * remains. Mirrors {@link sanitizeHeaderFooterText} in headerFooter.ts.
 */
export function sanitizeMetadataField(
  value: unknown,
  maxLength: number = MAX_METADATA_FIELD_LENGTH,
): string {
  if (typeof value !== "string") return "";
  return value
    .replace(CONTROL_CHARS_RE, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/** The bound one metadata key is sanitized to. */
export function metadataFieldMaxLength(key: DocumentMetadataKey): number {
  return key === "abstract"
    ? MAX_METADATA_ABSTRACT_LENGTH
    : MAX_METADATA_FIELD_LENGTH;
}

/**
 * Normalize an arbitrary value into a fully-sanitized {@link DocumentMetadata}.
 * Every field is funneled through {@link sanitizeMetadataField}; a non-object (or
 * any missing field) yields the empty value for that field. Pure, so the doc
 * attr, the toolbar dialog, the exporter and the tests all share it.
 */
export function normalizeDocumentMetadata(value: unknown): DocumentMetadata {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const normalized: DocumentMetadata = {
    title: sanitizeMetadataField(raw.title),
    author: sanitizeMetadataField(raw.author),
    subject: sanitizeMetadataField(raw.subject),
    keywords: sanitizeMetadataField(raw.keywords),
    company: sanitizeMetadataField(raw.company),
  };
  for (const key of EXTENDED_DOCUMENT_METADATA_KEYS) {
    const value = sanitizeMetadataField(raw[key], metadataFieldMaxLength(key));
    if (value) normalized[key] = value;
  }
  return normalized;
}

/** One property of a normalized bag ("" when unset). */
export function documentMetadataValue(
  metadata: DocumentMetadata,
  key: DocumentMetadataKey,
): string {
  return metadata[key] ?? "";
}

/**
 * The bag with one property replaced (an empty value removes an optional
 * property), normalized; `null` when nothing is left. The edge every bound
 * control writes through, so two controls bound to one property can never
 * disagree about its value.
 */
export function documentMetadataWith(
  value: unknown,
  key: DocumentMetadataKey,
  next: string,
): DocumentMetadata | null {
  return normalizeDocumentMetadataOrNull({
    ...normalizeDocumentMetadata(value),
    [key]: next,
  });
}

/**
 * Whether a normalized metadata bag carries ANY non-empty field. Drives "should
 * the doc attr / the exported parts be emitted at all" — an all-empty bag is
 * treated as "unset" so a metadata-free document stays byte-for-byte unchanged.
 */
export function hasAnyMetadata(metadata: DocumentMetadata): boolean {
  return (
    metadata.title.length > 0 ||
    metadata.author.length > 0 ||
    metadata.subject.length > 0 ||
    metadata.keywords.length > 0 ||
    metadata.company.length > 0 ||
    EXTENDED_DOCUMENT_METADATA_KEYS.some((key) => Boolean(metadata[key]))
  );
}

/**
 * Normalize a value and return it ONLY when it carries at least one non-empty
 * field; otherwise return `null` (so a storage edge can persist `null` for "no
 * metadata" and keep a metadata-free document byte-for-byte unchanged). Pure.
 */
export function normalizeDocumentMetadataOrNull(
  value: unknown,
): DocumentMetadata | null {
  const normalized = normalizeDocumentMetadata(value);
  return hasAnyMetadata(normalized) ? normalized : null;
}
