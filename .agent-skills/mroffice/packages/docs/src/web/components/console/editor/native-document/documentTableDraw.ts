/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import {
  Fragment,
  type Node as ProseMirrorNode,
  type Schema,
} from "@tiptap/pm/model";
import { TextSelection, type Selection } from "@tiptap/pm/state";
import { TableMap } from "@tiptap/pm/tables";

import {
  resolveTableBorderEraseMerge,
  tableBorderEdgeSiblings,
  type TableBorderEdgeRef,
  type TableBorderEraseMerge,
} from "@mrnote/slides/web/lib/presentation-table-border-pen.ts";
import type { MergeableCell } from "@mrnote/core/web/lib/presentation-table-merge.ts";

import {
  DEFAULT_DOCUMENT_TABLE_BORDER,
  normalizeDocumentTableBorders,
  type DocumentTableBorderEdge,
  type DocumentTableBorderLine,
  type DocumentTableBorderPen,
} from "@mrnote/core/web/components/console/editor/native-document/tableBorders.ts";

export type DocumentTableDrawMode = "draw" | "erase" | "paint";
export type DocumentTableDrawResult = "applied" | "invalid" | "stale";

export interface DocumentTableDrawTarget {
  readonly doc: ProseMirrorNode;
  readonly selection: Selection;
  readonly tablePos: number;
  readonly tableNode: ProseMirrorNode;
  readonly cellPos: number;
  readonly cellNode: ProseMirrorNode;
  readonly sourceRow: number;
  readonly sourceCell: number;
}

export interface DocumentTableDrawInsertionTarget {
  readonly doc: ProseMirrorNode;
  readonly selection: Selection;
  readonly position: number;
}

export interface DocumentTableDrawCell extends MergeableCell {
  readonly row: number;
  readonly col: number;
  readonly pos: number;
  readonly offset: number;
  readonly node: ProseMirrorNode;
  readonly rowspan: number;
  readonly colspan: number;
  readonly text: string;
}

const ERASE_LINE: DocumentTableBorderLine = { style: "nil" };
const MAX_DRAW_TABLE_LOGICAL_CELLS = 4_096;
const MIN_NATIVE_ROW_HEIGHT_TWIPS = 120;

function drawLine(
  pen: DocumentTableBorderPen = DEFAULT_DOCUMENT_TABLE_BORDER,
): DocumentTableBorderLine {
  return {
    style: pen.style,
    sizePt: pen.sizePt,
    ...(pen.color ? { color: pen.color } : {}),
  };
}

const EDGE_TO_ATTRIBUTE: Record<
  TableBorderEdgeRef["side"],
  DocumentTableBorderEdge
> = {
  top: "top",
  right: "right",
  bottom: "bottom",
  left: "left",
};

function positiveSpan(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : 1;
}

export function documentTableDrawCells(
  tableNode: ProseMirrorNode,
  tablePos: number,
): DocumentTableDrawCell[][] | null {
  try {
    const map = TableMap.get(tableNode);
    if (map.problems !== null) return null;
    const rows: DocumentTableDrawCell[][] = [];
    tableNode.forEach((rowNode, rowOffset, row) => {
      const cells: DocumentTableDrawCell[] = [];
      rowNode.forEach((cellNode, cellOffset, col) => {
        const pos = tablePos + 1 + rowOffset + 1 + cellOffset;
        cells.push({
          row,
          col,
          pos,
          offset: pos - tablePos - 1,
          node: cellNode,
          rowspan: positiveSpan(cellNode.attrs.rowspan),
          colspan: positiveSpan(cellNode.attrs.colspan),
          text: cellNode.textContent,
        });
      });
      rows.push(cells);
    });
    return rows;
  } catch {
    return null;
  }
}

function ancestorPosition(
  editor: Editor,
  rawPosition: number,
): { tablePos: number; cellPos: number } | null {
  const bounded = Math.max(
    0,
    Math.min(rawPosition, editor.state.doc.content.size),
  );
  const $position = editor.state.doc.resolve(bounded);
  let tablePos: number | null = null;
  let cellPos: number | null = null;
  let tableAncestors = 0;
  for (let depth = 1; depth <= $position.depth; depth += 1) {
    const node = $position.node(depth);
    if (node.type.name === "table") {
      tableAncestors += 1;
      tablePos = $position.before(depth);
    }
    if (node.type.name === "tableCell" || node.type.name === "tableHeader") {
      cellPos = $position.before(depth);
    }
  }
  return tableAncestors === 1 && tablePos !== null && cellPos !== null
    ? { tablePos, cellPos }
    : null;
}

