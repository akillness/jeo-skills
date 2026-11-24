/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { isApiRequestError } from "@mrnote/core/web/lib/api.ts";
import type { JsonValue } from "@mrnote/core/web/lib/collab/json-crdt.ts";
import { pageDocumentJsonEquals, pageStoredJsonEquals } from "@mrnote/core/web/lib/page-save-acknowledgement.ts";
import type { PdfEngineSourceIdentity } from "../../../../../lib/pdf/engine/contracts";
import {
  MRAI_NATIVE_LIST_TEXT_ACTION,
} from "../../../../../lib/pdf/engine/native/vocabulary";
import {
  readMraiNativeListTextFidelityEvidence,
} from "../../../../../lib/pdf/engine/native/list-text-model";
import type {
  PdfPatchbackIncompleteMarker,
  PdfPatchbackRepairAuth,
  PdfRestoreDurableContentRequest,
  PageItem,
} from "@mrnote/core/web/lib/notebook-sdk.ts";
import {
  isAcceptedNativePageLabelRepairReceipt,
  isVerifiedPageLabelPatchbackNoopReceipt,
  parsePageLabelRangesStrict,
  type PageLabelRange,
} from "@mrnote/core/web/lib/pdf/page-labels.ts";
import {
  getDataItemId,
  getDeletedPages,
  getInsertedPages,
  getPageMoves,
} from "../../../../../lib/pdf/page-content-model";
import {
  readPdfPatchbackReceiptSnapshot,
  PDF_PATCHBACK_SHA256_PATTERN,
  readPdfNativeListTextPatchbackAuthority,
  PDF_PATCHBACK_REPAIR_AUTH_KEYS,
  readPdfPatchbackIncompleteMarker,
} from "./patchbackReceipts";
import type {
  PdfDurableContentCommit,
  PdfInsertPageContentAuthority,
  PdfSourceBoundNativeMutationSaveAuthority,
  PdfPendingPatchbackRepair,
  PdfInsertPageAuthorityState,
} from "./insertPageAuthority";
import {
  pdfPageStructuralInventorySignature,
  clonePdfPageContent,
  pdfNativeTransactionCollectionMatches,
  readPdfNativeTransactionCollection,
} from "./pageContent";

export type PdfPageLabelRangesAuthority =
  | Readonly<{ state: "absent" }>
  | Readonly<{
      state: "complete";
      ranges: PageLabelRange[];
      materialized: boolean;
    }>
  | Readonly<{ state: "malformed" }>;

export function getPdfPageLabelRanges(
  content: Record<string, unknown> | undefined,
  receiptPage?: PageItem,
): PdfPageLabelRangesAuthority {
  if (
    !content ||
    !Object.prototype.hasOwnProperty.call(content, "pageLabelRanges")
  ) {
    return { state: "absent" };
  }
  const ranges = parsePageLabelRangesStrict(content.pageLabelRanges);
  return ranges
    ? {
        state: "complete",
        ranges,
        materialized: Boolean(
          receiptPage &&
            hasAcceptedPdfPageLabelMutationReceipt({
              pageId: receiptPage.id,
              submittedContent: content,
              savedPage: receiptPage,
            }),
        ),
      }
    : { state: "malformed" };
}

export function authenticatePdfDurableContentCommit(options: {
  pageId: string;
  submittedContent: Record<string, unknown>;
  savedPage: PageItem | null | undefined;
}): PdfDurableContentCommit | null {
  const { pageId, submittedContent, savedPage } = options;
  if (!savedPage || savedPage.id !== pageId) return null;
  const contentVersion = savedPage.content_version;
  if (
    typeof contentVersion !== "number" ||
    !Number.isSafeInteger(contentVersion) ||
    contentVersion < 1
  ) {
    return null;
  }
  const savedContent = savedPage.content_json;
  if (!savedContent) return null;
  // PostgreSQL JSONB reorders object keys. It does not change the authored
  // values or array order; use the same structural equality as native journals
  // instead of rejecting a successful durable save on serialization order.
  // It cannot hold U+0000 either: the API stores it as U+FFFD (a PDF glyph
  // whose ToUnicode is U+0000, a bullet's). A text box over such a line was
  // written into the PDF and then refused here as a changed body, its draft
  
  
  // Nor a key left undefined: the request carried the body as JSON, which
  // names no such key. A body built from the window's own records (the
  // "before" a page turn's Undo writes back: its text boxes read back name
  // their unset colour, kind, runs...) never equalled the page it had just
  // saved -- the Undo was written, then refused here, its history cleared
  // and 「保存失败…没有可安全撤销的原生 PDF 修改」 said over a page that was
  
  // The page answered is read the same way: one the window projected from
  // its own records (not a server's JSON) carries those keys too, and did
  // not even equal itself.
  if (!pageStoredJsonEquals(asJsonKeeps(savedContent) as typeof savedContent, asJsonKeeps(submittedContent))) return null;
  const contentSignature = JSON.stringify(savedContent);
  const dataItemId = getDataItemId(savedContent);
  if (!dataItemId || dataItemId !== getDataItemId(submittedContent))
    return null;
  const sourceSignature = JSON.stringify(savedContent.source ?? null);
  const deletedPages = getDeletedPages(savedContent);
  const pageMoves = getPageMoves(savedContent);
  const insertedPages = getInsertedPages(savedContent);
  return Object.freeze({
    pageId,
    contentVersion,
    dataItemId,
    sourceSignature,
    contentSignature,
    inventorySignature: pdfPageStructuralInventorySignature(
      deletedPages,
      pageMoves,
      insertedPages,
    ),
    insertedPageCount: insertedPages.length,
  });
}

