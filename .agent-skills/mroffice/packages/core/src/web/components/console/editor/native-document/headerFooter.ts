/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { normalizeWordFontHint, normalizeWordFontHintLanguage, normalizeWordFontHintCharset } from "../../../office-ribbon/officeFontScriptSlots";
import { normalizeCellBackgroundColor, normalizeCellMargins, type CellMargins } from "./tableCellStyle";
import { WORD_LINE_MULTIPLE_MAX, WORD_LINE_MULTIPLE_MIN } from "../../../../lib/office-units";
/**
 * Pure helpers for the document-level header & footer text (Word/WPS parity).
 *
 * Kept free of any TipTap/React imports so the sanitization/normalization can be
 * unit-tested in isolation and reused by:
 *   - the DocumentPageSetup node extension (parse/render of the persisted doc
 *     attrs that carry the header/footer text),
 *   - the DocumentToolbar header/footer editor controls, and
 *   - NoteEditor, which paints the header/footer bands onto the on-screen "page".
 *
 * A SINGLE normal header and footer per document are supported, plus an OPTIONAL
 * DIFFERENT FIRST PAGE header/footer (Word w:titlePg): page 1 may carry its own
 * (possibly empty) header/footer and pages 2+ carry the normal one. Odd/even
 * variants and true per-section different headers still need pagination/section
 * structure and remain out of scope; see the feature note in docx-export.ts.
 *
 * SECURITY: the stored values are plain text only. Control characters are
 * stripped (never merely escaped) and the length is clamped so neither a
 * malicious paste nor an AI instruction can smuggle markup, an attribute-breaking
 * payload, or an unbounded string through the header/footer. Newlines are
 * collapsed to single spaces so the band stays a single line on screen and a
 * single paragraph in the exported package.
 */

import {
  normalizeDocumentParagraphBorders,
  normalizeDocumentTextBoxFill,
  type DocumentParagraphBorders,
  type DocumentTextBoxPictureFill,
} from "../../../../lib/document-borders";
import { normalizeOfficeTextWarp, textWarpDrawing, type OfficeTextWarp } from "../../../../lib/office-text-warp";
import { hasTextEffects, normalizeTextEffectMarkAttributes } from "../extensions/TextEffects";
import {
  normalizeDocumentShapeAttrs,
  type DocumentShapeAttrs,
} from "../../../../lib/document-shapes";
import { normalizePositionalTab, type PositionalTab } from "../../../../lib/document-tabstops";
import { normalizeWordHorizontalRule, type WordHorizontalRule } from "../../../../lib/document-word-horizontal-rule";
import { normalizeFloatAnchor, type FloatAnchor } from "../../../../lib/office-float-anchor";
import { pictureObjectTokenSha } from "../../../../lib/page-picture-objects";
import { normalizeOfficeShapeGradient, type OfficeShapeGradient } from "../../../../lib/office-shape-paint";
import { OFFICE_BULLET_STYLE_TYPES } from "../../../../lib/office-list-catalog";
import { LIST_STYLE_TYPES } from "./listNumbering";
import { LIST_LEVEL_FORMATS } from "./listLevelDefinition";
import { DOCUMENT_DATE_TIME_FORMATS, documentDateTimeFormat, formatDocumentDateTime } from "./documentDateTime";

/** Hard upper bound for the header/footer text (a generous few lines). */
export const MAX_HEADER_FOOTER_LENGTH = 500;

/** Hard upper bound on band LINES (Word letterhead blocks are 2-4 lines; the
 * cap keeps a hostile value from growing a band taller than the margin). */
export const MAX_HEADER_FOOTER_LINES = 6;

/** One band entry per Word section; Word sets no limit on sections (the
 * section layout model's own bound, `MAX_SECTION_LAYOUTS`). */
export const MAX_SECTION_BANDS = 4096;

// C0 control characters (U+0000-U+001F including tab/CR but EXCLUDING the
// newline U+000A, which is the band's line separator), DEL (U+007F), and the
// C1 control range (U+0080-U+009F). Stripped so a payload cannot break out of
// the DOM band or the exported XML run. Declared via \x escapes (never
// literal control bytes) so the source stays reviewable.
const CONTROL_CHARS_RE = /[\x00-\x09\x0b-\x1f\x7f-\x9f]/g;

/**
 * Sanitize arbitrary header/footer input into a safe multi-line plain string.
 *
 * Drops control characters (newlines survive as line separators — Word
 * headers are routinely 2-4 line letterhead blocks), collapses runs of
 * spaces within each line, drops empty lines, and clamps both the line
 * count and total length. Literal angle brackets / quotes are preserved
 * verbatim — React escapes them when rendering the on-screen band, and the
 * DOCX exporter XML-escapes them — so only bytes that could actually break
 * the DOM or the package are removed.
 *
 * Returns `""` when nothing usable remains; an empty header/footer is treated as
 * "unset" (no band on screen, no part in the exported package).
 */
export function sanitizeHeaderFooterText(value: unknown): string {
  if (typeof value !== "string") return "";
  const lines = value
    .replace(CONTROL_CHARS_RE, " ")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, MAX_HEADER_FOOTER_LINES);
  return lines.join("\n").slice(0, MAX_HEADER_FOOTER_LENGTH).trim();
}

/**
 * Serialize band text into a CSS string literal for a `content:` variable.
 *
 * Backslashes and quotes are escaped and each newline becomes the CSS `\a `
 * escape (a raw newline would end the string token and break the rule);
 * the band pseudo-element renders the breaks via `white-space: pre-line`.
 */
