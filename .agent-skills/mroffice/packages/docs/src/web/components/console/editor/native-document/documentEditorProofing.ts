/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * What Review > Editor and Review > Spelling & Grammar find in a document.
 *
 * Word's Editor pane lists the document's corrections (Spelling, Grammar)
 * and refinements, each with a count, and steps through one kind at a time
 * ("Check grammar, spelling, and more in Word", Microsoft Support). This is
 * the offline engine behind that pane:
 *
 * - Spelling is the checker every MRAI editor shares (lib/proofing: Hunspell
 *   dictionaries read by nspell, the user's custom dictionary, Ignore All for
 *   the session, Office's "ignore UPPERCASE / words with numbers / Internet
 *   and file addresses" options, repeated words). Words in scripts the
 *   dictionary cannot judge (Chinese, Japanese, Korean, ...) are never
 *   flagged.
 * - Grammar is a small set of deterministic English rules taken from the
 *   checks Word documents for its grammar checker (Microsoft Support,
 *   "Grammar Settings"): Capitalization (a sentence that starts in lower
 *   case), Punctuation (multiple spaces between words, a space before
 *   punctuation) and Noun phrases (a/an misuse).
 * - Refinements: the documented style check "Sentence length (more than 60
 *   words)".
 *
 * Nothing here leaves the browser. Text marked "Do not check spelling or
 * grammar" (the proofing-language mark's noProof) is skipped, and a run set
 * in a language MRAI ships no dictionary for is not spell-checked.
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type { SpellingOptions } from "@mrnote/core/web/lib/proofing/proofing-preferences.ts";
import {
  findSpellingIssue,
  ignoreKey,
  type SpellingCheckContext,
  type SpellingDictionary,
} from "@mrnote/core/web/lib/proofing/spelling-checker.ts";
import {
  proofingDictionaryTag,
  spellingDictionaryInfo,
  spellingUncheckedReason,
} from "@mrnote/core/web/lib/proofing/spelling-dictionaries.ts";
import { tokenizeForSpelling, type SpellingScript } from "@mrnote/core/web/lib/proofing/spelling-tokenize.ts";

import {
  documentParagraphLanguage,
  readDocumentLanguageStyles,
  type DocumentLanguageStyles,
} from "./documentParagraphLanguage";
import { PROOFING_LANGUAGE_MARK } from "./proofingLanguageExtension";
import { TABLE_REPEATED_HEADER_ATTR } from "@mrnote/core/web/components/console/editor/native-document/paged/tablePagination.ts";
import { matchAllBehind } from "@mrnote/core/web/lib/regexp-behind.ts";

export type DocumentEditorIssueCategory = "spelling" | "grammar" | "refinement";

export type DocumentEditorIssueRule =
  | "misspelled"
  | "repeated"
  | "capitalization"
  | "multipleSpaces"
  | "spaceBeforePunctuation"
  | "article"
  | "sentenceLength";

export const DOCUMENT_EDITOR_RULE_CATEGORY: Readonly<
  Record<DocumentEditorIssueRule, DocumentEditorIssueCategory>
> = {
  misspelled: "spelling",
  repeated: "spelling",
  capitalization: "grammar",
  multipleSpaces: "grammar",
  spaceBeforePunctuation: "grammar",
  article: "grammar",
  sentenceLength: "refinement",
};

export interface DocumentEditorIssue {
  /** This occurrence: its rule, document range and text (Ignore Once keys;
   * see {@link mapDocumentEditorIssueKey}). */
  readonly key: string;
  readonly rule: DocumentEditorIssueRule;
  readonly category: DocumentEditorIssueCategory;
  /** Document range of the flagged text. */
  readonly from: number;
  readonly to: number;
  /** The flagged word or phrase, as the card shows it. */
  readonly text: string;
  /** The document text of `from`..`to` (a repeated word's range also takes
   * the space before it), checked before a suggestion is applied. */
  readonly rangeText: string;
  /**
   * Replacements to offer. Null for a misspelling: dictionary suggestions
   * are slow, so the pane asks for them only for the issue it shows.
   */
  readonly suggestions: readonly string[] | null;
  /** The dictionary that flagged a misspelling. */
  readonly language: string | null;
  /** Up to a few words either side, for the suggestion card. */
  readonly before: string;
  readonly after: string;
}

