/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { JsonValue } from "@mrnote/core/web/lib/collab/json-crdt.ts";
import type { PdfEngineSourceIdentity } from "../../../../../lib/pdf/engine/contracts";
import {
  MRAI_NATIVE_EMBEDDED_IMAGE_REMOVE_ACTION,
  MRAI_NATIVE_EMBEDDED_IMAGE_TRANSFORM_ACTION,
  MRAI_NATIVE_EMBEDDED_IMAGE_REPLACE_ACTION,
  MRAI_NATIVE_CONTENT_STREAM_SCHEMA_VERSION,
  MRAI_NATIVE_EMBEDDED_IMAGE_REMOVE_SCHEMA_VERSION,
  MRAI_NATIVE_EMBEDDED_IMAGE_REPLACE_SCHEMA_VERSION,
  MRAI_NATIVE_EMBEDDED_IMAGE_TRANSFORM_SCHEMA_VERSION,
  MRAI_NATIVE_FONT_EXTENSION_TEXT_ACTION,
  MRAI_NATIVE_FONT_EXTENSION_TEXT_SCHEMA_VERSION,
  MRAI_NATIVE_FONT_REUSE_TEXT_ACTION,
  MRAI_NATIVE_FONT_REUSE_TEXT_SCHEMA_VERSION,
} from "../../../../../lib/pdf/engine/native/vocabulary";
import type {
  PdfSharedStateRecord,
} from "../../../../../lib/pdf/engine/shared-state-bridge";
import type {
  PdfNativeEmbeddedImageRemovalEvidence,
  PdfNativeEmbeddedImageTransformEvidence,
  PdfNativeEmbeddedImageReplacementEvidence,
} from "../../../../../lib/pdf/engine/native/content-stream-transaction";
import {
  readPdfNativeEmbeddedImageTransformEvidence,
} from "../../../../../lib/pdf/engine/native/embedded-image-model";
import type { EmbeddedImageEdit } from "@/lib/pdf/embedded-image-edits";
import { readPdfNativeRestoreEvidence } from "../../../../../lib/pdf/engine/native/source-consolidation";

export interface PdfNativeEmbeddedImageHistorySeed {
  readonly evidence: PdfNativeEmbeddedImageRemovalEvidence;
  readonly transactionId: string;
}

export interface PdfNativeEmbeddedImageTransformHistorySeed {
  readonly evidence: PdfNativeEmbeddedImageTransformEvidence;
  readonly transactionId: string;
}

/** Native transaction kinds that only rewrite the page's own content. */
export const PAGE_LOCAL_NATIVE_TRANSACTION_KINDS: ReadonlySet<string> = new Set([
  "content-append",
  "embedded-image-transform",
  "embedded-image-reorder",
  "text-object-delete",
  "text-decoration",
  "embedded-image-removal",
  "embedded-image-replacement",
  "vector-geometry-edit",
  "vector-delete",
  "vector-duplicate",
  "vector-reorder",
  "vector-style-edit",
  // A revision the engine appended, published as its bytes: its record is
  // the whole of its authority (nothing to plan again on recovery).
  "bytes-publish",
  // The server's consolidation of the chain: a rewrite of the whole file as
  // one revision, nothing to rebuild and nothing to undo.
  "source-consolidation",
]);

/**
 * The write an undo or redo record restores (`text-window-history`, the byte
 * restore of one earlier record of the same journal), or null when the
 * record is not one or its origin is not exactly one record of the journal.
 * An origin a source consolidation compacted away is the restore evidence
 * the consolidation record kept for it (it names the origin's `kind`).
 */
