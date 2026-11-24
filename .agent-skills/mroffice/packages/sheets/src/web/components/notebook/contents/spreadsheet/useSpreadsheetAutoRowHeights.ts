"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { stackPrimaryFamily } from "@mrnote/core/web/lib/office-fonts/hangul-em.ts";
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { contentKey } from "@mrnote/core/web/lib/content-hash.ts";
import { clampRowHeight, MAX_NATIVE_ROW_HEIGHT_PX, officeCombinedRowHeight, officeCombinedRowParts, officeFloorRowHeight, officeRowHeight, officeStandingRowHeight, officeRowMetricsKnown, officeStackedLinesHeight, stackedTextLetterSpacing, type OfficeRowFont } from "@mrnote/core/web/lib/spreadsheet/grid-sizing.ts";
import { SPREADSHEET_WRAP_LINE_HEIGHT } from "@mrnote/core/web/lib/spreadsheet/cell-format.ts";
import { layoutNativeText, measureNativeTextHeightBatch, measureNativeAutoRowHeight, measureNativeParagraphLineHeight, measureNativeTextHeight, type NativeTextLayoutRequest, type NativeTextLine, type NativeTextPart } from "../../../../lib/spreadsheet/native-text-layout";
import { clampNativeAutomaticRowHeight, nativeTextAdvances, resolveSpreadsheetTextStyle } from "@mrnote/core/web/lib/spreadsheet/native-typography.ts";
import { useSpreadsheetTextEngineEpoch } from "./useSpreadsheetTextEngineEpoch";
import { fontLoadReach } from "@mrnote/core/web/lib/spreadsheet/font-load-reach.ts";
import { OFFICE_COMPLEX_WRAP_TEXT, officeDigitPx, officeHintedWrapLines, officeHintedWrapRoom, officeHintedWrapRunLines } from "@mrnote/core/web/lib/spreadsheet/office-hinted-wrap.ts";

export interface AutoRowMeasurement {
  row: number;
  width: number;
  text: string;
  style: CSSProperties;
  dpi?: number;
  paddingX?: number;
  nativeParagraph?: boolean;
  baseHeightOnly?: boolean;
  /** A literal that does not wrap: measured as one line of its font, however
   * long it is (Excel grows the row for a large font, never for the width). */
  singleLine?: boolean;
  /** Counter-clockwise text rotation in degrees: the row fits the rotated
   *  single line (|sin|·text width + |cos|·line height), as Excel's does. */
  rotation?: number;
  /** Vertical Text (stacked upright letters): the row fits the column of
   *  letters, as Excel's does. */
  stacked?: boolean;
  /** Base-height calibration: the browser's line box for the workbook's default
   * font divided into the row height the workbook stores for it, so a cell in
   * that font measures exactly the stored default and a larger font scales
   * from it (Excel's own row height, not the browser's line box). */
  scale?: number;
  numericValue?: boolean;
  parts?: NativeTextPart[];
  /** The faces of the row's positions with no cell (its format's, else the
   * columns' and the workbook's): an imported Windows grid's row fits them
   * with its cells' faces (officeCombinedRowHeight). */
  rowFonts?: { family: string; sizePt: number; bold?: boolean; record?: OfficeRowFont["record"]; standing?: boolean }[];
  /** False for a cell aligned top, center, justify or distributed: its lines
   * do not stand on the row's baseline (officeStackedLinesHeight). */
  baseline?: false;
  /** The workbook's Normal font's widest digit, px: the steps of Windows
   * Excel's wrap room (officeHintedWrapRoom, lookwin p116b-lw). */
  normalDigitPx?: number;
  /** Excel wraps this cell after a wrapped complex-script cell of the load:
   * a line broken at a space keeps room for one (officeSpacedWraps). */
  spaced?: true;
}

/**
 * What one cell's text asks of its row, by everything the measurement reads
 * (the text, its font and runs, the width, the calibration), not by the row
 * it sits in. An edit changes one cell; without this, every wrapped or
 * tall-font cell of the sheet was laid out again in the probe after each
 * entry, a forced layout per cell (1.7 s per Enter on a 2,300-cell sheet).
 * Dropped when a web font finishes loading, which changes what text measures.
 */
const measuredHeights = new Map<string, { height: number; families: readonly string[]; text: string }>();
const MEASURED_HEIGHTS_LIMIT = 50_000;

