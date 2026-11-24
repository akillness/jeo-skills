/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { ReactElement } from "react";

/**
 * The border-preset glyphs the table Borders menus show: a faint 2×2 cell grid
 * with the edges the preset sets drawn in the ribbon's ink, the way
 * PowerPoint's and Word's Borders menus draw them (Table Design ▸ Borders;
 * Table Layout ▸ Borders). One drawing for Docs, the deck and any other host
 * so the same preset never wears two glyphs.
 */
export type OfficeBorderPreset =
  | "all"
  | "outside"
  | "inside"
  | "insideH"
  | "insideV"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "diagonalDown"
  | "diagonalUp"
  | "none"
  // Excel's Home ▸ Borders list adds weights and doubles on the outer edges.
  | "thickBox"
  | "bottomDouble"
  | "thickBottom"
  | "topAndBottom"
  | "topAndThickBottom"
  | "topAndDoubleBottom";

/** Stroke widths in the 20-unit box: a thin edge, a thick one, a double's line. */
const THIN = 2;
const THICK = 3.5;
const DOUBLE_LINE = 1.1;
const DOUBLE_GAP = 1.4;

const OUTER = { x: 2.5, y: 2.5, w: 15, h: 15 } as const;
const MID = 10;

function has(preset: OfficeBorderPreset, ...targets: OfficeBorderPreset[]) {
  return targets.includes(preset);
}

export function OfficeBorderPresetIcon({
  preset,
  size = 18,
  className,
}: {
  preset: OfficeBorderPreset;
  size?: number;
  className?: string;
}): ReactElement {
  const { x, y, w, h } = OUTER;
  const right = x + w;
  const bottom = y + h;
  // The house icon language (two tones, as every ribbon glyph): the table
  // is a white sheet whose cell grid stays a faint dotted guide, and the
  // edges the preset draws are the accent blue. "None" keeps the dotted grid
  // alone. The paints are CSS variables with literal fallbacks, so a glyph in
  // a portalled menu or a dialog paints the same as one on the ribbon.
  const accent = "var(--office-border-icon-accent, var(--docs-home-icon-accent, #1976b8))";
  const paper = "var(--office-border-icon-paper, #ffffff)";
  const guide = "var(--office-border-icon-guide, var(--docs-home-icon-ink-soft, #40575d))";
  const outerOn = has(preset, "all", "outside", "thickBox");
  const topOn =
    outerOn || has(preset, "top", "topAndBottom", "topAndThickBottom", "topAndDoubleBottom");
  const bottomOn = outerOn || has(preset, "bottom", "topAndBottom");
  const leftOn = outerOn || preset === "left";
  const rightOn = outerOn || preset === "right";
  const thickBottom = has(preset, "thickBottom", "topAndThickBottom");
  const doubleBottom = has(preset, "bottomDouble", "topAndDoubleBottom");
  const outerWidth = preset === "thickBox" ? THICK : THIN;
  const innerHOn = has(preset, "all", "inside", "insideH");
  const innerVOn = has(preset, "all", "inside", "insideV");
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      data-office-border-preset={preset}
    >
      {/* The sheet and its cell grid every preset sits on: a dotted guide,
          as Word draws the borders it leaves off. Widths are inline on each
          path: a ribbon stylesheet that gives every glyph's paths one stroke
          width must not flatten a thick edge to a thin one. */}
      <rect x={x} y={y} width={w} height={h} rx={0.5} style={{ fill: paper, stroke: "none" }} />
      <g stroke={guide} strokeOpacity={0.55} strokeDasharray="1 1.5" strokeLinecap="round">
        <rect x={x} y={y} width={w} height={h} rx={0.5} style={{ strokeWidth: 1 }} />
        <path d={`M${x} ${MID}H${right}M${MID} ${y}V${bottom}`} style={{ strokeWidth: 1 }} />
      </g>
      <g stroke={accent} strokeLinecap="square">
        {topOn ? <path d={`M${x} ${y}H${right}`} style={{ strokeWidth: outerWidth }} /> : null}
        {bottomOn ? <path d={`M${x} ${bottom}H${right}`} style={{ strokeWidth: outerWidth }} /> : null}
        {thickBottom ? <path d={`M${x} ${bottom}H${right}`} style={{ strokeWidth: THICK }} /> : null}
        {doubleBottom ? (
          <path
            d={`M${x} ${bottom - DOUBLE_GAP}H${right}M${x} ${bottom + DOUBLE_GAP}H${right}`}
            style={{ strokeWidth: DOUBLE_LINE }}
          />
        ) : null}
        {leftOn ? <path d={`M${x} ${y}V${bottom}`} style={{ strokeWidth: outerWidth }} /> : null}
        {rightOn ? <path d={`M${right} ${y}V${bottom}`} style={{ strokeWidth: outerWidth }} /> : null}
        {innerHOn ? <path d={`M${x} ${MID}H${right}`} style={{ strokeWidth: 1.6 }} /> : null}
        {innerVOn ? <path d={`M${MID} ${y}V${bottom}`} style={{ strokeWidth: 1.6 }} /> : null}
        {preset === "diagonalDown" ? (
          <path d={`M${x} ${y}L${right} ${bottom}`} style={{ strokeWidth: 1.8 }} strokeLinecap="round" />
        ) : null}
        {preset === "diagonalUp" ? (
          <path d={`M${x} ${bottom}L${right} ${y}`} style={{ strokeWidth: 1.8 }} strokeLinecap="round" />
        ) : null}
      </g>
    </svg>
  );
}
