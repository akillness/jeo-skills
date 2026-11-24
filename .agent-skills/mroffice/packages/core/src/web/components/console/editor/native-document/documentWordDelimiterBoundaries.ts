/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Node as PmNode } from "@tiptap/pm/model";

/** Word permits a Han character to end a line before a slash-prefixed Latin
 * word. CSS strict line breaking can attach that Han character to the slash
 * and move it unnecessarily. Keep the ASCII token's own wrapping policy. */
export function documentHanSlashBoundaries(block: PmNode, contentFrom: number): Array<{ from: number; to: number }> {
  if (!/\p{Script=Han}\/[A-Za-z]/u.test(block.textContent)) return [];
  const characters: Array<{ character: string; from: number; to: number } | null> = [];
  block.forEach((child, childOffset) => {
    if (!child.isText || child.marks.some(mark => ["code", "link"].includes(mark.type.name))) {
      characters.push(null);
      return;
    }
    let offset = 0;
    for (const character of child.text ?? "") {
      const from = contentFrom + childOffset + offset;
      characters.push({ character, from, to: from + character.length });
      offset += character.length;
    }
  });
  return characters.flatMap((character, index) =>
    character && /\p{Script=Han}/u.test(character.character) &&
    characters[index + 1]?.character === "/" &&
    /^[A-Za-z]$/.test(characters[index + 2]?.character ?? "")
      ? [{ from: character.from, to: character.to }]
      : [],
  );
}

/** A letter that is neither ASCII, which the engines keep after a slash on
 * their own, nor one that breaks freely anyway (Han, Kana, Hangul). */
const SLASH_KEPT_LETTER = /^(?![\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])[^\0-\x7f]$/u;

/** Word keeps a slash after a word with what follows it ("Α/Α", "Δ/ΝΣΗ:"), as
 * the engines do in ASCII ("and/or") but not before a Greek or Cyrillic letter
 * (corpus R280-D22: every such pair of a 2-page table wrapped). The returned
 * range is the slash and that letter, to keep together. */
export function documentSlashLetterBoundaries(block: PmNode, contentFrom: number): Array<{ from: number; to: number }> {
  if (!block.textContent.includes("/")) return [];
  const characters: Array<{ character: string; from: number; to: number } | null> = [];
  block.forEach((child, childOffset) => {
    if (!child.isText || child.marks.some(mark => ["code", "link"].includes(mark.type.name))) {
      characters.push(null);
      return;
    }
    let offset = 0;
    for (const character of child.text ?? "") {
      const from = contentFrom + childOffset + offset;
      characters.push({ character, from, to: from + character.length });
      offset += character.length;
    }
  });
  return characters.flatMap((character, index) => {
    const before = characters[index - 1];
    const next = characters[index + 1];
    return character?.character === "/" && before && next && !/^\p{Nd}$/u.test(before.character) &&
      /^\p{L}$/u.test(next.character) && SLASH_KEPT_LETTER.test(next.character)
      ? [{ from: character.from, to: next.to }]
      : [];
  });
}

/** Word's simplified-Chinese "cannot begin a line" characters the engines
 * still start a line with (Chromium and WebKit, line-break normal and
 * strict), measured one by one against the list below. The interpunct is
 * the no-end rule's (DocumentFormatting). */
export const WORD_ZH_CN_NO_START_EXTRA: ReadonlySet<string> = new Set([..."¨ˇˉ―‖∶〃〆＂＇～｀｜＞>"]);
export const WORD_ZH_CN_NO_START_EXTRA_TEST = /[¨ˇˉ―‖∶〃〆＂＇～｀｜＞>]/u;

/** The line breaking list Word applies to East Asian text in a language
 * (Options > Typography: Japanese, Simplified and Traditional Chinese,
 * Korean). Text without a stated language takes the simplified-Chinese
 * list, as the zh-CN Word the corpus is measured on does. */
export type WordKinsokuList = "zh-CN" | "zh-TW" | "ja" | "ko";

export function wordKinsokuList(language: unknown): WordKinsokuList {
  if (typeof language !== "string") return "zh-CN";
  if (/^ja\b/iu.test(language)) return "ja";
  if (/^ko\b/iu.test(language)) return "ko";
  if (/^zh-(TW|HK|MO|Hant)\b/iu.test(language)) return "zh-TW";
  return "zh-CN";
}

/** Marks Word lets start (`start`) or end (`end`) a line under a list where
 * Chromium's line breaking does not: measured on R14-D15's ladder (161
 * cases, Word 16.86), every case where Word broke and the page did not.
 * WebKit already breaks at each of them. */
