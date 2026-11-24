/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { ptToPx, pxToPt } from "../../lib/office-units";
import { isExcelCutFamily } from "../../lib/office-fonts/excel-cut-families";
import { isHangulEmAlias } from "../../lib/office-fonts/hangul-em";
/** Shared Office typography catalog used by docs and sheets. */

export const OFFICE_FONT_FAMILY_VALUES = [
  "system-ui, sans-serif",
  "Arial, Helvetica, sans-serif",
  "Helvetica, Arial, sans-serif",
  "Verdana, Geneva, sans-serif",
  'Georgia, "Times New Roman", serif',
  '"Times New Roman", Times, serif',
  "Garamond, Georgia, serif",
  '"Courier New", Courier, monospace',
  '"SimSun", "宋体", "Songti SC", "Noto Serif SC", serif',
  '"SimHei", "黑体", "Heiti SC", "PingFang SC", "Microsoft YaHei", sans-serif',
  '"KaiTi", "楷体", "Kaiti SC", "STKaiti", serif',
  '"FangSong", "仿宋", "FangSong_GB2312", "STFangsong", serif',
  '"Microsoft YaHei", "微软雅黑", "PingFang SC", sans-serif',
  '"PingFang SC", "Microsoft YaHei", sans-serif',
] as const;

export const OFFICE_CJK_FONT_FAMILY_VALUES = [
  '"SimSun", "宋体", "Songti SC", "Noto Serif SC", serif',
  '"SimHei", "黑体", "Heiti SC", "PingFang SC", "Microsoft YaHei", sans-serif',
  '"KaiTi", "楷体", "Kaiti SC", "STKaiti", serif',
  '"FangSong", "仿宋", "FangSong_GB2312", "STFangsong", serif',
  '"Microsoft YaHei", "微软雅黑", "PingFang SC", sans-serif',
  '"PingFang SC", "Microsoft YaHei", sans-serif',
] as const;

export const OFFICE_FONT_FAMILY_LABELS: Readonly<Record<string, string>> = {
  "system-ui, sans-serif": "系统默认",
  '"SimSun", "宋体", "Songti SC", "Noto Serif SC", serif': "宋体",
  '"SimHei", "黑体", "Heiti SC", "PingFang SC", "Microsoft YaHei", sans-serif':
    "黑体",
  '"KaiTi", "楷体", "Kaiti SC", "STKaiti", serif': "楷体",
  '"FangSong", "仿宋", "FangSong_GB2312", "STFangsong", serif': "仿宋",
  '"Microsoft YaHei", "微软雅黑", "PingFang SC", sans-serif': "微软雅黑",
  '"PingFang SC", "Microsoft YaHei", sans-serif': "苹方",
};

/** The system font stack: what a font box stores for "System default". */
export const OFFICE_SYSTEM_FONT_FAMILY_VALUE = "system-ui, sans-serif";

/**
 * {@link OFFICE_FONT_FAMILY_LABELS} for the viewer's locale: the system stack
 * is named from the `console-notebooks` catalogue (`spreadsheet.systemDefaultFont`,
 * the name the worksheet's boxes already use); the stack itself stays the value.
 */
export function officeFontFamilyLabels(
  t: (key: string) => string,
): Readonly<Record<string, string>> {
  return {
    ...OFFICE_FONT_FAMILY_LABELS,
    [OFFICE_SYSTEM_FONT_FAMILY_VALUE]: t("spreadsheet.systemDefaultFont"),
  };
}

/**
 * The legacy SYMBOL FONTS, as font NAMES (not CSS stacks).
 *
 * These are the fonts Word's Insert → Symbol dialog exists for: their glyphs are
 * not Unicode characters but pictograms addressed by position, so a character
 * picked from one is written as `<w:sym w:font w:char/>` with the code shifted
 * into the Unicode Private Use Area (see `lib/office-symbols`). They are NOT in
 * {@link OFFICE_FONT_FAMILY_VALUES} on purpose — a symbol font must never be
 * offered as body text in the Home-tab font box, because typing Latin letters in
 * it produces pictograms rather than text, and nothing in the file records what
 * the author meant. The Symbol dialog is the only surface that offers them.
 *
 * Names only: MRAI ships no bytes for these faces, so the picker shows them
 * through the same availability gate as any other font the local machine may or
 * may not have, and a missing face renders as the PUA code point's own fallback.
 */
export const OFFICE_SYMBOL_FONT_VALUES = [
  "Symbol",
  "Wingdings",
  "Wingdings 2",
  "Wingdings 3",
  "Webdings",
] as const;

/**
 * Faces whose glyphs are pictograms rather than letters (the symbol fonts
 * above plus Office's private icon faces and their open clones), so a font
 * list must set their NAME in the UI face: "Wingdings" in Wingdings is a row
 * of arrows and boxes. Office does the same in its font box.
 */
const OFFICE_SYMBOL_FONT_NAMES: ReadonlySet<string> = new Set(
  [
    ...OFFICE_SYMBOL_FONT_VALUES,
    "Marlett",
    "MT Extra",
    "Bookshelf Symbol 7",
    "MS Reference Specialty",
    "MS Outlook",
    "Wine Symbol",
    "Wine Wingdings",
    "Wine Webdings",
    "Wine Marlett",
  ].map((name) => name.toLowerCase()),
);

