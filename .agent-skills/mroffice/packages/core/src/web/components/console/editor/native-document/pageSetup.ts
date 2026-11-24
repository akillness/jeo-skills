/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { ptToPx } from "../../../../lib/office-units";
import { normalizeOfficeShapeGradient, officeGradientCss, type OfficeShapeGradient } from "../../../../lib/office-shape-paint";
/**
 * Pure helpers for document page setup (page size + margins), kept free of any
 * TipTap/React imports so the whitelist normalization and the CSS-geometry
 * derivation can be unit-tested in isolation and reused by:
 *   - the Document node extension (parse/render of the persisted doc attrs),
 *   - the DocumentToolbar selects, and
 *   - NoteEditor, which paints the chosen geometry onto the on-screen "page".
 *
 * Geometry mirrors Word/WPS practice and the existing on-screen page surface
 * (`.note-editor-body-main`, ~816 x 1056 px = US Letter at 96 dpi). Sizes are
 * expressed in CSS pixels at 96 dpi so they line up with the surrounding layout
 * and print cleanly. All values come from a closed whitelist, so neither a
 * malicious page nor a stray import can inject arbitrary CSS through these.
 */

/**
 * Allowed page sizes (Word/WPS quick-pick presets). `custom` is the escape
 * hatch: when selected, the concrete dimensions come from the doc's
 * `customPageSize` attr (see {@link normalizeCustomPageSize}) rather than the
 * {@link PAGE_SIZE_PX} table.
 */
export const PAGE_SIZE_VALUES = [
  "letter",
  "a4",
  "legal",
  "a3",
  "a5",
  "b4",
  "b5",
  "tabloid",
  "custom",
] as const;
export type PageSize = (typeof PAGE_SIZE_VALUES)[number];

/** The whitelisted PRESET sizes only (excludes the `custom` escape hatch). */
export const PAGE_SIZE_PRESET_VALUES = PAGE_SIZE_VALUES.filter(
  (value) => value !== "custom",
) as ReadonlyArray<Exclude<PageSize, "custom">>;

/**
 * Allowed margin presets (Word/WPS parity: Normal / Narrow / Wide). `custom` is
 * the escape hatch: when selected, the concrete margins come from the doc's
 * `customPageMargins` attr (see {@link normalizeCustomPageMargins}).
 */
export const PAGE_MARGIN_VALUES = [
  "normal",
  "narrow",
  "wide",
  "custom",
] as const;
export type PageMargins = (typeof PAGE_MARGIN_VALUES)[number];

/** The whitelisted PRESET margins only (excludes the `custom` escape hatch). */
export const PAGE_MARGIN_PRESET_VALUES = PAGE_MARGIN_VALUES.filter(
  (value) => value !== "custom",
) as ReadonlyArray<Exclude<PageMargins, "custom">>;

/**
 * Allowed page orientations (Word/WPS «布局 → 纸张方向» — the Layout ribbon's
 * most-used command). Orientation is INDEPENDENT of the size preset: a document
 * keeps its paper (Letter / A4 / …) and merely flips which dimension is the
 * width vs the height. "portrait" (taller than wide) is the default; "landscape"
 * swaps width↔height. A closed whitelist, so neither a malicious page nor a
 * stray import can inject anything through it.
 */
export const PAGE_ORIENTATION_VALUES = ["portrait", "landscape"] as const;
export type PageOrientation = (typeof PAGE_ORIENTATION_VALUES)[number];

/** The default applied when a document carries no explicit page setup. */
export const DEFAULT_PAGE_SIZE: PageSize = "letter";
export const DEFAULT_PAGE_MARGINS: PageMargins = "normal";
export const DEFAULT_PAGE_ORIENTATION: PageOrientation = "portrait";

/**
 * Page setup lives on the ProseMirror document attrs object. Content-only and
 * decoration-only transactions retain that immutable object, so they must not
 * fan out into React page-setup state updates.
 */
export function shouldSyncPageSetupFromDocumentAttrs(
  lastSyncedAttrs: Readonly<Record<string, unknown>> | null,
  nextAttrs: Readonly<Record<string, unknown>>,
): boolean {
  return lastSyncedAttrs !== nextAttrs;
}

const PAGE_SIZE_SET = new Set<string>(PAGE_SIZE_VALUES);
const PAGE_MARGIN_SET = new Set<string>(PAGE_MARGIN_VALUES);
const PAGE_ORIENTATION_SET = new Set<string>(PAGE_ORIENTATION_VALUES);

/** CSS pixels per inch at 96 dpi — the conversion base for every dimension. */
export const PX_PER_INCH = 96;
/** OOXML twips (twentieths of a point) per inch: 1 in = 1440 twips. */
export const TWIPS_PER_INCH = 1440;

/**
 * Page dimensions in CSS pixels at 96 dpi. Each preset's pixel size is its
 * physical paper size rounded to whole CSS pixels at 96 dpi (mm sizes via
 * 1 in = 25.4 mm):
 *   - Letter:  8.5 x 11 in   -> 816 x 1056 px (matches the existing surface).
 *   - A4:      210 x 297 mm  -> ~794 x 1123 px.
 *   - Legal:   8.5 x 14 in   -> 816 x 1344 px.
 *   - A3:      297 x 420 mm  -> ~1123 x 1587 px.
 *   - A5:      148 x 210 mm  -> ~559 x 794 px.
 *   - B4 (JIS): 257 x 364 mm -> ~971 x 1376 px (Word's CJK B series is JIS).
 *   - B5 (JIS): 182 x 257 mm -> ~688 x 971 px.
 *   - Tabloid: 11 x 17 in    -> 1056 x 1632 px.
 * Keyed by the PRESET sizes only; `custom` is resolved from the doc attr.
 */
export const PAGE_SIZE_PX: Record<
  Exclude<PageSize, "custom">,
  { width: number; height: number }
> = {
  letter: { width: 816, height: 1056 },
  a4: { width: 794, height: 1123 },
  legal: { width: 816, height: 1344 },
  a3: { width: 1123, height: 1587 },
  a5: { width: 559, height: 794 },
  b4: { width: 971, height: 1376 },
  b5: { width: 688, height: 971 },
  tabloid: { width: 1056, height: 1632 },
};

/**
 * The paper size Word writes to `w:pgSz` for each preset, in twips. A metric
 * stock is its millimetre size rounded ONCE at 1440 twips per inch (A4 =
 * 11906 × 16838); converting the whole-pixel table above instead rounds twice
 * and writes 11910 × 16845, a sheet 0.2 mm wider and 0.3 mm taller than A4.
 */
