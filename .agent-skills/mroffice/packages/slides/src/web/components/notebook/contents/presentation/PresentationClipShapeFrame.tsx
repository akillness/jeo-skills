"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useId, type ReactNode } from "react";

import { normalizePictureClipShape, pictureClipShapeOutline } from "../../../../lib/presentation-picture-crop-shape";
import { PRESENTATION_CUSTOM_PATH_GRID, presentationCustomPathToSvgPath } from "@mrnote/core/web/lib/presentation-freeform.ts";
import { officeLineFamilyDash } from "@mrnote/core/web/lib/office-stroke-dash.ts";
import { officePictureLineRectPath, type OfficePictureLineJoin } from "@mrnote/core/web/lib/office-picture-line.ts";
import type { OfficeStrokeCompound } from "@mrnote/core/web/lib/office-stroke-detail.ts";
import { OfficePictureLinePath } from "@mrnote/core/web/components/office-ribbon/OfficePictureLinePath.tsx";

/** A border drawn along the shape: design px, its colour and its dash. */
export interface ClipShapeStroke {
  width: number;
  color: string;
  style: "solid" | "dashed" | "dotted";
  /** The two or three lines a compound line is (`borderCompound`). */
  compound?: OfficeStrokeCompound;
  /** The line's corners (`borderJoin`); round when absent. */
  join?: OfficePictureLineJoin;
  /**
   * How far outside the outline the line is stroked, design px
   * (`officePictureLineOutset`): a flat picture's line lies outside it, as
   * PowerPoint draws it; 0 centres it (a video's, a 3-D picture's).
   */
  outset?: number;
  /** A rectangle's rounded corners (`cornerRadius`), design px. */
  radius?: number;
}
















export function PresentationClipShapeFrame({
  clipShape,
  width,
  height,
  fillParent,
  includeEllipse = false,
  stroke,
  adjustments = null,
  customPath = null,
  children,
}: {
  clipShape: unknown;
  /** The crop shape's dragged handles (`clipShapeAdjustments`). */
  adjustments?: unknown;
  /** A freeform outline (`clipCustomPath`, the shapes' path model). */
  customPath?: unknown;
  width: unknown;
  height: unknown;
  fillParent?: boolean;
  includeEllipse?: boolean;
  stroke?: ClipShapeStroke | null;
  children: ReactNode;
}) {
  const reactId = useId();
  const preset = normalizePictureClipShape(clipShape);
  const widthEmu = Number(width) || 0;
  const heightEmu = Number(height) || 0;
  const customD = !preset && customPath ? presentationCustomPathToSvgPath(customPath) : null;
  // The path is on its own 100000 grid; the outline is that grid stretched
  // to the frame, in design px (the stroke's unit).
  const outlineOf = (frameWidthEmu: number, frameHeightEmu: number) =>
    customD && frameWidthEmu > 0 && frameHeightEmu > 0
      ? {
          // `presentationCustomPathToSvgPath` writes the grid in thousandths.
          d: scaleSvgPath(
            customD,
            (frameWidthEmu / 9525) / (PRESENTATION_CUSTOM_PATH_GRID / 1000),
            (frameHeightEmu / 9525) / (PRESENTATION_CUSTOM_PATH_GRID / 1000),
          ),
          width: frameWidthEmu / 9525,
          height: frameHeightEmu / 9525,
        }
      : preset && (includeEllipse || stroke || preset !== "ellipse")
      ? pictureClipShapeOutline(preset, frameWidthEmu, frameHeightEmu, adjustments)
      : null;
  const outline = outlineOf(widthEmu, heightEmu);
  const visibleStroke = stroke && stroke.width > 0 && widthEmu > 0 && heightEmu > 0 ? stroke : null;
  const outset = visibleStroke ? Math.max(0, visibleStroke.outset ?? 0) : 0;
  // The line's path, in the frame's design px: the outline of the frame grown
  // by the outset each side (a rectangle's: its corners' centres kept).
  const lineD = !visibleStroke
    ? null
    : outline
      ? outset > 0
        ? (() => {
            const grown = outlineOf(widthEmu + 2 * outset * 9525, heightEmu + 2 * outset * 9525);
            return grown ? translateSvgPath(grown.d, -outset, -outset) : null;
          })()
        : outline.d
      : officePictureLineRectPath(widthEmu / 9525, heightEmu / 9525, visibleStroke.radius ?? 0, outset);
  if (!outline && !lineD) return <>{children}</>;
  const domId = `presentation-clip-shape-${reactId.replace(/[^A-Za-z0-9_-]/g, "")}`;
  const clipDefs = outline ? (
    <svg aria-hidden="true" width="0" height="0" style={{ position: "absolute" }}>
      <defs>
        <clipPath id={domId} clipPathUnits="objectBoundingBox">
          <path d={outline.d} transform={`scale(${1 / outline.width} ${1 / outline.height})`} />
        </clipPath>
      </defs>
    </svg>
  ) : null;
  const frameStyle = {
    position: "relative" as const,
    display: fillParent ? "block" : "inline-block",
    ...(fillParent ? { width: "100%", height: "100%" } : {}),
  };
  if (!lineD || !visibleStroke) {
    return (
      <span
        data-testid="presentation-picture-clip-shape"
        data-clip-shape={preset ?? undefined}
        style={{ ...frameStyle, clipPath: `url(#${domId})` }}
      >
        {clipDefs}
        {children}
      </span>
    );
  }
  const frameWidth = widthEmu / 9525;
  const frameHeight = heightEmu / 9525;
  const reach = outset + visibleStroke.width * 2;
  
  const dash = officeLineFamilyDash(visibleStroke.style, visibleStroke.width);
  return (
    <span data-testid="presentation-picture-clip-shape-frame" style={frameStyle}>
      {outline ? (
        <span
          data-testid="presentation-picture-clip-shape"
          data-clip-shape={preset ?? undefined}
          style={{ ...frameStyle, display: "block", width: "100%", height: "100%", clipPath: `url(#${domId})` }}
        >
          {clipDefs}
          {children}
        </span>
      ) : (
        children
      )}
      <svg
        aria-hidden="true"
        data-testid={outline ? "presentation-picture-clip-shape-line" : "presentation-picture-line"}
        data-line-outset={outset > 0 ? outset : undefined}
        viewBox={`0 0 ${frameWidth} ${frameHeight}`}
        preserveAspectRatio="none"
        overflow="visible"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }}
      >
        <OfficePictureLinePath
          d={lineD}
          color={visibleStroke.color}
          width={visibleStroke.width}
          compound={visibleStroke.compound}
          join={visibleStroke.join}
          dashArray={dash?.dashArray}
          dashCap={dash?.linecap}
          bounds={{ x: -reach, y: -reach, width: frameWidth + 2 * reach, height: frameHeight + 2 * reach }}
        />
      </svg>
    </span>
  );
}

