"use client";





















/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { reloadPage } from "@mrnote/core/web/lib/reload-reason.ts";
import { applyWorkbookEdits, closingEditsSentRecently, isWorkbookClosingEdits, typedCellsMissingFromPage, workbookClosingEdits } from "../../../../lib/spreadsheet/workbook-closing-edits";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import ConfirmDialog from "@mrnote/core/web/components/ui/ConfirmDialog.tsx";
import WindowNotice from "@mrnote/core/web/components/notebook/WindowNotice.tsx";
import noticeStyles from "@mrnote/core/web/components/notebook/DocumentIssueNotice.module.css";
import styles from "@mrnote/core/web/components/notebook/WindowNotice.module.css";
import { useRegisterWindowSaveActions } from "@mrnote/core/web/components/notebook/WindowCloseGuard.tsx";
import { toast } from "@mrnote/core/web/hooks/use-toast.ts";
import type { PageDocumentDraft, PageSaveStatus } from "@mrnote/core/web/hooks/useAutosavedPageDocument.ts";
import {
  AUTH_SESSION_HELD_EVENT,
  AUTH_SESSION_RESTORED_EVENT,
  isAuthSessionHeld,
  registerUnsavedWorkHold,
} from "@mrnote/core/web/lib/api.ts";
import {
  autoRecoverPrincipal,
  clearCurrentAutoRecover,
  deleteAutoRecoverCopy,
  flushAutoRecoverWrites,
  isCurrentAutoRecoverSlot,
  listAutoRecoverCopies,
  noteAutoRecoverChange,
  setAsideAutoRecoverCopy,
  type AutoRecoverCopy,
  type AutoRecoverReason,
} from "@mrnote/core/web/lib/autorecover-store.ts";
import { dispatchNotebookPagesChanged } from "@mrnote/core/web/lib/notebook-events.ts";
import type { PageItem } from "@mrnote/core/web/lib/notebook-sdk.ts";
import { openReauthWindow, reauthLoginUrl, watchSessionRestore } from "@mrnote/core/web/lib/session-reauth.ts";
import { saveWorkbookCopyToNotebook } from "../../../../lib/spreadsheet/save-copy-to-notebook";
import { downloadUnsavedWorkbookCopy, safeWorkbookFileName } from "../../../../lib/spreadsheet/unsaved-copy";
import type { TiledSheets } from "../../../../lib/spreadsheet/tiled-sheets";
import { importRepairLine, importRepairsFingerprint, readImportRepairs } from "@mrnote/core/web/lib/import-repairs.ts";
import type { PageExportLastGoodCopy } from "@mrnote/core/web/lib/page-export.ts";
import { pageInterfaceLocale } from "@mrnote/core/web/lib/i18n/content-locale.ts";

export { downloadLastGoodCopy, preferredLastGoodCopy } from "@mrnote/core/web/lib/page-export-last-good.ts";

export function lastGoodCopyLabel(copy: PageExportLastGoodCopy, t: (key: string, values?: Record<string, string | number>) => string): string {
  let time = "";
  try {
    time = copy.createdAt
      ? new Intl.DateTimeFormat(pageInterfaceLocale(), { dateStyle: "medium", timeStyle: "short" }).format(new Date(copy.createdAt))
      : "";
  } catch {
    time = copy.createdAt ?? "";
  }
  return t(copy.kind === "original"
    ? "spreadsheet.saveResilience.lastGood.downloadOriginal"
    : "spreadsheet.saveResilience.lastGood.download", { time });
}

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** What of the autosave result this adapter reads (the optional members are
 * the hook's additive inspections). */
export interface SpreadsheetResilienceAutosave {
  page: PageItem | null;
  loading: boolean;
  error: string | null;
  saveStatus: PageSaveStatus;
  isDirty: boolean;
  hasConflict: boolean;
  readOnly: boolean;
  isCachedPreview?: boolean;
  isLocalAuthorityPending?: boolean;
  getLastSaveFailureCode?: () => string | null;
  getLastSaveFailureStatus?: () => number | null;
  isLastSaveFailureRetryable?: () => boolean;
  readSettledSave?: () => unknown;
  /** Catching up with a page another window saved (its edits go onto it). */
  workbookCatchingUp?: boolean;
  retrySave: () => Promise<PageItem | null>;
  saveNow: () => Promise<PageItem | null>;
  discardLocalAndReload: () => Promise<unknown> | unknown;
  overwriteRemote: () => Promise<unknown> | unknown;
  saveConflictAsCopy: () => Promise<unknown> | unknown;
}

/** 409 codes that refuse this save without a remote update (see the hook's
 * `nonConflictRefusalCodes`). */
export const SPREADSHEET_NON_CONFLICT_REFUSAL_CODES = Object.freeze([
  "workbook_blocked",
  "canonical_receipt_required",
  "page_authority_changed",
  "workbook_not_active",
  "activation_not_ready",
  "materializer_incomplete",
  "snapshot_storage_corrupt",
]);

export interface SpreadsheetSaveFailureText {
  /** The catalog key of the reason (spreadsheet.saveResilience.failure.*). */
  key: string;
  /** Saving is retried by itself; the notice does not need to open. */
  transient: boolean;
}

/** The reason a save was refused, from its HTTP status and error code. */
export function describeSpreadsheetSaveFailure(input: {
  status: number | null;
  code: string | null;
  offline?: boolean;
}): SpreadsheetSaveFailureText {
  const { status, code } = input;
  const byCode: Record<string, SpreadsheetSaveFailureText> = {
    workbook_blocked: { key: "workbookBlocked", transient: false },
    canonical_receipt_required: { key: "refreshRequired", transient: false },
    page_authority_changed: { key: "pageMoved", transient: false },
    workbook_not_active: { key: "notReady", transient: true },
    activation_not_ready: { key: "notReady", transient: true },
    materializer_incomplete: { key: "notReady", transient: true },
    snapshot_storage_corrupt: { key: "storageCorrupt", transient: false },
    empty_content_overwrite: { key: "emptyRefused", transient: false },
    materializer_source_conflict: { key: "remoteChanged", transient: false },
  };
  if (code && byCode[code]) return byCode[code];
  if (code && code.endsWith("_too_large")) return { key: "tooLarge", transient: false };
  if (input.offline || status === 0) return { key: "offline", transient: true };
  if (status === 403) return { key: "forbidden", transient: false };
  if (status === 404 || status === 410) return { key: "notFound", transient: false };
  if (status === 413) return { key: "tooLarge", transient: false };
  if (status === 402) return { key: "planLimit", transient: false };
  if (status === 408) return { key: "timeout", transient: true };
  if (status === 429) return { key: "busy", transient: true };
  if (status === 400 || status === 422) return { key: "invalid", transient: false };
  if (status !== null && status >= 500) return { key: "server", transient: true };
  // No answer of the server to read (a shared workbook's live rooms holding
  // the save): the save machinery's own sentence says why.
  if (status === null) return { key: "held", transient: true };
  return { key: "generic", transient: false };
}

const DERIVED_KEYS = new Set(["display", "chartValueCache", "activeSheetId"]);

/** A workbook body without what the window derives on its own (display
 * caches, the active tab), keys sorted: two bodies with the same authored
 * content give the same text. */
export function workbookContentFingerprint(value: unknown): string {
  const walk = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(walk);
    if (!item || typeof item !== "object") return item;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(item as Record<string, unknown>).sort()) {
      if (DERIVED_KEYS.has(key)) continue;
      const member = (item as Record<string, unknown>)[key];
      if (member === undefined) continue;
      out[key] = walk(member);
    }
    return out;
  };
  return JSON.stringify(walk(value));
}

