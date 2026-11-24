/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  computeOfficeSideBySideLayout,
  officeWindowIdsForPage,
  readOfficeSideBySideLayout,
  startOfficeSideBySide,
  type OfficeSideBySideLayout,
  type OfficeSideBySideRun,
  type OfficeWindowRect,
  type OfficeWindowViewport,
} from "../../../lib/office-window-commands";

/**
 * Docs' View Side by Side: the shared office implementation
 * (lib/office-window-commands/sideBySide.ts) bound to document windows,
 * which mark their page with data-document-page-id.
 */

const DOCUMENT_PAGE_ID_ATTRIBUTE = "data-document-page-id";

export type DocumentSideBySideRect = OfficeWindowRect;
export type DocumentSideBySideLayout = OfficeSideBySideLayout;
export type DocumentSideBySideRun = OfficeSideBySideRun;

export function computeDocumentSideBySideLayout(
  viewport: OfficeWindowViewport,
): DocumentSideBySideLayout | null {
  return computeOfficeSideBySideLayout(viewport);
}

export function readDocumentSideBySideLayout(
  windowId: string,
): DocumentSideBySideLayout | null {
  return readOfficeSideBySideLayout(windowId);
}

export function documentWindowIdsForPage(pageId: string): string[] {
  return officeWindowIdsForPage(pageId, DOCUMENT_PAGE_ID_ATTRIBUTE);
}

export interface DocumentSideBySideActions {
  focusWindow: (id: string) => void;
  moveWindow: (id: string, x: number, y: number) => void;
  openWindow: (payload: {
    type: "note";
    title: string;
    meta: { notebookId: string; pageId: string; pageType: "document" };
    force_new: true;
    beside_type: "note";
  }) => void;
  resizeWindow: (id: string, width: number, height: number) => void;
  restoreWindow: (id: string) => void;
}

export interface DocumentSideBySideRequest {
  actions: DocumentSideBySideActions;
  notebookId: string;
  pageId: string;
  sourceWindowId: string;
  title: string;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (handle: number) => void;
}

export function startDocumentSideBySide(
  request: DocumentSideBySideRequest,
): DocumentSideBySideRun {
  const { actions } = request;
  return startOfficeSideBySide({
    ...request,
    actions: {
      focusWindow: actions.focusWindow,
      moveWindow: actions.moveWindow,
      resizeWindow: actions.resizeWindow,
      restoreWindow: actions.restoreWindow,
      openWindow: (payload) =>
        actions.openWindow({
          ...payload,
          meta: { ...payload.meta, pageType: "document" },
        }),
    },
    pageType: "document",
    pageIdAttribute: DOCUMENT_PAGE_ID_ATTRIBUTE,
  });
}
