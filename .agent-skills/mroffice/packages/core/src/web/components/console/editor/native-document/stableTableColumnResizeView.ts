"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  deviceCanHover,
  deviceHasTouch,
  devicePointerIsCoarse,
  isTouchLikePointer,
} from "../../../../lib/pointer-capability";
import { yieldTouchHold } from "../../../../lib/touch-hold";
import { TableView } from "@tiptap/extension-table";
import { closeHistory } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { PluginKey, type Transaction } from "@tiptap/pm/state";
import { columnResizingPluginKey, TableMap } from "@tiptap/pm/tables";
import type { EditorView } from "@tiptap/pm/view";

import borderDragStyles from "./DocumentTableBorderDrag.module.css";
import { nativeTableGridWidths } from "./nativeTableGridView";
import { noWrapSlots } from "./tableNoWrap";
import { logicalTableFragmentsAt } from "./paged/tableFragmentGroups";
import {
  TABLE_FRAGMENT_ID_ATTR,
  TABLE_ROW_CONTINUATION_ATTR,
  TABLE_ROW_CONTINUES_ATTR,
  TABLE_SOURCE_ROW_ATTR,
} from "./paged/tablePagination";
import {
  MAX_TABLE_INDENT_PX,
  normalizeTableAlign,
  normalizeTableIndentPx,
  normalizeTableIndentTwips,
} from "./tableAlignment";
import {
  planTableColumnBorderDrag,
  planTableLeftEdgeDrag,
  planTableRowHeightDrag,
  tableColumnDragMode,
  tableRowHeightDragRule,
} from "./tableBorderDragPlan";
import { documentNativeTableGridBorderProfile } from "./tableBorders";
import {
  MAX_ROW_HEIGHT_PX,
  MIN_ROW_HEIGHT_PX,
  normalizeTableRowHeight,
  normalizeTableRowHeightRule,
} from "./tableRowStyle";
import { normalizeTableColumnWidthsTwips } from "./tableStructure";
import {
  normalizeTablePositioning,
  serializeTablePositioning,
  tablePositioningInlineFloat,
} from "./tablePositioning";
import { firstSectionPageWidthPx, pageOffsetTableFloat } from "./floatingTableAnchor";
import { releaseTablePageFrame, TABLE_PAGE_FRAME_ATTR } from "./tablePageFrame";
import {
  applyWordAutofitGeometry,
  clearWordAutofitGeometry,
  NATIVE_GRID_RESYNC_EVENT,
  NATIVE_GRID_USED_WIDTH_ATTR,
  WORD_SHARE_GROWN_ATTR,
  wordAutofitGeometryFor,
  wordMinContentFloorFor,
  wordShareTableGrowthFor,
  wordTableDisplayMarginLeftPx,
} from "./wordTableAutofitDisplay";
import { readWordTableLayout, wordCellHorizontalMargins } from "./wordTableLayout";
import { clipToVisibleEditor } from "./visibleEditorClip";

/** Whether the table stands inside a table cell (a nested table). */
function isNestedTable(table: HTMLTableElement): boolean {
  return Boolean(table.parentElement?.closest("td, th"));
}

/**
 * A nested table's column widths from its cells' `colwidth` (px), for the
 * display only: a column no cell states takes the average of the others.
 */
export function nestedTableColumnWidths(node: ProseMirrorNode): number[] | null {
  const map = TableMap.get(node);
  const widths: (number | null)[] = Array<number | null>(map.width).fill(null);
  const seen = new Set<number>();
  for (let gridIndex = 0; gridIndex < map.map.length; gridIndex += 1) {
    const offset = map.map[gridIndex];
    if (seen.has(offset)) continue;
    seen.add(offset);
    const cell = node.nodeAt(offset);
    const live: unknown = cell?.attrs.colwidth;
    if (!cell || !Array.isArray(live)) continue;
    const column = gridIndex % map.width;
    for (let index = 0; index < live.length && column + index < map.width; index += 1) {
      const value: unknown = live[index];
      if (typeof value === "number" && Number.isFinite(value) && value > 0 && widths[column + index] === null) {
        widths[column + index] = value;
      }
    }
  }
  const known = widths.filter((value): value is number => value !== null);
  if (known.length === 0) return null;
  const average = known.reduce((sum, value) => sum + value, 0) / known.length;
  return widths.map(value => value ?? average);
}

/** The two cell margins a text-aligned in-flow table reaches past the text
 * column (its first cell's left, its last cell's right); 0 otherwise. */
function textAlignedTableOutsetPx(node: ProseMirrorNode): number {
  if (readWordTableLayout(node.attrs)?.textAligned !== true) return 0;
  // A centred table reaches past both sides the same (corpus R283-D24, mode 14:
  // a 100% table over a 9360-twip column, grid 9560 = 9360 + 2 x 100).
  const align = normalizeTableAlign(node.attrs.tableAlign);
  if ((align !== null && align !== "center") || node.attrs.tablePositioning != null) return 0;
  const firstRow = node.firstChild;
  const firstCell = firstRow?.firstChild;
  const lastCell = firstRow?.lastChild;
  if (!firstCell || !lastCell) return 0;
  const left = wordCellHorizontalMargins(node, firstCell).left ?? 0;
  const right = wordCellHorizontalMargins(node, lastCell).right ?? 0;
  const total = left + right;
  return Number.isFinite(total) && total > 0 ? total : 0;
}

/** Whether every one of a table's `columns` holds a w:noWrap cell (tableNoWrap). */
function noWrapEveryColumn(node: ProseMirrorNode, columns: number): boolean {
  if (typeof window !== "undefined" && (window as Window & { __docsNoWrapStatedWidthOff?: boolean }).__docsNoWrapStatedWidthOff === true) return false;
  const slots = noWrapSlots(node);
  if (!slots || columns <= 0) return false;
  const held = new Set<number>();
  for (const slot of slots) held.add(Number(slot.split(":")[1]));
  for (let column = 0; column < columns; column += 1) if (!held.has(column)) return false;
  return true;
}

