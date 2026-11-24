/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word-compatible table pagination primitives.
 *
 * This module is deliberately independent from the page-rebalancer plugin:
 * it contains only deterministic planning and JSON fragmentation/merge logic.
 * The live integration measures a rendered table, calls `planTablePageCut`,
 * materialises the returned cut with one of the `fragment*` helpers, and MUST
 * call `mergeTableContinuationsJson` before persistence/export/AI context.
 *
 * Runtime fragments are an editor projection only.  A table that spans ten
 * physical `pageBlock`s is still one semantic table when serialised.  That is
 * the same distinction Word makes between page layout and `<w:tbl>`.
 */

import { joinInlineFragments } from "./joinInlineFragments";
import { noteStrippedAttrs } from "./projectionJsonMemo";
export const TABLE_FRAGMENT_ID_ATTR = "pageTableFragmentId";
export const TABLE_CONTINUES_ATTR = "pageTableContinues";
export const TABLE_CONTINUATION_ATTR = "pageTableContinuation";
export const TABLE_FRAGMENT_START_ROW_ATTR = "pageTableFragmentStartRow";
export const TABLE_FRAGMENT_END_ROW_ATTR = "pageTableFragmentEndRow";
/**
 * Runtime-only, bounded fallback for one cell containing an atom that cannot
 * be split at a legal Word row/cell boundary. The semantic table is untouched;
 * the live editor constrains the physical projection to one printable page.
 */
export const TABLE_UNBREAKABLE_FALLBACK_ATTR = "pageTableUnbreakableFallback";

export const TABLE_SOURCE_ROW_ATTR = "pageTableSourceRow";
export const TABLE_REPEATED_HEADER_ATTR = "pageTableRepeatedHeader";
export const TABLE_ROW_CONTINUES_ATTR = "pageTableRowContinues";
export const TABLE_ROW_CONTINUATION_ATTR = "pageTableRowContinuation";

export const TABLE_SOURCE_CELL_COL_ATTR = "pageTableSourceCellCol";
export const TABLE_VERTICAL_CONTINUATION_ATTR = "pageTableVerticalContinuation";
export const TABLE_ORIGINAL_ROWSPAN_ATTR = "pageTableOriginalRowspan";
export const TABLE_CELL_CONTINUES_ATTR = "pageTableCellContinues";
export const TABLE_CELL_CONTINUATION_ATTR = "pageTableCellContinuation";
export const TABLE_CELL_EMPTY_HEAD_ATTR = "pageTableCellEmptyHead";
export const TABLE_CELL_EMPTY_TAIL_ATTR = "pageTableCellEmptyTail";

export const TABLE_BLOCK_CONTINUES_ATTR = "pageTableBlockContinues";
export const TABLE_BLOCK_CONTINUATION_ATTR = "pageTableBlockContinuation";

/**
 * The least room a row is cut at: one small line. Word breaks a row across
 * pages one line at a time, a single line of a cell paragraph on either side
 * (Word 16.86, corpus R36-D30: a two-line row split 1 + 1 at the foot of page
 * 5). Whether a line really fits is the cell cursor's question
 * (`planTableCellCuts`), which answers with the row boundary when none does;
 * a two-line floor here moved such a row whole to the next page.
 */
export const MIN_TABLE_ROW_SLICE_PX = 12;

export type TableJsonNode = Record<string, unknown> & {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: TableJsonNode[];
  text?: string;
};

export interface TableRowMeasurement {
  /** Rendered outer height of this logical row. */
  heightPx: number;
  /** True for Word `<w:tblHeader/>`; only the leading contiguous band repeats. */
  headerRow?: boolean;
  /** The copy of a header row the pagination draws atop a table's continuation.
   * Word draws it whole at the top of a page, so it is never cut. */
  repeatedHeader?: boolean;
  /** Word `<w:cantSplit/>`: this row may not split when it fits a fresh page. */
  cantSplit?: boolean;
  /** The row is as tall as its "at least" height, taller than its content:
   * Word moves such a row whole to the next page, as a `cantSplit` row. */
  floorHeld?: boolean;
  /** Word "Exactly" row height (`w:hRule="exact"`): the row is never broken.
   * One that fits a fresh page moves there whole; one taller than a page
   * opens a page and is clipped at its foot (Word 16.86, rows probes P4,
   * P4b, F3: an exactly 10" row opens page 14 alone, the next row page 15). */
  exactHeight?: boolean;
  /** The row's "At least" height in px (its whole row's, absent on the head
   * piece of a split row). A floor taller than the space left moves the row
   * to a fresh page, whatever it holds (Word 16.86, probes P2, F1: a 500pt
   * floor over 806pt of lines with 416pt left opens page 6; a 60pt floor
   * with 79pt left breaks where it stands). */
  floorPx?: number;
  /** Row-relative [top, bottom] of each cell paragraph that keeps its lines
   * together: the row breaks above such a paragraph, not through it (Word
   * 16.86, probe P6: two short paragraphs stay at the foot, the kept one
   * opens the next page; P5: kept from the row's top, the row moves whole). */
  keepSpans?: ReadonlyArray<readonly [number, number]>;
  /** The row's first paragraph is "Keep with next": a row that moves to the
   * next page takes it along (Word 16.86, g-l5-cantsplit-keepnext). */
  keepWithNext?: boolean;
}

export interface TablePageCutOptions {
  /** Minimum usable height on each side of an in-row cut. */
  minRowSlicePx?: number;
  /** Table border/spacing chrome charged once per physical fragment. */
  fragmentChromePx?: number;
  /** Proven original source header without a keep-with-next chain. Never set
   * for a repeated header/continuation: those must advance real body rows. */
  allowOriginalHeaderOnly?: boolean;
  /** Word's layout below compatibility mode 15: a "can't split" row taller
   * than a page is not broken. It opens a page, the paper's edge ends it and
   * what follows opens the next page (Word 16.86, g-l5row-cantsplit-tall,
   * mode 14: 60 lines, 53 on the paper, the paragraph after on page 3). */
  overPageCantSplitStands?: boolean;
  /** The rows belong to a keep-with-next chain that opened the page: Word
   * breaks it where the page fills, so rows kept with the next do not carry
   * the cut up to the table's top (ledger `keepReleased`). */
  keepWithNextReleased?: boolean;
}

/** Independent Word control: an original header can occupy remaining space
 * before a cantSplit body; keepNext instead moves it with that body. Unknown
 * inheritance, nested content and vertically merged headers are not covered. */
export function originalTableHeaderMayStandAlone(
  tableAttrs:Record<string,unknown>, header:TableJsonNode,
):boolean {
  const source=tableAttrs.source as Record<string,unknown>|undefined;
  if(source?.adapter!=='docx'||source.cellParagraphFlow!==1 ||
    tableAttrs[TABLE_CONTINUATION_ATTR]===true || header.attrs?.[TABLE_REPEATED_HEADER_ATTR]===true ||
    header.attrs?.headerRow!==true || !header.content?.length)return false;
  return header.content.every(cell=>['tableCell','tableHeader'].includes(cell.type??'') &&
    (cell.attrs?.rowspan==null || cell.attrs.rowspan===1) && Boolean(cell.content?.length) &&
    cell.content!.every(block=>block.type==='paragraph' && block.attrs?.keepNext===false &&
      block.content?.every(child=>child.type==='text')));
}

export interface BetweenRowsTableCut {
  kind: "betweenRows";
  /** The tail starts at this zero-based source row. */
  cutBeforeRow: number;
  /** Source header rows cloned into the continuation fragment. */
  repeatHeaderRows: number[];
}

export interface WithinRowTableCut {
  kind: "withinRow";
  rowIndex: number;
  /** Move the row to a fresh physical page before materialising its head. */
  startOnFreshPage: boolean;
  /** Height available for the leading slice of the split row. */
  headAvailablePx: number;
  /** Height available below repeated headers on a fresh continuation page. */
  tailPageAvailablePx: number;
  repeatHeaderRows: number[];
  /** True only for an over-page row carrying `<w:cantSplit/>`. */
  forcedCantSplitOverride: boolean;
}

export interface MoveTableRowToFreshPageCut {
  kind: "moveToFreshPage";
  rowIndex: number;
  repeatHeaderRows: number[];
}

export type TablePageCut =
  BetweenRowsTableCut | WithinRowTableCut | MoveTableRowToFreshPageCut;

