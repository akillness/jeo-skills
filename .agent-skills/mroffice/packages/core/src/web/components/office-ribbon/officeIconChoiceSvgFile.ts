/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * An Insert > Icons choice as the SVG file an editor inserts: the gallery's
 * drawing rendered once, its paint stated in the SVG itself (the inline icon
 * is painted by the page's stylesheet), as PowerPoint inserts an icon -- an
 * SVG graphic, not a picture of one.
 */
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { OfficeIconChoice } from "./OfficeIconGalleryDialog";
import { houseIconStandaloneSvg } from "./icons/houseIconStandaloneSvg";

export function officeIconChoiceSvgFile(icon: OfficeIconChoice): File | null {
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    flushSync(() => {
      root.render(createElement(icon.Icon, { size: 96, strokeWidth: 1.6, color: "#1e293b" }));
    });
    const inline = host.querySelector("svg")?.outerHTML;
    const svg = inline ? houseIconStandaloneSvg(inline) : null;
    return svg ? new File([svg], `icon-${icon.id}.svg`, { type: "image/svg+xml" }) : null;
  } finally {
    root.unmount();
  }
}