/** An SVG path moved by `dx`, `dy` (the commands `scaleSvgPath` reads). */
function translateSvgPath(d: string, dx: number, dy: number): string {
  const tokens = d.match(/[MLQCAZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const out: string[] = [];
  let command = "";
  let index = 0;
  for (const token of tokens) {
    if (/^[A-Za-z]$/.test(token)) {
      command = token.toUpperCase();
      index = 0;
      out.push(token);
      continue;
    }
    const value = Number(token);
    let moved = value;
    if (command === "A") {
      // rx ry rotation large-arc sweep x y: only the end point moves.
      const slot = index % 7;
      moved = slot === 5 ? value + dx : slot === 6 ? value + dy : value;
    } else {
      moved = index % 2 === 0 ? value + dx : value + dy;
    }
    index += 1;
    out.push(String(Math.round(moved * 1000) / 1000));
  }
  return out.join(" ");
}

/**
 * An SVG path stretched by `sx`, `sy`: every coordinate pair, and an arc's
 * radii (its x-axis rotation is 0 in the paths `presentationCustomPathToSvgPath`
 * writes, so a stretch keeps it an axis-aligned arc).
 */
function scaleSvgPath(d: string, sx: number, sy: number): string {
  const tokens = d.match(/[MLQCAZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const out: string[] = [];
  let command = "";
  let index = 0;
  for (const token of tokens) {
    if (/^[A-Za-z]$/.test(token)) {
      command = token.toUpperCase();
      index = 0;
      out.push(token);
      continue;
    }
    const value = Number(token);
    let scaled = value;
    if (command === "A") {
      // rx ry rotation large-arc sweep x y
      const slot = index % 7;
      scaled = slot === 0 || slot === 5 ? value * sx : slot === 1 || slot === 6 ? value * sy : value;
    } else {
      scaled = index % 2 === 0 ? value * sx : value * sy;
    }
    index += 1;
    out.push(String(Math.round(scaled * 1000) / 1000));
  }
  return out.join(" ");
}
