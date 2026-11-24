/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Physical-page overflow decorations (V3): stamp `data-page-span` + an inline
 * `counter-increment: mrn-page N` only when a sheet legitimately stands for
 * several printed pages (for example a native table the printer fragments).
 * Unknown/indivisible atoms are never legalized this way: they receive a
 * runtime-only bounded projection so one DOM widget cannot stretch the paper.
 *
 * The stamp must be a ProseMirror NODE DECORATION: writing the attribute
 * onto the article from React effects gets reverted by ProseMirror's DOM
 * observer (foreign mutations on node DOM are undone on the next redraw),
 * which is exactly how the first cut of this feature failed live.
 *
 * Flow: after every view update, measure each top-level pageBlock's DOM
 * height against the page geometry (same helper the seam-guide overlay
 * uses); if the span fingerprint changed, dispatch a meta-only transaction
 * (no doc change, no history) whose plugin state rebuilds the decorations.
 * CSS counters then advance by the real printed-page count, so on-screen
 * numbering, band {PAGE} tokens, and the print clones all agree.
 */

import { Extension } from "@tiptap/core";
import { readSheetNoteContinuationPages } from "./structuralFootnotes";
import { coverHidesFirstPageNumber } from "../../../../../lib/document-cover-pages/coverFirstPage";
import type { Node as PmNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { PAGE_BLOCK_NODE } from "./pageBlockExtension";
import { HOLLOW_SHEET_ATTR } from "./pageSheetView";
import { sheetTrailingAutoLeadingCreditPx, trailingAutoLeadingCreditPx } from "./pageEdgeLeading";
import { UNEQUAL_COLUMN_FLOW_ATTR, unequalColumnCount } from "./unequalColumnProjection";
import {
  computePhysicalPageStarts,
  documentEvenAndOddHeaders,
  sectionRestartNumbers,
  endingSheetParityBreak,
  measureSheetSpan,
  type PageParityBreak,
} from "./sheetPageSpans";
import {
  isImeCompositionActive,
  onImeCompositionSettled,
} from "../imeCompositionGuard";
import { isInlineImagePageFitEligible } from "../../../../../lib/paged-layout/drawingPageFit";
import { floatFlowMode } from "../../../../../lib/office-float-anchor";
import { pictureFloatAnchor } from "../pictureFloat";
import { resolvePhysicalSheetPageNumberLabels } from "../pageNumberFormat";
import { SECTION_BREAK_NODE } from "./sheetSectionIsolation";
import { paginationLayoutRect, paginationLayoutScale, withPaginationScaleReuse } from "./paginationGeometry";
import { DOCUMENT_COVER_PAGE_NODE } from "../../../../../lib/document-cover-pages/coverPages";
import { isRowSlicedAtomType } from "./atomRowSlices";
import { HEAD_PIECE_OVERRUN_PX, PAGE_OVERSIZE_ATTR, PAGE_OVER_TALL_SHEETS_EVENT } from "./paginationProjectionKeys";
import { isOverTallSheet } from "./overTallSheets";
import { overlayOnlyDocChange } from "./overlayOnlyChange";
import { SheetMeasureMemo, sheetsOf } from "./sheetMeasureMemo";
import { editorFontFamilies, facesUsedBy, loadedFaceRanges, textDrawsCodePointIn } from "./ledger/ledgerFontRanges";
import { newFontFacesOf } from "../../../../../lib/font-face-news";
import { measureOutsideEditorObservation } from "../documentLayoutStatus";
import { sheetsWithinMeasureHorizon } from "./measureHorizon";

export const PAGE_SPAN_META = "structuralPageSpans";
export const PAGE_PARITY_GAP_ATTR = "data-page-parity-before";
export const PAGE_PHYSICAL_PARITY_ATTR = "data-page-physical-parity";
export const PAGE_NUMBER_FIRST_LABEL_ATTR = "data-page-number-first-label";
export const PAGE_NUMBER_LAST_LABEL_ATTR = "data-page-number-last-label";
export const PAGE_NUMBER_VISIBLE_ATTR = "data-page-number-visible";

interface PageSpanState {
  readonly set: DecorationSet;
  /** The entries `set` was built from, kept at their current positions. */
  readonly entries: readonly PageDecorationEntry[];
}

const pageSpanKey = new PluginKey<PageSpanState>("pageSpanDecorations");

/** The paginator's own move transactions (pageRebalanceExtension REBALANCE_META). */
const STRUCTURAL_REBALANCE_META = "structuralRebalance";

export interface SheetSpanEntry {
  kind: "sheetSpan";
  pos: number;
  nodeSize: number;
  span: number;
  /** Implicit Word/WPS parity blank immediately before this editable sheet. */
  gapBefore: number;
  /** One-based physical page ordinal, including prior span/filler pages. */
  physicalStart: number;
  /** Formatted PAGE label of the first/last represented physical page. */
  pageNumberFirstLabel?: string | null;
  pageNumberLastLabel?: string | null;
  

  noteContinuationPages?: number;
  /** The sheet holds a block that cannot be cut and is taller than the text
   * area: one page, the block at full size, ended by the paper's edge. */
  oversize?: boolean;
  /** That block is text a reader has to be able to reach (see
   * {@link OVER_TALL_TEXT_NODE_NAMES}): it scrolls inside its one page. */
  oversizeText?: boolean;
  /** The block past the paper is a table's row that cannot break: Word's
   * paper ends it, and the sheet shows the rest under a line at that edge
   * so the words stay in reach. Print ends it at the paper. */
  oversizeRow?: boolean;
}






















export const OVER_TALL_TEXT_NODE_NAMES: ReadonlySet<string> = new Set([
  "documentAltChunkReadOnly",
  "frontmatter",
  "flashcard",
  "task",
]);

/** Fields whose result is a list drawn inside one paragraph: Word's INDEX
 * and TOA. Their rows do not flow over pages yet (the paragraph is one line
 * as tall as the list). */
const LIST_FIELD_TYPES: ReadonlySet<string> = new Set(["INDEX", "TOA"]);

/**
 * `node` is running text that may be taller than a page with nothing to cut
 * between (INTERIM, see OVER_TALL_TEXT_NODE_NAMES): one of the kinds named
 * there, or a paragraph that holds an index or a table of authorities.
 */
export function isOverTallTextNode(node: PmNode): boolean {
  if (OVER_TALL_TEXT_NODE_NAMES.has(node.type.name)) return true;
  if (!node.isTextblock) return false;
  for (let index = 0; index < node.childCount; index += 1) {
    const child = node.child(index);
    if (child.type.name === "documentField" && LIST_FIELD_TYPES.has(String(child.attrs.fieldType))) return true;
  }
  return false;
}

function sheetHoldsTable(sheet: PmNode): boolean {
  for (let index = 0; index < sheet.childCount; index += 1) {
    if (sheet.child(index).type.name === "table") return true;
  }
  return false;
}

export type PageDecorationEntry = SheetSpanEntry;

/** Whether a sheet's stamp draws anything on the sheet. */
function entryDraws(entry: PageDecorationEntry): boolean {
  return Boolean(entry.oversize || entry.span > 1 || entry.gapBefore > 0 || (entry.noteContinuationPages && entry.noteContinuationPages > 0));
}

function buildDecorations(
  state: EditorState,
  entries: PageDecorationEntry[],
): DecorationSet {
  // A sheet of one page draws nothing. A decoration each still rebuilt the set
  // on every page move, each one checked against a walk of the sheets before it
  // (8 % of the thread on the 2,747-page sample).
  const decorations: Decoration[] = [];
  for (const entry of entries) {
    if (!entryDraws(entry)) continue;
    const attrs: Record<string, string> = {};
    if (entry.oversize) attrs[PAGE_OVERSIZE_ATTR] = entry.oversizeText ? "text" : entry.oversizeRow ? "row" : "true";
    if (entry.span > 1 || entry.gapBefore > 0) {
      attrs.style = `counter-increment: mrn-page ${entry.span + entry.gapBefore};`;
    }
    if (entry.span > 1) attrs["data-page-span"] = String(entry.span);
    if (entry.gapBefore > 0) {
      attrs[PAGE_PARITY_GAP_ATTR] = String(entry.gapBefore);
    }
    if (entry.noteContinuationPages && entry.noteContinuationPages > 0) {
      attrs["data-note-continuation-pages"] = String(entry.noteContinuationPages);
      attrs.style = `${attrs.style ?? ""}--note-continuation-pages: ${entry.noteContinuationPages};`;
    }
    decorations.push(Decoration.node(entry.pos, entry.pos + entry.nodeSize, attrs));
  }
  return decorations.length ? DecorationSet.create(state.doc, decorations) : DecorationSet.empty;
}

/**
 * What a sheet's place among the pages decides -- its physical parity and
 * its page-number labels -- as attributes on the sheet. They are stamped on
 * the sheet after each view update instead of drawn as node decorations:
 * a page added or taken away near the start changes them on every later
 * page, and a sheet whose decorations changed is one ProseMirror cannot
 * match to its existing view, so it drew every later page again from
 * nothing (535 sheets and 36,000 spans for a 5-step pass on the 296-page
 * book: 60 s in WebKit, seconds in Chromium). Stamped, the later pages keep
 * their views and only these attributes change.
 */
function sheetPlaceAttributes(entry: PageDecorationEntry): Array<[string, string | null]> {
  const last = entry.pageNumberLastLabel;
  return [
    [PAGE_PHYSICAL_PARITY_ATTR, entry.physicalStart % 2 === 0 ? "even" : "odd"],
    [PAGE_NUMBER_FIRST_LABEL_ATTR, entry.pageNumberFirstLabel === undefined ? null : entry.pageNumberFirstLabel ?? ""],
    [PAGE_NUMBER_LAST_LABEL_ATTR, last === undefined ? null : last ?? ""],
    [PAGE_NUMBER_VISIBLE_ATTR, last !== undefined && last !== null ? "true" : null],
  ];
}

/** What a sheet's stamps were written from. */
interface StampedPlace {
  odd: boolean;
  first: PageDecorationEntry["pageNumberFirstLabel"];
  last: PageDecorationEntry["pageNumberLastLabel"];
}

const stampedSheetPlaces = new WeakMap<HTMLElement, StampedPlace>();

function stampSheetPlaces(view: EditorView, entries: readonly PageDecorationEntry[]): void {
  if (entries.length === 0) return;
  const sheets = sheetsOf(view.dom);
  const writes: Array<() => void> = [];
  entries.forEach((entry, index) => {
    const found = sheets.length === entries.length ? sheets[index] : view.nodeDOM(entry.pos);
    if (!(found instanceof HTMLElement)) return;
    const sheet = found;
    const stamped = stampedSheetPlaces.get(sheet);
    const odd = entry.physicalStart % 2 !== 0;
    if (stamped && stamped.odd === odd && stamped.first === entry.pageNumberFirstLabel && stamped.last === entry.pageNumberLastLabel) return;
    const attributes = sheetPlaceAttributes(entry);
    const place: StampedPlace = { odd, first: entry.pageNumberFirstLabel, last: entry.pageNumberLastLabel };
    writes.push(() => {
      for (const [name, value] of attributes) {
        if (value === null) {
          if (sheet.hasAttribute(name)) sheet.removeAttribute(name);
        } else if (sheet.getAttribute(name) !== value) {
          sheet.setAttribute(name, value);
        }
      }
      stampedSheetPlaces.set(sheet, place);
    });
  });
  if (writes.length > 0) measureOutsideEditorObservation(view, () => writes.forEach((write) => write()));
}

/**
 * A block that has no place to cut it (a chart, a diagram, a whiteboard, a
 * media frame, an equation, a floated picture, any atom the paginator does
 * not know): taller than the text area it is drawn the way Word draws an
 * inline picture taller than the text area. Measured in Word 16.86 (Letter,
 * 1 in margins, pictures 9.5, 12 and 20 in tall in a paragraph of their own
 * between two lines): the picture is neither scaled nor split, it opens the
 * next page at the top margin, the line after it opens the page after that,
 * and it is drawn at full size over the bottom margin until the paper's
 * edge ends it. The page ledger already plans exactly that (an atom taller
 * than a page that cannot be cut is placed alone and its page closes); the
 * sheet holding one is stamped here so the paper ends the block and the
 * sheet counts as one page.
 *
 * `footnoteList` is an atom only because its entries live in a side store;
 * the ledger cuts it between notes. A generated list (a table of contents, a
 * table of figures, a bibliography) is cut between its rows. Ordinary inline
 * pictures have their own page-fit projection. `imageRow` is not a
 * ProseMirror atom, but is equally indivisible.
 */
export function isUncuttableBlock(node: PmNode): boolean {
  if (node.type.name === "footnoteList") return false;
  if (isRowSlicedAtomType(node.type.name)) return false;
  // A cover page sizes its own box to the sheet's body and paints the whole
  // sheet from a layer that reaches into the margins. That paint overflow is
  // the cover's design, not a block taller than the page.
  if (node.type.name === DOCUMENT_COVER_PAGE_NODE) return false;
  if (isOutOfFlowPicture(node)) return false;
  // An inline picture that states no size is drawn fitted to the page (its
  // size is stored once it has loaded, as Word's Insert Picture stores it).
  // One with a stored size is drawn at that size, like any other block.
  if (
    node.type.name === "image" &&
    isInlineImagePageFitEligible(
      node.attrs?.dataFloat,
      node.attrs?.officeDrawingKind,
    ) &&
    !pictureStatesSize(node.attrs)
  ) {
    return false;
  }
  return node.isAtom || node.type.name === "imageRow";
}

/** The picture stores a size of its own (px or EMU), not a share of the
 * text width: what the page projection never scales in height. */
function pictureStatesSize(attrs: Readonly<Record<string, unknown>> | null | undefined): boolean {
  const positive = (value: unknown) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0;
  };
  if (!attrs || positive(attrs.widthPercent)) return false;
  return positive(attrs.width) || positive(attrs.height) || positive(attrs.widthEmu) || positive(attrs.heightEmu);
}

