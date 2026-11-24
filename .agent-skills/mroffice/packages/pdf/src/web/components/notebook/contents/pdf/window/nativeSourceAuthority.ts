/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { copyRememberedPdfSourceBytes } from "../../../../../lib/pdf/source-bytes-memo";
import { apiGet, isApiRequestError } from "@mrnote/core/web/lib/api.ts";
import type { JsonValue } from "@mrnote/core/web/lib/collab/json-crdt.ts";
import type { PdfEngineSourceIdentity } from "../../../../../lib/pdf/engine/contracts";
import {
  registerPdfNativeWorkingHead,
} from "../../../../../lib/pdf/remote/pdf-native-sources";
import { sha256PdfBytes } from "../../../../../lib/pdf/engine/native/transaction-error";
import {
  PdfNativeListTextLifecycleError,
  type PdfNativeListTextLifecycleCode,
  type PdfNativeListTextPatchbackAuthority,
} from "../../../../../lib/pdf/engine/native/list-text-command-lifecycle";
import type { PageItem } from "@mrnote/core/web/lib/notebook-sdk.ts";
import {
  loadBoundedPdfForPageWindowMutation,
  PDF_PAGE_WINDOW_MUTATION_FETCH_TIMEOUT_MS,
  PdfMutationSourceHttpError,
} from "../../../../../lib/pdf/page-window-mutation-loader";
import { fetchPdfSource } from "../../../../../lib/pdf/fetch-source";
import {
  getResourceVersionById,
  getResourceVersions,
  listResourcesAll,
  type ResourceRead,
  type ResourceVersionRead,
} from "@mrnote/core/web/lib/resources-sdk.ts";
import type { PdfSourceRiskProfile } from "../../../../../lib/pdf/save-policy";
import type { PdfRibbonTranslator } from "../pdfRibbonTranslator";
import { pdfNativeSourceRiskReadOnlyReason } from "./sourceRisk";
import {
  readPdfPatchbackReceiptSnapshot,
  readPdfNativeListTextPatchbackAuthority,
  samePdfNativeReceipt,
} from "./patchbackReceipts";
import { pdfNativeSavedTransactionCollection } from "./pageContent";
import {
  exactOriginalPdfResourceVersion,
  exactPatchedPdfResourceVersion,
  readPdfNativeMutationReplayAuthority,
  recoverPdfNativeListTextPatchbackAuthority,
  readCurrentPdfNativeListTextReplayAuthority,
} from "./nativeJournalRecovery";

export interface PdfNativeListTextSourceAuthority {
  readonly source: PdfEngineSourceIdentity;
  readonly bytes: Uint8Array;
}

export interface PdfNativeListTextSourceAuthorityRequest {
  readonly notebookId: string;
  readonly pageId: string;
  readonly dataItemId: string;
  readonly dataItemSha256: string | null;
  readonly previewUrl: string;
  readonly expectedSourceSha256: string;
  readonly patchback: PdfNativeListTextPatchbackAuthority | null;
}

export class PdfNativeSourceMetadataTimeoutError extends Error {
  constructor() {
    super("PDF source metadata request timed out");
    this.name = "PdfNativeSourceMetadataTimeoutError";
  }
}

export class PdfNativeSourceMetadataTransportError extends Error {
  constructor(error: unknown) {
    super(
      error instanceof Error
        ? error.message
        : "PDF source metadata request failed before a response was received",
    );
    this.name = "PdfNativeSourceMetadataTransportError";
  }
}

export function pdfNativeSourceMetadataRequestWasAborted(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}







export const PDF_SOURCE_METADATA_TIMEOUT_MS = Math.max(PDF_PAGE_WINDOW_MUTATION_FETCH_TIMEOUT_MS, 30_000);

/** The digest of the export a page refused a record on goes back to, as its
 * resource names it for this page; null when the resource does not name that
 * version. The server checks it against the version and the bytes again. */