/** One paragraph's checkable text and where each character sits. */
export interface DocumentProofingBlock {
  readonly text: string;
  /** Document position of each UTF-16 index of `text`. */
  readonly positions: readonly number[];
  /** The proofing language per index: the run's, else its paragraph
   *  style's or the document's default (null: none stated, the check's
   *  default); Hangul is always Korean. */
  readonly languages: readonly (string | null)[];
  /** False where the run is marked "Do not check spelling or grammar". */
  readonly checked: readonly boolean[];
  /** A short hash of `text`, for issue keys. */
  readonly signature: string;
}

const SKIPPED_TEXTBLOCKS = new Set(["codeBlock", "mathBlock"]);
const OBJECT_REPLACEMENT = "￼";

function hashText(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** Every paragraph of the document, as text the checker can read. */
export function collectDocumentProofingBlocks(
  doc: ProseMirrorNode,
): DocumentProofingBlock[] {
  const blocks: DocumentProofingBlock[] = [];
  const styles = readDocumentLanguageStyles(doc.attrs as Record<string, unknown>);
  doc.descendants((node, pos) => {
    // The page's repeated copy of a table header row is checked once, in
    // the source row (its issues would otherwise be listed twice).
    if (node.attrs?.[TABLE_REPEATED_HEADER_ATTR] === true) return false;
    if (!node.isTextblock) return true;
    if (SKIPPED_TEXTBLOCKS.has(node.type.name)) return false;
    const block = proofingBlockOf(node, pos, styles);
    if (block) blocks.push(block);
    return false;
  });
  return blocks;
}

/** The paragraph holding `pos`, as the checker reads it; null when there is
 *  none or it is not checked (code, an equation). */
export function documentProofingBlockAt(
  doc: ProseMirrorNode,
  pos: number,
): DocumentProofingBlock | null {
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (!node.isTextblock) continue;
    if (SKIPPED_TEXTBLOCKS.has(node.type.name)) return null;
    return proofingBlockOf(
      node,
      $pos.before(depth),
      readDocumentLanguageStyles(doc.attrs as Record<string, unknown>),
    );
  }
  return null;
}

const HANGUL = /\p{Script=Hangul}/u;

function proofingBlockOf(
  node: ProseMirrorNode,
  pos: number,
  styles: DocumentLanguageStyles,
): DocumentProofingBlock | null {
  // A run that states no language is set in its paragraph's (the style
  // chain, then the document defaults: a German document's text is German
  // without a w:lang on every run).
  const paragraphLanguage = documentParagraphLanguage(styles, node);
  let text = "";
  const positions: number[] = [];
  const languages: (string | null)[] = [];
  const checked: boolean[] = [];
  node.forEach((child, offset) => {
    const start = pos + 1 + offset;
    const proofing = child.marks.find(
      (mark) => mark.type.name === PROOFING_LANGUAGE_MARK,
    );
    const code = child.marks.some((mark) => mark.type.name === "code");
    const language =
      typeof proofing?.attrs.val === "string" && proofing.attrs.val
        ? (proofing.attrs.val as string)
        : paragraphLanguage;
    const ok = proofing?.attrs.noProof !== true && !code;
    const value = child.isText ? (child.text ?? "") : OBJECT_REPLACEMENT;
    for (let index = 0; index < value.length; index += 1) {
      positions.push(start + (child.isText ? index : 0));
      // Hangul is written only in Korean: Word files it under the run's East
      // Asian language, which documents often leave unstated or set to the
      // author's other language, so it is judged by script.
      const code = value.charCodeAt(index);
      languages.push(code >= 0x1100 && HANGUL.test(value[index]!) ? "ko" : language);
      checked.push(ok);
    }
    text += value;
  });
  return text.trim()
    ? { text, positions, languages, checked, signature: hashText(text) }
    : null;
}

