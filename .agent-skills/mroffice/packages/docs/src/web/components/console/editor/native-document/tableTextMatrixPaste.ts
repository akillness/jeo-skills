/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Fragment, Slice, type Mark, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  CellSelection,
  TableMap,
  __pastedCells as pastedCells,
  handlePaste,
  isInTable,
  type Rect,
} from "@tiptap/pm/tables";
import type { EditorView } from "@tiptap/pm/view";

import { parseCsv } from "@mrnote/core/web/lib/spreadsheet/csv.ts";

import {
  TABLE_BLOCK_CONTINUATION_ATTR,
  TABLE_BLOCK_CONTINUES_ATTR,
  TABLE_CELL_CONTINUATION_ATTR,
  TABLE_CELL_CONTINUES_ATTR,
  TABLE_CELL_EMPTY_HEAD_ATTR,
  TABLE_CELL_EMPTY_TAIL_ATTR,
  TABLE_ORIGINAL_ROWSPAN_ATTR,
  TABLE_REPEATED_HEADER_ATTR,
  TABLE_VERTICAL_CONTINUATION_ATTR,
} from "@mrnote/core/web/components/console/editor/native-document/paged/tablePagination.ts";
import {
  documentTablePolicyFromNodeAttrs,
  validateDocumentTableDenseAdmission,
} from "@mrnote/core/web/components/console/editor/native-document/tableLayoutPolicy.ts";

/** Page-layout state of a cell or block that a pasted value never inherits. */
const RUNTIME_ATTRS = [
  TABLE_VERTICAL_CONTINUATION_ATTR,
  TABLE_ORIGINAL_ROWSPAN_ATTR,
  TABLE_CELL_CONTINUES_ATTR,
  TABLE_CELL_CONTINUATION_ATTR,
  TABLE_CELL_EMPTY_HEAD_ATTR,
  TABLE_CELL_EMPTY_TAIL_ATTR,
  TABLE_BLOCK_CONTINUES_ATTR,
  TABLE_BLOCK_CONTINUATION_ATTR,
] as const;

function withoutRuntimeState(
  attrs: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...attrs };
  for (const key of RUNTIME_ATTRS) {
    if (key in next) delete next[key];
  }
  return next;
}

function columnSlice(value: unknown, offset: number): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const width = value[Math.min(offset, value.length - 1)];
  return typeof width === "number" && Number.isFinite(width) && width > 0
    ? [width]
    : null;
}

const TABLE_PASTE_MAX_TEXT_LENGTH = 128 * 1024;
const TABLE_PASTE_MAX_ROWS = 200;
const TABLE_PASTE_MAX_COLUMNS = 50;
const TABLE_PASTE_MAX_CELLS = 5000;

/**
 * Plain text that reads as a table: tab-separated cells, one line per row,
 * every row the same width (2+ columns), within the paste budgets; else null.
 */
export function parsePlainTextTableRows(text: string): string[][] | null {
  if (text.length > TABLE_PASTE_MAX_TEXT_LENGTH) {
    return null;
  }
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n+$/, "");
  if (!normalized.includes("\n") || !normalized.includes("\t")) {
    return null;
  }
  // The same reading the Spreadsheet gives its own text clipboard: a field
  // that holds a tab, a line break or a quote is written in quotes with its
  // quotes doubled (toDelimitedText), so `"Say ""hi"""` is one cell and a
  
  // the field's first character is content.
  const rows = parseCsv(normalized, "\t");
  if (rows.length < 2 || rows.length > TABLE_PASTE_MAX_ROWS) {
    return null;
  }
  const width = rows[0]?.length ?? 0;
  if (
    width < 2 ||
    width > TABLE_PASTE_MAX_COLUMNS ||
    rows.length * width > TABLE_PASTE_MAX_CELLS ||
    rows.some((row) => row.length !== width)
  ) {
    return null;
  }
  return rows;
}

/**
 * The cell a pasted value lands on takes the formatting of the cell it
 * replaces (plain text carries none of its own): its type, shading, borders,
 * alignment and the width of its grid column. A value that grows the table
 * takes the formatting of the nearest existing cell of its column or row.
 * A formula is content, not formatting: the pasted value replaces it (as a
 * paste over a field result in Word replaces the field), or recalculation
 * would put the old result back over the value.
 */