/** Whether a family (name or CSS stack) is a symbol face whose name must not paint in itself. */
export function isOfficeSymbolFontFamily(family: string | null | undefined): boolean {
  if (typeof family !== "string" || !family.trim()) return false;
  const primary = family.split(",")[0].trim().replace(/^["']|["']$/g, "").toLowerCase();
  return OFFICE_SYMBOL_FONT_NAMES.has(primary);
}

export const OFFICE_FONT_PREFERENCES_VERSION = 1 as const;
export const OFFICE_FONT_RECENT_LIMIT = 10;
export const OFFICE_FONT_PINNED_LIMIT = 24;

export interface OfficeFontVariant {
  id: string;
  label: string;
  family: string;
  /** Preferred menu family when a weighted face uses a distinct legacy family. */
  sourceFamily?: string;
  face: string;
  postscriptName?: string;
  bold: boolean;
  italic: boolean;
  /** Exact static face or named variable instance; Docs opts in explicitly. */
  fontFace?: import("./officeFontFace").OfficeFontFace;
}

export interface OfficeLocalFontRecord {
  family: string;
  fullName: string;
  postscriptName: string;
  style: string;
  blob?: () => Promise<Blob>;
}

export interface OfficeLegacyFontFace {
  family: string;
  style: string;
  postscriptName: string;
}

/**
 * Convert only unambiguous local-font styles into executable editor commands.
 * Weighted faces require verified OpenType legacy family/style names. Those
 * names encode a real face using the same family + bold/italic model as OOXML;
 * a numeric weight without that identity cannot round-trip and stays hidden.
 */
export function officeVerifiedFontVariant(
  font: OfficeLocalFontRecord,
  legacyFace?: OfficeLegacyFontFace | null,
): OfficeFontVariant | null {
  if (legacyFace && legacyFace.postscriptName !== font.postscriptName)
    return null;
  if (
    legacyFace &&
    legacyFace.family.trim().toLowerCase() ===
      font.family.trim().toLowerCase() &&
    legacyFace.style.toLowerCase().replace(/[\s-]+/g, "") !==
      font.style.toLowerCase().replace(/[\s-]+/g, "")
  )
    return null;
  const style = (legacyFace?.style ?? font.style)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  const flags =
    style === "regular" ||
    style === "normal" ||
    style === "roman" ||
    style === "book"
      ? { bold: false, italic: false }
      : style === "bold"
        ? { bold: true, italic: false }
        : style === "italic" || style === "oblique"
          ? { bold: false, italic: true }
          : style === "bold italic" || style === "bold oblique"
            ? { bold: true, italic: true }
            : null;
  if (!flags) return null;
  return {
    id: font.postscriptName || `${font.family}:${font.fullName}`,
    label: font.style || font.fullName,
    family: legacyFace?.family ?? font.family,
    ...(legacyFace && legacyFace.family !== font.family
      ? { sourceFamily: font.family }
      : {}),
    face: font.fullName || font.family,
    postscriptName: font.postscriptName || undefined,
    ...flags,
  };
}

/** Faces the site puts ahead of a stack for a few marks only (globals.css
 * `--font-latin-marks`, a slide marker's `MRAI Office Bullet`): never the
 * text's own face. A run without a face of its own inherits the interface
 * stack, which leads with one of them on a Latin-script page, and the Font
 * box read "MR Latin Marks". */
const MARK_ONLY_FACES = new Set(["mr latin marks", "mr latin marks off", "mrai office bullet"]);

const primaryFamilies = new Map<string, string>();

/** A sheet asks this for every cell it draws, over a handful of stacks: a
 * wheel run spent 300 ms splitting the same strings. */
export function officePrimaryFontFamily(fontStack: string): string {
  const known = primaryFamilies.get(fontStack);
  if (known !== undefined) return known;
  const families = fontStack.split(",").map((family) => family.replace(/["']/g, "").trim());
  // A Hangul clone in front of a Korean family (lib/office-fonts/hangul-em.ts) is not the face asked for either,
  // nor a sheet's cut family in front of its face (lib/office-fonts/excel-cut-families.ts).
  const primary = families.find((family) => family && !MARK_ONLY_FACES.has(family.toLowerCase()) && !isHangulEmAlias(family) && !isExcelCutFamily(family)) ?? families[0] ?? fontStack.trim();
  if (primaryFamilies.size >= 2_000) primaryFamilies.clear();
  primaryFamilies.set(fontStack, primary);
  return primary;
}

/** Office point-size ladder shared by the editable docs/sheets combobox. */
export const OFFICE_FONT_SIZE_POINTS = [
  5, 5.5, 6.5, 7.5, 8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36,
  48, 72,
] as const;

export function officePointsToPixels(points: number): number {
  const pixels = ptToPx(points);
  return pixels === Math.trunc(pixels)
    ? pixels
    : Math.round(pixels * 100) / 100;
}

export function officePixelsToPoints(pixels: number): number {
  return Math.round(pxToPt(pixels) * 2) / 2;
}
