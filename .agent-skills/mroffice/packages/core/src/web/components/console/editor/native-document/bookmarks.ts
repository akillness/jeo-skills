"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Document BOOKMARKS (Word/WPS "Insert → Bookmark" + "Go To" parity) — pure
 * logic.
 *
 * A user selects text (or places the caret) and INSERTS a named bookmark. The
 * selected range gets an inline "bookmark" mark carrying a sanitized `name`; the
 * "Go to bookmark" panel lists every bookmark in the live document and jumps the
 * selection to a chosen one (its position is re-resolved at click time against
 * the CURRENT doc, like the cross-reference / TOC jump).
 *
 * Unlike comments, a bookmark carries NO separate store: the name lives directly
 * on the mark, so the document content is the single source of truth (a deleted
 * range takes its bookmark with it — no dangling record).
 *
 * Everything in THIS module is intentionally framework-free: it operates on plain
 * JSON / sanitization primitives so the name rules + de-duplication can be
 * unit-tested headlessly. The TipTap mark/extension that wires this into the live
 * editor lives in bookmarkExtension.ts.
 *
 * SECURITY: the bookmark name is user-supplied and round-trips through persisted
 * JSON and (on export) the OOXML `w:name` attribute. It is scrubbed to a strict
 * Word-legal token alphabet + clamped here, so a forged document can never smuggle
 * markup, an attribute-breaking payload, or an unbounded blob past this edge.
 */

/** The inline mark name. Kept in a constant so the extension + tests agree. */
export const BOOKMARK_MARK_NAME = "bookmark";

/**
 * The inline atom that holds a POINT bookmark: Word lets Insert > Bookmark
 * name a collapsed insertion point (its `w:bookmarkStart` and `w:bookmarkEnd`
 * sit side by side), which a mark over zero characters cannot carry.
 */
export const BOOKMARK_POINT_NODE_NAME = "bookmarkPoint";

/** Why Word's Bookmark dialog refuses a name (null = a valid name). */
export type BookmarkNameProblem =
  | "empty"
  | "tooLong"
  | "mustStartWithLetter"
  | "invalidCharacter"
  | "reserved";

/**
 * Word's Bookmark dialog rule: a name begins with a letter, holds only
 * letters, numbers and underscores (no spaces or punctuation), and is at most
 * 40 characters. Word keeps Add disabled until the name is valid instead of
 * rewriting it. Names starting with "_" are Word's hidden bookmarks and
 * cannot be typed.
 */
export function wordBookmarkNameProblem(value: string): BookmarkNameProblem | null {
  if (!value) return "empty";
  if (Array.from(value).length > MAX_BOOKMARK_NAME_LENGTH) return "tooLong";
  if (!/^\p{L}/u.test(value)) return "mustStartWithLetter";
  if (!/^[\p{L}\p{N}_]+$/u.test(value)) return "invalidCharacter";
  // MRAI's spelling of Word's hidden `_Ref…` cross-reference bookmarks: as
  // Word keeps "_" names out of the box, a typed name cannot take it, or the
  
  if (isHiddenReferenceBookmarkName(value)) return "reserved";
  return null;
}

/**
 * Hard upper bound for a bookmark name. Word's own limit is 40 characters; we
 * match it so a name that round-trips to a .docx is never silently truncated by
 * Word. The display name (what the panel shows) is the same sanitized token.
 */
export const MAX_BOOKMARK_NAME_LENGTH = 40;

// Characters allowed INSIDE a Word bookmark name after the first: letters,
// digits, underscore. Anything else (space, punctuation, control byte) collapses
// to a single underscore. The `u` flag enables the unicode letter/number escapes
// so a non-Latin name still produces a meaningful token (Word accepts unicode
// letters in bookmark names).
const NON_BOOKMARK_CHAR_RE = /[^\p{L}\p{N}_]+/gu;
// A Word bookmark name MUST start with a letter or underscore (a leading digit is
// illegal). We do NOT allow a leading underscore from user input because the
// underscore namespace (`_GoBack`, `_Toc…`, `_Ref…`) is Word's own and our
// exporter reserves a distinct prefix for round-tripping; a user name that scrubs
// to a leading digit/underscore is prefixed with a single fixed letter.
const LEADING_INVALID_RE = /^[\d_]+/;

