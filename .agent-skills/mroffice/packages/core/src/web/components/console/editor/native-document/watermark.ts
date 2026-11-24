/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Pure helpers for the document-level text watermark (Word/WPS 水印 parity).
 *
 * A watermark is a single line of large, semi-transparent text painted BEHIND
 * the body content (Word's "DRAFT" / "CONFIDENTIAL" / "SAMPLE" stamp). Kept free
 * of any TipTap/React imports so the normalization + CSS derivation can be
 * unit-tested in isolation and reused by:
 *   - the DocumentPageSetup node extension (parse/render of the persisted doc
 *     attr that carries the watermark config),
 *   - the DocumentToolbar watermark control, and
 *   - NoteEditor / PagePreview, which paint the watermark layer onto the page.
 *
 * SECURITY: the text is plain user input. Control characters are stripped (never
 * merely escaped) and the length is clamped so neither a malicious paste nor an
 * AI instruction can smuggle markup, an attribute-breaking payload, or an
 * unbounded string. Literal angle brackets / quotes are PRESERVED here — React
 * escapes them when rendering the layer as text content, and the DOCX exporter
 * XML-escapes them — so only bytes that could break the DOM band are removed.
 * The color is validated through the SAME strict #rrggbb gate the editor's text
 * marks use ({@link normalizeCssColor}), so no CSS injection is possible.
 *
 * Only a TEXT watermark is modeled here; an image watermark is intentionally out
 * of scope (a v2 follow-up — see docx-export.ts).
 */

import { pxToPt } from "../../../../lib/office-units";
import { officeWashoutFilterCss } from "../../../../lib/office-picture-adjust-filter";
import { normalizeCssColor } from "../extensions/cssColor";

/** Hard upper bound for the watermark text (a generous single stamp line). */
export const MAX_WATERMARK_LENGTH = 64;

/** Default tint when none supplied: a light gray that reads as a stamp. */
export const DEFAULT_WATERMARK_COLOR = "#d1d5db";

/** Default opacity (0-1): faint enough to keep the body legible. */
export const DEFAULT_WATERMARK_OPACITY = 0.3;

/** Curated quick-set presets surfaced by the toolbar control. */
export const WATERMARK_PRESETS = ["DRAFT", "CONFIDENTIAL", "SAMPLE"] as const;

/** Longest font family name carried on the stamp (Word's own cap is 31). */
export const MAX_WATERMARK_FONT_FAMILY_LENGTH = 64;

/**
 * Bounds for Word's Custom Watermark "Size" in points. 1638 is Word's own
 * ceiling for a font size; the FLOOR is one point ABOVE the sentinel below,
 * because a `1pt` textpath is how real Word spells "Auto" — see
 * {@link WATERMARK_AUTO_VML_FONT_SIZE_PT}.
 */
export const MAX_WATERMARK_FONT_SIZE_PT = 1638;

/**
 * The `font-size` real Word writes into `v:textpath/@style` when the Custom
 * Watermark dialog's Size is "Auto".
 *
 * Measured, not assumed: the MIT HC031 header this repo pins by sha256 in
 * `tests/file_adapters/docx/test_p1_office_pr2_projection_contract.py` is real
 * Word output and states `font-family:"Calibri";font-size:1pt` on a box Word
 * sized to the page (527.85 x 131.95 pt) — and Word's own re-save keeps `1pt`
 * verbatim while it DROPS `36pt` (VML's default) and rewrites `144pt` as
 * `2in`. Under `#_x0000_t136`'s `fitshape="t"` the glyphs are stretched to the
 * shape box, so the nominal size never changes what Word draws
 * (docs/office-graphics/SHAPE-IMPORT-AUDIT.md §69.2): it is the number the
 * dialog shows and the number the box was authored from.
 */
export const WATERMARK_AUTO_VML_FONT_SIZE_PT = 1;

/**
 * The size ladder Word's Custom Watermark "Size" drop-down offers, above its
 * "Auto" entry. Presented by the toolbar control; any value inside the bounds
 * may still be typed, exactly as in Word's editable combo box.
 */
export const WATERMARK_FONT_SIZE_PRESETS = [
  8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72, 80, 96, 127, 144,
] as const;

// A font family name as VML/CSS may carry it WITHOUT quoting or escaping: no
// quote, semicolon, colon, comma, angle bracket or control byte can survive
// this gate, so the same string is safe inside `font-family:"…"` in a CSS
// declaration, in a `v:textpath/@style` attribute and in the XML attribute
// that carries it. Letters (including CJK), digits, space and the punctuation
// real font names use are all that is allowed.
const WATERMARK_FONT_FAMILY_RE =
  /^[\p{L}\p{N}][\p{L}\p{N} ._+()&#'-]{0,63}$/u;

// C0 control characters (U+0000-U+001F incl. tab/newline/CR), DEL (U+007F), and
// the C1 range (U+0080-U+009F). Stripped so a payload cannot break out of the
// DOM layer or the exported XML run. Declared via \x escapes (never literal
// control bytes) so the source stays reviewable.
const CONTROL_CHARS_RE = /[\x00-\x1f\x7f-\x9f]/g;

/** A normalized, render-ready watermark config. */
export interface WatermarkConfig {
  /** The stamp text (sanitized single line, 1..MAX_WATERMARK_LENGTH chars). */
  text: string;
  /** Canonical lowercase #rrggbb tint. */
  color: string;
  /** Opacity in [0, 1]. */
  opacity: number;
  /** Whether the stamp is rotated diagonally (~-45deg) vs. horizontal. */
  diagonal: boolean;
  /**
   * Word's Custom Watermark "Font". ABSENT (never `null`) when the source
   * states none, which is what every stamp written before this key existed
   * carries — so a stored page keeps its exact four-key shape and the API's
   * closed validator keeps accepting it.
   */
  fontFamily?: string;
  /**
   * Word's Custom Watermark "Size", in points. ABSENT = "Auto": the glyphs
   * fill the stamp's box rather than naming a size (see
   * {@link WATERMARK_AUTO_VML_FONT_SIZE_PT}).
   */
  fontSizePt?: number;
}

/**
 * Normalize a watermark font family, or `undefined` when the value is not one
 * this model can carry. Rejecting (rather than stripping) keeps the stamp
 * honest: a name that had to be mutated to be safe is not the author's font,
 * and falling back to the editor's own stamp face says so visibly.
 */
export function normalizeWatermarkFontFamily(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const family = value.replace(CONTROL_CHARS_RE, " ").replace(/\s+/g, " ").trim();
  if (!family || family.length > MAX_WATERMARK_FONT_FAMILY_LENGTH) return undefined;
  return WATERMARK_FONT_FAMILY_RE.test(family) ? family : undefined;
}

/**
 * Normalize a watermark font size in points, or `undefined` for "Auto".
 *
 * Anything at or below the `1pt` Word writes for Auto IS Auto — a stamp one
 * point tall is not a size a watermark dialog can express, and reading Word's
 * own sentinel as a literal size would put "1" in the box where Word shows
 * "Auto".
 */
export function normalizeWatermarkFontSizePt(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const points = Math.round(value * 10) / 10;
  if (points <= WATERMARK_AUTO_VML_FONT_SIZE_PT) return undefined;
  return points > MAX_WATERMARK_FONT_SIZE_PT ? undefined : points;
}

/** Collapse whitespace + strip control bytes from an arbitrary text input. */
function sanitizeWatermarkText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(CONTROL_CHARS_RE, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_WATERMARK_LENGTH);
}

/** Coerce an arbitrary value into an opacity in [0, 1], or the default. */
function clampOpacity(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_WATERMARK_OPACITY;
  }
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Normalize an arbitrary value (toolbar input, persisted attr, or imported
 * config) into a {@link WatermarkConfig}, or `null` when there is no usable
 * text. A watermark is "set" iff it has non-empty text; an empty/whitespace-only
 * `text` is treated as "unset" (no layer, no exported shape). Color falls back to
 * the default light gray when missing or invalid (never injected); opacity is
 * clamped; `diagonal` defaults to true and is coerced to a boolean.
 */
export function normalizeWatermark(value: unknown): WatermarkConfig | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const text = sanitizeWatermarkText(raw.text);
  if (!text) return null;
  const color = normalizeCssColor(raw.color) ?? DEFAULT_WATERMARK_COLOR;
  const opacity = clampOpacity(raw.opacity);
  // `diagonal` defaults to true: only an explicit `false` turns it off, so a
  // config that omits the flag (the common case) stays diagonal.
  const diagonal = raw.diagonal !== false;
  // Font / size are OMITTED when absent rather than carried as `null`: the
  // four-key bag every stored page and every export already holds stays byte
  // for byte what it was, and "no key" is the single spelling of Word's
  // default face and its "Auto" size on both sides of the wire.
  const fontFamily = normalizeWatermarkFontFamily(raw.fontFamily);
  const fontSizePt = normalizeWatermarkFontSizePt(raw.fontSizePt);
  return {
    text,
    color,
    opacity,
    diagonal,
    ...(fontFamily === undefined ? {} : { fontFamily }),
    ...(fontSizePt === undefined ? {} : { fontSizePt }),
  };
}

