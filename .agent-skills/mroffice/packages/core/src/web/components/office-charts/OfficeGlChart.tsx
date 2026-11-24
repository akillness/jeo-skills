"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A 3-D chart (columns, bars, lines, surfaces in 3-D) drawn live with
 * echarts-gl, from the option the server's chart engine planned (`charts.gl`):
 * the browser only draws. The engine answers an option with no functions in
 * it and each point's data label already written (`labels[series][point]`)
 * and tooltip words (`tips`); this component puts them back as lookups.
 *
 * The flat projection picture (`OfficeChartPicture`) is drawn first and stays
 * the stand-in, the offline picture and the failure picture: this canvas is
 * laid over it once it has drawn.
 */

import { useEffect, useRef } from "react";
import type { ChartGlPlan, ChartRenderRequest } from "../../lib/engine-host/charts-types";
import { callEngine, isEngineAbort } from "../../lib/engine-host/client";
import { dispatchOfficeChartHit, officeChartHitOfEvent } from "../../lib/office-charts/chart-hit";
import { installHorizontalBar3DLayout } from "../console/editor/extensions/chartV2HorizontalBar3D";
import { registerChartPrintSnapshot } from "../console/editor/extensions/chartPrintSnapshot";
import type { ChartTextFrame, ChartTextPart } from "../../lib/engine-host/charts-types";
import { CHART_WORDART_TITLE_ID } from "../../lib/office-charts/chart-wordart-title";
import { chartTextFramesSvg } from "../../lib/office-charts/chart-text-svg";
import { installChartTextMarksOnCanvas } from "../../lib/office-charts/chart-letter-spacing";
import { browserSupportsWebGL } from "../../lib/webgl-support";
import { DOUBLE_TAP_MS, DOUBLE_TAP_SLOP_PX, noteDoubleTapAnswered } from "../../lib/double-tap";
import { isTouchLikePointerType } from "../../lib/pointer-capability";

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** The engine's function-free option with the label and tooltip lookups put back. */
export function glOptionWithLookups(gl: ChartGlPlan): Record<string, unknown> {
  const series = Array.isArray(gl.option.series) ? gl.option.series : [];
  return {
    ...gl.option,
    series: series.map((entry, seriesIndex) => {
      if (!record(entry)) return entry;
      const labels = gl.labels[seriesIndex] ?? [];
      const tips = gl.tips?.[seriesIndex];
      return {
        ...entry,
        ...(record(entry.label)
          ? { label: { ...entry.label, formatter: (params: { dataIndex?: number }) => labels[params.dataIndex ?? -1] ?? "" } }
          : {}),
        ...(tips
          ? {
              tooltip: {
                ...(record(entry.tooltip) ? entry.tooltip : {}),
                formatter: (params: { dataIndex?: number }) => {
                  const point = tips.points[params.dataIndex ?? -1];
                  const element = document.createElement("div");
                  element.style.whiteSpace = "pre";
                  element.textContent = point
                    ? `${tips.name.split("​").join("")}\n${point.name ? `${point.name}: ` : ""}${point.value}`
                    : tips.name;
                  return element;
                },
              },
            }
          : {}),
      };
    }),
  };
}

/** The texts a host draws over the canvas: its picture's frames and that picture's size. */
export interface OfficeGlHostTexts {
  texts: Partial<Record<ChartTextPart, ChartTextFrame>> | undefined;
  width: number;
  height: number;
}

/**
 * The option with no words of the texts the host draws over the canvas: the
 * title's (a WordArt title's picture too) and the 3-D axes' names. The host
 * draws the title and the axis titles once, where Office keeps them as flat
 * text boxes of a 3-D chart, and types in them there.
 */
export function glOptionWithoutHostTexts(option: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...option };
  const inkless = (style: unknown): Record<string, unknown> => {
    const own = record(style) ? style : {};
    const rich = record(own.rich)
      ? Object.fromEntries(Object.entries(own.rich).map(([name, entry]) => [name, { ...(record(entry) ? entry : {}), color: "transparent" }]))
      : undefined;
    return { ...own, color: "transparent", textBorderWidth: 0, textShadowBlur: 0, ...(rich ? { rich } : {}) };
  };
  const strip = (title: unknown) => (record(title) ? { ...title, textStyle: inkless(title.textStyle) } : title);
  if (option.title !== undefined) next.title = Array.isArray(option.title) ? option.title.map(strip) : strip(option.title);
  if (Array.isArray(option.graphic))
    next.graphic = option.graphic.filter((entry) => !(record(entry) && entry.id === CHART_WORDART_TITLE_ID));
  for (const key of ["xAxis3D", "yAxis3D", "zAxis3D"]) {
    const axis = option[key];
    if (record(axis)) next[key] = { ...axis, name: "" };
  }
  return next;
}