export const PAGE_SIZE_TWIPS: Record<
  Exclude<PageSize, "custom">,
  { width: number; height: number }
> = {
  letter: { width: 12240, height: 15840 },
  a4: { width: 11906, height: 16838 },
  legal: { width: 12240, height: 20160 },
  a3: { width: 16838, height: 23811 },
  a5: { width: 8391, height: 11906 },
  b4: { width: 14570, height: 20636 },
  b5: { width: 10318, height: 14570 },
  tabloid: { width: 15840, height: 24480 },
};

/**
 * Margin presets in CSS pixels at 96 dpi. Keyed by the PRESET margins only;
 * `custom` is resolved from the doc attr.
 *   - Normal: 1 in       -> 96 px.
 *   - Narrow: 0.5 in     -> 48 px.
 *   - Wide:   2 in sides -> 192 px horizontally, 1 in vertically.
 */
export const PAGE_MARGIN_PX: Record<
  Exclude<PageMargins, "custom">,
  { vertical: number; horizontal: number }
> = {
  normal: { vertical: 96, horizontal: 96 },
  narrow: { vertical: 48, horizontal: 48 },
  wide: { vertical: 96, horizontal: 192 },
};

/**
 * Per-edge INCH values of a margin preset, for the Margins gallery. Word lists
 * the four measurements under each preset's name (Top/Bottom/Left/Right), so the
 * gallery reads the same numbers the export writes. PURE.
 */
export function pageMarginPresetInches(
  preset: Exclude<PageMargins, "custom">,
): Readonly<{ top: number; right: number; bottom: number; left: number }> {
  const px = PAGE_MARGIN_PX[preset];
  return {
    top: px.vertical / PX_PER_INCH,
    right: px.horizontal / PX_PER_INCH,
    bottom: px.vertical / PX_PER_INCH,
    left: px.horizontal / PX_PER_INCH,
  };
}

