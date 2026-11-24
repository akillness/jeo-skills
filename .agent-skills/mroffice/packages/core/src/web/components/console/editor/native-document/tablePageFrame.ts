/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A floating table (`w:tblpPr`, ECMA-376 17.4.58) drawn where Word puts it.
 *
 * Word places such a table from one of three horizontal anchors (ST_HAnchor:
 * the page, the margins, or the text column -- "column" here) and three
 * vertical ones (ST_VAnchor: the page, the margins, or the text -- the top of
 * the paragraph after the table, i.e. where the table starts in the flow),
 * at a distance (`w:tblpX` / `w:tblpY`, the table's top-left corner) or an
 * alignment (`w:tblpXSpec` / `w:tblpYSpec`, the table's whole frame), and
 * wraps the body text around it at its four `*FromText` distances. In
 * compatibility mode 15 the table's left border edge stands at the stated x
 * (Word 16, wps-position-parity D-word.docx: T04 page x 216 pt, first cell
 * at 216.5 pt; T05 centred in the margins at 198.2 pt; T06 1" from the text
 * column at 144.5 pt with its bottom on the bottom margin).
 *
 * The geometry is the drawings' own: the table becomes a FloatAnchor (square
 * wrap at its `*FromText` distances) and `placeFloatOnPage` resolves its
 * bands, alignments and Word's keep-on-page rule. The table is then drawn
 * one of three ways:
 *
 * - `frame`: wholly outside the body text (a letterhead sidebar in the right
 *   margin, corpus R37-D22): absolute on its sheet, the flow untouched.
 * - `float`: text on one side only, at or below its place in the flow: a CSS
 *   float with Word's distances as margins; a drop below the flow place is a
 *   top margin whose band `shape-outside` cuts away, so the lines above the
 *   table stay whole.
 * - `both`: text on both sides (Word wraps a floating table on both sides,
 *   T05: words left of and right of a centred table on the same line), or a
 *   table above its place in the flow: absolute on its sheet, the lines that
 *   cross it carried past it by `floatBothSidesWrap`.
 *
 * Every placement costs the flow nothing (the ledger reads an absolute or
 * floated block as out of vertical flow). A multi-column sheet keeps the
 * in-flow projection unless the table is a frame: the wrap across columns is
 * not modelled.
 */
import { EMU_PER_PX, EMU_PER_TWIP } from "../../../../lib/office-units";
import {
  floatSide,
  placeFloatOnPage,
  resolveFloatPlacement,
  type FloatAnchor,
  type FloatKeepOnPage,
  type FloatPageGeometry,
  type FloatPlacement,
} from "../../../../lib/office-float-anchor";

import {
  FLOAT_BOTH_SIDES_ATTR,
  FLOAT_BOTH_SIDES_MIN_STRIP_PX,
  FLOAT_WRAP_DISTANCES_ATTR,
} from "./floatBothSidesWrap";
import { paginationLayoutScale } from "./paged/paginationGeometry";
import {
  COLUMN_BAND_EXCLUSION_ATTR,
  COLUMN_TABLE_FRAME,
  ownSectionColumnCount,
  unequalColumnCount,
  unequalColumnPlacementForBlock,
} from "./paged/unequalColumnProjection";
import {
  normalizeTablePositioning,
  tablePositioningAnchorOffsetPx,
  tablePositioningIgnoredByWord,
  type TablePositioning,
} from "./tablePositioning";

export const TABLE_PAGE_FRAME_ATTR = "data-table-page-frame";

/**
 * A floating table kept whole on its page by "Don't break wrapped tables
 * across pages" that runs past the page foot: no body spill
 * (pageSpanExtension `measureSheetBodyExtent`).
 */
export const TABLE_KEEP_WHOLE_ATTR = "data-table-keep-whole";

/**
 * Where the empty paragraph a text-anchored floating table hangs from takes
 * its line (`syncTableFrameAnchor`): `hang` at the table's top, costing
 * nothing below it; `clear` below the table.
 */
export const TABLE_FRAME_ANCHOR_ATTR = "data-table-frame-anchor";

/**
 * A paragraph whose lines a raised floating table pushed below it
 * (`overlappedLinesPx`); `--table-frame-pushed` is how far down it is drawn.
 */
export const TABLE_FRAME_PUSHED_ATTR = "data-table-frame-pushed";
const PUSHED_SHIFT_PROPERTY = "--table-frame-pushed";

/**
 * The paragraph after a raised table that takes the room of the lines the
 * table pushed below it (`--table-frame-room-above`, a top padding).
 */
export const TABLE_FRAME_ROOM_ABOVE_ATTR = "data-table-frame-room-above";
const ROOM_ABOVE_PROPERTY = "--table-frame-room-above";

/** How far down a pushed paragraph is drawn (0 for any other block). */
function pushedShiftPx(element: HTMLElement): number {
  if (!element.hasAttribute(TABLE_FRAME_PUSHED_ATTR)) return 0;
  return Number.parseFloat(element.style.getPropertyValue(PUSHED_SHIFT_PROPERTY)) || 0;
}


/**
 * The table as the drawings' anchor model: its anchors, its position, and a
 * square wrap at its `*FromText` distances. `inline` (ST_YAlign) is the
 * table's own place in the flow: zero below its anchor paragraph's top.
 */
export function tablePositioningFloatAnchor(
  positioning: TablePositioning,
  widthPx: number,
  heightPx: number,
): FloatAnchor {
  const { horizontal, vertical, distanceFromText: distance } = positioning;
  const verticalAxis: FloatAnchor["vertical"] =
    vertical.mode === "align" && vertical.value === "inline"
      ? { relativeFrom: "paragraph", offsetEmu: 0 }
      : {
          relativeFrom: positioning.verticalAnchor === "text" ? "paragraph" : positioning.verticalAnchor,
          ...(vertical.mode === "align"
            ? { align: vertical.value as Exclude<typeof vertical.value, "inline"> }
            : { offsetEmu: vertical.twips * EMU_PER_TWIP }),
        };
  return {
    version: 1,
    horizontal: {
      relativeFrom: positioning.horizontalAnchor,
      ...(horizontal.mode === "align" ? { align: horizontal.value } : { offsetEmu: horizontal.twips * EMU_PER_TWIP }),
    },
    vertical: verticalAxis,
    widthEmu: Math.round(widthPx * EMU_PER_PX),
    heightEmu: Math.round(heightPx * EMU_PER_PX),
    wrap: { kind: "square", text: "bothSides" },
    behindDoc: false,
    locked: false,
    layoutInCell: true,
    allowOverlap: true,
    hidden: false,
    relativeHeight: 0,
    simplePos: false,
    distTEmu: distance.top * EMU_PER_TWIP,
    distBEmu: distance.bottom * EMU_PER_TWIP,
    distLEmu: distance.left * EMU_PER_TWIP,
    distREmu: distance.right * EMU_PER_TWIP,
    effectLEmu: 0,
    effectTEmu: 0,
    effectREmu: 0,
    effectBEmu: 0,
    rotation: 0,
    flipH: false,
    flipV: false,
  };
}

export type TablePageFrameMode = "frame" | "float" | "both" | "split";

export interface TablePageFrame {
  readonly mode: TablePageFrameMode;
  /** The table's border box, in px from the page's top-left corner. */
  readonly placement: FloatPlacement;
  /** The side a one-sided float stands on (text on the other). */
  readonly side: "left" | "right";
  /** How far below its place in the flow the table starts (negative above). */
  readonly dropPx: number;
  /** Whether a strip of body text fits beside the table on either side. */
  readonly textBeside: boolean;
  readonly distances: { readonly topPx: number; readonly rightPx: number; readonly bottomPx: number; readonly leftPx: number };
}

/**
 * Where Word draws a floating table on its page and how the text goes round
 * it, or `null` when it stays in the flow: Word ignores the `w:tblpPr`
 * ([MS-OI29500] 17.4.57 b), or the sheet has several columns.
 * `geometry.flowTopPx` is the table's place in the flow (the text anchor).
 *
 * A table placed down from the page or the margins is kept on the paper
 * first: Word 16.86 drew a six-row table set 8.5" below the page top (its
 * foot 36 pt past the paper) with its foot on the paper's edge, 576 pt down
 * (wps-position-parity Gtbl2 TB/TC/TG). One placed from its text is not
 * moved (Gtbl TA: 10 rows from 516 pt stay there).
 *
 * `split`: the table then still reaches below the body (`bodyBottomPx`, the
 * page's real text bottom, a tall footer included). Word breaks it at the
 * last row that fits and carries the rest to the top of the next page, the
 * text wrapped round it there; every line after the table goes to that
 * page too, the room beside the first part left empty (Gtbl TA, TD, TE, TF
 * and Gtbl2 TB, TC, TG, TH; D-word T06, bottom-aligned on the 720 pt margin
 * with a footer lifting the body to 699 pt). The table is then drawn IN the
 * flow, its drop a top margin, so the paginator breaks it there as it
 * breaks any table; the part on the next page is placed at that page's top
 * (`projectTablePageFrames`).
 */
export function resolveTablePageFrame(
  positioning: TablePositioning,
  geometry: FloatPageGeometry,
  size: { readonly widthPx: number; readonly heightPx: number },
  columnCount = 1,
  bodyBottomPx = geometry.pageHeightPx - geometry.marginBottomPx,
  keepWhole = false,
): TablePageFrame | null {
  if (tablePositioningIgnoredByWord(positioning)) return null;
  const anchor = tablePositioningFloatAnchor(positioning, size.widthPx, size.heightPx);
  // Across, Word's keep-on-page rule as for any wrapped object; down, a
  // table is never held inside the margins (TA's foot runs past the bottom
  // margin and the table breaks there), only kept on the paper below.
  let placement = { ...placeFloatOnPage(anchor, geometry), topPx: resolveFloatPlacement(anchor, geometry).topPx };
  // A table taller than the page's text breaks wherever it stands: Word
  // draws it at its place and breaks it at the foot (corpus R99-D23: a
  // 686 px table placed 164pt down a landscape page starts there; raised to
  // stay on the paper, it stood 37pt high).
  const bodyHeightPx = geometry.pageHeightPx - geometry.marginTopPx - geometry.marginBottomPx;
  if (
    (positioning.verticalAnchor === "page" || positioning.verticalAnchor === "margin") &&
    placement.heightPx <= bodyHeightPx &&
    placement.topPx + placement.heightPx > geometry.pageHeightPx
  ) {
    placement = { ...placement, topPx: Math.max(0, geometry.pageHeightPx - placement.heightPx) };
  }
  const distance = positioning.distanceFromText;
  const distances = {
    topPx: distance.top / 15,
    rightPx: distance.right / 15,
    bottomPx: distance.bottom / 15,
    leftPx: distance.left / 15,
  };
  const bodyLeft = geometry.marginLeftPx;
  const bodyRight = geometry.pageWidthPx - geometry.marginRightPx;
  const bodyTop = geometry.marginTopPx;
  const bodyBottom = geometry.pageHeightPx - geometry.marginBottomPx;
  const left = placement.leftPx - distances.leftPx;
  const right = placement.leftPx + placement.widthPx + distances.rightPx;
  const top = placement.topPx - distances.topPx;
  const bottom = placement.topPx + placement.heightPx + distances.bottomPx;
  const roomBefore = left - bodyLeft;
  const roomAfter = bodyRight - right;
  const base = {
    placement,
    side: floatSide(anchor, placement, geometry),
    dropPx: placement.topPx - (geometry.flowTopPx ?? placement.topPx),
    textBeside: roomBefore >= FLOAT_BOTH_SIDES_MIN_STRIP_PX || roomAfter >= FLOAT_BOTH_SIDES_MIN_STRIP_PX,
    distances,
  };
  const covers = left < bodyRight && right > bodyLeft && top < bodyBottom && bottom > bodyTop;
  if (!covers) return { mode: "frame", ...base };
  if (columnCount > 1) return null;
  // Word's "Don't break wrapped tables across pages" (`keepWhole`) keeps
  // the table whole on its page, running past the foot (corpus R103-D20,
  // compatibility mode 11: two 90.6 pt rows on a 166 pt page, one page).
  if (!keepWhole && placement.topPx + placement.heightPx > bodyBottomPx + 0.5 && base.dropPx >= -0.5) {
    return { mode: "split", ...base };
  }
  if (roomBefore >= FLOAT_BOTH_SIDES_MIN_STRIP_PX && roomAfter >= FLOAT_BOTH_SIDES_MIN_STRIP_PX) {
    return { mode: "both", ...base };
  }
  // A raised table with no strip of text beside it has its text above and
  // below it in Word, and its page holds it: it stays in the flow, raised
  // from its place (projectTablePageFrames). Placed out of the flow to wrap
  // both sides, it cost its page nothing and the paragraphs after it ran
  // under it (LibreOffice's floattable-tab-join files R92-D26 / R93-D02:
  // Word 3 pages, here 2).
  if (base.dropPx < -0.5 && roomBefore < FLOAT_BOTH_SIDES_MIN_STRIP_PX && roomAfter < FLOAT_BOTH_SIDES_MIN_STRIP_PX) {
    return { mode: "split", ...base };
  }
  // A table at or below its place with no strip of text beside it has its
  // text above and below it only: Word sets it as a table of the flow,
  // broken at the page foot by rows (RULES.md, floating tables across pages:
  // text-anchored, tblpY positive or small). Drawn as a float it cost its
  // page nothing in the ledger, which publishes no room for a table: R280-D10
  // planned two such tables at 0 px, the page overflowed by 661 px, the
  // verifier carried the next table whole to page 2 and it was never cut
  // where Word cuts it. On since compared on 4 documents (R280-D10 cut as
  // Word cuts it, R280-D19 three pages again); `window.__docsFloatTableInFlow
  // = false` turns it off.
  // Only a table placed from its text: one placed down the page or the
  // margins stands where it is put, and the text above and below it does
  // not move (R280-D19: two page-placed tables taken into the flow pushed
  // page 1 onto a page of its own, 4 pages where Word has 3).
  if (positioning.verticalAnchor === "text" && base.dropPx >= -0.5 && !base.textBeside && floatTableInFlow()) return { mode: "split", ...base };
  // A float cannot rise above its own place in the flow.
  return { mode: base.dropPx >= -0.5 ? "float" : "both", ...base };
}

function floatTableInFlow(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsFloatTableInFlow?: boolean }).__docsFloatTableInFlow !== false;
}

