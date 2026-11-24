"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { EditorLoadingState } from "@mrnote/core/web/components/ui/editor-loading-state.tsx";
import type { OfficeChartPicturePart } from "@mrnote/core/web/lib/office-charts/chart-hit.ts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ChartBlockAttrsV2 } from "@mrnote/core/web/components/console/editor/extensions/chartBlockShared.ts";
import { registerChartPrintSnapshot } from "@mrnote/core/web/components/console/editor/extensions/chartPrintSnapshot.ts";
import { presentationChartAreaStyleCss } from "@mrnote/core/web/lib/presentation-chart-area-style.ts";
import type { ChartNativeLook } from "@mrnote/core/web/lib/office-chart-native-look.ts";
import { EngineRefusedError } from "@mrnote/core/web/lib/engine-host/client.ts";
import type { ChartRenderPicture, ChartRenderRequest } from "@mrnote/core/web/lib/engine-host/charts-types.ts";
import { ChartPictureRefusedError } from "@mrnote/core/web/lib/office-charts/chart-picture-client.ts";
import { documentChartPictureContent } from "@mrnote/core/web/lib/office-charts/document-chart-picture.ts";
import { chartLeafNeedsWebGL } from "@mrnote/core/web/lib/office-charts/catalog.ts";
import { OfficeChartPicture } from "@mrnote/core/web/components/office-charts/OfficeChartPicture.tsx";
import { chartPictureSvgWithTexts } from "@mrnote/core/web/lib/office-charts/chart-text-svg.ts";
import { OfficeGlChart } from "@mrnote/core/web/components/office-charts/OfficeGlChart.tsx";

export interface ChartBlockV2CanvasLabels {
  loading: string;
  renderError: string;
  threeDimensionalProjection: string;
  /** The catalogue word for a Pie of Pie's combined slice ("Other"). */
  otherSlice?: string;
}

export interface ChartBlockV2CanvasProps {
  attrs: ChartBlockAttrsV2;
  /** The chart element Current Selection names, framed on the picture. */
  selectedPart?: OfficeChartPicturePart | null;
  labels: ChartBlockV2CanvasLabels;
  heightPx?: number;
  /** The width the host gives the chart, px; else the measured box. */
  widthPx?: number;
  /** The look an imported Office 2016 chart's style parts give it; drawn under the attrs. */
  nativeLook?: ChartNativeLook;
  /** The reader's language, for names Office leaves to it. */
  locale?: string;
  /** The host document's theme accents, for a Change Colors palette. */
  themeAccents?: readonly string[];
  /** The format the chart's sheet gives its values (Linked to source). */
  linkedValueNumberFormat?: string;
  /** The host document's body face, for text that names none. */
  themeFontFamily?: string;
  /** The host's key for this chart: its title and axis titles are typed in
   * place under it (`beginOfficeChartTextEdit`); absent, never typed in. */
  textEditKey?: string | null;
  /** Its selected element may be dragged (sized) by hand (`OFFICE_CHART_PLACE_EVENT`). */
  placeable?: boolean;
  /** The host has the chart selected: a click then selects the element under
   * it (Office's first click selects the chart). Absent: every click does. */
  chartSelected?: boolean;
  /** Office's chart tips: the element under the pointer named by it. */
  elementTips?: boolean;
  /** A right click names the series it lands on (`OfficeChartPicture`), so
   * the host's chart menu offers that element's own rows. */
  contextMenuHits?: boolean;
}

/** A width while none was measured (a hidden host, a test without layout). */
const FALLBACK_WIDTH_PX = 576;
/** A box that keeps changing (a column resize, a window drag) is drawn once it settles. */
const SETTLE_MS = 150;

/**
 * A Docs chart (and a deck chart that needs WebGL): the server's picture of
 * it at the size it is laid out at, hit-tested and with tooltips from the
 * engine's per-point words. A 3-D chart is then drawn live by echarts-gl from
 * the engine's plan, over its flat projection. No planner runs here.
 */