/** A page's four margins in twips (1440 per inch). */
export interface MarginTwips {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

/**
 * Word's Layout > Margins gallery, in its order: Normal, Narrow, Moderate,
 * Wide, Mirrored and Office 2003 Default (Word for Windows; the Chinese
 * template's own "Normal" -- 2.54 cm top and bottom, 3.18 cm left and right --
 * is the Office 2003 row here, as MRAI's Normal stays the 1 in all round a
 * new document has). Mirrored sets the document's Multiple pages to Mirror
 * margins, so its left and right are the inside and outside of a spread; every
 * other row turns Mirror margins off. The four enum presets (`normal`,
 * `narrow`, `wide`) keep their ids so existing documents still select them.
 */
export const MARGIN_GALLERY_PRESETS = [
  { id: "normal", twips: { top: 1440, bottom: 1440, left: 1440, right: 1440 }, mirrored: false },
  { id: "narrow", twips: { top: 720, bottom: 720, left: 720, right: 720 }, mirrored: false },
  { id: "moderate", twips: { top: 1440, bottom: 1440, left: 1080, right: 1080 }, mirrored: false },
  { id: "wide", twips: { top: 1440, bottom: 1440, left: 2880, right: 2880 }, mirrored: false },
  { id: "mirrored", twips: { top: 1440, bottom: 1440, left: 1800, right: 1440 }, mirrored: true },
  { id: "office2003", twips: { top: 1440, bottom: 1440, left: 1800, right: 1800 }, mirrored: false },
] as const satisfies ReadonlyArray<{
  id: string;
  twips: MarginTwips;
  mirrored: boolean;
}>;

export type MarginGalleryPresetId = (typeof MARGIN_GALLERY_PRESETS)[number]["id"];

/**
 * The gallery row a section's margins (and the document's Mirror margins)
 * match, or null for custom margins. Word rounds its measurements to
 * hundredths of a unit, so two twips of slack keep an imported 1800-twip
 * margin written as 1799 on the same row. PURE.
 */
export function marginGalleryPresetFor(
  margins: MarginTwips,
  mirrored: boolean,
): MarginGalleryPresetId | null {
  const near = (a: number, b: number) => Math.abs(a - b) <= 2;
  const match = MARGIN_GALLERY_PRESETS.find(
    (preset) =>
      preset.mirrored === mirrored &&
      near(preset.twips.top, margins.top) &&
      near(preset.twips.bottom, margins.bottom) &&
      near(preset.twips.left, margins.left) &&
      near(preset.twips.right, margins.right),
  );
  return match?.id ?? null;
}

/**
 * Word's Last Custom Setting: the margins the Custom Margins dialog last
 * applied, kept for this viewer (Word keeps it per user, not per document).
 */
export interface LastCustomMargins {
  readonly twips: MarginTwips;
  readonly mirrored: boolean;
}

const LAST_CUSTOM_MARGINS_KEY = "mrai.docs.lastCustomMargins.v1";

function validTwips(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 31_680;
}

export function readLastCustomMargins(): LastCustomMargins | null {
  try {
    const raw = globalThis.localStorage?.getItem(LAST_CUSTOM_MARGINS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { twips?: Record<string, unknown>; mirrored?: unknown };
    const twips = parsed.twips;
    if (
      !twips ||
      !validTwips(twips.top) ||
      !validTwips(twips.bottom) ||
      !validTwips(twips.left) ||
      !validTwips(twips.right)
    ) {
      return null;
    }
    return {
      twips: { top: twips.top, bottom: twips.bottom, left: twips.left, right: twips.right },
      mirrored: parsed.mirrored === true,
    };
  } catch {
    return null;
  }
}

export function rememberLastCustomMargins(value: LastCustomMargins): void {
  try {
    globalThis.localStorage?.setItem(LAST_CUSTOM_MARGINS_KEY, JSON.stringify(value));
  } catch {
    // Private windows and blocked storage: the gallery just has no such row.
  }
}

/**
 * The paper stocks whose dimensions Word states in MILLIMETRES rather than
 * inches. Word follows the stock's own definition: the ISO A series and the JIS
 * B series are metric papers, while Letter/Legal/Tabloid are imperial.
 */
const METRIC_PAGE_SIZES = new Set<string>(["a3", "a4", "a5", "b4", "b5"]);

/**
 * The dimensions line shown under a page-size preset's name, e.g. `8.5″ × 11″`
 * for Letter and `210 × 297 mm` for A4. Derived from the same
 * {@link PAGE_SIZE_PX} table the surface and the export use, so the gallery can
 * never quote a size the document would not get. PURE.
 */
export function pageSizePresetDimensionsLabel(
  preset: Exclude<PageSize, "custom">,
): string {
  const { width, height } = PAGE_SIZE_PX[preset];
  if (METRIC_PAGE_SIZES.has(preset)) {
    const mm = (px: number) => Math.round((px / PX_PER_INCH) * 25.4);
    return `${mm(width)} × ${mm(height)} mm`;
  }
  const inches = (px: number) => Number((px / PX_PER_INCH).toFixed(2));
  return `${inches(width)}″ × ${inches(height)}″`;
}

// ---------------------------------------------------------------------------
// Custom page size + custom margins (the numeric-entry escape hatch).
//
// The unit shown to the user and stored in these attrs is INCHES (the presets
// are described in inches: "1 in", "0.5 in", "2 in"). Storing inches keeps the
// model unit-agnostic — the px and twip conversions are derived purely from the
// inch value, so a custom value round-trips to OOXML without a lossy px hop.
//
// Every value is clamped to a sane physical range so neither a malicious page
// nor a fat-fingered entry can produce an absurd surface or an OOXML `<w:pgSz>`
// some readers reject. Garbage (NaN/∞/≤0/string) falls back so the document
// still renders.
// ---------------------------------------------------------------------------

/** Custom page dimensions, stored in INCHES. */
export interface CustomPageSizeInches {
  width: number;
  height: number;
}

/** Custom margins (per side), stored in INCHES. */
export interface CustomPageMarginsInches {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Inclusive clamps (inches) for a custom page dimension. 1in floor keeps a
 * usable page; 48in ceiling covers the largest practical paper (e.g. ANSI E /
 * large-format plots) while bounding the OOXML twip value well under Word's
 * 22in `<w:pgSz>` advisory max for typical paper without rejecting big formats.
 */
export const CUSTOM_PAGE_SIZE_MIN_IN = 1;
export const CUSTOM_PAGE_SIZE_MAX_IN = 48;
/**
 * Inclusive clamps (inches) for a single custom margin. 0 allows a true
 * edge-to-edge (borderless) margin; the ceiling keeps opposite margins from
 * summing past the page so content never collapses to zero width.
 */
export const CUSTOM_PAGE_MARGIN_MIN_IN = 0;
export const CUSTOM_PAGE_MARGIN_MAX_IN = 22;

/** Round an inch value to thousandths so stored attrs stay tidy + comparable. */
function roundInches(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Clamp + round a single inch dimension, or null when not a finite number. */
function coerceInchesInRange(
  value: unknown,
  min: number,
  max: number,
): number | null {
  const n = typeof value === "string" ? Number(value.trim()) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return roundInches(Math.min(Math.max(n, min), max));
}

/**
 * Coerce arbitrary input into a clamped {@link CustomPageSizeInches}, or `null`
 * when EITHER dimension is unusable (so the caller falls back to the preset).
 * Both width and height must be valid — a half-specified custom size is not a
 * size.
 */
export function normalizeCustomPageSize(
  value: unknown,
): CustomPageSizeInches | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const width = coerceInchesInRange(
    raw.width,
    CUSTOM_PAGE_SIZE_MIN_IN,
    CUSTOM_PAGE_SIZE_MAX_IN,
  );
  const height = coerceInchesInRange(
    raw.height,
    CUSTOM_PAGE_SIZE_MIN_IN,
    CUSTOM_PAGE_SIZE_MAX_IN,
  );
  if (width === null || height === null) return null;
  return { width, height };
}

/**
 * Coerce arbitrary input into a clamped {@link CustomPageMarginsInches}, or
 * `null` when ANY side is unusable. All four sides must be valid so a partial
 * object never silently treats a missing side as zero.
 */
export function normalizeCustomPageMargins(
  value: unknown,
): CustomPageMarginsInches | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const sides = ["top", "right", "bottom", "left"] as const;
  const out = {} as CustomPageMarginsInches;
  for (const side of sides) {
    const inches = coerceInchesInRange(
      raw[side],
      CUSTOM_PAGE_MARGIN_MIN_IN,
      CUSTOM_PAGE_MARGIN_MAX_IN,
    );
    if (inches === null) return null;
    out[side] = inches;
  }
  return out;
}

/** Resolved page dimensions in px (preset OR custom), used by the surface. */
export interface ResolvedPageDimensionsPx {
  width: number;
  height: number;
}

/**
 * Resolve the concrete page dimensions (px) from a (size, customSize) pair, then
 * apply the optional `orientation` (landscape swaps width↔height). The custom
 * value applies ONLY while `size` resolves to `custom` — picking a preset must
 * take effect even when a stored custom value remains (Word semantics: an
 * imported doc carries `customPageSize` + `pageSize:"custom"`; choosing A4
 * afterwards renders A4, and switching back to 自定义 restores the stored
 * inches). Every producer couples the custom attr with the `custom` preset
 * (BE projection_to_page + officeCompiler), and the OOXML exporter
 * (pageGeometryTwips) already gates on exactly this pair, so rendering now
 * matches export. `orientation` defaults to portrait, so a call that omits it
 * (every legacy caller) is byte-for-byte unchanged. Always returns whole,
 * safe pixels.
 */
export function resolvePageDimensionsPx(
  size: unknown,
  customSize?: unknown,
  orientation?: unknown,
): ResolvedPageDimensionsPx {
  const resolvedSize = resolvePageSize(size);
  let base: ResolvedPageDimensionsPx;
  if (resolvedSize === "custom") {
    const custom = normalizeCustomPageSize(customSize);
    if (custom) {
      base = {
        width: Math.round(custom.width * PX_PER_INCH),
        height: Math.round(custom.height * PX_PER_INCH),
      };
    } else {
      // `custom` selected but no/!valid custom value → fall back to the default
      // preset so the surface always has real dimensions.
      base = PAGE_SIZE_PX[DEFAULT_PAGE_SIZE as Exclude<PageSize, "custom">];
    }
  } else {
    base = PAGE_SIZE_PX[resolvedSize as Exclude<PageSize, "custom">];
  }
  return applyPageOrientation(base, orientation);
}

/** Resolved per-side margins in px (preset OR custom). */
export interface ResolvedPageMarginsPx {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Resolve the concrete per-side margins (px) from a (margins, customMargins)
 * pair. The custom value (inches→px) applies ONLY while `margins` resolves to
 * `custom` — picking a preset must take effect even when a stored custom value
 * remains (see resolvePageDimensionsPx; the OOXML exporter gates on the same
 * pair). Otherwise the preset's symmetric vertical/horizontal pair is expanded
 * to four sides. Always whole, safe px.
 */
export function resolvePageMarginsPx(
  margins: unknown,
  customMargins?: unknown,
): ResolvedPageMarginsPx {
  const resolvedMargins = resolvePageMargins(margins);
  if (resolvedMargins === "custom") {
    const custom = normalizeCustomPageMargins(customMargins);
    if (custom) {
      return {
        top: Math.round(custom.top * PX_PER_INCH),
        right: Math.round(custom.right * PX_PER_INCH),
        bottom: Math.round(custom.bottom * PX_PER_INCH),
        left: Math.round(custom.left * PX_PER_INCH),
      };
    }
    const fallback = PAGE_MARGIN_PX[DEFAULT_PAGE_MARGINS as Exclude<
      PageMargins,
      "custom"
    >];
    return {
      top: fallback.vertical,
      right: fallback.horizontal,
      bottom: fallback.vertical,
      left: fallback.horizontal,
    };
  }
  const preset = PAGE_MARGIN_PX[resolvedMargins as Exclude<PageMargins, "custom">];
  return {
    top: preset.vertical,
    right: preset.horizontal,
    bottom: preset.vertical,
    left: preset.horizontal,
  };
}

/** Resolved page geometry in OOXML twips, for the DOCX `<w:sectPr>`. */
export interface PageGeometryTwips {
  /** `<w:pgSz w:w>` — page width in twips. */
  width: number;
  /** `<w:pgSz w:h>` — page height in twips. */
  height: number;
  /** `<w:pgMar w:top/right/bottom/left>` — margins in twips. */
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Inch→twip with a positive-integer guarantee (OOXML attrs are integers).
 * Floors negatives/junk to 0 so a `<w:pgMar>` side is never negative.
 */
function inchesToTwips(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * TWIPS_PER_INCH);
}

/**
 * Derive the OOXML `<w:pgSz>` + `<w:pgMar>` twip geometry for a document's
 * resolved page setup. Drives the DOCX export so a custom size/margins carry
 * into the file (and a preset stays its exact twip values). PURE.
 *
 * A CUSTOM value is converted from its stored INCHES STRAIGHT to twips
 * (inches × 1440) — NOT via the px surface dimensions — so a user-entered size
 * or margin (e.g. 1.4 in) round-trips losslessly through OOXML rather than
 * picking up the rounding error of an intermediate whole-pixel hop. A preset
 * has no inch source of truth (it is defined in px), so it converts px→in→twips,
 * which lands exactly on its physical twip value. Every result is a
 * non-negative integer.
 */
export function pageGeometryTwips(
  size: unknown,
  margins: unknown,
  customSize?: unknown,
  customMargins?: unknown,
  orientation?: unknown,
): PageGeometryTwips {
  const custom = normalizeCustomPageSize(customSize);
  const customMar = normalizeCustomPageMargins(customMargins);
  let width: number;
  let height: number;
  if (resolvePageSize(size) === "custom" && custom) {
    // Swap the INCH source-of-truth (not the px hop) so a custom landscape size
    // still round-trips losslessly to twips.
    const oriented = applyPageOrientation(custom, orientation);
    width = inchesToTwips(oriented.width);
    height = inchesToTwips(oriented.height);
  } else {
    const resolvedSize = resolvePageSize(size);
    const paper =
      PAGE_SIZE_TWIPS[
        (resolvedSize === "custom"
          ? DEFAULT_PAGE_SIZE
          : resolvedSize) as Exclude<PageSize, "custom">
      ];
    const oriented = applyPageOrientation(paper, orientation);
    width = oriented.width;
    height = oriented.height;
  }
  let top: number;
  let right: number;
  let bottom: number;
  let left: number;
  if (resolvePageMargins(margins) === "custom" && customMar) {
    top = inchesToTwips(customMar.top);
    right = inchesToTwips(customMar.right);
    bottom = inchesToTwips(customMar.bottom);
    left = inchesToTwips(customMar.left);
  } else {
    const mar = resolvePageMarginsPx(margins, customMargins);
    top = inchesToTwips(mar.top / PX_PER_INCH);
    right = inchesToTwips(mar.right / PX_PER_INCH);
    bottom = inchesToTwips(mar.bottom / PX_PER_INCH);
    left = inchesToTwips(mar.left / PX_PER_INCH);
  }
  return { width, height, top, right, bottom, left };
}

/**
 * Parse an OOXML twip value (a `<w:pgSz>`/`<w:pgMar>` attribute string) into a
 * clamped INCHES value suitable for {@link normalizeCustomPageSize} /
 * {@link normalizeCustomPageMargins}, or `null` when not a usable positive
 * number. Used on DOCX IMPORT to read arbitrary page geometry back as a custom
 * value. Negative `<w:pgMar>` values (Word's "gutter into margin" trick) are
 * floored to 0 by the downstream margin clamp.
 */
export function twipsToInches(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value.trim()) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return roundInches(n / TWIPS_PER_INCH);
}

export interface SectionPageSizeSelection {
  pageSize: PageSize;
  customPageSize: CustomPageSizeInches | null;
}

export interface SectionPageMarginsSelection {
  pageMargins: PageMargins;
  customPageMargins: CustomPageMarginsInches | null;
}

const SECTION_PRESET_TWIPS_TOLERANCE = 15;

/**
 * Project the current section's authoritative OOXML page geometry back into
 * the toolbar's preset/custom selection model. The document-level legacy attrs
 * are only a compatibility fallback; once sectionLayouts exists, w:pgSz is the
 * source of truth shown by Word's Layout controls.
 */
export function pageSizeSelectionFromSectionTwips(
  widthTwips: unknown,
  heightTwips: unknown,
  orientation: unknown,
): SectionPageSizeSelection | null {
  if (
    typeof widthTwips !== "number" ||
    !Number.isInteger(widthTwips) ||
    widthTwips <= 0 ||
    typeof heightTwips !== "number" ||
    !Number.isInteger(heightTwips) ||
    heightTwips <= 0
  ) {
    return null;
  }
  const resolvedOrientation = resolvePageOrientation(orientation);
  for (const preset of PAGE_SIZE_PRESET_VALUES) {
    const geometry = pageGeometryTwips(
      preset,
      DEFAULT_PAGE_MARGINS,
      null,
      null,
      resolvedOrientation,
    );
    if (
      Math.abs(geometry.width - widthTwips) <= SECTION_PRESET_TWIPS_TOLERANCE &&
      Math.abs(geometry.height - heightTwips) <= SECTION_PRESET_TWIPS_TOLERANCE
    ) {
      return { pageSize: preset, customPageSize: null };
    }
  }

  const base =
    resolvedOrientation === "landscape"
      ? { width: heightTwips, height: widthTwips }
      : { width: widthTwips, height: heightTwips };
  const customPageSize = normalizeCustomPageSize({
    width: base.width / TWIPS_PER_INCH,
    height: base.height / TWIPS_PER_INCH,
  });
  return customPageSize ? { pageSize: "custom", customPageSize } : null;
}

/**
 * Project one section's exact w:pgMar values into the Layout ribbon. Gutter is
 * intentionally separate in OOXML and is not folded into the four margin
 * fields, matching Word's page-setup model.
 */
export function pageMarginsSelectionFromSectionTwips(
  topTwips: unknown,
  rightTwips: unknown,
  bottomTwips: unknown,
  leftTwips: unknown,
): SectionPageMarginsSelection | null {
  const values = [topTwips, rightTwips, bottomTwips, leftTwips];
  if (
    values.some(
      (value) =>
        typeof value !== "number" || !Number.isInteger(value) || value < 0,
    )
  ) {
    return null;
  }
  const [top, right, bottom, left] = values as number[];
  for (const preset of PAGE_MARGIN_PRESET_VALUES) {
    const geometry = pageGeometryTwips(
      DEFAULT_PAGE_SIZE,
      preset,
      null,
      null,
      DEFAULT_PAGE_ORIENTATION,
    );
    if (
      Math.abs(geometry.top - top) <= 2 &&
      Math.abs(geometry.right - right) <= 2 &&
      Math.abs(geometry.bottom - bottom) <= 2 &&
      Math.abs(geometry.left - left) <= 2
    ) {
      return { pageMargins: preset, customPageMargins: null };
    }
  }
  const customPageMargins = normalizeCustomPageMargins({
    top: top / TWIPS_PER_INCH,
    right: right / TWIPS_PER_INCH,
    bottom: bottom / TWIPS_PER_INCH,
    left: left / TWIPS_PER_INCH,
  });
  return customPageMargins
    ? { pageMargins: "custom", customPageMargins }
    : null;
}

/**
 * Usable content height of ONE printed page (height minus the top+bottom
 * margins). Resolves preset OR custom geometry, so the page-guide math is
 * correct for a custom size/margins too.
 */
export function pageContentHeightPx(
  size: unknown,
  margins: unknown,
  customSize?: unknown,
  customMargins?: unknown,
  orientation?: unknown,
): number {
  const dims = resolvePageDimensionsPx(size, customSize, orientation);
  const mar = resolvePageMarginsPx(margins, customMargins);
  return dims.height - mar.top - mar.bottom;
}

/**
 * Page-guide preference schema. Version 3 reverses the old on-by-default
 * experiment: an estimated boundary is not pagination and must never appear as
 * the document's default page view. Only an explicit v3 opt-in paints guides.
 */
export const PAGE_GUIDES_PREFERENCE_VERSION = "3";

/** Resolve the persisted draft-guide preference without touching browser APIs. */
export function resolvePageGuidesEnabled(
  storedValue: unknown,
  storedVersion: unknown,
): boolean {
  if (storedVersion !== PAGE_GUIDES_PREFERENCE_VERSION) return false;
  return storedValue === "1";
}

/**
 * One constant-DOM draft-guide paint segment. CSS paints a repeating dashed
 * line every `step` px between `start` and `end`; a hard page/section break
 * starts a new segment so the estimate resets from that explicit boundary.
 */
export interface PageGuideSegment {
  start: number;
  end: number;
  step: number;
}

// Compatibility-only materialized offsets. Production rendering uses
// `pageGuideSegments` (constant DOM) and never consumes this capped array.
const MAX_MATERIALIZED_PAGE_GUIDE_OFFSETS = 500;

function normalizedHardBreakOffsets(
  values: readonly number[],
  contentHeightPx: number,
): number[] {
  return Array.from(
    new Set(
      values
        .filter(
          (value) =>
            Number.isFinite(value) && value > 0 && value < contentHeightPx,
        )
        .map((value) => Math.round(value))
        .filter((value) => value > 0 && value < contentHeightPx),
    ),
  ).sort((a, b) => a - b);
}

/**
 * Derive repeating-background segments for draft page estimates. Unlike the
 * old one-DOM-node-per-boundary implementation, this stays constant-size for a
 * 700-page or 70,000-page document and therefore needs no silent 500-line cap.
 * Hard page/next/even/odd section breaks reset the estimate; continuous section
 * breaks must be omitted by the caller because they do not start a page.
 */
export function pageGuideSegments(
  contentHeightPx: number,
  size: unknown,
  margins: unknown,
  customSize?: unknown,
  customMargins?: unknown,
  orientation?: unknown,
  hardBreakOffsets: readonly number[] = [],
): PageGuideSegment[] {
  const step = pageContentHeightPx(
    size,
    margins,
    customSize,
    customMargins,
    orientation,
  );
  if (!Number.isFinite(contentHeightPx) || contentHeightPx <= 0 || step <= 0) {
    return [];
  }

  const boundaries = [
    0,
    ...normalizedHardBreakOffsets(hardBreakOffsets, contentHeightPx),
    Math.round(contentHeightPx),
  ];
  const segments: PageGuideSegment[] = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    if (end - start > step) {
      segments.push({ start, end, step });
    }
  }
  return segments;
}

/**
 * Offsets (px from the content top) where printed-page boundaries fall for a
 * document body of `contentHeightPx` — one entry per boundary BETWEEN pages
 * (none for a single-page document). Pure, so the draft-view guide overlay
 * and its tests share the same math.
 */
export function pageGuideOffsets(
  contentHeightPx: number,
  size: unknown,
  margins: unknown,
  customSize?: unknown,
  customMargins?: unknown,
  orientation?: unknown,
  hardBreakOffsets: readonly number[] = [],
): number[] {
  const out: number[] = [];
  for (const segment of pageGuideSegments(
    contentHeightPx,
    size,
    margins,
    customSize,
    customMargins,
    orientation,
    hardBreakOffsets,
  )) {
    for (
      let y = segment.start + segment.step;
      y < segment.end && out.length < MAX_MATERIALIZED_PAGE_GUIDE_OFFSETS;
      y += segment.step
    ) {
      out.push(Math.round(y));
    }
    if (out.length >= MAX_MATERIALIZED_PAGE_GUIDE_OFFSETS) break;
  }
  return out;
}

/**
 * Coerce an arbitrary value into a whitelisted page size, or `null` when it is
 * not in the whitelist. Case-insensitive and trims surrounding whitespace.
 */
export function normalizePageSize(value: unknown): PageSize | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return PAGE_SIZE_SET.has(normalized) ? (normalized as PageSize) : null;
}