export function readPdfNativeHistoryOriginRecord(
  record: unknown,
  journal: unknown,
): Readonly<Record<string, unknown>> | null {
  const plain = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  const history = plain(plain(record)?.textWindowHistory);
  const originId = history?.originTransactionId;
  if (
    plain(record)?.kind !== "text-window-history" ||
    typeof originId !== "string" ||
    !originId ||
    !Array.isArray(journal)
  ) {
    return null;
  }
  const origins = journal.filter((item) => plain(item)?.id === originId);
  if (origins.length === 0) {
    const kept = readPdfNativeRestoreEvidence(journal, originId);
    return kept ? (kept as unknown as Readonly<Record<string, unknown>>) : null;
  }
  return origins.length === 1 ? plain(origins[0]) : null;
}















export const TEXT_EDIT_MODE_VERSION_PREVIEW_KINDS: ReadonlySet<string> = new Set([
  ...PAGE_LOCAL_NATIVE_TRANSACTION_KINDS,
  "text-replacement",
  "list-text-replacement",
  "text-window-history",
  "text-move",
  "text-group-move",
  "font-extension-text-replacement",
  "font-reuse-text-replacement",
  "font-extension-text-history",
  "paragraph-properties",
  "outline-mutation",
  // WPS 分割页面 rewrites the page tree, not any page's content.
  "page-split",
]);

/** Staged edit kinds a native in-place image transform can carry out. */
export const NATIVE_EMBEDDED_IMAGE_TRANSFORM_KINDS: ReadonlySet<EmbeddedImageEdit["kind"]> =
  new Set(["move", "resize", "rotate", "flip", "crop", "opacity"]);

