"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Mark, mergeAttributes } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  parseExportedBookmarkName,
  sanitizeBookmarkName,
} from "./bookmarks";
import { collapsedFieldEntryRange } from "./fieldEntryAnchor";

/**
 * DOCUMENT INDEX (Word/WPS "Mark Index Entry" `XE` + "Insert Index" `INDEX`) —
 * TipTap wiring + the PURE index-collection helper.
 *
 * Word marks an index entry by wrapping a term with a hidden `XE` field; the
 * "Insert Index" command later scans every `XE` mark, sorts the terms and emits
 * an alphabetized `INDEX` field. This is the in-app analogue:
 *   • A `markIndexEntry(term)` command applies ONE inline "indexEntry" mark to
 *     the selection (or arms it at the cursor), carrying a sanitized `term`.
 *   • {@link collectIndexEntries} walks the document JSON, gathers every distinct
 *     term, counts its occurrences and returns them sorted — the data the
 *     toolbar's "Insert Index" turns into a block of paragraphs.
 *
 * ADDITIVE: registering this adds ONE inline mark carrying a sanitized `term`.
 * It round-trips through the document schema's open `marks` passthrough (see
 * lib/native-page-schemas.ts), so EXISTING documents — which carry none — still
 * validate and load byte-for-byte unchanged. No flag: opt-in per user action.
 *
 * SECURITY: the `term` is sanitized to a single-line, length-clamped string with
 * control bytes stripped (see {@link sanitizeIndexTerm}); render only ever sets a
 * `data-index-term` attribute (no inline CSS / HTML from user input), so no
 * injection is possible. The visible text is the marked run itself.
 */

/** The inline mark name for a marked index entry (Word `XE`). */
export const INDEX_ENTRY_MARK_NAME = "indexEntry";

/** Max length of an index term (mirrors the bookmark / caption clamps). */
export const MAX_INDEX_TERM_LENGTH = 120;

export const INDEX_ENTRY_REFERENCE_MODES = [
  "page",
  "pageRange",
  "crossReference",
] as const;
export type IndexEntryReferenceMode =
  (typeof INDEX_ENTRY_REFERENCE_MODES)[number];

/** Closed editable authority for the supported native Word `XE` switches. */
export interface IndexEntryAttributes {
  term: string;
  referenceMode: IndexEntryReferenceMode;
  crossReference: string;
  pageRangeBookmark: string;
  boldPageNumber: boolean;
  italicPageNumber: boolean;
}

export type IndexEntryCommandInput =
  | string
  | Partial<IndexEntryAttributes>
  | null
  | undefined;

const INDEX_TERM_CONTROL_CHARS_RE = /[\x00-\x1f\x7f-\x9f]/g;

/**
 * Scrub an index term to a single-line, trimmed, length-clamped string: strip
 * control bytes, collapse whitespace, clamp. Returns "" when nothing usable
 * remains (the caller then falls back to the marked text).
 */
export function sanitizeIndexTerm(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(INDEX_TERM_CONTROL_CHARS_RE, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_INDEX_TERM_LENGTH);
}

/** Compose Word's native `Main:Subentry` XE operand without leaking controls. */
export function composeIndexTerm(mainEntry: unknown, subentry: unknown): string {
  const main = sanitizeIndexTerm(mainEntry);
  if (!main) return "";
  const child = sanitizeIndexTerm(subentry);
  return sanitizeIndexTerm(child ? `${main}:${child}` : main);
}

function normalizeIndexReferenceMode(value: unknown): IndexEntryReferenceMode {
  return typeof value === "string" &&
    (INDEX_ENTRY_REFERENCE_MODES as readonly string[]).includes(value)
    ? (value as IndexEntryReferenceMode)
    : "page";
}

/** Normalize a page-range bookmark back to the editor's display namespace. */
export function normalizeIndexPageRangeBookmark(value: unknown): string {
  return parseExportedBookmarkName(value) || sanitizeBookmarkName(value);
}

/**
 * Normalize one index-entry mark. Mutually-exclusive page/cross-reference/range
 * semantics are resolved here so no caller can persist contradictory switches.
 */