/**
 * Sanitize an arbitrary value into a Word-legal bookmark name token.
 *
 * Rules enforced (matching Word/WPS):
 *   - only unicode letters / digits / underscores survive; every other run
 *     (spaces, punctuation, control bytes, markup characters) collapses to "_";
 *   - the name must START with a letter or underscore — a leading digit/underscore
 *     run is stripped, and if nothing letter-like remains the token is prefixed
 *     with a fixed "B" so the result is always a legal starter;
 *   - length is clamped to {@link MAX_BOOKMARK_NAME_LENGTH};
 *   - a trailing underscore the clamp may expose is trimmed.
 *
 * A name the Bookmark dialog accepts ({@link wordBookmarkNameProblem} is null)
 * is returned VERBATIM: Word keeps `Section_` and `A__B` as typed, so the
 * scrubbing below (underscore runs collapse, a trailing underscore is trimmed)
 * only ever applies to imported or forged values, never to a name the user was
 * told is valid. This is what lets `setBookmark` require the stored name to
 * equal the typed one.
 *
 * Returns "" when the input carries nothing usable (e.g. all punctuation), so the
 * caller can reject an empty bookmark rather than create an unnamed one. PURE.
 */
export function sanitizeBookmarkName(value: unknown): string {
  if (typeof value !== "string") return "";
  if (wordBookmarkNameProblem(value) === null) return value;
  const collapsed = value
    .normalize("NFKC")
    .replace(NON_BOOKMARK_CHAR_RE, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!collapsed) return "";
  // A name that begins with a digit is illegal in OOXML; strip the leading
  // digit/underscore run, then re-prefix with "B" when nothing letter-like is
  // left (e.g. the original was all digits → "B<digits>").
  let token = collapsed;
  if (LEADING_INVALID_RE.test(token)) {
    const trimmed = token.replace(LEADING_INVALID_RE, "");
    token = trimmed ? trimmed : `B${collapsed}`;
  }
  return token.slice(0, MAX_BOOKMARK_NAME_LENGTH).replace(/_+$/g, "");
}

/**
 * The Word `w:name` prefix our exporter stamps on a USER bookmark so it occupies
 * a namespace distinct from heading / cross-reference / caption anchors (which use
 * plain text slugs) and from Word's own internal `_`-prefixed bookmarks. The
 * importer strips this prefix to recover the user's display name and SKIPS such
 * names when adopting a heading's anchor id (a user bookmark on a heading must not
 * shadow the heading's natural cross-reference anchor).
 *
 * It begins with a letter (legal OOXML starter) and uses an underscore separator
 * that survives {@link sanitizeBookmarkName}, so the round-trip is loss-free.
 */
export const USER_BOOKMARK_NAME_PREFIX = "Mrbk_";

/**
 * Stamp the export prefix onto a sanitized user bookmark name, producing the
 * OOXML `w:name`. The input is assumed already sanitized; this only namespaces it.
 */
export function toExportedBookmarkName(name: string): string {
  return `${USER_BOOKMARK_NAME_PREFIX}${name}`;
}

/**
 * Whether an OOXML `w:name` is one of OUR exported user bookmarks. Used by the
 * importer to route such a name back to a user bookmark mark (vs. a heading /
 * caption anchor).
 */
export function isExportedUserBookmarkName(rawName: unknown): boolean {
  return (
    typeof rawName === "string" && rawName.startsWith(USER_BOOKMARK_NAME_PREFIX)
  );
}

/**
 * Recover the user display name from an exported OOXML `w:name`: strip the prefix
 * and re-sanitize (defensive — a forged value cannot smuggle anything past this).
 * Returns "" when the name is not one of ours or scrubs to nothing.
 */
export function parseExportedBookmarkName(rawName: unknown): string {
  if (!isExportedUserBookmarkName(rawName)) return "";
  return sanitizeBookmarkName(
    (rawName as string).slice(USER_BOOKMARK_NAME_PREFIX.length),
  );
}











export const BOOKMARK_LINK_FRAGMENT_PREFIX = "bookmark:";

/**
 * The href an in-document link stores for a user bookmark: `#bookmark:<name>`,
 * or "" when the name sanitizes to nothing (the caller rejects it). PURE.
 */
export function bookmarkLinkHref(name: string): string {
  const token = sanitizeBookmarkName(name);
  return token ? `#${BOOKMARK_LINK_FRAGMENT_PREFIX}${token}` : "";
}

