/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * ProseMirror glue that keeps DOCUMENT table cells carrying a `formula`
 * attribute showing their COMPUTED value. ADDITIVE + back-compat: a table whose
 * cells carry no `formula` attribute is never touched by this plugin (the
 * append-transaction returns undefined), so existing documents render
 * byte-for-byte as before.
 *
 * Model (kept simple + decoupled from the spreadsheet engine):
 *   - The `formula` attribute on a tableCell / tableHeader node is the SOURCE OF
 *     TRUTH (e.g. "=SUM(ABOVE)"). The cell's text content is the rendered value.
 *   - Whenever the document changes, `tableFormulaRecomputePlugin` recomputes
 *     every formula cell (reading sibling cells' values to resolve ABOVE/LEFT/
 *     A1 refs) and, if a cell's displayed text differs from the freshly computed
 *     value, rewrites that cell's text in ONE appended transaction. The formula
 *     attribute itself is preserved.
 *   - Cycles (a formula that references its own cell, directly or transitively)
 *     resolve to `#REF!` via the evaluator's visiting-set guard, so recompute is
 *     bounded and never loops.
 *
 * The grid handed to the evaluator is the LOGICAL table, as Word sees it: the
 * physical fragments pagination cuts a table into (one per page, repeated
 * header clones, the two halves of a row split across pages) are joined back
 * into one grid, so a result never depends on where the page breaks fall. A
 * nested table is a table of its own with its own grid. Merged
 * (colspan/rowspan) cells resolve via their top-left grid position.
 *
 * All formulas of one logical table share one evaluator, whose dependency
 * cache and work budget keep a recompute pass linear in the referenced cells.
 */

