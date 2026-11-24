/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A Docs chart in a shape group (Word's Group on a floating chart and the
 * shapes beside it; Microsoft Support, "Group or ungroup shapes, pictures, or
 * other objects": a chart that floats -- in front of or behind text, or with
 * a wrap -- groups, one in line with its text does not).
 *
 * The group is the one `documentShape` group model: the chart is a member of
 * `kind: "chart"` carrying the chart as the page's chart node states one, at
 * its box in the group's child space. The DOCX writers give that member a
 * `wpg:graphicFrame` in the `wpg:wgp` and its own chart part
 * (`document_docx_shape_xml.document_shape_chart_member_xml`), and the reader
 * reads it back the same way (corpus R48-D09). Ungroup gives the chart node
 * back, floating where the member stood.
 */

import { normalizeFloatAnchor } from "../../../../lib/office-float-anchor";
import { floatAnchorOutOfLine, type FloatWrapChoice } from "../../../../lib/office-float-anchor-edit";
import type { DocumentShapeAttrs } from "../../../../lib/document-shapes";

import {
  DOCUMENT_CHART_EX_FAMILIES,
  DEFAULT_DOCUMENT_CHART_SIZE,
  documentChartSize,
  normalizeDocumentChartHost,
  type DocumentChartHost,
} from "../extensions/documentChartHost";

/** The node attrs that place or identify a chart on its page, never its chart. */
const CHART_PLACE_ATTRS: ReadonlySet<string> = new Set([
  "block_id",
  "anchor_id",
  "floatAnchor",
  "textAlign",
  "trackObjectInsertion",
  "trackObjectDeletion",
]);

function host(attrs: Readonly<Record<string, unknown>>): DocumentChartHost | undefined {
  try {
    return normalizeDocumentChartHost(attrs.documentChart);
  } catch {
    return undefined;
  }
}

/**
 * The layer a floating chart stands at (`wp:anchor@relativeHeight`), or null
 * for a chart in line with its text, which does not float and so does not
 * group.
 */
export function documentChartFloatingHeight(attrs: Readonly<Record<string, unknown>>): number | null {
  const anchor = normalizeFloatAnchor(attrs.floatAnchor);
  if (anchor) return anchor.relativeHeight;
  const layout = host(attrs)?.layout;
  return layout?.mode === "floating" ? layout.relativeHeight : null;
}

/**
 * Whether Group may take this chart: a block chart that floats, made in the
 * editor, in the whole chart model (a chart kept from the opened file keeps its own part, as a shape
 * from the file does), of a family a group frame holds (Office 2016 charts
 * are `cx:chart` parts, which `wpg:graphicFrame` does not carry).
 */
export function documentChartGroupable(
  typeName: string,
  attrs: Readonly<Record<string, unknown>>,
): boolean {
  return (
    typeName === "chart" &&
    documentChartFloatingHeight(attrs) !== null &&
    (attrs.source === null || attrs.source === undefined) &&
    // The chart model a member states (`normalize_document_chart_attrs`):
    // a whole V2 chart; an old partial one is not grouped until rewritten.
    attrs.schemaVersion === 2 &&
    typeof attrs.chartSubtype === "string" &&
    !DOCUMENT_CHART_EX_FAMILIES.has(String(attrs.chartType))
  );
}

/** A floating chart the shapes' multi-selection may hold (picked, moved along). */
export function documentChartPickable(typeName: string, attrs: Readonly<Record<string, unknown>>): boolean {
  return typeName === "chart" && documentChartFloatingHeight(attrs) !== null;
}

/** The chart's size on the page (EMU). */
export function documentChartGroupSize(attrs: Readonly<Record<string, unknown>>): {
  readonly widthEmu: number;
  readonly heightEmu: number;
} {
  try {
    return documentChartSize(attrs as Record<string, unknown>) ?? DEFAULT_DOCUMENT_CHART_SIZE;
  } catch {
    return DEFAULT_DOCUMENT_CHART_SIZE;
  }
}

/**
 * A chart node's attrs as its group member states the chart: the chart and
 * its workbook at its size; nothing that places it on the page (its anchor,
 * its coarse floating layout, its block identity) -- the group places it.
 */
export function documentChartGroupMemberChart(
  attrs: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const chart: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (CHART_PLACE_ATTRS.has(key) || value === undefined || key === "source") continue;
    chart[key] = value;
  }
  const own = host(attrs);
  chart.documentChart = {
    version: 1,
    size: documentChartGroupSize(attrs),
    ...(own?.workbook ? { workbook: own.workbook } : {}),
  };
  return chart;
}

/**
 * The chart node Ungroup gives back for a chart member: its chart, at the
 * member's size, floating where the member stood -- `frame`'s offsets from
 * the column and the paragraph, which is where the shapes released beside it
 * stand too -- with the group's wrap and the member's layer.
 */
export function documentChartFromGroupMember(
  chart: Readonly<Record<string, unknown>>,
  frame: Pick<DocumentShapeAttrs, "xEmu" | "yEmu" | "widthEmu" | "heightEmu" | "relativeHeight" | "wrapMode">,
): Record<string, unknown> {
  const own = host(chart);
  const wrap: FloatWrapChoice = frame.wrapMode === "inline" ? "square" : frame.wrapMode;
  const size = { widthEmu: Math.max(1, Math.round(frame.widthEmu)), heightEmu: Math.max(1, Math.round(frame.heightEmu)) };
  return {
    ...chart,
    documentChart: {
      version: 1,
      size,
      ...(own?.workbook ? { workbook: own.workbook } : {}),
    },
    floatAnchor: floatAnchorOutOfLine({
      ...size,
      columnOffsetEmu: frame.xEmu,
      paragraphOffsetEmu: frame.yEmu,
      relativeHeight: frame.relativeHeight ?? 0,
      wrap,
    }),
  };
}