export function captureDocumentTableDrawTarget(
  editor: Editor,
  cellElement: HTMLElement,
): DocumentTableDrawTarget | null {
  if (editor.isDestroyed || !editor.isEditable) return null;
  let rawPosition: number;
  try {
    rawPosition = editor.view.posAtDOM(cellElement, 0);
  } catch {
    return null;
  }
  const positions = ancestorPosition(editor, rawPosition);
  if (!positions) return null;
  const tableNode = editor.state.doc.nodeAt(positions.tablePos);
  const cellNode = editor.state.doc.nodeAt(positions.cellPos);
  if (!tableNode || tableNode.type.name !== "table" || !cellNode) return null;
  const rows = documentTableDrawCells(tableNode, positions.tablePos);
  const cell = rows
    ?.flat()
    .find((candidate) => candidate.pos === positions.cellPos);
  if (!cell) return null;
  return {
    doc: editor.state.doc,
    selection: editor.state.selection,
    tablePos: positions.tablePos,
    tableNode,
    cellPos: positions.cellPos,
    cellNode,
    sourceRow: cell.row,
    sourceCell: cell.col,
  };
}

function authenticate(
  editor: Editor,
  target: DocumentTableDrawTarget,
): DocumentTableDrawCell[][] | null {
  if (
    editor.isDestroyed ||
    !editor.isEditable ||
    editor.state.doc !== target.doc ||
    editor.state.selection !== target.selection ||
    editor.state.doc.nodeAt(target.tablePos) !== target.tableNode ||
    editor.state.doc.nodeAt(target.cellPos) !== target.cellNode
  ) {
    return null;
  }
  const rows = documentTableDrawCells(target.tableNode, target.tablePos);
  const live = rows?.[target.sourceRow]?.[target.sourceCell];
  return live?.pos === target.cellPos && live.node === target.cellNode
    ? (rows ?? null)
    : null;
}

