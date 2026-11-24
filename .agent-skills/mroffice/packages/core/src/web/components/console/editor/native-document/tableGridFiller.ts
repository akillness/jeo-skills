/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { SheetFact } from "../../../../lib/editor/sheet-facts";
import {
  Fragment,
  Mark,
  Slice,
  type Node as ProseMirrorNode,
  type ResolvedPos,
} from "@tiptap/pm/model";
import { Selection, type EditorState } from "@tiptap/pm/state";
import { TableMap } from "@tiptap/pm/tables";

import { MRNOTE_BLOCK_ID_ATTR } from "./blockIds";

/**
 * A grid filler is a table cell the DOCX page builder INVENTED.
 *
 * ISO/IEC 29500-1 lets a `w:tr` hold fewer cells than the table's shared
 * `w:tblGrid`: `w:trPr/w:gridBefore` (17.4.15) skips grid columns before the
 * row's first cell and `w:gridAfter` (17.4.14) leaves them after its last one,
 * with only a preferred width (`w:wBefore`/`w:wAfter`) and NO `w:tc`. In Word
 * that grid position holds no cell at all: there is nothing to click, Tab
 * steps from the row's last cell to the next row's first one, and no command
 * can put content there.
 *
 * The page model is a dense rectangle, so the server pads such a row with an
 * empty cell marked `gridFiller: true`. This module is the ONE place that
 * reads that marker; every input path (caret, keys, transactions, table-wide
 * commands, border painting) asks `isGridFillerCell`.
 */
/**
 * Transaction meta of Word's Delete Cells (Shift cells left / up), the one
 * user command that may reshape a table's grid fillers. Shift cells left
 * removes the selected cells and the row ends that many grid columns early
 * (`w:gridAfter` + `w:wAfter` in the file), so it mints fillers at the row's
 * end; both savers write that shape (the fresh DOCX export and the original
 * package patch), which is what the transaction filter's grid lock guards.
 */
export const DOCUMENT_TABLE_GRID_RESHAPE_META = "documentTableGridReshape";

export function isGridFillerCell(
  node: ProseMirrorNode | null | undefined,
): boolean {
  return (
    !!node &&
    (node.type.name === "tableCell" || node.type.name === "tableHeader") &&
    node.attrs.gridFiller === true
  );
}

const tableFillerCache = new WeakMap<ProseMirrorNode, boolean>();

/** Whether any row of THIS table (not of a nested one) holds a filler. */
export function tableHoldsGridFiller(
  table: ProseMirrorNode | null | undefined,
): boolean {
  if (!table || table.type.name !== "table") return false;
  const cached = tableFillerCache.get(table);
  if (cached !== undefined) return cached;
  let found = false;
  table.forEach((row) => {
    if (found) return;
    row.forEach((cell) => {
      if (isGridFillerCell(cell)) found = true;
    });
  });
  tableFillerCache.set(table, found);
  return found;
}

export interface GridFillerTable {
  readonly pos: number;
  readonly node: ProseMirrorNode;
}

const HOLDS_GRID_FILLER = new SheetFact((node) => node.type.name === "table" && tableHoldsGridFiller(node));

/** Every table of the document that holds a filler, nested tables included. */
export function findGridFillerTables(
  doc: ProseMirrorNode,
): readonly GridFillerTable[] {
  const found: GridFillerTable[] = [];
  HOLDS_GRID_FILLER.descendants(doc, (node, pos) => {
    if (node.isTextblock) return false;
    if (node.type.name === "table" && tableHoldsGridFiller(node)) {
      found.push({ pos, node });
    }
    return true;
  });
  return found;
}

export function fragmentHoldsGridFiller(fragment: Fragment): boolean {
  let found = false;
  fragment.descendants((node) => {
    if (found || node.isTextblock) return false;
    if (isGridFillerCell(node)) found = true;
    return !found;
  });
  return found;
}

/** The innermost filler cell around a position, if the position is inside one. */
export function gridFillerCellAround(
  $pos: ResolvedPos,
): { readonly pos: number; readonly node: ProseMirrorNode; readonly depth: number } | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (isGridFillerCell(node)) {
      return { pos: $pos.before(depth), node, depth };
    }
  }
  return null;
}