export async function pdfRefusedRestoreExportSha256(input: {
  restore: Readonly<{
    pageId: string;
    marker: Readonly<{ resource_id?: string | null }>;
    source: Readonly<{ kind: string; resourceVersionId?: string | null }>;
  }>;
  notebookId: string | null | undefined;
  dataItemId: string | null | undefined;
}): Promise<string | null> {
  const { restore, notebookId, dataItemId } = input;
  if (!notebookId || !dataItemId || !restore.source.resourceVersionId) return null;
  const resources = await listResourcesAll({ notebookId, kind: "pdf", sourceDataItemId: dataItemId });
  const matches = resources.filter((resource) =>
    resource.kind === "pdf" && resource.source_data_item_id === dataItemId &&
    resource.id === restore.marker.resource_id);
  const metadata: Record<string, unknown> = matches.length === 1 ? matches[0].metadata_json ?? {} : {};
  const sha = metadata.last_editable_page_output_sha256;
  return metadata.last_editable_page_export_version_id === restore.source.resourceVersionId &&
    metadata.last_editable_page_id === restore.pageId &&
    typeof sha === "string" && /^[a-f\d]{64}$/i.test(sha)
    ? sha.toLowerCase()
    : null;
}

export async function readPdfNativeSourceMetadataAttempt(
  input: PdfNativeListTextSourceAuthorityRequest,
): Promise<{
  resource: ResourceRead;
  versions: ResourceVersionRead[];
}> {
  const controller = new AbortController();
  const timeoutError = new PdfNativeSourceMetadataTimeoutError();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(timeoutError);
    }, PDF_SOURCE_METADATA_TIMEOUT_MS);
  });
  const loading = (async () => {
    const resources = await listResourcesAll(
      {
        notebookId: input.notebookId,
        kind: "pdf",
        sourceDataItemId: input.dataItemId,
      },
      { signal: controller.signal },
    );
    const matches = resources.filter(
      (resource) =>
        resource.kind === "pdf" &&
        resource.source_data_item_id === input.dataItemId,
    );
    if (matches.length !== 1) {
      throw new PdfNativeListTextLifecycleError(
        "source-not-ready",
        "The PDF resource identity is missing or ambiguous.",
      );
    }
    const resource = matches[0];
    return {
      resource,
      versions: await getResourceVersions(resource.id, {
        signal: controller.signal,
      }),
    };
  })();
  try {
    return await Promise.race([loading, timeout]);
  } catch (error) {
    if (
      controller.signal.aborted ||
      pdfNativeSourceMetadataRequestWasAborted(error)
    ) {
      throw timeoutError;
    }
    if (isApiRequestError(error) && error.status === 0) {
      throw new PdfNativeSourceMetadataTransportError(error);
    }
    throw error;
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }
}

/**
 * The resource and version list a write last read for exactly this source
 * (page, data item, source digest, receipt version), for a short while.
 * Every native write read them again -- two requests, 0.1-0.5 s, seconds
 * under load -- although consecutive writes of one source read the same
 * answer; the accept of a write reads the very key the next write asks
 * for. The server still checks the version on every write (a stale answer
 * can only make it refuse), and only successful reads are kept.
 */
const SOURCE_METADATA_MEMO_MS = 30_000;
const sourceMetadataMemo = new Map<string, {
  at: number;
  value: { resource: ResourceRead; versions: ResourceVersionRead[] };
}>();
/** The read of a source in flight: the line being opened, the working copy
 * opened for it and the line pressed next all wait on the one read, not on
 * one each (a loaded server answers them one after another). */
const sourceMetadataInFlight = new Map<string, Promise<{ resource: ResourceRead; versions: ResourceVersionRead[] }>>();

function sourceMetadataMemoKey(input: PdfNativeListTextSourceAuthorityRequest): string {
  return JSON.stringify([
    input.notebookId, input.pageId, input.dataItemId,
    input.expectedSourceSha256.toLowerCase(),
    input.patchback?.resourceVersionId ?? null,
    input.patchback?.outputSha256 ?? null,
  ]);
}

