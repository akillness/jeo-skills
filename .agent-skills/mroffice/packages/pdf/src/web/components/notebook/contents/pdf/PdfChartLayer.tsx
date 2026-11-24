"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * 图表 on a PDF page: the page's charts made in MRAI (managed-chart.ts). A
 * chart shows the chart engine's picture of its model at its frame's size
 * (the one planner every editor draws with), and that picture is what the
 * native writer draws in vector; a frame sized anew asks for a new picture.
 * The page's revision paints a saved chart: the layer keeps only its hit
 * target until it is selected, as the table layer does.
 *
 * Click selects (the frame, the move grip, the size handle); Delete takes
 * a selected chart out; Esc or a press elsewhere ends the selection.
 */
import { pdfAnnotationSlotStyle } from "../../../../lib/pdf/annotation-stack-order";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { requestChartPicture } from "@mrnote/core/web/lib/office-charts/chart-picture-client.ts";
import { managedNativeChartDirective, pdfChartPictureSize, type PdfChart } from "../../../../lib/pdf/managed-chart";

import { PdfSmartArtPicture } from "./PdfSmartArtPicture";

export interface PdfChartLayerProps {
  readonly charts: readonly PdfChart[];
  readonly cssWidth: number;
  readonly cssHeight: number;
  /** The page's size in points (the picture is drawn at 100 %). */
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly paintedDirectives: ReadonlyMap<string, string>;
  /** The accents the charts are painted against (an AI generated page's
   * theme, pdfChartThemeAccents); Office's default theme when empty. */
  readonly themeAccents?: readonly string[];
  /** Charts the file itself draws that the page has no row for (read back
   * from an exported PDF): drawn by the file until selected, their pictures
   * kept here and not written until the chart changes. */
  readonly fileDrawnIds?: ReadonlySet<string>;
  readonly writable: boolean;
  readonly selectedId: string | null;
  readonly onSelectionChange: (id: string | null) => void;
  readonly onChange: (chart: PdfChart) => void;
  readonly onDelete: (chart: PdfChart) => void;
  /** A gallery's hovered pick (or the data window's typing), drawn on its
   * chart until it goes. */
  readonly preview?: { readonly id: string; readonly attrs: unknown } | null;
  /** Each object's place in the page's stack of annotations the reader
   * draws itself (lib/pdf/annotation-stack-order.ts), back first: the slot
   * is stacked at it, so the screen keeps the page's /Annots order. */
  readonly stackRanks?: ReadonlyMap<string, number>;
  readonly t: (key: string, values?: Record<string, string | number>) => string;
}

/** The size a picture was drawn at (its root's width and height). */
function pictureSize(svg: string | null): { width: number; height: number } | null {
  if (!svg) return null;
  const width = /<svg[^>]*\swidth="([0-9.]+)"/.exec(svg)?.[1];
  const height = /<svg[^>]*\sheight="([0-9.]+)"/.exec(svg)?.[1];
  return width && height ? { width: Math.round(Number(width)), height: Math.round(Number(height)) } : null;
}

