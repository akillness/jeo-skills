/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import {
  AUTHORITY_ENTRY_MARK_NAME,
  normalizeAuthorityEntryAttributes,
} from "@mrnote/core/web/components/console/editor/native-document/authorityEntryExtension.ts";
import {
  normalizeAuthorityTableSettings,
  type AuthorityTableSettings,
} from "@mrnote/core/web/components/console/editor/native-document/documentAuthoritySettings.ts";
import { BOOKMARK_MARK_NAME, BOOKMARK_POINT_NODE_NAME, sanitizeBookmarkName } from "@mrnote/core/web/components/console/editor/native-document/bookmarks.ts";
import { normalizeIndexSettings, type IndexSettings } from "@mrnote/core/web/components/console/editor/native-document/documentIndexSettings.ts";
import {
  INDEX_ENTRY_MARK_NAME,
  normalizeIndexEntryAttributes,
} from "@mrnote/core/web/components/console/editor/native-document/indexEntryExtension.ts";
import { indexFormatHasHeadings } from "@mrnote/core/web/lib/document-export/referenceListWordCatalog.ts";

/**
 * The RESULT of Word's INDEX and TOA fields, laid out from the live document:
 * every marked entry with the pages it is marked on, sorted, grouped and
 * punctuated by the field's own switches. The field used to show a one-line
 * summary ("Apples (3) · Zebra"); Word shows the index itself.
 */

/** One page reference of an entry: "4", or "4–6" for a bookmarked range. */
export interface ReferencePage {
  label: string;
  bold: boolean;
  italic: boolean;
}

export interface IndexLayoutEntry {
  text: string;
  /** 1 = main entry, 2 = subentry. */
  level: 1 | 2;
  pages: ReferencePage[];
  /** "See also …" texts of cross-reference marks. */
  crossReferences: string[];
}

export interface IndexLayoutGroup {
  /** The letter heading (formats with `\h`), or null. */
  heading: string | null;
  entries: IndexLayoutEntry[];
}

interface MarkedRun {
  page: number;
  marks: readonly { type: { name: string }; attrs: Record<string, unknown> }[];
  text: string;
}

interface DocumentWalk {
  runs: MarkedRun[];
  /** Bookmark name → the first and last page it covers. */
  bookmarkPages: Map<string, [number, number]>;
}

/** Page numbers as the table of contents and captions count them. */
function walkDocument(doc: ProseMirrorNode, markName: string): DocumentWalk {
  let hasPageBlocks = false;
  doc.forEach((child) => {
    if (child.type.name === "pageBlock") hasPageBlocks = true;
  });
  let page = hasPageBlocks ? 0 : 1;
  const runs: MarkedRun[] = [];
  const bookmarkPages = new Map<string, [number, number]>();
  const seeBookmark = (rawName: unknown) => {
    const name = sanitizeBookmarkName(rawName);
    if (!name) return;
    const at = Math.max(1, page);
    const known = bookmarkPages.get(name);
    if (known) known[1] = Math.max(known[1], at);
    else bookmarkPages.set(name, [at, at]);
  };
  doc.descendants((node) => {
    const name = node.type.name;
    if (name === "pageBlock") page += 1;
    else if (!hasPageBlocks && (name === "pageBreak" || name === "sourcePageBreak")) {
      page += 1;
    } else if (
      !hasPageBlocks &&
      name !== "sourcePageBreak" &&
      node.attrs?.sourcePageBreakBefore === true
    ) {
      page += 1;
    }
    if (name === BOOKMARK_POINT_NODE_NAME) seeBookmark(node.attrs?.name);
    if (!node.isText) {
      // A non-text node ends a marked span.
      if (node.isInline) runs.push({ page: Math.max(1, page), marks: [], text: "" });
      return true;
    }
    for (const mark of node.marks) {
      if (mark.type.name === BOOKMARK_MARK_NAME) seeBookmark(mark.attrs?.name);
    }
    const marked = node.marks.some((mark) => mark.type.name === markName);
    runs.push({
      page: Math.max(1, page),
      marks: marked ? node.marks : [],
      text: node.text ?? "",
    });
    return true;
  });
  return { runs, bookmarkPages };
}

interface PageSet {
  /** Insertion-ordered by first page. */
  pages: Map<string, ReferencePage & { order: number }>;
  crossReferences: string[];
}

const emptyPageSet = (): PageSet => ({ pages: new Map(), crossReferences: [] });

