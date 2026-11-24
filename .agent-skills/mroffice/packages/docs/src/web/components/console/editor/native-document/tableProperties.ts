/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { Transaction } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Selection } from "@tiptap/pm/state";
import { TableMap } from "@tiptap/pm/tables";

import {
  normalizeTableAlign,
  normalizeTableIndentPx,
  normalizeTableIndentTwips,
  type TableAlign,
} from "@mrnote/core/web/components/console/editor/native-document/tableAlignment.ts";
import {
  normalizeCellVerticalAlign,
  type CellVerticalAlign,
} from "@mrnote/core/web/components/console/editor/native-document/tableCellStyle.ts";
import { readDocumentTableBorderTarget } from "@mrnote/core/web/components/console/editor/native-document/tableBorders.ts";
import {
  MAX_TABLE_COLUMN_WIDTH,
  MIN_TABLE_COLUMN_WIDTH,
  setTableColumnWidth,
  tableColumnWidth,
} from "@mrnote/core/web/components/console/editor/native-document/tableStructure.ts";
import {
  normalizeTableRowHeight,
  normalizeTableRowHeightRule,
  normalizeTableRowHeightTwips,
  type TableRowHeightRule,
} from "@mrnote/core/web/components/console/editor/native-document/tableRowStyle.ts";
import {
  normalizeTablePositioning,
  type TablePositioning,
} from "@mrnote/core/web/components/console/editor/native-document/tablePositioning.ts";
import {
  logicalTableFragmentsAt,
  logicalTableRowIndexes,
  withLogicalTableAttrs,
} from "@mrnote/core/web/components/console/editor/native-document/paged/tableFragmentGroups.ts";

export interface DocumentTablePropertiesRow {
  readonly index: number;
  readonly pos: number;
  /** The other pieces of a row the page cut (its tail on the next page). */
  readonly piecePositions?: readonly number[];
  readonly repeatHeader: boolean;
  readonly allowBreakAcrossPages: boolean;
  readonly rowHeight: number | null;
  readonly rowHeightRule: TableRowHeightRule;
}

export interface DocumentTablePropertiesCell {
  readonly index: number;
  readonly pos: number;
  readonly row: number;
  readonly column: number;
  readonly verticalAlign: CellVerticalAlign;
}

export interface DocumentTablePropertiesColumn {
  readonly index: number;
  readonly widthPx: number | null;
}

/**
 * Frozen Table Properties authority. The dialog may move DOM focus, but it may
 * never retarget a different table after a collaborative/editor transaction.
 */
export interface DocumentTablePropertiesTarget {
  readonly doc: ProseMirrorNode;
  readonly selection: Selection;
  readonly tablePos: number;
  readonly tableNode: ProseMirrorNode;
  readonly tableAlign: TableAlign;
  readonly tableIndentPx: number;
  readonly tablePositioning: TablePositioning | null;
  readonly tableCaption: string;
  readonly tableDescription: string;
  readonly rows: readonly DocumentTablePropertiesRow[];
  readonly columns: readonly DocumentTablePropertiesColumn[];
  readonly cells: readonly DocumentTablePropertiesCell[];
  readonly columnCount: number;
  readonly initialRowIndex: number;
  readonly initialColumnIndex: number;
  readonly initialCellIndex: number;
  /**
   * The cells (indexes into `cells`) the selection covers: several for a
   * cell range, a row or a column, one for a caret. Word's Cell tab formats
   * all of them. Absent: the initial cell alone.
   */
  readonly selectedCellIndexes?: readonly number[];
}

export interface DocumentTablePropertiesChanges {
  readonly tableAlign: TableAlign;
  readonly tableIndentPx?: number;
  readonly tablePositioning?: TablePositioning | null;
  readonly tableCaption: string;
  readonly tableDescription: string;
  readonly rows: readonly {
    readonly index: number;
    readonly allowBreakAcrossPages: boolean;
    readonly repeatHeader?: boolean;
    /** `undefined` leaves the authored height untouched; `null` restores Auto. */
    readonly rowHeight?: number | null;
    readonly rowHeightRule?: TableRowHeightRule;
  }[];
  readonly columns?: readonly {
    readonly index: number;
    readonly widthPx: number;
  }[];
  readonly cells: readonly {
    readonly index: number;
    readonly verticalAlign: CellVerticalAlign;
  }[];
}

