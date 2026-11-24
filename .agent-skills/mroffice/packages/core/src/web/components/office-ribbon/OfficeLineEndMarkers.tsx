"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  nativeLineEndPath,
  nativeLineEndPlacements,
  readNativeLineEnd,
  type NativeLineEnd,
} from "../../lib/native-drawing-geometry";
import type {
  PresentationConnectorEnd,
  PresentationConnectorEndSize,
} from "../../lib/presentation-shapes";

/** The smallest base an end is sized from: 0.7 mm (PresentationNativeShapeGraphic). */
const LINE_END_MIN_BASE_PX = (0.7 / 25.4) * 96;

/** The six `a:ln` end fields as any Office host canvas carries them. */
export interface OfficeLineEndFields {
  readonly headEnd?: PresentationConnectorEnd;
  readonly tailEnd?: PresentationConnectorEnd;
  readonly headEndWidth?: PresentationConnectorEndSize;
  readonly headEndLength?: PresentationConnectorEndSize;
  readonly tailEndWidth?: PresentationConnectorEndSize;
  readonly tailEndLength?: PresentationConnectorEndSize;
}

/**
 * One end's drawable decoration, through the SHARED native primitive — so a
 * document, a sheet and a slide put the same arrowhead on the same outline.
 * `none` and an absent type alike return null: there is nothing to draw.
 */
export function officeLineEnd(
  fields: OfficeLineEndFields,
  side: "head" | "tail",
): NativeLineEnd | null {
  const type = side === "head" ? fields.headEnd : fields.tailEnd;
  const w = side === "head" ? fields.headEndWidth : fields.tailEndWidth;
  const len = side === "head" ? fields.headEndLength : fields.tailEndLength;
  if (!type) return null;
  return readNativeLineEnd({
    type,
    ...(w ? { w } : {}),
    ...(len ? { len } : {}),
  });
}

/**
 * Marker definitions for a canvas that samples the shape in a 0..100 box.
 *
 * A DrawingML end is sized in MULTIPLES of the line weight
 * (`a:ST_LineEndWidth` / `a:ST_LineEndLength`), but a preview box is stretched
 * to the shape's real pixels, so the marker stays in user space and takes the
 * same 10-unit `med` box the single triangle has always had.
 */
export function OfficeLineEndMarkers({
  id,
  head,
  tail,
  stroke,
  lineWeight,
}: {
  readonly id: string;
  readonly head: NativeLineEnd | null;
  readonly tail: NativeLineEnd | null;
  readonly stroke: string;
  /** A drawing at its real size: the ends in multiples of the line's weight
   * (px, never under 0.7 mm, as a slide's native shape draws them), in a
   * view whose units are `unitsPerPx` of a pixel. Without it, the preview's
   * fixed 10-unit `med` box. */
  readonly lineWeight?: { readonly px: number; readonly unitsPerPx: number };
}) {
  if (!head && !tail) return null;
  return (
    <defs>
      {([
        ["head", head],
        ["tail", tail],
      ] as const).map(([side, end]) =>
        end ? (
          <marker
            key={side}
            id={`${id}-${side}`}
            viewBox="0 0 6 6"
            markerWidth={lineWeight ? end.length * Math.max(lineWeight.px, LINE_END_MIN_BASE_PX) * lineWeight.unitsPerPx : (end.length * 10) / 3}
            markerHeight={lineWeight ? end.width * Math.max(lineWeight.px, LINE_END_MIN_BASE_PX) * lineWeight.unitsPerPx : (end.width * 10) / 3}
            refX="6"
            refY="3"
            orient="auto-start-reverse"
            markerUnits="userSpaceOnUse"
          >
            <path
              d={nativeLineEndPath(end.type)}
              fill={end.type === "arrow" || stroke === "none" ? "none" : stroke}
              stroke={end.type === "arrow" && stroke !== "none" ? stroke : "none"}
              strokeWidth={0.75}
            />
          </marker>
        ) : null,
      )}
    </defs>
  );
}

/**
 * The invisible carriers that put those markers where Office draws them.
 *
 * SVG places `marker-start` / `marker-end` on the first and last vertex of a
 * WHOLE path, which on a rectangle is one corner (Office draws none there) and
 * on a `bracketPair` is two tips of four. `nativeLineEndPlacements` is the
 * measured rule (SHAPE-IMPORT-AUDIT.md §7.10); these paths paint nothing
 * themselves, so a shape's own strokes and fills are untouched.
 */
export function OfficeLineEndCarriers({
  id,
  paths,
  head,
  tail,
  strokeWidth,
}: {
  readonly id: string;
  readonly paths: readonly { readonly d: string; readonly stroke?: boolean }[];
  readonly head: NativeLineEnd | null;
  readonly tail: NativeLineEnd | null;
  readonly strokeWidth?: number;
}) {
  if (!head && !tail) return null;
  return (
    <>
      {nativeLineEndPlacements(paths).map((placement, index) => (
        <path
          key={`office-line-end-${index}`}
          d={placement.d}
          fill="none"
          stroke="none"
          strokeWidth={strokeWidth}
          markerStart={head && placement.head ? `url(#${id}-head)` : undefined}
          markerEnd={tail && placement.tail ? `url(#${id}-tail)` : undefined}
          vectorEffect="non-scaling-stroke"
          data-office-line-end-carrier="true"
        />
      ))}
    </>
  );
}