function finiteHeight(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

/** Number of leading consecutive Word repeat-header rows. */
export function leadingTableHeaderRowCount(
  rows: ReadonlyArray<Pick<TableRowMeasurement, "headerRow">>,
): number {
  let count = 0;
  while (count < rows.length && rows[count]?.headerRow === true) count += 1;
  return count;
}

/**
 * Plan the first physical page cut for one semantic table.
 *
 * Word rules represented here:
 * - default rows may break across pages;
 * - `cantSplit` rows move whole to a fresh page when they can fit there;
 * - an over-page row is split even with `cantSplit`, on a page of its own
 *   first, in Word's layout from compatibility mode 15; below it the row stands
 *   whole on its page (`overPageCantSplitStands`);
 * - only the leading contiguous `tblHeader` band repeats;
 * - a header-only fragment is avoided when the first body row can move whole.
 *
 * `null` means the table fits in the currently available space.
 */
export function planTablePageCut(
  measuredRows: ReadonlyArray<TableRowMeasurement>,
  availablePx: number,
  fullPageCapacityPx: number,
  options: TablePageCutOptions = {},
): TablePageCut | null {
  if (measuredRows.length === 0) return null;
  const available = finiteHeight(availablePx);
  const fullCapacity = finiteHeight(fullPageCapacityPx);
  if (!(available > 0) || !(fullCapacity > 0)) return null;

  const minSlice = Math.max(
    1,
    finiteHeight(options.minRowSlicePx) || MIN_TABLE_ROW_SLICE_PX,
  );
  const chrome = Math.max(0, finiteHeight(options.fragmentChromePx));
  const heights = measuredRows.map((row) => finiteHeight(row.heightPx));
  const sourceHeaderCount = leadingTableHeaderRowCount(measuredRows);
  const headerHeight = heights.slice(0, sourceHeaderCount).reduce((a, b) => a + b, 0);
  // Repeating a header band that leaves no editable body area would make an
  // infinite sequence of header-only pages. Word suppresses the repetition in
  // that pathological case; the semantic tblHeader flags remain untouched.
  const canRepeatHeaders =
    sourceHeaderCount > 0 && headerHeight + chrome + minSlice < fullCapacity;
  // A band Word does not repeat is ordinary rows: it breaks between them like
  // any body (corpus R38-D05, tdf58944: every row marked as a header, 17 rows
  // taller than a page -- Word ends page 2 after the twelfth row and opens
  // page 3 with the thirteenth, no header above it).
  const headerCount = canRepeatHeaders ? sourceHeaderCount : 0;
  // Word never cuts a row of the band it repeats: one the space left cannot
  // hold moves whole, as a `cantSplit` row, where the same row unmarked breaks
  // between its lines (Word 16.86, probes t-hd2-first, -plain, -cant). Cut
  // here, its copy on the next page stood beside its two pieces and the
  // collaboration map refused the first keystroke (corpus R284-D15).
  const rows = headerCount
    ? measuredRows.map((row, index) => (index < headerCount ? { ...row, cantSplit: true } : row))
    : measuredRows;
  const repeatHeaderRows = canRepeatHeaders
    ? Array.from({ length: headerCount }, (_, index) => index)
    : [];
  const tailPageAvailablePx = Math.max(
    0,
    fullCapacity - chrome - (canRepeatHeaders ? headerHeight : 0),
  );

  let used = chrome;
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const rowHeight = heights[rowIndex];
    const remaining = available - used;
    if (rowHeight <= remaining) {
      used += rowHeight;
      continue;
    }

    const isBodyRow = rowIndex >= headerCount;
    const bodyRowsBefore = Math.max(0, rowIndex - headerCount);
    const rowFitsFresh = rowHeight <= tailPageAvailablePx;
    // A "can't split" row taller than a page is split all the same, but on a
    // page of its own first, as Word starts a "keep lines together"
    // paragraph taller than a page (Word 16.86, corpus R43-D15 RW11: twenty
    // lines, then a 60-line cantSplit row -- the row opens page 51 and ends
    // on 52; cut where it stood, it began under the lines on page 50).
    const atFreshPage = remaining >= tailPageAvailablePx - 1;
    // A row drawn at its "at least" height, taller than what it holds, is
    // not broken either: Word 16.86 moved such a row whole to the next page
    // with 93 pt left for its 138 pt of lines under a 200 pt floor, and broke
    // the same row between its lines with no floor or a floor below them
    // (scratchpad floor/A-F; corpus R87-D24, a form of empty "at least"
    // rows: cut inside, each part dropped the floor and the plan swung
    // between the whole and the cut table until the ledger held it).
    const row = rows[rowIndex];
    // A repeated header copy with no room left: the continuation moves to the
    // next page, where it opens. Cut here, the copy's second piece held a row's
    // worth of text under the same source as its first; the collaboration map
    // refused the page and the whole document opened read-only (a table header
    
    if (row?.repeatedHeader === true && canRepeatHeaders && !atFreshPage) {
      return { kind: "moveToFreshPage", rowIndex, repeatHeaderRows };
    }
    // An exactly-high row taller than a page stands alone on its page, cut
    // off by the page's foot; what follows it opens the next page (probes
    // P4, RW18; the over-tall row draws no continuation). So does a row held
    // at an "At least" height taller than a page (probe P3: three lines
    // under a 750pt floor fill page 9, the next row opens page 10).
    const standsAlone =
      row?.exactHeight === true ||
      row?.floorHeld === true ||
      (row?.cantSplit === true && options.overPageCantSplitStands === true);
    if (standsAlone && !rowFitsFresh && atFreshPage) {
      return rowIndex + 1 < rows.length
        ? { kind: "betweenRows", cutBeforeRow: rowIndex + 1, repeatHeaderRows }
        : null;
    }
    // The cut rises above a kept paragraph it would pass through. One taller
    // than a page is moved to a fresh page first and breaks there (probe P8,
    // R82-D18 RW19a: 60 kept lines after 20 open page 25 and end on 26).
    let headRoom = remaining;
    for (const [top, bottom] of row?.keepSpans ?? []) {
      if (atFreshPage && bottom - top > tailPageAvailablePx) continue;
      if (top < headRoom && bottom > headRoom) headRoom = Math.max(0, top);
    }
    const unbreakable =
      row?.cantSplit === true ||
      row?.floorHeld === true ||
      row?.exactHeight === true ||
      (finiteHeight(row?.floorPx) > remaining && !atFreshPage) ||
      headRoom < minSlice;
    const mayCutHere = !unbreakable || (!rowFitsFresh && atFreshPage);
    const hasLegalHeadSlice = headRoom >= minSlice;
    // The cut falls between whole lines, so what does not fit here (any
    // amount) goes on as at least one whole line: a row 36.8px tall with 31px
    // left keeps one line and carries the other (corpus R36-D30). Measured
    // in pixels the tail looked 5.8px long and the row moved whole.
    const hasLegalTailSlice = rowHeight - remaining > 0;

    if (mayCutHere && hasLegalHeadSlice && hasLegalTailSlice) {
      return {
        kind: "withinRow",
        rowIndex,
        startOnFreshPage: false,
        headAvailablePx: headRoom,
        tailPageAvailablePx,
        repeatHeaderRows,
        forcedCantSplitOverride:
          rows[rowIndex]?.cantSplit === true && !rowFitsFresh,
      };
    }

    // Complete body rows already occupy the page: end this fragment at their
    // boundary.  This is also the fallback when a DOM cursor cannot find a
    // legal two-line row slice. The rows kept with this one go on with it
    // (three "Keep with next" rows, then a can't-split row that does not fit:
    // Word moves all four); on a fresh page there is nowhere better to go.
    if (bodyRowsBefore > 0) {
      let cutBefore = rowIndex;
      if (available < fullCapacity - 1 && options.keepWithNextReleased !== true) {
        while (cutBefore > headerCount && rows[cutBefore - 1]?.keepWithNext === true) cutBefore -= 1;
      }
      if (cutBefore <= headerCount) return { kind: "moveToFreshPage", rowIndex: headerCount, repeatHeaderRows };
      return { kind: "betweenRows", cutBeforeRow: cutBefore, repeatHeaderRows };
    }

    // Do not emit a page containing only repeated headers. A whole row that
    // fits a fresh page moves there; a truly over-page row is sliced there.
    if (isBodyRow && rowFitsFresh) {
      // Only a single original header is independently witnessed, and only in mode
      // 14 and earlier (Word 16.86 ladder hdr14/hdr15: mode 14 leaves the header alone
      // on the page, mode 15 moves it with the first body row, and a caption kept
      // with it too; corpus R280-D20). The tail receives its normal repeated header,
      // which cannot take this branch.
      if(options.allowOriginalHeaderOnly===true && options.overPageCantSplitStands===true && headerCount===1 && rowIndex===1 &&
        rows[rowIndex]?.cantSplit===true && used<=available) {
        return {kind:'betweenRows',cutBeforeRow:rowIndex,repeatHeaderRows};
      }
      return { kind: "moveToFreshPage", rowIndex, repeatHeaderRows };
    }
    if (isBodyRow) {
      return {
        kind: "withinRow",
        rowIndex,
        startOnFreshPage: true,
        headAvailablePx: Math.max(minSlice, tailPageAvailablePx),
        tailPageAvailablePx,
        repeatHeaderRows,
        forcedCantSplitOverride: rows[rowIndex]?.cantSplit === true,
      };
    }

    // A row of the repeating band goes to the next page whole. What stands of
    // the band above it stays and is not repeated (t-hd2-second: a two-row
    // band whose second row does not fit leaves the first alone on the page).
    if (headerCount > 0 && available < fullCapacity - 1) {
      return { kind: "moveToFreshPage", rowIndex, repeatHeaderRows: rowIndex === 0 ? repeatHeaderRows : [] };
    }
    // A pathological header row itself is larger than a page. It still needs a
    // structured row continuation; repeating the header band is disabled.
    return {
      kind: "withinRow",
      rowIndex,
      startOnFreshPage: available < fullCapacity,
      headAvailablePx: Math.max(minSlice, fullCapacity - chrome),
      tailPageAvailablePx: Math.max(0, fullCapacity - chrome),
      repeatHeaderRows: [],
      forcedCantSplitOverride: rows[rowIndex]?.cantSplit === true,
    };
  }
  return null;
}

/** Where a list in a cell breaks: inside item `itemIndex`, at its child
 * `childIndex`. A paragraph child breaks after `textOffset` characters; a list
 * child breaks by `nested`, the same way one level down; `boundary` keeps the
 * children before `childIndex` and moves the rest (corpus R282-D21: an item
 * whose text is followed by a list of its own, Word breaking inside that
 * list's first item). Without `childIndex` the list breaks before item
 * `itemIndex`, which only a nested step takes. */
export interface TableCellListCut {
  itemIndex: number;
  childIndex?: number;
  textOffset?: number;
  boundary?: true;
  nested?: TableCellListCut;
}

export interface TableCellTextCut {
  /** Source grid column of the cell (not its array ordinal). */
  sourceCol: number;
  /** Where the physical boundary falls inside the cell. */
  cut:
    | { kind: "before" }
    | { kind: "after" }
    | { kind: "block"; blockIndex: number }
    | { kind: "text"; blockIndex: number; textOffset: number }
    /** A list in the cell broken between its items: the first `itemIndex`
     * items stay, the rest open the next page (corpus R104-D03: a bulleted
     * list many pages long in one cell, Word 49 pages). */
    | { kind: "listItems"; blockIndex: number; itemIndex: number }
    /** A list in the cell broken inside item `itemIndex`: its paragraph
     * `childIndex` after `textOffset` characters, the lines above the page
     * edge staying (corpus R280-D18: a row of numbered paragraphs Word breaks
     * over a page). The tail item draws no marker. */
    | ({ kind: "listItemText"; blockIndex: number } & TableCellListCut)
    /** A table in the cell broken between its own rows, the page boundary
     * falling inside it: Word breaks an outer row through a nested table
     * row by row, repeating the nested table's header rows (corpus R43-D15). */
    | {
        kind: "nestedTable";
        blockIndex: number;
        cutBeforeRow: number;
        repeatHeaderRows: number[];
        /** Cuts inside the nested table's row `cutBeforeRow` itself: that row
         * is taller than the space left, so it breaks through its own cells
         * as the outer row breaks through it (corpus R03-D23: a page-long
         * single-row table inside a single-row table). Absent, the nested
         * table breaks before that row. */
        withinRow?: TableCellTextCut[];
      };
}

export interface TableFragmentPair {
  head: TableJsonNode;
  tail: TableJsonNode;
}

export interface TableFragmentOptions {
  /** Exact source header rows to repeat; undefined = leading tblHeader band. */
  repeatHeaderRows?: ReadonlyArray<number>;
}

interface CellPlacement {
  row: number;
  cellIndex: number;
  col: number;
  colspan: number;
  rowspan: number;
  /** Whether the cell's JSON states `rowspan` itself (the editor's JSON always
   * does; the importer's leaves the schema default unwritten). */
  rowspanStated: boolean;
  node: TableJsonNode;
}

