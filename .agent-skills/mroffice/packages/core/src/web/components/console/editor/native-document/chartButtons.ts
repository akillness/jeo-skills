/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Chart Design and Chart Format logic for charts on a document page, shared
 * by the document toolbar and the editor-command catalog: the selected
 * chart, its type, data orientation, data labels, chart-area styles, axes,
 * text and Quick Layout. Each function commits through the chart's own
 * canonical attributes.
 */

import { documentChartStyleAttrs, type DocumentChartStyleId, type DocumentChartStylePaint } from "./documentChartStyles";
import { type OfficeChartDataLabelContentsDraft } from "../../../office-ribbon/OfficeChartDesignRibbon";
import { officeChartWithRowsAndColumnsSwitched } from "../../../../lib/office-charts/chart-filters";
import { officeChartPartKind, officeChartTypeRefusal, officeChartWithType, type OfficeChartPartKind } from "../../../../lib/office-charts/chart-type";
import { officeChartWithQuickLayout, type OfficeChartQuickLayoutId, type OfficeChartQuickLayoutWords } from "../../../../lib/office-charts/quick-layout";
import { normalizeOfficeChartAxisOptions, type OfficeChartAxisKey, type OfficeChartAxisOptions } from "../../../../lib/office-charts/axis-options";
import type { Editor } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import { NodeSelection } from "@tiptap/pm/state";
import { isChartNode } from "./documentObjectNodes";
import { type DocumentChartAreaStyleKey } from "./DocumentChartFormatRibbon";
import { chartSupportsDataLabels, normalizeChartBlockAttrs, validateChartBlockAttrsV2, type CategoryChartData, type ChartBlockAttrsV2, type ChartData, type ChartFamily, type ChartSubtype } from "../extensions/chartBlockShared";
import { chartFormatWithDataLabelContents } from "../../../../lib/office-charts/chart-elements";
import { chartPointEffectiveStyle, chartPointStyleRow, chartRowsWithPointStyle, chartStyleRowExtras, comparePresentationChartAxisStyles, normalizePresentationChartAreaStyle, normalizePresentationChartAxisStyles, presentationChartAxisStylePart, normalizePresentationChartSliceStyles, normalizePresentationChartSeriesStyles, type PresentationChartAreaPaint, type PresentationChartAreaStyle, type PresentationChartEffectPreset } from "../../../../lib/presentation-chart-area-style";
import { documentChartPreserveReasons, normalizeDocumentChartHost } from "../extensions/documentChartHost";
import { chartWorkbookData, sameChartWorkbookDataShape, type DocumentChartWorkbook } from "../extensions/documentChartWorkbook";
import {
  chartColorPaletteId,
  chartResolvedColorPaletteId,
  chartWithColorPalette,
  chartWithResolvedColorPalette,
  type ChartColorPaletteId,
} from "../../../../lib/office-charts/chart-color-palettes";
import { normalizeChartNativeLook } from "../../../../lib/office-chart-native-look";
import { documentThemeColorsForExport } from "../../../../lib/office-table-style-word";

export interface LiveDocumentChartTarget {
  readonly pos: number;
  readonly node: ProseMirrorNode;
  readonly attrs: ChartBlockAttrsV2;
  readonly source: "v1" | "v2";
  readonly valid: boolean;
}


export const DOCUMENT_CHART_TRANSPOSE_FAMILIES = new Set<ChartFamily>([
  "column",
  "bar",
  "line",
  "area",
  "radar",
]);

// Quick Layout's five recipes and their tile are the shared ones
// (`lib/office-charts/quick-layout`), which the deck's V2 chart applies too.
export type DocumentChartQuickLayoutId = OfficeChartQuickLayoutId;


export function liveDocumentChartTarget(
  editor: Editor,
): LiveDocumentChartTarget | null {
  if (editor.isDestroyed) return null;
  const { doc, selection } = editor.state;
  if (!(selection instanceof NodeSelection)) return null;
  const node = selection.node;
  if (!isChartNode(node) || doc.nodeAt(selection.from) !== node) {
    return null;
  }
  // A Word chart drawn from the preserve-only reading takes no edit
  // (`source.preserveReasons`): no chart command acts on it.
  if (documentChartPreserveReasons(node.attrs.source) !== null) return null;
  const normalized = normalizeChartBlockAttrs(node.attrs);
  return {
    pos: selection.from,
    node,
    attrs: normalized.attrs,
    source: normalized.source,
    valid: normalized.validation.valid,
  };
}

export function sameLiveDocumentChartTarget(
  current: LiveDocumentChartTarget | null,
  expected: LiveDocumentChartTarget,
): current is LiveDocumentChartTarget {
  return Boolean(
    current && current.pos === expected.pos && current.node === expected.node,
  );
}

