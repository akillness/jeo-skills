/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Default readings for Home > Font > Phonetic Guide (拼音指南).
 *
 * Word opens the dialog "prepopulated with default ruby text for the selected
 * base text and language" (Murray Sargent, "Ruby Text Objects", Microsoft
 * Learn archive), and Default Reading puts those readings back. For Chinese
 * base text the reading is Hanyu Pinyin with tone marks, one syllable per
 * character; a group's reading is its syllables separated by spaces (the
 * Group / Mono rules of rubyProperties.ts).
 *
 * The pinyin comes from `pinyin-pro` (MIT), loaded only when the dialog
 * opens. It reads the whole selection at once, so a character with more than
 * one pronunciation gets the one its word uses (银行 yín háng, 行走 xíng zǒu).
 * Text with Japanese kana is left alone: its readings are not pinyin.
 */
import type { PhoneticGuideSegment } from "./rubyProperties";

/** One reading per code point of the text ("" where there is none). */
export type PhoneticReadingProvider = (text: string) => string[];

let loading: Promise<PhoneticReadingProvider> | null = null;

export function loadPinyinReadingProvider(): Promise<PhoneticReadingProvider> {
  if (!loading) {
    const attempt = import("pinyin-pro").then(
      ({ pinyin }): PhoneticReadingProvider =>
        (text) => {
          const characters = Array.from(text);
          const read = pinyin(text, { type: "all", toneType: "symbol" });
          // pinyin-pro answers one entry per code point; anything else is not
          // trusted to line up with the base text.
          if (read.length !== characters.length) return characters.map(() => "");
          return read.map((entry, index) =>
            entry.origin === characters[index] && entry.isZh ? entry.pinyin : "",
          );
        },
    );
    loading = attempt;
    attempt.catch(() => {
      if (loading === attempt) loading = null;
    });
  }
  return loading;
}

const KANA_RE = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;

/**
 * The segments with their default readings: every row's reading comes from
 * the provider (`replace: "all"`, Default Reading) or only the rows that have
 * none yet (`replace: "empty"`, opening the dialog). A row with no Chinese
 * character gets an empty default reading.
 */
export function phoneticGuideSegmentsWithDefaultReadings(
  segments: readonly PhoneticGuideSegment[],
  provider: PhoneticReadingProvider,
  replace: "all" | "empty",
): PhoneticGuideSegment[] {
  const text = segments
    .map((segment) => (segment.kind === "row" ? segment.base : segment.text))
    .join("");
  if (KANA_RE.test(text)) return [...segments];
  const readings = provider(text);
  let cursor = 0;
  return segments.map((segment) => {
    const length = Array.from(
      segment.kind === "row" ? segment.base : segment.text,
    ).length;
    const own = readings.slice(cursor, cursor + length);
    cursor += length;
    if (segment.kind !== "row") return segment;
    if (replace === "empty" && segment.ruby.trim()) return segment;
    return { ...segment, ruby: own.filter(Boolean).join(" ") };
  });
}