export function authenticatePdfDurableContentSaveReceipt(options: {
  pageId: string;
  submittedContent: Record<string, unknown>;
  savedPage: PageItem | null | undefined;
}): PdfInsertPageContentAuthority | null {
  const commit = authenticatePdfDurableContentCommit(options);
  if (!commit || !options.savedPage) return null;
  const patchback = readPdfPatchbackReceiptSnapshot(options.savedPage);
  if (
    patchback?.status !== "succeeded" ||
    typeof patchback.adapter !== "string" ||
    patchback.adapter.toLowerCase() !== "pdf" ||
    typeof patchback.resourceId !== "string" ||
    patchback.resourceId.length === 0 ||
    typeof patchback.resourceVersionId !== "string" ||
    patchback.resourceVersionId.length === 0
  ) {
    return null;
  }
  return Object.freeze({
    kind: "dirty_saved" as const,
    token: crypto.randomUUID(),
    ...commit,
    sourceResourceId: patchback.resourceId,
    sourceRevision: patchback.resourceVersionId,
  });
}

export function authenticatePdfSourceBoundNativeMutationSaveReceipt(options: {
  pageId: string;
  submittedContent: Record<string, unknown>;
  savedPage: PageItem | null | undefined;
  expectedSource: PdfEngineSourceIdentity;
}): PdfSourceBoundNativeMutationSaveAuthority | null {
  // A succeeded marker is not enough: this promoted FreeText must advance the
  // exact PDF resource that supplied the active source-glyph editing lease.
  const authority = authenticatePdfDurableContentSaveReceipt(options);
  const patchback = options.savedPage
    ? readPdfNativeListTextPatchbackAuthority(
        readPdfPatchbackReceiptSnapshot(options.savedPage),
      )
    : null;
  if (
    !authority ||
    !patchback ||
    patchback.resourceId !== options.expectedSource.resourceId ||
    patchback.resourceVersionId === options.expectedSource.resourceVersionId ||
    patchback.outputSha256 === options.expectedSource.sourceSha256.toLowerCase()
  ) {
    return null;
  }
  return Object.freeze({
    authority,
    source: Object.freeze({
      resourceId: patchback.resourceId,
      resourceVersionId: patchback.resourceVersionId,
      sourceSha256: patchback.outputSha256,
    }),
  });
}

/** A value as JSON keeps it: a key left undefined is no key, an undefined
 * item of a list is null. */
function asJsonKeeps(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => (item === undefined ? null : asJsonKeeps(item)));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, inner]) => inner !== undefined).map(([key, inner]) => [key, asJsonKeeps(inner)]));
}














export function pdfPageContentChangedKeys(
  content: Readonly<Record<string, unknown>>,
  base: Readonly<Record<string, unknown>>,
): string[] {
  const nothing = (value: unknown) => value === undefined || value === null ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === "object" && !Array.isArray(value) && Object.keys(value as object).length === 0);
  const labels = (value: unknown) => (Array.isArray(value) ? value : null);
  return [...new Set([...Object.keys(content), ...Object.keys(base)])].filter((key) =>
    key === "pageLabelRanges"
      ? !pageDocumentJsonEquals(labels(content[key]), labels(base[key]))
      : !(nothing(content[key]) && nothing(base[key])) &&
        !pageDocumentJsonEquals(asJsonKeeps(content[key] ?? null), asJsonKeeps(base[key] ?? null)));
}