/** The page a sheet is, in its own CSS px (computed style, so a zoom
 * transform on an ancestor does not scale it). */
function sheetGeometry(sheet: HTMLElement, keepOnPage?: FloatKeepOnPage): FloatPageGeometry | null {
  const style = getComputedStyle(sheet);
  const pageWidthPx = sheet.offsetWidth;
  // The paper's height, not a sheet its content overflows.
  const pageHeightPx = Number.parseFloat(style.minHeight) || sheet.offsetHeight;
  if (!(pageWidthPx > 0) || !(pageHeightPx > 0)) return null;
  const marginLeftPx = Number.parseFloat(style.paddingLeft) || 0;
  const marginRightPx = Number.parseFloat(style.paddingRight) || 0;
  return {
    pageWidthPx,
    pageHeightPx,
    marginLeftPx,
    marginTopPx: Number.parseFloat(style.paddingTop) || 0,
    marginRightPx,
    marginBottomPx: Number.parseFloat(style.paddingBottom) || 0,
    columnLeftPx: marginLeftPx,
    columnWidthPx: Math.max(0, pageWidthPx - marginLeftPx - marginRightPx),
    mirroredEvenPage: sheet.dataset.pagePhysicalParity === "even",
    ...(keepOnPage ? { keepOnPage } : {}),
  };
}

