/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Structural pages V3.2 — the rebalancer plugin.
 *
 * After any change to a sheeted document (and on mount / font loads /
 * width changes), measure block heights per sheet, compute the stable
 * distribution with the pure core, and apply whole-block moves in one
 * transaction. Continuation cuts then settle in bounded measured passes.
 * All capacities, client-rect measurements and cut/merge thresholds use
 * document CSS pixels, independent of workbench zoom.
 *
 * Measurement model:
 * - Sheets are position:relative, so a block's offsetTop is sheet-local.
 * - Normal single-column height_i uses normalized fractional border-box
 *   top differences, capturing margins INCLUDING collapse. Complex layouts
 *   retain offsets; the last block uses its border-box height, which
 *   discards its bottom margin — exactly Word's page-edge margin
 *   suppression semantics.
 * - Capacity = page height (surface --page-height-px) minus the sheet's
 *   vertical padding. A keep-lines request is honoured while the block can
 *   fit on one physical page; a block taller than the full page is split as
 *   an emergency continuation because the page boundary is the hard format
 *   invariant.
 *
 * The rebalance transaction carries REBALANCE_META and addToHistory:false:
 * undo restores the USER's content change, and the rebalancer re-settles
 * the pages on its own — pagination is derived structure, never history.
 */

import { paragraphKeepFlag } from "../paragraphPagination";
import { Fragment } from "@tiptap/pm/model";
import { joinPieces } from "./pieceJoin";
import { TextSelection } from "@tiptap/pm/state";
import { TableMap } from "@tiptap/pm/tables";
import type { EditorView } from "@tiptap/pm/view";
import type { Node as PmNode, NodeType } from "@tiptap/pm/model";

import { isForcedBreakBlock, isForcedBreakBlockIn, PAGE_BLOCK_NODE } from "./pageBlockExtension";
import { clearPageEdgeMarks, PAGE_OVERSIZE_ATTR, SPLIT_PIECE_OF_ATTR, splitPieceRoot } from "./paginationProjectionKeys";
import { measureSheetBodyExtent } from "./pageSpanExtension";
import { sheetTrailingAutoLeadingCreditPx } from "./pageEdgeLeading";
import { reconcileTableNodeIdentities } from './tableNodeIdentity';
import { LINE_GRID_FIT_TOLERANCE_PX } from "./pageRebalance";
import { marginCollapseChain } from "./marginCollapse";
import { withRootMeasurementSlot } from "./renderedTextHead";
import { measureOfficeFontLineBox } from "../../../../office-ribbon/officeFontLineBox";
import {
  NOTE_LIST_NODE,
  NOTE_SLICE_END_ATTR,
  NOTE_SLICE_END_OFFSET_ATTR,
  NOTE_SLICE_START_ATTR,
  NOTE_SLICE_START_OFFSET_ATTR,
  SPLIT_CONTINUATION_ATTR,
  SPLIT_CONTINUES_ATTR,
  headTextLength,
  isContinuationTail,
  isSplittableBlock,
  isTextSplitCapableTypeName,
  isTextSplittableBlock,
  type NoteSliceCursor,
  insideInlineAtom,
  measureTextLineBoxes,
  minimumTextSplitLines,
  planTextCutByChars,
} from "./blockSplitting";
import {
  TABLE_BLOCK_CONTINUATION_ATTR,
  TABLE_CELL_EMPTY_HEAD_ATTR,
  TABLE_CELL_EMPTY_TAIL_ATTR,
  TABLE_CONTINUATION_ATTR,
  TABLE_CONTINUES_ATTR,
  MIN_TABLE_ROW_SLICE_PX,
  TABLE_FRAGMENT_ID_ATTR,
  TABLE_REPEATED_HEADER_ATTR,
  TABLE_SOURCE_CELL_COL_ATTR,
  TABLE_SOURCE_ROW_ATTR,
  originalTableHeaderMayStandAlone,
  fragmentTableAtRowBoundary,
  fragmentTableWithinRow,
  leadingTableHeaderRowCount,
  mergeAdjacentTableFragmentsJson,
  planTablePageCut,
  tableWithinRowCutMakesProgress,
  type TableCellListCut,
  type TableCellTextCut,
  type TableFragmentPair,
  type TableJsonNode,
  type TablePageCut,
  type TableRowMeasurement,
} from "./tablePagination";
import {
  KNOWN_FORMULA_ATTR,
  applyLazyMathPlaceholderGeometry,
  rememberFormulaBox,
  renderLazyMathNow,
  type LazyMathPlaceholderGeometry,
} from "../../extensions/lazyKatex";
import { selectionNearInlineContent } from "../safeTextSelection";
import { STRUCTURAL_COLUMN_FLOW_ATTR } from "./columnFlowDecorations";
import {
  clientRectInPaginationLayout,
  paginationLayoutRect,
  paginationLayoutScale,
  paginationTransformScale,
  type PaginationScale,
} from "./paginationGeometry";
import {
  unequalColumnCount,
  unequalColumnPlacementForBlock,
  unequalColumnProjectionForSheet,
} from "./unequalColumnProjection";
import { measurementRange } from "./measurementRange";
import { wordGridFontVerticals } from "../wordFontMetrics";

export const REBALANCE_META = "structuralRebalance";
export { STRUCTURAL_COLUMN_FLOW_ATTR } from "./columnFlowDecorations";

export const INITIAL_PAGINATION_SETTLING_ATTR =
  "data-pagination-initial-settling";
export const PAGINATION_STALLED_ATTR = "data-pagination-stalled";
export const DOCUMENT_VIEW_MODE_ATTR = "data-document-view-mode";


// Preserve the existing public import path used by bounded pagination tests.
export { sourceFontPlanIsReady } from "../documentLayoutStatus";

interface PageInfo {
  pos: number;
  node: PmNode;
}

export interface TypesetMathBodyHeightCache {
  /** Layout generation that produced every cached geometry entry. */
  layoutEpoch: number;
  /** Per-block semantic+width identities for the measured projection. */
  measurementKeys: readonly (string | null)[];
  /** Fully-typeset body heights in flattened pageBlock reading order. */
  bodyHeights: readonly number[];
  /** Only math-owning blocks are substituted; images and ordinary text stay live. */
  mathBlocks: readonly boolean[];
  /** KaTeX-equivalent boxes for each formula atom inside the owning block. */
  placeholderGeometries: readonly (
    readonly LazyMathPlaceholderGeometry[] | null
  )[];
  /** Width used for each body measurement; boundary moves can place the same
   * formula into a different section/column without changing block order. */
  contentWidths: readonly number[];
}

/**
 * The doc's top-level pages. The schema (`pageBlock+`) guarantees every
 * top-level child IS a pageBlock — stray flat blocks (and the old
 * TrailingNode click affordance) are structurally unrepresentable, so no
 * adoption pass exists anymore.
 */
export function collectPages(doc: PmNode): PageInfo[] | null {
  if (doc.childCount === 0) return null;
  // A document node never changes, and one pass asks dozens of times about
  // the same one: the same answer, not a walk of the sheets each. (Read only.)
  const known = pagesOfDocument.get(doc);
  if (known) return known;
  const pages: PageInfo[] = [];
  let pos = 0;
  for (let i = 0; i < doc.childCount; i += 1) {
    const child = doc.child(i);
    if (child.type.name === PAGE_BLOCK_NODE) pages.push({ pos, node: child });
    pos += child.nodeSize;
  }
  if (pages.length === 0) return null;
  pagesOfDocument.set(doc, pages);
  return pages;
}

const pagesOfDocument = new WeakMap<PmNode, PageInfo[]>();

/** Direct sheet children in semantic reading order, independent of boundaries. */
export function flattenStructuralSheetBlocks(
  sheets: readonly HTMLElement[],
): HTMLElement[] {
  // The block node views, without decoration widgets (a floating picture's
  // exclusion, footnote zones): the caller pairs them with the page's nodes.
  return sheets.flatMap((sheet) =>
    (Array.from(sheet.children) as HTMLElement[]).filter((child) => !child.classList.contains("ProseMirror-widget")),
  );
}

const MATH_PREVIEW_SELECTOR = ".math-block-preview,.inline-math-preview";

export function mathPreviews(block: HTMLElement): HTMLElement[] {
  return Array.from(block.querySelectorAll<HTMLElement>(MATH_PREVIEW_SELECTOR));
}

/**
 * Measure each fully-typeset formula atom, including its inline baseline
 * depth. The zero-size marker sits on the surrounding text baseline; an
 * overflow-hidden inline-block can therefore reproduce both the KaTeX box and
 * its descent while the expensive KaTeX subtree remains lazy in the live DOM.
 */
export function measureTypesetMathPlaceholderGeometries(
  block: HTMLElement,
): LazyMathPlaceholderGeometry[] {
  return measureTypesetMathPlaceholderGeometriesForBlocks([block])[0] ?? [];
}

/**
 * The typed properties an isolated inline formula copies from its place: the
 * formula's own inline box (its font's ascent, descent and line height) is
 * part of what it adds to its line.
 */
const ISOLATED_FORMULA_FONT_PROPERTIES = [
  "font-family", "font-size", "font-weight", "font-style", "font-stretch",
  "font-variant", "font-kerning", "font-feature-settings", "line-height",
  "letter-spacing", "word-spacing",
] as const;

function isolatedFormulaFont(preview: HTMLElement): string[] {
  const css = getComputedStyle(preview);
  return ISOLATED_FORMULA_FONT_PROPERTIES.map((name) => css.getPropertyValue(name));
}

/**
 * Put a copy of a typeset inline formula alone on a line whose own strut is a
 * point on the baseline (line-height 0, font-size 0). That line's box is then
 * exactly what the formula adds to a line of text: KaTeX's root inline box
 * (its math font at its own line height, which reaches past the glyphs) and
 * every inline-block of the formula. The formula's bounding rect is only its
 * own content area: a placeholder of that height made a line 1 px shorter
 * than the typeset one, so a page laid out while its formulas were still lazy
 * broke differently from the same page laid out typeset (the 296-page book,
 * page 19).
 */
function isolateInlineFormula(
  preview: HTMLElement,
  font: readonly string[],
  block: HTMLElement,
): { line: HTMLElement; baseline: HTMLElement } {
  const line = document.createElement("div");
  line.setAttribute("aria-hidden", "true");
  line.style.cssText =
    "display:block;position:static;margin:0;padding:0;border:0;line-height:0;font-size:0;white-space:nowrap;";
  const copy = preview.cloneNode(true) as HTMLElement;
  ISOLATED_FORMULA_FONT_PROPERTIES.forEach((name, index) => {
    copy.style.setProperty(name, font[index] ?? "");
  });
  copy.style.setProperty("vertical-align", "baseline");
  const baseline = document.createElement("span");
  baseline.style.cssText =
    "display:inline-block;width:0;height:0;padding:0;margin:0;border:0;vertical-align:baseline;";
  line.append(copy, baseline);
  // Beside its block, so a table or a list item around it does not size it.
  if (block.parentElement) block.after(line);
  else block.append(line);
  return { line, baseline };
}

const cloneScales = new WeakMap<Element, PaginationScale>();

/**
 * The scale a typeset clone is laid out at. The measurement host
 * (typesetCloneMeasurement) states its width inline, so its box against that
 * width is the scale, read once per host: walking every ancestor's computed
 * transform instead cost a style recalculation per clone (seconds per batch
 * on a 296-page book).
 */
function cloneLayoutScale(block: HTMLElement): PaginationScale {
  const host = block.closest<HTMLElement>(".note-editor-page-preview__measure") ?? block.parentElement;
  if (!host) return { x: 1, y: 1 };
  const known = cloneScales.get(host);
  if (known) return known;
  const width = Number.parseFloat(host.style.width);
  const box = width > 0 ? host.getBoundingClientRect().width : 0;
  const ratio = width > 0 && box > 0 ? box / width : null;
  const scale = ratio && Number.isFinite(ratio) ? { x: ratio, y: ratio } : paginationTransformScale(host) ?? { x: 1, y: 1 };
  cloneScales.set(host, scale);
  return scale;
}

/** Batch variant: all marker mutations precede every rect read. A formula
 * whose box is known already (KNOWN_FORMULA_ATTR) is not read: each block's
 * list holds the others, in order. */
export function measureTypesetMathPlaceholderGeometriesForBlocks(
  blocks: readonly HTMLElement[],
): LazyMathPlaceholderGeometry[][] {
  const previewsByBlock = blocks.map((block) => mathPreviews(block).filter((preview) => !preview.hasAttribute(KNOWN_FORMULA_ATTR)));
  const previews = previewsByBlock.flat();
  const owners = previewsByBlock.flatMap((blockPreviews, index) => blockPreviews.map(() => blocks[index]!));
  // Every style read precedes the first insertion, and every insertion the
  // first rect read: one style recalculation and one layout flush for the
  // whole batch. Alternating them per formula recalculated a 7,000-block
  // clone once per formula (minutes); alternating insert/read/remove per
  // formula caused the same O(formulas × document-layout) thrashing.
  const inline = previews.map((preview) => preview.classList.contains("inline-math-preview"));
  const fonts = previews.map((preview, index) => (inline[index] ? isolatedFormulaFont(preview) : null));
  const isolated = previews.map((preview, index) => {
    const font = fonts[index];
    return font ? isolateInlineFormula(preview, font, owners[index]!) : null;
  });
  // The scale of the layout the clone sits in, from its ancestors'
  // transforms. A clone block is in no page sheet, so the sheet-based scale
  // fell back to the formula's own box against its offsetWidth, an integer:
  // every width came out rounded (57 px for a 57.13 px formula), and a
  // placeholder a fraction narrower or wider than its formula wrapped its
  // line elsewhere.
  const previewScales = previews.map((preview, index) => {
    const owner = owners[index]!;
    if (owner.closest("article[data-page-sheet]")) return paginationLayoutScale(preview);
    return cloneLayoutScale(owner);
  });
  const previewRects = previews.map((preview, index) =>
    paginationLayoutRect(preview, previewScales[index]),
  );
  // A formula KaTeX broke over two lines has no one box: a placeholder of
  // its bounding box takes a line of its own, and the paragraph wraps
  // differently from the typeset one. Such a formula is typeset in the page
  // instead (applyTypesetMathPlaceholders).
  const wraps = previews.map((preview) => preview.classList.contains("inline-math-preview") && preview.getClientRects().length > 1);
  const lines = isolated.map((entry, index) =>
    entry
      ? {
          box: paginationLayoutRect(entry.line, previewScales[index]),
          baseline: paginationLayoutRect(entry.baseline, previewScales[index]).top,
        }
      : null,
  );
  isolated.forEach((entry) => entry?.line.remove());
  const flatGeometries = previews.map((preview, index) => {
    const kind: LazyMathPlaceholderGeometry["kind"] =
      preview.classList.contains("inline-math-preview") ? "inline" : "block";
    const rect = previewRects[index];
    const line = lines[index];
    if (kind === "inline" && line) {
      const height = Math.max(0, line.box.height);
      return {
        width: Math.max(0, rect.width),
        height,
        baselineDepth: Math.min(height, Math.max(0, line.box.bottom - line.baseline)),
        kind,
        ...(wraps[index] ? { wraps: true } : {}),
      };
    }
    return {
      width: Math.max(0, rect.width),
      height: Math.max(0, rect.height),
      baselineDepth: 0,
      kind,
    };
  });
  let offset = 0;
  return previewsByBlock.map((blockPreviews) => {
    const geometries = flatGeometries.slice(
      offset,
      offset + blockPreviews.length,
    );
    offset += blockPreviews.length;
    return geometries;
  });
}

/** Apply cached final boxes to formula atoms without hiding paragraph text. */
export function applyTypesetMathPlaceholders(
  blocks: readonly HTMLElement[],
  geometries: readonly (readonly LazyMathPlaceholderGeometry[] | null)[],
  /** The blocks' nodes: each formula node keeps its box, for a view rebuilt
   * for it later (rememberFormulaBox). */
  nodes?: readonly (PmNode | null | undefined)[] | null,
): void {
  if (blocks.length !== geometries.length) return;
  blocks.forEach((block, blockIndex) => {
    const blockGeometries = geometries[blockIndex];
    if (!blockGeometries) return;
    const previews = mathPreviews(block);
    const formulas = nodes?.[blockIndex] ? mathNodesOf(nodes[blockIndex]!) : null;
    const remember = formulas && formulas.length === previews.length ? formulas : null;
    previews.forEach((preview, formulaIndex) => {
      const geometry = blockGeometries[formulaIndex];
      if (geometry && remember) rememberFormulaBox(remember[formulaIndex]!, geometry);
      if (!preview.hasAttribute("data-math-pending")) return;
      if (geometry?.wraps) renderLazyMathNow(preview);
      else if (geometry) applyLazyMathPlaceholderGeometry(preview, geometry);
    });
  });
}

/** A block's formula nodes in document order (its previews' order). */
function mathNodesOf(block: PmNode): PmNode[] {
  const formulas: PmNode[] = [];
  if (block.type.name === "mathBlock" || block.type.name === "inlineMath") return [block];
  block.descendants((node) => {
    if (node.type.name === "mathBlock" || node.type.name === "inlineMath") {
      formulas.push(node);
      return false;
    }
    return true;
  });
  return formulas;
}

/** Harness switch (`window.__docsListKeepNextOff = true`): a list never keeps
 * with the block after it, as before (A/B). */
function listKeepNextOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsListKeepNextOff?: boolean }).__docsListKeepNextOff === true;
}

const KEEP_LIST_TYPES = new Set(["bulletList", "orderedList", "taskList"]);

/**
 * The paragraph a list ends with, down its last items: Word's list is only
 * paragraphs, and the last one's "keep with next" is the list's. A list piece
 * that goes on on the next page ends in none.
 */
function listLastParagraph(list: PmNode): PmNode | null {
  let current: PmNode | null = list;
  for (let depth = 0; current && depth < 32; depth += 1) {
    if (current.attrs?.[SPLIT_CONTINUES_ATTR] === true) return null;
    if (!KEEP_LIST_TYPES.has(current.type.name) && current.type.name !== "listItem" && current.type.name !== "taskItem") return current;
    current = current.lastChild;
  }
  return null;
}

export function keepsFollowingBlock(node: PmNode | null): boolean {
  // A numbered or bulleted run of "keep with next" paragraphs keeps with what
  // follows like any other: corpus R484-D90 (Qualtrics), a question and its
  // 90 kept answer lines open page 2 together in Word, ours broke the chain
  // at the list and left the question on page 1; R485-D51, every paragraph
  // kept, a numbered item cut the chain and the six paragraphs after it went
  // with the table to page 5 (Word leaves them, the chain from page 1 being
  // longer than a page).
  if (node !== null && KEEP_LIST_TYPES.has(node.type.name) && !listKeepNextOff()) {
    const last = listLastParagraph(node);
    return last !== null && keepsFollowingBlock(last);
  }
  return node !== null && paragraphKeepFlag(node, "keepNext") &&
    node.attrs[SPLIT_CONTINUES_ATTR] !== true && !isForcedBreakBlock(node);
}

/**
 * Whether a table travels with what follows it: Word keeps a row with the
 * next when its first cell's paragraph keeps with the next, its other cells
 * not counted, and a table every row of which does so goes with the next
 * block (Word 16.86, probes t-tk2: all rows, or only each row's first cell,
 * took the table to the heading's page; every cell but the first left it).
 * Rows kept only at the table's end take those rows alone, which the row
 * planner does (TableRowMeasurement.keepWithNext). Corpus R279-D19: a table
 * whose cells all keep with the next, then a kept heading and a two-line
 * paragraph; Word starts page 3 with the table, ours left it on page 2.
 */
export function tableKeepsFollowingBlock(table: PmNode | null): boolean {
  if (!table || table.type.name !== "table" || table.childCount === 0) return false;
  let every = true;
  table.forEach((row) => {
    if (!every || row.attrs?.[TABLE_REPEATED_HEADER_ATTR] === true) return;
    const first = row.firstChild?.firstChild ?? null;
    if (!first || !paragraphKeepFlag(first, "keepNext")) every = false;
  });
  return every;
}

/** The sheet's CSS multi-column count (in-sheet 分栏), 1 when not columned. */
export function sheetColumnCount(sheet: HTMLElement): number {
  const unequalCount = unequalColumnCount(sheet);
  if (unequalCount !== null && unequalCount > 1) return unequalCount;
  const raw = getComputedStyle(sheet).columnCount;
  const count = Number.parseInt(raw, 10);
  return Number.isFinite(count) && count > 1 ? count : 1;
}

/**
 * Stamp the runtime-only selector that turns a CSS multicol article into one
 * fixed-height Word/WPS page. `column-fill:auto` can then fill column 1 before
 * column 2; excess content creates an observable horizontal column instead of
 * silently balancing a taller paper box. The attribute never enters PM/JSON.
 */
export function syncStructuralColumnFlow(sheet: HTMLElement): number {
  const count = sheetColumnCount(sheet);
  if (count > 1) {
    if (sheet.getAttribute(STRUCTURAL_COLUMN_FLOW_ATTR) !== "true") {
      sheet.setAttribute(STRUCTURAL_COLUMN_FLOW_ATTR, "true");
    }
  } else if (sheet.hasAttribute(STRUCTURAL_COLUMN_FLOW_ATTR)) {
    sheet.removeAttribute(STRUCTURAL_COLUMN_FLOW_ATTR);
  }
  return count;
}

export function sheetContentCapacity(
  sheet: HTMLElement,
  fallbackPageHeight = 1056,
): number {
  const style = getComputedStyle(sheet);
  const padding =
    (Number.parseFloat(style.paddingTop) || 0) +
    (Number.parseFloat(style.paddingBottom) || 0);
  const sheetHeight = Number.parseFloat(style.minHeight);
  const height =
    Number.isFinite(sheetHeight) && sheetHeight > 0
      ? sheetHeight
      : fallbackPageHeight;
  return Math.max(120, height - padding);
}

interface ColumnFlowGeometry {
  scale: PaginationScale;
  capacity: number;
  contentTop: number;
  contentLeft: number;
  contentRight: number;
  pitch: number;
  rtl: boolean;
}

interface BlockColumnFlowGeometry {
  start: number;
  end: number;
}

export function columnFlowGeometry(
  sheet: HTMLElement,
  columnCount: number,
): ColumnFlowGeometry | null {
  if (columnCount <= 1) return null;
  // Per-column placements already carry their exact logical offsets. Feeding
  // them through the equal-track pitch calculation would reintroduce the very
  // approximation this projection replaces.
  if (unequalColumnProjectionForSheet(sheet)) return null;
  const style = getComputedStyle(sheet);
  const scale = paginationLayoutScale(sheet);
  const sheetRect = paginationLayoutRect(sheet, scale);
  const paddingTop = Number.parseFloat(style.paddingTop) || 0;
  const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(style.paddingRight) || 0;
  const gapValue = Number.parseFloat(style.columnGap);
  const gap = Number.isFinite(gapValue) && gapValue > 0 ? gapValue : 0;
  const columnWidth = readColumnContentWidth(sheet);
  const capacity = sheetContentCapacity(sheet);
  if (!(columnWidth > 0) || !(capacity > 0)) return null;
  return {
    scale,
    capacity,
    contentTop: sheetRect.top + paddingTop,
    contentLeft: sheetRect.left + paddingLeft,
    contentRight: sheetRect.right - paddingRight,
    pitch: columnWidth + gap,
    rtl: style.direction === "rtl",
  };
}

