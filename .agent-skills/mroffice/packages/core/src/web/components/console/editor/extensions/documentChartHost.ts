/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/** Word drawing extents are EMU, not screen pixels. Keep this Docs-only
 * envelope outside ChartBlockAttrsV2 so no other host silently gains writers. */
export interface DocumentChartSize {
  widthEmu: number;
  heightEmu: number;
}
export type DocumentChartWrapMode =
  | "square"
  | "topAndBottom"
  | "behindText"
  | "inFrontOfText";
export type DocumentChartLayout =
  | Readonly<{ mode: "inline" }>
  | Readonly<{
      mode: "floating";
      horizontal: "left" | "center" | "right";
      wrap: DocumentChartWrapMode;
      relativeHeight: number;
    }>;
export interface DocumentChartHost {
  version: 1;
  size: DocumentChartSize;
  layout?: DocumentChartLayout;
  workbook?: import("./documentChartWorkbook").DocumentChartWorkbook;
}
export const CHART_HOST_EMU_PER_PX = EMU_PER_PX;
export const CHART_HOST_EMU_PER_CM = 360_000;
export const MAX_DOCUMENT_CHART_EMU = 20_000_000;
/** Match the native DOCX writer for charts without imported/authored extents. */
export const DEFAULT_DOCUMENT_CHART_SIZE: Readonly<DocumentChartSize> = {
  widthEmu: 5_486_400,
  heightEmu: 3_127_200,
};

export function documentChartParagraphAlignment(
  attrs: Record<string, unknown>,
): "left" | "center" | "right" {
  return attrs.textAlign === "center" || attrs.textAlign === "right"
    ? attrs.textAlign : "left";
}

import { EMU_PER_PX } from "../../../../lib/office-units";
import { normalizeFloatAnchor, type FloatAnchor } from "../../../../lib/office-float-anchor";
import {
  normalizeChartNativeLook,
  type ChartNativeLook,
} from "../../../../lib/office-chart-native-look";
import { documentThemeColorsForExport } from "../../../../lib/office-table-style-word";
import { excelBuiltInChartTextLook, withOfficeAutomaticChartLine } from "../../../../lib/spreadsheet/chart-builtin-text";
import {
  documentChartWorkbookValueNumberFormat,
  normalizeDocumentChartWorkbook,
} from "./documentChartWorkbook";

/** The shared plot does not own a Docs title container. Every Docs chart,
 * sized or not, paints its title inside its extent, never a second flow block. */
/**
 * What the one planner needs, beside a Docs chart's V2 attrs, to draw it as
 * the editor does -- the canvas, the offline HTML export and the style
 * gallery read it here, so none of them paints a chart differently:
 * the look an imported Office 2016 chart's own parts give it, the document
 * theme a Change Colors pick resolves against (Word's `accentN`), and the
 * number format its sheet gives the values (Linked to source).
 */
