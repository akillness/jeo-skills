/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { FractionRect } from "@/lib/pdf/embedded-image-edits";
import {
  nativeVectorDragGhostBox,
  paintNativeVectorCropStage,
  paintNativeVectorDragStage,
  type PdfVectorDragModel,
} from "../../../../../lib/pdf/native-vector-drag-backdrop";
import type {
  PdfNativeVectorSelectionRoute,
} from "../../../../../lib/pdf/semantic-appearance-inspection";
import {
  canvasBlendForPdfMode,
  paintNativeVectorLayerStage,
  type PdfVectorDragLayers,
} from "../../../../../lib/pdf/native-vector-drag-layers";
import type {
  MirrorablePercentBox,
  PercentBox,
} from "../../../../../lib/pdf/annotation-transform";
import type { PdfNativeVectorAcceptedTarget } from "../../../../../lib/pdf/native-vector-selection-edit";
import type { ObjectLiftOp, ObjectLiftPose } from "./objectLift";

/**
 * An object being edited on the reading canvas, lifted off the page (see
 * objectLift.ts): kept from its first gesture until the page is seen to
 * paint it where it shows, whatever the page repaints meanwhile.
 */
export interface CanvasObjectLift {
  readonly id: number;
  /** What is lifted: a source vector (written by the lift's writer), a
   * source picture or a placed annotation (written by their own editors). */
  readonly kind: "vector" | "picture" | "placed";
  /** The user's selection the object stands for (source vectors: the
   * selection epoch, which a save's reselection keeps). */
  readonly epoch: number;
  /** Where it shows at rest. */
  readonly pose: ObjectLiftPose;
  /** Where the file is known to hold it. */
  readonly acked: ObjectLiftPose;
  /** Where the page canvas was last seen to paint it (the file's pose as of
   * the page's last paint after a write). */
  readonly drawn: ObjectLiftPose;
  /** Gestures still to be written, in order (source vectors). */
  readonly ops: readonly ObjectLiftOp[];
  /** The object as the newest revision names it (source vectors). */
  readonly target: PdfNativeVectorAcceptedTarget | null;
  /** The digest of the bytes its last write made (source vectors): the
   * page painting them shows the lift's pose, and the lift lands. */
  readonly expectSha: string | null;
  /** One of its writes is on its way. */
  readonly writing: boolean;
  /** Another command rewrote its look: the page is taken as it paints. */
  readonly stale: boolean;
  /** When it went stale for the page showing other bytes: only a paint
   * after this is of those bytes. */
  readonly staleAt?: number;
  /** The key its page layers were rendered under (a source vector's key
   * changes with each revision; the layers it was lifted with do not). */
  readonly layersKey: string;
}

/** The drag stage: an object's pixels carried by its frame (and, once let
 * go, lifted until the page paints it where it shows). */
export interface CanvasObjectGhostState {
  readonly pageNumber: number;
  readonly key: string;
  readonly canvas: HTMLCanvasElement;
  readonly rect: PercentBox;
  readonly settled: boolean;
  readonly sourceKey: string;
  /** A source vector, or an annotation/widget/overlay moved by its frame. */
  readonly family: "vector" | "placed";
  /** Where the object was when the gesture began (where the layers' object
   * stands, for a lift). */
  readonly origin: PercentBox;
  /** Every place the lifted object was dropped at: a write that lands
   * meanwhile paints it at one of them, and the stage covers it there. */
  readonly covers?: readonly PercentBox[];
  /** The object against the page without it (null until that page has
   * been rendered): its patch erases the original, and the ghost is
   * recomposed from it wherever the pointer takes the object. */
  readonly model: PdfVectorDragModel | null;
  /** Until the model exists: the object's plain crop, which `canvas` (the
   * stage, always) shows where the frame is; and the page canvas's size,
   * which is the stage's. */
  readonly crop: HTMLCanvasElement | null;
  readonly page: { width: number; height: number } | null;
  /** The three real layers of its page (below, the object, above). With
   * them the stage is plain compositing and nothing is estimated. */
  readonly layers: PdfVectorDragLayers | null;
  /** Clockwise degrees the ghost turns about its frame's centre, on top of
   * whatever the object's base pixels show. */
  readonly rotation: number;
  /** The angle the object's own frame already stands at on the page (a
   * shape turned earlier): `origin` and `rect` are that turned frame's
   * unturned boxes, and a resize scales along its own axes, as PowerPoint
   * and WPS resize a turned shape. 0 or absent: an upright frame. */
  readonly base?: number;
  /** With `base`: the box the object's pixels were cut from (the turned
   * frame's bounding box on the page). */
  readonly cutAt?: PercentBox;
  /** A gesture in hand on a lifted object: the frame it started from and
   * the pose the object had then. */
  readonly gesture?: { readonly from: PercentBox; readonly pose: ObjectLiftPose };
  readonly lift?: CanvasObjectLift;
}