/**
 * Coerce an arbitrary value into a whitelisted margin preset, or `null` when it
 * is not in the whitelist. Case-insensitive and trims surrounding whitespace.
 */
export function normalizePageMargins(value: unknown): PageMargins | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return PAGE_MARGIN_SET.has(normalized) ? (normalized as PageMargins) : null;
}

/**
 * Like {@link normalizePageSize} but always resolves to a concrete value,
 * falling back to {@link DEFAULT_PAGE_SIZE} for an unset/invalid input. Used at
 * the rendering edge where the surface must always have a size.
 */
export function resolvePageSize(value: unknown): PageSize {
  return normalizePageSize(value) ?? DEFAULT_PAGE_SIZE;
}

/**
 * Like {@link normalizePageMargins} but always resolves to a concrete value,
 * falling back to {@link DEFAULT_PAGE_MARGINS} for an unset/invalid input.
 */
export function resolvePageMargins(value: unknown): PageMargins {
  return normalizePageMargins(value) ?? DEFAULT_PAGE_MARGINS;
}

/**
 * Coerce an arbitrary value into a whitelisted page orientation, or `null` when
 * it is not in the whitelist. Case-insensitive and trims surrounding whitespace.
 */
export function normalizePageOrientation(value: unknown): PageOrientation | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return PAGE_ORIENTATION_SET.has(normalized)
    ? (normalized as PageOrientation)
    : null;
}

