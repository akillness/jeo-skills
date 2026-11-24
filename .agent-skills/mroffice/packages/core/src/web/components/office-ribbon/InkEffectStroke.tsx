"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A pen effect's stroke as React elements: the plan of
 * `lib/office-ink-effects` (its gradient and its layers), drawn one to one.
 * The deck's and the worksheet's landed strokes, the ink replay and the pen
 * menu's effect tiles draw effects with this, so a stroke looks the same in
 * every one of them and in the Docs node view (which builds the same plan by
 * hand, `appendInkEffectSvg`).
 */

import { Fragment, type SVGProps } from "react";

import {
  inkEffectPaint,
  inkEffectSvgPlan,
  type InkEffectId,
  type InkEffectStrokeGeometry,
  type InkEffectSvgPlan,
} from "../../lib/office-ink-effects";

export function InkEffectSvgGradient({ plan }: { plan: InkEffectSvgPlan }) {
  const { gradient } = plan;
  return (
    <linearGradient
      id={plan.gradientId}
      gradientUnits="userSpaceOnUse"
      x1={gradient.x1}
      y1={gradient.y1}
      x2={gradient.x2}
      y2={gradient.y2}
    >
      {gradient.stops.map((stop, index) => (
        <stop key={index} offset={Number(stop.offset.toFixed(5))} stopColor={stop.color} />
      ))}
    </linearGradient>
  );
}

export function InkEffectSvgPaths({
  plan,
  pathProps,
  baseProps,
}: {
  plan: InkEffectSvgPlan;
  /** On every path (pointer-events, a dash array…). */
  pathProps?: SVGProps<SVGPathElement>;
  /** On the base layer's paths only (test ids, `data-ink-pressure`). */
  baseProps?: SVGProps<SVGPathElement> & Record<`data-${string}`, string | undefined>;
}) {
  return (
    <>
      {plan.paths.map((path, index) => (
        <path
          key={index}
          d={path.d}
          fill={path.fill}
          stroke={path.stroke}
          strokeWidth={path.strokeWidth}
          strokeLinecap={path.stroke !== "none" ? path.linecap ?? "round" : undefined}
          strokeLinejoin={path.stroke !== "none" ? "round" : undefined}
          opacity={path.opacity < 1 ? Number(path.opacity.toFixed(3)) : undefined}
          // Inline: a menu's icon rule sets every svg line's width (the pen
          // menu's tiles and sample draw strokes, not icons).
          style={path.strokeWidth !== undefined ? { strokeWidth: path.strokeWidth, vectorEffect: "none" } : undefined}
          data-ink-layer={path.role}
          {...pathProps}
          {...(path.role === "base" ? baseProps : null)}
        />
      ))}
    </>
  );
}

/** A whole stroke in an effect: its gradient in a `<defs>` and its layers. */
export function InkEffectStroke({
  effect,
  geometry,
  gradientId,
  pathProps,
  baseProps,
}: {
  effect: InkEffectId;
  geometry: InkEffectStrokeGeometry;
  gradientId: string;
  pathProps?: SVGProps<SVGPathElement>;
  baseProps?: SVGProps<SVGPathElement> & Record<`data-${string}`, string | undefined>;
}) {
  const plan = inkEffectSvgPlan(inkEffectPaint(effect), geometry, gradientId);
  return (
    <Fragment>
      <defs>
        <InkEffectSvgGradient plan={plan} />
      </defs>
      <InkEffectSvgPaths plan={plan} pathProps={pathProps} baseProps={baseProps} />
    </Fragment>
  );
}

/** The S-curve an effect tile and the custom editor's preview draw (in a 0 0 56 28 box). */
export const INK_EFFECT_SWATCH_POINTS: readonly { x: number; y: number }[] = (() => {
  const points: { x: number; y: number }[] = [];
  for (let index = 0; index <= 24; index += 1) {
    const t = index / 24;
    points.push({ x: 7 + t * 42, y: 14 + Math.sin(t * Math.PI * 2) * 7 });
  }
  return points;
})();

/** A short stroke in an effect, for a menu tile or a preview. */
export function InkEffectSwatch({
  effect,
  id,
  width = 56,
  height = 28,
  strokeWidth = 4.2,
}: {
  effect: InkEffectId;
  /** A unique id for the swatch's gradient. */
  id: string;
  width?: number;
  height?: number;
  strokeWidth?: number;
}) {
  const scaleX = width / 56;
  const scaleY = height / 28;
  const points = INK_EFFECT_SWATCH_POINTS.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY }));
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      focusable="false"
      style={{ display: "block", overflow: "visible" }}
    >
      <InkEffectStroke
        effect={effect}
        gradientId={id}
        geometry={{ points, widthPx: strokeWidth, pressured: false }}
      />
    </svg>
  );
}