/** The resource and the one version a receipt names, as last read for a
 * source (readPdfNativeReceiptSourceRows): kept apart from the whole lists
 * above, which a recovery walks version by version. */
const receiptSourceRowsMemo = new Map<string, {
  at: number;
  value: { resource: ResourceRead; versions: ResourceVersionRead[] };
}>();
const receiptSourceRowsInFlight = new Map<string, Promise<{ resource: ResourceRead; versions: ResourceVersionRead[] }>>();

/** Drops every remembered answer (a refused write, a source change). */
export function forgetPdfNativeSourceMetadata(): void {
  sourceMetadataMemo.clear();
  sourceMetadataInFlight.clear();
  receiptSourceRowsMemo.clear();
  receiptSourceRowsInFlight.clear();
}

export async function readPdfNativeSourceMetadata(
  input: PdfNativeListTextSourceAuthorityRequest,
): Promise<{
  resource: ResourceRead;
  versions: ResourceVersionRead[];
}> {
  // Unit suites mock a fresh server per test; a module memo would leak.
  const memoize = process.env.NODE_ENV !== "test";
  const key = sourceMetadataMemoKey(input);
  const remembered = memoize ? sourceMetadataMemo.get(key) : undefined;
  if (remembered && Date.now() - remembered.at <= SOURCE_METADATA_MEMO_MS) {
    return { resource: { ...remembered.value.resource }, versions: remembered.value.versions.map((version) => ({ ...version })) };
  }
  const copy = (value: { resource: ResourceRead; versions: ResourceVersionRead[] }) =>
    ({ resource: { ...value.resource }, versions: value.versions.map((version) => ({ ...version })) });
  const shared = memoize ? sourceMetadataInFlight.get(key) : undefined;
  if (shared) return copy(await shared);
  const reading = readPdfNativeSourceMetadataFresh(input, key, memoize);
  if (!memoize) return reading;
  sourceMetadataInFlight.set(key, reading);
  try {
    return copy(await reading);
  } finally {
    if (sourceMetadataInFlight.get(key) === reading) sourceMetadataInFlight.delete(key);
  }
}

async function readPdfNativeSourceMetadataFresh(
  input: PdfNativeListTextSourceAuthorityRequest,
  key: string,
  memoize: boolean,
): Promise<{
  resource: ResourceRead;
  versions: ResourceVersionRead[];
}> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const value = await readPdfNativeSourceMetadataAttempt(input);
      for (const [stale, entry] of sourceMetadataMemo) {
        if (Date.now() - entry.at > SOURCE_METADATA_MEMO_MS) sourceMetadataMemo.delete(stale);
      }
      if (memoize) sourceMetadataMemo.set(key, {
        at: Date.now(),
        value: { resource: { ...value.resource }, versions: value.versions.map((version) => ({ ...version })) },
      });
      return value;
    } catch (error) {
      const retryable =
        error instanceof PdfNativeSourceMetadataTimeoutError ||
        error instanceof PdfNativeSourceMetadataTransportError;
      if (!retryable || attempt === 1) throw error;
    }
  }
  throw new Error("Unreachable PDF source metadata state");
}

















