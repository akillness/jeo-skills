"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's keyboard deletion of a table selection, and the Delete Rows /
 * Delete Columns / Delete Table commands, for the Docs editor.
 *
 * Word (Microsoft Support "Delete a table", "Delete a row, column, or cell
 * from a table"; checked against Word for Mac 16):
 *
 * - Backspace on whole rows deletes the rows, on whole columns the columns,
 *   and on the whole table the table. Each is one Undo step.
 * - Delete (forward delete, Word's EditClear) clears the contents of the
 *   selected cells, whole table included; rows, columns and formatting stay.
 * - Backspace on one cell, or on cells that are neither whole rows nor whole
 *   columns, opens Delete Cells: Shift cells left (the default), Shift cells
 *   up, Delete entire row, Delete entire column.
 * - Shift cells left REMOVES the selected cells: the cells to their right move
 *   left and the row ends that many grid columns early. The table grid
 *   (`w:tblGrid`) keeps its columns and the row states the columns it leaves
 *   empty (`w:trPr/w:gridAfter` + `w:wAfter`, ISO/IEC 29500-1 17.4.14 and
 *   17.4.86); Word draws the row's right edge where its last cell ends.
 *   Checked in Word for Mac 16: deleting R2C3 of a 3x3 table writes row 2 as
 *   two `w:tc` with `<w:gridAfter w:val="1"/><w:wAfter w:w="2880"/>`, and a
 *   2x2 block shifted left leaves two one-cell rows with gridAfter 2.
 * - Shift cells up moves the rest of each column up and leaves an EMPTY cell
 *   at the column's bottom; no cell is removed and the table stays
 *   rectangular. Checked the same way, for a middle column and for the last
 *   one: every row still holds three `w:tc`, and the bottom one is empty.
 *
 * The page model keeps the grid dense: the grid columns a row leaves empty
 * are the same marked `gridFiller` cells the DOCX import pads such a row
 * with (tableGridFiller.ts), so an imported ragged row and a row shortened
 * here are one shape, drawn as empty space and written back as gridAfter.
 *
 * Pagination cuts one table into several physical `table` nodes, one per
 * page, sharing `pageTableFragmentId` (paged/tablePagination.ts). A row or a
 * column is a row or a column of the LOGICAL table: a column is removed from
 * every page fragment (the stock command removed it from one, and the save
 * joined rows of two widths), and rows are removed from the joined table, so
 * both halves of a row the page cut go with it. The header rows a later page
 * repeats are read-only copies: selected there they are not deleted, and a
 * column on that page runs from the first row below them. The page layout
 * then cuts the table again.
 */

import { closeHistory } from "@tiptap/pm/history";
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  Selection,
  TextSelection,
  type EditorState,
  type Transaction,
} from "@tiptap/pm/state";
import {
  CellSelection,
  TableMap,
  isInTable,
  removeColumn,
  removeRow,
  selectedRect,
  type TableRect,
} from "@tiptap/pm/tables";
import { Transform } from "@tiptap/pm/transform";
import { readSuggesting, TRACK_CHANGES_SKIP_META } from "./trackChangesExtension";

import {
  logicalTableFragmentsAt,
  logicalTableRowIndexes,
  type TableFragment,
} from "./paged/tableFragmentGroups";
import {
  DOCUMENT_TABLE_GRID_RESHAPE_META,
  isGridFillerCell,
  tableHoldsGridFiller,
} from "./tableGridFiller";
import {
  TABLE_REPEATED_HEADER_ATTR,
  mergeTableContinuationsJson,
  type TableJsonNode,
} from "./paged/tablePagination";

/** A table deletion is its own Undo step: history is closed after it too. */
export const DOCUMENT_TABLE_OWN_UNDO_STEP_META = "documentTableOwnUndoStep";

type Dispatch = ((tr: Transaction) => void) | undefined;

/** What Backspace does to the current CellSelection. */
export type DocumentTableBackspaceTarget = "table" | "rows" | "columns" | "cells";

interface LogicalTable {
  /** The selection's rectangle in the physical table it is in. */
  readonly rect: TableRect;
  /** The page fragments of the logical table, in document order. */
  readonly fragments: readonly TableFragment[];
  /** Index of the selection's physical table in `fragments`. */
  readonly index: number;
}

/**
 * The text a cross-page Select Table selects: from the first fragment's first
 * cell to the last fragment's last cell. A CellSelection lives in one table
 * node, so this is how the whole of a table split over pages is selected.
 */
export function logicalTableTextRange(
  doc: ProseMirrorNode,
  fragments: readonly TableFragment[],
): { from: number; to: number } {
  const head = fragments[0]!;
  const tail = fragments[fragments.length - 1]!;
  const from = head.pos + 1 + TableMap.get(head.node).positionAt(0, 0, head.node) + 1;
  const tailMap = TableMap.get(tail.node);
  const lastCellPos =
    tail.pos + 1 + tailMap.positionAt(tailMap.height - 1, tailMap.width - 1, tail.node);
  return { from, to: lastCellPos + (doc.nodeAt(lastCellPos)?.nodeSize ?? 2) - 1 };
}





export function wholeLogicalTableTextSelection(state: EditorState): TableFragment[] | null {
  const selection = state.selection;
  if (!(selection instanceof TextSelection) || selection.empty) return null;
  const { $from } = selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.spec.tableRole !== "table") continue;
    const fragments = logicalTableFragmentsAt(state.doc, $from.before(depth));
    if (fragments.length < 2) return null;
    // Compared as Select Table sets it: TextSelection.between settles the
    // range's ends on the nearest text positions.
    const range = logicalTableTextRange(state.doc, fragments);
    const selected = TextSelection.between(state.doc.resolve(range.from), state.doc.resolve(range.to));
    return selected.from === selection.from && selected.to === selection.to ? fragments : null;
  }
  return null;
}