/**
 * Whether a floating table holds a floating table in one of its cells. Word
 * does not break such a table across pages: it stays whole where it stands,
 * running past the page foot (corpus R104-D19, LibreOffice
 * floattable-outer-nonsplit-inner: the outer table from 845 pt on a page whose
 * text ends at 1152 pt, 335 pt tall, one page in Word; moved whole, ours took
 * two).
 */
function holdsFloatingTable(table: HTMLElement): boolean {
  return table.querySelector(":is(td, th) table[data-table-positioning]") !== null;
}

/** The whole height of a table the paginator broke into parts (the parts
 * share `data-page-table-fragment-id`), or the table's own when it is whole. */
export function brokenTableHeightPx(table: HTMLTableElement): number {
  const id = table.dataset.pageTableFragmentId;
  const root = table.closest(".ProseMirror") ?? table.ownerDocument;
  if (!id) return table.offsetHeight;
  let total = 0;
  for (const part of root.querySelectorAll<HTMLTableElement>("table[data-page-table-fragment-id]")) {
    if (part.dataset.pageTableFragmentId === id) total += part.offsetHeight;
  }
  return Math.max(total, table.offsetHeight);
}

/** The space after the in-flow block a wrapper follows (what its own top
 * margin collapses with). */
function previousSpaceAfterPx(wrapper: HTMLElement): number {
  for (let previous = wrapper.previousElementSibling; previous; previous = previous.previousElementSibling) {
    if (!(previous instanceof HTMLElement)) continue;
    const style = getComputedStyle(previous);
    if (style.display === "none" || style.position === "absolute" || style.position === "fixed") continue;
    const floated = style.float || style.cssFloat || "none";
    if (floated !== "none" && floated !== "") continue;
    return Math.max(0, Number.parseFloat(style.marginBottom) || 0);
  }
  return 0;
}

/**
 * The section's own top and bottom margins, which Word places a table set
 * from the margins against: a footer taller than the bottom margin lifts the
 * page's text (the sheet's padding) but not the margin a bottom-aligned
 * table stands on (D-word T06: its foot on the 720 pt margin, the body
 * ending at 699 pt). Empty when the sheet states none.
 */
function nominalVerticalMargins(sheet: HTMLElement): { marginTopPx?: number; marginBottomPx?: number } {
  const style = getComputedStyle(sheet);
  const top = Number.parseFloat(style.getPropertyValue("--page-margin-top"));
  const bottom = Number.parseFloat(style.getPropertyValue("--page-margin-bottom"));
  return {
    ...(Number.isFinite(top) && top >= 0 ? { marginTopPx: top } : {}),
    ...(Number.isFinite(bottom) && bottom >= 0 ? { marginBottomPx: bottom } : {}),
  };
}

/**
 * Where the table starts in the flow, in px from the sheet's top: under the
 * in-flow block before it (after its space after), else at the margin. Read
 * from its neighbour, never from the table's own box, so the reading is the
 * same whichever way the table is drawn.
 */
