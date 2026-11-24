/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import { OfficePictureStyleGraphic } from "@mrnote/core/web/components/office-ribbon/OfficePictureStyleGraphic.tsx";
import type { OfficePictureStyleId } from "@mrnote/core/web/lib/office-picture-styles/catalog.ts";
import type { OfficePictureStyleOutline } from "@mrnote/core/web/lib/office-picture-styles/native.ts";

import { officePictureGeometryPath } from "@mrnote/core/web/lib/office-picture-geometry.ts";

import type { DocumentImageCropInsets } from "./documentImageCrop";
import type { DocumentPictureGeometry } from "@mrnote/core/web/components/console/editor/native-document/imageControls.ts";

export interface DocumentPictureStyleLayerState {
  readonly styleId: OfficePictureStyleId | null;
  readonly src: string;
  /** The picture's frame (its visible, cropped size) in CSS pixels. */
  readonly widthPx: number;
  readonly heightPx: number;
  readonly crop: DocumentImageCropInsets;
  readonly photoFilter: string;
  readonly photoOpacity: number;
  readonly alt: string;
  /** A Picture Border set over the style (replaces only its outline). */
  readonly outline: OfficePictureStyleOutline | null;
  /** Crop to Shape over the style: the shape drawn instead of the style's. */
  readonly geometry?: DocumentPictureGeometry | null;
}

/**
 * Draws an Office picture style over a Docs image with the same renderer the
 * gallery thumbnails, slides and worksheets use. The `<img>` keeps owning
 * layout, loading and selection; while a style is shown the raster is hidden
 * (CSS on `[data-picture-style]`) and this layer paints the styled picture
 * over its frame, the visible (cropped) picture.
 */
export function createDocumentPictureStyleLayer(
  wrapper: HTMLElement,
  before: Node | null,
) {
  const layer = document.createElement("span");
  layer.className = "note-editor-picture-style-layer";
  layer.contentEditable = "false";
  layer.setAttribute("aria-hidden", "true");
  layer.dataset.testid = "document-picture-style-layer";
  layer.hidden = true;
  wrapper.insertBefore(layer, before);
  let root: Root | null = null;
  let last = "";

  const sync = (state: DocumentPictureStyleLayerState) => {
    if (!state.styleId || !state.src) {
      wrapper.removeAttribute("data-picture-style");
      layer.hidden = true;
      if (last) {
        root?.render(null);
        last = "";
      }
      return;
    }
    wrapper.setAttribute("data-picture-style", state.styleId);
    layer.hidden = false;
    // While the style is shown the raster `<img>` is hidden (visibility),
    // which also takes it out of the accessibility tree: this layer is the
    // picture then, under the same alternative text, and what it draws
    
    // is decorative, as its `<img alt="">` is.
    const alt = typeof state.alt === "string" ? state.alt.trim() : "";
    if (alt) {
      layer.setAttribute("role", "img");
      layer.setAttribute("aria-label", alt);
      layer.removeAttribute("aria-hidden");
    } else {
      layer.removeAttribute("role");
      layer.removeAttribute("aria-label");
      layer.setAttribute("aria-hidden", "true");
    }
    // The frame is the picture: the style draws over all of it, and the
    // kept source region (Word's srcRect) is scaled to fill it.
    const { crop } = state;
    layer.style.top = "0";
    layer.style.right = "0";
    layer.style.bottom = "0";
    layer.style.left = "0";
    const visibleW = Math.max(0.01, (100 - crop.left - crop.right) / 100);
    const visibleH = Math.max(0.01, (100 - crop.top - crop.bottom) / 100);
    const key = JSON.stringify(state);
    if (key === last) return;
    last = key;
    root ??= createRoot(layer);
    root.render(
      createElement(OfficePictureStyleGraphic, {
        styleId: state.styleId,
        src: state.src,
        widthPx: Math.max(1, state.widthPx),
        heightPx: Math.max(1, state.heightPx),
        cropRect: {
          x: crop.left / 100,
          y: crop.top / 100,
          w: visibleW,
          h: visibleH,
        },
        photoFilter: state.photoFilter || undefined,
        photoOpacity: state.photoOpacity,
        alt: state.alt,
        outline: state.outline,
        geometryPath: state.geometry
          ? officePictureGeometryPath(
              state.geometry.preset,
              state.geometry.adjustments,
              Math.max(1, state.widthPx),
              Math.max(1, state.heightPx),
            )
          : null,
        decorative: true,
        fillParent: true,
        testId: "document-picture-style-graphic",
        imageTestId: "document-picture-style-image",
      }),
    );
  };

  const destroy = () => {
    const current = root;
    root = null;
    // Unmount after the current ProseMirror/React work settles.
    if (current) queueMicrotask(() => current.unmount());
  };

  return { layer, sync, destroy };
}
