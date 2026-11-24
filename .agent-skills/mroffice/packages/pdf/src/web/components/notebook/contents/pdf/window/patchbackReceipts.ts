/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { PdfEngineSourceIdentity } from "../../../../../lib/pdf/engine/contracts";
import type {
  PdfNativeFileAttachmentAuthority,
  PdfNativeFileAttachmentRecord,
} from "../../../../../lib/pdf/native-file-attachment-roundtrip";
import {
  isPdfNativePageReplacementRecord,
  pdfNativePageReplacementTargetIndices,
  type PdfNativePageImportAuthority,
  type PdfNativePageImportRecord,
} from "../../../../../lib/pdf/native-page-import-roundtrip";
import type {
  PdfNativeListTextPatchbackAuthority,
} from "../../../../../lib/pdf/engine/native/list-text-command-lifecycle";
import type {
  PdfPatchbackIncompleteMarker,
  PdfPatchbackRepairAuth,
  PageItem,
} from "@mrnote/core/web/lib/notebook-sdk.ts";
import type {
  PdfNativeReceiptIdentity,
} from "../../../../../lib/pdf/native-receipt-journal";

export interface PdfPatchbackReceiptSnapshot {
  readonly status: unknown;
  readonly adapter: unknown;
  readonly resourceId: unknown;
  readonly resourceVersionId: unknown;
  readonly outputSha256: unknown;
  readonly patchedAnchorCount: unknown;
  readonly lossEntryCount: unknown;
  readonly reason: unknown;
  /** The worker's check of a revision the browser's engine published, run
   * after the save: ``{status: "pending" | "verified" | "failed", ...}``. */
  readonly verification: unknown;
}

export function readPdfPatchbackReceiptValue(savedPage: PageItem): unknown {
  const receiptDescriptor = Object.getOwnPropertyDescriptor(
    savedPage,
    "editable_page_patchback",
  );
  if (
    !receiptDescriptor ||
    !("value" in receiptDescriptor) ||
    !receiptDescriptor.enumerable
  ) {
    return null;
  }
  return receiptDescriptor.value;
}

export function readPdfPatchbackReceiptSnapshot(
  savedPage: PageItem,
): PdfPatchbackReceiptSnapshot | null {
  try {
    const receipt = readPdfPatchbackReceiptValue(savedPage);
    if (!receipt || typeof receipt !== "object") return null;
    const descriptors = Object.getOwnPropertyDescriptors(receipt);
    const snapshot = (key: string): unknown => {
      const descriptor = descriptors[key];
      return descriptor && descriptor.enumerable && "value" in descriptor
        ? descriptor.value
        : undefined;
    };
    return Object.freeze({
      status: snapshot("status"),
      adapter: snapshot("adapter"),
      resourceId: snapshot("resource_id"),
      resourceVersionId: snapshot("resource_version_id"),
      outputSha256: snapshot("output_sha256"),
      patchedAnchorCount: snapshot("patched_anchor_count"),
      lossEntryCount: snapshot("loss_entry_count"),
      reason: snapshot("reason"),
      verification: snapshot("verification"),
    });
  } catch {
    return null;
  }
}

export const PDF_PATCHBACK_SHA256_PATTERN = /^[0-9a-f]{64}$/;

export function readPdfNativeListTextPatchbackAuthority(
  receipt: PdfPatchbackReceiptSnapshot | null,
): PdfNativeListTextPatchbackAuthority | null {
  const resourceId = receipt?.resourceId;
  const resourceVersionId = receipt?.resourceVersionId;
  const outputSha256 =
    typeof receipt?.outputSha256 === "string"
      ? receipt.outputSha256.toLowerCase()
      : "";
  if (
    receipt?.status !== "succeeded" ||
    receipt.adapter !== "pdf" ||
    typeof resourceId !== "string" ||
    resourceId.length === 0 ||
    typeof resourceVersionId !== "string" ||
    resourceVersionId.length === 0 ||
    !PDF_PATCHBACK_SHA256_PATTERN.test(outputSha256) ||
    receipt.lossEntryCount !== 0 ||
    !Number.isSafeInteger(receipt.patchedAnchorCount) ||
    Number(receipt.patchedAnchorCount) < 1
  ) {
    return null;
  }
  return Object.freeze({ resourceId, resourceVersionId, outputSha256 });
}

export function samePdfNativeReceipt(
  left: PdfNativeReceiptIdentity | null,
  right: PdfNativeReceiptIdentity | null,
): boolean {
  return Boolean(
    left &&
      right &&
      left.resourceId === right.resourceId &&
      left.resourceVersionId === right.resourceVersionId &&
      left.outputSha256 === right.outputSha256,
  );
}

export const PDF_NATIVE_ATTACHMENT_MIME_BY_EXTENSION: Readonly<
  Record<string, string>
