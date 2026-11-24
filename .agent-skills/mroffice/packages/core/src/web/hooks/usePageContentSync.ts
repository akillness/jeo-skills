"use client";


































/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Awareness } from "y-protocols/awareness";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import * as Y from "yjs";

import {
  createCollabSession,
  type CollabSession,
} from "../lib/collab/collab-provider";
import {
  applyJsonDelta,
  type AmbiguousTextWrite,
  collaborativeTextAnchor,
  collaborativeTextAt,
  collaborativeTextChanges,
  collaborativeTextEditsFor,
  composeCollaborativeTextChanges,
  createJsonCollaborationHistory,
  watchConcurrentKeyedCreations,
  noteKeyedCreationEdits,
  jsonEquals,
  jsonValueAt,
  resolveCollaborativeTextAnchor,
  shareUnchangedJson,
  upgradeCollaborativeText,
  withUndrawnDelivery,
  type UndrawnTextItems,
  withJsonValueAt,
  withTextContainerWords,
  yToJson,
  yToJsonShared,
  type CollaborativeTextChange,
  type CollaborativeTextEdit,
  type JsonValue,
} from "../lib/collab/json-crdt";
import { CollaborativeTextKeys, OrphanTextEdits, textKeyWritten, writeWaitingTextEdits } from "../lib/collab/collab-text-keys";
import { remoteUpdateBeingApplied } from "../lib/collab/remote-update-payload";
import { SERVER_OWNED_PAGE_ROOT_KEYS } from "../lib/import-losses";
import { USE_COLLAB_EDITING } from "../lib/code-runner/editor-flags";
import { createRoomCustodyPump, roomCustodyPumpEnabled } from "../lib/collab/room-custody-pump";
import { closingBytesBase64 } from "../lib/page-closing-edits";
import { sendPageCustodyEdits } from "../lib/page-collab-sdk";
import { createPageCausalModelStatus, type PageYjsFailureCause } from "../lib/collab/ws-provider";
import type { PageItem } from "../lib/notebook-sdk";
import {
  applyPageCausalRecovery, capturePageCausalRecovery, pageForCausalCheckpoint, pdfPageUsesAuthorCausalModel,
  capturePageCausalCheckpoint, durablePageSnapshotOffer, preparePageCausalCheckpoint, preparePageCausalSaveReceipt,
  PageCausalCheckpointError, type PageCausalRecovery, type PageCausalCheckpoint, type PreparedPageCausalCheckpoint,
} from "../lib/collab/page-causal-checkpoint";
import { withPdfDurableJournal } from "../lib/collab/pdf-page-causal-model";
import {
  useWorkbookShardedContentSync,
  type WorkbookPresenceController,
  type WorkbookShardedSyncController,
  type WorkbookShardedPersistenceReceipt,
  type WorkbookShardedSyncMode,
} from "./useWorkbookShardedContentSync";
import type { WorkbookContentDocument } from "@/lib/collab/workbook-shards";

const ROOT_KEY = "page-json";
const INITIAL_ORIGIN = Symbol("mrn-page-json-seed");
/** How long after the editor took a document a collaborator's characters in
 *  it are still not taken as drawn (`UndrawnTextItems`): a frame refit
 *  commits a cell's older words within a few hundred milliseconds. */
const UNDRAWN_TEXT_DRAW_MS = 1_000;
/** The longest a collaborator's characters are kept from a comparison's
 *  deletion without the editor showing them. */
const UNDRAWN_TEXT_KEPT_AT_MOST_MS = 30_000;
const PAGE_AUTHORITY_KEY_PATTERN =
  /^(known|unknown):(writable|readonly):(none|read_only_tier|role|locked)$/u;

export type PageContentDocument = Record<string, JsonValue>;

/** What a delivery of a peer's change knows beyond the merged document. */
export interface PageRemoteContentDetail {
  /** The collaborative texts the change edited, as the room's own deltas
   * (exact positions, for carrying a caret across it). */
  textChanges?: readonly CollaborativeTextChange[];
  /** This member's carets in the texts the change edited, carried by the
   * room's relative positions (`anchorTextCaret`, and the caret each key
   * written at once left): where each now stands in the delivered text
   * (`text`), and where it stood before (`from`). */
  carets?: readonly (PageCollaborativeTextCaret & { from: Omit<PageCollaborativeTextCaret, "path"> })[];
}

/** This member's text edit at a collaborative text's JSON path. */
export interface PageCollaborativeTextEdit extends CollaborativeTextEdit {
  path: readonly string[];
  /** The text's container (a slide object, a table cell) before and after
   * the edit. Given, the room writes the edit at once, when it is typed
   * (json-crdt `writeCollaborativeTextContainer`), instead of with the next
   * publication of the whole document. */
  container?: { previous: Record<string, JsonValue>; next: Record<string, JsonValue> };
}






const textEditOutcomes: Record<string, number> = {};
export function noteTextEditOutcome(outcome: string): void {
  textEditOutcomes[outcome] = (textEditOutcomes[outcome] ?? 0) + 1;
  if (typeof window !== "undefined") (window as unknown as { __mraiCoeditEdits?: Record<string, number> }).__mraiCoeditEdits = textEditOutcomes;
}

/** Whether the page asked for the edited texts' timeline (`coeditTrace`). */
export function coeditTraceOn(): boolean {
  return typeof window !== "undefined" && Boolean((window as unknown as { __mraiCoeditTraceOn?: boolean }).__mraiCoeditTraceOn);
}




export function coeditTrace(event: string, detail: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const host = window as unknown as { __mraiCoeditTraceOn?: boolean; __mraiCoeditTrace?: unknown[] };
  if (!host.__mraiCoeditTraceOn) return;
  const trace = (host.__mraiCoeditTrace ??= []);
  if (trace.length < 4000) trace.push([Math.round(performance.now()), event, detail]);
}

/** The last text a key was noted in, in any room (`coeditTrace`). */
let coeditTracedPath: readonly string[] | undefined;
export function coeditTraceDoc(event: string, doc: unknown, detail: Record<string, unknown> = {}): void {
  coeditTrace(event, { ...detail, text: coeditTail(doc, coeditTracedPath) });
}

/** The last characters of the text at `path` (the last traced one) of a
 * document (for `coeditTrace`). */
export function coeditTail(doc: unknown, path: readonly string[] | undefined = coeditTracedPath): string | null {
  if (!path || typeof window === "undefined" || !(window as unknown as { __mraiCoeditTraceOn?: boolean }).__mraiCoeditTraceOn) return null;
  const value = jsonValueAt(doc as JsonValue, path);
  return typeof value === "string" ? value.slice(-24) : null;
}

/** The text containers written into the room when typed (`noteTextEdit`),
 * each as the room holds it after the key, numbered in order. */
interface TextWriteLog {
  seq: number;
  /** `held`: the container as the editor holds it once it draws its key --
   * the room's words, every other field as the editor had it (a
   * collaborator's format of the object it had not drawn stays out). */
  entries: Array<{ seq: number; path: readonly string[]; held: Record<string, JsonValue> }>;
}
/** Kept for documents a render or two behind; older ones are not handed back. */
const TEXT_WRITE_LOG_LIMIT = 512;












function withTextWritesSince<T extends PageContentDocument | null | undefined>(
  content: T,
  log: TextWriteLog,
  made: WeakMap<object, number>,
): T {
  if (!content) return content;
  const doc = content as PageContentDocument;
  const at = made.get(doc);
  if (at === undefined || at >= log.seq) return content;
  let out: JsonValue = doc;
  for (const entry of log.entries) {
    if (entry.seq <= at) continue;
    out = withJsonValueAt(out, entry.path, entry.held);
  }
  if (out !== doc) made.set(out as object, log.seq);
  return out as unknown as T;
}

/** How a noted text edit went: written into the room's words it was typed
 * in ("written"), carried over a collaborator's characters the editor had not
 * drawn and written there, the room's words then delivered to the editor
 * ("carried"), or left for the next publication (anything else). */
export type PageTextEditOutcome = "written" | "carried" | "carried-by-words" | (string & {});

/** A caret of this member's in a collaborative text, as the room carried it
 * across a peer's change (`PageRemoteContentDetail.carets`). */
export interface PageCollaborativeTextCaret {
  path: readonly string[];
  /** The text the caret was placed in (this member's view of it). */
  text: string;
  start: number;
  end: number;
}

export type PageMaintenanceApplyResult = { status: "accepted"; content: PageContentDocument } |
  { status: "changed" | "unavailable" };
export type PreparedPageMaintenanceApply = (
  content: PageContentDocument, guardKeys?: readonly string[],
) => PageMaintenanceApplyResult;

export interface PageContentSyncOptions {
  /** Page id — doubles as the collaboration room name. */
  pageId: string | null | undefined;
  /** The editor's CURRENT document (plain JSON). */
  content: PageContentDocument | null | undefined;
  /** Called with the room's document when a PEER changes it. */
  onRemoteContent: (content: PageContentDocument, detail?: PageRemoteContentDetail) => void;
  /** Off for guest/preview surfaces, or while the editor is still loading. */
  enabled?: boolean;
  /**
   * Stable page-authority epoch. A change replaces the socket/Y.Doc so a
   * connect-time writable verdict cannot survive a grant or revocation.
   */
  authorityKey?: string;
  /**
   * Per-user view state that must stay local (active sheet, scroll anchors,
   * reference style…). Stripped from what we publish AND from what we apply.
   */
  privateKeys?: readonly string[];
  /** Spreadsheet-only V2 transport; other editors retain the page room. */
  strategy?: "page" | "workbook-sharded-v2";
  /** Durable page revision consumed by the V2 materializer CAS. */
  contentVersion?: number | null;
  /** Exact REST receipt, never the displayed page with an overlaid draft. */
  durablePage?: PageItem | null;
  /** Account/session identity of the exact REST source, not its content version. */
  sourceScopeKey?: string;
  /** Rechecked after async validation (account/workspace/activation scope). */
  isCausalScopeCurrent?: () => boolean;
  activateCausal?: (page: PageItem, checkpoint: PageCausalCheckpoint) => Promise<PageItem>;
  onCausalReconnect?: () => void;
  /** The durable page this view's causal model was set up from was refused
   * as a checkpoint (identity_mismatch, invalid, projection_mismatch): the
   * caller reads the page whole again at once; a new durable page sets the
   * model up again. */
  onCausalSourceRefused?: (code: string) => void;
  /** A text this member changed could not be written over a collaborator's
   * change of it without guessing where the change goes (json-crdt
   * `mergeText3` null): the room kept its text, this member's stays in the
   * editor, and the owner treats it as a conflict (TRIAGE 47: merged by a
   * guess, words typed at one place came out cut in two). */
  onTextMergeRefused?: (writes: readonly AmbiguousTextWrite[]) => void;
  /** Only the original restored generation, not every subsequent draft. */
  recoveredCausalDraft?: { recovery: PageCausalRecovery; content: PageContentDocument } | null;
}