interface KeptCopy {
  content: Record<string, unknown>;
  title: string;
  savedAt: number;
  reason: AutoRecoverReason;
  slot: string | null;
}

interface RecoveryState {
  copies: AutoRecoverCopy[];
  /** Opened by itself (a copy differing from the window was found). */
  autoOpen: boolean;
  /** Bumped to reopen the notice. */
  nonce: number;
}

export interface SpreadsheetSaveResilienceOptions {
  pageId: string;
  enabled: boolean;
  windowId?: string;
  title: string;
  autosave: SpreadsheetResilienceAutosave;
  tiled: () => TiledSheets | null;
  /** The window's workbook as it would be saved now, or null. */
  readCurrentContent: () => Promise<Record<string, unknown> | null>;
  /** Show this body in the window and queue it as an ordinary edit. */
  applyRecoveredContent: (content: Record<string, unknown>, extra: Record<string, unknown> | undefined) => void;
  t: Translate;
}

export function useSpreadsheetSaveResilience(options: SpreadsheetSaveResilienceOptions) {
  const { pageId, enabled, windowId, autosave, t } = options;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const lastContentRef = useRef<Record<string, unknown> | null>(null);
  const [recoveryChecked, setRecoveryChecked] = useState(false);
  const recoveryCheckedRef = useRef(false);
  const initialReadRef = useRef<Promise<AutoRecoverCopy[]> | null>(null);
  const [recovery, setRecovery] = useState<RecoveryState | null>(null);
  const [keptCopy, setKeptCopy] = useState<KeptCopy | null>(null);
  const [sessionHeld, setSessionHeld] = useState(false);
  const [accountChanged, setAccountChanged] = useState(false);
  const heldPrincipalRef = useRef<string | null>(null);
  const [tiledFailure, setTiledFailure] = useState<{ message: string; status: number | null; code: string | null; attempt: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine !== false);
  const statusRef = useRef({ saveStatus: autosave.saveStatus, isDirty: autosave.isDirty, hasConflict: autosave.hasConflict });
  statusRef.current = { saveStatus: autosave.saveStatus, isDirty: autosave.isDirty, hasConflict: autosave.hasConflict };

  const tiledPending = () => Boolean(optionsRef.current.tiled()?.hasPendingEdits);
  const holdsUnsaved = useCallback(() => {
    const status = statusRef.current;
    return status.saveStatus !== "saved" || status.isDirty || status.hasConflict || tiledPending();
  }, []);

  // ── AutoRecover: note every change ───────────────────────────────────────
  // A tiled workbook's save of its edits on its way: the copy waits for it.
  const tiledSaving = useCallback(() => optionsRef.current.tiled()?.saving === true, []);
  const buildEntry = useCallback(() => {
    const content = lastContentRef.current;
    if (!content) return null;
    const tiledEdits = optionsRef.current.tiled()?.pendingSnapshot() ?? null;
    // What was typed, by the cell, against the page it was typed on: kept on a
    // page another window has saved since, only these cells go in, not the whole
    // copy over the other window's work.
    const page = optionsRef.current.autosave.page;
    const base = unsavedBaseRef.current ??
      (page?.content_json ? { content: page.content_json, version: page.content_version ?? 0 } : null);
    const cellEdits = base ? workbookClosingEdits(base.content, content, base.version) : null;
    const extra = { ...(tiledEdits ? { tiledEdits } : {}), ...(cellEdits ? { cellEdits } : {}) };
    return {
      payload: {
        content,
        title: optionsRef.current.title,
        ...(Object.keys(extra).length ? { extra } : {}),
      },
      baseContentVersion: optionsRef.current.autosave.page?.content_version ?? 0,
      reason: "unsaved" as const,
    };
  }, []);
  // The page as it stood when the edits not yet saved began.
  const unsavedBaseRef = useRef<{ content: unknown; version: number } | null>(null);
  const noteContent = useCallback((content: Record<string, unknown> | undefined | null) => {
    if (!enabled || !pageId) return;
    if (content) {
      lastContentRef.current = content;
      const page = optionsRef.current.autosave.page;
      unsavedBaseRef.current ??= page?.content_json
        ? { content: page.content_json, version: page.content_version ?? 0 }
        : null;
    }
    // Nothing is written over the copies of an earlier session before they
    // were read (the read sets them aside first, then writes this change).
    const reading = initialReadRef.current;
    if (!reading) return;
    void reading.then(() => noteAutoRecoverChange(pageId, buildEntry, tiledSaving));
  }, [buildEntry, enabled, pageId, tiledSaving]);
  const noteDraft = useCallback((draft: PageDocumentDraft | undefined) => {
    if (draft?.content_json && typeof draft.content_json === "object") {
      noteContent(draft.content_json as Record<string, unknown>);
    }
  }, [noteContent]);

  // Open: read this account's copies of the page once (the comparison below
  // decides whether each is offered or forgotten).
  useEffect(() => {
    if (!enabled || !pageId) return;
    let cancelled = false;
    // Another tab's copy is listed only once that tab is closed (its
    // window was still saving its own edits otherwise).
    const reading = listAutoRecoverCopies(pageId).catch(() => [] as AutoRecoverCopy[]);
    initialReadRef.current = reading;
    void reading.then(() => {
      if (cancelled) return;
      // A change made while the copies were read is written now.
      if (lastContentRef.current && statusRef.current.saveStatus !== "saved") noteAutoRecoverChange(pageId, buildEntry, tiledSaving);
    });
    return () => {
      cancelled = true;
      if (initialReadRef.current === reading) initialReadRef.current = null;
      recoveryCheckedRef.current = false;
    };
  }, [buildEntry, enabled, pageId, tiledSaving]);

  // Once the page is loaded and settled (the session draft and the rooms'
  // replay restored what they hold), compare: a copy equal to the window is
  // already back and is forgotten; a different one is offered.
  const ready = enabled && !autosave.loading && Boolean(autosave.page) && !autosave.isCachedPreview &&
    !autosave.isLocalAuthorityPending;
  useEffect(() => {
    if (!ready || recoveryCheckedRef.current) return;
    const reading = initialReadRef.current;
    if (!reading) return;
    let cancelled = false;
    void (async () => {
      const copies = await reading;
      // No copy kept: nothing to compare, and reading the workbook to compare
      // with would build its whole content and start its calculation in the
      
      if (copies.length === 0) {
        if (cancelled) return;
        recoveryCheckedRef.current = true;
        setRecoveryChecked(true);
        return;
      }
      // Up to ~10 s for the window to settle (its first save confirmed).
      for (let waited = 0; waited < 10_000; waited += 500) {
        if (cancelled) return;
        const view = optionsRef.current.autosave;
        if (view.saveStatus === "saved" && !view.isDirty && (!view.readSettledSave || view.readSettledSave() !== null)) break;
        await new Promise((resolve) => window.setTimeout(resolve, 500));
      }
      if (cancelled) return;
      let offered: AutoRecoverCopy[] = [];
      let differs = false;
      // A window that closed while its rooms prepared sent these edits to be saved:
      // this one follows that save soon. Only what is still different then is offered.
      for (;;) {
        let current: Record<string, unknown> | null = null;
        try {
          current = await optionsRef.current.readCurrentContent();
        } catch {
          current = null;
        }
        if (cancelled) return;
        current ??= lastContentRef.current ??
          (optionsRef.current.autosave.page?.content_json as Record<string, unknown> | undefined) ?? null;
        const shown = current ? workbookContentFingerprint(current) : null;
        offered = [];
        differs = false;
        for (const copy of copies) {
          const wasCurrent = isCurrentAutoRecoverSlot(copy.slot);
          const hasTiledEdits = Boolean(copy.payload.extra?.tiledEdits);
          const same = shown !== null && !hasTiledEdits && workbookContentFingerprint(copy.payload.content) === shown;
          if (same) {
            void deleteAutoRecoverCopy(pageId, copy.slot);
            continue;
          }
          offered.push(copy);
          if (wasCurrent) differs = true;
        }
        if (offered.length === 0 || !closingEditsSentRecently(pageId)) break;
        await new Promise((resolve) => window.setTimeout(resolve, 3_000));
        if (cancelled) return;
      }
      recoveryCheckedRef.current = true;
      setRecoveryChecked(true);
      if (offered.length) setRecovery({ copies: offered, autoOpen: differs, nonce: 0 });
    })();
    return () => { cancelled = true; };
  }, [pageId, ready]);

  // The rooms' own replay (edits a closed tab queued for them) can land after
  // the first comparison: while copies are offered, they are compared again
  // for a minute, and one the window now shows is forgotten (never offered
  // twice for what came back by itself).
  const offeredCount = recovery?.copies.length ?? 0;
  useEffect(() => {
    if (!enabled || offeredCount === 0) return;
    let cancelled = false;
    void (async () => {
      for (let round = 0; round < 20 && !cancelled; round += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 3_000));
        if (cancelled) return;
        let current: Record<string, unknown> | null = null;
        try {
          current = await optionsRef.current.readCurrentContent();
        } catch {
          current = null;
        }
        if (!current || cancelled) continue;
        const shown = workbookContentFingerprint(current);
        setRecovery((state) => {
          if (!state) return state;
          const kept = state.copies.filter((copy) => {
            const same = !copy.payload.extra?.tiledEdits && workbookContentFingerprint(copy.payload.content) === shown;
            if (same) void deleteAutoRecoverCopy(pageId, copy.slot);
            return !same;
          });
          if (kept.length === state.copies.length) return state;
          return kept.length ? { ...state, copies: kept } : null;
        });
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, offeredCount, pageId]);

  // Everything confirmed by the server: the current copy is forgotten.
  const settled = autosave.saveStatus === "saved" && !autosave.isDirty && !autosave.hasConflict;
  useEffect(() => {
    if (!enabled || !recoveryChecked || !settled) return;
    if (tiledPending()) return;
    if (optionsRef.current.autosave.readSettledSave && !optionsRef.current.autosave.readSettledSave()) return;
    // "Saved" can also mean the view was replaced by the server's page while its
    // edits were still waiting (a generation another window's save replaced). Then
    // this copy is the only place they are: it is kept and offered, not forgotten.
    const typedSince = unsavedBaseRef.current;
    unsavedBaseRef.current = null;
    const typed = lastContentRef.current;
    if (typedSince && typed && typedCellsMissingFromPage(typedSince.content, typed, optionsRef.current.autosave.page?.content_json)) {
      clearCurrentAutoRecover(pageId);
      void setAsideAutoRecoverCopy(pageId, {
        payload: { content: typed, title: optionsRef.current.title },
        baseContentVersion: typedSince.version,
        reason: "unsaved",
      }).then(() => listAutoRecoverCopies(pageId)).then((copies) => {
        if (copies.length) setRecovery({ copies, autoOpen: true, nonce: Date.now() });
      }).catch(() => undefined);
      return;
    }
    clearCurrentAutoRecover(pageId);
  }, [enabled, pageId, recoveryChecked, settled]);

  // ── tiled workbooks: unsent cell edits and refused flushes ─────────────
  const tiledInstance = options.tiled();
  useEffect(() => {
    if (!enabled || !tiledInstance) return;
    const update = () => {
      const detail = tiledInstance.saveFailureDetail;
      setTiledFailure((previous) =>
        previous?.attempt === detail?.attempt ? previous : detail);
      if (tiledInstance.hasPendingEdits) noteContent(null);
    };
    update();
    return tiledInstance.subscribe(update);
  }, [enabled, noteContent, tiledInstance]);

  // ── permission withdrawn: keep the refused edit as a copy ──────────────
  const keptSlotRef = useRef<string | null>(null);
  const onReadOnlyEditKept = useCallback((draft: PageDocumentDraft) => {
    if (!enabled || !draft.content_json || typeof draft.content_json !== "object") return;
    const content = draft.content_json as Record<string, unknown>;
    const title = typeof draft.title === "string" ? draft.title : optionsRef.current.title;
    const savedAt = Date.now();
    const kept: KeptCopy = { content, title, savedAt, reason: "permission-lost", slot: null };
    setKeptCopy(kept);
    const previousSlot = keptSlotRef.current;
    void setAsideAutoRecoverCopy(pageId, {
      payload: { content, title },
      baseContentVersion: optionsRef.current.autosave.page?.content_version ?? 0,
      reason: "permission-lost",
    }).then((slot) => {
      keptSlotRef.current = slot;
      if (previousSlot) void deleteAutoRecoverCopy(pageId, previousSlot);
      setKeptCopy((current) => (current === kept ? { ...kept, slot } : current));
    });
  }, [enabled, pageId]);

  // ── signed out: hold the tab, sign in beside it ─────────────────────────
  useEffect(() => {
    if (!enabled || !pageId) return;
    return registerUnsavedWorkHold(`spreadsheet:${pageId}`, holdsUnsaved);
  }, [enabled, holdsUnsaved, pageId]);
  useEffect(() => {
    if (!enabled) return;
    const onHeld = () => {
      if (!holdsUnsaved()) return;
      heldPrincipalRef.current = autoRecoverPrincipal();
      setSessionHeld(true);
      void flushAutoRecoverWrites();
    };
    const onRestored = () => setSessionHeld(false);
    window.addEventListener(AUTH_SESSION_HELD_EVENT, onHeld);
    window.addEventListener(AUTH_SESSION_RESTORED_EVENT, onRestored);
    if (isAuthSessionHeld()) onHeld();
    return () => {
      window.removeEventListener(AUTH_SESSION_HELD_EVENT, onHeld);
      window.removeEventListener(AUTH_SESSION_RESTORED_EVENT, onRestored);
    };
  }, [enabled, holdsUnsaved]);
  useEffect(() => {
    if (!sessionHeld) return;
    return watchSessionRestore(() => {
      setSessionHeld(false);
      const before = heldPrincipalRef.current;
      const now = autoRecoverPrincipal();
      if (before && now && before !== now) {
        setAccountChanged(true);
        return;
      }
      void optionsRef.current.autosave.retrySave().then(() => optionsRef.current.autosave.saveNow()).catch(() => null);
    });
  }, [sessionHeld]);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const signIn = useCallback(() => {
    setPopupBlocked(!openReauthWindow());
  }, []);

  // ── online / offline ───────────────────────────────────────────────────
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  // Back online with a failed save waiting: send it now (Office resumes the
  // upload when the connection returns).
  useEffect(() => {
    if (!online || !enabled) return;
    const view = optionsRef.current.autosave;
    if (optionsRef.current.tiled()?.saveFailure) void view.saveNow().catch(() => null);
    else if (view.saveStatus === "unsaved" && view.error && !view.hasConflict) void view.retrySave().catch(() => null);
  }, [enabled, online]);

  // ── the failure being shown ─────────────────────────────────────────────
  const failureStatus = autosave.getLastSaveFailureStatus?.() ?? null;
  const failureCode = autosave.getLastSaveFailureCode?.() ?? null;
  const saveFailure = useMemo(() => {
    if (!enabled || sessionHeld || accountChanged || keptCopy) return null;
    if (tiledFailure) {
      const described = describeSpreadsheetSaveFailure({ status: tiledFailure.status, code: tiledFailure.code, offline: !online });
      return { ...described, tiled: true };
    }
    if (autosave.hasConflict || autosave.saveStatus === "saved" || !autosave.error) return null;
    return { ...describeSpreadsheetSaveFailure({ status: failureStatus, code: failureCode, offline: !online }), tiled: false };
  }, [accountChanged, autosave.error, autosave.hasConflict, autosave.saveStatus, enabled, failureCode, failureStatus,
    keptCopy, online, sessionHeld, tiledFailure]);
  // The save status says why saving stopped, in the window's own words (a
  // signed-out session's raw "Not authenticated" is not shown).
  const failureText = sessionHeld || accountChanged
    ? t("spreadsheet.saveResilience.signedOut.title")
    : keptCopy
      ? t("spreadsheet.saveResilience.permissionLost.title")
      : saveFailure
        ? saveFailure.key === "held"
          ? autosave.error ?? t("spreadsheet.saveResilience.failure.generic")
          : t(`spreadsheet.saveResilience.failure.${saveFailure.key}`)
        : null;
  /** The conflict notice's sentence for the code that latched it. */
  const conflictText = autosave.hasConflict && failureCode === "materializer_source_conflict"
    ? t("spreadsheet.saveResilience.failure.remoteChanged")
    : null;

  // Tiled flushes that failed for a passing reason are tried again.
  const tiledRetryRef = useRef({ count: 0, timer: null as number | null });
  useEffect(() => {
    const state = tiledRetryRef.current;
    if (state.timer !== null) {
      window.clearTimeout(state.timer);
      state.timer = null;
    }
    if (!tiledFailure) {
      state.count = 0;
      return;
    }
    if (!describeSpreadsheetSaveFailure({ status: tiledFailure.status, code: tiledFailure.code }).transient) return;
    const delays = [2_000, 5_000, 15_000, 30_000, 60_000];
    const delay = delays[Math.min(state.count, delays.length - 1)];
    state.count += 1;
    state.timer = window.setTimeout(() => {
      state.timer = null;
      void optionsRef.current.autosave.saveNow().catch(() => null);
    }, delay);
    return () => {
      if (state.timer !== null) window.clearTimeout(state.timer);
      state.timer = null;
    };
  }, [tiledFailure]);

  // ── closing ────────────────────────────────────────────────────────────
  const sessionHeldRef = useRef(sessionHeld);
  sessionHeldRef.current = sessionHeld;
  useEffect(() => {
    if (!enabled) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!holdsUnsaved() && !sessionHeldRef.current) return;
      void flushAutoRecoverWrites();
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [enabled, holdsUnsaved]);
  const unsavedNow = autosave.saveStatus !== "saved" || autosave.isDirty || autosave.hasConflict;
  const closeActions = useMemo(() => (!enabled || !unsavedNow ? null : {
    save: async () => {
      try {
        const view = optionsRef.current.autosave;
        if (view.hasConflict) return false;
        await (view.error ? view.retrySave() : view.saveNow());
        return true;
      } catch {
        return false;
      }
    },
    // AutoSave model: nothing is thrown away; the recovery copy is kept and
    // offered on the next open.
    discard: () => { void flushAutoRecoverWrites(); },
    discardLabel: t("spreadsheet.saveResilience.close.keepCopy"),
    body: t("spreadsheet.saveResilience.close.body"),
  }), [enabled, t, unsavedNow]);
  useRegisterWindowSaveActions(windowId, closeActions);

  // ── actions ────────────────────────────────────────────────────────────
  const fileName = (title: string) => safeWorkbookFileName(title, t("pages.defaultSpreadsheetTitle"));
  const currentContentForCopy = useCallback(async (): Promise<Record<string, unknown> | null> => {
    try {
      const built = await optionsRef.current.readCurrentContent();
      if (built) return built;
    } catch {
      // read-only or still settling: the last edit the window queued
    }
    return lastContentRef.current ??
      (optionsRef.current.autosave.page?.content_json as Record<string, unknown> | undefined) ?? null;
  }, []);
  const downloadContent = useCallback(async (content: Record<string, unknown> | null, title: string) => {
    if (!content) {
      toast({ title: t("spreadsheet.saveResilience.downloadFailed"), variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const result = await downloadUnsavedWorkbookCopy({ pageId: pageId || null, content, fileName: fileName(title) });
      toast({
        title: result.kind === "xlsx"
          ? result.lossCount > 0
            ? t("spreadsheet.saveResilience.downloadLossCount", { count: result.lossCount })
            : t("spreadsheet.saveResilience.downloadStarted")
          : t("spreadsheet.saveResilience.downloadCsvFallback"),
      });
    } catch {
      toast({ title: t("spreadsheet.saveResilience.downloadFailed"), variant: "destructive" });
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fileName reads t only
  }, [pageId, t]);
  const downloadCopy = useCallback(async () => {
    await downloadContent(await currentContentForCopy(), optionsRef.current.title);
  }, [currentContentForCopy, downloadContent]);
  const saveContentAsCopy = useCallback(async (content: Record<string, unknown>, title: string): Promise<boolean> => {
    setBusy(true);
    try {
      const copyTitle = t("spreadsheet.saveResilience.copyTitle", { title: title || t("pages.defaultSpreadsheetTitle") });
      const result = await saveWorkbookCopyToNotebook({
        sourceNotebookId: optionsRef.current.autosave.page?.notebook_id,
        title: copyTitle,
        content,
        recoveredNotebookTitle: t("spreadsheet.saveResilience.recoveredNotebookTitle"),
      });
      toast({
        title: result.notebookTitle
          ? t("spreadsheet.saveResilience.copySavedIn", { title: result.page.title || copyTitle, notebook: result.notebookTitle })
          : t("spreadsheet.saveResilience.copySaved", { title: result.page.title || copyTitle }),
      });
      dispatchNotebookPagesChanged(result.page.notebook_id, result.page.id);
      return true;
    } catch {
      toast({ title: t("spreadsheet.saveResilience.copyFailed"), variant: "destructive" });
      return false;
    } finally {
      setBusy(false);
    }
  }, [t]);
  const retry = useCallback(() => {
    setTiledFailure(null);
    void optionsRef.current.autosave.retrySave().then(() => optionsRef.current.autosave.saveNow()).catch(() => null);
  }, []);

  // Conflict: Load remote sets the window's edits aside first (they stay in
  // Document Recovery); Keep both saves them as a copy.
  const discardForRemote = useCallback(async () => {
    const content = await currentContentForCopy();
    if (content) {
      await setAsideAutoRecoverCopy(pageId, {
        payload: { content, title: optionsRef.current.title },
        baseContentVersion: optionsRef.current.autosave.page?.content_version ?? 0,
        reason: "discarded-for-remote",
      });
    }
    clearCurrentAutoRecover(pageId);
    await optionsRef.current.autosave.discardLocalAndReload();
  }, [currentContentForCopy, pageId]);

  return {
    /** Call with every draft the window queues or saves. */
    noteDraft,
    /** Pass to useAutosavedPageDocument's `onReadOnlyEditKept`. */
    onReadOnlyEditKept,
    /** The refused save's reason, for the save status. */
    failureText,
    conflictText,
    state: {
      recovery, setRecovery, keptCopy, setKeptCopy, keptSlotRef, sessionHeld, accountChanged, popupBlocked,
      saveFailure, failureText, busy, catchingUp: autosave.workbookCatchingUp === true,
    },
    actions: { downloadCopy, downloadContent, saveContentAsCopy, retry, signIn, discardForRemote, currentContent: currentContentForCopy },
  };
}

export type SpreadsheetSaveResilience = ReturnType<typeof useSpreadsheetSaveResilience>;

function reasonKey(reason: AutoRecoverReason): string {
  switch (reason) {
    case "permission-lost": return "reasonPermissionLost";
    case "signed-out": return "reasonSignedOut";
    case "discarded-for-remote": return "reasonDiscarded";
    case "kept-server-version": return "reasonKeptServer";
    case "not-applied": return "reasonNotApplied";
    default: return "reasonUnsaved";
  }
}

function Action({ onClick, disabled, children, testId }: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <button type="button" className={noticeStyles.action} onClick={onClick} disabled={disabled} data-testid={testId}>
      {children}
    </button>
  );
}

/** The notices of the adapter, rendered by the spreadsheet window. */
export function SpreadsheetSaveResilienceNotices({
  resilience,
  pageId,
  title,
  readOnly,
  serverVersion,
  applyRecoveredContent,
  t,
}: {
  resilience: SpreadsheetSaveResilience;
  pageId: string;
  title: string;
  readOnly: boolean;
  serverVersion: number;
  applyRecoveredContent: (content: Record<string, unknown>, extra: Record<string, unknown> | undefined) => void;
  t: Translate;
}) {
  const { state, actions } = resilience;
  const [confirm, setConfirm] = useState<null | {
    title: string;
    body: string;
    confirmLabel: string;
    destructive?: boolean;
    run: () => void | Promise<void>;
  }>(null);
  const timeFormat = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(pageInterfaceLocale(), { dateStyle: "medium", timeStyle: "short" });
    } catch {
      return null;
    }
  }, []);
  const k = (key: string, values?: Record<string, string | number>) => t(`spreadsheet.saveResilience.${key}`, values);
  const removeCopy = (copy: AutoRecoverCopy) => {
    void deleteAutoRecoverCopy(pageId, copy.slot);
    state.setRecovery((current) => {
      if (!current) return current;
      const copies = current.copies.filter((entry) => entry.slot !== copy.slot);
      return copies.length ? { ...current, copies } : null;
    });
  };
  // Kept on a page saved since by someone else: the copy's own cells go onto it.
  const keepMerges = (copy: AutoRecoverCopy) =>
    copy.baseContentVersion > 0 && serverVersion > copy.baseContentVersion &&
    isWorkbookClosingEdits(copy.payload.extra?.cellEdits) && !copy.payload.extra?.tiledEdits;
  const keepCopy = async (copy: AutoRecoverCopy) => {
    const { cellEdits, ...extra } = copy.payload.extra ?? {};
    if (keepMerges(copy) && isWorkbookClosingEdits(cellEdits)) {
      const merged = applyWorkbookEdits(await actions.currentContent(), cellEdits);
      if (merged) {
        applyRecoveredContent(merged, Object.keys(extra).length ? extra : undefined);
        removeCopy(copy);
        toastApplied();
        return;
      }
    }
    applyRecoveredContent(copy.payload.content, copy.payload.extra);
    removeCopy(copy);
    toastApplied();
  };
  const toastApplied = () => toast({ title: k("recovery.applied") });

  const notices: ReactNode[] = [];

  if (state.keptCopy) {
    const kept = state.keptCopy;
    notices.push(
      <WindowNotice
        key="kept"
        scopeKey={`${pageId}:kept:${kept.savedAt}`}
        title={k("permissionLost.title")}
        label={k("permissionLost.label")}
        description={k("permissionLost.body")}
        testId="spreadsheet-permission-lost-notice"
      >
        <div role="alert" data-testid="spreadsheet-permission-lost">
          <div className={styles.actions}>
            <Action disabled={state.busy} onClick={() => void actions.downloadContent(kept.content, kept.title)}
              testId="spreadsheet-kept-copy-download">{k("downloadCopy")}</Action>
            <Action disabled={state.busy} testId="spreadsheet-kept-copy-save"
              onClick={() => void actions.saveContentAsCopy(kept.content, kept.title).then((saved) => {
                if (!saved) return;
                if (kept.slot) void deleteAutoRecoverCopy(pageId, kept.slot);
                state.setKeptCopy(null);
              })}>{k("saveCopyToNotebook")}</Action>
            <Action disabled={state.busy} testId="spreadsheet-kept-copy-discard" onClick={() => setConfirm({
              title: k("permissionLost.discardConfirmTitle"),
              body: k("permissionLost.discardConfirmBody"),
              confirmLabel: k("permissionLost.discard"),
              destructive: true,
              run: () => {
                if (kept.slot) void deleteAutoRecoverCopy(pageId, kept.slot);
                state.setKeptCopy(null);
              },
            })}>{k("permissionLost.discard")}</Action>
          </div>
        </div>
      </WindowNotice>,
    );
  }

  if (state.sessionHeld || state.accountChanged) {
    notices.push(
      <WindowNotice
        key="signed-out"
        scopeKey={`${pageId}:signed-out:${state.accountChanged ? "account" : "held"}`}
        title={k("signedOut.title")}
        label={k("signedOut.label")}
        description={state.accountChanged ? k("signedOut.accountChanged") : k("signedOut.body")}
        testId="spreadsheet-signed-out-notice"
      >
        <div role="alert" data-testid="spreadsheet-signed-out">
          {state.popupBlocked ? (
            <p>
              {k("signedOut.popupBlocked")}{" "}
              <a href={reauthLoginUrl()} target="_blank" rel="noopener" data-testid="spreadsheet-sign-in-link">
                {k("signedOut.openSignIn")}
              </a>
            </p>
          ) : null}
          <div className={styles.actions}>
            {state.accountChanged ? (
              <Action onClick={() => reloadPage("spreadsheet_signed_out")} testId="spreadsheet-account-reload">{k("signedOut.reload")}</Action>
            ) : (
              <Action onClick={actions.signIn} testId="spreadsheet-sign-in">{k("signIn")}</Action>
            )}
            <Action disabled={state.busy} onClick={() => void actions.downloadCopy()}
              testId="spreadsheet-signed-out-download">{k("downloadCopy")}</Action>
          </div>
        </div>
      </WindowNotice>,
    );
  }

  if (state.catchingUp) {
    notices.push(
      <WindowNotice
        key="catching-up"
        scopeKey={`${pageId}:catching-up`}
        title={k("catchingUp.title")}
        label={k("catchingUp.label")}
        description={t("pages.workbookSyncingLatest")}
        autoOpen={false}
        testId="spreadsheet-catching-up-notice"
      >
        <p role="status" data-testid="spreadsheet-catching-up">{t("pages.workbookSyncingLatest")}</p>
      </WindowNotice>,
    );
  }

  if (state.saveFailure && state.failureText) {
    notices.push(
      <WindowNotice
        key="failure"
        scopeKey={`${pageId}:failure:${state.saveFailure.key}`}
        title={k("failure.title")}
        label={k("failure.label")}
        description={`${state.failureText} ${k("failure.kept")}`}
        autoOpen={false}
        testId="spreadsheet-save-failure-notice"
      >
        <div role="alert" data-testid="spreadsheet-save-failure" data-failure={state.saveFailure.key}>
          {state.saveFailure.tiled ? <p>{k("failure.tiled")}</p> : null}
          <div className={styles.actions}>
            <Action disabled={state.busy} onClick={actions.retry} testId="spreadsheet-save-failure-retry">{k("retry")}</Action>
            <Action disabled={state.busy} onClick={() => void actions.downloadCopy()}
              testId="spreadsheet-save-failure-download">{k("downloadCopy")}</Action>
          </div>
        </div>
      </WindowNotice>,
    );
  }

  if (state.recovery) {
    const recovery = state.recovery;
    notices.push(
      <WindowNotice
        key="recovery"
        scopeKey={`${pageId}:recovery:${recovery.nonce}`}
        title={k("recovery.title")}
        label={k("recovery.label", { count: recovery.copies.length })}
        description={readOnly ? k("recovery.readOnlyHint") : k("recovery.body")}
        autoOpen={recovery.autoOpen}
        testId="spreadsheet-recovery-notice"
      >
        <div data-testid="spreadsheet-recovery">
          <ul className={noticeStyles.list}>
            {recovery.copies.map((copy) => {
              const when = timeFormat ? timeFormat.format(new Date(copy.savedAt)) : new Date(copy.savedAt).toLocaleString(pageInterfaceLocale());
              const moved = copy.baseContentVersion > 0 && serverVersion > copy.baseContentVersion;
              const copyTitle = copy.payload.title || title;
              return (
                <li key={copy.slot} className={noticeStyles.issue} data-testid="spreadsheet-recovery-copy" data-slot={copy.slot}>
                  <h3>{k(`recovery.${reasonKey(copy.reason)}`)} - {when}</h3>
                  {moved ? <p>{k("recovery.versionNote", { base: copy.baseContentVersion, server: serverVersion })}</p> : null}
                  <div className={styles.actions}>
                    {!readOnly ? (
                      <Action disabled={state.busy} testId="spreadsheet-recovery-keep" onClick={() => {
                        if (!moved || keepMerges(copy)) {
                          void keepCopy(copy);
                          return;
                        }
                        setConfirm({
                          title: k("recovery.keepConfirmTitle"),
                          body: k("recovery.keepConfirmBody", { base: copy.baseContentVersion, server: serverVersion }),
                          confirmLabel: k("recovery.keep"),
                          destructive: true,
                          run: () => keepCopy(copy),
                        });
                      }}>{k("recovery.keep")}</Action>
                    ) : null}
                    <Action disabled={state.busy} testId="spreadsheet-recovery-save-copy"
                      onClick={() => void actions.saveContentAsCopy(copy.payload.content, copyTitle).then((saved) => {
                        if (saved) removeCopy(copy);
                      })}>{k("recovery.saveCopy")}</Action>
                    <Action disabled={state.busy} testId="spreadsheet-recovery-download"
                      onClick={() => void actions.downloadContent(copy.payload.content, copyTitle)}>{k("recovery.download")}</Action>
                    <Action disabled={state.busy} testId="spreadsheet-recovery-delete" onClick={() => setConfirm({
                      title: k("recovery.deleteConfirmTitle"),
                      body: k("recovery.deleteConfirmBody"),
                      confirmLabel: k("recovery.delete"),
                      destructive: true,
                      run: () => removeCopy(copy),
                    })}>{k("recovery.delete")}</Action>
                  </div>
                </li>
              );
            })}
          </ul>
          <small>{k("recovery.keepSavedHint")}</small>
        </div>
      </WindowNotice>,
    );
  }

  return (
    <>
      {notices}
      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title ?? ""}
        body={confirm?.body}
        confirmLabel={confirm?.confirmLabel}
        confirmVariant={confirm?.destructive ? "destructive" : "default"}
        autoFocusConfirm={false}
        onConfirm={() => {
          const run = confirm?.run;
          setConfirm(null);
          void run?.();
        }}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}