/**
 * Whether a save of `content` as the page would change nothing: every
 * collection reads as the saved page holds it, and that page's last save
 * wrote it into the very file this write would start from.
 *
 * Such a write is not sent. The page save sends the whole body, every
 * collection named; a page the working copy's queue has saved names only the
 * collections its edits changed, so the server reads the same list as a new
 * body, writes the file again -- byte for byte the file it was, under a new
 * version -- and a receipt whose digest is the source's own is one the
 * source-bound check above refuses (it asks that the write advance the file).
 * The window then kept a repair nothing was missing for, which held every
 * later reading of the page off, and with it the queue's next save (a box
 * emptied and left: its removal follows the write that already took it out
 * of the file).
 */
export function pdfPageSaveWouldChangeNothing(options: {
  content: Readonly<Record<string, unknown>>;
  savedPage: PageItem | null | undefined;
  expectedSource: PdfEngineSourceIdentity;
}): boolean {
  const { content, savedPage, expectedSource } = options;
  const saved = savedPage?.content_json;
  if (!savedPage || !saved) return false;
  const receipt = readPdfNativeListTextPatchbackAuthority(
    readPdfPatchbackReceiptSnapshot(savedPage),
  );
  return Boolean(
    receipt &&
    receipt.resourceId === expectedSource.resourceId &&
    receipt.resourceVersionId === expectedSource.resourceVersionId &&
    receipt.outputSha256 === expectedSource.sourceSha256.toLowerCase() &&
    pdfPageContentChangedKeys(content, saved).length === 0,
  );
}

export function hasLosslessPdfNativeMutationReceipt(options: {
  pageId: string;
  submittedContent: Record<string, unknown>;
  savedPage: PageItem | null | undefined;
}): boolean {
  const authority = authenticatePdfDurableContentSaveReceipt(options);
  const patchback = options.savedPage
    ? readPdfNativeListTextPatchbackAuthority(
        readPdfPatchbackReceiptSnapshot(options.savedPage),
      )
    : null;
  return Boolean(authority && patchback);
}

export function hasAcceptedPdfPageLabelMutationReceipt(options: {
  pageId: string;
  submittedContent: Record<string, unknown>;
  savedPage: PageItem | null | undefined;
}): boolean {
  if (hasLosslessPdfNativeMutationReceipt(options)) return true;
  if (!authenticatePdfDurableContentCommit(options) || !options.savedPage) {
    return false;
  }
  return isVerifiedPageLabelPatchbackNoopReceipt(
    readPdfPatchbackReceiptSnapshot(options.savedPage),
  );
}

export function pdfDurableCommitMatchesPendingRepair(
  commit: PdfDurableContentCommit | null,
  pending: PdfPendingPatchbackRepair,
): boolean {
  return Boolean(
    commit &&
    commit.pageId === pending.pageId &&
    commit.contentVersion === pending.contentVersion &&
    commit.dataItemId === pending.dataItemId &&
    commit.sourceSignature === pending.sourceSignature &&
    commit.contentSignature === pending.contentSignature &&
    commit.inventorySignature === pending.inventorySignature &&
    commit.insertedPageCount === pending.insertedPageCount,
  );
}

export function pdfPatchbackMarkerMatchesCommit(
  marker: PdfPatchbackIncompleteMarker,
  commit: PdfDurableContentCommit,
): boolean {
  const auth = marker.repair_auth;
  return (
    auth.page_id === commit.pageId &&
    auth.page_content_version === commit.contentVersion &&
    auth.data_item_id === commit.dataItemId &&
    auth.resource_id === marker.resource_id
  );
}

export function samePdfPatchbackRepairAuth(
  left: PdfPatchbackRepairAuth,
  right: PdfPatchbackRepairAuth,
): boolean {
  const leftRecord = left as unknown as Record<string, unknown>;
  const rightRecord = right as unknown as Record<string, unknown>;
  return [...PDF_PATCHBACK_REPAIR_AUTH_KEYS].every(
    (key) => leftRecord[key] === rightRecord[key],
  );
}

