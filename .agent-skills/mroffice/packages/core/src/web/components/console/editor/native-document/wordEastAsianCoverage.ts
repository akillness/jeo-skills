/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import data from "./wordEastAsianCoverage.json";

/**
 * Han characters an East Asian face Word lays text out with does not have,
 * and the face Word draws them in instead.
 *
 * Word 16 sets 第一项内容 in ＭＳ 明朝 with 项 (U+9879, no glyph in MS Mincho)
 * from Microsoft YaHei, and that line takes YaHei's East Asian line box:
 * 21.7pt at 11pt and 1.15 where the line without it is 16.4pt
 * (`wp-ea/ea-fallback.docx`). Behind Yu Mincho the face is SimSun. The
 * coverage is each face's own cmap (Word's bundled files), one bit per code
 * point of the blocks below; anything outside them is not decided here.
 * Besides the Han blocks, the CJK Compatibility Forms and Small Form
 * Variants (U+FE30-FE6F) are recorded: ＭＳ 明朝 has none of them, and Word
 * draws ︶ ﹚ ﹐ ﹑ ︰ in Microsoft YaHei with YaHei's line box (R14-D15
 * K66/K67/K81-K83, R02-D14).
 */

interface CoverageFace {
  names: readonly string[];
  fallback: string;
  coverage: string;
}

const blocks: ReadonlyArray<readonly number[]> = data.blocks;
const decoded = new Map<string, Uint8Array>();
const byName = new Map<string, CoverageFace>();
for (const face of data.faces as readonly CoverageFace[]) {
  for (const name of face.names) byName.set(name.toLowerCase(), face);
}

function bits(key: string): Uint8Array {
  let value = decoded.get(key);
  if (!value) {
    const encoded = (data.sets as Record<string, string>)[key] ?? "";
    const binary = typeof atob === "function" ? atob(encoded) : "";
    value = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    decoded.set(key, value);
  }
  return value;
}

/**
 * The face Word draws this code point in when `family` has no glyph for it,
 * or null when the face has it, the face is not recorded, or the code point
 * is outside the recorded blocks.
 */
/** Hangul syllables and compatibility jamo. */
const HANGUL_RE = /[\uac00-\ud7a3\u3130-\u318f\u1100-\u11ff]/;
const HAN_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

/**
 * The face Word draws a list marker's text in when the marker's own face
 * cannot: Malgun Gothic for Hangul behind every other face Word ships
 * (fmts.docx: koreanCounting / ganada / chosung numbers under Cambria /
 * ＭＳ 明朝 are Malgun Gothic, and the line takes its East Asian box), and
 * the Han fallback above for a Han character the face lacks. Null when the
 * face draws the text itself (or is not known here).
 */
export function wordMarkerFallbackFace(family: string, text: string): string | null {
  const name = family.trim().replace(/^["']|["']$/g, "");
  if (HANGUL_RE.test(text) && name.toLowerCase() !== "malgun gothic" && name !== "맑은 고딕") {
    return "Malgun Gothic";
  }
  for (const char of text) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (!HAN_RE.test(char)) continue;
    const fallback = wordEastAsianMissingGlyphFace(name, codePoint);
    if (fallback) return fallback;
  }
  return null;
}

export function wordEastAsianMissingGlyphFace(family: string, codePoint: number): string | null {
  const face = byName.get(family.trim().replace(/^["']|["']$/g, "").toLowerCase());
  if (!face) return null;
  let offset = 0;
  for (const [start, end] of blocks) {
    if (codePoint >= start && codePoint <= end) {
      const index = offset + (codePoint - start);
      const covered = (bits(face.coverage)[index >> 3] ?? 0) & (1 << (index & 7));
      return covered ? null : face.fallback;
    }
    offset += Math.ceil((end - start + 1) / 8) * 8;
  }
  return null;
}