function sameBorders(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function isSourceBoundDocumentTable(tableNode: ProseMirrorNode): boolean {
  const source = tableNode.attrs.source;
  return (
    typeof source === "object" &&
    source !== null &&
    !Array.isArray(source) &&
    (source as Record<string, unknown>).adapter === "docx" &&
    typeof (source as Record<string, unknown>).sourceAnchor === "string"
  );
}

export function documentTableNestedDrawDisabledReason(
  target: DocumentTableDrawTarget,
): "source_bound_nested_table_preserve_only" | null {
  return isSourceBoundDocumentTable(target.tableNode)
    ? "source_bound_nested_table_preserve_only"
    : null;
}

export function commitDocumentTableDrawEdge(
  editor: Editor,
  target: DocumentTableDrawTarget,
  edge: TableBorderEdgeRef,
  mode: DocumentTableDrawMode,
  pen: DocumentTableBorderPen = DEFAULT_DOCUMENT_TABLE_BORDER,
): DocumentTableDrawResult {
  const rows = authenticate(editor, target);
  if (!rows || !rows[edge.row]?.[edge.col]) return "stale";
  const refs = tableBorderEdgeSiblings(rows, edge);
  if (mode === "erase" && refs.length > 1) {
    const merges = resolveTableBorderEraseMerge(rows, [edge]);
    return merges.length === 1
      ? commitDocumentTableDrawMerge(editor, target, merges[0])
      : "invalid";
  }
  const line: DocumentTableBorderLine =
    mode === "erase" ? ERASE_LINE : drawLine(pen);
  let transaction = editor.state.tr;
  let changed = false;
  for (const ref of refs) {
    const cell = rows[ref.row]?.[ref.col];
    if (!cell) return "invalid";
    const current = normalizeDocumentTableBorders(cell.node.attrs.cellBorders);
    const next = normalizeDocumentTableBorders({
      ...(current ?? {}),
      [EDGE_TO_ATTRIBUTE[ref.side]]: line,
    });
    if (sameBorders(current, next)) continue;
    transaction = transaction.setNodeMarkup(
      cell.pos,
      undefined,
      { ...cell.node.attrs, cellBorders: next },
      cell.node.marks,
    );
    changed = true;
  }
  if (!changed || !transaction.docChanged) return "invalid";
  editor.view.dispatch(closeHistory(transaction).scrollIntoView());
  editor.view.focus();
  return "applied";
}

export function commitDocumentTableDrawDiagonal(
  editor: Editor,
  target: DocumentTableDrawTarget,
  direction: "diagonalDown" | "diagonalUp",
  pen: DocumentTableBorderPen = DEFAULT_DOCUMENT_TABLE_BORDER,
): DocumentTableDrawResult {
  if (!authenticate(editor, target)) return "stale";
  const current = normalizeDocumentTableBorders(
    target.cellNode.attrs.cellBorders,
  );
  const next = normalizeDocumentTableBorders({
    ...(current ?? {}),
    [direction]: drawLine(pen),
  });
  if (sameBorders(current, next)) return "invalid";
  const transaction = closeHistory(
    editor.state.tr.setNodeMarkup(
      target.cellPos,
      undefined,
      { ...target.cellNode.attrs, cellBorders: next },
      target.cellNode.marks,
    ),
  );
  editor.view.dispatch(transaction.scrollIntoView());
  editor.view.focus();
  return "applied";
}

function logicalRectForOffset(
  map: TableMap,
  offset: number,
): TableBorderEraseMerge | null {
  let row1 = Number.POSITIVE_INFINITY;
  let row2 = Number.NEGATIVE_INFINITY;
  let col1 = Number.POSITIVE_INFINITY;
  let col2 = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < map.map.length; index += 1) {
    if (map.map[index] !== offset) continue;
    const row = Math.floor(index / map.width);
    const col = index % map.width;
    row1 = Math.min(row1, row);
    row2 = Math.max(row2, row);
    col1 = Math.min(col1, col);
    col2 = Math.max(col2, col);
  }
  return Number.isFinite(row1) ? { row1, row2, col1, col2 } : null;
}