function pastedCell(
  table: ProseMirrorNode,
  map: TableMap,
  row: number,
  column: number,
  text: string,
): ProseMirrorNode {
  const templateRow = Math.min(row, map.height - 1);
  const templateColumn = Math.min(column, map.width - 1);
  const offset = map.map[templateRow * map.width + templateColumn];
  const template = table.nodeAt(offset)!;
  const templateRect = map.findCell(offset);
  const spanOffset = templateColumn - templateRect.left;
  const attrs = withoutRuntimeState({
    ...template.attrs,
    colspan: 1,
    rowspan: 1,
  });
  delete attrs.formula;
  delete attrs.formulaNumberFormat;
  if ("colwidth" in attrs) attrs.colwidth = columnSlice(attrs.colwidth, spanOffset);
  if ("colwidthTwips" in attrs) {
    attrs.colwidthTwips = columnSlice(attrs.colwidthTwips, spanOffset);
  }
  const schema = table.type.schema;
  const paragraphType = schema.nodes.paragraph!;
  const headingType = schema.nodes.heading;
  const first = template.firstChild;
  // The value takes the block it replaces as well: a Heading 2 cell stays a
  
  // replaced in place keeps its heading's anchor, the one references name;
  // a cell the paste adds gets its own.
  const inPlace =
    row < map.height &&
    column < map.width &&
    templateRect.top === row &&
    templateRect.left === column;
  const blockType =
    first && (first.type === paragraphType || first.type === headingType) ? first.type : paragraphType;
  const blockAttrs =
    first && first.type === blockType
      ? withoutRuntimeState({
          ...first.attrs,
          block_id: null,
          source: null,
          ...("anchor_id" in first.attrs && !inPlace ? { anchor_id: null } : {}),
        })
      : null;
  const block = blockType.create(
    blockAttrs,
    text ? schema.text(text, typedFormattingOf(template)) : null,
  );
  return template.type.create(attrs, block);
}

/**
 * Marks that say what the text IS or who changed it, not how it looks: a
 * pasted value never inherits a link target, a comment range, a revision, a
 * bookmark, a field entry or a content control from the text it replaces.
 */
const NON_FORMATTING_MARKS = new Set([
  "link",
  "wikiLink",
  "comment",
  "trackInsertion",
  "trackDeletion",
  "trackFormatting",
  "bookmark",
  "tocEntryTitle",
  "tocEntryPage",
  "indexEntry",
  "authorityEntry",
  "symbolChar",
  "contentControl",
]);








function typedFormattingOf(cell: ProseMirrorNode): readonly Mark[] {
  let marks: readonly Mark[] | null = null;
  cell.descendants((node) => {
    if (marks) return false;
    if (node.isText) {
      marks = node.marks;
      return false;
    }
    return true;
  });
  return (marks ?? []).filter((mark: Mark) => !NON_FORMATTING_MARKS.has(mark.type.name));
}

/**
 * Paste a plain-text matrix (tab-separated cells, one line per row) into the
 * table the selection is in, the way Word pastes table portions into an
 * existing table ("pasted as rows into an existing table rather than as a
 * nested table"): the values fill the grid from the caret's cell, growing the
 * table where they run past its edge, or fill a selected block of cells
 * (repeating like the table's own cell paste). Only the cells' text changes;
 * every cell keeps its formatting. It is one transaction and one Undo step.
 *
 * Returns false when the selection is not in a table, so the caller creates a
 * new table from the text instead. A growth past the dense table budget is
 * refused whole, and `options.onRefused` says so.
 */
/**
 * Whether a paste that fills from the caret's cell can take the table to
 * `rows` × `columns` within its dense budget; null when the selection is not
 * in a table (the caller decides what a body paste does).
 */
function caretTableGrowthAdmitted(
  view: EditorView,
  height: number,
  width: number,
): boolean | null {
  const { state } = view;
  try {
    if (!isInTable(state) || state.selection instanceof CellSelection) return null;
    const { $head } = state.selection;
    let depth = $head.depth;
    while (depth > 0 && $head.node(depth).type.spec.tableRole !== "row") {
      depth -= 1;
    }
    if (depth <= 0) return null;
    const table = $head.node(depth - 1);
    const tableStart = $head.start(depth - 1);
    const map = TableMap.get(table);
    const found = map.findCell($head.before(depth + 1) - tableStart);
    return validateDocumentTableDenseAdmission({
      representation: table.attrs.tableRepresentation,
      rows: Math.max(map.height, found.top + height),
      columns: Math.max(map.width, found.left + width),
      policy: documentTablePolicyFromNodeAttrs(table.attrs),
    }).ok;
  } catch {
    return null;
  }
}