/**
 * A picture behind or in front of the text (no wrap): the float layout pass
 * places it on its sheet out of the flow (floatingTextBoxLayout), so it takes
 * no flow height and is never cut, whatever its size. A converted PDF page's
 * art layer is one: bounded, the picture itself was capped (note-editor.css),
 * measured as fitting, released, measured whole and bounded again, so the
 * page redrew it ninety times a second.
 */
function isOutOfFlowPicture(node: PmNode): boolean {
  if (node.type.name !== "image") return false;
  const anchor = pictureFloatAnchor(node.attrs, node.isInline ? "inline" : "block");
  return anchor !== null && floatFlowMode(anchor) === "overlay";
}

/**
 * A block drawn in front of or behind the text (an ink stroke, a shape or a
 * text box with no wrap): its own box takes no flow height and its drawing
 * sits wherever its anchor offset puts it, so the distance from its anchor
 * to its drawing is no height of a block. The same rule the sheet's body
 * extent uses for what leaves the flow.
 */
function isOutOfFlowBlock(dom: HTMLElement): boolean {
  return dom.getAttribute("data-float-mode") === "overlay";
}

/** The block's own box, as the page ledger charges it (what it paints
 * outside that box is not its height). */
function intrinsicBlockHeight(dom: HTMLElement): number {
  // In document pixels, like the capacity it is compared with: a client rect
  // is in canvas pixels, so on a document zoomed to 200% every chart, diagram
  // or shape taller than half a page read as taller than the page.
  return Math.max(dom.offsetHeight || 0, paginationLayoutRect(dom).height || 0);
}