> = Object.freeze({
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  txt: "text/plain",
  log: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  json: "application/json",
  rtf: "application/rtf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
});
export function canonicalPdfNativeAttachmentMime(file: File): string | null {
  const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
  const inferred = PDF_NATIVE_ATTACHMENT_MIME_BY_EXTENSION[extension] ?? null;
  const declared = file.type.trim().toLowerCase();
  if (declared && inferred && declared !== inferred) return null;
  return inferred;
}

export function hasExactPdfNativeAttachmentReceipt(
  savedPage: PageItem,
  source: PdfEngineSourceIdentity,
): boolean {
  const receipt = readPdfPatchbackReceiptSnapshot(savedPage);
  return Boolean(
    receipt?.status === "succeeded" &&
    receipt.adapter === "pdf" &&
    receipt.resourceId === source.resourceId &&
    typeof receipt.resourceVersionId === "string" &&
    receipt.resourceVersionId.length > 0 &&
    receipt.resourceVersionId !== source.resourceVersionId &&
    typeof receipt.outputSha256 === "string" &&
    PDF_PATCHBACK_SHA256_PATTERN.test(receipt.outputSha256) &&
    receipt.outputSha256 !== source.sourceSha256 &&
    receipt.lossEntryCount === 0 &&
    receipt.patchedAnchorCount === 1,
  );
}