export function canonicalDocumentChartNodeAttrs(
  target: LiveDocumentChartTarget,
  attrs: ChartBlockAttrsV2,
): Record<string, unknown> {
  return {
    ...target.node.attrs,
    ...attrs,
    // A title back to one plain run states no runs: the node's old runs go.
    titleRuns: attrs.titleRuns ?? null,
    // Chart V1 and V2 are a discriminated union. Once a contextual command
    // persists V2, the legacy arrays must stay null so export cannot observe
    // two conflicting data authorities.
    categories: null,
    series: null,
  };
}

export function commitLiveDocumentChartAttrs(
  editor: Editor,
  target: LiveDocumentChartTarget,
  attrs: Readonly<Record<string, unknown>>,
): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const current = liveDocumentChartTarget(editor);
  if (!sameLiveDocumentChartTarget(current, target)) return false;

  let transaction = closeHistory(
    editor.state.tr.setNodeMarkup(
      current.pos,
      undefined,
      attrs,
      current.node.marks,
    ),
  );
  if (!transaction.docChanged) return false;
  transaction = transaction.setSelection(
    NodeSelection.create(transaction.doc, current.pos),
  );
  editor.view.dispatch(transaction);
  focusEditorUnlessTyping(editor);
  return true;
}

/**
 * Back to the document after a chart command, unless the reader has moved
 * on to another field: a Format pane value committed by Tab lands in the
 * pane's next box, and pulling the focus to the document there left the
 * chart selected, so the next key typed replaced the whole chart (WUA 215).
 * Decided a frame later, once the focus has settled.
 */
function focusEditorUnlessTyping(editor: Editor): void {
  const decide = () => {
    if (editor.isDestroyed) return;
    const active = editor.view.dom.ownerDocument.activeElement;
    if (active instanceof HTMLElement && !editor.view.dom.contains(active)) {
      if (
        active.matches("input, textarea, select") ||
        active.isContentEditable ||
        active.getAttribute("role") === "spinbutton" ||
        active.getAttribute("role") === "combobox"
      ) {
        return;
      }
    }
    editor.view.focus();
  };
  const win = editor.view.dom.ownerDocument.defaultView;
  if (win?.requestAnimationFrame) win.requestAnimationFrame(decide);
  else decide();
}

/**
 * The kind of part a Docs chart already is in the Word file it was opened
 * from, or `null` for a chart Docs writes from its attrs (a chart typed here,
 * or one in a document with no source package). A projected chart carries its
 * part's anchor in `source.sourceAnchor`.
 */
export function documentChartFilePartKind(
  target: LiveDocumentChartTarget,
): OfficeChartPartKind | null {
  const source = target.node.attrs.source as
    | { sourceAnchor?: unknown }
    | null
    | undefined;
  return typeof source?.sourceAnchor === "string" && source.sourceAnchor
    ? officeChartPartKind(target.attrs.chartType)
    : null;
}

/**
 * Change Chart Type, as the deck changes its V2 chart: the shared rule
 * (`lib/office-charts/chart-type`) retires what the new type cannot show and
 * refuses a type whose data kind differs. The DOCX exporter writes classic and
 * Office 2016 (chartEx) charts alike, and a chart that is already a part of
 * the Word file is rewritten as the other kind of part when its type crosses
 * the classic / Office 2016 boundary (`docx/chart_kind_conversion.py`), so
 * Docs offers every type to every chart, as Word does.
 */
export function documentChartTypeAttrs(
  target: LiveDocumentChartTarget,
  family: ChartFamily,
  subtype: ChartSubtype,
): ChartBlockAttrsV2 | null {
  if (
    !target.valid ||
    (target.attrs.chartType === family && target.attrs.chartSubtype === subtype) ||
    officeChartTypeRefusal(target.attrs, family, subtype, null) !== null
  ) {
    return null;
  }
  return officeChartWithType(target.attrs, family, subtype);
}

export function setLiveDocumentChartType(
  editor: Editor,
  target: LiveDocumentChartTarget,
  family: ChartFamily,
  subtype: ChartSubtype,
): boolean {
  const next = documentChartTypeAttrs(target, family, subtype);
  return next
    ? commitLiveDocumentChartAttrs(
        editor,
        target,
        canonicalDocumentChartNodeAttrs(target, next),
      )
    : false;
}

export function transposedDocumentChartAttrs(
  target: LiveDocumentChartTarget,
): ChartBlockAttrsV2 | null {
  const data = target.attrs.data;
  if (
    !target.valid ||
    data.kind !== "category" ||
    !DOCUMENT_CHART_TRANSPOSE_FAMILIES.has(target.attrs.chartType)
  ) {
    return null;
  }
  // The one Switch Row/Column rule (`chart-filters`): the data transposed and
  // Chart Filters' hidden series / categories moved with it.
  const next = officeChartWithRowsAndColumnsSwitched(target.attrs);
  if (!next || next.data.kind !== "category") return null;
  const transposed: CategoryChartData = next.data;
  if (target.node.attrs.source && normalizeDocumentChartHost(target.node.attrs.documentChart)?.workbook &&
      !sameChartWorkbookDataShape(data,transposed)) return null;
  return validateChartBlockAttrsV2(next).valid ? next : null;
}