export function cssBandString(text: string): string {
  return (
    '"' +
    text
      .split("\n")
      .map((segment) => segment.replace(/\\/g, "\\\\").replace(/"/g, '\\"'))
      .join("\\a ") +
    '"'
  );
}

/**
 * Like {@link sanitizeHeaderFooterText} but returns `null` for an empty result,
 * so callers can distinguish "explicitly unset" from "set to a value". Used at
 * the rendering edge where the absence of a band is meaningful.
 */
export function normalizeHeaderFooterText(value: unknown): string | null {
  const cleaned = sanitizeHeaderFooterText(value);
  return cleaned ? cleaned : null;
}

/**
 * Word PAGE-field tokens inside band text (页眉"第X页共Y页" streams).
 *
 * Both importers project a header/footer `PAGE` / `NUMPAGES` field
 * instruction as these literal tokens instead of dropping the field (which
 * lost the number) or folding its cached result (which froze one page's
 * number onto every page). Renderers substitute per sheet; the DOCX exporter
 * converts them back into real `w:fldSimple` fields.
 */
export const BAND_PAGE_TOKEN = "{PAGE}";
export const BAND_NUMPAGES_TOKEN = "{NUMPAGES}";
const BAND_TOKEN_RE = /\{PAGE\}|\{NUMPAGES\}/g;

/** Whether band text carries any PAGE-field token (a page number of its own). */
export function bandHasFieldTokens(text: string | null | undefined): boolean {
  if (!text) return false;
  BAND_TOKEN_RE.lastIndex = 0;
  return BAND_TOKEN_RE.test(text);
}

/**
 * Substitute PAGE-field tokens for one rendered sheet. `pageLabel` is the
 * sheet's logical page label (pgNumType-formatted); `totalPages` the physical
 * page count (Word NUMPAGES counts physical pages even when front matter is
 * unnumbered). PURE.
 */
export function resolveBandFieldTokens(
  text: string,
  context: { pageLabel: string; totalPages: number },
): string {
  return text.replace(BAND_TOKEN_RE, (token) =>
    token === BAND_PAGE_TOKEN ? context.pageLabel : String(context.totalPages),
  );
}

/**
 * Different-first-page header/footer config (Word "不同的首页" / w:titlePg).
 *
 * When `differentFirstPage` is on, PAGE 1 shows the first-page header/footer
 * (which may be empty — Word's common "no header on the cover page" case) and
 * pages 2+ show the normal header/footer. When off, every page shows the normal
 * one (and the first-page text is irrelevant). The first-page text uses the same
 * sanitizer as the normal header/footer, so it is single-line, control-byte-free
 * and length-clamped at every edge.
 */
export interface FirstPageConfig {
  differentFirstPage: boolean;
  /** Sanitized first-page header text, or null when unset (no first-page band). */
  firstPageHeader: string | null;
  /** Sanitized first-page footer text, or null when unset. */
  firstPageFooter: string | null;
}

/** Coerce a `differentFirstPage` doc attr into a strict boolean. */
export function normalizeDifferentFirstPage(value: unknown): boolean {
  return value === true;
}

/**
 * Resolve the raw doc attrs into a normalized {@link FirstPageConfig}. The
 * first-page text is sanitized to null when empty; `differentFirstPage` is
 * coerced to a strict boolean. Pure, so the page selector and tests share it.
 */
export function normalizeFirstPageConfig(attrs: {
  differentFirstPage?: unknown;
  firstPageHeader?: unknown;
  firstPageFooter?: unknown;
}): FirstPageConfig {
  return {
    differentFirstPage: normalizeDifferentFirstPage(attrs.differentFirstPage),
    firstPageHeader: normalizeHeaderFooterText(attrs.firstPageHeader),
    firstPageFooter: normalizeHeaderFooterText(attrs.firstPageFooter),
  };
}

/**
 * Different odd/even-page header/footer config (Word "奇偶页不同" /
 * w:evenAndOddHeaders). When `differentOddEven` is on, EVEN pages (2, 4, 6 … →
 * 0-based odd indices 1, 3, 5) show the even-page header/footer and ODD pages
 * (1, 3, 5 → 0-based even indices) show the normal (= odd-page) header/footer.
 * When off, every page shows the normal one. The even-page text uses the same
 * sanitizer as the normal header/footer, so it is single-line, control-byte-free
 * and length-clamped at every edge. Composes WITH the first-page config (Word
 * lets both be on at once: page 1 first-page, other evens even, other odds
 * normal).
 */
export interface OddEvenConfig {
  differentOddEven: boolean;
  /** Sanitized even-page header text, or null when unset. */
  evenPageHeader: string | null;
  /** Sanitized even-page footer text, or null when unset. */
  evenPageFooter: string | null;
}

/** Coerce a `differentOddEven` doc attr into a strict boolean. */
export function normalizeDifferentOddEven(value: unknown): boolean {
  return value === true;
}

/**
 * Resolve the raw doc attrs into a normalized {@link OddEvenConfig}. The
 * even-page text is sanitized to null when empty; `differentOddEven` is coerced
 * to a strict boolean. Pure, so the page selector and tests share it.
 */
export function normalizeOddEvenConfig(attrs: {
  differentOddEven?: unknown;
  evenPageHeader?: unknown;
  evenPageFooter?: unknown;
}): OddEvenConfig {
  return {
    differentOddEven: normalizeDifferentOddEven(attrs.differentOddEven),
    evenPageHeader: normalizeHeaderFooterText(attrs.evenPageHeader),
    evenPageFooter: normalizeHeaderFooterText(attrs.evenPageFooter),
  };
}

/** The header/footer text a single printed page shows. */
export interface ResolvedPageBands {
  header: string | null;
  footer: string | null;
}

/**
 * Select which header/footer text a given printed page (0-based index) shows.
 *
 * - When `differentFirstPage` is on, PAGE 0 (the first page) shows the
 *   first-page header/footer (which may be null → no band, Word's bare cover
 *   page) and every other page shows the normal header/footer.
 * - When off, every page shows the normal header/footer.
 *
 * Pure — drives both the on-screen page preview and the unit tests. The normal
 * header/footer are passed already-normalized (null = unset).
 */
export function resolvePageBands(
  pageIndex: number,
  normalHeader: string | null,
  normalFooter: string | null,
  firstPage: FirstPageConfig,
): ResolvedPageBands {
  if (firstPage.differentFirstPage && pageIndex === 0) {
    return {
      header: firstPage.firstPageHeader,
      footer: firstPage.firstPageFooter,
    };
  }
  return { header: normalHeader, footer: normalFooter };
}

/**
 * Select a printed page's header/footer with BOTH first-page and odd/even
 * resolution (the full Word precedence):
 *
 *   1. PAGE 0 with `differentFirstPage` on → the first-page bands (highest
 *      precedence; Word's title page wins over odd/even).
 *   2. otherwise, with `differentOddEven` on, an EVEN page (0-based odd index:
 *      the 2nd, 4th, … printed page) → the even-page bands.
 *   3. otherwise → the normal (= odd-page / default) bands.
 *
 * Pure. The normal + first-page + even-page values are passed already-normalized
 * (null = unset). Falls back to {@link resolvePageBands} behaviour exactly when
 * odd/even is off, so an odd/even-free document is byte-for-byte unchanged.
 */
export function resolvePageBandsWithOddEven(
  pageIndex: number,
  normalHeader: string | null,
  normalFooter: string | null,
  firstPage: FirstPageConfig,
  oddEven: OddEvenConfig,
): ResolvedPageBands {
  if (firstPage.differentFirstPage && pageIndex === 0) {
    return {
      header: firstPage.firstPageHeader,
      footer: firstPage.firstPageFooter,
    };
  }
  // 0-based odd index = the 2nd/4th/… printed page = a Word EVEN page.
  if (oddEven.differentOddEven && pageIndex % 2 === 1) {
    return { header: oddEven.evenPageHeader, footer: oddEven.evenPageFooter };
  }
  return { header: normalHeader, footer: normalFooter };
}

// ---------------------------------------------------------------------------
// RICH bands (Word letterhead parity): paragraph runs + pictures + mini
// tables for header/footer parts the plain text band cannot express. The
// BE projection emits snake_case payloads; the normalizer accepts both
// snake and camel and re-validates EVERY field (types, data: URI prefix,
// positive dims, caps) so a forged persisted value can never smuggle
// markup or unbounded data into the band renderer.
// ---------------------------------------------------------------------------

export interface BandRunFont {
  ascii?: string;
  eastAsia?: string;
  cs?: string;
  hint?: "default" | "eastAsia" | "cs";
  language?: string;
  eastAsiaCharset?: "86" | "88";
}

/**
 * A stored run's font as the band can draw it. A font the validator refuses
 * never costs the run its words: a CSS stack (which the ribbon's font picker
 * once wrote into a header, taking the whole header with it) is read as its
 * first family, and anything else is dropped, the text kept.
 */
export function readableBandRunFont(value: unknown): BandRunFont | null {
  const strict = normalizeBandRunFont(value);
  if (strict || !value || typeof value !== "object" || Array.isArray(value)) return strict;
  const raw = { ...(value as Record<string, unknown>) };
  for (const key of ["ascii", "eastAsia", "cs"] as const) {
    const name = raw[key];
    if (typeof name !== "string") continue;
    const primary = (name.split(",")[0] ?? name).replace(/["']/g, "").trim();
    if (normalizeBandRunFont({ ascii: primary })) raw[key] = primary;
    else delete raw[key];
  }
  return normalizeBandRunFont(raw);
}

/** A resolved native font name is a single family, never a CSS stack or URL. */
export function normalizeBandRunFont(value: unknown): BandRunFont | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (!Object.keys(raw).length || Object.keys(raw).some(key => !["ascii", "eastAsia", "cs", "hint", "language", "eastAsiaCharset"].includes(key))) return null;
  const out: BandRunFont = {};
  for (const key of ["ascii", "eastAsia", "cs"] as const) {
    if (!(key in raw)) continue;
    const name = raw[key];
    // The one font-name rule the band's list fonts use (BAND_LIST_FONT_RE):
    // full-width Latin ("ＭＳ ゴシック") and Hangul names included.
    if (typeof name !== "string" || name !== name.trim() || !BAND_LIST_FONT_RE.test(name)) return null;
    out[key] = name;
  }
  if (!out.ascii && !out.eastAsia && !out.cs) return null;
  if ("hint" in raw) { const hint = normalizeWordFontHint(raw.hint); if (!hint) return null; out.hint = hint; }
  if ("language" in raw) { const language = normalizeWordFontHintLanguage(raw.language); if (!language) return null; out.language = language; }
  if ("eastAsiaCharset" in raw) { const charset = normalizeWordFontHintCharset(raw.eastAsiaCharset); if (!charset) return null; out.eastAsiaCharset = charset; }
  if (out.eastAsiaCharset && !out.eastAsia && !out.ascii) return null;
  return out;
}

/**
 * The fields a header/footer run may be (Word's Header & Footer tab: page
 * number, page count, date, time, and the document information fields).
 * PAGE and NUMPAGES are computed by the page; the rest show their cached
 * text and Word recomputes them on open. The server twin is
 * `document_docx_rich_bands.BAND_FIELD_TOKENS`.
 */
export const BAND_FIELD_TOKENS = [
  "PAGE",
  "NUMPAGES",
  "DATE",
  "TIME",
  "AUTHOR",
  "FILENAME",
  "TITLE",
] as const;
export type BandFieldToken = (typeof BAND_FIELD_TOKENS)[number];

export function isBandFieldToken(value: unknown): value is BandFieldToken {
  return typeof value === "string" && (BAND_FIELD_TOKENS as readonly string[]).includes(value);
}

/** Whether `value` is a format of Word's Date and Time dialog (either
 * language catalog): the picture a band DATE or TIME field may state
 * (server twin `BAND_DATE_PICTURES`). */
export function isBandDatePicture(value: unknown): value is string {
  return typeof value === "string" && DOCUMENT_DATE_TIME_FORMATS.some((format) => format.picture === value);
}

/** Word's instruction for a band field, as `w:fldSimple w:instr` carries it. */
export function bandFieldInstruction(token: BandFieldToken, datePicture?: string): string {
  if (datePicture && (token === "DATE" || token === "TIME")) return ` ${token} \\@ "${datePicture}" `;
  switch (token) {
    case "DATE":
      return ' DATE \\@ "M/d/yyyy" ';
    case "TIME":
      return ' TIME \\@ "h:mm am/pm" ';
    default:
      return ` ${token} `;
  }
}

/** What a band field shows when the page cannot compute it: its cached text. */
export function bandFieldCachedText(token: BandFieldToken, now: Date = new Date(), datePicture?: string): string {
  if (datePicture && (token === "DATE" || token === "TIME")) {
    const chinese = documentDateTimeFormat("zh-CN", datePicture) !== undefined;
    return formatDocumentDateTime(now, datePicture, { locale: chinese ? "zh-CN" : "en-US" });
  }
  switch (token) {
    case "DATE":
      return `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
    case "TIME": {
      const hours = now.getHours() % 12 || 12;
      const minutes = String(now.getMinutes()).padStart(2, "0");
      return `${hours}:${minutes} ${now.getHours() < 12 ? "AM" : "PM"}`;
    }
    case "PAGE":
    case "NUMPAGES":
      return "1";
    default:
      return "";
  }
}

/** A band run's tracked change: its kind and Word's author and date stamp. */
export interface BandRunRevision {
  kind: "ins" | "del";
  author?: string;
  date?: string;
}

/** A run's tracked change as the band keeps it, or null (server twin:
 * normalize_band_run_revision). */
export function normalizeBandRunRevision(value: unknown): BandRunRevision | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.kind !== "ins" && raw.kind !== "del") return null;
  if (Object.keys(raw).some((key) => key !== "kind" && key !== "author" && key !== "date")) return null;
  const out: BandRunRevision = { kind: raw.kind };
  if (typeof raw.author === "string" && raw.author && raw.author.length <= 255) out.author = raw.author;
  if (typeof raw.date === "string" && raw.date && raw.date.length <= 64) out.date = raw.date;
  return out;
}

/** A band run's or line mark's character style id (`w:rStyle`), as stated. */
export function isBandCharStyleId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256 && !/[\u0000-\u001f\u007f]/u.test(value);
}

/** A band line's paragraph mark when it names a character style (`w:pPr/w:rPr`). */
export interface BandRichMarkRun {
  charStyleId: string;
  sizePt?: number;
}

export function normalizeBandRichMarkRun(value: unknown): BandRichMarkRun | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "charStyleId" && key !== "sizePt")) return undefined;
  if (!isBandCharStyleId(record.charStyleId)) return undefined;
  const out: BandRichMarkRun = { charStyleId: record.charStyleId };
  if (record.sizePt !== undefined) {
    const size = record.sizePt;
    if (typeof size !== "number" || size < 4 || size > 96 || !Number.isInteger(size * 2)) return undefined;
    out.sizePt = size;
  }
  return out;
}

export interface BandRichRun {
  /** The run's character style (`w:rStyle`); what it gives the run is on the run too. */
  charStyleId?: string;
  /** Font > Superscript / Subscript (`w:vertAlign`). */
  vertAlign?: "superscript" | "subscript";
  /** Font > Advanced > Spacing (`w:spacing w:val`), in points: expanded or condensed. */
  spacingPt?: number;
  /** Font > Advanced > Scale (`w:w`), in percent: each character this much as wide. */
  scalePct?: number;
  /** The run's highlight or shading fill (Word's `w:highlight` / `w:shd`),
   * painted behind its characters: `#rrggbb`. */
  background?: string;
  /** Font > Text Effects: a body run's `textEffects` mark value (w14 outline,
   * fill, glow, shadow, reflection; the legacy toggles), drawn as the body
   * draws it (`textEffectsCss`). */
  textEffects?: Record<string, unknown>;
  font?: BandRunFont;
  text?: string;
  nativeTextId?: string;
  token?: BandFieldToken;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  sizePt?: number;
  color?: string;
  /** The anchored text box (see {@link BandRichFrame}) that draws this run. */
  frame?: number;
  /**
   * Content of Word's own header/footer part that is not a text slot -- a
   * field result, a tab, a symbol -- named `p{block}:q{paragraph}:a{n}` (its
   * paragraph and its place among that paragraph's atoms). The story editor
   * shows it and moves past it; it is never typed into, restyled or removed.
   */
  nativeAtom?: string;
  /**
   * For Word's content that is not a text slot: the run of Word's line it is
   * the last thing drawn from -- a tab's run, the run that ends a complex
   * field -- when a run MRAI writes may follow that run, named
   * `p{block}:q{paragraph}:r{run}` (the line, and the run's place among the
   * line's own `w:r`). Text typed right after it is written after that run,
   * starting from its run properties (the server's `native_story_run_anchors`).
   */
  nativeAnchor?: string;
  /**
   * For a field of Word's own line the story may remove whole (a page
   * number, a date, a document property; Word's Delete on a selected field
   * takes its code and its result together, ECMA-376 17.16.1): the field's
   * id, `p{block}:q{paragraph}:f{n}` (its place among the line's removable
   * fields; the server's `native_story_fields`). Removing the content that
   * carries it removes the field from the part (`deletedFields`).
   */
  nativeField?: string;
  /** For such a field that is a page number (PAGE, NUMPAGES, SECTIONPAGES):
   * the number format its instruction states (`none`: no switch, Word's
   * Arabic). Changing it writes the field's `\* <format>` switch. */
  nativeFieldFormat?: NativeFieldNumberFormat | "none";
  /** For such a field: the field as Word stores it (its code, flags and
   * result runs; the server's document_docx_preserved_fields.py checks and
   * writes it). Opaque here: carried so a DOCX built from scratch writes the
   * field back, not its cached text. */
  nativeFieldCode?: Record<string, unknown>;
  /** For a DATE or TIME field: the Date and Time dialog's format, which the
   * field's `\\@` switch states. Absent: Word's M/d/yyyy (h:mm am/pm). */
  datePicture?: string;
  /** For a PAGE or NUMPAGES field of a story MRAI writes (not Word's own
   * part): its number format (Edit Field > Format, the instruction's
   * `\* <format>` switch). Absent: Arabic. */
  fieldFormat?: NativeFieldNumberFormat;
  /** A tracked change of Word's line (`w:ins` / `w:del`): drawn as Word's
   * All Markup draws it, and written back as the revision it is. */
  revision?: BandRunRevision;
  /** A field MRAI inserted into Word's own part (SECTIONPAGES, STYLEREF,
   * DOCPROPERTY); the run's text is the result it shows until Word updates
   * it. Written as Word's complex field. */
  nativeNewField?: NativeNewField;
  /** For a text slot that shares its `w:r` with other slots: the run's first
   * slot. The slots of one run have one run properties, so they are
   * formatted together or not at all. */
  nativeRunGroup?: string;
  /** For a text slot whose run sits inside a hyperlink (`link`) or a
   * content control, a smart tag or similar wrapper (`box`): its text stays
   * where Word put it. */
  nativeWrapped?: "box" | "link";
  /** For text MRAI wrote into Word's part: the slot whose complete run
   * properties it keeps (text moved out of that slot, or typed after it). */
  nativeFrom?: string;
  /** Word's absolute position tab (`w:ptab`): the run is its one tab
   * character, laid out at the point this names (see {@link PositionalTab})
   * instead of at the paragraph's next stop. */
  ptab?: PositionalTab;
}

/** One axis of a Word `wp:anchor` position: an origin plus an offset or an alignment. */
export interface BandRichFrameAxis {
  relativeFrom: string;
  offsetEmu?: number;
  align?: string;
}

/**
 * An anchored text box a header/footer paragraph floats. Its words stay in
 * the paragraph's run order (the native text authority keys runs by index)
 * and are only tagged with `frame`; the band draws the tagged runs inside
 * this box at the position Word gives it.
 */
export interface BandRichFrame {
  index: number;
  horizontal: BandRichFrameAxis;
  vertical: BandRichFrameAxis;
  widthEmu: number;
  heightEmu: number;
  insetsEmu: [number, number, number, number];
  align: "left" | "center" | "right";
  behindText: boolean;
  relativeHeight: number;
  line?: BandRichLine;
  /**
   * The box's OWN story, when it is one the host paragraph's run list cannot
   * hold: a `w:txbxContent` whose content is a table (a letterhead grid). It
   * is the same block model the band's top level uses, one level deep, and a
   * frame states EITHER this or tagged runs — never both, because one story
   * has one owner (docs/office-graphics/SHAPE-IMPORT-AUDIT.md §46.5, §48).
   */
  blocks?: BandRichBlock[];
  /** For a text box of Word's own line whose words are the line's runs: its
   * object id, by which the story resizes it or removes it whole
   * (`isNativeBandObjectId`). Never with `blocks`. */
  nativeObject?: string;
  /**
   * The box's own fill and line, in the spelling the body's `textBox` node
   * uses (`lib/document-borders`: `normalizeDocumentTextBoxFill`,
   * `normalizeDocumentTextBoxOutline`): a colour, the shared gradient or a
   * picture (stretched or tiled), and a border style with its width and
   * colour.
   */
  textBoxFill?: { color: string; gradient?: OfficeShapeGradient; picture?: DocumentTextBoxPictureFill };
  textBoxOutline?: { style: string; sizePt?: number; color?: string };
  /** For a box Word sizes to its words (`a:spAutoFit`): the height is only a
   * floor. */
  autoHeight?: true;
  /** For a box Word sizes to its words both ways (it resizes to its text,
   * does not wrap it and was saved with no size): the width is the one it
   * was read at, and the band fits the box to its words (a centred PAGE box
   * stays centred whatever the number). Only with `autoHeight`. */
  autoWidth?: true;
  /** For a turned legacy VML box: Word turns the box, never its words
   * (`floatAnchor.rotation` places the box, its words stay upright). */
  textUpright?: true;
  /** Where the box's words stand in it (Format Shape > Text Box > Vertical
   * alignment, `a:bodyPr anchor` / VML `v-text-anchor`): `ctr` in its middle,
   * `b` at its foot, inside its insets; at its top when not stated. */
  wordsAnchor?: "ctr" | "b";
  /** With `wordsAnchor`: the words' paragraph's space before and after, in
   * points, which the block set in the box's middle or at its foot holds. */
  wordsSpacePt?: [number, number];
  /** Insert > WordArt: the box's words bent by this warp (the one value the
   * editors share, as the body's `frameBody.warp`), painted by the shared
   * warp painter over the box (corpus R471-D27's letterhead). */
  textWarp?: OfficeTextWarp;
  /** For a box that draws `blocks`: how many of the line's runs stand before
   * it. */
  runsBefore?: number;
  /** For an ANCHORED box: the whole `wp:anchor` it was read with
   * (`normalizeFloatAnchor`) -- the wrap and distances the two axes above do
   * not hold. The band draws from the axes; the export writes this. */
  floatAnchor?: FloatAnchor;
  /** For an anchored box drawn at an EARLIER paragraph of the band, that many
   * blocks back (negative): a linked chain whose head holds no line shows
   * its story in the box that paragraph anchors (the server's
   * `_band_head_continuation`). */
  anchorParagraph?: number;
  /** The box paragraph's own style, which the export writes its words in. */
  docxStyleId?: string;
  /**
   * Word's "In Line with Text": the box takes a place in its line instead of
   * floating. It has no origin, wrap or z-order of its own, so its axes are
   * the one fixed statement "its own character, in its own line"
   * (`BAND_INLINE_FRAME_PLACEMENT`) and the band draws it in the line's flow,
   * as the body draws an in-line `textBox` frame.
   */
  inline?: true;
}

/** What an in-line frame states where an anchored one states its placement
 * (the server's `_INLINE_FRAME_PLACEMENT`). */
const BAND_INLINE_FRAME_PLACEMENT = {
  horizontal: { relativeFrom: "character", offsetEmu: 0 },
  vertical: { relativeFrom: "line", offsetEmu: 0 },
} as const;
const BAND_FRAME_OUTLINE_STYLES = new Set(["single", "double", "dotted", "dashed", "nil"]);

/** Whether a frame draws something of its own with no words in it: a fill
 * that is not "none", or a line that is not turned off (the server's
 * `band_frame_is_painted`). */
export function bandFrameIsPainted(frame: Pick<BandRichFrame, "textBoxFill" | "textBoxOutline">): boolean {
  const fill = frame.textBoxFill;
  const outline = frame.textBoxOutline;
  return Boolean(
    fill?.picture || fill?.gradient || (fill && fill.color !== "none") || (outline && outline.style !== "nil"),
  );
}

type BandFrameExtras = Pick<
  BandRichFrame,
  | "textBoxFill"
  | "textBoxOutline"
  | "autoHeight"
  | "autoWidth"
  | "textUpright"
  | "wordsAnchor"
  | "wordsSpacePt"
  | "textWarp"
  | "runsBefore"
  | "floatAnchor"
  | "inline"
  | "anchorParagraph"
  | "docxStyleId"
>;

/**
 * What a frame states beyond its placement -- its paint, where its own story
 * stands in the line, the anchor it was read with, and that it sits in its
 * line -- checked exactly as the server checks it
 * (`document_docx_rich_bands._normalize_frame_paint` /
 * `_normalize_inline_frame`): the extra keys, or `null` for a frame that
 * states one of them wrongly.
 */
function normalizeBandFrameExtras(
  frame: Record<string, unknown>,
  placed: Pick<BandRichFrame, "horizontal" | "vertical" | "behindText" | "relativeHeight">,
): BandFrameExtras | null {
  const out: BandFrameExtras = {};
  if (frame.autoHeight !== undefined) {
    if (frame.autoHeight !== true) return null;
    out.autoHeight = true;
  }
  if (frame.autoWidth !== undefined) {
    if (frame.autoWidth !== true || frame.autoHeight !== true) return null;
    out.autoWidth = true;
  }
  if (frame.textUpright !== undefined) {
    if (frame.textUpright !== true) return null;
    out.textUpright = true;
  }
  if (frame.wordsAnchor !== undefined) {
    if (frame.wordsAnchor !== "ctr" && frame.wordsAnchor !== "b") return null;
    out.wordsAnchor = frame.wordsAnchor;
  }
  if (frame.wordsSpacePt !== undefined) {
    const space = frame.wordsSpacePt;
    if (out.wordsAnchor === undefined || !Array.isArray(space) || space.length !== 2 ||
        space.some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1584)) return null;
    out.wordsSpacePt = [space[0] as number, space[1] as number];
  }
  if (frame.textWarp !== undefined) {
    // As the server's `_normalize_frames`: a warp the shared value refuses
    // (or `textNoShape`, which bends nothing) is not a frame this band states.
    let warp: OfficeTextWarp | null = null;
    try {
      warp = normalizeOfficeTextWarp(frame.textWarp);
    } catch {
      warp = null;
    }
    if (!warp) return null;
    out.textWarp = warp;
  }
  if (frame.textBoxFill !== undefined) {
    const fill = frame.textBoxFill as Record<string, unknown> | null;
    if (!fill || typeof fill !== "object") return null;
    if (Object.keys(fill).some((key) => key !== "color" && key !== "gradient" && key !== "picture")) return null;
    if (typeof fill.color !== "string" || !(fill.color === "none" || /^#[0-9a-f]{6}$/.test(fill.color))) return null;
    out.textBoxFill = { color: fill.color };
    if (fill.picture !== undefined) {
      // A picture is paint the frame draws INSTEAD of a colour, read by the
      // body text box's own normalizer.
      if (fill.color !== "none" || fill.gradient !== undefined) return null;
      const picture = normalizeDocumentTextBoxFill({ color: "none", picture: fill.picture })?.picture;
      if (!picture) return null;
      out.textBoxFill.picture = picture;
    }
    if (fill.gradient !== undefined) {
      if (fill.color === "none") return null;
      try {
        const gradient = normalizeOfficeShapeGradient(fill.gradient);
        if (!gradient) return null;
        out.textBoxFill.gradient = gradient;
      } catch {
        return null;
      }
    }
  }
  if (frame.textBoxOutline !== undefined) {
    const outline = frame.textBoxOutline as Record<string, unknown> | null;
    if (!outline || typeof outline !== "object") return null;
    if (Object.keys(outline).some((key) => key !== "style" && key !== "sizePt" && key !== "color")) return null;
    if (typeof outline.style !== "string" || !BAND_FRAME_OUTLINE_STYLES.has(outline.style)) return null;
    const line: NonNullable<BandRichFrame["textBoxOutline"]> = { style: outline.style };
    if (outline.sizePt !== undefined) {
      if (typeof outline.sizePt !== "number" || !Number.isFinite(outline.sizePt) || outline.sizePt < 0 || outline.sizePt > 96) return null;
      line.sizePt = outline.sizePt;
    }
    if (outline.color !== undefined) {
      if (typeof outline.color !== "string" || !/^#[0-9a-f]{6}$/.test(outline.color)) return null;
      line.color = outline.color;
    }
    out.textBoxOutline = line;
  }
  if (frame.runsBefore !== undefined) {
    const at = frame.runsBefore;
    if (!Array.isArray(frame.blocks) || typeof at !== "number" || !Number.isInteger(at) || at < 0 || at > 4096) return null;
    out.runsBefore = at;
  }
  if (frame.docxStyleId !== undefined) {
    // As a band paragraph's (`document_docx_rich_bands`): 1..256 characters,
    // no control character; Normal is the default and is not stated.
    const style = frame.docxStyleId;
    if (typeof style !== "string" || !style || style.length > 256 || /[\u0000-\u001f\u007f]/.test(style)) return null;
    if (style !== "Normal") out.docxStyleId = style;
  }
  if (frame.anchorParagraph !== undefined) {
    const back = frame.anchorParagraph;
    if (
      frame.inline !== undefined ||
      typeof back !== "number" ||
      !Number.isInteger(back) ||
      back < -64 ||
      back > -1 ||
      (placed.vertical.relativeFrom !== "paragraph" && placed.vertical.relativeFrom !== "line")
    ) {
      return null;
    }
    out.anchorParagraph = back;
  }
  if (frame.inline === undefined) {
    if (frame.floatAnchor !== undefined) {
      const anchor = normalizeFloatAnchor(frame.floatAnchor);
      if (!anchor) return null;
      out.floatAnchor = anchor;
    }
    return out;
  }
  if (frame.inline !== true || frame.nativeObject !== undefined || frame.floatAnchor !== undefined) return null;
  const same = (axis: BandRichFrameAxis, fixed: { relativeFrom: string; offsetEmu: number }) =>
    axis.relativeFrom === fixed.relativeFrom && axis.offsetEmu === fixed.offsetEmu && axis.align === undefined;
  if (
    !same(placed.horizontal, BAND_INLINE_FRAME_PLACEMENT.horizontal) ||
    !same(placed.vertical, BAND_INLINE_FRAME_PLACEMENT.vertical) ||
    placed.behindText ||
    placed.relativeHeight !== 0
  ) {
    return null;
  }
  out.inline = true;
  return out;
}

export interface BandRichImage {
  src: string;
  widthEmu?: number;
  heightEmu?: number;
  /** For a picture of Word's own line: its object id, by which the story
   * resizes or removes it in the part (`isNativeBandObjectId`). */
  nativeObject?: string;
  /** An anchored picture's `wp:anchor` reading (`normalizeFloatAnchor`): it
   * is placed on the band's axes as an anchored band shape is, never in the
   * line (a page-sized behind-text picture in the line made the header a
   * page tall). An anchored picture is placed, not sized by its line, so it
   * carries no `nativeObject`. */
  floatAnchor?: FloatAnchor;
  /** Word's Washout on the picture (a picture watermark's pale look). */
  washout?: true;
  /** An in-line picture's place among its line's runs: how many of the
   * line's `runs` come before it (absent: after all of them). A letterhead
   * logo after a date and a run of spaces stands at the right of that line
   * (corpus R436-D23). */
  runsBefore?: number;
  /** The picture's `a:srcRect` cut, in Word's thousandths of a percent per
   * edge (`t`, `r`, `b`, `l`; only edges that cut): the band draws the kept
   * window stretched over the picture's extent (R432-D16's header and footer
   * are the top and the bottom of one full-page template picture). */
  crop?: BandRichImageCrop;
}

export interface BandRichImageCrop {
  t?: number;
  r?: number;
  b?: number;
  l?: number;
}

/** A band picture's crop as the API states it (`normalize_band_picture_crop`),
 * or null when it does not read. */
export function normalizeBandRichImageCrop(value: unknown): BandRichImageCrop | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const keys = Object.keys(raw);
  if (keys.length === 0 || keys.some((key) => key !== "t" && key !== "r" && key !== "b" && key !== "l")) return null;
  const out: BandRichImageCrop = {};
  for (const edge of ["t", "r", "b", "l"] as const) {
    if (!(edge in raw)) continue;
    const cut = raw[edge];
    if (typeof cut !== "number" || !Number.isInteger(cut) || cut < 1 || cut > 99_999) return null;
    out[edge] = cut;
  }
  if ((out.t ?? 0) + (out.b ?? 0) >= 100_000 || (out.l ?? 0) + (out.r ?? 0) >= 100_000) return null;
  return out;
}

/**
 * WordArt a header/footer paragraph draws — on this machine's corpus always a
 * watermark Word wrote as `<v:shape type="#_x0000_t136">` with a
 * `<v:textpath>`. It is NOT a {@link BandRichFrame}: a frame is a place for
 * RUNS (each run is tagged with the box that draws it) and a WordArt shape
 * owns no runs at all — its string is an attribute of the text path.
 *
 * `warp` is an `ST_TextShapeType` token the shared `office-text-warp`
 * primitive draws. A warp it cannot draw never reaches here: the object stays
 * preserved in the package and keeps its named import receipt, because a warp
 * drawn on a curve nobody measured is a different picture.
 */
export interface BandRichWordArt {
  index: number;
  text: string;
  warp: string;
  horizontal: BandRichFrameAxis;
  vertical: BandRichFrameAxis;
  widthEmu: number;
  heightEmu: number;
  behindText: boolean;
  relativeHeight: number;
  /** `a:xfrm/@rot` in 60000ths of a degree; a watermark is 315°. */
  rotation: number;
  fontFamily?: string;
  fontSizePt?: number;
  bold?: boolean;
  italic?: boolean;
  fill?: string;
  fillOpacity?: number;
  outline?: string;
}

/**
 * One drawing a header/footer paragraph holds, in the ONE spelling every Docs
 * shape reaches a page in — `documentShape`'s own attrs, produced by
 * `projection_to_page._docx_shape_attrs` and painted by the editor's own
 * `paintShape`. It sits "In Line with Text" after the line's runs, or — with a
 * `floatAnchor` — where its `wp:anchor` places it, on the same axes a band
 * frame and a band WordArt are placed by. A GROUP (a `wpg:wgp`, or a drawing
 * canvas held as one) carries its members in its own child space, exactly as
 * a body group does (docs/office-graphics/SHAPE-IMPORT-AUDIT.md §60).
 */
/** A chart a header/footer line holds: a Docs chart node's attrs. */
export type BandRichChart = Readonly<Record<string, unknown>>;

/** At most this many charts per band line (the server's own bound). */
const BAND_RICH_MAX_CHARTS = 4;

/** The charts a band line holds, carried as the server wrote them: the chart
 * contract is the server's (`normalize_document_chart_attrs`), and the picture
 * is drawn by the one chart planner from exactly these attrs. */
function normalizeBandRichCharts(raw: unknown): BandRichChart[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, BAND_RICH_MAX_CHARTS)
    .filter(
      (entry): entry is BandRichChart =>
        Boolean(entry) &&
        typeof entry === "object" &&
        !Array.isArray(entry) &&
        typeof (entry as Record<string, unknown>).chartType === "string",
    );
}

export type BandRichShape = DocumentShapeAttrs & {
  /** For a shape of Word's own line: its object id, by which the story
   * resizes or removes it in the part (`isNativeBandObjectId`). Only an
   * in-line leaf carries one. */
  nativeObject?: string;
  /** For a group of Word's own line: its group id, by which the story retypes
   * its members' words in the part (`isNativeBandGroupId`; `memberWords` of
   * the story's native edits). Only a group carries one. */
  nativeGroup?: string;
  /** An anchored drawing's `wp:anchor` reading (`normalizeFloatAnchor`). */
  floatAnchor?: FloatAnchor;
  /** …and its place in the floating stack. */
  relativeHeight?: number;
};

/** A direct tab stop of a band paragraph (Word's `w:tab`), in twips. */
export interface BandRichTabStop {
  pos: number;
  align: "left" | "center" | "right" | "decimal";
  leader: "none" | "dot" | "hyphen" | "underscore";
}

/**
 * A header/footer line that is a list item (Word's `w:numPr`: Home > Bullets,
 * Numbering and Multilevel List act in a header or footer exactly as in the
 * body, ECMA-376 17.9). Word counts a header's list in the header's own story
 * -- every page's header shows "1. 2." again, whatever the body's lists with
 * the same definition have reached (measured, Word 16 for Mac) -- so a band
 * line names its list by what draws its marker, never by a numbering instance
 * of the package:
 *
 * - `kind` / `level`: bullet or number, at `w:ilvl` 0-8;
 * - `style`: the gallery entry the marker is drawn from -- a bullet glyph
 *   (`office-list-catalog`, default `disc`) or an ordered scheme
 *   (`listNumbering.LIST_STYLE_TYPES`, default `decimal`); the default is
 *   stated by its absence;
 * - `start`: the number a numbered list's first line shows (Word's `w:start`,
 *   or where an imported list's count stands at that line), absent for 1;
 * - `glyph` / `font`: a bullet outside the gallery (Define New Bullet: any
 *   character of any font), drawn as itself.
 *
 * The server twin is `document_docx_rich_bands.normalize_band_list`.
 */
export interface BandRichList {
  kind: "bullet" | "ordered";
  level: number;
  style?: string;
  start?: number;
  glyph?: string;
  font?: string;
  /** The Word count a numbered line advances: the num instances of one
   * abstract definition count as one list in the story ("3." for a second
   * `w:numId` after "1." and "2."), whatever lines stand between. */
  chain?: string;
  /** The line starts its chain's count again at `start` (the first item of
   * an instance with a `w:startOverride`, after earlier items of the chain). */
  restart?: true;
  /** Word's level text when it holds words of its own ("<%1.>"), with the
   * level's number format: the marker drawn as Word draws it. */
  levelText?: string;
  format?: string;
}

const BAND_LIST_CHAIN_RE = /^[A-Za-z0-9:_-]{1,64}$/;

const BAND_LIST_FONT_RE = /^[A-Za-z0-9À-ɏ　-ヿ㐀-䶿一-鿿豈-﫿０-９Ａ-Ｚａ-ｚ가-힣 ._+-]{1,64}$/;
/** Word's bullet library by level: dot, circle, square, repeating. */
export const BAND_BULLET_LEVEL_GLYPHS = ["disc", "circle", "square"] as const;

/** A band line's list membership as the model keeps it, or null when the
 * value is not one (an unknown style, a level past Word's nine, a number
 * outside Word's range, a glyph that is not one or a few characters). */
export function normalizeBandRichList(value: unknown): BandRichList | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some((key) => !["kind", "level", "style", "start", "glyph", "font", "chain", "restart", "levelText", "format"].includes(key))) return null;
  const kind = raw.kind;
  const level = raw.level;
  if (kind !== "bullet" && kind !== "ordered") return null;
  if (typeof level !== "number" || !Number.isInteger(level) || level < 0 || level > 8) return null;
  const out: BandRichList = { kind, level };
  if (raw.style !== undefined) {
    const styles: readonly string[] = kind === "bullet" ? OFFICE_BULLET_STYLE_TYPES : LIST_STYLE_TYPES;
    if (typeof raw.style !== "string" || !styles.includes(raw.style)) return null;
    // The default marker is stated by its absence: Word's default numbering
    // for a number, and for a bullet the glyph Word's bullet library gives
    // the level (dot, circle, square, repeating).
    const fallback = kind === "bullet" ? BAND_BULLET_LEVEL_GLYPHS[level % 3] : "decimal";
    if (raw.style !== fallback) out.style = raw.style;
  }
  if (raw.start !== undefined) {
    if (kind !== "ordered" || typeof raw.start !== "number" || !Number.isInteger(raw.start) || raw.start < 0 || raw.start > 10_000) {
      return null;
    }
    if (raw.start !== 1) out.start = raw.start;
  }
  if (raw.glyph !== undefined) {
    const glyph = raw.glyph;
    if (
      kind !== "bullet" ||
      out.style !== undefined ||
      typeof glyph !== "string" ||
      Array.from(glyph).length < 1 ||
      Array.from(glyph).length > 4 ||
      /[\u0000-\u001f\u007f%]/u.test(glyph)
    ) {
      return null;
    }
    out.glyph = glyph;
  }
  if (raw.font !== undefined) {
    if (out.glyph === undefined || typeof raw.font !== "string" || !BAND_LIST_FONT_RE.test(raw.font)) return null;
    out.font = raw.font;
  }
  if (raw.chain !== undefined) {
    if (kind !== "ordered" || typeof raw.chain !== "string" || !BAND_LIST_CHAIN_RE.test(raw.chain)) return null;
    out.chain = raw.chain;
  }
  if (raw.restart !== undefined) {
    if (raw.restart !== true || out.chain === undefined) return null;
    out.restart = true;
  }
  if (raw.levelText !== undefined || raw.format !== undefined) {
    const text = raw.levelText;
    if (
      kind !== "ordered" ||
      typeof text !== "string" ||
      text.length < 1 ||
      text.length > 64 ||
      /[\u0000-\u001f\u007f]/u.test(text) ||
      [...text.matchAll(/%([1-9])/g)].some((match) => Number(match[1]) > level + 1) ||
      text.replace(/%[1-9]/g, "").includes("%") ||
      typeof raw.format !== "string" ||
      !(LIST_LEVEL_FORMATS as readonly string[]).includes(raw.format) ||
      raw.format === "bullet" ||
      raw.format === "none"
    ) {
      return null;
    }
    out.levelText = text;
    out.format = raw.format;
  }
  return out;
}

export interface BandRichParagraph {
  type: "paragraph";
  /** The `w:p` of Word's own part this line is (`p{block}:q{paragraph}`):
   * an edit to the line is written into that paragraph of the part. */
  nativeParagraphId?: string;
  /** What removing this line depends on: the blocks of Word's part it stands
   * among, a line by its id and anything else as `T`; absent when the line
   * holds what removing it would lose (a bookmark, a hyperlink, a field). */
  nativeRemovable?: string;
  /** For a line MRAI added to Word's part: the line whose paragraph
   * properties it was made from (Enter copies them). */
  nativeFrom?: string;
  /** A line of Word's page-number building block (a content control from
   * the "Page Numbers" gallery): what Remove Page Numbers takes away. */
  pageNumberBlock?: true;
  /**
   * The line's text frame (`w:framePr`), as Word states it: twips and Word's
   * own tokens. Word lays a framed line out of the flow -- a footer's framed
   * page number takes no line of its own (corpus R21-D04).
   */
  textFrame?: BandRichTextFrame;
  /** The line's paragraph mark, when it names a character style (`w:pPr/w:rPr`). */
  markRun?: BandRichMarkRun;
  spaceBeforePt?: number;
  spaceAfterPt?: number;
  docxStyleId?: string;
  contextualSpacing?: true;
  /** Left is the absence of a value, as the paragraph model reads `w:jc`. */
  align?: "center" | "right" | "justify";
  /** Direct tab stops, so a typed header line can hold Word's centre and
   * right stops (the Header style's own) as its own paragraph property. */
  tabStops?: BandRichTabStop[];
  indentLeftPt?: number;
  indentRightPt?: number;
  firstLineIndentPt?: number;
  /** The list this line is an item of; see {@link BandRichList}. */
  list?: BandRichList;
  runs: BandRichRun[];
  images?: BandRichImage[];
  paragraphBorders?: DocumentParagraphBorders;
  /** The paragraph's fill (`w:pPr/w:shd`, else its style's), `#rrggbb`: a
   * running head of white words on a red bar (corpus R436-D25). */
  shading?: string;
  /** Word's horizontal line the paragraph hosts: the body paragraph's own
   * `wordHorizontalRule` (lib/document-word-horizontal-rule.ts). */
  wordHorizontalRule?: WordHorizontalRule;
  frames?: BandRichFrame[];
  wordArt?: BandRichWordArt[];
  /** See {@link BandRichShape}. Drawn after the paragraph's runs, exactly
   * where a band picture is drawn and for the same reason: neither is a run. */
  shapes?: BandRichShape[];
  /** The charts of the line ("In Line with Text"), each a Docs chart node's
   * attrs as the server's one chart projector made them; drawn after the
   * paragraph's runs, where its pictures and drawings are. */
  charts?: BandRichChart[];
  /** Word's line-box inputs; see {@link BandRichLine}. */
  lineHeight?: number;
  lineHeightPt?: number;
  lineHeightRule?: "exact" | "atLeast";
  lineSizePt?: number;
  lineFont?: string;
}

/**
 * What Word sizes a line from: the paragraph's `w:spacing` (a multiple, or an
 * exact / at-least height), the tallest run's size, and that run's face. The
 * band turns these into Word's line height with the same single-line metrics
 * the footnote rows use, instead of one generic CSS line height.
 */
export type BandRichLine = Pick<
  BandRichParagraph,
  "lineHeight" | "lineHeightPt" | "lineHeightRule" | "lineSizePt" | "lineFont"
>;

/**
 * A border Word states on one side of a band table or cell (`w:tblBorders` /
 * `w:tcBorders`): its line style, width in eighths of a point, space and
 * colour (`auto` or `RRGGBB`), kept as stated so a save writes it back.
 */
export interface BandRichBorder {
  val: string;
  sz?: number;
  space?: number;
  color?: string;
}
export type BandRichBorders = Partial<
  Record<"top" | "left" | "bottom" | "right" | "insideH" | "insideV", BandRichBorder>
>;
/** A band table row's height (`w:trHeight`): at least, or exactly, this many twips. */
export interface BandRichRowHeight {
  twips: number;
  rule: "atLeast" | "exact";
}

const BAND_TABLE_BORDER_SIDES = ["top", "left", "bottom", "right", "insideH", "insideV"] as const;
const BAND_CELL_BORDER_SIDES = ["top", "left", "bottom", "right"] as const;

/** The server's `normalize_band_borders`: `undefined` unless every side is one. */
export function normalizeBandRichBorders(
  value: unknown,
  sides: readonly string[] = BAND_TABLE_BORDER_SIDES,
): BandRichBorders | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) return undefined;
  const out: Record<string, BandRichBorder> = {};
  for (const [side, raw] of entries) {
    if (!sides.includes(side) || !raw || typeof raw !== "object") return undefined;
    const record = raw as Record<string, unknown>;
    if (Object.keys(record).some((key) => !["val", "sz", "space", "color"].includes(key))) return undefined;
    if (typeof record.val !== "string" || !/^[A-Za-z]{1,40}$/.test(record.val)) return undefined;
    const border: BandRichBorder = { val: record.val };
    for (const [key, high] of [["sz", 96], ["space", 31]] as const) {
      if (record[key] === undefined) continue;
      const number = record[key];
      if (typeof number !== "number" || !Number.isInteger(number) || number < 0 || number > high) return undefined;
      border[key] = number;
    }
    if (record.color !== undefined) {
      if (typeof record.color !== "string" || !(record.color === "auto" || /^[0-9A-F]{6}$/.test(record.color))) return undefined;
      border.color = record.color;
    }
    out[side] = border;
  }
  return out as BandRichBorders;
}