export function readPdfNativeEmbeddedImageRemovalEvidence(
  value: unknown,
): PdfNativeEmbeddedImageRemovalEvidence | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const readRef = (candidate: unknown) => {
    if (
      !candidate ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    ) {
      return null;
    }
    const ref = candidate as Record<string, unknown>;
    return Number.isSafeInteger(ref.objectNumber) &&
      Number(ref.objectNumber) >= 1 &&
      Number.isSafeInteger(ref.generation) &&
      Number(ref.generation) >= 0 &&
      Number(ref.generation) <= 65_535
      ? Object.freeze({
          objectNumber: Number(ref.objectNumber),
          generation: Number(ref.generation),
        })
      : null;
  };
  const readBytes = (candidate: unknown): readonly number[] | null =>
    Array.isArray(candidate) &&
    candidate.length >= 4 &&
    candidate.length <= 4_096 &&
    candidate.every(
      (item) =>
        Number.isSafeInteger(item) && Number(item) >= 0 && Number(item) <= 255,
    )
      ? Object.freeze(candidate.map(Number))
      : null;
  const page = readRef(record.page);
  const resourceOwner = readRef(record.resourceOwner);
  const image = readRef(record.image);
  const contentStream = readRef(record.contentStream);
  const operatorSpan = record.operatorSpan;
  const span =
    operatorSpan &&
    typeof operatorSpan === "object" &&
    !Array.isArray(operatorSpan)
      ? (operatorSpan as Record<string, unknown>)
      : null;
  const drawOperatorBytes = readBytes(record.drawOperatorBytes);
  const removedOperatorBytes = readBytes(record.removedOperatorBytes);
  // A delete that also dropped the picture's resource name carries the exact
  // entry it cut, so Undo can put those bytes back where they were.
  const unmapValue = record.resourceUnmap;
  const unmapRecord =
    unmapValue && typeof unmapValue === "object" && !Array.isArray(unmapValue)
      ? (unmapValue as Record<string, unknown>)
      : null;
  const unmapOwner = unmapRecord ? readRef(unmapRecord.resourceOwner) : null;
  const resourceUnmap =
    unmapRecord &&
    unmapOwner &&
    Array.isArray(unmapRecord.entryBytes) &&
    unmapRecord.entryBytes.length >= 2 &&
    unmapRecord.entryBytes.length <= 4_096 &&
    (unmapRecord.entryBytes as unknown[]).every(
      (item) =>
        Number.isSafeInteger(item) && Number(item) >= 0 && Number(item) <= 255,
    ) &&
    typeof unmapRecord.resourceName === "string" &&
    (unmapRecord.direction === "unmap" || unmapRecord.direction === "remap") &&
    typeof unmapRecord.expectedOwnerSha256 === "string" &&
    /^[a-f\d]{64}$/i.test(unmapRecord.expectedOwnerSha256) &&
    typeof unmapRecord.revisedOwnerSha256 === "string" &&
    /^[a-f\d]{64}$/i.test(unmapRecord.revisedOwnerSha256) &&
    Number.isSafeInteger(unmapRecord.entryOffset) &&
    Number(unmapRecord.entryOffset) >= 0
      ? Object.freeze({
          resourceName: unmapRecord.resourceName,
          direction: unmapRecord.direction as "unmap" | "remap",
          resourceOwner: unmapOwner,
          expectedOwnerSha256: unmapRecord.expectedOwnerSha256,
          revisedOwnerSha256: unmapRecord.revisedOwnerSha256,
          entryOffset: Number(unmapRecord.entryOffset),
          entryBytes: Object.freeze(
            (unmapRecord.entryBytes as number[]).map(Number),
          ),
        })
      : null;
  if (
    (unmapRecord !== null) !== (resourceUnmap !== null) ||
    record.schemaVersion !== MRAI_NATIVE_EMBEDDED_IMAGE_REMOVE_SCHEMA_VERSION ||
    !Number.isSafeInteger(record.pageNumber) ||
    Number(record.pageNumber) < 1 ||
    !Number.isSafeInteger(record.imageOrder) ||
    Number(record.imageOrder) < 0 ||
    typeof record.resourceName !== "string" ||
    !/^[A-Za-z][A-Za-z0-9_.+\-]{0,63}$/.test(record.resourceName) ||
    !page ||
    !resourceOwner ||
    !image ||
    !contentStream ||
    !span ||
    !Number.isSafeInteger(span.start) ||
    Number(span.start) < 0 ||
    !Number.isSafeInteger(span.end) ||
    Number(span.end) <= Number(span.start) ||
    !drawOperatorBytes ||
    !removedOperatorBytes ||
    drawOperatorBytes.length !== removedOperatorBytes.length ||
    Number(span.end) - Number(span.start) !== drawOperatorBytes.length ||
    !removedOperatorBytes.every((item) => item === 0x20)
  ) {
    return null;
  }
  return Object.freeze({
    schemaVersion: MRAI_NATIVE_EMBEDDED_IMAGE_REMOVE_SCHEMA_VERSION,
    pageNumber: Number(record.pageNumber),
    imageOrder: Number(record.imageOrder),
    resourceName: record.resourceName,
    page,
    resourceOwner,
    image,
    contentStream,
    operatorSpan: Object.freeze({
      start: Number(span.start),
      end: Number(span.end),
    }),
    drawOperatorBytes,
    removedOperatorBytes,
    ...(resourceUnmap ? { resourceUnmap } : {}),
  });
}

export function lastPdfNativeEmbeddedImageHistorySeed(
  collection: JsonValue | undefined,
  expected: Readonly<{
    transactionId: string;
    source: PdfEngineSourceIdentity;
    outputSha256: string;
    evidence: PdfNativeEmbeddedImageRemovalEvidence;
  }>,
): PdfNativeEmbeddedImageHistorySeed | null {
  if (!Array.isArray(collection) || collection.length === 0) return null;
  const value = collection.at(-1);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const source = record.source as Record<string, unknown> | undefined;
  const derived = record.derivedCandidate as
    | Record<string, unknown>
    | undefined;
  const evidence = readPdfNativeEmbeddedImageRemovalEvidence(
    record.embeddedImageRemoval,
  );
  if (
    record.id !== expected.transactionId ||
    record.transactionId !== expected.transactionId ||
    record.schemaVersion !== MRAI_NATIVE_EMBEDDED_IMAGE_REMOVE_SCHEMA_VERSION ||
    record.transactionSchemaVersion !==
      MRAI_NATIVE_CONTENT_STREAM_SCHEMA_VERSION ||
    record.kind !== "embedded-image-removal" ||
    record.featureId !== "PDF-EDT-IMAGE-02" ||
    record.controlId !== "PDFCTL.CONTEXT.PICTURE.DELETE_SOURCE" ||
    record.action !== MRAI_NATIVE_EMBEDDED_IMAGE_REMOVE_ACTION ||
    source?.resourceId !== expected.source.resourceId ||
    source?.resourceVersionId !== expected.source.resourceVersionId ||
    source?.sha256 !== expected.source.sourceSha256 ||
    derived?.sha256 !== expected.outputSha256 ||
    !evidence ||
    JSON.stringify(evidence) !== JSON.stringify(expected.evidence)
  ) {
    return null;
  }
  return Object.freeze({ evidence, transactionId: expected.transactionId });
}

