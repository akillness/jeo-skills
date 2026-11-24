/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  DEFAULT_INK_COLOR,
  PDF_INK_MAX_WIDTH,
  PDF_INK_MIN_WIDTH,
  isInkColor,
  PDF_HIGHLIGHTER_OPACITY,
  type InkPoint,
} from "@mrnote/core/web/lib/pdf/ink.ts";
import type { FlattenImage, FlattenPageSize } from "@mrnote/core/web/lib/pdf/flatten.ts";
import type { PageRecord } from "./pageRecord";

export interface NativePdfInkStrokeLike {
  id?: string;
  page: number;
  color?: string;
  width?: number;
  points: ReadonlyArray<number>;
  /** "highlighter" renders/exports translucent; absent/other = opaque pen. */
  penType?: string;
}

/** Stroke opacity for a native stroke's pen type (undefined = opaque pen). */
export function nativeInkStrokeOpacity(
  stroke: Pick<NativePdfInkStrokeLike, "penType">,
): number | undefined {
  return stroke.penType === "highlighter" ? PDF_HIGHLIGHTER_OPACITY : undefined;
}

export interface NativePdfImageOverlayLike {
  id?: string;
  page: number;
  dataItemId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function nativeInkPathD(points: ReadonlyArray<number> | undefined): string {
  if (!Array.isArray(points) || points.length < 4) return "";
  const commands: string[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = Math.min(100, Math.max(0, Number(points[i]) * 100));
    const y = Math.min(100, Math.max(0, Number(points[i + 1]) * 100));
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    commands.push(`${commands.length === 0 ? "M" : "L"}${x},${y}`);
  }
  return commands.length >= 2 ? commands.join(" ") : "";
}

export function nativeInkWidthToPercent(
  width: unknown,
  pageSize: Pick<PageRecord, "width" | "height"> | undefined,
): number {
  const numeric =
    typeof width === "number" && Number.isFinite(width) ? width : 2;
  const basis = Math.max(pageSize?.width ?? 0, pageSize?.height ?? 0, 1);
  const percent = (numeric / basis) * 100;
  return Math.min(PDF_INK_MAX_WIDTH, Math.max(PDF_INK_MIN_WIDTH, percent));
}

export function nativeInkToFlattenInk(
  stroke: NativePdfInkStrokeLike,
  pageSizes: ReadonlyArray<FlattenPageSize>,
): {
  page: number;
  color: string;
  width: number;
  points: InkPoint[];
  opacity?: number;
} | null {
  const pageNumber = Number(stroke.page) + 1;
  if (!Number.isInteger(pageNumber) || pageNumber < 1) return null;
  const pageSize = pageSizes[pageNumber - 1];
  if (!pageSize) return null;
  const points: InkPoint[] = [];
  for (let i = 0; i + 1 < stroke.points.length; i += 2) {
    const x = Math.min(100, Math.max(0, Number(stroke.points[i]) * 100));
    const y = Math.min(100, Math.max(0, Number(stroke.points[i + 1]) * 100));
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    points.push({ x, y });
  }
  if (points.length < 2) return null;
  return {
    page: pageNumber,
    color: isInkColor(stroke.color) ? stroke.color : DEFAULT_INK_COLOR,
    width: nativeInkWidthToPercent(stroke.width, pageSize),
    points,
    // Highlighter strokes bake translucent (per-stroke opacity in the
    // flatten planner); pens omit the field and stay opaque.
    opacity: nativeInkStrokeOpacity(stroke),
  };
}

export function groupNativeInkStrokesByPage<T extends NativePdfInkStrokeLike>(
  strokes: ReadonlyArray<T> | undefined,
): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const stroke of strokes ?? []) {
    const pageNumber = Number(stroke.page) + 1;
    if (!Number.isInteger(pageNumber) || pageNumber < 1) continue;
    const list = map.get(pageNumber) ?? [];
    list.push(stroke);
    map.set(pageNumber, list);
  }
  return map;
}

export function nativeImageOverlayToFlattenImage(
  overlay: NativePdfImageOverlayLike,
  pageSizes: ReadonlyArray<FlattenPageSize>,
): FlattenImage | null {
  const pageNumber = Number(overlay.page) + 1;
  if (!Number.isInteger(pageNumber) || pageNumber < 1) return null;
  if (!pageSizes[pageNumber - 1]) return null;
  if (
    typeof overlay.dataItemId !== "string" ||
    overlay.dataItemId.trim() === ""
  ) {
    return null;
  }
  const x = Math.min(100, Math.max(0, Number(overlay.x) * 100));
  const y = Math.min(100, Math.max(0, Number(overlay.y) * 100));
  const width = Math.min(100, Math.max(0, Number(overlay.width) * 100));
  const height = Math.min(100, Math.max(0, Number(overlay.height) * 100));
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  return {
    page: pageNumber,
    dataItemId: overlay.dataItemId,
    x,
    y,
    width,
    height,
  };
}

export function groupNativeImageOverlaysByPage(
  overlays: ReadonlyArray<NativePdfImageOverlayLike> | undefined,
): Map<number, NativePdfImageOverlayLike[]> {
  const map = new Map<number, NativePdfImageOverlayLike[]>();
  for (const overlay of overlays ?? []) {
    const pageNumber = Number(overlay.page) + 1;
    if (!Number.isInteger(pageNumber) || pageNumber < 1) continue;
    const list = map.get(pageNumber) ?? [];
    list.push(overlay);
    map.set(pageNumber, list);
  }
  return map;
}