/** The nearest enclosing table that holds a filler (its grid is locked). */
export function gridFillerTableAround($pos: ResolvedPos): GridFillerTable | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name === "table" && tableHoldsGridFiller(node)) {
      return { pos: $pos.before(depth), node };
    }
  }
  return null;
}

/**
 * Whether the selection sits in a table whose grid the saver cannot rewrite.
 *
 * The DOCX saver writes CELL CONTENT into a ragged table and nothing else: a
 * row or column added, removed, merged or split there has no `w:tr`/`w:tc` it
 * can address, and the whole table would fail to save. Structure commands ask
 * this once and refuse with a reason instead.
 */
export function selectionInGridFillerTable(state: EditorState): boolean {
  const { $from, $to } = state.selection;
  return Boolean(gridFillerTableAround($from) ?? gridFillerTableAround($to));
}

// `colwidth` is the width of the GRID COLUMN the filler stands in (dragging a
// real cell's column edge rewrites it for the whole column), never a property
// of a cell.
const FILLER_GEOMETRY_ATTRS: ReadonlySet<string> = new Set(["colwidth"]);
const NO_ATTRS: ReadonlySet<string> = new Set();

function sameAttrs(
  before: ProseMirrorNode,
  after: ProseMirrorNode,
  ignored: ReadonlySet<string>,
): boolean {
  const names = new Set([
    ...Object.keys(before.attrs),
    ...Object.keys(after.attrs),
  ]);
  for (const name of names) {
    if (ignored.has(name)) continue;
    // `block_id` is the editor's own block identity. blockIds.ts MINTS one
    // for every block that lacks it -- the filler's empty paragraph included
    // -- which says nothing about content. An identity that already exists
    // stays what it is.
    if (name === MRNOTE_BLOCK_ID_ATTR && !before.attrs[name]) continue;
    if (
      JSON.stringify(before.attrs[name] ?? null) !==
      JSON.stringify(after.attrs[name] ?? null)
    ) {
      return false;
    }
  }
  return true;
}

function sameContentModuloIdentity(
  before: ProseMirrorNode,
  after: ProseMirrorNode,
): boolean {
  if (before === after) return true;
  if (before.type !== after.type) return false;
  if (before.isText) return before.eq(after);
  if (!Mark.sameSet(before.marks, after.marks)) return false;
  if (!sameAttrs(before, after, NO_ATTRS)) return false;
  if (before.childCount !== after.childCount) return false;
  for (let index = 0; index < before.childCount; index += 1) {
    if (!sameContentModuloIdentity(before.child(index), after.child(index))) {
      return false;
    }
  }
  return true;
}

/**
 * A filler keeps its content, marks and attributes byte for byte. Only the
 * grid column's width may move, and a block identity may be minted.
 */
export function sameGridFiller(
  before: ProseMirrorNode,
  after: ProseMirrorNode,
): boolean {
  if (before === after) return true;
  if (before.type !== after.type) return false;
  if (!Mark.sameSet(before.marks, after.marks)) return false;
  if (!sameAttrs(before, after, FILLER_GEOMETRY_ATTRS)) return false;
  if (before.childCount !== after.childCount) return false;
  for (let index = 0; index < before.childCount; index += 1) {
    if (!sameContentModuloIdentity(before.child(index), after.child(index))) {
      return false;
    }
  }
  return true;
}

const span = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 1;

/**
 * Same rows, same cells per row, same spans, and no slot BECAME a filler.
 *
 * A filler slot that lost its marker is not a different grid: the stock
 * cell-range paste replaces whole cell nodes with the pasted ones, marker and
 * all. It is reported by `changedGridFillers` and put back, so the paste
 * still reaches the real cells of the range.
 */
export function sameGridShape(
  before: ProseMirrorNode,
  after: ProseMirrorNode,
): boolean {
  if (before === after) return true;
  if (after.type.name !== "table") return false;
  if (before.childCount !== after.childCount) return false;
  for (let row = 0; row < before.childCount; row += 1) {
    const beforeRow = before.child(row);
    const afterRow = after.child(row);
    if (beforeRow.childCount !== afterRow.childCount) return false;
    for (let index = 0; index < beforeRow.childCount; index += 1) {
      const a = beforeRow.child(index);
      const b = afterRow.child(index);
      if (
        (isGridFillerCell(b) && !isGridFillerCell(a)) ||
        span(a.attrs.colspan) !== span(b.attrs.colspan) ||
        span(a.attrs.rowspan) !== span(b.attrs.rowspan)
      ) {
        return false;
      }
    }
  }
  return true;
}