export interface PageContentSyncController {
  mode: WorkbookShardedSyncMode;
  presence: WorkbookPresenceController | null;
  /** The page room's presence, while a room is bound (live ink goes out in it). */
  awareness?: Awareness | null;
  /** Observe an already-submitted save without granting a new write. */
  getPendingContentSave?: (
    content: Record<string, JsonValue>, basePageContentVersion: number,
  ) => Promise<WorkbookShardedPersistenceReceipt | null> | null;
  persistContent: (
    content: PageContentDocument,
    basePageContentVersion: number,
  ) => Promise<WorkbookShardedPersistenceReceipt | null>;
  /** Start a blocked sharded workbook's sessions again (explicit Retry). */
  recover?: () => boolean;
  /** A sharded workbook replaced as a whole by the server (a version
   * restore): leave its rooms, then open them again from the replacing page. */
  suspendForReplacement?: WorkbookShardedSyncController["suspendForReplacement"];
  reopenAfterReplacement?: WorkbookShardedSyncController["reopenAfterReplacement"];
  /** A sharded workbook: why saving cannot complete now; null while it can. */
  holdReason?: WorkbookShardedSyncController["holdReason"];
  /** A sharded workbook: a save still with the server, every edit merged. */
  saveSlow?: WorkbookShardedSyncController["saveSlow"];
  roomsAheadOfSave?: WorkbookShardedSyncController["roomsAheadOfSave"];
  /** A sharded workbook: what a recovery copy of its body needs from the
   * rooms, and merging such a copy back after a reopen. */
  sendClosingEdits?: WorkbookShardedSyncController["sendClosingEdits"];
  behindPageVersion?: WorkbookShardedSyncController["behindPageVersion"];
  mergeEditsBehindRooms?: WorkbookShardedSyncController["mergeEditsBehindRooms"];
  captureRecoveryCustody?: WorkbookShardedSyncController["captureRecoveryCustody"];
  holdsRecoveredEdits?: WorkbookShardedSyncController["holdsRecoveredEdits"];
  mergeRecoveredWorkbook?: WorkbookShardedSyncController["mergeRecoveredWorkbook"];
  history?: PageContentHistoryController;
  /** The text edit the next local content carries (a keystroke), so it is
   * written into the room where it was typed rather than where a string
   * comparison of the two documents would put it. */
  noteTextEdit?: (edit: PageCollaborativeTextEdit) => PageTextEditOutcome | void;
  /** Whether a key typed (`noteTextEdit`) waits outside the room for the next
   * publication (the room took no writes when it was typed): edits the room's
   * acknowledgements do not cover yet. */
  textEditsWaiting?: () => boolean;
  /** This member's caret in a collaborative text, kept by the room as
   * relative positions so a delivery says where it now stands
   * (`PageRemoteContentDetail.carets`). Ignored unless `text` is the room's. */
  anchorTextCaret?: (caret: PageCollaborativeTextCaret) => void;
  /** Publish the latest local gesture and dispatch its queued transport data.
   * Returns the merged projection; never claims durable page storage. */
  flushContent?: (content?: PageContentDocument) => PageContentDocument | null;
  /** The page's room is gone for good (its transport failed: a startup
   * past its budget, retries run out) and this view holds no causal
   * checkpoint: it edits alone, as a page with no room does, so a save is
   * of its own body (flushContent has no projection to give). */
  roomUnavailable?: () => boolean;
  causal?: {
    status: "preparing" | "ready" | "failed";
    saved: boolean;
    readContent: () => PageContentDocument | null;
    mirror: (content: PageContentDocument) => PageContentDocument | null;
    capture: (content: PageContentDocument, baseTitle: string) =>
      { recovery: PageCausalRecovery; content: PageContentDocument } | null;
    /** Capture the room as it is, publishing nothing (the editor's content is
     * left alone): the first capture of a large page encodes its whole state
     * and its local copy stores a base, done while the editor is idle after
     * it opens instead of at the first save typed into (a deck's room only). */
    warm?: (baseTitle: string) => { recovery: PageCausalRecovery; content: PageContentDocument } | null;
    adopt: (page: PageItem, canApply?: () => boolean) => Promise<boolean>;
    /** Direct response to our own verified causal PATCH, after its source was
     * merged locally. Newly returned canonical fields are not a peer edit. */
    adoptSaveReceipt: (page: PageItem, submitted: {
      recovery: PageCausalRecovery; content: PageContentDocument;
    }) => Promise<boolean>;
    /** Validate originals asynchronously, then recheck and apply synchronously
     * with the caller's native-source acceptance bookkeeping. */
    prepareMaintenance: (beforePage: PageItem, afterPage: PageItem) => Promise<PreparedPageMaintenanceApply | null>;
    /** Content-free state for save diagnostics (lib/page-save-diagnostics):
     * why the model failed, why the last capture returned nothing, whether
     * it was ever bound to a durable identity, and the view's unbound draft. */
    diagnostics?: () => { failure: string | null; captureRefusal: string | null; bound: boolean; unboundDraft: boolean;
      /** Where a refused body first differs from the room (structure only). */
      mirrorMiss?: string | null; roomBodySaves?: number; captureFallback?: string | null };
    /** The room this view holds the page through is connected and in step
     * right now: a save another live member made reached it already. */
    liveInRoom?: () => boolean;
    /** The room keeps this window's updates in the database and confirms
     * them (a deck's causal room on a server that does): `settled` once
     * every update this window made is kept. A save then has nothing to send
     * for the body (the server writes it into the page itself). */
    durableUpdates?: () => { active: boolean; settled: boolean; refusal: string | null; sequence?: number | null };
    subscribeDurableUpdates?: (listener: () => void) => () => void;
    /** The model draws the copy of the page this browser kept, and the
     * server's answer has not confirmed it yet (lib/saved-page-hot-cache):
     * a save waits for that adoption instead of capturing in the middle of it. */
    confirming?: () => boolean;
    /** What the document holds beyond the durable checkpoint it adopted, for
     * a closing window's request (lib/page-closing-edits); null when nothing. */
    closingUpdate?: () => { update: Uint8Array; epoch: number; model: string; baseContentVersion: number } | null;
  };
  /** This member's room document's state vector (`Y.encodeStateVector`),
   * base64: what a server write that answers with the room's own update
   * (a deck's slide insert or delete) measures that update from. */
  stateVectorBase64?: () => string | null;
  /** This window's own author id in the room document (its Y.Doc clientID):
   * with the state vector, the operations this window made (a copy kept on
   * this device names them, lib/autorecover-store). Null without a room. */
  clientId?: () => number | null;
  /** A server write of this member's own, as the room's update (base64):
   * applied under this member's local origin, so it is their step in the
   * shared history (Undo takes it back). False when the room is not this
   * member's to write now. */
  applyOwnServerUpdate?: (updateBase64: string) => boolean;
  /** A verified server maintenance delta, excluded from personal history.
   * Changed top-level values must still match before or already match after. */
  applyMaintenanceDelta?: (request: {
    before: PageContentDocument;
    after: PageContentDocument;
    content?: PageContentDocument;
    /** Source invariants must still match even if maintenance did not change
     * that JSON value (for example an empty native journal). */
    guardKeys?: readonly string[];
  }) => PageMaintenanceApplyResult;
}

export interface PageContentHistoryController {
  available: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => PageContentDocument | null;
  redo: () => PageContentDocument | null;
  stopCapturing: () => void;
  /** The next local change joins the last undo step (a correction worked
   * out from it at once). */
  continueLastStep?: () => void;
  /** How many of this member's steps each stack holds now. */
  depth?: () => { undo: number; redo: number };
}

function legacyPageAuthority(authorityKey: string): {
  bindingKey: string;
  canPublish: boolean;
  /** Writable once fresh: an unconfirmed verdict holds edits, it does not
   * discard them. Only a reader's (or an invalid key's) edits are not kept. */
  holdsLocalEdits: boolean;
} {
  if (authorityKey === "default") {
    return { bindingKey: "default", canPublish: true, holdsLocalEdits: true };
  }
  const match = PAGE_AUTHORITY_KEY_PATTERN.exec(authorityKey);
  if (!match) {
    return { bindingKey: "invalid", canPublish: false, holdsLocalEdits: false };
  }
  const [, freshness, access, reason] = match;
  if ((access === "writable") !== (reason === "none")) {
    return { bindingKey: "invalid", canPublish: false, holdsLocalEdits: false };
  }
  return {
    // Freshness pauses publication; only an actual ACL/checkout change owns a
    // new Y.Doc. This keeps background suspension from rebuilding the editor.
    bindingKey: `${access}:${reason}`,
    canPublish: freshness === "known" && access === "writable",
    holdsLocalEdits: access === "writable",
  };
}

export function stripPrivate(
  doc: PageContentDocument,
  privateKeys: readonly string[],
): PageContentDocument {
  if (privateKeys.length === 0) return doc;
  const out: PageContentDocument = {};
  for (const [key, value] of Object.entries(doc)) {
    if (!privateKeys.includes(key)) out[key] = value;
  }
  return out;
}

/**
 * `doc` without the root keys only the server writes (the import-loss record):
 * what a member's publish compares, so it never writes or deletes them. The
 * room's copy is delivered to the editor as before.
 */
export function withoutServerOwnedKeys(doc: PageContentDocument): PageContentDocument {
  if (!SERVER_OWNED_PAGE_ROOT_KEYS.some((key) => Object.hasOwn(doc, key))) return doc;
  const out: PageContentDocument = {};
  for (const [key, value] of Object.entries(doc)) {
    if (!SERVER_OWNED_PAGE_ROOT_KEYS.includes(key)) out[key] = value;
  }
  return out;
}

function pickPrivate(
  doc: PageContentDocument,
  privateKeys: readonly string[],
): PageContentDocument {
  const out: PageContentDocument = {};
  for (const key of privateKeys) {
    if (Object.prototype.hasOwnProperty.call(doc, key)) out[key] = doc[key];
  }
  return out;
}

export function mergePageDocumentDelta(
  current: PageContentDocument,
  next: PageContentDocument,
  previous: PageContentDocument,
): PageContentDocument {
  const doc = new Y.Doc();
  const root = doc.getMap<unknown>(ROOT_KEY);
  try {
    doc.transact(() => applyJsonDelta(root, current, {}));
    // A text whose two changes cannot be merged without a guess keeps this
    // side's words whole (TRIAGE 47): the merge is what a window shows or
    // sends; the room it is written into later refuses it as a conflict.
    doc.transact(() => applyJsonDelta(root, next, previous, { onAmbiguousText: () => "mine" }));
    return yToJson(root) as PageContentDocument;
  } finally {
    doc.destroy();
  }
}

/** Maintenance is compare-and-apply, never last-writer-wins. Keep the guard
 * at the changed root value: a newly appended journal entry is a conflict. */
export function canApplyPageMaintenanceDelta(
  current: PageContentDocument,
  before: PageContentDocument,
  after: PageContentDocument,
  guardKeys: readonly string[] = [],
): boolean {
  const guarded = new Set(guardKeys);
  return [...new Set([...Object.keys(before), ...Object.keys(after), ...guardKeys])].every((key) =>
    (!guarded.has(key) && jsonEquals(before[key], after[key])) ||
    jsonEquals(current[key], before[key]) || jsonEquals(current[key], after[key]));
}

type LegacyContentController = Pick<PageContentSyncController,
  "history" | "flushContent" | "roomUnavailable" | "applyMaintenanceDelta" | "causal" | "awareness" | "noteTextEdit" |
  "textEditsWaiting" | "anchorTextCaret" | "stateVectorBase64" | "clientId" | "applyOwnServerUpdate">;