/** Whether the English grammar rules apply to text in `language`. */
function englishContext(language: string | null, defaultTag: string): boolean {
  return /^en(-|$)/i.test(language ?? defaultTag);
}

export interface DocumentEditorCheckOptions {
  readonly defaultLanguage: string;
  readonly dictionaries: ReadonlyMap<string, SpellingDictionary>;
  readonly spellingOptions: SpellingOptions;
  readonly customWords: readonly string[];
  readonly ignoredWords: ReadonlySet<string>;
  /** Grammar rules switched off with "Don't check for this issue". */
  readonly disabledRules: ReadonlySet<DocumentEditorIssueRule>;
  /** Issue keys passed over with Ignore Once. */
  readonly ignoredIssues: ReadonlySet<string>;
}

function snippet(text: string, start: number, end: number) {
  let before = text.slice(Math.max(0, start - 40), start);
  // A cut-off first or last word is dropped, as the card shows whole words.
  if (start > 40) before = before.replace(/^\S*\s/u, "");
  let after = text.slice(end, end + 40);
  if (end + 40 < text.length) after = after.replace(/\s\S*$/u, "");
  return {
    before: before.replace(/\uFFFC/g, ""),
    after: after.replace(/\uFFFC/g, ""),
  };
}

/** The key of one flagged occurrence. PURE. */
export function documentEditorIssueKey(
  rule: DocumentEditorIssueRule,
  from: number,
  to: number,
  text: string,
): string {
  return `${rule}|${from}|${to}|${text}`;
}

/**
 * An Ignore Once key carried through an edit, as Word keeps an ignored
 * occurrence ignored while the rest of the document is corrected: the range
 * follows the change, and the key is gone once its own text is edited or
 * deleted. Keys used to name the paragraph's whole text, so correcting any
 * other word of the paragraph brought the ignored one back (WUA 028).
 */
export function mapDocumentEditorIssueKey(
  key: string,
  mapping: {
    mapResult(pos: number, assoc?: number): { pos: number; deleted: boolean };
    readonly maps?: readonly StepMapLike[];
  },
  textBetween: (from: number, to: number) => string,
): string | null {
  const match = /^([^|]+)\|(\d+)\|(\d+)\|([\s\S]*)$/.exec(key);
  if (!match) return null;
  const [, rule, rawFrom, rawTo, text] = match;
  const textAt = (start: number, end: number): boolean => {
    try {
      return end > start && textBetween(start, end) === text;
    } catch {
      return false;
    }
  };
  const from = mapping.mapResult(Number(rawFrom), 1);
  const to = mapping.mapResult(Number(rawTo), -1);
  if (!from.deleted && !to.deleted && textAt(from.pos, to.pos)) {
    return documentEditorIssueKey(rule as DocumentEditorIssueRule, from.pos, to.pos, text);
  }
  // A change that rewrote a wider range than it changed -- Undo / Redo on a
  // collaborative page writes the paragraph back from the room, so the step
  // spans every word of it -- "deletes" the ignored word while leaving it
  // where it was: after Undo of a correction the ignored "teh" beside it came
  // back (WUA 028). The occurrence is kept when the same text stands at the
  // same offset inside the rewritten range; its own text edited, it is not.
  if (!mapping.maps?.length) return null;
  const length = Number(rawTo) - Number(rawFrom);
  const start = mapThroughRewrite(mapping.maps, Number(rawFrom));
  return start !== null && textAt(start, start + length)
    ? documentEditorIssueKey(rule as DocumentEditorIssueRule, start, start + length, text)
    : null;
}

interface StepMapLike {
  forEach(f: (oldStart: number, oldEnd: number, newStart: number, newEnd: number) => void): void;
  map(pos: number, assoc?: number): number;
}

/** `pos` through each step map, a position inside a replaced range kept at
 * its offset from the range's start (clamped to the replacement). */
function mapThroughRewrite(maps: readonly StepMapLike[], pos: number): number | null {
  let at = pos;
  for (const map of maps) {
    let rewritten: number | null = null;
    map.forEach((oldStart, oldEnd, newStart, newEnd) => {
      if (rewritten === null && at >= oldStart && at < oldEnd) {
        rewritten = Math.min(newEnd, newStart + (at - oldStart));
      }
    });
    at = rewritten ?? map.map(at, 1);
  }
  return at;
}