/** The server's `normalize_band_row_heights`: one entry per row, or `undefined`. */
export function normalizeBandRichRowHeights(value: unknown, rows: number): (BandRichRowHeight | null)[] | undefined {
  if (!Array.isArray(value) || value.length !== rows) return undefined;
  const out: (BandRichRowHeight | null)[] = [];
  for (const raw of value) {
    if (raw === null) { out.push(null); continue; }
    const record = raw as Record<string, unknown> | undefined;
    if (
      !record || typeof record !== "object" || Object.keys(record).length !== 2 ||
      typeof record.twips !== "number" || !Number.isInteger(record.twips) || record.twips <= 0 || record.twips > 31_680 ||
      (record.rule !== "atLeast" && record.rule !== "exact")
    ) return undefined;
    out.push({ twips: record.twips, rule: record.rule });
  }
  return out.some((height) => height !== null) ? out : undefined;
}

export interface BandRichTextFrame {
  w?: number;
  h?: number;
  x?: number;
  y?: number;
  hSpace?: number;
  vSpace?: number;
  hRule?: "auto" | "atLeast" | "exact";
  hAnchor?: "text" | "margin" | "page";
  vAnchor?: "text" | "margin" | "page";
  xAlign?: "left" | "center" | "right" | "inside" | "outside";
  yAlign?: "inline" | "top" | "center" | "bottom" | "inside" | "outside";
  wrap?: "auto" | "notBeside" | "around" | "tight" | "through" | "none";
}

