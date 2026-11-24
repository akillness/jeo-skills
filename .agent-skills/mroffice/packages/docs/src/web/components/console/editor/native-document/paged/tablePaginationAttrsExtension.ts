/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { TextSelection, type EditorState } from "@tiptap/pm/state";

import {
  TABLE_BLOCK_CONTINUATION_ATTR,
  TABLE_BLOCK_CONTINUES_ATTR,
  TABLE_CELL_CONTINUATION_ATTR,
  TABLE_CELL_CONTINUES_ATTR,
  TABLE_CELL_EMPTY_HEAD_ATTR,
  TABLE_CELL_EMPTY_TAIL_ATTR,
  TABLE_CONTINUATION_ATTR,
  TABLE_CONTINUES_ATTR,
  TABLE_FRAGMENT_END_ROW_ATTR,
  TABLE_FRAGMENT_ID_ATTR,
  TABLE_FRAGMENT_START_ROW_ATTR,
  TABLE_ORIGINAL_ROWSPAN_ATTR,
  TABLE_REPEATED_HEADER_ATTR,
  TABLE_ROW_CONTINUATION_ATTR,
  TABLE_ROW_CONTINUES_ATTR,
  TABLE_SOURCE_CELL_COL_ATTR,
  TABLE_SOURCE_ROW_ATTR,
  TABLE_UNBREAKABLE_FALLBACK_ATTR,
  TABLE_VERTICAL_CONTINUATION_ATTR,
} from "@mrnote/core/web/components/console/editor/native-document/paged/tablePagination.ts";
import { createTableFragmentAttrsSyncPlugin } from "@mrnote/core/web/components/console/editor/native-document/paged/tableFragmentGroups.ts";