export type DocumentTablePropertiesCommitResult =
  | "applied"
  | "unchanged"
  | "invalid"
  | "stale";

export const DOCUMENT_TABLE_ALT_TEXT_MAX_LENGTH = 4096;

export function normalizeDocumentTableAltText(value: unknown): string {
  if (typeof value !== "string") return "";
  const clamped = value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    // Half a character on its own is not text Word's w:tblCaption /
    // w:tblDescription can hold; the DOCX writer refuses it (OFL-063).
    // `u`: a pair is one code point, so only a lone half matches.
    .replace(/[\uD800-\uDFFF]/gu, "")
    .slice(0, DOCUMENT_TABLE_ALT_TEXT_MAX_LENGTH);
  // The bound counts UTF-16 units: one falling inside an emoji keeps the
  // whole character out rather than its first half.
  const last = clamped.charCodeAt(clamped.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? clamped.slice(0, -1) : clamped;
}

/**
 * The rows of the LOGICAL table `tablePos` is a page fragment of, in order:
 * Row tab's "Row 2 of 3" and its Previous / Next Row run over the whole
 * table, as Word's do, not over the rows one page holds (a table cut across
 * pages read "Row 1 of 1" on its second page, live audit WUA 019). A row the
 * page cut is one row with two pieces; a header the page repeats is a copy
 * and no row of its own. Also returns which logical row each row of the
 * fragment at `tablePos` is.
 */
function tableRows(
  doc: ProseMirrorNode,
  tableNode: ProseMirrorNode,
  tablePos: number,
): { rows: DocumentTablePropertiesRow[]; fragmentRows: Array<number | null> } {
  const fragments = logicalTableFragmentsAt(doc, tablePos);
  const own = fragments.findIndex((fragment) => fragment.pos === tablePos);
  const pieces = own >= 0 ? fragments : [{ node: tableNode, pos: tablePos }];
  const { rows: logicalByFragment } = logicalTableRowIndexes(pieces);
  const byLogical = new Map<number, { node: ProseMirrorNode; positions: number[] }>();
  pieces.forEach((fragment, fragmentIndex) => {
    fragment.node.forEach((rowNode, rowOffset, rowIndex) => {
      const logical = logicalByFragment[fragmentIndex]?.[rowIndex];
      if (logical === null || logical === undefined) return;
      const pos = fragment.pos + 1 + rowOffset;
      const entry = byLogical.get(logical);
      if (entry) entry.positions.push(pos);
      else byLogical.set(logical, { node: rowNode, positions: [pos] });
    });
  });
  const rows = [...byLogical.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, { node: rowNode, positions }], index) => ({
      index,
      pos: positions[0],
      ...(positions.length > 1 ? { piecePositions: positions.slice(1) } : {}),
      repeatHeader: rowNode.attrs.headerRow === true,
      allowBreakAcrossPages: rowNode.attrs.cantSplit !== true,
      rowHeight: normalizeTableRowHeight(rowNode.attrs.rowHeight),
      rowHeightRule:
        normalizeTableRowHeightRule(rowNode.attrs.rowHeightRule) ?? "atLeast",
    }));
  const logicalOrder = [...byLogical.keys()].sort((left, right) => left - right);
  const fragmentRows = (logicalByFragment[own >= 0 ? own : 0] ?? []).map((logical) =>
    logical === null ? null : logicalOrder.indexOf(logical),
  );
  return { rows, fragmentRows };
}

/** The Row tab's own attributes of a row, for the other piece of a cut row. */
function pickRowAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  // An attribute the row dropped (Auto height) is dropped from the piece too:
  // undefined takes the schema default.
  for (const key of ["cantSplit", "headerRow", "rowHeight", "rowHeightRule", "rowHeightTwips"]) {
    picked[key] = attrs[key];
  }
  return picked;
}

