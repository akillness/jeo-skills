"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The slideshow annotation layer: laser pointer, pen and highlighter ink and
 * the eraser drawn over the presenting slide (session-only, never saved).
 *
 * Moved verbatim out of `components/notebook/contents/PresentationWindow.tsx`
 * (structural split, no behaviour change).
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  inkOpacityForTool,
  isInkTool,
  normalizePoint,
  pruneTrail,
  pushTrailSample,
  strokePathData,
  trailRenderPoints,
  type AnnotationPoint,
  type AnnotationTool,
  type InkStroke,
  type TrailSample,
} from "@mrnote/core/web/lib/presentation-annotation.ts";

/**
 * Present-mode ANNOTATION layer (PowerPoint / WPS "Pen / Laser pointer" parity).
 *
 * An absolutely-positioned SVG that fills the slide box (mounted via the slide
 * view's `overlay` prop, so it shares the slide's letterboxed rect). It draws:
 *  - the LASER pointer dot + its fading trail (ephemeral, never saved), and
 *  - PEN / HIGHLIGHTER ink strokes for the current slide, with an ERASER.
 *
 * Coordinates are SLIDE-RELATIVE fractions (`viewBox="0 0 1 1"`,
 * `preserveAspectRatio=none`) so a stroke stays pinned to slide content
 * regardless of how the stage scales the slide. All geometry/decay/erase logic
 * lives in the pure `presentation-annotation` module; this component is the thin
 * DOM/pointer shell. It NEVER mutates or persists slide data — the parent holds
 * the strokes in session-only state that clears on present-mode exit.
 *
 * When `tool` is `null` the layer is inert (`pointer-events: none`) so a normal
 * audience click falls through to the stage's advance handler — drawing is fully
 * opt-in and never regresses click-to-advance.
 */
