"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { createContext, useContext } from "react";
import type { PageSaveStatus } from "@mrnote/core/web/hooks/useAutosavedPageDocument.ts";

/** A derived workbook never acquires a separate page or save authority. */
export interface DocumentWorkbookPersistence {
  save: () => Promise<boolean>;
  status: PageSaveStatus;
  available: boolean;
}

export const DocumentWorkbookPersistenceContext =
  createContext<DocumentWorkbookPersistence | null>(null);
export const useDocumentWorkbookPersistence = () =>
  useContext(DocumentWorkbookPersistenceContext);
