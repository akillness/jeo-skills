/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Pure helpers for the user-facing inline-image controls (resize / alignment /
 * alt text) surfaced in the document toolbar. Kept free of any TipTap/React
 * imports so the sanitization and round-trip logic can be unit-tested in
 * isolation and reused by both the extension's parse/render and the toolbar UI.
 *
 * Width semantics intentionally mirror the AI-instruction resize path
 * (documentImageResizeScaleFromInstruction): a width "preset" stores a percent
 * of the natural image width. The percent is whitelisted/clamped so neither a
 * malicious page nor a stray instruction can inject arbitrary CSS via the
 * rendered inline style. "Original" clears the percent (and falls back to the
 * existing numeric `width`/`widthEmu` attributes the AI path manages).
 */

import { EMU_PER_PT } from "../../../../lib/office-units";
import {
  isOfficePictureStyleId,
  type OfficePictureStyleId,
} from "../../../../lib/office-picture-styles/catalog";
import {
  canonicalOfficePictureStyleOutline,
  type OfficePictureStyleOutline,
  nativePictureStyle,
} from "../../../../lib/office-picture-styles/native";
import {
  OFFICE_PICTURE_RECTANGLE_GEOMETRY,
  normalizeOfficePictureGeometry,
  normalizeOfficePictureGeometryAdjustments,
} from "../../../../lib/office-picture-geometry";

/** Allowed width presets, in percent. "Original" is represented by `null`. */
export const IMAGE_WIDTH_PRESETS = [25, 50, 100] as const;

export type ImageWidthPreset = (typeof IMAGE_WIDTH_PRESETS)[number];

/** Allowed block-alignment values. */
export const IMAGE_ALIGN_VALUES = ["left", "center", "right"] as const;

export type ImageAlign = (typeof IMAGE_ALIGN_VALUES)[number];

/** Clockwise degrees in [0, 360). Word's Rotation box gives whole degrees,
 * its rotation handle any angle; an imported picture's DrawingML angle is
 * kept to its own 1/60,000 of a degree so an untouched picture exports as
 * read. */
export type ImageRotation = number;

export const IMAGE_BORDER_STYLES = ["solid", "dashed", "dotted"] as const;
export type ImageBorderStyle = (typeof IMAGE_BORDER_STYLES)[number];

/** Crop values are percentages of the original source edge, matching a:srcRect.
 * The furthest the editor's own crop tools cut into one edge. */
export const MAX_IMAGE_CROP_PERCENT = 45;
/**
 * The furthest a STORED crop may cut into one edge: a picture cropped in Word
 * keeps whatever Word wrote (its Crop allows far more than the editor's tools,
 * as long as opposite edges leave part of the picture; the server's models
 * check that pair). Below 100 % in Word's unit, a thousandth of a percent.
 */
export const MAX_STORED_IMAGE_CROP_PERCENT = 99.999;
/**
 * The furthest an edge may be OUTSET (a negative a:srcRect edge, ECMA-376
 * 20.1.8.55): the source rectangle reaches past the picture, so the picture
 * is drawn smaller than its frame and the rest of the frame is left empty.
 * Word's Crop > Fit states exactly that. Four times the picture per edge;
 * the server's models hold the same bound.
 */
export const MIN_IMAGE_CROP_PERCENT = -400;

/** Hard upper bound for stored alt text, matching Word/WPS practice. */
export const MAX_IMAGE_ALT_CHARS = 1_000;

const IMAGE_WIDTH_PRESET_SET = new Set<number>(IMAGE_WIDTH_PRESETS);
const IMAGE_ALIGN_SET = new Set<string>(IMAGE_ALIGN_VALUES);
const IMAGE_BORDER_STYLE_SET = new Set<string>(IMAGE_BORDER_STYLES);

// Match C0 control characters (U+0000-U+001F), DEL (U+007F), and the C1
// control range (U+0080-U+009F).
// Used to scrub alt text so it cannot break out of an HTML attribute or smuggle
// markup. Defined via \x escapes (never literal control bytes) so the source
// stays editable and reviewable.
const CONTROL_CHARS_RE = /[\x00-\x1f\x7f-\x9f]/g;

