"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { createContext } from "react";

export interface PageContentVersion {
  pageId: string;
  contentVersion: number;
  /** Consume a catalogue update in this mounted editor, retaining history.
   * Ownership of a refresh is not a saved acknowledgement. */
  refresh?: (minimumVersion: number) => void;
}

export type PageContentVersionReader = () => PageContentVersion | null;

/** Per-window readers, never a global per-page watermark: another view may
 * still be showing an older version of the very same page. */
export const PageContentVersionContext = createContext<
  ((reader: PageContentVersionReader) => () => void) | null
>(null);

export function refreshMountedPageContent(
  readers: ReadonlySet<PageContentVersionReader>, pageId: string, version: unknown,
): boolean {
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1 || !readers.size) return false;
  const current = [...readers].map(read => read());
  if (current.some(value => !value || value.pageId !== pageId || !value.refresh)) return false;
  for (const value of current) value!.refresh!(version);
  return true;
}

export function hasObservedPageContentVersion(
  readers: ReadonlySet<PageContentVersionReader>,
  pageId: string,
  incomingVersion: unknown,
): boolean {
  if (
    typeof incomingVersion !== "number" ||
    !Number.isSafeInteger(incomingVersion) ||
    incomingVersion < 1 ||
    readers.size === 0
  )
    return false;
  for (const read of readers) {
    const current = read();
    if (
      !current ||
      current.pageId !== pageId ||
      !Number.isSafeInteger(current.contentVersion) ||
      current.contentVersion < incomingVersion
    )
      return false;
  }
  return true;
}
