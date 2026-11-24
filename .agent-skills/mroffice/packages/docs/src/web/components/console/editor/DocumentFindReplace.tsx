"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import type { Mark as PmMark, MarkType, Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { Mapping } from "@tiptap/pm/transform";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { toast } from "@mrnote/core/web/hooks/use-toast.ts";

import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import {
  buildFindSnippet,
  findSnippetParts,
  OfficeFindPane,
  OfficeFindPaneToggle,
  officeFindPaneClassNames,
  type OfficeFindSnippet,
} from "@mrnote/core/web/components/office-ribbon/OfficeFindPane.tsx";
import {
  officeDialogClassName,
  useOfficeDialogChrome,
} from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import {
  LINE_HEIGHT_VALUES,
  normalizeLineHeight,
  normalizeSpacing,
  normalizeTextAlign,
} from "@mrnote/core/web/components/console/editor/extensions/DocumentFormatting.ts";
import {
  createDocumentFindHighlightPlugin,
  documentFindHighlightKey,
  paginationOnlyChange,
  type DocumentFindHighlightMeta,
} from "@mrnote/core/web/components/console/editor/native-document/documentFindHighlight.ts";
import {
  collectHeaderFooterStories,
  collectNoteStories,
  findInHeaderFooterStories,
  findInNoteStories,
  replaceNoteSpans,
  sheetIndexForHeaderFooterStory,
  storyHitHasFormat,
  type DocumentFindScope,
  type DocumentHeaderFooterHit,
  type DocumentNoteHit,
} from "./native-document/documentFindStories";
import {
  CAPTION_ANCHOR_ID_ATTR,
  CAPTION_NODE_NAME,
  captionDisplayText,
  collectCaptionsFromDoc,
} from "@mrnote/core/web/components/console/editor/native-document/captions.ts";
import type { FootnoteRichBody } from "@mrnote/core/web/components/console/editor/native-document/footnotes.ts";
import { citationDisplayText } from "@mrnote/core/web/components/console/editor/native-document/citationExtension.tsx";
import { CITATION_MARK_NAME } from "@mrnote/core/web/components/console/editor/native-document/citations.ts";
import { CONTENT_CONTROL_MARK_NAME, isContentControlFillLocked } from "@mrnote/core/web/components/console/editor/native-document/contentControls.ts";
import { controlRangeAt } from "./native-document/contentControlExtension";
import {
  SPLITTABLE_BLOCK_TYPE,
  SPLIT_CONTINUES_ATTR,
  isContinuationTail,
} from "@mrnote/core/web/components/console/editor/native-document/paged/blockSplitting.ts";
import { effectiveBoldAt } from "@mrnote/core/web/components/console/editor/native-document/boldExtension.ts";
import { effectiveItalicAt } from "@mrnote/core/web/components/console/editor/native-document/italicExtension.ts";
import { normalizeUnderlineStyle } from "@mrnote/core/web/components/console/editor/native-document/underlineExtension.ts";
import { OPEN_BAND_EDITOR_EVENT } from "./native-document/paged/SheetBandEditLayer";
import { TABLE_REPEATED_HEADER_ATTR } from "@mrnote/core/web/components/console/editor/native-document/paged/tablePagination.ts";
import {
  FIND_OBJECT_CHARS,
  FIND_PARAGRAPH_MARK,
  expandWordReplacement,
  markWordBoundaries,
  translateWordFind,
  unmarkWordBoundaryText,
  wordFindUsesSyntax,
  type WordFindPattern,
  type WordReplacementPart,
} from "./native-document/wordFindPattern";
import { isPictureNode } from "@mrnote/core/web/components/console/editor/native-document/documentObjectNodes.ts";
import {
  documentEquationFindText,
  documentEquationTextReplaced,
  EQUATION_FIND_BOUNDARY,
} from "./native-document/equationFindText";
import { isDocumentEquationNode } from "@mrnote/core/web/components/console/editor/native-document/equationNodeFormat.ts";
import { DOCUMENT_FIELD_NODE_NAME } from "@mrnote/core/web/components/console/editor/native-document/documentFieldValues.ts";
import { FOOTNOTE_MARK_NAME, resolveFootnoteMode } from "@mrnote/core/web/components/console/editor/native-document/footnotes.ts";
import { DELETION_MARK_NAME } from "@mrnote/core/web/components/console/editor/native-document/trackChanges.ts";
import { charBefore, execBehind, lookbehindSupported, type TextBehind } from "@mrnote/core/web/lib/regexp-behind.ts";

/**
 * A located match. `captures` is the RegExpExecArray slice
 * (`[fullMatch, $1, $2, …]`) and `namedGroups` its named groups; both are
 * only populated for regex matches, so replace can expand `$1` and
 * `$<name>` references; plain matches leave them undefined.
 */
type TextMatch = {
  from: number;
  to: number;
  captures?: string[];
  namedGroups?: Record<string, string>;
  /** Found in text an inline object shows (a citation): never replaced. */
  readOnly?: boolean;
  /**
   * Words under phonetic guides: the match runs over whole guided
   * characters. A replacement writes the guided characters' text before and
   * after the matched part back as plain text around it (WUA 185).
   */
  guided?: { before: string; after: string };
  /** Runs over a paragraph mark (Word's ^p): the paragraphs it spans join
   *  when it is replaced. */
  acrossParagraphs?: boolean;
  /**
   * Found inside an equation (the node at `from`): the characters
   * `[start, end)` of what it reads (`documentEquationFindText`), `found`
   * those characters. A replacement is made in its LaTeX, or the equation is
   * left as it is; never flattened to text.
   */
  equation?: { start: number; end: number; found: string };
};

export type DocumentFindResultSnippet = OfficeFindSnippet;

// Docs' callers and tests import it from here; the pane owns it now.
export { findSnippetParts };

/**
 * Builds a bounded, plain-text-only result preview from the immutable document
 * that authorized the match. React renders each segment as text, so document
 * markup can never become navigation-pane HTML.
 */
export function buildDocumentFindResultSnippet(
  doc: ProseMirrorNode,
  match: TextMatch,
  contextRadius = 34,
): DocumentFindResultSnippet {
  const radius = Math.max(12, Math.min(80, Math.trunc(contextRadius)));
  const start = Math.max(0, match.from - radius);
  const end = Math.min(doc.content.size, match.to + radius);
  // Inside an equation: the characters it reads around the match.
  const equation = match.equation;
  const equationNode = equation ? doc.nodeAt(match.from) : null;
  const equationText =
    equation && equationNode && isDocumentEquationNode(equationNode)
      ? documentEquationFindText(String(equationNode.attrs.latex)).split(EQUATION_FIND_BOUNDARY).join(" ")
      : null;
  const parts = findSnippetParts(
    doc.textBetween(start, match.from, " ", " ") + (equation && equationText !== null ? equationText.slice(0, equation.start) : ""),
    equation && equationText !== null ? equationText.slice(equation.start, equation.end) : doc.textBetween(match.from, match.to, " ", " "),
    (equation && equationText !== null ? equationText.slice(equation.end) : "") + doc.textBetween(match.to, end, " ", " "),
  );
  return {
    before: `${start > 0 ? "…" : ""}${parts.before}`,
    match: parts.match,
    after: `${parts.after}${end < doc.content.size ? "…" : ""}`,
  };
}

/** Exact immutable document generation that authorized a rendered match list. */
type TextMatchSnapshot = {
  doc: ProseMirrorNode;
  matches: TextMatch[];
};

/**
 * The hits of `snapshot` moved through `transactions` (changes of the pages
 * only) to `doc`: each hit where the mapping puts it, holding the same text.
 * Null when one does not: a block taken out of one page and put into the
 * next leaves no mapping for what it held, and the hits are found again when
 * they are next needed.
 */
function moveSnapshot(
  snapshot: TextMatchSnapshot,
  transactions: readonly Transaction[],
  doc: ProseMirrorNode,
): TextMatchSnapshot | null {
  const mapping = new Mapping();
  for (const tr of transactions) mapping.appendMapping(tr.mapping);
  const matches: TextMatch[] = [];
  for (const match of snapshot.matches) {
    const from = mapping.mapResult(match.from, 1);
    const to = mapping.mapResult(match.to, -1);
    if (from.deleted || to.deleted || to.pos <= from.pos || to.pos > doc.content.size) return null;
    if (doc.textBetween(from.pos, to.pos, "\n", "\ufffc") !==
        snapshot.doc.textBetween(match.from, match.to, "\n", "\ufffc")) return null;
    matches.push(from.pos === match.from && to.pos === match.to ? match : { ...match, from: from.pos, to: to.pos });
  }
  return { doc, matches };
}

type RuntimeEditor = Editor & {
  getText?: () => string;
};

export type DocumentFindReplaceFocusIntent = Readonly<{
  target: "find" | "replace";
  requestId: number;
}>;

interface DocumentFindReplaceProps {
  /** The active editor: the body, or the open header/footer story. */
  editor: Editor;
  /** The document body editor, when `editor` may be a story editor. */
  documentEditor?: Editor;
  /** The open header/footer story editor, if any. */
  storyEditor?: Editor | null;
  initialFocus?: DocumentFindReplaceFocusIntent;
  onClose: () => void;
}

/**
 * Validate a regex pattern against the active case-sensitivity flag. Returns an
 * error message when the pattern fails to compile, or `null` when it is valid.
 * Mirrors the code editor's find-bar (`lib/code-runner/find-replace.ts`) so the
 * UI can surface a non-crashing inline error instead of throwing.
 */
export function validateDocumentRegex(
  query: string,
  caseSensitive: boolean,
): string | null {
  if (!query) return null;
  try {
    void compileDocumentRegex(query, caseSensitive);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Invalid regular expression";
  }
}









export function compileDocumentRegex(pattern: string, caseSensitive: boolean): RegExp {
  const flags = caseSensitive ? "g" : "gi";
  try {
    return new RegExp(pattern, `${flags}u`);
  } catch {
    return new RegExp(pattern, flags);
  }
}

/**
 * Expand `$0/$1/…` (and `$$`, `$&`, `$<name>`) in a regex replacement using a
 * match's captures, mirroring `String.prototype.replace` / VSCode semantics.
 * Out-of-range `$n` and unknown `$<name>` expand to "". Plain matches (no
 * `captures`) return the replacement verbatim, so literal `$1` stays literal in
 * plain mode — preserving the existing byte-for-byte replace behavior.
 */
export function expandDocumentReplacement(
  replacement: string,
  captures?: string[],
  namedGroups?: Record<string, string>,
): string {
  if (!captures) return replacement;
  // A group name is any identifier the pattern itself accepts: (?<词>…) is
  
  return replacement.replace(
    /\$(\$|&|<([\p{ID_Start}_$][\p{ID_Continue}$\u200c\u200d]*)>|\d{1,2})/gu,
    (_whole, token: string, name?: string) => {
      if (token === "$") return "$";
      if (token === "&") return captures[0] ?? "";
      // Only the match's own groups: an unknown name such as `toString` or
      
      if (name) {
        return namedGroups && Object.prototype.hasOwnProperty.call(namedGroups, name)
          ? (namedGroups[name] ?? "")
          : "";
      }
      const n = Number(token);
      return n < captures.length ? (captures[n] ?? "") : "";
    },
  );
}

/**
 * Escape a literal string so it can be embedded in a RegExp source verbatim
 * (every regex metacharacter is backslash-escaped). Mirrors the well-known
 * `escapeRegExp`; used so the whole-word path can build a `\b…\b` pattern around
 * a plain (non-regex) query without the query's own characters being read as
 * regex syntax.
 */
export function escapeRegExpLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build the regex SOURCE for a whole-word match: wrap the query in `\b…\b` word
 * boundaries (Word/WPS "Match whole word"). In plain mode the query is escaped
 * first (so `a.b` matches the literal text, not "a<any>b"); in regex mode the
 * user's pattern is wrapped as a non-capturing group so alternation stays
 * scoped. Returns null for an empty query (no whole-word constraint to build).
 *
 * Note `\b` is an ASCII word boundary, matching Word's behavior for Latin text;
 * it is a no-op between two non-word characters (e.g. CJK), so whole-word on
 * such scripts simply falls back to ordinary substring behavior.
 */
export function buildWholeWordPattern(
  query: string,
  regex: boolean,
): string | null {
  return buildBoundedSearchPattern(query, regex, true, true);
}

/**
 * Word's Find and Replace "More >>" search options (Microsoft Support,
 * "Find and replace text"; Word JS `SearchOptions`):
 *   - Match prefix: the match must START a word (`matchPrefix`).
 *   - Match suffix: the match must END a word (`matchSuffix`).
 *   - Ignore punctuation characters: punctuation between the characters of
 *     the search text is not compared (`ignorePunct`).
 *   - Ignore white-space characters: spaces/tabs between the characters are
 *     not compared (`ignoreSpace`).
 * Prefix + suffix together is Find whole words only. Word greys the four out
 * while "Use wildcards" is on; MRAI's wildcard counterpart is the regex mode,
 * so the two ignore options are refused there too. "Sounds like (English)"
 * and "Find all word forms" need a phonetic / morphological dictionary and
 * are not offered.
 */
export interface DocumentFindOptions {
  /** Word's "Use wildcards"; the query's ^ codes are read either way. */
  readonly wildcards?: boolean;
  readonly matchPrefix?: boolean;
  readonly matchSuffix?: boolean;
  readonly ignorePunctuation?: boolean;
  readonly ignoreWhitespace?: boolean;
}

/** The regex a query in Word's syntax runs as; null when it is not one Word
 *  accepts (the entry says so: {@link documentFindSyntaxError}). */
export function documentWordFindPattern(
  query: string,
  caseSensitive: boolean,
  options: DocumentFindOptions,
): WordFindPattern | null {
  const result = translateWordFind(query, {
    wildcards: options.wildcards === true,
    caseSensitive,
  });
  return result.ok ? result.pattern : null;
}