export function transformDocumentTableForMerge(
  tableNode: ProseMirrorNode,
  merge: TableBorderEraseMerge,
): ProseMirrorNode | null {
  let map: TableMap;
  try {
    map = TableMap.get(tableNode);
  } catch {
    return null;
  }
  if (
    map.problems !== null ||
    merge.row1 < 0 ||
    merge.col1 < 0 ||
    merge.row2 >= map.height ||
    merge.col2 >= map.width ||
    (merge.row1 === merge.row2 && merge.col1 === merge.col2)
  ) {
    return null;
  }
  const offsets = new Set<number>();
  for (let row = merge.row1; row <= merge.row2; row += 1) {
    for (let col = merge.col1; col <= merge.col2; col += 1) {
      const offset = map.map[row * map.width + col];
      const rect = logicalRectForOffset(map, offset);
      if (
        !rect ||
        rect.row1 < merge.row1 ||
        rect.row2 > merge.row2 ||
        rect.col1 < merge.col1 ||
        rect.col2 > merge.col2
      ) {
        return null;
      }
      offsets.add(offset);
    }
  }
  if (offsets.size < 2) return null;
  const anchorOffset = map.map[merge.row1 * map.width + merge.col1];
  const orderedOffsets = [...offsets].sort((left, right) => {
    const leftRect = logicalRectForOffset(map, left)!;
    const rightRect = logicalRectForOffset(map, right)!;
    return leftRect.row1 - rightRect.row1 || leftRect.col1 - rightRect.col1;
  });
  const nodes = new Map<number, ProseMirrorNode>();
  tableNode.descendants((node, pos) => {
    if (offsets.has(pos)) nodes.set(pos, node);
  });
  const anchor = nodes.get(anchorOffset);
  if (!anchor) return null;
  const boundaryLine = (
    side: "top" | "right" | "bottom" | "left",
  ): DocumentTableBorderLine | undefined | null => {
    const candidates: Array<DocumentTableBorderLine | undefined> = [];
    for (const offset of orderedOffsets) {
      const rect = logicalRectForOffset(map, offset);
      const node = nodes.get(offset);
      if (!rect || !node) return null;
      const onBoundary =
        side === "top"
          ? rect.row1 === merge.row1
          : side === "bottom"
            ? rect.row2 === merge.row2
            : side === "left"
              ? rect.col1 === merge.col1
              : rect.col2 === merge.col2;
      if (!onBoundary) continue;
      candidates.push(
        normalizeDocumentTableBorders(node.attrs.cellBorders)?.[side],
      );
    }
    if (candidates.length === 0) return undefined;
    const first = candidates[0];
    return candidates.every((candidate) => sameBorders(candidate, first))
      ? first
      : null;
  };
  const mergedBoundary = {
    top: boundaryLine("top"),
    right: boundaryLine("right"),
    bottom: boundaryLine("bottom"),
    left: boundaryLine("left"),
  };
  if (Object.values(mergedBoundary).some((line) => line === null)) return null;
  const mergedChildren: ProseMirrorNode[] = [];
  for (const offset of orderedOffsets) {
    const node = nodes.get(offset);
    if (!node) return null;
    node.forEach((child) => mergedChildren.push(child));
  }
  if (mergedChildren.length === 0) return null;
  const mergedContent = Fragment.fromArray(mergedChildren);
  const rows: ProseMirrorNode[] = [];
  tableNode.forEach((rowNode) => {
    const cells: ProseMirrorNode[] = [];
    rowNode.forEach((cellNode) => {
      let absoluteOffset: number | null = null;
      for (const [offset, node] of nodes) {
        if (node === cellNode && offsets.has(offset)) {
          absoluteOffset = offset;
          break;
        }
      }
      if (absoluteOffset !== null && absoluteOffset !== anchorOffset) return;
      if (absoluteOffset === anchorOffset) {
        const attrs: Record<string, unknown> = {
          ...cellNode.attrs,
          rowspan: merge.row2 - merge.row1 + 1,
          colspan: merge.col2 - merge.col1 + 1,
        };
        const anchorBorders = {
          ...(normalizeDocumentTableBorders(cellNode.attrs.cellBorders) ?? {}),
        } as Record<string, DocumentTableBorderLine | undefined>;
        for (const side of ["top", "right", "bottom", "left"] as const) {
          const line = mergedBoundary[side];
          if (line === null) return null;
          if (line === undefined) delete anchorBorders[side];
          else anchorBorders[side] = line;
        }
        delete anchorBorders.insideH;
        delete anchorBorders.insideV;
        attrs.cellBorders = normalizeDocumentTableBorders(anchorBorders);
        const columnWidths = orderedOffsets
          .filter(
            (offset) => logicalRectForOffset(map, offset)?.row1 === merge.row1,
          )
          .flatMap((offset) => {
            const value = nodes.get(offset)?.attrs.colwidth;
            return Array.isArray(value) ? value : [];
          });
        const nativeWidths = orderedOffsets
          .filter(
            (offset) => logicalRectForOffset(map, offset)?.row1 === merge.row1,
          )
          .flatMap((offset) => {
            const value = nodes.get(offset)?.attrs.colwidthTwips;
            return Array.isArray(value) ? value : [];
          });
        if (columnWidths.length === attrs.colspan)
          attrs.colwidth = columnWidths;
        if (nativeWidths.length === attrs.colspan)
          attrs.colwidthTwips = nativeWidths;
        cells.push(cellNode.type.create(attrs, mergedContent, cellNode.marks));
      } else {
        cells.push(cellNode);
      }
    });
    rows.push(rowNode.type.create(rowNode.attrs, cells, rowNode.marks));
  });
  try {
    const next = tableNode.type.create(tableNode.attrs, rows, tableNode.marks);
    next.check();
    const nextMap = TableMap.get(next);
    return nextMap.problems === null && nextMap.width === map.width
      ? next
      : null;
  } catch {
    return null;
  }
}

interface DrawCellPlacement {
  readonly offset: number;
  readonly node: ProseMirrorNode;
  readonly row: number;
  readonly col: number;
  readonly rowspan: number;
  readonly colspan: number;
  readonly generated: boolean;
}