const BAND_TEXT_FRAME_INTS = ["w", "h", "x", "y", "hSpace", "vSpace"] as const;
const BAND_TEXT_FRAME_TOKENS: Record<string, readonly string[]> = {
  hRule: ["auto", "atLeast", "exact"],
  hAnchor: ["text", "margin", "page"],
  vAnchor: ["text", "margin", "page"],
  xAlign: ["left", "center", "right", "inside", "outside"],
  yAlign: ["inline", "top", "center", "bottom", "inside", "outside"],
  wrap: ["auto", "notBeside", "around", "tight", "through", "none"],
};

/** The server's `normalize_band_text_frame`: `undefined` unless it is one. */
export function normalizeBandRichTextFrame(value: unknown): BandRichTextFrame | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, raw] of entries) {
    if ((BAND_TEXT_FRAME_INTS as readonly string[]).includes(key)) {
      if (typeof raw !== "number" || !Number.isInteger(raw) || raw < -31_680 || raw > 31_680) return undefined;
    } else if (!(key in BAND_TEXT_FRAME_TOKENS) || typeof raw !== "string" || !BAND_TEXT_FRAME_TOKENS[key].includes(raw)) {
      return undefined;
    }
    out[key] = raw;
  }
  return out as BandRichTextFrame;
}

export interface BandRichTableCell {
  paragraphs?: BandRichParagraph[];
  /** Borders and Shading > Borders of the cell (`w:tcBorders`). */
  borders?: BandRichBorders;
  /** Tables nested in the cell, one level deep, each drawn after the first
   * `at` of the cell's paragraphs (Word lays a table out in a cell like any
   * block: corpus R13-D31's header title bar). Their words are theirs, not
   * the cell's `text`. */
  tables?: { at: number; table: BandRichTable }[];
  align?: "center" | "right";
  cellMargin?: CellMargins;
  verticalAlign?: "top" | "center" | "bottom";
  /** Borders and Shading > Shading fill (`w:tcPr/w:shd@w:fill`), `#rrggbb`. */
  shading?: string;
  row: number;
  col: number;
  text: string;
  runs?: BandRichRun[];
  colspan?: number;
  rowspan?: number;
}

export interface BandRichTableFloat {
  horzAnchor: "page" | "margin" | "column";
  vertAnchor: "page" | "margin";
  xTwips?: number;
  xAlign?: "left" | "center" | "right";
  yTwips: number;
  /** Distances from the body text: top, right, bottom, left. */
  distTwips: [number, number, number, number];
}

/** A band table's page placement as the server reads it, or null. */
export function normalizeBandRichTableFloat(value: unknown): BandRichTableFloat | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const twips = (raw: unknown, low: number) =>
    typeof raw === "number" && Number.isInteger(raw) && raw >= low && raw <= 32_767 ? raw : null;
  const horizontal = record.horzAnchor;
  const vertical = record.vertAnchor;
  const y = twips(record.yTwips, -32_767);
  const distances = Array.isArray(record.distTwips) ? record.distTwips.map((distance) => twips(distance, 0)) : null;
  if (
    (horizontal !== "page" && horizontal !== "margin" && horizontal !== "column") ||
    (vertical !== "page" && vertical !== "margin") ||
    y === null ||
    !distances || distances.length !== 4 || distances.some((distance) => distance === null)
  ) return null;
  const out: BandRichTableFloat = {
    horzAnchor: horizontal,
    vertAnchor: vertical,
    yTwips: y,
    distTwips: distances as [number, number, number, number],
  };
  const x = twips(record.xTwips, -32_767);
  if (x !== null) out.xTwips = x;
  else if (record.xAlign === "left" || record.xAlign === "center" || record.xAlign === "right") out.xAlign = record.xAlign;
  else return null;
  return out;
}

export interface BandRichTable {
  type: "table";
  rows: number;
  cols: number;
  cells: BandRichTableCell[];
  columnWidthsPx?: number[];
  nativeColumnWidthsTwips?: number[];
  /**
   * Column widths as a percentage of the table, for a table Word sized with
   * `w:tblW w:type="pct"`. The absolute `w:tblGrid` such a table carries is
   * the grid cached at its width when saved, not the width it takes in this
   * band -- resolving the percentages against the real band width is what
   * Word does.
   */
  columnWidthsPct?: number[];
  tableAlign?: "center" | "right";
  /** Table direction: Right-to-left (`w:bidiVisual`): Word runs the columns
   * from the right, the first cell on the right (corpus R350-D01). */
  bidiVisual?: true;
  /** Indent from left (`w:tblInd`, twips; negative into the margin): Word
   * stands the table's leading edge (the right one when `bidiVisual`) that
   * far in from the margin (corpus R400-D05's footer table, -3835). */
  tableIndentTwips?: number;
  /** Text Wrapping: Around placed from the page or margin (`w:tblpPr`):
   * Word draws the table there and wraps the body around it. */
  floatPosition?: BandRichTableFloat;
  /** The table's own borders (`w:tblBorders`), inside lines included. */
  borders?: BandRichBorders;
  /** Each row's height (`w:trHeight`), `null` where the row states none. */
  rowHeights?: (BandRichRowHeight | null)[];
}

export type BandRichBlock = BandRichParagraph | BandRichTable;

/**
 * The kinds of block a header/footer band may hold — the ONE list, for this
 * whole side.
 *
 * There were two here as well: this normalizer's `type === "paragraph" … else`
 * ladder and `paged/bandRichDom.buildBandRichDom`'s. The failure they invite is
 * the quiet one: a kind the normalizer keeps and the renderer has no branch for
 * is drawn as whatever the `else` happens to be, and a kind the renderer can
 * draw but the normalizer drops never reaches it at all. Both now read this
 * list, and `BandRichBlock["type"]` is held to it by the compiler, so adding a
 * member without giving the renderer a branch does not build.
 *
 * The server's twin is `document_docx_rich_bands.DOCX_RICH_BAND_BLOCK_TYPES`;
 * `apps/api/tests/test_band_rich_block_types.py` fails when the two stop naming
 * the same kinds (docs/office-graphics/SHAPE-IMPORT-AUDIT.md §51).
 */
export const BAND_RICH_BLOCK_TYPES = ["paragraph", "table"] as const;

export type BandRichBlockType = (typeof BAND_RICH_BLOCK_TYPES)[number];

// The list and the union are one statement: a member of either that the other
// does not have is a compile error, not a block that quietly vanishes.
const _bandRichBlockTypesAreExhaustive: BandRichBlock["type"] extends
  BandRichBlockType
  ? BandRichBlockType extends BandRichBlock["type"]
    ? true
    : never
  : never = true;
void _bandRichBlockTypesAreExhaustive;

/** Whether one stored value names a band block kind this side can hold. */
export function isBandRichBlockType(value: unknown): value is BandRichBlockType {
  return (BAND_RICH_BLOCK_TYPES as readonly unknown[]).includes(value);
}

export type PageNumberStoryAlignment = "left" | "center" | "right";

export interface PageNumberStoryUpdate {
  alignment: PageNumberStoryAlignment;
  includePageCount: boolean;
}

const PAGE_NUMBER_SEPARATOR = " / ";

export function bandRichRunsText(runs: readonly BandRichRun[]): string {
  return runs
    .map((run) => (run.token ? `{${run.token}}` : (run.text ?? "")))
    .join("")
    .slice(0, 500);
}

/** Apply one ordinary cell-input replacement without resurrecting old runs
 * or interpreting newly typed braces as a field. Unchanged field atoms retain
 * identity; editing inside a field's label deliberately turns that span into text. */
export function replaceBandRichCellText(cell: BandRichTableCell, text: string): BandRichTableCell {
  if (cell.paragraphs?.length === 1) return replaceBandRichCellParagraphText(cell, 0, text);
  if (cell.paragraphs?.length) throw new Error("Structured cells require a paragraph index");
  if (!cell.runs?.length) return { ...cell, text };
  const before = bandRichRunsText(cell.runs);
  if (text === before) return cell;
  const oldChars = Array.from(before), newChars = Array.from(text);
  let prefix = 0, suffix = 0;
  while (prefix < oldChars.length && prefix < newChars.length && oldChars[prefix] === newChars[prefix]) prefix++;
  while (suffix < oldChars.length - prefix && suffix < newChars.length - prefix && oldChars[oldChars.length - 1 - suffix] === newChars[newChars.length - 1 - suffix]) suffix++;
  const start = oldChars.slice(0, prefix).join("").length;
  const tail = suffix ? oldChars.slice(-suffix).join("").length : 0;
  const style = (run: BandRichRun): BandRichRun => {
    const result = { ...run }; delete result.text; delete result.token; delete result.nativeTextId;
    return result;
  };
  const slice = (from: number, to: number): BandRichRun[] => {
    let offset = 0;
    return cell.runs!.flatMap(run => {
      const value = run.token ? `{${run.token}}` : (run.text ?? "");
      const a = Math.max(0, from - offset), z = Math.min(value.length, to - offset);
      offset += value.length;
      if (a >= z) return [];
      return [a === 0 && z === value.length ? { ...run } : { ...style(run), text: value.slice(a, z) }];
    });
  };
  let offset = 0, inherited = style(cell.runs[0]);
  for (const run of cell.runs) {
    offset += run.token ? run.token.length + 2 : (run.text?.length ?? 0);
    inherited = style(run);
    if (offset >= start) break;
  }
  const inserted = text.slice(start, text.length - tail);
  const fragments = [...slice(0, start), ...(inserted ? [{...inherited, text:inserted}] : []), ...slice(before.length - tail, before.length)];
  const runs: BandRichRun[] = [];
  for (const run of fragments) {
    const previous = runs.at(-1);
    if (previous?.text !== undefined && run.text !== undefined && JSON.stringify(style(previous)) === JSON.stringify(style(run))) previous.text += run.text;
    else runs.push(run);
  }
  const next = {...cell, text};
  if (runs.length) next.runs = runs;
  else delete next.runs;
  return next;
}

export function bandRichCellParagraphRuns(paragraphs: readonly BandRichParagraph[]): BandRichRun[] {
  return paragraphs.flatMap((paragraph, index) => [ ...(index ? [{text:"\n"}] : []), ...paragraph.runs ]);
}

function withBandRichCellParagraphs(cell: BandRichTableCell, paragraphs: BandRichParagraph[]): BandRichTableCell {
  const runs = bandRichCellParagraphRuns(paragraphs);
  const next = {...cell,paragraphs,text:bandRichRunsText(runs)};
  if (runs.length) next.runs=runs;
  else delete next.runs;
  return next;
}

/** Whether a run holds text the user types into: MRAI-owned stories own all
 * their text; a native-text story (Word's own part, edited in place) owns only
 * the runs drawn from its text slots. Field chips are never typed into. */
