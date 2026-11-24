"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { HOLDS_TABLE } from "@mrnote/core/web/lib/editor/sheet-facts.ts";
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { TableMap } from "@tiptap/pm/tables";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { TABLE_BLOCK_CONTINUATION_ATTR } from "@mrnote/core/web/components/console/editor/native-document/paged/tablePagination.ts";
import { plainTextEdits } from "@mrnote/core/web/components/console/editor/native-document/textblockOnlyEdits.ts";

/**
 * Word's `w:tcPr/w:hideMark`: the cell's end mark is left out of its row's
 * height, so an empty cell adds nothing to the row. A spacer row of empty
 * cells is a hairline in Word (R31-D03: a 0.45pt row between two paragraphs)
 * and stood a whole line tall here. The import names the cells in the
 * table's source receipt (`source.hideMarkCells`, grid slots of the table as
 * read); a cell holding words is not affected, as in Word.
 */
export const TABLE_HIDE_MARK_ATTR = "data-word-hide-mark";
/**
 * The same cell's last paragraph when it is empty and the cell holds more:
 * that paragraph is only the end-of-cell mark, which Word leaves out of the
 * row's height, its spacing with it (tables/probes/hidemark, Windows Word,
 * modes 14 and 15: [words, empty] is one line tall, [words, empty, empty]
 * two, [words, empty with 12 pt before or after] one; an empty paragraph
 * between two with words keeps its line). Corpus R382-D11 page 9: a title
 * cell [Chinese, empty, English, empty] stood a line taller than Word's row,
 * and the table's last row went to the next page.
 */
export const TABLE_HIDE_MARK_TAIL_ATTR = "data-word-hide-mark-tail";

/**
 * Harness switch (`window.__docsHideMarkTailOff = true`): a hideMark cell
 * that holds words keeps its empty last paragraph's line, as before (A/B).
 */
function hideMarkTailOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsHideMarkTailOff?: boolean }).__docsHideMarkTailOff === true;
}

const tableHideMarkKey = new PluginKey<DecorationSet>("documentTableHideMark");

function hideMarkSlots(table: ProseMirrorNode): Set<string> | null {
  const source = table.attrs?.source as { adapter?: unknown; hideMarkCells?: unknown } | null | undefined;
  if (!source || source.adapter !== "docx" || !Array.isArray(source.hideMarkCells)) return null;
  // A table the pages cut starts its later parts at another row: the slots
  // name rows of the table as read, so only its first part is drawn so.
  if (table.attrs?.[TABLE_BLOCK_CONTINUATION_ATTR] === true) return null;
  const slots = new Set<string>();
  for (const slot of source.hideMarkCells.slice(0, 4096)) {
    if (Array.isArray(slot) && slot.length === 2 && Number.isInteger(slot[0]) && Number.isInteger(slot[1])) {
      slots.add(`${slot[0]}:${slot[1]}`);
    }
  }
  return slots.size ? slots : null;
}

function isEmptyCell(cell: ProseMirrorNode): boolean {
  return cell.childCount === 1 && cell.firstChild!.isTextblock && cell.firstChild!.content.size === 0;
}

/** Offset in the cell of its empty last paragraph when the cell holds more. */
function emptyTailOffset(cell: ProseMirrorNode): number | null {
  if (cell.childCount < 2) return null;
  const last = cell.lastChild!;
  if (!last.isTextblock || last.content.size !== 0) return null;
  return cell.content.size - last.nodeSize;
}

export function buildTableHideMarkDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  const tails = !hideMarkTailOff();
  HOLDS_TABLE.descendants(doc, (node, pos) => {
    if (node.isTextblock || node.isAtom) return false;
    if (node.type.name !== "table") return true;
    const slots = hideMarkSlots(node);
    if (slots) {
      let map: TableMap;
      try {
        map = TableMap.get(node);
      } catch {
        return true;
      }
      const seen = new Set<number>();
      for (let row = 0; row < map.height; row += 1) {
        for (let col = 0; col < map.width; col += 1) {
          const offset = map.map[row * map.width + col];
          if (seen.has(offset)) continue;
          seen.add(offset);
          if (!slots.has(`${row}:${col}`)) continue;
          const cell = node.nodeAt(offset);
          if (!cell) continue;
          const from = pos + 1 + offset;
          if (isEmptyCell(cell)) {
            decorations.push(Decoration.node(from, from + cell.nodeSize, { [TABLE_HIDE_MARK_ATTR]: "true" }));
            continue;
          }
          const tail = tails ? emptyTailOffset(cell) : null;
          if (tail !== null) {
            const at = from + 1 + tail;
            decorations.push(Decoration.node(at, at + cell.lastChild!.nodeSize, { [TABLE_HIDE_MARK_TAIL_ATTR]: "true" }));
          }
        }
      }
    }
    // Nested tables carry their own receipts.
    return true;
  });
  return decorations.length ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

const DocumentTableHideMark = Extension.create({
  name: "documentTableHideMark",

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: tableHideMarkKey,
        state: {
          init: (_config, state) => buildTableHideMarkDecorations(state.doc),
          apply: (tr, value, _old, state) => {
            if (!tr.docChanged) return value;
            // A cell's text changing, not to or from nothing, leaves it what it was.
            return plainTextEdits(tr) ? value.map(tr.mapping, tr.doc) : buildTableHideMarkDecorations(state.doc);
          },
        },
        props: {
          decorations: (state) => tableHideMarkKey.getState(state) ?? DecorationSet.empty,
        },
      }),
    ];
  },
});

export default DocumentTableHideMark;
