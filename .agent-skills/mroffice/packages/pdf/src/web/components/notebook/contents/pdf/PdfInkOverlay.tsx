"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  conditionCapturedInkPoints,
  normalizeInkPenType,
  PDF_HIGHLIGHTER_OPACITY,
  pressureWidthFactor,
  type InkPenType,
} from "@mrnote/core/web/lib/pdf/ink.ts";
import {
  applyPdfInkErase,
  erasePdfInkStrokes,
  type PdfInkEraseResult,
  type PdfInkEraserKind,
} from "../../../../lib/pdf/ink-erase";
import { inkAcceptsPointer } from "@mrnote/core/web/lib/draw-with-touch.ts";
import { inkPointerArbiter, inkPointerSamples } from "@mrnote/core/web/lib/ink-pointer-policy.ts";
import { inkCancelsPenPointerDown } from "@mrnote/core/web/lib/ink-input-trace.ts";
import { startInkHoldToErase, type InkHoldToErase } from "@mrnote/core/web/lib/pen-first-draw.ts";
import { yieldTouchHold } from "@mrnote/core/web/lib/touch-hold.ts";
import { documentInkEraserRadiusPx, type DocumentInkPoint } from "@mrnote/core/web/lib/document-ink.ts";
import type { NativePdfInkAnnotationSource } from "../../../../lib/pdf/native-ink-annotations";
import type { Awareness } from "y-protocols/awareness";
import { createInkPresencePublisher } from "@mrnote/core/web/lib/collab/ink-presence.ts";
import {
  pdfInkPointsFromPresence,
  pdfInkPresenceStroke,
  pdfInkPresenceSurface,
  pdfInkWidthFromPresence,
} from "../../../../lib/pdf/ink-live-presence";
import { usePeerInkStrokes } from "@mrnote/core/web/components/notebook/InkPresenceSvgLayer.tsx";

/**
 * RDP tolerance for capture-time simplification, in page-relative FRACTION
 * units (points here are 0..1): 0.0015 ≈ 1.2px of jitter on an 800px page.
 */
const CAPTURE_SIMPLIFY_TOLERANCE = 0.0015;
/**
 * Point budget for a conditioned stroke. Well under the snapshot schema's
 * per-stroke cap (pdfInkStrokeSchema: 20 000 numbers = 10 000 points).
 */
const CAPTURE_MAX_POINTS = 2000;

export interface PdfInkStroke {
  id: string;
  page: number;
  color: string;
  width: number;
  /** Flattened [x0,y0,x1,y1,…] page-relative fractions (0..1). */
  points: number[];
  /**
   * "highlighter" renders (and exports) translucent; absent/"pen" is a plain
   * opaque pen. Optional so legacy persisted strokes stay valid unchanged.
   */
  penType?: InkPenType;
  /** Internal native-patchback tombstone; never rendered as a live stroke. */
  deleted?: boolean;
  /**
   * Third-party source identity. The source PDF canvas already paints this
   * stroke; the SVG keeps a transparent hit target so it is editable without
   * visually double-painting the original appearance.
   */
  nativeSource?: NativePdfInkAnnotationSource;
}

export interface PdfInkOverlayProps {
  strokes: PdfInkStroke[];
  page: number;
  pageWidth: number;
  pageHeight: number;
  /** When true, pointer drawing is active and the layer captures events. */
  drawMode: boolean;
  color: string;
  width: number;
  /** Pen type for NEW strokes ("pen" default; "highlighter" translucent). */
  penType?: InkPenType;
  /** Emit a completed stroke (fraction points). */
  onStrokeComplete: (stroke: PdfInkStroke) => void;
  /**
   * Delete a stroke by id (click-to-erase). When provided, an existing stroke is
   * clickable to delete while NOT in draw mode (so a drawing drag never erases a
   * stroke), mirroring the reader's ink layer. Absent -> strokes aren't clickable.
   */
  onDeleteStroke?: (id: string) => void;
  /**
   * The Draw tab's Eraser is armed (Word's Draw ▸ Eraser): a drag rubs the
   * ink under it out with `eraserKind` (lib/pdf/ink-erase), and the strokes
   * it touched land as one `onErase` when the pointer lifts.
   */
  eraseMode?: boolean;
  eraserKind?: PdfInkEraserKind;
  onErase?: (result: PdfInkEraseResult) => void;
  /**
   * The page room's presence: the running stroke goes out on it as it is
   * drawn, and the others' are drawn here until this page has them
   * (lib/pdf/ink-live-presence).
   */
  liveInkAwareness?: Awareness | null;
}

