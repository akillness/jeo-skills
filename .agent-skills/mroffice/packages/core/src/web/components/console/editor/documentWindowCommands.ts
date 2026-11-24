/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type {
  WindowManagerActions,
  WindowSemanticState,
} from "../../notebook/WindowManager";
import {
  arrangeAllOfficeWindows,
  computeOfficeArrangeAllLayout,
  OFFICE_WINDOW_COMMAND_MAX_WINDOWS,
  officeWindowChoices,
  openNewOfficeWindow,
  switchToOfficeWindow,
  type OfficeWindowChoice,
  type OfficeWindowRect,
  type OfficeWindowViewport,
} from "../../../lib/office-window-commands";

/**
 * Docs' View > Window commands: the shared office window commands
 * (lib/office-window-commands) bound to document windows.
 */

export type DocumentWindowChoice = OfficeWindowChoice;
export type DocumentWindowRect = OfficeWindowRect;

export const DOCUMENT_WINDOW_COMMAND_MAX_WINDOWS =
  OFFICE_WINDOW_COMMAND_MAX_WINDOWS;

export function documentWindowChoices(
  windows: readonly WindowSemanticState[],
  currentWindowId: string,
): DocumentWindowChoice[] {
  return officeWindowChoices(windows, currentWindowId, "document");
}

export function computeDocumentArrangeAllLayout(
  viewport: OfficeWindowViewport,
  count: number,
): DocumentWindowRect[] | null {
  return computeOfficeArrangeAllLayout(viewport, count);
}

export function openNewDocumentWindow(
  actions: Pick<WindowManagerActions, "openWindow"> &
    Partial<Pick<WindowManagerActions, "readWindowFrame" | "restoreWindow">>,
  request: {
    notebookId: string;
    pageId: string;
    title: string;
    sourceWindowId?: string;
  },
): boolean {
  return openNewOfficeWindow(actions, { ...request, pageType: "document" });
}

export function arrangeAllDocumentWindows(
  actions: Pick<
    WindowManagerActions,
    | "focusWindow"
    | "moveWindow"
    | "readWindows"
    | "resizeWindow"
    | "restoreWindow"
  > &
    Partial<Pick<WindowManagerActions, "readWindowFrame">>,
  sourceWindowId: string,
): boolean {
  return arrangeAllOfficeWindows(actions, sourceWindowId, "document");
}

export function switchToDocumentWindow(
  actions: Pick<
    WindowManagerActions,
    "focusWindow" | "readWindows" | "restoreWindow"
  >,
  targetWindowId: string,
): boolean {
  return switchToOfficeWindow(actions, targetWindowId, "document");
}
