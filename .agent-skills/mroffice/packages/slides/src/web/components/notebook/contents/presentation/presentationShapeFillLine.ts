/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Format Shape > Fill & Line on a slide shape through the shared page
 * (`officeChartFillLineSections`, the one chart elements use): the shape's
 * paint read as the page's style record, and a record the page writes back
 * as the shape's fields.
 *
 * The deck keeps a fill as `fill` with, beside it, a two-colour `fillTo` /
 * `gradientAngle` (an older page's gradient), a whole `fillGradient`, a
 * `fillPattern` (Office's preset, or the slide background's four) and a
 * solid fill's `fillTransparency`; a line as `stroke` with `strokeTo` /
 * `strokeGradientAngle`, a whole `strokeGradient` and a solid line's
 * `outlineTransparency`, and its weight in px. The page sees one gradient
 * whichever form the shape states, and writes the whole form back with the
 * two-colour projection an older client draws (the line's, as the schema
 * keeps it beside the gradient).
 */

import { CSS_PX_PER_POINT } from "@mrnote/core/web/lib/presentation/text-units.ts";
import type { PresentationShapeBlock } from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import {
  officeChartFillKind,
  officeChartLineKind,
  type OfficeChartPaintStyle,
} from "@mrnote/core/web/components/office-ribbon/officeChartFillLinePage.tsx";
import { officeFillPatternOf, type OfficeChartLineEnds } from "@mrnote/core/web/lib/office-chart-shape-paint.ts";
import type { OfficeLineEndsState } from "@mrnote/core/web/lib/office-line-ends.ts";
import { normalizeOfficeShapeGradient, officeGradientAngle, type OfficeShapeGradient } from "@mrnote/core/web/lib/office-shape-paint.ts";
import type { OfficeStrokeCap, OfficeStrokeCompound, OfficeStrokeJoin } from "@mrnote/core/web/lib/office-stroke-detail.ts";
import type { OfficeMenuDash } from "@mrnote/core/web/lib/office-stroke-dash.ts";
import {
  presentationShapeObjectOutlineMenuDash,
  presentationShapeObjectShapePatch,
  presentationShapeShownOutlineWidth,
} from "@mrnote/core/web/lib/presentation-shape-style-adapter.ts";
import {
  DEFAULT_SHAPE_FILL,
  DEFAULT_SHAPE_STROKE,
  DEFAULT_STROKE_WIDTH,
  MAX_STROKE_WIDTH,
  normalizeGradientAngle,
  normalizeShapeColor,
  normalizeStrokeWidth,
} from "@mrnote/core/web/lib/presentation-shapes.ts";

const PX_PER_PT = CSS_PX_PER_POINT;

/** A two-colour gradient (`from` -> `to` at a CSS angle) as the whole form. */
function twoColourGradient(from: string, to: string, angle: unknown): OfficeShapeGradient {
  return {
    angle: normalizeGradientAngle(angle) % 360,
    stops: [
      { position: 0, color: from },
      { position: 1, color: to },
    ],
  };
}

/** A whole-percent Transparency from an opacity (absent: opaque). */
function transparencyOf(opacity: number | undefined): number | undefined {
  if (opacity === undefined) return undefined;
  const percent = Math.round((1 - opacity) * 100);
  return percent >= 1 ? Math.min(100, percent) : undefined;
}

const opacityOf = (transparency: unknown): number | undefined =>
  typeof transparency === "number" && transparency >= 1 && transparency <= 100 ? (100 - transparency) / 100 : undefined;

/** Office's Begin / End Arrow as the page states them (no end: none). */
export function presentationShapeLineEndsForPane(ends: OfficeLineEndsState | null): OfficeChartLineEnds | undefined {
  if (!ends) return undefined;
  const next: Record<string, string> = {};
  for (const side of ["head", "tail"] as const) {
    const type = ends[`${side}End`];
    if (!type || type === "none") continue;
    next[`${side}End`] = type;
    const width = ends[`${side}EndWidth`];
    const length = ends[`${side}EndLength`];
    if (width) next[`${side}EndWidth`] = width;
    if (length) next[`${side}EndLength`] = length;
  }
  return Object.keys(next).length ? (next as OfficeChartLineEnds) : undefined;
}

/** The page's Begin / End Arrow back as the deck's line ends. */
export function presentationShapeLineEndsFromPane(ends: OfficeChartLineEnds | undefined): OfficeLineEndsState {
  const state: Record<string, string> = { headEnd: ends?.headEnd ?? "none", tailEnd: ends?.tailEnd ?? "none" };
  for (const side of ["head", "tail"] as const) {
    const width = ends?.[`${side}EndWidth`];
    const length = ends?.[`${side}EndLength`];
    if (width) state[`${side}EndWidth`] = width;
    if (length) state[`${side}EndLength`] = length;
  }
  return state as unknown as OfficeLineEndsState;
}

/** The shape's fill and line as the shared page's style record. */
export function presentationShapeFillLineStyle(
  block: PresentationShapeBlock,
  lineEnds?: OfficeLineEndsState | null,
): OfficeChartPaintStyle {
  const record = block as unknown as Record<string, unknown>;
  const fill = block.fill === "none" ? "none" : (normalizeShapeColor(block.fill, DEFAULT_SHAPE_FILL) ?? DEFAULT_SHAPE_FILL);
  const stroke =
    block.stroke === "none" ? "none" : (normalizeShapeColor(block.stroke, DEFAULT_SHAPE_STROKE) ?? DEFAULT_SHAPE_STROKE);
  const fillTo = normalizeShapeColor(block.fillTo, null);
  const strokeTo = normalizeShapeColor(record.strokeTo, null);
  const fillGradient =
    normalizeOfficeShapeGradient(block.fillGradient) ??
    (fill !== "none" && fillTo ? twoColourGradient(fill, fillTo, block.gradientAngle) : undefined);
  const lineGradient =
    normalizeOfficeShapeGradient(record.strokeGradient) ??
    (stroke !== "none" && strokeTo ? twoColourGradient(stroke, strokeTo, record.strokeGradientAngle) : undefined);
  const fillPattern = fillGradient ? null : officeFillPatternOf(record.fillPattern);
  const dash = presentationShapeObjectOutlineMenuDash(block);
  const shapePaint: Record<string, unknown> = {
    outlineWidthPt: Math.round((normalizeStrokeWidth(block.strokeWidth) / PX_PER_PT) * 100) / 100,
    ...(fillGradient ? { fillGradient } : {}),
    ...(lineGradient ? { lineGradient } : {}),
    ...(fillPattern ? { fillPattern } : {}),
    ...(dash && dash !== "solid" ? { lineDash: dash } : {}),
    ...(!fillGradient && !fillPattern && opacityOf(block.fillTransparency) !== undefined
      ? { fillAlpha: opacityOf(block.fillTransparency) }
      : {}),
    ...(!lineGradient && opacityOf(record.outlineTransparency) !== undefined
      ? { lineAlpha: opacityOf(record.outlineTransparency) }
      : {}),
    ...(block.outlineCompound ? { lineCompound: block.outlineCompound } : {}),
    ...(block.outlineCap ? { lineCap: block.outlineCap } : {}),
    ...(block.outlineJoin ? { lineJoin: block.outlineJoin } : {}),
  };
  const ends = presentationShapeLineEndsForPane(lineEnds ?? null);
  if (ends) shapePaint.lineEnds = ends;
  return {
    fill: fillPattern ? (fillPattern.foreground as `#${string}`) : (fill as OfficeChartPaintStyle["fill"]),
    outline: stroke as OfficeChartPaintStyle["outline"],
    shapePaint: shapePaint as OfficeChartPaintStyle["shapePaint"],
  };
}

const same = (left: unknown, right: unknown) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

/**
 * What the page's new record changes on the shape: the block patch, and the
 * line ends when Begin / End Arrow changed (the window's own writer puts
 * them on the line or connector). Null patch when the fill and line are as
 * they were.
 */
export function presentationShapeFillLineChange(
  block: PresentationShapeBlock,
  previous: OfficeChartPaintStyle,
  next: OfficeChartPaintStyle,
): { readonly patch: Partial<PresentationShapeBlock> | null; readonly ends: OfficeLineEndsState | null } {
  const before = previous.shapePaint ?? {};
  const after = next.shapePaint ?? {};
  const patch: Record<string, unknown> = {};

  // ---- Fill ----------------------------------------------------------------
  if (
    !same(previous.fill, next.fill) ||
    !same(before.fillGradient, after.fillGradient) ||
    !same(before.fillPattern, after.fillPattern) ||
    !same(before.fillAlpha, after.fillAlpha)
  ) {
    const kind = officeChartFillKind(next);
    // Any of these leaves a picture fill (Picture is picked by its own row).
    if (block.fillImage) patch.fillImage = undefined;
    Object.assign(patch, { fillTo: undefined, gradientAngle: undefined, fillGradient: undefined, fillPattern: undefined, fillTransparency: undefined });
    if (kind === "none") patch.fill = "none";
    else if (kind === "gradient" && after.fillGradient) {
      patch.fill = after.fillGradient.stops[0]?.color ?? DEFAULT_SHAPE_FILL;
      patch.fillGradient = after.fillGradient;
    } else if (kind === "pattern" && after.fillPattern) {
      patch.fill = after.fillPattern.foreground;
      patch.fillPattern = { ...after.fillPattern };
    } else {
      patch.fill = normalizeShapeColor(next.fill, DEFAULT_SHAPE_FILL) ?? DEFAULT_SHAPE_FILL;
      patch.fillTransparency = transparencyOf(after.fillAlpha);
    }
  }

  // ---- Line ----------------------------------------------------------------
  if (!same(previous.outline, next.outline) || !same(before.lineGradient, after.lineGradient) || !same(before.lineAlpha, after.lineAlpha)) {
    const kind = officeChartLineKind(next);
    const wasNone = officeChartLineKind(previous) === "none";
    Object.assign(patch, { strokeTo: undefined, strokeGradient: undefined, strokeGradientAngle: undefined, outlineTransparency: undefined });
    if (kind === "none") patch.stroke = "none";
    else {
      // A line turned on is drawn at the weight the shape shows.
      if (wasNone) Object.assign(patch, presentationShapeShownOutlineWidth(block));
      if (kind === "gradient" && after.lineGradient) {
        const stops = after.lineGradient.stops;
        patch.stroke = stops[0]?.color ?? DEFAULT_SHAPE_STROKE;
        patch.strokeGradient = after.lineGradient;
        patch.strokeTo = stops[stops.length - 1]?.color ?? patch.stroke;
        patch.strokeGradientAngle = officeGradientAngle(after.lineGradient);
      } else {
        patch.stroke = normalizeShapeColor(next.outline, DEFAULT_SHAPE_STROKE) ?? DEFAULT_SHAPE_STROKE;
        patch.outlineTransparency = transparencyOf(after.lineAlpha);
      }
    }
  }
  if (!same(before.outlineWidthPt, after.outlineWidthPt)) {
    const px = after.outlineWidthPt === undefined ? DEFAULT_STROKE_WIDTH : after.outlineWidthPt * PX_PER_PT;
    patch.strokeWidth = normalizeStrokeWidth(Math.min(MAX_STROKE_WIDTH, Math.round(px * 100) / 100));
  }
  if (!same(before.lineDash, after.lineDash)) {
    Object.assign(
      patch,
      presentationShapeObjectShapePatch({ outlineDash: (after.lineDash ?? "solid") as OfficeMenuDash }, block),
    );
  }
  if (!same(before.lineCompound, after.lineCompound)) patch.outlineCompound = after.lineCompound as OfficeStrokeCompound | undefined;
  if (!same(before.lineCap, after.lineCap)) patch.outlineCap = after.lineCap as OfficeStrokeCap | undefined;
  if (!same(before.lineJoin, after.lineJoin)) {
    patch.outlineJoin = after.lineJoin as OfficeStrokeJoin | undefined;
    if (after.lineJoin !== "miter") patch.outlineMiterLimit = undefined;
  }
  const ends = same(before.lineEnds, after.lineEnds) ? null : presentationShapeLineEndsFromPane(after.lineEnds);
  return { patch: Object.keys(patch).length ? (patch as Partial<PresentationShapeBlock>) : null, ends };
}
