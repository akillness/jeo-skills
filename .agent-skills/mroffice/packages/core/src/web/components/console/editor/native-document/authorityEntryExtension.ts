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
  normalizeAuthorityCategory,
  type AuthorityCategoryNumber,
} from "./documentAuthoritySettings";
import {
  parseExportedBookmarkName,
  sanitizeBookmarkName,
} from "./bookmarks";
import { collapsedFieldEntryRange } from "./fieldEntryAnchor";

export const AUTHORITY_ENTRY_MARK_NAME = "authorityEntry";
export const MAX_AUTHORITY_LONG_CITATION_LENGTH = 240;
export const MAX_AUTHORITY_SHORT_CITATION_LENGTH = 120;

export interface AuthorityEntryAttributes {
  longCitation: string;
  shortCitation: string;
  category: AuthorityCategoryNumber;
  pageRangeBookmark: string;
  boldPageNumber: boolean;
  italicPageNumber: boolean;
}

export type AuthorityEntryCommandInput =
  | string
  | Partial<AuthorityEntryAttributes>
  | null
  | undefined;

const AUTHORITY_TEXT_CONTROL_RE = /[\x00-\x1f\x7f-\x9f]/g;

export function sanitizeAuthorityCitation(
  value: unknown,
  maxLength = MAX_AUTHORITY_LONG_CITATION_LENGTH,
): string {
  if (typeof value !== "string") return "";
  return value
    .replace(AUTHORITY_TEXT_CONTROL_RE, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function normalizeAuthorityEntryAttributes(
  value: AuthorityEntryCommandInput | Record<string, unknown>,
  fallbackCitation = "",
): AuthorityEntryAttributes {
  const candidate: Record<string, unknown> =
    typeof value === "string"
      ? { longCitation: value }
      : value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
  const longCitation =
    sanitizeAuthorityCitation(candidate.longCitation) ||
    sanitizeAuthorityCitation(fallbackCitation);
  const shortCitation =
    sanitizeAuthorityCitation(
      candidate.shortCitation,
      MAX_AUTHORITY_SHORT_CITATION_LENGTH,
    ) || longCitation.slice(0, MAX_AUTHORITY_SHORT_CITATION_LENGTH);
  return {
    longCitation,
    shortCitation,
    category: normalizeAuthorityCategory(candidate.category),
    pageRangeBookmark:
      parseExportedBookmarkName(candidate.pageRangeBookmark) ||
      sanitizeBookmarkName(candidate.pageRangeBookmark),
    boldPageNumber: candidate.boldPageNumber === true,
    italicPageNumber: candidate.italicPageNumber === true,
  };
}

function quoteAuthorityArgument(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function authorityEntryFieldInstruction(
  value: AuthorityEntryCommandInput | Record<string, unknown>,
  fallbackCitation = "",
  exportedPageRangeBookmark?: string,
): string | null {
  const attrs = normalizeAuthorityEntryAttributes(value, fallbackCitation);
  if (!attrs.longCitation) return null;
  const parts = [
    "TA",
    `\\l ${quoteAuthorityArgument(attrs.longCitation)}`,
    `\\s ${quoteAuthorityArgument(attrs.shortCitation)}`,
    `\\c "${attrs.category}"`,
  ];
  const pageRange =
    sanitizeBookmarkName(exportedPageRangeBookmark) || attrs.pageRangeBookmark;
  if (pageRange) parts.push(`\\r ${quoteAuthorityArgument(pageRange)}`);
  if (attrs.boldPageNumber) parts.push("\\b");
  if (attrs.italicPageNumber) parts.push("\\i");
  return ` ${parts.join(" ")} `;
}

function tokenizeAuthorityEntryInstruction(value: string): string[] {
  const tokens: string[] = [];
  const pattern = /"((?:\\.|[^"\\])*)"|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    tokens.push(
      match[1] !== undefined
        ? match[1].replace(/\\(["\\])/g, "$1")
        : match[2],
    );
  }
  return tokens;
}

export function parseAuthorityEntryFieldInstruction(
  instruction: string,
): AuthorityEntryAttributes | null {
  const tokens = tokenizeAuthorityEntryInstruction(instruction.trim());
  if (tokens[0]?.toUpperCase() !== "TA") return null;
  const candidate: Partial<AuthorityEntryAttributes> = {};
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index]?.toLowerCase();
    if (token === "\\*") {
      if (tokens[index + 1]?.toUpperCase() !== "MERGEFORMAT") return null;
      index += 1;
    } else if (token === "\\l" && tokens[index + 1]) {
      candidate.longCitation = tokens[++index];
    } else if (token === "\\s" && tokens[index + 1]) {
      candidate.shortCitation = tokens[++index];
    } else if (token === "\\c" && tokens[index + 1]) {
      const raw = tokens[++index];
      const parsed = Number.parseInt(raw, 10);
      if (String(parsed) !== raw || parsed < 1 || parsed > 16) return null;
      candidate.category = parsed as AuthorityCategoryNumber;
    } else if (token === "\\r" && tokens[index + 1]) {
      candidate.pageRangeBookmark = tokens[++index];
    } else if (token === "\\b") {
      candidate.boldPageNumber = true;
    } else if (token === "\\i") {
      candidate.italicPageNumber = true;
    } else if (!token?.startsWith("\\") && !candidate.longCitation) {
      candidate.longCitation = tokens[index];
    } else {
      return null;
    }
  }
  const normalized = normalizeAuthorityEntryAttributes(candidate);
  return normalized.longCitation ? normalized : null;
}

