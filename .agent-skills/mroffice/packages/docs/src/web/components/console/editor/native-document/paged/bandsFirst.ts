/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
export function bandsFirst(): boolean {
  return typeof window === "undefined" || (window as Window & { __docsBandsFirst?: boolean }).__docsBandsFirst !== false;
}

/** Reason of the `mrn-page-rebalance` event a band change sends (bandsFirst):
 * `detail.sheets` lists the sheet indexes whose band room changed, or is
 * null when every sheet's may have. */
export const PAGE_BANDS_REBALANCE_REASON = "page-bands";