/** The value stamped as a cell's original span: the stated span, or 0 for a
 * cell that never stated one, so a restore can put back exactly what was there.
 * A cell already cut at an earlier page seam keeps that first stamp: its
 * physical span is the clamped one, and restoring the clamp lost the rows the
 * merge crossed on later pages (D010: a six-row merged cell cut twice saved as
 * rowspan 2, shifting every later row one column, so the save was refused). */
function originalRowspanStamp(placement: CellPlacement): number {
  const stamped = placement.node.attrs?.[TABLE_ORIGINAL_ROWSPAN_ATTR];
  if (stamped !== undefined && stamped !== null && Number.isInteger(Number(stamped))) {
    return Number(stamped) === 0 ? 0 : integerSpan(stamped);
  }
  return placement.rowspanStated ? placement.rowspan : 0;
}

function attrsOf(node: TableJsonNode): Record<string, unknown> {
  return node.attrs ? { ...node.attrs } : {};
}

function integerSpan(value: unknown): number {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed >= 1 ? Math.min(parsed, 1000) : 1;
}

function tableRows(table: TableJsonNode): TableJsonNode[] {
  return Array.isArray(table.content)
    ? table.content.filter((node) => node?.type === "tableRow")
    : [];
}

function rowCells(row: TableJsonNode): TableJsonNode[] {
  return Array.isArray(row.content)
    ? row.content.filter(
        (node) => node?.type === "tableCell" || node?.type === "tableHeader",
      )
    : [];
}

function placementsForRows(rows: TableJsonNode[]): CellPlacement[][] {
  const activeUntil: number[] = [];
  const placements: CellPlacement[][] = [];
  rows.forEach((row, rowIndex) => {
    const placed: CellPlacement[] = [];
    let col = 0;
    rowCells(row).forEach((node, cellIndex) => {
      while ((activeUntil[col] ?? 0) > rowIndex) col += 1;
      const attrs = attrsOf(node);
      const colspan = integerSpan(attrs.colspan);
      const rowspan = integerSpan(attrs.rowspan);
      const rowspanStated = attrs.rowspan !== undefined && attrs.rowspan !== null;
      placed.push({ row: rowIndex, cellIndex, col, colspan, rowspan, rowspanStated, node });
      if (rowspan > 1) {
        for (let offset = 0; offset < colspan; offset += 1) {
          activeUntil[col + offset] = Math.max(
            activeUntil[col + offset] ?? 0,
            rowIndex + rowspan,
          );
        }
      }
      col += colspan;
    });
    placements.push(placed);
  });
  return placements;
}

function emptyParagraph(): TableJsonNode {
  return { type: "paragraph" };
}

/** Text blocks a physical fragment may reproduce with no content at all. */
const BLANKABLE_BLOCK_TYPES = new Set(["paragraph", "heading", "codeBlock"]);

/**
 * The empty stand-in a cell half needs when all of the cell's content belongs
 * to the other side of a split row. It is an EMPTIED COPY of one of the cell's
 * own blocks, never a fresh default paragraph: the pagination projection
 * receipt encodes every runtime node as a reference into the source document
 * plus allowed differences, and a fresh paragraph carries the schema's own
 * defaults (`lineHeight: null`, `source: null`, …) which match no source node.
 * `capturePaginationProjectionRecipe` then throws `unrepresentable:paragraph`
 * and every save of a document with a split row loses its projection.
 *
 * The copy drops both identity attributes. A stand-in that kept them would be
 * a second claimant for one native paragraph: the block-id plugin keeps the
 * FIRST occurrence in document order, so a stand-in above the real content
 * would take over its `block_id` and its docx source anchor and leave the real
 * paragraph unaddressable for patchback. `role` records which side of the page
 * boundary the real content is on, in the vocabulary the cell merger and the
 * receipt already speak.
 */
function blankBlockLike(
  block: TableJsonNode | undefined,
  role: typeof TABLE_BLOCK_CONTINUES_ATTR | typeof TABLE_BLOCK_CONTINUATION_ATTR,
): TableJsonNode {
  if (!block?.type || !BLANKABLE_BLOCK_TYPES.has(block.type)) return emptyParagraph();
  return {
    ...block,
    attrs: {
      ...attrsOf(block),
      block_id: null,
      source: null,
      [role]: true,
    },
    content: [],
  };
}

function cloneCellWithRuntime(
  placement: CellPlacement,
  extra: Record<string, unknown> = {},
): TableJsonNode {
  return {
    ...placement.node,
    attrs: {
      ...attrsOf(placement.node),
      [TABLE_SOURCE_CELL_COL_ATTR]: placement.col,
      ...extra,
    },
    content: Array.isArray(placement.node.content)
      ? placement.node.content.map((node) => ({ ...node }))
      : placement.node.content,
  };
}

function cloneSourceRow(
  row: TableJsonNode,
  sourceRow: number,
  placements: CellPlacement[],
  extra: Record<string, unknown> = {},
): TableJsonNode {
  // A continuation fragment can itself span another physical page. Preserve
  // the first fragmentation's semantic row identity instead of renumbering
  // the tail from zero on every cut; mergeTableContinuationsJson groups by
  // this stable source row across an arbitrary number of pages.
  const existingSourceRow = row.attrs?.[TABLE_SOURCE_ROW_ATTR];
  const stableSourceRow =
    typeof existingSourceRow === "number" &&
    Number.isInteger(existingSourceRow) &&
    existingSourceRow >= 0
      ? existingSourceRow
      : sourceRow;
  return {
    ...row,
    attrs: {
      ...attrsOf(row),
      [TABLE_SOURCE_ROW_ATTR]: stableSourceRow,
      ...extra,
    },
    content: placements.map((placement) => cloneCellWithRuntime(placement)),
  };
}

function isHeaderRowJson(row: TableJsonNode): boolean {
  return row.attrs?.headerRow === true;
}

function leadingHeaderRowsJson(rows: TableJsonNode[]): number[] {
  const result: number[] = [];
  while (result.length < rows.length && isHeaderRowJson(rows[result.length])) {
    result.push(result.length);
  }
  return result;
}

function stampTableAttrs(
  table: TableJsonNode,
  fragmentId: string,
  startRow: number,
  endRow: number,
  role: "head" | "tail",
): Record<string, unknown> {
  // Cut indices are physical and include repeated headers. Range metadata
  // describes semantic rows, including when a continuation is split again.
  const rows = tableRows(table).slice(startRow, endRow).filter(
    (row) => row.attrs?.[TABLE_REPEATED_HEADER_ATTR] !== true,
  );
  const sourceIndex = (row: TableJsonNode | undefined, fallback: number): number => {
    const value = row?.attrs?.[TABLE_SOURCE_ROW_ATTR];
    return typeof value === "number" && Number.isInteger(value) && value >= 0
      ? value : fallback;
  };
  return {
    ...attrsOf(table),
    [TABLE_FRAGMENT_ID_ATTR]: fragmentId,
    [TABLE_FRAGMENT_START_ROW_ATTR]: sourceIndex(rows[0], startRow),
    [TABLE_FRAGMENT_END_ROW_ATTR]: sourceIndex(rows.at(-1), endRow - 1) + 1,
    [TABLE_CONTINUES_ATTR]: role === "head" || table.attrs?.[TABLE_CONTINUES_ATTR] === true,
    [TABLE_CONTINUATION_ATTR]: role === "tail" || table.attrs?.[TABLE_CONTINUATION_ATTR] === true,
    ...(attrsOf(table)[TABLE_UNBREAKABLE_FALLBACK_ATTR] === true
      ? { [TABLE_UNBREAKABLE_FALLBACK_ATTR]: false }
      : {}),
  };
}

function repeatedHeaderClones(
  rows: TableJsonNode[],
  placements: CellPlacement[][],
  requestedRows?: ReadonlyArray<number>,
): TableJsonNode[] {
  const leading = new Set(leadingHeaderRowsJson(rows));
  const selected =
    requestedRows === undefined
      ? [...leading]
      : requestedRows.filter(
          (rowIndex) => Number.isInteger(rowIndex) && leading.has(rowIndex),
        );
  return selected.map((rowIndex) =>
    cloneSourceRow(rows[rowIndex], rowIndex, placements[rowIndex], {
      [TABLE_REPEATED_HEADER_ATTR]: true,
    }),
  );
}

function withRowspan(
  cell: TableJsonNode,
  rowspan: number,
  originalRowspan: number,
): TableJsonNode {
  const attrs = attrsOf(cell);
  attrs[TABLE_ORIGINAL_ROWSPAN_ATTR] = originalRowspan;
  if (rowspan > 1) attrs.rowspan = rowspan;
  else if (originalRowspan === 0) delete attrs.rowspan;
  else attrs.rowspan = 1;
  return { ...cell, attrs };
}

function insertCellsBySourceColumn(
  row: TableJsonNode,
  cells: TableJsonNode[],
): TableJsonNode {
  return {
    ...row,
    content: [...rowCells(row), ...cells].sort((left, right) => {
      const l = Number(left.attrs?.[TABLE_SOURCE_CELL_COL_ATTR] ?? 0);
      const r = Number(right.attrs?.[TABLE_SOURCE_CELL_COL_ATTR] ?? 0);
      return l - r;
    }),
  };
}

/**
 * Split a semantic table between source rows. Leading header rows are cloned
 * into the tail. Rowspans crossing the boundary are clamped in the head and
 * represented by empty structural continuation cells in the tail; merge drops
 * those cells and restores the exact original rowspan.
 */
export function fragmentTableAtRowBoundary(
  table: TableJsonNode,
  cutBeforeRow: number,
  fragmentId: string,
  options: TableFragmentOptions = {},
): TableFragmentPair | null {
  if (table.type !== "table" || !fragmentId) return null;
  const rows = tableRows(table);
  if (cutBeforeRow <= 0 || cutBeforeRow >= rows.length) return null;
  const placements = placementsForRows(rows);
  const sourceRows = rows.map((row, rowIndex) =>
    cloneSourceRow(row, rowIndex, placements[rowIndex]),
  );

  const headRows = sourceRows.slice(0, cutBeforeRow);
  const tailRows = sourceRows.slice(cutBeforeRow);
  const verticalContinuations: TableJsonNode[] = [];
  for (let originRow = 0; originRow < cutBeforeRow; originRow += 1) {
    placements[originRow].forEach((placement) => {
      const endRow = originRow + placement.rowspan;
      if (endRow <= cutBeforeRow) return;
      const original = originalRowspanStamp(placement);
      const headSpan = cutBeforeRow - originRow;
      const headIndex = placements[originRow].findIndex(
        (candidate) => candidate.cellIndex === placement.cellIndex,
      );
      headRows[originRow].content![headIndex] = withRowspan(
        headRows[originRow].content![headIndex],
        headSpan,
        original,
      );
      verticalContinuations.push({
        type: placement.node.type,
        attrs: {
          ...attrsOf(placement.node),
          [TABLE_SOURCE_CELL_COL_ATTR]: placement.col,
          [TABLE_VERTICAL_CONTINUATION_ATTR]: true,
          [TABLE_ORIGINAL_ROWSPAN_ATTR]: original,
          rowspan: endRow - cutBeforeRow,
        },
        content: [blankBlockLike(placement.node.content?.[0], TABLE_BLOCK_CONTINUATION_ATTR)],
      });
    });
  }
  if (verticalContinuations.length > 0 && tailRows[0]) {
    tailRows[0] = insertCellsBySourceColumn(tailRows[0], verticalContinuations);
  }

  return {
    head: {
      ...table,
      attrs: stampTableAttrs(table, fragmentId, 0, cutBeforeRow, "head"),
      content: headRows,
    },
    tail: {
      ...table,
      attrs: stampTableAttrs(
        table,
        fragmentId,
        cutBeforeRow,
        rows.length,
        "tail",
      ),
      content: [
        ...repeatedHeaderClones(rows, placements, options.repeatHeaderRows),
        ...tailRows,
      ],
    },
  };
}