/**
 * Like {@link normalizePageOrientation} but always resolves to a concrete value,
 * falling back to {@link DEFAULT_PAGE_ORIENTATION} for an unset/invalid input.
 */
export function resolvePageOrientation(value: unknown): PageOrientation {
  return normalizePageOrientation(value) ?? DEFAULT_PAGE_ORIENTATION;
}

/**
 * Apply an orientation to a (width, height) pair: "landscape" swaps the two so
 * the wider dimension becomes the width; "portrait" (or any unset/invalid value)
 * returns the pair UNCHANGED. PURE + unit-friendly: works on px OR twips since it
 * only swaps two numbers. This is the single choke point the geometry derivations
 * funnel through, so orientation behaviour stays consistent across the on-screen
 * surface, the page-guide math, and the DOCX `<w:pgSz>` export.
 *
 * Note this is a literal swap, NOT a "force landscape" — flipping a page that is
 * already wider than tall (an unusual custom size) still swaps, matching Word's
 * orientation toggle, which is purely a dimension swap.
 */
export function applyPageOrientation<T extends { width: number; height: number }>(
  dims: T,
  orientation: unknown,
): { width: number; height: number } {
  if (resolvePageOrientation(orientation) === "landscape") {
    return { width: dims.height, height: dims.width };
  }
  return { width: dims.width, height: dims.height };
}

