"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The chart drawn inside a chart block on the canvas and in the slideshow,
 * with its title lookup and chart-area fill state.
 *
 * Moved verbatim out of `components/notebook/contents/PresentationWindow.tsx`
 * (structural split, no behaviour change).
 */

import {
  PresentationChartPlotDataTable,
} from "./PresentationChartDataTable";
import { useMemo } from "react";
import { readPresentationChartV2 } from "@mrnote/core/web/lib/presentation-chart-v2.ts";
import { presentationChartHasNativeSource } from "@mrnote/core/web/lib/presentation-chart-data.ts";
import {
  normalizePresentationChartAreaStyle,
  presentationChartAreaStyleCss,
  presentationChartTitleWordsCss,
} from "@mrnote/core/web/lib/presentation-chart-area-style.ts";
import { hasLayoutGeometry } from "@mrnote/core/web/lib/presentation-object-buttons.ts";
import type {
  PresentationChartBlock,
} from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import { PresentationChartCanvas } from "./PresentationChartCanvas";
import {
  presentationChartCanvasBlock,
  presentationChartDataTableBasis,
  presentationChartFallbackPicture,
} from "../../../../lib/presentation/chart-picture-request";

export function presentationChartAreaFillState(block: PresentationChartBlock): "none" | "set" {
  const attrs = readPresentationChartV2(block.chartV2);
  const area = attrs ? normalizePresentationChartAreaStyle(attrs.format?.chartAreaStyle) : null;
  return area?.fill === "none" && !area.shapePaint?.fillGradient ? "none" : "set";
}

/**
 * What a chart's host paints under the chart, one answer for the edit canvas
 * and the show: the white sheet, except where the chart area states No Fill
 * (the slide shows through, PPT-B358) or an imported chart draws its own area.
 * The canvas used to keep its white sheet under a No Fill chart and the show
 * to put one under an imported chart's own area.
 */
export function presentationChartHostBackground(
  block: PresentationChartBlock,
  imported: boolean,
): "transparent" | "#ffffff" {
  return imported || presentationChartAreaFillState(block) === "none" ? "transparent" : "#ffffff";
}

// The raster picture an imported chart's frame carries for when the page
// cannot plot it: one reading with the server's ahead-of-print filling.
export { presentationChartFallbackPicture };

export function PresentationChartVisual({
  block: sourceBlock,
  editor = false,
  selected,
  liveSize,
}: {
  block: PresentationChartBlock;
  editor?: boolean;
  /** On the stage: whether the chart is the selected object (PowerPoint's
   * first click selects the chart, the next one an element of it). */
  selected?: boolean;
  /** A resize gesture's live extent (EMU): the chart is laid out again at it. */
  liveSize?: { width: number; height: number };
}) {
  const block = sourceBlock;
  const resizing =
    liveSize !== undefined &&
    (liveSize.width !== sourceBlock.width || liveSize.height !== sourceBlock.height);
  // A data table is laid out inside the chart's picture, the picture on the
  // whole frame (`presentationChartCanvasBlock`, TRIAGE C40), and drawn over
  // it where the picture says (`PresentationChartPlotDataTable`).
  const tabled = useMemo(() => presentationChartDataTableBasis(block) !== null, [block]);
  const canvasBlock = useMemo(
    () => presentationChartCanvasBlock(block, resizing ? liveSize : undefined),
    [block, resizing, liveSize],
  );
  const fallbackAttrs = readPresentationChartV2(block.chartV2);
  const fallbackTitle = fallbackAttrs ? fallbackAttrs.title : block.title;
  const fallbackPicture = presentationChartFallbackPicture(block);
  if (fallbackPicture && !fallbackAttrs) {
    // An imported chart this page cannot plot: the picture PowerPoint saved
    // of it (its frame's mc:Fallback), stretched to the frame as PowerPoint
    // stretches it, instead of an empty frame.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        data-testid="presentation-chart-fallback-picture"
        src={fallbackPicture}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "fill",
          pointerEvents: "none",
          userSelect: "none",
        }}
      />
    );
  }
  return (
    <>
      <PresentationChartCanvas block={canvasBlock} live={resizing} selectable={editor} selected={editor ? selected : undefined}>
        {/* While the one planner's picture is drawn (or when it cannot be),
            the chart's title stands in. Every chart is drawn by that planner
            from its Chart V2 reading; nothing draws a pre-V2 grid. */}
        {fallbackTitle ? (
          <strong
            data-testid={editor ? "presentation-chart-title-shape" : undefined}
            data-office-chart-title-shape="title"
            style={{
              fontSize: 14,
              ...presentationChartAreaStyleCss(fallbackAttrs?.format?.chartTitleStyle),
            }}
          >
            <span style={presentationChartTitleWordsCss(fallbackAttrs?.format?.chartTitleStyle)}>{fallbackTitle}</span>
          </strong>
        ) : null}
      </PresentationChartCanvas>
      {tabled ? <PresentationChartPlotDataTable block={canvasBlock} /> : null}
      {!hasLayoutGeometry(block) && block.caption && !presentationChartHasNativeSource(block) ? (
        <small>{block.caption}</small>
      ) : null}
    </>
  );
}
