/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { ResolvedTextBoxFill } from "@mrnote/core/web/lib/presentation-text-fill.ts";
import { textBoxNativeGeometry } from "@mrnote/core/web/lib/presentation-text-fill.ts";









export function PresentationTextBoxGeometry({
  block,
  fill,
}: {
  block: unknown;
  fill: ResolvedTextBoxFill;
}) {
  const geometry = textBoxNativeGeometry(block);
  if (!geometry || !fill.hasBox) return null;
  // A gradient frame is painted in its first stop on the path.
  const paint = fill.fill ?? "none";
  return (
    <svg
      aria-hidden="true"
      data-testid="presentation-text-geometry"
      viewBox={`0 0 ${geometry.viewBox[0]} ${geometry.viewBox[1]}`}
      preserveAspectRatio="none"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none", zIndex: -1 }}
    >
      {geometry.paths.map((path, index) => (
        <path
          key={index}
          d={path.d}
          fill={path.fill === "none" ? "none" : paint}
          fillOpacity={path.fill !== "none" && fill.fillOpacity < 1 ? fill.fillOpacity : undefined}
          stroke={fill.outlineWidth > 0 && path.stroke !== false ? fill.outlineColor : "none"}
          strokeWidth={fill.outlineWidth > 0 ? fill.outlineWidth : undefined}
          strokeDasharray={fill.outlineStyle === "dashed" ? `${fill.outlineWidth * 4} ${fill.outlineWidth * 3}` : fill.outlineStyle === "dotted" ? `${fill.outlineWidth} ${fill.outlineWidth * 2}` : undefined}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
