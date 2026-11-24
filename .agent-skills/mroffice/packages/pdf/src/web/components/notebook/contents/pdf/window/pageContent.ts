/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { pageStoredJsonEquals } from "@mrnote/core/web/lib/page-save-acknowledgement.ts";
import { pdfPageContentSchema } from "@mrnote/core/web/lib/native-page-schemas.ts";
import type { JsonValue } from "@mrnote/core/web/lib/collab/json-crdt.ts";
import {
  pdfNativeJournalConsolidates,
} from "../../../../../lib/pdf/engine/native/source-consolidation";
import type { PageItem } from "@mrnote/core/web/lib/notebook-sdk.ts";
import type { PdfExcerptAnnotation } from "../../../../../lib/pdf/annotation-note-page";
import type {
  PdfNativeReceiptJournalSnapshot,
} from "../../../../../lib/pdf/native-receipt-journal";
import {
  type PdfFormField,
  type PdfInsertedPage,
  type PdfPageMove,
  getDataItemId,
} from "../../../../../lib/pdf/page-content-model";

export function validatePdfRecoveredSourceBinding(
  draft: Readonly<{ content_json?: Record<string, unknown> }>,
  loadedPage: PageItem,
): { ok: true } | { ok: false } {
  if (!Object.prototype.hasOwnProperty.call(draft, "content_json")) {
    return { ok: true };
  }
  const loadedContent = clonePdfPageContent(loadedPage.content_json);
  const loadedDataItemId = getDataItemId(loadedContent ?? undefined);
  const parsed = pdfPageContentSchema.safeParse(draft.content_json);
  if (!parsed.success) return { ok: false };
  return !loadedDataItemId || getDataItemId(parsed.data) === loadedDataItemId
    ? { ok: true }
    : { ok: false };
}

/**
 * Project the reader's persisted highlight annotation rows (GET
 * /api/v1/data-items/{id}/annotations?type=pdf_highlight — the exact store the
 * embedded PDFViewer reads) into excerpt inputs for the "annotations → note
 * page" builder. Rows with no quotable text AND no note are dropped so the
 * excerpt button's enabled state reflects what would actually be excerpted.
 */
export function mapHighlightExcerpts(items: unknown): PdfExcerptAnnotation[] {
  if (!Array.isArray(items)) return [];
  const excerpts: PdfExcerptAnnotation[] = [];
  for (const row of items) {
    if (!row || typeof row !== "object") continue;
    const payload = (row as { payload_json?: unknown }).payload_json;
    if (!payload || typeof payload !== "object") continue;
    const source = payload as Record<string, unknown>;
    const page = Number(source.page);
    const quote = typeof source.text === "string" ? source.text : "";
    const note = typeof source.note === "string" ? source.note : "";
    if (!quote.trim() && !note.trim()) continue;
    excerpts.push({
      kind: "highlight",
      page: Number.isInteger(page) && page >= 1 ? page : null,
      quote,
      note,
      color: typeof source.color === "string" ? source.color : null,
    });
  }
  return excerpts;
}

export function clonePdfFormFields(fields: readonly PdfFormField[]): PdfFormField[] {
  return fields.map((field) => ({
    ...field,
    value: Array.isArray(field.value) ? [...field.value] : field.value,
  }));
}

export function pdfPageStructuralInventorySignature(
  deletedPages: readonly number[],
  pageMoves: readonly PdfPageMove[],
  insertedPages: readonly PdfInsertedPage[],
): string {
  return JSON.stringify({
    deletedPages,
    pageMoves: pageMoves.map((move) => [move.page, move.afterPage]),
    insertedPages: insertedPages.map((inserted) => [
      inserted.id,
      inserted.afterPage,
      inserted.width ?? null,
      inserted.height ?? null,
    ]),
  });
}

export function clonePdfPageContent(
  value: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const clone = JSON.parse(JSON.stringify(value)) as unknown;
    return clone && typeof clone === "object" && !Array.isArray(clone)
      ? (clone as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function pdfNativeReceiptSemanticEditRevision(
  snapshot: Pick<
    PdfNativeReceiptJournalSnapshot,
    "length" | "cursor" | "receipt"
  >,
): string {
  return [
    snapshot.length,
    snapshot.cursor,
    snapshot.receipt?.resourceId ?? "none",
    snapshot.receipt?.resourceVersionId ?? "none",
    snapshot.receipt?.outputSha256 ?? "none",
  ].join(":");
}

export function pdfEditorSavePolicySemanticEditRevision(input: {
  readonly pageContentVersion: number;
  readonly receiptJournal: Pick<
    PdfNativeReceiptJournalSnapshot,
    "length" | "cursor" | "receipt"
  >;
  readonly coalescerRevision: string;
  readonly rejectedDraftRevision: number;
}): string {
  return [
    input.pageContentVersion,
    pdfNativeReceiptSemanticEditRevision(input.receiptJournal),
    input.coalescerRevision,
    input.rejectedDraftRevision,
  ].join(":");
}

export function readPdfNativeTransactionCollection(
  content: Record<string, unknown> | undefined,
): JsonValue | undefined {
  if (
    !content ||
    !Object.prototype.hasOwnProperty.call(content, "pdfNativeTransactions")
  ) {
    return undefined;
  }
  // Page content arrived through the JSON API. The bridge performs the strict
  // stable-id/document-shape validation before accepting a local mutation; the
  // host must preserve even a malformed value until that fail-closed check.
  return content.pdfNativeTransactions as JsonValue;
}

export function pdfNativeTransactionCollectionMatches(
  expected: JsonValue,
  content: Record<string, unknown> | undefined,
): boolean {
  const actual = readPdfNativeTransactionCollection(content);
  if (actual === undefined) return false;
  try {
    // PostgreSQL jsonb canonicalizes object-key order. The durable API may
    // therefore return the exact transaction with different property order
    // than the browser-authored object. Compare JSON values structurally while
    // preserving array order and the existing fail-closed exception boundary.
    // ... and the API stores U+0000 as U+FFFD (pageStoredJsonProjection).
    return pageStoredJsonEquals(actual, expected);
  } catch {
    return false;
  }
}

/**
 * The journal the server hands back for the collection a save submitted:
 * the same collection, or, when that save consolidated the chain
 * (source-consolidation.ts), the one consolidation record that originates
 * from the submitted terminal record and chains from its candidate digest.
 * Returns the journal to authenticate against, or null.
 */
export function pdfNativeSavedTransactionCollection(
  expected: JsonValue,
  content: Record<string, unknown> | undefined,
): JsonValue | null {
  const actual = readPdfNativeTransactionCollection(content);
  // The stored journal is the one the receipt's digests were taken over
  // (it differs from the submitted one only by the U+0000 substitution).
  if (pdfNativeTransactionCollectionMatches(expected, content)) return actual ?? expected;
  return actual !== undefined && pdfNativeJournalConsolidates(actual, expected)
    ? actual
    : null;
}

export function pdfNativeTransactionValueMatches(
  expected: JsonValue | undefined,
  actual: JsonValue | undefined,
): boolean {
  if (expected === actual) return true;
  try {
    return pageStoredJsonEquals(expected, actual);
  } catch {
    return false;
  }
}
