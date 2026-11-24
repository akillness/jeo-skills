"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Morph between two shapes (Microsoft Support, "Morph transition: Tips and
 * tricks": a shape whose type changes morphs its geometry, and its colour
 * and formatting change smoothly).
 *
 * The outlines are taken from the slide's own drawing of each shape: both are
 * drawn once, unturned and at their own size, in a hidden frame; the body of
 * each (its largest filled outline) is walked at an even pace into the same
 * number of points, the second set turned and ordered to lie nearest the
 * first, and the shape drawn between them, its solid fill and line blended on
 * the way. A fill this cannot blend (a gradient, a picture, a pattern) leaves
 * the pair to the cross-fade.
 *
 * Time is an animation's (`clock`): the show plays it, and a recording
 * (`PresentationVideoExporter`) sets it, then asks for the frame with
 * {@link MORPH_FRAME_EVENT}.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import type { PresentationBlock } from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import type { SlideMaster } from "@mrnote/core/web/lib/presentation-master.ts";
import type { DeckTheme } from "@mrnote/core/web/lib/presentation-theme.ts";
import type { SlideModel } from "@mrnote/core/web/lib/presentation/deck-model.ts";
import { easeInOutCubic } from "../../../../lib/presentation-morph";
import { AUTOFIT_EMU_PER_PX } from "../../../../lib/presentation/text-layout-css";
import { geometryNumber } from "@mrnote/core/web/lib/presentation-object-buttons.ts";
import { PresentationBlockView } from "./PresentationBlockView";

/** A recording asks every morph for the frame its clock now stands at. */
export const MORPH_FRAME_EVENT = "presentation-morph-frame";

const POINTS = 120;

type Outline = {
  /** Points as shares of the shape's frame. */
  points: Array<[number, number]>;
  fill: [number, number, number, number] | null;
  stroke: [number, number, number, number] | null;
  strokeWidth: number;
};

function parseColor(value: string | null, opacity: number): [number, number, number, number] | null {
  if (!value || value === "none" || value.startsWith("url(")) return null;
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const n = Number.parseInt(hex[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, opacity];
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(value);
  if (rgb) {
    const parts = rgb[1]!.split(/[\s,/]+/).filter(Boolean).map(Number);
    if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) {
      return [parts[0]!, parts[1]!, parts[2]!, (parts[3] ?? 1) * opacity];
    }
  }
  return null;
}

/** The drawing's body: its largest outline, walked into points of the frame. */
function readOutline(frame: HTMLElement): Outline | null | "unblendable" {
  const box = frame.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) return null;
  let best: SVGGeometryElement | null = null;
  let bestArea = 0;
  for (const shape of Array.from(frame.querySelectorAll<SVGGeometryElement>("path, rect, ellipse, circle, polygon"))) {
    if (typeof shape.getTotalLength !== "function" || shape.closest("defs, clipPath, mask, pattern, marker")) continue;
    const rect = shape.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > bestArea) {
      bestArea = area;
      best = shape;
    }
  }
  if (!best) return null;
  const style = getComputedStyle(best);
  const fillValue = style.fill;
  if (fillValue.startsWith("url(")) return "unblendable";
  const strokeValue = style.stroke;
  if (strokeValue.startsWith("url(")) return "unblendable";
  const total = best.getTotalLength();
  const matrix = best.getScreenCTM();
  if (!matrix || !(total > 0)) return null;
  const points: Array<[number, number]> = [];
  for (let index = 0; index < POINTS; index += 1) {
    const local = best.getPointAtLength((index / POINTS) * total);
    const screen = new DOMPoint(local.x, local.y).matrixTransform(matrix);
    points.push([(screen.x - box.left) / box.width, (screen.y - box.top) / box.height]);
  }
  const opacity = Number(style.opacity || 1) * Number(style.fillOpacity || 1);
  const strokeOpacity = Number(style.opacity || 1) * Number(style.strokeOpacity || 1);
  return {
    points,
    fill: parseColor(fillValue, opacity),
    stroke: parseColor(strokeValue, strokeOpacity),
    strokeWidth: Number.parseFloat(style.strokeWidth || "0") || 0,
  };
}