function logicalTable(state: EditorState): LogicalTable | null {
  if (!isInTable(state)) return null;
  let rect: TableRect;
  try {
    rect = selectedRect(state);
  } catch {
    return null;
  }
  const tablePos = rect.tableStart - 1;
  const fragments = logicalTableFragmentsAt(state.doc, tablePos);
  const index = fragments.findIndex((fragment) => fragment.pos === tablePos);
  return index < 0 ? null : { rect, fragments, index };
}

function tableRectAt(tr: Transform, tableStart: number): TableRect | null {
  const table = tr.doc.nodeAt(tableStart - 1);
  if (!table || table.type.spec.tableRole !== "table") return null;
  return {
    table,
    tableStart,
    map: TableMap.get(table),
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  };
}

/** prosemirror-tables' row/column removal only uses the Transform API. */
function asTransaction(transform: Transform): Transaction {
  return transform as unknown as Transaction;
}

function removeRows(tr: Transform, tableStart: number, rows: readonly number[]): boolean {
  for (const row of [...rows].sort((left, right) => right - left)) {
    const rect = tableRectAt(tr, tableStart);
    if (!rect || row >= rect.map.height) return false;
    removeRow(asTransaction(tr), rect, row);
  }
  return true;
}

function removeColumns(tr: Transform, tableStart: number, left: number, right: number): boolean {
  for (let column = right - 1; column >= left; column -= 1) {
    const rect = tableRectAt(tr, tableStart);
    if (!rect || column >= rect.map.width) return false;
    removeColumn(asTransaction(tr), rect, column);
  }
  return true;
}

/**
 * Commit `scratch` (built on `state.doc`) to the state's transaction: the
 * caret goes to the start of the cell at (row, column) of the table at
 * `tableStart`, clamped to the remaining grid, or past `fallback` when there
 * is no table there any more.
 */