export async function readPdfNativeReceiptSourceRows(
  input: PdfNativeListTextSourceAuthorityRequest,
  options?: Readonly<{ narrow?: boolean }>,
): Promise<{ resource: ResourceRead; versions: ResourceVersionRead[] }> {
  const patchback = input.patchback;
  // Unit suites mock the server request by request: they keep the whole
  // reads unless a test asks for this one.
  const narrow = options?.narrow ?? process.env.NODE_ENV !== "test";
  if (!patchback || !narrow) return readPdfNativeSourceMetadata(input);
  const key = sourceMetadataMemoKey(input);
  const copy = (value: { resource: ResourceRead; versions: ResourceVersionRead[] }) =>
    ({ resource: { ...value.resource }, versions: value.versions.map((version) => ({ ...version })) });
  const whole = sourceMetadataMemo.get(key);
  if (whole && Date.now() - whole.at <= SOURCE_METADATA_MEMO_MS) return copy(whole.value);
  const remembered = receiptSourceRowsMemo.get(key);
  if (remembered && Date.now() - remembered.at <= SOURCE_METADATA_MEMO_MS) return copy(remembered.value);
  const shared = receiptSourceRowsInFlight.get(key);
  if (shared) return copy(await shared);
  const reading = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PDF_SOURCE_METADATA_TIMEOUT_MS);
    try {
      const [resources, versions] = await Promise.all([
        listResourcesAll({ notebookId: input.notebookId, kind: "pdf", sourceDataItemId: input.dataItemId },
          { signal: controller.signal }),
        getResourceVersionById(patchback.resourceId, patchback.resourceVersionId, { signal: controller.signal }),
      ]);
      const matches = resources.filter((resource) =>
        resource.kind === "pdf" && resource.source_data_item_id === input.dataItemId);
      const named = versions.filter((version) => version.id === patchback.resourceVersionId);
      if (matches.length !== 1 || matches[0].id !== patchback.resourceId || named.length !== 1) return null;
      return { resource: matches[0], versions: named };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  })().then(async (rows) => {
    if (!rows) return readPdfNativeSourceMetadata(input);
    for (const [stale, entry] of receiptSourceRowsMemo) {
      if (Date.now() - entry.at > SOURCE_METADATA_MEMO_MS) receiptSourceRowsMemo.delete(stale);
    }
    receiptSourceRowsMemo.set(key, { at: Date.now(), value: copy(rows) });
    return rows;
  });
  receiptSourceRowsInFlight.set(key, reading);
  try {
    return copy(await reading);
  } finally {
    if (receiptSourceRowsInFlight.get(key) === reading) receiptSourceRowsInFlight.delete(key);
  }
}

/**
 * The resource and the version a save's own response names for its receipt
 * (`editable_page_patchback_source`: the two rows as the resource routes
 * answer the saver, read in the save's own request): remembered as the
 * answer `readPdfNativeReceiptSourceRows` would fetch for that source, so
 * the save's acceptance and the write after it ask for neither. Rows that
 * are not that resource and that version of it for this data item are not
 * kept (the reads then decide as before). False where nothing was kept.
 */
export function rememberPdfNativeReceiptSourceRows(
  input: PdfNativeListTextSourceAuthorityRequest,
  carried: Readonly<{ resource?: unknown; version?: unknown }> | null | undefined,
): boolean {
  const patchback = input.patchback;
  const resource = carried?.resource as ResourceRead | null | undefined;
  const version = carried?.version as ResourceVersionRead | null | undefined;
  if (!patchback || !resource || !version || typeof resource !== "object" || typeof version !== "object" ||
    resource.id !== patchback.resourceId || resource.kind !== "pdf" ||
    resource.source_data_item_id !== input.dataItemId ||
    version.id !== patchback.resourceVersionId || version.resource_id !== resource.id) return false;
  receiptSourceRowsMemo.set(sourceMetadataMemoKey(input), {
    at: Date.now(),
    value: { resource: { ...resource }, versions: [{ ...version }] },
  });
  return true;
}