export function isBandRichRunTypable(run: BandRichRun, nativeTextOnly: boolean): boolean {
  return !run.token && typeof run.text === "string" && (!nativeTextOnly || isNativeBandTextId(run.nativeTextId));
}

/** Whether a paragraph's text fits the 500-character band input unclipped,
 * so an input edit can be mapped onto its native text slots. */
export function isBandRichSlotParagraphWhole(runs: readonly BandRichRun[]): boolean {
  return runs.map((run) => (run.token ? `{${run.token}}` : (run.text ?? ""))).join("") === bandRichRunsText(runs);
}

function isNativeSlotText(text: string): boolean {
  return Array.from(text).length <= 500 && !/[\r\n\t]/.test(text);
}

/**
 * Apply one input replacement to runs drawn from native text slots without
 * creating, merging or restyling a run: the changed span is written into the
 * slot(s) it touches, and typing at a boundary goes to the run before the
 * caret (Word: typed text takes the formatting of the preceding character),
 * or to the slot that starts there when the run before is not a slot. Returns
 * null when the change reaches text no slot owns (a field result, a tab, a
 * data-bound value), or would put a break into a slot, so the input refuses
 * the keystroke instead of the save dropping it later.
 */
export function replaceBandRichSlotRunsText(runs: readonly BandRichRun[], text: string): BandRichRun[] | null {
  const values = runs.map((run) => Array.from(run.token ? `{${run.token}}` : (run.text ?? "")));
  const oldChars = values.flat(), newChars = Array.from(text);
  let prefix = 0, suffix = 0;
  while (prefix < oldChars.length && prefix < newChars.length && oldChars[prefix] === newChars[prefix]) prefix++;
  while (suffix < oldChars.length - prefix && suffix < newChars.length - prefix && oldChars[oldChars.length - 1 - suffix] === newChars[newChars.length - 1 - suffix]) suffix++;
  if (prefix === oldChars.length && prefix === newChars.length) return [...runs];
  const from = prefix, to = oldChars.length - suffix;
  const inserted = newChars.slice(prefix, newChars.length - suffix).join("");
  if (/[\r\n\t]/.test(inserted)) return null;
  const starts: number[] = [];
  let offset = 0;
  for (const value of values) { starts.push(offset); offset += value.length; }
  const slot = (index: number) => isNativeBandTextId(runs[index].nativeTextId) && !runs[index].token;
  const end = (index: number) => starts[index] + values[index].length;
  let target = -1;
  if (from === to) {
    target = runs.findIndex((_, index) => slot(index) && starts[index] < from && from <= end(index));
    if (target < 0) target = runs.findIndex((_, index) => slot(index) && starts[index] === from);
    if (target < 0) return null;
  }
  const next = runs.map((run) => ({ ...run }));
  for (let index = 0; index < runs.length; index += 1) {
    const overlaps = from < to && starts[index] < to && end(index) > from;
    if (!overlaps && index !== target) continue;
    if (!slot(index)) return null;
    if (target < 0) target = index;
    const local = values[index];
    const head = local.slice(0, Math.max(0, from - starts[index])).join("");
    const tail = local.slice(Math.min(local.length, Math.max(0, to - starts[index]))).join("");
    next[index].text = head + (index === target ? inserted : "") + tail;
    if (!isNativeSlotText(next[index].text!)) return null;
  }
  return next;
}

export function replaceBandRichCellParagraphText(cell: BandRichTableCell, index: number, text: string): BandRichTableCell {
  const previous = cell.paragraphs?.[index];
  if (!previous || !cell.paragraphs) return cell;
  if (previous.runs.some((run) => run.nativeTextId !== undefined)) {
    // A native-text cell paragraph: the typing lands in its slots or not at all,
    // and only when the input shows the paragraph whole (never a clipped tail).
    if (!isBandRichSlotParagraphWhole(previous.runs)) return cell;
    const runs = replaceBandRichSlotRunsText(previous.runs, text);
    if (!runs) return cell;
    return withBandRichCellParagraphs(cell, cell.paragraphs.map((paragraph, position) => position === index ? {...paragraph, runs} : paragraph));
  }
  const updated = replaceBandRichCellText({row:cell.row,col:cell.col,text:bandRichRunsText(previous.runs),runs:previous.runs}, text);
  const paragraphs = cell.paragraphs.map((paragraph, position) => position === index ? {...paragraph,runs:updated.runs ?? (text ? [{text}] : [])} : paragraph);
  return withBandRichCellParagraphs(cell, paragraphs);
}

export function splitBandRichCellParagraph(cell: BandRichTableCell, index: number, from: number, to: number): BandRichTableCell {
  const paragraphs = cell.paragraphs ?? [{type:"paragraph" as const,runs:cell.runs ?? (cell.text ? [{text:cell.text}] : []),...(cell.align ? {align:cell.align} : {})}];
  const paragraph = paragraphs[index];
  if (!paragraph || paragraphs.length >= 20 || cell.text.length - (to - from) + 1 > 500) return cell;
  const value = bandRichRunsText(paragraph.runs);
  const temporary = {row:cell.row,col:cell.col,text:value,runs:paragraph.runs};
  const head = replaceBandRichCellText(temporary, value.slice(0, from));
  const tail = replaceBandRichCellText(temporary, value.slice(to));
  return withBandRichCellParagraphs(cell, [...paragraphs.slice(0,index),{...paragraph,runs:head.runs ?? []},{...paragraph,runs:tail.runs ?? []},...paragraphs.slice(index+1)]);
}

export function joinBandRichCellParagraph(cell: BandRichTableCell, index: number): BandRichTableCell {
  const paragraphs = cell.paragraphs;
  if (!paragraphs?.[index] || !paragraphs[index+1]) return cell;
  return withBandRichCellParagraphs(cell, [...paragraphs.slice(0,index),{...paragraphs[index],runs:[...paragraphs[index].runs,...paragraphs[index+1].runs]},...paragraphs.slice(index+2)]);
}

const BAND_RICH_PAGE_MARKER = "\u001fP\u001f";
const BAND_RICH_NUMPAGES_MARKER = "\u001fN\u001f";

function bandRichRunsFromProjectedText(text: string): BandRichRun[] | null {
  if (
    !text.includes(BAND_RICH_PAGE_MARKER) &&
    !text.includes(BAND_RICH_NUMPAGES_MARKER)
  ) {
    return null;
  }
  const runs: BandRichRun[] = [];
  for (const part of text.split(/(\u001fP\u001f|\u001fN\u001f)/g)) {
    if (!part) continue;
    if (part === BAND_RICH_PAGE_MARKER) runs.push({ token: "PAGE" });
    else if (part === BAND_RICH_NUMPAGES_MARKER) {
      runs.push({ token: "NUMPAGES" });
    }
    else runs.push({ text: part });
  }
  return runs;
}

/** MRAI's closed page-number line: nothing but PAGE, the generated ` / `,
 * and NUMPAGES. */
function isOwnedPageNumberLine(block: BandRichParagraph): boolean {
  return (
    !block.images?.length &&
    !block.paragraphBorders &&
    !block.shading &&
    block.runs.some((run) => run.token === "PAGE" || run.token === "NUMPAGES") &&
    block.runs.every(
      (run) =>
        run.token === "PAGE" ||
        run.token === "NUMPAGES" ||
        run.text === PAGE_NUMBER_SEPARATOR,
    )
  );
}

/**
 * Add, reposition, or remove the closed PAGE/NUMPAGES field building block in
 * one rich header/footer story without flattening any unrelated content.
 *
 * A paragraph created here is marked `pageNumberBlock`, as a line of Word's
 * "Page Numbers" gallery block reads on import. Removing page numbers
 * (`update` null) deletes those lines whole, as Word's Remove Page Numbers
 * does, and leaves every PAGE field outside them (a line with other words, a
 * table cell, a framed legacy number) where it is. Adding or moving one
 * replaces the block and takes the story's other page fields out first, so
 * the page never shows two numbers.
 */
export function updateBandRichPageNumbers(
  blocks: readonly BandRichBlock[],
  update: PageNumberStoryUpdate | null,
): BandRichBlock[] | null {
  // An EMPTY story is a legal input, not a malformed one: it is the state of
  // every header/footer that has never been authored, and Word's "Page Number →
  // Bottom of Page" starts precisely there. `normalizeBandRichBlocks` answers
  // null for an empty array (its contract for "this band holds no story"), so
  // short-circuit instead of treating that as a rejection — otherwise page
  // numbers can only ever be added to a band that already has other content.
  const normalized = blocks.length === 0 ? [] : normalizeBandRichBlocks(blocks);
  if (!normalized || normalized.length !== blocks.length) return null;

  // Word's own page-number building block (a "Page Numbers" gallery content
  // control, read as `pageNumberBlock` lines) is what Remove Page Numbers
  // takes away, whole, and what a new page number replaces. A story without
  // one may still hold MRAI's closed field-only line from before the mark.
  const holdsMarkedBlock = normalized.some(
    (block) => block.type === "paragraph" && block.pageNumberBlock === true,
  );
  const next: BandRichBlock[] = [];
  for (const block of normalized) {
    if (block.type === "paragraph" && block.pageNumberBlock === true) continue;
    if (update === null) {
      // Word 16.86 leaves a PAGE field outside the building block where it
      // is: in a line with other words, in a table cell, in a frame (a
      // legacy number). Only MRAI's own unmarked field-only line goes.
      if (
        !holdsMarkedBlock &&
        block.type === "paragraph" &&
        isOwnedPageNumberLine(block)
      ) {
        continue;
      }
      next.push(block);
      continue;
    }
    if (block.type === "table") {
      next.push({
        ...block,
        cells: block.cells.map((cell) => {
          if (
            !cell.runs?.some(
              (run) => run.token === "PAGE" || run.token === "NUMPAGES",
            )
          ) {
            return cell;
          }
          if (cell.paragraphs?.length) return withBandRichCellParagraphs(cell, cell.paragraphs.map(paragraph => ({...paragraph,runs:paragraph.runs.filter(run => run.token !== "PAGE" && run.token !== "NUMPAGES")})));
          const runs = cell.runs.filter(
            (run) => run.token !== "PAGE" && run.token !== "NUMPAGES",
          );
          const nextCell: BandRichTableCell = {
            ...cell,
            text: bandRichRunsText(runs),
            runs,
          };
          if (!runs.length) delete nextCell.runs;
          return nextCell;
        }),
      });
      continue;
    }
    const ownsPageField = block.runs.some(
      (run) => run.token === "PAGE" || run.token === "NUMPAGES",
    );
    if (!ownsPageField) {
      next.push(block);
      continue;
    }
    if (isOwnedPageNumberLine(block)) continue;
    // The fields go, and with them the generated " / " between or beside
    // them; a separator the author typed elsewhere in the line stays. With
    // text added before the fields the line was no longer an owned block,
    
    const isPageField = (run: BandRichRun | undefined) =>
      run?.token === "PAGE" || run?.token === "NUMPAGES";
    const runs = block.runs.filter(
      (run, index, all) =>
        !isPageField(run) &&
        !(
          run.text === PAGE_NUMBER_SEPARATOR &&
          (isPageField(all[index - 1]) || isPageField(all[index + 1]))
        ),
    );
    // An in-line picture keeps its place: before the same run as before.
    const images = block.images?.map((image) => {
      if (image.runsBefore === undefined) return image;
      const kept = block.runs.slice(0, image.runsBefore).filter((run) => runs.includes(run)).length;
      const moved: BandRichImage = { ...image, runsBefore: kept };
      if (kept >= runs.length) delete moved.runsBefore;
      return moved;
    });
    if (runs.length || images?.length || block.paragraphBorders || block.shading) {
      next.push(images ? { ...block, runs, images } : { ...block, runs });
    }
  }

  if (update) {
    if (!(["left", "center", "right"] as const).includes(update.alignment)) {
      return null;
    }
    const runs: BandRichRun[] = [{ token: "PAGE" }];
    if (update.includePageCount) {
      runs.push({ text: PAGE_NUMBER_SEPARATOR }, { token: "NUMPAGES" });
    }
    const paragraph: BandRichParagraph = {
      type: "paragraph",
      runs,
      pageNumberBlock: true,
    };
    if (update.alignment !== "left") paragraph.align = update.alignment;
    next.push(paragraph);
  }

  // Symmetrically: removing the page number from a band that held ONLY the
  // field building block legitimately leaves the story empty. Callers act on
  // that (`nextBlocks.length > 0 ? setEditableContent : clearEditableContent`),
  // so answer the empty story rather than null — null would have made "Remove
  // Page Numbers" impossible on exactly the bands Word inserts.
  if (next.length === 0) return [];
  const canonical = normalizeBandRichBlocks(next);
  return canonical?.length === next.length ? canonical : null;
}

/** Whether a rich story owns one live PAGE/NUMPAGES field.  Keeping this
 * predicate beside the closed rich-band model gives the screen renderer and
 * both DOCX exporters one answer to the important question "does the band
 * already render the page number?".  A cached field result is never text, so
 * callers must not infer ownership from a visible digit. */
export function bandRichHasToken(
  blocks: BandRichBlock[] | null | undefined,
  token: "PAGE" | "NUMPAGES",
): boolean {
  return Boolean(
    blocks?.some(
      (block) =>
        (block.type === "paragraph" &&
          block.runs.some((run) => run.token === token)) ||
        (block.type === "table" &&
          block.cells.some((cell) =>
            cell.runs?.some((run) => run.token === token),
          )),
    ),
  );
}

/** Whether one footer story already owns the current-page field.  Plain-band
 * imports use the literal `{PAGE}` token; rich imports use a structured run.
 * Cached field results such as `7` satisfy neither branch. */
export function bandStoryOwnsPageNumber(
  text: string | null | undefined,
  blocks: BandRichBlock[] | null | undefined,
): boolean {
  return (
    Boolean(text?.includes(BAND_PAGE_TOKEN)) || bandRichHasToken(blocks, "PAGE")
  );
}

/** One footer variant considered by the page renderer. */
export interface BandPageNumberStory {
  text?: string | null;
  blocks?: BandRichBlock[] | null;
}

/**
 * Whether any footer variant already carries the live current-page field.
 *
 * Word stores normal, first-page, even-page and per-section footer stories
 * independently, while the legacy MRNote page-number switch is document-wide.
 * The screen must therefore inspect every effective story before enabling its
 * generated CSS counter; otherwise a native PAGE field and the generated
 * counter paint on top of one another (the observed 11/22/33/77 bug).
 */
export function bandStoriesOwnPageNumber(
  stories: readonly BandPageNumberStory[],
): boolean {
  return stories.some((story) =>
    bandStoryOwnsPageNumber(story.text, story.blocks),
  );
}

/**
 * Whether a footer of the document, read from the doc node's own attrs,
 * already shows the page number: the same stories the screen paints
 * (`sectionBands` when present, else the document-wide footers). A page
 * number a Word file brought in its footer is the page's page number.
 */
export function documentFootersOwnPageNumber(
  attrs: Readonly<Record<string, unknown>>,
): boolean {
  const sectionBands = normalizeSectionBands(attrs.sectionBands);
  if (sectionBands) {
    return bandStoriesOwnPageNumber(
      sectionBands.flatMap((entry) => [
        { text: entry.footerText, blocks: entry.footerRich },
        { text: entry.firstPageFooter, blocks: entry.firstPageFooterRich },
        { text: entry.evenPageFooter, blocks: entry.evenPageFooterRich },
      ]),
    );
  }
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  return bandStoriesOwnPageNumber([
    { text: text(attrs.footerText), blocks: normalizeBandRichBlocks(attrs.footerRich) },
    { text: text(attrs.firstPageFooter), blocks: normalizeBandRichBlocks(attrs.firstPageFooterRich) },
    { text: text(attrs.evenPageFooter), blocks: normalizeBandRichBlocks(attrs.evenPageFooterRich) },
  ]);
}

/** `projection._BAND_RICH_MAX_BLOCKS` / `MAX_DOCX_RICH_BAND_BLOCKS`. */
const BAND_RICH_MAX_BLOCKS = 64;
/** `document_docx_rich_bands.MAX_DOCX_RICH_BAND_IMAGES`. */
const BAND_RICH_MAX_IMAGES = 50;
const BAND_RICH_COLOR_RE = /^#[0-9a-f]{6}$/;

function positiveInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

