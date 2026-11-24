/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * AutoCorrect / smart typography rules — the Word/WPS "AutoFormat As You Type"
 * feature (and the moral equivalent of TipTap's official
 * `@tiptap/extension-typography`, which is not a dependency here).
 *
 * This module holds ONLY the pure replacement logic so it can be unit-tested in
 * isolation, with no editor/ProseMirror dependency. The TipTap input-rule wiring
 * lives in `autoCorrectExtension.ts`, which consumes the tables/helpers below.
 *
 * Smart-quote direction (opening “ vs closing ”) is contextual — it depends on
 * the character immediately before the quote — so it is computed by
 * `resolveSmartQuote` rather than a static mapping. Everything else (em-dash,
 * ellipsis, ©/™/®, trivial fractions) is a fixed text→text swap.
 *
 * IMPORTANT — code safety: these rules are applied through TipTap input rules,
 * whose runner already refuses to fire inside a code block (`spec.code`) or when
 * an adjacent node carries a `code` mark (inline code). So smart quotes never
 * appear inside code; this module needs no extra guard for that, but the
 * extension test pins the behavior so a future TipTap change can't regress it.
 */

import { isInternetOrFileAddress } from "@mrnote/core/web/lib/proofing/spelling-tokenize.ts";

/**
 * A simple, context-free typography replacement: when the user types the final
 * character of `find` at the caret, the matched text is replaced by `replace`.
 * Used for em-dash, ellipsis, the (c)/(tm)/(r) symbols and trivial fractions.
 *
 * `find` matches the END of the text before+including the just-typed character
 * (anchored with `$`); the input-rule runner only ever feeds the runner text
 * ending at the caret, so anchoring at `$` is what makes "the thing I just
 * finished typing" the trigger.
 */
export interface TextTypographyRule {
  /** Stable id (used for debugging / potential future per-rule toggles). */
  id: string;
  /** Regex that must match at the end of the text before the caret. */
  find: RegExp;
  /** Literal replacement string. */
  replace: string;
}

// Curly-quote glyphs, named so the intent is obvious at every call site.
export const LEFT_DOUBLE_QUOTE = "“"; // “
export const RIGHT_DOUBLE_QUOTE = "”"; // ”
export const LEFT_SINGLE_QUOTE = "‘"; // ‘
export const RIGHT_SINGLE_QUOTE = "’"; // ’ (also the typographic apostrophe)
export const EM_DASH = "—"; // —
export const EN_DASH = "–"; // –
export const ELLIPSIS = "…"; // …
























export const TEXT_TYPOGRAPHY_RULES: readonly TextTypographyRule[] = [
  // em-dash: "x--" -> "x—" (triggered by the second hyphen; left char is any
  // non-space, non-hyphen so we don't merge into "---" or eat a list dash).
  { id: "em-dash", find: /([^\s-])--$/, replace: "$1" + EM_DASH },
  // ellipsis: "..." -> "…"
  { id: "ellipsis", find: /\.\.\.$/, replace: ELLIPSIS },
  // (c) -> ©
  { id: "copyright", find: /\((c)\)$/i, replace: "©" },
  // (tm) -> ™
  { id: "trademark", find: /\((tm)\)$/i, replace: "™" },
  // (r) -> ®
  { id: "registered", find: /\((r)\)$/i, replace: "®" },
  // 1/2 -> ½, bounded by a non-digit on the left (or start of text) and
  // by the space or punctuation that ends the number on the right.
  { id: "frac-half", find: /(^|[^\d])1\/2([\s.,;:!?)\]}])$/, replace: "$1½$2" },
  // 1/4 -> ¼
  { id: "frac-quarter", find: /(^|[^\d])1\/4([\s.,;:!?)\]}])$/, replace: "$1¼$2" },
  // 3/4 -> ¾
  { id: "frac-three-quarters", find: /(^|[^\d])3\/4([\s.,;:!?)\]}])$/, replace: "$1¾$2" },
];

