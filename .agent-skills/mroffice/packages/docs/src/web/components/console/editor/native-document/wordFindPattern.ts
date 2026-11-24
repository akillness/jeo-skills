/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's Find and Replace syntax (Microsoft Support, "Find and replace text"
 * and the dialog's Special menu): the ^ codes of an ordinary search, and the
 * "Use wildcards" pattern language, both read into the regex the Find
 * matcher runs.
 *
 * The searched text stands an object in by a character of its kind (see
 * FIND_OBJECT_CHARS); a pattern that names a kind (^l, ^g, ^d, ^f, ^e) may
 * match across one, and every other object stays a boundary. A paragraph
 * mark (^p, or ^13 with wildcards) is FIND_PARAGRAPH_MARK between two
 * paragraphs of one story.
 */
import { lookbehindSupported } from "@mrnote/core/web/lib/regexp-behind.ts";
export const FIND_PARAGRAPH_MARK = "\n";
export const FIND_OBJECT_CHARS = {
  lineBreak: "",
  graphic: "",
  field: "",
  footnote: "",
  endnote: "",
} as const;
export type FindObjectKind = keyof typeof FIND_OBJECT_CHARS;

const ANY_TEXT_CHARACTER = "[^\\n\\uE000-\\uE00F\\uFFFC]";
const WORD_CHARACTER = "[\\p{L}\\p{N}_]";
const WORD_CHARACTER_RE = /^[\p{L}\p{N}_]$/u;

/**
 * Word's < and > on an engine without lookbehind (Safari before 16.4): the
 * searched text gets a marker at every word start (U+FDD0) and word end
 * (U+FDD1), two noncharacters no document holds, and < and > look ahead for
 * the marker. Every other element skips one marker before it and never
 * matches one, so a match finds the same characters, groups and backtracking
 * order as the lookbehind pattern (markWordBoundaries, unmarkWordBoundaryText).
 */
const WORD_START_MARK = "\uFDD0";
const WORD_END_MARK = "\uFDD1";
const MARK_GAP = "[\\uFDD0\\uFDD1]?";
const MARKED_ANY_TEXT_CHARACTER = "[^\\n\\uE000-\\uE00F\\uFFFC\\uFDD0\\uFDD1]";
const MARKS_RE = /[\uFDD0\uFDD1]/g;

const isWordCharacter = (character: string) => character !== "" && WORD_CHARACTER_RE.test(character);

/** `text` with a word-start or word-end marker at every word edge, and for
 *  each unit of the result the position in `text` it stands for. */
export function markWordBoundaries(text: string): { text: string; positions: number[] } {
  let out = "";
  const positions: number[] = [];
  let before = "";
  for (let at = 0; at <= text.length; ) {
    const point = at < text.length ? String.fromCodePoint(text.codePointAt(at)!) : "";
    const prev = isWordCharacter(before);
    const next = isWordCharacter(point);
    if (prev !== next) {
      out += next ? WORD_START_MARK : WORD_END_MARK;
      positions.push(at);
    }
    for (let unit = 0; unit < point.length; unit += 1) positions.push(at + unit);
    out += point;
    before = point;
    at += point.length || 1;
  }
  positions.push(text.length);
  return { text: out, positions };
}

/** A match found in marked text, read back in the text itself. */
export function unmarkWordBoundaryText(value: string): string {
  return value.replace(MARKS_RE, "");
}
const ESCAPED = /[.*+?^${}()|[\]\\/-]/g;
const escape = (text: string) => text.replace(ESCAPED, "\\$&");
const char = (codePoint: number) => escape(String.fromCodePoint(codePoint));

export interface WordFindPattern {
  /** The JS regex source. */
  readonly source: string;
  /** Wildcards always match case. */
  readonly caseSensitive: boolean;
  /** The pattern can match a paragraph mark: it is run over a story. */
  readonly paragraph: boolean;
  /** The object characters it names, which a match may take in. */
  readonly objects: ReadonlySet<string>;
  /**
   * `source` runs on text marked by markWordBoundaries (Word's < or > on an
   * engine without lookbehind, Safari before 16.4).
   */
  readonly wordBoundaryMarks?: boolean;
}

