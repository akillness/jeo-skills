"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { normalizeTableShading, shadingCss } from "./tableShading";
import { Extension, type Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { Fragment, type Node as ProseMirrorNode, type Slice } from "@tiptap/pm/model";
import {
  Plugin,
  Selection,
  TextSelection,
  type EditorState,
  type Transaction,
} from "@tiptap/pm/state";
import { CellSelection, TableMap, addColumn, type Rect } from "@tiptap/pm/tables";
import { Transform } from "@tiptap/pm/transform";
import { readWordTableLayout } from "../../../../lib/document-word-table-autofit";

import {
  applyDocumentTableLayoutPolicy,
  autoFitTableContents,
  autoFitTableWindow,
  DEFAULT_TABLE_ROW_HEIGHT,
  MIN_TABLE_COLUMN_WIDTH,
  distributeColumnsEvenly,
  distributeRowsEvenly,
  fixTableColumnWidths,
  materializedColumnWidths,
  normalizeTableColumnWidthsTwips,
  seedMissingColumnWidths,
  setTableColumnWidth,
  setTableRowHeight,
  splitTableAtRow,
  tableColumnWidth,
  tableColumnWidthExact,
  tableRowHeight,
} from "./tableStructure";
import { normalizeTableRowHeight, normalizeTableRowHeightRule } from "./tableRowStyle";
import { tableCellSpacingFrameCss } from "./tableBorders";
import {
  normalizeTableCellSpacingPx,
  normalizeTableCellSpacingTwips,
} from "./tableCellStyle";
import {
  normalizeTablePositioning,
  serializeTablePositioning,
  tablePositioningCss,
  tablePositioningInlineFloat,
} from "./tablePositioning";
import {
  normalizeTableAlign,
  normalizeTableIndentPx,
  normalizeTableIndentTwips,
  tableAlignStyle,
  tableIndentStyle,
} from "./tableAlignment";
import {
  DOCUMENT_TABLE_MAX_SYNCHRONOUS_CELLS,
  documentTablePolicyFromNodeAttrs,
  validateDocumentTableDenseAdmission,
  type DocumentTableLayoutPolicy,
} from "./tableLayoutPolicy";
import {
  IME_COMPOSITION_SETTLED_META,
  imeReplayingAppendTransaction,
  imeSafeAppendTransaction,
} from "./imeCompositionGuard";
import { logicalTableFragmentsAt } from "./paged/tableFragmentGroups";
import { paginationLayoutScale } from "./paged/paginationGeometry";
import { createDocumentTableSelectZonesPlugin } from "./documentTableSelectZones";
import { createExactRowCellAlignmentPlugin } from "./exactRowCellAlignment";
import {
  DOCUMENT_TABLE_OWN_UNDO_STEP_META,
  backspaceDocumentTableSelection,
  clearDocumentTableCells,
  cutDocumentTableSelection,
  logicalTableTextRange,
  deleteDocumentTable,
  deleteDocumentTableColumns,
  deleteDocumentTableRows,
  joinTableFragmentsForRowInsert,
  openDocumentTableDeleteCellsDialog,
} from "./tableSelectionDelete";
import {
  TABLE_CONTINUATION_ATTR,
  TABLE_CONTINUES_ATTR,
  TABLE_FRAGMENT_ID_ATTR,
  TABLE_ORIGINAL_ROWSPAN_ATTR,
  TABLE_REPEATED_HEADER_ATTR,
  TABLE_ROW_CONTINUATION_ATTR,
  TABLE_ROW_CONTINUES_ATTR,
  TABLE_VERTICAL_CONTINUATION_ATTR,
  detachTableFragmentJson,
  type TableJsonNode,
} from "./paged/tablePagination";

/**
 * Word/WPS table-structure COMMANDS — SPLIT TABLE, DISTRIBUTE COLUMNS, DISTRIBUTE
 * ROWS — wired to the pure transforms in {@link tableStructure}.
 *
 * ADDITIVE: registers three commands that operate on the table enclosing the
 * current selection. Each command:
 *   1. locates the enclosing `table` node + its document position;
 *   2. runs the matching PURE transform on the table's JSON;
 *   3. replaces the table node in the document with the transform's result via a
 *      single transaction (so undo/redo treat it as one step).
 * A command is a no-op (returns false) when the selection is not inside a table,
 * so a document with no tables is entirely unaffected.
 */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tableStructure: {
      /**
       * Split the table at the cursor's row (Word "Split Table"): the cursor's
       * row starts a NEW table; rows above it stay in the first table. No-op when
       * the cursor is in the first row (nothing to split off) or not in a table.
       */
      splitTableAtCursor: () => ReturnType;
      /** Distribute the columns of the enclosing table to equal widths. */
      distributeTableColumns: () => ReturnType;
      /** Distribute the rows of the enclosing table to equal heights. */
      distributeTableRows: () => ReturnType;
      /**
       * AutoFit Contents (Word/WPS): shrink each column of the enclosing table to
       * fit its longest cell text. No-op when not in a table.
       */
      autoFitTableContents: () => ReturnType;
      /**
       * AutoFit Window (Word/WPS): stretch the enclosing table's columns to fill
       * the page/content width. Optionally pass a measured content width (px);
       * defaults to the page default. No-op when not in a table.
       */
      autoFitTableWindow: (totalWidth?: number) => ReturnType;
      /** Freeze the current materialized grid as native fixed column widths. */
      fixTableColumnWidths: () => ReturnType;
      /** Apply an explicit, serializable layout policy to the enclosing table. */
      setTableLayoutPolicy: (
        policy: DocumentTableLayoutPolicy,
        totalWidth?: number,
      ) => ReturnType;
      /**
       * Set the enclosing table's ON-PAGE alignment (Word/WPS 表格属性 →
       * 对齐方式): "left" (default → cleared), "center", or "right". This positions
       * the WHOLE table within the page width — distinct from per-cell text
       * alignment. No-op when not in a table or when the value is unchanged.
       */
      setTableAlign: (value: "left" | "center" | "right" | null) => ReturnType;
    };
  }
}

interface EnclosingTable {
  node: ProseMirrorNode;
  /** Document position of the table node itself. */
  pos: number;
  /** 0-based index of the row containing the selection head, or 0. */
  rowIndex: number;
}

/**
 * The selection to keep after a table is replaced by an attribute-only copy
 * (height, width, distribute, AutoFit). Mapping through the whole-table
 * ReplaceStep sends every inner position past the table, so the caret left
 * the table, and the Table Layout tab closed, after each commit. Word keeps
 * the caret in its cell. When every size is unchanged the old positions are
 * still valid, so they are kept; otherwise the mapped selection is used.
 */
function selectionAfterTableReplacement(
  selection: Selection,
  transaction: Transaction,
  sizeUnchanged: boolean,
): Selection {
  if (sizeUnchanged) {
    try {
      return Selection.fromJSON(transaction.doc, selection.toJSON());
    } catch {
      // Fall back to the mapped selection below.
    }
  }
  return selection.map(transaction.doc, transaction.mapping);
}

/**
 * Resolve the `table` node enclosing the selection head, its position, and the
 * 0-based index of the row the cursor is in. Returns null when the selection is
 * not inside a table. Walks the resolved-position ancestors (depth chain) rather
 * than scanning, so it is O(depth).
 */
export function findEnclosingTable(state: EditorState): EnclosingTable | null {
  const { $from } = state.selection;
  let tableDepth = -1;
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    if ($from.node(depth).type.name === "table") {
      tableDepth = depth;
      break;
    }
  }
  if (tableDepth < 0) return null;
  const node = $from.node(tableDepth);
  // before(depth) is the position just before the node at `depth`.
  const pos = $from.before(tableDepth);

  // Compute the cursor's 0-based ROW index by counting the `tableRow` children of
  // the table whose document range ENDS at or before the selection head — i.e.
  // how many full rows precede the row the caret sits in. This is boundary-safe
  // (a caret exactly at a row's start still maps to that row), unlike a raw
  // `$from.index(tableDepth)` which can round up at a node boundary.
  const head = $from.pos;
  let rowIndex = 0;
  let rowStart = pos + 1; // first child position inside the table
  node.forEach((child) => {
    if (child.type.name !== "tableRow") {
      rowStart += child.nodeSize;
      return;
    }
    const rowEnd = rowStart + child.nodeSize;
    // The caret is inside this row when head < rowEnd; every row that ends at or
    // before head is a full preceding row (advance the index).
    if (rowEnd <= head) rowIndex += 1;
    rowStart = rowEnd;
  });
  return { node, pos, rowIndex };
}

/**
 * The OUTERMOST table around the selection head and the row of it the caret
 * is in (a caret in a nested table counts as being in the outer row holding
 * it). Word starts a page break typed anywhere in a table there: it splits
 * that table above the row (measured in Word 16.86, a nested table included).
 */
export function findOutermostTable(state: EditorState): EnclosingTable | null {
  const { $from } = state.selection;
  for (let depth = 1; depth <= $from.depth; depth += 1) {
    const node = $from.node(depth);
    if (node.type.name !== "table") continue;
    return { node, pos: $from.before(depth), rowIndex: depth < $from.depth ? $from.index(depth) : 0 };
  }
  return null;
}

/**
 * Word's page (or column, or section) break inside a table: the table is
 * split above the row `found` names, as Split Table splits it, and the break
 * goes between the two tables instead of Split Table's empty paragraph. A
 * caret in the first row puts the break before the table. Word puts the
 * break in a paragraph of its own between the tables (a table cannot follow
 * a table directly), which reads back as an empty paragraph, the break and
 * the paragraph's empty rest: the same three go between the halves here
 * (DQ-L 37, corpus R498-D57: the saved file read back with a paragraph the
 * page did not hold). `window.__docsTableSplitBreakParagraphOff = true` puts
 * the break alone. Returns the positions of the break and of the second
 * table, or null when the row cannot start a second table (a repeated
 * header copy, a row the page already cut, a merged cell the page layout
 * carries across a page boundary).
 */
export function insertBreakSplittingTable(
  state: EditorState,
  tr: Transaction,
  found: EnclosingTable,
  breakNode: ProseMirrorNode,
): { breakPos: number; tablePos: number } | null {
  const table = found.node;
  // The first row of a page's continuation fragment is not the table's first
  // row: Split Table's own plan decides there (a page-boundary split).
  if (found.rowIndex === 0 && table.attrs[TABLE_CONTINUATION_ATTR] !== true) {
    tr.insert(found.pos, breakNode);
    return { breakPos: found.pos, tablePos: found.pos + breakNode.nodeSize };
  }
  if (!proseMirrorTableAdmitsDensePolicy(table)) return null;
  const plan = planTableSplit(state, found);
  if (!plan) return null;
  const between = breakParagraphNodes(state.schema, breakNode);
  const nodes = tableSplitNodes(state.schema, plan, between);
  if (!nodes) return null;
  const before = between.indexOf(breakNode);
  const offset = between.slice(0, before).reduce((size, node) => size + node.nodeSize, 0);
  const size = between.reduce((total, node) => total + node.nodeSize, 0);
  const cut = structuralTableSplitAt(table, found.pos, plan);
  if (cut !== null) {
    splitTableInPlace(tr, found.pos, cut, plan, between);
    return { breakPos: cut + 1 + offset, tablePos: cut + 1 + size };
  }
  tr.replaceWith(found.pos, found.pos + table.nodeSize, nodes);
  for (const fragment of plan.retagged) {
    const pos = tr.mapping.map(fragment.pos);
    const node = tr.doc.nodeAt(pos);
    if (node?.type.name !== "table") continue;
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...fragment.attrs });
  }
  const headSize = plan.head ? nodes[0].nodeSize : 0;
  return { breakPos: found.pos + headSize + offset, tablePos: found.pos + headSize + size };
}