export interface PageSetupSurfaceStyle {
  /** Page width in px (drives flex-basis + max-width of the surface). */
  width: number;
  /** Minimum page height in px. */
  minHeight: number;
  /**
   * Top/bottom padding in px. For an asymmetric custom setup this is the TOP
   * value (the per-side fields below carry the full truth); presets stay
   * symmetric so it equals both.
   */
  paddingVertical: number;
  /** Left/right padding in px (LEFT value for an asymmetric custom setup). */
  paddingHorizontal: number;
  /** Per-side padding in px (preset → symmetric; custom → as entered). */
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
}

/**
 * Derive the on-screen page geometry for a (size, margins) setup, honoring an
 * optional custom size/margins. The preset inputs are normalized through the
 * whitelists and the custom inputs are clamped, so any junk falls back to safe
 * numbers and the output is always finite, whole px.
 */
export function pageSetupSurfaceStyle(
  size: unknown,
  margins: unknown,
  customSize?: unknown,
  customMargins?: unknown,
  orientation?: unknown,
): PageSetupSurfaceStyle {
  const dims = resolvePageDimensionsPx(size, customSize, orientation);
  const mar = resolvePageMarginsPx(margins, customMargins);
  return {
    width: dims.width,
    minHeight: dims.height,
    paddingVertical: mar.top,
    paddingHorizontal: mar.left,
    paddingTop: mar.top,
    paddingRight: mar.right,
    paddingBottom: mar.bottom,
    paddingLeft: mar.left,
  };
}

/**
 * Inline-style object (camelCased, React-friendly) for the on-screen page
 * surface. Returns only numeric px values drawn from the whitelist, so it can
 * never carry injected CSS.
 *
 * Page width (flex-basis / max-width / min-height) is set directly because it
 * encodes the chosen paper size. The chosen *margins*, however, are exposed as
 * `--page-margin-x` / `--page-margin-y` CSS custom properties rather than a
 * hard `padding` declaration: the stylesheet folds them into a `clamp()` so the
 * page stays usable on small viewports (a fixed 96px inline padding would
 * otherwise override the responsive rule and squeeze the content column on
 * mobile). The custom properties are themselves only whitelisted px numbers, so
 * they still cannot carry injected CSS.
 */
export function pageSetupSurfaceCss(
  size: unknown,
  margins: unknown,
  customSize?: unknown,
  customMargins?: unknown,
  orientation?: unknown,
): {
  flexBasis: string;
  maxWidth: string;
  minHeight: string;
  "--page-margin-x": string;
  "--page-margin-y": string;
  "--page-margin-top"?: string;
  "--page-margin-right"?: string;
  "--page-margin-bottom"?: string;
  "--page-margin-left"?: string;
} {
  const s = pageSetupSurfaceStyle(
    size,
    margins,
    customSize,
    customMargins,
    orientation,
  );
  // The axis variables drive the symmetric case AND the per-side fallbacks in
  // the stylesheet, so they are always set to the top/left values.
  const css = {
    flexBasis: `${s.width}px`,
    maxWidth: `${s.width}px`,
    minHeight: `${s.minHeight}px`,
    "--page-margin-x": `${s.paddingLeft}px`,
    "--page-margin-y": `${s.paddingTop}px`,
  } as {
    flexBasis: string;
    maxWidth: string;
    minHeight: string;
    "--page-margin-x": string;
    "--page-margin-y": string;
    "--page-margin-top"?: string;
    "--page-margin-right"?: string;
    "--page-margin-bottom"?: string;
    "--page-margin-left"?: string;
  };
  // Only emit the per-side overrides when the margins are ASYMMETRIC (a custom
  // setup). A symmetric preset leaves them off so the axis variables alone
  // describe it and the emitted object stays byte-for-byte the legacy shape.
  if (s.paddingTop !== s.paddingBottom || s.paddingLeft !== s.paddingRight) {
    css["--page-margin-top"] = `${s.paddingTop}px`;
    css["--page-margin-right"] = `${s.paddingRight}px`;
    css["--page-margin-bottom"] = `${s.paddingBottom}px`;
    css["--page-margin-left"] = `${s.paddingLeft}px`;
  }
  return css;
}

