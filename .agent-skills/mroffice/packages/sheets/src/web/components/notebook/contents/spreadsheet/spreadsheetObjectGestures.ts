/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { gridAnchorPointAtPixels, objectBoundsPixels, type SpreadsheetObjectBounds } from "../../../../lib/spreadsheet/drawing-buttons";
import { aspectLockedResizeSize } from "../../../../lib/spreadsheet/drawing-aspect";
import { type CSSProperties } from "react";
import { type DocumentInkEraser, type DocumentInkPreset } from "@mrnote/core/web/lib/document-ink.ts";
import { type ChartDrawingFrame } from "../../../../lib/spreadsheet/chart-groups";
import { type TransformMember } from "@mrnote/core/web/lib/presentation-multi-transform.ts";
import { adjustCropEdge, type CropRect } from "@mrnote/core/web/lib/presentation-crop-group.ts";
import { offsetOfLine } from "@mrnote/core/web/lib/spreadsheet/grid-sizing.ts";
import { type SpreadsheetInkPoint } from "@mrnote/core/web/lib/spreadsheet/shapes.ts";
import { type SpreadsheetObject } from "./spreadsheetSheetModel";

export type SpreadsheetObjectResizeHandle =
  | "north-west"
  | "north"
  | "north-east"
  | "east"
  | "south-east"
  | "south"
  | "south-west"
  | "west";

export interface SpreadsheetObjectTransformPreview extends SpreadsheetObjectBounds {
  sheetId: string;
  objectId: string;
  rotation: number;
  /** The object's mirror flags while a resize handle is dragged through the
   * pinned edge (Excel flips the shape in the same gesture); absent, the
   * object's own flags show. */
  flipH?: boolean;
  flipV?: boolean;
  /**
   * A SmartArt diagram-frame gesture only: the box is the members' union and
   * this carries every member's own bounds under it (object id -> bounds), the
   * shared multi-selection transform having placed each one.
   */
  members?: ReadonlyMap<string, SpreadsheetObjectBounds>;
}

/** A SmartArt diagram-frame gesture: the members the frame carries as one. */
export interface SpreadsheetObjectFrameGesture {
  bounds: SpreadsheetObjectBounds;
  members: readonly SpreadsheetObject[];
}

export type SpreadsheetObjectTransformGesture =
  | {
      kind: "move";
      pointerId: number;
      captureTarget: HTMLElement;
      moved: boolean;
      objectId: string;
      sheetId: string;
      startClientX: number;
      startClientY: number;
      startBounds: SpreadsheetObjectBounds;
      startRotation: number;
      sourceObject: SpreadsheetObject;
      sourceObjects: readonly SpreadsheetObject[];
      frameMembers?: readonly TransformMember[];
    }
  | {
      kind: "resize";
      pointerId: number;
      objectId: string;
      sheetId: string;
      startClientX: number;
      startClientY: number;
      startBounds: SpreadsheetObjectBounds;
      startRotation: number;
      handle: SpreadsheetObjectResizeHandle;
      sourceObject: SpreadsheetObject;
      sourceObjects: readonly SpreadsheetObject[];
      frameMembers?: readonly TransformMember[];
    }
  | {
      kind: "rotate";
      pointerId: number;
      objectId: string;
      sheetId: string;
      centerClientX: number;
      centerClientY: number;
      startPointerAngle: number;
      startBounds: SpreadsheetObjectBounds;
      startRotation: number;
      sourceObject: SpreadsheetObject;
      sourceObjects: readonly SpreadsheetObject[];
    };

export function releaseObjectMoveCapture(gesture: SpreadsheetObjectTransformGesture | null) {
  if (gesture?.kind !== "move") return;
  try {
    if (gesture.captureTarget.hasPointerCapture?.(gesture.pointerId)) {
      gesture.captureTarget.releasePointerCapture?.(gesture.pointerId);
    }
  } catch {
    // The browser may have already retired this pointer or detached its target.
  }
}

export interface SpreadsheetPictureCropPreview {
  sheetId: string;
  objectId: string;
  crop: CropRect;
}

export interface SpreadsheetPictureCropGesture {
  objectId: string;
  sheetId: string;
  handle: SpreadsheetObjectResizeHandle;
  startClientX: number;
  startClientY: number;
  fractionPerPixelX: number;
  fractionPerPixelY: number;
  /** The picture's turn, to read a pointer move along its own sides
   *  (officeShapeLocalPoint); the crop frame turns and never mirrors. */
  rotation: number;
  startCrop: CropRect;
  latestCrop: CropRect;
}

export type SpreadsheetInkInteractionMode = "draw" | "eraser" | "lasso";

