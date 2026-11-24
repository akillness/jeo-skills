/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The rows of a long run of text inside a row-sliced atom (atomRowSlices).
 *
 * A row-sliced atom is cut between two of its rows. A paragraph it draws is
 * normally one row: it moves to the next page whole. A paragraph longer than
 * a page has no page it fits on, so it is drawn as rows of its own: its
 * words, each (with the spaces and punctuation after it) an inline element
 * stamped with its row number. The words of one line end at the same
 * height, so the largest head that fits ends with a whole line and the
 * continuation starts with the next line's first word: the paragraph is cut
 * between two of its lines, where the browser had broken it anyway. Wrapping
 * words in inline elements adds no place to break a line and takes none
 * away.
 *
 * Text shorter than a page can ever be is left alone: one row, one element.
 */

/** Below this length a run of text is one row. The shortest text that can
 * be taller than a Letter page's text area is a few hundred characters (a
 * first-level heading of East Asian text); ordinary paragraphs take
 * thousands. */
export const TEXT_ROWS_MIN_CHARS = 240;

/** The most rows one run of text is drawn in. Past it several words share
 * a row (the cut may then leave a page's last line a few words short), so
 * the longest text an atom may hold stays a bounded number of elements. */
const MAX_ROWS_PER_TEXT = 20_000;

type WordSegmenter = { segment(text: string): Iterable<{ segment: string; isWordLike?: boolean }> };

function wordSegmenter(): WordSegmenter | null {
  const intl = (typeof Intl === "undefined" ? null : Intl) as
    | (typeof Intl & { Segmenter?: new (locale?: string, options?: { granularity: "word" }) => WordSegmenter })
    | null;
  if (!intl?.Segmenter) return null;
  try {
    return new intl.Segmenter(undefined, { granularity: "word" });
  } catch {
    return null;
  }
}

/** Words with what follows them (spaces, punctuation), in reading order:
 * put together they are `text` again. */
export function wordsOf(text: string): string[] {
  const segmenter = wordSegmenter();
  if (!segmenter) return text.match(/^\s*\S+\s*|\S+\s*/g) ?? [text];
  const words: string[] = [];
  // What stands before the first word (spaces, an opening quotation mark)
  // is drawn with it: a row always holds something that takes room.
  let before = "";
  for (const { segment, isWordLike } of segmenter.segment(text)) {
    if (isWordLike) {
      words.push(before + segment);
      before = "";
    } else if (words.length === 0) {
      before += segment;
    } else {
      words[words.length - 1] += segment;
    }
  }
  if (before) words.push(before);
  return words;
}

/**
 * `text` as the rows it is drawn in: null for text short enough to be one
 * row, otherwise pieces that put together are `text` again.
 */
export function textRowChunks(text: string): string[] | null {
  if (text.length < TEXT_ROWS_MIN_CHARS) return null;
  const words = wordsOf(text);
  if (words.length < 2) return null;
  if (words.length <= MAX_ROWS_PER_TEXT) return words;
  const perRow = Math.ceil(words.length / MAX_ROWS_PER_TEXT);
  const rows: string[] = [];
  for (let index = 0; index < words.length; index += perRow) rows.push(words.slice(index, index + perRow).join(""));
  return rows;
}