/**
 * Join the two physical halves of ONE source row back into the whole row, in
 * the runtime vocabulary the live fragments speak. Only a complete pair is
 * joined: a head that is itself a continuation, a tail that continues further,
 * or a vertically merged cell crossing the seam keeps its boundary.
 *
 * Without this, a row split stays in the document for good: the ledger merges
 * back every seam its plan no longer wants, and a seam the merge refuses is
 * kept — leaving BOTH halves of one row on a single page, where the cell text
 * reads by page instead of by cell, and where the projection receipt has no
 * whole row to reference.
 */
function joinSplitRowFragments(
  head: TableJsonNode,
  tail: TableJsonNode,
): TableJsonNode | null {
  if (head.attrs?.[TABLE_ROW_CONTINUES_ATTR] !== true) return null;
  if (tail.attrs?.[TABLE_ROW_CONTINUATION_ATTR] !== true) return null;
  // A row split over three or more pages joins piece by piece: the joined
  // row is still the continuation of the piece before it, and still continues
  // on the page after it when the tail did. Refusing these left a row that
  // once crossed three pages split for good after it fitted on one page
  // again (WUA 096: three tables on one sheet).
  const headContinuation = head.attrs?.[TABLE_ROW_CONTINUATION_ATTR] === true;
  const tailContinues = tail.attrs?.[TABLE_ROW_CONTINUES_ATTR] === true;
  const sourceRow = head.attrs?.[TABLE_SOURCE_ROW_ATTR];
  if (!Number.isInteger(sourceRow) || sourceRow !== tail.attrs?.[TABLE_SOURCE_ROW_ATTR])
    return null;
  const headCells = rowCells(head);
  const tailCells = rowCells(tail);
  if (!headCells.length || headCells.length !== tailCells.length) return null;
  const cells: TableJsonNode[] = [];
  for (let index = 0; index < headCells.length; index += 1) {
    const left = headCells[index];
    const right = tailCells[index];
    // A cell merged down from a row above passes through the row on both sides
    // of the seam: one shell again, spanning what the tail's spanned (corpus
    // R280-D29: a red first column merged over twelve rows; the row cut where it
    // passed never joined, and its empty tail stood a row's height on the page).
    if (
      left.attrs?.[TABLE_VERTICAL_CONTINUATION_ATTR] === true &&
      right.attrs?.[TABLE_VERTICAL_CONTINUATION_ATTR] === true &&
      left.type === right.type &&
      left.attrs?.[TABLE_SOURCE_CELL_COL_ATTR] === right.attrs?.[TABLE_SOURCE_CELL_COL_ATTR]
    ) {
      cells.push({ ...left, attrs: { ...attrsOf(left), rowspan: integerSpan(right.attrs?.rowspan ?? 1) } });
      continue;
    }
    if (
      left.attrs?.[TABLE_VERTICAL_CONTINUATION_ATTR] === true ||
      right.attrs?.[TABLE_VERTICAL_CONTINUATION_ATTR] === true ||
      left.type !== right.type ||
      left.attrs?.[TABLE_SOURCE_CELL_COL_ATTR] !== right.attrs?.[TABLE_SOURCE_CELL_COL_ATTR]
    )
      return null;
    const content = mergeCellContent(left, right);
    if (!content.length) return null;
    const onlyShells = content.every(isEmptySeamShell);
    const originalRowspan = tailContinues ? null : left.attrs?.[TABLE_ORIGINAL_ROWSPAN_ATTR];
    const attrs: Record<string, unknown> = {
      ...attrsOf(left),
      [TABLE_CELL_CONTINUES_ATTR]: tailContinues && right.attrs?.[TABLE_CELL_CONTINUES_ATTR] === true,
      [TABLE_CELL_CONTINUATION_ATTR]: headContinuation && left.attrs?.[TABLE_CELL_CONTINUATION_ATTR] === true,
      [TABLE_CELL_EMPTY_HEAD_ATTR]: tailContinues && onlyShells && right.attrs?.[TABLE_CELL_EMPTY_HEAD_ATTR] === true,
      [TABLE_CELL_EMPTY_TAIL_ATTR]: headContinuation && onlyShells && left.attrs?.[TABLE_CELL_EMPTY_TAIL_ATTR] === true,
      [TABLE_ORIGINAL_ROWSPAN_ATTR]: tailContinues ? left.attrs?.[TABLE_ORIGINAL_ROWSPAN_ATTR] ?? null : null,
    };
    // The head half clamped its rowspan to this row; the whole row owns the
    // original span again, and the rows it covers are all in the tail fragment.
    // `restoreCell` resolves the same stamp the same way, so joining a seam
    // leaves the canonical document — and therefore the receipt's canonical
    // hash — exactly as it was. A span of 1 is written out, not deleted: the
    // editor's own JSON always carries the schema default, the shared Y.Doc
    // mirrors that JSON, and a joined row without the key read as a different
    // document, which refused every save of a page whose table row straddled
    // a page seam (form_footnotes.docx: "保存失败" with no request sent).
    if (originalRowspan != null) {
      if (Number(originalRowspan) === 0) delete attrs.rowspan;
      else attrs.rowspan = integerSpan(originalRowspan);
    }
    cells.push({ ...left, attrs, content });
  }
  return {
    ...head,
    attrs: {
      ...attrsOf(head),
      [TABLE_ROW_CONTINUES_ATTR]: tailContinues,
      [TABLE_ROW_CONTINUATION_ATTR]: headContinuation,
    },
    content: cells,
  };
}

/**
 * A rejoined row holds a merged cell's whole span only as far as this fragment
 * has rows for it: the rest of the merge stands in later fragments, as stand-in
 * cells that state its span. Past the fragment's rows the grid is not a grid,
 * the table plugin cuts the span down to fit and drops the stamp, the next cut
 * stamps what is left, and the save held a cell of three rows as one, which no
 * grid could state (corpus R326-D05: a table the user never touched refused).
 */
function keepSpanWithinRows(row: TableJsonNode, rowsFromHere: number): TableJsonNode {
  const available = Math.max(1, rowsFromHere);
  return {
    ...row,
    content: rowCells(row).map((cell) => {
      const span = integerSpan(cell.attrs?.rowspan ?? 1);
      if (span <= available) return cell;
      return { ...cell, attrs: { ...attrsOf(cell), rowspan: available, [TABLE_ORIGINAL_ROWSPAN_ATTR]: span } };
    }),
  };
}

/** Join complete-row fragments that now share one physical page. Keep the
 * live projection attributes: storage normalization would erase an unfinished
 * row/cell continuation that still belongs to a later page. A row split across
 * the seam is rejoined cell by cell; complex row seams remain separate until
 * their cell geometry can also be joined safely. */
export function mergeAdjacentTableFragmentsJson(
  head: TableJsonNode,
  tail: TableJsonNode,
): TableJsonNode | null {
  const id = head.attrs?.[TABLE_FRAGMENT_ID_ATTR];
  if (head.type !== "table" || tail.type !== "table" || typeof id !== "string" ||
      !id || tail.attrs?.[TABLE_FRAGMENT_ID_ATTR] !== id) return null;
  // The fragment ID is the existing storage custody key. Earlier projections
  // reset continuation roles on re-split, so those flags cannot veto repair.
  const left = tableRows(head);
  const right = tableRows(tail).filter(row => row.attrs?.[TABLE_REPEATED_HEADER_ATTR] !== true);
  if (!left.length || !right.length) return null;
  const headLast = left[left.length - 1];
  const splitRow =
    headLast.attrs?.[TABLE_ROW_CONTINUES_ATTR] === true ||
    right[0].attrs?.[TABLE_ROW_CONTINUATION_ATTR] === true
      ? joinSplitRowFragments(headLast, right[0])
      : null;
  if (!splitRow &&
      (headLast.attrs?.[TABLE_ROW_CONTINUES_ATTR] === true ||
       right[0].attrs?.[TABLE_ROW_CONTINUATION_ATTR] === true ||
       rowCells(right[0]).some(cell => cell.attrs?.[TABLE_VERTICAL_CONTINUATION_ATTR] === true)))
    return null;
  const rows = splitRow
    ? [...left.slice(0, -1), keepSpanWithinRows(splitRow, right.length), ...right.slice(1)]
    : [...left, ...right];
  const sourceRows = rows.filter(row => row.attrs?.[TABLE_REPEATED_HEADER_ATTR] !== true)
    .map(row => row.attrs?.[TABLE_SOURCE_ROW_ATTR])
    .filter((value): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0);
  return {
    ...head,
    attrs: {
      ...attrsOf(head),
      [TABLE_CONTINUES_ATTR]: tail.attrs?.[TABLE_CONTINUES_ATTR] === true,
      // Previously split continuations may carry a local (even reversed)
      // range. Existing source-row stamps, never that stale range, own it.
      [TABLE_FRAGMENT_START_ROW_ATTR]: sourceRows[0] ?? null,
      [TABLE_FRAGMENT_END_ROW_ATTR]: sourceRows.length ? sourceRows[sourceRows.length - 1] + 1 : null,
    },
    content: rows,
  };
}

function textLength(node: TableJsonNode): number {
  if (node.type === "text")
    return typeof node.text === "string" ? node.text.length : 0;
  return Array.isArray(node.content)
    ? node.content.reduce((sum, child) => sum + textLength(child), 0)
    : 0;
}

