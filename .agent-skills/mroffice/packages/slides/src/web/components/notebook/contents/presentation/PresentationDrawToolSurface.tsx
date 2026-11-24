"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The Draw tab's ink tool surface over the slide canvas.
 *
 * Extracted verbatim from the render of
 * `components/notebook/contents/PresentationWindow.tsx`: the JSX is unchanged;
 * the window passes the bindings it used to close over as `ctl`, and the render
 * condition and key stay at the call site. No hooks run here, so the window's
 * hook order is unchanged.
 */

import { useCallback, useEffect, useState, type RefObject } from "react";

import type { DocumentInkEffect } from "@mrnote/core/web/lib/document-ink.ts";
import type { Point } from "@mrnote/core/web/lib/presentation-polygon-points.ts";
import { InkLiveCanvas } from "@mrnote/core/web/lib/office-ink-live.ts";
import { appendInkEffectSvg, inkEffectPaint, inkEffectSvgPlan, isInkEffect } from "@mrnote/core/web/lib/office-ink-effects.ts";
import type { InkRulerState } from "@mrnote/core/web/lib/office-ink-ruler.ts";
import { OfficeInkRuler } from "@mrnote/core/web/components/office-ribbon/OfficeInkRuler.tsx";
import {
  inkCornerDegreesForTool,
  inkPressuresVary,
  inkStrokePathData,
  inkVariableWidthOutlinePathData,
} from "@mrnote/core/web/lib/office-ink-smooth.ts";
import { inkOpacityForTool, type InkTool } from "@mrnote/core/web/lib/presentation-annotation.ts";
import { wetInkSvgElement, type WetInkLayer } from "@mrnote/core/web/lib/office-wet-ink-layer.ts";

/** A finished stroke the deck has not taken yet (lib/office-wet-ink). */
export interface PresentationWetStroke {
  readonly slideId: string;
  readonly deckGeneration: number;
  /** Slide EMU, in drawing order, each with the pen's pressure when known. */
  readonly points: readonly (Point & { readonly p?: number })[];
  readonly color: string;
  /** The stroke's width in the slide's CSS pixels. */
  readonly width: number;
  readonly tool: InkTool;
  readonly effect: DocumentInkEffect | null;
  readonly toShape: boolean;
  /** Drawn and held: `points` are the clean shape it snapped to, landing as that shape. */
  readonly held?: boolean;
}

/**
 * One wet stroke as the surface draws it (lib/office-wet-ink-layer): painted
 * once, when the pen lifts, in the slide's EMU.
 */
let wetEffectSerial = 0;

export function paintPresentationWetStroke(stroke: PresentationWetStroke, ownerDocument: Document): Element {
  const corner = inkCornerDegreesForTool(stroke.tool);
  if (stroke.tool === "pen" && stroke.effect && isInkEffect(stroke.effect)) {
    // A pen's effect: its layers, as the landed stroke paints them
    // (lib/office-ink-effects), in the slide's EMU.
    wetEffectSerial += 1;
    const group = wetInkSvgElement(ownerDocument, "g", {});
    const defs = wetInkSvgElement(ownerDocument, "defs", {});
    group.append(defs);
    const plan = inkEffectSvgPlan(
      inkEffectPaint(stroke.effect),
      {
        points: stroke.points,
        widthPx: stroke.width * 9_525,
        pressured: inkPressuresVary(stroke.points.map((point) => point.p)),
        corner,
      },
      `presentation-wet-ink-effect-${wetEffectSerial}`,
    );
    appendInkEffectSvg(ownerDocument, group, defs, plan, {}, { "data-testid": "presentation-draw-wet-stroke" });
    return group;
  }
  if (stroke.tool !== "highlighter" && inkPressuresVary(stroke.points.map((point) => point.p))) {
    // A pressure pen's stroke: a filled outline whose width follows the
    // pressure, as it will land.
    return wetInkSvgElement(ownerDocument, "path", {
      "data-testid": "presentation-draw-wet-stroke",
      "data-ink-pressure": "true",
      d: inkVariableWidthOutlinePathData(stroke.points, stroke.width * 9_525, { corner, precision: 0 }),
      fill: stroke.color,
      "fill-opacity": inkOpacityForTool(stroke.tool),
      stroke: "none",
    });
  }
  const path = wetInkSvgElement(ownerDocument, "path", {
    "data-testid": "presentation-draw-wet-stroke",
    fill: "none",
    d: inkStrokePathData(stroke.points, { corner }),
    stroke: stroke.color,
    "stroke-opacity": inkOpacityForTool(stroke.tool),
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "stroke-width": stroke.width * 9_525,
  });
  if (stroke.tool === "highlighter") path.style.mixBlendMode = "multiply";
  return path;
}