export function createPdfPendingPatchbackRepair(options: {
  pageId: string;
  previousContent: Record<string, unknown>;
  previousContentVersion: number;
  submittedContent: Record<string, unknown>;
  savedPage: PageItem;
}): PdfPendingPatchbackRepair | null {
  const commit = authenticatePdfDurableContentCommit({
    pageId: options.pageId,
    submittedContent: options.submittedContent,
    savedPage: options.savedPage,
  });
  const content = clonePdfPageContent(options.savedPage.content_json);
  const previousContent = clonePdfPageContent(options.previousContent);
  if (!commit || !content || !previousContent) return null;
  const candidateMarker = readPdfPatchbackIncompleteMarker(options.savedPage);
  const incompleteMarker =
    candidateMarker &&
    commit.contentVersion === options.previousContentVersion + 1 &&
    pdfPatchbackMarkerMatchesCommit(candidateMarker, commit)
      ? candidateMarker
      : null;
  return Object.freeze({
    ...commit,
    content,
    previousContent,
    incompleteMarker,
  });
}

export function refreshPdfPendingPatchbackRepair(
  pending: PdfPendingPatchbackRepair,
  savedPage: PageItem,
): PdfPendingPatchbackRepair | null {
  const commit = authenticatePdfDurableContentCommit({
    pageId: pending.pageId,
    submittedContent: pending.content,
    savedPage,
  });
  if (!pdfDurableCommitMatchesPendingRepair(commit, pending)) return null;
  const candidateMarker = readPdfPatchbackIncompleteMarker(savedPage);
  if (
    !candidateMarker ||
    !commit ||
    !pdfPatchbackMarkerMatchesCommit(candidateMarker, commit) ||
    (pending.incompleteMarker &&
      !samePdfPatchbackRepairAuth(
        candidateMarker.repair_auth,
        pending.incompleteMarker.repair_auth,
      ))
  ) {
    return null;
  }
  return Object.freeze({
    ...pending,
    incompleteMarker: candidateMarker,
  });
}

export function authenticatePdfPatchbackRepairReceipt(options: {
  pending: PdfPendingPatchbackRepair;
  savedPage: PageItem;
}): PdfInsertPageContentAuthority | null {
  const { pending, savedPage } = options;
  const marker = pending.incompleteMarker;
  if (!marker) return null;
  const commit = authenticatePdfDurableContentCommit({
    pageId: pending.pageId,
    submittedContent: pending.content,
    savedPage,
  });
  if (!pdfDurableCommitMatchesPendingRepair(commit, pending) || !commit) {
    return null;
  }
  const receipt = readPdfPatchbackReceiptSnapshot(savedPage);
  const resourceVersionId = receipt?.resourceVersionId;
  const disallowedResourceVersions = new Set(
    [
      marker.resource_version_id,
      marker.repair_auth.last_known_resource_version_id,
      marker.repair_auth.source_resource_version_id,
    ].filter((value): value is string => typeof value === "string" && !!value),
  );
  if (
    receipt?.status !== "succeeded" ||
    receipt.adapter !== "pdf" ||
    receipt.resourceId !== marker.resource_id ||
    typeof resourceVersionId !== "string" ||
    resourceVersionId.length === 0 ||
    disallowedResourceVersions.has(resourceVersionId) ||
    typeof receipt.outputSha256 !== "string" ||
    !PDF_PATCHBACK_SHA256_PATTERN.test(receipt.outputSha256) ||
    receipt.lossEntryCount !== 0 ||
    !Number.isSafeInteger(receipt.patchedAnchorCount) ||
    Number(receipt.patchedAnchorCount) <= 0
  ) {
    return null;
  }
  return Object.freeze({
    kind: "dirty_saved" as const,
    token: crypto.randomUUID(),
    ...commit,
    sourceResourceId: marker.resource_id,
    sourceRevision: resourceVersionId,
  });
}

export function readPdfPatchbackRepairSourceIdentity(
  pending: PdfPendingPatchbackRepair,
): PdfEngineSourceIdentity | null {
  const marker = pending.incompleteMarker;
  if (!marker) return null;
  const auth = marker.repair_auth;
  if (
    auth.page_id !== pending.pageId ||
    auth.page_content_version !== pending.contentVersion ||
    auth.data_item_id !== pending.dataItemId ||
    auth.resource_id !== marker.resource_id ||
    !PDF_PATCHBACK_SHA256_PATTERN.test(auth.source_sha256) ||
    !auth.source_resource_version_id
  ) {
    return null;
  }
  return Object.freeze({
    resourceId: marker.resource_id,
    resourceVersionId: auth.source_resource_version_id,
    sourceSha256: auth.source_sha256.toLowerCase(),
  });
}

