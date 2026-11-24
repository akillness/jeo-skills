"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Selection,
  type Transaction,
} from "@tiptap/pm/state";
import { Mapping } from "@tiptap/pm/transform";
import { CellSelection, TableMap } from "@tiptap/pm/tables";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { MRNOTE_BLOCK_ID_ATTR, MRNOTE_BLOCK_IDENTITY_META } from "@mrnote/core/web/components/console/editor/native-document/blockIds.ts";
import { isTrustedReadOnlyDocumentMutation } from "@mrnote/core/web/components/console/editor/native-document/readOnlyTransactionAuthority.ts";
import {
  DOCUMENT_TABLE_GRID_RESHAPE_META,
  adjacentRealCell,
  changedGridFillers,
  findGridFillerTables,
  fragmentHoldsGridFiller,
  gridFillerCaretTarget,
  gridFillerCellAround,
  gridFillerTableAround,
  isGridFillerCell,
  normalizeGridFillerTable,
  sameGridFiller,
  sameGridShape,
  stripGridFillerMarkers,
  tableHoldsGridFiller,
  type GridFillerDifference,
  type GridFillerTable,
  type GridFillerTravel,
} from "@mrnote/core/web/components/console/editor/native-document/tableGridFiller.ts";
import { imeSafeAppendTransaction } from "@mrnote/core/web/components/console/editor/native-document/imeCompositionGuard.ts";

/**
 * Why a change was refused.
 *
 * - `content`: the change wrote only into grid fillers, which are not cells.
 * - `structure`: the change would leave a table that holds a filler in a
 *   shape no Word table has (a row with no cell at all, or a skipped grid
 *   column between two of a row's cells), or mint a filler in another table.
 *   Inserting and deleting rows and columns, merging and splitting cells are
 *   otherwise allowed: the original-package saver rewrites the `w:tr`/`w:tc`
 *   grid with `w:gridBefore`/`w:gridAfter`, and `normalizeGridFillerTable` keeps the
 *   page in a shape they can write.
 */
export type GridFillerRefusal = "content" | "structure";

export interface DocumentTableGridFillerOptions {
  readonly onRefused: ((reason: GridFillerRefusal) => void) | null;
}

interface GridFillerPluginState {
  readonly tables: readonly GridFillerTable[];
  readonly decorations: DecorationSet;
}

interface GridFillerMeta {
  readonly repair: true;
}

export const documentTableGridFillerPluginKey =
  new PluginKey<GridFillerPluginState>("documentTableGridFiller");

// prosemirror-history tags its own undo/redo transactions with its plugin
// key. Undo and redo only replay states every step of which already passed
// this filter, so they are let through whole (restoring a deleted ragged
// table brings its fillers back, which is not minting one).
const HISTORY_META = "history$";

/**
 * Harness switch (`window.__docsGridFillerVoidOff = true`, A/B): a filler's
 * empty paragraph and margins size its row again, as before. The rule that
 * keeps them out is CSS (note-editor.css, under
 * `:root:not([data-docs-grid-filler-void-off])`), so the switch marks the root.
 */
function markGridFillerVoidOff(): void {
  if (typeof document === "undefined") return;
  if ((globalThis as { __docsGridFillerVoidOff?: boolean }).__docsGridFillerVoidOff !== true) return;
  document.documentElement.setAttribute("data-docs-grid-filler-void-off", "");
}

function captureState(doc: ProseMirrorNode): GridFillerPluginState {
  const tables = findGridFillerTables(doc);
  if (tables.length === 0) {
    return { tables, decorations: DecorationSet.empty };
  }
  const decorations: Decoration[] = [];
  for (const table of tables) {
    let rowPos = table.pos + 1;
    table.node.forEach((row) => {
      let cellPos = rowPos + 1;
      row.forEach((cell) => {
        if (isGridFillerCell(cell)) {
          // View-only: the marker's DOM contract (`data-grid-filler`) stays
          // what the schema renders, so clipboard and export HTML are
          // unchanged. The browser gets no caret position here and
          // assistive technology no cell.
          decorations.push(
            Decoration.node(cellPos, cellPos + cell.nodeSize, {
              "aria-hidden": "true",
              contenteditable: "false",
            }),
          );
        }
        cellPos += cell.nodeSize;
      });
      rowPos += row.nodeSize;
    });
  }
  return { tables, decorations: DecorationSet.create(doc, decorations) };
}

