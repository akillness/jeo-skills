/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { editsStayInsideTextblocks } from "./textblockOnlyEdits";
import { HOLDS_TABLE } from "../../../../lib/editor/sheet-facts";
import { ptToPx } from "../../../../lib/office-units";
import { WORD_CELL_TEXT_PX_ATTR } from "../../../../lib/text-engine/docs-lines";
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { CellSelection, TableMap, selectedRect } from "@tiptap/pm/tables";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import {
  authenticateDocumentTableDesignTarget,
  authenticateDocumentTableDesignPreview,
  documentTableDesignAuthorityFromNode,
  documentTableStyleCatalogFromDoc,
  resolveDocumentTableStyleCellVisual,
  type DocumentTableDesignState,
  type DocumentTableDesignTarget,
  type DocumentTableStyleVisualLayer,
} from "../../../../lib/document-table-design-authority";
import { normalizeCssColor } from "../extensions/TextStyling";
import {
  documentOfficeTableStyleIdForSlot,
  documentTableStyleVisualForId,
  findSelectedDocumentTable,
  isSourceBoundDocxTable,
  localOfficeTableDesignState,
  localOfficeTableLookForApplication,
} from "./documentOfficeTableStyles";
import { nativeTableGridWidths } from "./nativeTableGridView";
import { normalizeCellBackgroundColor, normalizeCellMargins, tableDefaultCellMargins } from "./tableCellStyle";
import { TABLE_CELL_DECORATION_STYLE_PROPERTIES } from "./tableCellMarginsPlugin";
import { wordAutoTextAttributes } from "./wordAutoTextColor";
import { normalizeCellShadingPattern, shadingPatternImage } from "./tableShading";
import { wordDoubleBorderWidthPx } from "../../../../lib/document-borders";
import { isGridFillerCell, tableHoldsGridFiller } from "./tableGridFiller";
import {
  TABLE_FRAGMENT_ID_ATTR,
  TABLE_FRAGMENT_START_ROW_ATTR,
  TABLE_REPEATED_HEADER_ATTR,
  TABLE_ROW_CONTINUATION_ATTR,
  TABLE_ROW_CONTINUES_ATTR,
  TABLE_SOURCE_ROW_ATTR,
} from "./paged/tablePagination";

/**
 * The row's place in the whole table, across the pages that cut it: its
 * stamped source row; else, in a continued fragment, the fragment's first
 * row plus the rows before it (repeated header rows are the table's own
 * first rows). A row the pages moved whole carried no stamp, and counted
 * from the top of its fragment its banded shading took the colour of the row
 * before it (WUA 212).
 */
function logicalTableRow(table: ProseMirrorNode, local: number): number {
  const row = table.maybeChild(local);
  const stamped = row?.attrs?.[TABLE_SOURCE_ROW_ATTR];
  if (Number.isInteger(stamped)) return stamped as number;
  if (row?.attrs?.[TABLE_REPEATED_HEADER_ATTR] === true) return local;
  const start = table.attrs?.[TABLE_FRAGMENT_START_ROW_ATTR];
  if (typeof table.attrs?.[TABLE_FRAGMENT_ID_ATTR] !== "string" || !Number.isInteger(start)) return local;
  let repeated = 0;
  for (let index = 0; index < local; index += 1) {
    if (table.maybeChild(index)?.attrs?.[TABLE_REPEATED_HEADER_ATTR] === true) repeated += 1;
  }
  return (start as number) + local - repeated;
}
import {
  normalizeTableRowHeight,
  normalizeTableRowHeightRule,
  normalizeTableRowHeightTwips,
} from "./tableRowStyle";
import { loadOfficeData, officeDataVersion, subscribeOfficeData } from "../../../../lib/office-data/store";

export const DOCUMENT_TABLE_BORDER_EDGES = [
  "top",
  "bottom",
  "left",
  "right",
  "insideH",
  "insideV",
] as const;

export const DOCUMENT_CELL_BORDER_EDGES = [
  ...DOCUMENT_TABLE_BORDER_EDGES,
  "diagonalDown",
  "diagonalUp",
] as const;

export const DOCUMENT_TABLE_BORDER_PRESETS = [
  "bottom",
  "top",
  "left",
  "right",
  "none",
  "all",
  "outside",
  "inside",
  "insideH",
  "insideV",
  "diagonalDown",
  "diagonalUp",
] as const;

export type DocumentTableBorderEdge =
  (typeof DOCUMENT_CELL_BORDER_EDGES)[number];
export type DocumentTableBorderPreset =
  (typeof DOCUMENT_TABLE_BORDER_PRESETS)[number];

export interface DocumentTableBorderLine {
  readonly style: string;
  readonly sizePt?: number;
  readonly color?: string;
}

export type DocumentTableBorders = Partial<
  Record<DocumentTableBorderEdge, DocumentTableBorderLine>
>;

export interface DocumentTableBorderPen {
  readonly style: string;
  readonly sizePt: number;
  readonly color?: string;
}

export const DEFAULT_DOCUMENT_TABLE_BORDER: DocumentTableBorderPen = {
  style: "single",
  sizePt: 0.5,
  color: "#000000",
};

const BORDER_STYLE_PATTERN = /^[A-Za-z]{1,32}$/;
const CELL_EDGE_SET = new Set<string>(DOCUMENT_CELL_BORDER_EDGES);
const TABLE_EDGE_SET = new Set<string>(DOCUMENT_TABLE_BORDER_EDGES);
const GRIDLINES_META = "documentTableGridlines";
const TABLE_STYLE_PREVIEW_META = "documentTableStylePreview";

function normalizedBorderLine(value: unknown): DocumentTableBorderLine | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.style !== "string" || !BORDER_STYLE_PATTERN.test(raw.style)) {
    return null;
  }
  // Keep a valid but unknown OOXML token byte-identical. Rendering may use a
  // solid fallback, but editor hydration must never rewrite source custody.
  const line: { style: string; sizePt?: number; color?: string } = {
    style: raw.style,
  };
  if (
    typeof raw.sizePt === "number" &&
    Number.isFinite(raw.sizePt) &&
    raw.sizePt >= 0
  ) {
    line.sizePt = raw.sizePt;
  }
  const color = normalizeCssColor(raw.color);
  if (color) line.color = color;
  return line;
}

export function normalizeDocumentTableBorders(
  value: unknown,
  scope: "table" | "cell" = "cell",
): DocumentTableBorders | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const allowed = scope === "table" ? TABLE_EDGE_SET : CELL_EDGE_SET;
  const normalized: DocumentTableBorders = {};
  for (const edge of DOCUMENT_CELL_BORDER_EDGES) {
    if (!allowed.has(edge)) continue;
    const line = normalizedBorderLine(source[edge]);
    if (line) normalized[edge] = line;
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
}

function readBorderDataAttribute(
  element: { getAttribute(name: string): string | null },
  attribute: string,
  scope: "table" | "cell",
): DocumentTableBorders | null {
  const value = element.getAttribute(attribute);
  if (!value) return null;
  try {
    return normalizeDocumentTableBorders(JSON.parse(value), scope);
  } catch {
    return null;
  }
}

export function readTableBordersFromElement(element: {
  getAttribute(name: string): string | null;
}): DocumentTableBorders | null {
  return readBorderDataAttribute(element, "data-table-borders", "table");
}

export function readCellBordersFromElement(element: {
  getAttribute(name: string): string | null;
}): DocumentTableBorders | null {
  return readBorderDataAttribute(element, "data-cell-borders", "cell");
}

function stableBorderJson(value: DocumentTableBorders): string {
  const ordered: DocumentTableBorders = {};
  for (const edge of DOCUMENT_CELL_BORDER_EDGES) {
    if (value[edge]) ordered[edge] = value[edge];
  }
  return JSON.stringify(ordered);
}

export function tableBordersAttributes(value: unknown): Record<string, string> {
  const borders = normalizeDocumentTableBorders(value, "table");
  return borders ? { "data-table-borders": stableBorderJson(borders) } : {};
}

function cssLineStyle(style: string): string {
  if (style === "none" || style === "nil") return "none";
  if (style === "double") return "double";
  if (style === "dotted") return "dotted";
  if (
    style === "dashed" ||
    style === "dashSmallGap" ||
    style === "dashDotStroked" ||
    style === "dotDash" ||
    style === "dotDotDash"
  ) {
    return "dashed";
  }
  return "solid";
}

function borderCss(line: DocumentTableBorderLine, native = false): string {
  const style = cssLineStyle(line.style);
  // `hidden` has the highest collapsed-table conflict priority, so an explicit
  // OOXML nil edge cannot be repainted by the editor's default table grid.
  if (style === "none") return "0px hidden transparent";
  const rawPt = line.sizePt ?? DEFAULT_DOCUMENT_TABLE_BORDER.sizePt;
  // Preserve the authored point width in the document model while ensuring a
  // visible cell edge can win against the editor's 1px collapsed table frame.
  const widthPx = Math.min(16, Math.max(native ? 0 : 1, ptToPx(rawPt)));
  // Word's double is two `w:sz` lines and a gap as wide (b-table probe).
  const renderedWidth = style === "double" ? wordDoubleBorderWidthPx(widthPx) : widthPx;
  return (
    String(Number(renderedWidth.toFixed(3))) +
    "px " +
    style +
    " " +
    (line.color ?? "currentColor")
  );
}

/**
 * The table frame Word draws around a table with cell spacing
 * (`w:tblCellSpacing`): with the cells pulled apart, the table's outer
 * `w:tblBorders` edges (top/left/bottom/right) frame the whole table, the
 * spacing between that frame and the cells (Word 16, b-table probe). The
 * collapsed path paints those edges on the outer cells instead, so a spaced
 * table lost them. Returns CSS declarations for the <table> element.
 */
export function tableCellSpacingFrameCss(value: unknown): string[] {
  const borders = normalizeDocumentTableBorders(value, "table");
  if (!borders) return [];
  const css: string[] = [];
  for (const edge of ["top", "right", "bottom", "left"] as const) {
    const line = borders[edge];
    if (line && cssLineStyle(line.style) !== "none") css.push(...borderEdgeCss(edge, line));
  }
  return css;
}

function borderEdgeCss(
  edge: PhysicalCellEdge,
  line: DocumentTableBorderLine,
  native = false,
): string[] {
  if (cssLineStyle(line.style) !== "none") {
    return ["border-" + edge + ":" + borderCss(line, native)];
  }
  // Keep these as ordered longhands. Browsers honor `hidden` for the collapsed
  // border algorithm, while CSSOM implementations that cannot expose a
  // side-specific hidden style still retain the zero width and transparency.
  return [
    "border-" + edge + "-style:hidden",
    "border-" + edge + "-width:0px",
    "border-" + edge + "-color:transparent",
  ];
}