function commit(
  state: EditorState,
  dispatch: NonNullable<Dispatch>,
  scratch: Transform,
  caret: { tableStart: number; row: number; column: number } | { fallback: number },
  reshapesGrid = false,
  untracked = false,
): void {
  const tr = closeHistory(state.tr);
  for (const step of scratch.steps) tr.step(step);
  if (untracked) tr.setMeta(TRACK_CHANGES_SKIP_META, true);
  let selection: Selection | null = null;
  if ("tableStart" in caret) {
    const rect = tableRectAt(tr, caret.tableStart);
    if (rect && rect.map.height > 0 && rect.map.width > 0) {
      const row = Math.min(Math.max(caret.row, 0), rect.map.height - 1);
      const column = Math.min(Math.max(caret.column, 0), rect.map.width - 1);
      const cellPos = caret.tableStart + rect.map.map[row * rect.map.width + column]!;
      selection = Selection.near(tr.doc.resolve(cellPos + 1), 1);
    }
  } else {
    const pos = Math.min(Math.max(caret.fallback, 0), tr.doc.content.size);
    selection = Selection.near(tr.doc.resolve(pos), 1);
  }
  if (selection) tr.setSelection(selection);
  tr.setMeta(DOCUMENT_TABLE_OWN_UNDO_STEP_META, true);
  if (reshapesGrid) tr.setMeta(DOCUMENT_TABLE_GRID_RESHAPE_META, true);
  dispatch(tr.scrollIntoView());
}

/** The page fragments joined into the one table the save writes. */
function joinedTable(
  state: EditorState,
  fragments: readonly TableFragment[],
): ProseMirrorNode | null {
  try {
    const joined = mergeTableContinuationsJson<TableJsonNode>({
      type: "doc",
      content: fragments.map(({ node }) => node.toJSON() as TableJsonNode),
    });
    if (joined.content?.length !== 1) return null;
    const table = state.schema.nodeFromJSON(joined.content[0]);
    table.check();
    return TableMap.get(table).problems ? null : table;
  } catch {
    return null;
  }
}

/** Delete the table the selection is in: every page fragment of it. */
export function deleteDocumentTable(state: EditorState, dispatch?: Dispatch): boolean {
  const table = logicalTable(state);
  if (!table) return false;
  if (!dispatch) return true;
  const first = table.fragments[0]!;
  const last = table.fragments[table.fragments.length - 1]!;
  const scratch = new Transform(state.doc);
  scratch.delete(first.pos, last.pos + last.node.nodeSize);
  // Word leaves the insertion point where the table was: the paragraph after.
  commit(state, dispatch, scratch, { fallback: scratch.mapping.map(first.pos, -1) });
  return true;
}

/** The grid a row or cell operation rewrites. */
interface GridTarget {
  /** The physical table, or its page fragments joined into one. */
  readonly table: ProseMirrorNode;
  readonly joined: boolean;
  /** The document range `table` stands for. */
  readonly from: number;
  readonly to: number;
  /** Rows of `table` the selection covers, ascending. */
  readonly rows: readonly number[];
  readonly left: number;
  readonly right: number;
}

function gridTarget(state: EditorState): GridTarget | null {
  const table = logicalTable(state);
  if (!table) return null;
  const { rect, fragments, index } = table;
  if (fragments.length < 2) {
    const from = rect.tableStart - 1;
    return {
      table: rect.table,
      joined: false,
      from,
      to: from + rect.table.nodeSize,
      rows: Array.from({ length: rect.bottom - rect.top }, (_, offset) => rect.top + offset),
      left: rect.left,
      right: rect.right,
    };
  }
  const logical = logicalTableRowIndexes(fragments);
  const rows = new Set<number>();
  for (let row = rect.top; row < rect.bottom; row += 1) {
    // A header row repeated on a later page is a read-only copy of the
    // table's first rows: selecting it there does not delete or move them.
    if (rect.table.child(row).attrs[TABLE_REPEATED_HEADER_ATTR] === true) continue;
    const logicalRow = logical.rows[index]?.[row];
    if (logicalRow === null || logicalRow === undefined) return null;
    rows.add(logicalRow);
  }
  if (rows.size === 0) return null;
  const joined = joinedTable(state, fragments);
  if (!joined || TableMap.get(joined).height !== logical.count) return null;
  const last = fragments[fragments.length - 1]!;
  return {
    table: joined,
    joined: true,
    from: fragments[0]!.pos,
    to: last.pos + last.node.nodeSize,
    rows: [...rows].sort((left, right) => left - right),
    left: rect.left,
    right: rect.right,
  };
}