function splitInlineNodes(
  nodes: TableJsonNode[],
  offset: number,
): [TableJsonNode[], TableJsonNode[]] {
  const head: TableJsonNode[] = [];
  const tail: TableJsonNode[] = [];
  let remaining = Math.max(0, offset);
  let inTail = false;
  for (const node of nodes) {
    if (inTail) {
      tail.push(node);
      continue;
    }
    const length = textLength(node);
    if (remaining >= length) {
      head.push(node);
      remaining -= length;
      continue;
    }
    if (node.type === "text" && typeof node.text === "string") {
      if (remaining > 0)
        head.push({ ...node, text: node.text.slice(0, remaining) });
      if (remaining < node.text.length)
        tail.push({ ...node, text: node.text.slice(remaining) });
    } else if (Array.isArray(node.content)) {
      const [childHead, childTail] = splitInlineNodes(node.content, remaining);
      if (childHead.length) head.push({ ...node, content: childHead });
      if (childTail.length) tail.push({ ...node, content: childTail });
    } else {
      // Inline atoms cannot be bisected: the boundary sits before the atom.
      tail.push(node);
    }
    remaining = 0;
    inTail = true;
  }
  return [head, tail];
}

/** A cell's list broken at `cut` (TableCellListCut), as its head and its
 * tail, or null when the cut leaves either side empty. The head's last item
 * continues and the tail's first item draws no marker; joinContinuedBlocks
 * joins them back level by level. */
function splitCellList(list: TableJsonNode | undefined, cut: TableCellListCut): [TableJsonNode, TableJsonNode] | null {
  const items = Array.isArray(list?.content) ? list.content : [];
  const itemIndex = Math.floor(cut.itemIndex);
  if (!list || itemIndex < 0 || itemIndex >= items.length) return null;
  const attrs = attrsOf(list);
  const start = typeof attrs.start === "number" && Number.isFinite(attrs.start) ? attrs.start : null;
  const halves = (headItems: TableJsonNode[], tailItems: TableJsonNode[], tailStart: number): [TableJsonNode, TableJsonNode] => [
    { ...list, attrs: { ...attrs, [TABLE_BLOCK_CONTINUES_ATTR]: true }, content: headItems },
    {
      ...list,
      attrs: { ...attrs, ...(start !== null ? { start: start + tailStart } : {}), [TABLE_BLOCK_CONTINUATION_ATTR]: true },
      content: tailItems,
    },
  ];
  if (cut.childIndex === undefined) {
    return itemIndex > 0 ? halves(items.slice(0, itemIndex), items.slice(itemIndex), itemIndex) : null;
  }
  const item = items[itemIndex];
  const children = Array.isArray(item?.content) ? item.content : [];
  const childIndex = Math.floor(cut.childIndex);
  const child = children[childIndex];
  if (!child) return null;
  let headChildren: TableJsonNode[];
  let tailChildren: TableJsonNode[];
  if (cut.boundary) {
    if (childIndex <= 0) return null;
    headChildren = children.slice(0, childIndex);
    tailChildren = children.slice(childIndex);
  } else if (cut.nested) {
    const inner = splitCellList(child, cut.nested);
    if (!inner) return null;
    headChildren = [...children.slice(0, childIndex), inner[0]];
    tailChildren = [inner[1], ...children.slice(childIndex + 1)];
  } else {
    const [inlineHead, inlineTail] =
      Array.isArray(child.content) ? splitInlineNodes(child.content, cut.textOffset ?? 0) : [[], []];
    if (!inlineHead.length || !inlineTail.length) return null;
    headChildren = [
      ...children.slice(0, childIndex),
      { ...child, attrs: { ...attrsOf(child), [TABLE_BLOCK_CONTINUES_ATTR]: true }, content: inlineHead },
    ];
    tailChildren = [
      { ...child, attrs: { ...attrsOf(child), [TABLE_BLOCK_CONTINUATION_ATTR]: true }, content: inlineTail },
      ...children.slice(childIndex + 1),
    ];
  }
  // A list item is `paragraph block*`: a cut before its nested list (or
  // inside it) opens the rest of the item with the empty bridge paragraph the
  // body's list cut uses, which paints nothing and is dropped when the halves
  // join. Without it the tail failed the schema and the whole row was never
  // cut, its cell running past the foot of the page (corpus R279-D07).
  if (tailChildren[0] && tailChildren[0].type !== "paragraph") {
    tailChildren = [{ type: "paragraph", attrs: { [LIST_ITEM_BRIDGE_ATTR]: true } }, ...tailChildren];
  }
  // The rest of the same item: the same ordinal, drawn without its marker.
  return halves(
    [...items.slice(0, itemIndex), { ...item, attrs: { ...attrsOf(item), [LIST_ITEM_CONTINUES_ATTR]: true }, content: headChildren }],
    [{ ...item, attrs: { ...attrsOf(item), [LIST_ITEM_CONTINUATION_ATTR]: true }, content: tailChildren }, ...items.slice(itemIndex + 1)],
    itemIndex,
  );
}

function splitCellContent(
  cell: TableJsonNode,
  cut: TableCellTextCut["cut"],
  nestedFragmentId = "",
): {
  head: TableJsonNode[];
  tail: TableJsonNode[];
  headEmpty: boolean;
  tailEmpty: boolean;
} {
  const blocks = Array.isArray(cell.content) ? cell.content : [];
  if (cut.kind === "nestedTable") {
    const index = Math.max(0, Math.min(Math.floor(cut.blockIndex), blocks.length - 1));
    const pair =
      blocks[index]?.type === "table" && nestedFragmentId
        ? cut.withinRow
          ? fragmentTableWithinRow(blocks[index], cut.cutBeforeRow, cut.withinRow, nestedFragmentId, {
              repeatHeaderRows: cut.repeatHeaderRows,
            })
          : fragmentTableAtRowBoundary(blocks[index], cut.cutBeforeRow, nestedFragmentId, {
              repeatHeaderRows: cut.repeatHeaderRows,
            })
        : null;
    if (pair) {
      // The halves carry their own fragment id; the merge joins the outer
      // row first, then the nested halves that end up side by side.
      return {
        head: [...blocks.slice(0, index), pair.head],
        tail: [pair.tail, ...blocks.slice(index + 1)],
        headEmpty: false,
        tailEmpty: false,
      };
    }
    return splitCellContent(cell, index === 0 ? { kind: "before" } : { kind: "block", blockIndex: index });
  }
  if (cut.kind === "listItems") {
    const index = Math.max(0, Math.min(Math.floor(cut.blockIndex), blocks.length - 1));
    const list = blocks[index];
    const items = Array.isArray(list?.content) ? list.content : [];
    const itemIndex = Math.floor(cut.itemIndex);
    if (!list || itemIndex <= 0 || itemIndex >= items.length) {
      return splitCellContent(cell, index === 0 ? { kind: "before" } : { kind: "block", blockIndex: index });
    }
    const attrs = attrsOf(list);
    const start = typeof attrs.start === "number" && Number.isFinite(attrs.start) ? attrs.start : null;
    // The halves join back as one list (joinCellContent); the tail of a
    // numbered list goes on counting where the head stopped.
    const headList: TableJsonNode = { ...list, attrs: { ...attrs, [TABLE_BLOCK_CONTINUES_ATTR]: true }, content: items.slice(0, itemIndex) };
    const tailList: TableJsonNode = {
      ...list,
      attrs: {
        ...attrs,
        ...(start !== null ? { start: start + itemIndex } : {}),
        [TABLE_BLOCK_CONTINUATION_ATTR]: true,
      },
      content: items.slice(itemIndex),
    };
    return {
      head: [...blocks.slice(0, index), headList],
      tail: [tailList, ...blocks.slice(index + 1)],
      headEmpty: false,
      tailEmpty: false,
    };
  }
  if (cut.kind === "listItemText") {
    const index = Math.max(0, Math.min(Math.floor(cut.blockIndex), blocks.length - 1));
    const split = splitCellList(blocks[index], cut);
    if (!split) return splitCellContent(cell, { kind: "listItems", blockIndex: index, itemIndex: Math.floor(cut.itemIndex) });
    return {
      head: [...blocks.slice(0, index), split[0]],
      tail: [split[1], ...blocks.slice(index + 1)],
      headEmpty: false,
      tailEmpty: false,
    };
  }
  if (cut.kind === "before") {
    return {
      head: [blankBlockLike(blocks[0], TABLE_BLOCK_CONTINUES_ATTR)],
      tail: blocks,
      headEmpty: true,
      tailEmpty: false,
    };
  }
  if (cut.kind === "after") {
    return {
      head: blocks,
      tail: [blankBlockLike(blocks[blocks.length - 1], TABLE_BLOCK_CONTINUATION_ATTR)],
      headEmpty: false,
      tailEmpty: true,
    };
  }
  if (cut.kind === "block") {
    const index = Math.max(0, Math.min(Math.floor(cut.blockIndex), blocks.length));
    const head = blocks.slice(0, index);
    const tail = blocks.slice(index);
    return {
      head: head.length ? head : [blankBlockLike(blocks[0], TABLE_BLOCK_CONTINUES_ATTR)],
      tail: tail.length
        ? tail
        : [blankBlockLike(blocks[blocks.length - 1], TABLE_BLOCK_CONTINUATION_ATTR)],
      headEmpty: head.length === 0,
      tailEmpty: tail.length === 0,
    };
  }
  const blockIndex = Math.max(
    0,
    Math.min(Math.floor(cut.blockIndex), blocks.length - 1),
  );
  const block = blocks[blockIndex];
  if (!block || !Array.isArray(block.content)) {
    return {
      head: blocks,
      tail: [blankBlockLike(blocks[blocks.length - 1], TABLE_BLOCK_CONTINUATION_ATTR)],
      headEmpty: false,
      tailEmpty: true,
    };
  }
  const [inlineHead, inlineTail] = splitInlineNodes(
    block.content,
    cut.textOffset,
  );
  const headBlock: TableJsonNode = {
    ...block,
    attrs: { ...attrsOf(block), [TABLE_BLOCK_CONTINUES_ATTR]: true },
    content: inlineHead,
  };
  const tailBlock: TableJsonNode = {
    ...block,
    attrs: { ...attrsOf(block), [TABLE_BLOCK_CONTINUATION_ATTR]: true },
    content: inlineTail,
  };
  return {
    head: [...blocks.slice(0, blockIndex), headBlock],
    tail: [tailBlock, ...blocks.slice(blockIndex + 1)],
    headEmpty: inlineHead.length === 0 && blockIndex === 0,
    tailEmpty: inlineTail.length === 0 && blockIndex === blocks.length - 1,
  };
}

interface RowCellSplit {
  placement: CellPlacement;
  original: TableJsonNode;
  split: ReturnType<typeof splitCellContent>;
}

/**
 * The fragment id the page pieces of a table nested in a cell share. A piece
 * cut again keeps the id it already has, so all its pieces join back as one
 * table; a table cut for the first time is named by its own block id. Its
 * index in the cell piece names nothing: the piece of a cell continued on the
 * next page starts where the page did, so two different tables of one cell
 * stood at the same index on two pages, took the same id, and the save joined
 * them into one table and dropped the others (corpus R03-D23: "Qualifications",
 * "Benefits" and "How To Apply", each cut across a page, refused the save as
 * nested tables gone missing).
 */