export type WordFindPatternResult =
  | { readonly ok: true; readonly pattern: WordFindPattern }
  | { readonly ok: false; readonly code: "special" | "wildcard" };

/** Whether a query uses Word's syntax at all (a plain query stays on the
 *  plain matcher). */
export function wordFindUsesSyntax(query: string, wildcards: boolean): boolean {
  return wildcards || query.includes("^");
}

// Windows-1252's 0x80-0x9F, which Word's ^0nnn reads as that code page does.
const CP1252: Readonly<Record<number, number>> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020,
  0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152,
  0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022,
  0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a,
  0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
};
const fromCharacterCode = (code: number, ansi: boolean) =>
  ansi && CP1252[code] !== undefined ? CP1252[code]! : code;

type Special =
  | { readonly kind: "text"; readonly source: string; readonly object?: string; readonly paragraph?: true }
  | { readonly kind: "error" };

/** One ^ code at `at` (the caret's index); its length and meaning in Find. */
function findSpecial(query: string, at: number, wildcards: boolean): { length: number; special: Special } {
  const rest = query.slice(at + 1);
  const numeric = /^(0?)(\d{1,5})/.exec(rest);
  if (numeric) {
    const code = Number(numeric[2]);
    const length = 1 + numeric[0].length;
    if (code === 13) return { length, special: { kind: "text", source: FIND_PARAGRAPH_MARK, paragraph: true } };
    if (code === 9) return { length, special: { kind: "text", source: "\\t" } };
    if (code === 11) return { length, special: { kind: "text", source: char(0xe000), object: FIND_OBJECT_CHARS.lineBreak } };
    if (code < 1 || code > 0x10ffff) return { length, special: { kind: "error" } };
    return { length, special: { kind: "text", source: char(fromCharacterCode(code, numeric[1] === "0")) } };
  }
  const unicode = /^u(\d{1,7})/.exec(rest);
  if (unicode) {
    const code = Number(unicode[1]);
    return {
      length: 1 + unicode[0].length,
      special: code > 0 && code <= 0x10ffff ? { kind: "text", source: char(code) } : { kind: "error" },
    };
  }
  const letter = rest[0];
  const one = (special: Special) => ({ length: 2, special });
  switch (letter) {
    case "p":
      return one({ kind: "text", source: FIND_PARAGRAPH_MARK, paragraph: true });
    case "t":
      return one({ kind: "text", source: "\\t" });
    case "^":
      return one({ kind: "text", source: "\\^" });
    case "l":
      return one({ kind: "text", source: char(0xe000), object: FIND_OBJECT_CHARS.lineBreak });
    case "s":
      return one({ kind: "text", source: "\\u00A0" });
    case "~":
      return one({ kind: "text", source: "\\u2011" });
    case "-":
      return one({ kind: "text", source: "\\u00AD" });
    case "+":
      return one({ kind: "text", source: "\\u2014" });
    case "=":
      return one({ kind: "text", source: "\\u2013" });
    case "%":
      return one({ kind: "text", source: "\\u00A7" });
    case "v":
      return one({ kind: "text", source: "\\u00B6" });
    case "g":
      return one({ kind: "text", source: char(0xe001), object: FIND_OBJECT_CHARS.graphic });
    case "d":
      return one({ kind: "text", source: char(0xe002), object: FIND_OBJECT_CHARS.field });
    case "f":
      return one({ kind: "text", source: char(0xe003), object: FIND_OBJECT_CHARS.footnote });
    case "e":
      return one({ kind: "text", source: char(0xe004), object: FIND_OBJECT_CHARS.endnote });
    // Breaks Docs keeps between blocks, not in a paragraph's text: never
    // inside a match.
    case "m":
    case "b":
    case "n":
      return one({ kind: "text", source: "(?!)" });
  }
  // The rest of Word's ordinary codes; with wildcards Word offers none of them.
  if (!wildcards) {
    switch (letter) {
      case "?":
        return one({ kind: "text", source: ANY_TEXT_CHARACTER });
      case "#":
        return one({ kind: "text", source: "\\p{Nd}" });
      case "$":
        return one({ kind: "text", source: "\\p{L}" });
      case "w":
        return one({ kind: "text", source: "[ \\t\\u00A0\\u3000]+" });
    }
  }
  return { length: 1, special: { kind: "error" } };
}

