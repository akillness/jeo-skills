/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import {
  bandRichRunsText,
  normalizeBandRichBlocks,
  normalizeSectionBands,
  sanitizeHeaderFooterText,
  type BandRichBlock,
  type BandRichRun,
  type BandVariant,
} from "@mrnote/core/web/components/console/editor/native-document/headerFooter.ts";
import {
  footnoteRunFlagsAt,
  numberNoteStreams,
  resolveFootnoteMode,
  isNoteMathRun,
  spliceFootnoteRichBody,
  type FootnoteRichBody,
  type FootnoteRun,
  type NoteStream,
  footnoteRichBodyText,
} from "@mrnote/core/web/components/console/editor/native-document/footnotes.ts";
import {
  FOOTNOTE_MODE_ATTR,
  collectFootnoteRefOrder,
  readFootnotes,
  readNoteSettings,
} from "@mrnote/core/web/components/console/editor/native-document/footnoteExtension.tsx";

/**
 * Word's Find "Find In" stories beyond the main document (Find and Replace >
 * Find > Find In: Main Document, Headers and Footers, Footnotes/Endnotes).
 *
 * In MRAI those stories are not text in the body editor:
 *   - a header/footer is a band model on the document attrs (plain text, or
 *     Word's rich blocks, per section and per variant), edited through the
 *     band story editor that opens on the page;
 *   - a note body is a record in the note store (`footnotes` doc attr), with
 *     an optional run-formatted rich body.
 * This module reads both stories as lines of text for the one matcher the
 * pane uses, and writes a note replacement through the rich-body splice so
 * the formatting outside the replaced span is kept.
 */

export type DocumentFindScope = "main" | "headersFooters" | "notes";

export type DocumentFindLineMatcher = (
  text: string,
) => ReadonlyArray<{
  start: number;
  end: number;
  captures?: string[];
  namedGroups?: Record<string, string>;
}>;

/** The font flags Find > Format compares, for one character of a story line. */
export interface DocumentFindCharacterFormat {
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
}

/**
 * A story line's formatting, one entry per UTF-16 unit of the line; null
 * for a line stored as plain text (it carries no bold, italic or underline).
 */
export type DocumentFindLineFormats =
  | readonly DocumentFindCharacterFormat[]
  | null;

const PLAIN_CHARACTER: DocumentFindCharacterFormat = Object.freeze({
  bold: false,
  italic: false,
  underline: false,
});

/** A line's formats from its runs, aligned with the text the runs make. */
function runLineFormats<
  Run extends { bold?: boolean; italic?: boolean; underline?: boolean },
>(
  runs: readonly Run[],
  text: (run: Run) => string,
  limit = Number.POSITIVE_INFINITY,
): DocumentFindCharacterFormat[] {
  const formats: DocumentFindCharacterFormat[] = [];
  for (const run of runs) {
    const format =
      run.bold || run.italic || run.underline
        ? {
            bold: run.bold === true,
            italic: run.italic === true,
            underline: run.underline === true,
          }
        : PLAIN_CHARACTER;
    for (let unit = 0; unit < text(run).length; unit += 1) formats.push(format);
  }
  return formats.slice(0, limit);
}

/**
 * Whether every character of a hit carries the formats Find > Format asks
 * for (Word's "Find > Format > Font": bold, italic, underline), the same
 * test the open story's editor applies to its runs.
 */
export function storyHitHasFormat(
  hit: Pick<DocumentFindStoryHit, "start" | "end" | "formats">,
  format: { bold: boolean; italic: boolean; underline: boolean },
): boolean {
  if (!format.bold && !format.italic && !format.underline) return true;
  if (!hit.formats) return false;
  for (let index = hit.start; index < hit.end; index += 1) {
    const character = hit.formats[index] ?? PLAIN_CHARACTER;
    if (format.bold && !character.bold) return false;
    if (format.italic && !character.italic) return false;
    if (format.underline && !character.underline) return false;
  }
  return true;
}