/**
 * Whether `dom` is a page of newspaper columns the projector has placed
 * (unequalColumnProjection): there every column's last line may hang its Auto
 * leading past the foot, as the projector lets it (its `footCreditPx`, Word's
 * page edge), and the page's extent is read the same way. Read from the last
 * block in DOM order alone (sheetTrailingAutoLeadingCreditPx gives a column
 * page none), a left column the projector filled to the foot read 8 px past
 * the page: every page of R308-D01's two-column body was stamped two pages,
 * and its PDF came out 19 pages where Word has 11.
 * `window.__docsColumnFootSpanOff = true` reads them as before (A/B).
 */
function projectedColumnFeet(dom: HTMLElement): boolean {
  if (dom.getAttribute(UNEQUAL_COLUMN_FLOW_ATTR) !== "true") return false;
  if ((dom.ownerDocument.defaultView as (Window & { __docsColumnFootSpanOff?: boolean }) | null)?.__docsColumnFootSpanOff === true) return false;
  return (unequalColumnCount(dom) ?? 0) > 1;
}

/** Count the same body border boxes as the structural rebalancer, which
 * suppresses the final block's after-spacing at a page edge. Article height
 * is not independent evidence: a trailing nested-list margin can enlarge it,
 * then the resulting data-page-span CSS clips that margin and shrinks both
 * offsetHeight and scrollHeight again. Measuring the unchanged body boxes
 * avoids that span 1 -> 2 -> 1 feedback without hiding real body overflow. */