/** What goes between the halves of a table a break splits: Word's paragraph
 * holding the break, as read back -- [empty paragraph, break, empty
 * paragraph] -- or the break alone (`__docsTableSplitBreakParagraphOff`). */
function breakParagraphNodes(schema: EditorState["schema"], breakNode: ProseMirrorNode): ProseMirrorNode[] {
  const paragraphType = schema.nodes.paragraph;
  if (
    !paragraphType ||
    (typeof window !== "undefined" &&
      (window as Window & { __docsTableSplitBreakParagraphOff?: boolean }).__docsTableSplitBreakParagraphOff === true)
  ) {
    return [breakNode];
  }
  return [paragraphType.create(), breakNode, paragraphType.create()];
}

export type DocumentTableSelectionScope = "cell" | "row" | "column" | "table";

interface TableCellSelectionContext {
  readonly table: EnclosingTable;
  /** Absolute document position immediately before the active cell. */
  readonly cellPos: number;
}

function tableCellSelectionContext(
  state: EditorState,
): TableCellSelectionContext | null {
  const table = findEnclosingTable(state);
  if (!table) return null;
  if (state.selection instanceof CellSelection) {
    return { table, cellPos: state.selection.$headCell.pos };
  }
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const name = $from.node(depth).type.name;
    if (name === "tableCell" || name === "tableHeader") {
      return { table, cellPos: $from.before(depth) };
    }
  }
  return null;
}

/** Read the explicit native CellSelection scope, or null for a text caret. */
export function documentTableSelectionScope(
  editor: Editor,
): DocumentTableSelectionScope | null {
  const selection = editor.state.selection;
  if (!(selection instanceof CellSelection)) return null;
  const context = tableCellSelectionContext(editor.state);
  if (!context) return null;
  const map = TableMap.get(context.table.node);
  const tableStart = context.table.pos + 1;
  const rectangle = map.rectBetween(
    selection.$anchorCell.pos - tableStart,
    selection.$headCell.pos - tableStart,
  );
  if (
    rectangle.top === 0 &&
    rectangle.left === 0 &&
    rectangle.bottom === map.height &&
    rectangle.right === map.width
  ) {
    return "table";
  }
  if (selection.isRowSelection()) return "row";
  if (selection.isColSelection()) return "column";
  return selection.$anchorCell.pos === selection.$headCell.pos ? "cell" : null;
}

/** Frozen authority for the Table Layout column-width value field. */
export interface DocumentTableColumnWidthTarget {
  readonly doc: ProseMirrorNode;
  readonly selection: Selection;
  readonly tablePos: number;
  readonly tableNode: ProseMirrorNode;
  readonly columnIndex: number;
  /** The column's width as drawn (Word's Cell.Width), or the stored width
   * when the table is not laid out. */
  readonly widthPx: number;
  /** The width the field shows: the stored one, unrounded, where the column
   * is drawn at it (3 cm reads back as 3.00, not 2.99); else widthPx. */
  readonly exactWidthPx: number;
  /** Every grid column's drawn width, when the table is laid out. */
  readonly drawnWidthsPx: readonly number[] | null;
  /** The width the table's container leaves it (a cell's, for a nested
   * table; the text column's otherwise), when laid out. */
  readonly roomPx: number | null;
}

/** The content width of the box the table at `tablePos` is laid out in. */
function tableRoomPx(editor: Editor, tablePos: number): number | null {
  let dom: Node | null = null;
  try {
    dom = editor.view.nodeDOM(tablePos);
  } catch {
    return null;
  }
  if (!(dom instanceof HTMLElement)) return null;
  const table = dom.tagName === "TABLE" ? dom : dom.querySelector("table");
  const box = table?.parentElement;
  if (!table || !box) return null;
  const style = box.ownerDocument.defaultView?.getComputedStyle(box);
  const padding = style
    ? (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0)
    : 0;
  const room = box.clientWidth - padding;
  return Number.isFinite(room) && room > 0 ? room : null;
}

/**
 * Read exactly one active grid column. A merged cell spanning columns or a
 * multi-column CellSelection is ambiguous and therefore fails closed. The
 * width read is the one the column is DRAWN at (Word's Table Layout width is
 * the cell's actual width): a table squeezed into a narrower cell or text
 * area than its stored widths draws them smaller, and the box must say what
 * the page shows (WUA 006).
 */
export function readDocumentTableColumnWidthTarget(
  editor: Editor,
): DocumentTableColumnWidthTarget | null {
  if (editor.isDestroyed) return null;
  const context = tableCellSelectionContext(editor.state);
  if (!context) return null;
  let map: TableMap;
  try {
    map = TableMap.get(context.table.node);
  } catch {
    return null;
  }
  const tableStart = context.table.pos + 1;
  const selection = editor.state.selection;
  const rectangle =
    selection instanceof CellSelection
      ? map.rectBetween(
          selection.$anchorCell.pos - tableStart,
          selection.$headCell.pos - tableStart,
        )
      : map.findCell(context.cellPos - tableStart);
  if (rectangle.right - rectangle.left !== 1) return null;
  const storedPx = tableColumnWidth(
    context.table.node.toJSON() as Record<string, unknown>,
    rectangle.left,
  );
  if (storedPx === null) return null;
  const drawnWidthsPx = renderedColumnWidths(editor, context.table);
  const drawnPx = drawnWidthsPx?.[rectangle.left];
  const widthPx =
    drawnPx !== undefined && drawnPx > 0 ? Math.round(drawnPx) : storedPx;
  const exactPx = tableColumnWidthExact(
    context.table.node.toJSON() as Record<string, unknown>,
    rectangle.left,
  );
  return {
    doc: editor.state.doc,
    selection,
    tablePos: context.table.pos,
    tableNode: context.table.node,
    columnIndex: rectangle.left,
    widthPx,
    exactWidthPx:
      exactPx !== null && Math.abs(exactPx - widthPx) < 1 ? exactPx : widthPx,
    drawnWidthsPx,
    roomPx: drawnWidthsPx ? tableRoomPx(editor, context.table.pos) : null,
  };
}

export type DocumentTableColumnWidthCommitResult =
  | "applied"
  | "unchanged"
  | "stale"
  /** Set as wide as its container leaves it, which is less than asked. */
  | "limited";

/**
 * Authenticate the frozen table, exact Selection object, and grid column,
 * then publish one table replacement transaction. Toolbar focus is harmless;
 * a selection/doc/table change can never retarget a different collaborator's
 * table or column.
 */
export function commitDocumentTableColumnWidth(
  editor: Editor,
  target: DocumentTableColumnWidthTarget,
  widthPx: number,
): DocumentTableColumnWidthCommitResult {
  if (
    editor.isDestroyed ||
    !editor.isEditable ||
    editor.state.doc !== target.doc ||
    editor.state.selection !== target.selection ||
    editor.state.doc.nodeAt(target.tablePos) !== target.tableNode
  ) {
    return "stale";
  }
  const current = readDocumentTableColumnWidthTarget(editor);
  if (
    !current ||
    current.tablePos !== target.tablePos ||
    current.tableNode !== target.tableNode ||
    current.columnIndex !== target.columnIndex
  ) {
    return "stale";
  }
  // The container (the cell a nested table sits in, the text column) leaves
  // the table only so much room: the page squeezes a wider grid to fit,
  // which drew the column narrower than asked and the others narrower too.
  // Word grows an AutoFit parent cell or runs a table into the margin; the
  // page cannot, so the column takes the room there is, and says so.
  let width = widthPx;
  let limited = false;
  if (target.drawnWidthsPx && target.roomPx !== null) {
    const others = target.drawnWidthsPx.reduce(
      (sum, value, index) => (index === target.columnIndex ? sum : sum + value),
      0,
    );
    const room = Math.floor(target.roomPx - others);
    if (Math.round(widthPx) > room && room >= MIN_TABLE_COLUMN_WIDTH) {
      width = room;
      limited = true;
    }
  }
  const source = target.tableNode.toJSON() as Record<string, unknown>;
  const next = setTableColumnWidth(source, target.columnIndex, width, target.drawnWidthsPx);
  if (next === source) {
    if (limited) return "limited";
    return Math.abs(width - target.exactWidthPx) < 0.5 ? "unchanged" : "stale";
  }
  let transaction = closeHistory(editor.state.tr);
  const replacement = editor.state.schema.nodeFromJSON(
    next as Parameters<typeof editor.state.schema.nodeFromJSON>[0],
  );
  transaction = transaction.replaceWith(
    target.tablePos,
    target.tablePos + target.tableNode.nodeSize,
    replacement,
  );
  try {
    transaction = transaction.setSelection(
      selectionAfterTableReplacement(
        target.selection,
        transaction,
        replacement.nodeSize === target.tableNode.nodeSize,
      ),
    );
  } catch {
    return "stale";
  }
  editor.view.dispatch(transaction.scrollIntoView());
  return limited ? "limited" : "applied";
}

/** Frozen authority for the Table Layout row-height value field. */
export interface DocumentTableRowHeightTarget {
  readonly doc: ProseMirrorNode;
  readonly selection: Selection;
  readonly tablePos: number;
  readonly tableNode: ProseMirrorNode;
  readonly rowIndex: number;
  readonly heightPx: number;
  /** The row's exact height (its twips), which the field shows. */
  readonly exactHeightPx: number;
  readonly rule: "atLeast" | "exact";
}

/**
 * Read exactly one physical row. Row-spanning cells and multi-row selections
 * are ambiguous and remain fail-closed.
 */
export function readDocumentTableRowHeightTarget(
  editor: Editor,
): DocumentTableRowHeightTarget | null {
  if (editor.isDestroyed) return null;
  const context = tableCellSelectionContext(editor.state);
  if (!context) return null;
  let map: TableMap;
  try {
    map = TableMap.get(context.table.node);
  } catch {
    return null;
  }
  const tableStart = context.table.pos + 1;
  const selection = editor.state.selection;
  const rectangle =
    selection instanceof CellSelection
      ? map.rectBetween(
          selection.$anchorCell.pos - tableStart,
          selection.$headCell.pos - tableStart,
        )
      : map.findCell(context.cellPos - tableStart);
  if (rectangle.bottom - rectangle.top !== 1) return null;
  const value = tableRowHeight(
    context.table.node.toJSON() as Record<string, unknown>,
    rectangle.top,
  );
  if (!value) return null;
  return {
    doc: editor.state.doc,
    selection,
    tablePos: context.table.pos,
    tableNode: context.table.node,
    rowIndex: rectangle.top,
    heightPx: value.heightPx,
    exactHeightPx: value.exactHeightPx,
    rule: value.rule,
  };
}

export type DocumentTableRowHeightCommitResult =
  | "applied"
  | "unchanged"
  | "stale";