export function blockColumnFlowGeometry(
  block: HTMLElement,
  geometry: ColumnFlowGeometry,
): BlockColumnFlowGeometry | null {
  const fragments = Array.from(block.getClientRects())
    .map((rect) => clientRectInPaginationLayout(rect, geometry.scale))
    .filter(
      (rect) =>
        Number.isFinite(rect.top) &&
        Number.isFinite(rect.bottom) &&
        Number.isFinite(rect.left) &&
        Number.isFinite(rect.right) &&
        (rect.height > 0 || rect.width > 0),
    );
  if (fragments.length === 0) {
    const rect = paginationLayoutRect(block, geometry.scale);
    if (
      Number.isFinite(rect.top) &&
      Number.isFinite(rect.bottom) &&
      Number.isFinite(rect.left) &&
      Number.isFinite(rect.right) &&
      (rect.height > 0 || rect.width > 0)
    ) {
      fragments.push(rect);
    }
  }
  if (fragments.length === 0) return null;

  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  for (const rect of fragments) {
    const rawColumn = geometry.rtl
      ? (geometry.contentRight - rect.right) / geometry.pitch
      : (rect.left - geometry.contentLeft) / geometry.pitch;
    // Use the fragment's leading edge, not its center: an indented/narrow
    // paragraph may begin in the latter half of column 1 and must not be
    // mistaken for column 2. The small epsilon absorbs sub-pixel track starts.
    const column = Math.max(0, Math.floor(rawColumn + 0.02));
    const columnStart = column * geometry.capacity;
    const fragmentStart =
      columnStart + Math.max(0, rect.top - geometry.contentTop);
    const fragmentEnd =
      columnStart + Math.max(0, rect.bottom - geometry.contentTop);
    start = Math.min(start, fragmentStart);
    end = Math.max(end, fragmentEnd);
  }
  return Number.isFinite(start) && Number.isFinite(end) && end >= start
    ? { start, end }
    : null;
}

/** Logical block start in a page's column flow (column × capacity + y). */
export function structuralBlockFlowOffset(
  sheet: HTMLElement,
  block: HTMLElement,
): number {
  const unequalPlacement = unequalColumnPlacementForBlock(block);
  if (unequalPlacement) return unequalPlacement.flowStartPx;
  const style = getComputedStyle(sheet);
  const scale = paginationLayoutScale(sheet);
  const contentTop =
    paginationLayoutRect(sheet, scale).top +
    (Number.parseFloat(style.paddingTop) || 0);
  const verticalOffset = Math.max(
    0,
    paginationLayoutRect(block, scale).top - contentTop,
  );
  const columnCount = sheetColumnCount(sheet);
  const geometry = columnFlowGeometry(sheet, columnCount);
  return geometry
    ? (blockColumnFlowGeometry(block, geometry)?.start ?? verticalOffset)
    : verticalOffset;
}

/** Count text-only fragments in flow order; element ranges also include
 * wrapping mark containers, which are not additional text rows. */
export interface TextGridRow {
  /** Row top in layout px, relative to the block's border-box top. */
  topPx: number;
  /** What the row costs on the grid: whole slots of `pitchPx`. */
  heightPx: number;
}

/** The painted text rows of a grid-snapped block with the grid cost of each.
 * WebKit truncates a fractional line-height to whole pixels (20.8px lines
 * paint 20px apart), so a row's painted advance is not its grid cost; every
 * consumer that reasons about rows (heights, and the page-edge cut) must use
 * the same slot accounting or they disagree by one line per 26 lines. Null
 * when the block is off the grid or carries content this walk cannot row. */
export function textLineGridRows(block: HTMLElement): { pitchPx: number; rows: TextGridRow[] } | null {
  const geometry = lineGridRowGeometry(block);
  if (geometry === null || !block.closest('[data-doc-grid="lines"]')) return null;
  const { pitchPx, factor } = geometry;
  const rows = measuredTextGridRows(block, pitchPx, factor);
  if (!rows || rows.length === 0) return null;
  const scale = paginationLayoutScale(block);
  const blockTop = paginationLayoutRect(block, scale).top;
  return {
    pitchPx,
    rows: rows.map((row) => ({ topPx: row.top / scale.y - blockTop, heightPx: row.height })),
  };
}

function measuredTextGridHeight(
  block: HTMLElement,
  pitchPx: number,
  factor = 1,
): number | null {
  const rows = measuredTextGridRows(block, pitchPx, factor);
  return rows && rows.length ? rows.reduce((sum, row) => sum + row.height, 0) : null;
}

/**
 * The slots a height takes. A height that is a whole number of slots comes back
 * from the browser rounded: a computed line-height prints six digits (43.4667
 * for two slots of 21.7333, which is 2.000002 slots) and a box stands on
 * sixty-fourths of a pixel. Read exactly, every line of two slots was charged
 * three (a list of them put a book 16 pages over Word).
 */
const GRID_HEIGHT_ROUNDING_PX = 0.02;

function gridSlotsOf(heightPx: number, pitchPx: number): number {
  return Math.max(1, Math.ceil((heightPx - GRID_HEIGHT_ROUNDING_PX) / pitchPx));
}

/**
 * Whether a block's lines cannot be read from its text and inline atoms: a break,
 * a picture. ProseMirror's own hack nodes after an atom that ends a paragraph are
 * no content, nor is what a typeset formula draws with: read as such, a paragraph
 * ending in a formula was charged its box rounded up to whole slots, a slot more
 * than its rows take (103 paragraphs of a book, 1,858 px, two of its sheets).
 */
function holdsUnrowedContent(block: HTMLElement): boolean {
  const found = block.querySelectorAll("br:not(.ProseMirror-trailingBreak), img:not(.ProseMirror-separator), svg, canvas, video, audio");
  for (let index = 0; index < found.length; index += 1) {
    if (!found[index].closest(".katex")) return true;
  }
  return false;
}

function measuredTextGridRows(
  block: HTMLElement,
  pitchPx: number,
  factor = 1,
): Array<{ top: number; bottom: number; height: number }> | null {
  if (holdsUnrowedContent(block)) {
    return null;
  }
  const range = measurementRange(block.ownerDocument, "rowBands");
  if (typeof range.getClientRects !== "function") return null;
  // Superscripts, subscripts and inline non-editable atoms (note references,
  // inline math) sit on a text row; the row banding below keeps them on it.
  // An atom is visited as one fragment and its own text is not walked.
  const atomOf = (element: Element | null): HTMLElement | null => {
    const atom = element?.closest<HTMLElement>('[contenteditable="false"]') ?? null;
    return atom && block.contains(atom) && atom !== block ? atom : null;
  };
  const walker = block.ownerDocument.createTreeWalker(
    block,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: (node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as HTMLElement;
          if (element === block) return NodeFilter.FILTER_SKIP;
          if (element.matches('[contenteditable="false"]') && atomOf(element.parentElement) === null) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_SKIP;
        }
        return atomOf((node as Text).parentElement) === null
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    },
  );
  // Only content hidden inside the block is skipped: a modal dialog hides the
  // editor around it from assistive technology while its rows still paint.
  const hiddenInBlock = (element: Element): boolean => {
    const hidden = element.closest('[aria-hidden="true"]');
    return !!hidden && block.contains(hidden);
  };
  const lineHeights = new WeakMap<HTMLElement, number>();
  const shifts = new WeakMap<HTMLElement, boolean>();
  // A superscript or subscript (a footnote number, an exponent) is raised or
  // lowered off its row's band: its small box overlaps the band by less than
  // half, and the plain text after it on the same row overlaps the raised box
  // by less than half in turn, so one painted row banded three. Such a
  // fragment rides the row it touches without moving the band, and a row it
  // has to open stays tentative until the row's first plain fragment sets the
  // band; it never costs more than the row it sits on.
  const shifted = (element: HTMLElement | null): boolean => {
    for (let node = element; node && node !== block; node = node.parentElement) {
      const known = shifts.get(node);
      if (known !== undefined) return known;
      const align = node.tagName === "SUP" || node.tagName === "SUB" ? "super" : getComputedStyle(node).verticalAlign;
      const raised = align === "super" || align === "sub";
      shifts.set(node, raised);
      if (raised) return true;
    }
    return false;
  };
  const rows: Array<{ top: number; bottom: number; height: number; tentative?: boolean; ascent?: number; descent?: number }> = [];
  // What Word's line reaches above and below the baseline for each run's face
  // (wordGridFontVerticals), in px; null for a face Word's line is not known for.
  const verticals = new WeakMap<HTMLElement, { ascent: number; descent: number } | null>();
  const verticalsOf = (parent: HTMLElement) => {
    let known = verticals.get(parent);
    if (known === undefined) {
      const style = getComputedStyle(parent);
      const sizePx = Number.parseFloat(style.fontSize) || 0;
      const face = style.fontFamily.split(",", 1)[0] ?? "";
      const perEm = sizePx > 0 && face ? wordGridFontVerticals(face) : null;
      known = perEm ? { ascent: perEm.ascent * sizePx, descent: perEm.descent * sizePx } : null;
      verticals.set(parent, known);
    }
    return known;
  };
  const atomScaleY = paginationLayoutScale(block).y || 1;
  const place = (
    fragment: { top: number; bottom: number; height: number; width: number },
    gridHeight: number,
    raised = false,
    face: { ascent: number; descent: number } | null = null,
  ) => {
    if (!(fragment.height > 0) || !(fragment.width > 0)) return;
    const reach = (row: { ascent?: number; descent?: number }) => {
      if (!face) return;
      row.ascent = Math.max(row.ascent ?? 0, face.ascent);
      row.descent = Math.max(row.descent ?? 0, face.descent);
    };
    const current = rows.at(-1);
    const overlap = current
      ? Math.min(current.bottom, fragment.bottom) - Math.max(current.top, fragment.top)
      : 0;
    if (raised) {
      if (current && overlap > 0) {
        current.height = Math.max(current.height, gridHeight);
      } else {
        rows.push({ top: fragment.top, bottom: fragment.bottom, height: gridHeight, tentative: true });
      }
      return;
    }
    if (current?.tentative && overlap > 0) {
      current.top = fragment.top;
      current.bottom = fragment.bottom;
      current.height = Math.max(current.height, gridHeight);
      current.tentative = false;
      reach(current);
      return;
    }
    if (current && overlap >= Math.min(current.bottom - current.top, fragment.height) * 0.5) {
      // Keep the common band, so a tall font cannot chain-merge two rows.
      current.top = Math.max(current.top, fragment.top);
      current.bottom = Math.min(current.bottom, fragment.bottom);
      current.height = Math.max(current.height, gridHeight);
      reach(current);
    } else {
      const row: (typeof rows)[number] = { top: fragment.top, bottom: fragment.bottom, height: gridHeight };
      reach(row);
      rows.push(row);
    }
  };
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const atom = node as HTMLElement;
      if (hiddenInBlock(atom)) continue;
      const style = getComputedStyle(atom);
      if (style.display === "none") continue;
      const rect = atom.getBoundingClientRect();
      // An inline atom taller than a slot (inline math) costs the slots it
      // paints; a note reference costs nothing beyond its row. Its height in
      // document pixels, like the pitch: read in canvas pixels, a zoomed
      // document charged an equation more rows than it paints and its page
      // breaks moved with the zoom.
      // It rides its row as a script does: taller than the row, its box reaches
      // into the next row's band, and counted as band it joined the two (10 rows
      // of a paragraph read as 7, "all fit", no cut, the paragraph moved whole).
      // A formula boxed by Word's metrics says itself what its line takes: a
      // one-slot one (an inline sum) sets a negative margin and stays on its row
      // though its box stands taller than a slot.
      const mathBox = atom.matches("[data-word-math-box]") ? atom : atom.querySelector<HTMLElement>("[data-word-math-box]");
      const mathMargins = mathBox ? getComputedStyle(mathBox) : null;
      const atomHeight = mathBox && mathMargins
        ? mathBox.getBoundingClientRect().height / atomScaleY +
          (Number.parseFloat(mathMargins.marginTop) || 0) + (Number.parseFloat(mathMargins.marginBottom) || 0)
        : rect.height / atomScaleY;
      // A formula KaTeX may break stands on as many lines as it has pieces, each
      // piece the slots of its own: the box of them all is no line's height.
      const pieces = mathBox ? [] : Array.from(atom.querySelectorAll<HTMLElement>("[data-word-math-lines] .katex-html > .base"));
      if (pieces.length > 0) {
        for (const piece of pieces) {
          const box = piece.getBoundingClientRect();
          // The piece's line is its strut: Word's box in whole slots, or one slot
          // for a box that fits one. The piece's own box reaches past the strut by
          // its glyphs' overhang (a γ's tail, a hat: 22-24.6 px over a 21.7 px
          // strut), which Word's line does not take: charged as slots, forty
          // lines of a 310-page book cost a slot more than they paint and Word
          // sets them (626 px, its pages 164-166 each a few lines short).
          const strut = piece.querySelector<HTMLElement>(":scope > .strut");
          const strutPx = strut ? Number.parseFloat(getComputedStyle(strut).height) : Number.NaN;
          const linePx = Number.isFinite(strutPx) && strutPx > 0 ? strutPx : box.height / atomScaleY;
          place(box, gridSlotsOf(linePx, pitchPx) * pitchPx, true);
        }
        continue;
      }
      place(rect, gridSlotsOf(atomHeight, pitchPx) * pitchPx, true);
      continue;
    }
    const parent = node.parentElement;
    if (!parent || hiddenInBlock(parent)) continue;
    let lineHeight = lineHeights.get(parent);
    if (lineHeight === undefined) {
      const style = getComputedStyle(parent);
      const declaredHeight = Number.parseFloat(style.lineHeight);
      const naturalHeight = (Number.parseFloat(style.fontSize) || 0) * 1.2;
      lineHeight = Math.max(
        pitchPx,
        Number.isFinite(declaredHeight) ? declaredHeight : naturalHeight,
      );
      lineHeights.set(parent, lineHeight);
    }
    // A multiple on the grid sets the line at that many pitches, unrounded; a
    // run taller than that takes whole slots (Word 16.86: 2.5 x 16.3 pt is
    // 40.8 pt; 14 pt SimSun at 1.733 is two slots, 32.6 pt, not 28.25).
    const wholeSlots = Math.abs(lineHeight / pitchPx - Math.round(lineHeight / pitchPx)) * pitchPx <= GRID_HEIGHT_ROUNDING_PX;
    const gridHeight = factor > 1 && !wholeSlots
      ? Math.max(lineHeight, factor * pitchPx)
      : Math.max(gridSlotsOf(lineHeight, pitchPx) * pitchPx, factor > 1 ? factor * pitchPx : 0);
    range.selectNodeContents(node);
    const raised = shifted(parent);
    // White space asks nothing of the line's reach (Word 16.86); a raised run's
    // reach is the row's own business.
    const face = raised || /^\s*$/u.test((node as Text).data) ? null : verticalsOf(parent);
    for (const fragment of Array.from(range.getClientRects())) place(fragment, gridHeight, raised, face);
  }
  // A row of several faces reaches the largest ascent of them over the largest
  // descent, and takes the slots that reach needs, or the multiple's line.
  for (const row of rows) {
    const reach = (row.ascent ?? 0) + (row.descent ?? 0);
    // Word's own face metrics, not a browser's paint: no rounding to forgive
    // (16.81 pt of SimSun over STXinwei on a 16.3 pt grid is two slots).
    if (reach > pitchPx) row.height = Math.max(row.height, gridSlotsOf(reach, pitchPx) * pitchPx);
  }
  settleRowsOnBox(block, rows, pitchPx, atomScaleY);
  return rows;
}

/**
 * A line takes its slots from more than the words on it: a font line-height does
 * not state, a strut, the block's own metrics. Read off their line-height the rows
 * came to less than the box they stand in (3 lines of 2 slots read as 1 each: a
 * 130 px paragraph "fits" the 117 px left, no cut, so the whole of it moved to the
 * next page and left 116 px empty; 353 such answers in a 310-page book, 8 pages
 * over Word). The slots the rows lack go to the rows standing furthest apart.
 */
function settleRowsOnBox(
  block: HTMLElement,
  rows: Array<{ top: number; bottom: number; height: number }>,
  pitchPx: number,
  scaleY: number,
): void {
  if (rows.length === 0) return;
  const style = getComputedStyle(block);
  const chrome = ["borderTopWidth", "borderBottomWidth", "paddingTop", "paddingBottom"] as const;
  const inner = block.getBoundingClientRect().height / scaleY -
    chrome.reduce((sum, side) => sum + (Number.parseFloat(style[side]) || 0), 0);
  const charged = rows.reduce((sum, row) => sum + row.height, 0);
  let missing = Math.round((inner - charged) / pitchPx);
  if (missing <= 0) return;
  const boxBottom = block.getBoundingClientRect().bottom;
  const room = rows.map((row, index) => {
    const next = rows[index + 1];
    const advance = (next ? next.top - row.top : (boxBottom - row.top) * 2 - (row.bottom - row.top)) / scaleY;
    return { row, spare: advance - row.height };
  });
  while (missing > 0) {
    let widest = room[0]!;
    for (const entry of room) if (entry.spare > widest.spare) widest = entry;
    widest.row.height += pitchPx;
    widest.spare -= pitchPx;
    missing -= 1;
  }
}

/** A container (list, quote, callout) on a Word line grid: its paragraphs
 * snap to the grid exactly like top-level ones, so each paragraph's painted
 * height is replaced by its slot cost while the container's own chrome
 * (item gaps, markers, padding) keeps its painted size. WebKit paints a
 * fractional line-height whole pixels short, and a list of forty single-line
 * items would otherwise be charged a slot too few. Cells own their line
 * geometry and are left alone. */
export function lineGridQuantizedContainerHeight(
  sheet: HTMLElement,
  block: HTMLElement,
  measuredHeightPx: number,
): number {
  if (!(measuredHeightPx > 0)) return measuredHeightPx;
  if (block.matches("p, h1, h2, h3, h4, h5, h6, table")) return measuredHeightPx;
  // Off the grid only the engine's truncated lines are owed (untruncatedTextHeightPx).
  if (!sheet.closest('[data-doc-grid="lines"]') && !truncatesFractionalLineHeight(block.ownerDocument)) return measuredHeightPx;
  let delta = 0;
  const scale = paginationLayoutScale(block);
  for (const paragraph of Array.from(block.querySelectorAll<HTMLElement>("p, h1, h2, h3, h4, h5, h6"))) {
    if (paragraph.closest("td, th")) continue;
    const painted = paginationLayoutRect(paragraph, scale).height;
    if (!(painted > 0)) continue;
    delta += lineGridQuantizedTextBlockHeight(sheet, paragraph, painted) - painted;
  }
  return measuredHeightPx + Math.max(0, delta);
}

/** WebKit truncates fractional row heights, while Chromium can add a small
 * mixed-font strut. Charge each painted row its authored grid slots and retain
 * any larger physical height; total-height division cannot distinguish these
 * cases and would incorrectly turn a 21.8px one-line heading into two rows. */
/** The pitch of the Word line grid a text block is snapped to, or null for a
 * block that owns its own line geometry (opted out, exact/atLeast rule, table
 * cell) or a grid-free document. */
function lineGridPitchPx(block: HTMLElement): number | null {
  const geometry = lineGridRowGeometry(block);
  // A multiple line spacing sets the line at that many pitches, in no whole
  // number of slots (15.6 pt x 1.16 is 18.1 pt, Word 16 for Mac): a box of such
  // lines is not counted in slots (its rows are: measuredTextGridRows).
  return geometry && geometry.factor <= 1 ? geometry.pitchPx : null;
}

/** The grid a text block's rows stand on and its line multiple, or null for a
 * block that owns its own line geometry (opted out, exact/atLeast rule, table
 * cell) or a grid-free document. */
function lineGridRowGeometry(block: HTMLElement): { pitchPx: number; factor: number } | null {
  if (
    !block.matches("p, h1, h2, h3, h4, h5, h6") ||
    block.dataset.snapToGrid === "false" ||
    block.hasAttribute("data-line-height-rule") ||
    block.closest("td, th")
  ) {
    return null;
  }
  const gridHost = block.closest<HTMLElement>('[data-doc-grid="lines"]');
  if (!gridHost) return null;
  const blockStyle = getComputedStyle(block);
  const factor = Number.parseFloat(
    blockStyle.getPropertyValue("--doc-line-factor") ||
      blockStyle.getPropertyValue("--doc-default-line-height"),
  );
  const pitchPx = Number.parseFloat(
    getComputedStyle(gridHost).getPropertyValue("--doc-grid-pitch"),
  );
  if (!(Number.isFinite(pitchPx) && pitchPx > 0)) return null;
  return { pitchPx, factor: Number.isFinite(factor) && factor > 1 ? factor : 1 };
}

/** What a painted height COSTS on the line grid: every line advances by a
 * whole slot, so a 14px glyph row in a 20.8px grid consumes 20.8px. Off the
 * grid the height is returned unchanged. */
export function lineGridSlotHeightPx(
  block: HTMLElement,
  heightPx: number,
): number {
  if (!(heightPx > 0)) return heightPx;
  const pitchPx = lineGridPitchPx(block);
  if (pitchPx === null) return heightPx;
  // A paragraph's border and its padding stand beside the slots, as they do on
  // a paragraph that has text: an empty one under a rule cost two slots and
  // painted one.
  const style = getComputedStyle(block);
  const chromePx = ["borderTopWidth", "borderBottomWidth", "paddingTop", "paddingBottom"] as const;
  const chrome = chromePx.reduce((sum, side) => sum + (Number.parseFloat(style[side]) || 0), 0);
  const slots = Math.max(
    1,
    Math.ceil((heightPx - chrome - LINE_GRID_FIT_TOLERANCE_PX) / pitchPx),
  );
  return Math.max(heightPx, slots * pitchPx + chrome);
}

export function lineGridQuantizedTextBlockHeight(
  sheet: HTMLElement,
  block: HTMLElement,
  measuredHeightPx: number,
): number {
  if (!(measuredHeightPx > 0)) return measuredHeightPx;
  const geometry = lineGridRowGeometry(block);
  if (geometry !== null && geometry.factor > 1 && sheet.closest('[data-doc-grid="lines"]')) {
    // A multiple's rows each take the multiple's line or the slots a taller run
    // needs; its box is not counted in slots.
    const rowsHeight = measuredTextGridHeight(block, geometry.pitchPx, geometry.factor);
    const painted = untruncatedTextHeightPx(block, measuredHeightPx);
    return rowsHeight !== null ? Math.max(painted, rowsHeight) : painted;
  }
  const pitchPx = lineGridPitchPx(block);
  if (pitchPx === null || !sheet.closest('[data-doc-grid="lines"]')) {
    return untruncatedTextHeightPx(block, measuredHeightPx);
  }
  // Each painted row charged its slots: a truncated row still takes its slot.
  const textHeight = measuredTextGridHeight(block, pitchPx);
  if (textHeight !== null) return Math.max(measuredHeightPx, textHeight);
  // The whole box in slots: from the height its lines take, not the one
  // WebKit painted them at (thirty rows of 21.733 px painted 21 px short a
  // slot: the book 3 sheets shorter in WebKit than in Chromium).
  return lineGridSlotHeightPx(block, untruncatedTextHeightPx(block, measuredHeightPx));
}

/**
 * Whether this engine paints a fractional line-height whole pixels short:
 * WebKit truncates each line box (21.733 px lines advance 21 px), Chromium
 * keeps the fraction. Read once per document from a hidden probe of ten
 * lines.
 */
const lineTruncation = new WeakMap<Document, boolean>();