export function measureSheetBodyExtent(dom: HTMLElement, paddingBottom: number): number {
  const scale = paginationLayoutScale(dom);
  const sheetTop = paginationLayoutRect(dom, scale).top;
  const columnFeet = projectedColumnFeet(dom);
  let bodyBottom: number | null = null;
  for (const child of Array.from(dom.children)) {
    if (!(child instanceof HTMLElement) || child.matches(".ProseMirror-widget")) continue;
    // An anchored text box is not in the page's vertical flow: `wrapNone`
    // positions it against the paper and `wrapSquare` floats it, and in both
    // cases the ledger charges the page nothing for it. Counting its bottom
    // here as body spill would make the two measurements disagree, and the
    // repair loop would chase an overflow the ledger cannot resolve.
    // A floating table kept whole on its page runs past the foot as Word
    // draws it (w:doNotBreakWrappedTables, corpus R103-D20, tablePageFrame
    // TABLE_KEEP_WHOLE_ATTR); reading that as spill pushed the paragraph
    // beside it to the next page. Any other floated table still counts: its
    // overhang is what moves the text after it on (corpus R98-D12).
    if (child.matches('[data-float-mode="overlay"], [data-float-mode="float"], [data-table-page-frame="float"][data-table-keep-whole]')) continue;
    // A floating table holding a floating table is kept whole on its page by
    // Word in any case (tablePageFrame holdsFloatingTable); read from the
    // table itself, as the page a plan just moved it to has not marked it
    // yet, and the repair pushed it back each time (R104-D19: the plan put
    // everything on one page, pass after pass).
    if (child.querySelector(":scope > table[data-table-positioning] :is(td, th) table[data-table-positioning]")) continue;
    // So is the empty paragraph it hangs from: Word sets that line off the
    // paper below the table on the same page. Until the projection marks it
    // hung on the page a plan moved it to, it still stands below the table
    // as it did on the page before, and the repair pushed both back (R104-D19
    // trace: 31 px "spill", then the one-page plan held off for good).
    {
      const previous = child.previousElementSibling;
      if (
        child.tagName === "P" && child.hasAttribute("data-table-frame-anchor") && previous instanceof HTMLElement &&
        previous.querySelector(":scope > table[data-table-positioning] :is(td, th) table[data-table-positioning]")
      ) continue;
    }
    const rect = paginationLayoutRect(child, scale);
    if (!(rect.height > 0)) continue;
    bodyBottom = Math.max(bodyBottom ?? 0, rect.bottom - sheetTop - (columnFeet ? trailingAutoLeadingCreditPx(child) : 0));
  }
  // During a zero-layout/mounting frame there is no body evidence yet. Keep
  // the existing measurement fallback until the actual blocks are measurable.
  return bodyBottom === null
    ? Math.max(dom.offsetHeight, dom.scrollHeight)
    : bodyBottom + paddingBottom;
}

/** The expensive part of a sheet's span measurement (its blocks' boxes),
 * kept per sheet while nothing in it changes (SheetMeasureMemo). */
export interface SheetSpanReading {
  /** Body extent less the last line's Auto-leading credit (px). */
  extentPx: number;
  /** The tallest block that cannot be cut, as charged (-1: none). */
  tallestUncuttablePx: number;
  /** What else the sheet's entry is made of, read with the extent: kept
   * with it while the memo vouches for the sheet (its DOM and node
   * unchanged), so an untouched sheet costs no style read and no walk of
   * its blocks per frame. */
  facts?: SheetSpanFacts;
  /** Only `facts` is known: its blocks' boxes have not been read. */
  unread?: boolean;
}

/** A sheet's paper and the things its entry reads off its blocks. */
interface SheetSpanFacts {
  pageHeightPx: number;
  paddingTopPx: number;
  paddingBottomPx: number;
  holdsUncuttableText: boolean;
  parityBreakAfter: PageParityBreak;
  sectionBreaks: number;
  soleInlineImage: boolean;
}

function readSheetSpanFacts(dom: HTMLElement, node: PmNode, fallbackPageHeightPx: number): SheetSpanFacts {
  const style = getComputedStyle(dom);
  let holdsUncuttableText = false;
  node.forEach((child) => {
    if (isOverTallTextNode(child)) holdsUncuttableText = true;
  });
  let sectionBreaks = 0;
  node.descendants((child) => {
    if (child.type.name === SECTION_BREAK_NODE) sectionBreaks += 1;
    return true;
  });
  // A sole ordinary inline image has a closed, one-page projection policy.
  // Never legalize its pre-load/transient height as a multi-page sheet; the
  // NodeView + rebalancer fit it without mutating authored geometry. A sole
  // picture behind or in front of the text takes no flow height once placed
  // (isOutOfFlowPicture): its height before that is not the sheet's either.
  // Other anchored images and imageRow are the uncuttable blocks above.
  const soleChild = node.childCount === 1 ? node.child(0) : null;
  const soleInlineImage =
    soleChild?.type.name === "image" &&
    (isInlineImagePageFitEligible(
      soleChild.attrs?.dataFloat,
      soleChild.attrs?.officeDrawingKind,
    ) || isOutOfFlowPicture(soleChild)) &&
    dom.children.length === 1 &&
    dom.firstElementChild instanceof HTMLElement &&
    dom.firstElementChild.matches(".note-editor-image-resizable");
  return {
    pageHeightPx:
      Number.parseFloat(style.minHeight) ||
      Number.parseFloat(style.getPropertyValue("--page-height-px")) ||
      fallbackPageHeightPx,
    paddingTopPx: Number.parseFloat(style.paddingTop) || 0,
    paddingBottomPx: Number.parseFloat(style.paddingBottom) || 0,
    holdsUncuttableText,
    parityBreakAfter: endingSheetParityBreak(dom),
    sectionBreaks,
    soleInlineImage,
  };
}

/**
 * A table's head piece the plan left a little past the foot stands there, in
 * the bottom margin (HEAD_PIECE_OVERRUN_PX; the ledger's verifier leaves it): it
 * opens no second page. Counted as one, the print gave it a blank page after
 * the sheet (R286-D01: 36 px and 9 px, two blank pages).
 */
function withinHeadPieceOverrun(dom: HTMLElement, extentPx: number, pageHeightPx: number): number {
  const overrun = extentPx - pageHeightPx;
  if (!(overrun > 0) || overrun > HEAD_PIECE_OVERRUN_PX) return extentPx;
  for (let last = dom.lastElementChild; last; last = last.previousElementSibling) {
    if (!(last instanceof HTMLElement) || last.matches(".ProseMirror-widget") || !(last.offsetHeight > 0)) continue;
    return last.querySelector(":scope > table[data-page-table-continues]") ? pageHeightPx : extentPx;
  }
  return extentPx;
}