export function reconstructNativeTextMixedWriterRepair(
  savedPage: PageItem,
): PdfPendingPatchbackRepair | null {
  const marker = readPdfPatchbackIncompleteMarker(savedPage);
  const submittedContent = clonePdfPageContent(savedPage.content_json);
  const contentVersion = Number(savedPage.content_version ?? 0);
  if (
    marker?.reason !== "native_text_transaction_rejected:mixed-writer" ||
    !submittedContent ||
    !Number.isSafeInteger(contentVersion) ||
    contentVersion < 2 ||
    !Object.prototype.hasOwnProperty.call(
      submittedContent,
      "pdfFormAuthoringOperations",
    ) ||
    !Array.isArray(submittedContent.pdfFormAuthoringOperations) ||
    submittedContent.pdfFormAuthoringOperations.length !== 0
  ) {
    return null;
  }
  const collection = readPdfNativeTransactionCollection(submittedContent);
  if (!Array.isArray(collection) || collection.length < 1) return null;

  // Reconstruct only the one historical failure shape produced by the old
  // client: append one native-text row and materialize an otherwise absent,
  // empty form-authoring collection. The server-stamped previous-content hash
  // authenticates this reconstruction before any PDF byte can be written.
  const previousContent = clonePdfPageContent(submittedContent);
  if (!previousContent) return null;
  delete previousContent.pdfFormAuthoringOperations;
  const previousCollection = collection.slice(0, -1);
  if (previousCollection.length === 0) {
    delete previousContent.pdfNativeTransactions;
  } else {
    previousContent.pdfNativeTransactions = previousCollection;
  }
  return createPdfPendingPatchbackRepair({
    pageId: savedPage.id,
    previousContent,
    previousContentVersion: contentVersion - 1,
    submittedContent,
    savedPage,
  });
}

export function matchesPdfJsRepeatedAsciiSpaceProjection(
  expectedText: string,
  selectedText: string,
): boolean {
  return (
    expectedText.includes("  ") &&
    expectedText === expectedText.replace(/^ +| +$/gu, "") &&
    selectedText === expectedText.replace(/ {2,}/gu, " ")
  );
}

export function reconstructNativeTextRepeatedSpaceRepair(
  savedPage: PageItem,
): PdfPendingPatchbackRepair | null {
  const marker = readPdfPatchbackIncompleteMarker(savedPage);
  const submittedContent = clonePdfPageContent(savedPage.content_json);
  const contentVersion = Number(savedPage.content_version ?? 0);
  if (
    marker?.reason !== "native_text_transaction_rejected:invalid-record" ||
    !submittedContent ||
    !Number.isSafeInteger(contentVersion) ||
    contentVersion < 2
  ) {
    return null;
  }
  const collection = readPdfNativeTransactionCollection(submittedContent);
  if (!Array.isArray(collection) || collection.length < 1) return null;
  const lastRecord = collection.at(-1);
  if (!lastRecord || typeof lastRecord !== "object" || Array.isArray(lastRecord)) {
    return null;
  }
  const record = lastRecord as Record<string, unknown>;
  const fidelity = readMraiNativeListTextFidelityEvidence(record.textFidelity);
  const selection = fidelity?.selection;
  if (
    record.kind !== "text-replacement" ||
    record.featureId !== "PDF-EDT-TEXT-01" ||
    record.action !== MRAI_NATIVE_LIST_TEXT_ACTION ||
    (record.controlId !== "PDFCTL.RIBBON.EDIT.EDIT_CONTENT" &&
      record.controlId !== "PDFCTL.RIBBON.HOME.EDIT_CONTENT") ||
    !selection ||
    selection.items !== undefined ||
    !matchesPdfJsRepeatedAsciiSpaceProjection(
      fidelity.originalDisplayText,
      selection.item.str,
    )
  ) {
    return null;
  }

  const previousContent = clonePdfPageContent(submittedContent);
  if (!previousContent) return null;
  const previousCollection = collection.slice(0, -1);
  if (previousCollection.length === 0) {
    delete previousContent.pdfNativeTransactions;
  } else {
    previousContent.pdfNativeTransactions = previousCollection;
  }
  return createPdfPendingPatchbackRepair({
    pageId: savedPage.id,
    previousContent,
    previousContentVersion: contentVersion - 1,
    submittedContent,
    savedPage,
  });
}