/**
 * The page fragments of the caret's table joined into one table in `tr` (the
 * page layout cuts it again), for a row inserted where the pages cut a row or a
 * merged cell. Returns the joined table's position and the selection's rows and
 * columns in its grid; `null` when the fragments cannot be read as one grid.
 */
export function joinTableFragmentsForRowInsert(
  state: EditorState,
  tr: Transaction,
): { tablePos: number; rows: readonly number[]; left: number; right: number } | null {
  const target = gridTarget(state);
  // With Track Changes on, the join would read as the whole table deleted and
  // written again: the old fragments come back as a tombstone beside the new
  // table (corpus R339-D04). The row goes in the fragment it is asked in.
  if (!target?.joined || readSuggesting(state)) return null;
  tr.replaceWith(target.from, target.to, target.table);
  return { tablePos: target.from, rows: target.rows, left: target.left, right: target.right };
}

/**
 * A scratch transform with `target`'s table in place: the page fragments
 * become the joined table (the page layout cuts it again), in the same step.
 */
function scratchFor(state: EditorState, target: GridTarget): Transform | null {
  const scratch = new Transform(state.doc);
  if (!target.joined) return scratch;
  scratch.replaceWith(target.from, target.to, target.table);
  return scratch.doc.nodeAt(target.from) === target.table ? scratch : null;
}

/**
 * Delete the rows the selection covers (Word Delete Rows). All rows of the
 * table delete the table.
 */
export function deleteDocumentTableRows(state: EditorState, dispatch?: Dispatch): boolean {
  const target = gridTarget(state);
  if (!target) return false;
  if (target.rows.length >= TableMap.get(target.table).height) {
    return deleteDocumentTable(state, dispatch);
  }
  if (!dispatch) return true;
  if (target.joined && readSuggesting(state)) return deleteTrackedFragmentRows(state, dispatch, target);
  const scratch = scratchFor(state, target);
  if (!scratch || !removeRows(scratch, target.from + 1, target.rows)) return false;
  commit(state, dispatch, scratch, {
    tableStart: target.from + 1,
    row: target.rows[0]!,
    column: target.left,
  });
  return true;
}

/**
 * Delete Rows with Track Changes on, in a table split over pages: each row is
 * removed from the fragment it stands in, and the tracker keeps it as a row marked
 * deleted, as Word does. Joined first, the replacement read as the whole table
 * deleted and written again: the old fragments came back beside the new table,
 * which the save then refused as one source table twice (corpus R339-D04).
 */
function deleteTrackedFragmentRows(
  state: EditorState,
  dispatch: NonNullable<Dispatch>,
  target: GridTarget,
): boolean {
  const table = logicalTable(state);
  if (!table) return false;
  const { fragments, index, rect } = table;
  const logical = logicalTableRowIndexes(fragments);
  const asked = new Set(target.rows);
  const scratch = new Transform(state.doc);
  // Last fragment first: the positions of the fragments before stay valid.
  for (let fragment = fragments.length - 1; fragment >= 0; fragment -= 1) {
    const { node, pos } = fragments[fragment]!;
    const rows = (logical.rows[fragment] ?? []).flatMap((row, physical) =>
      row !== null && asked.has(row) ? [physical] : [],
    );
    if (rows.length === 0) continue;
    const kept = (logical.rows[fragment] ?? []).filter((row) => row !== null && !asked.has(row));
    if (kept.length === 0) scratch.delete(pos, pos + node.nodeSize);
    else if (!removeRows(scratch, pos + 1, rows)) return false;
  }
  commit(state, dispatch, scratch, {
    tableStart: scratch.mapping.map(fragments[index]!.pos) + 1,
    row: rect.top,
    column: rect.left,
  });
  return true;
}

