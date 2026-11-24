/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The list markers of a header/footer story, as Word draws them.
 *
 * Word numbers a list in a header or footer inside that story: each page's
 * header shows its list from "1." again, whatever the body's lists of the
 * same definition have reached (measured in Word 16 for Mac on a header and a
 * body sharing one `w:num`). A story's lines are counted in order: a line of a
 * list at level L continues the list open at that level when it is the same
 * list (kind, style and bullet), starting it at its `start` otherwise; a line
 * at a shallower level closes the deeper ones, and a line that is no list item
 * closes them all -- the same structure the story editor holds as nested list
 * nodes (`bandStoryDoc.ts`), so the painted band and the open story agree.
 *
 * The marker sits in Word's hanging indent: each level indents the text by
 * 0.5 in and hangs the marker 0.25 in to its left (the `w:ind` of Word's
 * Bullets, Numbering and Multilevel gallery definitions, and of the
 * definitions the export writes), unless the line states its own indents.
 *
 * PURE: no DOM.
 */

import { OFFICE_BULLET_STYLE_GLYPHS, type OfficeBulletStyleType } from "../../../../../lib/office-list-catalog";

import { BAND_BULLET_LEVEL_GLYPHS, type BandRichList, type BandRichParagraph } from "../headerFooter";
import { formatListOrdinal, normalizeListStyleType, outlinePrefix } from "../listNumbering";

/** Each level's text indent step, in points (Word: 720 twips per level). */
export const BAND_LIST_INDENT_STEP_PT = 36;
/** The marker's hanging indent, in points (Word: 360 twips). */
export const BAND_LIST_HANGING_PT = 18;

export interface BandListMarker {
  /** What the marker reads: a bullet glyph, or the number with its text ("2.", "a)", "1.2."). */
  text: string;
  /** The face a bullet outside the gallery is drawn in. */
  font?: string;
  /** The text indent of the line, in points (its own, or its level's). */
  indentLeftPt: number;
  /** The first line's indent: negative, the marker hangs into it. */
  firstLineIndentPt: number;
}

/** Whether two lines are items of one list at one level (`b` following
 * `a`): a line that starts its count again opens a list of its own. */
export function sameBandList(a: BandRichList, b: BandRichList): boolean {
  return (
    a.kind === b.kind &&
    (a.style ?? null) === (b.style ?? null) &&
    (a.glyph ?? null) === (b.glyph ?? null) &&
    (a.font ?? null) === (b.font ?? null) &&
    (a.chain ?? null) === (b.chain ?? null) &&
    (a.levelText ?? null) === (b.levelText ?? null) &&
    (a.format ?? null) === (b.format ?? null) &&
    b.restart !== true
  );
}

function bulletText(list: BandRichList, level: number): string {
  if (list.glyph) return list.glyph;
  const style = (list.style ?? BAND_BULLET_LEVEL_GLYPHS[level % 3]) as OfficeBulletStyleType;
  return OFFICE_BULLET_STYLE_GLYPHS[style] ?? OFFICE_BULLET_STYLE_GLYPHS.disc;
}

/**
 * The marker each line of one container (a story's top-level lines, or one
 * table cell's lines) draws, in the same order; null for a line that is no
 * list item.
 */
export function bandListMarkers(paragraphs: readonly (BandRichParagraph | null)[]): (BandListMarker | null)[] {
  const open: { list: BandRichList; count: number }[] = [];
  // A chained line's count lives with its chain, through any lines between
  // (Word numbers every instance of one definition as one list).
  const chains = new Map<string, number[]>();
  return paragraphs.map((paragraph) => {
    const list = paragraph?.list;
    if (!paragraph || !list) {
      open.length = 0;
      return null;
    }
    // A line deeper than one level below the open list hangs under it, as the
    // story editor nests it (a list item holds its nested list).
    const level = Math.min(list.level, open.length);
    open.length = Math.min(open.length, level + 1);
    const current = open[level];
    if (current && sameBandList(current.list, list)) current.count += 1;
    else open[level] = { list, count: list.kind === "ordered" ? (list.start ?? 1) : 1 };
    open.length = level + 1;
    let path = open.map((entry) => Math.max(0, entry.count - 1));
    if (list.kind === "ordered" && list.chain) {
      const counts = chains.get(list.chain) ?? [];
      const own = list.level;
      counts[own] =
        list.restart || counts[own] === undefined ? (list.start ?? 1) : counts[own] + 1;
      counts.length = own + 1;
      chains.set(list.chain, counts);
      // The levels above read the chain's own counts, as one Word list does.
      path = path.map((entry, index) => {
        const value = counts[own - (path.length - 1 - index)];
        return value === undefined ? entry : Math.max(0, value - 1);
      });
    }
    const text =
      list.kind === "bullet"
        ? bulletText(list, list.level)
        : list.levelText
          ? // Word's own level text: its level counts in the level's
            // format, a level above in its number.
            list.levelText.replace(/%([1-9])/g, (_match, digit: string) => {
              const index = Number(digit) - 1 - (list.level - (path.length - 1));
              const value = (path[index] ?? 0) + 1;
              return index === path.length - 1 ? formatListOrdinal(list.format ?? "decimal", value) : String(value);
            })
          : outlinePrefix(normalizeListStyleType(list.style), path);
    const indentLeftPt = paragraph.indentLeftPt ?? BAND_LIST_INDENT_STEP_PT * (level + 1);
    const firstLineIndentPt = paragraph.firstLineIndentPt ?? -BAND_LIST_HANGING_PT;
    return {
      text,
      ...(list.kind === "bullet" && list.font ? { font: list.font } : {}),
      indentLeftPt,
      firstLineIndentPt,
    };
  });
}
