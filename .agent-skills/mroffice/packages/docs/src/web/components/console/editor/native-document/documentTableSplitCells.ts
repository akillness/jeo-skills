/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection, type Selection } from "@tiptap/pm/state";
import { CellSelection, TableMap } from "@tiptap/pm/tables";

import { readDocumentTableBorderTarget } from "@mrnote/core/web/components/console/editor/native-document/tableBorders.ts";
import { renderedColumnWidths } from "@mrnote/core/web/components/console/editor/native-document/tableStructureExtension.ts";
import { TRACK_CHANGES_SKIP_META } from "@mrnote/core/web/components/console/editor/native-document/trackChangesExtension.ts";
import {
  DOCUMENT_TABLE_MAX_COLUMNS,
  DOCUMENT_TABLE_MAX_ROWS,
  DOCUMENT_TABLE_MAX_SYNCHRONOUS_CELLS,
  DOCUMENT_TABLE_MAX_TOTAL_WIDTH_TWIPS,
} from "@mrnote/core/web/components/console/editor/native-document/tableLayoutPolicy.ts";
import {
  MAX_ROW_HEIGHT_PX,
  MAX_ROW_HEIGHT_TWIPS,
  MIN_ROW_HEIGHT_PX,
  normalizeTableRowHeight,
  normalizeTableRowHeightTwips,
} from "@mrnote/core/web/components/console/editor/native-document/tableRowStyle.ts";

export const MAX_DOCUMENT_TABLE_SPLIT_ROWS = 20;
export const MAX_DOCUMENT_TABLE_SPLIT_COLUMNS = 20;
export const MAX_DOCUMENT_TABLE_SPLIT_GENERATED_CELLS = 400;

export interface DocumentTableSplitCellsTarget {
  readonly doc: ProseMirrorNode;
  readonly selection: Selection;
  readonly tablePos: number;
  readonly tableNode: ProseMirrorNode;
  readonly cellPos: number;
  readonly cellNode: ProseMirrorNode;
}

export type DocumentTableSplitCellsResult = "applied" | "invalid" | "stale";

function boundedCount(value: unknown, maximum: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value >= 1 && value <= maximum ? value : null;
}

function positiveSpan(value: unknown): number | null {
  const normalized = value ?? 1;
  return typeof normalized === "number" &&
    Number.isInteger(normalized) &&
    normalized === 1
    ? 1
    : null;
}

function splitIntegerTotal(
  total: number,
  count: number,
  minimumPiece: number,
): number[] | null {
  if (!Number.isInteger(total) || total < minimumPiece * count) return null;
  const base = Math.floor(total / count);
  let remainder = total - base * count;
  return Array.from({ length: count }, () => {
    const piece = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    return piece;
  });
}

function splitOptionalOneColumnWidth(
  value: unknown,
  count: number,
  maximum: number,
): number[] | undefined | null {
  if (value === null || value === undefined) return undefined;
  if (!Array.isArray(value) || value.length !== 1) return null;
  const total = value[0];
  if (
    typeof total !== "number" ||
    !Number.isInteger(total) ||
    total < 1 ||
    total > maximum
  ) {
    return null;
  }
  return splitIntegerTotal(total, count, 1);
}

function splitOptionalRowMeasure(
  value: unknown,
  count: number,
  native: boolean,
): number[] | undefined | null {
  if (value === null || value === undefined) return undefined;
  const total = native
    ? normalizeTableRowHeightTwips(value)
    : normalizeTableRowHeight(value);
  if (total === null) return null;
  return splitIntegerTotal(
    total,
    count,
    native ? MIN_ROW_HEIGHT_PX * 15 : MIN_ROW_HEIGHT_PX,
  );
}

const NATIVE_COLUMN_WIDTH_TOLERANCE_TWIPS = 2;

