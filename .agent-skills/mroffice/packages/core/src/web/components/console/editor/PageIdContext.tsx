"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { createContext, useContext, type ReactNode } from "react";

const PageIdContext = createContext<string | null>(null);

export function PageIdProvider({
  pageId,
  children,
}: {
  pageId: string;
  children: ReactNode;
}) {
  return (
    <PageIdContext.Provider value={pageId}>{children}</PageIdContext.Provider>
  );
}

export function useCurrentPageId(): string | null {
  return useContext(PageIdContext);
}