function diagonalLayer(
  line: DocumentTableBorderLine,
  direction: "down" | "up",
): string | null {
  if (line.style === "none" || line.style === "nil") return null;
  const width = Math.min(
    8,
    Math.max(
      0.5,
      ptToPx((line.sizePt ?? DEFAULT_DOCUMENT_TABLE_BORDER.sizePt)),
    ),
  );
  // Word's Automatic border colour is black.
  const color = line.color ?? DEFAULT_DOCUMENT_TABLE_BORDER.color;
  const css = cssLineStyle(line.style);
  const [x1, y1, x2, y2] = direction === "down" ? [0, 0, 100, 100] : [0, 100, 100, 0];
  const strokeAttributes =
    `stroke='${color}' stroke-width='${Number(width.toFixed(3))}' vector-effect='non-scaling-stroke'` +
    (css === "dashed"
      ? " stroke-dasharray='8 6'"
      : css === "dotted"
        ? " stroke-dasharray='0.01 5' stroke-linecap='round'"
        : "");
  const segment = `x1='${x1}' y1='${y1}' x2='${x2}' y2='${y2}'`;
  let strokes: string;
  if (css === "double") {
    // Word's double is two `w:sz` lines and a gap as wide, as the straight
    // edges draw it (wordDoubleBorderWidthPx). Shifting two strokes inside
    // the stretched viewBox moved them a pixel or so on a wide cell, and the
    // 3 pt lines overlapped into one black band (live Word audit WUA 119).
    // One stroke as wide as the whole double, with its middle third masked
    // out, keeps the gap perpendicular to the line in CSS pixels whatever
    // the cell's shape and whatever paints behind it.
    const total = Number(wordDoubleBorderWidthPx(width).toFixed(3));
    const gap = Number((total / 3).toFixed(3));
    const mask = `diagonal-double-${direction}`;
    strokes =
      `<mask id='${mask}' maskUnits='userSpaceOnUse' x='-50' y='-50' width='200' height='200'>` +
      `<rect x='-50' y='-50' width='200' height='200' fill='white'/>` +
      `<line ${segment} stroke='black' stroke-width='${gap}' vector-effect='non-scaling-stroke'/>` +
      `</mask>` +
      `<line ${segment} stroke='${color}' stroke-width='${total}' vector-effect='non-scaling-stroke' mask='url(#${mask})'/>`;
  } else {
    strokes = `<line ${segment} ${strokeAttributes}/>`;
  }
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'>" +
    strokes +
    "</svg>";
  return 'url("data:image/svg+xml,' + encodeURIComponent(svg).replace(/%20/g, " ").replace(/%3D/g, "=").replace(/%2F/g, "/").replace(/%27/g, "'") + '")';
}

/** The `background-*` longhands that draw diagonal layers over the cell. */
function diagonalBackgroundCss(layers: readonly string[]): string[] {
  if (layers.length === 0) return [];
  return [
    "background-image:" + layers.join(","),
    "background-size:100% 100%",
    "background-repeat:no-repeat",
  ];
}

// Data custody plus direct-cell visual declarations for renderHTML.
export function cellBordersAttributes(value: unknown): Record<string, string> {
  const borders = normalizeDocumentTableBorders(value, "cell");
  if (!borders) return {};
  const style: string[] = [];
  for (const edge of ["top", "right", "bottom", "left"] as const) {
    const line = borders[edge];
    if (line) style.push(...borderEdgeCss(edge, line));
  }
  const layers = [
    borders.diagonalDown ? diagonalLayer(borders.diagonalDown, "down") : null,
    borders.diagonalUp ? diagonalLayer(borders.diagonalUp, "up") : null,
  ].filter((item): item is string => Boolean(item));
  style.push(...diagonalBackgroundCss(layers));
  return {
    "data-cell-borders": stableBorderJson(borders),
    ...(style.length > 0 ? { style: style.join(";") } : {}),
  };
}

function sameBorderLine(
  a: DocumentTableBorderLine | undefined,
  b: DocumentTableBorderLine | undefined,
): boolean {
  if (!a || !b) return a === b;
  return (
    a.style === b.style &&
    (a.sizePt ?? null) === (b.sizePt ?? null) &&
    (a.color ?? null) === (b.color ?? null)
  );
}

function sameBorders(
  a: DocumentTableBorders | null,
  b: DocumentTableBorders | null,
): boolean {
  if (!a || !b) return a === b;
  return DOCUMENT_CELL_BORDER_EDGES.every((edge) =>
    sameBorderLine(a[edge], b[edge]),
  );
}

interface TableCellGeometry {
  readonly pos: number;
  readonly node: ProseMirrorNode;
  readonly row1: number;
  readonly row2: number;
  readonly col1: number;
  readonly col2: number;
}

function tableCells(
  table: ProseMirrorNode,
  tablePos: number,
): TableCellGeometry[] {
  let map: TableMap;
  try {
    map = TableMap.get(table);
  } catch {
    return [];
  }
  const byOffset = new Map<number, number[]>();
  map.map.forEach((offset, index) => {
    const indexes = byOffset.get(offset) ?? [];
    indexes.push(index);
    byOffset.set(offset, indexes);
  });
  const cells: TableCellGeometry[] = [];
  for (const [offset, indexes] of byOffset) {
    const pos = tablePos + 1 + offset;
    const node = table.nodeAt(offset);
    if (
      !node ||
      (node.type.name !== "tableCell" && node.type.name !== "tableHeader")
    ) {
      continue;
    }
    const rows = indexes.map((index) => Math.floor(index / map.width));
    const cols = indexes.map((index) => index % map.width);
    cells.push({
      pos,
      node,
      row1: Math.min(...rows),
      row2: Math.max(...rows),
      col1: Math.min(...cols),
      col2: Math.max(...cols),
    });
  }
  return cells;
}

type PhysicalCellEdge = "top" | "right" | "bottom" | "left";
type EffectiveCellEdgeSegments = Record<
  PhysicalCellEdge,
  readonly (DocumentTableBorderLine | undefined)[]
>;

const SEGMENTED_EDGE_DELEGATE: DocumentTableBorderLine = { style: "nil" };
// A merged cell's long edge whose segments differ. It renders like nil; each
// adjacent cell draws its own segment.
const MIXED_EDGE_DELEGATE: DocumentTableBorderLine = { style: "nil" };

/** By a table's cell list: the cells standing on each row. */
const cellsByRow = new WeakMap<readonly TableCellGeometry[], Map<number, TableCellGeometry[]>>();

/**
 * The cells that can share `edge` with `cell`: those on the row above, on the
 * row below, or on its own rows. Every cell asking of every cell was each
 * table's square, at every change of the document (R315-D10, a 30-page table
 * of 9,131 cells: 80 million comparisons a transaction, the editor gone for a
 * minute at a time).
 */
function cellsInRowsNear(
  cell: TableCellGeometry,
  cells: readonly TableCellGeometry[],
  edge: PhysicalCellEdge,
): readonly TableCellGeometry[] {
  let byRow = cellsByRow.get(cells);
  if (!byRow) {
    byRow = new Map();
    for (const candidate of cells) {
      for (let row = candidate.row1; row <= candidate.row2; row += 1) {
        const standing = byRow.get(row);
        if (standing) standing.push(candidate);
        else byRow.set(row, [candidate]);
      }
    }
    cellsByRow.set(cells, byRow);
  }
  if (edge === "top") return byRow.get(cell.row1 - 1) ?? [];
  if (edge === "bottom") return byRow.get(cell.row2 + 1) ?? [];
  if (cell.row1 === cell.row2) return byRow.get(cell.row1) ?? [];
  const beside = new Set<TableCellGeometry>();
  for (let row = cell.row1; row <= cell.row2; row += 1) {
    for (const candidate of byRow.get(row) ?? []) beside.add(candidate);
  }
  return [...beside];
}

/**
 * The cells that share an edge with `cell`. A grid filler (`w:gridBefore` /
 * `w:gridAfter` padding, see tableGridFiller.ts) is never a neighbour: Word
 * holds no cell there, so the real cell beside it ends the row and its edge
 * is the table's OUTER edge, not an inside line.
 */
function adjacentCellsForEdge(
  cell: TableCellGeometry,
  cells: readonly TableCellGeometry[],
  edge: PhysicalCellEdge,
  kind: "cells" | "fillers" = "cells",
): TableCellGeometry[] {
  return cellsInRowsNear(cell, cells, edge)
    .filter((candidate) => {
      if (candidate === cell) return false;
      if (isGridFillerCell(candidate.node) !== (kind === "fillers")) return false;
      if (edge === "top") {
        return (
          candidate.row2 + 1 === cell.row1 &&
          candidate.col1 <= cell.col2 &&
          candidate.col2 >= cell.col1
        );
      }
      if (edge === "bottom") {
        return (
          candidate.row1 === cell.row2 + 1 &&
          candidate.col1 <= cell.col2 &&
          candidate.col2 >= cell.col1
        );
      }
      if (edge === "left") {
        return (
          candidate.col2 + 1 === cell.col1 &&
          candidate.row1 <= cell.row2 &&
          candidate.row2 >= cell.row1
        );
      }
      return (
        candidate.col1 === cell.col2 + 1 &&
        candidate.row1 <= cell.row2 &&
        candidate.row2 >= cell.row1
      );
    })
    .sort((a, b) =>
      edge === "top" || edge === "bottom"
        ? a.col1 - b.col1 || a.col2 - b.col2
        : a.row1 - b.row1 || a.row2 - b.row2,
    );
}

function effectiveCellEdgeSegments(
  table: ProseMirrorNode,
  cell: TableCellGeometry,
  dimensions: { rows: number; cols: number },
  cells: readonly TableCellGeometry[],
  styleLayers: ReadonlyMap<number, DocumentTableStyleVisualLayer> = new Map(),
): EffectiveCellEdgeSegments {
  const tableBorders = normalizeDocumentTableBorders(
    table.attrs.tableBorders,
    "table",
  );
  const cellBorders = normalizeDocumentTableBorders(
    cell.node.attrs.cellBorders,
    "cell",
  );
  const segments = (edge: PhysicalCellEdge) => {
    const direct = cellBorders?.[edge];
    // Direct Word `none` is a fall-through value; only `nil` is an explicit
    // tombstone that suppresses the inherited/opposing style edge.
    if (direct && direct.style !== "none") return [direct];
    const opposite = {
      top: "bottom",
      right: "left",
      bottom: "top",
      left: "right",
    }[edge] as PhysicalCellEdge;
    const neighbors = adjacentCellsForEdge(cell, cells, edge);
    const outside =
      (edge === "top" && cell.row1 === 0) ||
      (edge === "bottom" && cell.row2 === dimensions.rows - 1) ||
      (edge === "left" && cell.col1 === 0) ||
      (edge === "right" && cell.col2 === dimensions.cols - 1) ||
      // Nothing but grid fillers beyond this edge: the row ends here.
      (neighbors.length === 0 &&
        tableHoldsGridFiller(table) &&
        adjacentCellsForEdge(cell, cells, edge, "fillers").length > 0);
    const rawTableFallback = outside
      ? tableBorders?.[edge]
      : edge === "top" || edge === "bottom"
        ? tableBorders?.insideH
        : tableBorders?.insideV;
    const tableFallback =
      rawTableFallback?.style === "none" ? undefined : rawTableFallback;
    const neighborDirect = neighbors.map((candidate) => {
      const line = normalizeDocumentTableBorders(
        candidate.node.attrs.cellBorders,
        "cell",
      )?.[opposite];
      return line?.style === "none" ? undefined : line;
    });
    if (neighborDirect.some(Boolean)) {
      return neighborDirect.map((line) => line ?? tableFallback);
    }
    if (tableFallback) return [tableFallback];
    // The table's own `w:tblBorders` edge set to `none` overrides its style's
    // edge: Word 16 draws corpus R99-D04's Table Grid table (direct insideH
    // and insideV `none`) with no lines between its cells. Only a cell's own
    // `none` falls through.
    if (rawTableFallback?.style === "none") return [{ style: "nil" }];

    const ownStyle = styleLayers.get(cell.pos);
    const ownStyleCell = ownStyle?.clearedCellBorders.includes(edge)
      ? SEGMENTED_EDGE_DELEGATE
      : ownStyle?.cellBorders[edge];
    if (ownStyleCell) return [ownStyleCell];

    const neighborStyle = neighbors.map((candidate) => {
      const layer = styleLayers.get(candidate.pos);
      return layer?.clearedCellBorders.includes(opposite)
        ? SEGMENTED_EDGE_DELEGATE
        : layer?.cellBorders[opposite];
    });
    const ownStyleTableEdge = outside
      ? ownStyle?.clearedTableBorders.includes(edge)
        ? SEGMENTED_EDGE_DELEGATE
        : ownStyle?.tableBorders[edge]
      : edge === "top" || edge === "bottom"
        ? ownStyle?.clearedTableBorders.includes("insideH")
          ? SEGMENTED_EDGE_DELEGATE
          : ownStyle?.tableBorders.insideH
        : ownStyle?.clearedTableBorders.includes("insideV")
          ? SEGMENTED_EDGE_DELEGATE
          : ownStyle?.tableBorders.insideV;
    if (neighborStyle.some(Boolean)) {
      return neighborStyle.map((line) => line ?? ownStyleTableEdge);
    }
    return [ownStyleTableEdge];
  };
  return {
    top: segments("top"),
    right: segments("right"),
    bottom: segments("bottom"),
    left: segments("left"),
  };
}