/** Stroke opacity for a pen type: highlighter translucent, pen opaque. */
function strokeOpacityFor(penType: unknown): number | undefined {
  return normalizeInkPenType(penType) === "highlighter"
    ? PDF_HIGHLIGHTER_OPACITY
    : undefined;
}

/** Freehand ink layer over a PDF page: renders strokes and (in draw mode) captures new ones. */
export default function PdfInkOverlay({
  strokes,
  page,
  pageWidth,
  pageHeight,
  drawMode,
  color,
  width,
  penType = "pen",
  onStrokeComplete,
  onDeleteStroke,
  eraseMode = false,
  eraserKind = "stroke",
  onErase,
  liveInkAwareness = null,
}: PdfInkOverlayProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [current, setCurrent] = useState<number[] | null>(null);
  const drawingRef = useRef(false);
  // The pointer drawing (the arbiter's: a palm, a second finger or a pen
  // over the hand never interrupts it), and the pen resting where it landed
  // (lib/pen-first-draw: it turns the stroke into the eraser).
  const drawingPointerRef = useRef<number | null>(null);
  const holdRef = useRef<InkHoldToErase | null>(null);
  // The eraser's drag: what it has rubbed out so far (shown at once, as the
  // Docs erasers show it) and the path it ran, until the pointer lifts and
  // the host records the whole erase as one command.
  const erasingRef = useRef<{
    pointerId: number;
    path: DocumentInkPoint[];
    result: PdfInkEraseResult | null;
  } | null>(null);
  const [erasePreview, setErasePreview] = useState<PdfInkEraseResult | null>(null);
  const [eraserAt, setEraserAt] = useState<DocumentInkPoint | null>(null);
  // The pen held still turned its stroke into the eraser (until it lifts).
  const [holdErasing, setHoldErasing] = useState(false);
  const erasing = eraseMode && Boolean(onErase);
  const shownStrokes = useMemo(
    () => (erasePreview ? applyPdfInkErase(strokes, erasePreview) : strokes),
    [erasePreview, strokes],
  );
  // Pressure samples collected across the in-progress stroke (real pen input);
  // averaged into a single width factor on completion.
  const pressureSamplesRef = useRef<number[]>([]);

  // The running stroke, as the others see it while it is drawn (the
  // publisher sends at most every 40 ms; the lift's empty update at once).
  const surface = pdfInkPresenceSurface("edit", page);
  const publisherRef = useRef<ReturnType<typeof createInkPresencePublisher> | null>(null);
  useEffect(() => {
    if (!liveInkAwareness) return;
    const publisher = createInkPresencePublisher(liveInkAwareness);
    publisherRef.current = publisher;
    return () => {
      if (publisherRef.current === publisher) publisherRef.current = null;
      publisher.dispose();
    };
  }, [liveInkAwareness]);
  useEffect(() => {
    const publisher = publisherRef.current;
    if (!publisher) return;
    if (!current || current.length < 2) {
      publisher.update(surface, []);
      return;
    }
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i + 1 < current.length; i += 2) points.push({ x: current[i] * 100, y: current[i + 1] * 100 });
    publisher.update(surface, [
      pdfInkPresenceStroke(points, color, width, strokeOpacityFor(penType) ?? 1),
    ]);
  }, [color, current, penType, surface, width]);
  const peerStrokes = usePeerInkStrokes(
    liveInkAwareness,
    surface,
    `${strokes.length}:${strokes.at(-1)?.id ?? ""}`,
  );

  const toFraction = useCallback((clientX: number, clientY: number): [number, number] => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return [0, 0];
    return [
      Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    ];
  }, []);

  const samplePressure = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    // 0 / non-finite means "no pressure sensor state" — skip those samples so a
    // mouse (0.5 while pressed) and a pen (true pressure) both average sanely.
    const pressure = event.pressure;
    if (typeof pressure === "number" && Number.isFinite(pressure) && pressure > 0) {
      pressureSamplesRef.current.push(pressure);
    }
  }, []);

  const toLayerPx = useCallback((clientX: number, clientY: number): DocumentInkPoint => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    // The layer may be drawn scaled: the eraser measures in its own pixels.
    return {
      x: ((clientX - rect.left) / rect.width) * pageWidth,
      y: ((clientY - rect.top) / rect.height) * pageHeight,
    };
  }, [pageHeight, pageWidth]);

  const eraseAlong = useCallback(
    (point: DocumentInkPoint) => {
      const session = erasingRef.current;
      if (!session) return;
      const last = session.path[session.path.length - 1];
      const path = last ? [last, point] : [point];
      session.path.push(point);
      const base = session.result ? applyPdfInkErase(strokes, session.result) : strokes;
      const more = erasePdfInkStrokes(base, path, eraserKind, { width: pageWidth, height: pageHeight });
      if (!more) return;
      // Pieces the eraser made and then rubbed out again never reach the host.
      const previous = session.result;
      const previousAdded = previous ? previous.added.filter((s) => !more.removedIds.includes(s.id)) : [];
      const previousAddedIds = new Set(previous ? previous.added.map((s) => s.id) : []);
      session.result = {
        removedIds: [
          ...(previous ? previous.removedIds : []),
          ...more.removedIds.filter((id) => !previousAddedIds.has(id)),
        ],
        added: [...previousAdded, ...more.added],
      };
      setErasePreview(session.result);
    },
    [eraserKind, pageHeight, pageWidth, strokes],
  );

  const finishErase = useCallback(
    (event?: React.PointerEvent<SVGSVGElement>) => {
      const session = erasingRef.current;
      if (!session) return;
      if (event && event.pointerId !== session.pointerId) return;
      erasingRef.current = null;
      setErasePreview(null);
      setEraserAt(null);
      setHoldErasing(false);
      if (inkPointerArbiter.owns({ pointerId: session.pointerId })) inkPointerArbiter.end();
      if (session.result && onErase) onErase(session.result);
    },
    [onErase],
  );

  // The running stroke is dropped (Esc, a pinch, a replaced pointer): no
  // ink lands from it.
  const cancelStroke = useCallback(() => {
    holdRef.current?.cancel();
    holdRef.current = null;
    if (!drawingRef.current) return;
    drawingRef.current = false;
    drawingPointerRef.current = null;
    pressureSamplesRef.current = [];
    inkPointerArbiter.end();
    setCurrent(null);
  }, []);

  // Press and hold the pen (lib/pen-first-draw): the stroke that rested
  // where it landed becomes the eraser from there, with the Draw tab's
  // eraser kind; once the pen lifts it is the pen again (Docs).
  const turnToEraser = useCallback(
    (pointerId: number, at: DocumentInkPoint) => {
      if (!drawingRef.current || drawingPointerRef.current !== pointerId || !onErase) return;
      holdRef.current = null;
      drawingRef.current = false;
      drawingPointerRef.current = null;
      pressureSamplesRef.current = [];
      setCurrent(null);
      erasingRef.current = { pointerId, path: [], result: null };
      setHoldErasing(true);
      setEraserAt(at);
      eraseAlong(at);
    },
    [eraseAlong, onErase],
  );

  // Esc cancels the gesture under the pointer (Word: Esc stops inking).
  useEffect(() => {
    if (!drawMode && !erasing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (drawingRef.current || erasingRef.current) {
        event.preventDefault();
        event.stopPropagation();
        cancelStroke();
        const session = erasingRef.current;
        if (session) {
          erasingRef.current = null;
          setErasePreview(null);
          setEraserAt(null);
          setHoldErasing(false);
          if (inkPointerArbiter.owns({ pointerId: session.pointerId })) inkPointerArbiter.end();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [cancelStroke, drawMode, erasing]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (!drawMode && !erasing) return;
      if (event.button !== 0) return;
      // Draw with Touch (on by default, as Office ships it): a finger inks
      // or erases with the armed tool; turned off, the pen alone does and a
      // finger is left to scroll and pinch the pages.
      if (!inkAcceptsPointer(event, true)) return;
      // A palm, a second finger, a pen over the palm's finger: the shared
      // policy decides (lib/ink-pointer-policy); a running stroke is never
      // interrupted by another pointer, and a second finger is a pinch.
      const verdict = inkPointerArbiter.verdict(event.nativeEvent);
      if (verdict === "ignore") return;
      if (verdict === "pinch") {
        cancelStroke();
        return;
      }
      if (verdict === "replace") {
        // The pen pressing again while its stroke runs: that stroke's lift
        // never reached the layer; it ends where the pen was last seen. A
        // finger's stroke the pen replaces was the palm: it goes.
        if (drawingRef.current && event.pointerType !== "touch") finishStrokeRef.current();
        else cancelStroke();
        if (erasingRef.current) finishErase();
      }
      // A pen's press is left to the browser on iPadOS unless the field
      // switch says otherwise (lib/ink-input-trace).
      if (event.pointerType !== "pen" || inkCancelsPenPointerDown()) event.preventDefault();
      yieldTouchHold(event.pointerId);
      inkPointerArbiter.begin(event.nativeEvent);
      try {
        svgRef.current?.setPointerCapture(event.pointerId);
      } catch {
        /* capture is best-effort */
      }
      if (erasing) {
        const point = toLayerPx(event.clientX, event.clientY);
        erasingRef.current = { pointerId: event.pointerId, path: [], result: null };
        setEraserAt(point);
        eraseAlong(point);
        return;
      }
      drawingRef.current = true;
      drawingPointerRef.current = event.pointerId;
      pressureSamplesRef.current = [];
      samplePressure(event);
      const [x, y] = toFraction(event.clientX, event.clientY);
      setCurrent([x, y]);
      holdRef.current?.cancel();
      holdRef.current = onErase
        ? startInkHoldToErase(event, () => turnToEraser(event.pointerId, toLayerPx(event.clientX, event.clientY)))
        : null;
    },
    [cancelStroke, drawMode, eraseAlong, erasing, finishErase, onErase, samplePressure, toFraction, toLayerPx, turnToEraser],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      inkPointerArbiter.observe(event.nativeEvent);
      const session = erasingRef.current;
      if (session) {
        if (session.pointerId !== event.pointerId) return;
        const point = toLayerPx(event.clientX, event.clientY);
        setEraserAt(point);
        eraseAlong(point);
        return;
      }
      if (erasing) {
        // The eraser's reach shows while the pen is in the air (Docs).
        if (event.pointerType !== "touch") setEraserAt(toLayerPx(event.clientX, event.clientY));
        return;
      }
      if (!drawMode || !drawingRef.current || drawingPointerRef.current !== event.pointerId) return;
      // A pen or a mouse moving with no button down has lifted: its up went
      // elsewhere. The stroke ends here, as a lift would.
      if ((event.pointerType === "pen" || event.pointerType === "mouse") && event.buttons === 0) {
        finishStrokeRef.current();
        return;
      }
      holdRef.current?.move(event);
      // Every coalesced sample: a fast stroke keeps its curve.
      const added: number[] = [];
      for (const sample of inkPointerSamples(event)) {
        samplePressure({ pressure: sample.pressure } as React.PointerEvent<SVGSVGElement>);
        const [x, y] = toFraction(sample.clientX, sample.clientY);
        added.push(x, y);
      }
      if (added.length === 0) return;
      setCurrent((prev) => (prev ? [...prev, ...added] : added));
    },
    [drawMode, eraseAlong, erasing, samplePressure, toFraction, toLayerPx],
  );

  const finishStrokeRef = useRef<() => void>(() => undefined);
  const finishStroke = useCallback(() => {
    holdRef.current?.cancel();
    holdRef.current = null;
    if (!drawingRef.current) return;
    drawingRef.current = false;
    drawingPointerRef.current = null;
    inkPointerArbiter.end();
    const factor = pressureWidthFactor(pressureSamplesRef.current);
    pressureSamplesRef.current = [];
    setCurrent((prev) => {
      if (prev && prev.length >= 4) {
        // Capture-time conditioning: simplify the raw pointer samples, then
        // Catmull-Rom-smooth them, so the PERSISTED stroke is already smooth.
        // Old stored strokes never pass through here and render unchanged.
        const pairs: Array<{ x: number; y: number }> = [];
        for (let i = 0; i + 1 < prev.length; i += 2) {
          pairs.push({ x: prev[i], y: prev[i + 1] });
        }
        const conditioned = conditionCapturedInkPoints(pairs, {
          tolerance: CAPTURE_SIMPLIFY_TOLERANCE,
          maxPoints: CAPTURE_MAX_POINTS,
        });
        const points: number[] = [];
        for (const p of conditioned) points.push(p.x, p.y);
        if (points.length >= 4) {
          onStrokeComplete({
            id: globalThis.crypto?.randomUUID?.() ?? `ink-${points[0]}-${points[1]}`,
            page,
            color,
            // Per-stroke AVERAGE pressure modulates the base width (see
            // pressureWidthFactor); per-point widths are not stored.
            width: width * factor,
            points,
            penType: normalizeInkPenType(penType),
          });
        }
      }
      return null;
    });
  }, [color, onStrokeComplete, page, penType, width]);
  finishStrokeRef.current = finishStroke;

  const pointsToAttr = (pts: number[]): string => {
    const out: string[] = [];
    for (let i = 0; i + 1 < pts.length; i += 2) {
      out.push(`${pts[i] * pageWidth},${pts[i + 1] * pageHeight}`);
    }
    return out.join(" ");
  };

  return (
    <svg
      ref={svgRef}
      data-testid="pdf-ink-overlay"
      width={pageWidth}
      height={pageHeight}
      style={{
        position: "absolute",
        inset: 0,
        // In draw mode the layer captures drags. Otherwise it only intercepts
        // pointer events when strokes are erasable (individual paths opt back in
        // below) — never blocking the text/box overlays beneath it.
        pointerEvents: drawMode || erasing ? "auto" : "none",
        cursor: drawMode ? "crosshair" : erasing ? "none" : "default",
        touchAction: "none",
      }}
      data-ink-tool={erasing ? "eraser" : drawMode ? "draw" : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => {
        finishErase(event);
        finishStroke();
      }}
      onPointerCancel={(event) => {
        finishErase(event);
        finishStroke();
      }}
      onPointerLeave={(event) => {
        if (erasing) {
          if (!erasingRef.current) setEraserAt(null);
          finishErase(event);
          return;
        }
        finishStroke();
      }}
    >
      {shownStrokes.map((stroke) => (
        <polyline
          key={stroke.id}
          data-testid="pdf-ink-stroke"
          data-pen-type={normalizeInkPenType(stroke.penType)}
          data-native-source={
            stroke.nativeSource ? stroke.nativeSource.objectRef : undefined
          }
          points={pointsToAttr(stroke.points)}
          fill="none"
          stroke={stroke.color}
          strokeWidth={
            stroke.nativeSource ? Math.max(8, stroke.width) : stroke.width
          }
          strokeOpacity={
            stroke.nativeSource ? 0.001 : strokeOpacityFor(stroke.penType)
          }
          strokeLinecap="round"
          strokeLinejoin="round"
          style={
            onDeleteStroke
              ? {
                  // Clickable to erase only while NOT drawing (so a draw drag
                  // never deletes a stroke), mirroring the reader's ink layer.
                  pointerEvents: drawMode || erasing ? "none" : "stroke",
                  cursor: drawMode ? "crosshair" : "pointer",
                }
              : undefined
          }
          onClick={
            onDeleteStroke
              ? (event) => {
                  if (drawMode || erasing) return;
                  event.stopPropagation();
                  onDeleteStroke(stroke.id);
                }
              : undefined
          }
        />
      ))}
      {peerStrokes.map((stroke, index) => {
        const points: number[] = [];
        for (const point of pdfInkPointsFromPresence(stroke)) points.push(point.x / 100, point.y / 100);
        return (
          <polyline
            key={`peer-${index}`}
            data-testid="pdf-peer-ink-stroke"
            points={pointsToAttr(points)}
            fill="none"
            stroke={stroke.color}
            strokeWidth={pdfInkWidthFromPresence(stroke)}
            strokeOpacity={stroke.alpha < 1 ? stroke.alpha : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ pointerEvents: "none" }}
          />
        );
      })}
      {current && current.length >= 2 ? (
        <polyline
          points={pointsToAttr(current)}
          fill="none"
          stroke={color}
          strokeWidth={width}
          strokeOpacity={strokeOpacityFor(penType)}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {(erasing || holdErasing) && eraserAt ? (
        <circle
          data-testid="pdf-ink-eraser-ring"
          cx={eraserAt.x}
          cy={eraserAt.y}
          r={documentInkEraserRadiusPx(eraserKind)}
          fill="rgba(148, 163, 184, 0.35)"
          stroke="#64748b"
          strokeWidth={1}
          strokeDasharray={eraserKind === "stroke" ? "4 4" : undefined}
          style={{ pointerEvents: "none" }}
        />
      ) : null}
    </svg>
  );
}
