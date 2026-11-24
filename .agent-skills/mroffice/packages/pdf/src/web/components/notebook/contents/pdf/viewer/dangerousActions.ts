/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type {
  PdfDangerousActionEvidence,
} from "../PdfDangerousActionSafeCopyDialog";
import type { PdfCompressionEvidenceSource } from "../../../../../lib/pdf/compress";

export const PDF_DANGEROUS_ACTION_SAFE_COPY_MAX_OUTPUT_BYTES = 160 * 1024 * 1024;
export const PDF_DANGEROUS_ACTION_INSPECTION_MAX_ACTIONS = 1_024;

export interface PdfDangerousActionInspection {
  readonly sourceSha256: string;
  readonly pageCount: number;
  readonly actions: readonly PdfDangerousActionEvidence[];
  readonly unsupportedActions: readonly PdfDangerousActionEvidence[];
  readonly eligible: boolean;
  readonly disabledReason: string | null;
}

export function parsePdfDangerousActionInspection(
  value: unknown,
  expectedSourceSha256: string,
  expectedPageCount: number,
): PdfDangerousActionInspection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    record.source_sha256 !== expectedSourceSha256 ||
    record.page_count !== expectedPageCount ||
    typeof record.eligible !== "boolean" ||
    (record.disabled_reason !== null &&
      typeof record.disabled_reason !== "string") ||
    !Array.isArray(record.actions) ||
    !Array.isArray(record.unsupported_actions) ||
    record.actions.length > PDF_DANGEROUS_ACTION_INSPECTION_MAX_ACTIONS ||
    record.unsupported_actions.length >
      PDF_DANGEROUS_ACTION_INSPECTION_MAX_ACTIONS
  ) {
    return null;
  }
  const parseActions = (
    entries: readonly unknown[],
  ): readonly PdfDangerousActionEvidence[] | null => {
    const parsed: PdfDangerousActionEvidence[] = [];
    for (const entry of entries) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }
      const action = entry as Record<string, unknown>;
      if (
        typeof action.kind !== "string" ||
        !/^[A-Za-z0-9_-]{1,64}$/.test(action.kind) ||
        typeof action.location !== "string" ||
        action.location.length < 1 ||
        action.location.length > 512
      ) {
        return null;
      }
      parsed.push(
        Object.freeze({ kind: action.kind, location: action.location }),
      );
    }
    return Object.freeze(parsed);
  };
  const actions = parseActions(record.actions);
  const unsupportedActions = parseActions(record.unsupported_actions);
  if (
    !actions ||
    !unsupportedActions ||
    (record.eligible &&
      (actions.length === 0 ||
        unsupportedActions.length > 0 ||
        record.disabled_reason !== null))
  ) {
    return null;
  }
  return Object.freeze({
    sourceSha256: expectedSourceSha256,
    pageCount: expectedPageCount,
    actions,
    unsupportedActions,
    eligible: record.eligible,
    disabledReason:
      typeof record.disabled_reason === "string"
        ? record.disabled_reason
        : null,
  });
}

export function pdfCompressionEvidenceSourceKey(
  source: PdfCompressionEvidenceSource | null | undefined,
): string | null {
  if (!source) return null;
  return source.kind === "data_item"
    ? `data_item:${source.datasetId}:${source.dataItemId}:${source.expectedSha256}`
    : `resource_version:${source.resourceId}:${source.resourceVersionId}:${source.expectedPageId ?? ""}:${source.expectedSha256}`;
}

export interface PdfDangerousActionSourceCustody {
  readonly key: string;
  readonly resourceId: string | null;
  readonly resourceVersionId: string | null;
  readonly expectedPageId: string | null;
}

export function resolvePdfDangerousActionSourceCustody(
  source: PdfCompressionEvidenceSource | null | undefined,
  dataItemId: string,
  sourceSha256: string,
): PdfDangerousActionSourceCustody | null {
  if (!/^[a-f\d]{64}$/.test(sourceSha256)) return null;
  // A caller that does not participate in the host custody protocol retains
  // the original immutable DataItem route. PdfPageWindow passes null while
  // custody is unresolved, so it fails closed rather than silently falling
  // back from a displayed ResourceVersion to the original upload.
  if (source === undefined) {
    return Object.freeze({
      key: `data_item:legacy:${dataItemId}:${sourceSha256}`,
      resourceId: null,
      resourceVersionId: null,
      expectedPageId: null,
    });
  }
  if (!source || source.expectedSha256 !== sourceSha256) return null;
  if (source.kind === "data_item") {
    if (source.dataItemId !== dataItemId) return null;
    return Object.freeze({
      key: pdfCompressionEvidenceSourceKey(source)!,
      resourceId: null,
      resourceVersionId: null,
      expectedPageId: null,
    });
  }
  const expectedPageId = source.expectedPageId?.trim() ?? "";
  if (
    !source.resourceId.trim() ||
    !source.resourceVersionId.trim() ||
    !expectedPageId
  ) {
    return null;
  }
  return Object.freeze({
    key: pdfCompressionEvidenceSourceKey(source)!,
    resourceId: source.resourceId,
    resourceVersionId: source.resourceVersionId,
    expectedPageId,
  });
}

export function appendPdfDangerousActionSourceQuery(
  query: URLSearchParams,
  custody: PdfDangerousActionSourceCustody,
): void {
  if (!custody.resourceId) return;
  query.set("resource_id", custody.resourceId);
  query.set("resource_version_id", custody.resourceVersionId!);
  query.set("expected_page_id", custody.expectedPageId!);
}