/**
 * The regex for a Word query: its ^ codes, and with `wildcards` Word's
 * pattern language (? * [ ] [! ] [a-z] { } @ < > ( ) \).
 */
export function translateWordFind(
  query: string,
  options: { readonly wildcards: boolean; readonly caseSensitive: boolean },
): WordFindPatternResult {
  const { wildcards } = options;
  let source = "";
  let paragraph = false;
  const objects = new Set<string>();
  let depth = 0;
  // Word's < and > without lookbehind: the text is marked at word edges and
  // every element that takes a character skips one marker first.
  const marks = wildcards && !lookbehindSupported && /[<>]/.test(query);
  const atom = (element: string) => (marks ? `(?:${MARK_GAP}${element})` : element);
  const anyText = marks ? MARKED_ANY_TEXT_CHARACTER : ANY_TEXT_CHARACTER;
  // < and > are positions, not characters: nothing repeats one (the RegExp
  // would refuse it under the u flag and read \p{…} as text without it).
  const afterWordEdge = (at: number) => wildcards && (query[at - 1] === "<" || query[at - 1] === ">") && query[at - 2] !== "\\";
  for (let at = 0; at < query.length; ) {
    const character = query[at]!;
    if (character === "^") {
      const { length, special } = findSpecial(query, at, wildcards);
      if (special.kind === "error") return { ok: false, code: "special" };
      source += marks ? atom(special.source.split(ANY_TEXT_CHARACTER).join(MARKED_ANY_TEXT_CHARACTER)) : special.source;
      if (special.paragraph) paragraph = true;
      if (special.object) objects.add(special.object);
      at += length;
      continue;
    }
    if (!wildcards) {
      source += escape(character);
      at += 1;
      continue;
    }
    switch (character) {
      case "\\": {
        const next = query[at + 1];
        if (next === undefined) return { ok: false, code: "wildcard" };
        source += atom(escape(next));
        at += 2;
        continue;
      }
      case "?":
        source += atom(anyText);
        at += 1;
        continue;
      case "*":
        source += `${atom(anyText)}*?`;
        at += 1;
        continue;
      case "@":
        if (!source || afterWordEdge(at)) return { ok: false, code: "wildcard" };
        source += "+";
        at += 1;
        continue;
      case "<":
        // eslint-disable-next-line no-restricted-syntax -- only where lookbehindSupported
        source += marks ? `(?=${WORD_START_MARK})` : `(?<!${WORD_CHARACTER})(?=${WORD_CHARACTER})`;
        at += 1;
        continue;
      case ">":
        // eslint-disable-next-line no-restricted-syntax -- only where lookbehindSupported
        source += marks ? `(?=${WORD_END_MARK})` : `(?<=${WORD_CHARACTER})(?!${WORD_CHARACTER})`;
        at += 1;
        continue;
      case "(":
        depth += 1;
        source += "(";
        at += 1;
        continue;
      case ")":
        if (depth === 0) return { ok: false, code: "wildcard" };
        depth -= 1;
        source += ")";
        at += 1;
        continue;
      case "{": {
        // {n}, {n,}, {n,m}; Word also takes ; where its list separator is.
        const count = /^\{(\d+)(?:([,;])(\d*))?\}/.exec(query.slice(at));
        if (!count || !source || afterWordEdge(at)) return { ok: false, code: "wildcard" };
        const low = Number(count[1]);
        const high = count[3] === undefined || count[3] === "" ? null : Number(count[3]);
        if (high !== null && high < low) return { ok: false, code: "wildcard" };
        source += count[2] === undefined ? `{${low}}` : `{${low},${high ?? ""}}`;
        at += count[0].length;
        continue;
      }
      case "[": {
        const close = query.indexOf("]", at + 2);
        if (close < 0) return { ok: false, code: "wildcard" };
        let body = query.slice(at + 1, close);
        const negate = body.startsWith("!");
        if (negate) body = body.slice(1);
        if (!body) return { ok: false, code: "wildcard" };
        // Word's ranges run in ascending order only.
        for (const range of body.matchAll(/(.)-(.)/gu)) {
          if (range[1]!.codePointAt(0)! > range[2]!.codePointAt(0)!) return { ok: false, code: "wildcard" };
        }
        source += atom(`[${negate ? (marks ? "^\\n\\uFDD0\\uFDD1" : "^\\n") : ""}${body.replace(/[\\\]^]/g, "\\$&")}]`);
        at = close + 1;
        continue;
      }
      default:
        source += atom(escape(character));
        at += 1;
    }
  }
  if (depth !== 0) return { ok: false, code: "wildcard" };
  if (!source) return { ok: false, code: wildcards ? "wildcard" : "special" };
  return {
    ok: true,
    pattern: {
      source,
      caseSensitive: wildcards ? true : options.caseSensitive,
      paragraph,
      objects,
      ...(marks ? { wordBoundaryMarks: true } : {}),
    },
  };
}