export function truncatesFractionalLineHeight(doc: Document): boolean {
  const known = lineTruncation.get(doc);
  if (known !== undefined) return known;
  let truncates = false;
  const host = doc.body;
  // Blink and Gecko keep the fraction; they never take the probe. Put into the
  // page in the middle of a pass, it moved Chromium's page breaks (R280-D14:
  // one layout in three opens without it, three in four with it).
  const agent = doc.defaultView?.navigator.userAgent ?? "";
  if (host && !/\b(Chrome|Chromium|CriOS|Edg|Firefox|FxiOS)\//.test(agent)) {
    const probe = doc.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:absolute;left:-10000px;top:0;visibility:hidden;width:40px;margin:0;padding:0;border:0;" +
      "font:10px/21.75px sans-serif;white-space:normal";
    for (let line = 0; line < 10; line += 1) {
      if (line) probe.appendChild(doc.createElement("br"));
      probe.appendChild(doc.createTextNode("x"));
    }
    host.appendChild(probe);
    const height = probe.getBoundingClientRect().height;
    probe.remove();
    // Ten lines: 217.5 px kept, 210 px truncated. No layout (jsdom): neither.
    truncates = height > 0 && height < 217.5 - 2;
  }
  lineTruncation.set(doc, truncates);
  return truncates;
}

/**
 * What a text block's lines take at their computed line-height, where the
 * engine painted them at whole pixels (truncatesFractionalLineHeight): its
 * lines (its painted height over the truncated line) at the line-height,
 * and its border and padding as painted; never less than painted. Anywhere
 * else, or for a block whose line-height is a whole number of pixels, the
 * painted height. The one undoing of the truncation: a height the line grid
 * charges row by row (measuredTextGridRows) never comes through it.
 */
/** A text block's truncated line, and the line-height it stands for; null where nothing is truncated. */
function truncatedLineOf(block: HTMLElement): { whole: number; lineHeight: number; chrome: number } | null {
  if (!block.matches("p, h1, h2, h3, h4, h5, h6")) return null;
  if (!truncatesFractionalLineHeight(block.ownerDocument)) return null;
  const style = getComputedStyle(block);
  const lineHeight = Number.parseFloat(style.lineHeight);
  if (!(lineHeight > 0)) return null;
  const whole = Math.floor(lineHeight + 0.001);
  if (whole < 1 || lineHeight - whole < 0.01) return null;
  const chromeSides = ["borderTopWidth", "borderBottomWidth", "paddingTop", "paddingBottom"] as const;
  const chrome = chromeSides.reduce((sum, side) => sum + (Number.parseFloat(style[side]) || 0), 0);
  return { whole, lineHeight, chrome };
}

/** The painted room that holds what `chargedPx` charges (untruncatedTextHeightPx turned
 * round): a cut planned on the painted lines keeps the lines the charge has room for. */
export function truncatedTextRoomPx(block: HTMLElement, chargedPx: number): number {
  if (!(chargedPx > 0)) return chargedPx;
  const line = truncatedLineOf(block);
  if (!line) return chargedPx;
  const painted = paginationLayoutRect(block, paginationLayoutScale(block)).height;
  return truncatedLineCount(line, painted) !== null ? chargedPx * (line.whole / line.lineHeight) : chargedPx;
}

/**
 * How many whole-pixel lines a painted text box stands for, or null when its
 * height is no whole number of them: the engine did not truncate this box's
 * lines (WebKit paints a box of 27.576 px lines among other line boxes at
 * 367.672 px, as Chromium does: read as 14 truncated lines it was charged a
 * line more, and R283-D05 came out a page longer than Word's 22).
 */
function truncatedLineCount(line: { whole: number; chrome: number }, paintedPx: number): number | null {
  const text = paintedPx - line.chrome;
  const lines = Math.round(text / line.whole);
  return lines >= 1 && Math.abs(text - lines * line.whole) <= TRUNCATED_BOX_TOLERANCE_PX ? lines : null;
}

/** A truncated box stands on whole pixels, read back in sixty-fourths. */
const TRUNCATED_BOX_TOLERANCE_PX = 0.1;

export function untruncatedTextHeightPx(block: HTMLElement, paintedPx: number): number {
  if (!(paintedPx > 0)) return paintedPx;
  const line = truncatedLineOf(block);
  if (!line) return paintedPx;
  const lines = truncatedLineCount(line, paintedPx);
  if (lines === null) return paintedPx;
  return Math.max(paintedPx, line.chrome + lines * line.lineHeight);
}

/**
 * What an engine-laid text block costs on the line grid, charged as
 * {@link lineGridQuantizedTextBlockHeight} charges its painted box, from
 * style alone: a block holding a break, a picture or a frame by its box in
 * whole slots; any other by the larger of its box and each line in the
 * slots its height takes (the page charges each painted row by the slots
 * its line-height takes).
 */
export function lineGridChargedEngineHeight(
  sheet: HTMLElement,
  block: HTMLElement,
  heightPx: number,
  lineHeightsPx: readonly number[],
): number {
  if (!(heightPx > 0)) return heightPx;
  const pitchPx = lineGridPitchPx(block);
  if (pitchPx === null || !sheet.closest('[data-doc-grid="lines"]')) return heightPx;
  if (holdsUnrowedContent(block) || lineHeightsPx.length === 0) {
    return lineGridSlotHeightPx(block, heightPx);
  }
  let rows = 0;
  for (const line of lineHeightsPx) rows += gridSlotsOf(line, pitchPx) * pitchPx;
  return Math.max(heightPx, rows);
}

/** Sheet-local block heights via offsetTop deltas (margins + collapse
 * included); the last block's bottom margin is deliberately dropped.
 *
 * In-sheet 分栏: CSS exposes one client rect per fragment. Linearizing each
 * fragment as `column × physical-column-capacity + y` preserves inter-block
 * margins, explicit column-break gaps, and blocks fragmented across columns;
 * a plain offsetTop/offsetHeight sum cannot represent any of those. */
export function syncStructuralPageStartSpacing(
  sheets: readonly HTMLElement[],
  forcedStarts: readonly boolean[],
  preserved?: readonly boolean[],
): void {
  sheets.forEach((sheet, index) => {
    // Word suppresses spacing only at an automatic page wrap. The start of
    // the document and an authored page/section break keep paragraph spacing.
    sheet.toggleAttribute(
      "data-page-preserve-leading-space",
      preserved?.[index] ?? (index === 0 || forcedStarts[index] === true),
    );
  });
}

export function readCapacity(view: EditorView, sheet: HTMLElement): number {
  const surface = view.dom.closest<HTMLElement>(
    '[data-testid="note-editor-page-surface"]',
  );
  const pageHeight = surface
    ? Number.parseFloat(
        getComputedStyle(surface).getPropertyValue("--page-height-px"),
      )
    : Number.NaN;
  // Prefer the sheet's own rendered page floor. Per-section page geometry can
  // paint a different min-height than the document-wide surface variable; an
  // overflowing sheet still keeps that physical floor in `min-height`.
  return sheetContentCapacity(
    sheet,
    Number.isFinite(pageHeight) ? pageHeight : 1056,
  );
}

/** Page-edge rules suppress the first/last block's margins with !important.
 * A block appended inside a page regains those margins. Read that context in
 * a tiny sibling measurement shell, never by changing live ProseMirror DOM.
 * Shallow clones retain native inline styles, classes and selector attributes;
 * the real root parent supplies the same inherited font/CSS-variable context. */
export function measurePageAppendMargins(
  firstMoved: HTMLElement,
  lastExisting: HTMLElement | null,
  targetSheet: HTMLElement,
): { before: number; after: number } {
  const fallback = () => ({
    before: Number.parseFloat(getComputedStyle(firstMoved).marginTop) || 0,
    after: lastExisting ? Number.parseFloat(getComputedStyle(lastExisting).marginBottom) || 0 : 0,
  });
  const root = targetSheet.parentElement;
  if (!root?.isConnected || !root.parentElement) return fallback();
  const shell = root.cloneNode(false) as HTMLElement;
  shell.removeAttribute("id");
  shell.setAttribute("aria-hidden", "true");
  shell.setAttribute("inert", "");
  const rootWidth = getComputedStyle(root).width;
  const width = rootWidth.endsWith("px") && Number.parseFloat(rootWidth) > 0 ? rootWidth : `${root.clientWidth}px`;
  for (const [key, value] of Object.entries({ position: "absolute", visibility: "hidden", pointerEvents: "none", left: "-100000px", top: "0", width })) {
    shell.style.setProperty(key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`), value, "important");
  }
  const page = targetSheet.cloneNode(false) as HTMLElement;
  page.removeAttribute("id");
  const cloneMarginContext = (original: HTMLElement): HTMLElement => {
    const clone = original.cloneNode(false) as HTMLElement;
    clone.removeAttribute("id");
    clearPageEdgeMarks(clone);
    // Native-table margins depend on :has(> table[data-native-inline-table]).
    // Keep that structural selector evidence without cloning cells or text.
    if (original.classList.contains("tableWrapper")) for (const child of Array.from(original.children)) {
      if (child.tagName !== "TABLE") continue;
      const table = child.cloneNode(false) as HTMLElement;
      table.removeAttribute("id");
      clone.append(table);
    }
    return clone;
  };
  const before = cloneMarginContext(firstMoved);
  const after = lastExisting ? cloneMarginContext(lastExisting) : undefined;
  // Non-widget siblings ensure both cloned blocks are interior children for
  // ordinary and :nth-child(... of :not(.ProseMirror-widget)) page-edge rules.
  const marker = () => targetSheet.ownerDocument.createElement("span");
  page.append(marker(), ...(after ? [after] : []), before, marker());
  shell.append(page);
  root.parentElement.append(shell);
  try {
    return {
      before: Number.parseFloat(getComputedStyle(before).marginTop) || 0,
      after: after ? Number.parseFloat(getComputedStyle(after).marginBottom) || 0 : 0,
    };
  } finally {
    shell.remove();
  }
}

/**
 * Authored margins of every sheet-edge block, measured in ONE off-screen
 * shell: one clone per sheet, every edge block cloned into it as an interior
 * child. A single DOM insertion and a single forced layout replace one
 * shell per block, which on a long document (39 sheets, 78 edge blocks)
 * cost a full-document layout each and held the main thread for seconds.
 *
 * The page-edge rules also zero the margins a block's descendants collapse
 * through its outer edge (a list's first and last paragraphs), so each
 * clone carries those collapse chains too, and the map holds the authored
 * own margins of every chain element as well as of the block itself. A
 * chain element's clone reproduces its position only on the edge it
 * collapses through; its other margin is read from the element itself,
 * which no edge rule touches.
 */
export function measurePageEdgeMargins(
  sheets: readonly HTMLElement[],
  blocksBySheet: ReadonlyMap<HTMLElement, readonly HTMLElement[]>,
): Map<HTMLElement, { before: number; after: number }> {
  const result = new Map<HTMLElement, { before: number; after: number }>();
  const fallback = (block: HTMLElement) => {
    const css = getComputedStyle(block);
    return { before: Number.parseFloat(css.marginTop) || 0, after: Number.parseFloat(css.marginBottom) || 0 };
  };
  const root = sheets[0]?.parentElement;
  if (!root?.isConnected || !root.parentElement) {
    for (const blocks of blocksBySheet.values()) for (const block of blocks) result.set(block, fallback(block));
    return result;
  }
  const shell = root.cloneNode(false) as HTMLElement;
  shell.removeAttribute("id");
  shell.setAttribute("aria-hidden", "true");
  shell.setAttribute("inert", "");
  const rootWidth = getComputedStyle(root).width;
  const width = rootWidth.endsWith("px") && Number.parseFloat(rootWidth) > 0 ? rootWidth : `${root.clientWidth}px`;
  for (const [key, value] of Object.entries({ position: "absolute", visibility: "hidden", pointerEvents: "none", left: "-100000px", top: "0", width })) {
    shell.style.setProperty(key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`), value, "important");
  }
  const clones: Array<[HTMLElement, HTMLElement]> = [];
  const pages: HTMLElement[] = [];
  const chainEdges = new Map<HTMLElement, "top" | "bottom" | "both">();
  const cloneMarginContext = (original: HTMLElement): HTMLElement => {
    const clone = original.cloneNode(false) as HTMLElement;
    clone.removeAttribute("id");
    clearPageEdgeMarks(clone);
    if (original.classList.contains("tableWrapper")) for (const child of Array.from(original.children)) {
      if (child.tagName !== "TABLE") continue;
      const table = child.cloneNode(false) as HTMLElement;
      table.removeAttribute("id");
      clone.append(table);
    }
    return clone;
  };
  // Clone the chains the edge rules suppress: every element whose margin
  // collapses through the block's top or bottom edge, nested as in the
  // original (first chain first, last chain last) so each clone keeps its
  // first/last-child position and every class-driven margin.
  const cloneCollapseChains = (block: HTMLElement, clone: HTMLElement) => {
    const cloned = new Map<HTMLElement, HTMLElement>([[block, clone]]);
    for (const edge of ["top", "bottom"] as const) {
      let parent = block;
      for (const element of marginCollapseChain(block, edge)) {
        if (cloned.has(element)) {
          // Shared by both chains (a single-item list): the clone is first
          // and last child alike, as the element is.
          chainEdges.set(element, "both");
        } else {
          const copy = element.cloneNode(false) as HTMLElement;
          copy.removeAttribute("id");
          const host = cloned.get(parent)!;
          if (edge === "top") host.prepend(copy);
          else host.append(copy);
          cloned.set(element, copy);
          chainEdges.set(element, edge);
          clones.push([element, copy]);
        }
        parent = element;
      }
    }
  };
  for (const sheet of sheets) {
    const blocks = blocksBySheet.get(sheet);
    if (!blocks || blocks.length === 0) continue;
    const page = sheet.cloneNode(false) as HTMLElement;
    page.removeAttribute("id");
    // Non-widget markers keep every clone an interior child for the
    // ordinary and :nth-child(... of :not(.ProseMirror-widget)) edge rules.
    page.append(sheet.ownerDocument.createElement("span"));
    for (const block of blocks) {
      const clone = cloneMarginContext(block);
      if (!block.classList.contains("tableWrapper")) cloneCollapseChains(block, clone);
      page.append(clone, sheet.ownerDocument.createElement("span"));
      clones.push([block, clone]);
    }
    pages.push(page);
  }
  if (clones.length === 0) return result;
  const read = () => {
    for (const [element, clone] of clones) {
      const edge = chainEdges.get(element);
      const top = edge === "bottom" ? getComputedStyle(element) : getComputedStyle(clone);
      const bottom = edge === "top" ? getComputedStyle(element) : getComputedStyle(clone);
      result.set(element, {
        before: Number.parseFloat(top.marginTop) || 0,
        after: Number.parseFloat(bottom.marginBottom) || 0,
      });
    }
  };
  // The page clones are read inside the contained task host beside the
  // editor (renderedTextHead), so the editor's own layout is never dirtied
  // by the probe; the shell beside the root is the fallback for a root
  // that host cannot serve.
  const hosted = withRootMeasurementSlot(root, (slot) => {
    slot.append(...pages);
    read();
    return true;
  });
  if (!hosted) {
    shell.append(...pages);
    root.parentElement.append(shell);
    try {
      read();
    } finally {
      shell.remove();
    }
  }
  return result;
}

/** Printable width of one rendered newspaper column in this exact sheet. */
function readColumnContentWidth(sheet: HTMLElement): number {
  const style = getComputedStyle(sheet);
  const horizontalPadding =
    (Number.parseFloat(style.paddingLeft) || 0) +
    (Number.parseFloat(style.paddingRight) || 0);
  const printableWidth = Math.max(0, sheet.clientWidth - horizontalPadding);
  const columns = sheetColumnCount(sheet);
  if (columns <= 1) return printableWidth;
  const rawGap = Number.parseFloat(style.columnGap);
  const gap = Number.isFinite(rawGap) && rawGap > 0 ? rawGap : 0;
  return Math.max(0, (printableWidth - gap * (columns - 1)) / columns);
}

/** Formula layout width in flattened structural-block order. A live block's
 * own width wins when available (it includes browser column fragmentation);
 * the sheet-derived column width is the deterministic hidden/jsdom fallback. */
export function measureStructuralBlockContentWidths(
  sheets: readonly HTMLElement[],
  /** Only these blocks are read (the others are 0): reading a block's width
   * lays its sheet out. */
  only?: ReadonlySet<HTMLElement> | null,
): number[] {
  const widths: number[] = [];
  for (const sheet of sheets) {
    const children = Array.from(sheet.children).filter((child) => !child.classList.contains("ProseMirror-widget"));
    if (only && !children.some((child) => only.has(child as HTMLElement))) {
      for (const child of children) if (child instanceof HTMLElement) widths.push(0);
      continue;
    }
    const columnWidth = readColumnContentWidth(sheet);
    for (const child of children) {
      if (!(child instanceof HTMLElement)) continue;
      if (only && !only.has(child)) {
        widths.push(0);
        continue;
      }
      const unequalWidth = unequalColumnPlacementForBlock(child)?.widthPx;
      const liveWidth = child.clientWidth;
      widths.push(
        unequalWidth !== undefined && unequalWidth > 0
          ? liveWidth > 0
            ? Math.min(liveWidth, unequalWidth)
            : unequalWidth
          : liveWidth > 0 && columnWidth > 0
            ? Math.min(liveWidth, columnWidth)
            : liveWidth || columnWidth,
      );
    }
  }
  return widths;
}

/** Apply one boundary move against the CURRENT tr.doc. Positions are
 * recomputed per move, so earlier moves cannot invalidate later ones. */
interface MovedTextSelection {
  anchorOffset: number;
  headOffset: number;
}

function captureMovedTextSelection(
  tr: import("@tiptap/pm/state").Transaction,
  from: number,
  to: number,
): MovedTextSelection | null {
  const { selection } = tr;
  if (!(selection instanceof TextSelection)) return null;
  if (
    selection.anchor <= from ||
    selection.anchor >= to ||
    selection.head <= from ||
    selection.head >= to
  ) {
    return null;
  }
  return {
    anchorOffset: selection.anchor - from,
    headOffset: selection.head - from,
  };
}

function restoreMovedTextSelection(
  tr: import("@tiptap/pm/state").Transaction,
  insertionStart: number,
  selection: MovedTextSelection | null,
): void {
  if (!selection) return;
  const requestedAnchor = insertionStart + selection.anchorOffset;
  const requestedHead = insertionStart + selection.headOffset;
  const anchorInline = tr.doc.resolve(requestedAnchor).parent.inlineContent;
  const headInline = tr.doc.resolve(requestedHead).parent.inlineContent;
  if (anchorInline && headInline) {
    tr.setSelection(TextSelection.create(tr.doc, requestedAnchor, requestedHead));
    return;
  }
  const forward = requestedHead >= requestedAnchor;
  const safeAnchor = selectionNearInlineContent(
    tr.doc,
    requestedAnchor,
    forward ? 1 : -1,
  );
  const safeHead = selectionNearInlineContent(
    tr.doc,
    requestedHead,
    requestedAnchor === requestedHead ? 1 : forward ? -1 : 1,
  );
  if (
    safeAnchor instanceof TextSelection &&
    safeHead instanceof TextSelection
  ) {
    tr.setSelection(
      TextSelection.create(tr.doc, safeAnchor.head, safeHead.head),
    );
  } else {
    tr.setSelection(safeHead);
  }
}

/**
 * Move whole blocks across one sheet boundary by cutting and re-joining the
 * SHEETS only (split/join steps), never deleting and re-inserting the blocks.
 * A delete + insert throws the moved text away as far as the undo history is
 * concerned: every undo item inside it maps to "deleted" and is dropped, so
 * an edit that made a block change pages (typing, Backspace at a page top)
 * could not be undone. Sheet splits and joins leave every content position
 * mappable. Returns false when the sheets are not adjacent doc children (a
 * stray top-level block between them), for the legacy path below.
 */
function applyBoundaryMoveBySheetCuts(
  tr: { doc: PmNode } & import("@tiptap/pm/state").Transaction,
  pages: PageInfo[],
  boundary: number,
  delta: number,
  options: { isolateTrailingForcedBreak?: boolean },
): boolean {
  if (delta > 0) {
    const source = pages[boundary];
    if (!source) return true;
    const keep = source.node.childCount - delta;
    if (keep < 1) return true; // target never drains a page via push
    const next = pages[boundary + 1];
    if (next && next.pos !== source.pos + source.node.nodeSize) return false;
    const movedEndsInForcedBreak =
      options.isolateTrailingForcedBreak === true &&
      source.node.childCount > 0 &&
      isForcedBreakBlockIn(tr.doc, source.node.child(source.node.childCount - 1));
    let offset = 0;
    for (let i = 0; i < keep; i += 1) offset += source.node.child(i).nodeSize;
    const cut = source.pos + 1 + offset;
    // [kept | moved] -> [kept][moved]; the moved sheet then joins the next
    // one (or stays a sheet of its own after a trailing forced break).
    tr.split(cut, 1);
    if (next && !movedEndsInForcedBreak) {
      const movedSheet = tr.doc.nodeAt(cut + 1);
      if (movedSheet) tr.join(cut + 1 + movedSheet.nodeSize);
    }
    return true;
  }
  // delta < 0: pull -delta leading blocks of page boundary+1 backward.
  const pull = -delta;
  const source = pages[boundary + 1];
  const target = pages[boundary];
  if (!source || !target) return true;
  if (source.pos !== target.pos + target.node.nodeSize) return false;
  if (pull < source.node.childCount) {
    let offset = 0;
    for (let i = 0; i < pull; i += 1) offset += source.node.child(i).nodeSize;
    // [pulled | rest] -> [pulled][rest]; the pulled sheet joins the target.
    tr.split(source.pos + 1 + offset, 1);
  }
  tr.join(source.pos);
  return true;
}

export function applyBoundaryMove(
  tr: { doc: PmNode } & import("@tiptap/pm/state").Transaction,
  pageType: NodeType,
  boundary: number,
  delta: number,
  options: { isolateTrailingForcedBreak?: boolean } = {},
): void {
  const pages = collectPages(tr.doc);
  if (!pages) return;
  if (delta === 0) return;
  if (applyBoundaryMoveBySheetCuts(tr, pages, boundary, delta, options)) return;
  if (delta > 0) {
    const source = pages[boundary];
    if (!source) return;
    const keep = source.node.childCount - delta;
    if (keep < 1) return; // target never drains a page via push
    let offset = 0;
    for (let i = 0; i < keep; i += 1) offset += source.node.child(i).nodeSize;
    const from = source.pos + 1 + offset;
    const to = source.pos + 1 + source.node.content.size;
    const movedEndsInForcedBreak =
      options.isolateTrailingForcedBreak === true &&
      source.node.childCount > 0 &&
      isForcedBreakBlockIn(tr.doc, source.node.child(source.node.childCount - 1));
    const selection = captureMovedTextSelection(tr, from, to);
    const moved = tr.doc.slice(from, to).content;
    tr.delete(from, to);
    const after = collectPages(tr.doc);
    if (!after) return;
    const next = after[boundary + 1];
    if (next) {
      if (movedEndsInForcedBreak) {
        const sourceAfter = after[boundary];
        if (!sourceAfter) return;
        const pageInsertPos = sourceAfter.pos + sourceAfter.node.nodeSize;
        tr.insert(pageInsertPos, pageType.create(null, Fragment.from(moved)));
        restoreMovedTextSelection(tr, pageInsertPos + 1, selection);
      } else {
        const insertionStart = next.pos + 1;
        tr.insert(insertionStart, moved);
        restoreMovedTextSelection(tr, insertionStart, selection);
      }
    } else {
      const sourceAfter = after[boundary];
      if (!sourceAfter) return;
      const pageInsertPos = sourceAfter.pos + sourceAfter.node.nodeSize;
      tr.insert(pageInsertPos, pageType.create(null, Fragment.from(moved)));
      restoreMovedTextSelection(tr, pageInsertPos + 1, selection);
    }
    return;
  }
  // delta < 0: pull -delta leading blocks of page boundary+1 backward.
  const pull = -delta;
  const source = pages[boundary + 1];
  const target = pages[boundary];
  if (!source || !target) return;
  const draining = pull >= source.node.childCount;
  if (draining) {
    const contentFrom = source.pos + 1;
    const contentTo = source.pos + 1 + source.node.content.size;
    const selection = captureMovedTextSelection(tr, contentFrom, contentTo);
    const moved = source.node.content;
    tr.delete(source.pos, source.pos + source.node.nodeSize);
    const after = collectPages(tr.doc);
    const targetAfter = after?.[boundary];
    if (!targetAfter) return;
    const insertionStart = targetAfter.pos + 1 + targetAfter.node.content.size;
    tr.insert(insertionStart, moved);
    restoreMovedTextSelection(tr, insertionStart, selection);
    return;
  }
  let offset = 0;
  for (let i = 0; i < pull; i += 1) offset += source.node.child(i).nodeSize;
  const from = source.pos + 1;
  const to = source.pos + 1 + offset;
  const selection = captureMovedTextSelection(tr, from, to);
  const moved = tr.doc.slice(from, to).content;
  tr.delete(from, to);
  const after = collectPages(tr.doc);
  const targetAfter = after?.[boundary];
  if (!targetAfter) return;
  const insertionStart = targetAfter.pos + 1 + targetAfter.node.content.size;
  tr.insert(insertionStart, moved);
  restoreMovedTextSelection(tr, insertionStart, selection);
}