export function normalizeIndexEntryAttributes(
  value: IndexEntryCommandInput | Record<string, unknown>,
  fallbackTerm = "",
): IndexEntryAttributes {
  const candidate: Record<string, unknown> =
    typeof value === "string"
      ? { term: value }
      : value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
  const term =
    sanitizeIndexTerm(candidate.term) || sanitizeIndexTerm(fallbackTerm);
  const crossReference = sanitizeIndexTerm(candidate.crossReference);
  const pageRangeBookmark = normalizeIndexPageRangeBookmark(
    candidate.pageRangeBookmark,
  );
  const requestedMode = normalizeIndexReferenceMode(candidate.referenceMode);
  const referenceMode: IndexEntryReferenceMode =
    requestedMode === "crossReference" && crossReference
      ? "crossReference"
      : requestedMode === "pageRange" && pageRangeBookmark
        ? "pageRange"
        : "page";
  return {
    term,
    referenceMode,
    crossReference: referenceMode === "crossReference" ? crossReference : "",
    pageRangeBookmark:
      referenceMode === "pageRange" ? pageRangeBookmark : "",
    boldPageNumber:
      referenceMode !== "crossReference" && candidate.boldPageNumber === true,
    italicPageNumber:
      referenceMode !== "crossReference" &&
      candidate.italicPageNumber === true,
  };
}

