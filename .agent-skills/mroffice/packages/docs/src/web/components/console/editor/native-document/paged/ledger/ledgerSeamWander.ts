/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A page seam that wanders inside one paragraph.
 *
 * The whole-layout cycle watch (ledgerLayoutCycle) stops the pages once they
 * come back to a layout they have had twice. A paragraph cut across a page
 * edge whose head is measured anew each pass can instead wander: the cut
 * moves by a line or two every pass, to a value it has had before, while the
 * rest of the pages move too, so no whole layout ever comes round. R280-D01
 * (unequal newspaper columns): the paragraph opening page 2 is joined back,
 * laid out again in a track of another width, and cut a line earlier or
 * later each time -- page 2 opened at 343, 310, 406, 388, 353, 400, 358, 400
 * characters into it over 27 dispatches, and the document settled on 15, 16
 * or 17 pages by whichever pass the budget ended on (Word: 17).
 *
 * The watch reads each dispatched plan's page openings. A page whose opening
 * is a text cut of the same block in consecutive plans, at a different
 * offset each time, wanders; once its offset has taken three values and
 * comes back to one it had, the pages stop where they stand -- on a fixed
 * rule, not on whichever pass the wandering is at: the smallest offset seen
 * at least twice (the most of the paragraph carried to the next page, so
 * nothing runs over the head's page). A wandering that never comes to that
 * one stops anyway once it has moved eight times.
 */

/** The block and text offset of a page opening `A+text:N`, or null. */
function textCut(start: string | undefined): { atom: string; at: number } | null {
  if (!start) return null;
  const match = /^(\d+)\+text:(\d+)$/.exec(start);
  return match ? { atom: match[1]!, at: Number(match[2]) } : null;
}

/** Offsets a wandering opening takes before the watch looks for a return. */
const DISTINCT_BEFORE_STOP = 3;
/** Moves after which a wandering stops wherever it stands. */
const MAX_MOVES = 8;

export interface SeamWanderWatch {
  /** The openings of a dispatched plan (in page order): the page where a
   * wandering seam should stop now, or null. */
  observe(starts: readonly string[], editSeq: number): number | null;
  /** The inputs changed (fonts, width, page geometry): nothing seen holds. */
  forget(): void;
}

export function createSeamWanderWatch(): SeamWanderWatch {
  let last: readonly string[] | null = null;
  let seq: number | null = null;
  /** By page and block: how often each offset stood, and the moves. */
  const seen = new Map<string, { counts: Map<number, number>; moves: number }>();
  const forget = () => {
    last = null;
    seen.clear();
  };
  return {
    observe(starts, editSeq) {
      if (seq !== editSeq) {
        forget();
        seq = editSeq;
      }
      const before = last;
      last = [...starts];
      if (!before) return null;
      for (let page = 0; page < starts.length && page < before.length; page += 1) {
        const now = textCut(starts[page]);
        const was = textCut(before[page]);
        if (!now || !was || now.atom !== was.atom || now.at === was.at) continue;
        const key = `${page}:${now.atom}`;
        let entry = seen.get(key);
        if (!entry) seen.set(key, (entry = { counts: new Map([[was.at, 1]]), moves: 0 }));
        entry.moves += 1;
        entry.counts.set(now.at, (entry.counts.get(now.at) ?? 0) + 1);
        if (entry.moves >= MAX_MOVES) return page;
        if (entry.counts.size < DISTINCT_BEFORE_STOP || (entry.counts.get(now.at) ?? 0) < 2) continue;
        let canonical = Number.POSITIVE_INFINITY;
        for (const [at, count] of entry.counts) if (count >= 2 && at < canonical) canonical = at;
        if (now.at === canonical) return page;
      }
      return null;
    },
    forget,
  };
}
