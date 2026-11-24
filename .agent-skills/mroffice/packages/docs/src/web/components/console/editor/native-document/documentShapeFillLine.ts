/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's Format Shape > Fill & Line on a document shape through the shared
 * page (`officeChartFillLineSections`, the one the deck's shapes and every
 * chart element use): the shape's attributes read as the page's style
 * record, and a record the page writes back as one Shape Format request (the
 * Dash type through Shape Outline's own paint writer, the arrows through the
 * toolbar's line-ends writer). Clearing writes null, as the server keeps
 * what a page does not state.
 */

import type { OfficeChartPaintStyle } from "@mrnote/core/web/components/office-ribbon/officeChartFillLinePage.tsx";
import { officeChartFillKind, officeChartLineKind } from "@mrnote/core/web/components/office-ribbon/officeChartFillLinePage.tsx";
import type { DocumentShapeAttrs, DocumentShapeFormatRequest } from "@mrnote/core/web/lib/document-shapes.ts";
import type { OfficeChartLineEnds } from "@mrnote/core/web/lib/office-chart-shape-paint.ts";
import type { OfficeLineEndsState } from "@mrnote/core/web/lib/office-line-ends.ts";
import { officeMenuDashOf, type OfficeMenuDash } from "@mrnote/core/web/lib/office-stroke-dash.ts";
import {
  presentationShapeLineEndsForPane,
  presentationShapeLineEndsFromPane,
} from "@mrnote/slides/web/components/notebook/contents/presentation/presentationShapeFillLine.ts";

const opacityOf = (transparency: number | null | undefined): number | undefined =>
  typeof transparency === "number" && transparency >= 1 && transparency <= 100 ? (100 - transparency) / 100 : undefined;

function transparencyOf(opacity: number | undefined): number | null {
  if (opacity === undefined) return null;
  const percent = Math.round((1 - opacity) * 100);
  return percent >= 1 ? Math.min(100, percent) : null;
}

/** The shape's fill and line as the shared page's style record. */
export function documentShapeFillLineStyle(
  attrs: DocumentShapeAttrs,
  lineEnds?: OfficeLineEndsState | null,
): OfficeChartPaintStyle {
  const pattern = attrs.fillGradient ? null : (attrs.fillPattern ?? null);
  const dash = officeMenuDashOf(attrs.outlineStyle, attrs.outlineDash);
  const shapePaint: Record<string, unknown> = {
    outlineWidthPt: attrs.outlineWidthPt,
    ...(attrs.fillGradient ? { fillGradient: attrs.fillGradient } : {}),
    ...(attrs.outlineGradient && attrs.outline !== "none" ? { lineGradient: attrs.outlineGradient } : {}),
    ...(pattern ? { fillPattern: pattern } : {}),
    ...(dash && dash !== "solid" ? { lineDash: dash } : {}),
    ...(!attrs.fillGradient && !pattern && opacityOf(attrs.fillTransparency) !== undefined
      ? { fillAlpha: opacityOf(attrs.fillTransparency) }
      : {}),
    ...(!attrs.outlineGradient && opacityOf(attrs.outlineTransparency) !== undefined
      ? { lineAlpha: opacityOf(attrs.outlineTransparency) }
      : {}),
    ...(attrs.outlineCompound ? { lineCompound: attrs.outlineCompound } : {}),
    ...(attrs.outlineCap ? { lineCap: attrs.outlineCap } : {}),
    ...(attrs.outlineJoin ? { lineJoin: attrs.outlineJoin } : {}),
  };
  const ends: OfficeChartLineEnds | undefined = presentationShapeLineEndsForPane(lineEnds ?? null);
  if (ends) shapePaint.lineEnds = ends;
  return {
    fill: (pattern ? pattern.foreground : attrs.fill) as OfficeChartPaintStyle["fill"],
    outline: attrs.outline as OfficeChartPaintStyle["outline"],
    shapePaint: shapePaint as OfficeChartPaintStyle["shapePaint"],
  };
}

const same = (left: unknown, right: unknown) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

/**
 * What the page's new record changes: one Shape Format request (null when
 * none), a Dash type for Shape Outline's paint writer, and the line ends.
 */
export function documentShapeFillLineChange(
  previous: OfficeChartPaintStyle,
  next: OfficeChartPaintStyle,
  /** Write the fill even when it reads unchanged (leaving a picture fill). */
  options?: { readonly fillRestated?: boolean },
): {
  readonly request: DocumentShapeFormatRequest | null;
  readonly dash: OfficeMenuDash | null;
  readonly ends: OfficeLineEndsState | null;
} {
  const before = previous.shapePaint ?? {};
  const after = next.shapePaint ?? {};
  const request: Record<string, unknown> = {};
  if (
    options?.fillRestated === true ||
    !same(previous.fill, next.fill) ||
    !same(before.fillGradient, after.fillGradient) ||
    !same(before.fillPattern, after.fillPattern) ||
    !same(before.fillAlpha, after.fillAlpha)
  ) {
    const kind = officeChartFillKind(next);
    // Any fill kind written replaces a picture fill (`documentShapeFormatPatch`).
    Object.assign(request, { fillGradient: null, fillPattern: null, fillTransparency: null });
    if (kind === "none") request.fill = "none";
    else if (kind === "gradient" && after.fillGradient) {
      request.fill = after.fillGradient.stops[0]?.color;
      request.fillGradient = after.fillGradient;
    } else if (kind === "pattern" && after.fillPattern) {
      request.fill = after.fillPattern.foreground;
      request.fillPattern = after.fillPattern;
    } else {
      request.fill = next.fill;
      request.fillTransparency = transparencyOf(after.fillAlpha);
    }
  }
  if (!same(previous.outline, next.outline) || !same(before.lineGradient, after.lineGradient) || !same(before.lineAlpha, after.lineAlpha)) {
    const kind = officeChartLineKind(next);
    Object.assign(request, { outlineGradient: null, outlineTransparency: null });
    if (kind === "none") request.outline = "none";
    else if (kind === "gradient" && after.lineGradient) {
      request.outline = after.lineGradient.stops[0]?.color;
      request.outlineGradient = after.lineGradient;
    } else {
      request.outline = next.outline;
      request.outlineTransparency = transparencyOf(after.lineAlpha);
    }
  }
  if (!same(before.outlineWidthPt, after.outlineWidthPt) && after.outlineWidthPt !== undefined) {
    request.outlineWidthPt = after.outlineWidthPt;
  }
  if (!same(before.lineCompound, after.lineCompound)) request.outlineCompound = after.lineCompound ?? null;
  if (!same(before.lineCap, after.lineCap)) request.outlineCap = after.lineCap ?? "flat";
  if (!same(before.lineJoin, after.lineJoin)) {
    request.outlineJoin = after.lineJoin ?? "miter";
    if (after.lineJoin !== "miter") request.outlineMiterLimit = null;
  }
  return {
    request: Object.keys(request).length ? (request as DocumentShapeFormatRequest) : null,
    dash: same(before.lineDash, after.lineDash) ? null : ((after.lineDash ?? "solid") as OfficeMenuDash),
    ends: same(before.lineEnds, after.lineEnds) ? null : presentationShapeLineEndsFromPane(after.lineEnds),
  };
}
