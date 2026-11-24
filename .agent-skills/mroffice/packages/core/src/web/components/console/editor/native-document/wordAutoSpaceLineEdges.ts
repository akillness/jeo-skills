/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's automatic space between East Asian text and Latin letters or digits
 * (w:autoSpaceDE / w:autoSpaceDN) is a gap between two characters on one
 * line: at the start or the end of a line Word sets none (Windows Word 16,
 * corpus R347-D02's header cell: "择" ends a line and "2" opens the next one
 * flush with the cell's edge, so "打" still fits that line). The page draws
 * the gap as an inline margin of the Latin glyph, which the engine keeps at a
 * line edge too.
 *
 * This module decides, from the lines the engine laid out, which of those
 * margins stand at a line edge and can be taken off without changing where
 * the line breaks: a margin is taken off only where the text it would let
 * back still cannot come back. The line before a line-start gap still cannot
 * take the glyph after the gap, and the line a line-end gap ends still cannot
 * take the East Asian letter after it, both measured without the gap. Every
 * break stays where the engine put it with the gap, so a later pass reads the
 * same lines and decides the same (no flicker while typing). A break the gap
 * alone forced (the glyph fits without it; Word wraps it all the same) keeps
 * its gap: the engine has no line-edge-only space.
 *
 * Pure: the caller reads the lines from the layout.
 */

export interface AutoSpaceEdgeGlyph {
  character: string;
  autoSpaceBeforePx: number;
  autoSpaceAfterPx: number;
  /** A glyph this model cannot place (an inline object). */
  opaque?: boolean;
}

/** Where the engine broke the paragraph's lines, read on demand. */
export interface AutoSpaceEdgeLines {
  /** Whether glyph `index` opens a later line than glyph `index - 1`;
   * null where it could not be read. */
  breaksBefore(index: number): boolean | null;
  /** The first glyph on glyph `index`'s line; null where unread. */
  lineStart(index: number): number | null;
}

export interface AutoSpaceEdgeInput {
  glyphs: readonly AutoSpaceEdgeGlyph[];
  lines: AutoSpaceEdgeLines;
  /** Each glyph's advance as the page draws it with no edge taken off (its
   * automatic spaces, punctuation compression and corrections included). */
  advancesPx: readonly number[];
  firstLineWidthPx: number;
  lineWidthPx: number;
  /** The first line holds something besides the glyphs (a list marker). */
  firstLineOpaque?: boolean;
  /** Whether the engine may break between two Latin letters or digits
   * (word-break: break-all): the least text that can come back to a line is
   * then one glyph. */
  breakWithinWords?: boolean;
}

export interface AutoSpaceEdgeResult {
  /** Glyph indexes whose automatic space before them is taken off. */
  starts: Set<number>;
  /** Glyph indexes whose automatic space after them is taken off. */
  ends: Set<number>;
  /** False when a line could not be read: decide again on a later pass. */
  complete: boolean;
}

/** Room a measured line keeps for engine rounding: a gap is taken off only
 * where the text it lets back misses the line by more than this. */
export const AUTO_SPACE_EDGE_SLACK_PX = 0.5;

const WHITE_SPACE = /^\s$/u;
const EAST_ASIAN_LETTER = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]$/u;
const ASCII_WORD = /^[A-Za-z0-9]$/;

export function wordAutoSpaceLineEdges(input: AutoSpaceEdgeInput): AutoSpaceEdgeResult {
  const { glyphs, lines, advancesPx } = input;
  const starts = new Set<number>();
  const ends = new Set<number>();
  let complete = true;
  const count = glyphs.length;
  if (count < 2 || advancesPx.length !== count) return { starts, ends, complete };
  const advance = (index: number) =>
    advancesPx[index] -
    (starts.has(index) ? glyphs[index].autoSpaceBeforePx : 0) -
    (ends.has(index) ? glyphs[index].autoSpaceAfterPx : 0);
  // The glyphs from..to standing on one line: their advance, or null where
  // the model cannot place the line.
  const lineAdvance = (from: number, to: number): number | null => {
    if (from === 0 && input.firstLineOpaque) return null;
    if (WHITE_SPACE.test(glyphs[to].character)) return null;
    let total = 0;
    for (let index = from; index <= to; index++) {
      if (glyphs[index].opaque) return null;
      total += advance(index);
    }
    return total;
  };
  const available = (from: number) => from === 0 ? input.firstLineWidthPx : input.lineWidthPx;
  // The line from..to still cannot take `unit` more.
  const stillFull = (from: number, to: number, unit: number) => {
    const used = lineAdvance(from, to);
    if (used === null || !Number.isFinite(unit) || !(unit > 0)) return false;
    const room = available(from);
    return used <= room + AUTO_SPACE_EDGE_SLACK_PX && used + unit > room + AUTO_SPACE_EDGE_SLACK_PX;
  };
  for (let index = 1; index < count; index++) {
    const glyph = glyphs[index];
    // A gap opening a line: the line before still cannot take the glyph
    // after it -- or the Latin word it opens, when the engine breaks only
    // between words -- once the gap is gone.
    if (glyph.autoSpaceBeforePx > 0 && !glyph.opaque && !WHITE_SPACE.test(glyph.character)) {
      const breaks = lines.breaksBefore(index);
      if (breaks === null) complete = false;
      else if (breaks) {
        const from = lines.lineStart(index - 1);
        if (from === null) complete = false;
        else {
          starts.add(index);
          let unit = advance(index);
          if (!input.breakWithinWords && ASCII_WORD.test(glyph.character)) {
            for (let next = index + 1; next < count && ASCII_WORD.test(glyphs[next].character); next++) {
              const wraps = lines.breaksBefore(next);
              if (wraps !== false) break;
              unit += advance(next);
            }
          }
          if (!stillFull(from, index - 1, unit)) starts.delete(index);
        }
      }
    }
    // A gap closing a line before an East Asian letter on the next: the line
    // still cannot take that letter once the gap is gone. The letter comes
    // back alone (it is a word by itself), and its own gap after it with it.
    const following = index + 1;
    if (glyph.autoSpaceAfterPx > 0 && !glyph.opaque && following < count &&
        EAST_ASIAN_LETTER.test(glyphs[following].character) && !glyphs[following].opaque) {
      const breaks = lines.breaksBefore(following);
      if (breaks === null) complete = false;
      else if (breaks) {
        const from = lines.lineStart(index);
        if (from === null) complete = false;
        else {
          ends.add(index);
          if (!stillFull(from, index, advancesPx[following] - glyphs[following].autoSpaceAfterPx)) ends.delete(index);
        }
      }
    }
  }
  return { starts, ends, complete };
}

/** The line reader over a known line index per glyph (tests, and callers
 * that read every glyph's line). */
export function autoSpaceEdgeLinesOf(lineOfGlyph: readonly (number | null)[]): AutoSpaceEdgeLines {
  return {
    breaksBefore: (index) => {
      const here = lineOfGlyph[index], before = lineOfGlyph[index - 1];
      return here == null || before == null ? null : here > before;
    },
    lineStart: (index) => {
      const line = lineOfGlyph[index];
      if (line == null) return null;
      let start = index;
      while (start > 0 && lineOfGlyph[start - 1] === line) start--;
      return start > 0 && lineOfGlyph[start - 1] == null ? null : start;
    },
  };
}