// ---------------------------------------------------------------------------
// Word-style block splitting (V3.6): cut a code block at the page edge so
// the page fills to the brim; the tail continues on the next sheet as a
// continuation node. See blockSplitting.ts for the model + purity contract.
// ---------------------------------------------------------------------------

/**
 * Split the FIRST child of sheet `boundary + 1` (a splittable code block)
 * after `headLines` lines and pull the head onto sheet `boundary`.
 * Exported for direct doc-op tests (jsdom cannot exercise the measuring
 * path — zero layout means the planner never fires there).
 */
export function applyCodeBlockSplit(
  tr: import("@tiptap/pm/state").Transaction,
  boundary: number,
  headLines: number,
): boolean {
  const pages = collectPages(tr.doc);
  const source = pages?.[boundary + 1];
  if (!pages || !source) return false;
  const block = source.node.childCount > 0 ? source.node.child(0) : null;
  if (!block || !isSplittableBlock(block)) return false;
  const text = block.textContent;
  const headLen = headTextLength(text, headLines);
  if (headLen <= 0 || headLen >= text.length) return false;
  const blockPos = source.pos + 1;
  const contentStart = blockPos + 1;
  const cutPos = contentStart + headLen;
  // The `\n` separating line k from k+1 is consumed by the cut (merging
  // restores it), so the tail starts clean at line k+1.
  if (text.charAt(headLen) !== "\n") return false;
  tr.delete(cutPos, cutPos + 1);
  tr.split(cutPos, 1, [
    {
      type: block.type,
      attrs: {
        ...block.attrs,
        [SPLIT_CONTINUATION_ATTR]: true,
        // Re-cutting a fragment that already continues (the middle of a
        // paragraph three or more pages cut) keeps its successor: the new
        // tail continues as the fragment did. Stamped "ends here", the tail
        // left the next fragment a continuation of nothing, which the head
        // integrity check then cleared -- and every save stored that piece as
        // a paragraph of its own.
        [SPLIT_CONTINUES_ATTR]: block.attrs?.[SPLIT_CONTINUES_ATTR] === true,
        // Whatever id the tail is given, it names the block it was cut from.
        [SPLIT_PIECE_OF_ATTR]: splitPieceRoot(block.attrs),
      },
    },
  ]);
  // Head keeps its own attrs (it may itself be a continuation tail of an
  // earlier cut) + the "continues" stamp for the seam chrome.
  tr.setNodeMarkup(blockPos, undefined, {
    ...block.attrs,
    [SPLIT_CONTINUES_ATTR]: true,
  });
  // The sheet now holds [head, tail, ...rest] — pull the head back across
  // the boundary with the standard whole-block move.
  const pageType = tr.doc.type.schema.nodes[PAGE_BLOCK_NODE];
  applyBoundaryMove(tr, pageType, boundary, -1);
  return tr.docChanged;
}

/**
 * Cut an OVERFLOWING splittable block that OPENS its sheet (taller than
 * the page): split in place after `headLines`, then push the new tail —
 * and every block after it — onto the next sheet. Exported for tests.
 */
export function applyOverflowSplit(
  tr: import("@tiptap/pm/state").Transaction,
  sheetIndex: number,
  headLines: number,
): boolean {
  const pages = collectPages(tr.doc);
  const sheet = pages?.[sheetIndex];
  if (!pages || !sheet) return false;
  const followerCount = sheet.node.childCount - 1;
  const block = sheet.node.childCount > 0 ? sheet.node.child(0) : null;
  if (!block || !isSplittableBlock(block)) return false;
  const text = block.textContent;
  const headLen = headTextLength(text, headLines);
  if (headLen <= 0 || headLen >= text.length) return false;
  if (text.charAt(headLen) !== "\n") return false;
  const blockPos = sheet.pos + 1;
  const cutPos = blockPos + 1 + headLen;
  tr.delete(cutPos, cutPos + 1);
  tr.split(cutPos, 1, [
    {
      type: block.type,
      attrs: {
        ...block.attrs,
        [SPLIT_CONTINUATION_ATTR]: true,
        // Re-cutting a fragment that already continues (the middle of a
        // paragraph three or more pages cut) keeps its successor: the new
        // tail continues as the fragment did. Stamped "ends here", the tail
        // left the next fragment a continuation of nothing, which the head
        // integrity check then cleared -- and every save stored that piece as
        // a paragraph of its own.
        [SPLIT_CONTINUES_ATTR]: block.attrs?.[SPLIT_CONTINUES_ATTR] === true,
        // Whatever id the tail is given, it names the block it was cut from.
        [SPLIT_PIECE_OF_ATTR]: splitPieceRoot(block.attrs),
      },
    },
  ]);
  tr.setNodeMarkup(blockPos, undefined, {
    ...block.attrs,
    [SPLIT_CONTINUES_ATTR]: true,
  });
  const pageType = tr.doc.type.schema.nodes[PAGE_BLOCK_NODE];
  // Tail + every follower cross the boundary: keep = 1 (just the head).
  applyBoundaryMove(tr, pageType, sheetIndex, followerCount + 1);
  return tr.docChanged;
}

/**
 * Split one code block at an IN-SHEET unequal-column boundary. Unlike a page
 * overflow split, both editable siblings remain in the same pageBlock; the
 * runtime projector places the continuation at the next exact track. Save and
 * export still merge the generic continuation attrs back into one code block.
 */
export function applyCodeBlockColumnSplit(
  tr: import("@tiptap/pm/state").Transaction,
  sheetIndex: number,
  childIndex: number,
  headLines: number,
): boolean {
  const sheet = collectPages(tr.doc)?.[sheetIndex];
  if (!sheet || childIndex < 0 || childIndex >= sheet.node.childCount) {
    return false;
  }
  let blockPos = sheet.pos + 1;
  for (let index = 0; index < childIndex; index += 1) {
    blockPos += sheet.node.child(index).nodeSize;
  }
  const block = sheet.node.child(childIndex);
  if (!isSplittableBlock(block)) return false;
  const text = block.textContent;
  const headLen = headTextLength(text, headLines);
  if (headLen <= 0 || headLen >= text.length || text.charAt(headLen) !== "\n") {
    return false;
  }
  const cutPos = blockPos + 1 + headLen;
  tr.delete(cutPos, cutPos + 1);
  tr.split(cutPos, 1, [
    {
      type: block.type,
      attrs: {
        ...block.attrs,
        [SPLIT_CONTINUATION_ATTR]: true,
        // Re-cutting a fragment that already continues (the middle of a
        // paragraph three or more pages cut) keeps its successor: the new
        // tail continues as the fragment did. Stamped "ends here", the tail
        // left the next fragment a continuation of nothing, which the head
        // integrity check then cleared -- and every save stored that piece as
        // a paragraph of its own.
        [SPLIT_CONTINUES_ATTR]: block.attrs?.[SPLIT_CONTINUES_ATTR] === true,
        // Whatever id the tail is given, it names the block it was cut from.
        [SPLIT_PIECE_OF_ATTR]: splitPieceRoot(block.attrs),
      },
    },
  ]);
  tr.setNodeMarkup(blockPos, undefined, {
    ...block.attrs,
    [SPLIT_CONTINUES_ATTR]: true,
  });
  return tr.docChanged;
}

/**
 * Merge a continuation tail back into its head (head = the block right
 * before it in reading order). Restores the `\n` the cut consumed; the
 * merged block keeps the head's own attrs, inheriting the tail's
 * "continues" stamp for chained cuts. Exported for tests.
 */
export function applyContinuationMerge(
  tr: import("@tiptap/pm/state").Transaction,
  headPos: number,
  tailPos: number,
): boolean {
  const head = tr.doc.nodeAt(headPos);
  const tail = tr.doc.nodeAt(tailPos);
  if (!head || !tail || tailPos <= headPos) return false;
  if (!isContinuationTail(tail) || head.type.name !== tail.type.name) {
    return false;
  }
  const tailContent = tail.content;
  const tailContinues = tail.attrs?.[SPLIT_CONTINUES_ATTR] === true;
  const mergedAttrs = { ...head.attrs, [SPLIT_CONTINUES_ATTR]: tailContinues };
  // Preferred: JOIN the pair (and, across a sheet boundary, the two sheets
  // around it, re-cutting after the merged block), so no content is deleted
  // and the undo history keeps mapping through the merge (see
  // applyBoundaryMoveBySheetCuts).
  const headEnd0 = headPos + head.nodeSize;
  const $headAt = tr.doc.resolve(headPos);
  const $tailAt = tr.doc.resolve(tailPos);
  const sameParentAdjacent = $headAt.parent === $tailAt.parent && headEnd0 === tailPos;
  const acrossSheets =
    $headAt.depth === 1 &&
    $tailAt.depth === 1 &&
    $headAt.parent.type.name === PAGE_BLOCK_NODE &&
    $tailAt.parent.type.name === PAGE_BLOCK_NODE &&
    $headAt.index(0) + 1 === $tailAt.index(0) &&
    $headAt.index(1) === $headAt.parent.childCount - 1 &&
    $tailAt.index(1) === 0;
  if (sameParentAdjacent || acrossSheets) {
    const restOfTailSheet = acrossSheets ? $tailAt.parent.childCount - 1 : 0;
    if (acrossSheets) tr.join(headEnd0 + 1);
    joinPieces(tr, headEnd0);
    if (head.type.name === "codeBlock" && tailContent.size > 0) {
      tr.insert(headEnd0 - 1, tr.doc.type.schema.text("\n"));
    }
    tr.setNodeMarkup(headPos, undefined, mergedAttrs);
    if (restOfTailSheet > 0) {
      const merged = tr.doc.nodeAt(headPos);
      if (merged) tr.split(headPos + merged.nodeSize, 1);
    }
    return tr.docChanged;
  }
  // Delete the tail first (it sits after the head, so the head's
  // positions are unaffected), then append at the head's end. A tail
  // that is its sheet's ONLY block takes the sheet with it — an empty
  // pageBlock violates the schema (`block+`).
  const $tail = tr.doc.resolve(tailPos);
  const tailParent = $tail.parent;
  if (tailParent.type.name === PAGE_BLOCK_NODE && tailParent.childCount === 1) {
    const parentPos = $tail.before($tail.depth);
    tr.delete(parentPos, parentPos + tailParent.nodeSize);
  } else {
    tr.delete(tailPos, tailPos + tail.nodeSize);
  }
  const headEnd = headPos + head.nodeSize - 1;
  if (tailContent.size > 0) {
    const schema = tr.doc.type.schema;
    tr.insert(headEnd, tailContent);
    // Code lines re-join over the newline the cut consumed; a paragraph
    // cut at a soft-wrap boundary re-joins by plain concatenation.
    if (head.type.name === "codeBlock") {
      tr.insert(headEnd, schema.text("\n"));
    }
  }
  tr.setNodeMarkup(headPos, undefined, {
    ...head.attrs,
    [SPLIT_CONTINUES_ATTR]: tailContinues,
  });
  return tr.docChanged;
}

/**
 * Split the paragraph OPENING sheet `boundary + 1` at `cutPos` and pull
 * the head back onto sheet `boundary`. Exported for tests (which pass an
 * explicit cutPos — jsdom has no layout for the probe).
 */
export function applyTextBlockSplit(
  tr: import("@tiptap/pm/state").Transaction,
  boundary: number,
  cutPos: number,
  



  options: { forceOversizedKeepLinesSplit?: boolean } = {},
): boolean {
  const pages = collectPages(tr.doc);
  const source = pages?.[boundary + 1];
  if (!pages || !source) return false;
  const block = source.node.childCount > 0 ? source.node.child(0) : null;
  const maySplit =
    block &&
    (isTextSplittableBlock(block) ||
      (options.forceOversizedKeepLinesSplit === true &&
        isTextSplitCapableTypeName(block.type.name)));
  if (!block || !maySplit) return false;
  const blockPos = source.pos + 1;
  if (cutPos <= blockPos + 1 || cutPos >= blockPos + block.nodeSize - 1) {
    return false;
  }
  tr.split(cutPos, 1, [
    {
      type: block.type,
      attrs: {
        ...block.attrs,
        // The tail is a runtime projection of the same logical heading, not a
        // second navigation target. The head retains the stable identities;
        // serialization merges the tail content back into it.
        ...(block.type.name === "heading"
          ? { anchor_id: null, toc_anchor_id: null }
          : {}),
        [SPLIT_CONTINUATION_ATTR]: true,
        // Re-cutting a fragment that already continues (the middle of a
        // paragraph three or more pages cut) keeps its successor: the new
        // tail continues as the fragment did. Stamped "ends here", the tail
        // left the next fragment a continuation of nothing, which the head
        // integrity check then cleared -- and every save stored that piece as
        // a paragraph of its own.
        [SPLIT_CONTINUES_ATTR]: block.attrs?.[SPLIT_CONTINUES_ATTR] === true,
        // Whatever id the tail is given, it names the block it was cut from.
        [SPLIT_PIECE_OF_ATTR]: splitPieceRoot(block.attrs),
      },
    },
  ]);
  tr.setNodeMarkup(blockPos, undefined, {
    ...block.attrs,
    [SPLIT_CONTINUES_ATTR]: true,
  });
  const pageType = tr.doc.type.schema.nodes[PAGE_BLOCK_NODE];
  applyBoundaryMove(tr, pageType, boundary, -1);
  return tr.docChanged;
}

/**
 * Cut an OVERFLOWING paragraph that OPENS its sheet at `cutPos`; the
 * tail — and every follower — moves to the next sheet. Exported for
 * tests.
 */
export function applyTextBlockOverflowSplit(
  tr: import("@tiptap/pm/state").Transaction,
  sheetIndex: number,
  cutPos: number,
  options: { forceOversizedKeepLinesSplit?: boolean } = {},
): boolean {
  const pages = collectPages(tr.doc);
  const sheet = pages?.[sheetIndex];
  if (!pages || !sheet) return false;
  const followerCount = sheet.node.childCount - 1;
  const block = sheet.node.childCount > 0 ? sheet.node.child(0) : null;
  const maySplit =
    block &&
    (isTextSplittableBlock(block) ||
      (options.forceOversizedKeepLinesSplit === true &&
        isTextSplitCapableTypeName(block.type.name)));
  if (!block || !maySplit) return false;
  const blockPos = sheet.pos + 1;
  if (cutPos <= blockPos + 1 || cutPos >= blockPos + block.nodeSize - 1) {
    return false;
  }
  tr.split(cutPos, 1, [
    {
      type: block.type,
      attrs: {
        ...block.attrs,
        ...(block.type.name === "heading"
          ? { anchor_id: null, toc_anchor_id: null }
          : {}),
        [SPLIT_CONTINUATION_ATTR]: true,
        // Re-cutting a fragment that already continues (the middle of a
        // paragraph three or more pages cut) keeps its successor: the new
        // tail continues as the fragment did. Stamped "ends here", the tail
        // left the next fragment a continuation of nothing, which the head
        // integrity check then cleared -- and every save stored that piece as
        // a paragraph of its own.
        [SPLIT_CONTINUES_ATTR]: block.attrs?.[SPLIT_CONTINUES_ATTR] === true,
        // Whatever id the tail is given, it names the block it was cut from.
        [SPLIT_PIECE_OF_ATTR]: splitPieceRoot(block.attrs),
      },
    },
  ]);
  tr.setNodeMarkup(blockPos, undefined, {
    ...block.attrs,
    [SPLIT_CONTINUES_ATTR]: true,
  });
  const pageType = tr.doc.type.schema.nodes[PAGE_BLOCK_NODE];
  applyBoundaryMove(tr, pageType, sheetIndex, followerCount + 1);
  return tr.docChanged;
}

/** Materialize a paragraph/heading seam between two unequal tracks in one page. */
export function applyTextBlockColumnSplit(
  tr: import("@tiptap/pm/state").Transaction,
  sheetIndex: number,
  childIndex: number,
  cutPos: number,
): boolean {
  const sheet = collectPages(tr.doc)?.[sheetIndex];
  if (!sheet || childIndex < 0 || childIndex >= sheet.node.childCount) {
    return false;
  }
  let blockPos = sheet.pos + 1;
  for (let index = 0; index < childIndex; index += 1) {
    blockPos += sheet.node.child(index).nodeSize;
  }
  const block = sheet.node.child(childIndex);
  if (!isTextSplittableBlock(block)) return false;
  if (cutPos <= blockPos + 1 || cutPos >= blockPos + block.nodeSize - 1) {
    return false;
  }
  tr.split(cutPos, 1, [
    {
      type: block.type,
      attrs: {
        ...block.attrs,
        ...(block.type.name === "heading"
          ? { anchor_id: null, toc_anchor_id: null }
          : {}),
        [SPLIT_CONTINUATION_ATTR]: true,
        // Re-cutting a fragment that already continues (the middle of a
        // paragraph three or more pages cut) keeps its successor: the new
        // tail continues as the fragment did. Stamped "ends here", the tail
        // left the next fragment a continuation of nothing, which the head
        // integrity check then cleared -- and every save stored that piece as
        // a paragraph of its own.
        [SPLIT_CONTINUES_ATTR]: block.attrs?.[SPLIT_CONTINUES_ATTR] === true,
        // Whatever id the tail is given, it names the block it was cut from.
        [SPLIT_PIECE_OF_ATTR]: splitPieceRoot(block.attrs),
      },
    },
  ]);
  tr.setNodeMarkup(blockPos, undefined, {
    ...block.attrs,
    [SPLIT_CONTINUES_ATTR]: true,
  });
  return tr.docChanged;
}

// ---------------------------------------------------------------------------
// Word-style table fragmentation. A physical table fragment remains editable
// on every page, while serialization collapses the shared fragment id back to
// one semantic table (and one native <w:tbl>).
// ---------------------------------------------------------------------------

let nextTableFragmentOrdinal = 1;

function tableFragmentId(node: PmNode, doc: PmNode): string {
  const existing = node.attrs?.[TABLE_FRAGMENT_ID_ATTR];
  if (typeof existing === "string" && existing.length > 0) return existing;
  // Restored projections may already own ids from a previous editor mount.
  const occupied = new Set<string>();
  doc.descendants(child => {
    const id = child.attrs?.[TABLE_FRAGMENT_ID_ATTR];
    if (typeof id === "string" && id.length > 0) occupied.add(id);
  });
  let candidate: string;
  do { candidate = `table-page-fragment-${nextTableFragmentOrdinal++}`; }
  while (occupied.has(candidate));
  return candidate;
}

function materializeTablePair(
  doc: PmNode,
  table: PmNode,
  plan: TablePageCut,
  cuts: ReadonlyArray<TableCellTextCut>,
): TableFragmentPair | null {
  if (table.type.name !== "table") return null;
  const json = table.toJSON() as TableJsonNode;
  const fragmentId = tableFragmentId(table, doc);
  if (plan.kind === "betweenRows") {
    return fragmentTableAtRowBoundary(json, plan.cutBeforeRow, fragmentId, {
      repeatHeaderRows: plan.repeatHeaderRows,
    });
  }
  if (plan.kind !== "withinRow") return null;
  return fragmentTableWithinRow(json, plan.rowIndex, cuts, fragmentId, {
    repeatHeaderRows: plan.repeatHeaderRows,
  });
}

/** The head and tail fragments a planned cut leaves of `table` (the cut
 * applied to the node alone, as `applyTableBoundarySplit` applies it on a
 * page), for a table the page plan reaches inside a list item. */
export function tableFragmentPair(
  doc: PmNode,
  table: PmNode,
  plan: TablePageCut,
  cuts: ReadonlyArray<TableCellTextCut>,
): { head: PmNode; tail: PmNode } | null {
  return pmTablePair(doc, table, plan, cuts);
}

function pmTablePair(
  doc: PmNode,
  table: PmNode,
  plan: TablePageCut,
  cuts: ReadonlyArray<TableCellTextCut>,
): { head: PmNode; tail: PmNode } | null {
  const pair = materializeTablePair(doc, table, plan, cuts);
  if (!pair) return null;
  try {
    const [head,tail] = reconcileTableNodeIdentities([
      table.type.schema.nodeFromJSON(pair.head),table.type.schema.nodeFromJSON(pair.tail),
    ],[table]);
    // nodeFromJSON intentionally accepts unchecked content. A character cut
    // through a nested table can therefore materialise an empty/partial table
    // that only throws later when the Block ID plugin updates its attributes.
    // Derived pagination may never dispatch such a projection: validate the
    // complete physical pair here, while the original semantic table is still
    // untouched and the caller can choose one bounded overflow fallback.
    head.check();
    tail.check();
    return { head, tail };
  } catch {
    // Schema refusal is a hard safety boundary: never replace a valid table
    // with an approximate or partially fitted projection.
    return null;
  }
}

interface MovedTableTextSelection extends MovedTextSelection {
  anchorAtStart: boolean;
  headAtStart: boolean;
  anchorCell?: TableCaret | null;
  headCell?: TableCaret | null;
  /** False when the caret has no text offset (an empty cell paragraph). */
  textOffsetsKnown?: boolean;
}

/**
 * A caret in a table as its cell (source row and grid column, the identities
 * the fragments stamp) and its paragraph there (ordinal, a paragraph cut at a
 * row seam counting once) with the content offset. A plain-text offset has
 * no position in an empty cell, and it read the end of one cell as the start
 * of the next: a caret in the empty cell of a row the page pushed on landed
 * in its neighbour, and the next keys typed (or deleted) text there.
 */
interface TableCaret {
  row: number;
  col: number;
  block: number;
  offset: number;
}