function isRepair(transaction: Transaction): boolean {
  const meta = transaction.getMeta(documentTableGridFillerPluginKey) as
    | GridFillerMeta
    | undefined;
  return meta?.repair === true;
}

function isExemptTransaction(transaction: Transaction, editor: Editor): boolean {
  // Collaboration (y-sync), hydration / trusted restoration, server content
  // adoption (document-shell import), layout normalization and their appended
  // derivations: the same closed list the read-only authority accepts.
  if (isTrustedReadOnlyDocumentMutation(transaction, editor)) return true;
  // blockIds.ts re-keys blocks whose identity is missing or duplicated. It is
  // system bookkeeping that never touches content; putting an old identity
  // back would only make it re-key the same block again, forever.
  if (
    transaction.getMeta(MRNOTE_BLOCK_IDENTITY_META) === true &&
    transaction.getMeta("addToHistory") === false
  ) {
    return true;
  }
  // Word Delete Cells rewrites the table's grid itself, fillers included,
  // into a shape both savers write (see DOCUMENT_TABLE_GRID_RESHAPE_META).
  if (transaction.getMeta(DOCUMENT_TABLE_GRID_RESHAPE_META) === true) return true;
  return transaction.getMeta(HISTORY_META) !== undefined;
}

function stepsCarryGridFiller(transaction: Transaction): boolean {
  return transaction.steps.some((step) => {
    const probe = step as unknown as {
      slice?: { content?: Parameters<typeof fragmentHoldsGridFiller>[0] };
      attr?: unknown;
    };
    if (probe.attr === "gridFiller") return true;
    return probe.slice?.content
      ? fragmentHoldsGridFiller(probe.slice.content)
      : false;
  });
}

interface MatchedTable {
  readonly pos: number;
  readonly before: ProseMirrorNode;
  readonly after: ProseMirrorNode;
}

/** A filler table whose grid the transaction changed. */
interface ReshapedTable extends MatchedTable {
  readonly reshaped: true;
}

function nodeAtSafe(doc: ProseMirrorNode, pos: number): ProseMirrorNode | null {
  if (pos < 0 || pos >= doc.content.size) return null;
  try {
    return doc.nodeAt(pos);
  } catch {
    return null;
  }
}

function matchTable(
  mapping: Mapping,
  doc: ProseMirrorNode,
  table: GridFillerTable,
): MatchedTable | ReshapedTable | "deleted" | null {
  const identity = table.node.attrs[MRNOTE_BLOCK_ID_ATTR];
  for (const assoc of [1, -1] as const) {
    const pos = mapping.map(table.pos, assoc);
    const node = nodeAtSafe(doc, pos);
    if (!node || node.type.name !== "table") continue;
    if (sameGridShape(table.node, node)) {
      return { pos, before: table.node, after: node };
    }
    // Still this table with its grid changed (rows or columns inserted or
    // deleted, cells merged or split), or another ragged grid put in its
    // place: not a deletion.
    if (
      tableHoldsGridFiller(node) ||
      (identity && node.attrs[MRNOTE_BLOCK_ID_ATTR] === identity)
    ) {
      return { pos, before: table.node, after: node, reshaped: true };
    }
  }
  const open = mapping.mapResult(table.pos, 1);
  const close = mapping.mapResult(table.pos + table.node.nodeSize, -1);
  // The whole table went away (deleted, cut, converted to text, replaced by
  // something that is not this grid). That is always writable.
  return open.deleted && close.deleted ? "deleted" : null;
}

