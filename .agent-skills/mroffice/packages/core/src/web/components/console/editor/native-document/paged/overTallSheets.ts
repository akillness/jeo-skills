/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The sheets the page ledger gave to a block it could not cut and that is
 * taller than the page.
 *
 * Word puts such a block on a page of its own, draws it at full size and
 * lets the paper's edge end it (measured in Word 16.86 with an inline
 * picture 9.5, 12 and 20 in tall in a paragraph of its own: one page, the
 * next block on the next). An atom shows that by itself; a paragraph whose
 * one line holds an over-tall inline picture, or a table row that cannot
 * break, only the ledger's plan can tell from text that has not been cut
 * yet. The ledger records its verdict here when it has laid the document
 * out, and the page-span measurement stamps those sheets as one page.
 *
 * Zero-dependency on purpose: the ledger writes, the page-span extension
 * and the overflow readers read.
 */
const overTall = new WeakSet<HTMLElement>();

/** Record whether `sheet` holds such a block; true when that changed. */
export function setOverTallSheet(sheet: HTMLElement, holds: boolean): boolean {
  if (overTall.has(sheet) === holds) return false;
  if (holds) overTall.add(sheet);
  else overTall.delete(sheet);
  return true;
}

export function isOverTallSheet(sheet: HTMLElement | null | undefined): boolean {
  return Boolean(sheet) && overTall.has(sheet!);
}