function syncNativeGridDisplay(table: HTMLTableElement, colgroup: HTMLTableColElement, node: ProseMirrorNode, view?: EditorView | null): void {
  if (readWordTableLayout(node.attrs)?.bidiVisual) table.dataset.wordBidiVisual = "true";
  else delete table.dataset.wordBidiVisual;
  const nativeWidths = nativeTableGridWidths(node);
  // A table inside a cell that states no native grid (an imported nested
  // table, or one whose grid the editor changed) is fitted into the host
  // cell's text area, its columns shrunk in proportion. Its px colgroup
  // otherwise ran past the host cell's right border (the host clips it: a
  // column cut off).
  // That is Word's rule for a nested table of w:tblW AUTO only. Word 16.86
  // fixtures (mode 15, corpus docx-tablewidths/fixtures-1110): a nested table
  // of auto width over 3000 + 3000 cells in a 5000-twip host cell draws
  // 2386 + 2390 (a3). A nested table that states a width (tblW 6000 dxa) is
  // never shrunk: in an AutoFit host it widens the host column to itself plus
  // the cell margins (a1: the 5000-twip host drawn 6225; a4: two host columns
  // of 3000 drawn 4224 + 1776), in a fixed host it runs past the cell (a2).
  // The page does not state a nested table's preferred width, so both kinds
  // are still fitted here (corpus R280-D15 is the one known document; the
  // plan is in docx-textengine/PROGRESS.md).
  // A column whose unbreakable content is wider than it is drawn wide enough
  // for it, the others giving the room back (wordMinContentFloorFor).
  const floored = nativeWidths ? wordMinContentFloorFor(view, node) : null;
  const widths = (floored && floored.length === nativeWidths?.length ? [...floored] : null) ??
    nativeWidths ?? (isNestedTable(table) ? nestedTableColumnWidths(node) : null);
  const nativeBox = nativeWidths && view ? documentNativeTableGridBorderProfile(view.state, node) : null;
  if (nativeBox) table.setAttribute(NATIVE_GRID_USED_WIDTH_ATTR, String(nativeBox.usedWidthPx));
  else table.removeAttribute(NATIVE_GRID_USED_WIDTH_ATTR);
  if (nativeBox) {
    // w:gridCol describes shared grid-edge distances. A collapsed CSS outer
    // box also contains half of each outer border. Use the engine's measured
    // width explicitly: WebKit's table content-box differs from Chromium's.
    table.dataset.nativeGridBorderBox = "true";
    table.style.boxSizing = "border-box";
    table.style.border = nativeBox.css;
  } else if (table.dataset.nativeGridBorderBox === "true") {
    table.removeAttribute("data-native-grid-border-box");
    table.style.removeProperty("box-sizing");
    table.style.removeProperty("border");
  }
  // Word AutoFit to contents: the measured widths replace the stored grid.
  const autofit = wordAutofitGeometryFor(view, node);
  if (autofit) {
    table.removeAttribute("data-native-grid-display");
    applyWordAutofitGeometry(table, colgroup, autofit);
    return;
  }
  clearWordAutofitGeometry(table);
  if (!widths || node.attrs.tableLayoutPolicy === "initial_fixed") {
    table.removeAttribute("data-native-grid-display");
    return;
  }
  const total = widths.reduce((sum, value) => sum + value, 0);
  table.dataset.nativeGridDisplay = "true";
  // Its narrowest contents need more than its share of the text column (or, of
  // no width of its own, more than the column): Word draws it as wide as they
  // need, up to the right margin from where it starts (wordShareTableGrowthFor).
  const grown = floored ? wordShareTableGrowthFor(view, node) : null;
  if (grown !== null) {
    table.setAttribute(WORD_SHARE_GROWN_ATTR, "true");
    table.style.width = `${grown + (nativeBox?.usedWidthPx ?? 0)}px`;
    table.style.maxWidth = "none";
    for (let index = 0; index < widths.length; index += 1) {
      const column = colgroup.children[index] as HTMLTableColElement | undefined;
      if (column) {
        column.style.width = `${widths[index] / total * 100}%`;
        column.style.removeProperty("min-width");
      }
    }
    return;
  }
  table.removeAttribute(WORD_SHARE_GROWN_ATTR);
  const wordLayout = readWordTableLayout(node.attrs);
  // A stated width under the columns: Word draws the table at it and shares it out
  // (wordMinContentFloorWidths; Word 16.86, a table of tblW 8328 over 12000 twips of
  // cells draws 8328). Above them, or fixed, the branch below keeps the grid.
  // Every column holding a cell Word may not wrap (w:noWrap): Word does not
  // shrink the columns to the stated width but keeps the grid (truth machine,
  
  // 5000 and 5238 twips over a 5238-twip grid of noWrap cells in a 4950-twip
  // column all drew 262.1pt; without noWrap, tblW 5140 drew 257pt; corpus
  // R425-D02's two-column results table). `window.__docsNoWrapStatedWidthOff`:
  // as before (A/B).
  const statedPx = wordLayout?.preferredWidthTwips !== undefined && !wordLayout.fixedLayout &&
    !normalizeTablePositioning(node.attrs.tablePositioning) && wordLayout.preferredWidthTwips / 15 < total * 0.985 &&
    !noWrapEveryColumn(node, widths.length)
    ? wordLayout.preferredWidthTwips / 15 : null;
  if (statedPx !== null) {
    table.style.width = `${nativeBox ? statedPx + nativeBox.usedWidthPx : statedPx}px`;
    table.style.maxWidth = "none";
    for (let index = 0; index < widths.length; index += 1) {
      const column = colgroup.children[index] as HTMLTableColElement | undefined;
      if (column) {
        column.style.width = `${widths[index] / total * 100}%`;
        column.style.removeProperty("min-width");
      }
    }
    return;
  }
  if (
    normalizeTablePositioning(node.attrs.tablePositioning) ||
    (wordLayout?.fixedLayout && wordLayout.preferredWidthPct === undefined) ||
    wordLayout?.preferredWidthTwips !== undefined
  ) {
    // A FLOATING table (`w:tblpPr`, ECMA-376 17.4.58) is positioned against its
    // page / margin / column anchor, and Word does not fit it to the text
    // column: it keeps its declared grid and runs past the column edge. The
    // in-flow `min(total, 100%)` clamp compressed such a table into whatever
    // column happened to hold its anchor — corpus
    // floating-table-section-columns put 549.9pt of grid inside a 252pt
    // newspaper column, moving every cell's text left by 41.6pt.
    // A FIXED-layout table (`w:tblLayout w:type="fixed"`) keeps its grid the
    // same way: Word runs a grid wider than the text column into the right
    // margin (corpus R36-D30: shrinking it wrapped every row's text onto
    // more lines and the 12-page table took 13 pages). So does a table whose
    // absolute preferred width is wider than the column (R116-D16).
    table.style.width = `${nativeBox ? total + nativeBox.usedWidthPx : total}px`;
    table.style.maxWidth = "none";
    for (let index = 0; index < widths.length; index += 1) {
      const column = colgroup.children[index] as HTMLTableColElement | undefined;
      if (column) {
        column.style.width = `${widths[index]}px`;
        column.style.removeProperty("min-width");
      }
    }
    return;
  }
  // Word fits an in-flow table to the text column from where it starts: a
  // table indented by w:tblInd ends at the right margin, its columns shrunk
  // in proportion, instead of running past it by the indent.
  const indentPx = Number.parseFloat(table.style.marginLeft);
  const room = Number.isFinite(indentPx) && indentPx > 0 ? `calc(100% - ${indentPx}px)` : "100%";
  const preferredPct = wordLayout?.preferredWidthPct;
  if (preferredPct !== undefined) {
    // A percentage preferred width over fixed cell widths: Word draws the
    // table at that share of the text column and scales the columns (which
    // follow below as shares of the grid) in proportion. A table whose cell
    // text lines up with the body text (Word 2010 and earlier) reaches one
    // cell margin past the column on each side, as Word saves its grid
    // (corpus R38-D21: a 100% table over a 3074-twip column, grid 3290 =
    // 3074 + 2 x 108; drawn 3074 wide its last column wrapped "column").
    // The share is of the text column, whatever the indent: Word neither
    // takes it from the room the indent leaves nor ends the table at the right
    // margin. Word 16.86 fixtures (mode 15, a 9026-twip column, tblInd 1440,
    // corpus docx-tablewidths/fixtures-1110, rules read from the PDF):
    //   c4 pct 2500 (50%)  draws 4507 twips, 0.5 x 9026 (from the room: 3793);
    //   c5 pct 4500 (90%)  draws 8112, 537 twips past the right margin (not 7586);
    //   c1 pct 5000 (100%) draws 9014, its whole indent past the margin (not 7586);
    //   c2 pct 6000 (120%) draws 10820, 1.2 x 9026 (from the room: 9103).
    // Corpus R365-D05 (pct 4314, tblInd 446, column 9746: 8400) and R379-D01
    // (pct 4400, tblInd 709, column 9026: 7934) draw the same way, and
    // R279-D12 (tblW 9000 dxa, read as 4614 of its 9753 column, tblInd 648)
    // draws its 3096 + 5904 grid, which the room's share drew 560 px for 600.
    const share = `${preferredPct / 50}%`;
    const indented = room !== "100%";
    const outset = textAlignedTableOutsetPx(node);
    table.style.width = outset > 0 ? `calc(${share} + ${outset}px)` : share;
    // The stylesheet's max-width: 100% would take the reach back.
    if (outset > 0 || preferredPct > 5000 || indented) table.style.maxWidth = "none";
    else table.style.removeProperty("max-width");
  } else {
    // The grid (its rules' centres) is what fits the column; a native border
    // box's outer rules stand half outside it, as Word draws them. Capping the
    // box itself at the column took a rule's width from the columns (corpus
    // R94-D19: a 5490-twip grid in a 5490-twip column drew its first cell's
    // text 0.97px narrower than Word's, and lines Word fits wrapped).
    // A table whose cell text lines up with the body text (Word 2010 and
    // earlier) fits the column with its two cell margins past it, the way
    // Word saves its grid: Word 16.86 drew R281-D19's 9854-twip grid over a
    // 9641-twip column at its grid widths, its cell text 0.65 pt left of the
    // margin; capped at the column, its 17-character cells wrapped onto two
    // lines and the page ran 72 px longer.
    const outset = textAlignedTableOutsetPx(node);
    const reach = (extraPx: number) => (extraPx > 0 ? `calc(${room} + ${extraPx}px)` : room);
    table.style.width = nativeBox
      ? `min(${total + nativeBox.usedWidthPx}px, ${reach(nativeBox.usedWidthPx + outset)})`
      : `min(${total}px, ${reach(outset)})`;
    // The stylesheet's max-width: 100% would clip that rule (or reach) again.
    if (nativeBox || outset > 0) table.style.maxWidth = "none";
    else table.style.removeProperty("max-width");
  }
  for (let index = 0; index < widths.length; index += 1) {
    const column = colgroup.children[index] as HTMLTableColElement | undefined;
    if (column) {
      column.style.width = `${widths[index] / total * 100}%`;
      column.style.removeProperty("min-width");
    }
  }
}

const RESIZE_DRAG_THRESHOLD_PX = 2;
/** Half-width of the band around a column border that grabs it. */
export const DOCUMENT_TABLE_RESIZE_HIT_WIDTH_PX = 6;
/** Half-height of the band around a row border that grabs it. */
export const DOCUMENT_TABLE_ROW_RESIZE_HIT_PX = 4;
/** A native grid moves in whole twips. */
const TWIP_PX = 1 / 15;

interface InlineStyleSnapshot {
  readonly table: string | null;
  readonly columns: readonly (string | null)[];
}

interface ResizeContext {
  readonly column: number;
  readonly map: TableMap;
  readonly tableNode: ProseMirrorNode;
  readonly tableStart: number;
}

interface LegacyResizeContext extends ResizeContext {
  readonly activeHandle: number;
}

