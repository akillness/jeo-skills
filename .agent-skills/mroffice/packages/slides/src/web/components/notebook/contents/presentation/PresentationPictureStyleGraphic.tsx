"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { CSSProperties } from "react";
import type { PresentationImageBlock } from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import { OfficePictureStyleGraphic } from "@mrnote/core/web/components/office-ribbon/OfficePictureStyleGraphic.tsx";
import {
  normalizeSignedCropRect,
  type CropRect,
} from "@mrnote/core/web/lib/presentation-crop-group.ts";
import {
  resolveImageEffects,
  imageEffectsCss,
} from "@mrnote/core/web/lib/presentation-image-effects.ts";
import { officeArtisticEffectCss } from "@mrnote/core/web/lib/office-artistic-effects.ts";
import { normalizeOfficePictureEffects } from "@mrnote/core/web/lib/office-picture-effects.ts";
import { presentationPictureStyleOutline } from "@mrnote/core/web/lib/presentation-picture-style-native.ts";
import { presentationPictureOrientationCss } from "../../../../lib/presentation-picture-orientation";

/**
 * The slide's adapter onto the shared Office picture-style drawing: the stage,
 * slide thumbnails and presentation view read an image block's size, crop and
 * picture corrections into the one renderer every editor uses.
 */
export function PresentationPictureStyleGraphic({
  block,
  imgStyle,
  cropOverride,
  fillParent = false,
  preview = false,
}: {
  block: PresentationImageBlock;
  imgStyle?: CSSProperties;
  cropOverride?: CropRect | null;
  fillParent?: boolean;
  preview?: boolean;
}) {
  const fx = resolveImageEffects(block),
    photoCss = imageEffectsCss(fx);
  // The artistic effect is drawn first and the colour adjustments after it,
  // as on a picture without a style; a picture style's frame never removes it
  // (PPT-B046: a Simple Frame dropped the Blur while the menu still showed it).
  const artisticFilter = officeArtisticEffectCss(
    block.artisticEffect,
    block.artisticEffectRendered === true,
  );
  const photoFilter =
    [artisticFilter, photoCss.filter].filter(Boolean).join(" ") || undefined;
  // An effect the picture names replaces the style's own: "No Reflection"
  // removes it, a picked variation is drawn by the picture's effects frame.
  const omitEffects = new Set(
    Object.keys(normalizeOfficePictureEffects(block.pictureEffects) ?? {}),
  );
  return (
    <OfficePictureStyleGraphic
      styleId={block.pictureStylePreset}
      src={block.src}
      widthPx={(Number(block.width) || 0) / 9525}
      heightPx={(Number(block.height) || 0) / 9525}
      cropRect={normalizeSignedCropRect(cropOverride ?? block.cropRect)}
      photoFilter={photoFilter}
      photoOpacity={fx.opacity / 100}
      mixBlendMode={photoCss.mixBlendMode}
      alt={block.alt}
      decorative={block.decorative === true}
      // The photo is an SVG image inside this wrapper; the orientation
      // reading is inherited by it.
      imgStyle={{ ...presentationPictureOrientationCss(block), ...imgStyle }}
      fillParent={fillParent}
      preview={preview}
      omitEffects={omitEffects.size ? omitEffects : undefined}
      outline={presentationPictureStyleOutline(block)}
      
      // Compound Frame, Black; `lib/office-picture-line`).
      lineOutside
      testId="presentation-native-picture-style"
      imageTestId="presentation-image-el"
    />
  );
}