/**
 * Delete the columns the selection covers (Word Delete Columns), from every
 * page fragment of the table. All columns of the table delete the table.
 */
export function deleteDocumentTableColumns(state: EditorState, dispatch?: Dispatch): boolean {
  const table = logicalTable(state);
  if (!table) return false;
  const { rect, fragments, index } = table;
  if (rect.left === 0 && rect.right === rect.map.width) {
    return deleteDocumentTable(state, dispatch);
  }
  // Every page fragment of a table has the table's grid.
  if (fragments.some(({ node }) => TableMap.get(node).width !== rect.map.width)) return false;
  if (!dispatch) return true;
  const scratch = new Transform(state.doc);
  // Last fragment first: the positions of the fragments before stay valid.
  for (let fragment = fragments.length - 1; fragment >= 0; fragment -= 1) {
    if (!removeColumns(scratch, fragments[fragment]!.pos + 1, rect.left, rect.right)) return false;
  }
  // Word does not track a column deletion: with Track Changes on, Delete
  // Columns removes the column at once (Word 16 for Mac writes the table with
  // one column fewer and no w:del / w:cellDel, while a deleted row is marked
  // w:del). Tracked here, the column's text became deletion marks while the
  // merged cell across it was split untracked, so Reject left the split and
  // Accept an empty column (live Word audit WUA 062).
  commit(
    state,
    dispatch,
    scratch,
    {
      tableStart: scratch.mapping.map(fragments[index]!.pos) + 1,
      row: rect.top,
      column: rect.left,
    },
    false,
    true,
  );
  return true;
}

/** An empty cell that keeps the paragraph formatting of the cell's end mark. */
function clearedCellContent(cell: ProseMirrorNode): Fragment | null {
  const last = cell.lastChild;
  if (last?.isTextblock && last.type.name === "paragraph") {
    const paragraph = last.type.createAndFill(last.attrs);
    if (paragraph) return Fragment.from(paragraph);
  }
  return cell.type.createAndFill()?.content ?? null;
}

/**
 * Word's Delete (EditClear) on a cell selection: the text of every selected
 * cell is removed; rows, columns and formatting stay. A header row repeated
 * on a later page is a read-only copy and is left alone.
 */
export function clearDocumentTableCells(state: EditorState, dispatch?: Dispatch): boolean {
  const selection = state.selection;
  // Select Table on a table split over pages selects text across its
  // fragments; Delete clears every cell of every page and keeps the grid,
  
  // cells into one).
  const fragments = selection instanceof CellSelection ? null : wholeLogicalTableTextSelection(state);
  if (!(selection instanceof CellSelection) && !fragments) return false;
  if (!dispatch) return true;
  const tr = state.tr;
  const forEachCell = (visit: (cell: ProseMirrorNode, pos: number) => void) => {
    if (selection instanceof CellSelection) {
      selection.forEachCell(visit);
      return;
    }
    for (const fragment of fragments ?? []) {
      fragment.node.descendants((node, offset) => {
        if (node.type.spec.tableRole === "cell" || node.type.spec.tableRole === "header_cell") {
          visit(node, fragment.pos + 1 + offset);
          return false;
        }
        return true;
      });
    }
  };
  forEachCell((cell, pos) => {
    if (state.doc.resolve(pos).parent.attrs[TABLE_REPEATED_HEADER_ATTR] === true) return;
    // A cell's formula is its content, not its formatting: Delete removes it
    // with the result, or the formula engine writes the result straight back
    
    if (cell.attrs.formula != null || cell.attrs.formulaNumberFormat != null) {
      tr.setNodeMarkup(tr.mapping.map(pos), undefined, {
        ...cell.attrs,
        formula: null,
        formulaNumberFormat: null,
      });
    }
    const content = clearedCellContent(cell);
    if (!content || cell.content.eq(content)) return;
    tr.replaceWith(
      tr.mapping.map(pos + 1),
      tr.mapping.map(pos + cell.nodeSize - 1),
      content,
    );
  });
  if (tr.docChanged) dispatch(tr);
  return true;
}