interface Judgement {
  readonly verdict: "allow" | "repair" | GridFillerRefusal;
  readonly differences: readonly GridFillerDifference[];
  /** Filler tables whose grid changed into a writable shape. */
  readonly reshaped: readonly ReshapedTable[];
}

const ALLOW: Judgement = { verdict: "allow", differences: [], reshaped: [] };
const REFUSE_STRUCTURE: Judgement = {
  verdict: "structure",
  differences: [],
  reshaped: [],
};

const isReshaped = (match: MatchedTable | ReshapedTable): match is ReshapedTable =>
  (match as ReshapedTable).reshaped === true;

function judge(
  tables: readonly GridFillerTable[],
  mapping: Mapping,
  doc: ProseMirrorNode,
  mintsFiller: boolean,
): Judgement {
  if (tables.length === 0 && !mintsFiller) return ALLOW;
  const matched = new Map<number, MatchedTable>();
  const reshaped: ReshapedTable[] = [];
  for (const table of tables) {
    const match = matchTable(mapping, doc, table);
    if (match === "deleted") continue;
    if (match === null) return REFUSE_STRUCTURE;
    if (isReshaped(match)) {
      if (!normalizeGridFillerTable(match.before, match.after)) {
        return REFUSE_STRUCTURE;
      }
      reshaped.push(match);
    }
    matched.set(match.pos, match);
  }
  if (mintsFiller) {
    for (const table of findGridFillerTables(doc)) {
      if (!matched.has(table.pos)) return REFUSE_STRUCTURE;
    }
  }
  const differences = [...matched.values()]
    .filter((match) => !isReshaped(match))
    .flatMap((match) => changedGridFillers(match.before, match.after, match.pos));
  return differences.length === 0
    ? { ...ALLOW, reshaped }
    : { verdict: "repair", differences, reshaped };
}

/** Every step of the transaction changed nothing outside a filler cell. */
function touchesOnlyGridFillers(
  transaction: Transaction,
  tables: readonly GridFillerTable[],
): boolean {
  let ranges: Array<{ from: number; to: number }> = [];
  for (const table of tables) {
    let rowPos = table.pos + 1;
    table.node.forEach((row) => {
      let cellPos = rowPos + 1;
      row.forEach((cell) => {
        if (isGridFillerCell(cell)) {
          ranges.push({ from: cellPos, to: cellPos + cell.nodeSize });
        }
        cellPos += cell.nodeSize;
      });
      rowPos += row.nodeSize;
    });
  }
  for (const step of transaction.steps) {
    const map = step.getMap();
    let ranged = false;
    let outside = false;
    map.forEach((from, to) => {
      ranged = true;
      if (!ranges.some((range) => from >= range.from && to <= range.to)) {
        outside = true;
      }
    });
    if (!ranged) {
      // An attribute step has no range of its own; any other step this reader
      // does not know is treated as touching the rest of the document.
      const pos = (step as unknown as { pos?: unknown }).pos;
      outside =
        typeof pos !== "number" || !ranges.some((range) => range.from === pos);
    }
    if (outside) return false;
    ranges = ranges.map((range) => ({
      from: map.map(range.from, -1),
      to: map.map(range.to, 1),
    }));
  }
  return true;
}

function cellInTable(
  $pos: ResolvedPos,
  tablePos: number,
): number | null {
  for (let depth = $pos.depth; depth > 1; depth -= 1) {
    const name = $pos.node(depth).type.name;
    if (
      (name === "tableCell" || name === "tableHeader") &&
      $pos.before(depth - 2) === tablePos
    ) {
      return $pos.before(depth);
    }
  }
  return null;
}

function travelInto(
  doc: ProseMirrorNode,
  table: GridFillerTable,
  fillerPos: number,
  previousHead: number | null,
  pointer: boolean,
): GridFillerTravel {
  if (pointer || previousHead === null) return "pointer";
  const bounded = Math.max(0, Math.min(previousHead, doc.content.size));
  const previousCell = cellInTable(doc.resolve(bounded), table.pos);
  if (previousCell === fillerPos) return "pointer";
  if (previousCell !== null) {
    try {
      const map = TableMap.get(table.node);
      const from = map.findCell(previousCell - table.pos - 1);
      const to = map.findCell(fillerPos - table.pos - 1);
      const sameColumns = from.left < to.right && to.left < from.right;
      if (sameColumns && from.bottom <= to.top) return "down";
      if (sameColumns && to.bottom <= from.top) return "up";
    } catch {
      // Fall through to document order.
    }
  }
  return fillerPos >= bounded ? "forward" : "backward";
}

