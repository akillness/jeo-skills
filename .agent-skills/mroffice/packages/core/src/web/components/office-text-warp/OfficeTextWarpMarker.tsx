"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * WordArt Transform for a React-rendered text frame (the deck's text boxes and
 * shape labels; the worksheet's shapes): drop this marker anywhere inside the
 * element that holds the words. Its parent element is the SOURCE — laid out
 * as ever, measured glyph by glyph — and the shared painter
 * (`@/lib/office-text-warp-render`) draws the words bent over it, on the same
 * geometry Docs uses (`@/lib/office-text-warp`, measured against Word in
 * docs/office-graphics/TEXT-WARP.md). Renders nothing without a warp.
 */

import { useEffect, useRef, type ReactElement } from "react";

import { normalizeOfficeTextWarp } from "../../lib/office-text-warp";
import { attachOfficeTextWarp, type TextWarpShadow } from "../../lib/office-text-warp-render";

export function OfficeTextWarpMarker({
  warp,
  shadow,
  noWrap,
  align,
}: {
  warp: unknown;
  shadow?: TextWarpShadow | null;
  noWrap?: boolean;
  align?: "left" | "center" | "right" | "justify";
}): ReactElement | null {
  const ref = useRef<HTMLSpanElement | null>(null);
  const normalized = normalizeOfficeTextWarp(warp);
  const key = JSON.stringify([normalized, shadow ?? null, noWrap === true, align ?? "center"]);
  useEffect(() => {
    // The nearest ancestor that has a box (a `display: contents` wrapper —
    // a WordArt paint scope — is part of its parent's box, not one of its own).
    let source = ref.current?.parentElement ?? null;
    while (source && source.ownerDocument.defaultView?.getComputedStyle(source).display === "contents") {
      source = source.parentElement;
    }
    const host = source?.parentElement;
    if (!normalized || !source || !host) return;
    // PowerPoint bends the words across the whole text rectangle (the frame
    // less its insets). Where the words' element is the frame (the editor's
    // preview) it is the geometry; where it is a body shrink-wrapped to its
    // lines inside a padded frame (the show, the thumbnails), the frame is:
    // measured on the one-line body, an arch's letters ran off the top of
    
    const hostStyle = host.ownerDocument.defaultView?.getComputedStyle(host);
    const hostInner = host.clientHeight -
      (Number.parseFloat(hostStyle?.paddingTop ?? "") || 0) -
      (Number.parseFloat(hostStyle?.paddingBottom ?? "") || 0);
    const shrinkWrapped = hostInner > source.offsetHeight + 1;
    // A host that states no alignment bends the words as the page aligns
    // them: a text box's are left-aligned, and PowerPoint starts them at the
    // arch's left end. Read as centred, they sat on its crown.
    const drawnAlign = (): "left" | "center" | "right" | "justify" => {
      const view = source.ownerDocument.defaultView;
      const walker = source.ownerDocument.createTreeWalker(source, NodeFilter.SHOW_TEXT);
      let text = walker.nextNode();
      while (text && !text.textContent?.trim()) text = walker.nextNode();
      const value = text?.parentElement && view ? view.getComputedStyle(text.parentElement).textAlign : "";
      if (value === "left" || value === "start") return "left";
      if (value === "right" || value === "end") return "right";
      if (value === "justify") return "justify";
      return "center";
    };
    return attachOfficeTextWarp({
      source,
      host,
      overSource: !shrinkWrapped,
      hide: "opacity",
      insetsFromPadding: true,
      warp: normalized,
      shadow: shadow ?? null,
      noWrap: noWrap === true,
      align: align ?? drawnAlign(),
    });
    // `key` stands for every input the surface is built from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!normalized) return null;
  return <span ref={ref} data-office-text-warp-marker="" hidden />;
}