/**
 * Repaint a canvas-object ghost where its frame now is, turned or not.
 * `ghost.canvas` is the drag stage: a canvas the size of the page canvas,
 * mounted exactly over it, that holds the whole frame (the page without the
 * object at its start, the object where it now is, what lies over its
 * start). It never moves; one call changes all of its pixels.
 */
export function paintCanvasObjectGhost(
  ghost: {
    model: PdfVectorDragModel;
    canvas: HTMLCanvasElement;
    origin: PercentBox;
  },
  rect: PercentBox,
  rotation: number,
  canvas: HTMLCanvasElement = ghost.canvas,
): void {
  const box = nativeVectorDragGhostBox(ghost.model, rect, ghost.origin, rotation);
  const start = nativeVectorDragGhostBox(ghost.model, ghost.origin, ghost.origin).pixels;
  paintNativeVectorDragStage(ghost.model, canvas, start, box.pixels, box.turn, box.mirror);
  // For a reader of the DOM (the walk-through harness): where the object is.
  canvas.dataset.ghostBox = `${box.pixels.x},${box.pixels.y},${box.pixels.width},${box.pixels.height}`;
  canvas.dataset.painted = canvasObjectGhostPaintKey(rect, rotation, false);
}

/**
 * What a drag moves, as the page's layers are split around it: source
 * vectors by where each stands in the page's operator list and how it blends
 * with what lies under it, or the annotations (form widgets) the page paints
 * at a frame, whose appearance blocks are found by their place.
 */
export type CanvasObjectLayerSource =
  | {
      readonly vectors: readonly {
        readonly operatorIndex: number;
        readonly blend: GlobalCompositeOperation;
      }[];
      /** Where the moving paints reach, past the page edge too. */
      readonly extent?: FractionRect;
      /** Where the object must be found (a previous revision's route, whose
       * operator index the page on screen may have moved): layers whose
       * moving ink lies elsewhere are refused. */
      readonly expect?: FractionRect;
    }
  | { readonly annotationsAt: FractionRect; readonly extent?: FractionRect };

export function nativeVectorLayerSource(
  routes: readonly PdfNativeVectorSelectionRoute[],
  extent?: FractionRect | null,
  expect?: FractionRect | null,
): CanvasObjectLayerSource {
  return {
    vectors: routes.map((route) => ({
      operatorIndex: route.rendererOperatorIndex,
      blend: canvasBlendForPdfMode(route.style?.style.blendMode),
    })),
    ...(extent ? { extent } : {}),
    ...(expect ? { expect } : {}),
  };
}

/** Whether layers' moving ink stands where the object is expected (page
 * fractions; within a hundredth of the page on every edge). */
export function layersStandAt(
  layers: { readonly width: number; readonly height: number; readonly objectBox: { x: number; y: number; width: number; height: number } },
  expect: FractionRect,
): boolean {
  const box = layers.objectBox;
  const tolerance = 0.01;
  const near = (a: number, b: number) => Math.abs(a - b) <= tolerance;
  return (
    near(box.x / layers.width, expect.x) &&
    near(box.y / layers.height, expect.y) &&
    near((box.x + box.width) / layers.width, expect.x + expect.width) &&
    near((box.y + box.height) / layers.height, expect.y + expect.height)
  );
}

/** A source picture's paint, moved as a source vector's is: the page's
 * layers are split around that one operation. */
export function nativePictureLayerSource(
  operatorIndex: number,
  extent?: FractionRect | null,
): CanvasObjectLayerSource {
  return { vectors: [{ operatorIndex, blend: "source-over" }], ...(extent ? { extent } : {}) };
}

/** The boxes' union (page fractions); null for none. */
export function fractionRectUnion(rects: readonly (FractionRect | null | undefined)[]): FractionRect | null {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const rect of rects) {
    if (!rect) continue;
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.width);
    bottom = Math.max(bottom, rect.y + rect.height);
  }
  return Number.isFinite(left) && right > left && bottom > top
    ? { x: left, y: top, width: right - left, height: bottom - top }
    : null;
}