function issueAt(
  block: DocumentProofingBlock,
  rule: DocumentEditorIssueRule,
  start: number,
  end: number,
  suggestions: readonly string[] | null,
  language: string | null = null,
): DocumentEditorIssue | null {
  const from = block.positions[start];
  const last = block.positions[end - 1];
  if (from === undefined || last === undefined) return null;
  return {
    key: documentEditorIssueKey(rule, from, last + 1, block.text.slice(start, end)),
    rule,
    category: DOCUMENT_EDITOR_RULE_CATEGORY[rule],
    from,
    to: last + 1,
    text: block.text.slice(start, end),
    rangeText: block.text.slice(start, end),
    suggestions,
    language,
    ...snippet(block.text, start, end),
  };
}

const ABBREVIATIONS = new Set([
  "e.g", "i.e", "etc", "vs", "mr", "mrs", "ms", "dr", "st", "no", "fig",
  "cf", "al", "approx", "dept", "est", "jr", "sr", "inc", "ltd", "co",
  "p", "pp", "vol", "ed", "eds", "jan", "feb", "mar", "apr", "jun", "jul",
  "aug", "sep", "sept", "oct", "nov", "dec",
]);

/** a/an by the sound the next word starts with; null when unsure. */
export function expectedIndefiniteArticle(word: string): "a" | "an" | null {
  const lower = word.toLowerCase();
  if (!/^[a-z]/.test(lower)) return null;
  // An all-capital abbreviation is read letter by letter; leave it alone.
  if (word.length > 1 && word === word.toUpperCase()) return null;
  if (/^(hour|honest|honor|honour|heir)/.test(lower)) return "an";
  if (/^(one|once|eu|ewe|uni(?!n)|unanim|use|usu|uti|ura|ure|uri|uro|uku)/.test(lower)) {
    return "a";
  }
  return /^[aeiou]/.test(lower) ? "an" : "a";
}

