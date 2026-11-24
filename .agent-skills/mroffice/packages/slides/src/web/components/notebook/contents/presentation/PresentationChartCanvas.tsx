"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { PresentationPageIdContext } from "./PresentationMediaContent";
import { readPresentationChartV2 } from "@mrnote/core/web/lib/presentation-chart-v2.ts";
import { officeChartAreaPart, type OfficeChartPicturePart } from "@mrnote/core/web/lib/office-charts/chart-hit.ts";
import { chartTakesElementLayout } from "@mrnote/core/web/lib/office-charts/chart-element-layout.ts";
import { useOfficeChartSelectedArea } from "@mrnote/core/web/lib/office-charts/chart-selection-store.ts";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { PresentationChartBlock } from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import { presentationBuiltInStyleLook, type PresentationChartDisplay } from "@mrnote/core/web/lib/presentation-chart-display.ts";
import ChartBlockV2Canvas from "@mrnote/docs/web/components/console/editor/extensions/ChartBlockV2Canvas.tsx";
import { captureChartPrintSnapshot } from "@mrnote/core/web/components/console/editor/extensions/chartPrintSnapshot.ts";
import { readPresentationChartRenderAttrs } from "@mrnote/core/web/lib/presentation-native-chart-view.ts";
import { presentationChartAreaStyleCssWithoutLine } from "@mrnote/core/web/lib/presentation-chart-area-style.ts";
import { OfficeChartAreaOutline } from "@mrnote/core/web/components/office-charts/OfficeChartAreaOutline.tsx";
import { presentationChartDisplayedBlock, presentationChartPictureRequest } from "../../../../lib/presentation/chart-picture-request";
import { officeThemeFontStack } from "@mrnote/core/web/lib/office-theme-fonts.ts";
import type { ChartRenderPicture, ChartRenderRequest } from "@mrnote/core/web/lib/engine-host/charts-types.ts";
import { ChartPictureRefusedError } from "@mrnote/core/web/lib/office-charts/chart-picture-client.ts";
import { chartLeafNeedsWebGL } from "@mrnote/core/web/lib/office-charts/catalog.ts";
import { composeNativePie3dSvg, renderNativePie3d, type NativePie3dScene } from "../../../../lib/presentation-native-pie3d-raster";
import {
  OfficeChartPicture,
  type OfficeChartPictureFinish,
} from "@mrnote/core/web/components/office-charts/OfficeChartPicture.tsx";

/**
 * A browser keeps only a handful of live WebGL contexts — Chrome drops the
 * oldest past about sixteen and leaves that canvas white — and a 3-D chart is
 * drawn by one. A deck with several of them shows each chart on more than one
 * surface at once (the stage, every rail tile, a sorter cell), so mounting a
 * context per surface loses the race and paints thumbnails blank.
 *
 * So the live ones are budgeted. A host that loses its place keeps the PNG the
 * live chart just produced — the chart itself, not a stand-in — and gives its
 * context back. Editing-sized hosts outrank miniatures, and among equals the
 * one seen least recently parks first.
 */
const MAX_LIVE_GL_CHARTS = 6;
/** A host at least this wide is an editing surface, not a miniature. */
const LIVE_GL_HOST_PX = 320;

interface LiveGlChart {
  park: () => boolean;
  rank: () => number;
}

const liveGlCharts = new Set<LiveGlChart>();

function admitGlChart(entry: LiveGlChart): () => void {
  liveGlCharts.add(entry);
  // Park the weakest until the budget holds. A chart that cannot produce its
  // picture yet keeps its context: a blank tile is what this exists to avoid.
  let guard = liveGlCharts.size;
  while (liveGlCharts.size > MAX_LIVE_GL_CHARTS && guard-- > 0) {
    const weakest = [...liveGlCharts]
      .filter((candidate) => candidate !== entry)
      .sort((left, right) => left.rank() - right.rank())[0];
    if (!weakest || !weakest.park()) break;
    liveGlCharts.delete(weakest);
  }
  return () => liveGlCharts.delete(entry);
}