export interface PdfNativeEmbeddedImageReplacementHistorySeed {
  readonly evidence: PdfNativeEmbeddedImageReplacementEvidence;
  readonly transactionId: string;
}

export interface PdfNativeFontExtensionHistorySeed {
  readonly originRecord: PdfSharedStateRecord;
  readonly transactionId: string;
}

export function lastPdfNativeFontExtensionHistorySeed(
  collection: JsonValue | undefined,
  expected: Readonly<{
    transactionId: string;
    source: PdfEngineSourceIdentity;
    outputSha256: string;
  }>,
): PdfNativeFontExtensionHistorySeed | null {
  if (!Array.isArray(collection) || collection.length === 0) return null;
  const matches = collection.filter((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const record = value as Record<string, unknown>;
    const source = record.source;
    const derived = record.derivedCandidate;
    const extensionOrigin =
      record.schemaVersion === MRAI_NATIVE_FONT_EXTENSION_TEXT_SCHEMA_VERSION &&
      record.action === MRAI_NATIVE_FONT_EXTENSION_TEXT_ACTION &&
      record.kind === "font-extension-text-replacement" &&
      record.pageFontExtensionMutation !== null &&
      typeof record.pageFontExtensionMutation === "object" &&
      record.fontExtensionText !== null &&
      typeof record.fontExtensionText === "object";
    const reuseOrigin =
      record.schemaVersion === MRAI_NATIVE_FONT_REUSE_TEXT_SCHEMA_VERSION &&
      record.action === MRAI_NATIVE_FONT_REUSE_TEXT_ACTION &&
      record.kind === "font-reuse-text-replacement" &&
      record.pageFontExtensionMutation === null &&
      record.fontReuseText !== null &&
      typeof record.fontReuseText === "object";
    return (
      record.id === expected.transactionId &&
      record.transactionId === expected.transactionId &&
      (extensionOrigin || reuseOrigin) &&
      record.featureId === "PDF-EDT-TEXT-01" &&
      record.controlId === "PDFCTL.RIBBON.EDIT.EDIT_CONTENT" &&
      source !== null &&
      typeof source === "object" &&
      !Array.isArray(source) &&
      (source as Record<string, unknown>).resourceId ===
        expected.source.resourceId &&
      (source as Record<string, unknown>).resourceVersionId ===
        expected.source.resourceVersionId &&
      (source as Record<string, unknown>).sha256 ===
        expected.source.sourceSha256 &&
      derived !== null &&
      typeof derived === "object" &&
      !Array.isArray(derived) &&
      (derived as Record<string, unknown>).sha256 === expected.outputSha256
    );
  });
  if (matches.length !== 1) return null;
  return Object.freeze({
    originRecord: structuredClone(matches[0]) as PdfSharedStateRecord,
    transactionId: expected.transactionId,
  });
}

