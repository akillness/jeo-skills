"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { CollabNetworkState, PageYjsFailureCause } from "@mrnote/core/web/lib/collab/ws-provider.ts";

/** Room failures that only say the room could not be reached (in time). */
const UNREACHABLE_ROOM_CAUSES: ReadonlySet<PageYjsFailureCause> = new Set([
  "timeout",
  "connection",
  "rate_limited",
]);

/**
 * Transport admission for a document bound to its durable causal originals
 * (an adopted server checkpoint), the canonical Docs path.
 *
 * The room only adds live co-authoring there. The Y.Doc already holds the
 * saved originals before any replay, and every save is a causal PATCH that
 * the server checks against the page's ACL and merges. So only a room that
 * is actually connected decides by its own hello verdict. While it is still
 * connecting, retrying, or could not be reached, the page's own write verdict
 * decides and the document stays editable with autosave (a late replay merges
 * into the same lineage; it cannot seed a second copy).
 *
 * A room that failed with a verdict about the page or its data (access, a
 * changed or frozen session, invalid data, a size limit) keeps the surface
 * read-only as before.
 */
export function canonicalDocumentTransportWritable({
  network,
  pageWritable,
  localAuthorityPending,
}: {
  network: Pick<CollabNetworkState, "connected" | "writable" | "failed" | "failureCause">;
  /** The page-writable verdict the editing surface uses (known and writable). */
  pageWritable: boolean;
  localAuthorityPending: boolean;
}): boolean {
  if (network.connected) return network.writable;
  if (network.failed && !(network.failureCause && UNREACHABLE_ROOM_CAUSES.has(network.failureCause))) {
    return false;
  }
  return pageWritable && !localAuthorityPending;
}














export interface CanonicalWriteHold {
  readonly pageId: string;
  /** The model's verdict the last time it was published with the page verdict known. */
  readonly mayWrite: boolean;
  /** The newest model revision published while the page verdict was unknown. */
  readonly unknownRevision: number | null;
}

export interface CanonicalWriteVerdictInput {
  pageId: string;
  pageVerdictKnown: boolean;
  mayWrite: boolean;
  revision: number;
}

/** Record one published model verdict (see {@link CanonicalWriteHold}). */
export function nextCanonicalWriteHold(
  current: CanonicalWriteHold | null,
  { pageId, pageVerdictKnown, mayWrite, revision }: CanonicalWriteVerdictInput,
): CanonicalWriteHold {
  const same = current?.pageId === pageId ? current : null;
  if (!pageVerdictKnown) {
    return same?.unknownRevision === revision
      ? same
      : { pageId, mayWrite: same?.mayWrite ?? false, unknownRevision: revision };
  }
  // Not republished since the page verdict came back: still the old value.
  if (same && same.unknownRevision === revision) return same;
  return same && same.mayWrite === mayWrite && same.unknownRevision === null
    ? same
    : { pageId, mayWrite, unknownRevision: null };
}

/**
 * The canonical model's write verdict for the editing surface. A verdict the
 * model published while the page verdict was known applies at once; one it
 * published while the page verdict was unknown (or has not refreshed since)
 * keeps the last known one. Autosave still holds every PATCH until the page
 * verdict is known.
 */
export function canonicalSurfaceMayWrite(
  hold: CanonicalWriteHold | null,
  { canonicalReady, ...input }: CanonicalWriteVerdictInput & { canonicalReady: boolean },
): boolean {
  if (input.mayWrite) return true;
  if (!canonicalReady || hold?.pageId !== input.pageId || !hold.mayWrite) return false;
  return !input.pageVerdictKnown || hold.unknownRevision === input.revision;
}

export interface DocumentShellWriteAuthorityInput {
  collaborationEnabled: boolean;
  collaborationSessionReady: boolean;
  guestMode: boolean;
  pageAuthorityKnown: boolean;
  autosaveReadOnly: boolean;
  transportWritable: boolean;
  documentProtectionEditable: boolean;
  /**
   * An Agent run owns this page's body right now: it is writing the document
   * section by section and the window is showing it being written.
   *
   * The server would accept this member's PATCH (the draft page is their own
   * private page), so no permission check refuses it — and that is exactly the
   * trap: the very next section overwrites whatever they typed, silently. The
   * surface stays closed until the draft is published.
   */
  runOwnedDraft: boolean;
}

/**
 * One live predicate for document mutations that sit outside ProseMirror:
 * page title, import picker/drop/paste, uploads and server-native page imports.
 */
export function documentShellWriteAllowed({
  collaborationEnabled,
  collaborationSessionReady,
  guestMode,
  pageAuthorityKnown,
  autosaveReadOnly,
  transportWritable,
  documentProtectionEditable,
  runOwnedDraft,
}: DocumentShellWriteAuthorityInput): boolean {
  return (
    (!collaborationEnabled || collaborationSessionReady) &&
    (!collaborationEnabled || guestMode || pageAuthorityKnown) &&
    !autosaveReadOnly &&
    !runOwnedDraft &&
    transportWritable &&
    documentProtectionEditable
  );
}

export function documentShellEventMayStart({
  liveWriteAllowed,
  operationActive,
}: {
  liveWriteAllowed: boolean;
  operationActive: boolean;
}): boolean {
  return liveWriteAllowed && !operationActive;
}

export function documentAsyncEditorWriteMayContinue({
  liveWriteAllowed,
  viewEditable,
  viewDestroyed,
  documentMatches,
  selectionMatches,
}: {
  liveWriteAllowed: boolean;
  viewEditable: boolean;
  viewDestroyed: boolean;
  documentMatches: boolean;
  selectionMatches: boolean;
}): boolean {
  return (
    liveWriteAllowed &&
    viewEditable &&
    !viewDestroyed &&
    documentMatches &&
    selectionMatches
  );
}

export interface DocumentImportContinuationInput {
  operationCurrent: boolean;
  pageMatches: boolean;
  signalAborted: boolean;
  liveWriteAllowed: boolean;
}

export function documentImportMayContinue({
  operationCurrent,
  pageMatches,
  signalAborted,
  liveWriteAllowed,
}: DocumentImportContinuationInput): boolean {
  return operationCurrent && pageMatches && !signalAborted && liveWriteAllowed;
}

export function retireDocumentImportOnWriteRevoked(
  liveWriteAllowed: boolean,
  operation: { controller: AbortController } | null | undefined,
): boolean {
  if (liveWriteAllowed || !operation || operation.controller.signal.aborted) {
    return false;
  }
  operation.controller.abort();
  return true;
}