/**
 * Cells can shift only in a grid of single, unmerged cells. Grid fillers (the
 * grid columns a short row leaves empty) are single slots too: a row
 * shortened before, or imported short, shifts again.
 */
function cellsCanShift(table: ProseMirrorNode): boolean {
  const map = TableMap.get(table);
  if (map.problems || table.childCount === 0) return false;
  let dense = true;
  table.forEach((row) => {
    if (row.childCount !== map.width) dense = false;
    row.forEach((cell) => {
      if (cell.attrs.colspan !== 1 || cell.attrs.rowspan !== 1) dense = false;
    });
  });
  return dense;
}

/** Cell attributes that belong to the grid slot, not to the moving cell. */
const SLOT_ATTRS = ["colwidth", "colwidthTwips"] as const;

function slotGeometry(slot: ProseMirrorNode): Record<string, unknown> {
  const geometry: Record<string, unknown> = {};
  for (const name of SLOT_ATTRS) if (name in slot.attrs) geometry[name] = slot.attrs[name];
  return geometry;
}

/** The cell for `slot`'s place: `source` moved in, or an empty cell. */
function movedCell(slot: ProseMirrorNode, source: ProseMirrorNode | null): ProseMirrorNode | null {
  if (source === slot) return slot;
  if (!source) return slot.type.createAndFill({ ...slotGeometry(slot), gridFiller: null });
  return slot.type.create({ ...source.attrs, ...slotGeometry(slot) }, source.content, source.marks);
}

/**
 * The grid column `slot` stands for, holding no cell: the same empty filler
 * the DOCX import pads a short row with (one per grid column, carrying that
 * column's width). It is always a plain body cell, as the import makes it.
 */
function gridFillerFor(slot: ProseMirrorNode): ProseMirrorNode | null {
  if (isGridFillerCell(slot)) return slot;
  const cellType = slot.type.schema.nodes.tableCell ?? slot.type;
  return cellType.createAndFill({ ...slotGeometry(slot), gridFiller: true });
}

/**
 * A row whose selected cells are removed, the rest moved left: its leading
 * fillers (`w:gridBefore`) stay, then its remaining cells, then one filler
 * per grid column the row now leaves empty (`w:gridAfter`). Null when no
 * cell of the row remains.
 */
function rowShiftedLeft(
  cells: readonly ProseMirrorNode[],
  left: number,
  right: number,
): ProseMirrorNode[] | null {
  let lead = 0;
  while (lead < cells.length && isGridFillerCell(cells[lead])) lead += 1;
  const kept = cells
    .slice(lead)
    .filter((cell, offset) => {
      const column = lead + offset;
      return !isGridFillerCell(cell) && (column < left || column >= right);
    });
  if (kept.length === 0) return null;
  const next: ProseMirrorNode[] = cells.slice(0, lead);
  for (let column = lead; column < cells.length; column += 1) {
    const slot = cells[column]!;
    const source = kept[column - lead];
    const cell = source ? movedCell(slot, source) : gridFillerFor(slot);
    if (!cell) return null;
    next.push(cell);
  }
  return next;
}