export interface GridFillerDifference {
  /** Position of the changed filler in the AFTER table's document. */
  readonly pos: number;
  readonly before: ProseMirrorNode;
  readonly after: ProseMirrorNode;
}

/** Fillers of a same-shaped table whose content, marks or attrs moved. */
export function changedGridFillers(
  before: ProseMirrorNode,
  after: ProseMirrorNode,
  afterPos: number,
): readonly GridFillerDifference[] {
  const changed: GridFillerDifference[] = [];
  if (before === after) return changed;
  let rowPos = afterPos + 1;
  for (let row = 0; row < after.childCount; row += 1) {
    const afterRow = after.child(row);
    const beforeRow = before.child(row);
    let cellPos = rowPos + 1;
    for (let index = 0; index < afterRow.childCount; index += 1) {
      const afterCell = afterRow.child(index);
      const beforeCell = beforeRow.child(index);
      if (isGridFillerCell(beforeCell) && !sameGridFiller(beforeCell, afterCell)) {
        changed.push({ pos: cellPos, before: beforeCell, after: afterCell });
      }
      cellPos += afterCell.nodeSize;
    }
    rowPos += afterRow.nodeSize;
  }
  return changed;
}

/**
 * What a ragged table needs after its grid changed so the DOCX savers can
 * write it, or `null` when no Word table has that shape.
 *
 * Word states the grid columns a row holds no cell for only at the row's two
 * ends (`w:gridBefore` / `w:gridAfter`, ISO/IEC 29500-1 17.4.15 / 17.4.14),
 * and every `w:tr` holds at least one `w:tc`. After Insert / Delete Rows and
 * Columns, Merge or Split Cells in a table with such rows:
 *
 * - a row the user inserted repeats the grid shape of the row it was
 *   inserted beside, as Word's Insert Above / Below copies the row: its new
 *   empty cells over that row's filler slots become fillers;
 * - a new empty cell that lands between a row's skipped columns and the row's
 *   edge is one more skipped column (the column was inserted where that row
 *   has no cell), so it becomes a filler too;
 * - a filler merged into a real cell stops being one (the merged cell now
 *   covers that grid column).
 *
 * `mark` and `unmark` are cell offsets inside the table (TableMap's
 * coordinates: add the table's position + 1).
 */
export interface GridFillerNormalization {
  readonly mark: readonly number[];
  readonly unmark: readonly number[];
}

const emptyCell = (cell: ProseMirrorNode): boolean =>
  cell.childCount === 1 &&
  cell.firstChild!.isTextblock &&
  cell.firstChild!.content.size === 0;

