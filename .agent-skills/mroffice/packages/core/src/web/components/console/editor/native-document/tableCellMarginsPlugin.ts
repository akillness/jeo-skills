/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { editsStayInsideTextblocks } from "./textblockOnlyEdits";
import { HOLDS_TABLE } from "../../../../lib/editor/sheet-facts";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { TableMap } from "@tiptap/pm/tables";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import {
  CELL_MARGIN_SIDES,
  normalizeCellMargins,
  tableDefaultCellMargins,
  type CellMargins,
} from "./tableCellStyle";

/**
 * A cell decoration spec key: the CSS properties the decoration sets on the
 * cell, which the cell's node view must not overwrite with the schema's
 * own value of the same property.
 */
export const TABLE_CELL_DECORATION_STYLE_PROPERTIES = "cellStyleProperties";

function stableCellMarginsJson(margins: CellMargins): string {
  const ordered: Partial<
    Record<(typeof CELL_MARGIN_SIDES)[number], number>
  > = {};
  for (const side of CELL_MARGIN_SIDES) {
    const value = margins[side];
    if (value !== undefined) ordered[side] = value;
  }
  return JSON.stringify(ordered);
}

export function readTableCellMarginsFromElement(element: {
  getAttribute(name: string): string | null;
}): CellMargins | null {
  const serialized = element.getAttribute("data-table-cell-margins");
  if (!serialized) return null;
  try {
    return normalizeCellMargins(JSON.parse(serialized));
  } catch {
    return null;
  }
}

export function tableCellMarginsAttributes(
  value: unknown,
): Record<string, string> {
  const margins = normalizeCellMargins(value);
  return margins
    ? { "data-table-cell-margins": stableCellMarginsJson(margins) }
    : {};
}

/**
 * Word's row rule for vertical cell margins: a row's cells all take the
 * largest top margin and the largest bottom margin any of its cells has
 * (direct `w:tcMar`, else the table's default). Keyed by the cell's offset
 * in the table; only rows whose cells disagree are listed.
 */
function wordRowVerticalMargins(
  table: ProseMirrorNode,
  tableMargins: CellMargins | null,
): Map<number, { top?: number; bottom?: number }> {
  const result = new Map<number, { top?: number; bottom?: number }>();
  let offset = 0;
  table.forEach((row) => {
    const rowStart = offset + 1;
    const cells: Array<{ offset: number; top?: number; bottom?: number }> = [];
    row.forEach((cell, cellOffset) => {
      const direct = normalizeCellMargins(cell.attrs.cellMargin);
      cells.push({
        offset: rowStart + cellOffset,
        top: direct?.top ?? tableMargins?.top,
        bottom: direct?.bottom ?? tableMargins?.bottom,
      });
    });
    const maxOf = (side: "top" | "bottom"): number | undefined => {
      const values = cells.map((cell) => cell[side]).filter((value): value is number => value !== undefined);
      if (values.length === 0) return undefined;
      const max = Math.max(...values);
      return max > 0 && cells.some((cell) => cell[side] !== max) ? max : undefined;
    };
    const top = maxOf("top");
    const bottom = maxOf("bottom");
    if (top !== undefined || bottom !== undefined) {
      for (const cell of cells) {
        result.set(cell.offset, {
          ...(top !== undefined ? { top } : {}),
          ...(bottom !== undefined ? { bottom } : {}),
        });
      }
    }
    offset += row.nodeSize;
  });
  return result;
}

function tableCellMarginDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  // Every table is decorated from its OWN margins, nested tables included:
  // a table inside a cell has its own `w:tblCellMar`, and stopping at the
  // outer table left it without any. Descending is how a nested table is
  // reached; the outer table's padding is applied to its own cells only.
  HOLDS_TABLE.descendants(doc, (node, pos) => {
    if (node.type.name !== "table") return !node.isTextblock;
    const tableMargins = tableDefaultCellMargins(node.attrs);
    const rowMargins = wordRowVerticalMargins(node, tableMargins);
    if (!tableMargins && rowMargins.size === 0) return true;

    // The table's own margins are its attr; inherited ones are only padding.
    const ownMargins = normalizeCellMargins(node.attrs.tableCellMargin);
    if (ownMargins) {
      decorations.push(
        Decoration.node(
          pos,
          pos + node.nodeSize,
          tableCellMarginsAttributes(ownMargins),
        ),
      );
    }

    let map: TableMap;
    try {
      map = TableMap.get(node);
    } catch {
      return true;
    }
    for (const offset of new Set(map.map)) {
      const cell = node.nodeAt(offset);
      if (
        !cell ||
        (cell.type.name !== "tableCell" && cell.type.name !== "tableHeader")
      ) {
        continue;
      }
      const direct = normalizeCellMargins(cell.attrs.cellMargin);
      const row = rowMargins.get(offset);
      const inheritedStyle = CELL_MARGIN_SIDES.flatMap((side) => {
        // Word lays every cell of a row out with the row's largest top and
        // bottom margin (b-table probe: one cell's 0.2in top margin moves
        // the text of the whole row down).
        const rowValue = side === "top" ? row?.top : side === "bottom" ? row?.bottom : undefined;
        const own = direct?.[side] ?? tableMargins?.[side];
        if (rowValue !== undefined && (own === undefined || own < rowValue)) {
          return [`padding-${side}:${rowValue}px`];
        }
        if (direct?.[side] !== undefined) return [];
        const value = tableMargins?.[side];
        return value === undefined ? [] : [`padding-${side}:${value}px`];
      }).join(";");
      if (!inheritedStyle) continue;
      const cellPos = pos + 1 + offset;
      decorations.push(
        Decoration.node(
          cellPos,
          cellPos + cell.nodeSize,
          { style: inheritedStyle },
          // The padding this decoration sets over the cell's own: the cell
          // view leaves these to it when it syncs the cell's schema styles,
          // or a row selection wrote the cell's own top margin back over the
          // row's and the text jumped (WUA 257).
          {
            [TABLE_CELL_DECORATION_STYLE_PROPERTIES]: inheritedStyle
              .split(";")
              .map((declaration) => declaration.split(":")[0]!.trim())
              .filter(Boolean),
          },
        ),
      );
    }
    return true;
  });
  return decorations.length > 0
    ? DecorationSet.create(doc, decorations)
    : DecorationSet.empty;
}

interface TableCellMarginsPluginState {
  readonly decorations: DecorationSet;
}

const tableCellMarginsPluginKey = new PluginKey<TableCellMarginsPluginState>(
  "documentTableCellMargins",
);

export function createDocumentTableCellMarginsPlugin(): Plugin<TableCellMarginsPluginState> {
  return new Plugin<TableCellMarginsPluginState>({
    key: tableCellMarginsPluginKey,
    state: {
      init: (_config, state) => ({
        decorations: tableCellMarginDecorations(state.doc),
      }),
      apply: (transaction, current) =>
        transaction.docChanged
          ? {
              // Words typed in a block move no cell's margin.
              decorations: editsStayInsideTextblocks([transaction])
                ? current.decorations.map(transaction.mapping, transaction.doc)
                : tableCellMarginDecorations(transaction.doc),
            }
          : current,
    },
    props: {
      decorations: (state) =>
        tableCellMarginsPluginKey.getState(state)?.decorations ??
        DecorationSet.empty,
    },
  });
}
