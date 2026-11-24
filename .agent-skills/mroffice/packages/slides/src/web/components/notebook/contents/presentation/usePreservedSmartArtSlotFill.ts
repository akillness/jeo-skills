/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useContext, useEffect, useState } from "react";

import { smartArtPictureSrc } from "@mrnote/core/web/lib/office-smartart/picture.ts";
import { officePictureNaturalSize } from "@mrnote/core/web/lib/office-picture-fill-options.ts";
import {
  officeCropToFillRect,
  preservedSmartArtSlotMedia,
  readPreservedSlotPicture,
} from "@mrnote/core/web/lib/office-smartart/preserved-slot-pictures.ts";
import {
  smartArtSlotMediaAddress,
  type SmartArtSlotMedia,
} from "@mrnote/core/web/lib/office-smartart/slot-media-client.ts";
import { PresentationPageIdContext } from "./PresentationMediaContent";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

/** The picture fill for `block`, or `null` (no slot, no page, or no answer yet). */
export function usePreservedSmartArtSlotFill(block: { source?: unknown }): Readonly<Record<string, unknown>> | null {
  const pageId = useContext(PresentationPageIdContext);
  const view = asRecord(asRecord(block.source)?.nativeSmartArtView);
  const slot = view ? readPreservedSlotPicture(view.pictureSlot) : null;
  const address = slot ? smartArtSlotMediaAddress(view) : null;
  const dataPart = address?.dataPart ?? null;
  const dataFingerprint = address?.dataFingerprint ?? null;
  const [answer, setAnswer] = useState<{ key: string; media: SmartArtSlotMedia | null } | null>(null);
  const key = pageId && dataPart && dataFingerprint ? `${pageId}\u0000${dataPart}\u0000${dataFingerprint}` : null;
  useEffect(() => {
    if (!key || !pageId || !dataPart || !dataFingerprint) return;
    let live = true;
    void preservedSmartArtSlotMedia({ pageId, dataPart, dataFingerprint }).then((media) => {
      if (live) setAnswer({ key, media });
    });
    return () => {
      live = false;
    };
  }, [key, pageId, dataPart, dataFingerprint]);
  if (!slot || !key || answer?.key !== key) return null;
  const url = smartArtPictureSrc(answer.media?.[slot.embed]);
  if (!url) return null;
  // A picture placeholder is filled as Windows PowerPoint lays it out on
  // open: cropped to fill, centred (`officeCropToFillRect`); until its size is
  // read, the centred cover it comes to.
  if (slot.cropToFill) {
    const box = asRecord(block);
    const rect = officeCropToFillRect(officePictureNaturalSize(url), {
      width: Number(box?.width) || 0,
      height: Number(box?.height) || 0,
    });
    return rect && (rect.l || rect.t || rect.r || rect.b)
      ? { url, fit: "cover", fillRect: rect }
      : { url, fit: "cover" };
  }
  const { l, t, r, b } = slot.fillRect;
  // Office stretches the picture over the shape (`a:stretch/a:fillRect`),
  // which the slide's picture fill spells `cover`, as an imported shape's own
  // stretched picture is read; stated offsets inset it.
  return { url, fit: "cover", ...(l || t || r || b ? { fillRect: { l, t, r, b } } : {}) };
}