export function switchLiveDocumentChartRowsAndColumns(
  editor: Editor,
  target: LiveDocumentChartTarget,
): boolean {
  const host = normalizeDocumentChartHost(target.node.attrs.documentChart);
  if (host?.workbook) {
    if(!transposedDocumentChartAttrs(target))return false;
    try {
      // The sheet read the other way round: its results as stamped (a
      // formula without one refuses the switch until the chart has them).
      const next = chartWorkbookData(target.attrs, {...host.workbook, binding: {...host.workbook.binding,
        plotBy: host.workbook.binding.plotBy === "rows" ? "columns" : "rows"}});
      const switched = officeChartWithRowsAndColumnsSwitched(target.attrs, next.data);
      if (!switched) return false;
      return commitLiveDocumentChartAttrs(editor, target, {...canonicalDocumentChartNodeAttrs(target, switched),
        documentChart: {...host, workbook: next.workbook}});
    } catch { return false; }
  }
  const next = transposedDocumentChartAttrs(target);
  return next
    ? commitLiveDocumentChartAttrs(
        editor,
        target,
        canonicalDocumentChartNodeAttrs(target, next),
      )
    : false;
}

/**
 * Chart Design > Data > Refresh Data (Word and PowerPoint document it beside
 * Edit Data): recalculate the chart's own workbook -- its formulas included --
 * and redraw the chart from it, in ONE undo step. The deck's V2 chart does the
 * same (`PresentationChartContextRibbon`). A chart with no workbook yet has
 * nothing to refresh; a result equal to what the chart draws writes nothing.
 */
export async function refreshLiveDocumentChartData(
  editor: Editor,
  target: LiveDocumentChartTarget,
  /** The workbook's formulas' results, from the server (the editor's
   * `calculateDocumentChartWorkbookSettled`); `pending` when it cannot answer. */
  calculate: (attrs: LiveDocumentChartTarget["attrs"], workbook: DocumentChartWorkbook) =>
    Promise<{ workbook: DocumentChartWorkbook; data: ChartData; pending: boolean }>,
): Promise<"refreshed" | "unchanged" | "failed"> {
  const host = normalizeDocumentChartHost(target.node.attrs.documentChart);
  if (!host?.workbook) return "failed";
  try {
    const next = await calculate(target.attrs, host.workbook);
    if (next.pending) return "failed";
    if (JSON.stringify(next.data) === JSON.stringify(target.attrs.data) &&
      JSON.stringify(next.workbook) === JSON.stringify(host.workbook)) {
      return "unchanged";
    }
    return commitLiveDocumentChartAttrs(editor, target, {
      ...canonicalDocumentChartNodeAttrs(target, {
        ...target.attrs,
        data: next.data,
      }),
      documentChart: { ...host, workbook: next.workbook },
    })
      ? "refreshed"
      : "failed";
  } catch {
    return "failed";
  }
}

export function setLiveDocumentChartDataLabelContents(
  editor: Editor,
  target: LiveDocumentChartTarget,
  draft: OfficeChartDataLabelContentsDraft,
): boolean {
  if (!target.valid || !chartSupportsDataLabels(target.attrs.chartType)) {
    return false;
  }
  const current = liveDocumentChartTarget(editor);
  if (!sameLiveDocumentChartTarget(current, target)) return false;
  const format = chartFormatWithDataLabelContents(target.attrs.format, draft);
  const next: ChartBlockAttrsV2 = { ...target.attrs, format };
  if (!validateChartBlockAttrsV2(next).valid) return false;
  if (JSON.stringify(current.attrs) === JSON.stringify(next)) return true;
  return commitLiveDocumentChartAttrs(
    editor,
    target,
    canonicalDocumentChartNodeAttrs(target, next),
  );
}