function shiftedTable(target: GridTarget, mode: "shiftLeft" | "shiftUp"): ProseMirrorNode | null {
  const { table, left, right } = target;
  const grid: ProseMirrorNode[][] = [];
  table.forEach((row) => {
    const cells: ProseMirrorNode[] = [];
    row.forEach((cell) => cells.push(cell));
    grid.push(cells);
  });
  const next: Array<ProseMirrorNode[] | null> = grid.map((cells) => [...cells]);
  const selected = new Set(target.rows);
  if (mode === "shiftLeft") {
    // A row left with no cell at all is gone (a `w:tr` holds at least one
    // `w:tc`), as a row whose every cell is deleted is.
    for (const row of selected) next[row] = rowShiftedLeft(grid[row]!, left, right);
  } else {
    // A grid column a short row leaves empty is not a cell: it neither moves
    // nor takes a cell from below, and the column's cells skip over it.
    for (let column = left; column < right; column += 1) {
      const slots: number[] = [];
      for (let row = target.rows[0]!; row < grid.length; row += 1) {
        if (!isGridFillerCell(grid[row]![column])) slots.push(row);
      }
      const kept = slots
        .filter((row) => !selected.has(row))
        .map((row) => grid[row]![column]!);
      for (const [index, row] of slots.entries()) {
        const cell = movedCell(grid[row]![column]!, kept[index] ?? null);
        if (!cell) return null;
        next[row]![column] = cell;
      }
    }
  }
  try {
    const rows: ProseMirrorNode[] = [];
    next.forEach((cells, index) => {
      if (!cells) return;
      const row = table.child(index);
      rows.push(row.type.create(row.attrs, cells, row.marks));
    });
    if (rows.length === 0) return null;
    const shifted = table.type.create(table.attrs, rows, table.marks);
    shifted.check();
    return TableMap.get(shifted).problems ? null : shifted;
  } catch {
    return null;
  }
}

/** An option of Word's Delete Cells dialog. */
export type DocumentTableDeleteCellsMode = "shiftLeft" | "shiftUp" | "entireRow" | "entireColumn";

/** Word Delete Cells on the cells the selection covers (a caret: its cell). */
export function deleteDocumentTableCells(
  state: EditorState,
  dispatch: Dispatch,
  mode: DocumentTableDeleteCellsMode,
): boolean {
  if (mode === "entireRow") return deleteDocumentTableRows(state, dispatch);
  if (mode === "entireColumn") return deleteDocumentTableColumns(state, dispatch);
  const target = gridTarget(state);
  if (!target || !cellsCanShift(target.table)) return false;
  const shifted = shiftedTable(target, mode);
  // Every selected row lost all of its cells: the rows go, as in Word.
  if (!shifted) {
    return mode === "shiftLeft" && everySelectedRowEmptied(target)
      ? deleteDocumentTableRows(state, dispatch)
      : false;
  }
  if (!dispatch) return true;
  const scratch = new Transform(state.doc);
  scratch.replaceWith(target.from, target.to, shifted);
  if (scratch.doc.nodeAt(target.from) !== shifted) return false;
  commit(
    state,
    dispatch,
    scratch,
    {
      tableStart: target.from + 1,
      row: Math.min(target.rows[0]!, shifted.childCount - 1),
      column: target.left,
    },
    tableHoldsGridFiller(shifted) || tableHoldsGridFiller(target.table),
  );
  return true;
}

function everySelectedRowEmptied(target: GridTarget): boolean {
  if (target.rows.length < TableMap.get(target.table).height) return false;
  return target.rows.every((row) => {
    const cells: ProseMirrorNode[] = [];
    target.table.child(row).forEach((cell) => cells.push(cell));
    return rowShiftedLeft(cells, target.left, target.right) === null;
  });
}

/** What the Delete Cells dialog offers for the current selection. */
export interface DocumentTableDeleteCellsRequest {
  /** False when merged cells keep the cells from shifting. */
  readonly canShift: boolean;
  /**
   * Whether Delete entire row / column are offered. Every table takes them,
   * one with rows shorter than its grid included (the original-package saver
   * rewrites that grid; tableGridFillerExtension.ts refuses only a row left with no
   * cell).
   */
  readonly canDeleteLines: boolean;
}

export function readDocumentTableDeleteCellsRequest(
  state: EditorState,
): DocumentTableDeleteCellsRequest | null {
  const target = gridTarget(state);
  return target
    ? {
        canShift: cellsCanShift(target.table),
        canDeleteLines: true,
      }
    : null;
}