function flowTopPx(wrapper: HTMLElement, sheet: HTMLElement): number {
  const scale = paginationLayoutScale(sheet);
  const sheetTop = sheet.getBoundingClientRect().top;
  for (let previous = wrapper.previousElementSibling; previous; previous = previous.previousElementSibling) {
    if (!(previous instanceof HTMLElement)) continue;
    const style = getComputedStyle(previous);
    if (style.display === "none" || style.position === "absolute" || style.position === "fixed") continue;
    const floated = style.float || style.cssFloat || "none";
    if (floated !== "none" && floated !== "") continue;
    return (
      (previous.getBoundingClientRect().bottom - sheetTop) / (scale.y || 1) - pushedShiftPx(previous) +
      Math.max(0, Number.parseFloat(style.marginBottom) || 0)
    );
  }
  return Number.parseFloat(getComputedStyle(sheet).paddingTop) || 0;
}

/**
 * The lines of the paragraph right before a raised table that the table's
 * raised top crosses, which Word sets below the table (Word 16, corpus
 * R101-D23: a table tblpY -13.45 pt above its anchor overlaps the last line
 * of the paragraph before it, "after Table 2, second"; that line stands
 * below the table, and the anchor after it goes to the next page). Returns
 * their extent and whether they are the whole paragraph (only then is it
 * drawn below the table: one line cannot be moved apart from the rest), or
 * null. Only a table raised within the paragraph before it is handled.
 */
function overlappedLinesPx(
  wrapper: HTMLElement,
  sheet: HTMLElement,
  raisedTopPx: number,
): { readonly paragraph: HTMLElement; readonly topPx: number; readonly heightPx: number; readonly whole: boolean } | null {
  const paragraph = wrapper.previousElementSibling;
  if (!(paragraph instanceof HTMLElement) || paragraph.tagName !== "P") return null;
  const style = getComputedStyle(paragraph);
  if (style.display === "none" || style.position === "absolute" || style.position === "fixed") return null;
  if ((style.float || style.cssFloat || "none") !== "none") return null;
  const scale = paginationLayoutScale(sheet);
  const sheetTop = sheet.getBoundingClientRect().top;
  const shift = pushedShiftPx(paragraph);
  const toSheet = (y: number) => (y - sheetTop) / (scale.y || 1) - shift;
  const box = paragraph.getBoundingClientRect();
  const contentTop = toSheet(box.top) + (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.borderTopWidth) || 0);
  const contentBottom =
    toSheet(box.bottom) - (Number.parseFloat(style.paddingBottom) || 0) - (Number.parseFloat(style.borderBottomWidth) || 0);
  if (!(contentBottom > raisedTopPx + 0.5) || raisedTopPx < contentTop - 0.5) return null;
  // The line boxes the raised top crosses or runs above: the inline boxes
  // of the paragraph's text whose foot is below it.
  const range = paragraph.ownerDocument.createRange();
  range.selectNodeContents(paragraph);
  let firstPushedTop = Number.POSITIVE_INFINITY;
  let anyLine = false;
  for (const rect of Array.from(range.getClientRects())) {
    if (!(rect.height > 0)) continue;
    anyLine = true;
    if (toSheet(rect.bottom) > raisedTopPx + 0.5) firstPushedTop = Math.min(firstPushedTop, toSheet(rect.top));
  }
  range.detach();
  // An empty paragraph is one line, its content box.
  const top = !anyLine ? contentTop : Math.max(contentTop, firstPushedTop);
  if (!Number.isFinite(top)) return null;
  const whole = !anyLine || top <= contentTop + 2;
  const from = whole ? contentTop : top;
  return { paragraph, topPx: from, heightPx: Math.max(0, contentBottom - from), whole };
}

const MANAGED_PROPERTIES = [
  "position",
  "left",
  "top",
  "height",
  "float",
  "clear",
  "width",
  "max-width",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding-bottom",
  "z-index",
  "shape-outside",
  "shape-margin",
  // The drop a page that opens with the table keeps (note-editor.css).
  "--table-frame-lead",
] as const;

type ManagedProperty = (typeof MANAGED_PROPERTIES)[number];

/** Write only what changed: the ledger runs this every pass. */
function writeStyles(wrapper: HTMLElement, values: Partial<Record<ManagedProperty, string>>): void {
  for (const property of MANAGED_PROPERTIES) {
    const value = values[property] ?? "";
    if (wrapper.style.getPropertyValue(property) === value) continue;
    if (value) wrapper.style.setProperty(property, value);
    else wrapper.style.removeProperty(property);
  }
}

function writeAttribute(element: HTMLElement, name: string, value: string | null): void {
  if (value === null) {
    if (element.hasAttribute(name)) element.removeAttribute(name);
  } else if (element.getAttribute(name) !== value) {
    element.setAttribute(name, value);
  }
}

/** Hand the wrapper back to the table's node view projection. */
export function releaseTablePageFrame(wrapper: HTMLElement): void {
  if (!wrapper.hasAttribute(TABLE_PAGE_FRAME_ATTR)) return;
  wrapper.removeAttribute(TABLE_PAGE_FRAME_ATTR);
  wrapper.removeAttribute(COLUMN_BAND_EXCLUSION_ATTR);
  wrapper.removeAttribute(TABLE_KEEP_WHOLE_ATTR);
  wrapper.removeAttribute(FLOAT_BOTH_SIDES_ATTR);
  wrapper.removeAttribute(FLOAT_WRAP_DISTANCES_ATTR);
  for (const property of MANAGED_PROPERTIES) wrapper.style.removeProperty(property);
}

const px = (value: number) => `${Math.round(value * 100) / 100}px`;

/**
 * A table in its frame ends at its own foot: Word sets the text after a
 * positioned table at the frame's bottom plus its distance from text (the
 * margin below), nothing more. The editor's table wrapper keeps 2 px of
 * spare padding below (note-editor.css, for the Markdown table's resize
 * handle), which pushed the paragraphs after every framed Word table 2 px
 * down: R281-D19's form on page 6 ended 2 px lower than Word's, its last note
 * line crossed the bottom margin by 2 px and went to a page of its own (14
 * pages; Word 13). `window.__docsFrameWrapperPad = true` keeps the padding
 * (old, A/B).
 */
function framePadding(wrapper: HTMLElement): Partial<Record<ManagedProperty, string>> {
  const win = wrapper.ownerDocument.defaultView as (Window & { __docsFrameWrapperPad?: boolean }) | null;
  return win?.__docsFrameWrapperPad === true ? {} : { "padding-bottom": "0px" };
}

/** Anything drawn in a paragraph. ProseMirror's own separator image (it ends
 * a text that ends in white space, before the trailing break) draws nothing:
 * read as a picture, it kept R280-D08's anchor of forty spaces beside the
 * table. */
const ANCHOR_DRAWN_CONTENT = "img:not(.ProseMirror-separator), svg, canvas, video, object, iframe, table";

