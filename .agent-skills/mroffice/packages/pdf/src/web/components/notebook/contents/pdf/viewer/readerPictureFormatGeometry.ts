/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The geometry of the reader's Picture Format commands on a PDF picture's
 * paint: the frame a format drawing grows to (lib/pdf/picture-format), and
 * Word's Position, Align and Rotate > Reset as moves of the paint. Everything
 * is an affine in the writer's convention (row vectors: a point is `p x M`;
 * a transform request's `pageTransform` P is applied after the paint, so the
 * new paint is `M x P`).
 */

export type PdfAffine = readonly [number, number, number, number, number, number];

export const PDF_IDENTITY_AFFINE: PdfAffine = Object.freeze([1, 0, 0, 1, 0, 0]) as PdfAffine;

/** `left x right`: first `left`, then `right`. */
export function multiplyAffine(left: PdfAffine, right: PdfAffine): PdfAffine {
  const [a, b, c, d, e, f] = left;
  const [A, B, C, D, E, F] = right;
  return [a * A + b * C, a * B + b * D, c * A + d * C, c * B + d * D, e * A + f * C + E, e * B + f * D + F];
}

export function invertAffine(m: PdfAffine): PdfAffine | null {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

export function affineIsIdentity(m: PdfAffine, tolerance = 1e-6): boolean {
  return m.every((value, index) => Math.abs(value - PDF_IDENTITY_AFFINE[index]) <= tolerance);
}

/** How far a format drawing reaches past the picture, in points along the
 * picture's own axes (its pixel rows: `top` is past its first row). */
export type PdfPictureExtent = Readonly<{ left: number; top: number; right: number; bottom: number }>;

/** The picture's paint's own size in points: its unit square's two sides. */
export function paintSizePoints(matrix: PdfAffine): Readonly<{ width: number; height: number }> {
  return {
    width: Math.hypot(matrix[0], matrix[1]),
    height: Math.hypot(matrix[2], matrix[3]),
  };
}

/**
 * The picture's own rectangle inside a paint that also draws `extent` past
 * it, as the unit square's sub-rectangle (image space: y up, so the first
 * pixel row -- `top` -- is at y = 1).
 */
function properUnitRect(matrix: PdfAffine, extent: PdfPictureExtent): PdfAffine | null {
  const total = paintSizePoints(matrix);
  if (!(total.width > 0) || !(total.height > 0)) return null;
  const left = extent.left / total.width;
  const right = extent.right / total.width;
  const top = extent.top / total.height;
  const bottom = extent.bottom / total.height;
  const width = 1 - left - right;
  const height = 1 - top - bottom;
  if (!(width > 0) || !(height > 0)) return null;
  // unit -> sub-rectangle: x' = left + x * width, y' = bottom + y * height.
  return [width, 0, 0, height, left, bottom];
}

/** The picture's own size in points inside a paint that draws `extent` too. */
export function properSizePoints(matrix: PdfAffine, extent: PdfPictureExtent): Readonly<{ width: number; height: number }> {
  const total = paintSizePoints(matrix);
  return {
    width: Math.max(0, total.width - extent.left - extent.right),
    height: Math.max(0, total.height - extent.top - extent.bottom),
  };
}

/**
 * The transform after the paint that takes a paint drawing `from` past the
 * picture to one drawing `to`, the picture itself staying where it is.
 * Null when nothing changes (or the paint cannot be inverted).
 */
export function extentFrameTransform(
  matrix: PdfAffine,
  from: PdfPictureExtent,
  to: PdfPictureExtent,
): PdfAffine | null {
  // A drawing drawn again reaches as far give or take its ink's rounding: a
  // frame moved by less than a hundredth of a point is no move (the writer
  // refuses it as a no-op).
  const sides = ["left", "top", "right", "bottom"] as const;
  if (sides.every((side) => Math.abs(to[side] - from[side]) < 0.01)) return null;
  const fromRect = properUnitRect(matrix, from);
  if (!fromRect) return null;
  // The picture's own paint: the unit square onto the picture alone.
  const proper = multiplyAffine(fromRect, matrix);
  const properSize = paintSizePoints(proper);
  const total = {
    width: properSize.width + to.left + to.right,
    height: properSize.height + to.top + to.bottom,
  };
  // The new paint: the unit square onto the grown rectangle, i.e. the proper
  // paint after the inverse of the picture's place inside the new square.
  const toRect: PdfAffine = [
    properSize.width / total.width,
    0,
    0,
    properSize.height / total.height,
    to.left / total.width,
    to.bottom / total.height,
  ];
  const inverse = invertAffine(toRect);
  const matrixInverse = invertAffine(matrix);
  if (!inverse || !matrixInverse) return null;
  const next = multiplyAffine(inverse, proper);
  const transform = multiplyAffine(matrixInverse, next);
  return affineIsIdentity(transform) ? null : transform;
}

/** The transform after the paint that takes `matrix` to `target` (Reset
 * Picture & Size: the paint the picture had before any format). */
export function paintToTransform(matrix: PdfAffine, target: PdfAffine): PdfAffine | null {
  const inverse = invertAffine(matrix);
  if (!inverse) return null;
  const transform = multiplyAffine(inverse, target);
  return affineIsIdentity(transform) ? null : transform;
}

type Display = Readonly<{ transform: PdfAffine; width: number; height: number }>;

/** The paint's box on the page as shown (display units, y down). */
export function paintDisplayBox(matrix: PdfAffine, display: Display): { left: number; top: number; right: number; bottom: number } {
  const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => {
    const ux = x * matrix[0] + y * matrix[2] + matrix[4];
    const uy = x * matrix[1] + y * matrix[3] + matrix[5];
    const t = display.transform;
    return [ux * t[0] + uy * t[2] + t[4], ux * t[1] + uy * t[3] + t[5]];
  });
  const xs = corners.map((point) => point[0]);
  const ys = corners.map((point) => point[1]);
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

/** A move of the paint by (dx, dy) display units, as a user-space transform. */
function displayMove(display: Display, dx: number, dy: number): PdfAffine | null {
  const [a, b, c, d] = display.transform;
  const linear = invertAffine([a, b, c, d, 0, 0]);
  if (!linear) return null;
  const ux = dx * linear[0] + dy * linear[2];
  const uy = dx * linear[1] + dy * linear[3];
  if (Math.abs(ux) < 1e-6 && Math.abs(uy) < 1e-6) return null;
  return [1, 0, 0, 1, ux, uy];
}

/** Word's page margin for Position and Align: 1 inch, Word's default. */
export const PDF_PICTURE_PAGE_MARGIN_PT = 72;

export type PdfPicturePositionPreset =
  | "topLeft" | "topCenter" | "topRight"
  | "middleLeft" | "middleCenter" | "middleRight"
  | "bottomLeft" | "bottomCenter" | "bottomRight";

export const PDF_PICTURE_POSITION_PRESETS: readonly PdfPicturePositionPreset[] = [
  "topLeft", "topCenter", "topRight",
  "middleLeft", "middleCenter", "middleRight",
  "bottomLeft", "bottomCenter", "bottomRight",
];

/** The margins the page as shown leaves (smaller pages keep a sixth). */
function marginsOf(display: Display): number {
  return Math.min(PDF_PICTURE_PAGE_MARGIN_PT, display.width / 6, display.height / 6);
}

function along(size: number, extent: number, where: "start" | "middle" | "end", margin: number): number {
  if (where === "start") return margin;
  if (where === "end") return extent - margin - size;
  return (extent - size) / 2;
}

/** Position > With Text Wrapping: the picture at one of the nine places
 * inside the page's margins (Word's presets, relative to the margins). */
export function positionTransform(matrix: PdfAffine, display: Display, preset: PdfPicturePositionPreset): PdfAffine | null {
  const box = paintDisplayBox(matrix, display);
  const width = box.right - box.left;
  const height = box.bottom - box.top;
  const margin = marginsOf(display);
  const vertical = preset.startsWith("top") ? "start" : preset.startsWith("middle") ? "middle" : "end";
  const horizontal = preset.endsWith("Left") ? "start" : preset.endsWith("Center") ? "middle" : "end";
  const left = along(width, display.width, horizontal, margin);
  const top = along(height, display.height, vertical, margin);
  return displayMove(display, left - box.left, top - box.top);
}

export type PdfPictureAlign = "left" | "center" | "right";

/** Align: the picture against the page's left or right margin, or centred,
 * where it stands vertically (Docs' Left / Center / Right). */
export function alignTransform(matrix: PdfAffine, display: Display, align: PdfPictureAlign): PdfAffine | null {
  const box = paintDisplayBox(matrix, display);
  const width = box.right - box.left;
  const margin = marginsOf(display);
  const left = along(width, display.width, align === "left" ? "start" : align === "right" ? "end" : "middle", margin);
  return displayMove(display, left - box.left, 0);
}