export function PdfChartLayer({
  charts, cssWidth, cssHeight, pageWidth, pageHeight, paintedDirectives, themeAccents, fileDrawnIds, writable, selectedId,
  onSelectionChange, onChange, onDelete, preview = null, t, stackRanks,
}: PdfChartLayerProps) {
  // Pictures of the charts the file draws, kept here: a chart only read back
  // is never written.
  const [filePictures, setFilePictures] = useState<ReadonlyMap<string, string>>(() => new Map());
  const accents = themeAccents?.length ? { themeAccents: [...themeAccents] } : {};
  const accentsKey = JSON.stringify(themeAccents ?? []);
  const [drag, setDrag] = useState<{ id: string; kind: "move" | "size"; dx: number; dy: number; startX: number; startY: number } | null>(null);
  // Pictures that could not be drawn, by what was asked (a chart changed
  // since is asked for again).
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const requestKey = (chart: PdfChart, size: { width: number; height: number }) =>
    `${chart.id}:${size.width}x${size.height}:${JSON.stringify(chart.attrs)}`;
  // A chart's last picture, shown while its next one is drawn (a new type,
  // new data, a new size) rather than an empty frame.
  const lastPictures = useRef(new Map<string, string>());
  for (const chart of charts) if (chart.svg) lastPictures.current.set(chart.id, chart.svg);
  const [previewPicture, setPreviewPicture] = useState<{ key: string; svg: string } | null>(null);
  const previewChart = preview ? charts.find((chart) => chart.id === preview.id) ?? null : null;
  // (A SmartArt's preview is painted from its model, below.)
  const previewKey = preview && previewChart && previewChart.kind !== "smartart"
    ? `${preview.id}:${JSON.stringify(pdfChartPictureSize(previewChart, pageWidth, pageHeight))}:${JSON.stringify(preview.attrs)}` : null;
  useEffect(() => {
    if (!preview || !previewChart || !previewKey) return;
    const controller = new AbortController();
    const size = pdfChartPictureSize(previewChart, pageWidth, pageHeight);
    // Hovering along a gallery asks for the tile it rests on.
    const timer = window.setTimeout(() => {
      void requestChartPicture({ attrs: preview.attrs as PdfChart["attrs"], width: size.width, height: size.height, includeTitle: true, ...accents },
        { signal: controller.signal })
        .then((picture) => { if (!controller.signal.aborted) setPreviewPicture({ key: previewKey, svg: picture.svg }); })
        .catch(() => {});
    }, 120);
    return () => { window.clearTimeout(timer); controller.abort(); };
    // The key names the preview, its chart's size and its model.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);

  // Each chart's picture at its frame's size: asked for when it has none, or
  // one of another size (a frame sized anew), and kept with the chart.
  useEffect(() => {
    if (!writable) return;
    const controller = new AbortController();
    for (const chart of charts) {
      // A SmartArt's picture is painted here, from its model (below).
      if (chart.kind === "smartart") continue;
      const local = fileDrawnIds?.has(chart.id) ?? false;
      const wanted = pdfChartPictureSize(chart, pageWidth, pageHeight);
      const drawn = pictureSize(local ? filePictures.get(chart.id) ?? null : chart.svg);
      if (drawn && Math.abs(drawn.width - wanted.width) <= 1 && Math.abs(drawn.height - wanted.height) <= 1) continue;
      const key = requestKey(chart, wanted);
      if (failed.has(key)) continue;
      void requestChartPicture({ attrs: chart.attrs, width: wanted.width, height: wanted.height, includeTitle: true, ...accents },
        { signal: controller.signal })
        .then((picture) => {
          if (controller.signal.aborted) return;
          if (local) setFilePictures((current) => new Map(current).set(chart.id, picture.svg));
          else onChange({ ...chart, svg: picture.svg });
        })
        .catch(() => {
          if (!controller.signal.aborted) setFailed((current) => new Set(current).add(key));
        });
    }
    return () => controller.abort();
    // The accents by their value (a new array each render is the same page's).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charts, failed, onChange, pageHeight, pageWidth, writable, accentsKey, fileDrawnIds, filePictures]);

  useEffect(() => {
    if (!selectedId || !writable) return;
    const chart = charts.find((entry) => entry.id === selectedId);
    if (!chart) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        onDelete(chart);
        onSelectionChange(null);
      } else if (event.key === "Escape") {
        onSelectionChange(null);
      }
    };
    const onPress = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest) return;
      if (target.closest('.pdf-viewer__chart, .pdf-viewer__office-ribbon, [data-radix-popper-content-wrapper], [role="dialog"], [role="menu"]')) return;
      onSelectionChange(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPress, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPress, true);
    };
  }, [charts, onDelete, onSelectionChange, selectedId, writable]);

  const startDrag = useCallback((event: ReactPointerEvent<HTMLElement>, chart: PdfChart, kind: "move" | "size") => {
    if (!writable || event.button > 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ id: chart.id, kind, dx: 0, dy: 0, startX: event.clientX, startY: event.clientY });
  }, [writable]);
  const moveDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
    setDrag((current) => current ? { ...current, dx: event.clientX - current.startX, dy: event.clientY - current.startY } : current);
  }, []);
  const endDrag = useCallback((chart: PdfChart) => {
    const current = drag;
    setDrag(null);
    if (!current || current.id !== chart.id || (Math.abs(current.dx) < 2 && Math.abs(current.dy) < 2)) return;
    if (current.kind === "move") {
      // A chart the file draws, moved, takes the picture drawn of it here.
      onChange({
        ...chart,
        ...(!chart.svg && filePictures.get(chart.id) ? { svg: filePictures.get(chart.id)! } : {}),
        x: Math.min(1 - chart.width, Math.max(0, chart.x + current.dx / cssWidth)),
        y: Math.min(1 - chart.height, Math.max(0, chart.y + current.dy / cssHeight)),
      });
      return;
    }
    // Sized anew: the picture is drawn again at the new size (above).
    onChange({
      ...chart,
      width: Math.min(1 - chart.x, Math.max(0.05, chart.width + current.dx / cssWidth)),
      height: Math.min(1 - chart.y, Math.max(0.04, chart.height + current.dy / cssHeight)),
    });
  }, [cssHeight, cssWidth, drag, filePictures, onChange]);

  const painted = useMemo(() => new Map(charts.map((chart) =>
    [chart.id, Boolean(fileDrawnIds?.has(chart.id)) || paintedDirectives.get(chart.id) === managedNativeChartDirective(chart)])),
  [charts, fileDrawnIds, paintedDirectives]);

  if (charts.length === 0) return null;
  return (
    <div className="pdf-viewer__chart-layer" data-testid="pdf-chart-layer">
      {charts.map((chart) => {
        const selected = chart.id === selectedId;
        const offset = drag && drag.id === chart.id ? drag : null;
        // A SmartArt has no fill of its own: selected, the page's own drawing
        // of it shows under its outline (a cover would hide the words under
        // it too); only a drag shows its picture over a cover.
        const shown = !painted.get(chart.id) || offset !== null || (selected && chart.kind !== "smartart");
        const left = chart.x * cssWidth + (offset?.kind === "move" ? offset.dx : 0);
        const top = chart.y * cssHeight + (offset?.kind === "move" ? offset.dy : 0);
        const width = Math.max(16, chart.width * cssWidth + (offset?.kind === "size" ? offset.dx : 0));
        const height = Math.max(12, chart.height * cssHeight + (offset?.kind === "size" ? offset.dy : 0));
        return (
          <div key={chart.id} className="pdf-viewer__chart-slot"
            data-stack-rank={stackRanks?.get(`chart:${chart.id}`)}
            style={pdfAnnotationSlotStyle(stackRanks?.get(`chart:${chart.id}`))}>
            {painted.get(chart.id) && shown ? (
              <div key="cover" className="pdf-viewer__table-cover" aria-hidden="true"
                style={{ left: chart.x * cssWidth, top: chart.y * cssHeight, width: chart.width * cssWidth, height: chart.height * cssHeight }} />
            ) : null}
            <div
              key="chart"
              role="img"
              aria-label={chart.kind === "smartart" ? t("pdf.smartArt.label") : t("pdf.chart.label")}
              data-pdf-object-kind={chart.kind ?? "chart"}
              className={`pdf-viewer__chart${selected ? " pdf-viewer__chart--selected" : ""}${shown || selected ? "" : " pdf-viewer__chart--painted"}`}
              data-testid="pdf-chart"
              data-chart-id={chart.id}
              style={{ left, top, width, height }}
              onPointerDown={(event) => {
                event.stopPropagation();
                if (!selected) onSelectionChange(chart.id);
                else if (writable) startDrag(event, chart, "move");
              }}
              onPointerMove={moveDrag}
              onPointerUp={() => endDrag(chart)}
              onPointerCancel={() => setDrag(null)}
            >
              {chart.kind === "smartart" ? (!shown ? null :
                <PdfSmartArtPicture
                  attrs={(preview?.id === chart.id ? preview.attrs as Record<string, unknown> : null) ?? chart.attrs}
                  widthPt={chart.width * pageWidth}
                  heightPt={chart.height * pageHeight}
                  cssWidth={width}
                  cssHeight={height}
                  textPrompt={t("office.smartArtTextPane.placeholder")}
                />
              ) : (() => {
                const picture = (previewKey && previewPicture?.key === previewKey && preview?.id === chart.id
                  ? previewPicture.svg : null) ?? chart.svg ?? filePictures.get(chart.id) ?? lastPictures.current.get(chart.id) ?? null;
                return picture ? (
                  // eslint-disable-next-line @next/next/no-img-element -- the engine's inert picture, drawn as is
                  <img
                    alt=""
                    draggable={false}
                    className="pdf-viewer__chart-picture"
                    src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(picture)}`}
                  />
                ) : (
                  <span className="pdf-viewer__chart-pending">
                    {failed.has(requestKey(chart, pdfChartPictureSize(chart, pageWidth, pageHeight)))
                      ? t("pdf.chart.unavailable") : t("pdf.chart.drawing")}
                  </span>
                );
              })()}
              {selected && writable ? (
                <button
                  type="button"
                  className="pdf-viewer__table-size"
                  data-testid="pdf-chart-size"
                  aria-label={t("pdf.table.resize")}
                  title={t("pdf.table.resize")}
                  onPointerDown={(event) => startDrag(event, chart, "size")}
                  onPointerMove={moveDrag}
                  onPointerUp={() => endDrag(chart)}
                  onPointerCancel={() => setDrag(null)}
                />
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