/** Why a query in Word's syntax cannot run, or null. */
export function documentFindSyntaxError(
  query: string,
  wildcards: boolean,
): "special" | "wildcard" | null {
  if (!query || !wordFindUsesSyntax(query, wildcards)) return null;
  const result = translateWordFind(query, { wildcards, caseSensitive: true });
  return result.ok ? null : result.code;
}

/** One match inside a flat string: `[start, end)` plus regex captures. */
export interface DocumentTextSpanMatch {
  start: number;
  end: number;
  captures?: string[];
  /** The match's named groups, for `$<name>` in a replacement. */
  namedGroups?: Record<string, string>;
}

/** A regex match's named groups, a group that took no part reading "". */
/** True when `index` falls between the two halves of a surrogate pair. */
function splitsSurrogatePair(text: string, index: number): boolean {
  if (index <= 0 || index >= text.length) return false;
  const before = text.charCodeAt(index - 1);
  const after = text.charCodeAt(index);
  return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
}

function namedGroupsOf(
  match: RegExpExecArray,
): Record<string, string> | undefined {
  if (!match.groups) return undefined;
  return Object.fromEntries(
    Object.entries(match.groups).map(([name, value]) => [name, value ?? ""]),
  );
}

/**
 * Case-fold a string for the plain matcher, mapping every folded code unit
 * back to the character it came from. Folding can change length (İ, U+0130,
 * lowers to i + U+0307), so an index into the folded text is not an index
 * into the text: a match found after such a character would otherwise land
 * on its neighbour. The whole-string fold applies context rules (a Greek
 * final sigma) and is kept whenever it lines up with the per-character one.
 */






function foldFinalSigma(lower: string): string {
  return lower.includes("\u03c2") ? lower.replace(/\u03c2/gu, "\u03c3") : lower;
}

function foldedWithSource(text: string): {
  folded: string;
  starts: number[];
  ends: number[];
} {
  const starts: number[] = [];
  const ends: number[] = [];
  let perCharacter = "";
  let offset = 0;
  for (const character of text) {
    const lower = foldFinalSigma(character.toLocaleLowerCase());
    perCharacter += lower;
    for (let unit = 0; unit < lower.length; unit += 1) {
      starts.push(offset);
      ends.push(offset + character.length);
    }
    offset += character.length;
  }
  const whole = foldFinalSigma(text.toLocaleLowerCase());
  return {
    folded: whole.length === perCharacter.length ? whole : perCharacter,
    starts,
    ends,
  };
}

const FIND_PUNCTUATION_RE = /\p{P}/u;
const FIND_WHITESPACE_RE = /\s/u;

/**
 * The regex source for a query with word-edge constraints: a leading `\b`
 * for Match prefix (or whole word) and a trailing one for Match suffix (or
 * whole word). Null for an empty query.
 */
export function buildBoundedSearchPattern(
  query: string,
  regex: boolean,
  leading: boolean,
  trailing: boolean,
  unicode = false,
): string | null {
  if (!query) return null;
  const inner = regex ? `(?:${query})` : escapeRegExpLiteral(query);
  const edge = unicode ? UNICODE_WORD_EDGE : "\\b";
  return `${leading ? edge : ""}${inner}${trailing ? edge : ""}`;
}

/**
 * A word edge for letters of every script: `\b`'s own rule (a word character
 * on exactly one side) with Unicode letters, marks and digits as word
 * characters. JavaScript's `\b` knows only [A-Za-z0-9_], so "é" ended a
 * word: whole-word "café" missed "café " and matched inside "caféine".
 * Needs the `u` flag.
 */
const UNICODE_WORD_CHARACTER = "[\\p{L}\\p{M}\\p{N}_]";
const SOURCE_WORD_CHARACTER_RE = /^[\p{L}\p{M}\p{N}_]$/u;
// eslint-disable-next-line no-restricted-syntax -- used only where lookbehindSupported (boundedSearchRegExp)
const UNICODE_WORD_EDGE = `(?:(?<=${UNICODE_WORD_CHARACTER})(?!${UNICODE_WORD_CHARACTER})|(?<!${UNICODE_WORD_CHARACTER})(?=${UNICODE_WORD_CHARACTER}))`;

/** A bounded search's matcher; `behind` is its leading word edge, tested in
 * code where the engine has no lookbehind (execBehind). */
interface BoundedSearch {
  re: RegExp;
  behind?: TextBehind;
}

const isUnicodeWordCharacter = (character: string): boolean =>
  character !== "" && SOURCE_WORD_CHARACTER_RE.test(character);










function boundedSearchWithoutLookbehind(
  needle: string,
  regex: boolean,
  leading: boolean,
  trailing: boolean,
  flags: string,
): BoundedSearch | null {
  if (!needle || (trailing && regex)) return null;
  const inner = regex ? `(?:${needle})` : escapeRegExpLiteral(needle);
  const last = Array.from(needle).pop() ?? "";
  const trailingEdge = !trailing
    ? ""
    : isUnicodeWordCharacter(last)
      ? `(?!${UNICODE_WORD_CHARACTER})`
      : `(?=${UNICODE_WORD_CHARACTER})`;
  let re: RegExp;
  try {
    re = new RegExp(`${inner}${trailingEdge}`, `${flags}u`);
  } catch {
    return null;
  }
  if (!leading) return { re };
  return {
    re,
    behind: (text, index) => {
      const next = index < text.length ? String.fromCodePoint(text.codePointAt(index) ?? 0) : "";
      return isUnicodeWordCharacter(charBefore(text, index, true)) !== isUnicodeWordCharacter(next);
    },
  };
}

/**
 * The matcher for a bounded (whole word / prefix / suffix) search: the
 * Unicode word edges under the `u` flag, or -- for a user regex the `u`
 * flag rejects -- JavaScript's own `\b`. Null when neither compiles.
 */
function boundedSearchRegExp(
  needle: string,
  regex: boolean,
  leading: boolean,
  trailing: boolean,
  caseSensitive: boolean,
): BoundedSearch | null {
  const flags = caseSensitive ? "g" : "gi";
  const unicode = buildBoundedSearchPattern(needle, regex, leading, trailing, true);
  if (!unicode) return null;
  if (!lookbehindSupported) {
    const withoutLookbehind = boundedSearchWithoutLookbehind(needle, regex, leading, trailing, flags);
    if (withoutLookbehind) return withoutLookbehind;
  } else {
    try {
      return { re: new RegExp(unicode, `${flags}u`) };
    } catch {
      /* the legacy `\b` below */
    }
  }
  try {
    return {
      re: new RegExp(
        buildBoundedSearchPattern(needle, regex, leading, trailing) ?? "",
        flags,
      ),
    };
  } catch {
    return null;
  }
}

/**
 * Find every match of `query` in one flat string (one paragraph's text, one
 * header line, one note paragraph). This is the single matcher every Find
 * scope uses, so the document body, the header/footer stories and the notes
 * answer one query identically.
 */
export function findDocumentTextSpans(
  text: string,
  query: string,
  caseSensitive: boolean,
  regex = false,
  wholeWord = false,
  options: DocumentFindOptions = {},
): DocumentTextSpanMatch[] {
  if (!query || !text) return [];
  if (!regex && wordFindUsesSyntax(query, options.wildcards === true)) {
    const translated = documentWordFindPattern(query, caseSensitive, options);
    if (!translated) return [];
    // Word's own syntax runs on the regex path; whole words, prefix and
    // suffix apply to an ordinary search only (Word greys them out with
    // wildcards), and the ignore options are not read with either.
    if (translated.wordBoundaryMarks) {
      // < and > without lookbehind: the pattern runs on the text marked at
      // word edges, and each match is read back in the text itself.
      const marked = markWordBoundaries(text);
      return findDocumentTextSpans(marked.text, translated.source, translated.caseSensitive, true, false, {}).flatMap(
        (span) => {
          const start = marked.positions[span.start]!;
          const end = marked.positions[span.end]!;
          if (start === end) return [];
          return [
            {
              start,
              end,
              ...(span.captures
                ? { captures: span.captures.map((capture) => (capture === undefined ? capture : unmarkWordBoundaryText(capture))) }
                : {}),
              ...(span.namedGroups
                ? {
                    namedGroups: Object.fromEntries(
                      Object.entries(span.namedGroups).map(([name, value]) => [name, unmarkWordBoundaryText(value)]),
                    ),
                  }
                : {}),
            },
          ];
        },
      );
    }
    return findDocumentTextSpans(
      text,
      translated.source,
      translated.caseSensitive,
      true,
      options.wildcards ? false : wholeWord,
      options.wildcards ? {} : { matchPrefix: options.matchPrefix, matchSuffix: options.matchSuffix },
    );
  }
  const ignoring =
    !regex && Boolean(options.ignorePunctuation || options.ignoreWhitespace);
  const keep = (character: string) =>
    !(
      (options.ignorePunctuation && FIND_PUNCTUATION_RE.test(character)) ||
      (options.ignoreWhitespace && FIND_WHITESPACE_RE.test(character))
    );
  let haystack = text;
  let needle = query;
  let index: number[] | null = null;
  if (ignoring) {
    index = [];
    let filtered = "";
    for (let offset = 0; offset < text.length; offset += 1) {
      const character = text[offset]!;
      if (!keep(character)) continue;
      filtered += character;
      index.push(offset);
    }
    haystack = filtered;
    needle = Array.from(query).filter(keep).join("");
    if (!needle) return [];
  }
  const leading = wholeWord || options.matchPrefix === true;
  const trailing = wholeWord || options.matchSuffix === true;
  // With characters ignored, a word edge cannot be read off the filtered
  // text: "Every command" became "Everycommand", and whole-word "Every" no
  
  // text once the hits are mapped back.
  const edgesOnSource = ignoring && (leading || trailing);
  const spans: DocumentTextSpanMatch[] = [];
  if (!regex && ((!leading && !trailing) || edgesOnSource)) {
    // The plain path: case-folded indexOf, each hit mapped back from the
    // folded text to the characters it covers.
    if (caseSensitive) {
      let at = haystack.indexOf(needle);
      while (at >= 0) {
        spans.push({ start: at, end: at + needle.length });
        at = haystack.indexOf(needle, at + needle.length);
      }
    } else {
      const { folded, starts, ends } = foldedWithSource(haystack);
      const foldedNeedle = foldedWithSource(needle).folded;
      let at = folded.indexOf(foldedNeedle);
      while (at >= 0) {
        const start = starts[at];
        const end = ends[at + foldedNeedle.length - 1];
        if (start !== undefined && end !== undefined) spans.push({ start, end });
        at = folded.indexOf(foldedNeedle, at + foldedNeedle.length);
      }
    }
  } else {
    let re: RegExp;
    let behind: TextBehind | undefined;
    if (regex && !leading && !trailing) {
      // Code points, not UTF-16 units: "." on an emoji is one match of the
      
      // syntax accepts keeps it; the surrogate guard below still applies.
      try {
        re = compileDocumentRegex(needle, caseSensitive);
      } catch {
        return [];
      }
    } else {
      const bounded = boundedSearchRegExp(
        needle,
        regex,
        leading,
        trailing,
        caseSensitive,
      );
      if (!bounded) return [];
      re = bounded.re;
      behind = bounded.behind;
    }
    let guard = 0;
    let m: RegExpExecArray | null;
    while ((m = behind ? execBehind(re, haystack, behind) : re.exec(haystack)) !== null) {
      if (guard++ > haystack.length + 1) break; // pathological safety
      if (m[0].length === 0) {
        // zero-width: nothing to select, step past one character
        re.lastIndex += (haystack.codePointAt(re.lastIndex) ?? 0) > 0xffff ? 2 : 1;
        continue;
      }
      // A range that starts or ends inside a surrogate pair would replace
      // half a character and leave an unpaired surrogate in the document.
      if (splitsSurrogatePair(haystack, m.index) || splitsSurrogatePair(haystack, m.index + m[0].length)) {
        continue;
      }
      spans.push({
        start: m.index,
        end: m.index + m[0].length,
        // Plain-text boundary searches keep replace LITERAL (no captures),
        // so a literal `$1` in the replacement stays `$1`.
        ...(regex ? { captures: m.slice() } : {}),
        ...(regex && m.groups ? { namedGroups: namedGroupsOf(m) } : {}),
      });
    }
  }
  if (!index) return spans;
  const map = index;
  const isWord = (at: number): boolean => {
    if (at < 0 || at >= text.length) return false;
    // A surrogate half belongs to its character.
    const low = at > 0 && /[\uDC00-\uDFFF]/.test(text[at]!) && /[\uD800-\uDBFF]/.test(text[at - 1]!);
    const point = String.fromCodePoint(text.codePointAt(low ? at - 1 : at) ?? 0);
    return SOURCE_WORD_CHARACTER_RE.test(point);
  };
  return spans.flatMap((span) => {
    const start = map[span.start];
    const last = map[span.end - 1];
    if (typeof start !== "number" || typeof last !== "number") return [];
    if (edgesOnSource) {
      // `\b`'s rule: a word character on exactly one side.
      if (leading && isWord(start - 1) === isWord(start)) return [];
      if (trailing && isWord(last) === isWord(last + 1)) return [];
    }
    return [{ ...span, start, end: last + 1 }];
  });
}

export function collectTextMatches(
  editor: Editor,
  query: string,
  caseSensitive: boolean,
  regex = false,
  wholeWord = false,
  options: DocumentFindOptions = {},
): TextMatch[] {
  return collectTextMatchesFromDoc(
    editor.state.doc,
    query,
    caseSensitive,
    regex,
    wholeWord,
    options,
  );
}

/**
 * Exact-document variant of {@link collectTextMatches}. Consumers that bind a
 * rendered result list to an immutable ProseMirror document generation use
 * this entrypoint so collection cannot silently read a newer editor state.
 * The editor-facing wrapper above preserves the existing find/replace API.
 *
 * Matches are found per paragraph over its flattened text (a paragraph the
 * page edge cut is read as one; inline atoms are boundaries, a citation
 * contributes the text it shows), then mapped back to document positions; a
 * match never crosses a paragraph boundary.
 */