function dataName(key: string): string {
  return `data-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

function boolAttr(key: string, options: { readOnly?: boolean } = {}) {
  const name = dataName(key);
  return {
    default: false,
    parseHTML: (element: HTMLElement) => element.getAttribute(name) === "true",
    renderHTML: (attrs: Record<string, unknown>) =>
      attrs[key] === true
        ? {
            [name]: "true",
            ...(options.readOnly
              ? { contenteditable: "false", "aria-readonly": "true" }
              : {}),
          }
        : {},
  };
}

/**
 * The head half of a cell block a row cut goes through: a paragraph or
 * heading cut through its lines draws no space after, which belongs to its
 * last line on the next page (Word: corpus R417-D03, the 23rd line of a
 * one-word-wide cell drawn where the page held the line but not the 10pt
 * space after it). The planner fits the head without it (planTableCellCuts).
 * `window.__docsCellSplitSpaceAfterOff = true`: as before (A/B).
 */
function continuesAttr() {
  const plain = boolAttr(TABLE_BLOCK_CONTINUES_ATTR);
  return {
    ...plain,
    renderHTML: (attrs: Record<string, unknown>) => {
      const base = plain.renderHTML(attrs);
      if (attrs[TABLE_BLOCK_CONTINUES_ATTR] !== true) return base;
      const off = typeof window !== "undefined" && (window as Window & { __docsCellSplitSpaceAfterOff?: boolean }).__docsCellSplitSpaceAfterOff === true;
      // A data attribute the stylesheet reads (note-editor.css): a style here
      // was merged under the paragraph's own margin-bottom and lost.
      return off ? base : { ...base, "data-page-table-block-space-dropped": "true" };
    },
  };
}

/**
 * The rest of a cell whose content all stood on the page before draws
 * nothing in Word: the row's rest is as tall as its other cells' lines, its
 * stand-in paragraph's line and space after take no room (Word 16.86, probes
 * tables/probes/tail t1-t4: a 2000-twip cell's empty rest, its 8pt or 12pt
 * mark, a "Machinery" with 10pt after or none, centred or top: the rest drew
 * 39.86pt every time, its paddings and three lines; corpus R417-D03 page 10,
 * where the stand-ins' 11pt line and 10pt after made the rest 33.9pt).
 * `window.__docsEmptyTailFlatOff = true`: the stand-in keeps its line (A/B).
 */
function emptyTailAttr() {
  const plain = boolAttr(TABLE_CELL_EMPTY_TAIL_ATTR);
  return {
    ...plain,
    renderHTML: (attrs: Record<string, unknown>) => {
      const base = plain.renderHTML(attrs);
      if (attrs[TABLE_CELL_EMPTY_TAIL_ATTR] !== true) return base;
      const off = typeof window !== "undefined" && (window as Window & { __docsEmptyTailFlatOff?: boolean }).__docsEmptyTailFlatOff === true;
      // The stylesheet flattens the stand-in (note-editor.css).
      return off ? base : { ...base, "data-page-table-cell-rest-flat": "true" };
    },
  };
}

function intAttr(key: string) {
  const name = dataName(key);
  const normalize = (value: unknown): number | null => {
    const parsed =
      typeof value === "number" ? value : Number.parseInt(String(value), 10);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= 100_000
      ? parsed
      : null;
  };
  return {
    default: null,
    parseHTML: (element: HTMLElement) => normalize(element.getAttribute(name)),
    renderHTML: (attrs: Record<string, unknown>) => {
      const value = normalize(attrs[key]);
      return value === null ? {} : { [name]: String(value) };
    },
  };
}

function idAttr(key: string) {
  const name = dataName(key);
  const normalize = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return /^[A-Za-z0-9._:-]{1,128}$/.test(trimmed) ? trimmed : null;
  };
  return {
    default: null,
    parseHTML: (element: HTMLElement) => normalize(element.getAttribute(name)),
    renderHTML: (attrs: Record<string, unknown>) => {
      const value = normalize(attrs[key]);
      return value === null ? {} : { [name]: value };
    },
  };
}

/**
 * Schema bridge for the pure table pagination helper.
 *
 * Register this extension beside PageRebalance. It does not paginate; it
 * allows editor-runtime fragment metadata to survive ProseMirror node creation
 * and keeps table-level attributes identical across a table's page fragments.
 * `mergeTableContinuationsJson` removes all of these attributes before any
 * semantic boundary.
 */
/** The cell the caret is in: its depth, and the table holding it. */
function caretCell(state: EditorState): { depth: number; table: PmNode; tablePos: number } | null {
  const { $head } = state.selection;
  for (let depth = $head.depth; depth > 2; depth -= 1) {
    const name = $head.node(depth).type.name;
    if (name !== "tableCell" && name !== "tableHeader") continue;
    const table = $head.node(depth - 2);
    if (table.type.name !== "table") return null;
    return { depth, table, tablePos: $head.before(depth - 2) };
  }
  return null;
}

/** The fragment of the same logical table before or after `tablePos`. */
function siblingFragment(
  doc: PmNode,
  table: PmNode,
  tablePos: number,
  direction: 1 | -1,
): { node: PmNode; pos: number } | null {
  const id = table.attrs[TABLE_FRAGMENT_ID_ATTR];
  if (!id) return null;
  let found: { node: PmNode; pos: number } | null = null;
  doc.descendants((node, pos) => {
    if (direction === 1 && found) return false;
    if (node.type.name !== "table") return true;
    if (node.attrs[TABLE_FRAGMENT_ID_ATTR] === id) {
      if (direction === 1 && pos > tablePos) found = { node, pos };
      if (direction === -1 && pos < tablePos) found = { node, pos };
    }
    return false;
  });
  return found;
}

/** Select a cell's content, as Tab's own cell move does. */
function selectCell(state: EditorState, cellPos: number, cell: PmNode) {
  return state.tr
    .setSelection(TextSelection.between(state.doc.resolve(cellPos + 1), state.doc.resolve(cellPos + cell.nodeSize - 1)))
    .scrollIntoView();
}








function moveAcrossFragments(state: EditorState, direction: 1 | -1) {
  const at = caretCell(state);
  if (!at) return null;
  const { $head } = state.selection;
  const { table, tablePos, depth } = at;
  const rowIndex = $head.index(depth - 2);
  const cellIndex = $head.index(depth - 1);
  const row = table.child(rowIndex);
  if (direction === 1) {
    if (table.attrs[TABLE_CONTINUES_ATTR] !== true) return null;
    if (rowIndex !== table.childCount - 1 || cellIndex !== row.childCount - 1) return null;
  } else {
    if (table.attrs[TABLE_CONTINUATION_ATTR] !== true || cellIndex !== 0) return null;
    let firstBody = 0;
    while (firstBody < table.childCount && table.child(firstBody).attrs[TABLE_REPEATED_HEADER_ATTR] === true) firstBody += 1;
    if (rowIndex !== firstBody) return null;
  }
  const sibling = siblingFragment(state.doc, table, tablePos, direction);
  if (!sibling) return null;
  let target: { cell: PmNode; pos: number } | null = null;
  let rowPos = sibling.pos + 1;
  sibling.node.forEach((candidate) => {
    if (candidate.attrs[TABLE_REPEATED_HEADER_ATTR] !== true && candidate.childCount > 0) {
      if (direction === 1 && !target) target = { cell: candidate.firstChild!, pos: rowPos + 1 };
      if (direction === -1) target = { cell: candidate.lastChild!, pos: rowPos + candidate.nodeSize - 1 - candidate.lastChild!.nodeSize };
    }
    rowPos += candidate.nodeSize;
  });
  if (!target) return null;
  const { cell, pos } = target as { cell: PmNode; pos: number };
  return selectCell(state, pos, cell);
}

export const TableFragmentNavigation = Extension.create({
  name: "tableFragmentNavigation",
  // Ahead of the table's own Tab, which would add a row at a page edge.
  priority: 1000,
  addKeyboardShortcuts() {
    const run = (direction: 1 | -1) => () => {
      const tr = moveAcrossFragments(this.editor.state, direction);
      if (!tr) return false;
      this.editor.view.dispatch(tr);
      return true;
    };
    return { Tab: run(1), "Shift-Tab": run(-1) };
  },
});

export const TablePaginationRuntimeAttrs = Extension.create({
  name: "tablePaginationRuntimeAttrs",
  addProseMirrorPlugins() {
    // Table-level attributes belong to the logical table: an edit made through
    // one page fragment is applied to all of them.
    return [createTableFragmentAttrsSyncPlugin()];
  },
  addGlobalAttributes() {
    return [
      {
        types: ["table"],
        attributes: {
          [TABLE_FRAGMENT_ID_ATTR]: idAttr(TABLE_FRAGMENT_ID_ATTR),
          [TABLE_CONTINUES_ATTR]: boolAttr(TABLE_CONTINUES_ATTR),
          [TABLE_CONTINUATION_ATTR]: boolAttr(TABLE_CONTINUATION_ATTR),
          [TABLE_FRAGMENT_START_ROW_ATTR]: intAttr(
            TABLE_FRAGMENT_START_ROW_ATTR,
          ),
          [TABLE_FRAGMENT_END_ROW_ATTR]: intAttr(TABLE_FRAGMENT_END_ROW_ATTR),
          [TABLE_UNBREAKABLE_FALLBACK_ATTR]: boolAttr(
            TABLE_UNBREAKABLE_FALLBACK_ATTR,
          ),
        },
      },
      {
        types: ["tableRow"],
        attributes: {
          [TABLE_SOURCE_ROW_ATTR]: intAttr(TABLE_SOURCE_ROW_ATTR),
          // Repeated rows are a Word-style physical projection of the source
          // header, not a second semantic row. Keeping the clone read-only
          // prevents an edit that serialization would otherwise have to drop;
          // the original header remains fully editable and is repeated again
          // on the next pagination pass.
          [TABLE_REPEATED_HEADER_ATTR]: boolAttr(TABLE_REPEATED_HEADER_ATTR, {
            readOnly: true,
          }),
          [TABLE_ROW_CONTINUES_ATTR]: boolAttr(TABLE_ROW_CONTINUES_ATTR),
          [TABLE_ROW_CONTINUATION_ATTR]: boolAttr(TABLE_ROW_CONTINUATION_ATTR),
        },
      },
      {
        types: ["tableCell", "tableHeader"],
        attributes: {
          [TABLE_SOURCE_CELL_COL_ATTR]: intAttr(TABLE_SOURCE_CELL_COL_ATTR),
          [TABLE_VERTICAL_CONTINUATION_ATTR]: boolAttr(
            TABLE_VERTICAL_CONTINUATION_ATTR,
          ),
          [TABLE_ORIGINAL_ROWSPAN_ATTR]: intAttr(TABLE_ORIGINAL_ROWSPAN_ATTR),
          [TABLE_CELL_CONTINUES_ATTR]: boolAttr(TABLE_CELL_CONTINUES_ATTR),
          [TABLE_CELL_CONTINUATION_ATTR]: boolAttr(
            TABLE_CELL_CONTINUATION_ATTR,
          ),
          [TABLE_CELL_EMPTY_HEAD_ATTR]: boolAttr(TABLE_CELL_EMPTY_HEAD_ATTR),
          [TABLE_CELL_EMPTY_TAIL_ATTR]: emptyTailAttr(),
        },
      },
      {
        // Word table cells normally contain paragraphs; heading/codeBlock are
        // also legal in MRNote cells and can be bisected by a measured cursor.
        // A list in a cell is broken between its items (the "listItems" cut).
        types: ["paragraph", "heading"],
        attributes: {
          [TABLE_BLOCK_CONTINUES_ATTR]: continuesAttr(),
          [TABLE_BLOCK_CONTINUATION_ATTR]: boolAttr(
            TABLE_BLOCK_CONTINUATION_ATTR,
          ),
        },
      },
      {
        types: ["codeBlock", "bulletList", "orderedList", "taskList"],
        attributes: {
          [TABLE_BLOCK_CONTINUES_ATTR]: boolAttr(TABLE_BLOCK_CONTINUES_ATTR),
          [TABLE_BLOCK_CONTINUATION_ATTR]: boolAttr(
            TABLE_BLOCK_CONTINUATION_ATTR,
          ),
        },
      },
    ];
  },
});

export default TablePaginationRuntimeAttrs;