/**
 * A top-and-bottom object standing last on its page, past the text area but
 * on the paper, stays there: an anchored object opens no page of its own. A
 * cover's text box 2 px past the foot stamped two pages, which cut the box in
 * two across them and moved every page number on by one (R286-D01: Word has
 * the contents on page 2, the print had them on page 3).
 */
function withinPaperBand(dom: HTMLElement, extentPx: number, pageHeightPx: number, paddingBottomPx: number): number {
  if (!(extentPx > pageHeightPx) || extentPx - paddingBottomPx > pageHeightPx) return extentPx;
  for (let last = dom.lastElementChild; last; last = last.previousElementSibling) {
    if (!(last instanceof HTMLElement) || last.matches(".ProseMirror-widget") || !(last.offsetHeight > 0)) continue;
    return last.getAttribute("data-float-mode") === "band" ? pageHeightPx : extentPx;
  }
  return extentPx;
}

/** Whether this drawn sheet's content runs past its page, read now. */
export function sheetRunsPastItsPage(dom: HTMLElement, node: PmNode): boolean {
  const facts = readSheetSpanFacts(dom, node, Number.parseFloat(getComputedStyle(dom).getPropertyValue("--page-height-px")));
  const extentPx = withinPaperBand(dom, withinHeadPieceOverrun(
    dom,
    measureSheetBodyExtent(dom, facts.paddingBottomPx) - sheetTrailingAutoLeadingCreditPx(dom),
    facts.pageHeightPx,
  ), facts.pageHeightPx, facts.paddingBottomPx);
  return measureSheetSpan({
    sheetHeightPx: extentPx,
    pageHeightPx: facts.pageHeightPx,
    paddingTopPx: facts.paddingTopPx,
    paddingBottomPx: facts.paddingBottomPx,
  }).span > 1;
}

/** A sheet's last reading, kept through the memo's clearing: what a sheet
 * outside the page ledger's measure horizon still shows. */
const lastSheetSpanReadings = new WeakMap<HTMLElement, SheetSpanReading>();
/** A sheet the progressive layout has not reached yet: one page, nothing
 * over-tall (it is provisional until the ledger lays it out). */
const UNREAD_SHEET_SPAN: SheetSpanReading = { extentPx: 0, tallestUncuttablePx: -1 };
/** How long one frame reads sheets' boxes for their spans. */
const SPAN_READ_BUDGET_MS = 24;