export function OfficeGlChart({
  content,
  height,
  shell,
  onReady,
  onFailed,
  hostTexts,
  chartSelected,
}: {
  /** The host has the chart selected (`OfficeChartPicture.chartSelected`):
   * the first click on a chart selects it, the next one its element. */
  chartSelected?: boolean;
  /** The chart, as for its picture (no size: the canvas fills its box). */
  content: Omit<ChartRenderRequest, "width" | "height">;
  height: number;
  /** The chart's shell: the print snapshot and title boxes are registered on it. */
  shell: HTMLElement | null;
  onReady: () => void;
  /** No WebGL, no connection, or the engine refused: the flat picture stays. */
  onFailed: () => void;
  /** The texts the host draws over this canvas (its flat picture's frames):
   * the canvas draws none of them, and a print snapshot puts them back. */
  hostTexts?: () => OfficeGlHostTexts | undefined;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ onReady, onFailed, hostTexts, chartSelected });
  latest.current = { onReady, onFailed, hostTexts, chartSelected };
  // Whether the chart was selected when the press of the click began.
  const pressSelected = useRef(true);
  const drawsTexts = !hostTexts;
  const contentKey = JSON.stringify(content);

  useEffect(() => {
    let disposed = false;
    let chart: import("echarts").ECharts | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let unregisterPrint: (() => void) | null = null;
    const controller = new AbortController();
    const mount = async () => {
      if (!browserSupportsWebGL()) throw new Error("chart_webgl_unavailable");
      const answer = await callEngine("charts", "gl", { chart: content }, { signal: controller.signal, cache: true });
      if (!answer.gl) throw new Error("chart_gl_not_needed");
      const echarts = await import("echarts");
      await import("echarts-gl");
      installHorizontalBar3DLayout(echarts);
      const planned = glOptionWithLookups(answer.gl);
      const option = drawsTexts ? planned : glOptionWithoutHostTexts(planned);
      // A WordArt title is an SVG picture: decoded before the chart draws, so
      // the first print snapshot has it.
      if (Array.isArray(option.graphic)) {
        option.graphic = await Promise.all(option.graphic.map(async (graphic: Record<string, unknown>) => {
          const style = record(graphic.style) ? graphic.style : undefined;
          if (graphic.id !== "docs-wordart-title" || typeof style?.image !== "string" || !style.image.startsWith("data:image/svg+xml;")) return graphic;
          const image = new Image();
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("chart_title_image_timeout")), 10000);
            image.onload = () => { clearTimeout(timeout); resolve(); };
            image.onerror = () => { clearTimeout(timeout); reject(new Error("chart_title_image_failed")); };
            image.src = style.image as string;
          });
          return { ...graphic, style: { ...style, image } };
        }));
      }
      if (disposed || !hostRef.current) return;
      // The labels' Character Spacing and capitals (`chart-letter-spacing`).
      installChartTextMarksOnCanvas();
      chart = echarts.init(hostRef.current, undefined, { renderer: "canvas" });
      chart.setOption(option, { notMerge: true, lazyUpdate: false });
      if (shell) {
        unregisterPrint = registerChartPrintSnapshot(shell, () => {
          const pixels = chart!.getDataURL({
            type: "png",
            pixelRatio: 2,
            ...(answer.gl!.option.backgroundColor === undefined ? { backgroundColor: "#ffffff" } : {}),
          });
          // The texts the host draws over the canvas go back in.
          const over = latest.current.hostTexts?.();
          const words = chartTextFramesSvg(over?.texts);
          if (!over || !words) return pixels;
          const { width: w, height: h } = over;
          const svg =
            `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
            `<image href="${pixels}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none"/>${words}</svg>`;
          return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        });
      }
      // A finger's double tap opens as a double-click does: the canvas sees
      // two taps (an iPad does not dependably send dblclick), and a host's own
      // double-tap step dispatches its double-click outside the canvas.
      let lastTap: { at: number; x: number; y: number } | null = null;
      const isSecondTap = (params: unknown): boolean => {
        const native = (params as { event?: { event?: Event } } | null)?.event?.event;
        if (!native) return false;
        const touch = typeof TouchEvent !== "undefined" && native instanceof TouchEvent
          ? native.changedTouches[0] ?? null
          : null;
        const pointerType = (native as { pointerType?: string }).pointerType;
        if (!touch && !isTouchLikePointerType(pointerType)) return false;
        const point = touch ?? (native as MouseEvent);
        const at = performance.now();
        const pair = lastTap !== null && at - lastTap.at <= DOUBLE_TAP_MS &&
          Math.hypot(point.clientX - lastTap.x, point.clientY - lastTap.y) <= DOUBLE_TAP_SLOP_PX;
        lastTap = pair ? null : { at, x: point.clientX, y: point.clientY };
        if (pair) noteDoubleTapAnswered();
        return pair;
      };
      for (const [name, open] of [["click", false], ["dblclick", true]] as const) {
        chart.on(name, (params: unknown) => {
          const opens = open || isSecondTap(params);
          if (!opens && !pressSelected.current) return;
          const hit = officeChartHitOfEvent(params);
          if (hit && hostRef.current) dispatchOfficeChartHit(hostRef.current, hit, opens);
        });
      }
      resizeObserver = new ResizeObserver(() => chart?.resize());
      resizeObserver.observe(hostRef.current);
      latest.current.onReady();
    };
    mount().catch((error: unknown) => {
      if (disposed || isEngineAbort(error)) return;
      latest.current.onFailed();
    });
    return () => {
      disposed = true;
      controller.abort();
      resizeObserver?.disconnect();
      unregisterPrint?.();
      chart?.dispose();
    };
    // `contentKey` is the identity of `content`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey, shell, drawsTexts]);

  return (
    <div
      ref={hostRef}
      data-chart-gl-host="true"
      onPointerDownCapture={() => {
        pressSelected.current = latest.current.chartSelected !== false;
      }}
      style={{ position: "absolute", inset: 0, height }}
    />
  );
}