function onePositiveFiniteWidth(value: unknown): number | null {
  if (!Array.isArray(value) || value.length !== 1) return null;
  const width = value[0];
  return typeof width === "number" && Number.isFinite(width) && width > 0
    ? width
    : null;
}

function oneNativeColumnWidth(value: unknown): number | null {
  const width = onePositiveFiniteWidth(value);
  return width !== null &&
    Number.isInteger(width) &&
    width <= DOCUMENT_TABLE_MAX_TOTAL_WIDTH_TWIPS
    ? width
    : null;
}

/**
 * Recover the complete imported DOCX grid only while every live px companion
 * still describes the same exact native twips. A partial/stale companion must
 * not silently undo a later browser resize when Split Cells runs.
 */
function canonicalNativeColumnGrid(
  rows: readonly ProseMirrorNode[],
  columnCount: number,
): number[] | undefined | null {
  const carriesAnyNativeWidth = rows.some((row) => {
    for (let column = 0; column < columnCount; column += 1) {
      const raw = row.child(column).attrs.colwidthTwips;
      if (raw !== null && raw !== undefined) return true;
    }
    return false;
  });
  if (!carriesAnyNativeWidth) return undefined;

  const grid: number[] = [];
  for (let column = 0; column < columnCount; column += 1) {
    let canonical: number | null = null;
    for (const row of rows) {
      const cell = row.child(column);
      const twips = oneNativeColumnWidth(cell.attrs.colwidthTwips);
      const pixels = onePositiveFiniteWidth(cell.attrs.colwidth);
      if (
        twips === null ||
        pixels === null ||
        Math.abs(pixels * 15 - twips) > NATIVE_COLUMN_WIDTH_TOLERANCE_TWIPS ||
        (canonical !== null && canonical !== twips)
      ) {
        return null;
      }
      canonical = twips;
    }
    if (canonical === null) return null;
    grid.push(canonical);
  }
  return grid;
}

function denseUnmergedTableMap(tableNode: ProseMirrorNode): TableMap | null {
  let map: TableMap;
  try {
    map = TableMap.get(tableNode);
  } catch {
    return null;
  }
  if (
    map.problems !== null ||
    map.width < 1 ||
    map.height < 1 ||
    tableNode.childCount !== map.height ||
    new Set(map.map).size !== map.width * map.height
  ) {
    return null;
  }
  let valid = true;
  tableNode.forEach((row) => {
    if (row.childCount !== map.width) valid = false;
    row.forEach((cell) => {
      if (
        (cell.type.name !== "tableCell" && cell.type.name !== "tableHeader") ||
        positiveSpan(cell.attrs.colspan) === null ||
        positiveSpan(cell.attrs.rowspan) === null
      ) {
        valid = false;
      }
    });
  });
  return valid ? map : null;
}

/**
 * The drawn grid of a table whose columns carry no width of their own: the
 * browser shares the table width between them, so a split that adds grid
 * columns would share it again and move every other column (Word keeps them
 * where they are and divides only the split cell). Whole pixels that keep the
 * drawn total; null when the table already carries a width on every cell or
 * the measurement does not fit the grid.
 */
function drawnPixelGrid(
  rows: readonly ProseMirrorNode[],
  columnCount: number,
  renderedWidths: readonly number[] | undefined,
): number[] | null {
  if (!renderedWidths || renderedWidths.length !== columnCount) return null;
  if (!renderedWidths.every((width) => Number.isFinite(width) && width > 0)) {
    return null;
  }
  const unsized = rows.some((row) => {
    for (let column = 0; column < columnCount; column += 1) {
      if (onePositiveFiniteWidth(row.child(column).attrs.colwidth) === null) {
        return true;
      }
    }
    return false;
  });
  if (!unsized) return null;
  // Largest remainder: each column rounds to whole pixels, the total stays.
  const total = Math.round(renderedWidths.reduce((sum, width) => sum + width, 0));
  const grid = renderedWidths.map((width) => Math.floor(width));
  let remainder = total - grid.reduce((sum, width) => sum + width, 0);
  const order = renderedWidths
    .map((width, column) => ({ column, fraction: width - Math.floor(width) }))
    .sort((a, b) => b.fraction - a.fraction);
  for (const { column } of order) {
    if (remainder <= 0) break;
    grid[column] += 1;
    remainder -= 1;
  }
  return grid.every((width) => width >= 1) ? grid : null;
}

