"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
export const PDF_PAGE_INSERT_BLANK_CONTROL_ID =
  "PDFCTL.RIBBON.PAGE.INSERT_BLANK";

export interface PdfPageInsertBlankRibbonControlProps {
  disabled?: boolean;
  disabledReason?: string;
  insertBlankLabel: string;
  insertBlankLoadingLabel?: string;
  insertBlankOpen?: boolean;
  loading?: boolean;
  onInsertBlank: (trigger: HTMLButtonElement) => void;
}

export interface PdfPageRibbonTabProps extends PdfPageInsertBlankRibbonControlProps {
  pageStructureLabel: string;
}