export function liveDocumentChartAreaStyle(
  target: LiveDocumentChartTarget,
  area: DocumentChartAreaStyleKey,
): PresentationChartAreaStyle | undefined {
  const format = target.attrs.format;
  const seriesMatch = /^series:([0-9]+)$/.exec(area);
  const sliceMatch = /^slice:([0-9]+)$/.exec(area);
  const axisMatch = /^axis:(category|value)$/.exec(area);
  const errorBarMatch = /^errorBarStyle:([0-9]+)$/.exec(area);
  if (errorBarMatch) {
    return normalizePresentationChartAreaStyle(
      format?.seriesErrorBars?.find((entry) => entry.seriesIndex === Number(errorBarMatch[1]))?.style,
    );
  }
  if (axisMatch) {
    const axis = axisMatch[1] as "category" | "value";
    const style = normalizePresentationChartAxisStyles(format?.axisStyles)?.find(
      (entry) => entry.axis === axis,
    );
    return style
      ? {
          ...(style.outline === undefined ? {} : { outline: style.outline }),
          ...(style.effect === undefined ? {} : { effect: style.effect }),
          ...(style.shapePaint ? { shapePaint: style.shapePaint } : {}),
        }
      : undefined;
  }
  if (sliceMatch) {
    const pointIndex = Number(sliceMatch[1]);
    return normalizePresentationChartSliceStyles(format?.sliceStyles)?.find(
      (entry) => entry.pointIndex === pointIndex,
    );
  }
  // One point of a series (Format Data Point): its own `c:dPt` row.
  const pointMatch = /^point:([0-9]+):([0-9]+)$/.exec(area);
  if (pointMatch) {
    return chartPointEffectiveStyle(format, Number(pointMatch[1]), Number(pointMatch[2]));
  }
  if (seriesMatch) {
    const seriesIndex = Number(seriesMatch[1]);
    return normalizePresentationChartSeriesStyles(format?.seriesStyles)?.find(
      (entry) => entry.seriesIndex === seriesIndex,
    );
  }
  return normalizePresentationChartAreaStyle(
    (format as Record<string, unknown> | undefined)?.[area === "gridlines" ? "gridlineStyle" : area],
  );
}