export function normalizeGridFillerTable(
  before: ProseMirrorNode | null,
  after: ProseMirrorNode,
): GridFillerNormalization | null {
  let map: TableMap;
  try {
    map = TableMap.get(after);
  } catch {
    return null;
  }
  // A column-width disagreement (a new cell without `colwidth`) is the
  // table plugin's own repair; any other problem is a grid no row can state.
  if (map.problems?.some((problem) => problem.type !== "colwidth mismatch")) {
    return null;
  }
  const cellAt = (offset: number) => after.nodeAt(offset)!;
  const mark = new Set<number>();
  const unmark = new Set<number>();
  const isFiller = (offset: number) =>
    (isGridFillerCell(cellAt(offset)) && !unmark.has(offset)) || mark.has(offset);
  for (const offset of new Set(map.map)) {
    const cell = cellAt(offset);
    if (
      isGridFillerCell(cell) &&
      (span(cell.attrs.colspan) !== 1 || span(cell.attrs.rowspan) !== 1)
    ) {
      unmark.add(offset);
    }
  }
  const slot = (row: number, column: number) => map.map[row * map.width + column]!;
  const originRow = (offset: number) =>
    Math.floor(map.map.indexOf(offset) / map.width);
  const convertible = (offset: number, row: number) => {
    const cell = cellAt(offset);
    return (
      !isGridFillerCell(cell) &&
      span(cell.attrs.colspan) === 1 &&
      span(cell.attrs.rowspan) === 1 &&
      originRow(offset) === row &&
      emptyCell(cell)
    );
  };

  // Inserted rows take the shape of the row beside them.
  if (before && after.childCount > before.childCount) {
    const kept = new Set<ProseMirrorNode>();
    before.forEach((row) => kept.add(row));
    for (let row = 0; row < map.height; row += 1) {
      const rowNode = after.child(row);
      if (kept.has(rowNode)) continue;
      let allNew = true;
      rowNode.forEach((cell) => {
        if (isGridFillerCell(cell) || !emptyCell(cell)) allNew = false;
      });
      if (!allNew) continue;
      const template = [row - 1, row + 1].find(
        (candidate) =>
          candidate >= 0 &&
          candidate < map.height &&
          kept.has(after.child(candidate)),
      );
      if (template === undefined) continue;
      for (let column = 0; column < map.width; column += 1) {
        const offset = slot(row, column);
        if (isFiller(slot(template, column)) && convertible(offset, row)) {
          mark.add(offset);
        }
      }
    }
  }

  for (let row = 0; row < map.height; row += 1) {
    // The row's slots as runs of real cells between fillers.
    const runs: number[][] = [];
    let current: number[] | null = null;
    for (let column = 0; column < map.width; column += 1) {
      const offset = slot(row, column);
      if (isFiller(offset)) {
        current = null;
        continue;
      }
      if (!current) {
        current = [];
        runs.push(current);
      }
      current.push(offset);
    }
    if (runs.length === 0) return null;
    if (runs.length === 1) continue;
    // Several runs: every run but one must be new empty cells that stand
    // where the row holds no cell.
    const fixed = runs.filter(
      (run) => !run.every((offset) => convertible(offset, row)),
    );
    if (fixed.length > 1) return null;
    const keep =
      fixed[0] ??
      runs.reduce((longest, run) => (run.length > longest.length ? run : longest));
    for (const run of runs) {
      if (run === keep) continue;
      for (const offset of run) mark.add(offset);
    }
  }
  return { mark: [...mark], unmark: [...unmark] };
}

/**
 * A pasted or dropped cell is a real cell. The marker states a fact about ONE
 * source package's grid; carried into another table it would make an ordinary
 * cell inert for no reason the file knows about.
 */
export function stripGridFillerMarkers(slice: Slice): Slice {
  if (!fragmentHoldsGridFiller(slice.content)) return slice;
  const strip = (fragment: Fragment): Fragment => {
    const nodes: ProseMirrorNode[] = [];
    fragment.forEach((node) => {
      if (node.isTextblock || node.isLeaf) {
        nodes.push(node);
        return;
      }
      const content = strip(node.content);
      nodes.push(
        isGridFillerCell(node)
          ? node.type.create({ ...node.attrs, gridFiller: null }, content, node.marks)
          : node.copy(content),
      );
    });
    return Fragment.fromArray(nodes);
  };
  return new Slice(strip(slice.content), slice.openStart, slice.openEnd);
}

export type GridFillerTravel =
  | "pointer"
  | "forward"
  | "backward"
  | "down"
  | "up";

interface TableCellEntry {
  readonly pos: number;
  readonly node: ProseMirrorNode;
  readonly row: number;
  readonly index: number;
}

function tableCellsInOrder(table: GridFillerTable): TableCellEntry[] {
  const cells: TableCellEntry[] = [];
  let rowPos = table.pos + 1;
  table.node.forEach((rowNode, _offset, row) => {
    let cellPos = rowPos + 1;
    rowNode.forEach((node, _cellOffset, index) => {
      cells.push({ pos: cellPos, node, row, index });
      cellPos += node.nodeSize;
    });
    rowPos += rowNode.nodeSize;
  });
  return cells;
}

const caretAtCellStart = (doc: ProseMirrorNode, cell: TableCellEntry) =>
  Selection.near(doc.resolve(cell.pos + 1), 1);