function cssFamilies(value: unknown, into: Set<string>): void {
  if (typeof value !== "string") return;
  for (const part of value.split(",")) {
    const family = part.trim().replace(/^["']|["']$/g, "").trim().toLowerCase();
    if (family) into.add(family);
  }
}

/** Every family a cell's text may be drawn in, in stack order: the one the
 * grid resolves it to (its face, the stand-ins, the fallbacks), its own, its
 * runs'. */
function itemFamilies(item: AutoRowMeasurement): string[] {
  const out = new Set<string>();
  cssFamilies(resolveSpreadsheetTextStyle(item.style, item.text, item.dpi).fontFamily, out);
  cssFamilies(item.style.fontFamily, out);
  for (const part of item.parts ?? []) cssFamilies((part.style as CSSProperties | undefined)?.fontFamily, out);
  return [...out];
}

/** All the text a cell's measurement draws. */
function itemText(item: AutoRowMeasurement): string {
  return item.parts?.length ? item.parts.map((part) => part.text).join("") : item.text;
}

if (typeof document !== "undefined") {
  // A face that finished changes what the text drawn in it measures: those
  // heights go. Dropping every height on every face kept a sheet whose
  // workbook registers thousands of faces, some loading at any moment,
  
  // first sheet, a million forced layouts in one screenshot).
  document.fonts?.addEventListener("loadingdone", (event) => {
    const reach = fontLoadReach(event);
    if (!reach) return;
    for (const [key, entry] of measuredHeights) if (reach.touches(entry.families, entry.text)) measuredHeights.delete(key);
  });
}

/** View-only measurements: never write browser/font-dependent heights to a workbook. */
/** The content key of `measurements`, its parsed copy in `into` when the key
 * changed (a stable identity for equal measurements). */
function readMeasurements(
  measurements: readonly AutoRowMeasurement[],
  into: { current: { key: string; list: AutoRowMeasurement[] } | null },
): string {
  const text = JSON.stringify(measurements);
  const measurementKey = contentKey(text);
  if (into.current?.key !== measurementKey) {
    into.current = { key: measurementKey, list: JSON.parse(text) as AutoRowMeasurement[] };
  }
  return measurementKey;
}

function autoRowParts(item: AutoRowMeasurement): NativeTextPart[] {
  // A trailing line break is a last, empty line. The browser lays out
  // no box for it, so the measured text carries a space on that line,
  // as the painted cell does.
  const measuredText = item.text.endsWith("\n") ? `${item.text}\u00a0` : item.text;
  return item.parts
    ? item.parts.map((part, index, all) =>
        index === all.length - 1 && part.text.endsWith("\n") ? { ...part, text: `${part.text}\u00a0` } : part)
    : [{ text: measuredText }];
}

/** The first family of a CSS font stack, unquoted: the face the cell names. */
function leadFamily(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  // The face, not a sheet's cut family in front of it (excel-cut-families.ts).
  const first = stackPrimaryFamily(value);
  return first || undefined;
}

/**
 * Excel's automatic height, in 96-dpi pixels, of one line of `item`: the
 * tallest {@link officeRowHeight} of the faces its text is set in (the cell's
 * and its runs'), as Windows Excel fits a row to a line -- not the browser's
 * line box for the face standing in for it plus a margin, which was 2 px
 * over for Calibri, Carlito and Aptos Narrow 11 (22 px against Excel's 20)
 * and 7 px for a 細明體 line (27 px: R14-X16's rows 18-26 grew past the
 * 17.25 pt Excel keeps them at). Undefined when a face is one the table does
 * not know, or a size is unknown: the probe's answer stands.
 */
function officeLineHeight(item: AutoRowMeasurement): number | undefined {
  return officeLineFaces(item)?.height;
}

/** Whether a CSS font weight is Excel's bold. */
function boldWeight(weight: unknown): boolean {
  return weight === "bold" || weight === "bolder" || (typeof weight === "number" ? weight >= 600 : Number(weight) >= 600);
}

/** The custom properties a measurement marks a Superscript / Subscript cell
 * or run with (the painted CSS shrinks a run's size; Excel's row grows for
 * the face at its own size, officeScriptExtra). */
export const OFFICE_SCRIPT_MARK = "--mrai-office-script";
export const OFFICE_SCRIPT_SIZE_MARK = "--mrai-office-size";

/** The marks a measurement carries for a Superscript / Subscript cell or run:
 * its script, and a run's own size (px) where its painted CSS is shrunk. */
export function officeScriptMarks(style: { readonly superscript?: boolean; readonly subscript?: boolean } | undefined, sizePx?: unknown): CSSProperties {
  const script = style?.superscript === true ? "super" : style?.subscript === true ? "sub" : undefined;
  if (!script) return {};
  return { [OFFICE_SCRIPT_MARK]: script, ...(typeof sizePx === "number" && sizePx > 0 ? { [OFFICE_SCRIPT_SIZE_MARK]: sizePx } : {}) } as CSSProperties;
}

/** Whether a measurement holds a Superscript / Subscript cell or run. */
function scriptMarked(item: AutoRowMeasurement): boolean {
  const marked = (style: unknown) => Boolean(style && (style as Record<string, unknown>)[OFFICE_SCRIPT_MARK]);
  return marked(item.style) || (item.parts ?? []).some((part) => marked(part.style));
}

/** The face one line of a cell styled `style` stands its row in, where the
 * row tables know it (Windows Excel's own measure); undefined for a face they
 * lack. */
export function officeKnownStyleFace(style: CSSProperties): OfficeRowFont | undefined {
  const face = officeStyleFace(style, style);
  if (!face || !officeRowMetricsKnown(face.family, face.sizePt)) return undefined;
  return { family: face.family, sizePt: face.sizePt, bold: face.bold, ...(face.script ? { script: face.script } : {}) };
}

/** The face a style draws its text in, as Excel's rows and wraps read it: a
 * scripted run at its own size, with its script. */
function officeStyleFace(style: CSSProperties, base: CSSProperties): (OfficeRowFont & { family: string; sizePt: number; italic: boolean }) | undefined {
  const marks = style as Record<string, unknown>;
  const script = marks[OFFICE_SCRIPT_MARK] === "super" || marks[OFFICE_SCRIPT_MARK] === "sub" ? marks[OFFICE_SCRIPT_MARK] as "super" | "sub" : undefined;
  const family = leadFamily(style.fontFamily);
  const marked = marks[OFFICE_SCRIPT_SIZE_MARK];
  const size = typeof marked === "number" ? marked
    : typeof style.fontSize === "number" ? style.fontSize
    : script && typeof base.fontSize === "number" ? base.fontSize : Number.NaN;
  if (!family || !(size > 0)) return undefined;
  return { family, sizePt: size * 0.75, bold: boldWeight(style.fontWeight), italic: style.fontStyle === "italic", ...(script ? { script } : {}) };
}

function officeLineFaces(item: AutoRowMeasurement): { height: number; fonts: OfficeRowFont[] } | undefined {
  let height = 0;
  const fonts: OfficeRowFont[] = [];
  for (const style of [item.style, ...(item.parts ?? []).map((part) => ({ ...item.style, ...(part.style as CSSProperties | undefined) }))]) {
    const face = officeStyleFace(style, item.style);
    if (!face || !officeRowMetricsKnown(face.family, face.sizePt)) return undefined;
    const font = { family: face.family, sizePt: face.sizePt, bold: face.bold, ...(face.script ? { script: face.script } : {}) };
    fonts.push(font);
    height = Math.max(height, officeRowHeight(font));
  }
  return height ? { height, fonts } : undefined;
}

/**
 * `lines` lines of `item` as Windows Excel stands them: its lines, each its
 * own line's height, and never less than one line set with the faces of the
 * row's empty positions too (officeCombinedRowHeight: one Arial 12 line in a
 * Calibri 11 workbook is 21 px). The other faces do not add to a wrapped
 * paragraph's first line: two lines of Calibri 10 in a Calibri 11 workbook
 * with no column formats are 34 px, 2 x 17 (R75-X01, 56 rows), not 20 + 17.
 * Without the row's faces, or with a face the metrics do not know, the lines
 * alone. Laid-out lines (`laid`) each stand at the faces of their own text.
 */
function officeLinesHeight(item: AutoRowMeasurement, office: number, lines: number, laid?: readonly NativeTextLine[]): number {
  const faces = officeLineFaces(item);
  if (lines <= 1 && !laid?.length) {
    // One line: its faces set with the row's other faces (a top-aligned line
    // too stands no lower than the row's own line, officeStackedLinesHeight).
    if (item.baseline === false) {
      const floor = item.rowFonts?.length ? officeFloorRowHeight(item.rowFonts) : undefined;
      return Math.max(office, floor ?? 0);
    }
    // Only the bottom-aligned positions share its baseline; a top or centred
    // one stands at its own line (officeFloorRowHeight, lookwin p168-lw).
    const bottom = item.rowFonts?.filter((font) => !font.standing) ?? [];
    const combined = faces ? officeCombinedRowHeight(bottom.length ? [...faces.fonts, ...bottom] : faces.fonts) : undefined;
    const standing = item.rowFonts?.length ? officeStandingRowHeight(item.rowFonts) : 0;
    return Math.max(office, combined ?? 0, standing ?? 0);
  }
  let own = lines * office;
  let last = faces ? officeCombinedRowParts(faces.fonts) : undefined;
  if (laid?.length) {
    let sum = 0;
    const fonts = officeLaidLinesFonts(item, laid);
    for (const lineFonts of fonts) {
      const height = lineFonts ? officeCombinedRowHeight(lineFonts) : undefined;
      if (height === undefined) { sum = 0; break; }
      sum += height;
    }
    const lastFonts = fonts[fonts.length - 1];
    if (sum > 0) {
      own = sum;
      last = (lastFonts ? officeCombinedRowParts(lastFonts) : undefined) ?? last;
    }
  }
  const bottom = item.rowFonts?.filter((font) => !font.standing) ?? [];
  const floor = bottom.length ? officeCombinedRowParts(bottom) : undefined;
  const standing = item.rowFonts?.length ? officeStandingRowHeight(item.rowFonts) ?? 0 : 0;
  if (!last) return Math.max(own, floor ? floor.ascent + floor.descent + 1 : 0, standing);
  return Math.max(officeStackedLinesHeight(own, last, floor, item.baseline !== false), standing);
}

/**
 * The faces each laid-out line stands at in Windows Excel: the faces of the
 * text on it set together (officeCombinedRowHeight), with the face of the
 * typed break that ends it; an empty line at its own break's face, and an
 * empty last line, which has no break, at the faces of the line before it
 * (lookwin p83-lw: 11 pt "aaaa" and an 18 pt break stand an 18 pt line; an
 * 18 pt line, an 11 pt break and nothing after stand a second 18 pt line).
 * A rich cell's "男\n" in 新細明體 12 over "Male" in Arial 12 is 22 + 20 px
 * (R315-X12, 52 rows), not twice its tallest face. The server's
 * office_rows.office_line_faces is the same rule. Undefined for a line in a
 * face the metrics do not know.
 */
function officeLaidLinesFonts(item: AutoRowMeasurement, laid: readonly NativeTextLine[]): (OfficeRowFont[] | undefined)[] {
  const out: (OfficeRowFont[] | undefined)[] = [];
  for (const [index, line] of laid.entries()) {
    const trailing = !line.parts.length && !line.hardBreak && index === laid.length - 1 && index > 0;
    if (trailing) {
      out.push(out[index - 1]);
      continue;
    }
    const styles = line.parts.length
      ? [...line.parts.map((part) => ({ ...item.style, ...(part.style as CSSProperties | undefined) })),
        ...(line.hardBreak && line.breakStyle ? [{ ...item.style, ...line.breakStyle }] : [])]
      : [{ ...item.style, ...line.emptyStyle }];
    out.push(officeStyleFonts(styles, item.style));
  }
  return out;
}

function officeStyleFonts(styles: readonly CSSProperties[], base: CSSProperties): OfficeRowFont[] | undefined {
  const fonts: OfficeRowFont[] = [];
  for (const style of styles) {
    const face = officeStyleFace(style, base);
    if (!face || !officeRowMetricsKnown(face.family, face.sizePt)) return undefined;
    fonts.push({ family: face.family, sizePt: face.sizePt, bold: face.bold, ...(face.script ? { script: face.script } : {}) });
  }
  return fonts;
}

/** How many lines the laid-out probe `text` holds (its line boxes, by their
 * vertical extent): 0 when it holds none. */
function probeLineCount(text: HTMLElement): number {
  const range = document.createRange();
  range.selectNodeContents(text);
  const rects = [...range.getClientRects()].filter((rect) => rect.height > 0).sort((a, b) => a.top - b.top);
  let lines = 0;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const rect of rects) {
    if (rect.top >= bottom - 1) {
      lines += 1;
      bottom = rect.bottom;
    } else bottom = Math.max(bottom, rect.bottom);
  }
  return lines;
}

/** The height one cell asks of its row, `text` being a laid-out probe; nothing
 * when the probe is not laid out. */
/**
 * The lines Windows Excel's screen wraps an item's plain Latin text into, from
 * its hinted advance widths (officeHintedWrapLines, lookwin probes p20/p20b:
 * 96.5-99% of rows' line counts, where the browser's widths reached ~89%);
 * undefined for turned or stacked text, a single line, or a face, size or
 * character the table lacks (the measure below answers those). Rich text
 * wraps each run at its own face's widths (officeHintedWrapRunLines, the
 * server's office_hinted_wrap_runs: R195-X01's footnote marks), its lines
 * laid out for the faces each holds (`laid`).
 */
function hintedLines(item: AutoRowMeasurement): { count: number; laid?: NativeTextLine[] } | undefined {
  // An imported Windows grid (96 dpi) only: a page's own sheet keeps the measure it has.
  if (item.singleLine || item.rotation || item.stacked || item.dpi !== 96) return undefined;
  if (item.parts && item.parts.length > 1) return hintedRunLines(item, item.parts);
  const count = hintedLineCount(item);
  return count === undefined ? undefined : { count };
}

/** The lines a rich cell's runs wrap into at their own faces' hinted
 * widths, each line cut into the runs it holds; undefined where the table
 * cannot say for a run. */
function hintedRunLines(item: AutoRowMeasurement, parts: readonly NativeTextPart[]): { count: number; laid: NativeTextLine[] } | undefined {
  const runs = [];
  for (const part of parts) {
    const face = officeStyleFace({ ...item.style, ...(part.style as CSSProperties | undefined) }, item.style);
    if (!face) return undefined;
    runs.push({ text: part.text.replace(/\r\n?/g, "\n"), family: face.family, sizePt: face.sizePt, bold: face.bold === true, italic: face.italic,
      ...(face.script ? { script: true } : {}) });
  }
  const lines = officeHintedWrapRunLines(runs, item.width, { normalDigitPx: item.normalDigitPx, spaced: item.spaced === true });
  if (!lines?.length) return undefined;
  // Each line's pieces of the runs, found in the cell's text from where the
  // last one ended (the server's cell_line_segments).
  const flat = runs.map((run) => run.text).join("");
  const bounds: { start: number; end: number; style: CSSProperties | undefined }[] = [];
  let offset = 0;
  for (const [index, run] of runs.entries()) {
    bounds.push({ start: offset, end: offset + run.text.length, style: parts[index].style as CSSProperties | undefined });
    offset += run.text.length;
  }
  const laid: NativeTextLine[] = [];
  let cursor = 0;
  const styleAt = (index: number) => (bounds.find((bound) => index >= bound.start && index < bound.end) ?? bounds[bounds.length - 1])?.style;
  for (const line of lines) {
    const found = line ? flat.indexOf(line, cursor) : cursor;
    const start = found < 0 ? cursor : found;
    const end = start + line.length;
    // The typed break that ends the line, past its trailing spaces.
    let after = end;
    while (after < flat.length && (flat[after] === " " || flat[after] === "\t")) after += 1;
    const broken = flat[after] === "\n";
    cursor = broken ? after + 1 : end;
    const pieces = bounds.filter((bound) => Math.max(start, bound.start) < Math.min(end, bound.end))
      .map((bound) => ({ text: flat.slice(Math.max(start, bound.start), Math.min(end, bound.end)), style: bound.style }));
    // An empty line stands at the face of its own break (officeLaidLinesFonts).
    laid.push(pieces.length
      ? { parts: pieces, hardBreak: broken ? "\n" : "", ...(broken ? { breakStyle: styleAt(after) } : {}) }
      : { parts: [], hardBreak: broken ? "\n" : "", emptyStyle: styleAt(broken ? after : start) });
  }
  return { count: lines.length, laid };
}

/**
 * The width complex-script letters (Bengali in Nirmala UI, Arabic, Hebrew)
 * of an imported Windows grid wrap at, px: Windows Excel's own room of the
 * column (officeHintedWrapRoom) at the face's whole-pixel em, scaled to its
 * size (lookwin p119-lw: 36 of R379-X18's Bengali texts x 16 widths in Arial
 * 10 and SutonnyMJ 12 cells, 1,124 of 1,152 line counts, the column less the
 * cell's padding 1,085). The API's cell_text_lines is the same rule.
 * Undefined for other text (the probe keeps the column less its padding).
 */
function complexWrapWidth(item: AutoRowMeasurement): number | undefined {
  if (item.dpi !== 96 || item.singleLine || item.rotation || item.stacked || item.nativeParagraph) return undefined;
  if (!OFFICE_COMPLEX_WRAP_TEXT.test(itemText(item))) return undefined;
  const family = leadFamily(item.style.fontFamily);
  const size = typeof item.style.fontSize === "number" ? item.style.fontSize : Number.NaN;
  if (!family || !(size > 0)) return undefined;
  const emPx = Math.max(1, Math.floor(size * 0.75 * 96 / 72 + 0.5));
  const digitPx = officeDigitPx({ family, sizePt: size * 0.75, bold: boldWeight(item.style.fontWeight), italic: item.style.fontStyle === "italic" });
  return Math.max(1, officeHintedWrapRoom(item.width, emPx, item.normalDigitPx, digitPx) * size / emPx);
}

function hintedLineCount(item: AutoRowMeasurement): number | undefined {
  const family = leadFamily(item.style.fontFamily);
  const size = typeof item.style.fontSize === "number" ? item.style.fontSize : Number.NaN;
  if (!family || !(size > 0)) return undefined;
  const bold = boldWeight(item.style.fontWeight);
  const lines = officeHintedWrapLines(item.text, { family, sizePt: size * 0.75, bold, italic: item.style.fontStyle === "italic" }, item.width,
    { normalDigitPx: item.normalDigitPx, spaced: item.spaced === true });
  return lines?.length;
}

/**
 * A row Windows Excel fits to its lines, px: the faces' own heights, not
 * floored at the grid's 18 px minimum row (clampRowHeight) -- a wrapped
 * Arial 8 line is a 15 px row, as Excel fits and prints it (R298-X21: every
 * "Ranked first" row printed 18 px tall, 11 pages for Excel's 7) -- and
 * capped at Excel's tallest row, 409.5 pt (546 px), not the 512 px a row can
 * be dragged to: a row of 516 characters of Calibri 9 that Excel saved at
 * 409.5 pt stands there (lookwin p57-lw; R350-X21 printed 24.7 pt short).
 */
function officeAutoRowHeight(height: number): number {
  return Math.min(MAX_NATIVE_ROW_HEIGHT_PX, Math.max(1, Math.round(height)));
}

function measureAutoRowItem(item: AutoRowMeasurement, defaultHeight: number, text: HTMLElement): number | null {
  const measuredText = item.text.endsWith("\n") ? `${item.text}\u00a0` : item.text;
  const parts = autoRowParts(item);
  if (item.text === "" && item.singleLine && item.dpi === 96 && !item.rotation && !item.stacked) {
    // An empty cell's own font: one line of it, set with the row's other
    // faces (lookwin p58-lw); a face the metrics do not know asks nothing.
    const office = officeLineHeight(item);
    return office === undefined ? 0 : officeAutoRowHeight(officeLinesHeight(item, office, 1));
  }
  if (item.singleLine && item.dpi === 96 && !item.rotation && !item.stacked && !item.baseHeightOnly && scriptMarked(item)) {
    // One line with a Superscript / Subscript face: Excel's own row of its
    // faces, the script's rise or drop included (officeScriptExtra), not the
    // browser's line box of its shrunk text.
    const office = officeLineHeight(item);
    if (office !== undefined) return officeAutoRowHeight(officeLinesHeight(item, office, 1));
  }
  if (!item.baseHeightOnly && !item.numericValue) {
    const hinted = hintedLines(item);
    const office = hinted ? officeLineHeight(item) : undefined;
    if (hinted && office !== undefined) return officeAutoRowHeight(officeLinesHeight(item, office, hinted.count, hinted.laid));
  }
  if (item.baseHeightOnly) {
    const raw = item.dpi ? measureNativeParagraphLineHeight(parts, item.style, item.dpi) : undefined;
    const measured = raw !== undefined && item.scale ? Math.round(raw * item.scale * 2) / 2 : raw;
    return measured !== undefined && measured > defaultHeight ? clampNativeAutomaticRowHeight(measured) : 0;
  }
  const automaticHeight = item.nativeParagraph && item.dpi
    ? measureNativeAutoRowHeight(parts, item.style, item.singleLine ? 1e6 : item.width - 5 * 96 / item.dpi, item.dpi, item.numericValue)
    : undefined;
  if (automaticHeight !== undefined) return automaticHeight;
  // A native paragraph on a grid of Windows pixels: its own lines, each the
  // automatic height Excel gives its faces (officeLineHeight), where the
  // faces are known -- as the probe below does for other text.
  if (item.nativeParagraph && item.dpi === 96 && !item.rotation && !item.stacked) {
    const office = officeLineHeight(item);
    const lines = office !== undefined
      ? layoutNativeText(parts, item.style, item.singleLine ? 1e6 : item.width - 5 * 96 / item.dpi, item.dpi)
      : undefined;
    if (office !== undefined && lines?.length) return officeAutoRowHeight(officeLinesHeight(item, office, lines.length, lines));
  }
  const nativeHeight = item.nativeParagraph && item.dpi
    ? measureNativeTextHeight(parts, item.style, item.singleLine ? 1e6 : item.width - 5 * 96 / item.dpi, item.dpi)
    : undefined;
  if (nativeHeight !== undefined) return clampRowHeight(Math.ceil(nativeHeight + 4), defaultHeight);
  text.style.cssText = "";
  const measuredStyle = resolveSpreadsheetTextStyle(item.style, item.text, item.dpi);
  Object.assign(text.style, {
    fontFamily: measuredStyle.fontFamily ?? "inherit",
    fontWeight: String(measuredStyle.fontWeight ?? "normal"),
    fontStyle: measuredStyle.fontStyle ?? "normal",
    fontSize: typeof measuredStyle.fontSize === "number" ? `${measuredStyle.fontSize}px` : measuredStyle.fontSize ?? "12px",
    // A wrapped cell is painted at the wrapped-text pitch, so it is
    // measured at it: measured at the font's "normal" pitch, nine
    // painted lines fit a row of eight and the first line was cut off
    // above a bottom-aligned paragraph (user audit S-001).
    // (A native paragraph is painted at "normal", and measured so.)
    lineHeight: item.singleLine || item.nativeParagraph ? "normal" : String(SPREADSHEET_WRAP_LINE_HEIGHT),
    whiteSpace: item.singleLine ? "pre" : "pre-wrap", overflowWrap: "anywhere",
    wordBreak: "break-word", boxSizing: "content-box",
    // Punctuation marks that meet keep their full widths, as the cell draws them.
    textSpacingTrim: "space-all",
    // Normal view has 9px padding on each side; Page Layout has less.
    // One shared height must fit both, independent of the active view.
    // The painted paragraph also loses the cell's 1px gridline.
    width: `${complexWrapWidth(item) ?? Math.max(1, item.width - 2 * (item.paddingX ?? 9) - (item.singleLine || item.nativeParagraph ? 0 : 1))}px`, height: "auto",
  });
  if (item.dpi) {
    const font = `${text.style.fontStyle} ${text.style.fontWeight} ${text.style.fontSize} ${text.style.fontFamily}`;
    const runs = nativeTextAdvances(measuredText,font,item.dpi);
    text.style.fontKerning = "none";
    text.replaceChildren(...runs.map(run => {
      const span = document.createElement("span"); span.textContent = run.text; span.style.letterSpacing = `${run.spacing}px`; return span;
    }));
  } else if (item.parts) {
    // A cell with formatted runs is measured with each run in its own
    // font (a 24 px run makes a taller line than the cell's base),
    // not as plain text in the base font.
    text.replaceChildren(...parts.map(part => {
      const span = document.createElement("span");
      span.textContent = part.text;
      for (const [property, value] of Object.entries(part.style ?? {})) {
        if (value === undefined || value === null) continue;
        const cssValue = typeof value === "number" && property !== "fontWeight" && property !== "lineHeight"
          ? `${value}px` : String(value);
        (span.style as unknown as Record<string, string>)[property] = cssValue;
      }
      return span;
    }));
  } else text.textContent = measuredText;
  if (item.stacked) {
    text.style.writingMode = "vertical-rl";
    text.style.textOrientation = "upright";
    // a character to an Excel line of its face, as the cell draws it
    text.style.letterSpacing = stackedTextLetterSpacing(item.style.fontFamily, item.style.fontSize);
    text.style.whiteSpace = "pre";
    text.style.width = "auto";
  } else if (item.rotation) {
    // The turned line's own length, not the column's: a box as wide
    // as the column reports the column's width for a short line, and
    // a 90° row grew to the column's width.
    text.style.width = "max-content";
  }
  const measured = item.stacked
    ? text.scrollHeight
    : item.rotation
    ? Math.abs(Math.sin((item.rotation * Math.PI) / 180)) * text.scrollWidth +
      Math.abs(Math.cos((item.rotation * Math.PI) / 180)) * text.scrollHeight
    : text.scrollHeight;
  // A probe that is not laid out (a hidden window) measures nothing:
  // that is no answer to keep.
  if (!(measured > 0)) return null;
  // Unturned text in faces Excel's metrics are known for, on a grid of Windows
  // pixels: the row Excel fits to its lines, each line that line's automatic
  // height (officeLineHeight) -- two wrapped lines of Calibri 11 are 40 px
  // (30 pt), as Excel fits them, where the browser's pitch plus a margin made
  // 38 or more. The lines are the probe's own (its wrapping).
  if (!item.stacked && !item.rotation && (!item.dpi || item.dpi === 96)) {
    const lines = item.singleLine ? 1 : probeLineCount(text);
    const office = lines > 0 ? officeLineHeight(item) : undefined;
    if (office !== undefined) return officeAutoRowHeight(officeLinesHeight(item, office, lines));
  }
  return clampRowHeight(Math.ceil(measured + 4), defaultHeight);
}

function createAutoRowProbe(parent: HTMLElement) {
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.setAttribute("data-spreadsheet-auto-row-probe", "");
  Object.assign(probe.style, {
    position: "absolute", left: "0", top: "0", visibility: "hidden",
    pointerEvents: "none", contain: "layout style paint", width: "0", height: "0",
    overflow: "hidden",
  });
  const text = document.createElement("div");
  probe.appendChild(text);
  parent.appendChild(probe);
  return { probe, text };
}

/**
 * The automatic heights these cells ask of their rows, now, as the hook below
 * would arrive at them: for a preview, which cannot wait for its chunks.
 */
export function measureAutoRowsNow(parent: HTMLElement, items: readonly AutoRowMeasurement[], defaultHeight: number): Record<string, number> {
  const heights: Record<string, number> = {};
  if (items.length === 0) return heights;
  const { probe, text } = createAutoRowProbe(parent);
  try {
    measureNativeTextHeightBatch(items.flatMap((item) => !item.nativeParagraph || !item.dpi || item.baseHeightOnly ? [] : [
      { parts: autoRowParts(item), style: item.style, width: item.singleLine ? 1e6 : item.width - 5 * 96 / item.dpi, dpi: item.dpi },
    ]));
    for (const item of items) {
      const height = measureAutoRowItem(item, defaultHeight, text);
      if (height !== null && height > defaultHeight) heights[item.row] = Math.max(heights[item.row] ?? defaultHeight, height);
    }
  } finally {
    probe.remove();
  }
  return heights;
}

export function useSpreadsheetAutoRowHeights(
  root: RefObject<HTMLElement | null>,
  measurements: readonly AutoRowMeasurement[],
  defaultHeight: number,
  /** The sheet the measurements belong to. While that sheet re-measures after
   * an edit, its last heights stay in effect instead of dropping to the
   * defaults for a frame; another sheet never inherits them. */
  scope?: string,
) {
  // Evaluator callbacks can be recreated without any text/geometry change.
  // Stabilize the semantic input so measurement itself cannot trigger a loop.
  // The measurements of a large sheet serialize to tens of megabytes; the
  // hook keeps their content key and one parsed copy, never the text (no
  // closure below may name it, or the effect's would keep it alive).
  // Heights measured while the text engine's faces loaded are measured again
  // once they have (the same rows in every browser).
  const engineEpoch = useSpreadsheetTextEngineEpoch();
  const measuredRef = useRef<{ key: string; list: AutoRowMeasurement[] } | null>(null);
  const measurementKey = readMeasurements(measurements, measuredRef);
  const key = `${defaultHeight}:${measurementKey}`;
  const stableMeasurements = measuredRef.current!.list;
  const [result, setResult] = useState<{
    source: string;
    scope: string | undefined;
    heights: Record<string, number>;
    /** The rows measured so far of a sheet's first measurement (X-229). */
    partial?: true;
  } | null>(null);

  useEffect(() => {
    const parent = root.current;
    if (!parent || stableMeasurements.length === 0) return;
    let cancelled = false;
    let generation = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const { probe, text } = createAutoRowProbe(parent);

    const run = async () => {
      const current = ++generation;
      if (timer) clearTimeout(timer);
      // Late web-font completion reruns this disposable projection.
      // Reading fonts.ready lays the page out (a tenth of every entry's
      // cost on a large sheet); it is awaited only while a font is loading.
      if (document.fonts?.status === "loading") await document.fonts.ready;
      if (cancelled || current !== generation) return;
      let cursor = 0;
      const heights: Record<string, number> = {};
      // A sheet measured for the first time shows its rows as they are
      // measured, the first chunks (the top of the sheet) at once: a
      // 7,577-row price list took some 40 s to measure whole, and its
      // wrapped rows sat at the default height, their lines cut to a sliver,
      // all that time (r52 P01, X-229). Rows only grow on the way; the
      // finished measurement replaces what was shown. A sheet that already
      // shows a finished measurement keeps it until the new one is done.
      let published = Number.NEGATIVE_INFINITY;
      let publishEvery = 500;
      const publishPartial = () => {
        const now = performance.now();
        if (now - published < publishEvery) return;
        published = now;
        publishEvery = Math.min(4_000, publishEvery * 2);
        const snapshot = { ...heights };
        setResult((previous) => {
          if (previous !== null && previous.scope === scope && !previous.partial) return previous;
          const kept = previous !== null && previous.scope === scope ? previous.heights : {};
          const shown: Record<string, number> = { ...kept };
          for (const [row, height] of Object.entries(snapshot)) shown[row] = Math.max(shown[row] ?? 0, height);
          return { source: key, scope, heights: shown, partial: true };
        });
      };
      const chunk = () => {
        if (cancelled || current !== generation) return;
        const ask = (item: AutoRowMeasurement, height: number) => {
          if (height > defaultHeight) heights[item.row] = Math.max(heights[item.row] ?? defaultHeight, height);
        };
        const keyOf = (item: AutoRowMeasurement) => {
          const content: Partial<AutoRowMeasurement> = { ...item };
          delete content.row;
          return `${defaultHeight}:${engineEpoch}:${contentKey(JSON.stringify(content))}`;
        };
        // The chunk's unknown paragraphs are laid out together, under one
        // layout of the page, before any of them is measured.
        const CHUNK = 512;
        // The texts this chunk measures are laid out together first, each
        // once, and the chunk measures no further than they reach: a cell
        // past them was laid out alone, a forced layout of the page each.
        // Repeated texts (a coded column: one category a thousand times)
        // took places in the batch and were then answered from the cache, so
        // the chunk ran on past it into long comments laid out one by one
        
        const ahead: NativeTextLayoutRequest[] = [];
        const batched = new Set<string>();
        let aheadEnd = cursor;
        for (; aheadEnd < stableMeasurements.length && ahead.length < CHUNK; aheadEnd += 1) {
          const item = stableMeasurements[aheadEnd];
          if (!item.nativeParagraph || !item.dpi || item.baseHeightOnly) continue;
          const itemKey = keyOf(item);
          if (batched.has(itemKey) || measuredHeights.has(itemKey)) continue;
          batched.add(itemKey);
          ahead.push({ parts: autoRowParts(item), style: item.style, width: item.singleLine ? 1e6 : item.width - 5 * 96 / item.dpi, dpi: item.dpi });
        }
        measureNativeTextHeightBatch(ahead);
        // Cached answers cost nothing; the chunk's budget is real
        // measurements, so a sheet whose cells are all known finishes at once.
        let measuredNow = 0;
        for (; cursor < aheadEnd && measuredNow < CHUNK; cursor += 1) {
          const item = stableMeasurements[cursor];
          const cacheKey = keyOf(item);
          const known = measuredHeights.get(cacheKey);
          if (known !== undefined) {
            ask(item, known.height);
            continue;
          }
          measuredNow += 1;
          const remember = (height: number) => {
            if (measuredHeights.size >= MEASURED_HEIGHTS_LIMIT) measuredHeights.clear();
            // Kept while faces load too: the face a height was measured
            // without takes it away when it lands (the listener above).
            measuredHeights.set(cacheKey, { height, families: itemFamilies(item), text: itemText(item) });
            ask(item, height);
          };
          const height = measureAutoRowItem(item, defaultHeight, text);
          if (height !== null) remember(height);
        }
        if (cursor < stableMeasurements.length) {
          publishPartial();
          timer = setTimeout(chunk, 0);
        } else setResult((previous) => {
          // Equal heights keep their identity: rows key their paint on it.
          const same = previous !== null && previous.scope === scope &&
            Object.keys(previous.heights).length === Object.keys(heights).length &&
            Object.entries(heights).every(([row, height]) => previous.heights[row] === height);
          return { source: key, scope, heights: same ? previous.heights : heights };
        });
      };
      chunk();
    };
    void run();
    // Measured again only when a face its text is drawn in finished.
    const fontsLoaded = (event: Event) => {
      const reach = fontLoadReach(event);
      if (!reach) return;
      if (stableMeasurements.some((item) => reach.touches(itemFamilies(item), itemText(item)))) void run();
    };
    document.fonts?.addEventListener("loadingdone", fontsLoaded);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.fonts?.removeEventListener("loadingdone", fontsLoaded);
      probe.remove();
    };
  }, [root, stableMeasurements, key, defaultHeight, scope, engineEpoch]);

  if (!result) return undefined;
  if (result.source === key) return result.heights;
  return scope !== undefined && result.scope === scope && stableMeasurements.length > 0 ? result.heights : undefined;
}