/** Authenticate and publish one row-height replacement as one Undo step. */
export function commitDocumentTableRowHeight(
  editor: Editor,
  target: DocumentTableRowHeightTarget,
  heightPx: number,
  /** The height typed, in twips, when it was typed as a length. */
  heightTwips?: number,
): DocumentTableRowHeightCommitResult {
  if (
    editor.isDestroyed ||
    !editor.isEditable ||
    editor.state.doc !== target.doc ||
    editor.state.selection !== target.selection ||
    editor.state.doc.nodeAt(target.tablePos) !== target.tableNode
  ) {
    return "stale";
  }
  const current = readDocumentTableRowHeightTarget(editor);
  if (
    !current ||
    current.tablePos !== target.tablePos ||
    current.tableNode !== target.tableNode ||
    current.rowIndex !== target.rowIndex
  ) {
    return "stale";
  }
  const source = target.tableNode.toJSON() as Record<string, unknown>;
  const next = setTableRowHeight(
    source,
    target.rowIndex,
    heightPx,
    target.rule,
    heightTwips,
  );
  if (next === source) {
    return Math.round(heightPx) === target.heightPx ? "unchanged" : "stale";
  }
  let transaction = closeHistory(editor.state.tr);
  const replacement = editor.state.schema.nodeFromJSON(
    next as Parameters<typeof editor.state.schema.nodeFromJSON>[0],
  );
  transaction = transaction.replaceWith(
    target.tablePos,
    target.tablePos + target.tableNode.nodeSize,
    replacement,
  );
  try {
    transaction = transaction.setSelection(
      selectionAfterTableReplacement(
        target.selection,
        transaction,
        replacement.nodeSize === target.tableNode.nodeSize,
      ),
    );
  } catch {
    return "stale";
  }
  editor.view.dispatch(transaction.scrollIntoView());
  return "applied";
}

function insertLogicalTableColumn(
  state: EditorState,
  tr: Transaction,
  dispatch: ((tr: Transaction) => void) | undefined,
  side: "before" | "after",
): boolean {
  const context = tableCellSelectionContext(state);
  if (!context) return false;
  const map = TableMap.get(context.table.node);
  const tableStart = context.table.pos + 1;
  // Word inserts at the edge of the whole selected rectangle, not beside the
  // selection's active (bottom-right) cell.
  const rect =
    state.selection instanceof CellSelection
      ? map.rectBetween(
          state.selection.$anchorCell.pos - tableStart,
          state.selection.$headCell.pos - tableStart,
        )
      : map.findCell(context.cellPos - tableStart);
  const column = side === "before" ? rect.left : rect.right;
  const fragments = logicalTableFragmentsAt(state.doc, context.table.pos);
  if (!dispatch) return true;
  // Later fragments first, so the earlier positions stay valid.
  for (const fragment of [...fragments].reverse()) {
    const fragmentMap = TableMap.get(fragment.node);
    const fragmentRect: Rect & { map: TableMap; tableStart: number; table: ProseMirrorNode } = {
      left: 0,
      top: 0,
      right: fragmentMap.width,
      bottom: fragmentMap.height,
      map: fragmentMap,
      tableStart: fragment.pos + 1,
      table: fragment.node,
    };
    const insertAt = Math.min(column, fragmentMap.width);
    // The table plugin's addColumn maps the positions it reads off the table
    // through the whole transaction (tr.mapping), as if they were the
    // positions of the document the transaction started from. A second
    // column inserted in the same transaction (Insert Right with a count of
    // two, two AI column operations in one chain) read the table as the first
    // insert left it and was moved by that insert again: its cells went into
    // the words of other cells or past the table, refused (R483-D43 WALK1:
    // "Sudah Dilaksanakan" split into two cells, then the save left the
    // columns out). Run on the document as it is now, its steps added to tr.
    const step = new Transform(tr.doc);
    addColumn(step as unknown as Transaction, fragmentRect, insertAt);
    for (const each of step.steps) tr.step(each);
    giveInsertedColumnItsNeighbourWidth(
      tr,
      fragment.pos,
      insertAt,
      side === "after" ? insertAt - 1 : insertAt + 1,
    );
    giveInsertedColumnItsNeighbourFormat(
      tr,
      fragment.pos,
      insertAt,
      side === "after" ? insertAt - 1 : insertAt + 1,
    );
  }
  dispatch(tr);
  return true;
}

/**
 * Cell formatting a new row or column takes from the one it is inserted
 * beside. Word 16 gives the new cells the shading, borders, margins,
 * alignment and text direction of the row or column the caret is in; only
 * the content starts empty.
 */
const INHERITED_CELL_FORMAT_ATTRS = [
  "align",
  "backgroundColor",
  "cellShading",
  "borderStyle",
  "cellBorders",
  "textAlign",
  "verticalAlign",
  "textDirection",
  "cellMargin",
] as const;

function inheritedCellFormat(reference: ProseMirrorNode): Record<string, unknown> {
  const format: Record<string, unknown> = {};
  for (const name of INHERITED_CELL_FORMAT_ATTRS) {
    if (name in reference.attrs) format[name] = reference.attrs[name];
  }
  return format;
}

function giveInsertedColumnItsNeighbourFormat(
  tr: Transaction,
  tablePos: number,
  column: number,
  reference: number,
): void {
  const table = tr.doc.nodeAt(tablePos);
  if (!table || table.type.name !== "table") return;
  const map = TableMap.get(table);
  if (reference < 0 || reference >= map.width || column >= map.width) return;
  const seen = new Set<number>();
  for (let row = 0; row < map.height; row += 1) {
    const offset = map.map[row * map.width + column]!;
    if (seen.has(offset)) continue;
    seen.add(offset);
    const cell = table.nodeAt(offset);
    // A merged cell that grew over the new column is not a new cell.
    if (!cell || (Number(cell.attrs.colspan) || 1) !== 1 || cell.textContent !== "") continue;
    const source = table.nodeAt(map.map[row * map.width + reference]!);
    if (!source || source === cell) continue;
    const attrs = { ...cell.attrs, ...inheritedCellFormat(source) };
    if (INHERITED_CELL_FORMAT_ATTRS.every((name) => attrs[name] === cell.attrs[name])) continue;
    tr.setNodeMarkup(tablePos + 1 + offset, null, attrs);
  }
}

function tableRowIsHeader(map: TableMap, table: ProseMirrorNode, row: number): boolean {
  for (let column = 0; column < map.width; column += 1) {
    const cell = table.nodeAt(map.map[row * map.width + column]!);
    if (cell?.type.name !== "tableHeader") return false;
  }
  return true;
}

/**
 * Insert Above / Insert Below. The new row repeats the reference row's cells
 * (Word 16: the same merged spans, widths and cell formatting, empty
 * content); a vertically merged cell that crosses the insertion point grows
 * over the new row, and the caret in a vertically merged cell inserts above
 * its first or below its last row.
 */
function insertTableRowLikeReference(
  state: EditorState,
  tr: Transaction,
  dispatch: ((tr: Transaction) => void) | undefined,
  side: "before" | "after",
): boolean {
  const context = tableCellSelectionContext(state);
  if (!context) return false;
  if (!dispatch) return true;
  let table = context.table.node;
  let map = TableMap.get(table);
  let tableStart = context.table.pos + 1;
  let rect: { top: number; bottom: number; left: number; right: number } =
    state.selection instanceof CellSelection
      ? map.rectBetween(
          state.selection.$anchorCell.pos - tableStart,
          state.selection.$headCell.pos - tableStart,
        )
      : map.findCell(context.cellPos - tableStart);
  // A row the pages cut, or a merged cell they cut, is one row and one cell:
  // Word inserts below the row's last piece and the cell's last row, above
  // their first. A row put at the seam stood between the two halves, which never
  // joined again: the table saved the row twice, a blank copy under the new one
  // with a span no grid could state, and was refused from the file (corpus
  // R326-D05). There the fragments become one table (the layout cuts it again).
  let caret: number | null = null;
  let joinedAtStep = 0;
  if (tableRowInsertTouchesAPageCut(state.doc, context.table.pos, rect, side)) {
    const joined = joinTableFragmentsForRowInsert(state, tr);
    if (joined) {
      joinedAtStep = tr.steps.length;
      table = tr.doc.nodeAt(joined.tablePos)!;
      map = TableMap.get(table);
      tableStart = joined.tablePos + 1;
      const first = map.map[joined.rows[0]! * map.width + joined.left]!;
      const last = map.map[joined.rows[joined.rows.length - 1]! * map.width + joined.right - 1]!;
      rect = map.rectBetween(first, last);
      caret = tableStart + first + 1;
    }
  }
  const row = side === "before" ? rect.top : rect.bottom;
  const referenceRow = side === "before" ? rect.top : rect.bottom - 1;
  // The table plugin's rule for the new cells' type: a row inserted next to
  // a header row is a body row unless it lands between two header rows.
  let typeRow: number | null = row > 0 ? row - 1 : 0;
  if (tableRowIsHeader(map, table, typeRow)) {
    typeRow = row === 0 || row === map.height ? null : row;
  }
  const cells: ProseMirrorNode[] = [];
  for (let column = 0; column < map.width; ) {
    const index = row * map.width + column;
    if (row > 0 && row < map.height && map.map[index] === map.map[index - map.width]) {
      const offset = map.map[index]!;
      const spanning = table.nodeAt(offset)!;
      tr.setNodeMarkup(tableStart + offset, null, {
        ...spanning.attrs,
        rowspan: (Number(spanning.attrs.rowspan) || 1) + 1,
      });
      column += Number(spanning.attrs.colspan) || 1;
      continue;
    }
    const referenceOffset = map.map[referenceRow * map.width + column]!;
    const reference = table.nodeAt(referenceOffset)!;
    const referenceLeft = map.colCount(referenceOffset);
    const referenceSpan = Number(reference.attrs.colspan) || 1;
    const span = Math.max(1, Math.min(referenceLeft + referenceSpan, map.width) - column);
    const slice = (value: unknown): unknown =>
      Array.isArray(value) && value.length === referenceSpan
        ? value.slice(column - referenceLeft, column - referenceLeft + span)
        : null;
    const type =
      typeRow === null
        ? state.schema.nodes.tableCell!
        : (table.nodeAt(map.map[typeRow * map.width + column]!)?.type ?? reference.type);
    const cell = type.createAndFill({
      ...inheritedCellFormat(reference),
      colspan: span,
      rowspan: 1,
      colwidth: slice(reference.attrs.colwidth),
      colwidthTwips: slice(reference.attrs.colwidthTwips),
    });
    if (cell) cells.push(cell);
    column += span;
  }
  let rowPos = tableStart;
  for (let index = 0; index < row; index += 1) rowPos += table.child(index).nodeSize;
  tr.insert(rowPos, state.schema.nodes.tableRow!.create(null, cells));
  if (caret !== null) {
    tr.setSelection(Selection.near(tr.doc.resolve(tr.mapping.slice(joinedAtStep).map(caret)), 1));
  }
  dispatch(tr);
  return true;
}

/** Whether a new row beside these rows meets a piece of a row or of a merged
 * cell the pages cut, in this fragment or at the edge of the next. */