function walkTableTextblocks(
  doc: PmNode,
  isFragment: (table: PmNode, pos: number) => boolean,
  visit: (textblock: PmNode, contentStart: number, caret: TableCaret) => boolean,
): void {
  const cells = new Map<string, { block: number; base: number }>();
  let stopped = false;
  doc.descendants((table, tablePos) => {
    if (stopped) return false;
    if (table.type.name !== "table" || !isFragment(table, tablePos)) return true;
    let map: TableMap | null = null;
    try {
      map = TableMap.get(table);
    } catch {
      map = null;
    }
    table.forEach((row, rowOffset, rowIndex) => {
      if (stopped || row.attrs?.[TABLE_REPEATED_HEADER_ATTR] === true) return;
      const statedRow = row.attrs?.[TABLE_SOURCE_ROW_ATTR];
      const sourceRow = Number.isInteger(statedRow) ? (statedRow as number) : rowIndex;
      row.forEach((cell, cellOffset, cellIndex) => {
        if (stopped) return;
        const statedCol = cell.attrs?.[TABLE_SOURCE_CELL_COL_ATTR];
        let col = cellIndex;
        if (Number.isInteger(statedCol)) col = statedCol as number;
        else if (map) {
          try {
            col = map.findCell(rowOffset + 1 + cellOffset).left;
          } catch {
            col = cellIndex;
          }
        }
        const key = `${sourceRow}:${col}`;
        const state = cells.get(key) ?? { block: -1, base: 0 };
        cells.set(key, state);
        const cellStart = tablePos + 1 + rowOffset + 1 + cellOffset;
        cell.descendants((child, childPos) => {
          if (stopped) return false;
          if (!child.isTextblock) return true;
          // Blank placeholders stand in for a side of the cut cell that holds nothing.
          if (child.attrs?.[TABLE_CELL_EMPTY_HEAD_ATTR] === true || child.attrs?.[TABLE_CELL_EMPTY_TAIL_ATTR] === true) return false;
          if (!(child.attrs?.[TABLE_BLOCK_CONTINUATION_ATTR] === true && state.block >= 0)) {
            state.block += 1;
            state.base = 0;
          }
          stopped = visit(child, cellStart + 1 + childPos + 1, { row: sourceRow, col, block: state.block, offset: state.base });
          state.base += child.content.size;
          return false;
        });
      });
    });
    return false;
  });
}

function tableCaretAt(
  doc: PmNode,
  isFragment: (table: PmNode, pos: number) => boolean,
  position: number,
): TableCaret | null {
  let found: TableCaret | null = null;
  walkTableTextblocks(doc, isFragment, (textblock, start, caret) => {
    if (position < start || position > start + textblock.content.size) return false;
    found = { ...caret, offset: caret.offset + position - start };
    return true;
  });
  return found;
}

function positionOfTableCaret(
  doc: PmNode,
  fragmentId: string,
  target: TableCaret,
): number | null {
  let position: number | null = null;
  let endOfBlock: number | null = null;
  walkTableTextblocks(
    doc,
    (table) => table.attrs?.[TABLE_FRAGMENT_ID_ATTR] === fragmentId,
    (textblock, start, caret) => {
      if (caret.row !== target.row || caret.col !== target.col || caret.block !== target.block) return false;
      const local = target.offset - caret.offset;
      if (local <= textblock.content.size) {
        position = start + Math.max(0, local);
        return true;
      }
      endOfBlock = start + textblock.content.size;
      return false;
    },
  );
  return position ?? endOfBlock;
}

export function captureTableTextSelection(
  tr: import("@tiptap/pm/state").Transaction,
  node: PmNode,
  nodePos: number,
): MovedTableTextSelection | null {
  if (!(tr.selection instanceof TextSelection)) return null;
  const fragmentId = node.attrs?.[TABLE_FRAGMENT_ID_ATTR];
  let offset = 0;
  let anchorOffset: number | null = null;
  let headOffset: number | null = null;
  // Capture in the same semantic stream that restore traverses. A local tail
  // offset includes its cloned header and omits preceding physical fragments.
  tr.doc.descendants((table, pos) => {
    if (table.type.name !== "table") return true;
    if (fragmentId ? table.attrs?.[TABLE_FRAGMENT_ID_ATTR] !== fragmentId : pos !== nodePos) return true;
    table.descendants((child, relativePos) => {
      if (child.type.name === "tableRow" && child.attrs?.[TABLE_REPEATED_HEADER_ATTR] === true) return false;
      if (!child.isText) return true;
      const start = pos + 1 + relativePos;
      const length = child.text?.length ?? 0;
      if (tr.selection.anchor >= start && tr.selection.anchor <= start + length) anchorOffset = offset + tr.selection.anchor - start;
      if (tr.selection.head >= start && tr.selection.head <= start + length) headOffset = offset + tr.selection.head - start;
      offset += length;
      return false;
    });
    return false;
  });
  const isFragment = (table: PmNode, pos: number) =>
    fragmentId ? table.attrs?.[TABLE_FRAGMENT_ID_ATTR] === fragmentId : pos === nodePos;
  const anchorCell = tableCaretAt(tr.doc, isFragment, tr.selection.anchor);
  const headCell = tableCaretAt(tr.doc, isFragment, tr.selection.head);
  if ((anchorOffset === null || headOffset === null) && (!anchorCell || !headCell)) return null;
  return {
    anchorOffset: anchorOffset ?? 0, headOffset: headOffset ?? 0,
    anchorAtStart: tr.selection.$anchor.parentOffset === 0,
    headAtStart: tr.selection.$head.parentOffset === 0,
    anchorCell, headCell,
    textOffsetsKnown: anchorOffset !== null && headOffset !== null,
  };
}

/**
 * A ProseMirror ReplaceStep maps a cursor in a moved table tail to the start
 * of the replacement (often the repeated header). Capture a semantic text
 * offset before replacement and resolve it across the physical fragments,
 * excluding read-only repeated rows, so native focus/scroll never follows a
 * bogus mapped selection.
 */
export function restoreTableTextSelection(
  tr: import("@tiptap/pm/state").Transaction,
  fragmentId: string,
  selection: MovedTableTextSelection | null,
): void {
  const current = tr.selection;
  const anchorAt = selection?.anchorCell ? positionOfTableCaret(tr.doc, fragmentId, selection.anchorCell) : null;
  const headAt = selection?.headCell ? positionOfTableCaret(tr.doc, fragmentId, selection.headCell) : null;
  if (
    anchorAt !== null && headAt !== null &&
    tr.doc.resolve(anchorAt).parent.inlineContent && tr.doc.resolve(headAt).parent.inlineContent
  ) {
    tr.setSelection(TextSelection.create(tr.doc, anchorAt, headAt));
    return;
  }
  if (!selection || selection.textOffsetsKnown === false) {
    if (
      current instanceof TextSelection &&
      (!current.$anchor.parent.inlineContent ||
        !current.$head.parent.inlineContent)
    ) {
      tr.setSelection(
        selectionNearInlineContent(
          tr.doc,
          current.head,
          current.head >= current.anchor ? 1 : -1,
        ),
      );
    }
    return;
  }
  const resolveOffset = (textOffset: number, preferNextText: boolean): number | null => {
    let remaining = textOffset;
    let target: number | null = null;
    tr.doc.descendants((node, pos) => {
      if (target !== null) return false;
      if (
        node.type.name !== "table" ||
        node.attrs?.[TABLE_FRAGMENT_ID_ATTR] !== fragmentId
      ) {
        return true;
      }
      node.descendants((child, relativePos) => {
        if (target !== null) return false;
        if (
          child.type.name === "tableRow" &&
          child.attrs?.[TABLE_REPEATED_HEADER_ATTR] === true
        ) {
          return false;
        }
        if (!child.isText) return true;
        const length = child.text?.length ?? 0;
        if (remaining < length || (remaining === length && !preferNextText)) {
          target = pos + 1 + relativePos + remaining;
          return false;
        }
        remaining -= length;
        return false;
      });
      return false;
    });
    return target;
  };
  const requestedAnchor = resolveOffset(selection.anchorOffset, selection.anchorAtStart);
  const requestedHead = resolveOffset(selection.headOffset, selection.headAtStart);
  if (requestedAnchor === null || requestedHead === null) {
    tr.setSelection(
      selectionNearInlineContent(
        tr.doc,
        requestedHead ?? requestedAnchor ?? current.head,
        selection.headOffset >= selection.anchorOffset ? 1 : -1,
      ),
    );
    return;
  }
  const anchorInline = tr.doc.resolve(requestedAnchor).parent.inlineContent;
  const headInline = tr.doc.resolve(requestedHead).parent.inlineContent;
  if (anchorInline && headInline) {
    tr.setSelection(TextSelection.create(tr.doc, requestedAnchor, requestedHead));
    return;
  }
  const forward = requestedHead >= requestedAnchor;
  const safeAnchor = selectionNearInlineContent(
    tr.doc,
    requestedAnchor,
    forward ? 1 : -1,
  );
  const safeHead = selectionNearInlineContent(
    tr.doc,
    requestedHead,
    requestedAnchor === requestedHead ? 1 : forward ? -1 : 1,
  );
  if (
    safeAnchor instanceof TextSelection &&
    safeHead instanceof TextSelection
  ) {
    tr.setSelection(
      TextSelection.create(tr.doc, safeAnchor.head, safeHead.head),
    );
  } else {
    tr.setSelection(safeHead);
  }
}

/** Split the next sheet's opening table and pull its physical head backward. */
export function applyTableBoundarySplit(
  tr: import("@tiptap/pm/state").Transaction,
  boundary: number,
  plan: TablePageCut,
  cuts: ReadonlyArray<TableCellTextCut> = [],
  requireMergedHead = false,
): boolean {
  const pages = collectPages(tr.doc);
  const target = pages?.[boundary];
  const source = pages?.[boundary + 1];
  if (!pages || !target || !source || source.node.childCount === 0)
    return false;
  const table = source.node.child(0);
  const pair = pmTablePair(tr.doc, table, plan, cuts);
  if (!pair) return false;
  const tablePos = source.pos + 1;
  const selection = captureTableTextSelection(tr, table, tablePos);
  const fragmentId = String(pair.head.attrs?.[TABLE_FRAGMENT_ID_ATTR] ?? "");
  const targetEnd = target.pos + 1 + target.node.content.size;
  const previous = target.node.lastChild;
  const canReplaceTargetSelection = selection !== null || !previous ||
    [tr.selection.anchor, tr.selection.head].every(pos => pos < targetEnd - previous.nodeSize || pos > targetEnd);
  const mergedJson = previous ? mergeAdjacentTableFragmentsJson(
    previous.toJSON() as TableJsonNode, pair.head.toJSON() as TableJsonNode,
  ) : null;
  let merged: PmNode | null = null;
  if (mergedJson && canReplaceTargetSelection) {
    try {
      [merged] = reconcileTableNodeIdentities([table.type.schema.nodeFromJSON(mergedJson)],[previous!,pair.head]);
      merged.check();
    } catch { merged = null; }
  }
  if (requireMergedHead && !merged) return false;
  tr.replaceWith(tablePos, tablePos + table.nodeSize, pair.tail);
  if (merged && previous) tr.replaceWith(targetEnd - previous.nodeSize, targetEnd, merged);
  else tr.insert(targetEnd, pair.head);
  restoreTableTextSelection(tr, fragmentId, selection);
  return tr.docChanged;
}

/** Collapse adjacent complete-row continuations after whole-block page moves.
 * Work backwards so earlier table positions remain valid throughout the pass. */
export function applyAdjacentTableContinuationMerges(
  tr: import("@tiptap/pm/state").Transaction,
  singleColumnPages: ReadonlySet<number>,
): boolean {
  const pages = collectPages(tr.doc);
  if (!pages) return false;
  let changed = false;
  for (let pageIndex = pages.length - 1; pageIndex >= 0; pageIndex--) {
    // Unequal column tracks also use table fragments inside one page. Their
    // boundary remains physical, so only measured single-column sheets join.
    if (!singleColumnPages.has(pageIndex)) continue;
    const page = pages[pageIndex];
    let leftPos = page.pos + 1 + page.node.content.size;
    for (let index = page.node.childCount - 1; index > 0; index--) {
      leftPos -= page.node.child(index).nodeSize;
      const previousPos = leftPos - page.node.child(index - 1).nodeSize;
      const left = tr.doc.nodeAt(previousPos);
      const right = tr.doc.nodeAt(leftPos);
      if (!left || !right) continue;
      const json = mergeAdjacentTableFragmentsJson(left.toJSON() as TableJsonNode, right.toJSON() as TableJsonNode);
      if (!json) continue;
      const fragmentId = json.attrs?.[TABLE_FRAGMENT_ID_ATTR];
      let hasPredecessor = false;
      let hasSuccessor = false;
      // Legacy re-splits also reset role flags. Consult the actual physical
      // chain using its existing custody ID, never similar text/source rows.
      tr.doc.descendants((table, pos) => {
        if (table.type.name !== "table" || table.attrs[TABLE_FRAGMENT_ID_ATTR] !== fragmentId) return true;
        if (pos < previousPos) hasPredecessor = true;
        if (pos >= leftPos + right.nodeSize) hasSuccessor = true;
        return false;
      });
      json.attrs = {
        ...json.attrs,
        [TABLE_CONTINUATION_ATTR]: hasPredecessor,
        [TABLE_CONTINUES_ATTR]: hasSuccessor,
      };
      let merged: PmNode;
      try {
        [merged] = reconcileTableNodeIdentities([left.type.schema.nodeFromJSON(json)],[left,right]);
        merged.check();
      } catch { continue; }
      const selection = captureTableTextSelection(tr, left, previousPos);
      // Preserve cell/node selections and selections ending outside this
      // logical table until they have a dedicated semantic bookmark.
      if (!selection && [tr.selection.anchor, tr.selection.head].some(
        pos => pos >= previousPos && pos <= leftPos + right.nodeSize,
      )) continue;
      tr.replaceWith(previousPos, leftPos + right.nodeSize, merged);
      restoreTableTextSelection(tr, String(merged.attrs[TABLE_FRAGMENT_ID_ATTR]), selection);
      changed = true;
    }
  }
  return changed;
}

/** Materialize one table continuation between unequal tracks in one page. */
export function applyTableColumnSplit(
  tr: import("@tiptap/pm/state").Transaction,
  sheetIndex: number,
  childIndex: number,
  plan: TablePageCut,
  cuts: ReadonlyArray<TableCellTextCut> = [],
): boolean {
  const sheet = collectPages(tr.doc)?.[sheetIndex];
  if (!sheet || childIndex < 0 || childIndex >= sheet.node.childCount) {
    return false;
  }
  let tablePos = sheet.pos + 1;
  for (let index = 0; index < childIndex; index += 1) {
    tablePos += sheet.node.child(index).nodeSize;
  }
  const table = sheet.node.child(childIndex);
  const pair = pmTablePair(tr.doc, table, plan, cuts);
  if (!pair) return false;
  const selection = captureTableTextSelection(tr, table, tablePos);
  const fragmentId = String(pair.head.attrs?.[TABLE_FRAGMENT_ID_ATTR] ?? "");
  tr.replaceWith(
    tablePos,
    tablePos + table.nodeSize,
    Fragment.fromArray([pair.head, pair.tail]),
  );
  restoreTableTextSelection(tr, fragmentId, selection);
  return tr.docChanged;
}

/** Split an oversized opening table; its tail and all followers move on. */
export function applyTableOverflowSplit(
  tr: import("@tiptap/pm/state").Transaction,
  sheetIndex: number,
  plan: TablePageCut,
  cuts: ReadonlyArray<TableCellTextCut> = [],
): boolean {
  const pages = collectPages(tr.doc);
  const sheet = pages?.[sheetIndex];
  if (!pages || !sheet || sheet.node.childCount === 0) return false;
  const table = sheet.node.child(0);
  const pair = pmTablePair(tr.doc, table, plan, cuts);
  if (!pair) return false;
  const tablePos = sheet.pos + 1;
  const selection = captureTableTextSelection(tr, table, tablePos);
  const fragmentId = String(pair.head.attrs?.[TABLE_FRAGMENT_ID_ATTR] ?? "");
  const followerCount = sheet.node.childCount - 1;
  tr.replaceWith(
    tablePos,
    tablePos + table.nodeSize,
    Fragment.fromArray([pair.head, pair.tail]),
  );
  const pageType = tr.doc.type.schema.nodes[PAGE_BLOCK_NODE];
  if (!pageType) return false;
  applyBoundaryMove(tr, pageType, sheetIndex, followerCount + 1);
  restoreTableTextSelection(tr, fragmentId, selection);
  return tr.docChanged;
}

interface PlannedTableFragment {
  plan: TablePageCut;
  cuts: TableCellTextCut[];
  /** The measured rows the head keeps whole: those before the cut row (a
   * between-rows cut) or before the row cut through (within a row), px. */
  headRowsPx?: number;
  /** A cut within a row: what each cell carries on (absent when a cell's cut
   * cannot be read that way, a list or a nested table in it). */
  tails?: readonly TableCellTail[];
}

/** What a cut within a row leaves of one cell, read from the whole row's
 * layout: the plan goes on past the cut with no layout of the piece. */
export interface TableCellTail {
  sourceCol: number;
  /** The cell's block and character the rest starts at. */
  blockIndex: number;
  textOffset: number;
  /** Where the rest's first line stands in the row as laid out, px from the
   * row's top. */
  topPx: number;
  /** The piece of the cell the rest draws, its padding and borders included. */
  heightPx: number;
  /** All of the cell stayed above the cut: the rest is one blank line. */
  done: boolean;
}

export function renderedTableElement(dom: HTMLElement): HTMLElement | null {
  if (dom.tagName === "TABLE") return dom;
  return dom.querySelector<HTMLElement>("table");
}

function renderedTableRows(table: HTMLElement): HTMLElement[] {
  if (table instanceof HTMLTableElement) {
    return Array.from(table.rows);
  }
  return Array.from(table.querySelectorAll<HTMLElement>("tr"));
}

function renderedRowCells(row: HTMLElement): HTMLElement[] {
  if (row instanceof HTMLTableRowElement) return Array.from(row.cells);
  return Array.from(row.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement &&
      (child.tagName === "TD" || child.tagName === "TH"),
  );
}

function positiveElementHeight(element: HTMLElement, scale?: PaginationScale): number {
  const rectHeight = paginationLayoutRect(element, scale).height;
  return rectHeight > 0 ? rectHeight : element.offsetHeight;
}

/** Whether a row stands at its "at least" height (`w:trHeight`, not exact)
 * with every cell's content shorter than that: its height is the floor's,
 * not its lines'. A page piece of a split row draws no floor and is never
 * held by one. */
/** Harness switch (`window.__docsRowFloorMarginsOff = true`): an "At least"
 * row's floor is its stated height alone, its cells' margins inside it (A/B). */
function rowFloorMarginsOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsRowFloorMarginsOff?: boolean }).__docsRowFloorMarginsOff === true;
}

/**
 * The least an "At least" row stands where it starts: its stated height plus
 * its cells' top and bottom margins and the line across its top, as Word lays
 * the row (tableBorders atLeastRowRuleDecorations). Its head piece holds
 * that much or the row moves whole: Windows Word moves a 260-twip row of
 * 100-twip margins with 19.5pt left (23pt it needs; corpus R417-D03 page 35,
 * "Plastic/poly-bags for seed storage", one line of it cut onto the page
 * here), and a 600-twip row with 30pt left (tables/probes/rest r3). The row
 * measured whole carries that extra (`data-row-height-rule-extra`); a head
 * piece does not, and reads its cells' padding instead.
 */
export function rowFloorPx(row: HTMLElement, rowNode: PmNode, declared: number): number {
  const twips = Number(rowNode.attrs?.rowHeightTwips);
  const stated = twips > 0 ? twips / 15 : declared;
  if (rowFloorMarginsOff()) return declared;
  const decorated = Number.parseFloat(row.getAttribute("data-row-height-rule-extra") ?? "");
  if (Number.isFinite(decorated) && decorated >= 0) return stated + decorated;
  let top = 0;
  let bottom = 0;
  for (const cell of renderedRowCells(row)) {
    const style = getComputedStyle(cell);
    top = Math.max(top, cssPx(style.paddingTop));
    bottom = Math.max(bottom, cssPx(style.paddingBottom));
  }
  return stated + top + bottom;
}

function rowHeldByFloor(row: HTMLElement, rowNode: PmNode, heightPx: number, scale?: PaginationScale): boolean {
  const floor = Number(rowNode.attrs?.rowHeight);
  if (!(floor > 0) || rowNode.attrs?.rowHeightRule === "exact") return false;
  if (heightPx > floor + 1.5) return false;
  const rowRect = paginationLayoutRect(row, scale);
  let content = 0;
  for (const cell of renderedRowCells(row)) {
    const blocks = Array.from(cell.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement && !child.classList.contains("column-resize-handle"),
    );
    if (!blocks.length) continue;
    const style = getComputedStyle(cell);
    const first = paginationLayoutRect(blocks[0], scale);
    const last = paginationLayoutRect(blocks[blocks.length - 1], scale);
    const used =
      last.bottom - first.top + cssPx(style.paddingTop) + cssPx(style.paddingBottom) +
      cssPx(getComputedStyle(blocks[blocks.length - 1]).marginBottom) + cssPx(getComputedStyle(blocks[0]).marginTop);
    content = Math.max(content, used);
  }
  return content > 0 && content < rowRect.bottom - rowRect.top - 2;
}

/** Row-relative extents of the row's own cell paragraphs that keep their
 * lines together (not those of a table nested in a cell). */
function rowKeepLinesSpans(row: HTMLElement, scale?: PaginationScale): Array<readonly [number, number]> {
  const kept = row.querySelectorAll<HTMLElement>(
    ':is(p, h1, h2, h3, h4, h5, h6)[data-keep-lines="true"]',
  );
  if (!kept.length) return [];
  const top = paginationLayoutRect(row, scale).top;
  const spans: Array<readonly [number, number]> = [];
  for (const paragraph of kept) {
    if (paragraph.closest("tr") !== row) continue;
    const rect = paginationLayoutRect(paragraph, scale);
    spans.push([rect.top - top, rect.bottom - top] as const);
  }
  return spans;
}

/**
 * Row-relative [top, bottom] of each cell's first line: a row breaks only
 * when every cell's first line stays above the cut, else it moves whole
 * (Word 16.86, probes rowimg A/B/C on corpus R161-D24: twelve text lines
 * beside a cell that opens with a 192 pt picture move to the next page
 * whole with 60 pt left; with one text line above the same picture the row
 * breaks there and the picture goes on). Read only for a first line taller
 * than the smallest slice; a text line is one the cut never passes through.
 */
function rowFirstLineSpans(row: HTMLElement, scale?: PaginationScale): Array<readonly [number, number]> {
  const layoutScale = scale ?? paginationLayoutScale(row);
  const top = paginationLayoutRect(row, layoutScale).top;
  const spans: Array<readonly [number, number]> = [];
  for (const cell of row.querySelectorAll<HTMLElement>(":scope > td, :scope > th")) {
    const rects = cellLineBoxes(cell);
    if (!rects.length) continue;
    rects.sort((a, b) => a.top - b.top);
    // The first line: the topmost box and every box that starts beside it
    // (within half its height), a picture set on the line with its words
    // included. Chained by overlap, a paragraph whose text boxes are taller
    // than its line pitch (Calibri at 1.08 lines) ran on line to line: a
    // four-line cell read as one 72 px first line and moved its row whole
    // (corpus R87-D18, 5 pages for Word's 4).
    const first = rects[0];
    let lineTop = first.top;
    let lineBottom = first.bottom;
    for (const rect of rects) {
      if (rect.top >= first.top + first.height / 2) break;
      lineTop = Math.min(lineTop, rect.top);
      lineBottom = Math.max(lineBottom, rect.bottom);
    }
    const spanTop = lineTop / (layoutScale.y || 1) - top;
    const spanBottom = lineBottom / (layoutScale.y || 1) - top;
    if (spanBottom - spanTop > MIN_TABLE_ROW_SLICE_PX * 3) spans.push([spanTop, spanBottom] as const);
  }
  return spans;
}

/**
 * The boxes a cell's lines are made of: its words and its pictures. A range
 * over the whole cell also gives every element's own box -- a paragraph of
 * twenty lines, a nested table -- and the "first line" read from those was
 * the whole paragraph or table: every row holding one moved whole (gate
 * g90d: R85-D21 25 -> 29 pages, R87-D18 4 -> 5).
 */