export async function resolvePdfNativeListTextSourceAuthority(
  input: PdfNativeListTextSourceAuthorityRequest,
  copySourceBytes?: () => Uint8Array | null,
): Promise<PdfNativeListTextSourceAuthority> {
  let ownedBytes = copySourceBytes?.() ?? null;
  if (copySourceBytes && !ownedBytes) {
    throw new PdfNativeListTextLifecycleError("source-mismatch", "The rendered PDF source changed before preparation.");
  }
  let transferred = false;
  try {
  // The resource and version reads come first: a receipt whose version the
  // server does not list as current is refused before any bytes are asked
  // for (a retired transport URL is renewed only for the pinned version).
  const { resource, versions } = await readPdfNativeReceiptSourceRows(input);
  const dataItemSha256 = input.dataItemSha256?.trim().toLowerCase() ?? "";
  const originalResourceSha256 = resource.sha256?.trim().toLowerCase() ?? "";
  const expectedSourceSha256 = input.expectedSourceSha256.toLowerCase();
  if (
    !/^[a-f\d]{64}$/.test(expectedSourceSha256) ||
    !/^[a-f\d]{64}$/.test(originalResourceSha256) ||
    (dataItemSha256 && dataItemSha256 !== originalResourceSha256) ||
    (input.patchback
      ? input.patchback.outputSha256 !== expectedSourceSha256
      : originalResourceSha256 !== expectedSourceSha256)
  ) {
    throw new PdfNativeListTextLifecycleError(
      "source-mismatch",
      "The PDF resource SHA no longer matches the selected text.",
    );
  }
  const currentVersion = input.patchback
    ? exactPatchedPdfResourceVersion(
        resource,
        versions,
        input.patchback,
        input.pageId,
      )
    : exactOriginalPdfResourceVersion(resource, versions);
  const loadSource = async () => {
    try {
      return await loadBoundedPdfForPageWindowMutation(input.previewUrl, fetchPdfSource);
    } catch (error) {
      if (!(error instanceof PdfMutationSourceHttpError) ||
        (error.status !== 403 && error.status !== 410)) throw error;
      // The preview's storage URL is a short-lived transport lease. Renew
      // only the exact version authenticated above, never choose a newer
      // source or accept different bytes to make an old edit succeed.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PDF_PAGE_WINDOW_MUTATION_FETCH_TIMEOUT_MS);
      try {
        const ticket = await apiGet<{ download_url: string }>(
          `/api/v1/resources/${resource.id}/versions/${currentVersion.id}/download`,
          { signal: controller.signal },
        );
        return await loadBoundedPdfForPageWindowMutation(ticket.download_url, fetchPdfSource);
      } finally {
        clearTimeout(timeout);
      }
    }
  };
  // The reader remembers the bytes it is showing; a copy of them spares the
  // download (seconds under load) and is hashed like any other source.
  const remembered = ownedBytes ? null : copyRememberedPdfSourceBytes(expectedSourceSha256);
  let loaded = ownedBytes
    ? { bytes: ownedBytes }
    : remembered
      ? { bytes: remembered }
      : await loadSource();
  ownedBytes = loaded.bytes;
  let loadedSha256 = await sha256PdfBytes(loaded.bytes);
  if (remembered && loadedSha256 !== expectedSourceSha256) {
    // Not the bytes it claims to be: fetch the real ones as before.
    remembered.fill(0);
    loaded = await loadSource();
    ownedBytes = loaded.bytes;
    loadedSha256 = await sha256PdfBytes(loaded.bytes);
  }
  if (loadedSha256 !== expectedSourceSha256) {
    loaded.bytes.fill(0);
    throw new PdfNativeListTextLifecycleError(
      "source-mismatch",
      "The currently rendered PDF bytes no longer match the original resource.",
    );
  }
  transferred = true;
  // The planners run on the server: they find this head by its digest.
  registerPdfNativeWorkingHead(expectedSourceSha256, {
    pageId: input.pageId, resourceId: resource.id, resourceVersionId: currentVersion.id,
  });
  return Object.freeze({
    source: Object.freeze({
      resourceId: resource.id,
      resourceVersionId: currentVersion.id,
      sourceSha256: expectedSourceSha256,
    }),
    bytes: loaded.bytes,
  });
  } finally {
    if (!transferred) ownedBytes?.fill(0);
  }
}

