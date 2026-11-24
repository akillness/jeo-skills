/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word "footnote text" typography for the paged 脚注区.
 *
 * Word sets every note paragraph in the document's "footnote text" style: its
 * size and its Latin and East Asian faces, single-spaced and off the line
 * grid. The seam zone painted every document's notes in one editor stack
 * (12px ui-serif/Georgia at 1.55), so a 9pt 宋体 note wrapped and advanced
 * unlike Word's, and the ledger reserved a different height for it than Word
 * does. The importer records the style on the document; the zone builder and
 * the ledger's note measurer both read it here, so what is painted is what
 * is charged.
 */
import { ptToPx, ptToPxRounded } from "../../../../lib/office-units";
import {
  measureOfficeFontBoundingBox,
  measureOfficeFontLineBox,
} from "../../../office-ribbon/officeFontLineBox";
import { wordDocumentEastAsianSingleLineFactor } from "../../../../lib/document-word-line-metrics";
import {
  fontFamilyWithCjkRenderFallback,
  normalizeFontFamily,
  normalizeFontSize,
} from "../extensions/TextStyling";
import { wordDocumentFontLineMetrics, wordDocumentWindowsLineEm } from "./wordFontMetrics";
import type { FootnoteParagraphFormat } from "./footnotes";
import { NOTE_PARAGRAPH_LINE_ATTR, noteRowLineToParagraphs } from "./noteRichText";

export const FOOTNOTE_TEXT_STYLE_ATTR = "footnoteTextStyle";
export const ENDNOTE_TEXT_STYLE_ATTR = "endnoteTextStyle";
export const NOTE_ZONE_FONT_SIZE_PROPERTY = "--docs-note-font-size";
export const NOTE_ZONE_FONT_FAMILY_PROPERTY = "--docs-note-font-family";

export interface NoteTextStyle {
  /** CSS px size, as the fontSize mark carries it ("12px" for 9pt). */
  fontSize?: string;
  /** The Latin face, normalized like the fontFamily mark. */
  fontFamily?: string;
  /** The East Asian face, normalized like the fontCjkFamily mark. */
  cjkFontFamily?: string;
  /** The document's line grid pitch (px) when its lines snap to one: Word
   * puts every footnote line on the grid too, a whole number of slots. Read
   * from the document, never persisted in the style. */
  gridPitchPx?: number;
  /** The separator paragraph's own spacing (points) and line multiple; a
   * value it does not state is Normal's. */
  separatorBeforePt?: number;
  separatorAfterPt?: number;
  separatorLine?: number;
  /** An exact (or at least) line the separator states, in points. */
  separatorLinePt?: number;
  /** The import read the separator (a page read before keeps the list's rule). */
  separatorRead?: boolean;
  /** The continuation separator's own spacing and line (the full-width rule
   * over notes continued from the page before), as for the separator. */
  continuationBeforePt?: number;
  continuationAfterPt?: number;
  continuationLine?: number;
  continuationLinePt?: number;
  continuationRead?: boolean;
  /** The note style's own spacing through its chain, where it has any (Word
   * sets a note in its style like any other paragraph). */
  spaceBeforePt?: number;
  spaceAfterPt?: number;
  lineMultiple?: number;
}

/** Whitelist the persisted attr: a forged or stale value degrades to null. */
export function sanitizeNoteTextStyle(value: unknown): NoteTextStyle | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const fontSize = normalizeFontSize(raw.fontSize);
  const fontFamily = normalizeFontFamily(raw.fontFamily);
  const cjkFontFamily = normalizeFontFamily(raw.cjkFontFamily);
  const style: NoteTextStyle = {
    ...(fontSize ? { fontSize } : {}),
    ...(fontFamily ? { fontFamily } : {}),
    ...(cjkFontFamily ? { cjkFontFamily } : {}),
  };
  if (raw.separatorRead === "1" || raw.separatorRead === true) style.separatorRead = true;
  if (raw.continuationRead === "1" || raw.continuationRead === true) style.continuationRead = true;
  for (const [key, low, high] of [
    ["separatorBeforePt", 0, 1584],
    ["separatorAfterPt", 0, 1584],
    ["separatorLine", 0.05, 5],
    ["separatorLinePt", 0.05, 1584],
    ["continuationBeforePt", 0, 1584],
    ["continuationAfterPt", 0, 1584],
    ["continuationLine", 0.05, 5],
    ["continuationLinePt", 0.05, 1584],
    ["spaceBeforePt", 0, 1584],
    ["spaceAfterPt", 0, 1584],
    ["lineMultiple", 0.05, 5],
  ] as const) {
    const value = Number(raw[key]);
    if (raw[key] !== undefined && raw[key] !== null && raw[key] !== "" && Number.isFinite(value) && value >= low && value <= high) {
      style[key] = value;
    }
  }
  return Object.keys(style).length ? style : null;
}