function nestedFragmentId(cell: TableJsonNode, blockIndex: number, fragmentId: string, col: number): string {
  const blocks = Array.isArray(cell.content) ? cell.content : [];
  const nested = blocks[Math.max(0, Math.min(Math.floor(blockIndex), blocks.length - 1))];
  const existing = nested?.attrs?.[TABLE_FRAGMENT_ID_ATTR];
  if (typeof existing === "string" && existing) return existing;
  const blockId = nested?.attrs?.block_id;
  return typeof blockId === "string" && blockId
    ? `${fragmentId}/c${col}t${blockId}`
    : `${fragmentId}/c${col}b${blockIndex}`;
}

function splitRowCells(
  placements: ReadonlyArray<CellPlacement>,
  cuts: ReadonlyArray<TableCellTextCut>,
  fragmentId = "row",
): RowCellSplit[] {
  const cutByCol = new Map(cuts.map((entry) => [entry.sourceCol, entry.cut]));
  return placements.map((placement) => {
    const original = cloneCellWithRuntime(placement);
    const cut = cutByCol.get(placement.col) ?? { kind: "after" };
    return {
      placement,
      original,
      split: splitCellContent(original, cut, cut.kind === "nestedTable" ? nestedFragmentId(original, cut.blockIndex, fragmentId, placement.col) : ""),
    };
  });
}

function rowCellSplitsMakeProgress(splits: ReadonlyArray<RowCellSplit>): boolean {
  return (
    splits.some(({ split }) => !split.headEmpty) &&
    splits.some(({ split }) => !split.tailEmpty)
  );
}

/**
 * Would splitting `rowIndex` with these cell cuts move content onto both sides
 * of the page boundary? The measured-row planner works in row boxes while the
 * cell cursors work in block boxes: when the boundary falls in a row's padding
 * or border, every cell reports "all content above" and the row split makes no
 * progress. `fragmentTableWithinRow` refuses that pair, so the geometry planner
 * must ask BEFORE it commits to a cut it cannot materialise — otherwise the
 * ledger reconciles a no-op transaction, counts it as a change, and repeats
 * the pass until it declares the layout stalled.
 */
export function tableWithinRowCutMakesProgress(
  table: TableJsonNode,
  rowIndex: number,
  cuts: ReadonlyArray<TableCellTextCut>,
): boolean {
  if (table.type !== "table") return false;
  const rows = tableRows(table);
  if (rowIndex < 0 || rowIndex >= rows.length) return false;
  return rowCellSplitsMakeProgress(
    splitRowCells(placementsForRows(rows)[rowIndex], cuts),
  );
}

/**
 * Split one over-page row into two editable row fragments. The caller obtains
 * one text cursor per visible cell from live DOM geometry. Cells that finish
 * above the boundary use `after`; cells beginning below it use `before`.
 */
export function fragmentTableWithinRow(
  table: TableJsonNode,
  rowIndex: number,
  cuts: ReadonlyArray<TableCellTextCut>,
  fragmentId: string,
  options: TableFragmentOptions = {},
): TableFragmentPair | null {
  if (table.type !== "table" || !fragmentId) return null;
  const rows = tableRows(table);
  if (rowIndex < 0 || rowIndex >= rows.length) return null;
  const placements = placementsForRows(rows);
  const sourceRows = rows.map((row, index) =>
    cloneSourceRow(row, index, placements[index]),
  );
  const cellSplits = splitRowCells(placements[rowIndex], cuts, fragmentId);
  // A legal physical fragment must move semantic content onto BOTH sides of
  // the page boundary.  In particular, an over-page cell containing one
  // unsplittable atom produces a DOM cut of `before` (empty head + unchanged
  // tail).  Materialising that pair would recreate the exact same opener on
  // the next sheet and the async rebalancer used to repeat it up to its
  // 240-dispatch safety cap.  Refuse the no-progress projection here; the
  // caller can apply one bounded, visible oversized-object fallback instead.
  if (!rowCellSplitsMakeProgress(cellSplits)) return null;
  const headCells: TableJsonNode[] = [];
  const tailCells: TableJsonNode[] = [];
  cellSplits.forEach(({ placement, original, split }) => {
    const originalRowspan = originalRowspanStamp(placement);
    headCells.push({
      ...withRowspan(original, 1, originalRowspan),
      attrs: {
        ...attrsOf(withRowspan(original, 1, originalRowspan)),
        [TABLE_CELL_CONTINUES_ATTR]: true,
        ...(split.headEmpty ? { [TABLE_CELL_EMPTY_HEAD_ATTR]: true } : {}),
      },
      content: split.head.length
        ? split.head
        : [blankBlockLike(original.content?.[0], TABLE_BLOCK_CONTINUES_ATTR)],
    });
    tailCells.push({
      ...withRowspan(original, placement.rowspan, originalRowspan),
      attrs: {
        ...attrsOf(withRowspan(original, placement.rowspan, originalRowspan)),
        [TABLE_CELL_CONTINUATION_ATTR]: true,
        ...(split.tailEmpty ? { [TABLE_CELL_EMPTY_TAIL_ATTR]: true } : {}),
      },
      content: split.tail.length
        ? split.tail
        : [blankBlockLike(
            original.content?.[original.content.length - 1],
            TABLE_BLOCK_CONTINUATION_ATTR,
          )],
    });
  });

  const headRows = sourceRows.slice(0, rowIndex);
  headRows.push({
    ...sourceRows[rowIndex],
    attrs: {
      ...attrsOf(sourceRows[rowIndex]),
      [TABLE_ROW_CONTINUES_ATTR]: true,
    },
    content: headCells,
  });
  const tailTarget: TableJsonNode = {
    ...sourceRows[rowIndex],
    attrs: {
      ...attrsOf(sourceRows[rowIndex]),
      [TABLE_ROW_CONTINUATION_ATTR]: true,
    },
    content: tailCells,
  };

  // A rowspan originating above the split row must be clamped in the head and
  // represented by a blank continuation cell in the tail target row.
  const verticalContinuations: TableJsonNode[] = [];
  for (let originRow = 0; originRow < rowIndex; originRow += 1) {
    placements[originRow].forEach((placement) => {
      const endRow = originRow + placement.rowspan;
      if (endRow <= rowIndex) return;
      const original = originalRowspanStamp(placement);
      const headIndex = placements[originRow].findIndex(
        (candidate) => candidate.cellIndex === placement.cellIndex,
      );
      headRows[originRow].content![headIndex] = withRowspan(
        headRows[originRow].content![headIndex],
        rowIndex + 1 - originRow,
        original,
      );
      verticalContinuations.push({
        type: placement.node.type,
        attrs: {
          ...attrsOf(placement.node),
          [TABLE_SOURCE_CELL_COL_ATTR]: placement.col,
          [TABLE_VERTICAL_CONTINUATION_ATTR]: true,
          [TABLE_ORIGINAL_ROWSPAN_ATTR]: original,
          rowspan: endRow - rowIndex,
        },
        content: [blankBlockLike(placement.node.content?.[0], TABLE_BLOCK_CONTINUATION_ATTR)],
      });
    });
  }
  const tailRows = [
    insertCellsBySourceColumn(tailTarget, verticalContinuations),
    ...sourceRows.slice(rowIndex + 1),
  ];

  return {
    head: {
      ...table,
      attrs: stampTableAttrs(table, fragmentId, 0, rowIndex + 1, "head"),
      content: headRows,
    },
    tail: {
      ...table,
      attrs: stampTableAttrs(table, fragmentId, rowIndex, rows.length, "tail"),
      content: [
        ...repeatedHeaderClones(rows, placements, options.repeatHeaderRows),
        ...tailRows,
      ],
    },
  };
}

const TABLE_RUNTIME_ATTRS = new Set([
  TABLE_FRAGMENT_ID_ATTR,
  TABLE_CONTINUES_ATTR,
  TABLE_CONTINUATION_ATTR,
  TABLE_FRAGMENT_START_ROW_ATTR,
  TABLE_FRAGMENT_END_ROW_ATTR,
  TABLE_UNBREAKABLE_FALLBACK_ATTR,
]);
const ROW_RUNTIME_ATTRS = new Set([
  TABLE_SOURCE_ROW_ATTR,
  TABLE_REPEATED_HEADER_ATTR,
  TABLE_ROW_CONTINUES_ATTR,
  TABLE_ROW_CONTINUATION_ATTR,
]);
const CELL_RUNTIME_ATTRS = new Set([
  TABLE_SOURCE_CELL_COL_ATTR,
  TABLE_VERTICAL_CONTINUATION_ATTR,
  TABLE_ORIGINAL_ROWSPAN_ATTR,
  TABLE_CELL_CONTINUES_ATTR,
  TABLE_CELL_CONTINUATION_ATTR,
  TABLE_CELL_EMPTY_HEAD_ATTR,
  TABLE_CELL_EMPTY_TAIL_ATTR,
]);
/** A list item a row cut went through (containerSplitting's attrs: the
 * schema's own, which also keep the tail item's marker off). */
const LIST_ITEM_CONTINUES_ATTR = "pageSplitItemContinues";
const LIST_ITEM_CONTINUATION_ATTR = "pageSplitItemContinuation";
/** containerSplitting's LIST_ITEM_SPLIT_BRIDGE_ATTR (that module reads this one). */
const LIST_ITEM_BRIDGE_ATTR = "pageSplitListItemBridge";

/** An item's blocks after a cut, without the bridge the cut opened it with. */
function withoutListItemBridge(children: TableJsonNode[]): TableJsonNode[] {
  const first = children[0];
  return first?.type === "paragraph" && first.attrs?.[LIST_ITEM_BRIDGE_ATTR] === true &&
    !(Array.isArray(first.content) && first.content.length > 0)
    ? children.slice(1) : children;
}

const BLOCK_RUNTIME_ATTRS = new Set([
  TABLE_BLOCK_CONTINUES_ATTR,
  TABLE_BLOCK_CONTINUATION_ATTR,
]);

function stripAttrs(
  attrs: Record<string, unknown> | undefined,
  keys: ReadonlySet<string>,
): Record<string, unknown> | undefined {
  if (!attrs) return attrs;
  const next = { ...attrs };
  keys.forEach((key) => delete next[key]);
  return Object.keys(next).length ? next : undefined;
}

/** `stripAttrs` for a record nobody changes afterwards: the save path's
 * serialization keeps its text with the record it came from. */
function stripAttrsKept(
  attrs: Record<string, unknown> | undefined,
  keys: ReadonlySet<string>,
): Record<string, unknown> | undefined {
  const next = stripAttrs(attrs, keys);
  noteStrippedAttrs(next, attrs, keys);
  return next;
}

