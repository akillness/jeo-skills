/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Transaction } from "@tiptap/pm/state";

/**
 * The outermost textblocks a transaction touched, as positions in its final
 * doc: every block a step replaced, inserted (a block moved to another
 * sheet is touched where it lands), joined or split, and every block a mark,
 * attribute or node-mark step reached (those leave the positions alone: an
 * empty step map). A plugin whose decorations of a textblock depend on that
 * block alone maps its set through the transaction and rebuilds these.
 */
export function touchedTextblocks(tr: Transaction): Set<number> {
  const blocks = new Set<number>();
  for (const [from, to] of touchedRanges(tr)) {
    tr.doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isTextblock) return true;
      blocks.add(pos);
      return false;
    });
  }
  return blocks;
}

/** The [from, to) ranges of the textblocks `touchedTextblocks` names. */
export function touchedTextblockRanges(tr: Transaction): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const pos of touchedTextblocks(tr)) {
    const node = tr.doc.nodeAt(pos);
    if (node) ranges.push([pos, pos + node.nodeSize]);
  }
  return ranges;
}

/** The ranges of `tr.doc` the transaction's steps reached (see
 * `touchedTextblocks`), each widened by one position on either side so a
 * deletion's point reaches the blocks on both sides of it. */
export function touchedRanges(tr: Transaction): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  tr.steps.forEach((step, index) => {
    const rest = tr.mapping.slice(index + 1);
    tr.mapping.maps[index]?.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      ranges.push([rest.map(newStart, -1), rest.map(newEnd, 1)]);
    });
    const { from, to, pos } = step as unknown as { from?: unknown; to?: unknown; pos?: unknown };
    const own = tr.mapping.slice(index);
    if (typeof from === "number") {
      ranges.push([own.map(from, -1), own.map(typeof to === "number" ? to : from, 1)]);
    } else if (typeof pos === "number") {
      // An attribute or node-mark step on the node at `pos`: all of it.
      const at = own.map(pos, 1);
      const node = tr.doc.nodeAt(at);
      ranges.push([at, at + (node?.nodeSize ?? 1)]);
    }
  });
  const size = tr.doc.content.size;
  return ranges.map(([a, b]) => [
    Math.max(0, Math.min(a, b) - 1),
    Math.min(size, Math.max(a, b) + 1),
  ]);
}

/**
 * Overlapping ranges as one walk each. A plugin's dirty list gains a range for
 * every step, and on a long table moved page by page most cover the same
 * blocks: walking the document once a range was most of a pass (R324-D04: half
 * an hour to lay out 228 KB).
 */
export function mergedRanges(ranges: ReadonlyArray<readonly [number, number]>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const [from, to] of [...ranges].sort((a, b) => a[0] - b[0])) {
    const last = out[out.length - 1];
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else out.push([from, to]);
  }
  return out;
}