// ---------------------------------------------------------------------------
// Page background color (Word/WPS «设计 → 页面颜色» → `<w:background w:color>`).
// An OPTIONAL document-level attr holding a single solid fill color. A document
// without it emits nothing extra (byte-for-byte unchanged). The value is funneled
// through a strict 6-hex whitelist so neither a malicious page nor a stray import
// can inject arbitrary CSS through the on-screen surface fill or the OOXML attr.
// ---------------------------------------------------------------------------

/**
 * Coerce an arbitrary value into a bare lowercased 6-hex page-background color
 * (no `#`), or `null` when no/invalid color is set. Unlike the border color
 * (which falls back to black) an unset/garbage value here returns `null` so a
 * document with no page color stays byte-for-byte unchanged — the absence of a
 * color is meaningful (= no fill). PURE.
 */
/**
 * The paper a document is written on with the pen (Draw ▸ Background: ruled
 * lines, a grid or dots), as a note-taking app lays a page out for handwriting.
 * Drawn on the editor's pages only, never printed or exported: Word has no
 * such page, so a .docx stays as Word would write it.
 */
export const INK_PAPERS = ["rule", "grid", "dot"] as const;
export type InkPaper = (typeof INK_PAPERS)[number];

export function normalizeInkPaper(value: unknown): InkPaper | null {
  return (INK_PAPERS as readonly unknown[]).includes(value) ? (value as InkPaper) : null;
}

export function normalizePageBackgroundColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^#?([0-9a-fA-F]{6})$/);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Inline-style object (camelCased, React-friendly) for painting the page-surface
 * background fill. Returns an empty object when no color is set (so the surface
 * is untouched — byte-for-byte unchanged), else a single `backgroundColor` built
 * only from the whitelisted `#rrggbb` value, so it can never carry injected CSS.
 * PURE.
 */
export function pageBackgroundCss(value: unknown): { backgroundColor?: string } {
  const color = normalizePageBackgroundColor(value);
  return color ? { backgroundColor: `#${color}` } : {};
}

/**
 * A page's Fill Effects gradient (Design > Page Color > Fill Effects; `w:background/
 * v:background/v:fill`) as the import states it: the shared gradient model it
 * is painted with and the `v:fill` attributes the full export writes back.
 * Null unless both are of that shape.
 */
export interface PageBackgroundFill {
  gradient: OfficeShapeGradient;
  vml: Record<string, string>;
}

const PAGE_BACKGROUND_FILL_VML_KEYS = new Set([
  "fillcolor", "type", "color2", "colors", "angle", "focus", "focusposition", "focussize", "method", "o:fill",
]);