interface AuthorityRange {
  readonly from: number;
  readonly to: number;
}

function authorityRangesForText(
  doc: ProseMirrorNode,
  needles: readonly string[],
): AuthorityRange[] {
  const normalizedNeedles = [...new Set(needles.map((value) => sanitizeAuthorityCitation(value)).filter(Boolean))];
  const ranges: AuthorityRange[] = [];
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
    for (const needle of normalizedNeedles) {
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
    }
    return false;
  });
  return [...new Map(ranges.map((range) => [`${range.from}:${range.to}`, range])).values()].sort(
    (left, right) => left.from - right.from || left.to - right.to,
  );
}

export interface AuthorityEntrySummary {
  longCitation: string;
  count: number;
}

export function collectAuthorityEntries(
  doc: unknown,
  category: unknown,
): AuthorityEntrySummary[] {
  const normalizedCategory = normalizeAuthorityCategory(category);
  const entries = new Map<string, AuthorityEntrySummary>();
  let previousKey: string | null = null;
  const visit = (node: JSONContent): void => {
    if (!node || typeof node !== "object") return;
    if (node.type === "text") {
      const mark = (Array.isArray(node.marks) ? node.marks : []).find(
        (candidate) => candidate?.type === AUTHORITY_ENTRY_MARK_NAME,
      );
      const attrs = mark
        ? normalizeAuthorityEntryAttributes(mark.attrs ?? {}, node.text ?? "")
        : null;
      const key =
        attrs && attrs.category === normalizedCategory
          ? attrs.longCitation.toLocaleLowerCase()
          : "";
      if (attrs?.longCitation && key && key !== previousKey) {
        const existing = entries.get(key);
        if (existing) existing.count += 1;
        else entries.set(key, { longCitation: attrs.longCitation, count: 1 });
      }
      previousKey = key || null;
      return;
    }
    previousKey = null;
    if (Array.isArray(node.content)) node.content.forEach(visit);
  };
  if (doc && typeof doc === "object") visit(doc as JSONContent);
  return [...entries.values()].sort((left, right) =>
    left.longCitation.localeCompare(right.longCitation),
  );
}

export function formatAuthorityEntriesPreview(
  entries: readonly AuthorityEntrySummary[],
  fallback: string,
): string {
  if (entries.length === 0) return fallback;
  return entries
    .map((entry) =>
      entry.count > 1
        ? `${entry.longCitation} (${entry.count})`
        : entry.longCitation,
    )
    .join(" · ")
    .slice(0, 256);
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    documentAuthorities: {
      markAuthorityEntry: (entry: AuthorityEntryCommandInput) => ReturnType;
      markAllAuthorityEntries: (entry: AuthorityEntryCommandInput) => ReturnType;
      unsetAuthorityEntry: () => ReturnType;
    };
  }
}