/**
 * Inline-style object (camelCased, React-friendly) for the watermark render
 * layer. Returns only values derived from the normalized config — a whitelisted
 * #rrggbb color, a numeric opacity, and a fixed transform — so it can never
 * carry injected CSS. The layer itself is positioned/sized by the stylesheet
 * (`.note-editor-watermark`); these props supply the per-document tint, opacity
 * and rotation only. `pointer-events` stays off (set in CSS) so the stamp never
 * blocks editing.
 */
export function watermarkCss(config: WatermarkConfig): {
  color: string;
  opacity: number;
  transform: string;
  fontFamily?: string;
  fontSize?: string;
} {
  return {
    color: config.color,
    opacity: config.opacity,
    // translate(-50%, -50%) centers the stamp on the page; the rotation is a
    // fixed developer-authored angle (never interpolated with user input).
    transform: config.diagonal
      ? "translate(-50%, -50%) rotate(-45deg)"
      : "translate(-50%, -50%)",
    // The family passed the strict whitelist above, so no quote/semicolon can
    // be in it and the quoted name cannot end the declaration. The stylesheet
    // face stays as the fallback for a font this device does not have.
    ...(config.fontFamily === undefined
      ? {}
      : {
          fontFamily: `"${config.fontFamily}", var(--font-sans, system-ui, sans-serif)`,
        }),
    // An absent size is Word's "Auto": the stylesheet's own stamp size keeps
    // filling the sheet, which is what this build has always drawn.
    ...(config.fontSizePt === undefined
      ? {}
      : { fontSize: `${config.fontSizePt}pt` }),
  };
}