export function pdfNativeListTextLifecycleMessage(
  code: PdfNativeListTextLifecycleCode,
  t: PdfRibbonTranslator,
  profile?: PdfSourceRiskProfile | null,
): string {
  if (code === "source-not-ready") {
    const terminalReason = pdfNativeSourceRiskReadOnlyReason({
      profile: profile ?? null,
      t,
      subject: "text",
    });
    if (terminalReason) return terminalReason;
  }
  const messages: Record<PdfNativeListTextLifecycleCode, string> = {
    "read-only": "pdf.pageWindow.lifecycleReadOnly",
    "source-not-ready": "pdf.pageWindow.lifecycleSourceNotReady",
    encrypted: "pdf.pageWindow.lifecycleEncrypted",
    signed: "pdf.pageWindow.lifecycleSigned",
    "native-replay-pending": "pdf.pageWindow.lifecycleNativeReplayPending",
    "native-writeback-failed": "pdf.pageWindow.lifecycleNativeWritebackFailed",
    "native-chain-exhausted": "pdf.pageWindow.lifecycleNativeChainExhausted",
    "imported-page": "pdf.pageWindow.importedPageNotEditable",
    "selection-required": "pdf.pageWindow.lifecycleSelectionRequired",
    "page-drift": "pdf.pageWindow.lifecyclePageDrift",
    "selection-drift": "pdf.pageWindow.lifecycleSelectionDrift",
    "source-mismatch": "pdf.pageWindow.lifecycleSourceMismatch",
    "invalid-replacement": "pdf.pageWindow.lifecycleInvalidReplacement",
  };
  return t(messages[code]);
}

export async function authenticatePdfNativeListTextSavedPage(options: {
  pageId: string;
  collection: JsonValue;
  savedPage: PageItem | null | undefined;
}): Promise<boolean> {
  const { savedPage } = options;
  const saved = savedPage && savedPage.id === options.pageId
    ? pdfNativeSavedTransactionCollection(options.collection, savedPage.content_json)
    : null;
  if (!savedPage || saved === null) {
    return false;
  }
  const collection = saved;
  const patchback = readPdfNativeListTextPatchbackAuthority(
    readPdfPatchbackReceiptSnapshot(savedPage),
  );
  const replay = readPdfNativeMutationReplayAuthority({
    collection,
    patchback,
    renderedSourceSha256: patchback?.outputSha256 ?? null,
  });
  if (replay.state === "current" || replay.state === "exhausted") return true;
  const dataItemId = savedPage.content_json?.dataItemId;
  if (!patchback || typeof dataItemId !== "string" || typeof savedPage.notebook_id !== "string") return false;
  try {
    const metadata = await readPdfNativeSourceMetadata({
      notebookId:savedPage.notebook_id, pageId:options.pageId, dataItemId,
      dataItemSha256:null, previewUrl:"", expectedSourceSha256:patchback.outputSha256, patchback,
    });
    const authority = await recoverPdfNativeListTextPatchbackAuthority({
      pageId:options.pageId, collection, ...metadata,
    });
    if (!authority || !samePdfNativeReceipt(authority, patchback)) return false;
    const recovered = readCurrentPdfNativeListTextReplayAuthority({
      collection, patchback:authority, renderedSourceSha256:patchback.outputSha256,
    });
    return recovered.state === "current" || recovered.state === "exhausted";
  } catch { return false; }
}

/** The bytes of one saved version of the page's PDF (the reader's copy when
 * it holds them, else downloaded and checked against `sha256`); null when
 * they cannot be had. A working copy queued behind a save the server rewrote
 * plans its edits again on them (native-working-session `loadSavedBytes`). */
export async function loadPdfNativeSavedVersionBytes(source: PdfEngineSourceIdentity): Promise<Uint8Array | null> {
  const expected = source.sourceSha256.toLowerCase();
  const remembered = copyRememberedPdfSourceBytes(expected);
  if (remembered) return remembered;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PDF_PAGE_WINDOW_MUTATION_FETCH_TIMEOUT_MS);
  try {
    const ticket = await apiGet<{ download_url: string }>(
      `/api/v1/resources/${source.resourceId}/versions/${source.resourceVersionId}/download`,
      { signal: controller.signal },
    );
    const loaded = await loadBoundedPdfForPageWindowMutation(ticket.download_url, fetchPdfSource);
    if (await sha256PdfBytes(loaded.bytes) !== expected) { loaded.bytes.fill(0); return null; }
    return loaded.bytes;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