/**
 * Whether the text typed so far ends inside an Internet or file address
 * ("https://example.org/foo--", "www.example.org/1/2 "). Word leaves an address
 * as typed: its "--", "...", "(c)" and "1/2" stay, and the whole address becomes
 * one hyperlink (measured in Word 16.86: "https://example.org/foo--bar" keeps
 * its hyphens and is linked whole, while "foo--bar" gets the em dash). Rewriting
 * the hyphens here also cut the link short at the dash, which the autolink
 * reads as a space (WUA 057). `textBefore`
 * runs to the caret and holds the character just typed; a space typed to end a
 * fraction is not part of the address.
 */
export function typedTextEndsInsideAddress(textBefore: string): boolean {
  const chunk = /\S+$/u.exec(textBefore.trimEnd())?.[0];
  return chunk !== undefined && isInternetOrFileAddress(chunk);
}

/**
 * Whether a straight quote typed after `textBeforeQuote` falls inside an
 * address, where Word keeps it straight: "https://example.org/o'brien" stays
 * as typed and is linked whole (Word 16.86). A quote that closes a quotation
 * around the address ("“https://example.org" + ") still curls, and so does
 * the apostrophe in "Amazon.com's", which Word does not take for an address.
 */
export function quoteTypedInsideAddress(textBeforeQuote: string, kind: QuoteKind): boolean {
  const chunk = /\S+$/u.exec(textBeforeQuote)?.[0];
  if (chunk === undefined || !/[/\\]/.test(chunk) || !isInternetOrFileAddress(chunk)) return false;
  return !(kind === "double" ? /^["“]/u : /^['‘]/u).test(chunk);
}

/**
 * Word's "Hyphens (--) with dash", spaced form: a hyphen or two with a space
 * on each side, between words, become an en dash ("a -- b" and "a - b" read
 * "a – b"). Word replaces them once the word after them ends, so the trigger
 * is the space or punctuation typed after that word. Unspaced, "a--b" is the
 * em dash rule above. Groups: 1 the character before the leading space,
 * 2 the hyphens, 3 the word after them, 4 the character that ends it. Only
 * the hyphens are rewritten (autoCorrectExtension).
 */
export const EN_DASH_FIND = /(\S) (-{1,2}) ([^\s-]\S*?)([\s.,;:!?)\]}])$/u;

/**
 * Decide whether a straight quote typed after `precedingChar` should become an
 * OPENING or CLOSING curly quote.
 *
 * Heuristic (matches Word/most word processors and TipTap's Typography):
 *  - At the very start of a text block (`precedingChar` is null/empty) → OPENING.
 *  - After whitespace or an opening bracket/brace/paren → OPENING.
 *  - Otherwise (after a letter, digit, punctuation, closing bracket, …) →
 *    CLOSING. This is what makes `don't` → `don’t` (apostrophe) and a quote that
 *    hugs the end of a word a closing quote.
 *
 * The decision is identical for single and double quotes; the caller supplies
 * the glyph pair.
 */
