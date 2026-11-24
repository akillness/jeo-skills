/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The picture in a filled SmartArt picture slot of a Docs graphic, drawn with
 * its Picture Format (`lib/office-smartart/slot-picture-format`): Crop as the
 * fill's source rectangle stretched over the slot, and a Picture Style drawn
 * by the same shared renderer an ordinary Docs picture's style uses
 * (`OfficePictureStyleGraphic`, through a React root the caller disposes).
 *
 * No format: the picture covers the slot, which is how Office shows a picture
 * put into a slot (its Fill).
 */
import { createElement } from "react";
import { createRoot } from "react-dom/client";

import { OfficePictureStyleGraphic } from "../../../office-ribbon/OfficePictureStyleGraphic";
import {
  smartArtSlotPictureBox,
  type SmartArtSlotPictureFormat,
} from "../../../../lib/office-smartart/slot-picture-format";

/**
 * Append the slot's picture to `host` (the member's box); returns the
 * disposer for a styled picture's React root, or `null` when there is none.
 */
export function appendDocumentSmartArtSlotPicture(
  host: HTMLElement,
  picture: {
    readonly src: string;
    readonly format: SmartArtSlotPictureFormat;
    /** The slot's preset: an oval slot keeps its picture oval. */
    readonly preset: string;
    readonly widthPx: number;
    readonly heightPx: number;
  },
): (() => void) | null {
  const clip = document.createElement("span");
  clip.dataset.documentSmartArtSlotPicture = picture.format.style
    ? "styled"
    : picture.format.crop
      ? "cropped"
      : "filled";
  Object.assign(clip.style, {
    position: "absolute",
    inset: "0",
    pointerEvents: "none",
    // A Picture Style draws its frame, shadow and reflection outside the
    // slot; only an unstyled picture is clipped to the slot.
    overflow: picture.format.style ? "visible" : "hidden",
    borderRadius: picture.preset === "ellipse" && !picture.format.style ? "50%" : "",
  });
  host.append(clip);
  if (picture.format.style) {
    const root = createRoot(clip);
    root.render(
      createElement(OfficePictureStyleGraphic, {
        styleId: picture.format.style,
        src: picture.src,
        widthPx: Math.max(1, picture.widthPx),
        heightPx: Math.max(1, picture.heightPx),
        cropRect: picture.format.crop ?? null,
        decorative: true,
        fillParent: true,
        testId: "document-smartart-slot-picture-style",
        imageTestId: "document-smartart-slot-picture-style-image",
      }),
    );
    return () => {
      // Unmount after the current render pass: the node view rebuilds its
      // members synchronously inside a ProseMirror update.
      queueMicrotask(() => root.unmount());
    };
  }
  const image = document.createElement("img");
  image.src = picture.src;
  image.alt = "";
  image.setAttribute("aria-hidden", "true");
  image.draggable = false;
  const box = smartArtSlotPictureBox(picture.format.crop);
  Object.assign(
    image.style,
    box
      ? {
          position: "absolute",
          left: `${box.left}%`,
          top: `${box.top}%`,
          width: `${box.width}%`,
          height: `${box.height}%`,
          maxWidth: "none",
          objectFit: "fill",
          pointerEvents: "none",
        }
      : {
          position: "absolute",
          inset: "0",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          pointerEvents: "none",
        },
  );
  clip.append(image);
  return null;
}