/**
 * A page whose last save appended one native record the server's replay
 * refused (`native_text_transaction_rejected:*`) keeps that record in its
 * journal under a failed receipt, which locks every source text box -- and
 * there is no successful write to retry from. As in WPS, where a failed save
 * leaves the document at its last good state, the page goes back to the body
 * before that save and the PDF the server last verified for it
 * (`pdf_restore_durable_content`). The server proves each link: the body is
 * the one it stamped before the refused save (repair_auth
 * previous_content_sha256), the version is the export the remaining journal
 * produced -- or, for a refused first native write, the original upload --
 * and its bytes still hash to that receipt. Only the refused record is
 * dropped, and it was never written into the file; nothing else may differ,
 * which the stamped digest enforces.
 */
export interface PdfRefusedNativeWriteRestore {
  readonly pageId: string;
  readonly contentVersion: number;
  readonly marker: PdfPatchbackIncompleteMarker;
  readonly refusedTransactionId: string;
  /** The body before the refused save, in each shape it may have been
   * stored in: an emptied journal absent first, then empty. */
  readonly candidates: readonly Record<string, unknown>[];
  /** The export the remaining journal ended in (its SHA-256 is read from
   * the resource), or the original upload for a refused first write. */
  readonly source:
    | Readonly<{ kind: "export"; resourceVersionId: string }>
    | Readonly<{ kind: "original"; resourceVersionId: string; outputSha256: string }>;
  /** One attempt per failed state. */
  readonly key: string;
}

/** How many journals a put-back onto an export names at most, each one
 * record shorter than the one before (one request each until the server
 * takes one). */
const PDF_REFUSED_RESTORE_RECORDS_BACK = 4;

export function reconstructRefusedNativeWriteRestore(
  savedPage: PageItem,
): PdfRefusedNativeWriteRestore | null {
  const marker = readPdfPatchbackIncompleteMarker(savedPage);
  const content = clonePdfPageContent(savedPage.content_json);
  const contentVersion = Number(savedPage.content_version ?? 0);
  const auth = marker?.repair_auth;
  if (
    !marker ||
    !auth ||
    // (A record planned on a replaced version is put back the same way.)
    !/^(?:native_text_transaction_rejected:[a-z0-9-]+|source_identity_stale)$/.test(marker.reason) ||
    !content ||
    !Number.isSafeInteger(contentVersion) ||
    contentVersion < 2 ||
    auth.page_id !== savedPage.id ||
    auth.page_content_version !== contentVersion
  ) {
    return null;
  }
  const collection = readPdfNativeTransactionCollection(content);
  if (!Array.isArray(collection) || collection.length < 1) return null;
  const refused = collection.at(-1);
  const refusedTransactionId =
    refused && typeof refused === "object" && !Array.isArray(refused)
      ? (refused as Record<string, unknown>).id
      : null;
  if (typeof refusedTransactionId !== "string" || !refusedTransactionId) {
    return null;
  }
  const remaining = collection.slice(0, -1);
  // Records before the refused one with no export behind them were never
  // written either (a further record saved on the failed page, by this
  // window or another): the file is still the upload, and the page goes
  // back to it with the whole unwritten journal dropped. This used to be no
  // restore at all, and the page stayed unwritable.
  const exportSource = remaining.length && auth.last_known_resource_version_id
    ? ({ kind: "export", resourceVersionId: auth.last_known_resource_version_id } as const)
    : null;
  const source = exportSource ?? ({
    kind: "original",
    resourceVersionId: auth.source_resource_version_id,
    outputSha256: auth.source_sha256,
  } as const);
  const withJournal = (journal: unknown[] | null) => {
    const body = clonePdfPageContent(content) as Record<string, unknown>;
    if (journal === null) delete body.pdfNativeTransactions;
    else body.pdfNativeTransactions = journal;
    return body;
  };
  return Object.freeze({
    pageId: savedPage.id,
    contentVersion,
    marker,
    refusedTransactionId,
    candidates: Object.freeze(
      exportSource
        // The file may be more than one record behind: a second writer's
        // record stored while the write of the one before it was still lost
        // to the server. The journal its export carries is then shorter by
        // each of them. The server knows which it is (its stamp of the
        // journal the file carries) and refuses every other body, so each
        // is named in turn, the nearest first. Only the last record off was
        // named, and such a page could not be put back by its window.
        ? Array.from({ length: Math.min(remaining.length, PDF_REFUSED_RESTORE_RECORDS_BACK) },
            (_, back) => withJournal(remaining.slice(0, remaining.length - back)))
        : [withJournal(null), withJournal([])],
    ),
    source: Object.freeze(source),
    key: `${savedPage.id}:${contentVersion}:${auth.current_content_sha256}`,
  });
}

