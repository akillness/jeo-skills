"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { ReactNode } from "react";

import { OfficePictureEffectsFrame } from "@mrnote/core/web/components/office-ribbon/OfficePictureEffectsFrame.tsx";
import { POWERPOINT_SHADOW_BLUR_DEVIATION } from "@mrnote/core/web/lib/office-shadow-effects.ts";

const EMU_PER_PX = 9525;

/**
 * Picture Format > Picture Effects on a slide picture (and a graphic's or a
 * video's same effects) (Shadow, Glow, Reflection, Soft Edges, Bevel, 3-D
 * Format, 3-D Rotation, `lib/office-picture-effects`): the editors' shared
 * picture effects frame (OfficePictureEffectsFrame) around the picture's
 * drawing, so the picture, its crop, its style and its adjustments draw as
 * they always did inside it. A picture without effects is returned as it is.
 */
export function PresentationPictureEffectsFrame({
  block,
  fillParent,
  children,
}: {
  block: { readonly pictureEffects?: unknown; readonly width?: number; readonly height?: number };
  fillParent?: boolean;
  children: ReactNode;
}) {
  return (
    <OfficePictureEffectsFrame
      effects={block.pictureEffects}
      size={{
        width: Math.max(1, (Number(block.width) || 0) / EMU_PER_PX),
        height: Math.max(1, (Number(block.height) || 0) / EMU_PER_PX),
      }}
      fillParent={fillParent}
      testId="presentation-picture-effects"
      shadowTestIds={{ under: "presentation-picture-shadow-under", over: "presentation-picture-shadow-over" }}
      shadowBlurDeviation={POWERPOINT_SHADOW_BLUR_DEVIATION}
      // Scaled about its alignment point even when evenly (probe lf13-shscale).
      evenScaleShadowUnder
    >
      {children}
    </OfficePictureEffectsFrame>
  );
}
