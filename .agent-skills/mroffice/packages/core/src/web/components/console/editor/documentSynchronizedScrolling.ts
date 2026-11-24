/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  officeSynchronizedScrollingVersion,
  officeSynchronizedScrollState,
  registerOfficeScrollPort,
  subscribeOfficeSynchronizedScrolling,
  toggleOfficeSynchronizedScrolling,
  useOfficeSynchronizedScrollState,
  type OfficeSynchronizedScrollState,
} from "../../../lib/office-window-commands";

/**
 * Docs' Synchronous Scrolling: the shared office scroll-port registry
 * (lib/office-window-commands/synchronizedScrolling.ts) bound to documents.
 */

export type DocumentSynchronizedScrollState = OfficeSynchronizedScrollState;

export function registerDocumentSynchronizedScrollPort(request: {
  element: HTMLElement;
  pageId: string;
  windowId: string;
}): () => void {
  return registerOfficeScrollPort({ ...request, pageType: "document" });
}

export function documentSynchronizedScrollState(
  windowId: string,
  pageId: string,
): DocumentSynchronizedScrollState {
  return officeSynchronizedScrollState(windowId, pageId, "document");
}

export function toggleDocumentSynchronizedScrolling(
  windowId: string,
  pageId: string,
): boolean {
  return toggleOfficeSynchronizedScrolling(windowId, pageId, "document");
}

export const subscribeDocumentSynchronizedScrolling =
  subscribeOfficeSynchronizedScrolling;

export const documentSynchronizedScrollingVersion =
  officeSynchronizedScrollingVersion;

/** This window's state, re-rendering it only when that state changes. */
export function useDocumentSynchronizedScrollState(
  windowId: string,
  pageId: string,
): DocumentSynchronizedScrollState {
  return useOfficeSynchronizedScrollState(windowId, pageId, "document");
}