/** An anchor paragraph holding text, all of it white space. */
export function paragraphIsWhiteSpace(paragraph: HTMLElement): boolean {
  if (paragraph.querySelector(ANCHOR_DRAWN_CONTENT)) return false;
  const text = (paragraph.textContent ?? "").replace(/[\u00b6\u200b\ufeff]/g, "");
  return text.length > 0 && !text.trim();
}

/** Whether an anchor of only white space clears the table: a floating table
 * that leaves no text room beside it. */
export function whiteSpaceAnchorClears(frame: Pick<TablePageFrame, "mode" | "textBeside">): boolean {
  return frame.mode === "float" && !frame.textBeside;
}

/** An anchor paragraph with nothing in it but its mark. */
function paragraphIsEmpty(paragraph: HTMLElement): boolean {
  if (paragraph.querySelector(ANCHOR_DRAWN_CONTENT)) return false;
  return !(paragraph.textContent ?? "").replace(/[\u00b6\u200b\ufeff]/g, "");
}

/** Marks a blank line after a side-wrapped object on its sheet. */
export const FLOAT_BLANK_LINE_ATTR = "data-float-blank-line";

/**
 * A line with nothing on it needs no width, so the browser leaves it where it
 * is, in no width at all, beside an object that leaves none; Word carries it
 * below the object as any line (corpus R281-D08: two blank lines under a
 * full-width figure's top, the caption 53 pt high). The mark gives such a line
 * a sliver of content, as wide as the narrowest strip text takes
 * (FLOAT_BOTH_SIDES_MIN_STRIP_PX, note-editor.css): the browser then moves the line
 * inside its paragraph, the way it moves a line of text, and the paragraph's
 * box, which is what the page ledger charges, grows by as much. Beside an
 * object that leaves room it changes nothing. No geometry is read, so the mark
 * cannot feed back on itself.
 */
export function markBlankLinesPastFloats(sheet: HTMLElement): void {
  const wanted = new Set<Element>();
  if (sheet.querySelector(':scope > [data-float-mode="float"]')) {
    let afterFloat = false;
    for (const child of Array.from(sheet.children)) {
      if (child.getAttribute("data-float-mode") === "float") afterFloat = true;
      else if (afterFloat && child instanceof HTMLElement && child.tagName === "P" && (paragraphIsEmpty(child) || paragraphIsWhiteSpace(child))) {
        wanted.add(child);
      }
    }
  }
  for (const element of Array.from(sheet.querySelectorAll(`:scope > [${FLOAT_BLANK_LINE_ATTR}]`))) {
    if (!wanted.has(element)) element.removeAttribute(FLOAT_BLANK_LINE_ATTR);
  }
  for (const element of wanted) {
    if (!element.hasAttribute(FLOAT_BLANK_LINE_ATTR)) element.setAttribute(FLOAT_BLANK_LINE_ATTR, "true");
  }
}

/** The height of the paragraph's line (a style read, never its box: a hung
 * anchor has none). */
function anchorLineHeightPx(paragraph: HTMLElement): number | null {
  const style = getComputedStyle(paragraph);
  const lineHeight = Number.parseFloat(style.lineHeight);
  if (Number.isFinite(lineHeight) && lineHeight > 0) return lineHeight;
  const fontSize = Number.parseFloat(style.fontSize);
  return style.lineHeight === "normal" && Number.isFinite(fontSize) && fontSize > 0 ? fontSize * 1.2 : null;
}

/**
 * Where the empty paragraph a text-anchored floating table hangs from takes
 * its line, when no text fits beside the table. Word lays the anchor
 * paragraph out where the flow is and places the table `w:tblpY` below its
 * top. In compatibility mode 15, an anchor line that fits in that drop
 * (`w:tblpY` at least its height) stays there and costs nothing below the
 * table; one that does not is pushed below the table and takes its line
 * there. In mode 14 the anchor always flows below the table. (Word 16,
 * measured: corpus R98-D12, tblpY 16 pt over a 15.4 pt line, its empty
 * anchor beside the table's top; R100-D01, tblpY 0.8 pt, every empty anchor
 * a line below its table, a second page; the same file in mode 14, every
 * anchor below.)
 *
 * The browser already draws a float's lines that way, except an EMPTY
 * paragraph's: it stays at the float's top whatever its line. So an empty
 * anchor beside a float that does not fit is `clear`ed below it, and one
 * after a table in the flow (`split`) that does fit is hung (`hang`).
 */
export function tableFrameAnchorPlace(
  frame: Pick<TablePageFrame, "mode" | "dropPx" | "textBeside" | "distances">,
  lineHeightPx: number | null,
  wordCompatibilityMode: number | null,
): "hang" | "clear" | null {
  if (frame.textBeside || (frame.mode !== "float" && frame.mode !== "split")) return null;
  if (wordCompatibilityMode !== null && wordCompatibilityMode < 15) return frame.mode === "float" ? "clear" : null;
  const fits = lineHeightPx !== null && frame.dropPx - frame.distances.topPx >= lineHeightPx - 0.5;
  if (fits) return frame.mode === "split" ? "hang" : null;
  return frame.mode === "float" ? "clear" : null;
}

/**
 * The top margin that stands a floating table at its place. A float with no
 * room beside the floats before it starts below them, its top margin counted
 * from there: a table placed from the page, 339 pt down, under a full-width
 * one ending at 325 pt stood at 458 pt (corpus R280-D19; Word draws it at its
 * place).
 */
export function stackedFloatDropPx(
  frame: Pick<TablePageFrame, "dropPx" | "textBeside" | "placement">,
  flowTopPx: number,
  floatsBottomPx: number,
): number {
  if (frame.textBeside || !(floatsBottomPx > flowTopPx)) return Math.max(0, frame.dropPx);
  return Math.max(0, frame.placement.topPx - floatsBottomPx);
}

/**
 * A floating table placed down from the page or the margins on a page of
 * newspaper columns, drawn where Word draws it: at its page point, out of the
 * column flow, the page it stands on being its anchor paragraph's (corpus
 * R423-D04: a journal's sidebar table 9169 tw down the page in the narrow
 * first column, anchored after the abstract in the wide second; Word draws
 * it in the first column of page 1, x 28 pt, y 458-737 pt). Laid into its
 * anchor's column at its drop, it overflowed that column and took itself and
 * every page after it on by a page, the single-column frame's page margins
 * squeezing its column slot to 1 px. A column it stands across to the foot
 * ends above it (`COLUMN_BAND_EXCLUSION_ATTR`, as a page-placed text box).
 * A table anchored to its text, one the paginator broke, or one running past
 * the page's foot keeps its column's flow. Returns whether it was placed.
 * `window.__docsColumnTableFloatOff = true` keeps the older layout (A/B).
 */
