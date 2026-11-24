/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { PdfOcrEgressPreflight } from "../PdfOcrPrivacyPreflight";
import type { PdfOcrReviewAnnotation } from "../../../../../lib/pdf/ocr-acceptance";
import { MAX_SPLIT_PAGES } from "../../../../../lib/pdf/range-spec";
import type { PdfDocument } from "./pdfApi";

export type PdfOcrDocumentAuthority = Readonly<{
  document: PdfDocument;
  dataItemId: string;
  url: string;
  byteGenerationKey: string;
  documentRevision: string | number;
  sourceSha256: string;
  /** The editable page whose current version the server bound these bytes
   * to; null when they are the upload itself. Sent with every OCR request. */
  pageId: string | null;
  pageNumber: number;
  pageCount: number;
}>;

export type PdfOcrExpectedSourceScope = Readonly<{
  dataItemId: string | null;
  url: string;
  byteGenerationKey: string;
  documentRevision: string | number;
  sourceSha256: string | null;
}>;

export type PdfOcrServerSourceAuthority = Readonly<{
  document: PdfDocument;
  dataItemId: string;
  url: string;
  byteGenerationKey: string;
  documentRevision: string | number;
  sourceSha256: string;
  /**
   * The loaded bytes are an edit of the upload and the server confirmed
   * them as this editable page's current version: OCR requests name the
   * page and bind to those bytes (识别文本 on an edited page, as in WPS).
   */
  pageId?: string;
  /**
   * The loaded bytes are the host-authenticated edited version of the
   * DataItem (a saved form value, stamp, ...) that the server could not
   * bind to a page's current version (no page, a revision not yet saved),
   * and the DataItem has no OCR text. Its native text is the document's
   * text (translation, find); server OCR stays unavailable.
   */
  derived?: true;
}>;

export type PendingPdfOcrPreflight = Readonly<{
  authority: PdfOcrDocumentAuthority;
  preflight: PdfOcrEgressPreflight;
}>;

export type PendingPdfOcrReview = Readonly<{
  authority: PdfOcrDocumentAuthority;
  annotation: PdfOcrReviewAnnotation;
}>;

export function samePdfOcrSourceAuthority(
  left: PdfOcrDocumentAuthority | null,
  right: PdfOcrDocumentAuthority | null,
): boolean {
  return (
    left !== null &&
    right !== null &&
    left.document === right.document &&
    left.dataItemId === right.dataItemId &&
    left.url === right.url &&
    left.byteGenerationKey === right.byteGenerationKey &&
    left.documentRevision === right.documentRevision &&
    left.sourceSha256 === right.sourceSha256 &&
    left.pageId === right.pageId &&
    left.pageCount === right.pageCount
  );
}

export function samePdfOcrDocumentAuthority(
  left: PdfOcrDocumentAuthority | null,
  right: PdfOcrDocumentAuthority | null,
): boolean {
  return (
    samePdfOcrSourceAuthority(left, right) &&
    left !== null &&
    right !== null &&
    left.pageNumber === right.pageNumber
  );
}

export function exactPdfOcrQueuePages(
  pageNumbers: readonly number[],
  pageCount: number,
): readonly number[] | null {
  if (
    pageNumbers.length < 1 ||
    pageNumbers.length > Math.min(pageCount, MAX_SPLIT_PAGES) ||
    !Number.isSafeInteger(pageCount) ||
    pageCount < 1
  ) {
    return null;
  }
  const exact = [...pageNumbers];
  for (let index = 0; index < exact.length; index += 1) {
    const pageNumber = exact[index];
    if (
      !Number.isSafeInteger(pageNumber) ||
      pageNumber < 1 ||
      pageNumber > pageCount ||
      (index > 0 && pageNumber <= exact[index - 1])
    ) {
      return null;
    }
  }
  return Object.freeze(exact);
}

export function parsePdfOcrDataItemSourceSha256(
  raw: unknown,
  expectedDataItemId: string,
): string | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const item = raw as Record<string, unknown>;
  return item.id === expectedDataItemId &&
    typeof item.sha256 === "string" &&
    /^[0-9a-f]{64}$/.test(item.sha256)
    ? item.sha256
    : null;
}

/**
 * Strict adapter for `/pdf-ocr-source`: the digest the server binds OCR to
 * for this page now (its current version, or the upload when it has none).
 */
export function parsePdfOcrPageSourceSha256(
  raw: unknown,
  expected: Readonly<{ dataItemId: string; pageId: string }>,
): string | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const source = raw as Record<string, unknown>;
  const keys = Object.keys(source).sort().join(",");
  return keys === "data_item_id,page_id,source,source_sha256" &&
    source.data_item_id === expected.dataItemId &&
    source.page_id === expected.pageId &&
    (source.source === "original" || source.source === "page_version") &&
    typeof source.source_sha256 === "string" &&
    /^[0-9a-f]{64}$/.test(source.source_sha256)
    ? source.source_sha256
    : null;
}

/** The OCR source endpoint a document authority is checked against. */
export function pdfOcrServerSourcePath(
  dataItemId: string,
  pageId: string | null | undefined,
): string {
  const item = `/api/v1/data-items/${encodeURIComponent(dataItemId)}`;
  return pageId
    ? `${item}/pdf-ocr-source?page_id=${encodeURIComponent(pageId)}`
    : item;
}