/** A source picture's whole extent (page fractions of the page as shown),
 * its unit square through its paint matrix, past the page edge too. */
export function nativePictureExtent(target: {
  readonly matrix?: readonly [number, number, number, number, number, number];
  readonly display?: Readonly<{
    transform: readonly [number, number, number, number, number, number];
    width: number;
    height: number;
  }>;
}): FractionRect | null {
  const m = target.matrix;
  const display = target.display;
  if (!m || !display || display.width <= 0 || display.height <= 0) return null;
  const v = display.transform;
  const points = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ].map(([u, w]) => {
    const x = m[0] * u + m[2] * w + m[4];
    const y = m[1] * u + m[3] * w + m[5];
    return {
      x: (v[0] * x + v[2] * y + v[4]) / display.width,
      y: (v[1] * x + v[3] * y + v[5]) / display.height,
    };
  });
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}

/** The drag stage's key for a source picture (its page and paint). */
export function nativePictureGhostKey(target: {
  readonly pageNumber: number;
  readonly order: number;
  readonly operatorIndex?: number;
}): string {
  return `picture:${target.pageNumber}:${target.order}:${target.operatorIndex ?? ""}`;
}

/** One object's page layers, for one revision of the file at one canvas size. */
export function nativeVectorLayersId(key: string, sourceKey: string, canvas: HTMLCanvasElement): string {
  return `${key}\u0000${sourceKey}\u0000${canvas.width}x${canvas.height}`;
}

/** What a stage was last painted for: its frame, turn and settled state. */
export function canvasObjectGhostPaintKey(rect: PercentBox, rotation: number, settled: boolean): string {
  const flags = rect as MirrorablePercentBox;
  return [
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    flags.mirrorX ? 1 : 0,
    flags.mirrorY ? 1 : 0,
    rotation,
    settled ? 1 : 0,
  ].join(",");
}

/**
 * Repaint a ghost that has no model yet: the object's plain crop, on the
 * same never-moving stage, where its frame now is. Translucent while the
 * original still shows underneath, whole once the gesture has settled.
 */
export function paintCanvasObjectCrop(
  ghost: {
    crop: HTMLCanvasElement;
    canvas: HTMLCanvasElement;
    page: { width: number; height: number };
  },
  rect: PercentBox,
  rotation: number,
  settled: boolean,
): void {
  const flags = rect as MirrorablePercentBox;
  const target = {
    x: (rect.x / 100) * ghost.page.width,
    y: (rect.y / 100) * ghost.page.height,
    width: (rect.width / 100) * ghost.page.width,
    height: (rect.height / 100) * ghost.page.height,
  };
  paintNativeVectorCropStage(ghost.canvas, ghost.crop, ghost.page, target, {
    rotationDegrees: rotation,
    mirror:
      flags.mirrorX || flags.mirrorY
        ? { x: flags.mirrorX === true, y: flags.mirrorY === true }
        : null,
    opacity: settled ? 1 : 0.85,
  });
  ghost.canvas.dataset.ghostBox = `${Math.round(target.x)},${Math.round(target.y)},${Math.round(target.width)},${Math.round(target.height)}`;
  ghost.canvas.dataset.painted = canvasObjectGhostPaintKey(rect, rotation, settled);
}

/**
 * Repaint a ghost that is three real layers of its page: the page up to
 * the object, the object carried by its frame, what the page paints after
 * it (lib/pdf/native-vector-drag-layers.ts).
 */
/** The stage's whole motion in page pixels for a turned frame: from the
 * frame `origin` standing at `base` to `rect` at `base + rotation`, scaled
 * along the frame's own axes. */