import { Extension } from "@tiptap/core";
import type { Mark, Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";
import { CellSelection, selectedRect } from "@tiptap/pm/tables";
import { ySyncPluginKey } from "@tiptap/y-tiptap";
import type { Transaction } from "@tiptap/pm/state";
import {
  createTableFormulaEvaluator,
  isTableFormula,
  type TableFormulaGrid,
} from "./tableCellFormula";
import { collectLogicalTableFragments, type TableFragment } from "@mrnote/core/web/components/console/editor/native-document/paged/tableFragmentGroups.ts";
import { touchedRanges } from "@mrnote/core/web/components/console/editor/native-document/touchedTextblocks.ts";
import { pageSplitSeamText } from "@mrnote/core/web/components/console/editor/native-document/paged/pageSplitSeam.ts";
import {
  TABLE_ORIGINAL_ROWSPAN_ATTR,
  TABLE_REPEATED_HEADER_ATTR,
  TABLE_ROW_CONTINUATION_ATTR,
  TABLE_ROW_CONTINUES_ATTR,
  TABLE_SOURCE_CELL_COL_ATTR,
  TABLE_SOURCE_ROW_ATTR,
  TABLE_VERTICAL_CONTINUATION_ATTR,
} from "@mrnote/core/web/components/console/editor/native-document/paged/tablePagination.ts";
import {
  IME_COMPOSITION_SETTLED_META,
  imeSafeAppendTransaction,
} from "@mrnote/core/web/components/console/editor/native-document/imeCompositionGuard.ts";
import { BOOKMARK_MARK_NAME, sanitizeBookmarkName } from "@mrnote/core/web/components/console/editor/native-document/bookmarks.ts";
import { textblockDisplayText } from "@mrnote/core/web/components/console/editor/native-document/inlineAtomText.ts";
import { normalizeCellFormulaNumberFormat } from "@mrnote/core/web/components/console/editor/native-document/tableCellStyle.ts";

const CELL_TYPES = new Set(["tableCell", "tableHeader"]);














export type DocumentTableMergeFormulaPlan =
  | { kind: "plain" }
  | { kind: "carry"; formula: string; formulaNumberFormat: unknown }
  | { kind: "refuse" };

function cellIsEmpty(cell: ProseMirrorNode): boolean {
  let empty = true;
  cell.descendants((node) => {
    if (!empty) return false;
    if (node.isText ? (node.text ?? "") !== "" : node.isLeaf) empty = false;
    return empty;
  });
  return empty;
}

export function documentTableMergeFormulaPlan(
  state: EditorState,
): DocumentTableMergeFormulaPlan {
  const selection = state.selection;
  if (!(selection instanceof CellSelection)) return { kind: "plain" };
  const formulas: ProseMirrorNode[] = [];
  let filled = 0;
  selection.forEachCell((cell) => {
    if (isTableFormula(cell.attrs.formula)) formulas.push(cell);
    else if (!cellIsEmpty(cell)) filled += 1;
  });
  if (formulas.length === 0) return { kind: "plain" };
  if (formulas.length > 1 || filled > 0) return { kind: "refuse" };
  const formula = formulas[0]!;
  let topLeft: ProseMirrorNode | null = null;
  try {
    const rect = selectedRect(state);
    topLeft = rect.table.nodeAt(rect.map.map[rect.top * rect.map.width + rect.left]!);
  } catch {
    return { kind: "refuse" };
  }
  if (topLeft === formula) return { kind: "plain" };
  return {
    kind: "carry",
    formula: formula.attrs.formula as string,
    formulaNumberFormat: formula.attrs.formulaNumberFormat ?? null,
  };
}

export function formulaBookmarkValues(
  doc: ProseMirrorNode,
): ReadonlyMap<string, string> {
  const fragments = new Map<
    string,
    { text: string; lastEnd: number; ambiguous: boolean }
  >();
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return true;
    const $position = doc.resolve(Math.min(pos + 1, doc.content.size));
    for (let depth = 1; depth <= $position.depth; depth += 1) {
      const ancestor = $position.node(depth);
      if (
        CELL_TYPES.has(ancestor.type.name) &&
        isTableFormula(ancestor.attrs.formula)
      ) {
        // A bookmark over a formula result would otherwise read the previous
        // cached value while this same recompute pass is updating it. Keep that
        // dependency fail-closed until the evaluator owns a cross-field graph.
        return false;
      }
    }
    for (const mark of node.marks) {
      if (mark.type.name !== BOOKMARK_MARK_NAME) continue;
      const name = sanitizeBookmarkName(mark.attrs.name);
      if (!name) continue;
      // Keyed by the bookmark's own name: two bookmarks whose names differ
      // only in case are two targets (the Bookmark dialog goes to each), so
      
      // 2010). The evaluator folds case when it looks a name up.
      const key = name;
      const current = fragments.get(key);
      if (!current) {
        fragments.set(key, {
          text: node.text,
          lastEnd: pos + node.nodeSize,
          ambiguous: false,
        });
        continue;
      }
      // A bookmark whose paragraph the page edge cut in two continues over
      
      const seam =
        current.lastEnd === pos ? "" : pageSplitSeamText(doc, current.lastEnd, pos);
      if (seam === null) {
        current.ambiguous = true;
        continue;
      }
      current.text += seam + node.text;
      current.lastEnd = pos + node.nodeSize;
    }
    return true;
  });
  return new Map(
    [...fragments]
      .filter(([, value]) => !value.ambiguous && value.text.trim().length > 0)
      .map(([name, value]) => [name, value.text] as const),
  );
}

/** One physical cell node and its absolute document position. */
interface PhysicalCell {
  node: ProseMirrorNode;
  pos: number;
   
  headerRow?: boolean;
}

/**
 * One LOGICAL cell of a logical table. Pagination may cut a table into several
 * physical fragments (one per page) and may even cut one row in two; `parts`
 * are the physical halves of this cell in reading order, `mirrors` are the
 * repeated-header clones that reproduce it on later pages.
 */
interface LogicalCell {
  row: number;
  col: number;
  colspan: number;
  rowspan: number;
  parts: PhysicalCell[];
  mirrors: PhysicalCell[];
}