function cellLineBoxes(cell: HTMLElement): DOMRect[] {
  const doc = cell.ownerDocument;
  const boxes: DOMRect[] = [];
  const range = doc.createRange();
  const walker = doc.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.nodeValue?.trim() || node.parentElement?.closest("svg")) continue;
    range.selectNodeContents(node);
    for (const rect of Array.from(range.getClientRects())) if (rect.width > 0 && rect.height > 0) boxes.push(rect);
  }
  range.detach?.();
  for (const picture of Array.from(cell.querySelectorAll("img, svg, canvas, video, object"))) {
    if (picture.parentElement?.closest("svg")) continue;
    const rect = picture.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) boxes.push(rect);
  }
  return boxes;
}

export function tableRowMeasurements(
  table: HTMLElement,
  node: PmNode,
): { rows: HTMLElement[]; measurements: TableRowMeasurement[] } | null {
  const rows = renderedTableRows(table);
  if (rows.length !== node.childCount || rows.length === 0) return null;
  const measurements: TableRowMeasurement[] = [];
  // Every row on one physical sheet shares its coordinate conversion. Read
  // it once for this synchronous measurement, never across a layout change.
  // Outside sheets, the helper's per-element fallback remains authoritative.
  const scale = table.closest("article[data-page-sheet]")
    ? paginationLayoutScale(table) : undefined;
  for (let index = 0; index < rows.length; index += 1) {
    const rowNode = node.child(index);
    if (rowNode.type.name !== "tableRow") return null;
    const heightPx = positiveElementHeight(rows[index], scale);
    // A row laid out with no height (cells holding only an empty paragraph
    // whose mark draws nothing) takes no room: it is measured, at 0. Only a
    // row the browser did not lay out leaves the table unmeasured. Refused,
    // the whole table was never cut and a row taller than the page ran off
    // it with everything after (corpus R282-D25: its second row 0px tall).
    if (!(heightPx > 0) && rows[index].getClientRects().length === 0) return null;
    const declared = Number(rowNode.attrs?.rowHeight);
    const exactHeight = declared > 0 && rowNode.attrs?.rowHeightRule === "exact";
    // The whole row's floor, on its head piece too: that piece draws none
    // (tableRowHeightAttributes), but a floor the space left cannot hold
    // still moves the row (R82-D18 RW17: a head cut under "above" stayed).
    const floorPx = declared > 0 && !exactHeight ? rowFloorPx(rows[index], rowNode, declared) : 0;
    const keepSpans = [...rowKeepLinesSpans(rows[index], scale), ...rowFirstLineSpans(rows[index], scale)];
    measurements.push({
      heightPx,
      headerRow: rowNode.attrs?.headerRow === true,
      ...(rowNode.attrs?.[TABLE_REPEATED_HEADER_ATTR] === true ? { repeatedHeader: true } : {}),
      cantSplit: rowNode.attrs?.cantSplit === true,
      ...(rowHeldByFloor(rows[index], rowNode, heightPx, scale) ? { floorHeld: true } : {}),
      ...(exactHeight ? { exactHeight: true } : {}),
      ...(floorPx > 0 ? { floorPx } : {}),
      ...(keepSpans.length ? { keepSpans } : {}),
      ...(paragraphKeepFlag(rowNode.firstChild?.firstChild, "keepNext") ? { keepWithNext: true } : {}),
    });
  }
  return { rows, measurements };
}

export function domTextCursor(
  root: HTMLElement,
  target: Text,
  targetOffset: number,
): { offset: number; total: number } | null {
  const filter = root.ownerDocument.defaultView?.NodeFilter;
  if (!filter) return null;
  // An inline atom (a field, a cross-reference) paints text the JSON does not
  // carry, and the character cut that asks for this cursor already walks past
  // it (`insideInlineAtom`). Counted here, it made the DOM longer than the
  // paragraph's text and every cut in that paragraph was refused, so a cell
  // paragraph taller than a page with one field in it never split and its
  // row ran on past the foot (corpus R03-D23: 33,000 characters and one
  // HYPERLINK field, 3 pages against Word's 16).
  const walker = root.ownerDocument.createTreeWalker(root, filter.SHOW_TEXT, {
    acceptNode: (node) => (insideInlineAtom(node, root) ? filter.FILTER_REJECT : filter.FILTER_ACCEPT),
  });
  let offset = 0;
  let cursorOffset: number | null = null;
  let current = walker.nextNode() as Text | null;
  while (current) {
    if (current === target) {
      cursorOffset =
        offset + Math.max(0, Math.min(targetOffset, current.length));
    }
    offset += current.length;
    current = walker.nextNode() as Text | null;
  }
  return cursorOffset === null ? null : { offset: cursorOffset, total: offset };
}

function tableCellSourceColumns(rowNode: PmNode): number[] {
  const columns: number[] = [];
  let column = 0;
  rowNode.forEach((cell) => {
    const stable = cell.attrs?.pageTableSourceCellCol;
    columns.push(
      typeof stable === "number" && Number.isInteger(stable) && stable >= 0
        ? stable
        : column,
    );
    const colspan = Math.max(1, Math.floor(Number(cell.attrs?.colspan) || 1));
    column += colspan;
  });
  return columns;
}

function tableCellBlockBoundary(
  cellNode: PmNode,
  blockIndex: number,
): TableCellTextCut["cut"] | null {
  if (blockIndex < 0 || blockIndex > cellNode.childCount) return null;
  if (blockIndex === 0) return { kind: "before" };
  if (blockIndex === cellNode.childCount) return { kind: "after" };
  // A cell may contain tables, pictures and captions, not just paragraphs.
  // Cutting between complete blocks preserves these objects without inventing
  // a text cursor inside the preceding non-text object.
  return { kind: "block", blockIndex };
}

const strutDescents = new Map<string, number>();

/** How far below an in-line block its line box ends: aligned to the line's
 * top, the strut's whole line height from the block's top (a picture's host
 * is, in a cell); on the baseline, the descent of the strut of the block
 * container it stands in. 0 for a block, or one aligned otherwise. */
function inlineBlockLineExtraPx(blockDom: HTMLElement, container: HTMLElement): number {
  const style = getComputedStyle(blockDom);
  if (!style.display.startsWith("inline")) return 0;
  const host = getComputedStyle(container);
  if (style.verticalAlign === "top") {
    const lineHeight = Number.parseFloat(host.lineHeight);
    const height = blockDom.getBoundingClientRect().height / paginationLayoutScale(blockDom).y;
    return Number.isFinite(lineHeight) && lineHeight > height ? lineHeight - height : 0;
  }
  if (style.verticalAlign !== "baseline") return 0;
  const font = `${host.fontStyle || "normal"} ${host.fontWeight || "400"} ${host.fontSize} ${host.fontFamily}`;
  const key = `${font}|${host.lineHeight}`;
  let descent = strutDescents.get(key);
  if (descent === undefined) {
    const box = measureOfficeFontLineBox(container.ownerDocument, { font, lineHeight: host.lineHeight, measureHeight: true });
    descent = box && Number.isFinite(box.baselinePx) && box.heightPx !== undefined
      ? Math.max(0, box.heightPx - box.baselinePx)
      : 0;
    if (strutDescents.size > 64) strutDescents.clear();
    strutDescents.set(key, descent);
  }
  return descent;
}

function cssPx(value: string | null | undefined): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/** One line of `blockDom`, as the blank stand-in a `before` cut leaves in the
 * head half would paint it: the block's own line pitch. */
function standInLinePx(blockDom: HTMLElement, blockHeightPx: number): number {
  const lines = measureTextLineBoxes(blockDom).length;
  if (lines > 0 && blockHeightPx > 0) return blockHeightPx / lines;
  return cssPx(getComputedStyle(blockDom).lineHeight);
}

/** Harness switch (`window.__docsCellFirstLineByAverage = true`): a cell's
 * first line is read as the block's height over its text lines, as before (A/B). */
function cellFirstLineByAverage(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsCellFirstLineByAverage?: boolean }).__docsCellFirstLineByAverage === true;
}

/**
 * The first line of a cell's first block as it stands: from the block's top to
 * where its second text line begins. Read as the block's height over its text
 * lines, a line that draws no text -- the empty line a break at the end of
 * "How long did it last? <w:br/>" leaves -- was shared out among the others:
 * four lines of 9.8 pt read as 13 pt each, and a row Word breaks with 22.25 pt
 * left moved whole up to 24 pt (probes tbl17 h5, R417 Shocks header row; Word
 * breaks it at 22.25 in groups D and I alike). One text line is the whole
 * block, as before.
 */
function cellFirstLinePx(blockDom: HTMLElement, blockHeightPx: number): number {
  if (!cellFirstLineByAverage()) {
    const lines = measureTextLineBoxes(blockDom);
    if (lines.length >= 2) {
      const pitch = lines[1].top - lines[0].top;
      if (pitch > 0 && pitch < blockHeightPx) return pitch;
    }
  }
  return standInLinePx(blockDom, blockHeightPx);
}

/**
 * How far below the top of its content box a cell aligned to its middle or
 * bottom now draws its first block; 0 for a top-aligned cell.
 *
 * Word aligns such a cell within the row's FIRST page segment, measured in
 * Word 16.86: in a row running over three pages, a bottom-aligned "B1" draws
 * at the foot of page 1 and a centred "C1" in page 1's middle, and the later
 * segments stay empty. A cell is therefore cut as though its content stood
 * at its top. Read where it stands in the whole row, a short aligned cell
 * looked as if it began below the page edge and left no room for the head
 * half, so a long row was never cut and ran off the page (WUA 050).
 */
function cellAlignmentShiftPx(
  cellTopPx: number,
  cellStyle: CSSStyleDeclaration,
  firstBlockDom: HTMLElement | undefined,
  scale: PaginationScale,
): number {
  const align = cellStyle.verticalAlign;
  if (!firstBlockDom || (align !== "middle" && align !== "bottom")) return 0;
  const contentTop =
    cellTopPx + cssPx(cellStyle.borderTopWidth) + cssPx(cellStyle.paddingTop);
  const blockTop =
    paginationLayoutRect(firstBlockDom, scale).top -
    cssPx(getComputedStyle(firstBlockDom).marginTop);
  return Math.max(0, blockTop - contentTop);
}

/**
 * Where each cell of a row is cut so that the row's head half ends at the page
 * edge `headAvailablePx` below the row's top.
 *
 * The head half is painted as a row of its own: below the content a cell keeps
 * there it still paints that content's trailing margin, the cell's bottom
 * padding and its bottom border. A cursor that only asked "does this block end
 * above the page edge" kept a paragraph whose text ended 5px above it — and the
 * head half then stood 66px tall in the 55px that were left. The next pass saw
 * a head that does not fit and answered with the row boundary; the pass after
 * that saw 55px free in front of a whole row and cut inside it again: the two
 * answers alternated until the ledger declared the layout stalled. So every
 * cell is cut against the edge less what the head half paints below its
 * content, and a cell that keeps nothing must still hold the one blank line
 * that stands in for it. `null` cuts mean no head half fits this space.
 */
/** List nodes a table cell's cut may fall between the items of. */
const CELL_LIST_TYPES: ReadonlySet<string> = new Set(["bulletList", "orderedList", "taskList"]);

/** An element's own space after, and that of what ends inside it with no
 * bottom edge between (a list item's last paragraph). */
function collapsedTrailingMarginPx(element: Element): number {
  let margin = 0;
  for (let current: Element | null = element; current; current = current.lastElementChild) {
    const style = getComputedStyle(current);
    margin = Math.max(margin, cssPx(style.marginBottom));
    if (cssPx(style.paddingBottom) + cssPx(style.borderBottomWidth) > 0) break;
  }
  return margin;
}

/** Lines a cell paragraph keeps on each side of a page break inside its row,
 * in Word's layout below compatibility mode 15. */
const TABLE_CELL_MIN_SPLIT_LINES = 1;












export function tableCellMinSplitLines(node: PmNode, cellWidowControl: boolean): number {
  return cellWidowControl ? minimumTextSplitLines(node.attrs?.widowControl) : TABLE_CELL_MIN_SPLIT_LINES;
}



let cellListItemTextCutsDisabled = false;
export function setCellListItemTextCutsDisabledForTest(disabled: boolean): void {
  cellListItemTextCutsDisabled = disabled;
}
function cellListItemTextCutsOff(): boolean {
  return cellListItemTextCutsDisabled;
}

/**
 * Where a list item a row's page edge falls in breaks: the item's paragraph
 * the edge crosses (`childIndex`) after `textOffset` characters, its lines
 * above the edge staying. `null` when the edge falls before the item's first
 * line, between two of its paragraphs, or in a block that is no paragraph.
 */
function cellListItemTextCut(
  itemDom: HTMLElement,
  itemNode: PmNode,
  contentEdge: number,
  alignShift: number,
  scale: ReturnType<typeof paginationLayoutScale>,
  textSplitSlackPx: number,
  cellWidowControl = false,
): Omit<TableCellListCut, "itemIndex"> | null {
  const childDoms = Array.from(itemDom.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  );
  if (childDoms.length !== itemNode.childCount) return null;
  for (let childIndex = 0; childIndex < childDoms.length; childIndex += 1) {
    const childDom = childDoms[childIndex];
    const childNode = itemNode.child(childIndex);
    const drawn = paginationLayoutRect(childDom, scale);
    const rect = { top: drawn.top - alignShift, bottom: drawn.bottom - alignShift };
    const trailingPx = cssPx(getComputedStyle(childDom).marginBottom);
    if (rect.bottom + trailingPx <= contentEdge + 1e-6) continue;
    // What of the item stood above the edge stays: the children before this
    // one, and of a list of its own the items above it and the lines of the
    // one it crosses (corpus R282-D21: an item's text, then its own list,
    // Word breaking inside that list's first item; with no way into it the
    // whole cell moved and its row's head stood empty).
    const keepBefore = childIndex > 0 ? { childIndex, boundary: true as const } : null;
    if (rect.top >= contentEdge) return keepBefore;
    if (CELL_LIST_TYPES.has(childNode.type.name) && childNode.childCount > 0) {
      const items = Array.from(childDom.children).filter(
        (item): item is HTMLElement => item instanceof HTMLElement && item.tagName === "LI",
      );
      if (items.length !== childNode.childCount) return keepBefore;
      let kept = 0;
      for (const item of items) {
        if (paginationLayoutRect(item, scale).bottom - alignShift + collapsedTrailingMarginPx(item) > contentEdge + 1e-6) break;
        kept += 1;
      }
      const inner = kept < items.length
        ? cellListItemTextCut(items[kept], childNode.child(kept), contentEdge, alignShift, scale, textSplitSlackPx, cellWidowControl)
        : null;
      if (inner) return { childIndex, nested: { itemIndex: kept, ...inner } };
      if (kept > 0) return { childIndex, nested: { itemIndex: kept } };
      return keepBefore;
    }
    if (!childNode.isTextblock) return null;
    const available = contentEdge - trailingPx - rect.top - Math.max(0, textSplitSlackPx);
    if (!(available > 0)) return null;
    const pitchPx = standInLinePx(childDom, rect.bottom - rect.top);
    let planned: ReturnType<typeof planTextCutByChars> = null;
    let budget = available;
    for (let attempt = 0; attempt < 4 && budget > 0; attempt += 1) {
      planned = planTextCutByChars(childDom, budget, tableCellMinSplitLines(childNode, cellWidowControl));
      if (!planned || planned.rowTop <= available + 1e-6) break;
      planned = null;
      if (!(pitchPx > 0)) break;
      budget -= pitchPx;
    }
    if (!planned && rect.bottom + trailingPx > contentEdge + 1e-6) {
      const byLineBox = planTextCutByChars(childDom, available, tableCellMinSplitLines(childNode, cellWidowControl), true);
      if (byLineBox && byLineBox.rowTop <= available + 1e-6) planned = byLineBox;
    }
    if (!planned) return null;
    const cursor = domTextCursor(childDom, planned.node, planned.offset);
    if (
      !cursor ||
      cursor.total !== childNode.textContent.length ||
      cursor.offset <= 0 ||
      cursor.offset >= cursor.total
    ) {
      return null;
    }
    return { childIndex, textOffset: cursor.offset };
  }
  return null;
}

/** Harness switch (`window.__docsSplitRowBorderPastFoot = true`): a row cut
 * through its lines lets the border closing its head run past the page foot,
 * as before (A/B; ledgerAtoms splitRowFootCreditPx reads it too). */
export function splitRowBorderPastFoot(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsSplitRowBorderPastFoot?: boolean }).__docsSplitRowBorderPastFoot === true;
}

/**
 * The border under the head half of a row cut across pages: the cell's own
 * bottom border, or the table's bottom border, which closes every fragment
 * (Word draws it at the cut: R484-D95, a table with no rule between rows,
 * ends page 2 on its 0.5 pt bottom rule). Read from the cells of the table's
 * last row, which draw it.
 */
function splitHeadClosingBorderPx(cellDom: HTMLElement, cellStyle: CSSStyleDeclaration): number {
  if (splitRowBorderPastFoot()) return 0;
  let border = cssPx(cellStyle.borderBottomWidth);
  const table = cellDom.closest("table");
  const last = table?.rows[table.rows.length - 1];
  if (last && last !== cellDom.parentElement) {
    for (const cell of Array.from(last.cells)) border = Math.max(border, cssPx(getComputedStyle(cell).borderBottomWidth));
  }
  return border;
}

/** Harness switch (`window.__docsCellSplitSpaceAfterOff = true`): a cell
 * paragraph cut through its lines keeps its space after on the head half (A/B). */
export function cellSplitSpaceAfterOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsCellSplitSpaceAfterOff?: boolean }).__docsCellSplitSpaceAfterOff === true;
}

/** Harness switch (`window.__docsCellFirstLineSpaceAfterAlways = true`): a
 * cell's first paragraph charges its space after under its first line even
 * when it goes on to more lines, as before (A/B). */
function cellFirstLineSpaceAfterAlways(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsCellFirstLineSpaceAfterAlways?: boolean }).__docsCellFirstLineSpaceAfterAlways === true;
}

/**
 * What a row cut across pages needs in each cell under the cell's top edge:
 * its first line, and the paragraph's space after when that line is the whole
 * paragraph. Word breaks a row only where every cell keeps its first line on
 * the page; a cell that cannot moves the whole row on (probes tbl16 h1-h3,
 * mode 14: a one-line "Shocks (unexpected events)" with 10 pt after needs
 * 5 + 11.27 + 10 + 5 pt and the row moves at 32 pt of room, cuts at 32.5;
 * with a 20 pt space after under the first line of a four-line paragraph the
 * row still cuts at 23 pt -- a line that goes on keeps no space after).
 */
export function cellFirstLineNeedPx(blockHeightPx: number, linePx: number, trailingPx: number): number {
  const wholeParagraph = linePx >= blockHeightPx - 0.5;
  return linePx + (wholeParagraph || cellFirstLineSpaceAfterAlways() ? trailingPx : 0);
}