function tableRowInsertTouchesAPageCut(
  doc: ProseMirrorNode,
  tablePos: number,
  rect: { top: number; bottom: number },
  side: "before" | "after",
): boolean {
  const fragments = logicalTableFragmentsAt(doc, tablePos);
  if (fragments.length < 2) return false;
  const index = fragments.findIndex((fragment) => fragment.pos === tablePos);
  if (index < 0) return false;
  const table = fragments[index]!.node;
  const rows: Array<ProseMirrorNode | null> = [];
  for (let row = rect.top; row < rect.bottom; row += 1) rows.push(table.child(row));
  const boundary = side === "before" ? rect.top : rect.bottom;
  rows.push(table.maybeChild(boundary) ?? null, table.maybeChild(boundary - 1) ?? null);
  if (boundary >= table.childCount) {
    const next = fragments[index + 1]?.node;
    if (next) {
      let first = 0;
      while (first < next.childCount && next.child(first).attrs[TABLE_REPEATED_HEADER_ATTR] === true) first += 1;
      rows.push(next.maybeChild(first) ?? null);
    }
  }
  return rows.some((row) => {
    if (!row) return false;
    if (row.attrs[TABLE_ROW_CONTINUES_ATTR] === true || row.attrs[TABLE_ROW_CONTINUATION_ATTR] === true) return true;
    let cut = false;
    row.forEach((cell) => {
      if (
        cell.attrs[TABLE_VERTICAL_CONTINUATION_ATTR] === true ||
        Number(cell.attrs[TABLE_ORIGINAL_ROWSPAN_ATTR] ?? 0) > 1
      ) {
        cut = true;
      }
    });
    return cut;
  });
}

/**
 * Word's Insert Left / Insert Right add a grid column as wide as the column
 * it is inserted beside (Word 16 for Mac: Insert Right of a 2160-twip column
 * adds a 2160-twip `w:gridCol`). The table plugin's `addColumn` leaves the
 * new cells without a width and puts a 0 into the widths of a merged cell
 * that now spans it; an imported table's native grid (`colwidthTwips`) then
 * has a column no save can state. The new grid column takes the
 * neighbour's width, in pixels and, where the table carries them, twips.
 */
function giveInsertedColumnItsNeighbourWidth(
  tr: Transaction,
  tablePos: number,
  column: number,
  reference: number,
): void {
  const table = tr.doc.nodeAt(tablePos);
  if (!table || table.type.name !== "table") return;
  const map = TableMap.get(table);
  if (reference < 0 || reference >= map.width) return;
  let px: number | null = null;
  let twips: number | null = null;
  for (let row = 0; row < map.height && (px === null || twips === null); row += 1) {
    const offset = map.map[row * map.width + reference]!;
    const cell = table.nodeAt(offset);
    if (!cell) continue;
    const span = Number(cell.attrs.colspan) || 1;
    const index = reference - map.colCount(offset);
    const live: unknown = cell.attrs.colwidth;
    const native: unknown = cell.attrs.colwidthTwips;
    if (px === null && Array.isArray(live) && live.length === span) {
      const value = live[index];
      if (typeof value === "number" && Number.isFinite(value) && value > 0) px = value;
    }
    if (twips === null && Array.isArray(native) && native.length === span) {
      const value = native[index];
      if (typeof value === "number" && Number.isInteger(value) && value > 0) twips = value;
    }
  }
  if (px === null) return;
  const seen = new Set<number>();
  for (let row = 0; row < map.height; row += 1) {
    const offset = map.map[row * map.width + column]!;
    if (seen.has(offset)) continue;
    seen.add(offset);
    const cell = table.nodeAt(offset);
    if (!cell) continue;
    const span = Number(cell.attrs.colspan) || 1;
    const index = column - map.colCount(offset);
    const live: unknown = cell.attrs.colwidth;
    const native: unknown = cell.attrs.colwidthTwips;
    const attrs: Record<string, unknown> = { ...cell.attrs };
    if (span === 1 && !Array.isArray(live)) {
      attrs.colwidth = [px];
      if (twips !== null) attrs.colwidthTwips = [twips];
    } else if (Array.isArray(live) && live.length === span && !(Number(live[index]) > 0)) {
      const widths = [...live];
      widths[index] = px;
      attrs.colwidth = widths;
      if (twips !== null && Array.isArray(native) && native.length === span - 1) {
        const nativeWidths = [...native];
        nativeWidths.splice(index, 0, twips);
        attrs.colwidthTwips = nativeWidths;
      }
    } else {
      continue;
    }
    tr.setNodeMarkup(tablePos + 1 + offset, null, attrs);
  }
}

/**
 * Select the active Word table cell, row, column, or entire table without
 * mutating document content. CellSelection is the single selection authority
 * used by all downstream merge/delete/format commands.
 */
export function selectDocumentTableScope(
  editor: Editor,
  scope: DocumentTableSelectionScope,
): boolean {
  const context = tableCellSelectionContext(editor.state);
  if (!context) return false;
  const { state } = editor;
  const $cell = state.doc.resolve(context.cellPos);
  const map = TableMap.get(context.table.node);
  const tableStart = context.table.pos + 1;
  let selection: CellSelection;
  if (scope === "row") {
    selection = CellSelection.rowSelection($cell);
  } else if (scope === "column") {
    selection = CellSelection.colSelection($cell);
  } else if (scope === "table") {
    // A table split over pages is one logical table: Select Table takes all
    // of it. A CellSelection lives in one table node, so across fragments
    // the selection is the text from the first fragment's first cell to the
    // last fragment's last cell, which every character command then covers
    
    const fragments = logicalTableFragmentsAt(state.doc, context.table.pos);
    if (fragments.length > 1) {
      const { from, to } = logicalTableTextRange(state.doc, fragments);
      editor.view.dispatch(
        state.tr
          .setSelection(TextSelection.between(state.doc.resolve(from), state.doc.resolve(to)))
          .scrollIntoView(),
      );
      return true;
    }
    const firstCell = tableStart + map.positionAt(0, 0, context.table.node);
    const lastCell =
      tableStart +
      map.positionAt(map.height - 1, map.width - 1, context.table.node);
    selection = CellSelection.create(state.doc, firstCell, lastCell);
  } else {
    selection = CellSelection.create(state.doc, context.cellPos);
  }
  editor.view.dispatch(state.tr.setSelection(selection).scrollIntoView());
  return true;
}

function proseMirrorTableAdmitsDensePolicy(
  table: ProseMirrorNode,
  policy?: DocumentTableLayoutPolicy | null,
): boolean {
  const hasDeclaredPolicy =
    (table.attrs.tableLayoutPolicy !== null &&
      table.attrs.tableLayoutPolicy !== undefined) ||
    (table.attrs.tableFixedWidthTwips !== null &&
      table.attrs.tableFixedWidthTwips !== undefined);
  const effectivePolicy =
    policy === undefined
      ? documentTablePolicyFromNodeAttrs(table.attrs)
      : policy;
  if (policy === undefined && hasDeclaredPolicy && effectivePolicy === null) {
    return false;
  }
  const rows = table.childCount;
  if (rows < 1 || rows > DOCUMENT_TABLE_MAX_SYNCHRONOUS_CELLS) return false;
  const maxColumnsForBudget = Math.floor(
    DOCUMENT_TABLE_MAX_SYNCHRONOUS_CELLS / rows,
  );
  let columns = 0;
  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    const row = table.child(rowIndex);
    if (row.type.name !== "tableRow") return false;
    if (row.childCount > maxColumnsForBudget) return false;
    let rowColumns = 0;
    for (let cellIndex = 0; cellIndex < row.childCount; cellIndex += 1) {
      const cell = row.child(cellIndex);
      const rawSpan = cell.attrs.colspan;
      const span =
        typeof rawSpan === "number" && Number.isInteger(rawSpan) && rawSpan > 0
          ? rawSpan
          : 1;
      rowColumns += span;
      if (rowColumns > maxColumnsForBudget) return false;
    }
    columns = Math.max(columns, rowColumns);
  }
  return validateDocumentTableDenseAdmission({
    representation: table.attrs.tableRepresentation,
    rows,
    columns,
    policy: effectivePolicy,
  }).ok;
}

/**
 * Resolve the physical rows owned by the current selection. A native
 * CellSelection must cover complete rows across the full logical grid; a text
 * caret retains the historical whole-table shortcut. TableMap is the sole
 * authority for rowspans and malformed maps fail closed.
 */
function distributedPhysicalRowIndexes(
  state: EditorState,
  table: EnclosingTable,
): readonly number[] | null {
  let map: TableMap;
  try {
    map = TableMap.get(table.node);
  } catch {
    return null;
  }
  if (
    map.problems !== null ||
    map.height !== table.node.childCount ||
    map.height < 2
  ) {
    return null;
  }
  const selection = state.selection;
  if (!(selection instanceof CellSelection)) {
    return Array.from({ length: map.height }, (_value, index) => index);
  }

  const tableStart = table.pos + 1;
  const tableEnd = tableStart + table.node.content.size;
  if (
    selection.$anchorCell.pos < tableStart ||
    selection.$anchorCell.pos >= tableEnd ||
    selection.$headCell.pos < tableStart ||
    selection.$headCell.pos >= tableEnd
  ) {
    return null;
  }
  let rectangle: Rect;
  try {
    rectangle = map.rectBetween(
      selection.$anchorCell.pos - tableStart,
      selection.$headCell.pos - tableStart,
    );
  } catch {
    return null;
  }
  if (
    !selection.isRowSelection() ||
    rectangle.left !== 0 ||
    rectangle.right !== map.width ||
    rectangle.top < 0 ||
    rectangle.bottom > map.height ||
    rectangle.bottom - rectangle.top < 2
  ) {
    return null;
  }
  return Array.from(
    { length: rectangle.bottom - rectangle.top },
    (_value, index) => rectangle.top + index,
  );
}

/**
 * Measure the selected physical rows from the live table before materializing
 * an authored equal height: their average height (Word keeps the table's
 * total) and the tallest height a row's content needs. Null in a detached or
 * jsdom editor, which has no box geometry.
 */
function measureDistributedRows(
  editor: Editor,
  table: EnclosingTable,
  selectedRows: readonly number[],
): { average: number; tallestContent: number } | null {
  const nodeDom = editor.view.nodeDOM(table.pos);
  const element =
    nodeDom instanceof Element
      ? nodeDom
      : nodeDom?.parentElement instanceof Element
        ? nodeDom.parentElement
        : null;
  const tableElement =
    element instanceof HTMLTableElement
      ? element
      : (element?.querySelector<HTMLTableElement>("table") ?? null);
  if (tableElement) {
    const rows = Array.from(tableElement.rows).filter(
      (row) => row.closest("table") === tableElement,
    );
    // Client rects carry the reading zoom; the row height written to the
    
    const scale = paginationLayoutScale(tableElement).y;
    const heights = selectedRows.map((index) => {
      const row = rows[index];
      if (!row) return null;
      const rectHeight = row.getBoundingClientRect().height;
      const measured = rectHeight ? rectHeight / scale : row.offsetHeight;
      return Number.isFinite(measured) && measured > 0 ? measured : null;
    });
    if (heights.every((height) => height !== null)) {
      const tallestContent = Math.max(
        0,
        ...selectedRows.map((index) =>
          rows[index] ? rowContentHeight(rows[index], scale) : 0,
        ),
      );
      return {
        average: Math.round(
          (heights as number[]).reduce((total, height) => total + height, 0) /
            heights.length,
        ),
        // Whole pixels up: a row a fraction taller than the rest is not even.
        tallestContent: Math.ceil(tallestContent),
      };
    }
  }
  return null;
}

/**
 * The height a row's content needs, in document pixels: the tallest of its
 * cells' content (margins included) plus the cell's padding and borders. A
 * cell spanning rows below is left out; its content is shared with them.
 */