/**
 * Coerce an arbitrary value into one of the whitelisted width presets, or
 * `null` (= "original", no inline width). Accepts a bare number or a numeric
 * string (with or without a trailing `%`). Anything outside the whitelist —
 * including injection attempts like `"50%;background:url(x)"` — is rejected.
 */
export function clampImageWidthPercent(value: unknown): ImageWidthPreset | null {
  let numeric: number | null = null;
  if (typeof value === "number" && Number.isFinite(value)) {
    numeric = value;
  } else if (typeof value === "string") {
    const trimmed = value.trim().replace(/%$/, "").trim();
    // Reject anything that is not a clean integer/decimal so a string like
    // "50; background:red" never slips through parseFloat's tolerance.
    if (!/^\d+(?:\.\d+)?$/.test(trimmed)) return null;
    const parsed = Number.parseFloat(trimmed);
    numeric = Number.isFinite(parsed) ? parsed : null;
  }
  if (numeric === null) return null;
  const rounded = Math.round(numeric);
  return IMAGE_WIDTH_PRESET_SET.has(rounded)
    ? (rounded as ImageWidthPreset)
    : null;
}

/** Free width-percent bounds for drag-resize (5% floor keeps a grab target). */
export const MIN_IMAGE_WIDTH_PERCENT = 5;
export const MAX_IMAGE_WIDTH_PERCENT = 100;

/**
 * Coerce an arbitrary value into a FREE width percent (integer 5–100), or
 * `null`. The drag-resize handles store any integer in range — unlike
 * {@link clampImageWidthPercent}, which whitelists the toolbar presets — while
 * keeping the same strict numeric parse so injection strings never pass.
 */
export function clampImageWidthPercentFree(value: unknown): number | null {
  let numeric: number | null = null;
  if (typeof value === "number" && Number.isFinite(value)) {
    numeric = value;
  } else if (typeof value === "string") {
    const trimmed = value.trim().replace(/%$/, "").trim();
    if (!/^\d+(?:\.\d+)?$/.test(trimmed)) return null;
    const parsed = Number.parseFloat(trimmed);
    numeric = Number.isFinite(parsed) ? parsed : null;
  }
  if (numeric === null) return null;
  const rounded = Math.round(numeric);
  if (rounded < MIN_IMAGE_WIDTH_PERCENT || rounded > MAX_IMAGE_WIDTH_PERCENT) {
    return null;
  }
  return rounded;
}

/**
 * Coerce an arbitrary value into one of the whitelisted alignment keywords, or
 * `null` when it is not in the whitelist.
 */
export function normalizeImageAlign(value: unknown): ImageAlign | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return IMAGE_ALIGN_SET.has(normalized) ? (normalized as ImageAlign) : null;
}

export function normalizeImageRotation(value: unknown): ImageRotation {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  // DrawingML's own unit, 1/60,000 of a degree: an angle Word's rotation
  // handle left comes back exactly as Word wrote it.
  const normalized = Math.round((((numeric % 360) + 360) % 360) * 60000) / 60000;
  return normalized === 360 ? 0 : normalized;
}