interface CanonicalDrawColumnWidths {
  readonly pixels: readonly number[] | null;
  readonly twips: readonly number[] | null;
}

function splitNumber(total: number): readonly [number, number] | null {
  if (!Number.isFinite(total) || total <= 0) return null;
  const first = Math.ceil(total / 2);
  const second = total - first;
  return second > 0 ? [first, second] : null;
}

function canonicalDrawColumnWidths(
  placements: readonly DrawCellPlacement[],
  columnCount: number,
): CanonicalDrawColumnWidths | null {
  const pixels: Array<number | undefined> = new Array(columnCount);
  const twips: Array<number | undefined> = new Array(columnCount);
  let pixelPresence = false;
  let twipPresence = false;
  for (const placement of placements) {
    const rawPixels = placement.node.attrs.colwidth;
    const rawTwips = placement.node.attrs.colwidthTwips;
    if (rawPixels !== null && rawPixels !== undefined) pixelPresence = true;
    if (rawTwips !== null && rawTwips !== undefined) twipPresence = true;
    if (
      (rawPixels !== null &&
        rawPixels !== undefined &&
        (!Array.isArray(rawPixels) ||
          rawPixels.length !== placement.colspan)) ||
      (rawTwips !== null &&
        rawTwips !== undefined &&
        (!Array.isArray(rawTwips) || rawTwips.length !== placement.colspan))
    ) {
      return null;
    }
    for (let index = 0; index < placement.colspan; index += 1) {
      const column = placement.col + index;
      if (Array.isArray(rawPixels)) {
        const value = rawPixels[index];
        if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
          return null;
        if (pixels[column] !== undefined && pixels[column] !== value)
          return null;
        pixels[column] = value;
      }
      if (Array.isArray(rawTwips)) {
        const value = rawTwips[index];
        if (typeof value !== "number" || !Number.isInteger(value) || value <= 0)
          return null;
        if (twips[column] !== undefined && twips[column] !== value) return null;
        twips[column] = value;
      }
    }
  }
  if (pixelPresence && pixels.some((value) => value === undefined)) return null;
  if (twipPresence && twips.some((value) => value === undefined)) return null;
  if (
    twipPresence &&
    pixelPresence &&
    twips.some(
      (value, index) => Math.abs((pixels[index] ?? 0) * 15 - (value ?? 0)) > 2,
    )
  ) {
    return null;
  }
  return {
    pixels: pixelPresence ? (pixels as number[]) : null,
    twips: twipPresence ? (twips as number[]) : null,
  };
}

function emptyDrawCell(node: ProseMirrorNode): ProseMirrorNode | null {
  return node.type.createAndFill(node.attrs, undefined, node.marks);
}