/**
 * Refine one logical row and column of a dense unmerged native table. The
 * target becomes an independently editable R×C block; neighbours on the same
 * source row/column span the inserted grid lines so no content is copied or
 * dropped. Returns null for any malformed/merged/out-of-budget geometry.
 *
 * `renderedWidths` is the drawn width of each grid column. A table without
 * widths of its own is pinned to it first, so the columns the split does not
 * touch keep their edges and the split cell's pieces add up to its width.
 */
export function transformDenseDocumentTableForSplit(
  tableNode: ProseMirrorNode,
  targetCellOffset: number,
  columnsValue: unknown,
  rowsValue: unknown,
  renderedWidths?: readonly number[],
): ProseMirrorNode | null {
  const columns = boundedCount(columnsValue, MAX_DOCUMENT_TABLE_SPLIT_COLUMNS);
  const rows = boundedCount(rowsValue, MAX_DOCUMENT_TABLE_SPLIT_ROWS);
  if (
    !columns ||
    !rows ||
    (columns === 1 && rows === 1) ||
    columns * rows > MAX_DOCUMENT_TABLE_SPLIT_GENERATED_CELLS
  ) {
    return null;
  }
  const map = denseUnmergedTableMap(tableNode);
  if (!map) return null;
  if (
    tableNode.attrs.tableLayoutPolicy === "initial_fixed" ||
    (tableNode.attrs.tableFixedWidthTwips !== null &&
      tableNode.attrs.tableFixedWidthTwips !== undefined)
  ) {
    return null;
  }
  const targetIndex = map.map.indexOf(targetCellOffset);
  if (targetIndex < 0) return null;
  const targetRow = Math.floor(targetIndex / map.width);
  const targetColumn = targetIndex % map.width;
  const nextHeight = map.height + rows - 1;
  const nextWidth = map.width + columns - 1;
  if (
    nextHeight > DOCUMENT_TABLE_MAX_ROWS ||
    nextWidth > DOCUMENT_TABLE_MAX_COLUMNS ||
    nextHeight * nextWidth > DOCUMENT_TABLE_MAX_SYNCHRONOUS_CELLS
  ) {
    return null;
  }

  const sourceRows: ProseMirrorNode[] = [];
  tableNode.forEach((row) => sourceRows.push(row));
  const targetRowNode = sourceRows[targetRow];
  const targetCell = targetRowNode?.child(targetColumn);
  if (
    !targetCell ||
    targetCell.type.name !== "tableCell" ||
    targetRowNode.attrs.headerRow === true
  ) {
    return null;
  }
  const nativeColumnGrid = canonicalNativeColumnGrid(sourceRows, map.width);
  if (nativeColumnGrid === null) return null;
  const drawnGrid =
    nativeColumnGrid === undefined
      ? drawnPixelGrid(sourceRows, map.width, renderedWidths)
      : null;
  const canonicalColumnCells = sourceRows.map((row) => row.child(targetColumn));
  const canonicalPixels = drawnGrid
    ? [drawnGrid[targetColumn]]
    : canonicalColumnCells[0]?.attrs.colwidth;
  const canonicalTwips = canonicalColumnCells[0]?.attrs.colwidthTwips;
  const sameOptionalWidth = (left: unknown, right: unknown): boolean => {
    if (left === null || left === undefined) {
      return right === null || right === undefined;
    }
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === 1 &&
      right.length === 1 &&
      left[0] === right[0]
    );
  };
  if (
    nativeColumnGrid === undefined &&
    !drawnGrid &&
    canonicalColumnCells.some(
      (cell) =>
        !sameOptionalWidth(canonicalPixels, cell.attrs.colwidth) ||
        !sameOptionalWidth(canonicalTwips, cell.attrs.colwidthTwips),
    )
  ) {
    return null;
  }
  const twipPieces = nativeColumnGrid
    ? splitIntegerTotal(nativeColumnGrid[targetColumn], columns, 1)
    : undefined;
  // Imported native twips are the exact custody surface. Their integer split
  // determines the browser px projection; independently splitting a rounded
  // px total can create a command that cannot survive DOCX save/reopen.
  const pixelPieces = twipPieces
    ? twipPieces.map((piece) => piece / 15)
    : splitOptionalOneColumnWidth(
        canonicalPixels,
        columns,
        Math.floor(DOCUMENT_TABLE_MAX_TOTAL_WIDTH_TWIPS / 15),
      );
  const sourceRowHeight = normalizeTableRowHeight(
    targetRowNode.attrs.rowHeight,
  );
  const sourceRowHeightTwips = normalizeTableRowHeightTwips(
    targetRowNode.attrs.rowHeightTwips,
  );
  if (
    sourceRowHeightTwips !== null &&
    (sourceRowHeight === null ||
      normalizeTableRowHeight(sourceRowHeightTwips / 15) !== sourceRowHeight)
  ) {
    return null;
  }
  const rowTwipPieces = splitOptionalRowMeasure(
    targetRowNode.attrs.rowHeightTwips,
    rows,
    true,
  );
  const rowHeightPieces = rowTwipPieces
    ? rowTwipPieces.map((piece) => Math.round(piece / 15))
    : rowTwipPieces === null
      ? null
      : splitOptionalRowMeasure(targetRowNode.attrs.rowHeight, rows, false);
  if (
    pixelPieces === null ||
    twipPieces === null ||
    rowHeightPieces === null ||
    (pixelPieces?.some((piece) => piece < 1) ?? false) ||
    (rowHeightPieces?.some((piece) => piece < MIN_ROW_HEIGHT_PX) ?? false) ||
    (rowHeightPieces?.some((piece) => piece > MAX_ROW_HEIGHT_PX) ?? false) ||
    (rowTwipPieces?.some((piece) => piece > MAX_ROW_HEIGHT_TWIPS) ?? false)
  ) {
    return null;
  }
  const paragraph = targetCell.type.schema.nodes.paragraph?.createAndFill();
  if (!paragraph) return null;

  type Placement = {
    readonly row: number;
    readonly column: number;
    readonly node: ProseMirrorNode;
  };
  const placements: Placement[] = [];
  sourceRows.forEach((rowNode, oldRow) => {
    rowNode.forEach((cellNode, _offset, oldColumn) => {
      if (oldRow === targetRow && oldColumn === targetColumn) return;
      const attrs = { ...cellNode.attrs };
      const nextRow = oldRow > targetRow ? oldRow + rows - 1 : oldRow;
      const nextColumn =
        oldColumn > targetColumn ? oldColumn + columns - 1 : oldColumn;
      attrs.rowspan = oldRow === targetRow ? rows : 1;
      attrs.colspan = oldColumn === targetColumn ? columns : 1;
      if (oldColumn === targetColumn) {
        if (pixelPieces) attrs.colwidth = [...pixelPieces];
        else delete attrs.colwidth;
        if (twipPieces) attrs.colwidthTwips = [...twipPieces];
        else delete attrs.colwidthTwips;
      } else if (nativeColumnGrid) {
        attrs.colwidth = [nativeColumnGrid[oldColumn] / 15];
      } else if (drawnGrid) {
        attrs.colwidth = [drawnGrid[oldColumn]];
      }
      placements.push({
        row: nextRow,
        column: nextColumn,
        node: cellNode.type.create(attrs, cellNode.content, cellNode.marks),
      });
    });
  });

  const targetAttrs: Record<string, unknown> = {
    ...targetCell.attrs,
    colspan: 1,
    rowspan: 1,
  };
  for (let rowOffset = 0; rowOffset < rows; rowOffset += 1) {
    for (let columnOffset = 0; columnOffset < columns; columnOffset += 1) {
      const keepContent = rowOffset === 0 && columnOffset === 0;
      const attrs = { ...targetAttrs };
      if (pixelPieces) attrs.colwidth = [pixelPieces[columnOffset]];
      else delete attrs.colwidth;
      if (twipPieces) attrs.colwidthTwips = [twipPieces[columnOffset]];
      else delete attrs.colwidthTwips;
      if (!keepContent) {
        delete attrs.formula;
        delete attrs.formulaNumberFormat;
      }
      placements.push({
        row: targetRow + rowOffset,
        column: targetColumn + columnOffset,
        node: targetCell.type.create(
          attrs,
          keepContent ? targetCell.content : paragraph,
          targetCell.marks,
        ),
      });
    }
  }

  const nextRows: ProseMirrorNode[] = [];
  for (let newRow = 0; newRow < nextHeight; newRow += 1) {
    const sourceRowIndex =
      newRow <= targetRow
        ? newRow
        : newRow < targetRow + rows
          ? targetRow
          : newRow - rows + 1;
    const sourceRow = sourceRows[sourceRowIndex];
    const attrs = { ...sourceRow.attrs };
    if (sourceRowIndex === targetRow) {
      const pieceIndex = newRow - targetRow;
      if (rowHeightPieces) attrs.rowHeight = rowHeightPieces[pieceIndex];
      else delete attrs.rowHeight;
      if (rowTwipPieces) attrs.rowHeightTwips = rowTwipPieces[pieceIndex];
      else delete attrs.rowHeightTwips;
      if (pieceIndex > 0) attrs.headerRow = false;
    }
    const cells = placements
      .filter((placement) => placement.row === newRow)
      .sort((a, b) => a.column - b.column)
      .map((placement) => placement.node);
    if (cells.length === 0) return null;
    nextRows.push(sourceRow.type.create(attrs, cells, sourceRow.marks));
  }

  try {
    const nextTable = tableNode.type.create(
      tableNode.attrs,
      nextRows,
      tableNode.marks,
    );
    nextTable.check();
    const nextMap = TableMap.get(nextTable);
    if (
      nextMap.problems !== null ||
      nextMap.width !== nextWidth ||
      nextMap.height !== nextHeight ||
      new Set(nextMap.map).size !== placements.length
    ) {
      return null;
    }
    return nextTable;
  } catch {
    return null;
  }
}

