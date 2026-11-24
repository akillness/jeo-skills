/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
export function docsLayoutPerfLegacy(): boolean {
  return typeof window !== "undefined" &&
    Boolean((window as Window & { __docsLayoutPerfLegacy?: boolean }).__docsLayoutPerfLegacy);
}