export function transformDocumentTableForDrawSplit(
  tableNode: ProseMirrorNode,
  targetOffset: number,
  axis: "row" | "column",
  pen: DocumentTableBorderPen = DEFAULT_DOCUMENT_TABLE_BORDER,
): ProseMirrorNode | null {
  let map: TableMap;
  try {
    map = TableMap.get(tableNode);
  } catch {
    return null;
  }
  if (map.problems !== null) return null;
  const offsets = [...new Set(map.map)];
  const source: DrawCellPlacement[] = [];
  for (const offset of offsets) {
    const node = tableNode.nodeAt(offset);
    const rect = logicalRectForOffset(map, offset);
    if (!node || !rect) return null;
    source.push({
      offset,
      node,
      row: rect.row1,
      col: rect.col1,
      rowspan: rect.row2 - rect.row1 + 1,
      colspan: rect.col2 - rect.col1 + 1,
      generated: false,
    });
  }
  const target = source.find((placement) => placement.offset === targetOffset);
  if (!target) return null;
  const insertsBand =
    axis === "column" ? target.colspan === 1 : target.rowspan === 1;
  const nextRows = map.height + (axis === "row" && insertsBand ? 1 : 0);
  const nextCols = map.width + (axis === "column" && insertsBand ? 1 : 0);
  if (
    nextRows * nextCols > MAX_DRAW_TABLE_LOGICAL_CELLS ||
    nextRows <= 0 ||
    nextCols <= 0
  ) {
    return null;
  }

  const widths = canonicalDrawColumnWidths(source, map.width);
  if (!widths) return null;
  let nextPixels = widths.pixels ? [...widths.pixels] : null;
  const nextTwips = widths.twips ? [...widths.twips] : null;
  if (axis === "column" && insertsBand) {
    if (nextTwips) {
      const pieces = splitNumber(nextTwips[target.col]);
      if (!pieces || !pieces.every(Number.isInteger)) return null;
      nextTwips.splice(target.col, 1, ...pieces);
      nextPixels = nextTwips.map((value) => value / 15);
    } else if (nextPixels) {
      const pieces = splitNumber(nextPixels[target.col]);
      if (!pieces) return null;
      nextPixels.splice(target.col, 1, ...pieces);
    }
  }

  const placements: DrawCellPlacement[] = [];
  for (const item of source) {
    if (item.offset === targetOffset) {
      const empty = emptyDrawCell(item.node);
      if (!empty) return null;
      if (axis === "column") {
        const firstSpan = insertsBand ? 1 : Math.ceil(item.colspan / 2);
        const secondSpan = insertsBand ? 1 : item.colspan - firstSpan;
        if (secondSpan <= 0) return null;
        placements.push(
          { ...item, colspan: firstSpan },
          {
            ...item,
            node: empty,
            col: item.col + firstSpan,
            colspan: secondSpan,
            generated: true,
          },
        );
      } else {
        const firstSpan = insertsBand ? 1 : Math.ceil(item.rowspan / 2);
        const secondSpan = insertsBand ? 1 : item.rowspan - firstSpan;
        if (secondSpan <= 0) return null;
        placements.push(
          { ...item, rowspan: firstSpan },
          {
            ...item,
            node: empty,
            row: item.row + firstSpan,
            rowspan: secondSpan,
            generated: true,
          },
        );
      }
      continue;
    }
    if (axis === "column" && insertsBand) {
      placements.push({
        ...item,
        col: item.col > target.col ? item.col + 1 : item.col,
        colspan:
          item.col <= target.col && target.col < item.col + item.colspan
            ? item.colspan + 1
            : item.colspan,
      });
    } else if (axis === "row" && insertsBand) {
      placements.push({
        ...item,
        row: item.row > target.row ? item.row + 1 : item.row,
        rowspan:
          item.row <= target.row && target.row < item.row + item.rowspan
            ? item.rowspan + 1
            : item.rowspan,
      });
    } else {
      placements.push(item);
    }
  }

  const sourceRows: ProseMirrorNode[] = [];
  tableNode.forEach((row) => sourceRows.push(row));
  const insertedRow = axis === "row" && insertsBand ? target.row + 1 : -1;
  let splitRowAttrs:
    | readonly [Record<string, unknown>, Record<string, unknown>]
    | null = null;
  if (insertedRow >= 0) {
    const attrs = { ...sourceRows[target.row]?.attrs } as Record<
      string,
      unknown
    >;
    const rawHeight = attrs.rowHeight;
    const rawTwips = attrs.rowHeightTwips;
    if (rawTwips !== null && rawTwips !== undefined) {
      if (
        typeof rawTwips !== "number" ||
        !Number.isInteger(rawTwips) ||
        rawTwips < MIN_NATIVE_ROW_HEIGHT_TWIPS * 2 ||
        (rawHeight !== null &&
          rawHeight !== undefined &&
          (typeof rawHeight !== "number" ||
            !Number.isFinite(rawHeight) ||
            Math.abs(rawHeight * 15 - rawTwips) > 2))
      ) {
        return null;
      }
      const pieces = splitNumber(rawTwips);
      if (
        !pieces ||
        !pieces.every(
          (value) =>
            Number.isInteger(value) && value >= MIN_NATIVE_ROW_HEIGHT_TWIPS,
        )
      )
        return null;
      splitRowAttrs = [
        { ...attrs, rowHeightTwips: pieces[0], rowHeight: pieces[0] / 15 },
        {
          ...attrs,
          headerRow: false,
          rowHeightTwips: pieces[1],
          rowHeight: pieces[1] / 15,
        },
      ];
    } else if (rawHeight !== null && rawHeight !== undefined) {
      if (typeof rawHeight !== "number" || !Number.isFinite(rawHeight))
        return null;
      const pieces = splitNumber(rawHeight);
      if (!pieces) return null;
      splitRowAttrs = [
        { ...attrs, rowHeight: pieces[0] },
        { ...attrs, headerRow: false, rowHeight: pieces[1] },
      ];
    } else {
      splitRowAttrs = [attrs, { ...attrs, headerRow: false }];
    }
  }

  const nextRowsNodes: ProseMirrorNode[] = [];
  for (let row = 0; row < nextRows; row += 1) {
    const sourceRowIndex =
      insertedRow >= 0 && row > insertedRow ? row - 1 : row;
    const sourceRow =
      sourceRows[Math.min(sourceRowIndex, sourceRows.length - 1)];
    if (!sourceRow) return null;
    const rowAttrs =
      splitRowAttrs && row === target.row
        ? splitRowAttrs[0]
        : splitRowAttrs && row === insertedRow
          ? splitRowAttrs[1]
          : sourceRow.attrs;
    const cells = placements
      .filter((placement) => placement.row === row)
      .sort((left, right) => left.col - right.col)
      .map((placement) => {
        const attrs: Record<string, unknown> = {
          ...placement.node.attrs,
          rowspan: placement.rowspan,
          colspan: placement.colspan,
        };
        if (placement.offset === targetOffset) {
          const edge =
            axis === "column"
              ? placement.generated
                ? "left"
                : "right"
              : placement.generated
                ? "top"
                : "bottom";
          attrs.cellBorders = normalizeDocumentTableBorders({
            ...(normalizeDocumentTableBorders(
              placement.node.attrs.cellBorders,
            ) ?? {}),
            [edge]: drawLine(pen),
          });
        }
        if (nextPixels) {
          attrs.colwidth = nextPixels.slice(
            placement.col,
            placement.col + placement.colspan,
          );
        }
        if (nextTwips) {
          attrs.colwidthTwips = nextTwips.slice(
            placement.col,
            placement.col + placement.colspan,
          );
        }
        return placement.node.type.create(
          attrs,
          placement.node.content,
          placement.node.marks,
        );
      });
    if (cells.length === 0) return null;
    nextRowsNodes.push(sourceRow.type.create(rowAttrs, cells, sourceRow.marks));
  }
  try {
    const next = tableNode.type.create(
      tableNode.attrs,
      nextRowsNodes,
      tableNode.marks,
    );
    next.check();
    const nextMap = TableMap.get(next);
    return nextMap.problems === null &&
      nextMap.height === nextRows &&
      nextMap.width === nextCols
      ? next
      : null;
  } catch {
    return null;
  }
}