const AuthorityEntryMark = Mark.create({
  name: AUTHORITY_ENTRY_MARK_NAME,
  excludes: AUTHORITY_ENTRY_MARK_NAME,
  // Non-inclusive: Word's XE / TA field marks ONE position, right after the
  // text it follows; typing after that text writes after the field and does
  // not grow the entry (corpus R27-D24: text typed after an index entry at a
  // link's end). The mark is how the page shows that position, as a link's
  // mark does not grow by typing after it.
  inclusive: false,

  addAttributes() {
    return {
      longCitation: {
        default: "",
        parseHTML: (element: HTMLElement) =>
          sanitizeAuthorityCitation(
            element.getAttribute("data-authority-long-citation"),
          ),
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-authority-long-citation": normalizeAuthorityEntryAttributes(
            attrs,
          ).longCitation,
        }),
      },
      shortCitation: {
        default: "",
        parseHTML: (element: HTMLElement) =>
          sanitizeAuthorityCitation(
            element.getAttribute("data-authority-short-citation"),
            MAX_AUTHORITY_SHORT_CITATION_LENGTH,
          ),
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-authority-short-citation": normalizeAuthorityEntryAttributes(
            attrs,
          ).shortCitation,
        }),
      },
      category: {
        default: 1,
        parseHTML: (element: HTMLElement) =>
          normalizeAuthorityCategory(
            element.getAttribute("data-authority-category"),
          ),
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-authority-category": String(
            normalizeAuthorityEntryAttributes(attrs).category,
          ),
        }),
      },
      pageRangeBookmark: {
        default: "",
        parseHTML: (element: HTMLElement) =>
          parseExportedBookmarkName(
            element.getAttribute("data-authority-page-range-bookmark"),
          ) ||
          sanitizeBookmarkName(
            element.getAttribute("data-authority-page-range-bookmark"),
          ),
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-authority-page-range-bookmark":
            normalizeAuthorityEntryAttributes(attrs).pageRangeBookmark,
        }),
      },
      boldPageNumber: {
        default: false,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-authority-bold-page-number") === "true",
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-authority-bold-page-number": String(
            normalizeAuthorityEntryAttributes(attrs).boldPageNumber,
          ),
        }),
      },
      italicPageNumber: {
        default: false,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-authority-italic-page-number") === "true",
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-authority-italic-page-number": String(
            normalizeAuthorityEntryAttributes(attrs).italicPageNumber,
          ),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-authority-long-citation]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: "mrnote-index-entry mrnote-authority-entry",
      }),
      0,
    ];
  },

  addCommands() {
    return {
      markAuthorityEntry:
        (entry: AuthorityEntryCommandInput) =>
        ({ editor, state, tr, dispatch, chain }) => {
          if (!editor.isEditable) return false;
          const attrs = normalizeAuthorityEntryAttributes(entry);
          if (!attrs.longCitation) return false;
          if (state.selection.empty) {
            // Word's Mark Citation with nothing selected puts the TA field at
            // the insertion point.
            const markType = state.schema.marks[AUTHORITY_ENTRY_MARK_NAME];
            const range = collapsedFieldEntryRange(state);
            if (!markType || !range) return false;
            if (dispatch) {
              tr.addMark(range.from, range.to, markType.create(attrs));
              dispatch(tr);
            }
            return true;
          }
          return chain().setMark(AUTHORITY_ENTRY_MARK_NAME, attrs).run();
        },
      markAllAuthorityEntries:
        (entry: AuthorityEntryCommandInput) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const attrs = normalizeAuthorityEntryAttributes(entry);
          const markType = state.schema.marks[AUTHORITY_ENTRY_MARK_NAME];
          const ranges = authorityRangesForText(state.doc, [
            attrs.longCitation,
            attrs.shortCitation,
          ]);
          if (!markType || !attrs.longCitation || ranges.length === 0) return false;
          if (dispatch) {
            for (const range of ranges) {
              tr.addMark(range.from, range.to, markType.create(attrs));
            }
            dispatch(tr);
          }
          return true;
        },
      unsetAuthorityEntry:
        () =>
        ({ editor, chain }) =>
          editor.isEditable &&
          chain()
            .unsetMark(AUTHORITY_ENTRY_MARK_NAME, {
              extendEmptyMarkRange: true,
            })
            .run(),
    };
  },
});

export const DocumentAuthorityEntry = AuthorityEntryMark;
export default DocumentAuthorityEntry;