function tableCells(
  tableNode: ProseMirrorNode,
  tablePos: number,
  map: TableMap,
): DocumentTablePropertiesCell[] {
  const firstGridIndexByOffset = new Map<number, number>();
  map.map.forEach((offset, gridIndex) => {
    if (!firstGridIndexByOffset.has(offset)) {
      firstGridIndexByOffset.set(offset, gridIndex);
    }
  });
  return [...firstGridIndexByOffset.entries()]
    .sort((left, right) => left[1] - right[1])
    .flatMap(([offset, gridIndex], index) => {
      const node = tableNode.nodeAt(offset);
      if (
        !node ||
        (node.type.name !== "tableCell" && node.type.name !== "tableHeader")
      ) {
        return [];
      }
      return [
        {
          index,
          pos: tablePos + 1 + offset,
          row: Math.floor(gridIndex / map.width),
          column: gridIndex % map.width,
          verticalAlign:
            normalizeCellVerticalAlign(node.attrs.verticalAlign) ?? "top",
        },
      ];
    });
}

export function readDocumentTablePropertiesTarget(
  editor: Editor,
): DocumentTablePropertiesTarget | null {
  if (editor.isDestroyed) return null;
  const borderTarget = readDocumentTableBorderTarget(editor);
  if (!borderTarget) return null;
  let map: TableMap;
  try {
    map = TableMap.get(borderTarget.tableNode);
  } catch {
    return null;
  }
  const { rows, fragmentRows } = tableRows(
    editor.state.doc,
    borderTarget.tableNode,
    borderTarget.tablePos,
  );
  const tableJson = borderTarget.tableNode.toJSON() as Record<string, unknown>;
  const columns = Array.from({ length: map.width }, (_, index) => ({
    index,
    widthPx: tableColumnWidth(tableJson, index),
  }));
  const cells = tableCells(borderTarget.tableNode, borderTarget.tablePos, map);
  if (rows.length === 0 || cells.length === 0 || map.width < 1) return null;
  const initialCellIndex = cells.findIndex(
    (cell) =>
      map.map[borderTarget.row1 * map.width + borderTarget.col1] ===
      cell.pos - borderTarget.tablePos - 1,
  );
  return {
    doc: editor.state.doc,
    selection: editor.state.selection,
    tablePos: borderTarget.tablePos,
    tableNode: borderTarget.tableNode,
    tableAlign:
      normalizeTableAlign(borderTarget.tableNode.attrs.tableAlign) ?? "left",
    tableIndentPx:
      normalizeTableIndentPx(borderTarget.tableNode.attrs.tableIndentPx) ?? 0,
    tablePositioning: normalizeTablePositioning(
      borderTarget.tableNode.attrs.tablePositioning,
    ),
    tableCaption: normalizeDocumentTableAltText(
      borderTarget.tableNode.attrs.tableCaption,
    ),
    tableDescription: normalizeDocumentTableAltText(
      borderTarget.tableNode.attrs.tableDescription,
    ),
    rows,
    columns,
    cells,
    columnCount: map.width,
    // The caret's row of this page fragment, as a row of the whole table (a
    // repeated header copy stands for the table's first row).
    initialRowIndex: Math.min(fragmentRows[borderTarget.row1] ?? 0, rows.length - 1),
    initialColumnIndex: Math.min(borderTarget.col1, map.width - 1),
    initialCellIndex: initialCellIndex >= 0 ? initialCellIndex : 0,
    selectedCellIndexes: (() => {
      const covered = cells.flatMap((cell, index) =>
        cell.row >= borderTarget.row1 &&
        cell.row <= borderTarget.row2 &&
        cell.column >= borderTarget.col1 &&
        cell.column <= borderTarget.col2
          ? [index]
          : [],
      );
      return covered.length > 0
        ? covered
        : [initialCellIndex >= 0 ? initialCellIndex : 0];
    })(),
  };
}