function restoreCell(cell: TableJsonNode): TableJsonNode {
  const attrs = attrsOf(cell);
  const stamp = attrs[TABLE_ORIGINAL_ROWSPAN_ATTR];
  const hadOriginal = stamp != null;
  const clean = stripAttrs(attrs, CELL_RUNTIME_ATTRS) ?? {};
  // The stamp restores exactly what the cell stated: a span of 1 is written
  // back as 1, and only a cell that never stated a span (stamp 0) gets none.
  // The editor's own JSON always states rowspan, and a rejoined cell that
  // dropped it was no longer the shared document's cell: the causal mirror
  // refused every save of a page whose table row straddled a page seam.
  if (hadOriginal) {
    if (Number(stamp) === 0) delete clean.rowspan;
    else clean.rowspan = integerSpan(stamp);
  }
  return {
    ...cell,
    ...(Object.keys(clean).length ? { attrs: clean } : { attrs: undefined }),
    content: Array.isArray(cell.content)
      ? cell.content.map((block) => ({
          ...block,
          attrs: stripAttrs(block.attrs, BLOCK_RUNTIME_ATTRS),
        }))
      : cell.content,
  };
}

/** An emptied stand-in a cell half carried for content on the other side
 * of a page seam (blankBlockLike), or the empty half of a block cut at its
 * very start or end: a runtime shell with no content of its own. */
function isEmptySeamShell(block: TableJsonNode): boolean {
  const attrs = block.attrs;
  if (!attrs || (attrs[TABLE_BLOCK_CONTINUES_ATTR] !== true && attrs[TABLE_BLOCK_CONTINUATION_ATTR] !== true)) return false;
  if (!BLANKABLE_BLOCK_TYPES.has(String(block.type))) return false;
  return !Array.isArray(block.content) || block.content.length === 0;
}

/**
 * A rejoined cell keeps no empty seam shell beside content of its own. A
 * cell split over three pages carried a stand-in on the middle one; joined
 * back once the table fitted again, the stand-in stayed between the cell's
 * paragraph and its nested table as an empty paragraph (WUA 096: 38 px of
 * blank in an unedited table, saved with the document).
 */
function withoutSeamShells(blocks: TableJsonNode[]): TableJsonNode[] {
  const kept = blocks.filter((block) => !isEmptySeamShell(block));
  const result = kept.length > 0 ? kept : blocks.slice(0, 1);
  // The halves of a nested table the cell's split cut now stand side by
  // side: join them as the outer table's are joined.
  const joined: TableJsonNode[] = [];
  for (const block of result) {
    const previous = joined[joined.length - 1];
    const merged = previous?.type === "table" && block.type === "table"
      ? mergeAdjacentTableFragmentsJson(previous, block)
      : null;
    if (merged) joined[joined.length - 1] = merged;
    else joined.push(block);
  }
  return joined;
}

function mergeCellContent(
  head: TableJsonNode,
  tail: TableJsonNode,
): TableJsonNode[] {
  return withoutSeamShells(joinCellContent(head, tail));
}

function joinCellContent(
  head: TableJsonNode,
  tail: TableJsonNode,
): TableJsonNode[] {
  const headEmpty = head.attrs?.[TABLE_CELL_EMPTY_HEAD_ATTR] === true;
  const tailEmpty = tail.attrs?.[TABLE_CELL_EMPTY_TAIL_ATTR] === true;
  const left = headEmpty ? [] : Array.isArray(head.content) ? head.content : [];
  const right = tailEmpty
    ? []
    : Array.isArray(tail.content)
      ? tail.content
      : [];
  return joinContinuedBlocks(left, right);
}

/** Blocks of a cell's head and tail halves, the block a cut left in two
 * joined back: a split paragraph's words, or a split list's items -- an item
 * the cut went through (``listItemText``) joined back as one item, its
 * paragraph's words as one paragraph. */
function joinContinuedBlocks(left: TableJsonNode[], right: TableJsonNode[]): TableJsonNode[] {
  const last = left[left.length - 1];
  const first = right[0];
  if (
    last?.attrs?.[TABLE_BLOCK_CONTINUES_ATTR] === true &&
    first?.attrs?.[TABLE_BLOCK_CONTINUATION_ATTR] === true &&
    last.type === first.type
  ) {
    const headContent = Array.isArray(last.content) ? last.content : [];
    const tailContent = Array.isArray(first.content) ? first.content : [];
    const headItem = headContent[headContent.length - 1];
    const tailItem = tailContent[0];
    const joinedContent =
      headItem?.attrs?.[LIST_ITEM_CONTINUES_ATTR] === true &&
      tailItem?.attrs?.[LIST_ITEM_CONTINUATION_ATTR] === true &&
      headItem.type === tailItem.type
        ? [
            ...headContent.slice(0, -1),
            {
              ...headItem,
              attrs: keepOuterSeams(headItem.attrs, tailItem.attrs, LIST_ITEM_CONTINUATION_ATTR, LIST_ITEM_CONTINUES_ATTR),
              content: joinContinuedBlocks(
                Array.isArray(headItem.content) ? headItem.content : [],
                withoutListItemBridge(Array.isArray(tailItem.content) ? tailItem.content : []),
              ),
            },
            ...tailContent.slice(1),
          ]
        : joinInlineFragments(headContent, tailContent);
    const joined: TableJsonNode = {
      ...last,
      attrs: keepOuterSeams(last.attrs, first.attrs, TABLE_BLOCK_CONTINUATION_ATTR, TABLE_BLOCK_CONTINUES_ATTR),
      content: joinedContent,
    };
    return [...left.slice(0, -1), joined, ...right.slice(1)];
  }
  return [...left, ...right];
}

/**
 * The attrs of a block joined back across one seam: that seam's two marks go,
 * and the seams on its outer sides stay -- the head half's own continuation of
 * a page before it, the tail half's continuing onto a page after it. A row cut
 * over three pages whose last two pieces joined first lost the middle piece's
 * continuation, and the first seam never joined again: the paragraph stood in
 * two on one page, the head's hard line break a blank row between them, and
 * the pages after it a line lower on the opens that joined in that order
 * (corpus R284-D30: "A3_1" on page 8 or page 9). `window.__docsBlockSeamKeepOff
 * = true` drops both marks, as before.
 */
function keepOuterSeams(
  head: Record<string, unknown> | undefined,
  tail: Record<string, unknown> | undefined,
  continuation: string,
  continues: string,
): Record<string, unknown> | undefined {
  const stripped = stripAttrs(head, new Set([continuation, continues]));
  const off = typeof window !== "undefined" && (window as Window & { __docsBlockSeamKeepOff?: boolean }).__docsBlockSeamKeepOff === true;
  if (off) return stripped;
  const outer = {
    ...(head?.[continuation] === true ? { [continuation]: true } : {}),
    ...(tail?.[continues] === true ? { [continues]: true } : {}),
  };
  return Object.keys(outer).length ? { ...stripped, ...outer } : stripped;
}

function mergeRowFragments(rows: TableJsonNode[]): TableJsonNode {
  const head = rows[0];
  if (rows.length === 1) {
    return {
      ...head,
      attrs: stripAttrs(head.attrs, ROW_RUNTIME_ATTRS),
      content: rowCells(head)
        .filter(
          (cell) => cell.attrs?.[TABLE_VERTICAL_CONTINUATION_ATTR] !== true,
        )
        .map(restoreCell),
    };
  }
  const byCol = new Map<number, TableJsonNode>();
  rows.forEach((row) => {
    rowCells(row).forEach((cell, ordinal) => {
      if (cell.attrs?.[TABLE_VERTICAL_CONTINUATION_ATTR] === true) return;
      const col = Number(cell.attrs?.[TABLE_SOURCE_CELL_COL_ATTR] ?? ordinal);
      const previous = byCol.get(col);
      if (!previous) {
        byCol.set(col, cell);
        return;
      }
      byCol.set(col, {
        ...previous,
        content: mergeCellContent(previous, cell),
        attrs: {
          ...attrsOf(previous),
          ...(cell.attrs?.[TABLE_ORIGINAL_ROWSPAN_ATTR] != null
            ? {
                [TABLE_ORIGINAL_ROWSPAN_ATTR]:
                  cell.attrs[TABLE_ORIGINAL_ROWSPAN_ATTR],
              }
            : {}),
        },
      });
    });
  });
  return {
    ...head,
    attrs: stripAttrs(head.attrs, ROW_RUNTIME_ATTRS),
    content: [...byCol.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, cell]) => restoreCell(cell)),
  };
}

function mergeTableGroup(tables: TableJsonNode[]): TableJsonNode {
  const first = tables[0];
  // Runtime fragments stamp existing logical rows with pageTableSourceRow,
  // but users can insert or paste a brand-new row into either physical
  // fragment. Such a row has no source stamp.  Group continuations in physical
  // reading order instead of rebuilding solely from the original source-row
  // map: source-less edits are then durable and copied rows stay distinct.
  const logicalRows: Array<{
    sourceRow: number | null;
    fragments: TableJsonNode[];
  }> = [];
  // Each physical row's logical row (null: a repeated header clone).
  const logicalOf: Array<Array<number | null>> = [];
  tables.forEach((table) => {
    const physical: Array<number | null> = [];
    logicalOf.push(physical);
    tableRows(table).forEach((row) => {
      if (row.attrs?.[TABLE_REPEATED_HEADER_ATTR] === true) {
        physical.push(null);
        return;
      }
      const sourceRow = Number(row.attrs?.[TABLE_SOURCE_ROW_ATTR]);
      const normalizedSource =
        Number.isInteger(sourceRow) && sourceRow >= 0 ? sourceRow : null;
      const previous = logicalRows[logicalRows.length - 1];
      const continuesPrevious =
        normalizedSource !== null &&
        previous?.sourceRow === normalizedSource &&
        previous.fragments[previous.fragments.length - 1]?.attrs?.[
          TABLE_ROW_CONTINUES_ATTR
        ] === true &&
        row.attrs?.[TABLE_ROW_CONTINUATION_ATTR] === true;
      if (continuesPrevious) {
        previous.fragments.push(row);
      } else {
        logicalRows.push({
          sourceRow: normalizedSource,
          fragments: [row],
        });
      }
      physical.push(logicalRows.length - 1);
    });
  });
  const spans = mergedSpansByRows(tables, logicalOf);
  return {
    ...first,
    attrs: stripAttrsKept(first.attrs, TABLE_RUNTIME_ATTRS),
    content: logicalRows.map(({ fragments }) =>
      mergeRowFragments(
        spans.size === 0
          ? fragments
          : fragments.map((row) =>
              rowCells(row).some((cell) => spans.has(cell))
                ? {
                    ...row,
                    content: (row.content ?? []).map((cell) =>
                      spans.has(cell)
                        ? { ...cell, attrs: { ...attrsOf(cell), [TABLE_ORIGINAL_ROWSPAN_ATTR]: spans.get(cell) } }
                        : cell,
                    ),
                  }
                : row,
            ),
      ),
    ),
  };
}

