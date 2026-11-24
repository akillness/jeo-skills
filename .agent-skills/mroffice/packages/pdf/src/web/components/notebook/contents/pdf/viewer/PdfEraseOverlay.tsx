"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  normalizePdfEraseRect,
  type PdfEraseDisplaySize,
  type PdfEraseStroke,
} from "../../../../../lib/pdf/page-erase";

import type { PdfEraseDraft, PdfEraseToolView } from "./hooks/usePdfEraseTool";

/** Drawn under the stroke so a cover the page's own colour still shows. */
const OUTLINE = "rgba(37, 99, 235, 0.55)";

function polylinePoints(
  points: readonly { x: number; y: number }[],
  size: PdfEraseDisplaySize,
): string {
  const scaled = points.map(
    (point) => `${(point.x / 100) * size.width},${(point.y / 100) * size.height}`,
  );
  // One sample is a dot: a zero-length line with round caps.
  return scaled.length === 1 ? `${scaled[0]} ${scaled[0]}` : scaled.join(" ");
}

function StrokeShape({
  stroke,
  size,
}: {
  stroke: PdfEraseStroke;
  size: PdfEraseDisplaySize;
}) {
  if (stroke.shape === "rect") {
    const { x1, y1, x2, y2 } = stroke.rect;
    return (
      <rect
        x={(x1 / 100) * size.width}
        y={(y1 / 100) * size.height}
        width={((x2 - x1) / 100) * size.width}
        height={((y2 - y1) / 100) * size.height}
        fill={stroke.color}
      />
    );
  }
  return (
    <polyline
      points={polylinePoints(stroke.points, size)}
      fill="none"
      stroke={stroke.color}
      strokeWidth={stroke.width}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function DraftShape({
  draft,
  color,
  brushWidth,
  size,
}: {
  draft: PdfEraseDraft;
  color: string | null;
  brushWidth: number;
  size: PdfEraseDisplaySize;
}) {
  if (draft.shape === "rect") {
    const rect = normalizePdfEraseRect(draft.start, draft.current) ?? {
      x1: Math.min(draft.start.x, draft.current.x),
      y1: Math.min(draft.start.y, draft.current.y),
      x2: Math.max(draft.start.x, draft.current.x),
      y2: Math.max(draft.start.y, draft.current.y),
    };
    const x = (rect.x1 / 100) * size.width;
    const y = (rect.y1 / 100) * size.height;
    const width = ((rect.x2 - rect.x1) / 100) * size.width;
    const height = ((rect.y2 - rect.y1) / 100) * size.height;
    return (
      <>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={color ?? "rgba(255, 255, 255, 0.75)"}
        />
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill="none"
          stroke={OUTLINE}
          strokeDasharray="4 3"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      </>
    );
  }
  const points = polylinePoints(draft.points, size);
  return (
    <>
      <polyline
        points={points}
        fill="none"
        stroke={OUTLINE}
        strokeWidth={brushWidth + 1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points={points}
        fill="none"
        stroke={color ?? "rgba(255, 255, 255, 0.85)"}
        strokeWidth={brushWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

/**
 * The eraser over one page: the stroke being drawn, then the written strokes
 * held until the page repaints with them, so a cover never flashes away
 * between the release and the new revision. Coordinates are the page's own
 * points, so a brush stays round on a page that is not square.
 */
export function PdfEraseOverlay({
  page,
  size,
  tool,
}: {
  page: number;
  size: PdfEraseDisplaySize | null;
  tool: PdfEraseToolView;
}) {
  const strokes = tool.pending.filter((stroke) => stroke.page === page);
  const draft = tool.draft?.page === page ? tool.draft : null;
  if (!size || (strokes.length === 0 && !draft)) return null;
  return (
    <svg
      aria-hidden
      className="pdf-viewer__erase-layer"
      data-testid="pdf-erase-layer"
      preserveAspectRatio="none"
      viewBox={`0 0 ${size.width} ${size.height}`}
      style={{
        height: "100%",
        inset: 0,
        pointerEvents: "none",
        position: "absolute",
        width: "100%",
        zIndex: 5,
      }}
    >
      {strokes.map((stroke, index) => (
        <g key={index} data-testid="pdf-erase-pending">
          <StrokeShape stroke={stroke} size={size} />
        </g>
      ))}
      {draft ? (
        <g data-testid="pdf-erase-draft">
          <DraftShape
            draft={draft}
            color={tool.previewColor}
            brushWidth={tool.brushWidth}
            size={size}
          />
        </g>
      ) : null}
    </svg>
  );
}
