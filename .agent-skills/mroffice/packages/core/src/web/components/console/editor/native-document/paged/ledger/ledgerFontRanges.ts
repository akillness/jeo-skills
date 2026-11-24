/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Which pages a font load lays out anew.
 *
 * A web font split into subsets (`unicode-range`) arrives a subset at a time,
 * the first time a page draws one of its characters: a new line of Chinese
 * at a page break fetches the subset its glyphs are in. Only the pages that
 * draw a glyph of the loaded ranges can have changed shape; the rest keep
 * their measurements. A face with no range restriction (or a load that does
 * not say which faces) lays out every page anew, as before.
 */

export type CodePointRange = readonly [number, number];

const FULL_RANGE_END = 0x10ffff;

/** Parse a CSS `unicode-range` descriptor into code point ranges. */
export function parseUnicodeRange(descriptor: string): CodePointRange[] | null {
  const ranges: CodePointRange[] = [];
  for (const token of descriptor.split(",")) {
    const match = /^\s*U\+([0-9A-Fa-f?]{1,6})(?:-([0-9A-Fa-f]{1,6}))?\s*$/i.exec(token);
    if (!match) return null;
    if (match[1].includes("?")) {
      const start = Number.parseInt(match[1].replace(/\?/g, "0"), 16);
      const end = Number.parseInt(match[1].replace(/\?/g, "F"), 16);
      ranges.push([start, end]);
    } else {
      const start = Number.parseInt(match[1], 16);
      const end = match[2] ? Number.parseInt(match[2], 16) : start;
      if (!(end >= start)) return null;
      ranges.push([start, end]);
    }
  }
  return ranges.length ? ranges : null;
}

/**
 * The code point ranges the loaded faces cover, or null when they cover
 * everything (a face without a `unicode-range`, or faces unknown).
 */
export function loadedFaceRanges(faces: ReadonlyArray<{ unicodeRange?: string }> | null | undefined): CodePointRange[] | null {
  if (!faces || faces.length === 0) return null;
  const all: CodePointRange[] = [];
  for (const face of faces) {
    const parsed = parseUnicodeRange(face.unicodeRange ?? "");
    if (!parsed) return null;
    if (parsed.some(([start, end]) => start <= 0 && end >= FULL_RANGE_END)) return null;
    all.push(...parsed);
  }
  return all;
}

/** Below this code point text is narrow (Latin, digits, the space, symbols):
 * its advances decide where a line with a formula breaks, and the space's
 * face is a line's strut. Above it (CJK, Hangul) a glyph is one em in any
 * face. */
const WIDE_FROM = 0x2e80;

/** Whether faces covering `ranges` can change a formula's typeset box or
 * where its line breaks: they draw narrow text (or the space). A subset of
 * wide glyphs only, the many a Chinese document fetches as its pages draw
 * them, does not. */
export function rangesDrawNarrowText(ranges: readonly CodePointRange[]): boolean {
  return ranges.some(([start]) => start < WIDE_FROM);
}

/** `ranges` sorted and merged, as parallel start / end arrays. */
interface MergedRanges {
  readonly starts: Uint32Array;
  readonly ends: Uint32Array;
}

const mergedRangesOf = new WeakMap<readonly CodePointRange[], MergedRanges>();

function mergeRanges(ranges: readonly CodePointRange[]): MergedRanges {
  const cached = mergedRangesOf.get(ranges);
  if (cached) return cached;
  const sorted = ranges.filter(([start, end]) => end >= start).sort((a, b) => a[0] - b[0]);
  const starts: number[] = [];
  const ends: number[] = [];
  for (const [start, end] of sorted) {
    const last = ends.length - 1;
    if (last >= 0 && start <= ends[last] + 1) ends[last] = Math.max(ends[last], end);
    else {
      starts.push(start);
      ends.push(end);
    }
  }
  const merged = { starts: Uint32Array.from(starts), ends: Uint32Array.from(ends) };
  mergedRangesOf.set(ranges, merged);
  return merged;
}

/**
 * Whether `text` draws a character of one of `ranges`. A CJK subset's
 * unicode-range lists hundreds of single code points, and every page of a
 * long document is checked against it when one arrives: the ranges are
 * merged once and each character found by a binary search (a ribbon tab
 * whose labels fetched a subset spent 350 ms comparing every character with
 * every range of a 120-page document).
 */
export function textDrawsCodePointIn(text: string, ranges: readonly CodePointRange[]): boolean {
  const { starts, ends } = mergeRanges(ranges);
  const count = starts.length;
  if (count === 0) return false;
  const lowest = starts[0];
  const highest = ends[count - 1];
  for (let index = 0; index < text.length; index += 1) {
    let point = text.charCodeAt(index);
    if (point >= 0xd800 && point <= 0xdbff && index + 1 < text.length) {
      const low = text.charCodeAt(index + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        point = (point - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000;
        index += 1;
      }
    }
    if (point < lowest || point > highest) continue;
    let lo = 0;
    let hi = count - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (point < starts[mid]) hi = mid - 1;
      else if (point > ends[mid]) lo = mid + 1;
      else return true;
    }
  }
  return false;
}