/**
 * Stand-in for a non-text inline node in the searched text (U+FFFC OBJECT
 * REPLACEMENT CHARACTER): neither whitespace nor punctuation, so the "ignore
 * white-space / punctuation" options cannot erase the boundary either.
 */
const FIND_INLINE_OBJECT_BOUNDARY = "\uFFFC";

/**
 * Invisible inline markers that are not characters of the text, like a Word
 * point bookmark: a search reads straight through them (as Word does), and a
 * replacement keeps them (see {@link replaceDocumentTextMatch}).
 */
const FIND_TRANSPARENT_INLINE_NODES: ReadonlySet<string> = new Set([
  "bookmarkPoint",
  "rangePermission",
]);

/**
 * The formatting the first character a replacement replaces carries: Word's
 * Replace writes its text in that character's formatting (a link, direct
 * font, colour, language and Do not check spelling all stay) unless Replace
 * > Format says otherwise. Null when the range holds no text. A tombstone's
 * deletion mark is not formatting.
 */
function firstReplacedCharacterMarks(
  doc: ProseMirrorNode,
  from: number,
  to: number,
): readonly PmMark[] | null {
  let marks: readonly PmMark[] | null = null;
  doc.nodesBetween(from, to, (node) => {
    if (marks) return false;
    if (node.isText) {
      marks = node.marks.filter((mark) => mark.type.name !== DELETION_MARK_NAME);
      return false;
    }
    return true;
  });
  return marks;
}

/**
 * `transaction.insertText(text, from, to)` in the replaced text's own
 * formatting. ProseMirror's insertText carries only the marks that also
 * continue past `to` (a non-inclusive link ends with the word) or the stored
 * marks, so replacing a whole word with itself dropped its link, its direct
 * formatting and its proofing language (WUA 253).
 */
function insertTextAsReplaced(
  transaction: Transaction,
  text: string,
  from: number,
  to: number,
): Transaction {
  const marks = text ? firstReplacedCharacterMarks(transaction.doc, from, to) : null;
  if (!marks) return transaction.insertText(text, from, to);
  return transaction.replaceRangeWith(from, to, transaction.doc.type.schema.text(text, marks));
}

/**
 * A match inside an equation (`match.equation`) replaced in the equation's
 * LaTeX: the transaction with the equation's `latex` changed, or null when
 * it cannot be (its LaTeX cannot follow, the equation changed since it was
 * found), the equation then left exactly as it is, never flattened.
 */
export function replaceDocumentEquationMatch(
  transaction: Transaction,
  match: Pick<TextMatch, "from" | "equation">,
  text: string,
): Transaction | null {
  const equation = match.equation;
  if (!equation) return null;
  const node = transaction.doc.nodeAt(match.from);
  if (!node || !isDocumentEquationNode(node)) return null;
  const latex = String(node.attrs.latex);
  if (documentEquationFindText(latex).slice(equation.start, equation.end) !== equation.found) return null;
  const edited = documentEquationTextReplaced(latex, equation.start, equation.end, text);
  if (edited === null) return null;
  return transaction.setNodeMarkup(match.from, undefined, { ...node.attrs, latex: edited }, node.marks);
}

/**
 * Replace one match's TEXT with `text`. A match never contains a visible
 * inline object (the matcher refuses to cross one), but it may run through an
 * invisible marker such as a point bookmark: only the text runs are replaced,
 * so the marker survives next to the replacement instead of being deleted with
 * the text. The replacement always starts at `match.from`.
 */
export function replaceDocumentTextMatch(
  transaction: Transaction,
  match: Pick<TextMatch, "from" | "to" | "guided" | "equation">,
  text: string,
): Transaction {
  // Inside an equation: its LaTeX, or nothing (never the equation's place).
  if (match.equation) return replaceDocumentEquationMatch(transaction, match, text) ?? transaction;
  if (match.guided) {
    // Only guided characters and text: anything else in the range (a
    // bookmark, a field) is not the replacement's to delete.
    let plain = transaction.doc.resolve(match.from).parent === transaction.doc.resolve(match.to).parent;
    transaction.doc.nodesBetween(match.from, match.to, (node) => {
      if (node.isInline && !node.isText && node.type.name !== "ruby") plain = false;
      return plain;
    });
    if (!plain) return transaction;
    return insertTextAsReplaced(transaction, match.guided.before + text + match.guided.after, match.from, match.to);
  }
  const textRuns: Array<{ from: number; to: number }> = [];
  let hasMarker = false;
  transaction.doc.nodesBetween(match.from, match.to, (node, pos) => {
    if (node.isText) {
      textRuns.push({
        from: Math.max(pos, match.from),
        to: Math.min(pos + node.nodeSize, match.to),
      });
      return false;
    }
    if (node.isInline && node.isLeaf) hasMarker = true;
    return true;
  });
  // A match across a page cut runs over the two halves of one paragraph:
  // each half keeps its place (the paginator re-flows them), instead of a
  
  const acrossCut =
    transaction.doc.resolve(match.from).parent !==
    transaction.doc.resolve(match.to).parent;
  if ((!hasMarker && !acrossCut) || textRuns.length === 0) {
    return insertTextAsReplaced(transaction, text, match.from, match.to);
  }
  let next = transaction;
  for (const run of textRuns.slice(1).reverse()) next = next.delete(run.from, run.to);
  return insertTextAsReplaced(next, text, textRuns[0].from, textRuns[0].to);
}

export function collectTextMatchesFromDoc(
  doc: ProseMirrorNode,
  query: string,
  caseSensitive: boolean,
  regex = false,
  wholeWord = false,
  options: DocumentFindOptions = {},
): TextMatch[] {
  if (!query) return [];
  const matches: TextMatch[] = [];

  type LogicalBlock = {
    type: string;
    text: string;
    positions: number[];
    // Offsets of inline objects (line breaks, pictures, fields, ...). They
    // are not text: a text search must neither join the words on either
    // side of one ("foo<break>bar" is not "foobar") nor ever swallow one,
    // or the replacement would delete the object with the text around it.
    objectOffsets: number[];
    // Inline objects that SHOW text (a citation's "(Doe, 2021)"): a search
    // reads it and may find a word inside it, which selects the object; a
    
    readable: Array<{ start: number; end: number; pos: number; base?: boolean; equation?: boolean }>;
    /** The paragraph's content range (a cut paragraph: head start to tail
     *  end), and its story: paragraphs one ^p apart share it. */
    start: number;
    end: number;
    story: string;
  };

  // Word's syntax: the objects a pattern names may be taken into a match.
  const wordPattern =
    !regex && wordFindUsesSyntax(query, options.wildcards === true)
      ? documentWordFindPattern(query, caseSensitive, options)
      : null;
  if (!regex && wordFindUsesSyntax(query, options.wildcards === true) && !wordPattern) return [];
  const allowedObjects: ReadonlySet<string> = wordPattern?.objects ?? new Set();
  const endnoteMode = resolveFootnoteMode(doc.attrs?.footnoteMode) === "endnote";
  const objectCharacter = (child: ProseMirrorNode): string => {
    if (child.type.name === "hardBreak") return FIND_OBJECT_CHARS.lineBreak;
    if (isPictureNode(child)) return FIND_OBJECT_CHARS.graphic;
    if (child.type.name === DOCUMENT_FIELD_NODE_NAME) return FIND_OBJECT_CHARS.field;
    if (child.type.name === FOOTNOTE_MARK_NAME) {
      return endnoteMode ? FIND_OBJECT_CHARS.endnote : FIND_OBJECT_CHARS.footnote;
    }
    return FIND_INLINE_OBJECT_BOUNDARY;
  };
  const blockedBy = (block: LogicalBlock, span: { start: number; end: number }) =>
    block.objectOffsets.some(
      (offset) =>
        offset >= span.start &&
        offset < span.end &&
        !allowedObjects.has(block.text[offset] ?? ""),
    );

  // An equation reads its characters (Word finds them in its math runs): a
  // match inside one run of them is replaced in the equation's LaTeX; a
  // structure between runs (a fraction's bar) is a boundary nothing crosses.
  const readEquation = (block: LogicalBlock, node: ProseMirrorNode, objectPos: number) => {
    const shown = documentEquationFindText(String(node.attrs.latex));
    if (!shown) {
      block.objectOffsets.push(block.text.length);
      block.text += FIND_INLINE_OBJECT_BOUNDARY;
      block.positions.push(objectPos);
      return;
    }
    const start = block.text.length;
    for (let offset = 0; offset < shown.length; offset += 1) {
      if (shown[offset] === EQUATION_FIND_BOUNDARY) block.objectOffsets.push(start + offset);
      block.positions.push(objectPos);
    }
    block.text += shown;
    block.readable.push({ start, end: block.text.length, pos: objectPos, equation: true });
  };

  const readBlock = (block: LogicalBlock, node: ProseMirrorNode, pos: number) => {
    node.descendants((child, childPos) => {
      if (child.isText) {
        if (!child.text) return;
        const textStart = pos + 1 + childPos;
        block.text += child.text;
        for (let offset = 0; offset < child.text.length; offset += 1) {
          block.positions.push(textStart + offset);
        }
        return;
      }
      if (!child.isLeaf || FIND_TRANSPARENT_INLINE_NODES.has(child.type.name)) {
        return;
      }
      const objectPos = pos + 1 + childPos;
      if (isDocumentEquationNode(child)) {
        readEquation(block, child, objectPos);
        return;
      }
      // A phonetic guide's base is the words themselves (Word finds
      // "中文测试" with pinyin over it, WUA 134), one object per character.
      const base = child.type.name === "ruby" && typeof child.attrs.base === "string" ? child.attrs.base : "";
      const shown =
        child.type.name === CITATION_MARK_NAME ? citationDisplayText(doc, child, "") : base;
      if (shown) {
        block.readable.push({
          start: block.text.length,
          end: block.text.length + shown.length,
          pos: objectPos,
          ...(base ? { base: true } : {}),
        });
        block.text += shown;
        for (let offset = 0; offset < shown.length; offset += 1) {
          block.positions.push(objectPos);
        }
        return;
      }
      block.objectOffsets.push(block.text.length);
      block.text += objectCharacter(child);
      block.positions.push(objectPos);
    });
  };

  const searchBlock = (block: LogicalBlock) => {
    for (const span of findDocumentTextSpans(
      block.text,
      query,
      caseSensitive,
      regex,
      wholeWord,
      options,
    )) {
      takeSpan(block, span);
    }
  };
  const takeSpan = (block: LogicalBlock, span: DocumentTextSpanMatch) => {
    {
      if (blockedBy(block, span)) return;
      const touched = block.readable.filter(
        (object) => span.start < object.end && span.end > object.start,
      );
      if (touched.length > 0 && touched.every((object) => object.base)) {
        // Words under a phonetic guide: the match takes whole guided
        // characters (and the plain text beside them). Replacing them, as
        // in Word, replaces the words; the replaced characters' guide goes.
        const first = touched[0];
        const last = touched[touched.length - 1];
        const startPos = block.positions[span.start];
        const endPos = block.positions[span.end - 1];
        if (typeof startPos === "number" && typeof endPos === "number") {
          const shownText = (object: { start: number; end: number }) =>
            block.text.slice(object.start, object.end);
          matches.push({
            from: Math.min(startPos, first.pos),
            to: Math.max(endPos + 1, last.pos + 1),
            guided: {
              before: span.start > first.start ? shownText(first).slice(0, span.start - first.start) : "",
              after: span.end < last.end ? shownText(last).slice(span.end - last.start) : "",
            },
          });
        }
        return;
      }
      if (touched.length > 0) {
        // Only a match inside one object's shown text: it selects the
        // object, never a part of it with the text beside it.
        const [object] = touched;
        if (touched.length > 1 || span.start < object.start || span.end > object.end) {
          return;
        }
        if (object.equation) {
          // Inside an equation: replaced in its LaTeX (or left whole).
          const equation = {
            start: span.start - object.start,
            end: span.end - object.start,
            found: block.text.slice(span.start, span.end),
          };
          matches.push(
            span.captures
              ? {
                  from: object.pos,
                  to: object.pos + 1,
                  equation,
                  captures: span.captures,
                  ...(span.namedGroups ? { namedGroups: span.namedGroups } : {}),
                }
              : { from: object.pos, to: object.pos + 1, equation },
          );
          return;
        }
        matches.push({ from: object.pos, to: object.pos + 1, readOnly: true });
        return;
      }
      const from = block.positions[span.start];
      const to = block.positions[span.end - 1];
      if (typeof from === "number" && typeof to === "number") {
        // Text inside a control whose contents are locked is found, never
        // rewritten (Word: "Contents cannot be edited"); Replace moves on.
        // A drop-down list's text is one of its items, never free text: a
        // match over PART of it cannot be rewritten (the control refuses the
        // result), so it is found and skipped like a locked control instead
        
        // whole item is replaced when the replacement is an item (OFL-025).
        const controlMark = (doc.resolve(from).nodeAfter?.marks ?? []).find(
          (mark) => mark.type.name === CONTENT_CONTROL_MARK_NAME,
        );
        const partialDropDown = (): boolean => {
          const range = controlRangeAt(doc, from);
          return range !== null && (from > range.from || to + 1 < range.to);
        };
        const lockedControl =
          controlMark !== undefined &&
          (isContentControlFillLocked(controlMark.attrs.lock) ||
            (controlMark.attrs.controlType === "dropDownList" && partialDropDown()));
        matches.push(
          span.captures
            ? {
                from,
                to: to + 1,
                captures: span.captures,
                ...(lockedControl ? { readOnly: true } : {}),
                ...(span.namedGroups ? { namedGroups: span.namedGroups } : {}),
              }
            : { from, to: to + 1, ...(lockedControl ? { readOnly: true } : {}) },
        );
      }
    }
  };

  // A story's paragraphs joined by paragraph marks (Word's ^p): a match
  // inside one paragraph is taken as one; a match over a mark runs from
  // where it starts to where it ends, objects it does not name and text an
  // object shows stopping it.
  const searchStory = (group: readonly LogicalBlock[]) => {
    let text = "";
    const owners: Array<{ block: LogicalBlock; offset: number }> = [];
    group.forEach((block, index) => {
      if (index > 0) text += FIND_PARAGRAPH_MARK;
      owners.push({ block, offset: text.length });
      text += block.text;
    });
    const ownerAt = (offset: number) => {
      let found = owners[0]!;
      for (const owner of owners) {
        if (owner.offset <= offset) found = owner;
        else break;
      }
      return found;
    };
    for (const span of findDocumentTextSpans(text, query, caseSensitive, regex, wholeWord, options)) {
      const first = ownerAt(span.start);
      const last = ownerAt(Math.max(span.start, span.end - 1));
      if (first === last && span.start >= first.offset && span.end <= first.offset + first.block.text.length) {
        takeSpan(first.block, { ...span, start: span.start - first.offset, end: span.end - first.offset });
        continue;
      }
      // Over at least one paragraph mark.
      const touched = owners.filter(
        (owner) => owner.offset < span.end && owner.offset + owner.block.text.length + 1 > span.start,
      );
      const blocked = touched.some(({ block, offset }) => {
        const local = { start: Math.max(0, span.start - offset), end: Math.min(block.text.length, span.end - offset) };
        return (
          blockedBy(block, local) ||
          block.readable.some((object) => local.start < object.end && local.end > object.start) ||
          block.story.startsWith("caption:")
        );
      });
      if (blocked) continue;
      // Where a match starts and ends in the document: a character's own
      // position, or the end of the paragraph a mark closes (start) and the
      // start of the paragraph it opens (end).
      const startAt = (offset: number): number => {
        const owner = ownerAt(offset);
        const local = offset - owner.offset;
        if (local >= owner.block.text.length) return owner.block.end;
        return owner.block.positions[local] ?? owner.block.start;
      };
      const endAfter = (offset: number): number => {
        if (text[offset] === FIND_PARAGRAPH_MARK) {
          const next = owners.find((owner) => owner.offset > offset);
          return next ? next.block.start : ownerAt(offset).block.end;
        }
        const owner = ownerAt(offset);
        const position = owner.block.positions[offset - owner.offset];
        return position === undefined ? owner.block.end : position + 1;
      };
      matches.push({
        from: startAt(span.start),
        to: endAfter(span.end - 1),
        acrossParagraphs: true,
        ...(span.captures ? { captures: span.captures } : {}),
      });
    }
  };

  // A paragraph the page edge cut is ONE paragraph: its head (stamped
  // "continues") and the tail on the next page are searched as one text, so
  
  // blocks (a footnote slice at the page foot) may sit between the two.
  let openHead: LogicalBlock | null = null;
  // Each caption's live number, read once for every caption searched.
  let captions: Map<string, ReturnType<typeof collectCaptionsFromDoc>[number]> | null = null;
  const blocks: LogicalBlock[] = [];
  // A paragraph's story for ^p: its nearest container that is not a page
  // sheet, and the run of paragraphs no table, break or picture interrupts.
  let run = 0;
  const storyOf = (pos: number): string => {
    const $pos = doc.resolve(pos);
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      if ($pos.node(depth).type.name !== "pageBlock") return `${$pos.before(depth)}:${run}`;
    }
    return `doc:${run}`;
  };
  doc.descendants((node, pos) => {
    // The page's repeated copy of a table header row is read-only display:
    // its words are found once, in the source row.
    if (node.attrs?.[TABLE_REPEATED_HEADER_ATTR] === true) return false;
    // A caption is a paragraph in Word ("Figure 1: Sales"): its prefix and
    // description are found, though the atom holds no text of its own (WUA
    // 204: its description found 0 of 0). A match selects the caption; a
    // replacement leaves it alone, as it does a citation's shown text.
    if (node.type.name === CAPTION_NODE_NAME) {
      run += 1;
      captions ??= new Map(collectCaptionsFromDoc(doc).map((entry) => [entry.id, entry]));
      const shown = captionDisplayText(
        node.attrs,
        captions.get(String(node.attrs?.[CAPTION_ANCHOR_ID_ATTR] ?? "")),
      );
      if (shown) {
        blocks.push({
          type: node.type.name,
          text: shown,
          positions: Array.from(shown, () => pos),
          objectOffsets: [],
          readable: [{ start: 0, end: shown.length, pos }],
          start: pos,
          end: pos + node.nodeSize,
          story: `caption:${pos}`,
        });
      }
      return false;
    }
    // A display equation is a paragraph of its own in Word: its characters
    // are found, a match replaced in its LaTeX.
    if (node.isBlock && isDocumentEquationNode(node)) {
      run += 1;
      const block: LogicalBlock = {
        type: node.type.name,
        text: "",
        positions: [],
        objectOffsets: [],
        readable: [],
        start: pos,
        end: pos + node.nodeSize,
        story: `equation:${pos}`,
      };
      readEquation(block, node, pos);
      if (block.readable.length) blocks.push(block);
      return false;
    }
    if (!node.isTextblock) {
      if (node.isBlock && node.type.name !== "pageBlock") run += 1;
      return true;
    }
    const continues = node.attrs?.[SPLIT_CONTINUES_ATTR] === true;
    let block: LogicalBlock;
    if (isContinuationTail(node) && openHead && openHead.type === node.type.name) {
      block = openHead;
      block.end = pos + node.nodeSize - 1;
      if (node.type.name === SPLITTABLE_BLOCK_TYPE) {
        // A code block's cut consumed the newline between its lines.
        block.objectOffsets.push(block.text.length);
        block.text += FIND_INLINE_OBJECT_BOUNDARY;
        block.positions.push(pos);
      }
    } else {
      block = {
        type: node.type.name,
        text: "",
        positions: [],
        objectOffsets: [],
        readable: [],
        start: pos + 1,
        end: pos + node.nodeSize - 1,
        story: storyOf(pos),
      };
    }
    readBlock(block, node, pos);
    if (continues) {
      if (openHead && openHead !== block) blocks.push(openHead);
      openHead = block;
    } else {
      if (block === openHead) openHead = null;
      blocks.push(block);
    }
    return false;
  });
  if (openHead) blocks.push(openHead);
  if (!wordPattern?.paragraph) {
    for (const block of blocks) searchBlock(block);
  } else {
    // ^p: the paragraphs of a story are searched as one text, a paragraph
    // mark between each two.
    const ordered = [...blocks].sort((left, right) => left.start - right.start);
    let group: LogicalBlock[] = [];
    const flush = () => {
      if (group.length) searchStory(group);
      group = [];
    };
    for (const block of ordered) {
      if (group.length && group[group.length - 1]!.story !== block.story) flush();
      group.push(block);
    }
    flush();
  }
  return matches.sort((left, right) => left.from - right.from);
}

