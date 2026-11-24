/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TableMap } from "@tiptap/pm/tables";
import { normalizeTableColumnWidthsTwips } from "./tableStructure";

/** Complete native grids stay semantic; only their painted view may be fitted. */
export function nativeTableGridWidths(table: ProseMirrorNode): number[] | null {
  const map = TableMap.get(table);
  const widths = Array<number>(map.width).fill(0);
  const sourceProfile = table.attrs.source?.tableGridProfile === 1;
  let allCompanionsMatch = true;
  const seen = new Set<number>();
  for (let gridIndex = 0; gridIndex < map.map.length; gridIndex += 1) {
    const offset = map.map[gridIndex];
    if (seen.has(offset)) continue;
    seen.add(offset);
    const cell = table.nodeAt(offset);
    if (!cell) return null;
    const column = gridIndex % map.width;
    const span = Number(cell.attrs.colspan) || 1;
    const live: unknown = cell.attrs.colwidth;
    if (!Array.isArray(live) || live.length !== span) return null;
    const native = normalizeTableColumnWidthsTwips(cell.attrs.colwidthTwips, span);
    for (let index = 0; index < span; index += 1) {
      const value: unknown = live[index];
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 5000) return null;
      const previous = widths[column + index];
      if (previous && Math.abs(previous - value) > 0.000001) return null;
      widths[column + index] = value;
      if (!native || Math.abs(native[index] - value * 15) > 2) allCompanionsMatch = false;
    }
  }
  return (sourceProfile || allCompanionsMatch) && widths.length > 0 && widths.every(width => width > 0)
    ? widths : null;
}
