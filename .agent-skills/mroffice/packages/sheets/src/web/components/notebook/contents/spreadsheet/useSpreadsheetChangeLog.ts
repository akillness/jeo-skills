"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  useCallback,
  useEffect,
  useInsertionEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  buildChangeRecords,
  changeRangeLabel,
  mergeChangeEntries,
  parseChangeRangeFilter,
  type SpreadsheetChangeEntry,
  type SpreadsheetChangeFilter,
  type SpreadsheetChangeRecord,
  type SpreadsheetStructuralStep,
} from "@mrnote/core/web/lib/spreadsheet/change-log.ts";
import {
  listSpreadsheetChanges,
  recordSpreadsheetChanges,
} from "@mrnote/core/web/lib/spreadsheet-changes-sdk.ts";

import type { SpreadsheetChangesScope } from "./SpreadsheetChangesPane";

type RangeFilter = Extract<SpreadsheetChangeFilter, { scope: "range" }>;

interface SheetLike {
  id: string;
  name: string;
  chartSheet?: unknown;
  cells: Record<string, { value?: unknown; formula?: unknown } | undefined>;
}

export interface SpreadsheetChangeCommit {
  before: readonly SheetLike[];
  after: readonly SheetLike[];
  kind: "edit" | "undo" | "redo";
  structural?: SpreadsheetStructuralStep | null;
  knownKeys?: ReadonlyMap<string, readonly string[]>;
}

interface ServerList {
  key: string;
  status: "loading" | "ready" | "error";
  items: SpreadsheetChangeEntry[];
  nextCursor: string | null;
  retentionDays: number;
  loadingMore: boolean;
}

/** This session's edits kept in memory for the pane (newest first). */
const SESSION_ENTRY_LIMIT = 500;
/** Unsent records kept while the server is unreachable. */
const QUEUE_LIMIT = 500;
const UPLOAD_BATCH = 20;
const RETRY_DELAY_MS = 5_000;
const MAX_RETRIES = 6;
/** A peer uploads its change after its save lands; look again a beat later. */
const REMOTE_REFRESH_DELAY_MS = 2_500;
const POLL_INTERVAL_MS = 30_000;
/** After a commit's records are queued, when the save it belongs to has had time to say so. */
const UPLOAD_AFTER_COMMIT_MS = 300;

function mergeById(
  head: readonly SpreadsheetChangeEntry[],
  rest: readonly SpreadsheetChangeEntry[],
): SpreadsheetChangeEntry[] {
  const seen = new Set<string>();
  const merged: SpreadsheetChangeEntry[] = [];
  for (const entry of [...head, ...rest]) {
    if (seen.has(entry.clientChangeId)) continue;
    seen.add(entry.clientChangeId);
    merged.push(entry);
  }
  return merged;
}

/**
 * Review > Show Changes for one workbook page: records each committed cell
 * edit, uploads it once the save it belongs to has landed, and keeps the
 * Changes pane's list (server history narrowed by the filter, plus this
 * session's edits) fresh while the pane is open.
 */
