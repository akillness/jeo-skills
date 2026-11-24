/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The shared shape of a per-structure ribbon gate table: which control test
 * ids have no meaning for the selected object, and the one reason they show.
 *
 * Each editor keeps its own measured table (Docs `ribbonSelectionGate.ts`,
 * the worksheet's and the deck's) and turns it into an
 * `OfficeRibbonCommandGate` with `selectionGateFromEntries`. An entry ending
 * in "-" is a prefix and covers a menu's every item; anything else is an
 * exact test id.
 */

import type { OfficeRibbonCommandGate } from "./officeRibbonCommandGate";

/** Whether `testId` is named by `entries` (exact, or by a "-" prefix). */
export function gatedByTestId(
  testId: string,
  entries: readonly string[],
): boolean {
  for (const entry of entries) {
    if (entry.endsWith("-") ? testId.startsWith(entry) : testId === entry) {
      return true;
    }
  }
  return false;
}

/**
 * The gate for one measured table, or null when the table is empty (text
 * and cell selections, where every command applies).
 */
export function selectionGateFromEntries(
  entries: readonly string[],
  reason: string,
): OfficeRibbonCommandGate | null {
  if (entries.length === 0) return null;
  return (testId) => (gatedByTestId(testId, entries) ? reason : undefined);
}

/** The reason line every editor shows, in the ribbon's language. */
export function selectionGateReason(
  chinese: boolean,
  label: { readonly zh: string; readonly en: string },
): string {
  return chinese
    ? `选中的${label.zh}不支持此命令`
    : `Not available for the selected ${label.en}`;
}