/**
 * The ONE spelling of a watermark's `v:textpath/@style`, shared by the browser
 * DOCX writer and (restated and pinned equal) by the API's
 * `document_docx_watermark_protection.watermark_text_path_style`.
 *
 * `font-weight:bold` is this build's own stamp face and has been in every
 * MRAI-written watermark since the feature shipped, so it stays, and last.
 * Auto states Word's own `font-size:1pt` rather than omitting the declaration:
 * an absent `font-size` is VML's 36pt default, and Word's Custom Watermark
 * dialog would show "36" where the document means "Auto". The canonical
 * re-import scan in `officeCompiler` therefore accepts BOTH spellings — every
 * watermark MRAI wrote before this key existed omits `font-size` and still
 * reads back as the same Auto stamp.
 */
export function watermarkTextPathStyle(config: WatermarkConfig): string {
  const family = config.fontFamily ?? "Calibri";
  const size = config.fontSizePt ?? WATERMARK_AUTO_VML_FONT_SIZE_PT;
  return `font-family:"${family}";font-size:${size}pt;font-weight:bold`;
}

// ---------------------------------------------------------------------------
// Picture watermark (Word's Printed Watermark > Picture watermark).
//
// Word semantics ("Insert a watermark", Microsoft Support): Select Picture
// picks the image; Scale is Auto (fit between the margins) or a percentage of
// the picture's own size (50%, 100%, 150%, 200%, 500%, or any value); Washout
// (on by default) fades the picture so text stays legible. Word writes it as a
// header-anchored VML picture (`v:shape type="#_x0000_t75"` with
// `v:imagedata`), centred on the margins behind the text, the Washout as
// `gain="19661f" blacklevel="22938f"`.
//
// Stored on the same `watermark` doc attr as the text stamp, told apart by
// `kind: "picture"`. The drawn size is stored (points), not the Scale choice:
// the size is what the file carries, and the dialog re-derives Scale from it.
// ---------------------------------------------------------------------------

/** Word's Washout: `v:imagedata gain` / `blacklevel` (16.16 fixed point). */
export const WATERMARK_WASHOUT_GAIN = "19661f";
export const WATERMARK_WASHOUT_BLACKLEVEL = "22938f";
/** Longest picture payload the attr carries (a data URL, in characters). */
export const MAX_PICTURE_WATERMARK_SRC_LENGTH = 4_000_000;
/** Word's Scale presets, above its "Auto" entry. */
export const PICTURE_WATERMARK_SCALE_PRESETS = [50, 100, 150, 200, 500] as const;