export function setLiveDocumentChartAreaStyle(
  editor: Editor,
  target: LiveDocumentChartTarget,
  area: DocumentChartAreaStyleKey,
  style: PresentationChartAreaStyle,
): boolean {
  if (!target.valid) return false;
  const pointMatch = /^point:([0-9]+):([0-9]+)$/.exec(area);
  if (pointMatch) {
    // Format Data Point: series S's point P's own row (`c:dPt`), its paint
    // over its series'.
    if (!normalizePresentationChartAreaStyle(style)) return false;
    const format: NonNullable<ChartBlockAttrsV2["format"]> = { ...(target.attrs.format ?? {}) };
    const rows = chartRowsWithPointStyle(
      normalizePresentationChartSliceStyles(format.sliceStyles),
      Number(pointMatch[1]),
      Number(pointMatch[2]),
      style,
    );
    if (rows) format.sliceStyles = rows;
    else delete format.sliceStyles;
    const next: ChartBlockAttrsV2 = { ...target.attrs, format };
    if (
      !validateChartBlockAttrsV2(next).valid ||
      JSON.stringify(target.attrs.format ?? {}) === JSON.stringify(format)
    ) {
      return false;
    }
    return commitLiveDocumentChartAttrs(editor, target, canonicalDocumentChartNodeAttrs(target, next));
  }
  const seriesMatch = /^series:([0-9]+)$/.exec(area);
  const sliceMatch = /^slice:([0-9]+)$/.exec(area);
  // A series' marker or Smoothed line (a point's explosion) is written even
  // with no paint beside it.
  const rowExtras = seriesMatch
    ? chartStyleRowExtras(
        "seriesStyles",
        target.attrs.format?.seriesStyles?.find((entry) => entry.seriesIndex === Number(seriesMatch[1])),
        style,
      )
    : sliceMatch
      ? chartStyleRowExtras(
          "sliceStyles",
          target.attrs.format?.sliceStyles?.find((entry) => entry.pointIndex === Number(sliceMatch[1])),
          style,
        )
      : {};
  const normalized: PresentationChartAreaStyle | undefined =
    normalizePresentationChartAreaStyle(style) ?? (Object.keys(rowExtras).length ? {} : undefined);
  if (!normalized) return false;
  const format: NonNullable<ChartBlockAttrsV2["format"]> = {
    ...(target.attrs.format ?? {}),
  };
  const axisMatch = /^axis:(category|value)$/.exec(area);
  const lineOnly =
    axisMatch !== null ||
    area === "gridlines" ||
    /^(minorG|g)ridlineStyle[XY]$/.test(area) ||
    area === "trendlineStyle" ||
    area === "errorBarStyle" ||
    area.startsWith("errorBarStyle:") ||
    area === "dropLineStyle" ||
    area === "highLowLineStyle" ||
    area === "seriesLineStyle" ||
    area === "dataLabelLeaderLineStyle";
  if (lineOnly && normalized.fill !== undefined) {
    return false;
  }
  if (axisMatch) {
    const axis = axisMatch[1] as "category" | "value";
    const styles = [
      ...(normalizePresentationChartAxisStyles(format.axisStyles) ?? []),
    ];
    format.axisStyles = [
      ...styles.filter((entry) => entry.axis !== axis),
      { axis, ...presentationChartAxisStylePart(normalized) },
    ].sort(comparePresentationChartAxisStyles);
  } else if (area === "gridlines") {
    format.gridlineStyle = normalized;
    // All the major gridlines at once: each axis' own paint goes.
    delete format.gridlineStyleX;
    delete format.gridlineStyleY;
  } else if (area === "trendlineStyle") {
    if (format.trendline?.type !== "linear") return false;
    format.trendlineStyle = normalized;
  } else if (area === "errorBarStyle") {
    if (!format.errorBars) return false;
    format.errorBarStyle = normalized;
  } else if (area.startsWith("errorBarStyle:")) {
    // Another series' error bars' own line (`seriesErrorBars[].style`).
    const seriesIndex = Number(area.slice(14));
    if (!format.seriesErrorBars?.some((entry) => entry.seriesIndex === seriesIndex)) return false;
    format.seriesErrorBars = format.seriesErrorBars.map((entry) =>
      entry.seriesIndex === seriesIndex ? { ...entry, style: normalized } : entry,
    );
  } else if (area === "dropLineStyle") {
    if (format.dropLines !== true) return false;
    format.dropLineStyle = normalized;
  } else if (area === "highLowLineStyle") {
    if (format.highLowLines !== true) return false;
    format.highLowLineStyle = normalized;
  } else if (area === "seriesLineStyle") {
    if (format.seriesLines !== true) return false;
    format.seriesLineStyle = normalized;
  } else if (area === "dataLabelLeaderLineStyle") {
    if (format.dataLabelLeaderLines !== true) return false;
    format.dataLabelLeaderLineStyle = normalized;
  } else if (sliceMatch) {
    const pointIndex = Number(sliceMatch[1]);
    const styles = [
      ...(normalizePresentationChartSliceStyles(format.sliceStyles) ?? []),
    ];
    format.sliceStyles = [
      ...styles.filter((entry) => entry.pointIndex !== pointIndex),
      {
        pointIndex,
        ...normalized,
        ...chartStyleRowExtras("sliceStyles", styles.find((entry) => entry.pointIndex === pointIndex), style),
      },
    ].sort((left, right) => left.pointIndex - right.pointIndex);
  } else if (seriesMatch) {
    if (normalized.fill === "none") return false;
    const seriesIndex = Number(seriesMatch[1]);
    const styles = [
      ...(normalizePresentationChartSeriesStyles(format.seriesStyles) ?? []),
    ];
    const nextStyle = {
      seriesIndex,
      // The series' marker and Smoothed line ride through a paint edit.
      ...chartStyleRowExtras("seriesStyles", styles.find((entry) => entry.seriesIndex === seriesIndex), style),
      ...(normalized.shapePaint ? { shapePaint: normalized.shapePaint } : {}),
      ...(normalized.fill === undefined
        ? {}
        : { fill: normalized.fill as `#${string}` }),
      ...(normalized.outline === undefined
        ? {}
        : { outline: normalized.outline }),
      ...(normalized.effect === undefined ? {} : { effect: normalized.effect }),
    };
    format.seriesStyles = [
      ...styles.filter((entry) => entry.seriesIndex !== seriesIndex),
      nextStyle,
    ].sort((left, right) => left.seriesIndex - right.seriesIndex);
  } else {
    (format as Record<string, unknown>)[area] = normalized;
    if (area === "dataLabelStyle") format.dataLabels = true;
  }
  const next: ChartBlockAttrsV2 = { ...target.attrs, format };
  if (
    !validateChartBlockAttrsV2(next).valid ||
    JSON.stringify(target.attrs.format ?? {}) === JSON.stringify(format)
  ) {
    return false;
  }
  return commitLiveDocumentChartAttrs(
    editor,
    target,
    canonicalDocumentChartNodeAttrs(target, next),
  );
}

/** Word's Format Axis > Axis Options: the SHARED record on the chart's format. */
export function setLiveDocumentChartAxisOptions(
  editor: Editor,
  target: LiveDocumentChartTarget,
  axis: OfficeChartAxisKey,
  options: OfficeChartAxisOptions | null,
): boolean {
  if (!target.valid) return false;
  const format: NonNullable<ChartBlockAttrsV2["format"]> = {
    ...(target.attrs.format ?? {}),
  };
  const axes: Record<string, OfficeChartAxisOptions> = { ...(format.axisOptions ?? {}) };
  const normalized = normalizeOfficeChartAxisOptions(options);
  if (normalized) axes[axis] = normalized;
  else delete axes[axis];
  if (Object.keys(axes).length) format.axisOptions = axes;
  else delete format.axisOptions;
  const next: ChartBlockAttrsV2 = { ...target.attrs, format };
  if (
    !validateChartBlockAttrsV2(next).valid ||
    JSON.stringify(target.attrs.format ?? {}) === JSON.stringify(format)
  ) {
    return false;
  }
  return commitLiveDocumentChartAttrs(
    editor,
    target,
    canonicalDocumentChartNodeAttrs(target, next),
  );
}