/** A border of one live table that a pointer drag can move. `column` is the
 * grid column LEFT of the dragged border; `rowIndex` the row ABOVE it. */
export type DocumentTableBorderTarget =
  | { readonly kind: "column"; readonly column: number; readonly tablePos: number }
  | { readonly kind: "leftEdge"; readonly tablePos: number }
  | { readonly kind: "row"; readonly rowIndex: number; readonly tablePos: number };

interface GestureListeners {
  readonly ownerWindow: Window;
  onMouseMove: (event: MouseEvent) => void;
  onMouseUp: (event: MouseEvent) => void;
  onKeyDown: (event: KeyboardEvent) => void;
  /** A finger's (or a non-hovering pen's) drag follows pointer events. */
  pointer?: {
    readonly id: number;
    readonly onMove: (event: PointerEvent) => void;
    readonly onUp: (event: PointerEvent) => void;
    readonly onCancel: (event: PointerEvent) => void;
  };
}

interface ColumnGesture extends GestureListeners {
  readonly kind: "column" | "leftEdge";
  readonly column: number;
  /** Rebound when pagination replaces the table node mid-drag. */
  map: TableMap;
  tableNode: ProseMirrorNode;
  readonly tableStart: number;
  readonly doc: ProseMirrorNode;
  readonly startX: number;
  readonly startWidths: readonly number[];
  readonly nativeWidths: readonly number[] | null;
  readonly nativeDisplayScale: number;
  styles: InlineStyleSnapshot;
  /** A left-aligned table dragged by its left edge: the stored indent and
   * the rendered left margin the preview starts from. */
  readonly indentPx: number | null;
  readonly marginLeftPx: number;
  moved: boolean;
  previewWidths: number[] | null;
  previewIndentDeltaPx: number;
}

interface RowGesture extends GestureListeners {
  readonly kind: "row";
  readonly doc: ProseMirrorNode;
  /** Rebound when pagination replaces the table node mid-drag. */
  tableNode: ProseMirrorNode;
  readonly tablePos: number;
  readonly rowIndex: number;
  readonly row: HTMLTableRowElement;
  readonly startY: number;
  /** Logical row height (layout px) at the start, every page piece included. */
  readonly startHeight: number;
  /** Height of the row's pieces on other pages. */
  readonly otherPiecesHeight: number;
  /** Client px per layout px (page zoom). */
  readonly scale: number;
  readonly rule: "atLeast" | "exact";
  readonly preview: RowHeightPreview;
  moved: boolean;
  height: number | null;
}

type BorderGesture = ColumnGesture | RowGesture;

const tableResizeViews = new WeakMap<Element, StableTableColumnResizeView>();

/** pageRebalanceExtension's REBALANCE_META: a pagination pass that only moves
 * content between pages. */
const PAGINATION_REBALANCE_META = "structuralRebalance";

/** Key of the border-drag plugin (documentTableBorderDrag.ts). Its state says
 * whether the latest document change was a pagination pass. */
export const documentTableBorderDragKey = new PluginKey<boolean>(
  "documentTableBorderDrag",
);

export function paginationOnlyDocumentChange(tr: Transaction, previous: boolean): boolean {
  if (!tr.docChanged) return previous;
  const root = (tr.getMeta("appendedTransaction") as Transaction | undefined) ?? tr;
  return root.getMeta(PAGINATION_REBALANCE_META) === true;
}

/** The live resize NodeView that renders `table`, if any. */
export function documentTableResizeViewFor(
  table: Element | null | undefined,
): StableTableColumnResizeView | null {
  return table ? tableResizeViews.get(table) ?? null : null;
}

/** A floating table placed from the top margin (`w:tblpPr`, vertAnchor
 * margin, `w:tblpY`) that opens the document stands that far below the
 * margin, where Word draws it; the flow, which starts at the margin, would
 * put it at the top (corpus R10-D09: tblpY 495 twips, Word draws the table
 * under the header's title at margin + 24.75 pt, we drew it over the title). */
function documentStartTableOffsetPx(
  positioning: ReturnType<typeof normalizeTablePositioning>,
  node: ProseMirrorNode,
  view: EditorView | null,
): number {
  if (!positioning || !view || node.attrs.pageTableContinuation) return 0;
  if (positioning.verticalAnchor !== "margin" || positioning.vertical.mode !== "offset") return 0;
  if (!(positioning.vertical.twips > 0)) return 0;
  const firstPage = view.state.doc.firstChild;
  if (firstPage?.firstChild !== node) return 0;
  return positioning.vertical.twips / 15;
}

function syncTablePositioningProjection(
  wrapper: HTMLDivElement,
  table: HTMLTableElement,
  node: ProseMirrorNode,
  view: EditorView | null,
): void {
  const positioning = normalizeTablePositioning(node.attrs.tablePositioning);
  const serialized = serializeTablePositioning(positioning);
  const inlineFloat = tablePositioningInlineFloat(positioning);
  const pageFloat = !node.attrs.pageTableBlockContinues && view
    ? pageOffsetTableFloat(node, firstSectionPageWidthPx(view.state.doc))
    : null;

  if (serialized) table.dataset.tablePositioning = serialized;
  else table.removeAttribute("data-table-positioning");

  // TableView renders a full-width block wrapper. Floating the inner table
  // leaves that wrapper in normal flow and can both defeat wrapping and hide
  // the real height from structural pagination. The wrapper is therefore the
  // visual float/measurement owner; the table keeps only serialized attrs.
  table.style.removeProperty("float");
  if (positioning && inlineFloat) table.style.removeProperty("margin");
  table.style.removeProperty("max-width");
  if (table.style.width === "fit-content") table.style.removeProperty("width");

  // On a page the paginator's pass draws the table where Word puts it
  // (tablePageFrame); its placement is not reset between passes.
  if (!positioning) releaseTablePageFrame(wrapper);
  else if (wrapper.hasAttribute(TABLE_PAGE_FRAME_ATTR)) return;

  if (pageFloat) {
    // A table placed from the page's left edge floats beside its text there
    // (floatingTableAnchor.pageOffsetTableFloat).
    table.removeAttribute("data-table-positioning-projection");
    wrapper.dataset.tablePositioningProjection = `page-${pageFloat.float}`;
    wrapper.style.float = pageFloat.float;
    wrapper.style.width = pageFloat.width;
    wrapper.style.maxWidth = "none";
    wrapper.style.margin = "";
    wrapper.style.marginTop = pageFloat.marginTop;
    wrapper.style.marginBottom = pageFloat.marginBottom;
    wrapper.style.marginLeft = pageFloat.marginLeft;
    wrapper.style.marginRight = pageFloat.marginRight;
    return;
  }

  if (!positioning || !inlineFloat) {
    table.removeAttribute("data-table-positioning-projection");
    wrapper.removeAttribute("data-table-positioning-projection");
    wrapper.style.removeProperty("float");
    wrapper.style.removeProperty("margin");
    wrapper.style.removeProperty("width");
    wrapper.style.removeProperty("max-width");
    const marginTop = documentStartTableOffsetPx(positioning, node, view);
    if (marginTop > 0) wrapper.style.marginTop = `${marginTop}px`;
    return;
  }

  const distance = positioning.distanceFromText;
  table.dataset.tablePositioningProjection = inlineFloat;
  wrapper.dataset.tablePositioningProjection = inlineFloat;
  wrapper.style.float = inlineFloat;
  wrapper.style.width = "fit-content";
  wrapper.style.maxWidth = "100%";
  wrapper.style.margin = `${distance.top / 15}px ${distance.right / 15}px ${distance.bottom / 15}px ${distance.left / 15}px`;
}

function positiveWidth(value: unknown): number | null {
  const width = Number(value);
  return Number.isFinite(width) && width > 0 ? width : null;
}