function useLegacyPageContentSync({
  pageId,
  content,
  onRemoteContent,
  enabled = true,
  authorityKey = "default",
  privateKeys = [],
  durablePage,
  recoveredCausalDraft,
  isCausalScopeCurrent,
  activateCausal,
  onCausalReconnect,
  onCausalSourceRefused,
  onTextMergeRefused,
  sourceScopeKey = "",
}: PageContentSyncOptions): LegacyContentController {
  const [localOrigin] = useState(() => Symbol("mrn-page-json-local"));
  const [controller, setController] = useState<LegacyContentController & { binding: string }>({ binding: "" });
  // The controller last published (only notifyHistory publishes). History
  // events fire several times a keystroke; comparing here, before asking,
  // keeps an unchanged controller from re-rendering the editor each time.
  const publishedControllerRef = useRef(controller);
  const replayingHistoryRef = useRef(false);
  const notifyHistoryRef = useRef<(() => void) | null>(null);
  const sessionRef = useRef<CollabSession | null>(null);
  /** Text edits the next publication writes exactly (`noteTextEdit`). */
  const pendingTextEditsRef = useRef<PageCollaborativeTextEdit[]>([]);
  /** Keys whose words a publication did not bring into the room (a file's
   * SmartArt typed on its own drawing), waiting for a peer's words
   * (lib/collab/collab-text-keys `OrphanTextEdits`). */
  const orphanTextEditsRef = useRef(new OrphanTextEdits<PageCollaborativeTextEdit>());
  /** Writes an edit with its container into the room now (the live room's). */
  const writeTextEditNowRef = useRef<((edit: PageCollaborativeTextEdit) => string) | null>(null);
  const anchorTextCaretRef = useRef<((caret: PageCollaborativeTextCaret) => void) | null>(null);
  /** The live room's `settleStaleTextViews` (identity without one). */
  const settleStaleTextViewsRef = useRef<((local: PageContentDocument, base: PageContentDocument) => PageContentDocument) | null>(null);
  /** This member's anchored carets in the texts a peer's change edited. */
  const caretsAfterChangeRef = useRef<((changes: readonly CollaborativeTextChange[]) => PageRemoteContentDetail["carets"]) | null>(null);
  const noteTextEdit = useCallback((edit: PageCollaborativeTextEdit): PageTextEditOutcome => {
    // A key typed while an earlier one of the same text waits for the next
    // publication goes with it, in order.
    // The keys waiting are written first, when the room takes them now (the
    // moment it would not -- an access check, a save being merged -- is
    // usually over by the next key), each carried from the words it was
    // typed into; this one then goes after them.
    const key = edit.path.join("\u0000");
    const write = writeTextEditNowRef.current;
    if (write && pendingTextEditsRef.current.length > 0) {
      pendingTextEditsRef.current = writeWaitingTextEdits(pendingTextEditsRef.current, (noted) => {
        const done = write(noted);
        noteTextEditOutcome(`waited-${done}`);
        return done;
      });
    }
    const waiting = pendingTextEditsRef.current.some((noted) => noted.path.join("\u0000") === key);
    const outcome = waiting ? "waiting" : !edit.container ? "no-container" : write?.(edit) ?? "no-room";
    noteTextEditOutcome(outcome);
    if (coeditTraceOn()) coeditTrace("key", { path: edit.path.slice(-3).join("/"), base: edit.base.slice(-24), at: [edit.start, edit.end, edit.base.length], insert: edit.insert, outcome,
      room: rootRef.current ? collaborativeTextAt(rootRef.current, edit.path)?.toString().slice(-24) ?? null : null });
    tracedPathRef.current = edit.path;
    coeditTracedPath = edit.path;
    if (textKeyWritten(outcome)) return outcome;
    pendingTextEditsRef.current.push(edit);
    return outcome;
  }, []);
  const textEditsWaiting = useCallback((): boolean => pendingTextEditsRef.current.length > 0, []);
  const anchorTextCaret = useCallback((caret: PageCollaborativeTextCaret) => {
    anchorTextCaretRef.current?.(caret);
  }, []);
  const [roomAwareness, setRoomAwareness] = useState<Awareness | null>(null);
  const rootRef = useRef<Y.Map<unknown> | null>(null);
  /**
   * The room projection the editor's next local delta is based on. During a
   * freshness gap it advances with peer state but deliberately excludes the
   * held local delta, so that delta remains publishable after revalidation.
   */
  const baselineRef = useRef<PageContentDocument | null>(null);
  









  const foreignTransactionsRef = useRef(0);
  const baselineIsOwnAtRef = useRef<number | null>(null);
  /** The last delivery's projection is this member's own document (equal to
   *  its source): it was published, not merged with anything. */
  const deliveryIsOwnRef = useRef(false);
  /** Last delivery plus the contentRef value it was derived from. */
  const lastDeliveryRef = useRef<{
    source: PageContentDocument;
    projection: PageContentDocument;
  } | null>(null);
  /**
   * What the editor's document was based on before this room adopted it: the
   * page as loaded, then the room projection a retired session last held. A
   * page is editable from its load and its room is ready a moment later, so
   * whatever differs from this at the first adoption is the member's own
   * unpublished work, not a stale copy of the room.
   */
  const adoptionBaseRef = useRef<{ pageId: string; content: PageContentDocument } | null>(null);
  /** Room readiness: nothing is adopted or published before this. */
  const readyRef = useRef(false);
  const onRemoteRef = useRef(onRemoteContent);
  const contentRef = useRef(content);
  /** The last text a key was noted in (`coeditTrace`). */
  const tracedPathRef = useRef<readonly string[] | undefined>(undefined);
  /** Keys written into the room when typed, in order (`withTextWritesSince`). */
  const textWritesRef = useRef<TextWriteLog>({ seq: 0, entries: [] });
  /** The documents this hook handed out, by the write count they were made at. */
  const madeAtRef = useRef(new WeakMap<object, number>());
  /** The documents this hook handed out, by when (performance.now()). */
  const handedAtRef = useRef(new WeakMap<object, number>());
  /** When the editor took a document this hook handed out as its prop: the
   *  last few, by when it was handed out and when it was taken. */
  const shownHandedRef = useRef<Array<{ handedAt: number; shownAt: number }>>([]);
  /** `foreignTransactionsRef` when the room's state was last read for the
   *  editor (a delivery, a projection): transactions after it have not been
   *  handed to the editor yet. */
  const deliveredForeignAtRef = useRef(0);
  /** This session's guard of collaborators' characters the editor may not
   *  have drawn (`UndrawnTextItems`), with the count of those a publication
   *  kept; null without a room. */
  const undrawnGuardRef = useRef<(UndrawnTextItems & { keptCount: number }) | null>(null);
  /** Hands the editor the room as it is now, soon (a publication kept characters it had not drawn). */
  const redeliverRef = useRef<(() => void) | null>(null);
  const causalModel = pdfPageUsesAuthorCausalModel(durablePage) ? "pdf-author-v1" : "page-json-v1";
  const privateKeysRef = useRef(privateKeys);
  useLayoutEffect(() => {
    onRemoteRef.current = onRemoteContent;
    // Native commands are never authored into the shared notes original,
    // including when a caller omitted its legacy private-key option.
    privateKeysRef.current = causalModel === "pdf-author-v1"
      ? [...new Set([...privateKeys, "pdfNativeTransactions"])] : privateKeys;
  }, [onRemoteContent, privateKeys, causalModel]);
  // Only a NEW document from the caller replaces the one this hook holds.
  // `mirror`/`capture`/`flushContent` advance `contentRef` past the rendered
  // prop (and record it as the last delivery's source) while React has not
  // rendered that document yet. A commit that still carries the previous prop
  // -- a deferred/transition render, which a delivery's update does not
  // interrupt -- used to put the older document back, and the next delivery
  // merged it as a local edit: the characters between the two were deleted
  
  //
  // A document this hook handed out (a projection, a delivery) comes back as
  // the prop a render later; a key written into the room in between
  // (`noteTextEdit`, written when typed) is in the room and in `contentRef`,
  // not in that document. Taken as it is, the hook read the key as deleted
  // by this member: the next delivery handed the editor the words without it
  
  // one tab's letters vanished as the other typed). Such a document gets
  // every key written after it was made again.
  useLayoutEffect(() => {
    const handedAt = content ? handedAtRef.current.get(content) : undefined;
    if (handedAt !== undefined) {
      const shown = shownHandedRef.current;
      shown.push({ handedAt, shownAt: performance.now() });
      if (shown.length > 8) shown.splice(0, shown.length - 8);
    }
    contentRef.current = withTextWritesSince(content, textWritesRef.current, madeAtRef.current);
    if (coeditTraceOn()) coeditTrace("prop", { made: content ? madeAtRef.current.get(content) ?? null : null, seq: textWritesRef.current.seq,
      text: coeditTail(content, tracedPathRef.current), now: coeditTail(contentRef.current, tracedPathRef.current) });
  }, [content]);
  /** Seed-or-adopt for the live room; null until a room exists. */
  const establishBaselineRef = useRef<(() => boolean) | null>(null);
  const durablePageRef = useRef(durablePage);
  const recoveredCausalDraftRef = useRef(recoveredCausalDraft);
  const causalScopeRef = useRef(isCausalScopeCurrent);
  const activateCausalRef = useRef(activateCausal);
  const causalReconnectRef = useRef(onCausalReconnect);
  const causalSourceRefusedRef = useRef(onCausalSourceRefused);
  const textMergeRefusedRef = useRef(onTextMergeRefused);
  textMergeRefusedRef.current = onTextMergeRefused;
  useLayoutEffect(() => {
    durablePageRef.current = durablePage;
    recoveredCausalDraftRef.current = recoveredCausalDraft;
    causalScopeRef.current = isCausalScopeCurrent;
    activateCausalRef.current = activateCausal;
    causalReconnectRef.current = onCausalReconnect;
    causalSourceRefusedRef.current = onCausalSourceRefused;
  }, [durablePage, recoveredCausalDraft, isCausalScopeCurrent, activateCausal, onCausalReconnect, onCausalSourceRefused]);
  const causalReadyRef = useRef(false);
  /** The body of a durable page whose checkpoint is being merged into the room. */
  const pendingAdoptionRef = useRef<PageContentDocument | null>(null);
  const adoptDurableRef = useRef<((page: PageItem) => Promise<boolean>) | null>(null);
  const initializeRef = useRef<(() => void) | null>(null);

  const active = Boolean(enabled && pageId && USE_COLLAB_EDITING);
  const authority = legacyPageAuthority(authorityKey);
  // Coherent epoch 1 retains the live doc/history. A migrated realm must never
  // combine its new original IDs with the old room's pending transport state.
  const migratedEpoch = (durablePage?.page_causal_checkpoint?.epoch ?? 0) > 1
    ? durablePage!.page_causal_checkpoint!.epoch : 0;
  const authorityBinding = `${pageId ?? ""}:${authority.bindingKey}:${migratedEpoch}:${causalModel}:${sourceScopeKey}`;
  const bindingRef = useRef(authorityBinding);
  useLayoutEffect(() => { bindingRef.current = authorityBinding; }, [authorityBinding]);
  const authorityCanPublishRef = useRef(authority.canPublish);
  useLayoutEffect(() => { authorityCanPublishRef.current = authority.canPublish; }, [authority.canPublish]);
  const authorityHoldsLocalEditsRef = useRef(authority.holdsLocalEdits);
  useLayoutEffect(() => { authorityHoldsLocalEditsRef.current = authority.holdsLocalEdits; }, [authority.holdsLocalEdits]);

  /** Writable per the SERVER's verdict; read-only members observe only. */
  const canPublish = useCallback(() => {
    if (!authorityCanPublishRef.current) return false;
    if (!(causalScopeRef.current?.() ?? true)) return false;
    // Once the original saved history is known, local editing/capture also
    // works during disconnection. Transport keeps its own unacknowledged queue.
    const network = sessionRef.current?.network;
    if (causalReadyRef.current) return !network || !network.connected || network.writable;
    return !network || (!network.failed && network.writable && network.connected);
  }, []);

  const publishLocalContent = useCallback(() => {
    // An edit note is for the content queued with it: one publication only
    // (kept while nothing can be published: the keys still wait).
    if (!active || !readyRef.current || !canPublish()) return;
    let notedEdits = pendingTextEditsRef.current;
    if (notedEdits.length > 0) pendingTextEditsRef.current = [];
    const session = sessionRef.current;
    const root = rootRef.current;
    if (!session || !root || !contentRef.current) return;
    let baseline = baselineRef.current;
    if (!baseline) {
      // Seeds an empty room with this document, or adopts the room's. An
      // adoption leaves the rebased projection in `lastDeliveryRef`: only
      // what this member changed since their own base goes out below, never
      // their older copy of the room's values.
      establishBaselineRef.current?.();
      baseline = baselineRef.current;
      if (!baseline) return;
    }
    // Keys that waited for this publication (the room took no writes when
    // they were typed: a durable save being merged, a socket catching up),
    // each text's in order as one edit of the words the first was typed in,
    // are written now as a key is when typed -- carried over a collaborator's
    // characters that reached the room meanwhile. Compared as strings with
    // the room instead, the editor's words read the collaborator's letters
    
    // other's three words).
    if (notedEdits.length > 0) {
      notedEdits = writeWaitingTextEdits(notedEdits, (edit) => {
        const outcome = writeTextEditNowRef.current?.(edit) ?? "no-room";
        noteTextEditOutcome(`waited-${outcome}`);
        return outcome;
      });
      baseline = baselineRef.current ?? baseline;
    }
    const current = contentRef.current;
    if (!current) return;
    const lastDelivery = lastDeliveryRef.current;
    // Replay may already have rebased a held edit while React still exposes
    // its pre-replay prop. Preserve that projection when transport, rather
    // than a React commit, is the event that resumes publication. (Nothing
    // was replayed while the room holds only what this member published.)
    const roomIsOwn = baselineIsOwnAtRef.current !== null &&
      baselineIsOwnAtRef.current === foreignTransactionsRef.current && deliveryIsOwnRef.current;
    // What the editor still holds as it was handed it before the last
    // delivery is that delivery's (`withUndrawnDelivery`): the whole body,
    // or each part of it the editor has not touched since.
    const shown = !roomIsOwn && lastDelivery
      ? withUndrawnDelivery(current, lastDelivery.source, lastDelivery.projection) as PageContentDocument
      : current;
    // A text the editor still shows as it was before a key of it was carried
    // over a collaborator's characters is the room's words (no edit of it).
    const local = settleStaleTextViewsRef.current?.(shown, baseline) ?? shown;
    // Neither a view's own keys nor the server's (`SERVER_OWNED_PAGE_ROOT_KEYS`):
    // the room keeps the server's record, whatever the editor's content holds.
    const nextShared = withoutServerOwnedKeys(stripPrivate(local, privateKeysRef.current));
    const prevShared = withoutServerOwnedKeys(stripPrivate(baseline, privateKeysRef.current));
    // The editor now shows a body the server wrote (a version restore, read
    // back by a reload) whose causal checkpoint is still being merged into
    // the room. That merge brings these very values, as the server's own
    // edit; publishing them as this member's edit too put the same text in
    // twice (two concurrent inserts of it), and the next save wrote the
    
    const adopting = pendingAdoptionRef.current;
    if (adopting && !jsonEquals(nextShared, prevShared) &&
        jsonEquals(nextShared, stripPrivate(adopting, privateKeysRef.current))) return;
    if (!jsonEquals(nextShared, prevShared)) {
      // Keys that waited for this publication (the room's words were not the
      // ones they were typed in): each text's keys as one edit of the words
      // the first was typed in, moved over a collaborator's characters that
      // reached the room meanwhile (`rebaseStaleEdits`, as a part's room does).
      // Compared as strings instead, the collaborator's characters the editor
      
      
      const textEdits = collaborativeTextEditsFor(root, notedEdits.map(({ container: _container, ...edit }) => edit));
      if (coeditTraceOn()) coeditTrace("publish", { local: coeditTail(local, tracedPathRef.current), base: coeditTail(baseline, tracedPathRef.current),
        current: coeditTail(current, tracedPathRef.current), noted: notedEdits.length });
      const undrawn = undrawnGuardRef.current ?? undefined;
      if (undrawn) undrawn.keptCount = 0;
      const ownFrom = Y.getState(session.ydoc.store, session.ydoc.clientID);
      const ambiguous: AmbiguousTextWrite[] = [];
      session.ydoc.transact(() => {
        applyJsonDelta(root, nextShared, prevShared, {
          ...(textEdits ? { textEdits, rebaseStaleEdits: true } : {}),
          ...(undrawn ? { undrawn } : {}),
          onAmbiguousText: (write) => { ambiguous.push(write); },
        });
        // Keys of words this publication creates (a diagram's first key,
        // which converts it) are this member's change of what it created.
        if (notedEdits.length > 0) noteKeyedCreationEdits(root, notedEdits);
      }, localOrigin);
      if (ambiguous.length > 0) {
        if (coeditTraceOn()) coeditTrace("text-merge-refused", { count: ambiguous.length,
          room: ambiguous[0].room.slice(0, 24), mine: ambiguous[0].mine.slice(0, 24) });
        textMergeRefusedRef.current?.(ambiguous);
      }
      // Keys whose words this publication did not bring into the room wait
      // for a peer's words (`orphanTextEditsRef`).
      if (notedEdits.length > 0) {
        orphanTextEditsRef.current.keep(root, notedEdits,
          { client: session.ydoc.clientID, from: ownFrom, to: Y.getState(session.ydoc.store, session.ydoc.clientID) });
      }
      if (undrawn && undrawn.keptCount > 0) {
        // The room keeps collaborators' characters this document was
        // committed without: it is not this member's document, and the
        // editor is handed the room's as soon as it can take it.
        if (coeditTraceOn()) coeditTrace("kept-undrawn", { count: undrawn.keptCount, local: coeditTail(local, tracedPathRef.current) });
        baselineRef.current = { ...local };
        baselineIsOwnAtRef.current = null;
        deliveryIsOwnRef.current = false;
        redeliverRef.current?.();
        return;
      }
    }
    baselineRef.current = { ...local };
    // The room holds this member's document only when every transaction a
    // collaborator made on it has been handed to the editor: one applied but
    // not delivered yet (the window busy with the last delivery) is in the
    // room and not in `local`.
    baselineIsOwnAtRef.current = foreignTransactionsRef.current === deliveredForeignAtRef.current
      ? foreignTransactionsRef.current : null;
    // The editor handing back the very document the last delivery projected
    // (the window took it as its prop) has not therefore drawn it: a cell
    // being typed in keeps its own words until it loads the delivery, and a
    // commit from them meanwhile (a table's frame refitted) is still that
    // delivery's undrawn part. Recorded as the source, the cell's older words
    // read as this member deleting the collaborator's letter, and the next
    
    // tr34: "QBSDAS" became "QSDAS" + "B").
    // (Nor does it make the room this member's own: what the delivery
    // brought is still the collaborator's.) Nor does any other document this
    // hook handed out: a save's mirror hands the room's document back and a
    // flush of it hands out a newer copy, and the window took the first as
    
    // refit from the cell's older words a moment later deleted nine letters).
    const handedBack = lastDelivery !== null && local === current &&
      (current === lastDelivery.projection || handedAtRef.current.has(current));
    if (!handedBack) {
      deliveryIsOwnRef.current = local === current;
      lastDeliveryRef.current = { source: current, projection: local };
    }
  }, [active, canPublish, localOrigin]);

  useEffect(() => {
    if (!active || !pageId) return;
    let disposed = false;
    // Slide text is Y.Text in a presentation room (json-crdt.ts collaborative
    // text); its transport must be one the server keeps older clients out of.
    const textModel = durablePageRef.current?.id === pageId && durablePageRef.current.page_type === "presentation";
    // Keys noted for another room's publication are not this one's.
    pendingTextEditsRef.current = [];
    if (coeditTraceOn()) coeditTrace("session", { epoch: migratedEpoch ?? null });
    const session = createCollabSession({ docId: pageId, pageJsonCausalModel: true,
      ...(migratedEpoch ? { pageJsonCausalEpoch: migratedEpoch } : {}),
      ...(textModel ? { pageJsonTextModel: true } : {}) });
    sessionRef.current = session;
    setRoomAwareness(session.awareness);
    const root = session.ydoc.getMap<unknown>(ROOT_KEY);
    // What reaches the room from anyone but this member's own publishing.
    const countForeignTransaction = (transaction: Y.Transaction) => {
      if (transaction.origin !== localOrigin) foreignTransactionsRef.current += 1;
    };
    session.ydoc.on("afterTransaction", countForeignTransaction);
    baselineIsOwnAtRef.current = null;
    rootRef.current = root;
    const maintenanceOrigin = Symbol("mrn-page-json-maintenance");
    const ownSaveReceiptOrigin = Object.freeze({ kind: "mrn-page-json-own-save-receipt" });
    // Collaborators' characters the editor may not have drawn yet, by room
    // text: the state vector before the first of them came, and when the
    // last did. The editor has drawn them once it showed the text as the
    // room holds it (a publication of the room's very words, a key typed on
    // them), or once it took a document handed out after the last of them
    // and had a moment to draw it -- never sooner than a frame refit can
    
    const undrawnTexts = new WeakMap<Y.Text, { before: Map<number, number>; firstAt: number; lastAt: number }>();
    const undrawnSettled = (mark: { firstAt: number; lastAt: number }, now: number) =>
      now - mark.firstAt > UNDRAWN_TEXT_KEPT_AT_MOST_MS ||
      shownHandedRef.current.some((shown) => shown.handedAt >= mark.lastAt && now - shown.shownAt >= UNDRAWN_TEXT_DRAW_MS);
    const noteUndrawnText = (transaction: Y.Transaction) => {
      const origin = transaction.origin;
      if (origin === localOrigin || origin === INITIAL_ORIGIN || origin === maintenanceOrigin) return;
      const now = performance.now();
      for (const type of transaction.changed.keys()) {
        if (!(type instanceof Y.Text)) continue;
        const mark = undrawnTexts.get(type);
        if (mark && !undrawnSettled(mark, now)) mark.lastAt = now;
        else undrawnTexts.set(type, { before: new Map(transaction.beforeState), firstAt: now, lastAt: now });
      }
    };
    session.ydoc.on("afterTransaction", noteUndrawnText);
    undrawnGuardRef.current = {
      keptCount: 0,
      drawnTo: (text) => {
        const mark = undrawnTexts.get(text);
        if (!mark) return null;
        if (undrawnSettled(mark, performance.now())) {
          undrawnTexts.delete(text);
          return null;
        }
        return mark.before;
      },
      drawn: (text) => { undrawnTexts.delete(text); },
      kept: (_text, count) => {
        if (undrawnGuardRef.current) undrawnGuardRef.current.keptCount += count;
      },
    };
    let causalStatus: "preparing" | "ready" | "failed" = "preparing";
    let causalEpoch: number | null = null;
    let causalRevision = 0;
    let causalVersion = 0;
    let causalSaved = false;
    /** The durable checkpoint this room was last bound to (a page read or a
     * save receipt merged), for a capture to take what the room holds beyond
     * it with its bytes: a save of a deck then sends those bytes as they are
     * instead of decoding them into a second document (page-causal-checkpoint
     * `preparePageCausalSave`). */
    let durablePrepared: PreparedPageCausalCheckpoint | null = null;
    let causalFailureCause: PageYjsFailureCause = "session_changed";
    const modelStatus = createPageCausalModelStatus(pageId);
    let networkReady = false;
    let bootstrapStarted = false;
    let bootstrapping: Promise<boolean> | null = null;
    causalReadyRef.current = false;
    const history = createJsonCollaborationHistory(root, {
      localOrigin, canWrite: canPublish, maintenanceOrigins: new Set<unknown>([maintenanceOrigin, ownSaveReceiptOrigin]),
    });
    // Two members creating one entry at once (a diagram's first-edit
    // conversion in two windows): the one whose entry the room drops writes
    // its change again over the one kept (lib/collab/json-crdt).
    const stopCreationWatch = watchConcurrentKeyedCreations(root, { localOrigin });
    // Keys typed into words the room did not hold (`orphanTextEditsRef`):
    // written when a peer's update brings those words, before the update is
    // handed to the editor; let go when this member's own publication brings
    // them (its words are in it).
    const orphanTextEdits = orphanTextEditsRef.current;
    orphanTextEdits.clear();
    const writeOrphanTextEdits = (transaction: Y.Transaction) => {
      if (orphanTextEdits.size === 0 || transaction.local) return;
      const arrived = orphanTextEdits.arrived(root, remoteUpdateBeingApplied(session.ydoc));
      if (arrived.length === 0) return;
      const write = writeTextEditNowRef.current;
      const left = write
        ? writeWaitingTextEdits(arrived, (edit) => {
          const done = write(edit);
          noteTextEditOutcome(`orphan-${done}`);
          return done;
        })
        : arrived;
      pendingTextEditsRef.current.push(...left);
    };
    const forgetOrphanTextEdits = (transaction: Y.Transaction) => {
      if (orphanTextEdits.size > 0 && transaction.local && transaction.origin === localOrigin) orphanTextEdits.forgetPresent(root);
    };
    session.ydoc.on("beforeObserverCalls", writeOrphanTextEdits);
    session.ydoc.on("afterTransaction", forgetOrphanTextEdits);
    const isCurrent = () => !disposed && sessionRef.current === session &&
      bindingRef.current === authorityBinding && readyRef.current && canPublish() &&
      (causalScopeRef.current?.() ?? true);
    const supportsCausalPrivateKeys = () => privateKeysRef.current.every(key =>
      causalModel === "pdf-author-v1" && key === "pdfNativeTransactions");
    const currentProjection = () => {
      const source = contentRef.current ?? {};
      const shared = stripPrivate(yToJsonShared(root) as PageContentDocument, privateKeysRef.current);
      const projection = { ...pickPrivate(source, privateKeysRef.current), ...shared };
      // The room still holds only what this member published: its baseline
      // stays their own document (equal values, shared objects).
      const held = lastDeliveryRef.current;
      const own = baselineIsOwnAtRef.current !== null &&
        baselineIsOwnAtRef.current === foreignTransactionsRef.current &&
        deliveryIsOwnRef.current && held?.source === source;
      if (!own) {
        baselineRef.current = projection;
        baselineIsOwnAtRef.current = null;
      }
      // The editor's document handed back as the last delivery's very
      // projection (a save flushing what its mirror returned) is not what
      // the editor draws: that is still the delivery's source, until a
      
      // the source, a frame refit from a cell's older words a moment later
      // read a collaborator's nine letters as deleted).
      const editorHolds = !own && held && !deliveryIsOwnRef.current && source === held.projection ? held.source : source;
      deliveryIsOwnRef.current = own;
      deliveredForeignAtRef.current = foreignTransactionsRef.current;
      lastDeliveryRef.current = { source: editorHolds, projection };
      madeAtRef.current.set(projection, textWritesRef.current.seq);
      handedAtRef.current.set(projection, performance.now());
      return projection;
    };
    let noProjectionNotedAt = 0;
    const roomUnavailable = () => !disposed && sessionRef.current === session &&
      session.network?.failed === true && !causalReadyRef.current;
    const flushContent = (content?: PageContentDocument) => {
      if (!isCurrent()) {
        if (process.env.NODE_ENV !== "production" && Date.now() - noProjectionNotedAt > 2_000) {
          noProjectionNotedAt = Date.now();
          try {
            const network = sessionRef.current?.network;
            console.debug("[page-sync] no projection " + JSON.stringify({
              disposed, session: sessionRef.current === session, binding: bindingRef.current === authorityBinding,
              ready: readyRef.current, authority: authorityCanPublishRef.current,
              causalScope: causalScopeRef.current?.() ?? true, causalReady: causalReadyRef.current,
              connected: network?.connected ?? null, writable: network?.writable ?? null, failed: network?.failed ?? null,
            }));
          } catch { /* diagnostics never throw */ }
        }
        return null;
      }
      // A document this hook handed out earlier (a save's draft is the
      // projection its mirror returned) gets the keys written since again.
      if (content) contentRef.current = withTextWritesSince(content, textWritesRef.current, madeAtRef.current);
      if (coeditTraceOn()) coeditTraceDoc("flush", content ?? null, { made: content ? madeAtRef.current.get(content) ?? null : null, seq: textWritesRef.current.seq });
      publishLocalContent();
      history.stopCapturing();
      session.network?.flushLocalUpdates?.();
      return currentProjection();
    };
    // A keystroke with its container is written when it is typed: the room
    // holds it before a peer's next update can arrive, so it is never merged
    // with one afterwards by comparing strings (which interleaved two
    
    
    // room baseline take the container as written, so the next publication
    // of the whole document finds nothing more to write for it, and a
    // delivery meanwhile does not read the letters as deleted.
    //
    // A key typed into words the room has moved on from (a collaborator's
    // characters reached the room, not yet the words the editor typed in) is
    // carried over the room's own changes of the text since those words
    // (`textHistory`, exactly, by the Y.Text deltas) and written there; the
    // editor is then handed the room's words with its caret behind the key
    // (`deliverWrittenText`). It used to wait for the next publication,
    // whose string comparison put it into the collaborator's word or read
    
    const textKeys = new CollaborativeTextKeys(root);
    writeTextEditNowRef.current = (edit) => {
      const container = edit.container;
      if (!container || privateKeysRef.current.includes(edit.path[0] ?? "")) return "private";
      if (!isCurrent()) {
        const network = session.network;
        return `not-current:${disposed ? "disposed" : sessionRef.current !== session ? "session"
          : bindingRef.current !== authorityBinding ? "binding" : !readyRef.current ? "not-ready"
          : !authorityCanPublishRef.current ? "authority" : !(causalScopeRef.current?.() ?? true) ? "scope"
          : network && !network.connected ? "offline" : network && !network.writable ? "unwritable" : "other"}`;
      }
      const baseline = baselineRef.current;
      if (!baseline) return "no-baseline";
      const write = textKeys.write(session.ydoc, localOrigin, { ...edit, container });
      if (!("value" in write)) return write.outcome;
      const containerPath = edit.path.slice(0, -1);
      const { value } = write;
      baselineRef.current = withJsonValueAt(baseline, containerPath, value) as PageContentDocument;
      const local = contentRef.current;
      const delivery = lastDeliveryRef.current;
      // What the editor holds of the container is the words as written and
      // every other field as the editor had it when it typed the key
      // (`container.next`): the editor's documents, here and those a write
      // log replay brings up to date (`withTextWritesSince`), take that, so
      // a publication never records the room's fields the editor has not
      // drawn as the editor's own. (With no delivery to read the rest from,
      // the room's container, as before.)
      const held = delivery ? withTextContainerWords(container.next, value) : value;
      if (local) contentRef.current = withJsonValueAt(local, containerPath, held) as PageContentDocument;
      if (delivery) {
        // What the editor holds of the container is the words as written and
        // every other field as the editor had it when it typed the key
        // (`container.next`): a collaborator's format of the object the room
        // holds and the editor has not drawn (a slow view: Home > Font on the
        // whole box a moment before) stays the delivery's, for the editor's
        // next commit -- which still shows the object without it -- to leave
        // in the room. Recorded as the room's whole container, that commit
        
        // tab B slowed 6x, the box's Georgia gone from every run).
        lastDeliveryRef.current = {
          source: withJsonValueAt(delivery.source === local && contentRef.current ? contentRef.current : delivery.source,
            containerPath, held) as PageContentDocument,
          projection: withJsonValueAt(delivery.projection, containerPath, value) as PageContentDocument,
        };
      }
      const log = textWritesRef.current;
      log.seq += 1;
      log.entries.push({ seq: log.seq, path: containerPath, held });
      if (log.entries.length > TEXT_WRITE_LOG_LIMIT) log.entries.splice(0, log.entries.length - TEXT_WRITE_LOG_LIMIT);
      // The caret the key left, bound to the letter before it.
      const key = edit.path.join("\u0000");
      const text = collaborativeTextAt(root, edit.path);
      if (text) {
        caretAnchors.set(key, {
          path: edit.path, text, start: collaborativeTextAnchor(text, write.caret, -1), end: collaborativeTextAnchor(text, write.caret, -1),
          placed: { text: write.roomText, start: write.caret, end: write.caret },
          // A carried key: until the editor draws the room's words, its own
          // caret reads in the words it typed in, behind the key.
          ...(write.carried ? { view: { text: write.carried.viewText, start: write.carried.viewCaret,
            end: write.carried.viewCaret } } : {}),
        });
      }
      if (write.carried) {
        // The editor is handed the room's words, its caret behind the key,
        // after the key's own commit (which still shows the words typed in).
        const { viewText, viewCaret, viewToRoom } = write.carried;
        const caret = { path: edit.path, text: write.roomText, start: write.caret, end: write.caret,
          from: { text: viewText, start: viewCaret, end: viewCaret } };
        queueMicrotask(() => {
          if (disposed || sessionRef.current !== session) return;
          deliver([{ path: edit.path, delta: viewToRoom }], { force: true, carets: [caret] });
        });
      }
      notifyHistoryRef.current?.();
      return write.outcome;
    };
    settleStaleTextViewsRef.current = (local, base) => textKeys.settle(local, base);
    /** This member's carets, by text path: relative positions in the room's
     * texts (`anchorTextCaret`), carried across every peer's change. */
    const caretAnchors = new Map<string, {
      path: readonly string[]; text: Y.Text; start: Y.RelativePosition; end: Y.RelativePosition;
      /** Where it stood when placed, or when last carried. */
      placed: Omit<PageCollaborativeTextCaret, "path">;
      /** A carried key's caret as the editor still reads it, in the words it
       * typed the key into (`writeTextEditNowRef`). */
      view?: Omit<PageCollaborativeTextCaret, "path">;
    }>();
    anchorTextCaretRef.current = (caret) => {
      if (!readyRef.current || sessionRef.current !== session) return;
      const key = caret.path.join("\u0000");
      const text = collaborativeTextAt(root, caret.path);
      // The text being edited: its versions are kept from now on, for a key
      // typed into words a collaborator's delivery moved past.
      if (text) textKeys.track(caret.path);
      // Only a caret placed in the room's own text can be bound to its
      // characters; one in words the room has moved past is left to the
      // delivery's delta.
      if (!text || text.toString() !== caret.text || caret.start < 0 || caret.start > caret.end ||
          caret.end > caret.text.length) {
        // The caret a carried key left, read back from the words the editor
        // typed it into (it has not drawn the room's yet): the room's anchor
        // behind the key is that caret. Dropped, the next delivery carried no
        // caret, the editor kept its offset, and the next keys went in front
        
        const kept = caretAnchors.get(key)?.view;
        if (text && kept && kept.text === caret.text && kept.start === caret.start && kept.end === caret.end) return;
        caretAnchors.delete(key);
        return;
      }
      const collapsed = caret.start === caret.end;
      caretAnchors.set(key, {
        path: caret.path, text,
        // A collapsed caret stays behind its owner's last letter; a
        // selection takes in neither edge's insertion.
        start: collaborativeTextAnchor(text, caret.start, collapsed ? -1 : 0),
        end: collaborativeTextAnchor(text, caret.end, -1),
        placed: { text: caret.text, start: caret.start, end: caret.end },
      });
    };
    caretsAfterChangeRef.current = (changes): PageRemoteContentDetail["carets"] => {
      if (caretAnchors.size === 0) return undefined;
      let out: NonNullable<PageRemoteContentDetail["carets"]>[number][] | undefined;
      for (const change of changes) {
        const key = change.path.join("\u0000");
        const anchor = caretAnchors.get(key);
        if (!anchor) continue;
        const text = collaborativeTextAt(root, change.path);
        if (text !== anchor.text) { caretAnchors.delete(key); continue; }
        const start = resolveCollaborativeTextAnchor(text, anchor.start);
        const end = resolveCollaborativeTextAnchor(text, anchor.end);
        if (start === null || end === null) { caretAnchors.delete(key); continue; }
        const carried = { text: text.toString(), start: Math.min(start, end), end: Math.max(start, end) };
        (out ??= []).push({ path: change.path, from: anchor.placed, ...carried });
        anchor.placed = carried;
      }
      return out;
    };
    const applyMaintenanceDelta: NonNullable<PageContentSyncController["applyMaintenanceDelta"]> = ({ before, after, content, guardKeys }) => {
      if (!isCurrent()) return { status: "unavailable" };
      if (privateKeysRef.current.some((key) => !jsonEquals(before[key], after[key]))) {
        return { status: "unavailable" };
      }
      const source = content ?? contentRef.current ?? {};
      const delivery = lastDeliveryRef.current;
      const local = delivery && jsonEquals(source, delivery.source) ? delivery.projection : source;
      const room = yToJsonShared(root) as PageContentDocument;
      if (!canApplyPageMaintenanceDelta(local, before, after, guardKeys) ||
          !canApplyPageMaintenanceDelta(room, before, after, guardKeys)) return { status: "changed" };
      if (content) contentRef.current = withTextWritesSince(content, textWritesRef.current, madeAtRef.current);
      // Flush genuine input under its own origin before the maintenance step.
      publishLocalContent();
      history.stopCapturing();
      session.ydoc.transact(() => applyJsonDelta(root, after, before), maintenanceOrigin);
      const projection = currentProjection();
      contentRef.current = projection;
      session.network?.flushLocalUpdates?.();
      return { status: "accepted", content: projection };
    };
    const stateVectorBase64 = (): string | null => {
      if (!isCurrent()) return null;
      const bytes = Y.encodeStateVector(session.ydoc);
      let text = "";
      for (let at = 0; at < bytes.length; at += 0x8000) {
        text += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
      }
      return btoa(text);
    };
    const clientId = (): number | null => (isCurrent() ? session.ydoc.clientID : null);
    const applyOwnServerUpdate = (updateBase64: string): boolean => {
      if (!isCurrent()) return false;
      let update: Uint8Array;
      try {
        const text = atob(updateBase64);
        update = new Uint8Array(text.length);
        for (let at = 0; at < text.length; at += 1) update[at] = text.charCodeAt(at);
      } catch {
        return false;
      }
      // What the member typed meanwhile goes first, as its own step; the
      // server's write is the next one.
      publishLocalContent();
      history.stopCapturing();
      try {
        Y.applyUpdate(session.ydoc, update, localOrigin);
      } catch {
        return false;
      }
      history.stopCapturing();
      contentRef.current = currentProjection();
      session.network?.flushLocalUpdates?.();
      notifyHistoryRef.current?.();
      return true;
    };
    const replay = (direction: "undo" | "redo") => {
      if (!isCurrent()) return null;
      publishLocalContent();
      replayingHistoryRef.current = true;
      try {
        if (!history[direction]()) return null;
        session.network?.flushLocalUpdates?.();
        return currentProjection();
      } finally { replayingHistoryRef.current = false; }
    };
    const historyActions = {
      undo: () => replay("undo"),
      redo: () => replay("redo"),
      stopCapturing: () => { if (isCurrent()) history.stopCapturing(); },
      continueLastStep: () => { if (isCurrent()) history.continueLastStep(); },
      depth: () => ({ undo: history.undoDepth, redo: history.redoDepth }),
    };
    const mirrorCausal = (content: PageContentDocument) => {
      if (!isCurrent() || !causalReadyRef.current || causalEpoch === null || !supportsCausalPrivateKeys()) return null;
      contentRef.current = withTextWritesSince(content, textWritesRef.current, madeAtRef.current);
      publishLocalContent();
      return currentProjection();
    };
    const captureCausal = (content: PageContentDocument, baseTitle: string) => {
      let projection = mirrorCausal(content);
      if (!projection) {
        // Authority freshness gates new edits and transport, not custody of
        // originals already authored in this exact live document. Closing
        // during an ACL refresh must not downgrade those edits to plain JSON.
        if (disposed || sessionRef.current !== session || bindingRef.current !== authorityBinding ||
            !readyRef.current || !causalReadyRef.current || causalEpoch === null ||
            !supportsCausalPrivateKeys() || !(causalScopeRef.current?.() ?? true)) return null;
        const delivery = lastDeliveryRef.current;
        const expected = delivery && jsonEquals(content, delivery.source) ? delivery.projection : content;
        const shared = yToJsonShared(root) as PageContentDocument;
        const originals = causalModel === "pdf-author-v1" ? withPdfDurableJournal(shared, expected) : shared;
        if (!jsonEquals(originals, expected)) return null;
        projection = originals;
      }
      if (causalEpoch === null) return null;
      // A deck's `projection` is the room's shared read at this very moment
      // (or was just found equal to it): the capture does not read the room
      // whole again to prove it (a 185-row table: a tenth of a second). A
      // PDF's still is, for its journal's own checks.
      const durable = causalModel === "page-json-v1" && durablePrepared?.epoch === causalEpoch ? durablePrepared : null;
      return { content: projection,
        recovery: capturePageCausalRecovery(session.ydoc, projection, { pageId, epoch: causalEpoch, baseTitle, model: causalModel },
          { projectionProven: causalModel === "page-json-v1", durable }) };
    };
    // A deck's window closing with updates its room has not confirmed (the
    // socket reconnecting, or the last keys' frames not yet answered): what
    // the room document holds beyond the checkpoint this view adopted goes
    // with the closing request (lib/page-closing-edits), as a Word page's
    // does. A room that confirmed every update has nothing to add (the server
    // writes the page from them itself). Synchronous: a closing page has no
    // later task.
    const closingCausal = () => {
      if (!isCurrent() || !causalReadyRef.current || causalEpoch === null || causalModel !== "page-json-v1") return null;
      const durable = durablePrepared?.epoch === causalEpoch ? durablePrepared : null;
      if (!durable) return null;
      const confirmed = session.provider?.durableUpdates?.();
      if (confirmed?.settled) return null;
      try { session.network?.flushLocalUpdates?.(); } catch { /* the request carries it */ }
      if (durable.covers(session.ydoc)) return null;
      const beyond = durable.beyond(session.ydoc);
      return beyond ? { update: beyond.update, epoch: durable.epoch, model: causalModel,
        baseContentVersion: durable.contentVersion } : null;
    };
    const warmCausal = (baseTitle: string) => {
      if (!isCurrent() || !causalReadyRef.current || causalEpoch === null || causalModel !== "page-json-v1" ||
          privateKeysRef.current.length > 0) return null;
      // The room's own shared read: its projection by construction.
      const projection = yToJsonShared(root) as PageContentDocument;
      const durable = durablePrepared?.epoch === causalEpoch ? durablePrepared : null;
      try {
        return { content: projection, recovery: capturePageCausalRecovery(session.ydoc, projection,
          { pageId, epoch: causalEpoch, baseTitle, model: causalModel }, { projectionProven: true, durable }) };
      } catch { return null; }
    };
    // A reader of a page no writer has upgraded waits for nothing it could
    // do: its window shows the saved source, and the upgrade (a writer's)
    // arrives with the next page read. Reported as a model being prepared,
    // that wait kept "connecting securely..." on the reader's title bar for
    
    const awaitsWriterUpgrade = () => {
      const durable = durablePageRef.current;
      return Boolean(durable && causalEpoch === null && !durable.page_causal_checkpoint &&
        durable.page_causal_activation_available && (durable.page_causal_can_activate === false ||
          !authorityCanPublishRef.current || !activateCausalRef.current));
    };
    const notifyHistory = () => {
      if (disposed) return;
      const hasCausal = Boolean(durablePageRef.current?.page_causal_checkpoint ||
        durablePageRef.current?.page_causal_activation_available || causalEpoch !== null);
      modelStatus.update(hasCausal && !awaitsWriterUpgrade() ? causalStatus : "ready", causalFailureCause);
      const available = isCurrent();
      const canUndo = available && history.canUndo;
      const canRedo = available && history.canRedo;
      const previous = publishedControllerRef.current;
      if (previous.flushContent === flushContent && previous.history?.available === available &&
          previous.causal?.status === (hasCausal ? causalStatus : undefined) &&
          previous.causal?.saved === (hasCausal ? causalSaved : undefined) &&
          previous.history.canUndo === canUndo && previous.history.canRedo === canRedo) return;
      const next: LegacyContentController & { binding: string } = {
        binding: authorityBinding, flushContent, roomUnavailable, applyMaintenanceDelta,
        stateVectorBase64, clientId, applyOwnServerUpdate,
        ...(hasCausal ? { causal: { status: causalStatus, saved: causalSaved,
          readContent: () => !disposed && sessionRef.current === session && readyRef.current &&
            bindingRef.current === authorityBinding && (causalScopeRef.current?.() ?? true) ? currentProjection() : null,
          mirror: mirrorCausal, capture: captureCausal, warm: warmCausal, closingUpdate: closingCausal,
          adopt: (page: PageItem, canApply?: () => boolean) => adoptDurable(page, undefined, canApply),
          adoptSaveReceipt: (page: PageItem, submitted: {
            recovery: PageCausalRecovery; content: PageContentDocument;
          }) => adoptDurable(page, submitted), prepareMaintenance,
          // connected: the current socket generation completed its replay,
          // so a reconnecting view is not in step until it has caught up.
          liveInRoom: () => !disposed && sessionRef.current === session && readyRef.current &&
            session.network?.ready === true && session.network.connected === true &&
            !session.network.failed,
          ...(causalModel === "page-json-v1" && session.provider?.durableUpdates ? {
            durableUpdates: () => {
              const state = session.provider?.durableUpdates?.();
              const live = !disposed && sessionRef.current === session && readyRef.current && causalReadyRef.current;
              return state && live ? state : { active: false, settled: false, refusal: state?.refusal ?? null };
            },
            subscribeDurableUpdates: (listener: () => void) =>
              session.provider?.subscribeDurableUpdates?.(listener) ?? (() => undefined),
          } : {}) } } : {}),
        history: { ...historyActions, available, canUndo, canRedo } };
      publishedControllerRef.current = next;
      setController(next);
    };
    notifyHistoryRef.current = notifyHistory;
    baselineRef.current = null;
    baselineIsOwnAtRef.current = null;
    lastDeliveryRef.current = null;
    deliveryIsOwnRef.current = false;
    readyRef.current = false;
    if (adoptionBaseRef.current?.pageId !== pageId) {
      const loaded = durablePageRef.current;
      const loadedContent = loaded?.id === pageId ? loaded.content_json : null;
      adoptionBaseRef.current = loadedContent && typeof loadedContent === "object" && !Array.isArray(loadedContent)
        ? { pageId, content: loadedContent as PageContentDocument } : null;
    }

    // Peers' updates that came while the window was still busy with the last
    // delivery: applied to the room document as they come, handed to the
    // editor as one delivery (`deliverRemote`).
    let heldRemoteChanges: CollaborativeTextChange[] | null = null;
    let lastDeliveryEndedAt = Number.NEGATIVE_INFINITY;
    let lastDeliveryMs = 0;
    const deliver = (textChanges?: readonly CollaborativeTextChange[], options?: {
      /** Hand it over even when it is the last delivery's projection. */
      force?: boolean;
      /** This member's carets in the delivered texts, when known exactly. */
      carets?: PageRemoteContentDetail["carets"];
    }) => {
      if (disposed || sessionRef.current !== session || bindingRef.current !== authorityBinding ||
          !(causalScopeRef.current?.() ?? true)) return;
      // Any delivery hands over what the room holds now: peers' changes held
      // for the next one go with it (their deltas first), not after it.
      if (heldRemoteChanges) {
        textChanges = composeCollaborativeTextChanges([...heldRemoteChanges, ...(textChanges ?? [])]);
        heldRemoteChanges = null;
      }
      const deliveryStartedAt = performance.now();
      const roomDoc = stripPrivate(
        yToJsonShared(root) as PageContentDocument,
        privateKeysRef.current,
      );
      const localDoc = contentRef.current ?? {};
      if (
        Object.keys(roomDoc).length === 0 &&
        baselineRef.current === null &&
        lastDeliveryRef.current === null
      ) {
        return;
      }
      const lastDelivery = lastDeliveryRef.current;
      const localProjection =
        lastDelivery && jsonEquals(localDoc, lastDelivery.source)
          ? lastDelivery.projection
          : localDoc;
      // The first adoption has no room baseline yet. A writer's document is
      // then measured against what it was based on, so the words typed
      // between the page's load and the room's readiness are carried onto the
      // room instead of being replaced by it. A reader, or a document whose
      // base is unknown, takes the room as it is. A writer whose verdict is
      // not confirmed yet (a second member's page can be typed in before its
      // access check returns) is not a reader: their words are kept in the
      // editor and published once the verdict arrives, as during any other
      // freshness gap. Taking the room then erased them ("BYLINE-x" -> "-x").
      const network = session.network;
      const holdsLocalEdits = authorityHoldsLocalEditsRef.current &&
        (!network || (!network.failed && network.writable));
      const adoptionBase = baselineRef.current === null && lastDelivery === null &&
        contentRef.current && adoptionBaseRef.current?.pageId === pageId && holdsLocalEdits
        ? adoptionBaseRef.current.content : null;
      const previous = baselineRef.current ?? adoptionBase;
      const previousShared = previous
        ? stripPrivate(previous, privateKeysRef.current)
        : null;
      const localShared = stripPrivate(
        previousShared ? settleStaleTextViewsRef.current?.(localProjection, previousShared) ?? localProjection : localProjection,
        privateKeysRef.current,
      );
      // A merge is built afresh: what it leaves as the room has it is handed
      // on as the room's own objects, so a slide nobody changed reads as unchanged.
      const mergedShared =
        previousShared && !jsonEquals(localShared, previousShared)
          ? shareUnchangedJson(mergePageDocumentDelta(roomDoc, localShared, previousShared), roomDoc)
          : roomDoc;
      // The room owns shared content; this member owns their view state. Keep
      // the ROOM baseline separate from the rebased editor projection so a
      // local delta held during stale authority is still publishable later.
      const privateProjection = pickPrivate(
        localProjection,
        privateKeysRef.current,
      );
      const roomBaseline: PageContentDocument = {
        ...privateProjection,
        ...roomDoc,
      };
      const merged: PageContentDocument = {
        ...privateProjection,
        ...mergedShared,
      };
      baselineRef.current = roomBaseline;
      baselineIsOwnAtRef.current = null;
      const alreadyDelivered = Boolean(
        lastDelivery && jsonEquals(merged, lastDelivery.projection),
      );
      lastDeliveryRef.current = { source: localDoc, projection: merged };
      madeAtRef.current.set(merged, textWritesRef.current.seq);
      handedAtRef.current.set(merged, performance.now());
      deliveredForeignAtRef.current = foreignTransactionsRef.current;
      deliveryIsOwnRef.current = false;
      if (coeditTraceOn()) coeditTrace("deliver", { force: Boolean(options?.force), room: coeditTail(roomDoc, tracedPathRef.current),
        local: coeditTail(localShared, tracedPathRef.current), base: coeditTail(previousShared, tracedPathRef.current),
        merged: coeditTail(merged, tracedPathRef.current), skipped: alreadyDelivered && !options?.force,
        changes: textChanges?.length ?? 0, projectMs: Math.round(performance.now() - deliveryStartedAt) });
      if (alreadyDelivered && !options?.force) return;
      const carets = options?.carets ?? (textChanges?.length ? caretsAfterChangeRef.current?.(textChanges) : undefined);
      onRemoteRef.current(merged, textChanges?.length ? { textChanges, ...(carets ? { carets } : {}) } : undefined);
      lastDeliveryEndedAt = performance.now();
      lastDeliveryMs = lastDeliveryEndedAt - deliveryStartedAt;
      if (coeditTraceOn()) coeditTrace("delivered", { ms: Math.round(lastDeliveryMs) });
    };
    redeliverRef.current = () => queueMicrotask(() => {
      if (!disposed && sessionRef.current === session) deliver(undefined, { force: true });
    });
    // A peer's update is handed over at once, unless it came while the
    // window was still on a long delivery (one that took a frame or more and
    // ended moments ago: the updates queued behind its work arrive back to
    // back). Those
    // wait for the end of the burst and go as one delivery: a deck's room
    // replaying a closed window's keys delivered and drew the whole deck once
    
    // words without those keys while the member typed, and a key pressed
    
    const DELIVERY_BURST_MS = 32;
    const LONG_DELIVERY_MS = 50;
    const deliverRemote = (changes: CollaborativeTextChange[]) => {
      if (heldRemoteChanges) {
        heldRemoteChanges.push(...changes);
        return;
      }
      if (lastDeliveryMs < LONG_DELIVERY_MS || performance.now() - lastDeliveryEndedAt >= DELIVERY_BURST_MS) {
        deliver(changes);
        return;
      }
      heldRemoteChanges = [...changes];
      window.setTimeout(() => {
        if (!heldRemoteChanges) return;
        deliver(undefined);
      }, 0);
    };

    const observer = (
      events: Y.YEvent<never>[],
      transaction: Y.Transaction,
    ) => {
      if (disposed || sessionRef.current !== session || bindingRef.current !== authorityBinding ||
          !(causalScopeRef.current?.() ?? true)) return;
      if (transaction.origin === localOrigin || transaction.origin === INITIAL_ORIGIN ||
          transaction.origin === maintenanceOrigin || replayingHistoryRef.current) return;
      // Replay in progress: the document is partial, and handing a partial
      // document to an editor makes it the editor's truth (and then its save).
      if (!readyRef.current) return;
      // The texts' deltas are readable only while the events are dispatched.
      deliverRemote(collaborativeTextChanges(events));
    };
    root.observeDeep(observer as never);

    const adoptDurable = async (page: PageItem, submitted?: {
      recovery: PageCausalRecovery; content: PageContentDocument;
    }, canApply?: () => boolean): Promise<boolean> => {
      // A body the server wrote (not this member's own save receipt) is held
      
      const body = !submitted && page.content_json && typeof page.content_json === "object" &&
        !Array.isArray(page.content_json) ? page.content_json as PageContentDocument : null;
      if (!body) return adoptDurableOnce(page, submitted, canApply);
      pendingAdoptionRef.current = body;
      let adopted = false;
      try {
        adopted = await adoptDurableOnce(page, submitted, canApply);
        return adopted;
      } finally {
        if (pendingAdoptionRef.current === body) pendingAdoptionRef.current = null;
        // Not merged after all: what the editor shows goes out as its own.
        if (!adopted && !disposed && sessionRef.current === session) publishLocalContent();
      }
    };
    const adoptDurableOnce = async (page: PageItem, submitted?: {
      recovery: PageCausalRecovery; content: PageContentDocument;
    }, canApply?: () => boolean): Promise<boolean> => {
      const receipt = page.page_causal_checkpoint;
      if (disposed || page.id !== pageId || !receipt || !supportsCausalPrivateKeys() || receipt.checkpoint.model !== causalModel) return false;
      // A migrated receipt belongs to its own transport and Y.Doc. A saved
      // notice may arrive while this hook still owns an unbound legacy room.
      if (receipt.epoch > 1 && receipt.epoch !== migratedEpoch) return false;
      if (causalEpoch !== null && receipt.epoch !== causalEpoch) return false;
      if (causalEpoch !== null && (receipt.revision < causalRevision ||
          (receipt.revision === causalRevision && receipt.content_version < causalVersion))) return false;
      // The very checkpoint this room is bound to already (a save adopts its
      // source again before it is sent): verified then, not read again.
      const bound = !submitted && durablePrepared && durablePrepared.pageId === page.id && receipt.page_id === page.id &&
        durablePrepared.epoch === receipt.epoch && durablePrepared.revision === receipt.revision &&
        durablePrepared.contentVersion === receipt.content_version && page.content_version === receipt.content_version &&
        durablePrepared.contentSha256 === receipt.content_sha256 && page.content_sha256 === receipt.content_sha256 &&
        durablePrepared.snapshot.sha256 === receipt.checkpoint.update_sha256 ? durablePrepared : null;
      const preparing = bound ? Promise.resolve(bound) : submitted
        ? preparePageCausalSaveReceipt(receipt, pageForCausalCheckpoint(page), submitted)
        : preparePageCausalCheckpoint(receipt, pageForCausalCheckpoint(page));
      // The room this window joins may hold exactly these bytes as its snapshot.
      session.provider?.offerDurablePageSnapshot?.(durablePageSnapshotOffer(receipt, preparing));
      const prepared = await preparing;
      if (disposed || sessionRef.current !== session || bindingRef.current !== authorityBinding ||
          !(causalScopeRef.current?.() ?? true) ||
          !(canApply?.() ?? true) ||
          (causalEpoch !== null && prepared.epoch !== causalEpoch)) return false;
      if (prepared.revision < causalRevision || prepared.contentVersion < causalVersion) return false;
      const wasReady = readyRef.current;
      readyRef.current = false;
      try {
        if (submitted && session.provider?.withDurablePageUpdate) {
          session.provider.withDurablePageUpdate(ownSaveReceiptOrigin,
            () => prepared.merge(session.ydoc, ownSaveReceiptOrigin));
        } else {
          prepared.merge(session.ydoc, submitted && !session.provider ? ownSaveReceiptOrigin : session.provider);
        }
        causalEpoch = prepared.epoch;
        causalRevision = prepared.revision;
        causalVersion = prepared.contentVersion;
        causalSaved = prepared.covers(session.ydoc);
        durablePrepared = prepared;
      } finally { readyRef.current = wasReady; }
      if (wasReady) {
        causalReadyRef.current = true;
        causalStatus = "ready";
        deliver();
        notifyHistory();
      }
      return true;
    };
    adoptDurableRef.current = adoptDurable;
    const prepareMaintenance = async (beforePage: PageItem, afterPage: PageItem): Promise<PreparedPageMaintenanceApply | null> => {
      const beforeSnapshot = structuredClone(beforePage);
      const afterSnapshot = structuredClone(afterPage);
      const beforeReceipt = beforeSnapshot.page_causal_checkpoint;
      const afterReceipt = afterSnapshot.page_causal_checkpoint;
      if (!isCurrent() || !causalReadyRef.current || !beforeReceipt || !afterReceipt ||
          beforePage.id !== pageId || afterPage.id !== pageId ||
          !beforeSnapshot.notebook_id || beforeSnapshot.notebook_id !== afterSnapshot.notebook_id ||
          beforeSnapshot.page_type !== afterSnapshot.page_type || beforeSnapshot.title !== afterSnapshot.title ||
          beforeReceipt.epoch !== causalEpoch || afterReceipt.epoch !== causalEpoch ||
          (afterPage.content_version ?? 0) <= (beforePage.content_version ?? 0)) {
        return null;
      }
      // Both bodies are independently paired with their original bytes; the
      // after chain must retain every before struct/deletion, not just JSON.
      const before = pageForCausalCheckpoint(beforeSnapshot);
      const after = pageForCausalCheckpoint(afterSnapshot);
      await preparePageCausalCheckpoint(beforeReceipt, before);
      const prepared = await preparePageCausalSaveReceipt(afterReceipt, after, {
        recovery: { model: causalModel, page_id: pageId, epoch: beforeReceipt.epoch,
          base_title: beforeSnapshot.title, update_base64: beforeReceipt.checkpoint.update_base64 },
        content: before.content_json,
      });
      let consumed = false;
      return (content, guardKeys = []) => {
        if (consumed || !isCurrent() || !causalReadyRef.current || prepared.epoch !== causalEpoch ||
            prepared.revision < causalRevision || prepared.contentVersion < causalVersion || !supportsCausalPrivateKeys()) {
          return { status: "unavailable" };
        }
        const room = yToJsonShared(root) as PageContentDocument;
        if (!canApplyPageMaintenanceDelta(content, before.content_json, after.content_json, guardKeys) ||
            !canApplyPageMaintenanceDelta(room, stripPrivate(before.content_json, privateKeysRef.current),
              stripPrivate(after.content_json, privateKeysRef.current), guardKeys.filter(key => !privateKeysRef.current.includes(key)))) {
          return { status: "changed" };
        }
        // Flush genuine notes with their author origin. Only the verified
        // server change uses maintenance provenance; no JSON reconstruction.
        contentRef.current = withTextWritesSince(content, textWritesRef.current, madeAtRef.current);
        publishLocalContent();
        history.stopCapturing();
        readyRef.current = false;
        try {
          if (session.provider?.withDurablePageUpdate) {
            session.provider.withDurablePageUpdate(ownSaveReceiptOrigin,
              () => prepared.merge(session.ydoc, ownSaveReceiptOrigin));
          } else {
            prepared.merge(session.ydoc, session.provider ?? ownSaveReceiptOrigin);
          }
          causalRevision = prepared.revision;
          causalVersion = prepared.contentVersion;
          causalSaved = prepared.covers(session.ydoc);
          durablePrepared = prepared;
          consumed = true;
        } finally { readyRef.current = true; }
        if (causalModel === "pdf-author-v1") contentRef.current = withPdfDurableJournal(content, after.content_json);
        const projection = currentProjection();
        contentRef.current = projection;
        notifyHistory();
        return { status: "accepted", content: projection };
      };
    };
    const unsubscribeHistory = history.subscribe(notifyHistory);
    const onOriginalUpdate = () => {
      // Only the first change needs a UI notification. Do not encode the full
      // document on each gesture; verify coverage when a receipt arrives.
      if (!disposed && causalSaved) {
        causalSaved = false;
        notifyHistory();
      }
    };
    session.ydoc.on("update", onOriginalUpdate);
    // A deck's edits its room has not confirmed go to the room's durable
    // custody over HTTP (lib/collab/room-custody-pump): a socket a busy
    // server never admitted left every key after the first in the browser,
    
    const custodyPump = causalModel === "page-json-v1" && pageId && session.network && session.provider?.durableUpdates &&
      roomCustodyPumpEnabled()
      ? createRoomCustodyPump({
        read: closingCausal,
        state: () => {
          const network = session.network;
          const live = Boolean(network?.ready && network.connected && !network.failed);
          const durable = session.provider?.durableUpdates?.();
          // A live room on a server that does not confirm relays and saves as before.
          return { live, settled: live && durable ? durable.settled || !durable.active : false };
        },
        send: (edits, signal) => sendPageCustodyEdits(pageId, {
          epoch: edits.epoch, model: edits.model, update_base64: closingBytesBase64(edits.update),
          client_id: session.ydoc.clientID }, signal),
      })
      : null;
    // This member's own changes (typing, Undo, a command), not the room's.
    const onCustodyChange = (_update: Uint8Array, _origin: unknown, _doc: Y.Doc, transaction: Y.Transaction) => {
      if (transaction.local) custodyPump?.noteChange();
    };
    if (custodyPump) session.ydoc.on("update", onCustodyChange);

    









    const establishBaseline = (): boolean => {
      if (disposed || !readyRef.current) return false;
      if (root.size > 0) {
        // A room written before slide text merged by character still holds
        // it as scalars: a writer converts them once, outside its personal
        // history (see `upgradeCollaborativeText`).
        if (canPublish()) session.ydoc.transact(() => upgradeCollaborativeText(root), INITIAL_ORIGIN);
        // The room already has a document: adopt it and report NOT-seeded.
        // `content` predates the adoption, and diffing it against the freshly
        // adopted baseline would push this member's stale values back over
        // the room's; `deliver` rebases it instead, carrying only what the
        // member changed since their own base.
        deliver();
        return false;
      }
      const local = contentRef.current;
      if (!local || !canPublish()) return false;
      const shared = stripPrivate(local, privateKeysRef.current);
      session.ydoc.transact(() => {
        applyJsonDelta(root, shared, {});
      }, INITIAL_ORIGIN);
      baselineRef.current = { ...local };
      lastDeliveryRef.current = { source: local, projection: local };
      deliveryIsOwnRef.current = false;
      return true;
    };
    establishBaselineRef.current = establishBaseline;

    const onReady = () => {
      if (disposed) return;
      const durable = durablePageRef.current;
      if (!durable?.page_causal_checkpoint && !networkReady) return;
      if (durable?.page_causal_activation_available && !durable.page_causal_checkpoint &&
          (!authorityCanPublishRef.current || !activateCausalRef.current)) {
        // A reader observes the actual saved source while a writer upgrades
        // the room; an unbound legacy replay is not that source's authority.
        causalStatus = "preparing";
        notifyHistory();
        return;
      }
      if (durable?.page_causal_checkpoint || (durable?.page_causal_activation_available &&
          authorityCanPublishRef.current && activateCausalRef.current)) {
        if (bootstrapStarted) return;
        bootstrapStarted = true;
        const recovery = recoveredCausalDraftRef.current;
        // While verification awaits crypto, input is held against the exact
        // loaded generation. It must not be diffed against the stale room.
        baselineRef.current = recovery?.content ?? durable.content_json as PageContentDocument;
        baselineIsOwnAtRef.current = null;
        bootstrapping = (async () => {
          let source = durable;
          if (!source.page_causal_checkpoint) {
            if (privateKeysRef.current.length || !canPublish() || !activateCausalRef.current) return false;
            const initial = pageForCausalCheckpoint(source).content_json;
            if (root.size === 0) session.ydoc.transact(() => applyJsonDelta(root, initial, {}), INITIAL_ORIGIN);
            // An existing divergent room cannot be anchored from reconstructed
            // JSON. Preserve it and refuse activation until migration reconciles it.
            const checkpoint = await capturePageCausalCheckpoint(session.ydoc, initial);
            if (disposed || !canPublish()) return false;
            source = await activateCausalRef.current(source, checkpoint);
          }
          if (!(await adoptDurable(source))) return false;
          if (recovery) applyPageCausalRecovery(session.ydoc, recovery.recovery, recovery.content,
            pageId, source.page_causal_checkpoint!.epoch, session.provider, causalModel);
          if (disposed || bindingRef.current !== authorityBinding || !(causalScopeRef.current?.() ?? true)) return false;
          readyRef.current = true;
          causalReadyRef.current = true;
          causalStatus = "ready";
          session.provider?.seedDurablePageState?.();
          deliver();
          publishLocalContent();
          notifyHistory();
          return true;
        })().then((accepted) => {
          if (!accepted && !disposed) {
            bootstrapStarted = false; bootstrapping = null; causalStatus = "failed"; notifyHistory();
          }
          return accepted;
        }).catch((error) => {
          if (!disposed) {
            causalFailureCause = error instanceof PageCausalCheckpointError &&
              ["invalid", "incomplete"].includes(error.code) ? "invalid_data" : "session_changed";
            bootstrapStarted = false; bootstrapping = null; causalStatus = "failed"; notifyHistory();
            // The page it was set up from is refused as a checkpoint: no retry of
            // that same page can take, and the keys typed meanwhile wait in this
            
            // copy joined to the stored page was retried every 2 s, refused each time).
            if (error instanceof PageCausalCheckpointError && error.code !== "incomplete") {
              const code = error.code;
              queueMicrotask(() => { if (!disposed) causalSourceRefusedRef.current?.(code); });
            }
          }
          return false;
        });
        return;
      }
      readyRef.current = true;
      establishBaseline();
      // What an adoption carried is still only in this editor: publish it.
      publishLocalContent();
      notifyHistory();
    };
    initializeRef.current = onReady;

    const network = session.network;
    const onNetworkReady = () => {
      networkReady = true;
      onReady();
      if (!disposed && readyRef.current && causalReadyRef.current) {
        session.provider?.seedDurablePageState?.();
        publishLocalContent();
      }
    };
    // An exact durable checkpoint is enough for local editing and HTTP saves.
    // A down websocket must not hold the file's original model hostage.
    if (durablePageRef.current?.page_causal_checkpoint) onReady();
    if (network?.whenReady) {
      void network.whenReady.then(onNetworkReady).catch(() => {
        // No room (guest / offline / refused ticket): stay local-only. The
        // editor keeps working; nothing is published and nothing is adopted.
        if (!causalReadyRef.current) readyRef.current = false;
      });
    } else {
      onNetworkReady();
    }
    const retryHeldLocalContent = () => {
      // The writable hello precedes replay completion. Retry after the
      // provider finishes its state transition, using the current content
      // and authority, not a captured draft from the interrupted connection.
      queueMicrotask(() => {
        if (!disposed && sessionRef.current === session) {
          if (networkReady && !readyRef.current && !bootstrapping) onReady();
          publishLocalContent();
          notifyHistory();
        }
      });
    };
    const unsubscribeWritable = session.provider?.subscribeWritable?.(
      retryHeldLocalContent,
    );
    let connected = network?.connected ?? false;
    const unsubscribeConnection = network?.subscribeConnection?.((next) => {
      const reconnected = next && !connected;
      connected = next;
      retryHeldLocalContent();
      if (reconnected && causalEpoch !== null && readyRef.current) causalReconnectRef.current?.();
    });

    return () => {
      disposed = true;
      writeTextEditNowRef.current = null;
      settleStaleTextViewsRef.current = null;
      textKeys.destroy();
      anchorTextCaretRef.current = null;
      caretsAfterChangeRef.current = null;
      modelStatus.release();
      unsubscribeHistory();
      session.ydoc.off("update", onOriginalUpdate);
      if (custodyPump) session.ydoc.off("update", onCustodyChange);
      custodyPump?.dispose();
      session.ydoc.off("afterTransaction", countForeignTransaction);
      session.ydoc.off("afterTransaction", noteUndrawnText);
      undrawnGuardRef.current = null;
      redeliverRef.current = null;
      baselineIsOwnAtRef.current = null;
      stopCreationWatch();
      session.ydoc.off("beforeObserverCalls", writeOrphanTextEdits);
      session.ydoc.off("afterTransaction", forgetOrphanTextEdits);
      orphanTextEdits.clear();
      history.destroy();
      if (notifyHistoryRef.current === notifyHistory) notifyHistoryRef.current = null;
      unsubscribeWritable?.();
      unsubscribeConnection?.();
      readyRef.current = false;
      causalReadyRef.current = false;
      if (adoptDurableRef.current === adoptDurable) adoptDurableRef.current = null;
      if (initializeRef.current === onReady) initializeRef.current = null;
      establishBaselineRef.current = null;
      root.unobserveDeep(observer as never);
      session.destroy();
      sessionRef.current = null;
      setRoomAwareness((current) => (current === session.awareness ? null : current));
      rootRef.current = null;
      // A rebuilt session (an access change) adopts its room afresh: what the
      // editor holds beyond this projection is its unpublished work.
      if (baselineRef.current) adoptionBaseRef.current = { pageId, content: baselineRef.current };
      baselineRef.current = null;
      baselineIsOwnAtRef.current = null;
      lastDeliveryRef.current = null;
      deliveryIsOwnRef.current = false;
    };
  }, [active, pageId, authorityBinding, canPublish, localOrigin, migratedEpoch, causalModel, publishLocalContent]);

  useEffect(() => {
    if (!readyRef.current) { initializeRef.current?.(); return; }
    if (!durablePage?.page_causal_checkpoint) return;
    void adoptDurableRef.current?.(durablePage).catch(() => undefined);
  }, [durablePage]);

  useEffect(() => {
    if (authority.canPublish && !readyRef.current) initializeRef.current?.();
  }, [authority.canPublish]);

  // Publish local edits as a DELTA against what the editor last knew.
  useEffect(() => {
    publishLocalContent();
    notifyHistoryRef.current?.();
  }, [authority.canPublish, content, publishLocalContent]);

  const current = active && controller.binding === authorityBinding && authority.canPublish;
  return {
    awareness: roomAwareness,
    flushContent: controller.flushContent,
    roomUnavailable: controller.roomUnavailable,
    applyMaintenanceDelta: controller.applyMaintenanceDelta,
    stateVectorBase64: current ? controller.stateVectorBase64 : undefined,
    clientId: current ? controller.clientId : undefined,
    applyOwnServerUpdate: current ? controller.applyOwnServerUpdate : undefined,
    causal: controller.causal,
    noteTextEdit,
    textEditsWaiting,
    anchorTextCaret,
    history: current || !controller.history ? controller.history : {
      ...controller.history, available: false, canUndo: false, canRedo: false,
    },
  };
}