export type DocumentFindMarkFormat = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  /** Find > Format > Highlight: text under any highlight. */
  highlight?: boolean;
  /** Find > Format > Style: "heading:2", or a style's id ("id:Quote"). */
  style?: string | null;
  /** Find > Format > Font: the family every run is set in. */
  fontFamily?: string | null;
};

/** The paragraph style a block is in, as Find > Format > Style names it. */
export function documentFindStyleKeyOf(block: ProseMirrorNode): string | null {
  if (block.type.name === "heading") return `heading:${Number(block.attrs.level) || 1}`;
  const id = block.attrs?.docxStyleId ?? block.attrs?.customStyleId;
  return typeof id === "string" && id ? `id:${id}` : "normal";
}

/** The styles and fonts the document uses, for Find and Replace's Format. */
export function documentFindFormatChoices(doc: ProseMirrorNode): {
  styles: Array<{ key: string; name: string }>;
  fonts: string[];
} {
  const styles = new Map<string, string>();
  const fonts = new Set<string>();
  const named = new Map<string, string>();
  for (const style of (Array.isArray(doc.attrs?.namedStyles) ? doc.attrs.namedStyles : []) as Array<Record<string, unknown>>) {
    if (typeof style?.styleId === "string") named.set(style.styleId, String(style.name ?? style.styleId));
  }
  const definitions = (doc.attrs?.styleDefinitions as { styles?: Array<Record<string, unknown>> } | null)?.styles ?? [];
  for (const style of definitions) {
    if (typeof style?.styleId === "string" && !named.has(style.styleId)) {
      named.set(style.styleId, String(style.name ?? style.styleId));
    }
  }
  doc.descendants((node) => {
    if (node.isTextblock) {
      const key = documentFindStyleKeyOf(node);
      if (key && !styles.has(key)) {
        styles.set(
          key,
          key.startsWith("heading:") ? `Heading ${key.slice(8)}` : key === "normal" ? "Normal" : (named.get(key.slice(3)) ?? key.slice(3)),
        );
      }
    }
    for (const mark of node.marks) {
      if (mark.type.name === "fontFamily" && typeof mark.attrs.family === "string" && fonts.size < 60) {
        fonts.add(mark.attrs.family);
      }
    }
    return true;
  });
  return {
    styles: [...styles].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name)),
    fonts: [...fonts].sort((a, b) => a.localeCompare(b)),
  };
}

/**
 * Filter matches to those whose ENTIRE range carries every required mark (Word
 * "Find > Format > Font"). A required format whose mark is absent from the schema
 * is ignored; with no format required the matches pass through unchanged. PURE.
 */
export function filterMatchesByMarks(
  editor: Editor,
  matches: TextMatch[],
  format: DocumentFindMarkFormat,
): TextMatch[] {
  return filterDocMatchesByMarks(editor.state.doc, matches, format);
}

/**
 * Whether every run of [from, to] has a format AS DRAWN, as Word's Find >
 * Format reads it: bold and italic from the run's direct format, else its
 * character or paragraph style -- a heading's style bold counts, as it does
 * for Home's Bold button (`effectiveBoldAt` / `effectiveItalicAt`).
 */
function rangeFullyDrawn(
  doc: ProseMirrorNode,
  from: number,
  to: number,
  drawn: (pos: number, marks: readonly PmMark[]) => boolean,
): boolean {
  let all = true;
  doc.nodesBetween(from, to, (node, pos) => {
    if (!all) return false;
    if (node.isText && !drawn(pos, node.marks)) all = false;
    return true;
  });
  return all;
}

/**
 * Underlined as drawn: a direct underline (its "none" is an explicit off),
 * else a hyperlink, which Word's Hyperlink style underlines -- Word 16.86's
 * Find > Format > Underline finds a link's text as it finds directly
 * underlined text.
 */
function underlinedAsDrawn(marks: readonly PmMark[]): boolean {
  const direct = marks.find((mark) => mark.type.name === "underline");
  if (direct) return normalizeUnderlineStyle(direct.attrs.underlineStyle) !== "none";
  return marks.some((mark) => mark.type.name === "link");
}

/** Document-bound variant of {@link filterMatchesByMarks}. */
export function filterDocMatchesByMarks(
  doc: ProseMirrorNode,
  matches: TextMatch[],
  format: DocumentFindMarkFormat,
): TextMatch[] {
  const marks = doc.type.schema.marks;
  const bold = format.bold && Boolean(marks.bold);
  const italic = format.italic && Boolean(marks.italic);
  const underline = format.underline && Boolean(marks.underline);
  const highlight = format.highlight === true && Boolean(marks.highlight);
  const style = format.style ?? null;
  const font = format.fontFamily ? format.fontFamily.toLowerCase() : null;
  if (!bold && !italic && !underline && !highlight && !style && !font) return matches;
  const state = { doc };
  const defaultFont = String(doc.attrs?.defaultFontFamily ?? "").toLowerCase();
  return matches.filter(
    (match) =>
      (!bold || rangeFullyDrawn(doc, match.from, match.to, (pos, runMarks) => effectiveBoldAt(state, pos, runMarks))) &&
      (!italic || rangeFullyDrawn(doc, match.from, match.to, (pos, runMarks) => effectiveItalicAt(state, pos, runMarks))) &&
      (!underline || rangeFullyDrawn(doc, match.from, match.to, (_pos, runMarks) => underlinedAsDrawn(runMarks))) &&
      (!highlight ||
        rangeFullyDrawn(doc, match.from, match.to, (_pos, runMarks) =>
          runMarks.some((mark) => mark.type.name === "highlight"),
        )) &&
      (!font ||
        rangeFullyDrawn(doc, match.from, match.to, (_pos, runMarks) => {
          const family = runMarks.find((mark) => mark.type.name === "fontFamily")?.attrs.family;
          return (typeof family === "string" ? family.toLowerCase() : defaultFont) === font;
        })) &&
      (!style || documentFindStyleKeyOf(doc.resolve(match.from).parent) === style),
  );
}

function selectMatch(editor: Editor, match: TextMatch | undefined): void {
  if (!match) return;
  if (match.equation) {
    // The equation the match is in, as an object (a display equation has no
    // text position to hold a text selection).
    editor.commands.setNodeSelection(match.from);
    return;
  }
  editor.commands.setTextSelection(match);
}

/**
 * Replace > Format > Paragraph (Word's Replace Paragraph dialog, the subset
 * the paragraph model carries): every paragraph that receives a replacement
 * takes these values. An empty field leaves that property unchanged, as an
 * unset field in Word's Replace Format does.
 */
export interface DocumentReplaceParagraphFormat {
  textAlign: "" | "left" | "center" | "right" | "justify";
  lineHeight: "" | (typeof LINE_HEIGHT_VALUES)[number];
  spaceBefore: string;
  spaceAfter: string;
}

const EMPTY_PARAGRAPH_FORMAT: DocumentReplaceParagraphFormat = {
  textAlign: "",
  lineHeight: "",
  spaceBefore: "",
  spaceAfter: "",
};

export function replaceParagraphFormatActive(
  format: DocumentReplaceParagraphFormat,
): boolean {
  return Boolean(
    format.textAlign ||
      format.lineHeight ||
      format.spaceBefore.trim() ||
      format.spaceAfter.trim(),
  );
}

