"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { HOLDS_TABLE } from "../../../../lib/editor/sheet-facts";
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { TableMap } from "@tiptap/pm/tables";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { readWordTableLayout } from "../../../../lib/document-word-table-autofit";

import { TABLE_FRAGMENT_START_ROW_ATTR, TABLE_SOURCE_ROW_ATTR } from "./paged/tablePagination";
import { plainTextEdits } from "./textblockOnlyEdits";

/**
 * Word's `w:tcPr/w:noWrap`: the cell's words do not wrap, and an AutoFit
 * table gives its column their whole width (corpus R436-D30: a 14-digit
 * coefficient per row, wrapped here onto a second line, every row two lines
 * tall and the table's first page holding half of Word's rows). The import
 * names the cells in the table's source receipt (`source.noWrapCells`, grid
 * slots of the table as read); a part of a table the pages cut finds its rows
 * there by their source row.
 */
export const TABLE_NO_WRAP_ATTR = "data-word-no-wrap";

const tableNoWrapKey = new PluginKey<DecorationSet>("documentTableNoWrap");

export function noWrapSlots(table: ProseMirrorNode): Set<string> | null {
  const source = table.attrs?.source as { adapter?: unknown; noWrapCells?: unknown } | null | undefined;
  if (!source || source.adapter !== "docx" || !Array.isArray(source.noWrapCells)) return null;
  // A fixed-layout table wraps every cell's words, w:noWrap or not
  // (ISO/IEC 29500-1 17.4.30: the property only shapes an AutoFit table).
  if (readWordTableLayout(table.attrs)?.fixedLayout) return null;
  const slots = new Set<string>();
  for (const slot of source.noWrapCells.slice(0, 4096)) {
    if (Array.isArray(slot) && slot.length === 2 && Number.isInteger(slot[0]) && Number.isInteger(slot[1])) {
      slots.add(`${slot[0]}:${slot[1]}`);
    }
  }
  return slots.size ? slots : null;
}

/** The row of the table as read that the part's `row` stands for. */
export function sourceRowOf(table: ProseMirrorNode, row: number): number {
  const own = table.child(row).attrs?.[TABLE_SOURCE_ROW_ATTR];
  if (Number.isInteger(own)) return own as number;
  const start = table.attrs?.[TABLE_FRAGMENT_START_ROW_ATTR];
  return (Number.isInteger(start) ? (start as number) : 0) + row;
}

export function buildTableNoWrapDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  HOLDS_TABLE.descendants(doc, (node, pos) => {
    if (node.isTextblock || node.isAtom) return false;
    if (node.type.name !== "table") return true;
    const slots = noWrapSlots(node);
    if (slots) {
      let map: TableMap;
      try {
        map = TableMap.get(node);
      } catch {
        return true;
      }
      const seen = new Set<number>();
      for (let row = 0; row < map.height; row += 1) {
        const sourceRow = sourceRowOf(node, row);
        for (let col = 0; col < map.width; col += 1) {
          const offset = map.map[row * map.width + col];
          if (seen.has(offset)) continue;
          seen.add(offset);
          if (!slots.has(`${sourceRow}:${col}`)) continue;
          const cell = node.nodeAt(offset);
          if (!cell) continue;
          const from = pos + 1 + offset;
          decorations.push(Decoration.node(from, from + cell.nodeSize, { [TABLE_NO_WRAP_ATTR]: "true" }));
        }
      }
    }
    // Nested tables carry their own receipts.
    return true;
  });
  return decorations.length ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

const DocumentTableNoWrap = Extension.create({
  name: "documentTableNoWrap",

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: tableNoWrapKey,
        state: {
          init: (_config, state) => buildTableNoWrapDecorations(state.doc),
          apply: (tr, value, _old, state) => {
            if (!tr.docChanged) return value;
            return plainTextEdits(tr) ? value.map(tr.mapping, tr.doc) : buildTableNoWrapDecorations(state.doc);
          },
        },
        props: {
          decorations: (state) => tableNoWrapKey.getState(state) ?? DecorationSet.empty,
        },
      }),
    ];
  },
});

export default DocumentTableNoWrap;