function renderableCellEdges(
  table: ProseMirrorNode,
  cell: TableCellGeometry,
  dimensions: { rows: number; cols: number },
  cells: readonly TableCellGeometry[],
  styleLayers: ReadonlyMap<number, DocumentTableStyleVisualLayer>,
): Record<PhysicalCellEdge, DocumentTableBorderLine | undefined> {
  const segments = effectiveCellEdgeSegments(
    table,
    cell,
    dimensions,
    cells,
    styleLayers,
  );
  return Object.fromEntries(
    (Object.keys(segments) as PhysicalCellEdge[]).map((edge) => {
      const lines = segments[edge];
      const first = lines[0];
      const uniform = lines.every((line) => sameBorderLine(line, first));
      // A single CSS border cannot express a mixed long edge on a merged cell.
      // Make that side transparent and delegate each segment to its adjacent
      // cell, whose own effective edge still paints exact nil/single/table data.
      return [edge, uniform ? first : MIXED_EDGE_DELEGATE];
    }),
  ) as Record<PhysicalCellEdge, DocumentTableBorderLine | undefined>;
}

export interface NativeTableGridBorderProfile {
  readonly css: string;
  readonly usedWidthPx: number;
  /** The rule's own width (its w:sz), before the browser snaps it. */
  readonly authoredWidthPx: number;
}

const nativeBorderMetrics = new WeakMap<Document, Map<string, number>>();

/** CSS borders can snap to a used pixel width (0.5pt becomes 1px in Chrome).
 * Measure one isolated, font-independent probe per border, never per cell. */