export const WORD_KINSOKU_ALLOWED: Readonly<Record<WordKinsokuList, { start: ReadonlySet<string>; end: ReadonlySet<string> }>> = {
  "zh-CN": { start: new Set([..."々゛゜ゝゞ・ヽヾ｡｣､･ﾞﾟ–‥‧﹐‐〙‼⁉"]), end: new Set([..."￦"]) },
  ja: { start: new Set([..."…〗‥"]), end: new Set([..."￦〖﹙·"]) },
  "zh-TW": { start: new Set([..."々・〃〗～―‰"]), end: new Set([..."￦〖·"]) },
  ko: { start: new Set([..."々・…〗‥¢‰"]), end: new Set([..."‘￦〖﹙·"]) },
};

/** Word's default Simplified Chinese "cannot begin a line" characters
 * (Options > Typography > line breaking). Word refuses to start a line with
 * one of them even after a space, so the space is not a break opportunity.
 * CSS strict line breaking still breaks after that space. */
const WORD_ZH_CN_NO_START = new Set([...'!%),.:;>?]}¢¨°·ˇˉ―‖’”…‰′″›℃∶、。〃〆〕〗〞﹚﹜！＂％＇），．：；？］｝～']);

function witnessedChineseRun(node: PmNode): boolean {
  const font = node.marks.find(mark => mark.type.name === "fontFamily")?.attrs;
  const language = node.marks.find(mark => mark.type.name === "proofingLanguage")?.attrs;
  const chinese = (value: unknown) => typeof value === "string" && value.toLowerCase() === "zh-cn";
  return font?.hint === "eastAsia" && chinese(font.hintLanguage) && chinese(language?.val) && chinese(language?.eastAsia);
}

/** A single space followed by a Word zh-CN no-start character. The returned
 * range is that space; its projection must keep the following character on
 * the same line without adding, removing or restyling source text. */
export function documentKinsokuNoStartBoundaries(block: PmNode, contentFrom: number): Array<{ from: number; to: number }> {
  if (!/ \S/.test(block.textContent)) return [];
  const characters: Array<{ character: string; from: number; to: number; witnessed: boolean } | null> = [];
  block.forEach((child, childOffset) => {
    if (!child.isText || child.marks.some(mark => ["code", "link"].includes(mark.type.name))) {
      characters.push(null);
      return;
    }
    const witnessed = witnessedChineseRun(child);
    let offset = 0;
    for (const character of child.text ?? "") {
      const from = contentFrom + childOffset + offset;
      characters.push({ character, from, to: from + character.length, witnessed });
      offset += character.length;
    }
  });
  return characters.flatMap((character, index) => {
    const next = characters[index + 1];
    return character && next && character.character === " " && character.witnessed && next.witnessed &&
      characters[index - 1]?.character !== " " && WORD_ZH_CN_NO_START.has(next.character)
      ? [{ from: character.from, to: character.to }]
      : [];
  });
}

/** The same arrow and font outline have different Word break opportunities
 * under different Common-character script hints. Only the independently
 * witnessed East Asian / zh-CN source profile may open this boundary. */
export function documentSourceArrowBoundaries(block: PmNode, contentFrom: number): Array<{ from: number; to: number }> {
  if (!block.textContent.includes("→")) return [];
  const boundaries: Array<{ from: number; to: number }> = [];
  block.forEach((child, offset) => {
    if (!child.isText || child.marks.some(mark => ["code", "link"].includes(mark.type.name))) return;
    const font = child.marks.find(mark => mark.type.name === "fontFamily")?.attrs;
    const language = child.marks.find(mark => mark.type.name === "proofingLanguage")?.attrs;
    const chinese = (value: unknown) => typeof value === "string" && value.toLowerCase() === "zh-cn";
    if (font?.hint !== "eastAsia" || !chinese(font.hintLanguage) ||
        !chinese(language?.val) || !chinese(language?.eastAsia)) return;
    const text = child.text ?? "";
    for (let index = text.indexOf("→"); index !== -1; index = text.indexOf("→", index + 1)) {
      const from = contentFrom + offset + index;
      boundaries.push({ from, to: from + 1 });
    }
  });
  return boundaries;
}

const HANGUL_TEXT = /[ᄀ-ᇿ㄰-㆏ꥠ-꥿가-힯ힰ-퟿]/u;
const HAN_OR_KANA = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

/** Word wraps Korean by word while "Allow Latin text to wrap in the middle
 * of a word" is off (w:wordWrap, on by default): a Hangul word that does not
 * fit moves down whole (corpus R14-D15's KR1/KR2, with and without a ko-KR
 * language; KR3's wordWrap="0" breaks between any two syllables). The
 * engines break between Hangul syllables like ideographs. Each
 * space-delimited token that holds Hangul and no Han or Kana is returned, to
 * be set `word-break: keep-all`; Chinese and Japanese text keeps its
 * per-character breaks. */
