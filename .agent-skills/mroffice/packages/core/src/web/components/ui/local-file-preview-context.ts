"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { createContext, useContext, useSyncExternalStore } from "react";

import {
  readLocalFilePreview,
  readLocalFilePreviewForPage,
  subscribeLocalFilePreviews,
  type LocalFilePreviewEntry,
} from "../../lib/document-import/local-file-preview";

/**
 * The local preview a window's loading cards show
 * (lib/document-import/local-file-preview): set around a window whose page
 * was made from a file this tab still holds, and around the window that
 * stands for the page before it exists.
 */
export const LocalFilePreviewContext = createContext<LocalFilePreviewEntry | null>(null);

export function useLocalFilePreviewInScope(): LocalFilePreviewEntry | null {
  return useContext(LocalFilePreviewContext);
}

const serverSnapshot = () => null;

/** The preview `id` names, kept current. */
export function useLocalFilePreview(id: string | null | undefined): LocalFilePreviewEntry | null {
  return useSyncExternalStore(
    subscribeLocalFilePreviews,
    () => readLocalFilePreview(id),
    serverSnapshot,
  );
}

/** The preview of the file `pageId` was made from, kept current. */
export function useLocalFilePreviewForPage(
  pageId: string | null | undefined,
): LocalFilePreviewEntry | null {
  return useSyncExternalStore(
    subscribeLocalFilePreviews,
    () => readLocalFilePreviewForPage(pageId),
    serverSnapshot,
  );
}