const LEGACY_SYNC_CONTROLLER: PageContentSyncController = {
  mode: "legacy",
  presence: null,
  persistContent: async () => null,
};

export function usePageContentSync(
  options: PageContentSyncOptions,
): PageContentSyncController {
  const strategy = options.strategy ?? "page";
  const sharded = useWorkbookShardedContentSync({
    pageId: options.pageId,
    content: options.content,
    contentVersion: options.contentVersion,
    onRemoteContent: options.onRemoteContent,
    enabled: options.enabled !== false && strategy === "workbook-sharded-v2",
    authorityKey: options.authorityKey,
    privateKeys: options.privateKeys,
    durableContent:
      options.durablePage?.id === options.pageId &&
      options.durablePage?.content_json &&
      typeof options.durablePage.content_version === "number"
        ? {
            content: options.durablePage.content_json as WorkbookContentDocument,
            version: options.durablePage.content_version,
            sha256: options.durablePage.content_sha256,
          }
        : null,
  });
  const useLegacy =
    strategy === "page" ||
    (strategy === "workbook-sharded-v2" && sharded.mode === "legacy");
  const legacy = useLegacyPageContentSync({
    ...options,
    enabled: options.enabled !== false && useLegacy,
  });
  return strategy === "workbook-sharded-v2" && sharded.mode !== "legacy"
    ? sharded
    : { ...LEGACY_SYNC_CONTROLLER, ...legacy };
}