export function readDocumentTableSplitCellsTarget(
  editor: Editor,
): DocumentTableSplitCellsTarget | null {
  if (editor.isDestroyed || !editor.isEditable) return null;
  const { selection } = editor.state;
  // One whole selected cell (Select > Select Cell) splits like the cell the
  
  if (selection instanceof CellSelection && selection.ranges.length !== 1) {
    return null;
  }
  let tableAncestorCount = 0;
  for (let depth = 0; depth <= selection.$from.depth; depth += 1) {
    if (selection.$from.node(depth).type.name === "table") {
      tableAncestorCount += 1;
    }
  }
  if (tableAncestorCount !== 1) return null;
  const borderTarget = readDocumentTableBorderTarget(editor);
  if (
    !borderTarget ||
    borderTarget.scope !== "cells" ||
    borderTarget.selected.length !== 1
  ) {
    return null;
  }
  const cell = borderTarget.selected[0];
  if (!cell || cell.row1 !== cell.row2 || cell.col1 !== cell.col2) return null;
  const cellRow = borderTarget.tableNode.child(cell.row1);
  if (cell.node.type.name !== "tableCell" || cellRow.attrs.headerRow === true) {
    return null;
  }
  if (
    borderTarget.tableNode.attrs.tableLayoutPolicy === "initial_fixed" ||
    (borderTarget.tableNode.attrs.tableFixedWidthTwips !== null &&
      borderTarget.tableNode.attrs.tableFixedWidthTwips !== undefined)
  ) {
    return null;
  }
  if (!denseUnmergedTableMap(borderTarget.tableNode)) return null;
  return {
    doc: editor.state.doc,
    selection,
    tablePos: borderTarget.tablePos,
    tableNode: borderTarget.tableNode,
    cellPos: cell.pos,
    cellNode: cell.node,
  };
}

