/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { wordDocumentEastAsianSingleLineFactor } from "../../../../lib/document-word-line-metrics";
import substitutionTable from "../../../../lib/office-fonts/substitutes.generated.json";
import wordLatinFamilies from "../../../../lib/office-fonts/word-latin-families.generated.json";
import wordLineRatios from "../../../../lib/office-fonts/word-line-ratios.generated.json";
import table from "./wordFontMetrics.json";
import { wordWindowsLineEm, wordWindowsLineRatio, wordWindowsLinesOff } from "../../../../lib/office-fonts/word-windows-lines";

/**
 * Design metrics of the fonts Word lays text out with, read from the font
 * files themselves rather than from whichever face the browser substitutes.
 *
 * The browser often has no such font to measure: Aptos Mono is an Office
 * cloud face, and system faces are not loaded font faces a page can inspect.
 * A metric-compatible substitute paints the same advances but has its own
 * ascent and descent. Widths and line boxes Word derives from its font are
 * nevertheless facts of that font.
 */

interface RecordedFont {
  names: readonly string[];
  /** sha256 of the very file these metrics were read from. */
  sha256: string;
  unitsPerEm: number;
  /** hhea ascender, descender (negative) and line gap, in font units. */
  ascender: number;
  descender: number;
  lineGap: number;
  /** The face declares an East Asian code page (OS/2 ulCodePageRange1). */
  eastAsian?: boolean;
  advances: Readonly<Record<string, number>>;
}

const byName = new Map<string, RecordedFont>();
const bySha = new Map<string, RecordedFont>();
for (const font of table.fonts as readonly RecordedFont[]) {
  for (const name of font.names) byName.set(name.toLowerCase(), font);
  bySha.set(font.sha256.toLowerCase(), font);
}

/** A page paints a bound face under the family name its file hashes to
 * (`MRAI-Font-<sha256>…`, one hash per role file), so the declared name is
 * gone from the computed stack. The recorded file is the very file being
 * painted when one of those hashes is its own. */
/**
 * The recorded Office face a metric-compatible open face stands in for.
 * Word, lacking an open face a document names, sets it in the Office face
 * with the same metrics: R36-D29's Carlito 11pt footer comes out of Word in
 * Calibri, 13.4pt a line, where reading the CJK fallback at the end of the
 * render stack gave 15.9pt and lifted the body a line too high. A face is
 * followed through its own exact substitute (Liberation Serif -> Tinos ->
 * Times New Roman); the recorded Office face named most often wins
 * (Cousine -> Courier New).
 */
const exactOfficeFor = new Map<string, RecordedFont | null>();
function recordedThroughExactSubstitute(name: string): RecordedFont | undefined {
  const key = name.toLowerCase();
  const known = exactOfficeFor.get(key);
  if (known !== undefined) return known ?? undefined;
  const entries = Object.values(substitutionTable as Record<string, { office: string; substitutes: readonly string[]; metric: string; weight?: number }>);
  const exact = entries.filter((entry) => (entry.metric === "exact" || entry.metric === "cloned") && entry.weight === undefined);
  const faces = new Set([key]);
  for (const entry of exact) {
    if (entry.office.toLowerCase() === key) for (const substitute of entry.substitutes) faces.add(substitute.toLowerCase());
  }
  const votes = new Map<RecordedFont, number>();
  for (const entry of exact) {
    if (!entry.substitutes.some((substitute) => faces.has(substitute.toLowerCase()))) continue;
    const font = byName.get(entry.office.toLowerCase());
    if (font) votes.set(font, (votes.get(font) ?? 0) + 1);
  }
  let best: RecordedFont | null = null;
  let bestVotes = 0;
  for (const [font, count] of votes) {
    if (count > bestVotes) {
      best = font;
      bestVotes = count;
    }
  }
  exactOfficeFor.set(key, best);
  return best ?? undefined;
}

