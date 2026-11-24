"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A perspective text shadow (scaled or skewed: Text Effects > Shadow >
 * Perspective) on words that are not warped, drawn behind them by the shared
 * shadow copy (`lib/office-text-shadow-copy`). Placed inside the words'
 * element, as `OfficeTextWarpMarker` is; a warped box's shadow is the warp
 * painter's, and a shadow that is only moved stays the paint's `drop-shadow`.
 */

import { useEffect, useRef, type ReactElement } from "react";

import { normalizeOfficeTextWarp } from "../../lib/office-text-warp";
import { attachOfficeTextShadowCopy, officeTextShadowTransformed } from "../../lib/office-text-shadow-copy";
import type { TextWarpShadow } from "../../lib/office-text-warp-render";

export function OfficeTextShadowCopyMarker({
  shadow,
  warp,
}: {
  shadow: TextWarpShadow | null | undefined;
  warp?: unknown;
}): ReactElement | null {
  const ref = useRef<HTMLSpanElement | null>(null);
  const drawn = officeTextShadowTransformed(shadow) && !normalizeOfficeTextWarp(warp) ? shadow : null;
  const key = JSON.stringify(drawn);
  useEffect(() => {
    if (!drawn) return;
    // The nearest ancestor that has a box (a `display: contents` wrapper --
    // a WordArt paint scope -- is part of its parent's box).
    let source = ref.current?.parentElement ?? null;
    while (source && source.ownerDocument.defaultView?.getComputedStyle(source).display === "contents") {
      source = source.parentElement;
    }
    const host = source?.parentElement;
    if (!source || !host) return;
    // The text box is the frame when the words are shrink-wrapped inside its
    // padding (the show, the thumbnails), the words' element otherwise.
    const hostStyle = host.ownerDocument.defaultView?.getComputedStyle(host);
    const hostInner =
      host.clientHeight -
      (Number.parseFloat(hostStyle?.paddingTop ?? "") || 0) -
      (Number.parseFloat(hostStyle?.paddingBottom ?? "") || 0);
    const shrinkWrapped = hostInner > source.offsetHeight + 1;
    return attachOfficeTextShadowCopy({
      source,
      host,
      shadow: drawn,
      frame: shrinkWrapped ? host : source,
      insetsFromPadding: true,
    });
    // `key` stands for every input the copy is built from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!drawn) return null;
  return <span ref={ref} data-office-text-shadow-copy-marker="" hidden />;
}