/** A pen of the Draw tab's gallery (Excel's first four, then the user's). */
export type SpreadsheetInkPreset = DocumentInkPreset;

export interface SpreadsheetInkGesture {
  mode: SpreadsheetInkInteractionMode | "move";
  /** The pointer the stroke belongs to; no other pointer's move or lift touches it. */
  pointerId: number;
  sheetId: string;
  points: SpreadsheetInkPoint[];
  stageLeft: number;
  stageTop: number;
  contentPerScreenX: number;
  contentPerScreenY: number;
  maxX: number;
  maxY: number;
  sourceObjects: readonly SpreadsheetObject[];
  selectedIds: ReadonlySet<string>;
  /** XLS-A032: when each of `points` was sampled (performance.now ms). */
  times: number[];
  preset: SpreadsheetInkPreset;
  /** Which of the Eraser's kinds an eraser gesture rubs with. */
  eraser: DocumentInkEraser;
}

/**
 * The frame itself among a frame gesture's members: the shared multi-resize
 * scales every member about the members' union box, and a SmartArt graphic's
 * frame (Excel's one graphic frame) is that box, larger than its shapes'
 * union. Never a member of the result (`frameGestureResult`).
 */
export const FRAME_GESTURE_BOX_ID = "\u0000frame";

export function frameGestureMembers(
  frame: SpreadsheetObjectFrameGesture,
  colWidth: Parameters<typeof objectBoundsPixels>[1],
  rowHeight: Parameters<typeof objectBoundsPixels>[2],
): TransformMember[] {
  return [
    ...frame.members.map((member) => ({
      blockId: member.id,
      startGeom: objectBoundsPixels(member, colWidth, rowHeight),
    })),
    { blockId: FRAME_GESTURE_BOX_ID, startGeom: frame.bounds },
  ];
}

/** A frame gesture's member boxes, without the frame's own. */
export function frameGestureResult(
  members: ReadonlyMap<string, SpreadsheetObjectBounds>,
): ReadonlyMap<string, SpreadsheetObjectBounds> {
  return new Map([...members].filter(([blockId]) => blockId !== FRAME_GESTURE_BOX_ID));
}

export function frameMembersMoved(
  members: readonly TransformMember[],
  dx: number,
  dy: number,
): ReadonlyMap<string, SpreadsheetObjectBounds> {
  return new Map(members.filter((member) => member.blockId !== FRAME_GESTURE_BOX_ID).map((member) => [member.blockId, {
    ...member.startGeom,
    left: member.startGeom.left + dx,
    top: member.startGeom.top + dy,
  }]));
}

/** The chart-group entries with a diagram-frame gesture's member boxes written in. */
export function chartGroupEntriesWithMemberFrames<T extends { id: string; frame: ChartDrawingFrame }>(
  entries: readonly T[],
  members: ReadonlyMap<string, SpreadsheetObjectBounds>,
): T[] | null {
  const ids = new Set([...members.keys()].map((objectId) => `drawing:${objectId}`));
  if (entries.filter((entry) => ids.has(entry.id)).length !== ids.size) return null;
  return entries.map((entry) => {
    const box = members.get(entry.id.startsWith("drawing:") ? entry.id.slice(8) : "");
    if (!box || ![box.left, box.top, box.width, box.height].every(Number.isFinite) || box.width <= 0 || box.height <= 0) return entry;
    return { ...entry, frame: { left: box.left, top: box.top, width: box.width, height: box.height } };
  });
}

export function objectPositionStyle(
  object: SpreadsheetObject,
  columnWidth: (column: number) => number,
  rowHeight: (row: number) => number,
): CSSProperties {
  const { left, top, width, height } = objectBoundsPixels(object, columnWidth, rowHeight);
  return { left, top, width, minWidth: width, height, minHeight: height };
}










export function inkObjectPlacementStyle(style: CSSProperties): CSSProperties {
  const left = typeof style.left === "number" ? style.left : Number.NaN;
  const top = typeof style.top === "number" ? style.top : Number.NaN;
  if (!Number.isFinite(left) || !Number.isFinite(top)) return style;
  const wholeLeft = Math.floor(left);
  const wholeTop = Math.floor(top);
  if (wholeLeft === left && wholeTop === top) return style;
  return { ...style, left: wholeLeft, top: wholeTop, translate: `${left - wholeLeft}px ${top - wholeTop}px` };
}