export function useSpreadsheetChangeLog(input: {
  pageId: string | null | undefined;
  /** A saved workbook page that has a server change log. */
  available: boolean;
  /** The member may edit: their commits are recorded. */
  recordable: boolean;
  saveStatus: string;
  actor: { id: string; name: string };
  activeSheetId: string;
  sheets: ReadonlyArray<{ id: string; name: string }>;
}) {
  const { pageId, available, recordable, saveStatus, actor, activeSheetId, sheets } = input;
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<SpreadsheetChangesScope>("workbook");
  const [rangeText, setRangeText] = useState("");
  const [range, setRange] = useState<RangeFilter | null>(null);
  const [rangeInvalid, setRangeInvalid] = useState(false);
  const [server, setServer] = useState<ServerList>({
    key: "",
    status: "loading",
    items: [],
    nextCursor: null,
    retentionDays: 365,
    loadingMore: false,
  });
  // Keyed by page: another workbook's edits never show in this one's pane.
  // Outside React while the pane is closed: each entry and each upload rendered
  // the whole window for a list nothing was showing.
  const sessionRef = useRef<{
    pageId: string | null | undefined;
    entries: SpreadsheetChangeEntry[];
  }>({ pageId, entries: [] });
  const [sessionRevision, setSessionRevision] = useState(0);
  const [refreshTick, setRefreshTick] = useState(0);
  const queueRef = useRef<SpreadsheetChangeRecord[]>([]);
  const flushingRef = useRef(false);
  const retriesRef = useRef(0);
  const remoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const live = useRef({ pageId, available, recordable: available && recordable, actor, open, saveStatus });
  useInsertionEffect(() => {
    live.current = { pageId, available, recordable: available && recordable, actor, open, saveStatus };
  });
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const updateSession = useCallback((
    update: (current: { pageId: string | null | undefined; entries: SpreadsheetChangeEntry[] }) => { pageId: string | null | undefined; entries: SpreadsheetChangeEntry[] },
  ) => {
    const next = update(sessionRef.current);
    if (next === sessionRef.current) return;
    sessionRef.current = next;
    if (live.current.open) setSessionRevision((revision) => revision + 1);
  }, []);

  // A different workbook starts its own upload queue.
  useEffect(() => {
    queueRef.current = [];
    retriesRef.current = 0;
  }, [pageId]);

  useEffect(
    () => () => {
      if (remoteTimerRef.current !== null) clearTimeout(remoteTimerRef.current);
    },
    [],
  );

  // Upload once the workbook is saved, so the log never lists an edit the
  // server refused to save.
  const upload = useCallback(() => {
    const { pageId, available, saveStatus } = live.current;
    if (!mountedRef.current || !pageId || !available || saveStatus !== "saved") return;
    if (flushingRef.current || queueRef.current.length === 0) return;
    const batch = queueRef.current.slice(0, UPLOAD_BATCH);
    const batchIds = new Set(batch.map((change) => change.clientChangeId));
    const settle = (stored: readonly SpreadsheetChangeEntry[]) => {
      queueRef.current = queueRef.current.filter(
        (change) => !batchIds.has(change.clientChangeId),
      );
      const byId = new Map(stored.map((entry) => [entry.clientChangeId, entry]));
      updateSession((current) =>
        current.pageId !== pageId
          ? current
          : {
              pageId,
              entries: current.entries.map(
                (entry) =>
                  byId.get(entry.clientChangeId) ??
                  (batchIds.has(entry.clientChangeId) ? { ...entry, pending: false } : entry),
              ),
            },
      );
    };
    flushingRef.current = true;
    let next = false;
    void recordSpreadsheetChanges(pageId, batch)
      .then(
        (stored) => {
          retriesRef.current = 0;
          settle(stored);
          next = true;
        },
        (error: unknown) => {
          // Offline or a busy server: try again. A refusal (no edit access,
          // not a workbook) or an unreadable answer will not change on retry.
          // Read the status structurally (ApiRequestError carries it) so the
          // upload never depends on the error class's identity.
          const status =
            error !== null &&
            typeof error === "object" &&
            typeof (error as { status?: unknown }).status === "number"
              ? (error as { status: number }).status
              : null;
          const transient =
            status !== null
              ? status === 0 || status === 408 || status === 429 || status >= 500
              : error instanceof TypeError;
          if (!transient || retriesRef.current >= MAX_RETRIES) {
            // Refused for good: the edits stay listed for this session only.
            retriesRef.current = 0;
            settle([]);
            next = true;
            return;
          }
          retriesRef.current += 1;
          setTimeout(() => uploadRef.current(), RETRY_DELAY_MS);
        },
      )
      .finally(() => {
        flushingRef.current = false;
        if (next) uploadRef.current();
      });
  }, [updateSession]);
  const uploadRef = useRef(upload);
  uploadRef.current = upload;

  /** One committed edit; the diff runs after the commit's frame. */
  const record = useCallback((commit: SpreadsheetChangeCommit) => {
    const snapshot = live.current;
    if (!snapshot.recordable || !snapshot.pageId) return;
    const at = Date.now();
    const committedOn = snapshot.pageId;
    const author = snapshot.actor;
    setTimeout(() => {
      if (live.current.pageId !== committedOn) return;
      const records = buildChangeRecords(commit);
      if (records.length === 0) return;
      queueRef.current.push(...records);
      if (queueRef.current.length > QUEUE_LIMIT) {
        queueRef.current.splice(0, queueRef.current.length - QUEUE_LIMIT);
      }
      const pending = records
        .map<SpreadsheetChangeEntry>((change, index) => ({
          ...change,
          id: change.clientChangeId,
          // Keeps one commit's sheets in order under the same millisecond.
          createdAt: at + index / 1000,
          actor: { userId: author.id || null, name: author.name || null },
          pending: true,
        }))
        .reverse();
      updateSession((current) => ({
        pageId: committedOn,
        entries: [...pending, ...(current.pageId === committedOn ? current.entries : [])].slice(
          0,
          SESSION_ENTRY_LIMIT,
        ),
      }));
      setTimeout(() => uploadRef.current(), UPLOAD_AFTER_COMMIT_MS);
    }, 0);
  }, [updateSession]);

  useEffect(() => {
    upload();
  }, [available, pageId, saveStatus, upload]);

  const filter = useMemo<SpreadsheetChangeFilter>(() => {
    if (scope === "workbook") return { scope: "workbook" };
    if (scope === "range" && range) return range;
    return { scope: "sheet", sheetId: activeSheetId };
  }, [activeSheetId, range, scope]);
  const filterJson = JSON.stringify(filter);
  // The list the server holds for this page under this filter.
  const filterKey = `${pageId ?? ""}|${filterJson}`;

  useEffect(() => {
    if (!open || !pageId || !available) return;
    const controller = new AbortController();
    const key = filterKey;
    listSpreadsheetChanges(pageId, { filter: JSON.parse(filterJson) }, controller.signal).then(
      (page) => {
        if (controller.signal.aborted) return;
        setServer((current) => {
          const refreshing = current.key === key && current.items.length > 0;
          const items = refreshing ? mergeById(page.items, current.items) : page.items;
          return {
            key,
            status: "ready",
            items,
            // A refresh keeps the cursor of the pages already read below it.
            nextCursor:
              refreshing && current.items.length > page.items.length
                ? current.nextCursor
                : page.nextCursor,
            retentionDays: page.retentionDays,
            loadingMore: false,
          };
        });
      },
      () => {
        if (controller.signal.aborted) return;
        setServer((current) => ({ ...current, key, status: "error", loadingMore: false }));
      },
    );
    return () => controller.abort();
  }, [available, filterJson, filterKey, open, pageId, refreshTick]);

  // While the pane is open other members' edits arrive too.
  useEffect(() => {
    if (!open || !available) return;
    const timer = setInterval(() => setRefreshTick((tick) => tick + 1), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [available, open]);

  const notifyRemoteContent = useCallback(() => {
    if (!live.current.open) return;
    if (remoteTimerRef.current !== null) clearTimeout(remoteTimerRef.current);
    remoteTimerRef.current = setTimeout(() => {
      remoteTimerRef.current = null;
      setRefreshTick((tick) => tick + 1);
    }, REMOTE_REFRESH_DELAY_MS);
  }, []);

  const loadMore = useCallback(() => {
    const cursor = server.nextCursor;
    if (!pageId || !cursor || server.loadingMore) return;
    const key = server.key;
    const listFilter: SpreadsheetChangeFilter = JSON.parse(key.slice(key.indexOf("|") + 1));
    setServer((current) => ({ ...current, loadingMore: true }));
    listSpreadsheetChanges(pageId, { filter: listFilter, before: cursor }).then(
      (page) =>
        setServer((current) =>
          current.key !== key
            ? current
            : {
                ...current,
                items: mergeById(current.items, page.items),
                nextCursor: page.nextCursor,
                loadingMore: false,
              },
        ),
      () =>
        setServer((current) =>
          current.key !== key ? current : { ...current, status: "error", loadingMore: false },
        ),
    );
  }, [pageId, server.key, server.loadingMore, server.nextCursor]);

  const applyRange = useCallback(
    (text: string) => {
      const parsed = parseChangeRangeFilter(text, sheets, activeSheetId);
      setRangeInvalid(parsed === null);
      if (parsed) setRange(parsed);
    },
    [activeSheetId, sheets],
  );

  /**
   * Open the pane. The ribbon shows the whole workbook; a sheet tab's
   * Show Changes its sheet; a cell or range's Show Changes that selection.
   */
  const openPane = useCallback(
    (
      request:
        | { scope: "workbook" }
        | { scope: "sheet" }
        | { scope: "range"; r1: number; c1: number; r2: number; c2: number },
    ) => {
      if (request.scope === "range") {
        const area = {
          r1: Math.min(request.r1, request.r2),
          c1: Math.min(request.c1, request.c2),
          r2: Math.max(request.r1, request.r2),
          c2: Math.max(request.c1, request.c2),
        };
        setRange({ scope: "range", sheetId: activeSheetId, ...area });
        setRangeText(changeRangeLabel({ kind: "edit", ...area }));
        setRangeInvalid(false);
      }
      setScope(request.scope);
      setOpen(true);
    },
    [activeSheetId],
  );

  const changeScope = useCallback(
    (
      next: SpreadsheetChangesScope,
      selection: { r1: number; c1: number; r2: number; c2: number },
    ) => {
      if (next === "range" && !range) {
        openPane({ scope: "range", ...selection });
        return;
      }
      setScope(next);
    },
    [openPane, range],
  );

  const entries = useMemo(
    () =>
      open
        ? mergeChangeEntries(
            [
              server.key === filterKey ? server.items : [],
              sessionRef.current.pageId === pageId ? sessionRef.current.entries : [],
            ],
            filter,
          )
        : [],
    [filter, filterKey, open, pageId, server.items, server.key, sessionRevision],
  );

  return {
    open,
    openPane,
    closePane: useCallback(() => setOpen(false), []),
    record,
    notifyRemoteContent,
    pane: {
      entries,
      status: server.key === filterKey ? server.status : ("loading" as const),
      hasMore: server.key === filterKey && server.nextCursor !== null,
      loadingMore: server.key === filterKey && server.loadingMore,
      retentionDays: server.retentionDays,
      scope,
      rangeText,
      rangeInvalid,
      changeScope,
      setRangeText,
      applyRange,
      loadMore,
    },
  };
}