function rowContentHeight(row: HTMLTableRowElement, scale: number): number {
  let tallest = 0;
  for (const cell of Array.from(row.cells)) {
    if (cell.rowSpan > 1) continue;
    const style = getComputedStyle(cell);
    const chrome =
      (parseFloat(style.paddingTop) || 0) +
      (parseFloat(style.paddingBottom) || 0) +
      (parseFloat(style.borderTopWidth) || 0) +
      (parseFloat(style.borderBottomWidth) || 0);
    let top = Infinity;
    let bottom = -Infinity;
    for (const child of Array.from(cell.children)) {
      if (!(child instanceof HTMLElement)) continue;
      const childStyle = getComputedStyle(child);
      if (
        childStyle.display === "none" ||
        childStyle.position === "absolute" ||
        childStyle.position === "fixed"
      ) {
        continue;
      }
      const rect = child.getBoundingClientRect();
      if (rect.height === 0 && rect.width === 0) continue;
      top = Math.min(top, rect.top - (parseFloat(childStyle.marginTop) || 0) * scale);
      bottom = Math.max(
        bottom,
        rect.bottom + (parseFloat(childStyle.marginBottom) || 0) * scale,
      );
    }
    const content = bottom > top ? (bottom - top) / scale : 0;
    tallest = Math.max(tallest, content + chrome);
  }
  return tallest;
}

/** Whether the selected rows already carry one height under one rule. */
function selectedRowsAlreadyEven(
  table: ProseMirrorNode,
  selectedRows: readonly number[],
): boolean {
  const rows = selectedRows.map((index) =>
    index < table.childCount ? table.child(index) : null,
  );
  if (rows.some((row) => !row)) return false;
  const heights = rows.map((row) => normalizeTableRowHeight(row!.attrs.rowHeight));
  const rules = rows.map(
    (row) => normalizeTableRowHeightRule(row!.attrs.rowHeightRule) ?? "atLeast",
  );
  return (
    heights[0] !== null &&
    heights.every((height) => height === heights[0]) &&
    rules.every((rule) => rule === rules[0])
  );
}

function selectedRowsNeedMaterializedHeight(
  table: Record<string, unknown>,
  selectedRows: readonly number[],
): boolean {
  const rows = Array.isArray(table.content)
    ? table.content.filter(
        (node): node is Record<string, unknown> =>
          Boolean(node) &&
          typeof node === "object" &&
          (node as { type?: unknown }).type === "tableRow",
      )
    : [];
  return selectedRows.some((index) => {
    const row = rows[index];
    const attrs =
      row?.attrs && typeof row.attrs === "object"
        ? (row.attrs as Record<string, unknown>)
        : {};
    return normalizeTableRowHeight(attrs.rowHeight) === null;
  });
}

/** A cell's layout width in CSS px, fraction kept, zoom taken out. */
function layoutWidth(cell: HTMLElement): number {
  const tableElement = cell.closest("table");
  const drawn = cell.getBoundingClientRect().width;
  const scale =
    tableElement && tableElement.offsetWidth > 0
      ? tableElement.getBoundingClientRect().width / tableElement.offsetWidth
      : 0;
  return Number.isFinite(scale) && scale > 0 && drawn > 0
    ? drawn / scale
    : cell.offsetWidth;
}

/**
 * Resolve the physical columns owned by the current selection. A native
 * CellSelection must cover complete columns across the full logical grid; an
 * empty caret retains the historical whole-table shortcut. TableMap is the
 * sole authority for merged cells and malformed maps fail closed.
 */
/**
 * The layout width of each grid column as drawn, read from single-span cells.
 * The bounding box keeps the fraction offsetWidth rounds away (three columns
 * of 207.66 px would read as 208 each and grow the table); dividing by the
 * table's own drawn/layout ratio takes the page zoom transform out. Null
 * without a mounted view or when a column has no measurable single-span cell.
 */
export function renderedColumnWidths(
  editor: Editor,
  table: { readonly node: ProseMirrorNode; readonly pos: number },
): number[] | null {
  let map: TableMap;
  try {
    map = TableMap.get(table.node);
  } catch {
    return null;
  }
  const widths: number[] = [];
  try {
    for (let column = 0; column < map.width; column += 1) {
      let width = 0;
      for (let row = 0; row < map.height && width <= 0; row += 1) {
        const offset = map.map[row * map.width + column];
        const cell = table.node.nodeAt(offset);
        if (!cell || (Number(cell.attrs.colspan) || 1) !== 1) continue;
        const dom = editor.view.nodeDOM(table.pos + 1 + offset);
        if (dom instanceof HTMLElement) width = layoutWidth(dom);
      }
      if (!(width > 0)) return null;
      widths.push(width);
    }
  } catch {
    return null;
  }
  return widths;
}

function distributedPhysicalColumnIndexes(
  state: EditorState,
  table: EnclosingTable,
): readonly number[] | null {
  let map: TableMap;
  try {
    map = TableMap.get(table.node);
  } catch {
    return null;
  }
  if (map.problems !== null || map.width < 2) return null;
  const selection = state.selection;
  if (!(selection instanceof CellSelection)) {
    return selection.empty
      ? Array.from({ length: map.width }, (_value, index) => index)
      : null;
  }

  const tableStart = table.pos + 1;
  const tableEnd = tableStart + table.node.content.size;
  if (
    selection.$anchorCell.pos < tableStart ||
    selection.$anchorCell.pos >= tableEnd ||
    selection.$headCell.pos < tableStart ||
    selection.$headCell.pos >= tableEnd
  ) {
    return null;
  }
  let rectangle: Rect;
  try {
    rectangle = map.rectBetween(
      selection.$anchorCell.pos - tableStart,
      selection.$headCell.pos - tableStart,
    );
  } catch {
    return null;
  }
  if (
    !selection.isColSelection() ||
    rectangle.top !== 0 ||
    rectangle.bottom !== map.height ||
    rectangle.left < 0 ||
    rectangle.right > map.width ||
    rectangle.right - rectangle.left < 2
  ) {
    return null;
  }
  const selectedCellOffsets = new Set<number>();
  for (let row = 0; row < map.height; row += 1) {
    for (let column = rectangle.left; column < rectangle.right; column += 1) {
      selectedCellOffsets.add(map.map[row * map.width + column]);
    }
  }
  for (const cellOffset of selectedCellOffsets) {
    let cellRectangle: Rect;
    try {
      cellRectangle = map.findCell(cellOffset);
    } catch {
      return null;
    }
    if (
      cellRectangle.left < rectangle.left ||
      cellRectangle.right > rectangle.right
    ) {
      return null;
    }
  }
  return Array.from(
    { length: rectangle.right - rectangle.left },
    (_value, index) => rectangle.left + index,
  );
}

