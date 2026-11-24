/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { normalizeEastAsianFontFamilies } from "../../../../lib/document-word-line-metrics";
import { wordFontIsEastAsian, wordFontIsRecordedLatin } from "./wordFontMetrics";
import { normalizeWordCompatibilityMode } from "./documentOverflowPunctuation";
import { isEastAsianLanguageTag } from "../../../office-ribbon/officeEastAsianLanguage";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";





























const answers = new WeakMap<object, boolean>();

export function wordSetsIdeographsAsLetters(attrs: { readonly [key: string]: unknown }): boolean {
  if (typeof window !== "undefined" && (window as Window & { __docsLatinIdeographsOff?: boolean }).__docsLatinIdeographsOff === true) return false;
  // Asked for every paragraph a pass reads: one answer per document attrs.
  let answer = answers.get(attrs);
  if (answer === undefined) answers.set(attrs, (answer = ideographsAsLetters(attrs)));
  return answer;
}

















export function wordOmitsEastAsianAutoSpace(attrs: { readonly [key: string]: unknown }): boolean {
  if (typeof window !== "undefined" && (window as Window & { __docsLatinDefaultsAutoSpaceOff?: boolean }).__docsLatinDefaultsAutoSpaceOff === true) return false;
  let answer = autoSpaceAnswers.get(attrs);
  if (answer === undefined) autoSpaceAnswers.set(attrs, (answer = defaultsNameNoEastAsianFace(attrs)));
  return answer;
}
const autoSpaceAnswers = new WeakMap<object, boolean>();

function ideographsAsLetters(attrs: { readonly [key: string]: unknown }): boolean {
  const mode = normalizeWordCompatibilityMode(attrs.wordCompatibilityMode);
  if (mode === null || mode >= 14) return false;
  return defaultsNameNoEastAsianFace(attrs);
}

/** Whether the document's defaults name no East Asian face (false where the
 * page cannot tell: no defaults' stack). */
function defaultsNameNoEastAsianFace(attrs: { readonly [key: string]: unknown }): boolean {
  const stack = attrs.defaultFontFamily;
  if (typeof stack !== "string" || !stack.trim()) return false;
  if (typeof attrs.defaultEastAsianFontFamily === "string" && attrs.defaultEastAsianFontFamily.trim()) return false;
  const declared = new Set(
    (normalizeEastAsianFontFamilies(attrs.eastAsianFontFamilies) ?? [])
      .filter((family) => !wordFontIsRecordedLatin(family))
      .map((family) => family.toLowerCase()),
  );
  const tokens = stack.split(",").map((token) => token.trim().replace(/^["']|["']$/g, "").trim()).filter(Boolean);
  return !tokens.some((name) => declared.has(name.toLowerCase()) || wordFontIsEastAsian(name));
}

/**
 * Whether Windows Word applies its East Asian line rules (kinsoku: no "（"
 * at a line's end, no "）" or "。" at its start; a closing mark hanging past
 * the edge) to a paragraph's East Asian text: not where that text's East
 * Asian language (the run's w:lang w:eastAsia, else the Normal style's or
 * docDefaults' -- the page's `eastAsianLanguage`) is not Chinese, Japanese or
 * Korean. Measured (docx-look/probes/cjk3 kin / kinen, mode 14, SimSun
 * defaults, 41 ideographs a line): with the language en-US, "距离（" ends a
 * line and "）和南…" opens the next, the 42nd character neither pulled up
 * nor hung; with zh-CN, ja-JP or none stated, "（" goes down with "EW" and
 * "和场）" hangs. Corpus R334-D24 (defaults' eastAsia en-US): Word ends the
 * abstract's third line "东西向（".
 *
 * `window.__docsEnglishEastAsianRulesOff = true` applies them to all East
 * Asian text, as before, for an A/B of one build.
 */
export function wordEastAsianLineRulesApply(docAttrs: { readonly [key: string]: unknown }, node: ProseMirrorNode): boolean {
  if (englishEastAsianRulesOff()) return true;
  // Paragraph > Asian Typography > "Use Asian rules to control first and
  // last characters" off (w:kinsoku 0): the same lines, drawn so by
  // DocumentFormatting's `line-break: anywhere` (R324-D01).
  if ((node.attrs.kinsoku ?? docAttrs.defaultKinsoku) === false) return false;
  return wordEastAsianTextInEastAsianLanguage(docAttrs, node);
}

function englishEastAsianRulesOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsEnglishEastAsianRulesOff?: boolean }).__docsEnglishEastAsianRulesOff === true;
}

/** The language half of wordEastAsianLineRulesApply: whether the paragraph's
 * East Asian text is in Chinese, Japanese or Korean (or none stated). */
export function wordEastAsianTextInEastAsianLanguage(docAttrs: { readonly [key: string]: unknown }, node: ProseMirrorNode): boolean {
  if (englishEastAsianRulesOff()) return true;
  let language: unknown;
  node.descendants((child) => {
    if (language !== undefined) return false;
    if (!child.isText || !EAST_ASIAN_TEXT.test(child.text ?? "")) return true;
    const mark = child.marks.find((candidate) => candidate.type.name === "proofingLanguage");
    language = typeof mark?.attrs.eastAsia === "string" && mark.attrs.eastAsia ? mark.attrs.eastAsia : null;
    return false;
  });
  const tag = typeof language === "string" ? language : docAttrs.eastAsianLanguage;
  return typeof tag !== "string" || !/^[A-Za-z]{2,8}(-|$)/.test(tag) || isEastAsianLanguageTag(tag);
}
const EAST_ASIAN_TEXT = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\uff00-\uffef]/;
