/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { EMU_PER_PX, ptToPxRounded } from "@mrnote/core/web/lib/office-units.ts";
import { nativePictureStyle } from "@mrnote/core/web/lib/office-picture-styles/native.ts";

/**
 * Word's layout room and outer shadow for a picture.
 *
 * Room (Word 16 probes, rot.docx / b-obj.docx): an inline picture lines up
 * at its `wp:extent` - its UNROTATED size, with width and height swapped
 * when it is turned by about a quarter (45..135 or 225..315 degrees) - plus
 * the `wp:effectExtent` on each side. A 30 degree picture whose file states
 * no effect extent therefore overlaps the lines around it; Word writes the
 * effect extent of the turned bounds when the user turns a picture, so a
 * picture the editor turns reserves its turned bounds.
 *
 * Shadow: `a:outerShdw` (blur radius, distance and direction, colour and
 * alpha), drawn as a CSS drop shadow.
 */

export interface PictureEffectExtent {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  /** The rotation (degrees) the file wrote this extent for. */
  readonly rotation: number;
}

export interface PictureShadow {
  readonly color: string;
  /** Opacity, percent. */
  readonly opacity: number;
  readonly blurPt: number;
  readonly distPt: number;
  /** Direction, degrees clockwise from the positive x axis. */
  readonly dirDeg: number;
}

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const finite = (value: unknown, min: number, max: number): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null;

export function normalizePictureEffectExtent(value: unknown): PictureEffectExtent | null {
  const raw = record(value);
  if (!raw) return null;
  const left = finite(raw.left, -2000, 2000);
  const top = finite(raw.top, -2000, 2000);
  const right = finite(raw.right, -2000, 2000);
  const bottom = finite(raw.bottom, -2000, 2000);
  const rotation = finite(raw.rotation, 0, 359);
  if (left === null || top === null || right === null || bottom === null || rotation === null) {
    return null;
  }
  return { left, top, right, bottom, rotation };
}

