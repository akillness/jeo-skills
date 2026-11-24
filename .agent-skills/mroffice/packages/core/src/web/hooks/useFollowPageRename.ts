"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useRef } from "react";
import { NOTEBOOK_PAGE_RENAMED_EVENT, pageRenameFromEvent } from "../lib/notebook-events";







export function useFollowPageRename(
  pageId: string | null | undefined,
  onRename: (title: string) => void,
): void {
  const onRenameRef = useRef(onRename);
  useEffect(() => {
    onRenameRef.current = onRename;
  }, [onRename]);
  useEffect(() => {
    if (!pageId || typeof window === "undefined") return;
    const handler = (event: Event) => {
      const rename = pageRenameFromEvent(event);
      if (rename && rename.pageId === pageId) onRenameRef.current(rename.title);
    };
    window.addEventListener(NOTEBOOK_PAGE_RENAMED_EVENT, handler);
    return () => window.removeEventListener(NOTEBOOK_PAGE_RENAMED_EVENT, handler);
  }, [pageId]);
}
