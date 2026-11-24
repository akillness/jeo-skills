/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { ReactNode } from "react";
import {
  cloudOutlinePoints,
  ellipsePath,
  resolveShapeLineEndings,
  resolveShapeLineStyle,
  resolveShapeFill,
  resolveShapeOpacity,
  resolveShapeCornerRadius,
  shapeBox,
  shapeLineDashPattern,
  shapeLineMarkerGeometry,
  shapeLineMarkerSize,
  type ShapeKind,
  type ShapeLineEnding,
  type ShapeLineStyle,
} from "@mrnote/core/web/lib/pdf/shapes.ts";

/**
 * Render a single shape annotation as SVG primitives for an overlay with
 * `viewBox="0 0 100 100"` (page-relative percent coords map directly). Returns
 * an un-filled coloured stroke matching the flatten bake: a rect outline, a
 * line, an arrow (line + barb polyline computed by the shared geometry helper),
 * or an ellipse outline. `color` / `strokeWidth` (percent units) come from the
 * shape (or the active tool for the live preview). Pure presentation — used for
 * both persisted shapes and the in-progress drag preview.
 */
export function renderShapeSvg(
  shape: {
    kind: ShapeKind;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    points?: readonly { x: number; y: number }[];
    fillColor?: string | null;
    fillOpacity?: number;
    opacity?: number;
    cornerRadius?: number;
    lineStyle?: ShapeLineStyle;
    lineStart?: ShapeLineEnding;
    lineEnd?: ShapeLineEnding;
  },
  color: string,
  strokeWidth: number,
): ReactNode {
  // Optional interior fill (rect / ellipse only) resolved by the pure helper so
  // the SVG matches the flatten bake; null → an outline-only stroke (fill:none).
  const fill = resolveShapeFill(shape);
  const opacity = resolveShapeOpacity(shape.opacity);
  const linePattern = shapeLineDashPattern(
    resolveShapeLineStyle(shape),
    strokeWidth,
  );
  const lineEndings = resolveShapeLineEndings(shape);
  const markerSize = shapeLineMarkerSize(strokeWidth);
  const common = {
    fill: fill ? fill.color : ("none" as const),
    fillOpacity: fill ? fill.opacity : undefined,
    stroke: color,
    strokeWidth,
    strokeDasharray: linePattern?.dashArray.join(" "),
    strokeLinecap: linePattern?.lineCap ?? ("round" as const),
    strokeLinejoin: "round" as const,
    vectorEffect: "non-scaling-stroke" as const,
    opacity,
  };
  const renderLineEnding = (
    ending: ShapeLineEnding,
    tip: { x: number; y: number },
    toward: { x: number; y: number },
    key: string,
  ): ReactNode => {
    if (markerSize === null) return null;
    const geometry = shapeLineMarkerGeometry(ending, {
      tip,
      toward,
      size: markerSize,
    });
    if (!geometry) return null;
    const markerProps = {
      "data-pdf-shape-line-ending": ending,
      fill: geometry.kind === "openArrow" ? "none" : color,
      stroke: color,
      strokeWidth,
      strokeLinecap: "round" as const,
      strokeLinejoin: "round" as const,
      vectorEffect: "non-scaling-stroke" as const,
      opacity,
    };
    if (geometry.kind === "openArrow") {
      return (
        <polyline
          key={key}
          points={`${geometry.left.x},${geometry.left.y} ${geometry.tip.x},${geometry.tip.y} ${geometry.right.x},${geometry.right.y}`}
          {...markerProps}
        />
      );
    }
    if (geometry.kind === "closedArrow") {
      return (
        <polygon
          key={key}
          points={`${geometry.left.x},${geometry.left.y} ${geometry.tip.x},${geometry.tip.y} ${geometry.right.x},${geometry.right.y}`}
          {...markerProps}
        />
      );
    }
    if (geometry.kind === "circle") {
      return (
        <circle
          key={key}
          cx={geometry.cx}
          cy={geometry.cy}
          r={geometry.radius}
          {...markerProps}
        />
      );
    }
    return (
      <rect
        key={key}
        x={geometry.x}
        y={geometry.y}
        width={geometry.width}
        height={geometry.height}
        {...markerProps}
      />
    );
  };
  if (shape.kind === "rect") {
    const box = shapeBox(shape);
    const radius = Math.min(
      box.width / 2,
      box.height / 2,
      (Math.min(box.width, box.height) *
        resolveShapeCornerRadius(shape.kind, shape.cornerRadius)) /
        100,
    );
    return (
      <rect
        x={box.x}
        y={box.y}
        width={box.width}
        height={box.height}
        rx={radius || undefined}
        ry={radius || undefined}
        {...common}
      />
    );
  }
  if (shape.kind === "ellipse") {
    return <path d={ellipsePath(shape)} {...common} />;
  }
  if (shape.kind === "cloud") {
    const points = cloudOutlinePoints(shape)
      .map((point) => `${point.x},${point.y}`)
      .join(" ");
    return <polygon points={points} {...common} />;
  }
  if (shape.kind === "polygon" && shape.points) {
    const points = shape.points
      .map((point) => `${point.x},${point.y}`)
      .join(" ");
    return <polygon points={points} {...common} />;
  }
  if (shape.kind === "polyline" && shape.points) {
    const points = shape.points
      .map((point) => `${point.x},${point.y}`)
      .join(" ");
    return (
      <>
        <polyline points={points} {...common} />
        {shape.points.length >= 2
          ? [
              renderLineEnding(
                lineEndings.start,
                shape.points[0],
                shape.points[1],
                "start",
              ),
              renderLineEnding(
                lineEndings.end,
                shape.points[shape.points.length - 1],
                shape.points[shape.points.length - 2],
                "end",
              ),
            ]
          : null}
      </>
    );
  }
  // line / arrow: the shaft plus canonical semantic line endings.
  const shaft = (
    <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} {...common} />
  );
  return (
    <>
      {shaft}
      {renderLineEnding(
        lineEndings.start,
        { x: shape.x1, y: shape.y1 },
        { x: shape.x2, y: shape.y2 },
        "start",
      )}
      {renderLineEnding(
        lineEndings.end,
        { x: shape.x2, y: shape.y2 },
        { x: shape.x1, y: shape.y1 },
        "end",
      )}
    </>
  );
}