export function samePdfNativeFileAttachmentRecords(
  left: readonly PdfNativeFileAttachmentRecord[],
  right: readonly PdfNativeFileAttachmentRecord[],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function hasExactPdfNativePageImportReceipt(
  savedPage: PageItem,
  source: PdfEngineSourceIdentity,
  importedPageCount: number,
): boolean {
  const receipt = readPdfPatchbackReceiptSnapshot(savedPage);
  return Boolean(
    receipt?.status === "succeeded" &&
    receipt.adapter === "pdf" &&
    receipt.resourceId === source.resourceId &&
    typeof receipt.resourceVersionId === "string" &&
    receipt.resourceVersionId.length > 0 &&
    receipt.resourceVersionId !== source.resourceVersionId &&
    typeof receipt.outputSha256 === "string" &&
    PDF_PATCHBACK_SHA256_PATTERN.test(receipt.outputSha256) &&
    receipt.outputSha256 !== source.sourceSha256 &&
    receipt.lossEntryCount === 0 &&
    receipt.patchedAnchorCount === importedPageCount,
  );
}

export function samePdfNativePageImportRecords(
  left: readonly PdfNativePageImportRecord[],
  right: readonly PdfNativePageImportRecord[],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function hasActivePdfNativePageImports(
  authority: PdfNativePageImportAuthority,
): boolean {
  return (
    authority.state === "complete" &&
    authority.records.some((record) => record.operation === "upsert")
  );
}

/**
 * The pages (1-based) an active import or replacement holds as its own. The
 * server proves their content against the source file on every save
 * (native_page_import_transaction `_assert_managed_state`), so a native edit
 * may change every page but these; elsewhere it goes on as usual.
 */
export function pdfNativeImportedPageNumbers(
  authority: PdfNativePageImportAuthority,
): ReadonlySet<number> {
  const pages = new Set<number>();
  if (authority.state !== "complete") return pages;
  for (const record of authority.records) {
    if (record.operation !== "upsert") continue;
    const indices = isPdfNativePageReplacementRecord(record)
      ? pdfNativePageReplacementTargetIndices(record)
      : record.sourcePageIndices.map((_index, ordinal) => record.targetInsertionIndex + ordinal);
    for (const index of indices) pages.add(index + 1);
  }
  return pages;
}

export function hasActivePdfNativeFileAttachments(
  authority: PdfNativeFileAttachmentAuthority,
): boolean {
  return (
    authority.state === "complete" &&
    authority.records.some((record) => record.operation === "upsert")
  );
}

export const PDF_PATCHBACK_FAILED_MARKER_KEYS = new Set([
  "status",
  "adapter",
  "reason",
  "resource_id",
  "resource_version_id",
  "storage_key",
  "output_sha256",
  "output_size_bytes",
  "max_output_bytes",
  "patched_anchor_count",
  "loss_entry_count",
  "error",
  "repair_auth",
]);

export const PDF_PATCHBACK_REPAIR_AUTH_KEYS = new Set([
  "version",
  "page_id",
  "workspace_id",
  "notebook_id",
  "page_content_version",
  "data_item_id",
  "resource_id",
  "source_sha256",
  "source_resource_version_id",
  "source_storage_identity_sha256",
  "previous_content_sha256",
  "current_content_sha256",
  "last_known_resource_version_id",
]);

export function readOwnEnumerableDataRecord(
  value: unknown,
  allowedKeys: ReadonlySet<string>,
): Readonly<Record<string, unknown>> | null {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.some((key) => typeof key !== "string" || !allowedKeys.has(key))
    ) {
      return null;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const snapshot: Record<string, unknown> = {};
    for (const key of ownKeys) {
      if (typeof key !== "string") return null;
      const descriptor = descriptors[key];
      if (!descriptor?.enumerable || !("value" in descriptor)) return null;
      snapshot[key] = descriptor.value;
    }
    return Object.freeze(snapshot);
  } catch {
    return null;
  }
}

export function isNonEmptyPdfPatchbackString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isNullableNonEmptyPdfPatchbackString(
  value: unknown,
): value is string | null {
  return value === null || isNonEmptyPdfPatchbackString(value);
}

export function isOptionalNonNegativeSafeInteger(
  record: Readonly<Record<string, unknown>>,
  key: string,
): boolean {
  if (!Object.hasOwn(record, key)) return true;
  const value = record[key];
  return value === null || (Number.isSafeInteger(value) && Number(value) >= 0);
}

export function readPdfPatchbackIncompleteMarker(
  savedPage: PageItem,
): PdfPatchbackIncompleteMarker | null {
  const marker = readOwnEnumerableDataRecord(
    readPdfPatchbackReceiptValue(savedPage),
    PDF_PATCHBACK_FAILED_MARKER_KEYS,
  );
  if (!marker) return null;
  const auth = readOwnEnumerableDataRecord(
    marker.repair_auth,
    PDF_PATCHBACK_REPAIR_AUTH_KEYS,
  );
  if (!auth) return null;
  const authKeysComplete = [...PDF_PATCHBACK_REPAIR_AUTH_KEYS].every((key) =>
    Object.hasOwn(auth, key),
  );
  if (
    !authKeysComplete ||
    marker.status !== "failed" ||
    marker.adapter !== "pdf" ||
    !isNonEmptyPdfPatchbackString(marker.reason) ||
    !isNonEmptyPdfPatchbackString(marker.resource_id) ||
    !Number.isSafeInteger(marker.patched_anchor_count) ||
    Number(marker.patched_anchor_count) < 0 ||
    !Number.isSafeInteger(marker.loss_entry_count) ||
    Number(marker.loss_entry_count) < 0 ||
    (Object.hasOwn(marker, "resource_version_id") &&
      !isNullableNonEmptyPdfPatchbackString(marker.resource_version_id)) ||
    (Object.hasOwn(marker, "storage_key") &&
      !isNullableNonEmptyPdfPatchbackString(marker.storage_key)) ||
    (Object.hasOwn(marker, "output_sha256") &&
      marker.output_sha256 !== null &&
      (typeof marker.output_sha256 !== "string" ||
        !PDF_PATCHBACK_SHA256_PATTERN.test(marker.output_sha256))) ||
    !isOptionalNonNegativeSafeInteger(marker, "output_size_bytes") ||
    !isOptionalNonNegativeSafeInteger(marker, "max_output_bytes") ||
    (Object.hasOwn(marker, "error") &&
      marker.error !== null &&
      typeof marker.error !== "string") ||
    auth.version !== 1 ||
    !isNonEmptyPdfPatchbackString(auth.page_id) ||
    !isNonEmptyPdfPatchbackString(auth.workspace_id) ||
    !isNonEmptyPdfPatchbackString(auth.notebook_id) ||
    !Number.isSafeInteger(auth.page_content_version) ||
    Number(auth.page_content_version) < 1 ||
    !isNonEmptyPdfPatchbackString(auth.data_item_id) ||
    !isNonEmptyPdfPatchbackString(auth.resource_id) ||
    auth.resource_id !== marker.resource_id ||
    typeof auth.source_sha256 !== "string" ||
    !PDF_PATCHBACK_SHA256_PATTERN.test(auth.source_sha256) ||
    !isNonEmptyPdfPatchbackString(auth.source_resource_version_id) ||
    typeof auth.source_storage_identity_sha256 !== "string" ||
    !PDF_PATCHBACK_SHA256_PATTERN.test(auth.source_storage_identity_sha256) ||
    typeof auth.previous_content_sha256 !== "string" ||
    !PDF_PATCHBACK_SHA256_PATTERN.test(auth.previous_content_sha256) ||
    typeof auth.current_content_sha256 !== "string" ||
    !PDF_PATCHBACK_SHA256_PATTERN.test(auth.current_content_sha256) ||
    !isNullableNonEmptyPdfPatchbackString(auth.last_known_resource_version_id)
  ) {
    return null;
  }
  const authenticated = Object.freeze({
    ...auth,
  }) as unknown as PdfPatchbackRepairAuth;
  return Object.freeze({
    ...marker,
    repair_auth: authenticated,
  }) as unknown as PdfPatchbackIncompleteMarker;
}

export function hasLosslessDurablePdfPatchbackReceipt(savedPage: PageItem): boolean {
  const receipt = readPdfPatchbackReceiptSnapshot(savedPage);
  return Boolean(
    receipt?.status === "succeeded" &&
    receipt.adapter === "pdf" &&
    receipt.lossEntryCount === 0 &&
    typeof receipt.resourceVersionId === "string" &&
    receipt.resourceVersionId.trim().length > 0 &&
    Number.isSafeInteger(receipt.patchedAnchorCount) &&
    (receipt.patchedAnchorCount as number) > 0,
  );
}
