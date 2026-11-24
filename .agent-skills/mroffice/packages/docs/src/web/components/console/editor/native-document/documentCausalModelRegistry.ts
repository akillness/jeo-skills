/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { PageItem } from "@mrnote/core/web/lib/notebook-sdk.ts";
import type { PageContentDocument } from "@mrnote/core/web/hooks/usePageContentSync.ts";
import { createCollabSession, type CollabSession } from "@mrnote/core/web/lib/collab/collab-provider.ts";
import { createDocumentPageCausalAdapter } from "@mrnote/core/web/lib/collab/document-page-causal-adapter.ts";
import type { PageDocumentCollaborationAdapter } from "@/lib/collab/page-document-adapter";

export interface DocumentCausalViewAuthority {
  canWrite(): boolean;
  hasUnboundDraft(): boolean;
  /** NativePageCausalHost.setAsideUnboundDraft, for this view. */
  setAsideUnboundDraft?(base: PageContentDocument | null): boolean;
  /** Retire this view's old network provider without destroying its held Y.Doc. */
  retireLegacyAdmission(): void;
  /** The view's paged bridge applies what the room delivers (no issue): a
   * save made through the live room then needs no page read (absent: yes). */
  roomContentApplied?(): boolean;
  /** The live view's own projection says what the room says (the explicit
   * Save's preparation, which also writes the view's verified maintenance
   * into the room). Absent: unproven. */
  viewMirrorsRoom?(): boolean;
  /** Why the last viewMirrorsRoom() said no, as a content-free code. */
  viewMirrorRefusal?(): string | null;
}

export interface DocumentCausalModelSnapshot {
  session: CollabSession;
  epoch: number | null;
  active: boolean;
  ready: boolean;
  /** Why the model failed (content-free), while it has; null otherwise. */
  failure: string | null;
  savedPage: PageItem | null;
  mayWrite: boolean;
  revision: number;
}

export interface DocumentCausalModelLease {
  adapter: PageDocumentCollaborationAdapter;
  getSnapshot(): DocumentCausalModelSnapshot;
  subscribe(listener: () => void): () => void;
  refreshAuthority(): void;
  release(): void;
}

/** Acquire only from a committed effect/subscription, never during render.
 * The inactive local model does not replace an existing legacy editor room.
 * Only the server's epoch >= 2 canonical original activates that switch. */
export function createDocumentCausalModelRegistry() {
  type Engine = ReturnType<typeof createDocumentPageCausalAdapter>;
  interface Entry {
    pageId: string;
    session: CollabSession;
    sessions: Set<CollabSession>;
    epoch: number | null;
    nativeBinding: boolean;
    revision: number;
    holders: Map<string, DocumentCausalViewAuthority>;
    listeners: Set<() => void>;
    engine: Engine;
    snapshot: DocumentCausalModelSnapshot;
  }
  const entries = new Map<string, Entry>();
  let sequence = 0;
  function publish(entry: Entry) {
    entry.snapshot = {
      session: entry.session, epoch: entry.epoch, active: entry.engine.active(),
      ready: entry.engine.ready(), failure: entry.engine.failure(), savedPage: entry.engine.savedPage(), mayWrite: entry.engine.mayWrite(), revision: ++entry.revision,
    };
    for (const listener of entry.listeners) listener();
  }
  function createEntry(pageId: string): Entry {
    // No network admission until an actual REST checkpoint is negotiated.
    const session = createCollabSession({docId: pageId, roomName: null});
    const entry = {
      pageId, session, sessions: new Set([session]), epoch: null, nativeBinding: false,
      revision: 0, holders: new Map(), listeners: new Set(),
    } as unknown as Entry;
    entry.engine = createDocumentPageCausalAdapter({
      pageId, session: () => entry.session,
      canWrite: () => [...entry.holders.values()].some(holder => holder.canWrite()),
      hasUnboundDraft: () => [...entry.holders.values()].some(holder => holder.hasUnboundDraft()),
      setAsideUnboundDraft: (base) => [...entry.holders.values()]
        .filter(holder => holder.hasUnboundDraft())
        .every(holder => holder.setAsideUnboundDraft?.(base) === true),
      requiresNativeBinding: () => !entry.nativeBinding,
      rebind(epoch, joinLegacyRoom = false) {
        if (joinLegacyRoom || (epoch !== null && (!Number.isSafeInteger(epoch) || epoch < 2))) {
          throw Error("Docs requires a server-negotiated canonical epoch");
        }
        // Retire only transport admission. Old views can finish cleanup using
        // their old Y.Doc; never replay its structs into the new original.
        for (const holder of entry.holders.values()) holder.retireLegacyAdmission();
        entry.session.provider?.destroy();
        entry.session = createCollabSession({docId: pageId, pageJsonCausalModel: true,
          ...(epoch === null ? {roomName: null} : {pageJsonCausalEpoch: epoch})});
        entry.sessions.add(entry.session);
        entry.epoch = epoch;
        entry.nativeBinding = epoch !== null;
        publish(entry);
      },
      deliver() {
        // The bridge observes XML directly. Do not setContent or seed JSON.
        publish(entry);
      },
      changed: () => publish(entry),
      roomContentApplied: (lease) => entry.holders.get(lease)?.roomContentApplied?.() ?? true,
      viewMirrorsRoom: () => entry.holders.size > 0 &&
        [...entry.holders.values()].every(holder => holder.viewMirrorsRoom?.() === true),
      viewMirrorRefusal: () => entry.holders.size === 0 ? "no_view"
        : [...entry.holders.values()].map(holder => holder.viewMirrorRefusal?.() ?? null).find(Boolean) ?? null,
    });
    publish(entry);
    return entry;
  }
  return {
    acquire(pageId: string, principalScope: string, authority: DocumentCausalViewAuthority): DocumentCausalModelLease {
      if (!pageId || !principalScope) throw Error("Missing document model identity");
      const key = JSON.stringify([principalScope, pageId]);
      let entry = entries.get(key);
      if (!entry) {
        entry = createEntry(pageId);
        entries.set(key, entry);
      }
      const current = entry;
      const token = `docs-native-view-${++sequence}`;
      current.holders.set(token, authority);
      const adapter = current.engine.forLease(token);
      let released = false;
      const localListeners = new Set<() => void>();
      return {
        adapter,
        getSnapshot: () => current.snapshot,
        subscribe(listener) {
          if (released) return () => {};
          current.listeners.add(listener);
          localListeners.add(listener);
          return () => {current.listeners.delete(listener);localListeners.delete(listener);};
        },
        refreshAuthority() {
          if (released) return;
          current.engine.retryPreparation();
          publish(current);
        },
        release() {
          if (released) return;
          released = true;
          for (const listener of localListeners) current.listeners.delete(listener);
          localListeners.clear();
          current.engine.release(token);
          current.holders.delete(token);
          if (current.holders.size > 0) {publish(current);return;}
          current.engine.dispose();
          for (const session of current.sessions) session.destroy();
          entries.delete(key);
        },
      };
    },
  };
}

export const documentCausalModelRegistry = createDocumentCausalModelRegistry();