/**
 * The bookmark a `#bookmark:<name>` href names, or "" for any other href — a
 * legacy `#<name>`, an external URL, or a forged fragment whose name is not
 * a canonical bookmark token. PURE.
 */
export function bookmarkNameFromLinkHref(href: unknown): string {
  if (typeof href !== "string") return "";
  const prefix = `#${BOOKMARK_LINK_FRAGMENT_PREFIX}`;
  if (!href.startsWith(prefix)) return "";
  let raw = href.slice(prefix.length);
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // Keep the raw spelling; the canonical check below rejects it if needed.
  }
  const name = sanitizeBookmarkName(raw);
  return name && name === raw ? name : "";
}

/**
 * The bookmark Word puts around a paragraph when a cross-reference targets it
 * as a "Numbered item" (Word names these `_Ref<number>` and hides them from
 * the Bookmark dialog). Ours has to be a name the document schema accepts, so
 * it starts with letters; the lists a person picks bookmarks from leave it out.
 */
const HIDDEN_REFERENCE_BOOKMARK_RE = /^MrRef\d{9}$/;

export function isHiddenReferenceBookmarkName(name: unknown): boolean {
  return typeof name === "string" && HIDDEN_REFERENCE_BOOKMARK_RE.test(name);
}

export function newHiddenReferenceBookmarkName(used: ReadonlySet<string>): string {
  for (;;) {
    const name = `MrRef${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, "0")}`;
    if (!used.has(name)) return name;
  }
}

/** A bookmark entry surfaced to the "Go to bookmark" panel. */
export interface DocBookmark {
  /** The sanitized, unique bookmark name (also its display label). */
  name: string;
}

/**
 * Collect every bookmark name carried by a `bookmark` mark in a document JSON
 * tree, in first-appearance (document) order, de-duplicated. A name that appears
 * twice (e.g. two disjoint ranges marked with the same name — overlap is handled
 * at the mark level) is listed once. Returns [] for a bookmark-free document.
 *
 * This walks the persisted JSON (not a live ProseMirror node) so the panel and
 * the exporter agree on the SAME set of names regardless of how the ranges are
 * split across text nodes. PURE.
 */
export function collectBookmarks(doc: unknown): DocBookmark[] {
  const seen = new Set<string>();
  const out: DocBookmark[] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const record = node as {
      type?: unknown;
      attrs?: { name?: unknown };
      marks?: unknown;
      content?: unknown;
    };
    if (record.type === BOOKMARK_POINT_NODE_NAME) {
      const name = sanitizeBookmarkName(record.attrs?.name);
      if (name && !seen.has(name)) {
        seen.add(name);
        out.push({ name });
      }
    }
    if (Array.isArray(record.marks)) {
      for (const mark of record.marks) {
        if (
          mark &&
          typeof mark === "object" &&
          (mark as { type?: unknown }).type === BOOKMARK_MARK_NAME
        ) {
          const name = sanitizeBookmarkName(
            (mark as { attrs?: { name?: unknown } }).attrs?.name,
          );
          if (name && !seen.has(name)) {
            seen.add(name);
            out.push({ name });
          }
        }
      }
    }
    if (Array.isArray(record.content)) {
      for (const child of record.content) visit(child);
    }
  };
  visit(doc);
  return out;
}

/**
 * De-duplicate a candidate bookmark name against a set of names already used in
 * the document, appending `_2`, `_3`, … until the name is free (matching the
 * deterministic suffix scheme used for heading anchor ids). The suffix is added
 * BEFORE the length clamp's tail so the result stays within
 * {@link MAX_BOOKMARK_NAME_LENGTH}. Returns the input unchanged when it is already
 * free. PURE — `used` is not mutated.
 */
export function dedupeBookmarkName(name: string, used: Set<string>): string {
  if (!name) return name;
  if (!used.has(name)) return name;
  for (let suffix = 2; ; suffix += 1) {
    const tag = `_${suffix}`;
    // Reserve room for the suffix within the length cap.
    const base = name.slice(0, MAX_BOOKMARK_NAME_LENGTH - tag.length);
    const candidate = `${base.replace(/_+$/g, "")}${tag}`;
    if (!used.has(candidate)) return candidate;
  }
}
