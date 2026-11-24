/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Cutting a row-sliced atom (atomRowSlices) at a page edge: where, and the
 * document operations that make and undo the cut. The page ledger's split
 * oracle asks `planRowSliceHead`; its reconciler applies the three
 * operations. They mirror the footnote list's (pageRebalanceExtension's
 * `applyNoteList*`), with a row index where a note cursor stands.
 *
 * The cut unit is a row, never a line inside one. A table of contents entry
 * is a paragraph of its own in Word; with widow/orphan control (on in the
 * TOC 1-9 styles, which are based on Normal) an entry of two or three lines
 * cannot break at all, and entries are rarely longer. The title of a gallery
 * table ("TOC Heading", based on Heading 1: keep with next) never ends a
 * page: the first copy always draws the title AND at least one row.
 */
import { ptToPx } from "../../../../../lib/office-units";
import type { Node as PmNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";

import { PAGE_BLOCK_NODE } from "./pageBlockExtension";
import { applyBoundaryMove, collectPages } from "./pageRebalanceExtension";
import { paginationLayoutRect, paginationLayoutScale, type PaginationScale } from "./paginationGeometry";
import {
  PAGE_ROWS_ROOT_ATTR,
  PAGE_ROW_ATTR,
  PAGE_ROW_CONTINUED_ATTR,
  PAGE_ROW_CONTINUES_ATTR,
  isRowSlicedAtomType,
  rowSliceRange,
  withRowSlice,
  type RowSliceRange,
} from "./atomRowSlices";

/** Layout resolves to 1/64 px: a row ending within that of the edge fits. */
const LAYOUT_UNIT_PX = 1 / 64;

export interface RowSliceHeadPlan {
  /** Index (in the whole list) of the first row of the tail. */
  row: number;
  /** Height of the copy up to the cut, from its top (px). */
  headPx: number;
  /** Height of the copy that would open at the tail's first row (px): the
   * rows from it to the end as drawn now, with a copy's own space above its
   * first row. */
  tailPx: number;
}

export interface RowSliceHeadOptions {
  closedBox?: boolean;
  /**
   * Plan the copy that would open at this row (an index in the whole list)
   * from the rows `dom` draws from it on, as if they stood at the top of a
   * copy of their own. A copy that opens mid-list sits on its page the way
   * `dom` itself does when `dom` is such a copy: its first row is as far
   * from its top as `dom`'s first row is from `dom`'s. So the pages a long
   * list still runs over are planned in one pass, each from the rows already
   * drawn, instead of one page a pass with every later row drawn again in
   * each new copy.
   */
  fromRow?: number;
}

/**
 * The largest head of the rendered copy `dom` that fits `availablePx`: every
 * row whose box ends on the page stays, the first that does not opens the
 * next page. Null when not even the first row fits (the copy moves whole),
 * when every row fits (nothing to cut), or without layout (jsdom).
 */
export function planRowSliceHead(
  dom: HTMLElement,
  availablePx: number,
  options: RowSliceHeadOptions = {},
): RowSliceHeadPlan | null {
  if (!(availablePx > 0)) return null;
  const drawn = Array.from(dom.querySelectorAll<HTMLElement>(`[${PAGE_ROW_ATTR}]`));
  const scale = paginationLayoutScale(dom);
  const lines: LineHeights = new Map();
  let rows = drawn;
  const box = paginationLayoutRect(dom, scale);
  let top = box.top;
  // How far a copy's first row stands below its top (only needed to plan a
  // copy that is not drawn yet).
  let openerOffsetPx = 0;
  if (options.fromRow !== undefined) {
    const at = drawn.findIndex((row) => Number.parseInt(row.getAttribute(PAGE_ROW_ATTR) ?? "", 10) === options.fromRow);
    if (at <= 0) return null;
    const first = rowBox(drawn[0], scale, options.closedBox ? lines : null);
    const opener = rowBox(drawn[at], scale, options.closedBox ? lines : null);
    if (!first || !opener) return null;
    // The opening row stands where the copy's own first row stands.
    openerOffsetPx = first.top - box.top;
    top = opener.top - openerOffsetPx;
    rows = drawn.slice(at);
  }
  if (rows.length < 2) return null;
  // Where each row's own box ends, for the rows that end on the page. The
  // tail keeps at least the last row.
  const ends: Array<number | null> = [];
  for (let index = 0; index < rows.length - 1; index += 1) {
    const box = rowBox(rows[index], scale, options.closedBox ? lines : null);
    if (!box) {
      // No layout at all (jsdom) plans nothing; a row that draws nothing
      // among rows that do is no place to cut after.
      if (index === 0) return null;
      ends.push(null);
      continue;
    }
    if (box.bottom - top > availablePx + LAYOUT_UNIT_PX) break;
    ends.push(box.bottom - top);
  }
  // The last of them whose copy, closed under it, still fits.
  for (let index = ends.length - 1; index >= 0; index -= 1) {
    const end = ends[index];
    if (end === null) continue;
    const headPx = end + (options.closedBox ? closingEdgePx(dom, rows[index]) + CLOSED_BOX_ALLOWANCE_PX : 0);
    if (headPx > availablePx + LAYOUT_UNIT_PX) continue;
    const next = Number.parseInt(rows[index + 1].getAttribute(PAGE_ROW_ATTR) ?? "", 10);
    if (!Number.isInteger(next) || next <= 0) return null;
    const nextBox = rowBox(rows[index + 1], scale, options.closedBox ? lines : null);
    const tailPx = nextBox ? box.bottom - nextBox.top + openerOffsetPx : Math.max(0, box.bottom - top - headPx);
    return { row: next, headPx, tailPx };
  }
  return null;
}

/**
 * Height of the copy that would open at row `fromRow` (an index in the whole
 * list) and draw the rest of the rows `dom` draws: those rows as drawn now,
 * with the space a copy has above its first row (as `dom`'s own first row
 * has it). Null when `dom` draws no such row (or has no layout).
 */
export function rowSliceRestPx(dom: HTMLElement, fromRow: number, options: { closedBox?: boolean } = {}): number | null {
  const drawn = Array.from(dom.querySelectorAll<HTMLElement>(`[${PAGE_ROW_ATTR}]`));
  const at = drawn.findIndex((row) => Number.parseInt(row.getAttribute(PAGE_ROW_ATTR) ?? "", 10) === fromRow);
  if (at <= 0) return null;
  const scale = paginationLayoutScale(dom);
  const lines: LineHeights = new Map();
  const box = paginationLayoutRect(dom, scale);
  const first = rowBox(drawn[0], scale, options.closedBox ? lines : null);
  const opener = rowBox(drawn[at], scale, options.closedBox ? lines : null);
  if (!first || !opener) return null;
  return box.bottom - opener.top + (first.top - box.top);
}

/** A closed copy is planned this much taller than it measures: borders that
 * share a pixel with a row (a table's collapsed rules) round either way. */
const CLOSED_BOX_ALLOWANCE_PX = 1;

function px(value: string): number {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

interface RowBox {
  top: number;
  bottom: number;
}

/** The lines of a block whose words are rows: half the leading over and
 * under a word's own box, and how far the block's first and last lines
 * really reach beyond that (px). Read once per block. */
interface BlockLines {
  leadingPx: number | null;
  overPx: number;
  underPx: number;
}
type LineHeights = Map<Element, BlockLines>;

function blockLines(block: HTMLElement, scale: PaginationScale): BlockLines {
  const style = getComputedStyle(block);
  const lineHeight = Number.parseFloat(style.lineHeight);
  const lines: BlockLines = {
    leadingPx: Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : null,
    overPx: 0,
    underPx: 0,
  };
  // A line is as tall as the line height when all it holds is this block's
  // own type. Glyphs from another face (East Asian text among Latin, a
  // symbol) sit on another baseline and make it taller: by how much is read
  // where it shows, between the block's own edges and the first and last
  // words it draws, and taken for all its lines.
  const words = block.querySelectorAll<HTMLElement>(`[${PAGE_ROW_ATTR}]`);
  const first = words[0];
  const last = words[words.length - 1];
  if (!first || !last) return lines;
  const box = paginationLayoutRect(block, scale);
  const firstRect = paginationLayoutRect(first, scale);
  const lastRect = paginationLayoutRect(last, scale);
  if (!(box.height > 0) || !(firstRect.height > 0) || !(lastRect.height > 0)) return lines;
  const half = (height: number) => Math.max(0, (lines.leadingPx ?? height * 1.2) - height) / 2;
  const contentTop = box.top + px(style.borderTopWidth) + px(style.paddingTop);
  const contentBottom = box.bottom - px(style.borderBottomWidth) - px(style.paddingBottom);
  lines.overPx = Math.max(0, firstRect.top - half(firstRect.height) - contentTop);
  lines.underPx = Math.max(0, contentBottom - (lastRect.bottom + half(lastRect.height)));
  return lines;
}

/**
 * The box a row takes in the flow. A block row is its own box. A row that is
 * a word of running text (an inline element, paged/textRowChunks) takes its
 * line: the box of an inline element is its glyphs' own height, and the
 * line it stands on is taller by the leading above and below. Null without
 * layout.
 */
function rowBox(row: HTMLElement, scale: PaginationScale, lines: LineHeights | null): RowBox | null {
  const rect = paginationLayoutRect(row, scale);
  if (!(rect.height > 0)) return null;
  if (!lines) return { top: rect.top, bottom: rect.bottom };
  if (getComputedStyle(row).display !== "inline") return { top: rect.top, bottom: rect.bottom };
  // The block the word is set in: its nearest ancestor that is no inline box.
  let block = row.parentElement;
  while (block && getComputedStyle(block).display === "inline") block = block.parentElement;
  if (!block) return { top: rect.top, bottom: rect.bottom };
  let known = lines.get(block);
  if (!known) {
    known = blockLines(block, scale);
    lines.set(block, known);
  }
  // "normal" has no number: the usual fifth of the glyphs' height.
  const half = Math.max(0, (known.leadingPx ?? rect.height * 1.2) - rect.height) / 2;
  return { top: rect.top - half - known.overPx, bottom: rect.bottom + half + known.underPx };
}

/**
 * What a closed box draws under `row` when `row` is the last it holds: the
 * row's space after, collapsed with that of every element it then ends
 * (each becomes the last child of its parent), down to and including the
 * outermost bottom padding or border inside the copy. The space after that
 * edge collapses out of the copy's own box and is no part of its height.
 * Read from the copy as it is drawn now; the copy cut there closes the same
 * way.
 */
function closingEdgePx(box: HTMLElement, row: HTMLElement): number {
  let total = 0;
  let margin = trailingMarginPx(row);
  for (let element = row.parentElement; element; element = element.parentElement) {
    const style = getComputedStyle(element);
    const edge = px(style.paddingBottom) + px(style.borderBottomWidth);
    if (edge > 0) {
      // Padding or a border keeps the space above it inside.
      total += margin + edge;
      margin = px(style.marginBottom);
    } else {
      margin = Math.max(margin, px(style.marginBottom));
    }
    if (element === box) break;
  }
  return total;
}

/** A row's own space after, and that of what ends inside it with no edge
 * between (a list item's last paragraph). */
function trailingMarginPx(row: Element): number {
  let margin = 0;
  for (let element: Element | null = row; element; element = element.lastElementChild) {
    const style = getComputedStyle(element);
    margin = Math.max(margin, px(style.marginBottom));
    if (px(style.paddingBottom) + px(style.borderBottomWidth) > 0) break;
  }
  return margin;
}

/** A row's own space before, and that of what begins inside it with no
 * edge between. */
function leadingMarginPx(row: Element): number {
  let margin = 0;
  for (let element: Element | null = row; element; element = element.firstElementChild) {
    const style = getComputedStyle(element);
    margin = Math.max(margin, px(style.marginTop));
    if (px(style.paddingTop) + px(style.borderTopWidth) > 0) break;
  }
  return margin;
}

/** A piece of the space between two rows: a margin (adjacent ones collapse
 * into the largest) or an edge (padding and border: it takes its room and
 * keeps the margins on its two sides apart). */
type SeamSpace = { margin: number } | { edge: number };

/** The first element above `row` that is the rows' root or goes on across
 * the seam (`flag`): what both rows of the seam stand in. */
function seamContainer(row: HTMLElement, box: HTMLElement, flag: string): Element | null {
  for (let element = row.parentElement; element && element !== box; element = element.parentElement) {
    if (element.hasAttribute(flag) || element.hasAttribute(PAGE_ROWS_ROOT_ATTR)) return element;
  }
  return null;
}

/**
 * How much taller the two copies of a closed-box atom are, apart, than the
 * same rows drawn in one copy: joined, the head no longer closes under its
 * last row and the tail no longer opens over its first, and the space the
 * atom has between those two rows is drawn instead. Zero or less. Null when
 * the copies do not say where their rows stand (atomRowSlices) or have no
 * layout.
 *
 * Exact, so that the test that pulls a row back onto the page before agrees
 * with the test that cut the atom there: a looser one would leave a page a
 * row short after every edit above it, a tighter one would pull the row up
 * and push it down again for ever.
 */
export function rowSliceClosedSeamJoinPx(head: HTMLElement, tail: HTMLElement): number | null {
  const headRows = head.querySelectorAll<HTMLElement>(`[${PAGE_ROW_ATTR}]`);
  const last = headRows[headRows.length - 1];
  const first = tail.querySelector<HTMLElement>(`[${PAGE_ROW_ATTR}]`);
  if (!last || !first) return null;
  const upper = seamContainer(last, head, PAGE_ROW_CONTINUES_ATTR);
  const lower = seamContainer(first, tail, PAGE_ROW_CONTINUED_ATTR);
  if (!upper || !lower) return null;
  const lines: LineHeights = new Map();
  const headScale = paginationLayoutScale(head);
  const tailScale = paginationLayoutScale(tail);
  const lastBox = rowBox(last, headScale, lines);
  const firstBox = rowBox(first, tailScale, lines);
  if (!lastBox || !firstBox) return null;
  const closing = paginationLayoutRect(head, headScale).bottom - lastBox.bottom;
  const opening = firstBox.top - paginationLayoutRect(tail, tailScale).top;
  // The cut planned the head with what it reads as closing a copy under a
  // row. Where the head it got closes with more than that, a row pulled up
  // would be planned short by as much again and pushed back: the pull-up
  // asks for that much more room.
  const unplanned = Math.max(0, closing - closingEdgePx(head, last) - CLOSED_BOX_ALLOWANCE_PX);

  // The space between the two rows in one copy, top to bottom: what ends
  // under the upper row, then what begins over the lower one.
  const spaces: SeamSpace[] = [{ margin: trailingMarginPx(last) }];
  for (let element = last.parentElement; element && element !== upper; element = element.parentElement) {
    const style = getComputedStyle(element);
    const edge = px(style.paddingBottom) + px(style.borderBottomWidth);
    if (edge > 0) spaces.push({ edge });
    spaces.push({ margin: px(style.marginBottom) });
  }
  const opens: SeamSpace[] = [{ margin: leadingMarginPx(first) }];
  for (let element = first.parentElement; element && element !== lower; element = element.parentElement) {
    const style = getComputedStyle(element);
    const edge = px(style.paddingTop) + px(style.borderTopWidth);
    if (edge > 0) opens.push({ edge });
    opens.push({ margin: px(style.marginTop) });
  }
  spaces.push(...opens.reverse());
  let between = 0;
  let margin = 0;
  for (const space of spaces) {
    if ("margin" in space) {
      margin = Math.max(margin, space.margin);
    } else {
      between += margin + space.edge;
      margin = 0;
    }
  }
  between += margin;
  return between - closing - opening + unplanned + CLOSED_SEAM_HYSTERESIS_PX;
}

/** The pull-up test is this much stricter than the cut it has to agree
 * with: a row that fits by less stays where it is, and rounding cannot make
 * the two disagree. */
const CLOSED_SEAM_HYSTERESIS_PX = 0.5;

/**
 * The space the list has, whole, between the last row of one copy and the
 * first row of the next: what a seam between two copies does not draw (a
 * continuation starts at its first row) and a join draws again. Read from
 * two neighbouring rows of either copy; zero for rows that stand edge to
 * edge (a table of contents) and without layout.
 */
export function rowSliceSeamGapPx(head: HTMLElement, tail: HTMLElement): number {
  // The rows of the seam itself, when they state their own spacing (a table
  // of contents' rows carry their level's space before and after inline):
  // the head's last row's space after collapsed with the tail's first row's
  // space before. Read from the rows' own declarations, not from where they
  // are drawn: at the top of a sheet the first row's space before is not
  // drawn, and read from two other rows of the copy (another level, with
  // other spacing) the join came out a level's spacing off. Either way the
  // row on the seam measured one height on one sheet and another on the
  // next, and the 296-page book's last table rows went back and forth
  // between two sheets.
  const headRows = head.querySelectorAll<HTMLElement>(`[${PAGE_ROW_ATTR}]`);
  const last = headRows[headRows.length - 1];
  const first = tail.querySelector<HTMLElement>(`[${PAGE_ROW_ATTR}]`);
  if (last && first) {
    const after = declaredMarginPx(last, "marginBottom");
    const before = declaredMarginPx(first, "marginTop");
    if (after !== null || before !== null) {
      // A document whose paragraph spacing adds up (Word's "Don't use HTML
      // paragraph auto spacing" off) draws both; otherwise they collapse.
      const addsUp = first.closest("[data-spacing-adds-up]")?.getAttribute("data-spacing-adds-up") === "true";
      return addsUp ? (after ?? 0) + (before ?? 0) : Math.max(after ?? 0, before ?? 0);
    }
  }
  const gap = (dom: HTMLElement, fromEnd: boolean): number | null => {
    const rows = dom.querySelectorAll<HTMLElement>(`[${PAGE_ROW_ATTR}]`);
    if (rows.length < 2) return null;
    const scale = paginationLayoutScale(dom);
    const upper = paginationLayoutRect(rows[fromEnd ? rows.length - 2 : 0], scale);
    const lower = paginationLayoutRect(rows[fromEnd ? rows.length - 1 : 1], scale);
    if (!(upper.height > 0) || !(lower.height > 0)) return null;
    return Math.max(0, lower.top - upper.bottom);
  };
  return gap(tail, false) ?? gap(head, true) ?? 0;
}

/** A margin a row states in its own style (px), or null when it states none
 * (or one this reader does not convert). */
function declaredMarginPx(row: HTMLElement, side: "marginTop" | "marginBottom"): number | null {
  const value = row.style[side];
  if (!value) return null;
  const match = /^(-?\d+(?:\.\d+)?)(px|pt)$/.exec(value.trim());
  if (!match) return null;
  const number = Number.parseFloat(match[1]);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, match[2] === "pt" ? ptToPx(number) : number);
}

function validRowCut(range: RowSliceRange, row: number): boolean {
  if (!Number.isInteger(row) || row <= range.start) return false;
  return range.end === null || row < range.end;
}

function copyOf(node: PmNode, start: number, end: number | null): PmNode {
  return node.type.create(withRowSlice(node.attrs, start, end), null, node.marks);
}

/**
 * The row-sliced atom OPENING sheet `boundary + 1` is cut before `row`: a
 * copy drawing the rows before it lands at the end of sheet `boundary`, the
 * existing node continues from `row`.
 */
export function applyRowSliceBoundarySplit(tr: Transaction, boundary: number, row: number): boolean {
  const pages = collectPages(tr.doc);
  const target = pages?.[boundary];
  const source = pages?.[boundary + 1];
  if (!pages || !target || !source) return false;
  const node = source.node.childCount > 0 ? source.node.child(0) : null;
  if (!node || !isRowSlicedAtomType(node.type.name)) return false;
  const range = rowSliceRange(node.attrs);
  if (!validRowCut(range, row)) return false;
  tr.setNodeMarkup(source.pos + 1, undefined, withRowSlice(node.attrs, row, range.end), node.marks);
  tr.insert(target.pos + 1 + target.node.content.size, copyOf(node, range.start, row));
  return tr.docChanged;
}

/**
 * The row-sliced atom OPENING sheet `sheetIndex` is cut before `row` in
 * place: it keeps the rows before the cut, and the continuation, with every
 * block after it, moves to the next sheet.
 */
export function applyRowSliceOverflowSplit(tr: Transaction, sheetIndex: number, row: number): boolean {
  const pages = collectPages(tr.doc);
  const sheet = pages?.[sheetIndex];
  if (!pages || !sheet) return false;
  const followerCount = sheet.node.childCount - 1;
  const node = sheet.node.childCount > 0 ? sheet.node.child(0) : null;
  if (!node || !isRowSlicedAtomType(node.type.name)) return false;
  const range = rowSliceRange(node.attrs);
  if (!validRowCut(range, row)) return false;
  const nodePos = sheet.pos + 1;
  tr.setNodeMarkup(nodePos, undefined, withRowSlice(node.attrs, range.start, row), node.marks);
  tr.insert(nodePos + node.nodeSize, copyOf(node, row, range.end));
  const pageType = tr.doc.type.schema.nodes[PAGE_BLOCK_NODE];
  if (!pageType) return false;
  applyBoundaryMove(tr, pageType, sheetIndex, followerCount + 1);
  return tr.docChanged;
}

/** Re-join two adjacent copies ([a,b) + [b,c) becomes [a,c)); the joined
 * node keeps the head's place and the head's attributes. */
export function applyRowSliceMerge(tr: Transaction, headPos: number, tailPos: number): boolean {
  const head = tr.doc.nodeAt(headPos);
  const tail = tr.doc.nodeAt(tailPos);
  if (!head || !tail || tailPos <= headPos) return false;
  if (head.type !== tail.type || !isRowSlicedAtomType(head.type.name)) return false;
  const headRange = rowSliceRange(head.attrs);
  const tailRange = rowSliceRange(tail.attrs);
  if (headRange.end === null || tailRange.start !== headRange.end) return false;
  const $tail = tr.doc.resolve(tailPos);
  const tailParent = $tail.parent;
  if (tailParent.type.name === PAGE_BLOCK_NODE && tailParent.childCount === 1) {
    const parentPos = $tail.before($tail.depth);
    tr.delete(parentPos, parentPos + tailParent.nodeSize);
  } else {
    tr.delete(tailPos, tailPos + tail.nodeSize);
  }
  tr.setNodeMarkup(headPos, undefined, withRowSlice(head.attrs, headRange.start, tailRange.end), head.marks);
  return tr.docChanged;
}