export function measurePageDecorationEntries(
  view: EditorView,
  memo?: SheetMeasureMemo<SheetSpanReading> | null,
  /** Sheets read after this time (performance.now()) keep their last
   * reading, and `budget.incomplete` says so: the caller reads them in a
   * later frame. */
  budget?: { deadline: number; incomplete: boolean } | null,
): PageDecorationEntry[] {
  const root = view.dom as HTMLElement;
  if (!root.isConnected) return [];
  // Read only when a sheet's own paper is read (a frame in which every
  // sheet is vouched for reads no style at all).
  let rootPageHeightPx: number | null = null;
  const fallbackPageHeightPx = () => rootPageHeightPx ??= Number.parseFloat(
    getComputedStyle(root).getPropertyValue("--page-height-px"),
  );
  const measuredSheets: Array<{
    pos: number;
    nodeSize: number;
    span: number;
    parityBreakAfter: PageParityBreak;
    sectionIndex: number;
    oversize: boolean;
    oversizeText: boolean;
    oversizeRow: boolean;
  }> = [];
  let sectionCursor = 0;
  // While the page ledger lays a long document out progressively, a sheet
  // outside the sheets it measures now is not read: its blocks' boxes would
  // lay it out (content-visibility skips it), and every nudge cleared the
  // memo, so each frame laid out every sheet of the book again (2 s frames
  // on the 296-page book). It keeps its last reading; one never read yet is
  // provisional until the ledger reaches it, which reads it then.
  const horizon = sheetsWithinMeasureHorizon(root);
  // Nothing below writes: each sheet's zoom is read once, not once for the
  // sheet and again for every block on it (paginationGeometry).
  // The sheets in order: `nodeDOM` walks the sheets before the one it is asked
  // for, a walk of the document per sheet per frame.
  const sheetElements = sheetsOf(root);
  const inOrder = sheetElements.length === view.state.doc.childCount;
  memo?.flush();
  withPaginationScaleReuse(() => view.state.doc.forEach((node, offset, index) => {
    if (node.type.name !== PAGE_BLOCK_NODE) return;
    const dom = inOrder ? sheetElements[index] : view.nodeDOM(offset);
    if (!(dom instanceof HTMLElement)) return;
    // The blocks' boxes: read again only for a sheet something changed in.
    const kept = memo?.peek(dom, node);
    let reading = kept?.unread ? undefined : kept;
    // What the memo vouches for keeps the rest of its entry too.
    const facts = kept?.facts ?? readSheetSpanFacts(dom, node, fallbackPageHeightPx());
    // A sheet not read yet keeps them as well: past the horizon its style and
    // its node were read again every frame for the whole of a long document.
    if (!kept) memo?.set(dom, node, { ...UNREAD_SHEET_SPAN, facts, unread: true });
    const { pageHeightPx, holdsUncuttableText } = facts;
    // A page drawn hollow holds no blocks to read: it stands as it last read,
    // and only a page of one sheet's height is ever hollowed.
    if (!reading && dom.hasAttribute(HOLLOW_SHEET_ATTR)) reading = lastSheetSpanReadings.get(dom) ?? UNREAD_SHEET_SPAN;
    if (!reading && horizon && !horizon.has(dom)) {
      // A sheet whose last reading stood for several pages is read again all
      // the same, once per change: a long document keeps its horizon when it
      // is done, so a sheet emptied after the ledger had passed it kept "2
      // pages" for good, and every later page number was one too high (R280-D07:
      // "Page 158", then "Page 160", "of 316" on 315 pages). Such sheets are few.
      const last = lastSheetSpanReadings.get(dom);
      if (!last || measureSheetSpan({
        sheetHeightPx: last.extentPx,
        pageHeightPx,
        paddingTopPx: facts.paddingTopPx,
        paddingBottomPx: facts.paddingBottomPx,
      }).span <= 1) reading = last ?? UNREAD_SHEET_SPAN;
    }
    // Past the frame's budget a sheet keeps its last reading until the
    // next frame (a whole book's sheets read at once was a 2.9 s task).
    if (!reading && budget && performance.now() > budget.deadline) {
      budget.incomplete = true;
      reading = lastSheetSpanReadings.get(dom) ?? UNREAD_SHEET_SPAN;
    }
    if (!reading) {
      let tallestUncuttablePx = -1;
      let childPos = offset + 1;
      node.forEach((child) => {
        const childDom = isUncuttableBlock(child) ? view.nodeDOM(childPos) : null;
        if (childDom instanceof HTMLElement && !isOutOfFlowBlock(childDom)) {
          // A block that scrolls inside its page (the interim text kinds) is
          // as tall as its words, not as its viewport: read by its box alone
          // it fitted the moment it was stamped, lost the stamp, grew back
          // and was stamped again.
          tallestUncuttablePx = Math.max(
            tallestUncuttablePx,
            intrinsicBlockHeight(childDom),
            isOverTallTextNode(child) ? childDom.scrollHeight || 0 : 0,
          );
        }
        childPos += child.nodeSize;
      });
      reading = {
        // Word lets the page's last line end inside its extra Auto leading;
        // that blank overrun never opens a second physical page
        // (pageEdgeLeading).
        extentPx: withinPaperBand(
          dom,
          withinHeadPieceOverrun(
            dom,
            measureSheetBodyExtent(dom, facts.paddingBottomPx) - sheetTrailingAutoLeadingCreditPx(dom),
            pageHeightPx,
          ),
          pageHeightPx,
          facts.paddingBottomPx,
        ),
        tallestUncuttablePx,
        facts,
      };
      memo?.set(dom, node, reading);
      lastSheetSpanReadings.set(dom, reading);
    }
    const { span, capacity } = measureSheetSpan({
      sheetHeightPx: reading.extentPx,
      pageHeightPx,
      paddingTopPx: facts.paddingTopPx,
      paddingBottomPx: facts.paddingBottomPx,
    });
    // A block the ledger could not cut (a paragraph whose one line holds an
    // over-tall inline picture, a row that cannot break) is its verdict; an
    // atom taller than the text area shows by itself.
    const oversize = isOverTallSheet(dom) || reading.tallestUncuttablePx > capacity + 2;
    const { soleInlineImage } = facts;
    measuredSheets.push({
      pos: offset,
      nodeSize: node.nodeSize,
      // A block that cannot be cut is one page however tall it is (Word
      // ends it at the paper's edge): its sheet never stands for N pages. A
      // sole page-fittable image has the same one-page policy. Both still
      // participate in odd/even page accounting.
      span: oversize || soleInlineImage ? 1 : span,
      parityBreakAfter: facts.parityBreakAfter,
      sectionIndex: sectionCursor,
      oversize,
      oversizeText: oversize && holdsUncuttableText,
      oversizeRow: oversize && !holdsUncuttableText && isOverTallSheet(dom) && sheetHoldsTable(node),
    });
    sectionCursor += facts.sectionBreaks;
  }));

  const numbering = computePhysicalPageStarts(
    measuredSheets.map((sheet) => sheet.span),
    measuredSheets.map((sheet) => sheet.parityBreakAfter),
    sectionRestartNumbers(
      measuredSheets.map((sheet) => sheet.sectionIndex),
      view.state.doc.attrs.sectionLayouts,
      documentEvenAndOddHeaders(view.state.doc.attrs),
    ),
  );
  const pageNumberLabels =
    view.state.doc.attrs.showPageNumbers === true
      ? resolvePhysicalSheetPageNumberLabels(
          measuredSheets.map((sheet, index) => ({
            physicalStart: numbering.starts[index],
            span: sheet.span,
            sectionIndex: sheet.sectionIndex,
          })),
          {
            format: view.state.doc.attrs.pageNumberFormat,
            start: view.state.doc.attrs.pageNumberStart,
            startSection: view.state.doc.attrs.pageNumberStartSection,
          },
        )
      : null;
  // A cover on a title page shows no page number (Word: its first-page
  // footer is empty); the pages after it keep counting from 2.
  if (pageNumberLabels && pageNumberLabels[0] && coverHidesFirstPageNumber(view.state.doc)) {
    pageNumberLabels[0] = { ...pageNumberLabels[0], first: null, last: null };
  }
  const entries: PageDecorationEntry[] = [];
  const continuationPages = readSheetNoteContinuationPages(view);
  measuredSheets.forEach((sheet, index) => {
    const gapBefore = numbering.gapsBefore[index] ?? 0;
    entries.push({
      kind: "sheetSpan",
      pos: sheet.pos,
      nodeSize: sheet.nodeSize,
      span: sheet.span,
      gapBefore,
      physicalStart: numbering.starts[index] ?? index + 1,
      ...(sheet.oversize ? { oversize: true } : {}),
      ...(sheet.oversizeText ? { oversizeText: true } : {}),
      ...(sheet.oversizeRow ? { oversizeRow: true } : {}),
      ...(index === measuredSheets.length - 1 && continuationPages > 0
        ? { noteContinuationPages: continuationPages }
        : {}),
      ...(pageNumberLabels
        ? {
            pageNumberFirstLabel: pageNumberLabels[index]?.first ?? null,
            pageNumberLastLabel: pageNumberLabels[index]?.last ?? null,
          }
        : {}),
    });
  });
  return entries;
}