function placeColumnPageTable(
  wrapper: HTMLElement,
  table: HTMLTableElement,
  positioning: TablePositioning,
  geometry: FloatPageGeometry,
  sheet: HTMLElement,
  size: { readonly widthPx: number; readonly heightPx: number },
  broken: boolean,
): boolean {
  if (broken || positioning.verticalAnchor === "text") return false;
  // From the column it stands in: the track its place in the flow is in.
  const slot = positioning.horizontalAnchor === "column" ? unequalColumnPlacementForBlock(wrapper) : null;
  const pageGeometry: FloatPageGeometry = {
    ...geometry,
    ...nominalVerticalMargins(sheet),
    ...(slot ? { columnLeftPx: geometry.marginLeftPx + slot.inlineStartPx, columnWidthPx: slot.widthPx } : {}),
  };
  const frame = resolveTablePageFrame(positioning, pageGeometry, size, 1, geometry.pageHeightPx - geometry.marginBottomPx, true);
  if (!frame) return false;
  const { placement, distances } = frame;
  const bodyBottomPx = geometry.pageHeightPx - geometry.marginBottomPx;
  if (frame.mode !== "frame" && placement.topPx + placement.heightPx > bodyBottomPx + 0.5) return false;
  const anchorShift = table.dataset.wordTableOutdent === "true" ? tablePositioningAnchorOffsetPx(positioning) ?? 0 : 0;
  const left = placement.leftPx - anchorShift;
  const band =
    frame.mode === "frame"
      ? null
      : [
          placement.topPx - distances.topPx - geometry.marginTopPx,
          placement.topPx + placement.heightPx + distances.bottomPx - geometry.marginTopPx,
          placement.leftPx - distances.leftPx - geometry.marginLeftPx,
          placement.leftPx + placement.widthPx + distances.rightPx - geometry.marginLeftPx,
        ].map((value) => Math.round(value * 100) / 100).join(",");
  writeAttribute(wrapper, TABLE_PAGE_FRAME_ATTR, COLUMN_TABLE_FRAME);
  writeAttribute(wrapper, TABLE_KEEP_WHOLE_ATTR, null);
  writeAttribute(wrapper, COLUMN_BAND_EXCLUSION_ATTR, band);
  writeAttribute(wrapper, FLOAT_BOTH_SIDES_ATTR, null);
  writeAttribute(wrapper, FLOAT_WRAP_DISTANCES_ATTR, null);
  writeStyles(wrapper, {
    position: "absolute",
    left: px(left),
    top: px(placement.topPx),
    float: "none",
    width: "max-content",
    "max-width": "none",
    "margin-top": "0px",
    "margin-right": "0px",
    "margin-bottom": "0px",
    "margin-left": "0px",
    ...framePadding(wrapper),
    "z-index": "1",
  });
  return true;
}

function columnTableFloatOff(sheet: HTMLElement): boolean {
  const win = sheet.ownerDocument.defaultView as (Window & { __docsColumnTableFloatOff?: boolean }) | null;
  return win?.__docsColumnTableFloatOff === true;
}

/**
 * Draw every floating table of one sheet where Word puts it. Returns the
 * wrappers set to wrap on both sides, for `floatBothSidesWrap`.
 */