export function normalizePageBackgroundFill(value: unknown): PageBackgroundFill | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).length !== 2 || !("gradient" in raw) || !("vml" in raw)) return null;
  const gradient = normalizeOfficeShapeGradient(raw.gradient);
  const vml = raw.vml;
  if (!gradient || !vml || typeof vml !== "object" || Array.isArray(vml)) return null;
  const entries = Object.entries(vml as Record<string, unknown>);
  if (
    entries.length === 0 ||
    entries.some(([key, item]) =>
      !PAGE_BACKGROUND_FILL_VML_KEYS.has(key) ||
      typeof item !== "string" ||
      !/^[#.,;%A-Za-z0-9 -]{1,400}$/.test(item))
  ) {
    return null;
  }
  return { gradient, vml: Object.fromEntries(entries) as Record<string, string> };
}

/**
 * The CSS image of a page's Fill Effects gradient on a page of `widthPx` x
 * `heightPx` (the ramp runs along the page box, as Word draws it), or null.
 */
export function pageBackgroundFillImage(value: unknown, widthPx?: number, heightPx?: number): string | null {
  const fill = normalizePageBackgroundFill(value);
  return fill ? officeGradientCss(fill.gradient, widthPx, heightPx) : null;
}

// ---------------------------------------------------------------------------
// Page borders (Word/WPS 页面边框 → `<w:pgBorders>`) and line numbering
// (Word/WPS 行号 → `<w:lnNumType>`). Both are OPTIONAL document-level section
// attrs: a document carrying neither emits nothing extra (byte-for-byte
// unchanged). Both come from closed whitelists so neither a malicious page nor
// a stray import can inject arbitrary CSS or markup through these.
// ---------------------------------------------------------------------------

/**
 * Allowed page-border line styles. These map 1:1 to the OOXML `<w:top w:val>`
 * border-style tokens (a closed subset of ST_Border) so the export can never
 * emit an off-schema style. "single" is the common solid box.
 */
export const PAGE_BORDER_STYLE_VALUES = [
  "single",
  "double",
  "thick",
  "dotted",
  "dashed",
] as const;
export type PageBorderStyle = (typeof PAGE_BORDER_STYLE_VALUES)[number];

/** The only supported border preset — a four-edge box around the page. */
export const PAGE_BORDER_PRESET_VALUES = ["box"] as const;
export type PageBorderPreset = (typeof PAGE_BORDER_PRESET_VALUES)[number];

export const DEFAULT_PAGE_BORDER_STYLE: PageBorderStyle = "single";
/** Default border line width, in points (Word's thin 0.5pt line). */
export const DEFAULT_PAGE_BORDER_WIDTH_PT = 0.5;
/** Default border color (auto/black, stored as a bare 6-hex string). */
export const DEFAULT_PAGE_BORDER_COLOR = "000000";

/** Inclusive width clamp, in points (Word's UI offers 0.25pt–6pt). */
const PAGE_BORDER_WIDTH_MIN_PT = 0.25;
const PAGE_BORDER_WIDTH_MAX_PT = 6;

const PAGE_BORDER_STYLE_SET = new Set<string>(PAGE_BORDER_STYLE_VALUES);
const PAGE_BORDER_PRESET_SET = new Set<string>(PAGE_BORDER_PRESET_VALUES);

/** A normalized page-border config (a four-edge box). */
export interface PageBorder {
  preset: PageBorderPreset;
  style: PageBorderStyle;
  /** Line width in points, clamped to [0.25, 6]. */
  widthPt: number;
  /** Bare 6-hex color (no `#`), lowercased. */
  color: string;
}

/** Whitelist a border style, falling back to the default for junk. */
function resolveBorderStyle(value: unknown): PageBorderStyle {
  if (typeof value !== "string") return DEFAULT_PAGE_BORDER_STYLE;
  const normalized = value.trim().toLowerCase();
  return PAGE_BORDER_STYLE_SET.has(normalized)
    ? (normalized as PageBorderStyle)
    : DEFAULT_PAGE_BORDER_STYLE;
}

/** Reduce a color-ish value to a bare lowercased 6-hex string, or the default. */
function resolveBorderColor(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_PAGE_BORDER_COLOR;
  const match = value.trim().match(/^#?([0-9a-fA-F]{6})$/);
  return match ? match[1].toLowerCase() : DEFAULT_PAGE_BORDER_COLOR;
}

/** Clamp an arbitrary width to the supported point range. */
function resolveBorderWidthPt(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_BORDER_WIDTH_PT;
  return Math.min(Math.max(n, PAGE_BORDER_WIDTH_MIN_PT), PAGE_BORDER_WIDTH_MAX_PT);
}

/**
 * Coerce an arbitrary value into a normalized {@link PageBorder}, or `null` when
 * no border is set. A value is treated as "set" only when it is an object whose
 * `preset` is a whitelisted preset (currently just "box"); everything else
 * (null, undefined, a non-object, an off-whitelist preset) returns `null` so the
 * export stays byte-for-byte unchanged for a border-free document. Each field is
 * funneled through its own whitelist/clamp, so a forged config cannot inject
 * markup, injected CSS, or an unbounded width.
 */
export function normalizePageBorder(value: unknown): PageBorder | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const preset =
    typeof v.preset === "string" ? v.preset.trim().toLowerCase() : "";
  if (!PAGE_BORDER_PRESET_SET.has(preset)) return null;
  return {
    preset: preset as PageBorderPreset,
    style: resolveBorderStyle(v.style),
    widthPt: resolveBorderWidthPt(v.widthPt),
    color: resolveBorderColor(v.color),
  };
}

/**
 * Inline-style object (camelCased, React-friendly) for an on-screen preview of
 * the page border. Returns an empty object when no border is set (so the page
 * surface is untouched), else a single `border` shorthand built only from
 * whitelisted px/style/hex values — it can never carry injected CSS. The CSS
 * line style maps from the OOXML-ish style token to its nearest CSS equivalent.
 */
export function pageBorderCss(value: unknown): { border?: string } {
  const border = normalizePageBorder(value);
  if (!border) return {};
  const cssStyle =
    border.style === "double"
      ? "double"
      : border.style === "dotted"
        ? "dotted"
        : border.style === "dashed"
          ? "dashed"
          : "solid";
  // points → CSS px at 96 dpi (1pt = 1.333…px); double needs ≥3px to render.
  const px = Math.max(
    border.style === "double" ? 3 : 1,
    Math.round(ptToPx(border.widthPt)),
  );
  return { border: `${px}px ${cssStyle} #${border.color}` };
}

/** Allowed line-numbering "count by" steps (Word offers any positive integer). */
export const DEFAULT_LINE_NUMBER_COUNT_BY = 1;
/** Hard cap on the count-by step so a junk value cannot emit an absurd number. */
const LINE_NUMBER_COUNT_BY_MAX = 1000;

/** Allowed line-numbering restart modes (map 1:1 to `<w:lnNumType w:restart>`). */
export const LINE_NUMBER_RESTART_VALUES = [
  "continuous",
  "newPage",
  "newSection",
] as const;
export type LineNumberRestart = (typeof LINE_NUMBER_RESTART_VALUES)[number];
export const DEFAULT_LINE_NUMBER_RESTART: LineNumberRestart = "continuous";

/** Default gap between the numbers and text, in points (Word's auto ≈ none). */
export const DEFAULT_LINE_NUMBER_DISTANCE_PT = 0;
/** Inclusive distance clamp, in points (0 = auto; up to 1in). */
const LINE_NUMBER_DISTANCE_MAX_PT = 72;

const LINE_NUMBER_RESTART_SET = new Set<string>(LINE_NUMBER_RESTART_VALUES);

/** A normalized line-numbering config. */
export interface LineNumbers {
  /** Show a number every N lines (1 = every line). Clamped to [1, 1000]. */
  countBy: number;
  /** When the line count resets. */
  restart: LineNumberRestart;
  /**
   * Distance between the numbers and the text body, in points. 0 = let Word
   * choose (the `w:distance` attr is omitted). Clamped to [0, 72].
   */
  distancePt: number;
}

/** Whitelist a restart mode, falling back to the default for junk. */
function resolveLineNumberRestart(value: unknown): LineNumberRestart {
  if (typeof value !== "string") return DEFAULT_LINE_NUMBER_RESTART;
  const trimmed = value.trim();
  return LINE_NUMBER_RESTART_SET.has(trimmed)
    ? (trimmed as LineNumberRestart)
    : DEFAULT_LINE_NUMBER_RESTART;
}

/** Clamp a count-by step to a positive integer in the supported range. */
function resolveLineNumberCountBy(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_LINE_NUMBER_COUNT_BY;
  const rounded = Math.round(n);
  if (rounded < 1) return DEFAULT_LINE_NUMBER_COUNT_BY;
  return Math.min(rounded, LINE_NUMBER_COUNT_BY_MAX);
}

/** Clamp a distance to the supported point range (negatives → 0 = auto). */
function resolveLineNumberDistancePt(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LINE_NUMBER_DISTANCE_PT;
  return Math.min(n, LINE_NUMBER_DISTANCE_MAX_PT);
}

/**
 * Coerce an arbitrary value into a normalized {@link LineNumbers}, or `null`
 * when line numbering is off. A value is treated as "on" only when it is an
 * object that carries at least one recognized field (`countBy`/`restart`/
 * `distancePt`); null/undefined/non-object/empty-object returns `null` so the
 * export stays byte-for-byte unchanged for a document without line numbering.
 * Every field is funneled through its own whitelist/clamp.
 */
export function normalizeLineNumbers(value: unknown): LineNumbers | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const hasField =
    "countBy" in v || "restart" in v || "distancePt" in v || v.enabled === true;
  if (!hasField) return null;
  return {
    countBy: resolveLineNumberCountBy(v.countBy),
    restart: resolveLineNumberRestart(v.restart),
    distancePt: resolveLineNumberDistancePt(v.distancePt),
  };
}