/** Exact DrawingML mirror flag used by a:xfrm/@flipH and @flipV. */
export function normalizeImageFlip(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

/**
 * A crop edge in percent, to Word's own precision: `a:srcRect` stores
 * thousandths of a percent, and Word writes whatever its length-based Crop
 * boxes work out to (4.912 %), so rounding coarser would move an imported
 * crop the user never touched.
 */
export function normalizeImageCropPercent(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const rounded = Math.round(numeric * 1000) / 1000;
  return Math.max(MIN_IMAGE_CROP_PERCENT, Math.min(MAX_STORED_IMAGE_CROP_PERCENT, Object.is(rounded, -0) ? 0 : rounded));
}

/**
 * The Office Picture Style a picture shows: one of the 28 built-in styles
 * (Word = Excel = PowerPoint), or null. The id is the whole contract: writers
 * emit the style's `pic:spPr` recipe from the shared catalogue, importers map
 * a matching recipe back.
 */
export function normalizeImagePictureStyle(
  value: unknown,
): OfficePictureStyleId | null {
  return isOfficePictureStyleId(value) ? value : null;
}

/**
 * The stored `pictureStyle` attribute: a style id, `"none"` (explicitly no
 * style -- Reset Picture, a Picture Border, or an import that read none), or
 * null (never stated: an imported picture keeps its source package's style
 * on save).
 */
export type ImagePictureStyleAttr = OfficePictureStyleId | "none" | null;

export function normalizeImagePictureStyleAttr(
  value: unknown,
): ImagePictureStyleAttr {
  return value === "none" ? "none" : normalizeImagePictureStyle(value);
}

/**
 * The Picture Border set over a picture style, as Word keeps it: the style
 * stays and only its outline paint/width/dash is replaced
 * (`pictureBorder*`), or removed (`pictureStyleOutlineHidden`). Null for an
 * unstyled picture (its `pictureBorder*` are the plain outline) and when the
 * picture shows the style's own outline.
 */
export function imagePictureStyleOutline(
  attrs: Readonly<Record<string, unknown>>,
): OfficePictureStyleOutline | null {
  const style = normalizeImagePictureStyle(attrs.pictureStyle);
  if (!style) return null;
  if (attrs.pictureStyleOutlineHidden === true) {
    return canonicalOfficePictureStyleOutline(style, "none");
  }
  const widthPt = normalizeImageBorderWidth(attrs.pictureBorderWidth);
  if (widthPt === 0) return null;
  return canonicalOfficePictureStyleOutline(style, {
    widthEmu: Math.round(widthPt * EMU_PER_PT),
    color: normalizeImageBorderColor(attrs.pictureBorderColor),
    dash: normalizeImageBorderStyle(attrs.pictureBorderStyle),
  });
}

/** Does this style draw an outline "No Outline" could remove? */
export function imagePictureStyleHasOutline(style: unknown): boolean {
  return canonicalOfficePictureStyleOutline(style, "none") !== null;
}

export interface DocumentPictureGeometry {
  /** The `a:prstGeom/@prst` the picture is drawn in. */
  readonly preset: string;
  /** Its handle values, or null for the preset's defaults. */
  readonly adjustments: Readonly<Record<string, number>> | null;
}

/**
 * The geometry a picture draws (Crop to Shape): its own stated preset; else
 * its picture style's (a style recipe brings one, e.g. Soft Edge Oval's
 * ellipse); else the plain rectangle.
 */
export function documentPictureGeometry(
  attrs: Readonly<Record<string, unknown>>,
): DocumentPictureGeometry {
  const stated = normalizeOfficePictureGeometry(attrs.pictureGeometry);
  if (stated) {
    return {
      preset: stated,
      adjustments: normalizeOfficePictureGeometryAdjustments(
        stated,
        attrs.pictureGeometryAdjustments,
      ),
    };
  }
  const style = nativePictureStyle(normalizeImagePictureStyle(attrs.pictureStyle));
  if (style) {
    const preset =
      normalizeOfficePictureGeometry(style.geometry) ??
      OFFICE_PICTURE_RECTANGLE_GEOMETRY;
    return {
      preset,
      adjustments: normalizeOfficePictureGeometryAdjustments(
        preset,
        style.adjustments,
      ),
    };
  }
  return { preset: OFFICE_PICTURE_RECTANGLE_GEOMETRY, adjustments: null };
}

/**
 * The picture's own geometry when it differs from what its style (or the
 * plain picture) draws: the shape a renderer must clip to. Null otherwise.
 */
export function documentPictureGeometryOverride(
  attrs: Readonly<Record<string, unknown>>,
): DocumentPictureGeometry | null {
  const own = documentPictureGeometry(attrs);
  const implied = documentPictureGeometry({
    pictureStyle: attrs.pictureStyle,
  });
  return own.preset === implied.preset &&
    JSON.stringify(own.adjustments) === JSON.stringify(implied.adjustments)
    ? null
    : own;
}

export function normalizeImageBorderWidth(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  // Word's Picture Border width field accepts up to 1584 pt; a Picture
  // Style's own frame can be 35 pt, which a 12 pt cap turned into a thin
  
  return Math.max(0, Math.min(1584, Math.round(numeric * 4) / 4));
}

/** The width (pt) of a Picture Style's own outline, 0 for none / unknown. */
export function officePictureStyleOutlineWidthPt(style: unknown): number {
  const line = nativePictureStyle(style)?.line;
  if (!line || !Number.isFinite(line.width) || line.width <= 0) return 0;
  return normalizeImageBorderWidth(line.width / EMU_PER_PT);
}

export function normalizeImageBorderStyle(value: unknown): ImageBorderStyle {
  if (typeof value !== "string") return "solid";
  const normalized = value.trim().toLowerCase();
  return IMAGE_BORDER_STYLE_SET.has(normalized)
    ? (normalized as ImageBorderStyle)
    : "solid";
}

export function normalizeImageBorderColor(value: unknown): string {
  if (typeof value !== "string") return "#000000";
  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : "#000000";
}

/**
 * Sanitize user-entered alt text: drop control characters (which could be used
 * to break out of the attribute or smuggle markup), collapse stray whitespace
 * to single spaces, trim, and clamp to a sane maximum. Returns `null` for an
 * empty/whitespace-only result so callers can clear the attribute.
 */
export function sanitizeImageAltText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(CONTROL_CHARS_RE, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_IMAGE_ALT_CHARS);
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * renderHTML fragment for a width preset: an inline `style="width:N%"`. Returns
 * an empty object for the "original" (null) case so renderHTML emits nothing.
 * Emitting a `style` (not a `width` HTML attribute) keeps the percent off the
 * numeric `width` attribute the AI-instruction resize path owns, and lets
 * TipTap's style-merge combine it with the alignment style.
 */
export function imageWidthStyle(
  value: unknown,
): { style: string } | Record<string, never> {
  // Free clamp (5–100): drag-resized widths render too, not just presets.
  const percent = clampImageWidthPercentFree(value);
  return percent === null ? {} : { style: `width:${percent}%` };
}

/**
 * Render attributes for the alignment value: a `data-align` attribute (consumed
 * by CSS for block placement) plus an inline `margin`/`display` style so the
 * alignment survives even when the surrounding stylesheet is absent (e.g. plain
 * HTML export). Returns an empty object when alignment is unset.
 */
export function imageAlignAttributes(
  value: unknown,
): { "data-align": ImageAlign; style: string } | Record<string, never> {
  const align = normalizeImageAlign(value);
  if (align === null) return {};
  const style =
    align === "center"
      ? "display:block;margin-left:auto;margin-right:auto"
      : align === "right"
        ? "display:block;margin-left:auto;margin-right:0"
        : "display:block;margin-left:0;margin-right:auto";
  return { "data-align": align, style };
}

/**
 * Allowed text-wrap float values (Word's anchored images).
 *
 * - `"left"` / `"right"`: square-wrap with text flowing beside the image on
 *   the opposite side (`<wp:wrapSquare>` + horizontal align keyword).
 * - `"topAndBottom"`: text appears above and below, not beside (`<wp:wrapTopAndBottom>`).
 * - `"behindText"`: image placed behind the text layer (`<wp:anchor behindDoc="1">` +
 *   `<wp:wrapNone/>`).
 * - `"inFrontOfText"`: image placed in front of the text layer (`<wp:anchor behindDoc="0">`
 *   + `<wp:wrapNone/>`).
 */
export const IMAGE_FLOATS = [
  "left",
  "right",
  "topAndBottom",
  "behindText",
  "inFrontOfText",
] as const;
export type ImageFloat = (typeof IMAGE_FLOATS)[number];

/** Coerce an arbitrary value into a whitelisted float keyword, or null. */
export function normalizeImageFloat(value: unknown): ImageFloat | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  // Compare case-insensitively but return the canonical (camelCase) keyword so
  // multi-word modes like "topAndBottom" survive input in any case.
  return (
    ((IMAGE_FLOATS as readonly string[]).find(
      (candidate) => candidate.toLowerCase() === normalized,
    ) as ImageFloat | undefined) ?? null
  );
}