function fillerTableOf(
  doc: ProseMirrorNode,
  filler: { readonly pos: number; readonly depth: number },
  $pos: ResolvedPos,
): GridFillerTable {
  const tableDepth = filler.depth - 2;
  return { pos: $pos.before(tableDepth), node: $pos.node(tableDepth) };
}

/** The selection the caret must take instead of resting in a filler. */
export function selectionOutsideGridFiller(
  doc: ProseMirrorNode,
  selection: Selection,
  previousHead: number | null,
  pointer: boolean,
): Selection | null {
  if (selection instanceof CellSelection) {
    // A range that crosses fillers is a fine SELECTION (commands skip them);
    // a selection that is nothing but one filler selects no cell.
    if (
      selection.$anchorCell.pos !== selection.$headCell.pos ||
      !isGridFillerCell(selection.$anchorCell.nodeAfter)
    ) {
      return null;
    }
    const $cell = selection.$anchorCell;
    const table = { pos: $cell.before(-1), node: $cell.node(-1) };
    return gridFillerCaretTarget(doc, table, $cell.pos, "pointer");
  }
  const head = gridFillerCellAround(selection.$head);
  const anchor = gridFillerCellAround(selection.$anchor);
  if (!head && !anchor) return null;
  const filler = head ?? anchor!;
  const $pos = head ? selection.$head : selection.$anchor;
  const table = fillerTableOf(doc, filler, $pos);
  const target = gridFillerCaretTarget(
    doc,
    table,
    filler.pos,
    travelInto(doc, table, filler.pos, previousHead, pointer),
  );
  if (!target) return null;
  if (head && !anchor && !selection.empty) {
    // An extending selection keeps its anchor and stops at the real cell.
    return TextSelection.between(selection.$anchor, target.$head);
  }
  return target;
}

function notifyRefusal(
  options: DocumentTableGridFillerOptions,
  reason: GridFillerRefusal,
): void {
  if (!options.onRefused) return;
  try {
    options.onRefused(reason);
  } catch {
    // A notice is never allowed to fail the transaction pipeline.
  }
}

function stepOverGridFillers(
  editor: Editor,
  options: DocumentTableGridFillerOptions,
  direction: 1 | -1,
): boolean {
  const { state, view } = editor;
  const { selection } = state;
  const table = gridFillerTableAround(selection.$head);
  if (!table) return false;
  // Tab inside a list keeps its list meaning, as in an ordinary table.
  if (editor.isActive("listItem") || editor.isActive("taskItem")) return false;
  const cellPos =
    selection instanceof CellSelection
      ? selection.$headCell.pos
      : cellInTable(selection.$head, table.pos);
  if (cellPos === null) return false;
  const cell = state.doc.nodeAt(cellPos);
  if (!cell) return false;
  const $cell = state.doc.resolve(cellPos);
  const neighbour =
    direction > 0
      ? state.doc.resolve(cellPos + cell.nodeSize).nodeAfter ??
        (() => {
          // First cell of the next row.
          const rowEnd = $cell.after();
          return state.doc.resolve(rowEnd).nodeAfter?.firstChild ?? null;
        })()
      : $cell.nodeBefore ??
        (() => {
          const rowStart = $cell.before();
          return state.doc.resolve(rowStart).nodeBefore?.lastChild ?? null;
        })();
  // The ordinary table keymap already does the right thing.
  if (neighbour && !isGridFillerCell(neighbour)) return false;
  const next = adjacentRealCell(table, cellPos, direction);
  if (next) {
    view.dispatch(
      state.tr
        .setSelection(
          TextSelection.between(
            state.doc.resolve(next.pos + 1),
            state.doc.resolve(next.pos + next.node.nodeSize - 1),
          ),
        )
        .scrollIntoView(),
    );
    return true;
  }
  if (direction > 0) {
    // Word appends a row here, shaped like the row the caret leaves, and
    // puts the caret in its first cell.
    if (!editor.commands.addRowAfter()) {
      notifyRefusal(options, "structure");
      return true;
    }
    const after = gridFillerTableAround(editor.state.selection.$head);
    const added = after ? adjacentRealCell(after, cellPos, 1) : null;
    if (added) {
      editor.view.dispatch(
        editor.state.tr
          .setSelection(
            TextSelection.near(editor.state.doc.resolve(added.pos + 1), 1),
          )
          .scrollIntoView(),
      );
    }
    return true;
  }
  // Shift-Tab with nothing but fillers before the cell: stay, as Word stays
  // in a table's first cell.
  return neighbour !== null;
}