/**
 * The chart as `command` returns it (null: no change), committed like any
 * other chart edit: the Format pane's options the shared ribbon writes
 * itself (a histogram's Bins).
 */
export function setLiveDocumentChartModel(
  editor: Editor,
  target: LiveDocumentChartTarget,
  command: (attrs: ChartBlockAttrsV2) => ChartBlockAttrsV2 | null,
): boolean {
  if (!target.valid) return false;
  const next = command(target.attrs);
  if (!next || !validateChartBlockAttrsV2(next).valid) return false;
  return commitLiveDocumentChartAttrs(
    editor,
    target,
    canonicalDocumentChartNodeAttrs(target, next),
  );
}

export function setLiveDocumentChartAreaEffect(
  editor: Editor,
  target: LiveDocumentChartTarget,
  area: DocumentChartAreaStyleKey,
  effect: PresentationChartEffectPreset | null,
): boolean {
  const current = liveDocumentChartAreaStyle(target, area);
  const remaining = { ...current };
  if (remaining.shapePaint?.shadow) {
    remaining.shapePaint = { ...remaining.shapePaint };
    delete remaining.shapePaint.shadow;
  }
  if (effect === null) {
    if (!current?.effect && !current?.shapePaint?.shadow) return false;
    delete remaining.effect;
    return Object.keys(remaining).length
      ? setLiveDocumentChartAreaStyle(editor, target, area, remaining)
      : resetLiveDocumentChartAreaStyle(editor, target, area);
  }
  return setLiveDocumentChartAreaStyle(editor, target, area, {
    ...remaining,
    effect,
  });
}

export function setLiveDocumentChartTextStyle(
  editor: Editor,
  target: LiveDocumentChartTarget,
  area: DocumentChartAreaStyleKey,
  textStyle: PresentationChartAreaStyle,
): boolean {
  if (area !== "chartTitleStyle") return false;
  const current = liveDocumentChartAreaStyle(target, area) ?? {};
  const next = { ...current };
  delete next.textFill;
  delete next.textOutline;
  delete next.textEffect;
  delete next.textPaint;
  Object.assign(next, textStyle);
  return Object.keys(next).length
    ? setLiveDocumentChartAreaStyle(editor, target, area, next)
    : resetLiveDocumentChartAreaStyle(editor, target, area);
}

export function setLiveDocumentChartAreaPaint(
  editor: Editor,
  target: LiveDocumentChartTarget,
  area: DocumentChartAreaStyleKey,
  field: "fill" | "outline",
  paint: PresentationChartAreaPaint,
): boolean {
  if (
    field === "fill" &&
    (area.startsWith("axis:") ||
      area === "gridlines" ||
      /^(minorG|g)ridlineStyle[XY]$/.test(area) ||
      area === "trendlineStyle" ||
      area === "errorBarStyle" ||
      area.startsWith("errorBarStyle:") ||
      area === "dropLineStyle" ||
      area === "highLowLineStyle" ||
      area === "seriesLineStyle" ||
      area === "dataLabelLeaderLineStyle" ||
      (area.startsWith("series:") && paint === "none"))
  ) {
    return false;
  }
  const style = { ...(liveDocumentChartAreaStyle(target, area) ?? {}), [field]: paint };
  if (style.shapePaint) {
    style.shapePaint = { ...style.shapePaint };
    if (field === "fill") delete style.shapePaint.fillGradient;
    if (field === "fill") delete style.shapePaint.fillPattern;
    if (field === "outline") delete style.shapePaint.lineGradient;
    if (field === "outline") style.shapePaint.outlineWidthPt = paint === "none" ? 0 : style.shapePaint.outlineWidthPt || 1;
    if (!Object.keys(style.shapePaint).length) delete style.shapePaint;
  }
  return setLiveDocumentChartAreaStyle(
    editor,
    target,
    area,
    style,
  );
}