/** Normalize an untrusted rich band payload; null = unset / off-shape. */
/** Strict native-band boundary: reject fields the display normalizer would drop. */
export function normalizeStrictBandParagraphBorders(value: unknown): DocumentParagraphBorders | null {
  const normalized = normalizeDocumentParagraphBorders(value);
  if (!normalized || !value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).length !== Object.keys(normalized).length) return null;
  for (const [edge, line] of Object.entries(normalized)) {
    const original = raw[edge];
    if (!original || typeof original !== "object" || Array.isArray(original)) return null;
    const record = original as Record<string, unknown>;
    if (Object.keys(record).length !== Object.keys(line).length ||
        Object.entries(line).some(([key, field]) => record[key] !== field)) return null;
  }
  return normalized;
}

/** `p{block}:q{paragraph}` -- a paragraph of Word's own header/footer part. */
export function isNativeBandParagraphId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^p([0-9]{1,2}):q([0-9]{1,3})$/.exec(value);
  return Boolean(match && Number(match[1]) < 20 && Number(match[2]) < 256 && value === `p${Number(match[1])}:q${Number(match[2])}`);
}

/** `p{block}:q{paragraph}:a{n}` -- a native atom (see {@link BandRichRun.nativeAtom}). */
export function isNativeBandAtomId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(p[0-9]{1,2}:q[0-9]{1,3}):a([0-9]{1,3})$/.exec(value);
  return Boolean(match && isNativeBandParagraphId(match[1]) && Number(match[2]) < 256 && value === `${match[1]}:a${Number(match[2])}`);
}

/** `p{block}:q{paragraph}:r{run}` -- a run of Word's line typed runs may
 * follow (see {@link BandRichRun.nativeAnchor}; server twin
 * `NATIVE_ANCHOR_ID_RE`). */
export function isNativeBandAnchorId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(p[0-9]{1,2}:q[0-9]{1,3}):r([0-9]{1,4})$/.exec(value);
  return Boolean(match && isNativeBandParagraphId(match[1]) && Number(match[2]) < 4096 && value === `${match[1]}:r${Number(match[2])}`);
}

/** `p{block}:q{paragraph}:f{n}` -- a removable field of Word's line (see
 * {@link BandRichRun.nativeField}; server twin `NATIVE_FIELD_ID_RE`). */
export function isNativeBandFieldId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(p[0-9]{1,2}:q[0-9]{1,3}):f([0-9]{1,3})$/.exec(value);
  return Boolean(match && isNativeBandParagraphId(match[1]) && Number(match[2]) < 256 && value === `${match[1]}:f${Number(match[2])}`);
}

/** `p{block}:q{paragraph}:g{n}` -- a group of Word's line whose members'
 * words the story may retype (see {@link BandRichShape.nativeGroup}; server
 * twin `NATIVE_GROUP_ID_RE`). */
export function isNativeBandGroupId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(p[0-9]{1,2}:q[0-9]{1,3}):g([0-9]{1,3})$/.exec(value);
  return Boolean(match && isNativeBandParagraphId(match[1]) && Number(match[2]) < 256 && value === `${match[1]}:g${Number(match[2])}`);
}

/** `p{block}:q{paragraph}:o{n}` -- a picture, shape or text box of Word's
 * line the story may resize or remove (see {@link BandRichImage.nativeObject};
 * server twin `NATIVE_OBJECT_ID_RE`). */
export function isNativeBandObjectId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(p[0-9]{1,2}:q[0-9]{1,3}):o([0-9]{1,3})$/.exec(value);
  return Boolean(match && isNativeBandParagraphId(match[1]) && Number(match[2]) < 256 && value === `${match[1]}:o${Number(match[2])}`);
}

/**
 * The number formats of a page-number field (Word's Edit Field > Format list
 * for PAGE, NUMPAGES and SECTIONPAGES: the `\* <format>` switch). The server
 * twin is `document_native_story_objects.NUMBER_FORMATS`.
 */
export const NATIVE_FIELD_NUMBER_FORMATS = ["Arabic", "ArabicDash", "roman", "ROMAN", "alphabetic", "ALPHABETIC"] as const;
export type NativeFieldNumberFormat = (typeof NATIVE_FIELD_NUMBER_FORMATS)[number];

export function isNativeFieldNumberFormat(value: unknown): value is NativeFieldNumberFormat {
  return typeof value === "string" && (NATIVE_FIELD_NUMBER_FORMATS as readonly string[]).includes(value);
}

/** Fields the story inserts into Word's own part as complex fields (server
 * twin `NEW_FIELD_TYPES`). */
export const NATIVE_NEW_FIELD_TYPES = ["SECTIONPAGES", "STYLEREF", "DOCPROPERTY"] as const;
/** The built-in document properties DOCPROPERTY names (server twin
 * `DOC_PROPERTIES`). */
export const NATIVE_DOC_PROPERTIES = [
  "Title", "Subject", "Author", "Keywords", "Comments", "Category", "Company", "Manager",
] as const;

/** A field the story inserted into Word's own part: SECTIONPAGES (with an
 * optional number format), STYLEREF of a style name or heading level 1-9,
 * DOCPROPERTY of a built-in property. */
export interface NativeNewField {
  type: (typeof NATIVE_NEW_FIELD_TYPES)[number];
  arg?: string;
  format?: NativeFieldNumberFormat;
}

/** The new field `value` is, or null (server twin `normalize_new_field`,
 * without the cached result the band carries as the run's text). */
export function normalizeNativeNewField(value: unknown): NativeNewField | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some((key) => !["type", "arg", "format"].includes(key))) return null;
  const type = raw.type;
  if (!(NATIVE_NEW_FIELD_TYPES as readonly unknown[]).includes(type)) return null;
  const out: NativeNewField = { type: type as NativeNewField["type"] };
  if (type === "SECTIONPAGES") {
    if ("arg" in raw) return null;
  } else if (type === "STYLEREF") {
    const arg = raw.arg;
    if (
      typeof arg !== "string" ||
      arg.length < 1 ||
      arg.length > 64 ||
      arg !== arg.trim() ||
      !/^[\p{L}\p{N} _.-]+$/u.test(arg)
    ) {
      return null;
    }
    out.arg = arg;
  } else {
    if (!(NATIVE_DOC_PROPERTIES as readonly unknown[]).includes(raw.arg)) return null;
    out.arg = raw.arg as string;
  }
  if ("format" in raw) {
    if (type !== "SECTIONPAGES" || !isNativeFieldNumberFormat(raw.format)) return null;
    out.format = raw.format;
  }
  return out;
}

/** A page number in a field number format, as Word shows it ("- 4 -",
 * "iv", "D"; server twin `formatted_number`). */
export function formatNativeFieldNumber(value: number, format: NativeFieldNumberFormat | "none" | undefined): string {
  if (!Number.isInteger(value) || value < 1) return String(value);
  switch (format) {
    case "ArabicDash":
      return `- ${value} -`;
    case "roman":
    case "ROMAN": {
      if (value >= 4000) return String(value);
      let rest = value;
      let out = "";
      for (const [step, digits] of [
        [1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"],
        [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"],
      ] as const) {
        while (rest >= step) {
          out += digits;
          rest -= step;
        }
      }
      return format === "ROMAN" ? out.toUpperCase() : out;
    }
    case "alphabetic":
    case "ALPHABETIC": {
      const letter = String.fromCharCode(97 + ((value - 1) % 26)).repeat(Math.floor((value - 1) / 26) + 1);
      return format === "ALPHABETIC" ? letter.toUpperCase() : letter;
    }
    default:
      return String(value);
  }
}

/** What removing a native line depends on (see
 * {@link BandRichParagraph.nativeRemovable}). */
export function isNativeBandRemoval(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 4096 &&
    value.split(" ").every((token) => token === "T" || isNativeBandParagraphId(token))
  );
}

/** A band run's text as the model keeps it: at most 500 characters, counted
 * as the server counts them (code points), never cutting a surrogate pair. */
export function clipBandText(text: string): string {
  if (text.length <= 500) return text;
  const characters = Array.from(text);
  return characters.length <= 500 ? text : characters.slice(0, 500).join("");
}

export function isNativeBandTextId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^p([0-9]{1,2}):r([0-9]{1,3})$/.exec(value);
  return Boolean(match && Number(match[1]) < 20 && Number(match[2]) < 256 && value === `p${Number(match[1])}:r${Number(match[2])}`);
}

const BAND_RICH_MAX_FRAMES = 16;
const BAND_FRAME_MAX_EMU = 27_273_042;
const BAND_FRAME_H_ORIGINS = new Set(["margin", "page", "column", "character", "leftMargin", "rightMargin", "insideMargin", "outsideMargin"]);
const BAND_FRAME_V_ORIGINS = new Set(["margin", "page", "paragraph", "line", "topMargin", "bottomMargin", "insideMargin", "outsideMargin"]);
const BAND_FRAME_ALIGNS = new Set(["left", "right", "center", "inside", "outside", "top", "bottom"]);

function normalizeBandRichFrameAxis(raw: unknown, origins: Set<string>): BandRichFrameAxis | null {
  if (!raw || typeof raw !== "object") return null;
  const axis = raw as Record<string, unknown>;
  if (typeof axis.relativeFrom !== "string" || !origins.has(axis.relativeFrom)) return null;
  const hasOffset = typeof axis.offsetEmu === "number";
  const hasAlign = typeof axis.align === "string";
  if (hasOffset === hasAlign) return null;
  if (hasOffset) {
    const offset = axis.offsetEmu as number;
    if (!Number.isInteger(offset) || Math.abs(offset) > BAND_FRAME_MAX_EMU) return null;
    return { relativeFrom: axis.relativeFrom, offsetEmu: offset };
  }
  if (!BAND_FRAME_ALIGNS.has(axis.align as string)) return null;
  return { relativeFrom: axis.relativeFrom, align: axis.align as string };
}

/** A band paragraph's (or frame's) Word line inputs, kept only when well formed. */
export function normalizeBandRichLine(raw: unknown): BandRichLine {
  const out: BandRichLine = {};
  if (!raw || typeof raw !== "object") return out;
  const record = raw as Record<string, unknown>;
  const finite = (value: unknown, min: number, max: number): value is number =>
    typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
  if (finite(record.lineHeightPt, 1, 1584) && (record.lineHeightRule === "exact" || record.lineHeightRule === "atLeast")) {
    out.lineHeightPt = record.lineHeightPt;
    out.lineHeightRule = record.lineHeightRule;
  } else if (finite(record.lineHeight, WORD_LINE_MULTIPLE_MIN, WORD_LINE_MULTIPLE_MAX)) {
    out.lineHeight = record.lineHeight;
  }
  if (finite(record.lineSizePt, 1, 1638)) out.lineSizePt = record.lineSizePt;
  if (typeof record.lineFont === "string" && record.lineFont.length > 0 && record.lineFont.length <= 64 && !/[\u0000-\u001f\u007f]/u.test(record.lineFont)) {
    out.lineFont = record.lineFont;
  }
  return out;
}

function normalizeBandRichFrames(raw: unknown, nested = false): BandRichFrame[] | null {
  if (!Array.isArray(raw) || !raw.length || raw.length > BAND_RICH_MAX_FRAMES) return null;
  const out: BandRichFrame[] = [];
  const seen = new Set<number>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return null;
    const frame = entry as Record<string, unknown>;
    const index = frame.index;
    if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index > BAND_RICH_MAX_FRAMES || seen.has(index)) return null;
    seen.add(index);
    const horizontal = normalizeBandRichFrameAxis(frame.horizontal, BAND_FRAME_H_ORIGINS);
    const vertical = normalizeBandRichFrameAxis(frame.vertical, BAND_FRAME_V_ORIGINS);
    const width = frame.widthEmu;
    const height = frame.heightEmu;
    const insets = frame.insetsEmu;
    if (!horizontal || !vertical) return null;
    if (typeof width !== "number" || !Number.isInteger(width) || width <= 0 || width > BAND_FRAME_MAX_EMU) return null;
    if (typeof height !== "number" || !Number.isInteger(height) || height <= 0 || height > BAND_FRAME_MAX_EMU) return null;
    if (!Array.isArray(insets) || insets.length !== 4 || insets.some((inset) => typeof inset !== "number" || !Number.isInteger(inset) || inset < 0 || inset > BAND_FRAME_MAX_EMU)) return null;
    if (frame.align !== "left" && frame.align !== "center" && frame.align !== "right") return null;
    if (typeof frame.behindText !== "boolean") return null;
    const relativeHeight = frame.relativeHeight;
    if (typeof relativeHeight !== "number" || !Number.isInteger(relativeHeight) || relativeHeight < 0 || relativeHeight > 4_294_967_295) return null;
    const extras = normalizeBandFrameExtras(frame, { horizontal, vertical, behindText: frame.behindText, relativeHeight });
    if (!extras) return null;
    out.push({
      index,
      horizontal,
      vertical,
      widthEmu: width,
      heightEmu: height,
      insetsEmu: [insets[0], insets[1], insets[2], insets[3]] as [number, number, number, number],
      align: frame.align,
      behindText: frame.behindText,
      relativeHeight,
      ...extras,
      ...(() => {
        const line = normalizeBandRichLine(frame.line);
        return Object.keys(line).length ? { line } : {};
      })(),
      ...(isNativeBandObjectId(frame.nativeObject) && !(Array.isArray(frame.blocks) && frame.blocks.length)
        ? { nativeObject: frame.nativeObject }
        : {}),
      // One level deep, exactly like the server's validator
      // (`document_docx_rich_bands._normalize_frames`): a box inside a box is
      // a chain neither reader follows, and an unbounded recursion here would
      // be an unbounded page.
      ...(!nested && Array.isArray(frame.blocks) && frame.blocks.length
        ? (() => {
            const carried = normalizeBandRichBlocks(frame.blocks, false, true);
            return carried ? { blocks: carried } : {};
          })()
        : {}),
    });
  }
  return out;
}

/** `projection._BAND_RICH_MAX_SHAPES` / `MAX_DOCX_RICH_BAND_SHAPES`. */
const BAND_RICH_MAX_SHAPES = 8;

/**
 * The drawings one band paragraph holds. There is no band shape normalizer:
 * every entry goes through `normalizeDocumentShapeAttrs`, the one the editor's
 * own `documentShape` goes through, so a band shape and a body shape can never
 * be two readings of the same attrs. The band's own two rules -- in line with
 * text, never a group -- are applied here because they are the band's, not the
 * shape model's (docs/office-graphics/SHAPE-IMPORT-AUDIT.md §60).
 */
function normalizeBandRichShapes(raw: unknown): BandRichShape[] {
  if (!Array.isArray(raw)) return [];
  const out: BandRichShape[] = [];
  for (const entry of raw.slice(0, BAND_RICH_MAX_SHAPES)) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const inline = record.wrapMode === "inline";
    // An anchored drawing is placed by its own `wp:anchor` reading; one that
    // states none (or one this reader cannot place) has nowhere to go.
    const floatAnchor = inline ? null : normalizeFloatAnchor(record.floatAnchor);
    if (!inline && !floatAnchor) continue;
    const attrs = normalizeDocumentShapeAttrs(record);
    if (inline && (attrs.wrapMode !== "inline" || attrs.xEmu !== 0 || attrs.yEmu !== 0)) continue;
    // A group the shape model refused (no members it can place) is not a
    // drawing of nothing: it is not drawn at all.
    if (Array.isArray(record.groupMembers) && !attrs.groupMembers?.length) continue;
    if (floatAnchor) {
      const relativeHeight =
        typeof record.relativeHeight === "number" &&
        Number.isSafeInteger(record.relativeHeight) &&
        record.relativeHeight >= 0 &&
        record.relativeHeight <= 4_294_967_295
          ? record.relativeHeight
          : undefined;
      out.push({
        ...attrs,
        floatAnchor,
        ...(relativeHeight !== undefined ? { relativeHeight } : {}),
        ...(isNativeBandGroupId(record.nativeGroup) && attrs.groupMembers?.length
          ? { nativeGroup: record.nativeGroup }
          : {}),
      });
      continue;
    }
    out.push(
      isNativeBandObjectId(record.nativeObject) && !attrs.groupMembers?.length
        ? { ...attrs, nativeObject: record.nativeObject }
        : isNativeBandGroupId(record.nativeGroup) && attrs.groupMembers?.length
          ? { ...attrs, nativeGroup: record.nativeGroup }
          : attrs,
    );
  }
  return out;
}

const BAND_RICH_MAX_WORD_ART = 8;
const BAND_WORD_ART_MAX_TEXT = 512;