export function resizeObjectBounds(
  start: SpreadsheetObjectBounds,
  handle: SpreadsheetObjectResizeHandle,
  deltaX: number,
  deltaY: number,
  /** Width over height to hold (Lock aspect ratio / Shift), or null. */
  aspect: number | null = null,
  /** The farthest up and left the box may reach (`spreadsheetObjectBoundsFloor`). */
  floor?: { left: number; top: number },
): SpreadsheetObjectBounds {
  const minWidth = 32;
  const minHeight = 24;
  let left = start.left;
  let top = start.top;
  let right = start.left + start.width;
  let bottom = start.top + start.height;
  if (handle.includes("west")) left = Math.min(right - minWidth, left + deltaX);
  if (handle.includes("east")) right = Math.max(left + minWidth, right + deltaX);
  if (handle.includes("north")) top = Math.min(bottom - minHeight, top + deltaY);
  if (handle.includes("south")) bottom = Math.max(top + minHeight, bottom + deltaY);
  if (aspect !== null && aspect > 0) {
    // Office's rule: a corner follows the larger relative change, a side
    // handle scales the other axis to match; the fixed edge (or edges) stay.
    const horizontal = handle.includes("west") || handle.includes("east");
    const vertical = handle.includes("north") || handle.includes("south");
    const { width, height } = aspectLockedResizeSize(
      start,
      { width: right - left, height: bottom - top },
      { horizontal, vertical },
      aspect,
      { width: minWidth, height: minHeight },
    );
    if (handle.includes("west")) left = right - width;
    else right = left + width;
    if (handle.includes("north")) top = bottom - height;
    else bottom = top + height;
    if (!horizontal) {
      // A top / bottom handle grows about the centre horizontally, as Office does.
      const centre = start.left + start.width / 2;
      left = centre - width / 2;
      right = centre + width / 2;
    }
    if (!vertical) {
      const middle = start.top + start.height / 2;
      top = middle - height / 2;
      bottom = middle + height / 2;
    }
    if (floor && (left < floor.left || top < floor.top)) {
      // Stretched past the sheet's corner: the box stops there with its
      // proportions, the pinned edges (or centre) staying put.
      const maxWidth = horizontal
        ? handle.includes("west") ? right - floor.left : Number.POSITIVE_INFINITY
        : 2 * (start.left + start.width / 2 - floor.left);
      const maxHeight = vertical
        ? handle.includes("north") ? bottom - floor.top : Number.POSITIVE_INFINITY
        : 2 * (start.top + start.height / 2 - floor.top);
      const width = Math.max(0, Math.min(right - left, maxWidth, maxHeight * aspect));
      const height = width / aspect;
      if (handle.includes("west")) left = right - width;
      else if (horizontal) right = left + width;
      else {
        const centre = start.left + start.width / 2;
        left = centre - width / 2;
        right = centre + width / 2;
      }
      if (handle.includes("north")) top = bottom - height;
      else if (vertical) bottom = top + height;
      else {
        const middle = start.top + start.height / 2;
        top = middle - height / 2;
        bottom = middle + height / 2;
      }
    }
  }
  if (floor) {
    // The dragged edge stops at the sheet's corner, where the release puts
    // it: let over the headings, the box jumped back on release and lost
    // the overshoot from its size (the move's floor, dd4af09813).
    if (handle.includes("west") && left < floor.left) left = floor.left;
    if (handle.includes("north") && top < floor.top) top = floor.top;
  }
  return { left, top, width: right - left, height: bottom - top };
}

/** A resize that may have carried a handle through the pinned edge. */
interface SpreadsheetObjectResizeThroughZero {
  bounds: SpreadsheetObjectBounds;
  /** The drag crossed the pinned vertical edge: the object is mirrored on x. */
  flipX: boolean;
  /** The drag crossed the pinned horizontal edge: the object is mirrored on y. */
  flipY: boolean;
}

/**
 * {@link resizeObjectBounds}, carried through the pinned edge: Excel mirrors
 * a shape or picture when a handle is dragged past the opposite side in the
 * same gesture, the pinned edge staying put, and dragging back un-mirrors.
 * The crossed axis is solved as the mirrored problem (the opposite handle on
 * the box reflected across its pinned edge, dragged to the same place), so
 * the floor and the aspect rule are the shared ones; the caller composes the
 * reported flip with the object's own `flipH` / `flipV`.
 */