export function commitDocumentTableProperties(
  editor: Editor,
  target: DocumentTablePropertiesTarget,
  changes: DocumentTablePropertiesChanges,
  /**
   * Steps the dialog's sub-settings (Options...) add to the same transaction,
   * given the table's position in the transaction's document, so the
   * dialog's OK is one history entry.
   */
  extend?: (transaction: Transaction, tablePos: number) => Transaction,
): DocumentTablePropertiesCommitResult {
  if (
    editor.isDestroyed ||
    !editor.isEditable ||
    editor.state.doc !== target.doc ||
    editor.state.doc.nodeAt(target.tablePos) !== target.tableNode ||
    !editor.state.selection.eq(target.selection)
  ) {
    return "stale";
  }

  let transaction = closeHistory(editor.state.tr);
  const nextTableAlign = normalizeTableAlign(changes.tableAlign);
  const nextTableIndentPx =
    nextTableAlign === null
      ? normalizeTableIndentPx(changes.tableIndentPx ?? target.tableIndentPx)
      : null;
  const nextTablePositioning =
    changes.tablePositioning === undefined
      ? target.tablePositioning
      : normalizeTablePositioning(changes.tablePositioning);
  const nextTableCaption = normalizeDocumentTableAltText(changes.tableCaption);
  const nextTableDescription = normalizeDocumentTableAltText(
    changes.tableDescription,
  );
  if (
    normalizeTableAlign(target.tableNode.attrs.tableAlign) !== nextTableAlign ||
    (normalizeTableIndentPx(target.tableNode.attrs.tableIndentPx) ?? null) !==
      nextTableIndentPx ||
    JSON.stringify(target.tablePositioning) !==
      JSON.stringify(nextTablePositioning) ||
    target.tableCaption !== nextTableCaption ||
    target.tableDescription !== nextTableDescription
  ) {
    // The imported twips value stays authoritative only while the px indent
    // is unchanged; a new px indent drops it so export converts from px.
    const nextTableIndentTwips =
      nextTableIndentPx !==
      (normalizeTableIndentPx(target.tableNode.attrs.tableIndentPx) ?? null)
        ? null
        : normalizeTableIndentTwips(target.tableNode.attrs.tableIndentTwips);
    const nextTableAttrs = {
      ...target.tableNode.attrs,
      tableAlign: nextTableAlign,
      tableIndentPx: nextTableIndentPx,
      tableIndentTwips: nextTableIndentTwips,
      tablePositioning: nextTablePositioning,
      tableCaption: nextTableCaption || null,
      tableDescription: nextTableDescription || null,
    };
    // Alignment, indent, wrapping, title and description belong to the
    // logical table: set them on every page fragment, whichever page the
    // dialog was opened from, so the storage merge keeps them.
    for (const fragment of logicalTableFragmentsAt(
      transaction.doc,
      target.tablePos,
    )) {
      transaction = transaction.setNodeMarkup(
        fragment.pos,
        undefined,
        fragment.pos === target.tablePos
          ? nextTableAttrs
          : withLogicalTableAttrs(fragment.node, nextTableAttrs),
        fragment.node.marks,
      );
    }
  }

  const rowChanges = new Map(
    changes.rows.map((change) => [change.index, change]),
  );
  const headerRowsChanged = target.rows.some((row) => {
    const requested = rowChanges.get(row.index)?.repeatHeader;
    return requested !== undefined && requested !== row.repeatHeader;
  });
  let headerBandOpen = true;
  for (const row of target.rows) {
    const change = rowChanges.get(row.index);
    const rowNode = transaction.doc.nodeAt(row.pos);
    if (!rowNode || rowNode.type.name !== "tableRow") return "stale";
    const nextCantSplit = change
      ? !change.allowBreakAcrossPages
      : rowNode.attrs.cantSplit === true;
    const requestedHeaderRow =
      change?.repeatHeader ?? rowNode.attrs.headerRow === true;
    const nextHeaderRow = headerRowsChanged
      ? headerBandOpen && requestedHeaderRow
      : rowNode.attrs.headerRow === true;
    if (!requestedHeaderRow) headerBandOpen = false;

    const currentRowHeight = normalizeTableRowHeight(rowNode.attrs.rowHeight);
    const currentRowHeightRule =
      normalizeTableRowHeightRule(rowNode.attrs.rowHeightRule) ?? "atLeast";
    const requestedRowHeight = change?.rowHeight;
    const nextRowHeight =
      requestedRowHeight === undefined
        ? currentRowHeight
        : requestedRowHeight === null
          ? null
          : normalizeTableRowHeight(requestedRowHeight);
    const nextRowHeightRule =
      requestedRowHeight === undefined || requestedRowHeight === null
        ? currentRowHeightRule
        : change?.rowHeightRule === undefined
          ? currentRowHeightRule
          : normalizeTableRowHeightRule(change.rowHeightRule);
    if (
      (requestedRowHeight !== undefined &&
        requestedRowHeight !== null &&
        nextRowHeight === null) ||
      (requestedRowHeight !== undefined &&
        requestedRowHeight !== null &&
        nextRowHeightRule === null)
    ) {
      return "stale";
    }
    const rowHeightChanged =
      requestedRowHeight !== undefined &&
      (currentRowHeight !== nextRowHeight ||
        (nextRowHeight !== null && currentRowHeightRule !== nextRowHeightRule));
    const rowHeightValueChanged =
      requestedRowHeight !== undefined && currentRowHeight !== nextRowHeight;
    if (
      (rowNode.attrs.cantSplit === true) === nextCantSplit &&
      (rowNode.attrs.headerRow === true) === nextHeaderRow &&
      !rowHeightChanged
    ) {
      continue;
    }
    const nextAttrs: Record<string, unknown> = {
      ...rowNode.attrs,
      cantSplit: nextCantSplit,
      headerRow: nextHeaderRow,
    };
    if (rowHeightChanged) {
      if (nextRowHeight === null) {
        delete nextAttrs.rowHeight;
        delete nextAttrs.rowHeightTwips;
        delete nextAttrs.rowHeightRule;
      } else {
        nextAttrs.rowHeight = nextRowHeight;
        nextAttrs.rowHeightRule = nextRowHeightRule;
        // A user-authored measurement supersedes the imported exact-twip
        // companion. Export derives a fresh w:val from this new value.
        if (
          rowHeightValueChanged &&
          normalizeTableRowHeightTwips(rowNode.attrs.rowHeightTwips) !== null
        ) {
          delete nextAttrs.rowHeightTwips;
        }
      }
    }
    // A row the page cut is changed in both its pieces.
    for (const piecePos of [row.pos, ...(row.piecePositions ?? [])]) {
      const piece = transaction.doc.nodeAt(piecePos);
      if (!piece || piece.type.name !== "tableRow") return "stale";
      transaction = transaction.setNodeMarkup(
        piecePos,
        undefined,
        piecePos === row.pos ? nextAttrs : { ...piece.attrs, ...pickRowAttrs(nextAttrs) },
        piece.marks,
      );
    }
  }

  const cellChanges = new Map(
    changes.cells.map((change) => [change.index, change]),
  );
  for (const cell of target.cells) {
    const change = cellChanges.get(cell.index);
    if (!change) continue;
    const cellNode = transaction.doc.nodeAt(cell.pos);
    if (
      !cellNode ||
      (cellNode.type.name !== "tableCell" &&
        cellNode.type.name !== "tableHeader")
    ) {
      return "stale";
    }
    const nextVerticalAlign = normalizeCellVerticalAlign(change.verticalAlign);
    if (!nextVerticalAlign) return "stale";
    if (
      (normalizeCellVerticalAlign(cellNode.attrs.verticalAlign) ?? "top") ===
      nextVerticalAlign
    ) {
      continue;
    }
    transaction = transaction.setNodeMarkup(
      cell.pos,
      undefined,
      { ...cellNode.attrs, verticalAlign: nextVerticalAlign },
      cellNode.marks,
    );
  }

  const columnChanges = new Map(
    (changes.columns ?? []).map((change) => [change.index, change]),
  );
  // A width is written by replacing the table with the same table at its new
  // widths. A selection inside it mapped through that replacement lands
  // after the table: the caret left its cell, and the next keys went into
  // the paragraph after the table (WUA 095). The same table, the same size:
  // every position in it is where it was.
  let replacedSameSize = true;
  if (columnChanges.size > 0) {
    if (
      target.columns.length !== target.columnCount ||
      target.columns.some((column) => column.widthPx === null)
    ) {
      return "invalid";
    }
    const requestedColumns: Array<{
      index: number;
      widthPx: number;
      currentWidthPx: number;
    }> = [];
    const projectedWidths = target.columns.map(
      (column) => column.widthPx as number,
    );
    for (const [index, change] of columnChanges) {
      const widthPx = Math.round(change.widthPx);
      const currentWidthPx = target.columns[index]?.widthPx;
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= target.columnCount ||
        !Number.isFinite(change.widthPx) ||
        widthPx < MIN_TABLE_COLUMN_WIDTH ||
        widthPx > MAX_TABLE_COLUMN_WIDTH ||
        currentWidthPx === null ||
        currentWidthPx === undefined
      ) {
        return "invalid";
      }
      projectedWidths[index] = widthPx;
      requestedColumns.push({ index, widthPx, currentWidthPx });
    }
    if (
      projectedWidths.reduce((sum, width) => sum + width, 0) >
      MAX_TABLE_COLUMN_WIDTH
    ) {
      return "invalid";
    }
    const currentTableNode = transaction.doc.nodeAt(target.tablePos);
    if (!currentTableNode || currentTableNode.type.name !== "table") {
      return "stale";
    }
    // A multi-column edit may keep the final total unchanged while temporarily
    // exceeding Word's table-width bound. Apply contractions before expansions
    // so the atomic final plan is admitted without publishing an intermediate
    // document state.
    requestedColumns.sort(
      (left, right) =>
        left.widthPx -
        left.currentWidthPx -
        (right.widthPx - right.currentWidthPx),
    );
    // A column is a column of the logical table: its rows on other pages get
    // the same width, or the saved table would mix two widths in one column.
    const fragmentPositions = logicalTableFragmentsAt(
      transaction.doc,
      target.tablePos,
    ).map((fragment) => fragment.pos);
    const widthMapping = transaction.mapping.slice(transaction.mapping.maps.length);
    for (const originalPos of fragmentPositions) {
      const isTarget = originalPos === target.tablePos;
      const fragmentPos = widthMapping.map(originalPos);
      const fragmentNode = transaction.doc.nodeAt(fragmentPos);
      if (!fragmentNode || fragmentNode.type.name !== "table") {
        if (isTarget) return "stale";
        continue;
      }
      let nextTableJson = fragmentNode.toJSON() as Record<string, unknown>;
      let widthChanged = false;
      let expressible = true;
      for (const { index, widthPx } of requestedColumns) {
        const currentWidth = tableColumnWidth(nextTableJson, index);
        if (currentWidth === null) {
          expressible = false;
          break;
        }
        if (currentWidth === widthPx) continue;
        const resized = setTableColumnWidth(nextTableJson, index, widthPx);
        if (resized === nextTableJson) {
          expressible = false;
          break;
        }
        nextTableJson = resized as Record<string, unknown>;
        widthChanged = true;
      }
      if (!expressible) {
        if (isTarget) return "invalid";
        continue;
      }
      if (widthChanged) {
        const before = transaction.mapping.maps.length;
        transaction = transaction.replaceWith(
          fragmentPos,
          fragmentPos + fragmentNode.nodeSize,
          editor.state.schema.nodeFromJSON(
            nextTableJson as Parameters<
              typeof editor.state.schema.nodeFromJSON
            >[0],
          ),
        );
        widthMapping.appendMapping(transaction.mapping.slice(before));
        const replaced = transaction.doc.nodeAt(fragmentPos);
        if (!replaced || replaced.nodeSize !== fragmentNode.nodeSize) replacedSameSize = false;
      }
    }
  }

  if (extend) {
    transaction = extend(transaction, transaction.mapping.map(target.tablePos));
  }
  if (!transaction.docChanged) {
    editor.view.focus();
    return "unchanged";
  }
  try {
    transaction = transaction.setSelection(
      replacedSameSize && transaction.doc.content.size === target.doc.content.size
        ? Selection.fromJSON(transaction.doc, target.selection.toJSON())
        : target.selection.map(transaction.doc, transaction.mapping),
    );
  } catch {
    return "stale";
  }
  editor.view.dispatch(transaction.scrollIntoView());
  editor.view.focus();
  return "applied";
}