function normalizeBandRichWordArt(raw: unknown): BandRichWordArt[] {
  if (!Array.isArray(raw)) return [];
  const out: BandRichWordArt[] = [];
  for (const entry of raw.slice(0, BAND_RICH_MAX_WORD_ART)) {
    if (!entry || typeof entry !== "object") continue;
    const art = entry as Record<string, unknown>;
    const horizontal = normalizeBandRichFrameAxis(art.horizontal, BAND_FRAME_H_ORIGINS);
    const vertical = normalizeBandRichFrameAxis(art.vertical, BAND_FRAME_V_ORIGINS);
    const width = art.widthEmu;
    const height = art.heightEmu;
    const rotation = art.rotation;
    const relativeHeight = art.relativeHeight;
    // A warp this build cannot draw is not drawn a different way: the object
    // stays preserved and its named receipt is what the reader is told.
    if (textWarpDrawing(art.warp) !== "fit") continue;
    if (!horizontal || !vertical) continue;
    if (typeof art.text !== "string" || !art.text || art.text.length > BAND_WORD_ART_MAX_TEXT) continue;
    if (typeof width !== "number" || !Number.isInteger(width) || width <= 0 || width > BAND_FRAME_MAX_EMU) continue;
    if (typeof height !== "number" || !Number.isInteger(height) || height <= 0 || height > BAND_FRAME_MAX_EMU) continue;
    if (typeof rotation !== "number" || !Number.isInteger(rotation) || Math.abs(rotation) > 21_600_000) continue;
    if (typeof relativeHeight !== "number" || !Number.isInteger(relativeHeight) || relativeHeight < 0 || relativeHeight > 4_294_967_295) continue;
    const size = art.fontSizePt;
    const opacity = art.fillOpacity;
    out.push({
      index: out.length,
      text: art.text,
      warp: art.warp as string,
      horizontal,
      vertical,
      widthEmu: width,
      heightEmu: height,
      behindText: art.behindText === true,
      relativeHeight,
      rotation,
      ...(typeof art.fontFamily === "string" && art.fontFamily.trim() && art.fontFamily.length <= 128
        ? { fontFamily: art.fontFamily }
        : {}),
      ...(typeof size === "number" && Number.isFinite(size) && size > 0 && size <= 4000
        ? { fontSizePt: size }
        : {}),
      ...(art.bold === true ? { bold: true as const } : {}),
      ...(art.italic === true ? { italic: true as const } : {}),
      ...(isHexColor(art.fill) ? { fill: art.fill } : {}),
      ...(typeof opacity === "number" && Number.isFinite(opacity) && opacity >= 0 && opacity <= 1
        ? { fillOpacity: opacity }
        : {}),
      ...(isHexColor(art.outline) ? { outline: art.outline } : {}),
    });
  }
  return out;
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/.test(value);
}

/** Up to 50 distinct, in-page tab stops; anything else is not a stop. */
export function normalizeBandRichTabStops(value: unknown): BandRichTabStop[] {
  if (!Array.isArray(value)) return [];
  const byPosition = new Map<number, BandRichTabStop>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const stop = raw as Record<string, unknown>;
    const pos = stop.pos;
    const align = stop.align;
    const leader = stop.leader ?? "none";
    if (
      typeof pos !== "number" ||
      !Number.isInteger(pos) ||
      pos < 1 ||
      pos > 31_680 ||
      (align !== "left" && align !== "center" && align !== "right" && align !== "decimal") ||
      (leader !== "none" && leader !== "dot" && leader !== "hyphen" && leader !== "underscore")
    ) {
      continue;
    }
    byPosition.set(pos, { pos, align, leader });
    if (byPosition.size >= 50) break;
  }
  return Array.from(byPosition.keys())
    .sort((a, b) => a - b)
    .map((pos) => byPosition.get(pos) as BandRichTabStop);
}

/** A paragraph that draws nothing -- no runs, pictures, borders, frames,
 * drawings or WordArt, and no list marker: a blank line. */
function isBlankBandParagraph(block: BandRichBlock): boolean {
  return (
    block.type === "paragraph" &&
    !block.runs.length &&
    !block.list &&
    !block.images?.length &&
    !block.paragraphBorders &&
    !block.shading &&
    !block.wordHorizontalRule &&
    !block.frames?.length &&
    !block.shapes?.length &&
    !block.charts?.length &&
    !block.wordArt?.length
  );
}

export function normalizeBandRichBlocks(
  value: unknown,
  allowEmptyParagraph = false,
  nested = false,
): BandRichBlock[] | null {
  if (!Array.isArray(value)) return null;
  const blocks: BandRichBlock[] = [];
  let imageTotal = 0;
  for (const raw of value.slice(0, BAND_RICH_MAX_BLOCKS)) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    if (!isBandRichBlockType(record.type)) continue;
    if (record.type === "paragraph") {
      const runs: BandRichRun[] = [];
      for (const rawRun of Array.isArray(record.runs) ? record.runs : []) {
        if (!rawRun || typeof rawRun !== "object") continue;
        const run = rawRun as Record<string, unknown>;
        const token = isBandFieldToken(run.token) ? run.token : null;
        const nativeTextId = isNativeBandTextId(run.nativeTextId) ? run.nativeTextId : null;
        // A field of Word's line whose stored result is empty keeps no text,
        // only the field the export writes back (nativeFieldCode).
        const emptyField =
          run.text === "" && isNativeBandFieldId(run.nativeField) &&
          !!run.nativeFieldCode && typeof run.nativeFieldCode === "object" && !Array.isArray(run.nativeFieldCode);
        if (!token && (typeof run.text !== "string" || (!run.text && !nativeTextId && !emptyField))) continue;
        const out: BandRichRun = token ? { token } : { text: clipBandText(run.text as string) };
        if (!token && nativeTextId) {
          out.nativeTextId = nativeTextId;
          if (isNativeBandTextId(run.nativeRunGroup)) out.nativeRunGroup = run.nativeRunGroup;
          if (run.nativeWrapped === "box" || run.nativeWrapped === "link") out.nativeWrapped = run.nativeWrapped;
        } else if (isNativeBandAtomId(run.nativeAtom)) out.nativeAtom = run.nativeAtom;
        else if (isNativeBandTextId(run.nativeFrom)) out.nativeFrom = run.nativeFrom;
        if (!out.nativeTextId && !out.nativeFrom && isNativeBandAnchorId(run.nativeAnchor)) out.nativeAnchor = run.nativeAnchor;
        if (!out.nativeTextId && !out.nativeFrom && isNativeBandFieldId(run.nativeField)) {
          out.nativeField = run.nativeField;
          if (run.nativeFieldFormat === "none" || isNativeFieldNumberFormat(run.nativeFieldFormat)) {
            out.nativeFieldFormat = run.nativeFieldFormat;
          }
          if (
            !token &&
            run.nativeFieldCode &&
            typeof run.nativeFieldCode === "object" &&
            !Array.isArray(run.nativeFieldCode)
          ) {
            out.nativeFieldCode = run.nativeFieldCode as Record<string, unknown>;
          }
        }
        if (
          (token === "PAGE" || token === "NUMPAGES") &&
          out.nativeField === undefined &&
          out.nativeAtom === undefined &&
          isNativeFieldNumberFormat(run.fieldFormat) &&
          run.fieldFormat !== "Arabic"
        ) {
          out.fieldFormat = run.fieldFormat;
        }
        if ((token === "DATE" || token === "TIME") && isBandDatePicture(run.datePicture)) {
          out.datePicture = run.datePicture;
        }
        if (!token && !nativeTextId && !out.nativeAtom && run.nativeNewField !== undefined) {
          const field = normalizeNativeNewField(run.nativeNewField);
          if (field) out.nativeNewField = field;
        }
        // Bold and italic may be stated OFF against a bold or italic style
        // (Word's w:b w:val="0", corpus R158-D22).
        if (typeof run.bold === "boolean") out.bold = run.bold;
        if (typeof run.italic === "boolean") out.italic = run.italic;
        if (run.underline === true) out.underline = true;
        if ("font" in run) { const font = readableBandRunFont(run.font); if (font) out.font = font; }
        if (run.revision !== undefined) {
          const revision = normalizeBandRunRevision(run.revision);
          if (revision) out.revision = revision;
        }
        if (run.ptab !== undefined) {
          // A positional tab is one tab character of Word's own content; any
          // other shape is not a band this model can draw.
          const ptab = normalizePositionalTab(run.ptab);
          if (!ptab || token || nativeTextId || out.nativeFrom !== undefined || run.text !== "\t") return null;
          out.ptab = ptab;
        }
        const size = run.sizePt ?? run.size_pt;
        if (typeof size === "number" && size >= 4 && size <= 96) {
          out.sizePt = size;
        }
        if (
          typeof run.color === "string" &&
          BAND_RICH_COLOR_RE.test(run.color)
        ) {
          out.color = run.color;
        }
        if (isBandCharStyleId(run.charStyleId)) out.charStyleId = run.charStyleId;
        // Font > Superscript / Subscript (Word's `w:vertAlign`).
        if (run.vertAlign === "superscript" || run.vertAlign === "subscript") out.vertAlign = run.vertAlign;
        // Font > Advanced > Spacing (Word's `w:spacing w:val`).
        if (
          typeof run.spacingPt === "number" &&
          Number.isFinite(run.spacingPt) &&
          run.spacingPt !== 0 &&
          Math.abs(run.spacingPt) <= 1_584
        ) {
          out.spacingPt = run.spacingPt;
        }
        // Font > Advanced > Scale (Word's `w:w`).
        if (
          typeof run.scalePct === "number" &&
          Number.isInteger(run.scalePct) &&
          run.scalePct >= 1 &&
          run.scalePct <= 600 &&
          run.scalePct !== 100
        ) {
          out.scalePct = run.scalePct;
        }
        // Font > Highlight / Shading: the run's background.
        if (typeof run.background === "string" && /^#[0-9a-f]{6}$/.test(run.background)) {
          out.background = run.background;
        }
        // Font > Text Effects: kept as read when it states an effect the
        // body's mark draws (the API checks it against its own reader).
        if (run.textEffects && typeof run.textEffects === "object" && !Array.isArray(run.textEffects)) {
          const effects = normalizeTextEffectMarkAttributes(run.textEffects);
          if (hasTextEffects(effects) || effects.stated) out.textEffects = run.textEffects as Record<string, unknown>;
        }
        if (
          typeof run.frame === "number" &&
          Number.isInteger(run.frame) &&
          run.frame >= 0 &&
          run.frame <= BAND_RICH_MAX_FRAMES
        ) {
          out.frame = run.frame;
        }
        runs.push(out);
      }
      const images: BandRichImage[] = [];
      for (const rawImage of Array.isArray(record.images)
        ? record.images
        : []) {
        if (!rawImage || typeof rawImage !== "object") continue;
        if (imageTotal >= BAND_RICH_MAX_IMAGES) break;
        const image = rawImage as Record<string, unknown>;
        // Inline, or named by digest (`mrai-picture:`, the import's
        // picture-reference mode): the band draws it through the page's
        // picture route, as the body draws its pictures.
        if (
          typeof image.src !== "string" ||
          !(image.src.startsWith("data:image/") || pictureObjectTokenSha(image.src))
        ) {
          continue;
        }
        const out: BandRichImage = { src: image.src };
        const width = positiveInt(image.widthEmu ?? image.width_emu);
        const height = positiveInt(image.heightEmu ?? image.height_emu);
        if (width !== null) out.widthEmu = width;
        if (height !== null) out.heightEmu = height;
        const imageAnchor =
          image.floatAnchor === undefined ? null : normalizeFloatAnchor(image.floatAnchor);
        if (image.floatAnchor !== undefined && !imageAnchor) continue;
        if (imageAnchor) out.floatAnchor = imageAnchor;
        else if (isNativeBandObjectId(image.nativeObject)) out.nativeObject = image.nativeObject;
        if (image.washout === true) out.washout = true;
        if (
          !imageAnchor &&
          typeof image.runsBefore === "number" &&
          Number.isInteger(image.runsBefore) &&
          image.runsBefore >= 0 &&
          image.runsBefore <= 10_000
        ) {
          out.runsBefore = image.runsBefore;
        }
        const crop = image.crop === undefined ? null : normalizeBandRichImageCrop(image.crop);
        if (crop) out.crop = crop;
        images.push(out);
        imageTotal += 1;
      }
      const borders = normalizeDocumentParagraphBorders(record.paragraphBorders);
      // A watermark paragraph carries no runs, no pictures and no borders:
      // dropping it for that would drop the only thing it draws.
      const wordArt = normalizeBandRichWordArt(record.wordArt);
      // A frame drawing its OWN story (a text box whose content is a table) is
      // the whole content of its host paragraph: a letterhead header has no
      // runs, no pictures and no borders of its own, and dropping the
      // paragraph here would drop the table with it.
      const frames = normalizeBandRichFrames(record.frames, nested);
      const carried = (frames ?? []).filter((frame) => frame.blocks?.length);
      // A band-table's drawings arrive as a run-less paragraph of their own
      // (the same row the grid's pictures arrive in), so a paragraph that
      // carries only shapes is the whole of what the band draws there.
      const shapes = normalizeBandRichShapes(record.shapes);
      const charts = normalizeBandRichCharts(record.charts);
      // A run-less paragraph is a blank line of the band (Word writes them
      // between and after its lines); a band of nothing but blank lines is no
      // band, decided once every block is read (the server twin's rule).
      const block: BandRichParagraph = { type: "paragraph", runs };
      if (isNativeBandParagraphId(record.nativeParagraphId)) {
        block.nativeParagraphId = record.nativeParagraphId;
        if (isNativeBandRemoval(record.nativeRemovable)) block.nativeRemovable = record.nativeRemovable;
      } else if (isNativeBandParagraphId(record.nativeFrom)) {
        block.nativeFrom = record.nativeFrom;
      }
      if (record.pageNumberBlock === true) block.pageNumberBlock = true;
      const textFrame = normalizeBandRichTextFrame(record.textFrame);
      if (textFrame) block.textFrame = textFrame;
      const markRun = normalizeBandRichMarkRun(record.markRun);
      if (markRun) block.markRun = markRun;
      if (wordArt.length) block.wordArt = wordArt;
      if (shapes.length) block.shapes = shapes;
      if (charts.length) block.charts = charts;
      if (typeof record.docxStyleId === "string" && record.docxStyleId.length > 0 && record.docxStyleId.length <= 256 && !/[\u0000-\u001f\u007f]/u.test(record.docxStyleId) && record.docxStyleId !== "Normal") block.docxStyleId = record.docxStyleId;
      if (record.contextualSpacing === true) block.contextualSpacing = true;
      Object.assign(block, normalizeBandRichLine(record));
      for (const key of ["spaceBeforePt", "spaceAfterPt"] as const) {
        const value = record[key];
        if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1584) block[key] = value;
      }
      if (borders) block.paragraphBorders = borders;
      const shading = typeof record.shading === "string" && /^#[0-9a-f]{6}$/iu.test(record.shading) ? record.shading.toLowerCase() : null;
      if (shading) block.shading = shading;
      const horizontalRule = normalizeWordHorizontalRule(record.wordHorizontalRule);
      if (horizontalRule) block.wordHorizontalRule = horizontalRule;
      if (record.align === "center" || record.align === "right" || record.align === "justify") {
        block.align = record.align;
      }
      const tabStops = normalizeBandRichTabStops(record.tabStops);
      if (tabStops.length) block.tabStops = tabStops;
      for (const key of ["indentLeftPt", "indentRightPt", "firstLineIndentPt"] as const) {
        const value = record[key];
        if (typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1584) {
          block[key] = Math.round(value * 100) / 100;
        }
      }
      const list = normalizeBandRichList(record.list);
      if (list) block.list = list;
      if (images.length) block.images = images;
      // Keep a paragraph's frames only when the ones that draw RUNS name
      // exactly the frames its runs are tagged with; otherwise the runs go
      // back to the flow, which is how the band drew them before frames
      // existed. A frame that draws its own blocks stands outside that count:
      // it owns no run of this paragraph.
      const framed = new Set(runs.flatMap((run) => (run.frame === undefined ? [] : [run.frame])));
      const runFrames = (frames ?? []).filter((frame) => !frame.blocks?.length);
      // ... and a frame no run names is still a drawing when it is painted
      // (an empty box with a border, a fill or a picture), as the server's
      // `band_frame_is_painted` keeps it.
      const named = new Set(runFrames.map((frame) => frame.index));
      if (
        frames &&
        [...framed].every((index) => named.has(index)) &&
        runFrames.every((frame) => framed.has(frame.index) || bandFrameIsPainted(frame))
      ) {
        if (frames.length) block.frames = frames;
      } else if (framed.size) {
        for (const run of runs) delete run.frame;
        if (carried.length) block.frames = carried;
      }
      blocks.push(block);
    } else if (record.type === "table") {
      const rows = positiveInt(record.rows);
      const cols = positiveInt(record.cols);
      if (rows === null || cols === null || rows > 20 || cols > 12) continue;
      const cells: BandRichTableCell[] = [];
      for (const rawCell of Array.isArray(record.cells) ? record.cells : []) {
        if (!rawCell || typeof rawCell !== "object") continue;
        const cell = rawCell as Record<string, unknown>;
        const row = cell.row;
        const col = cell.col;
        if (
          typeof row !== "number" ||
          typeof col !== "number" ||
          !Number.isInteger(row) ||
          !Number.isInteger(col) ||
          row < 0 ||
          col < 0 ||
          row >= rows ||
          col >= cols
        ) {
          continue;
        }
        const out: BandRichTableCell = {
          row,
          col,
          text: typeof cell.text === "string" ? clipBandText(cell.text) : "",
        };
        // A cell paragraph may hold pictures in its line (a masthead's logo
        // in its cell: the reader's band_cell_pictures, corpus R282-D22,
        // R283-D04); refused here, the whole cell lost its paragraphs and
        // the logos were never drawn.
        if (Array.isArray(cell.paragraphs) && cell.paragraphs.length > 0 && cell.paragraphs.length <= 20 && cell.paragraphs.every(part => part && typeof part === "object" && part.type === "paragraph")) {
          out.paragraphs = normalizeBandRichBlocks(cell.paragraphs, true)?.filter((part): part is BandRichParagraph => part.type === "paragraph");
        }
        if (!nested && Array.isArray(cell.tables) && cell.tables.length > 0 && cell.tables.length <= 4) {
          const paragraphCount = out.paragraphs?.length ?? 0;
          const tables: { at: number; table: BandRichTable }[] = [];
          for (const entry of cell.tables as unknown[]) {
            if (!entry || typeof entry !== "object") continue;
            const { at, table } = entry as { at?: unknown; table?: unknown };
            if (typeof at !== "number" || !Number.isInteger(at) || at < 0 || at > paragraphCount) continue;
            if (tables.length && at < tables[tables.length - 1].at) continue;
            const inner = normalizeBandRichBlocks([table], true, true)?.[0];
            if (inner?.type === "table") tables.push({ at, table: inner });
          }
          if (tables.length) out.tables = tables;
        }
        if (cell.align === "center" || cell.align === "right") out.align = cell.align;
        if (cell.verticalAlign === "top" || cell.verticalAlign === "center" || cell.verticalAlign === "bottom") out.verticalAlign = cell.verticalAlign;
        const margins = normalizeCellMargins(cell.cellMargin);
        if (margins) out.cellMargin = margins;
        const shading = normalizeCellBackgroundColor(cell.shading);
        if (shading) out.shading = shading;
        const cellBorders = normalizeBandRichBorders(cell.borders, BAND_CELL_BORDER_SIDES);
        if (cellBorders) out.borders = cellBorders;
        const runs: BandRichRun[] = [];
        for (const rawRun of Array.isArray(cell.runs)
          ? cell.runs.slice(0, 256)
          : []) {
          if (!rawRun || typeof rawRun !== "object") continue;
          const run = rawRun as Record<string, unknown>;
          const token = isBandFieldToken(run.token) ? run.token : null;
          if (!token && (typeof run.text !== "string" || !run.text)) continue;
          const normalizedRun: BandRichRun = token ? { token } : { text: clipBandText(run.text as string) };
          if (typeof run.bold === "boolean") normalizedRun.bold = run.bold;
          if (typeof run.italic === "boolean") normalizedRun.italic = run.italic;
          if (run.underline === true) normalizedRun.underline = true;
          if ("font" in run) { const font = readableBandRunFont(run.font); if (font) normalizedRun.font = font; }
          const size = run.sizePt ?? run.size_pt;
          if (typeof size === "number" && size >= 4 && size <= 96) {
            normalizedRun.sizePt = size;
          }
          if (
            typeof run.color === "string" &&
            BAND_RICH_COLOR_RE.test(run.color)
          ) {
            normalizedRun.color = run.color;
          }
          if (isBandCharStyleId(run.charStyleId)) normalizedRun.charStyleId = run.charStyleId;
          runs.push(normalizedRun);
        }
        if (!runs.length) {
          const projectedRuns = bandRichRunsFromProjectedText(out.text);
          if (projectedRuns) runs.push(...projectedRuns);
        }
        if (runs.length) {
          out.runs = runs;
          out.text = bandRichRunsText(runs);
        }
        const colspan = positiveInt(cell.colspan);
        const rowspan = positiveInt(cell.rowspan);
        if (colspan !== null && colspan > 1 && colspan <= 20) {
          out.colspan = colspan;
        }
        if (rowspan !== null && rowspan > 1 && rowspan <= 20) {
          out.rowspan = rowspan;
        }
        cells.push(out.paragraphs?.length ? withBandRichCellParagraphs(out, out.paragraphs) : out);
      }
      if (!cells.length) continue;
      const table: BandRichTable = { type: "table", rows, cols, cells };
      const widths = record.columnWidthsPx ?? record.column_widths_px;
      if (Array.isArray(widths)) {
        const clean = widths
          .slice(0, 12)
          .map((width) =>
            positiveInt(width) === null ? 0 : (width as number),
          );
        if (clean.some((width) => width > 0)) table.columnWidthsPx = clean;
      }
      if (record.tableAlign === "center" || record.tableAlign === "right") table.tableAlign = record.tableAlign;
      if (record.bidiVisual === true) table.bidiVisual = true;
      if (
        typeof record.tableIndentTwips === "number" &&
        Number.isInteger(record.tableIndentTwips) &&
        record.tableIndentTwips !== 0 &&
        Math.abs(record.tableIndentTwips) <= 31_680
      ) table.tableIndentTwips = record.tableIndentTwips;
      const floatPosition = normalizeBandRichTableFloat(record.floatPosition);
      if (floatPosition) table.floatPosition = floatPosition;
      const nativeGrid = record.nativeColumnWidthsTwips;
      if (Array.isArray(nativeGrid) && nativeGrid.length === cols && nativeGrid.every(width => positiveInt(width) !== null && width <= 75_000)) {
        table.nativeColumnWidthsTwips = [...nativeGrid];
      }
      // Kept through normalization like every other width field: dropping it
      // here silently fell back to the cached absolute grid, so the server's
      // percentage reading never reached the band that draws the table.
      const relative = record.columnWidthsPct;
      if (
        Array.isArray(relative) &&
        relative.length === cols &&
        relative.every(
          (share) =>
            typeof share === "number" &&
            Number.isFinite(share) &&
            share > 0 &&
            share <= 100,
        )
      ) {
        const total = (relative as number[]).reduce((sum, share) => sum + share, 0);
        if (total >= 99 && total <= 101) table.columnWidthsPct = [...(relative as number[])];
      }
      const tableBorders = normalizeBandRichBorders(record.borders);
      if (tableBorders) table.borders = tableBorders;
      const rowHeights = normalizeBandRichRowHeights(record.rowHeights, rows);
      if (rowHeights) table.rowHeights = rowHeights;
      blocks.push(table);
    }
  }
  if (!allowEmptyParagraph && blocks.every(isBlankBandParagraph)) return null;
  return blocks.length ? blocks : null;
}

