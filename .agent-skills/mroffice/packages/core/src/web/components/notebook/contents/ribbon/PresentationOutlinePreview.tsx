"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { StrokeStyle } from "../../../../lib/presentation-shapes";

import styles from "./PresentationHomeShapeGallery.module.css";

/**
 * A line's weight and dash as a menu swatch. A file of its own: the worksheet
 * draws this in Shape Outline, and importing it from the gallery put the whole
 * shape gallery in the worksheet's first load.
 */
export function PresentationOutlinePreview({
  width = 3,
  style = "solid",
}: {
  readonly width?: number;
  readonly style?: StrokeStyle;
}) {
  const dash =
    style === "dashed" ? "7 4" : style === "dotted" ? "1 4" : undefined;
  if (width <= 0) {
    return (
      <svg
        viewBox="0 0 28 16"
        className={styles.menuPreview}
        aria-hidden="true"
      >
        <rect
          x="2"
          y="2"
          width="24"
          height="12"
          rx="2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        />
        <path d="M3 14L25 2" stroke="#c43e1c" strokeWidth="1.6" />
      </svg>
    );
  }
  // The weight is the subject of this swatch, so a solid line is a FILLED
  // bar: the ribbon skin and the Cupertino menu normalise every shape's
  // stroke-width to 1, which rendered nine stroked rules of different
  // weights as the same hairline nine times (Excel's Weight menu grows
  // visibly from 0.25 pt to 6 pt). Dash patterns keep a stroke, since the
  // pattern, not the thickness, is what that menu shows.
  const thickness = Math.max(1, Math.min(8, width));
  if (!dash) {
    return (
      <svg viewBox="0 0 28 16" className={styles.menuPreview} aria-hidden="true">
        <rect
          x="2"
          y={8 - thickness / 2}
          width="24"
          height={thickness}
          fill="currentColor"
          stroke="none"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 28 16" className={styles.menuPreview} aria-hidden="true">
      <path
        d="M2 8H26"
        fill="none"
        stroke="currentColor"
        strokeWidth={Math.min(6, thickness)}
        strokeDasharray={dash}
        strokeLinecap={style === "dotted" ? "round" : "butt"}
      />
    </svg>
  );
}