export function resizeObjectBoundsThroughZero(
  start: SpreadsheetObjectBounds,
  handle: SpreadsheetObjectResizeHandle,
  deltaX: number,
  deltaY: number,
  aspect: number | null = null,
  floor?: { left: number; top: number },
): SpreadsheetObjectResizeThroughZero {
  const west = handle.includes("west");
  const east = handle.includes("east");
  const north = handle.includes("north");
  const south = handle.includes("south");
  const signedWidth = east ? start.width + deltaX : west ? start.width - deltaX : start.width;
  const signedHeight = south ? start.height + deltaY : north ? start.height - deltaY : start.height;
  const flipX = signedWidth < 0;
  const flipY = signedHeight < 0;
  if (!flipX && !flipY) {
    return { bounds: resizeObjectBounds(start, handle, deltaX, deltaY, aspect, floor), flipX, flipY };
  }
  let { left, top } = start;
  let dx = deltaX;
  let dy = deltaY;
  let x = east ? "east" : west ? "west" : "";
  let y = north ? "north" : south ? "south" : "";
  if (flipX) {
    left = east ? start.left - start.width : start.left + start.width;
    dx = east ? deltaX + 2 * start.width : deltaX - 2 * start.width;
    x = east ? "west" : "east";
  }
  if (flipY) {
    top = south ? start.top - start.height : start.top + start.height;
    dy = south ? deltaY + 2 * start.height : deltaY - 2 * start.height;
    y = south ? "north" : "south";
  }
  const mirrored = [y, x].filter(Boolean).join("-") as SpreadsheetObjectResizeHandle;
  return { bounds: resizeObjectBounds({ ...start, left, top }, mirrored, dx, dy, aspect, floor), flipX, flipY };
}

/** Shared edge math adapted to Excel Web's eight visible picture crop handles. */
export function adjustSpreadsheetPictureCrop(
  start: CropRect,
  handle: SpreadsheetObjectResizeHandle,
  deltaX: number,
  deltaY: number,
  fractionPerPixelX: number,
  fractionPerPixelY: number,
): CropRect {
  let next = start;
  if (handle.includes("west")) {
    next = adjustCropEdge(next, "left", deltaX * fractionPerPixelX);
  } else if (handle.includes("east")) {
    next = adjustCropEdge(next, "right", deltaX * fractionPerPixelX);
  }
  if (handle.includes("north")) {
    next = adjustCropEdge(next, "top", deltaY * fractionPerPixelY);
  } else if (handle.includes("south")) {
    next = adjustCropEdge(next, "bottom", deltaY * fractionPerPixelY);
  }
  return next;
}

const SPREADSHEET_OBJECT_SNAP_THRESHOLD_PX = 6;

export function nearestGridLineAtPixels(
  absolute: number,
  header: number,
  count: number,
  resolveSize: (line: number) => number,
  axis: "row" | "column",
): number {
  const point = gridAnchorPointAtPixels(
    absolute,
    header,
    count,
    resolveSize,
    axis,
  );
  const index = axis === "row" ? point.row : point.column;
  const start =
    header +
    offsetOfLine(
      index ?? 0,
      count,
      resolveSize,
    );
  const end = start + resolveSize(index ?? 0);
  return Math.abs(absolute - start) <= Math.abs(absolute - end) ? start : end;
}

/**
 * The grid line an arrow key steps to with Snap to Grid on: the first column
 * (or row) boundary strictly past `absolute` in `direction`, or `absolute`
 * itself at the sheet's edge.
 */
export function nextGridLineAtPixels(
  absolute: number,
  header: number,
  count: number,
  resolveSize: (line: number) => number,
  direction: 1 | -1,
): number {
  let line = header;
  let previous = header;
  for (let index = 0; index <= count; index += 1) {
    if (direction > 0 && line > absolute + 0.5) return line;
    if (direction < 0 && line >= absolute - 0.5) return index === 0 ? absolute : previous;
    previous = line;
    if (index < count) line += Math.max(0, resolveSize(index));
  }
  return direction > 0 ? absolute : previous;
}

function nearestObjectSnapDelta(
  moving: readonly number[],
  targets: readonly number[],
): number {
  let best = 0;
  let distance = SPREADSHEET_OBJECT_SNAP_THRESHOLD_PX + 1;
  for (const source of moving) {
    for (const target of targets) {
      const delta = target - source;
      const candidate = Math.abs(delta);
      if (candidate < distance) {
        best = delta;
        distance = candidate;
      }
    }
  }
  return distance <= SPREADSHEET_OBJECT_SNAP_THRESHOLD_PX ? best : 0;
}

export function snapMovedObjectBounds(
  bounds: SpreadsheetObjectBounds,
  xTargets: readonly number[],
  yTargets: readonly number[],
): SpreadsheetObjectBounds {
  const xAnchors = [
    bounds.left,
    bounds.left + bounds.width / 2,
    bounds.left + bounds.width,
  ];
  const yAnchors = [
    bounds.top,
    bounds.top + bounds.height / 2,
    bounds.top + bounds.height,
  ];
  return {
    ...bounds,
    left: bounds.left + nearestObjectSnapDelta(xAnchors, xTargets),
    top: bounds.top + nearestObjectSnapDelta(yAnchors, yTargets),
  };
}