export function commitDocumentTableDrawMerge(
  editor: Editor,
  target: DocumentTableDrawTarget,
  merge: TableBorderEraseMerge,
): DocumentTableDrawResult {
  if (!authenticate(editor, target)) return "stale";
  const nextTable = transformDocumentTableForMerge(target.tableNode, merge);
  if (!nextTable) return "invalid";
  let transaction = closeHistory(editor.state.tr).replaceWith(
    target.tablePos,
    target.tablePos + target.tableNode.nodeSize,
    nextTable,
  );
  try {
    const live = transaction.doc.nodeAt(target.tablePos);
    if (!live) return "invalid";
    const map = TableMap.get(live);
    const offset = map.map[merge.row1 * map.width + merge.col1];
    transaction = transaction.setSelection(
      TextSelection.near(
        transaction.doc.resolve(target.tablePos + 1 + offset + 1),
        1,
      ),
    );
  } catch {
    return "invalid";
  }
  editor.view.dispatch(transaction.scrollIntoView());
  editor.view.focus();
  return "applied";
}

export function commitDocumentTableDrawSplit(
  editor: Editor,
  target: DocumentTableDrawTarget,
  axis: "row" | "column",
  pen: DocumentTableBorderPen = DEFAULT_DOCUMENT_TABLE_BORDER,
): DocumentTableDrawResult {
  if (!authenticate(editor, target)) return "stale";
  const offset = target.cellPos - target.tablePos - 1;
  const nextTable = transformDocumentTableForDrawSplit(
    target.tableNode,
    offset,
    axis,
    pen,
  );
  if (!nextTable) return "invalid";
  let transaction = closeHistory(editor.state.tr).replaceWith(
    target.tablePos,
    target.tablePos + target.tableNode.nodeSize,
    nextTable,
  );
  try {
    const live = transaction.doc.nodeAt(target.tablePos);
    if (!live) return "invalid";
    const map = TableMap.get(live);
    const sourceMap = TableMap.get(target.tableNode);
    const index = sourceMap.map.indexOf(offset);
    if (index < 0) return "invalid";
    const row = Math.floor(index / sourceMap.width);
    const col = index % sourceMap.width;
    const nextOffset = map.map[row * map.width + col];
    transaction = transaction.setSelection(
      TextSelection.near(
        transaction.doc.resolve(target.tablePos + 1 + nextOffset + 1),
        1,
      ),
    );
  } catch {
    return "invalid";
  }
  editor.view.dispatch(transaction.scrollIntoView());
  editor.view.focus();
  return "applied";
}