export function resetLiveDocumentChartAreaStyle(
  editor: Editor,
  target: LiveDocumentChartTarget,
  area: DocumentChartAreaStyleKey,
): boolean {
  if (!target.valid) return false;
  const format = { ...(target.attrs.format ?? {}) };
  const seriesMatch = /^series:([0-9]+)$/.exec(area);
  const sliceMatch = /^slice:([0-9]+)$/.exec(area);
  const pointMatch = /^point:([0-9]+):([0-9]+)$/.exec(area);
  const axisMatch = /^axis:(category|value)$/.exec(area);
  if (axisMatch) {
    const axis = axisMatch[1] as "category" | "value";
    const current = normalizePresentationChartAxisStyles(format.axisStyles) ?? [];
    if (!current.some((style) => style.axis === axis)) return false;
    const remaining = current.filter((style) => style.axis !== axis);
    if (remaining.length > 0) format.axisStyles = remaining;
    else delete format.axisStyles;
  } else if (area === "gridlines") {
    if (format.gridlineStyle === undefined && format.gridlineStyleX === undefined && format.gridlineStyleY === undefined) return false;
    delete format.gridlineStyle;
    delete format.gridlineStyleX;
    delete format.gridlineStyleY;
  } else if (area === "trendlineStyle") {
    if (format.trendlineStyle === undefined) return false;
    delete format.trendlineStyle;
  } else if (area === "errorBarStyle") {
    if (format.errorBarStyle === undefined) return false;
    delete format.errorBarStyle;
  } else if (area.startsWith("errorBarStyle:")) {
    const seriesIndex = Number(area.slice(14));
    if (!format.seriesErrorBars?.some((entry) => entry.seriesIndex === seriesIndex && entry.style)) return false;
    format.seriesErrorBars = format.seriesErrorBars.map((entry) => {
      if (entry.seriesIndex !== seriesIndex) return entry;
      const { style: _style, ...rest } = entry;
      return rest;
    });
  } else if (area === "dropLineStyle") {
    if (format.dropLineStyle === undefined) return false;
    delete format.dropLineStyle;
  } else if (area === "highLowLineStyle") {
    if (format.highLowLineStyle === undefined) return false;
    delete format.highLowLineStyle;
  } else if (area === "seriesLineStyle") {
    if (format.seriesLineStyle === undefined) return false;
    delete format.seriesLineStyle;
  } else if (area === "dataLabelLeaderLineStyle") {
    if (format.dataLabelLeaderLineStyle === undefined) return false;
    delete format.dataLabelLeaderLineStyle;
  } else if (pointMatch) {
    const current = normalizePresentationChartSliceStyles(format.sliceStyles);
    if (!chartPointStyleRow(current, Number(pointMatch[1]), Number(pointMatch[2]))) return false;
    const rows = chartRowsWithPointStyle(current, Number(pointMatch[1]), Number(pointMatch[2]), null);
    if (rows) format.sliceStyles = rows;
    else delete format.sliceStyles;
  } else if (sliceMatch) {
    const pointIndex = Number(sliceMatch[1]);
    const current =
      normalizePresentationChartSliceStyles(format.sliceStyles) ?? [];
    if (!current.some((style) => style.pointIndex === pointIndex)) return false;
    const remaining = current.filter(
      (style) => style.pointIndex !== pointIndex,
    );
    if (remaining.length > 0) format.sliceStyles = remaining;
    else delete format.sliceStyles;
  } else if (seriesMatch) {
    const seriesIndex = Number(seriesMatch[1]);
    const current = normalizePresentationChartSeriesStyles(format.seriesStyles) ?? [];
    if (!current.some((style) => style.seriesIndex === seriesIndex)) return false;
    const remaining = current.filter((style) => style.seriesIndex !== seriesIndex);
    if (remaining.length > 0) format.seriesStyles = remaining;
    else delete format.seriesStyles;
  } else {
    const currentFormat = target.attrs.format as
      | Record<string, unknown>
      | undefined;
    if (currentFormat?.[area] === undefined) return false;
    delete (format as Record<string, unknown>)[area];
  }
  const next: ChartBlockAttrsV2 = {
    ...target.attrs,
    format: Object.keys(format).length > 0 ? format : undefined,
  };
  if (!validateChartBlockAttrsV2(next).valid) return false;
  return commitLiveDocumentChartAttrs(
    editor,
    target,
    canonicalDocumentChartNodeAttrs(target, next),
  );
}

/**
 * `words`: what a Quick Layout writes where it adds a title, in the reader's
 * language (the ribbon passes its catalogue's words); without them, Office's
 * English defaults.
 */
export function documentChartQuickLayoutAttrs(
  target: LiveDocumentChartTarget,
  layoutId: DocumentChartQuickLayoutId,
  words?: OfficeChartQuickLayoutWords,
): ChartBlockAttrsV2 | null {
  return target.valid
    ? officeChartWithQuickLayout(target.attrs, layoutId, words)
    : null;
}

export function applyLiveDocumentChartQuickLayout(
  editor: Editor,
  target: LiveDocumentChartTarget,
  layoutId: DocumentChartQuickLayoutId,
  words?: OfficeChartQuickLayoutWords,
): boolean {
  const next = documentChartQuickLayoutAttrs(target, layoutId, words);
  if (
    !next ||
    (JSON.stringify(next.format ?? {}) ===
      JSON.stringify(target.attrs.format ?? {}) &&
      next.title === target.attrs.title &&
      next.axisTitleX === target.attrs.axisTitleX &&
      next.axisTitleY === target.attrs.axisTitleY)
  ) {
    return false;
  }
  return commitLiveDocumentChartAttrs(
    editor,
    target,
    canonicalDocumentChartNodeAttrs(target, next),
  );
}

