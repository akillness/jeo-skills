"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import {
  documentCausalModelRegistry,
  type DocumentCausalModelLease,
  type DocumentCausalModelSnapshot,
  type DocumentCausalViewAuthority,
} from "./documentCausalModelRegistry";

interface CommittedDocumentCausalModel {
  lease: DocumentCausalModelLease;
  model: DocumentCausalModelSnapshot;
}
const emptySnapshot = () => null;

/**
 * Provider/model side effects begin only in React's committed subscription.
 *
 * The model republishes on every transaction (each keystroke), with a new
 * `revision` and usually nothing else changed. `revisionMatters` tells the
 * store whether the view reads the revision right now (the write hold does,
 * only while the page verdict is unknown or a republish is awaited); while it
 * does not, a republish that changes only the revision is not a new snapshot,
 * so the editor is not rendered again for it.
 */
export function useDocumentCausalModel(options: {
  enabled: boolean;
  pageId: string;
  principalScope: string | null;
  authority: DocumentCausalViewAuthority;
  revisionMatters?: () => boolean;
}): CommittedDocumentCausalModel | null {
  const {enabled, pageId, principalScope, authority} = options;
  const store = useMemo(() => createCommittedModelStore(enabled, pageId, principalScope, authority),
    [enabled, pageId, principalScope, authority]);
  const {revisionMatters} = options;
  useLayoutEffect(() => {
    store.setRevisionMatters(revisionMatters ?? null);
  }, [store, revisionMatters]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, emptySnapshot);
}

/** The snapshots say the same apart from their revision. A saved page is a
 * fresh copy on every publish, so two of them never count as the same. */
function sameApartFromRevision(a: DocumentCausalModelSnapshot, b: DocumentCausalModelSnapshot): boolean {
  return a.session === b.session && a.epoch === b.epoch && a.active === b.active &&
    a.ready === b.ready && a.failure === b.failure && a.mayWrite === b.mayWrite && a.savedPage === null && b.savedPage === null;
}

function createCommittedModelStore(enabled: boolean, pageId: string, principalScope: string | null,
  authority: DocumentCausalViewAuthority) {
    let snapshot: CommittedDocumentCausalModel | null = null;
    // Until the view says otherwise, every revision matters.
    let revisionMatters: () => boolean = () => true;
    return {
      setRevisionMatters(next: (() => boolean) | null) {
        revisionMatters = next ?? (() => true);
      },
      getSnapshot: () => snapshot,
      subscribe(listener: () => void) {
        if (!enabled || !principalScope) return () => {};
        const lease = documentCausalModelRegistry.acquire(pageId, principalScope, authority);
        const update = () => {
          const model = lease.getSnapshot();
          if (snapshot?.lease === lease && sameApartFromRevision(snapshot.model, model) && !revisionMatters()) return;
          snapshot = {lease, model};
          listener();
        };
        const unsubscribe = lease.subscribe(update);
        update();
        return () => {
          unsubscribe();
          if (snapshot?.lease === lease) snapshot = null;
          lease.release();
        };
      },
    };
}