export function canvasObjectGhostMatrix(
  origin: PercentBox,
  rect: PercentBox,
  rotation: number,
  base: number,
  width: number,
  height: number,
): [number, number, number, number, number, number] {
  const px = (box: PercentBox) => ({
    cx: ((box.x + box.width / 2) / 100) * width,
    cy: ((box.y + box.height / 2) / 100) * height,
    w: (box.width / 100) * width,
    h: (box.height / 100) * height,
  });
  const from = px(origin);
  const to = px(rect);
  const sx = from.w > 1e-6 ? to.w / from.w : 1;
  const sy = from.h > 1e-6 ? to.h / from.h : 1;
  const back = (-base * Math.PI) / 180;
  const turn = ((base + rotation) * Math.PI) / 180;
  const [c1, s1] = [Math.cos(back), Math.sin(back)];
  const [c2, s2] = [Math.cos(turn), Math.sin(turn)];
  // R(turn) . S . R(back): the linear part.
  const a = c2 * sx * c1 - s2 * sy * s1;
  const b = s2 * sx * c1 + c2 * sy * s1;
  const c = -c2 * sx * s1 - s2 * sy * c1;
  const d = -s2 * sx * s1 + c2 * sy * c1;
  return [a, b, c, d, to.cx - (a * from.cx + c * from.cy), to.cy - (b * from.cx + d * from.cy)];
}

function turnedFrame(ghost: { base?: number }): boolean {
  return typeof ghost.base === "number" && Math.abs(ghost.base % 360) > 1e-9;
}

export function paintCanvasObjectLayers(
  ghost: {
    layers: PdfVectorDragLayers;
    canvas: HTMLCanvasElement;
    origin: PercentBox;
    /** Earlier drops the page may now paint the object at. */
    covers?: readonly PercentBox[];
    base?: number;
  },
  rect: PercentBox,
  rotation: number,
): void {
  const { width, height } = ghost.layers;
  const pixels = (box: PercentBox) => ({
    x: (box.x / 100) * width,
    y: (box.y / 100) * height,
    width: (box.width / 100) * width,
    height: (box.height / 100) * height,
  });
  const flags = rect as MirrorablePercentBox;
  const target = pixels(rect);
  paintNativeVectorLayerStage(ghost.canvas, ghost.layers, pixels(ghost.origin), target, {
    ...(turnedFrame(ghost)
      ? { matrix: canvasObjectGhostMatrix(ghost.origin, rect, rotation, ghost.base ?? 0, width, height) }
      : {}),
    rotationDegrees: rotation,
    mirror:
      flags.mirrorX || flags.mirrorY
        ? { x: flags.mirrorX === true, y: flags.mirrorY === true }
        : null,
    covers: ghost.covers?.map(pixels),
  });
  ghost.canvas.dataset.ghostBox = `${Math.round(target.x)},${Math.round(target.y)},${Math.round(target.width)},${Math.round(target.height)}`;
  ghost.canvas.dataset.painted = canvasObjectGhostPaintKey(rect, rotation, false);
}

/** Repaint whatever a ghost is: its page layers, its model or its crop. */
export function repaintCanvasObjectGhost(
  ghost: {
    layers: PdfVectorDragLayers | null;
    model: PdfVectorDragModel | null;
    crop: HTMLCanvasElement | null;
    page: { width: number; height: number } | null;
    canvas: HTMLCanvasElement;
    origin: PercentBox;
    covers?: readonly PercentBox[];
    base?: number;
    cutAt?: PercentBox;
  },
  rect: PercentBox,
  rotation: number,
  settled: boolean,
): void {
  if (ghost.layers) {
    paintCanvasObjectLayers({ ...ghost, layers: ghost.layers }, rect, rotation);
  } else if (turnedFrame(ghost)) {
    // A turned frame's object goes by its crop (cut from the frame's
    // bounding box) until its layers come; the model is cut upright.
    if (!ghost.crop || !ghost.page) return;
    const cut = ghost.cutAt ?? ghost.origin;
    paintNativeVectorCropStage(ghost.canvas, ghost.crop, ghost.page, { x: 0, y: 0, width: 0, height: 0 }, {
      opacity: settled ? 1 : 0.85,
      matrix: {
        transform: canvasObjectGhostMatrix(ghost.origin, rect, rotation, ghost.base ?? 0, ghost.page.width, ghost.page.height),
        cropAt: {
          x: Math.round((cut.x / 100) * ghost.page.width),
          y: Math.round((cut.y / 100) * ghost.page.height),
        },
      },
    });
    ghost.canvas.dataset.painted = canvasObjectGhostPaintKey(rect, rotation, settled);
  } else if (ghost.model) {
    paintCanvasObjectGhost({ ...ghost, model: ghost.model }, rect, rotation);
  } else if (ghost.crop && ghost.page) {
    paintCanvasObjectCrop({ canvas: ghost.canvas, crop: ghost.crop, page: ghost.page }, rect, rotation, settled);
  }
}