function oneByOneTable(
  schema: Schema,
  pen: DocumentTableBorderPen = DEFAULT_DOCUMENT_TABLE_BORDER,
): ProseMirrorNode | null {
  const paragraph = schema.nodes.paragraph?.createAndFill();
  const cellType = schema.nodes.tableCell;
  const rowType = schema.nodes.tableRow;
  const tableType = schema.nodes.table;
  if (!paragraph || !cellType || !rowType || !tableType) return null;
  const line = drawLine(pen);
  const cell = cellType.createAndFill(
    {
      cellBorders: normalizeDocumentTableBorders({
        top: line,
        right: line,
        bottom: line,
        left: line,
      }),
    },
    paragraph,
  );
  if (!cell) return null;
  return tableType.createAndFill(undefined, rowType.create(undefined, cell));
}

export function commitNestedDocumentTable(
  editor: Editor,
  target: DocumentTableDrawTarget,
  pen: DocumentTableBorderPen = DEFAULT_DOCUMENT_TABLE_BORDER,
): DocumentTableDrawResult {
  if (!authenticate(editor, target)) return "stale";
  if (documentTableNestedDrawDisabledReason(target)) return "invalid";
  let nested = false;
  target.cellNode.descendants((node) => {
    if (node.type.name === "table") nested = true;
  });
  if (nested) return "invalid";
  const table = oneByOneTable(target.tableNode.type.schema, pen);
  if (!table) return "invalid";
  const insertAt = target.cellPos + target.cellNode.nodeSize - 1;
  const transaction = closeHistory(editor.state.tr.insert(insertAt, table));
  if (!transaction.docChanged) return "invalid";
  editor.view.dispatch(transaction.scrollIntoView());
  editor.view.focus();
  return "applied";
}

export function commitOuterDocumentTable(
  editor: Editor,
  target: DocumentTableDrawInsertionTarget,
  pen: DocumentTableBorderPen = DEFAULT_DOCUMENT_TABLE_BORDER,
): DocumentTableDrawResult {
  if (
    editor.isDestroyed ||
    !editor.isEditable ||
    editor.state.doc !== target.doc ||
    editor.state.selection !== target.selection
  ) {
    return "stale";
  }
  const table = oneByOneTable(editor.state.schema, pen);
  if (!table) return "invalid";
  const bounded = Math.max(
    0,
    Math.min(target.position, editor.state.doc.content.size),
  );
  const $position = editor.state.doc.resolve(bounded);
  let insertAt: number | null = null;
  for (let depth = $position.depth; depth >= 0; depth -= 1) {
    const parent = $position.node(depth);
    const index = $position.index(depth);
    if (parent.canReplaceWith(index, index, table.type)) {
      insertAt =
        depth === $position.depth ? $position.pos : $position.before(depth + 1);
      break;
    }
  }
  if (insertAt === null) return "invalid";
  const transaction = closeHistory(editor.state.tr.insert(insertAt, table));
  if (!transaction.docChanged) return "invalid";
  editor.view.dispatch(transaction.scrollIntoView());
  editor.view.focus();
  return "applied";
}