export default function ChartBlockV2Canvas({
  selectedPart = null,
  attrs,
  labels,
  heightPx,
  widthPx,
  nativeLook,
  locale,
  themeAccents,
  linkedValueNumberFormat,
  themeFontFamily,
  textEditKey = null,
  placeable = false,
  chartSelected,
  elementTips,
  contextMenuHits = false,
}: ChartBlockV2CanvasProps) {
  const height = heightPx ?? 300;
  const shellRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [shell, setShell] = useState<HTMLDivElement | null>(null);
  const [measured, setMeasured] = useState<number | null>(null);
  const [settling, setSettling] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [renderMode, setRenderMode] = useState<"native" | "projection">("native");
  const [glContent, setGlContent] = useState<string | null>(null);
  const [glReadyKey, setGlReadyKey] = useState<string | null>(null);

  useEffect(() => setShell(shellRef.current), []);
  // The width the chart is laid out at: a change is drawn once it settles,
  // the last picture standing in meanwhile.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const measure = () => {
      const width = Math.round(host.clientWidth);
      if (width <= 0) return;
      setMeasured((previous) => {
        if (previous === width) return previous;
        if (previous !== null) {
          setSettling(true);
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => setSettling(false), SETTLE_MS);
        }
        return width;
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, []);

  const { content, contentKey } = useMemo(
    () =>
      documentChartPictureContent({
        attrs,
        nativeLook,
        locale,
        themeAccents,
        linkedValueNumberFormat,
        otherSliceLabel: labels.otherSlice,
        themeFontFamily,
      }),
    [attrs, nativeLook, locale, themeAccents, linkedValueNumberFormat, labels.otherSlice, themeFontFamily],
  );
  const width = measured ?? widthPx ?? FALLBACK_WIDTH_PX;
  const request = useMemo<ChartRenderRequest>(() => ({ ...content, width, height }), [content, width, height]);
  // Known from the model (3-D columns, bars and lines) or said by
  // the engine: the live 3-D canvas starts beside the flat picture.
  const needsGL = glContent === contentKey || chartLeafNeedsWebGL(attrs.chartType, attrs.chartSubtype);
  const glReady = glReadyKey === contentKey;

  // The picture shown: its texts go back into a print snapshot.
  const shownPictureRef = useRef<ChartRenderPicture | null>(null);
  const onPicture = useCallback(
    (picture: ChartRenderPicture) => {
      shownPictureRef.current = picture;
      setRenderMode(picture.renderMode);
      setErrorMessage("");
      setStatus("ready");
      if (picture.flattened) setGlContent(contentKey);
    },
    [contentKey],
  );
  const onError = useCallback(
    (error: unknown) => {
      if (error instanceof ChartPictureRefusedError && error.code === "chart_render_requires_gl") {
        setGlContent(contentKey);
        return;
      }
      if (error instanceof ChartPictureRefusedError || error instanceof EngineRefusedError) {
        setErrorMessage(error instanceof ChartPictureRefusedError ? error.code : error.reason);
        setStatus("error");
      }
      // Offline / busy: the last picture (or the loading state) stays.
    },
    [contentKey],
  );

  // The print path takes the picture as it is drawn (a live 3-D canvas
  // registers its own pixels instead).
  useEffect(() => {
    if (!shell || (needsGL && glReady)) return;
    return registerChartPrintSnapshot(shell, () => {
      const svg = hostRef.current?.querySelector('[role="img"] svg');
      // The words the editor draws (title, axis titles) go back in.
      return svg instanceof SVGSVGElement
        ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(chartPictureSvgWithTexts(svg, shownPictureRef.current?.texts))}`
        : "";
    });
  }, [shell, needsGL, glReady]);

  return (
    <div
      ref={shellRef}
      className="chart-block-v2__canvas-shell"
      data-testid="chart-block-v2-canvas"
      data-chart-family={attrs.chartType}
      data-chart-subtype={attrs.chartSubtype}
      data-chart-render-mode={renderMode}
      data-chart-render-status={status}
      data-chart-print-source="echarts"
      style={{
        position: "relative",
        minHeight: height,
        // A Word part in the built-in look that states no chart area paint:
        // Word frames it in grey (`documentChartPlanInputs`).
        ...(nativeLook?.builtInText && nativeLook.chartArea?.outline && attrs.format?.chartAreaStyle === undefined
          ? { boxSizing: "border-box" as const, border: `1px solid ${nativeLook.chartArea.outline}` }
          : {}),
        ...presentationChartAreaStyleCss(attrs.format?.chartAreaStyle),
        // Format Chart Area ▸ Border ▸ Rounded corners.
        ...(attrs.format?.roundedCorners ? { borderRadius: 10, overflow: "hidden" } : {}),
      }}
    >
      <div
        ref={hostRef}
        data-chart-canvas-host="true"
        style={{ width: "100%", height, position: "relative" }}
      >
        <div data-chart-flat-covered={needsGL && glReady ? "true" : undefined} style={{ height: "100%" }}>
          <OfficeChartPicture
            request={request}
            contentKey={contentKey}
            live={settling}
            following={settling}
            selectedPart={selectedPart}
            textEditKey={textEditKey}
            placeable={placeable}
            chartSelected={chartSelected}
            elementTips={elementTips}
            contextMenuHits={contextMenuHits}
            chartType={attrs.chartType}
            label={attrs.title || attrs.chartType}
            testId="chart-block-v2-picture"
            tooltips
            onPicture={onPicture}
            onError={onError}
          />
        </div>
        {needsGL ? (
          <OfficeGlChart
            content={content}
            chartSelected={chartSelected}
            height={height}
            shell={shell}
            // The flat picture's layer draws the title and the axis titles
            // over the 3-D canvas (once, typed in place there).
            hostTexts={() => {
              const picture = shownPictureRef.current;
              return picture?.texts ? { texts: picture.texts, width: picture.width, height: picture.height } : undefined;
            }}
            onReady={() => setGlReadyKey(contentKey)}
            onFailed={() => setGlReadyKey(null)}
          />
        ) : null}
      </div>
      {status === "loading" ? (
        <div
          data-testid="chart-block-v2-loading"
          role="status"
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            color: "#64748b",
            pointerEvents: "none",
          }}
        >
          <EditorLoadingState
            kind="dashboard"
            compact
            label={labels.loading}
            announce={false}
          />
        </div>
      ) : null}
      {status === "error" ? (
        <div
          data-testid="chart-block-v2-render-error"
          data-chart-error-code={errorMessage || undefined}
          role="alert"
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            padding: 20,
            color: "#b91c1c",
            textAlign: "center",
          }}
        >
          <span>{labels.renderError}</span>
        </div>
      ) : null}
      {status === "ready" && renderMode === "projection" ? (
        <p
          data-testid="chart-block-v2-projection-notice"
          style={{
            margin: "4px 0 0",
            color: "#92400e",
            fontSize: 12,
            textAlign: "center",
          }}
        >
          {labels.threeDimensionalProjection}
        </p>
      ) : null}
    </div>
  );
}