export function dispatchDocumentChartNodeViewEvent(
  editor: Editor,
  target: LiveDocumentChartTarget,
  type: string,
  detail?: unknown,
  requireLiveSelection = true,
): boolean {
  if (editor.isDestroyed) return false;
  if (requireLiveSelection) {
    if (!sameLiveDocumentChartTarget(liveDocumentChartTarget(editor), target)) {
      return false;
    }
  } else if (editor.state.doc.nodeAt(target.pos) !== target.node) {
    return false;
  }
  const nodeDom = editor.view.nodeDOM(target.pos);
  if (!(nodeDom instanceof HTMLElement)) return false;
  const chartNodeView = nodeDom.matches('[data-testid="chart-block"]')
    ? nodeDom
    : nodeDom.querySelector<HTMLElement>('[data-testid="chart-block"]');
  if (!chartNodeView) return false;
  chartNodeView.dispatchEvent(new CustomEvent(type, { detail }));
  return true;
}

/** Chart Styles: one of the gallery's styles, unless the chart already wears it. */
export function commitDocumentChartStyleId(
  editor: Editor,
  target: LiveDocumentChartTarget,
  styleId: DocumentChartStyleId,
): boolean {
  const next = documentChartStyleAttrs(target.attrs, styleId, documentChartStylePaint(editor, target));
  if (!next || JSON.stringify(next) === JSON.stringify(target.attrs)) return false;
  return commitLiveDocumentChartAttrs(editor, target, canonicalDocumentChartNodeAttrs(target, next));
}

// ---------------------------------------------------------------------------
// Change Colors: Office's Colorful and Monochromatic palettes. A chart Docs
// writes from its attrs, or an Office 2016 part, carries the pick as
// `format.colorPalette`; a classic chart that is already a part of the opened
// Word file is painted by that file's series writers, so the pick lands there
// as the palette's colours on each series, resolved from the stored theme:
// the chart's own imported theme, else the document's.
// ---------------------------------------------------------------------------

/** The look an imported chart carries from its Word part, if any. */
export function documentChartNativeLook(target: LiveDocumentChartTarget) {
  return normalizeChartNativeLook(
    (target.node.attrs.source as { nativeLook?: unknown } | null | undefined)?.nativeLook,
  );
}

/** What a Chart Style paints this chart's series from: the document theme's
 * accents (a Change Colors pick's), and the look an imported part gives it. */
export function documentChartStylePaint(
  editor: Editor,
  target: LiveDocumentChartTarget,
): DocumentChartStylePaint {
  const look = documentChartNativeLook(target);
  return {
    accents: documentChartThemeAccents(editor.state.doc.attrs, target),
    ...(look ? { look } : {}),
  };
}

/** The six accents a palette paints in, read from what the document stores. */
export function documentChartThemeAccents(
  docAttrs: Readonly<Record<string, unknown>>,
  target: LiveDocumentChartTarget,
): string[] {
  const own = documentChartNativeLook(target)?.themeAccents;
  if (own) return own;
  const theme = documentThemeColorsForExport(docAttrs);
  return [theme.accent1, theme.accent2, theme.accent3, theme.accent4, theme.accent5, theme.accent6];
}

/** Whether the palette lands as colours on each series (a classic Word part). */
export function documentChartPaletteAsSeriesPaint(target: LiveDocumentChartTarget): boolean {
  return documentChartFilePartKind(target) === "classic";
}

export function documentChartWithColorPalette(
  target: LiveDocumentChartTarget,
  paletteId: ChartColorPaletteId,
  accents: readonly string[],
): ChartBlockAttrsV2 | null {
  if (!target.valid) return null;
  return documentChartPaletteAsSeriesPaint(target)
    ? chartWithResolvedColorPalette(target.attrs, paletteId, accents)
    : chartWithColorPalette(target.attrs, paletteId, accents);
}

export function documentChartActiveColorPaletteId(
  target: LiveDocumentChartTarget,
  accents: readonly string[],
): ChartColorPaletteId | null {
  return documentChartPaletteAsSeriesPaint(target)
    ? chartResolvedColorPaletteId(target.attrs, accents)
    : chartColorPaletteId(target.attrs);
}

export function setLiveDocumentChartColorPalette(
  editor: Editor,
  target: LiveDocumentChartTarget,
  paletteId: ChartColorPaletteId,
  accents: readonly string[] = documentChartThemeAccents(editor.state.doc.attrs, target),
): boolean {
  const next = documentChartWithColorPalette(target, paletteId, accents);
  if (!next || !validateChartBlockAttrsV2(next).valid) return false;
  return commitLiveDocumentChartAttrs(editor, target, canonicalDocumentChartNodeAttrs(target, next));
}