export function richTablePasteExceedsBudget(view: EditorView, slice: Slice): boolean {
  let cells: { width: number; height: number } | null = null;
  try {
    cells = pastedCells(slice);
  } catch {
    cells = null;
  }
  if (!cells) return false;
  return caretTableGrowthAdmitted(view, cells.height, cells.width) === false;
}







export function pasteTableCellsIntoTable(
  view: EditorView,
  event: ClipboardEvent,
  slice: Slice,
): boolean {
  try {
    if (!isInTable(view.state) || !pastedCells(slice)) return false;
  } catch {
    return false;
  }
  return handlePaste(view, event, slice);
}

export interface TextMatrixPasteOptions {
   
  readonly onRefused?: (reason: "budget") => void;
}

export function pasteTextMatrixIntoTable(
  view: EditorView,
  event: ClipboardEvent,
  rows: readonly (readonly string[])[],
  options: TextMatrixPasteOptions = {},
): boolean {
  const { state } = view;
  let inTable = false;
  try {
    inTable = isInTable(state);
  } catch {
    inTable = false;
  }
  if (!inTable || rows.length === 0 || rows[0].length === 0) return false;
  const selection = state.selection;
  const $cell =
    selection instanceof CellSelection
      ? selection.$anchorCell.pos > selection.$headCell.pos
        ? selection.$anchorCell
        : selection.$headCell
      : null;
  let tableStart: number;
  let table: ProseMirrorNode;
  let map: TableMap;
  let rect: Rect;
  try {
    if (selection instanceof CellSelection && $cell) {
      table = $cell.node(-1);
      tableStart = $cell.start(-1);
      map = TableMap.get(table);
      rect = map.rectBetween(
        selection.$anchorCell.pos - tableStart,
        selection.$headCell.pos - tableStart,
      );
    } else {
      const { $head } = selection;
      let depth = $head.depth;
      while (depth > 0 && $head.node(depth).type.spec.tableRole !== "row") {
        depth -= 1;
      }
      if (depth <= 0) return false;
      table = $head.node(depth - 1);
      tableStart = $head.start(depth - 1);
      map = TableMap.get(table);
      const cellPos = $head.before(depth + 1);
      const found = map.findCell(cellPos - tableStart);
      const height = rows.length;
      const width = rows[0].length;
      const grown = validateDocumentTableDenseAdmission({
        representation: table.attrs.tableRepresentation,
        rows: Math.max(map.height, found.top + height),
        columns: Math.max(map.width, found.left + width),
        policy: documentTablePolicyFromNodeAttrs(table.attrs),
      });
      if (!grown.ok) {
        // The whole matrix or nothing: a paste cut to the cells the table
        
        event.preventDefault();
        options.onRefused?.("budget");
        return true;
      }
      rect = {
        top: found.top,
        left: found.left,
        bottom: found.top + height,
        right: found.left + width,
      };
    }
  } catch {
    return false;
  }
  // A repeated header row on a later page is a read-only copy of the real
  // one; a value written there would not be saved.
  for (let row = rect.top; row < Math.min(rect.bottom, map.height); row += 1) {
    const rowNode = table.child(row);
    if (rowNode.attrs[TABLE_REPEATED_HEADER_ATTR] === true) {
      event.preventDefault();
      return true;
    }
  }
  const matrixWidth = rows[0].length;
  const cellRows: ProseMirrorNode[] = [];
  const rowType = table.child(0).type;
  for (let row = 0; row < rect.bottom - rect.top; row += 1) {
    const source = rows[row % rows.length];
    const cells: ProseMirrorNode[] = [];
    for (let column = 0; column < rect.right - rect.left; column += 1) {
      cells.push(
        pastedCell(
          table,
          map,
          rect.top + row,
          rect.left + column,
          source[column % matrixWidth] ?? "",
        ),
      );
    }
    cellRows.push(rowType.create(null, cells));
  }
  const matrix = table.type.create(null, cellRows);
  event.preventDefault();
  return handlePaste(view, event, new Slice(Fragment.from(matrix), 0, 0));
}