export function documentHangulWordRanges(block: PmNode, contentFrom: number): Array<{ from: number; to: number }> {
  if (!HANGUL_TEXT.test(block.textContent)) return [];
  const ranges: Array<{ from: number; to: number }> = [];
  let token: { from: number; to: number; hangul: boolean; other: boolean } | null = null;
  const close = () => {
    if (token && token.hangul && !token.other && token.to - token.from > 1) {
      ranges.push({ from: token.from, to: token.to });
    }
    token = null;
  };
  block.forEach((child, childOffset) => {
    if (!child.isText) {
      close();
      return;
    }
    let offset = 0;
    for (const character of child.text ?? "") {
      const from = contentFrom + childOffset + offset;
      offset += character.length;
      if (/\s/u.test(character)) {
        close();
        continue;
      }
      token ??= { from, to: from, hangul: false, other: false };
      token.to = from + character.length;
      token.hangul ||= HANGUL_TEXT.test(character);
      token.other ||= HAN_OR_KANA.test(character);
    }
  });
  close();
  return ranges;
}
















export function documentKoreanWholeWordRanges(
  block: PmNode,
  contentFrom: number,
  documentLanguage: unknown,
): "paragraph" | Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = [];
  let other = false;
  block.forEach((child, childOffset) => {
    if (!child.isText) return;
    const proofing = child.marks.find((mark) => mark.type.name === "proofingLanguage")?.attrs;
    const own = typeof proofing?.eastAsia === "string" && proofing.eastAsia ? proofing.eastAsia : null;
    const language = own ?? documentLanguage;
    if (typeof language !== "string" || wordKinsokuList(language) !== "ko") {
      other = true;
      return;
    }
    const from = contentFrom + childOffset;
    const last = ranges[ranges.length - 1];
    if (last && last.to === from) last.to = from + child.nodeSize;
    else ranges.push({ from, to: from + child.nodeSize });
  });
  return !other && ranges.length > 0 ? "paragraph" : ranges;
}

const KINSOKU_ALLOWED_ANY = new RegExp(
  `[${[...new Set(Object.values(WORD_KINSOKU_ALLOWED).flatMap(({ start, end }) => [...start, ...end]))]
    .map((character) => `\\u{${character.codePointAt(0)!.toString(16)}}`).join("")}]`,
  "u",
);
const KINSOKU_EAST_ASIAN = /[\u1100-\u11ff\u2e80-\u9fff\ua960-\ua97f\uac00-\ud7af\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef]|[\u{20000}-\u{3134f}]/u;

/** The characters to set `line-break: anywhere` so the page breaks where
 * Word's list lets it ({@link WORD_KINSOKU_ALLOWED}): the character before a
 * mark that may start a line, and a mark that may end one, between East
 * Asian characters only. The run's own East Asian language decides the
 * list, else the document's. */
export function documentKinsokuAllowedBreaks(
  block: PmNode,
  contentFrom: number,
  documentLanguage: unknown,
): Array<{ from: number; to: number }> {
  if (!KINSOKU_ALLOWED_ANY.test(block.textContent)) return [];
  const characters: Array<{ character: string; from: number; to: number; list: WordKinsokuList } | null> = [];
  block.forEach((child, childOffset) => {
    if (!child.isText || child.marks.some(mark => ["code", "link"].includes(mark.type.name))) {
      characters.push(null);
      return;
    }
    const proofing = child.marks.find((mark) => mark.type.name === "proofingLanguage")?.attrs;
    const list = wordKinsokuList(proofing?.eastAsia ?? documentLanguage);
    let offset = 0;
    for (const character of child.text ?? "") {
      const from = contentFrom + childOffset + offset;
      characters.push({ character, from, to: from + character.length, list });
      offset += character.length;
    }
  });
  const ranges: Array<{ from: number; to: number }> = [];
  characters.forEach((entry, index) => {
    if (!entry) return;
    const previous = characters[index - 1];
    const next = characters[index + 1];
    const allowed = WORD_KINSOKU_ALLOWED[entry.list];
    if (allowed.start.has(entry.character) && previous && KINSOKU_EAST_ASIAN.test(previous.character)) {
      ranges.push({ from: previous.from, to: previous.to });
    }
    if (allowed.end.has(entry.character) && next && KINSOKU_EAST_ASIAN.test(next.character) &&
        previous && KINSOKU_EAST_ASIAN.test(previous.character)) {
      ranges.push({ from: entry.from, to: entry.to });
    }
  });
  return ranges.filter((range, index) => index === 0 || range.from !== ranges[index - 1].from);
}
