/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  isPdfWpsBaseRibbonTab,
  type PdfWpsContextualRibbonTab,
} from "../../../../../lib/pdf/ribbon-state";

// WPS order (开始 · 插入 · 编辑 · 页面 · 批注 · 特色功能) with Word's Draw tab

// so the tabs do not move when the window switches.
export const PDF_VIEWER_BASE_RIBBON_TABS = ["home", "insert"] as const;

export type PdfBaseRibbonTab = (typeof PDF_VIEWER_BASE_RIBBON_TABS)[number];
export type PdfRibbonTab = PdfBaseRibbonTab | PdfWpsContextualRibbonTab;

export function isPdfViewerBaseRibbonTab(value: string): value is PdfBaseRibbonTab {
  return isPdfWpsBaseRibbonTab(value);
}