/**
 * Word's note separator: a paragraph of the document's Normal style, one line
 * of its face, with the rule drawn across the middle of that line, and the
 * paragraph's own spacing (Word writes after=0, single; a separator that
 * states none takes Normal's). Sized on `separator` from the document's
 * Normal mirror (`defaultFontFamily` / `defaultFontSize` / `defaultLineHeight`
 * / `defaultParagraphSpace*`). Left to the CSS when Normal's face cannot be
 * measured.
 */
export function applyNoteSeparatorTypography(
  separator: HTMLElement,
  docAttrs: Record<string, unknown> | null | undefined,
  style: NoteTextStyle | null,
  kind: "separator" | "continuation" = "separator",
): void {
  const read = kind === "continuation" ? style?.continuationRead : style?.separatorRead;
  if (!read) return;
  const own = kind === "continuation"
    ? { line: style?.continuationLine, linePt: style?.continuationLinePt, before: style?.continuationBeforePt, after: style?.continuationAfterPt }
    : { line: style?.separatorLine, linePt: style?.separatorLinePt, before: style?.separatorBeforePt, after: style?.separatorAfterPt };
  let linePx: number;
  if (own.linePt !== undefined) {
    // An exact line is that height whatever the face (corpus R52-D15: 55 pt).
    linePx = ptToPx(own.linePt);
  } else {
    const family = normalizeFontFamily(docAttrs?.defaultFontFamily);
    const size = normalizeFontSize(docAttrs?.defaultFontSize);
    const sizePx = size ? Number.parseFloat(size) : Number.NaN;
    if (!family || !Number.isFinite(sizePx) || sizePx <= 0) return;
    const ratio = singleLineRatio(separator.ownerDocument, renderStack(family), false);
    if (ratio === null) return;
    linePx = ratio * sizePx * (own.line ?? (Number(docAttrs?.defaultLineHeight) || 1));
  }
  const before = own.before ?? (Number(docAttrs?.defaultParagraphSpaceBefore) || 0);
  const after = own.after ?? (Number(docAttrs?.defaultParagraphSpaceAfter) || 0);
  const lineAt = (px: number) => `${Math.round(px * 1000) / 1000}px`;
  separator.style.height = lineAt(linePx);
  separator.style.marginTop = lineAt(ptToPx(before));
  separator.style.marginBottom = lineAt(ptToPx(after));
  separator.setAttribute("data-note-separator-line", "true");
}

export function footnoteTextStyleFromDocAttrs(
  attrs: Record<string, unknown> | null | undefined,
): NoteTextStyle | null {
  const style = sanitizeNoteTextStyle(attrs?.[FOOTNOTE_TEXT_STYLE_ATTR]);
  const gridPitchPx = noteGridPitchPx(attrs);
  return gridPitchPx === null ? style : { ...(style ?? {}), gridPitchPx };
}

/**
 * The line grid the body snaps to (NoteEditor documentRenderGridPitchPx):
 * Word lays the footnote area's lines on the same grid (corpus R37-D15: ten
 * 10 pt notes under an 18 pt grid take 18 pt each, so eight fit below thirty
 * body lines, not fourteen).
 */
