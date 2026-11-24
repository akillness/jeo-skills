/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import {
  readWordTableLayout,
  type WordAutofitTableWidth,
} from "../../../../lib/document-word-table-autofit";
import { normalizeCellMargins, tableDefaultCellMargins } from "./tableCellStyle";

export { readWordTableLayout, type WordTableLayout } from "../../../../lib/document-word-table-autofit";

/**
 * The width rule Word sizes this table's columns by, or null when the
 * columns keep their stored widths. An explicit layout policy is the
 * table's current state; the source fact applies only while none is set.
 */
export function wordTableContentFit(
  table: ProseMirrorNode,
): WordAutofitTableWidth | null {
  const policy: unknown = table.attrs.tableLayoutPolicy;
  if (policy === "autofit_contents") return { type: "auto" };
  if (policy !== null && policy !== undefined) return null;
  const layout = readWordTableLayout(table.attrs);
  if (layout?.contentFit === "auto") return { type: "auto" };
  if (layout?.contentFit === "pct" && layout.contentFitPct !== null) {
    return { type: "pct", fraction: layout.contentFitPct / 5000 };
  }
  return null;
}

/** A cell's effective left/right margins: its own, else the table's. */
export function wordCellHorizontalMargins(
  table: ProseMirrorNode,
  cell: ProseMirrorNode,
): { readonly left: number | null; readonly right: number | null } {
  const own = normalizeCellMargins(cell.attrs.cellMargin);
  const table_ = tableDefaultCellMargins(table.attrs);
  return {
    left: own?.left ?? table_?.left ?? null,
    right: own?.right ?? table_?.right ?? null,
  };
}

/**
 * How far a text-aligned Word table's first column starts before its
 * indent: the first row's first cell's left margin (measured in Word for
 * Mac; a cell's own margin counts, not only the table default).
 */
function unstatedIndentOff(): boolean {
  return typeof window !== "undefined" && (window as { __docsUnstatedIndentOff?: boolean }).__docsUnstatedIndentOff === true;
}

export function wordTableTextOutdentPx(table: ProseMirrorNode): number {
  const layout = readWordTableLayout(table.attrs);
  if (layout?.textAligned !== true) return 0;
  // A table stating no indent stands at the margin (Word reads the outdent
  // from a stated indent only); A/B: window.__docsUnstatedIndentOff.
  if (layout.indentUnstated && !unstatedIndentOff()) return 0;
  const firstCell = table.firstChild?.firstChild;
  if (!firstCell) return 0;
  return wordCellHorizontalMargins(table, firstCell).left ?? 0;
}