/**
 * The attrs one textblock takes from a Replace paragraph format, or null when
 * nothing changes. Only attributes the block's schema declares are written;
 * values run through the same normalizers the Paragraph dialog uses, so an
 * out-of-range number is dropped (fail closed) instead of stored.
 */
export function paragraphAttrsForReplaceFormat(
  attrs: Record<string, unknown>,
  declared: Readonly<Record<string, unknown>>,
  format: DocumentReplaceParagraphFormat,
  defaultAlign: string,
): Record<string, unknown> | null {
  const next: Record<string, unknown> = { ...attrs };
  if (format.textAlign && "textAlign" in declared) {
    const align = normalizeTextAlign(format.textAlign);
    if (align) next.textAlign = align === defaultAlign ? null : align;
  }
  if (format.lineHeight && "lineHeight" in declared) {
    const lineHeight = normalizeLineHeight(format.lineHeight);
    if (lineHeight) {
      next.lineHeight = lineHeight;
      if ("lineHeightPt" in declared) next.lineHeightPt = null;
      if ("lineHeightRule" in declared) next.lineHeightRule = null;
    }
  }
  for (const [field, attr] of [
    ["spaceBefore", "spaceBefore"],
    ["spaceAfter", "spaceAfter"],
  ] as const) {
    const raw = format[field].trim();
    if (!raw || !(attr in declared)) continue;
    const points = normalizeSpacing(Number(raw));
    if (points === null) continue;
    next[attr] = points === 0 ? null : points;
  }
  return Object.keys(next).some((key) => next[key] !== attrs[key])
    ? next
    : null;
}

/**
 * Home > Replace: write `replacement` over every match in one transaction (one
 * Undo step), in reverse so earlier positions stay valid. Regex captures
 * (`$1`, `$<name>`) expand; `marks` are stamped onto each replacement; a
 * paragraph format, when given, goes onto every paragraph that received one.
 * The Replace pane and the AI's Replace command both call this.
 */
/**
 * Replace one match by Word's replacement parts: the match's range goes (over
 * a paragraph mark the two paragraphs join, as Backspace joins them), then the
 * text, paragraph marks (a split), line breaks and page or column breaks are
 * written where it began.
 */
/** A replacement's format: a mark type (Bold) or a mark with its value
 *  (a highlight colour, a font). */
type ReplacementMark = MarkType | PmMark;
const markOf = (mark: ReplacementMark): PmMark =>
  "type" in mark && "attrs" in mark && !("create" in mark) ? (mark as PmMark) : (mark as MarkType).create();

function applyWordReplacement(
  transaction: Transaction,
  match: Pick<TextMatch, "from" | "to">,
  parts: readonly WordReplacementPart[],
  marks: readonly ReplacementMark[],
): Transaction {
  const { schema } = transaction.doc.type;
  // Read before the found text goes: the replacement is written in the
  // formatting of the first character it replaces (WUA 253).
  const found = firstReplacedCharacterMarks(transaction.doc, match.from, match.to);
  let tr = transaction.delete(match.from, match.to);
  let at = tr.mapping.map(match.from, -1);
  for (const part of parts) {
    if (part.kind === "text") {
      if (!part.text) continue;
      tr = found ? tr.insert(at, schema.text(part.text, found)) : tr.insertText(part.text, at);
      for (const mark of marks) tr = tr.addMark(at, at + part.text.length, markOf(mark));
      at += part.text.length;
      continue;
    }
    if (part.kind === "lineBreak") {
      const hardBreak = schema.nodes.hardBreak;
      if (!hardBreak) continue;
      tr = tr.insert(at, hardBreak.create());
      at += 1;
      continue;
    }
    const $at = tr.doc.resolve(at);
    if (!$at.parent.isTextblock) continue;
    tr = tr.split(at);
    // The new paragraph starts two positions on (its parent's close and open).
    const between = at + 1;
    at += 2;
    const block =
      part.kind === "pageBreak"
        ? schema.nodes.pageBreak
        : part.kind === "columnBreak"
          ? schema.nodes.columnBreak
          : null;
    if (block) {
      tr = tr.insert(between, block.create());
      at += block.create().nodeSize;
    }
  }
  return tr;
}

export function replaceDocumentTextMatches(
  transaction: Transaction,
  requested: readonly Pick<
    TextMatch,
    "from" | "to" | "captures" | "namedGroups" | "readOnly" | "guided" | "equation"
  >[],
  options: {
    replacement: string;
    marks?: readonly ReplacementMark[];
    paragraphFormat?: DocumentReplaceParagraphFormat | null;
    /** Replace > Format > Style: the paragraphs replaced in take it
     *  ("heading:2", or "normal"). */
    paragraphStyle?: string | null;
    /** The Replace with text is read in Word's syntax (^p, ^&, \1 ...). */
    wordSyntax?: { readonly wildcards: boolean; readonly clipboard?: string } | null;
    /** Told of each match inside an equation that is left as it is. */
    onEquationLeft?: () => void;
  },
): Transaction {
  const { replacement, marks = [], paragraphFormat = null, wordSyntax = null, paragraphStyle = null } = options;
  // Text an object shows (a citation) is found, never rewritten.
  const targets = requested.filter((target) => !target.readOnly);
  for (const match of [...targets].reverse()) {
    if (match.equation) {
      // Inside an equation: the same characters changed in its LaTeX. A
      // replacement with formatting, a break or anything but characters
      // cannot be written there: the equation is left whole and counted.
      let text: string | null = expandDocumentReplacement(replacement, match.captures, match.namedGroups);
      if (wordSyntax) {
        const parts = expandWordReplacement(replacement, {
          wildcards: wordSyntax.wildcards,
          found: match.equation.found,
          captures: match.captures,
          clipboard: wordSyntax.clipboard,
        });
        text = parts && parts.every((part) => part.kind === "text")
          ? parts.map((part) => (part.kind === "text" ? part.text : "")).join("")
          : null;
      }
      const edited = text !== null && marks.length === 0
        ? replaceDocumentEquationMatch(transaction, match, text)
        : null;
      if (edited) transaction = edited;
      else options.onEquationLeft?.();
      continue;
    }
    if (wordSyntax && !match.guided) {
      const parts = expandWordReplacement(replacement, {
        wildcards: wordSyntax.wildcards,
        found: transaction.doc.textBetween(match.from, match.to, "\n", "\uFFFC"),
        captures: match.captures,
        clipboard: wordSyntax.clipboard,
      });
      if (parts) transaction = applyWordReplacement(transaction, match, parts, marks);
      continue;
    }
    // In regex mode expand `$1`-style capture refs; plain mode keeps the
    // literal replacement (captures is undefined → verbatim) byte-for-byte.
    const text = expandDocumentReplacement(
      replacement,
      match.captures,
      match.namedGroups,
    );
    transaction = replaceDocumentTextMatch(transaction, match, text);
    if (text.length) {
      const start = match.from + (match.guided?.before.length ?? 0);
      for (const markType of marks) {
        transaction = transaction.addMark(
          start,
          start + text.length,
          markOf(markType),
        );
      }
    }
  }
  if (paragraphStyle === "normal" || paragraphStyle?.startsWith("heading:")) {
    const { schema } = transaction.doc.type;
    const level = paragraphStyle.startsWith("heading:") ? Number(paragraphStyle.slice(8)) : 0;
    const type = level ? schema.nodes.heading : schema.nodes.paragraph;
    const blocks = new Set<number>();
    for (const match of targets) {
      const $pos = transaction.doc.resolve(transaction.mapping.map(match.from, -1));
      if ($pos.depth > 0 && $pos.parent.isTextblock) blocks.add($pos.before($pos.depth));
    }
    for (const pos of blocks) {
      const node = transaction.doc.nodeAt(pos);
      if (!node || !type || (node.type.name !== "paragraph" && node.type.name !== "heading")) continue;
      const attrs = { ...node.attrs, ...(level ? { level } : {}) };
      transaction = transaction.setNodeMarkup(pos, type, type.validContent(node.content) ? attrs : node.attrs, node.marks);
    }
  }
  if (paragraphFormat && replaceParagraphFormatActive(paragraphFormat)) {
    const defaultAlign =
      normalizeTextAlign(transaction.doc.attrs.defaultTextAlign) ?? "left";
    const blocks = new Set<number>();
    for (const match of targets) {
      const $pos = transaction.doc.resolve(
        transaction.mapping.map(match.from, -1),
      );
      if ($pos.depth > 0 && $pos.parent.isTextblock) {
        blocks.add($pos.before($pos.depth));
      }
    }
    for (const pos of blocks) {
      const node = transaction.doc.nodeAt(pos);
      if (!node) continue;
      const next = paragraphAttrsForReplaceFormat(
        node.attrs,
        node.type.spec.attrs ?? {},
        paragraphFormat,
        defaultAlign,
      );
      if (next) {
        transaction = transaction.setNodeMarkup(pos, undefined, next, node.marks);
      }
    }
  }
  return transaction;
}

/**
 * Word's Special menu (Find and Replace > More): each code, its name, and the
 * boxes it is offered in -- Find, Find with wildcards, Replace with.
 */
const DOCUMENT_FIND_SPECIALS: ReadonlyArray<
  readonly [string, `findReplace.special.${string}`, ReadonlyArray<"find" | "wildcards" | "replace">]
> = [
  ["^p", "findReplace.special.paragraph", ["find", "replace"]],
  ["^t", "findReplace.special.tab", ["find", "wildcards", "replace"]],
  ["^?", "findReplace.special.anyCharacter", ["find"]],
  ["^#", "findReplace.special.anyDigit", ["find"]],
  ["^$", "findReplace.special.anyLetter", ["find"]],
  ["^^", "findReplace.special.caret", ["find", "wildcards", "replace"]],
  ["^&", "findReplace.special.findWhat", ["replace"]],
  ["^c", "findReplace.special.clipboard", ["replace"]],
  ["^%", "findReplace.special.section", ["find", "wildcards", "replace"]],
  ["^v", "findReplace.special.pilcrow", ["find", "wildcards", "replace"]],
  ["^+", "findReplace.special.emDash", ["find", "wildcards", "replace"]],
  ["^=", "findReplace.special.enDash", ["find", "wildcards", "replace"]],
  ["^l", "findReplace.special.lineBreak", ["find", "wildcards", "replace"]],
  ["^m", "findReplace.special.pageBreak", ["find", "replace"]],
  ["^n", "findReplace.special.columnBreak", ["find", "replace"]],
  ["^~", "findReplace.special.nonbreakingHyphen", ["find", "wildcards", "replace"]],
  ["^s", "findReplace.special.nonbreakingSpace", ["find", "wildcards", "replace"]],
  ["^-", "findReplace.special.optionalHyphen", ["find", "wildcards", "replace"]],
  ["^g", "findReplace.special.graphic", ["find", "wildcards"]],
  ["^d", "findReplace.special.field", ["find", "wildcards"]],
  ["^f", "findReplace.special.footnote", ["find", "wildcards"]],
  ["^e", "findReplace.special.endnote", ["find", "wildcards"]],
  ["^w", "findReplace.special.whiteSpace", ["find"]],
];

type StoryHit = DocumentHeaderFooterHit | DocumentNoteHit;

function isNoteHit(hit: StoryHit): hit is DocumentNoteHit {
  return "note" in hit;
}

function storySnippet(hit: StoryHit): DocumentFindResultSnippet {
  return buildFindSnippet(hit.line, hit.start, hit.end);
}

type EditorUpdate = { transaction?: Transaction; appendedTransactions?: readonly Transaction[] };

function subscribe(editor: Editor | null | undefined, refresh: (update?: EditorUpdate) => void) {
  const runtime = editor as unknown as {
    off?: (event: string, callback: (update?: EditorUpdate) => void) => unknown;
    on?: (event: string, callback: (update?: EditorUpdate) => void) => unknown;
  } | null;
  runtime?.on?.("update", refresh);
  return () => {
    runtime?.off?.("update", refresh);
  };
}