type DeleteCellsDialogOpener = (request: DocumentTableDeleteCellsRequest) => void;
const deleteCellsDialogs = new WeakMap<object, DeleteCellsDialogOpener>();

/**
 * The editor host's Delete Cells dialog, which Backspace opens. Returns the
 * unregister function. Without one, Backspace clears those cells.
 */
export function registerDocumentTableDeleteCellsDialog(
  editor: object,
  open: DeleteCellsDialogOpener,
): () => void {
  deleteCellsDialogs.set(editor, open);
  return () => {
    if (deleteCellsDialogs.get(editor) === open) deleteCellsDialogs.delete(editor);
  };
}

/** Open the host's Delete Cells dialog for `state`'s selection. */
export function openDocumentTableDeleteCellsDialog(editor: object, state: EditorState): boolean {
  const open = deleteCellsDialogs.get(editor);
  const request = open ? readDocumentTableDeleteCellsRequest(state) : null;
  if (!open || !request) return false;
  open(request);
  return true;
}

/**
 * What Backspace deletes for the current CellSelection, read from the cells
 * it highlights. One cell is always Word's Delete Cells. Selecting every
 * cell of one page of a table that continues on other pages selects those
 * rows, not the table.
 */
export function documentTableBackspaceTarget(
  state: EditorState,
): DocumentTableBackspaceTarget | null {
  if (!(state.selection instanceof CellSelection)) return null;
  const table = logicalTable(state);
  if (!table) return null;
  const { rect } = table;
  if (rect.map.cellsInRect(rect).length === 1) return "cells";
  // A later page starts with read-only copies of the header rows: a column
  // on that page runs from the first row below them.
  let copies = 0;
  while (
    copies < rect.table.childCount &&
    rect.table.child(copies).attrs[TABLE_REPEATED_HEADER_ATTR] === true
  ) {
    copies += 1;
  }
  const rows = rect.left === 0 && rect.right === rect.map.width;
  const columns = rect.top <= copies && rect.bottom === rect.map.height;
  if (rows && columns) return table.fragments.length > 1 ? "rows" : "table";
  if (rows) return "rows";
  if (columns) return "columns";
  return "cells";
}

/**
 * What Cut takes out of a table besides copying it, as Word's Cut does: a
 * whole table (or every page of one), whole rows or whole columns are taken
 * out; other cells keep their place and only lose their contents, which is
 * the default cut (false). Cutting the whole of a table left an empty table
 * where it had been, through a save (live Word audit, 589–592).
 */
export function cutDocumentTableSelection(state: EditorState, dispatch?: Dispatch): boolean {
  if (wholeLogicalTableTextSelection(state)) return deleteDocumentTable(state, dispatch);
  const target = documentTableBackspaceTarget(state);
  if (target === "table") return deleteDocumentTable(state, dispatch);
  if (target === "rows") return deleteDocumentTableRows(state, dispatch);
  if (target === "columns") return deleteDocumentTableColumns(state, dispatch);
  return false;
}

/**
 * Backspace on a CellSelection; false for any other selection. Cells that
 * are not whole rows or columns go to `openDeleteCells` (Word's dialog), or
 * are cleared when the host has none.
 */
export function backspaceDocumentTableSelection(
  state: EditorState,
  dispatch?: Dispatch,
  openDeleteCells?: () => boolean,
): boolean {
  // Backspace on the whole of a table split over pages deletes the table.
  if (wholeLogicalTableTextSelection(state)) return deleteDocumentTable(state, dispatch);
  const target = documentTableBackspaceTarget(state);
  if (target === "table") return deleteDocumentTable(state, dispatch);
  if (target === "rows") return deleteDocumentTableRows(state, dispatch) || true;
  if (target === "columns") return deleteDocumentTableColumns(state, dispatch) || true;
  if (target === "cells") {
    if (dispatch && openDeleteCells?.()) return true;
    return clearDocumentTableCells(state, dispatch);
  }
  return false;
}
