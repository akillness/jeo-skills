"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * In-memory cache for the WikiLink suggestion popup's page list fetch.
 *
 * Without this cache, every `[[` keystroke fires
 * `notebookSDK.listPages(notebookId)` — for a notebook with 10K pages
 * that's a 10K-row payload on every popup. Heavy users tap `[[` dozens
 * of times per session.
 *
 * Behavior:
 *   * Keyed by notebookId
 *   * 30-second default TTL
 *   * Coalesces concurrent in-flight fetches for the same key (so two
 *     simultaneously-opened popups only hit the network once)
 *   * Auto-invalidates on `mrnote:notebook-pages-changed` when
 *     `autoInvalidateOnPageChanges: true` — cuts staleness when the
 *     user creates a page in a different tab. The detail's notebookId
 *     scopes the invalidation; an unrelated change leaves the cache
 *     intact.
 *
 * The cache instance is owned by the registry that builds the editor
 * (`createNativeDocumentPluginRegistry`). It is module-scoped so a
 * navigating user keeps a warm cache across page switches; the editor
 * tear-down does not need to dispose it.
 */

import { NOTEBOOK_PAGES_CHANGED_EVENT } from "../../../lib/notebook-events";

export interface WikiLinkPageListEntry {
  id: string;
  title: string;
}

export type FetchPagesFn = (notebookId: string) => Promise<WikiLinkPageListEntry[]>;

interface CacheSlot {
  expiresAt: number;
  data: WikiLinkPageListEntry[];
}

export interface CreatePageListCacheOptions {
  fetchPages: FetchPagesFn;
  ttlMs?: number;
  autoInvalidateOnPageChanges?: boolean;
}

export interface PageListCache {
  get: (notebookId: string) => Promise<WikiLinkPageListEntry[]>;
  invalidate: (notebookId: string) => void;
  dispose: () => void;
}

const DEFAULT_TTL_MS = 30_000;

export function createPageListCache(
  options: CreatePageListCacheOptions,
): PageListCache {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const slots = new Map<string, CacheSlot>();
  const inflight = new Map<string, Promise<WikiLinkPageListEntry[]>>();

  function invalidate(notebookId: string): void {
    slots.delete(notebookId);
    inflight.delete(notebookId);
  }

  async function get(notebookId: string): Promise<WikiLinkPageListEntry[]> {
    const now = Date.now();
    const slot = slots.get(notebookId);
    if (slot && slot.expiresAt > now) {
      return slot.data;
    }
    const existing = inflight.get(notebookId);
    if (existing) return existing;
    const promise = (async () => {
      try {
        const data = await options.fetchPages(notebookId);
        slots.set(notebookId, { data, expiresAt: Date.now() + ttlMs });
        return data;
      } finally {
        inflight.delete(notebookId);
      }
    })();
    inflight.set(notebookId, promise);
    return promise;
  }

  let pageChangeHandler: ((event: Event) => void) | null = null;
  if (options.autoInvalidateOnPageChanges && typeof window !== "undefined") {
    pageChangeHandler = (event: Event) => {
      const detail = (event as CustomEvent<{ notebookId?: string }>).detail;
      const notebookId = detail?.notebookId;
      if (notebookId) {
        invalidate(notebookId);
      } else {
        // No id → conservative full purge.
        slots.clear();
        inflight.clear();
      }
    };
    window.addEventListener(NOTEBOOK_PAGES_CHANGED_EVENT, pageChangeHandler);
  }

  function dispose(): void {
    if (pageChangeHandler && typeof window !== "undefined") {
      window.removeEventListener(NOTEBOOK_PAGES_CHANGED_EVENT, pageChangeHandler);
      pageChangeHandler = null;
    }
    slots.clear();
    inflight.clear();
  }

  return { get, invalidate, dispose };
}

// ---------------------------------------------------------------------------
// Module-level shared cache for the editor's WikiLink popup.
// ---------------------------------------------------------------------------

let SHARED_CACHE: PageListCache | null = null;

export function getSharedWikiLinkPageListCache(
  fetchPages: FetchPagesFn,
): PageListCache {
  if (SHARED_CACHE) return SHARED_CACHE;
  SHARED_CACHE = createPageListCache({
    fetchPages,
    ttlMs: DEFAULT_TTL_MS,
    autoInvalidateOnPageChanges: true,
  });
  return SHARED_CACHE;
}

/**
 * Drop the singleton — used only by tests so each test file starts
 * with a clean cache + listener pair.
 */
export function __resetPageListCacheForTests(): void {
  SHARED_CACHE?.dispose();
  SHARED_CACHE = null;
}