function addPage(
  set: PageSet,
  from: number,
  to: number,
  rangeSeparator: string,
  bold: boolean,
  italic: boolean,
) {
  const label = to > from ? `${from}${rangeSeparator}${to}` : String(from);
  const known = set.pages.get(label);
  if (known) {
    known.bold ||= bold;
    known.italic ||= italic;
    return;
  }
  set.pages.set(label, { label, bold, italic, order: from * 100_000 + to });
}

const sortedPages = (set: PageSet): ReferencePage[] =>
  [...set.pages.values()]
    .sort((left, right) => left.order - right.order)
    .map(({ label, bold, italic }) => ({ label, bold, italic }));







const INDEX_LANGUAGE_LOCALES: Readonly<Record<string, string>> = {
  "1033": "en-US",
  "2057": "en-GB",
  "2052": "zh-CN",
  "1028": "zh-TW",
  "1041": "ja-JP",
};

function collator(languageId: string): Intl.Collator {
  try {
    const locale = languageId === "auto" ? undefined : (INDEX_LANGUAGE_LOCALES[languageId] ?? languageId);
    return new Intl.Collator(locale, {
      sensitivity: "base",
      numeric: true,
    });
  } catch {
    return new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
  }
}

/** Word files symbols and digits before the letters, under no letter. */
function headingOf(text: string): string {
  const first = [...text.trim()][0] ?? "";
  if (!first) return "";
  if (/\p{L}/u.test(first)) return first.toLocaleUpperCase();
  return "";
}

export function layoutDocumentIndex(
  doc: ProseMirrorNode,
  rawSettings: unknown,
): IndexLayoutGroup[] {
  const settings: IndexSettings = normalizeIndexSettings(rawSettings);
  const { runs, bookmarkPages } = walkDocument(doc, INDEX_ENTRY_MARK_NAME);
  const compare = collator(settings.languageId);
  const mains = new Map<string, { text: string; own: PageSet; subs: Map<string, { text: string; set: PageSet }> }>();
  let previous = "";
  for (const run of runs) {
    const mark = run.marks.find((candidate) => candidate.type.name === INDEX_ENTRY_MARK_NAME);
    if (!mark) {
      previous = "";
      continue;
    }
    const attrs = normalizeIndexEntryAttributes(mark.attrs, run.text);
    if (!attrs.term) {
      previous = "";
      continue;
    }
    // One marked span split into several text nodes is one entry. Two marks
    // that differ only in their page-number format are two entries: each
    
    // the two marks touched).
    const identity = `${attrs.term}\u0000${attrs.referenceMode}\u0000${attrs.crossReference}\u0000${attrs.pageRangeBookmark}\u0000${run.page}\u0000${attrs.boldPageNumber}\u0000${attrs.italicPageNumber}`;
    if (identity === previous) continue;
    previous = identity;
    const cut = attrs.term.indexOf(":");
    const mainText = (cut < 0 ? attrs.term : attrs.term.slice(0, cut)).trim();
    const subText = cut < 0 ? "" : attrs.term.slice(cut + 1).trim();
    if (!mainText) continue;
    const mainKey = mainText.toLocaleLowerCase();
    let main = mains.get(mainKey);
    if (!main) {
      main = { text: mainText, own: emptyPageSet(), subs: new Map() };
      mains.set(mainKey, main);
    }
    let set = main.own;
    if (subText) {
      const subKey = subText.toLocaleLowerCase();
      let sub = main.subs.get(subKey);
      if (!sub) {
        sub = { text: subText, set: emptyPageSet() };
        main.subs.set(subKey, sub);
      }
      set = sub.set;
    }
    if (attrs.referenceMode === "crossReference") {
      if (!set.crossReferences.includes(attrs.crossReference)) {
        set.crossReferences.push(attrs.crossReference);
      }
      continue;
    }
    const range =
      attrs.referenceMode === "pageRange"
        ? bookmarkPages.get(attrs.pageRangeBookmark)
        : undefined;
    addPage(
      set,
      range?.[0] ?? run.page,
      range?.[1] ?? run.page,
      settings.pageRangeSeparator,
      attrs.boldPageNumber,
      attrs.italicPageNumber,
    );
  }

  const ordered = [...mains.values()].sort((left, right) => compare.compare(left.text, right.text));
  const withHeadings = indexFormatHasHeadings(settings.format);
  const groups: IndexLayoutGroup[] = [];
  for (const main of ordered) {
    const heading = withHeadings ? headingOf(main.text) : null;
    let group = groups[groups.length - 1];
    if (!group || (withHeadings && group.heading !== heading)) {
      group = { heading: withHeadings ? heading : null, entries: [] };
      groups.push(group);
    }
    group.entries.push({
      text: main.text,
      level: 1,
      pages: sortedPages(main.own),
      crossReferences: main.own.crossReferences,
    });
    const subs = [...main.subs.values()].sort((left, right) => compare.compare(left.text, right.text));
    for (const sub of subs) {
      group.entries.push({
        text: sub.text,
        level: 2,
        pages: sortedPages(sub.set),
        crossReferences: sub.set.crossReferences,
      });
    }
  }
  return groups;
}

