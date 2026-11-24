"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A picture's Office effects (`pictureEffects`, lib/office-picture-effects)
 * around whatever draws the picture -- its crop, style and adjustments draw
 * as they always did inside it. Every editor's picture wears this frame (the
 * deck's pictures, graphics and videos, the worksheet's pictures), so a
 * picture's effects look the same wherever it is.
 *
 * Glow, reflection, shadow and the 3-D Rotation camera are the CSS of
 * `officePictureEffectsCss` on the frame, its soft edges a mask on a layer
 * inside it (so the reflection shows, softened); a 3-D Format (bevel, depth, contour,
 * material, lighting) is the shapes' SVG filter on the picture's own alpha
 * (`officePictureThreeDPaint`), as Office lights a bevelled or extruded
 * picture with the same DrawingML 3-D a shape wears.
 */

import { createElement, useId, type CSSProperties, type ReactNode } from "react";

import { officePictureEffectsCss } from "../../lib/office-picture-effects";
import {
  officePictureThreeDPaint,
  officeShapeEffectsFilterRegion,
  type OfficeShapeEffectPrimitive,
} from "../../lib/office-shape-effects-paint";

import { LIGHTING_FILTER_LAYER } from "./OfficeShapeEffectsFrame";

const camel = (name: string) => name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());

function renderPrimitive(primitive: OfficeShapeEffectPrimitive, key: number): ReactNode {
  const props: Record<string, string | number> = { key };
  for (const [name, value] of Object.entries(primitive.attrs)) props[camel(name)] = value;
  return createElement(
    primitive.tag,
    props,
    ...(primitive.children ?? []).map((child, index) => renderPrimitive(child, index)),
  );
}

export function OfficePictureEffectsFrame({
  effects,
  size,
  fillParent,
  testId,
  shadowTestIds,
  shadowBlurDeviation,
  evenScaleShadowUnder,
  children,
}: {
  effects: unknown;
  /** The picture's frame in CSS px. */
  size: { readonly width: number; readonly height: number };
  fillParent?: boolean;
  testId: string;
  /** The perspective / inner shadow layers' test ids (absent: `<testId>-shadow-under` / `-over`). */
  shadowTestIds?: { readonly under: string; readonly over: string };
  /** The Gaussian deviation an outer shadow's blur radius draws, per unit of it (a slide's picture: `POWERPOINT_SHADOW_BLUR_DEVIATION`). */
  shadowBlurDeviation?: number;
  /** An evenly scaled outer shadow is scaled about its alignment point (a slide's picture, as PowerPoint draws it). */
  evenScaleShadowUnder?: boolean;
  children: ReactNode;
}) {
  const filterId = `office-picture-3d-${useId().replace(/:/g, "")}`;
  const css = officePictureEffectsCss(effects, size, {
    ...(shadowBlurDeviation === undefined ? {} : { shadowBlurDeviation }),
    ...(evenScaleShadowUnder ? { evenScaleShadowUnder: true } : {}),
  });
  const threeD = officePictureThreeDPaint(effects, size);
  if (!css && !threeD) return <>{children}</>;
  const block: CSSProperties = fillParent ? { display: "block", width: "100%", height: "100%" } : { display: "inline-block" };
  const layers = (
    <>
      {css?.shadowUnder ? (
        <span aria-hidden="true" data-testid={shadowTestIds?.under ?? `${testId}-shadow-under`} style={css.shadowUnder} />
      ) : null}
      {threeD ? (
        <>
          <svg width="0" height="0" aria-hidden focusable="false" style={{ position: "absolute", overflow: "hidden" }}>
            <defs>
              <filter
                id={filterId}
                {...officeShapeEffectsFilterRegion(threeD)}
                colorInterpolationFilters="sRGB"
                data-testid={`${testId}-three-d-filter`}
              >
                {threeD.primitives.map((primitive, index) => renderPrimitive(primitive, index))}
              </filter>
            </defs>
          </svg>
          <span
            data-office-picture-three-d=""
            style={{ position: "relative", ...block, filter: `url(#${filterId})`, ...LIGHTING_FILTER_LAYER }}
          >
            {children}
          </span>
        </>
      ) : (
        children
      )}
      {/* The 3-D filter draws the bevel on the picture's alpha; the CSS rims
          only stand in for a Preset's own bevel. */}
      {css?.bevel && !threeD ? <span aria-hidden="true" style={css.bevel} /> : null}
      {css?.shadowOver ? (
        <span aria-hidden="true" data-testid={shadowTestIds?.over ?? `${testId}-shadow-over`} style={css.shadowOver} />
      ) : null}
    </>
  );
  return (
    <span
      data-testid={testId}
      data-office-picture-effects=""
      style={{
        position: "relative",
        ...block,
        ...(css?.wrapper ?? {}),
      }}
    >
      {/* Soft Edges mask the layer that draws the picture, inside the
          wrapper: the wrapper's reflection and glow mirror and halo the
          softened picture instead of being masked away with it. */}
      {css?.softEdge ? (
        <span
          data-office-picture-soft-edge=""
          style={{ position: "relative", ...block, ...(fillParent ? {} : { verticalAlign: "top" }), ...css.softEdge }}
        >
          {layers}
        </span>
      ) : (
        layers
      )}
    </span>
  );
}