/** A CSS font-family stack's family names, lower-cased and unquoted. */
export function fontFamilyNames(stack: string | null | undefined): string[] {
  if (!stack) return [];
  return stack
    .split(",")
    .map((name) => name.trim().replace(/^["']|["']$/g, "").trim().toLowerCase())
    .filter((name) => name !== "");
}

/**
 * The font families the editor's pages draw with: the root's stack, every
 * inline `font-family`, every `data-font-family` run. A face of another
 * family (the application's own UI font arriving for a status line) lays
 * out no page anew.
 */




let familiesThisTask = new WeakMap<HTMLElement, Set<string>>();
let familiesClearing = false;

export function editorFontFamilies(root: HTMLElement): Set<string> {
  const kept = familiesThisTask.get(root);
  if (kept) return new Set(kept);
  const used = readEditorFontFamilies(root);
  familiesThisTask.set(root, used);
  if (!familiesClearing) {
    familiesClearing = true;
    setTimeout(() => { familiesThisTask = new WeakMap(); familiesClearing = false; }, 0);
  }
  return new Set(used);
}

function readEditorFontFamilies(root: HTMLElement): Set<string> {
  const used = new Set<string>();
  const win = root.ownerDocument.defaultView;
  for (const name of fontFamilyNames(win?.getComputedStyle(root).fontFamily)) used.add(name);
  for (const element of Array.from(root.querySelectorAll<HTMLElement>('[style*="font-family"]'))) {
    for (const name of fontFamilyNames(element.style.fontFamily)) used.add(name);
  }
  for (const element of Array.from(root.querySelectorAll<HTMLElement>("[data-font-family]"))) {
    for (const name of fontFamilyNames(element.getAttribute("data-font-family"))) used.add(name);
  }
  return used;
}

/** The loaded faces whose family the editor's pages draw with. */
export function facesUsedBy(
  faces: ReadonlyArray<{ family?: string; unicodeRange?: string }>,
  families: ReadonlySet<string>,
): Array<{ family?: string; unicodeRange?: string }> {
  return faces.filter((face) => {
    const names = fontFamilyNames(face.family ?? "");
    return names.length === 0 || names.some((name) => families.has(name));
  });
}

/**
 * Asks now for every face the document's text will draw with. A face is fetched
 * when a sheet that draws with it is first laid out, and each one that arrives
 * lays its pages out anew: where nobody reads the pages they can all come
 * first (a 318-page print: the last, for one rare character, at 70 s of 87,
 * measured its formulas and a good part of its pages again).
 */
export function loadFacesTheTextDraws(root: HTMLElement, text: string): Promise<void> {
  const fonts = root.ownerDocument.fonts;
  if (!fonts || typeof fonts.forEach !== "function") return Promise.resolve();
  const families = editorFontFamilies(root);
  const characters = Array.from(new Set(text)).join("");
  const wanted: FontFace[] = [];
  fonts.forEach((face) => {
    if (face.status !== "unloaded" || facesUsedBy([face], families).length === 0) return;
    const ranges = loadedFaceRanges([face]);
    if (!ranges || textDrawsCodePointIn(characters, ranges)) wanted.push(face);
  });
  return Promise.allSettled(wanted.map((face) => face.load())).then(() => undefined);
}












const probeFaces = new WeakSet<FontFace>();

/** The faces of these families not asked for yet: those a reading about to
 * start will have started (see {@link markProbeStartedFaces}). */
export function unloadedFacesOf(fonts: FontFaceSet, families: readonly string[]): FontFace[] {
  const wanted = new Set(families.flatMap((family) => fontFamilyNames(family)));
  const out: FontFace[] = [];
  if (!wanted.size || typeof fonts.forEach !== "function") return out;
  fonts.forEach((face) => {
    if (face.status === "unloaded" && fontFamilyNames(face.family).some((name) => wanted.has(name))) out.push(face);
  });
  return out;
}

/** Of `faces` (unloaded a moment ago), those now asked for were the reading's. */
export function markProbeStartedFaces(faces: readonly FontFace[]): void {
  for (const face of faces) if (face.status !== "unloaded") probeFaces.add(face);
}

/** Every face of this arrival was started by a fonts reading, not a page. */
export function facesStartedByProbe(faces: ReadonlyArray<object> | null | undefined): boolean {
  return Boolean(faces && faces.length > 0 && faces.every((face) => probeFaces.has(face as FontFace)));
}
