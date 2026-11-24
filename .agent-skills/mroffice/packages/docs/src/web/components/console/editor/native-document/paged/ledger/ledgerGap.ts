/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { LedgerAtom } from "./ledgerTypes";

export interface GapSpacing {
  spaceAfterPx: number;
  spaceBeforePx: number;
  contextualKey: string | null;
  contextualSpacing: boolean;
  /** The block's last paragraph, where it differs from its first (a list). */
  contextualKeyAfter?: string | null;
  contextualSpacingAfter?: boolean;
}

export function wordParagraphGapPx(
  previous: GapSpacing,
  next: GapSpacing,
  /** Word's "Don't use HTML paragraph auto spacing" (the page's
   * `wordSpacingAddsUp`): the two spacings add up instead of overlapping
   * (Word 16.86: 10 pt and 10 pt print 34.2 pt apart, not 24.15). */
  addsUp = false,
): number {
  const after = Math.max(0, previous.spaceAfterPx || 0);
  // Word compares the paragraph that ends the block above with the one that
  // opens the block below: for a list, its last item's and its first's.
  const previousKey = previous.contextualKeyAfter !== undefined ? previous.contextualKeyAfter : previous.contextualKey;
  const previousContextual = previous.contextualSpacingAfter ?? previous.contextualSpacing;
  // A negative space before (a Top and Bottom picture drawn up into the space
  // after the block above, ledgerAtoms' authoredMarginsPx) collapses with
  // that space as CSS margins of mixed signs do: they add up.
  const negativeBefore = Math.min(0, next.spaceBeforePx || 0);
  if (negativeBefore < 0) {
    const sameKey =
      previousKey !== null && previousKey === next.contextualKey;
    const painted = previousContextual && sameKey ? 0 : after;
    return Math.max(0, painted + negativeBefore);
  }
  const before = Math.max(0, next.spaceBeforePx || 0);
  const sameStyle =
    previousKey !== null &&
    next.contextualKey !== null &&
    previousKey === next.contextualKey;
  const paintedAfter =
    previousContextual && sameStyle ? 0 : after;
  const effectiveBefore = next.contextualSpacing && sameStyle ? 0 : before;
  if (addsUp) return paintedAfter + effectiveBefore;
  return paintedAfter + Math.max(0, effectiveBefore - after);
}

export function ledgerGapPx(previous: LedgerAtom, next: LedgerAtom, addsUp = false): number {
  // Zero-height break markers keep their neighbours' spacing out of the page
  // (CSS gives them margin:0 even under display:none).
  if (previous.hidden || next.hidden) return 0;
  return wordParagraphGapPx(previous, next, addsUp);
}

/** The gap between two atoms of a document that adds the spacings up. */
export function ledgerAddedGapPx(previous: LedgerAtom, next: LedgerAtom): number {
  return ledgerGapPx(previous, next, true);
}
