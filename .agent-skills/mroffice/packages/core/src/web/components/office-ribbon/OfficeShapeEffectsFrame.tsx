"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A shape's Office effects (lib/office-shape-effects-paint) around whatever
 * draws the shape. Three layers, so each effect sees the right pixels:
 *
 * - the outer frame takes the 3-D rotation and the reflection (Office turns
 *   and mirrors the shape with its effects);
 * - a silhouette of the shape in the shadow colour sits under the shape for a
 *   scaled or skewed (Perspective) shadow;
 * - the inner frame takes the SVG filter on the shape's own alpha (soft
 *   edges, inner shadow, bevel) and then the outer shadow and glow, so the
 *   bevel never rims the silhouette and the glow never haloes it.
 */

import { createElement, type CSSProperties, type ReactNode } from "react";

import {
  officeShapeEffectsFilterRegion,
  type OfficeShapeEffectPrimitive,
  type OfficeShapeEffectsPaint,
} from "../../lib/office-shape-effects-paint";

const camel = (name: string) => name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());

/** One filter primitive of a paint (and its children) as a React element. */
export function renderPrimitive(primitive: OfficeShapeEffectPrimitive, key: number): ReactNode {
  const props: Record<string, string | number> = { key };
  for (const [name, value] of Object.entries(primitive.attrs)) props[camel(name)] = value;
  return createElement(
    primitive.tag,
    props,
    ...(primitive.children ?? []).map((child, index) => renderPrimitive(child, index)),
  );
}

const LAYER: CSSProperties = { position: "absolute", inset: 0, display: "block" };

function lights(primitives: readonly OfficeShapeEffectPrimitive[]): boolean {
  return primitives.some(
    (primitive) =>
      primitive.tag === "feDiffuseLighting" || primitive.tag === "feSpecularLighting" || lights(primitive.children ?? []),
  );
}









export const LIGHTING_FILTER_LAYER: CSSProperties = { transform: "rotate(0.001deg)" };

/** The paint's SVG filter (`primitives`) as a zero-size definition, for a
 * host that applies it by `url(#filterId)`; nothing when it has none. */
export function OfficeShapeEffectsFilterDefs({ paint, filterId }: { paint: OfficeShapeEffectsPaint; filterId: string }) {
  if (!paint.primitives.length) return null;
  return (
    <svg width="0" height="0" aria-hidden focusable="false" style={{ position: "absolute", overflow: "hidden" }}>
      <defs>
        <filter
          id={filterId}
          {...officeShapeEffectsFilterRegion(paint)}
          colorInterpolationFilters="sRGB"
          data-testid="office-shape-effects-filter"
        >
          {paint.primitives.map((primitive, index) => renderPrimitive(primitive, index))}
        </filter>
      </defs>
    </svg>
  );
}

/** Whether the paint's filter lights the shape (`LIGHTING_FILTER_LAYER` then applies). */
export function officeShapeEffectsLight(paint: OfficeShapeEffectsPaint): boolean {
  return paint.primitives.length > 0 && lights(paint.primitives);
}

export function OfficeShapeEffectsFrame({
  paint,
  filterId,
  silhouette,
  children,
}: {
  paint: OfficeShapeEffectsPaint;
  /** Unique per shape on the page (the `<filter>` lives beside the shape). */
  filterId: string;
  /** The shape painted in `paint.silhouette.color`, for a Perspective shadow. */
  silhouette?: ReactNode;
  children: ReactNode;
}) {
  const innerFilter = [paint.primitives.length ? `url(#${filterId})` : "", ...paint.cssFilters]
    .filter(Boolean)
    .join(" ");
  return (
    <span
      data-office-shape-effects=""
      // The shape drawn turned (a 3-D rotation, a camera): a host hit-tested
      // where it is drawn finds it here.
      data-office-shape-turned={paint.transform ? "" : undefined}
      style={{
        ...LAYER,
        ...(paint.transform ? { transform: paint.transform, transformStyle: "preserve-3d" } : {}),
        ...(paint.reflect ? { WebkitBoxReflect: paint.reflect } : {}),
      } as CSSProperties}
    >
      <OfficeShapeEffectsFilterDefs paint={paint} filterId={filterId} />
      {paint.silhouette && silhouette ? (
        <span
          data-office-shape-shadow-silhouette=""
          aria-hidden
          style={{
            ...LAYER,
            pointerEvents: "none",
            transform: paint.silhouette.transform || undefined,
            transformOrigin: paint.silhouette.transformOrigin,
            filter: paint.silhouette.filter || undefined,
          }}
        >
          {silhouette}
        </span>
      ) : null}
      <span
        style={{
          ...LAYER,
          ...(innerFilter ? { filter: innerFilter } : {}),
          ...(officeShapeEffectsLight(paint) ? LIGHTING_FILTER_LAYER : {}),
        }}
      >
        {children}
      </span>
    </span>
  );
}