function noteGridPitchPx(attrs: Record<string, unknown> | null | undefined): number | null {
  if (!attrs || attrs.manuscriptGrid === "off") return null;
  // DocumentPageSetup.normalizeDocGridLinePitch (that module imports this
  // one): whole twips from 20 to 2880, anything else no grid.
  const raw = typeof attrs.docGridLinePitch === "number" ? attrs.docGridLinePitch : Number(attrs.docGridLinePitch);
  if (!Number.isFinite(raw)) return null;
  const twips = Math.round(raw);
  return twips >= 20 && twips <= 2880 ? twips / 15 : null;
}

/** The "endnote text" style the document-end note list is set in. */
export function endnoteTextStyleFromDocAttrs(
  attrs: Record<string, unknown> | null | undefined,
): NoteTextStyle | null {
  return sanitizeNoteTextStyle(attrs?.[ENDNOTE_TEXT_STYLE_ATTR]);
}

const EAST_ASIAN_TEXT_RE =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}]/u;
const REFERENCE_PX = 1000;
const recordedRatios = new Map<string, number>();

function unquoted(token: string): string {
  return token.trim().replace(/^["']|["']$/g, "");
}

/**
 * Measured ratios (a face Word's files were not recorded for), per document.
 * Each measurement is a forced layout of the whole document: R480-D21's print
 * (480 pages, a Trebuchet MS footer on every sheet) read the same faces over
 * and over as its bands were drawn, 55 s of its 182 s layout. What the page
 * draws a stack in changes only when a face starts, finishes or fails
 * loading, or faces are declared or let go: a reading taken while no face was
 * loading stands until one of those happens (the font set's events and size
 * move the epoch). Without a font set, or while a face loads, every call
 * measures, as before. `window.__docsMeasuredLineMemoOff = true` measures
 * every time, for an A/B of one build.
 */
const measuredRatios = new WeakMap<Document, { epoch: string; ratios: Map<string, number | null> }>();
const fontSetEvents = new WeakMap<Document, { count: number }>();

function measuredLineMemoOff(): boolean {
  return typeof window !== "undefined" &&
    (window as Window & { __docsMeasuredLineMemoOff?: boolean }).__docsMeasuredLineMemoOff === true;
}

/** The document's font state, or null when a reading must not be kept. */
function fontSetEpoch(doc: Document): string | null {
  const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts || typeof fonts.addEventListener !== "function") return null;
  let events = fontSetEvents.get(doc);
  if (!events) {
    const counter = { count: 0 };
    const moved = () => { counter.count += 1; };
    fonts.addEventListener("loading", moved);
    fonts.addEventListener("loadingdone", moved);
    fonts.addEventListener("loadingerror", moved);
    fontSetEvents.set(doc, counter);
    events = counter;
  }
  if (fonts.status !== "loaded") return null;
  return `${events.count}|${fonts.size}`;
}

function measuredRatio(doc: Document, key: string, measure: () => number | null): number | null {
  if (measuredLineMemoOff()) return measure();
  const before = fontSetEpoch(doc);
  if (before !== null) {
    const kept = measuredRatios.get(doc);
    if (kept && kept.epoch === before && kept.ratios.has(key)) return kept.ratios.get(key) ?? null;
  }
  const ratio = measure();
  // Kept only when no face was loading before or after it was read: a
  // reading that set a face loading is taken again once that face is in.
  const after = fontSetEpoch(doc);
  if (before !== null && after === before) {
    let kept = measuredRatios.get(doc);
    if (!kept || kept.epoch !== after) {
      kept = { epoch: after, ratios: new Map() };
      measuredRatios.set(doc, kept);
    }
    kept.ratios.set(key, ratio);
  }
  return ratio;
}

/**
 * Word's single line for a face, per em: an East Asian face advances 1.3x
 * its hhea box, every other face its box plus lineGap (the CSS normal box).
 * A recorded Word face answers from its file; any other face is measured
 * as the page paints it.
 */
function singleLineRatio(
  doc: Document,
  stack: string,
  eastAsian: boolean,
  weight = 400,
  italic = false,
): number | null {
  const styled = !eastAsian && (weight >= 600 || italic) && !styleLineOff();
  const key = `${eastAsian ? "ea" : "latin"}|${styled ? `${weight >= 600 ? 700 : 400}/${italic ? 1 : 0}|` : ""}${stack}`;
  const recorded = recordedRatios.get(key);
  if (recorded !== undefined) return recorded;
  // Latin text is set in the stack's first face: a face Word did not record
  // is measured as the browser draws it, never read from the CJK fallbacks
  // at the stack's end (their taller box lifted a Latin footer a line).
  const tokens = stack.split(",");
  // A bold or italic run is set on its own style's line, each style its own
  // file in Windows Word: Traditional Arabic Bold's 1.5327 em where its
  // regular is 1.4946 (docx-look/probes/cjk13 m1, 15.33 pt at 10 pt; corpus
  // R379-D02's header row, the band 0.4 pt short), Book Antiqua Bold's
  // 1.2056 where its regular is 1.2427. Windows' own line where it differs
  // from the recorded one, else (a face Word's files were not recorded for)
  // the style's face as the page serves it, its overrides Word's box.
  if (styled) {
    const own = wordDocumentWindowsLineEm(unquoted(tokens[0] ?? ""), weight, italic);
    if (own !== undefined) {
      recordedRatios.set(key, own);
      return own;
    }
    if (!wordDocumentFontLineMetrics(unquoted(tokens[0] ?? ""))) {
      return measuredRatio(doc, key, () => {
        const line = measureOfficeFontLineBox(doc, {
          font: `${italic ? "italic" : "normal"} ${weight >= 600 ? 700 : 400} ${REFERENCE_PX}px ${stack}`,
          lineHeight: "normal",
          measureHeight: true,
        });
        return line?.heightPx && Number.isFinite(line.heightPx) && line.heightPx > 0
          ? line.heightPx / REFERENCE_PX
          : null;
      });
    }
  }
  for (const token of eastAsian ? tokens : tokens.slice(0, 1)) {
    const metrics = wordDocumentFontLineMetrics(unquoted(token));
    if (!metrics) continue;
    const ratio = eastAsian
      ? metrics.box * wordDocumentEastAsianSingleLineFactor(unquoted(token))
      : metrics.box + metrics.lineGap;
    recordedRatios.set(key, ratio);
    return ratio;
  }
  const font = `normal 400 ${REFERENCE_PX}px ${stack}`;
  return measuredRatio(doc, key, () => {
    if (eastAsian) {
      const box = measureOfficeFontBoundingBox(doc, font);
      return box === undefined
        ? null
        : (box * wordDocumentEastAsianSingleLineFactor(unquoted(tokens[0] ?? ""))) / REFERENCE_PX;
    }
    const line = measureOfficeFontLineBox(doc, {
      font,
      lineHeight: "normal",
      measureHeight: true,
    });
    return line?.heightPx && Number.isFinite(line.heightPx) && line.heightPx > 0
      ? line.heightPx / REFERENCE_PX
      : null;
  });
}

function renderStack(family: string): string {
  return fontFamilyWithCjkRenderFallback(family) ?? family;
}

/**
 * Word's single line for a face, per em: the recorded Word metrics when the
 * face is one Word measured, else the browser's own reading of it. Shared by
 * the footnote rows and the header/footer bands so both size a line the way
 * Word does. Null when the face cannot be measured yet.
 */
export function wordSingleLineRatio(
  doc: Document,
  family: string,
  eastAsian: boolean,
  weight?: number,
  italic?: boolean,
): number | null {
  return singleLineRatio(doc, renderStack(family), eastAsian, weight, italic);
}

/** `window.__docsBandStyleLineOff = true` asks the older reading (a bold or
 * italic run on its regular face's line), for an A/B of one build. */
function styleLineOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsBandStyleLineOff?: boolean }).__docsBandStyleLineOff === true;
}

