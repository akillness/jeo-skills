/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";


// The selection AI affordance hands the SELECTED table's data to the notebook
// AI panel as a GFM pipe table inside a structured "propose a chart block"
// request. The AI writes chart DATA through the standard proposal-confirm
// flow — this module only reads and serializes, never mutates the document.

// Bounds keep the seeded prompt reviewable in the chat composer (and well
// under the chart node's own server-side caps of 50 categories / 10 series).
const MAX_TABLE_ROWS = 30;
const MAX_TABLE_COLS = 12;
const MAX_CELL_CHARS = 120;

function cellText(cell: ProseMirrorNode): string {
  const text = cell.textContent.replace(/\s+/g, " ").trim();
  const clipped =
    text.length > MAX_CELL_CHARS ? `${text.slice(0, MAX_CELL_CHARS)}…` : text;
  // Escape pipes so cell content can never break the table shape.
  return clipped.replace(/\|/g, "\\|");
}

/** Serialize a ProseMirror `table` node as a GFM pipe table (text only). */
export function tableNodeToMarkdown(table: ProseMirrorNode): string | null {
  const rows: string[][] = [];
  table.forEach((row) => {
    if (row.type.name !== "tableRow" || rows.length >= MAX_TABLE_ROWS) return;
    const cells: string[] = [];
    row.forEach((cell) => {
      if (cells.length >= MAX_TABLE_COLS) return;
      cells.push(cellText(cell));
    });
    if (cells.length) rows.push(cells);
  });
  if (rows.length < 2) return null; // header + at least one data row
  const width = Math.max(...rows.map((cells) => cells.length));
  const pad = (cells: string[]) =>
    `| ${Array.from({ length: width }, (_, i) => cells[i] ?? "").join(" | ")} |`;
  const [header, ...body] = rows;
  return [
    pad(header),
    `| ${Array.from({ length: width }, () => "---").join(" | ")} |`,
    ...body.map(pad),
  ].join("\n");
}

/**
 * First `table` node intersecting the selection `[from, to]`, serialized as a
 * pipe table — or `null` when the selection contains no usable table (the
 * host then simply does not offer 「生成图表」).
 */
export function selectionTableMarkdown(
  doc: ProseMirrorNode,
  from: number,
  to: number,
): string | null {
  let markdown: string | null = null;
  try {
    doc.nodesBetween(from, to, (node) => {
      if (markdown !== null) return false;
      if (node.type.name === "table") {
        markdown = tableNodeToMarkdown(node);
        return false;
      }
      return true;
    });
  } catch {
    return null;
  }
  return markdown;
}
