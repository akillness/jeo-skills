"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { PresentationImageBlock } from "../../../console/editor/native-document/documentCommands";
import { OfficePictureStyleGallery } from "../../../office-ribbon/OfficePictureStyleGallery";
import { isOfficePictureStyleId } from "../../../../lib/office-picture-styles/catalog";
import {
  PRESENTATION_WEB_PICTURE_STYLE_CATALOG,
  type PresentationWebPictureStyleId,
} from "../../../../lib/presentation-picture-style-catalog";
import {
  applyNativePictureStyle,
  canApplyNativePictureStyle,
} from "../../../../lib/presentation-picture-style-native";
import styles from "./PresentationPictureStyleGallery.module.css";

export type PresentationPictureFrameStyle = Readonly<{
  id: PresentationWebPictureStyleId;
  zh: string;
  en: string;
}>;
export interface PresentationPictureStyleGalleryLabels {
  readonly ariaLabel: string;
  readonly more: string;
  /** Unused: the shared gallery names each style from the catalogue. */
  readonly style?: (
    style: PresentationPictureFrameStyle,
    index: number,
  ) => string;
}
export interface PresentationPictureStyleGalleryProps {
  readonly image: PresentationImageBlock;
  readonly accentColors: readonly string[];
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly labels: PresentationPictureStyleGalleryLabels;
  readonly onPreviewChange: (
    style: PresentationPictureFrameStyle | null,
  ) => void;
  readonly onCommit: (style: PresentationPictureFrameStyle) => void;
}
export function presentationPictureFrameStyles(
  _accentColors: readonly string[],
): readonly PresentationPictureFrameStyle[] {
  void _accentColors;
  return PRESENTATION_WEB_PICTURE_STYLE_CATALOG;
}
export function pictureFrameStyleMatches(
  block: PresentationImageBlock,
  style: PresentationPictureFrameStyle,
): boolean {
  return block.pictureStylePreset === style.id;
}
export function applyPresentationPictureFrameStyle(
  block: PresentationImageBlock,
  style: PresentationPictureFrameStyle,
): PresentationImageBlock {
  return applyNativePictureStyle(block, style.id);
}

const styleById = new Map(
  PRESENTATION_WEB_PICTURE_STYLE_CATALOG.map((style) => [style.id, style]),
);

/** The slide's Picture Styles: Office's shared gallery over a slide picture. */
export function PresentationPictureStyleGallery({
  image,
  disabled = false,
  disabledReason,
  labels,
  onPreviewChange,
  onCommit,
}: PresentationPictureStyleGalleryProps) {
  const unavailable = disabled || !canApplyNativePictureStyle(image);
  return (
    <OfficePictureStyleGallery
      application="presentation"
      className={styles.gallery}
      disabled={unavailable}
      disabledReason={disabledReason}
      labels={{
        ariaLabel: labels.ariaLabel,
        more: labels.more,
      }}
      // Six whole slots: the strip the desktop Adjust group leaves (PPT-A125)
      // holds six 58px tiles exactly. Without this the shared gallery falls
      // back to min(7, quick count) and writes it inline, and a clipped tile
      // showed at the strip's edge.
      visibleItemCount={6}
      value={
        isOfficePictureStyleId(image.pictureStylePreset)
          ? image.pictureStylePreset
          : null
      }
      onCommit={(id) => {
        const style = styleById.get(id);
        if (!unavailable && style) onCommit(style);
      }}
      onPreviewChange={(id) =>
        onPreviewChange(id ? (styleById.get(id) ?? null) : null)
      }
      testIdPrefix="presentation-picture-style-gallery"
    />
  );
}