/** Whether a run of text holds East Asian characters (Word's 1.3x line). */
export function textHasEastAsian(text: string): boolean {
  return EAST_ASIAN_TEXT_RE.test(text);
}

/** The zone's size and faces; the CSS falls back to the editor stack. */
export function applyNoteZoneTypography(
  zone: HTMLElement,
  style: NoteTextStyle | null,
): void {
  if (!style) return;
  if (style.fontSize) {
    zone.style.setProperty(NOTE_ZONE_FONT_SIZE_PROPERTY, style.fontSize);
  }
  const authored = [style.fontFamily, style.cjkFontFamily]
    .filter((family): family is string => !!family)
    .join(", ");
  if (authored) {
    zone.style.setProperty(NOTE_ZONE_FONT_FAMILY_PROPERTY, renderStack(authored));
  }
}

/**
 * One note row's line advance: Word's single line for the face the row is
 * set in. A row carrying East Asian text takes the East Asian face's 1.3x
 * box (the tallest run decides the line); a Latin-only row its Latin face's
 * normal box. Left to the CSS when the style names no size or face, or the
 * face cannot be measured yet.
 */
export function applyNoteRowTypography(
  row: HTMLElement,
  zoneStyle: NoteTextStyle | null,
  body: string,
  /** The note's own paragraph format when it is not in the note style. */
  paragraphFormat?: FootnoteParagraphFormat | null,
): void {
  // A note paragraph in another style (an unstyled one is Normal) is set in
  // that style's size and spacing, as Word sets any paragraph; the zone's
  // faces still stand (R02-D15: Normal's 11pt and 6pt after).
  const style: NoteTextStyle | null = paragraphFormat
    ? { ...(zoneStyle ?? {}), fontSize: `${ptToPxRounded(paragraphFormat.fontSizePt, 3)}px` }
    : zoneStyle;
  if (paragraphFormat) row.style.fontSize = style!.fontSize!;
  // A note in the note style (one whose words state a size of their own is too)
  // has the style's spacing; another paragraph style's came with the note.
  const spacing = !paragraphFormat || paragraphFormat.noteStyle
    ? { before: zoneStyle?.spaceBeforePt, after: zoneStyle?.spaceAfterPt, multiple: zoneStyle?.lineMultiple }
    : { before: paragraphFormat.spaceBeforePt, after: paragraphFormat.spaceAfterPt, multiple: paragraphFormat.lineHeight };
  if (paragraphFormat || zoneStyle?.spaceBeforePt || zoneStyle?.spaceAfterPt) {
    row.style.marginTop = spacing.before ? `${spacing.before}pt` : "";
    row.style.marginBottom = spacing.after ? `${spacing.after}pt` : "";
  }
  const multiple = spacing.multiple ?? 1;
  const single = noteRowSingleLinePx(row, style, body);
  const natural = single === null ? null : single * multiple;
  const pitch = style?.gridPitchPx;
  if (pitch && Number.isFinite(pitch) && pitch > 0) {
    // On a line grid the line takes whole slots: one while it fits a slot,
    // the next whole multiple when it is taller (as the body's lines do).
    const slots = natural === null ? 1 : Math.max(1, Math.ceil(natural / pitch - 1e-6));
    setRowLine(row, `${Math.round(slots * pitch * 1000) / 1000}px`);
    return;
  }
  if (natural === null) return;
  setRowLine(row, `${Math.round(natural * 1000) / 1000}px`);
}

/** A row whose paragraphs carry their own lines keeps its line for those
 * that state none, its strut zeroed (applyNoteParagraphLines). */
function setRowLine(row: HTMLElement, value: string): void {
  if (row.querySelector(`[${NOTE_PARAGRAPH_LINE_ATTR}]`)) noteRowLineToParagraphs(row, value);
  else row.style.lineHeight = value;
}

function noteRowSingleLinePx(
  row: HTMLElement,
  style: NoteTextStyle | null,
  body: string,
): number | null {
  if (!style?.fontSize) return null;
  const sizePx = Number.parseFloat(style.fontSize);
  if (!Number.isFinite(sizePx) || sizePx <= 0) return null;
  const eastAsian = !!style.cjkFontFamily && EAST_ASIAN_TEXT_RE.test(body);
  const face = eastAsian
    ? style.cjkFontFamily
    : (style.fontFamily ?? style.cjkFontFamily);
  if (!face) return null;
  const ratio = singleLineRatio(row.ownerDocument, renderStack(face), eastAsian);
  if (ratio === null) return null;
  return ratio * sizePx;
}