/** The second outline turned and ordered to lie nearest the first, point for point. */
export function alignOutline(
  from: ReadonlyArray<readonly [number, number]>,
  to: ReadonlyArray<readonly [number, number]>,
): Array<[number, number]> {
  const count = Math.min(from.length, to.length);
  let best: Array<[number, number]> = to.slice(0, count).map(([x, y]) => [x, y]);
  let bestCost = Infinity;
  for (const reverse of [false, true]) {
    const ordered = reverse ? [...to].reverse() : [...to];
    for (let shift = 0; shift < count; shift += 1) {
      let cost = 0;
      for (let index = 0; index < count && cost < bestCost; index += 1) {
        const [ax, ay] = from[index]!;
        const [bx, by] = ordered[(index + shift) % count]!;
        cost += (ax - bx) ** 2 + (ay - by) ** 2;
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = Array.from({ length: count }, (_, index) => {
          const [x, y] = ordered[(index + shift) % count]!;
          return [x, y];
        });
      }
    }
  }
  return best;
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function mixColor(
  a: [number, number, number, number] | null,
  b: [number, number, number, number] | null,
  t: number,
): string {
  if (!a && !b) return "none";
  // A side with no paint fades the other in or out.
  const from = a ?? [b![0], b![1], b![2], 0];
  const to = b ?? [a![0], a![1], a![2], 0];
  return `rgba(${Math.round(mix(from[0], to[0], t))}, ${Math.round(mix(from[1], to[1], t))}, ${Math.round(mix(from[2], to[2], t))}, ${mix(from[3], to[3], t).toFixed(3)})`;
}

export function PresentationMorphOutline({
  fromBlock,
  toBlock,
  fromSlide,
  toSlide,
  theme,
  masters,
  bounds,
  frame,
  durationMs,
  playing,
  onReady,
}: {
  fromBlock: PresentationBlock;
  toBlock: PresentationBlock;
  fromSlide: SlideModel;
  toSlide: SlideModel;
  theme?: DeckTheme;
  masters?: readonly SlideMaster[];
  bounds: { width: number; height: number };
  /** The tweened frame (position, size, turn) the outline is drawn in. */
  frame: CSSProperties;
  durationMs: number;
  /** The morph has begun (the layer's flip to its end state). */
  playing: boolean;
  /** Whether the pair is drawn here (else the cross-fade draws it). */
  onReady: (outlined: boolean) => void;
}) {
  const fromRef = useRef<HTMLDivElement | null>(null);
  const toRef = useRef<HTMLDivElement | null>(null);
  const pathRef = useRef<SVGPathElement | null>(null);
  const clockRef = useRef<HTMLDivElement | null>(null);
  const [pair, setPair] = useState<{ from: Outline; to: Outline; aligned: Array<[number, number]> } | null>(null);
  const [measured, setMeasured] = useState(false);
  const size = (block: PresentationBlock) => ({
    width: Math.max(1, (geometryNumber(block, "width") ?? 0) / AUTOFIT_EMU_PER_PX),
    height: Math.max(1, (geometryNumber(block, "height") ?? 0) / AUTOFIT_EMU_PER_PX),
  });

  useLayoutEffect(() => {
    if (measured || !fromRef.current || !toRef.current) return;
    const from = readOutline(fromRef.current);
    const to = readOutline(toRef.current);
    setMeasured(true);
    if (!from || !to || from === "unblendable" || to === "unblendable") {
      onReady(false);
      return;
    }
    setPair({ from, to, aligned: alignOutline(from.points, to.points) });
    onReady(true);
  }, [measured, onReady]);

  const draw = useMemo(
    () => (progress: number) => {
      const path = pathRef.current;
      if (!path || !pair) return;
      const t = easeInOutCubic(progress);
      const points = pair.from.points.map(([x, y], index) => {
        const [tx, ty] = pair.aligned[index]!;
        return `${(mix(x, tx, t) * 1000).toFixed(1)},${(mix(y, ty, t) * 1000).toFixed(1)}`;
      });
      path.setAttribute("d", `M${points.join("L")}Z`);
      path.setAttribute("fill", mixColor(pair.from.fill, pair.to.fill, t));
      path.setAttribute("stroke", mixColor(pair.from.stroke, pair.to.stroke, t));
      path.setAttribute("stroke-width", String(mix(pair.from.strokeWidth, pair.to.strokeWidth, t)));
    },
    [pair],
  );

  // The clock: an animation the show plays and a recording sets.
  useEffect(() => {
    const clock = clockRef.current;
    if (!pair || !clock) return;
    draw(0);
    if (!playing) return;
    const animation = clock.animate([{ opacity: 0 }, { opacity: 1 }], { duration: durationMs, fill: "forwards" });
    let raf = 0;
    const tick = () => {
      draw(Math.min(1, Number(animation.currentTime ?? 0) / Math.max(1, durationMs)));
      if (animation.playState === "running") raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onFrame = () => draw(Math.min(1, Number(animation.currentTime ?? 0) / Math.max(1, durationMs)));
    window.addEventListener(MORPH_FRAME_EVENT, onFrame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener(MORPH_FRAME_EVENT, onFrame);
      animation.cancel();
    };
  }, [pair, playing, durationMs, draw]);

  return (
    <>
      {!measured
        ? (
          <div aria-hidden="true" style={{ position: "fixed", left: -100_000, top: 0, visibility: "hidden", pointerEvents: "none" }}>
            <div ref={fromRef} style={{ position: "relative", ...size(fromBlock) }}>
              <PresentationBlockView block={fromBlock} bounds={bounds} theme={theme} slide={fromSlide} masters={masters} fillParent />
            </div>
            <div ref={toRef} style={{ position: "relative", ...size(toBlock) }}>
              <PresentationBlockView block={toBlock} bounds={bounds} theme={theme} slide={toSlide} masters={masters} fillParent />
            </div>
          </div>
        )
        : null}
      {pair ? (
        <div style={{ ...frame, pointerEvents: "none" }} data-testid="presentation-morph-outline">
          <div ref={clockRef} style={{ position: "absolute", width: 0, height: 0, opacity: 0 }} />
          <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" width="100%" height="100%" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
            <path ref={pathRef} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </svg>
        </div>
      ) : null}
    </>
  );
}