export interface PictureWatermarkConfig {
  kind: "picture";
  /** A `data:image/(png|jpeg|gif);base64,` payload. */
  src: string;
  /** Drawn size on the page, in points (Word's shape width/height). */
  widthPt: number;
  heightPt: number;
  /** Word's Washout. */
  washout: boolean;
}

const PICTURE_SRC_RE = /^data:image\/(?:png|jpeg|gif);base64,[A-Za-z0-9+/]+={0,2}$/;

/**
 * Closed normalizer for a picture watermark: exactly the five keys, a raster
 * data URL, and a positive size of at most 22 in (1584 pt) per side.
 */
export function normalizePictureWatermark(
  value: unknown,
): PictureWatermarkConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const keys = Object.keys(raw).sort().join(",");
  if (keys !== "heightPt,kind,src,washout,widthPt") return null;
  if (raw.kind !== "picture" || typeof raw.washout !== "boolean") return null;
  if (
    typeof raw.src !== "string" ||
    raw.src.length > MAX_PICTURE_WATERMARK_SRC_LENGTH ||
    !PICTURE_SRC_RE.test(raw.src)
  ) {
    return null;
  }
  const size = (n: unknown): number | null =>
    typeof n === "number" && Number.isFinite(n) && n > 0 && n <= 1_584
      ? Math.round(n * 100) / 100
      : null;
  const widthPt = size(raw.widthPt);
  const heightPt = size(raw.heightPt);
  if (widthPt === null || heightPt === null) return null;
  return { kind: "picture", src: raw.src, widthPt, heightPt, washout: raw.washout };
}

/** Either kind of Word watermark the `watermark` attr may hold. */
export type DocumentWatermark = WatermarkConfig | PictureWatermarkConfig;

export function normalizeDocumentWatermark(value: unknown): DocumentWatermark | null {
  return normalizePictureWatermark(value) ?? normalizeWatermark(value);
}

/**
 * The drawn size for a Scale choice: Auto fits the picture between the page
 * margins (never enlarging past the text width or height), a percentage
 * scales the picture's own size at 96 dpi. PURE.
 */
export function pictureWatermarkSizePt(
  naturalWidthPx: number,
  naturalHeightPx: number,
  scalePct: number | "auto",
  textArea: { widthPt: number; heightPt: number },
): { widthPt: number; heightPt: number } | null {
  if (
    !(naturalWidthPx > 0) ||
    !(naturalHeightPx > 0) ||
    !(textArea.widthPt > 0) ||
    !(textArea.heightPt > 0)
  ) {
    return null;
  }
  const naturalWidthPt = pxToPt(naturalWidthPx);
  const naturalHeightPt = pxToPt(naturalHeightPx);
  const factor =
    scalePct === "auto"
      ? Math.min(textArea.widthPt / naturalWidthPt, textArea.heightPt / naturalHeightPt)
      : scalePct / 100;
  if (!(factor > 0)) return null;
  const widthPt = Math.round(naturalWidthPt * factor * 100) / 100;
  const heightPt = Math.round(naturalHeightPt * factor * 100) / 100;
  return widthPt > 0 && heightPt > 0 && widthPt <= 1_584 && heightPt <= 1_584
    ? { widthPt, heightPt }
    : null;
}

/**
 * How a washed-out picture of the document is drawn (a picture watermark,
 * a header picture Word washes out): Word's Washout correction as a filter,
 * opaque (0.3 c + 0.805 per channel: black prints 205, mid gray 244; probe
 * docx-look probes/washout). Drawn at 30 % opacity it printed black at 179
 * and every watermark twice as dark as Word's (corpus R308-D01, R440-D15).
 * `window.__docsWashoutOpacity = true` keeps the older look (A/B).
 */
export function washoutPictureStyle(
  owner: Document | null = typeof document === "undefined" ? null : document,
): { filter: string; opacity: string } {
  const win = owner?.defaultView as (Window & { __docsWashoutOpacity?: boolean }) | null | undefined;
  const filter = win?.__docsWashoutOpacity === true ? "" : officeWashoutFilterCss(owner);
  return filter ? { filter, opacity: "1" } : { filter: "", opacity: "0.3" };
}