function nativeBorderUsedWidth(css: string): number | null {
  if (typeof document === "undefined" || !document.body || !document.defaultView) return null;
  let cache = nativeBorderMetrics.get(document);
  if (!cache) { cache = new Map(); nativeBorderMetrics.set(document, cache); }
  const key = `${document.defaultView.devicePixelRatio}:${css}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const probe = document.createElement("span");
  probe.style.cssText = `all:initial;position:fixed;left:-10000px;top:0;width:0;height:0;visibility:hidden;pointer-events:none;border:${css}`;
  document.body.append(probe);
  try {
    const width = Number.parseFloat(document.defaultView.getComputedStyle(probe).borderLeftWidth);
    if (!Number.isFinite(width) || width <= 0) return null;
    if (cache.size >= 64) cache.clear();
    cache.set(key, width);
    return width;
  } finally { probe.remove(); }
}

function nativeGridBorderProfile(
  table: ProseMirrorNode,
  dimensions: { rows: number; cols: number },
  cells: readonly TableCellGeometry[],
  styleLayers: ReadonlyMap<number, DocumentTableStyleVisualLayer>,
): NativeTableGridBorderProfile | null {
  const source = table.attrs.source;
  if (source?.adapter !== "docx" || source.tableGridProfile !== 1 ||
      !/^word\/document\.xml#tbl\[\d+\]$/.test(source.sourceAnchor ?? "") ||
      !nativeTableGridWidths(table) || table.attrs.borderless === true ||
      table.attrs.tableLayoutPolicy != null || table.attrs.tablePositioning != null ||
      Number(table.attrs.tableCellSpacingPx ?? 0) !== 0 ||
      Number(table.attrs.tableCellSpacingTwips ?? 0) !== 0) return null;
  // The uniform-grid frame outlines the whole rectangle; a row that does not
  // fill the grid (grid fillers) leaves part of that rectangle blank in Word.
  if (cells.some((cell) => isGridFillerCell(cell.node))) return null;
  const authority = documentTableDesignAuthorityFromNode(table);
  if (source.tableDesignAuthority != null && !authority) return null;
  // A legacy effective-border fallback is not proof that an unresolved/custom
  // style has no conditional borders. Require the complete catalog projection
  // for styled native tables; genuinely direct six-edge borders need no style.
  if (authority?.current.styleId && styleLayers.size !== cells.length) return null;
  let uniform: DocumentTableBorderLine | undefined;
  for (const cell of cells) {
    // A cell spanning columns (w:gridSpan) is still one row of the grid with
    // one rule above and below it (corpus R36-D30: a header cell over two
    // columns kept every row of a 12-page table a whole pixel too tall). So
    // is a cell spanning rows (w:vMerge): it has one rule above and one below
    // it, and gives back the excess once; the rows it spans give back theirs
    // through their own cells (R06-D17 p6: a rating table whose header merges
    // two rows drew every one of its rows 0.25pt taller than Word's).
    const edges = renderableCellEdges(table, cell, dimensions, cells, styleLayers);
    for (const [edge, line] of Object.entries(edges) as [PhysicalCellEdge, DocumentTableBorderLine | undefined][]) {
      // A cell's nil edge across which its neighbour draws the line is that
      // line: the two cells share one rule, drawn by the neighbour (the cell
      // decoration yields to it), so the grid stays uniform. Corpus R94-D19:
      // every row under a header states "top: nil" over the Table Grid style's
      // inside rule; read as a missing line, the whole form left the uniform
      // grid, its columns lost the outer rules' halves and lines Word fits by
      // 0.6 px wrapped.
      if (line && line !== MIXED_EDGE_DELEGATE && (line.style === "nil" || line.style === "none")) {
        const opposite = ({ top: "bottom", bottom: "top", left: "right", right: "left" } as const)[edge];
        const neighbours = adjacentCellsForEdge(cell, cells, edge);
        const acrossLines = neighbours.map((neighbour) =>
          renderableCellEdges(table, neighbour, dimensions, cells, styleLayers)[opposite]);
        if (neighbours.length > 0 && acrossLines.every((across) =>
          Boolean(across) && across !== MIXED_EDGE_DELEGATE && across!.style === "single")) continue;
        // An inner horizontal edge no cell draws (R94-D19: under each form's
        // header, "bottom: nil" over "top: nil") is a row boundary with no
        // rule; the columns, which the grid is about, are the same.
        if ((edge === "top" || edge === "bottom") && neighbours.length > 0 && acrossLines.every((across) =>
          Boolean(across) && across !== MIXED_EDGE_DELEGATE && (across!.style === "nil" || across!.style === "none"))) continue;
        return null;
      }
      // Unresolved/default CSS, nil, mixed and unsupported border styles stay
      // on the prior path. A native grid alone never invents thin borders.
      if (!line || line.style !== "single" || typeof line.sizePt !== "number" ||
          !Number.isFinite(line.sizePt) || line.sizePt <= 0 || line.sizePt > 12 ||
          uniform && !sameBorderLine(uniform, line)) return null;
      uniform = line;
    }
  }
  if (!uniform) return null;
  const css = borderCss(uniform, true);
  const usedWidthPx = nativeBorderUsedWidth(css);
  if (usedWidthPx === null) return null;
  const inherited = tableDefaultCellMargins(table.attrs);
  for (const cell of cells) {
    const direct = normalizeCellMargins(cell.node.attrs.cellMargin);
    for (const side of ["left", "right"] as const) {
      const margin = direct?.[side] ?? inherited?.[side];
      if (margin === undefined || margin < usedWidthPx / 2) return null;
    }
  }
  return { css, usedWidthPx, authoredWidthPx: Number.parseFloat(css) };
}

/** Reuse the authenticated native style and existing border conflict resolver
 * for the NodeView's outer frame as well as each cell's inline decoration. */
export function documentNativeTableGridBorderProfile(
  state: EditorState,
  table: ProseMirrorNode,
): NativeTableGridBorderProfile | null {
  if (table.attrs.source?.tableGridProfile !== 1) return null;
  let map: TableMap;
  try { map = TableMap.get(table); } catch { return null; }
  const cells = tableCells(table, 0);
  const borderState = documentTableBorderPluginKey.getState(state);
  const preview = borderState?.preview;
  const design = preview && state.doc.nodeAt(preview.tablePos) === table
    ? preview.state : documentTableDesignAuthorityFromNode(table)?.current;
  const visual = design?.styleId
    ? documentTableStyleVisualForId(state.doc, design.styleId)
    : null;
  const layers = new Map<number, DocumentTableStyleVisualLayer>();
  if (visual && design) for (const cell of cells) {
    const layer = resolveDocumentTableStyleCellVisual(visual, design.look, {
      rowStart: cell.row1, rowEnd: cell.row2, columnStart: cell.col1, columnEnd: cell.col2,
      rows: map.height, columns: map.width,
    });
    if (layer) layers.set(cell.pos, layer);
  }
  return nativeGridBorderProfile(table, { rows: map.height, cols: map.width }, cells, layers);
}

/**
 * Word sets a line in a cell when its text is no wider than the cell's text
 * box; the browser rounds each glyph's advance up to its 1/64 px layout unit,
 * so text that fills the box exactly ran a hair past it and the line broke
 * (corpus R281-D19, Word 16.86: a full-width "１" at 8 pt in a 377-twip cell
 * with 108-twip margins, 160 twips of text box, one line in Word; here the
 * cell-end mark after it took a second line, and three such rows put a page
 * 72 px past Word's). The cell's end padding gives that unit back, twice
 * over for the column widths' own rounding.
 */
const CELL_TEXT_FIT_SLACK_PX = 1 / 32;

function cellTextFitSlackPx(side: "left" | "right", paddingPx: number): number {
  return side === "right" ? Math.min(CELL_TEXT_FIT_SLACK_PX, Math.max(0, paddingPx)) : 0;
}

/** A Word cell's text box as the model states it (WORD_CELL_TEXT_PX_ATTR):
 * the stored widths of the grid columns it spans less its two margins. */
function cellModelTextBoxPx(table: ProseMirrorNode, cell: TableCellGeometry): number | null {
  const span = Number(cell.node.attrs.colspan) || 1;
  const widths: unknown = cell.node.attrs.colwidth;
  if (!Array.isArray(widths) || widths.length !== span) return null;
  let grid = 0;
  for (const value of widths) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
    grid += value;
  }
  const direct = normalizeCellMargins(cell.node.attrs.cellMargin);
  const inherited = tableDefaultCellMargins(table.attrs);
  const left = direct?.left ?? inherited?.left;
  const right = direct?.right ?? inherited?.right;
  if (left === undefined || right === undefined) return null;
  const text = grid - left - right;
  return text > 0 ? text : null;
}

function isWordTable(table: ProseMirrorNode): boolean {
  const source: unknown = table.attrs.source;
  return Boolean(source) && typeof source === "object" && !Array.isArray(source)
    && (source as Record<string, unknown>).adapter === "docx";
}

/**
 * Word lays a line out at its `w:sz` width. An omitted (or zero) size adds
 * nothing to the row, yet Word still draws the line one device pixel thick.
 * A CSS border cannot be drawn without taking layout space, so such a line
 * is painted as an inset shadow instead.
 */
function isWordHairline(line: DocumentTableBorderLine): boolean {
  return cssLineStyle(line.style) !== "none"
    && !(typeof line.sizePt === "number" && line.sizePt > 0);
}

/** The on-screen line View Gridlines draws where a cell edge has no border. */
const VIEW_GRIDLINE: DocumentTableBorderLine = { style: "single", color: "rgba(100,116,139,0.55)" };

function hairlineShadow(edge: PhysicalCellEdge, line: DocumentTableBorderLine): string {
  const ratio = typeof globalThis.devicePixelRatio === "number" && globalThis.devicePixelRatio > 0
    ? globalThis.devicePixelRatio : 1;
  const width = `${Number((1 / ratio).toFixed(4))}px`;
  const offset = {
    top: `0 ${width}`,
    right: `-${width} 0`,
    bottom: `0 -${width}`,
    left: `${width} 0`,
  }[edge];
  return `inset ${offset} 0 0 ${line.color ?? "currentColor"}`;
}

/** `window.__docsTableOuterRuleExcess = true` gives the table's outer rules
 * back too (tableOuterRuleExcessPx). Off by default until measured. */
function tableOuterRuleExcessOn(): boolean {
  return (globalThis as { __docsTableOuterRuleExcess?: boolean }).__docsTableOuterRuleExcess === true;
}

/**
 * What a Word table off the uniform grid is taller than Word's beyond its
 * rows, given back by the cells of its last row.
 *
 * Word: a row is its text plus one rule at its w:sz (0.5pt = 0.667 px), and
 * the table is its rows plus the last rule below the last row: R281-D19's
 * floating form, Word's PDF: rules 168.96 ... 918.08 px apart by its rows,
 * the bottom rule 0.64 px thick, the first note's line at 918.72.
 * The browser: a collapsed-border row is its text plus half of the rule above
 * and half of the rule below, each drawn at its snapped width (0.5pt at 1 px,
 * nativeBorderUsedWidth), so a row is its text plus 1 px, and each cell gives
 * back (used - sz) for its two halves (the row excess above): text + 0.667,
 * Word's row. The table's box then adds half of its top rule and half of its
 * bottom rule outside the rows: 0.5 + 0.5 = 1 px where Word adds 0.667, so
 * the table is
 *   (usedTop - szTop) / 2 + (usedBottom - szBottom) / 2
 * taller than Word's (0.333 px for 0.5pt rules). R281-D19: ours 168.97 ->
 * 918.97 px, Word's 168.96 -> 918.72; the same 918.97 at device pixel ratio
 * 2 (measured), so this is the layout width, not the painting. With the 2 px
 * of frame padding gone (tablePageFrame), these 0.333 px left the last note
 * line 0.02 px past the bottom margin, on a page of its own (Word 13 pages,
 * ours 14).
 */
function tableOuterRuleExcessPx(
  table: ProseMirrorNode,
  cell: TableCellGeometry,
  dimensions: { rows: number; cols: number },
  cells: readonly TableCellGeometry[],
  styleLayers: ReadonlyMap<number, DocumentTableStyleVisualLayer>,
  bottom: DocumentTableBorderLine | undefined,
  lineExcess: (line: DocumentTableBorderLine | undefined) => number,
): number {
  const above = cells.find((other) => other.row1 === 0 && other.col1 <= cell.col1 && other.col2 >= cell.col1);
  if (!above) return 0;
  const top = renderableCellEdges(table, above, dimensions, cells, styleLayers).top;
  return (lineExcess(top) + lineExcess(bottom)) / 2;
}

function cellDecorationAttributes(
  table: ProseMirrorNode,
  cell: TableCellGeometry,
  dimensions: { rows: number; cols: number },
  cells: readonly TableCellGeometry[],
  gridlines: boolean,
  styleLayers: ReadonlyMap<number, DocumentTableStyleVisualLayer>,
  nativeGrid: NativeTableGridBorderProfile | null = null,
  styleOwnsEdges = false,
  /** The table stands in a cell of a Word table (it has no source of its own). */
  nestedInWordTable = false,
): Record<string, string> | null {
  if (isGridFillerCell(cell.node)) {
    // Empty space that belongs to no cell: it paints no line, fill or
    // hairline of its own. Beside a real cell the edge is `none`, so the real
    // cell's border wins the collapsed-border conflict; everywhere else it is
    // `hidden`, which also keeps the table's own frame from outlining a slot
    // Word leaves blank.
    return {
      style: (["top", "right", "bottom", "left"] as const)
        .flatMap((edge) =>
          adjacentCellsForEdge(cell, cells, edge).length > 0
            ? ["border-" + edge + ":0px none transparent"]
            : borderEdgeCss(edge, { style: "nil" }),
        )
        .join(";"),
    };
  }
  const cellBorders = normalizeDocumentTableBorders(
    cell.node.attrs.cellBorders,
    "cell",
  );
  const tableBorders = normalizeDocumentTableBorders(
    table.attrs.tableBorders,
    "table",
  );
  const styleLayer = styleLayers.get(cell.pos);
  const hasStyleBorders = Boolean(
    styleLayer &&
    (Object.keys(styleLayer.tableBorders).length > 0 ||
      Object.keys(styleLayer.cellBorders).length > 0 ||
      styleLayer.clearedTableBorders.length > 0 ||
      styleLayer.clearedCellBorders.length > 0),
  );
  // Word draws only the lines a table defines; the editor's default grid is
  // for the editor's own tables. An editor table that wears an Office gallery
  // style is drawn the way Word draws that style.
  const wordTable = isWordTable(table);
  const definedLinesOnly = wordTable || styleOwnsEdges;
  if (
    !cellBorders &&
    !tableBorders &&
    table.attrs.borderless !== true &&
    !definedLinesOnly &&
    !gridlines &&
    !styleLayer?.fill &&
    !styleLayer?.color &&
    styleLayer?.bold === undefined &&
    styleLayer?.fontSizePt === undefined &&
    !hasStyleBorders
  ) {
    return null;
  }
  const style: string[] = [];
  if (styleLayer?.fill) {
    style.push("--document-table-style-bg:" + styleLayer.fill);
  }
  if (styleLayer?.color) {
    style.push("--document-table-style-color:" + styleLayer.color);
  }
  if (styleLayer?.fontSizePt !== undefined) {
    style.push("--document-table-style-font-size:" + styleLayer.fontSizePt + "pt");
  }
  const effective = renderableCellEdges(
    table,
    cell,
    dimensions,
    cells,
    styleLayers,
  );
  const hairlines: string[] = [];
  // Each hairline is drawn once: by the cell below or to the right of it,
  // unless that edge is outside the table or its neighbor handed it back.
  // Cached per table node, so a table with no filler pays nothing here.
  const ragged = tableHoldsGridFiller(table);
  const besideFiller = (
    target: TableCellGeometry,
    edge: PhysicalCellEdge,
  ): boolean =>
    ragged && adjacentCellsForEdge(target, cells, edge, "fillers").length > 0;
  const drawsHairline = (edge: PhysicalCellEdge): boolean => {
    if (edge === "top" || edge === "left") {
      if (!ragged) return true;
      // A cell above / to the left that also runs along a grid filler draws
      // this whole edge itself (the filler draws nothing), so it is not
      // drawn a second time from this side.
      const opposite = edge === "top" ? "bottom" : "right";
      return !adjacentCellsForEdge(cell, cells, edge).some((neighbor) =>
        besideFiller(neighbor, opposite),
      );
    }
    if (besideFiller(cell, edge)) return true;
    const neighbors = adjacentCellsForEdge(cell, cells, edge);
    const opposite = edge === "bottom" ? "top" : "left";
    return neighbors.length === 0 || neighbors.some((neighbor) =>
      renderableCellEdges(table, neighbor, dimensions, cells, styleLayers)[opposite]
        === MIXED_EDGE_DELEGATE);
  };
  // A nil edge across which the neighbour draws its own line yields to that
  // line: the two are one line in Word, drawn by the neighbour. Written
  // `hidden` (the strongest collapsed style) it erased the line from the
  // table's layout, so the rows lost its width (corpus R93-D09's cells state
  // only their bottom borders: Word lays a 3pt line 3pt below the row,
  // the page drew the rows as if there were none). Written `none` (the
  // weakest), the neighbour's line wins and takes its room.
  const neighbourDraws = (edge: PhysicalCellEdge): boolean => {
    const opposite = ({ top: "bottom", bottom: "top", left: "right", right: "left" } as const)[edge];
    return adjacentCellsForEdge(cell, cells, edge).some((neighbour) => {
      const across = renderableCellEdges(table, neighbour, dimensions, cells, styleLayers)[opposite];
      return Boolean(across) && across !== MIXED_EDGE_DELEGATE && cssLineStyle(across!.style) !== "none" &&
        !(wordTable && isWordHairline(across!));
    });
  };
  // View Gridlines shows where a cell edge is that no border draws. Word's
  // gridlines are on screen only and sit behind the borders: they never
  // change the layout (Microsoft Support, "Show or hide gridlines for all
  // tables in a document"). Drawn as a 1px dotted CSS border they took a
  // pixel of every row line, so a borderless 3x3 table grew 4px and the
  // paragraph after it changed pages (live Word audit WUA 262). The edge is
  // laid out exactly as with gridlines off and the gridline is painted as an
  // inset hairline, the way a Word hairline already is: once per edge, by
  // the cell below or to the right of it.
  const drawsGridline = (edge: PhysicalCellEdge): boolean =>
    edge === "top" || edge === "left"
      ? drawsHairline(edge)
      : besideFiller(cell, edge) || adjacentCellsForEdge(cell, cells, edge).length === 0;
  for (const edge of ["top", "right", "bottom", "left"] as const) {
    const line = effective[edge];
    let unlined = false;
    if (line) {
      const explicitNone = line.style === "none" || line.style === "nil";
      if (explicitNone && line !== MIXED_EDGE_DELEGATE && neighbourDraws(edge)) {
        style.push("border-" + edge + "-style:none", "border-" + edge + "-width:0px");
      } else if (wordTable && isWordHairline(line)) {
        style.push(...borderEdgeCss(edge, { style: "nil" }));
        if (drawsHairline(edge)) hairlines.push(hairlineShadow(edge, line));
      } else {
        style.push(...borderEdgeCss(edge, line, nativeGrid !== null));
        unlined = explicitNone && !neighbourDraws(edge);
      }
    } else if (table.attrs.borderless === true || definedLinesOnly) {
      style.push(...borderEdgeCss(edge, { style: "nil" }));
      unlined = true;
    }
    if (gridlines && unlined && drawsGridline(edge)) {
      hairlines.push(hairlineShadow(edge, VIEW_GRIDLINE));
    }
  }
  if (nativeGrid) {
    const direct = normalizeCellMargins(cell.node.attrs.cellMargin);
    const inherited = tableDefaultCellMargins(table.attrs);
    for (const side of ["left", "right"] as const) {
      const margin = direct?.[side] ?? inherited?.[side];
      if (margin !== undefined) {
        // Word's horizontal margin is measured from the grid edge. Collapsed
        // CSS padding starts after half the used border; don't charge it twice.
        style.push(`padding-${side}:${margin - nativeGrid.usedWidthPx / 2 - cellTextFitSlackPx(side, margin - nativeGrid.usedWidthPx / 2)}px`);
      }
    }
  } else if (wordTable || nestedInWordTable) {
    // The same holds off the uniform grid (a merged cell, mixed lines): Word
    // keeps a cell's text box its width less its two margins, its lines
    // standing in those margins, never in its text. Measured in Word 16 on a
    // fixed 850-twip column with 108-twip margins and 0.5pt lines: three
    // 10.5pt glyphs fill its 31.7pt on one line. Each side gives back half
    // of the line the browser draws there, so the text box is Word's.
    // A table nested in a Word table's cell is Word's too, though it carries
    // no source of its own. Word 16.86 truth PDF, corpus R280-D15 (mode 15):
    // a nested cell of 874.9 twips (43.7pt between its rules) with 108-twip
    // margins and a 192-twip right indent sets "AOP" (11pt Arial, 23.24pt)
    // on one line in the 23.34pt left; a third-level cell of 473 twips sets
    // "IZV." (8pt Calibri Bold, 12.80pt) in 12.85pt. Charged for its lines
    // the text box was 0.75pt narrower and both words were cut in two.
    const direct = normalizeCellMargins(cell.node.attrs.cellMargin);
    const inherited = tableDefaultCellMargins(table.attrs);
    // An edge this cell states nil (or leaves to its neighbour) still holds half
    // of the line the neighbour draws along it: the collapsed border is one
    // rule shared by both cells, and the browser puts half of it in each. Word
    // 16.86 truth PDF, corpus R280-D15 p4: a third-level nested cell of 473
    // twips, left nil beside a cell whose right line is 0.5pt single, sets
    // "IZV." (12.80pt) and "552" on one line between rules 23.76pt apart;
    // charged only for its right line, its text box was 16.6px for the 17.1 it
    // needs and both were cut in two (so were "INDEKS", "IZVOR", "112.384.899,60").
    const sharedLine = (side: "left" | "right"): DocumentTableBorderLine | undefined => {
      const opposite = side === "left" ? "right" : "left";
      const across = adjacentCellsForEdge(cell, cells, side).map((neighbour) =>
        renderableCellEdges(table, neighbour, dimensions, cells, styleLayers)[opposite]);
      const first = across[0];
      return first && first !== MIXED_EDGE_DELEGATE && across.every((line) => line && sameBorderLine(line, first))
        ? first : undefined;
    };
    for (const side of ["left", "right"] as const) {
      const margin = direct?.[side] ?? inherited?.[side];
      const own = effective[side];
      const line = own === undefined || (own !== MIXED_EDGE_DELEGATE && cssLineStyle(own.style) === "none")
        ? sharedLine(side) : own;
      if (margin === undefined || !line || line === MIXED_EDGE_DELEGATE || isWordHairline(line) ||
          cssLineStyle(line.style) === "none") continue;
      const used = nativeBorderUsedWidth(borderCss(line));
      if (used !== null && used > 0 && margin >= used / 2) {
        const padding = margin - used / 2;
        style.push(`padding-${side}:${Number((padding - cellTextFitSlackPx(side, padding)).toFixed(5))}px`);
      }
    }
  }
  if (nativeGrid) {
    // A row of Word's grid is its text plus one rule (its w:sz, 0.5pt =
    // 0.67px: b-table's 20.06px rows). The browser draws the rule at its
    // snapped width (1px), and a collapsed row takes half of each, so every
    // row grew by the difference and a page held one row fewer than Word's.
    // The cell gives that difference back (note-editor.css, ::before).
    const excess = nativeGrid.usedWidthPx - nativeGrid.authoredWidthPx;
    if (excess > 0.001 && excess < 1) style.push(`--doc-cell-rule-excess:${Number(excess.toFixed(3))}px`);
  }
  // The cell's text box as Word sets it: its grid columns less its two
  // margins, in the model's own units, for the line engine to fit words to
  // (readDocsParagraph): the browser keeps the column, paddings and borders
  // in 1/64 px units and gives the end padding back CELL_TEXT_FIT_SLACK_PX.
  const cellTextPx = wordTable || nativeGrid || nestedInWordTable ? cellModelTextBoxPx(table, cell) : null;
  let wordRuleExcess = 0;
  if (!nativeGrid && wordTable) {
    // Off the uniform grid (a floating table, a merged cell, mixed lines) a
    // Word row is still its text plus its rules at their w:sz: the half of
    // the line above and the half below that the browser draws wider (0.5pt
    // at 1px) is given back the same way. D-word T06, a floating table of
    // 12pt rows under 0.5pt lines: Word's rows are 12.48pt apart, ours were
    // 12.75pt, and the table bottom-aligned on the margin stood 0.8pt high.
    const lineExcess = (line: DocumentTableBorderLine | undefined): number => {
      if (!line || line === MIXED_EDGE_DELEGATE || line.style !== "single" ||
          typeof line.sizePt !== "number" || !(line.sizePt > 0) || line.sizePt > 12) return 0;
      const used = nativeBorderUsedWidth(borderCss(line));
      return used === null ? 0 : Math.max(0, used - ptToPx(line.sizePt));
    };
    const rowExcess = (lineExcess(effective.top) + lineExcess(effective.bottom)) / 2;
    // Off (the default) this is exactly the row's own give-back, as before.
    const outerExcess = rowExcess < 1 && cell.row2 === dimensions.rows - 1 && tableOuterRuleExcessOn()
      ? tableOuterRuleExcessPx(table, cell, dimensions, cells, styleLayers, effective.bottom, lineExcess)
      : 0;
    const excess = rowExcess + outerExcess;
    if (excess > 0.001 && excess < (outerExcess > 0 ? 1.5 : 1)) {
      wordRuleExcess = Number(excess.toFixed(3));
      style.push(`--doc-cell-rule-excess:${wordRuleExcess}px`);
    }
  }
  if (hairlines.length > 0) style.push("box-shadow:" + hairlines.join(","));
  if (cellBorders) {
    const layers = [
      cellBorders.diagonalDown ? diagonalLayer(cellBorders.diagonalDown, "down") : null,
      cellBorders.diagonalUp ? diagonalLayer(cellBorders.diagonalUp, "up") : null,
    ].filter((item): item is string => Boolean(item));
    // The diagonals take the cell's `background-image`, so its shading
    // pattern goes under them in the same list: Word draws both.
    const pattern = layers.length > 0
      ? shadingPatternImage(
          normalizeCellBackgroundColor(cell.node.attrs.backgroundColor),
          normalizeCellShadingPattern(cell.node.attrs.cellShading),
        )
      : null;
    style.push(...diagonalBackgroundCss(pattern ? [...layers, pattern] : layers));
  }
  // Word's Automatic text colour contrasts with the cell's shading: its own
  // fill, else the table style's (a style colour, when set, is explicit).
  const autoTextFill =
    normalizeCellBackgroundColor(cell.node.attrs.backgroundColor) ?? styleLayer?.fill;
  return {
    ...(autoTextFill ? wordAutoTextAttributes(autoTextFill) : {}),
    ...(styleLayer?.fill ? { "data-table-style-bg": styleLayer.fill } : {}),
    ...(styleLayer?.color
      ? { "data-table-style-color": styleLayer.color }
      : {}),
    ...(styleLayer?.bold !== undefined
      ? { "data-table-style-bold": String(styleLayer.bold) }
      : {}),
    ...(styleLayer?.fontSizePt !== undefined
      ? { "data-table-style-size": String(styleLayer.fontSizePt) }
      : {}),
    ...(nativeGrid ? { "data-native-grid-cell-padding": String(nativeGrid.usedWidthPx) } : {}),
    ...(wordRuleExcess > 0 ? { "data-word-rule-excess": String(wordRuleExcess) } : {}),
    ...(cellTextPx !== null ? { [WORD_CELL_TEXT_PX_ATTR]: String(Number(cellTextPx.toFixed(4))) } : {}),
    ...(style.length > 0 ? { style: style.join(";") } : {}),
  };
}

interface DocumentTableStylePreview {
  readonly tablePos: number;
  readonly state: DocumentTableDesignState;
}

interface TableBorderPluginState {
  readonly gridlines: boolean;
  readonly preview: DocumentTableStylePreview | null;
  readonly decorations: DecorationSet;
}

export const documentTableBorderPluginKey =
  new PluginKey<TableBorderPluginState>("documentTableBorders");

/** The served gallery looks arrived: draw the tables that name a gallery
 * style again (no document change, no history step). */
const OFFICE_TABLE_STYLES_ARRIVED_META = "documentTableBorders:officeTableStyles";

/** One node decoration of a table, its range from the table's own start. */
type TableDecorationItem = readonly [from: number, to: number, attrs: Record<string, string>, spec?: Record<string, unknown>];









const tableDecorationMemo = new WeakMap<ProseMirrorNode, { key: string; items: readonly TableDecorationItem[]; descend: boolean }>();
const docAttrsIds = new WeakMap<object, number>();
let nextDocAttrsId = 1;
/** The document attributes a table's look reads (its style catalogue,
 * definitions, theme), by identity: a document copied for a step keeps them. */
function docAttrsId(doc: ProseMirrorNode): number {
  const attrs = doc.attrs as object;
  let id = docAttrsIds.get(attrs);
  if (id === undefined) {
    id = nextDocAttrsId++;
    docAttrsIds.set(attrs, id);
  }
  return id;
}

/** Harness switch (`window.__docsCellPaddingOwnedOff = true`): the cell view
 * syncs its own side padding over the border decoration's (A/B). */
function cellPaddingOwnedOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsCellPaddingOwnedOff?: boolean }).__docsCellPaddingOwnedOff === true;
}

/** `window.__docsTableBorderMemo = false` draws every table again each time (A/B). */
function tableBorderMemoOn(): boolean {
  return typeof window === "undefined" || (window as Window & { __docsTableBorderMemo?: boolean }).__docsTableBorderMemo !== false;
}

function tableBorderDecorations(
  doc: ProseMirrorNode,
  gridlines: boolean,
  preview: DocumentTableStylePreview | null,
): DecorationSet {
  const decorations: Decoration[] = [];
  const memoOn = tableBorderMemoOn();
  const lookKey = `${docAttrsId(doc)}|${gridlines ? 1 : 0}|${officeDataVersion("word-table-styles")}`;
  // A table the pages cut is one table: its style's row bands, first and
  
  // continuation restarted the bands, so a row's colour followed the page).
  const logicalRows = new Map<string, number>();
  HOLDS_TABLE.descendants(doc, (node) => {
    if (node.isTextblock) return false;
    if (node.type.name !== "table") return true;
    const id = node.attrs?.[TABLE_FRAGMENT_ID_ATTR];
    if (typeof id === "string" && id) {
      for (let local = 0; local < node.childCount; local += 1) {
        const source = logicalTableRow(node, local);
        logicalRows.set(id, Math.max(logicalRows.get(id) ?? 0, source + 1));
      }
    }
    return true;
  });
  const visualCatalog = new Map(
    documentTableStyleCatalogFromDoc(doc).map((entry) => [
      entry.styleId,
      entry.visual,
    ]),
  );
  // Where the Word table being walked ends: a table before that stands in
  // one of its cells.
  let wordTableEnd = -1;
  HOLDS_TABLE.descendants(doc, (node, pos) => {
    // A text block holds no table: do not walk its inline content.
    if (node.isTextblock) return false;
    if (node.type.name !== "table") return true;
    const nestedInWordTable = pos < wordTableEnd && !isWordTable(node);
    if (isWordTable(node)) wordTableEnd = Math.max(wordTableEnd, pos + node.nodeSize);
    const fragmentId = node.attrs?.[TABLE_FRAGMENT_ID_ATTR];
    const fragmentRows = typeof fragmentId === "string" && fragmentId ? logicalRows.get(fragmentId) ?? 0 : 0;
    // A table the style preview paints is drawn fresh, and not kept.
    const key = memoOn && preview?.tablePos !== pos ? `${lookKey}|${nestedInWordTable ? 1 : 0}|${fragmentRows}` : null;
    const kept = key === null ? undefined : tableDecorationMemo.get(node);
    if (kept && kept.key === key) {
      for (const [from, to, attrs, spec] of kept.items) decorations.push(Decoration.node(pos + from, pos + to, attrs, spec));
      // Go on into the cells all the same: a table nested in one is a table of its own.
      return kept.descend;
    }
    const items: TableDecorationItem[] = [];
    const add = (from: number, to: number, attrs: Record<string, string>, spec?: Record<string, unknown>) => {
      items.push(spec ? [from - pos, to - pos, attrs, spec] : [from - pos, to - pos, attrs]);
      decorations.push(Decoration.node(from, to, attrs, spec));
    };
    const tableAttrs: Record<string, string> = {
      ...tableBordersAttributes(node.attrs.tableBorders),
      ...(node.attrs.borderless === true ? { "data-borderless": "true" } : {}),
    };
    if (Object.keys(tableAttrs).length > 0) {
      add(pos, pos + node.nodeSize, tableAttrs);
    }
    let map: TableMap;
    try {
      map = TableMap.get(node);
    } catch {
      if (key !== null) tableDecorationMemo.set(node, { key, items, descend: false });
      return false;
    }
    const cells = tableCells(node, pos);
    const authority = documentTableDesignAuthorityFromNode(node);
    const editorTable = !authority && !isSourceBoundDocxTable(node);
    const state =
      preview?.tablePos === pos
        ? preview.state
        : (authority?.current ??
          (editorTable ? localOfficeTableDesignState(doc, node) : null));
    const visual = state?.styleId
      ? documentTableStyleVisualForId(doc, state.styleId, visualCatalog)
      : null;
    const styleLayers = new Map<number, DocumentTableStyleVisualLayer>();
    if (visual && state) {
      const rows = fragmentRows || map.height;
      const sourceRow = (local: number): number => logicalTableRow(node, local);
      for (const cell of cells) {
        const layer = resolveDocumentTableStyleCellVisual(visual, state.look, {
          rowStart: sourceRow(cell.row1),
          // `row2` is the cell's last row, inclusive (as `col2` is): the
          // first row of a continued fragment read row -1 here, its layer
          // came out empty, and the whole fragment lost Word's rule width
          // (corpus R36-D30: every page after the first a row short).
          rowEnd: sourceRow(cell.row2),
          columnStart: cell.col1,
          columnEnd: cell.col2,
          rows,
          columns: map.width,
        });
        if (layer) styleLayers.set(cell.pos, layer);
      }
    }
    const nativeGrid = nativeGridBorderProfile(
      node, { rows: map.height, cols: map.width }, cells, styleLayers,
    );
    if (nativeGrid) add(pos, pos + node.nodeSize, {
      "data-native-grid-border-box": nativeGrid.css,
    });
    for (const cell of cells) {
      const attrs = cellDecorationAttributes(
        node,
        cell,
        { rows: map.height, cols: map.width },
        cells,
        gridlines,
        styleLayers,
        nativeGrid,
        editorTable && Boolean(visual),
        nestedInWordTable,
      );
      if (attrs) {
        // The side padding a Word cell gives back for the half line the
        // browser draws inside it (cellDecorationAttributes) is this
        // decoration's: the cell view leaves it to it when it syncs the cell's
        // own styles. Off the native grid it wrote the cell's own margins back
        // on the cell's first update, and the text box lost the line's half
        // again (corpus R351-D12, a table in a content control: "Slice
        // thickness (mm)" on four lines for Word's three, 40.27pt of 41).
        // `window.__docsCellPaddingOwnedOff = true`: as before (A/B).
        const owned = attrs["data-native-grid-cell-padding"] === undefined && !cellPaddingOwnedOff()
          ? (attrs.style ?? "").split(";").map((declaration) => declaration.split(":")[0]!.trim())
            .filter((name) => name === "padding-left" || name === "padding-right")
          : [];
        add(cell.pos, cell.pos + cell.node.nodeSize, attrs, {
          nativeGridPadding: attrs["data-native-grid-cell-padding"] ?? null,
          ...(owned.length > 0 ? { [TABLE_CELL_DECORATION_STYLE_PROPERTIES]: owned } : {}),
        });
      }
    }
    for (const [from, to, attrs] of atLeastRowRuleDecorations(
      node, pos, { rows: map.height, cols: map.width }, cells, styleLayers,
    )) add(from, to, attrs);
    if (key !== null) tableDecorationMemo.set(node, { key, items, descend: true });
    // Go on into the cells: a table nested in one is a table of its own, with
    
    return true;
  });
  return decorations.length > 0
    ? DecorationSet.create(doc, decorations)
    : DecorationSet.empty;
}

/**
 * An "At least" row (`w:trHeight w:hRule="atLeast"`) is its height PLUS the
 * line across its top: Word 16 lays a 680-twip row of a 0.5pt grid 34.5pt
 * apart (850 -> 43.0pt, 700 -> 35.5pt), and of a 3pt grid 37.0pt apart, while
 * an "Exactly" row is its height, line included (680 -> 34.0pt). A collapsed
 * HTML table counts the line inside the row's height, so each such row is
 * given the line's width on top of it. A row the paginator split keeps its
 * pieces' own heights; a row with no stated height already grows by its line.
 *
 * Its height is also the cells' text area: Word adds the row's largest top
 * and bottom cell margins to it (Word 16 probe rowh: a 720-twip row of
 * 288-twip margins stands 65.3pt, of 113/142 49.2pt; corpus R280-D19's
 * form, rows 1008-1202 twips tall, each 13.3pt taller than our CSS height,
 * which counts the cells' padding inside it). An "Exactly" row is its height
 * and the bottom margin alone (the same probe: 720 twips over 288-twip
 * margins 50.4pt, over a 288-twip top margin alone 36.0pt).
 *
 * The rest of an "At least" row the paginator split (the piece on the next
 * page) is that height again, its margins and line on top: Windows Word lays
 * the one line left of a 280-twip row of 100-twip margins 24.5pt tall (20.3
 * without the height), 18pt -> 28.5, 20pt -> 30.5, in compatibility modes 14
 * and 15 alike (docx-look tables/probes/rest r1/q1-q9; corpus R417-D03 page
 * 10, the "Machinery" header's "ID" 24.6pt where we drew 19.8). The head
 * keeps its own height (it stands to its page's foot).
 */
function atLeastRowRuleDecorations(
  table: ProseMirrorNode,
  tablePos: number,
  dimensions: { rows: number; cols: number },
  cells: readonly TableCellGeometry[],
  styleLayers: ReadonlyMap<number, DocumentTableStyleVisualLayer>,
): TableDecorationItem[] {
  const heights: Array<{ index: number; pos: number; size: number; px: number; exact: boolean }> = [];
  let rowPos = tablePos + 1;
  table.forEach((row, _offset, index) => {
    const attrs = row.attrs ?? {};
    const heightRule = normalizeTableRowHeightRule(attrs.rowHeightRule);
    if (
      heightRule !== null &&
      attrs[TABLE_ROW_CONTINUES_ATTR] !== true &&
      (attrs[TABLE_ROW_CONTINUATION_ATTR] !== true || (heightRule === "atLeast" && !splitRestFloorPadOff()))
    ) {
      const twips = normalizeTableRowHeightTwips(attrs.rowHeightTwips);
      const px = twips !== null ? twips / 15 : normalizeTableRowHeight(attrs.rowHeight);
      if (px !== null) heights.push({ index, pos: rowPos, size: row.nodeSize, px, exact: heightRule === "exact" });
    }
    rowPos += row.nodeSize;
  });
  if (!heights.length) return [];
  const drawnWidthPx = (line: DocumentTableBorderLine | typeof MIXED_EDGE_DELEGATE | undefined): number => {
    if (!line || line === MIXED_EDGE_DELEGATE || cssLineStyle(line.style) === "none") return 0;
    const widthPx = ptToPx((line.sizePt ?? DEFAULT_DOCUMENT_TABLE_BORDER.sizePt));
    return line.style === "double" ? wordDoubleBorderWidthPx(widthPx) : widthPx;
  };
  const rule = new Map<number, number>();
  const tableMargins = tableDefaultCellMargins(table.attrs);
  const marginTop = new Map<number, number>();
  const marginBottom = new Map<number, number>();
  for (const cell of cells) {
    if (isGridFillerCell(cell.node)) continue;
    const own = normalizeCellMargins(cell.node.attrs.cellMargin);
    const top = own?.top ?? tableMargins?.top ?? 0;
    const bottom = own?.bottom ?? tableMargins?.bottom ?? 0;
    marginTop.set(cell.row1, Math.max(marginTop.get(cell.row1) ?? 0, top));
    marginBottom.set(cell.row2, Math.max(marginBottom.get(cell.row2) ?? 0, bottom));
    const edges = renderableCellEdges(table, cell, dimensions, cells, styleLayers);
    rule.set(cell.row1, Math.max(rule.get(cell.row1) ?? 0, drawnWidthPx(edges.top)));
    // The line between two rows is one line, whichever cell states it: a
    // row whose own top states none takes the line the row above draws along
    // its foot (corpus R93-D09: every cell states only its bottom border, and
    // Word lays the 15pt rows 15.5pt apart; 3pt bottom lines 18pt apart).
    // (`row2` is the cell's last row; the line opens the row after it.)
    if (cell.row2 + 1 < dimensions.rows) {
      rule.set(cell.row2 + 1, Math.max(rule.get(cell.row2 + 1) ?? 0, drawnWidthPx(edges.bottom)));
    }
  }
  return heights.flatMap(({ index, pos, size, px, exact }): TableDecorationItem[] => {
    const extra = exact
      ? marginBottom.get(index) ?? 0
      : (rule.get(index) ?? 0) + (marginTop.get(index) ?? 0) + (marginBottom.get(index) ?? 0);
    if (extra <= 0) return [];
    return [[pos, pos + size, {
      style: `height:${Math.round((px + extra) * 1000) / 1000}px`,
      "data-row-height-rule-extra": String(Math.round(extra * 1000) / 1000),
    }]];
  });
}

/** Harness switch (`window.__docsSplitRestFloorPadOff = true`): the rest of
 * a split "At least" row is its height with its margins inside it (A/B). */
function splitRestFloorPadOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsSplitRestFloorPadOff?: boolean }).__docsSplitRestFloorPadOff === true;
}

export function createDocumentTableBorderPlugin(): Plugin<TableBorderPluginState> {
  return new Plugin<TableBorderPluginState>({
    key: documentTableBorderPluginKey,
    state: {
      init: (_config, state) => ({
        gridlines: false,
        preview: null,
        decorations: tableBorderDecorations(state.doc, false, null),
      }),
      apply: (transaction, current) => {
        const requested = transaction.getMeta(GRIDLINES_META);
        const gridlines =
          typeof requested === "boolean" ? requested : current.gridlines;
        const previewRequest = transaction.getMeta(TABLE_STYLE_PREVIEW_META) as
          | {
              readonly kind: "set";
              readonly preview: DocumentTableStylePreview;
            }
          | { readonly kind: "clear" }
          | undefined;
        let preview = current.preview;
        if (previewRequest?.kind === "set") preview = previewRequest.preview;
        else if (previewRequest?.kind === "clear") preview = null;
        else if (transaction.docChanged || transaction.selectionSet)
          preview = null;
        if (
          !transaction.docChanged &&
          gridlines === current.gridlines &&
          preview === current.preview &&
          !transaction.getMeta(OFFICE_TABLE_STYLES_ARRIVED_META)
        ) {
          return current;
        }
        // Words typed in a block draw no border anew: walking every table of a long
        // document for it, and diffing every sheet for the new set, was a tenth of a
        // key on a report of tables (corpus R286-D01).
        if (
          transaction.docChanged &&
          gridlines === current.gridlines &&
          preview === current.preview &&
          !transaction.getMeta(OFFICE_TABLE_STYLES_ARRIVED_META) &&
          editsStayInsideTextblocks([transaction])
        ) {
          return { gridlines, preview, decorations: current.decorations.map(transaction.mapping, transaction.doc) };
        }
        return {
          gridlines,
          preview,
          decorations: tableBorderDecorations(
            transaction.doc,
            gridlines,
            preview,
          ),
        };
      },
    },
    props: {
      decorations: (state) =>
        documentTableBorderPluginKey.getState(state)?.decorations ??
        DecorationSet.empty,
    },
    // A table wearing a gallery style draws from the served looks
    // (`lib/office-data/store.ts`): asked for as the editor opens, and the
    // tables are drawn again when they land after the first layout.
    view(view) {
      let seen = officeDataVersion("word-table-styles");
      void loadOfficeData("word-table-styles");
      const unsubscribe = subscribeOfficeData(() => {
        const next = officeDataVersion("word-table-styles");
        if (next === seen || view.isDestroyed) return;
        seen = next;
        view.dispatch(
          view.state.tr
            .setMeta(OFFICE_TABLE_STYLES_ARRIVED_META, true)
            .setMeta("addToHistory", false),
        );
      });
      return { destroy: unsubscribe };
    },
  });
}

export function setDocumentTableStylePreview(
  editor: Editor,
  target: DocumentTableDesignTarget,
  state: DocumentTableDesignState | null,
): boolean {
  if (editor.isDestroyed) return false;
  const current =
    documentTableBorderPluginKey.getState(editor.state)?.preview ?? null;
  if (state === null) {
    if (!current || !authenticateDocumentTableDesignTarget(editor, target)) {
      return false;
    }
    editor.view.dispatch(
      editor.state.tr
        .setMeta(TABLE_STYLE_PREVIEW_META, { kind: "clear" })
        .setMeta("addToHistory", false),
    );
    return true;
  }
  const normalized = authenticateDocumentTableDesignPreview(
    editor,
    target,
    state,
  );
  if (!normalized) return false;
  editor.view.dispatch(
    editor.state.tr
      .setMeta(TABLE_STYLE_PREVIEW_META, {
        kind: "set",
        preview: { tablePos: target.tablePos, state: normalized },
      })
      .setMeta("addToHistory", false),
  );
  return true;
}

/**
 * Live preview of an Office gallery slot (or of clearing the style, `null`)
 * on the editor table holding the selection. View-only: it paints through the
 * same decorations as the committed style and leaves no history entry.
 * `undefined` ends the preview.
 */
export function setDocumentLocalTableStylePreview(
  editor: Editor,
  slot: number | null | undefined,
): boolean {
  if (editor.isDestroyed) return false;
  const current =
    documentTableBorderPluginKey.getState(editor.state)?.preview ?? null;
  if (slot === undefined) {
    if (!current) return false;
    editor.view.dispatch(
      editor.state.tr
        .setMeta(TABLE_STYLE_PREVIEW_META, { kind: "clear" })
        .setMeta("addToHistory", false),
    );
    return true;
  }
  const target = findSelectedDocumentTable(editor);
  if (
    !target ||
    documentTableDesignAuthorityFromNode(target.node) ||
    isSourceBoundDocxTable(target.node)
  ) {
    return false;
  }
  const styleId =
    slot === null
      ? null
      : documentOfficeTableStyleIdForSlot(editor.state.doc, slot);
  if (slot !== null && !styleId) return false;
  editor.view.dispatch(
    editor.state.tr
      .setMeta(TABLE_STYLE_PREVIEW_META, {
        kind: "set",
        preview: {
          tablePos: target.pos,
          state: {
            styleId,
            look: localOfficeTableLookForApplication(target.node),
          },
        },
      })
      .setMeta("addToHistory", false),
  );
  return true;
}

export function documentTableGridlinesVisible(editor: Editor): boolean {
  return (
    documentTableBorderPluginKey.getState(editor.state)?.gridlines === true
  );
}

export function setDocumentTableGridlinesVisible(
  editor: Editor,
  visible: boolean,
): boolean {
  if (editor.isDestroyed) return false;
  const current = documentTableGridlinesVisible(editor);
  if (current === visible) return false;
  editor.view.dispatch(
    editor.state.tr
      .setMeta(GRIDLINES_META, visible)
      .setMeta("addToHistory", false),
  );
  return true;
}

interface SelectionIdentity {
  readonly kind: string;
  readonly from: number;
  readonly to: number;
  readonly anchor: number;
  readonly head: number;
}

function selectionIdentity(editor: Editor): SelectionIdentity {
  const { selection } = editor.state;
  return {
    kind: selection.constructor.name,
    from: selection.from,
    to: selection.to,
    anchor: selection.anchor,
    head: selection.head,
  };
}

function sameSelectionIdentity(
  a: SelectionIdentity,
  b: SelectionIdentity,
): boolean {
  return (
    a.kind === b.kind &&
    a.from === b.from &&
    a.to === b.to &&
    a.anchor === b.anchor &&
    a.head === b.head
  );
}

export interface DocumentTableBorderTarget {
  readonly doc: ProseMirrorNode;
  readonly selection: SelectionIdentity;
  readonly tablePos: number;
  readonly tableNode: ProseMirrorNode;
  readonly cells: readonly TableCellGeometry[];
  readonly selected: readonly TableCellGeometry[];
  readonly scope: "table" | "cells";
  readonly row1: number;
  readonly row2: number;
  readonly col1: number;
  readonly col2: number;
}

function selectedCellPositions(editor: Editor, tablePos: number): Set<number> {
  const selected = new Set<number>();
  const { selection } = editor.state;
  if (selection instanceof CellSelection) {
    selection.forEachCell((_node, pos) => selected.add(pos));
    return selected;
  }
  for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
    const node = selection.$from.node(depth);
    if (node.type.name !== "tableCell" && node.type.name !== "tableHeader") {
      continue;
    }
    selected.add(selection.$from.before(depth));
    break;
  }
  if (selected.size === 0 && selection.from === tablePos) {
    const node = editor.state.doc.nodeAt(selection.from);
    if (node?.type.name === "table") {
      for (const cell of tableCells(node, tablePos)) selected.add(cell.pos);
    }
  }
  return selected;
}

export function readDocumentTableBorderTarget(
  editor: Editor,
): DocumentTableBorderTarget | null {
  if (editor.isDestroyed) return null;
  const { doc, selection } = editor.state;
  let tablePos: number | null = null;
  let tableNode: ProseMirrorNode | null = null;
  for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
    const node = selection.$from.node(depth);
    if (node.type.name === "table") {
      tablePos = selection.$from.before(depth);
      tableNode = node;
      break;
    }
  }
  if (!tableNode && doc.nodeAt(selection.from)?.type.name === "table") {
    tablePos = selection.from;
    tableNode = doc.nodeAt(selection.from);
  }
  if (tablePos === null || !tableNode || doc.nodeAt(tablePos) !== tableNode) {
    return null;
  }
  const cells = tableCells(tableNode, tablePos);
  const selectedPositions = selectedCellPositions(editor, tablePos);
  const selected = cells.filter((cell) => selectedPositions.has(cell.pos));
  if (selected.length === 0) return null;
  return {
    doc,
    selection: selectionIdentity(editor),
    tablePos,
    tableNode,
    cells,
    selected,
    scope:
      selection instanceof NodeSelection &&
      selection.from === tablePos &&
      selection.node === tableNode
        ? "table"
        : "cells",
    row1: Math.min(...selected.map((cell) => cell.row1)),
    row2: Math.max(...selected.map((cell) => cell.row2)),
    col1: Math.min(...selected.map((cell) => cell.col1)),
    col2: Math.max(...selected.map((cell) => cell.col2)),
  };
}

function authenticateTarget(
  editor: Editor,
  expected: DocumentTableBorderTarget,
): DocumentTableBorderTarget | null {
  if (
    editor.isDestroyed ||
    !editor.isEditable ||
    editor.state.doc !== expected.doc
  ) {
    return null;
  }
  const current = readDocumentTableBorderTarget(editor);
  if (
    !current ||
    current.tablePos !== expected.tablePos ||
    current.tableNode !== expected.tableNode ||
    current.scope !== expected.scope ||
    !sameSelectionIdentity(current.selection, expected.selection) ||
    current.selected.length !== expected.selected.length ||
    current.selected.some(
      (cell, index) =>
        cell.pos !== expected.selected[index]?.pos ||
        cell.node !== expected.selected[index]?.node,
    )
  ) {
    return null;
  }
  return current;
}

function cellPresetPatch(
  preset: DocumentTableBorderPreset,
  line: DocumentTableBorderLine,
  cell: TableCellGeometry,
  target: DocumentTableBorderTarget,
): DocumentTableBorders {
  const patch: DocumentTableBorders = {};
  const none = { style: "nil" } as const;
  const top = cell.row1 === target.row1;
  const bottom = cell.row2 === target.row2;
  const left = cell.col1 === target.col1;
  const right = cell.col2 === target.col2;
  const set = (
    edge: DocumentTableBorderEdge,
    value: DocumentTableBorderLine = line,
  ) => {
    patch[edge] = value;
  };
  if (preset === "none") {
    for (const edge of [
      "top",
      "bottom",
      "left",
      "right",
      "diagonalDown",
      "diagonalUp",
    ] as const) {
      set(edge, none);
    }
    return patch;
  }
  if (preset === "all") {
    for (const edge of ["top", "bottom", "left", "right"] as const) set(edge);
    return patch;
  }
  if (preset === "outside") {
    if (top) set("top");
    if (bottom) set("bottom");
    if (left) set("left");
    if (right) set("right");
    return patch;
  }
  if (preset === "inside" || preset === "insideH") {
    if (!top) set("top");
    if (!bottom) set("bottom");
  }
  if (preset === "inside" || preset === "insideV") {
    if (!left) set("left");
    if (!right) set("right");
  }
  if (preset === "top" && top) set("top");
  if (preset === "bottom" && bottom) set("bottom");
  if (preset === "left" && left) set("left");
  if (preset === "right" && right) set("right");
  if (preset === "diagonalDown") set("diagonalDown");
  if (preset === "diagonalUp") set("diagonalUp");
  return patch;
}

function tablePresetPatch(
  preset: DocumentTableBorderPreset,
  line: DocumentTableBorderLine,
): DocumentTableBorders | null {
  const patch: DocumentTableBorders = {};
  const none = { style: "nil" } as const;
  const set = (
    edge: DocumentTableBorderEdge,
    value: DocumentTableBorderLine = line,
  ) => {
    patch[edge] = value;
  };
  if (preset === "diagonalDown" || preset === "diagonalUp") return null;
  if (preset === "none") {
    for (const edge of DOCUMENT_TABLE_BORDER_EDGES) set(edge, none);
    return patch;
  }
  if (preset === "all") {
    for (const edge of DOCUMENT_TABLE_BORDER_EDGES) set(edge);
    return patch;
  }
  if (preset === "outside") {
    for (const edge of ["top", "bottom", "left", "right"] as const) set(edge);
    return patch;
  }
  if (preset === "inside") {
    set("insideH");
    set("insideV");
    return patch;
  }
  set(preset, line);
  return patch;
}

function mergeBorderPatch(
  current: unknown,
  patch: DocumentTableBorders,
  scope: "table" | "cell",
): DocumentTableBorders | null {
  const base = normalizeDocumentTableBorders(current, scope) ?? {};
  return normalizeDocumentTableBorders({ ...base, ...patch }, scope);
}

export type DocumentTableBorderCommitResult =
  "changed" | "unchanged" | "rejected";








export function mergedRegionCellBorders(
  state: EditorState,
): DocumentTableBorders | null {
  const selection = state.selection;
  if (!(selection instanceof CellSelection)) return null;
  let rect: ReturnType<typeof selectedRect>;
  try {
    rect = selectedRect(state);
  } catch {
    return null;
  }
  const cells = tableCells(rect.table, rect.tableStart - 1);
  const inRegion = cells.filter(
    (cell) =>
      cell.row1 >= rect.top &&
      cell.row2 < rect.bottom &&
      cell.col1 >= rect.left &&
      cell.col2 < rect.right,
  );
  if (inRegion.length < 2) return null;
  const onEdge: Record<PhysicalCellEdge, (cell: TableCellGeometry) => boolean> = {
    top: (cell) => cell.row1 === rect.top,
    bottom: (cell) => cell.row2 === rect.bottom - 1,
    left: (cell) => cell.col1 === rect.left,
    right: (cell) => cell.col2 === rect.right - 1,
  };
  const borders: DocumentTableBorders = {};
  for (const edge of ["top", "bottom", "left", "right"] as const) {
    const explicit = inRegion
      .filter(onEdge[edge])
      .map(
        (cell) =>
          normalizeDocumentTableBorders(cell.node.attrs.cellBorders, "cell")?.[edge],
      )
      .find((line) => line !== undefined);
    if (explicit) borders[edge] = explicit;
  }
  return borders;
}

export function commitDocumentTableBorderPreset(
  editor: Editor,
  expected: DocumentTableBorderTarget,
  preset: DocumentTableBorderPreset,
  pen: DocumentTableBorderPen = DEFAULT_DOCUMENT_TABLE_BORDER,
  applyTo: "selection" | "table" = "selection",
  /**
   * `remove` takes away only the edges `preset` names (a border pressed where
   * it is already drawn in the pen, as Word's Borders gallery toggles). No
   * Border itself still clears every edge.
   */
  mode: "draw" | "remove" = "draw",
  /** "join" adds the change to the Undo step before it (a compound entry). */
  history: "new" | "join" = "new",
): DocumentTableBorderCommitResult {
  if (!DOCUMENT_TABLE_BORDER_PRESETS.includes(preset)) return "rejected";
  const live = authenticateTarget(editor, expected);
  if (!live) return "rejected";
  const penLine = normalizedBorderLine(pen);
  if (!penLine || penLine.style === "none" || penLine.style === "nil") return "rejected";
  const removing = mode === "remove" && preset !== "none";
  const line: DocumentTableBorderLine = removing ? { style: "nil" } : penLine;
  let transaction = editor.state.tr;
  let changed = false;
  const tableScope = applyTo === "table";
  if (tableScope) {
    const patch = tablePresetPatch(preset, line);
    if (!patch) return "rejected";
    const next = mergeBorderPatch(
      live.tableNode.attrs.tableBorders,
      patch,
      "table",
    );
    const current = normalizeDocumentTableBorders(
      live.tableNode.attrs.tableBorders,
      "table",
    );
    if (!sameBorders(current, next)) {
      transaction = transaction.setNodeMarkup(
        live.tablePos,
        undefined,
        { ...live.tableNode.attrs, tableBorders: next, borderless: false },
        live.tableNode.marks,
      );
      changed = true;
    }
    // A table-level "No Border" must also neutralize direct cell borders.
    // Imported DOCX tables commonly carry their visible frame on tcBorders;
    // changing only tblBorders leaves that stronger cell authority painted.
    // Taking one preset away does the same for the edges it names.
    if (preset === "none" || removing) {
      const whole = {
        ...live,
        row1: Math.min(...live.cells.map((cell) => cell.row1)),
        row2: Math.max(...live.cells.map((cell) => cell.row2)),
        col1: Math.min(...live.cells.map((cell) => cell.col1)),
        col2: Math.max(...live.cells.map((cell) => cell.col2)),
      };
      for (const cell of live.cells) {
        const cellPatch = cellPresetPatch(preset, line, cell, whole);
        const currentCell = normalizeDocumentTableBorders(
          cell.node.attrs.cellBorders,
          "cell",
        );
        const nextCell = mergeBorderPatch(
          cell.node.attrs.cellBorders,
          cellPatch,
          "cell",
        );
        if (sameBorders(currentCell, nextCell)) continue;
        transaction = transaction.setNodeMarkup(
          cell.pos,
          undefined,
          { ...cell.node.attrs, cellBorders: nextCell },
          cell.node.marks,
        );
        changed = true;
      }
    }
  } else {
    const patches = new Map<number, { cell: TableCellGeometry; patch: DocumentTableBorders }>();
    const patchFor = (cell: TableCellGeometry) => {
      let entry = patches.get(cell.pos);
      if (!entry) {
        entry = { cell, patch: {} };
        patches.set(cell.pos, entry);
      }
      return entry.patch;
    };
    for (const cell of live.selected) {
      const patch = cellPresetPatch(preset, line, cell, live);
      if (Object.keys(patch).length === 0) continue;
      Object.assign(patchFor(cell), patch);
    }
    // A drawn edge is shared with the cell on its other side. That cell's
    // explicit nil (a borderless table) renders as CSS `hidden`, which
    // outranks every line in the collapsed model, so the edge the menu
    // reported as set never showed. The neighbour's facing edge takes the
    
    // An edge taken away is taken from both sides: the neighbour's own line
    // on the shared edge would otherwise still paint it.
    if (preset !== "none") {
      const opposite = {
        top: "bottom",
        bottom: "top",
        left: "right",
        right: "left",
      } as const;
      for (const { cell, patch } of [...patches.values()]) {
        for (const edge of ["top", "bottom", "left", "right"] as const) {
          const drawn = patch[edge];
          if (!drawn) continue;
          if (removing) {
            for (const neighbour of adjacentCellsForEdge(cell, live.cells, edge)) {
              const facing = opposite[edge];
              if (patches.get(neighbour.pos)?.patch[facing]) continue;
              const direct = normalizeDocumentTableBorders(
                neighbour.node.attrs.cellBorders,
                "cell",
              )?.[facing];
              if (lineIsDrawn(direct)) patchFor(neighbour)[facing] = line;
            }
            continue;
          }
          if (!lineIsDrawn(drawn)) continue;
          for (const neighbour of adjacentCellsForEdge(cell, live.cells, edge)) {
            const facing = opposite[edge];
            const pending = patches.get(neighbour.pos)?.patch[facing];
            if (pending) continue;
            const direct = normalizeDocumentTableBorders(
              neighbour.node.attrs.cellBorders,
              "cell",
            )?.[facing];
            if (lineIsDrawn(direct)) continue;
            patchFor(neighbour)[facing] = drawn;
          }
        }
      }
    }
    for (const { cell, patch } of patches.values()) {
      const current = normalizeDocumentTableBorders(
        cell.node.attrs.cellBorders,
        "cell",
      );
      const next = mergeBorderPatch(cell.node.attrs.cellBorders, patch, "cell");
      if (sameBorders(current, next)) continue;
      transaction = transaction.setNodeMarkup(
        cell.pos,
        undefined,
        { ...cell.node.attrs, cellBorders: next },
        cell.node.marks,
      );
      changed = true;
    }
  }
  if (!changed || !transaction.docChanged) return "unchanged";
  editor.view.dispatch(history === "join" ? transaction : closeHistory(transaction));
  return "changed";
}

/**
 * Draw several presets, each in its own pen, as one Undo step: the Borders
 * list's compound entries such as Top and Thick Bottom Border. Each step
 * reads the table afresh, so it lands on the borders the step before drew.
 */
export function commitDocumentTableBorderSteps(
  editor: Editor,
  expected: DocumentTableBorderTarget,
  steps: readonly {
    readonly preset: DocumentTableBorderPreset;
    readonly pen: DocumentTableBorderPen;
  }[],
  applyTo: "selection" | "table" = "selection",
): DocumentTableBorderCommitResult {
  let target: DocumentTableBorderTarget | null = expected;
  let result: DocumentTableBorderCommitResult = "unchanged";
  for (const step of steps) {
    if (!target) return result === "changed" ? result : "rejected";
    const outcome = commitDocumentTableBorderPreset(
      editor,
      target,
      step.preset,
      step.pen,
      applyTo,
      "draw",
      result === "changed" ? "join" : "new",
    );
    if (outcome === "rejected") return result === "changed" ? result : "rejected";
    if (outcome === "changed") result = "changed";
    target = readDocumentTableBorderTarget(editor);
  }
  return result;
}

function lineIsDrawn(line: DocumentTableBorderLine | undefined): boolean {
  return Boolean(line && line.style !== "none" && line.style !== "nil");
}

function lineIsExplicitNone(
  line: DocumentTableBorderLine | undefined,
): boolean {
  return line?.style === "none" || line?.style === "nil";
}

function presetStatesForLines(
  preset: DocumentTableBorderPreset,
  target: DocumentTableBorderTarget,
  /** Count a line only when it is already exactly this pen. */
  pen?: DocumentTableBorderLine | null,
): boolean[] {
  const present = (line: DocumentTableBorderLine | undefined) =>
    lineIsDrawn(line) && (!pen || sameBorderLine(line, pen));
  if (target.scope === "table") {
    const borders = normalizeDocumentTableBorders(
      target.tableNode.attrs.tableBorders,
      "table",
    );
    const patch = tablePresetPatch(preset, DEFAULT_DOCUMENT_TABLE_BORDER);
    if (!patch) return [];
    return Object.keys(patch).map((edge) => {
      const line = borders?.[edge as DocumentTableBorderEdge];
      return preset === "none" ? lineIsExplicitNone(line) : present(line);
    });
  }
  let dimensions: { rows: number; cols: number };
  try {
    const map = TableMap.get(target.tableNode);
    dimensions = { rows: map.height, cols: map.width };
  } catch {
    return [];
  }
  const states: boolean[] = [];
  for (const cell of target.selected) {
    const patch = cellPresetPatch(
      preset,
      DEFAULT_DOCUMENT_TABLE_BORDER,
      cell,
      target,
    );
    const directBorders = normalizeDocumentTableBorders(
      cell.node.attrs.cellBorders,
      "cell",
    );
    const effective = effectiveCellEdgeSegments(
      target.tableNode,
      cell,
      dimensions,
      target.cells,
    );
    for (const edge of Object.keys(patch) as DocumentTableBorderEdge[]) {
      if (edge === "insideH" || edge === "insideV") continue;
      const lines =
        edge === "diagonalDown" || edge === "diagonalUp"
          ? [directBorders?.[edge]]
          : effective[edge];
      for (const line of lines) {
        states.push(
          preset === "none" ? lineIsExplicitNone(line) : present(line),
        );
      }
    }
  }
  return states;
}

export function documentTableBorderPresetState(
  target: DocumentTableBorderTarget | null,
  preset: DocumentTableBorderPreset,
): boolean | "indeterminate" {
  if (!target) return false;
  const states = presetStatesForLines(preset, target);
  if (states.length === 0) return false;
  const active = states.filter(Boolean).length;
  if (active === states.length) return true;
  return active > 0 ? "indeterminate" : false;
}

/**
 * Whether every line `preset` draws on the target is already `pen`. The
 * Borders button (Word) takes a border away only then; with another pen it
 * draws the border in that pen instead.
 */
export function documentTableBorderPresetMatchesPen(
  target: DocumentTableBorderTarget | null,
  preset: DocumentTableBorderPreset,
  pen: DocumentTableBorderPen,
): boolean {
  if (!target || preset === "none") return false;
  const line = normalizedBorderLine(pen);
  if (!line) return false;
  const states = presetStatesForLines(preset, target, line);
  return states.length > 0 && states.every(Boolean);
}

export function documentTableBorderPen(
  target: DocumentTableBorderTarget | null,
): DocumentTableBorderPen {
  if (!target) return DEFAULT_DOCUMENT_TABLE_BORDER;
  const tableCandidates: DocumentTableBorderLine[] = [];
  const cellCandidates: DocumentTableBorderLine[] = [];
  const table = normalizeDocumentTableBorders(
    target.tableNode.attrs.tableBorders,
    "table",
  );
  if (table) tableCandidates.push(...Object.values(table));
  for (const cell of target.selected) {
    const borders = normalizeDocumentTableBorders(
      cell.node.attrs.cellBorders,
      "cell",
    );
    if (borders) cellCandidates.push(...Object.values(borders));
  }
  // The visible pen follows the authority that the next action will write:
  // selected-cell overrides for cell scope, table defaults for table scope.
  const candidates =
    target.scope === "table"
      ? [...tableCandidates, ...cellCandidates]
      : [...cellCandidates, ...tableCandidates];
  const first = candidates.find(lineIsDrawn);
  return first
    ? {
        style: first.style,
        sizePt: first.sizePt ?? DEFAULT_DOCUMENT_TABLE_BORDER.sizePt,
        ...(first.color ? { color: first.color } : {}),
      }
    : DEFAULT_DOCUMENT_TABLE_BORDER;
}