function planTableCellCuts(
  rowDom: HTMLElement,
  rowNode: PmNode,
  headAvailablePx: number,
  textSplitSlackPx = 0,
  /** The page's text height; a nested table's plan reads it as a fresh page. */
  pageCapacityPx?: number,
  /** Word's mode-15 widow/orphan floors in cells (`tableCellMinSplitLines`). */
  cellWidowControl = false,
): { cuts: TableCellTextCut[] | null; tails?: TableCellTail[] } | null {
  const cells = renderedRowCells(rowDom);
  if (cells.length !== rowNode.childCount) return null;
  const scale = paginationLayoutScale(rowDom);
  const boundary = paginationLayoutRect(rowDom, scale).top + headAvailablePx;
  const sourceColumns = tableCellSourceColumns(rowNode);
  const cuts: TableCellTextCut[] = [];
  const rowTop = boundary - headAvailablePx;
  let tails: TableCellTail[] | undefined = [];
  const readTail = (cellDom: HTMLElement, sourceCol: number, cut: TableCellTextCut["cut"], textRowTop: number | null) => {
    if (!tails) return;
    const tail = tableCellTailOf(cellDom, sourceCol, cut, textRowTop, rowTop, scale);
    if (tail) tails.push(tail);
    else tails = undefined;
  };
  for (let cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
    const cellDom = cells[cellIndex];
    const cellNode = rowNode.child(cellIndex);
    const sourceCol = sourceColumns[cellIndex];
    const cellRect = paginationLayoutRect(cellDom, scale);
    if (cellRect.bottom <= boundary) {
      cuts.push({ sourceCol, cut: { kind: "after" } });
      readTail(cellDom, sourceCol, { kind: "after" }, null);
      continue;
    }
    if (cellRect.top >= boundary) {
      cuts.push({ sourceCol, cut: { kind: "before" } });
      readTail(cellDom, sourceCol, { kind: "before" }, null);
      continue;
    }
    let cutRowTop: number | null = null;
    const blockDoms = Array.from(cellDom.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement,
    );
    if (blockDoms.length !== cellNode.childCount) return null;
    const cellStyle = getComputedStyle(cellDom);
    // The lowest point the head half's content, trailing margin included, may
    // reach in this cell: above the cell's bottom margin AND the border that
    // closes the head half at the foot. Word keeps a line on the page only
    // when the line, the bottom margin and that border all end above the foot
    // (Windows Word, probes tbl22/s1, modes 12 and 15: 14 pt lines, 2.15 pt
    // margin, a 3 pt bottom border -- the fifth line stays up to 620.6 pt of
    // filler and goes on at 621.1; with no border up to 623.6; with 0.5 pt
    // up to 623.1. Corpus R484-D95: "with others (7)" opens page 3, Word 18
    // pages). The border the head draws there is the table's bottom one even
    // where the row has none between rows.
    const contentEdge = boundary - cssPx(cellStyle.paddingBottom) - splitHeadClosingBorderPx(cellDom, cellStyle);
    const alignShift = cellAlignmentShiftPx(cellRect.top, cellStyle, blockDoms[0], scale);
    let cut: TableCellTextCut["cut"] | null = null;
    for (let blockIndex = 0; blockIndex < blockDoms.length; blockIndex += 1) {
      const blockDom = blockDoms[blockIndex];
      const blockNode = cellNode.child(blockIndex);
      const drawn = paginationLayoutRect(blockDom, scale);
      // An in-line block (a picture on a line of its own) stands on its
      // line's baseline, and the line box reaches the cell's strut descent
      // below it: the row ends there, not at the picture (corpus R03-D23:
      // a 3px picture under each cell's words, the row head 8px past the
      // foot, every block "fitting").
      const lineExtra = inlineBlockLineExtraPx(blockDom, cellDom);
      const rect = { top: drawn.top - alignShift, bottom: drawn.bottom - alignShift + lineExtra };
      const trailingPx = cssPx(getComputedStyle(blockDom).marginBottom);
      if (rect.bottom + trailingPx <= contentEdge + 1e-6) continue;
      if (blockIndex === 0) {
        // Nothing of this cell may stay whole. Whatever the cut below turns
        // out to be, the head half paints at least one line here — a kept first
        // line or the blank stand-in of a `before` cut.
        const linePx = cellFirstLinePx(blockDom, rect.bottom - rect.top);
        if (rect.top + cellFirstLineNeedPx(rect.bottom - rect.top, linePx, trailingPx) > contentEdge + 1e-6) return { cuts: null };
      }
      if (rect.top >= contentEdge) {
        cut = tableCellBlockBoundary(cellNode, blockIndex);
        if (!cut) return null;
        break;
      }
      const safeSlack = Number.isFinite(textSplitSlackPx)
        ? Math.max(0, textSplitSlackPx)
        : 0;
      const available = contentEdge - trailingPx - rect.top - safeSlack;
      // The text cursor keeps the rows whose GLYPHS end inside the space; the
      // head paragraph is as tall as its line boxes, which end where the cut
      // row begins. A cut row starting below the space is given back a row at
      // a time until the head it leaves is known to fit.
      if (blockNode.type.name === "table" && available > 0) {
        // A table in the cell breaks between its own rows where the page
        // ends, its header rows repeated, as Word breaks the outer row
        // through it (corpus R43-D15); only when no row of it fits is the
        // cut before it.
        const nested = renderedTableElement(blockDom);
        const measuredNested = nested ? tableRowMeasurements(nested, blockNode) : null;
        if (nested && measuredNested) {
          const nestedRowsHeight = measuredNested.measurements.reduce((sum, row) => sum + row.heightPx, 0);
          // The page is the page, not what is left of it: read as a whole
          // page, a row that only fits the next one was "taller than a page"
          // and stood here past the foot, or was cut and drew its "at least"
          // floor all the same (corpus R283-D10: a 165 px floor with 133 px
          // left, two cuts for good and 8 pages for Word's 23). Rows kept with
          // the next one take nothing back here: on R52-D30 Word ends page 1
          // after the 44th row of a list in a cell, whatever they keep.
          const nestedPlan = planTablePageCut(measuredNested.measurements.map((row) => ({ ...row, keepWithNext: false })), available, pageCapacityPx ?? available, {
            fragmentChromePx: Math.max(0, positiveElementHeight(nested) - nestedRowsHeight),
          });
          if (
            nestedPlan?.kind === "betweenRows" &&
            nestedPlan.cutBeforeRow > 0 &&
            nestedPlan.cutBeforeRow < blockNode.childCount
          ) {
            cut = {
              kind: "nestedTable",
              blockIndex,
              cutBeforeRow: nestedPlan.cutBeforeRow,
              repeatHeaderRows: [...nestedPlan.repeatHeaderRows],
            };
            break;
          }
          // The nested row the page ends in is itself taller than what is
          // left: Word breaks it through its own cells, level by level, as
          // it breaks the outer row (corpus R03-D23: 49 nested tables, a
          // single-row table holding them inside a single-row table, 16
          // pages in Word). Cut before it instead, the whole nested row
          // moved on and stood past the foot of every later page.
          if (nestedPlan?.kind === "withinRow" && !nestedPlan.startOnFreshPage) {
            const nestedRowDom = measuredNested.rows[nestedPlan.rowIndex];
            const nestedRowNode = blockNode.child(nestedPlan.rowIndex);
            const inner = nestedRowDom
              ? planTableCellCuts(nestedRowDom, nestedRowNode, nestedPlan.headAvailablePx, textSplitSlackPx, pageCapacityPx, cellWidowControl)
              : null;
            if (
              inner?.cuts &&
              tableWithinRowCutMakesProgress(
                blockNode.toJSON() as TableJsonNode,
                nestedPlan.rowIndex,
                inner.cuts,
              )
            ) {
              cut = {
                kind: "nestedTable",
                blockIndex,
                cutBeforeRow: nestedPlan.rowIndex,
                repeatHeaderRows: [...nestedPlan.repeatHeaderRows],
                withinRow: inner.cuts,
              };
              break;
            }
            // A row that cannot be cut inside (one line in each cell) still
            // has the rows above it on this page: the cut goes between them,
            // as the outer table's does (corpus R52-D30: a 76-row name list
            // in a cell, Word ending page 1 after its 44th row; cut before
            // the list, page 1 held its heading alone).
            const headerCount = leadingTableHeaderRowCount(measuredNested.measurements);
            if (nestedPlan.rowIndex - headerCount > 0) {
              cut = {
                kind: "nestedTable",
                blockIndex,
                cutBeforeRow: nestedPlan.rowIndex,
                repeatHeaderRows: [...nestedPlan.repeatHeaderRows],
              };
              break;
            }
          }
          // The first row left does not fit and fits the next page: nothing
          // of this cell stays here.
          if (nestedPlan?.kind === "moveToFreshPage" && blockIndex === 0) return { cuts: null };
        }
      }
      // A list breaks between its items: those whose boxes end above the edge
      // stay, the next opens the following page. Read as one uncuttable
      // block, a list taller than a page left its row nothing to cut: page
      // after page of empty row heads, then the whole row past the foot
      // (corpus R104-D03: 16 pages, Word 49).
      if (CELL_LIST_TYPES.has(blockNode.type.name) && blockNode.childCount > 0) {
        const items = Array.from(blockDom.children).filter(
          (child): child is HTMLElement => child instanceof HTMLElement && child.tagName === "LI",
        );
        if (items.length === blockNode.childCount) {
          // The head list ends with its last kept item, whose space after
          // (that of its last paragraph, collapsing through the item) meets
          // the list's own: the head paints down to there, not to the item's
          // border box. Read by border boxes, a head planned to the edge
          // painted its last paragraph's 24 px space after past it, was cut back, and the plan
          // alternated between the two cuts (corpus R104-D03).
          const listStyle = getComputedStyle(blockDom);
          const listEdgePx = cssPx(listStyle.paddingBottom) + cssPx(listStyle.borderBottomWidth);
          let kept = 0;
          for (const item of items) {
            const itemTrailingPx = collapsedTrailingMarginPx(item);
            const tailPx = listEdgePx > 0 ? itemTrailingPx + listEdgePx + trailingPx : Math.max(itemTrailingPx, trailingPx);
            if (paginationLayoutRect(item, scale).bottom - alignShift + tailPx > contentEdge + 1e-6) break;
            kept += 1;
          }
          // The item the edge falls in breaks between its own lines, as
          // Word breaks the paragraphs of a row it carries over a page
          // (corpus R280-D18: "Outer context and societal influence", a row
          // of numbered paragraphs Word ends page 33 inside; read as items
          // only, the row stood whole past the foot, a sheet two pages tall).
          const straddling = kept < items.length && !cellListItemTextCutsOff()
            ? cellListItemTextCut(items[kept], blockNode.child(kept), contentEdge, alignShift, scale, textSplitSlackPx, cellWidowControl)
            : null;
          if (straddling) {
            cut = { kind: "listItemText", blockIndex, itemIndex: kept, ...straddling };
            break;
          }
          if (kept > 0 && kept < items.length) {
            cut = { kind: "listItems", blockIndex, itemIndex: kept };
            break;
          }
        }
      }
      let planned: ReturnType<typeof planTextCutByChars> = null;
      // A paragraph cut through its lines ends on the next page, and its
      // space after with it: the head half keeps none (Word: corpus R417-D03,
      // a 10pt space after under the 22nd line of a one-word-wide cell, Word
      // drew a 23rd line where the page had room for it but not for the
      // space; the head paragraph is drawn without it, tablePaginationAttrs).
      const textAvailable = cellSplitSpaceAfterOff() ? available : available + trailingPx;
      if (blockNode.isTextblock && textAvailable > 0) {
        const pitchPx = standInLinePx(blockDom, rect.bottom - rect.top);
        let budget = textAvailable;
        for (let attempt = 0; attempt < 4 && budget > 0; attempt += 1) {
          // Below compatibility mode 15 Word keeps no widow/orphan floor
          // inside a table cell: a row it breaks across pages may leave one
          // line of a paragraph on each side, widow control on or off (Word
          // 16.86, corpus R36-D30 and the same file with w:widowControl on).
          // From mode 15 the paragraph's own control holds there.
          planned = planTextCutByChars(blockDom, budget, tableCellMinSplitLines(blockNode, cellWidowControl));
          if (!planned || planned.rowTop <= textAvailable + 1e-6) break;
          planned = null;
          if (!(pitchPx > 0)) break;
          budget -= pitchPx;
        }
        // The paragraph runs past the edge although the glyphs of its last
        // line end above it: that line's box reaches below them (a leaf's
        // auto line height over its glyphs). Read by glyphs, every line
        // fitted and no cut was found, so a head cut 5px too tall was joined
        // back and cut again until the ledger held the cycle (corpus R03-D23
        // on a live page). Read by line boxes, the last line goes on.
        if (!planned && rect.bottom + trailingPx > contentEdge + 1e-6) {
          const byLineBox = planTextCutByChars(blockDom, textAvailable, tableCellMinSplitLines(blockNode, cellWidowControl), true);
          if (byLineBox && byLineBox.rowTop <= textAvailable + 1e-6) planned = byLineBox;
        }
        // The cell's first paragraph may not break here and does not fit
        // whole: nothing of the cell stays, and Word moves the whole row on
        // rather than leave this cell's head empty beside the others
        // (R282-D08: a two-line cell, one line of room, the row on page 6).
        if (
          !planned &&
          blockIndex === 0 &&
          tableCellMinSplitLines(blockNode, cellWidowControl) > TABLE_CELL_MIN_SPLIT_LINES
        ) {
          return { cuts: null };
        }
      }
      if (planned) {
        const cursor = domTextCursor(blockDom, planned.node, planned.offset);
        // Inline atoms consume PM units but not JSON text characters. Refuse a
        // guessed cursor when DOM/semantic text lengths differ.
        if (
          cursor &&
          cursor.total === blockNode.textContent.length &&
          cursor.offset > 0 &&
          cursor.offset < cursor.total
        ) {
          cut = {
            kind: "text",
            blockIndex,
            textOffset: cursor.offset,
          };
          cutRowTop = planned.rowTop;
        }
      }
      if (!cut) {
        cut = tableCellBlockBoundary(cellNode, blockIndex);
        if (!cut) return null;
      }
      break;
    }
    cuts.push({ sourceCol, cut: cut ?? { kind: "after" } });
    readTail(cellDom, sourceCol, cut ?? { kind: "after" }, alignShift === 0 ? cutRowTop : Number.NaN);
  }
  return { cuts, tails };
}

/** What `cut` leaves of a cell, from the cell as it is laid out whole. Null for
 * a cut the plan cannot go on from (a list, a nested table, a cell aligned
 * away from its top). */
