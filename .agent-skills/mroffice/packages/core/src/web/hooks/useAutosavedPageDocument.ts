/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// A page that is not saved anywhere: the open-source editors run their
// windows in local mode (no server page, no autosave), where this hook is
// disabled. It answers as a disabled hook does: nothing loaded, nothing to
// save, nothing failed. Saving a local file is the host's (EditorProps).
import { useMemo } from "react";

import { inertValue } from "@mrnote/core/host/inert.ts";

export * from "@mrnote/core/web/__stubs__/hooks/useAutosavedPageDocument.ts";

export type PageSaveStatus = "saved" | "saving" | "unsaved" | "conflict";
export type AutosavedPageLoadSource = "local-preview" | "remote" | "history";

const noop = () => {};
const resolved = () => Promise.resolve(undefined);

const IDLE = Object.freeze({
  page: null,
  loading: false,
  error: null,
  saveStatus: "saved" as PageSaveStatus,
  authorOperationHeld: false,
  pageDraftDirty: false,
  conflictDetails: null,
  readOnly: false,
  isCachedPreview: false,
  closingEditsPending: false,
  isLocalAuthorityPending: false,
  workbookPresence: null,
  readOnlyReason: null,
  lockedByName: null,
  reloadNonce: 0,
  isDirty: false,
  isSaving: false,
  hasConflict: false,
  syncedToServer: false,
  workbookRoomsAheadOfSave: false,
  workbookCatchingUp: false,
  // The hook's optional flags and readings, absent unless something is so;
  // read through the Proxy they were inert values, which are truthy: every
  // open-source document said "Not connected. Changes are kept on this
  // device" in red before anything had happened.
  notConnected: undefined,
  saveSlow: undefined,
  roomFoldBehind: undefined,
  saveSentAt: undefined,
  lastSaveAcknowledgement: undefined,
  causalUpgradeHeldBy: undefined,
  blockedRecoveryDraft: null,
  // No room: no awareness, so an editor sees nobody else online (read
  // through the Proxy it was a truthy inert value, and New Presentation threw).
  roomAwareness: null,
  queueSave: noop,
  replacePendingDraft: noop,
  saveNow: resolved,
  saveTransformedContent: resolved,
  retrySave: resolved,
  overwriteRemote: resolved,
  saveConflictAsCopy: resolved,
  reload: resolved,
  discardLocalAndReload: resolved,
});

const IDLE_WITH_REST = new Proxy(IDLE, {
  get(target, key) {
    if (typeof key === "symbol" || key in target) return Reflect.get(target, key);
    return inertValue(`useAutosavedPageDocument().${key}`);
  },
});

export function useAutosavedPageDocument(_options?: unknown): any {
  return useMemo(() => IDLE_WITH_REST, []);
}

export function clearPersistedPageDraft(_pageId: string): void {}
export function readPersistedPageDraft(): null {
  return null;
}