interface LogicalRowFragment {
  row: ProseMirrorNode;
  pos: number;
}

interface LogicalRow {
  sourceRow: number | null;
  fragments: LogicalRowFragment[];
}

const CELL_EMPTY_HEAD_ATTR = "pageTableCellEmptyHead";
const CELL_EMPTY_TAIL_ATTR = "pageTableCellEmptyTail";

function stampedIndex(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function sourceRowOf(row: ProseMirrorNode): number | null {
  return stampedIndex(row.attrs[TABLE_SOURCE_ROW_ATTR]);
}

function sourceColOf(cell: ProseMirrorNode, fallback: number): number {
  return stampedIndex(cell.attrs[TABLE_SOURCE_CELL_COL_ATTR]) ?? fallback;
}

function spanOf(value: unknown): number {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

/**
 * Lay the physical fragments of one logical table on its TRUE grid: rows are
 * the logical rows in reading order (repeated header clones excluded, the two
 * halves of a split row joined), a colspan=N cell occupies N columns and a
 * rowspan=M cell its columns in the next M-1 rows (ProseMirror TableMap
 * semantics, with the original rowspan a page cut clamped restored).
 */
function locateLogicalCells(
  fragments: ReadonlyArray<{ node: ProseMirrorNode; pos: number }>,
): LogicalCell[] {
  const logicalRows: LogicalRow[] = [];
  const clones: LogicalRowFragment[] = [];
  for (const table of fragments) {
    table.node.forEach((row, rowOffset) => {
      if (row.type.name !== "tableRow") return;
      const fragment = { row, pos: table.pos + 1 + rowOffset };
      if (row.attrs[TABLE_REPEATED_HEADER_ATTR] === true) {
        clones.push(fragment);
        return;
      }
      const sourceRow = sourceRowOf(row);
      const previous = logicalRows[logicalRows.length - 1];
      const continuesPrevious =
        sourceRow !== null &&
        previous?.sourceRow === sourceRow &&
        previous.fragments[previous.fragments.length - 1]?.row.attrs[
          TABLE_ROW_CONTINUES_ATTR
        ] === true &&
        row.attrs[TABLE_ROW_CONTINUATION_ATTR] === true;
      if (continuesPrevious) previous.fragments.push(fragment);
      else logicalRows.push({ sourceRow, fragments: [fragment] });
    });
  }

  const cells: LogicalCell[] = [];
  const bySourceRow = new Map<number, LogicalCell[]>();
  // `occupied[col]` = remaining rows a rowspan from a previous row blocks it.
  const occupied: number[] = [];
  logicalRows.forEach((logicalRow, rowIndex) => {
    const byCol = new Map<number, PhysicalCell[]>();
    for (const fragment of logicalRow.fragments) {
      let ordinal = 0;
      fragment.row.forEach((cell, cellOffset) => {
        if (!CELL_TYPES.has(cell.type.name)) return;
        const index = ordinal;
        ordinal += 1;
        if (cell.attrs[TABLE_VERTICAL_CONTINUATION_ATTR] === true) return;
        const key = sourceColOf(cell, index);
        const parts = byCol.get(key) ?? [];
        parts.push({
          node: cell,
          pos: fragment.pos + 1 + cellOffset,
          headerRow: fragment.row.attrs.headerRow === true,
        });
        byCol.set(key, parts);
      });
    }
    const rowCells: LogicalCell[] = [];
    let colIndex = 0;
    [...byCol.entries()]
      .sort(([left], [right]) => left - right)
      .forEach(([, parts]) => {
        while (occupied[colIndex] > 0) colIndex += 1;
        const attrs = parts[0].node.attrs;
        const colspan = spanOf(attrs.colspan);
        const rowspan = spanOf(
          attrs[TABLE_ORIGINAL_ROWSPAN_ATTR] ?? attrs.rowspan,
        );
        const cell: LogicalCell = {
          row: rowIndex,
          col: colIndex,
          colspan,
          rowspan,
          parts,
          mirrors: [],
        };
        cells.push(cell);
        rowCells.push(cell);
        if (rowspan > 1) {
          for (let c = colIndex; c < colIndex + colspan; c += 1) occupied[c] = rowspan;
        }
        colIndex += colspan;
      });
    if (logicalRow.sourceRow !== null) bySourceRow.set(logicalRow.sourceRow, rowCells);
    // Age out rowspan occupancy as we advance to the next row.
    for (let c = 0; c < occupied.length; c += 1) {
      if (occupied[c] > 0) occupied[c] -= 1;
    }
  });

  // A repeated header row on a later page is a display copy of a source row;
  // it shows that row's values and never counts as a row of its own.
  for (const clone of clones) {
    const sourceRow = sourceRowOf(clone.row);
    const originals = sourceRow === null ? undefined : bySourceRow.get(sourceRow);
    if (!originals) continue;
    let ordinal = 0;
    clone.row.forEach((node, cellOffset) => {
      if (!CELL_TYPES.has(node.type.name)) return;
      const original = originals[ordinal];
      ordinal += 1;
      original?.mirrors.push({ node, pos: clone.pos + 1 + cellOffset });
    });
  }
  return cells;
}

function logicalCellText(cell: LogicalCell): string {
  
  // a numeric MERGEFIELD showing 9 counted as nothing, so =A1+1 gave 1).
  return cell.parts.map((part) => textblockDisplayText(part.node)).join("");
}

function logicalCellAttrs(cell: LogicalCell): {
  formula?: unknown;
  formulaNumberFormat?: unknown;
} {
  return cell.parts[0].node.attrs as {
    formula?: unknown;
    formulaNumberFormat?: unknown;
  };
}

/**
 * Build the evaluator grid from logical cells. Each cell contributes its
 * `formula` attribute (when present) and its plain text content (both halves
 * of a split row). The grid is sized to the max row/col seen.
 */
function gridFromCells(cells: LogicalCell[]): TableFormulaGrid {
  let maxRow = -1;
  let maxCol = -1;
  for (const c of cells) {
    if (c.row + c.rowspan - 1 > maxRow) maxRow = c.row + c.rowspan - 1;
    if (c.col + c.colspan - 1 > maxCol) maxCol = c.col + c.colspan - 1;
  }
  const grid: TableFormulaGrid = [];
  for (let r = 0; r <= maxRow; r += 1) {
    grid.push(
      Array.from({ length: maxCol + 1 }, () => ({
        text: "",
        formula: null,
        numberFormat: null,
        header: false,
      })),
    );
  }
  for (const c of cells) {
    const attrs = logicalCellAttrs(c);
    const formulaAttr = attrs.formula;
    grid[c.row][c.col] = {
      text: logicalCellText(c),
      formula: isTableFormula(formulaAttr) ? (formulaAttr as string) : null,
      numberFormat: normalizeCellFormulaNumberFormat(
        attrs.formulaNumberFormat,
      ),
      // A heading row is one of header cells, or one the table marks as a
      // repeating header row (Word's "Repeat Header Rows", the imported
      
      header:
        c.parts[0].node.type.name === "tableHeader" || c.parts[0].headerRow === true,
    };
    // The slots a merged cell spans past its anchor are pass-through: a
    
    for (let r = c.row; r < c.row + c.rowspan; r += 1) {
      for (let col = c.col; col < c.col + c.colspan; col += 1) {
        if (r === c.row && col === c.col) continue;
        const slot = grid[r]?.[col];
        if (slot) slot.covered = true;
      }
    }
  }
  return grid;
}

/**
 * The marks the computed value carries: those of the result's first character
 * (Word keeps a field result's character formatting when it updates), plus any
 * bookmark that covered part of the old result, so a bookmark over the result
 * keeps marking it and cross-references to it stay resolvable.
 */
function resultMarks(block: ProseMirrorNode): readonly Mark[] {
  let marks: readonly Mark[] | null = null;
  const bookmarks: Mark[] = [];
  block.descendants((node) => {
    if (!node.isText) return true;
    if (marks === null) marks = node.marks;
    for (const mark of node.marks) {
      if (
        mark.type.name === BOOKMARK_MARK_NAME &&
        !bookmarks.some((existing) => existing.eq(mark))
      ) {
        bookmarks.push(mark);
      }
    }
    return false;
  });
  let result: readonly Mark[] = marks ?? [];
  for (const bookmark of bookmarks) result = bookmark.addToSet(result);
  return result.filter((mark) => block.type.allowsMarkType(mark.type));
}

/**
 * Replace a formula cell's textual content with `value`. The result lives in
 * the cell's FIRST text block: that block keeps its type and attributes
 * (alignment, spacing, style) and the value keeps the first character's marks
 * (bold, size, bookmark). Any further blocks are part of the old result and are
 * removed, as before, so the displayed text is exactly the computed value.
 */
function writeCellValue(
  tr: Transaction,
  cell: PhysicalCell,
  value: string,
): Transaction {
  const schema = cell.node.type.schema;
  const first = cell.node.firstChild;
  const carrier = first?.isTextblock ? first : null;
  const blockType = carrier?.type ?? schema.nodes.paragraph;
  const marks = carrier ? resultMarks(carrier) : [];
  const textContent = value.length > 0 ? schema.text(value, marks) : null;
  const block = blockType.create(
    carrier?.attrs ?? null,
    textContent ? [textContent] : [],
  );
  // Replace only the cell's CONTENT. Replacing the whole tableCell would map a
  // preceding setNodeMarkup step (the user committing the formula attribute)
  // through a deleted node, leaving History with an empty inverse on Undo.
  // Keeping the cell shell stable preserves attrs/marks and lets one user
  // formula transaction own both the source field and this no-history display
  // refresh.
  const from = tr.mapping.map(cell.pos + 1);
  const to = tr.mapping.map(cell.pos + cell.node.nodeSize - 1);
  // A caret inside the cell stays in the cell: replacing the content block
  // mapped it out to the next cell, so the next Formula… addressed that
  
  const caret = tr.selection;
  const keepCaret =
    caret.empty && caret.from >= from && caret.from <= to;
  tr = tr.replaceWith(from, to, block);
  if (keepCaret) {
    const end = Math.min(from + 1 + value.length, tr.doc.content.size);
    try {
      tr = tr.setSelection(TextSelection.create(tr.doc, end));
    } catch {
      // An unexpected shape keeps the mapped selection.
    }
  }
  return tr;
}

/** Empty the text of a secondary physical half, keeping its blocks. */
function clearCellText(tr: Transaction, cell: PhysicalCell): Transaction {
  cell.node.forEach((block, offset) => {
    if (!block.isTextblock || block.content.size === 0) return;
    const start = cell.pos + 1 + offset + 1;
    tr = tr.delete(
      tr.mapping.map(start),
      tr.mapping.map(start + block.content.size),
    );
  });
  return tr;
}

/** The physical half that shows a split formula cell's value. */
function carrierPart(cell: LogicalCell): PhysicalCell {
  return (
    cell.parts.find((part) => part.node.textContent.length > 0) ??
    cell.parts.find(
      (part) =>
        part.node.attrs[CELL_EMPTY_HEAD_ATTR] !== true &&
        part.node.attrs[CELL_EMPTY_TAIL_ATTR] !== true,
    ) ??
    cell.parts[0]
  );
}

/**
 * Compute the appended transaction that refreshes every stale formula cell in
 * the document, or `null` when nothing needs to change (the common case — a
 * document with no formula cells, or one whose displayed values already match).
 *
 * Formulas are evaluated against LOGICAL tables: the page fragments of one
 * table form one grid (so =SUM(ABOVE) on page 2 still sums the rows on page
 * 1), and every nested table is its own grid, independent of its parent.
 */
export function buildFormulaRecomputeTransaction(
  doc: ProseMirrorNode,
  tr: Transaction,
  refreshes: (fragments: readonly TableFragment[]) => boolean = () => true,
): Transaction | null {
  const groups = collectLogicalTableFragments(doc);
  const formulaGroups = new Set<string>();
  for (const [key, fragments] of groups) {
    if (!refreshes(fragments)) continue;
    const hasFormula = fragments.some(({ node }) => {
      let found = false;
      node.forEach((row) =>
        row.forEach((cell) => {
          if (isTableFormula((cell.attrs as { formula?: unknown }).formula)) {
            found = true;
          }
        }),
      );
      return found;
    });
    if (hasFormula) formulaGroups.add(key);
  }
  if (formulaGroups.size === 0) return null;

  let changed = false;
  const bookmarkValues = formulaBookmarkValues(doc);
  for (const key of formulaGroups) {
    const cells = locateLogicalCells(groups.get(key) ?? []);
    const evaluator = createTableFormulaEvaluator(gridFromCells(cells), {
      bookmarkValues,
    });
    for (const cell of cells) {
      if (!isTableFormula(logicalCellAttrs(cell).formula)) continue;
      const computed = evaluator.evaluate(cell.row, cell.col);
      const carrier = carrierPart(cell);
      if (carrier.node.textContent !== computed) {
        tr = writeCellValue(tr, carrier, computed);
        changed = true;
      }
      for (const part of cell.parts) {
        if (part === carrier || part.node.textContent.length === 0) continue;
        tr = clearCellText(tr, part);
        changed = true;
      }
      for (const mirror of cell.mirrors) {
        if (mirror.node.textContent === computed) continue;
        tr = writeCellValue(tr, mirror, computed);
        changed = true;
      }
    }
  }
  return changed ? tr : null;
}

/**
 * Recompute without ever letting an evaluator failure escape into the editor's
 * transaction pipeline: a formula problem must never stop the user typing.
 */
function safeFormulaRecompute(
  doc: ProseMirrorNode,
  tr: Transaction,
  refreshes?: (fragments: readonly TableFragment[]) => boolean,
): Transaction | null {
  try {
    return buildFormulaRecomputeTransaction(doc, tr, refreshes);
  } catch (error) {
    console.error("[table-formula] recompute skipped", error);
    return null;
  }
}

export const tableFormulaPluginKey = new PluginKey("mrnote-table-formula-recompute");

/**
 * A table read from a Word file: its `=` fields show the result Word cached,
 * and Word does not update them when it opens the file (Update Field does).
 * The page keeps that result until the user edits the table itself; opening
 * the page, a collaborator's update or an edit elsewhere rewrote it (FIXQUEUE
 * 235, corpus R435-D09: `=SUM(B2:B5)/82*100 \# "0%"` cached 83.3% in Word,
 * recomputed to 67% on load and saved into the untouched table).
 */
function keepsWordResults(doc: ProseMirrorNode, fragments: readonly TableFragment[]): boolean {
  const fromWord = (node: ProseMirrorNode) =>
    node.type.name === "table" &&
    (node.attrs.source as { adapter?: unknown } | null | undefined)?.adapter === "docx";
  return fragments.some(({ node, pos }) => {
    if (fromWord(node)) return true;
    // A table nested in a Word table is the Word file's too.
    const $pos = doc.resolve(pos);
    for (let depth = $pos.depth; depth > 0; depth -= 1) if (fromWord($pos.node(depth))) return true;
    return false;
  });
}

/** Whether a logical table holds a position of `ranges` (the user's edits). */
function touchedBy(fragments: readonly TableFragment[], ranges: ReadonlyArray<readonly [number, number]>): boolean {
  return fragments.some(({ node, pos }) => ranges.some(([from, to]) => from <= pos + node.nodeSize && to >= pos));
}

/** The ranges the batch's own user edits changed, in the final document. */
function userEditRanges(transactions: readonly Transaction[]): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  transactions.forEach((transaction, index) => {
    if (!isUserHistoryEdit(transaction)) return;
    for (const [from, to] of touchedRanges(transaction)) {
      let start = from;
      let end = to;
      for (const later of transactions.slice(index + 1)) {
        start = later.mapping.map(start, -1);
        end = later.mapping.map(end, 1);
      }
      ranges.push([start, end]);
    }
  });
  return ranges;
}

/**
 * Plugin that recomputes document table-cell formulas after any doc-changing
 * transaction. Returns `undefined` (no appended transaction) whenever the doc is
 * unchanged or carries no formula cells, keeping non-formula editing a strict
 * no-op. Guarded with a meta flag so the recompute transaction it appends does
 * not itself re-trigger a recompute (avoids a feedback loop).
 */
export function createTableFormulaRecomputePlugin(): Plugin {
  return new Plugin({
    key: tableFormulaPluginKey,
    view(view) {
      let disposed = false;
      queueMicrotask(() => {
        if (
          disposed ||
          (view as typeof view & { isDestroyed?: boolean }).isDestroyed
        ) {
          return;
        }
        const result = safeFormulaRecompute(
          view.state.doc,
          view.state.tr,
          (fragments) => !keepsWordResults(view.state.doc, fragments),
        );
        if (!result) return;
        result.setMeta(tableFormulaPluginKey, true);
        result.setMeta("addToHistory", false);
        view.dispatch(result);
      });
      return {
        destroy() {
          disposed = true;
        },
      };
    },
    // Formula writes replace a table-cell descendant and therefore must not
    // run while WebKit owns a live IME DOM island. Recompute on the explicit
    // settled transaction instead, so the visible formula remains correct.
    appendTransaction: imeSafeAppendTransaction((
      transactions,
      _oldState,
      newState,
    ) => {
      const docChanged = transactions.some(
        (t) => t.docChanged || t.getMeta(IME_COMPOSITION_SETTLED_META),
      );
      if (!docChanged) return undefined;
      // Skip if this batch was itself our own recompute write.
      if (transactions.some((t) => t.getMeta(tableFormulaPluginKey))) {
        return undefined;
      }
      const tr = newState.tr;
      const edited = userEditRanges(transactions);
      const result = safeFormulaRecompute(
        newState.doc,
        tr,
        (fragments) => !keepsWordResults(newState.doc, fragments) || touchedBy(fragments, edited),
      );
      if (!result) return undefined;
      result.setMeta(tableFormulaPluginKey, true);
      // The refreshed result belongs to the edit that caused it: when a user
      // edit (Formula…, typing in a referenced cell) triggered the recompute,
      // the write joins that edit's history group, so one Undo takes the
      // formula and its result away together. A recompute after hydration,
      // a remote update or history replay itself stays out of history, or it
      // would add an undo step of its own after an Undo and break Redo.
      if (!transactions.some(isUserHistoryEdit)) {
        result.setMeta("addToHistory", false);
      }
      return result;
    }),
  });
}

/** A transaction the local user made and prosemirror-history records. */
function isUserHistoryEdit(tr: Transaction): boolean {
  return (
    tr.docChanged &&
    tr.getMeta("addToHistory") !== false &&
    // prosemirror-history's own undo/redo replay.
    tr.getMeta("history$") === undefined &&
    // A collaboration peer's update (y-prosemirror sync).
    tr.getMeta(ySyncPluginKey) === undefined &&
    tr.getMeta("appendedTransaction") === undefined
  );
}

/**
 * TipTap extension that installs {@link createTableFormulaRecomputePlugin}. Added
 * to the document plugin registry so document table cells with a `formula`
 * attribute stay showing their computed value as the table is edited. Carries no
 * schema/commands of its own — purely the recompute glue — so it is a strict
 * no-op for any document without formula cells.
 */
export const DocumentTableFormulas = Extension.create({
  name: "documentTableFormulas",
  addProseMirrorPlugins() {
    return [createTableFormulaRecomputePlugin()];
  },
});