const REPAIRS_SHOWN_PREFIX = "mrai:import-repairs-shown:";

/**
 * The first time a workbook the import had to repair is opened, its repair
 * report is shown (the open-and-repair dialog: what was repaired or removed so
 * the file could open). Closed once per report on this browser; the same
 * lines stay in the import status afterwards.
 */
export function SpreadsheetImportRepairDialog({
  pageId,
  name,
  content,
  t,
}: {
  pageId: string;
  name: string;
  content: unknown;
  t: Translate;
}) {
  const repairs = useMemo(() => readImportRepairs(
    content && typeof content === "object" ? (content as Record<string, unknown>)["importRepairs"] : null,
  ), [content]);
  const fingerprint = repairs.length ? importRepairsFingerprint(repairs) : null;
  const [closed, setClosed] = useState<string | null>(null);
  const seen = useMemo(() => {
    if (!fingerprint || !pageId) return true;
    try {
      return window.localStorage.getItem(`${REPAIRS_SHOWN_PREFIX}${pageId}`) === fingerprint;
    } catch {
      return false;
    }
  }, [fingerprint, pageId]);
  const open = Boolean(fingerprint) && !seen && closed !== fingerprint;
  const close = () => {
    setClosed(fingerprint);
    try {
      if (fingerprint) window.localStorage.setItem(`${REPAIRS_SHOWN_PREFIX}${pageId}`, fingerprint);
    } catch {
      // shown again next time
    }
  };
  return (
    <ConfirmDialog
      open={open}
      acknowledgeOnly
      title={t("spreadsheet.importRepair.title", { name })}
      confirmLabel={t("spreadsheet.importRepair.close")}
      controlId="spreadsheet-import-repairs"
      body={
        <>
          <p style={{ marginBottom: 8 }}>{t("spreadsheet.importRepair.body")}</p>
          <ul data-testid="spreadsheet-import-repairs" style={{ margin: 0, paddingInlineStart: 20, maxHeight: 240, overflow: "auto" }}>
            {repairs.map((repair, index) => (
              <li key={index} data-repair-action={repair.action}>
                {importRepairLine(repair, t(`importStatus.repairAction.${repair.action}`))}
              </li>
            ))}
          </ul>
        </>
      }
      onConfirm={close}
      onCancel={close}
    />
  );
}
