/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { HOLDS_TABLE } from "@mrnote/core/web/lib/editor/sheet-facts.ts";
import { plainTextEdits } from "@mrnote/core/web/components/console/editor/native-document/textblockOnlyEdits.ts";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
  TABLE_CELL_CONTINUES_ATTR,
  TABLE_CELL_EMPTY_TAIL_ATTR,
  TABLE_CONTINUES_ATTR,
  TABLE_FRAGMENT_ID_ATTR,
  TABLE_REPEATED_HEADER_ATTR,
  TABLE_SOURCE_CELL_COL_ATTR,
} from "@mrnote/core/web/components/console/editor/native-document/paged/tablePagination.ts";

/**
 * The empty paragraph Word requires after a table that ends a cell.
 *
 * A `w:tc` must end in a `w:p`, so a table nested at the end of a cell is
 * always followed by one empty paragraph. Word 16 gives that paragraph no
 * height: the host row ends right under the nested table. The editor drew it
 * as a full blank line. The paragraph is marked here while it is empty and
 * the stylesheet collapses it (`.docs-nested-table-end-paragraph`); text
 * typed into it ends the mark and it is a line again.
 */
export const NESTED_TABLE_END_PARAGRAPH_CLASS = "docs-nested-table-end-paragraph";

const nestedTableEndParagraphKey = new PluginKey<DecorationSet>("nestedTableEndParagraph");

function isCell(node: ProseMirrorNode | null | undefined): boolean {
  return node?.type.name === "tableCell" || node?.type.name === "tableHeader";
}

function sourceCol(cell: ProseMirrorNode, index: number): number {
  const stable = cell.attrs?.[TABLE_SOURCE_CELL_COL_ATTR];
  return typeof stable === "number" && Number.isInteger(stable) ? stable : index;
}

/**
 * The cells of the page pieces of a cut row whose content goes on in the
 * next piece (the cut fell inside them or before them), by the head cell
 * node. Their last block is not the cell's last block in Word: an empty
 * paragraph after a table there is an ordinary line (corpus R03-D23: a head
 * cut before the second of two empty paragraphs after a nested table drew
 * the first one with no height; the planner then pulled the second back for
 * 24px and the page grew by 48, and the two cuts alternated). A head cell
 * whose next piece is only the blank stand-in (`pageTableCellEmptyTail`)
 * holds the whole cell.
 */
function continuingHeadCells(doc: ProseMirrorNode): Set<ProseMirrorNode> {
  const continuing = new Set<ProseMirrorNode>();
  const pair = (head: ProseMirrorNode, tail: ProseMirrorNode) => {
    const headRow = head.lastChild;
    let tailRow: ProseMirrorNode | null = null;
    for (let index = 0; index < tail.childCount && !tailRow; index += 1) {
      const row = tail.child(index);
      if (row.attrs?.[TABLE_REPEATED_HEADER_ATTR] !== true) tailRow = row;
    }
    if (!headRow || !tailRow) return;
    const tails = new Map<number, ProseMirrorNode>();
    tailRow.forEach((cell, _offset, index) => {
      if (isCell(cell)) tails.set(sourceCol(cell, index), cell);
    });
    headRow.forEach((cell, _offset, index) => {
      if (!isCell(cell) || cell.attrs?.[TABLE_CELL_CONTINUES_ATTR] !== true) return;
      const tailCell = tails.get(sourceCol(cell, index));
      if (!tailCell || tailCell.attrs?.[TABLE_CELL_EMPTY_TAIL_ATTR] === true) return;
      continuing.add(cell);
      // A table the cut went through: its head ends this cell, its tail
      // opens the cell's next piece.
      const nestedHead = cell.lastChild;
      const nestedTail = tailCell.firstChild;
      if (
        nestedHead?.type.name === "table" &&
        nestedTail?.type.name === "table" &&
        nestedHead.attrs?.[TABLE_CONTINUES_ATTR] === true
      ) pair(nestedHead, nestedTail);
    });
  };
  // The pieces of one table stand at the top level, one fragment id, in order.
  const pieces = new Map<string, ProseMirrorNode[]>();
  doc.descendants((node) => {
    if (isCell(node)) return false;
    if (node.type.name !== "table") return true;
    const id = node.attrs?.[TABLE_FRAGMENT_ID_ATTR];
    if (typeof id === "string" && id.length > 0) {
      const list = pieces.get(id) ?? [];
      list.push(node);
      pieces.set(id, list);
    }
    return false;
  });
  for (const list of pieces.values()) {
    for (let index = 0; index + 1 < list.length; index += 1) {
      if (list[index].attrs?.[TABLE_CONTINUES_ATTR] === true) pair(list[index], list[index + 1]);
    }
  }
  return continuing;
}