function matchCase(original: string, replacement: string): string {
  if (original === original.toUpperCase() && original.length > 1) {
    return replacement.toUpperCase();
  }
  if (original[0] && original[0] !== original[0].toLowerCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function grammarIssues(
  block: DocumentProofingBlock,
  masked: string,
  options: DocumentEditorCheckOptions,
): DocumentEditorIssue[] {
  const out: DocumentEditorIssue[] = [];
  const english = (index: number) =>
    block.checked[index] === true &&
    englishContext(block.languages[index] ?? null, options.defaultLanguage);
  const push = (issue: DocumentEditorIssue | null) => {
    if (issue && !options.ignoredIssues.has(issue.key)) out.push(issue);
  };
  const enabled = (rule: DocumentEditorIssueRule) => !options.disabledRules.has(rule);

  // Punctuation: "multiple spaces between words".
  if (enabled("multipleSpaces")) {
    // After a letter, digit or closing punctuation: tested in code, no
    // lookbehind (Safari before 16.4 cannot compile one).
    for (const match of matchAllBehind(masked, /( {2,})(?=[\p{L}\p{N}("“‘])/gu, { char: /[\p{L}\p{N},.;:!?)"”’]/u })) {
      const start = match.index ?? 0;
      const end = start + match[1].length;
      if (english(start - 1) && english(end)) {
        push(issueAt(block, "multipleSpaces", start, end, [" "]));
      }
    }
  }
  // Punctuation: a space before a comma, period, semicolon, colon, ! or ?.
  if (enabled("spaceBeforePunctuation")) {
    for (const match of matchAllBehind(masked, /( +)(?=[,.;:!?](?:\s|$))/gu, { char: /[\p{Script=Latin}\p{N}]/u })) {
      const start = match.index ?? 0;
      const end = start + match[1].length;
      if (english(start - 1) && english(end)) {
        push(issueAt(block, "spaceBeforePunctuation", start, end, [""]));
      }
    }
  }
  const tokens = tokenizeForSpelling(masked, {
    ignoreInternetAndFileAddresses: options.spellingOptions.ignoreInternetAndFileAddresses,
  });
  // Noun phrases: a/an misuse.
  if (enabled("article")) {
    for (let index = 0; index + 1 < tokens.length; index += 1) {
      const article = tokens[index];
      const next = tokens[index + 1];
      const lower = article.word.toLowerCase();
      if (lower !== "a" && lower !== "an") continue;
      if (!/^ +$/.test(masked.slice(article.end, next.start))) continue;
      if (!english(article.start) || !english(next.start)) continue;
      const expected = expectedIndefiniteArticle(next.word);
      if (!expected || expected === lower) continue;
      push(
        issueAt(block, "article", article.start, article.end, [
          matchCase(article.word, expected),
        ]),
      );
    }
  }
  // Capitalization: a sentence that starts with a lower-case word.
  if (enabled("capitalization")) {
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (!/^[a-z][a-z'’]*$/.test(token.word)) continue;
      if (!english(token.start)) continue;
      const lead = masked.slice(0, token.start);
      let starts = false;
      if (index === 0) {
        starts = /^[\s"“‘(]*$/u.test(lead);
      } else {
        const end = /([.!?])["”’)]*\s+["“‘(]*$/u.exec(lead);
        if (end && !/\.\.\s*$/u.test(lead.slice(0, end.index + 1))) {
          const previous = tokens[index - 1];
          const abbreviation =
            end[1] === "." &&
            ABBREVIATIONS.has(
              masked.slice(previous.start, end.index).toLowerCase(),
            );
          const single = previous.end - previous.start === 1 && end[1] === ".";
          starts = !abbreviation && !single && previous.end === end.index;
        }
      }
      // A one-word line (a list item, a label) is not a sentence.
      if (!starts || index + 1 >= tokens.length) continue;
      push(
        issueAt(block, "capitalization", token.start, token.end, [
          token.word[0].toUpperCase() + token.word.slice(1),
        ]),
      );
    }
  }
  // Style: "Sentence length (more than 60 words)".
  if (enabled("sentenceLength")) {
    let count = 0;
    let firstToken = -1;
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (count === 0) firstToken = token.start;
      count += 1;
      const tail = masked.slice(token.end, tokens[index + 1]?.start ?? masked.length);
      const ends = /[.!?]/.test(tail) || index === tokens.length - 1;
      if (ends) {
        if (count > 60 && english(firstToken)) {
          push(issueAt(block, "sentenceLength", firstToken, token.end, []));
        }
        count = 0;
      }
    }
  }
  return out;
}

function spellingIssues(
  block: DocumentProofingBlock,
  options: DocumentEditorCheckOptions,
): DocumentEditorIssue[] {
  const groups = new Map<string, boolean[]>();
  for (let index = 0; index < block.text.length; index += 1) {
    if (!block.checked[index]) continue;
    const tag = proofingDictionaryTag(
      block.languages[index] ?? null,
      options.defaultLanguage,
    );
    if (!tag || !options.dictionaries.has(tag)) continue;
    let mask = groups.get(tag);
    if (!mask) {
      mask = new Array<boolean>(block.text.length).fill(false);
      groups.set(tag, mask);
    }
    mask[index] = true;
  }
  const out: DocumentEditorIssue[] = [];
  for (const [tag, mask] of groups) {
    const dictionary = options.dictionaries.get(tag)!;
    // Text outside this language (or not checked) reads as an object, not as
    // space: its words are neither judged by this dictionary nor joined to
    // the words around them, and no repeated word or run of spaces is found
    // across it (WUA 033).
    let masked = "";
    for (let index = 0; index < block.text.length; index += 1) {
      masked += mask[index] ? block.text[index] : OBJECT_REPLACEMENT;
    }
    const context: SpellingCheckContext = {
      dictionary,
      options: options.spellingOptions,
      customWords: options.customWords,
      ignoredWords: options.ignoredWords,
    };
    let from = 0;
    for (;;) {
      const found = findSpellingIssue(masked, from, context);
      if (!found) break;
      from = found.end;
      const rule: DocumentEditorIssueRule =
        found.kind === "repeated" ? "repeated" : "misspelled";
      const issue = issueAt(
        block,
        rule,
        found.start,
        found.end,
        rule === "repeated" ? [""] : null,
        tag,
      );
      if (!issue || options.ignoredIssues.has(issue.key)) continue;
      if (rule === "repeated") {
        // Delete the repeated word together with the space before it.
        const spaceStart = masked.slice(0, found.start).search(/\s+$/u);
        const widened =
          spaceStart >= 0 ? issueAt(block, rule, spaceStart, found.end, [""], tag) : null;
        out.push(
          widened
            ? { ...widened, key: issue.key, text: issue.text, before: issue.before, after: issue.after }
            : issue,
        );
        continue;
      }
      out.push(issue);
    }
  }
  return out;
}

/** Every issue of the document, in document order. */
export function collectDocumentEditorIssues(
  blocks: readonly DocumentProofingBlock[],
  options: DocumentEditorCheckOptions,
): DocumentEditorIssue[] {
  const issues: DocumentEditorIssue[] = [];
  for (const block of blocks) {
    // Text marked "Do not check spelling or grammar" reads as an object, not
    // as space: read as spaces, " teh " between two single spaces made a run
    // of five, and "Change to one space" replaced the word with it (WUA 033).
    let masked = "";
    for (let index = 0; index < block.text.length; index += 1) {
      masked += block.checked[index] ? block.text[index] : OBJECT_REPLACEMENT;
    }
    issues.push(...spellingIssues(block, options));
    issues.push(...grammarIssues(block, masked, options));
  }
  return issues.sort((left, right) => left.from - right.from || left.to - right.to);
}

/** The languages whose dictionaries a check of these blocks needs. */
export function documentProofingDictionaryTags(
  blocks: readonly DocumentProofingBlock[],
  defaultLanguage: string,
): string[] {
  const tags = new Set<string>();
  for (const block of blocks) {
    block.languages.forEach((language, index) => {
      if (!block.checked[index]) return;
      const tag = proofingDictionaryTag(language, defaultLanguage);
      if (tag) tags.add(tag);
    });
  }
  return [...tags];
}

export function documentEditorIgnoreKey(word: string): string {
  return ignoreKey(word);
}

/** Scripts written without spaces between words (no word list can check
 *  them), as ISO 15924 codes. */
const NO_WORD_SPACE_SCRIPTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\p{Script=Han}/u, "Hani"],
  [/[\p{Script=Hiragana}\p{Script=Katakana}]/u, "Jpan"],
  [/\p{Script=Thai}/u, "Thai"],
  [/\p{Script=Lao}/u, "Laoo"],
  [/\p{Script=Khmer}/u, "Khmr"],
  [/\p{Script=Myanmar}/u, "Mymr"],
  [/\p{Script=Tibetan}/u, "Tibt"],
];

const DICTIONARY_SCRIPTS: ReadonlyArray<readonly [RegExp, SpellingScript]> = [
  [/\p{Script=Latin}/u, "Latin"],
  [/\p{Script=Greek}/u, "Greek"],
  [/\p{Script=Cyrillic}/u, "Cyrillic"],
  [/\p{Script=Hangul}/u, "Hangul"],
];

const OTHER_SCRIPTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\p{Script=Arabic}/u, "Arab"],
  [/\p{Script=Hebrew}/u, "Hebr"],
  [/\p{Script=Devanagari}/u, "Deva"],
  [/\p{Script=Bengali}/u, "Beng"],
  [/\p{Script=Tamil}/u, "Taml"],
  [/\p{Script=Telugu}/u, "Telu"],
  [/\p{Script=Gujarati}/u, "Gujr"],
  [/\p{Script=Gurmukhi}/u, "Guru"],
  [/\p{Script=Kannada}/u, "Knda"],
  [/\p{Script=Malayalam}/u, "Mlym"],
  [/\p{Script=Sinhala}/u, "Sinh"],
  [/\p{Script=Armenian}/u, "Armn"],
  [/\p{Script=Georgian}/u, "Geor"],
  [/\p{Script=Ethiopic}/u, "Ethi"],
];

/** Language tags that state the text has no language to check. */
const NO_LANGUAGE = new Set(["zxx", "und", "mis", "mul"]);

/** What a check of the document leaves unchecked, for the pane to say so. */
export interface DocumentUncheckedProofing {
  /** Scripts written without word spaces the document has text in (ISO
   *  15924: Hani, Jpan, Thai, ...). */
  readonly noWordSpaces: readonly string[];
  /** Languages the document sets text in that MRAI has no dictionary for
   *  (primary subtags: fi, ar, ...). */
  readonly noDictionary: readonly string[];
  /** Other scripts whose text no dictionary of its language reads (Arab,
   *  Hebr, Cyrl text set in an English run, ...). */
  readonly otherScripts: readonly string[];
}

function scriptOf(character: string): { kind: "dictionary"; script: SpellingScript } | { kind: "noSpaces" | "other"; code: string } | null {
  for (const [pattern, script] of DICTIONARY_SCRIPTS) {
    if (pattern.test(character)) return { kind: "dictionary", script };
  }
  for (const [pattern, code] of NO_WORD_SPACE_SCRIPTS) {
    if (pattern.test(character)) return { kind: "noSpaces", code };
  }
  for (const [pattern, code] of OTHER_SCRIPTS) {
    if (pattern.test(character)) return { kind: "other", code };
  }
  return null;
}

const SPELLING_SCRIPT_CODE: Record<SpellingScript, string> = {
  Latin: "Latn",
  Greek: "Grek",
  Cyrillic: "Cyrl",
  Hangul: "Kore",
};

/** The text a spelling check of these blocks passes over, and why. */
export function documentUncheckedProofing(
  blocks: readonly DocumentProofingBlock[],
  defaultLanguage: string,
): DocumentUncheckedProofing {
  const noWordSpaces = new Set<string>();
  const noDictionary = new Set<string>();
  const otherScripts = new Set<string>();
  const letter = /\p{L}/u;
  for (const block of blocks) {
    const { text } = block;
    // A script no dictionary of its run reads counts from a two-letter word
    // on: a lone α or π in English is a symbol, not Greek text.
    let otherRun: string | null = null;
    let otherLength = 0;
    const other = (code: string | null) => {
      if (code !== otherRun) {
        otherRun = code;
        otherLength = 0;
      }
      if (code === null) return;
      otherLength += 1;
      if (otherLength >= 2) otherScripts.add(code);
    };
    for (let index = 0; index < text.length; index += 1) {
      if (!block.checked[index]) continue;
      const character = text[index]!;
      const code = character.charCodeAt(0);
      // ASCII letters are Latin; everything else below is a letter test.
      const ascii = code < 0x80;
      if (ascii ? !/[A-Za-z]/.test(character) : !letter.test(character)) {
        other(null);
        continue;
      }
      const script = ascii ? ({ kind: "dictionary", script: "Latin" } as const) : scriptOf(character);
      if (!script) continue;
      if (script.kind === "noSpaces") {
        noWordSpaces.add(script.code);
        continue;
      }
      const language = block.languages[index] ?? defaultLanguage;
      if (NO_LANGUAGE.has(language.toLowerCase().split("-")[0] ?? "")) continue;
      const tag = proofingDictionaryTag(language, defaultLanguage);
      if (!tag) {
        const reason = spellingUncheckedReason(language);
        const primary = language.replace(/_/g, "-").split("-")[0]!.toLowerCase();
        if (reason === "noWordSpaces") {
          // Latin words in text set in Chinese, Japanese or Thai.
          if (script.kind === "dictionary") noDictionary.add(primary);
        } else {
          noDictionary.add(primary);
        }
        continue;
      }
      const judged = spellingDictionaryInfo(tag)?.script ?? "Latin";
      if (script.kind === "dictionary") {
        other(script.script !== judged ? SPELLING_SCRIPT_CODE[script.script] : null);
      } else {
        other(script.code);
      }
    }
  }
  return {
    noWordSpaces: [...noWordSpaces],
    noDictionary: [...noDictionary],
    otherScripts: [...otherScripts],
  };
}