function sameColumnWidths(left: unknown, right: unknown): boolean {
  if (!Array.isArray(left) || !Array.isArray(right)) return left === right;
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

/**
 * A table Word itself lays out AutoFit to contents keeps the grid Word saved
 * (each cell's `colwidthTwips`, as the import gave `colwidth`): Word's own
 * measure (wordTableAutofitDisplay) draws its columns from their content, and
 * one it does not draw (a merged cell) keeps that grid, as Word draws it. The
 * editor's text-length estimate (80-360px) drew corpus R283-D29's Table A2 at
 * 80/360/360 where Word draws its grid, 1238/1969/5809 twips, and cut words.
 * A grid an earlier estimate already overwrote is put back.
 */
function restoreWordGridColumnWidths(
  transaction: Transaction,
  table: ProseMirrorNode,
  tablePos: number,
): boolean {
  let changed = false;
  table.forEach((row, rowOffset) => {
    row.forEach((cell, cellOffset) => {
      const span = Number(cell.attrs.colspan) || 1;
      const twips = normalizeTableColumnWidthsTwips(cell.attrs.colwidthTwips, span);
      if (!twips) return;
      const desired = twips.map((value) => value / 15);
      if (sameColumnWidths(cell.attrs.colwidth, desired)) return;
      transaction.setNodeMarkup(tablePos + 1 + rowOffset + 1 + cellOffset, undefined, {
        ...cell.attrs,
        colwidth: desired,
      }, cell.marks);
      changed = true;
    });
  });
  return changed;
}

/**
 * Update only cell markup for content-driven widths. Replacing the whole table
 * from appendTransaction would remap an active IME/caret through a node replace
 * after every character; setNodeMarkup keeps cell content and selection stable.
 */
function applyAutoFitContentWidths(
  transaction: Transaction,
  table: ProseMirrorNode,
  tablePos: number,
): boolean {
  const fitted = autoFitTableContents(
    table.toJSON() as Record<string, unknown>,
  ) as {
    content?: Array<{ content?: Array<{ attrs?: Record<string, unknown> }> }>;
  };
  let changed = false;
  table.forEach((row, rowOffset, rowIndex) => {
    if (row.type.name !== "tableRow") return;
    const desiredRow = fitted.content?.[rowIndex];
    row.forEach((cell, cellOffset, cellIndex) => {
      if (cell.type.name !== "tableCell" && cell.type.name !== "tableHeader")
        return;
      const desired = desiredRow?.content?.[cellIndex]?.attrs?.colwidth;
      if (
        !Array.isArray(desired) ||
        sameColumnWidths(cell.attrs.colwidth, desired)
      )
        return;
      transaction.setNodeMarkup(
        tablePos + 1 + rowOffset + 1 + cellOffset,
        undefined,
        { ...cell.attrs, colwidth: desired },
      );
      changed = true;
    });
  });
  return changed;
}

/**
 * Where a split can cut the table itself: the position between the last row
 * of the first table and the first of the second, when both halves are the
 * table's own rows as they stand (no merged cell carried across the cut, no
 * page fragment retagged) -- else null, and the split rebuilds the halves.
 *
 * Word splits a table by cutting it: its rows are not deleted and inserted
 * again, and with Track Changes on only the paragraph (and the break) put
 * between the halves is an insertion. Rebuilt as two new tables, Track
 * Changes recorded every row of the table as deleted and every row of the
 * second table as inserted, and the first kept the source table's identity
 * beside the deleted one (corpus R498-D57 WALK1: a column break typed in a
 * 62-row table; the save refused the duplicated source table).
 * `window.__docsStructuralTableSplitOff = true` rebuilds as before.
 */
function structuralTableSplitAt(
  table: ProseMirrorNode,
  pos: number,
  plan: TableSplitPlan,
): number | null {
  if (
    typeof window !== "undefined" &&
    (window as Window & { __docsStructuralTableSplitOff?: boolean }).__docsStructuralTableSplitOff === true
  ) {
    return null;
  }
  if (!plan.head || plan.retagged.length > 0) return null;
  const rows = (table.toJSON() as TableJsonNode).content ?? [];
  const headRows = plan.head.content ?? [];
  const tailRows = plan.tail.content ?? [];
  if (
    headRows.length === 0 ||
    tailRows.length === 0 ||
    headRows.length + tailRows.length !== rows.length ||
    JSON.stringify(headRows) !== JSON.stringify(rows.slice(0, headRows.length)) ||
    JSON.stringify(tailRows) !== JSON.stringify(rows.slice(headRows.length))
  ) {
    return null;
  }
  let cut = pos + 1;
  for (let index = 0; index < headRows.length; index += 1) cut += table.child(index).nodeSize;
  return cut;
}

/** Cut the table at `cut` and put `between` (the empty paragraph, the
 * break) between the halves; each half takes the attributes the plan gives
 * it (the second one is a new table, Word: Split returns it). */
function splitTableInPlace(
  tr: Transaction,
  pos: number,
  cut: number,
  plan: TableSplitPlan,
  between: ProseMirrorNode | readonly ProseMirrorNode[],
): void {
  tr.split(cut, 1);
  const tailPos = cut + 1;
  const tail = tr.doc.nodeAt(tailPos);
  if (tail?.type.name === "table") {
    tr.setNodeMarkup(tailPos, undefined, { ...tail.attrs, ...(plan.tail.attrs ?? {}) });
  }
  const head = tr.doc.nodeAt(pos);
  if (head?.type.name === "table" && plan.head) {
    tr.setNodeMarkup(pos, undefined, { ...head.attrs, ...(plan.head.attrs ?? {}) });
  }
  tr.insert(tailPos, Array.isArray(between) ? Fragment.fromArray([...between]) : (between as ProseMirrorNode));
}

/** Meta of a Split Table transaction; its history boundary is closed after. */
const TABLE_SPLIT_META = "documentTableSplit";

interface TableSplitPlan {
  /** The first table, or null when the split falls on a page boundary. */
  readonly head: TableJsonNode | null;
  readonly tail: TableJsonNode;
  /** Other page fragments whose table attributes change with the split. */
  readonly retagged: ReadonlyArray<{
    readonly pos: number;
    readonly attrs: Record<string, unknown>;
  }>;
}

/** The nodes replacing the table: [first table?, empty paragraph (or the
 * break a page break in the table puts there), second]. */
function tableSplitNodes(
  schema: EditorState["schema"],
  plan: TableSplitPlan,
  between?: readonly ProseMirrorNode[],
): ProseMirrorNode[] | null {
  const paragraphType = schema.nodes.paragraph;
  if (!paragraphType) return null;
  try {
    const nodes = [
      ...(plan.head ? [schema.nodeFromJSON(plan.head)] : []),
      ...(between ?? [paragraphType.create()]),
      schema.nodeFromJSON(plan.tail),
    ];
    for (const node of nodes) {
      node.check();
      if (node.type.name === "table" && TableMap.get(node).problems) return null;
    }
    return nodes;
  } catch {
    return null;
  }
}

function freshTableFragmentId(state: EditorState): string {
  const occupied = new Set<string>();
  state.doc.descendants((node) => {
    const id = node.attrs?.[TABLE_FRAGMENT_ID_ATTR];
    if (typeof id === "string" && id) occupied.add(id);
    return !node.isTextblock;
  });
  for (let ordinal = 1; ; ordinal += 1) {
    const candidate = `table-split-${ordinal}`;
    if (!occupied.has(candidate)) return candidate;
  }
}

/**
 * Word "Split Table" on the table the caret is in, as a plan: the row the
 * caret is in starts the second table, an empty paragraph goes between them
 * (`Table.Split` "inserts an empty paragraph immediately above the specified
 * row"), and the caret goes into that paragraph.
 *
 * A table the page layout has cut across pages is one logical table whose
 * physical fragments share a `pageTableFragmentId`, and the storage merge
 * joins every table carrying the same id. The two tables a split creates are
 * two logical tables, so they must never share it: the first table stays with
 * the fragments before it (or becomes independent), the second with the
 * fragments after it (under a new id when both sides continue), and a table
 * with no remaining fragments drops the page-layout state altogether. Keeping
 * the old id on both halves made the save join them again.
 *
 * Null when the split is not possible: the caret in the first row, or in a
 * layout-only row of a fragment (a repeated header, the second half of a row
 * the page cut), or a vertical merge that the page layout already carries
 * across a page boundary and the split would cut again.
 */
function planTableSplit(
  state: EditorState,
  found: EnclosingTable,
): TableSplitPlan | null {
  if (!state.schema.nodes.paragraph) return null;
  const table = found.node;
  const splitRow = found.rowIndex;
  if (splitRow < 0 || splitRow >= table.childCount) return null;
  const fragmentId = table.attrs[TABLE_FRAGMENT_ID_ATTR];
  const paged = typeof fragmentId === "string" && fragmentId.length > 0;
  let map: TableMap;
  try {
    map = TableMap.get(table);
  } catch {
    return null;
  }
  if (map.problems) return null;

  const fragments = paged ? logicalTableFragmentsAt(state.doc, found.pos) : [];
  const index = fragments.findIndex(({ pos }) => pos === found.pos);
  const before = index > 0 ? fragments.slice(0, index) : [];
  const after = index >= 0 ? fragments.slice(index + 1) : [];
  let leadingClones = 0;
  while (
    leadingClones < table.childCount &&
    table.child(leadingClones).attrs[TABLE_REPEATED_HEADER_ATTR] === true
  ) {
    leadingClones += 1;
  }
  // The caret on the first real row of a later page: the split falls on the
  // page boundary, the fragments before are the whole first table.
  const atPageBoundary = before.length > 0 && splitRow === leadingClones;
  if (!atPageBoundary && splitRow <= leadingClones) return null;

  if (paged) {
    const row = table.child(splitRow);
    if (row.attrs[TABLE_ROW_CONTINUATION_ATTR] === true) return null;
    const seen = new Set<number>();
    for (const offset of map.map) {
      if (seen.has(offset)) continue;
      seen.add(offset);
      const rect = map.findCell(offset);
      const cell = table.nodeAt(offset);
      if (!cell) return null;
      const carriedIn = cell.attrs[TABLE_VERTICAL_CONTINUATION_ATTR] === true;
      const carried =
        carriedIn || (cell.attrs[TABLE_ORIGINAL_ROWSPAN_ATTR] ?? null) !== null;
      const crosses = rect.top < splitRow && rect.bottom > splitRow;
      if ((crosses && carried) || (rect.top === splitRow && carriedIn)) {
        return null;
      }
    }
  }

  const json = table.toJSON() as TableJsonNode;
  let head: TableJsonNode | null;
  let tail: TableJsonNode;
  if (atPageBoundary) {
    const tailAttrs = { ...(json.attrs ?? {}) };
    for (const key of ["block_id", "source"]) {
      if (key in tailAttrs) tailAttrs[key] = null;
    }
    head = null;
    tail = {
      ...json,
      attrs: tailAttrs,
      content: (json.content ?? []).slice(splitRow),
    };
  } else {
    // The grid split itself; the pagination identity of each half is
    // decided below from the fragments around this one.
    const parts = splitTableAtRow(
      paged
        ? { ...json, attrs: { ...(json.attrs ?? {}), [TABLE_FRAGMENT_ID_ATTR]: null } }
        : json,
      splitRow,
    );
    if (parts.length < 2) return null;
    head = parts[0] as TableJsonNode;
    tail = parts[1] as TableJsonNode;
  }

  const retagged: Array<{ pos: number; attrs: Record<string, unknown> }> = [];
  if (paged) {
    if (head && before.length > 0) {
      head = {
        ...head,
        attrs: {
          ...(head.attrs ?? {}),
          [TABLE_FRAGMENT_ID_ATTR]: fragmentId,
          [TABLE_CONTINUES_ATTR]: false,
        },
      };
    } else if (head) {
      head = detachTableFragmentJson(head);
    } else {
      retagged.push({
        pos: before[before.length - 1].pos,
        attrs: { [TABLE_CONTINUES_ATTR]: false },
      });
    }
    if (after.length > 0) {
      const tailId =
        before.length > 0 ? freshTableFragmentId(state) : (fragmentId as string);
      tail = {
        ...tail,
        attrs: {
          ...(tail.attrs ?? {}),
          [TABLE_FRAGMENT_ID_ATTR]: tailId,
          [TABLE_CONTINUATION_ATTR]: false,
        },
      };
      for (const fragment of after) {
        retagged.push({
          pos: fragment.pos,
          attrs: {
            [TABLE_FRAGMENT_ID_ATTR]: tailId,
            // The second table is a new table (Word: Split returns it).
            ...("source" in fragment.node.attrs ? { source: null } : {}),
          },
        });
      }
    } else {
      tail = detachTableFragmentJson(tail);
    }
  }
  return { head, tail, retagged };
}

/** A non-empty text selection inside one table cell, collapsed to its end in `direction`. */
function collapseCellTextSelection(
  state: EditorState,
  dispatch: (tr: Transaction) => void,
  direction: 1 | -1,
): boolean {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || selection.empty) return false;
  const cellDepth = (depth: number): boolean => {
    const role = selection.$head.node(depth).type.spec.tableRole;
    return role === "cell" || role === "header_cell";
  };
  let inCell = false;
  for (let depth = selection.$head.depth; depth > 0 && !inCell; depth -= 1) inCell = cellDepth(depth);
  if (!inCell) return false;
  const at = direction > 0 ? selection.to : selection.from;
  dispatch(state.tr.setSelection(TextSelection.create(state.doc, at)).scrollIntoView());
  return true;
}

/**
 * A text selection anchored outside the table its head is in, extended one
 * step further in `direction`: the head goes past the table (the start of
 * the block after it, or the end of the block before it). False when the
 * selection is not of that shape, for the default handling.
 */
function extendSelectionPastTable(
  state: EditorState,
  dispatch: (tr: Transaction) => void,
  direction: 1 | -1,
): boolean {
  const { selection, doc } = state;
  if (!(selection instanceof TextSelection) || selection.empty) return false;
  const { $head } = selection;
  let tableDepth = -1;
  for (let depth = $head.depth; depth > 0; depth -= 1) {
    if ($head.node(depth).type.spec.tableRole === "table") tableDepth = depth;
  }
  if (tableDepth < 0) return false;
  const tableStart = $head.before(tableDepth);
  const tableEnd = $head.after(tableDepth);
  const anchor = selection.anchor;
  // Only a selection that came from outside the table, moving on away from
  // where it started.
  if (direction > 0 ? anchor >= tableStart : anchor <= tableEnd) return false;
  const past =
    direction > 0
      ? Selection.findFrom(doc.resolve(tableEnd), 1, true)
      : Selection.findFrom(doc.resolve(tableStart), -1, true);
  if (!(past instanceof TextSelection)) return false;
  const head = direction > 0 ? past.$from.start() : past.$from.end();
  dispatch(state.tr.setSelection(TextSelection.create(doc, anchor, head)).scrollIntoView());
  return true;
}

