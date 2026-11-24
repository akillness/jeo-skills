/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type ReactElement } from "react";
import {
  DEFAULT_SLICER_BUTTON_HEIGHT,
  DEFAULT_SLICER_COLUMNS,
  DEFAULT_SLICER_HEIGHT,
  DEFAULT_SLICER_WIDTH,
  type Slicer,
} from "../../../../lib/spreadsheet/slicer";
import { type SpreadsheetSlicerView } from "../../../../lib/spreadsheet/slicer-view";
import {
  DEFAULT_PIVOT_TIMELINE_HEIGHT,
  DEFAULT_PIVOT_TIMELINE_WIDTH,
  pivotTimelineGroupLabel,
  pivotTimelinePeriods,
  pivotTimelineScrollIndex,
  pivotTimelineSelectionLabel,
  pivotTimelineStyleRecipe,
  pivotTimelineTileLabel,
  pivotTimelineTileState,
  type PivotTimeline,
  type PivotTimelineLevel,
} from "../../../../lib/spreadsheet/pivot-timeline";
import { SLICER_STYLE_RECIPES } from "./SpreadsheetSlicerPanel";

/**
 * A slicer and a timeline as the sheet shows them at rest, drawn as SVG for
 * the printout (Excel prints both by default: Print object). The layout is
 * the panels' own (`SlicerPanel`, `SpreadsheetPivotTimeline`): the same
 * style recipes, sizes, paddings, gaps and the strip's scroll position; the
 * controls only an editor uses (Multi-Select, Clear, Remove, the focus ring)
 * are left out, as Excel's printout leaves them out. One picture per panel,
 * drawn by the server's SVG painter (`chart_svg_pdf`).
 */

const FONT = "Inter, Segoe UI, Arial, sans-serif";