/**
 * Makes a marked grid filler inert at the root, beneath every toolbar
 * command, keymap, paste handler and plugin:
 *
 * 1. the caret never rests in one (`appendTransaction` re-homes any selection
 *    that lands there; Tab / Shift-Tab step over them);
 * 2. a user-authored transaction can neither write into one nor change the
 *    grid of a table that holds one (`filterTransaction`); a table-wide change
 *    that reaches real cells AND fillers keeps its real-cell part and has the
 *    fillers restored byte for byte in the same undo step;
 * 3. collaboration, hydration / trusted restoration, server content adoption
 *    and undo/redo pass untouched (the read-only authority's closed list).
 */
export const DocumentTableGridFiller =
  Extension.create<DocumentTableGridFillerOptions>({
    name: "documentTableGridFiller",
    // Above the Table extension's own Tab / Shift-Tab.
    priority: 150,

    addOptions() {
      return { onRefused: null };
    },

    addKeyboardShortcuts() {
      return {
        Tab: () => stepOverGridFillers(this.editor, this.options, 1),
        "Shift-Tab": () => stepOverGridFillers(this.editor, this.options, -1),
      };
    },

    addProseMirrorPlugins() {
      const editor = this.editor;
      const options = this.options;
      markGridFillerVoidOff();
      const tablesOf = (state: EditorState) =>
        documentTableGridFillerPluginKey.getState(state)?.tables ??
        findGridFillerTables(state.doc);
      return [
        new Plugin<GridFillerPluginState>({
          key: documentTableGridFillerPluginKey,
          state: {
            init: (_config, state) => captureState(state.doc),
            apply: (transaction, value, _oldState, newState) =>
              transaction.docChanged ? captureState(newState.doc) : value,
          },
          filterTransaction(transaction, state) {
            if (!transaction.docChanged) return true;
            if (isRepair(transaction)) return true;
            if (isExemptTransaction(transaction, editor)) return true;
            const tables = tablesOf(state);
            const { verdict } = judge(
              tables,
              transaction.mapping,
              transaction.doc,
              stepsCarryGridFiller(transaction),
            );
            if (verdict === "allow") return true;
            if (verdict === "repair") {
              if (!touchesOnlyGridFillers(transaction, tables)) return true;
              notifyRefusal(options, "content");
              return false;
            }
            notifyRefusal(options, verdict);
            return false;
          },
          // Inert while an IME composes. A composition cannot reach a filler
          // (filterTransaction above refuses typing into one), and a repair
          // appended mid-composition would be refused by the IME guard's own
          // filterTransaction anyway; the caret correction re-derives from
          // state on the guard's settle wake-up.
          appendTransaction: imeSafeAppendTransaction((transactions, oldState, newState) => {
            let appended: Transaction | null = null;
            const docChanged = transactions.some((tr) => tr.docChanged);
            const mapping = new Mapping();
            for (const transaction of transactions) {
              mapping.appendMapping(transaction.mapping);
            }
            if (docChanged) {
              // Judged per transaction, so a collaboration or system step in
              // the same batch neither hides nor takes the blame for what a
              // user-authored one did to a filler.
              const repairs = new Map<number, ProseMirrorNode>();
              // Filler tables whose grid a transaction changed: the table it
              // started from, and where the table stands now.
              const reshapedTables = new Map<number, ProseMirrorNode>();
              transactions.forEach((transaction, index) => {
                if (!transaction.docChanged) return;
                if (isRepair(transaction)) return;
                if (isExemptTransaction(transaction, editor)) return;
                const tables =
                  transaction.before === oldState.doc
                    ? tablesOf(oldState)
                    : findGridFillerTables(transaction.before);
                const { verdict, differences, reshaped } = judge(
                  tables,
                  transaction.mapping,
                  transaction.doc,
                  false,
                );
                const rest = new Mapping();
                for (const later of transactions.slice(index + 1)) {
                  rest.appendMapping(later.mapping);
                }
                for (const match of reshaped) {
                  const pos = rest.map(match.pos, 1);
                  if (!reshapedTables.has(pos)) reshapedTables.set(pos, match.before);
                }
                if (verdict !== "repair") return;
                for (const difference of differences) {
                  const pos = rest.map(difference.pos, 1);
                  const current = nodeAtSafe(newState.doc, pos);
                  if (
                    repairs.has(pos) ||
                    !current ||
                    current.type !== difference.after.type ||
                    sameGridFiller(difference.before, current)
                  ) {
                    continue;
                  }
                  repairs.set(
                    pos,
                    difference.before.type.create(
                      {
                        ...difference.before.attrs,
                        colwidth: current.attrs.colwidth,
                      },
                      difference.before.content,
                      difference.before.marks,
                    ),
                  );
                }
              });
              // A reshaped ragged table is kept in a shape Word can store
              // (see `normalizeGridFillerTable`), in the same undo step.
              const markups: Array<{ pos: number; filler: boolean }> = [];
              for (const [pos, before] of reshapedTables) {
                const table = nodeAtSafe(newState.doc, pos);
                if (!table || table.type.name !== "table") continue;
                const plan = normalizeGridFillerTable(before, table);
                if (!plan) continue;
                for (const offset of plan.mark) markups.push({ pos: pos + 1 + offset, filler: true });
                for (const offset of plan.unmark) markups.push({ pos: pos + 1 + offset, filler: false });
              }
              if (repairs.size > 0 || markups.length > 0) {
                const repair = newState.tr;
                for (const { pos, filler } of markups) {
                  const cell = repair.doc.nodeAt(pos);
                  if (!cell) continue;
                  repair.setNodeMarkup(pos, null, {
                    ...cell.attrs,
                    gridFiller: filler ? true : null,
                  });
                }
                for (const [pos, restored] of [...repairs].sort(
                  (left, right) => right[0] - left[0],
                )) {
                  const current = newState.doc.nodeAt(pos)!;
                  repair.replaceWith(pos, pos + current.nodeSize, restored);
                }
                repair.setMeta(documentTableGridFillerPluginKey, {
                  repair: true,
                } satisfies GridFillerMeta);
                appended = repair;
              }
            }

            const doc = appended?.doc ?? newState.doc;
            const selection = appended?.selection ?? newState.selection;
            const previousHead = appended
              ? appended.mapping.map(mapping.map(oldState.selection.head))
              : mapping.map(oldState.selection.head);
            const target = selectionOutsideGridFiller(
              doc,
              selection,
              previousHead,
              transactions.some((tr) => tr.getMeta("pointer") === true),
            );
            if (target) {
              appended = (appended ?? newState.tr).setSelection(target);
            }
            return appended;
          }),
          props: {
            decorations(state) {
              return (
                documentTableGridFillerPluginKey.getState(state)?.decorations ??
                DecorationSet.empty
              );
            },
            transformPasted(slice) {
              return stripGridFillerMarkers(slice);
            },
          },
        }),
      ];
    },
  });

export default DocumentTableGridFiller;