export function splitDocumentTableCell(
  editor: Editor,
  target: DocumentTableSplitCellsTarget,
  columnsValue: unknown,
  rowsValue: unknown,
): DocumentTableSplitCellsResult {
  const columns = boundedCount(columnsValue, MAX_DOCUMENT_TABLE_SPLIT_COLUMNS);
  const rows = boundedCount(rowsValue, MAX_DOCUMENT_TABLE_SPLIT_ROWS);
  if (
    !columns ||
    !rows ||
    (columns === 1 && rows === 1) ||
    columns * rows > MAX_DOCUMENT_TABLE_SPLIT_GENERATED_CELLS
  ) {
    return "invalid";
  }
  if (
    editor.isDestroyed ||
    !editor.isEditable ||
    editor.state.doc !== target.doc ||
    editor.state.doc.nodeAt(target.tablePos) !== target.tableNode ||
    editor.state.doc.nodeAt(target.cellPos) !== target.cellNode ||
    !editor.state.selection.eq(target.selection)
  ) {
    return "stale";
  }

  const current = readDocumentTableSplitCellsTarget(editor);
  if (
    !current ||
    current.tablePos !== target.tablePos ||
    current.tableNode !== target.tableNode ||
    current.cellPos !== target.cellPos ||
    current.cellNode !== target.cellNode
  ) {
    return "stale";
  }

  const cellOffset = target.cellPos - target.tablePos - 1;
  const sourceMap = denseUnmergedTableMap(target.tableNode);
  if (!sourceMap) return "stale";
  const sourceTargetIndex = sourceMap.map.indexOf(cellOffset);
  if (sourceTargetIndex < 0) return "stale";
  const sourceTargetRow = Math.floor(sourceTargetIndex / sourceMap.width);
  const sourceTargetColumn = sourceTargetIndex % sourceMap.width;
  const nextTable = transformDenseDocumentTableForSplit(
    target.tableNode,
    cellOffset,
    columns,
    rows,
    renderedColumnWidths(editor, {
      node: target.tableNode,
      pos: target.tablePos,
    }) ?? undefined,
  );
  if (!nextTable) return "invalid";
  let transaction = closeHistory(editor.state.tr).replaceWith(
    target.tablePos,
    target.tablePos + target.tableNode.nodeSize,
    nextTable,
  );
  try {
    const liveTable = transaction.doc.nodeAt(target.tablePos);
    if (!liveTable || liveTable.type.name !== "table") return "stale";
    const nextMap = TableMap.get(liveTable);
    if (nextMap.problems !== null) return "invalid";
    const targetOffset =
      nextMap.map[sourceTargetRow * nextMap.width + sourceTargetColumn];
    const targetCell = liveTable.nodeAt(targetOffset);
    if (!targetCell) return "stale";
    const textPosition = target.tablePos + 1 + targetOffset + 1;
    transaction = transaction.setSelection(
      TextSelection.near(transaction.doc.resolve(textPosition), 1),
    );
  } catch {
    return "stale";
  }
  // Word applies Split Cells untracked ("This action will not be marked as a
  // change"); tracked, the whole table read as deleted and inserted again.
  transaction.setMeta(TRACK_CHANGES_SKIP_META, true);
  editor.view.dispatch(transaction.scrollIntoView());
  editor.view.focus();
  return "applied";
}
