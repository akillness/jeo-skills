/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { paragraphKeepFlag } from "../paragraphPagination";
import { joinInlineFragments } from "./joinInlineFragments";
import type { Node as PmNode } from "@tiptap/pm/model";
import {
  clientRectInPaginationLayout,
  paginationLayoutRect,
  paginationLayoutScale,
} from "./paginationGeometry";
import { createRenderedTextHeadProbe } from "./renderedTextHead";

export { SPLIT_CONTINUES_ATTR, SPLIT_CONTINUATION_ATTR, SPLIT_PIECE_OF_ATTR } from "./paginationProjectionKeys";
import { SPLIT_CONTINUES_ATTR, SPLIT_CONTINUATION_ATTR, SPLIT_PIECE_OF_ATTR, splitPieceRoot } from "./paginationProjectionKeys";
import { measurementRange } from "./measurementRange";
import { hasRowSliceKeysJson, isRowSliceTailJson, withoutRowSlice } from "./atomRowSlices";
import { noteStrippedAttrs } from "./projectionJsonMemo";

/** Word widow/orphan floor: a cut leaves >= this many lines on each side. */
export const MIN_SPLIT_LINES = 2;

/** Word permits a one-line head/tail only when widow/orphan control is
 * explicitly disabled. Absence inherits Word's default two-line floor. */
export function minimumTextSplitLines(widowControl: unknown): number {
  return widowControl === false ? 1 : MIN_SPLIT_LINES;
}

export const SPLITTABLE_BLOCK_TYPE = "codeBlock";

/** Text-flow blocks whose soft-wrapped lines may cross a page boundary. */
export const TEXT_SPLITTABLE_TYPES = ["paragraph", "heading"] as const;

export interface CodeLineMetrics {
  /** Height of one rendered text line, px (> 0 to be splittable). */
  lineHeightPx: number;
  /** Total `\n` lines in the block. */
  lineCount: number;
  /** Everything around the text (padding/border/margins), px. */
  chromePx: number;
}

/**
 * How many leading lines fit into `availablePx` of free page space.
 * Returns null when no legal cut exists (space too small, block too
 * short, or metrics unusable — e.g. jsdom's zero-layout world, where
 * splitting must never fire).
 */
export function planHeadLines(
  availablePx: number,
  metrics: CodeLineMetrics,
): number | null {
  const { lineHeightPx, lineCount, chromePx } = metrics;
  if (!Number.isFinite(lineHeightPx) || lineHeightPx <= 0) return null;
  if (lineCount < MIN_SPLIT_LINES * 2) return null;
  const k = Math.floor((availablePx - Math.max(0, chromePx)) / lineHeightPx);
  if (k < MIN_SPLIT_LINES) return null;
  return Math.min(k, lineCount - MIN_SPLIT_LINES);
}















export function measureCodeLineMetrics(
  dom: HTMLElement,
  node: PmNode,
  measuredHeightPx: number,
): CodeLineMetrics {
  const lineCount = node.textContent.split("\n").length;
  const codeEl = dom.querySelector("code") ?? dom;
  const rectHeight = codeEl.getBoundingClientRect().height;
  // WindowCanvas zooms a whole editor window with a CSS transform. DOM flow
  // metrics such as offsetHeight/readCapacity remain in layout pixels, while
  // getBoundingClientRect() reports transformed visual pixels. Mixing those
  // coordinate spaces turns the missing scale into thousands of pixels of
  // fake code-block chrome; planHeadLines then finds no legal cut and the
  // initial reopen pass leaves one permanently overflowing paper sheet.
  //
  // A page sheet is physically height-capped, so its rect/offset ratio is the
  // stable inherited Y scale even when its contents overflow. Fall back to
  // the code block itself for isolated callers/tests outside a page sheet.
  const layoutRectHeight = rectHeight / paginationLayoutScale(dom).y;
  if (layoutRectHeight > 0 && lineCount > 0) {
    return {
      lineHeightPx: layoutRectHeight / lineCount,
      lineCount,
      // Outer height minus the text box: pre padding/border/margins —
      // exact by construction, no font metrics involved.
      chromePx: Math.max(0, measuredHeightPx - layoutRectHeight),
    };
  }
  const styleLineHeight = Number.parseFloat(
    getComputedStyle(codeEl).lineHeight,
  );
  const lineHeightPx =
    Number.isFinite(styleLineHeight) && styleLineHeight > 0
      ? styleLineHeight
      : 0;
  return {
    lineHeightPx,
    lineCount,
    chromePx: Math.max(0, measuredHeightPx - lineHeightPx * lineCount),
  };
}

/** True when the node may be cut by the page boundary. */
export function isSplittableBlock(node: PmNode): boolean {
  if (node.type.name !== SPLITTABLE_BLOCK_TYPE) return false;
  // Word "keep lines together": an explicit keep wins over the split.
  return !paragraphKeepFlag(node, "keepLines");
}

/** Block types the page edge may cut (each with its own unit strategy). */
export function isSplitCapableType(typeName: string): boolean {
  return (
    typeName === SPLITTABLE_BLOCK_TYPE || isTextSplitCapableTypeName(typeName)
  );
}

/** True when the node continues a block cut on the previous page. */
export function isContinuationTail(node: PmNode): boolean {
  return (
    isSplitCapableType(node.type.name) &&
    (node.attrs ?? {})[SPLIT_CONTINUATION_ATTR] === true
  );
}

/** Character offset of the cut: end of line `headLines` (its `\n` is the
 * separator the split consumes; merging restores it). */
export function headTextLength(text: string, headLines: number): number {
  const lines = text.split("\n");
  let length = 0;
  for (let i = 0; i < headLines && i < lines.length; i += 1) {
    length += lines[i].length + (i > 0 ? 1 : 0);
  }
  return length;
}

// ---------------------------------------------------------------------------

// soft-wrapped line boundaries — the general Word case, and the owner's
// "彻底解决超长页" mandate. Lines are measured from the live DOM (Range
// client rects grouped into visual rows); the cut lands at the START of
// the first non-fitting line via posAtCoords, so marks, inline atoms and
// CJK no-space wrapping all survive by construction (the text is merely
// partitioned, never rewritten).
// ---------------------------------------------------------------------------

export function isTextSplitCapableTypeName(typeName: string): boolean {
  return (TEXT_SPLITTABLE_TYPES as readonly string[]).includes(typeName);
}

/** True when a paragraph or heading may be cut at a soft-wrapped line. */
export function isTextSplittableBlock(node: PmNode): boolean {
  if (!isTextSplitCapableTypeName(node.type.name)) return false;
  return !paragraphKeepFlag(node, "keepLines");
}

export interface TextLineBox {
  top: number;
  bottom: number;
  /** Left edge of the line's first fragment in document layout coordinates. */
  left: number;
}














export function groupRectsIntoLines(
  rects: ReadonlyArray<{
    top: number;
    bottom: number;
    left: number;
    width: number;
    height: number;
  }>,
  blockTop: number,
): TextLineBox[] {
  const positive = rects.filter((r) => r.height > 0 && r.width > 0);
  if (positive.length === 0) return [];
  const heights = positive.map((r) => r.height).sort((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)];
  const usable = positive
    .filter((r) => r.height <= median * 1.6 + 2)
    .map((r) => ({
      top: r.top - blockTop,
      bottom: r.bottom - blockTop,
      left: r.left,
    }))
    .sort((a, b) => a.top - b.top || a.left - b.left);
  const rowStep = Math.max(4, median * 0.6);
  const lines: TextLineBox[] = [];
  for (const rect of usable) {
    const current = lines[lines.length - 1];
    if (current && rect.top < current.top + rowStep) {
      current.top = Math.min(current.top, rect.top);
      current.bottom = Math.max(current.bottom, rect.bottom);
      current.left = Math.min(current.left, rect.left);
    } else {
      lines.push({ top: rect.top, bottom: rect.bottom, left: rect.left });
    }
  }
  return lines;
}