/**
 * Carry the stamped entries across a document change. A sheet span entry
 * follows its sheet: by INDEX through the paginator's own moves (sheets are
 * split and joined there, so positions do not survive), by position mapping
 * otherwise. Entries that no longer resolve are dropped until the next
 * measurement re-stamps them.
 */
function remapPageDecorationEntries(
  entries: readonly PageDecorationEntry[],
  oldDoc: PmNode,
  newDoc: PmNode,
  tr: Transaction,
  structural: boolean,
): PageDecorationEntry[] {
  const out: PageDecorationEntry[] = [];
  // Entries stand in document order: both documents are walked once. Looked
  // up one by one, each entry cost a walk of the sheets before it, in both
  // documents, on every page move of the book.
  let oldIndex = 0;
  let oldPos = 0;
  let newIndex = 0;
  let newPos = 0;
  for (const entry of entries) {
    if (structural) {
      if (entry.pos < 0 || entry.pos >= oldDoc.content.size) continue;
      if (entry.pos < oldPos) {
        oldIndex = 0;
        oldPos = 0;
      }
      while (oldIndex < oldDoc.childCount - 1 && oldPos + oldDoc.child(oldIndex).nodeSize <= entry.pos) {
        oldPos += oldDoc.child(oldIndex).nodeSize;
        oldIndex += 1;
      }
      if (oldIndex < newIndex) {
        newIndex = 0;
        newPos = 0;
      }
      while (newIndex < oldIndex && newIndex < newDoc.childCount) {
        newPos += newDoc.child(newIndex).nodeSize;
        newIndex += 1;
      }
      if (oldIndex >= newDoc.childCount) continue;
      const node = newDoc.child(oldIndex);
      if (node.type.name === PAGE_BLOCK_NODE) out.push({ ...entry, pos: newPos, nodeSize: node.nodeSize });
      continue;
    }
    const mapped = tr.mapping.mapResult(entry.pos, 1);
    if (mapped.deleted) continue;
    if (mapped.pos < newPos) {
      newIndex = 0;
      newPos = 0;
    }
    while (newIndex < newDoc.childCount && newPos + newDoc.child(newIndex).nodeSize <= mapped.pos) {
      newPos += newDoc.child(newIndex).nodeSize;
      newIndex += 1;
    }
    // (An entry names a sheet by the position it starts at.)
    if (newIndex >= newDoc.childCount || newPos !== mapped.pos) continue;
    const node = newDoc.child(newIndex);
    if (node.type.name !== PAGE_BLOCK_NODE) continue;
    out.push({ ...entry, pos: mapped.pos, nodeSize: node.nodeSize });
  }
  return out;
}

/** True when every entry still has its node decoration on its own sheet. */
function decorationsInPlace(view: EditorView, entries: PageDecorationEntry[]): boolean {
  const drawn = entries.filter(entryDraws);
  const current = pageSpanKey.getState(view.state)?.set;
  if (!current) return drawn.length === 0;
  if (current.find().length !== drawn.length) return false;
  return drawn.every((entry) =>
    current
      .find(entry.pos, entry.pos + entry.nodeSize)
      .some((decoration) => decoration.from === entry.pos && decoration.to === entry.pos + entry.nodeSize),
  );
}

function fingerprint(entries: readonly PageDecorationEntry[]): string {
  return entries
    .map((entry) =>
      `sheet:${entry.pos}:${entry.span}:${entry.gapBefore}:${entry.physicalStart}:${entry.noteContinuationPages ?? 0}:${entry.oversize ? (entry.oversizeText ? 2 : entry.oversizeRow ? 3 : 1) : 0}:` +
      `${entry.pageNumberFirstLabel === undefined ? "u" : entry.pageNumberFirstLabel === null ? "n" : `s${entry.pageNumberFirstLabel}`}:` +
      `${entry.pageNumberLastLabel === undefined ? "u" : entry.pageNumberLastLabel === null ? "n" : `s${entry.pageNumberLastLabel}`}`,
    )
    .join("|");
}