/**
 * The reader's own words in the native text record the server refused (the
 * last of the journal a refused-write restore drops), and the line they were
 * typed on: kept as that line's draft on the restored page so reopening the
 * line brings the text back instead of losing it with the record. Null for a
 * record that is not a text edit of one line (a vector or picture edit).
 */
export function readRefusedNativeTextDraft(
  savedPage: PageItem,
): Readonly<{ lineKey: string; text: string; lineText?: string }> | null {
  const content = savedPage.content_json;
  const collection = content && typeof content === "object" && !Array.isArray(content)
    ? readPdfNativeTransactionCollection(content as Record<string, unknown>)
    : undefined;
  const refused = Array.isArray(collection) ? collection.at(-1) : null;
  if (!refused || typeof refused !== "object" || Array.isArray(refused)) return null;
  const fidelity = (refused as Record<string, unknown>).textFidelity;
  if (!fidelity || typeof fidelity !== "object" || Array.isArray(fidelity)) return null;
  const { replacementText, replacementDisplayText, selection } = fidelity as Record<string, unknown>;
  const text = typeof replacementDisplayText === "string" ? replacementDisplayText : replacementText;
  if (typeof text !== "string" || !text.trim() || !selection || typeof selection !== "object") return null;
  const { pageNumber, item, items } = selection as Record<string, unknown>;
  const indexOf = (value: unknown) =>
    value && typeof value === "object" && Number.isSafeInteger((value as { itemIndex?: unknown }).itemIndex)
      ? ((value as { itemIndex: number }).itemIndex)
      : null;
  const indexes = Array.isArray(items) ? items.map(indexOf) : [indexOf(item)];
  if (!Number.isSafeInteger(pageNumber) || !indexes.length || indexes.some((index) => index === null)) return null;
  // The line's own words (as pdfNativeListTextTargetText reads them): the
  // draft is held to them once the page is saved again.
  const strOf = (value: unknown) =>
    value && typeof value === "object" && typeof (value as { str?: unknown }).str === "string"
      ? (value as { str: string }).str : null;
  const words = Array.isArray(items) ? items.map(strOf) : [strOf(item)];
  return Object.freeze({ lineKey: `${pageNumber as number}:${indexes.join(",")}`, text,
    ...(words.every((word) => word !== null) ? { lineText: words.join("\n") } : {}) });
}

const PDF_NATIVE_SERVER_REFUSAL_REASON = /^native_text_transaction_rejected:([a-z0-9-]+)$/;





const PDF_NATIVE_STALE_SOURCE_REASON = "source_identity_stale";

/**
 * The server's answer to a save that appended a native record, when its
 * isolated replay refused that record: the page body is stored (its journal
 * is exactly the one submitted) under a failed receipt whose reason is
 * `native_text_transaction_rejected:<code>`. That is a definite answer, not
 * an ambiguous save: every replay of the same record on the same source
 * refuses it again (a worker that could not run fails otherwise, never with
 * this reason), so there is nothing to repair or to retry. Returns the
 * refusal code, or null when the page does not answer this collection so.
 */
export function readPdfNativeServerRefusal(options: {
  savedPage: PageItem | null | undefined;
  collection: JsonValue | undefined;
}): string | null {
  const { savedPage, collection } = options;
  if (!savedPage || collection === undefined) return null;
  const receipt = readPdfPatchbackReceiptSnapshot(savedPage);
  const reason = receipt?.status === "failed" && typeof receipt.reason === "string" ? receipt.reason : null;
  const code = reason === PDF_NATIVE_STALE_SOURCE_REASON
    ? "source-identity-stale"
    : reason ? PDF_NATIVE_SERVER_REFUSAL_REASON.exec(reason)?.[1] ?? null : null;
  if (!code || !pdfNativeTransactionCollectionMatches(collection, savedPage.content_json)) return null;
  return code;
}

/** Whether the page answered by a put-back is one put back from a record
 * whose file write was never made, with what was saved since written into
 * the file (the server says so on the receipt: `put_back`). The notice after
 * it is not the one of a refused record -- nothing failed a check. */
export function pdfPutBackWroteWhatWasSavedSince(page: PageItem | null | undefined): boolean {
  const receipt = page?.editable_page_patchback;
  return receipt?.status === "succeeded" && receipt.put_back === "saved_since";
}

export type PdfRefusedNativeWriteRestoreOutcome =
  | Readonly<{ status: "restored"; page: PageItem }>
  /** The server proved nothing it was asked to and wrote nothing. */
  | Readonly<{ status: "unproven" }>
  | Readonly<{ status: "failed" }>;

