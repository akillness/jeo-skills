/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { MirrorablePercentBox, PercentBox } from "../../../../../lib/pdf/annotation-transform";
import { rotatedNativeVectorBounds } from "./nativeVectorGeometry";

/** One gesture on a lifted source vector, as it is written: its frame moved
 * or sized from `from` to `to`, or turned by `degrees` about its centre
 * (frames in page percent, as the frame shows them). */
export type ObjectLiftOp =
  | {
      readonly kind: "fit";
      readonly from: PercentBox;
      readonly to: MirrorablePercentBox;
      /** A turned frame (its angle on the page, clockwise): `from` and `to`
       * are its unturned boxes and the resize is along its own axes. */
      readonly turn?: number;
    }
  | {
      readonly kind: "turn";
      readonly from: PercentBox;
      readonly degrees: number;
      /** The angle the frame stood at before the turn (see fit's). */
      readonly turn?: number;
    };

/** Where a lifted object stands: the stage carries its base pixels from
 * `origin` to `rect` (mirrored by `rect`'s flags) and turns them by
 * `rotation` about `rect`'s centre. */
export interface ObjectLiftPose {
  readonly rect: MirrorablePercentBox;
  readonly rotation: number;
}

const EPSILON = 1e-6;

function sameNumber(a: number, b: number, epsilon = EPSILON): boolean {
  return Math.abs(a - b) <= epsilon;
}

export function sameLiftBox(
  a: PercentBox | null | undefined,
  b: PercentBox | null | undefined,
  epsilon = 1e-4,
): boolean {
  if (!a || !b) return a === b;
  const flagsA = a as MirrorablePercentBox;
  const flagsB = b as MirrorablePercentBox;
  return (
    sameNumber(a.x, b.x, epsilon) &&
    sameNumber(a.y, b.y, epsilon) &&
    sameNumber(a.width, b.width, epsilon) &&
    sameNumber(a.height, b.height, epsilon) &&
    (flagsA.mirrorX === true) === (flagsB.mirrorX === true) &&
    (flagsA.mirrorY === true) === (flagsB.mirrorY === true)
  );
}

export function sameLiftPose(a: ObjectLiftPose, b: ObjectLiftPose): boolean {
  return sameLiftBox(a.rect, b.rect) && sameNumber(normalizeTurn(a.rotation), normalizeTurn(b.rotation), 1e-6);
}

function normalizeTurn(degrees: number): number {
  const value = ((degrees % 360) + 360) % 360;
  return Math.abs(value - 360) < 1e-9 ? 0 : value;
}

/** The frame a pose shows (page percent): the box itself, or the box
 * turned, as the frame of a turned shape stands upright around it. */
export function liftFrame(
  pose: ObjectLiftPose,
  pageWidth: number,
  pageHeight: number,
  /** The angle the pose's frame already stood at (a turned frame). */
  base = 0,
): PercentBox {
  const { rect } = pose;
  const plain = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  if (normalizeTurn(pose.rotation + base) === 0) return plain;
  const turned = rotatedNativeVectorBounds(
    { x: rect.x / 100, y: rect.y / 100, width: rect.width / 100, height: rect.height / 100 },
    pose.rotation + base,
    pageWidth,
    pageHeight,
  );
  return turned
    ? { x: turned.x * 100, y: turned.y * 100, width: turned.width * 100, height: turned.height * 100 }
    : plain;
}

/**
 * The pose after the frame was taken from `from` to `to` (a move or a size
 * of the frame the pose shows). An upright pose takes `to` itself; a turned
 * one is carried by the same move and stretch about the frame (a move is
 * exact; a stretch of a turned shape is the nearest pose, until the page
 * paints the write).
 */
export function liftPoseAfterFit(
  pose: ObjectLiftPose,
  from: PercentBox,
  to: MirrorablePercentBox,
): ObjectLiftPose {
  const flags = pose.rect;
  const mirrorX = (flags.mirrorX === true) !== (to.mirrorX === true);
  const mirrorY = (flags.mirrorY === true) !== (to.mirrorY === true);
  const withFlags = (box: PercentBox): MirrorablePercentBox => ({
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    ...(mirrorX ? { mirrorX: true } : {}),
    ...(mirrorY ? { mirrorY: true } : {}),
  });
  if (normalizeTurn(pose.rotation) === 0) {
    return { rect: withFlags(to), rotation: pose.rotation };
  }
  const scaleX = from.width > EPSILON ? to.width / from.width : 1;
  const scaleY = from.height > EPSILON ? to.height / from.height : 1;
  const centreX = pose.rect.x + pose.rect.width / 2;
  const centreY = pose.rect.y + pose.rect.height / 2;
  const nextCentreX = to.x + (centreX - from.x) * scaleX;
  const nextCentreY = to.y + (centreY - from.y) * scaleY;
  const width = pose.rect.width * scaleX;
  const height = pose.rect.height * scaleY;
  return {
    rect: withFlags({ x: nextCentreX - width / 2, y: nextCentreY - height / 2, width, height }),
    rotation: pose.rotation,
  };
}

/**
 * The pose after a frame the user saw elsewhere (where the page still draws
 * a lift that has no pixels of its own yet) was taken from `from` to `to`:
 * the same move and stretch carry the pose, whose own frame is what is
 * written.
 */
