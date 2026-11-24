/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
export const PDF_VERIFIED_PDFA_MAX_OUTPUT_BYTES = 96 * 1024 * 1024;

export interface PdfVerifiedPdfaCapability {
  readonly sourceSha256: string;
  readonly pageCount: number;
  readonly profile: "2b";
  readonly eligible: boolean;
  readonly disabledReason: string | null;
  readonly converter: string | null;
  readonly verifier: string | null;
}

export function parsePdfVerifiedPdfaCapability(
  value: unknown,
  expectedSourceSha256: string,
  expectedPageCount: number,
): PdfVerifiedPdfaCapability | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    record.source_sha256 !== expectedSourceSha256 ||
    record.page_count !== expectedPageCount ||
    record.profile !== "2b" ||
    record.source_unchanged !== true ||
    typeof record.eligible !== "boolean" ||
    (record.disabled_reason !== null &&
      (typeof record.disabled_reason !== "string" ||
        record.disabled_reason.length < 1 ||
        record.disabled_reason.length > 500)) ||
    (record.converter !== null &&
      (typeof record.converter !== "string" ||
        !/^Ghostscript 10\.[0-9.]{1,20}$/.test(record.converter))) ||
    (record.verifier !== null && record.verifier !== "veraPDF 1.30.2")
  ) {
    return null;
  }
  if (
    record.eligible !==
    (record.disabled_reason === null &&
      typeof record.converter === "string" &&
      record.verifier === "veraPDF 1.30.2")
  ) {
    return null;
  }
  return Object.freeze({
    sourceSha256: expectedSourceSha256,
    pageCount: expectedPageCount,
    profile: "2b" as const,
    eligible: record.eligible,
    disabledReason: record.disabled_reason,
    converter: record.converter,
    verifier: record.verifier,
  });
}
