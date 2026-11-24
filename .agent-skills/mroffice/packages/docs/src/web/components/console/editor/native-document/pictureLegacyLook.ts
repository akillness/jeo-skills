/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { ptToPx } from "@mrnote/core/web/lib/office-units.ts";
/**
 * A legacy VML picture's Word 97 look, drawn: picture borders
 * (`w10:bordertop|left|bottom|right`) and the picture fill (`filled` +
 * `fillcolor`). The import carries them as `pictureLegacyLook` only on an
 * otherwise plain picture (`apps/api/app/services/document_docx_vml_picture_look.py`),
 * and the full writer writes the picture back as the same VML picture.
 *
 * Word draws the borders black unless a side states its colour, around the picture, each side in its own
 * `ST_BorderType` at `width` eighths of a point (ECMA-376 Part 4 §19.3.1;
 * Microsoft Learn `DocumentFormat.OpenXml.Vml.Wordprocessing.TopBorder`). A
 * compound line's `width` is one of its strokes, as a paragraph border's
 * `w:sz` is, so a double rule is three widths across.
 */

export type PictureLegacyBorderSide = "top" | "left" | "bottom" | "right";

export interface PictureLegacyBorder {
  readonly type: string;
  readonly width?: number;
  readonly shadow?: true;
  /** `o:border{side}color`; Word draws a side that states none black. */
  readonly color?: string;
}

export interface PictureLegacyLook {
  readonly borders?: Partial<Record<PictureLegacyBorderSide, PictureLegacyBorder>>;
  readonly fill?: string;
}

const SIDES: readonly PictureLegacyBorderSide[] = ["top", "left", "bottom", "right"];

/** `ST_BorderType` of `urn:schemas-microsoft-com:office:word`, as CSS draws it. */
const CSS_STYLE: Readonly<Record<string, { style: string; strokes: number }>> = {
  none: { style: "none", strokes: 0 },
  single: { style: "solid", strokes: 1 },
  thick: { style: "solid", strokes: 1 },
  hairline: { style: "solid", strokes: 1 },
  wave: { style: "solid", strokes: 1 },
  doubleWave: { style: "double", strokes: 3 },
  double: { style: "double", strokes: 3 },
  triple: { style: "double", strokes: 5 },
  thinThickSmall: { style: "double", strokes: 3 },
  thickThinSmall: { style: "double", strokes: 3 },
  thickBetweenThinSmall: { style: "double", strokes: 4 },
  thinThick: { style: "double", strokes: 3 },
  thickThin: { style: "double", strokes: 3 },
  thickBetweenThin: { style: "double", strokes: 4 },
  thinThickLarge: { style: "double", strokes: 3 },
  thickThinLarge: { style: "double", strokes: 3 },
  thickBetweenThinLarge: { style: "double", strokes: 4 },
  dot: { style: "dotted", strokes: 1 },
  dash: { style: "dashed", strokes: 1 },
  dashedSmall: { style: "dashed", strokes: 1 },
  dotDash: { style: "dashed", strokes: 1 },
  dashDotDot: { style: "dashed", strokes: 1 },
  dashDotStroked: { style: "dashed", strokes: 1 },
  threeDEmboss: { style: "ridge", strokes: 2 },
  threeDEngrave: { style: "groove", strokes: 2 },
  HTMLOutset: { style: "outset", strokes: 1 },
  HTMLInset: { style: "inset", strokes: 1 },
};

/** Word's default border width when a side states none: ½ pt. */
const DEFAULT_WIDTH_EIGHTHS = 4;

export function normalizePictureLegacyLook(value: unknown): PictureLegacyLook | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const look: { borders?: Partial<Record<PictureLegacyBorderSide, PictureLegacyBorder>>; fill?: string } = {};
  if (record.borders && typeof record.borders === "object" && !Array.isArray(record.borders)) {
    const borders: Partial<Record<PictureLegacyBorderSide, PictureLegacyBorder>> = {};
    for (const side of SIDES) {
      const raw = (record.borders as Record<string, unknown>)[side];
      if (!raw || typeof raw !== "object") continue;
      const border = raw as Record<string, unknown>;
      if (typeof border.type !== "string" || !(border.type in CSS_STYLE)) continue;
      borders[side] = {
        type: border.type,
        ...(typeof border.width === "number" &&
        Number.isInteger(border.width) &&
        border.width >= 1 &&
        border.width <= 1_000
          ? { width: border.width }
          : {}),
        ...(border.shadow === true ? { shadow: true as const } : {}),
        ...(typeof border.color === "string" && /^#[0-9a-f]{6}$/.test(border.color)
          ? { color: border.color }
          : {}),
      };
    }
    if (Object.keys(borders).length) look.borders = borders;
  }
  if (typeof record.fill === "string" && /^#[0-9a-f]{6}$/.test(record.fill)) {
    look.fill = record.fill;
  }
  return look.borders || look.fill ? look : null;
}

/**
 * The inline style that draws the look on the picture's `<img>`: a border
 * per side (outside the raster, `content-box`) and the fill behind it.
 * Every property is named, empty when the look does not set it, so applying
 * a picture without a look clears what an earlier render drew.
 */
export function pictureLegacyLookStyle(value: unknown): Record<string, string> {
  const look = normalizePictureLegacyLook(value);
  const style: Record<string, string> = {
    boxSizing: "",
    backgroundColor: look?.fill ?? "",
    borderTop: "",
    borderLeft: "",
    borderBottom: "",
    borderRight: "",
  };
  if (!look?.borders) return style;
  style.boxSizing = "content-box";
  for (const side of SIDES) {
    const border = look.borders[side];
    if (!border) continue;
    const css = CSS_STYLE[border.type];
    if (!css || css.strokes === 0) continue;
    // Eighths of a point to CSS px (1pt = 4/3px), one stroke per width.
    const strokePx = ptToPx(((border.width ?? DEFAULT_WIDTH_EIGHTHS) / 8));
    const widthPx = Math.max(css.style === "double" ? 3 : 1, strokePx * css.strokes);
    const key = `border${side[0].toUpperCase()}${side.slice(1)}` as keyof typeof style;
    style[key] = `${Math.round(widthPx * 100) / 100}px ${css.style} ${border.color ?? "#000000"}`;
  }
  return style;
}
