"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The SmartArt bevel, as PowerPoint lights it — ONE component, shared by every
 * surface that paints a SmartArt node (the slide canvas, the sheet canvas, the
 * ribbon's style tiles, and the static SVG the seed previews and export
 * preview use), so a node cannot look different from a picture of it. The
 * Docs canvas builds the same primitives into its own DOM.
 *
 * The bevel is LIGHT on the shape's own edge — its silhouette blurred into a
 * height field and lit (see {@link smartArtBevelLight}) — so it always stays
 * inside the silhouette, whatever the geometry, and the flat face keeps its
 * colour exactly.
 */

import { createElement, type ReactNode } from "react";

import {
  smartArtBevelLight,
  smartArtBevelLightPrimitives,
  smartArtFaceTintPrimitives,
  smartArtLightRigMatrix,
  smartArtMaterialOpacity,
  smartArtMaterialOpacityAfterBevel,
  smartArtMaterialOpacityPrimitives,
  type SmartArtFaceSpan,
  type SmartArtFilterPrimitive,
} from "../../lib/office-smartart/canvas-3d";
import type {
  SmartArtScene3d,
  SmartArtShape3d,
} from "../../lib/office-smartart/styles-model";

/** The `filter` value that references one of these, for a host's inline style. */
export function officeSmartArtBevelFilterRef(id: string): string {
  return `url(#${id})`;
}






export function officeSmartArtNeedsShapeFilter(
  shape3d: SmartArtShape3d | undefined,
  scene3d?: SmartArtScene3d,
): boolean {
  return Boolean(
    (shape3d && smartArtBevelLight(shape3d)) ||
      smartArtLightRigMatrix(scene3d, shape3d) ||
      smartArtMaterialOpacity(shape3d) !== null,
  );
}

/** SVG attribute names → the React prop names they render from. */
const REACT_PROP: Readonly<Record<string, string>> = {
  "lighting-color": "lightingColor",
  "flood-color": "floodColor",
};

function renderPrimitive(primitive: SmartArtFilterPrimitive, key: number): ReactNode {
  const props: Record<string, string | number> = { key };
  for (const [name, value] of Object.entries(primitive.attrs)) {
    props[REACT_PROP[name] ?? name] = value;
  }
  return createElement(
    primitive.tag,
    props,
    ...(primitive.children ?? []).map((child, index) => renderPrimitive(child, index)),
  );
}

/** A member's geometry as an opaque picture, for {@link OfficeSmartArtBevelFilter}'s `silhouette`. */
export type OfficeSmartArtSilhouette = { readonly href: string; readonly width: number; readonly height: number };

/**
 * The filled paths of a member's geometry, drawn opaque over the member's box
 * (`width` x `height`, the filter's user space), or null when none is filled.
 * The path data is the validated `drawingml-paths-v1` grammar (commands and
 * numbers only), so it goes into the picture's markup as it is.
 */
export function officeSmartArtGeometrySilhouette(
  paths: readonly { readonly d: string; readonly fill: string }[],
  viewBox: readonly [number, number] | undefined,
  width: number,
  height: number,
): OfficeSmartArtSilhouette | null {
  const filled = paths.filter((path) => path.fill !== "none" && /^[MLQCAZ0-9eE.,\s+-]+$/.test(path.d));
  if (!filled.length || !(width > 0) || !(height > 0)) return null;
  const [viewWidth, viewHeight] = viewBox ?? [100, 100];
  const markup =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewWidth} ${viewHeight}" preserveAspectRatio="none">` +
    filled.map((path) => `<path d="${path.d}" fill="#000"/>`).join("") +
    "</svg>";
  return { href: `data:image/svg+xml,${encodeURIComponent(markup)}`, width, height };
}

export function OfficeSmartArtBevelFilter({
  id,
  shape3d,
  scene3d,
  faceSpan,
  silhouette,
  outline,
}: {
  id: string;
  shape3d: SmartArtShape3d;
   
  scene3d?: SmartArtScene3d;
  /** Where the member stands in its diagram (metal's light is the diagram's). */
  faceSpan?: SmartArtFaceSpan | null;
  







  silhouette?: OfficeSmartArtSilhouette | null;
  /** The member's outline where it stands unturned (`smartArtBevelOutline`): a box takes a bevel read side by side. */
  outline?: string | null;
}) {
  const light = smartArtBevelLight(shape3d, outline);
  const tint = smartArtFaceTintPrimitives(scene3d, shape3d, faceSpan);
  if (!light && !tint.length && smartArtMaterialOpacity(shape3d) === null) return null;
  
  // it; the bevel's light then works on the colour the face really shows.
  const source = tint.length ? "tinted" : "SourceGraphic";
  // The geometry over the painted alpha: a stroke outside the path is still
  // part of what the rim is raised from.
  const shape: SmartArtFilterPrimitive[] = light && silhouette
    ? [
        {
          tag: "feImage",
          attrs: {
            href: silhouette.href,
            x: 0,
            y: 0,
            width: silhouette.width,
            height: silhouette.height,
            preserveAspectRatio: "none",
            result: "faceGeometry",
          },
        },
        {
          tag: "feComposite",
          attrs: { in: "faceGeometry", in2: "SourceAlpha", operator: "over", result: "faceGeometryAlpha" },
        },
      ]
    : [];
  const lit: SmartArtFilterPrimitive[] = [
    ...tint,
    ...shape,
    ...(light
      ? smartArtBevelLightPrimitives(light, source, shape.length ? "faceGeometryAlpha" : "SourceAlpha", smartArtMaterialOpacity(shape3d))
      : []),
  ];
  // Powder's own opacity (`smartArtMaterialOpacity`): under a bevel read side
  // by side, over any other.
  const last = lit.length ? String(lit[lit.length - 1]!.attrs.result ?? "SourceGraphic") : "SourceGraphic";
  const primitives: SmartArtFilterPrimitive[] = [
    ...lit,
    ...(smartArtMaterialOpacityAfterBevel(light) ? smartArtMaterialOpacityPrimitives(shape3d, last) : []),
  ];
  return (
    <filter
      id={id}
      // The bevel is entirely inside the shape, so the filter region only has
      // to cover the source; the small margin keeps a stroked edge whole.
      x="-10%"
      y="-10%"
      width="120%"
      height="120%"
      filterUnits="objectBoundingBox"
      primitiveUnits="userSpaceOnUse"
      // The measurements are sRGB, and a filter works in linearRGB unless
      // told otherwise.
      colorInterpolationFilters="sRGB"
      data-testid="office-smartart-bevel-filter"
    >
      {primitives.map((primitive, index) => renderPrimitive(primitive, index))}
    </filter>
  );
}