/** The window bindings this tab reads, passed through unchanged. */
export interface PresentationDrawToolSurfaceCtl {
  activeSlideBounds: { width: number; height: number; };
  /** Null while the surface stands for the ruler alone (no tool picked). */
  inkInteractionMode: "draw" | "eraser" | "lasso" | null;
  inkColor: string;
  inkStrokePx: number;
  /** The lasso's polygon while it is drawn (a pen or eraser stroke is on the live canvas). */
  inkPreview: Point[] | null;
  /** The running stroke's canvas (lib/office-ink-live), mounted here for the window's gesture. */
  inkLiveRef: RefObject<InkLiveCanvas | null>;
  /** The finished strokes not yet in the deck, drawn here until they land (outside React). */
  inkWetLayer: WetInkLayer<PresentationWetStroke>;
  /** The Draw tab's Ruler, in the surface's own pixels, when shown. */
  inkRuler: InkRulerState | null;
  setInkRuler: (next: InkRulerState | null) => void;
  rulerLabel: string;
}

export function PresentationDrawToolSurface({ ctl }: { ctl: PresentationDrawToolSurfaceCtl }) {
  const {
    activeSlideBounds,
    inkInteractionMode,
    inkColor,
    inkStrokePx,
    inkPreview,
    inkLiveRef,
    inkWetLayer,
    inkRuler,
    setInkRuler,
    rulerLabel,
  } = ctl;
  const [surface, setSurface] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!surface) return;
    // Floating over the page, outside the slide's zoom transform (lib/office-ink-live).
    const live = new InkLiveCanvas(surface.ownerDocument, { floating: true, host: surface });
    inkLiveRef.current = live;
    return () => {
      if (inkLiveRef.current === live) inkLiveRef.current = null;
      live.dispose();
    };
  }, [inkLiveRef, surface]);
  // The wet strokes' own element: the layer draws into it, React never
  // renders its children (a lift renders nothing here).
  const mountWetInk = useCallback((node: SVGSVGElement | null) => inkWetLayer.mount(node), [inkWetLayer]);
  return (
              <div
                ref={setSurface}
                aria-hidden="true"
                data-testid="presentation-draw-tool-surface"
                data-tool-mode={inkInteractionMode ?? "ruler"}
                style={{
                  inset: 0,
                  position: "absolute",
                  pointerEvents: "none",
                  zIndex: 9_000,
                }}
              >
                <svg
                  ref={mountWetInk}
                  data-testid="presentation-draw-wet-ink"
                  viewBox={`0 0 ${activeSlideBounds.width} ${activeSlideBounds.height}`}
                  preserveAspectRatio="none"
                  style={{ height: "100%", inset: 0, position: "absolute", width: "100%" }}
                />
                {inkPreview && inkPreview.length > 0 ? (
                  <svg
                    data-testid="presentation-draw-tool-preview"
                    viewBox={`0 0 ${activeSlideBounds.width} ${activeSlideBounds.height}`}
                    preserveAspectRatio="none"
                    style={{ height: "100%", inset: 0, position: "absolute", width: "100%" }}
                  >
                    {inkInteractionMode === "lasso" ? (
                      <polygon
                        fill="rgba(196, 62, 28, 0.08)"
                        points={inkPreview
                          .map((point) => `${point.x},${point.y}`)
                          .join(" ")}
                        stroke="#c43e1c"
                        strokeDasharray="5 4"
                        strokeWidth={1.5}
                        vectorEffect="non-scaling-stroke"
                      />
                    ) : (
                      <path
                        fill="none"
                        // the curve the stroke is drawn as once it lands
                        d={inkStrokePathData(inkPreview)}
                        stroke={inkColor}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={
                          inkInteractionMode === "eraser"
                            ? Math.max(
                                activeSlideBounds.width,
                                activeSlideBounds.height,
                              ) / 90
                            : inkStrokePx * 9_525
                        }
                      />
                    )}
                  </svg>
                ) : null}
                {inkRuler ? (
                  <OfficeInkRuler
                    ruler={inkRuler}
                    onChange={setInkRuler}
                    length={Math.ceil(Math.hypot(surface?.offsetWidth ?? 0, surface?.offsetHeight ?? 0) + 200)}
                    zoom={surface && surface.offsetWidth > 0 ? surface.getBoundingClientRect().width / surface.offsetWidth : 1}
                    label={rulerLabel}
                    testId="presentation-draw-ruler"
                  />
                ) : null}
              </div>
  );
}