/**
 * Build the shared placement attributes for one of the two DOM contracts used
 * by the image extension:
 *
 * - `element`: the serialized / `getHTML()` **bare `<img>`**. Its own intrinsic
 *   size or numeric `width` attribute must remain the width source of truth.
 * - `nodeViewWrapper`: the live editor's outer `<span>`. A naturally-sized
 *   aligned child needs this wrapper to shrink-wrap (`width:fit-content`) before
 *   auto margins can move it; applying that declaration to the `<img>` itself
 *   would override its intrinsic / explicit-pixel width.
 *
 * Float (Word anchored-image wrap) takes precedence over block alignment. The
 * output order is deterministic for stable HTML and focused unit tests.
 */
function imagePlacementAttributes(
  widthPercent: unknown,
  align: unknown,
  float: unknown,
  target: "element" | "nodeViewWrapper",
): Record<string, string> {
  const out: Record<string, string> = {};
  const styleParts: string[] = [];
  const floatValue = normalizeImageFloat(float);
  if (floatValue !== null) {
    out["data-float"] = floatValue;
    if (floatValue === "left") {
      styleParts.push("float:left;margin:4px 16px 8px 0;max-width:50%");
    } else if (floatValue === "right") {
      styleParts.push("float:right;margin:4px 0 8px 16px;max-width:50%");
    } else if (floatValue === "topAndBottom") {
      // Block-level; text clears both sides so it flows above and below.
      styleParts.push("display:block;clear:both;margin:8px auto");
    } else {
      // behindText / inFrontOfText. Stylesheet-less HTML approximates the
      // order with a z-index on the element. The live wrapper takes none: it
      // is placed and ranked by the page's float layout (floatingTextBoxLayout
      // ranks the raster, `--picture-float-rank`), and a z-index of its own
      // would make it a stacking context that shuts the selection chrome
      // inside it under the next float up (ImageResizeNodeView).
      const rank =
        target === "nodeViewWrapper"
          ? ""
          : floatValue === "behindText"
            ? "z-index:-1;"
            : "z-index:1;";
      styleParts.push(`position:relative;${rank}display:block;margin:4px 0`);
    }
  } else {
    const alignAttrs = imageAlignAttributes(align);
    if ("data-align" in alignAttrs) {
      out["data-align"] = alignAttrs["data-align"];
      styleParts.push(alignAttrs.style);
    }
  }
  const widthAttrs = imageWidthStyle(widthPercent);
  if ("style" in widthAttrs) {
    // A percent width already gives the block wrapper a sub-container width, so
    // margin:auto centers it — no fit-content needed.
    styleParts.push(widthAttrs.style);
  } else if (target === "nodeViewWrapper" && out["data-align"]) {
    // Aligned, natural-size (no percent) image: the block wrapper would be
    // full-width, making margin:auto a no-op and pinning the image to the left.
    // Shrink ONLY the live wrapper to the image so alignment actually applies.
    // A serialized bare <img> is already intrinsically/explicitly sized and
    // must never receive width:fit-content.
    styleParts.push("width:fit-content;max-width:100%");
  }
  if (styleParts.length > 0) {
    out.style = styleParts.join(";");
  }
  return out;
}

/**
 * Attributes rendered directly on the serialized bare `<img>`.
 *
 * Deliberately never emits `width:fit-content`: no-percent images keep their
 * natural size, while numeric `width`/`height` HTML attributes remain effective.
 */
export function imageElementRenderAttributes(
  widthPercent: unknown,
  align: unknown,
  float?: unknown,
): Record<string, string> {
  return imagePlacementAttributes(widthPercent, align, float, "element");
}

/**
 * Placement attributes for the live resize NodeView's outer wrapper.
 *
 * The child `<img>` owns pixels/intrinsic dimensions. The wrapper owns only
 * placement and percent-container width; naturally-sized aligned images are
 * shrink-wrapped here so center/right auto margins have a real effect.
 */
export function imageNodeViewWrapperAttributes(
  widthPercent: unknown,
  align: unknown,
  float?: unknown,
): Record<string, string> {
  return imagePlacementAttributes(
    widthPercent,
    align,
    float,
    "nodeViewWrapper",
  );
}