export function liftPoseThroughFit(
  pose: ObjectLiftPose,
  from: PercentBox,
  to: MirrorablePercentBox,
): ObjectLiftPose {
  const scaleX = from.width > EPSILON ? to.width / from.width : 1;
  const scaleY = from.height > EPSILON ? to.height / from.height : 1;
  const flags = pose.rect;
  const mirrorX = (flags.mirrorX === true) !== (to.mirrorX === true);
  const mirrorY = (flags.mirrorY === true) !== (to.mirrorY === true);
  return {
    rect: {
      x: to.x + (pose.rect.x - from.x) * scaleX,
      y: to.y + (pose.rect.y - from.y) * scaleY,
      width: pose.rect.width * scaleX,
      height: pose.rect.height * scaleY,
      ...(mirrorX ? { mirrorX: true } : {}),
      ...(mirrorY ? { mirrorY: true } : {}),
    },
    rotation: pose.rotation,
  };
}

/** The pose after a turn by `degrees` about the frame's centre. A turned
 * box's frame is centred on it, so the box keeps its place. */
export function liftPoseAfterTurn(pose: ObjectLiftPose, degrees: number): ObjectLiftPose {
  return { rect: pose.rect, rotation: pose.rotation + degrees };
}

/**
 * The next write of a queue: consecutive moves and sizes are one write from
 * the first frame to the last (the writer applies a frame's edges, so two
 * edge moves add up exactly); a mirror, or a turn, is written on its own.
 * Returns the write and how many queued gestures it stands for.
 */
export function nextLiftWrite(
  ops: readonly ObjectLiftOp[],
): { op: ObjectLiftOp; count: number } | null {
  const first = ops[0];
  if (!first) return null;
  if (first.kind !== "fit" || first.to.mirrorX || first.to.mirrorY) return { op: first, count: 1 };
  let to: MirrorablePercentBox = first.to;
  let count = 1;
  for (let index = 1; index < ops.length; index += 1) {
    const next = ops[index];
    if (next.kind !== "fit" || next.to.mirrorX || next.to.mirrorY) break;
    if ((next.turn ?? 0) !== (first.turn ?? 0)) break;
    if (!sameLiftBox(next.from, to, 1e-3)) break;
    to = next.to;
    count += 1;
  }
  return {
    op: count === 1 ? first : { kind: "fit", from: first.from, to, ...(first.turn ? { turn: first.turn } : {}) },
    count,
  };
}

/** A box in a canvas's pixels (whole pixels, inside the canvas). */
export interface PixelRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function percentBoxPixels(box: PercentBox, width: number, height: number, grow = 0): PixelRect | null {
  const left = Math.max(0, Math.floor((box.x / 100) * width) - grow);
  const top = Math.max(0, Math.floor((box.y / 100) * height) - grow);
  const right = Math.min(width, Math.ceil(((box.x + box.width) / 100) * width) + grow);
  const bottom = Math.min(height, Math.ceil(((box.y + box.height) / 100) * height) + grow);
  return right - left >= 1 && bottom - top >= 1
    ? { x: left, y: top, width: right - left, height: bottom - top }
    : null;
}

/**
 * Whether two renders of the same region show the same picture, as the eye
 * sees it: averaged over 4 x 4 blocks (so a render's anti-aliasing at a
 * fractional position does not count), at most a few blocks may differ by
 * more than 32 levels. An object left at another place differs in every
 * block it covers.
 */
export function pixelBlocksMatch(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  width: number,
  height: number,
): boolean {
  const block = 4;
  const columns = Math.ceil(width / block);
  const rows = Math.ceil(height / block);
  let blocks = 0;
  let off = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      let sumA = [0, 0, 0];
      let sumB = [0, 0, 0];
      let count = 0;
      const yEnd = Math.min(height, (row + 1) * block);
      const xEnd = Math.min(width, (column + 1) * block);
      for (let y = row * block; y < yEnd; y += 1) {
        for (let x = column * block; x < xEnd; x += 1) {
          const index = (y * width + x) * 4;
          // Composited over white, as the page is.
          const alphaA = a[index + 3] / 255;
          const alphaB = b[index + 3] / 255;
          sumA = [
            sumA[0] + a[index] * alphaA + 255 * (1 - alphaA),
            sumA[1] + a[index + 1] * alphaA + 255 * (1 - alphaA),
            sumA[2] + a[index + 2] * alphaA + 255 * (1 - alphaA),
          ];
          sumB = [
            sumB[0] + b[index] * alphaB + 255 * (1 - alphaB),
            sumB[1] + b[index + 1] * alphaB + 255 * (1 - alphaB),
            sumB[2] + b[index + 2] * alphaB + 255 * (1 - alphaB),
          ];
          count += 1;
        }
      }
      blocks += 1;
      if (
        Math.abs(sumA[0] - sumB[0]) / count > 32 ||
        Math.abs(sumA[1] - sumB[1]) / count > 32 ||
        Math.abs(sumA[2] - sumB[2]) / count > 32
      ) {
        off += 1;
      }
    }
  }
  return off <= Math.max(2, Math.floor(blocks * 0.005));
}

/**
 * Whether the page canvas paints, in every region the stage covers, what
 * the stage shows: then the stage can go and nothing on screen changes.
 * Null when the two cannot be compared (another size, a canvas that cannot
 * be read): the caller decides by other means.
 */
export function stageMatchesPage(
  stage: HTMLCanvasElement,
  page: HTMLCanvasElement,
  regions: readonly PixelRect[],
): boolean | null {
  if (stage.width !== page.width || stage.height !== page.height || regions.length === 0) return null;
  const stageContext = stage.getContext("2d", { willReadFrequently: true });
  const pageContext = page.getContext("2d", { willReadFrequently: true });
  if (!stageContext || !pageContext) return null;
  try {
    for (const region of regions) {
      const shown = stageContext.getImageData(region.x, region.y, region.width, region.height).data;
      const painted = pageContext.getImageData(region.x, region.y, region.width, region.height).data;
      if (!pixelBlocksMatch(shown, painted, region.width, region.height)) return false;
    }
  } catch {
    return null;
  }
  return true;
}