const caretAtCellEnd = (doc: ProseMirrorNode, cell: TableCellEntry) =>
  Selection.near(doc.resolve(cell.pos + cell.node.nodeSize - 1), -1);

function leaveTable(
  doc: ProseMirrorNode,
  table: GridFillerTable,
  direction: 1 | -1,
): Selection | null {
  const edge =
    direction > 0 ? table.pos + table.node.nodeSize : table.pos;
  const found = Selection.findFrom(doc.resolve(edge), direction, true);
  if (!found) return null;
  // `findFrom` may only find a position back inside this table when the table
  // is the document's last (or first) block.
  const inside = found.from > table.pos && found.to < table.pos + table.node.nodeSize;
  return inside ? null : found;
}

/**
 * Where the caret goes instead of a filler.
 *
 * - a click lands in the nearest real cell of the SAME row (Word has nothing
 *   to click there; the row's own cell is what the user was pointing beside);
 * - horizontal travel (arrows, Tab) keeps going in document order, so the
 *   last real cell of a row steps to the first real cell of the next row and
 *   never bounces back;
 * - vertical travel keeps its grid column until a real cell, then leaves the
 *   table.
 */
export function gridFillerCaretTarget(
  doc: ProseMirrorNode,
  table: GridFillerTable,
  fillerPos: number,
  travel: GridFillerTravel,
): Selection | null {
  const cells = tableCellsInOrder(table);
  const at = cells.findIndex((cell) => cell.pos === fillerPos);
  if (at < 0) return null;
  const filler = cells[at]!;
  const real = (cell: TableCellEntry) => !isGridFillerCell(cell.node);

  if (travel === "pointer") {
    const row = cells.filter((cell) => cell.row === filler.row && real(cell));
    const nearest = row.reduce<TableCellEntry | null>((best, cell) => {
      if (!best) return cell;
      const distance = Math.abs(cell.index - filler.index);
      const bestDistance = Math.abs(best.index - filler.index);
      return distance < bestDistance ? cell : best;
    }, null);
    if (nearest) {
      return nearest.index < filler.index
        ? caretAtCellEnd(doc, nearest)
        : caretAtCellStart(doc, nearest);
    }
    travel = "forward";
  }

  if (travel === "down" || travel === "up") {
    try {
      const map = TableMap.get(table.node);
      const start = table.pos + 1;
      const rect = map.findCell(fillerPos - start);
      const step = travel === "down" ? 1 : -1;
      for (
        let row = travel === "down" ? rect.bottom : rect.top - 1;
        row >= 0 && row < map.height;
        row += step
      ) {
        const cellPos = start + map.map[row * map.width + rect.left]!;
        const cell = cells.find((candidate) => candidate.pos === cellPos);
        if (cell && real(cell)) {
          return travel === "down"
            ? caretAtCellStart(doc, cell)
            : caretAtCellEnd(doc, cell);
        }
      }
      const left = leaveTable(doc, table, step);
      if (left) return left;
    } catch {
      // A table the grid map cannot read falls back to document order.
    }
    travel = travel === "down" ? "forward" : "backward";
  }

  const ahead = cells.slice(at + 1).find(real);
  const behind = cells.slice(0, at).reverse().find(real);
  if (travel === "forward") {
    if (ahead) return caretAtCellStart(doc, ahead);
    return leaveTable(doc, table, 1) ?? (behind ? caretAtCellEnd(doc, behind) : null);
  }
  if (behind) return caretAtCellEnd(doc, behind);
  return leaveTable(doc, table, -1) ?? (ahead ? caretAtCellStart(doc, ahead) : null);
}

/** The next real cell in document order, or null at the table's end. */
export function adjacentRealCell(
  table: GridFillerTable,
  cellPos: number,
  direction: 1 | -1,
): { readonly pos: number; readonly node: ProseMirrorNode } | null {
  const cells = tableCellsInOrder(table);
  const at = cells.findIndex((cell) => cell.pos === cellPos);
  if (at < 0) return null;
  const candidates =
    direction > 0 ? cells.slice(at + 1) : cells.slice(0, at).reverse();
  return candidates.find((cell) => !isGridFillerCell(cell.node)) ?? null;
}