function quoteIndexFieldArgument(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Build one closed native XE instruction. `exportedPageRangeBookmark` lets a
 * writer resolve the editor's display bookmark through its document plan.
 */
export function indexEntryFieldInstruction(
  value: IndexEntryCommandInput | Record<string, unknown>,
  fallbackTerm = "",
  exportedPageRangeBookmark?: string,
): string | null {
  const attrs = normalizeIndexEntryAttributes(value, fallbackTerm);
  if (!attrs.term) return null;
  const switches: string[] = [];
  if (attrs.referenceMode === "crossReference") {
    switches.push(`\\t ${quoteIndexFieldArgument(attrs.crossReference)}`);
  } else if (attrs.referenceMode === "pageRange") {
    const bookmark =
      sanitizeBookmarkName(exportedPageRangeBookmark) ||
      attrs.pageRangeBookmark;
    switches.push(`\\r ${quoteIndexFieldArgument(bookmark)}`);
  }
  if (attrs.boldPageNumber) switches.push("\\b");
  if (attrs.italicPageNumber) switches.push("\\i");
  return ` XE ${quoteIndexFieldArgument(attrs.term)}${
    switches.length ? ` ${switches.join(" ")}` : ""
  } `;
}

function indexFieldInstructionTokens(value: string): string[] {
  const tokens: string[] = [];
  const tokenPattern = /"((?:\\.|[^"\\])*)"|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(value)) !== null) {
    tokens.push(
      match[1] !== undefined
        ? match[1].replace(/\\(["\\])/g, "$1")
        : match[2],
    );
  }
  return tokens;
}

/** Parse only the supported native XE grammar into the closed editor attrs. */
export function parseIndexEntryFieldInstruction(
  instruction: string,
): IndexEntryAttributes | null {
  const tokens = indexFieldInstructionTokens(instruction.trim());
  if (tokens.length < 2 || tokens[0]?.toUpperCase() !== "XE") return null;
  const candidate: Partial<IndexEntryAttributes> = {
    term: tokens[1],
    referenceMode: "page",
    boldPageNumber: false,
    italicPageNumber: false,
  };
  for (let index = 2; index < tokens.length; index += 1) {
    const token = tokens[index]?.toLowerCase();
    if (token === "\\t" && tokens[index + 1]) {
      candidate.referenceMode = "crossReference";
      candidate.crossReference = tokens[index + 1];
      index += 1;
    } else if (token === "\\r" && tokens[index + 1]) {
      candidate.referenceMode = "pageRange";
      candidate.pageRangeBookmark = tokens[index + 1];
      index += 1;
    } else if (token === "\\b") {
      candidate.boldPageNumber = true;
    } else if (token === "\\i") {
      candidate.italicPageNumber = true;
    }
  }
  const normalized = normalizeIndexEntryAttributes(candidate);
  return normalized.term ? normalized : null;
}

/** One collected index entry: the display term + how many times it was marked. */
export interface IndexEntry {
  term: string;
  count: number;
}

/** Compact live result used by the selected INDEX field inside the editor. */
export function formatIndexEntriesPreview(
  entries: readonly IndexEntry[],
  fallback: string,
): string {
  if (entries.length === 0) return fallback;
  return entries
    .map((entry) =>
      entry.count > 1 ? `${entry.term} (${entry.count})` : entry.term,
    )
    .join(" · ")
    .slice(0, 256);
}

export interface IndexEntryRange {
  readonly from: number;
  readonly to: number;
}

/**
 * Locate exact visible occurrences inside text blocks for Word's “Mark All”.
 * Inline atoms split the searchable stream, so a match can span formatting
 * runs but never cross an image/field/hard-break or a paragraph boundary.
 */
/** One row of Word's AutoMark concordance file. */
export interface IndexConcordanceRow {
  /** The text to find (case-sensitive, whole words). */
  text: string;
  /** The index entry to mark it with ("Main:Sub" for a subentry). */
  entry: string;
}

/**
 * Read a concordance list the way Word's AutoMark reads its concordance
 * table: one row per line, the text to find in the first column and the
 * index entry in the second (tab-separated, or a comma/semicolon when there
 * is no tab); an empty second column indexes the text itself.
 */
export function parseIndexConcordance(value: string): IndexConcordanceRow[] {
  const rows: IndexConcordanceRow[] = [];
  const seen = new Set<string>();
  for (const line of value.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const split = line.includes("\t")
      ? line.split("\t")
      : line.split(/[,;，；]/);
    const text = sanitizeIndexTerm(split[0]);
    const entry = sanitizeIndexTerm(split.slice(1).join(" ")) || text;
    if (!text || !entry || seen.has(text)) continue;
    seen.add(text);
    rows.push({ text, entry });
    if (rows.length >= 500) break;
  }
  return rows;
}

const WORD_CHARACTER_RE = /[\p{L}\p{N}_]/u;
const CJK_CHARACTER_RE = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/u;

/**
 * Word's AutoMark: for every concordance row, mark the FIRST occurrence of
 * its text in each paragraph (exact case, whole words; CJK text matches
 * anywhere) with an XE entry. Returns the ranges to mark.
 */
export function indexConcordanceRanges(
  doc: ProseMirrorNode,
  rows: readonly IndexConcordanceRow[],
): Array<IndexEntryRange & { entry: string }> {
  const out: Array<IndexEntryRange & { entry: string }> = [];
  doc.descendants((node, nodePos) => {
    if (!node.isTextblock) return true;
    let searchable = "";
    const positions: number[] = [];
    node.descendants((child, offset) => {
      if (child.isText && child.text) {
        for (let index = 0; index < child.text.length; index += 1) {
          searchable += child.text[index];
          positions.push(nodePos + 1 + offset + index);
        }
        return false;
      }
      if (child.isInline) {
        searchable += "\uFFFC";
        positions.push(-1);
        return false;
      }
      return true;
    });
    for (const row of rows) {
      let from = 0;
      while (from <= searchable.length - row.text.length) {
        const found = searchable.indexOf(row.text, from);
        if (found < 0) break;
        from = found + 1;
        const before = searchable[found - 1] ?? "";
        const after = searchable[found + row.text.length] ?? "";
        const cjk = CJK_CHARACTER_RE.test(row.text);
        if (
          !cjk &&
          ((before && WORD_CHARACTER_RE.test(before)) ||
            (after && WORD_CHARACTER_RE.test(after)))
        ) {
          continue;
        }
        const first = positions[found];
        const last = positions[found + row.text.length - 1];
        if (first < 0 || last - first + 1 !== row.text.length) continue;
        out.push({ from: first, to: last + 1, entry: row.entry });
        break;
      }
    }
    return false;
  });
  return out;
}

function indexEntryRangesForText(
  doc: ProseMirrorNode,
  matchText: string,
): IndexEntryRange[] {
  const needle = sanitizeIndexTerm(matchText);
  if (!needle) return [];
  const ranges: IndexEntryRange[] = [];

  doc.descendants((node, nodePos) => {
    if (!node.isTextblock) return true;
    let searchable = "";
    const positions: number[] = [];
    node.descendants((child, offset) => {
      if (child.isText && child.text) {
        for (let index = 0; index < child.text.length; index += 1) {
          searchable += child.text[index];
          positions.push(nodePos + 1 + offset + index);
        }
        return false;
      }
      if (child.isInline) {
        searchable += "\uFFFC";
        positions.push(-1);
        return false;
      }
      return true;
    });

    let searchFrom = 0;
    while (searchFrom <= searchable.length - needle.length) {
      const found = searchable.indexOf(needle, searchFrom);
      if (found < 0) break;
      const first = positions[found];
      const last = positions[found + needle.length - 1];
      if (first >= 0 && last >= first && last - first + 1 === needle.length) {
        ranges.push({ from: first, to: last + 1 });
      }
      searchFrom = found + Math.max(needle.length, 1);
    }
    return false;
  });
  return ranges;
}

/**
 * Locale-agnostic-ish sort key for an index term: lowercased + trimmed so case
 * never splits an entry into two. (Display keeps the first-seen casing.)
 */
function indexSortKey(term: string): string {
  return term.toLowerCase();
}

/**
 * Walk a document JSON tree and collect every distinct index term carried by an
 * `indexEntry` mark, counting occurrences and sorting alphabetically
 * (case-insensitive, then by raw term for stability). A mark with an empty/blank
 * stored `term` falls back to the marked run's own text. Adjacent text nodes that
 * share the SAME term (one logical marked span split across runs by other marks)
 * are counted ONCE, matching what the reader perceives as a single entry.
 * Returns [] for a document with no index marks. PURE.
 */
export function collectIndexEntries(doc: unknown): IndexEntry[] {
  // term(display) -> count. We also remember the first-seen display casing.
  const byKey = new Map<string, { term: string; count: number }>();
  // Track the term of the immediately-preceding text node so a single span that
  // was split into multiple adjacent text nodes counts once.
  let prevTerm: string | null = null;

  const visit = (node: JSONContent): void => {
    if (!node || typeof node !== "object") return;
    if (node.type === "text") {
      const marks = Array.isArray(node.marks) ? node.marks : [];
      let term: string | null = null;
      for (const mark of marks) {
        if (!mark || typeof mark !== "object") continue;
        if ((mark as { type?: unknown }).type !== INDEX_ENTRY_MARK_NAME) continue;
        const attrs =
          (mark as { attrs?: unknown }).attrs &&
          typeof (mark as { attrs?: unknown }).attrs === "object"
            ? ((mark as { attrs?: Record<string, unknown> }).attrs as Record<
                string,
                unknown
              >)
            : {};
        term =
          sanitizeIndexTerm(attrs.term) ||
          sanitizeIndexTerm(typeof node.text === "string" ? node.text : "");
        break;
      }
      if (term) {
        // Same term as the previous adjacent text node → part of one span, skip.
        if (term !== prevTerm) {
          const key = indexSortKey(term);
          const existing = byKey.get(key);
          if (existing) existing.count += 1;
          else byKey.set(key, { term, count: 1 });
        }
        prevTerm = term;
      } else {
        prevTerm = null;
      }
      return;
    }
    // A non-text node breaks span adjacency.
    prevTerm = null;
    if (Array.isArray(node.content)) {
      for (const child of node.content) visit(child);
    }
  };

  if (doc && typeof doc === "object") visit(doc as JSONContent);

  return [...byKey.values()].sort((a, b) => {
    const ka = indexSortKey(a.term);
    const kb = indexSortKey(b.term);
    if (ka < kb) return -1;
    if (ka > kb) return 1;
    return a.term < b.term ? -1 : a.term > b.term ? 1 : 0;
  });
}

/**
 * Build the document content (an array of block nodes) for an "Insert Index":
 * a heading line followed by one paragraph per sorted entry (term, plus a
 * "(×N)" multiplicity when an entry was marked more than once). Returns just the
 * heading + an "empty" note when no entries exist, so the command always inserts
 * something visible. PURE — the toolbar passes the result to `insertContent`.
 */
export function buildIndexContent(
  entries: IndexEntry[],
  labels: { title: string; empty: string },
): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: labels.title }],
    },
  ];
  if (entries.length === 0) {
    blocks.push({
      type: "paragraph",
      content: [{ type: "text", text: labels.empty }],
    });
    return blocks;
  }
  for (const entry of entries) {
    const text = entry.count > 1 ? `${entry.term} (×${entry.count})` : entry.term;
    blocks.push({
      type: "paragraph",
      content: [{ type: "text", text }],
    });
  }
  return blocks;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    documentIndex: {
      /**
       * Mark the current selection (or arm the cursor) as an index entry. An
       * optional explicit `term` overrides the marked text as the index key;
       * when omitted the marked run's own text is used at collection time.
       */
      markIndexEntry: (entry?: IndexEntryCommandInput) => ReturnType;
      /** Mark every exact visible occurrence of `matchText` with one XE key. */
      markAllIndexEntries: (
        entry: IndexEntryCommandInput,
        matchText: string,
      ) => ReturnType;
      /** Word's AutoMark: mark concordance rows, first hit per paragraph. */
      autoMarkIndexEntries: (rows: readonly IndexConcordanceRow[]) => ReturnType;
      /** Remove the index-entry mark from the current selection. */
      unsetIndexEntry: () => ReturnType;
    };
  }
}

