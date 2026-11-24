/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { PHYSICAL_PAGE_SPILL_TOLERANCE_PX } from "./sheetPageSpans";

/**
 * Physical-page constants shared by the page ledger, the page-span
 * projection and the Copilot page-region readiness probe.
 *
 * The page ledger (paged/ledger) decides pagination from page-independent
 * atom costs; nothing here is a decision tolerance. These two numbers only
 * describe the VERIFICATION band against painted geometry:
 *  - the shared spill band under which a sheet's body extent is treated as
 *    fitting (sub-2px rounding of margins/zoom, not a real second page);
 *  - the rounding band for reading whole Word line-grid slots back from a
 *    painted row (WebKit floors fractional row heights).
 */
export const PHYSICAL_OVERFLOW_TOLERANCE_PX = PHYSICAL_PAGE_SPILL_TOLERANCE_PX;
export const LINE_GRID_FIT_TOLERANCE_PX = 0.75;

export function pagePhysicallyOverflows(overflowPx: number): boolean {
  return (
    Number.isFinite(overflowPx) && overflowPx > PHYSICAL_OVERFLOW_TOLERANCE_PX
  );
}