export function normalizePictureShadow(value: unknown): PictureShadow | null {
  const raw = record(value);
  if (!raw || typeof raw.color !== "string" || !/^#[0-9a-f]{6}$/.test(raw.color)) return null;
  const opacity = finite(raw.opacity, 0, 100);
  const blurPt = finite(raw.blurPt, 0, 216);
  const distPt = finite(raw.distPt, 0, 216);
  const dirDeg = finite(raw.dirDeg, 0, 360);
  if (opacity === null || blurPt === null || distPt === null || dirDeg === null) return null;
  return { color: raw.color, opacity, blurPt, distPt, dirDeg };
}

/** `drop-shadow()` for a picture's outer shadow (CSS px), or null. */
export function pictureShadowFilter(value: unknown): string | null {
  const shadow = normalizePictureShadow(value);
  if (!shadow || shadow.opacity === 0) return null;
  const radians = (shadow.dirDeg * Math.PI) / 180;
  const px = (pt: number) => ptToPxRounded(pt);
  const dx = px(shadow.distPt * Math.cos(radians));
  const dy = px(shadow.distPt * Math.sin(radians));
  // DrawingML's blur radius spans about two standard deviations, the
  // drop-shadow() length is one.
  const blur = px(shadow.blurPt / 2);
  const red = Number.parseInt(shadow.color.slice(1, 3), 16);
  const green = Number.parseInt(shadow.color.slice(3, 5), 16);
  const blue = Number.parseInt(shadow.color.slice(5, 7), 16);
  return `drop-shadow(${dx}px ${dy}px ${blur}px rgba(${red}, ${green}, ${blue}, ${Math.round(shadow.opacity * 10) / 1000}))`;
}

const quarterTurned = (rotation: number): boolean => {
  const turn = ((rotation % 180) + 180) % 180;
  return turn >= 45 && turn < 135;
};

/**
 * The `wp:effectExtent` Word writes for a picture it turns: what the turned
 * bounds reach past the laid-out box (the extent, swapped when
 * quarter-turned), never negative. Same units as `width` / `height`.
 */
export function turnedPictureEffectExtent(
  width: number,
  height: number,
  rotation: number,
): { top: number; right: number; bottom: number; left: number } {
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const swap = quarterTurned(rotation);
  const boxWidth = swap ? height : width;
  const boxHeight = swap ? width : height;
  const inline = Math.max(0, (width * cos + height * sin - boxWidth) / 2);
  const block = Math.max(0, (width * sin + height * cos - boxHeight) / 2);
  return { top: block, right: inline, bottom: block, left: inline };
}


/**
 * What a picture style's own drawing reaches past the picture's box (CSS px):
 * the outline's outer half, the outer shadow (scaled about its alignment
 * point, offset, blurred), the reflection under it and the glow. Word writes
 * this room as `wp:effectExtent` when a style is applied, so the next line
 * does not cut a floor shadow or a reflection off; the server's export
 * computes the same (document_docx_picture.picture_effects_effect_extent).
 */
export function pictureStyleEffectExtent(
  styleId: unknown,
  width: number,
  height: number,
): { top: number; right: number; bottom: number; left: number } {
  const zero = { top: 0, right: 0, bottom: 0, left: 0 };
  const style = nativePictureStyle(styleId);
  if (!style || !(width > 0) || !(height > 0)) return zero;
  const value = (raw: unknown, fallback = 0) => {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  let left = 0;
  let top = 0;
  let right = width;
  let bottom = height;
  const grow = (l: number, t: number, r: number, b: number) => {
    left = Math.min(left, l);
    top = Math.min(top, t);
    right = Math.max(right, r);
    bottom = Math.max(bottom, b);
  };
  if (style.line) {
    const half = value(style.line.width, EMU_PER_PX) / EMU_PER_PX / 2;
    grow(-half, -half, width + half, height + half);
  }
  for (const effect of style.effects ?? []) {
    if (effect.kind === "outerShdw") {
      const anchor = String(effect.algn ?? "b");
      const ax = ["tl", "l", "bl"].includes(anchor) ? 0 : ["tr", "r", "br"].includes(anchor) ? width : width / 2;
      const ay = ["tl", "t", "tr"].includes(anchor) ? 0 : ["bl", "b", "br"].includes(anchor) ? height : height / 2;
      const sx = value(effect.sx, 100000) / 100000;
      const sy = value(effect.sy, 100000) / 100000;
      const radians = (value(effect.dir) / 60000) * (Math.PI / 180);
      const distance = value(effect.dist) / EMU_PER_PX;
      const dx = distance * Math.cos(radians);
      const dy = distance * Math.sin(radians);
      const xs = [ax - ax * sx + dx, ax + (width - ax) * sx + dx].sort((a, b) => a - b);
      const ys = [ay - ay * sy + dy, ay + (height - ay) * sy + dy].sort((a, b) => a - b);
      const blur = value(effect.blurRad) / EMU_PER_PX;
      grow(xs[0] - blur, ys[0] - blur, xs[1] + blur, ys[1] + blur);
    } else if (effect.kind === "reflection") {
      const end = value(effect.endPos, 100000) / 100000;
      const scale = Math.abs(value(effect.sy, -100000)) / 100000;
      grow(0, height, width, height + value(effect.dist) / EMU_PER_PX + height * scale * end + value(effect.blurRad) / EMU_PER_PX);
    } else if (effect.kind === "glow") {
      const radius = value(effect.rad) / EMU_PER_PX;
      grow(-radius, -radius, width + radius, height + radius);
    }
  }
  return {
    top: Math.max(0, -top),
    right: Math.max(0, right - width),
    bottom: Math.max(0, bottom - height),
    left: Math.max(0, -left),
  };
}

/**
 * The margins (CSS px) an inline picture of `width` x `height` adds to its
 * unrotated box so the line holds what Word lays out.
 */
export function inlinePictureLayoutRoom(
  width: number,
  height: number,
  rotation: number,
  effectExtent: unknown,
  pictureStyle: unknown = null,
): { top: number; right: number; bottom: number; left: number } {
  const zero = { top: 0, right: 0, bottom: 0, left: 0 };
  if (!(width > 0) || !(height > 0)) return zero;
  // The swapped box of a quarter-turned picture, centred on the picture.
  const swap = quarterTurned(rotation);
  const block = swap ? (width - height) / 2 : 0;
  const inline = swap ? (height - width) / 2 : 0;
  const stated = normalizePictureEffectExtent(effectExtent);
  // The file's extent while the picture keeps the rotation it was written
  // for; once the editor turns it, the extent Word writes for the turn.
  // Without the file's own: the turned bounds and the style's effects, each
  // side the larger, as the export writes them.
  const turned = rotation === 0 ? zero : turnedPictureEffectExtent(width, height, rotation);
  const drawn = pictureStyleEffectExtent(pictureStyle, width, height);
  const extent =
    stated && stated.rotation === rotation
      ? stated
      : {
          top: Math.max(turned.top, drawn.top),
          right: Math.max(turned.right, drawn.right),
          bottom: Math.max(turned.bottom, drawn.bottom),
          left: Math.max(turned.left, drawn.left),
        };
  return {
    top: block + extent.top,
    bottom: block + extent.bottom,
    left: inline + extent.left,
    right: inline + extent.right,
  };
}