const IndexEntryMark = Mark.create({
  name: INDEX_ENTRY_MARK_NAME,
  // Re-marking a run replaces the term (one index key per run).
  excludes: INDEX_ENTRY_MARK_NAME,
  // Non-inclusive: Word's XE / TA field marks ONE position, right after the
  // text it follows; typing after that text writes after the field and does
  // not grow the entry (corpus R27-D24: text typed after an index entry at a
  // link's end). The mark is how the page shows that position, as a link's
  // mark does not grow by typing after it.
  inclusive: false,

  addAttributes() {
    return {
      term: {
        default: "",
        parseHTML: (element: HTMLElement) =>
          sanitizeIndexTerm(element.getAttribute("data-index-term")),
        renderHTML: (attrs: Record<string, unknown>) => {
          const term = sanitizeIndexTerm(attrs.term);
          // Emit the data attribute even when empty so the mark's span is
          // distinguishable on round-trip; an empty term defers to the run text.
          return { "data-index-term": term };
        },
      },
      referenceMode: {
        default: "page",
        parseHTML: (element: HTMLElement) =>
          normalizeIndexReferenceMode(
            element.getAttribute("data-index-reference-mode"),
          ),
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-index-reference-mode": normalizeIndexEntryAttributes(attrs)
            .referenceMode,
        }),
      },
      crossReference: {
        default: "",
        parseHTML: (element: HTMLElement) =>
          sanitizeIndexTerm(element.getAttribute("data-index-cross-reference")),
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-index-cross-reference": normalizeIndexEntryAttributes(attrs)
            .crossReference,
        }),
      },
      pageRangeBookmark: {
        default: "",
        parseHTML: (element: HTMLElement) =>
          normalizeIndexPageRangeBookmark(
            element.getAttribute("data-index-page-range-bookmark"),
          ),
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-index-page-range-bookmark": normalizeIndexEntryAttributes(attrs)
            .pageRangeBookmark,
        }),
      },
      boldPageNumber: {
        default: false,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-index-bold-page-number") === "true",
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-index-bold-page-number": normalizeIndexEntryAttributes(attrs)
            .boldPageNumber
            ? "true"
            : "false",
        }),
      },
      italicPageNumber: {
        default: false,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-index-italic-page-number") === "true",
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-index-italic-page-number": normalizeIndexEntryAttributes(attrs)
            .italicPageNumber
            ? "true"
            : "false",
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-index-term]" }];
  },

  renderHTML({ HTMLAttributes }) {
    // A subtle dotted underline cues the marked entry in-editor; it is a fixed
    // developer-authored class hook, never user input.
    return [
      "span",
      mergeAttributes(HTMLAttributes, { class: "mrnote-index-entry" }),
      0,
    ];
  },

  addCommands() {
    return {
      markIndexEntry:
        (entry?: IndexEntryCommandInput) =>
        ({ editor, state, tr, dispatch, chain }) => {
          if (!editor.isEditable) return false;
          const attrs = normalizeIndexEntryAttributes(entry);
          if (state.selection.empty) {
            // Word marks the insertion point itself; a stored mark here
            // would mark nothing until the next keystroke.
            const markType = state.schema.marks[INDEX_ENTRY_MARK_NAME];
            const range = collapsedFieldEntryRange(state);
            if (!markType || !range) return false;
            if (dispatch) {
              tr.addMark(range.from, range.to, markType.create(attrs));
              dispatch(tr);
            }
            return true;
          }
          return chain().setMark(INDEX_ENTRY_MARK_NAME, attrs).run();
        },
      markAllIndexEntries:
        (entry: IndexEntryCommandInput, matchText: string) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const markType = state.schema.marks[INDEX_ENTRY_MARK_NAME];
          const attrs = normalizeIndexEntryAttributes(entry);
          const ranges = indexEntryRangesForText(state.doc, matchText);
          if (!markType || !attrs.term || ranges.length === 0) return false;
          if (dispatch) {
            for (const range of ranges) {
              tr.addMark(range.from, range.to, markType.create(attrs));
            }
            dispatch(tr);
          }
          return true;
        },
      autoMarkIndexEntries:
        (rows: readonly IndexConcordanceRow[]) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const markType = state.schema.marks[INDEX_ENTRY_MARK_NAME];
          if (!markType) return false;
          const ranges = indexConcordanceRanges(state.doc, rows);
          if (ranges.length === 0) return false;
          if (dispatch) {
            for (const range of ranges) {
              tr.addMark(
                range.from,
                range.to,
                markType.create(normalizeIndexEntryAttributes(range.entry)),
              );
            }
            dispatch(tr);
          }
          return true;
        },
      unsetIndexEntry:
        () =>
        ({ editor, chain }) =>
          editor.isEditable &&
          chain()
            .unsetMark(INDEX_ENTRY_MARK_NAME, { extendEmptyMarkRange: true })
            .run(),
    };
  },
});

export const DocumentIndexEntry = IndexEntryMark;

export default DocumentIndexEntry;