const recorded = (family: string) => {
  const name = family.trim().replace(/^["']|["']$/g, "");
  const direct = byName.get(name.toLowerCase());
  if (direct) return direct;
  const alias = /^MRAI-Font-((?:[0-9a-f]{64})(?:-[0-9a-f]{64})*)$/i.exec(name);
  if (!alias) return recordedThroughExactSubstitute(name);
  for (const sha of alias[1].toLowerCase().split("-")) {
    const font = bySha.get(sha);
    if (font) return font;
  }
  return undefined;
};

/**
 * Whether Word takes this face as an East Asian font: a property of the font
 * file (its OS/2 code page range), which Word reads from the face itself
 * when the document's font table does not list it.
 */
export function wordFontIsEastAsian(family: string): boolean {
  return recorded(family)?.eastAsian === true;
}

/**
 * Whether this family names a recorded font file that declares no East Asian
 * code page. Word reads that from the installed face itself: Calibri named in
 * a document's `w:eastAsia` slot with no signed font-table entry still runs
 * its Latin single line (word-stops-floats2.docx: 13.4pt at 11pt, not 1.3x).
 */
export function wordFontIsRecordedLatin(family: string): boolean {
  const font = recorded(family);
  if (font !== undefined) return font.eastAsian !== true;
  // Word's other Latin faces, read from its own files (word-vertical-metrics,
  // scripts/measure-word-vertical-metrics.py): Franklin Gothic Book in the
  // `w:eastAsia` slot runs its Latin line, 12.47pt at 11pt, not 1.3x that
  // (corpus R83-D07, word-stops-font-heights).
  const key = family.trim().replace(/^["']|["']$/g, "").trim().toLowerCase();
  return WORD_LATIN_FAMILIES.has(key) || (WORD_CLOUD_LATIN_FAMILIES.has(key) && !wordCloudLatinOff());
}

const WORD_LATIN_FAMILIES: ReadonlySet<string> = new Set(
  (wordLatinFamilies as readonly string[]).map((name) => name.toLowerCase()),
);









const WORD_CLOUD_LATIN_FAMILIES: ReadonlySet<string> = new Set([
  "abril fatface", "amatic sc", "anton", "assistant", "barlow condensed", "dm sans", "dm serif display", "didact gothic",
  "eb garamond", "fira sans", "fira sans extra condensed", "frank ruhl libre", "heebo", "hind", "hind light", "hind medium",
  "hind semibold", "ibm plex sans", "inconsolata", "josefin sans", "karla", "lato", "libre baskerville", "libre franklin",
  "lobster", "lora", "merriweather", "miriam libre", "montserrat", "montserrat extrabold", "montserrat light",
  "montserrat medium", "montserrat semibold", "noto serif", "nunito", "nunito sans", "open sans", "open sans extrabold",
  "open sans light", "open sans semibold", "oswald", "oxygen", "pt mono", "pt sans", "pt serif", "pacifico",
  "patrick hand", "playfair display", "poiret one", "poppins", "quattrocento sans", "raleway", "roboto condensed",
  "roboto slab", "source code pro", "source sans pro black", "source sans pro light", "source sans pro semibold",
  "titillium web", "titillium web black", "titillium web light", "titillium web semibold", "ubuntu", "ubuntu light",
  "ubuntu medium", "ubuntu mono", "varela round", "work sans", "work sans light", "work sans semibold", "yesteryear",
]);
/** `window.__docsCloudLatinOff = true` asks the older reading, for an A/B of one build. */
function wordCloudLatinOff(): boolean {
  return typeof window !== "undefined" && (window as Window & {__docsCloudLatinOff?: boolean}).__docsCloudLatinOff === true;
}

/** Recorded East Asian families Word installs as one regular face. */
const REGULAR_ONLY_FAMILIES = new Set(["simsun", "simhei", "kaiti", "fangsong", "ms mincho", "ms pmincho", "ms gothic", "ms ui gothic", "ms pgothic"]);

/**
 * Whether Word has only the regular face of this recorded family (SimSun,
 * SimHei, KaiTi, FangSong, the MS Mincho and Gothic faces). Word sets a bold
 * or italic run in that face and emboldens or slants it, so the run keeps
 * the regular face's metrics.
 */
export function wordFontShipsRegularOnly(family: string): boolean {
  const font = recorded(family);
  return font !== undefined && font.names.some((name) => REGULAR_ONLY_FAMILIES.has(name.toLowerCase()));
}

/** Every family name of a recorded East Asian face, lower-cased. */
export const WORD_EAST_ASIAN_RECORDED_FAMILIES: ReadonlySet<string> = new Set(
  (table.fonts as readonly RecordedFont[])
    .filter((font) => font.eastAsian === true)
    .flatMap((font) => font.names.map((name) => name.toLowerCase())),
);

/** Whether this computed family is a face the page bound from a recorded
 * Word font file, which the page paints and Word measured. */
export function wordFontFileIsRecorded(family: string): boolean {
  return /^MRAI-Font-/i.test(family.trim().replace(/^["']|["']$/g, "")) && recorded(family) !== undefined;
}

/**
 * The width Word gives a decimal numbering label, in CSS px, or null when the
 * font or a glyph is not recorded.
 *
 * Word ends the label, then its tab suffix advances to the next usable tab
 * stop; a label wider than the hanging indent pushes the first line of text
 * to the next default stop ("27." in 9pt Aptos ends past a 9pt hang, so the
 * text starts 36pt from the margin instead of 16.45pt).
 */
export function wordNumberingLabelAdvancePx(
  family: string,
  label: string,
  fontSizePx: number,
): number | null {
  const font = recorded(family);
  if (!font || !(fontSizePx > 0) || !label) return null;
  let units = 0;
  for (const character of label) {
    const advance = font.advances[character];
    if (typeof advance !== "number") return null;
    units += advance;
  }
  return (units * fontSizePx) / font.unitsPerEm;
}

/**
 * The regular face's line metrics per em, or null when the font is not
 * recorded. `box` is ascender minus descender; `lineGap` is kept apart
 * because Word's East Asian single line excludes it.
 */
export function wordFontLineMetrics(
  family: string,
): { box: number; lineGap: number } | null {
  const font = recorded(family);
  if (!font) return null;
  return {
    box: (font.ascender - font.descender) / font.unitsPerEm,
    lineGap: font.lineGap / font.unitsPerEm,
  };
}

/**
 * Windows Word's line of a Latin face, per em, where its Windows file differs
 * from the recorded Mac one (word-windows-lines.ts): `family` by its own name,
 * or by the recorded face's when the page binds that file under its hash.
 * [box, line gap, 0, ascender]; undefined where the recorded box stands.
 */
function windowsRatio(family: string): readonly number[] | undefined {
  const name = family.trim().replace(/^["']|["']$/g, "");
  return wordWindowsLineRatio(name) ?? (recorded(name) ? wordWindowsLineRatio(recorded(name)!.names[0]!) : undefined);
}

/**
 * Windows Word's single line of a Latin `family` at this weight and slant,
 * per em, where its Windows file differs from the Mac one the stand-in's
 * overrides state (Book Antiqua 1.2427 em upright, its bold 1.2056 as on the
 * Mac); undefined otherwise. A face the page binds under its file's hash
 * answers for the recorded face it is.
 */
export function wordDocumentWindowsLineEm(family: string, weight: number, italic: boolean): number | undefined {
  const name = family.trim().replace(/^["']|["']$/g, "");
  const font = recorded(name);
  if (font?.eastAsian === true) return undefined;
  return wordWindowsLineEm(name, weight, italic) ?? (font ? wordWindowsLineEm(font.names[0]!, weight, italic) : undefined);
}

/**
 * The regular face's line metrics per em as Windows Word sets a Docs line:
 * `wordFontLineMetrics`, with Windows' box where its file differs (Book
 * Antiqua 1.2427 em, its Mac hhea box 1.2056). The Docs editor's own; other
 * editors keep the recorded box.
 */
export function wordDocumentFontLineMetrics(family: string): { box: number; lineGap: number } | null {
  const metrics = wordFontLineMetrics(family);
  if (!metrics || recorded(family)?.eastAsian === true) return metrics;
  const windows = windowsRatio(family);
  return windows ? { box: windows[0]!, lineGap: windows[1]! } : metrics;
}

/** `window.__docsClonedOwnLinesOff = true` (A/B): a face with its own metric
 * clone answers with the line of the recorded face it shares a fallback with,
 * the older reading. */
function clonedOwnLinesOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsClonedOwnLinesOff?: boolean }).__docsClonedOwnLinesOff === true;
}

/**
 * Whether `family` is a face the page serves through its own metric clone
 * carrying Word's line (`metric: "cloned"`, `wordLines`) and no recorded file
 * of its own: its line is its own, never that of another recorded face the
 * substitute vote reaches through a fallback they share. Palatino Linotype
 * and Book Antiqua share only TeX Gyre Pagella, and the vote made Palatino
 * Linotype's 10 pt line Book Antiqua's Windows 12.43 pt where Windows Word
 * sets 13.49 (corpus R404-D02's affiliations, probes/vsp8 g*: 13.5 pt apart);
 * so it made Aptos Display Calibri, Gill Sans MT Candara, Lucida Sans
 * Unicode Verdana. The Docs editor's own; other editors keep the vote.
 */
function hasOwnClonedLine(family: string): boolean {
  if (clonedOwnLinesOff()) return false;
  const name = family.trim().replace(/^["']|["']$/g, "").toLowerCase();
  if (byName.has(name)) return false;
  // A face Windows does not ship (`unlisted`: Helvetica Neue, Lucida Grande)
  // is set by Word in a fallback face: not its own line either way.
  const entry = (substitutionTable as Record<string, { office?: string; metric?: string; wordLines?: boolean; weight?: number; unlisted?: boolean }>)[name];
  return entry?.metric === "cloned" && entry.wordLines === true && entry.weight === undefined &&
    entry.unlisted !== true && entry.office?.toLowerCase() === name;
}

/** `wordDocumentFontLineMetrics`, but a face with its own cloned line
 * (`hasOwnClonedLine`) answers null: the page reads its line from the clone. */
export function wordDocumentOwnFontLineMetrics(family: string): { box: number; lineGap: number } | null {
  return hasOwnClonedLine(family) ? null : wordDocumentFontLineMetrics(family);
}

/** `wordDocumentWindowsLineEm` by the face's own name only when it has its
 * own cloned line (`hasOwnClonedLine`). */
export function wordDocumentOwnWindowsLineEm(family: string, weight: number, italic: boolean): number | undefined {
  if (!hasOwnClonedLine(family)) return wordDocumentWindowsLineEm(family, weight, italic);
  return wordWindowsLineEm(family.trim().replace(/^["']|["']$/g, ""), weight, italic);
}

/** `wordGridFontLineMetrics` for the Docs editor: a face with its own cloned
 * line (`hasOwnClonedLine`) takes the ratio read from Word's file of it. */
export function wordDocumentGridFontLineMetrics(family: string): { box: number; lineGap: number } | null {
  if (!hasOwnClonedLine(family)) return wordGridFontLineMetrics(family);
  const name = family.trim().replace(/^["']|["']$/g, "").toLowerCase();
  const ratio = wordWindowsLineRatio(name) ?? (wordLineRatios as Readonly<Record<string, readonly number[]>>)[name];
  return ratio ? { box: ratio[0], lineGap: ratio[1] } : wordGridFontLineMetrics(family);
}










export function wordGridFontLineMetrics(family: string): { box: number; lineGap: number } | null {
  const own = wordFileLineMetrics(family);
  if (own) return own;
  // An alias of an Office family ("Times" for Times New Roman) is that family.
  const name = family.trim().replace(/^["']|["']$/g, "").toLowerCase();
  const office = (substitutionTable as Record<string, { office?: string }>)[name]?.office;
  return office && office.toLowerCase() !== name ? wordFileLineMetrics(office) : null;
}

/**
 * The single line of `family` as Word's own file sets it: a recorded font's,
 * else the ratio read from Word's file (`word-line-ratios.generated.json`),
 * or null when Word's file was never read.
 */
export function wordFileLineMetrics(family: string): { box: number; lineGap: number } | null {
  const recordedMetrics = wordDocumentFontLineMetrics(family);
  if (recordedMetrics) return recordedMetrics;
  const name = family.trim().replace(/^["']|["']$/g, "").toLowerCase();
  const ratio = windowsRatio(name) ?? (wordLineRatios as Readonly<Record<string, readonly number[]>>)[name] ??
    (windowsLinesOff() ? undefined : WORD_WINDOWS_LINE_RATIOS[name]);
  return ratio ? { box: ratio[0], lineGap: ratio[1] } : null;
}

/**
 * Lines of faces only Windows ships (no file of them on the measuring Mac,
 * so word-line-ratios has none), as Windows Word sets them: box, line gap,
 * East Asian, ascender, per em. Segoe Print, single spacing, 12 pt and 20 pt:
 * lines 21.18 pt and 35.33 pt apart, the baseline 1.31 em below the line's
 * top (docx-look/probes/altname segp, truth.sh). Its stand-in Patrick Hand
 * stood 1.32 em, and corpus R353-D20's equations Word sets in it (KaTeX_Math,
 * altName Segoe Print) 16.2 pt a line for Word's 18.7.
 */
const WORD_WINDOWS_LINE_RATIOS: Readonly<Record<string, readonly number[]>> = {
  "segoe print": [1.7655, 0, 0, 1.31],
};

/** `window.__docsWindowsLinesOff = true`: a Windows-only face's line is its
 * stand-in's, as before (an A/B of one build). */
function windowsLinesOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsWindowsLinesOff?: boolean }).__docsWindowsLinesOff === true;
}













/**
 * How far below the baseline Word extends a line for a run set in this face,
 * per em, or null when the font is not recorded: the descender, plus half of
 * an East Asian face's extra 0.3 box. A Latin face's line gap is all above.
 */
export function wordFontLineDescent(family: string, eastAsian: boolean): number | null {
  const font = recorded(family);
  if (!font) return null;
  const descent = -font.descender / font.unitsPerEm;
  if (!eastAsian) return descent;
  const box = (font.ascender - font.descender) / font.unitsPerEm;
  return descent + (box * (wordDocumentEastAsianSingleLineFactor(family) - 1)) / 2;
}









const gridVerticals = new Map<string, { ascent: number; descent: number } | null>();
export function wordGridFontVerticals(family: string): { ascent: number; descent: number } | null {
  const name = family.trim().replace(/^["']|["']$/g, "");
  const key = name.toLowerCase();
  // The switch decides the answer: it is part of the cache key.
  const cacheKey = `${wordWindowsLinesOff() ? "mac" : "win"}|${key}`;
  const known = gridVerticals.get(cacheKey);
  if (known !== undefined) return known;
  const office = (substitutionTable as Record<string, { office?: string }>)[name]?.office;
  const face = recorded(name) ? name : office && recorded(office) ? office : null;
  let verticals: { ascent: number; descent: number } | null = null;
  const windows = face && wordFontIsEastAsian(face) ? undefined : windowsRatio(name) ?? (office ? windowsRatio(office) : undefined);
  if (windows) {
    // Windows Word's line where its file differs: the gap above the ascent.
    const [box, lineGap, , ascender] = windows as readonly [number, number, number, number];
    verticals = { ascent: ascender + lineGap, descent: box - ascender };
  } else if (face) {
    const eastAsian = wordFontIsEastAsian(face);
    const ascent = wordFontLineAscent(face, eastAsian);
    const descent = wordFontLineDescent(face, eastAsian);
    if (ascent !== null && descent !== null) verticals = { ascent, descent };
  } else {
    // Word's own file (word-line-ratios: box, line gap, East Asian, ascender).
    const ratios = wordLineRatios as Readonly<Record<string, readonly number[]>>;
    const ratio = ratios[key] ?? (office ? ratios[office.toLowerCase()] : undefined) ??
      (windowsLinesOff() ? undefined : WORD_WINDOWS_LINE_RATIOS[key] ?? (office ? WORD_WINDOWS_LINE_RATIOS[office.toLowerCase()] : undefined));
    if (ratio && ratio.length >= 4) {
      const [box, lineGap, eastAsianFlag, ascender] = ratio;
      if (eastAsianFlag === 1) {
        // The factor of the face whose box this is: a name with a box of its
        // own (华文新魏) is not its stand-in's Office name (STXingkai).
        const owner = ratios[key] ? name : office ?? name;
        const half = (box * (wordDocumentEastAsianSingleLineFactor(owner) - 1)) / 2;
        verticals = { ascent: ascender + half, descent: box - ascender + half };
      } else {
        verticals = { ascent: ascender + lineGap, descent: box - ascender };
      }
    }
  }
  gridVerticals.set(cacheKey, verticals);
  return verticals;
}

export function wordFontLineAscent(family: string, eastAsian: boolean): number | null {
  const font = recorded(family);
  if (!font) return null;
  const ascent = font.ascender / font.unitsPerEm;
  if (!eastAsian) {
    // Windows Word's ascent where its file differs (word-windows-lines.ts).
    const windows = font.eastAsian === true ? undefined : windowsRatio(family);
    return windows ? windows[3]! + windows[1]! : ascent + font.lineGap / font.unitsPerEm;
  }
  const box = (font.ascender - font.descender) / font.unitsPerEm;
  return ascent + (box * (wordDocumentEastAsianSingleLineFactor(family) - 1)) / 2;
}