export function PresentationAnnotationLayer({
  tool,
  color,
  strokes,
  onStrokeStart,
  onStrokeAppend,
  onStrokeFinish,
  onErase,
  onEraseFinish,
  ariaLabel,
}: {
  /** The active draw tool, or `null` when annotation is off (layer is inert). */
  tool: AnnotationTool | null;
  /** Ink colour for new pen / highlighter strokes (also the laser dot hue). */
  color: string;
  /** The CURRENT slide's saved ink strokes (rendered bottom-to-top). */
  strokes: readonly InkStroke[];
  /** Begin a new ink stroke at a fractional point (pen / highlighter only). */
  onStrokeStart: (point: AnnotationPoint) => void;
  /** Extend the in-progress stroke (pen / highlighter only). */
  onStrokeAppend: (point: AnnotationPoint) => void;
  /** Commit the in-progress stroke (pen / highlighter only). */
  onStrokeFinish: () => void;
  /** Erase any stroke touched at a fractional point (eraser only). */
  onErase: (point: AnnotationPoint) => void;
  /** Finalize one bounded eraser gesture (optional for session-only callers). */
  onEraseFinish?: () => void;
  ariaLabel: string;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  // Whether a draw/erase gesture is in flight (pointer down on the surface).
  const drawingRef = useRef(false);
  // The pointer id we captured, so we ignore stray multi-touch pointers.
  const pointerIdRef = useRef<number | null>(null);
  // Laser trail samples (slide-fraction + capture time). Local to this layer
  // because it is purely a transient render effect, never persisted nor lifted.
  const [trail, setTrail] = useState<TrailSample[]>([]);
  // The live laser dot position (most-recent sample), or null when off-surface.
  const [laserDot, setLaserDot] = useState<AnnotationPoint | null>(null);
  // A monotonically-advancing "now" clock (ms) used to compute the trail's
  // age→opacity at RENDER time. Updated by the fade ticker + on each pointer
  // sample, so reading it during render is pure (no `Date.now()` in render).
  const [nowTick, setNowTick] = useState(0);
  // The slide's rendered aspect ratio (width/height). The SVG fills the slide
  // box, so its own rect IS the slide rect; we plot into a `0 0 aspect 1`
  // viewBox under preserveAspectRatio=none so X and Y share a unit scale in
  // SCREEN pixels — ink width + the laser dot then stay round / uniform instead
  // of skewing with the (typically 16:9) slide. Default 16/9 until measured.
  const [aspect, setAspect] = useState(16 / 9);

  // Measure the slide rect's aspect on mount and on resize (a window resize or
  // entering native fullscreen changes the projected slide's size). ResizeObserver
  // keeps it correct without polling; cleaned up on unmount.
  useEffect(() => {
    const node = svgRef.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setAspect((prev) => {
          const next = rect.width / rect.height;
          // Avoid a churn re-render for sub-pixel jitter.
          return Math.abs(next - prev) < 0.001 ? prev : next;
        });
      }
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const isLaser = tool === "laser";
  const isEraser = tool === "eraser";
  const isInk = tool !== null && isInkTool(tool);

  // Translate a pointer event's client coords into a slide-relative fraction
  // using the SVG's painted rect. Returns null if the rect is degenerate (zero
  // area), which can happen for a frame during mount/teardown.
  const toFraction = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>): AnnotationPoint | null => {
      const node = svgRef.current;
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      return normalizePoint(
        (event.clientX - rect.left) / rect.width,
        (event.clientY - rect.top) / rect.height,
      );
    },
    [],
  );

  // Fade the laser trail even while the cursor is still: a ticker prunes expired
  // samples so the tail visibly shrinks. Runs only while the laser is active AND
  // there is something to fade; the interval is torn down on tool change/unmount.
  useEffect(() => {
    if (!isLaser || trail.length === 0) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      setNowTick(now);
      setTrail((prev) => pruneTrail(prev, now));
    }, 40);
    return () => window.clearInterval(id);
  }, [isLaser, trail.length]);

  // When the laser tool is deselected (or the layer unmounts), drop any lingering
  // trail + dot so they don't flash on the next laser activation. Clearing in the
  // effect's CLEANUP keeps the effect body side-effect-free (no cascading render).
  useEffect(() => {
    if (!isLaser) return;
    return () => {
      setTrail((prev) => (prev.length === 0 ? prev : []));
      setLaserDot(null);
    };
  }, [isLaser]);

  // Push a laser-trail sample at `point` and advance the render clock so the
  // fresh sample paints at full brightness immediately. Called from the pointer
  // handlers (event phase), so `Date.now()` here is allowed.
  const seedLaserTrail = useCallback((point: AnnotationPoint) => {
    const now = Date.now();
    setNowTick(now);
    setLaserDot(point);
    setTrail((prev) => pushTrailSample(prev, point.x, point.y, now));
  }, []);

  // Pointer DOWN: start a stroke (ink), erase (eraser), or seed the laser dot.
  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (tool === null) return;
      const point = toFraction(event);
      if (!point) return;
      // Consume the gesture so the stage's click-to-advance never also fires
      // while the presenter is drawing on the slide.
      event.preventDefault();
      event.stopPropagation();
      pointerIdRef.current = event.pointerId;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // setPointerCapture can throw if the pointer is already gone; ignore.
      }
      if (isLaser) {
        seedLaserTrail(point);
        return;
      }
      drawingRef.current = true;
      if (isEraser) {
        onErase(point);
        return;
      }
      // Pen / highlighter: open a new stroke.
      onStrokeStart(point);
    },
    [
      tool,
      isLaser,
      isEraser,
      toFraction,
      onErase,
      onStrokeStart,
      seedLaserTrail,
    ],
  );

  // Pointer MOVE: extend the stroke / erase pass, or move the laser dot + trail.
  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (tool === null) return;
      // The laser dot tracks the cursor whenever it is over the surface (no
      // button required), mirroring PowerPoint's hold-to-point feel.
      if (isLaser) {
        const point = toFraction(event);
        if (!point) return;
        seedLaserTrail(point);
        return;
      }
      if (!drawingRef.current) return;
      if (pointerIdRef.current !== event.pointerId) return;
      const point = toFraction(event);
      if (!point) return;
      event.preventDefault();
      if (isEraser) {
        onErase(point);
        return;
      }
      onStrokeAppend(point);
    },
    [
      tool,
      isLaser,
      isEraser,
      toFraction,
      onErase,
      onStrokeAppend,
      seedLaserTrail,
    ],
  );

  // Pointer UP / CANCEL: commit an in-flight ink stroke; release capture.
  const endGesture = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (pointerIdRef.current === event.pointerId) {
        try {
          event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
          // Already released / pointer gone — ignore.
        }
        pointerIdRef.current = null;
      }
      if (drawingRef.current && isInk) {
        onStrokeFinish();
      }
      if (drawingRef.current && isEraser) {
        onEraseFinish?.();
      }
      drawingRef.current = false;
    },
    [isEraser, isInk, onEraseFinish, onStrokeFinish],
  );

  // The laser dot leaves the surface → hide it (the trail still fades out).
  const handlePointerLeave = useCallback(() => {
    if (isLaser) setLaserDot(null);
  }, [isLaser]);

  // Age→opacity uses the ticked clock (pure render — no `Date.now()` here). A
  // zero tick (before the first sample) falls back to the helper's newest-sample
  // default so the very first frame still paints the trail.
  const renderTrail = isLaser
    ? trailRenderPoints(trail, nowTick || undefined)
    : [];
  // The drawing cursor: a crosshair while drawing/erasing, none for the laser
  // (the glowing dot IS the cursor). `null` tool → default (inert) cursor.
  const cursor =
    tool === null
      ? undefined
      : isLaser
        ? "none"
        : isEraser
          ? "cell"
          : "crosshair";

  // Aspect-corrected viewBox: `0 0 aspect 1` so one X user-unit == one Y
  // user-unit in screen px. X fractions are multiplied by `aspect` when plotted.
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9;
  return (
    <svg
      ref={svgRef}
      className="presentation-present__annotations"
      viewBox={`0 0 ${safeAspect} 1`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel}
      data-testid="presentation-annotation-layer"
      data-tool={tool ?? "off"}
      style={{
        // Inert (clicks fall through to advance) unless a tool is active.
        pointerEvents: tool === null ? "none" : "auto",
        ...(cursor ? { cursor } : {}),
        touchAction: "none",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
      onPointerLeave={handlePointerLeave}
      // The browser still dispatches a click after a stroke's pointerup;
      // with a tool armed that click is part of the drawing, never the
      // stage's click-to-advance (PPT-B017).
      onClick={(event) => {
        if (tool !== null) event.stopPropagation();
      }}
    >
      {/* Saved ink strokes (bottom-to-top). The width is a fraction of the
          slide's HEIGHT (the Y unit), which under the aspect-corrected viewBox
          renders as a uniform on-screen weight regardless of stroke direction. */}
      {strokes.map((stroke) => (
        <path
          key={stroke.id}
          className="presentation-present__ink-stroke"
          data-testid="presentation-ink-stroke"
          data-tool={stroke.tool}
          d={strokePathData(stroke, safeAspect)}
          fill="none"
          stroke={stroke.color}
          strokeOpacity={inkOpacityForTool(stroke.tool)}
          strokeWidth={stroke.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            mixBlendMode: stroke.tool === "highlighter" ? "multiply" : "normal",
          }}
        />
      ))}
      {/* Laser trail: faint trailing dots, oldest dimmest. Painted under the
          live dot. Radii are tiny fractions of the slide height so they stay
          round (X is scaled by `aspect` to match). */}
      {renderTrail.map((p, i) => (
        <circle
          key={`trail-${i}`}
          className="presentation-present__laser-trail"
          data-testid="presentation-laser-trail"
          cx={p.x * safeAspect}
          cy={p.y}
          r={0.006}
          fill={color}
          fillOpacity={p.opacity * 0.5}
        />
      ))}
      {/* The live laser dot: a bright core with a soft glow halo. */}
      {isLaser && laserDot ? (
        <g data-testid="presentation-laser-dot">
          <circle
            className="presentation-present__laser-glow"
            cx={laserDot.x * safeAspect}
            cy={laserDot.y}
            r={0.016}
            fill={color}
            fillOpacity={0.25}
          />
          <circle
            className="presentation-present__laser-core"
            cx={laserDot.x * safeAspect}
            cy={laserDot.y}
            r={0.008}
            fill={color}
          />
        </g>
      ) : null}
    </svg>
  );
}