const TableStructure = Extension.create({
  name: "tableStructure",

  // Registered after the Table extension at the same priority, so these run
  // before its Backspace/Delete (which deletes a fully selected table on
  // either key) and prosemirror-tables' (which clears the cells on either).
  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) =>
        editor.isEditable &&
        backspaceDocumentTableSelection(editor.state, editor.view.dispatch, () =>
          openDocumentTableDeleteCellsDialog(editor, editor.state),
        ),
      Delete: ({ editor }) =>
        editor.isEditable &&
        clearDocumentTableCells(editor.state, editor.view.dispatch),
      // Right / Left on selected text in a cell collapse it to its end, as
      // everywhere else. prosemirror-tables moved a selection that ends at
      // the cell's end on into the next cell, and typing then went there
      // (WUA 078).
      ArrowRight: ({ editor }) => collapseCellTextSelection(editor.state, editor.view.dispatch, 1),
      ArrowLeft: ({ editor }) => collapseCellTextSelection(editor.state, editor.view.dispatch, -1),
      // Shift+Down / Shift+Up extending a selection that started outside a
      // table and already reaches into it go on past the table, as Word
      // extends over its rows. The browser moved the head into the next
      // cell's start, where prosemirror-tables' normalization rewrote the
      // selection to the paragraph it started in: the table left the
      // selection and the start jumped to the paragraph's start (WUA 070).
      "Shift-ArrowDown": ({ editor }) => extendSelectionPastTable(editor.state, editor.view.dispatch, 1),
      "Shift-ArrowUp": ({ editor }) => extendSelectionPastTable(editor.state, editor.view.dispatch, -1),
    };
  },

  addProseMirrorPlugins() {
    const recomputeMeta = "documentTableAutofitContentsRecompute";
    return [
      // Word's row and column selection pointers beside a table.
      createDocumentTableSelectZonesPlugin(),
      // A centred or bottom-aligned cell in an exact-height row (WUA 111).
      createExactRowCellAlignmentPlugin(),
      new Plugin({
        props: {
          handleDOMEvents: {
            // Cut copies the selected cells as the default cut does, then
            // takes a whole table, whole rows or whole columns out instead of
            // leaving them empty.
            cut: (view, event) => {
              const { state } = view;
              // A table on one page is selected as its cells; one cut over
              // pages, as the text of all its parts.
              if (!view.editable) return false;
              const data = (event as ClipboardEvent).clipboardData;
              if (!data || !cutDocumentTableSelection(state)) return false;
              const serialize = (view as unknown as {
                serializeForClipboard?: (slice: Slice) => { dom: HTMLElement; text: string };
              }).serializeForClipboard;
              if (typeof serialize !== "function") return false;
              const { dom, text } = serialize.call(view, state.selection.content());
              event.preventDefault();
              data.clearData();
              data.setData("text/html", dom.innerHTML);
              data.setData("text/plain", text);
              return cutDocumentTableSelection(state, (tr) =>
                view.dispatch(tr.setMeta("uiEvent", "cut").scrollIntoView()),
              );
            },
          },
        },
      }),
      new Plugin({
        // Close the history group after Split Table (and a row, column or
        // table deletion) as well, so typing that follows at once is its own
        // Undo step (closeHistory on the command's transaction only separates
        // it from what came before).
        appendTransaction: imeReplayingAppendTransaction((transactions, _oldState, newState) =>
          transactions.some(
            (transaction) =>
              transaction.getMeta(TABLE_SPLIT_META) === true ||
              transaction.getMeta(DOCUMENT_TABLE_OWN_UNDO_STEP_META) === true,
          )
            ? closeHistory(newState.tr)
            : null,
        ),
      }),
      new Plugin({
        // Autofit rewrites the widths of the cell being typed in. While an
        // IME owns that cell's DOM the redraw commits the raw pinyin as text;
        // the widths re-derive from the settled document, so the guard's
        // settle wake-up recomputes them once the candidate is committed.
        appendTransaction: imeSafeAppendTransaction((transactions, _oldState, newState) => {
          if (
            !transactions.some(
              (transaction) =>
                transaction.docChanged ||
                transaction.getMeta(IME_COMPOSITION_SETTLED_META) === true,
            ) ||
            transactions.some(
              (transaction) => transaction.getMeta(recomputeMeta) === true,
            )
          ) {
            return null;
          }
          const transaction = newState.tr;
          let changed = false;
          // Each table follows its own policy, nested tables included (a
          // table in a cell is its own Word table with its own AutoFit);
          // the walk descends past every table to reach them. Only
          // attributes change, so positions stay valid across the walk.
          newState.doc.descendants((node, pos) => {
            if (node.type.name !== "table") return !node.isTextblock;
            if (node.attrs.tableLayoutPolicy !== "autofit_contents")
              return true;
            const policy: DocumentTableLayoutPolicy = {
              schemaVersion: 1,
              mode: "autofit_contents",
            };
            if (!proseMirrorTableAdmitsDensePolicy(node, policy)) return true;
            if (readWordTableLayout(node.attrs)?.contentFit) {
              changed = restoreWordGridColumnWidths(transaction, node, pos) || changed;
              return true;
            }
            changed =
              applyAutoFitContentWidths(transaction, node, pos) || changed;
            return true;
          });
          if (!changed) return null;
          transaction.setMeta(recomputeMeta, true);
          transaction.setMeta("addToHistory", false);
          return transaction;
        }),
      }),
    ];
  },

  // Register the on-page alignment attribute on the `table` node here (rather
  // than extending the Table extension) so the whitelist + command live in one
  // place. ADDITIVE: a left-aligned (default) table carries no `data-table-align`
  // attribute and renders byte-for-byte unchanged; only "center"/"right" are
  // stored. The value is whitelisted on parse AND render so a forged attribute or
  // pasted markup can never push arbitrary CSS into the table's inline style.
  addGlobalAttributes() {
    return [
      {
        types: ["table"],
        attributes: {
          tableAlign: {
            default: null,
            parseHTML: (element: HTMLElement) => {
              const explicit = element.getAttribute("data-table-align");
              if (explicit) return normalizeTableAlign(explicit);
              // Recover the alignment from the auto-margin CSS on a round-trip.
              const ml = element.style?.marginLeft;
              const mr = element.style?.marginRight;
              if (ml === "auto" && mr === "auto") return "center";
              if (ml === "auto") return "right";
              return null;
            },
            renderHTML: (attrs: Record<string, unknown>) => {
              const align = normalizeTableAlign(attrs.tableAlign);
              if (!align) return {};
              return {
                "data-table-align": align,
                style: tableAlignStyle(align),
              };
            },
          },
          tableIndentPx: {
            default: null,
            parseHTML: (element: HTMLElement) =>
              normalizeTableIndentPx(
                element.getAttribute("data-table-indent-px") ??
                  Number.parseFloat(element.style.marginLeft),
              ),
            renderHTML: (attrs: Record<string, unknown>) => {
              if (normalizeTableAlign(attrs.tableAlign)) return {};
              const indent = normalizeTableIndentPx(attrs.tableIndentPx);
              return indent === null
                ? {}
                : {
                    "data-table-indent-px": String(indent),
                    style: tableIndentStyle(indent),
                  };
            },
          },
          tableIndentTwips: {
            default: null,
            parseHTML: (element: HTMLElement) =>
              normalizeTableIndentTwips(
                element.getAttribute("data-table-indent-twips"),
              ),
            renderHTML: (attrs: Record<string, unknown>) => {
              const twips = normalizeTableIndentTwips(attrs.tableIndentTwips);
              return twips === null
                ? {}
                : { "data-table-indent-twips": String(twips) };
            },
          },
          tableCellSpacingPx: {
            default: null,
            parseHTML: (element: HTMLElement) =>
              normalizeTableCellSpacingPx(
                element.getAttribute("data-table-cell-spacing-px") ??
                  Number.parseFloat(element.style.borderSpacing),
              ),
            renderHTML: (attrs: Record<string, unknown>) => {
              const spacing = normalizeTableCellSpacingPx(
                attrs.tableCellSpacingPx,
              );
              return spacing === null
                ? {}
                : {
                    "data-table-cell-spacing-px": String(spacing),
                    style: [
                      "border-collapse: separate",
                      // Word's "spacing between cells" is applied on both
                      // sides of a cell: the gap between two cells, and
                      // between a cell and the table's frame, is twice it
                      // (Word 16 b-table: 0.05in spacing, 7.2pt gaps).
                      // Chrome floors border-spacing to whole pixels (9.6px
                      // drew 9px); the nearest pixel is closer to Word.
                      `border-spacing: ${Math.max(1, Math.round(spacing * 2))}px`,
                      // Word frames a spaced table with its outer borders.
                      ...tableCellSpacingFrameCss(attrs.tableBorders),
                    ].join("; "),
                  };
            },
          },
          tableCellSpacingTwips: {
            default: null,
            parseHTML: (element: HTMLElement) =>
              normalizeTableCellSpacingTwips(
                element.getAttribute("data-table-cell-spacing-twips"),
              ),
            renderHTML: (attrs: Record<string, unknown>) => {
              const twips = normalizeTableCellSpacingTwips(
                attrs.tableCellSpacingTwips,
              );
              return twips === null
                ? {}
                : { "data-table-cell-spacing-twips": String(twips) };
            },
          },
          // Word's Borders and Shading > Shading applied to the whole table
          // (`w:tblPr/w:shd`): a fill and/or pattern under every cell that has
          // no shading of its own.
          tableShading: {
            default: null,
            parseHTML: (element: HTMLElement) => {
              const raw = element.getAttribute("data-table-shading");
              if (!raw) return null;
              try {
                return normalizeTableShading(JSON.parse(raw));
              } catch {
                return null;
              }
            },
            renderHTML: (attrs: Record<string, unknown>) => {
              const shading = normalizeTableShading(attrs.tableShading);
              if (!shading) return {};
              const css = shadingCss(shading.fill, shading);
              const declarations = [
                css.backgroundColor ? `background-color: ${css.backgroundColor}` : "",
                css.backgroundImage ? `background-image: ${css.backgroundImage}` : "",
              ].filter(Boolean);
              return {
                "data-table-shading": JSON.stringify(shading),
                ...(declarations.length ? { style: declarations.join("; ") } : {}),
              };
            },
          },
          // Word's Table Options > "Automatically resize to fit contents"
          // (`w:tblLayout`): "autofit" lets Word grow columns with their
          // content, "fixed" keeps the column widths. `null` = the writer's
          // own default for the table's shape, so existing tables are
          // unchanged. The editor keeps drawing the stored column widths
          // (AutoFit to contents is the tableLayoutPolicy command).
          tableLayoutType: {
            default: null,
            parseHTML: (element: HTMLElement) => {
              const value = element.getAttribute("data-table-layout-type");
              return value === "fixed" || value === "autofit" ? value : null;
            },
            renderHTML: (attrs: Record<string, unknown>) =>
              attrs.tableLayoutType === "fixed" || attrs.tableLayoutType === "autofit"
                ? { "data-table-layout-type": attrs.tableLayoutType }
                : {},
          },
          tablePositioning: {
            default: null,
            parseHTML: (element: HTMLElement) => {
              const raw = element.getAttribute("data-table-positioning");
              if (!raw) return null;
              try {
                return normalizeTablePositioning(JSON.parse(raw));
              } catch {
                return null;
              }
            },
            renderHTML: (attrs: Record<string, unknown>) => {
              const serialized = serializeTablePositioning(
                attrs.tablePositioning,
              );
              if (!serialized) return {};
              const style = tablePositioningCss(attrs.tablePositioning);
              const inlineFloat = tablePositioningInlineFloat(
                attrs.tablePositioning,
              );
              return {
                "data-table-positioning": serialized,
                ...(style && inlineFloat
                  ? {
                      "data-table-positioning-projection": inlineFloat,
                      style,
                    }
                  : {}),
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      // The Table extension's commands of the same name, replaced for the
      // Docs editor (this extension's commands are merged after the Table
      // extension's): they act on the logical table across page fragments,
      // delete the table with its last row or column, and leave the caret in
      // the cell that takes the deleted one's place. The ribbon, the AI
      // document operations and Backspace share them.
      // Insert Left / Insert Right add the column to the LOGICAL table: the
      // same column of every page fragment, so the fragments keep one grid
      // and merge back as one table. The Table extension's own command added
      // it to the caret's fragment only, and the rows on the other page then
      
      addColumnBefore:
        () =>
        ({ state, tr, dispatch }) =>
          insertLogicalTableColumn(state, tr, dispatch, "before"),
      addColumnAfter:
        () =>
        ({ state, tr, dispatch }) =>
          insertLogicalTableColumn(state, tr, dispatch, "after"),
      addRowBefore:
        () =>
        ({ state, tr, dispatch }) =>
          insertTableRowLikeReference(state, tr, dispatch, "before"),
      addRowAfter:
        () =>
        ({ state, tr, dispatch }) =>
          insertTableRowLikeReference(state, tr, dispatch, "after"),
      deleteRow:
        () =>
        ({ state, dispatch }) =>
          deleteDocumentTableRows(state, dispatch),
      deleteColumn:
        () =>
        ({ state, dispatch }) =>
          deleteDocumentTableColumns(state, dispatch),
      deleteTable:
        () =>
        ({ state, dispatch }) =>
          deleteDocumentTable(state, dispatch),
      splitTableAtCursor:
        () =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const found = findEnclosingTable(state);
          if (!found) return false;
          if (!proseMirrorTableAdmitsDensePolicy(found.node)) return false;
          const plan = planTableSplit(state, found);
          // No-op when the cursor's row cannot start a second table.
          if (!plan) return false;
          if (dispatch) {
            const nodes = tableSplitNodes(state.schema, plan);
            if (!nodes) return false;
            // Split Table is one author operation, its own Undo step: never
            // folded into the typing just before it (or just after it).
            const cut = structuralTableSplitAt(found.node, found.pos, plan);
            const transaction = closeHistory(tr);
            if (cut !== null) {
              splitTableInPlace(transaction, found.pos, cut, plan, nodes[plan.head ? 1 : 0]);
            } else {
              transaction.replaceWith(found.pos, found.pos + found.node.nodeSize, nodes);
            }
            for (const fragment of plan.retagged) {
              const pos = transaction.mapping.map(fragment.pos);
              const node = transaction.doc.nodeAt(pos);
              if (node?.type.name !== "table") continue;
              transaction.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                ...fragment.attrs,
              });
            }
            // Word leaves the insertion point in the paragraph it inserts
            // between the two tables.
            const caretOffset = (plan.head ? nodes[0].nodeSize : 0) + 1;
            transaction.setSelection(
              TextSelection.create(transaction.doc, found.pos + caretOffset),
            );
            transaction.setMeta(TABLE_SPLIT_META, true);
            dispatch(transaction.scrollIntoView());
          }
          return true;
        },
      distributeTableColumns:
        () =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const found = findEnclosingTable(state);
          if (!found) return false;
          if (!proseMirrorTableAdmitsDensePolicy(found.node)) return false;
          const selectedColumns = distributedPhysicalColumnIndexes(
            state,
            found,
          );
          if (!selectedColumns) return false;
          const json = found.node.toJSON() as Record<string, unknown>;
          const rendered =
            materializedColumnWidths(json) === null
              ? renderedColumnWidths(editor, found)
              : null;
          const next = distributeColumnsEvenly(
            rendered ? seedMissingColumnWidths(json, rendered) : json,
            selectedColumns,
          );
          if (next === json) return false;
          if (dispatch) {
            const replacement = state.schema.nodeFromJSON(
              next as Parameters<typeof state.schema.nodeFromJSON>[0],
            );
            let transaction = closeHistory(tr).replaceWith(
              found.pos,
              found.pos + found.node.nodeSize,
              replacement,
            );
            try {
              if (state.selection instanceof CellSelection) {
                const nextTable = transaction.doc.nodeAt(found.pos);
                if (!nextTable || nextTable.type.name !== "table") return false;
                const nextMap = TableMap.get(nextTable);
                if (nextMap.problems !== null) return false;
                const left = selectedColumns[0];
                const right = selectedColumns[selectedColumns.length - 1] + 1;
                const tableStart = found.pos + 1;
                const $anchorCell = transaction.doc.resolve(
                  tableStart + nextMap.map[left],
                );
                const $headCell = transaction.doc.resolve(
                  tableStart +
                    nextMap.map[
                      (nextMap.height - 1) * nextMap.width + (right - 1)
                    ],
                );
                transaction = transaction.setSelection(
                  CellSelection.colSelection($anchorCell, $headCell),
                );
              } else {
                transaction = transaction.setSelection(
                  selectionAfterTableReplacement(
                    state.selection,
                    transaction,
                    replacement.nodeSize === found.node.nodeSize,
                  ),
                );
              }
            } catch {
              return false;
            }
            dispatch(transaction.scrollIntoView());
          }
          return true;
        },
      distributeTableRows:
        () =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const found = findEnclosingTable(state);
          if (!found) return false;
          if (!proseMirrorTableAdmitsDensePolicy(found.node)) return false;
          const selectedRows = distributedPhysicalRowIndexes(state, found);
          if (!selectedRows) return false;
          const json = found.node.toJSON() as Record<string, unknown>;
          // Word 16 (`distribute row height`, measured): the rows take the
          // average of their heights, the table keeping its total, unless a
          // row's content needs more; then every row is as tall as that
          // content, so they come out equal. Setting the average alone left
          // a row holding a nested table taller than the rest (WUA 042).
          // Exact rows clip their content, so only the average counts.
          const live = measureDistributedRows(this.editor, found, selectedRows);
          const exact =
            normalizeTableRowHeightRule(
              found.node.child(selectedRows[0])?.attrs.rowHeightRule,
            ) === "exact";
          const contentFloor = live && !exact ? live.tallestContent : 0;
          const targetHeight = selectedRowsNeedMaterializedHeight(
            json,
            selectedRows,
          )
            ? live
              ? Math.max(live.average, contentFloor)
              : DEFAULT_TABLE_ROW_HEIGHT
            : live && contentFloor > live.average
              ? contentFloor
              : undefined;
          const next = distributeRowsEvenly(json, targetHeight, selectedRows);
          // Rows already even: Word's command stays available and changes
          // nothing (it was disabled as "cannot be adjusted safely").
          if (next === json) return selectedRowsAlreadyEven(found.node, selectedRows);
          if (dispatch) {
            const replacement = state.schema.nodeFromJSON(
              next as Parameters<typeof state.schema.nodeFromJSON>[0],
            );
            let transaction = closeHistory(tr).replaceWith(
              found.pos,
              found.pos + found.node.nodeSize,
              replacement,
            );
            try {
              if (state.selection instanceof CellSelection) {
                const nextTable = transaction.doc.nodeAt(found.pos);
                if (!nextTable || nextTable.type.name !== "table") return false;
                const nextMap = TableMap.get(nextTable);
                if (nextMap.problems !== null) return false;
                const top = selectedRows[0];
                const bottom = selectedRows[selectedRows.length - 1] + 1;
                const tableStart = found.pos + 1;
                const $anchorCell = transaction.doc.resolve(
                  tableStart + nextMap.map[top * nextMap.width],
                );
                const $headCell = transaction.doc.resolve(
                  tableStart +
                    nextMap.map[
                      (bottom - 1) * nextMap.width + (nextMap.width - 1)
                    ],
                );
                transaction = transaction.setSelection(
                  CellSelection.rowSelection($anchorCell, $headCell),
                );
              } else {
                transaction = transaction.setSelection(
                  selectionAfterTableReplacement(
                    state.selection,
                    transaction,
                    replacement.nodeSize === found.node.nodeSize,
                  ),
                );
              }
            } catch {
              return false;
            }
            dispatch(transaction.scrollIntoView());
          }
          return true;
        },
      autoFitTableContents:
        () =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const found = findEnclosingTable(state);
          if (!found) return false;
          const policy: DocumentTableLayoutPolicy = {
            schemaVersion: 1,
            mode: "autofit_contents",
          };
          if (!proseMirrorTableAdmitsDensePolicy(found.node, policy))
            return false;
          const json = found.node.toJSON() as Record<string, unknown>;
          const next = autoFitTableContents(json);
          if (next === json) return false;
          if (dispatch) {
            const replacement = state.schema.nodeFromJSON(
              next as Parameters<typeof state.schema.nodeFromJSON>[0],
            );
            tr.replaceWith(
              found.pos,
              found.pos + found.node.nodeSize,
              replacement,
            );
            tr.setSelection(
              selectionAfterTableReplacement(
                state.selection,
                tr,
                replacement.nodeSize === found.node.nodeSize,
              ),
            );
            dispatch(tr);
          }
          return true;
        },
      autoFitTableWindow:
        (totalWidth?: number) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const found = findEnclosingTable(state);
          if (!found) return false;
          const policy: DocumentTableLayoutPolicy = {
            schemaVersion: 1,
            mode: "autofit_window",
          };
          if (!proseMirrorTableAdmitsDensePolicy(found.node, policy))
            return false;
          const json = found.node.toJSON() as Record<string, unknown>;
          const next = autoFitTableWindow(json, totalWidth);
          if (next === json) return false;
          if (dispatch) {
            const replacement = state.schema.nodeFromJSON(
              next as Parameters<typeof state.schema.nodeFromJSON>[0],
            );
            tr.replaceWith(
              found.pos,
              found.pos + found.node.nodeSize,
              replacement,
            );
            tr.setSelection(
              selectionAfterTableReplacement(
                state.selection,
                tr,
                replacement.nodeSize === found.node.nodeSize,
              ),
            );
            dispatch(tr);
          }
          return true;
        },
      fixTableColumnWidths:
        () =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const found = findEnclosingTable(state);
          if (!found) return false;
          if (!proseMirrorTableAdmitsDensePolicy(found.node)) return false;
          const json = found.node.toJSON() as Record<string, unknown>;
          const next = fixTableColumnWidths(json);
          if (next === json) return false;
          if (dispatch) {
            const replacement = state.schema.nodeFromJSON(
              next as Parameters<typeof state.schema.nodeFromJSON>[0],
            );
            tr.replaceWith(
              found.pos,
              found.pos + found.node.nodeSize,
              replacement,
            );
            tr.setSelection(
              selectionAfterTableReplacement(
                state.selection,
                tr,
                replacement.nodeSize === found.node.nodeSize,
              ),
            );
            dispatch(tr);
          }
          return true;
        },
      setTableLayoutPolicy:
        (policy, totalWidth) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const found = findEnclosingTable(state);
          if (!found) return false;
          if (!proseMirrorTableAdmitsDensePolicy(found.node, policy))
            return false;
          const json = found.node.toJSON() as Record<string, unknown>;
          const next = applyDocumentTableLayoutPolicy(json, policy, totalWidth);
          if (next === json) return false;
          if (dispatch) {
            const replacement = state.schema.nodeFromJSON(
              next as Parameters<typeof state.schema.nodeFromJSON>[0],
            );
            tr.replaceWith(
              found.pos,
              found.pos + found.node.nodeSize,
              replacement,
            );
            tr.setSelection(
              selectionAfterTableReplacement(
                state.selection,
                tr,
                replacement.nodeSize === found.node.nodeSize,
              ),
            );
            dispatch(tr);
          }
          return true;
        },
      setTableAlign:
        (value) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const found = findEnclosingTable(state);
          if (!found) return false;
          const next = normalizeTableAlign(value);
          // No-op when unchanged (keeps the document byte-for-byte stable and
          // avoids a spurious undo step). setNodeMarkup preserves the table's
          // CONTENT (rows/cells) — only the node attrs change.
          if (
            ((found.node.attrs.tableAlign as unknown) ?? null) ===
            (next ?? null)
          ) {
            return false;
          }
          if (dispatch) {
            tr.setNodeMarkup(found.pos, undefined, {
              ...found.node.attrs,
              tableAlign: next,
              ...(next ? { tableIndentPx: null, tableIndentTwips: null } : {}),
            });
            dispatch(tr);
          }
          return true;
        },
    };
  },
});

export default TableStructure;
