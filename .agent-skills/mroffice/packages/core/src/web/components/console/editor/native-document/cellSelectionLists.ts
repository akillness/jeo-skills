/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { CommandProps } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";

/** The list node types Bullets, Numbering and Checklist make. */
export type CellSelectionListType = "bulletList" | "orderedList" | "taskList";

/** Every paragraph between `from` and `to` is inside a list of `listType`. */
function textblocksListed(
  doc: ProseMirrorNode,
  from: number,
  to: number,
  listType: CellSelectionListType,
): boolean {
  let any = false;
  let all = true;
  doc.nodesBetween(from, to, (node, pos) => {
    if (!all) return false;
    if (!node.isTextblock) return true;
    any = true;
    const $pos = doc.resolve(pos);
    let listed = false;
    for (let depth = $pos.depth; depth > 0 && !listed; depth -= 1) {
      const name = $pos.node(depth).type.name;
      if (name === listType) listed = true;
      // A list inside a nested table of the cell is that table's, not the cell's.
      if (name === "tableCell" || name === "tableHeader") break;
    }
    if (!listed) all = false;
    return false;
  });
  return any && all;
}

/**
 * A command's `state` reads its selection and document as they were when
 * its transaction was last asked for: reading `state.tr` brings them up to
 * date with the selection set here, which the next command reads.
 */
function refreshChainableState(props: CommandProps): void {
  void props.state.tr;
}

/**
 * Bullets, Numbering or Checklist on cells selected as cells (a row picked
 * with Select > Row, a drag across cells): Word applies the list to the
 * paragraphs of every selected cell. The list commands work on one range of
 * text, and a cell selection's range runs from its first cell to its last,
 * which no single list can wrap: only the last cell took the bullets and
 * nothing said the first was left out (WUA 243).
 *
 * Each selected cell is done in turn with the one-range command, all in the
 * same transaction (one Undo step). As Word does, the command takes the
 * list off when every selected paragraph already has it, and otherwise
 * gives it to the cells that do not; the cell selection is kept.
 *
 * Returns null when the selection is not a cell selection (the caller runs
 * its one-range command as before).
 */
export function toggleListInSelectedCells(
  props: CommandProps,
  listType: CellSelectionListType,
  toggleOne: () => boolean,
): boolean | null {
  const { tr } = props;
  const selection = tr.selection;
  if (!(selection instanceof CellSelection)) return null;
  const cells: Array<{ from: number; to: number }> = [];
  selection.forEachCell((node, pos) => {
    cells.push({ from: pos + 1, to: pos + node.nodeSize - 1 });
  });
  if (cells.length === 0) return false;
  const anchorCell = selection.$anchorCell.pos;
  const headCell = selection.$headCell.pos;
  const allListed = cells.every((cell) => textblocksListed(tr.doc, cell.from, cell.to, listType));
  const start = tr.mapping.maps.length;
  const map = (pos: number, assoc: number) => tr.mapping.slice(start).map(pos, assoc);
  let applied = false;
  // The last cell first: the library's lift (taking a list off) checks its
  // range against the whole transaction's mapping, so a cell must not come
  // after steps written before it -- the first cell's lift made the second
  // cell's refuse. Steps after a cell leave its positions as they are.
  for (const cell of [...cells].sort((a, b) => b.from - a.from)) {
    const from = map(cell.from, 1);
    const to = map(cell.to, -1);
    if (to < from) continue;
    if (!allListed && textblocksListed(tr.doc, from, to, listType)) continue;
    tr.setSelection(TextSelection.between(tr.doc.resolve(from), tr.doc.resolve(to)));
    refreshChainableState(props);
    if (toggleOne()) applied = true;
  }
  try {
    tr.setSelection(CellSelection.create(tr.doc, map(anchorCell, -1), map(headCell, -1)));
  } catch {
    // The cells moved in a way that leaves no cell selection: the caret
    // stays where the last cell's list put it.
  }
  refreshChainableState(props);
  return applied;
}