/** Measure a text block's visual lines from its live DOM. */
export function measureTextLineBoxes(dom: HTMLElement): TextLineBox[] {
  const doc = dom.ownerDocument;
  if (!doc) return [];
  const range = measurementRange(doc, "textLineBoxes");
  // A world without layout (jsdom's Range has no rect methods) has no lines.
  if (typeof range.getClientRects !== "function") return [];
  range.selectNodeContents(dom);
  const scale = paginationLayoutScale(dom);
  const rects = Array.from(range.getClientRects()).map((rect) =>
    clientRectInPaginationLayout(rect, scale),
  );
  return groupRectsIntoLines(rects, paginationLayoutRect(dom, scale).top);
}




















/**
 * True when `node` belongs to a non-editable inline atom (a note reference,
 * inline math, a chip) strictly inside `root`. Such atoms paint their own
 * box and are not text rows of the block. The block's OWN editability is
 * not an atom: a note body, a table cell or a whole document can be
 * read-only for a moment (collaboration handshake, reopen, view mode), and
 * treating that as "every character is inside an atom" left the planner no
 * text at all, so a note list refused every in-entry cut and paginated a
 * page longer after a reopen than on first open.
 */
export function insideInlineAtom(node: Node, root: Element): boolean {
  const host = node.parentElement?.closest?.('[contenteditable="false"]');
  return Boolean(host && host !== root && root.contains(host));
}

export interface TextCharCut {
  node: Text;
  offset: number;
  /** Top of the cut row relative to the block top (diagnostics). */
  rowTop: number;
}

/** A cut among the rows formulas open: before a formula, or at a text. */
export interface RowCut {
  /** A text node, or a formula's parent when the cut row opens with the formula. */
  node: Node;
  offset: number;
  rowTop: number;
  /** The rows the head keeps, where a formula made them fewer than asked for. */
  rowsKept?: number;
}

/** Where the fragment being cut stands in its paragraph and on its page. */
export interface TextCutContext {
  /** The rows to keep were counted with the rows a formula opens (the line
   * grid's, which band every painted fragment), so the cut is too. */
  formulasOpenRows?: boolean;
  /** Auto leading the head's last row may hang below the foot (Word's
   * page-bottom credit, pageEdgeLeading). Applied where no rendered head
   * decides: the rows' own line-box bottoms are compared with the space. */
  footCreditPx?: number;
  /** The page gives the head no page-bottom credit (notes stand below it:
   * LedgerSplitRequest.noFootCredit): a rendered head is judged by its whole
   * height, not less its last row's Auto leading. */
  noFootCredit?: boolean;
  /** Rows of the same paragraph in fragments before this one that the head
   * already holds: Word's orphan floor counts the paragraph's lines. */
  rowsBefore?: number;
  /** Rows of the same paragraph in fragments after this one: they go with
   * the tail, so Word's widow floor counts them too. */
  rowsAfter?: number;
}

/**
 * With `measureLineBoxBottom`, `availablePx` is the page space left for the
 * head: a row is kept when the head fragment ending with it, less the Auto
 * leading its last line may hang below the page edge, fits that space. The
 * glyph-box search only proposes the row; the rendered head decides.
 */
/** `window.__docsPictureRowWidowOff = true` asks the older reading (the
 * widow floor counts rows of text only), for an A/B of one build. */
function pictureRowWidowOff(win: Window | null): boolean {
  return (win as (Window & { __docsPictureRowWidowOff?: boolean }) | null)?.__docsPictureRowWidowOff === true;
}

/** How many rows of in-line pictures `dom` holds wholly below `textBottom`
 * (block coordinates of the planner: layout px from the block's top). */
function pictureRowsBelow(dom: HTMLElement, textBottom: number, scaleY: number, blockTop: number): number {
  if (pictureRowWidowOff(dom.ownerDocument.defaultView)) return 0;
  const tops: number[] = [];
  for (const picture of dom.querySelectorAll<HTMLElement>('.note-editor-image-resizable[data-inline-picture="true"]')) {
    if (picture.hasAttribute("data-float-mode")) continue;
    const image = picture.querySelector("img") ?? picture;
    const rect = image.getBoundingClientRect();
    if (!(rect.height > 0)) continue;
    const top = rect.top / scaleY - blockTop;
    if (top < textBottom - 0.5) continue;
    if (!tops.some((seen) => Math.abs(seen - top) < 1)) tops.push(top);
  }
  return tops.length;
}

/** `window.__docsCutWholeByLineBoxOff = true` (A/B): with no rendered head,
 * a block is whole when its last glyphs fit, as before. */
function cutWholeByLineBoxOff(win: Window | null): boolean {
  return (win as (Window & { __docsCutWholeByLineBoxOff?: boolean }) | null)?.__docsCutWholeByLineBoxOff === true;
}

/** Bottom of the block's last line box (layout px from its top): its content
 * box's bottom, when that lies within one line of the last glyphs' bottom
 * (`glyphBottom`) -- below them by the leading a glyph box taller than its
 * line gives back. Farther down stands something else (a picture row, an
 * empty line), and the glyphs' bottom is kept. */
function lastLineBoxBottom(dom: HTMLElement, scale: { y: number }, glyphBottom: number): number {
  const style = getComputedStyle(dom);
  const rect = dom.getBoundingClientRect();
  const contentBottom = rect.height / scale.y -
    (Number.parseFloat(style.paddingBottom) || 0) - (Number.parseFloat(style.borderBottomWidth) || 0);
  const linePx = Number.parseFloat(style.lineHeight);
  const pitch = Number.isFinite(linePx) && linePx > 0 ? linePx : 1.2 * (Number.parseFloat(style.fontSize) || 16);
  return contentBottom > glyphBottom && contentBottom - glyphBottom < pitch ? contentBottom : glyphBottom;
}

