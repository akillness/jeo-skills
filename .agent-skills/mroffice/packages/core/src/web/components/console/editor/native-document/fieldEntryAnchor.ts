/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { EditorState } from "@tiptap/pm/state";

/**
 * Word's Mark Entry and Mark Citation insert their XE / TA field at the
 * insertion point when nothing is selected. Here an entry is a mark on the
 * text the field follows, so a bare caret marks the word that ends at it
 * (from that word's start to the caret, so the field lands exactly at the
 * caret); at the start of a paragraph, the word that follows it.
 */
export function collapsedFieldEntryRange(
  state: EditorState,
): { from: number; to: number } | null {
  const { selection } = state;
  if (!selection.empty) return null;
  const $from = selection.$from;
  const parent = $from.parent;
  if (!parent.isTextblock || parent.content.size === 0) return null;
  // One character per position: inline leaves (a note reference, a break)
  // read as a single NUL, which no word contains.
  const text = parent.textBetween(0, parent.content.size, "\0", "\0");
  const offset = $from.parentOffset;
  const start = $from.start();
  const words = wordSpans(text);
  const before = words.filter((word) => word.start < offset).pop();
  if (before) return { from: start + before.start, to: start + offset };
  const after = words.find((word) => word.start >= offset);
  return after
    ? { from: start + after.start, to: start + after.end }
    : null;
}

function wordSpans(text: string): { start: number; end: number }[] {
  const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Segmenter) {
    const spans: { start: number; end: number }[] = [];
    for (const segment of new Segmenter(undefined, { granularity: "word" }).segment(text)) {
      if (segment.isWordLike) {
        spans.push({ start: segment.index, end: segment.index + segment.segment.length });
      }
    }
    return spans;
  }
  const spans: { start: number; end: number }[] = [];
  for (const match of text.matchAll(/[^\s\0]+/gu)) {
    spans.push({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length });
  }
  return spans;
}