export interface RichBandsConfig {
  header: BandRichBlock[] | null;
  footer: BandRichBlock[] | null;
  firstPageHeader: BandRichBlock[] | null;
  firstPageFooter: BandRichBlock[] | null;
  evenPageHeader: BandRichBlock[] | null;
  evenPageFooter: BandRichBlock[] | null;
  differentFirstPage: boolean;
  differentOddEven: boolean;
}

/** Word band precedence for RICH bands (mirrors resolvePageBandsWithOddEven). */
export function resolveRichPageBands(
  pageIndex: number,
  config: RichBandsConfig,
): { header: BandRichBlock[] | null; footer: BandRichBlock[] | null } {
  if (config.differentFirstPage && pageIndex === 0) {
    return { header: config.firstPageHeader, footer: config.firstPageFooter };
  }
  if (config.differentOddEven && pageIndex % 2 === 1) {
    return { header: config.evenPageHeader, footer: config.evenPageFooter };
  }
  return { header: config.header, footer: config.footer };
}

// ---------------------------------------------------------------------------
// PER-SECTION bands: Word renders each section's own header/footer. The BE
// emits one EFFECTIVE entry per section (link-inheritance materialized);
// the paged renderer resolves a sheet's band from its section index.
// ---------------------------------------------------------------------------

export interface SectionBandEntry {
  headerText?: string;
  footerText?: string;
  firstPageHeader?: string;
  firstPageFooter?: string;
  evenPageHeader?: string;
  evenPageFooter?: string;
  headerRich?: BandRichBlock[];
  footerRich?: BandRichBlock[];
  firstPageHeaderRich?: BandRichBlock[];
  firstPageFooterRich?: BandRichBlock[];
  evenPageHeaderRich?: BandRichBlock[];
  evenPageFooterRich?: BandRichBlock[];
  /** True means this section intentionally owns NO relationship for the
   * corresponding story and inherits the previous section's part (Word's
   * `is_linked_to_previous`).  Projection also materializes the effective
   * content for deterministic screen rendering; these flags retain the
   * relationship semantics for a no-edit DOCX round-trip.  Editing one story
   * clears only its matching flag, exactly like Word breaking "Link to
   * Previous" for that header/footer variant. */
  headerLinkedToPrevious?: boolean;
  footerLinkedToPrevious?: boolean;
  firstPageHeaderLinkedToPrevious?: boolean;
  firstPageFooterLinkedToPrevious?: boolean;
  evenPageHeaderLinkedToPrevious?: boolean;
  evenPageFooterLinkedToPrevious?: boolean;
  differentFirstPage?: boolean;
  differentOddEven?: boolean;
  /** NATIVE per-page band semantics: this entry's bands render on the
   * FIRST sheet of its section only - continuation pages born from typing
   * overflow stay clean ("回车出来的新页不继承页眉页脚"). Imported docx
   * sections never carry this flag and keep Word's every-page rendering. */
  pageScoped?: boolean;
}

/** Normalize an untrusted per-section band payload; null = unset. */
export function normalizeSectionBands(
  value: unknown,
): SectionBandEntry[] | null {
  // Single-entry arrays are legal since per-page bands: a sectionless
  // one-page document materializes exactly one page-scoped entry.
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_SECTION_BANDS) {
    return null;
  }
  const entries: SectionBandEntry[] = [];
  let any = false;
  for (const raw of value.slice(0, MAX_SECTION_BANDS)) {
    const record =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const entry: SectionBandEntry = {};
    for (const key of [
      "headerText",
      "footerText",
      "firstPageHeader",
      "firstPageFooter",
      "evenPageHeader",
      "evenPageFooter",
    ] as const) {
      const text = sanitizeHeaderFooterText(record[key]);
      if (text) {
        entry[key] = text;
        any = true;
      }
    }
    for (const key of [
      "headerRich",
      "footerRich",
      "firstPageHeaderRich",
      "firstPageFooterRich",
      "evenPageHeaderRich",
      "evenPageFooterRich",
    ] as const) {
      const blocks = normalizeBandRichBlocks(record[key]);
      if (blocks) {
        entry[key] = blocks;
        any = true;
      }
    }
    for (const key of [
      "headerLinkedToPrevious",
      "footerLinkedToPrevious",
      "firstPageHeaderLinkedToPrevious",
      "firstPageFooterLinkedToPrevious",
      "evenPageHeaderLinkedToPrevious",
      "evenPageFooterLinkedToPrevious",
    ] as const) {
      if (record[key] === true) {
        entry[key] = true;
        any = true;
      }
    }
    // A deliberately blank first/even-page story still has section semantics.
    // Retain its switches through hydration and save even without band text.
    for (const key of ["differentFirstPage", "differentOddEven", "pageScoped"] as const) {
      if (record[key] === true) {
        entry[key] = true;
        any = true;
      }
    }
    entries.push(entry);
  }
  return any ? entries : null;
}

export interface ResolvedSheetBands {
  headerText: string | null;
  footerText: string | null;
  headerRich: BandRichBlock[] | null;
  footerRich: BandRichBlock[] | null;
}

/**
 * Resolve one sheet's bands from its SECTION entry. First-page bands apply to
 * the first editable sheet of every section; even-page bands follow global
 * physical page parity, including any implicit odd/even section filler.
 */
export function resolveSectionSheetBands(
  pageIndex: number,
  sectionIndex: number,
  sections: SectionBandEntry[],
  options?: {
    /** Whether this sheet is the FIRST sheet of its section (callers compare
     * the previous sheet's section index). When omitted, document page 1 is
     * treated as the only known first sheet for backward compatibility. */
    isFirstSheetOfSection?: boolean;
  },
): ResolvedSheetBands {
  const entry =
    sections[Math.min(Math.max(sectionIndex, 0), sections.length - 1)] ?? {};
  if (entry.pageScoped === true && options?.isFirstSheetOfSection === false) {
    // Native per-page bands: continuation sheets of the section are CLEAN.
    return {
      headerText: null,
      footerText: null,
      headerRich: null,
      footerRich: null,
    };
  }
  const isFirstSheetOfSection =
    options?.isFirstSheetOfSection ?? pageIndex === 0;
  const useFirst = entry.differentFirstPage === true && isFirstSheetOfSection;
  const useEven = entry.differentOddEven === true && pageIndex % 2 === 1;
  const pick = <T>(
    first: T | undefined,
    even: T | undefined,
    normal: T | undefined,
  ): T | null => {
    if (useFirst) return first ?? null;
    if (useEven) return even ?? null;
    return normal ?? null;
  };
  return {
    headerText: pick(
      entry.firstPageHeader,
      entry.evenPageHeader,
      entry.headerText,
    ),
    footerText: pick(
      entry.firstPageFooter,
      entry.evenPageFooter,
      entry.footerText,
    ),
    headerRich: pick(
      entry.firstPageHeaderRich,
      entry.evenPageHeaderRich,
      entry.headerRich,
    ),
    footerRich: pick(
      entry.firstPageFooterRich,
      entry.evenPageFooterRich,
      entry.footerRich,
    ),
  };
}

/** Which band VARIANT a given sheet edits (Word precedence): a section's first
 * sheet with different-first-page edits the first-page pair; otherwise an even
 * physical page with different-odd-even edits the even pair. */
export type BandVariant = "normal" | "first" | "even";

export function resolveBandVariantForSheet(
  pageIndex: number,
  config: { differentFirstPage: boolean; differentOddEven: boolean },
  isFirstSheetOfSection: boolean = pageIndex === 0,
): BandVariant {
  if (config.differentFirstPage && isFirstSheetOfSection) return "first";
  if (config.differentOddEven && pageIndex % 2 === 1) return "even";
  return "normal";
}

/**
 * The paragraph style Word types a new header (or footer) line in: the
 * document's own built-in "header"/"footer" style, found by its name since a
 * localized Word gives it another id (a Chinese Word's "a3"). Null when the
 * page carries no Word styles (the export writes Word's Header style there)
 * or its Word styles have none.
 */
export function bandParagraphStyleId(
  attrs: Record<string, unknown> | null | undefined,
  kind: "header" | "footer",
): string | undefined {
  const definitions = attrs?.styleDefinitions;
  if (!definitions || typeof definitions !== "object") return undefined;
  const styles = (definitions as { styles?: unknown }).styles;
  if (!Array.isArray(styles)) return undefined;
  for (const style of styles) {
    if (!style || typeof style !== "object") continue;
    const record = style as Record<string, unknown>;
    if (
      record.type === "paragraph" &&
      typeof record.name === "string" &&
      record.name.toLowerCase() === kind &&
      typeof record.styleId === "string" &&
      /^[A-Za-z0-9_-]{1,64}$/.test(record.styleId)
    ) {
      return record.styleId;
    }
  }
  return undefined;
}