/**
 * The whole span of a merged cell the pages cut, read off the rows it covers
 * now: from its own row to the last row of its last stand-in on a later page.
 * The cut stamps the span the cell had then; a row inserted inside the merge
 * on one page grows that page's piece, not the stamp, and the stored merge
 * covered one row fewer than the table had: the grid was no grid, the save
 * declined the table and the full writer refused it (corpus R473-D04 LIVE: a
 * row added under a header beside a 34-row merged column). Only a cell whose
 * row is whole on its page and whose merge goes on as stand-ins is read this
 * way; any other shape keeps the stamp. `window.__docsMergedSpanByRowsOff =
 * true` keeps every stamp, as before.
 */
function mergedSpansByRows(
  tables: TableJsonNode[],
  logicalOf: Array<Array<number | null>>,
): Map<TableJsonNode, number> {
  const spans = new Map<TableJsonNode, number>();
  if (
    tables.length < 2 ||
    (typeof window !== "undefined" &&
      (window as Window & { __docsMergedSpanByRowsOff?: boolean }).__docsMergedSpanByRowsOff === true)
  )
    return spans;
  const rowsOf = tables.map(tableRows);
  const rowIsWhole = (row: TableJsonNode) =>
    row.attrs?.[TABLE_ROW_CONTINUES_ATTR] !== true && row.attrs?.[TABLE_ROW_CONTINUATION_ATTR] !== true;
  rowsOf.forEach((rows, fragment) => {
    rows.forEach((row, rowIndex) => {
      const start = logicalOf[fragment]?.[rowIndex];
      if (start == null || !rowIsWhole(row)) return;
      rowCells(row).forEach((cell) => {
        const stamp = cell.attrs?.[TABLE_ORIGINAL_ROWSPAN_ATTR];
        if (stamp == null || Number(stamp) <= 1 || cell.attrs?.[TABLE_VERTICAL_CONTINUATION_ATTR] === true) return;
        const col = cell.attrs?.[TABLE_SOURCE_CELL_COL_ATTR];
        if (!Number.isInteger(col)) return;
        let at = fragment;
        let last = rowIndex + integerSpan(cell.attrs?.rowspan ?? 1) - 1;
        let pieces = 0;
        while (last === rowsOf[at]!.length - 1 && at + 1 < rowsOf.length) {
          const next = rowsOf[at + 1]!;
          const first = next.findIndex((candidate) => candidate.attrs?.[TABLE_REPEATED_HEADER_ATTR] !== true);
          const piece =
            first < 0
              ? undefined
              : rowCells(next[first]!).find(
                  (candidate) =>
                    candidate.attrs?.[TABLE_VERTICAL_CONTINUATION_ATTR] === true &&
                    candidate.attrs?.[TABLE_SOURCE_CELL_COL_ATTR] === col,
                );
          if (!piece) break;
          at += 1;
          last = first + integerSpan(piece.attrs?.rowspan ?? 1) - 1;
          pieces += 1;
        }
        const end = logicalOf[at]?.[last];
        if (pieces === 0 || last >= rowsOf[at]!.length || end == null || end < start) return;
        const span = end - start + 1;
        if (span !== integerSpan(stamp)) spans.set(cell, span);
      });
    });
  });
  return spans;
}

function hasTableRuntimeProjection(
  nodes: TableJsonNode[] | undefined,
): boolean {
  if (!Array.isArray(nodes)) return false;
  return nodes.some(
    (node) =>
      (node.type === "table" &&
        (typeof node.attrs?.[TABLE_FRAGMENT_ID_ATTR] === "string" ||
          node.attrs?.[TABLE_UNBREAKABLE_FALLBACK_ATTR] === true)) ||
      hasTableRuntimeProjection(node.content),
  );
}

/**
 * Page-projection runtime attrs removed from one node of any table level,
 * recursively, so a nested table inside a detached fragment is detached too.
 * A table that is complete in the JSON loses its repeated-header clone rows;
 * one cut open by a slice edge (`openStart` / `openEnd` > 0 along the first /
 * last child chain) keeps its rows.
 */
function detachRuntimeJson(
  node: TableJsonNode,
  openStart = 0,
  openEnd = 0,
): TableJsonNode {
  const keys =
    node.type === "table"
      ? TABLE_RUNTIME_ATTRS
      : node.type === "tableRow"
        ? ROW_RUNTIME_ATTRS
        : node.type === "tableCell" || node.type === "tableHeader"
          ? CELL_RUNTIME_ATTRS
          : BLOCK_RUNTIME_ATTRS;
  const attrs = node.attrs ? stripAttrs(node.attrs, keys) : node.attrs;
  if (!Array.isArray(node.content)) {
    return node.attrs ? { ...node, attrs } : node;
  }
  const children =
    node.type === "table" && openStart === 0 && openEnd === 0
      ? node.content.filter(
          (row) => row?.attrs?.[TABLE_REPEATED_HEADER_ATTR] !== true,
        )
      : node.content;
  return {
    ...node,
    ...(node.attrs ? { attrs } : {}),
    content: detachRuntimeChildrenJson(children, openStart, openEnd),
  };
}

function detachRuntimeChildrenJson(
  nodes: TableJsonNode[],
  openStart: number,
  openEnd: number,
): TableJsonNode[] {
  return nodes.map((child, index) =>
    detachRuntimeJson(
      child,
      index === 0 ? Math.max(0, openStart - 1) : 0,
      index === nodes.length - 1 ? Math.max(0, openEnd - 1) : 0,
    ),
  );
}

/**
 * A physical page fragment made an independent semantic table. An author
 * operation that creates a new table out of a fragment — Split Table, or a
 * copy pasted elsewhere — must not carry the fragment's pagination identity:
 * the storage merge joins every table sharing a `pageTableFragmentId`, so the
 * new table was merged back into the original (and moved to its position) on
 * save. The fragment's own grid becomes the new table's grid: the repeated
 * header clones are dropped, a vertical merge carried in from the previous
 * page stays a real empty cell and a clamped rowspan keeps its clamped height.
 */
export function detachTableFragmentJson(table: TableJsonNode): TableJsonNode {
  return detachRuntimeJson(table);
}

/**
 * The same detachment for every table (and table row / cell / block) in a
 * clipboard slice's content, whose first and last nodes are open to the
 * slice's `openStart` / `openEnd` depth. Null when nothing carries pagination
 * runtime state.
 */
export function detachTableFragmentsInSliceJson(
  nodes: TableJsonNode[],
  openStart: number,
  openEnd: number,
): TableJsonNode[] | null {
  if (!hasAnyTableRuntimeAttr(nodes)) return null;
  // The slice's top-level nodes sit at depth 1 of the open chain.
  return detachRuntimeChildrenJson(nodes, openStart + 1, openEnd + 1);
}

function hasAnyTableRuntimeAttr(nodes: TableJsonNode[] | undefined): boolean {
  if (!Array.isArray(nodes)) return false;
  return nodes.some((node) => {
    const attrs = node?.attrs;
    if (attrs) {
      for (const keys of [
        TABLE_RUNTIME_ATTRS,
        ROW_RUNTIME_ATTRS,
        CELL_RUNTIME_ATTRS,
        BLOCK_RUNTIME_ATTRS,
      ]) {
        for (const key of keys) {
          const value = attrs[key];
          if (value !== undefined && value !== null && value !== false) {
            return true;
          }
        }
      }
    }
    return hasAnyTableRuntimeAttr(node?.content);
  });
}

/**
 * Serialization boundary: collapse all physical table fragments into one
 * native table, remove repeated header clones/vertical carry cells/runtime
 * attrs, restore original rowspans, and keep grid/colspan/width attrs exactly.
 */
export function mergeTableContinuationsJson<T>(doc: T): T {
  const root = doc as TableJsonNode | null;
  if (
    !root ||
    !Array.isArray(root.content) ||
    !hasTableRuntimeProjection(root.content)
  ) {
    return doc;
  }
  const isSheeted = root.content.some((node) => node.type === "pageBlock");
  const walk: Array<{ page: number; node: TableJsonNode }> = [];
  if (isSheeted) {
    root.content.forEach((page, pageIndex) => {
      if (page.type === "pageBlock" && Array.isArray(page.content)) {
        page.content.forEach((node) => walk.push({ page: pageIndex, node }));
      } else {
        walk.push({ page: pageIndex, node: page });
      }
    });
  } else {
    root.content.forEach((node) => walk.push({ page: 0, node }));
  }

  const groups = new Map<string, TableJsonNode[]>();
  walk.forEach(({ node }) => {
    const id = node.attrs?.[TABLE_FRAGMENT_ID_ATTR];
    if (node.type === "table" && typeof id === "string") {
      const group = groups.get(id) ?? [];
      group.push(node);
      groups.set(id, group);
    }
  });
  const emitted = new Set<string>();
  const mergedWalk: Array<{ page: number; node: TableJsonNode }> = [];
  walk.forEach((entry) => {
    const id = entry.node.attrs?.[TABLE_FRAGMENT_ID_ATTR];
    if (entry.node.type !== "table" || typeof id !== "string") {
      mergedWalk.push(
        entry.node.type === "table"
          ? {
              ...entry,
              node: {
                ...entry.node,
                attrs: stripAttrsKept(entry.node.attrs, TABLE_RUNTIME_ATTRS),
              },
            }
          : entry,
      );
      return;
    }
    if (emitted.has(id)) return;
    emitted.add(id);
    mergedWalk.push({
      ...entry,
      node: mergeTableGroup(groups.get(id) ?? [entry.node]),
    });
  });

  // Join outer row/cell fragments first. Only then do nested table fragments
  // become siblings in their original cell. Recurse within that container,
  // never combine identical-looking IDs from different cells or stories.
  const nestedWalk = mergedWalk.map((entry) => ({
    ...entry,
    node: mergeTableContinuationsJson(entry.node),
  }));
  if (!isSheeted) {
    return { ...root, content: nestedWalk.map(({ node }) => node) } as T;
  }
  const pageTemplates = root.content;
  const pageMap = new Map<number, TableJsonNode>();
  const pages: TableJsonNode[] = [];
  nestedWalk.forEach((entry) => {
    let page = pageMap.get(entry.page);
    if (!page) {
      const template = pageTemplates[entry.page];
      page =
        template?.type === "pageBlock"
          ? { ...template, content: [] }
          : { type: "pageBlock", content: [] };
      pageMap.set(entry.page, page);
      pages.push(page);
    }
    page.content!.push(entry.node);
  });
  return { ...root, content: pages } as T;
}