export interface DocumentFindStoryHit {
  /** Stable key for React and for the current-hit identity. */
  readonly key: string;
  readonly line: string;
  /** The line's formatting (Find > Format reads it without an editor). */
  readonly formats?: DocumentFindLineFormats;
  readonly start: number;
  readonly end: number;
  /** Regex captures, so `$1` in a replacement expands as in the body. */
  readonly captures?: string[];
  /** Named groups, so `$<name>` expands as in the body. */
  readonly namedGroups?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Headers and footers
// ---------------------------------------------------------------------------

export interface DocumentHeaderFooterStory {
  readonly key: string;
  readonly kind: "header" | "footer";
  readonly variant: BandVariant;
  readonly sectionIndex: number;
  readonly lines: readonly string[];
  /** Each line's formatting, parallel to `lines`. */
  readonly lineFormats?: readonly DocumentFindLineFormats[];
}

const BAND_KEYS = [
  ["header", "normal", "headerText", "headerRich"],
  ["footer", "normal", "footerText", "footerRich"],
  ["header", "first", "firstPageHeader", "firstPageHeaderRich"],
  ["footer", "first", "firstPageFooter", "firstPageFooterRich"],
  ["header", "even", "evenPageHeader", "evenPageHeaderRich"],
  ["footer", "even", "evenPageFooter", "evenPageFooterRich"],
] as const;

interface StoryLine {
  readonly text: string;
  readonly formats: DocumentFindLineFormats;
}

/** The text `bandRichRunsText` makes of a run (a field shows its token). */
const bandRunText = (run: { text?: string; token?: string }) =>
  run.token ? `{${run.token}}` : (run.text ?? "");

function bandRunsLine(runs: readonly BandRichRun[]): StoryLine {
  const text = bandRichRunsText(runs);
  return { text, formats: runLineFormats(runs, bandRunText, text.length) };
}

function richBlockLines(blocks: readonly BandRichBlock[]): StoryLine[] {
  const lines: StoryLine[] = [];
  for (const block of blocks) {
    if (block.type === "paragraph") {
      lines.push(bandRunsLine(block.runs));
      continue;
    }
    for (const cell of block.cells) {
      if (cell.paragraphs?.length) {
        for (const paragraph of cell.paragraphs) {
          lines.push(bandRunsLine(paragraph.runs));
        }
      } else if (cell.runs?.length) {
        lines.push(bandRunsLine(cell.runs));
      } else {
        lines.push({ text: cell.text, formats: null });
      }
    }
  }
  return lines.filter((line) => line.text.trim().length > 0);
}

function storyLines(
  record: Record<string, unknown>,
  textKey: string,
  richKey: string,
): StoryLine[] {
  // The rich band is what the page draws when it exists; the plain text is
  // the older single-string model.
  const rich = normalizeBandRichBlocks(record[richKey]);
  if (rich) return richBlockLines(rich);
  const text = sanitizeHeaderFooterText(record[textKey]);
  return text ? text.split("\n").map((line) => ({ text: line, formats: null })) : [];
}

/** Every header/footer story of the document, section by section. */
export function collectHeaderFooterStories(
  attrs: Record<string, unknown>,
): DocumentHeaderFooterStory[] {
  const sections = normalizeSectionBands(attrs.sectionBands);
  const records: Record<string, unknown>[] = sections
    ? sections.map((entry) => entry as Record<string, unknown>)
    : [attrs];
  const stories: DocumentHeaderFooterStory[] = [];
  records.forEach((record, sectionIndex) => {
    for (const [kind, variant, textKey, richKey] of BAND_KEYS) {
      const lines = storyLines(record, textKey, richKey);
      if (!lines.length) continue;
      stories.push({
        key: `${sectionIndex}:${kind}:${variant}`,
        kind,
        variant,
        sectionIndex,
        lines: lines.map((line) => line.text),
        lineFormats: lines.map((line) => line.formats),
      });
    }
  });
  return stories;
}

export interface DocumentHeaderFooterHit extends DocumentFindStoryHit {
  readonly story: DocumentHeaderFooterStory;
  /** The line (paragraph) of the story the hit is on. */
  readonly lineIndex: number;
}

export function findInHeaderFooterStories(
  stories: readonly DocumentHeaderFooterStory[],
  matcher: DocumentFindLineMatcher,
): DocumentHeaderFooterHit[] {
  const hits: DocumentHeaderFooterHit[] = [];
  for (const story of stories) {
    story.lines.forEach((line, lineIndex) => {
      for (const span of matcher(line)) {
        hits.push({
          key: `${story.key}:${lineIndex}:${span.start}`,
          story,
          lineIndex,
          line,
          formats: story.lineFormats?.[lineIndex] ?? null,
          start: span.start,
          end: span.end,
          captures: span.captures,
          namedGroups: span.namedGroups,
        });
      }
    });
  }
  return hits;
}

/**
 * The sheet a section's header/footer opens on: the first sheet of that
 * section (a section starts after each section break), moved to the next
 * sheet for the default story when the section has a different first page.
 */
export function sheetIndexForHeaderFooterStory(
  doc: ProseMirrorNode,
  story: Pick<DocumentHeaderFooterStory, "sectionIndex" | "variant">,
  differentFirstPage: boolean,
): number {
  let sectionsStarted = 0;
  let pageIndex = 0;
  let found = -1;
  let pageCount = 0;
  doc.forEach((page) => {
    if (page.type.name !== "pageBlock") return;
    pageCount += 1;
    if (found < 0 && sectionsStarted >= story.sectionIndex) found = pageIndex;
    page.descendants((node) => {
      if (node.type.name === "sectionBreak") sectionsStarted += 1;
      return true;
    });
    pageIndex += 1;
  });
  const first = Math.max(0, found);
  const last = Math.max(0, pageCount - 1);
  if (story.variant === "even") {
    // The section's first even page: the first page itself when its number
    // (index + 1) is even, unless a different first page takes it. A fixed
    
    const firstIsEven = (first + 1) % 2 === 0;
    const even = firstIsEven && !differentFirstPage ? first : firstIsEven ? first + 2 : first + 1;
    return Math.min(even, last);
  }
  const offset = story.variant === "normal" && differentFirstPage ? 1 : 0;
  return Math.min(first + offset, last);
}

// ---------------------------------------------------------------------------
// Footnotes and endnotes
// ---------------------------------------------------------------------------

export interface DocumentNoteStory {
  readonly id: string;
  readonly stream: NoteStream;
  readonly label: string;
  readonly body: string;
  readonly rich?: FootnoteRichBody;
}

/** The notes that have a reference in the body, in document order. */
export function collectNoteStories(doc: ProseMirrorNode): DocumentNoteStory[] {
  const attrs = (doc.attrs ?? {}) as Record<string, unknown>;
  const streams = numberNoteStreams(
    readFootnotes(doc),
    collectFootnoteRefOrder(doc),
    resolveFootnoteMode(attrs[FOOTNOTE_MODE_ATTR]),
    readNoteSettings(doc),
  );
  return [...streams.footnotes, ...streams.endnotes].map((note) => ({
    id: note.id,
    stream: note.stream,
    label: note.label,
    // The text searched is the text the pane draws: the rich body's, when
    // there is one. The stored plain body collapses runs of whitespace, so
    // its offsets drifted from the rich body's by every doubled space or
    // tab and a replacement hit the wrong characters (OFL-032).
    body: note.rich ? footnoteRichBodyText(note.rich) : note.body,
    rich: note.rich,
  }));
}

export interface DocumentNoteHit extends DocumentFindStoryHit {
  readonly note: DocumentNoteStory;
  /** The span in the note's whole body (paragraphs joined by `\n`). */
  readonly bodyStart: number;
  readonly bodyEnd: number;
}

export function findInNoteStories(
  notes: readonly DocumentNoteStory[],
  matcher: DocumentFindLineMatcher,
): DocumentNoteHit[] {
  const hits: DocumentNoteHit[] = [];
  for (const note of notes) {
    let offset = 0;
    note.body.split("\n").forEach((line, lineIndex) => {
      // The rich body's paragraph for this line, when its text is the line.
      const runs = note.rich?.[lineIndex];
      const formats =
        runs && runs.map((run) => run.text).join("") === line
          ? runLineFormats(runs, (run) => run.text)
          : null;
      // Where the line's formulas stand: a formula is one object character,
      // and a find never reaches into one or takes one with the text around
      // it (a wildcard match across it would replace the formula away).
      const formulaAt = new Set<number>();
      if (runs && formats) {
        let at = 0;
        for (const run of runs) {
          if (isNoteMathRun(run)) formulaAt.add(at);
          at += run.text.length;
        }
      }
      for (const span of matcher(line)) {
        if (formulaAt.size > 0 && [...formulaAt].some((at) => at >= span.start && at < span.end)) continue;
        hits.push({
          key: `${note.id}:${offset + span.start}`,
          note,
          line,
          formats,
          start: span.start,
          end: span.end,
          captures: span.captures,
          namedGroups: span.namedGroups,
          bodyStart: offset + span.start,
          bodyEnd: offset + span.end,
        });
      }
      offset += line.length + 1;
    });
  }
  return hits;
}

export interface DocumentNoteReplacementFormat {
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
}

/**
 * The note body after replacing the given spans (all in one note). Spans are
 * applied from the last to the first so earlier offsets stay valid; the rich
 * body keeps every run's formatting outside the replaced spans, and the
 * replacement takes Replace > Format's font flags when any is set.
 */
export function replaceNoteSpans(
  note: Pick<DocumentNoteStory, "body" | "rich">,
  spans: ReadonlyArray<{ start: number; end: number; text: string }>,
  format: DocumentNoteReplacementFormat = {},
): { body: string; rich: FootnoteRichBody } {
  let body = note.body;
  let rich: FootnoteRichBody | undefined = note.rich;
  const flags: Omit<FootnoteRun, "text"> = {
    ...(format.bold ? { bold: true } : {}),
    ...(format.italic ? { italic: true } : {}),
    ...(format.underline ? { underline: true } : {}),
  };
  const formatted = Object.keys(flags).length > 0;
  const ordered = [...spans].sort((left, right) => right.start - left.start);
  for (const span of ordered) {
    // No Replace > Format: the new text wears the formatting of the text it
    // replaces, as the body's own replace does (a bold BETA in an endnote
    
    const inherited = formatted ? flags : footnoteRunFlagsAt(body, rich, span.start);
    const replacementRich: FootnoteRichBody | undefined = span.text
      ? [[{ text: span.text, ...inherited }]]
      : undefined;
    rich = spliceFootnoteRichBody(
      body,
      rich,
      span.start,
      span.end,
      span.text,
      replacementRich,
    );
    body = body.slice(0, span.start) + span.text + body.slice(span.end);
  }
  return { body, rich: rich ?? [] };
}