export function projectTablePageFrames(
  sheet: HTMLElement,
  keepOnPage?: FloatKeepOnPage,
  options: { readonly doNotBreakWrappedTables?: boolean } = {},
): HTMLElement[] {
  // A legacy layout option: Word honours it before compatibility mode 15.
  const mode = keepOnPage?.wordCompatibilityMode ?? null;
  const keepWhole = options.doNotBreakWrappedTables === true && (mode === null || mode < 15);
  const bothSides: HTMLElement[] = [];
  let geometry: FloatPageGeometry | null | undefined;
  let columnCount = 1;
  let trackCount = 1;
  // A sheet without a positioned table (nearly every one) is asked once,
  // not once per block: every ledger pass asked every block of the book.
  const anyPositioned = sheet.querySelector("table[data-table-positioning]") !== null;
  const anchorPlaces = new Map<HTMLElement, "hang" | "clear">();
  const pushedLines = new Map<HTMLElement, number>();
  const roomAbove = new Map<HTMLElement, number>();
  let floatsBottomPx = Number.NEGATIVE_INFINITY;
  const placeAnchor = (
    wrapper: HTMLElement,
    frame: TablePageFrame,
    positioning: TablePositioning,
    broken: boolean,
    pastFoot = false,
  ) => {
    if (broken || positioning.verticalAnchor !== "text") return;
    const anchor = wrapper.nextElementSibling;
    if (!(anchor instanceof HTMLElement) || anchor.tagName !== "P") return;
    if (!paragraphIsEmpty(anchor)) {
      // An anchor of nothing but spaces is text Word lays out: with no room
      // beside the table it stands under it (corpus R280-D08: a full-width
      // header table anchored to forty spaces; Word puts them a line below
      // the table, the title under them). The browser lets a line of only
      // white space hang beside the float in no width at all.
      if (paragraphIsWhiteSpace(anchor) && whiteSpaceAnchorClears(frame)) anchorPlaces.set(anchor, "clear");
      return;
    }
    // Below a table kept whole past the page foot, the anchor's line is off
    // the paper on the same page in Word (R104-D19: one page); cleared below
    // the table here, it ran past the foot and the repair moved it and the
    // table to the next page. It takes no room.
    const place = pastFoot
      ? "hang"
      : tableFrameAnchorPlace(frame, anchorLineHeightPx(anchor), keepOnPage?.wordCompatibilityMode ?? null);
    if (place) anchorPlaces.set(anchor, place);
  };
  for (const wrapper of Array.from(sheet.children) as HTMLElement[]) {
    const table = anyPositioned
      ? wrapper.querySelector<HTMLTableElement>(":scope > table[data-table-positioning], :scope table[data-table-positioning]")
      : null;
    if (!table || table.closest("article[data-page-sheet]") !== sheet || table.parentElement?.closest("td, th")) {
      releaseTablePageFrame(wrapper);
      continue;
    }
    let positioning: TablePositioning | null = null;
    try {
      positioning = normalizeTablePositioning(JSON.parse(table.dataset.tablePositioning ?? "null"));
    } catch {
      positioning = null;
    }
    if (!positioning) {
      releaseTablePageFrame(wrapper);
      continue;
    }
    // A floating table the paginator broke at the page's foot (`split`):
    // the first part stays in the flow at its drop; a later part opens its
    // page and stands at that page's top, across where the table stands,
    // where Word carries the rows on (wps-position-parity Gtbl TA: rows 5-9
    // at the next page's top margin). Both parts stay in the flow: a part
    // drawn out of it would cost its page nothing, and the paginator would
    // join the table again and break it again on every pass. (Word wraps
    // the next page's words beside the part it carried over; here they
    // start below it.)
    const continues = table.dataset.pageTableContinues === "true";
    const continuation = table.dataset.pageTableContinuation === "true";
    if (continuation) {
      positioning = { ...positioning, verticalAnchor: "text", vertical: { mode: "offset", twips: 0 } };
    }
    if (geometry === undefined) {
      geometry = sheetGeometry(sheet, keepOnPage);
      columnCount = Number.parseInt(getComputedStyle(sheet).columnCount, 10) || 1;
      trackCount = columnTableFloatOff(sheet) ? 1 : unequalColumnCount(sheet) ?? 1;
    }
    const widthPx = table.offsetWidth;
    // The first part of a broken table is placed as the whole table is:
    // placed by its own height, a table aligned to the bottom margin dropped
    // by the rows it gave away, no longer reached the page's foot, and the
    // paginator joined the table again and sent it whole to the next page
    
    // first row on page 24).
    const heightPx = continues && !continuation ? brokenTableHeightPx(table) : table.offsetHeight;
    if (!geometry || !(widthPx > 0) || !(heightPx > 0)) continue;
    // A page of newspaper columns: every block stands in a column track
    // (unequalColumnProjection), so a table's frame is never a float of the
    // page. One placed down the page or the margins is drawn at its page
    // point out of the column flow; any other keeps its column's flow.
    if (trackCount > 1 && ownSectionColumnCount(wrapper) > 1) {
      if (!placeColumnPageTable(wrapper, table, positioning, geometry, sheet, { widthPx, heightPx }, continues || continuation)) {
        releaseTablePageFrame(wrapper);
      }
      continue;
    }
    // A table of a single-column section on a page of column regions is laid
    // out as on a single-column page; a column frame it had is let go.
    if (wrapper.getAttribute(TABLE_PAGE_FRAME_ATTR) === COLUMN_TABLE_FRAME) releaseTablePageFrame(wrapper);
    const flowTop = flowTopPx(wrapper, sheet);
    const pageGeometry = { ...geometry, ...nominalVerticalMargins(sheet), flowTopPx: flowTop };
    // A table holding a floating table is kept whole on its page (R104-D19)
    // only when the page's text can hold it: one taller than that breaks
    // across pages in Word as any table does (corpus R87-D24: a 27-row form
    // holding floating tables runs 6 pages; kept whole, the page drew 5,084 px
    // of it on one sheet whenever the frame happened to be read as floating).
    const holderKeptWhole =
      holdsFloatingTable(table) &&
      heightPx <= pageGeometry.pageHeightPx - pageGeometry.marginTopPx - pageGeometry.marginBottomPx + 0.5;
    const keptWhole = (keepWhole || holderKeptWhole) && !continues && !continuation;
    const resolved = resolveTablePageFrame(
      positioning,
      pageGeometry,
      { widthPx, heightPx },
      columnCount,
      geometry.pageHeightPx - geometry.marginBottomPx,
      keptWhole,
    );
    // A part that goes on to the next page is broken at this page's foot:
    // it stays in the flow, as the whole table did when it was broken.
    const frame =
      resolved && (continues || continuation) && resolved.mode !== "frame" ? { ...resolved, mode: "split" as const } : resolved;
    if (!frame) {
      releaseTablePageFrame(wrapper);
      continue;
    }
    // Word 2010 layout (a text-aligned table) states the table's distance
    // from the margin / column on the table's own box, with its legacy
    // outdent (`wordTableDisplayMarginLeftPx`): the box keeps the outdent,
    // the wrapper takes the distance.
    const anchorShift = table.dataset.wordTableOutdent === "true" ? tablePositioningAnchorOffsetPx(positioning) ?? 0 : 0;
    const left = frame.placement.leftPx - anchorShift;
    const { distances, placement } = frame;
    writeAttribute(wrapper, TABLE_PAGE_FRAME_ATTR, frame.mode);
    const runsPastFoot =
      keptWhole && frame.mode === "float" &&
      frame.placement.topPx + frame.placement.heightPx > geometry.pageHeightPx - geometry.marginBottomPx + 0.5;
    writeAttribute(wrapper, TABLE_KEEP_WHOLE_ATTR, runsPastFoot ? "true" : null);
    if (frame.mode === "split") {
      const tableStyle = getComputedStyle(table);
      const wrapperWidth =
        (Number.parseFloat(tableStyle.marginLeft) || 0) + widthPx + (Number.parseFloat(tableStyle.marginRight) || 0);
      // A whole table raised above its place (a negative drop): drawn that
      // much higher, and the flow it takes ends that much earlier, where its
      // raised foot is (Word keeps R92-D26's 721.5 px table on a 720 px page
      // raised 12 px into the top margin, its paragraphs on the next page).
      // The first part of such a table broken at the page foot is raised as
      // the whole was, its flow ending at its raised foot: unraised, its
      // parts measured the drop more than the whole, the paginator could
      // never join them again, and one pass that broke the table (a page
      // still filling) kept it broken (R92-D26 / R93-D02, timing
      // dependent: "A3" alone on page 3). A later part opens its page.
      const raisedPx = frame.dropPx < -0.5 && !continuation ? frame.dropPx : 0;
      // The lines of the paragraph before that the raised table crosses go
      // below it. Their room is taken by the paragraph after the table, never
      // by the table: a table grown by them broke at the page foot in some
      // pass, and a broken raised table is never raised or joined again
      // (R92-D26 / R93-D02, Word: the table whole on page 2, the line on page
      // 3). With nothing after the table on its page there is no room to
      // take, and nothing is pushed. A paragraph crossed whole is drawn
      // below the table.
      const after = wrapper.nextElementSibling;
      const pushed =
        raisedPx < 0 && !continues && after instanceof HTMLElement && after.tagName === "P"
          ? overlappedLinesPx(wrapper, sheet, flowTop + raisedPx - distances.topPx)
          : null;
      if (pushed && after instanceof HTMLElement) {
        pushedLines.set(pushed.paragraph, pushed.whole ? flowTop + raisedPx + heightPx + distances.bottomPx - pushed.topPx : 0);
        roomAbove.set(after, pushed.heightPx);
      }
      writeStyles(wrapper, {
        position: "relative",
        ...(raisedPx < 0
          ? {
              top: px(raisedPx),
              height: px(Math.max(0, (continues ? table.offsetHeight : heightPx + distances.bottomPx) + raisedPx)),
            }
          : {}),
        float: "none",
        clear: "both",
        width: "max-content",
        "max-width": "none",
        // In the flow the drop collapses with the space after the block
        // above (from below which `flowTopPx` measures it): stated on top
        // of that space, it is the drop again.
        "margin-top": px(frame.dropPx > 0.5 ? frame.dropPx + previousSpaceAfterPx(wrapper) : 0),
        ...(frame.dropPx > 0.5 && !continuation ? { "--table-frame-lead": px(frame.dropPx) } : {}),
        "margin-bottom": "0px",
        ...framePadding(wrapper),
        "margin-left": px(left - geometry.marginLeftPx),
        "margin-right": px(Math.max(0, geometry.pageWidthPx - geometry.marginRightPx - left - wrapperWidth)),
      });
      writeAttribute(wrapper, FLOAT_BOTH_SIDES_ATTR, null);
      writeAttribute(wrapper, FLOAT_WRAP_DISTANCES_ATTR, null);
      placeAnchor(wrapper, frame, positioning, continues || continuation, runsPastFoot);
      continue;
    }
    if (frame.mode === "float") {
      const tableStyle = getComputedStyle(table);
      const wrapperWidth =
        (Number.parseFloat(tableStyle.marginLeft) || 0) + widthPx + (Number.parseFloat(tableStyle.marginRight) || 0);
      const drop = stackedFloatDropPx(frame, flowTop, floatsBottomPx);
      floatsBottomPx = Math.max(floatsBottomPx, frame.placement.topPx + frame.placement.heightPx + distances.bottomPx);
      const band = drop - distances.topPx;
      writeStyles(wrapper, {
        position: "relative",
        float: frame.side,
        clear: "none",
        width: "max-content",
        "max-width": "none",
        "margin-top": px(drop),
        ...(drop > 0.5 ? { "--table-frame-lead": px(drop) } : {}),
        "margin-bottom": px(distances.bottomPx),
        ...framePadding(wrapper),
        ...(frame.side === "left"
          ? { "margin-left": px(left - geometry.marginLeftPx), "margin-right": px(distances.rightPx) }
          : {
              "margin-left": px(distances.leftPx),
              "margin-right": px(geometry.pageWidthPx - geometry.marginRightPx - left - wrapperWidth),
            }),
        // The lines between the flow place and the table keep their width.
        // (Written as browsers serialise it, so an unchanged pass writes nothing.)
        "shape-outside": band > 0.5 ? `inset(${px(band)} 0px 0px)` : "none",
        "shape-margin": "0px",
      });
      writeAttribute(wrapper, FLOAT_BOTH_SIDES_ATTR, null);
      writeAttribute(wrapper, FLOAT_WRAP_DISTANCES_ATTR, null);
      placeAnchor(wrapper, frame, positioning, continues || continuation, runsPastFoot);
      continue;
    }
    writeStyles(wrapper, {
      position: "absolute",
      left: px(left),
      top: px(placement.topPx),
      float: "none",
      width: "max-content",
      "max-width": "none",
      "margin-top": "0px",
      "margin-right": "0px",
      "margin-bottom": "0px",
      "margin-left": "0px",
      ...framePadding(wrapper),
      "z-index": "1",
    });
    if (frame.mode === "both") {
      writeAttribute(wrapper, FLOAT_BOTH_SIDES_ATTR, "true");
      writeAttribute(
        wrapper,
        FLOAT_WRAP_DISTANCES_ATTR,
        JSON.stringify({ top: distances.topPx, right: distances.rightPx, bottom: distances.bottomPx, left: distances.leftPx }),
      );
      bothSides.push(wrapper);
    } else {
      writeAttribute(wrapper, FLOAT_BOTH_SIDES_ATTR, null);
      writeAttribute(wrapper, FLOAT_WRAP_DISTANCES_ATTR, null);
    }
  }
  for (const element of Array.from(sheet.querySelectorAll<HTMLElement>(`:scope > [${TABLE_FRAME_ANCHOR_ATTR}]`))) {
    if (!anchorPlaces.has(element)) element.removeAttribute(TABLE_FRAME_ANCHOR_ATTR);
  }
  for (const [anchor, place] of anchorPlaces) writeAttribute(anchor, TABLE_FRAME_ANCHOR_ATTR, place);
  for (const element of Array.from(sheet.querySelectorAll<HTMLElement>(`:scope > [${TABLE_FRAME_PUSHED_ATTR}]`))) {
    if (pushedLines.has(element)) continue;
    element.removeAttribute(TABLE_FRAME_PUSHED_ATTR);
    element.style.removeProperty(PUSHED_SHIFT_PROPERTY);
  }
  for (const [paragraph, shift] of pushedLines) {
    writeAttribute(paragraph, TABLE_FRAME_PUSHED_ATTR, "true");
    const value = px(shift);
    if (paragraph.style.getPropertyValue(PUSHED_SHIFT_PROPERTY) !== value) paragraph.style.setProperty(PUSHED_SHIFT_PROPERTY, value);
  }
  for (const element of Array.from(sheet.querySelectorAll<HTMLElement>(`:scope > [${TABLE_FRAME_ROOM_ABOVE_ATTR}]`))) {
    if (roomAbove.has(element)) continue;
    element.removeAttribute(TABLE_FRAME_ROOM_ABOVE_ATTR);
    element.style.removeProperty(ROOM_ABOVE_PROPERTY);
  }
  for (const [paragraph, room] of roomAbove) {
    writeAttribute(paragraph, TABLE_FRAME_ROOM_ABOVE_ATTR, "true");
    const value = px(room);
    if (paragraph.style.getPropertyValue(ROOM_ABOVE_PROPERTY) !== value) paragraph.style.setProperty(ROOM_ABOVE_PROPERTY, value);
  }
  return bothSides;
}