export function isOpeningQuoteContext(precedingChar: string | null | undefined): boolean {
  if (precedingChar == null || precedingChar === "") return true;
  // Whitespace before the quote → opening.
  if (/\s/.test(precedingChar)) return true;
  // Common opening delimiters that precede an opening quote, the East Asian
  
  if (/[([{<‘“—–（［｛〈《「『【〔〖〘〚｟«‹]/.test(precedingChar)) return true;
  return false;
}

export type QuoteKind = "single" | "double";

/**
 * Resolve a straight quote (`'` or `"`) to its curly counterpart given the
 * character that precedes it in the document. Pure and side-effect free.
 */
export function resolveSmartQuote(
  kind: QuoteKind,
  precedingChar: string | null | undefined,
): string {
  const opening = isOpeningQuoteContext(precedingChar);
  if (kind === "double") {
    return opening ? LEFT_DOUBLE_QUOTE : RIGHT_DOUBLE_QUOTE;
  }
  return opening ? LEFT_SINGLE_QUOTE : RIGHT_SINGLE_QUOTE;
}

// ------------------------------------------------------------------ Word's AutoCorrect list and capitalization
//
// Microsoft Support, "Choose AutoCorrect options for capitalization,
// spelling, and symbols": an entry whose name ends in a letter or digit is
// replaced when the word ends (a space or punctuation typed after it); one
// that ends in a symbol -- "(c)", ":)", "-->" -- the moment its last
// character is typed. An entry typed with a capital first letter, or in
// capitals, comes out the same way ("Teh" -> "The").

export interface AutoCorrectListEntry {
  readonly from: string;
  readonly to: string;
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

/** The case the user typed, carried to the replacement. */
export function matchEntryCase(typed: string, entry: AutoCorrectListEntry): string {
  if (typed === entry.from) return entry.to;
  const letters = typed.replace(/[^\p{L}]/gu, "");
  if (letters.length > 1 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()) {
    return entry.to.toUpperCase();
  }
  const first = [...typed][0] ?? "";
  if (first !== first.toLowerCase() && [...entry.from][0] === [...entry.from][0]?.toLowerCase()) {
    const [head = "", ...rest] = [...entry.to];
    return head.toUpperCase() + rest.join("");
  }
  return entry.to;
}

/** A symbol entry the text just typed finishes ("(c)", ":)"). */
export function matchSymbolEntry(
  textBefore: string,
  entries: readonly AutoCorrectListEntry[],
): { typed: string; replacement: string } | null {
  const lower = textBefore.toLowerCase();
  let best: AutoCorrectListEntry | null = null;
  for (const entry of entries) {
    const last = entry.from.slice(-1);
    if (!last || WORD_CHAR.test(last)) continue;
    if (!lower.endsWith(entry.from.toLowerCase())) continue;
    // An entry that starts with a letter starts a word: "(c)" anywhere,
    // but "x:)" only after the word it belongs to ends.
    const start = textBefore.length - entry.from.length;
    if (WORD_CHAR.test(entry.from[0] ?? "") && start > 0 && WORD_CHAR.test(textBefore[start - 1] ?? "")) continue;
    if (!best || entry.from.length > best.from.length) best = entry;
  }
  if (!best) return null;
  const typed = textBefore.slice(textBefore.length - best.from.length);
  return { typed, replacement: matchEntryCase(typed, best) };
}

const DAY_NAMES = new Set(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);
/** What ends a word for AutoCorrect (quotes are the smart-quote rule's). */
export const WORD_END_TRIGGER = /[\s.,;:!?)\]}]/u;

export interface WordEndOptions {
  readonly replaceText: boolean;
  readonly entries: readonly AutoCorrectListEntry[];
  readonly correctTwoInitialCapitals: boolean;
  readonly initialCapsExceptions: readonly string[];
  readonly correctCapsLock: boolean;
  readonly capitalizeDayNames: boolean;
  readonly capitalizeSentences: boolean;
  readonly capitalizeTableCells: boolean;
  readonly firstLetterExceptions: readonly string[];
  readonly ordinals: boolean;
  /** The paragraph is in a table cell (its first word: Capitalize first
   *  letter of table cells). */
  readonly inTableCell?: boolean;
  /** The word ended with a space, tab or line end: Word changes a word's
   *  sentence's first letter and makes an ordinal superscript then, not at
   *  punctuation typed straight after it ("https:", "wait..."). */
  readonly endedBySpace?: boolean;
}

export interface WordEndCorrection {
  /** The text the correction rewrites, as typed (before the trigger). */
  readonly typed: string;
  /** What it becomes. */
  readonly replacement: string;
  /** Offset in `replacement` from which an ordinal suffix is superscript. */
  readonly superscriptFrom?: number;
}

function ordinalSuffix(value: number): string {
  const tens = value % 100;
  if (tens >= 11 && tens <= 13) return "th";
  return ["th", "st", "nd", "rd"][value % 10] ?? "th";
}

/** Whether the words before `prefix`'s end close a sentence. */
function sentenceStartsAfter(
  prefix: string,
  exceptions: readonly string[],
): "block" | "sentence" | null {
  if (!prefix.trim()) return "block";
  if (!/\s$/u.test(prefix)) return null;
  const trimmed = prefix.trimEnd();
  const end = /([.!?])["”’')\]]*$/u.exec(trimmed);
  if (!end) return null;
  if (end[1] === ".") {
    const token = /\S+$/u.exec(trimmed)?.[0]?.replace(/["”’')\]]+$/u, "").toLowerCase() ?? "";
    if (exceptions.some((exception) => exception.toLowerCase() === token)) return null;
    // A number's or an address's period ("3.", "example.com") is no sentence end
    // only when nothing but digits stands before it.
    if (/^\d+\.$/.test(token)) return null;
  }
  return "sentence";
}

/** Word's corrections when a word ends: the list, then capitalization,
 * then the ordinal. `textBefore` runs to the trigger, which it does not hold. */
export function correctEndedWord(textBefore: string, options: WordEndOptions): WordEndCorrection | null {
  let typed = "";
  let word = "";
  // The list first: its entries may hold spaces ("andt he").
  if (options.replaceText) {
    const lower = textBefore.toLowerCase();
    let best: AutoCorrectListEntry | null = null;
    for (const entry of options.entries) {
      const last = entry.from.slice(-1);
      if (!last || !WORD_CHAR.test(last)) continue;
      if (!lower.endsWith(entry.from.toLowerCase())) continue;
      const start = textBefore.length - entry.from.length;
      if (start > 0 && WORD_CHAR.test(textBefore[start - 1] ?? "")) continue;
      if (start > 0 && /['’]/u.test(textBefore[start - 1] ?? "")) continue;
      if (!best || entry.from.length > best.from.length) best = entry;
    }
    if (best) {
      typed = textBefore.slice(textBefore.length - best.from.length);
      word = matchEntryCase(typed, best);
    }
  }
  if (!typed) {
    typed = /[\p{L}\p{N}][\p{L}\p{N}'’]*$/u.exec(textBefore)?.[0] ?? "";
    if (!typed) return null;
    // Part of a longer token (an address, a file name, a code): left alone.
    const start = textBefore.length - typed.length;
    if (start > 0 && /[^\s([{“"‘'—–-]/u.test(textBefore[start - 1] ?? "")) return null;
    word = typed;
  }
  const start = textBefore.length - typed.length;
  const prefix = textBefore.slice(0, start);
  let superscriptFrom: number | undefined;

  if (/^\p{L}+$/u.test(word)) {
    if (
      options.correctTwoInitialCapitals &&
      /^\p{Lu}{2}\p{Ll}+$/u.test(word) &&
      !options.initialCapsExceptions.includes(word)
    ) {
      word = word[0] + word.slice(1).toLowerCase();
    } else if (options.correctCapsLock && /^\p{Ll}\p{Lu}{2,}$/u.test(word)) {
      word = word[0]!.toUpperCase() + word.slice(1).toLowerCase();
    }
    if (options.capitalizeDayNames && DAY_NAMES.has(word)) {
      word = word[0]!.toUpperCase() + word.slice(1);
    }
    // A sentence's first word changes once a space ends it, not at
    // punctuation typed straight after it ("https:", "wait...").
    const starts = options.endedBySpace === false ? null : sentenceStartsAfter(prefix, options.firstLetterExceptions);
    const capitalize =
      starts === "sentence"
        ? options.capitalizeSentences
        : starts === "block"
          ? options.inTableCell
            ? options.capitalizeTableCells
            : options.capitalizeSentences
          : false;
    if (capitalize && /^\p{Ll}+$/u.test(word) && /^[a-z]/.test(word)) {
      word = word[0]!.toUpperCase() + word.slice(1);
    }
  }
  if (options.ordinals && options.endedBySpace !== false) {
    const ordinal = /^(\d+)(st|nd|rd|th)$/i.exec(word);
    if (ordinal && ordinalSuffix(Number(ordinal[1])) === ordinal[2]!.toLowerCase()) {
      superscriptFrom = ordinal[1]!.length;
    }
  }
  if (word === typed && superscriptFrom === undefined) return null;
  return { typed, replacement: word, ...(superscriptFrom !== undefined ? { superscriptFrom } : {}) };
}

/** Word's *bold* and _italic_: the closing marker just typed. */
export const BOLD_ITALIC_FIND = /(^|[\s(\[{“"‘'—–])([*_])([^\s*_](?:[^*_\n]*[^\s*_])?)\2$/u;