export function lastPdfNativeEmbeddedImageTransformHistorySeed(
  collection: JsonValue | undefined,
  expected: Readonly<{
    transactionId: string;
    source: PdfEngineSourceIdentity;
    outputSha256: string;
    evidence: PdfNativeEmbeddedImageTransformEvidence;
  }>,
): PdfNativeEmbeddedImageTransformHistorySeed | null {
  if (!Array.isArray(collection) || collection.length === 0) return null;
  const value = collection.at(-1);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const source = record.source as Record<string, unknown> | undefined;
  const derived = record.derivedCandidate as
    | Record<string, unknown>
    | undefined;
  const evidence = readPdfNativeEmbeddedImageTransformEvidence(
    record.embeddedImageTransform,
  );
  if (
    record.id !== expected.transactionId ||
    record.transactionId !== expected.transactionId ||
    record.schemaVersion !== MRAI_NATIVE_EMBEDDED_IMAGE_TRANSFORM_SCHEMA_VERSION ||
    record.transactionSchemaVersion !==
      MRAI_NATIVE_CONTENT_STREAM_SCHEMA_VERSION ||
    record.kind !== "embedded-image-transform" ||
    record.featureId !== "PDF-EDT-IMAGE-02" ||
    record.controlId !== "PDFCTL.CONTEXT.PICTURE.TRANSFORM_SOURCE" ||
    record.action !== MRAI_NATIVE_EMBEDDED_IMAGE_TRANSFORM_ACTION ||
    source?.resourceId !== expected.source.resourceId ||
    source?.resourceVersionId !== expected.source.resourceVersionId ||
    source?.sha256 !== expected.source.sourceSha256 ||
    derived?.sha256 !== expected.outputSha256 ||
    !evidence ||
    JSON.stringify(evidence) !== JSON.stringify(expected.evidence)
  ) {
    return null;
  }
  return Object.freeze({ evidence, transactionId: expected.transactionId });
}

export interface PdfNativeEmbeddedImageReplacementHistorySeed {
  readonly evidence: PdfNativeEmbeddedImageReplacementEvidence;
  readonly transactionId: string;
}

export interface PdfNativeFontExtensionHistorySeed {
  readonly originRecord: PdfSharedStateRecord;
  readonly transactionId: string;
}

export function lastPdfNativeEmbeddedImageReplacementHistorySeed(
  collection: JsonValue | undefined,
  expected: Readonly<{
    transactionId: string;
    source: PdfEngineSourceIdentity;
    outputSha256: string;
    evidence: PdfNativeEmbeddedImageReplacementEvidence;
  }>,
): PdfNativeEmbeddedImageReplacementHistorySeed | null {
  if (!Array.isArray(collection) || collection.length === 0) return null;
  const value = collection.at(-1);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const source = record.source as Record<string, unknown> | undefined;
  const derived = record.derivedCandidate as
    | Record<string, unknown>
    | undefined;
  if (
    record.id !== expected.transactionId ||
    record.transactionId !== expected.transactionId ||
    record.schemaVersion !==
      MRAI_NATIVE_EMBEDDED_IMAGE_REPLACE_SCHEMA_VERSION ||
    record.transactionSchemaVersion !==
      MRAI_NATIVE_CONTENT_STREAM_SCHEMA_VERSION ||
    record.kind !== "embedded-image-replacement" ||
    record.featureId !== "PDF-EDT-IMAGE-02" ||
    record.controlId !== "PDFCTL.CONTEXT.PICTURE.REPLACE_SOURCE" ||
    record.action !== MRAI_NATIVE_EMBEDDED_IMAGE_REPLACE_ACTION ||
    source?.resourceId !== expected.source.resourceId ||
    source?.resourceVersionId !== expected.source.resourceVersionId ||
    source?.sha256 !== expected.source.sourceSha256 ||
    derived?.sha256 !== expected.outputSha256 ||
    JSON.stringify(record.embeddedImageReplacement) !==
      JSON.stringify(expected.evidence)
  ) {
    return null;
  }
  return Object.freeze({
    evidence: expected.evidence,
    transactionId: expected.transactionId,
  });
}
