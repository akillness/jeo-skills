"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A text box's Format Shape > Effects inside the element that draws the box
 * (`lib/presentation-text-box-effects`): the paint's SVG filter, and -- when
 * the frame is painted on its own layer -- that layer (and a Perspective
 * shadow's silhouette under it). The host applies the rest of the look
 * (`presentationTextBoxHostCss`).
 */

import type { CSSProperties, ReactNode } from "react";

import {
  LIGHTING_FILTER_LAYER,
  OfficeShapeEffectsFilterDefs,
  officeShapeEffectsLight,
} from "@mrnote/core/web/components/office-ribbon/OfficeShapeEffectsFrame.tsx";
import { officeShapeSilhouetteAlpha } from "@mrnote/core/web/lib/office-shape-effects-paint.ts";
import {
  presentationTextBoxFrameSplit,
  type PresentationTextBoxEffectsLook,
} from "../../../../lib/presentation-text-box-effects";

/** The text box's own CSS with its effects: the frame's paint moved to its layer when it has one. */
export function presentationTextBoxHostCss(
  look: PresentationTextBoxEffectsLook | null,
  frameCss: CSSProperties,
): CSSProperties {
  if (!look) return frameCss;
  return {
    ...(look.frameLayer ? presentationTextBoxFrameSplit(frameCss).host : frameCss),
    // The frame's layer sits under the words (z-index -1) inside the box; the
    // box positions it (the host makes itself a containing block).
    ...(look.frameLayer ? { isolation: "isolate" } : {}),
    ...(look.hostFilter ? { filter: look.hostFilter } : {}),
    ...(look.reflect ? { WebkitBoxReflect: look.reflect } : {}),
  } as CSSProperties;
}

export function PresentationTextBoxEffectLayers({
  look,
  filterId,
  frameCss,
  children,
}: {
  look: PresentationTextBoxEffectsLook | null;
  filterId: string;
  /** The box's `textBoxFillCss` (its frame's paint). */
  frameCss: CSSProperties;
  /** The frame's own outline (`PresentationTextBoxGeometry`), painted on the layer. */
  children?: ReactNode;
}) {
  if (!look) return <>{children}</>;
  const layer = look.frameLayer ? presentationTextBoxFrameSplit(frameCss).layer : null;
  const turned: CSSProperties = look.frameTurn
    ? { transform: look.frameTurn, transformStyle: "preserve-3d" }
    : officeShapeEffectsLight(look.paint)
      ? LIGHTING_FILTER_LAYER
      : {};
  const silhouette = layer ? look.paint.silhouette : null;
  return (
    <>
      <OfficeShapeEffectsFilterDefs paint={look.paint} filterId={filterId} />
      {layer && silhouette ? (
        // A Perspective shadow: the frame in the shadow's colour, scaled or
        // skewed under it, as a shape's silhouette is.
        <span
          aria-hidden
          data-office-shape-shadow-silhouette=""
          style={{
            ...layer,
            ...(layer.background !== undefined || layer.backgroundImage !== undefined
              ? { background: silhouette.hex, backgroundImage: "none" }
              : {}),
            ...(layer.borderColor !== undefined ? { borderColor: silhouette.hex, borderImageSource: "none" } : {}),
            ...(layer.outline !== undefined ? { outlineColor: silhouette.hex } : {}),
            boxShadow: "none",
            opacity: officeShapeSilhouetteAlpha(look.paint),
            transform: silhouette.transform || undefined,
            transformOrigin: silhouette.transformOrigin,
            filter: silhouette.filter || undefined,
          }}
        />
      ) : null}
      {layer ? (
        <span
          aria-hidden
          data-testid="presentation-textbox-effects-frame"
          style={{ ...layer, ...turned, ...(look.frameFilter ? { filter: look.frameFilter } : {}) }}
        >
          {children}
        </span>
      ) : (
        children
      )}
    </>
  );
}