export const PageSpanExtension = Extension.create({
  name: "pageSpanDecorations",

  addProseMirrorPlugins() {
    return [
      new Plugin<PageSpanState>({
        key: pageSpanKey,
        state: {
          init: () => ({ set: DecorationSet.empty, entries: [] }),
          apply(tr: Transaction, value: PageSpanState, oldState, newState) {
            const meta = tr.getMeta(PAGE_SPAN_META) as
              | PageDecorationEntry[]
              | undefined;
            if (meta) return { set: buildDecorations(newState, meta), entries: meta };
            if (!tr.docChanged) return value;
            // The paginator moves blocks by splitting and joining sheets; a
            // node decoration mapped through that is dropped. A sheet's stamp
            // belongs to the sheet at its index, so re-anchor by index.
            const entries = remapPageDecorationEntries(
              value.entries,
              oldState.doc,
              newState.doc,
              tr,
              tr.getMeta(STRUCTURAL_REBALANCE_META) === true,
            );
            return { set: buildDecorations(newState, entries), entries };
          },
        },
        props: {
          decorations(state) {
            return pageSpanKey.getState(state)?.set;
          },
        },
        view(view) {
          // Per-VIEW lifecycle state. addProseMirrorPlugins runs once and
          // its Plugin object serves every editor instance; hoisting these
          // into that shared closure was a real production bug: an early
          // (hidden-preview) view's destroy cancelled its pending frame but
          // left `raf` non-zero, so every later view's schedule() short-
          // circuited forever and no sheet was ever stamped.
          let raf = 0;
          // Sheets nothing changed in keep their reading (SheetMeasureMemo);
          // a layout nudge, a font or a new width reads every sheet again.
          const memo = new SheetMeasureMemo<SheetSpanReading>(view.dom);
          const forget = (event?: Event) => {
            // A metric projection's decorations change the blocks they sit in,
            // which the memo sees; any other nudge (a picture resized, the
            // view mode, the page bands) may change every sheet.
            const reason = event instanceof CustomEvent ? String(event.detail?.reason ?? "") : "";
            if (reason !== "word-cjk-spacing-projection" && reason !== "document-auto-line-spacing-projection") memo.clear();
            schedule();
          };
          // The page geometry and line grid live on the page surface, outside
          // the editor: a change there lays every sheet out anew.
          const surface = view.dom.closest<HTMLElement>('[data-testid="note-editor-page-surface"]');
          let surfaceStyle = surface?.getAttribute("style") ?? "";
          const surfaceObserver = surface && typeof MutationObserver === "function"
            ? new MutationObserver((records) => {
                const next = surface.getAttribute("style") ?? "";
                const gridChanged = records.some((record) => record.attributeName === "data-doc-grid");
                if (next === surfaceStyle && !gridChanged) return;
                surfaceStyle = next;
                memo.clear();
              })
            : null;
          surfaceObserver?.observe(surface!, { attributes: true, attributeFilter: ["style", "data-doc-grid"] });
          let measuredWidth = -1;
          const resize = typeof ResizeObserver === "function"
            ? new ResizeObserver((records) => {
                const width = records[records.length - 1]?.contentRect.width ?? -1;
                if (Math.abs(width - measuredWidth) > 0.5) { measuredWidth = width; forget(); }
              })
            : null;
          resize?.observe(view.dom);
          /** The document an overlay-only change produced, while it stands. */
          let unmeasuredOverlayDoc: PmNode | null = null;
          let pendingAfterComposition = false;
          const schedule = () => {
            if (raf) return;
            raf = window.requestAnimationFrame(() => {
              raf = 0;
              if (!view.dom.isConnected) return;
              if (isImeCompositionActive(view)) {
                // Even a decoration-only dispatch can redraw the pageBlock
                // containing Safari's live pre-edit DOM. Defer measurement and
                // dispatch together; compositionend will explicitly resume it.
                pendingAfterComposition = true;
                return;
              }
              pendingAfterComposition = false;
              const budget = { deadline: performance.now() + SPAN_READ_BUDGET_MS, incomplete: false };
              const entries = measurePageDecorationEntries(view, memo, budget);
              if (budget.incomplete) schedule();
              // What the sheets carry now is the plugin's own entries, moved
              // with their sheets through every change of the document. The
              // measurement is compared with those, not with the last one
              // dispatched: an entry names its sheet by position, so a typed
              // character moved every later sheet's entry and each keystroke
              // dispatched the same stamps again (a transaction through
              // every plugin, and the decorations of every sheet rebuilt).
              //
              // Unchanged measurements are skipped only while the stamped
              // decorations still sit on their sheets. The paginator moves
              // blocks by splitting and joining sheets (history-preserving),
              // and a node decoration mapped through a sheet split or join
              // is dropped; without this check the stamp never came back.
              const stamped = pageSpanKey.getState(view.state)?.entries ?? [];
              if (fingerprint(entries) === fingerprint(stamped) && decorationsInPlace(view, entries)) return;
              // Meta-only: no doc change, no history entry; the ledger
              // ignores the transaction itself. The stamps change no block's
              // place (the paper only ends what runs past it), so nothing is
              // measured again for them.
              view.dispatch(view.state.tr.setMeta(PAGE_SPAN_META, entries));
            });
          };
          const stopImeSettled = onImeCompositionSettled(view, () => {
            if (pendingAfterComposition) schedule();
          });
          schedule();
          // A font subset that arrived changes only the sheets drawing its
          // characters (a Chinese book fetches subsets all the while it is
          // laid out); a face for every character, or one naming none, all.
          const onFontsLoaded = (event: Event) => {
            const faces = newFontFacesOf(event) ??
              (event as Event & { fontfaces?: ReadonlyArray<{ family?: string; unicodeRange?: string }> }).fontfaces;
            const used = faces && faces.length > 0 ? facesUsedBy(faces, editorFontFamilies(view.dom)) : null;
            if (used && used.length === 0) return;
            const ranges = loadedFaceRanges(used ?? faces);
            if (!ranges) { forget(); return; }
            for (const sheet of sheetsOf(view.dom)) {
              if (textDrawsCodePointIn(sheet.textContent ?? "", ranges)) memo.forget(sheet);
            }
            schedule();
          };
          window.addEventListener("mrn-page-rebalance", forget);
          view.dom.ownerDocument.fonts?.addEventListener?.("loadingdone", onFontsLoaded);
          view.dom.addEventListener(PAGE_OVER_TALL_SHEETS_EVENT, schedule);
          return {
            update(updated, previousState) {
              stampSheetPlaces(updated, pageSpanKey.getState(updated.state)?.entries ?? []);
              // An object drawn over the text inside a page takes no room:
              // every sheet's extent, span and number is what it was, and
              // the stamps follow their sheets through the change. The
              // updates that follow it without changing the document (the
              // history marker of that edit, a selection) have no more to
              // measure than it had; the next change of the document, or
              // any layout nudge, measures as ever.
              if (updated.state.doc !== previousState.doc) {
                unmeasuredOverlayDoc = overlayOnlyDocChange(previousState.doc, updated.state.doc)
                  ? updated.state.doc
                  : null;
              }
              if (unmeasuredOverlayDoc === updated.state.doc) return;
              schedule();
            },
            destroy() {
              window.removeEventListener("mrn-page-rebalance", forget);
              view.dom.ownerDocument.fonts?.removeEventListener?.("loadingdone", onFontsLoaded);
              view.dom.removeEventListener(PAGE_OVER_TALL_SHEETS_EVENT, schedule);
              resize?.disconnect();
              surfaceObserver?.disconnect();
              memo.disconnect();
              stopImeSettled();
              if (raf) {
                window.cancelAnimationFrame(raf);
                raf = 0;
              }
            },
          };
        },
      }),
    ];
  },
});
