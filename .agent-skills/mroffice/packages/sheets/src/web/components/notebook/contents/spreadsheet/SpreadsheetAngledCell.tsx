/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Excel's angled cell, painted: the band (fill and slanted edges) and the
 * turned text's layer. One drawing for the grid, Page Layout and the split
 * panes; the geometry is lib/spreadsheet/angled-cell.
 */
import type { CSSProperties } from "react";
import {
  angledCellClipPath,
  angledCellShift,
  angledCellTopSegments,
  cssBorderLine,
  type AngledCellBand,
  type AngledTextBox,
} from "../../../../lib/spreadsheet/angled-cell";

export interface AngledCellEdges {
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
  fill?: string;
  /** Level neighbours' top borders, run out over this cell to the top ends
   * of its slanted edges. */
  leftNeighbourTop?: string;
  rightNeighbourTop?: string;
  /** The right-hand neighbour's angle when it is a band (its slant draws the
   * shared edge), else null. */
  rightNeighbourAngle: number | null;
}

type Edge = readonly [string, string | undefined, number, number, number, number];

/** One stroke of a band cell's edges, in the cell's own coordinates (the band's box starts at `band.left`). */
export interface AngledBandStroke {
  side: string;
  x1: number; y1: number; x2: number; y2: number;
  color: string;
  width: number;
  dash?: string;
}

/**
 * The strokes a band cell draws (SpreadsheetAngledBand, and the grid's
 * canvas for a cell at rest): its slanted sides, its bottom, its own stretch
 * of top and its level neighbours' tops run out over it.
 */
export function angledBandStrokes(band: AngledCellBand, width: number, edges: AngledCellEdges, scale = 1): AngledBandStroke[] {
  const top = angledCellTopSegments(
    band,
    width,
    edges.rightNeighbourAngle !== null ? angledCellShift(edges.rightNeighbourAngle, band.height) : null,
  );
  const [bl, br, tr, tl] = band.corners;
  const lines: Edge[] = [
    ["bottom", edges.bottom, bl[0], bl[1], br[0], br[1]],
    ["right", edges.right, br[0], br[1], tr[0], tr[1]],
    ["left", edges.left, bl[0], bl[1], tl[0], tl[1]],
    ["top", edges.top, top.own[0], 0, top.own[1], 0],
    ...(top.leftNeighbour ? [["top-left", edges.leftNeighbourTop, top.leftNeighbour[0], 0, top.leftNeighbour[1], 0] as Edge] : []),
    ...(top.rightNeighbour ? [["top-right", edges.rightNeighbourTop, top.rightNeighbour[0], 0, top.rightNeighbour[1], 0] as Edge] : []),
  ];
  const strokes: AngledBandStroke[] = [];
  for (const [side, css, x1, y1, x2, y2] of lines) {
    const line = cssBorderLine(css);
    if (!line || (x1 === x2 && y1 === y2)) continue;
    const strokeWidth = (line.double ? line.width / 3 : line.width) * scale;
    // Level edges sit inside the row as the collapsed box's half-borders do.
    const inset = side === "bottom" ? -strokeWidth / 2 : side.startsWith("top") ? strokeWidth / 2 : 0;
    strokes.push({ side, x1, y1: y1 + inset, x2, y2: y2 + inset, color: line.color, width: strokeWidth, ...(line.dash ? { dash: line.dash } : {}) });
  }
  return strokes;
}

export function SpreadsheetAngledBand({
  band,
  width,
  edges,
  scale = 1,
  testId = "spreadsheet-angled-cell",
}: {
  band: AngledCellBand;
  width: number;
  edges: AngledCellEdges;
  /** Line widths scale with the page in Page Layout. */
  scale?: number;
  testId?: string;
}) {
  const strokes = angledBandStrokes(band, width, edges, scale);
  return (
    <svg
      aria-hidden="true"
      data-testid={testId}
      data-angle={band.angle}
      width={band.width}
      height={band.height}
      style={{ position: "absolute", left: band.left, top: 0, overflow: "visible", pointerEvents: "none", zIndex: 1 }}
    >
      {edges.fill ? (
        <polygon points={band.corners.map(([x, y]) => `${x - band.left},${y}`).join(" ")} fill={edges.fill} />
      ) : null}
      {strokes.map((stroke) => (
        <line
          key={stroke.side}
          data-edge={stroke.side}
          x1={stroke.x1 - band.left}
          y1={stroke.y1}
          x2={stroke.x2 - band.left}
          y2={stroke.y2}
          stroke={stroke.color}
          strokeWidth={stroke.width}
          strokeDasharray={stroke.dash}
          strokeLinecap="square"
        />
      ))}
    </svg>
  );
}

/** The layer an angled cell's text is drawn in (the band's box clipped to the
 * band, or the cell's own box clipped to it) and the turned line box. */
export function angledTextLayerCss(
  text: AngledTextBox,
  band: AngledCellBand | null,
): { layer: CSSProperties; text: CSSProperties } {
  return {
    layer: band
      ? { inset: "auto", top: 0, left: band.left, width: band.width, height: band.height, padding: 0, display: "block", overflow: "visible", clipPath: angledCellClipPath(band) }
      : { inset: 0, padding: 0, display: "block", overflow: "hidden" },
    text: {
      position: "absolute",
      left: text.x - (band?.left ?? 0),
      top: text.y,
      width: "max-content",
      maxWidth: "none",
      height: text.lineHeight,
      lineHeight: `${text.lineHeight}px`,
      margin: 0,
      padding: 0,
      overflowX: "visible",
      writingMode: "horizontal-tb",
      transform: `rotate(${text.rotate}deg)`,
      transformOrigin: "0 0",
    },
  };
}