/** The empty paragraph a Word picture-only paragraph leaves above its
 * pictures in a nested table's cell; the stylesheet collapses it. */
export const PICTURE_HOST_PARAGRAPH_CLASS = "docs-picture-host-paragraph";

function insideNestedTable(doc: ProseMirrorNode, cellPos: number): boolean {
  const $pos = doc.resolve(cellPos);
  let tables = 0;
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === "table") tables += 1;
  }
  return tables >= 2;
}

function decorations(doc: ProseMirrorNode): DecorationSet {
  const found: Decoration[] = [];
  let continuing: Set<ProseMirrorNode> | null = null;
  HOLDS_TABLE.descendants(doc, (node, pos) => {
    // A text block holds no cell: its inline content is not walked.
    if (node.isTextblock) return false;
    if (node.type.name !== "tableCell" && node.type.name !== "tableHeader") return true;
    const count = node.childCount;
    if (count >= 2 && insideNestedTable(doc, pos)) {
      // A Word paragraph holding only pictures, in a table nested in a cell:
      // the import draws its pictures after it (the flat cell's order, which
      // the save folds back), so the empty paragraph before them is their
      // line in Word, not a line of its own (corpus R03-D23: an 18 px blank
      // above each logo and button image, page 1 54 pt longer than Word's).
      let offset = pos + 1;
      for (let index = 0; index + 1 < count; index += 1) {
        const child = node.child(index);
        if (child.type.name === "paragraph" && child.content.size === 0 && node.child(index + 1).type.name === "image") {
          found.push(Decoration.node(offset, offset + child.nodeSize, { class: PICTURE_HOST_PARAGRAPH_CLASS }));
        }
        offset += child.nodeSize;
      }
    }
    if (count >= 2 && node.attrs?.[TABLE_CELL_CONTINUES_ATTR] === true) {
      continuing ??= continuingHeadCells(doc);
      if (continuing.has(node)) return true;
    }
    if (count >= 2) {
      const last = node.child(count - 1);
      const before = node.child(count - 2);
      if (last.type.name === "paragraph" && last.content.size === 0 && before.type.name === "table") {
        const from = pos + node.nodeSize - 1 - last.nodeSize;
        found.push(
          Decoration.node(from, from + last.nodeSize, { class: NESTED_TABLE_END_PARAGRAPH_CLASS }),
        );
      }
    }
    // A nested table's own cells may hold tables too.
    return true;
  });
  return found.length ? DecorationSet.create(doc, found) : DecorationSet.empty;
}

export function createNestedTableEndParagraphPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: nestedTableEndParagraphKey,
    state: {
      init: (_config, state) => decorations(state.doc),
      apply: (tr, value) => {
        if (!tr.docChanged) return value;
        // These name empty paragraphs and the tables around them: text typed
        // into a paragraph that holds text changes neither.
        return plainTextEdits(tr) ? value.map(tr.mapping, tr.doc) : decorations(tr.doc);
      },
    },
    props: {
      decorations: (state) => nestedTableEndParagraphKey.getState(state),
    },
  });
}
