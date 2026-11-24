/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type React from "react";
import { presentationChartAreaOutline } from "../../lib/presentation-chart-area-style";

/**
 * The chart area's frame line, drawn over the chart as Office draws it: the
 * stated width exactly, centred on the chart's edge so half of it lies
 * outside, with a compound line's bands and a preset dash
 * (`presentationChartAreaOutline`). The host's box sets no border of its own
 * (`presentationChartAreaStyleCssWithoutLine`).
 */
export function OfficeChartAreaOutline({
  chartAreaStyle,
  cornerRadius,
}: {
  chartAreaStyle: unknown;
  /** Format Chart Area ▸ Border ▸ Rounded corners, in px. */
  cornerRadius?: number;
}) {
  const outline = presentationChartAreaOutline(chartAreaStyle);
  if (!outline) return null;
  const w = outline.width;
  return (
    <svg
      aria-hidden="true"
      data-chart-area-outline="true"
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        overflow: "visible",
        pointerEvents: "none",
        zIndex: 1,
      }}
    >
      {outline.bands.map(([from, to], index) => {
        // A band's centre, inward of the chart's edge (the line's own
        // centre is on the edge).
        const inset = w * ((from + to) / 2 - 0.5);
        const bandWidth = w * (to - from);
        return (
          <rect
            key={index}
            // A band on the edge is the box itself; one inset is the box less
            // its inset on each side (SVG 2 geometry properties), at any size
            // the chart is drawn.
            {...(inset === 0 ? { x: 0, y: 0, width: "100%", height: "100%", rx: cornerRadius || undefined } : {})}
            style={inset === 0 ? undefined : {
              x: `${inset}px`,
              y: `${inset}px`,
              width: `calc(100% - ${2 * inset}px)`,
              height: `calc(100% - ${2 * inset}px)`,
              ...(cornerRadius ? { rx: `${Math.max(0, cornerRadius - inset)}px` } : {}),
            } as React.CSSProperties}
            fill="none"
            stroke={outline.color}
            strokeWidth={bandWidth}
            strokeDasharray={outline.dashArray}
            strokeLinecap={outline.cap}
            strokeLinejoin={outline.join}
          />
        );
      })}
    </svg>
  );
}
