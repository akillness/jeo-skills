/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word/WPS-grade MULTILEVEL HEADING auto-numbering (1 / 1.1 / 1.1.1 …).
 *
 * When a document turns on heading numbering, every heading (H1–H6) shows a
 * hierarchical number derived LIVE from the heading sequence — exactly like the
 * Table of Contents derives its entry list and a caption derives its "Figure N"
 * — rather than a number the user typed. Promote / demote / insert / delete a
 * heading and every following number re-derives with no drift.
 *
 * This module is the SINGLE SOURCE OF TRUTH for the number math so the on-screen
 * decoration, the DOCX export, and the unit tests all agree on what number a
 * given heading at a given level gets.
 *
 * PURE: integer / string math only, no DOM, no TipTap runtime.
 *
 * The scheme matches Word's default "1 / 1.1 / 1.1.1" multilevel list applied to
 * the heading styles: each level keeps its own running counter; a heading's
 * number is the dotted path of the counters from level 1 down to its own level;
 * a counter RESETS to 1 whenever a shallower heading appears before it. A level
 * that is skipped (e.g. an H3 with no preceding H2) still counts from its own
 * fresh counter so the path never has a gap-induced blank segment.
 */

/** A heading the numberer sees: only its level matters for the math. */
export interface NumberableHeading {
  /** 1-based heading level (H1 → 1 … H6 → 6). Values outside 1–6 are skipped. */
  level: number;
}

/** The smallest and largest heading level the numberer tracks. */
const MIN_LEVEL = 1;
const MAX_LEVEL = 6;

/**
 * Compute the multilevel number STRING for each heading, in document order.
 *
 * Returns an array aligned 1:1 with the input: entry `i` is the dotted number for
 * `headings[i]` (e.g. "1", "1.1", "1.1.1", "2", "2.1"), or "" for a heading whose
 * level is out of the 1–6 range (it is left un-numbered rather than throwing).
 *
 * Algorithm (mirrors Word's default heading multilevel list):
 *   - Keep a counter per level 1–6, all starting at 0.
 *   - For each heading at level L: increment counter[L]; reset every DEEPER
 *     counter (L+1 … 6) to 0 so a new section restarts its sub-numbering.
 *   - The number is counters[1..L] joined by "." — but a leading run of zero
 *     counters (levels above the first heading ever seen, e.g. a document that
 *     opens at H2) is treated as 1 so the path is never "0.x".
 *
 * PURE.
 */
export function computeHeadingNumbers(headings: NumberableHeading[]): string[] {
  // counters[level] — index 0 unused so levels read naturally (counters[1]=H1).
  const counters = new Array<number>(MAX_LEVEL + 1).fill(0);
  const out: string[] = [];

  for (const heading of headings) {
    const level = heading?.level;
    if (
      typeof level !== "number" ||
      !Number.isInteger(level) ||
      level < MIN_LEVEL ||
      level > MAX_LEVEL
    ) {
      out.push("");
      continue;
    }
    counters[level] += 1;
    // Reset every deeper counter so a fresh section restarts its sub-numbering.
    for (let deeper = level + 1; deeper <= MAX_LEVEL; deeper += 1) {
      counters[deeper] = 0;
    }
    // Build the dotted path from level 1 down to this heading's level. A counter
    // still at 0 (a skipped shallower level, e.g. an H3 with no H1/H2 before it)
    // renders as 1 so the path never shows a "0" segment.
    const segments: number[] = [];
    for (let l = MIN_LEVEL; l <= level; l += 1) {
      segments.push(counters[l] === 0 ? 1 : counters[l]);
    }
    out.push(segments.join("."));
  }

  return out;
}

/**
 * The display prefix appended to a heading's text when numbering is on —
 * the dotted number followed by a tab-like gap. Kept separate from
 * {@link computeHeadingNumbers} so the editor decoration and the export can pick
 * their own separator while sharing the number math. PURE.
 */
export function headingNumberLabel(number: string): string {
  return number ? `${number} ` : "";
}