export type WordReplacementPart =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "paragraph" }
  | { readonly kind: "lineBreak" }
  | { readonly kind: "pageBreak" }
  | { readonly kind: "columnBreak" };

/**
 * A Replace with text read as Word reads it: ^p a new paragraph, ^l a line
 * break, ^m a page break, ^n a column break, ^t, ^^, ^& (the text found), ^c
 * (the clipboard's text), ^s ^~ ^- ^+ ^= ^nnn ^unnnn; with wildcards \1-\9
 * are the found text's groups. Null when a code is not one Word takes there.
 */
export function expandWordReplacement(
  replacement: string,
  context: {
    readonly wildcards: boolean;
    readonly found: string;
    readonly captures?: readonly string[];
    readonly clipboard?: string;
  },
): WordReplacementPart[] | null {
  const parts: WordReplacementPart[] = [];
  let text = "";
  const push = (part: WordReplacementPart) => {
    if (text) parts.push({ kind: "text", text });
    text = "";
    parts.push(part);
  };
  for (let at = 0; at < replacement.length; ) {
    const character = replacement[at]!;
    if (context.wildcards && character === "\\") {
      const next = replacement[at + 1];
      if (next !== undefined && /[1-9]/.test(next)) {
        text += context.captures?.[Number(next)] ?? "";
      } else if (next !== undefined) {
        text += next;
      }
      at += 2;
      continue;
    }
    if (character !== "^") {
      text += character;
      at += 1;
      continue;
    }
    const rest = replacement.slice(at + 1);
    const numeric = /^(0?)(\d{1,5})/.exec(rest);
    if (numeric) {
      const code = Number(numeric[2]);
      at += 1 + numeric[0].length;
      if (code === 13) push({ kind: "paragraph" });
      else if (code === 11) push({ kind: "lineBreak" });
      else if (code === 12) push({ kind: "pageBreak" });
      else if (code === 14) push({ kind: "columnBreak" });
      else if (code >= 1 && code <= 0x10ffff) text += String.fromCodePoint(fromCharacterCode(code, numeric[1] === "0"));
      else return null;
      continue;
    }
    const unicode = /^u(\d{1,7})/.exec(rest);
    if (unicode) {
      const code = Number(unicode[1]);
      if (!(code > 0 && code <= 0x10ffff)) return null;
      text += String.fromCodePoint(code);
      at += 1 + unicode[0].length;
      continue;
    }
    at += 2;
    switch (rest[0]) {
      case "p":
        push({ kind: "paragraph" });
        break;
      case "l":
        push({ kind: "lineBreak" });
        break;
      case "m":
        push({ kind: "pageBreak" });
        break;
      case "n":
        push({ kind: "columnBreak" });
        break;
      case "t":
        text += "\t";
        break;
      case "^":
        text += "^";
        break;
      case "&":
        text += context.found;
        break;
      case "c":
        text += context.clipboard ?? "";
        break;
      case "s":
        text += " ";
        break;
      case "~":
        text += "‑";
        break;
      case "-":
        text += "­";
        break;
      case "+":
        text += "—";
        break;
      case "=":
        text += "–";
        break;
      case "%":
        text += "§";
        break;
      case "v":
        text += "¶";
        break;
      default:
        return null;
    }
  }
  if (text) parts.push({ kind: "text", text });
  return parts;
}