export interface AuthorityLayoutEntry {
  citation: string;
  pages: ReferencePage[];
  /** Word's "Use passim": five or more page references read "passim". */
  passim: boolean;
}

/** Word replaces the page list with "passim" from five references on. */
/**
 * The text an index shows, laid out as the index's own view draws it: each
 * letter heading, each paragraph of entries (subentries run in with ": " and
 * "; "), its page numbers after the separator or a leader tab, and its
 * cross-references. Word Count reads this, not the field's cached summary,
 * which the page never shows: updating an index changed the count with no
 * visible change (live Word audit WUA 126). An empty index shows the
 * editor's own notice, which is no document text.
 */
export function documentIndexPlainText(doc: ProseMirrorNode, rawSettings: unknown): string {
  const settings: IndexSettings = normalizeIndexSettings(rawSettings);
  const groups = layoutDocumentIndex(doc, rawSettings);
  const leader = settings.rightAlignPageNumbers && !settings.runIn;
  const tail = (entry: IndexLayoutEntry) =>
    (entry.pages.length > 0
      ? (leader ? "\t" : settings.entryPageSeparator) +
        entry.pages.map((page) => page.label).join(settings.pageListSeparator)
      : "") + entry.crossReferences.map((reference) => settings.crossReferenceSeparator + reference).join("");
  const lines: string[] = [];
  for (const group of groups) {
    if (group.heading) lines.push(group.heading);
    const paragraphs: IndexLayoutEntry[][] = [];
    for (const entry of group.entries) {
      if (settings.runIn && entry.level === 2 && paragraphs.length > 0) paragraphs[paragraphs.length - 1].push(entry);
      else paragraphs.push([entry]);
    }
    for (const paragraph of paragraphs) {
      lines.push(paragraph.map((entry, index) => (index === 1 ? ": " : index > 1 ? "; " : "") + entry.text + tail(entry)).join(""));
    }
  }
  return lines.join("\n");
}

export const AUTHORITY_PASSIM_PAGE_COUNT = 5;

export function layoutAuthorityTable(
  doc: ProseMirrorNode,
  rawSettings: unknown,
): AuthorityLayoutEntry[] {
  const settings: AuthorityTableSettings = normalizeAuthorityTableSettings(rawSettings);
  const { runs, bookmarkPages } = walkDocument(doc, AUTHORITY_ENTRY_MARK_NAME);
  const entries = new Map<string, { citation: string; set: PageSet }>();
  let previous = "";
  for (const run of runs) {
    const mark = run.marks.find((candidate) => candidate.type.name === AUTHORITY_ENTRY_MARK_NAME);
    const attrs = mark ? normalizeAuthorityEntryAttributes(mark.attrs, run.text) : null;
    if (!attrs?.longCitation || attrs.category !== settings.category) {
      previous = "";
      continue;
    }
    const key = attrs.longCitation.toLocaleLowerCase();
    const identity = `${key}\u0000${run.page}`;
    if (identity === previous) continue;
    previous = identity;
    let entry = entries.get(key);
    if (!entry) {
      entry = { citation: attrs.longCitation, set: emptyPageSet() };
      entries.set(key, entry);
    }
    const range = attrs.pageRangeBookmark
      ? bookmarkPages.get(attrs.pageRangeBookmark)
      : undefined;
    addPage(
      entry.set,
      range?.[0] ?? run.page,
      range?.[1] ?? run.page,
      settings.pageRangeSeparator,
      attrs.boldPageNumber,
      attrs.italicPageNumber,
    );
  }
  const compare = collator("auto");
  return [...entries.values()]
    .sort((left, right) => compare.compare(left.citation, right.citation))
    .map((entry) => {
      const pages = sortedPages(entry.set);
      return {
        citation: entry.citation,
        pages,
        passim: settings.usePassim && pages.length >= AUTHORITY_PASSIM_PAGE_COUNT,
      };
    });
}