function sameWidths(left: unknown, right: readonly number[]): boolean {
  return (
    Array.isArray(left) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function modelColumnWidths(
  tableNode: ProseMirrorNode,
  map: TableMap,
): Array<number | null> {
  const widths = Array.from<number | null>({ length: map.width }).fill(null);
  for (const offset of new Set(map.map)) {
    const cell = tableNode.nodeAt(offset);
    if (!cell) continue;
    const firstGridIndex = map.map.indexOf(offset);
    if (firstGridIndex < 0) continue;
    const firstColumn = firstGridIndex % map.width;
    const span = Math.max(1, Number(cell.attrs.colspan) || 1);
    const colwidth = Array.isArray(cell.attrs.colwidth)
      ? cell.attrs.colwidth
      : null;
    for (let index = 0; index < span; index += 1) {
      const width = positiveWidth(colwidth?.[index]);
      if (width !== null && widths[firstColumn + index] === null) {
        widths[firstColumn + index] = width;
      }
    }
  }
  return widths;
}

function elementWidth(element: Element | null): number | null {
  if (!element) return null;
  const rectWidth = positiveWidth(element.getBoundingClientRect().width);
  if (rectWidth !== null) return rectWidth;
  if (element instanceof HTMLElement) {
    const offsetWidth = positiveWidth(element.offsetWidth);
    if (offsetWidth !== null) return offsetWidth;
  }
  return null;
}

function roundRenderedWidth(value: number, minimum: number): number {
  return Math.max(minimum, Math.round(value));
}

function measuredColumnWidths(
  view: EditorView,
  tableNode: ProseMirrorNode,
  tableStart: number,
  map: TableMap,
  table: HTMLTableElement,
  colgroup: HTMLTableColElement,
  cellMinWidth: number,
): number[] {
  const columns = Array.from(colgroup.children);
  if (columns.length === map.width) {
    const widths = columns.map((column) => elementWidth(column));
    if (widths.every((width): width is number => width !== null)) {
      return widths.map((width) => roundRenderedWidth(width, cellMinWidth));
    }
  }

  const modelWidths = modelColumnWidths(tableNode, map);
  const directCandidates: number[][] = Array.from(
    { length: map.width },
    () => [],
  );
  const spanCandidates: number[][] = Array.from(
    { length: map.width },
    () => [],
  );

  for (const offset of new Set(map.map)) {
    const cell = tableNode.nodeAt(offset);
    if (!cell) continue;
    const firstGridIndex = map.map.indexOf(offset);
    if (firstGridIndex < 0) continue;
    const firstColumn = firstGridIndex % map.width;
    const span = Math.max(1, Number(cell.attrs.colspan) || 1);
    const dom = view.nodeDOM(tableStart + offset);
    const renderedWidth = elementWidth(dom instanceof Element ? dom : null);
    if (renderedWidth === null) continue;
    if (span === 1) {
      directCandidates[firstColumn]?.push(renderedWidth);
      continue;
    }

    const declared = Array.from({ length: span }, (_, index) =>
      positiveWidth(modelWidths[firstColumn + index]),
    );
    const declaredTotal = declared.every(
      (width): width is number => width !== null,
    )
      ? declared.reduce((sum, width) => sum + width, 0)
      : 0;
    for (let index = 0; index < span; index += 1) {
      const declaredWidth = declared[index];
      const share =
        declaredTotal > 0 && declaredWidth !== null
          ? renderedWidth * (declaredWidth / declaredTotal)
          : renderedWidth / span;
      spanCandidates[firstColumn + index]?.push(share);
    }
  }

  const measured = Array.from<number | null>({ length: map.width }).fill(null);
  for (let column = 0; column < map.width; column += 1) {
    const candidates =
      directCandidates[column]?.length > 0
        ? directCandidates[column]
        : spanCandidates[column];
    if (candidates && candidates.length > 0) {
      measured[column] =
        candidates.reduce((sum, width) => sum + width, 0) / candidates.length;
    } else {
      measured[column] = modelWidths[column];
    }
  }

  const tableWidth = elementWidth(table);
  const missing = measured.flatMap((width, index) =>
    width === null ? [index] : [],
  );
  if (missing.length > 0 && tableWidth !== null) {
    const knownTotal = measured.reduce(
      (sum: number, width) => sum + (width ?? 0),
      0,
    );
    const shared = Math.max(
      cellMinWidth,
      (tableWidth - knownTotal) / missing.length,
    );
    for (const index of missing) measured[index] = shared;
  }

  return measured.map((width) =>
    roundRenderedWidth(width ?? cellMinWidth, cellMinWidth),
  );
}

function snapshotInlineStyles(
  table: HTMLTableElement,
  colgroup: HTMLTableColElement,
): InlineStyleSnapshot {
  return {
    table: table.getAttribute("style"),
    columns: Array.from(colgroup.children, (column) =>
      column.getAttribute("style"),
    ),
  };
}

function restoreInlineStyles(
  table: HTMLTableElement,
  colgroup: HTMLTableColElement,
  snapshot: InlineStyleSnapshot,
): void {
  if (snapshot.table === null) table.removeAttribute("style");
  else table.setAttribute("style", snapshot.table);
  Array.from(colgroup.children).forEach((column, index) => {
    const style = snapshot.columns[index];
    if (style === null || style === undefined) column.removeAttribute("style");
    else column.setAttribute("style", style);
  });
}

function previewColumnWidths(
  table: HTMLTableElement,
  colgroup: HTMLTableColElement,
  widths: readonly number[],
): void {
  Array.from(colgroup.children).forEach((column, index) => {
    const renderedColumn = column as HTMLTableColElement;
    renderedColumn.style.removeProperty("min-width");
    renderedColumn.style.width = `${widths[index] ?? 0}px`;
  });
  table.style.minWidth = "";
  table.style.width = `${widths.reduce((sum, width) => sum + width, 0)}px`;
}

function preserveMatchingNativeWidths(
  attrs: Record<string, unknown>,
  widths: readonly number[],
): Record<string, unknown> {
  const native = normalizeTableColumnWidthsTwips(
    attrs.colwidthTwips,
    widths.length,
  );
  if (
    native &&
    native.every(
      (widthTwips, index) =>
        Math.abs(widthTwips - (widths[index] ?? 0) * 15) <= 2,
    )
  ) {
    return attrs;
  }
  return { ...attrs, colwidthTwips: null };
}

/** Whether any cell of the table keeps an imported exact twips width. */
function tableCarriesColumnTwips(table: ProseMirrorNode): boolean {
  let found = false;
  table.descendants((node) => {
    if (found) return false;
    if (node.type.name === "table") return false;
    if (node.type.spec.tableRole === "cell" || node.type.spec.tableRole === "header_cell") {
      if (Array.isArray(node.attrs.colwidthTwips)) found = true;
      return false;
    }
    return true;
  });
  return found;
}

/**
 * Where `node` sits in `doc` now. ProseMirror keeps untouched nodes by
 * identity, so an edit elsewhere during a drag (a collaborator typing, a
 * pagination pass) moves the table without replacing it.
 */
function locateNode(doc: ProseMirrorNode, node: ProseMirrorNode, hint: number): number | null {
  if (hint >= 0 && hint < doc.content.size && doc.nodeAt(hint) === node) return hint;
  let found: number | null = null;
  doc.descendants((candidate, pos) => {
    if (found !== null) return false;
    if (candidate === node) {
      found = pos;
      return false;
    }
    return !candidate.isTextblock;
  });
  return found;
}

/** A table indent moved by `deltaPx`, keeping an exact imported twips value. */
function movedTableIndentAttrs(
  attrs: Record<string, unknown>,
  deltaPx: number,
): { tableIndentPx: number | null; tableIndentTwips: number | null } {
  const px = normalizeTableIndentPx(attrs.tableIndentPx) ?? 0;
  const twips = normalizeTableIndentTwips(attrs.tableIndentTwips);
  const exact = twips !== null && Math.round(twips / 15) === px ? twips : null;
  const nextTwips = (exact ?? px * 15) + deltaPx * 15;
  const nextPx = normalizeTableIndentPx(nextTwips / 15);
  if (nextPx === null) return { tableIndentPx: null, tableIndentTwips: null };
  return {
    tableIndentPx: nextPx,
    tableIndentTwips: exact === null ? null : normalizeTableIndentTwips(nextTwips),
  };
}

interface RowPiece {
  readonly pos: number;
  readonly node: ProseMirrorNode;
}

/**
 * Every physical row that is the same logical row as row `rowIndex` of the
 * table at `tablePos`: its halves when pagination split it across pages and
 * the header copies repeated on continuation pages. They share the source
 * row stamp and must carry the same height.
 */
function logicalRowPieces(
  doc: ProseMirrorNode,
  tablePos: number,
  rowIndex: number,
): RowPiece[] {
  const table = doc.nodeAt(tablePos);
  if (!table || table.type.name !== "table" || rowIndex < 0 || rowIndex >= table.childCount) {
    return [];
  }
  let rowPos = tablePos + 1;
  for (let index = 0; index < rowIndex; index += 1) rowPos += table.child(index).nodeSize;
  const row = table.child(rowIndex);
  const stamp = row.attrs[TABLE_SOURCE_ROW_ATTR];
  if (typeof stamp !== "number" || !Number.isInteger(stamp)) {
    return [{ pos: rowPos, node: row }];
  }
  const pieces: RowPiece[] = [];
  for (const fragment of logicalTableFragmentsAt(doc, tablePos)) {
    let pos = fragment.pos + 1;
    fragment.node.forEach((child) => {
      if (child.attrs[TABLE_SOURCE_ROW_ATTR] === stamp) pieces.push({ pos, node: child });
      pos += child.nodeSize;
    });
  }
  return pieces.length > 0 ? pieces : [{ pos: rowPos, node: row }];
}

function isSplitRowPiece(row: ProseMirrorNode): boolean {
  return row.attrs[TABLE_ROW_CONTINUES_ATTR] === true ||
    row.attrs[TABLE_ROW_CONTINUATION_ATTR] === true;
}

const ROW_PREVIEW_ATTR = "data-mrnote-row-resize-preview";
let rowPreviewSequence = 0;

/**
 * Live row height while its border is dragged. The row is ProseMirror's own
 * DOM, so writing its style would be read back as a document edit; one
 * stylesheet rule addresses it through the table element, which the table
 * NodeView owns, and a guide line marks where the border will land.
 */
class RowHeightPreview {
  private sheet: HTMLStyleElement | null = null;
  private guide: HTMLDivElement | null = null;
  private readonly token = `r${(rowPreviewSequence += 1)}`;

  constructor(
    private readonly table: HTMLTableElement,
    private readonly row: HTMLTableRowElement,
  ) {}

  show(heightPx: number, scale: number): void {
    const doc = this.table.ownerDocument;
    const body = this.row.parentElement;
    if (!body || !body.parentElement) return;
    const index = Array.prototype.indexOf.call(body.children, this.row) + 1;
    if (index < 1) return;
    this.table.setAttribute(ROW_PREVIEW_ATTR, this.token);
    this.sheet ??= doc.head.appendChild(doc.createElement("style"));
    this.sheet.textContent =
      `table[${ROW_PREVIEW_ATTR}="${this.token}"] > tbody > tr:nth-child(${index})` +
      ` { height: ${heightPx}px !important; }`;
    const rowRect = this.row.getBoundingClientRect();
    const tableRect = this.table.getBoundingClientRect();
    if (!this.guide) {
      this.guide = doc.body.appendChild(doc.createElement("div"));
      this.guide.className = borderDragStyles.guide ?? "";
      this.guide.setAttribute("aria-hidden", "true");
      this.guide.dataset.testid = "document-table-row-resize-guide";
    }
    // Only where the page shows it (visibleEditorClip.ts): the guide is on
    // the body, past the scroller's clipping.
    const line = clipToVisibleEditor(this.table, {
      left: tableRect.left, top: rowRect.top + heightPx * scale, width: tableRect.width, height: 0,
    });
    this.guide.hidden = !line;
    if (!line) return;
    this.guide.style.left = `${line.left}px`;
    this.guide.style.width = `${line.width}px`;
    this.guide.style.top = `${line.top}px`;
  }

  clear(): void {
    this.sheet?.remove();
    this.sheet = null;
    this.guide?.remove();
    this.guide = null;
    if (this.table.getAttribute(ROW_PREVIEW_ATTR) === this.token) {
      this.table.removeAttribute(ROW_PREVIEW_ATTR);
    }
  }
}

/**
 * TipTap's stock resizer mutates the table width on mouse-down, before the
 * pointer has moved. A partially specified imported grid therefore flips from
 * auto/min-width layout to a fixed pixel table on a plain click. This NodeView
 * keeps the stock hover handles but owns the actual gesture before the stock
 * bubble handler sees it. It also owns the borders the stock resizer has no
 * handle for: the table's left edge and every row border
 * (documentTableBorderDrag.ts finds them under the pointer).
 */
export class StableTableColumnResizeView extends TableView {
  private readonly editorView: EditorView | null;
  private gesture: BorderGesture | null = null;
  /** The touch pointer the next gesture starts from (beginBorderDrag). */
  private startingTouchPointer: number | null = null;
  private touchGuardCleanup: (() => void) | null = null;
  private renderedAttributeNames = new Set<string>();
  private renderedStyleNames = new Set<string>();

  constructor(
    node: ProseMirrorNode,
    cellMinWidth: number,
    view?: EditorView,
    HTMLAttributes: Record<string, unknown> = {},
  ) {
    super(node, cellMinWidth, view, HTMLAttributes);
    this.editorView = view ?? null;
    this.table.addEventListener(NATIVE_GRID_RESYNC_EVENT, this.onGridResync);
    this.syncRenderedTableAttributes(node);
    this.removeConflictingColumnStyles(node);
    syncTablePositioningProjection(this.dom, this.table, node, this.editorView);
    // The outdent first: the grid fits the table to the column from where it
    // starts, and a text-aligned table starts one cell margin before its
    // indent (R94-D19: measured from the indent, a grid as wide as its
    // newspaper column was shrunk by the 108-twip indent Word pulls back,
    // and a line that fits Word's cell by 0.2pt wrapped).
    this.syncWordTableOutdent(node);
    syncNativeGridDisplay(this.table, this.colgroup, node, this.editorView);
    this.dom.addEventListener("mousedown", this.onMouseDown, true);
    // On a touch device a finger's border drag must not scroll the page: the
    // touchmove guard has to be on the table before the finger lands.
    if (typeof window !== "undefined" && (devicePointerIsCoarse() || !deviceCanHover() || deviceHasTouch())) {
      const onTouchMove = (event: TouchEvent) => {
        if (this.gesture?.pointer && event.cancelable) event.preventDefault();
      };
      this.dom.addEventListener("touchmove", onTouchMove, { passive: false });
      this.touchGuardCleanup = () =>
        this.dom.removeEventListener("touchmove", onTouchMove);
    }
    // Whether the table is nested shows only once ProseMirror has put the
    // view into its cell, right after this constructor.
    queueMicrotask(() => {
      this.settleWordTableOutdent();
      if (this.dom.parentElement && isNestedTable(this.table)) {
        syncNativeGridDisplay(this.table, this.colgroup, this.node, this.editorView);
      }
    });
    tableResizeViews.set(this.table, this);
  }

  override update(node: ProseMirrorNode): boolean {
    // Only the decorations around or inside it changed, or an equal table came
    // from the room: what it draws stands. Writing it all again (every attribute,
    // the columns back to their stored widths until the AutoFit projection put them
    // back) restyled the table's whole subtree, for every table of the page in view,
    // on each key typed anywhere near (corpus R323-D11: 6,660 elements, 55 ms a key).
    if (node === this.node || (node.type === this.node.type && node.eq(this.node))) {
      this.node = node;
      return true;
    }
    // A collaborative/content transaction can replace this table while the
    // pointer is down. Cancel against the old DOM snapshot before rendering
    // the new node so mouse-up can never restore stale column styles or commit
    // widths measured from a superseded grid. A pagination pass that only
    // moves rows between pages keeps the grid: the drag carries on.
    const gesture = this.gesture;
    if (gesture && node !== gesture.tableNode && !this.gestureSurvives(gesture, node)) {
      this.cancelGesture();
    }
    const updated = super.update(node);
    if (updated) {
      this.syncRenderedTableAttributes(node);
      this.removeConflictingColumnStyles(node);
      syncTablePositioningProjection(this.dom, this.table, node, this.editorView);
      this.syncWordTableOutdent(node);
      syncNativeGridDisplay(this.table, this.colgroup, node, this.editorView);
    }
    const current = this.gesture;
    if (current && current.tableNode !== node) {
      if (updated) this.rebindGesture(current, node);
      else this.cancelGesture();
    }
    return updated;
  }

  /** Whether a drag can continue on `node`, the same table re-cut by pagination. */
  private gestureSurvives(gesture: BorderGesture, node: ProseMirrorNode): boolean {
    const view = this.editorView;
    if (!view || documentTableBorderDragKey.getState(view.state) !== true) return false;
    if (node.type !== gesture.tableNode.type) return false;
    if (gesture.kind === "row") return true;
    try {
      return TableMap.get(node).width === gesture.map.width;
    } catch {
      return false;
    }
  }

  private rebindGesture(gesture: BorderGesture, node: ProseMirrorNode): void {
    if (gesture.kind === "row") {
      if (!gesture.row.isConnected || !this.table.contains(gesture.row)) {
        this.cancelGesture();
        return;
      }
      gesture.tableNode = node;
      if (gesture.height !== null) {
        gesture.preview.show(
          Math.max(MIN_ROW_HEIGHT_PX, gesture.height - gesture.otherPiecesHeight),
          gesture.scale,
        );
      }
      return;
    }
    gesture.tableNode = node;
    gesture.map = TableMap.get(node);
    // The update rendered the new node's own geometry: that is what a cancel
    // restores now, and the preview goes back on top of it.
    gesture.styles = snapshotInlineStyles(this.table, this.colgroup);
    if (gesture.previewWidths) {
      previewColumnWidths(this.table, this.colgroup, gesture.previewWidths);
      if (gesture.indentPx !== null) {
        this.table.style.marginLeft = `${gesture.marginLeftPx + gesture.previewIndentDeltaPx}px`;
      }
    }
  }

  /** The AutoFit pass took back a width it had grown the table to. */
  private readonly onGridResync = () => {
    if (tableResizeViews.get(this.table) !== this) return;
    syncNativeGridDisplay(this.table, this.colgroup, this.node, this.editorView);
  };

  destroy(): void {
    this.table.removeEventListener(NATIVE_GRID_RESYNC_EVENT, this.onGridResync);
    this.cancelGesture();
    this.dom.removeEventListener("mousedown", this.onMouseDown, true);
    this.touchGuardCleanup?.();
    if (tableResizeViews.get(this.table) === this) tableResizeViews.delete(this.table);
  }

  /** Whether a border drag is in progress on this table. */
  get isDraggingBorder(): boolean {
    return this.gesture !== null;
  }

  /** A floating table is placed by its anchor, not by its left edge. */
  canDragLeftEdge(): boolean {
    return normalizeTablePositioning(this.node.attrs.tablePositioning) === null;
  }

  /**
   * Start dragging `target` from `event` (a primary-button mousedown).
   * Returns false, leaving the event alone, when the table is not the node
   * at `target.tablePos` or the editor is not editable.
   */
  beginBorderDrag(event: MouseEvent, target: DocumentTableBorderTarget): boolean {
    if (event.button !== 0 || this.gesture) return false;
    this.startingTouchPointer =
      event.type === "pointerdown" && isTouchLikePointer(event as PointerEvent)
        ? (event as PointerEvent).pointerId
        : null;
    try {
      return this.beginBorderDragFrom(event, target);
    } finally {
      this.startingTouchPointer = null;
    }
  }

  private beginBorderDragFrom(event: MouseEvent, target: DocumentTableBorderTarget): boolean {
    const view = this.editorView;
    if (!view?.editable) return false;
    if (view.state.doc.nodeAt(target.tablePos) !== this.node) return false;
    if (target.kind === "row") {
      return this.startRowGesture(event, target.rowIndex, target.tablePos);
    }
    if (target.kind === "leftEdge" && !this.canDragLeftEdge()) return false;
    let map: TableMap;
    try {
      map = TableMap.get(this.node);
    } catch {
      return false;
    }
    const column = target.kind === "leftEdge" ? 0 : target.column;
    if (!Number.isInteger(column) || column < 0 || column >= map.width) return false;
    return this.startColumnGesture(
      event,
      { column, map, tableNode: this.node, tableStart: target.tablePos + 1 },
      target.kind === "leftEdge" ? "leftEdge" : "column",
    );
  }

  /** Word 2010 compatibility: the first column starts one cell margin
   * before the table's indent, so its text lines up with the paragraphs. */
  private syncWordTableOutdent(node: ProseMirrorNode): void {
    const margin = wordTableDisplayMarginLeftPx(node, this.table);
    if (margin !== null) {
      this.table.style.marginLeft = `${margin}px`;
      this.table.dataset.wordTableOutdent = "true";
      return;
    }
    if (this.table.dataset.wordTableOutdent !== "true") return;
    delete this.table.dataset.wordTableOutdent;
    if (!this.renderedStyleNames.has("margin-left")) {
      this.table.style.removeProperty("margin-left");
    }
  }

  /** The outdent again once the table's rows are drawn in the page. The
   * constructor measures before ProseMirror renders the rows (and while the
   * table may be outside the document), so the first cell's border was not
   * there: the table started half that border to the right until a later
   * transaction updated it, and a table on the last pages laid out was
   * sometimes never updated -- a print drew it half a pixel off, run to run. */
  private settleWordTableOutdent(frames = 0): void {
    if (tableResizeViews.get(this.table) !== this) return;
    if (!this.table.isConnected) {
      if (frames < 120 && typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => this.settleWordTableOutdent(frames + 1));
      }
      return;
    }
    const before = this.table.style.marginLeft;
    this.syncWordTableOutdent(this.node);
    if (this.table.style.marginLeft !== before) {
      // The grid fits the column from where the table starts.
      syncNativeGridDisplay(this.table, this.colgroup, this.node, this.editorView);
    }
  }

  private syncRenderedTableAttributes(node: ProseMirrorNode): void {
    // The stock resizer constructs its NodeView without HTMLAttributes.
    // Reuse the schema's validated serializer so identity, table formatting
    // and data attributes stay identical to ordinary/readonly rendering.
    const spec = node.type.spec.toDOM?.(node);
    const attrs = Array.isArray(spec) && spec[0] === "table" && spec[1]
      && typeof spec[1] === "object" && !Array.isArray(spec[1])
      ? spec[1] as Record<string, unknown> : {};
    const nextNames = new Set<string>();
    for (const [name, value] of Object.entries(attrs)) {
      if (name === "style" || value === null || value === undefined) continue;
      this.table.setAttribute(name, String(value));
      nextNames.add(name);
    }
    for (const name of this.renderedAttributeNames) {
      if (!nextNames.has(name)) this.table.removeAttribute(name);
    }
    this.renderedAttributeNames = nextNames;
    const style = this.table.ownerDocument.createElement("span").style;
    if (typeof attrs.style === "string") style.cssText = attrs.style;
    const nextStyles = new Set<string>();
    for (let index = 0; index < style.length; index += 1) {
      const name = style.item(index);
      // Column geometry is owned by TableView and the native display fit.
      if (name === "width" || name === "min-width" || name === "max-width") continue;
      this.table.style.setProperty(name, style.getPropertyValue(name), style.getPropertyPriority(name));
      nextStyles.add(name);
    }
    for (const name of this.renderedStyleNames) {
      if (!nextStyles.has(name)) this.table.style.removeProperty(name);
    }
    this.renderedStyleNames = nextStyles;
  }

  private removeConflictingColumnStyles(node: ProseMirrorNode): void {
    const row = node.firstChild;
    if (!row) return;
    const columns = Array.from(this.colgroup.children);
    let column = 0;
    row.forEach((cell) => {
      const span = Math.max(1, Number(cell.attrs.colspan) || 1);
      const colwidth = Array.isArray(cell.attrs.colwidth)
        ? cell.attrs.colwidth
        : null;
      for (let index = 0; index < span; index += 1, column += 1) {
        const col = columns[column] as HTMLTableColElement | undefined;
        if (!col) continue;
        if (positiveWidth(colwidth?.[index]) !== null) {
          col.style.removeProperty("min-width");
        } else {
          col.style.removeProperty("width");
        }
      }
    });
  }

  private resolveResizeContext(): LegacyResizeContext | null {
    const view = this.editorView;
    if (!view?.editable) return null;
    const pluginState = columnResizingPluginKey.getState(view.state);
    const activeHandle = pluginState?.activeHandle ?? -1;
    if (activeHandle < 0) return null;
    const $cell = view.state.doc.resolve(activeHandle);
    const cell = $cell.nodeAfter;
    if (
      !cell ||
      (cell.type.name !== "tableCell" && cell.type.name !== "tableHeader")
    ) {
      return null;
    }
    const tableNode = $cell.node(-1);
    if (tableNode !== this.node || tableNode.type.name !== "table") return null;
    const tableStart = $cell.start(-1);
    const map = TableMap.get(tableNode);
    const column =
      map.colCount($cell.pos - tableStart) +
      Math.max(1, Number(cell.attrs.colspan) || 1) -
      1;
    return { activeHandle, column, map, tableNode, tableStart };
  }

  private isResizeHotspot(
    event: MouseEvent,
    context: LegacyResizeContext,
  ): boolean {
    const target = event.target;
    const targetElement = target instanceof Element ? target : null;
    const directHandle = targetElement?.closest(".column-resize-handle");
    if (directHandle && this.dom.contains(directHandle)) return true;

    const view = this.editorView;
    const cellDom = view?.nodeDOM(context.activeHandle);
    const cellElement = cellDom instanceof Element ? cellDom : null;
    const cell = cellElement?.matches("td, th")
      ? cellElement
      : cellElement?.closest("td, th");
    if (!cell || !this.dom.contains(cell)) return false;
    const cellRect = cell.getBoundingClientRect();
    const tableRect = this.table.getBoundingClientRect();
    return (
      cellRect.width > 0 &&
      event.clientY >= tableRect.top &&
      event.clientY <= tableRect.bottom &&
      Math.abs(event.clientX - cellRect.right) <=
        DOCUMENT_TABLE_RESIZE_HIT_WIDTH_PX
    );
  }

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0 || this.gesture) return;
    const view = this.editorView;
    if (!view?.editable) return;
    const pluginState = columnResizingPluginKey.getState(view.state);
    if (!pluginState || pluginState.activeHandle < 0) return;
    const context = this.resolveResizeContext();
    if (!context || !this.isResizeHotspot(event, context)) {
      // The stock plugin starts a resize on ANY mousedown while its handle is
      // active, even if the pointer has since left the 6px edge hotspot. Clear
      // that stale handle before the event bubbles so an ordinary cell click
      // remains an ordinary selection click.
      view.dispatch(
        view.state.tr.setMeta(columnResizingPluginKey, { setHandle: -1 }),
      );
      return;
    }
    this.startColumnGesture(event, context, "column");
  };

  private attachGesture(gesture: BorderGesture): void {
    // The mouse-down is consumed, so the editor would not take focus the way
    // a click does; Undo right after the drag must reach this editor.
    if (this.editorView && !this.editorView.hasFocus()) this.editorView.focus();
    // Keep drag ownership local to this NodeView. A ProseMirror transaction can
    // replace the table mid-gesture; leaving `setDragging` in plugin state then
    // strands the global resizer. Window-capture listeners suppress the stock
    // hover handler without creating that teardown liability.
    const touchPointer = this.startingTouchPointer;
    if (touchPointer !== null) {
      // A finger: the same move / up handlers through pointer events, for
      // this pointer only; a pointercancel rolls the drag back.
      gesture.pointer = {
        id: touchPointer,
        onMove: (event) => {
          if (event.pointerId === touchPointer) gesture.onMouseMove(event);
        },
        onUp: (event) => {
          if (event.pointerId === touchPointer) gesture.onMouseUp(event);
        },
        onCancel: (event) => {
          if (event.pointerId === touchPointer && this.gesture === gesture) {
            this.cancelGesture();
          }
        },
      };
      yieldTouchHold(touchPointer);
      gesture.ownerWindow.addEventListener("pointermove", gesture.pointer.onMove, true);
      gesture.ownerWindow.addEventListener("pointerup", gesture.pointer.onUp, true);
      gesture.ownerWindow.addEventListener("pointercancel", gesture.pointer.onCancel, true);
    } else {
      gesture.ownerWindow.addEventListener("mousemove", gesture.onMouseMove, true);
      gesture.ownerWindow.addEventListener("mouseup", gesture.onMouseUp, true);
    }
    gesture.ownerWindow.addEventListener("keydown", gesture.onKeyDown, true);
    const cursor = gesture.kind === "row" ? borderDragStyles.dragRow : borderDragStyles.dragColumn;
    if (cursor) gesture.ownerWindow.document.documentElement.classList.add(cursor);
  }

  private startColumnGesture(
    event: MouseEvent,
    context: ResizeContext,
    kind: "column" | "leftEdge",
  ): boolean {
    const view = this.editorView;
    if (!view?.editable || this.gesture) return false;
    const ownerWindow = this.dom.ownerDocument.defaultView;
    if (!ownerWindow) return false;

    const startWidths = measuredColumnWidths(
      view,
      context.tableNode,
      context.tableStart,
      context.map,
      this.table,
      this.colgroup,
      this.cellMinWidth,
    );
    if (startWidths.length !== context.map.width) return false;

    const nativeWidths = this.table.dataset.nativeGridDisplay === "true"
      ? nativeTableGridWidths(context.tableNode) : null;
    const measuredGrid = Array.from(this.colgroup.children).map(column => elementWidth(column));
    const measuredTotal = measuredGrid.length === context.map.width && measuredGrid.every((width): width is number => width !== null)
      ? measuredGrid.reduce((sum, width) => sum + width, 0) : 0;
    const nativeTotal = nativeWidths?.reduce((sum, width) => sum + width, 0) ?? 0;
    const nativeDisplayScale = measuredTotal > 0 && nativeTotal > 0 ? measuredTotal / nativeTotal : 1;

    const leftAligned = kind === "leftEdge" &&
      normalizeTableAlign(context.tableNode.attrs.tableAlign) === null;
    const gesture: ColumnGesture = {
      column: context.column,
      map: context.map,
      tableNode: context.tableNode,
      tableStart: context.tableStart,
      kind,
      doc: view.state.doc,
      ownerWindow,
      startX: event.clientX,
      startWidths,
      nativeWidths,
      nativeDisplayScale,
      styles: snapshotInlineStyles(this.table, this.colgroup),
      indentPx: leftAligned
        ? normalizeTableIndentPx(context.tableNode.attrs.tableIndentPx) ?? 0
        : null,
      marginLeftPx: leftAligned
        ? Number.parseFloat(ownerWindow.getComputedStyle(this.table).marginLeft) || 0
        : 0,
      moved: false,
      previewWidths: null,
      previewIndentDeltaPx: 0,
      onMouseMove: () => undefined,
      onMouseUp: () => undefined,
      onKeyDown: () => undefined,
    };
    gesture.onMouseMove = (moveEvent) => this.onColumnGestureMove(gesture, moveEvent);
    gesture.onMouseUp = (upEvent) => this.finishColumnGesture(gesture, upEvent);
    gesture.onKeyDown = (keyEvent) => this.onGestureKeyDown(gesture, keyEvent);
    this.gesture = gesture;
    this.attachGesture(gesture);
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  }

  /** Display widths (and indent movement) for the pointer at `event`. */
  private columnPlan(
    gesture: ColumnGesture,
    event: MouseEvent,
  ): { widths: number[]; indentDeltaPx: number } {
    const delta = event.clientX - gesture.startX;
    if (gesture.kind === "leftEdge") {
      return planTableLeftEdgeDrag(gesture.startWidths, delta, this.cellMinWidth, {
        indentPx: gesture.indentPx,
        maxIndentPx: MAX_TABLE_INDENT_PX,
      });
    }
    return {
      widths: planTableColumnBorderDrag(
        gesture.startWidths,
        gesture.column,
        delta,
        this.cellMinWidth,
        tableColumnDragMode(event),
      ),
      indentDeltaPx: 0,
    };
  }

  private onColumnGestureMove(gesture: ColumnGesture, event: MouseEvent): void {
    if (this.gesture !== gesture) return;
    if (!this.editorView?.editable) {
      this.cancelGesture();
      return;
    }
    const delta = event.clientX - gesture.startX;
    if (gesture.moved || Math.abs(delta) >= RESIZE_DRAG_THRESHOLD_PX) {
      gesture.moved = true;
      const plan = this.columnPlan(gesture, event);
      gesture.previewWidths = plan.widths;
      gesture.previewIndentDeltaPx = plan.indentDeltaPx;
      previewColumnWidths(this.table, this.colgroup, plan.widths);
      if (gesture.indentPx !== null) {
        this.table.style.marginLeft = `${gesture.marginLeftPx + plan.indentDeltaPx}px`;
      }
    }
    event.preventDefault();
    event.stopPropagation();
  }

  private finishColumnGesture(gesture: ColumnGesture, event: MouseEvent): void {
    if (this.gesture !== gesture) return;
    if (!this.editorView?.editable) {
      this.cancelGesture();
      return;
    }
    const delta = event.clientX - gesture.startX;
    const plan = gesture.moved && Math.abs(delta) >= RESIZE_DRAG_THRESHOLD_PX
      ? this.columnPlan(gesture, event)
      : null;
    gesture.previewWidths = plan?.widths ?? null;
    this.detachGesture(gesture);
    restoreInlineStyles(this.table, this.colgroup, gesture.styles);
    event.preventDefault();
    event.stopPropagation();

    const view = this.editorView;
    if (
      !view ||
      !plan ||
      (sameWidths(gesture.startWidths, plan.widths) && plan.indentDeltaPx === 0)
    ) {
      return;
    }
    // A fitted DOM is a local projection. Start the persisted resize from
    // original native widths and convert only pointer movement into that
    // coordinate space; never save measured/rounded widths of untouched cols.
    let committedWidths = plan.widths;
    const native = gesture.nativeWidths;
    if (native) {
      const scale = gesture.nativeDisplayScale;
      if (gesture.kind === "leftEdge") {
        const widths = [...native];
        const first = widths[0] ?? this.cellMinWidth;
        const change = (plan.widths[0]! - gesture.startWidths[0]!) / scale;
        widths[0] = Math.max(
          Math.min(this.cellMinWidth, first),
          Math.round((first + change) * 15) / 15,
        );
        committedWidths = widths;
      } else {
        committedWidths = planTableColumnBorderDrag(
          native,
          gesture.column,
          delta / scale,
          this.cellMinWidth,
          tableColumnDragMode(event),
          TWIP_PX,
        );
      }
    }
    this.commitColumnWidths(view, gesture, committedWidths, plan.indentDeltaPx);
  }

  /**
   * One Undo step that gives every page fragment of the logical table the
   * new grid. A table that keeps imported twips keeps them for every column
   * (export writes them as `w:gridCol`), so no column is left without one.
   */
  private commitColumnWidths(
    view: EditorView,
    gesture: ColumnGesture,
    widths: readonly number[],
    indentDeltaPx: number,
  ): void {
    const doc = view.state.doc;
    const tablePos = locateNode(doc, gesture.tableNode, gesture.tableStart - 1);
    if (tablePos === null) return;
    const fragments = logicalTableFragmentsAt(doc, tablePos);
    const twipsCustody = gesture.nativeWidths !== null &&
      fragments.some((fragment) => tableCarriesColumnTwips(fragment.node));
    let tr = closeHistory(view.state.tr);
    for (const fragment of fragments) {
      let map: TableMap;
      try {
        map = TableMap.get(fragment.node);
      } catch {
        continue;
      }
      if (map.width !== widths.length) continue;
      const fragmentStart = fragment.pos + 1;
      for (const offset of new Set(map.map)) {
        const cell = fragment.node.nodeAt(offset);
        if (!cell) continue;
        const firstGridIndex = map.map.indexOf(offset);
        if (firstGridIndex < 0) continue;
        const firstColumn = firstGridIndex % map.width;
        const span = Math.max(1, Number(cell.attrs.colspan) || 1);
        const slice = widths.slice(firstColumn, firstColumn + span);
        if (slice.length !== span) continue;
        let attrs: Record<string, unknown>;
        if (twipsCustody) {
          const twips = slice.map((width) => Math.max(1, Math.round(width * 15)));
          const pixels = twips.map((value) => value / 15);
          if (sameWidths(cell.attrs.colwidth, pixels) && sameWidths(cell.attrs.colwidthTwips, twips)) {
            continue;
          }
          attrs = { ...cell.attrs, colwidth: pixels, colwidthTwips: twips };
        } else {
          if (sameWidths(cell.attrs.colwidth, slice)) continue;
          attrs = preserveMatchingNativeWidths({ ...cell.attrs, colwidth: slice }, slice);
        }
        tr = tr.setNodeMarkup(fragmentStart + offset, undefined, attrs);
      }
    }
    if (indentDeltaPx !== 0 && gesture.indentPx !== null) {
      const indent = movedTableIndentAttrs(gesture.tableNode.attrs, indentDeltaPx);
      for (const fragment of fragments) {
        const current = tr.doc.nodeAt(fragment.pos);
        if (!current || current.type.name !== "table") continue;
        tr = tr.setNodeMarkup(fragment.pos, undefined, { ...current.attrs, ...indent }, current.marks);
      }
    }
    // Dragging a border in a Word content-fit table gives its columns the
    // dragged widths: from now on the table keeps them (the editor's
    // explicit-width geometry) instead of sizing itself to its content.
    if (tr.docChanged && gesture.tableNode.attrs.tableLayoutPolicy == null &&
        readWordTableLayout(gesture.tableNode.attrs)?.contentFit) {
      const fragmentId = gesture.tableNode.attrs[TABLE_FRAGMENT_ID_ATTR];
      tr.doc.descendants((node, pos) => {
        if (node.type.name !== "table") return true;
        const sameTable = pos === tablePos ||
          (typeof fragmentId === "string" && fragmentId !== "" &&
            node.attrs[TABLE_FRAGMENT_ID_ATTR] === fragmentId);
        const source = node.attrs.source as Record<string, unknown> | null;
        const layout = readWordTableLayout(node.attrs);
        if (sameTable && source && layout) {
          tr = tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            source: {
              ...source,
              wordTableLayout: {
                schemaVersion: 1,
                contentFit: null,
                contentFitPct: null,
                textAligned: layout.textAligned,
                // Where the table stands is not what a column drag changes.
                ...(layout.indentUnstated ? { indentUnstated: true } : {}),
              },
            },
          });
        }
        return false;
      });
    }
    if (tr.docChanged) view.dispatch(tr);
  }

  private startRowGesture(event: MouseEvent, rowIndex: number, tablePos: number): boolean {
    const view = this.editorView;
    if (!view?.editable || this.gesture) return false;
    const ownerWindow = this.dom.ownerDocument.defaultView;
    if (!ownerWindow) return false;
    const tableNode = this.node;
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= tableNode.childCount) return false;
    const rowNode = tableNode.child(rowIndex);
    // The bottom of a row's first half is the page break, not a row border.
    if (rowNode.attrs[TABLE_ROW_CONTINUES_ATTR] === true) return false;
    let rowPos = tablePos + 1;
    for (let index = 0; index < rowIndex; index += 1) rowPos += tableNode.child(index).nodeSize;
    const row = view.nodeDOM(rowPos);
    if (!(row instanceof HTMLTableRowElement) || !this.table.contains(row)) return false;
    const rect = row.getBoundingClientRect();
    if (!(rect.height > 0)) return false;
    const layoutHeight = row.offsetHeight > 0 ? row.offsetHeight : rect.height;
    const scale = rect.height / layoutHeight;
    let otherPiecesHeight = 0;
    if (isSplitRowPiece(rowNode)) {
      for (const piece of logicalRowPieces(view.state.doc, tablePos, rowIndex)) {
        if (piece.pos === rowPos || !isSplitRowPiece(piece.node)) continue;
        const pieceDom = view.nodeDOM(piece.pos);
        if (pieceDom instanceof HTMLElement) otherPiecesHeight += pieceDom.offsetHeight;
      }
    }
    const gesture: RowGesture = {
      kind: "row",
      doc: view.state.doc,
      tableNode,
      tablePos,
      rowIndex,
      row,
      ownerWindow,
      startY: event.clientY,
      startHeight: layoutHeight + otherPiecesHeight,
      otherPiecesHeight,
      scale,
      rule: tableRowHeightDragRule(rowNode.attrs.rowHeightRule),
      preview: new RowHeightPreview(this.table, row),
      moved: false,
      height: null,
      onMouseMove: () => undefined,
      onMouseUp: () => undefined,
      onKeyDown: () => undefined,
    };
    gesture.onMouseMove = (moveEvent) => this.onRowGestureMove(gesture, moveEvent);
    gesture.onMouseUp = (upEvent) => this.finishRowGesture(gesture, upEvent);
    gesture.onKeyDown = (keyEvent) => this.onGestureKeyDown(gesture, keyEvent);
    this.gesture = gesture;
    this.attachGesture(gesture);
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  }

  private rowHeightAt(gesture: RowGesture, event: MouseEvent): number {
    return planTableRowHeightDrag(
      gesture.startHeight,
      event.clientY - gesture.startY,
      { min: MIN_ROW_HEIGHT_PX, max: MAX_ROW_HEIGHT_PX },
      gesture.scale,
    );
  }

  private onRowGestureMove(gesture: RowGesture, event: MouseEvent): void {
    if (this.gesture !== gesture) return;
    if (!this.editorView?.editable) {
      this.cancelGesture();
      return;
    }
    const delta = event.clientY - gesture.startY;
    if (gesture.moved || Math.abs(delta) >= RESIZE_DRAG_THRESHOLD_PX) {
      gesture.moved = true;
      gesture.height = this.rowHeightAt(gesture, event);
      gesture.preview.show(
        Math.max(MIN_ROW_HEIGHT_PX, gesture.height - gesture.otherPiecesHeight),
        gesture.scale,
      );
    }
    event.preventDefault();
    event.stopPropagation();
  }

  private finishRowGesture(gesture: RowGesture, event: MouseEvent): void {
    if (this.gesture !== gesture) return;
    if (!this.editorView?.editable) {
      this.cancelGesture();
      return;
    }
    const delta = event.clientY - gesture.startY;
    const height = gesture.moved && Math.abs(delta) >= RESIZE_DRAG_THRESHOLD_PX
      ? this.rowHeightAt(gesture, event)
      : null;
    this.detachGesture(gesture);
    gesture.preview.clear();
    event.preventDefault();
    event.stopPropagation();
    const view = this.editorView;
    if (!view || height === null) return;
    const doc = view.state.doc;
    const tablePos = locateNode(doc, gesture.tableNode, gesture.tablePos);
    if (tablePos === null) return;
    // Pagination may have moved rows above this one to another page.
    const renderedRows = this.table.tBodies[0] ? Array.from(this.table.tBodies[0].rows) : [];
    const renderedIndex = renderedRows.indexOf(gesture.row);
    const rowIndex = renderedIndex >= 0 ? renderedIndex : gesture.rowIndex;
    let tr = closeHistory(view.state.tr);
    for (const piece of logicalRowPieces(doc, tablePos, rowIndex)) {
      const attrs = piece.node.attrs;
      if (
        normalizeTableRowHeight(attrs.rowHeight) === height &&
        (normalizeTableRowHeightRule(attrs.rowHeightRule) ?? "atLeast") === gesture.rule
      ) {
        continue;
      }
      // A dragged height is a new measurement: the imported exact twips
      // companion no longer describes it, and export derives w:trHeight
      // from the pixel height and the rule.
      tr = tr.setNodeMarkup(piece.pos, undefined, {
        ...attrs,
        rowHeight: height,
        rowHeightRule: gesture.rule,
        rowHeightTwips: null,
      }, piece.node.marks);
    }
    if (tr.docChanged) view.dispatch(tr);
  }

  private onGestureKeyDown(gesture: BorderGesture, event: KeyboardEvent): void {
    if (this.gesture !== gesture || event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    this.cancelGesture();
  }

  private detachGesture(gesture: BorderGesture): void {
    gesture.ownerWindow.removeEventListener(
      "mousemove",
      gesture.onMouseMove,
      true,
    );
    gesture.ownerWindow.removeEventListener("mouseup", gesture.onMouseUp, true);
    if (gesture.pointer) {
      gesture.ownerWindow.removeEventListener("pointermove", gesture.pointer.onMove, true);
      gesture.ownerWindow.removeEventListener("pointerup", gesture.pointer.onUp, true);
      gesture.ownerWindow.removeEventListener("pointercancel", gesture.pointer.onCancel, true);
    }
    gesture.ownerWindow.removeEventListener("keydown", gesture.onKeyDown, true);
    const cursor = gesture.kind === "row" ? borderDragStyles.dragRow : borderDragStyles.dragColumn;
    if (cursor) gesture.ownerWindow.document.documentElement.classList.remove(cursor);
    if (this.gesture === gesture) this.gesture = null;
  }

  private cancelGesture(): void {
    const gesture = this.gesture;
    if (!gesture) return;
    this.detachGesture(gesture);
    if (gesture.kind === "row") gesture.preview.clear();
    else restoreInlineStyles(this.table, this.colgroup, gesture.styles);
  }
}
