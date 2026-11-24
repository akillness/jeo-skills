/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { CSSProperties, ReactNode } from "react";
import type { LineCalloutDrawing } from "../../../../lib/presentation-line-callout";

/** Preset body/leader paths with the same fill definitions as other PPT shapes. */
export function PresentationLineCalloutGraphic({ drawing, fill, stroke, strokeWidth, dashArray, dashCap, shadowFilter, style, children }: {
  drawing: LineCalloutDrawing;
  fill: string;
  stroke: string;
  strokeWidth: number;
  dashArray?: string;
  dashCap?: "round" | "butt" | "square";
  shadowFilter?: string;
  style: CSSProperties;
  children: ReactNode;
}) {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" style={style} data-testid="presentation-line-callout-geometry" aria-hidden="true">
      {children}
      {drawing.geometry.paths.map((path, index) => (
        <path key={index} d={path.d} fill={path.fill === "none" ? "none" : fill}
          stroke={path.stroke && strokeWidth > 0 ? stroke : "none"} strokeWidth={strokeWidth}
          strokeDasharray={dashArray} strokeLinecap={dashArray ? dashCap : undefined} vectorEffect="non-scaling-stroke" filter={shadowFilter} />
      ))}
    </svg>
  );
}