/**
 * Asks the server to put a page whose last native record it refused back
 * at its last good state (`pdf_restore_durable_content`): each stored shape
 * of the body before that save in turn, with the export it last verified
 * (`outputSha256`, that export's digest). The answer is accepted only as the
 * next version of exactly that body under a succeeded receipt (a skipped
 * one for a restore of the original upload).
 */
export async function requestPdfRefusedNativeWriteRestore(options: {
  restore: PdfRefusedNativeWriteRestore;
  outputSha256: string;
  updatePage: (
    pageId: string,
    body: {
      content_json: Record<string, unknown>;
      base_content_version: number;
      pdf_restore_durable_content: PdfRestoreDurableContentRequest;
    },
  ) => Promise<PageItem>;
  isCurrent: () => boolean;
}): Promise<PdfRefusedNativeWriteRestoreOutcome> {
  const { restore, outputSha256 } = options;
  for (const [index, candidate] of restore.candidates.entries()) {
    if (!options.isCurrent()) return { status: "failed" };
    let saved: PageItem | null = null;
    let refusal: unknown = null;
    try {
      saved = await options.updatePage(restore.pageId, {
        content_json: candidate,
        base_content_version: restore.contentVersion,
        pdf_restore_durable_content: {
          expected_incomplete_marker: restore.marker,
          resource_version_id: restore.source.resourceVersionId,
          output_sha256: outputSha256,
        },
      });
    } catch (error) {
      refusal = error;
    }
    if (!saved) {
      // The body is not the one the server stamped (another stored shape
      // may be), or the version or its bytes are not the ones verified.
      const unproven = isApiRequestError(refusal) && refusal.code === "pdf_durable_restore_conflict";
      if (unproven && index < restore.candidates.length - 1) continue;
      return { status: unproven ? "unproven" : "failed" };
    }
    const receipt = readPdfPatchbackReceiptSnapshot(saved);
    if (
      saved.id !== restore.pageId ||
      saved.content_version !== restore.contentVersion + 1 ||
      !pageStoredJsonEquals(saved.content_json, candidate) ||
      !(receipt?.status === "succeeded" ||
        (receipt?.status === "skipped" && restore.source.kind === "original"))
    ) {
      return { status: "failed" };
    }
    return { status: "restored", page: saved };
  }
  return { status: "failed" };
}

export function hasAcceptedPdfPageLabelRepairReceipt(options: {
  pending: PdfPendingPatchbackRepair;
  savedPage: PageItem;
}): boolean {
  const { pending, savedPage } = options;
  const marker = pending.incompleteMarker;
  if (!marker) return false;
  const commit = authenticatePdfDurableContentCommit({
    pageId: pending.pageId,
    submittedContent: pending.content,
    savedPage,
  });
  const receipt = readPdfPatchbackReceiptSnapshot(savedPage);
  return isAcceptedNativePageLabelRepairReceipt({
    exactContentCommit: pdfDurableCommitMatchesPendingRepair(commit, pending),
    markerResourceId: marker.resource_id,
    disallowedResourceVersionIds: [
      marker.resource_version_id,
      marker.repair_auth.last_known_resource_version_id,
      marker.repair_auth.source_resource_version_id,
    ].filter((value): value is string => typeof value === "string" && !!value),
    receipt,
  });
}

export function authenticatePdfCleanLoadedContentAuthority(options: {
  pageId: string;
  loadedPage: PageItem | null;
  current: PdfInsertPageAuthorityState;
}): PdfInsertPageContentAuthority | null {
  const content = options.loadedPage?.content_json;
  if (!content) return null;
  const commit = authenticatePdfDurableContentCommit({
    pageId: options.pageId,
    submittedContent: content,
    savedPage: options.loadedPage,
  });
  if (
    !commit ||
    options.current.pageId !== commit.pageId ||
    options.current.dataItemId !== commit.dataItemId ||
    options.current.sourceSignature !== commit.sourceSignature ||
    options.current.contentVersion !== commit.contentVersion ||
    options.current.inventorySignature !== commit.inventorySignature ||
    options.current.insertedPageCount !== commit.insertedPageCount
  ) {
    return null;
  }
  return Object.freeze({
    kind: "clean_loaded" as const,
    token: crypto.randomUUID(),
    ...commit,
    sourceResourceId: options.current.sourceResourceId,
    sourceRevision: options.current.sourceRevision,
  });
}
