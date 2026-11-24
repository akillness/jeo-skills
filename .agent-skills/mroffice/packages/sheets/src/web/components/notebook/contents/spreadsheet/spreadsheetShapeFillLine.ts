/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Excel's Format Shape > Fill & Line on a sheet shape through the shared
 * page (`officeChartFillLineSections`, the one the deck's and Word's shapes
 * and every chart element use): the shape's style read as the page's
 * record, and a record the page writes back as the worksheet's own visible
 * commands -- Fill & Line (fill, pattern, gradients, transparency, weight),
 * Dash type, Line detail (compound, cap, join) and Arrows -- each a receipt
 * the command authority checks, one Undo each.
 */

import { PX_PER_PT } from "@mrnote/core/web/lib/office-units.ts";
import {
  officeChartFillKind,
  officeChartLineKind,
  type OfficeChartPaintStyle,
} from "@mrnote/core/web/components/office-ribbon/officeChartFillLinePage.tsx";
import {
  presentationShapeLineEndsForPane,
  presentationShapeLineEndsFromPane,
} from "@mrnote/slides/web/components/notebook/contents/presentation/presentationShapeFillLine.ts";
import type { OfficeLineEndsState } from "@mrnote/core/web/lib/office-line-ends.ts";
import type { SpreadsheetShapeStyle } from "@mrnote/core/web/lib/spreadsheet/shapes.ts";

const opacityOf = (transparency: number | null | undefined): number | undefined =>
  typeof transparency === "number" && transparency >= 1 && transparency <= 100 ? (100 - transparency) / 100 : undefined;

function transparencyOf(opacity: number | undefined): number | null {
  if (opacity === undefined) return null;
  const percent = Math.round((1 - opacity) * 100);
  return percent >= 1 ? Math.min(100, percent) : null;
}

/** The shape's fill and line as the shared page's style record. */
export function spreadsheetShapeFillLineStyle(
  style: SpreadsheetShapeStyle,
  lineEnds?: OfficeLineEndsState | null,
): OfficeChartPaintStyle {
  const pattern = style.fillGradient ? null : (style.fillPattern ?? null);
  const lineGradient = style.stroke !== "none" ? (style.outlineGradient ?? null) : null;
  const shapePaint: Record<string, unknown> = {
    outlineWidthPt: Math.round((style.strokeWidth / PX_PER_PT) * 100) / 100,
    ...(style.fillGradient ? { fillGradient: style.fillGradient } : {}),
    ...(lineGradient ? { lineGradient } : {}),
    ...(pattern ? { fillPattern: pattern } : {}),
    ...(style.outlineDash && style.outlineDash !== "solid" ? { lineDash: style.outlineDash } : {}),
    ...(!style.fillGradient && !pattern && opacityOf(style.fillTransparency) !== undefined
      ? { fillAlpha: opacityOf(style.fillTransparency) }
      : {}),
    ...(!lineGradient && opacityOf(style.outlineTransparency) !== undefined
      ? { lineAlpha: opacityOf(style.outlineTransparency) }
      : {}),
    ...(style.outlineCompound ? { lineCompound: style.outlineCompound } : {}),
    ...(style.outlineCap ? { lineCap: style.outlineCap } : {}),
    ...(style.outlineJoin ? { lineJoin: style.outlineJoin } : {}),
  };
  const ends = presentationShapeLineEndsForPane(lineEnds ?? null);
  if (ends) shapePaint.lineEnds = ends;
  return {
    fill: (pattern ? pattern.foreground : style.fill) as OfficeChartPaintStyle["fill"],
    outline: style.stroke as OfficeChartPaintStyle["outline"],
    shapePaint: shapePaint as OfficeChartPaintStyle["shapePaint"],
  };
}

const same = (left: unknown, right: unknown) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

/**
 * The worksheet commands the page's new record asks for: the Fill & Line
 * command's JSON, a Dash type, a Line detail JSON and the line ends (each
 * null when unchanged).
 */
export function spreadsheetShapeFillLineChange(
  previous: OfficeChartPaintStyle,
  next: OfficeChartPaintStyle,
  /** Write the fill even when it reads unchanged (leaving a picture fill). */
  options?: { readonly fillRestated?: boolean },
): {
  readonly fillLine: string | null;
  readonly dash: string | null;
  readonly detail: string | null;
  readonly ends: OfficeLineEndsState | null;
} {
  const before = previous.shapePaint ?? {};
  const after = next.shapePaint ?? {};
  const paint: Record<string, unknown> = {};
  if (
    options?.fillRestated === true ||
    !same(previous.fill, next.fill) ||
    !same(before.fillGradient, after.fillGradient) ||
    !same(before.fillPattern, after.fillPattern) ||
    !same(before.fillAlpha, after.fillAlpha)
  ) {
    const kind = officeChartFillKind(next);
    Object.assign(paint, { fillGradient: null, fillPattern: null, fillTransparency: null });
    if (kind === "none") paint.fill = "none";
    else if (kind === "gradient" && after.fillGradient) {
      paint.fill = after.fillGradient.stops[0]?.color;
      paint.fillGradient = after.fillGradient;
    } else if (kind === "pattern" && after.fillPattern) {
      paint.fill = after.fillPattern.foreground;
      paint.fillPattern = after.fillPattern;
    } else {
      paint.fill = next.fill;
      paint.fillTransparency = transparencyOf(after.fillAlpha);
    }
  }
  if (!same(previous.outline, next.outline) || !same(before.lineGradient, after.lineGradient) || !same(before.lineAlpha, after.lineAlpha)) {
    const kind = officeChartLineKind(next);
    Object.assign(paint, { outlineGradient: null, outlineTransparency: null });
    if (kind === "none") paint.stroke = "none";
    else if (kind === "gradient" && after.lineGradient) {
      paint.stroke = after.lineGradient.stops[0]?.color;
      paint.outlineGradient = after.lineGradient;
    } else {
      paint.stroke = next.outline;
      paint.outlineTransparency = transparencyOf(after.lineAlpha);
    }
  }
  if (!same(before.outlineWidthPt, after.outlineWidthPt) && after.outlineWidthPt !== undefined) {
    paint.strokeWidth = Math.round(after.outlineWidthPt * PX_PER_PT * 100) / 100;
  }
  const detail: Record<string, unknown> = {};
  if (!same(before.lineCompound, after.lineCompound)) detail.outlineCompound = after.lineCompound ?? "single";
  if (!same(before.lineCap, after.lineCap)) detail.outlineCap = after.lineCap ?? "flat";
  if (!same(before.lineJoin, after.lineJoin)) detail.outlineJoin = after.lineJoin ?? "miter";
  return {
    fillLine: Object.keys(paint).length ? JSON.stringify(paint) : null,
    dash: same(before.lineDash, after.lineDash) ? null : String(after.lineDash ?? "solid"),
    detail: Object.keys(detail).length ? JSON.stringify(detail) : null,
    ends: same(before.lineEnds, after.lineEnds) ? null : presentationShapeLineEndsFromPane(after.lineEnds),
  };
}