function CanonicalThreeDimensionalChart({
  block,
  selectedPart = null,
  textEditKey = null,
  selected,
}: {
  block: PresentationChartBlock;
  /** The chart element Current Selection names, framed on the picture. */
  selectedPart?: OfficeChartPicturePart | null;
  /** The stage's key for this chart: its titles are typed in place under it. */
  textEditKey?: string | null;
  /** The stage has the chart selected (`OfficeChartPicture.chartSelected`). */
  selected?: boolean;
}) {
  const t = useTranslations("console-notebooks");
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const width = Math.max(
    1,
    (typeof block.width === "number" ? block.width : 5_486_400) / 9525,
  );
  const height = Math.max(
    1,
    (typeof block.height === "number" ? block.height : 3_127_200) / 9525,
  );
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    // The LAYOUT box, never the screen rectangle. Every surface that shows a
    // slide smaller than life — a rail miniature, a sorter cell, the
    // fit-to-window canvas, a zoomed-out desk — does it with a CSS transform
    // above this host, which leaves `clientWidth` alone and shrinks
    // `getBoundingClientRect()`. Scaling by the screen rectangle applied each
    // of those shrinks a second time, so a 3-D chart drew at a tenth of its
    // box in the 120px rail tile and overflowed a zoomed-in canvas. The
    // slide projection measures itself the same way, for the same reason.
    const resize = () => {
      const measured = host.clientWidth / width;
      // A host with no box yet (mounted hidden, or measured before its first
      // layout) keeps the last good scale; the observer re-measures when a
      // real box arrives instead of collapsing the chart to nothing.
      if (measured > 0) setScale(measured);
    };
    resize();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(host);
    return () => observer?.disconnect();
  }, [width]);
  // The picture this host keeps once its WebGL context goes to another surface.
  const [parked, setParked] = useState<string | null>(null);
  const seenAt = useRef(0);
  useEffect(() => {
    const host = ref.current;
    if (!host || parked !== null) return;
    seenAt.current = Date.now();
    const entry: LiveGlChart = {
      park: () => {
        const shell = host.querySelector<HTMLElement>(
          '[data-testid="chart-block-v2-canvas"]',
        );
        const picture = shell ? captureChartPrintSnapshot(shell) : null;
        if (!picture) return false;
        setParked(picture);
        return true;
      },
      // An editing-sized host outranks every miniature, whenever each was seen.
      rank: () =>
        (host.clientWidth >= LIVE_GL_HOST_PX ? Number.MAX_SAFE_INTEGER / 2 : 0) +
        seenAt.current,
    };
    const release = admitGlChart(entry);
    if (typeof IntersectionObserver === "undefined") return release;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const seen of entries) {
          if (seen.isIntersecting) seenAt.current = Date.now();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(host);
    return () => {
      observer.disconnect();
      release();
    };
  }, [parked]);
  const attrs = readPresentationChartRenderAttrs(block);
  const themeAccents = useContext(PresentationChartThemeAccentsContext);
  // The face its words are drawn in, as the flat picture's: the chart's own
  // theme override (`source.chartThemeFace`), else the deck's body face.
  const deckFace = useContext(PresentationChartThemeFontContext);
  const ownFace = (block as { source?: { chartThemeFace?: unknown } }).source?.chartThemeFace;
  const themeFontFamily =
    typeof ownFace === "string" && ownFace ? officeThemeFontStack({ latin: ownFace, ea: "", scripts: {} }) : deckFace;
  return (
    <div
      ref={ref}
      style={{ width: "100%", height: "100%", overflow: "hidden" }}
      data-chart-gl-state={parked === null ? "live" : "parked"}
    >
      {parked !== null ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={parked}
          alt=""
          draggable={false}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: "contain",
            pointerEvents: "none",
          }}
        />
      ) : attrs ? (
        <div
          style={{
            width,
            height,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            pointerEvents: "none",
          }}
        >
          <ChartBlockV2Canvas
            attrs={attrs}
            themeAccents={themeAccents}
            themeFontFamily={themeFontFamily}
            heightPx={height}
            selectedPart={selectedPart}
            textEditKey={textEditKey}
            placeable={Boolean(textEditKey) && chartTakesElementLayout(attrs.chartType)}
            chartSelected={selected}
            elementTips={selected}
            labels={{
              loading: t("block.chart.v2.loading"),
              renderError: t("block.chart.v2.renderError"),
              threeDimensionalProjection: t("charts.picture.projection"),
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

const DisplayContext = createContext<
  Record<string, PresentationChartDisplay> | undefined
>(undefined);
export const PresentationChartDisplayProvider = DisplayContext.Provider;

/**
 * The deck theme's accents (accent1..accent6), which a chart's Change Colors
 * palette resolves against, as PowerPoint resolves a chart's `schemeClr`
 * against the presentation's theme. The editor provides it.
 */
export const PresentationChartThemeAccentsContext = createContext<
  readonly string[] | undefined
>(undefined);

/**
 * The deck's body face (its theme's minor Latin font, a CSS font stack): the
 * face a chart's text that names none is drawn in, as PowerPoint draws it.
 * The editor provides it.
 */
export const PresentationChartThemeFontContext = createContext<string | undefined>(undefined);

// What the engine draws a deck chart from: one function with the server's
// ahead-of-print filling (`lib/presentation/deck-chart-requests`).
export { presentationChartPictureRequest };

/**
 * A deck chart as it is drawn: the block with the editor's overrides and the
 * native appearance recovered for it (`PresentationChartDisplayProvider`),
 * and its picture request. The data table beside the chart reads the same
 * drawing's series colours through the content key.
 */
export function usePresentationChartPicture(
  sourceBlock: PresentationChartBlock,
  {
    recoveredDisplay,
    showLegend,
    showAxisLabels,
    chartStyle,
  }: {
    recoveredDisplay?: PresentationChartDisplay;
    showLegend?: boolean;
    showAxisLabels?: boolean;
    chartStyle?: number;
  } = {},
): { block: PresentationChartBlock; request: ChartRenderRequest; contentKey: string } {
  const displays = useContext(DisplayContext);
  const inheritedDisplay =
    displays?.[
      [sourceBlock.source?.slideId, sourceBlock.source?.shapeId].join(":")
    ];
  const block = useMemo<PresentationChartBlock>(
    () =>
      presentationChartDisplayedBlock(sourceBlock, {
        recoveredDisplay,
        inheritedDisplay,
        showLegend,
        showAxisLabels,
        chartStyle,
      }),
    [
      sourceBlock,
      recoveredDisplay,
      inheritedDisplay,
      showLegend,
      showAxisLabels,
      chartStyle,
    ],
  );
  const themeAccents = useContext(PresentationChartThemeAccentsContext);
  const themeFont = useContext(PresentationChartThemeFontContext);
  const picture = useMemo(
    () => presentationChartPictureRequest(block, themeAccents, undefined, themeFont),
    [block, themeAccents, themeFont],
  );
  return { block, ...picture };
}

/** The deck's native 3-D pie: the engine returns its scene, the browser
 * rasters it over the picture (a per-pixel drawing, kept local). */
function nativePie3dFinish(block: PresentationChartBlock): OfficeChartPictureFinish {
  return async (markup, picture, signal) => {
    const scene = picture.pie3d as NativePie3dScene | undefined;
    if (!scene) return markup;
    const fingerprint = (block.source?.nativeChartView as { chartFingerprint?: unknown } | undefined)?.chartFingerprint;
    if (scene.fingerprint !== fingerprint) throw Error("native_pie3d_source_identity");
    const raster = await renderNativePie3d(scene, signal);
    signal.throwIfAborted();
    return composeNativePie3dSvg(markup, scene, raster);
  };
}

/**
 * A deck chart: the server's picture, shared by the editor, rail, sorter and
 * slide show (no chart instance and no planner in the browser). A chart that
 * needs WebGL (the engine answers its flat projection) is drawn live by the
 * 3-D canvas instead.
 */
export function PresentationChartCanvas({
  block: sourceBlock,
  recoveredDisplay,
  showLegend,
  showAxisLabels,
  chartStyle,
  live = false,
  selectable = false,
  selected,
  selectionKey = null,
  children,
}: {
  block: PresentationChartBlock;
  /** On the stage: whether the chart is the selected object. PowerPoint's
   * first click on a chart selects it, the next one an element of it; a
   * selected chart names its elements on hover. */
  selected?: boolean;
  /** On the editor's canvas: the picture frames the element Current
   * Selection names (a slide thumbnail or the show draws no frame). */
  selectable?: boolean;
  /** The host's key for this chart's selected element (`chart-selection-store`),
   * else the deck's own by page and block. */
  selectionKey?: string | null;
  recoveredDisplay?: PresentationChartDisplay;
  showLegend?: boolean;
  showAxisLabels?: boolean;
  chartStyle?: number;
  /** The block's size is a resize gesture's live preview: the picture drawn
   * for the last committed size stands in, unstretched, and the release
   * draws the final size once (no request per pointer move). */
  live?: boolean;
  children?: ReactNode;
}) {
  // The deck keys a chart's selected element by page and block (the window's
  // `deckChartSelectionKey`); a host may hand another key.
  const pageId = useContext(PresentationPageIdContext);
  const chartKey = selectable ? (selectionKey ?? (pageId ? `deck:${pageId}:${sourceBlock.id}` : null)) : null;
  const selectedArea = useOfficeChartSelectedArea(chartKey);
  const { block, request, contentKey } = usePresentationChartPicture(sourceBlock, {
    recoveredDisplay,
    showLegend,
    showAxisLabels,
    chartStyle,
  });
  // The engine says a chart needs WebGL by answering its flat projection
  // (or refusing one that has none): that chart is drawn live.
  const [glContent, setGlContent] = useState<string>();
  // Known from the chart's own model before any answer (the 3-D columns,
  // bars, lines and surfaces), or said by the engine's answer.
  const renderAttrs = useMemo(() => {
    try {
      return readPresentationChartRenderAttrs(block);
    } catch {
      return null;
    }
  }, [block]);
  const needsGL =
    glContent === contentKey ||
    Boolean(renderAttrs && chartLeafNeedsWebGL(renderAttrs.chartType, renderAttrs.chartSubtype));
  const onPicture = useCallback(
    (picture: ChartRenderPicture) => {
      if (picture.flattened) setGlContent(contentKey);
    },
    [contentKey],
  );
  const onError = useCallback(
    (error: unknown) => {
      if (error instanceof ChartPictureRefusedError && error.code === "chart_render_requires_gl")
        setGlContent(contentKey);
    },
    [contentKey],
  );
  const finish = useMemo(() => nativePie3dFinish(block), [block]);
  const chartAreaFrameCss = useMemo(() => {
    const stated = renderAttrs?.format?.chartAreaStyle as { outline?: unknown } | undefined;
    // A chart in built-in style 33-40 that states no line of its own: the
    // style's grey frame round its chart area (`presentationBuiltInStyleLook`).
    const styleFrame =
      renderAttrs && stated?.outline === undefined ? presentationBuiltInStyleLook(block, renderAttrs)?.chartArea : undefined;
    const areaStyle = styleFrame?.outline
      ? { ...(stated ?? {}), outline: styleFrame.outline, shapePaint: { outlineWidthPt: styleFrame.outlineWidthPt ?? 0.75 } }
      : renderAttrs?.format?.chartAreaStyle;
    const css = presentationChartAreaStyleCssWithoutLine(areaStyle) as Record<string, unknown>;
    return {
      // The frame's line is drawn as Office draws it, centred on the edge at
      // its exact width (`OfficeChartAreaOutline`), not as a CSS border.
      areaStyle,
      css: Object.fromEntries(Object.entries(css).filter(([key]) => /^boxShadow/.test(key))) as CSSProperties,
    };
  }, [block, renderAttrs]);
  if (needsGL) {
    return (
      <div
        data-testid="presentation-chart-display"
        data-chart-render-status="ready"
        style={{ height: "100%", width: "100%", flex: "1 1 0%", position: "relative", minHeight: sourceBlock.height ? 0 : 240 }}
      >
        <CanonicalThreeDimensionalChart
          block={block}
          selectedPart={officeChartAreaPart(
            { chartType: readPresentationChartV2(block.chartV2)?.chartType ?? "column" },
            selectedArea,
          )}
          textEditKey={chartKey}
          selected={selected}
        />
      </div>
    );
  }
  return (
    <OfficeChartPicture
      request={request}
      contentKey={contentKey}
      live={live}
      selectedPart={officeChartAreaPart(
        { chartType: readPresentationChartV2(block.chartV2)?.chartType ?? "column" },
        selectedArea,
      )}
      label={block.title || "Chart"}
      testId="presentation-chart-display"
      noticeTestId="presentation-chart-stale-notice"
      pictureAttributes={{ "data-presentation-chart-engine": "shared-echarts-svg" }}
      finish={finish}
      onPicture={onPicture}
      onError={onError}
      // A right click on a series opens that series' menu (PPT-C011).
      contextMenuHits
      // Its title and axis titles are typed in place on the stage (never on
      // a rail tile or in the sorter, which are not selectable), and its
      // elements dragged by hand there.
      textEditKey={chartKey}
      placeable={Boolean(chartKey) && chartTakesElementLayout(renderAttrs?.chartType ?? "")}
      chartSelected={selected}
      elementTips={selected}
      chartType={renderAttrs?.chartType}
      style={{
        minHeight: sourceBlock.height ? 0 : 240,
        // The chart area's outline and effect, around the whole chart as
        // Docs' canvas draws them (its fill is the picture's own). The 3-D
        // canvas draws them itself (PPT-B307).
        ...chartAreaFrameCss.css,
      }}
      overlay={<OfficeChartAreaOutline chartAreaStyle={chartAreaFrameCss.areaStyle} />}
    >
      {children}
    </OfficeChartPicture>
  );
}