function tableCellTailOf(
  cellDom: HTMLElement,
  sourceCol: number,
  cut: TableCellTextCut["cut"],
  /** Top of the cut's line in its block (px), for a cut inside text. NaN: the
   * cell is not aligned to its top. */
  textRowTop: number | null,
  rowTop: number,
  scale: PaginationScale,
): TableCellTail | null {
  if (textRowTop !== null && Number.isNaN(textRowTop)) return null;
  const blocks = Array.from(cellDom.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
  const first = blocks[0], last = blocks[blocks.length - 1];
  if (!first || !last) return null;
  const style = getComputedStyle(cellDom);
  const edgesPx = cssPx(style.paddingTop) + cssPx(style.borderTopWidth) + cssPx(style.paddingBottom) + cssPx(style.borderBottomWidth);
  const lastRect = paginationLayoutRect(last, scale);
  const end = lastRect.bottom + cssPx(getComputedStyle(last).marginBottom);
  const piece = (top: number) => Math.max(0, end - top) + edgesPx;
  switch (cut.kind) {
    case "after":
      return {
        sourceCol,
        blockIndex: blocks.length - 1,
        textOffset: 0,
        topPx: end - rowTop,
        heightPx: standInLinePx(last, lastRect.bottom - lastRect.top) + edgesPx,
        done: true,
      };
    case "before": {
      const top = paginationLayoutRect(first, scale).top - cssPx(getComputedStyle(first).marginTop);
      return { sourceCol, blockIndex: 0, textOffset: 0, topPx: top - rowTop, heightPx: piece(top), done: false };
    }
    case "block": {
      const block = blocks[cut.blockIndex];
      if (!block) return null;
      const top = paginationLayoutRect(block, scale).top - cssPx(getComputedStyle(block).marginTop);
      return { sourceCol, blockIndex: cut.blockIndex, textOffset: 0, topPx: top - rowTop, heightPx: piece(top), done: false };
    }
    case "text": {
      const block = blocks[cut.blockIndex];
      if (!block || textRowTop === null) return null;
      const top = paginationLayoutRect(block, scale).top + textRowTop;
      return { sourceCol, blockIndex: cut.blockIndex, textOffset: cut.textOffset, topPx: top - rowTop, heightPx: piece(top), done: false };
    }
    default:
      return null;
  }
}

/**
 * The cuts of the rest of a row a plan has already cut through, read from the
 * whole row's layout: each cell goes on from its own line (`from`), so the page
 * edge falls at a different height in each. Null when a cell holds anything but
 * paragraphs, or nothing would move. In the piece's own terms: its first block
 * is the rest of `from`'s, and a character counts from where that rest starts.
 */
function planRowPieceCellCuts(
  rowDom: HTMLElement,
  rowNode: PmNode,
  headAvailablePx: number,
  from: readonly TableCellTail[],
  cellWidowControl: boolean,
): { cuts: TableCellTextCut[]; tails: TableCellTail[] } | null {
  const cells = renderedRowCells(rowDom);
  if (cells.length !== rowNode.childCount || from.length !== cells.length) return null;
  const scale = paginationLayoutScale(rowDom);
  const rowTop = paginationLayoutRect(rowDom, scale).top;
  const cuts: TableCellTextCut[] = [];
  const tails: TableCellTail[] = [];
  for (let cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
    const cellDom = cells[cellIndex];
    const cellNode = rowNode.child(cellIndex);
    const was = from[cellIndex];
    const blockDoms = Array.from(cellDom.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
    if (blockDoms.length !== cellNode.childCount) return null;
    const style = getComputedStyle(cellDom);
    if (was.done) {
      cuts.push({ sourceCol: was.sourceCol, cut: { kind: "after" } });
      tails.push(was);
      continue;
    }
    const insetTop = cssPx(style.paddingTop) + cssPx(style.borderTopWidth);
    const insetBottom = cssPx(style.paddingBottom) + cssPx(style.borderBottomWidth);
    // The page's edge in the whole row's terms, for this cell's rest.
    const edge = rowTop + was.topPx - insetTop + headAvailablePx - insetBottom;
    let cut: TableCellTextCut["cut"] | null = null;
    let cutRowTop: number | null = null;
    for (let blockIndex = was.blockIndex; blockIndex < blockDoms.length; blockIndex += 1) {
      const blockDom = blockDoms[blockIndex];
      const blockNode = cellNode.child(blockIndex);
      if (!blockNode.isTextblock) return null;
      const rect = paginationLayoutRect(blockDom, scale);
      const trailingPx = cssPx(getComputedStyle(blockDom).marginBottom);
      if (rect.bottom + trailingPx <= edge + 1e-6) continue;
      const startsAt = blockIndex === was.blockIndex ? rowTop + was.topPx : rect.top;
      const pieceBlock = blockIndex - was.blockIndex;
      const pitchPx = standInLinePx(blockDom, rect.bottom - rect.top);
      // A head cut through the lines keeps no space after (planTableCellCuts).
      const headTrailingPx = cellSplitSpaceAfterOff() ? trailingPx : 0;
      if (startsAt + pitchPx + headTrailingPx > edge + 1e-6) {
        // Not one line of it fits: what stays is what stood above it.
        cut = pieceBlock === 0 ? { kind: "before" } : { kind: "block", blockIndex: pieceBlock };
        break;
      }
      const available = edge - headTrailingPx - rect.top;
      const minLines = tableCellMinSplitLines(blockNode, cellWidowControl);
      let planned: ReturnType<typeof planTextCutByChars> = null;
      let budget = available;
      for (let attempt = 0; attempt < 4 && budget > 0; attempt += 1) {
        planned = planTextCutByChars(blockDom, budget, minLines);
        if (!planned || planned.rowTop <= available + 1e-6) break;
        planned = null;
        if (!(pitchPx > 0)) break;
        budget -= pitchPx;
      }
      if (!planned) {
        const byLineBox = planTextCutByChars(blockDom, available, minLines, true);
        if (byLineBox && byLineBox.rowTop <= available + 1e-6) planned = byLineBox;
      }
      const cursor = planned ? domTextCursor(blockDom, planned.node, planned.offset) : null;
      const startOffset = blockIndex === was.blockIndex ? was.textOffset : 0;
      if (planned && cursor && cursor.total === blockNode.textContent.length && cursor.offset > startOffset && cursor.offset < cursor.total) {
        cut = { kind: "text", blockIndex: pieceBlock, textOffset: cursor.offset - startOffset };
        cutRowTop = planned.rowTop;
      } else {
        cut = pieceBlock === 0 ? { kind: "before" } : { kind: "block", blockIndex: pieceBlock };
      }
      break;
    }
    const piece = cut ?? { kind: "after" as const };
    cuts.push({ sourceCol: was.sourceCol, cut: piece });
    // The same cut in the whole cell's terms, to read what it leaves.
    const whole: TableCellTextCut["cut"] = piece.kind === "text"
      ? { kind: "text", blockIndex: piece.blockIndex + was.blockIndex, textOffset: piece.textOffset + (piece.blockIndex === 0 ? was.textOffset : 0) }
      : piece.kind === "block"
        ? { kind: "block", blockIndex: piece.blockIndex + was.blockIndex }
        : piece;
    if (piece.kind === "before") {
      tails.push(was);
      continue;
    }
    const tail = tableCellTailOf(cellDom, was.sourceCol, whole, cutRowTop, rowTop, scale);
    if (!tail) return null;
    tails.push(tail);
  }
  return { cuts, tails };
}

export function planRenderedTableFragment(
  dom: HTMLElement,
  node: PmNode,
  availablePx: number,
  fullPageCapacityPx: number,
  textSplitSlackPx = 0,
  options: { overPageCantSplitStands?: boolean; cellWidowControl?: boolean; keepWithNextReleased?: boolean } = {},
): PlannedTableFragment | null {
  if (node.type.name !== "table") return null;
  const table = renderedTableElement(dom);
  if (!table) return null;
  const measured = tableRowMeasurements(table, node);
  if (!measured) return null;
  const rowsHeight = measured.measurements.reduce(
    (sum, row) => sum + row.heightPx,
    0,
  );
  const chrome = Math.max(0, positiveElementHeight(table) - rowsHeight);
  // A floating table raised above its place in the flow (tablePageFrame
  // "split", a negative top) takes that much less of the page than its rows
  // measure: its wrapper's height says so, and its rows must too. Measured
  // by their boxes, a whole raised table that fits its page (R92-D26: 715 of
  // 720 px) was cut, the parts joined, and the two answers alternated until
  // the ledger held the cut ("A3" alone on page 3).
  const raisedPx =
    dom.getAttribute("data-table-page-frame") === "split" ? Math.max(0, -(Number.parseFloat(dom.style.top) || 0)) : 0;
  const plan = planTablePageCut(
    measured.measurements,
    availablePx + raisedPx,
    fullPageCapacityPx,
    { fragmentChromePx: chrome, overPageCantSplitStands: options.overPageCantSplitStands === true,
      ...(options.keepWithNextReleased === true ? { keepWithNextReleased: true } : {}), allowOriginalHeaderOnly:
      node.childCount>1 && node.firstChild?.attrs.headerRow===true &&
      node.attrs[TABLE_CONTINUATION_ATTR]!==true && originalTableHeaderMayStandAlone(node.attrs,node.firstChild.toJSON()) },
  );
  if (!plan || plan.kind === "moveToFreshPage") return null;
  if (plan.kind === "withinRow") {
    // A candidate already opening the next sheet is the fresh-page placement
    // requested by the planner; do not create a header-only physical head.
    if (plan.startOnFreshPage && availablePx < fullPageCapacityPx) return null;
    const rowNode = node.child(plan.rowIndex);
    const planned = planTableCellCuts(
      measured.rows[plan.rowIndex],
      rowNode,
      plan.headAvailablePx,
      textSplitSlackPx,
      fullPageCapacityPx,
      options.cellWidowControl === true,
    );
    if (!planned) return null;
    const cuts = planned.cuts;
    // The row planner reasons in row BOXES, the cell cursors in block boxes. A
    // boundary that falls in the row's own padding or border leaves every cell
    // reporting "all content above it", and a row split that carries nothing to
    // the next page is refused by `fragmentTableWithinRow`; a space too small
    // for the head half's own padding and one line has no cell cuts at all.
    // Answer with the row boundary instead — the same fallback the pixel
    // planner already uses when no legal slice exists — so the ledger never
    // commits to a cut it cannot materialise, or to one whose head half
    // overflows the space it was cut for.
    const headRowsPx = rowsHeightBefore(measured.measurements, plan.rowIndex);
    if (!cuts || !tableWithinRowCutMakesProgress(node.toJSON() as TableJsonNode, plan.rowIndex, cuts)) {
      const headerCount = leadingTableHeaderRowCount(measured.measurements);
      if (plan.rowIndex - headerCount <= 0) return null;
      return {
        plan: {
          kind: "betweenRows",
          cutBeforeRow: plan.rowIndex,
          repeatHeaderRows: plan.repeatHeaderRows,
        },
        cuts: [],
        headRowsPx,
      };
    }
    return { plan, cuts, headRowsPx, ...(planned.tails ? { tails: planned.tails } : {}) };
  }
  return { plan, cuts: [], headRowsPx: plan.kind === "betweenRows" ? rowsHeightBefore(measured.measurements, plan.cutBeforeRow) : undefined };
}

/** A rendered table fragment's rows as a plan going on past its own cuts reads
 * them: the rows' measurements and the table's own frame. Null when a cell
 * spans rows, whose cuts the fragment's real tail has to answer. */
export interface RenderedTableRows {
  readonly measurements: readonly TableRowMeasurement[];
  readonly chromePx: number;
  /** The rows as drawn: a page's edge falling in one is cut between its lines. */
  readonly doms?: readonly HTMLElement[];
  readonly node?: PmNode;
}

export function renderedTableRowsForPlan(dom: HTMLElement, node: PmNode): RenderedTableRows | null {
  if (node.type.name !== "table") return null;
  let spans = false;
  node.forEach((row) => {
    row.forEach((cell) => {
      if (Number(cell.attrs?.rowspan) > 1) spans = true;
    });
  });
  if (spans) return null;
  const table = renderedTableElement(dom);
  if (!table) return null;
  const measured = tableRowMeasurements(table, node);
  if (!measured) return null;
  const rowsHeight = measured.measurements.reduce((sum, row) => sum + row.heightPx, 0);
  return { measurements: measured.measurements, chromePx: Math.max(0, positiveElementHeight(table) - rowsHeight), doms: measured.rows, node };
}

/**
 * The next page's cut of a table this plan has already cut once: the rows
 * after the cut under the header band that repeats, read from the layout the
 * whole fragment already has. A cut only ever came from a laid-out fragment,
 * so a table of 1,267 rows was cut one page per pass, each laying out every
 * row still to come (26 passes, 40 s of a 30-page document). A row the page
 * breaks through is cut between its lines from the same layout: each cell's
 * next line is known, so the next page goes on from the rest of it, however
 * many pages the row takes. Moved whole for the next pass to cut, every page of
 * rows that break across pages laid out the whole table still to come, twice
 * (R329-D02: 44 pages, 46 passes, 2 s each). A row whose cells cannot be read
 * that way (a list or a nested table in it) still moves whole.
 */
export function planRenderedTableTail(
  rows: RenderedTableRows,
  tailRow: number,
  headerRows: readonly number[],
  availablePx: number,
  fullPageCapacityPx: number,
  options: {
    overPageCantSplitStands?: boolean;
    /** The row before `tailRow` was cut through: what is left of it opens the
     * tail, in about this height (no cell of it is laid out yet). */
    restOfCutRowPx?: number;
    /** What each cell of that row carries on, when known. */
    restTails?: readonly TableCellTail[];
    cellWidowControl?: boolean;
  } = {},
): { planned: PlannedTableFragment; row: number; tailPx: number; cutThrough?: { row: number; ofRest: boolean } } | null {
  const headers = headerRows.map((index) => rows.measurements[index]);
  const rest = options.restOfCutRowPx !== undefined ? [{ heightPx: Math.max(0, options.restOfCutRowPx), headerRow: false, cantSplit: false }] : [];
  if (headers.some((row) => !row) || tailRow <= 0 || tailRow > rows.measurements.length) return null;
  if (tailRow === rows.measurements.length && rest.length === 0) return null;
  const tail: TableRowMeasurement[] = [
    ...headers.map((row) => ({ ...row, headerRow: true, repeatedHeader: true })),
    ...rest,
    ...rows.measurements.slice(tailRow),
  ];
  const plan = planTablePageCut(tail, availablePx, fullPageCapacityPx, {
    fragmentChromePx: rows.chromePx,
    overPageCantSplitStands: options.overPageCantSplitStands === true,
  });
  if (!plan || plan.kind === "moveToFreshPage") return null;
  if (plan.kind === "withinRow" && plan.startOnFreshPage && availablePx < fullPageCapacityPx) return null;
  const heightOf = (from: number, to: number) => {
    let height = 0;
    for (let index = from; index < to; index += 1) height += tail[index]!.heightPx;
    return height;
  };
  if (plan.kind === "withinRow" && plan.rowIndex >= headers.length && rows.doms && rows.node) {
    const ofRest = rest.length > 0 && plan.rowIndex === headers.length;
    const row = ofRest ? tailRow - 1 : tailRow + plan.rowIndex - headers.length - rest.length;
    const dom = rows.doms[row];
    const node = rows.node.maybeChild(row);
    const widow = options.cellWidowControl === true;
    const read = !dom || !node
      ? null
      : ofRest
        ? options.restTails ? planRowPieceCellCuts(dom, node, plan.headAvailablePx, options.restTails, widow) : null
        : planTableCellCuts(dom, node, plan.headAvailablePx, 0, fullPageCapacityPx, widow);
    if (read?.cuts && read.tails) {
      const restPx = Math.max(0, ...read.tails.map((cell) => cell.heightPx));
      return {
        planned: { plan, cuts: read.cuts, headRowsPx: heightOf(0, plan.rowIndex), tails: read.tails },
        row: row + 1,
        tailPx: rows.chromePx + heightOf(0, headers.length) + restPx + heightOf(plan.rowIndex + 1, tail.length),
        cutThrough: { row, ofRest },
      };
    }
  }
  const cutBeforeRow = plan.kind === "withinRow" ? plan.rowIndex : plan.cutBeforeRow;
  if (cutBeforeRow <= headers.length) return null;
  return {
    planned: {
      plan: { kind: "betweenRows", cutBeforeRow, repeatHeaderRows: plan.repeatHeaderRows },
      cuts: [],
      headRowsPx: heightOf(0, cutBeforeRow),
    },
    row: tailRow + cutBeforeRow - headers.length - rest.length,
    tailPx: rows.chromePx + heightOf(0, headers.length) + heightOf(cutBeforeRow, tail.length),
  };
}

/**
 * {@link planRenderedTableFragment} for a table on a sheet the page has not
 * laid out (docs-layout): its rows' heights the engine's (unlaidEngineTable)
 * and their Word properties the rows' own, so a plan going past it cuts it
 * with no layout. Between rows only: a row the plan would cut through moves
 * whole to the next page, as no cell's lines are known -- the sheet is never
 * trusted, and the page cuts the row when it lays the sheet out.
 */
export function planEngineTableFragment(
  node: PmNode,
  rowHeightsPx: readonly number[],
  chromePx: number,
  availablePx: number,
  fullPageCapacityPx: number,
  options: { overPageCantSplitStands?: boolean; keepWithNextReleased?: boolean } = {},
): PlannedTableFragment | null {
  if (node.type.name !== "table" || rowHeightsPx.length === 0 || rowHeightsPx.length !== node.childCount) return null;
  const measurements: TableRowMeasurement[] = [];
  for (let index = 0; index < node.childCount; index += 1) {
    const rowNode = node.child(index);
    if (rowNode.type.name !== "tableRow") return null;
    const declared = Number(rowNode.attrs?.rowHeight);
    const exactHeight = declared > 0 && rowNode.attrs?.rowHeightRule === "exact";
    const floorPx = declared > 0 && !exactHeight ? declared : 0;
    measurements.push({
      heightPx: rowHeightsPx[index]!,
      headerRow: rowNode.attrs?.headerRow === true,
      ...(rowNode.attrs?.[TABLE_REPEATED_HEADER_ATTR] === true ? { repeatedHeader: true } : {}),
      cantSplit: rowNode.attrs?.cantSplit === true,
      ...(exactHeight ? { exactHeight: true } : {}),
      ...(floorPx > 0 ? { floorPx } : {}),
      ...(paragraphKeepFlag(rowNode.firstChild?.firstChild, "keepNext") ? { keepWithNext: true } : {}),
    });
  }
  const plan = planTablePageCut(measurements, availablePx, fullPageCapacityPx, {
    fragmentChromePx: Math.max(0, chromePx),
    overPageCantSplitStands: options.overPageCantSplitStands === true,
    ...(options.keepWithNextReleased === true ? { keepWithNextReleased: true } : {}),
    allowOriginalHeaderOnly: node.childCount > 1 && node.firstChild?.attrs.headerRow === true &&
      node.attrs[TABLE_CONTINUATION_ATTR] !== true && originalTableHeaderMayStandAlone(node.attrs, node.firstChild.toJSON()),
  });
  if (!plan || plan.kind === "moveToFreshPage") return null;
  if (plan.kind === "withinRow") {
    if (plan.startOnFreshPage && availablePx < fullPageCapacityPx) return null;
    if (plan.rowIndex - leadingTableHeaderRowCount(measurements) <= 0) return null;
    return {
      plan: { kind: "betweenRows", cutBeforeRow: plan.rowIndex, repeatHeaderRows: plan.repeatHeaderRows },
      cuts: [],
      headRowsPx: rowsHeightBefore(measurements, plan.rowIndex),
    };
  }
  return { plan, cuts: [], headRowsPx: rowsHeightBefore(measurements, plan.cutBeforeRow) };
}

function rowsHeightBefore(measurements: readonly TableRowMeasurement[], row: number): number {
  let sum = 0;
  for (let index = 0; index < Math.min(row, measurements.length); index += 1) sum += measurements[index].heightPx;
  return sum;
}

interface NoteSliceRange {
  start: NoteSliceCursor;
  /** null means the end of the semantic endnote stream. */
  end: NoteSliceCursor | null;
}

function cursorCompare(left: NoteSliceCursor, right: NoteSliceCursor): number {
  return left.entry === right.entry
    ? left.offset - right.offset
    : left.entry - right.entry;
}

function cursorEqual(left: NoteSliceCursor, right: NoteSliceCursor): boolean {
  return left.entry === right.entry && left.offset === right.offset;
}

/** Semantic slice range of a footnoteList node. Older entry-only slices parse
 * as offset 0, so the V3.6 storage/runtime shape remains compatible. */
export function noteSliceRange(node: PmNode): NoteSliceRange {
  const attrs = node.attrs ?? {};
  const start = attrs[NOTE_SLICE_START_ATTR];
  const end = attrs[NOTE_SLICE_END_ATTR];
  const startOffset = attrs[NOTE_SLICE_START_OFFSET_ATTR];
  const endOffset = attrs[NOTE_SLICE_END_OFFSET_ATTR];
  return {
    start: {
      entry: Number.isInteger(start) ? Math.max(0, start as number) : 0,
      offset: Number.isInteger(startOffset)
        ? Math.max(0, startOffset as number)
        : 0,
    },
    end: Number.isInteger(end)
      ? {
          entry: Math.max(0, end as number),
          offset: Number.isInteger(endOffset)
            ? Math.max(0, endOffset as number)
            : 0,
        }
      : null,
  };
}

function noteSliceAttrs(
  node: PmNode,
  start: NoteSliceCursor,
  end: NoteSliceCursor | null,
): Record<string, unknown> {
  return {
    ...node.attrs,
    [NOTE_SLICE_START_ATTR]: start.entry,
    [NOTE_SLICE_START_OFFSET_ATTR]: start.offset > 0 ? start.offset : null,
    [NOTE_SLICE_END_ATTR]: end?.entry ?? null,
    [NOTE_SLICE_END_OFFSET_ATTR]: end && end.offset > 0 ? end.offset : null,
  };
}

function validNoteCut(range: NoteSliceRange, cut: NoteSliceCursor): boolean {
  if (cursorCompare(cut, range.start) <= 0) return false;
  return range.end === null || cursorCompare(cut, range.end) < 0;
}

/** Cursor-aware split: unlike the legacy entry-count operation, this can cut
 * inside one several-page note body without changing the semantic store. */
export function applyNoteListCursorSplit(
  tr: import("@tiptap/pm/state").Transaction,
  boundary: number,
  cut: NoteSliceCursor,
): boolean {
  const pages = collectPages(tr.doc);
  const target = pages?.[boundary];
  const source = pages?.[boundary + 1];
  if (!pages || !target || !source) return false;
  const node = source.node.childCount > 0 ? source.node.child(0) : null;
  if (!node || node.type.name !== NOTE_LIST_NODE) return false;
  const range = noteSliceRange(node);
  if (!validNoteCut(range, cut)) return false;
  const nodePos = source.pos + 1;
  tr.setNodeMarkup(nodePos, undefined, noteSliceAttrs(node, cut, range.end));
  const insertPos = target.pos + 1 + target.node.content.size;
  tr.insert(
    insertPos,
    node.type.create(noteSliceAttrs(node, range.start, cut)),
  );
  // A note-list cut is the paginator's own (noteSliceIntegrity leaves it be).
  tr.setMeta(REBALANCE_META, true);
  return tr.docChanged;
}

/** Materialize one note-list slice between unequal tracks in one page. */
export function applyNoteListColumnSplit(
  tr: import("@tiptap/pm/state").Transaction,
  sheetIndex: number,
  childIndex: number,
  cut: NoteSliceCursor,
): boolean {
  const sheet = collectPages(tr.doc)?.[sheetIndex];
  if (!sheet || childIndex < 0 || childIndex >= sheet.node.childCount) {
    return false;
  }
  let nodePos = sheet.pos + 1;
  for (let index = 0; index < childIndex; index += 1) {
    nodePos += sheet.node.child(index).nodeSize;
  }
  const node = sheet.node.child(childIndex);
  if (node.type.name !== NOTE_LIST_NODE) return false;
  const range = noteSliceRange(node);
  if (!validNoteCut(range, cut)) return false;
  tr.replaceWith(
    nodePos,
    nodePos + node.nodeSize,
    Fragment.fromArray([
      node.type.create(noteSliceAttrs(node, range.start, cut)),
      node.type.create(noteSliceAttrs(node, cut, range.end)),
    ]),
  );
  tr.setMeta(REBALANCE_META, true);
  return tr.docChanged;
}

/**
 * Slice the footnoteList OPENING sheet `boundary + 1` after `headCount`
 * rendered entries: a new head node carrying [s, s+k) lands at the end of
 * sheet `boundary`; the existing node continues from s+k. Pure attr
 * bookkeeping — the note store never moves. Exported for tests.
 */
export function applyNoteListSplit(
  tr: import("@tiptap/pm/state").Transaction,
  boundary: number,
  headCount: number,
): boolean {
  const pages = collectPages(tr.doc);
  const source = pages?.[boundary + 1];
  if (!pages || !source || headCount < 1) return false;
  const node = source.node.childCount > 0 ? source.node.child(0) : null;
  if (!node || node.type.name !== NOTE_LIST_NODE) return false;
  const range = noteSliceRange(node);
  return applyNoteListCursorSplit(tr, boundary, {
    entry: range.start.entry + headCount,
    offset: 0,
  });
}

export function applyNoteListOverflowCursorSplit(
  tr: import("@tiptap/pm/state").Transaction,
  sheetIndex: number,
  cut: NoteSliceCursor,
): boolean {
  const pages = collectPages(tr.doc);
  const sheet = pages?.[sheetIndex];
  if (!pages || !sheet) return false;
  const followerCount = sheet.node.childCount - 1;
  const node = sheet.node.childCount > 0 ? sheet.node.child(0) : null;
  if (!node || node.type.name !== NOTE_LIST_NODE) return false;
  const range = noteSliceRange(node);
  if (!validNoteCut(range, cut)) return false;
  const nodePos = sheet.pos + 1;
  tr.setNodeMarkup(nodePos, undefined, noteSliceAttrs(node, range.start, cut));
  tr.insert(
    nodePos + node.nodeSize,
    node.type.create(noteSliceAttrs(node, cut, range.end)),
  );
  const pageType = tr.doc.type.schema.nodes[PAGE_BLOCK_NODE];
  applyBoundaryMove(tr, pageType, sheetIndex, followerCount + 1);
  tr.setMeta(REBALANCE_META, true);
  return tr.docChanged;
}

/**
 * Cut an OVERFLOWING footnoteList that OPENS its sheet: keep the first
 * `headCount` entries there, push the continuation — and every follower —
 * onto the next sheet. Exported for tests.
 */
export function applyNoteListOverflowSplit(
  tr: import("@tiptap/pm/state").Transaction,
  sheetIndex: number,
  headCount: number,
): boolean {
  const pages = collectPages(tr.doc);
  const sheet = pages?.[sheetIndex];
  if (!pages || !sheet || headCount < 1) return false;
  const node = sheet.node.childCount > 0 ? sheet.node.child(0) : null;
  if (!node || node.type.name !== NOTE_LIST_NODE) return false;
  const range = noteSliceRange(node);
  return applyNoteListOverflowCursorSplit(tr, sheetIndex, {
    entry: range.start.entry + headCount,
    offset: 0,
  });
}

/**
 * Re-join two adjacent note slices ([a,b) + [b,c) → [a,c)); the merged
 * node keeps the head's position. Exported for tests.
 */
export function applyNoteSliceMerge(
  tr: import("@tiptap/pm/state").Transaction,
  headPos: number,
  tailPos: number,
): boolean {
  const head = tr.doc.nodeAt(headPos);
  const tail = tr.doc.nodeAt(tailPos);
  if (!head || !tail || tailPos <= headPos) return false;
  if (head.type.name !== NOTE_LIST_NODE || tail.type.name !== NOTE_LIST_NODE) {
    return false;
  }
  const headRange = noteSliceRange(head);
  const tailRange = noteSliceRange(tail);
  if (headRange.end === null || !cursorEqual(tailRange.start, headRange.end)) {
    return false;
  }
  const $tail = tr.doc.resolve(tailPos);
  const tailParent = $tail.parent;
  if (tailParent.type.name === PAGE_BLOCK_NODE && tailParent.childCount === 1) {
    const parentPos = $tail.before($tail.depth);
    tr.delete(parentPos, parentPos + tailParent.nodeSize);
  } else {
    tr.delete(tailPos, tailPos + tail.nodeSize);
  }
  tr.setNodeMarkup(
    headPos,
    undefined,
    noteSliceAttrs(head, headRange.start, tailRange.end),
  );
  tr.setMeta(REBALANCE_META, true);
  return tr.docChanged;
}

interface ContinuationPair {
  /** Doc position of the head block node. */
  headPos: number;
  /** Doc position of the tail block node. */
  tailPos: number;
  /** Sheet index the head lives on (-1: not a clean cross-sheet pair). */
  headSheet: number;
  /** True when head is last of its sheet and tail first of the next. */
  straddlesBoundary: boolean;
}

/** Every continuation tail with the block immediately before it in
 * reading order. Also surfaces orphan tails (previous block missing or
 * of a different type) via headPos = -1 so the caller can strip them. */
export function findContinuationPairs(doc: PmNode): ContinuationPair[] {
  const pairs: ContinuationPair[] = [];
  const pages = collectPages(doc);
  if (!pages) return pairs;
  let previous: {
    pos: number;
    node: PmNode;
    sheet: number;
    last: boolean;
  } | null = null;
  pages.forEach((page, sheetIndex) => {
    let offset = page.pos + 1;
    page.node.forEach((child, _childOffset, childIndex) => {
      if (isContinuationTail(child)) {
        const headOk =
          previous !== null && previous.node.type.name === child.type.name;
        pairs.push({
          headPos: headOk && previous ? previous.pos : -1,
          tailPos: offset,
          headSheet: headOk && previous ? previous.sheet : -1,
          straddlesBoundary: Boolean(
            headOk &&
            previous &&
            previous.last &&
            previous.sheet === sheetIndex - 1 &&
            childIndex === 0,
          ),
        });
      }
      previous = {
        pos: offset,
        node: child,
        sheet: sheetIndex,
        last: childIndex === page.node.childCount - 1,
      };
      offset += child.nodeSize;
    });
  });
  return pairs;
}

interface NoteSlicePair {
  headPos: number;
  tailPos: number;
  headSheet: number;
  straddlesBoundary: boolean;
}

interface NoteSliceScan {
  pairs: NoteSlicePair[];
  /** Sliced footnoteList nodes whose required neighbor is missing —
   * their attrs must be cleared or entries silently vanish. */
  orphanPositions: number[];
}

export function findNoteSlicePairs(doc: PmNode): NoteSliceScan {
  const pairs: NoteSlicePair[] = [];
  const orphanPositions: number[] = [];
  const pages = collectPages(doc);
  if (!pages) return { pairs, orphanPositions };
  interface Walked {
    pos: number;
    node: PmNode;
    sheet: number;
    first: boolean;
    last: boolean;
  }
  const walk: Walked[] = [];
  pages.forEach((page, sheetIndex) => {
    let offset = page.pos + 1;
    page.node.forEach((child, _off, childIndex) => {
      walk.push({
        pos: offset,
        node: child,
        sheet: sheetIndex,
        first: childIndex === 0,
        last: childIndex === page.node.childCount - 1,
      });
      offset += child.nodeSize;
    });
  });
  const pairedHead = new Set<number>();
  const pairedTail = new Set<number>();
  for (let i = 1; i < walk.length; i += 1) {
    const prev = walk[i - 1];
    const cur = walk[i];
    if (
      prev.node.type.name !== NOTE_LIST_NODE ||
      cur.node.type.name !== NOTE_LIST_NODE
    ) {
      continue;
    }
    const headRange = noteSliceRange(prev.node);
    const tailRange = noteSliceRange(cur.node);
    if (
      headRange.end === null ||
      !cursorEqual(tailRange.start, headRange.end)
    ) {
      continue;
    }
    pairedHead.add(prev.pos);
    pairedTail.add(cur.pos);
    pairs.push({
      headPos: prev.pos,
      tailPos: cur.pos,
      headSheet: prev.sheet,
      straddlesBoundary: prev.last && cur.first && cur.sheet === prev.sheet + 1,
    });
  }
  for (const entry of walk) {
    if (entry.node.type.name !== NOTE_LIST_NODE) continue;
    const { start, end } = noteSliceRange(entry.node);
    const needsHead =
      (start.entry > 0 || start.offset > 0) && !pairedTail.has(entry.pos);
    const needsTail = end !== null && !pairedHead.has(entry.pos);
    if (needsHead || needsTail) orphanPositions.push(entry.pos);
  }
  return { pairs, orphanPositions };
}

/**
 * How far a sheet's text spills past its page (0 when none does), for
 * everything that asks whether the pages are laid out. A sheet holding a
 * block that cannot be cut and is taller than the text area runs past its
 * foot by design (the paper's edge ends the block, as in Word): nothing
 * spilled there, and no layout will ever change it.
 */
export function sheetOverflowsPx(sheet: HTMLElement | undefined): number {
  if (!sheet || sheet.hasAttribute(PAGE_OVERSIZE_ATTR)) return 0;
  return sheetBodyOverflowPx(sheet);
}

/** How far a sheet's rendered body exceeds one page (0 when it fits).
 * Single-column repair and physical page accounting share the same body
 * extent, independent of the span decoration's paper clipping. */
export function sheetBodyOverflowPx(sheet: HTMLElement | undefined): number {
  if (!sheet) return 0;
  const style = getComputedStyle(sheet);
  const minHeight = Number.parseFloat(style.minHeight);
  if (!Number.isFinite(minHeight) || minHeight <= 0) return 0;
  const columns = sheetColumnCount(sheet);
  const unequal = unequalColumnProjectionForSheet(sheet);
  if (unequal) {
    // A projected page's blocks sit in exact tracks: its own accounting is
    // the overflow. The sheet's scroll extent is not: an anchored text box
    // or shape hanging below the paper, or a chart running on past its
    // column (Word's covering rule), widens it without any flow spilling,
    // and reading that as page overflow pushed blocks out that the ledger
    // pulled straight back.
    return Math.max(unequal.physicalOverflowPx, unequal.inlineOverflowPx);
  }
  // A CSS multi-column page (no track projection) holding an anchored
  // object: the sheet's scroll extent takes in an overlay shape, ink or a
  // floated box hanging off the paper, which is no flow spilling (the ledger
  // charges it nothing, as `measureSheetBodyExtent` skips it on a single
  // column). Its in-flow blocks say where the flow ends.
  const anchoredFlow = columns > 1 && sheet.querySelector(OUT_OF_FLOW_SELECTOR) !== null
    ? multiColumnFlowExtent(sheet)
    : null;
  // WebKit can cap scrollHeight as well as offsetHeight under overflow:clip.
  // Reading only those counters would declare a still-overflowing body ready.
  // Conversely, trailing list after-spacing must not manufacture body spill.
  const verticalExtent = columns <= 1
    ? measureSheetBodyExtent(sheet, Number.parseFloat(style.paddingBottom) || 0)
    : anchoredFlow
      ? anchoredFlow.bottomPx + (Number.parseFloat(style.paddingBottom) || 0)
      : Math.max(sheet.offsetHeight, sheet.scrollHeight);
  // Word lets the page's last line end inside its extra Auto leading; that
  // blank overrun is not body spill (pageEdgeLeading, printed controls).
  const verticalOverflow = Math.max(
    0,
    verticalExtent - minHeight - (columns <= 1 ? sheetTrailingAutoLeadingCreditPx(sheet) : 0),
  );
  if (columns <= 1) return verticalOverflow;
  // A fixed-height multicol page overflows by creating an extra column to the
  // inline side. Keep that spill visible to the same fail-closed repair loop;
  // scrollHeight alone remains exactly one page in this layout mode.
  const horizontalOverflow = Math.max(
    0,
    (anchoredFlow ? anchoredFlow.rightPx : sheet.scrollWidth) - sheet.clientWidth,
  );
  return Math.max(verticalOverflow, horizontalOverflow);
}

const OUT_OF_FLOW_SELECTOR = '[data-float-mode="overlay"], [data-float-mode="float"]';

/** Where the in-flow blocks of a CSS multi-column sheet end, in document
 * pixels: the right edge of their last column fragment from the sheet's
 * padding edge (as `scrollWidth` counts) and their lowest bottom from its
 * top (as `measureSheetBodyExtent` counts). Null while nothing measures (a
 * mounting frame keeps the scroll counters). */
function multiColumnFlowExtent(sheet: HTMLElement): { rightPx: number; bottomPx: number } | null {
  const scale = paginationLayoutScale(sheet);
  const sheetRect = paginationLayoutRect(sheet, scale);
  const originLeft = sheetRect.left + sheet.clientLeft;
  const originTop = sheetRect.top;
  let rightPx: number | null = null;
  let bottomPx: number | null = null;
  for (const child of Array.from(sheet.children)) {
    if (!(child instanceof HTMLElement) || child.matches(".ProseMirror-widget") || child.matches(OUT_OF_FLOW_SELECTOR)) continue;
    for (const fragment of Array.from(child.getClientRects())) {
      const rect = clientRectInPaginationLayout(fragment, scale);
      if (!(rect.height > 0)) continue;
      rightPx = Math.max(rightPx ?? 0, rect.right - originLeft);
      bottomPx = Math.max(bottomPx ?? 0, rect.bottom - originTop);
    }
  }
  return rightPx === null || bottomPx === null ? null : { rightPx, bottomPx };
}