export default function DocumentFindReplace({
  editor: activeEditor,
  documentEditor,
  storyEditor = null,
  initialFocus,
  onClose,
}: DocumentFindReplaceProps) {
  const t = useTranslations("console-notebooks");
  // The bar wears the dialogs' chrome in Docs (tokens, fields, glass).
  const chromeTone = useOfficeDialogChrome();
  const mainEditor = documentEditor ?? activeEditor;
  const liveStoryEditor =
    storyEditor && !storyEditor.isDestroyed ? storyEditor : null;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const replacementInputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regex, setRegex] = useState(false);
  // Word's "Use wildcards"; the ^ codes are read whenever regex is off.
  const [wildcards, setWildcards] = useState(false);
  // The box Special inserts into: the one last focused.
  const [specialTarget, setSpecialTarget] = useState<"find" | "replace">("find");
  useEffect(() => {
    const input = findInputRef.current;
    if (!input) return;
    const onFocus = () => setSpecialTarget("find");
    input.addEventListener("focus", onFocus);
    return () => input.removeEventListener("focus", onFocus);
  });
  // Word's ^c: the clipboard's text, read when the Replace box names it.
  const clipboardTextRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (regex || !replacement.includes("^c")) return;
    void navigator.clipboard?.readText?.().then(
      (text) => {
        clipboardTextRef.current = text;
      },
      () => undefined,
    );
  }, [regex, replacement]);
  const [wholeWord, setWholeWord] = useState(false);
  // Word's "More >>" options and the story being searched (Find In).
  const [moreOpen, setMoreOpen] = useState(false);
  const [scope, setScope] = useState<DocumentFindScope>(() =>
    liveStoryEditor && activeEditor === liveStoryEditor
      ? "headersFooters"
      : "main",
  );
  const [matchPrefix, setMatchPrefix] = useState(false);
  const [matchSuffix, setMatchSuffix] = useState(false);
  const [ignorePunctuation, setIgnorePunctuation] = useState(false);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  // Optional formatting applied to each REPLACEMENT (Word "Replace with format").
  // Off by default → replacements stay plain, so a non-format replace is unchanged.
  const [replaceFormat, setReplaceFormat] = useState<{
    bold: boolean;
    italic: boolean;
    underline: boolean;
    highlight: boolean;
    style: string | null;
    fontFamily: string | null;
  }>({
    bold: false,
    italic: false,
    underline: false,
    highlight: false,
    style: null,
    fontFamily: null,
  });
  const [replaceParagraphFormat, setReplaceParagraphFormat] =
    useState<DocumentReplaceParagraphFormat>(EMPTY_PARAGRAPH_FORMAT);
  // Restrict matches to text carrying ALL these formats (Word "Find > Format").
  // All-off → no restriction, so a plain search is byte-for-byte unchanged. Lives
  // in a small popover (a single toolbar button) so it never crowds the bar.
  const [findFormat, setFindFormat] = useState<{
    bold: boolean;
    italic: boolean;
    underline: boolean;
    highlight: boolean;
    style: string | null;
    fontFamily: string | null;
  }>({
    bold: false,
    italic: false,
    underline: false,
    highlight: false,
    style: null,
    fontFamily: null,
  });
  const [findFormatOpen, setFindFormatOpen] = useState(false);
  const findFormatWrapRef = useRef<HTMLDivElement | null>(null);
  const findFormatToggleRef = useRef<HTMLButtonElement | null>(null);
  const [documentVersion, setDocumentVersion] = useState(0);
  // The listed hits as the document stands now, moved along with the pages
  // since the list was drawn (null: a move took a hit out and put it in again).
  const liveSnapshotRef = useRef<TextMatchSnapshot | null>(null);
  // The editor searched in place: the body, or the open header/footer story.
  // Null when the story has no editor to search (a closed header/footer, the
  // note store), whose hits are listed from the model instead.
  const searchEditor: Editor | null =
    scope === "main"
      ? mainEditor
      : scope === "headersFooters"
        ? liveStoryEditor
        : null;
  const editor = searchEditor ?? mainEditor;
  const [editable, setEditable] = useState(
    () => !editor.isDestroyed && editor.isEditable,
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  // After Replace, the next current match is the first one starting past
  // the text just written; the replacement itself may contain the query
  // (cat → catfish), and re-matching at the same index replaced it again
  
  // Where the next match after a Replace starts: past the replacement (in
  // an equation, past it within the equation's characters).
  const advancePastRef = useRef<{ from: number; equationStart?: number } | null>(null);
  const [replaceExpanded, setReplaceExpanded] = useState(
    initialFocus?.target === "replace",
  );
  const findOptions = useMemo(
    () => ({
      wildcards: !regex && wildcards,
      matchPrefix: !wildcards && matchPrefix,
      matchSuffix: !wildcards && matchSuffix,
      // Word greys these out with wildcards, and regex is the same kind.
      ignorePunctuation: !regex && !wildcards && ignorePunctuation,
      ignoreWhitespace: !regex && !wildcards && ignoreWhitespace,
    }),
    [ignorePunctuation, ignoreWhitespace, matchPrefix, matchSuffix, regex, wildcards],
  );

  useEffect(() => {
    if (!initialFocus) return;
    if (initialFocus.target === "replace" && !replaceExpanded) {
      const frame = requestAnimationFrame(() => setReplaceExpanded(true));
      return () => cancelAnimationFrame(frame);
    }
    const target =
      initialFocus?.target === "replace"
        ? replacementInputRef.current
        : findInputRef.current;
    if (target?.isConnected) target.focus({ preventScroll: true });
  }, [initialFocus, replaceExpanded]);

  useEffect(() => {
    const refresh = (update?: EditorUpdate) => {
      const transactions = update?.transaction
        ? [update.transaction, ...(update.appendedTransactions ?? [])]
        : [];
      // The pages moved, the text did not (a long document lays itself out
      // for seconds after it opens): the hits stand, only their positions
      // move. The list is not searched and drawn again for that; every
      // pagination move did both, and a hit button pressed during one was
      // drawn anew under the pointer and its press lost.
      if (transactions.length > 0 && paginationOnlyChange(transactions)) {
        const live = liveSnapshotRef.current;
        liveSnapshotRef.current =
          live && live.doc === transactions[0]!.before
            ? moveSnapshot(live, transactions, editor.state.doc)
            : null;
        return;
      }
      setDocumentVersion((value) => value + 1);
      setEditable(!editor.isDestroyed && editor.isEditable);
    };
    refresh();
    const offEditor = subscribe(editor, refresh);
    const offMain = editor === mainEditor ? () => {} : subscribe(mainEditor, () => refresh());
    return () => {
      offEditor();
      offMain();
    };
  }, [editor, mainEditor]);

  const regexError = useMemo(() => {
    // Validate the EFFECTIVE pattern: a raw regex (regex mode), or the
    // boundary-wrapped pattern when whole-word / prefix / suffix is on (plain
    // mode can't be invalid since the query is escaped, but regex can). Plain
    // search never compiles a regex, so it has no error.
    if (regex) {
      const leading = wholeWord || matchPrefix;
      const trailing = wholeWord || matchSuffix;
      if (!(leading || trailing)) return validateDocumentRegex(query, caseSensitive);
      // A bounded search is valid exactly when its matcher compiles
      // (boundedSearchRegExp: the Unicode edges, else the legacy `\b`).
      if (query && boundedSearchRegExp(query, true, leading, trailing, caseSensitive)) return null;
      return validateDocumentRegex(
        buildBoundedSearchPattern(query, true, leading, trailing) ?? "",
        caseSensitive,
      ) ?? "Invalid regular expression";
    }
    return documentFindSyntaxError(query, wildcards);
  }, [regex, wholeWord, matchPrefix, matchSuffix, query, caseSensitive, wildcards]);
  const collectFor = useCallback(
    (doc: ProseMirrorNode): TextMatch[] => {
      if (regexError || !query) return [];
      return filterDocMatchesByMarks(
        doc,
        collectTextMatchesFromDoc(
          doc,
          query,
          caseSensitive,
          regex,
          wholeWord,
          findOptions,
        ),
        findFormat,
      );
    },
    [caseSensitive, findFormat, findOptions, query, regex, regexError, wholeWord],
  );
  // The styles and fonts the document uses, read when Format is opened.
  const formatChoices = useMemo(() => {
    void documentVersion;
    return findFormatOpen || replaceExpanded
      ? documentFindFormatChoices(mainEditor.state.doc)
      : { styles: [], fonts: [] };
  }, [documentVersion, findFormatOpen, mainEditor, replaceExpanded]);
  const matchSnapshot = useMemo<TextMatchSnapshot>(() => {
    void documentVersion;
    const doc = editor.state.doc;
    if (!searchEditor) return { doc, matches: [] };
    return { doc, matches: collectFor(doc) };
  }, [collectFor, documentVersion, editor, searchEditor]);
  useLayoutEffect(() => {
    liveSnapshotRef.current = matchSnapshot;
  }, [matchSnapshot]);
  // Hits in a story without an editor to search: a closed header/footer (its
  // band model) or the notes (the note store). Listed from the model.
  const storyHits = useMemo<StoryHit[]>(() => {
    void documentVersion;
    if (searchEditor || regexError || !query) return [];
    const matcher = (line: string) =>
      findDocumentTextSpans(
        line,
        query,
        caseSensitive,
        regex,
        wholeWord,
        findOptions,
      );
    const doc = mainEditor.state.doc;
    // Find > Format holds for a closed story too: the same test the open
    // story's editor applies, read from the story's own runs.
    const hits: StoryHit[] =
      scope === "notes"
        ? findInNoteStories(collectNoteStories(doc), matcher)
        : findInHeaderFooterStories(
            collectHeaderFooterStories(doc.attrs as Record<string, unknown>),
            matcher,
          );
    // A closed story's runs carry bold, italic and underline only: a
    // highlight, style or font asked for is not found there.
    if (findFormat.highlight || findFormat.style || findFormat.fontFamily) return [];
    return hits.filter((hit) => storyHitHasFormat(hit, findFormat));
  }, [
    caseSensitive,
    documentVersion,
    findFormat,
    findOptions,
    mainEditor,
    query,
    regex,
    regexError,
    scope,
    searchEditor,
    wholeWord,
  ]);
  const matches = matchSnapshot.matches;
  const renderedSnapshotIsCurrent = useCallback(
    () => editor.state.doc === matchSnapshot.doc,
    [editor, matchSnapshot.doc],
  );
  /**
   * The listed hits at their positions in the document as it stands: the
   * drawn list when the document is the one it was drawn from, else the list
   * moved along with the pages, else the same search again (only taken when
   * it finds as many hits: an edit not drawn yet waits for its own list).
   */
  const snapshotNow = useCallback((): TextMatchSnapshot | null => {
    const doc = editor.state.doc;
    if (doc === matchSnapshot.doc) return matchSnapshot;
    const live = liveSnapshotRef.current;
    if (live && live.doc === doc) return live;
    if (!searchEditor) return null;
    const again = collectFor(doc);
    return again.length === matchSnapshot.matches.length ? { doc, matches: again } : null;
  }, [collectFor, editor, matchSnapshot, searchEditor]);
  const findFormatActive =
    findFormat.bold ||
    findFormat.italic ||
    findFormat.underline ||
    findFormat.highlight ||
    Boolean(findFormat.style) ||
    Boolean(findFormat.fontFamily);
  // Close the find-format popover on a click outside it.
  useEffect(() => {
    if (!findFormatOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!findFormatWrapRef.current?.contains(event.target as Node)) {
        setFindFormatOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [findFormatOpen]);
  // A space is a query: the matcher and Replace act on the raw text, so the
  
  const hasQuery = query.length > 0;
  const resultCount = searchEditor ? matches.length : storyHits.length;
  const hasMatches = resultCount > 0;
  const boundedIndex = hasMatches ? Math.min(currentIndex, resultCount - 1) : 0;
  const currentMatch = searchEditor ? matches[boundedIndex] : undefined;
  const currentStoryHit = searchEditor ? undefined : storyHits[boundedIndex];
  const resultSnippets = useMemo(
    () =>
      searchEditor
        ? matches.map((match) =>
            buildDocumentFindResultSnippet(matchSnapshot.doc, match),
          )
        : storyHits.map(storySnippet),
    [matchSnapshot.doc, matches, searchEditor, storyHits],
  );

  // Word paints every match (Reading Highlight) and the current one apart.
  // The paint lives on the searched editor while the pane is open.
  // A document's main editor has the paint from the start (preparedBubbleMenu):
  // registering it here reconfigured the whole editor when the pane opened. A
  // closing pane then clears what it painted.
  useEffect(() => {
    if (!searchEditor || searchEditor.isDestroyed) return;
    const target = searchEditor;
    if (documentFindHighlightKey.getState(target.state)) {
      return () => {
        queueMicrotask(() => {
          if (target.isDestroyed || !documentFindHighlightKey.getState(target.state)?.collect) return;
          const clear: DocumentFindHighlightMeta = { collect: null, current: null };
          target.view.dispatch(target.state.tr
            .setMeta(documentFindHighlightKey, clear)
            .setMeta("addToHistory", false));
        });
      };
    }
    try {
      target.registerPlugin(createDocumentFindHighlightPlugin());
    } catch {
      return;
    }
    return () => {
      if (!target.isDestroyed) target.unregisterPlugin(documentFindHighlightKey);
    };
  }, [searchEditor]);
  useEffect(() => {
    const target = searchEditor;
    if (!target || target.isDestroyed) return;
    if (!documentFindHighlightKey.getState(target.state)) return;
    const meta: DocumentFindHighlightMeta = {
      collect: hasQuery ? collectFor : null,
      current: currentMatch
        ? { from: currentMatch.from, to: currentMatch.to }
        : null,
    };
    target.view.dispatch(
      target.state.tr
        .setMeta(documentFindHighlightKey, meta)
        .setMeta("addToHistory", false),
    );
  }, [collectFor, currentMatch, hasQuery, searchEditor]);

  // The current match is selected when the reader moves to it: a new query
  // or options, Next / Previous, a Replace. Typing elsewhere with the pane
  // open re-collects the matches but is not a move -- selecting the match
  
  const selectedNavigationRef = useRef<{
    collect: typeof collectFor;
    index: number;
    request: number;
  } | null>(null);
  // Bumped by a move that may land on the same index (Next over one match,
  // Replace), so the match is selected again.
  const [selectRequest, setSelectRequest] = useState(0);
  useEffect(() => {
    if (!hasQuery || !currentMatch) return;
    const now = snapshotNow();
    const target = now?.matches[boundedIndex];
    if (!target) return;
    const last = selectedNavigationRef.current;
    if (
      last &&
      last.collect === collectFor &&
      last.index === currentIndex &&
      last.request === selectRequest
    ) {
      return;
    }
    selectedNavigationRef.current = {
      collect: collectFor,
      index: currentIndex,
      request: selectRequest,
    };
    selectMatch(editor, target);
  }, [
    boundedIndex,
    collectFor,
    currentIndex,
    currentMatch,
    editor,
    hasQuery,
    selectRequest,
    snapshotNow,
  ]);

  const moveMatch = useCallback(
    (direction: 1 | -1) => {
      if (!hasMatches) return;
      if (searchEditor && !snapshotNow()) return;
      setSelectRequest((request) => request + 1);
      setCurrentIndex((index) => {
        const safeIndex = Math.min(index, resultCount - 1);
        return (safeIndex + direction + resultCount) % resultCount;
      });
    },
    [hasMatches, resultCount, searchEditor, snapshotNow],
  );

  // The header/footer hit the reader opened, until the story editor that
  // opens for it has listed its own matches: the current one is then that
  
  // of all hits became the second hit of the footer).
  const pendingStoryHitRef = useRef<{ lineIndex: number; start: number } | null>(null);
  const openStoryHit = useCallback(
    (hit: StoryHit) => {
      if (isNoteHit(hit)) {
        pendingStoryHitRef.current = null;
        const commands = mainEditor.commands as unknown as {
          scrollToFootnoteRef?: (noteId: string) => boolean;
        };
        commands.scrollToFootnoteRef?.(hit.note.id);
        return;
      }
      pendingStoryHitRef.current = { lineIndex: hit.lineIndex, start: hit.start };
      // Open the header/footer on its page; the pane then searches the
      // story editor that opens there, in place.
      const attrs = mainEditor.state.doc.attrs as Record<string, unknown>;
      window.dispatchEvent(
        new CustomEvent(OPEN_BAND_EDITOR_EVENT, {
          detail: {
            kind: hit.story.kind,
            variant: hit.story.variant,
            sheetIndex: sheetIndexForHeaderFooterStory(
              mainEditor.state.doc,
              hit.story,
              attrs.differentFirstPage === true,
            ),
          },
        }),
      );
    },
    [mainEditor],
  );

  useEffect(() => {
    const pending = pendingStoryHitRef.current;
    if (!pending || !searchEditor || searchEditor === mainEditor) return;
    if (!renderedSnapshotIsCurrent()) return;
    const index = matches.findIndex((match) => {
      const $from = matchSnapshot.doc.resolve(match.from);
      if (!$from.parent.isTextblock) return false;
      const blockStart = $from.before($from.depth);
      let line = 0;
      matchSnapshot.doc.nodesBetween(0, blockStart, (node) => {
        if (node.isTextblock) line += 1;
        return !node.isTextblock;
      });
      return line === pending.lineIndex && $from.parentOffset === pending.start;
    });
    pendingStoryHitRef.current = null;
    if (index >= 0) setCurrentIndex(index);
  }, [mainEditor, matchSnapshot.doc, matches, renderedSnapshotIsCurrent, searchEditor]);

  const activateMatch = useCallback(
    (index: number) => {
      if (!searchEditor) {
        const hit = storyHits[index];
        if (!hit) return false;
        setCurrentIndex(index);
        openStoryHit(hit);
        return true;
      }
      // A hit pressed while the pages were still moving is the same hit,
      // moved to where it stands now.
      const match = snapshotNow()?.matches[index];
      if (!match) return false;
      setCurrentIndex(index);
      selectMatch(editor, match);
      return true;
    },
    [
      editor,
      openStoryHit,
      searchEditor,
      snapshotNow,
      storyHits,
    ],
  );

  // The mark types to stamp onto each replacement, resolved from the live schema
  // (a mark missing from the schema is skipped). Empty when no format toggle is on
  // → the replace paths below insert plain text exactly as before.
  const replacementMarks = useMemo(() => {
    const out: ReplacementMark[] = [];
    const marks = editor.schema.marks;
    if (replaceFormat.bold && marks.bold) out.push(marks.bold);
    if (replaceFormat.italic && marks.italic) out.push(marks.italic);
    if (replaceFormat.underline && marks.underline) out.push(marks.underline);
    if (replaceFormat.highlight && marks.highlight) out.push(marks.highlight.create({ color: "#ffff00" }));
    if (replaceFormat.fontFamily && marks.fontFamily) {
      out.push(marks.fontFamily.create({ family: replaceFormat.fontFamily }));
    }
    return out;
  }, [editor, replaceFormat]);
  const paragraphFormatActive = replaceParagraphFormatActive(
    replaceParagraphFormat,
  );

  /** Replace the given matches in ONE transaction (one undo step). */
  const replaceMatches = useCallback(
    (targets: readonly TextMatch[]) => {
      let equationsLeft = 0;
      const transaction = replaceDocumentTextMatches(editor.state.tr, targets, {
        replacement,
        marks: replacementMarks,
        paragraphFormat: paragraphFormatActive ? replaceParagraphFormat : null,
        wordSyntax: regex ? null : { wildcards, clipboard: clipboardTextRef.current },
        paragraphStyle: replaceFormat.style,
        onEquationLeft: () => {
          equationsLeft += 1;
        },
      });
      const before = editor.state.doc;
      editor.view.dispatch(transaction.scrollIntoView());
      editor.commands.focus();
      // Matches inside an equation its LaTeX cannot follow are left, the
      // equation whole, and the reader is told how many (as in PowerPoint).
      if (equationsLeft > 0) {
        toast({ title: t("presentation.findReplace.equationSkipped", { count: equationsLeft }) });
      }
      // A guard may refuse the whole transaction (a control's contents, say):
      
      if (
        editor.state.doc === before &&
        (transaction.docChanged || targets.some((target) => !target.readOnly && !target.equation))
      ) {
        toast({ title: t("findReplace.replaceRefused"), variant: "destructive" });
      }
      return { equationsLeft };
    },
    [
      editor,
      t,
      paragraphFormatActive,
      replaceParagraphFormat,
      regex,
      replaceFormat.style,
      replacement,
      replacementMarks,
      wildcards,
    ],
  );

  /** Replace note hits through the note store, one transaction. */
  const replaceNoteHits = useCallback(
    (hits: readonly DocumentNoteHit[]) => {
      if (!hits.length || !mainEditor.isEditable || mainEditor.isDestroyed) {
        return;
      }
      const byNote = new Map<string, DocumentNoteHit[]>();
      for (const hit of hits) {
        byNote.set(hit.note.id, [...(byNote.get(hit.note.id) ?? []), hit]);
      }
      type NoteChain = {
        setFootnoteBody: (
          id: string,
          body: string,
          rich?: FootnoteRichBody,
        ) => NoteChain;
        run: () => boolean;
      };
      let chain = mainEditor.chain() as unknown as NoteChain;
      for (const [id, noteHits] of byNote) {
        const note = noteHits[0]!.note;
        const next = replaceNoteSpans(
          note,
          noteHits.map((hit) => ({
            start: hit.bodyStart,
            end: hit.bodyEnd,
            text: expandDocumentReplacement(
              replacement,
              hit.captures,
              hit.namedGroups,
            ),
          })),
          replaceFormat,
        );
        chain = chain.setFootnoteBody(id, next.body, next.rich);
      }
      chain.run();
    },
    [mainEditor, replaceFormat, replacement],
  );

  const replaceCurrent = useCallback(() => {
    if (regexError) return;
    if (!searchEditor) {
      if (currentStoryHit && isNoteHit(currentStoryHit)) {
        replaceNoteHits([currentStoryHit]);
      }
      return;
    }
    const currentNow = snapshotNow()?.matches[boundedIndex];
    if (
      editor.isDestroyed ||
      !editor.isEditable ||
      !currentMatch ||
      !currentNow
    ) {
      return;
    }
    if (currentNow.readOnly) {
      // A citation's shown text is found, not rewritten: Replace moves on.
      if (matches.length > 1) setCurrentIndex((boundedIndex + 1) % matches.length);
      return;
    }
    setSelectRequest((request) => request + 1);
    const replacedLength = expandDocumentReplacement(
      replacement,
      currentNow.captures,
      currentNow.namedGroups,
    ).length;
    const equation = currentNow.equation;
    advancePastRef.current = equation
      ? { from: currentNow.from, equationStart: equation.start + replacedLength }
      : { from: currentNow.from + (currentNow.guided?.before.length ?? 0) + replacedLength };
    const { equationsLeft } = replaceMatches([currentNow]);
    if (equation && equationsLeft > 0) {
      // Left as it is (its LaTeX cannot follow): Replace moves on.
      advancePastRef.current = null;
      if (matches.length > 1) setCurrentIndex((boundedIndex + 1) % matches.length);
    }
  }, [
    currentMatch,
    currentStoryHit,
    editor,
    boundedIndex,
    matches.length,
    regexError,
    replaceMatches,
    replaceNoteHits,
    replacement,
    searchEditor,
    snapshotNow,
  ]);
  useEffect(() => {
    const past = advancePastRef.current;
    if (past === null) return;
    advancePastRef.current = null;
    if (!searchEditor || matches.length === 0) return;
    const next = matches.findIndex((match) =>
      past.equationStart === undefined
        ? match.from >= past.from
        : match.from > past.from || (match.from === past.from && (match.equation?.start ?? 0) >= past.equationStart),
    );
    setCurrentIndex(next >= 0 ? next : 0);
  }, [matches, searchEditor]);

  const replaceAll = useCallback(() => {
    if (regexError) return;
    if (!searchEditor) {
      replaceNoteHits(storyHits.filter(isNoteHit));
      return;
    }
    const now = snapshotNow();
    if (
      editor.isDestroyed ||
      !editor.isEditable ||
      !now ||
      !now.matches.length
    ) {
      return;
    }
    replaceMatches(now.matches);
  }, [
    editor,
    regexError,
    replaceMatches,
    replaceNoteHits,
    searchEditor,
    snapshotNow,
    storyHits,
  ]);

  // A closed header/footer has no editor to replace in: its hits open it.
  const storyReplaceUnavailable = !searchEditor && scope === "headersFooters";
  const replaceDisabled =
    !editable ||
    !hasMatches ||
    Boolean(regexError) ||
    storyReplaceUnavailable;

  const matchText = regexError
    ? t("findReplace.regexError")
    : hasQuery
      ? `${hasMatches ? boundedIndex + 1 : 0}/${resultCount}`
      : t("findReplace.ready");
  const documentTextLength =
    typeof (mainEditor as RuntimeEditor).getText === "function"
      ? ((mainEditor as RuntimeEditor).getText?.().length ?? 0)
      : 0;
  const closeAndReturnFocus = useCallback(() => {
    onClose();
    requestAnimationFrame(() => {
      if (!editor.isDestroyed) editor.commands.focus();
    });
  }, [editor, onClose]);
  const resetIndex = () => setCurrentIndex(0);
  const storyHitLabel = (hit: StoryHit): string => {
    if (isNoteHit(hit)) {
      return t(
        hit.note.stream === "endnote"
          ? "findReplace.endnoteLabel"
          : "findReplace.footnoteLabel",
        { label: hit.note.label },
      );
    }
    const base = t(
      hit.story.kind === "footer"
        ? "findReplace.footerLabel"
        : "findReplace.headerLabel",
      { section: hit.story.sectionIndex + 1 },
    );
    return hit.story.variant === "first"
      ? `${base} ${t("findReplace.variantFirst")}`
      : hit.story.variant === "even"
        ? `${base} ${t("findReplace.variantEven")}`
        : base;
  };
  const optionChecks = [
    ["match-prefix", "findReplace.matchPrefix", matchPrefix, setMatchPrefix, wildcards && !regex],
    ["match-suffix", "findReplace.matchSuffix", matchSuffix, setMatchSuffix, wildcards && !regex],
    [
      "ignore-punctuation",
      "findReplace.ignorePunctuation",
      ignorePunctuation,
      setIgnorePunctuation,
      regex || wildcards,
    ],
    [
      "ignore-whitespace",
      "findReplace.ignoreWhitespace",
      ignoreWhitespace,
      setIgnoreWhitespace,
      regex || wildcards,
    ],
  ] as const;

  return (
    <OfficeFindPane
      testIdPrefix="document-find"
      rootRef={rootRef}
      className={
        chromeTone ? officeDialogClassName({ tone: chromeTone }) : undefined
      }
      rootData={{
        "data-testid": "document-find-replace",
        "data-find-scope": scope,
        "data-snapshot-current": renderedSnapshotIsCurrent() ? "true" : undefined,
      }}
      onRootKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          closeAndReturnFocus();
        }
      }}
      header={{
        title: t("findReplace.navigationPane.title"),
        closeLabel: t("findReplace.close"),
        onClose: closeAndReturnFocus,
      }}
      query={query}
      onQueryChange={(value) => {
        setQuery(value);
        setCurrentIndex(0);
      }}
      queryPlaceholder={t("findReplace.findPlaceholder")}
      queryInputRef={findInputRef}
      countText={matchText}
      countError={regexError}
      previous={{
        label: t("findReplace.previous"),
        disabled: !hasMatches,
        onClick: () => moveMatch(-1),
      }}
      next={{
        label: t("findReplace.next"),
        disabled: !hasMatches,
        onClick: () => moveMatch(1),
      }}
      optionsLabel={t("findReplace.navigationPane.searchOptions")}
      options={
        <>
          <OfficeFindPaneToggle
            active={caseSensitive}
            label={t("findReplace.caseSensitive")}
            icon="edit.matchCase"
            testId="document-find-case-sensitive"
            disabled={documentTextLength === 0}
            onClick={() => {
              setCaseSensitive((value) => !value);
              setCurrentIndex(0);
            }}
          />
          <OfficeFindPaneToggle
            active={wholeWord}
            label={t("findReplace.wholeWord")}
            icon="edit.matchWholeWord"
            testId="document-find-whole-word"
            onClick={() => {
              setWholeWord((value) => !value);
              setCurrentIndex(0);
            }}
          />
          <OfficeFindPaneToggle
            active={regex}
            label={t("findReplace.useRegex")}
            icon="edit.useRegex"
            testId="document-find-regex"
            onClick={() => {
              setRegex((value) => !value);
              setWildcards(false);
              setCurrentIndex(0);
            }}
          />
          <div
            className={officeFindPaneClassNames.formatWrap}
            ref={findFormatWrapRef}
            onKeyDown={(event) => {
              // Esc closes the open menu first and puts the keyboard back on
              // its button; only the next Esc closes Find (a menu is a layer
              // of its own, as in Word's Find and Replace).
              if (event.key !== "Escape" || !findFormatOpen) return;
              event.preventDefault();
              event.stopPropagation();
              setFindFormatOpen(false);
              findFormatToggleRef.current?.focus({ preventScroll: true });
            }}
          >
            <button
              ref={findFormatToggleRef}
              type="button"
              className={`${officeFindPaneClassNames.button}${findFormatActive ? " is-active" : ""}`}
              aria-label={t("findReplace.findFormat")}
              aria-haspopup="menu"
              aria-expanded={findFormatOpen}
              title={t("findReplace.findFormat")}
              data-testid="document-find-format-toggle"
              onClick={() => setFindFormatOpen((open) => !open)}
            >
              <OfficeSemanticIcon semanticId="edit.findFormat" size={16} />
            </button>
            {findFormatOpen ? (
              <div
                className={officeFindPaneClassNames.formatMenu}
                role="menu"
                aria-label={t("findReplace.findFormat")}
                data-testid="document-find-format-menu"
              >
                {(
                  [
                    ["bold", "findReplace.findBold", "text.bold"],
                    ["italic", "findReplace.findItalic", "text.italic"],
                    ["underline", "findReplace.findUnderline", "text.underline"],
                  ] as const
                ).map(([key, labelKey, semanticId]) => (
                  <button
                    key={key}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={findFormat[key]}
                    className={`${officeFindPaneClassNames.formatItem}${findFormat[key] ? " is-active" : ""}`}
                    data-testid={`document-find-by-format-${key}`}
                    onClick={() => {
                      setFindFormat((format) => ({
                        ...format,
                        [key]: !format[key],
                      }));
                      setCurrentIndex(0);
                    }}
                  >
                    <OfficeSemanticIcon semanticId={semanticId} size={14} />
                    <span>{t(labelKey)}</span>
                  </button>
                ))}
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={findFormat.highlight}
                  className={`${officeFindPaneClassNames.formatItem}${findFormat.highlight ? " is-active" : ""}`}
                  data-testid="document-find-by-format-highlight"
                  onClick={() => {
                    setFindFormat((format) => ({ ...format, highlight: !format.highlight }));
                    setCurrentIndex(0);
                  }}
                >
                  <OfficeSemanticIcon semanticId="text.highlight" size={14} />
                  <span>{t("findReplace.findHighlight")}</span>
                </button>
                <label className={officeFindPaneClassNames.formatItem}>
                  <span>{t("findReplace.formatStyle")}</span>
                  <select
                    data-testid="document-find-by-format-style"
                    value={findFormat.style ?? ""}
                    onChange={(event) => {
                      setFindFormat((format) => ({ ...format, style: event.target.value || null }));
                      setCurrentIndex(0);
                    }}
                  >
                    <option value="">{t("findReplace.formatAny")}</option>
                    {formatChoices.styles.map((style) => (
                      <option key={style.key} value={style.key}>
                        {style.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={officeFindPaneClassNames.formatItem}>
                  <span>{t("findReplace.formatFont")}</span>
                  <select
                    data-testid="document-find-by-format-font"
                    value={findFormat.fontFamily ?? ""}
                    onChange={(event) => {
                      setFindFormat((format) => ({ ...format, fontFamily: event.target.value || null }));
                      setCurrentIndex(0);
                    }}
                  >
                    <option value="">{t("findReplace.formatAny")}</option>
                    {formatChoices.fonts.map((family) => (
                      <option key={family} value={family}>
                        {family}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className={`${officeFindPaneClassNames.moreToggle}${moreOpen ? " is-active" : ""}`}
            aria-expanded={moreOpen}
            aria-controls="document-find-more"
            data-testid="document-find-more-toggle"
            onClick={() => setMoreOpen((open) => !open)}
          >
            {t("findReplace.moreOptions")}
          </button>
        </>
      }
      more={
        moreOpen ? (
          <section
            id="document-find-more"
            className={officeFindPaneClassNames.more}
            data-testid="document-find-more"
            aria-label={t("findReplace.moreOptions")}
          >
            <label className={officeFindPaneClassNames.moreField}>
              <span>{t("findReplace.findIn")}</span>
              <select
                data-testid="document-find-scope"
                value={scope}
                onChange={(event) => {
                  setScope(event.target.value as DocumentFindScope);
                  resetIndex();
                }}
              >
                <option value="main">{t("findReplace.scopeMain")}</option>
                <option value="headersFooters">
                  {t("findReplace.scopeHeadersFooters")}
                </option>
                <option value="notes">{t("findReplace.scopeNotes")}</option>
              </select>
            </label>
            <label className={officeFindPaneClassNames.moreCheck}>
              <input
                type="checkbox"
                data-testid="document-find-wildcards"
                checked={wildcards && !regex}
                disabled={regex}
                onChange={(event) => {
                  setWildcards(event.target.checked);
                  resetIndex();
                }}
              />
              <span>{t("findReplace.useWildcards")}</span>
            </label>
            <label className={officeFindPaneClassNames.moreField}>
              <span>{t("findReplace.specialMenu")}</span>
              <select
                data-testid="document-find-special"
                value=""
                disabled={regex}
                onChange={(event) => {
                  const code = event.target.value;
                  if (!code) return;
                  const replaceBox = specialTarget === "replace";
                  const input = replaceBox ? replacementInputRef.current : findInputRef.current;
                  const current = replaceBox ? replacement : query;
                  const start = input?.selectionStart ?? current.length;
                  const end = input?.selectionEnd ?? current.length;
                  const next = current.slice(0, start) + code + current.slice(end);
                  if (replaceBox) setReplacement(next);
                  else {
                    setQuery(next);
                    resetIndex();
                  }
                  requestAnimationFrame(() => {
                    input?.focus();
                    input?.setSelectionRange(start + code.length, start + code.length);
                  });
                }}
              >
                <option value="">{t("findReplace.specialChoose")}</option>
                {DOCUMENT_FIND_SPECIALS.filter(([code, , boxes]) =>
                  specialTarget === "replace"
                    ? boxes.includes("replace")
                    : boxes.includes(wildcards ? "wildcards" : "find") ||
                      (wildcards && code === "^p"),
                ).map(([code, labelKey]) => (
                  // With wildcards Word's paragraph mark is ^13.
                  <option key={code} value={wildcards && specialTarget === "find" && code === "^p" ? "^13" : code}>
                    {t(labelKey)}
                  </option>
                ))}
              </select>
            </label>
            {optionChecks.map(([id, labelKey, checked, setChecked, blocked]) => (
              <label
                key={id}
                className={officeFindPaneClassNames.moreCheck}
                title={blocked ? t("findReplace.ignoreUnavailableRegex") : undefined}
              >
                <input
                  type="checkbox"
                  data-testid={`document-find-${id}`}
                  checked={checked && !blocked}
                  disabled={blocked}
                  onChange={(event) => {
                    setChecked(event.target.checked);
                    resetIndex();
                  }}
                />
                <span>{t(labelKey)}</span>
              </label>
            ))}
          </section>
        ) : null
      }
      results={{
        label: t("findReplace.navigationPane.resultsLabel"),
        heading: t("findReplace.navigationPane.resultsHeading"),
        count: hasQuery && !regexError ? resultCount : 0,
        notice: storyReplaceUnavailable ? (
          <p
            className={officeFindPaneClassNames.empty}
            data-testid="document-find-story-hint"
          >
            {t("findReplace.storyOpenHint")}
          </p>
        ) : null,
        empty: !hasQuery
          ? t("findReplace.navigationPane.emptyQuery")
          : regexError
            ? t("findReplace.regexError")
            : !hasMatches
              ? t("findReplace.navigationPane.noResults")
              : null,
        emptyIsError: hasQuery && Boolean(regexError),
        items: resultSnippets.map((snippet, index) => {
          const storyHit = searchEditor ? undefined : storyHits[index];
          return {
            key: storyHit
              ? storyHit.key
              : `hit-${index}`,
            snippet,
            label: storyHit ? storyHitLabel(storyHit) : null,
          };
        }),
        currentIndex: boundedIndex,
        currentLabel: t("findReplace.navigationPane.current"),
        onActivate: activateMatch,
      }}
      replace={{
        label: t("findReplace.replace"),
        expanded: replaceExpanded,
        disabled: !editable,
        onToggle: () => setReplaceExpanded((expanded) => !expanded),
        children: (
          <>
            <input
              ref={replacementInputRef}
              type="text"
              className={officeFindPaneClassNames.replaceInput}
              data-testid="document-find-replacement"
              placeholder={t("findReplace.replacePlaceholder")}
              value={replacement}
              disabled={!editable}
              onChange={(event) => setReplacement(event.target.value)}
              onFocus={() => setSpecialTarget("replace")}
            />
            <div className={officeFindPaneClassNames.replaceOptions}>
              {(
                [
                  ["bold", "findReplace.formatBold", "text.bold"],
                  ["italic", "findReplace.formatItalic", "text.italic"],
                  ["underline", "findReplace.formatUnderline", "text.underline"],
                ] as const
              ).map(([key, labelKey, icon]) => (
                <OfficeFindPaneToggle
                  key={key}
                  active={replaceFormat[key]}
                  label={t(labelKey)}
                  icon={icon}
                  testId={`document-find-format-${key}`}
                  disabled={!editable}
                  onClick={() =>
                    setReplaceFormat((format) => ({
                      ...format,
                      [key]: !format[key],
                    }))
                  }
                />
              ))}
              <OfficeFindPaneToggle
                active={replaceFormat.highlight}
                label={t("findReplace.formatHighlight")}
                icon="text.highlight"
                testId="document-find-format-highlight"
                disabled={!editable}
                onClick={() =>
                  setReplaceFormat((format) => ({ ...format, highlight: !format.highlight }))
                }
              />
              <select
                aria-label={t("findReplace.formatStyle")}
                data-testid="document-find-format-style"
                value={replaceFormat.style ?? ""}
                disabled={!editable || scope === "notes"}
                onChange={(event) =>
                  setReplaceFormat((format) => ({ ...format, style: event.target.value || null }))
                }
              >
                <option value="">{t("findReplace.formatStyle")}</option>
                <option value="normal">{t("findReplace.styleNormal")}</option>
                {[1, 2, 3, 4, 5, 6].map((level) => (
                  <option key={level} value={`heading:${level}`}>
                    {t("findReplace.styleHeading", { level })}
                  </option>
                ))}
              </select>
              <select
                aria-label={t("findReplace.formatFont")}
                data-testid="document-find-format-font"
                value={replaceFormat.fontFamily ?? ""}
                disabled={!editable}
                onChange={(event) =>
                  setReplaceFormat((format) => ({ ...format, fontFamily: event.target.value || null }))
                }
              >
                <option value="">{t("findReplace.formatFont")}</option>
                {formatChoices.fonts.map((family) => (
                  <option key={family} value={family}>
                    {family}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={officeFindPaneClassNames.moreToggle}
                data-testid="document-find-replace-no-format"
                disabled={
                  !editable ||
                  (!paragraphFormatActive &&
                    !replaceFormat.bold &&
                    !replaceFormat.italic &&
                    !replaceFormat.underline &&
                    !replaceFormat.highlight &&
                    !replaceFormat.style &&
                    !replaceFormat.fontFamily)
                }
                onClick={() => {
                  setReplaceFormat({ bold: false, italic: false, underline: false, highlight: false, style: null, fontFamily: null });
                  setReplaceParagraphFormat(EMPTY_PARAGRAPH_FORMAT);
                }}
              >
                {t("findReplace.noFormatting")}
              </button>
            </div>
            <fieldset
              className={officeFindPaneClassNames.paragraphFormat}
              data-testid="document-find-replace-paragraph-format"
              disabled={!editable || scope === "notes"}
            >
              <legend>{t("findReplace.replaceParagraphFormat")}</legend>
              <label>
                <span>{t("findReplace.replaceAlignment")}</span>
                <select
                  data-testid="document-find-replace-align"
                  value={replaceParagraphFormat.textAlign}
                  onChange={(event) =>
                    setReplaceParagraphFormat((format) => ({
                      ...format,
                      textAlign: event.target
                        .value as DocumentReplaceParagraphFormat["textAlign"],
                    }))
                  }
                >
                  <option value="">{t("findReplace.formatUnchanged")}</option>
                  <option value="left">{t("toolbar.alignLeft")}</option>
                  <option value="center">{t("toolbar.alignCenter")}</option>
                  <option value="right">{t("toolbar.alignRight")}</option>
                  <option value="justify">{t("toolbar.alignJustify")}</option>
                </select>
              </label>
              <label>
                <span>{t("findReplace.replaceLineSpacing")}</span>
                <select
                  data-testid="document-find-replace-line-spacing"
                  value={replaceParagraphFormat.lineHeight}
                  onChange={(event) =>
                    setReplaceParagraphFormat((format) => ({
                      ...format,
                      lineHeight: event.target
                        .value as DocumentReplaceParagraphFormat["lineHeight"],
                    }))
                  }
                >
                  <option value="">{t("findReplace.formatUnchanged")}</option>
                  {LINE_HEIGHT_VALUES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              {(
                [
                  ["spaceBefore", "findReplace.replaceSpaceBefore", "space-before"],
                  ["spaceAfter", "findReplace.replaceSpaceAfter", "space-after"],
                ] as const
              ).map(([field, labelKey, id]) => (
                <label key={field}>
                  <span>{t(labelKey)}</span>
                  <input
                    type="number"
                    min={0}
                    max={1584}
                    step={6}
                    data-testid={`document-find-replace-${id}`}
                    placeholder={t("findReplace.formatUnchanged")}
                    value={replaceParagraphFormat[field]}
                    onChange={(event) =>
                      setReplaceParagraphFormat((format) => ({
                        ...format,
                        [field]: event.target.value,
                      }))
                    }
                  />
                </label>
              ))}
            </fieldset>
            <div className={officeFindPaneClassNames.replaceActions}>
              <button
                type="button"
                className={officeFindPaneClassNames.action}
                data-testid="document-find-replace-current"
                disabled={replaceDisabled}
                onClick={replaceCurrent}
              >
                <OfficeSemanticIcon semanticId="edit.replace" size={15} />
                <span>{t("findReplace.replace")}</span>
              </button>
              <button
                type="button"
                className={officeFindPaneClassNames.action}
                data-testid="document-find-replace-all"
                disabled={replaceDisabled}
                onClick={replaceAll}
              >
                <OfficeSemanticIcon semanticId="edit.replace" size={15} />
                <span>{t("findReplace.replaceAll")}</span>
              </button>
            </div>
          </>
        ),
      }}
    />
  );
}