export function SlicerPrintGlyph({
  slicer,
  view,
  blankLabel,
}: {
  slicer: Slicer;
  view: SpreadsheetSlicerView;
  blankLabel: string;
}): ReactElement {
  const width = slicer.width ?? DEFAULT_SLICER_WIDTH;
  const height = slicer.height ?? DEFAULT_SLICER_HEIGHT;
  const recipe = SLICER_STYLE_RECIPES[slicer.styleId ?? "light1"];
  const columns = Math.max(1, slicer.columns ?? DEFAULT_SLICER_COLUMNS);
  const buttonHeight = Math.max(slicer.buttonHeight ?? DEFAULT_SLICER_BUTTON_HEIGHT, 22);
  const allOn = view.selected.size === 0 && !view.filtered;
  const header = slicer.showHeader !== false;
  const headerHeight = 26.4;
  const top = header ? headerHeight + 2 + 4 : 6;
  const chipWidth = (width - 12 - (columns - 1) * 2) / columns;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <clipPath id="slicer-panel">
          <rect x="0" y="0" width={width} height={height} rx="4" />
        </clipPath>
      </defs>
      <rect x="0.5" y="0.5" width={width - 1} height={height - 1} rx="4" fill={recipe.surface} stroke={recipe.border} strokeWidth="1" />
      <g clipPath="url(#slicer-panel)">
        {header ? (
          <>
            <rect x="0" y="0" width={width} height={headerHeight} fill={recipe.header} />
            <text x="7" y={headerHeight / 2} fontSize="12" fontWeight="600" fontFamily={FONT} fill={recipe.headerText} dominantBaseline="central">
              {view.title}
            </text>
          </>
        ) : null}
        {view.values.map((value, index) => {
          const on = allOn || view.selected.has(value);
          const x = 6 + (index % columns) * (chipWidth + 2);
          const y = top + Math.floor(index / columns) * (buttonHeight + 2);
          if (y > height) return null;
          return (
            <g key={`${index}:${value}`}>
              <clipPath id={`slicer-chip-${index}`}>
                <rect x={x} y={y} width={chipWidth} height={buttonHeight} />
              </clipPath>
              <rect x={x + 0.5} y={y + 0.5} width={chipWidth - 1} height={buttonHeight - 1} rx="5" fill={on ? recipe.selected : "none"} stroke="#e5e7eb" strokeWidth="1" />
              {on ? (
                <path
                  d={`M${x + 8.5} ${y + buttonHeight / 2} l2.5 2.5 l5 -5.5`}
                  fill="none"
                  stroke={recipe.selectedText}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
              <g clipPath={`url(#slicer-chip-${index})`}>
                <text
                  x={x + 25}
                  y={y + buttonHeight / 2}
                  fontSize="12"
                  fontWeight={on ? "600" : "400"}
                  fontStyle={value === "" ? "italic" : "normal"}
                  fontFamily={FONT}
                  fill={on ? recipe.selectedText : "#111827"}
                  dominantBaseline="central"
                  opacity={value === "" ? 0.7 : 1}
                >
                  {value === "" ? blankLabel : value}
                </text>
              </g>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

const TILE_WIDTH: Record<PivotTimelineLevel, number> = { years: 52, quarters: 44, months: 40, days: 28 };

export function TimelinePrintGlyph({
  timeline,
  accents,
  locale,
  allPeriodsLabel,
  levelLabel,
  translate,
}: {
  timeline: PivotTimeline;
  accents?: readonly string[];
  locale?: string;
  allPeriodsLabel: string;
  levelLabel: string;
  translate?: Parameters<typeof pivotTimelineTileLabel>[3];
}): ReactElement {
  const recipe = pivotTimelineStyleRecipe(timeline.style, accents);
  const width = timeline.width ?? DEFAULT_PIVOT_TIMELINE_WIDTH;
  const height = timeline.height ?? DEFAULT_PIVOT_TIMELINE_HEIGHT;
  const level = timeline.level;
  const periods = pivotTimelinePeriods(timeline.bounds, level);
  const tileWidth = TILE_WIDTH[level];
  const scroll = pivotTimelineScrollIndex(periods, timeline) * tileWidth;
  let y = 6;
  const rows: ReactElement[] = [];
  if (timeline.showHeader) {
    rows.push(
      <g key="caption">
        <text x="8" y={y + 10} fontSize="13" fontWeight="600" fontFamily={FONT} fill={recipe.headerText} dominantBaseline="central">
          {timeline.caption}
        </text>
        <rect x={width - 8 - 22 + 0.5} y={y + 0.5} width="21" height="19" rx="2" fill="none" stroke={recipe.border} />
        <path
          d={`M${width - 8 - 17} ${y + 6} h12 l-4.5 4.5 v4 l-3 1.5 v-5.5 z`}
          fill="none"
          stroke={recipe.headerText}
          strokeWidth="1"
          opacity={timeline.selection ? 1 : 0.45}
        />
      </g>,
    );
    y += 20 + 4;
  }
  if (timeline.showSelectionLabel || timeline.showTimeLevel) {
    rows.push(
      <g key="selection">
        {timeline.showSelectionLabel ? (
          <text x="8" y={y + 9} fontSize="12" fontFamily={FONT} fill={recipe.labelText} dominantBaseline="central">
            {pivotTimelineSelectionLabel(timeline.selection, timeline.selectionLevel, allPeriodsLabel, locale, translate)}
          </text>
        ) : null}
        {timeline.showTimeLevel ? (
          <>
            <text x={width - 8 - 14} y={y + 9} fontSize="11" fontWeight="600" fontFamily={FONT} fill={recipe.labelText} textAnchor="end" dominantBaseline="central">
              {levelLabel}
            </text>
            <path d={`M${width - 8 - 10} ${y + 7.5} l3.5 3.5 l3.5 -3.5`} fill="none" stroke={recipe.labelText} strokeWidth="1.2" />
          </>
        ) : null}
      </g>,
    );
    y += 18 + 4;
  }
  const stripTop = y;
  const groups: Array<{ key: string; label: string; first: number; count: number }> = [];
  periods.forEach((period, index) => {
    const last = groups.at(-1);
    if (last && last.key === period.groupKey) last.count += 1;
    else groups.push({ key: period.groupKey, label: pivotTimelineGroupLabel(period, level, locale), first: index, count: 1 });
  });
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <clipPath id="timeline-strip">
          <rect x="8" y={stripTop} width={Math.max(0, width - 16)} height={Math.max(0, height - 6 - stripTop)} />
        </clipPath>
      </defs>
      <rect x="0.5" y="0.5" width={width - 1} height={height - 1} rx="2" fill={recipe.surface} stroke={recipe.border} strokeWidth="1" />
      {rows}
      <g clipPath="url(#timeline-strip)">
        <g transform={`translate(${8 - scroll} ${stripTop})`}>
          {groups.map((group) => (
            <g key={group.key}>
              <line x1={group.first * tileWidth + 0.5} y1="0" x2={group.first * tileWidth + 0.5} y2="13" stroke={recipe.border} strokeWidth="1" />
              <text x={group.first * tileWidth + 3} y="7" fontSize="11" fontFamily={FONT} fill={recipe.labelText} dominantBaseline="central">
                {group.label}
              </text>
            </g>
          ))}
          {periods.map((period, index) => {
            const state = pivotTimelineTileState(period, timeline.selection);
            return (
              <g key={period.key}>
                <text x={index * tileWidth + tileWidth / 2} y="21" fontSize="10" fontFamily={FONT} fill={recipe.tileText} textAnchor="middle" dominantBaseline="central">
                  {pivotTimelineTileLabel(period, level, locale, translate)}
                </text>
                <rect
                  x={index * tileWidth}
                  y="29"
                  width={tileWidth}
                  height="12"
                  fill={state === "selected" ? recipe.selected : state === "partial" ? recipe.partial : recipe.tile}
                />
              </g>
            );
          })}
        </g>
      </g>
    </svg>
  );
}