export function planTextCutByChars(
  dom: HTMLElement,
  availablePx: number,
  minLines: number,
  measureLineBoxBottom: boolean,
  rowsToKeep: number,
  context: TextCutContext & { formulasOpenRows: true },
): RowCut | null;
export function planTextCutByChars(
  dom: HTMLElement,
  availablePx: number,
  minLines?: number,
  measureLineBoxBottom?: boolean,
  rowsToKeep?: number | null,
  context?: TextCutContext,
): TextCharCut | null;
export function planTextCutByChars(
  dom: HTMLElement,
  availablePx: number,
  minLines: number = MIN_SPLIT_LINES,
  measureLineBoxBottom = false,
  rowsToKeep: number | null = null,
  context: TextCutContext = {},
): RowCut | null {
  const footCreditPx = Number.isFinite(context.footCreditPx) && context.footCreditPx! > 0 ? context.footCreditPx! : 0;
  const rowsBefore = Number.isInteger(context.rowsBefore) && context.rowsBefore! > 0 ? context.rowsBefore! : 0;
  const rowsAfter = Number.isInteger(context.rowsAfter) && context.rowsAfter! > 0 ? context.rowsAfter! : 0;
  const doc = dom.ownerDocument;
  if (!doc || !(availablePx > 0)) return null;
  // Text drawn nowhere (deleted words the final view hides, hidden text):
  // no glyph box, so the searches below -- which take a character without
  // one for a character past the space -- stopped at the first of them.
  // Corpus R329-D05 p1: an abstract cut where its first deleted sentence
  // begins, eight rows of page 1 left empty; Word fills them.
  // `window.__docsCutHiddenTextOff = true` keeps the older cut (A/B).
  const undrawn = new Map<Element, boolean>();
  const hiddenTextOff =
    (doc.defaultView as (Window & { __docsCutHiddenTextOff?: boolean }) | null)?.__docsCutHiddenTextOff === true;
  const drawnNowhere = (element: Element | null): boolean => {
    if (hiddenTextOff || !element || element === dom) return false;
    const known = undrawn.get(element);
    if (known !== undefined) return known;
    const hidden = getComputedStyle(element).display === "none" || drawnNowhere(element.parentElement);
    undrawn.set(element, hidden);
    return hidden;
  };
  const walker = doc.createTreeWalker(dom, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      insideInlineAtom(node, dom) || drawnNowhere(node.parentElement)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  const segments: Array<{ node: Text; start: number }> = [];
  let total = 0;
  let walked = walker.nextNode() as Text | null;
  while (walked) {
    if (walked.length > 0) {
      segments.push({ node: walked, start: total });
      total += walked.length;
    }
    walked = walker.nextNode() as Text | null;
  }
  if (total < 4) return null;
  const scale = paginationLayoutScale(dom);
  const blockTop = paginationLayoutRect(dom, scale).top;
  const range = measurementRange(doc, "lineBoxStyles");
  const lineBoxStyles = new Map<Text, { height: number; relativeTop: number } | null>();
  const trailingLineSpace = (text: Text, glyphHeight: number): number => {
    if (!measureLineBoxBottom) return 0;
    if (!lineBoxStyles.has(text)) {
      let element = text.parentElement;
      let height = 0;
      let relativeTop = 0;
      let supported = true;
      const leafStyle = element && getComputedStyle(element);
      while (element) {
        const style = getComputedStyle(element);
        const lineHeight = Number.parseFloat(style.lineHeight);
        if (!Number.isFinite(lineHeight) || lineHeight < 0 ||
            (style.transform && style.transform !== "none") ||
            (style.verticalAlign && style.verticalAlign !== "baseline" &&
              !/^-?\d+(?:\.\d+)?px$/.test(style.verticalAlign))) {
          supported = false;
          break;
        }
        // A zero-height wrapper supplies no strut. Other inline struts can
        // share this glyph's baseline only with the same font metrics.
        if (lineHeight > 0) {
          if (style.fontFamily !== leafStyle?.fontFamily ||
              style.fontSize !== leafStyle?.fontSize ||
              style.fontWeight !== leafStyle?.fontWeight ||
              style.fontStyle !== leafStyle?.fontStyle) {
            supported = false;
            break;
          }
          height = Math.max(height, lineHeight);
        }
        if (element === dom) break;
        if (style.position === "relative") {
          if (style.top && style.top !== "auto") relativeTop += Number.parseFloat(style.top) || 0;
          else if (style.bottom && style.bottom !== "auto") relativeTop -= Number.parseFloat(style.bottom) || 0;
        } else if (style.position && style.position !== "static") {
          supported = false;
          break;
        }
        element = element.parentElement;
      }
      lineBoxStyles.set(text, supported && height > 0 ? { height, relativeTop } : null);
    }
    const metrics = lineBoxStyles.get(text);
    // Known CSS half-leading and relative paint offsets give the actual
    // line-box edge. An inline layout the walk cannot prove (mixed fonts on
    // one baseline, transforms) falls back to the block's own strut: the
    // glyph sits inside a line box of the block's computed line-height, so
    // the space below it is at most half that leading.
    if (metrics) {
      return Math.max(0, (metrics.height - glyphHeight) / 2 - metrics.relativeTop);
    }
    const strut = Number.parseFloat(getComputedStyle(dom).lineHeight);
    return Number.isFinite(strut) && strut > glyphHeight ? (strut - glyphHeight) / 2 : 0;
  };
  // jsdom's Range has no getBoundingClientRect at all — refuse cleanly.
  if (typeof range.getBoundingClientRect !== "function") return null;
  const rectAt = (index: number): { top: number; bottom: number; glyphBottom: number; left: number; right: number } | null => {
    let lo = 0;
    let hi = segments.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (segments[mid].start <= index) lo = mid;
      else hi = mid - 1;
    }
    const seg = segments[lo];
    const offset = index - seg.start;
    range.setStart(seg.node, offset);
    range.setEnd(seg.node, Math.min(offset + 1, seg.node.length));
    // WebKit can return a zero-width rectangle at the preceding line's end
    // alongside the glyph's painted rectangle on the next line. Their union
    // spans BOTH rows, so its top would make the cut consume the next line's
    // first glyph. Measure the painted fragment instead; zero-advance glyphs
    // still retain their last non-empty-height fragment.
    const fragments =
      typeof range.getClientRects === "function"
        ? Array.from(range.getClientRects()).filter((rect) => rect.height > 0)
        : [];
    const rect =
      fragments.filter((fragment) => fragment.width > 0).at(-1) ??
      fragments.at(-1) ??
      range.getBoundingClientRect();
    if (!(rect.height > 0) && !(rect.width > 0)) return null;
    return {
      top: rect.top / scale.y - blockTop,
      bottom: rect.bottom / scale.y - blockTop +
        trailingLineSpace(seg.node, rect.height / scale.y),
      glyphBottom: rect.bottom / scale.y - blockTop,
      left: rect.left,
      right: rect.right,
    };
  };
  // Glyphs of one row share its baseline, so their boxes overlap by more
  // than half the smaller box whatever their faces and sizes; boxes of
  // distinct rows are a line pitch apart. Box tops alone are no row identity:
  // a smaller code face on the same row starts lower.
  type GlyphBox = { top: number; glyphBottom: number };
  const sameRow = (a: GlyphBox, b: GlyphBox): boolean =>
    Math.min(a.glyphBottom, b.glyphBottom) - Math.max(a.top, b.top) >
    Math.min(a.glyphBottom - a.top, b.glyphBottom - b.top) / 2;
  const laterRow = (a: GlyphBox, reference: GlyphBox): boolean =>
    !sameRow(a, reference) && a.top > reference.top;
  const earlierRow = (a: GlyphBox, reference: GlyphBox): boolean =>
    !sameRow(a, reference) && a.top < reference.top;
  const first = rectAt(0);
  const last = rectAt(total - 1);
  if (!first || !last) return null;
  // Zero-layout worlds (jsdom): every char reports the same degenerate
  // geometry — refuse.
  if (!(last.bottom > first.bottom) || !(first.bottom > 0)) return null;
  // Start of the next row after the char at `index`: first char whose top
  // clears that char's row.
  type RowRect = NonNullable<ReturnType<typeof rectAt>>;
  const nextRowStart = (index: number): { index: number; rect: RowRect } | null => {
    const rowRect = rectAt(index);
    if (!rowRect) return null;
    let lo2 = index + 1;
    let hi2 = total - 1;
    while (lo2 < hi2) {
      const mid = (lo2 + hi2) >> 1;
      const rect = rectAt(mid);
      if (rect && laterRow(rect, rowRect)) hi2 = mid;
      else lo2 = mid + 1;
    }
    const rect = rectAt(lo2);
    return rect && laterRow(rect, rowRect) ? { index: lo2, rect } : null;
  };
  // A row of nothing but in-line pictures between the row of the character
  // before `index` and the row `index` opens: a cut may fall right after that
  // character, sending the pictures down with the tail. Word breaks a page
  // there (corpus R367-D26 p9: a typed tab on a row of its own, then a
  // 451 pt picture; Word keeps the tab's row and opens page 10 with the
  // picture -- probe tabend T1), where cutting only at rows of text took
  // the tab's row along with the picture.
  // `window.__docsPictureRowCutOff = true` keeps the older cut (A/B).
  const pictureRowCutOff =
    (doc.defaultView as (Window & { __docsPictureRowCutOff?: boolean }) | null)?.__docsPictureRowCutOff === true;
  let inlinePictures: HTMLElement[] | null = null;
  const segmentOf = (index: number): { node: Text; start: number } => {
    let lo6 = 0;
    let hi6 = segments.length - 1;
    while (lo6 < hi6) {
      const mid = (lo6 + hi6 + 1) >> 1;
      if (segments[mid].start <= index) lo6 = mid;
      else hi6 = mid - 1;
    }
    return segments[lo6];
  };
  const picturesBefore = (index: number): { top: number; bottom: number } | null => {
    if (pictureRowCutOff || index <= 0 || index >= total) return null;
    const before = segmentOf(index - 1).node;
    const after = segmentOf(index).node;
    if (before === after) return null;
    inlinePictures ??= Array.from(dom.querySelectorAll<HTMLElement>('.note-editor-image-resizable[data-inline-picture="true"]'))
      .filter((picture) => !picture.hasAttribute("data-float-mode"));
    const row = rectAt(index - 1);
    if (!row) return null;
    let foundTop = Number.POSITIVE_INFINITY;
    let foundBottom = Number.NEGATIVE_INFINITY;
    for (const picture of inlinePictures) {
      if (!(before.compareDocumentPosition(picture) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
      if (!(picture.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
      const image = picture.querySelector("img") ?? picture;
      const rect = image.getBoundingClientRect();
      if (!(rect.height > 0)) continue;
      const top = rect.top / scale.y - blockTop;
      const bottom = rect.bottom / scale.y - blockTop;
      // On the character's own row it is no row of its own.
      if (top < row.glyphBottom - 0.5) return null;
      foundTop = Math.min(foundTop, top);
      foundBottom = Math.max(foundBottom, bottom);
    }
    return Number.isFinite(foundTop) ? { top: foundTop, bottom: foundBottom } : null;
  };
  // Start of the row that holds the nearest painted character before
  // `index`: the first character on or after that row's top band.
  const rowStartBefore = (index: number): { index: number; rect: RowRect } | null => {
    let reference = index - 1;
    let rowRect = reference >= 0 ? rectAt(reference) : null;
    while (!rowRect && reference > 0) {
      reference -= 1;
      rowRect = rectAt(reference);
    }
    if (!rowRect) return null;
    let lo4 = 0;
    let hi4 = reference;
    while (lo4 < hi4) {
      const mid = (lo4 + hi4) >> 1;
      let probe = mid;
      let rect = rectAt(probe);
      while (!rect && probe < hi4) {
        probe += 1;
        rect = rectAt(probe);
      }
      if (!rect || !earlierRow(rect, rowRect)) hi4 = mid;
      else lo4 = probe + 1;
    }
    let start = lo4;
    let startRect = rectAt(start);
    while (!startRect && start < reference) {
      start += 1;
      startRect = rectAt(start);
    }
    return startRect ? { index: start, rect: startRect } : null;
  };
  // The rendered head decides which row ends the page: from the row the
  // glyph boxes propose, step down while the head is too tall and up while
  // the next row's head still fits.
  // A head the environment does not lay out at all (its first measurement is
  // unavailable) is the same as having no probe: the glyph rule decides.
  const confirmRenderedHeadRow = (probe: NonNullable<ReturnType<typeof createRenderedTextHeadProbe>>): {
    index: number;
    rect: { top: number; bottom: number };
    endOfPrevious?: true;
  } | "unmeasured" | null => {
    const fits = (index: number, endOfPrevious = false): boolean | null => {
      const head = probe.measure(index, endOfPrevious);
      return head ? head.heightPx - (context.noFootCredit ? 0 : head.creditPx) <= availablePx + 1e-6 : null;
    };
    // The head that stops before the picture rows ahead of `index`, when it fits.
    const beforePictures = (index: number): { index: number; rect: { top: number; bottom: number }; endOfPrevious: true } | null => {
      const pictures = picturesBefore(index);
      return pictures && fits(index, true) === true ? { index, rect: pictures, endOfPrevious: true } : null;
    };
    let proposal: { index: number; rect: { top: number; bottom: number } } | null;
    if (last.bottom <= availablePx) {
      // Every glyph fits, yet the block does not: the largest head keeps
      // every row but the last.
      proposal = rowStartBefore(total);
    } else {
      let lo5 = 0;
      let hi5 = total - 1;
      while (lo5 < hi5) {
        const mid = (lo5 + hi5 + 1) >> 1;
        const rect = rectAt(mid);
        if (rect && rect.bottom <= availablePx) lo5 = mid;
        else hi5 = mid - 1;
      }
      // With no glyph inside the space, the smallest head (one row) is the
      // candidate; the rendered head then confirms or refuses it at once.
      proposal = nextRowStart(lo5);
    }
    if (!proposal || proposal.index <= 0) return null;
    let cut: { index: number; rect: { top: number; bottom: number }; endOfPrevious?: true } = proposal;
    const verdict = fits(cut.index);
    if (verdict === null) return "unmeasured";
    if (verdict) {
      for (;;) {
        const further = nextRowStart(cut.index);
        if (!further) break;
        if (fits(further.index) !== true) {
          cut = beforePictures(further.index) ?? cut;
          break;
        }
        cut = further;
      }
    } else {
      const atPictures = beforePictures(cut.index);
      if (atPictures) return atPictures;
      for (;;) {
        const earlier = rowStartBefore(cut.index);
        if (!earlier || earlier.index <= 0) return null;
        cut = earlier;
        const fitsEarlier = fits(cut.index);
        if (fitsEarlier === null) return null;
        if (fitsEarlier) break;
      }
    }
    return cut;
  };
  let lo = 0;
  let next: { index: number; rect: { top: number; bottom: number }; endOfPrevious?: true } | null;
  if (rowsToKeep !== null) {
    // The caller decided how many rows fit (grid slots, or Word's leading
    // rule applied to the row pitch); walk that many row starts. Painted
    // glyph edges only locate rows, they never decide the count, so a
    // sub-pixel shift of the block on the page cannot change the cut.
    if (!(rowsToKeep >= 1)) return null;
    if (context.formulasOpenRows) {
      const opened = cutAmongInlineAtoms(dom, segments, rowsToKeep, minLines, { rowsBefore, rowsAfter }, {
        rectAt,
        nextRowStart,
        blockTop,
        scaleY: scale.y,
      });
      if (opened !== undefined) return opened;
    }
    let start = 0;
    let startRect = first;
    for (let row = 0; row < rowsToKeep; row += 1) {
      const step = nextRowStart(start);
      if (!step) return null; // fewer rows than asked for — nothing to cut
      start = step.index;
      startRect = step.rect;
    }
    next = { index: start, rect: startRect };
  } else {
    const headProbe = measureLineBoxBottom ? createRenderedTextHeadProbe(dom, segments) : null;
    let confirmed: ReturnType<typeof confirmRenderedHeadRow> = "unmeasured";
    if (headProbe) {
      try {
        confirmed = confirmRenderedHeadRow(headProbe);
      } finally {
        headProbe.dispose();
      }
    }
    if (confirmed === null) return null;
    if (confirmed !== "unmeasured") {
      next = confirmed;
    } else {
      // A row's line box may end inside the foot credit (no rendered head
      // judges it here, as in a column of a projected sheet).
      const rowSpacePx = availablePx + footCreditPx;
      if (last.bottom <= rowSpacePx) {
        // The block is whole by its last line box, not by its last glyphs:
        // under Auto leading the glyphs end above the box (the half-leading
        // a glyph box taller than the line takes back). Judged by the glyphs
        // (and the credit on top), room that the page's own rule finds a
        // line short (the box less the credit) read as the whole block and
        // nothing was cut, so the caller moved the paragraph on whole --
        // corpus R432-D07 on a page of column regions: 11 lines, 206 px,
        // last glyphs ending at 203.9, room 203.07 with 2.4 px of credit.
        // Then every row but the last is the largest head, as where a
        // rendered head decides.
        const boxBottom = !measureLineBoxBottom || cutWholeByLineBoxOff(doc.defaultView) ? last.bottom : lastLineBoxBottom(dom, scale, last.bottom);
        if (boxBottom <= rowSpacePx) return null; // whole block fits — no cut
        const before = rowStartBefore(total);
        if (!before || before.index <= 0) return null;
        next = before;
      } else {
        // 2) last fitting character.
        lo = 0;
        let hi = total - 1;
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1;
          const rect = rectAt(mid);
          if (rect && rect.bottom <= rowSpacePx) lo = mid;
          else hi = mid - 1;
        }
        const fitRect = rectAt(lo);
        if (!fitRect || fitRect.bottom > rowSpacePx) return null;
        // 3) start of the next row: first char whose top clears the fit row.
        next = nextRowStart(lo);
        if (!next) return null;
        // Picture rows before it that do not fit stay with the tail.
        const pictures = picturesBefore(next.index);
        if (pictures && pictures.bottom > rowSpacePx) next = { index: next.index, rect: pictures, endOfPrevious: true };
      }
    }
  }
  // 4) Word's widow/orphan control: `minLines` rows on each side. A tail
  // left short takes rows from the head, as Word moves the line before a
  // widow to the next page; a head that then falls below the floor keeps
  // the block whole.
  // Rows the paragraph holds in its other fragments count on their side.
  let cut: { index: number; rect: { top: number; bottom: number }; endOfPrevious?: true } = next;
  // A cut before picture rows: they are the tail's first row.
  let tailRows = 1 + rowsAfter + (cut.endOfPrevious ? 1 : 0);
  let pictureRows: number | null = null;
  for (let probe = cut; tailRows < minLines; tailRows += 1) {
    const step = nextRowStart(probe.index);
    if (!step) {
      // Past its last row of text the paragraph may hold a line of nothing
      // but an in-line picture, a line of Word's: the widow floor counts it
      // (corpus R430-D07: "(Fig. 4)." and the figure under it went to the
      // next page together, Word's page keeping the row before them).
      pictureRows ??= pictureRowsBelow(dom, last.glyphBottom, scale.y, blockTop);
      if (pictureRows > 0) { pictureRows -= 1; continue; }
      break;
    }
    probe = step;
  }
  for (let missing = minLines - tailRows; missing > 0; missing -= 1) {
    const earlier = rowStartBefore(cut.index);
    if (!earlier || earlier.index <= 0) return null;
    cut = earlier;
  }
  let headRows = rowsBefore;
  for (let probe = cut.index; headRows < minLines && probe > 0; headRows += 1) {
    const earlier = rowStartBefore(probe);
    if (!earlier) return null;
    probe = earlier.index;
  }
  if (headRows < minLines) return null;
  const lo2 = cut.index;
  const cutRect = cut.rect;
  if (cut.endOfPrevious) {
    const segment = segmentOf(lo2 - 1);
    return { node: segment.node, offset: lo2 - segment.start, rowTop: cutRect.top };
  }
  let lo3 = 0;
  let hi3 = segments.length - 1;
  while (lo3 < hi3) {
    const mid = (lo3 + hi3 + 1) >> 1;
    if (segments[mid].start <= lo2) lo3 = mid;
    else hi3 = mid - 1;
  }
  return {
    node: segments[lo3].node,
    offset: lo2 - segments[lo3].start,
    rowTop: cutRect.top,
  };
}

interface RowGlyphs {
  rectAt: (index: number) => { top: number; left: number; right: number } | null;
  nextRowStart: (index: number) => { index: number; rect: { top: number } } | null;
  blockTop: number;
  scaleY: number;
}

/**
 * The cut before the row `rowsToKeep` of a paragraph whose rows formulas open.
 * Rows counted by their words alone miss a row a formula stands on by itself,
 * and take the first word after a formula for the start of the formula's row:
 * cut there, the row stayed on the head, one row taller than the head planned.
 * The page then found the head too tall and moved the cut back, and the plan
 * took it forward again, on every pass (a 300-page book's page 56, a 64 px
 * paragraph, until the cycle watch stopped it). A row a formula opens is cut
 * before the formula. A formula that breaks over two rows cannot be parted, so
 * the second of its rows is no place to cut: the head keeps a row less.
 *
 * `undefined` when no formula has a say: the rows are the words' rows.
 */
function cutAmongInlineAtoms(
  dom: HTMLElement,
  segments: ReadonlyArray<{ node: Text; start: number }>,
  rowsToKeep: number,
  minLines: number,
  context: { rowsBefore: number; rowsAfter: number },
  glyphs: RowGlyphs,
): RowCut | null | undefined {
  const win = dom.ownerDocument.defaultView;
  if (!win || win.getComputedStyle(dom).direction === "rtl") return undefined;
  const atoms = Array.from(dom.querySelectorAll<HTMLElement>('[contenteditable="false"]'))
    .filter((atom) => !insideInlineAtom(atom, dom));
  if (atoms.length === 0) return undefined;
  // Every row's opening, in the order the rows stand. A fragment that starts
  // left of where the last one ended stands on a new row; heights say nothing
  // here, a tall formula reaches into the rows around it.
  type Opening = { top: number; textIndex: number; atom: HTMLElement | null; insideAtom: boolean };
  const openings: Opening[] = [];
  const textStarts: Array<{ index: number; top: number }> = [];
  for (let row: { index: number; rect: { top: number } } | null = { index: 0, rect: glyphs.rectAt(0) ?? { top: 0 } };
    row;
    row = glyphs.nextRowStart(row.index)) {
    textStarts.push({ index: row.index, top: row.rect.top });
  }
  const totalChars = segments.length ? segments[segments.length - 1].start + segments[segments.length - 1].node.length : 0;
  let segmentAt = 0;
  const textIndexOf = (atom: HTMLElement): number => {
    while (segmentAt < segments.length &&
      (segments[segmentAt].node.compareDocumentPosition(atom) & Node.DOCUMENT_POSITION_FOLLOWING)) segmentAt += 1;
    return segmentAt < segments.length ? segments[segmentAt].start : totalChars;
  };
  let right = Number.NEGATIVE_INFINITY;
  /** The text index the last atom stands before: words after it end the row further on. */
  let lastAtomAt = -1;
  const wordsReach = (index: number) => {
    if (index - 1 < 0 || index - 1 < lastAtomAt) return;
    const before = glyphs.rectAt(index - 1);
    if (before) right = before.right;
  };
  let nextText = 0;
  const walkText = (upTo: number) => {
    for (; nextText < textStarts.length && textStarts[nextText].index < upTo; nextText += 1) {
      const start = textStarts[nextText];
      const rect = glyphs.rectAt(start.index);
      if (!rect) continue;
      wordsReach(start.index);
      if (openings.length === 0 || rect.left < right - 1) {
        openings.push({ top: start.top, textIndex: start.index, atom: null, insideAtom: false });
      }
      right = rect.right;
    }
  };
  let led = false;
  for (const atom of atoms) {
    const at = textIndexOf(atom);
    walkText(at);
    wordsReach(at);
    const rects = Array.from(atom.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
    rects.forEach((rect, index) => {
      if (openings.length === 0 || rect.left < right - 1) {
        openings.push({ top: rect.top / glyphs.scaleY - glyphs.blockTop, textIndex: at, atom, insideAtom: index > 0 });
        led = true;
      }
      right = rect.right;
    });
    lastAtomAt = at;
  }
  walkText(Number.POSITIVE_INFINITY);
  if (!led) return undefined;
  let kept = rowsToKeep;
  const tailShort = () => openings.length - kept + context.rowsAfter < minLines;
  while (kept > 0 && (kept >= openings.length || openings[kept].insideAtom || tailShort())) kept -= 1;
  if (kept === 0 || kept + context.rowsBefore < minLines) return null;
  const opening = openings[kept];
  if (opening.atom) {
    const parent = opening.atom.parentNode;
    if (!parent) return null;
    return { node: parent, offset: Array.prototype.indexOf.call(parent.childNodes, opening.atom), rowTop: opening.top, rowsKept: kept };
  }
  let segment = 0;
  while (segment + 1 < segments.length && segments[segment + 1].start <= opening.textIndex) segment += 1;
  return { node: segments[segment].node, offset: opening.textIndex - segments[segment].start, rowTop: opening.top, rowsKept: kept };
}

/**
 * A paragraph of in-line pictures with next to no words breaks between its
 * pictures, each on a line of its own: no character stands on those lines to
 * cut at. Word flows them over its pages. Stood whole, five page-tall pictures
 * ran 2,000 px past one page's foot (corpus R282-D07). The head keeps the pictures
 * ending within `availablePx`; a page that holds nothing else keeps its first
 * however tall. `fromTop`: the head starts there (a cut made above it).
 */
export function planPictureLineCut(
  dom: HTMLElement,
  availablePx: number,
  fromTop: number,
  pageEmpty: boolean,
): { node: Node; offset: number; rowTop: number } | null {
  const scale = paginationLayoutScale(dom);
  const blockTop = paginationLayoutRect(dom, scale).top;
  const lines = Array.from(dom.querySelectorAll<HTMLElement>('[data-inline-picture="true"], img[data-inline-picture]'))
    .filter((picture) => !picture.parentElement?.closest('[data-inline-picture="true"]'))
    .map((picture) => ({ picture, rect: paginationLayoutRect(picture, scale) }))
    .map(({ picture, rect }) => ({ picture, top: rect.top - blockTop, bottom: rect.bottom - blockTop }))
    .filter((line) => line.top >= fromTop - 0.5);
  if (lines.length < 2) return null;
  let kept = 0;
  while (kept < lines.length && lines[kept].bottom <= availablePx + 1e-6) kept += 1;
  if (kept === 0 && pageEmpty) kept = 1;
  if (kept === 0 || kept >= lines.length) return null;
  const next = lines[kept];
  // On the line of the one before it, the cut would part them from each other.
  if (next.top < lines[kept - 1].bottom - 0.5) return null;
  const parent = next.picture.parentNode;
  if (!parent) return null;
  return { node: parent, offset: Array.prototype.indexOf.call(parent.childNodes, next.picture), rowTop: next.top };
}

// ---------------------------------------------------------------------------
// Endnote-area cuts.  Whole entries remain the cheapest legal boundary, but a
// single Word endnote may itself be several pages long.  In that case the

// whole entry as an atom is exactly what produced the historical 10-page-tall
// "sheet".  The cut cursor is expressed in semantic text offsets, never pixels,
// so serialization and a font reflow cannot lose or duplicate note text.
// ---------------------------------------------------------------------------

export interface NoteEntryMetrics {
  /** Offset of each rendered entry's top from the FIRST entry's top, plus
   * one final element: the last entry's bottom (length = entries + 1).
   * entryTops[k] is therefore the height of entries 0..k-1 with their
   * inter-entry gaps. */
  entryTops: number[];
  /** Node outer height minus the entries span (separator, padding…). */
  chromePx: number;
}

/** Measure the rendered entries of a footnoteList NodeView. Returns null
 * when fewer than 2 entries render or the world has no layout (jsdom) —
 * slicing must never fire there. */
export function measureNoteEntryMetrics(
  dom: HTMLElement,
  measuredHeightPx: number,
): NoteEntryMetrics | null {
  const entries = Array.from(
    dom.querySelectorAll<HTMLElement>(".mrnote-footnote-list__entry"),
  ).filter((el) => el.dataset.noteMirror !== "true");
  if (entries.length < 2) return null;
  const scale = paginationLayoutScale(dom);
  const rects = entries.map((el) => paginationLayoutRect(el, scale));
  const base = rects[0].top;
  const span = rects[rects.length - 1].bottom - base;
  if (!(span > 0) || !(rects[0].height > 0)) return null;
  const entryTops = rects.map((rect) => rect.top - base);
  entryTops.push(span);
  return {
    entryTops,
    chromePx: Math.max(0, measuredHeightPx - span),
  };
}

/** Max k (1 ≤ k < entries) whose first-k-entries slice fits the space. */
export function planNoteHeadEntries(
  availablePx: number,
  metrics: NoteEntryMetrics,
): number | null {
  const count = metrics.entryTops.length - 1;
  if (count < 2) return null;
  for (let k = count - 1; k >= 1; k -= 1) {
    if (metrics.chromePx + metrics.entryTops[k] <= availablePx) return k;
  }
  return null;
}

/** A boundary inside the ordered endnote stream. `offset=0` is the boundary
 * before `entry`; a positive offset is a character boundary inside it. */
export interface NoteSliceCursor {
  entry: number;
  offset: number;
}

function textOffsetWithin(
  root: HTMLElement,
  target: Text,
  targetOffset: number,
): number | null {
  const doc = root.ownerDocument;
  if (!doc) return null;
  // A rich note body renders its paragraph breaks as <br>; each one is a
  
  const walker = doc.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: (node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // A note formula (`data-note-math`) is one character of the body,
          // like a <br>; its drawing's text (inside the uneditable atom) is
          // not the note's and is rejected below.
          if ((node as Element).hasAttribute("data-note-math")) return NodeFilter.FILTER_ACCEPT;
          return (node as Element).tagName === "BR"
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP;
        }
        return insideInlineAtom(node, root)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      },
    },
  );
  let total = 0;
  let current = walker.nextNode() as Node | null;
  while (current) {
    if (current === target) {
      const text = current as Text;
      return total + Math.max(0, Math.min(targetOffset, text.length));
    }
    total += current.nodeType === Node.ELEMENT_NODE ? 1 : (current as Text).length;
    current = walker.nextNode() as Node | null;
  }
  return null;
}

/**
 * Plan the leading portion of a rendered footnoteList that fits in
 * `availablePx`.  The NodeView stamps every visible entry with its ORIGINAL
 * stream index and fragment start offset, allowing the returned cursor to stay
 * stable even when the current node is itself a continuation slice.
 *
 * Preference order matches Word: keep whole note entries when possible; when
 * the next entry crosses the page edge, cut its body at a visible row while
 * preserving the two-line widow/orphan floor.  Returns null when no legal
 * semantic cut exists (zero-layout tests, a genuinely non-text object, or less
 * than two rows on either side).
 */
/** The note body's row pitch and the Word Auto leading it may hang below
 * the last kept row: the body renders at a multiple of its font size, and
 * Word lets `pitch - size` of that line cross the page bottom. */
export function noteBodyLineMetrics(body: HTMLElement): { pitchPx: number; creditPx: number } {
  const style = getComputedStyle(body);
  const pitchPx = Number.parseFloat(style.lineHeight);
  const sizePx = Number.parseFloat(style.fontSize);
  if (!Number.isFinite(pitchPx) || !(pitchPx > 0)) return { pitchPx: 0, creditPx: 0 };
  const creditPx = Number.isFinite(sizePx) && pitchPx > sizePx ? pitchPx - sizePx : 0;
  return { pitchPx, creditPx };
}

/** Rows of `body` that fit in `availablePx` by the arithmetic rule above.
 * Layout resolves to 1/64 px, so equality within that unit is a fit. */
export function noteBodyRowsThatFit(body: HTMLElement, availablePx: number): number {
  if (!(availablePx > 0)) return 0;
  const { pitchPx, creditPx } = noteBodyLineMetrics(body);
  if (!(pitchPx > 0)) return noteParagraphLineRowsThatFit(body, availablePx);
  return Math.max(0, Math.floor((availablePx + creditPx + 1 / 64) / pitchPx));
}

/** Rows of a body whose paragraphs carry their own Exactly / At least line
 * (`data-note-paragraph-line` spans; the body's own line is zeroed): each
 * paragraph's wrapped lines advance by its line height. Read as one pitch,
 * the zeroed body fitted no row, and a note longer than a page was never cut
 * (corpus R83-D03: two endnotes of 46 and 150 exactly-14.4pt lines that Word
 * continues over five pages stood clipped on three). */
function noteParagraphLineRowsThatFit(body: HTMLElement, availablePx: number): number {
  const spans = body.querySelectorAll<HTMLElement>(":scope > [data-note-paragraph-line]");
  let used = 0;
  let rows = 0;
  for (const span of spans) {
    const pitch = Number.parseFloat(getComputedStyle(span).lineHeight);
    if (!(pitch > 0)) return rows;
    // Its wrapped lines, by how far its last line box stands below its
    // first: a paragraph's closing newline can add a zero-width box on the
    // same line, which counted as a second row.
    const rects = Array.from(span.getClientRects()).filter((rect) => rect.height > 0);
    const lines = rects.length > 1
      ? 1 + Math.max(0, Math.round((rects[rects.length - 1].top - rects[0].top) / (pitch * paginationLayoutScale(body).y)))
      : 1;
    for (let line = 0; line < lines; line += 1) {
      if (used + pitch > availablePx + 1 / 64) return rows;
      used += pitch;
      rows += 1;
    }
  }
  return rows;
}

/**
 * The character offset in a rendered note body (the zone's row span) at
 * which a page's note area must cut it so the rows above fit `availablePx`:
 * the same page-bottom row rule the endnote list is cut by. Null when not
 * even one row fits or the body has no measurable rows (jsdom).
 */
export function planNoteBodyCutOffset(
  body: HTMLElement,
  availablePx: number,
): number | null {
  const rows = noteBodyRowsThatFit(body, availablePx);
  if (rows <= 0) return null;
  const cut = planTextCutByChars(body, availablePx, 1, false, rows);
  if (!cut) return null;
  const offset = textOffsetWithin(body, cut.node, cut.offset);
  return offset !== null && offset > 0 ? offset : null;
}

export function planNoteHeadCursor(
  dom: HTMLElement,
  availablePx: number,
): NoteSliceCursor | null {
  return planNoteHeadFrom(dom, availablePx)?.cursor ?? null;
}

/**
 * {@link planNoteHeadCursor}, from a cut this plan already made in the list:
 * the page opens where that cut's rest stands in the list as it is laid out
 * (`from.topPx` below the list's top). The list is one block of hundreds of
 * entries, so asked of a tail that does not stand yet the next page had no
 * answer, and each page took a pass of its own (R329-D02: 518 endnotes over 14
 * pages, 19 passes). `topPx` of the answer is where its rest stands.
 */
export function planNoteHeadFrom(
  dom: HTMLElement,
  availablePx: number,
  from?: { cursor: NoteSliceCursor; topPx: number } | null,
): { cursor: NoteSliceCursor; topPx: number } | null {
  if (!(availablePx > 0)) return null;
  const entries = Array.from(
    dom.querySelectorAll<HTMLElement>(".mrnote-footnote-list__entry"),
  ).filter((el) => el.dataset.noteMirror !== "true");
  if (entries.length === 0) return null;
  const scale = paginationLayoutScale(dom);
  const rootTop = paginationLayoutRect(dom, scale).top;
  const pageBottom = rootTop + (from?.topPx ?? 0) + availablePx;
  let lastWhole: { cursor: NoteSliceCursor; topPx: number } | null = null;
  for (let at = 0; at < entries.length; at += 1) {
    const entry = entries[at];
    const originalIndex = Number.parseInt(entry.dataset.noteIndex ?? "", 10);
    const fragmentStart = Number.parseInt(
      entry.dataset.noteSliceStartOffset ?? "0",
      10,
    );
    const fragmentEndRaw = Number.parseInt(
      entry.dataset.noteSliceEndOffset ?? "",
      10,
    );
    if (!Number.isInteger(originalIndex) || originalIndex < 0) return null;
    // Entries the last cut left on the page before.
    if (from && originalIndex < from.cursor.entry) continue;
    const entryRect = paginationLayoutRect(entry, scale);
    if (!(entryRect.height > 0)) return null;
    // A whole entry fits when its last row's text box does (same rule).
    const entryBody = entry.querySelector<HTMLElement>(".mrnote-footnote-list__bodytext");
    const entryCredit = entryBody ? noteBodyLineMetrics(entryBody).creditPx : 0;
    if (entryRect.bottom - entryCredit <= pageBottom + 1 / 64) {
      const nextTop = entries[at + 1] ? paginationLayoutRect(entries[at + 1], scale).top : entryRect.bottom;
      lastWhole = {
        cursor: Number.isInteger(fragmentEndRaw) && fragmentEndRaw > fragmentStart
          ? { entry: originalIndex, offset: fragmentEndRaw }
          : { entry: originalIndex + 1, offset: 0 },
        topPx: nextTop - rootTop,
      };
      continue;
    }

    const body = entry.querySelector<HTMLElement>(
      ".mrnote-footnote-list__bodytext",
    );
    if (body) {
      const bodyTop = paginationLayoutRect(body, scale).top;
      const bodyAvailable = pageBottom - bodyTop;
      // Word's page-bottom rule in arithmetic: row k stays when its text box
      // fits, k * pitch - leading <= available, with the Auto leading below
      // the last line credited (see pageEdgeLeading). Deciding the count from
      // the row pitch, not from painted glyph edges, keeps the cut identical
      // wherever the list happens to sit on the page.
      const rows = noteBodyRowsThatFit(body, bodyAvailable);
      const cut = rows > 0 ? planTextCutByChars(body, bodyAvailable, MIN_SPLIT_LINES, false, rows) : null;
      if (cut) {
        const localOffset = textOffsetWithin(body, cut.node, cut.offset);
        if (localOffset !== null && localOffset > 0) {
          const absoluteOffset = fragmentStart + localOffset;
          if (
            (!Number.isInteger(fragmentEndRaw) ||
            absoluteOffset < fragmentEndRaw) &&
            (!from || originalIndex > from.cursor.entry || absoluteOffset > from.cursor.offset)
          ) {
            return { cursor: { entry: originalIndex, offset: absoluteOffset }, topPx: bodyTop + cut.rowTop - rootTop };
          }
        }
      }
    }
    // If the overflowing entry cannot legally split but at least one whole
    // entry fits, break before it.  Never return an empty head.
    return lastWhole;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Serialization-boundary merge (pure JSON, mirrors flattenPageBlocks).
// ---------------------------------------------------------------------------

// Endnote-area slicing (the footnoteList atom renders entry range
// [noteSliceStart, noteSliceEnd) when stamped — see footnoteExtension).
// The store lives on doc attrs, so the tail nodes are pure projections:
// serialization keeps the FIRST node (attrs stripped → renders all) and
// drops the rest.
export const NOTE_LIST_NODE = "footnoteList";
export const NOTE_SLICE_START_ATTR = "noteSliceStart";
export const NOTE_SLICE_END_ATTR = "noteSliceEnd";
export const NOTE_SLICE_START_OFFSET_ATTR = "noteSliceStartOffset";
export const NOTE_SLICE_END_OFFSET_ATTR = "noteSliceEndOffset";

type JsonNode = Record<string, unknown> & {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: JsonNode[];
};

function hasSplitAttrs(node: JsonNode | undefined): boolean {
  const attrs = node?.attrs;
  if (!attrs) return false;
  if (
    Object.prototype.hasOwnProperty.call(attrs, SPLIT_CONTINUES_ATTR) ||
    Object.prototype.hasOwnProperty.call(attrs, SPLIT_CONTINUATION_ATTR) ||
    Object.prototype.hasOwnProperty.call(attrs, SPLIT_PIECE_OF_ATTR)
  ) {
    return true;
  }
  // A generated list (a table of contents, a table of figures) cut between
  // two rows: its copies carry a row range, and the editor spells the two
  // range keys on every such node (atomRowSlices).
  if (hasRowSliceKeysJson(node)) return true;
  return (
    node?.type === NOTE_LIST_NODE &&
    (attrs[NOTE_SLICE_START_ATTR] != null ||
      attrs[NOTE_SLICE_END_ATTR] != null ||
      attrs[NOTE_SLICE_START_OFFSET_ATTR] != null ||
      attrs[NOTE_SLICE_END_OFFSET_ATTR] != null)
  );
}

const SPLIT_PAIR_ATTRS = [SPLIT_CONTINUES_ATTR, SPLIT_CONTINUATION_ATTR, SPLIT_PIECE_OF_ATTR] as const;

function anySplitAttrPresent(nodes: JsonNode[] | undefined): boolean {
  if (!Array.isArray(nodes)) return false;
  return nodes.some(
    (node) =>
      hasSplitAttrs(node) ||
      (node?.type === "pageBlock" && anySplitAttrPresent(node.content)),
  );
}

function strippedAttrs(node: JsonNode): Record<string, unknown> | undefined {
  if (!node.attrs) return node.attrs;
  const attrs = { ...node.attrs };
  delete attrs[SPLIT_CONTINUES_ATTR];
  delete attrs[SPLIT_CONTINUATION_ATTR];
  delete attrs[SPLIT_PIECE_OF_ATTR];
  if (node.type !== NOTE_LIST_NODE) noteStrippedAttrs(attrs, node.attrs, SPLIT_PAIR_ATTRS);
  if (node.type === NOTE_LIST_NODE) {
    attrs[NOTE_SLICE_START_ATTR] = null;
    attrs[NOTE_SLICE_END_ATTR] = null;
    attrs[NOTE_SLICE_START_OFFSET_ATTR] = null;
    attrs[NOTE_SLICE_END_OFFSET_ATTR] = null;
  }
  return attrs;
}

/**
 * A fragment that lost its continuation flag but names the identity of the
 * block before it (`pageSplitPieceOf`, set only by a page split's cut) is
 * still a piece of that block, and is stored in it, never as a paragraph of
 * its own. Two real paragraphs never name each other: the identity is the
 * paginator's, never copied by Enter, paste or any other edit.
 */
function isProvablePieceOf(node: JsonNode, previous: JsonNode | undefined): boolean {
  const piece = node.attrs?.[SPLIT_PIECE_OF_ATTR];
  if (typeof piece !== "string" || !piece || !previous || previous.type !== node.type) return false;
  return piece === splitPieceRoot(previous.attrs);
}

function mergedSplitContent(
  head: JsonNode,
  tail: JsonNode,
): JsonNode[] | undefined {
  const headContent = Array.isArray(head.content) ? head.content : [];
  const tailContent = Array.isArray(tail.content) ? tail.content : [];
  if (tailContent.length === 0) return head.content;
  if (headContent.length === 0) return tail.content;
  // Code lines re-join over the newline the cut consumed; a paragraph cut
  // at a soft-wrap boundary re-joins by plain concatenation (the text was
  // only partitioned).
  if (head.type === SPLITTABLE_BLOCK_TYPE) {
    return joinInlineFragments(joinInlineFragments(headContent, [{ type: "text", text: "\n" }]), tailContent);
  }
  return joinInlineFragments(headContent, tailContent);
}

/**
 * Re-merge editor-runtime split pairs back into single blocks and strip
 * the split attrs — the serialization-boundary counterpart of the
 * rebalancer's split pass. Works on sheeted OR flat JSON (pairs straddle
 * pageBlock boundaries in the sheeted form: tail is the FIRST child of
 * the next page). Returns the SAME object when nothing needed merging
 * (identity fast-path for hot save paths, like flattenPageBlocks).
 */
export function mergeSplitContinuationsJson<T>(doc: T): T {
  const root = doc as JsonNode | null;
  if (!root || !Array.isArray(root.content)) return doc;
  if (!anySplitAttrPresent(root.content)) return doc;

  // Work over a [pageIndexOrNull, node] flat walk so cross-page pairs
  // merge exactly like same-page ones; pages are rebuilt afterwards.
  const isSheeted = root.content.some((node) => node?.type === "pageBlock");
  const walk: Array<{ page: number; node: JsonNode }> = [];
  if (isSheeted) {
    root.content.forEach((page, pageIndex) => {
      if (page?.type === "pageBlock" && Array.isArray(page.content)) {
        for (const child of page.content) {
          walk.push({ page: pageIndex, node: child });
        }
      } else {
        walk.push({ page: pageIndex, node: page });
      }
    });
  } else {
    for (const node of root.content) walk.push({ page: 0, node });
  }

  // The stored note list: the head of the last run of note-list nodes
  // standing next to each other (noteSliceIntegrity storedNoteListIndex).
  // The document-end area's first slice; with endnotes at the end of each
  // section, the list after the last break -- the runs before it are the
  // earlier sections' areas.
  let storedNoteList = -1;
  walk.forEach((entry, index) => {
    if (entry.node?.type !== NOTE_LIST_NODE) return;
    if (index === 0 || walk[index - 1].node?.type !== NOTE_LIST_NODE) storedNoteList = index;
  });
  const merged: Array<{ page: number; node: JsonNode }> = [];
  for (const [index, entry] of walk.entries()) {
    const node = entry.node;
    const previous = merged[merged.length - 1];
    if (node?.type === NOTE_LIST_NODE) {
      // Keep only the stored note-list node (attrs stripped → renders the
      // whole store); the other slices are editor-runtime projections.
      if (index !== storedNoteList) continue;
      merged.push({
        page: entry.page,
        node: hasSplitAttrs(node)
          ? { ...node, attrs: strippedAttrs(node) }
          : node,
      });
      continue;
    }
    if (hasRowSliceKeysJson(node)) {
      // One list, however many pages its rows reach: the first copy stands
      // for it whole, the range keys are layout state and are not stored
      // (the API's field validators name every attribute a generated list
      // may carry). A continuation whose first copy is gone stays, whole.
      if (isRowSliceTailJson(node) && previous?.node?.type === node.type) continue;
      merged.push({
        page: entry.page,
        node: { ...node, attrs: withoutRowSlice(node.attrs ?? {}) },
      });
      continue;
    }
    if (
      typeof node?.type === "string" &&
      isSplitCapableType(node.type) &&
      (node.attrs?.[SPLIT_CONTINUATION_ATTR] === true || isProvablePieceOf(node, previous?.node)) &&
      previous?.node?.type === node.type
    ) {
      // The merged block lives on the HEAD's page: the closest honest
      // whole-block account of a straddling structure (pageBlockSizes
      // consumers place whole blocks only).
      previous.node = {
        ...previous.node,
        attrs: {
          ...strippedAttrs(previous.node),
          // A chained 3-way split: the tail may itself be a cut head.
          ...(node.attrs?.[SPLIT_CONTINUES_ATTR] === true
            ? { [SPLIT_CONTINUES_ATTR]: true }
            : {}),
        },
        content: mergedSplitContent(previous.node, node),
      };
      // Re-strip in case the chained flag above survived the strip.
      if (previous.node.attrs?.[SPLIT_CONTINUES_ATTR] === true) {
        const attrs = { ...previous.node.attrs };
        delete attrs[SPLIT_CONTINUES_ATTR];
        previous.node = { ...previous.node, attrs };
      }
      continue;
    }
    if (hasSplitAttrs(node)) {
      merged.push({
        page: entry.page,
        node: { ...node, attrs: strippedAttrs(node) },
      });
      continue;
    }
    merged.push(entry);
  }

  if (!isSheeted) {
    return { ...root, content: merged.map((entry) => entry.node) } as T;
  }
  // Rebuild pages preserving each surviving block's page assignment; a
  // page whose only block was a merged-away tail vanishes (its content
  // now lives at the head's page end — Word's join-on-shrink shape).
  const pages: JsonNode[] = [];
  const pageAt = new Map<number, JsonNode>();
  for (const entry of merged) {
    let page = pageAt.get(entry.page);
    if (!page) {
      page = { type: "pageBlock", content: [] };
      pageAt.set(entry.page, page);
      pages.push(page);
    }
    (page.content as JsonNode[]).push(entry.node);
  }
  return { ...root, content: pages } as T;
}