export function documentChartPlanInputs(
  /** The chart node's attrs (V2 attrs plus the node's source and host). */
  chartNodeAttrs: object,
  documentAttrs: Readonly<Record<string, unknown>> | null | undefined,
): {
  nativeLook?: ChartNativeLook;
  themeAccents: string[];
  linkedValueNumberFormat?: string;
} {
  const theme = documentThemeColorsForExport(documentAttrs) as Record<string, string>;
  const nodeAttrs = chartNodeAttrs as Readonly<Record<string, unknown>>;
  const source = nodeAttrs.source as { nativeLook?: unknown; partName?: unknown; legacyChartLine?: unknown } | null | undefined;
  return {
    nativeLook: normalizeChartNativeLook(source?.nativeLook) ?? wordBuiltInChartLook(source, nodeAttrs.format),
    themeAccents: [1, 2, 3, 4, 5, 6].map((index) => theme[`accent${index}`]),
    linkedValueNumberFormat: documentChartWorkbookValueNumberFormat(
      (nodeAttrs.documentChart as { workbook?: unknown } | null | undefined)?.workbook,
    ),
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function dimension(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_DOCUMENT_CHART_EMU
  );
}
function layout(value: unknown): DocumentChartLayout | undefined {
  if (!record(value)) return undefined;
  if (value.mode === "inline" && Object.keys(value).join(",") === "mode") {
    return { mode: "inline" };
  }
  if (
    value.mode !== "floating" ||
    !["left", "center", "right"].includes(String(value.horizontal)) ||
    !["square", "topAndBottom", "behindText", "inFrontOfText"].includes(
      String(value.wrap),
    ) ||
    typeof value.relativeHeight !== "number" ||
    !Number.isInteger(value.relativeHeight) ||
    value.relativeHeight < 0 ||
    value.relativeHeight > 0xffff_ffff ||
    Object.keys(value).sort().join(",") !==
      "horizontal,mode,relativeHeight,wrap"
  ) {
    return undefined;
  }
  return {
    mode: "floating",
    horizontal: value.horizontal as "left" | "center" | "right",
    wrap: value.wrap as DocumentChartWrapMode,
    relativeHeight: value.relativeHeight,
  };
}
export function normalizeDocumentChartHost(
  value: unknown,
): DocumentChartHost | undefined {
  if (value === undefined) return undefined;
  if (
    !record(value) ||
    Object.keys(value).some(
      (key) => key !== "size" && key !== "version" && key !== "layout" && key !== "workbook",
    ) ||
    value.version !== 1 ||
    !record(value.size) ||
    Object.keys(value.size).sort().join(",") !== "heightEmu,widthEmu" ||
    !dimension(value.size.widthEmu) ||
    !dimension(value.size.heightEmu) ||
    (value.layout !== undefined && layout(value.layout) === undefined)
  ) {
    throw new Error("invalid_document_chart_host");
  }
  return {
    version: 1,
    size: { widthEmu: value.size.widthEmu, heightEmu: value.size.heightEmu },
    ...(value.layout === undefined ? {} : { layout: layout(value.layout)! }),
    ...(value.workbook === undefined ? {} : { workbook: normalizeDocumentChartWorkbook(value.workbook) }),
  };
}
export function documentChartLayout(
  attrs: Record<string, unknown>,
): DocumentChartLayout {
  return normalizeDocumentChartHost(attrs.documentChart)?.layout ?? {
    mode: "inline",
  };
}
/**
 * Word's Bring Forward / Send Backward on a floating chart: one layer up
 * (`1`) or down (`-1`) its stack (`wp:anchor@relativeHeight`), the ribbon's
 * Arrange commands and the chart's right-click menu alike. Null for a chart
 * in line with its text, which has no layer (Word greys both).
 */
export function documentChartLayoutOneLayer(
  layout: DocumentChartLayout,
  step: 1 | -1,
): DocumentChartLayout | null {
  if (layout.mode !== "floating") return null;
  return {
    ...layout,
    relativeHeight: Math.min(0xffff_ffff, Math.max(0, layout.relativeHeight + step)),
  };
}
/**
 * Word's Bring to Front / Send to Back on a floating chart: above (`front`)
 * or below (`back`) every floating object of the document's one stack
 * (`heights`, `documentFloatingStack`), Word's `wp:anchor@relativeHeight`
 * taking the place past the edge. Null for a chart in line with its text, or
 * one already alone at that edge.
 */
export function documentChartLayoutToEdge(
  layout: DocumentChartLayout,
  edge: "front" | "back",
  heights: readonly number[],
): DocumentChartLayout | null {
  if (layout.mode !== "floating") return null;
  const own = layout.relativeHeight;
  // The others: the chart's own height counted once.
  const others = [...heights];
  const at = others.indexOf(own);
  if (at >= 0) others.splice(at, 1);
  if (edge === "front") {
    const top = others.length ? Math.max(...others) : -1;
    if (own > top) return null;
    return { ...layout, relativeHeight: Math.min(0xffff_ffff, top + 1) };
  }
  const bottom = others.length ? Math.min(...others) : 0xffff_ffff + 1;
  if (own < bottom) return null;
  return { ...layout, relativeHeight: Math.max(0, bottom - 1) };
}
/**
 * The `wp:anchor` a floating chart stands in: the same `floatAnchor` a
 * floating picture carries (`pictureFloat.pictureFloatAnchor`), so the page's
 * one float pass places it and wraps the lines round it as Word does. The
 * chart's live size wins over the stored extent (a resize is a resize). Null
 * for a chart in line with its text.
 */
export function documentChartFloatAnchor(
  attrs: Record<string, unknown>,
): FloatAnchor | null {
  const stored = normalizeFloatAnchor(attrs.floatAnchor);
  if (!stored) return null;
  let size: DocumentChartSize | undefined;
  try {
    size = normalizeDocumentChartHost(attrs.documentChart)?.size;
  } catch {
    size = undefined;
  }
  return {
    ...stored,
    widthEmu: size?.widthEmu ?? stored.widthEmu,
    heightEmu: size?.heightEmu ?? stored.heightEmu,
    groupTransform: undefined,
  };
}

export function documentChartSize(
  attrs: Record<string, unknown>,
): DocumentChartSize | undefined {
  const host = normalizeDocumentChartHost(attrs.documentChart);
  if (host) return host.size;
  const anchored = normalizeFloatAnchor(attrs.floatAnchor);
  if (anchored && dimension(anchored.widthEmu) && dimension(anchored.heightEmu))
    return { widthEmu: anchored.widthEmu, heightEmu: anchored.heightEmu };
  const source = attrs.source;
  if (
    record(source) &&
    dimension(source.widthEmu) &&
    dimension(source.heightEmu)
  )
    return { widthEmu: source.widthEmu, heightEmu: source.heightEmu };
  return { ...DEFAULT_DOCUMENT_CHART_SIZE };
}

/**
 * The Office 2016 families (the writer's own `office_chart_parts.CHART_EX_FAMILIES`).
 * Their writer edits the numbers of an imported chart in place, so an imported
 * one is edited through the workbook grid, whose commit refuses the shape change
 * that writer could not make. An imported classic chart keeps the editor that
 * also adds and removes rows, which its own writer rebuilds.
 */
export const DOCUMENT_CHART_EX_FAMILIES: ReadonlySet<string> = new Set([
  "hierarchy",
  "statistical",
  "waterfall",
  "funnel",
  "map",
]);

/**
 * The workbook a Docs chart's data is edited through: its own, else one seeded
 * from an authored chart, else (for an imported Office 2016 chart) the grid its
 * part reads back as. Null for an imported classic chart, whose data is edited
 * directly. Edit Data and the quick data flyout both ask this.
 */
export function documentChartEditableWorkbook(
  nodeAttrs: Readonly<Record<string, unknown>>,
  attrs: import("./chartBlockShared").ChartBlockAttrsV2,
  workbooks: {
    seed: (attrs: import("./chartBlockShared").ChartBlockAttrsV2) => import("./documentChartWorkbook").DocumentChartWorkbook | null;
    imported: (attrs: import("./chartBlockShared").ChartBlockAttrsV2) => import("./documentChartWorkbook").DocumentChartWorkbook | null;
  },
): import("./documentChartWorkbook").DocumentChartWorkbook | null {
  try {
    const own = normalizeDocumentChartHost(nodeAttrs.documentChart)?.workbook;
    if (own) return own;
    if (!nodeAttrs.source) return workbooks.seed(attrs);
    return DOCUMENT_CHART_EX_FAMILIES.has(attrs.chartType) ? workbooks.imported(attrs) : null;
  } catch {
    return null;
  }
}

/** The chart's host record with this workbook, its size and layout kept. */
export function documentChartHostWithWorkbook(
  nodeAttrs: Readonly<Record<string, unknown>>,
  workbook: import("./documentChartWorkbook").DocumentChartWorkbook,
): DocumentChartHost {
  const host = normalizeDocumentChartHost(nodeAttrs.documentChart);
  return {
    version: 1,
    size: host?.size ?? documentChartSize(nodeAttrs) ?? { ...DEFAULT_DOCUMENT_CHART_SIZE },
    ...(host?.layout ? { layout: host.layout } : {}),
    workbook,
  };
}

/**
 * The look Word draws an imported classic chart part in when the part states
 * no text of its own (no `c:txPr` on the chart or its elements, what
 * LibreOffice and Office 2007 write): the legacy look of chart style 2, the
 * same built-in text Excel draws such a part in (an 18pt bold black title,
 * 10pt black text: `excelBuiltInChartTextLook`), and, on a chart area that
 * states no paint, a grey frame. Display only, under everything the chart
 * states; nothing is stored or written.
 */
function wordBuiltInChartLook(
  source: { partName?: unknown; legacyChartLine?: unknown } | null | undefined,
  format: unknown,
): ChartNativeLook | undefined {
  if (typeof source?.partName !== "string" || !/^word\/charts\/chart\d+\.xml$/i.test(source.partName)) return undefined;
  const stated = record(format) ? format : undefined;
  // Its grey frame round a chart area that states no paint (#7b838e, 0.75pt:
  // corpus R22-D12 and R30-D12, Word's own PDF) is the built-in look's own.
  const look = excelBuiltInChartTextLook(stated);
  if (!look) return undefined;
  // Where Word draws the automatic lines or that frame otherwise
  // (`source.legacyChartLine`, the server's `office_automatic_chart_line`:
  // black lines in an AppVersion 14+ document for a part stating no
  
  // probe nostyle-app-docx).
  const evidence = record(source.legacyChartLine) ? source.legacyChartLine : undefined;
  const hex = (value: unknown) => (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : undefined);
  return withOfficeAutomaticChartLine(look, hex(evidence?.line), hex(evidence?.frame));
}

/** Why an imported Word chart is drawn and never edited (`source.preserveReasons`,
 * the server's reading generation 398): the preserve-only reading's gaps, one of
 * them not a look -- as a deck chart's receipt says `editable: false`. `null`
 * for every chart that takes an edit. */
export function documentChartPreserveReasons(source: unknown): string[] | null {
  if (!record(source) || !Array.isArray(source.preserveReasons)) return null;
  const reasons = source.preserveReasons.filter((reason): reason is string => typeof reason === "string" && reason !== "");
  return reasons.length ? reasons : null;
}
